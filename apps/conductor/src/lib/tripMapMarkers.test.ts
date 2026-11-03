import { describe, expect, it } from 'vitest';
import type { Stop } from './tripLogic';
import { buildTripMapStops, markerIconName, markerKindForEvent, tripMapMarkerVisuals } from './tripMapMarkers';

const stops: Stop[] = [
  { studentId: 'b', seq: 2, fullName: 'Segundo', address: 'Casa 2', lat: -33.2, lng: -70.2 },
  { studentId: 'a', seq: 1, fullName: 'Primero', address: 'Casa 1', lat: -33.1, lng: -70.1 },
  { studentId: 'c', seq: 3, fullName: 'Sin coordenadas', address: 'Casa 3' },
];

describe('marcadores del recorrido', () => {
  it('conserva el número original aunque cambie el estado o el orden de entrada', () => {
    const result = buildTripMapStops(stops, new Map([['a', 'picked_up']]), 'b');

    expect(result.map(({ number, label, status }) => ({ number, label, status }))).toEqual([
      { number: 1, label: 'Primero', status: 'completed' },
      { number: 2, label: 'Segundo', status: 'next' },
    ]);
  });

  it('usa sólo estados reales: completada, omitida, próxima y pendiente', () => {
    expect(markerKindForEvent('picked_up')).toBe('completed');
    expect(markerKindForEvent('dropped_off')).toBe('completed');
    expect(markerKindForEvent('skipped')).toBe('skipped');
    expect(markerKindForEvent(undefined, true)).toBe('next');
    expect(markerKindForEvent()).toBe('pending');
  });

  it('selecciona íconos distintos para furgón, colegio, casa y completada', () => {
    expect(markerIconName('vehicle')).toBe('bus-pin');
    expect(markerIconName('school')).toBe('school');
    expect(markerIconName('next')).toBe('house-number');
    expect(markerIconName('pending')).toBe('house-number');
    expect(markerIconName('skipped')).toBe('house-number');
    expect(markerIconName('completed')).toBe('house-check');
    expect(tripMapMarkerVisuals.vehicle).toEqual({ icon: 'bus-pin', color: '#ffb703', detail: '#1b2a5b' });
    expect(tripMapMarkerVisuals.school).toEqual({ icon: 'school', color: '#7656a7' });
    expect(tripMapMarkerVisuals.next.color).toBe('#f28c28');
    expect(tripMapMarkerVisuals.pending.color).toBe('#2f80ed');
    expect(tripMapMarkerVisuals.completed).toMatchObject({ icon: 'house-check', color: '#17a05a' });
    expect(tripMapMarkerVisuals.skipped.color).toBe('#8b93a6');
  });
});
