// Victory AI — Service Worker
// Handles Web Push notifications and notification click routing.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const title   = data.title || 'Victory';
  const options = {
    body:     data.body    || '',
    icon:     '/victory-logo.png',
    badge:    '/victory-logo.png',
    data:     { url: data.url || '/live' },
    tag:      data.tag    || 'victory-default',
    renotify: !!data.tag,
    vibrate:  [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/live';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        // An already-open app must still go where the push points, not just come to front.
        for (const client of clientList) {
          if (!('focus' in client)) continue;
          try {
            if ('navigate' in client) {
              const navigated = await client.navigate(targetUrl);
              return (navigated || client).focus();
            }
          } catch (e) {
            // Uncontrolled clients can't be navigated by the worker — let the app route itself.
          }
          client.postMessage({ type: 'navigate', url: targetUrl });
          return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
