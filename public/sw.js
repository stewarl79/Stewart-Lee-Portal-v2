self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'New Notification';
    const options = {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      data: data.data || {},
      tag: data.tag || 'default',
      actions: data.actions || []
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (e) {
    // Fallback for non-JSON push data
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('New Notification', {
        body: text,
        icon: '/logo.png'
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Handle notification click - usually open the app
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
