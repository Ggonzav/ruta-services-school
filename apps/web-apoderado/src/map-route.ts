export type MapPoint = [number, number];

/**
 * Deja únicamente la parte de la geometría que falta desde la posición actual.
 * Mapbox puede ajustar el origen a una calle o devolver una geometría que
 * comienza antes del GPS; la línea visible siempre debe nacer en el furgón.
 */
export function remainingRoutePoints(
  geometry: MapPoint[],
  vehicle: MapPoint,
  destination: MapPoint,
): MapPoint[] {
  const valid = geometry.filter(isFinitePoint);
  if (valid.length === 0) return [vehicle, destination];

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  valid.forEach((point, index) => {
    const distance = squaredDistance(point, vehicle);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  const remaining = [vehicle, ...valid.slice(closestIndex + 1)];
  if (squaredDistance(remaining[remaining.length - 1], destination) > 1e-12) remaining.push(destination);
  return remaining;
}

function isFinitePoint(point: MapPoint): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function squaredDistance(a: MapPoint, b: MapPoint): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}
