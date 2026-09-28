import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const supabaseUrl = process.env.SUPABASE_URL ?? 'https://jfjysvvrpjemcdkqutmw.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmanlzdnZycGplbWNka3F1dG13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MzkzMTksImV4cCI6MjEwNTUxNTMxOX0.DHba5OF69d7A31cTOZr4tpYS5b6CM_9_d6jcy2QCK4U';
const mapboxPublicToken = process.env.MAPBOX_PUBLIC_TOKEN ?? process.env.MAPBOX_ACCESS_TOKEN ?? '';

const config = {
  supabaseUrl,
  supabaseAnonKey,
  ...(mapboxPublicToken ? { mapboxPublicToken } : {}),
};

const output = `// Archivo generado por scripts/build-config.mjs durante el build.\n// Contiene configuración pública de cliente; la seguridad de datos vive en RLS/RPC.\nwindow.APP_CONFIG = ${JSON.stringify(config, null, 2)};\n`;

writeFileSync(resolve('public/config.js'), output);
console.log(`public/config.js generado${mapboxPublicToken ? ' con Mapbox' : ' sin Mapbox'}`);
