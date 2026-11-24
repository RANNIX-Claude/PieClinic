// Vista móvil PWA del podólogo (mockup 30): agenda del día, siguiente cita, acciones rápidas. Pensada para celular.
// Sin conexión: muestra la última agenda cargada (solo consulta; se guarda en sessionStorage, no en el disco del equipo).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Phone, MessageCircle, UserRound, Video, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { actualizar, leer } from '../../lib/api'
import { hoyISO, hora, telefono } from '../../lib/formato'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import StatusBadge from '../../components/ui/StatusBadge'
import { ESTADOS_CITA, transicionesPermitidas, ocupaAgenda } from '../../lib/comercial/agenda'
import { enlaceWa } from '../../lib/adaptadores/mensajeria'
import { AvisoError, ejecutar, sumarDias, etiquetaDia, rangoDias, lunesDe, minutosDe } from './componentes/comun'
import { moneda } from '../../lib/formato'

const CLAVE = 'pf.miagenda'
const guardarLocal = (k, v) => { try { sessionStorage.setItem(`${CLAVE}.${k}`, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }
const leerLocal = k => { try { return JSON.parse(sessionStorage.getItem(`${CLAVE}.${k}`) ?? 'null') } catch { return null } }

export default function MiAgenda() {
  const { perfil, rol, sedeActivaId, sedeActiva } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [dia, setDia] = useState(hoyISO())
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setEnLinea(true), off = () => setEnLinea(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const [r0, r1] = rangoDias(dia, dia)
  const q = useQuery({
    queryKey: ['comercial', 'mi-agenda', sedeActivaId, perfil?.id, dia],
    queryFn: async () => {
      const r = await leer('prp_agenda', { sedeId: sedeActivaId, filtros: { inicio: { gte: r0, lte: r1 }, ...(rol === 'podologo' ? { podologo_id: perfil.id } : {}) }, orden: { columna: 'inicio' }, limite: 200 })
      if (!r.error) guardarLocal(dia, { citas: r.data, en: new Date().toISOString() })
      return r
    }, refetchInterval: 60000,
  })
  const local = leerLocal(dia)
  const usandoLocal = !!q.data?.error && !!local
  const citas = usandoLocal ? local.citas : (q.data?.data ?? [])
  const lista = useMemo(() => citas.filter(c => c.estado !== 'cancelada'), [citas])
  const ahoraMin = minutosDe(new Date())
  const siguiente = dia === hoyISO() ? lista.find(c => ocupaAgenda(c) && c.estado !== 'atendida' && minutosDe(c.fin) > ahoraMin) : null
  const semana = Array.from({ length: 5 }, (_, i) => sumarDias(lunesDe(dia), i))

  const cambiar = async (c, estado) => { if (await ejecutar(actualizar('citas', c.id, { estado }), 'Actualizada')) qc.invalidateQueries({ queryKey: ['comercial'] }) }

  return (
    <div className="pagina" style={{ maxWidth: 520, margin: '0 auto', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8, color: enLinea ? 'var(--green)' : 'var(--red)' }}>
        {enLinea ? <Wifi size={14} /> : <WifiOff size={14} />} {enLinea ? 'En línea' : 'Sin conexión: solo consulta'}{q.dataUpdatedAt ? ` · actualizado ${hora(new Date(q.dataUpdatedAt))}` : ''}
        {usandoLocal && <span className="bd a">Datos guardados {hora(local.en)}</span>}
      </div>
      <h1 className="pagina-titulo" style={{ fontSize: 20 }}>Mi agenda{sedeActiva ? ` · ${sedeActiva.nombre}` : ''}</h1>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
        <button className="btn o" onClick={() => setDia(sumarDias(dia, -1))} aria-label="Día anterior"><ChevronLeft size={16} /></button>
        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {semana.map(d => <button key={d} className={`btn${d === dia ? '' : ' o'}`} style={{ flex: 1, padding: '6px 4px', fontSize: 12 }} onClick={() => setDia(d)}>{etiquetaDia(d)}</button>)}
        </div>
        <button className="btn o" onClick={() => setDia(sumarDias(dia, 1))} aria-label="Día siguiente"><ChevronRight size={16} /></button>
      </div>
      <div className="grid-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 10 }}>
        {[['Citas', lista.length], ['Atendidas', lista.filter(c => c.estado === 'atendida').length], ['Siguiente', siguiente ? hora(siguiente.inicio) : '—']].map(([t, v]) =>
          <div key={t} className="card" style={{ textAlign: 'center', padding: 8 }}><div className="text-muted" style={{ fontSize: 11 }}>{t}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>)}
      </div>
      {!usandoLocal && <AvisoError error={q.data?.error} titulo="No se pudo cargar tu agenda" />}
      {q.isLoading && <div className="card text-muted">Cargando…</div>}
      {!q.isLoading && lista.length === 0 && !q.data?.error && <div className="card text-muted" style={{ textAlign: 'center' }}>Sin citas este día.</div>}
      {lista.map(c => {
        const sig = siguiente?.id === c.id
        const pend = ['por_confirmar', 'confirmada'].includes(c.estado)
        return (
          <div key={c.id} className="card" style={{ marginBottom: 8, padding: 12, borderLeft: `4px solid ${sig ? 'var(--accent)' : 'var(--border)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b>{hora(c.inicio)} · {c.paciente_nombre}</b><StatusBadge estado={c.estado} label={ESTADOS_CITA[c.estado]?.label} />
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 6px' }}>
              {c.servicio_nombre}{c.cabina_nombre ? ` · ${c.cabina_nombre}` : ''}{c.numero_expediente ? ` · Exp. ${c.numero_expediente}` : ''}{c.plan_adquirido_id ? ' · plan' : ''}
              {c.tipo_atencion === 'domicilio' && c.direccion_visita ? ` · ${c.direccion_visita}` : ''}
            </div>
            {c.anticipo_requerido > 0 && c.anticipo_estado !== 'pagado' && c.anticipo_estado !== 'aplicado' && <span className="bd a" style={{ marginRight: 6 }}>Anticipo {c.anticipo_estado === 'sin_anticipo' ? 'pendiente' : c.anticipo_estado} {moneda(c.anticipo_requerido)}</span>}
            {c.notas && <div style={{ fontSize: 12.5, margin: '4px 0' }}>📝 {c.notas}</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <button className="btn" onClick={() => nav(`/pacientes/${c.paciente_id}`)}><UserRound size={14} /> Expediente</button>
              {c.tipo_atencion === 'videoconsulta' && <button className="btn" onClick={() => nav(`/pacientes/${c.paciente_id}`)}><Video size={14} /> Sala</button>}
              {c.paciente_celular && <a className="btn o" href={`tel:${c.paciente_celular}`} aria-label={`Llamar ${telefono(c.paciente_celular)}`}><Phone size={14} /></a>}
              {c.paciente_celular && <a className="btn o" target="_blank" rel="noreferrer" href={enlaceWa(c.paciente_celular, `Hola ${(c.paciente_nombre ?? '').split(' ')[0]}, te esperamos a las ${hora(c.inicio)}.`)} aria-label="WhatsApp"><MessageCircle size={14} /></a>}
              {pend && enLinea && transicionesPermitidas(c.estado, { tipoAtencion: c.tipo_atencion }).includes('confirmada') && <button className="btn o" onClick={() => cambiar(c, 'confirmada')}>Confirmar</button>}
              {pend && enLinea && c.posible_no_asistio && <button className="btn red" onClick={() => cambiar(c, 'no_asistio')}>No asistió</button>}
            </div>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn o" style={{ flex: 1 }} onClick={() => nav('/pacientes')}>Buscar paciente</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => nav('/agenda/nueva')}>Nueva cita</button>
      </div>
      <div className="text-muted" style={{ fontSize: 11.5, marginTop: 10 }}>Sin conexión solo se consulta la agenda que ya cargaste; confirmar y marcar asistencia requieren internet.</div>
    </div>
  )
}
