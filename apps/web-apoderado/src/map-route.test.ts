import { describe, expect, it } from 'vitest';
import { remainingRoutePoints } from './map-route';

describe('remainingRoutePoints', () => {
  it('recorta el tramo ya recorrido y comienza exactamente en el furgón', () => {
    const points: [number, number][] = [
      [-33.45, -70.70],
      [-33.46, -70.71],
      [-33.47, -70.72],
      [-33.48, -70.73],
    ];

    expect(remainingRoutePoints(points, [-33.46999, -70.72001], [-33.48, -70.73])).toEqual([
      [-33.46999, -70.72001],
      [-33.48, -70.73],
    ]);
  });

  it('usa una línea directa cuando no hay geometría válida', () => {
    expect(remainingRoutePoints([], [-33.47, -70.72], [-33.48, -70.73])).toEqual([
      [-33.47, -70.72],
      [-33.48, -70.73],
    ]);
  });
});
