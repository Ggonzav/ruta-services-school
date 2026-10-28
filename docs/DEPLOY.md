# Deploy de la web del apoderado

La web del apoderado es estática y vive en `apps/web-apoderado/public`. No debe exponerse con `cloudflared tunnel --url` para pruebas con apoderados reales: esos quick tunnels son temporales, cambian de URL y pueden quedar como `Tunnel not found`.

## Opción rápida: Cloudflare Pages por CLI

Desde la raíz del repo:

```bash
cd apps/web-apoderado
npm run build
npx wrangler pages deploy public --project-name rutasegura
```

Cloudflare entregará una URL HTTPS permanente del tipo:

```text
https://rutasegura.pages.dev
```

Si el nombre `rutasegura` ya existe en tu cuenta, usa otro nombre de proyecto, por ejemplo:

```bash
npx wrangler pages deploy public --project-name rutasegura-mvp
```

## Opción recomendada: conectar GitHub

En Cloudflare Pages, Vercel o Netlify conecta el repo `Ggonzav/ruta-services-school` con estos valores:

```text
Root directory: apps/web-apoderado
Build command: npm run build
Output directory: public
Environment variables: MAPBOX_PUBLIC_TOKEN=pk...
```

La ruta `/i/<token>` debe servir `index.html` porque `app.js` lee el token desde `window.location.pathname`.

Este repo ya trae las reglas necesarias:

- Cloudflare/Netlify: `apps/web-apoderado/public/_redirects`
- Vercel: `apps/web-apoderado/vercel.json`

## Configuración pública

`apps/web-apoderado/public/config.js` está versionado para el MVP. Contiene sólo claves públicas de cliente:

- `supabaseUrl`
- `supabaseAnonKey`

`mapboxPublicToken` no se versiona porque GitHub lo detecta como secreto de Mapbox. Para usar Mapbox tiles/directions en producción, define esta variable de entorno en el hosting antes del build:

```text
MAPBOX_PUBLIC_TOKEN=pk...
```

El build ejecuta `scripts/build-config.mjs` y genera `public/config.js` con `mapboxPublicToken` sólo en el ambiente publicado. `build-config.mjs` sólo acepta un token **público** (`pk.`); nunca el `MAPBOX_ACCESS_TOKEN` del servidor. También puedes definir `SUPABASE_URL` y `SUPABASE_ANON_KEY`, aunque para el MVP ya tienen defaults del proyecto actual.

Sin Mapbox, la web usa mapa base libre y línea recta como fallback.

La app del conductor usa una variable independiente porque Expo incorpora el
valor al bundle móvil:

```text
EXPO_PUBLIC_MAPBOX_TOKEN=pk...
```

Configúrala en `apps/conductor/.env.local` para desarrollo o como variable
plaintext del entorno EAS para builds. Debe ser un token público separado para
la app, con el alcance mínimo `styles:tiles`. No uses el token secreto del
backend. Las restricciones por URL requieren `Referer` y no son compatibles con
clientes móviles; un token restringido sólo a `rutasegura.pages.dev` devolverá
403 desde el WebView. Controla el uso y rota este token por separado.

Sin token válido, o si Mapbox falla, el conductor cambia a los tiles estándar
de OpenStreetMap. Este respaldo es best-effort, sin SLA, y no debe usarse para
descarga offline ni precarga. El WebView conserva caché, atribución visible y
una identificación estable de RutaSegura.

La seguridad de datos no depende de esconder el anon key. Depende de RLS y de las RPC/Edge Functions que validan ownership.

## Actualizar la app conductor

Cuando tengas la URL pública definitiva, actualiza los links que comparte el conductor:

```bash
cd ~/Downloads/furgon-mvp
node scripts/set-web-base-url.mjs https://TU-SITIO.pages.dev
```

Luego recompila/reinstala la app conductor desde Xcode para que tome el nuevo `webBaseUrl`.

Al cambiar `EXPO_PUBLIC_MAPBOX_TOKEN`, reinicia Metro y realiza una recarga
completa del dev build para que Expo incorpore el nuevo valor.

No dejes `webBaseUrl` apuntando a `localhost` ni a `trycloudflare.com` para una demo con apoderados.

## Control de publicación del MVP

Antes de publicar, completar [QA_CHECKLIST.md](QA_CHECKLIST.md) y los controles aplicables de [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Confirmar proyecto, entorno y versión antes de modificar servicios remotos.

- Usar una URL HTTPS estable y verificar que el acceso directo a `/i/<token>` sirve la aplicación.
- Configurar sólo claves públicas en el frontend; los secretos permanecen en backend.
- Probar invitación, mapa, ETA y flujos AM/PM después del despliegue con datos ficticios.
- Registrar commit, entorno, resultados y reversión en el PR o historial.
- Para cambios del backend, aplicar las migraciones nuevas y desplegar las Edge Functions afectadas conforme al README; no asumir que revertir código revierte datos.

El workflow de CI únicamente ejecuta tests y build: no despliega, no conecta con Supabase de producción y no instala builds móviles. El hosting de producción y su configuración efectiva deben verificarse antes de publicar.

## Avisos push

Ver [PUSH.md](PUSH.md) para claves VAPID, migración 0012, función send-push, job de envío y prueba con página cerrada. VAPID_PUBLIC_KEY se incluye al compilar; VAPID_PRIVATE_KEY y PUSH_DISPATCH_SECRET sólo en backend.
