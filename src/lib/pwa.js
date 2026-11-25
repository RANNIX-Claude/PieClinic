// PWA instalable de Pie Firme. El manifiesto y los íconos viven en public/ (index.html los enlaza).
// El service worker (public/sw.js) guarda los archivos de la APLICACIÓN para poder abrirla sin internet (la caja debe seguir operando).
// Los archivos que la página ya cargó ANTES de que el service worker tomara el control no pasan por él: se le avisa aquí qué cargó.
function enviarRecursos(reg) {
  const sw = reg?.active
  if (!sw) return
  const base = import.meta.env.BASE_URL
  const urls = [...new Set([base, ...performance.getEntriesByType('resource').map(r => r.name).filter(u => { try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith(base) } catch { return false } })])]
  sw.postMessage({ tipo: 'cachear', urls })
}

export function registrarServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () =>
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .then(() => navigator.serviceWorker.ready)
        .then(reg => { enviarRecursos(reg); setTimeout(() => enviarRecursos(reg), 6000); window.addEventListener('online', () => enviarRecursos(reg)) })
        .catch(() => {}))
  }
}
