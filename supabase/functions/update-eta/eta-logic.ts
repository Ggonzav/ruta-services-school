// ============================================================================
// Lógica pura del cálculo de ETA. Sin red, sin Deno, sin Supabase: sólo
// funciones que reciben datos y devuelven datos, para poder testear con
// Vitest en Node sin levantar el runtime de Edge Functions.
//
// El wiring real (leer la posición que manda el teléfono, llamar a Mapbox,
// escribir en trip_stop_eta) vive en index.ts y usa estas funciones.
// ============================================================================

export interface LngLat {
  lng: number;
  lat: number;
}

export interface RemainingStop {
  studentId: string;
  seq: number;
  lng: number;
  lat: number;
}

export interface StopEta {
  studentId: string;
  etaSeconds: number;
  distanceMeters: number;
}

/** Distancia restante por debajo de la cual avisamos "furgón cerca". */
export const APPROACHING_THRESHOLD_METERS = 500;

/**
 * Arma la URL de la Directions API de Mapbox: la posición actual del
 * conductor + cada parada pendiente, EN EL ORDEN en que el conductor ya
 * las recorre (route_stops.seq). No usamos la Optimization API: el orden
 * lo define el conductor, no un solver — más simple y más barato.
 */
export function buildDirectionsUrl(params: {
  accessToken: string;
  driverPosition: LngLat;
  remainingStops: RemainingStop[];
  baseUrl?: string;
}): string {
  const { accessToken, driverPosition, remainingStops, baseUrl } = params;

  if (remainingStops.length === 0) {
    throw new Error('no_remaining_stops');
  }
  if (remainingStops.length > 24) {
    // Límite de waypoints de la Directions API de Mapbox (25, incluyendo
    // el origen). Un furgón escolar real no debería acercarse a esto,
    // pero lo dejamos explícito en vez de fallar con un 422 críptico.
    throw new Error('too_many_waypoints');
  }

  const coords = [driverPosition, ...remainingStops]
    .map((p) => `${p.lng},${p.lat}`)
    .join(';');

  const root = baseUrl ?? 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';
  const url = new URL(`${root}/${coords}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('geometries', 'geojson');
  return url.toString();
}

/** Forma mínima de la respuesta de Mapbox Directions que necesitamos. */
export interface DirectionsResponse {
  code: string;
  routes?: Array<{ legs: Array<{ duration: number; distance?: number }> }>;
  message?: string;
}

/**
 * Convierte la respuesta de Mapbox en ETAs acumulados por parada.
 * legs[0] = conductor → parada 1, legs[1] = parada 1 → parada 2, etc.
 * El ETA de la parada i es la suma de legs[0..i].
 */
export function computeStopEtas(
  remainingStops: RemainingStop[],
  directions: DirectionsResponse
): StopEta[] {
  if (directions.code !== 'Ok' || !directions.routes?.length) {
    throw new Error(`directions_failed:${directions.code}:${directions.message ?? ''}`);
  }

  const legs = directions.routes[0].legs;
  if (legs.length < remainingStops.length) {
    throw new Error('directions_legs_mismatch');
  }

  let cumulativeSeconds = 0;
  let cumulativeMeters = 0;
  return remainingStops.map((stop, i) => {
    cumulativeSeconds += legs[i].duration;
    cumulativeMeters += legs[i].distance ?? 0;
    return {
      studentId: stop.studentId,
      etaSeconds: Math.round(cumulativeSeconds),
      distanceMeters: Math.round(cumulativeMeters),
    };
  });
}

/**
 * Fallback MVP cuando Mapbox no está configurado o falla. Usa distancia
 * haversine acumulada y una velocidad promedio urbana. No reemplaza routing
 * real, pero mantiene viva la experiencia: ETA y aviso de cercanía.
 */
export function computeStraightLineStopEtas(params: {
  driverPosition: LngLat;
  remainingStops: RemainingStop[];
  averageSpeedKmh?: number;
}): StopEta[] {
  const { driverPosition, remainingStops, averageSpeedKmh = 25 } = params;
  const metersPerSecond = Math.max(1, (averageSpeedKmh * 1000) / 3600);
  let previous = driverPosition;
  let cumulativeMeters = 0;

  return remainingStops.map((stop) => {
    cumulativeMeters += haversineMeters(previous, stop);
    previous = stop;
    return {
      studentId: stop.studentId,
      etaSeconds: Math.max(30, Math.round(cumulativeMeters / metersPerSecond)),
      distanceMeters: Math.round(cumulativeMeters),
    };
  });
}

function haversineMeters(a: LngLat, b: LngLat): number {
  const earthRadiusMeters = 6_371_000;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

/**
 * De las paradas con ETA recién calculado, ¿cuál (si alguna) cruza el
 * umbral de "furgón cerca" por primera vez? Devuelve al MÁS PRÓXIMO que
 * aún no tenía el evento — nunca dispara dos veces para el mismo alumno
 * en el mismo recorrido.
 */
export function studentsNewlyApproaching(
  stopEtas: StopEta[],
  studentIdsAlreadyNotified: ReadonlySet<string>,
  thresholdMeters: number = APPROACHING_THRESHOLD_METERS
): string[] {
  return stopEtas
    .filter((s) => s.distanceMeters <= thresholdMeters && !studentIdsAlreadyNotified.has(s.studentId))
    .map((s) => s.studentId);
}
