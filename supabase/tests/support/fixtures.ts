// ============================================================================
// Escenario estándar para los tests de RLS: dos transportistas distintos
// (para probar aislamiento entre furgones) y, dentro del primero, dos
// alumnos con paradas distintas en la misma ruta (para probar que un
// apoderado no ve la parada del otro alumno del mismo furgón).
// ============================================================================

import type { TestDb } from './db.js';

export async function buildScenario(t: TestDb) {
  const carrierA = await t.createCarrier('Don Pedro (Furgón 1)');
  const carrierB = await t.createCarrier('Doña Ana (Furgón 2)');

  const vehicleA = await t.as(carrierA.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.vehicles (carrier_id, nickname, plate) values ($1, $2, $3) returning id`,
      [carrierA.carrierId, 'Furgón 1', 'ABCD12']
    )
  );

  const routeA = await t.as(carrierA.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.routes
         (vehicle_id, kind, name, departure_time, school_name, school_lat, school_lng)
       values ($1, 'AM', 'Ruta de la mañana', '07:15', 'Colegio Los Aromos', -33.45, -70.66)
       returning id`,
      [vehicleA.rows[0].id]
    )
  );

  const martina = await t.as(carrierA.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.students (carrier_id, full_name) values ($1, $2) returning id`,
      [carrierA.carrierId, 'Martina R.']
    )
  );
  const benjamin = await t.as(carrierA.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.students (carrier_id, full_name) values ($1, $2) returning id`,
      [carrierA.carrierId, 'Benjamín T.']
    )
  );

  await t.as(carrierA.userId, (db) =>
    db.query(
      `insert into public.route_stops (route_id, student_id, seq, address, lat, lng)
       values ($1, $2, 1, 'Los Aromos 1420', -33.44, -70.65)`,
      [routeA.rows[0].id, martina.rows[0].id]
    )
  );
  await t.as(carrierA.userId, (db) =>
    db.query(
      `insert into public.route_stops (route_id, student_id, seq, address, lat, lng)
       values ($1, $2, 2, 'Pasaje Los Cedros 88', -33.43, -70.64)`,
      [routeA.rows[0].id, benjamin.rows[0].id]
    )
  );

  const martinaMom = await t.createGuardian('Mamá de Martina');
  const benjaminDad = await t.createGuardian('Papá de Benjamín');

  await t.as(carrierA.userId, (db) =>
    db.query(
      `insert into public.student_guardians (student_id, guardian_id) values ($1, $2)`,
      [martina.rows[0].id, martinaMom.guardianId]
    )
  );
  await t.as(carrierA.userId, (db) =>
    db.query(
      `insert into public.student_guardians (student_id, guardian_id) values ($1, $2)`,
      [benjamin.rows[0].id, benjaminDad.guardianId]
    )
  );

  // Un segundo furgón/carrier, completamente ajeno, para las pruebas de
  // aislamiento entre transportistas.
  const vehicleB = await t.as(carrierB.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.vehicles (carrier_id, nickname) values ($1, 'Furgón 2') returning id`,
      [carrierB.carrierId]
    )
  );
  const routeB = await t.as(carrierB.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.routes
         (vehicle_id, kind, name, departure_time, school_name, school_lat, school_lng)
       values ($1, 'AM', 'Ruta B', '07:30', 'Colegio San Rafael', -33.5, -70.7)
       returning id`,
      [vehicleB.rows[0].id]
    )
  );
  const sofia = await t.as(carrierB.userId, (db) =>
    db.query<{ id: string }>(
      `insert into public.students (carrier_id, full_name) values ($1, 'Sofía M.') returning id`,
      [carrierB.carrierId]
    )
  );
  await t.as(carrierB.userId, (db) =>
    db.query(
      `insert into public.route_stops (route_id, student_id, seq, address, lat, lng)
       values ($1, $2, 1, 'Av. Siempre Viva 742', -33.51, -70.71)`,
      [routeB.rows[0].id, sofia.rows[0].id]
    )
  );
  const sofiaMom = await t.createGuardian('Mamá de Sofía');
  await t.as(carrierB.userId, (db) =>
    db.query(
      `insert into public.student_guardians (student_id, guardian_id) values ($1, $2)`,
      [sofia.rows[0].id, sofiaMom.guardianId]
    )
  );

  return {
    carrierA,
    carrierB,
    vehicleAId: vehicleA.rows[0].id as string,
    routeAId: routeA.rows[0].id as string,
    routeBId: routeB.rows[0].id as string,
    martinaId: martina.rows[0].id as string,
    benjaminId: benjamin.rows[0].id as string,
    sofiaId: sofia.rows[0].id as string,
    martinaMom,
    benjaminDad,
    sofiaMom,
  };
}

export type Scenario = Awaited<ReturnType<typeof buildScenario>>;
