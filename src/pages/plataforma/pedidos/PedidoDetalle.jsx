// Detalle de un pedido especial: datos, partidas, petición al proveedor (mensaje listo para copiar), línea de tiempo y acciones por etapa según el rol.
// Toda acción es una RPC (migración 321): la base vuelve a validar rol, sucursal y transición. Los costos solo los ve administración (la base los manda en null a los demás).
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Send, CheckCircle2, Truck, PackageCheck, Banknote, XCircle, Ban, Play, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../../context/AppContext'
import { rpc } from '../../../lib/api'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import DataTable from '../../../components/ui/DataTable'
import { moneda, fecha, fechaHora, hoyISO } from '../../../lib/formato'
import { ESTADOS, ETAPAS, TIPOS_ITEM, CANALES, AVISO_MENSAJERIA, accionesDisponibles, puedeVerCostos } from '../../../lib/plataforma/pedidosEspeciales'
import { useLectura, msgError, EstadoPedido, Semaforo, useAccionPedido } from './comun'
import ModalCobroPedido from './ModalCobroPedido'

const ACCION_TXT = { cobrar_anticipo: ['Cobrar anticipo', Banknote], autorizar: ['Autorizar', CheckCircle2], rechazar: ['Rechazar', XCircle], enviar: ['Enviar al proveedor', Send],
  registrar_aceptacion: ['Registrar aceptación', CheckCircle2], proveedor_rechaza: ['El proveedor rechazó', XCircle], registrar_transito: ['Registrar envío', Truck], recibir: ['Marcar recibido', PackageCheck],
  entregar: ['Entregar y cobrar saldo', Banknote], reanudar: ['Reanudar', Play], cancelar: ['Cancelar pedido', Ban] }
const DESTINOS = [{ value: 'devolucion', label: 'Devolver el anticipo al cliente' }, { value: 'saldo_favor', label: 'Dejarlo como saldo a favor del cliente' }]

export default function PedidoDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const { rol, user, sedes } = useApp()
  const verCostos = puedeVerCostos(rol)
  const { correr, ocupado } = useAccionPedido()
  const pq = useLectura('pedido', 'prp_pedidos_especiales', { sedeId: null, sedeCol: false, filtros: { id } })
  const lq = useLectura('pedido-lineas', 'prp_pedido_lineas', { sedeId: null, sedeCol: false, filtros: { pedido_id: id }, orden: { columna: 'orden' } })
  const bq = useLectura('pedido-bitacora', 'prp_pedido_bitacora', { sedeId: null, sedeCol: false, filtros: { pedido_id: id }, orden: { columna: 'en', asc: true } })
  const mq = useLectura('pedido-mensajes', 'prp_pedido_mensajes', { sedeId: null, sedeCol: false, filtros: { pedido_id: id }, orden: { columna: 'enviado_en', asc: false } })
  const hermanos = useLectura('pedido-nota', 'prp_pedidos_especiales', { sedeId: null, sedeCol: false, filtros: { nota_id: pq.filas[0]?.nota_id } }, !!pq.filas[0]?.nota_id)
  const p = pq.filas[0]
  const [modal, setModal] = useState(null)
  const [mensaje, setMensaje] = useState('')

  const cargarMensaje = async () => { const r = await rpc('pedido_mensaje', { p_pedido: id }); if (!r.error) setMensaje(r.data ?? '') }
  useEffect(() => { if (p && ['autorizado', 'enviado_proveedor'].includes(p.estado)) cargarMensaje() }, [p?.id, p?.estado]) // eslint-disable-line

  const acciones = useMemo(() => (p ? accionesDisponibles({ estado: p.estado, rol, esSolicitante: p.solicitado_por === user?.id, anticipoMonto: Number(p.anticipo_monto) }) : []), [p, rol, user])
  if (pq.cargando) return <div className="pagina"><LoadingSpinner /></div>
  if (pq.error || !p) return <div className="pagina"><EmptyState title={pq.error ? 'No se pudo cargar' : 'Pedido no encontrado'} description={pq.error ? msgError(pq.error) : 'No existe o no es de tu sucursal.'} action={<button className="btn o" onClick={() => nav('/pedidos')}>Volver a Pedidos</button>} /></div>

  const copiar = async () => { try { await navigator.clipboard.writeText(mensaje); toast.success('Mensaje copiado: pégalo en el grupo de WhatsApp del proveedor') } catch { toast.error('No se pudo copiar; selecciona el texto') } }
  const enviar = async canal => { const r = await correr('pedido_enviar', { p_pedido: id, p_canal: canal, p_texto: mensaje || null }, canal === 'copiado_manual' ? 'Registrado como enviado al grupo del proveedor' : 'Petición enviada (simulado)'); if (r) setModal(null) }
  const reembolso = async () => { const r = await correr('registrar_reembolso_anticipo', { p_anticipo: p.anticipo_id, p_modo: 'manual', p_referencia: 'Devuelto al cliente (pedido ' + p.folio + ')' }, 'Reembolso registrado'); if (r) setModal(null) }
  const reembolsoPendiente = p.anticipo_estado === 'reembolsado' && p.anticipo_reembolso_estado === 'solicitado'
  const lugar = sedes?.find(s => s.id === p.sede_id)?.nombre ?? p.sede_nombre
  const hoy = hoyISO()

  return (
    <div className="pagina">
      <PageHeader titulo={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{p.folio} <EstadoPedido estado={p.estado} /> <Semaforo valor={p.semaforo} dias={p.dias_retraso} />{p.saldo_vencido && <span className="bd r">Saldo vencido</span>}</span>}
        subtitulo={`Nota ${p.nota_folio} · ${p.paciente_nombre} · ${p.proveedor_nombre ?? 'proveedor'} · ${lugar}`}
        acciones={<button className="btn o" onClick={() => nav('/pedidos')}><ArrowLeft size={14} /> Pedidos</button>} />

      {acciones.length > 0 && (
        <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: 13 }}>Siguiente paso:</b>
          {acciones.map(a => { const [t, Ic] = ACCION_TXT[a]; return <button key={a} className={`btn ${['rechazar', 'cancelar', 'proveedor_rechaza'].includes(a) ? 'red' : a === 'reanudar' ? 'o' : ''}`} disabled={ocupado} onClick={() => setModal(a)}><Ic size={14} /> {t}</button> })}
          {reembolsoPendiente && rol !== 'podologo' && <button className="btn o" onClick={() => setModal('reembolso')}>Registrar reembolso entregado</button>}
        </div>)}
      {acciones.length === 0 && reembolsoPendiente && rol !== 'podologo' && <div className="card" style={{ marginBottom: 12 }}><button className="btn o" onClick={() => setModal('reembolso')}>Registrar reembolso entregado al cliente</button></div>}
      {p.estado === 'en_espera' && (
        <div className="card" role="status" style={{ borderLeft: '4px solid var(--gold)', marginBottom: 12, fontSize: 13.5 }}>
          <b>En espera</b> — {p.espera_origen === 'propietario' ? 'rechazado por el propietario' : 'rechazado por el proveedor'}: «{p.espera_motivo}». Anticipo: <b>{p.destino_anticipo === 'devolucion' ? `se devuelve al cliente${reembolsoPendiente ? ' (reembolso pendiente de entregar)' : ' (reembolso registrado)'}` : 'queda como saldo a favor del cliente'}</b>.
          <div className="text-muted" style={{ fontSize: 12 }}>Política por omisión pendiente de decisión del dueño: el usuario elige al rechazar.</div>
        </div>)}
      {p.estado === 'cancelado' && <div className="card" style={{ borderLeft: '4px solid var(--muted)', marginBottom: 12, fontSize: 13.5 }}><b>Cancelado</b>: {p.cancelado_motivo}. Anticipo: {p.destino_anticipo ? (p.destino_anticipo === 'devolucion' ? 'devuelto al cliente' : 'saldo a favor') : 'sin anticipo'}.</div>}

      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Total" value={moneda(p.total)} subtitle={`${p.partidas} partida${p.partidas === 1 ? '' : 's'}`} />
        <KPICard title={`Anticipo ${p.anticipo_pct} %`} value={moneda(p.anticipo_monto)} subtitle={p.anticipo_estado ? `${p.anticipo_folio ?? ''} · ${p.anticipo_estado}` : 'por cobrar en Caja'} color="var(--green)" />
        <KPICard title="Saldo" value={moneda(p.saldo)} subtitle={`límite ${fecha(p.plazo_saldo)}`} color="var(--gold)" />
        <KPICard title="Entrega prometida" value={fecha(p.fecha_prometida)} subtitle={p.fecha_acordada ? `proveedor: ${fecha(p.fecha_acordada)}` : 'sin fecha del proveedor'} />
        {verCostos && <KPICard title="Costo estimado" value={p.costo_estimado == null ? '—' : moneda(p.costo_estimado)} subtitle={Number(p.partidas_sin_costo) ? `${p.partidas_sin_costo} partida(s) sin costo` : 'solo propietario'} />}
      </div>

      <EtapasBarra estado={p.estado} />

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Partidas</h3>
            <DataTable sinPaginacion buscador={false} cargando={lq.cargando} filas={lq.filas}
              columnas={[
                { key: 'descripcion', label: 'Producto', render: l => <><b>{l.descripcion}</b> <span className="bd n">{TIPOS_ITEM[l.tipo_item]}</span>{(l.caracteristicas ?? []).length > 0 && <div className="text-muted" style={{ fontSize: 12 }}>{l.caracteristicas.map(c => c.frase).join(' · ')}</div>}</> },
                { key: 'cantidad', label: 'Cant.', align: 'right', render: l => Number(l.cantidad) },
                { key: 'precio_unitario', label: 'Precio', align: 'right', render: l => moneda(l.precio_unitario) }, { key: 'importe', label: 'Importe', align: 'right', render: l => moneda(l.importe) },
                ...(verCostos ? [{ key: 'costo_unitario', label: 'Costo est.', align: 'right', render: l => (l.costo_unitario == null ? '—' : moneda(l.costo_unitario)) }] : []),
              ]} vacio={{ title: 'Sin partidas', description: '' }} />
            {hermanos.filas.length > 1 && (
              <div style={{ marginTop: 8, fontSize: 12.5 }}>Otros pedidos de la misma nota: {hermanos.filas.filter(h => h.id !== p.id).map(h => <Link key={h.id} to={`/pedidos/${h.id}`} style={{ marginRight: 8 }}>{h.folio} ({ESTADOS[h.estado]})</Link>)}</div>)}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Petición al proveedor</h3>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>{AVISO_MENSAJERIA} Lleva el cliente solo por iniciales y la referencia de la nota: nunca datos personales ni precios.</div>
            {mensaje ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: 'var(--bg-soft, rgba(127,127,127,.08))', borderRadius: 8, padding: 10, margin: 0 }}>{mensaje}</pre>
              : <div className="text-muted" style={{ fontSize: 13 }}>El mensaje se arma cuando el propietario autoriza el pedido.</div>}
            {mensaje && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn o" onClick={copiar}><Copy size={14} /> Copiar mensaje</button>
              {p.estado === 'autorizado' && acciones.includes('enviar') && <button className="btn" onClick={() => setModal('enviar')}><Send size={14} /> Enviar (simulado)</button>}
            </div>}
            {mq.filas.length > 0 && <div style={{ marginTop: 10, fontSize: 12.5 }}><b>Lo enviado:</b>{mq.filas.map(m => <div key={m.id} className="text-muted">{fechaHora(m.enviado_en)} · {CANALES[m.canal]} → {m.destino ?? 'proveedor'} · {m.enviado_por_nombre}</div>)}</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="card" style={{ fontSize: 13.5 }}>
            <h3 style={{ marginBottom: 6 }}>Seguimiento</h3>
            <Dato k="Solicitado por" v={p.solicitado_por_nombre} /><Dato k="Autorizado" v={p.autorizado_en ? `${fechaHora(p.autorizado_en)} · ${p.autorizado_por_nombre}` : null} />
            <Dato k="Enviado al proveedor" v={p.mensaje_enviado_en ? fechaHora(p.mensaje_enviado_en) : null} />
            <Dato k="Aceptado" v={p.aceptado_en ? `${fechaHora(p.aceptado_en)} · entrega acordada ${fecha(p.fecha_acordada)}${p.respuesta_proveedor ? ` · «${p.respuesta_proveedor}»` : ''}` : null} />
            <Dato k="Envío" v={p.guia_envio ? `${p.guia_envio}${p.fecha_estimada_llegada ? ` · llega ~${fecha(p.fecha_estimada_llegada)}` : ''}` : null} />
            <Dato k="Recibido" v={p.recibido_en ? `${fechaHora(p.recibido_en)} · ${p.recibido_por_nombre}` : null} />
            <Dato k="Entregado" v={p.entregado_en ? `${fechaHora(p.entregado_en)} · saldo cobrado ${moneda(p.saldo_cobrado)}` : null} />
          </div>
          <div className="card" style={{ fontSize: 13.5 }}>
            <h3 style={{ marginBottom: 6 }}>Ligas</h3>
            <Dato k="Cliente" v={<Link to={`/clientes/${p.paciente_id}`}>{p.paciente_nombre}</Link>} />
            <Dato k="Orden de compra" v={p.oc_folio ? (rol === 'administrador' || rol === 'recepcion' ? <Link to={`/compras?oc=${p.oc_id}`}>{p.oc_folio}</Link> : p.oc_folio) : null} />
            <Dato k="Cuenta por pagar" v={p.cuenta_pagar_id && rol === 'administrador' ? <Link to={`/proveedores/${p.proveedor_id}?tab=cxp`}>ver en el proveedor</Link> : (p.cuenta_pagar_id ? 'abierta (solo propietario)' : null)} />
            <Dato k="Ticket de la entrega" v={p.venta_id ? <Link to={`/caja?tab=tickets`}>ver en Caja</Link> : null} />
            {rol === 'administrador' && <Dato k="Proveedor" v={<Link to={`/proveedores/${p.proveedor_id}?tab=pedidos`}>{p.proveedor_nombre}</Link>} />}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 6 }}><Clock size={15} style={{ verticalAlign: -2 }} /> Línea de tiempo</h3>
            {bq.filas.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>Sin movimientos.</div>}
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {bq.filas.map(b => (
                <li key={b.id} style={{ borderLeft: '3px solid var(--accent, #6b4fa0)', paddingLeft: 10, fontSize: 13 }}>
                  <div><b>{b.accion === 'recordatorio' ? 'Recordatorio' : b.accion === 'costos' ? 'Costos capturados' : ESTADOS[b.estado_nuevo] ?? b.estado_nuevo}</b> <span className="text-muted">· {fechaHora(b.en)} · {b.usuario_nombre ?? 'sistema'}</span></div>
                  {b.motivo && <div className="text-muted" style={{ fontSize: 12.5 }}>{b.motivo}</div>}
                </li>))}
            </ol>
          </div>
        </div>
      </div>

      {modal === 'cobrar_anticipo' && <ModalCobroPedido modo="anticipo" nota={p.nota_id} sedeId={p.sede_id} onClose={() => setModal(null)} />}
      {modal === 'entregar' && <ModalCobroPedido modo="entrega" pedido={p} onClose={() => setModal(null)} />}
      {modal === 'autorizar' && <ModalAutorizar pedido={p} lineas={lq.filas} correr={correr} ocupado={ocupado} onClose={() => setModal(null)} />}
      {modal === 'enviar' && (
        <Modal open onClose={() => setModal(null)} title="Enviar la petición al proveedor" size="sm" footer={<><button className="btn o" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn o" disabled={ocupado} onClick={() => enviar('copiado_manual')}>Ya la copié al grupo</button><button className="btn" disabled={ocupado} onClick={() => enviar('whatsapp_simulado')}>Enviar (simulado)</button></>}>
          <div className="text-muted" style={{ fontSize: 13 }}>{AVISO_MENSAJERIA} La orden de compra queda «Enviada» y el pedido pasa a «Enviado al proveedor».</div>
          <FormField label="Mensaje (puedes ajustarlo antes de enviar)" as="textarea" rows={9} value={mensaje} onChange={e => setMensaje(e.target.value)} />
        </Modal>)}
      {modal === 'registrar_aceptacion' && <ModalAceptacion hoy={hoy} correr={correr} ocupado={ocupado} id={id} onClose={() => setModal(null)} />}
      {modal === 'registrar_transito' && <ModalTransito correr={correr} ocupado={ocupado} id={id} onClose={() => setModal(null)} />}
      {modal === 'recibir' && <ModalRecibir pedido={p} verFactura={rol === 'administrador'} correr={correr} ocupado={ocupado} id={id} onClose={() => setModal(null)} />}
      {['rechazar', 'proveedor_rechaza', 'cancelar'].includes(modal) && <ModalDetener tipo={modal} pedido={p} correr={correr} ocupado={ocupado} onClose={() => setModal(null)} />}
      {modal === 'reanudar' && <ModalReanudar pedido={p} correr={correr} ocupado={ocupado} onClose={() => setModal(null)} />}
      {modal === 'reembolso' && (
        <Modal open onClose={() => setModal(null)} title="Registrar reembolso entregado" size="sm" footer={<><button className="btn o" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={reembolso}>Ya se le devolvió al cliente</button></>}>
          <div style={{ fontSize: 13.5 }}>Confirma que el anticipo de <b>{moneda(p.anticipo_monto)}</b> ya se devolvió al cliente. Queda registro con tu usuario y la hora.</div>
        </Modal>)}
    </div>
  )
}

const Dato = ({ k, v }) => (v ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', borderBottom: '1px dashed var(--border)' }}><span className="text-muted">{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div> : null)

function EtapasBarra({ estado }) {
  const idx = ETAPAS.indexOf(estado)
  return (
    <div role="list" aria-label="Etapas del pedido" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
      {ETAPAS.map((e, i) => (
        <span key={e} role="listitem" className={`bd ${i < idx ? 'v' : i === idx ? 'm' : 'n'}`} aria-current={i === idx ? 'step' : undefined} style={{ opacity: idx === -1 ? 0.5 : 1 }}>{i + 1}. {ESTADOS[e]}</span>))}
    </div>)
}

function ModalAutorizar({ pedido, lineas, correr, ocupado, onClose }) {
  const [costos, setCostos] = useState(() => Object.fromEntries(lineas.map(l => [l.id, l.costo_unitario ?? ''])))
  const falta = lineas.some(l => !(Number(costos[l.id]) > 0))
  const autorizar = async () => {
    const r = await correr('pedido_autorizar', { p_pedido: pedido.id, p_costos: lineas.map(l => ({ linea_id: l.id, costo: Number(costos[l.id]) })) }, 'Pedido autorizado: se generó la orden de compra al proveedor')
    if (r) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Autorizar ${pedido.folio}`} size="sm" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || falta} onClick={autorizar}>Autorizar y crear orden de compra</button></>}>
      <div className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>Confirma el costo estimado de compra de cada partida (solo tú lo ves). Se crea la orden de compra a {pedido.proveedor_nombre}, ya autorizada.</div>
      {lineas.map(l => <FormField key={l.id} label={`${l.descripcion} (venta ${moneda(l.precio_unitario)})`} type="number" min="0" step="0.01" value={costos[l.id]} onChange={e => setCostos(c => ({ ...c, [l.id]: e.target.value }))} placeholder="Costo unitario sin IVA" />)}
    </Modal>)
}

function ModalAceptacion({ hoy, id, correr, ocupado, onClose }) {
  const [f, setF] = useState({ fecha: '', resp: '' })
  const ok = async () => { const r = await correr('pedido_registrar_aceptacion', { p_pedido: id, p_fecha_acordada: f.fecha, p_respuesta: f.resp || null }, 'Aceptación registrada'); if (r) onClose() }
  return (
    <Modal open onClose={onClose} title="Respuesta del proveedor: aceptado" size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.fecha} onClick={ok}>Registrar aceptación</button></>}>
      <FormField label="Fecha de entrega acordada" required type="date" min={hoy} value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
      <FormField label="Respuesta del proveedor (opcional)" as="textarea" value={f.resp} onChange={e => setF({ ...f, resp: e.target.value })} placeholder="Lo mandan en 5 días hábiles…" />
    </Modal>)
}

function ModalTransito({ id, correr, ocupado, onClose }) {
  const [f, setF] = useState({ guia: '', llega: '' })
  const ok = async () => { const r = await correr('pedido_registrar_transito', { p_pedido: id, p_guia: f.guia, p_fecha_estimada: f.llega || null }, 'Envío registrado: en tránsito'); if (r) onClose() }
  return (
    <Modal open onClose={onClose} title="Pedido en tránsito" size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado || !f.guia.trim()} onClick={ok}>Registrar envío</button></>}>
      <FormField label="Guía o referencia del envío" required value={f.guia} onChange={e => setF({ ...f, guia: e.target.value })} placeholder="Estafeta 1234567890" />
      <FormField label="Fecha estimada de llegada" type="date" value={f.llega} onChange={e => setF({ ...f, llega: e.target.value })} />
    </Modal>)
}

function ModalRecibir({ pedido, verFactura, id, correr, ocupado, onClose }) {
  const [f, setF] = useState({ numero: '', importe: '', vence: '' })
  const conFactura = verFactura && f.numero.trim() && Number(f.importe) > 0
  const ok = async () => {
    const r = await correr('pedido_recibir', { p_pedido: id, p_factura: conFactura ? { numero: f.numero.trim(), importe: Number(f.importe), ...(f.vence ? { vencimiento: f.vence } : {}) } : null, p_nota: null }, 'Recibido: entró al inventario de la sucursal y se abrió la cuenta por pagar del proveedor')
    if (r) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Marcar ${pedido.folio} como recibido`} size="sm" cerrarAlClicFuera={false} footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado} onClick={ok}>Marcar recibido</button></>}>
      <div style={{ fontSize: 13.5, marginBottom: 8 }}>Confirma que la pieza llegó a la sucursal. Queda tu nombre, la fecha y la hora. Se registra la recepción de mercancía de la orden de compra, la pieza queda en el inventario de la sucursal (reservada para el cliente) y se abre la cuenta por pagar del proveedor con su vencimiento según sus condiciones de pago.</div>
      {verFactura && <><div className="text-muted" style={{ fontSize: 12.5 }}>Factura del proveedor (opcional; también se puede asentar después):</div>
        <div className="grid3"><FormField label="Folio" value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} /><FormField label="Importe c/IVA" type="number" min="0" step="0.01" value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} /><FormField label="Vence" type="date" value={f.vence} onChange={e => setF({ ...f, vence: e.target.value })} /></div></>}
    </Modal>)
}

function ModalDetener({ tipo, pedido, correr, ocupado, onClose }) {
  const [f, setF] = useState({ motivo: '', destino: '' })
  const conAnticipo = !!pedido.anticipo_id && !pedido.destino_anticipo
  const titulo = { rechazar: 'Rechazar el pedido (propietario)', proveedor_rechaza: 'El proveedor rechazó el pedido', cancelar: 'Cancelar el pedido' }[tipo]
  const fn = { rechazar: 'pedido_rechazar', proveedor_rechaza: 'pedido_proveedor_rechaza', cancelar: 'pedido_cancelar' }[tipo]
  const ok = async () => { const r = await correr(fn, { p_pedido: pedido.id, p_motivo: f.motivo, p_destino: f.destino || null }, tipo === 'cancelar' ? 'Pedido cancelado' : 'Pedido en espera'); if (r) onClose() }
  return (
    <Modal open onClose={onClose} title={titulo} size="sm" cerrarAlClicFuera={false} footer={<><button className="btn o" onClick={onClose}>Volver</button><button className="btn red" disabled={ocupado || !f.motivo.trim() || (conAnticipo && !f.destino)} onClick={ok}>{tipo === 'cancelar' ? 'Cancelar pedido' : 'Dejar en espera'}</button></>}>
      <FormField label="Motivo" required as="textarea" value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="Queda en la bitácora con tu nombre y hora" />
      {conAnticipo && <FormField label={`¿Qué pasa con el anticipo de ${moneda(pedido.anticipo_monto)}?`} required as="select" value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })} options={DESTINOS} hint="Queda registrado. La política por omisión la define el dueño." />}
      {tipo !== 'cancelar' && <div className="text-muted" style={{ fontSize: 12.5 }}>El pedido queda «En espera» con el motivo; la orden de compra al proveedor se cancela y se puede reanudar después.</div>}
    </Modal>)
}

function ModalReanudar({ pedido, correr, ocupado, onClose }) {
  const [prov, setProv] = useState('')
  const [lista, setLista] = useState([])
  useEffect(() => { rpc('pedido_proveedores').then(r => setLista(r.data ?? [])) }, [])
  const ok = async () => { const r = await correr('pedido_reanudar', { p_pedido: pedido.id, p_proveedor: prov || null }, 'Pedido reanudado'); if (r) onClose() }
  return (
    <Modal open onClose={onClose} title="Reanudar el pedido" size="sm" footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado} onClick={ok}>Reanudar</button></>}>
      <div style={{ fontSize: 13.5, marginBottom: 8 }}>{pedido.destino_anticipo === 'saldo_favor' ? 'El anticipo sigue a favor del cliente: el pedido vuelve a «Anticipo cobrado» para que el propietario lo autorice.' : 'El anticipo ya se devolvió: el pedido vuelve a «Solicitado» y hay que cobrar un anticipo nuevo en Caja.'}</div>
      <FormField label="Cambiar de proveedor (opcional)" as="select" value={prov} onChange={e => setProv(e.target.value)} options={lista.map(p => ({ value: p.id, label: p.nombre }))} placeholder="Mismo proveedor" />
    </Modal>)
}
