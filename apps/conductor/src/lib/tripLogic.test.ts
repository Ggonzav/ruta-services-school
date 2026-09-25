import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatEtaMinutes,
  nextPendingStop,
  shouldSendPosition,
  tripProgress,
  upcomingStops,
  type Stop,
} from './tripLogic.js';

const stops: Stop[] = [
  { studentId: 'martina', seq: 1, fullName: 'Martina R.', address: 'Los Aromos 1420' },
  { studentId: 'benjamin', seq: 2, fullName: 'Benjamín T.', address: 'Los Cedros 88' },
  { studentId: 'emilia', seq: 3, fullName: 'Emilia S.', address: 'Las Encinas 2310' },
];

describe('nextPendingStop', () => {
  it('devuelve la primera parada por seq cuando nadie está resuelto', () => {
    expect(nextPendingStop(stops, new Set())?.studentId).toBe('martina');
  });

  it('salta a la siguiente cuando la primera ya subió', () => {
    expect(nextPendingStop(stops, new Set(['martina']))?.studentId).toBe('benjamin');
  });

  it('devuelve null cuando ya no queda nadie pendiente', () => {
    expect(nextPendingStop(stops, new Set(['martina', 'benjamin', 'emilia']))).toBeNull();
  });

  it('ignora el orden de inserción del Set: siempre respeta seq', () => {
    // benjamin resuelto pero antes que martina en el set no debería importar
    const result = nextPendingStop(stops, new Set(['benjamin']));
    expect(result?.studentId).toBe('martina');
  });
});

describe('upcomingStops', () => {
  it('excluye a la parada actual y a los ya resueltos, en orden', () => {
    const result = upcomingStops(stops, new Set(['martina']), 'benjamin');
    expect(result.map((s) => s.studentId)).toEqual(['emilia']);
  });
});

describe('tripProgress', () => {
  it('cuenta cuántos van resueltos sobre el total', () => {
    expect(tripProgress(stops, new Set(['martina']))).toEqual({
      done: 1,
      total: 3,
      allSettled: false,
    });
  });

  it('allSettled es true sólo cuando TODOS tienen evento terminal', () => {
    expect(tripProgress(stops, new Set(['martina', 'benjamin', 'emilia'])).allSettled).toBe(true);
  });

  it('una ruta vacía nunca está "allSettled" (no hay nada que finalizar)', () => {
    expect(tripProgress([], new Set()).allSettled).toBe(false);
  });
});

describe('formatEtaMinutes', () => {
  it('redondea segundos a minutos enteros', () => {
    expect(formatEtaMinutes(365)).toBe('6 min');
    expect(formatEtaMinutes(330)).toBe('6 min');
  });

  it('bajo el minuto dice "menos de 1 min" en vez de "0 min"', () => {
    expect(formatEtaMinutes(20)).toBe('menos de 1 min');
  });

  it('sin dato todavía muestra un guión, no "0 min" ni NaN', () => {
    expect(formatEtaMinutes(null)).toBe('—');
    expect(formatEtaMinutes(undefined)).toBe('—');
    expect(formatEtaMinutes(Number.NaN)).toBe('—');
  });
});

describe('shouldSendPosition', () => {
  it('la primera vez (sin envío previo) siempre manda', () => {
    expect(shouldSendPosition(null, Date.now())).toBe(true);
  });

  it('no manda antes de cumplirse el intervalo mínimo', () => {
    const now = 1_000_000;
    expect(shouldSendPosition(now - 10_000, now, 30_000)).toBe(false);
  });

  it('manda apenas se cumple el intervalo', () => {
    const now = 1_000_000;
    expect(shouldSendPosition(now - 30_000, now, 30_000)).toBe(true);
  });
});

describe('formatDuration', () => {
  it('redondea hacia arriba: nunca "0 min"', () => {
    const start = new Date('2026-01-01T07:31:00Z');
    const end = new Date('2026-01-01T07:31:20Z');
    expect(formatDuration(start, end)).toBe('1 min');
  });

  it('un recorrido de 52 minutos exactos se lee "52 min"', () => {
    const start = new Date('2026-01-01T07:31:00Z');
    const end = new Date('2026-01-01T08:23:00Z');
    expect(formatDuration(start, end)).toBe('52 min');
  });
});
