const CACHE_NAME = 'dermatips-shell-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match('/index.html')
        return cached || Response.error()
      }),
    )
    return
  }

  if (requestUrl.origin !== self.location.origin) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request).then((networkResponse) => {
        const responseClone = networkResponse.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        return networkResponse
      })
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'
  const targetPage = event.notification.data?.page
  const targetDate = event.notification.data?.date

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'OPEN_NOTIFICATION_TARGET',
            page: targetPage,
            date: targetDate,
          })
          return client.focus()
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }

      return undefined
    }),
  )
})
