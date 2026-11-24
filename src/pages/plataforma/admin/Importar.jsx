// 13 · Importar datos con IA (P-122, P-123, CA-08, N-07). Subir → Mapeo → Vista previa → Confirmar. Migración 054.
// La IA es un adaptador SIN llave (modo simulado visible); el mapeo heurístico por nombre de columna es real. Nada se carga sin confirmar.
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, Check, ChevronRight, Undo2, Download, Save, History } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { supabase } from '../../../lib/supabase'
import { leer, insertar, actualizar, rpc } from '../../../lib/api'
import { rutaStorage, BUCKETS } from '../../../lib/urlFirmada'
import { fechaHora } from '../../../lib/formato'
import { bitacoraExportar } from '../../../lib/bitacora'
import { proponerMapeo, estadoIA } from '../../../lib/adaptadores/ia'
import { CAMPOS_DESTINO, TIPOS_DATOS, validarLote, resumirFilas, mapeosPorRevisar, filasACargar, puedeRevertir } from '../../../lib/plataforma/importacion'
import { leerTabla, tipoArchivo } from '../../../lib/plataforma/archivos'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import StatusBadge from '../../../components/ui/StatusBadge'
import FormField from '../../../components/ui/FormField'
import EmptyState from '../../../components/ui/EmptyState'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { BannerIA, useDatos, errMsg, invocar, descargar, csv, EstadoConsulta } from './comun'

const PASOS = [{ id: 'subir', n: 1, t: 'Subir' }, { id: 'mapeo', n: 2, t: 'Mapeo' }, { id: 'vista_previa', n: 3, t: 'Vista previa' }, { id: 'confirmar', n: 4, t: 'Confirmar' }]
const IA_MODO_BD = { simulado: 'sintetico', activo: 'activo', no_configurado: 'no_configurado' }
const ETQ_RESULTADO = { valido: 'Válido', advertencia: 'Advertencia', error: 'Error', duplicado: 'Duplicado' }

function Pasos({ actual }) {
  const i = PASOS.findIndex(p => p.id === actual)
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 14px' }}>
      {PASOS.map((p, k) => (
        <span key={p.id} className={`bd ${k < i ? 'v' : k === i ? 'm' : 'n'}`}>{k < i ? <Check size={11} style={{ verticalAlign: -1 }} /> : p.n} {p.t}</span>
      ))}
    </div>
  )
}

export default function Importar() {
  const { organizacion, sedes, sedeActivaId, rol } = useApp()
  const puedeUsar = usePermiso('importar.usar')
  const qc = useQueryClient()
  const { confirmar, dialogo } = useConfirmacion()
  const esAdmin = rol === 'administrador'
  const umbralOrg = Number(organizacion?.parametros?.ia?.umbral_confianza_importacion ?? 80)

  const [tab, setTab] = useState('nueva')
  const [paso, setPaso] = useState('subir')
  const [ocupado, setOcupado] = useState(false)
  const [ia, setIa] = useState({ modo: 'simulado', proveedor: 'reglas-locales' })
  const [form, setForm] = useState({ tipo: 'pacientes', sede: sedeActivaId ?? '', origen: 'excel', politica: 'omitir', plantilla: '' })
  const [archivo, setArchivo] = useState(null)
  const [datos, setDatos] = useState(null)       // { hojas, hoja, columnas, filas, tipoArchivo }
  const [lote, setLote] = useState(null)         // fila de importaciones
  const [mapeos, setMapeos] = useState([])       // filas de importacion_mapeos
  const [filas, setFilas] = useState([])         // resultado de validarLote (+ id tras guardar)
  const [filtroRes, setFiltroRes] = useState('')
  const [carga, setCarga] = useState(null)       // { cargados, omitidos }
  const [mensajeIA, setMensajeIA] = useState('')
  const [nombrePlantilla, setNombrePlantilla] = useState('')

  useEffect(() => { estadoIA().then(setIa) }, [])
  useEffect(() => { if (!form.sede && sedes?.length === 1) setForm(f => ({ ...f, sede: sedes[0].id })) }, [sedes])

  const plantillas = useDatos(['imp-plantillas'], () => leer('importacion_plantillas', { sedeCol: false, orden: { columna: 'nombre' }, limite: 200 }))
  const historial = useDatos(['imp-historial'], () => leer('prp_importaciones', { sedeCol: false, orden: { columna: 'created_at', asc: false }, limite: 200 }))
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['imp-historial'] }); qc.invalidateQueries({ queryKey: ['imp-plantillas'] }) }

  const camposTipo = CAMPOS_DESTINO[lote?.tipo_datos ?? form.tipo] ?? []
  const campoLabel = c => camposTipo.find(x => x.campo === c)?.etiqueta ?? c

  // ── 1 · Subir y analizar ──────────────────────────────────────────────
  async function elegirArchivo(f) {
    setArchivo(f); setDatos(null); setMensajeIA('')
    if (!f) return
    const t = tipoArchivo(f.name)
    if (t === 'tabla') {
      try {
        const { hojas } = await leerTabla(f)
        const h = hojas.find(x => x.filas.length) ?? hojas[0]
        setDatos({ hojas, hoja: h?.nombre, columnas: h?.columnas ?? [], filas: h?.filas ?? [], tipoArchivo: t })
      } catch (e) { toast.error(`No se pudo leer el archivo: ${e.message}`); setArchivo(null) }
    } else if (t === 'pdf' || t === 'imagen') setDatos({ hojas: [], columnas: [], filas: [], tipoArchivo: t })
    else { toast.error('Formato no admitido. Usa Excel, CSV, PDF o imagen.'); setArchivo(null) }
  }
  const cambiarHoja = nombre => { const h = datos.hojas.find(x => x.nombre === nombre); setDatos(d => ({ ...d, hoja: nombre, columnas: h.columnas, filas: h.filas })) }

  async function analizar() {
    if (!archivo || !datos) return
    if (datos.tipoArchivo === 'tabla' && !datos.filas.length) return toast.error('La hoja no tiene filas con datos.')
    setOcupado(true)
    try {
      const ins = await insertar('importaciones', {
        sede_id: form.sede || null, tipo_datos: form.tipo, origen_sistema: form.origen, archivo_nombre: archivo.name, archivo_bytes: archivo.size,
        hoja: datos.hoja ?? null, total_filas: datos.filas.length, total_columnas: datos.columnas.length, politica_duplicados: form.politica, umbral_confianza: umbralOrg,
        plantilla_id: form.plantilla || null,
      })
      if (ins.error) throw new Error(errMsg(ins.error))
      let nuevo = ins.data[0]
      const ruta = rutaStorage(organizacion.id, nuevo.id, archivo.name.replace(/[^\w.\-]+/g, '_'))
      const sub = await supabase.storage.from(BUCKETS.importaciones).upload(ruta, archivo, { upsert: false })
      if (sub.error) throw new Error(`No se pudo subir el archivo: ${sub.error.message}`)
      nuevo = (await actualizar('importaciones', nuevo.id, { archivo_path: ruta })).data ?? nuevo

      const prop = await proponerMapeo({ columnas: datos.columnas, filas: datos.filas, tipo: form.tipo, umbral: umbralOrg, archivo: { tipo: datos.tipoArchivo, path: ruta } })
      setIa({ modo: prop.modo, proveedor: prop.proveedor })
      let lista = prop.mapeos ?? []
      if (form.plantilla) {
        const pl = (plantillas.data?.data ?? []).find(p => p.id === form.plantilla)
        const porCol = Object.fromEntries((pl?.mapeos ?? []).map(m => [m.columna, m]))
        lista = lista.map(m => (porCol[m.columna] ? { ...m, campo_destino: porCol[m.columna].campo_destino, confianza: 100, transformacion: porCol[m.columna].transformacion ?? m.transformacion } : m))
      }
      setLote(nuevo)
      if (!lista.length) {
        setMensajeIA(prop.mensaje || 'No se propuso ningún mapeo.')
        setPaso('subir'); refrescar()
        return toast(prop.mensaje || 'Sin propuesta de mapeo', { icon: 'ℹ️' })
      }
      const g = await rpc('importacion_guardar_propuesta', {
        p_importacion: nuevo.id,
        p_propuesta: { proveedor: prop.proveedor, modo: IA_MODO_BD[prop.modo] ?? 'no_configurado', mapeos: lista.map(m => ({ columna: m.columna, ejemplo: m.ejemplo, campo_destino: m.campo_destino, confianza: m.confianza, transformacion: m.transformacion, campo_clinico: !!m.campo_clinico })) },
      })
      if (g.error) throw new Error(errMsg(g.error))
      await cargarMapeos(nuevo.id)
      setPaso('mapeo'); refrescar()
    } catch (e) { toast.error(errMsg(e)) } finally { setOcupado(false) }
  }

  async function cargarMapeos(id) {
    const r = await leer('prp_importacion_mapeos', { sedeCol: false, filtros: { importacion_id: id }, limite: 500 })
    if (r.error) throw new Error(errMsg(r.error))
    setMapeos(r.data)
    return r.data
  }

  // ── 2 · Mapeo ─────────────────────────────────────────────────────────
  async function editarMapeo(m, cambios) {
    const r = await actualizar('importacion_mapeos', m.id, cambios)
    if (r.error) return toast.error(errMsg(r.error))
    await cargarMapeos(lote.id)
  }
  const cambiarDestino = (m, campo) => editarMapeo(m, { campo_destino: campo || null, accion: campo ? 'revisar' : 'elegir_campo', campo_clinico: !!camposTipo.find(c => c.campo === campo)?.clinico })
  async function aceptarSeguros() {
    const ids = mapeos.filter(m => m.campo_destino && m.accion !== 'aceptar' && !m.campo_clinico && !m.bajo_umbral).map(m => m.id)
    if (!ids.length) return toast('No hay columnas seguras por aceptar')
    const { error } = await supabase.from('importacion_mapeos').update({ accion: 'aceptar' }).in('id', ids)
    if (error) return toast.error(error.message)
    await cargarMapeos(lote.id); toast.success(`${ids.length} columnas aceptadas`)
  }
  async function guardarPlantilla() {
    if (!nombrePlantilla.trim()) return toast.error('Escribe un nombre para la plantilla')
    const r = await insertar('importacion_plantillas', { nombre: nombrePlantilla.trim(), tipo_datos: lote.tipo_datos, origen_sistema: lote.origen_sistema, mapeos: mapeos.filter(m => m.campo_destino).map(m => ({ columna: m.columna_archivo, campo_destino: m.campo_destino, transformacion: m.transformacion })) })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Plantilla guardada'); setNombrePlantilla(''); refrescar()
  }

  // ── 3 · Vista previa ──────────────────────────────────────────────────
  async function existentesDe(tipo) {
    const tabla = { pacientes: ['pacientes', 'nombre,apellido_paterno,apellido_materno,fecha_nacimiento,telefono_celular'], productos: ['productos', 'sku,codigo_barras,nombre'], proveedores: ['proveedores', 'nombre,rfc,telefono'] }[tipo]
    if (!tabla) return []
    const r = await leer(tabla[0], { sedeCol: false, columnas: tabla[1], limite: 20000 })
    return r.error ? [] : r.data
  }
  async function generarVistaPrevia() {
    if (mapeosPorRevisar(mapeos).length) return toast.error('Quedan columnas por revisar')
    setOcupado(true)
    try {
      const existentes = await existentesDe(lote.tipo_datos)
      const aceptados = mapeos.filter(m => m.campo_destino).map(m => ({ columna: m.columna_archivo, campo_destino: m.campo_destino }))
      const { filas: val } = validarLote(datos.filas, aceptados, lote.tipo_datos, existentes)
      await supabase.from('importacion_filas').delete().eq('importacion_id', lote.id)
      const base = val.map(f => ({ organizacion_id: organizacion.id, importacion_id: lote.id, numero_fila: f.numero_fila, valores_originales: f.valores_originales, valores_normalizados: f.valores_normalizados, resultado: f.resultado, mensajes: f.mensajes }))
      for (let i = 0; i < base.length; i += 400) {
        const { error } = await supabase.from('importacion_filas').insert(base.slice(i, i + 400))
        if (error) throw new Error(error.message)
      }
      const rs = await rpc('importacion_resumir', { p_importacion: lote.id })
      if (rs.error) throw new Error(errMsg(rs.error))
      const guardadas = await leer('prp_importacion_filas', { sedeCol: false, filtros: { importacion_id: lote.id }, orden: { columna: 'numero_fila' }, limite: 50000 })
      setFilas(guardadas.data.map(f => ({ ...f, duplicado_de: val.find(v => v.numero_fila === f.numero_fila)?.duplicado_de })))
      setLote(l => ({ ...l, estado: 'vista_previa', paso: 'vista_previa' }))
      setPaso('vista_previa'); refrescar()
    } catch (e) { toast.error(errMsg(e)) } finally { setOcupado(false) }
  }
  const resumen = useMemo(() => resumirFilas(filas), [filas])
  const filasVisibles = filtroRes ? filas.filter(f => f.resultado === filtroRes) : filas
  const decidir = (id, decision) => setFilas(fs => fs.map(f => (f.id === id ? { ...f, decision } : f)))
  const descargarErrores = () => {
    const err = filas.filter(f => f.resultado === 'error')
    descargar(`errores_${lote.archivo_nombre}.csv`, csv(['fila', 'motivo'], err.map(f => ({ fila: f.numero_fila, motivo: (f.mensajes ?? []).map(m => m.motivo).join('; ') }))))
    bitacoraExportar('importacion_errores', { importacion: lote.id, filas: err.length })
  }

  // ── 4 · Confirmar y cargar ────────────────────────────────────────────
  async function confirmarCarga() {
    if (!esAdmin) return toast.error('Solo un Administrador confirma la importación')
    const aCargar = filasACargar(filas, form.politica).length
    const ok = await confirmar({ titulo: 'Confirmar importación', mensaje: `Se cargarán ${aCargar} registros marcados como «importado». Las filas con error no se cargan y los duplicados siguen su decisión. Podrás deshacer el lote mientras nadie modifique esos registros.`, textoConfirmar: 'Confirmar y cargar' })
    if (!ok) return
    setOcupado(true)
    try {
      for (const d of ['omitir', 'combinar', 'crear_nuevo']) {
        const ids = filas.filter(f => f.resultado === 'duplicado' && f.decision === d).map(f => f.id)
        if (ids.length) await supabase.from('importacion_filas').update({ decision: d }).in('id', ids)
      }
      await actualizar('importaciones', lote.id, { politica_duplicados: form.politica })
      if (lote.estado !== 'confirmado') {
        const c = await rpc('importacion_confirmar', { p_importacion: lote.id })
        if (c.error) throw new Error(errMsg(c.error))
        setLote(l => ({ ...l, estado: 'confirmado' }))
      }
      setPaso('confirmar')
      await ejecutarCarga(lote.id)
    } catch (e) { toast.error(errMsg(e)) } finally { setOcupado(false); refrescar() }
  }
  async function ejecutarCarga(id) {
    const r = await invocar('importacion-cargar', { importacion_id: id })
    if (r.error) { toast.error(r.error, { duration: 7000 }); setCarga({ error: r.error }); return }
    setCarga(r.data); setLote(l => ({ ...l, estado: 'cargado' })); toast.success(`Carga terminada: ${r.data.cargados ?? 0} registros`)
  }

  // ── Historial ─────────────────────────────────────────────────────────
  async function reanudar(l) {
    setOcupado(true)
    try {
      let tabla = { hojas: [], hoja: l.hoja, columnas: [], filas: [], tipoArchivo: 'tabla' }
      if (l.archivo_nombre) {
        const { data: info } = await leer('importaciones', { sedeCol: false, filtros: { id: l.id }, columnas: 'archivo_path', limite: 1 })
        const ruta = info?.[0]?.archivo_path
        if (ruta) {
          const dl = await supabase.storage.from(BUCKETS.importaciones).download(ruta)
          if (dl.error) throw new Error(dl.error.message)
          const { hojas } = await leerTabla(new File([dl.data], l.archivo_nombre))
          const h = hojas.find(x => x.nombre === l.hoja) ?? hojas.find(x => x.filas.length) ?? hojas[0]
          tabla = { hojas, hoja: h?.nombre, columnas: h?.columnas ?? [], filas: h?.filas ?? [], tipoArchivo: 'tabla' }
        }
      }
      setDatos(tabla); setLote(l); setForm(f => ({ ...f, tipo: l.tipo_datos, politica: l.politica_duplicados, sede: l.sede_id ?? f.sede }))
      await cargarMapeos(l.id)
      if (l.estado === 'confirmado') { setPaso('confirmar'); const g = await leer('prp_importacion_filas', { sedeCol: false, filtros: { importacion_id: l.id }, limite: 50000 }); setFilas(g.data) }
      else setPaso('mapeo')
      setTab('nueva')
    } catch (e) { toast.error(errMsg(e)) } finally { setOcupado(false) }
  }
  async function descartar(l) {
    if (!(await confirmar({ titulo: 'Descartar lote', mensaje: `Se descarta «${l.archivo_nombre}». No se cargará nada.`, peligro: true, textoConfirmar: 'Descartar' }))) return
    const r = await actualizar('importaciones', l.id, { estado: 'descartado' })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Lote descartado'), refrescar())
  }
  async function deshacer(l) {
    const f = await leer('prp_importacion_filas', { sedeCol: false, filtros: { importacion_id: l.id }, limite: 50000 })
    const pr = puedeRevertir(f.data)
    if (!pr.ok) return toast.error(`No se puede deshacer: ${pr.motivo}`)
    if (!(await confirmar({ titulo: 'Deshacer lote completo', mensaje: `Se eliminarán los registros creados por «${l.archivo_nombre}».`, peligro: true, textoConfirmar: 'Deshacer lote' }))) return
    const r = await invocar('importacion-revertir', { importacion_id: l.id })
    r.error ? toast.error(r.error, { duration: 7000 }) : (toast.success('Lote revertido'), refrescar())
  }

  const nuevaImportacion = () => { setPaso('subir'); setLote(null); setArchivo(null); setDatos(null); setMapeos([]); setFilas([]); setCarga(null); setMensajeIA('') }
  const sinPermiso = !puedeUsar

  const [detalle, setDetalle] = useState(null)

  return (
    <div className="pagina">
      <PageHeader titulo="Importar datos con IA" subtitulo="Sube un archivo, revisa el mapeo propuesto y confirma. Nada se guarda sin tu confirmación; cada carga es un lote que se puede deshacer."
        acciones={tab === 'nueva' && lote && <button className="btn o" onClick={nuevaImportacion}>Nueva importación</button>} />
      <BannerIA modo={ia.modo} proveedor={ia.proveedor} />
      <Tabs items={[{ id: 'nueva', label: 'Importación' }, { id: 'historial', label: 'Historial de lotes', badge: historial.data?.data?.length }]} value={tab} onChange={setTab} />

      {tab === 'nueva' && (
        <div style={{ marginTop: 12 }}>
          <Pasos actual={paso} />
          {!esAdmin && <div className="card" style={{ padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>Solo un Administrador puede confirmar y cargar un lote (CA-08). Puedes preparar el mapeo y la vista previa.</div>}

          {paso === 'subir' && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Qué importar y cómo</h3>
              <div className="grid2">
                <FormField label="Tipo de datos" as="select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} options={TIPOS_DATOS.map(t => ({ value: t.id, label: t.etiqueta }))} />
                <FormField label="Sede destino" as="select" value={form.sede} onChange={e => setForm({ ...form, sede: e.target.value })} options={(sedes ?? []).map(s => ({ value: s.id, label: s.nombre }))} />
                <FormField label="Origen del sistema" as="select" value={form.origen} onChange={e => setForm({ ...form, origen: e.target.value })}
                  options={[{ value: 'excel', label: 'Excel / CSV propio' }, { value: 'otro_sistema', label: 'Otro sistema de clínica' }, { value: 'papel', label: 'Expediente en papel (escaneo)' }]} />
                <FormField label="Si el registro ya existe" as="select" value={form.politica} onChange={e => setForm({ ...form, politica: e.target.value })}
                  options={[{ value: 'omitir', label: 'Omitir (gana el dato existente)' }, { value: 'combinar', label: 'Combinar datos' }, { value: 'crear_nuevo', label: 'Crear nuevo registro' }]} hint="Duplicado = mismo nombre completo y fecha de nacimiento (P-006). Se puede decidir fila por fila." />
                <FormField label="Plantilla de mapeo guardada" as="select" value={form.plantilla} onChange={e => setForm({ ...form, plantilla: e.target.value })}
                  options={(plantillas.data?.data ?? []).filter(p => p.tipo_datos === form.tipo).map(p => ({ value: p.id, label: p.nombre }))} placeholder="Ninguna (mapeo automático)" />
                <div className="field"><label>Umbral de confianza</label><div style={{ padding: '8px 0', fontSize: 13 }}>{umbralOrg} % <span style={{ color: 'var(--muted)' }}>(parámetro de la clínica; menos = revisión obligatoria)</span></div></div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label className="req">Archivo (Excel, CSV, PDF o imagen)</label>
                <input type="file" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp" onChange={e => elegirArchivo(e.target.files?.[0])} disabled={sinPermiso} />
              </div>
              {datos?.tipoArchivo === 'tabla' && (
                <div style={{ fontSize: 13, margin: '8px 0' }}>
                  <FileSpreadsheet size={14} style={{ verticalAlign: -2 }} /> <b>{archivo?.name}</b> · {datos.filas.length} filas · {datos.columnas.length} columnas
                  {datos.hojas.length > 1 && <> · Hoja: <select value={datos.hoja} onChange={e => cambiarHoja(e.target.value)}>{datos.hojas.map(h => <option key={h.nombre}>{h.nombre}</option>)}</select></>}
                </div>
              )}
              {datos && datos.tipoArchivo !== 'tabla' && <div style={{ fontSize: 13, margin: '8px 0', color: 'var(--muted)' }}>PDF e imágenes requieren la IA para leerse; sin llave solo se guardan y la captura es manual (P-126).</div>}
              {mensajeIA && <div className="card" style={{ padding: '8px 12px', fontSize: 12.5, borderLeft: '4px solid var(--gold)' }}>{mensajeIA}</div>}
              <div style={{ marginTop: 12 }}>
                <button className="btn" disabled={!archivo || !datos || ocupado || sinPermiso} onClick={analizar}><Upload size={14} style={{ verticalAlign: -2 }} /> {ocupado ? 'Analizando…' : 'Subir y proponer mapeo'}</button>
              </div>
            </div>
          )}

          {paso === 'mapeo' && lote && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Mapeo de columnas propuesto</h3>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>Los campos clínicos y las columnas con confianza menor a {lote.umbral_confianza} % siempre requieren tu revisión (P-123).</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="bd a">{mapeosPorRevisar(mapeos).length} por revisar</span>
                <button className="btn o sm" onClick={aceptarSeguros}>Aceptar las seguras</button>
              </div>
              <div className="tabla-wrap">
                <table>
                  <thead><tr><th>Columna del archivo</th><th>Ejemplo</th><th>Campo destino</th><th>Confianza</th><th>Transformación</th><th>Decisión</th></tr></thead>
                  <tbody>
                    {mapeos.map(m => (
                      <tr key={m.id}>
                        <td><b>{m.columna_archivo}</b>{m.campo_clinico && <span className="bd r" style={{ marginLeft: 6 }}>Clínico</span>}</td>
                        <td style={{ color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.ejemplo || '—'}</td>
                        <td>
                          <select value={m.campo_destino ?? ''} onChange={e => cambiarDestino(m, e.target.value)}>
                            <option value="">(Sin campo — se ignora)</option>
                            {camposTipo.map(c => <option key={c.campo} value={c.campo}>{c.etiqueta}</option>)}
                          </select>
                        </td>
                        <td>{m.confianza != null ? <span className={`bd ${m.bajo_umbral ? 'r' : 'v'}`}>{Math.round(m.confianza)} %</span> : '—'}</td>
                        <td style={{ fontSize: 12 }}>{m.transformacion ?? '—'}</td>
                        <td>
                          {m.campo_destino ? (m.accion === 'aceptar'
                            ? <span className="bd v"><Check size={11} style={{ verticalAlign: -1 }} /> Aceptado</span>
                            : <button className="btn o sm" onClick={() => editarMapeo(m, { accion: 'aceptar' })}>Aceptar</button>) : <span className="bd n">Ignorar</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
                <input placeholder="Nombre de la plantilla…" value={nombrePlantilla} onChange={e => setNombrePlantilla(e.target.value)} style={{ minWidth: 200 }} />
                <button className="btn o sm" onClick={guardarPlantilla}><Save size={12} style={{ verticalAlign: -2 }} /> Guardar como plantilla</button>
                <div style={{ marginLeft: 'auto' }}>
                  <button className="btn" disabled={ocupado || mapeosPorRevisar(mapeos).length > 0 || !datos?.filas?.length} onClick={generarVistaPrevia}>{ocupado ? 'Validando…' : 'Generar vista previa'} <ChevronRight size={14} style={{ verticalAlign: -3 }} /></button>
                </div>
              </div>
              {!datos?.filas?.length && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>No se pudieron releer las filas del archivo.</div>}
            </div>
          )}

          {paso === 'vista_previa' && lote && (
            <div>
              <div className="grid-kpis">
                <KPICard title="Válidos" value={resumen.validos} color="var(--green)" onClick={() => setFiltroRes(filtroRes === 'valido' ? '' : 'valido')} activo={filtroRes === 'valido'} />
                <KPICard title="Con advertencia" value={resumen.advertencias} color="var(--gold)" onClick={() => setFiltroRes(filtroRes === 'advertencia' ? '' : 'advertencia')} activo={filtroRes === 'advertencia'} />
                <KPICard title="Con error" value={resumen.errores} subtitle="No se cargan" color="var(--red)" onClick={() => setFiltroRes(filtroRes === 'error' ? '' : 'error')} activo={filtroRes === 'error'} />
                <KPICard title="Posibles duplicados" value={resumen.duplicados} color="var(--accent)" onClick={() => setFiltroRes(filtroRes === 'duplicado' ? '' : 'duplicado')} activo={filtroRes === 'duplicado'} />
              </div>
              <div style={{ margin: '10px 0' }}>
                <DataTable
                  columnas={[
                    { key: 'numero_fila', label: 'Fila', ancho: 60 },
                    { key: 'resultado', label: 'Resultado', filtro: true, valor: f => ETQ_RESULTADO[f.resultado], render: f => <StatusBadge estado={f.resultado === 'valido' ? 'ok' : f.resultado === 'advertencia' ? 'pendiente' : f.resultado === 'error' ? 'error' : 'sugerido'} label={ETQ_RESULTADO[f.resultado]} /> },
                    { key: 'datos', label: 'Datos normalizados', valor: f => Object.values(f.valores_normalizados ?? {}).slice(0, 4).join(' · '), sortable: false },
                    { key: 'mensajes', label: 'Observaciones', valor: f => (f.mensajes ?? []).map(m => m.motivo).join('; '), sortable: false },
                    { key: 'decision', label: 'Si ya existe', sortable: false, exportar: false, render: f => f.resultado === 'duplicado'
                      ? <select value={f.decision ?? form.politica} onChange={e => decidir(f.id, e.target.value)} onClick={e => e.stopPropagation()}><option value="omitir">Omitir</option><option value="combinar">Combinar</option><option value="crear_nuevo">Crear nuevo</option></select> : '—' },
                  ]}
                  filas={filasVisibles} filaKey="numero_fila" tamanoPagina={20} placeholderBusqueda="Buscar en la vista previa…" exportarNombre="vista_previa_importacion"
                  vacio={{ title: 'Sin filas', description: 'Ninguna fila coincide con el filtro.' }}
                  acciones={resumen.errores > 0 && <button className="btn o sm" onClick={descargarErrores}><Download size={12} style={{ verticalAlign: -2 }} /> Errores (CSV)</button>} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn o" onClick={() => setPaso('mapeo')}>Volver al mapeo</button>
                <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setPaso('confirmar')}>Continuar a confirmar <ChevronRight size={14} style={{ verticalAlign: -3 }} /></button>
              </div>
            </div>
          )}

          {paso === 'confirmar' && lote && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Confirmar y cargar</h3>
              {lote.estado === 'cargado' && carga && !carga.error ? (
                <div>
                  <div className="bd v" style={{ marginBottom: 8 }}>Lote cargado</div>
                  <p>Se cargaron <b>{carga.cargados ?? 0}</b> registros y se omitieron <b>{carga.omitidos ?? 0}</b>. Quedan marcados como «importado» con su origen. Puedes deshacer el lote desde el historial mientras ningún registro se modifique.</p>
                  <button className="btn" onClick={nuevaImportacion}>Importar otro archivo</button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13.5 }}>Archivo <b>{lote.archivo_nombre}</b> · {TIPOS_DATOS.find(t => t.id === lote.tipo_datos)?.etiqueta}. Se cargarán <b>{filasACargar(filas, form.politica).length}</b> de {filas.length} filas. Las filas con error no se cargan.</p>
                  <ul style={{ fontSize: 13, color: 'var(--muted)' }}>
                    <li>Política general de duplicados: <b>{{ omitir: 'Omitir', combinar: 'Combinar', crear_nuevo: 'Crear nuevo' }[form.politica]}</b>; en conflicto gana el dato existente (P-123).</li>
                    <li>Los campos clínicos importados quedan marcados «importado» para revisión del podólogo.</li>
                  </ul>
                  {carga?.error && <div className="card" style={{ padding: 10, borderLeft: '4px solid var(--red)', fontSize: 13 }}>La carga no terminó: {carga.error}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn o" disabled={ocupado || lote.estado === 'confirmado'} onClick={() => setPaso('vista_previa')}>Volver</button>
                    {lote.estado === 'confirmado'
                      ? <button className="btn" disabled={ocupado || !esAdmin} onClick={() => { setOcupado(true); ejecutarCarga(lote.id).finally(() => { setOcupado(false); refrescar() }) }}>Reintentar carga</button>
                      : <button className="btn" disabled={ocupado || !esAdmin || !usePermisoEscritura(puedeUsar)} onClick={confirmarCarga}>{ocupado ? 'Cargando…' : 'Confirmar y cargar'}</button>}
                  </div>
                  {!esAdmin && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>Solo un Administrador puede confirmar.</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'historial' && (
        <div style={{ marginTop: 12 }}>
          <EstadoConsulta q={historial} />
          {!historial.isLoading && !historial.isError && !historial.data?.aviso && (
            <DataTable
              columnas={[
                { key: 'created_at', label: 'Fecha', valor: l => l.created_at, render: l => fechaHora(l.created_at) },
                { key: 'archivo_nombre', label: 'Archivo' },
                { key: 'tipo_datos', label: 'Tipo', filtro: true, valor: l => TIPOS_DATOS.find(t => t.id === l.tipo_datos)?.etiqueta ?? l.tipo_datos },
                { key: 'estado', label: 'Estado', filtro: true, render: l => <StatusBadge estado={l.estado === 'cargado' ? 'ok' : l.estado} label={l.estado.replace(/_/g, ' ')} /> },
                { key: 'total_filas', label: 'Filas', align: 'right' },
                { key: 'validos', label: 'Válidas', align: 'right' },
                { key: 'errores', label: 'Errores', align: 'right' },
                { key: 'duplicados', label: 'Duplic.', align: 'right' },
                { key: 'ia_modo', label: 'IA', valor: l => ({ sintetico: 'Simulada', activo: 'Activa', no_configurado: 'Sin IA' })[l.ia_modo] },
                { key: 'acc', label: '', sortable: false, exportar: false, render: l => (
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button className="btn o sm" onClick={() => setDetalle(l)}>Detalle</button>
                    {['mapeo_propuesto', 'vista_previa', 'confirmado'].includes(l.estado) && <button className="btn o sm" disabled={!puedeUsar} onClick={() => reanudar(l)}>Reanudar</button>}
                    {['subido', 'mapeo_propuesto', 'vista_previa', 'error'].includes(l.estado) && <button className="btn o sm" disabled={!puedeUsar} onClick={() => descartar(l)}>Descartar</button>}
                    {l.estado === 'cargado' && <button className="btn red sm" disabled={!esAdmin} onClick={() => deshacer(l)}><Undo2 size={12} style={{ verticalAlign: -2 }} /> Deshacer</button>}
                  </div>) },
              ]}
              filas={historial.data?.data ?? []} exportarNombre="importaciones"
              vacio={{ title: 'Sin importaciones', description: 'Aún no has importado datos.', icon: History }} />
          )}
        </div>
      )}

      <Modal open={!!detalle} onClose={() => setDetalle(null)} title={`Lote · ${detalle?.archivo_nombre ?? ''}`} size="wide" footer={<button className="btn" onClick={() => setDetalle(null)}>Cerrar</button>}>
        {detalle && <DetalleLote lote={detalle} />}
      </Modal>
      {dialogo}
    </div>
  )
}

// el usuario necesita escritura (la clínica no está en solo lectura): importar.usar ya la exige; se mantiene explícito
function usePermisoEscritura(p) { return p }

function DetalleLote({ lote }) {
  const mapeos = useDatos(['imp-det-m', lote.id], () => leer('prp_importacion_mapeos', { sedeCol: false, filtros: { importacion_id: lote.id }, limite: 500 }))
  const filas = useDatos(['imp-det-f', lote.id], () => leer('prp_importacion_filas', { sedeCol: false, filtros: { importacion_id: lote.id, resultado: ['error', 'duplicado', 'advertencia'] }, orden: { columna: 'numero_fila' }, limite: 300 }))
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
        <span>Tipo: <b>{lote.tipo_datos}</b></span><span>Duplicados: <b>{lote.politica_duplicados}</b></span><span>IA: <b>{lote.ia_modo}</b> {lote.ia_proveedor}</span>
        {lote.confirmado_en && <span>Confirmado: {fechaHora(lote.confirmado_en)}</span>}{lote.cargado_en && <span>Cargado: {fechaHora(lote.cargado_en)}</span>}{lote.revertido_en && <span>Revertido: {fechaHora(lote.revertido_en)}</span>}
      </div>
      <h4>Mapeo</h4>
      <DataTable buscador={false} sinPaginacion compacto filas={mapeos.data?.data ?? []} cargando={mapeos.isLoading}
        columnas={[{ key: 'columna_archivo', label: 'Columna' }, { key: 'campo_destino', label: 'Destino' }, { key: 'confianza', label: 'Confianza', align: 'right' }, { key: 'accion', label: 'Decisión' }]} vacio={{ title: 'Sin mapeo' }} />
      <h4>Filas con observaciones (máx. 300)</h4>
      <DataTable buscador={false} compacto filas={filas.data?.data ?? []} cargando={filas.isLoading} filaKey="numero_fila"
        columnas={[{ key: 'numero_fila', label: 'Fila' }, { key: 'resultado', label: 'Resultado' }, { key: 'm', label: 'Motivo', valor: f => (f.mensajes ?? []).map(m => m.motivo).join('; ') }]} vacio={{ title: 'Sin observaciones' }} />
    </div>
  )
}
