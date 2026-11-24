import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './styles/theme.css'
import './styles/tailwind.css'
import { registrarServiceWorker } from './lib/pwa'

registrarServiceWorker()

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
