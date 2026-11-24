const V = "podo-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/app/") || r.headers.has("authorization")) return;
  if (!/\.(js|css|png|svg|woff2?)$/.test(u.pathname) && !u.pathname.endsWith(".html") && !u.pathname.endsWith("/")) return;
  e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(V).then((k) => k.put(r, c)); return res; }).catch(() => caches.match(r)));
});
