// Piezas compartidas por los reportes de Control y Auditoría (Etapa 6). Fechas locales de la clínica; valores al costo; indicadores rotulados «para investigar».
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { mensajeError } from '../../../lib/auditoria/roles'
import { hoyISO } from '../../../lib/formato'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'

export const restarDias = (dias, desde = hoyISO()) => new Date(new Date(`${desde}T12:00:00Z`).getTime() - dias * 86400000).toISOString().slice(0, 10)

/** useQuery sobre una RPC que devuelve { data, error }: lanza el mensaje claro de la base si falla. */
export function useRpc(key, fn, opciones = {}) {
  return useQuery({
    queryKey: key, retry: false,
    queryFn: async () => { const r = await fn(); if (r.error) throw Object.assign(new Error(mensajeError(r.error)), { code: r.error.code }); return r.data },
    ...opciones,
  })
}

export function Estado({ q, vacio }) {
  if (q.isLoading) return <LoadingSpinner />
  if (q.isError) return <EmptyState title="No se pudo cargar" description={q.error.message} />
  return vacio ?? null
}

/** Rango de fechas + sucursal + botón Aplicar. valor/onCambio manejan { desde, hasta, sucursal }. */
export function FiltroPeriodo({ valor, onCambio, onAplicar, sedes = [], children, cargando }) {
  return (
    <form className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={e => { e.preventDefault(); onAplicar() }}>
      <div className="field" style={{ margin: 0, minWidth: 130, flex: '0 1 150px' }}><label>Desde</label><input type="date" value={valor.desde} max={valor.hasta} onChange={e => onCambio({ ...valor, desde: e.target.value })} /></div>
      <div className="field" style={{ margin: 0, minWidth: 130, flex: '0 1 150px' }}><label>Hasta</label><input type="date" value={valor.hasta} min={valor.desde} onChange={e => onCambio({ ...valor, hasta: e.target.value })} /></div>
      {sedes.length > 0 && (
        <div className="field" style={{ margin: 0, minWidth: 160, flex: '0 1 200px' }}><label>Sucursal</label>
          <select value={valor.sucursal ?? ''} onChange={e => onCambio({ ...valor, sucursal: e.target.value })}><option value="">Todas</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
      )}
      {children}
      <button type="submit" className="btn sm" disabled={cargando}>Aplicar</button>
    </form>
  )
}

/** Franja de aviso (indicador para investigar, limitaciones del origen, modo simulado…). */
export function Aviso({ children, tono = 'info' }) {
  const colores = { info: ['#eef4ff', '#1d4ed8'], alerta: ['#fff7e8', '#9a5b00'], simulado: ['#f3eefc', '#6b3fa0'] }
  const [fondo, texto] = colores[tono] ?? colores.info
  return (
    <div role="note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: fondo, color: texto, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.45 }}>
      <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} /><div>{children}</div>
    </div>
  )
}

export const colorValor = n => (Number(n) < 0 ? 'var(--red)' : Number(n) > 0 ? 'var(--green)' : undefined)
