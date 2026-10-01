// Service worker for the installed web app.
// Phase 0: registered and activated only, with no caching yet, so every open loads the latest deploy.
// Phase 5 adds the offline app shell (precache); Phase 7 adds push notifications.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
