// Portal público: reservar cita SIN SESIÓN (mockups 25 y 26). Ruta /app/reservar/:clinica
// Usa SOLO las RPC portal_* (anon): portal_catalogo, portal_disponibilidad, portal_retener_horario, portal_estado_reserva, portal_lista_espera.
// El pago del anticipo pasa por el adaptador de Clip (SIMULADO: no cobra nada real).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Check, Clock, MapPin, Video } from 'lucide-react'
import { rpc } from '../../lib/api'
import { fijarZonaHoraria, hora, moneda, fechaLarga } from '../../lib/formato'
import { agruparPorDia } from '../../lib/comercial/agenda'
import { cobrarAnticipoReserva, CLIP_AVISO, TARJETAS_PRUEBA, luhn, marcaTarjeta } from '../../lib/adaptadores/clip'
import { validarRfc, REGIMENES, USOS_CFDI } from '../../lib/comercial/fiscal'
import { BannerSimulado } from '../comercial/componentes/comun'
import Marco, { Cargando, Problema, mensajePortal, VerTexto } from './componentes/Marco'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { AVISO_PRIVACIDAD, TERMINOS_RESERVA, VERSION_AVISO, VERSION_TERMINOS } from './textos'

const PASOS = ['Sede', 'Servicio', 'Podólogo', 'Horario', 'Tus datos y pago']
const hoyLocal = zona => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const sumarDias = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const lunes = d => { const x = new Date(`${d}T12:00:00Z`); return sumarDias(d, -((x.getUTCDay() + 6) % 7)) }
const edad = nac => { if (!nac) return null; const n = new Date(nac), h = new Date(); let e = h.getFullYear() - n.getFullYear(); if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--; return e }
const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function PortalReservar() {
  const { clinica: slug } = useParams()
  const [cat, setCat] = useState(null)
  const [error, setError] = useState(null)
  const [paso, setPaso] = useState(1)
  const [sede, setSede] = useState(null)
  const [servicio, setServicio] = useState(null)
  const [podologo, setPodologo] = useState('cualquiera')   // 'cualquiera' | id
  const [tipo, setTipo] = useState('presencial')
  const [semana, setSemana] = useState(null)
  const [slots, setSlots] = useState({ cargando: false, filas: [], error: null })
  const [slot, setSlot] = useState(null)
  const [reserva, setReserva] = useState(null)             // respuesta de portal_retener_horario
  const [confirmada, setConfirmada] = useState(null)
  const [espera, setEspera] = useState(false)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    let vivo = true
    rpc('portal_catalogo', { p_slug: slug }).then(({ data, error: e }) => {
      if (!vivo) return
      if (e || !data) { setError(e ?? { message: 'no disponible' }); return }
      fijarZonaHoraria(data.clinica?.zona_horaria)
      setCat(data)
      if (data.sedes?.length === 1) setSede(data.sedes[0])
      setSemana(lunes(hoyLocal(data.clinica?.zona_horaria ?? 'America/Mexico_City')))
    })
    return () => { vivo = false }
  }, [slug])

  const zona = cat?.clinica?.zona_horaria ?? 'America/Mexico_City'
  const hoy = hoyLocal(zona)
  const sedesVis = cat?.sedes ?? []
  const serviciosVis = cat?.servicios ?? []
  const podologosSede = (cat?.podologos ?? []).filter(p => !p.sedes?.length || (sede && p.sedes.includes(sede.id)))
  const precio = servicio ? (servicio.precios_sede?.[sede?.id] ?? servicio.precio) : null
  const anticipo = servicio?.anticipo ?? 0

  // disponibilidad de la semana elegida
  useEffect(() => {
    if (paso !== 4 || !sede || !servicio || !semana) return
    let vivo = true
    setSlots(s => ({ ...s, cargando: true, error: null }))
    const desde = semana < hoy ? hoy : semana
    rpc('portal_disponibilidad', { p_slug: slug, p_sede: sede.id, p_servicio: servicio.id, p_podologo: podologo === 'cualquiera' ? null : podologo, p_desde: desde, p_hasta: sumarDias(semana, 6), p_tipo: tipo }).then(({ data, error: e }) => {
      if (vivo) setSlots({ cargando: false, filas: Array.isArray(data) ? data : [], error: e })
    })
    return () => { vivo = false }
  }, [paso, sede?.id, servicio?.id, podologo, tipo, semana, slug, hoy])

  const porDia = useMemo(() => agruparPorDia(slots.filas, zona), [slots.filas, zona])
  const dias = semana ? Array.from({ length: 7 }, (_, i) => sumarDias(semana, i)) : []
  const nombrePod = id => (id && id !== 'cualquiera' ? cat?.podologos?.find(p => p.id === id)?.nombre : null)

  const reiniciar = useCallback((aviso_) => { setSlot(null); setReserva(null); setPaso(4); setAviso(aviso_ ?? null) }, [])

  if (error) return <Marco clinica={null}><Problema titulo="No encontramos esta clínica" texto={mensajePortal(error)} /></Marco>
  if (!cat) return <Marco clinica={null}><Cargando texto="Cargando horarios…" /></Marco>
  if (confirmada) return <Marco clinica={cat.clinica}><Confirmada datos={confirmada} sede={sede} servicio={servicio} slot={slot} podologo={nombrePod(confirmada.podologo ?? podologo) ?? 'Podólogo asignado'} /></Marco>

  return (
    <Marco clinica={cat.clinica} titulo="Reserva tu cita" subtitulo={cat.clinica.mensaje || 'Sin crear cuenta · te confirmamos por correo y mensaje'}>
      <ol style={{ display: 'flex', gap: 6, flexWrap: 'wrap', listStyle: 'none', padding: 0, marginBottom: 14 }}>
        {PASOS.map((p, i) => <li key={p} className={`bd ${paso === i + 1 ? 'm' : paso > i + 1 ? 'v' : 'n'}`}>{paso > i + 1 ? '✓' : i + 1} · {p}</li>)}
      </ol>
      {aviso && <div className="card" role="alert" style={{ borderLeft: '4px solid var(--red)', marginBottom: 12, fontSize: 13.5 }}>{aviso}</div>}

      {paso === 1 && (
        <Seccion titulo="1 · Elige la sede">
          {sedesVis.length === 0 && <div className="text-muted">La clínica aún no tiene sedes publicadas.</div>}
          {sedesVis.map(s => (
            <Opcion key={s.id} activa={sede?.id === s.id} onClick={() => { setSede(s); setPaso(2) }}>
              <b>{s.nombre}</b> <div className="text-muted" style={{ fontSize: 13 }}><MapPin size={12} style={{ verticalAlign: -1 }} /> {s.direccion ?? ''}{s.telefono ? ` · Tel. ${s.telefono}` : ''}</div>
              {s.horario && Object.keys(s.horario).length > 0 && <div className="text-muted" style={{ fontSize: 12.5 }}>{typeof s.horario === 'string' ? s.horario : Object.entries(s.horario).map(([d, h]) => `${d} ${h}`).join(' · ')}</div>}
            </Opcion>))}
        </Seccion>
      )}
      {paso === 2 && (
        <Seccion titulo="2 · Elige el servicio" atras={() => setPaso(1)}>
          {serviciosVis.length === 0 && <div className="text-muted">No hay servicios disponibles para reservar en línea.</div>}
          {serviciosVis.map(s => {
            const p = s.precios_sede?.[sede?.id] ?? s.precio
            return (
              <Opcion key={s.id} activa={servicio?.id === s.id} onClick={() => { setServicio(s); setTipo('presencial'); setPaso(3) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><b>{s.nombre}</b>{s.descripcion && <div className="text-muted" style={{ fontSize: 13 }}>{s.descripcion}</div>}</div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div className="text-muted" style={{ fontSize: 12.5 }}>{s.duracion_min} min</div><b>{s.tipo_precio === 'a_valorar' ? 'A valorar' : `${s.tipo_precio === 'desde' ? 'Desde ' : ''}${moneda(p)}${s.tipo_precio === 'por_unidad' && s.unidad_cobro ? ` ${s.unidad_cobro}` : ''}`}</b></div></div>
              </Opcion>)
          })}
        </Seccion>
      )}
      {paso === 3 && (
        <Seccion titulo="3 · Elige a tu podólogo(a)" atras={() => setPaso(2)}>
          <Opcion activa={podologo === 'cualquiera'} onClick={() => { setPodologo('cualquiera'); setPaso(4) }}><b>Cualquiera disponible</b><div className="text-muted" style={{ fontSize: 13 }}>Te asignamos el primer horario libre</div></Opcion>
          {podologosSede.map(p => (
            <Opcion key={p.id} activa={podologo === p.id} onClick={() => { setPodologo(p.id); setPaso(4) }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{p.foto_url ? <img src={p.foto_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-light)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--accent)' }}>{(p.nombre ?? '?')[0]}</span>}
                <div><b>{p.nombre}</b>{p.cedula && <div className="text-muted" style={{ fontSize: 12.5 }}>Cédula prof. {p.cedula}</div>}{p.resumen && <div className="text-muted" style={{ fontSize: 12.5 }}>{p.resumen}</div>}</div></div>
            </Opcion>))}
        </Seccion>
      )}
      {paso === 4 && (
        <Seccion titulo="4 · Elige día y horario" atras={() => setPaso(3)}>
          {servicio?.admite_videoconsulta && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 10, fontSize: 13.5 }}>
              <label><input type="radio" name="t" checked={tipo === 'presencial'} onChange={() => { setTipo('presencial'); setSlot(null) }} /> Presencial</label>
              <label><input type="radio" name="t" checked={tipo === 'videoconsulta'} onChange={() => { setTipo('videoconsulta'); setSlot(null) }} /> <Video size={13} style={{ verticalAlign: -2 }} /> Videoconsulta</label>
            </div>)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button className="btn o" disabled={semana <= lunes(hoy)} onClick={() => setSemana(sumarDias(semana, -7))} aria-label="Semana anterior">◀</button>
            <b style={{ fontSize: 13.5 }}>Semana del {new Date(`${semana}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' })}</b>
            <button className="btn o" disabled={semana >= sumarDias(lunes(hoy), 7)} onClick={() => setSemana(sumarDias(semana, 7))} aria-label="Semana siguiente">▶</button>
            <span className="text-muted" style={{ fontSize: 12 }}>· {nombrePod(podologo) ?? 'Cualquier podólogo'} · {sede?.nombre}</span>
          </div>
          {slots.cargando && <Cargando texto="Buscando horarios…" />}
          {slots.error && <div className="text-red" style={{ fontSize: 13 }}>{mensajePortal(slots.error)}</div>}
          {!slots.cargando && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {dias.map(d => {
                const hs = porDia[d] ?? []
                const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
                return (
                  <div key={d} className="card" style={{ padding: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{NOMBRE_DIA[dow]} {d.slice(8)}</div>
                    {hs.length === 0 ? <div className="text-muted" style={{ fontSize: 12 }}>Sin horarios</div> : hs.map(s => (
                      <button key={s.inicio} type="button" className={`btn${slot?.inicio === s.inicio ? '' : ' o'}`} style={{ width: '100%', marginBottom: 4, padding: '5px 4px' }} onClick={() => setSlot(s)}>{hora(s.inicio)}</button>))}
                  </div>)
              })}
            </div>)}
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}><Clock size={12} style={{ verticalAlign: -1 }} /> Zona horaria: {zona.replace('America/', '').replace('_', ' ')}. Si no ves un horario, <button type="button" onClick={() => setEspera(true)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>avísame si se libera uno</button>.</div>
          {slot && (
            <div className="card" style={{ marginTop: 12, background: 'var(--accent-light)' }}>
              <b>Resumen de tu cita</b>
              <table style={{ fontSize: 13.5, margin: '6px 0' }}><tbody>
                {[['Sede', sede.nombre], ['Servicio', servicio.nombre + (tipo === 'videoconsulta' ? ' (videoconsulta)' : '')], ['Podólogo(a)', nombrePod(podologo) ?? 'Se asigna al confirmar'], ['Fecha', `${fechaLarga(slot.inicio)} · ${hora(slot.inicio)}`], ['Duración', `${servicio.duracion_min} min`],
                  ['Precio', servicio.tipo_precio === 'a_valorar' ? 'A valorar (se cotiza en la consulta)' : moneda(precio)], ['Anticipo para apartar', anticipo > 0 ? moneda(anticipo) : 'Sin anticipo']].map(([k, v]) => <tr key={k}><td className="text-muted" style={{ paddingRight: 14 }}>{k}</td><td>{v}</td></tr>)}
              </tbody></table>
              <div className="text-muted" style={{ fontSize: 12.5 }}>Cancela o reprograma sin costo hasta 48 h antes.</div>
              <button className="btn" style={{ marginTop: 8 }} onClick={() => { setAviso(null); setPaso(5) }}>Continuar a tus datos y pago →</button>
            </div>)}
        </Seccion>
      )}
      {paso === 5 && slot && (
        <DatosYPago slug={slug} cat={cat} sede={sede} servicio={servicio} slot={slot} podologo={podologo} tipo={tipo} precio={precio} reserva={reserva}
          onReserva={setReserva} onAtras={() => { setPaso(4) }} onConfirmada={d => setConfirmada({ ...d, podologo })} onReiniciar={reiniciar} nombrePod={nombrePod(podologo)} />
      )}
      <ListaEsperaModal abierto={espera} onClose={() => setEspera(false)} slug={slug} sede={sede} servicio={servicio} podologo={podologo} />
    </Marco>
  )
}

const Seccion = ({ titulo, atras, children }) => (
  <section><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>{atras && <button className="btn o" onClick={atras}>← Atrás</button>}<h2 style={{ fontSize: 17 }}>{titulo}</h2></div><div style={{ display: 'grid', gap: 8 }}>{children}</div></section>
)
const Opcion = ({ activa, onClick, children }) => (
  <button type="button" onClick={onClick} className="card" style={{ textAlign: 'left', cursor: 'pointer', width: '100%', color: 'var(--text)', border: activa ? '2px solid var(--accent)' : '1px solid var(--border)', padding: 12 }}>{children}</button>
)

// ── paso 5 ───────────────────────────────────────────────────────────────────────────────────────────
function DatosYPago({ slug, cat, sede, servicio, slot, podologo, tipo, precio, reserva, onReserva, onAtras, onConfirmada, onReiniciar, nombrePod }) {
  const [d, setD] = useState({ nombre: '', apellidos: '', fecha_nacimiento: '', sexo: '', celular: '', correo: '', primera_vez: false, motivo_consulta: '', tutor_nombre: '', tutor_parentesco: '', requiere_factura: false, rfc: '', razon_social: '', cp: '', regimen: '612', uso: 'D01', correo_fiscal: '' })
  const [c, setC] = useState({ aviso: false, terminos: false, recordatorios: true, fotos: false })
  const [errores, setErrores] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setD(x => ({ ...x, [k]: v }))
  const menor = edad(d.fecha_nacimiento) != null && edad(d.fecha_nacimiento) < 18

  const validar = () => {
    const e = {}
    if (!d.nombre.trim()) e.nombre = 'Requerido'; if (!d.apellidos.trim()) e.apellidos = 'Requerido'
    if (!d.fecha_nacimiento || new Date(d.fecha_nacimiento) > new Date()) e.fecha_nacimiento = 'Fecha inválida'
    if (d.celular.replace(/\D/g, '').length < 10) e.celular = 'Celular de 10 dígitos'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo)) e.correo = 'Correo inválido'
    if (menor && (!d.tutor_nombre.trim() || !d.tutor_parentesco.trim())) e.tutor = 'Nombre y parentesco del tutor'
    if (d.requiere_factura) { if (!validarRfc(d.rfc)) e.rfc = 'RFC inválido'; if (!d.razon_social.trim()) e.razon_social = 'Requerido'; if (!/^\d{5}$/.test(d.cp)) e.cp = 'CP de 5 dígitos' }
    if (!c.aviso) e.aviso = 'Debes aceptar el aviso de privacidad'; if (!c.terminos) e.terminos = 'Debes aceptar los términos de la reserva'
    setErrores(e); return Object.keys(e).length === 0
  }

  const reservar = async () => {
    setMsg(null)
    if (!validar()) return
    setEnviando(true)
    const datos = { nombre: d.nombre.trim(), apellidos: d.apellidos.trim(), fecha_nacimiento: d.fecha_nacimiento, sexo: d.sexo || null, celular: d.celular, correo: d.correo.trim(), primera_vez: d.primera_vez, motivo_consulta: d.motivo_consulta || null,
      tutor: menor ? { nombre: d.tutor_nombre.trim(), parentesco: d.tutor_parentesco.trim() } : null, requiere_factura: d.requiere_factura,
      datos_fiscales: d.requiere_factura ? { rfc: d.rfc.toUpperCase(), razon_social: d.razon_social.trim(), codigo_postal: d.cp, regimen_fiscal: d.regimen, uso_cfdi: d.uso, correo: d.correo_fiscal || d.correo } : null }
    const consent = { aviso_privacidad: { aceptado: true, version: VERSION_AVISO }, terminos_reserva: { aceptado: true, version: VERSION_TERMINOS }, recordatorios: { aceptado: c.recordatorios }, fotos_clinicas: { aceptado: c.fotos } }
    const { data, error } = await rpc('portal_retener_horario', { p_slug: slug, p_sede: sede.id, p_servicio: servicio.id, p_podologo: podologo === 'cualquiera' ? null : podologo, p_inicio: slot.inicio, p_tipo: tipo, p_datos: datos, p_consentimientos: consent })
    setEnviando(false)
    if (error) { const m = mensajePortal(error); if (/horario_no_disponible/.test(error.message ?? '')) onReiniciar(m); else setMsg(m); return }
    if (!data.requiere_pago) { onConfirmada({ folio: data.cita_folio, liga_token: data.liga_token, inicio: data.inicio ?? slot.inicio, anticipo: 0, saldo: data.saldo ?? data.precio, tipo, correo: d.correo }); return }
    onReserva({ ...data, correo: d.correo })
  }

  if (reserva) {
    return <PagoClip slug={slug} reserva={reserva} sede={sede} servicio={servicio} slot={slot} nombrePod={nombrePod} onConfirmada={x => onConfirmada({ ...x, correo: reserva.correo, tipo })} onReiniciar={onReiniciar} />
  }
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><button className="btn o" onClick={onAtras}>← Atrás</button><h2 style={{ fontSize: 17 }}>5 · Tus datos y pago</h2></div>
      <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
        <div className="card">
          <div className="grid2">
            <FormField label="Nombre(s)" required value={d.nombre} onChange={e => set('nombre', e.target.value)} error={errores.nombre} autoComplete="given-name" />
            <FormField label="Apellidos" required value={d.apellidos} onChange={e => set('apellidos', e.target.value)} error={errores.apellidos} autoComplete="family-name" />
            <FormField label="Fecha de nacimiento" required type="date" value={d.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} error={errores.fecha_nacimiento} />
            <FormField label="Sexo" as="select" value={d.sexo} onChange={e => set('sexo', e.target.value)} options={[{ value: 'mujer', label: 'Mujer' }, { value: 'hombre', label: 'Hombre' }, { value: 'otro', label: 'Otro' }]} />
            <FormField label="Celular" required type="tel" inputMode="tel" value={d.celular} onChange={e => set('celular', e.target.value)} error={errores.celular} autoComplete="tel" />
            <FormField label="Correo electrónico" required type="email" value={d.correo} onChange={e => set('correo', e.target.value)} error={errores.correo} autoComplete="email" />
          </div>
          <div style={{ fontSize: 13.5, margin: '4px 0 8px' }}>¿Primera vez en la clínica? <label><input type="radio" name="pv" checked={d.primera_vez} onChange={() => set('primera_vez', true)} /> Sí</label> <label><input type="radio" name="pv" checked={!d.primera_vez} onChange={() => set('primera_vez', false)} /> No</label></div>
          <FormField label="Motivo de la consulta (opcional)" value={d.motivo_consulta} onChange={e => set('motivo_consulta', e.target.value)} maxLength={500} />
          {menor && <div className="card" style={{ background: 'var(--accent-light)', marginBottom: 8 }}><b style={{ fontSize: 13 }}>Eres menor de edad: se requiere tutor</b>
            <div className="grid2"><FormField label="Nombre del tutor" value={d.tutor_nombre} onChange={e => set('tutor_nombre', e.target.value)} /><FormField label="Parentesco" value={d.tutor_parentesco} onChange={e => set('tutor_parentesco', e.target.value)} /></div>{errores.tutor && <span className="err">{errores.tutor}</span>}</div>}
          <label style={{ fontSize: 13.5 }}><input type="checkbox" checked={d.requiere_factura} onChange={e => set('requiere_factura', e.target.checked)} /> Necesito factura (pediremos tus datos fiscales)</label>
          {d.requiere_factura && (
            <div style={{ marginTop: 8 }}>
              <div className="grid2"><FormField label="RFC" value={d.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} error={errores.rfc} /><FormField label="C.P. fiscal" value={d.cp} onChange={e => set('cp', e.target.value.replace(/\D/g, '').slice(0, 5))} error={errores.cp} /></div>
              <FormField label="Razón social" value={d.razon_social} onChange={e => set('razon_social', e.target.value)} error={errores.razon_social} />
              <div className="grid2"><FormField label="Régimen fiscal" as="select" value={d.regimen} onChange={e => set('regimen', e.target.value)} options={REGIMENES.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} /><FormField label="Uso del CFDI" as="select" value={d.uso} onChange={e => set('uso', e.target.value)} options={USOS_CFDI.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} /></div>
            </div>)}
          <h3 style={{ margin: '14px 0 6px', fontSize: 15 }}>Consentimientos</h3>
          <label style={{ display: 'block', fontSize: 13.5, marginBottom: 6 }}><input type="checkbox" checked={c.aviso} onChange={e => setC(x => ({ ...x, aviso: e.target.checked }))} /> Leí y acepto el <VerTexto titulo="Aviso de privacidad" texto={AVISO_PRIVACIDAD}>aviso de privacidad</VerTexto> (datos personales y de salud). *</label>
          {errores.aviso && <div className="err" style={{ color: 'var(--red)', fontSize: 12 }}>{errores.aviso}</div>}
          <label style={{ display: 'block', fontSize: 13.5, marginBottom: 6 }}><input type="checkbox" checked={c.terminos} onChange={e => setC(x => ({ ...x, terminos: e.target.checked }))} /> Acepto los <VerTexto titulo="Términos y política de cancelación" texto={TERMINOS_RESERVA}>términos de la reserva y la política de cancelación (48 h)</VerTexto>. *</label>
          {errores.terminos && <div style={{ color: 'var(--red)', fontSize: 12 }}>{errores.terminos}</div>}
          <label style={{ display: 'block', fontSize: 13.5, marginBottom: 6 }}><input type="checkbox" checked={c.recordatorios} onChange={e => setC(x => ({ ...x, recordatorios: e.target.checked }))} /> Autorizo recordatorios por correo, SMS y WhatsApp (opcional).</label>
          <label style={{ display: 'block', fontSize: 13.5 }}><input type="checkbox" checked={c.fotos} onChange={e => setC(x => ({ ...x, fotos: e.target.checked }))} /> Autorizo el uso de fotografías clínicas en mi expediente (opcional; se firma en consulta).</label>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>El consentimiento informado del procedimiento se firma en la clínica.</div>
        </div>
        <div className="card" style={{ position: 'sticky', top: 8 }}>
          <b>Resumen</b>
          <div style={{ fontSize: 13.5, margin: '6px 0' }}>{servicio.nombre}{nombrePod ? ` · ${nombrePod}` : ''}<br />{sede.nombre} · {fechaLarga(slot.inicio)} · {hora(slot.inicio)}</div>
          <table style={{ fontSize: 14 }}><tbody>
            <tr><td>Precio</td><td className="num">{servicio.tipo_precio === 'a_valorar' ? 'A valorar' : moneda(precio)}</td></tr>
            <tr><td><b>Anticipo hoy</b></td><td className="num"><b>{moneda(servicio.anticipo ?? 0)}</b></td></tr>
            <tr><td>Saldo en la clínica</td><td className="num">{servicio.tipo_precio === 'a_valorar' ? '—' : moneda(Math.max(0, (precio ?? 0) - (servicio.anticipo ?? 0)))}</td></tr>
          </tbody></table>
          {msg && <div role="alert" className="text-red" style={{ fontSize: 13, margin: '8px 0' }}>{msg}</div>}
          <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={enviando} onClick={reservar}>{enviando ? 'Apartando horario…' : servicio.anticipo > 0 ? 'Continuar al pago →' : 'Confirmar reserva'}</button>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>{servicio.anticipo > 0 ? 'Tu horario se aparta por unos minutos mientras pagas.' : 'Esta cita no requiere anticipo.'}</div>
        </div>
      </div>
    </section>
  )
}

// ── pago del anticipo (Clip simulado) con retención de horario ───────────────────────────────────────
function PagoClip({ slug, reserva, sede, servicio, slot, nombrePod, onConfirmada, onReiniciar }) {
  const [t, setT] = useState({ numero: '', vigencia: '', cvv: '', nombre: '' })
  const [pagando, setPagando] = useState(false)
  const [msg, setMsg] = useState(null)
  const [restante, setRestante] = useState(() => Math.max(0, Math.floor((new Date(reserva.retenido_hasta) - Date.now()) / 1000)))
  useEffect(() => {
    const id = setInterval(() => setRestante(Math.max(0, Math.floor((new Date(reserva.retenido_hasta) - Date.now()) / 1000))), 1000)
    return () => clearInterval(id)
  }, [reserva.retenido_hasta])
  useEffect(() => { if (restante === 0) onReiniciar('Se agotó el tiempo para pagar y el horario se liberó. Elige uno nuevo.') }, [restante]) // eslint-disable-line

  const pagar = async () => {
    setMsg(null)
    const digitos = t.numero.replace(/\D/g, '')
    if (digitos.length < 13 || !t.vigencia.trim() || t.cvv.length < 3 || !t.nombre.trim()) return setMsg('Completa los datos de la tarjeta.')
    if (!luhn(digitos)) return setMsg('El número de tarjeta no es válido.')
    setPagando(true)
    const r = await cobrarAnticipoReserva({ slug, reservaId: reserva.reserva_id, tokenReserva: reserva.token_reserva, numeroTarjeta: digitos })
    setPagando(false)
    if (r.ok) return onConfirmada({ folio: r.datos?.folio ?? r.datos?.cita_folio, liga_token: r.datos?.liga_token, inicio: slot.inicio, anticipo: reserva.anticipo, saldo: reserva.saldo })
    if (r.estado === 'pago_rechazado' || r.resultado === 'rechazado') return setMsg('No pudimos procesar tu tarjeta; intenta con otra. Tu horario sigue apartado.')
    if (['vencida', 'horario_no_disponible'].includes(r.estado)) return onReiniciar('Ese horario ya no está disponible. Elige otro; si se cobró algo, se te reembolsará.')
    setMsg(r.mensaje ?? 'No se pudo completar el pago. Intenta de nuevo.')
  }
  const mm = String(Math.floor(restante / 60)).padStart(2, '0'), ss = String(restante % 60).padStart(2, '0')
  return (
    <section>
      <h2 style={{ fontSize: 17, marginBottom: 6 }}>Pago del anticipo</h2>
      <div className="card" style={{ background: 'var(--bd-a-bg)', marginBottom: 10, fontSize: 14 }}><Clock size={14} style={{ verticalAlign: -2 }} /> Tu horario está apartado: <b>{mm}:{ss}</b></div>
      <BannerSimulado texto={`${CLIP_AVISO} Prueba con ${TARJETAS_PRUEBA.aprobada} (aprobada) o ${TARJETAS_PRUEBA.rechazada} (rechazada).`} />
      <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>🔒 Pago seguro con Clip: los datos de tu tarjeta los procesa Clip; la clínica no los guarda.</div>
          <FormField label="Número de tarjeta" inputMode="numeric" autoComplete="cc-number" placeholder="•••• •••• •••• ••••" value={t.numero} onChange={e => setT({ ...t, numero: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} hint={marcaTarjeta(t.numero)} />
          <div className="grid2"><FormField label="Vigencia" placeholder="MM / AA" autoComplete="cc-exp" value={t.vigencia} onChange={e => setT({ ...t, vigencia: e.target.value })} /><FormField label="CVV" inputMode="numeric" autoComplete="cc-csc" type="password" value={t.cvv} onChange={e => setT({ ...t, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></div>
          <FormField label="Nombre en la tarjeta" autoComplete="cc-name" value={t.nombre} onChange={e => setT({ ...t, nombre: e.target.value })} />
          {msg && <div role="alert" className="text-red" style={{ fontSize: 13, margin: '6px 0' }}>{msg}</div>}
          <button className="btn" style={{ width: '100%' }} disabled={pagando} onClick={pagar}>{pagando ? 'Procesando…' : `Pagar ${moneda(reserva.anticipo)} y reservar`}</button>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Recibirás tu comprobante por correo.</div>
        </div>
        <div className="card">
          <b>Resumen</b>
          <table style={{ fontSize: 14, marginTop: 6 }}><tbody>
            <tr><td colSpan={2}>{servicio.nombre}{nombrePod ? ` · ${nombrePod}` : ''}</td></tr><tr><td colSpan={2} className="text-muted">{sede.nombre} · {fechaLarga(slot.inicio)} · {hora(slot.inicio)}</td></tr>
            <tr><td>Precio</td><td className="num">{moneda(reserva.precio)}</td></tr><tr><td><b>Anticipo hoy</b></td><td className="num"><b>{moneda(reserva.anticipo)}</b></td></tr><tr><td>Saldo a pagar en la clínica</td><td className="num">{moneda(reserva.saldo)}</td></tr>
          </tbody></table>
        </div>
      </div>
    </section>
  )
}

function Confirmada({ datos, sede, servicio, slot, podologo }) {
  const liga = datos.liga_token ? `${import.meta.env.BASE_URL}cita/${datos.liga_token}` : null
  return (
    <div className="card" style={{ textAlign: 'center', padding: 28 }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--bd-v-bg)', color: 'var(--green)', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}><Check size={30} /></div>
      <h2>¡Cita confirmada!</h2>
      <p style={{ margin: '6px 0' }}>{servicio?.nombre} · {podologo}<br /><b>{slot ? `${fechaLarga(slot.inicio)} · ${hora(slot.inicio)}` : ''}</b> · {sede?.nombre}{datos.tipo === 'videoconsulta' ? ' · videoconsulta' : ''}</p>
      {datos.folio && <p>Folio <b>{datos.folio}</b></p>}
      {Number(datos.anticipo) > 0 && <p className="text-muted" style={{ fontSize: 13.5 }}>Anticipo {moneda(datos.anticipo)} pagado · saldo {moneda(datos.saldo)} en la clínica.</p>}
      <p className="text-muted" style={{ fontSize: 13.5 }}>Te enviaremos el detalle a {datos.correo}. Guarda tu liga para confirmar, reprogramar o cancelar:</p>
      {liga ? <Link className="btn" to={`/cita/${datos.liga_token}`}>Administrar mi cita</Link> : <p className="text-muted" style={{ fontSize: 13 }}>La liga de tu cita te llegará por correo.</p>}
      {sede?.direccion && <p style={{ marginTop: 10, fontSize: 13.5 }}><MapPin size={13} style={{ verticalAlign: -2 }} /> <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sede.direccion)}`} target="_blank" rel="noreferrer">Cómo llegar</a></p>}
      <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Los correos y mensajes se envían cuando la clínica active su proveedor de mensajería.</p>
    </div>
  )
}

function ListaEsperaModal({ abierto, onClose, slug, sede, servicio, podologo }) {
  const [f, setF] = useState({ nombre: '', celular: '', correo: '', disp: '' })
  const [estado, setEstado] = useState({ ocupado: false, error: null, ok: false })
  const enviar = async () => {
    if (!f.nombre.trim() || f.celular.replace(/\D/g, '').length < 10) return setEstado({ ocupado: false, error: 'Nombre y celular de 10 dígitos son obligatorios.', ok: false })
    setEstado({ ocupado: true, error: null, ok: false })
    const { error } = await rpc('portal_lista_espera', { p_slug: slug, p_sede: sede.id, p_servicio: servicio.id, p_podologo: podologo === 'cualquiera' ? null : podologo, p_nombre: f.nombre, p_celular: f.celular, p_correo: f.correo || null, p_disponibilidad: f.disp || null })
    setEstado({ ocupado: false, error: error ? mensajePortal(error) : null, ok: !error })
  }
  return (
    <Modal open={abierto} onClose={onClose} size="sm" title="Avísame si se libera un horario" footer={estado.ok ? <button className="btn" onClick={onClose}>Listo</button> : <><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={estado.ocupado} onClick={enviar}>Avisarme</button></>}>
      {estado.ok ? <p>¡Listo! Te avisaremos si se libera un horario para {servicio?.nombre}. Tendrás unos minutos para responder.</p> : (<>
        <FormField label="Nombre" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <FormField label="Celular" type="tel" value={f.celular} onChange={e => setF({ ...f, celular: e.target.value })} />
        <FormField label="Correo (opcional)" type="email" value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} />
        <FormField label="¿Cuándo puedes? (opcional)" value={f.disp} onChange={e => setF({ ...f, disp: e.target.value })} placeholder="Lun–Vie por la tarde" />
        {estado.error && <div role="alert" className="text-red" style={{ fontSize: 13 }}>{estado.error}</div>}
      </>)}
    </Modal>
  )
}
