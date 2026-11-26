// Detalle de orden de compra: autorizar, enviar, recibir (parcial o completa, con factura → CxP automática), devolver y cancelar.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { actualizar, insertar, rpc } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'
import { rutaStorage, BUCKETS } from '../../../lib/urlFirmada'
import { moneda, fecha } from '../../../lib/formato'
import { puedeEnviarOC, variacionCosto } from '../../../lib/plataforma/compras'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import ImprimirHoja from '../../../components/ui/ImprimirHoja'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { colCosto, columnasVisibles } from '../../../lib/plataforma/visibilidadCostos'
import { useLectura, useProductos, useAccion, msgError, num, qty, hoy } from './comun'
import { umbralCompra } from './OrdenEditor'

export const ESTADO_OC = { borrador: 'Borrador', enviada: 'Enviada', recibida_parcial: 'Recibida parcial', recibida: 'Recibida', cancelada: 'Cancelada' }
export const ESTADO_PAGO = { sin_pago: '—', por_pagar: 'Por pagar', pagada: 'Pagada' }

export default function OrdenDetalle({ id, onClose, onEditar }) {
  const nav = useNavigate()
  const { organizacion } = useApp()
  const { mapa } = useProductos()
  const { correr, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const puedeEditar = usePermiso('compras.editar')
  const puedeRecibir = usePermiso('inventario.operar')
  const verCostos = usePermiso('inventario.ver_costos')   // recepción recibe mercancía pero NO ve costos, totales ni cuentas por pagar
  const oc = useLectura('oc-det', 'prp_ordenes_compra', { sedeCol: false, filtros: { id } }).filas[0]
  const lineas = useLectura('oc-det-l', 'prp_oc_lineas', { sedeCol: false, filtros: { oc_id: id } })
  const recs = useLectura('oc-det-r', 'prp_recepciones', { sedeCol: false, filtros: { oc_id: id } })
  const cxp = useLectura('oc-det-cxp', 'prp_cuentas_pagar', { sedeCol: false, filtros: { oc_id: id } }, verCostos)
  const [recibiendo, setRecibiendo] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  if (!oc) return <Modal open onClose={onClose} title="Orden de compra"><LoadingSpinner /></Modal>
  const umbral = umbralCompra(organizacion)
  const envio = puedeEnviarOC({ estado: oc.estado, lineas: lineas.filas, total: num(oc.total), umbral, autorizadaPor: oc.autorizada_por, totalAutorizado: num(oc.total) })

  const autorizar = async () => { if (await confirmar({ titulo: 'Autorizar compra', mensaje: `Autorizas la orden ${oc.folio} por ${moneda(oc.total)} a ${oc.proveedor_nombre}.`, textoConfirmar: 'Autorizar' })) await correr(() => rpc('oc_autorizar', { p_oc: id }), 'Orden autorizada') }
  const enviar = async () => { if (await confirmar({ titulo: 'Enviar al proveedor', mensaje: 'Después de enviarla las partidas ya no se pueden modificar.', textoConfirmar: 'Marcar como enviada' })) await correr(() => actualizar('ordenes_compra', id, { estado: 'enviada' }), 'Orden enviada') }
  const cancelar = async () => { const m = await confirmar({ titulo: 'Cancelar orden', pedirMotivo: true, peligro: true, textoConfirmar: 'Cancelar orden', mensaje: 'La orden quedará cancelada y no se podrá recibir.' })
    if (m) await correr(() => actualizar('ordenes_compra', id, { estado: 'cancelada', cancelada_motivo: m }), 'Orden cancelada') }

  return (
    <Modal open onClose={onClose} title={`Orden de compra ${oc.folio}`} size="wide"
      footer={<>
        <ImprimirHoja titulo={`Orden de compra ${oc.folio}`} entidad="ordenes_compra" entidadId={id} etiqueta="Imprimir / PDF" className="btn o" sedeId={oc.sede_id}>
          <p>Proveedor: {oc.proveedor_nombre} · Sucursal que recibe: {oc.sede_nombre} · Fecha: {fecha(oc.fecha)} · Entrega esperada: {oc.entrega_esperada ? fecha(oc.entrega_esperada) : '—'}</p>
          {verCostos ? <>
            <table><thead><tr><th>Producto</th><th>Cant.</th><th>Costo</th><th>Desc.</th><th>IVA</th><th>Importe</th></tr></thead>
              <tbody>{lineas.filas.map(l => <tr key={l.id}><td>{mapa[l.producto_id]?.nombre}</td><td>{qty(l.cantidad)}</td><td>{moneda(l.costo_unitario)}</td><td>{l.descuento_pct} %</td><td>{l.iva_pct} %</td><td>{moneda(l.importe)}</td></tr>)}</tbody></table>
            <p>Subtotal {moneda(oc.subtotal)} · Descuento {moneda(oc.descuento)} · IVA {moneda(oc.iva)} · <b>Total {moneda(oc.total)}</b></p></> : <table><thead><tr><th>Producto</th><th>Pedida</th><th>Recibida</th><th>Pendiente</th></tr></thead>
            <tbody>{lineas.filas.map(l => <tr key={l.id}><td>{mapa[l.producto_id]?.nombre}</td><td>{qty(l.cantidad)}</td><td>{qty(l.cantidad_recibida)}</td><td>{qty(l.pendiente)}</td></tr>)}</tbody></table>}{oc.notas && <p>Notas: {oc.notas}</p>}
        </ImprimirHoja>
        {oc.estado === 'borrador' && puedeEditar && <button className="btn o" onClick={onEditar}>Editar</button>}
        {oc.pendiente_autorizacion && puedeEditar && <button className="btn" disabled={ocupado} onClick={autorizar}>Autorizar</button>}
        {oc.estado === 'borrador' && puedeEditar && <button className="btn" disabled={ocupado || !envio.ok} title={envio.ok ? '' : envio.motivo} onClick={enviar}>Enviar al proveedor</button>}
        {['enviada', 'recibida_parcial'].includes(oc.estado) && puedeRecibir && <button className="btn" disabled={ocupado} onClick={() => setRecibiendo(true)}>Registrar recepción</button>}
        {['recibida', 'recibida_parcial'].includes(oc.estado) && puedeEditar && <button className="btn o" onClick={() => setDevolviendo(true)}>Devolución a proveedor</button>}
        {['borrador', 'enviada'].includes(oc.estado) && puedeEditar && <button className="btn red" disabled={ocupado} onClick={cancelar}>Cancelar</button>}
      </>}>
      {dialogo}
      <div className="grid2" style={{ marginBottom: 10 }}>
        <div><small>Proveedor</small><div><b style={{ cursor: verCostos ? 'pointer' : undefined }} onClick={verCostos ? () => nav(`/proveedores/${oc.proveedor_id}`) : undefined}>{oc.proveedor_nombre}</b></div></div>
        <div><small>Sucursal que recibe</small><div><b>{oc.sede_nombre}</b></div></div>
        <div><small>Fecha / entrega esperada</small><div>{fecha(oc.fecha)} / {oc.entrega_esperada ? fecha(oc.entrega_esperada) : '—'}</div></div>
        {verCostos && <div><small>Pago</small><div>{oc.condiciones_pago}{num(oc.dias_credito) ? ` · ${oc.dias_credito} días` : ''} · {ESTADO_PAGO[oc.estado_pago]}</div></div>}
        <div><small>Estado</small><div><StatusBadge estado={oc.estado} label={ESTADO_OC[oc.estado]} />{oc.pendiente_autorizacion && <span className="bd a" style={{ marginLeft: 6 }}>Pendiente de autorización</span>}{oc.requiere_autorizacion && oc.autorizada_por && <span className="bd v" style={{ marginLeft: 6 }}>Autorizada</span>}</div></div>
        {verCostos && <div><small>Total</small><div><b style={{ fontSize: 16 }}>{moneda(oc.total)}</b> <small>({moneda(oc.subtotal)} + IVA {moneda(oc.iva)} − desc. {moneda(oc.descuento)})</small></div></div>}
      </div>
      {oc.estado === 'borrador' && !envio.ok && <div className="bd a" style={{ display: 'block', whiteSpace: 'normal', marginBottom: 8 }}>No se puede enviar: {envio.motivo}.</div>}
      {oc.cancelada_motivo && <div className="bd r" style={{ marginBottom: 8 }}>Cancelada: {oc.cancelada_motivo}</div>}
      {oc.notas && <div style={{ fontSize: 13, marginBottom: 8 }}>{oc.notas}</div>}
      <DataTable sinPaginacion buscador={false} cargando={lineas.cargando} error={msgError(lineas.error)} filas={lineas.filas}
        columnas={columnasVisibles([
          { key: 'p', label: 'Producto', valor: l => mapa[l.producto_id]?.nombre ?? '—', render: l => <><b>{mapa[l.producto_id]?.nombre}</b><div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.descripcion}</div></> },
          { key: 'cantidad', label: 'Pedida', align: 'right', render: l => qty(l.cantidad) }, { key: 'cantidad_recibida', label: 'Recibida', align: 'right', render: l => qty(l.cantidad_recibida) },
          { key: 'pendiente', label: 'Pendiente', align: 'right', render: l => (num(l.pendiente) > 0 ? <b>{qty(l.pendiente)}</b> : '0') },
          colCosto({ key: 'costo_unitario', label: 'Costo unit.', align: 'right', render: l => moneda(l.costo_unitario) }),
          colCosto({ key: 'variacion_pct', label: 'Var. vs último', align: 'right', render: l => (l.variacion_pct == null ? '—' : <span style={{ color: l.variacion_pct > 0 ? 'var(--red)' : 'var(--green)' }}>{l.variacion_pct > 0 ? '+' : ''}{l.variacion_pct} %</span>) }),
          colCosto({ key: 'descuento_pct', label: 'Desc.', align: 'right', render: l => `${l.descuento_pct} %` }), colCosto({ key: 'iva_pct', label: 'IVA', align: 'right', render: l => `${l.iva_pct} %` }),
          colCosto({ key: 'importe', label: 'Importe', align: 'right', render: l => moneda(l.importe) }),
        ], verCostos)} vacio={{ title: 'Sin partidas' }} />
      {recs.filas.length > 0 && <>
        <h4 style={{ margin: '12px 0 4px' }}>Recepciones</h4>
        <DataTable sinPaginacion buscador={false} filas={recs.filas} columnas={[
          { key: 'folio', label: 'Folio' }, { key: 'fecha', label: 'Fecha', render: r => fecha(r.fecha) }, { key: 'estado', label: 'Estado', render: r => <StatusBadge estado={r.estado === 'completa' ? 'recibida' : 'recibida_parcial'} label={r.estado === 'completa' ? 'Completa' : 'Parcial'} /> },
          { key: 'factura_numero', label: 'Factura', render: r => r.factura_numero ?? '—' }, colCosto({ key: 'factura_importe', label: 'Importe factura', align: 'right', render: r => (r.factura_importe == null ? '—' : moneda(r.factura_importe)) }),
          colCosto({ key: 'factura_vencimiento', label: 'Vence', render: r => (r.factura_vencimiento ? fecha(r.factura_vencimiento) : '—') }),
        ].filter(c => verCostos || !c.costo)} />
      </>}
      {cxp.filas.length > 0 && <div style={{ fontSize: 13, marginTop: 8 }}>Cuenta por pagar generada: {cxp.filas.map(c => <span key={c.id} className="bd m" style={{ marginRight: 6, cursor: 'pointer' }} onClick={() => nav('/cuentas')}>{c.folio_factura ?? 's/f'} · saldo {moneda(c.saldo)} · {c.estado}</span>)}</div>}
      {recibiendo && <Recepcion verCostos={verCostos} oc={oc} lineas={lineas.filas.filter(l => num(l.pendiente) > 0)} mapa={mapa} onClose={() => setRecibiendo(false)} correr={correr} ocupado={ocupado} />}
      {devolviendo && <Devolucion oc={oc} lineas={lineas.filas.filter(l => num(l.cantidad_recibida) > 0)} recepciones={recs.filas} mapa={mapa} onClose={() => setDevolviendo(false)} correr={correr} ocupado={ocupado} />}
    </Modal>
  )
}

function Recepcion({ oc, lineas, mapa, onClose, correr, ocupado, verCostos }) {
  const { organizacion } = useApp()
  const venc = new Date(Date.now() + num(oc.dias_credito) * 86400000).toISOString().slice(0, 10)
  const [v, setV] = useState(() => Object.fromEntries(lineas.map(l => [l.id, { cant: num(l.pendiente), lote: '', cad: '', costo: num(l.costo_unitario) }])))
  const [fac, setFac] = useState({ numero: '', importe: '', vencimiento: venc, cfdi: '', nota: '' })
  const [archivo, setArchivo] = useState(null)
  const set = (id, k, val) => setV(x => ({ ...x, [id]: { ...x[id], [k]: val } }))
  const elegidas = lineas.filter(l => num(v[l.id].cant) > 0)
  const sugerido = elegidas.reduce((s, l) => s + num(v[l.id].cant) * num(v[l.id].costo) * (1 - num(l.descuento_pct) / 100) * (1 + num(l.iva_pct) / 100), 0)
  const errores = []
  if (!elegidas.length) errores.push('Captura la cantidad recibida de al menos una partida')
  lineas.forEach(l => {
    const p = mapa[l.producto_id], x = v[l.id]
    if (num(x.cant) > num(l.pendiente)) errores.push(`${p?.nombre}: no puedes recibir más de lo pendiente (${qty(l.pendiente)})`)
    if (num(x.cant) > 0 && p?.maneja_lote && !x.lote.trim()) errores.push(`${p.nombre}: captura el número de lote`)
    if (num(x.cant) > 0 && p?.maneja_caducidad && !x.cad) errores.push(`${p.nombre}: captura la caducidad`)
  })
  if (fac.numero && !(num(fac.importe) > 0)) errores.push('Captura el importe de la factura')
  const confirmar = async () => {
    const ok = await correr(async () => {
      let url = null
      if (archivo) {
        const ruta = rutaStorage(organizacion.id, 'proveedores', 'facturas', `${Date.now()}_${archivo.name.replace(/[^\w.-]+/g, '_')}`)
        const { error } = await supabase.storage.from(BUCKETS.comprobantes).upload(ruta, archivo, { upsert: false })
        if (error) return { error }
        url = ruta
      }
      return rpc('recepcion_registrar', {
        p_oc: oc.id,
        p_lineas: elegidas.map(l => ({ oc_linea_id: l.id, cantidad_recibida: num(v[l.id].cant), numero_lote: v[l.id].lote || null, caducidad: v[l.id].cad || null, ...(verCostos ? { costo_real: num(v[l.id].costo) } : {}) })),
        p_factura: fac.numero ? { numero: fac.numero, importe: num(fac.importe), url, vencimiento: fac.vencimiento || null, cfdi_uuid: fac.cfdi || null, nota: fac.nota || null } : null,
      })
    }, fac.numero ? 'Recepción registrada: la cuenta por pagar nació de la factura' : 'Recepción registrada')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Recepción de mercancía · ${oc.folio}`} size="wide" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || errores.length > 0} onClick={confirmar}>Confirmar recepción</button></>}>
      <div className="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Pendiente</th><th style={{ textAlign: 'right' }}>Recibe ahora</th><th>Lote</th><th>Caducidad</th>{verCostos && <><th style={{ textAlign: 'right' }}>Costo real</th><th style={{ textAlign: 'right' }}>Var.</th></>}</tr></thead>
        <tbody>{lineas.map(l => { const p = mapa[l.producto_id], x = v[l.id], vr = variacionCosto(l.costo_unitario, x.costo); return (
          <tr key={l.id}><td><b>{p?.nombre}</b>{(p?.maneja_lote || p?.maneja_caducidad) && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.maneja_lote ? 'Lote obligatorio ' : ''}{p.maneja_caducidad ? 'Caducidad obligatoria' : ''}</div>}</td>
            <td style={{ textAlign: 'right' }}>{qty(l.pendiente)}</td>
            <td style={{ textAlign: 'right' }}><input type="number" min="0" step="any" style={{ width: 80 }} value={x.cant} onChange={e => set(l.id, 'cant', e.target.value)} /></td>
            <td><input style={{ width: 100 }} value={x.lote} onChange={e => set(l.id, 'lote', e.target.value)} /></td>
            <td><input type="date" value={x.cad} onChange={e => set(l.id, 'cad', e.target.value)} /></td>
            {verCostos && <><td style={{ textAlign: 'right' }}><input type="number" min="0" step="any" style={{ width: 90 }} value={x.costo} onChange={e => set(l.id, 'costo', e.target.value)} /></td>
            <td style={{ textAlign: 'right', color: vr > 0 ? 'var(--red)' : 'var(--green)' }}>{vr == null || vr === 0 ? '—' : `${vr > 0 ? '+' : ''}${vr} %`}</td></>}</tr>) })}</tbody></table></div>
      <h4 style={{ margin: '12px 0 4px' }}>Factura o remisión del proveedor</h4>
      <div className="grid2">
        <FormField label="Número de factura" value={fac.numero} onChange={e => setFac({ ...fac, numero: e.target.value })} hint="Con factura nace la cuenta por pagar (P-081)" />
        <FormField label="Importe de la factura" type="number" min="0" step="any" value={fac.importe} onChange={e => setFac({ ...fac, importe: e.target.value })} hint={verCostos ? `Sugerido por lo recibido: ${moneda(sugerido)}` : 'Captura el importe que dice la factura del proveedor'} />
        <FormField label="Vence" type="date" value={fac.vencimiento} onChange={e => setFac({ ...fac, vencimiento: e.target.value })} />
        <FormField label="UUID del CFDI (opcional)" value={fac.cfdi} onChange={e => setFac({ ...fac, cfdi: e.target.value })} />
      </div>
      <FormField label="Archivo de la factura (PDF, XML o imagen)"><input type="file" accept=".pdf,.xml,image/*" onChange={e => setArchivo(e.target.files?.[0] ?? null)} /></FormField>
      <FormField label="Nota" value={fac.nota} onChange={e => setFac({ ...fac, nota: e.target.value })} />
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Al recibir: suma existencias a la sede{verCostos ? ', recalcula el costo promedio y guarda el costo en el histórico' : ''}. Si queda pendiente, la orden queda «Recibida parcial».</div>
      {errores.length > 0 && <ul style={{ color: 'var(--red)', fontSize: 12, margin: '6px 0 0 16px' }}>{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </Modal>
  )
}

function Devolucion({ oc, lineas, recepciones, mapa, onClose, correr, ocupado }) {
  const [f, setF] = useState({ producto_id: lineas[0]?.producto_id ?? '', cantidad: '', motivo: '', monto_credito: '', recepcion_id: recepciones[0]?.id ?? '' })
  const l = lineas.find(x => x.producto_id === f.producto_id)
  const invalido = !f.producto_id || !(num(f.cantidad) > 0) || num(f.cantidad) > num(l?.cantidad_recibida) || !f.motivo.trim()
  const guardar = async () => {
    const ok = await correr(() => insertar('devoluciones_proveedor', { sede_id: oc.sede_id, proveedor_id: oc.proveedor_id, producto_id: f.producto_id, cantidad: num(f.cantidad), motivo: f.motivo.trim(), monto_credito: num(f.monto_credito), recepcion_id: f.recepcion_id || null, fecha: hoy() }), 'Devolución registrada: salió del inventario')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Devolución a proveedor · ${oc.folio}`} size="sm"
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || invalido} onClick={guardar}>Registrar devolución</button></>}>
      <FormField label="Producto" as="select" value={f.producto_id} onChange={e => setF({ ...f, producto_id: e.target.value })} options={lineas.map(x => ({ value: x.producto_id, label: `${mapa[x.producto_id]?.nombre} (recibido ${qty(x.cantidad_recibida)})` }))} />
      <FormField label="Recepción" as="select" value={f.recepcion_id} onChange={e => setF({ ...f, recepcion_id: e.target.value })} options={recepciones.map(r => ({ value: r.id, label: `${r.folio} · ${fecha(r.fecha)}` }))} />
      <FormField label="Cantidad" type="number" min="0" step="any" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} error={num(f.cantidad) > num(l?.cantidad_recibida) ? 'Más de lo recibido' : undefined} />
      <FormField label="Motivo" required as="textarea" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} />
      <FormField label="Crédito a favor (MXN)" type="number" min="0" step="any" value={f.monto_credito} onChange={e => setF({ ...f, monto_credito: e.target.value })} hint="Se aplica en la cuenta por pagar del proveedor" />
    </Modal>
  )
}
