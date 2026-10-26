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

describe('route_stops: el punto más sensible del esquema', () => {
  it('la mamá de Martina ve la parada de Martina', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select address from public.route_stops where student_id = $1`, [s.martinaId])
    );
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).address).toBe('Los Aromos 1420');
  });

  it('la mamá de Martina NO ve la parada de Benjamín, aunque sea la misma ruta', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select address from public.route_stops where student_id = $1`, [s.benjaminId])
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('la mamá de Martina, mirando TODA la tabla sin filtrar, sólo recibe su propia fila', async () => {
    // Este es el test que de verdad importa: no "filtro por mi hijo y
    // confío en que el backend respete el filtro", sino "aunque pida
    // todo, RLS me devuelve sólo lo mío".
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select student_id from public.route_stops`)
    );
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).student_id).toBe(s.martinaId);
  });

  it('el transportista dueño ve todas las paradas de su ruta', async () => {
    const rows = await t.as(s.carrierA.userId, (db) =>
      db.query(`select student_id from public.route_stops where route_id = $1`, [s.routeAId])
    );
    expect(rows.rows).toHaveLength(2);
  });

  it('un transportista no ve las paradas del furgón de otro transportista', async () => {
    const rows = await t.as(s.carrierA.userId, (db) =>
      db.query(`select student_id from public.route_stops where route_id = $1`, [s.routeBId])
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe('students y routes: sin listas completas para apoderados', () => {
  it('la mamá de Martina no puede listar todos los alumnos del furgón', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) => db.query(`select id from public.students`));
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).id).toBe(s.martinaId);
  });

  it('la mamá de Martina ve los metadatos de la ruta (nombre, colegio, hora)', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select name, school_name from public.routes where id = $1`, [s.routeAId])
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('la mamá de Sofía (otro furgón) no ve la ruta de Martina', async () => {
    const rows = await t.as(s.sofiaMom.userId, (db) =>
      db.query(`select id from public.routes where id = $1`, [s.routeAId])
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe('sin sesión: RLS deniega todo', () => {
  it('un caller sin auth.uid() no ve ninguna fila', async () => {
    const rows = await t.as(null, (db) => db.query(`select id from public.route_stops`));
    expect(rows.rows).toHaveLength(0);
  });
});

describe('trip_events y trip_stop_eta: eventos y ETA de un hermano no se filtran', () => {
  let tripId: string;

  beforeAll(async () => {
    const trip = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select * from public.start_trip($1)`, [s.routeAId])
    );
    tripId = (trip.rows[0] as any).id;

    await t.as(s.carrierA.userId, (db) =>
      db.query(`select public.record_student_event($1, $2, 'picked_up')`, [tripId, s.martinaId])
    );
    // trip_stop_eta lo escribe la Edge Function con la service role key
    // (bypassa RLS); acá simulamos ese insert directo del "backend".
    await t.db.query(
      `insert into public.trip_stop_eta (trip_id, student_id, eta_seconds) values ($1, $2, 300)`,
      [tripId, s.benjaminId]
    );
  });

  it('la mamá de Martina ve el evento "started" (general del recorrido)', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select kind from public.trip_events where trip_id = $1 and kind = 'started'`, [tripId])
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('la mamá de Martina ve que Martina subió', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select kind from public.trip_events where trip_id = $1 and student_id = $2`, [
        tripId,
        s.martinaId,
      ])
    );
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).kind).toBe('picked_up');
  });

  it('la mamá de Martina NO ve el ETA de Benjamín', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select eta_seconds from public.trip_stop_eta where trip_id = $1`, [tripId])
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('el papá de Benjamín SÍ ve el ETA de Benjamín', async () => {
    const rows = await t.as(s.benjaminDad.userId, (db) =>
      db.query(`select eta_seconds from public.trip_stop_eta where trip_id = $1`, [tripId])
    );
    expect(rows.rows).toHaveLength(1);
    expect((rows.rows[0] as any).eta_seconds).toBe(300);
  });

  it('el papá de Benjamín no ve que Martina subió (sin fila con student_id de Martina)', async () => {
    const rows = await t.as(s.benjaminDad.userId, (db) =>
      db.query(`select kind from public.trip_events where trip_id = $1 and student_id = $2`, [
        tripId,
        s.martinaId,
      ])
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe('absences: sólo el propio apoderado', () => {
  it('la mamá de Martina puede avisar que Martina no viaja hoy', async () => {
    const rows = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select * from public.mark_absence($1, current_date, 'AM')`, [s.martinaId])
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('la mamá de Martina no puede avisar una ausencia de Benjamín', async () => {
    await expect(
      t.as(s.martinaMom.userId, (db) =>
        db.query(`select * from public.mark_absence($1, current_date, 'AM')`, [s.benjaminId])
      )
    ).rejects.toThrow();
  });

  it('el transportista ve la ausencia que avisó la mamá de Martina', async () => {
    const rows = await t.as(s.carrierA.userId, (db) =>
      db.query(`select student_id from public.absences where student_id = $1`, [s.martinaId])
    );
    expect(rows.rows).toHaveLength(1);
  });
});

describe('trip_vehicle_location: última ubicación, fresca y protegida', () => {
  it('el apoderado ve la ubicación fresca de su recorrido, pero no una ubicación vieja congelada', async () => {
    const trip = await t.as(s.carrierA.userId, (db) =>
      db.query<{ trip_id: string }>(`select public.driver_start_trip($1)->>'tripId' as trip_id`, [s.routeAId])
    );
    const tripId = trip.rows[0].trip_id;

    await t.db.query(
      `insert into public.trip_vehicle_location (trip_id, lat, lng, updated_at)
       values ($1, -33.5, -70.7, now())`,
      [tripId]
    );

    const fresh = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select lat, lng from public.trip_vehicle_location where trip_id = $1`, [tripId])
    );
    expect(fresh.rows).toHaveLength(1);

    await t.db.query(
      `update public.trip_vehicle_location
       set updated_at = now() - interval '3 minutes'
       where trip_id = $1`,
      [tripId]
    );

    const stale = await t.as(s.martinaMom.userId, (db) =>
      db.query(`select lat, lng from public.trip_vehicle_location where trip_id = $1`, [tripId])
    );
    expect(stale.rows).toHaveLength(0);
  });
});
