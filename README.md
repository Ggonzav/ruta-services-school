# Furgón — MVP transporte escolar

MVP para validar una hipótesis de negocio concreta: *el transportista paga
mensualmente por una solución que le permite a los apoderados saber dónde
está el furgón y cuándo llega*. Todo lo que no ayuda a probar eso quedó
fuera a propósito (ver `docs/ARQUITECTURA.md` §7).

**Empieza por `docs/ARQUITECTURA.md`** — ahí está el porqué de cada
decisión. Este README es sólo "cómo lo corro".

## Estructura

```
supabase/migrations/     Esquema + RLS + RPCs (Postgres/Supabase)
supabase/functions/      Edge Function: cálculo de ETA (Deno)
supabase/tests/          Tests contra Postgres real (PGlite) — RLS, flujo, ETA
apps/conductor/          App del transportista (Expo / React Native)
apps/web-apoderado/      Web estática para el apoderado (link de WhatsApp)
docs/ARQUITECTURA.md     El documento que explica las decisiones
```

## Correr los tests (lo primero, no necesita ningún proyecto de Supabase)

```bash
npm install
npm test
```

Esto corre 88 tests contra un Postgres real embebido (PGlite), aplicando
las migraciones tal cual se aplicarían en producción:

- `supabase/tests/rls.test.ts` — un apoderado nunca ve la parada, el
  evento o el ETA de otro alumno, ni siquiera del mismo furgón.
- `supabase/tests/trip-flow.test.ts` — iniciar/cerrar un recorrido, marcar
  subió/no viaja, aislamiento entre transportistas.
- `supabase/tests/invites.test.ts` — el link de invitación, tokens
  vencidos, sesión anónima.
- `supabase/tests/eta-logic.test.ts` — el cálculo de ETA a partir de la
  respuesta de Mapbox (sin llamar a Mapbox de verdad).
- `apps/conductor/src/lib/tripLogic.test.ts` — la lógica de "qué parada
  sigue" de la app del conductor.
- `apps/web-apoderado/src/*.test.ts` — la línea de tiempo, el formateo del
  ETA y el router de la web del apoderado.

## Desplegar el backend

Necesitas un proyecto de [Supabase](https://supabase.com) (el free tier
alcanza para el piloto).

```bash
npx supabase login
npx supabase link --project-ref TU-PROYECTO
npx supabase db push                          # aplica supabase/migrations/*.sql
npx supabase functions deploy update-eta
npx supabase secrets set MAPBOX_ACCESS_TOKEN=pk.xxxxx
```

Antes de probar la invitación por WhatsApp, activa **Authentication →
Providers → Anonymous Sign-Ins** en el dashboard (viene apagado por
default).

## Correr la app del conductor

```bash
cd apps/conductor
npm install
# Completa expo.extra.supabaseUrl / supabaseAnonKey / webBaseUrl en app.json
npx expo start
```

El GPS en background no funciona en Expo Go: para probarlo de verdad hace
falta un *development build* (`npx expo run:ios` / `npx expo run:android`,
o EAS Build). Ver `docs/ARQUITECTURA.md` §6 sobre el spike de GPS.

## Correr la web del apoderado

```bash
cd apps/web-apoderado
npm install
cp public/config.example.js public/config.js   # completa con tu proyecto Supabase
npm run build                                    # compila src/app.ts -> public/app.js
npm run serve                                    # sirve public/ en localhost
```

Para desplegar, `public/` es un sitio estático (Vercel, Netlify, GitHub
Pages). Ya incluye `vercel.json` y `public/_redirects` para que
`/i/<token>` sirva `index.html` en ambos.

## Marco de trabajo

Antes de cambiar el MVP, leer [WORKING_AGREEMENT](docs/WORKING_AGREEMENT.md).
Consultar [contrato de arquitectura](docs/ARCHITECTURE.md), [QA](docs/QA_CHECKLIST.md),
[revisión de seguridad](docs/SECURITY_REVIEW.md) e [historial](docs/CHANGELOG_MVP.md).
Las instrucciones para agentes están en `AGENTS.md`.
