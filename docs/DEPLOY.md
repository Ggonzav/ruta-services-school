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

El build ejecuta `scripts/build-config.mjs` y genera `public/config.js` con `mapboxPublicToken` sólo en el ambiente publicado. También puedes definir `SUPABASE_URL` y `SUPABASE_ANON_KEY`, aunque para el MVP ya tienen defaults del proyecto actual.

Sin Mapbox, la web usa mapa base libre y línea recta como fallback.

La seguridad de datos no depende de esconder el anon key. Depende de RLS y de las RPC/Edge Functions que validan ownership.

## Actualizar la app conductor

Cuando tengas la URL pública definitiva, actualiza los links que comparte el conductor:

```bash
cd ~/Downloads/furgon-mvp
node scripts/set-web-base-url.mjs https://TU-SITIO.pages.dev
```

Luego recompila/reinstala la app conductor desde Xcode para que tome el nuevo `webBaseUrl`.

No dejes `webBaseUrl` apuntando a `localhost` ni a `trycloudflare.com` para una demo con apoderados.
