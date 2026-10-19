import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('./trip-data', () => ({ fetchTripSnapshot: mocks.snapshot }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ channel: () => {
  const channel = { on: () => channel, subscribe: () => channel, unsubscribe: vi.fn() }; return channel;
} }) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it('source UI removes ETA and route when target changes, ignoring late Directions responses', async () => {
  vi.useFakeTimers();
  const card = { innerHTML: '', classList: { toggle: vi.fn() } };
  const elements = new Map<string, any>();
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', addEventListener: vi.fn() });
    return elements.get(id);
  };
  vi.stubGlobal('document', { getElementById: el, querySelector: (q: string) => q === '.eta-card' ? card : null });
  const layer = () => { const obj = { addTo: () => obj, setLatLng: () => obj, bindPopup: () => obj, remove: vi.fn(), setLatLngs: vi.fn() }; return obj; };
  const line = layer();
  const polyline = vi.fn(() => line);
  const L = { map: () => ({ fitBounds: vi.fn() }), tileLayer: layer, marker: layer, divIcon: vi.fn(),
    control: { attribution: layer }, latLngBounds: () => ({ pad: vi.fn() }), polyline };
  vi.stubGlobal('window', { APP_CONFIG: { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test', mapboxPublicToken: 'pk.test' }, location: { pathname: '/' }, L });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([{ studentId: 'child', studentName: 'Alumno', redeemedAt: new Date().toISOString() }]) });
  let resolveRoute!: (value: unknown) => void;
  const fetch = vi.fn(() => new Promise(resolve => { resolveRoute = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const snapshot = { tripId: 'trip', direction: 'to_home', status: 'in_progress', etaSeconds: 360,
    updatedAt: new Date().toISOString(), events: [], isNext: true,
    map: { stop: { lat: -33, lng: -70, address: 'Casa' }, school: { lat: -34, lng: -71, name: 'Colegio' }, vehicle: { lat: -33.1, lng: -70.1, updatedAt: new Date().toISOString() } } };
  mocks.snapshot.mockResolvedValue(snapshot);
  await import('./app');
  await vi.advanceTimersByTimeAsync(0);
  expect(card.innerHTML).toContain('va hacia tu casa');
  expect(fetch).toHaveBeenCalledTimes(1);
  mocks.snapshot.mockResolvedValue({ ...snapshot, isNext: false });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(card.innerHTML).toContain('atendiendo otras paradas');
  expect(card.innerHTML).toContain('A bordo');
  expect(card.innerHTML).not.toContain('eta-minutes');
  resolveRoute({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [[-70.1,-33.1],[-70,-33]] } }] }) });
  await vi.advanceTimersByTimeAsync(0);
  expect(polyline).not.toHaveBeenCalled();
  mocks.snapshot.mockResolvedValue(snapshot);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(polyline).toHaveBeenCalledTimes(1);
  mocks.snapshot.mockResolvedValue({ ...snapshot, isNext: false });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(line.remove).toHaveBeenCalled();
  expect(card.innerHTML).not.toContain('eta-minutes');
});
