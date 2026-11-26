// RECEPCIÓN CON RESPONSIVA (F5.1). Quien recibe, en el móvil: escanea cada pieza, verifica el contenido (sello intacto, o la abre y la vuelve a sellar),
// toma la foto EN VIVO de la pieza y confirma con su PIN. Desde ese momento la pieza queda bajo su responsabilidad con fecha, hora y usuario.
// Solo aplica a productos con «requiere sello» (en el piloto, lo caro y en caja; no las 2,000 claves).
//
// COMPONENTE REUTILIZABLE: la PWA de la Etapa 5 lo monta en su pantalla RECEPCIÓN:
//     import Recepcion from '.../auditoria/custodia/Recepcion'
//     <Recepcion sucursalId={sucursalDeLaSesion} onTerminar={() => volver()} />
// Props: sucursalId (si se omite, se elige entre las del usuario) · onTerminar() (se llama al cerrar el comprobante).
// NUNCA pide ni muestra existencia, precio, peso esperado ni diferencia: el servidor solo dice si el peso coincide.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import { ScanLine, Trash2, ShieldCheck, PackageCheck, AlertTriangle } from 'lucide-react'
import FormField from '../../../components/ui/FormField'
import EmptyState from '../../../components/ui/EmptyState'
import { fechaHora } from '../../../lib/formato'
import { nuevoId, productosEscaneables, registrarRecepcion, listarRecepciones, listarLineasRecepcion } from '../../../lib/auditoria/custodiaApi'
import { NOMBRE_VERIFICACION, fotosRepetidas, normalizarFolio, normalizarSerie, validarLineaRecepcion } from '../../../lib/auditoria/custodia'
import { listar } from '../../../lib/auditoria/api'
import CamaraEscaner from '../conteos/CamaraEscaner'
import { errMsg, useDatos, EstadoConsulta } from '../comun'
import { FotoEnVivo, SelectorSucursal, useSucursalInicial, grande } from './comunCustodia'

const VACIA = { producto: null, numero_serie: '', verificacion: 'sello_intacto', folio_sello: '', nuevo_folio_sello: '', peso_medido: '', evidencia_id: null }

export default function Recepcion({ sucursalId: sucursalProp = null, onTerminar = null }) {
  const [sucursal, setSucursal] = useSucursalInicial(sucursalProp)
  const [recepcionId, setRecepcionId] = useState(() => nuevoId())       // las fotos se registran con este id: un reenvío no duplica
  const [documento, setDocumento] = useState('')
  const [lineas, setLineas] = useState([])
  const [pieza, setPieza] = useState(VACIA)
  const [pieId, setPieId] = useState(() => nuevoId())
  const [codigo, setCodigo] = useState('')
  const [camara, setCamara] = useState(false)
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [comprobante, setComprobante] = useState(null)

  const productos = useQuery({ queryKey: ['ctl-prod-escaneables'], queryFn: async () => { const r = await productosEscaneables(); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })
  const conSello = useMemo(() => (productos.data ?? []).filter(p => p.requiere_sello), [productos.data])
  const porCodigo = useMemo(() => {
    const m = new Map()
    for (const p of productos.data ?? []) { if (p.codigo_barras) m.set(String(p.codigo_barras), p); if (p.sku) m.set(String(p.sku).toUpperCase(), p) }
    return m
  }, [productos.data])

  function escanear(texto) {
    const t = String(texto ?? '').trim()
    if (!t) return
    const p = porCodigo.get(t) ?? porCodigo.get(t.toUpperCase())
    if (!p) return toast.error('No se reconoce ese código en el catálogo.')
    if (!p.requiere_sello) return toast.error(`«${p.descripcion}» no lleva sello: la recepción con responsiva solo aplica a productos con sello.`, { duration: 7000 })
    setPieza({ ...VACIA, producto: p }); setPieId(nuevoId()); setCodigo(''); setCamara(false)
  }

  function agregar() {
    const linea = { ...pieza, producto_id: pieza.producto?.id, peso_medido: pieza.peso_medido === '' ? null : Number(pieza.peso_medido) }
    const v = validarLineaRecepcion(linea, pieza.producto)
    if (!v.ok) return toast.error(v.error)
    if (lineas.some(l => l.evidencia_id === linea.evidencia_id)) return toast.error('Cada pieza lleva su propia foto.')
    setLineas([...lineas, linea]); setPieza(VACIA); setPieId(nuevoId())
  }

  async function firmar() {
    if (!lineas.length) return toast.error('Agregue al menos una pieza.')
    if (fotosRepetidas(lineas)) return toast.error('Cada pieza lleva su propia foto.')
    setEnviando(true)
    const r = await registrarRecepcion({
      id: recepcionId, sucursalId: sucursal, documento: documento || null, pin,
      lineas: lineas.map(l => ({
        producto_id: l.producto_id, numero_serie: normalizarSerie(l.numero_serie), folio_sello: normalizarFolio(l.folio_sello), verificacion: l.verificacion,
        nuevo_folio_sello: normalizarFolio(l.nuevo_folio_sello), peso_medido: l.peso_medido, evidencia_id: l.evidencia_id,
      })),
    })
    setEnviando(false)
    if (r.error) return toast.error(errMsg(r.error), { duration: 10000 })
    if (!r.data.ok) { setPin(''); return toast.error(r.data.error === 'pin_incorrecto' ? `PIN incorrecto. Intentos restantes: ${r.data.intentos_restantes}` : (r.data.mensaje ?? 'No se pudo firmar'), { duration: 8000 }) }
    setComprobante({ ...r.data, piezas: lineas.length, detalle: r.data.detalle ?? [], nombres: lineas.map(l => l.producto?.descripcion) })
  }

  function nueva() {
    setComprobante(null); setLineas([]); setPieza(VACIA); setDocumento(''); setPin(''); setRecepcionId(nuevoId()); setPieId(nuevoId())
    onTerminar?.()
  }

  if (productos.isError) return <EmptyState title="No se pudo cargar el catálogo" description={productos.error.message} />
  if (comprobante) return <Comprobante c={comprobante} onNueva={nueva} />

  const p = pieza.producto
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="hint" style={{ marginBottom: 10 }}>
        Escanee cada pieza, verifique el contenido y tome su foto. Al firmar con su PIN, las piezas quedan <b>bajo su responsabilidad</b> con fecha, hora y su usuario.
        Aplica solo a productos con sello.
      </div>
      {!sucursalProp && <SelectorSucursal value={sucursal} onChange={setSucursal} />}
      <FormField label="Remisión, traspaso o guía (opcional)" value={documento} onChange={e => setDocumento(e.target.value)} />

      {!p && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}><ScanLine size={16} style={{ verticalAlign: -3 }} /> Escanear pieza</h3>
          <form onSubmit={e => { e.preventDefault(); escanear(codigo) }} style={{ display: 'flex', gap: 8 }}>
            <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código de barras o SKU (o use el escáner)" autoFocus inputMode="text" style={{ flex: 1, minHeight: 48, fontSize: 16 }} aria-label="Código de la pieza" />
            <button className="btn" style={grande} type="submit">Buscar</button>
          </form>
          <button type="button" className="btn o" style={{ ...grande, width: '100%', marginTop: 8 }} onClick={() => setCamara(!camara)}>{camara ? 'Cerrar cámara' : 'Escanear con la cámara'}</button>
          {camara && <CamaraEscaner onCodigo={escanear} onError={m => toast.error(m)} />}
          <FormField label="…o elija el producto" as="select" value="" onChange={e => { const x = conSello.find(q => q.id === e.target.value); if (x) { setPieza({ ...VACIA, producto: x }); setPieId(nuevoId()) } }}
            options={[{ value: '', label: conSello.length ? 'Seleccione un producto con sello' : 'No hay productos con sello: el dueño los marca en Catálogo de control' }, ...conSello.map(x => ({ value: x.id, label: x.descripcion }))]} />
        </div>
      )}

      {p && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <h3 style={{ margin: 0 }}>{p.descripcion}</h3>
            <button type="button" className="btn o sm" onClick={() => setPieza(VACIA)}>Cambiar</button>
          </div>
          {p.requiere_serie && <FormField label="Número de serie de ESTA pieza" value={pieza.numero_serie} onChange={e => setPieza({ ...pieza, numero_serie: e.target.value.toUpperCase() })} />}
          <div role="radiogroup" aria-label="Verificación del contenido" style={{ display: 'grid', gap: 8, margin: '10px 0' }}>
            {Object.entries(NOMBRE_VERIFICACION).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={pieza.verificacion === k} className={pieza.verificacion === k ? 'btn' : 'btn o'} style={{ ...grande, textAlign: 'left' }} onClick={() => setPieza({ ...pieza, verificacion: k })}>
                {label}
              </button>
            ))}
          </div>
          {pieza.verificacion !== 'abierta_y_resellada' && <FormField label="Folio del sello que trae" value={pieza.folio_sello} onChange={e => setPieza({ ...pieza, folio_sello: e.target.value.toUpperCase() })} />}
          {pieza.verificacion === 'abierta_y_resellada' && (
            <>
              <FormField label="Folio del sello que traía (si lo tenía)" value={pieza.folio_sello} onChange={e => setPieza({ ...pieza, folio_sello: e.target.value.toUpperCase() })} />
              <FormField label="Folio del sello NUEVO" value={pieza.nuevo_folio_sello} onChange={e => setPieza({ ...pieza, nuevo_folio_sello: e.target.value.toUpperCase() })} />
            </>
          )}
          {pieza.verificacion === 'sello_roto' && <div className="hint" style={{ color: 'var(--red)' }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Se abrirá un caso y se avisará al supervisor. La pieza queda a su cargo.</div>}
          {pieza.verificacion !== 'abierta_y_resellada' && <FormField label="Peso en la báscula, en gramos (opcional)" type="number" inputMode="decimal" value={pieza.peso_medido} onChange={e => setPieza({ ...pieza, peso_medido: e.target.value })} />}
          <FotoEnVivo titulo="Foto en vivo de la pieza o caja" tipoOrigen="recepcion" origenId={recepcionId} sucursalId={sucursal} evidenciaId={pieza.evidencia_id} onFoto={id => setPieza({ ...pieza, evidencia_id: id })} />
          <button type="button" className="btn" style={{ ...grande, width: '100%', marginTop: 10 }} onClick={agregar}>Agregar pieza a la recepción</button>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>Piezas recibidas ({lineas.length})</h3>
        {!lineas.length && <div className="hint">Aún no hay piezas. Escanee la primera.</div>}
        {lineas.map((l, i) => (
          <div key={l.evidencia_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border, #ddd)', padding: '8px 0' }}>
            <div>
              <b>{l.producto.descripcion}</b>
              <div className="hint">{NOMBRE_VERIFICACION[l.verificacion]}{l.numero_serie ? ` · serie ${normalizarSerie(l.numero_serie)}` : ''}{l.folio_sello ? ` · sello ${normalizarFolio(l.folio_sello)}` : ''}{l.nuevo_folio_sello ? ` → ${normalizarFolio(l.nuevo_folio_sello)}` : ''}</div>
            </div>
            <button type="button" className="btn o sm" aria-label={`Quitar ${l.producto.descripcion}`} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
          </div>
        ))}
        {lineas.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="field"><label className="req">Su PIN (firma de recepción)</label>
              <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} style={{ minHeight: 48, fontSize: 20, textAlign: 'center' }} aria-label="PIN" /></div>
            <button type="button" className="btn" style={{ ...grande, width: '100%' }} disabled={enviando || pin.length < 4} onClick={firmar}>
              <ShieldCheck size={18} style={{ verticalAlign: -4 }} /> {enviando ? 'Firmando…' : `Firmar y recibir ${lineas.length} pieza${lineas.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Comprobante({ c, onNueva }) {
  const pesoMal = (c.detalle ?? []).map((d, i) => ({ d, nombre: c.nombres?.[i] })).filter(x => x.d.peso_coincide === false)
  return (
    <div className="card" style={{ maxWidth: 520, margin: '0 auto', padding: 18 }}>
      <h3 style={{ marginTop: 0 }}><PackageCheck size={18} style={{ verticalAlign: -3 }} /> Recepción firmada</h3>
      <p>Recibió <b>{c.piezas}</b> pieza{c.piezas === 1 ? '' : 's'} el <b>{fechaHora(c.firmada_en)}</b>. Desde este momento quedan <b>bajo su responsabilidad</b>.</p>
      {pesoMal.length > 0 && (
        <div role="alert" className="text-red" style={{ marginBottom: 8 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> El peso no coincide en: {pesoMal.map(x => x.nombre).join(', ')}. Abra la caja y verifique el contenido; se avisó al supervisor.</div>
      )}
      {c.con_incidencias && <div role="alert" className="text-red" style={{ marginBottom: 8 }}>Llegó con el sello roto: se abrió un caso y se avisó al supervisor.</div>}
      <button className="btn" style={{ ...grande, width: '100%' }} onClick={onNueva}>Listo</button>
    </div>
  )
}

/** Historial de recepciones (quien captura ve las suyas; dueño y supervisor, todas). */
export function ListaRecepciones() {
  const q = useDatos(['ctl-recepciones'], () => listarRecepciones({ limite: 100 }))
  const lineas = useDatos(['ctl-recepciones-lineas', q.data?.data?.map(r => r.id).join(',')], () => (q.data?.data?.length ? listarLineasRecepcion(q.data.data.map(r => r.id)) : Promise.resolve({ data: [] })), { enabled: !!q.data })
  const prods = useDatos(['ctl-prod-nombres'], () => productosEscaneables())
  const usuarios = useDatos(['ctl-usuarios'], () => listar('v_ctl_usuarios', { limite: 500 }))
  const sedes = useDatos(['ctl-sedes'], () => listar('v_ctl_sucursales', { limite: 100 }))
  const nombre = useMemo(() => Object.fromEntries((prods.data?.data ?? []).map(p => [p.id, p.descripcion])), [prods.data])
  const quien = useMemo(() => Object.fromEntries((usuarios.data?.data ?? []).map(u => [u.id, u.nombre])), [usuarios.data])
  const suc = useMemo(() => Object.fromEntries((sedes.data?.data ?? []).map(s => [s.id, s.nombre])), [sedes.data])
  const porRec = useMemo(() => { const m = {}; for (const l of lineas.data?.data ?? []) (m[l.recepcion_id] ??= []).push(l); return m }, [lineas.data])
  if (q.isLoading || q.isError || q.data?.aviso) return <EstadoConsulta q={q} />
  if (!q.data.data.length) return <EmptyState title="Sin recepciones" description="Aún no se registra ninguna recepción con responsiva." />
  return (
    <div className="tabla-wrap"><table className="tabla">
      <thead><tr><th>Firmada</th><th>Sucursal</th><th>Recibió</th><th>Documento</th><th>Piezas</th></tr></thead>
      <tbody>{q.data.data.map(r => (
        <tr key={r.id}>
          <td>{fechaHora(r.firmada_en)}</td><td>{suc[r.sucursal_id] ?? '—'}</td><td>{quien[r.creado_por] ?? '—'}{r.con_incidencias && <span className="bd r" style={{ marginLeft: 6 }}>sello roto</span>}</td><td>{r.documento ?? '—'}</td>
          <td>{(porRec[r.id] ?? []).map(l => `${nombre[l.producto_id] ?? 'pieza'}${l.numero_serie ? ' · ' + l.numero_serie : ''}`).join('; ') || r.lineas}</td>
        </tr>))}</tbody>
    </table></div>
  )
}
