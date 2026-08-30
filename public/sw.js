// Service Worker for Push Notifications

self.addEventListener('push', function(event) {
  if (!event.data) return;

  const data = event.data.json();
  
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/pwa-192x192.png',  // High-res app icon
    badge: '/notification-badge.png',  // Android status bar (monochrome)
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
    requireInteraction: false,  // Auto-dismiss on mobile
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Creatorsctrl', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (url !== '/') {
            client.navigate(url);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) {
            // Remove any non-Workbox caches that may hold stale assets
            return !name.startsWith('workbox-') && name !== 'supabase-cache';
          })
          .map(function(name) {
            console.log('[SW] Purging old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      return clients.claim();
    })
  );
});
