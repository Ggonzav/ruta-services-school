import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from './support/db.js';
import { buildScenario, type Scenario } from './support/fixtures.js';

// Escenario fresco por test: varios casos inician un recorrido, y un trip
// 'in_progress' de un test no debe filtrarse al siguiente (el bloqueo depende
// de ese estado).
let t: TestDb;
let s: Scenario;

beforeEach(async () => {
  t = await setupTestDb();
  s = await buildScenario(t);
});

afterEach(async () => {
  await t.close();
});

const idOf = (r: { rows: Array<{ id: string }> }) => r.rows[0].id;

describe('Mis alumnos: alta, renombrado, asignación a ruta y baja', () => {
  it('carrier_create_student crea un alumno del transportista logueado', async () => {
    const created = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select public.carrier_create_student($1) as id`, ['  Nuevo Niño  '])
    );
    const row = await t.as(s.carrierA.userId, (db) =>
      db.query<{ carrier_id: string; full_name: string }>(
        `select carrier_id, full_name from public.students where id = $1`,
        [idOf(created)]
      )
    );
    expect(row.rows[0].carrier_id).toBe(s.carrierA.carrierId);
    expect(row.rows[0].full_name).toBe('Nuevo Niño'); // recortado
  });

  it('rechaza nombre vacío', async () => {
    await expect(
      t.as(s.carrierA.userId, (db) => db.query(`select public.carrier_create_student($1)`, ['   ']))
    ).rejects.toThrow(/full_name_required/);
  });

  it('un apoderado (sin carrier) no puede crear alumnos', async () => {
    await expect(
      t.as(s.martinaMom.userId, (db) => db.query(`select public.carrier_create_student($1)`, ['X']))
    ).rejects.toThrow(/not_a_carrier/);
  });

  it('carrier_rename_student renombra a un alumno propio', async () => {
    await t.as(s.carrierA.userId, (db) =>
      db.query(`select public.carrier_rename_student($1, $2)`, [s.martinaId, 'Martina Rojas'])
    );
    const row = await t.as(s.carrierA.userId, (db) =>
      db.query<{ full_name: string }>(`select full_name from public.students where id = $1`, [s.martinaId])
    );
    expect(row.rows[0].full_name).toBe('Martina Rojas');
  });

  it('carrier_assign_student_to_route agrega una parada con el siguiente seq', async () => {
    // routeA ya tiene paradas seq 1 y 2; un alumno nuevo debe quedar en seq 3.
    const nuevo = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select public.carrier_create_student($1) as id`, ['Tercero'])
    );
    const stop = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `select public.carrier_assign_student_to_route($1,$2,$3,$4,$5) as id`,
        [idOf(nuevo), s.routeAId, 'Av. Nueva 100', -33.46, -70.67]
      )
    );
    const row = await t.as(s.carrierA.userId, (db) =>
      db.query<{ seq: number; address: string }>(
        `select seq, address from public.route_stops where id = $1`,
        [idOf(stop)]
      )
    );
    expect(row.rows[0].seq).toBe(3);
    expect(row.rows[0].address).toBe('Av. Nueva 100');
  });

  it('reasignar un alumno ya en la ruta actualiza dirección/coords y conserva el seq', async () => {
    const stop = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(
        `select public.carrier_assign_student_to_route($1,$2,$3,$4,$5) as id`,
        [s.martinaId, s.routeAId, 'Dirección corregida 55', -33.441, -70.651]
      )
    );
    const row = await t.as(s.carrierA.userId, (db) =>
      db.query<{ seq: number; address: string }>(
        `select seq, address from public.route_stops where id = $1`,
        [idOf(stop)]
      )
    );
    expect(row.rows[0].seq).toBe(1); // Martina ya era seq 1 en el fixture
    expect(row.rows[0].address).toBe('Dirección corregida 55');
  });

  it('valida coordenadas y dirección', async () => {
    const nuevo = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select public.carrier_create_student($1) as id`, ['Val'])
    );
    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.carrier_assign_student_to_route($1,$2,$3,$4,$5)`, [
          idOf(nuevo), s.routeAId, 'Calle', 999, -70,
        ])
      )
    ).rejects.toThrow(/invalid_coordinates/);
    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.carrier_assign_student_to_route($1,$2,$3,$4,$5)`, [
          idOf(nuevo), s.routeAId, '  ', -33.4, -70.6,
        ])
      )
    ).rejects.toThrow(/address_required/);
  });

  it('carrier_remove_student_from_route quita la parada sin borrar al alumno', async () => {
    await t.as(s.carrierA.userId, (db) =>
      db.query(`select public.carrier_remove_student_from_route($1, $2)`, [s.benjaminId, s.routeAId])
    );
    const stops = await t.as(s.carrierA.userId, (db) =>
      db.query(`select 1 from public.route_stops where route_id = $1 and student_id = $2`, [
        s.routeAId, s.benjaminId,
      ])
    );
    expect(stops.rows).toHaveLength(0);
    const student = await t.as(s.carrierA.userId, (db) =>
      db.query(`select 1 from public.students where id = $1`, [s.benjaminId])
    );
    expect(student.rows).toHaveLength(1); // el alumno sigue existiendo
  });

  it('aísla entre transportistas: no se puede tocar alumno ni ruta ajenos', async () => {
    // Carrier B intenta asignar un alumno de A (falla por alumno ajeno).
    await expect(
      t.as(s.carrierB.userId, (db) =>
        db.query(`select public.carrier_assign_student_to_route($1,$2,$3,$4,$5)`, [
          s.martinaId, s.routeBId, 'X 1', -33.5, -70.7,
        ])
      )
    ).rejects.toThrow(/not_your_student/);
    // Carrier B con su propio alumno pero apuntando a la ruta de A (falla por ruta ajena).
    await expect(
      t.as(s.carrierB.userId, (db) =>
        db.query(`select public.carrier_assign_student_to_route($1,$2,$3,$4,$5)`, [
          s.sofiaId, s.routeAId, 'X 1', -33.5, -70.7,
        ])
      )
    ).rejects.toThrow(/not_your_route/);
  });
});

describe('Mis alumnos: bloqueo durante recorrido en curso', () => {
  it('con un trip in_progress no se puede agregar, mover ni quitar paradas de esa ruta', async () => {
    await t.as(s.carrierA.userId, (db) => db.query(`select public.start_trip($1)`, [s.routeAId]));

    const nuevo = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select public.carrier_create_student($1) as id`, ['Durante'])
    );
    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.carrier_assign_student_to_route($1,$2,$3,$4,$5)`, [
          idOf(nuevo), s.routeAId, 'Calle 9', -33.4, -70.6,
        ])
      )
    ).rejects.toThrow(/route_has_active_trip/);
    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.carrier_remove_student_from_route($1, $2)`, [s.martinaId, s.routeAId])
      )
    ).rejects.toThrow(/route_has_active_trip/);
  });

  it('con un trip in_progress no se puede renombrar a un alumno de esa ruta', async () => {
    await t.as(s.carrierA.userId, (db) => db.query(`select public.start_trip($1)`, [s.routeAId]));
    await expect(
      t.as(s.carrierA.userId, (db) =>
        db.query(`select public.carrier_rename_student($1, $2)`, [s.martinaId, 'Nuevo'])
      )
    ).rejects.toThrow(/student_has_active_trip/);
  });

  it('crear un alumno nuevo (aún sin ruta) sí se permite durante un recorrido', async () => {
    await t.as(s.carrierA.userId, (db) => db.query(`select public.start_trip($1)`, [s.routeAId]));
    const created = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select public.carrier_create_student($1) as id`, ['Libre'])
    );
    expect(idOf(created)).toBeTruthy();
  });

  it('al finalizar el recorrido se vuelve a permitir editar', async () => {
    const trip = await t.as(s.carrierA.userId, (db) =>
      db.query<{ id: string }>(`select id from public.start_trip($1)`, [s.routeAId])
    );
    await t.as(s.carrierA.userId, (db) => db.query(`select public.finish_trip($1)`, [idOf(trip)]));
    // Ahora sí se puede quitar una parada.
    await t.as(s.carrierA.userId, (db) =>
      db.query(`select public.carrier_remove_student_from_route($1, $2)`, [s.benjaminId, s.routeAId])
    );
    const stops = await t.as(s.carrierA.userId, (db) =>
      db.query(`select 1 from public.route_stops where route_id = $1 and student_id = $2`, [
        s.routeAId, s.benjaminId,
      ])
    );
    expect(stops.rows).toHaveLength(0);
  });
});
