// Nuevo pedido especial: parte de la nota del cliente. Una nota puede llevar partidas de varios proveedores: se separa en UN pedido por proveedor,
// con un solo anticipo (50 % por omisión, o el del proveedor) y un solo plazo para el saldo. Después se cobra el anticipo en Caja.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { rpc } from '../../../lib/api'
import PageHeader from '../../../components/ui/PageHeader'
import FormField from '../../../components/ui/FormField'
import PacienteBuscador from '../../comercial/componentes/PacienteBuscador'
import CajaCaracteristicas, { recomponer, fraseCaracteristica, importeCaracteristica } from '../../comercial/componentes/CajaCaracteristicas'
import { useLeer } from '../../comercial/componentes/comun'
import { moneda, hoyISO } from '../../../lib/formato'
import { TIPOS_ITEM, PCT_ANTICIPO_DEFECTO, separarPorProveedor, puedeVerCostos } from '../../../lib/plataforma/pedidosEspeciales'
import { useAccionPedido } from './comun'
import ModalCobroPedido from './ModalCobroPedido'

const sumarDias = (iso, d) => { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }
let contador = 0
const nuevaLinea = () => ({ k: ++contador, proveedor_id: '', tipo_item: 'zapato', base_nombre: '', precio_base: '', cantidad: 1, caracteristicas: [], admite_caracteristicas: true, costo: '', abierta: false })
const precioDe = l => (l.admite_caracteristicas ? recomponer({ ...l, precio_base: Number(l.precio_base) || 0 }).precio_unitario : Number(l.precio_base) || 0)

export default function PedidoNuevo() {
  const nav = useNavigate()
  const { rol, sedeActivaId, sedeActiva } = useApp()
  const esAdmin = rol === 'administrador'
  const hoy = hoyISO()
  const [paciente, setPaciente] = useState(null)
  const [prometida, setPrometida] = useState(sumarDias(hoy, 14))
  const [plazo, setPlazo] = useState(sumarDias(hoy, 30))
  const [nota, setNota] = useState('')
  const [pctManual, setPctManual] = useState('')
  const [lineas, setLineas] = useState([nuevaLinea()])
  const [proveedores, setProveedores] = useState([])
  const [errorProv, setErrorProv] = useState(null)
  const [hecho, setHecho] = useState(null)
  const [cobro, setCobro] = useState(null)
  const { correr, ocupado } = useAccionPedido()
  const carQ = useLeer('caracteristicas-activas', 'caracteristicas_producto', { sedeCol: false, filtros: { activa: true }, orden: { columna: 'grupo' }, limite: 300 })

  useEffect(() => { rpc('pedido_proveedores').then(r => { if (r.error) setErrorProv(r.error.message); else setProveedores(r.data ?? []) }) }, [])
  const provDe = id => proveedores.find(p => p.id === id)
  const opcionesProv = tipo => proveedores.filter(p => !(p.tipos?.length) || p.tipos.includes(tipo)).map(p => ({ value: p.id, label: `${p.nombre}${p.whatsapp ? '' : ' (sin grupo de WhatsApp)'}` }))
  const set = (k, c) => setLineas(ls => ls.map(l => (l.k === k ? { ...l, ...c } : l)))

  const calculo = useMemo(() => separarPorProveedor(
    lineas.filter(l => l.proveedor_id).map(l => ({ proveedor_id: l.proveedor_id, cantidad: Number(l.cantidad) || 0, precio_unitario: precioDe(l) })),
    id => (esAdmin && pctManual !== '' ? Number(pctManual) : provDe(id)?.anticipo_pct ?? null), PCT_ANTICIPO_DEFECTO), [lineas, proveedores, pctManual, esAdmin])  // eslint-disable-line

  const errores = []
  if (!paciente) errores.push('Elige al cliente')
  if (!(prometida >= hoy)) errores.push('La fecha prometida no puede estar en el pasado')
  if (!(plazo >= hoy)) errores.push('El plazo del saldo no puede estar en el pasado')
  lineas.forEach((l, i) => {
    if (!l.proveedor_id) errores.push(`Partida ${i + 1}: elige el proveedor`)
    if (!l.base_nombre.trim()) errores.push(`Partida ${i + 1}: describe el producto`)
    if (!(precioDe(l) > 0)) errores.push(`Partida ${i + 1}: captura el precio de venta`)
    if (!(Number(l.cantidad) > 0)) errores.push(`Partida ${i + 1}: cantidad inválida`)
  })

  const guardar = async () => {
    const p_lineas = lineas.map(l => ({
      proveedor_id: l.proveedor_id, tipo_item: l.tipo_item, descripcion: l.base_nombre.trim(), cantidad: Number(l.cantidad), precio_unitario: precioDe(l),
      ...(esAdmin && Number(l.costo) > 0 ? { costo_estimado: Number(l.costo) } : {}),
      caracteristicas: (l.caracteristicas ?? []).map(c => ({ id: c.id, grupo: c.grupo, nombre: c.nombre, frase: fraseCaracteristica(c), valor: c.tipo_valor === 'numero' ? Number(c.valor) : null, unidad: c.unidad ?? null, efecto_precio: c.efecto_precio, monto_unitario: Number(c.monto) || 0, importe: importeCaracteristica(c) })),
    }))
    const r = await correr('pedido_crear', { p_sede: sedeActivaId, p_paciente: paciente.id, p_lineas: p_lineas, p_fecha_prometida: prometida, p_plazo_saldo: plazo, p_nota: nota || null, p_anticipo_pct: esAdmin && pctManual !== '' ? Number(pctManual) : null }, 'Pedido solicitado')
    if (r) setHecho(r)
  }

  if (hecho) {
    return (
      <div className="pagina">
        <PageHeader titulo="Pedido solicitado" subtitulo={`Nota ${hecho.folio} · ${hecho.pedidos.length} pedido${hecho.pedidos.length === 1 ? '' : 's'} (uno por proveedor)`} />
        <div className="card" style={{ maxWidth: 640 }}>
          {hecho.pedidos.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
              <button type="button" className="btn o sm" onClick={() => nav(`/pedidos/${p.id}`)}>{p.folio}</button>
              <span>{moneda(p.total)} · anticipo <b>{moneda(p.anticipo)}</b> · saldo {moneda(p.saldo)}</span></div>))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 14 }}><b>Anticipo total a cobrar</b><b>{moneda(hecho.anticipo)}</b></div>
          <div className="text-muted" style={{ fontSize: 12.5, margin: '8px 0' }}>El pedido sigue «Solicitado» hasta que se cobre el anticipo en Caja; luego el propietario lo autoriza.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Number(hecho.anticipo) > 0 && (rol === 'administrador' || rol === 'recepcion') && <button className="btn" onClick={() => setCobro(hecho.nota_id)}>Cobrar anticipo en Caja</button>}
            <button className="btn o" onClick={() => nav('/pedidos')}>Ir a Pedidos</button>
            <button className="btn o" onClick={() => { setHecho(null); setLineas([nuevaLinea()]); setPaciente(null) }}>Otro pedido</button>
          </div>
        </div>
        {cobro && <ModalCobroPedido modo="anticipo" nota={cobro} sedeId={sedeActivaId} onClose={() => setCobro(null)} onListo={() => nav('/pedidos')} />}
      </div>)
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Nuevo pedido" subtitulo={`Nota del cliente · sucursal ${sedeActiva?.nombre ?? '—'}`} acciones={<button className="btn o" onClick={() => nav('/pedidos')}>Cancelar</button>} />
      {!sedeActivaId && <div className="card" role="alert" style={{ borderLeft: '4px solid var(--red)', marginBottom: 10 }}>Elige una sucursal en el encabezado.</div>}
      {errorProv && <div className="card text-red" role="alert" style={{ marginBottom: 10 }}>No se pudo leer la lista de proveedores: {errorProv}</div>}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Cliente y fechas</h3>
        <FormField label="Cliente" required><PacienteBuscador valor={paciente} onElegir={setPaciente} /></FormField>
        <div className="grid3" style={{ marginTop: 8 }}>
          <FormField label="Fecha prometida de entrega al cliente" type="date" min={hoy} value={prometida} onChange={e => setPrometida(e.target.value)} />
          <FormField label="Plazo límite para pagar el saldo" type="date" min={hoy} value={plazo} onChange={e => setPlazo(e.target.value)} />
          {esAdmin && <FormField label="Anticipo % (solo propietario)" type="number" min="0" max="100" value={pctManual} onChange={e => setPctManual(e.target.value)} placeholder={`el del proveedor o ${PCT_ANTICIPO_DEFECTO}`} />}
        </div>
        <FormField label="Notas del pedido" as="textarea" value={nota} onChange={e => setNota(e.target.value)} placeholder="Talla, pie derecho/izquierdo, observaciones del cliente…" />
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><h3>Partidas</h3>
          <button type="button" className="btn o sm" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}><Plus size={13} /> Agregar partida</button></div>
        {lineas.map((l, i) => (
          <div key={l.k} style={{ borderTop: i ? '1px dashed var(--border)' : 0, paddingTop: i ? 10 : 0, marginTop: i ? 10 : 0 }}>
            <div className="grid3">
              <FormField label="Tipo" as="select" value={l.tipo_item} onChange={e => set(l.k, { tipo_item: e.target.value, proveedor_id: '' })} options={Object.entries(TIPOS_ITEM).map(([value, label]) => ({ value, label }))} />
              <FormField label="Proveedor" as="select" value={l.proveedor_id} onChange={e => set(l.k, { proveedor_id: e.target.value })} options={opcionesProv(l.tipo_item)} />
              <FormField label="Cantidad" type="number" min="1" step="1" value={l.cantidad} onChange={e => set(l.k, { cantidad: e.target.value })} />
            </div>
            <div className="grid3">
              <FormField label="Producto (descripción)" value={l.base_nombre} onChange={e => set(l.k, { base_nombre: e.target.value })} placeholder="Zapato ortopédico talla 26" style={{ gridColumn: 'span 2' }} />
              <FormField label="Precio de venta base (c/u)" type="number" min="0" step="0.01" value={l.precio_base} onChange={e => set(l.k, { precio_base: e.target.value })} hint={l.caracteristicas.length ? `Con características: ${moneda(precioDe(l))}` : undefined} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn o sm" onClick={() => set(l.k, { abierta: !l.abierta })}><SlidersHorizontal size={13} /> Características ({l.caracteristicas.length})</button>
              {esAdmin && <FormField label="Costo estimado c/u (solo propietario)" type="number" min="0" step="0.01" value={l.costo} onChange={e => set(l.k, { costo: e.target.value })} style={{ maxWidth: 240 }} />}
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>Importe <b>{moneda((Number(l.cantidad) || 0) * precioDe(l))}</b></span>
              {lineas.length > 1 && <button type="button" className="btn o sm" aria-label={`Quitar partida ${i + 1}`} onClick={() => setLineas(ls => ls.filter(x => x.k !== l.k))}><Trash2 size={13} /></button>}
            </div>
            {l.abierta && <CajaCaracteristicas linea={{ ...l, precio_base: Number(l.precio_base) || 0 }} catalogo={carQ.filas} onCambio={nl => set(l.k, { caracteristicas: nl.caracteristicas, precio_base: nl.precio_base })} />}
            {l.caracteristicas.length > 0 && !l.abierta && <div className="text-muted" style={{ fontSize: 12.5 }}>{l.caracteristicas.map(fraseCaracteristica).join(' · ')}</div>}
          </div>))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginBottom: 6 }}>Resumen</h3>
        {calculo.pedidos.map(p => (
          <div key={p.proveedor_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '4px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
            <span>Pedido a <b>{provDe(p.proveedor_id)?.nombre}</b> ({p.lineas.length} partida{p.lineas.length === 1 ? '' : 's'})</span>
            <span>{moneda(p.total)} · anticipo {p.pct} % = <b>{moneda(p.anticipo)}</b> · saldo {moneda(p.saldo)}</span></div>))}
        {calculo.pedidos.length > 1 && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>La nota se separa en {calculo.pedidos.length} pedidos (uno por proveedor), con un solo anticipo y cada uno con su propia etapa y fecha.</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 15 }}><b>Anticipo a cobrar en Caja</b><b>{moneda(calculo.anticipo)}</b></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>Saldo por cobrar al entregar (hasta {plazo})</span><span>{moneda(calculo.saldo)}</span></div>
        {!puedeVerCostos(rol) && <div className="text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>El costo de compra lo captura el propietario al autorizar.</div>}
      </div>
      {errores.length > 0 && <ul className="text-red" style={{ fontSize: 12.5, margin: '0 0 8px 18px' }}>{errores.slice(0, 4).map(e => <li key={e}>{e}</li>)}</ul>}
      <button className="btn" disabled={ocupado || !sedeActivaId || errores.length > 0} onClick={guardar}>Solicitar pedido</button>
    </div>
  )
}
