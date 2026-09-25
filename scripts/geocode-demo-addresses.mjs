#!/usr/bin/env node
// Geocodifica direcciones demo con la Edge Function geocode-address y emite
// SQL listo para pegar en Supabase SQL Editor.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readPublicConfig() {
  try {
    const configPath = resolve(process.cwd(), 'apps/web-apoderado/public/config.js');
    const source = readFileSync(configPath, 'utf8');
    return {
      supabaseUrl: source.match(/["']?supabaseUrl["']?\s*:\s*['"`]([^'"`]+)['"`]/)?.[1],
      supabaseAnonKey: source.match(/["']?supabaseAnonKey["']?\s*:\s*['"`]([^'"`]+)['"`]/)?.[1],
    };
  } catch {
    return {};
  }
}

const publicConfig = readPublicConfig();
const SUPABASE_URL = process.env.SUPABASE_URL ?? publicConfig.supabaseUrl;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? publicConfig.supabaseAnonKey;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ACCESS_TOKEN) {
  console.error('Falta configuración. Ejecuta desde la raíz del proyecto o define SUPABASE_URL y SUPABASE_ANON_KEY.');
  process.exit(1);
}

const addresses = [
  { kind: 'student', name: 'Martina Demo', address: 'Laurel 30, Maipú, Santiago, Chile' },
  { kind: 'student', name: 'Benjamín Demo', address: 'Diego de Almagro 111, Maipú, Santiago, Chile' },
  { kind: 'school', name: 'Colegio Centenario', address: 'Avenida Centenario 276, Maipú, Santiago, Chile' },
];

async function geocode(address) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/geocode-address`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ address, country: 'cl', proximity_lng: -70.756, proximity_lat: -33.505, limit: 1 }),
  });
  const json = await res.json();
  if (!res.ok || !json.candidates?.length) throw new Error(`${address}: ${JSON.stringify(json)}`);
  return json.candidates[0];
}

const results = [];
for (const item of addresses) {
  const candidate = await geocode(item.address);
  results.push({ ...item, ...candidate });
}

const byName = Object.fromEntries(results.map((r) => [r.name, r]));
console.log('-- SQL generado por scripts/geocode-demo-addresses.mjs');
console.log('-- Revisa las etiquetas antes de ejecutar:');
for (const r of results) console.log(`-- ${r.name}: ${r.label} (${r.lat}, ${r.lng})`);
console.log(`
update public.routes
set school_name = 'Colegio Centenario',
    school_lat = ${byName['Colegio Centenario'].lat},
    school_lng = ${byName['Colegio Centenario'].lng}
where name ilike 'Ruta demo%';

update public.route_stops rs
set address = 'Laurel 30, Maipú, Santiago, Chile',
    lat = ${byName['Martina Demo'].lat},
    lng = ${byName['Martina Demo'].lng}
from public.students s
where s.id = rs.student_id
  and s.full_name = 'Martina Demo';

update public.route_stops rs
set address = 'Diego de Almagro 111, Maipú, Santiago, Chile',
    lat = ${byName['Benjamín Demo'].lat},
    lng = ${byName['Benjamín Demo'].lng}
from public.students s
where s.id = rs.student_id
  and s.full_name = 'Benjamín Demo';`);
