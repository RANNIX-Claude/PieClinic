// Detalle y acciones de una cita: estados, cancelación con política de anticipo, liga del paciente, recordatorio y anticipo.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Link2, Send, Receipt, UserRound, Copy, MessageCircle, Phone } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { actualizar, insertar, leer, rpc } from '../../../lib/api'
import { fechaHora, hora, moneda, telefono } from '../../../lib/formato'
import { bitacoraVer } from '../../../lib/bitacora'
import { transicionesPermitidas, ESTADOS_CITA } from '../../../lib/comercial/agenda'
import { evaluarCancelacion, resultadoAnticipoCancelacion, param } from '../../../lib/comercial/anticipo'
import { enlaceWa, ligaCita, redactar } from '../../../lib/adaptadores/mensajeria'
import { referenciaSimulada, CLIP_AVISO } from '../../../lib/adaptadores/clip'
import { ejecutar, BannerSimulado, textoError } from './comun'

const ETQ = { confirmada: 'Confirmar', en_camino: 'En camino', no_asistio: 'Marcar no asistió', cancelada: 'Cancelar cita', por_confirmar: 'Regresar a por confirmar', atendida: 'Marcar atendida' }

export default function DetalleCita({ cita, onClose, onCambio }) {
  const { rol, organizacion, sedeActiva } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const puedeEditar = usePermiso('agenda.editar')
  const puedeCobrar = usePermiso('ventas.cobrar')
  const esAdmin = rol === 'administrador'
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [liga, setLiga] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const parametros = organizacion?.parametros ?? {}

  const anticipo = useQuery({
    queryKey: ['comercial', 'anticipo-cita', cita.id],
    queryFn: async () => { bitacoraVer('citas', cita.id, {}, cita.sede_id); const r = await leer('prp_anticipos', { sedeCol: false, filtros: { cita_id: cita.id }, orden: { columna: 'pagado_en', asc: false }, limite: 1 }); return r.data?.[0] ?? null },
  })
  const a = anticipo.data
  const permitidas = transicionesPermitidas(cita.estado, { esAdmin, tipoAtencion: cita.tipo_atencion })
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['comercial'] }); onCambio?.() }

  const cambiar = async nuevo => {
    setOcupado(true)
    const ok = await ejecutar(actualizar('citas', cita.id, { estado: nuevo }), `Cita: ${ESTADOS_CITA[nuevo]?.label ?? nuevo}`)
    setOcupado(false)
    if (ok) { refrescar(); onClose() }
  }
  const cancelar = async motivo => {
    setOcupado(true)
    const ok = await ejecutar(actualizar('citas', cita.id, { estado: 'cancelada', motivo_cancelacion: motivo }), 'Cita cancelada')
    setOcupado(false); setConfirmarCancelar(false)
    if (ok) { refrescar(); onClose() }
  }
  const generarLiga = async () => {
    const { data, error } = await rpc('generar_liga_cita', { p_cita: cita.id })
    if (error) return toast.error(textoError(error))
    // si el Administrador/Recepción puede leer la config del portal, la liga lleva clínica/sede/servicio para ofrecer horarios al reprogramar
    const cfg = await leer('organizaciones_portal', { sedeCol: false, limite: 1 })
    const extra = cfg.data?.[0]?.slug ? `?${new URLSearchParams({ c: cfg.data[0].slug, s: cita.sede_id, sv: cita.servicio_id, p: cita.podologo_id })}` : ''
    setLiga(ligaCita(data) + extra)
  }
  const reenviar = async () => {
    const { error } = await rpc('reenviar_recordatorio', { p_cita: cita.id, p_canal: null })
    if (error) toast.error(textoError(error)); else { toast.success('Recordatorio programado (envío simulado: sin proveedor)'); refrescar() }
  }
  const pagarSimulado = async () => {
    const ref = referenciaSimulada()
    const ok = await ejecutar(actualizar('anticipos', a.id, { estado: 'pagado', pagado_en: new Date().toISOString(), referencia: ref }), 'Anticipo registrado como pagado (simulado)')
    if (ok) {
      await insertar('pagos_clip', { sede_id: cita.sede_id, clip_payment_id: ref, origen: 'terminal_sede', anticipo_id: a.id, monto: a.monto, estado: 'aprobado', modo: 'simulado', respuesta: { simulado: true } })
      anticipo.refetch(); refrescar()
    }
  }
  const reembolsoManual = async () => {
    const { error } = await rpc('registrar_reembolso_anticipo', { p_anticipo: a.id, p_modo: 'manual', p_referencia: 'Reembolso manual registrado en recepción' })
    if (error) toast.error(textoError(error)); else { toast.success('Reembolso registrado'); anticipo.refetch() }
  }

  const eval_ = evaluarCancelacion({ inicio: cita.inicio, horasAviso: param(parametros, 'cancelacion_horas_aviso') })
  const res = a ? resultadoAnticipoCancelacion({ anticipo: a.monto, estadoAnticipo: a.estado, enPlazo: eval_.enPlazo }) : null
  const textoWa = redactar('recordatorio_24h', { nombre: (cita.paciente_nombre ?? '').split(' ')[0], fecha: fechaHora(cita.inicio).split(' ')[0], hora: hora(cita.inicio), sede: cita.sede_nombre, liga })

  return (
    <Modal open onClose={onClose} title={`Cita ${cita.folio ?? ''}`} size="wide"
      footer={<button className="btn o" onClick={onClose}>Cerrar</button>}>
      <div className="grid2" style={{ gap: 14 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <StatusBadge estado={cita.estado} label={ESTADOS_CITA[cita.estado]?.label} />
            {cita.posible_no_asistio && <span className="bd r">Pasó la tolerancia</span>}
            {cita.sobrecupo && <span className="bd a">Sobrecupo</span>}
            {cita.seguimiento_garantia && <span className="bd b">Seguimiento / garantía</span>}
          </div>
          <table style={{ fontSize: 13 }}><tbody>
            {[
              ['Paciente', cita.paciente_nombre], ['Expediente', cita.numero_expediente ?? '—'], ['Teléfono', telefono(cita.paciente_celular)],
              ['Servicio', cita.servicio_nombre], ['Podólogo', cita.podologo_nombre], ['Sede / cabina', `${cita.sede_nombre}${cita.cabina_nombre ? ' · ' + cita.cabina_nombre : ''}`],
              ['Horario', `${fechaHora(cita.inicio)} – ${hora(cita.fin)} (${cita.duracion_min} min)`], ['Atención', cita.tipo_atencion + (cita.direccion_visita ? ` · ${cita.direccion_visita}` : '')],
              ['Origen', cita.origen], ['Precio', moneda(cita.precio_servicio)], ['Reprogramaciones', cita.reprogramaciones + (cita.reprogramacion_excedida ? ' (excedida)' : '')],
              ['Notas', cita.notas || '—'],
            ].map(([k, v]) => <tr key={k}><td style={{ color: 'var(--muted)', padding: '3px 12px 3px 0', whiteSpace: 'nowrap' }}>{k}</td><td>{v}</td></tr>)}
          </tbody></table>
        </div>
        <div>
          <div className="card" style={{ marginBottom: 10 }}>
            <b style={{ fontSize: 13 }}>Anticipo</b>
            {anticipo.isLoading ? <div className="text-muted" style={{ fontSize: 12 }}>Cargando…</div> : !a ? <div className="text-muted" style={{ fontSize: 12.5 }}>Sin anticipo{cita.anticipo_requerido > 0 ? ` (requerido ${moneda(cita.anticipo_requerido)})` : ''}.</div> : (
              <div style={{ fontSize: 13 }}>
                {moneda(a.monto)} · <StatusBadge estado={a.estado} /> · {a.origen} · {a.folio}
                {a.estado === 'pendiente' && puedeEditar && (<><BannerSimulado compacto texto={CLIP_AVISO} /><button className="btn" onClick={pagarSimulado}>Registrar pago (Clip simulado)</button></>)}
                {a.reembolso_estado === 'solicitado' && <div style={{ marginTop: 6 }}><span className="bd a">Reembolso por registrar · {moneda(a.reembolso_monto)} · 5 a 10 días hábiles</span>{puedeCobrar && <button className="btn o" style={{ marginLeft: 8 }} onClick={reembolsoManual}>Registrar reembolso manual</button>}</div>}
                {['procesado', 'manual'].includes(a.reembolso_estado) && <div className="text-green" style={{ marginTop: 4 }}>Reembolso {a.reembolso_estado} el {fechaHora(a.reembolso_cerrado_en)}</div>}
              </div>
            )}
          </div>
          {['por_confirmar', 'confirmada'].includes(cita.estado) && (
            <div className="card" style={{ marginBottom: 10, fontSize: 12.5 }}>
              <b>Si se cancela ahora:</b> faltan {Math.max(0, Math.round(eval_.horas))} h ·{' '}
              {eval_.enPlazo ? <span className="text-green">dentro del plazo ({param(parametros, 'cancelacion_horas_aviso')} h)</span> : <span className="text-red">fuera de plazo</span>}
              {res && (a?.estado === 'pagado') && <div>{res.reembolsa ? `El anticipo de ${moneda(res.montoReembolso)} se reembolsa.` : `El anticipo de ${moneda(res.retenido)} no es reembolsable.`}</div>}
            </div>
          )}
          {puedeEditar && permitidas.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {permitidas.map(e => <button key={e} className={`btn${e === 'cancelada' || e === 'no_asistio' ? ' red' : ''}`} disabled={ocupado}
                onClick={() => (e === 'cancelada' ? setConfirmarCancelar(true) : cambiar(e))}>{ETQ[e] ?? e}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {puedeEditar && ['por_confirmar', 'confirmada'].includes(cita.estado) && <button className="btn o" onClick={generarLiga}><Link2 size={14} style={{ verticalAlign: -2 }} /> Liga del paciente</button>}
            {puedeEditar && ['por_confirmar', 'confirmada'].includes(cita.estado) && <button className="btn o" onClick={reenviar}><Send size={14} style={{ verticalAlign: -2 }} /> Reenviar recordatorio</button>}
            {puedeCobrar && cita.estado !== 'cancelada' && <button className="btn o" onClick={() => nav(`/caja?cita=${cita.id}`)}><Receipt size={14} style={{ verticalAlign: -2 }} /> Cobrar</button>}
            <button className="btn o" onClick={() => nav(`/pacientes/${cita.paciente_id}`)}><UserRound size={14} style={{ verticalAlign: -2 }} /> Paciente</button>
            {cita.paciente_celular && <a className="btn o" href={`tel:${cita.paciente_celular}`}><Phone size={14} style={{ verticalAlign: -2 }} /> Llamar</a>}
          </div>
          {liga && (
            <div className="card" style={{ marginTop: 10, fontSize: 12.5 }}>
              <div style={{ wordBreak: 'break-all' }}>{liga}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn o" onClick={() => { navigator.clipboard?.writeText(liga); toast.success('Liga copiada') }}><Copy size={13} /> Copiar</button>
                {cita.paciente_celular && <a className="btn o" target="_blank" rel="noreferrer" href={enlaceWa(cita.paciente_celular, textoWa)}><MessageCircle size={13} /> WhatsApp (manual)</a>}
              </div>
              <div className="text-muted" style={{ marginTop: 4 }}>La liga sirve para una acción (confirmar, reprogramar o cancelar) y vence a la hora de la cita.</div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirmarCancelar} titulo="Cancelar cita" peligro pedirMotivo ocupado={ocupado} textoConfirmar="Cancelar cita"
        mensaje={`${cita.paciente_nombre} · ${fechaHora(cita.inicio)}. ${a?.estado === 'pagado' ? (eval_.enPlazo ? 'El anticipo se reembolsa (5 a 10 días hábiles).' : 'Fuera de plazo: el anticipo no es reembolsable.') : ''}`}
        onConfirm={cancelar} onCancel={() => setConfirmarCancelar(false)} />
    </Modal>
  )
}
