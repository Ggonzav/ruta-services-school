// ============================================================================
// Edge Function: update-eta
//
// La llama el teléfono del conductor cada 30–45 segundos mientras un
// recorrido está "in_progress". Recibe la posición actual, la manda a
// Mapbox y guarda sólo la ÚLTIMA ubicación del furgón por recorrido en
// trip_vehicle_location, sin historial. Esa coordenada se borra al finalizar
// y RLS sólo la expone a apoderados de ese recorrido cuando está fresca. El
// ETA se guarda mediante una RPC privada que valida el destino y su revisión
// bajo bloqueo antes de persistir ETA y generar el evento approaching.
//
// Deploy: supabase functions deploy update-eta
// Config: supabase secrets set MAPBOX_ACCESS_TOKEN=...
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildDirectionsUrl,
  computeStopEtas,
  computeStraightLineStopEtas,
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
    .select('id, route_id, status')
    .eq('id', body.trip_id)
    .maybeSingle();

  if (tripError) return json({ error: 'lookup_failed', detail: tripError.message }, 500);
  if (!trip) return json({ error: 'trip_not_found_or_not_yours' }, 404);
  if (trip.status !== 'in_progress') return json({ error: 'trip_not_in_progress' }, 409);

  // La service role persiste GPS y calcula el ETA exclusivamente al destino
  // elegido; la RPC de persistencia vuelve a validar la revisión del destino.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: target, error: targetError } = await callerClient.rpc('driver_get_target', {
    p_trip_id: trip.id,
  });
  if (targetError) return json({ error: 'target_lookup_failed' }, 500);
  const targetId: string | null = target?.studentId ?? null;
  const targetRevision: number = target?.revision ?? 0;

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

  // Selection RPC clears obsolete ETAs; an old GPS request must never delete
  // an ETA saved by a newer destination generation.
  if (!targetId) return json({ ok: true, target: null, stops_updated: 0 });

  const { data: stops, error: stopsError } = await admin
    .from('route_stops')
    .select('student_id, seq, lat, lng')
    .eq('route_id', trip.route_id)
    .eq('student_id', targetId);
  if (stopsError) return json({ error: 'lookup_failed', detail: stopsError.message }, 500);

  const targetStop = (stops ?? [])[0];
  if (!targetStop) {
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

  const eta = stopEtas[0];
  const { data: saved, error: saveError } = await admin.rpc('persist_target_eta', {
    p_trip_id: trip.id,
    p_student_id: targetId,
    p_revision: targetRevision,
    p_eta_seconds: eta.etaSeconds,
    p_distance_meters: eta.distanceMeters,
  });
  if (saveError) return json({ error: 'eta_persist_failed' }, 500);
  return json({ ok: true, eta_source: etaSource, stops_updated: saved ? 1 : 0, stale: !saved });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
