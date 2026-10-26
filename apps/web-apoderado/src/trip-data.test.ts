import { expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { fetchTripSnapshot } from './trip-data';
import { buildTimeline } from './eta-view';

// Exercise actual PostgREST query serialization against a small HTTP fixture.
function clientFor(status = 'in_progress', hasTrip = true) {
  const rows: Record<string, any[]> = {
    route_stops: [
      {
        route_id: 'morning',
        student_id: 'child',
        lat: -33.43,
        lng: -70.64,
        address: 'Casa child',
        routes: { kind: 'AM', school_lat: -33.44, school_lng: -70.63, school_name: 'Colegio' },
        'routes.kind': 'AM',
      },
      {
        route_id: 'afternoon',
        student_id: 'child',
        lat: -33.43,
        lng: -70.64,
        address: 'Casa child',
        routes: { kind: 'PM', school_lat: -33.44, school_lng: -70.63, school_name: 'Colegio' },
        'routes.kind': 'PM',
      },
      {
        route_id: 'other',
        student_id: 'sibling',
        lat: -33.42,
        lng: -70.62,
        address: 'Casa sibling',
        routes: { kind: 'AM', school_lat: -33.44, school_lng: -70.63, school_name: 'Colegio' },
        'routes.kind': 'AM',
      },
    ],
    trips: [
      { id: 'yesterday', route_id: 'morning', trip_date: '2026-09-19', status: 'finished' },
      ...(hasTrip ? [{ id: 'today', route_id: 'morning', trip_date: '2026-09-20', status }] : []),
      { id: 'pm', route_id: 'afternoon', trip_date: '2026-09-20', status: 'finished' },
      { id: 'sibling-trip', route_id: 'other', trip_date: '2026-09-20', status: 'finished' },
    ],
    trip_events: [
      { trip_id: 'yesterday', student_id: null, kind: 'finished', created_at: '2026-09-19T12:00:00Z' },
      { trip_id: 'today', student_id: null, kind: 'started', created_at: '2026-09-20T11:00:00Z' },
      { trip_id: 'today', student_id: 'sibling', kind: 'picked_up', created_at: '2026-09-20T11:01:00Z' },
    ],
    trip_stop_eta: [
      { trip_id: 'yesterday', student_id: 'child', eta_seconds: 999, updated_at: '2026-09-19T12:00:00Z' },
      { trip_id: 'today', student_id: 'child', eta_seconds: 120, updated_at: '2026-09-20T11:02:00Z' },
    ],
    trip_vehicle_location: [
      { trip_id: 'today', lat: -33.431, lng: -70.641, updated_at: '2026-09-20T11:02:00Z' },
    ],
  };
  return createClient('https://example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      let result = rows[url.pathname.split('/').slice(-1)[0]] ?? [];
      url.searchParams.forEach((value, key) => {
        if (value.startsWith('eq.')) result = result.filter(row => String(row[key]) === value.slice(3));
        if (value.startsWith('in.(')) result = result.filter(row => value.slice(4, -1).split(',').includes(row[key]));
        if (key === 'or') result = result.filter(row => row.student_id === null || row.student_id === 'child');
      });
      if (url.searchParams.has('limit')) result = result.slice(0, Number(url.searchParams.get('limit')));
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
}
const morning = new Date('2026-09-20T11:03:00Z');
it('does not mix past trips, turns or siblings into the current view', async () => {
  const snapshot = await fetchTripSnapshot(clientFor(), 'child', morning);
  expect(snapshot.tripId).toBe('today');
  expect(snapshot.etaSeconds).toBe(120);
  expect(snapshot.events).toHaveLength(1);
  expect(buildTimeline(snapshot.events, 'child', 'Child').map(s => s.done)).toEqual([true, false, false, false]);
});

it('prefers the real active trip over the AM/PM suggested by the clock', async () => {
  const afternoon = new Date('2026-09-20T18:03:00Z');
  const snapshot = await fetchTripSnapshot(clientFor(), 'child', afternoon);
  expect(snapshot.tripId).toBe('today');
  expect(snapshot.direction).toBe('to_school');
  expect(buildTimeline(snapshot.events, 'child', 'Child', snapshot.direction).map(s => s.label)).toContain('Child llegó al colegio');
});

it('hides old ETA when the selected trip is finished', async () => {
  const snapshot = await fetchTripSnapshot(clientFor('finished'), 'child', morning);
  expect(snapshot.status).toBe('finished');
  expect(snapshot.etaSeconds).toBeNull();
});
it('shows an empty view when today has no trip instead of falling back to yesterday', async () => {
  const snapshot = await fetchTripSnapshot(clientFor('in_progress', false), 'child', morning);
  expect(snapshot.tripId).toBeNull();
  expect(snapshot.events).toEqual([]);
  expect(snapshot.etaSeconds).toBeNull();
});
