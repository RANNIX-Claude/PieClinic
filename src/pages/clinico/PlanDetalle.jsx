import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import PageHeader from '../../components/ui/PageHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import StatusBadge from '../../components/ui/StatusBadge'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import FormField from '../../components/ui/FormField'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, insertar, actualizar } from '../../lib/api'
import { fecha, moneda, offsetZona, hoyISO } from '../../lib/formato'
import { resumenCumplimiento, diasSinActividad } from '../../lib/clinico/plan'
import { Aviso, Seccion, Volver, useAccion, usePaciente, mensajeError, CabeceraPaciente } from './componentes/comunes'

const ESTADOS_SESION = { por_generar: 'Por generar', agendada: 'Agendada', realizada: 'Realizada', falta: 'Falta', cancelada: 'Cancelada' }

export default function PlanDetalle() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const { sedes } = useApp()
  const puede = usePermiso('planes.editar')
  const { ejecutar, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const [hora, setHora] = useState(sp.get('hora') || '09:00')
  const plan = useQuery({ queryKey: ['clinico', 'plan', id], queryFn: async () => { const r = await leer('planes_tratamiento', { sedeCol: false, filtros: { id }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const ses = useQuery({ queryKey: ['clinico', 'plan-sesiones', id], queryFn: async () => { const r = await leer('sesiones_plan', { sedeCol: false, filtros: { plan_id: id }, orden: { columna: 'numero' } }); if (r.error) throw r.error; return r.data } })
  const pac = usePaciente(plan.data?.paciente_id)
  const auto = useRef(false)
  const p = plan.data
  const sesiones = ses.data ?? []

  async function agendar(lista) {
    const falt = lista.filter(s => s.estado === 'por_generar' && s.fecha_propuesta)
    if (!falt.length) { toast('No hay sesiones por agendar'); return }
    if (!p.servicio_id) { toast.error('El plan no tiene servicio principal: edítalo antes de agendar.'); return }
    const off = offsetZona()
    let ok = 0
    const errores = []
    for (const s of falt) {
      const inicio = new Date(`${s.fecha_propuesta}T${hora}:00${off}`)
      const fin = new Date(inicio.getTime() + s.duracion_min * 60000)
      const c = await insertar('citas', {
        sede_id: p.sede_id, paciente_id: p.paciente_id, servicio_id: p.servicio_id, podologo_id: s.podologo_id ?? p.podologo_id, cabina_id: p.cabina_id ?? s.cabina_id ?? null,
        inicio: inicio.toISOString(), fin: fin.toISOString(), duracion_min: s.duracion_min, tipo_atencion: 'presencial', precio_servicio: Number(s.precio) || 0, seguimiento_garantia: s.tipo === 'curacion',
        origen: 'presencial', plan_tratamiento_id: p.id, sesion_plan_id: s.id, motivo_consulta: s.nombre,
      })
      if (c.error) { errores.push(`${s.nombre}: ${mensajeError(c.error)}`); continue }
      const u = await actualizar('sesiones_plan', s.id, { estado: 'agendada', cita_id: c.data[0].id })
      if (u.error) errores.push(`${s.nombre}: ${mensajeError(u.error)}`); else ok++
    }
    if (ok) toast.success(`${ok} cita${ok === 1 ? '' : 's'} agendada${ok === 1 ? '' : 's'}`)
    if (errores.length) toast.error(errores.join(' · '), { duration: 9000 })
    ses.refetch(); plan.refetch()
  }
  useEffect(() => { if (sp.get('agendar') && p && sesiones.length && !auto.current && puede) { auto.current = true; ejecutar(() => agendar(sesiones).then(() => ({})), { invalidar: ['clinico'] }) } }, [p, sesiones.length]) // eslint-disable-line

  async function cambiarEstado(nuevo, pedirMotivo) {
    let motivo = null
    if (pedirMotivo) { motivo = await confirmar({ titulo: `Marcar como ${nuevo}`, mensaje: 'Queda en la bitácora.', pedirMotivo: true, textoConfirmar: 'Confirmar' }); if (!motivo) return }
    await ejecutar(() => actualizar('planes_tratamiento', id, { estado: nuevo, motivo_estado: motivo }), { ok: `Plan ${nuevo.replace('_', ' ')}`, invalidar: ['clinico'] })
  }
  async function marcarSesion(s, estado) {
    await ejecutar(() => actualizar('sesiones_plan', s.id, { estado }), { ok: `Sesión ${ESTADOS_SESION[estado].toLowerCase()}`, invalidar: ['clinico'] })
  }

  if (plan.isLoading || ses.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (plan.error || ses.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(plan.error ?? ses.error)}</Aviso><Volver a="/planes" /></div>
  if (!p) return <div className="pagina"><Aviso tipo="err">Plan no encontrado.</Aviso><Volver a="/planes" /></div>
  const cum = resumenCumplimiento(sesiones)
  const sede = sedes.find(s => s.id === p.sede_id)
  const sinAct = diasSinActividad(p.updated_at ?? p.created_at, hoyISO())

  return (
    <div className="pagina">
      <PageHeader titulo={p.nombre} subtitulo={`Planes de tratamiento › ${p.folio ?? ''} · ${sede?.nombre ?? ''}`}
        acciones={<>
          <ImprimirHoja titulo={`Plan de tratamiento · ${p.nombre}`} entidad="planes_tratamiento" entidadId={id} etiqueta="Imprimir plan para el paciente">
            <p><b>Paciente:</b> {pac.data?.nombre_completo} · {pac.data?.numero_expediente}</p><p><b>Objetivo:</b> {p.objetivo_alta ?? '—'}</p>
            <table><thead><tr><th>#</th><th>Sesión</th><th>Fecha</th><th>Duración</th><th>Precio</th></tr></thead>
              <tbody>{sesiones.filter(s => s.estado !== 'cancelada').map(s => <tr key={s.id}><td>{s.numero}</td><td>{s.nombre}</td><td>{fecha(s.fecha_propuesta)}</td><td>{s.duracion_min} min</td><td>{s.precio ? moneda(s.precio) : 'Incluida'}</td></tr>)}</tbody></table>
            <p><b>Total del plan:</b> {moneda(p.precio_plan)} · Anticipo: {moneda(p.anticipo_requerido)}</p>
          </ImprimirHoja>
          <Volver a="/planes" />
        </>} />
      <CabeceraPaciente paciente={pac.data} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <StatusBadge estado={p.estado} />{p.motivo_estado && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.motivo_estado}</span>}
        <span style={{ fontSize: 13 }}>{cum.realizadas} de {cum.total} sesiones realizadas · {cum.faltas} faltas · {cum.reprogramaciones} reprogramaciones{cum.atrasadas ? ` · ${cum.atrasadas} atrasadas` : ''}</span>
        {puede && p.estado === 'en_curso' && <><button type="button" className="btn o sm" onClick={() => cambiarEstado('pausado', true)}>Pausar</button><button type="button" className="btn o sm" onClick={() => cambiarEstado('abandonado', true)}>Marcar abandonado</button><button type="button" className="btn o sm" onClick={() => cambiarEstado('concluido', false)}>Concluir</button></>}
        {puede && ['pausado', 'abandonado'].includes(p.estado) && <button type="button" className="btn o sm" onClick={() => cambiarEstado('en_curso', false)}>Reactivar</button>}
      </div>
      {p.estado === 'en_curso' && sinAct >= 25 && <Aviso>{sinAct} días sin actividad: a los 30 días el plan se marca «abandonado» y se cancelan las citas futuras (P-026).</Aviso>}
      <Seccion titulo="Sesiones del plan" acciones={puede && p.estado === 'en_curso' && (<>
        <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={{ width: 'auto' }} aria-label="Hora de las citas" />
        <button type="button" className="btn sm" disabled={ocupado} onClick={() => ejecutar(() => agendar(sesiones).then(() => ({})), { invalidar: ['clinico'] })}>Agendar sesiones por generar</button></>)}>
        <table>
          <thead><tr><th>#</th><th>Sesión</th><th>Procedimiento</th><th>Fecha propuesta</th><th>Duración</th><th className="num">Precio</th><th>Estado</th><th>Cita</th><th></th></tr></thead>
          <tbody>
            {sesiones.map(s => (
              <tr key={s.id}><td>{s.numero}</td><td>{s.nombre}</td><td>{s.procedimiento ?? '—'}</td>
                <td>{fecha(s.fecha_propuesta)}{s.atrasada && <span className="bd a" style={{ marginLeft: 6 }}>Atrasada</span>}</td><td>{s.duracion_min} min</td><td className="num">{s.precio ? moneda(s.precio) : '$0 (incluida)'}</td>
                <td><StatusBadge estado={s.estado} label={ESTADOS_SESION[s.estado]} /></td><td>{s.cita_id ? <Link to="/agenda">Ver cita</Link> : '—'}</td>
                <td>{puede && ['agendada', 'por_generar'].includes(s.estado) && p.estado === 'en_curso' && <button type="button" className="btn o sm" disabled={ocupado} onClick={() => marcarSesion(s, 'falta')}>Falta</button>}</td></tr>))}
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>La sesión pasa a «Realizada» al firmar la consulta ligada a la cita. Inicio {fecha(p.fecha_inicio)}.</div>
      </Seccion>
      {dialogo}
    </div>
  )
}
