import { createECDH, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
const path = '.env.push.local';
if (existsSync(path)) throw new Error('Ya existe .env.push.local. No rotar las claves de dispositivos activos.');
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const values = {
  VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString('base64url'),
  VAPID_SUBJECT: 'https://rutasegura.pages.dev',
  PUSH_DISPATCH_SECRET: randomBytes(32).toString('hex'),
};
writeFileSync(path, Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n', { mode: 0o600, flag: 'wx' });
console.log('Claves guardadas en .env.push.local (ignorado por Git). No compartir su contenido.');
