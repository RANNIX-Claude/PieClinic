// Recorrido de un cierre para quien CAPTURA (recepción, podología; también dueño y supervisor cuando cierran ellos): un punto por pantalla, barra de avance,
// botones grandes, teclado numérico nativo y guardado parcial (cada punto se guarda en el servidor al avanzar: si la app se cierra, se retoma donde iba).
// NUNCA pinta ni pide valor esperado, diferencia, tolerancia ni corte: el servidor no se los entrega a este rol.
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Circle, Minus, Plus, AlertTriangle } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { moneda } from '../../../lib/formato'
import { recorridoCierre, capturarPunto, cerrarCierre, guiaToma, ladoLargoFoto, subirFotoCierre } from '../../../lib/auditoria/apiCierres'
import { DENOMINACIONES, NOMBRE_TIPO_CIERRE, progresoRecorrido, siguientePendiente, totalDenominaciones, validarCapturaPunto } from '../../../lib/auditoria/cierres'
import { LADO_LARGO_POR_OMISION } from '../../../lib/auditoria/foto'
import { errMsg } from '../comun'
import CamaraEnVivo from './CamaraEnVivo'

const grande = { padding: '14px 20px', fontSize: 16, minHeight: 50 }

export default function Recorrido({ cierreId, onSalir }) {
  const { organizacion } = useApp()
  const [rec, setRec] = useState(null)
  const [idx, setIdx] = useState(0)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [lado, setLado] = useState(LADO_LARGO_POR_OMISION)

  const cargar = useCallback(async (primera = false) => {
    const r = await recorridoCierre(cierreId)
    if (r.error) { setError(errMsg(r.error)); return null }
    setRec(r.data)
    if (primera) { const p = siguientePendiente(r.data.puntos); setIdx(p === -1 ? r.data.puntos.length : p) }   // retoma donde iba
    return r.data
  }, [cierreId])
  useEffect(() => { cargar(true) }, [cargar])
  useEffect(() => { if (rec?.cierre?.sucursal_id) ladoLargoFoto(rec.cierre.sucursal_id).then(r => { if (!r.error && r.data) setLado(Number(r.data)) }) }, [rec?.cierre?.sucursal_id])

  if (error) return <div className="card text-red" role="alert">{error}</div>
  if (!rec) return <div className="card">Cargando el recorrido…</div>
  const { cierre, puntos } = rec
  const prog = progresoRecorrido(puntos)
  const enResumen = idx >= puntos.length
  if (resultado) return <Resultado r={resultado} cierre={cierre} onSalir={onSalir} />
  if (cierre.estado !== 'en_captura') return <div className="card">Este cierre ya está <b>{cierre.estado.replace(/_/g, ' ')}</b>. <button className="btn o" onClick={onSalir}>Volver</button></div>

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>{NOMBRE_TIPO_CIERRE[cierre.tipo]} · {cierre.folio}</div>
        <button className="btn o sm" onClick={onSalir}>Salir (se guarda)</button>
      </div>
      <div role="progressbar" aria-valuenow={prog.porcentaje} aria-valuemin={0} aria-valuemax={100} style={{ height: 10, background: 'var(--border, #ddd)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${prog.porcentaje}%`, height: '100%', background: 'var(--accent, #6d4cff)', transition: 'width .2s' }} />
      </div>
      <div className="hint" style={{ margin: '4px 0 10px' }}>{enResumen ? 'Revisión final' : `Punto ${idx + 1} de ${puntos.length}`} · {prog.hechos} de {prog.total} listos</div>
      {enResumen
        ? <Resumen rec={rec} prog={prog} onIr={setIdx} onCerrado={setResultado} />
        : <PasoPunto key={puntos[idx].punto_id + ':' + (puntos[idx].captura?.id ?? '')} punto={puntos[idx]} cierre={cierre} organizacionId={organizacion?.id} lado={lado}
            recargar={cargar} onAnterior={idx > 0 ? () => setIdx(idx - 1) : null} onSiguiente={() => setIdx(idx + 1)} />}
    </div>
  )
}

// ───────────────────────────── un punto por pantalla ─────────────────────────────
function PasoPunto({ punto, cierre, organizacionId, lado, recargar, onAnterior, onSiguiente }) {
  const [valor, setValor] = useState(punto.captura?.valor != null ? String(Number(punto.captura.valor)) : '')
  const [cant, setCant] = useState(() => Object.fromEntries((punto.captura?.denominaciones ?? []).map(d => [Number(d.denominacion), Number(d.cantidad)])))
  const [guardando, setGuardando] = useState(false)
  const [camara, setCamara] = useState(null)   // { tomaId, nombre, guiaRuta }
  const esDen = punto.tipo_captura === 'denominaciones'
  const tieneValor = punto.requiere_valor
  const desglose = useMemo(() => DENOMINACIONES.map(d => ({ denominacion: d, cantidad: Number(cant[d] || 0) })), [cant])
  const total = totalDenominaciones(desglose)

  async function guardar() {
    const entrada = esDen ? { denominaciones: desglose } : tieneValor ? { valor: valor === '' ? null : Number(valor) } : {}
    const v = validarCapturaPunto(punto.tipo_captura, entrada)
    if (!v.ok) return toast.error(v.error)
    setGuardando(true)
    const r = await capturarPunto({ cierreId: cierre.id, puntoId: punto.punto_id, valor: entrada.valor ?? null, denominaciones: entrada.denominaciones ?? null })
    setGuardando(false)
    if (r.error) return toast.error(errMsg(r.error))
    await recargar()
    return true
  }
  async function guardarYSeguir() {
    if (punto.tipo_captura !== 'solo_foto') { if (!(await guardar())) return }
    onSiguiente()
  }
  async function abrirCamara(toma) {
    let guiaRuta = null
    if (toma) { const g = await guiaToma(toma.id); if (!g.error && g.data?.hay_guia) guiaRuta = g.data.ruta }
    setCamara({ tomaId: toma?.id ?? null, nombre: toma?.nombre ?? punto.nombre, guiaRuta })
  }
  async function subir({ blob, ancho, alto, hash }) {
    // el valor (si el punto lo lleva) debe estar guardado antes de la foto
    if (tieneValor && !punto.captura) { const ok = await guardar(); if (!ok) throw new Error('Capture primero el valor') }
    const r = await subirFotoCierre({ organizacionId, sucursalId: cierre.sucursal_id, cierreId: cierre.id, puntoId: punto.punto_id, tomaId: camara.tomaId, blob, ancho, alto, hash })
    if (r.error) throw new Error(errMsg(r.error))
    toast.success('Foto guardada')
    await recargar()
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{punto.nombre}{!punto.obligatorio && <span className="hint" style={{ fontSize: 13, fontWeight: 400 }}> (opcional)</span>}</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        {esDen ? 'Cuente billete por billete y moneda por moneda. No hay campo de total: se suma solo.' : tieneValor ? 'Escriba el valor que ve, sin calcular nada.' : 'Esta evidencia queda en el expediente del cierre.'}
      </div>

      {esDen && (
        <div>
          {DENOMINACIONES.map(d => (
            <div key={d} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{moneda(d)}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="btn o" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Quitar ${d}`} onClick={() => setCant({ ...cant, [d]: Math.max(0, Number(cant[d] || 0) - 1) })}><Minus size={16} /></button>
                <input inputMode="numeric" pattern="[0-9]*" aria-label={`Cantidad de ${d}`} value={cant[d] ?? ''} placeholder="0" style={{ width: 80, textAlign: 'center', fontSize: 20, minHeight: 48 }}
                  onChange={e => setCant({ ...cant, [d]: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                <button type="button" className="btn o" style={{ minWidth: 48, minHeight: 48 }} aria-label={`Agregar ${d}`} onClick={() => setCant({ ...cant, [d]: Number(cant[d] || 0) + 1 })}><Plus size={16} /></button>
              </div>
              <div style={{ textAlign: 'right', color: 'var(--muted, #666)' }}>{moneda(d * Number(cant[d] || 0))}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border, #ddd)', paddingTop: 8, marginTop: 8, fontSize: 18 }}>
            <b>Total contado</b><b>{moneda(total)}</b>
          </div>
        </div>
      )}

      {!esDen && tieneValor && (
        <input autoFocus inputMode="decimal" aria-label="Valor" value={valor} placeholder="0" style={{ width: '100%', fontSize: 34, textAlign: 'center', minHeight: 70 }}
          onChange={e => setValor(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 12))} />
      )}

      {punto.requiere_foto && (
        <div style={{ marginTop: 14 }}>
          {punto.tomas
            ? punto.tomas.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {t.foto ? <CheckCircle2 color="var(--green, #1a9d55)" /> : <Circle color="var(--muted, #999)" />}
                <div style={{ flex: 1, fontSize: 16 }}>{t.nombre}</div>
                <button type="button" className={t.foto ? 'btn o' : 'btn'} style={grande} onClick={() => abrirCamara(t)}><Camera size={18} style={{ verticalAlign: -4 }} /> {t.foto ? 'Repetir' : 'Tomar foto'}</button>
              </div>))
            : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {punto.fotos > 0 ? <CheckCircle2 color="var(--green, #1a9d55)" /> : <Circle color="var(--muted, #999)" />}
                <div style={{ flex: 1 }}>{punto.fotos > 0 ? `${punto.fotos} foto(s) guardada(s)` : 'Falta la foto'}</div>
                <button type="button" className={punto.fotos ? 'btn o' : 'btn'} style={grande} disabled={tieneValor && valor === '' && !punto.captura} onClick={() => abrirCamara(null)}><Camera size={18} style={{ verticalAlign: -4 }} /> Tomar foto</button>
              </div>)}
          <div className="hint" style={{ marginTop: 6 }}>La foto se toma en vivo con la cámara; no se puede subir de la galería. La hora la pone el servidor.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {onAnterior && <button type="button" className="btn o" style={grande} onClick={onAnterior}><ArrowLeft size={18} style={{ verticalAlign: -4 }} /> Atrás</button>}
        <button type="button" className="btn" style={{ ...grande, flex: 1 }} disabled={guardando} onClick={guardarYSeguir}>
          {guardando ? 'Guardando…' : <>Guardar y seguir <ArrowRight size={18} style={{ verticalAlign: -4 }} /></>}
        </button>
      </div>
      {camara && <CamaraEnVivo titulo={camara.nombre} guiaRuta={camara.guiaRuta} ladoLargo={lado} onFoto={subir} onClose={() => setCamara(null)} />}
    </div>
  )
}

// ───────────────────────────── resumen, entrega y cierre ─────────────────────────────
function Resumen({ rec, prog, onIr, onCerrado }) {
  const { cierre, puntos } = rec
  const esTurno = cierre.tipo === 'turno'
  const [conEntrega, setConEntrega] = useState(true)
  const [confirmo, setConfirmo] = useState(false)
  const [montoTxt, setMontoTxt] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const pDen = puntos.find(p => p.tipo_captura === 'denominaciones' && p.captura)
  const montoDesglose = pDen ? totalDenominaciones(pDen.captura.denominaciones) : null
  const monto = montoDesglose ?? (montoTxt === '' ? null : Number(montoTxt))
  const entrega = esTurno && conEntrega

  async function cerrar() {
    setOcupado(true)
    const r = await cerrarCierre({ cierreId: cierre.id, conEntrega: esTurno ? conEntrega : false, montoConfirmado: entrega ? monto : null })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    onCerrado(r.data)
  }
  return (
    <div className="card" style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Revise y cierre</h2>
      {puntos.map((p, i) => (
        <button key={p.punto_id} type="button" onClick={() => onIr(i)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 4px', background: 'none', border: 0, borderBottom: '1px solid var(--border, #eee)', textAlign: 'left', fontSize: 15, cursor: 'pointer' }}>
          {p.completo ? <CheckCircle2 color="var(--green, #1a9d55)" size={20} /> : p.obligatorio ? <AlertTriangle color="var(--red, #c0392b)" size={20} /> : <Circle size={20} color="#999" />}
          <span style={{ flex: 1 }}>{p.nombre}{!p.obligatorio && ' (opcional)'}</span>
          <span className="hint">{p.completo ? (p.captura?.valor != null ? (p.tipo_captura === 'denominaciones' || /terminal|efectivo/i.test(p.nombre) ? moneda(p.captura.valor) : Number(p.captura.valor)) : 'Listo') : p.falta}</span>
        </button>
      ))}
      {!prog.puedeCerrar && <div className="text-red" style={{ marginTop: 10, fontSize: 13 }} role="alert">No se puede cerrar: faltan puntos obligatorios ({prog.faltan.join(', ')}).</div>}
      {esTurno && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border, #ddd)', borderRadius: 10 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15 }}>
            <input type="checkbox" checked={conEntrega} onChange={e => { setConEntrega(e.target.checked); setConfirmo(false) }} /> Entrego el efectivo al turno siguiente (doble firma)
          </label>
          {conEntrega && (
            <div style={{ marginTop: 10 }}>
              {montoDesglose != null
                ? <div style={{ fontSize: 18 }}>Efectivo que entrego: <b>{moneda(montoDesglose)}</b> <span className="hint">(la suma de su desglose)</span></div>
                : <input inputMode="decimal" aria-label="Efectivo que entrego" placeholder="Efectivo que entrego" value={montoTxt} onChange={e => setMontoTxt(e.target.value.replace(/[^0-9.]/g, ''))} style={{ fontSize: 20 }} />}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15, marginTop: 8 }}>
                <input type="checkbox" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} /> Confirmo con mi usuario que entrego {monto != null ? moneda(monto) : 'este monto'}
              </label>
              <div className="hint" style={{ marginTop: 4 }}>Quien reciba contará, firmará con su PIN y ese monto será el fondo inicial de su turno. Hasta entonces el cierre queda «entrega no aceptada».</div>
            </div>
          )}
        </div>
      )}
      <button type="button" className="btn" style={{ ...grande, width: '100%', marginTop: 14 }} disabled={ocupado || !prog.puedeCerrar || (entrega && (!confirmo || monto == null))} onClick={cerrar}>
        <Check size={18} style={{ verticalAlign: -4 }} /> {ocupado ? 'Cerrando…' : 'Cerrar el cierre'}
      </button>
    </div>
  )
}

function Resultado({ r, cierre, onSalir }) {
  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto', padding: 20, textAlign: 'center' }}>
      <CheckCircle2 size={44} color="var(--green, #1a9d55)" />
      <h2 style={{ margin: '8px 0' }}>Cierre {r.folio} guardado</h2>
      {r.estado === 'entrega_no_aceptada'
        ? <p>Queda <b>pendiente de aceptar</b>. La persona del turno siguiente debe contar el efectivo y aceptar la entrega con su PIN antes de vender. {NOMBRE_TIPO_CIERRE[cierre.tipo]}.</p>
        : <p>Gracias. El servidor calculó los cuadres; el dueño y el supervisor los revisan. Usted no necesita hacer nada más.</p>}
      <button className="btn" style={grande} onClick={onSalir}>Listo</button>
    </div>
  )
}
