import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { deliverBatch } from './delivery.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const secret = Deno.env.get('PUSH_DISPATCH_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 });
  }
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return new Response('push_not_configured', { status: 503 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data, error } = await db.rpc('claim_push_deliveries');
    if (error) throw error;
    const sent = await deliverBatch(data ?? [], async (row, payload) => {
      // Genera cifrado y VAPID con librería estándar; fetch impide seguir redirects.
      const details = webpush.generateRequestDetails({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
        TTL: 60, urgency: 'high', vapidDetails: { subject, publicKey, privateKey },
      });
      const response = await fetch(row.endpoint, {
        method: 'POST', headers: details.headers, body: new Uint8Array(details.body),
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      await response.body?.cancel();
      return response.status;
    }, async (row, status) => {
      const { error } = await db.rpc('complete_push_delivery', { p_id: row.delivery_id, p_lease: row.lease, p_status: status });
      if (error) throw error;
    }, async (row) => {
      const { data, error } = await db.rpc('authorize_push_delivery', { p_id: row.delivery_id, p_lease: row.lease });
      if (error) throw error;
      return data === true;
    });
    return Response.json({ processed: data?.length ?? 0, sent });
  } catch {
    console.error('push_dispatch_failed');
    return new Response('push_dispatch_failed', { status: 500 });
  }
});
