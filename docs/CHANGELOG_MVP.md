# Historial del MVP

Registrar cambios comprobables. No reconstruir entregas históricas sin evidencia.

## 2026-10-04 — Marco de trabajo

- Se define alcance, arquitectura de referencia, QA, seguridad y revisión de cambios.
- Se agregan instrucciones para agentes y plantilla de pull request.
- Validación: revisión documental y `git diff --check`; ver resultado informado en la tarea.
- Sin cambios funcionales ni despliegues. QA funcional y auditoría independiente pendientes.
- Pendiente: configurar CI/protecciones remotas y asignar revisores antes de la siguiente entrega.
- Reversión: revertir exclusivamente los cambios documentales de esta entrega.

## 2026-10-07 — CI para pull requests

- Workflow `.github/workflows/ci.yml`: checks `Tests` y `Web build` para PRs a develop/main y pushes a esas ramas. Node 22, npm ci, permisos de sólo lectura y timeout de 10 minutos.
- Verificación local: 91 tests en 13 archivos aprobados sobre develop; build web aprobado. La verificación anterior de 92 tests incluía cambios de otra rama.
- Los archivos públicos generados se restauraron tras la verificación.
- La primera ejecución en GitHub detectó que faltaba instalar Expo para resolver el tsconfig de los tests del conductor. Se agregó npm ci en apps/conductor.
- GitHub Actions: Tests y Web build aprobados en la ejecución 37860530844 tras instalar dependencias del conductor.
- PR #5 abierto contra develop. La revisión independiente y el merge siguen pendientes.
- Reversión: revertir el workflow; coordinar los checks obligatorios para no bloquear PRs si se retira.

## Plantilla para próximas entradas

- Fecha / PR / commit / entorno:
- Problema y comportamiento resultante:
- Pruebas ejecutadas y evidencia:
- Revisión independiente:
- Riesgos y pendientes:
- Migraciones/configuración afectadas:
- Reversión: pasos concretos; no asumir que revertir código revierte datos.

## 2026-10-08 — Controles activados en GitHub

- Protecciones activadas en main y develop: PR, una aprobación independiente, invalidación de aprobaciones al añadir cambios, conversaciones resueltas, rama actualizada y checks Tests/Web build de GitHub Actions. Incluye administradores; force push y borrado deshabilitados.
- El workflow fue verificado en el PR #5. Falta revisión y merge para incorporarlo a develop y posteriormente a main. No se desplegó la aplicación.

## 2026-10-09 — Alumno correspondiente a cada invitación

- Se elimina el atajo que mostraba el último alumno guardado al abrir cualquier invitación con sesión activa. Cada enlace pasa por el formulario y redeem_invite; sólo la respuesta del servidor determina el alumno.
- Pruebas: 97 tests aprobados, incluidos dos casos de enlaces distintos con Benjamín recordado y rechazo de invitación vencida; build web y git diff --check aprobados.
- Configuración local de Mapbox conservada; no se incluye en el commit.
- Pendiente: revisión independiente y comprobación manual de dos invitaciones válidas en el mismo navegador tras publicar. No cambia RLS ni RPC ni requiere migración.
- Reversión: revertir este cambio y regenerar el bundle; restauraría el defecto conocido.

## 2026-10-09 — Numeración de push (pendiente de integrar)

- Push local renumerado de `0011_web_push.sql` a `0012_web_push.sql` para reservar `0011` al destino del conductor del PR #7.
- Verificación con `supabase migration list --linked`: remotas aplicadas `0001`–`0009`; `0010` y `0011` no aplicadas. No se modificó Supabase ni se hicieron merges.
- Integración y pruebas conjuntas con los PRs #7 y #8 pendientes; esta renumeración no certifica compatibilidad funcional.

## 2026-10-17 — Integración local push + próxima parada

- Rama `codex/web-push-alerts`: incorporada la base funcional de PR7/8 (`f93abbe`) a los cambios push pendientes, sin merges ni publicación. El worktree `codex/pr8-review` y sus mejoras GPS locales permanecen separados e intactos.
- `0011_trip_target.sql` conservada exactamente como en PR8; `0012_web_push.sql` aún no aplicada añade revisión del destino a la cola y RPC privada para revalidar antes del envío.
- Descarta avisos por cambio de alumno/revisión (también A → B → A), autorización revocada, parada completada o viaje cerrado. Error de consulta: no envía, reintenta.
- QA local del autor: 128/128 tests aprobados; build web aprobado conservando el config.js local existente. Revisión independiente en curso; no se certifica recepción real.
- Usuario da por validada la prueba funcional previa. Acceso iPhone a servidor LAN no comprobado; no se registra como PASS. Push físico, humo HTTPS y GPS sostenido siguen pendientes.
- Límites: un aviso en tránsito no puede retirarse del proveedor; un evento approaching por alumno/viaje; un nuevo cálculo cercano permite un aviso por nueva revisión de destino. Ver PUSH.md.

## 2026-10-18 — Verificación de integración push

- QA final local del autor: `npm test`, 21 archivos / 129 tests aprobados. Incluye retorno A → B → A: nuevo ETA cercano permite un aviso para nueva revisión; ETA antiguo o lejano no envía y ticks repetidos no duplican.
- Migración 0011 comparada byte a byte con `f93abbe`: idéntica. `git diff --check` sin errores. Build web y TypeScript web/conductor aprobados el turno anterior; posteriores cambios limitados a SQL, tests y documentación.
- Captura aportada por el usuario: conductor con “Ubicación recibida”, progreso 1/2, Martina pendiente. Evidencia puntual de recepción, no de GPS continuo en segundo plano ni de entrega push.
- Segunda revisión independiente solicitada para la corrección P2; pendiente de resultado al escribir esta entrada. Sin publicación, merge ni cambios remotos.

- Revisión independiente final: P2 aprobado por `/root/push_target_integration_review`, 28/28 tests enfocados. Sin nuevos bloqueantes en delta; proveedor/recepción real pendientes. Evidencia: `docs/reviews/PUSH-TARGET-INTEGRATION.md`.


## 2026-10-14 — Primera ubicación, reintentos y web local (codex/pr8-review)

- El conductor captura al iniciar/reanudar. Confirma “Ubicación recibida” sólo con `ok: true` de la Edge; errores o posición vencida retiran la confirmación. Reintentos con captura fresca en primer plano y mediante eventos nativos en segundo plano, sin garantizar intervalos de iOS suspendido.
- Timeouts y protección contra envíos concurrentes/respuestas de viajes anteriores. Sin cambios de RLS, contratos RPC, Edge ni push.
- `npm run local` de web genera y sirve un build aislado en `dist/local`, conservando la configuración pública de Mapbox desde un archivo local sin imprimir valores ni modificarlo.
- Evidencia: 111/111 tests, typechecks conductor/web y build web con Mapbox aprobados; rutas locales y assets devuelven HTTP 200. Procedimiento y limitaciones en [QA_GPS_WEB_LOCAL.md](QA_GPS_WEB_LOCAL.md).
- Pendientes: build iOS, validación física con dos apoderados y revisión independiente. No se hizo merge, despliegue ni reinicio de datos.
- Reversión: revertir estos cambios del cliente y reconstruir; detener servidor local. No hay cambios remotos que revertir.

## 2026-10-19 — Respaldo integrado para revisión

- Rama `codex/mvp-integration`: reúne próxima parada de PR7/8, push pendiente y GPS/servidor local del worktree `codex/pr8-review`. No reemplaza todavía develop/main ni cierra los PR anteriores.
- QA del autor: 137/137 tests; build web, TypeScript web/conductor y diff-check aprobados. Configuración local conservada y excluida del commit; .env y secretos ignorados.
- Entrega en borrador: pendiente recepción push real, GPS sostenido con pantalla bloqueada y humo del entorno público. No se ejecutaron despliegues ni cambios remotos de configuración/datos.
- Siguiente alcance autorizado: pantalla Mis alumnos (agregar, editar y asignar rutas), aún sin implementar en este respaldo.

## 2026-10-19 — Migraciones para prueba de Mis alumnos

- Con autorización explícita del usuario, aplicadas `0012_web_push.sql` y `0013_student_admin.sql` al proyecto `jfjysvvrpjemcdkqutmw` desde `feature/mis-alumnos`.
- Dry-run confirmó exclusivamente ambas migraciones; `supabase db push --yes` terminó correctamente y reportó aplicación de las dos. No se ejecutaron seeds ni resets.
- No se desplegó send-push, no se configuraron cron/VAPID y no se publicó la web. Aplicar 0012 no certifica envío de notificaciones.
- Prueba funcional de Mis alumnos en iPhone pendiente. Servidor de desarrollo preparado en puerto 8082.

## 2026-10-19 — Dirección común y contacto del apoderado

- Formulario de alumno con una dirección y casillas independientes Ida/Regreso; editar dirección invalida coordenadas anteriores. Guardado transaccional de alumno, contacto y asignaciones mediante nueva 0014 (0013 aplicada intacta). Desmarcar ambos conserva ficha/dirección sin rutas.
- Nombre y teléfono de contacto obligatorios. Tabla privada student_profiles con RLS para transportista dueño; no crea sesión/cuenta ni otorga acceso al apoderado. Invitación sigue separada. Lista distingue contacto pendiente y acceso activado.
- QA autor: 153/153 tests, incluyendo aislamiento y rollback al fallar segundo trayecto; TypeScript conductor aprobado antes del ajuste final de protección de geocodificación. Migración 0014 aún no aplicada; validación de interfaz en teléfono pendiente.

- Revisión independiente `/root/push_target_integration_review`: 3/3 tests perfil aprobados, sin bloqueantes; resultado tardío de geocodificación corregido con versión de dirección (verificado por inspección, no test UI). TypeScript final y build web aprobados. Pendiente prueba iPhone y aplicación autorizada de0014.

- Operación autorizada: aplicada `0014_student_profile.sql` a `jfjysvvrpjemcdkqutmw`. Dry-run incluyó únicamente 0014; db push completó correctamente. Sin seeds, reset, merge ni publicación web. Prueba del formulario en iPhone pendiente.

## 2026-10-24 — App conductor: identidad y navegación (en revisión)

- Rama `codex/conductor-ui-stages-1-3`: la app del conductor adopta cabecera navy con pin amarillo y furgón, y muestra Ida/Vuelta manteniendo AM/PM como contrato interno.
- Se agrega un menú lateral propio, sin dependencias nuevas, con acceso a rutas, alumnos, invitaciones, perfil, ayuda, cierre de sesión y retorno al recorrido activo.
- Mis alumnos incorpora dirección y contacto guardado, más una pantalla de detalle antes de editar o compartir la invitación. Invitaciones y perfil usan la misma cabecera y componentes visuales.
- Sin migraciones, cambios de RLS/RPC, mapa nativo, cámara, publicación ni cambios en la web del apoderado. La configuración local de `public/config.js` permanece fuera del alcance.
- QA del autor: 162/162 tests, TypeScript conductor y export del bundle iOS aprobados. Prueba física y revisión independiente pendientes.
- Reversión: revertir el commit de interfaz; no hay datos ni configuración remota que revertir.

## 2026-10-25 — Validación de identidad al canjear invitaciones (en revisión)

- `redeem_invite` valida que el nombre ingresado coincida con el apoderado registrado para el alumno del token, ignorando mayúsculas y espacios repetidos.
- Un nombre incorrecto o un alumno sin identidad configurada no crea `guardians`, no concede acceso y no revela el nombre esperado.
- La web muestra mensajes específicos para nombre incorrecto y contacto aún no configurado.
- QA del autor: 163/163 pruebas aprobadas, incluidos canje normalizado y rechazo sin crear acceso; TypeScript web/conductor, bundle web y `git diff --check` aprobados.
- Requiere aplicar `0016_guardian_invite_identity.sql`; pendientes revisión independiente, prueba física y despliegue.
