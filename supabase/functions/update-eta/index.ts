// ============================================================================
// Edge Function: update-eta
//
// La llama el teléfono del conductor cada 30–45 segundos mientras un
// recorrido está "in_progress". Recibe la posición actual, la manda a
// Mapbox y guarda sólo la ÚLTIMA ubicación del furgón por recorrido en
// trip_vehicle_location, sin historial. Esa coordenada se borra al finalizar
// y RLS sólo la expone a apoderados de ese recorrido cuando está fresca. El
// ETA por alumno persiste en trip_stop_eta, con la service role key (bypassa
// RLS a propósito: esta función SÍ necesita ver todas las paradas del
// recorrido para pedirle a Mapbox la ruta completa).
//
// Deploy: supabase functions deploy update-eta
// Config: supabase secrets set MAPBOX_ACCESS_TOKEN=...
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildDirectionsUrl,
  computeStopEtas,
  computeStraightLineStopEtas,
  studentsNewlyApproaching,
  type DirectionsResponse,
  type RemainingStop,
} from './eta-logic.ts';

interface UpdateEtaBody {
  trip_id: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
}

const MAPBOX_ACCESS_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'auth_required' }, 401);
  }

  let body: UpdateEtaBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.trip_id || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return json({ error: 'invalid_body' }, 400);
  }

  // Reading a trip is also allowed for guardians. Check ownership explicitly
  // with the caller's JWT before using service-role privileges.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: ownsTrip, error: ownershipError } = await callerClient.rpc('is_my_trip', {
    p_trip_id: body.trip_id,
  });
  if (ownershipError) return json({ error: 'authorization_failed' }, 500);
  if (ownsTrip !== true) return json({ error: 'trip_not_found_or_not_yours' }, 403);

  const { data: trip, error: tripError } = await callerClient
    .from('trips')
    .select('id, route_id, status, target_student_id')
    .eq('id', body.trip_id)
    .maybeSingle();

  if (tripError) return json({ error: 'lookup_failed', detail: tripError.message }, 500);
  if (!trip) return json({ error: 'trip_not_found_or_not_yours' }, 404);
  if (trip.status !== 'in_progress') return json({ error: 'trip_not_in_progress' }, 409);

  // A partir de aquí usamos la service role key: necesitamos ver TODAS
  // las paradas restantes del recorrido para pedirle la ruta a Mapbox,
  // algo que RLS le niega a un "authenticated" normal (a propósito).
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: doneEvents, error: doneError } = await admin
    .from('trip_events')
    .select('student_id, kind')
    .eq('trip_id', trip.id)
    .in('kind', ['picked_up', 'dropped_off', 'skipped']);
  if (doneError) return json({ error: 'lookup_failed', detail: doneError.message }, 500);

  const { error: locationError } = await admin.from('trip_vehicle_location').upsert(
    {
      trip_id: trip.id,
      lat: body.lat,
      lng: body.lng,
      heading: typeof body.heading === 'number' ? body.heading : null,
      speed: typeof body.speed === 'number' ? body.speed : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trip_id' }
  );
  if (locationError) return json({ error: 'location_upsert_failed', detail: locationError.message }, 500);

  const doneStudentIds = new Set((doneEvents ?? []).map((e) => e.student_id));
  const targetId = (trip as { target_student_id?: string | null }).target_student_id ?? null;

  // El ETA solo existe hacia el DESTINO actual (el alumno que el conductor
  // eligió). Sin destino, o si ya fue marcado, no hay ETA que mostrar: se
  // limpia para que el apoderado vea "atendiendo otras paradas".
  if (!targetId || doneStudentIds.has(targetId)) {
    await admin.from('trip_stop_eta').delete().eq('trip_id', trip.id);
    return json({ ok: true, target: null, stops_updated: 0 });
  }

  const { data: stops, error: stopsError } = await admin
    .from('route_stops')
    .select('student_id, seq, lat, lng')
    .eq('route_id', trip.route_id)
    .eq('student_id', targetId);
  if (stopsError) return json({ error: 'lookup_failed', detail: stopsError.message }, 500);

  const targetStop = (stops ?? [])[0];
  if (!targetStop) {
    await admin.from('trip_stop_eta').delete().eq('trip_id', trip.id);
    return json({ ok: true, target: targetId, stops_updated: 0 });
  }

  const remainingStops: RemainingStop[] = [
    { studentId: targetStop.student_id, seq: targetStop.seq, lat: targetStop.lat, lng: targetStop.lng },
  ];

  let stopEtas;
  let etaSource: 'mapbox' | 'straight_line' = 'straight_line';

  if (MAPBOX_ACCESS_TOKEN) {
    try {
      const directionsUrl = buildDirectionsUrl({
        accessToken: MAPBOX_ACCESS_TOKEN,
        driverPosition: { lat: body.lat, lng: body.lng },
        remainingStops,
      });

      const directionsRes = await fetch(directionsUrl);
      const directions = (await directionsRes.json()) as DirectionsResponse;
      stopEtas = computeStopEtas(remainingStops, directions);
      etaSource = 'mapbox';
    } catch (err) {
      console.warn('[update-eta] Mapbox falló; usando ETA por distancia recta', (err as Error).message);
    }
  }

  stopEtas ??= computeStraightLineStopEtas({
    driverPosition: { lat: body.lat, lng: body.lng },
    remainingStops,
  });

  const { error: upsertError } = await admin.from('trip_stop_eta').upsert(
    stopEtas.map((s) => ({
      trip_id: trip.id,
      student_id: s.studentId,
      eta_seconds: s.etaSeconds,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'trip_id,student_id' }
  );
  if (upsertError) return json({ error: 'upsert_failed', detail: upsertError.message }, 500);

  // Cualquier ETA de un alumno que ya no es el destino se borra, para que el
  // apoderado de otro niño no vea minutos de un recorrido que no va hacia él.
  await admin.from('trip_stop_eta').delete().eq('trip_id', trip.id).neq('student_id', targetId);

  const { data: approachingEvents, error: approachingError } = await admin
    .from('trip_events')
    .select('student_id')
    .eq('trip_id', trip.id)
    .eq('kind', 'approaching');
  if (approachingError) return json({ error: 'lookup_failed', detail: approachingError.message }, 500);

  const alreadyNotified = new Set((approachingEvents ?? []).map((e) => e.student_id as string));
  const newlyApproaching = studentsNewlyApproaching(stopEtas, alreadyNotified);

  if (newlyApproaching.length > 0) {
    // Este insert es lo que un trigger (fuera del alcance del MVP, ver
    // docs/ARQUITECTURA.md) convierte en push "El furgón de X está cerca".
    // Se inserta de a uno porque el índice unique de approaching es parcial;
    // PostgREST no puede resolver un upsert limpio contra ese índice. Si dos
    // ticks compiten, ignoramos 23505 y el resto de alumnos sigue notificándose.
    for (const studentId of newlyApproaching) {
      const { error: approachingInsertError } = await admin.from('trip_events').insert({
        trip_id: trip.id,
        student_id: studentId,
        kind: 'approaching',
      });

      if (approachingInsertError && approachingInsertError.code !== '23505') {
        return json({ error: 'approaching_insert_failed', detail: approachingInsertError.message }, 500);
      }
    }
  }

  return json({ ok: true, eta_source: etaSource, stops_updated: stopEtas.length, newly_approaching: newlyApproaching });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
