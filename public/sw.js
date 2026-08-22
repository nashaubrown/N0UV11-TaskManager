/* NOUVII service worker — vanilla JS, no build step.
 * Strategy:
 *   - app shell (navigations): network-first, cached fallback → offline works
 *   - hashed build assets (/assets/): cache-first (immutable)
 *   - photos (uploads + /demo/): cache-first with a size-capped cache
 *   - API GETs: network-first with cache fallback (stale data beats no data)
 * Push: shows a notification; clicking focuses/opens the app. */

const SHELL = 'nouvii-shell-v2'
const ASSETS = 'nouvii-assets-v2'
const IMAGES = 'nouvii-images-v1'
const API = 'nouvii-api-v1'
const IMAGE_CACHE_LIMIT = 200

async function precache() {
  const shell = await caches.open(SHELL)
  await shell.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])
  // the page's build assets are hashed — discover them from the served HTML
  try {
    const html = await (await fetch('/')).text()
    const assets = [...new Set([...html.matchAll(/\/assets\/[^"']+/g)].map((m) => m[0]))]
    if (assets.length) await (await caches.open(ASSETS)).addAll(assets)
  } catch { /* assets cache fills at runtime instead */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL, ASSETS, IMAGES, API])
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function trimCache(name, limit) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i])
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
    if (cacheName === IMAGES) trimCache(IMAGES, IMAGE_CACHE_LIMIT)
  }
  return response
}

async function networkFirst(cacheName, request, fallbackUrl) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const shell = await caches.match(fallbackUrl)
      if (shell) return shell
    }
    throw new Error('offline and not cached')
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(SHELL, request, '/'))
    return
  }
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(ASSETS, request))
    return
  }
  if (
    url.pathname.startsWith('/api/uploads/local/') ||
    (url.origin === location.origin && (url.pathname.startsWith('/demo/') || url.pathname.endsWith('.png')))
  ) {
    event.respondWith(cacheFirst(IMAGES, request))
    return
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(API, request))
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* plain text push */ }
  const title = data.title || 'NOUVII'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      tag: data.tag,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
