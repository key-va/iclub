self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch {}
    await self.registration.showNotification(payload.title || 'Intra Club', {
      body: payload.body || 'You have a new update',
      icon: payload.icon || '/favicons/favicon-192.png',
      badge: payload.badge,
      tag: payload.tag,
      data: { url: payload.url || '/' }
    });
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    let url = new URL(event.notification.data?.url || '/', self.location.origin);
    if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin === url.origin) {
        await client.navigate(url.href);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
