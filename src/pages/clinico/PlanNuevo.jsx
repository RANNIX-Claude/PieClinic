import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, rpc, actualizar } from '../../lib/api'
import { hoyISO, moneda, fecha } from '../../lib/formato'
import { generarSesionesPlan, totalPlan, saldoTrasAnticipo } from '../../lib/clinico/plan'
import { CATEGORIAS_DIAGNOSTICO } from '../../lib/clinico/catalogos'
import { Aviso, Seccion, PacienteBuscador, usePaciente, useVista, useAccion, Volver, limpiar, num, CabeceraPaciente } from './componentes/comunes'

const FORMAS = [{ value: 'todo_primera', label: 'Todo en la sesión 1' }, { value: 'por_sesion', label: 'Por sesión' }, { value: 'plan_adquirido', label: 'Con plan adquirido (paquete)' }]

export default function PlanNuevo() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { sedes, sedeActivaId, perfil, rol, organizacion } = useApp()
  const puede = usePermiso('planes.editar')
  const { ejecutar, ocupado } = useAccion()
  const [paciente, setPaciente] = useState(null)
  const pUrl = usePaciente(sp.get('paciente'))
  useEffect(() => { if (pUrl.data && !paciente) setPaciente(pUrl.data) }, [pUrl.data]) // eslint-disable-line
  const [f, setF] = useState({
    plantilla_id: '', nombre: '', podologo_id: rol === 'podologo' ? perfil?.id : '', sede_id: sedeActivaId ?? (sedes.length === 1 ? sedes[0].id : ''), cabina_id: '', servicio_id: '',
    diagnostico_categoria: '', cie10_codigo: '', fecha_inicio: hoyISO(), intervalo_texto: '', duracion_total_texto: '', objetivo_alta: '', precio_plan: '', anticipo_requerido: '0',
    forma_cobro: 'todo_primera', generar_citas_auto: true, recordatorio_horas: '24', avisar_recepcion_dias: '3', bloquear_cabina: false, hora_inicio: '09:00',
  })
  const set = k => e => setF(s => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const plantillas = useVista('plantillas-plan', 'plantillas_plan', { sedeCol: false, filtros: { activa: true }, orden: { columna: 'nombre' } })
  const pasos = useQuery({ queryKey: ['clinico', 'plantilla-sesiones', f.plantilla_id], enabled: !!f.plantilla_id, queryFn: async () => { const r = await leer('plantilla_plan_sesiones', { sedeCol: false, filtros: { plantilla_id: f.plantilla_id }, orden: { columna: 'numero' } }); if (r.error) throw r.error; return r.data } })
  const podologos = useVista('podologos', 'perfiles', { sedeCol: false, filtros: { rol: 'podologo', activo: true }, columnas: 'id,nombre,apellidos' })
  const cabinas = useVista('cabinas-plan-' + f.sede_id, 'cabinas', { sedeCol: false, filtros: { sede_id: f.sede_id, activa: true } }, { enabled: !!f.sede_id })
  const servicios = useVista('servicios-plan', 'prp_servicios', { sedeCol: false, columnas: 'id,nombre', orden: { columna: 'nombre' }, limite: 300 })
  const plantilla = (plantillas.data?.filas ?? []).find(x => x.id === f.plantilla_id)

  useEffect(() => {
    if (!plantilla) return
    setF(s => ({ ...s, nombre: s.nombre || plantilla.nombre, servicio_id: s.servicio_id || plantilla.servicio_id || '', objetivo_alta: s.objetivo_alta || plantilla.criterio_alta || '' }))
  }, [plantilla?.id]) // eslint-disable-line
  const sede = sedes.find(s => s.id === f.sede_id)
  const sesiones = useMemo(() => generarSesionesPlan({
    plantillaSesiones: pasos.data ?? [], fechaInicio: f.fecha_inicio, diasCerrados: sede?.horario?.dias_cerrados ?? [], festivos: organizacion?.parametros?.festivos ?? [],
  }), [pasos.data, f.fecha_inicio, sede, organizacion])
  const total = totalPlan(sesiones)
  useEffect(() => { setF(s => ({ ...s, precio_plan: String(total) })) }, [total])
  const saldo = saldoTrasAnticipo(f.precio_plan, f.anticipo_requerido)
  const pn = Object.fromEntries((podologos.data?.filas ?? []).map(p => [p.id, [p.nombre, p.apellidos].filter(Boolean).join(' ')]))

  async function guardar(agendar) {
    const r = await ejecutar(async () => {
      const c = await rpc('crear_plan_desde_plantilla', { p_paciente: paciente.id, p_plantilla: f.plantilla_id, p_podologo: f.podologo_id, p_sede: f.sede_id, p_fecha_inicio: f.fecha_inicio, p_precio: num(f.precio_plan), p_consulta_origen: sp.get('consulta') || null })
      if (c.error) return c
      const extra = limpiar({
        nombre: f.nombre, cabina_id: f.cabina_id, servicio_id: f.servicio_id, diagnostico_categoria: f.diagnostico_categoria, cie10_codigo: f.cie10_codigo, intervalo_texto: f.intervalo_texto, duracion_total_texto: f.duracion_total_texto,
        objetivo_alta: f.objetivo_alta, anticipo_requerido: num(f.anticipo_requerido) ?? 0, forma_cobro: f.forma_cobro, generar_citas_auto: f.generar_citas_auto, recordatorio_horas: num(f.recordatorio_horas) ?? 24,
        avisar_recepcion_dias: num(f.avisar_recepcion_dias) ?? 3, bloquear_cabina: f.bloquear_cabina,
      })
      const u = await actualizar('planes_tratamiento', c.data, extra)
      if (u.error) return u
      return { data: c.data }
    }, { ok: 'Plan creado y sesiones generadas', invalidar: ['clinico'] })
    if (r) nav(`/planes/${r.data}${agendar ? '?agendar=1&hora=' + f.hora_inicio : ''}`)
  }

  if (!puede) return <div className="pagina"><Aviso tipo="err">Tu rol o el estado de la clínica no permiten crear planes.</Aviso><Volver a="/planes" /></div>
  const listo = paciente && f.plantilla_id && f.podologo_id && f.sede_id && f.fecha_inicio && f.servicio_id !== undefined
  return (
    <div className="pagina">
      <PageHeader titulo="Nuevo plan de tratamiento" subtitulo="Planes de tratamiento › Crear plan · las sesiones se generan desde la plantilla (editable por clínica)" acciones={<Volver a="/planes" />} />
      <Seccion titulo="Datos del plan">
        <PacienteBuscador seleccionado={paciente} onElegir={setPaciente} />
        {paciente && <CabeceraPaciente paciente={paciente} />}
        <div className="row">
          <FormField label="Plantilla de plan" required as="select" options={(plantillas.data?.filas ?? []).map(x => ({ value: x.id, label: x.nombre }))} value={f.plantilla_id} onChange={set('plantilla_id')} />
          <FormField label="Nombre del plan" required value={f.nombre} onChange={set('nombre')} />
          <FormField label="Podólogo responsable" required as="select" options={(podologos.data?.filas ?? []).map(x => ({ value: x.id, label: pn[x.id] }))} value={f.podologo_id} onChange={set('podologo_id')} />
        </div>
        <div className="row">
          <FormField label="Diagnóstico (lista corta)" as="select" options={CATEGORIAS_DIAGNOSTICO} value={f.diagnostico_categoria} onChange={set('diagnostico_categoria')} />
          <FormField label="CIE-10 (opcional)" value={f.cie10_codigo} onChange={e => setF(s => ({ ...s, cie10_codigo: e.target.value.toUpperCase() }))} hint="Debe existir en el catálogo, p. ej. L60.0" />
          <FormField label="Servicio principal" required as="select" options={(servicios.data?.filas ?? []).map(x => ({ value: x.id, label: x.nombre }))} value={f.servicio_id} onChange={set('servicio_id')} />
          <FormField label="Sede" required as="select" options={sedes.map(s => ({ value: s.id, label: s.nombre }))} value={f.sede_id} onChange={set('sede_id')} />
          <FormField label="Cabina / recurso" as="select" options={(cabinas.data?.filas ?? []).map(c => ({ value: c.id, label: c.nombre }))} value={f.cabina_id} onChange={set('cabina_id')} />
        </div>
        <div className="row">
          <FormField label="Fecha de inicio" required type="date" value={f.fecha_inicio} onChange={set('fecha_inicio')} />
          <FormField label="Hora de la primera sesión" type="time" value={f.hora_inicio} onChange={set('hora_inicio')} hint="Para agendar las citas." />
          <FormField label="Intervalo entre citas" value={f.intervalo_texto} onChange={set('intervalo_texto')} placeholder="1 curación diaria × 4 días" />
          <FormField label="Duración total estimada" value={f.duracion_total_texto} onChange={set('duracion_total_texto')} placeholder="5 días" />
        </div>
        <FormField label="Objetivo y criterio de alta" as="textarea" value={f.objetivo_alta} onChange={set('objetivo_alta')} />
      </Seccion>

      <Seccion titulo="Sesiones del plan (vista previa)" ayuda="Si un día la sede no abre, la sesión pasa al siguiente día hábil y queda «atrasada» (P-028). Las curaciones incluidas se registran a $0 (P-027).">
        {!f.plantilla_id ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Elige una plantilla para ver las sesiones.</div> : (
          <table><thead><tr><th>#</th><th>Sesión</th><th>Procedimiento</th><th>Fecha propuesta</th><th>Podólogo</th><th>Duración</th><th className="num">Precio</th><th>Estado</th></tr></thead>
            <tbody>
              {sesiones.map(s => <tr key={s.numero}><td>{s.numero}</td><td>{s.nombre}</td><td>{s.procedimiento ?? '—'}</td>
                <td>{fecha(s.fecha_propuesta)}{s.atrasada && <span className="bd a" style={{ marginLeft: 6 }}>Atrasada</span>}{s.ventana_desde && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Ventana {fecha(s.ventana_desde)}–{fecha(s.ventana_hasta)}</div>}</td>
                <td>{pn[f.podologo_id] ?? '—'}</td><td>{s.duracion_min} min</td><td className="num">{s.precio ? moneda(s.precio) : '$0 (incluida)'}</td><td><span className="bd n">Por generar</span></td></tr>)}
              <tr><td colSpan={6}></td><td className="num"><b>{moneda(total)}</b></td><td></td></tr>
            </tbody></table>)}
      </Seccion>

      <Seccion titulo="Cobro del plan">
        <div className="row">
          <FormField label="Precio del plan" required type="number" min="0" step="0.01" value={f.precio_plan} onChange={set('precio_plan')} hint="Por omisión, la suma de las sesiones." />
          <FormField label="Anticipo requerido" type="number" min="0" step="0.01" value={f.anticipo_requerido} onChange={set('anticipo_requerido')} />
          <FormField label="Forma de cobro" as="select" options={FORMAS} value={f.forma_cobro} onChange={set('forma_cobro')} />
        </div>
        <div style={{ fontSize: 13 }}>Saldo al terminar la sesión 1: <b>{moneda(saldo.saldo)}</b> · el anticipo se aplica a la cita 1. Los descuentos y promociones se aplican en Caja.</div>
      </Seccion>

      <Seccion titulo="Generación de citas y avisos">
        <label style={{ display: 'block', fontSize: 13, margin: '4px 0' }}><input type="checkbox" checked={f.generar_citas_auto} onChange={set('generar_citas_auto')} /> Generar automáticamente las citas siguientes al cerrar cada sesión</label>
        <label style={{ display: 'block', fontSize: 13, margin: '4px 0' }}><input type="checkbox" checked={f.bloquear_cabina} onChange={set('bloquear_cabina')} /> Bloquear la cabina para todas las citas al crear el plan</label>
        <div className="row"><FormField label="Recordatorio (horas antes)" type="number" value={f.recordatorio_horas} onChange={set('recordatorio_horas')} /><FormField label="Avisar a recepción si no agenda en (días)" type="number" value={f.avisar_recepcion_dias} onChange={set('avisar_recepcion_dias')} /></div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>El envío real de recordatorios depende del proveedor de mensajes (aún sin configurar).</div>
      </Seccion>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 30 }}>
        <button type="button" className="btn" disabled={!listo || ocupado} onClick={() => guardar(false)}>{ocupado ? 'Guardando…' : 'Guardar plan'}</button>
        <button type="button" className="btn o" disabled={!listo || ocupado || !f.servicio_id} onClick={() => guardar(true)}>Guardar y agendar sesiones</button>
        <button type="button" className="btn ghost" onClick={() => nav('/planes')}>Cancelar</button>
      </div>
    </div>
  )
}
