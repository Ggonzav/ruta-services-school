import type { SettledKind, Stop } from './tripLogic';

export type TripMapStopStatus = 'next' | 'pending' | 'completed' | 'skipped';

export type TripMapStop = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  address: string;
  number: number;
  status: TripMapStopStatus;
};

export type TripMapMarkerKind = 'vehicle' | 'school' | TripMapStopStatus;

export const tripMapMarkerVisuals = {
  vehicle: { icon: 'bus-pin', color: '#ffb703', detail: '#1b2a5b' },
  school: { icon: 'school', color: '#7656a7' },
  next: { icon: 'house-number', color: '#f28c28', label: 'Próxima parada' },
  pending: { icon: 'house-number', color: '#2f80ed', label: 'Pendiente' },
  completed: { icon: 'house-check', color: '#17a05a', label: 'Completada' },
  skipped: { icon: 'house-number', color: '#8b93a6', label: 'Omitida' },
} as const;

export function markerKindForEvent(event?: SettledKind, isTarget = false): TripMapStopStatus {
  if (event === 'skipped') return 'skipped';
  if (event === 'picked_up' || event === 'dropped_off') return 'completed';
  return isTarget ? 'next' : 'pending';
}

export function buildTripMapStops(
  stops: Stop[],
  events: ReadonlyMap<string, SettledKind>,
  targetId: string | null
): TripMapStop[] {
  return [...stops]
    .sort((a, b) => a.seq - b.seq)
    .filter((stop): stop is Stop & { lat: number; lng: number } => stop.lat != null && stop.lng != null)
    .map((stop) => ({
      id: stop.studentId,
      lat: stop.lat,
      lng: stop.lng,
      label: stop.fullName,
      address: stop.address,
      number: stop.seq,
      status: markerKindForEvent(events.get(stop.studentId), stop.studentId === targetId),
    }));
}

export function markerIconName(kind: TripMapMarkerKind): 'bus-pin' | 'school' | 'house-number' | 'house-check' {
  return tripMapMarkerVisuals[kind].icon;
}
