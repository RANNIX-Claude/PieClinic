// Utilidades compartidas del área AUDITORÍA (no se importan desde otros módulos).
import { useQuery } from '@tanstack/react-query'
import { Hammer } from 'lucide-react'
import { esVistaInexistente } from '../../lib/api'
import { mensajeError } from '../../lib/auditoria/roles'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

export const errMsg = e => mensajeError(e)

/** useQuery sobre una promesa { data, error }. Una tabla inexistente (migración sin aplicar) se vuelve estado vacío con aviso. */
export function useDatos(key, fn, opciones = {}) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await fn()
      if (r?.error) {
        if (esVistaInexistente(r.error)) return { data: [], aviso: 'Falta aplicar las migraciones 200–206 (Control y Auditoría) en esta base de datos.' }
        throw Object.assign(new Error(errMsg(r.error)), { code: r.error.code })
      }
      return { data: r.data ?? [], count: r.count }
    },
    retry: false,
    ...opciones,
  })
}

export function EstadoConsulta({ q }) {
  if (q.isLoading) return <LoadingSpinner />
  if (q.isError) return <EmptyState title="No se pudo cargar" description={errMsg(q.error)} />
  if (q.data?.aviso) return <EmptyState title="Módulo no disponible" description={q.data.aviso} />
  return null
}

/** Shell honesto para lo que se construye en una etapa posterior: rutas, menú y permisos ya están; la pantalla aún no. */
export function EtapaPendiente({ etapa, titulo, descripcion, incluira = [], children }) {
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Hammer size={16} /> {titulo ?? 'Pantalla en construcción'}</h3>
      <p style={{ margin: '0 0 10px', fontSize: 13.5 }}>Esta pantalla <b>se construye en la Etapa {etapa}</b> del módulo de Control y Auditoría. {descripcion}</p>
      {incluira.length > 0 && (
        <ul style={{ margin: '0 0 10px 18px', padding: 0, fontSize: 13, lineHeight: 1.6 }}>{incluira.map(t => <li key={t}>{t}</li>)}</ul>
      )}
      <div className="hint">La ruta, el menú y los permisos ya funcionan; la base de datos ya guarda lo necesario (esquema <code>ctl_*</code>, Etapa 0).</div>
      {children}
    </div>
  )
}

export const NOMBRE_ESTADO = {
  abierta: 'Abierta', en_investigacion: 'En investigación', cerrada_con_ajuste: 'Cerrada con ajuste', cerrada_sin_ajuste: 'Cerrada sin ajuste',
  rechazada: 'Rechazada', ajuste_fallido: 'Ajuste fallido',
}
