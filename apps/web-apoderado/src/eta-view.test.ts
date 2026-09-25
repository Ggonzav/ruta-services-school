import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  connectionState,
  etaProgressRatio,
  formatEtaMinutes,
  type TripEventRow,
} from './eta-view.js';

describe('buildTimeline', () => {
  it('sin ningún evento, las 4 etapas están pendientes', () => {
    const steps = buildTimeline([], 'martina', 'Martina');
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(steps.map((s) => s.key)).toEqual(['started', 'approaching', 'boarded', 'arrived']);
  });

  it('marca "subió" con picked_up y usa el nombre en el label', () => {
    const events: TripEventRow[] = [
      { kind: 'started', student_id: null, created_at: '2026-01-01T07:31:00' },
      { kind: 'approaching', student_id: 'martina', created_at: '2026-01-01T07:38:00' },
      { kind: 'picked_up', student_id: 'martina', created_at: '2026-01-01T07:43:00' },
    ];
    const steps = buildTimeline(events, 'martina', 'Martina');
    const boarded = steps.find((s) => s.key === 'boarded')!;
    expect(boarded.done).toBe(true);
    expect(boarded.label).toBe('Martina subió al furgón');
    expect(boarded.time).toBe('07:43');
  });

  it('si el alumno no viajó (skipped), el label lo dice y no marca llegada por el cierre general', () => {
    const events: TripEventRow[] = [
      { kind: 'skipped', student_id: 'martina', created_at: '2026-01-01T07:20:00' },
      { kind: 'finished', student_id: null, created_at: '2026-01-01T08:04:00' },
    ];
    const steps = buildTimeline(events, 'martina', 'Martina');
    const boarded = steps.find((s) => s.key === 'boarded')!;
    const arrived = steps.find((s) => s.key === 'arrived')!;
    expect(boarded.done).toBe(true);
    expect(boarded.label).toBe('Martina no viajó hoy');
    expect(arrived.done).toBe(false);
  });

  it('un evento "approaching" de OTRO alumno no marca la etapa (RLS ya debería haberlo filtrado, pero la vista es defensiva)', () => {
    const events: TripEventRow[] = [
      { kind: 'approaching', student_id: 'benjamin', created_at: '2026-01-01T07:38:00' },
    ];
    const steps = buildTimeline(events, 'martina', 'Martina');
    expect(steps.find((s) => s.key === 'approaching')!.done).toBe(false);
  });

  it('"llegada" acepta dropped_off del alumno o finished general del recorrido', () => {
    const events: TripEventRow[] = [
      { kind: 'finished', student_id: null, created_at: '2026-01-01T08:04:00' },
    ];
    const steps = buildTimeline(events, 'martina', 'Martina');
    expect(steps.find((s) => s.key === 'arrived')!.done).toBe(true);
  });
});

describe('formatEtaMinutes', () => {
  it('redondea y evita "0 min"', () => {
    expect(formatEtaMinutes(365)).toBe('6 min');
    expect(formatEtaMinutes(20)).toBe('menos de 1 min');
    expect(formatEtaMinutes(null)).toBe('—');
  });
});

describe('etaProgressRatio', () => {
  it('a mitad de camino da 0.5', () => {
    expect(etaProgressRatio(300, 600)).toBeCloseTo(0.5);
  });

  it('nunca pasa de 1 ni baja de 0', () => {
    expect(etaProgressRatio(-50, 600)).toBeLessThanOrEqual(1);
    expect(etaProgressRatio(9999, 600)).toBeGreaterThanOrEqual(0);
  });

  it('si el ETA inicial es 0 (dato raro), no divide por cero', () => {
    expect(etaProgressRatio(0, 0)).toBe(1);
  });
});

describe('connectionState', () => {
  const now = new Date('2026-01-01T07:40:00Z').getTime();

  it('recorrido finalizado es "ended" sin importar el ETA', () => {
    expect(
      connectionState({ tripStatus: 'finished', lastEtaUpdatedAt: null, nowMs: now })
    ).toBe('ended');
  });

  it('sin ETA todavía es "connecting"', () => {
    expect(
      connectionState({ tripStatus: 'in_progress', lastEtaUpdatedAt: null, nowMs: now })
    ).toBe('connecting');
  });

  it('un ETA fresco es "live"', () => {
    const lastEtaUpdatedAt = new Date(now - 20_000).toISOString();
    expect(connectionState({ tripStatus: 'in_progress', lastEtaUpdatedAt, nowMs: now })).toBe('live');
  });

  it('un ETA viejo (>90s por defecto) es "stale", no "live" mintiendo', () => {
    const lastEtaUpdatedAt = new Date(now - 200_000).toISOString();
    expect(connectionState({ tripStatus: 'in_progress', lastEtaUpdatedAt, nowMs: now })).toBe('stale');
  });
});
