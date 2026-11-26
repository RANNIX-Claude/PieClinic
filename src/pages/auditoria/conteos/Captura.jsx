// Captura de partidas de una sesión de conteo — pensada para celular (botones grandes, escáner Bluetooth como teclado + cámara con html5-qrcode,
// hoja de captura, sonidos). CAPTURA A CIEGAS: esta pantalla NUNCA pinta saldo ni diferencia. El servidor responde solo «ok» y el siguiente
// producto; la única excepción es la auditoría puntual ejecutada por supervisor o dueño, que recibe la diferencia al instante (F2.1).
// La PWA independiente es la Etapa 5: aquí basta que la captura funcione en la app responsiva.
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, CameraOff, Minus, Plus, ScanLine, CheckCircle2, X, Clock, ArrowLeft, Flag } from 'lucide-react'
import { leer } from '../../../lib/api'
import { mensajeError } from '../../../lib/auditoria/roles'
import { abrirSesion, capturarPartida, cerrarSesion, cancelarSesion } from '../../../lib/auditoria/conteoApi'
import { respuestaDeCaptura, validarEntrada, enviarConReintento, nuevoIdCaptura } from '../../../lib/auditoria/conteoCaptura'
import { NOMBRE_MODO, recibeDiferenciaAlInstante } from '../../../lib/auditoria/conteoModos'
import { NOMBRE_CLASE_PRECIO } from '../../../lib/auditoria/conteoPrecio'
import { formatoDuracion, porcentajeAvance } from '../../../lib/auditoria/remotaAvance'
import { moneda } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { sonido, vibrar } from '../../plataforma/inventario/conteoSonido'
import CamaraEscaner from './CamaraEscaner'
import ResultadoRelevo from './ResultadoRelevo'

/** Reconoce la pieza por su código SIN precio, costo ni existencia (vista ctl_producto_captura). */
async function buscarProducto(codigo) {
  for (const col of ['codigo_barras', 'sku']) {
    const r = await leer('ctl_producto_captura', { sedeCol: false, filtros: { [col]: codigo }, limite: 1 })
    if (r.data?.[0]) return r.data[0]
  }
  return null
}

const num = v => (v === '' || v == null ? NaN : Number(v))

export default function Captura({ sesionId, rolAud, onSalir }) {
  const campo = useRef(null)
  const { confirmar, dialogo } = useConfirmacion()
  const [info, setInfo] = useState(null)            // { folio, tipo, modo_lista, limite_en, pide_precio, avance, siguiente }
  const [fallo, setFallo] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [camara, setCamara] = useState(false)
  const [hoja, setHoja] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cierre, setCierre] = useState(null)
  const [restante, setRestante] = useState(null)

  const cargar = useCallback(async () => {
    const r = await abrirSesion(sesionId)
    if (r.error) { setFallo(mensajeError(r.error)); return }
    if (!r.data?.ok) { setFallo(r.data?.mensaje ?? 'La sesión ya no está abierta.'); return }
    setInfo(r.data); setFallo(null)
  }, [sesionId])
  useEffect(() => { cargar() }, [cargar])

  const esAuditor = !!info && recibeDiferenciaAlInstante(rolAud, info.tipo)

  // cuenta regresiva de la auditoría remota (el servidor es quien expira la sesión; esto solo avisa)
  useEffect(() => {
    if (!info?.limite_en) { setRestante(null); return }
    const t = setInterval(() => setRestante(Math.max(0, Math.round((new Date(info.limite_en).getTime() - Date.now()) / 1000))), 1000)
    return () => clearInterval(t)
  }, [info?.limite_en])

  const enfocar = useCallback(() => { if (campo.current && !hoja && window.matchMedia?.('(min-width: 700px)').matches) campo.current.focus({ preventScroll: true }) }, [hoja])
  useEffect(() => { enfocar() }, [enfocar, info, hoja, cierre])

  const abrirHoja = async (texto, metodo = 'escaner') => {
    const c = String(texto ?? '').trim()
    if (!c || hoja || !info) return
    const producto = await buscarProducto(c)
    if (!producto) { sonido('error'); vibrar('error'); toast.error('Ese código no corresponde a ningún producto del catálogo.'); return }
    sonido('ok'); vibrar('ok')
    setHoja({ codigo: c, producto, metodo, cantidad: '1', precio: '', serie: '', sello: '', intacto: null, nota: '', idCaptura: nuevoIdCaptura(), revision: null })
  }
  const enviarCodigo = e => { e.preventDefault(); const c = codigo; setCodigo(''); abrirHoja(c) }
  const cerrarHoja = () => { setHoja(null); setTimeout(enfocar, 80) }

  const guardar = async (extra = {}) => {
    const h = hoja
    const v = validarEntrada({ cantidad: h.cantidad, precioEtiqueta: h.precio, pidePrecio: info.pide_precio, producto: h.producto, serie: h.serie, sello: h.sello, selloIntacto: h.intacto })
    if (!v.ok) return toast.error(v.error)
    setGuardando(true)
    try {
      const id = extra.nuevoId ? nuevoIdCaptura() : h.idCaptura
      const r = await enviarConReintento(idx => capturarPartida({
        id: idx, sesionId, codigo: h.codigo, cantidad: num(h.cantidad), precioEtiqueta: h.precio === '' ? null : num(h.precio),
        serie: h.serie || null, sello: h.sello || null, selloIntacto: h.producto?.requiere_sello ? h.intacto : null, nota: h.nota || null, clasificacion: extra.clasificacion ?? null,
      }), { id })
      if (r.error) { sonido('error'); toast.error(mensajeError(r.error)); return }
      const resp = respuestaDeCaptura(r.data, { esAuditorPuntual: esAuditor })
      if (!resp.ok) {
        sonido('error'); toast.error(resp.mensaje ?? 'No se pudo guardar la captura.')
        if (['expirada', 'cerrada', 'cancelada'].includes(resp.error)) { setHoja(null); cargar() }
        return
      }
      sonido('ok'); vibrar('ok')
      setInfo(i => ({ ...i, avance: resp.avance ?? i.avance, siguiente: resp.siguiente }))
      if (resp.revision) setHoja(x => ({ ...x, revision: resp.revision, idCaptura: id }))   // solo el auditor de una puntual
      else setHoja(null)
    } finally { setGuardando(false) }
  }

  const terminar = async () => {
    const pend = info.avance ? Math.max(0, info.avance.en_lista - info.avance.capturadas) : 0
    const ok = await confirmar({
      titulo: 'Cerrar la sesión',
      mensaje: pend > 0 ? `Quedan ${pend} producto(s) de la lista sin reportar: se registrarán como «no reportados». ¿Cerrar de todos modos?` : '¿Cerrar la sesión? Ya no se podrán agregar capturas.',
      textoConfirmar: 'Cerrar sesión',
    })
    if (!ok) return
    const r = await cerrarSesion(sesionId)
    if (r.error) return toast.error(mensajeError(r.error))
    setCierre(r.data)
  }
  const cancelar = async () => {
    const hayCaptura = (info.avance?.capturadas ?? 0) > 0
    const motivo = hayCaptura ? window.prompt('Ya hay productos capturados: solo un supervisor o el dueño puede cancelar, con motivo. Motivo:') : null
    if (hayCaptura && !motivo) return
    if (!hayCaptura && !(await confirmar({ titulo: 'Cancelar la sesión', mensaje: 'Aún no has capturado nada. ¿Cancelar la sesión?', textoConfirmar: 'Cancelar sesión', peligro: true }))) return
    const r = await cancelarSesion(sesionId, motivo)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success('Sesión cancelada'); onSalir()
  }

  // ───────── estados de pantalla ─────────
  if (fallo) return (
    <div className="pagina"><PageHeader titulo="Conteo" />
      <EmptyState title="No se puede capturar" description={fallo} />
      <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn o" onClick={onSalir}>Volver a Conteos</button></div>
    </div>
  )
  if (!info) return <LoadingSpinner />
  if (cierre) return <ResultadoCierre cierre={cierre} info={info} onSalir={onSalir} />

  const av = info.avance ?? { capturadas: 0, en_lista: 0 }
  const pct = porcentajeAvance(av.capturadas, av.en_lista)
  const sig = info.siguiente
  const vencida = restante === 0

  return (
    <div className="pagina" style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader titulo={NOMBRE_MODO[info.tipo] ?? 'Conteo'} subtitulo={`${info.folio} · captura a ciegas: no verás lo que el sistema espera`}
        acciones={<button className="btn o sm" onClick={onSalir}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Volver</button>} />

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <b>{av.en_lista > 0 ? `${av.capturadas} de ${av.en_lista} productos` : `${av.capturadas} productos capturados`}</b>
          {restante != null && <span className={`bd ${restante < 300 ? 'r' : 'a'}`}><Clock size={12} style={{ verticalAlign: -2 }} /> {vencida ? 'Tiempo vencido' : formatoDuracion(restante)}</span>}
        </div>
        {av.en_lista > 0 && <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--ok, #2e8b57)' }} /></div>}
      </div>

      {vencida && <div className="card" style={{ borderColor: 'var(--danger, #c0392b)', marginBottom: 10 }}>El tiempo límite venció: la sesión se cierra con lo capturado y lo que falte queda como «no reportado».
        <div style={{ marginTop: 8 }}><button className="btn" onClick={terminar}>Terminar</button></div></div>}

      {sig && (
        <button type="button" className="card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 10 }} onClick={() => abrirHoja(sig.codigo_barras || sig.sku, 'lista')} disabled={!!hoja || vencida}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Siguiente en la lista</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{sig.descripcion}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{[sig.marca, sig.presentacion, sig.codigo_barras || sig.sku].filter(Boolean).join(' · ')}</div>
        </button>
      )}

      <div className="card">
        <form onSubmit={enviarCodigo} style={{ display: 'flex', gap: 8 }}>
          <input ref={campo} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Escanea o escribe el código" inputMode="text" autoComplete="off" disabled={vencida}
            style={{ flex: 1, fontSize: 18, minHeight: 48 }} data-testid="campo-codigo" />
          <button className="btn" type="submit" style={{ minHeight: 48 }} disabled={vencida}><ScanLine size={18} /></button>
        </form>
        <button className={`btn ${camara ? 'red' : ''}`} style={{ width: '100%', minHeight: 56, fontSize: 18, fontWeight: 800, marginTop: 10 }} onClick={() => setCamara(v => !v)} disabled={vencida}>
          {camara ? <><CameraOff size={20} style={{ verticalAlign: -4 }} /> Apagar cámara</> : <><Camera size={20} style={{ verticalAlign: -4 }} /> Escanear con la cámara</>}
        </button>
        {camara && !hoja && <CamaraEscaner onCodigo={c => abrirHoja(c, 'camara')} onError={m => { toast.error(m); setCamara(false) }} />}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" style={{ flex: 2, minHeight: 52, fontWeight: 700 }} onClick={terminar}><Flag size={16} style={{ verticalAlign: -3 }} /> Cerrar sesión</button>
        <button className="btn o" style={{ flex: 1, minHeight: 52 }} onClick={cancelar}>Cancelar</button>
      </div>

      {hoja && <HojaCaptura hoja={hoja} setHoja={setHoja} info={info} guardando={guardando} guardar={guardar} cerrar={cerrarHoja} />}
      {dialogo}
    </div>
  )
}

/** Hoja de captura a pantalla completa: producto, cantidad con − / +, y lo que el punto pida (precio de etiqueta, serie, sello). */
function HojaCaptura({ hoja, setHoja, info, guardando, guardar, cerrar }) {
  const p = hoja.producto
  const cant = num(hoja.cantidad)
  const cambiar = d => setHoja(h => ({ ...h, cantidad: String(Math.max(0, (Number.isFinite(num(h.cantidad)) ? num(h.cantidad) : 0) + d)) }))
  const r = hoja.revision
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'var(--card, #fff)', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{p.descripcion}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{hoja.codigo}</div>
        </div>
        <button className="btn o sm" onClick={cerrar} aria-label="Cerrar"><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {!r && <>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>¿Cuántas piezas hay?</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
            <button className="btn o" style={{ minWidth: 72, minHeight: 72 }} onClick={() => cambiar(-1)} aria-label="Menos"><Minus size={28} /></button>
            <input value={hoja.cantidad} onChange={e => setHoja(h => ({ ...h, cantidad: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" aria-label="Piezas"
              style={{ width: 130, textAlign: 'center', fontSize: 40, fontWeight: 800, minHeight: 72 }} data-testid="campo-cantidad" />
            <button className="btn o" style={{ minWidth: 72, minHeight: 72 }} onClick={() => cambiar(1)} aria-label="Más"><Plus size={28} /></button>
          </div>
          {info.pide_precio && (
            <div className="field" style={{ marginTop: 16 }}><label className="req">Precio de la etiqueta</label>
              <input value={hoja.precio} onChange={e => setHoja(h => ({ ...h, precio: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="Lo que dice la etiqueta" style={{ fontSize: 20, minHeight: 48 }} /></div>
          )}
          {p.requiere_serie && (
            <div className="field" style={{ marginTop: 12 }}><label className="req">Número de serie</label>
              <input value={hoja.serie} onChange={e => setHoja(h => ({ ...h, serie: e.target.value }))} style={{ minHeight: 48 }} /></div>
          )}
          {p.requiere_sello && (
            <div style={{ marginTop: 12 }}>
              <div className="field"><label className="req">Folio del sello</label><input value={hoja.sello} onChange={e => setHoja(h => ({ ...h, sello: e.target.value }))} style={{ minHeight: 48 }} /></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className={`btn ${hoja.intacto === true ? '' : 'o'}`} style={{ flex: 1, minHeight: 48 }} onClick={() => setHoja(h => ({ ...h, intacto: true }))}>Sello intacto</button>
                <button className={`btn ${hoja.intacto === false ? 'red' : 'o'}`} style={{ flex: 1, minHeight: 48 }} onClick={() => setHoja(h => ({ ...h, intacto: false }))}>Sello roto</button>
              </div>
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}><label>Nota (opcional)</label>
            <input value={hoja.nota} maxLength={500} onChange={e => setHoja(h => ({ ...h, nota: e.target.value }))} /></div>
        </>}
        {r && <RevisionAuditor revision={r} hoja={hoja} guardando={guardando} clasificar={c => guardar({ clasificacion: c, nuevoId: true })} />}
      </div>
      <div style={{ padding: '12px 14px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border)' }}>
        {!r ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn o" style={{ flex: 1, minHeight: 60, fontSize: 18, fontWeight: 700 }} disabled={guardando} onClick={cerrar}>Cancelar</button>
            <button className="btn" style={{ flex: 2, minHeight: 60, fontSize: 20, fontWeight: 800 }} disabled={guardando || !Number.isFinite(cant)} onClick={() => guardar()} data-testid="guardar-partida">
              {guardando ? 'Guardando…' : `Guardar · ${Number.isFinite(cant) ? cant : 0} pzas`}</button>
          </div>
        ) : <button className="btn" style={{ width: '100%', minHeight: 60, fontSize: 20, fontWeight: 800 }} onClick={cerrar}><CheckCircle2 size={20} style={{ verticalAlign: -4 }} /> Siguiente producto</button>}
      </div>
    </div>
  )
}

/** SOLO el auditor de una auditoría puntual (supervisor o dueño) ve esto: quien la ve no es quien responde por el faltante (F2.1). */
function RevisionAuditor({ revision, hoja, guardando, clasificar }) {
  const dif = Number(revision.diferencia_piezas)
  const hayPrecio = hoja.precio !== '' && revision.clasificacion_precio && revision.clasificacion_precio !== 'coincide'
  return (
    <div>
      <div className="card" style={{ borderColor: dif === 0 ? 'var(--ok, #2e8b57)' : 'var(--danger, #c0392b)' }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Resultado (solo lo ves tú como auditor)</div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{dif === 0 ? 'Cuadra' : dif < 0 ? `Faltan ${Math.abs(dif)} pza(s)` : `Sobran ${dif} pza(s)`}</div>
        {dif !== 0 && <div>Valor al costo: <b>{moneda(revision.diferencia_valor)}</b></div>}
      </div>
      {hayPrecio && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>Precio de la etiqueta: {NOMBRE_CLASE_PRECIO[revision.clasificacion_precio] ?? revision.clasificacion_precio}</div>
          <div style={{ fontSize: 13 }}>Catálogo: {moneda(revision.precio_catalogo)} · etiqueta: {moneda(Number(hoja.precio))}. Clasifícalo aquí; solo «A revisar» abre caso.</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {['etiqueta_anterior', 'etiqueta_mal_puesta', 'revisar'].map(c => (
              <button key={c} className={`btn sm ${revision.clasificacion_precio === c ? '' : 'o'}`} disabled={guardando} onClick={() => clasificar(c)}>{NOMBRE_CLASE_PRECIO[c]}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Cierre: la sucursal solo ve cuántas partidas; dueño y supervisor ven además las cifras; el relevo muestra la diferencia a ambos (excepción F2.4). */
function ResultadoCierre({ cierre, info, onSalir }) {
  const verCifras = cierre.partidas_con_diferencia != null
  return (
    <div className="pagina" style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader titulo={NOMBRE_MODO[info.tipo] ?? 'Conteo'} subtitulo={`${cierre.folio ?? info.folio} · ${cierre.estado === 'expirada' ? 'venció el tiempo límite' : 'sesión cerrada'}`} />
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}><CheckCircle2 size={22} style={{ verticalAlign: -4, color: 'var(--ok, #2e8b57)' }} /> {cierre.total_partidas ?? 0} partida(s) capturadas</div>
        {cierre.no_reportadas > 0 && <div style={{ marginTop: 6 }}>{cierre.no_reportadas} producto(s) de la lista quedaron sin reportar.</div>}
        {!verCifras && info.tipo !== 'relevo_turno' && <div className="hint" style={{ marginTop: 8 }}>Gracias. El resultado lo revisa la administración; el conteo se hace a ciegas y aquí no se muestra lo que el sistema esperaba.</div>}
        {verCifras && (
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
            {cierre.partidas_con_diferencia} con diferencia · valor neto {moneda(cierre.valor_diferencia)} · {cierre.casos_abiertos} caso(s) abierto(s)
            {cierre.sustituciones > 0 && <div><b>{cierre.sustituciones}</b> posible(s) sustitución de código</div>}
            {cierre.con_cancelacion > 0 && <div><b>{cierre.con_cancelacion}</b> faltante(s) con cancelación reciente</div>}
          </div>
        )}
      </div>
      {cierre.relevo && <ResultadoRelevo relevo={cierre.relevo} />}
      <button className="btn" style={{ width: '100%', minHeight: 52, marginTop: 12 }} onClick={onSalir}>Volver a Conteos</button>
    </div>
  )
}
