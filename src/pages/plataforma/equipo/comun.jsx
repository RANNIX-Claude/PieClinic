// Utilidades compartidas del clúster EQUIPO (RH, comisiones, mantenimiento). Solo se importan desde esta carpeta.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { leer, esVistaInexistente } from '../../../lib/api'
import { bitacoraExportar } from '../../../lib/bitacora'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'

export const CLAVE = 'eq' // prefijo de queryKey: tras escribir se invalida todo el clúster

export const PUESTOS = [
  { value: 'podologo', label: 'Podólogo/a' }, { value: 'recepcion', label: 'Recepción' }, { value: 'apoyo', label: 'Apoyo' },
  { value: 'administrador', label: 'Administración' }, { value: 'otro', label: 'Otro' },
]
export const etiquetaPuesto = v => PUESTOS.find(p => p.value === v)?.label ?? v ?? '—'
export const ESQUEMAS = [{ value: 'nomina', label: 'Nómina' }, { value: 'honorarios', label: 'Honorarios / RESICO' }]
export const PERIODICIDADES = [{ value: 'semanal', label: 'Semanal' }, { value: 'quincenal', label: 'Quincenal' }, { value: 'mensual', label: 'Mensual' }]
export const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Texto legible de un error de Supabase o de red. */
export const textoError = e => (e?.code === 'SIN_CONEXION' ? 'Sin conexión con la base de datos.' : e?.message ?? String(e ?? 'Error desconocido'))

/** Lee una vista prp_* con React Query. opts = parámetros de leer(). Devuelve la consulta (data = filas). */
export function useVista(clave, vista, opts = {}, { habilitado = true, conSede = true } = {}) {
  const { sedeActivaId } = useApp()
  const sedeId = conSede ? sedeActivaId : undefined
  return useQuery({
    queryKey: [CLAVE, clave, sedeId ?? null, opts],
    enabled: habilitado,
    queryFn: async () => {
      const r = await leer(vista, { sedeCol: conSede ? 'sede_id' : false, ...opts, sedeId })
      if (r.error) {
        if (esVistaInexistente(r.error)) return []
        throw r.error
      }
      return r.data
    },
  })
}

/** Muestra carga / error / vacío y, si hay datos, los hijos. */
export function Estado({ q, children, vacio, esVacio }) {
  if (q.isLoading) return <LoadingSpinner />
  if (q.error) return <EmptyState title="No se pudo cargar" description={textoError(q.error)} />
  const vac = esVacio ? esVacio(q.data) : Array.isArray(q.data) && q.data.length === 0
  if (vac && vacio) return <EmptyState {...vacio} />
  return children
}

/** Ejecuta una escritura (promesa que devuelve {error}) con aviso y refresco. Devuelve true si salió bien. */
export function useEscribir() {
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const ejecutar = async (fn, ok = 'Guardado') => {
    setOcupado(true)
    try {
      const r = await fn()
      if (r?.error) { toast.error(textoError(r.error)); return false }
      if (ok) toast.success(ok)
      qc.invalidateQueries({ queryKey: [CLAVE] })
      return true
    } catch (e) { toast.error(textoError(e)); return false } finally { setOcupado(false) }
  }
  return { ejecutar, ocupado, refrescar: () => qc.invalidateQueries({ queryKey: [CLAVE] }) }
}

/** Descarga un Excel con una o varias hojas: hojas = [{ nombre, columnas: ['A','B'], filas: [[..],[..]] }]. Registra «exportar». */
export async function descargarExcel(archivo, hojas, entidad = archivo) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  for (const h of hojas) {
    const ws = wb.addWorksheet(h.nombre.slice(0, 31))
    ws.addRow(h.columnas)
    ws.getRow(1).font = { bold: true }
    h.filas.forEach(f => ws.addRow(f))
    ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(12, String(h.columnas[i] ?? '').length + 4)) })
  }
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `${archivo}_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(a.href)
  bitacoraExportar(entidad, { filas: hojas.reduce((s, h) => s + h.filas.length, 0) })
}

/** CLABE enmascarada salvo para Administración (P-111). */
export const enmascararClabe = (clabe, verCompleta) => (!clabe ? '—' : verCompleta ? clabe : `···${String(clabe).slice(-4)}`)

export const hoy = () => new Date().toISOString().slice(0, 10)
export const nombreMes = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const nSede = (sedes, id) => sedes.find(s => s.id === id)?.nombre ?? '—'

/** Etiqueta pequeña de dato clave/valor para fichas. */
export function Dato({ k, v }) {
  return <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{k}</div><div style={{ fontSize: 13.5 }}>{v ?? '—'}</div></div>
}

/** Aviso de modo solo lectura de la clínica. */
export function AvisoSoloLectura() {
  const { soloLectura } = useApp()
  if (!soloLectura) return null
  return <div className="card" style={{ background: 'var(--bd-r-bg)', color: 'var(--bd-r-fg)', fontSize: 13, marginBottom: 12 }}>La clínica está en modo solo lectura: se puede consultar y exportar, no modificar.</div>
}
