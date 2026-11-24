// Incidencias de RH (E126) y catálogo de tipos (P-110: qué descuenta). Clon de TabIncidencias de IRP.
import { useState } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import StatusBadge from '../../../../components/ui/StatusBadge'
import KPICard from '../../../../components/ui/KPICard'
import { useConfirmacion } from '../../../../components/ui/ConfirmDialog'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar } from '../../../../lib/api'
import { moneda, fecha } from '../../../../lib/formato'
import { useVista, Estado, useEscribir, hoy } from '../comun'

export default function TabIncidencias() {
  const puede = usePermiso('rh.editar')
  const { ejecutar, ocupado } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const [mes, setMes] = useState(hoy().slice(0, 7))
  const desde = `${mes}-01`, hasta = `${mes}-31`
  const q = useVista(['incidencias', mes], 'prp_incidencias_rh', { filtros: { fecha: { gte: desde, lte: hasta } }, orden: [{ columna: 'fecha', asc: false }], limite: 1000 })
  const qt = useVista('tipos-incidencia', 'prp_tipos_incidencia', { orden: [{ columna: 'orden' }] }, { conSede: false })
  const qe = useVista('empleados-activos', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 500 })
  const [nueva, setNueva] = useState(null)
  const [tipoEd, setTipoEd] = useState(null)
  const tipo = (qt.data ?? []).find(t => t.id === nueva?.tipo_id)

  const guardar = async () => {
    const emp = (qe.data ?? []).find(e => e.id === nueva.empleado_id)
    if (!emp || !tipo || !nueva.fecha) { toast.error('Empleado, tipo y fecha son obligatorios'); return }
    if (tipo.requiere_monto && !(Number(nueva.monto) > 0)) { toast.error('Este tipo exige un monto'); return }
    if (nueva.fecha_fin && nueva.fecha_fin < nueva.fecha) { toast.error('La fecha final no puede ser anterior a la inicial'); return }
    const ok = await ejecutar(() => insertar('incidencias_rh', { sede_id: emp.sede_id, empleado_id: emp.id, tipo_id: tipo.id, fecha: nueva.fecha, fecha_fin: nueva.fecha_fin || null, monto: tipo.requiere_monto ? Number(nueva.monto) : null, motivo: nueva.motivo || null }), 'Incidencia registrada')
    if (ok) setNueva(null)
  }
  const anular = async i => {
    const motivo = await confirmar({ titulo: 'Anular incidencia', mensaje: `${i.tipo} de ${i.nombre_completo} (${fecha(i.fecha)}). Dejará de descontar.`, textoConfirmar: 'Anular', peligro: true, pedirMotivo: true })
    if (motivo) ejecutar(() => actualizar('incidencias_rh', i.id, { estado: 'anulada', motivo: `${i.motivo ? `${i.motivo} · ` : ''}ANULADA: ${motivo}` }), 'Incidencia anulada')
  }
  const guardarTipo = async () => {
    const t = tipoEd
    if (!t.clave?.trim() || !t.descripcion?.trim()) { toast.error('Clave y descripción son obligatorias'); return }
    const fila = { clave: t.clave.trim().toLowerCase().replace(/\s+/g, '_'), descripcion: t.descripcion.trim(), descuenta: !!t.descuenta, requiere_monto: !!t.requiere_monto, orden: Number(t.orden) || 99, activo: t.activo !== false }
    const ok = await ejecutar(() => (t.id ? actualizar('tipos_incidencia_rh', t.id, fila) : insertar('tipos_incidencia_rh', fila)), 'Tipo guardado')
    if (ok) setTipoEd(null)
  }
  const filas = q.data ?? []
  const vigentes = filas.filter(i => i.estado !== 'anulada')
  return (
    <>
      <div className="grid-kpis">
        <KPICard title="Incidencias del mes" value={vigentes.length} loading={q.isLoading} />
        <KPICard title="Que descuentan" value={vigentes.filter(i => i.descuenta).length} color="var(--red)" loading={q.isLoading} />
        <KPICard title="Monto fijo a descontar" value={moneda(vigentes.filter(i => i.descuenta).reduce((s, i) => s + Number(i.monto ?? 0), 0))} subtitle="Las de días se prorratean al calcular la nómina" loading={q.isLoading} />
      </div>
      <div className="toolbar">
        <FormField label="Mes" type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} style={{ maxWidth: 180 }} />
        {puede && <><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setNueva({ empleado_id: '', tipo_id: '', fecha: hoy(), fecha_fin: '', monto: '', motivo: '' })}><Plus size={12} style={{ verticalAlign: -2 }} /> Nueva incidencia</button>
          <button className="btn o sm" onClick={() => setTipoEd({ descuenta: false, requiere_monto: false, orden: 99, activo: true })}>+ Tipo de incidencia</button></>}
      </div>
      <Estado q={q}>
        <DataTable exportarNombre={`incidencias_${mes}`} filas={filas} vacio={{ title: 'Sin incidencias', description: 'No hay incidencias en el mes elegido.' }}
          columnas={[
            { key: 'fecha', label: 'Fecha', render: i => `${fecha(i.fecha)}${i.fecha_fin && i.fecha_fin !== i.fecha ? ` – ${fecha(i.fecha_fin)}` : ''}`, valor: i => i.fecha },
            { key: 'nombre_completo', label: 'Empleado' },
            { key: 'tipo', label: 'Tipo', filtro: true },
            { key: 'dias', label: 'Días', align: 'right' },
            { key: 'descuenta', label: 'Descuenta', filtro: true, valor: i => (i.descuenta ? 'Sí' : 'No') },
            { key: 'monto', label: 'Monto', align: 'right', render: i => (i.monto == null ? '—' : moneda(i.monto)) },
            { key: 'motivo', label: 'Motivo' },
            { key: 'estado', label: 'Estado', filtro: true, render: i => <StatusBadge estado={i.estado} /> },
            { key: 'a', label: '', sortable: false, exportar: false, render: i => puede && i.estado === 'registrada' && <button className="btn o sm" onClick={() => anular(i)}>Anular</button> },
          ]} />
      </Estado>
      <h3 style={{ margin: '18px 0 8px', fontSize: 13 }}>Tipos de incidencia</h3>
      <Estado q={qt}>
        <DataTable buscador={false} sinPaginacion filas={qt.data ?? []} vacio={{ title: 'Sin tipos', description: 'Crea los tipos de incidencia de la clínica.' }}
          columnas={[
            { key: 'descripcion', label: 'Tipo' }, { key: 'clave', label: 'Clave' },
            { key: 'descuenta', label: '¿Descuenta en nómina?', render: t => (t.descuenta ? <span className="bd r">Sí</span> : <span className="bd n">No</span>) },
            { key: 'requiere_monto', label: 'Pide monto', render: t => (t.requiere_monto ? 'Sí' : 'No') },
            { key: 'a', label: '', render: t => puede && <button className="btn o sm" onClick={() => setTipoEd({ ...t })}>Editar</button> },
          ]} />
      </Estado>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Parámetros por clínica (P-110): retardo no descuenta; permiso sin goce sí; incapacidad según ley. Validar con asesoría laboral.</div>
      <Modal open={!!nueva} onClose={() => setNueva(null)} title="Nueva incidencia" size="sm" footer={<><button className="btn o" onClick={() => setNueva(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {nueva && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Empleado" as="select" options={(qe.data ?? []).map(e => ({ value: e.id, label: `${e.numero_empleado} · ${e.nombre_completo}` }))} value={nueva.empleado_id} onChange={e => setNueva({ ...nueva, empleado_id: e.target.value })} />
          <FormField label="Tipo" as="select" options={(qt.data ?? []).map(t => ({ value: t.id, label: `${t.descripcion}${t.descuenta ? ' (descuenta)' : ''}` }))} value={nueva.tipo_id} onChange={e => setNueva({ ...nueva, tipo_id: e.target.value })} />
          <FormField label="Desde" type="date" value={nueva.fecha} onChange={e => setNueva({ ...nueva, fecha: e.target.value })} />
          <FormField label="Hasta (opcional)" type="date" value={nueva.fecha_fin} onChange={e => setNueva({ ...nueva, fecha_fin: e.target.value })} />
          {tipo?.requiere_monto && <FormField label="Monto (MXN)" type="number" step="0.01" value={nueva.monto} onChange={e => setNueva({ ...nueva, monto: e.target.value })} />}
          <FormField label="Motivo" as="textarea" value={nueva.motivo} onChange={e => setNueva({ ...nueva, motivo: e.target.value })} />
        </div>}
      </Modal>
      <Modal open={!!tipoEd} onClose={() => setTipoEd(null)} title={tipoEd?.id ? 'Editar tipo' : 'Nuevo tipo de incidencia'} size="sm" footer={<><button className="btn o" onClick={() => setTipoEd(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardarTipo}>Guardar</button></>}>
        {tipoEd && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Descripción" value={tipoEd.descripcion ?? ''} onChange={e => setTipoEd({ ...tipoEd, descripcion: e.target.value })} />
          <FormField label="Clave" value={tipoEd.clave ?? ''} disabled={!!tipoEd.id} onChange={e => setTipoEd({ ...tipoEd, clave: e.target.value })} />
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!tipoEd.descuenta} onChange={e => setTipoEd({ ...tipoEd, descuenta: e.target.checked })} /> Descuenta en nómina</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!tipoEd.requiere_monto} onChange={e => setTipoEd({ ...tipoEd, requiere_monto: e.target.checked })} /> Pide monto</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={tipoEd.activo !== false} onChange={e => setTipoEd({ ...tipoEd, activo: e.target.checked })} /> Activo</label>
        </div>}
      </Modal>
      {dialogo}
    </>
  )
}
