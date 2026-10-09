# Revisión de seguridad del MVP

Estado: checklist y formato definidos; auditoría independiente NO ejecutada. Este documento no certifica la seguridad del producto.

## Alcance de la revisión

Usar entorno de prueba autorizado, cuentas sintéticas de dos conductores y dos familias, y datos ficticios de alumnos. Revisar peticiones directas a API, no sólo lo que permite la interfaz. No ejecutar pruebas destructivas sobre producción.

## Controles

- [ ] Inventariar tablas expuestas y verificar RLS y políticas SELECT/INSERT/UPDATE/DELETE por rol (anónimo, apoderado, conductor).
- [ ] Apoderado A no accede a paradas, eventos ni ETA del alumno B, incluso compartiendo furgón. Verificar relaciones legítimas de más de un hijo.
- [ ] Conductor A no inicia, marca, modifica ni finaliza viajes del conductor B, ni publica ubicación o ETA para ellos.
- [ ] Revisar RPC `SECURITY DEFINER`: ownership, validación de argumentos, `search_path`, grants y ausencia de escalamiento por IDs manipulados.
- [ ] Revisar invitaciones: tokens inválidos/vencidos, canje y reutilización según contrato, alumno asociado y exposición del token en logs/URL de terceros.
- [ ] Revisar JWT y autorización efectiva en cada Edge Function; comprobar que un header presente no basta para autorizar.
- [ ] Verificar service role y secretos ausentes de código cliente, bundles, configuración pública, historial y logs. Documentar sólo ubicación del hallazgo, nunca copiar el secreto.
- [ ] Revisar claves públicas Supabase, scopes/restricciones de Mapbox y secretos del servidor en hosting/Supabase.
- [ ] Verificar Realtime, grants y comportamiento de usuarios anónimos con peticiones adversas.
- [ ] Verificar eliminación de ubicación al cierre, caducidad de lecturas y rechazo de actualizaciones tardías.
- [ ] Revisar mensajes de error, logs, capturas e informes para evitar exposición de datos de menores.
- [ ] Revisar dependencias y configuración publicada; registrar límites de la inspección.

## Informe independiente

- Fecha / entorno / commit:
- Autor del cambio / revisor independiente:
- Alcance inspeccionado y controles no ejecutados:
- Evidencia anonimizada y resultados:

| ID | Severidad | Hallazgo y reproducción | Impacto | Corrección / responsable | Estado / nueva prueba |
| --- | --- | --- | --- | --- | --- |
| — | — | Sin hallazgos registrados; auditoría pendiente | — | — | PENDIENTE |

Alto: acceso entre familias/transportistas, exposición de credenciales privilegiadas o modificación no autorizada. Bloquea publicación hasta corregir y verificar.
Medio: debilidad con explotación condicionada o impacto limitado; requiere decisión explícita y seguimiento.
Bajo: mejora de defensa o exposición menor; registrar prioridad y responsable.

Si se detecta un secreto, revocarlo/rotarlo en el proveedor y revisar exposición; borrarlo del último archivo no basta. Definir acciones según evidencia y autorización del entorno.

Repetir revisión ante cambios de RLS, RPC, Auth, invitaciones, datos expuestos o infraestructura, y antes del primer piloto con datos reales.
