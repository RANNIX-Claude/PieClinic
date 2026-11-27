// Expediente del empleado (clon de ExpedienteEmpleado de IRP): datos, contrato y sueldo, documentos, asistencia,
// vacaciones, incidencias y recibos. Ver el expediente queda en bitácora. CLABE enmascarada salvo Administración (P-111).
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Upload, Trash2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import StatusBadge from '../../../components/ui/StatusBadge'
import DataTable from '../../../components/ui/DataTable'
import FormField from '../../../components/ui/FormField'
import KPICard from '../../../components/ui/KPICard'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { insertar, borrar } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'
import { urlFirmada, rutaStorage, BUCKETS } from '../../../lib/urlFirmada'
import { bitacoraVer } from '../../../lib/bitacora'
import { moneda, fecha, telefono, hora } from '../../../lib/formato'
import { useVista, Estado, useEscribir, Dato, AvisoSoloLectura, etiquetaPuesto, enmascararClabe, textoError, DIAS, hoy, TIPOS_DOC, OBLIGATORIOS, Foto } from './comun'
import { Medidor } from './rh/TabEmpleados'
import ModalEmpleado from './rh/ModalEmpleado'
import TabVacaciones from './rh/TabVacaciones'
import { RotacionEmpleado } from './RotacionPersonal'


function Documentos({ empleadoId }) {
  const puede = usePermiso('rh.editar')
  const { organizacion } = useApp()
  const { ejecutar } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const q = useVista(['emp-docs', empleadoId], 'prp_empleado_documentos', { filtros: { empleado_id: empleadoId }, orden: [{ columna: 'created_at', asc: false }] }, { conSede: false })
  const [tipo, setTipo] = useState('ine'), [vence, setVence] = useState(''), [subiendo, setSubiendo] = useState(false)
  const tiene = new Set((q.data ?? []).map(d => d.tipo))
  async function subir(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { toast.error('El archivo excede 10 MB'); return }
    setSubiendo(true)
    try {
      const ruta = rutaStorage(organizacion.id, 'rh', empleadoId, `${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, '_')}`)
      const { error } = await supabase.storage.from(BUCKETS.documentos).upload(ruta, f, { upsert: false })
      if (error) { toast.error(`No se pudo subir: ${textoError(error)}`); return }
      await ejecutar(() => insertar('empleado_documentos', { empleado_id: empleadoId, tipo, nombre: f.name, storage_path: ruta, mime: f.type || null, tamano_kb: Math.ceil(f.size / 1024), vence_el: vence || null }), 'Documento guardado')
    } finally { setSubiendo(false) }
  }
  const abrir = async d => { const u = await urlFirmada(BUCKETS.documentos, d.storage_path, 300); if (u) { bitacoraVer('empleado_documentos', d.id, { tipo: d.tipo }); window.open(u, '_blank', 'noopener') } else toast.error('No se pudo abrir el documento') }
  const quitar = async d => { if (await confirmar({ titulo: 'Eliminar documento', mensaje: d.nombre, peligro: true, textoConfirmar: 'Eliminar' })) { await supabase.storage.from(BUCKETS.documentos).remove([d.storage_path]); ejecutar(() => borrar('empleado_documentos', d.id), 'Documento eliminado') } }
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}><h3>Documentos obligatorios</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{OBLIGATORIOS.map(t => <span key={t} className={`bd ${tiene.has(t) ? 'v' : 'r'}`}>{tiene.has(t) ? '✓' : '✕'} {TIPOS_DOC.find(x => x[0] === t)[1]}</span>)}</div></div>
      {puede && <div className="toolbar">
        <FormField label="Tipo" as="select" options={TIPOS_DOC.map(([value, label]) => ({ value, label }))} value={tipo} onChange={e => setTipo(e.target.value)} style={{ maxWidth: 240 }} />
        <FormField label="Vence (opcional)" type="date" value={vence} onChange={e => setVence(e.target.value)} style={{ maxWidth: 170 }} />
        <label className="btn sm" style={{ cursor: 'pointer', alignSelf: 'end' }}><Upload size={12} style={{ verticalAlign: -2 }} /> {subiendo ? 'Subiendo…' : 'Subir documento'}<input type="file" hidden disabled={subiendo} onChange={subir} accept=".pdf,image/*,.doc,.docx" /></label>
      </div>}
      <Estado q={q}>
        <DataTable buscador={false} sinPaginacion filas={q.data ?? []} vacio={{ title: 'Sin documentos', description: 'Sube INE, CURP, contrato y demás documentos del expediente.' }}
          columnas={[
            { key: 'tipo', label: 'Tipo', render: d => TIPOS_DOC.find(x => x[0] === d.tipo)?.[1] ?? d.tipo },
            { key: 'nombre', label: 'Archivo', render: d => <button className="btn ghost sm" onClick={() => abrir(d)}><FileText size={12} /> {d.nombre}</button> },
            { key: 'tamano_kb', label: 'KB', align: 'right' },
            { key: 'vence_el', label: 'Vence', render: d => (d.vence_el ? <span className={`bd ${d.vencido ? 'r' : 'n'}`}>{fecha(d.vence_el)}{d.vencido ? ' · vencido' : ''}</span> : '—') },
            { key: 'created_at', label: 'Subido', render: d => fecha(d.created_at) },
            { key: 'a', label: '', render: d => puede && <button className="btn o sm" onClick={() => quitar(d)}><Trash2 size={12} /></button> },
          ]} />
      </Estado>
      {dialogo}
    </>
  )
}

export default function ExpedienteEmpleado() {
  const { id } = useParams()
  const nav = useNavigate()
  const { rol, sedes } = useApp()
  const esAdmin = rol === 'administrador'
  const editar = usePermiso('rh.editar')
  const [tab, setTab] = useState('datos')
  const [edit, setEdit] = useState(false)
  const q = useVista(['emp', id], 'prp_empleados', { filtros: { id }, limite: 1 }, { conSede: false })
  const qExp = useVista(['emp-exp', id], 'prp_expediente_empleado', { filtros: { empleado_id: id }, limite: 1 }, { conSede: false })
  const qSue = useVista(['emp-sueldos', id], 'prp_historico_sueldos', { filtros: { empleado_id: id }, orden: [{ columna: 'fecha_inicio', asc: false }] }, { conSede: false, habilitado: tab === 'contrato' })
  const qHor = useVista(['emp-hor', id], 'prp_horarios_laborales', { filtros: { empleado_id: id, activo: true }, orden: [{ columna: 'dia_semana' }] }, { conSede: false, habilitado: tab === 'contrato' })
  const qAs = useVista(['emp-asis', id], 'prp_asistencia', { filtros: { empleado_id: id, fecha: { gte: new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10) } }, orden: [{ columna: 'fecha', asc: false }], limite: 100 }, { conSede: false, habilitado: tab === 'asistencia' })
  const qIn = useVista(['emp-inc', id], 'prp_incidencias_rh', { filtros: { empleado_id: id }, orden: [{ columna: 'fecha', asc: false }], limite: 200 }, { conSede: false, habilitado: tab === 'incidencias' })
  const qRe = useVista(['emp-rec', id], 'prp_prenomina', { filtros: { empleado_id: id, periodo_estado: ['autorizada', 'pagada'] }, orden: [{ columna: 'desde', asc: false }], limite: 100 }, { conSede: false, habilitado: tab === 'recibos' })
  const e = q.data?.[0]
  useEffect(() => { if (e?.id) bitacoraVer('empleados', e.id, { expediente: true }, e.sede_id) }, [e?.id]) // eslint-disable-line
  const x = qExp.data?.[0]
  const dom = e?.domicilio ?? {}, emer = e?.contacto_emergencia ?? {}

  return (
    <div className="pagina">
      <PageHeader titulo={e ? e.nombre_completo : 'Expediente de empleado'} subtitulo={e ? `No. ${e.numero_empleado} · ${etiquetaPuesto(e.puesto)} · ${e.sede_nombre}` : undefined}
        acciones={<><button className="btn o" onClick={() => nav('/rh')}><ArrowLeft size={14} style={{ verticalAlign: -3 }} /> RH</button>{editar && e && <button className="btn" onClick={() => setEdit(true)}><Pencil size={14} style={{ verticalAlign: -3 }} /> Editar</button>}</>} />
      <AvisoSoloLectura />
      <Estado q={q} esVacio={d => !d.length} vacio={{ title: 'Empleado no encontrado', description: 'No existe o no tienes acceso a su sede.' }}>
        {e && <>
          <div className="grid-kpis">
            <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Foto nombre={e.nombre_completo} ruta={e.foto_path} size={76} />
              <div><div style={{ fontWeight: 700 }}>{e.nombre_completo}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{etiquetaPuesto(e.puesto)} · {e.sede_nombre}</div>
                {e.responsable_de_sede_id && <span className="bd v" style={{ marginTop: 4, display: 'inline-block' }}>Responsable de sucursal</span>}</div>
            </div>
            <KPICard title="Estado" value={<StatusBadge estado={e.estado} />} subtitle={e.fecha_baja ? `Baja ${fecha(e.fecha_baja)}: ${e.motivo_baja ?? ''}` : e.antiguedad_anios != null ? `${e.antiguedad_anios} año(s) de antigüedad` : 'Sin fecha de ingreso'} />
            <KPICard title="Salario del periodo" value={moneda(e.salario_periodo)} subtitle={`${e.periodicidad_pago} · bono ${moneda(e.bono_periodo)}`} color="var(--green)" />
            <div className="card" style={{ padding: 12 }}><div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Expediente completo</div><Medidor datos={x?.datos_presentes} total={x?.datos_total} docs={x?.documentos_presentes} docsTotal={x?.documentos_total} /></div>
          </div>
          <Tabs value={tab} onChange={setTab} items={[{ id: 'datos', label: 'Datos personales' }, { id: 'contrato', label: 'Contrato y sueldo' }, { id: 'documentos', label: 'Documentos' }, { id: 'asistencia', label: 'Asistencia' }, { id: 'rotacion', label: 'Rotación' }, { id: 'vacaciones', label: 'Vacaciones' }, { id: 'incidencias', label: 'Incidencias' }, { id: 'recibos', label: 'Recibos' }]} />
          {tab === 'datos' && <div className="grid2">
            <div className="card"><h3>Identificación</h3><Dato k="RFC" v={e.rfc} /><Dato k="CURP" v={e.curp} /><Dato k="NSS" v={e.nss} /><Dato k="Fecha de nacimiento" v={fecha(e.fecha_nacimiento)} /><Dato k="Lugar de nacimiento" v={e.lugar_nacimiento} /><Dato k="Nacionalidad" v={e.nacionalidad} /><Dato k="Estado civil" v={e.estado_civil} /><Dato k="Escolaridad" v={e.escolaridad} />{e.cedula && <Dato k="Cédula profesional" v={e.cedula} />}</div>
            <div className="card"><h3>Contacto</h3><Dato k="Correo" v={e.email} /><Dato k="Celular" v={telefono(e.telefono)} /><Dato k="Teléfono fijo" v={telefono(e.telefono_fijo)} />
              <Dato k="Domicilio" v={[dom.calle, dom.numero_ext && `#${dom.numero_ext}`, dom.numero_int && `int. ${dom.numero_int}`, dom.colonia, dom.municipio, dom.estado, dom.codigo_postal && `CP ${dom.codigo_postal}`].filter(Boolean).join(', ') || null} />
              <Dato k="Contacto de emergencia" v={emer.nombre ? `${emer.nombre} (${emer.parentesco ?? '—'}) · ${telefono(emer.telefono)}` : null} /><Dato k="Notas" v={e.notas} /></div>
          </div>}
          {tab === 'contrato' && <>
            <div className="grid2">
              <div className="card"><h3>Contrato</h3><Dato k="Esquema" v={e.esquema_contratacion === 'nomina' ? 'Nómina' : 'Honorarios / RESICO'} /><Dato k="Sede de contrato" v={e.sede_nombre} /><Dato k="Otras sedes" v={e.sedes?.length ? e.sedes.map(s => sedes.find(z => z.id === s)?.nombre ?? s).join(', ') : 'Solo la de contrato'} /><Dato k="Ingreso" v={fecha(e.fecha_ingreso)} /><Dato k="Jornada" v={e.tipo_jornada} /><Dato k="Supervisor" v={e.supervisor} /><Dato k="Centro de trabajo" v={e.centro_trabajo} /></div>
              <div className="card"><h3>Pago</h3><Dato k="Periodicidad" v={e.periodicidad_pago} /><Dato k="Salario del periodo" v={moneda(e.salario_periodo)} /><Dato k="Bono del periodo" v={moneda(e.bono_periodo)} /><Dato k="Banco" v={e.banco} /><Dato k="CLABE" v={enmascararClabe(e.clabe, esAdmin)} /></div>
            </div>
            <div className="grid2" style={{ marginTop: 14 }}>
              <div className="card"><h3>Historial de sueldo</h3><Estado q={qSue} vacio={{ title: 'Sin historial', description: 'Aparece al registrar el sueldo.', compacto: true }}>
                <div className="tabla-wrap"><table><thead><tr><th>Desde</th><th>Hasta</th><th>Tipo</th><th className="num">Anterior</th><th className="num">Nuevo</th></tr></thead><tbody>{(qSue.data ?? []).map(h => <tr key={h.id}><td>{fecha(h.fecha_inicio)}</td><td>{h.fecha_fin ? fecha(h.fecha_fin) : <span className="bd v">Vigente</span>}</td><td>{h.tipo}</td><td className="num">{h.sueldo_anterior == null ? '—' : moneda(h.sueldo_anterior)}</td><td className="num">{moneda(h.monto)}</td></tr>)}</tbody></table></div></Estado></div>
              <div className="card"><h3>Horario laboral vigente</h3><Estado q={qHor} vacio={{ title: 'Sin horario', description: 'Defínelo en RH › Horarios.', compacto: true }}>
                <table><tbody>{(qHor.data ?? []).filter(h => !h.vigente_hasta).map(h => <tr key={h.id}><td>{DIAS[h.dia_semana]}</td><td>{String(h.entrada).slice(0, 5)} – {String(h.salida).slice(0, 5)}</td><td style={{ color: 'var(--muted)' }}>{h.descanso_min} min descanso</td></tr>)}</tbody></table></Estado></div>
            </div>
          </>}
          {tab === 'documentos' && <Documentos empleadoId={e.id} />}
          {tab === 'asistencia' && <Estado q={qAs}><DataTable exportarNombre="asistencia_empleado" filas={qAs.data ?? []} vacio={{ title: 'Sin asistencia', description: 'Sin registros en los últimos 60 días.' }}
            columnas={[{ key: 'fecha', label: 'Fecha', render: a => fecha(a.fecha) }, { key: 'estado', label: 'Estado', filtro: true, render: a => <StatusBadge estado={a.estado} /> }, { key: 'hora_entrada', label: 'Entrada', render: a => hora(a.hora_entrada) }, { key: 'hora_salida', label: 'Salida', render: a => hora(a.hora_salida) }, { key: 'horas', label: 'Horas', align: 'right' }, { key: 'minutos_retardo', label: 'Min. retardo', align: 'right' }]} /></Estado>}
          {tab === 'rotacion' && <RotacionEmpleado empleadoId={e.id} />}
          {tab === 'vacaciones' && <TabVacaciones empleadoId={e.id} />}
          {tab === 'incidencias' && <Estado q={qIn}><DataTable exportarNombre="incidencias_empleado" filas={qIn.data ?? []} vacio={{ title: 'Sin incidencias', description: 'Este empleado no tiene incidencias.' }}
            columnas={[{ key: 'fecha', label: 'Fecha', render: i => fecha(i.fecha) }, { key: 'tipo', label: 'Tipo', filtro: true }, { key: 'dias', label: 'Días', align: 'right' }, { key: 'descuenta', label: 'Descuenta', render: i => (i.descuenta ? 'Sí' : 'No') }, { key: 'monto', label: 'Monto', align: 'right', render: i => (i.monto == null ? '—' : moneda(i.monto)) }, { key: 'estado', label: 'Estado', render: i => <StatusBadge estado={i.estado} /> }]} /></Estado>}
          {tab === 'recibos' && <Estado q={qRe}><DataTable exportarNombre="recibos_empleado" filas={qRe.data ?? []} vacio={{ title: 'Sin recibos', description: 'Aparecen al autorizar la nómina.' }}
            columnas={[{ key: 'desde', label: 'Periodo', render: r => `${fecha(r.desde)} – ${fecha(r.hasta)}` }, { key: 'percepcion_total', label: 'Percepción', align: 'right', render: r => moneda(r.percepcion_total) }, { key: 'deduccion_total', label: 'Deducción', align: 'right', render: r => moneda(r.deduccion_total) }, { key: 'neto', label: 'Neto', align: 'right', render: r => <b>{moneda(r.neto)}</b> }, { key: 'recibo_firmado', label: 'Firma', render: r => (r.recibo_firmado ? <span className="bd v">Firmado</span> : <span className="bd a">Pendiente</span>) }]} /></Estado>}
          <ModalEmpleado abierto={edit} empleado={e} onClose={() => setEdit(false)} />
        </>}
      </Estado>
    </div>
  )
}
