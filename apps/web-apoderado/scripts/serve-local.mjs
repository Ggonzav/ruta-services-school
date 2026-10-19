// Build aislado: nunca regenera ni imprime public/config.js.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(process.argv[2] ?? resolve(root, 'public/config.js'));
const raw = await readFile(configPath, 'utf8');
const match = raw.match(/window\.APP_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!match) throw new Error('Formato de configuración pública no reconocido');
const source = JSON.parse(match[1]);
const config = {
  supabaseUrl: source.supabaseUrl,
  supabaseAnonKey: source.supabaseAnonKey,
  ...(source.mapboxPublicToken ? { mapboxPublicToken: source.mapboxPublicToken } : {}),
};
if (config.mapboxPublicToken && !config.mapboxPublicToken.startsWith('pk.')) {
  throw new Error('La configuración local requiere un token público de Mapbox');
}
const output = resolve(root, 'dist/local');
await mkdir(output, { recursive: true });
await cp(resolve(root, 'public'), output, { recursive: true });
await writeFile(resolve(output, 'config.js'), `window.APP_CONFIG = ${JSON.stringify(config)};\n`);
await build({ entryPoints: [resolve(root, 'src/app.ts')], bundle: true, format: 'esm', target: 'es2020', outfile: resolve(output, 'app.js') });
if (process.argv[3] === '--build-only') {
  console.log('Build local listo; configuración pública conservada sin mostrar valores.');
  process.exit(0);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = pathname === '/' || pathname.startsWith('/i/') ? resolve(output, 'index.html') : resolve(output, '.' + pathname);
    if (!file.startsWith(output + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('No encontrado'); }
});
server.listen(Number(process.env.PORT ?? 4173), '0.0.0.0', () => {
  console.log(`Web local: http://localhost:${server.address().port} · Mapbox ${config.mapboxPublicToken ? 'conservado' : 'no configurado'}`);
  for (const entries of Object.values(networkInterfaces())) for (const address of entries ?? []) {
    if (address.family === 'IPv4' && !address.internal) console.log(`Red local: http://${address.address}:${server.address().port}`);
  }
});
