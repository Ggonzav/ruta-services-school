// ============================================================================
// Lógica pura de la web del apoderado: cómo leer un ETA en pantalla y cómo
// convertir la lista cruda de trip_events en la línea de tiempo de la
// pantalla 8 ("Recorrido iniciado" → "Furgón cerca" → "Subió" → "Llegó").
//
// Sin DOM, sin Supabase acá: src/app.ts sólo llama estas funciones y pinta
// el resultado. Así se puede testear con Vitest en Node sin un navegador.
// ============================================================================

export interface TripEventRow {
  kind: 'started' | 'approaching' | 'picked_up' | 'skipped' | 'dropped_off' | 'finished';
  student_id: string | null;
  created_at: string;
}

export interface TimelineStep {
  key: 'started' | 'approaching' | 'boarded' | 'arrived';
  label: string;
  done: boolean;
  time: string | null; // HH:MM, o null si todavía no pasó
}

/**
 * Arma las 4 filas fijas de la línea de tiempo para UN alumno, a partir de
 * los eventos que RLS ya filtró (generales del trip + los de ese alumno).
 * "boarded" usa 'picked_up' o 'skipped' — cualquiera de los dos cierra esa
 * etapa (si no viaja, no tiene sentido seguir esperando que "suba").
 */
export function buildTimeline(
  events: TripEventRow[],
  studentId: string,
  studentFirstName: string,
  direction: RouteDirection = 'to_school'
): TimelineStep[] {
  const find = (kind: TripEventRow['kind'], scopedToStudent: boolean) =>
    events.find((e) => e.kind === kind && (!scopedToStudent || e.student_id === studentId));

  const started = find('started', false);
  const approaching = find('approaching', true);
  const isToSchool = direction === 'to_school';
  const boarded = (isToSchool ? find('picked_up', true) : find('dropped_off', true)) ?? find('skipped', true);
  const droppedOff = find('dropped_off', true);
  const boardedIsSkip = boarded?.kind === 'skipped';
  const arrived = boardedIsSkip ? undefined : isToSchool ? find('finished', false) : find('finished', false) ?? droppedOff;

  return [
    { key: 'started', label: 'Recorrido iniciado', done: !!started, time: timeOf(started) },
    {
      key: 'approaching',
      label: isToSchool ? 'Furgón cerca de tu casa' : 'Tu hijo está llegando a casa',
      done: !!approaching,
      time: timeOf(approaching),
    },
    {
      key: 'boarded',
      label: boardedIsSkip
        ? `${studentFirstName} no viajó hoy`
        : isToSchool
          ? `${studentFirstName} subió al furgón`
          : `${studentFirstName} bajó del furgón`,
      done: !!boarded,
      time: timeOf(boarded),
    },
    {
      key: 'arrived',
      label: isToSchool ? `${studentFirstName} llegó al colegio` : `${studentFirstName} llegó a casa`,
      done: !!arrived,
      time: timeOf(arrived),
    },
  ];
}

export type BoardingStatus = 'waiting_pickup' | 'on_board' | 'arrived';

/**
 * Estado del alumno según lo que registró el conductor, para mostrarlo al
 * apoderado mientras el furgón atiende otras paradas: "Esperando retiro"
 * (ida, antes de subir), "A bordo" (en el furgón) o "Llegó" (ya bajó / no
 * viajó). No depende del orden de las paradas.
 */
export function boardingStatus(
  events: TripEventRow[],
  studentId: string,
  direction: RouteDirection
): BoardingStatus {
  const has = (kind: TripEventRow['kind']) => events.some((e) => e.kind === kind && e.student_id === studentId);
  if (has('dropped_off') || has('skipped')) return 'arrived';
  if (direction === 'to_school') return has('picked_up') ? 'on_board' : 'waiting_pickup';
  // Vuelta: el alumno sube en el colegio, va a bordo hasta que baja.
  return 'on_board';
}

export function boardingStatusLabel(status: BoardingStatus, direction: RouteDirection): string {
  if (status === 'on_board') return 'A bordo';
  if (status === 'waiting_pickup') return 'Esperando retiro';
  return direction === 'to_school' ? 'Llegó al colegio' : 'Llegó a casa';
}

function timeOf(event: TripEventRow | undefined): string | null {
  if (!event) return null;
  const d = new Date(event.created_at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "6 min", "menos de 1 min", "—" — misma regla que usa la app del conductor. */
export function formatEtaMinutes(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || Number.isNaN(etaSeconds)) return '—';
  if (etaSeconds < 0) return '—';
  const minutes = Math.round(etaSeconds / 60);
  if (minutes <= 0) return 'menos de 1 min';
  return `${minutes} min`;
}

/**
 * Progreso de 0 a 1 para la barra visual bajo el ETA. No pretende ser una
 * distancia real (no tenemos coordenadas acá, a propósito): es sólo una
 * señal de "se está achicando", así que la curva es no lineal: se mueve
 * rápido cerca del final para que los últimos minutos se sientan vivos.
 */
export function etaProgressRatio(etaSeconds: number, etaAtStartSeconds: number): number {
  if (etaAtStartSeconds <= 0) return 1;
  const raw = 1 - etaSeconds / etaAtStartSeconds;
  return Math.min(1, Math.max(0, raw));
}

export type ConnectionState = 'connecting' | 'live' | 'stale' | 'ended';

/**
 * ¿Qué le decimos al apoderado sobre la frescura del dato? Un ETA que no
 * se actualiza hace rato probablemente significa que el conductor perdió
 * señal o cerró la app sin finalizar — mejor decir "no se actualiza" que
 * mostrar un "6 min" mintiendo desde hace 10 minutos.
 */
export function connectionState(params: {
  tripStatus: 'scheduled' | 'in_progress' | 'finished' | 'canceled' | null;
  lastEtaUpdatedAt: string | null;
  nowMs: number;
  staleAfterMs?: number;
}): ConnectionState {
  const { tripStatus, lastEtaUpdatedAt, nowMs, staleAfterMs = 90_000 } = params;
  if (tripStatus === 'finished' || tripStatus === 'canceled') return 'ended';
  if (!lastEtaUpdatedAt) return 'connecting';
  const age = nowMs - new Date(lastEtaUpdatedAt).getTime();
  return age > staleAfterMs ? 'stale' : 'live';
}
import type { RouteDirection } from '../../../shared/rutasegura-api';
