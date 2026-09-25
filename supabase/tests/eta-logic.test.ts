import { describe, expect, it } from 'vitest';
import {
  APPROACHING_THRESHOLD_METERS,
  buildDirectionsUrl,
  computeStraightLineStopEtas,
  computeStopEtas,
  studentsNewlyApproaching,
  type DirectionsResponse,
  type RemainingStop,
} from '../functions/update-eta/eta-logic.js';

const remainingStops: RemainingStop[] = [
  { studentId: 'benjamin', seq: 2, lng: -70.64, lat: -33.43 },
  { studentId: 'sofia', seq: 4, lng: -70.6, lat: -33.4 },
];

describe('buildDirectionsUrl', () => {
  it('pone al conductor primero y las paradas después, en orden de seq', () => {
    const url = buildDirectionsUrl({
      accessToken: 'tok_123',
      driverPosition: { lng: -70.65, lat: -33.44 },
      remainingStops,
    });

    expect(url).toContain(
      '/directions/v5/mapbox/driving-traffic/-70.65,-33.44;-70.64,-33.43;-70.6,-33.4'
    );
    expect(url).toContain('access_token=tok_123');
  });

  it('rechaza una lista vacía de paradas en vez de pedirle una ruta sin destino a Mapbox', () => {
    expect(() =>
      buildDirectionsUrl({
        accessToken: 'tok',
        driverPosition: { lng: 0, lat: 0 },
        remainingStops: [],
      })
    ).toThrow('no_remaining_stops');
  });

  it('rechaza más de 24 paradas restantes (límite de la Directions API)', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      studentId: `s${i}`,
      seq: i,
      lng: 0,
      lat: 0,
    }));
    expect(() =>
      buildDirectionsUrl({ accessToken: 'tok', driverPosition: { lng: 0, lat: 0 }, remainingStops: many })
    ).toThrow('too_many_waypoints');
  });
});

describe('computeStopEtas', () => {
  it('acumula la duración de cada tramo: la 2ª parada suma su tramo + el anterior', () => {
    const directions: DirectionsResponse = {
      code: 'Ok',
      routes: [{ legs: [{ duration: 180, distance: 450 }, { duration: 240, distance: 1_200 }] }],
    };

    const etas = computeStopEtas(remainingStops, directions);

    expect(etas).toEqual([
      { studentId: 'benjamin', etaSeconds: 180, distanceMeters: 450 },
      { studentId: 'sofia', etaSeconds: 420, distanceMeters: 1650 },
    ]);
  });

  it('lanza un error legible si Mapbox no encontró ruta', () => {
    const directions: DirectionsResponse = { code: 'NoRoute', message: 'no route found' };
    expect(() => computeStopEtas(remainingStops, directions)).toThrow(/directions_failed:NoRoute/);
  });

  it('lanza un error si Mapbox devuelve menos tramos que paradas pedidas', () => {
    const directions: DirectionsResponse = { code: 'Ok', routes: [{ legs: [{ duration: 100 }] }] };
    expect(() => computeStopEtas(remainingStops, directions)).toThrow('directions_legs_mismatch');
  });
});

describe('computeStraightLineStopEtas', () => {
  it('calcula ETAs acumulados sin Mapbox para mantener vivo el MVP', () => {
    const etas = computeStraightLineStopEtas({
      driverPosition: { lng: -70.65, lat: -33.44 },
      remainingStops,
      averageSpeedKmh: 30,
    });

    expect(etas).toHaveLength(2);
    expect(etas[0].studentId).toBe('benjamin');
    expect(etas[0].etaSeconds).toBeGreaterThan(30);
    expect(etas[0].distanceMeters).toBeGreaterThan(0);
    expect(etas[1].etaSeconds).toBeGreaterThan(etas[0].etaSeconds);
    expect(etas[1].distanceMeters).toBeGreaterThan(etas[0].distanceMeters);
  });
});

describe('studentsNewlyApproaching', () => {
  it('avisa sólo a quien cruza el umbral y todavía no tenía el aviso', () => {
    const etas = [
      { studentId: 'benjamin', etaSeconds: 300, distanceMeters: 480 }, // dentro de 500m
      { studentId: 'sofia', etaSeconds: 120, distanceMeters: 900 }, // pocos minutos, pero todavía lejos
    ];
    const result = studentsNewlyApproaching(etas, new Set());
    expect(result).toEqual(['benjamin']);
  });

  it('no vuelve a avisar a quien ya tenía el evento "approaching"', () => {
    const etas = [{ studentId: 'benjamin', etaSeconds: 60, distanceMeters: 100 }];
    const result = studentsNewlyApproaching(etas, new Set(['benjamin']));
    expect(result).toEqual([]);
  });

  it('el umbral es configurable (por si el piloto pide ajustar los 500 metros)', () => {
    const etas = [{ studentId: 'benjamin', etaSeconds: 500, distanceMeters: 650 }];
    expect(studentsNewlyApproaching(etas, new Set())).toEqual([]); // > default 500m
    expect(studentsNewlyApproaching(etas, new Set(), 700)).toEqual(['benjamin']);
  });

  it('el umbral por defecto exportado es 500 metros', () => {
    expect(APPROACHING_THRESHOLD_METERS).toBe(500);
  });
});
