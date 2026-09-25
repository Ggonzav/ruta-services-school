#!/usr/bin/env node
// Actualiza la URL pública de la web del apoderado en la app conductor.
// Uso:
//   node scripts/set-web-base-url.mjs https://tu-url-publica.ngrok-free.app

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2]?.trim();
if (!url || !/^https?:\/\/[^/]+/.test(url)) {
  console.error('Uso: node scripts/set-web-base-url.mjs https://tu-url-publica');
  process.exit(1);
}

const cleanUrl = url.replace(/\/+$/, '');
const appJsonPath = resolve(process.cwd(), 'apps/conductor/app.json');
const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));

appJson.expo ??= {};
appJson.expo.extra ??= {};
appJson.expo.extra.webBaseUrl = cleanUrl;

writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
console.log(`webBaseUrl actualizado a: ${cleanUrl}`);
