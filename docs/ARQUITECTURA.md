# Arquitectura técnica — MVP transporte escolar

Este documento explica las decisiones detrás del código en este repo. Para
las pantallas y el contexto de negocio (TAM, piloto, precio), ver la
conversación de producto; acá sólo lo técnico.

## 1. Componentes

```
apps/conductor/         App del transportista (Expo / React Native)
apps/web-apoderado/      Web estática para el apoderado (sin instalar nada)
supabase/migrations/     Esquema, RLS, RPCs — la fuente de verdad del backend
supabase/functions/      Edge Function: cálculo de ETA
supabase/tests/          Tests de RLS y de flujo, contra Postgres real (PGlite)
```

No hay servidor propio: Supabase (Postgres + Auth + Realtime + Edge
Functions) es todo el backend. La única pieza externa es Mapbox
(Directions API), llamada sólo desde la Edge Function, nunca desde los
clientes.

## 2. Modelo de datos

Ver `supabase/migrations/0001_schema.sql` (comentado tabla por tabla). Las
decisiones que no son obvias del SQL:

- **`routes` (plantilla) vs. `trips` (instancia diaria).** Un alumno puede
  tener una dirección AM y otra PM (dos padres, por ejemplo), así que la
  parada vive en `route_stops`, no en `students`. Cada mañana, `start_trip`
  crea (o retoma) la fila de `trips` de ese día.
- **La posición GPS nunca se persiste.** No existe una tabla `positions` ni
  similar. El teléfono del conductor manda su posición a la Edge Function
  `update-eta`, que la usa una sola vez (para pedirle la ruta a Mapbox) y la
  descarta. Lo único que queda en la base es `trip_stop_eta`: segundos
  restantes por alumno, nunca coordenadas.
- **`trip_events` es la fuente de verdad de "qué pasó".** Iniciado, cerca,
  subió, no viaja, llegó, finalizado — todo es una fila en esta tabla. La
  línea de tiempo que ve el apoderado (pantallas 5/8) es una lectura
  directa de esta tabla, sin estado derivado en otro lado.

## 3. Privacidad: aplicada en la base, no en la app

La promesa del producto es "un apoderado no ve las direcciones ni los
eventos de otro alumno, ni siquiera del mismo furgón". Eso está resuelto
con Row Level Security (`0002_rls.sql`), no con filtros en el cliente — un
bug en la app, o alguien mirando las llamadas de red, no puede exponer
datos de otra familia porque Postgres nunca los devuelve.

`supabase/tests/rls.test.ts` lo verifica corriendo Postgres real (vía
[PGlite](https://pglite.dev)) y consultando **sin ningún filtro** ("dame
todas las route_stops") como cada rol lo haría — el test está en rojo si
alguna vez alguien puede ver una fila ajena, no sólo si el filtro feliz
funciona. Puntos que vale la pena mirar directamente en el SQL:

- `route_stops`: el transportista ve todas las paradas de su ruta: el
  apoderado, sólo la propia (`route_stops_guardian_select`).
- `trip_events`: el apoderado ve los eventos generales del recorrido
  (`student_id is null`) más los de su propio hijo — nunca los de un
  hermano de furgón.
- `trip_stop_eta`: la única tabla con "dónde está el furgón" (como
  segundos, nunca coordenadas), con la misma regla de una fila por hijo.

Truco de implementación: la política de `routes` no puede reutilizar la
función `is_my_route()` para su propio `INSERT` — un `WITH CHECK` no puede
releer de forma confiable una fila de la MISMA tabla que se está
insertando en ese momento. Por eso existe `is_my_vehicle()`, que valida por
`vehicle_id` en vez de volver a consultar `routes`. Quedó comentado en el
SQL porque es el tipo de detalle que alguien "arregla" mal sin el contexto.

## 4. Invitación por WhatsApp (sin instalar nada)

`0003_invites.sql`. El link `/i/<uuid>` no lleva contraseña: el uuid de la
invitación ES el token. El flujo:

1. El transportista crea la invitación (una fila en `invites`, RLS normal).
2. El apoderado abre el link. La web llama
   `supabase.auth.signInAnonymously()` — **hay que activar "Anonymous
   Sign-Ins" en el dashboard de Supabase, viene apagado por default.**
3. La web llama al RPC `redeem_invite(token, nombre)`, que es
   `SECURITY DEFINER`: crea/actualiza la fila `guardians` de esa sesión
   anónima, la liga al alumno en `student_guardians`, y devuelve sólo lo
   necesario para pintar la pantalla de ETA.

A partir de ahí, esa sesión anónima ve exactamente lo que ve cualquier
apoderado logueado — mismas políticas RLS, sin caso especial.

**Limitaciones verificadas en la documentación de Supabase, a tener en
cuenta para el piloto:**
- El sign-in anónimo tiene un rate limit por defecto de **30 solicitudes
  por hora** (ajustable en el dashboard) — para 5 furgones × 15 familias
  no debería rozarlo, pero conviene saberlo antes de escalar.
- Si el apoderado borra los datos del navegador o cambia de teléfono,
  pierde la sesión y necesita que le reenvíen el link (o abrirlo nuevo:
  `redeem_invite` es re-ejecutable, no de un solo uso).
- Supabase no borra usuarios anónimos viejos automáticamente; si el piloto
  se extiende, conviene una tarea periódica que limpie los que nunca se
  conviertieron y quedaron sin uso.
- ([Fuente: Supabase Docs — Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous))

## 5. Cálculo de ETA — `supabase/functions/update-eta`

El teléfono del conductor llama a esta Edge Function cada 15–45 segundos
mientras el recorrido está `in_progress`, mandando sólo `{ trip_id, lat,
lng }`.

1. **Autorización del transportista.** La función consulta el RPC
   `is_my_trip` con el JWT del caller antes de usar la service role key.
   Leer `trips` no basta: RLS también permite esa lectura a los apoderados.
   Después verifica que el recorrido siga `in_progress`.
2. Con la service role key (que sí bypassa RLS — a propósito: esta función
   necesita ver todas las paradas restantes del recorrido, algo que RLS le
   niega a un apoderado o a otro transportista), arma la lista de paradas
   sin `picked_up`/`skipped`/`dropped_off` todavía.
3. Le pide a la **Directions API de Mapbox** (perfil `driving-traffic`) la
   ruta: conductor → parada 1 → parada 2 → …, EN EL ORDEN en que el
   conductor ya las recorre (`route_stops.seq`). No usamos la Optimization
   API — el orden lo decide el conductor, no un solver; es más simple y
   más barato.
4. Cada `leg` de la respuesta es un tramo; el ETA de la parada *i* es la
   suma acumulada de los tramos `0..i`. `upsert` en `trip_stop_eta`.
5. Si el ETA de la próxima parada cruza el umbral (6 minutos por defecto) y
   ese alumno no tenía ya un evento `approaching`, inserta uno — es lo que,
   en producción, un trigger convertiría en push "el furgón está cerca"
   (ver §7).

**Límite verificado de Mapbox:** la Directions API acepta hasta **25
coordenadas** por request (conductor + 24 paradas), igual para
`driving-traffic` que para `driving` — sin distinción por plan gratuito o
de pago. El código lo valida explícitamente (`too_many_waypoints`) en vez
de dejar que Mapbox devuelva un 422 críptico. Un furgón escolar real nunca
debería acercarse a ese límite. ([Fuente: Mapbox Directions API
docs](https://docs.mapbox.com/api/navigation/directions/))

Toda la lógica de arriba que NO depende de la red (armar la URL, leer la
respuesta, decidir a quién avisar) está separada en `eta-logic.ts` y
testeada en `supabase/tests/eta-logic.test.ts` sin llamar a Mapbox de
verdad.

## 6. Las dos apps

### App del conductor (`apps/conductor`, Expo/React Native)

- Expo Router, pantallas: `login`, `(driver)/home` (pantalla 1: iniciar
  recorrido), `(driver)/trip` (pantalla 2: parada actual, Subió/No viaja),
  `(driver)/summary` (pantalla 3: resumen), `(driver)/compartir`
  (generar/mandar los links de invitación).
- `src/lib/tripLogic.ts` es toda la lógica de "qué parada sigue, cuánto
  llevamos" — pura, sin React Native, testeada con Vitest.
- `src/lib/backgroundLocation.ts` usa `expo-location` +
  `expo-task-manager` para mandar la posición en background mientras el
  recorrido está activo, y **nunca** para guardarla — sólo reenvía a
  `update-eta` vía `supabase.functions.invoke`.
- **Riesgo técnico real, marcado explícitamente para el spike:** GPS en
  background en iOS exige el permiso "Always" (Apple lo revisa con lupa en
  la revisión de la App Store) y un *development build* — no funciona en
  Expo Go. En Android, un foreground service con notificación persistente
  (ya configurado en `app.json`). Antes de construir más sobre esto, hay
  que probarlo con una ruta real de ~40 minutos, pantalla bloqueada,
  batería, para confirmar que el ETA no se degrada.
- Login con email + contraseña, no SMS/OTP: para 5 transportistas del
  piloto, las cuentas se crean a mano desde el dashboard de Supabase. Un
  login por teléfono es el paso natural post-piloto.

### Web del apoderado (`apps/web-apoderado`)

- Sin framework: HTML + CSS + un único módulo TypeScript compilado a un
  bundle con `esbuild` (`npm run build` → `public/app.js`). Así se
  despliega en cualquier hosting estático (Vercel, Netlify, GitHub Pages)
  sin servidor propio.
- `src/eta-view.ts`, `src/router.ts`, `src/local-students.ts`: toda la
  lógica (armar la línea de tiempo, formatear el ETA, recordar qué alumno
  ya se canjeó en este navegador) es pura y está testeada. `src/app.ts` es
  el único archivo que toca el DOM/Supabase directamente, y por eso no
  tiene test propio — mismo patrón que `backgroundLocation.ts`.
- El ETA se actualiza en vivo con **Supabase Realtime** (`postgres_changes`
  sobre `trip_stop_eta` y `trip_events`, filtrado por `student_id`): RLS
  aplica también a las suscripciones Realtime, así que aunque el cliente
  se suscriba "a todo", sólo recibe cambios de las filas que puede leer.

## 7. Lo que NO se construyó en este MVP (a propósito)

- **Web push de verdad (con la página cerrada).** Lo que hay hoy es
  `Notification.requestPermission()` — funciona sólo mientras la pestaña
  sigue abierta. Un push real, con la página cerrada, necesita: un Service
  Worker registrado, claves VAPID, guardar la suscripción push
  (`endpoint`/`p256dh`/`auth`) en una tabla nueva, y una función que la
  dispare (lo más limpio: un *database webhook* de Supabase sobre
  `trip_events`, que llame a otra Edge Function con la librería
  `web-push`). Es la pieza que falta para que el aviso "furgón cerca"
  llegue sin que el apoderado tenga la web abierta — y en iPhone, sólo
  funciona si antes agregó la página a su pantalla de inicio (limitación
  de iOS/Safari, no de este código). **Para el piloto, el respaldo
  pragmático es WhatsApp/SMS transaccional** (vía Twilio o similar) en vez
  de invertir en esta infraestructura antes de validar que alguien la usa.
- **Reenvío del "furgón cerca" por WhatsApp/SMS.** Mismo motivo: media
  antes de construir.
- Pagos, chat, calificación del conductor, optimización de ruta, múltiples
  colegios — quedan fuera según la lista original del MVP.

## 8. Cómo correr esto

Ver el `README.md` de la raíz para instalar y correr los tests. Resumen:

```bash
npm install              # dependencias de los tests (raíz)
npm test                 # 88 tests: RLS, flujo del conductor, invitaciones, ETA, web

cd apps/web-apoderado && npm install && npm run build   # bundle estático
cd apps/conductor && npm install                         # para abrir en Expo Go / build
```

Las migraciones (`supabase/migrations/*.sql`) se aplican con `supabase db
push` (Supabase CLI) contra un proyecto real; los tests las corren contra
Postgres embebido, sin necesidad de un proyecto de Supabase.

## Correcciones del ciclo de ETA

- `0006_eta_lifecycle.sql` permite al transportista borrar el ETA de su
  recorrido al finalizar. Un trigger bloquea escrituras tardías sobre
  viajes cerrados y la migración limpia ETA residuales de viajes terminados.
- La web selecciona alumno, fecha de Santiago y turno AM/PM; consulta eventos
  y ETA únicamente por el `trip_id` seleccionado y usa su estado real.
  Revalida cada 15 segundos como respaldo a Realtime.
- El viaje activo se persiste en AsyncStorage (sin coordenadas). La tarea
  GPS se registra desde el layout raíz y al retomar se reactiva la ubicación.
- La fecha/turno se comparte entre clientes mediante `shared/trip-clock.ts`.

Para aplicar estas correcciones en un entorno existente, ejecutar
`supabase db push`, desplegar nuevamente `update-eta`, publicar el bundle
web actualizado y distribuir una nueva compilación de la app del conductor.
El GPS en segundo plano aún requiere validación en un dispositivo físico.
