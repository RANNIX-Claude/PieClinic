// Utilidades compartidas del clúster INVENTARIO (lecturas con React Query, acciones con aviso, selector de producto, etiquetas).
import { useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useApp } from '../../../context/AppContext'
import { leer, esVistaInexistente } from '../../../lib/api'
import StatusBadge from '../../../components/ui/StatusBadge'

export const CLAVE = 'plat-inv'

export const msgError = e => {
  if (!e) return null
  if (esVistaInexistente(e)) return 'Esta vista aún no está disponible (migración pendiente de aplicar).'
  return e.message || String(e)
}

/** Lectura de una vista prp_* con filtro de sede (por defecto la sede activa; null = todas mis sedes). */
export function useLectura(clave, vista, { sedeId, sedeCol, filtros, orden, limite = 3000, columnas, buscar } = {}, enabled = true) {
  const { organizacion, sedeActivaId } = useApp()
  const sid = sedeId === undefined ? sedeActivaId : sedeId
  const q = useQuery({
    queryKey: [CLAVE, clave, organizacion?.id, sid ?? 'todas', JSON.stringify(filtros ?? {}), JSON.stringify(buscar ?? {})],
    enabled: enabled && !!organizacion?.id,
    queryFn: () => leer(vista, { sedeId: sid, sedeCol, filtros, orden, limite, columnas, buscar }),
  })
  return {
    filas: q.data?.data ?? [],
    error: q.data?.error ?? q.error ?? null,
    cargando: q.isLoading,
    refrescar: q.refetch,
  }
}

/** Catálogo de productos (prp_productos): lista y mapa por id. */
export function useProductos() {
  const r = useLectura('productos', 'prp_productos', { sedeCol: false, orden: { columna: 'nombre' }, limite: 5000 })
  const mapa = useMemo(() => Object.fromEntries(r.filas.map(p => [p.id, p])), [r.filas])
  return { ...r, productos: r.filas, mapa }
}

/** Proveedores (prp_proveedores): lista y mapa. */
export function useProveedores() {
  const r = useLectura('proveedores', 'prp_proveedores', { sedeCol: false, orden: { columna: 'nombre' }, limite: 2000 })
  const mapa = useMemo(() => Object.fromEntries(r.filas.map(p => [p.id, p])), [r.filas])
  return { ...r, proveedores: r.filas, mapa }
}

/** Ejecuta una escritura: `fn` devuelve { data, error }. Avisa con toast, invalida las lecturas del clúster y devuelve datos o false. */
export function useAccion() {
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const correr = async (fn, ok) => {
    setOcupado(true)
    try {
      const r = await fn()
      if (r?.error) throw new Error(r.error.message || String(r.error))
      if (ok) toast.success(ok)
      qc.invalidateQueries({ queryKey: [CLAVE] })
      return r?.data ?? true
    } catch (e) {
      toast.error(e.message || 'No se pudo completar la acción')
      return false
    } finally { setOcupado(false) }
  }
  return { correr, ocupado }
}

/** Tira de KPIs. items: [{ title, value, subtitle, color, icon }] */
export function nombreSede(sedes, id) { return sedes.find(s => s.id === id)?.nombre ?? '—' }

export const ESTADO_EXIST = {
  ok: { label: 'OK', v: 'v' },
  en_el_minimo: { label: 'En el mínimo', v: 'a' },
  bajo_minimo: { label: 'Bajo mínimo', v: 'a' },
  sin_existencia: { label: 'Sin existencia', v: 'r' },
  caduca_pronto: { label: 'Caduca pronto', v: 'b' },
  sin_asignar: { label: 'Sin asignar a sede', v: 'n' },
}
export const PRIORIDAD_EXIST = ['sin_existencia', 'bajo_minimo', 'en_el_minimo', 'caduca_pronto', 'ok', 'sin_asignar']
export const etiquetaEstadoExist = e => ESTADO_EXIST[e]?.label ?? e ?? '—'
export const BadgeExist = ({ estado }) => <StatusBadge estado={estado} label={etiquetaEstadoExist(estado)} variante={ESTADO_EXIST[estado]?.v} />

export const TIPO_MOV = {
  compra: 'Compra', venta: 'Venta', traspaso_salida: 'Traspaso salida', traspaso_entrada: 'Traspaso entrada', merma: 'Merma',
  conteo: 'Conteo físico', ajuste: 'Ajuste', consumo_consulta: 'Consumo en consulta', devolucion_proveedor: 'Devolución a proveedor', devolucion_cliente: 'Devolución de cliente',
}
export const ACCION_LOTE = { rematar_o_mermar: 'Rematar o dar de baja', mover_a_otra_sede: 'Mover a otra sede', vigilar: 'Vigilar' }
export const ESTADO_LOTE = { vigente: 'Vigente', bloqueado: 'Bloqueado', agotado: 'Agotado' }

export const CATEGORIAS_PROVEEDOR = {
  insumos: 'Insumos', plantillas_ortesis: 'Plantillas y órtesis', material_clinico: 'Material clínico',
  equipo_instrumental: 'Equipo e instrumental', mantenimiento_equipo: 'Mantenimiento y equipo', operacion: 'Operación',
}

/** Selector de producto con búsqueda por SKU o nombre (datalist). `ids` limita las opciones. */
export function SelectorProducto({ productos, value, onChange, ids, placeholder = 'SKU o nombre del producto…', disabled }) {
  const id = useId()
  const lista = useMemo(() => (ids ? productos.filter(p => ids.has(p.id)) : productos), [productos, ids])
  const etiqueta = p => `${p.sku} · ${p.nombre}`
  const actual = productos.find(p => p.id === value)
  const [texto, setTexto] = useState(null)
  return (
    <>
      <input list={id} disabled={disabled} placeholder={placeholder} value={texto ?? (actual ? etiqueta(actual) : '')}
        onChange={e => {
          setTexto(e.target.value)
          const p = lista.find(x => etiqueta(x) === e.target.value)
          if (p) { onChange(p.id); setTexto(null) } else if (!e.target.value) onChange('')
        }} onBlur={() => setTexto(null)} />
      <datalist id={id}>{lista.slice(0, 600).map(p => <option key={p.id} value={etiqueta(p)} />)}</datalist>
    </>
  )
}

/** Las condiciones de pago se guardan como código (contado | credito | anticipo); datos viejos o importados traen texto libre («Crédito 15 días»). */
export const condicionPago = t => (/anticipo/i.test(t ?? '') ? 'anticipo' : /cr[eé]dito/i.test(t ?? '') ? 'credito' : 'contado')
export const num = v => (v == null || v === '' ? 0 : Number(v))
export const qty = v => (v == null ? '—' : Number(v).toLocaleString('es-MX', { maximumFractionDigits: 3 }))
export const hoy = () => new Date().toISOString().slice(0, 10)
