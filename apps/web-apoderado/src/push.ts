import type { SupabaseClient } from '@supabase/supabase-js';

export function decodeVapidKey(key: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{87}=?$/.test(key)) throw new Error('La configuración de avisos todavía no está disponible.');
  const bytes = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(bytes, c => c.charCodeAt(0));
}
export function pushSupportMessage(): string | null {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !window.matchMedia('(display-mode: standalone)').matches) {
    return 'En iPhone/iPad: Compartir → Agregar a pantalla de inicio. Abre RutaSegura desde ese icono y activa los avisos allí. Si te pide una invitación, abre el enlace de tu alumno en esa app.';
  }
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Este navegador no permite avisos push. Usa un navegador compatible; mientras tanto, consulta el estado en esta página.';
  }
  return null;
}
export async function enablePush(client: SupabaseClient, studentId: string, publicKey?: string) {
  const unsupported = pushSupportMessage();
  if (unsupported) throw new Error(unsupported);
  const key = decodeVapidKey(publicKey ?? '');
  // Debe iniciarse dentro del gesto del usuario (especialmente en iOS).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Los avisos están bloqueados. Permítelos en la configuración del navegador para este sitio.');
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: new Uint8Array(key).buffer });
  const data = subscription.toJSON();
  const { error } = await client.rpc('register_push_subscription', {
    p_student_id: studentId, p_endpoint: data.endpoint,
    p_p256dh: data.keys?.p256dh, p_auth: data.keys?.auth,
  });
  if (error) throw new Error('No pudimos guardar los avisos. Reabre la invitación de este alumno e inténtalo nuevamente.');
}
export async function disablePush(client: SupabaseClient, studentId: string) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await client.rpc('unregister_push_subscription', { p_student_id: studentId, p_endpoint: subscription.endpoint });
  if (error) throw new Error('No pudimos desactivar los avisos. Inténtalo nuevamente.');
  // No cancelar PushManager: el mismo dispositivo puede seguir otro alumno.
}
