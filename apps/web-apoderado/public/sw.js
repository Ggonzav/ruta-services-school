/* Sin caché de páginas, invitaciones, ubicación ni respuestas de Supabase. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* mostrar aviso genérico */ }
  const target = new URL(typeof data.url === 'string' ? data.url : '/', self.location.origin);
  const url = target.origin === self.location.origin && target.pathname === '/' ? target.href : self.location.origin;
  event.waitUntil(self.registration.showNotification('RutaSegura', {
    body: typeof data.body === 'string' ? data.body : 'Tienes una actualización de tu recorrido.',
    tag: typeof data.tag === 'string' ? data.tag : 'rutasegura',
    icon: '/icon-192.png', badge: '/icon-192.png', data: { url },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url ?? '/', self.location.origin);
    if (target.origin !== self.location.origin || target.pathname !== '/') return;
    // Mantener cada alumno en su pestaña; no reutilizar una de otro alumno.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = windows.find(client => client.url === target.href);
    if (same) return same.focus();
    return self.clients.openWindow(target.href);
  })());
});
