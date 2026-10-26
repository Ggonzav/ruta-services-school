import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from './support/db.js';
import { buildScenario, type Scenario } from './support/fixtures.js';

let t: TestDb;
let s: Scenario;

beforeAll(async () => {
  t = await setupTestDb();
  s = await buildScenario(t);
});

afterAll(async () => {
  await t.close();
});

describe('invitación por WhatsApp: redeem_invite', () => {
  it('el transportista crea una invitación para su alumno', async () => {
    const rows = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.invites (student_id, carrier_id) values ($1, $2) returning id`,
        [s.martinaId, s.carrierA.carrierId]
      )
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('el transportista no puede invitar a un alumno de otro furgón', async () => {
    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`insert into public.invites (student_id, carrier_id) values ($1, $2)`, [
          s.sofiaId,
          s.carrierA.carrierId,
        ])
      )
    ).rejects.toThrow();
  });

  it('un nuevo apoderado (sesión anónima) canjea el link y queda ligado sólo a ese alumno', async () => {
    const invite = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.invites (student_id, carrier_id) values ($1, $2) returning id`,
        [s.benjaminId, s.carrierA.carrierId]
      )
    );
    const token = invite.rows[0].id;

    // Simula supabase.auth.signInAnonymously(): un user_id nuevo, sin fila
    // en guardians todavía.
    const anonUserId = crypto.randomUUID();
    await t.db.query(`insert into auth.users (id, email) values ($1, null)`, [anonUserId]);

    const redeemed = await t.as(anonUserId, (db) =>
      db.query<{ student_name: string; route_name: string }>(
        `select * from public.redeem_invite($1, $2)`,
        [token, 'Papá de Benjamín (segundo teléfono)']
      )
    );

    expect(redeemed.rows[0].student_name).toBe('Benjamín T.');
    expect(redeemed.rows[0].route_name).toBe('Ruta de la mañana');

    // A partir de acá, esa sesión anónima ve exactamente lo que vería
    // cualquier apoderado de Benjamín: su parada, nada más.
    const stops = await t.as(anonUserId, (db) => db.query(`select student_id from public.route_stops`));
    expect(stops.rows).toHaveLength(1);
    expect((stops.rows[0] as any).student_id).toBe(s.benjaminId);
  });

  it('un token vencido no se puede canjear', async () => {
    const invite = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.invites (student_id, carrier_id, expires_at)
         values ($1, $2, now() - interval '1 day') returning id`,
        [s.martinaId, s.carrierA.carrierId]
      )
    );

    const anonUserId = crypto.randomUUID();
    await t.db.query(`insert into auth.users (id, email) values ($1, null)`, [anonUserId]);

    await expect(
      t.as(anonUserId, (db) =>
        db.query(`select * from public.redeem_invite($1, $2)`, [invite.rows[0].id, 'Alguien'])
      )
    ).rejects.toThrow(/invite_not_found_or_expired/);
  });

  it('sin sesión (auth.uid() nulo) redeem_invite falla', async () => {
    const invite = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.invites (student_id, carrier_id) values ($1, $2) returning id`,
        [s.martinaId, s.carrierA.carrierId]
      )
    );

    await expect(
      t.as(null, (db) =>
        db.query(`select * from public.redeem_invite($1, $2)`, [invite.rows[0].id, 'Alguien'])
      )
    ).rejects.toThrow(/auth_required/);
  });

  it('un solo uso: un segundo usuario no puede canjear un link ya usado', async () => {
    const invite = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.invites (student_id, carrier_id) values ($1, $2) returning id`,
        [s.benjaminId, s.carrierA.carrierId]
      )
    );
    const token = invite.rows[0].id;

    // Primer apoderado canjea el link.
    const first = crypto.randomUUID();
    await t.db.query(`insert into auth.users (id, email) values ($1, null)`, [first]);
    await t.as(first, (db) => db.query(`select * from public.redeem_invite($1, $2)`, [token, 'Mamá de Benjamín']));

    // Un segundo usuario/dispositivo distinto intenta reusar el mismo link.
    const second = crypto.randomUUID();
    await t.db.query(`insert into auth.users (id, email) values ($1, null)`, [second]);
    await expect(
      t.as(second, (db) => db.query(`select * from public.redeem_invite($1, $2)`, [token, 'Otra persona']))
    ).rejects.toThrow(/invite_already_used/);

    // No se creó ningún vínculo para el segundo usuario → no ve ninguna parada.
    const stops = await t.as(second, (db) => db.query(`select student_id from public.route_stops`));
    expect(stops.rows).toHaveLength(0);
  });

  it('un solo uso: el MISMO usuario puede reabrir su propio link (idempotente)', async () => {
    const invite = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.invites (student_id, carrier_id) values ($1, $2) returning id`,
        [s.benjaminId, s.carrierA.carrierId]
      )
    );
    const token = invite.rows[0].id;

    const userId = crypto.randomUUID();
    await t.db.query(`insert into auth.users (id, email) values ($1, null)`, [userId]);

    const r1 = await t.as(userId, (db) =>
      db.query<{ student_name: string }>(`select * from public.redeem_invite($1, $2)`, [token, 'Mamá de Benjamín'])
    );
    const r2 = await t.as(userId, (db) =>
      db.query<{ student_name: string }>(`select * from public.redeem_invite($1, $2)`, [token, 'Mamá de Benjamín'])
    );
    expect(r1.rows[0].student_name).toBe('Benjamín T.');
    expect(r2.rows[0].student_name).toBe('Benjamín T.');

    // Sigue ligado a un solo alumno, sin duplicar vínculos.
    const links = await t.db.query<{ n: string }>(
      `select count(*)::text as n from public.student_guardians sg
       join public.guardians g on g.id = sg.guardian_id
       where g.user_id = $1`,
      [userId]
    );
    expect(links.rows[0].n).toBe('1');
  });
});
