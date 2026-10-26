export interface Delivery {
  delivery_id: string; lease: string; endpoint: string; p256dh: string; auth: string;
  student_id: string; event_id: string; kind: 'AM' | 'PM';
}
export function allowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname);
  } catch { return false; }
}
export function pushPayload(row: Delivery) {
  return JSON.stringify({
    title: 'RutaSegura',
    body: row.kind === 'AM' ? 'El furgón está cerca del punto de recogida.' : 'El furgón está llegando al punto de entrega.',
    tag: `approaching:${row.event_id}`,
    url: `/?student=${encodeURIComponent(row.student_id)}`,
  });
}
// Función inyectable para probar el envío sin servicios ni credenciales reales.
export async function deliverBatch(
  rows: Delivery[],
  send: (row: Delivery, payload: string) => Promise<number>,
  complete: (row: Delivery, status: number) => Promise<void>,
  authorize: (row: Delivery) => Promise<boolean>,
) {
  let sent = 0;
  // Máximo 20; todos terminan dentro del lease, con timeout por request en el adapter.
  await Promise.all(rows.map(async row => {
    let status = 400;
    if (allowedEndpoint(row.endpoint)) {
      try { status = await authorize(row) ? await send(row, pushPayload(row)) : 409; }
      catch { status = 0; } // Transitorio: reintentar; nunca imprimir endpoint/keys.
    }
    await complete(row, status);
    if (status >= 200 && status < 300) sent++;
  }));
  return sent;
}
