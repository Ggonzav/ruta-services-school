// ============================================================================
// Lógica pura del recorrido del conductor: qué parada sigue, cuánto llevamos
// avanzado, cómo se lee un ETA en pantalla, cada cuánto mandar el GPS.
//
// Deliberadamente sin nada de React Native / Expo / Supabase acá: son
// funciones puras (entrada → salida) para poder testearlas con Vitest en
// Node, igual que supabase/functions/update-eta/eta-logic.ts. La pantalla
// (app/(driver)/trip.tsx) sólo las llama.
// ============================================================================

export interface Stop {
  studentId: string;
  seq: number;
  fullName: string;
  address: string;
}

export type SettledKind = 'picked_up' | 'skipped' | 'dropped_off';

/**
 * La siguiente parada pendiente, en el orden en que el conductor las
 * recorre (seq). null cuando ya no queda ninguna: momento de habilitar
 * "Finalizar recorrido".
 */
export function nextPendingStop(stops: Stop[], settledStudentIds: ReadonlySet<string>): Stop | null {
  const pending = stops
    .filter((s) => !settledStudentIds.has(s.studentId))
    .sort((a, b) => a.seq - b.seq);
  return pending[0] ?? null;
}

/** Las paradas después de la actual, para la lista "Después" en pantalla. */
export function upcomingStops(
  stops: Stop[],
  settledStudentIds: ReadonlySet<string>,
  excludingStudentId: string
): Stop[] {
  return stops
    .filter((s) => !settledStudentIds.has(s.studentId) && s.studentId !== excludingStudentId)
    .sort((a, b) => a.seq - b.seq);
}

export interface TripProgress {
  done: number;
  total: number;
  /** true cuando cada alumno tiene un evento terminal (subió/no viaja/llegó). */
  allSettled: boolean;
}

export function tripProgress(stops: Stop[], settledStudentIds: ReadonlySet<string>): TripProgress {
  const total = stops.length;
  const done = stops.filter((s) => settledStudentIds.has(s.studentId)).length;
  return { done, total, allSettled: total > 0 && done === total };
}

/**
 * "6 min", "menos de 1 min", "—" si todavía no hay dato. El conductor no
 * ve esto (es la pantalla del apoderado), pero se usa también en el
 * resumen de fin de recorrido y comparte la misma regla de redondeo.
 */
export function formatEtaMinutes(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || Number.isNaN(etaSeconds)) return '—';
  if (etaSeconds < 0) return '—';
  const minutes = Math.round(etaSeconds / 60);
  if (minutes <= 0) return 'menos de 1 min';
  return `${minutes} min`;
}

/**
 * ¿Toca mandar la posición ahora? El conductor no debería drenar batería
 * mandando GPS cada segundo, ni la pantalla de "en vivo" necesita más
 * resolución que esto. Pura por diseño: backgroundLocation.ts sólo la
 * consulta antes de hacer el fetch real.
 */
export function shouldSendPosition(
  lastSentAtMs: number | null,
  nowMs: number,
  minIntervalMs = 30_000
): boolean {
  if (lastSentAtMs == null) return true;
  return nowMs - lastSentAtMs >= minIntervalMs;
}

/**
 * Duración legible del recorrido para la pantalla de cierre ("52 min").
 * Redondea hacia arriba: un recorrido de 30 segundos igual cuenta como
 * "1 min", nunca "0 min".
 */
export function formatDuration(startedAt: Date, endedAt: Date): string {
  const ms = Math.max(0, endedAt.getTime() - startedAt.getTime());
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${minutes} min`;
}
