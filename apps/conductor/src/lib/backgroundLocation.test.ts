import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  handler: undefined as undefined | ((args: any) => Promise<void>),
  invoke: vi.fn(), current: vi.fn(), foreground: vi.fn(), background: vi.fn(),
  start: vi.fn(), stop: vi.fn(),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.store.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.store.set(key, value); },
  removeItem: async (key: string) => { mocks.store.delete(key); },
} }));
vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: mocks.foreground,
  requestBackgroundPermissionsAsync: mocks.background,
  getCurrentPositionAsync: mocks.current,
  startLocationUpdatesAsync: mocks.start,
  stopLocationUpdatesAsync: mocks.stop,
  Accuracy: { Balanced: 3 },
}));
vi.mock('expo-task-manager', () => ({
  defineTask: (_: string, handler: typeof mocks.handler) => { mocks.handler = handler; },
  isTaskRegisteredAsync: async () => true,
}));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
const point = () => ({ timestamp: Date.now(), coords: { latitude: -33, longitude: -70 } });
const event = () => ({ data: { locations: [point()] } });
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => {
  mocks.store.clear(); vi.resetAllMocks(); vi.resetModules(); vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
  mocks.foreground.mockResolvedValue({ status: 'granted' });
  mocks.background.mockResolvedValue({ status: 'granted' });
  mocks.current.mockImplementation(async () => point());
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});
afterEach(() => vi.useRealTimers());
it('captures and sends immediately without waiting for a native event, then confirms the acknowledgement', async () => {
  const gps = await import('./backgroundLocation');
  await gps.startSharingLocation('active-trip');
  await flush();
  expect(mocks.current).toHaveBeenCalledOnce();
  expect(mocks.invoke).toHaveBeenCalledWith('update-eta', expect.objectContaining({
    body: { trip_id: 'active-trip', lat: -33, lng: -70 },
  }));
  expect(gps.locationStatus('active-trip').confirmed).toBe(true);
  expect(gps.locationStatus('another-trip').confirmed).toBe(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(gps.locationStatus('active-trip').confirmed).toBe(false);
});
it('restores the active trip when the JS runtime restarts', async () => {
  const first = await import('./backgroundLocation');
  await first.startSharingLocation('active-trip'); await flush();
  vi.resetModules(); mocks.invoke.mockClear();
  await import('./backgroundLocation');
  await mocks.handler!(event());
  expect(mocks.invoke).toHaveBeenCalledOnce();
});
it('stopping removes the persisted trip and prevents more sends after restart', async () => {
  const first = await import('./backgroundLocation');
  await first.startSharingLocation('active-trip'); await flush();
  await first.stopSharingLocation(); mocks.invoke.mockClear();
  vi.resetModules(); await import('./backgroundLocation');
  await mocks.handler!(event());
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.stop).toHaveBeenCalled();
});
it('retries a failed first send with a fresh position after 15 seconds, without movement', async () => {
  const gps = await import('./backgroundLocation');
  mocks.invoke.mockResolvedValueOnce({ error: new Error('offline') });
  await gps.startSharingLocation('trip'); await flush();
  expect(gps.locationStatus('trip').confirmed).toBe(false);
  await gps.refreshLocation('trip');
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15_000);
  await gps.refreshLocation('trip');
  expect(mocks.current).toHaveBeenCalledTimes(2);
  expect(gps.locationStatus('trip').confirmed).toBe(true);
  await gps.refreshLocation('trip');
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
});
it('retries from background events and requires ok:true, not merely HTTP success', async () => {
  const gps = await import('./backgroundLocation');
  mocks.invoke.mockResolvedValueOnce({ data: {}, error: null });
  await gps.startSharingLocation('trip'); await flush();
  expect(gps.locationStatus('trip').confirmed).toBe(false);
  await vi.advanceTimersByTimeAsync(15_000);
  await mocks.handler!(event());
  expect(gps.locationStatus('trip').confirmed).toBe(true);
});
it('times out a stuck request, prevents overlap and ignores a late acknowledgement after stop', async () => {
  const gps = await import('./backgroundLocation');
  let resolve!: (value: any) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await gps.startSharingLocation('trip'); await flush();
  expect(gps.locationStatus('trip').confirmed).toBe(false);
  await gps.refreshLocation('trip');
  expect(mocks.invoke).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(mocks.invoke.mock.calls[0][1].signal.aborted).toBe(true);
  await gps.stopSharingLocation();
  resolve({ data: { ok: true } }); await flush();
  expect(gps.locationStatus('trip').confirmed).toBe(false);
});
it('recovers from a failed GPS capture and rejects stale native locations', async () => {
  const gps = await import('./backgroundLocation');
  mocks.current.mockRejectedValueOnce(new Error('GPS unavailable'));
  await gps.startSharingLocation('trip'); await flush();
  expect(mocks.invoke).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_000);
  await mocks.handler!({ data: { locations: [{ ...point(), timestamp: Date.now() - 120_000 }] } });
  expect(mocks.invoke).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15_000);
  await gps.refreshLocation('trip');
  expect(gps.locationStatus('trip').confirmed).toBe(true);
});
it('does not send with denied permission or after native registration fails', async () => {
  const gps = await import('./backgroundLocation');
  mocks.background.mockResolvedValueOnce({ status: 'denied' });
  expect(await gps.startSharingLocation('trip')).toEqual({ ok: false, reason: 'background_permission_denied' });
  expect(gps.locationStatus('trip').confirmed).toBe(false);
  expect(mocks.invoke).not.toHaveBeenCalled();
  mocks.start.mockRejectedValueOnce(new Error('native failure'));
  await expect(gps.startSharingLocation('trip')).rejects.toThrow('native failure');
  expect(mocks.store.size).toBe(0);
});
it('finishing during native startup stops the late registration and never captures GPS', async () => {
  const gps = await import('./backgroundLocation');
  let release!: () => void;
  mocks.start.mockImplementationOnce(() => new Promise<void>(r => { release = r; }));
  const starting = gps.startSharingLocation('trip'); await flush();
  await gps.stopSharingLocation(); release();
  expect(await starting).toEqual({ ok: false, reason: 'cancelled' });
  expect(mocks.current).not.toHaveBeenCalled();
  expect(mocks.store.size).toBe(0);
  expect(mocks.stop).toHaveBeenCalledTimes(2);
});
it('a late success from a finished trip cannot confirm a new trip', async () => {
  const gps = await import('./backgroundLocation');
  let release!: (value: any) => void;
  mocks.invoke.mockImplementationOnce(() => new Promise(r => { release = r; }));
  await gps.startSharingLocation('old'); await flush();
  await gps.stopSharingLocation();
  await gps.startSharingLocation('new');
  release({ data: { ok: true } }); await flush();
  expect(gps.locationStatus('new').confirmed).toBe(false);
  await gps.refreshLocation('new');
  expect(gps.locationStatus('new').confirmed).toBe(true);
});
