import type { SupabaseClient } from '@supabase/supabase-js';
import type { TripEventRow } from './eta-view';
import { tripClock } from '../../../shared/trip-clock';
import { directionForKind, type RouteDirection, type RouteKind } from '../../../shared/rutasegura-api';

export type TripStatus = 'scheduled' | 'in_progress' | 'finished' | 'canceled' | null;
export interface TripSnapshot {
  tripId: string | null;
  direction: RouteDirection;
  status: TripStatus;
  etaSeconds: number | null;
  updatedAt: string | null;
  events: TripEventRow[];
  map: TripMapSnapshot | null;
}

export interface TripMapSnapshot {
  vehicle: { lat: number; lng: number; updatedAt: string } | null;
  stop: { lat: number; lng: number; address: string };
  school: { lat: number; lng: number; name: string };
}

export async function fetchTripSnapshot(
  client: SupabaseClient, studentId: string, now = new Date(),
): Promise<TripSnapshot> {
  const { date, kind } = tripClock(now);
  const empty: TripSnapshot = { tripId: null, direction: directionForKind(kind), status: null, etaSeconds: null, updatedAt: null, events: [], map: null };
  const { data: stops, error: stopsError } = await client.from('route_stops')
    .select('route_id, lat, lng, address, routes!inner(kind, school_lat, school_lng, school_name)')
    .eq('student_id', studentId).eq('routes.kind', kind);
  if (stopsError) throw stopsError;
  if (!stops?.length) return empty;

  const { data: trip, error: tripError } = await client.from('trips')
    .select('id, status').in('route_id', stops.map((s) => s.route_id))
    .eq('trip_date', date).order('started_at', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  if (tripError) throw tripError;
  if (!trip) return empty;

  const { data: events, error: eventsError } = await client.from('trip_events')
    .select('kind, student_id, created_at').eq('trip_id', trip.id)
    .or(`student_id.is.null,student_id.eq.${studentId}`)
    .order('created_at', { ascending: true });
  if (eventsError) throw eventsError;

  const routeKind = (stops[0]?.routes as any)?.kind as RouteKind | undefined;
  const stop = stops[0] as any;
  const result: TripSnapshot = {
    ...empty,
    tripId: trip.id,
    direction: directionForKind(routeKind ?? kind),
    status: trip.status,
    events: events ?? [],
    map: stop
      ? {
          vehicle: null,
          stop: { lat: stop.lat, lng: stop.lng, address: stop.address },
          school: { lat: stop.routes.school_lat, lng: stop.routes.school_lng, name: stop.routes.school_name },
        }
      : null,
  };
  if (trip.status !== 'in_progress') return result;
  const { data: eta, error: etaError } = await client.from('trip_stop_eta')
    .select('eta_seconds, updated_at').eq('trip_id', trip.id)
    .eq('student_id', studentId).maybeSingle();
  if (etaError) throw etaError;
  const { data: vehicleLocation, error: vehicleError } = await client.from('trip_vehicle_location')
    .select('lat, lng, updated_at').eq('trip_id', trip.id).maybeSingle();
  if (vehicleError) throw vehicleError;

  return {
    ...result,
    etaSeconds: eta?.eta_seconds ?? null,
    updatedAt: eta?.updated_at ?? null,
    map: result.map
      ? {
          ...result.map,
          vehicle: vehicleLocation
            ? { lat: vehicleLocation.lat, lng: vehicleLocation.lng, updatedAt: vehicleLocation.updated_at }
            : null,
        }
      : null,
  };
}
