// PWA instalable de Pie Firme. El manifiesto y los íconos viven en public/ (index.html los enlaza).
export function registrarServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () =>
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {}))
  }
}
