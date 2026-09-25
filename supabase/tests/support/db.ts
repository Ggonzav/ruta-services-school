// ============================================================================
// Arnés de pruebas de RLS sobre un Postgres real (PGlite, no un mock de SQL).
//
// La idea: correr las migraciones tal cual se aplicarían en Supabase, contra
// un Postgres embebido, y luego ejecutar consultas COMO CADA ROL lo haría
// —"authenticated" con un auth.uid() concreto, nunca el superusuario que
// corrió las migraciones— para que un test en rojo signifique una política
// RLS rota de verdad, no un mock que asume que funciona.
//
// Piezas que replicamos de Supabase (no existen en un Postgres limpio):
//   - esquema auth + tabla auth.users + función auth.uid()
//   - los roles "anon" y "authenticated" que usa PostgREST
// El resto (extensiones, tablas, políticas, funciones) son las migraciones
// reales de supabase/migrations, sin tocar.
// ============================================================================

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

const AUTH_SHIM = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );

  -- Misma definición que usa Supabase en producción: lee el claim "sub"
  -- del JWT que PostgREST deja en un GUC de la transacción/sesión.
  create or replace function auth.uid() returns uuid
    language sql stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nosuperuser nocreatedb nocreaterole noinherit nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nosuperuser nocreatedb nocreaterole noinherit nologin;
    end if;
  end $$;
`;

export interface TestDb {
  db: PGlite;
  /** Crea un usuario auth.users + fila carriers y devuelve su id. */
  createCarrier(fullName: string, phone?: string): Promise<{ userId: string; carrierId: string }>;
  /** Crea un usuario auth.users + fila guardians y devuelve su id. */
  createGuardian(fullName: string, phone?: string): Promise<{ userId: string; guardianId: string }>;
  /**
   * Ejecuta `fn` como si la petición viniera autenticada con ese userId,
   * en el rol "authenticated" (el mismo que usa PostgREST) — nunca como
   * el dueño de las tablas, que en Postgres se salta RLS por defecto.
   */
  as<T>(userId: string | null, fn: (db: PGlite) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function setupTestDb(): Promise<TestDb> {
  const db = new PGlite();

  await db.exec(AUTH_SHIM);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Fallo aplicando migración ${file}: ${(err as Error).message}`);
    }
  }

  async function as<T>(userId: string | null, fn: (db: PGlite) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      if (userId) {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      } else {
        await tx.query(`select set_config('request.jwt.claim.sub', '', true)`, []);
      }
      // @ts-expect-error -- PGlite expone la misma API en la tx que en db;
      // fn sólo usa query/exec, que ambos implementan.
      return fn(tx);
    });
  }

  async function createCarrier(fullName: string, phone = '+56900000000') {
    const userId = crypto.randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
      userId,
      `${userId}@carriers.test`,
    ]);
    const result = await as(userId, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.carriers (user_id, full_name, phone) values ($1, $2, $3) returning id`,
        [userId, fullName, phone]
      )
    );
    return { userId, carrierId: result.rows[0].id };
  }

  async function createGuardian(fullName: string, phone = '+56911111111') {
    const userId = crypto.randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [
      userId,
      `${userId}@guardians.test`,
    ]);
    const result = await as(userId, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.guardians (user_id, full_name, phone) values ($1, $2, $3) returning id`,
        [userId, fullName, phone]
      )
    );
    return { userId, guardianId: result.rows[0].id };
  }

  return {
    db,
    createCarrier,
    createGuardian,
    as,
    close: () => db.close(),
  };
}
