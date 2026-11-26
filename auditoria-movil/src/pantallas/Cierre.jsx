// CIERRE (F3.1 / F6.1): el recorrido del checklist, un punto por pantalla, con barra de avance, botones grandes, teclado numérico nativo y guardado parcial.
// Todo se guarda primero EN EL TELÉFONO y se envía por la cola idempotente: el cierre se completa sin internet y se sincroniza al volver la señal.
// Captura a ciegas: esta pantalla no recibe ni pinta esperado, tolerancia ni diferencia (el servidor no se los entrega a este rol).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DENOMINACIONES, NOMBRE_TIPO_CIERRE, progresoRecorrido, siguientePendiente, totalDenominaciones, validarCapturaPunto } from '../../../src/lib/auditoria/cierres.js'
import { aplicarCaptura, aplicarFoto, crearCierreLocal, marcarEstado, recorridoLocal } from '../../../src/lib/auditoria/pwaCierreLocal.js'
import { blobABytes } from '../../../src/lib/auditoria/pwaCamara.js'
import { cierresLocales, guardarCierre, leerCierre } from '../almacen'
import { plantillaDeCierre, TIPOS } from '../datos'
import { cola, nuevoId, sincronizarAhora } from '../envio'
import CamaraVivo from './CamaraVivo'

const moneda = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)

export default function Cierre({ ctx }) {
  const [cierreId, setCierreId] = useState(null)
  const [locales, setLocales] = useState([])
  const [aviso, setAviso] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const recargarLista = useCallback(async () => setLocales((await cierresLocales()).filter(c => c.sucursalId === ctx.sucursal.id && c.usuarioId === ctx.usuario.id && c.estado === 'en_captura')), [ctx.sucursal.id, ctx.usuario.id])
  useEffect(() => { recargarLista() }, [recargarLista, cierreId])

  async function iniciar(tipo) {
    setOcupado(true); setAviso(null)
    const previo = locales.find(c => c.tipo === tipo)
    if (previo) { setCierreId(previo.id); setOcupado(false); return }   // retoma el que quedó a medias
    const r = await plantillaDeCierre(ctx.sucursal.id, tipo)
    if (r.error) { setAviso(r.error); setOcupado(false); return }
    if (!r.plantilla.puntos.length) { setAviso(`No hay puntos de control activos para un cierre de tipo «${NOMBRE_TIPO_CIERRE[tipo]}» en esta sucursal. El dueño los define en Configuración de auditoría.`); setOcupado(false); return }
    const id = nuevoId()
    const c = { ...crearCierreLocal({ id, sucursalId: ctx.sucursal.id, tipo, plantilla: r.plantilla }), usuarioId: ctx.usuario.id, organizacionId: ctx.usuario.organizacionId }
    await guardarCierre(c)
    await cola.encolar('cierre_abrir', { sucursalId: c.sucursalId, tipo }, { id, usuario: ctx.usuario.id })
    if (navigator.onLine !== false) await sincronizarAhora({ forzar: true, usuario: ctx.usuario.id })   // con señal: se abre en el servidor y se retoma lo que ya hubiera
    setOcupado(false); setCierreId(id)
  }

  if (cierreId) return <Recorrido ctx={ctx} cierreId={cierreId} onSalir={() => setCierreId(null)} />
  return (
    <div>
      <h2>Cierre</h2>
      <p className="hint">Recorre los puntos de control uno por uno. Se guarda en el teléfono al avanzar: si se cierra la app o se va la señal, retomas donde ibas.</p>
      {aviso && <div className="aviso rojo" role="alert">{aviso}</div>}
      {locales.map(c => (
        <div key={c.id} className="card" data-testid="cierre-en-curso">
          <div className="fila sp"><b>{NOMBRE_TIPO_CIERRE[c.tipo]}</b><span className="chip a">En captura</span></div>
          <div className="hint">{c.folio ?? 'Aún sin folio (se asigna al enviarse)'}</div>
          <button className="btn bloque" style={{ marginTop: 8 }} onClick={() => setCierreId(c.id)}>Retomar</button>
        </div>
      ))}
      <div className="card">
        <h3>Iniciar un cierre</h3>
        {TIPOS.map(t => <button key={t} className="btn o bloque" style={{ marginBottom: 8 }} disabled={ocupado} onClick={() => iniciar(t)} data-testid={`iniciar-${t}`}>{NOMBRE_TIPO_CIERRE[t]}</button>)}
      </div>
    </div>
  )
}

function Recorrido({ ctx, cierreId, onSalir }) {
  const [c, setC] = useState(null)
  const [idx, setIdx] = useState(0)
  const [resultado, setResultado] = useState(null)

  const recargar = useCallback(async (primera = false) => {
    const x = await leerCierre(cierreId)
    setC(x)
    if (primera && x) { const r = recorridoLocal(x); const p = siguientePendiente(r.puntos); setIdx(p === -1 ? r.puntos.length : p) }
    return x
  }, [cierreId])
  useEffect(() => { recargar(true) }, [recargar])
  useEffect(() => { const t = setInterval(() => recargar(false), 4000); return () => clearInterval(t) }, [recargar])   // recoge el folio y lo retomado cuando la cola envía

  const rec = useMemo(() => (c ? recorridoLocal(c) : null), [c])
  if (!c || !rec) return <div className="card">Cargando…</div>
  const { puntos } = rec
  const prog = progresoRecorrido(puntos)
  const enResumen = idx >= puntos.length
  if (resultado) return <Resultado c={c} onSalir={onSalir} />

  return (
    <div>
      <div className="fila sp" style={{ marginBottom: 6 }}>
        <b>{NOMBRE_TIPO_CIERRE[c.tipo]}{c.folio ? ` · ${c.folio}` : ''}</b>
        <button className="btn o sm" onClick={onSalir}>Salir (se guarda)</button>
      </div>
      <div className="barra" role="progressbar" aria-valuenow={prog.porcentaje} aria-valuemin={0} aria-valuemax={100} data-testid="barra-avance"><i style={{ width: `${prog.porcentaje}%` }} /></div>
      <div className="hint" style={{ margin: '4px 0 10px' }} data-testid="avance-texto">{enResumen ? 'Revisión final' : `Punto ${idx + 1} de ${puntos.length}`} · {prog.hechos} de {prog.total} listos</div>
      {enResumen
        ? <Resumen ctx={ctx} c={c} rec={rec} prog={prog} onIr={setIdx} onCerrado={async () => { await recargar(); setResultado(true) }} />
        : <Paso key={puntos[idx].punto_id} ctx={ctx} c={c} punto={puntos[idx]} recargar={recargar} onAnterior={idx > 0 ? () => setIdx(idx - 1) : null} onSiguiente={() => setIdx(idx + 1)} />}
    </div>
  )
}

function Paso({ ctx, c, punto, recargar, onAnterior, onSiguiente }) {
  const [valor, setValor] = useState(punto.captura?.valor != null && punto.tipo_captura !== 'denominaciones' ? String(Number(punto.captura.valor)) : '')
  const [cant, setCant] = useState(() => Object.fromEntries((punto.captura?.denominaciones ?? []).map(d => [Number(d.denominacion), Number(d.cantidad)])))
  const [error, setError] = useState(null)
  const [camara, setCamara] = useState(null)   // { tomaId, nombre }
  const esDen = punto.tipo_captura === 'denominaciones'
  const desglose = useMemo(() => DENOMINACIONES.map(d => ({ denominacion: d, cantidad: Number(cant[d] || 0) })), [cant])
  const total = totalDenominaciones(desglose)

  /** Guarda el punto en el teléfono y lo encola. No repite si no cambió nada (volver atrás no duplica capturas). */
  async function guardar() {
    const entrada = esDen ? { denominaciones: desglose } : punto.requiere_valor ? { valor: valor === '' ? null : Number(valor) } : {}
    const v = validarCapturaPunto(punto.tipo_captura, entrada)
    if (!v.ok) { setError(v.error); return false }
    const act = await leerCierre(c.id)
    const previa = act.capturas[punto.punto_id]
    const igual = previa && (esDen ? JSON.stringify(previa.denominaciones?.map(d => [Number(d.denominacion), Number(d.cantidad)])) === JSON.stringify(desglose.map(d => [d.denominacion, d.cantidad])) : Number(previa.valor) === entrada.valor)
    if (punto.tipo_captura !== 'solo_foto' && !igual) {
      const id = nuevoId()
      await guardarCierre(aplicarCaptura(act, punto.punto_id, { id, valor: entrada.valor ?? null, denominaciones: entrada.denominaciones ?? null }))
      await cola.encolar('cierre_capturar', { cierreId: c.id, puntoId: punto.punto_id, valor: entrada.valor ?? null, denominaciones: entrada.denominaciones ?? null }, { id, usuario: ctx.usuario.id })
      sincronizarAhora({ usuario: ctx.usuario.id })
    }
    await recargar(); setError(null)
    return true
  }
  async function guardarYSeguir() { if (punto.tipo_captura !== 'solo_foto') { if (!(await guardar())) return } onSiguiente() }

  async function subirFoto({ blob, ancho, alto, hash }) {
    if (punto.requiere_valor || esDen) { if (!(await guardar())) throw new Error('Captura primero el valor') }   // el valor va antes que su foto
    const id = nuevoId()
    const foto = await blobABytes(blob)
    const act = await leerCierre(c.id)
    await guardarCierre(aplicarFoto(act, punto.punto_id, camara.tomaId))
    await cola.encolar('cierre_foto', { cierreId: c.id, puntoId: punto.punto_id, tomaId: camara.tomaId ?? null, foto, hash, ancho, alto, organizacionId: c.organizacionId, sucursalId: c.sucursalId }, { id, usuario: ctx.usuario.id })
    sincronizarAhora({ usuario: ctx.usuario.id })
    await recargar()
  }

  return (
    <div className="card">
      <h2 data-testid="punto-nombre">{punto.nombre}{!punto.obligatorio && <span className="hint"> (opcional)</span>}</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        {esDen ? 'Cuenta billete por billete y moneda por moneda. No hay campo de total: se suma solo.' : punto.requiere_valor ? 'Escribe el valor que ves, sin calcular nada.' : 'Esta evidencia queda en el expediente del cierre.'}
      </div>
      {esDen && (
        <div>
          {DENOMINACIONES.map(d => (
            <div key={d} className="den">
              <b style={{ fontSize: 17 }}>{moneda(d)}</b>
              <div className="fila" style={{ gap: 4 }}>
                <button type="button" className="btn o mm" aria-label={`Quitar ${d}`} onClick={() => setCant({ ...cant, [d]: Math.max(0, Number(cant[d] || 0) - 1) })}>−</button>
                <input inputMode="numeric" pattern="[0-9]*" aria-label={`Cantidad de ${d}`} data-testid={`den-${d}`} value={cant[d] ?? ''} placeholder="0" onChange={e => setCant({ ...cant, [d]: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                <button type="button" className="btn o mm" aria-label={`Agregar ${d}`} onClick={() => setCant({ ...cant, [d]: Number(cant[d] || 0) + 1 })}>+</button>
              </div>
              <span className="hint" style={{ textAlign: 'right' }}>{moneda(d * Number(cant[d] || 0))}</span>
            </div>
          ))}
          <div className="fila sp" style={{ borderTop: '2px solid var(--bd)', paddingTop: 8, marginTop: 8, fontSize: 18 }}><b>Total contado</b><b data-testid="total-contado">{moneda(total)}</b></div>
        </div>
      )}
      {!esDen && punto.requiere_valor && (
        <input autoFocus inputMode="decimal" aria-label="Valor" data-testid="campo-valor" className="num-grande" value={valor} placeholder="0"
          onChange={e => setValor(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 12))} />
      )}
      {punto.requiere_foto && (
        <div style={{ marginTop: 14 }}>
          {punto.tomas
            ? punto.tomas.map(t => (
              <div key={t.id} className="fila" style={{ marginBottom: 8 }}>
                <span>{t.foto ? '✅' : '⚪'}</span><div style={{ flex: 1 }}>{t.nombre}</div>
                <button type="button" className={t.foto ? 'btn o sm' : 'btn sm'} onClick={() => setCamara({ tomaId: t.id, nombre: t.nombre })} data-testid="foto-toma">{t.foto ? 'Repetir' : 'Tomar foto'}</button>
              </div>))
            : (
              <div className="fila">
                <span>{punto.fotos > 0 ? '✅' : '⚪'}</span><div style={{ flex: 1 }} data-testid="foto-estado">{punto.fotos > 0 ? `${punto.fotos} foto(s) guardada(s)` : 'Falta la foto'}</div>
                <button type="button" className={punto.fotos ? 'btn o sm' : 'btn sm'} disabled={punto.requiere_valor && valor === '' && !punto.captura} onClick={() => setCamara({ tomaId: null, nombre: punto.nombre })} data-testid="foto-punto">Tomar foto</button>
              </div>)}
          <div className="hint" style={{ marginTop: 6 }}>La foto se toma en vivo con la cámara; no se puede subir de la galería. La hora la pone el servidor.</div>
        </div>
      )}
      {error && <div className="aviso rojo" role="alert" style={{ marginTop: 10 }}>{error}</div>}
      <div className="fila" style={{ marginTop: 18 }}>
        {onAnterior && <button type="button" className="btn o" onClick={onAnterior}>← Atrás</button>}
        <button type="button" className="btn" style={{ flex: 1 }} onClick={guardarYSeguir} data-testid="guardar-seguir">Guardar y seguir →</button>
      </div>
      {camara && <CamaraVivo titulo={camara.nombre} ladoLargo={c.ladoLargo} onFoto={subirFoto} onCerrar={() => setCamara(null)} />}
    </div>
  )
}

function Resumen({ ctx, c, rec, prog, onIr, onCerrado }) {
  const esTurno = c.tipo === 'turno'
  const [conEntrega, setConEntrega] = useState(true)
  const [confirmo, setConfirmo] = useState(false)
  const [montoTxt, setMontoTxt] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const pDen = rec.puntos.find(p => p.tipo_captura === 'denominaciones' && p.captura)
  const montoDesglose = pDen ? totalDenominaciones(pDen.captura.denominaciones) : null
  const monto = montoDesglose ?? (montoTxt === '' ? null : Number(montoTxt))
  const entrega = esTurno && conEntrega

  async function cerrar() {
    setOcupado(true)
    const act = await leerCierre(c.id)
    await guardarCierre(marcarEstado(act, 'cerrado_local'))
    await cola.encolar('cierre_cerrar', { cierreId: c.id, conEntrega: esTurno ? conEntrega : false, montoConfirmado: entrega ? monto : null }, { id: nuevoId(), usuario: ctx.usuario.id })
    sincronizarAhora({ forzar: true, usuario: ctx.usuario.id })
    setOcupado(false); onCerrado()
  }
  return (
    <div className="card">
      <h2>Revisa y cierra</h2>
      {rec.puntos.map((p, i) => (
        <button key={p.punto_id} type="button" onClick={() => onIr(i)} className="fila" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--bd)', padding: '12px 2px', textAlign: 'left', fontSize: 15, color: 'var(--tx)', minHeight: 48 }}>
          <span>{p.completo ? '✅' : p.obligatorio ? '⚠️' : '⚪'}</span>
          <span style={{ flex: 1 }}>{p.nombre}{!p.obligatorio && ' (opcional)'}</span>
          <span className="hint">{p.completo ? 'Listo' : p.falta}</span>
        </button>
      ))}
      {!prog.puedeCerrar && <div className="aviso rojo" role="alert" style={{ marginTop: 10 }}>No se puede cerrar: faltan puntos obligatorios ({prog.faltan.join(', ')}).</div>}
      {esTurno && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--bd)', borderRadius: 10 }}>
          <label className="fila" style={{ fontWeight: 400, margin: 0 }}><input type="checkbox" style={{ width: 26, minHeight: 26 }} checked={conEntrega} onChange={e => { setConEntrega(e.target.checked); setConfirmo(false) }} /> Entrego el efectivo al turno siguiente (doble firma)</label>
          {conEntrega && (
            <div style={{ marginTop: 10 }}>
              {montoDesglose != null
                ? <div style={{ fontSize: 18 }}>Efectivo que entrego: <b>{moneda(montoDesglose)}</b> <span className="hint">(la suma de tu desglose)</span></div>
                : <input inputMode="decimal" aria-label="Efectivo que entrego" placeholder="Efectivo que entrego" value={montoTxt} onChange={e => setMontoTxt(e.target.value.replace(/[^0-9.]/g, ''))} />}
              <label className="fila" style={{ fontWeight: 400 }}><input type="checkbox" style={{ width: 26, minHeight: 26 }} data-testid="confirmo-entrega" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} /> Confirmo con mi usuario que entrego {monto != null ? moneda(monto) : 'este monto'}</label>
              <div className="hint">Quien reciba contará, firmará con su PIN y ese monto será el fondo inicial de su turno (en «Pendientes»). Hasta entonces el cierre queda «entrega no aceptada».</div>
            </div>
          )}
        </div>
      )}
      <button type="button" className="btn ok bloque" style={{ marginTop: 14 }} data-testid="cerrar-cierre" disabled={ocupado || !prog.puedeCerrar || (entrega && (!confirmo || monto == null))} onClick={cerrar}>{ocupado ? 'Cerrando…' : 'Cerrar el cierre'}</button>
    </div>
  )
}

function Resultado({ c, onSalir }) {
  return (
    <div className="card" style={{ textAlign: 'center' }} data-testid="cierre-guardado">
      <div style={{ fontSize: 44 }}>✅</div>
      <h2>Cierre guardado{c.folio ? ` · ${c.folio}` : ''}</h2>
      <p>{navigator.onLine === false ? 'Sin señal: quedó guardado en el teléfono y se enviará solo al volver la conexión. No borres los datos del navegador.' : 'Se está enviando. Si ves capturas pendientes, mantén la app abierta un momento.'}</p>
      <p className="hint">El servidor calcula los cuadres; el dueño y el supervisor los revisan. Tú no necesitas hacer nada más.</p>
      <button className="btn bloque" onClick={onSalir}>Listo</button>
    </div>
  )
}
