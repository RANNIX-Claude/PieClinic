// Nueva cita (mockup 11): paciente, servicio, podólogo, sede, horario con disponibilidad, tipo de atención, anticipo,
// recordatorios (parámetros de la clínica), origen y alta en lista de espera si no hay lugar.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { actualizar, insertar, leer, leerUno, rpc } from '../../lib/api'
import { hoyISO, moneda, hora as fmtHora } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import { conflictosCita, bloqueosQueAfectan } from '../../lib/comercial/agenda'
import { anticipoServicio, param } from '../../lib/comercial/anticipo'
import { enlaceWa, ligaCita, redactar, MENSAJERIA_AVISO } from '../../lib/adaptadores/mensajeria'
import { CLIP_AVISO } from '../../lib/adaptadores/clip'
import PacienteBuscador from './componentes/PacienteBuscador'
import PinModal from './componentes/PinModal'
import { useLeer, usePodologos, AvisoError, BannerSimulado, ejecutar, textoError, isoDe, hhmmAMin, minAHhmm, nombrePerfil, rangoDias } from './componentes/comun'

const ORIGENES = [['presencial', 'Presencial'], ['llamada', 'Llamada'], ['whatsapp', 'WhatsApp'], ['portal', 'Portal en línea'], ['referido', 'Referido']]
const METODOS = [['clip', 'Liga de pago Clip (simulado)'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta (terminal)'], ['transferencia', 'Transferencia SPEI']]

export default function CitaNueva() {
  const { sedes, sedeActivaId, organizacion, rol } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [sp] = useSearchParams()
  const puede = usePermiso('agenda.editar')
  const parametros = organizacion?.parametros ?? {}
  const [f, setF] = useState({
    paciente: null, servicioId: sp.get('servicio') ?? '', podologoId: sp.get('podologo') ?? '', sedeId: sedeActivaId ?? sedes[0]?.id ?? '',
    fecha: sp.get('fecha') ?? hoyISO(), hora: sp.get('hora') ?? '', duracion: '', cabinaId: sp.get('cabina') ?? '', tipo: 'presencial', direccion: '', viaticos: '', zona: '',
    sobrecupo: false, seguimiento: false, primeraVez: false, notas: '', origen: 'presencial', precio: '', anticipo: '', metodo: 'clip', pedirConfirmacion: true, sobrecupoAut: null,
  })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const [pin, setPin] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [slots, setSlots] = useState({ cargando: false, filas: [], error: null })

  const serviciosQ = useLeer('servicios-activos', 'prp_servicios', { sedeCol: false, filtros: { estado: 'activo' }, orden: { columna: 'nombre' } })
  const cabinasQ = useLeer('cabinas', 'cabinas', { filtros: { activa: true }, orden: { columna: 'nombre' } })
  const podQ = usePodologos()
  const servicio = serviciosQ.filas.find(s => s.id === f.servicioId)
  const [r0, r1] = rangoDias(f.fecha, f.fecha)
  const diaQ = useLeer('cita-nueva-dia', 'prp_agenda', { sedeCol: 'sede_id', filtros: { inicio: { gte: r0, lte: r1 } }, limite: 500 }, !!f.fecha)
  const bloqQ = useLeer('cita-nueva-bloq', 'prp_bloqueos_agenda', { filtros: { fin: { gte: r0 }, inicio: { lte: r1 }, estado: 'autorizado' } }, !!f.fecha)
  const cabinasSede = cabinasQ.filas.filter(c => c.sede_id === f.sedeId)

  // paciente / servicio precargados desde la URL (lista de espera, ficha del paciente)
  useEffect(() => {
    const id = sp.get('paciente')
    if (id) leerUno('prp_pacientes', { id }).then(r => r.data && set('paciente', r.data))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // al elegir servicio: duración y tipo de atención por defecto; precio vigente por sede/fecha (P-067)
  useEffect(() => {
    if (!servicio) return
    set('duracion', servicio.duracion_min)
    if (!servicio.admite_domicilio && f.tipo === 'domicilio') set('tipo', 'presencial')
    if (!servicio.admite_videoconsulta && f.tipo === 'videoconsulta') set('tipo', 'presencial')
    let vivo = true
    rpc('precio_vigente', { p_tipo: 'servicio', p_item: servicio.id, p_sede: f.sedeId || null, p_fecha: f.fecha }).then(({ data }) => {
      if (!vivo) return
      const p = Number(data ?? servicio.precio_lista ?? 0)
      set('precio', p)
      set('anticipo', anticipoServicio(servicio, p, param(parametros, 'anticipo_portal_pct')))
    })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicio?.id, f.sedeId, f.fecha])

  // disponibilidad (RPC del servidor: horarios libres reales con margen, bloqueos y festivos)
  useEffect(() => {
    if (!f.sedeId || !f.servicioId || !f.fecha || f.tipo === 'domicilio') { setSlots({ cargando: false, filas: [], error: null }); return }
    let vivo = true
    setSlots(s => ({ ...s, cargando: true }))
    rpc('disponibilidad', { p_sede: f.sedeId, p_servicio: f.servicioId, p_podologo: f.podologoId || null, p_desde: f.fecha, p_hasta: f.fecha, p_tipo: f.tipo }).then(({ data, error }) => {
      if (vivo) setSlots({ cargando: false, filas: Array.isArray(data) ? data : [], error })
    })
    return () => { vivo = false }
  }, [f.sedeId, f.servicioId, f.podologoId, f.fecha, f.tipo])

  const duracion = Number(f.duracion) || servicio?.duracion_min || 30
  const inicioISO = f.hora ? isoDe(f.fecha, hhmmAMin(f.hora)) : null
  const finISO = inicioISO ? new Date(new Date(inicioISO).getTime() + duracion * 60000).toISOString() : null
  const candidata = inicioISO ? { inicio: inicioISO, fin: finISO, podologo_id: f.podologoId, cabina_id: f.tipo === 'presencial' ? f.cabinaId || null : null, sede_id: f.sedeId } : null
  const choques = useMemo(() => (candidata && f.podologoId ? conflictosCita(candidata, diaQ.filas, { margenMin: param(parametros, 'margen_citas_min') }) : []), [candidata?.inicio, candidata?.fin, f.podologoId, f.cabinaId, diaQ.filas]) // eslint-disable-line
  const bloqueos = candidata && f.podologoId ? bloqueosQueAfectan(candidata, bloqQ.filas) : []
  const cabinaAlterna = choques.length && f.tipo === 'presencial' ? cabinasSede.find(cb => cb.id !== f.cabinaId && !conflictosCita({ ...candidata, cabina_id: cb.id, podologo_id: '_' }, diaQ.filas, { margenMin: param(parametros, 'margen_citas_min') }).length) : null

  const sobrecupoUsado = diaQ.filas.filter(c => c.podologo_id === f.podologoId && c.sobrecupo && !['cancelada', 'no_asistio'].includes(c.estado)).length
  const errores = []
  if (!f.paciente) errores.push('Elige al paciente')
  if (!f.servicioId) errores.push('Elige el servicio')
  if (!f.podologoId) errores.push('Elige al podólogo')
  if (!f.sedeId) errores.push('Elige la sede')
  if (!f.hora) errores.push('Elige la hora')
  if (f.tipo === 'domicilio' && !f.direccion.trim()) errores.push('Captura la dirección de la visita')
  if (choques.length && !f.sobrecupo) errores.push('Hay empalme: usa otro horario, otra cabina o marca sobrecupo (autoriza Administración)')
  if (bloqueos.length) errores.push(`Horario bloqueado: ${bloqueos.map(b => b.motivo || b.tipo).join(', ')}`)
  if (f.sobrecupo && sobrecupoUsado >= param(parametros, 'sobrecupo_max_por_dia')) errores.push('El podólogo ya alcanzó el máximo de sobrecupos del día')

  const crear = async modo => {
    if (errores.length) return toast.error(errores[0])
    if (f.sobrecupo && rol !== 'administrador' && !f.sobrecupoAut) return setPin(true)
    setGuardando(true)
    const cita = {
      sede_id: f.sedeId, paciente_id: f.paciente.id, servicio_id: f.servicioId, podologo_id: f.podologoId, cabina_id: f.tipo === 'presencial' ? f.cabinaId || null : null,
      inicio: inicioISO, fin: finISO, duracion_min: duracion, tipo_atencion: f.tipo,
      direccion_visita: f.tipo === 'domicilio' ? f.direccion.trim() : null, zona_domicilio: f.tipo === 'domicilio' ? f.zona || null : null, viaticos: f.tipo === 'domicilio' && f.viaticos !== '' ? Number(f.viaticos) : null,
      sobrecupo: f.sobrecupo, sobrecupo_autorizacion_id: f.sobrecupoAut, seguimiento_garantia: f.seguimiento, primera_vez: f.primeraVez,
      notas: f.notas || null, precio_servicio: f.seguimiento ? 0 : Number(f.precio) || 0, anticipo_requerido: f.seguimiento ? 0 : Number(f.anticipo) || 0, origen: f.origen,
    }
    const { data, error } = await insertar('citas', cita).catch(e => ({ data: null, error: e }))
    if (error || !data?.[0]) { setGuardando(false); return toast.error(textoError(error) || 'No se pudo agendar') }
    const creada = data[0]
    let ligaTxt = null
    if (cita.anticipo_requerido > 0 && modo !== 'solo') {
      const pagado = f.metodo !== 'clip'
      await ejecutar(insertar('anticipos', {
        sede_id: f.sedeId, paciente_id: f.paciente.id, cita_id: creada.id, origen: 'mostrador', monto: cita.anticipo_requerido, metodo: f.metodo, estado: pagado ? 'pagado' : 'pendiente',
        pagado_en: pagado ? new Date().toISOString() : null, liga_vence_en: !pagado ? new Date(new Date(inicioISO).getTime()).toISOString() : null,
        nota: !pagado ? 'Liga Clip simulada: registrar el pago desde la cita' : null,
      }), pagado ? 'Anticipo registrado' : 'Anticipo pendiente (Clip simulado)')
    }
    if (f.pedirConfirmacion || modo === 'wa') {
      const r = await rpc('generar_liga_cita', { p_cita: creada.id })
      if (!r.error) ligaTxt = ligaCita(r.data)
    }
    const espera = sp.get('espera')
    if (espera) await actualizar('lista_espera', espera, { estado: 'agendado', cita_id: creada.id })
    qc.invalidateQueries({ queryKey: ['comercial'] })
    setGuardando(false)
    toast.success(`Cita ${creada.folio ?? ''} agendada`)
    if (modo === 'wa' && f.paciente.telefono_celular) {
      const texto = redactar('recordatorio_24h', { nombre: f.paciente.nombre, fecha: new Date(inicioISO).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }), hora: fmtHora(inicioISO), sede: sedes.find(s => s.id === f.sedeId)?.nombre ?? '', liga: ligaTxt })
      window.open(enlaceWa(f.paciente.telefono_celular, texto), '_blank', 'noopener')
    }
    nav(`/agenda?dia=${f.fecha}`)
  }

  const aListaEspera = async () => {
    if (!f.paciente || !f.servicioId || !f.sedeId) return toast.error('Elige paciente, servicio y sede')
    const ok = await ejecutar(insertar('lista_espera', { sede_id: f.sedeId, paciente_id: f.paciente.id, nombre_solicitante: f.paciente.nombre_completo, telefono: f.paciente.telefono_celular, servicio_id: f.servicioId,
      podologo_id: f.podologoId || null, disponibilidad: f.notas || null, prioridad: 'media', origen: 'llamada' }), 'Agregado a la lista de espera')
    if (ok) nav('/lista-espera')
  }

  const slotsDelPod = slots.filas
  if (!puede) return <div className="pagina"><div className="card">No tienes permiso para agendar citas.</div></div>

  return (
    <div className="pagina">
      <PageHeader titulo="Nueva cita" subtitulo="Agenda › Crear cita" />
      {(choques.length > 0) && (
        <div className="card" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12, fontSize: 13 }}>
          <b>Conflicto:</b> {choques.map(c => `${c.cabina_nombre ?? 'el podólogo'} ocupado ${fmtHora(c.inicio)}–${fmtHora(c.fin)} (${c.paciente_nombre} · ${c.servicio_nombre})`).join('; ')}.
          {cabinaAlterna && <> Se sugiere <b>{cabinaAlterna.nombre}</b>. <button className="btn o" onClick={() => set('cabinaId', cabinaAlterna.id)}>Aplicar {cabinaAlterna.nombre}</button></>}
        </div>
      )}
      <AvisoError error={serviciosQ.error} />
      <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Datos de la cita</h3>
          <FormField label="Paciente" required><PacienteBuscador valor={f.paciente} onElegir={p => set('paciente', p)} /></FormField>
          <FormField label="Servicio" required as="select" value={f.servicioId} onChange={e => set('servicioId', e.target.value)}
            options={serviciosQ.filas.map(s => ({ value: s.id, label: `${s.nombre} · ${s.duracion_min} min` }))} />
          <div className="grid2">
            <FormField label="Podólogo" required as="select" value={f.podologoId} onChange={e => set('podologoId', e.target.value)} options={podQ.filas.map(p => ({ value: p.id, label: nombrePerfil(p) }))} />
            <FormField label="Sede" required as="select" value={f.sedeId} onChange={e => set('sedeId', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
          </div>
          <div className="grid2">
            <FormField label="Fecha" required type="date" value={f.fecha} onChange={e => set('fecha', e.target.value)} />
            <FormField label="Hora de inicio" required type="time" step={60 * param(parametros, 'paso_agenda_min')} value={f.hora} onChange={e => set('hora', e.target.value)} />
          </div>
          <div className="grid2">
            <FormField label="Duración (min)" type="number" min="5" step="5" value={f.duracion} onChange={e => set('duracion', e.target.value)} hint="Por servicio, editable" />
            <FormField label="Cabina / equipo" as="select" value={f.cabinaId} onChange={e => set('cabinaId', e.target.value)} disabled={f.tipo !== 'presencial'} options={cabinasSede.map(c => ({ value: c.id, label: c.nombre }))} />
          </div>
          <div className="field"><label>Tipo de atención</label>
            <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
              {[['presencial', 'Presencial'], ['domicilio', 'Domicilio'], ['videoconsulta', 'Videoconsulta']].map(([v, l]) => {
                const bloqueado = (v === 'domicilio' && servicio && !servicio.admite_domicilio) || (v === 'videoconsulta' && servicio && !servicio.admite_videoconsulta)
                return <label key={v} style={{ opacity: bloqueado ? 0.45 : 1 }}><input type="radio" name="tipo" checked={f.tipo === v} disabled={bloqueado} onChange={() => set('tipo', v)} /> {l}</label>
              })}
            </div>
          </div>
          {f.tipo === 'domicilio' && (
            <>
              <FormField label="Dirección de visita" required value={f.direccion} onChange={e => set('direccion', e.target.value)} />
              <div className="grid2">
                <FormField label="Viáticos" type="number" min="0" value={f.viaticos} onChange={e => set('viaticos', e.target.value)} hint={servicio?.recargo_domicilio ? `Recargo del servicio ${moneda(servicio.recargo_domicilio)}` : undefined} />
                <FormField label="Ruta / zona" value={f.zona} onChange={e => set('zona', e.target.value)} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
            <label><input type="checkbox" checked={f.sobrecupo} onChange={e => set('sobrecupo', e.target.checked)} /> Sobrecupo controlado (autoriza Administración)</label>
            <label><input type="checkbox" checked={f.seguimiento} onChange={e => set('seguimiento', e.target.checked)} /> Seguimiento / garantía (sin costo)</label>
            <label><input type="checkbox" checked={f.primeraVez} onChange={e => set('primeraVez', e.target.checked)} /> Primera vez</label>
          </div>
          <FormField label="Notas de la cita (visibles al podólogo)" as="textarea" rows={3} value={f.notas} onChange={e => set('notas', e.target.value)} />
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 10 }}>Anticipo, precio y recordatorios</h3>
            <div className="grid2">
              <FormField label="Precio del servicio" type="number" min="0" value={f.seguimiento ? 0 : f.precio} onChange={e => set('precio', e.target.value)} hint={servicio?.tipo_precio !== 'fijo' ? `Tipo de precio: ${servicio?.tipo_precio}` : 'Precio vigente por sede y fecha'} />
              <FormField label="Anticipo requerido" type="number" min="0" value={f.seguimiento ? 0 : f.anticipo} onChange={e => set('anticipo', e.target.value)}
                hint={`Sugerido ${param(parametros, 'anticipo_portal_pct')} %; en recepción no es obligatorio`} />
            </div>
            {Number(f.anticipo) > 0 && !f.seguimiento && (
              <>
                <FormField label="Método del anticipo" as="select" value={f.metodo} onChange={e => set('metodo', e.target.value)} options={METODOS.map(([value, label]) => ({ value, label }))} />
                {f.metodo === 'clip' && <BannerSimulado compacto texto={CLIP_AVISO} />}
              </>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
              Recordatorios (configurables en Agenda › Recordatorios): {param(parametros, 'recordatorio_horas_antes') ?? parametros.recordatorio_horas_antes ?? 24} h antes
              {parametros.recordatorio_segundo_activo ? ` y ${parametros.recordatorio_segundo_horas ?? 2} h antes` : ''} · canal {parametros.recordatorio_canal ?? 'correo'}.
            </div>
            <BannerSimulado compacto texto={MENSAJERIA_AVISO} />
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.pedirConfirmacion} onChange={e => set('pedirConfirmacion', e.target.checked)} /> Pedir confirmación de asistencia con liga (confirmar / reprogramar)</label>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 10 }}>Origen</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
              {ORIGENES.map(([v, l]) => <label key={v}><input type="radio" name="origen" checked={f.origen === v} onChange={() => set('origen', v)} /> {l}</label>)}
            </div>
            <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Agendó: tu usuario. Atribución de sede: la sede de la cita.</div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Disponibilidad{f.podologoId ? ` — ${nombrePerfil(podQ.filas.find(p => p.id === f.podologoId))}` : ' — cualquier podólogo'} · {f.fecha}</h3>
            {f.tipo === 'domicilio' ? <div className="text-muted" style={{ fontSize: 13 }}>Visita a domicilio: la hora se acuerda con el traslado del podólogo (30 min ida y vuelta por defecto).</div>
              : slots.cargando ? <div className="text-muted" style={{ fontSize: 13 }}>Buscando horarios…</div>
              : slots.error ? <AvisoError error={slots.error} titulo="No se pudo consultar la disponibilidad" />
              : !f.servicioId ? <div className="text-muted" style={{ fontSize: 13 }}>Elige un servicio para ver horarios libres.</div>
              : slotsDelPod.length === 0 ? <div className="text-muted" style={{ fontSize: 13 }}>No hay horarios libres ese día. Prueba otra fecha o agrega al paciente a la lista de espera.</div>
              : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {slotsDelPod.map((s, i) => {
                    const h = fmtHora(s.inicio)
                    return <button key={i} type="button" className={`btn${f.hora === h && (!s.podologo_id || s.podologo_id === f.podologoId) ? '' : ' o'}`}
                      onClick={() => { set('hora', h); if (s.podologo_id) set('podologoId', s.podologo_id); if (s.cabina_id && f.tipo === 'presencial') set('cabinaId', s.cabina_id) }}>{h}</button>
                  })}
                </div>
              )}
            <div style={{ marginTop: 10 }}><button type="button" className="btn o" onClick={aListaEspera}>Si no hay lugar, agregar a lista de espera</button></div>
          </div>
        </div>
      </div>

      {errores.length > 0 && f.hora && <div className="text-red" style={{ fontSize: 12.5, margin: '10px 0' }}>{errores.join(' · ')}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button className="btn" disabled={guardando || errores.length > 0} onClick={() => crear('solo')}>Agendar cita</button>
        <button className="btn" disabled={guardando || errores.length > 0 || !(Number(f.anticipo) > 0)} onClick={() => crear('anticipo')}>Agendar y registrar anticipo</button>
        <button className="btn" disabled={guardando || errores.length > 0 || !f.paciente?.telefono_celular} onClick={() => crear('wa')}>Agendar y enviar liga por WhatsApp</button>
        <button className="btn o" onClick={() => nav('/agenda')}>Cancelar</button>
      </div>
      <PinModal open={pin} tipo="sobrecupo" titulo="Autorizar sobrecupo" detalle={{ podologo_id: f.podologoId, fecha: f.fecha }}
        onClose={() => setPin(false)} onAutorizado={id => { set('sobrecupoAut', id); setPin(false); toast.success('Sobrecupo autorizado: vuelve a agendar') }} />
    </div>
  )
}
