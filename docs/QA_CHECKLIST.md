# QA de cambios

Estado inicial: no ejecutado como parte de la creación de este marco.

Registrar por control: resultado (PASS / FAIL / PENDIENTE / NO APLICA), evidencia, fecha, entorno y responsable. NO APLICA requiere justificación. El autor puede ejecutar pruebas; el revisor independiente debe registrar su propia revisión.

## Automatización

- [ ] `npm test` desde la raíz: registrar resultado real, sin depender del número de tests del README.
- [ ] `npm run build` desde `apps/web-apoderado`: verificar que genera el bundle y configuración esperados.
- [ ] Revisar el diff generado y asegurar que no incorpora secretos ni cambios ajenos.
- [ ] Para cambios móviles, compilar la plataforma afectada y registrar dispositivo/versión.

## Flujos funcionales

- [ ] AM: iniciar, seleccionar alumno, Subió/No viaja, estado y cierre; verificar que no se mezcla con PM.
- [ ] PM: iniciar, Bajó/No viaja según flujo, estado y cierre; verificar que no se mezcla con AM.
- [ ] Invitación: abrir enlace en sesión nueva, canjear, recargar y verificar estados inválido/vencido y comportamiento de reutilización documentado.
- [ ] Mapa y ETA: ubicación fresca, ubicación vencida, falta de GPS/red, fallback y recorrido finalizado.
- [ ] Conductor: sólo opera viajes propios; apoderado: sólo ve alumnos vinculados, incluso manipulando IDs.
- [ ] Realtime y recarga: misma información; no reaparecen ETA o posiciones luego del cierre.
- [ ] UX: mensajes claros en español, carga, vacío y errores recuperables.
- [ ] Si cambia GPS: prueba física con pantalla bloqueada y recorrido representativo; registrar permisos, duración y resultado.

## Publicación

- [ ] Completar revisión de seguridad aplicable antes del despliegue.
- [ ] Verificar URL HTTPS estable, acceso directo a `/i/<token>`, assets, configuración pública y enlaces compartidos por conductor.
- [ ] Repetir humo AM/PM con datos de prueba en el entorno publicado; registrar versión, URL sin tokens y resultado.

## Registro por cambio

- Cambio / rama / commit / PR:
- Criterios de aceptación:
- Autor / revisor independiente:
- Entorno / fecha:
- Comandos y resultados:
- Pruebas manuales y evidencia sin datos personales:
- Controles no aplicables y motivo:
- Riesgos / pendientes / responsable:
- Reversión (código, datos y configuración):
- Decisión: PENDIENTE / APROBADO / RECHAZADO.

Para cambios sólo documentales, revisar enlaces, coherencia y diff; justificar como no aplicables build y recorridos. Para cambios funcionales ejecutar la suite y el build web, más los flujos afectados. Antes de una entrega pública completar el humo de publicación.
