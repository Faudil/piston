/*
 * Piston's service worker: fast starts and an offline page, nothing more.
 *
 * - Static, content-addressed files (built JS/CSS, fonts, icons) are served
 *   cache-first, so the app shell starts without waiting for the network.
 * - Pages are NEVER cached (they hold user data): a navigation always goes to
 *   the network and only falls back to /offline.html when it fails.
 * - /api/** and every non-GET request are left to the browser untouched.
 *
 * Bump VERSION to drop every cache on the next visit.
 */
const VERSION = 'v1'
const STATIC_CACHE = `piston-static-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon.svg']
const STATIC_PREFIXES = ['/_nuxt/', '/_fonts/', '/cv-fonts/', '/icons/']
/** Hashed build files pile up with every deployment: keep the newest ones. */
const MAX_ENTRIES = 150

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('piston-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

async function trim(cache) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key)
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  // Only complete, successful answers (no 206 range parts, no errors).
  if (response.ok && response.status === 200) {
    await cache.put(request, response.clone())
    await trim(cache)
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
    )
    return
  }

  // /_nuxt/builds/ is how the app detects a new deployment: always fresh.
  if (
    !url.pathname.startsWith('/_nuxt/builds/') &&
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    event.respondWith(cacheFirst(request))
  }
})
