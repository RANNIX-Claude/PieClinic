// Editor de orden de compra (borrador): partidas con descuento e IVA por línea (CA-21), variación de costo, sugerencia por mínimos y aviso de autorización por monto (P-081).
import { useState } from 'react'
import { useApp } from '../../../context/AppContext'
import { insertar, actualizar, borrar } from '../../../lib/api'
import { moneda } from '../../../lib/formato'
import { requiereAutorizacion, totalesOCPorLinea, importeLineaOC, variacionCosto, cantidadSugerida, UMBRAL_AUTORIZACION_DEFAULT } from '../../../lib/plataforma/compras'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useLectura, useProductos, useProveedores, useAccion, SelectorProducto, num, qty, hoy, condicionPago } from './comun'

const CONDICIONES = [{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }, { value: 'anticipo', label: 'Anticipo' }]
const ID_NULO = '00000000-0000-0000-0000-000000000000'

export const umbralCompra = organizacion => num(organizacion?.parametros?.compra_autorizacion_desde ?? UMBRAL_AUTORIZACION_DEFAULT) || UMBRAL_AUTORIZACION_DEFAULT

export default function OrdenEditor({ id, inicial, onClose, onGuardada }) {
  const { sedes, sedeActivaId, organizacion } = useApp()
  const { productos, mapa } = useProductos()
  const { proveedores } = useProveedores()
  const { correr, ocupado } = useAccion()
  const umbral = umbralCompra(organizacion)
  const inv = useLectura('oc-inv', 'prp_inventario', { sedeId: null })
  const ex = useLectura('oc-uno', 'prp_ordenes_compra', { sedeCol: false, filtros: { id: id ?? ID_NULO } }, !!id)
  const exL = useLectura('oc-lineas-ed', 'prp_oc_lineas', { sedeCol: false, filtros: { oc_id: id ?? ID_NULO } }, !!id)
  const [provProd, setProvProd] = useState({ id: null, filas: [] })
  const pp = useLectura('oc-provprod', 'proveedor_productos', { sedeCol: false, limite: 5000 })
  const [f, setF] = useState(null)
  const [nuevo, setNuevo] = useState('')

  if (!f && (!id || (ex.filas[0] && !exL.cargando))) {
    const e = ex.filas[0]
    setF(id ? {
      proveedor_id: e.proveedor_id, sede_id: e.sede_id, fecha: e.fecha, entrega_esperada: e.entrega_esperada ?? '', condiciones_pago: condicionPago(e.condiciones_pago), dias_credito: e.dias_credito,
      moneda: e.moneda, referencia_cotizacion: e.referencia_cotizacion ?? '', notas: e.notas ?? '',
      lineas: exL.filas.map(l => ({ producto_id: l.producto_id, descripcion: l.descripcion ?? '', cantidad: l.cantidad, costo_unitario: l.costo_unitario, descuento_pct: l.descuento_pct, iva_pct: l.iva_pct, ultimo_costo: l.ultimo_costo, lineaId: l.id })),
    } : {
      proveedor_id: inicial?.proveedor_id ?? '', sede_id: sedeActivaId ?? sedes[0]?.id ?? '', fecha: hoy(), entrega_esperada: '', condiciones_pago: 'contado', dias_credito: 0,
      moneda: 'MXN', referencia_cotizacion: '', notas: '', lineas: [],
    })
  }
  if (!f) return <Modal open onClose={onClose} title="Orden de compra"><LoadingSpinner /></Modal>

  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const prov = proveedores.find(p => p.id === f.proveedor_id)
  const elegirProveedor = pid => {
    const p = proveedores.find(x => x.id === pid)
    setF(x => ({ ...x, proveedor_id: pid, condiciones_pago: p ? condicionPago(p.condiciones_pago) : x.condiciones_pago, dias_credito: p?.dias_credito ?? x.dias_credito }))
  }
  const costoRef = pid => { const v = pp.filas.find(r => r.proveedor_id === f.proveedor_id && r.producto_id === pid); return v?.ultimo_costo ?? mapa[pid]?.costo_promedio ?? null }
  const agregar = pid => {
    if (!pid || f.lineas.some(l => l.producto_id === pid)) return
    const ref = costoRef(pid)
    setF(x => ({ ...x, lineas: [...x.lineas, { producto_id: pid, descripcion: mapa[pid]?.presentacion ?? '', cantidad: 1, costo_unitario: ref == null ? '' : num(ref), descuento_pct: 0, iva_pct: mapa[pid]?.iva_tipo === '16' ? 16 : 0, ultimo_costo: ref }] }))
    setNuevo('')
  }
  const sugerir = () => {
    const bajo = inv.filas.filter(i => i.sede_id === f.sede_id && num(i.minimo) > 0 && num(i.existencia) < num(i.minimo))
    setF(x => {
      const lineas = [...x.lineas]
      bajo.forEach(i => {
        const q = cantidadSugerida(i)
        if (q <= 0 || lineas.some(l => l.producto_id === i.producto_id)) return
        const ref = costoRef(i.producto_id)
        lineas.push({ producto_id: i.producto_id, descripcion: mapa[i.producto_id]?.presentacion ?? '', cantidad: q, costo_unitario: ref == null ? '' : num(ref), descuento_pct: 0, iva_pct: mapa[i.producto_id]?.iva_tipo === '16' ? 16 : 0, ultimo_costo: ref })
      })
      return { ...x, lineas }
    })
  }
  const lin = (i, k, v) => setF(x => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }))
  const tot = totalesOCPorLinea(f.lineas)
  const pideAut = requiereAutorizacion(tot.total, umbral)
  const errores = []
  if (!f.proveedor_id) errores.push('Elige el proveedor')
  if (!f.sede_id) errores.push('Elige la sucursal que recibe')
  if (!f.lineas.length) errores.push('Agrega al menos un producto')
  f.lineas.forEach(l => { if (!(num(l.cantidad) > 0)) errores.push(`${mapa[l.producto_id]?.nombre}: cantidad inválida`); if (l.costo_unitario === '' || num(l.costo_unitario) < 0) errores.push(`${mapa[l.producto_id]?.nombre}: falta el costo`) })

  const guardar = async () => {
    const r = await correr(async () => {
      let oid = id
      const cab = { sede_id: f.sede_id, proveedor_id: f.proveedor_id, fecha: f.fecha, entrega_esperada: f.entrega_esperada || null, condiciones_pago: f.condiciones_pago, dias_credito: num(f.dias_credito), moneda: f.moneda, referencia_cotizacion: f.referencia_cotizacion || null, notas: f.notas || null }
      if (oid) {
        const a = await actualizar('ordenes_compra', oid, cab); if (a.error) return a
        for (const l of exL.filas) { const b = await borrar('oc_lineas', l.id); if (b.error) return b }
      } else {
        const a = await insertar('ordenes_compra', cab); if (a.error) return a
        oid = a.data?.[0]?.id
      }
      const b = await insertar('oc_lineas', f.lineas.map(l => ({ oc_id: oid, producto_id: l.producto_id, descripcion: l.descripcion || null, cantidad: num(l.cantidad), costo_unitario: num(l.costo_unitario), descuento_pct: num(l.descuento_pct), iva_pct: num(l.iva_pct), ultimo_costo: l.ultimo_costo == null || l.ultimo_costo === '' ? null : num(l.ultimo_costo) })))
      if (b.error) return b
      return { data: oid }
    }, 'Orden guardada como borrador')
    if (r) onGuardada(typeof r === 'string' ? r : id)
  }
  const catalogo = prov ? new Set(pp.filas.filter(r => r.proveedor_id === prov.id).map(r => r.producto_id)) : null
  return (
    <Modal open onClose={onClose} title={id ? 'Editar orden de compra (borrador)' : 'Nueva orden de compra'} size="wide" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn" disabled={ocupado || errores.length > 0} onClick={guardar}>Guardar borrador</button></>}>
      <div className="grid2">
        <FormField label="Proveedor" as="select" required value={f.proveedor_id} onChange={e => elegirProveedor(e.target.value)} options={proveedores.filter(p => p.activo || p.id === f.proveedor_id).map(p => ({ value: p.id, label: `${p.nombre}${p.rfc ? ` · ${p.rfc}` : ''}` }))} />
        <FormField label="Sucursal que recibe" as="select" required value={f.sede_id} onChange={e => set('sede_id', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Fecha de la orden" type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} />
        <FormField label="Entrega esperada" type="date" value={f.entrega_esperada} onChange={e => set('entrega_esperada', e.target.value)} />
        <FormField label="Condiciones de pago" as="select" value={f.condiciones_pago} onChange={e => set('condiciones_pago', e.target.value)} options={CONDICIONES} />
        <FormField label="Días de crédito" type="number" min="0" value={f.dias_credito} onChange={e => set('dias_credito', e.target.value)} />
        <FormField label="Moneda" as="select" value={f.moneda} onChange={e => set('moneda', e.target.value)} options={[{ value: 'MXN', label: 'MXN' }, { value: 'USD', label: 'USD' }]} />
        <FormField label="Referencia de cotización" value={f.referencia_cotizacion} onChange={e => set('referencia_cotizacion', e.target.value)} />
      </div>
      <div className="toolbar" style={{ alignItems: 'flex-end' }}>
        <div style={{ minWidth: 280, flex: 1 }}><SelectorProducto productos={productos} value={nuevo} onChange={agregar} placeholder="Agregar producto (SKU o nombre)…" /></div>
        <button className="btn o" onClick={sugerir} disabled={!f.sede_id}>Sugerir por mínimos de la sede</button>
        {catalogo && catalogo.size > 0 && <button className="btn o" onClick={() => [...catalogo].forEach(agregar)}>Cargar catálogo del proveedor ({catalogo.size})</button>}
      </div>
      <div className="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th>Presentación</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Costo unit. (sin IVA)</th><th style={{ textAlign: 'right' }}>Último costo</th><th style={{ textAlign: 'right' }}>Var.</th><th style={{ textAlign: 'right' }}>Desc. %</th><th style={{ textAlign: 'right' }}>IVA %</th><th style={{ textAlign: 'right' }}>Importe</th><th /></tr></thead>
        <tbody>
          {f.lineas.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 14 }}>Sin partidas</td></tr>}
          {f.lineas.map((l, i) => { const v = variacionCosto(l.ultimo_costo, l.costo_unitario); return (
            <tr key={l.producto_id}>
              <td><b>{mapa[l.producto_id]?.nombre}</b><div style={{ fontSize: 11, color: 'var(--muted)' }}>{mapa[l.producto_id]?.sku}</div></td>
              <td><input value={l.descripcion} style={{ width: 120 }} onChange={e => lin(i, 'descripcion', e.target.value)} /></td>
              <td style={{ textAlign: 'right' }}><input type="number" min="0" step="any" style={{ width: 70 }} value={l.cantidad} onChange={e => lin(i, 'cantidad', e.target.value)} /></td>
              <td style={{ textAlign: 'right' }}><input type="number" min="0" step="any" style={{ width: 90 }} value={l.costo_unitario} onChange={e => lin(i, 'costo_unitario', e.target.value)} /></td>
              <td style={{ textAlign: 'right' }}>{l.ultimo_costo == null ? '—' : moneda(l.ultimo_costo)}</td>
              <td style={{ textAlign: 'right', color: v > 0 ? 'var(--red)' : 'var(--green)' }}>{v == null ? '—' : `${v > 0 ? '+' : ''}${v} %`}</td>
              <td style={{ textAlign: 'right' }}><input type="number" min="0" max="100" style={{ width: 60 }} value={l.descuento_pct} onChange={e => lin(i, 'descuento_pct', e.target.value)} /></td>
              <td style={{ textAlign: 'right' }}><input type="number" min="0" max="100" style={{ width: 60 }} value={l.iva_pct} onChange={e => lin(i, 'iva_pct', e.target.value)} /></td>
              <td style={{ textAlign: 'right' }}>{moneda(importeLineaOC({ ...l, cantidad: num(l.cantidad), costo_unitario: num(l.costo_unitario), descuento_pct: num(l.descuento_pct), iva_pct: num(l.iva_pct) }).importe)}</td>
              <td><button className="btn o sm" onClick={() => setF(x => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }))}>✕</button></td></tr>) })}
        </tbody></table></div>
      <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13 }}>
        Subtotal {moneda(tot.subtotal)} · Descuento −{moneda(tot.descuento)} · IVA {moneda(tot.iva)} · <b style={{ fontSize: 15 }}>TOTAL {moneda(tot.total)}</b> · {qty(f.lineas.reduce((s, l) => s + num(l.cantidad), 0))} unidades
      </div>
      {pideAut && <div className="bd a" style={{ display: 'block', marginTop: 8, whiteSpace: 'normal' }}>Este total es de {moneda(umbral)} o más: Administración debe autorizar la orden antes de enviarla al proveedor (P-081). Si cambias el total después de autorizar, la autorización se pierde.</div>}
      <FormField label="Notas al proveedor" as="textarea" value={f.notas} onChange={e => set('notas', e.target.value)} placeholder="Horario de entrega, factura, etc." />
      {errores.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12, margin: '6px 0 0 16px' }}>{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </Modal>
  )
}
