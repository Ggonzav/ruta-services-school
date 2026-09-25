// Ruta mínima: sólo nos importa si la URL es "/i/<token>" (el link que
// llega por WhatsApp) o cualquier otra cosa (la propia raíz, para un
// apoderado que ya canjeó antes y volvió a abrir la página).
const INVITE_PATH = /^\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export function parseInviteToken(pathname: string): string | null {
  const match = pathname.match(INVITE_PATH);
  return match ? match[1] : null;
}
