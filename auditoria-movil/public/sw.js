// Service worker de la PWA de Auditoría (alcance /aud/). Deja abrir la app SIN INTERNET (el cierre debe poder completarse sin señal).
// Guarda SOLO archivos de la propia app; NUNCA respuestas de Supabase ni de terceros (datos de salud y finanzas se leen en vivo).
// Actualización: una versión nueva queda «en espera» y la app avisa «Hay una versión nueva»; al aceptar, la app manda {tipo:'saltar'} y recarga.
// Así una actualización nunca interrumpe un cierre a medias. Notificaciones push: ver el manejador 'push' al final (simulado hasta tener llaves VAPID).
const CACHE = 'pfa-shell-v1'
const BASE = new URL(self.registration.scope).pathname   // «/aud/»

self.addEventListener('install', () => { /* sin skipWaiting: la app decide cuándo actualizar */ })
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return   // nunca Supabase ni otros sitios
  if (url.pathname === BASE + 'sw.js') return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(BASE, c)) } return r })
      .catch(async () => (await caches.match(BASE, { ignoreVary: true })) || Response.error()))
    return
  }
  e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)) } return r })))
})

self.addEventListener('message', e => {
  if (e.data?.tipo === 'saltar') { self.skipWaiting(); return }
  if (e.data?.tipo !== 'cachear' || !Array.isArray(e.data.urls)) return
  e.waitUntil(caches.open(CACHE).then(async c => {
    for (const u of e.data.urls) {
      try { if (!(await c.match(u, { ignoreVary: true }))) { const r = await fetch(u); if (r.ok) await c.put(u === location.origin + BASE ? BASE : u, r) } } catch { /* sin red: se intentará después */ }
    }
  }))
})

// Web Push (contrato con la Etapa 6): el servidor manda {titulo, cuerpo, url}. Sin llaves VAPID no llega nada real: la suscripción queda SIMULADA.
self.addEventListener('push', e => {
  let d = {}; try { d = e.data?.json() ?? {} } catch { /* texto plano */ }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Auditoría solicitada', { body: d.cuerpo || 'Abre la app para ver tus pendientes', data: { url: d.url || BASE }, icon: BASE + 'icons/piefirme-192.png' }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.openWindow(e.notification.data?.url || BASE))
})
