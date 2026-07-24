/* Aatami-sovelluksen service worker — app shell -välimuisti offline-käyttöä ja
   nopeaa avausta varten. Data (Supabase) haetaan aina verkosta. */
const CACHE = "aatami-app-v1";
const SHELL = [
  "./app.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Supabase- ja muut ulkoiset pyynnöt: aina verkosta (ei välimuistia).
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== "GET") return;
  // App shell: cache-first; muut saman originin tiedostot: verkko, fallback välimuistiin.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
