# PROJECT_CONTEXT.md — RutaSegura (furgon-mvp)

> **Generado por Claude** (Claude Code, asistente de Anthropic) como **análisis de solo lectura** sobre la rama `develop`.
> **✔ Verificado** = leído directamente en el código de `develop`. **≈ Inferido** = deducido por contexto, convención o documentación del repo.
> No contiene secretos ni datos personales reales. No se modificó ningún otro archivo.

---

## 1. Objetivo del producto y funcionalidades

**RutaSegura** es un MVP de **transporte escolar** ("furgón escolar") con tres piezas (✔):

- **App del conductor** (Expo / React Native): inicia y gestiona el recorrido del día, **elige la próxima parada** en cualquier orden, marca *subió / bajó / no viaja*, administra sus **alumnos**, invita apoderados y edita su **perfil** (con cerrar sesión).
- **Web del apoderado** (estática, se abre por link sin instalar): sigue el recorrido en vivo "estilo Uber" con **ETA**, estados **esperando / va hacia tu casa / sin señal**, **confirmaciones** (subió/llegó), **avisos push** con la página cerrada y aviso de **ausencia**.
- **Backend Supabase** (Postgres + RLS + RPCs + Edge Functions).

**Regla de oro del producto (✔, ver `supabase/migrations/0002_rls.sql`):** un apoderado **nunca** puede leer datos de otro alumno, ni del mismo furgón. La privacidad se aplica en la base (RLS), no en la app.

Convención de dirección (✔ `shared/rutasegura-api.ts`): **AM = ida = `to_school`**, **PM = vuelta = `to_home`**.

## 2. Arquitectura técnica actual

- **Monorepo** por carpetas (≈ sin workspaces npm formales): `apps/conductor`, `apps/web-apoderado`, `shared/`, `supabase/`, `scripts/`, `docs/`.
- **Backend (✔):** Postgres gestionado por Supabase con **RLS** por tabla, **RPCs** (`SECURITY DEFINER` para cruzar RLS con control explícito, `SECURITY INVOKER` donde la RLS ya alcanza) y **Edge Functions** en Deno. La web del apoderado usa **Realtime** (`postgres_changes`) + polling de respaldo.
- **GPS (✔):** la posición **no se historiza**. El teléfono del conductor la envía a la Edge `update-eta`, que calcula el ETA **solo al destino elegido** y guarda únicamente la **última** coordenada del recorrido (`trip_vehicle_location`), expuesta por RLS a los apoderados **solo si es fresca**.
- **Push (✔):** cola en la base (`push_deliveries`) + Edge `send-push` (VAPID), disparada por un job de `pg_cron` que llama la función solo si hay trabajo (`scripts/push/schedule.sql`).

## 3. Tecnologías y frameworks (✔ de los `package.json`)

| Componente | Stack |
|---|---|
| Conductor | Expo ~51, expo-router ~3.5, React Native 0.74.5, React 18.2, expo-location, expo-task-manager (ubicación en background), expo-sharing, AsyncStorage, `@supabase/supabase-js`, TypeScript |
| Web apoderado | TypeScript "vanilla" bundleado con **esbuild 0.24** → `public/app.js`; Leaflet (mapa, vía `window.L`); tiles CARTO (gratis) o Mapbox (token público); Service Worker + Web Push |
| Backend | Supabase (Postgres), Edge Functions **Deno** (`supabase-js` por jsr, `web-push` por npm), `pg_cron` + `pg_net` + Vault (para push) |
| Pruebas | **Vitest 2.1** + **PGlite 0.2** (Postgres embebido) para probar RLS/RPC contra un Postgres real |
| Compartido | `shared/` — `rutasegura-api.ts` (`RouteKind` AM/PM, `directionForKind`/`kindForDirection`, `TripStatus`) y `trip-clock.ts` |

## 4. Estructura de carpetas y módulos (✔)

```
apps/
  conductor/            App Expo del conductor
    app/                Rutas expo-router: index, login, (driver)/{home,trip,summary,compartir,alumnos,alumno,perfil,_layout}
    src/lib/            supabase, theme, tripApi, tripLogic(+test), backgroundLocation(+test)
    src/components/     ui.tsx (sistema de componentes)
  web-apoderado/        Web estática del apoderado
    src/                app.ts, eta-view, trip-data, push, router, invite-entry, local-students (+ tests)
    public/             index.html, app.js (bundle), styles.css, sw.js, manifest.webmanifest, _headers, config.js, íconos
    scripts/            build-config.mjs, serve-local.mjs
shared/                 rutasegura-api, trip-clock (+ tests)
supabase/
  migrations/           0001–0015
  functions/            update-eta, send-push, geocode-address
  tests/                pruebas de RLS/RPC/flujo (PGlite) + support/{db,fixtures}
  demo/                 datos-prueba.sql
scripts/                push/{generate-keys.mjs, schedule.sql}, geocode-demo-addresses.mjs, set-web-base-url.mjs
docs/                   ARQUITECTURA/ARCHITECTURE, DEPLOY, PUSH, SECURITY_REVIEW, QA_*, CHANGELOG_MVP, WORKING_AGREEMENT, maqueta-conductor/, reviews/
```

## 5. Funcionalidades: implementadas / parciales / pendientes

**Implementadas (✔ en código de `develop`):**
- Auth del conductor (email/clave) + guard de sesión (`app/(driver)/_layout.tsx`).
- Ruta del día, iniciar/finalizar recorrido, marcar subió/bajó/no viaja, resumen (`0004`, `0007`, `0010`).
- **El conductor elige la próxima parada** con destino privado + revisión (`0011_trip_target.sql`).
- ETA en vivo + mapa + **tres estados del apoderado** (esperando / va hacia tu casa / sin señal) + **confirmaciones** (`app.ts`, `eta-view.ts`).
- Invitaciones `/i/<token>` + canje anónimo (`0003`, `redeem_invite`) — ver §8 sobre el modelo *bearer token* y su caveat de privacidad.
- **Mis alumnos**: alta/edición, asignación a ruta, baja de ruta, con **bloqueo durante recorrido activo** por triggers (`0013_student_admin.sql`).
- Perfil del conductor + **cerrar sesión**; **tarjeta del conductor** para el apoderado (`guardian_trip_driver`, `0015`).
- **Web push** de cercanía con página cerrada (`0012`, `send-push`) — implementado en código.
- **Perfil ampliado del alumno + apoderado** en una transacción (`carrier_save_student_profile`, `0014`).
- Geocodificación de direcciones (Edge `geocode-address`).
- Identidad visual en `develop`: **negro cálido + amarillo** (`theme.ts`: `bg #F7F4EC`, `text/accent #1C1B17`, `yellow #FFB703`).

**Parciales (≈):**
- **Rediseño "propuesta final conductor"** (navy + menú lateral + mapa en el conductor): la **maqueta** está en `docs/maqueta-conductor/`; las **etapas 1–3** (identidad navy, cabecera + menú lateral tipo drawer sin dependencias nuevas, pantallas de alumnos/invitar/perfil/detalle, y rediseño de "Mis rutas"/"Recorrido") están implementadas en el **PR #17** (rama `codex/conductor-ui-stages-1-3`, en revisión, draft) — **aún no mergeado a `develop`**. Pendiente dentro del PR: `home.tsx` tiene el `DriverHeader` dentro del `ScrollView` (el header se desplaza; en el resto de pantallas queda fijo) + prueba visual en iPhone.
- **Despliegue del push**: el código existe, pero requiere generar VAPID, `secrets`, `schedule.sql` y prueba real; **no está confirmado** que esté aplicado/activo en el proyecto Supabase.
- **Foto del conductor**: hoy se guarda solo una **URL** (`carriers.photo_url`), no hay subida real de imagen.

**Pendientes:**
- **Mapa nativo** en la app del conductor (etapa 4); **subida de foto** a Supabase Storage (etapa 5); **prueba en iPhone** del push con página cerrada; alinear la identidad de la **web del apoderado** al navy; promoción `develop → main` (producción).

## 6. Modelo de datos y APIs existentes (✔ de `supabase/migrations/`)

**Tablas principales:** `carriers`, `guardians`, `vehicles`, `students`, `student_guardians`, `routes`, `route_stops`, `trips`, `trip_events`, `absences`, `trip_stop_eta`, `trip_vehicle_location` (0008). **Privadas (RLS revoke-all, solo por RPC):** `trip_targets` (0011), `push_subscriptions` / `push_subscription_students` / `push_deliveries` (0012), `student_profiles` (0014). Columna añadida: `carriers.photo_url` (0015).

**Enums:** `route_kind` (**AM/PM**), `trip_status` (scheduled/in_progress/finished/canceled), `trip_event_kind` (started/approaching/picked_up/skipped/dropped_off/finished).

**RPCs clave:**
- Flujo diario: `start_trip`, `record_student_event`, `finish_trip`, `mark_absence` (0004); API del conductor (0007); `driver_start_trip`/`driver_mark_stop`/`driver_finish_trip`.
- Destino elegido (0011): `driver_set_target`, `driver_get_target`, `guardian_is_next`, `persist_target_eta` (revalida estado+revisión bajo bloqueo).
- Push (0012): `register/unregister_push_subscription`, `enqueue_approaching_push` (trigger), `claim_push_deliveries`, `complete_push_delivery`, `authorize_push_delivery`.
- Alumnos (0013): `carrier_create_student`, `carrier_rename_student`, `carrier_assign_student_to_route`, `carrier_remove_student_from_route`.
- Perfil alumno/apoderado (0014): `carrier_save_student_profile`.
- Tarjeta conductor (0015): `guardian_trip_driver` (autorizada por recorrido; devuelve solo nombre/teléfono/foto).
- Invitaciones (0003): `redeem_invite(p_token, p_full_name)` — el token fija al alumno; **no devuelve dirección**; en `develop` el nombre no se valida (ver §8).

**Helpers de autorización (RLS, 0002):** `current_carrier_id`, `current_guardian_id`, `is_my_student`, `is_my_vehicle`, `is_my_route`, `is_my_trip`, `is_guardian_of_student`, `guardian_has_stop_in_route`, `guardian_has_stop_in_trip`.

**Edge Functions (✔):** `update-eta` (GPS→ETA al destino), `send-push` (VAPID, auth por `PUSH_DISPATCH_SECRET`), `geocode-address` (dirección→coords vía Mapbox).

## 7. Integraciones GPS, mapas y notificaciones

- **GPS (✔):** `expo-location` + `expo-task-manager` (background) en el conductor → `update-eta`. La posición **no se historiza**; la última coordenada se expone por RLS solo mientras es **fresca** (≈ ventana de 2 min).
- **Mapas (✔ web / pendiente conductor):** web del apoderado con **Leaflet** (`window.L`) + tiles **CARTO** (gratis) o **Mapbox** (token público `pk.`). La app del **conductor no tiene librería de mapa todavía** (hoy solo geocodifica direcciones); el mapa nativo es la etapa 4 del rediseño. Geocoding vía Mapbox en la Edge `geocode-address` (token de servidor).
- **Notificaciones (✔):** **Web Push** (VAPID), suscripción **por dispositivo y por alumno**, cola en base, revalidación de destino/revisión antes de cada envío (`authorize_push_delivery`), dedup por evento/revisión; endpoints limitados a FCM/Mozilla/Apple (anti-SSRF). En iPhone requiere "Agregar a pantalla de inicio". **No hay SMS/WhatsApp** (analizado como fase 2 opcional por costo/consentimiento).

## 8. Estado de pruebas y principales problemas técnicos

- **Pruebas (✔):** **24 archivos de test** (Vitest + PGlite, más `supabase/tests/support/{db,fixtures}.ts`) que cubren RLS/aislamiento, flujo de recorrido, seguridad del destino, push (delivery/worker/subscripción), `student-admin`, `student-profile`, `driver-card`, ETA, invitaciones. **≈ En corridas recientes la suite pasó en verde (~162 casos en `develop`).** Nota: hay sensibilidad a la **concurrencia de PGlite** — si se inicializan varios entornos en paralelo, algún archivo (p.ej. `trip-target-security.test.ts`) puede fallar en el *init* sin ejecutar casos; correr **en secuencial** da verde. Recomendado `npx vitest run` para la cifra exacta.

- **Modelo de invitación y su caveat de privacidad (✔, importante):**
  - `/i/<token>` es un **bearer token** (el `id` de la fila `invites`): **quien tiene el link** puede canjear (así se diseñó para WhatsApp). `redeem_invite` fija el alumno por el **token**; en `develop` el campo **nombre no se valida** (es solo la etiqueta del apoderado). La **dirección NO la devuelve el RPC**: la web la obtiene de `route_stops` filtrado por `student_id` (`apps/web-apoderado/src/trip-data.ts`), autorizado por la RLS `route_stops_guardian_select` → `is_guardian_of_student`.
  - **Riesgo real:** la web usa **un único usuario anónimo persistente por navegador**. Cada canje hace `insert into guardians … on conflict (user_id) do update` + acumula filas en `student_guardians`, de modo que ese identity queda **ligado a todos los alumnos** cuyos links se abrieron en ese dispositivo. La RLS entonces (correctamente) lo autoriza a leer a todos, y rutas de la UI pueden pintar al alumno equivocado: `renderEtaView(stored[0])` (fallback de caché), la ruta `?student=<id>` (push), y los **markers de Leaflet globales de módulo** (`stopMarker`/`schoolMarker`) que se crean una vez y no se resetean al cambiar de alumno.
  - **En revisión (PR #17):** `0016_guardian_invite_identity.sql` agrega *name-matching* (el nombre tecleado debe coincidir con `student_profiles.guardian_name`). **No corresponde al síntoma** (el cruce no pasa por el nombre) e introduce regresiones: `guardian_name` es **opcional** (alumnos sin él → invitación inutilizable) y el match **no normaliza acentos** (bloquea apoderados legítimos). Recomendación de la revisión: tratarlo en un **PR aparte**; el fix real es garantizar identidad por invitación + que la UI pinte siempre el alumno del token (resetear estado/markers al cambiar de alumno). El token como *bearer* sugiere, además, barreras tipo **un solo uso / caducidad corta** antes que el nombre.

- **Otros caveats conocidos:**
  - **≈ Estado del push y migraciones en Supabase remoto no confirmado.** Según la última verificación del usuario, la base remota tenía aplicadas hasta `0014`; **`0015` queda pendiente** de `supabase db push`. Sin aplicar, la tarjeta de conductor falla en vivo.
  - **Foto del conductor**: solo URL, sin subida real (Storage) ni políticas de bucket.
  - **Doble fuente de dirección/coordenadas**: `route_stops` (operación) y `student_profiles` (0014, contacto administrativo) — conviene definir cuál es la fuente maestra.
  - **Entrega push "al menos una vez"** (puede repetir); el ETA es acotado al **destino elegido**, no a toda la ruta.

## 9. Riesgos técnicos y próximos pasos recomendados

**Riesgos:**
- **Privacidad de invitaciones** (ver §8): un dispositivo puede quedar ligado a varios alumnos y la UI mostrar al equivocado. Es el riesgo más sensible por la "regla de oro". Pendiente de fix real (no name-matching).
- **Dos agentes en paralelo** (Claude y Codex) sobre los mismos archivos de la app → riesgo de conflictos. Mitigación actual: Codex implementa el rediseño del conductor; Claude revisa/coordina (PR #17).
- **Mapa en el conductor** exige una **dependencia nativa** (`react-native-maps`) o Leaflet en WebView → afecta el build y la prueba física.
- **Push en iPhone sin probar** en dispositivo real → riesgo de fiabilidad del canal principal de avisos.
- **Rediseño navy**: la identidad en `develop` hoy es **negro cálido + amarillo**; el PR #17 propone **navy + amarillo**. Al mergear, la web del apoderado queda desalineada (sigue en negro cálido) hasta un cambio aparte.
- **Ida/Vuelta vs AM/PM**: la base usa el enum `route_kind` **AM/PM**; el cambio a "Ida/Vuelta" es **solo de etiqueta**, sin tocar migraciones ni contratos (✔ así está en el PR #17).

**Próximos pasos recomendados:**
1. **Invitaciones**: arreglar la fuga real en un PR propio (identidad por invitación + UI que pinte siempre el alumno del token + reset de markers); evaluar link de un solo uso / caducidad. Sacar `0016` (name-matching) del PR #17.
2. Aplicar `0015` en Supabase (`supabase db push`) y confirmar con `supabase migration list`.
3. Cerrar el PR #17: arreglar `home.tsx` (header fijo fuera del `ScrollView`), traer `develop` a la rama, prueba visual en iPhone, y mergear.
4. Prueba en iPhone del push con página cerrada (AM/PM, dos alumnos, baja de uno) y aislamiento entre apoderados.
5. Etapas 4–5 del conductor: mapa nativo y cámara/foto a Storage; luego alinear la web del apoderado al navy.
6. Definir fuente maestra de dirección/coordenadas (`route_stops` vs `student_profiles`).
7. Promoción `develop → main` (producción) cuando la prueba en dispositivo esté OK.

---

*Documento generado por **Claude** (asistente de Anthropic, vía Claude Code) como análisis de solo lectura de `develop`. ✔ Verificado = leído en el repositorio; ≈ Inferido = deducido por contexto o convención. Sin secretos ni datos personales. Fecha de análisis: 2026-10-26.*
