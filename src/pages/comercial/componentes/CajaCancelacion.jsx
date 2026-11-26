// Cancelación de un ticket con piezas, CON BLOQUEO (Etapa 1, F1.3). La cancelación deja de ser inmediata: queda PENDIENTE (la pieza NO vuelve al inventario) hasta que el módulo
// responda. Para autorizarla se exige, en un solo paso: ESCANEAR la pieza devuelta, FOTO EN VIVO de la pieza ya de regreso en el estante (sin galería), CLAVE de un supervisor o
// del dueño y MOTIVO del catálogo cerrado. Si el código no es de la pieza del ticket se rechaza: sin pieza presente no hay cancelación. Al pasar la espera (60 s por omisión)
// queda «pendiente de validación», sin devolver la pieza y con alerta: nunca se resuelve sola. Captura a ciegas: aquí no hay saldos, existencias ni diferencias.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, ScanLine, ShieldCheck, Timer, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../../components/ui/Modal'
import CamaraEnVivo from '../../auditoria/cierres/CamaraEnVivo'
import { useApp } from '../../../context/AppContext'
import { contextoApi } from '../../../lib/api'
import { ladoLargoFoto } from '../../../lib/auditoria/apiCierres'
import {
  solicitarCancelacion, estadoCancelacion, resolverCancelacion, rechazarCancelacion, normalizarCodigo, piezasRequeridas, segundosRestantes, formatoCuenta, textoEstadoCancelacion,
} from '../../../lib/comercial/cajaControl'
import { textoError } from './comun'

export default function CajaCancelacion({ venta, params, onClose, onResuelta }) {
  const { sedeActivaId } = useApp()
  const sede = venta?.sede_id ?? sedeActivaId
  const [sol, setSol] = useState(null)            // { id, folio, estado, vence_en, productos }
  const [segundos, setSegundos] = useState(null)
  const [codigos, setCodigos] = useState([])
  const [lectura, setLectura] = useState('')
  const [foto, setFoto] = useState(null)          // { blob, ancho, alto, hash, url }
  const [camara, setCamara] = useState(false)
  const [lado, setLado] = useState(1600)
  const [motivoId, setMotivoId] = useState('')
  const [nota, setNota] = useState('')
  const [autorizador, setAutorizador] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [final, setFinal] = useState(null)        // 'autorizada' | 'rechazada'
  const lecturaRef = useRef(null)

  // 1 · se pide la cancelación: queda pendiente y empieza la espera
  useEffect(() => {
    if (!venta?.id) return
    let vivo = true
    ;(async () => {
      const { data, error: err } = await solicitarCancelacion({ ventaId: venta.id, motivo: venta.motivo ?? null })
      if (!vivo) return
      if (err) { setError(textoError(err)); return }
      if (!data?.ok) { setError(data?.mensaje || 'No se pudo pedir la cancelación'); return }
      setSol(data)
    })()
    ladoLargoFoto(sede).then(r => { if (vivo && Number(r.data) > 0) setLado(Number(r.data)) })
    return () => { vivo = false }
  }, [venta?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMotivoId(m => m || params?.motivos_cancelacion?.[0]?.id || ''); setAutorizador(a => a || params?.autorizadores?.[0]?.id || '') }, [params])
  useEffect(() => () => { if (foto?.url) URL.revokeObjectURL(foto.url) }, [foto])

  // cuenta regresiva y estado real (el servidor es quien vence la espera)
  const refrescar = useCallback(async () => {
    if (!sol?.id) return
    const { data } = await estadoCancelacion(sol.id)
    if (data) setSol(s => ({ ...s, ...data }))
  }, [sol?.id])
  useEffect(() => {
    if (!sol?.vence_en || final) return
    const t = setInterval(() => setSegundos(segundosRestantes(sol.vence_en)), 500)
    setSegundos(segundosRestantes(sol.vence_en))
    return () => clearInterval(t)
  }, [sol?.vence_en, final])
  useEffect(() => {
    if (!sol?.id || final) return
    const t = setInterval(refrescar, 5000)
    return () => clearInterval(t)
  }, [sol?.id, final, refrescar])
  useEffect(() => { if (segundos === 0 && sol?.estado === 'pendiente') refrescar() }, [segundos]) // eslint-disable-line react-hooks/exhaustive-deps

  const requeridas = piezasRequeridas(sol?.productos)
  const motivo = (params?.motivos_cancelacion ?? []).find(m => m.id === motivoId)
  const listo = !!sol && codigos.length >= 1 && !!foto && !!motivoId && (!motivo?.requiere_nota || nota.trim()) && !!autorizador && pin.length >= 4 && !ocupado

  const leer = e => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const c = normalizarCodigo(lectura)
    if (!c) return
    setCodigos(cs => [...cs, c]); setLectura(''); setError(null)
  }
  async function tomarFoto({ blob, ancho, alto, hash }) { setFoto({ blob, ancho, alto, hash, url: URL.createObjectURL(blob) }) }

  async function validar() {
    setOcupado(true); setError(null)
    const { data, error: err } = await resolverCancelacion({ id: sol.id, organizacionId: contextoApi().organizacionId, sucursalId: sede, codigos, motivoId, nota: nota.trim() || null, autorizadorId: autorizador, pin, foto })
    setOcupado(false)
    if (err) { setError(textoError(err)); return }
    if (!data?.ok) {
      setError(data?.mensaje || 'La cancelación no se autorizó.')
      if (data?.error === 'pieza_no_corresponde' || data?.error === 'pieza_no_escaneada') setCodigos([])
      if (data?.error === 'clave_incorrecta' || data?.error === 'bloqueado') setPin('')
      refrescar(); return
    }
    setFinal('autorizada'); toast.success('Cancelación autorizada: la pieza volvió al inventario'); onResuelta?.()
  }
  async function desistir() {
    setOcupado(true)
    const { error: err } = await rechazarCancelacion(sol.id, 'El cajero desistió de la cancelación')
    setOcupado(false)
    if (err) return setError(textoError(err))
    setFinal('rechazada'); toast('La venta queda firme', { icon: 'ℹ️' }); onResuelta?.()
  }

  const vencida = sol?.estado === 'pendiente_de_validacion'
  return (
    <>
      <Modal open onClose={onClose} title={`Cancelar ticket ${venta?.folio ?? ''} · validación`} size="wide" cerrarAlClicFuera={false}
        footer={final ? <button type="button" className="btn" onClick={onClose}>Cerrar</button> : <>
          <button type="button" className="btn o" disabled={ocupado || !sol} onClick={desistir} title="La venta queda firme">No cancelar (la venta queda firme)</button>
          <button type="button" className="btn red" disabled={!listo} onClick={validar}>{ocupado ? 'Validando…' : 'Validar y cancelar'}</button></>}>
        {final ? (
          <div role="status" style={{ fontSize: 14 }}>{final === 'autorizada' ? textoEstadoCancelacion('autorizada') : textoEstadoCancelacion('rechazada')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="cj-hecho-off" style={{ background: vencida ? '#FDE7E7' : '#FFF4D6', border: `1px solid ${vencida ? '#D96B6B' : '#E5B93C'}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }} role="status">
              <Timer size={14} style={{ verticalAlign: -2 }} /> {sol ? <>Solicitud <b>{sol.folio}</b> · {vencida ? 'venció la espera' : <>responde en <b>{formatoCuenta(segundos ?? 0)}</b></>}. {textoEstadoCancelacion(sol.estado)}</> : 'Pidiendo la cancelación…'}
            </div>

            <div>
              <div className="cj-sub" style={{ marginTop: 0 }}><ScanLine size={14} style={{ verticalAlign: -2 }} /> 1 · Escanea la pieza devuelta {requeridas > 0 && <span className="text-muted">({Math.min(codigos.length, requeridas)} de {requeridas} lecturas)</span>}</div>
              <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Piezas del ticket: {(sol?.productos ?? []).map(p => `${p.nombre} ×${Number(p.cantidad)}`).join(' · ') || '—'}. Sin la pieza presente no hay cancelación.</div>
              <input ref={lecturaRef} className="cj-buscar-in" style={{ width: '100%' }} placeholder="Escanea el código de barras y pulsa Enter" value={lectura} onChange={e => setLectura(e.target.value)} onKeyDown={leer} autoFocus aria-label="Código de la pieza devuelta" />
              {codigos.length > 0 && <div style={{ fontSize: 12.5, marginTop: 4 }}>Leídos: {codigos.map((c, i) => <span key={i} className="bd m" style={{ marginRight: 4 }}>{c} <button type="button" aria-label="Quitar lectura" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setCodigos(cs => cs.filter((_, j) => j !== i))}><X size={10} /></button></span>)}</div>}
            </div>

            <div>
              <div className="cj-sub" style={{ marginTop: 0 }}><Camera size={14} style={{ verticalAlign: -2 }} /> 2 · Foto en vivo de la pieza de regreso en el estante</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" className="btn o" onClick={() => setCamara(true)}>{foto ? 'Tomar otra foto' : 'Abrir la cámara'}</button>
                {foto ? <img src={foto.url} alt="Foto de la pieza en el estante" style={{ height: 56, borderRadius: 6, border: '1px solid var(--border, #ccc)' }} /> : <span className="text-muted" style={{ fontSize: 12.5 }}>La foto se toma en el momento: no se puede subir de la galería.</span>}
              </div>
            </div>

            <div className="grid2" style={{ gap: 12 }}>
              <div>
                <div className="cj-sub" style={{ marginTop: 0 }}>3 · Motivo</div>
                <select value={motivoId} onChange={e => setMotivoId(e.target.value)} aria-label="Motivo de la cancelación" style={{ width: '100%' }}>
                  {(params?.motivos_cancelacion ?? []).map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
                {motivo?.requiere_nota && <input style={{ width: '100%', marginTop: 6 }} placeholder="Nota obligatoria para este motivo" value={nota} onChange={e => setNota(e.target.value)} />}
              </div>
              <div>
                <div className="cj-sub" style={{ marginTop: 0 }}><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> 4 · Clave de supervisor</div>
                <select value={autorizador} onChange={e => setAutorizador(e.target.value)} aria-label="Quién autoriza" style={{ width: '100%' }}>
                  {(params?.autorizadores ?? []).map(a => <option key={a.id} value={a.id}>{a.nombre} · {a.rol === 'administrador' ? 'dueño' : 'supervisor'}</option>)}
                </select>
                <input type="password" inputMode="numeric" autoComplete="off" style={{ width: '100%', marginTop: 6 }} placeholder="PIN personal de quien autoriza" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} aria-label="PIN del supervisor" />
              </div>
            </div>
            {error && <div className="text-red" role="alert" style={{ fontSize: 13 }}>{error}</div>}
          </div>
        )}
      </Modal>
      {camara && <CamaraEnVivo titulo="Pieza de regreso en el estante" ladoLargo={lado} onFoto={tomarFoto} onClose={() => setCamara(false)} />}
    </>
  )
}
