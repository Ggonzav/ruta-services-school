# Avisos de cercanía con la página cerrada

Alcance autorizado por el usuario el 2026-10-09. El GPS del conductor crea el evento approaching a 500 m o menos de la parada. Un trigger encola entregas a dispositivos que activaron avisos para ese alumno. Un job de Supabase revisa la cola cada 10 segundos y llama send-push sólo si hay trabajo.

## Activación para familias

Abrir y canjear la invitación del alumno. En Android usar Chrome y pulsar Activar avisos. En iPhone/iPad (iOS 16.4+), agregar RutaSegura a la pantalla de inicio, abrir desde el icono y activar allí. El navegador solicita el permiso. La pantalla confirma sólo después de guardar la suscripción en Supabase. Si la app instalada no conserva la sesión, hay que abrir/canjear la invitación dentro de ese contexto.

Se requiere internet y permisos del sistema; modo concentración, ahorro de batería o revocación del permiso pueden demorar o impedir la recepción. El conductor debe seguir enviando GPS. No es SMS ni garantiza entrega inmediata. Se soportan endpoints de Chrome/FCM, Firefox/Mozilla y Safari/Apple; otros proveedores se rechazan explícitamente.

Un mismo dispositivo puede activar avisos para varios alumnos autorizados. Desactivar avisos elimina sólo el vínculo del alumno seleccionado. Al tocar un aviso se abre /?student=UUID, cuya lectura se autoriza por RLS. No se incluyen tokens de invitación, nombres ni direcciones en el aviso.

## Operación y seguridad

- Migración 0012: tablas privadas sin acceso directo para anon/authenticated; RPC registra sólo alumnos vinculados al usuario autenticado. Máximo 10 dispositivos por apoderado.
- Endpoint push limitado a proveedores conocidos; HTTPS, cifrado web-push/VAPID y redirects bloqueados. Secretos privados nunca en config.js.
- Cada evento/dispositivo/revisión del destino tiene una entrega única en cola. Lease de 2 min y 20 entregas por invocación; 5 intentos máximo y caducidad de 5 min. Guarda la revisión del destino de `0011` al encolar. Revalida alumno seleccionado, revisión, vínculo familiar, recorrido y parada al reclamar y mediante `authorize_push_delivery` inmediatamente antes de cada petición al proveedor. Si la consulta falla, no envía y reintenta; si ya no es válido, descarta. Cambiar A → B → A no revive el aviso antiguo.
- HTTP 404/410 elimina la suscripción vencida; 429/red/5xx reintentan. Otros 4xx se descartan. Un 2xx significa aceptación del proveedor, no lectura ni recepción confirmada en teléfono.
- Entrega al menos una vez: un fallo entre enviar y confirmar puede repetir. El tag por evento reemplaza notificaciones de ese evento cuando el navegador lo admite.
- Cron no llama la Edge Function con cola vacía. Limpieza diaria elimina registros de entrega de más de 7 días.

## Despliegue

1. Verificar tests, build y revisión independiente. Aplicar migraciones pendientes con `npx supabase db push` (0010 y 0011 también deben estar aplicadas; 0011 se conserva sin cambios).
2. Una sola vez: `node scripts/push/generate-keys.mjs`. Guarda `.env.push.local` ignorado por Git con permisos 0600. Respaldar en gestor de secretos; no rotar inadvertidamente.
3. `npx supabase secrets set --env-file .env.push.local`.
4. `npx supabase functions deploy send-push`. `supabase/config.toml` desactiva JWT de usuario sólo para esta función: la función exige PUSH_DISPATCH_SECRET. No invocarla desde el navegador.
5. Guardar en Vault `rutasegura_push_url` (URL del proyecto Supabase) y `rutasegura_push_dispatch` (mismo PUSH_DISPATCH_SECRET). Ejecutar `scripts/push/schedule.sql` usando pg_cron 1.6+ y pg_net. No guardar valores privados en SQL versionado.
6. Compilar web con VAPID_PUBLIC_KEY y el MAPBOX_PUBLIC_TOKEN existente. Sólo VAPID_PUBLIC_KEY se incluye en config.js. Publicar todo public/, incluyendo sw.js, manifest.webmanifest, iconos y _headers.
7. Comprobar que sw.js se sirve como JavaScript y manifest como JSON, config tiene VAPID pública y conserva Mapbox; que cron esté activo y send-push sin autorización devuelva 401.
8. Prueba manual: activar, cerrar página, acercar GPS a la parada de prueba, confirmar recepción y que el aviso abra el alumno correcto. Repetir AM/PM, dos alumnos y baja de uno. No declarar esta prueba aprobada sin recepción real.

## Reversión

Desactivar el job `rutasegura-push` desde Supabase Cron y despublicar la UI de activación. No borrar ni regenerar VAPID al revertir el frontend. Conservar tablas para diagnóstico o retirar por una migración posterior revisada. Las suscripciones existentes no envían nada sin job; el GPS y ETA siguen funcionando.

Fuentes: https://developer.mozilla.org/en-US/docs/Web/API/Push_API ; https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ; https://supabase.com/docs/guides/functions/schedule-functions

## Límites de la revalidación del destino

La comprobación ocurre justo antes de la petición HTTP. Un cambio posterior, cuando el proveedor ya recibió el aviso o la petición está en curso, no puede retirar esa notificación. No se promete atomicidad entre Postgres y el proveedor externo.

Se conserva un evento `approaching` por alumno y recorrido. Tras cambiar de destino y volver, solo un nuevo cálculo de ETA autorizado y cercano puede encolar un aviso para la nueva revisión. Seleccionar al alumno no revive la entrega anterior; varios ticks de la misma revisión se deduplican. La implementación reemplaza `persist_target_eta` en 0012, sin editar la migración 0011 ya aplicada.

Estado local: integración preparada sin activar servicios remotos. Recepción con página cerrada y humo HTTPS pendientes.
