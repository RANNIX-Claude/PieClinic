// Utilidades compartidas del clúster ADMIN (no se importan desde otros clústeres).
import { useQuery } from '@tanstack/react-query'
import { Bot, WifiOff } from 'lucide-react'
import { llamarFuncion, esVistaInexistente } from '../../../lib/api'
import { MODO_SIMULADO_TEXTO } from '../../../lib/adaptadores/ia'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'

/** Mensaje legible de un error de Supabase/función. */
export const errMsg = e => (e ? (typeof e === 'string' ? e : e.message || e.error || 'Error desconocido') : '')
export const sinConexion = e => e?.code === 'SIN_CONEXION'

/** Invoca una función servidor y devuelve { data, error } sin lanzar. Una respuesta no JSON (p. ej. sin servidor en desarrollo) es error explícito. */
export async function invocar(nombre, body) {
  try {
    const r = await llamarFuncion(nombre, body)
    const texto = await r.text()
    let j = null
    try { j = JSON.parse(texto) } catch { /* no JSON */ }
    if (!r.ok || j?.error) return { data: null, error: j?.error || (r.status === 404 ? `La función servidor «${nombre}» no está disponible en este entorno.` : `Error ${r.status} de la función «${nombre}».`) }
    return { data: j?.data ?? j, error: null }
  } catch (e) {
    return { data: null, error: `No se pudo contactar la función «${nombre}»: ${e.message}` }
  }
}

/** useQuery sobre una promesa { data, error }. Convierte vista inexistente en estado vacío con aviso. */
export function useDatos(key, fn, opciones = {}) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await fn()
      if (r?.error) {
        if (esVistaInexistente(r.error)) return { data: [], aviso: 'Esta vista aún no está disponible (migración sin aplicar).' }
        throw Object.assign(new Error(errMsg(r.error)), { code: r.error.code })
      }
      return { data: r.data ?? [], count: r.count }
    },
    ...opciones,
  })
}

/** Aviso visible de IA simulada (nunca se finge que hay IA real). */
export function BannerIA({ modo = 'simulado', proveedor }) {
  if (modo === 'activo') return <div className="card" style={{ padding: '8px 12px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><Bot size={14} /> IA activa{proveedor ? ` · ${proveedor}` : ''}. Revisa siempre las propuestas.</div>
  return (
    <div className="card" role="status" style={{ padding: '8px 12px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', borderLeft: '4px solid var(--gold)' }}>
      <Bot size={14} /> <b>Modo simulado: sin llave.</b> <span style={{ color: 'var(--muted)' }}>{MODO_SIMULADO_TEXTO}</span>
    </div>
  )
}

/** Resultado estándar de una consulta: carga / error / sin conexión. Devuelve null si hay que mostrar los datos. */
export function EstadoConsulta({ q, vacioTitulo }) {
  if (q.isLoading) return <LoadingSpinner />
  if (q.isError) {
    return sinConexion(q.error)
      ? <EmptyState icon={WifiOff} title="Sin conexión" description={errMsg(q.error)} />
      : <EmptyState title="No se pudo cargar" description={errMsg(q.error)} />
  }
  if (q.data?.aviso) return <EmptyState title={vacioTitulo ?? 'Vista no disponible'} description={q.data.aviso} />
  return null
}

export const soloDigitos = v => String(v ?? '').replace(/\D/g, '')
export const hoyMas = dias => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)

/** Descarga un texto como archivo. */
export function descargar(nombre, texto, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: tipo }))
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}
export const csv = (cols, filas) => [cols.join(','), ...filas.map(f => cols.map(c => `"${String(f[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
