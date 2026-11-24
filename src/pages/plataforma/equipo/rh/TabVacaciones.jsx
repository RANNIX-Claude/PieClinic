// Vacaciones (E127): saldo por año, solicitudes, autorización y bloqueo de agenda (P-047). Clon de TabVacacionesRH de IRP.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import KPICard from '../../../../components/ui/KPICard'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../../components/ui/ConfirmDialog'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar, rpc } from '../../../../lib/api'
import { moneda, fecha } from '../../../../lib/formato'
import { diasSolicitados, validarSolicitud, primaVacacional, diasDerechoAnio } from '../../../../lib/plataforma/vacaciones'
import { useVista, Estado, useEscribir, hoy } from '../comun'

const DIAS_PERIODO = { semanal: 7, quincenal: 15, mensual: 30 }

export default function TabVacaciones({ empleadoId }) {
  const puede = usePermiso('rh.editar')
  const { user, organizacion } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const [anio, setAnio] = useState(Number(hoy().slice(0, 4)))
  const filtroEmp = empleadoId ? { empleado_id: empleadoId } : {}
  const qa = useVista(['vac-anio', anio, empleadoId], 'prp_vacaciones_anio', { filtros: { anio, ...filtroEmp }, orden: [{ columna: 'nombre_completo' }], limite: 500 }, { conSede: false })
  const qd = useVista(['vac-det', anio, empleadoId], 'prp_vacaciones_detalle', { filtros: { anio, ...filtroEmp }, orden: [{ columna: 'fecha_inicio', asc: false }], limite: 1000 })
  const qe = useVista('empleados-activos', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 500 })
  const [nueva, setNueva] = useState(null)
  const primerAnio = Number(organizacion?.parametros?.vacaciones_dias_primer_anio ?? 12)
  const saldo = useMemo(() => Object.fromEntries((qa.data ?? []).map(a => [a.empleado_id, a])), [qa.data])
  const hoyIso = hoy()
  const enVacaciones = (qd.data ?? []).filter(d => ['autorizada', 'tomada'].includes(d.estado) && d.fecha_inicio <= hoyIso && d.fecha_fin >= hoyIso)
  const proximas = (qd.data ?? []).filter(d => d.estado === 'autorizada' && d.fecha_inicio > hoyIso)

  const generar = async () => {
    const lista = (qe.data ?? []).filter(e => !empleadoId || e.id === empleadoId)
    const ok = await ejecutar(async () => { for (const e of lista) { const r = await rpc('vacaciones_generar_anio', { p_empleado: e.id, p_anio: anio }); if (r.error) return r } return {} }, `Saldos ${anio} generados con los días de ley`)
    return ok
  }
  const emp = (qe.data ?? []).find(e => e.id === (nueva?.empleado_id ?? empleadoId))
  const dias = nueva?.desde && nueva?.hasta ? diasSolicitados(nueva.desde, nueva.hasta, { excluirDomingos: nueva.sinDomingos }) : 0
  const disp = saldo[emp?.id]?.dias_disponibles ?? (emp ? diasDerechoAnio(emp.fecha_ingreso, anio, primerAnio) : 0)
  const sueldoDiario = emp ? Number(emp.salario_periodo) / (DIAS_PERIODO[emp.periodicidad_pago] ?? 15) : 0
  const existentes = (qd.data ?? []).filter(d => d.empleado_id === emp?.id).map(d => ({ desde: d.fecha_inicio, hasta: d.fecha_fin, estado: d.estado }))
  const val = nueva ? validarSolicitud({ desde: nueva.desde, hasta: nueva.hasta, dias, saldo: disp, existentes }) : null

  const guardar = async () => {
    if (!emp || !val.ok) { toast.error(val?.errores?.[0] ?? 'Elige empleado'); return }
    const a = Number(nueva.desde.slice(0, 4))
    const ok = await ejecutar(async () => {
      const r0 = await rpc('vacaciones_generar_anio', { p_empleado: emp.id, p_anio: a })
      if (r0.error) return r0
      return insertar('vacaciones_detalle', { sede_id: emp.sede_id, empleado_id: emp.id, anio: a, fecha_inicio: nueva.desde, fecha_fin: nueva.hasta, dias, prima: nueva.prima === '' ? null : Number(nueva.prima), notas: nueva.notas || null })
    }, 'Solicitud registrada')
    if (ok) setNueva(null)
  }
  const cambiar = (d, estado, extra = {}) => ejecutar(() => actualizar('vacaciones_detalle', d.id, { estado, ...extra }), `Vacaciones ${estado}`)
  const cancelar = async d => { const m = await confirmar({ titulo: 'Cancelar vacaciones', mensaje: `${d.nombre_completo}: ${fecha(d.fecha_inicio)} – ${fecha(d.fecha_fin)}`, peligro: true, pedirMotivo: true, textoConfirmar: 'Cancelar vacaciones' }); if (m) cambiar(d, 'cancelada', { notas: `${d.notas ? `${d.notas} · ` : ''}Cancelada: ${m}` }) }

  return (
    <>
      <div className="grid-kpis">
        <KPICard title="En vacaciones hoy" value={enVacaciones.length} subtitle={enVacaciones.map(d => d.nombre_completo).join(', ') || 'Nadie'} loading={qd.isLoading} />
        <KPICard title="Autorizadas próximas" value={proximas.length} subtitle={proximas.slice(0, 2).map(d => `${d.nombre_completo.split(' ')[0]} ${fecha(d.fecha_inicio)}`).join(' · ') || '—'} color="var(--accent2)" loading={qd.isLoading} />
        <KPICard title="Solicitudes por autorizar" value={(qd.data ?? []).filter(d => d.estado === 'solicitada').length} color="var(--gold)" loading={qd.isLoading} />
      </div>
      <div className="toolbar">
        <FormField label="Año" as="select" options={[anio + 1, anio, anio - 1, anio - 2].map(a => ({ value: a, label: a }))} value={anio} onChange={e => setAnio(Number(e.target.value))} style={{ maxWidth: 120 }} />
        {puede && <><button className="btn o sm" style={{ marginLeft: 'auto' }} onClick={generar} disabled={ocupado}>Generar saldos {anio} (días de ley)</button>
          <button className="btn sm" onClick={() => setNueva({ empleado_id: empleadoId ?? '', desde: '', hasta: '', sinDomingos: true, prima: '', notas: '' })}>+ Solicitar vacaciones</button></>}
      </div>
      <h3 style={{ fontSize: 13, margin: '4px 0 8px' }}>Saldos {anio}</h3>
      <Estado q={qa}>
        <DataTable buscador={!empleadoId} exportarNombre={`vacaciones_saldos_${anio}`} filas={qa.data ?? []} vacio={{ title: `Sin saldos ${anio}`, description: 'Usa «Generar saldos» para calcular los días de ley por antigüedad.' }}
          columnas={[{ key: 'numero_empleado', label: 'No.' }, { key: 'nombre_completo', label: 'Empleado' }, { key: 'dias_derecho', label: 'Derecho', align: 'right' }, { key: 'dias_tomados', label: 'Tomados / autorizados', align: 'right' },
            { key: 'dias_disponibles', label: 'Disponibles', align: 'right', render: a => <b style={{ color: Number(a.dias_disponibles) <= 2 ? 'var(--red)' : undefined }}>{a.dias_disponibles}</b> }]} />
      </Estado>
      <h3 style={{ fontSize: 13, margin: '16px 0 8px' }}>Solicitudes y periodos</h3>
      <Estado q={qd}>
        <DataTable buscador={!empleadoId} exportarNombre={`vacaciones_${anio}`} filas={qd.data ?? []} vacio={{ title: 'Sin solicitudes', description: 'No hay solicitudes de vacaciones este año.' }}
          columnas={[
            { key: 'nombre_completo', label: 'Empleado' },
            { key: 'fecha_inicio', label: 'Periodo', render: d => `${fecha(d.fecha_inicio)} – ${fecha(d.fecha_fin)}` },
            { key: 'dias', label: 'Días', align: 'right' },
            { key: 'prima', label: 'Prima vacacional', align: 'right', render: d => (d.prima == null ? '—' : moneda(d.prima)) },
            { key: 'estado', label: 'Estado', filtro: true, render: d => <StatusBadge estado={d.estado} /> },
            { key: 'a', label: '', sortable: false, exportar: false, render: d => puede && (
              <span style={{ display: 'flex', gap: 4 }}>
                {d.estado === 'solicitada' && <button className="btn green sm" onClick={() => cambiar(d, 'autorizada', { autorizada_por: user?.id })}>Autorizar</button>}
                {d.estado === 'autorizada' && <button className="btn o sm" onClick={() => cambiar(d, 'tomada')}>Marcar tomada</button>}
                {['solicitada', 'autorizada'].includes(d.estado) && <button className="btn o sm" onClick={() => cancelar(d)}>Cancelar</button>}
              </span>) },
          ]} />
      </Estado>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Las vacaciones autorizadas o tomadas bloquean la agenda del podólogo (prp_vacaciones_bloqueos). Días de ley: {primerAnio} el primer año, +2 por año hasta el 5.º y +2 cada 5 años; validar con asesoría laboral.</div>
      <Modal open={!!nueva} onClose={() => setNueva(null)} title="Solicitar vacaciones" size="sm" footer={<><button className="btn o" onClick={() => setNueva(null)}>Cancelar</button><button className="btn" disabled={ocupado || !val?.ok} onClick={guardar}>Registrar solicitud</button></>}>
        {nueva && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Empleado" as="select" disabled={!!empleadoId} options={(qe.data ?? []).map(e => ({ value: e.id, label: `${e.numero_empleado} · ${e.nombre_completo}` }))} value={nueva.empleado_id} onChange={e => setNueva({ ...nueva, empleado_id: e.target.value })} />
          <FormField label="Desde" type="date" value={nueva.desde} onChange={e => setNueva({ ...nueva, desde: e.target.value })} />
          <FormField label="Hasta" type="date" value={nueva.hasta} onChange={e => setNueva({ ...nueva, hasta: e.target.value })} />
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={nueva.sinDomingos} onChange={e => setNueva({ ...nueva, sinDomingos: e.target.checked })} /> No contar domingos</label>
          <div style={{ fontSize: 13 }}>Días solicitados: <b>{dias}</b> · Saldo disponible: <b>{disp}</b></div>
          <FormField label="Prima vacacional (MXN)" type="number" step="0.01" value={nueva.prima} onChange={e => setNueva({ ...nueva, prima: e.target.value })} hint={emp && dias ? `Sugerida 25 %: ${moneda(primaVacacional(dias, sueldoDiario))}` : undefined} />
          <FormField label="Notas" value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} />
          {val && !val.ok && nueva.desde && nueva.hasta && val.errores.map(e => <div key={e} style={{ color: 'var(--red)', fontSize: 12 }}>{e}</div>)}
        </div>}
      </Modal>
      {dialogo}
    </>
  )
}
