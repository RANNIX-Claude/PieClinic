// Registro del service worker y actualización automática con aviso. Una versión nueva queda en espera; al aceptar el aviso se activa y se recarga,
// así una actualización nunca interrumpe un cierre a medias. Solo en la versión compilada (en desarrollo no hay service worker).
export function registrarServiceWorker({ alHayNueva }) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const base = import.meta.env.BASE_URL
  const enviarRecursos = reg => {   // archivos que la página ya cargó antes de que el service worker tomara el control
    const sw = reg?.active; if (!sw) return
    const urls = [...new Set([base, ...performance.getEntriesByType('resource').map(r => r.name).filter(u => { try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith(base) } catch { return false } })])]
    sw.postMessage({ tipo: 'cachear', urls })
  }
  const arrancar = () => navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then(async reg => {
    const aviso = () => { if (reg.waiting && navigator.serviceWorker.controller) alHayNueva(() => { reg.waiting.postMessage({ tipo: 'saltar' }) }) }
    aviso()
    reg.addEventListener('updatefound', () => { const n = reg.installing; n?.addEventListener('statechange', () => { if (n.state === 'installed') aviso() }) })
    let recargando = false
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargando) { recargando = true; location.reload() } })
    await navigator.serviceWorker.ready
    enviarRecursos(reg); setTimeout(() => enviarRecursos(reg), 6000); window.addEventListener('online', () => { enviarRecursos(reg); reg.update().catch(() => {}) })
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}) })
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
  }).catch(() => {})
  if (document.readyState === 'complete') arrancar(); else window.addEventListener('load', arrancar)
}
