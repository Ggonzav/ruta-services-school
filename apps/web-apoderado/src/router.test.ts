import { describe, expect, it } from 'vitest';
import { parseInviteToken } from './router.js';

describe('parseInviteToken', () => {
  it('extrae el uuid de /i/<uuid>', () => {
    const token = 'a1b2c3d4-0000-4000-8000-0123456789ab';
    expect(parseInviteToken(`/i/${token}`)).toBe(token);
  });

  it('tolera una barra final', () => {
    const token = 'a1b2c3d4-0000-4000-8000-0123456789ab';
    expect(parseInviteToken(`/i/${token}/`)).toBe(token);
  });

  it('la raíz no es una invitación', () => {
    expect(parseInviteToken('/')).toBeNull();
  });

  it('un uuid mal formado no matchea (evita mandar basura a redeem_invite)', () => {
    expect(parseInviteToken('/i/no-es-un-uuid')).toBeNull();
  });
});
