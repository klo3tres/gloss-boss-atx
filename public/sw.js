/* Gloss Boss ATX — staff web push service worker */
self.addEventListener('push', (event) => {
  let data = { title: 'Gloss Boss ATX', body: 'New job alert', url: '/tech' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* use defaults */
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Gloss Boss ATX', {
      body: data.body || 'New job alert',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag || 'gloss-boss-job',
      data: { url: data.url || '/tech' },
      requireInteraction: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/tech';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
