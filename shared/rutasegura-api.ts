export type RouteKind = 'AM' | 'PM';
export type RouteDirection = 'to_school' | 'to_home';

export function directionForKind(kind: RouteKind): RouteDirection {
  return kind === 'AM' ? 'to_school' : 'to_home';
}

export function kindForDirection(direction: RouteDirection): RouteKind {
  return direction === 'to_school' ? 'AM' : 'PM';
}

export function isToSchool(direction: RouteDirection): boolean {
  return direction === 'to_school';
}

export type TripStatus = 'scheduled' | 'in_progress' | 'finished' | 'canceled' | null;

