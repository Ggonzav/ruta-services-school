import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  session: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'guardian' } } } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getSession: mocks.session }, rpc: mocks.rpc }),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

describe('entrada de invitaciones con alumno recordado', () => {
  it.each([
    'a1b2c3d4-0000-4000-8000-0123456789ab',
    'a1b2c3d4-0000-4000-8000-0123456789ac',
  ])('valida el token %s aunque el navegador recuerde a Benjamín', async (token) => {
    const root = { innerHTML: '' };
    let submit: (event: { preventDefault(): void }) => Promise<void>;
    const button = { setAttribute: vi.fn(), removeAttribute: vi.fn() };
    const error = { hidden: true, textContent: '' };
    const form = {
      addEventListener: (_name: string, callback: typeof submit) => { submit = callback; },
      querySelector: () => button,
    };
    const elements: Record<string, unknown> = {
      app: root, 'invite-form': form, 'invite-error': error, nombre: { value: 'Familia de prueba' },
    };
    vi.stubGlobal('document', { getElementById: (id: string) => elements[id] });
    vi.stubGlobal('window', {
      APP_CONFIG: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'test' },
      location: { pathname: `/i/${token}` },
    });
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify([{ studentId: 'previous', studentName: 'Benjamín', redeemedAt: '2026-01-01' }]),
      setItem,
    });
    // Un enlace vencido tampoco debe mostrar al alumno anterior como fallback.
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('invite_not_found_or_expired') });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await import('./app');
      await Promise.resolve();
      expect(root.innerHTML).toContain('invite-form');
      expect(root.innerHTML).not.toContain('Benjamín');
      await submit!({ preventDefault: vi.fn() });
      expect(mocks.rpc).toHaveBeenCalledWith('redeem_invite', {
        p_token: token, p_full_name: 'Familia de prueba',
      });
      expect(error.hidden).toBe(false);
      expect(setItem).not.toHaveBeenCalled();
      expect(root.innerHTML).not.toContain('Benjamín');
    } finally { log.mockRestore(); }
  });
});
