# Control de publicación del MVP

La web se compila desde `apps/web-apoderado` con `npm ci` y `npm run build`; el resultado está en `public/`. El README describe la configuración de cliente y los pasos de backend y app móvil.

Antes de publicar, completar [QA_CHECKLIST.md](QA_CHECKLIST.md) y los controles aplicables de [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Confirmar proyecto, entorno y versión antes de modificar servicios remotos.

- Usar una URL HTTPS estable y verificar que el acceso directo a `/i/<token>` sirve la aplicación.
- Configurar sólo claves públicas en el frontend; los secretos permanecen en backend.
- Probar invitación, mapa, ETA y flujos AM/PM después del despliegue con datos ficticios.
- Registrar commit, entorno, resultados y reversión en el PR o historial.
- Para cambios del backend, aplicar las migraciones nuevas y desplegar las Edge Functions afectadas conforme al README; no asumir que revertir código revierte datos.

El workflow de CI únicamente ejecuta tests y build: no despliega, no conecta con Supabase de producción y no instala builds móviles. El hosting de producción y su configuración efectiva deben verificarse antes de publicar.
