// Service worker for the installed web app (Phase 5: offline app shell; Phase 7 adds push).
// The build fills in VERSION and PRECACHE (scripts/postexport-web.mjs); a new deploy is a new
// worker with a new cache, so the next open loads the latest app.
const VERSION = '__VERSION__';
const PRECACHE = [];
const SHELL = `eii-shell-${VERSION}`;
// Images of events saved for offline use (cached by the app, served from here).
const IMAGES = 'eii-images';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('eii-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Pages: the network when it answers within a few seconds, otherwise the cached app. */
async function page(request) {
  try {
    const response = await Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))]);
    if (response && response.ok) return response;
    throw new Error('bad response');
  } catch {
    const cached = await caches.match('/index.html', { cacheName: SHELL });
    return cached || Response.error();
  }
}

/** The app's own files never change under the same name: cache first. */
async function appFile(request) {
  const cached = await caches.match(request, { cacheName: SHELL });
  return cached || fetch(request);
}

async function image(request) {
  const cache = await caches.open(IMAGES);
  const cached = await cache.match(request.url);
  return cached || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (url.origin === self.location.origin) event.respondWith(appFile(request));
  else if (request.destination === 'image') event.respondWith(image(request));
  // Everything else (the API) goes straight to the network; the app keeps its own offline copies.
});
