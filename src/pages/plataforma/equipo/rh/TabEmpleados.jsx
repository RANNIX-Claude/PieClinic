import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import DataTable from '../../../../components/ui/DataTable'
import KPICard from '../../../../components/ui/KPICard'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { usePermiso } from '../../../../lib/permisos'
import { moneda, fecha } from '../../../../lib/formato'
import { useVista, Estado, etiquetaPuesto, enmascararClabe } from '../comun'
import ModalEmpleado from './ModalEmpleado'

export function Medidor({ datos = 0, total = 9, docs = 0, docsTotal = 6 }) {
  const pct = Math.round(((datos + docs) / (total + docsTotal)) * 100)
  const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? 'var(--gold)' : 'var(--red)'
  return (
    <div title={`${datos}/${total} datos · ${docs}/${docsTotal} documentos`} style={{ minWidth: 90 }}>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 4 }}><div style={{ width: `${pct}%`, height: 6, background: color, borderRadius: 4 }} /></div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{pct}% del expediente</div>
    </div>
  )
}

export default function TabEmpleados({ nuevo, onNuevoCerrado }) {
  const nav = useNavigate()
  const editar = usePermiso('rh.editar')
  const q = useVista('empleados', 'prp_empleados', { orden: [{ columna: 'numero_empleado' }], limite: 1000 })
  const qExp = useVista('expedientes', 'prp_expediente_empleado', { limite: 1000 }, { conSede: false })
  const [sel, setSel] = useState(null)
  const [verBajas, setVerBajas] = useState(false)
  const exp = useMemo(() => Object.fromEntries((qExp.data ?? []).map(e => [e.empleado_id, e])), [qExp.data])
  const filas = useMemo(() => (q.data ?? []).filter(e => verBajas || e.estado !== 'baja'), [q.data, verBajas])
  const activos = (q.data ?? []).filter(e => e.estado === 'activo')
  const porPuesto = p => activos.filter(e => e.puesto === p).length
  const siguiente = useMemo(() => {
    const nums = (q.data ?? []).map(e => parseInt(String(e.numero_empleado).replace(/\D/g, ''), 10)).filter(Number.isFinite)
    return `E${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
  }, [q.data])

  const columnas = [
    { key: 'numero_empleado', label: 'No.', ancho: 70 },
    { key: 'nombre_completo', label: 'Empleado', render: e => <b>{e.nombre_completo}</b> },
    { key: 'puesto', label: 'Puesto', filtro: true, valor: e => etiquetaPuesto(e.puesto) },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'esquema_contratacion', label: 'Esquema', filtro: true, valor: e => (e.esquema_contratacion === 'nomina' ? 'Nómina' : 'Honorarios') },
    { key: 'estado', label: 'Estado', filtro: true, render: e => <StatusBadge estado={e.estado} /> },
    { key: 'fecha_ingreso', label: 'Ingreso', render: e => fecha(e.fecha_ingreso) },
    { key: 'antiguedad_anios', label: 'Antigüedad', align: 'right', render: e => (e.antiguedad_anios == null ? '—' : `${e.antiguedad_anios} año(s)`) },
    { key: 'banco', label: 'Banco / CLABE', valor: e => `${e.banco ?? ''} ${enmascararClabe(e.clabe, false)}`, render: e => `${e.banco ?? '—'} ${enmascararClabe(e.clabe, false)}` },
    { key: 'salario_periodo', label: 'Salario periodo', align: 'right', render: e => moneda(e.salario_periodo) },
    { key: 'exp', label: 'Expediente', sortable: false, exportar: false, render: e => <Medidor datos={exp[e.id]?.datos_presentes} total={exp[e.id]?.datos_total} docs={exp[e.id]?.documentos_presentes} docsTotal={exp[e.id]?.documentos_total} /> },
    { key: 'acc', label: '', sortable: false, exportar: false, render: e => editar && <button className="btn o sm" onClick={ev => { ev.stopPropagation(); setSel(e) }}><Pencil size={12} /> Editar</button> },
  ]
  return (
    <>
      <div className="grid-kpis">
        <KPICard title="Empleados activos" value={activos.length} subtitle={`${porPuesto('podologo')} podólogos · ${porPuesto('recepcion')} recepción · ${porPuesto('apoyo')} apoyo`} loading={q.isLoading} />
        <KPICard title="Nómina mensual aprox." value={moneda(activos.reduce((s, e) => s + Number(e.salario_periodo) * ({ semanal: 4.33, quincenal: 2, mensual: 1 }[e.periodicidad_pago] ?? 1), 0))} subtitle="Salarios base de activos" loading={q.isLoading} />
        <KPICard title="Con sesión en el sistema" value={activos.filter(e => e.tiene_sesion).length} subtitle="Pueden ver sus recibos" loading={q.isLoading} />
        <KPICard title="Expedientes incompletos" value={activos.filter(e => { const x = exp[e.id]; return !x || x.documentos_presentes < x.documentos_total }).length} color="var(--gold)" subtitle="Faltan documentos obligatorios" loading={q.isLoading || qExp.isLoading} />
      </div>
      <Estado q={q} vacio={{ title: 'Sin empleados', description: 'Da de alta al primer empleado con «Nuevo empleado».' }}>
        <DataTable columnas={columnas} filas={filas} exportarNombre="empleados" onFila={e => nav(`/rh/empleado/${e.id}`)} placeholderBusqueda="Buscar por nombre, número, puesto…"
          acciones={<label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} /> Ver bajas</label>} />
      </Estado>
      <ModalEmpleado abierto={nuevo || !!sel} empleado={sel} siguienteNumero={siguiente} onClose={() => { setSel(null); onNuevoCerrado?.() }} />
    </>
  )
}
