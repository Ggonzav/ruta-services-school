import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('jsr:@supabase/supabase-js@2', () => ({ createClient: mocks.createClient }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules(); });

it.each([false, null])('rejects a non-owner (%s) before reading stops or calling Mapbox', async (ownsTrip) => {
  let handler: (request: Request) => Promise<Response>;
  vi.stubGlobal('Deno', {
    env: { get: () => 'test' },
    serve: (fn: typeof handler) => { handler = fn; },
  });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  mocks.rpc.mockResolvedValue({ data: ownsTrip, error: null });
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
  await import('../functions/update-eta/index');
  const response = await handler!(new Request('https://example.test/update-eta', {
    method: 'POST', headers: { Authorization: 'Bearer guardian-token' },
    body: JSON.stringify({ trip_id: 'trip', lat: -33, lng: -70 }),
  }));
  expect(response.status).toBe(403);
  expect(mocks.rpc).toHaveBeenCalledWith('is_my_trip', { p_trip_id: 'trip' });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.createClient).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
