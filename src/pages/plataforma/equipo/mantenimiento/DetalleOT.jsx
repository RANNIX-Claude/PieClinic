// Detalle de una OT: datos, historial, evidencias y acciones del flujo (solicitado → autorizado → en proceso → cerrado / rechazado).
import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { actualizar, rpc } from '../../../../lib/api'
import { urlFirmada, BUCKETS } from '../../../../lib/urlFirmada'
import { moneda, fecha, fechaHora } from '../../../../lib/formato'
import { useVista, Estado, useEscribir, Dato, hoy } from '../comun'
import { subirEvidencia } from './evidencias'

function Evidencia({ e }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let vivo = true; urlFirmada(BUCKETS.documentos, e.storage_path, 600).then(u => vivo && setUrl(u)); return () => { vivo = false } }, [e.storage_path])
  const esPdf = e.mime === 'application/pdf'
  return (
    <a href={url ?? undefined} target="_blank" rel="noopener noreferrer" style={{ width: 96, textAlign: 'center', fontSize: 11, textDecoration: 'none', color: 'var(--text)' }} title={e.nombre}>
      {esPdf || !url ? <div style={{ height: 72, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={26} color="var(--muted)" /></div>
        : <img src={url} alt={e.nombre} style={{ height: 72, width: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nombre}</div>
      <div style={{ color: 'var(--muted)' }}>{e.momento}</div>
    </a>
  )
}

export default function DetalleOT({ id, ots, equipos, onClose }) {
  const gestionar = usePermiso('mantenimiento.gestionar')
  const { organizacion, sedes } = useApp()
  const { ejecutar, ocupado, refrescar } = useEscribir()
  const o = ots.find(x => x.id === id)
  const qh = useVista(['ot-hist', id], 'prp_ot_historial', { filtros: { orden_id: id }, orden: [{ columna: 'fecha' }] }, { conSede: false, habilitado: !!id })
  const qe = useVista(['ot-evid', id], 'prp_ot_evidencias', { filtros: { orden_id: id }, orden: [{ columna: 'created_at' }] }, { conSede: false, habilitado: !!id })
  const qp = useVista('prov-mant', 'prp_proveedores', { filtros: { activo: true }, orden: [{ columna: 'nombre' }], limite: 300 }, { conSede: false, habilitado: !!id && gestionar })
  const [acc, setAcc] = useState(null) // { tipo: 'rechazar'|'cerrar'|'editar'|'iniciar', ... }
  useEffect(() => { setAcc(null) }, [id])
  if (!o) return null
  const equipo = equipos.find(e => e.id === o.equipo_id)
  const cambiar = (estatus, extra = {}, ok) => ejecutar(() => actualizar('ordenes_trabajo', o.id, { estatus, ...extra }), ok).then(r => { if (r) setAcc(null) })

  const subir = async (e, momento) => {
    const archivos = [...(e.target.files ?? [])]; e.target.value = ''
    for (const a of archivos) { const r = await subirEvidencia({ organizacionId: organizacion.id, ordenId: o.id, archivo: a, momento }); if (r.error) toast.error(r.error.message) }
    if (archivos.length) { toast.success('Evidencia subida'); refrescar() }
  }
  const asignar = acc?.tipo === 'editar' ? acc : null
  const guardarEdicion = () => {
    const prov = qp.data?.find(p => p.id === asignar.proveedor_id)
    ejecutar(() => actualizar('ordenes_trabajo', o.id, {
      asignado_interno: asignar.asignar === 'interno', asignado_proveedor_id: asignar.asignar === 'proveedor' ? asignar.proveedor_id || null : null,
      asignado_texto: asignar.asignar === 'interno' ? 'Mantenimiento interno' : asignar.asignar === 'proveedor' ? prov?.nombre ?? asignar.texto ?? null : asignar.texto || null,
      programada_para: asignar.programada_para || null, costo_estimado: asignar.costo_estimado === '' ? null : Number(asignar.costo_estimado), nota_cambio: null }), 'Orden actualizada').then(r => { if (r) setAcc(null) })
  }
  const cerrar = () => {
    if (acc.costo_real === '' || Number(acc.costo_real) < 0) { toast.error('Cerrar la OT exige el costo real'); return }
    cambiar('cerrado', { costo_real: Number(acc.costo_real), resultado: acc.resultado || null, fecha_cierre: acc.fecha_cierre || hoy(), proximo_servicio_equipo: acc.proximo || null, nota_cambio: acc.resultado || 'Orden cerrada' }, 'Orden cerrada; el equipo vuelve a vigente')
  }
  return (
    <Modal open onClose={onClose} size="wide" title={`${o.folio} · ${o.categoria}`}
      footer={gestionar && <>
        {o.estatus === 'solicitado' && <><button className="btn green" disabled={ocupado} onClick={() => cambiar('autorizado', { nota_cambio: 'Autorizada' }, 'Orden autorizada')}>Autorizar</button>
          <button className="btn red" onClick={() => setAcc({ tipo: 'rechazar', motivo: '' })}>Rechazar</button>
          {o.tipo === 'urgente' && <button className="btn o" disabled={ocupado} onClick={() => cambiar('en_proceso', { nota_cambio: 'Iniciada antes de autorizar (urgente)' }, 'Atención iniciada; queda pendiente regularizar la autorización')}>Iniciar ya (urgente)</button>}</>}
        {o.estatus === 'autorizado' && <button className="btn" disabled={ocupado} onClick={() => cambiar('en_proceso', { nota_cambio: 'Inicia la atención' }, 'Orden en proceso')}>Iniciar atención</button>}
        {o.autorizacion_pendiente && <button className="btn gold" disabled={ocupado} onClick={() => ejecutar(() => rpc('ot_regularizar', { p_orden: o.id }), 'Autorización regularizada')}>Regularizar autorización</button>}
        {['autorizado', 'en_proceso'].includes(o.estatus) && <button className="btn green" onClick={() => setAcc({ tipo: 'cerrar', costo_real: o.costo_estimado ?? '', resultado: '', fecha_cierre: hoy(), proximo: '' })}>Cerrar orden</button>}
        {!['cerrado', 'rechazado'].includes(o.estatus) && <button className="btn o" onClick={() => setAcc({ tipo: 'editar', asignar: o.asignado_interno ? 'interno' : o.asignado_proveedor_id ? 'proveedor' : 'otro', proveedor_id: o.asignado_proveedor_id ?? '', texto: o.asignado_texto ?? '', programada_para: o.programada_para ?? '', costo_estimado: o.costo_estimado ?? '' })}>Asignar / programar</button>}
      </>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <StatusBadge estado={o.estatus} /><span className={`bd ${o.tipo === 'urgente' ? 'r' : o.tipo === 'preventivo' ? 'b' : 'n'}`}>{o.tipo.toUpperCase()}</span>
        {o.autorizacion_pendiente && <span className="bd a">Autorización por regularizar (P-112)</span>}
      </div>
      <div className="grid2">
        <div><Dato k="Descripción" v={o.descripcion} /><Dato k="Sede" v={o.sede_nombre ?? sedes.find(s => s.id === o.sede_id)?.nombre} /><Dato k="Equipo" v={equipo ? `${equipo.nombre}${equipo.serie ? ` · serie ${equipo.serie}` : ''}` : o.equipo_nombre} /><Dato k="Solicitada" v={fecha(o.fecha)} />
          {o.motivo_rechazo && <Dato k="Motivo de rechazo" v={o.motivo_rechazo} />}</div>
        <div><Dato k="Asignado a" v={o.asignado_interno ? 'Mantenimiento interno' : o.asignado_texto} /><Dato k="Programada" v={o.programada_para ? fecha(o.programada_para) : null} /><Dato k="Costo estimado" v={o.costo_estimado != null ? moneda(o.costo_estimado) : null} /><Dato k="Costo real" v={o.costo_real != null ? moneda(o.costo_real) : null} />
          {o.fecha_cierre && <Dato k="Cierre" v={`${fecha(o.fecha_cierre)}${o.resultado ? ` · ${o.resultado}` : ''}`} />}</div>
      </div>
      <h3 style={{ margin: '10px 0 6px', fontSize: 13 }}>Evidencias</h3>
      <Estado q={qe}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>{(qe.data ?? []).length ? qe.data.map(e => <Evidencia key={e.id} e={e} />) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Sin evidencias.</span>}</div>
      </Estado>
      {!['rechazado'].includes(o.estatus) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label className="btn o sm" style={{ cursor: 'pointer' }}>+ Foto / PDF de la solicitud<input type="file" hidden multiple accept="image/*,application/pdf" onChange={e => subir(e, 'solicitud')} /></label>
        {gestionar && <label className="btn o sm" style={{ cursor: 'pointer' }}>+ Evidencia del resultado<input type="file" hidden multiple accept="image/*,application/pdf" onChange={e => subir(e, 'resultado')} /></label>}
      </div>}
      <h3 style={{ margin: '14px 0 6px', fontSize: 13 }}>Historial</h3>
      <Estado q={qh}>
        <table><tbody>{(qh.data ?? []).map(h => <tr key={h.id}><td style={{ whiteSpace: 'nowrap', paddingRight: 12, color: 'var(--muted)', fontSize: 12 }}>{fechaHora(h.fecha)}</td><td>{h.estatus_anterior ? `${h.estatus_anterior} → ` : ''}<b>{h.estatus_nuevo}</b></td><td style={{ color: 'var(--muted)', fontSize: 12 }}>{h.nota}</td></tr>)}</tbody></table>
      </Estado>

      <Modal open={acc?.tipo === 'rechazar'} onClose={() => setAcc(null)} size="sm" title="Rechazar solicitud" footer={<><button className="btn o" onClick={() => setAcc(null)}>Volver</button><button className="btn red" disabled={ocupado} onClick={() => (acc.motivo?.trim().length >= 3 ? cambiar('rechazado', { motivo_rechazo: acc.motivo.trim(), nota_cambio: `Rechazada: ${acc.motivo.trim()}` }, 'Solicitud rechazada') : toast.error('El rechazo exige motivo'))}>Rechazar</button></>}>
        <FormField label="Motivo del rechazo" as="textarea" value={acc?.motivo ?? ''} onChange={e => setAcc({ ...acc, motivo: e.target.value })} />
      </Modal>
      <Modal open={acc?.tipo === 'cerrar'} onClose={() => setAcc(null)} size="sm" title="Cerrar orden de trabajo" footer={<><button className="btn o" onClick={() => setAcc(null)}>Volver</button><button className="btn green" disabled={ocupado} onClick={cerrar}>Cerrar orden</button></>}>
        {acc?.tipo === 'cerrar' && <div style={{ display: 'grid', gap: 10 }}>
          {o.autorizacion_pendiente && <div style={{ color: 'var(--red)', fontSize: 12.5 }}>Regulariza primero la autorización de esta OT urgente.</div>}
          <FormField label="Costo real (MXN)" type="number" min="0" step="0.01" value={acc.costo_real} onChange={e => setAcc({ ...acc, costo_real: e.target.value })} />
          <FormField label="Fecha de cierre" type="date" value={acc.fecha_cierre} onChange={e => setAcc({ ...acc, fecha_cierre: e.target.value })} />
          <FormField label="Resultado" as="textarea" value={acc.resultado} onChange={e => setAcc({ ...acc, resultado: e.target.value })} />
          {o.equipo_id && <FormField label="Próximo servicio del equipo (opcional)" type="date" value={acc.proximo} onChange={e => setAcc({ ...acc, proximo: e.target.value })} hint="Si lo dejas vacío se calcula con la periodicidad del equipo." />}
        </div>}
      </Modal>
      <Modal open={!!asignar} onClose={() => setAcc(null)} size="sm" title="Asignar y programar" footer={<><button className="btn o" onClick={() => setAcc(null)}>Volver</button><button className="btn" disabled={ocupado} onClick={guardarEdicion}>Guardar</button></>}>
        {asignar && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Asignar a" as="select" options={[{ value: 'interno', label: 'Mantenimiento interno' }, { value: 'proveedor', label: 'Proveedor' }, { value: 'otro', label: 'Otro (texto libre)' }]} value={asignar.asignar} onChange={e => setAcc({ ...asignar, asignar: e.target.value })} />
          {asignar.asignar === 'proveedor' && <FormField label="Proveedor" as="select" options={(qp.data ?? []).map(p => ({ value: p.id, label: p.nombre }))} value={asignar.proveedor_id} onChange={e => setAcc({ ...asignar, proveedor_id: e.target.value })} />}
          {asignar.asignar === 'otro' && <FormField label="Responsable" value={asignar.texto} onChange={e => setAcc({ ...asignar, texto: e.target.value })} />}
          <FormField label="Programada para" type="date" value={asignar.programada_para} onChange={e => setAcc({ ...asignar, programada_para: e.target.value })} />
          <FormField label="Costo estimado (MXN)" type="number" min="0" step="0.01" value={asignar.costo_estimado} onChange={e => setAcc({ ...asignar, costo_estimado: e.target.value })} />
        </div>}
      </Modal>
    </Modal>
  )
}
