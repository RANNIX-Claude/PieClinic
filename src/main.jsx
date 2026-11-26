import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './styles/theme.css'
import './styles/tailwind.css'
import { registrarServiceWorker } from './lib/pwa'

registrarServiceWorker()

// Tras una publicación nueva, una pestaña abierta con la versión anterior pide archivos que ya no existen
// («Failed to fetch dynamically imported module»). Se recarga sola una vez para tomar la versión nueva; el tope evita ciclos.
const recargarPorVersionNueva = () => {
  try {
    const ult = Number(sessionStorage.getItem('pf-recarga-version') ?? 0)
    if (Date.now() - ult < 60_000) return
    sessionStorage.setItem('pf-recarga-version', String(Date.now()))
  } catch { /* sin sessionStorage: se recarga igual */ }
  window.location.reload()
}
window.addEventListener('vite:preloadError', e => { e.preventDefault(); recargarPorVersionNueva() })
window.addEventListener('unhandledrejection', e => { if (/dynamically imported module|Importing a module script failed/i.test(String(e.reason?.message ?? e.reason ?? ''))) { e.preventDefault(); recargarPorVersionNueva() } })

// React Query: datos frescos 30 s; sin reintentos agresivos (los errores de RLS no se arreglan reintentando).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
