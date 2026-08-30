// Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAcX467m3_rDi7B88m2c-2UEbgqRoyXZps",
  authDomain: "creatorsctrl-notificatio-5ec92.firebaseapp.com",
  projectId: "creatorsctrl-notificatio-5ec92",
  storageBucket: "creatorsctrl-notificatio-5ec92.firebasestorage.app",
  messagingSenderId: "68773052442",
  appId: "1:68773052442:web:84916e52f4d81759c4d1a3",
  measurementId: "G-1TT3NZLZWR"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Creators Control';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new notification',
    icon: '/pwa-192x192.png',
    badge: '/notification-badge.png',
    vibrate: [100, 50, 100],
    data: {
      url: payload.data?.url || '/',
      dateOfArrival: Date.now(),
    },
    tag: payload.data?.tag || 'default',
    renotify: true,
    requireInteraction: false,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (url !== '/') {
            client.navigate(url);
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
