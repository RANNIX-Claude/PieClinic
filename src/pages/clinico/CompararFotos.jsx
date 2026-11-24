import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, EyeOff, Crosshair } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import EmptyState from '../../components/ui/EmptyState'
import FormField from '../../components/ui/FormField'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, actualizar } from '../../lib/api'
import { bitacoraExportar, bitacoraVer } from '../../lib/bitacora'
import { urlFirmada, BUCKETS } from '../../lib/urlFirmada'
import { fecha, fechaHora } from '../../lib/formato'
import { nombreZona } from '../../lib/clinico/mapaPie'
import { MOMENTOS_FOTO, VISTAS_FOTO, NIVELES_AUTORIZACION, etiquetaDe } from '../../lib/clinico/catalogos'
import { validarRetiroFoto, fotoPublicable } from '../../lib/clinico/inmutabilidad'
import { Aviso, Seccion, PacienteBuscador, usePaciente, Volver, useAccion, mensajeError, CabeceraPaciente } from './componentes/comunes'
import SubirFotoClinica from './componentes/SubirFotoClinica'

export default function CompararFotos() {
  const { id: idRuta } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const id = idRuta ?? sp.get('paciente')
  const { perfil } = useApp()
  const puedeSubir = usePermiso('fotos.subir')
  const paciente = usePaciente(id)
  const { ejecutar } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const [f, setF] = useState({ pie: '', zona: '', incluirRetiradas: false })
  const [sel, setSel] = useState([null, null, null]) // ids de las 3 columnas: antes · después 1 · después 2
  const [detalle, setDetalle] = useState(null)
  const [urls, setUrls] = useState({})
  const [subir, setSubir] = useState(false)
  const [consultaSubir, setConsultaSubir] = useState('')

  const q = useQuery({
    queryKey: ['clinico', 'fotos-comparar', id], enabled: !!id,
    queryFn: async () => {
      const r0 = await leer('fotos_clinicas', { sedeCol: false, filtros: { paciente_id: id }, orden: { columna: 'tomada_en' }, limite: 500 })
      if (r0.error) throw r0.error
      const cd = await leer('consentimientos', { sedeCol: false, filtros: { paciente_id: id, tipo: 'fotos_docencia', estado: 'firmado', aceptado: true }, limite: 1 })
      const docenciaVigente = (cd.data ?? []).length > 0
      const r = { ...r0, data: r0.data.map(x => ({ ...x, autorizacion_vigente: x.nivel_autorizacion === 'clinico' || docenciaVigente })) }
      const cids = [...new Set(r.data.map(x => x.consulta_id))]
      const c = cids.length ? await leer('consultas', { sedeCol: false, filtros: { id: cids }, columnas: 'id,folio,fecha_hora,estado,podologo_id,sede_id,paciente_id', limite: 500 }) : { data: [] }
      const pids = [...new Set([...(c.data ?? []).map(x => x.podologo_id), ...r.data.map(x => x.subida_por).filter(Boolean)])]
      const p = pids.length ? await leer('perfiles', { sedeCol: false, filtros: { id: pids }, columnas: 'id,nombre,apellidos' }) : { data: [] }
      return { fotos: r.data, consultas: c.data ?? [], perfiles: Object.fromEntries((p.data ?? []).map(x => [x.id, x])) }
    },
  })
  const consultas = q.data?.consultas ?? []
  const cm = Object.fromEntries(consultas.map(c => [c.id, c]))
  const fotos = useMemo(() => (q.data?.fotos ?? []).filter(x => (f.incluirRetiradas || !x.retirada) && (!f.pie || x.pie === f.pie) && (!f.zona || x.zona_codigo === f.zona)), [q.data, f])
  const zonas = [...new Set((q.data?.fotos ?? []).map(x => x.zona_codigo).filter(Boolean))]
  const opcional = (u, i) => u?.[i]?.id ?? null

  // Por omisión: la más antigua como «antes» y las dos siguientes como «después»
  useEffect(() => { setSel([opcional(fotos, 0), opcional(fotos, 1), opcional(fotos, fotos.length > 2 ? fotos.length - 1 : 2)]) }, [fotos.length, f.pie, f.zona]) // eslint-disable-line

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const o = { ...urls }
      for (const x of fotos) if (!o[x.id]) o[x.id] = await urlFirmada(BUCKETS.fotos, x.archivo_path, 1800)
      if (vivo) setUrls(o)
    })()
    return () => { vivo = false }
  }, [fotos]) // eslint-disable-line
  useEffect(() => { if (id) bitacoraVer('fotos_clinicas', id, { origen: 'comparador' }) }, [id])

  if (!id) return (
    <div className="pagina"><PageHeader titulo="Fotos clínicas" subtitulo="Comparador de evolución antes / después" />
      <Seccion titulo="Elige al paciente"><PacienteBuscador seleccionado={null} onElegir={p => p && nav(`/pacientes/${p.id}/fotos`)} /></Seccion></div>)
  if (q.isLoading || paciente.isLoading) return <div className="pagina"><LoadingSpinner /></div>
  if (q.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(q.error)}</Aviso><Volver a="/fotos-clinicas" /></div>

  const porId = Object.fromEntries((q.data?.fotos ?? []).map(x => [x.id, x]))
  const nombre = p => (p ? [p.nombre, p.apellidos].filter(Boolean).join(' ') : '—')
  const colEtiqueta = ['ANTES', 'DESPUÉS 1', 'DESPUÉS 2']
  const timeline = Object.values(fotos.reduce((a, x) => { (a[x.consulta_id] ??= { consulta: cm[x.consulta_id], fotos: [] }).fotos.push(x); return a }, {})).sort((a, b) => (b.consulta?.fecha_hora ?? '').localeCompare(a.consulta?.fecha_hora ?? ''))

  async function retirar(x) {
    const motivo = await confirmar({ titulo: 'Retirar foto', mensaje: 'Las fotos clínicas nunca se borran: se retiran con motivo, autor y fecha y dejan de mostrarse (P-008).', pedirMotivo: true, peligro: true, textoConfirmar: 'Retirar' })
    if (!motivo) return
    const e = validarRetiroFoto(motivo)
    if (e) { toast.error(e); return }
    await ejecutar(() => actualizar('fotos_clinicas', x.id, { retirada: true, retirada_motivo: motivo, retirada_por: perfil.id, retirada_en: new Date().toISOString() }), { ok: 'Foto retirada', invalidar: ['clinico'] })
    setDetalle(null)
  }
  async function anotar(x, e) {
    const r = e.currentTarget.getBoundingClientRect()
    const punto = { x: Number(((e.clientX - r.left) / r.width).toFixed(3)), y: Number(((e.clientY - r.top) / r.height).toFixed(3)), t: new Date().toISOString() }
    await ejecutar(() => actualizar('fotos_clinicas', x.id, { anotaciones: [...(Array.isArray(x.anotaciones) ? x.anotaciones : []), punto] }), { ok: 'Marca agregada', invalidar: ['clinico'] })
  }
  async function descargar() {
    const elegidas = sel.map(i => porId[i]).filter(Boolean)
    if (!elegidas.length) return
    const imgs = await Promise.all(elegidas.map(x => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = urls[x.id] })))
    if (imgs.some(i => !i)) { toast.error('No se pudo cargar alguna imagen para el comparativo'); return }
    const H = 600, ancho = imgs.map(i => Math.round(i.width * (H / i.height)))
    const cv = document.createElement('canvas'); cv.width = ancho.reduce((a, b) => a + b, 0) + 10 * (imgs.length - 1); cv.height = H + 40
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000'; g.font = '16px sans-serif'
    let x0 = 0
    imgs.forEach((im, i) => { g.drawImage(im, x0, 40, ancho[i], H); g.fillText(`${colEtiqueta[i]} · ${fecha(elegidas[i].tomada_en)}`, x0 + 6, 26); x0 += ancho[i] + 10 })
    const a = document.createElement('a'); a.href = cv.toDataURL('image/jpeg', 0.9); a.download = `comparativo_${paciente.data?.numero_expediente ?? 'paciente'}.jpg`; a.click()
    bitacoraExportar('fotos_clinicas', { paciente_id: id, fotos: elegidas.map(x => x.id), formato: 'comparativo' })
  }

  const opcionesFoto = fotos.map(x => ({ value: x.id, label: `${fecha(x.tomada_en)} · ${etiquetaDe(MOMENTOS_FOTO, x.momento)} · ${x.pie ?? ''} ${nombreZona(x.zona_codigo)}${x.retirada ? ' (retirada)' : ''}` }))
  const d = detalle ? porId[detalle] : null

  return (
    <div className="pagina">
      <PageHeader titulo="Comparar fotos de evolución" subtitulo="Fotos clínicas › Comparador · imágenes en almacenamiento privado (URL firmada de vida corta)"
        acciones={<>{puedeSubir && <button type="button" className="btn o" onClick={() => setSubir(v => !v)}>+ Subir foto</button>}<button type="button" className="btn o" onClick={descargar} disabled={!sel.some(Boolean)}><Download size={14} style={{ verticalAlign: -3 }} /> Descargar comparativo</button><Volver a={`/pacientes/${id}`} /></>} />
      <CabeceraPaciente paciente={paciente.data} />
      {subir && (
        <Seccion titulo="Subir foto clínica">
          <FormField label="Sesión / consulta" required as="select" value={consultaSubir} onChange={e => setConsultaSubir(e.target.value)} options={consultas.map(c => ({ value: c.id, label: `${c.folio} · ${fecha(c.fecha_hora)} · ${c.estado}` }))} hint="Toda foto clínica se liga a una consulta." />
          {consultaSubir && <SubirFotoClinica consulta={cm[consultaSubir]} onSubida={() => setSubir(false)} />}
          <Aviso>Máximo 10 fotos por sesión (la 11.ª pide confirmación), 10 MB cada una; se reducen a ≤ 2048 px.</Aviso>
        </Seccion>)}
      <div className="row" style={{ marginBottom: 10 }}>
        <FormField label="Pie" as="select" options={[{ value: 'D', label: 'Derecho' }, { value: 'I', label: 'Izquierdo' }]} value={f.pie} onChange={e => setF(s => ({ ...s, pie: e.target.value }))} placeholder="Ambos" />
        <FormField label="Zona" as="select" options={zonas.map(z => ({ value: z, label: nombreZona(z) }))} value={f.zona} onChange={e => setF(s => ({ ...s, zona: e.target.value }))} placeholder="Todas" />
        {sel.map((v, i) => <FormField key={i} label={colEtiqueta[i]} as="select" options={opcionesFoto} value={v ?? ''} onChange={e => setSel(s => s.map((x, j) => (j === i ? e.target.value || null : x)))} placeholder="—" />)}
        <label style={{ alignSelf: 'flex-end', fontSize: 12.5, paddingBottom: 8 }}><input type="checkbox" checked={f.incluirRetiradas} onChange={e => setF(s => ({ ...s, incluirRetiradas: e.target.checked }))} /> Ver retiradas</label>
      </div>
      {fotos.length === 0 ? <EmptyState title="Sin fotos" description="No hay fotos con esos filtros. Súbelas desde la consulta o con «+ Subir foto»." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
          {sel.map((i, k) => { const x = porId[i]; return (
            <div key={k} className="card" style={{ padding: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>{colEtiqueta[k]}{x ? ` · ${fecha(x.tomada_en)}` : ''}</div>
              {x ? (<>
                {urls[x.id] ? <img src={urls[x.id]} alt={colEtiqueta[k]} onClick={() => setDetalle(x.id)} style={{ width: '100%', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }} /> : <div style={{ height: 200, background: 'var(--bd-n-bg)', borderRadius: 8 }} />}
                <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--muted)' }}>{cm[x.consulta_id]?.folio} · {nombre(q.data.perfiles[cm[x.consulta_id]?.podologo_id])}<br />{x.vista} · {nombreZona(x.zona_codigo)} · Autorización: {etiquetaDe(NIVELES_AUTORIZACION, x.nivel_autorizacion)}{!fotoPublicable(x) && ' · sin autorización vigente'}{x.comentario ? <><br />{x.comentario}</> : null}</div>
              </>) : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Elige una foto.</div>}
            </div>) })}
        </div>)}

      <Seccion titulo="Línea de tiempo de evolución">
        {timeline.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin fotos.</div>}
        {timeline.map(t => (
          <div key={t.consulta?.id ?? 'x'} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, margin: '8px 0', fontSize: 13 }}>
            <b>{fecha(t.consulta?.fecha_hora)}</b> · {t.consulta?.folio} · {t.fotos.length} fotos <span className={`bd ${t.consulta?.estado === 'cerrada' ? 'v' : 'a'}`}>{t.consulta?.estado}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>{t.fotos.map(x => urls[x.id] && <img key={x.id} src={urls[x.id]} alt="" onClick={() => setDetalle(x.id)} style={{ height: 54, borderRadius: 6, cursor: 'pointer', opacity: x.retirada ? 0.35 : 1 }} />)}</div>
          </div>))}
      </Seccion>

      {d && (
        <Seccion titulo="Datos de la foto seleccionada" acciones={<button type="button" className="btn o sm" onClick={() => setDetalle(null)}>Cerrar</button>}>
          <div className="grid2">
            <div style={{ position: 'relative' }}>
              {urls[d.id] && <img src={urls[d.id]} alt="Foto seleccionada" onClick={e => puedeSubir && !d.retirada && anotar(d, e)} style={{ width: '100%', borderRadius: 8, cursor: puedeSubir ? 'crosshair' : 'default' }} />}
              {(Array.isArray(d.anotaciones) ? d.anotaciones : []).map((a, i) => <span key={i} style={{ position: 'absolute', left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: '50%', border: '2px solid var(--red)', background: 'rgba(217,48,37,.25)' }} />)}
              {puedeSubir && !d.retirada && <div style={{ fontSize: 11, color: 'var(--muted)' }}><Crosshair size={11} style={{ verticalAlign: -1 }} /> Clic sobre la foto para anotar un punto.</div>}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div><b>Sesión / consulta:</b> {cm[d.consulta_id]?.folio}</div><div><b>Pie y zona:</b> {d.pie === 'D' ? 'Der.' : 'Izq.'} · {nombreZona(d.zona_codigo)}</div>
              <div><b>Momento:</b> {etiquetaDe(MOMENTOS_FOTO, d.momento)}</div><div><b>Ángulo:</b> {etiquetaDe(VISTAS_FOTO, d.vista)}</div>
              <div><b>Autorización del paciente:</b> {etiquetaDe(NIVELES_AUTORIZACION, d.nivel_autorizacion)}{d.nivel_autorizacion === 'docencia' && !d.autorizacion_vigente && <span className="bd r" style={{ marginLeft: 6 }}>Oculta: autorización revocada</span>}</div>
              <div><b>Origen:</b> {d.origen === 'paciente' ? 'Enviada por el paciente' : 'Clínica'}</div>
              <div><b>Subida por:</b> {nombre(q.data.perfiles[d.subida_por])}</div><div><b>Fecha y hora:</b> {fechaHora(d.tomada_en)}</div><div><b>Comentario:</b> {d.comentario ?? '—'}</div>
              {d.retirada && <div className="bd r"><EyeOff size={11} /> Retirada: {d.retirada_motivo}</div>}
              {puedeSubir && !d.retirada && <button type="button" className="btn red sm" style={{ marginTop: 8 }} onClick={() => retirar(d)}>Retirar foto (con motivo)</button>}
            </div>
          </div>
        </Seccion>)}
      {dialogo}
    </div>
  )
}
