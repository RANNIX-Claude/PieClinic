// 46 · Suscripción. Plan por podólogo o por clínica (P-113), prueba y gracia (P-114), cambio de plan al siguiente periodo sin prorrateo (P-116),
// cobros registrados A MANO por RANNIX (sin cobro automático), datos de facturación, soporte y acceso temporal de soporte (P-121). Migración 056.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, ShieldAlert } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { leer, rpc, insertar, actualizar } from '../../../lib/api'
import { moneda, fecha, fechaHora } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useDatos, errMsg, EstadoConsulta } from './comun'

const REGIMENES = ['601', '603', '605', '606', '612', '621', '626']

function Facturacion({ s, puede }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ razon_social: '', rfc: '', regimen_fiscal: '', codigo_postal: '', correo_facturas: '' })
  useEffect(() => { setF({ razon_social: s.razon_social ?? '', rfc: s.rfc ?? '', regimen_fiscal: s.regimen_fiscal ?? '', codigo_postal: s.codigo_postal ?? '', correo_facturas: s.correo_facturas ?? '' }) }, [s])
  async function guardar() {
    if (f.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(f.rfc.toUpperCase())) return toast.error('RFC inválido')
    const r = await rpc('suscripcion_actualizar_facturacion', { p_razon_social: f.razon_social, p_rfc: f.rfc, p_regimen: f.regimen_fiscal, p_cp: f.codigo_postal, p_correo: f.correo_facturas })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Datos de facturación guardados'), qc.invalidateQueries({ queryKey: ['sus-actual'] }))
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Datos de facturación</h3>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>Con estos datos RANNIX emite el CFDI mensual de tu suscripción.</div>
      <div className="grid2">
        <FormField label="Razón social" value={f.razon_social} onChange={e => setF({ ...f, razon_social: e.target.value })} disabled={!puede} />
        <FormField label="RFC" value={f.rfc} onChange={e => setF({ ...f, rfc: e.target.value.toUpperCase() })} disabled={!puede} />
        <FormField label="Régimen fiscal" as="select" value={f.regimen_fiscal} onChange={e => setF({ ...f, regimen_fiscal: e.target.value })} disabled={!puede} options={REGIMENES.map(r => ({ value: r, label: r }))} />
        <FormField label="Código postal" value={f.codigo_postal} onChange={e => setF({ ...f, codigo_postal: e.target.value.replace(/\D/g, '').slice(0, 5) })} disabled={!puede} />
        <FormField label="Correo para facturas" type="email" value={f.correo_facturas} onChange={e => setF({ ...f, correo_facturas: e.target.value })} disabled={!puede} />
      </div>
      <button className="btn" disabled={!puede} onClick={guardar}>Guardar datos</button>
    </div>
  )
}

function Soporte({ puede }) {
  const { user } = useApp()
  const qc = useQueryClient()
  const tickets = useDatos(['sus-tickets'], () => leer('prp_soporte_tickets', { sedeCol: false, orden: { columna: 'created_at', asc: false }, limite: 100 }))
  const accesos = useDatos(['sus-accesos'], () => leer('prp_soporte_accesos', { sedeCol: false, orden: { columna: 'created_at', asc: false }, limite: 50 }))
  const [nuevo, setNuevo] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [acc, setAcc] = useState(null)
  const { confirmar, dialogo } = useConfirmacion()
  const ref = () => { qc.invalidateQueries({ queryKey: ['sus-tickets'] }); qc.invalidateQueries({ queryKey: ['sus-accesos'] }) }
  async function crear() {
    if (!nuevo.asunto.trim()) return toast.error('Escribe el asunto')
    const r = await insertar('soporte_tickets', { asunto: nuevo.asunto.trim(), descripcion: nuevo.descripcion || null, prioridad: nuevo.prioridad })
    r.error ? toast.error(errMsg(r.error)) : (toast.success(`Ticket ${r.data?.[0]?.folio ?? ''} creado`), setNuevo(null), ref())
  }
  async function otorgar() {
    if ((acc.motivo ?? '').trim().length < 5) return toast.error('Escribe el motivo (mínimo 5 caracteres)')
    const venceEn = new Date(Date.now() + acc.horas * 3600 * 1000).toISOString()
    const r = await insertar('soporte_accesos', { motivo: acc.motivo.trim(), alcance: acc.alcance, vence_en: venceEn, ticket_id: acc.ticket_id || null, otorgado_por: user.id })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Acceso temporal otorgado'), setAcc(null), ref())
  }
  async function revocarAcceso(a) {
    if (!(await confirmar({ titulo: 'Revocar acceso de soporte', mensaje: 'El personal de RANNIX perderá el acceso ahora mismo.', peligro: true, textoConfirmar: 'Revocar' }))) return
    const r = await actualizar('soporte_accesos', a.id, { revocado_en: new Date().toISOString() })
    r.error ? toast.error(errMsg(r.error)) : ref()
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><h3 style={{ margin: 0 }}><LifeBuoy size={16} style={{ verticalAlign: -3 }} /> Tickets de soporte</h3>
          <button className="btn" style={{ marginLeft: 'auto' }} disabled={!puede} onClick={() => setNuevo({ asunto: '', descripcion: '', prioridad: 'normal' })}>Nuevo ticket</button></div>
        <EstadoConsulta q={tickets} />
        {!tickets.isLoading && !tickets.isError && !tickets.data?.aviso && <DataTable buscador={false} filas={tickets.data?.data ?? []} onFila={setAbierto} vacio={{ title: 'Sin tickets', description: 'Cuando necesites ayuda de RANNIX, crea un ticket.' }}
          columnas={[{ key: 'folio', label: 'Folio' }, { key: 'asunto', label: 'Asunto' }, { key: 'prioridad', label: 'Prioridad', render: t => <span className={`bd ${t.prioridad === 'urgente' ? 'r' : 'n'}`}>{t.prioridad}</span> },
            { key: 'estado', label: 'Estado', render: t => <StatusBadge estado={t.estado === 'abierto' ? 'abierta' : t.estado} label={t.estado.replace(/_/g, ' ')} /> }, { key: 'mensajes', label: 'Mensajes', align: 'right' }, { key: 'created_at', label: 'Creado', render: t => fecha(t.created_at) }]} />}
      </div>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}><h3 style={{ margin: 0 }}><ShieldAlert size={16} style={{ verticalAlign: -3 }} /> Acceso temporal de soporte</h3>
          <button className="btn o" style={{ marginLeft: 'auto' }} disabled={!puede} onClick={() => setAcc({ motivo: '', alcance: 'metadatos', horas: 24, ticket_id: '' })}>Otorgar acceso</button></div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>RANNIX nunca entra a tu clínica por su cuenta ni ve datos de salud. Tú otorgas un acceso limitado (metadatos o configuración), con motivo, máximo 7 días; queda en la bitácora y lo puedes revocar.</div>
        <DataTable buscador={false} compacto filas={accesos.data?.data ?? []} cargando={accesos.isLoading} vacio={{ title: 'Sin accesos otorgados' }}
          columnas={[{ key: 'motivo', label: 'Motivo' }, { key: 'alcance', label: 'Alcance' }, { key: 'vence_en', label: 'Vence', render: a => fechaHora(a.vence_en) }, { key: 'vigente', label: 'Estado', render: a => <StatusBadge estado={a.revocado_en ? 'cancelada' : a.vigente ? 'activo' : 'vencida'} label={a.revocado_en ? 'revocado' : a.vigente ? 'vigente' : 'vencido'} /> },
            { key: 'a', label: '', sortable: false, render: a => a.vigente && <button className="btn red sm" disabled={!puede} onClick={() => revocarAcceso(a)}>Revocar</button> }]} />
      </div>

      <Modal open={!!nuevo} onClose={() => setNuevo(null)} title="Nuevo ticket de soporte" size="sm" footer={<><button className="btn o" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn" onClick={crear}>Enviar</button></>}>
        {nuevo && <><FormField label="Asunto" required value={nuevo.asunto} onChange={e => setNuevo({ ...nuevo, asunto: e.target.value })} />
          <FormField label="Descripción" as="textarea" rows={5} value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} hint="No incluyas datos de pacientes." />
          <FormField label="Prioridad" as="select" value={nuevo.prioridad} onChange={e => setNuevo({ ...nuevo, prioridad: e.target.value })} options={[{ value: 'normal', label: 'Normal' }, { value: 'urgente', label: 'Urgente' }]} /></>}
      </Modal>
      <Modal open={!!acc} onClose={() => setAcc(null)} title="Otorgar acceso temporal" size="sm" footer={<><button className="btn o" onClick={() => setAcc(null)}>Cancelar</button><button className="btn" onClick={otorgar}>Otorgar</button></>}>
        {acc && <><FormField label="Motivo" required as="textarea" rows={3} value={acc.motivo} onChange={e => setAcc({ ...acc, motivo: e.target.value })} />
          <FormField label="Alcance" as="select" value={acc.alcance} onChange={e => setAcc({ ...acc, alcance: e.target.value })} options={[{ value: 'metadatos', label: 'Solo metadatos de uso' }, { value: 'configuracion', label: 'Configuración de la clínica' }]} hint="Nunca datos clínicos." />
          <FormField label="Duración" as="select" value={acc.horas} onChange={e => setAcc({ ...acc, horas: Number(e.target.value) })} options={[{ value: 24, label: '24 horas' }, { value: 72, label: '3 días' }, { value: 168, label: '7 días (máximo)' }]} />
          <FormField label="Ticket relacionado" as="select" value={acc.ticket_id} onChange={e => setAcc({ ...acc, ticket_id: e.target.value })} options={(tickets.data?.data ?? []).map(t => ({ value: t.id, label: `${t.folio} · ${t.asunto}` }))} placeholder="Ninguno" /></>}
      </Modal>
      {abierto && <TicketModal t={abierto} puede={puede} onClose={() => setAbierto(null)} onCambio={ref} />}
      {dialogo}
    </div>
  )
}

function TicketModal({ t, puede, onClose, onCambio }) {
  const { user } = useApp()
  const qc = useQueryClient()
  const msgs = useDatos(['sus-msgs', t.id], () => leer('soporte_mensajes', { sedeCol: false, filtros: { ticket_id: t.id }, orden: { columna: 'created_at' }, limite: 200 }))
  const [txt, setTxt] = useState('')
  async function enviar() {
    if (!txt.trim()) return
    const r = await insertar('soporte_mensajes', { ticket_id: t.id, autor_tipo: 'clinica', autor_id: user.id, mensaje: txt.trim() })
    r.error ? toast.error(errMsg(r.error)) : (setTxt(''), qc.invalidateQueries({ queryKey: ['sus-msgs', t.id] }), onCambio())
  }
  async function cerrar() { const r = await actualizar('soporte_tickets', t.id, { estado: 'cerrado' }); r.error ? toast.error(errMsg(r.error)) : (toast.success('Ticket cerrado'), onCambio(), onClose()) }
  return (
    <Modal open onClose={onClose} title={`${t.folio} · ${t.asunto}`} footer={<><button className="btn o" onClick={onClose}>Cerrar ventana</button>{puede && t.estado !== 'cerrado' && <button className="btn o" onClick={cerrar}>Cerrar ticket</button>}</>}>
      {t.descripcion && <p style={{ fontSize: 13 }}>{t.descripcion}</p>}
      <div style={{ display: 'grid', gap: 6, margin: '8px 0', maxHeight: 280, overflow: 'auto' }}>
        {(msgs.data?.data ?? []).map(m => <div key={m.id} className="card" style={{ padding: 8, background: m.autor_tipo === 'rannix' ? 'var(--row-line)' : undefined }}><div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.autor_tipo === 'rannix' ? 'RANNIX' : 'Tu clínica'} · {fechaHora(m.created_at)}</div><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.mensaje}</div></div>)}
        {msgs.isLoading && <div style={{ fontSize: 12 }}>Cargando…</div>}
      </div>
      {t.estado !== 'cerrado' && <div style={{ display: 'flex', gap: 8 }}><input style={{ flex: 1 }} placeholder="Escribe un mensaje…" value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} disabled={!puede} /><button className="btn" disabled={!puede} onClick={enviar}>Enviar</button></div>}
    </Modal>
  )
}

export default function Suscripcion() {
  const puede = usePermiso('suscripcion.editar')
  const { sedes } = useApp()
  const qc = useQueryClient()
  const { confirmar, dialogo } = useConfirmacion()
  const [tab, setTab] = useState('plan')
  const sus = useDatos(['sus-actual'], () => leer('prp_suscripcion', { sedeCol: false, limite: 1 }))
  const planes = useDatos(['sus-planes'], () => leer('planes_suscripcion', { sedeCol: false, orden: { columna: 'precio_mensual' }, limite: 10 }))
  const cobros = useDatos(['sus-cobros'], () => leer('prp_cobros_suscripcion', { sedeCol: false, orden: { columna: 'periodo', asc: false }, limite: 60 }))
  const usuarios = useDatos(['sus-usuarios'], () => leer('perfiles', { sedeCol: false, filtros: { activo: true }, columnas: 'id', limite: 1000 }))
  const s = sus.data?.data?.[0]

  async function pedirCambio(plan) {
    const ok = await confirmar({ titulo: 'Solicitar cambio de plan', mensaje: s?.plan_siguiente === plan.clave ? 'Se cancelará el cambio pendiente.' : `El plan «${plan.nombre}» surtirá efecto en el siguiente periodo, sin prorrateo.`, textoConfirmar: 'Solicitar' })
    if (!ok) return
    const r = await rpc('suscripcion_solicitar_cambio_plan', { p_plan: plan.clave })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Cambio de plan registrado'), qc.invalidateQueries({ queryKey: ['sus-actual'] }))
  }

  const aviso = s && (s.estado === 'prueba' ? `Prueba gratuita: te quedan ${s.dias_prueba_restantes ?? 0} día(s). Al terminar, RANNIX te contactará para activar el plan.` : s.estado === 'vencida' ? `Suscripción vencida. Periodo de gracia hasta ${fecha(s.gracia_hasta)}; después la clínica queda en solo lectura (puedes exportar tus datos).` : s.estado === 'suspendida' ? 'La clínica está suspendida: solo lectura y exportación.' : null)

  return (
    <div className="pagina">
      <PageHeader titulo="Suscripción" subtitulo="Tu plan, uso y pagos. Los cobros los registra RANNIX manualmente: el sistema no cobra con tarjeta (P-113)." />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'plan', label: 'Plan y uso' }, { id: 'pagos', label: 'Pagos' }, { id: 'facturacion', label: 'Facturación' }, { id: 'soporte', label: 'Soporte' }]} />
      <div style={{ marginTop: 12 }}>
        {tab !== 'soporte' && <EstadoConsulta q={sus} />}
        {tab === 'plan' && s && (
          <div style={{ display: 'grid', gap: 12 }}>
            {aviso && <div className="card" style={{ padding: '10px 14px', borderLeft: `4px solid ${s.estado === 'prueba' ? 'var(--accent)' : 'var(--red)'}`, fontSize: 13 }}>{aviso}</div>}
            <div className="grid-kpis">
              <KPICard title="Plan actual" value={s.plan_nombre} subtitle={s.plan_clave === 'por_podologo' ? `${s.podologos_activos} podólogo(s) activo(s) × ${moneda(s.precio_mensual)}` : 'Podólogos y sedes ilimitados'} color="var(--accent)" />
              <KPICard title="Cargo mensual (sin IVA)" value={moneda(s.cargo_mensual)} subtitle={`Con IVA ${s.iva_pct}%: ${moneda(s.cargo_mensual_con_iva)}`} color="var(--green)" ayuda="Por podólogo = podólogos activos del mes × precio; podólogo activo es quien tuvo acceso en el mes." />
              <KPICard title="Estado" value={<StatusBadge estado={s.estado === 'activa' ? 'activo' : s.estado} label={s.estado} />} subtitle={s.proximo_cobro ? `Próximo cobro: ${fecha(s.proximo_cobro)}` : 'Sin cobro programado'} color="var(--gold)" />
              <KPICard title="Uso" value={`${sedes?.length ?? 0} sede(s)`} subtitle={`${usuarios.data?.data?.length ?? '—'} usuarios activos`} color="var(--muted)" />
            </div>
            {s.plan_siguiente && <div className="card" style={{ padding: '8px 12px', fontSize: 13 }}>Cambio pendiente: pasarás al plan <b>{(planes.data?.data ?? []).find(p => p.clave === s.plan_siguiente)?.nombre ?? s.plan_siguiente}</b> en el siguiente periodo.</div>}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Elegir plan</h3>
              <div className="grid2">
                {(planes.data?.data ?? []).map(p => (
                  <div key={p.clave} className="card" style={{ border: p.clave === s.plan_clave ? '2px solid var(--accent)' : undefined }}>
                    <b>{p.nombre}</b> {p.clave === s.plan_clave && <span className="bd m">Plan actual</span>}
                    <div style={{ fontSize: 20, fontWeight: 800, margin: '6px 0' }}>{moneda(p.precio_mensual)} <span style={{ fontSize: 12, fontWeight: 400 }}>/ {p.unidad_cobro === 'por_clinica' ? 'clínica' : 'podólogo activo'} al mes + IVA</span></div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', minHeight: 36 }}>{p.descripcion}</div>
                    {p.clave !== s.plan_clave && <button className="btn o sm" disabled={!puede} onClick={() => pedirCambio(p)}>{s.plan_siguiente === p.clave ? 'Cancelar cambio' : 'Cambiar a este plan'}</button>}
                  </div>))}
              </div>
            </div>
          </div>
        )}
        {tab === 'pagos' && s && (<>
          <EstadoConsulta q={cobros} />
          {!cobros.isLoading && !cobros.isError && !cobros.data?.aviso && <DataTable exportarNombre="cobros_suscripcion" filas={cobros.data?.data ?? []} vacio={{ title: 'Sin cobros', description: 'RANNIX registra aquí cada pago de tu suscripción.' }}
            columnas={[{ key: 'periodo', label: 'Periodo', render: c => fecha(c.periodo) }, { key: 'plan_clave', label: 'Plan', filtro: true }, { key: 'unidades', label: 'Unidades', align: 'right' }, { key: 'importe_base', label: 'Importe', align: 'right', render: c => moneda(c.importe_base) },
              { key: 'iva', label: 'IVA', align: 'right', render: c => moneda(c.iva) }, { key: 'total', label: 'Total', align: 'right', render: c => moneda(c.total) }, { key: 'estado', label: 'Estado', filtro: true, render: c => <StatusBadge estado={c.estado === 'proxima' ? 'programada' : c.estado} label={c.estado} /> },
              { key: 'metodo_pago', label: 'Método' }, { key: 'fecha_pago', label: 'Pagado', render: c => (c.fecha_pago ? fecha(c.fecha_pago) : '—') }, { key: 'factura_folio', label: 'Factura' }]} />}
        </>)}
        {tab === 'facturacion' && s && <Facturacion s={s} puede={puede} />}
        {tab === 'soporte' && <Soporte puede={puede} />}
      </div>
      {dialogo}
    </div>
  )
}
