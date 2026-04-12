const CACHE_NAME = "agricola-v1";
const IMG_CACHE  = "agricola-card-images";
const PRECACHE = ["/", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== IMG_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Card images (proxied or local /img/): cache-first for offline support
  if (url.pathname.startsWith("/api/imgproxy") || url.pathname.startsWith("/img/")) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(IMG_CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => new Response("", { status: 503, statusText: "Offline" }));
      })
    );
    return;
  }

  // Skip other API calls (data is handled by localStorage fallback in the app)
  if (url.pathname.startsWith("/api")) return;

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
