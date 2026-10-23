import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from './support/db.js';
import { buildScenario, type Scenario } from './support/fixtures.js';

let t: TestDb;
let s: Scenario;
let tripId: string;

beforeAll(async () => {
  t = await setupTestDb();
  s = await buildScenario(t);
  // Un recorrido en curso de la ruta A (donde está Martina).
  const trip = await t.as(s.carrierA.userId, (db) =>
    db.query<{ id: string }>(`select id from public.start_trip($1)`, [s.routeAId])
  );
  tripId = trip.rows[0].id;
});

afterAll(async () => {
  await t.close();
});

type Driver = { name: string; phone: string; photoUrl: string | null } | null;
const driverFor = (userId: string) =>
  t.as(userId, (db) =>
    db.query<{ d: Driver }>(`select public.guardian_trip_driver($1) as d`, [tripId])
  );

describe('guardian_trip_driver: tarjeta del conductor autorizada por recorrido', () => {
  it('el apoderado de un alumno del recorrido recibe nombre y teléfono', async () => {
    const res = await driverFor(s.martinaMom.userId);
    expect(res.rows[0].d).toMatchObject({
      name: 'Don Pedro (Furgón 1)',
      phone: '+56900000000',
      photoUrl: null,
    });
  });

  it('refleja la foto cuando el transportista la guarda en carriers', async () => {
    await t.as(s.carrierA.userId, (db) =>
      db.query(`update public.carriers set photo_url = $1 where id = $2`, [
        'https://cdn.example.com/carlos.jpg',
        s.carrierA.carrierId,
      ])
    );
    const res = await driverFor(s.martinaMom.userId);
    expect(res.rows[0].d?.photoUrl).toBe('https://cdn.example.com/carlos.jpg');
  });

  it('un apoderado de otro furgón no obtiene nada (null)', async () => {
    const res = await driverFor(s.sofiaMom.userId);
    expect(res.rows[0].d).toBeNull();
  });

  it('el transportista (no es apoderado) no obtiene nada (null)', async () => {
    const res = await driverFor(s.carrierA.userId);
    expect(res.rows[0].d).toBeNull();
  });
});
