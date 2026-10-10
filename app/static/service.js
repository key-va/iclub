// Import OneSignal SDK
importScripts('https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js');

// Helper function to broadcast messages to all clients
async function broadcastMessage(message) {
  const allClients = await self.clients.matchAll({ includeUncontrolled: true });
  allClients.forEach(client => client.postMessage(message));
}

// let notification trigger data ingestation
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = null;

    try {
      payload = event.data ? await event.data.json() : null;
    } catch {
      try {
        payload = event.data ? { raw: await event.data.text() } : null;
      } catch {}
    }

    await broadcastMessage({
      type: 'ONESIGNAL_PUSH_RECEIVED',
      payload
    });
  })());
});

// let notifications open a link if payload includes data.url
self.addEventListener('notificationclick', (event) => {
  const url = event?.notification?.data?.url;
  if (!url) return;
  event.notification.close();
  event.waitUntil(self.clients.openWindow(url));
});
