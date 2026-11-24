// Utilidades compartidas del área UTILERÍAS (no se importan desde otros módulos).
import { useQuery } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { esVistaInexistente } from '../../lib/api'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

export const errMsg = e => (e ? (typeof e === 'string' ? e : e.message || e.error || 'Error desconocido') : '')
export const sinConexion = e => e?.code === 'SIN_CONEXION'

/** useQuery sobre una promesa { data, error }. Una vista inexistente (migración sin aplicar) se vuelve estado vacío con aviso. */
export function useDatos(key, fn, opciones = {}) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await fn()
      if (r?.error) {
        if (esVistaInexistente(r.error)) return { data: [], aviso: 'Esta vista aún no está disponible: falta aplicar la migración 060 (Utilerías) en la base de datos.' }
        throw Object.assign(new Error(errMsg(r.error)), { code: r.error.code })
      }
      return { data: r.data ?? [], count: r.count }
    },
    ...opciones,
  })
}

/** Estado estándar de una consulta: carga / error / sin conexión / vista no disponible. Devuelve null si hay datos que mostrar. */
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

/** Descarga un texto como archivo (CSV con BOM para que Excel respete los acentos). */
export function descargar(nombre, texto, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: tipo }))
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}
