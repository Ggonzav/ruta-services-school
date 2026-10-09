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

  it('driver_mark_stop es idempotente ante doble tap o retry móvil', async () => {
    const trip = await t.as(s.carrierB.userId, (db) =>
      db.query<{ trip_id: string }>(`select public.driver_start_trip($1)->>'tripId' as trip_id`, [s.routeBId])
    );
    const tripId = trip.rows[0].trip_id;

    const first = await t.as(s.carrierB.userId, (db) =>
      db.query<{ result: any }>(`select public.driver_mark_stop($1, $2, 'completed') as result`, [
        tripId,
        s.sofiaId,
      ])
    );
    const second = await t.as(s.carrierB.userId, (db) =>
      db.query<{ result: any }>(`select public.driver_mark_stop($1, $2, 'completed') as result`, [
        tripId,
        s.sofiaId,
      ])
    );

    expect(first.rows[0].result.idempotent).toBe(false);
    expect(second.rows[0].result.idempotent).toBe(true);

    const events = await t.db.query(
      `select id from public.trip_events
       where trip_id = $1 and student_id = $2 and kind in ('picked_up', 'dropped_off', 'skipped')`,
      [tripId, s.sofiaId]
    );
    expect(events.rows).toHaveLength(1);
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

  it('driver_start_trip deja un solo recorrido activo por furgón (cancela el anterior)', async () => {
    // Un furgón propio con dos rutas (ida AM y vuelta PM) el mismo día.
    const vehicle = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `insert into public.vehicles (carrier_id, nickname) values ($1, 'Furgón 0010') returning id`,
        [s.carrierA.carrierId]
      )
    );
    const vehicleId = vehicle.rows[0].id;

    async function createRoute(kind: 'AM' | 'PM', name: string): Promise<string> {
      const route = await t.as(s.carrierA.userId, (db) =>
        db.query<{ id: string }>(
          `insert into public.routes (vehicle_id, kind, name, departure_time, school_name, school_lat, school_lng)
           values ($1, $2, $3, '07:15', 'Colegio Los Aromos', -33.45, -70.66) returning id`,
          [vehicleId, kind, name]
        )
      );
      const routeId = route.rows[0].id;
      await t.as(s.carrierA.userId, (db) =>
        db.query(
          `insert into public.route_stops (route_id, student_id, seq, address, lat, lng)
           values ($1, $2, 1, 'Los Aromos 1420', -33.44, -70.65)`,
          [routeId, s.martinaId]
        )
      );
      return routeId;
    }

    const amRouteId = await createRoute('AM', 'Ida 0010');
    const pmRouteId = await createRoute('PM', 'Vuelta 0010');
    const day = '2026-01-15';

    const am = await t.as(s.carrierA.userId, (db) =>
      db.query<{ trip_id: string }>(`select public.driver_start_trip($1, $2)->>'tripId' as trip_id`, [amRouteId, day])
    );
    const amTripId = am.rows[0].trip_id;

    // Iniciar la vuelta en el mismo furgón debe cancelar la ida activa.
    await t.as(s.carrierA.userId, (db) =>
      db.query(`select public.driver_start_trip($1, $2)`, [pmRouteId, day])
    );

    const amStatus = await t.db.query<{ status: string }>(
      `select status from public.trips where id = $1`,
      [amTripId]
    );
    expect(amStatus.rows[0].status).toBe('canceled');

    const active = await t.db.query(
      `select t.id from public.trips t join public.routes r on r.id = t.route_id
       where r.vehicle_id = $1 and t.status = 'in_progress'`,
      [vehicleId]
    );
    expect(active.rows).toHaveLength(1);
  });
});
