/* ATLAS service worker — conservative, enables PWA installability + offline shell.
 * Strategy:
 *   - navigations: network-first (selalu fresh saat online; offline → shell cache)
 *   - static assets (js/css/img/font, /build/*): stale-while-revalidate
 *   - API / Inertia XHR / realtime polling: network-only passthrough (tak di-cache)
 * Hanya didaftarkan di production build (lihat registrasi di app.tsx) supaya
 * tidak mengganggu Vite HMR saat dev. */
// Nama cache di-stamp build-id oleh docker/entrypoint.sh (sed __BUILD_ID__ →
// hash manifest). Tiap build aset baru → nama cache baru → SW di-update browser
// → `activate` purge cache build lama (cegah shell HTML basi menunjuk hash mati).
// Saat dev (sw.js tak di-stamp) placeholder tetap valid sebagai nama konstan.
const CACHE = 'atlas-shell-__BUILD_ID__'
const SHELL = ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Document navigations → network-first, fallback ke shell cache saat offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Hanya cache respons sukses sbg shell. Tanpa guard ini, respons error
          // (mis. 504 dari proxy / halaman maintenance) ikut tersimpan sbg '/'
          // lalu disajikan saat fallback → HTML rusak/basi → 404 aset ber-hash.
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/'))),
    )
    return
  }

  // Static assets → stale-while-revalidate.
  const isAsset = url.pathname.startsWith('/build/') || url.pathname.startsWith('/icons/') ||
    /\.(?:js|css|png|jpe?g|svg|webp|gif|woff2?|ico)$/.test(url.pathname)
  if (isAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        }).catch(() => cached)
        return cached || network
      }),
    )
    return
  }
  // Everything else (API / Inertia / /realtime/*) → default network passthrough.
})
