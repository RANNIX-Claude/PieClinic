// 48 · Panel RANNIX (superadministrador). Solo metadatos de uso y cobro: nunca datos de salud (MATRIZ_ROLES §3.3).
// Todo pasa por la función servidor `rannix-panel` ({accion, args} → {data} | {error}); las RPC rannix_* verifican app.es_rannix().
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Copy } from 'lucide-react'
import { moneda, fecha } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { bitacoraExportar } from '../../../lib/bitacora'
import { invocar } from './comun'
import { useQuery } from '@tanstack/react-query'

const rannix = (accion, args = {}) => invocar('rannix-panel', { accion, args })
export function useRannix(clave, accion, args) {
  return useQuery({ queryKey: ['rannix', clave], queryFn: async () => { const r = await rannix(accion, args); if (r.error) throw new Error(r.error); return r.data }, retry: false })
}

const ESTADOS = { prueba: 'En prueba', activa: 'Activa', suspendida: 'Suspendida', baja: 'Baja' }
const mesActual = () => new Date().toISOString().slice(0, 7) + '-01'

export default function RannixPanel() {
  const qc = useQueryClient()
  const resumen = useRannix('resumen', 'panel_resumen')
  const clinicas = useRannix('clinicas', 'panel_clinicas')
  const porSuspender = useRannix('por-suspender', 'clinicas_por_suspender')
  const [modal, setModal] = useState(null) // { tipo, clinica }
  const [f, setF] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const [resultadoAlta, setResultadoAlta] = useState(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['rannix'] })
  const abrir = (tipo, clinica, inicial = {}) => { setF(inicial); setResultadoAlta(null); setModal({ tipo, clinica }) }

  async function ejecutar(accion, args, exito) {
    setOcupado(true); const r = await rannix(accion, args); setOcupado(false)
    if (r.error) { toast.error(r.error, { duration: 6000 }); return null }
    toast.success(exito); refrescar(); return r.data
  }
  async function cambiarEstado() {
    if ((f.motivo ?? '').trim().length < 5) return toast.error('El cambio de estado exige motivo (mínimo 5 caracteres)')
    if (await ejecutar('cambiar_estado_org', { p_org: modal.clinica.organizacion_id, p_estado: f.estado, p_motivo: f.motivo.trim() }, 'Estado actualizado')) setModal(null)
  }
  async function registrarPago() {
    if (!f.fecha_pago || !f.metodo) return toast.error('Indica el método y la fecha de pago')
    if (await ejecutar('registrar_pago', { p_org: modal.clinica.organizacion_id, p_periodo: f.periodo, p_metodo: f.metodo, p_fecha_pago: f.fecha_pago, p_referencia: f.referencia || null, p_factura_folio: f.factura || null, p_notas: f.notas || null }, 'Pago registrado')) setModal(null)
  }
  async function alta() {
    if (!f.nombre?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email ?? '')) return toast.error('Nombre y correo del administrador son obligatorios')
    const d = await ejecutar('alta_clinica', { p_nombre: f.nombre.trim(), p_razon_social: f.razon || null, p_email_admin: f.email.trim(), p_plan: f.plan, p_prueba_dias: Number(f.dias) }, 'Clínica creada')
    if (d) setResultadoAlta(d)
  }
  async function marcarVencida(c) {
    if (!window.confirm(`¿Marcar la suscripción de «${c.nombre}» como vencida y abrir el periodo de gracia?`)) return
    await ejecutar('marcar_vencida', { p_org: c.organizacion_id }, 'Suscripción marcada como vencida')
  }
  const exportar = () => { bitacoraExportar('rannix_clinicas', { filas: clinicas.data?.length ?? 0 }) }

  const r = resumen.data
  const error = resumen.error || clinicas.error
  return (
    <div className="pagina">
      <PageHeader titulo="Panel de clínicas" subtitulo="Superadministrador RANNIX · todas las organizaciones. Solo metadatos de uso y cobro; nunca datos de salud."
        acciones={<button className="btn" onClick={() => abrir('alta', null, { plan: 'por_podologo', dias: 14 })}><Plus size={14} style={{ verticalAlign: -2 }} /> Alta de clínica</button>} />
      {(resumen.isLoading || clinicas.isLoading) && <LoadingSpinner />}
      {error && <EmptyState title="No se pudo cargar el panel" description={`${error.message} Este panel solo funciona con la función servidor «rannix-panel» y una sesión de personal de RANNIX.`} />}
      {r && (
        <div className="grid-kpis">
          <KPICard title="Clínicas activas" value={r.activas} subtitle={`${r.en_prueba} en prueba · ${r.suspendidas} suspendida(s) · ${r.baja} de baja`} color="var(--green)" />
          <KPICard title="Ingreso recurrente (MRR)" value={moneda(r.mrr)} subtitle="Mensual, sin IVA, clínicas activas" color="var(--accent)" />
          <KPICard title="Cobros vencidos" value={r.cobros_vencidos} subtitle={`${r.cobros_pendientes} pendiente(s) del mes`} color="var(--red)" />
          <KPICard title="Tickets abiertos" value={r.tickets_abiertos} subtitle={`${r.tickets_urgentes} urgente(s)`} color="var(--gold)" />
        </div>
      )}
      {porSuspender.data?.length > 0 && (
        <div className="card" style={{ margin: '10px 0', borderLeft: '4px solid var(--gold)' }}>
          <b>Por decidir (prueba o gracia vencidas):</b>
          <ul style={{ margin: '6px 0 0', fontSize: 13 }}>{porSuspender.data.map(c => <li key={c.organizacion_id}>{c.nombre} — {c.motivo} desde {fecha(c.desde)} · <button className="btn o sm" onClick={() => abrir('estado', { organizacion_id: c.organizacion_id, nombre: c.nombre, estado: c.estado }, { estado: 'suspendida', motivo: c.motivo })}>Suspender…</button></li>)}</ul>
        </div>
      )}
      {clinicas.data && (
        <div style={{ marginTop: 10 }}>
          <DataTable exportarNombre="clinicas_rannix" placeholderBusqueda="Buscar clínica…" filas={clinicas.data} filaKey="organizacion_id" onFila={undefined}
            acciones={<button className="btn o sm" onClick={() => { refrescar(); exportar() }}>Actualizar</button>}
            vacio={{ title: 'Sin clínicas', description: 'Da de alta la primera clínica.' }}
            columnas={[
              { key: 'nombre', label: 'Clínica' },
              { key: 'plan', label: 'Plan', filtro: true, valor: c => (c.plan === 'por_clinica' ? 'Por clínica' : 'Por podólogo') },
              { key: 'estado', label: 'Estado', filtro: true, valor: c => ESTADOS[c.estado] ?? c.estado, render: c => <StatusBadge estado={c.estado === 'activa' ? 'activo' : c.estado} label={ESTADOS[c.estado] ?? c.estado} /> },
              { key: 'dias_prueba_restantes', label: 'Prueba', align: 'right', valor: c => c.dias_prueba_restantes, render: c => (c.dias_prueba_restantes != null ? `${c.dias_prueba_restantes} d` : '—') },
              { key: 'sedes', label: 'Sedes', align: 'right' }, { key: 'usuarios_activos', label: 'Usuarios', align: 'right' }, { key: 'podologos_activos', label: 'Podólogos', align: 'right' },
              { key: 'citas_mes', label: 'Citas mes', align: 'right' }, { key: 'almacenamiento_gb', label: 'GB', align: 'right' },
              { key: 'cargo_mensual', label: 'Cargo mensual', align: 'right', render: c => moneda(c.cargo_mensual) },
              { key: 'ultimo_cobro_estado', label: 'Último cobro', filtro: true, valor: c => c.ultimo_cobro_estado ?? 'Sin cobros', render: c => (c.ultimo_cobro_estado ? <StatusBadge estado={c.ultimo_cobro_estado === 'proxima' ? 'programada' : c.ultimo_cobro_estado} label={`${c.ultimo_cobro_estado} · ${fecha(c.ultimo_cobro_periodo)}`} /> : '—') },
              { key: 'tickets_abiertos', label: 'Tickets', align: 'right' },
              { key: 'acc', label: '', sortable: false, exportar: false, render: c => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn o sm" onClick={() => abrir('pago', c, { periodo: mesActual(), metodo: 'transferencia', fecha_pago: new Date().toISOString().slice(0, 10) })}>Registrar pago</button>
                  {c.estado === 'suspendida' || c.estado === 'prueba' ? <button className="btn o sm" onClick={() => abrir('estado', c, { estado: 'activa', motivo: '' })}>Activar…</button> : c.estado === 'activa' ? <button className="btn red sm" onClick={() => abrir('estado', c, { estado: 'suspendida', motivo: '' })}>Suspender…</button> : null}
                  {c.estado === 'activa' && c.suscripcion_estado !== 'vencida' && <button className="btn o sm" onClick={() => marcarVencida(c)}>Marcar vencida</button>}
                </div>) },
            ]} />
        </div>
      )}

      <Modal open={modal?.tipo === 'estado'} onClose={() => setModal(null)} title={`Cambiar estado · ${modal?.clinica?.nombre ?? ''}`} size="sm" footer={<><button className="btn o" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={cambiarEstado}>Aplicar</button></>}>
        <FormField label="Nuevo estado" as="select" value={f.estado ?? ''} onChange={e => setF({ ...f, estado: e.target.value })} options={Object.entries(ESTADOS).map(([v, l]) => ({ value: v, label: l }))} />
        <FormField label="Motivo" required as="textarea" rows={3} value={f.motivo ?? ''} onChange={e => setF({ ...f, motivo: e.target.value })} hint="Queda en la bitácora de la clínica. Suspendida o baja = solo lectura y exportación." />
      </Modal>
      <Modal open={modal?.tipo === 'pago'} onClose={() => setModal(null)} title={`Registrar pago · ${modal?.clinica?.nombre ?? ''}`} size="sm" footer={<><button className="btn o" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={registrarPago}>Registrar</button></>}>
        <FormField label="Periodo (mes)" type="month" value={(f.periodo ?? '').slice(0, 7)} onChange={e => setF({ ...f, periodo: `${e.target.value}-01` })} />
        <FormField label="Método" as="select" value={f.metodo ?? ''} onChange={e => setF({ ...f, metodo: e.target.value })} options={[{ value: 'transferencia', label: 'Transferencia' }, { value: 'deposito', label: 'Depósito' }, { value: 'efectivo', label: 'Efectivo' }, { value: 'otro', label: 'Otro' }]} />
        <FormField label="Fecha de pago" type="date" value={f.fecha_pago ?? ''} onChange={e => setF({ ...f, fecha_pago: e.target.value })} />
        <FormField label="Referencia" value={f.referencia ?? ''} onChange={e => setF({ ...f, referencia: e.target.value })} />
        <FormField label="Folio de factura" value={f.factura ?? ''} onChange={e => setF({ ...f, factura: e.target.value })} />
        <FormField label="Notas" as="textarea" rows={2} value={f.notas ?? ''} onChange={e => setF({ ...f, notas: e.target.value })} />
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>El importe se calcula con el plan y los podólogos activos; un pago al corriente reactiva la suscripción vencida.</div>
      </Modal>
      <Modal open={modal?.tipo === 'alta'} onClose={() => setModal(null)} title="Alta de clínica" size="sm" footer={resultadoAlta ? <button className="btn" onClick={() => setModal(null)}>Listo</button> : <><button className="btn o" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={alta}>Crear clínica</button></>}>
        {resultadoAlta ? (
          <div style={{ fontSize: 13 }}>
            <p>Clínica creada en prueba. Entrega esta invitación al administrador (se muestra una sola vez):</p>
            <div className="card" style={{ padding: 8, wordBreak: 'break-all', fontSize: 12 }}>{resultadoAlta.enlace ?? resultadoAlta.token}</div>
            {!resultadoAlta.enlace && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Es el token; el enlace completo lo arma la función servidor cuando esté configurada la URL de invitación.</div>}
            <button className="btn o sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(resultadoAlta.enlace ?? resultadoAlta.token); toast.success('Copiado') }}><Copy size={12} style={{ verticalAlign: -2 }} /> Copiar</button>
          </div>
        ) : (<>
          <FormField label="Nombre de la clínica" required value={f.nombre ?? ''} onChange={e => setF({ ...f, nombre: e.target.value })} />
          <FormField label="Razón social" value={f.razon ?? ''} onChange={e => setF({ ...f, razon: e.target.value })} />
          <FormField label="Correo del administrador" required type="email" value={f.email ?? ''} onChange={e => setF({ ...f, email: e.target.value })} />
          <FormField label="Plan" as="select" value={f.plan ?? 'por_podologo'} onChange={e => setF({ ...f, plan: e.target.value })} options={[{ value: 'por_podologo', label: 'Por podólogo ($400/mes + IVA)' }, { value: 'por_clinica', label: 'Por clínica ($1,000/mes + IVA)' }]} />
          <FormField label="Días de prueba" type="number" min={0} value={f.dias ?? 14} onChange={e => setF({ ...f, dias: e.target.value })} />
        </>)}
      </Modal>
    </div>
  )
}
