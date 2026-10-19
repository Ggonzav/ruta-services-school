import { tripClock } from '../../../../shared/trip-clock';
import { directionForKind, type RouteDirection, type RouteKind, type TripStatus } from '../../../../shared/rutasegura-api';
// ============================================================================
// Capa fina sobre Supabase: cada función es una consulta o un RPC de
// supabase/migrations, sin lógica propia (la lógica vive en tripLogic.ts,
// que sí se testea). Las pantallas llaman esto, nunca a `supabase` directo,
// así el punto de contacto con el backend queda en un solo lugar.
// ============================================================================

import { supabase } from './supabase';
import type { Stop } from './tripLogic';

export interface TodayRoute {
  routeId: string;
  kind: RouteKind;
  direction: RouteDirection;
  name: string;
  departureTime: string;
  schoolName: string;
  vehicleNickname: string;
  stops: Stop[];
  /** null si el recorrido de hoy todavía no se creó (se crea al iniciar). */
  tripId: string | null;
  tripStatus: TripStatus;
}

/**
 * La ruta (AM o PM, según la hora del día) del primer vehículo del
 * transportista logueado. El MVP asume un vehículo por transportista; con
 * varios, esto sería un selector antes de esta pantalla.
 */
export async function fetchTodayRoute(kind: RouteKind): Promise<TodayRoute | null> {
  const { data: carrier } = await supabase
    .from('carriers')
    .select('id')
    .single();
  if (!carrier) return null;

  const { data: route } = await supabase
    .from('routes')
    .select('id, name, departure_time, school_name, vehicles!inner(nickname, carrier_id)')
    .eq('kind', kind)
    .eq('vehicles.carrier_id', carrier.id)
    .maybeSingle();
  if (!route) return null;

  const { data: stopsRows } = await supabase
    .from('route_stops')
    .select('student_id, seq, address, students(full_name)')
    .eq('route_id', route.id)
    .order('seq', { ascending: true });

  const stops: Stop[] = (stopsRows ?? []).map((r: any) => ({
    studentId: r.student_id,
    seq: r.seq,
    address: r.address,
    fullName: r.students?.full_name ?? '(sin nombre)',
  }));

  const { data: trip } = await supabase
    .from('trips')
    .select('id, status')
    .eq('route_id', route.id)
    .eq('trip_date', tripClock().date)
    .maybeSingle();

  return {
    routeId: route.id,
    kind,
    direction: directionForKind(kind),
    name: route.name,
    departureTime: route.departure_time,
    schoolName: route.school_name,
    vehicleNickname: (route as any).vehicles?.nickname ?? '',
    stops,
    tripId: trip?.id ?? null,
    tripStatus: trip?.status ?? null,
  };
}

export async function startTrip(routeId: string): Promise<{ tripId: string }> {
  const { data, error } = await supabase.rpc('driver_start_trip', { p_route_id: routeId, p_trip_date: tripClock().date });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { tripId: row.tripId };
}

export async function markStop(
  tripId: string,
  studentId: string,
  action: 'completed' | 'absent'
): Promise<{ event: 'picked_up' | 'dropped_off' | 'skipped'; direction: RouteDirection }> {
  const { data, error } = await supabase.rpc('driver_mark_stop', {
    p_trip_id: tripId,
    p_student_id: studentId,
    p_action: action,
  });
  if (error) throw error;
  return { event: data.event, direction: data.direction };
}

/** El conductor declara a quién va ahora (o null para limpiar el destino). */
export async function setTarget(tripId: string, studentId: string | null): Promise<void> {
  const { error } = await supabase.rpc('driver_set_target', {
    p_trip_id: tripId,
    p_student_id: studentId,
  });
  if (error) throw error;
}

export async function recordStudentEvent(
  tripId: string,
  studentId: string,
  kind: 'picked_up' | 'skipped' | 'dropped_off'
): Promise<void> {
  await markStop(tripId, studentId, kind === 'skipped' ? 'absent' : 'completed');
}

export interface TripSummary {
  direction: RouteDirection;
  total: number;
  completed: number;
  absent: number;
  startedAt: string;
  endedAt: string;
}

export async function finishTrip(tripId: string): Promise<TripSummary> {
  const { data, error } = await supabase.rpc('driver_finish_trip', { p_trip_id: tripId });
  if (error) throw error;

  return {
    direction: data.direction,
    total: data.total,
    completed: data.completed,
    absent: data.absent,
    startedAt: data.startedAt,
    endedAt: data.endedAt,
  };
}

export async function updateLocation(input: { tripId: string; lat: number; lng: number }): Promise<void> {
  const { error } = await supabase.functions.invoke('update-eta', {
    body: { trip_id: input.tripId, lat: input.lat, lng: input.lng },
  });
  if (error) throw error;
}

/**
 * Crea (o reutiliza) la invitación de un alumno y arma el texto listo para
 * compartir por WhatsApp — pantalla 7 del prototipo visual.
 */
export async function createInviteLink(
  studentId: string,
  studentFirstName: string,
  webBaseUrl: string
): Promise<{ url: string; shareText: string }> {
  const { data: carrier, error: carrierError } = await supabase
    .from('carriers')
    .select('id')
    .single();
  if (carrierError) throw carrierError;

  const { data, error } = await supabase
    .from('invites')
    .insert({ student_id: studentId, carrier_id: carrier.id })
    .select('id')
    .single();
  if (error) throw error;

  const url = `${webBaseUrl}/i/${data.id}`;
  const shareText = `Hola! Te comparto el link para seguir el recorrido de ${studentFirstName}: ${url}`;
  return { url, shareText };
}

/** Destino privado, accesible únicamente al conductor dueño del recorrido. */
export async function getTarget(tripId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('driver_get_target', { p_trip_id: tripId });
  if (error) throw error;
  return data?.studentId ?? null;
}
