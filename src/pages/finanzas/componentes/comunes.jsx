// Piezas compartidas por las pantallas de finanzas (no importar de otras áreas).
import { useQuery } from '@tanstack/react-query'
import { Download, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../../context/AppContext'
import { leer, esVistaInexistente } from '../../../lib/api'
import { hoyISO } from '../../../lib/formato'
import { MESES } from '../../../lib/finanzas/constantes.js'
import { exportarExcel } from '../../../lib/finanzas/exportar.js'
import EmptyState from '../../../components/ui/EmptyState'
import ImprimirHoja from '../../../components/ui/ImprimirHoja'

/** Lee una vista prp_* con la sede activa y la queryKey correcta. Devuelve { filas, cargando, error, noDisponible, refetch }. */
export function useVista(clave, vista, opciones = {}, { enabled = true } = {}) {
  const { sedeActivaId } = useApp()
  const q = useQuery({
    queryKey: ['finanzas', clave, vista, sedeActivaId, opciones],
    enabled,
    queryFn: async () => {
      const r = await leer(vista, { sedeId: sedeActivaId, ...opciones })
      if (r.error && !esVistaInexistente(r.error)) throw new Error(r.error.code === 'SIN_CONEXION' ? 'Sin conexión con la base de datos.' : r.error.message)
      return { filas: r.data, count: r.count, noDisponible: esVistaInexistente(r.error) }
    },
  })
  return { filas: q.data?.filas ?? [], count: q.data?.count ?? null, noDisponible: !!q.data?.noDisponible, cargando: q.isLoading, error: q.error, refetch: q.refetch }
}

export const hoy = () => hoyISO()
export const anioMesActual = () => { const [a, m] = hoyISO().split('-').map(Number); return { anio: a, mes: m } }

/** Selector de mes y año. */
export function SelectorMes({ anio, mes, onChange, anios }) {
  const lista = anios ?? Array.from({ length: 5 }, (_, i) => anioMesActual().anio - i)
  return (
    <>
      <select value={mes} onChange={e => onChange({ anio, mes: Number(e.target.value) })} aria-label="Mes">
        {MESES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
      </select>
      <select value={anio} onChange={e => onChange({ anio: Number(e.target.value), mes })} aria-label="Año">
        {lista.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </>
  )
}

/** Barra de botones Excel / PDF para cualquier reporte. `hojas` como en exportarExcel; `children` es lo que se imprime. */
export function BotonesExportar({ nombre, hojas, titulo, children, entidad, deshabilitado }) {
  const { sedeActivaId } = useApp()
  const excel = async () => {
    try { await exportarExcel(nombre, hojas, { entidad: entidad ?? nombre, sedeId: sedeActivaId }) } catch (e) { toast.error(`No se pudo exportar: ${e.message}`) }
  }
  return (
    <>
      <button type="button" className="btn o" onClick={excel} disabled={deshabilitado}><Download size={14} style={{ verticalAlign: -3 }} /> Excel</button>
      <ImprimirHoja titulo={titulo ?? nombre} entidad={entidad ?? nombre} sedeId={sedeActivaId} etiqueta="PDF / Imprimir">{children}</ImprimirHoja>
    </>
  )
}

/** Tabla simple imprimible a partir de columnas y filas ya formateadas. */
export function TablaImprimible({ columnas, filas }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead><tr>{columnas.map(c => <th key={c.key} style={{ textAlign: c.align ?? 'left', borderBottom: '1px solid #000', padding: 3 }}>{c.label}</th>)}</tr></thead>
      <tbody>{filas.map((f, i) => <tr key={i}>{columnas.map(c => <td key={c.key} style={{ textAlign: c.align ?? 'left', padding: 3, borderBottom: '1px solid #ddd' }}>{c.render ? c.render(f) : f[c.key]}</td>)}</tr>)}</tbody>
    </table>
  )
}

export function VistaNoDisponible({ nombre }) {
  return <EmptyState icon={FileText} title="Vista no disponible aún" description={`La base de datos todavía no tiene ${nombre ? `«${nombre}»` : 'esta vista'}. Aplica las migraciones de finanzas (040-049).`} />
}

/** Mensaje legible de un error de Supabase/RPC (incluye los PF409 de las reglas de negocio). */
export const mensajeError = e => (e?.message ?? String(e ?? 'Error desconocido')).replace(/^.*?:\s*(?=La distribución|Lo aplicado|No se puede|solo )/i, '')

/** Chips de filtro (pill) con conteo opcional. */
export function Chips({ opciones, valor, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opciones.map(o => (
        <button key={o.value} type="button" className={`btn sm ${valor === o.value ? '' : 'o'}`} onClick={() => onChange(o.value)}>
          {o.label}{o.n != null ? ` (${o.n})` : ''}
        </button>
      ))}
    </div>
  )
}

/** Aviso de modo simulado de un adaptador. */
export const AvisoSimulado = ({ texto = 'Modo simulado: sin llave' }) => <span className="bd a" title="Integración sin llave: nada real ocurre">{texto}</span>

// ───────── helpers agregados por el fork A (dashboard / reportes / resumen) ─────────
import { offsetZona } from '../../../lib/formato'
import { rangoMes, sumarDias } from '../../../lib/finanzas/semana.js'

/** Límites [gte, lt) de un rango de fechas date para filtrar columnas timestamptz en la zona de la clínica. */
export function limitesTs(desde, hastaInclusivo) {
  const off = offsetZona()
  return { gte: `${desde}T00:00:00${off}`, lt: `${sumarDias(hastaInclusivo, 1)}T00:00:00${off}` }
}
export const limitesMesTs = (anio, mes) => { const r = rangoMes(anio, mes); return limitesTs(r.desde, r.hasta) }

/** Nombres de perfiles (podólogos, etc.) como mapa id → nombre. */
export function usePerfilesMapa() {
  const { filas } = useVista('perfiles', 'perfiles', { sedeCol: false, columnas: 'id,nombre,apellidos,rol', limite: 1000 })
  const mapa = Object.fromEntries(filas.map(p => [p.id, [p.nombre, p.apellidos].filter(Boolean).join(' ')]))
  return { mapa, perfiles: filas }
}
/** Nombres de productos (id → nombre). */
export function useProductosMapa() {
  const { filas } = useVista('productos-nombres', 'prp_productos', { sedeCol: false, columnas: 'id,nombre,sku,categoria', limite: 5000 })
  return Object.fromEntries(filas.map(p => [p.id, p.nombre]))
}
export const nombreSede = (sedes, id) => sedes?.find(s => s.id === id)?.nombre ?? '—'
