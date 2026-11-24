// 45 · Configuración de la clínica y sedes. Clon de IRP Configuracion.jsx + Catalogos.jsx + LogoEditable adaptado a este esquema.
// Pestañas: Clínica (datos fiscales, logo, emisor CFDI y certificado), Sedes (cabinas, horarios, festivos), Parámetros (REGLAS_NEGOCIO,
// solo con parametro_actualizar), Plantillas (aviso y consentimiento, versionadas) y Catálogos. Migraciones 001, 010, 022, 027, 057.
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Save, RotateCcw, Plus, Upload } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { supabase } from '../../../lib/supabase'
import { leer, insertar, actualizar, borrar, rpc } from '../../../lib/api'
import { urlFirmada, rutaStorage, BUCKETS } from '../../../lib/urlFirmada'
import { fecha } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import EmptyState from '../../../components/ui/EmptyState'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useDatos, errMsg, EstadoConsulta } from './comun'

const REGIMENES = ['601 General de Ley Personas Morales', '603 Personas Morales con Fines no Lucrativos', '605 Sueldos y Salarios', '606 Arrendamiento', '612 Personas Físicas con Actividades Empresariales', '621 Incorporación Fiscal', '626 Régimen Simplificado de Confianza']
const ZONAS = ['America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Merida', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Tijuana']
const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [7, 'Domingo']]

// ───────────────────────────── Clínica ─────────────────────────────
function TabClinica({ puede }) {
  const { organizacion } = useApp()
  const qc = useQueryClient()
  const cfg = useDatos(['cfg-clinica'], () => leer('prp_configuracion_clinica', { sedeCol: false, limite: 1 }))
  const emisor = useDatos(['cfg-emisor'], () => leer('emisor_fiscal', { sedeCol: false, orden: { columna: 'serie' }, limite: 10 }))
  const pac = useDatos(['cfg-pac'], () => leer('pac_configuracion', { sedeCol: false, limite: 1 }))
  const [f, setF] = useState(null)
  const [logo, setLogo] = useState(null)
  const [e, setE] = useState(null)
  const [csd, setCsd] = useState({ vigencia: '' })
  useEffect(() => { const o = cfg.data?.data?.[0]; if (o && !f) setF({ nombre: o.nombre ?? '', razon_social: o.razon_social ?? '', rfc: o.rfc ?? '', regimen_fiscal: o.regimen_fiscal ?? '', codigo_postal: o.codigo_postal ?? '', zona_horaria: o.zona_horaria ?? 'America/Mexico_City', logo_url: o.logo_url ?? null }) }, [cfg.data])
  useEffect(() => { const x = emisor.data?.data?.[0]; setE(x ? { ...x } : { rfc: '', razon_social: '', regimen_fiscal: '', codigo_postal: '', serie: 'A' }) }, [emisor.data])
  useEffect(() => { setCsd({ vigencia: pac.data?.data?.[0]?.csd_vigencia ?? '' }) }, [pac.data])
  useEffect(() => { let vivo = true; if (f?.logo_url) urlFirmada(BUCKETS.logos, f.logo_url).then(u => vivo && setLogo(u)); return () => { vivo = false } }, [f?.logo_url])

  if (cfg.isLoading || emisor.isLoading) return <EstadoConsulta q={cfg} />
  if (cfg.isError || cfg.data?.aviso) return <EstadoConsulta q={cfg} />
  if (!f) return <EmptyState title="Sin datos de la clínica" description="No se encontró la organización." />

  async function guardar() {
    if (f.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(f.rfc.toUpperCase())) return toast.error('RFC con formato inválido')
    const r = await actualizar('organizaciones', organizacion.id, { nombre: f.nombre, razon_social: f.razon_social || null, rfc: f.rfc ? f.rfc.toUpperCase() : null, regimen_fiscal: f.regimen_fiscal || null, codigo_postal: f.codigo_postal || null, zona_horaria: f.zona_horaria, logo_url: f.logo_url })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Datos de la clínica guardados'), qc.invalidateQueries({ queryKey: ['cfg-clinica'] }))
  }
  async function subirLogo(file) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error('El logo pesa más de 2 MB')
    const ruta = rutaStorage(organizacion.id, `logo_${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`)
    const { error } = await supabase.storage.from(BUCKETS.logos).upload(ruta, file, { upsert: true })
    if (error) return toast.error(`No se pudo subir: ${error.message}`)
    setF(x => ({ ...x, logo_url: ruta })); toast.success('Logo subido; guarda para aplicarlo')
  }
  async function guardarEmisor() {
    if (e.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(e.rfc.toUpperCase())) return toast.error('RFC del emisor inválido')
    const cuerpo = { rfc: e.rfc?.toUpperCase() || null, razon_social: e.razon_social || null, regimen_fiscal: e.regimen_fiscal || null, codigo_postal: e.codigo_postal || null }
    const r = e.id ? await actualizar('emisor_fiscal', e.id, cuerpo) : await insertar('emisor_fiscal', { ...cuerpo, serie: e.serie || 'A' })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Emisor CFDI guardado'), qc.invalidateQueries({ queryKey: ['cfg-emisor'] }))
  }
  async function subirCer(file) {
    if (!file) return
    if (!/\.cer$/i.test(file.name)) return toast.error('Selecciona el archivo .cer del CSD')
    const ruta = rutaStorage(organizacion.id, 'csd', 'emisor.cer')
    const up = await supabase.storage.from(BUCKETS.documentos).upload(ruta, file, { upsert: true })
    if (up.error) return toast.error(up.error.message)
    const actual = pac.data?.data?.[0]
    const r = actual ? await actualizar('pac_configuracion', actual.id, { csd_cer_path: ruta, csd_vigencia: csd.vigencia || null }) : await insertar('pac_configuracion', { csd_cer_path: ruta, csd_vigencia: csd.vigencia || null })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Certificado (.cer) guardado'), qc.invalidateQueries({ queryKey: ['cfg-pac'] }))
  }

  const p = pac.data?.data?.[0]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Datos de la clínica (fiscales)</h3>
        <div className="grid2">
          <FormField label="Nombre comercial" required value={f.nombre} onChange={x => setF({ ...f, nombre: x.target.value })} disabled={!puede} />
          <FormField label="Razón social" value={f.razon_social} onChange={x => setF({ ...f, razon_social: x.target.value })} disabled={!puede} />
          <FormField label="RFC" value={f.rfc} onChange={x => setF({ ...f, rfc: x.target.value.toUpperCase() })} disabled={!puede} />
          <FormField label="Régimen fiscal" as="select" value={f.regimen_fiscal} onChange={x => setF({ ...f, regimen_fiscal: x.target.value })} disabled={!puede} options={REGIMENES.map(r => ({ value: r.slice(0, 3), label: r }))} />
          <FormField label="Código postal fiscal" value={f.codigo_postal} onChange={x => setF({ ...f, codigo_postal: x.target.value.replace(/\D/g, '').slice(0, 5) })} disabled={!puede} />
          <FormField label="Zona horaria" as="select" value={f.zona_horaria} onChange={x => setF({ ...f, zona_horaria: x.target.value })} disabled={!puede} options={ZONAS.map(z => ({ value: z, label: z }))} hint="Todas las fechas y horas se muestran en esta zona." />
        </div>
        <div className="field">
          <label>Logo (PNG, JPG, SVG o WebP · máx. 2 MB)</label>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {logo ? <img src={logo} alt="Logo de la clínica" style={{ height: 56, maxWidth: 160, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }} /> : <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--row-line)', display: 'grid', placeItems: 'center' }}><Building2 size={22} /></div>}
            <label className="btn o sm" style={{ cursor: puede ? 'pointer' : 'not-allowed' }}><Upload size={12} style={{ verticalAlign: -2 }} /> Cambiar logo<input type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={!puede} onChange={x => subirLogo(x.target.files?.[0])} /></label>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><button className="btn" disabled={!puede} onClick={guardar}><Save size={14} style={{ verticalAlign: -2 }} /> Guardar</button></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Facturación CFDI · emisor</h3>
        <div className="grid2">
          <FormField label="RFC del emisor" value={e?.rfc ?? ''} onChange={x => setE({ ...e, rfc: x.target.value.toUpperCase() })} disabled={!puede} />
          <FormField label="Razón social del emisor" value={e?.razon_social ?? ''} onChange={x => setE({ ...e, razon_social: x.target.value })} disabled={!puede} />
          <FormField label="Régimen fiscal" value={e?.regimen_fiscal ?? ''} onChange={x => setE({ ...e, regimen_fiscal: x.target.value })} disabled={!puede} />
          <FormField label="Lugar de expedición (CP)" value={e?.codigo_postal ?? ''} onChange={x => setE({ ...e, codigo_postal: x.target.value })} disabled={!puede} />
          <FormField label="Serie" value={e?.serie ?? 'A'} disabled hint={e?.id ? `Folio actual: ${e.folio_actual} (nunca se reinicia, P-133)` : 'Se crea con la serie A'} />
        </div>
        <button className="btn o" disabled={!puede} onClick={guardarEmisor}><Save size={14} style={{ verticalAlign: -2 }} /> Guardar emisor</button>
        <h4 style={{ marginBottom: 6 }}>Certificado de sello digital (CSD)</h4>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>Solo se guarda la ruta del .cer en un bucket privado. El archivo .key y su contraseña nunca viven en la base ni en el navegador: se cargan por canal seguro del servidor (pendiente, junto con el PAC).</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <span>Modo del PAC: <StatusBadge estado={p?.modo === 'produccion' ? 'ok' : 'pendiente'} label={p?.modo ?? 'no configurado'} /></span>
          <span>Certificado: <b>{p?.csd_cer_path ? 'cargado' : 'sin cargar'}</b></span>
          <FormField label="Vigencia" type="date" value={csd.vigencia} onChange={x => setCsd({ vigencia: x.target.value })} disabled={!puede} style={{ margin: 0 }} />
          <label className="btn o sm" style={{ cursor: puede ? 'pointer' : 'not-allowed' }}>Subir .cer<input type="file" hidden accept=".cer" disabled={!puede} onChange={x => subirCer(x.target.files?.[0])} /></label>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Sedes ─────────────────────────────
function SedeModal({ sede, puede, onClose, onGuardado }) {
  const { organizacion } = useApp()
  const [tab, setTab] = useState('datos')
  const [f, setF] = useState({ clave: sede.clave ?? '', nombre: sede.nombre ?? '', direccion: sede.direccion ?? '', telefono: sede.telefono ?? '', activa: sede.activa ?? true })
  const nueva = !sede.id
  const qc = useQueryClient()
  const cabinas = useDatos(['cfg-cab', sede.id], () => (nueva ? { data: [] } : leer('cabinas', { sedeCol: false, filtros: { sede_id: sede.id }, orden: { columna: 'nombre' }, limite: 100 })))
  const horarios = useDatos(['cfg-hor', sede.id], () => (nueva ? { data: [] } : leer('horarios_atencion', { sedeCol: false, filtros: { sede_id: sede.id, podologo_id: null, activo: true }, orden: [{ columna: 'dia_semana' }, { columna: 'hora_inicio' }], limite: 100 })))
  const festivos = useDatos(['cfg-fes', sede.id], () => (nueva ? { data: [] } : leer('festivos', { sedeCol: false, orden: { columna: 'fecha' }, limite: 200 })))
  const [cab, setCab] = useState('')
  const [h, setH] = useState({ dia: 1, ini: '09:00', fin: '18:00' })
  const [fe, setFe] = useState({ fecha: '', nombre: '', abre: false, todas: false })

  async function guardar() {
    if (!f.clave.trim() || !f.nombre.trim()) return toast.error('Clave y nombre son obligatorios')
    const cuerpo = { clave: f.clave.trim().toUpperCase(), nombre: f.nombre.trim(), direccion: f.direccion || null, telefono: f.telefono || null, activa: f.activa }
    const r = nueva ? await insertar('sedes', cuerpo) : await actualizar('sedes', sede.id, cuerpo)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Sede guardada'); onGuardado(r.data)
  }
  const ref = k => qc.invalidateQueries({ queryKey: [k, sede.id] })
  async function addCabina() { if (!cab.trim()) return; const r = await insertar('cabinas', { sede_id: sede.id, nombre: cab.trim() }); r.error ? toast.error(errMsg(r.error)) : (setCab(''), ref('cfg-cab')) }
  async function toggleCabina(c) { const r = await actualizar('cabinas', c.id, { activa: !c.activa }); r.error ? toast.error(errMsg(r.error)) : ref('cfg-cab') }
  async function addHorario() {
    if (h.fin <= h.ini) return toast.error('La hora de fin debe ser posterior a la de inicio')
    const r = await insertar('horarios_atencion', { sede_id: sede.id, dia_semana: Number(h.dia), hora_inicio: h.ini, hora_fin: h.fin })
    r.error ? toast.error(errMsg(r.error)) : ref('cfg-hor')
  }
  async function quitarHorario(x) { const r = await actualizar('horarios_atencion', x.id, { activo: false }); r.error ? toast.error(errMsg(r.error)) : ref('cfg-hor') }
  async function addFestivo() {
    if (!fe.fecha || !fe.nombre.trim()) return toast.error('Fecha y nombre requeridos')
    const r = await insertar('festivos', { sede_id: fe.todas ? null : sede.id, fecha: fe.fecha, nombre: fe.nombre.trim(), abre: fe.abre })
    r.error ? toast.error(errMsg(r.error)) : (setFe({ fecha: '', nombre: '', abre: false, todas: false }), ref('cfg-fes'))
  }
  async function quitarFestivo(x) { const r = await borrar('festivos', x.id); r.error ? toast.error(errMsg(r.error)) : ref('cfg-fes') }

  return (
    <Modal open onClose={onClose} title={nueva ? 'Nueva sede' : `Sede · ${sede.nombre}`} size="wide" footer={<><button className="btn o" onClick={onClose}>Cerrar</button>{tab === 'datos' && <button className="btn" disabled={!puede} onClick={guardar}>Guardar</button>}</>}>
      {!nueva && <Tabs value={tab} onChange={setTab} items={[{ id: 'datos', label: 'Datos' }, { id: 'cabinas', label: 'Cabinas', badge: cabinas.data?.data?.length }, { id: 'horario', label: 'Horario de atención' }, { id: 'festivos', label: 'Festivos' }]} />}
      <div style={{ marginTop: 10 }}>
        {tab === 'datos' && (
          <div className="grid2">
            <FormField label="Clave" required value={f.clave} onChange={x => setF({ ...f, clave: x.target.value })} disabled={!puede || !nueva} hint="Prefijo de folios (p. ej. CEN). No se cambia después." />
            <FormField label="Nombre" required value={f.nombre} onChange={x => setF({ ...f, nombre: x.target.value })} disabled={!puede} />
            <FormField label="Dirección" value={f.direccion} onChange={x => setF({ ...f, direccion: x.target.value })} disabled={!puede} />
            <FormField label="Teléfono" value={f.telefono} onChange={x => setF({ ...f, telefono: x.target.value })} disabled={!puede} />
            <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.activa} onChange={x => setF({ ...f, activa: x.target.checked })} disabled={!puede} /> Sede activa</label>
          </div>
        )}
        {tab === 'cabinas' && (<>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}><input placeholder="Nombre de la cabina (p. ej. Cabina 1)" value={cab} onChange={x => setCab(x.target.value)} /><button className="btn" disabled={!puede} onClick={addCabina}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button></div>
          <DataTable buscador={false} sinPaginacion compacto filas={cabinas.data?.data ?? []} cargando={cabinas.isLoading} vacio={{ title: 'Sin cabinas', description: 'Agrega las cabinas de atención de esta sede.' }}
            columnas={[{ key: 'nombre', label: 'Cabina' }, { key: 'activa', label: 'Estado', render: c => <StatusBadge estado={c.activa ? 'activo' : 'inactivo'} /> }, { key: 'a', label: '', sortable: false, render: c => <button className="btn o sm" disabled={!puede} onClick={() => toggleCabina(c)}>{c.activa ? 'Desactivar' : 'Activar'}</button> }]} />
        </>)}
        {tab === 'horario' && (<>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select value={h.dia} onChange={x => setH({ ...h, dia: x.target.value })}>{DIAS.map(([n, d]) => <option key={n} value={n}>{d}</option>)}</select>
            <input type="time" value={h.ini} onChange={x => setH({ ...h, ini: x.target.value })} /><input type="time" value={h.fin} onChange={x => setH({ ...h, fin: x.target.value })} />
            <button className="btn" disabled={!puede} onClick={addHorario}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar bloque</button>
          </div>
          <DataTable buscador={false} sinPaginacion compacto filas={horarios.data?.data ?? []} cargando={horarios.isLoading} vacio={{ title: 'Sin horario', description: 'Sin horario no se pueden agendar citas en esta sede.' }}
            columnas={[{ key: 'dia_semana', label: 'Día', valor: x => DIAS.find(d => d[0] === x.dia_semana)?.[1] }, { key: 'hora_inicio', label: 'Desde', valor: x => x.hora_inicio?.slice(0, 5) }, { key: 'hora_fin', label: 'Hasta', valor: x => x.hora_fin?.slice(0, 5) }, { key: 'a', label: '', sortable: false, render: x => <button className="btn red sm" disabled={!puede} onClick={() => quitarHorario(x)}>Quitar</button> }]} />
        </>)}
        {tab === 'festivos' && (<>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={fe.fecha} onChange={x => setFe({ ...fe, fecha: x.target.value })} /><input placeholder="Nombre del festivo" value={fe.nombre} onChange={x => setFe({ ...fe, nombre: x.target.value })} />
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={fe.abre} onChange={x => setFe({ ...fe, abre: x.target.checked })} /> La sede abre</label>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={fe.todas} onChange={x => setFe({ ...fe, todas: x.target.checked })} /> Todas las sedes</label>
            <button className="btn" disabled={!puede} onClick={addFestivo}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button>
          </div>
          <DataTable buscador={false} compacto filas={(festivos.data?.data ?? []).filter(x => !x.sede_id || x.sede_id === sede.id)} cargando={festivos.isLoading} vacio={{ title: 'Sin festivos' }}
            columnas={[{ key: 'fecha', label: 'Fecha', render: x => fecha(x.fecha) }, { key: 'nombre', label: 'Nombre' }, { key: 'alcance', label: 'Alcance', valor: x => (x.sede_id ? 'Esta sede' : 'Todas') }, { key: 'abre', label: 'Abre', valor: x => (x.abre ? 'Sí' : 'No') }, { key: 'a', label: '', sortable: false, render: x => <button className="btn red sm" disabled={!puede} onClick={() => quitarFestivo(x)}>Quitar</button> }]} />
        </>)}
      </div>
    </Modal>
  )
}

function TabSedes({ puede }) {
  const [sel, setSel] = useState(null)
  const qc = useQueryClient()
  const sedes = useDatos(['cfg-sedes'], () => leer('sedes', { sedeCol: false, orden: { columna: 'nombre' }, limite: 200 }))
  return (<>
    <div style={{ marginBottom: 10 }}><button className="btn" disabled={!puede} onClick={() => setSel({})}><Plus size={14} style={{ verticalAlign: -2 }} /> Nueva sede</button></div>
    <EstadoConsulta q={sedes} />
    {!sedes.isLoading && !sedes.isError && <DataTable exportarNombre="sedes" filas={sedes.data?.data ?? []} onFila={setSel} vacio={{ title: 'Sin sedes', description: 'Crea la primera sede.' }}
      columnas={[{ key: 'clave', label: 'Clave' }, { key: 'nombre', label: 'Nombre' }, { key: 'direccion', label: 'Dirección' }, { key: 'telefono', label: 'Teléfono' }, { key: 'activa', label: 'Estado', filtro: true, valor: s => (s.activa ? 'Activa' : 'Inactiva'), render: s => <StatusBadge estado={s.activa ? 'activo' : 'inactivo'} /> }]} />}
    {sel && <SedeModal sede={sel} puede={puede} onClose={() => setSel(null)} onGuardado={() => { setSel(null); qc.invalidateQueries({ queryKey: ['cfg-sedes'] }) }} />}
  </>)
}

// ───────────────────────────── Parámetros ─────────────────────────────
const ETIQ_PARAM = {
  cancelacion_horas_aviso: ['Citas', 'Horas de aviso para cancelar sin costo'], anticipo_pct: ['Citas', 'Anticipo (%)'], anticipo_activo: ['Citas', 'Cobrar anticipo'],
  reprogramaciones_sin_costo: ['Citas', 'Reprogramaciones sin costo'], retencion_horario_min: ['Citas', 'Retención del horario al reservar (min)'], recordatorio_horas: ['Citas', 'Recordatorio (horas antes)'],
  recordatorio_segundo_aviso_activo: ['Citas', 'Segundo aviso de recordatorio'], tolerancia_no_asistio_min: ['Citas', 'Tolerancia para «no asistió» (min)'], margen_entre_citas_min: ['Citas', 'Margen entre citas (min)'],
  sobrecupo_max_por_podologo_dia: ['Citas', 'Sobrecupo máximo por podólogo y día'], 'lista_espera.ventana_min': ['Lista de espera', 'Ventana de aviso (min)'], 'lista_espera.vence_dias': ['Lista de espera', 'Vence a los (días)'],
  'videoconsulta.entrada_min': ['Videoconsulta', 'Entrada anticipada (min)'], 'videoconsulta.tope_min': ['Videoconsulta', 'Duración máxima (min)'], 'videoconsulta.graba': ['Videoconsulta', 'Grabar sesión'],
  plan_abandonado_dias: ['Clínico', 'Plan abandonado tras (días)'], queja_plazo_resolucion_dias: ['Clínico', 'Plazo de resolución de queja (días)'], 'fotos.max_por_sesion': ['Clínico', 'Fotos máximas por sesión'],
  'fotos.mb_max': ['Clínico', 'Tamaño máximo de foto (MB)'], 'fotos.px_max': ['Clínico', 'Lado máximo de foto (px)'], inactivo_dias: ['Clínico', 'Paciente inactivo tras (días)'],
  descuento_recepcion_pct_max: ['Ventas', 'Descuento máximo de Recepción (%)'], 'iva.servicios_clinicos': ['Ventas', 'IVA servicios clínicos (%)'], 'iva.productos': ['Ventas', 'IVA productos (%)'],
  'iva.precios_con_iva_incluido': ['Ventas', 'Precios con IVA incluido'], 'iva.tasa_general': ['Ventas', 'Tasa general de IVA (%)'], corte_caja_tolerancia: ['Ventas', 'Tolerancia en corte de caja ($)'], plazo_facturar: ['Ventas', 'Plazo para facturar'],
  vigencia_plan_laser_meses: ['Ventas', 'Vigencia de planes láser (meses)'], aviso_vencimiento_plan_dias: ['Ventas', 'Aviso de vencimiento de plan (días)'], plantilla_anticipo_pct: ['Ventas', 'Anticipo de plantillas (%)'],
  estudio_pisada_acreditable_dias: ['Ventas', 'Estudio de pisada acreditable (días)'], compra_autorizacion_monto: ['Compras y gastos', 'Compra que exige autorización ($)'], gasto_comprobante_fiscal_desde: ['Compras y gastos', 'Gasto con comprobante fiscal desde ($)'],
  'semana_corte.inicio': ['Finanzas', 'Inicio de la semana de corte'], 'semana_corte.fin': ['Finanzas', 'Fin de la semana de corte'], meta_ocupacion_pct: ['Finanzas', 'Meta de ocupación (%)'], mantenimiento_urgente_max: ['Equipo', 'Tope de mantenimiento urgente sin autorizar ($)'],
  vacaciones_dias_primer_anio: ['Equipo', 'Vacaciones del primer año (días)'], 'rh.tolerancia_retardo_min': ['Equipo', 'Tolerancia de retardo (min)'], 'rh.retardo_umbral_min': ['Equipo', 'Retardo cuenta como falta tras (min)'], 'rh.incidencias_que_descuentan': ['Equipo', 'Incidencias que descuentan (separadas por coma)'],
  'seguridad.sesion_min': ['Seguridad', 'Sesión (min)'], 'seguridad.intentos_fallidos_max': ['Seguridad', 'Intentos fallidos antes de bloquear'], 'seguridad.bloqueo_min': ['Seguridad', 'Bloqueo (min)'],
  'seguridad.dos_fa_administradores': ['Seguridad', 'Exigir 2FA a administradores'], 'seguridad.login_google': ['Seguridad', 'Inicio de sesión con Google'],
  'ia.modo': ['IA', 'Modo de IA (lo fija la llave del servidor)'], 'ia.umbral_confianza_importacion': ['IA', 'Umbral de confianza en importación (%)'],
  retencion_expediente_bitacora_anios: ['Privacidad', 'Retención de expediente y bitácora (años)'], arco_plazo_dias: ['Privacidad', 'Plazo de solicitudes ARCO (días)'],
  'encuesta.espera_horas': ['Encuestas', 'Espera tras la cita (horas)'], 'encuesta.intervalo_dias': ['Encuestas', 'Una por paciente cada (días)'], 'encuesta.nps_alerta_max': ['Encuestas', 'Alerta con NPS menor o igual a'],
  almacenamiento_cuota_gb: ['Plataforma', 'Cuota de almacenamiento (GB)'], almacenamiento_aviso_pct: ['Plataforma', 'Aviso de almacenamiento (%)'], prueba_dias: ['Plataforma', 'Días de prueba'], gracia_dias: ['Plataforma', 'Días de gracia'],
  serie_factura: ['Facturación', 'Serie de factura'], folio_factura_inicial: ['Facturación', 'Folio inicial de factura'],
}
const hojas = (obj, pref = '') => Object.entries(obj ?? {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? hojas(v, `${pref}${k}.`) : [[`${pref}${k}`, v]]))
const getRuta = (o, r) => r.split('.').reduce((a, k) => a?.[k], o)

function TabParametros({ puede }) {
  const qc = useQueryClient()
  const cfg = useDatos(['cfg-clinica'], () => leer('prp_configuracion_clinica', { sedeCol: false, limite: 1 }))
  const def = useDatos(['cfg-defaults'], () => rpc('parametros_default'))
  const [vals, setVals] = useState({})
  const actual = cfg.data?.data?.[0]?.parametros ?? {}
  const valores = def.data?.data ?? {}
  const lista = useMemo(() => hojas(valores), [valores])
  const grupos = useMemo(() => {
    const g = {}
    for (const [ruta, d] of lista) { const [seccion, etq] = ETIQ_PARAM[ruta] ?? ['Otros', ruta]; (g[seccion] ??= []).push({ ruta, etq, d }) }
    return g
  }, [lista])
  if (cfg.isLoading || def.isLoading) return <EstadoConsulta q={cfg} />
  if (cfg.isError || def.isError) return <EstadoConsulta q={cfg.isError ? cfg : def} />

  const valorActual = ruta => (ruta in vals ? vals[ruta] : getRuta(actual, ruta) ?? getRuta(valores, ruta))
  async function guardar(ruta, d) {
    let v = valorActual(ruta)
    if (Array.isArray(d)) v = String(v).split(',').map(s => s.trim()).filter(Boolean)
    else if (typeof d === 'number') { v = Number(v); if (!Number.isFinite(v) || v < 0) return toast.error('Escribe un número válido (no negativo)') }
    const r = await rpc('parametro_actualizar', { p_ruta: ruta, p_valor: v })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Parámetro guardado'); setVals(({ [ruta]: _, ...resto }) => resto); qc.invalidateQueries({ queryKey: ['cfg-clinica'] })
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ padding: '8px 12px', fontSize: 12.5 }}>Un cambio de parámetro aplica a lo nuevo; lo ya emitido (tickets, CFDI, comisiones cerradas) no se modifica. Cada cambio queda en la bitácora con el valor anterior.</div>
      {Object.entries(grupos).map(([sec, items]) => (
        <div key={sec} className="card">
          <h3 style={{ marginTop: 0 }}>{sec}</h3>
          <div className="tabla-wrap"><table>
            <thead><tr><th>Parámetro</th><th>Valor</th><th>Por defecto</th><th /></tr></thead>
            <tbody>{items.map(({ ruta, etq, d }) => {
              const v = valorActual(ruta), sucio = ruta in vals
              const actualGuardado = getRuta(actual, ruta)
              return (
                <tr key={ruta}>
                  <td>{etq}<div style={{ fontSize: 10.5, color: 'var(--muted)' }}><code>{ruta}</code></div></td>
                  <td>
                    {typeof d === 'boolean' ? <input type="checkbox" checked={!!v} disabled={!puede} onChange={e => setVals({ ...vals, [ruta]: e.target.checked })} />
                      : <input value={Array.isArray(v) ? v.join(', ') : v ?? ''} disabled={!puede || ruta === 'ia.modo'} type={typeof d === 'number' ? 'number' : 'text'} min={0} onChange={e => setVals({ ...vals, [ruta]: e.target.value })} style={{ width: 200 }} />}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{Array.isArray(d) ? d.join(', ') : typeof d === 'boolean' ? (d ? 'Sí' : 'No') : String(d)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" disabled={!puede || !sucio || ruta === 'ia.modo'} onClick={() => guardar(ruta, d)}>Guardar</button>{' '}
                    <button className="btn o sm" title="Restablecer al valor por defecto" disabled={!puede || JSON.stringify(actualGuardado) === JSON.stringify(d) || ruta === 'ia.modo'} onClick={async () => { const r = await rpc('parametro_actualizar', { p_ruta: ruta, p_valor: d }); r.error ? toast.error(errMsg(r.error)) : (toast.success('Restablecido'), setVals(({ [ruta]: _, ...resto }) => resto), qc.invalidateQueries({ queryKey: ['cfg-clinica'] })) }}><RotateCcw size={12} /></button>
                  </td>
                </tr>)
            })}</tbody>
          </table></div>
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────── Plantillas ─────────────────────────────
const TIPOS_PLANTILLA = { recordatorio_cita: 'Recordatorio de cita', confirmacion_reserva: 'Confirmación de reserva', aviso_privacidad: 'Aviso de privacidad', consentimiento_datos_salud: 'Consentimiento de datos de salud', consentimiento_procedimiento: 'Consentimiento de procedimiento', autorizacion_fotos: 'Autorización de fotos', autorizacion_fotos_docencia: 'Autorización de fotos (docencia)', consentimiento_telemedicina: 'Consentimiento de telemedicina', consentimiento_dictado_ia: 'Consentimiento de dictado con IA', consentimiento_grabacion: 'Consentimiento de grabación', terminos_reserva: 'Términos de reserva', mensaje_campana: 'Mensaje de campaña', impreso_consentimiento: 'Impreso · consentimiento', impreso_antecedentes: 'Impreso · antecedentes', impreso_seguimiento: 'Impreso · seguimiento', impreso_historia_completa: 'Impreso · historia completa', impreso_en_blanco: 'Impreso en blanco', receta_indicaciones: 'Receta e indicaciones', carta_referencia: 'Carta de referencia', constancia: 'Constancia' }

function TabPlantillas({ puede }) {
  const qc = useQueryClient()
  const { confirmar, dialogo } = useConfirmacion()
  const lista = useDatos(['cfg-plantillas'], () => leer('plantillas_documento', { sedeCol: false, orden: [{ columna: 'codigo' }, { columna: 'version', asc: false }], limite: 500 }))
  const [ed, setEd] = useState(null)
  const ref = () => qc.invalidateQueries({ queryKey: ['cfg-plantillas'] })
  async function guardar() {
    if (!ed.nombre.trim() || !ed.contenido.trim()) return toast.error('Nombre y contenido son obligatorios')
    const vars = [...new Set([...ed.contenido.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]))]
    const cuerpo = { nombre: ed.nombre, contenido: ed.contenido, variables: vars, forma_aceptacion: ed.forma_aceptacion, cambia_finalidades: !!ed.cambia_finalidades }
    const r = ed.id ? await actualizar('plantillas_documento', ed.id, cuerpo) : await insertar('plantillas_documento', { ...cuerpo, codigo: ed.codigo, tipo: ed.tipo, version: 1, estado: 'borrador' })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Plantilla guardada'), setEd(null), ref())
  }
  async function nuevaVersion(p) {
    const max = Math.max(...(lista.data?.data ?? []).filter(x => x.codigo === p.codigo).map(x => x.version))
    const r = await insertar('plantillas_documento', { codigo: p.codigo, tipo: p.tipo, nombre: p.nombre, version: max + 1, estado: 'borrador', contenido: p.contenido, variables: p.variables, forma_aceptacion: p.forma_aceptacion, cambia_finalidades: p.cambia_finalidades })
    r.error ? toast.error(errMsg(r.error)) : (toast.success(`Versión ${max + 1} creada en borrador`), ref())
  }
  async function cambiarEstado(p, estado) {
    const msg = estado === 'activa' ? `La versión ${p.version} pasa a ser la vigente; la anterior se archiva.${p.cambia_finalidades ? ' Cambia finalidades: se pedirá nueva firma (P-140).' : ''}` : 'Se archiva y no se podrá reactivar.'
    if (!(await confirmar({ titulo: estado === 'activa' ? 'Activar plantilla' : 'Archivar plantilla', mensaje: msg, textoConfirmar: estado === 'activa' ? 'Activar' : 'Archivar', peligro: estado === 'archivada' }))) return
    const r = await actualizar('plantillas_documento', p.id, { estado })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Estado actualizado'), ref())
  }
  return (<>
    <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn" disabled={!puede} onClick={() => setEd({ codigo: '', tipo: 'aviso_privacidad', nombre: '', contenido: '', forma_aceptacion: 'firma_pantalla' })}><Plus size={14} style={{ verticalAlign: -2 }} /> Nueva plantilla</button>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Una plantilla activa no se edita: se crea una nueva versión (P-139). Los textos finales los valida un abogado.</span>
    </div>
    <EstadoConsulta q={lista} />
    {!lista.isLoading && !lista.isError && <DataTable exportarNombre="plantillas" filas={lista.data?.data ?? []} vacio={{ title: 'Sin plantillas', description: 'Crea la primera plantilla de aviso o consentimiento.' }}
      columnas={[
        { key: 'nombre', label: 'Nombre' }, { key: 'tipo', label: 'Tipo', filtro: true, valor: p => TIPOS_PLANTILLA[p.tipo] ?? p.tipo }, { key: 'codigo', label: 'Código' }, { key: 'version', label: 'Versión', align: 'right' },
        { key: 'estado', label: 'Estado', filtro: true, render: p => <StatusBadge estado={p.estado === 'activa' ? 'ok' : p.estado === 'archivada' ? 'cancelada' : 'borrador'} label={p.estado} /> },
        { key: 'vigente_desde', label: 'Vigente desde', render: p => (p.vigente_desde ? fecha(p.vigente_desde) : '—') },
        { key: 'legal', label: 'Legal', valor: p => (p.pendiente_validacion_legal ? 'Pendiente de validar' : 'Validada') },
        { key: 'a', label: '', sortable: false, exportar: false, render: p => (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn o sm" onClick={() => setEd(p)}>{p.estado === 'borrador' && puede ? 'Editar' : 'Ver'}</button>
            {puede && p.estado === 'borrador' && <button className="btn sm" onClick={() => cambiarEstado(p, 'activa')}>Activar</button>}
            {puede && p.estado === 'activa' && <button className="btn o sm" onClick={() => nuevaVersion(p)}>Nueva versión</button>}
            {puede && p.estado === 'activa' && <button className="btn red sm" onClick={() => cambiarEstado(p, 'archivada')}>Archivar</button>}
          </div>) },
      ]} />}
    <Modal open={!!ed} onClose={() => setEd(null)} title={ed?.id ? `${ed.nombre} · v${ed.version}` : 'Nueva plantilla'} size="wide"
      footer={<><button className="btn o" onClick={() => setEd(null)}>Cerrar</button>{puede && (!ed?.id || ed.estado === 'borrador') && <button className="btn" onClick={guardar}>Guardar</button>}</>}>
      {ed && (() => { const lectura = !puede || (ed.id && ed.estado !== 'borrador'); return (<>
        <div className="grid2">
          <FormField label="Tipo" as="select" value={ed.tipo} onChange={x => setEd({ ...ed, tipo: x.target.value })} disabled={!!ed.id} options={Object.entries(TIPOS_PLANTILLA).map(([v, l]) => ({ value: v, label: l }))} />
          <FormField label="Código estable" value={ed.codigo} onChange={x => setEd({ ...ed, codigo: x.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} disabled={!!ed.id} hint="Igual entre versiones, p. ej. aviso_privacidad_general" />
          <FormField label="Nombre" value={ed.nombre} onChange={x => setEd({ ...ed, nombre: x.target.value })} disabled={lectura} />
          <FormField label="Forma de aceptación" as="select" value={ed.forma_aceptacion} onChange={x => setEd({ ...ed, forma_aceptacion: x.target.value })} disabled={lectura} options={[{ value: 'firma_pantalla', label: 'Firma en pantalla' }, { value: 'casilla', label: 'Casilla' }, { value: 'correo', label: 'Correo' }, { value: 'ninguna', label: 'Ninguna' }]} />
        </div>
        <FormField label="Contenido" as="textarea" rows={12} value={ed.contenido} onChange={x => setEd({ ...ed, contenido: x.target.value })} disabled={lectura} hint="Variables: {{nombre}}, {{liga_cita}}, {{clinica}}…" />
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!ed.cambia_finalidades} onChange={x => setEd({ ...ed, cambia_finalidades: x.target.checked })} disabled={lectura} /> Esta versión cambia las finalidades (exige nueva firma, P-140)</label>
      </>) })()}
    </Modal>
    {dialogo}
  </>)
}

// ───────────────────────────── Catálogos ─────────────────────────────
const NOMBRES_CAT = { estado_civil: 'Estado civil', parentesco: 'Parentesco', origen_paciente: 'Origen del paciente', canal_contacto: 'Canal de contacto', categoria_servicio: 'Categorías de servicio', categoria_producto: 'Categorías de producto', categoria_proveedor: 'Categorías de proveedor', categoria_gasto: 'Categorías de gasto', categoria_ot: 'Categorías de mantenimiento (OT)', tipo_queja: 'Tipos de queja', transporte: 'Transporte', ciclo_autoclave: 'Ciclos de autoclave', origen_sistema_importacion: 'Origen de importación' }

function TabCatalogos({ puede }) {
  const qc = useQueryClient()
  const cat = useDatos(['cfg-cat'], () => leer('prp_catalogos', { sedeCol: false, orden: [{ columna: 'catalogo' }, { columna: 'orden' }], limite: 2000 }))
  const [sel, setSel] = useState('')
  const [nuevo, setNuevo] = useState({ nombre: '', color: '' })
  const catalogos = useMemo(() => [...new Set((cat.data?.data ?? []).map(c => c.catalogo))], [cat.data])
  useEffect(() => { if (!sel && catalogos.length) setSel(catalogos[0]) }, [catalogos])
  const filas = (cat.data?.data ?? []).filter(c => c.catalogo === sel)
  const ref = () => qc.invalidateQueries({ queryKey: ['cfg-cat'] })
  async function agregar() {
    const nombre = nuevo.nombre.trim()
    if (!nombre) return
    const clave = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (filas.some(f => f.clave === clave)) return toast.error('Ya existe un valor con ese nombre')
    const r = await insertar('catalogos_clinica', { catalogo: sel, clave, nombre, orden: Math.max(0, ...filas.map(f => f.orden)) + 1, color: nuevo.color || null })
    r.error ? toast.error(errMsg(r.error)) : (setNuevo({ nombre: '', color: '' }), ref())
  }
  const guardar = async (c, cambios) => { const r = await actualizar('catalogos_clinica', c.id, cambios); r.error ? toast.error(errMsg(r.error)) : ref() }
  async function quitar(c) { const r = await borrar('catalogos_clinica', c.id); r.error ? toast.error(`${errMsg(r.error)} — desactívalo en su lugar`) : ref() }
  if (cat.isLoading || cat.isError || cat.data?.aviso) return <EstadoConsulta q={cat} />
  if (!catalogos.length) return <EmptyState title="Sin catálogos" description="Los catálogos se siembran al crear la clínica." />
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={sel} onChange={e => setSel(e.target.value)}>{catalogos.map(c => <option key={c} value={c}>{NOMBRES_CAT[c] ?? c}</option>)}</select>
        <input placeholder="Nuevo valor…" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} onKeyDown={e => e.key === 'Enter' && agregar()} />
        <button className="btn" disabled={!puede} onClick={agregar}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button>
      </div>
      <div className="tabla-wrap"><table>
        <thead><tr><th>Nombre</th><th>Clave</th><th style={{ width: 90 }}>Orden</th><th>Estado</th><th /></tr></thead>
        <tbody>{filas.map(c => (
          <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.55 }}>
            <td><input defaultValue={c.nombre} disabled={!puede || !c.editable} onBlur={e => e.target.value.trim() && e.target.value !== c.nombre && guardar(c, { nombre: e.target.value.trim() })} />{!c.editable && <span className="bd n" style={{ marginLeft: 6 }}>Fijo</span>}</td>
            <td><code>{c.clave}</code></td>
            <td><input type="number" style={{ width: 70 }} defaultValue={c.orden} disabled={!puede} onBlur={e => Number(e.target.value) !== c.orden && guardar(c, { orden: Number(e.target.value) })} /></td>
            <td><StatusBadge estado={c.activo ? 'activo' : 'inactivo'} /></td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn o sm" disabled={!puede} onClick={() => guardar(c, { activo: !c.activo })}>{c.activo ? 'Desactivar' : 'Activar'}</button>{' '}
              {c.editable && <button className="btn red sm" disabled={!puede} onClick={() => quitar(c)}>Eliminar</button>}
            </td>
          </tr>))}</tbody>
      </table></div>
    </div>
  )
}

export default function Configuracion() {
  const puede = usePermiso('configuracion.editar')
  const [tab, setTab] = useState('clinica')
  return (
    <div className="pagina">
      <PageHeader titulo="Configuración de la clínica" subtitulo="Datos fiscales, sedes, parámetros de negocio, plantillas y catálogos." />
      {!puede && <div className="card" style={{ padding: '8px 12px', fontSize: 12.5, marginBottom: 10, borderLeft: '4px solid var(--red)' }}>Solo lectura: tu rol no puede editar o la clínica está suspendida.</div>}
      <Tabs value={tab} onChange={setTab} items={[{ id: 'clinica', label: 'Clínica' }, { id: 'sedes', label: 'Sedes y cabinas' }, { id: 'parametros', label: 'Parámetros' }, { id: 'plantillas', label: 'Plantillas' }, { id: 'catalogos', label: 'Catálogos' }]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'clinica' && <TabClinica puede={puede} />}
        {tab === 'sedes' && <TabSedes puede={puede} />}
        {tab === 'parametros' && <TabParametros puede={puede} />}
        {tab === 'plantillas' && <TabPlantillas puede={puede} />}
        {tab === 'catalogos' && <TabCatalogos puede={puede} />}
      </div>
    </div>
  )
}
