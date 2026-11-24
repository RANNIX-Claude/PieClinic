// Utilerías · Salud del sistema y registro de errores. Lee la RPC salud_sistema() y la tabla log_errores (migración 062, solo Administrador).
// Semáforo de integridad (RLS, vistas security_invoker), actividad de las últimas 24 h, usuarios por rol y bandeja de errores con "marcar resuelto".
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { HeartPulse, RefreshCw, ShieldCheck, Bug, History, Users, Database, HardDrive, Bell } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { rpc, leer, actualizar } from '../../lib/api'
import { registrarError } from '../../lib/errores'
import { fechaHora, numero } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import { errMsg, EstadoConsulta } from './comun'

export default function Salud() {
  const { user } = useApp()
  const qc = useQueryClient()
  const [soloPendientes, setSoloPendientes] = useState(true)
  const salud = useQuery({ queryKey: ['salud'], queryFn: async () => { const r = await rpc('salud_sistema'); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })
  const errores = useQuery({
    queryKey: ['errores', soloPendientes],
    queryFn: async () => {
      const r = await leer('log_errores', { sedeCol: false, filtros: soloPendientes ? { resuelto: false } : {}, orden: [{ columna: 'created_at', asc: false }], limite: 500 })
      if (r.error) throw new Error(errMsg(r.error))
      return r.data
    }, retry: false,
  })
  const s = salud.data
  const sinRls = s?.tablas_sin_rls ?? []
  const sinInvoker = s?.vistas_sin_invoker ?? []
  const integridad = sinRls.length === 0 && sinInvoker.length === 0

  async function resolver(f) {
    const r = await actualizar('log_errores', f.id, { resuelto: true, resuelto_por: user?.id, resuelto_en: new Date().toISOString() })
    if (r.error) return toast.error(errMsg(r.error))
    toast.success('Error marcado como resuelto')
    qc.invalidateQueries({ queryKey: ['errores'] }); qc.invalidateQueries({ queryKey: ['salud'] })
  }
  async function probar() {
    await registrarError({ mensaje: 'Error de prueba generado desde Salud del sistema', detalle: 'Sirve para verificar que el registro de errores funciona.', ruta: '/utilerias/salud' })
    setTimeout(() => { qc.invalidateQueries({ queryKey: ['errores'] }); qc.invalidateQueries({ queryKey: ['salud'] }) }, 800)
    toast('Error de prueba enviado')
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Salud del sistema" subtitulo="Integridad, actividad y errores de la aplicación"
        acciones={<>
          <button className="btn o sm" onClick={probar}><Bug size={13} style={{ verticalAlign: -2 }} /> Generar error de prueba</button>
          <button className="btn sm" onClick={() => { salud.refetch(); errores.refetch() }}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> Actualizar</button>
        </>} />
      <EstadoConsulta q={salud} />
      {s && (
        <>
          <div className="grid-kpis">
            <KPICard title="Integridad" icon={ShieldCheck} color={integridad ? 'var(--green)' : 'var(--red)'} value={integridad ? 'Correcta' : 'Revisar'}
              subtitle={integridad ? `${s.tablas} tablas con RLS y vistas seguras` : `${sinRls.length} tablas sin RLS · ${sinInvoker.length} vistas sin security_invoker`} />
            <KPICard title="Errores 24 h" icon={Bug} color={s.errores_24h > 0 ? 'var(--gold)' : 'var(--green)'} value={numero(s.errores_24h)} subtitle={`${numero(s.errores_7d)} en 7 días · ${numero(s.errores_sin_resolver)} sin resolver`} />
            <KPICard title="Eventos de bitácora 24 h" icon={History} color="var(--accent2)" value={numero(s.bitacora_24h)} subtitle={`${numero(s.bitacora_total)} en total`} />
            <KPICard title="Usuarios activos" icon={Users} value={numero(s.usuarios_activos)}
              subtitle={Object.entries(s.usuarios_por_rol ?? {}).map(([r, n]) => `${n} ${r}`).join(' · ')} />
            <KPICard title="Migraciones" icon={Database} color="var(--accent2)" value={numero(s.migraciones_aplicadas)} subtitle={s.ultima_migracion} />
            <KPICard title="Base de datos" icon={HardDrive} color="var(--muted)" value={`${numero(s.tamano_bd_mb)} MB`} subtitle={`${s.tablas} tablas`} />
          </div>
          <div className="card" style={{ margin: '14px 0', fontSize: 12.5, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <span><b>Clínica:</b> {s.organizacion?.nombre} ({s.organizacion?.estado}, plan {s.organizacion?.plan})</span>
            <span><b>Zona horaria:</b> {s.organizacion?.zona_horaria}</span>
            <span><b>Último acceso:</b> {s.ultimo_acceso ? fechaHora(s.ultimo_acceso) : '—'}</span>
            <span><b>Corte:</b> {fechaHora(s.generado_en)}</span>
            {!integridad && <span style={{ color: 'var(--red)' }}><b>Detalle:</b> {[...sinRls, ...sinInvoker].join(', ')}</span>}
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 8px' }}>
        <h3 style={{ margin: 0, fontSize: 14, flex: 1 }}><Bell size={14} style={{ verticalAlign: -2 }} /> Registro de errores</h3>
        <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} /> Solo sin resolver</label>
      </div>
      <EstadoConsulta q={errores} />
      {!errores.isLoading && !errores.isError && (
        <DataTable filas={errores.data ?? []} tamanoPagina={15} exportarNombre="registro_errores" placeholderBusqueda="Buscar en errores…"
          vacio={{ title: 'Sin errores registrados', description: 'Cuando la aplicación detecte un error aparecerá aquí con su ruta, usuario y detalle.', icon: HeartPulse }}
          columnas={[
            { key: 'created_at', label: 'Cuándo', render: f => fechaHora(f.created_at), valor: f => f.created_at, ancho: 150 },
            { key: 'rol', label: 'Rol', filtro: true, ancho: 100 },
            { key: 'origen', label: 'Origen', filtro: true, ancho: 90 },
            { key: 'ruta', label: 'Ruta' },
            { key: 'mensaje', label: 'Mensaje', render: f => <span title={f.detalle ?? ''}>{f.mensaje}</span> },
            { key: 'resuelto', label: 'Estado', valor: f => (f.resuelto ? 'Resuelto' : 'Pendiente'), filtro: true, ancho: 90 },
            { key: 'acc', label: '', sortable: false, exportar: false, render: f => (f.resuelto ? null : <button className="btn sm o" onClick={() => resolver(f)}>Resolver</button>) },
          ]} />
      )}
    </div>
  )
}
