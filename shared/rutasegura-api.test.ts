import { describe, expect, it } from 'vitest';
import { directionForKind, kindForDirection, type RouteKind } from './rutasegura-api';

describe('mapeo turno (AM/PM) <-> sentido (ida/vuelta)', () => {
  it('kindForDirection es el inverso exacto de directionForKind', () => {
    const kinds: RouteKind[] = ['AM', 'PM'];
    for (const kind of kinds) {
      expect(kindForDirection(directionForKind(kind))).toBe(kind);
    }
  });

  it('AM = ida al colegio, PM = vuelta a casa', () => {
    expect(kindForDirection('to_school')).toBe('AM');
    expect(kindForDirection('to_home')).toBe('PM');
  });
});
