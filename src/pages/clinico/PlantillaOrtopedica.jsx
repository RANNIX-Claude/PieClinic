import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import StatusBadge from '../../components/ui/StatusBadge'
import ImprimirHoja from '../../components/ui/ImprimirHoja'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, insertar, actualizar, contextoApi } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { urlFirmada, BUCKETS, rutaStorage } from '../../lib/urlFirmada'
import { hoyISO, fecha, moneda } from '../../lib/formato'
import { ESTUDIOS_PISADA, TIPOS_PIE_ORTOPEDICO, COBERTURAS, etiquetaDe } from '../../lib/clinico/catalogos'
import { anticipoOrdenCubierto, siguienteEstadoOrden, registroFirmadoBloqueado } from '../../lib/clinico/inmutabilidad'
import { Aviso, Seccion, PacienteBuscador, usePaciente, useVista, useAccion, Volver, limpiar, num, mensajeError, sedeDeRegistro, CabeceraPaciente } from './componentes/comunes'
import FirmaDialogo from './componentes/FirmaDialogo'

const E_NUM = ['talla_calzado', 'longitud_izq_mm', 'longitud_der_mm', 'ancho_metatarsal_izq_mm', 'ancho_metatarsal_der_mm', 'altura_arco_izq_mm', 'altura_arco_der_mm', 'angulo_retropie_izq', 'angulo_retropie_der', 'dismetria_mm', 'peso_kg', 'costo']
const E_TXT = ['tipo_estudio', 'equipo_texto', 'tipo_arco', 'retropie', 'dismetria_lado', 'patron_marcha', 'desgaste_calzado', 'cie10_codigo', 'actividad', 'calzado_habitual', 'imagen_izq_path', 'imagen_der_path']
const O_NUM = ['pares', 'precio', 'anticipo_monto']
const O_TXT = ['modelo', 'material', 'cuna_realce', 'cobertura', 'laboratorio_id', 'indicaciones_laboratorio', 'anticipo_forma']
const E0 = { ...Object.fromEntries([...E_NUM, ...E_TXT].map(k => [k, ''])), tipo_estudio: 'baropodometria' }
const O0 = { ...Object.fromEntries([...O_NUM, ...O_TXT].map(k => [k, ''])), pares: '1', precio: '', anticipo_monto: '0', cobertura: 'tres_cuartos', avisar_whatsapp: true, garantia_meses: '6' }

export default function PlantillaOrtopedica() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { perfil, sedes, sedeActivaId } = useApp()
  const puede = usePermiso('ortopedia.editar')
  const { ejecutar, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const [paciente, setPaciente] = useState(null)
  const [fechaE, setFechaE] = useState(hoyISO())
  const [e, setE] = useState(E0)
  const [o, setO] = useState(O0)
  const [firma, setFirma] = useState(null) // 'estudio' | 'entrega'
  const [urls, setUrls] = useState({})
  const [subiendo, setSubiendo] = useState(null)
  const orden = useQuery({ queryKey: ['clinico', 'orden-ort', id], enabled: !!id, queryFn: async () => { const r = await leer('ordenes_plantilla', { sedeCol: false, filtros: { id }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const estudioId = orden.data?.estudio_id
  const estudio = useQuery({ queryKey: ['clinico', 'estudio-pisada', estudioId], enabled: !!estudioId, queryFn: async () => { const r = await leer('estudios_pisada', { sedeCol: false, filtros: { id: estudioId }, limite: 1 }); if (r.error) throw r.error; return r.data[0] ?? null } })
  const pacQ = usePaciente(id ? orden.data?.paciente_id : sp.get('paciente'))
  useEffect(() => { if (pacQ.data) setPaciente(pacQ.data) }, [pacQ.data])
  const labs = useVista('labs-ort', 'laboratorios_ortopedicos', { sedeCol: false, filtros: { activo: true }, orden: { columna: 'nombre' } })
  const equipos = useVista('cie-lista', 'cie10_catalogo', { sedeCol: false, filtros: { codigo: ['M21.4', 'M21.6', 'M77.3', 'M72.2', 'M21.0', 'M20.1', 'M79.67', 'E11.5'] } })

  useEffect(() => { if (estudio.data) { setE(Object.fromEntries([...E_NUM, ...E_TXT].map(k => [k, estudio.data[k] ?? '']))); setFechaE(estudio.data.fecha) } }, [estudio.data])
  useEffect(() => { if (orden.data) { setO({ ...Object.fromEntries([...O_NUM, ...O_TXT].map(k => [k, orden.data[k] ?? ''])), avisar_whatsapp: orden.data.avisar_whatsapp, garantia_meses: String(orden.data.garantia_meses ?? 6) }) } }, [orden.data])
  useEffect(() => {
    let vivo = true
    ;(async () => { const n = {}; for (const k of ['imagen_izq_path', 'imagen_der_path']) if (e[k]) n[k] = await urlFirmada(BUCKETS.expedientes, e[k], 900); if (vivo) setUrls(n) })()
    return () => { vivo = false }
  }, [e.imagen_izq_path, e.imagen_der_path]) // eslint-disable-line

  const estudioFirmado = registroFirmadoBloqueado(estudio.data?.estado)
  const estado = orden.data?.estado ?? 'borrador'
  const cerrada = ['entregada', 'cancelada'].includes(estado)
  const editEstudio = puede && !estudioFirmado
  const editOrden = puede && ['borrador'].includes(estado)
  const setEf = k => ev => setE(s => ({ ...s, [k]: ev.target.value }))
  const setOf = k => ev => setO(s => ({ ...s, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value }))
  const cE = (k, label, extra = {}) => <FormField label={label} value={e[k] ?? ''} onChange={setEf(k)} disabled={!editEstudio} {...extra} />
  const cO = (k, label, extra = {}) => <FormField label={label} value={o[k] ?? ''} onChange={setOf(k)} disabled={!editOrden} {...extra} />
  const nombreP = [perfil?.nombre, perfil?.apellidos].filter(Boolean).join(' ')

  async function subir(lado, file) {
    if (!file) return
    setSubiendo(lado)
    const ruta = rutaStorage(contextoApi().organizacionId, 'pisada', paciente.id, `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`)
    const { error } = await supabase.storage.from(BUCKETS.expedientes).upload(ruta, file, { contentType: file.type, upsert: false })
    setSubiendo(null)
    if (error) { toast.error(mensajeError(error)); return }
    setE(s => ({ ...s, [lado]: ruta }))
  }

  const cuerpoE = () => {
    const c = Object.fromEntries([...E_NUM.map(k => [k, num(e[k])]), ...E_TXT.map(k => [k, e[k] === '' ? null : e[k]])])
    return c
  }
  const cuerpoO = () => ({ ...Object.fromEntries([...O_NUM.map(k => [k, num(o[k]) ?? 0]), ...O_TXT.map(k => [k, o[k] === '' ? null : o[k]])]), avisar_whatsapp: !!o.avisar_whatsapp, garantia_meses: num(o.garantia_meses) ?? 6 })

  async function guardar() {
    if (!paciente) { toast.error('Elige al paciente.'); return null }
    const r = await ejecutar(async () => {
      let eid = estudioId, oid = id
      if (!estudioFirmado) {
        if (eid) { const u = await actualizar('estudios_pisada', eid, { ...cuerpoE(), fecha: fechaE }); if (u.error) return u }
        else { const c = await insertar('estudios_pisada', { paciente_id: paciente.id, consulta_id: sp.get('consulta') || null, sede_id: sedeDeRegistro(sedeActivaId, paciente, sedes), realizado_por: perfil.id, fecha: fechaE, ...cuerpoE() }); if (c.error) return c; eid = c.data[0].id }
      }
      if (estado === 'borrador') {
        const base = { ...cuerpoO(), estudio_id: eid, podologo_id: orden.data?.podologo_id ?? perfil.id }
        if (oid) { const u = await actualizar('ordenes_plantilla', oid, base); if (u.error) return u }
        else { const c = await insertar('ordenes_plantilla', { paciente_id: paciente.id, sede_id: sedeDeRegistro(sedeActivaId, paciente, sedes), ...base }); if (c.error) return c; oid = c.data[0].id }
      }
      return { data: oid }
    }, { ok: 'Estudio y orden guardados (borrador)', invalidar: ['clinico'] })
    if (r && !id) nav(`/plantillas-ortopedicas/${r.data}`, { replace: true })
    return r?.data ?? null
  }
  async function firmarEstudio(f) {
    if (!e.cie10_codigo || !e.longitud_izq_mm || !e.longitud_der_mm) { toast.error('Para firmar captura el diagnóstico CIE-10 y la longitud de ambos pies.'); setFirma(null); return }
    const r = await ejecutar(() => actualizar('estudios_pisada', estudioId, { estado: 'firmado', firma_id: f.id }), { ok: 'Estudio firmado', invalidar: ['clinico'] })
    if (r) setFirma(null)
  }
  async function avanzar() {
    const sig = siguienteEstadoOrden(estado)
    if (!sig) return
    if (sig === 'enviada') {
      if (!anticipoOrdenCubierto(num(o.precio), num(o.anticipo_monto))) { toast.error('El anticipo debe ser al menos el 50 % del precio para enviar la orden (P-075).'); return }
      if (!o.laboratorio_id || !o.modelo || !o.material || !o.cobertura) { toast.error('Completa laboratorio, modelo, material y cobertura antes de enviar.'); return }
      if (!estudioFirmado) { toast.error('Firma primero el estudio de pisada.'); return }
      await guardar()
    }
    if (sig === 'entregada') { setFirma('entrega'); return }
    await ejecutar(() => actualizar('ordenes_plantilla', id, { estado: sig }), { ok: `Orden ${sig}`, invalidar: ['clinico'] })
  }
  async function entregar(f) {
    const r = await ejecutar(() => actualizar('ordenes_plantilla', id, { estado: 'entregada', conformidad_firma_id: f.id, entregado_por: perfil.id, ajuste_realizado: !!o.ajuste_realizado }), { ok: 'Plantillas entregadas: garantía y revisión programadas', invalidar: ['clinico'] })
    if (r) setFirma(null)
  }
  async function cancelar() {
    const motivo = await confirmar({ titulo: 'Cancelar orden', mensaje: 'La orden no podrá reactivarse.', pedirMotivo: true, peligro: true, textoConfirmar: 'Cancelar orden' })
    if (motivo) await ejecutar(() => actualizar('ordenes_plantilla', id, { estado: 'cancelada', motivo_cancelacion: motivo }), { ok: 'Orden cancelada', invalidar: ['clinico'] })
  }

  if (id && (orden.isLoading || estudio.isLoading)) return <div className="pagina"><LoadingSpinner /></div>
  if (orden.error || estudio.error) return <div className="pagina"><Aviso tipo="err">{mensajeError(orden.error ?? estudio.error)}</Aviso><Volver a="/plantillas-ortopedicas" /></div>
  if (!puede && !id) return <div className="pagina"><Aviso tipo="err">Solo Podología y Administración capturan plantillas ortopédicas.</Aviso><Volver a="/plantillas-ortopedicas" /></div>
  const labSel = (labs.data?.filas ?? []).find(l => l.id === o.laboratorio_id)
  const pasos = ['borrador', 'enviada', 'recibida', 'entregada']
  const sigTxt = { borrador: 'Enviar orden al laboratorio', enviada: 'Marcar recibida', recibida: 'Entregar al paciente' }[estado]

  return (
    <div className="pagina">
      <PageHeader titulo="Plantilla ortopédica" subtitulo={`Plantillas ortopédicas › Estudio de pisada y orden${paciente ? ' · ' + paciente.nombre_completo : ''}${orden.data?.folio ? ' · ' + orden.data.folio : ''}`} acciones={<Volver a="/plantillas-ortopedicas" />} />
      {!id && <PacienteBuscador seleccionado={paciente} onElegir={setPaciente} />}
      <CabeceraPaciente paciente={paciente} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {pasos.map(p => <span key={p} className={`bd ${p === estado ? 'm' : pasos.indexOf(p) < pasos.indexOf(estado) ? 'v' : 'n'}`}>{p.replace('_', ' ')}</span>)}
        {estado === 'cancelada' && <span className="bd r">Cancelada: {orden.data?.motivo_cancelacion}</span>}
      </div>

      <Seccion titulo="Estudio de pisada" acciones={estudioFirmado ? <span className="bd v">Firmado {fecha(estudio.data.firmado_en)} · acreditable hasta {fecha(estudio.data.acreditable_hasta)}</span> : <StatusBadge estado="borrador" />}>
        <div className="grid2">
          {[['imagen_izq_path', 'Pie izquierdo'], ['imagen_der_path', 'Pie derecho']].map(([k, l]) => (
            <div key={k} className="card" style={{ background: 'var(--accent-light)' }}>
              <b>{l}</b>
              <div style={{ margin: '8px 0', minHeight: 60 }}>{urls[k] ? <img src={urls[k]} alt={l} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6 }} onError={ev => { ev.currentTarget.style.display = 'none' }} /> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>Sin imagen del equipo (JPG/PDF)</span>}</div>
              {editEstudio && paciente && <label className="btn o sm" style={{ cursor: 'pointer' }}><Upload size={12} style={{ verticalAlign: -2 }} /> {subiendo === k ? 'Subiendo…' : 'Adjuntar imagen'}<input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={ev => { subir(k, ev.target.files?.[0]); ev.target.value = '' }} /></label>}
            </div>))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <FormField label="Tipo de estudio" required as="select" options={ESTUDIOS_PISADA} value={e.tipo_estudio} onChange={setEf('tipo_estudio')} disabled={!editEstudio} />
          <FormField label="Fecha" type="date" required value={fechaE} onChange={ev => setFechaE(ev.target.value)} disabled={!editEstudio} />
          {cE('equipo_texto', 'Equipo')}
          <FormField label="Tipo de arco" required as="select" options={TIPOS_PIE_ORTOPEDICO} value={e.tipo_arco} onChange={setEf('tipo_arco')} disabled={!editEstudio} />
          <FormField label="Retropié" required as="select" options={[{ value: 'valgo', label: 'Valgo' }, { value: 'neutro', label: 'Neutro' }, { value: 'varo', label: 'Varo' }]} value={e.retropie} onChange={setEf('retropie')} disabled={!editEstudio} />
        </div>
        <h4 style={{ margin: '8px 0 4px', fontSize: 12.5 }}>Medidas y evaluación biomecánica</h4>
        <div className="row">
          {cE('talla_calzado', 'Talla de calzado (MX)', { type: 'number', step: '0.5' })}{cE('longitud_izq_mm', 'Longitud izq. (mm)', { type: 'number', required: true })}{cE('longitud_der_mm', 'Longitud der. (mm)', { type: 'number', required: true })}
          {cE('ancho_metatarsal_izq_mm', 'Ancho metatarsal izq. (mm)', { type: 'number' })}{cE('ancho_metatarsal_der_mm', 'Ancho metatarsal der. (mm)', { type: 'number' })}
          {cE('altura_arco_izq_mm', 'Altura de arco izq. (mm)', { type: 'number' })}{cE('altura_arco_der_mm', 'Altura de arco der. (mm)', { type: 'number' })}
          {cE('angulo_retropie_izq', 'Ángulo retropié izq. (°)', { type: 'number', step: '0.5' })}{cE('angulo_retropie_der', 'Ángulo retropié der. (°)', { type: 'number', step: '0.5' })}
          {cE('dismetria_mm', 'Dismetría de miembros (mm)', { type: 'number', step: '0.5', min: 0 })}
          <FormField label="Lado corto" as="select" options={[{ value: 'D', label: 'Derecho' }, { value: 'I', label: 'Izquierdo' }]} value={e.dismetria_lado} onChange={setEf('dismetria_lado')} disabled={!editEstudio} />
        </div>
        <div className="row">
          {cE('patron_marcha', 'Patrón de marcha')}{cE('desgaste_calzado', 'Desgaste de calzado')}
          <FormField label="Diagnóstico (CIE-10)" required value={e.cie10_codigo ?? ''} onChange={ev => setE(s => ({ ...s, cie10_codigo: ev.target.value.toUpperCase() }))} disabled={!editEstudio} list="cie-ort" hint="p. ej. M21.4 Pie plano adquirido" />
          <datalist id="cie-ort">{(equipos.data?.filas ?? []).map(c => <option key={c.codigo} value={c.codigo}>{c.descripcion}</option>)}</datalist>
          {cE('actividad', 'Actividad')}{cE('calzado_habitual', 'Calzado habitual')}{cE('peso_kg', 'Peso (kg)', { type: 'number', step: '0.1' })}{cE('costo', 'Costo del estudio', { type: 'number', step: '0.01' })}
        </div>
        {puede && !estudioFirmado && <button type="button" className="btn o sm" disabled={!estudioId || ocupado} onClick={() => setFirma('estudio')} title={!estudioId ? 'Guarda primero el borrador' : ''}>Firmar estudio</button>}
      </Seccion>

      <Seccion titulo="Orden de fabricación" acciones={<StatusBadge estado={estado} />}>
        <div className="row">
          <FormField label="Folio de orden" value={orden.data?.folio ?? 'Se asigna al guardar'} readOnly />
          {cO('modelo', 'Modelo', { required: true })}{cO('material', 'Material', { required: true })}{cO('cuna_realce', 'Cuña / realce')}
          <FormField label="Cobertura" required as="select" options={COBERTURAS} value={o.cobertura} onChange={setOf('cobertura')} disabled={!editOrden} />
          {cO('pares', 'Pares', { type: 'number', min: 1, required: true })}
          <FormField label="Laboratorio / fabricante" required as="select" options={(labs.data?.filas ?? []).map(l => ({ value: l.id, label: l.nombre }))} value={o.laboratorio_id} onChange={setOf('laboratorio_id')} disabled={!editOrden} />
        </div>
        <div className="row">
          <FormField label="Entrega estimada" value={orden.data?.entrega_estimada ? fecha(orden.data.entrega_estimada) : labSel ? `${labSel.dias_entrega_habiles} días hábiles tras el envío` : '—'} readOnly />
          {cO('precio', 'Precio plantillas', { type: 'number', step: '0.01', required: true })}{cO('anticipo_monto', 'Anticipo', { type: 'number', step: '0.01', hint: 'Mínimo 50 % del precio para enviar (P-075)' })}
          <FormField label="Forma del anticipo" as="select" options={['efectivo', 'tarjeta', 'transferencia', 'clip'].map(x => ({ value: x, label: x }))} value={o.anticipo_forma} onChange={setOf('anticipo_forma')} disabled={!editOrden} />
          {cO('garantia_meses', 'Garantía (meses)', { type: 'number', min: 0 })}
        </div>
        {cO('indicaciones_laboratorio', 'Indicaciones al laboratorio', { as: 'textarea' })}
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!o.avisar_whatsapp} disabled={!editOrden} onChange={setOf('avisar_whatsapp')} /> Avisar por WhatsApp cuando llegue del laboratorio (el envío real requiere proveedor; hoy es un recordatorio interno)</label>
        {estado === 'entregada' && orden.data && (
          <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.8 }}>
            <b>Entrega:</b> {fecha(orden.data.fecha_entrega)} · <b>Garantía hasta:</b> {fecha(orden.data.garantia_hasta)} · <b>Revisión de ajuste:</b> {fecha(orden.data.revision_ajuste_fecha)} · <b>Renovación sugerida:</b> {fecha(orden.data.renovacion_desde)} a {fecha(orden.data.renovacion_hasta)}
            <br />Cubre defectos de fabricación y ajustes sin costo.
          </div>)}
        {estado === 'recibida' && <label style={{ display: 'block', fontSize: 13, marginTop: 8 }}><input type="checkbox" checked={!!o.ajuste_realizado} onChange={setOf('ajuste_realizado')} /> Ajuste de entrega realizado</label>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(editEstudio || editOrden) && <button type="button" className="btn o" disabled={ocupado} onClick={guardar}>Guardar borrador</button>}
          {id && puede && sigTxt && <button type="button" className="btn" disabled={ocupado} onClick={avanzar}>{sigTxt}</button>}
          {id && puede && !cerrada && <button type="button" className="btn red" disabled={ocupado} onClick={cancelar}>Cancelar orden</button>}
          {id && (
            <ImprimirHoja titulo={`Orden ${orden.data?.folio ?? ''} · plantillas ortopédicas`} entidad="ordenes_plantilla" entidadId={id} etiqueta="Imprimir orden">
              <p><b>Paciente:</b> {paciente?.nombre_completo} · {paciente?.numero_expediente}</p>
              <p><b>Laboratorio:</b> {labSel?.nombre} · <b>Modelo:</b> {o.modelo} · <b>Material:</b> {o.material} · <b>Cobertura:</b> {etiquetaDe(COBERTURAS, o.cobertura)} · <b>Pares:</b> {o.pares}</p>
              <p><b>Medidas:</b> longitud {e.longitud_izq_mm}/{e.longitud_der_mm} mm · ancho MT {e.ancho_metatarsal_izq_mm}/{e.ancho_metatarsal_der_mm} · arco {e.altura_arco_izq_mm}/{e.altura_arco_der_mm} · retropié {e.angulo_retropie_izq}°/{e.angulo_retropie_der}° · dismetría {e.dismetria_mm} mm {e.dismetria_lado}</p>
              <p><b>Cuña/realce:</b> {o.cuna_realce || '—'}</p><p><b>Indicaciones:</b> {o.indicaciones_laboratorio || '—'}</p><p>Precio {moneda(num(o.precio))} · anticipo {moneda(num(o.anticipo_monto))}</p>
            </ImprimirHoja>)}
        </div>
      </Seccion>
      {firma === 'estudio' && <FirmaDialogo open titulo="Firma del estudio de pisada" firmante={{ tipo: 'podologo', usuarioId: perfil.id, nombre: nombreP, cedula: perfil.cedula }} documento={{ tipo: 'estudio_pisada', id: estudioId }} onClose={() => setFirma(null)} onFirmada={firmarEstudio} />}
      {firma === 'entrega' && <FirmaDialogo open titulo="Conformidad del paciente en la entrega" firmante={{ tipo: 'paciente', pacienteId: paciente?.id, nombre: paciente?.nombre_completo }} canal="recepcion_pantalla" documento={{ tipo: 'entrega_plantilla', id }} onClose={() => setFirma(null)} onFirmada={entregar} textoConfirmar="Firmar conformidad y entregar" />}
      {dialogo}
    </div>
  )
}
