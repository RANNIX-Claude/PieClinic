// Service worker mínimo: hace instalable la PWA. No guarda nada en caché a propósito:
// la app maneja datos de salud y finanzas en vivo; un caché viejo mostraría información desactualizada.
// (El uso sin conexión para consulta básica está pendiente de definir.)
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
