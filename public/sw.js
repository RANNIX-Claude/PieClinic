// Service worker de Pie Firme: hace instalable la PWA y deja abrir la aplicación SIN INTERNET (para que la caja siga operando).
// Guarda SOLO los archivos de la propia aplicación (HTML, JS, CSS, imágenes). NUNCA guarda respuestas de Supabase ni de terceros:
// los datos de salud y finanzas se leen siempre en vivo; lo que la caja necesita sin red lo guarda la app en IndexedDB (lib/offline).
const CACHE = 'pf-shell-v2'
const BASE = new URL(self.registration.scope).pathname   // «/app/»

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return   // nunca Supabase ni otros sitios
  // Navegación: red primero (versión nueva); si no hay red, el HTML guardado de la aplicación (la ruta la resuelve React Router).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(BASE, c)) } return r })
      .catch(async () => (await caches.match(BASE, { ignoreVary: true })) || Response.error()))
    return
  }
  // Archivos con hash de Vite, logos e íconos: caché primero.
  e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)) } return r })))
})

// La app avisa qué archivos suyos ya cargó (los que se pidieron antes de que este service worker controlara la página).
self.addEventListener('message', e => {
  if (e.data?.tipo !== 'cachear' || !Array.isArray(e.data.urls)) return
  e.waitUntil(caches.open(CACHE).then(async c => {
    for (const u of e.data.urls) {
      try { if (!(await c.match(u, { ignoreVary: true }))) { const r = await fetch(u); if (r.ok) await c.put(u === location.origin + BASE ? BASE : u, r) } } catch { /* sin red: se intentará después */ }
    }
  }))
})
