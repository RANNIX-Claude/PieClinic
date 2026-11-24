import { useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { insertar, actualizar, rpc } from '../../lib/api'
import { fecha, fechaHora } from '../../lib/formato'
import { Aviso, useVista, useAccion, mensajeError } from './componentes/comunes'

const FORMAS = [{ value: 'firma_pantalla', label: 'Firma en pantalla' }, { value: 'casilla', label: 'Casilla' }, { value: 'correo', label: 'Correo' }, { value: 'ninguna', label: 'Ninguna' }]

export default function DocumentosClinica() {
  const { sedes } = useApp()
  const puede = usePermiso('configuracion.editar')
  const { ejecutar, ocupado } = useAccion()
  const [tab, setTab] = useState('plantillas')
  const [edit, setEdit] = useState(null)
  const q = useVista('plantillas-doc', 'plantillas_documento', { sedeCol: false, orden: [{ columna: 'codigo' }, { columna: 'version', asc: false }], limite: 500 })
  const em = useVista('docs-emitidos', 'prp_documentos_emitidos', { orden: { columna: 'emitido_en', asc: false }, limite: 1000 })
  const pers = useVista('perfiles-docs', 'perfiles', { sedeCol: false, columnas: 'id,nombre,apellidos', limite: 300 })
  const pacs = useVista('pac-docs', 'prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo,numero_expediente', limite: 4000 })
  const pf = Object.fromEntries((pers.data?.filas ?? []).map(x => [x.id, [x.nombre, x.apellidos].filter(Boolean).join(' ')]))
  const pn = Object.fromEntries((pacs.data?.filas ?? []).map(x => [x.id, x]))
  const sn = Object.fromEntries(sedes.map(s => [s.id, s.nombre]))
  const filas = q.data?.filas ?? []
  const maxPorCodigo = useMemo(() => filas.reduce((m, x) => ({ ...m, [x.codigo]: Math.max(m[x.codigo] ?? 0, x.version) }), {}), [filas])

  const nuevaVersion = x => ejecutar(() => insertar('plantillas_documento', { codigo: x.codigo, tipo: x.tipo, nombre: x.nombre, version: maxPorCodigo[x.codigo] + 1, estado: 'borrador', contenido: x.contenido, variables: x.variables, estructura: x.estructura, forma_aceptacion: x.forma_aceptacion, cambia_finalidades: false, pendiente_validacion_legal: true }), { ok: 'Nueva versión en borrador', invalidar: ['clinico'] })
  const activar = x => ejecutar(() => actualizar('plantillas_documento', x.id, { estado: 'activa' }), { ok: `Versión ${x.version} activa; la anterior se archivó. Cada firma conserva la versión que aceptó.`, invalidar: ['clinico'] })
  const copiarBase = () => ejecutar(() => rpc('copiar_plantillas_base'), { ok: 'Plantillas base copiadas como borrador', invalidar: ['clinico'] })

  const cols = [
    { key: 'nombre', label: 'Documento' }, { key: 'codigo', label: 'Código' }, { key: 'tipo', label: 'Tipo', render: x => x.tipo.replace(/_/g, ' '), filtro: true },
    { key: 'version', label: 'Versión', align: 'right' }, { key: 'estado', label: 'Estado', render: x => <StatusBadge estado={x.estado} />, filtro: true },
    { key: 'vigente_desde', label: 'Vigente desde', render: x => fecha(x.vigente_desde) }, { key: 'forma_aceptacion', label: 'Aceptación', render: x => FORMAS.find(f => f.value === x.forma_aceptacion)?.label },
    { key: 'legal', label: 'Revisión legal', valor: x => (x.pendiente_validacion_legal ? 'Pendiente' : 'Validada'), render: x => (x.pendiente_validacion_legal ? <span className="bd a">Pendiente (P-139)</span> : <span className="bd v">Validada</span>) },
    { key: 'acc', label: '', sortable: false, exportar: false, render: x => puede && (
      <div style={{ display: 'flex', gap: 4 }}>
        {x.estado === 'borrador' && <><button type="button" className="btn o sm" onClick={() => setEdit(x)}>Editar</button><button type="button" className="btn sm" disabled={ocupado} onClick={() => activar(x)}>Activar</button></>}
        {x.estado === 'activa' && x.version === maxPorCodigo[x.codigo] && <button type="button" className="btn o sm" disabled={ocupado} onClick={() => nuevaVersion(x)}>Nueva versión</button>}
        {x.estado === 'archivada' && <button type="button" className="btn ghost sm" onClick={() => setEdit({ ...x, soloLectura: true })}>Ver</button>}
        {x.estado === 'activa' && <button type="button" className="btn ghost sm" onClick={() => setEdit({ ...x, soloLectura: true })}>Ver</button>}
      </div>) },
  ]
  const colsEm = [
    { key: 'emitido_en', label: 'Fecha', render: x => fechaHora(x.emitido_en) }, { key: 'folio', label: 'Folio' }, { key: 'tipo', label: 'Documento', render: x => x.tipo.replace('impreso_', '').replace(/_/g, ' '), filtro: true },
    { key: 'paciente', label: 'Paciente', valor: x => (x.en_blanco ? '(formato en blanco)' : pn[x.paciente_id]?.nombre_completo ?? '—') }, { key: 'sede', label: 'Sede', valor: x => sn[x.sede_id] ?? '' },
    { key: 'emitio', label: 'Imprimió', valor: x => pf[x.emitido_por] ?? '' }, { key: 'plantilla_version', label: 'Versión plantilla', align: 'right' }, { key: 'version_expediente', label: 'Versión expediente', align: 'right' },
    { key: 'es_copia', label: 'Copia', render: x => (x.es_copia ? 'Sí' : 'No') }, { key: 'incluye_sensibles', label: 'Con datos sensibles', render: x => (x.incluye_sensibles ? <span className="bd a">Sí</span> : 'No') },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Documentos y plantillas" subtitulo="Plantillas con versión (consentimientos, avisos, impresos) y bitácora de impresión del expediente"
        acciones={puede && !filas.length && !q.isLoading && <button type="button" className="btn" disabled={ocupado} onClick={copiarBase}><FileText size={14} style={{ verticalAlign: -3 }} /> Copiar plantillas base</button>} />
      <Aviso>Una plantilla activa no se edita: se crea una nueva versión y, al activarla, la anterior se archiva. Cada firma guarda la versión que aceptó; si cambian las finalidades se pide nueva firma. Los textos son base editable y <b>requieren validación de un abogado</b> antes de operar con datos reales (P-139, N-06).</Aviso>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'plantillas', label: 'Plantillas' }, { id: 'bitacora', label: 'Bitácora de impresión' }]} />
      {tab === 'plantillas' && <DataTable columnas={cols} filas={filas} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} exportarNombre="plantillas_documento" vacio={{ title: 'Sin plantillas', description: 'Copia las plantillas base para empezar.' }} />}
      {tab === 'bitacora' && <DataTable columnas={colsEm} filas={em.data?.filas ?? []} cargando={em.isLoading} error={em.error ? mensajeError(em.error) : null} exportarNombre="bitacora_impresion" vacio={{ title: 'Sin impresiones', description: 'Aún no se han emitido impresos.' }} />}
      {edit && <Editor plantilla={edit} onCerrar={() => setEdit(null)} />}
    </div>
  )
}

function Editor({ plantilla: x, onCerrar }) {
  const { ejecutar, ocupado } = useAccion()
  const [f, setF] = useState({ nombre: x.nombre, contenido: x.contenido ?? '', forma_aceptacion: x.forma_aceptacion, cambia_finalidades: !!x.cambia_finalidades, pendiente_validacion_legal: !!x.pendiente_validacion_legal })
  const ro = !!x.soloLectura
  const guardar = async () => { const r = await ejecutar(() => actualizar('plantillas_documento', x.id, f), { ok: 'Borrador guardado', invalidar: ['clinico'] }); if (r) onCerrar() }
  return (
    <Modal open onClose={onCerrar} title={`${x.nombre} · v${x.version}${ro ? ' (solo lectura)' : ''}`} size="wide" footer={<><button type="button" className="btn o" onClick={onCerrar}>Cerrar</button>{!ro && <button type="button" className="btn" disabled={ocupado} onClick={guardar}>Guardar borrador</button>}</>}>
      <fieldset disabled={ro} style={{ border: 0, padding: 0 }}>
        <FormField label="Nombre" value={f.nombre} onChange={e => setF(s => ({ ...s, nombre: e.target.value }))} />
        <FormField label="Texto (variables: {{paciente}}, {{tutor}}, {{podologo}}, {{clinica}}, {{fecha}}…)" as="textarea" rows={14} value={f.contenido} onChange={e => setF(s => ({ ...s, contenido: e.target.value }))} hint="Deja una línea en blanco entre párrafos; las líneas que empiezan con «- » se imprimen como lista." />
        <div className="row">
          <FormField label="Forma de aceptación" as="select" options={FORMAS} value={f.forma_aceptacion} onChange={e => setF(s => ({ ...s, forma_aceptacion: e.target.value }))} />
          <label style={{ fontSize: 13, alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={f.cambia_finalidades} onChange={e => setF(s => ({ ...s, cambia_finalidades: e.target.checked }))} /> Cambia las finalidades (pide nueva firma a quien aceptó una versión anterior)</label>
          <label style={{ fontSize: 13, alignSelf: 'flex-end', paddingBottom: 8 }}><input type="checkbox" checked={f.pendiente_validacion_legal} onChange={e => setF(s => ({ ...s, pendiente_validacion_legal: e.target.checked }))} /> Pendiente de validación legal</label>
        </div>
      </fieldset>
    </Modal>
  )
}
