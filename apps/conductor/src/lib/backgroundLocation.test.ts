import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  handler: undefined as undefined | ((args: any) => Promise<void>),
  invoke: vi.fn(async () => ({ error: null })),
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.store.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.store.set(key, value); },
  removeItem: async (key: string) => { mocks.store.delete(key); },
} }));
vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
  startLocationUpdatesAsync: mocks.start,
  stopLocationUpdatesAsync: mocks.stop,
  Accuracy: { Balanced: 3 },
}));
vi.mock('expo-task-manager', () => ({
  defineTask: (_: string, handler: typeof mocks.handler) => { mocks.handler = handler; },
  isTaskRegisteredAsync: async () => true,
}));
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
const location = { data: { locations: [{ coords: { latitude: -33, longitude: -70 } }] } };
beforeEach(() => { mocks.store.clear(); vi.clearAllMocks(); vi.resetModules(); });
it('restores the active trip when the JS runtime restarts', async () => {
  const first = await import('./backgroundLocation');
  await first.startSharingLocation('active-trip');
  vi.resetModules();
  await import('./backgroundLocation');
  await mocks.handler!(location);
  expect(mocks.invoke).toHaveBeenCalledWith('update-eta', {
    body: { trip_id: 'active-trip', lat: -33, lng: -70 },
  });
});
it('stopping removes the persisted trip, including after another restart', async () => {
  const first = await import('./backgroundLocation');
  await first.startSharingLocation('active-trip');
  await first.stopSharingLocation();
  vi.resetModules();
  await import('./backgroundLocation');
  await mocks.handler!(location);
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.stop).toHaveBeenCalled();
});
