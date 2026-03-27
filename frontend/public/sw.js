const CACHE_NAME = 'pos-bookdee-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Network-first strategy for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }
  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  )
})
