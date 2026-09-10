self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  const judul = data.title || 'Kas Keluarga';
  event.waitUntil(
    self.registration.showNotification(judul, {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'tagihan-pengingat',
      data: { url: data.url || '/app/tagihan' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/app/tagihan';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});