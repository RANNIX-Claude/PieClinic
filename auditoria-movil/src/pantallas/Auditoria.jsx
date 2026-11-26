// AUDITORÍA (F2 / F6.3): escaneo para conteos (apertura, relevo, puntual y remota) con el motor de la Etapa 2.
// Entrada de código: lector Bluetooth (llega como teclado: el campo acepta teclado + Enter) o cámara (BarcodeDetector del navegador, o html5-qrcode de respaldo).
// CAPTURA A CIEGAS: nunca se pinta saldo ni diferencia; la única excepción es la auditoría puntual de un supervisor o del dueño (F2.1).
// El conteo necesita señal para reconocer el producto; si la red se cae AL GUARDAR, la partida queda en la cola con su mismo id y se envía sola (no duplica).
import { useCallback, useEffect, useRef, useState } from 'react'
import { leer } from '../../../src/lib/api'
import { abrirSesion, capturarPartida, cerrarSesion, iniciarSesion, listarSesiones } from '../../../src/lib/auditoria/conteoApi'
import { respuestaDeCaptura, validarEntrada, nuevoIdCaptura } from '../../../src/lib/auditoria/conteoCaptura.js'
import { NOMBRE_MODO, modosQuePuedeIniciar, recibeDiferenciaAlInstante, MODOS_CONTEO } from '../../../src/lib/auditoria/conteoModos.js'
import { NOMBRE_CLASE_PRECIO } from '../../../src/lib/auditoria/conteoPrecio.js'
import { esErrorDeRed } from '../../../src/lib/auditoria/pwaCola.js'
import { formatoDuracion, porcentajeAvance } from '../../../src/lib/auditoria/remotaAvance.js'
import { mensajeError } from '../../../src/lib/auditoria/roles'
import { sonido, vibrar } from '../../../src/pages/plataforma/inventario/conteoSonido'
import CamaraEscaner from '../../../src/pages/auditoria/conteos/CamaraEscaner'
import { cola, sincronizarAhora } from '../envio'

const esIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const num = v => (v === '' || v == null ? NaN : Number(v))

/** Reconoce la pieza por su código (barras o clave de proveedor alfanumérica) SIN precio, costo ni existencia. */
async function buscarProducto(codigo) {
  for (const col of ['codigo_barras', 'sku']) {
    const r = await leer('ctl_producto_captura', { sedeCol: false, filtros: { [col]: codigo }, limite: 1 })
    if (r.error && esErrorDeRed(r.error)) return { sinRed: true }
    if (r.data?.[0]) return { producto: r.data[0] }
  }
  return { producto: null }
}

export default function Auditoria({ ctx, sesionInicial = null, onSalirInicial }) {
  const [sesionId, setSesionId] = useState(sesionInicial)
  if (sesionId) return <Captura ctx={ctx} sesionId={sesionId} onSalir={() => { setSesionId(null); onSalirInicial?.() }} />
  return <Inicio ctx={ctx} onAbrir={setSesionId} />
}

function Inicio({ ctx, onAbrir }) {
  const rolAud = ctx.usuario.rolAud
  const modos = modosQuePuedeIniciar(rolAud).filter(m => m !== 'conteo_inicial')
  const [abiertas, setAbiertas] = useState([])
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { listarSesiones(30).then(r => setAbiertas((r.data ?? []).filter(s => s.estado === 'abierta' && s.sucursal_id === ctx.sucursal.id))) }, [ctx.sucursal.id])

  async function iniciar(modo) {
    setOcupado(true); setError(null)
    const r = await iniciarSesion(modo, ctx.sucursal.id, { pide_precio: false, ...(modo === 'auditoria_puntual' ? { modo_lista: 'aleatoria' } : {}) })
    setOcupado(false)
    if (r.error) return setError(/failed to fetch|network/i.test(r.error.message) ? 'Sin señal: para iniciar un conteo hace falta conexión.' : mensajeError(r.error))
    if (!r.data?.ok) { if (r.data?.propia && r.data.sesion_id) return onAbrir(r.data.sesion_id); return setError(r.data?.mensaje ?? 'No se pudo iniciar.') }
    onAbrir(r.data.sesion_id)
  }
  return (
    <div>
      <h2>Auditoría</h2>
      <p className="hint">Cuentas a ciegas: no verás lo que el sistema espera. Escanea con el lector Bluetooth (recomendado) o con la cámara.</p>
      {error && <div className="aviso rojo" role="alert">{error}</div>}
      {abiertas.map(s => (
        <div key={s.id} className="card" data-testid="sesion-abierta">
          <div className="fila sp"><b>{NOMBRE_MODO[s.tipo] ?? s.tipo}</b><span className="chip a">Abierta</span></div>
          <div className="hint">{s.folio}</div>
          <button className="btn bloque" style={{ marginTop: 8 }} onClick={() => onAbrir(s.id)}>Retomar</button>
        </div>
      ))}
      <div className="card">
        <h3>Iniciar un conteo</h3>
        {modos.length === 0 && <div className="hint">Tu rol no inicia conteos.</div>}
        {modos.map(m => (
          <div key={m} style={{ marginBottom: 10 }}>
            <button className="btn o bloque" disabled={ocupado} onClick={() => iniciar(m)} data-testid={`iniciar-${m}`}>{NOMBRE_MODO[m]}</button>
            <div className="hint">{MODOS_CONTEO[m].efecto}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Captura({ ctx, sesionId, onSalir }) {
  const campo = useRef(null)
  const [info, setInfo] = useState(null)
  const [fallo, setFallo] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [camara, setCamara] = useState(false)
  const [hoja, setHoja] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cierre, setCierre] = useState(null)
  const [restante, setRestante] = useState(null)
  const [msg, setMsg] = useState(null)
  const [reloj, setReloj] = useState(0)

  const cargar = useCallback(async () => {
    const r = await abrirSesion(sesionId)
    if (r.error) { setFallo(mensajeError(r.error)); return }
    if (!r.data?.ok) { setFallo(r.data?.mensaje ?? 'La sesión ya no está abierta.'); return }
    setInfo(r.data); setFallo(null)
  }, [sesionId])
  useEffect(() => { cargar() }, [cargar])
  const esAuditor = !!info && recibeDiferenciaAlInstante(ctx.usuario.rolAud, info.tipo)

  useEffect(() => {   // cuenta regresiva con la hora del servidor (no la del teléfono)
    if (!info?.limite_en) { setRestante(null); return }
    const t = setInterval(() => setRestante(Math.max(0, Math.round((new Date(info.limite_en).getTime() - (Date.now() + (ctx.ses.desfaseMs ?? 0))) / 1000))), 1000)
    return () => clearInterval(t)
  }, [info?.limite_en, ctx.ses.desfaseMs])
  useEffect(() => { if (!hoja && campo.current) campo.current.focus({ preventScroll: true }) }, [hoja, info, reloj])

  const abrirHoja = async (texto, metodo = 'escaner') => {
    const c = String(texto ?? '').trim()
    if (!c || hoja || !info) return
    const r = await buscarProducto(c)
    if (r.sinRed) { sonido('error'); setMsg('Sin señal: el conteo necesita conexión para reconocer el producto.'); return }
    if (!r.producto) { sonido('error'); vibrar('error'); setMsg('Ese código no corresponde a ningún producto del catálogo.'); return }
    sonido('ok'); vibrar('ok'); setMsg(null)
    setHoja({ codigo: c, producto: r.producto, metodo, cantidad: '1', precio: '', serie: '', sello: '', intacto: null, nota: '', id: nuevoIdCaptura(), revision: null })
  }
  const enviarCodigo = e => { e.preventDefault(); const c = codigo; setCodigo(''); abrirHoja(c, 'teclado') }

  const guardar = async (extra = {}) => {
    const h = hoja
    const v = validarEntrada({ cantidad: h.cantidad, precioEtiqueta: h.precio, pidePrecio: info.pide_precio, producto: h.producto, serie: h.serie, sello: h.sello, selloIntacto: h.intacto })
    if (!v.ok) return setMsg(v.error)
    setGuardando(true)
    const datos = { sesionId, codigo: h.codigo, cantidad: num(h.cantidad), precioEtiqueta: h.precio === '' ? null : num(h.precio), serie: h.serie || null, sello: h.sello || null,
      selloIntacto: h.producto?.requiere_sello ? h.intacto : null, nota: h.nota || null, clasificacion: extra.clasificacion ?? null }
    const id = extra.nuevoId ? nuevoIdCaptura() : h.id
    try {
      const r = await capturarPartida({ id, ...datos })
      if (r.error) {
        if (esErrorDeRed(r.error)) {   // se cayó la red al guardar: queda en la cola con el MISMO id
          await cola.encolar('partida', datos, { id, usuario: ctx.usuario.id }); sincronizarAhora({ usuario: ctx.usuario.id })
          setMsg('Sin señal: la partida quedó guardada en el teléfono y se enviará sola.'); setHoja(null); return
        }
        sonido('error'); return setMsg(mensajeError(r.error))
      }
      const resp = respuestaDeCaptura(r.data, { esAuditorPuntual: esAuditor })
      if (!resp.ok) { sonido('error'); setMsg(resp.mensaje ?? 'No se pudo guardar la captura.'); if (['expirada', 'cerrada', 'cancelada'].includes(resp.error)) { setHoja(null); cargar() } return }
      sonido('ok'); vibrar('ok'); setMsg(null)
      setInfo(i => ({ ...i, avance: resp.avance ? { capturadas: resp.avance.capturadas, en_lista: resp.avance.enLista } : i.avance, siguiente: resp.siguiente }))   // respuestaDeCaptura usa enLista; la pantalla lee en_lista
      if (resp.revision) setHoja(x => ({ ...x, revision: resp.revision, id })); else setHoja(null)
    } finally { setGuardando(false); setReloj(x => x + 1) }
  }

  const terminar = async () => {
    const pend = info.avance ? Math.max(0, info.avance.en_lista - info.avance.capturadas) : 0
    if (!window.confirm(pend > 0 ? `Quedan ${pend} producto(s) de la lista sin reportar: se registrarán como «no reportados». ¿Cerrar de todos modos?` : '¿Cerrar la sesión? Ya no se podrán agregar capturas.')) return
    const r = await cerrarSesion(sesionId)
    if (r.error) return setMsg(mensajeError(r.error))
    setCierre(r.data)
  }

  if (fallo) return <div><div className="aviso rojo" role="alert">{fallo}</div><button className="btn o bloque" onClick={onSalir}>Volver</button></div>
  if (!info) return <div className="card">Cargando…</div>
  if (cierre) return (
    <div className="card" style={{ textAlign: 'center' }} data-testid="conteo-cerrado">
      <div style={{ fontSize: 44 }}>✅</div><h2>{cierre.total_partidas ?? 0} partida(s) capturadas</h2>
      {cierre.no_reportadas > 0 && <p>{cierre.no_reportadas} producto(s) de la lista quedaron sin reportar.</p>}
      <p className="hint">Gracias. El resultado lo revisa la administración; el conteo es a ciegas y aquí no se muestra lo que el sistema esperaba.</p>
      <button className="btn bloque" onClick={onSalir}>Listo</button>
    </div>)

  const av = info.avance ?? { capturadas: 0, en_lista: 0 }
  const sig = info.siguiente
  const vencida = restante === 0
  return (
    <div>
      <div className="fila sp"><b>{NOMBRE_MODO[info.tipo] ?? 'Conteo'}</b><button className="btn o sm" onClick={onSalir}>Salir (se guarda)</button></div>
      <div className="hint">{info.folio}</div>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="fila sp">
          <b data-testid="avance-conteo">{av.en_lista > 0 ? `${av.capturadas} de ${av.en_lista} productos` : `${av.capturadas} productos capturados`}</b>
          {restante != null && <span className={`chip ${restante < 300 ? 'r' : 'a'} cuenta`}>{vencida ? 'Tiempo vencido' : formatoDuracion(restante)}</span>}
        </div>
        {av.en_lista > 0 && <div className="barra" style={{ marginTop: 8 }}><i style={{ width: `${porcentajeAvance(av.capturadas, av.en_lista)}%` }} /></div>}
      </div>
      {msg && <div className="aviso rojo" role="alert" data-testid="msg-conteo">{msg}</div>}
      {sig && <button type="button" className="card" style={{ width: '100%', textAlign: 'left', color: 'var(--tx)' }} data-testid="siguiente-lista" data-codigo={sig.codigo_barras || sig.sku} disabled={!!hoja || vencida} onClick={() => abrirHoja(sig.codigo_barras || sig.sku, 'lista')}>
        <div className="hint">Siguiente en la lista</div><div style={{ fontSize: 18, fontWeight: 700 }}>{sig.descripcion}</div>
        <div className="hint">{[sig.marca, sig.presentacion, sig.codigo_barras || sig.sku].filter(Boolean).join(' · ')}</div></button>}
      <div className="card">
        <form onSubmit={enviarCodigo} className="fila">
          <input ref={campo} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Escanea o escribe el código" autoComplete="off" autoCapitalize="off" disabled={vencida} data-testid="campo-codigo" />
          <button className="btn" type="submit" disabled={vencida} style={{ minWidth: 64 }}>OK</button>
        </form>
        <div className="hint" style={{ marginTop: 6 }}>Lector Bluetooth: apúntalo y dispara, el código entra solo. Acepta códigos de barras y claves de proveedor.</div>
        <button className={`btn bloque ${camara ? 'rojo' : 'o'}`} style={{ marginTop: 10 }} onClick={() => setCamara(v => !v)} disabled={vencida} data-testid="btn-camara-escaner">{camara ? 'Apagar cámara' : 'Escanear con la cámara'}</button>
        {esIOS() && <div className="aviso info" style={{ marginTop: 8 }} data-testid="aviso-iphone">En iPhone el escaneo por cámara es más lento (no hay lector nativo). Para el conteo diario se recomienda el lector Bluetooth.</div>}
        {camara && !hoja && <CamaraEscaner onCodigo={c => abrirHoja(c, 'camara')} onError={m => { setMsg(m); setCamara(false) }} />}
      </div>
      <div className="fila" style={{ marginTop: 6 }}><button className="btn bloque" style={{ flex: 2 }} onClick={terminar} data-testid="cerrar-sesion-conteo">Cerrar sesión</button></div>
      {hoja && <Hoja hoja={hoja} setHoja={setHoja} info={info} guardando={guardando} guardar={guardar} msg={msg} cerrar={() => { setHoja(null); setMsg(null) }} />}
    </div>
  )
}

function Hoja({ hoja, setHoja, info, guardando, guardar, cerrar, msg }) {
  const p = hoja.producto, cant = num(hoja.cantidad), r = hoja.revision
  const cambiar = d => setHoja(h => ({ ...h, cantidad: String(Math.max(0, (Number.isFinite(num(h.cantidad)) ? num(h.cantidad) : 0) + d)) }))
  return (
    <div className="modal" role="dialog" aria-modal="true" data-testid="hoja-captura">
      <div className="cuerpo">
        <h2>{p.descripcion}</h2><div className="hint">{hoja.codigo}</div>
        {msg && <div className="aviso rojo" role="alert" data-testid="msg-hoja">{msg}</div>}
        {!r && <>
          <label>¿Cuántas piezas hay?</label>
          <div className="fila" style={{ justifyContent: 'center' }}>
            <button className="btn o" style={{ minWidth: 72, minHeight: 72, fontSize: 30 }} onClick={() => cambiar(-1)} aria-label="Menos">−</button>
            <input value={hoja.cantidad} onChange={e => setHoja(h => ({ ...h, cantidad: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" aria-label="Piezas" className="num-grande" style={{ width: 130 }} data-testid="campo-cantidad" />
            <button className="btn o" style={{ minWidth: 72, minHeight: 72, fontSize: 30 }} onClick={() => cambiar(1)} aria-label="Más">+</button>
          </div>
          {info.pide_precio && <><label>Precio de la etiqueta</label><input value={hoja.precio} onChange={e => setHoja(h => ({ ...h, precio: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="Lo que dice la etiqueta" /></>}
          {p.requiere_serie && <><label>Número de serie</label><input value={hoja.serie} data-testid="campo-serie" onChange={e => setHoja(h => ({ ...h, serie: e.target.value }))} /></>}
          {p.requiere_sello && <>
            <label>Folio del sello</label><input value={hoja.sello} data-testid="campo-sello" onChange={e => setHoja(h => ({ ...h, sello: e.target.value }))} />
            <div className="fila" style={{ marginTop: 8 }}>
              <button data-testid="sello-intacto" className={`btn ${hoja.intacto === true ? '' : 'o'}`} style={{ flex: 1 }} onClick={() => setHoja(h => ({ ...h, intacto: true }))}>Sello intacto</button>
              <button className={`btn ${hoja.intacto === false ? 'rojo' : 'o'}`} style={{ flex: 1 }} onClick={() => setHoja(h => ({ ...h, intacto: false }))}>Sello roto</button>
            </div></>}
          <label>Nota (opcional)</label><input value={hoja.nota} maxLength={500} onChange={e => setHoja(h => ({ ...h, nota: e.target.value }))} />
        </>}
        {r && <Revision revision={r} hoja={hoja} guardando={guardando} clasificar={c => guardar({ clasificacion: c, nuevoId: true })} />}
      </div>
      <div className="pie">
        {!r ? <>
          <button className="btn o" disabled={guardando} onClick={cerrar}>Cancelar</button>
          <button className="btn" style={{ flex: 1 }} disabled={guardando || !Number.isFinite(cant)} onClick={() => guardar()} data-testid="guardar-partida">{guardando ? 'Guardando…' : `Guardar · ${Number.isFinite(cant) ? cant : 0} pzas`}</button></>
          : <button className="btn bloque" onClick={cerrar}>Siguiente producto</button>}
      </div>
    </div>
  )
}

/** SOLO el auditor de una puntual (supervisor o dueño) ve esto: quien la ve no es quien responde por el faltante (F2.1). */
function Revision({ revision, hoja, guardando, clasificar }) {
  const dif = Number(revision.diferencia_piezas)
  const hayPrecio = hoja.precio !== '' && revision.clasificacion_precio && revision.clasificacion_precio !== 'coincide'
  return (
    <div>
      <div className="card"><div className="hint">Resultado (solo lo ves tú como auditor)</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{dif === 0 ? 'Cuadra' : dif < 0 ? `Faltan ${Math.abs(dif)} pza(s)` : `Sobran ${dif} pza(s)`}</div></div>
      {hayPrecio && <div className="card"><b>Precio de la etiqueta: {NOMBRE_CLASE_PRECIO[revision.clasificacion_precio] ?? revision.clasificacion_precio}</b>
        <div className="fila" style={{ flexWrap: 'wrap', marginTop: 8 }}>{['etiqueta_anterior', 'etiqueta_mal_puesta', 'revisar'].map(c => <button key={c} className="btn o sm" disabled={guardando} onClick={() => clasificar(c)}>{NOMBRE_CLASE_PRECIO[c]}</button>)}</div></div>}
    </div>
  )
}
