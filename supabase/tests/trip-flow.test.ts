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

describe('flujo del conductor: start_trip / record_student_event / finish_trip', () => {
  it('un transportista no puede iniciar la ruta de otro transportista', async () => {
    await expect(
      t.as(s.carrierB.userId, (db) => db.query(`select * from public.start_trip($1)`, [s.routeAId]))
    ).rejects.toThrow(/not_your_route/);
  });

  it('start_trip crea el recorrido, en curso, con un solo evento "started"', async () => {
    const trip = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string; status: string }>(`select * from public.start_trip($1)`, [s.routeAId])
    );
    expect(trip.rows[0].status).toBe('in_progress');

    // Llamarlo de nuevo (p.ej. la app se reabrió) no debe duplicar el evento.
    await t.as(s.carrierA.userId, (db) => db.query(`select * from public.start_trip($1)`, [s.routeAId]));

    const events = await t.as(s.carrierA.userId, (db) =>
      db.query(`select id from public.trip_events where trip_id = $1 and kind = 'started'`, [
        trip.rows[0].id,
      ])
    );
    expect(events.rows).toHaveLength(1);
  });

  it('no se pueden registrar eventos de alumno en un recorrido de otro transportista', async () => {
    const trip = await t.as(s.carrierB.userId, (db) =>
      db.query<{ id: string }>(`select * from public.start_trip($1)`, [s.routeBId])
    );

    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.record_student_event($1, $2, 'picked_up')`, [
          trip.rows[0].id,
          s.sofiaId,
        ])
      )
    ).rejects.toThrow(/not_your_trip/);
  });

  it('finish_trip cierra el recorrido y ya no admite más eventos de alumnos', async () => {
    const trip = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `select id from public.trips where route_id = $1 and status = 'in_progress'`,
        [s.routeAId]
      )
    );
    const tripId = trip.rows[0].id;

    await t.as(s.carrierA.userId, (db) => db.query(`select public.finish_trip($1)`, [tripId]));

    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.record_student_event($1, $2, 'dropped_off')`, [tripId, s.martinaId])
      )
    ).rejects.toThrow(/trip_not_in_progress/);
  });

  it('finish_trip borra el ETA en vivo: nadie ve "llega en X min" de un recorrido terminado', async () => {
    const trip = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `select id from public.trips where route_id = $1 order by created_at desc limit 1`,
        [s.routeAId]
      )
    );
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select 1 from public.trip_stop_eta where trip_id = $1`, [trip.rows[0].id])
    );
    expect(rows.rows).toHaveLength(0);
  });
});
