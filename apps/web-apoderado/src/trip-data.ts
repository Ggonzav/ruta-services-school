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

interface StopRow {
  route_id: string;
  lat: number;
  lng: number;
  address: string;
  routes: { kind: RouteKind; school_lat: number; school_lng: number; school_name: string };
}

interface TripRow {
  id: string;
  route_id: string;
  status: Exclude<TripStatus, null>;
  started_at?: string | null;
  created_at?: string | null;
}

export async function fetchTripSnapshot(
  client: SupabaseClient, studentId: string, now = new Date(),
): Promise<TripSnapshot> {
  const { date, kind: clockKind } = tripClock(now);
  const empty: TripSnapshot = { tripId: null, direction: directionForKind(clockKind), status: null, etaSeconds: null, updatedAt: null, events: [], map: null };

  const { data: stops, error: stopsError } = await client.from('route_stops')
    .select('route_id, lat, lng, address, routes!inner(kind, school_lat, school_lng, school_name)')
    .eq('student_id', studentId);
  if (stopsError) throw stopsError;
  if (!stops?.length) return empty;

  const stopRows = stops as unknown as StopRow[];
  const stopByRoute = new Map(stopRows.map((s) => [s.route_id, s]));

  const { data: trips, error: tripError } = await client.from('trips')
    .select('id, route_id, status, started_at, created_at')
    .in('route_id', stopRows.map((s) => s.route_id))
    .eq('trip_date', date)
    .order('started_at', { ascending: false, nullsFirst: false });
  if (tripError) throw tripError;

  const trip = selectRelevantTrip((trips ?? []) as TripRow[], stopByRoute, clockKind);
  if (!trip) return empty;

  const stop = stopByRoute.get(trip.route_id);
  const routeKind = stop?.routes.kind ?? clockKind;

  const { data: events, error: eventsError } = await client.from('trip_events')
    .select('kind, student_id, created_at').eq('trip_id', trip.id)
    .or(`student_id.is.null,student_id.eq.${studentId}`)
    .order('created_at', { ascending: true });
  if (eventsError) throw eventsError;

  const result: TripSnapshot = {
    ...empty,
    tripId: trip.id,
    direction: directionForKind(routeKind),
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
    .select('lat, lng, updated_at').eq('trip_id', trip.id)
    .gt('updated_at', new Date(Date.now() - 2 * 60_000).toISOString())
    .maybeSingle();
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

function selectRelevantTrip(
  trips: TripRow[],
  stopByRoute: Map<string, StopRow>,
  clockKind: RouteKind
): TripRow | null {
  const candidates = trips.filter((trip) => stopByRoute.has(trip.route_id));
  return (
    newest(candidates.filter((trip) => trip.status === 'in_progress'))
    ?? newest(candidates.filter((trip) => stopByRoute.get(trip.route_id)?.routes.kind === clockKind))
    ?? null
  );
}

function newest(trips: TripRow[]): TripRow | null {
  return [...trips].sort((a, b) => tripTime(b) - tripTime(a))[0] ?? null;
}

function tripTime(trip: TripRow): number {
  const value = trip.started_at ?? trip.created_at ?? '';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
