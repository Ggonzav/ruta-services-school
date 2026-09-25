import { afterAll, beforeAll, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from './support/db';
import { buildScenario, type Scenario } from './support/fixtures';

let t: TestDb;
let s: Scenario;
let tripId: string;
beforeAll(async () => {
  t = await setupTestDb();
  s = await buildScenario(t);
  const result = await t.as(s.carrierA.userId, db => db.query<{id: string}>(
    'select * from public.start_trip($1)', [s.routeAId]));
  tripId = result.rows[0].id;
  await t.db.query('insert into public.trip_stop_eta values ($1,$2,300,now())', [tripId, s.martinaId]);
});
afterAll(async () => { await t.close(); });

it('reading a trip does not authorize a guardian to update its ETA', async () => {
  const visible = await t.as(s.martinaMom.userId, db => db.query('select id from public.trips where id=$1', [tripId]));
  expect(visible.rows).toHaveLength(1);
  for (const [user, allowed] of [[s.carrierA.userId, true], [s.carrierB.userId, false], [s.martinaMom.userId, false], [null, false]] as const) {
    const result = await t.as(user, db => db.query<{allowed: boolean}>(
      'select public.is_my_trip($1) as allowed', [tripId]));
    expect(result.rows[0].allowed).toBe(allowed);
  }
});

it('guardians and other carriers cannot delete the ETA', async () => {
  for (const user of [s.martinaMom.userId, s.carrierB.userId]) {
    await t.as(user, db => db.query('delete from public.trip_stop_eta where trip_id=$1', [tripId]));
  }
  expect((await t.db.query('select * from public.trip_stop_eta where trip_id=$1', [tripId])).rows).toHaveLength(1);
});

it('closing a trip removes a populated ETA and rejects a late backend write', async () => {
  await t.as(s.carrierA.userId, db => db.query('select public.finish_trip($1)', [tripId]));
  expect((await t.db.query('select * from public.trip_stop_eta where trip_id=$1', [tripId])).rows).toHaveLength(0);
  await t.db.query('insert into public.trip_stop_eta values ($1,$2,240,now())', [tripId, s.martinaId]);
  expect((await t.db.query('select * from public.trip_stop_eta where trip_id=$1', [tripId])).rows).toHaveLength(0);
});
