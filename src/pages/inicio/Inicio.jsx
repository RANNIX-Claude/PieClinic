import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Users, Receipt, TrendingUp, PackageX, Bell } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, contarFilas, esVistaInexistente } from '../../lib/api'
import { fechaLarga, hora, moneda, numero, limitesDelDia } from '../../lib/formato'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import PageHeader from '../../components/ui/PageHeader'
import InicioMovil from './InicioMovil'

// Convierte el resultado de una lectura en { valor, nota }: si la vista aún no existe o no hay conexión, no inventa cifras.
function nota(error) {
  if (!error) return null
  if (error.code === 'SIN_CONEXION') return 'Sin conexión'
  if (esVistaInexistente(error)) return 'Vista no disponible aún'
  return 'No se pudo leer'
}

function useKPI(clave, sedeId, fn, habilitado = true) {
  return useQuery({ queryKey: ['inicio', clave, sedeId], queryFn: fn, enabled: habilitado })
}

function InicioRannix() {
  return (
    <div className="pagina">
      <PageHeader titulo="Panel RANNIX" subtitulo="Superadministración de la plataforma (solo metadatos de uso y cobro)" />
      <div className="card"><EmptyState title="Panel en construcción" description="Las clínicas, planes y uso de la plataforma se agregan como módulo en src/routes y src/menu (grupo RANNIX)." /></div>
    </div>
  )
}

export default function Inicio() {
  const { rol, isMobile } = useApp()
  if (rol === 'rannix') return <InicioRannix />
  return isMobile ? <InicioMovil /> : <InicioClinica />
}

function InicioClinica() {
  const { perfil, rol, sedeActivaId, sedeActiva, organizacion } = useApp()
  const verFinanzas = usePermiso('dashboard.finanzas')

  const hoy = limitesDelDia()
  const citasHoy = useKPI('citas_hoy', sedeActivaId, async () => {
    const r = await contarFilas('prp_agenda', { sedeId: sedeActivaId, filtros: { inicio: { gte: hoy[0], lte: hoy[1] }, estado: { neq: 'cancelada' } } })
    return { valor: r.count, error: r.error }
  })
  const pacientes = useKPI('pacientes', sedeActivaId, async () => {
    const r = await contarFilas('prp_pacientes', { sedeCol: false })
    return { valor: r.count, error: r.error }
  })
  const sinCobro = useKPI('sin_cobro', sedeActivaId, async () => {
    const r = await contarFilas('prp_citas_sin_cobro', { sedeId: sedeActivaId })
    return { valor: r.count, error: r.error }
  }, rol !== 'podologo')
  const fin = useKPI('finanzas', sedeActivaId, async () => {
    const r = await leer('prp_kpis_finanzas', { sedeId: sedeActivaId })
    if (r.error) return { error: r.error }
    const suma = k => r.data.reduce((s, f) => s + Number(f[k] ?? 0), 0)
    return { ingresos: suma('ingresos_mes'), gastos: suma('gastos_mes'), bajoMinimo: suma('productos_bajo_minimo') }
  })
  const agenda = useQuery({
    queryKey: ['inicio', 'agenda_hoy', sedeActivaId],
    queryFn: () => leer('prp_agenda', { sedeId: sedeActivaId, filtros: { inicio: { gte: hoy[0], lte: hoy[1] } }, orden: { columna: 'inicio' }, limite: 100 }),
  })
  const alertas = useQuery({
    queryKey: ['inicio', 'alertas', sedeActivaId], enabled: verFinanzas,
    queryFn: () => leer('prp_alertas_financieras', { sedeId: sedeActivaId, limite: 6 }),
  })

  const v = q => (q.data?.error ? '—' : q.data?.valor != null ? numero(q.data.valor) : '—')
  const nt = q => nota(q.data?.error) ?? undefined
  const columnas = [
    { key: 'inicio', label: 'Hora', render: f => hora(f.inicio), valor: f => f.inicio, ancho: 80 },
    { key: 'paciente_nombre', label: 'Paciente' },
    { key: 'servicio_nombre', label: 'Servicio' },
    { key: 'podologo_nombre', label: 'Podólogo' },
    ...(!sedeActivaId ? [{ key: 'sede_nombre', label: 'Sede' }] : []),
    { key: 'estado', label: 'Estado', render: f => <StatusBadge estado={f.estado} /> },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo={`Hola, ${perfil?.nombre ?? ''}`}
        subtitulo={`${fechaLarga(new Date())} · ${sedeActiva?.nombre ?? 'Todas las sedes'}${organizacion ? ` · ${organizacion.nombre}` : ''}`} />

      <div className="grid-kpis">
        <KPICard title="Citas de hoy" icon={CalendarDays} value={v(citasHoy)} subtitle={nt(citasHoy) ?? 'Sin contar canceladas'} loading={citasHoy.isLoading} />
        <KPICard title="Pacientes" icon={Users} color="var(--accent2)" value={v(pacientes)} subtitle={nt(pacientes) ?? 'Registrados en la clínica'} loading={pacientes.isLoading} />
        {rol !== 'podologo' && <KPICard title="Citas sin cobro" icon={Receipt} color="var(--gold)" value={v(sinCobro)} subtitle={nt(sinCobro) ?? 'Atendidas sin ticket'} loading={sinCobro.isLoading} />}
        {verFinanzas && (
          <KPICard title="Ingresos del mes" icon={TrendingUp} color="var(--green)" loading={fin.isLoading}
            value={fin.data?.error ? '—' : moneda(fin.data?.ingresos)} subtitle={nota(fin.data?.error) ?? (fin.data ? `Gastos: ${moneda(fin.data.gastos)}` : undefined)} />
        )}
        <KPICard title="Productos bajo mínimo" icon={PackageX} color="var(--red)" loading={fin.isLoading}
          value={fin.data?.error ? '—' : numero(fin.data?.bajoMinimo)} subtitle={nota(fin.data?.error) ?? 'Revisa el inventario'} />
      </div>

      <div className="grid2" style={{ gridTemplateColumns: verFinanzas ? '2fr 1fr' : '1fr' }}>
        <div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>Agenda de hoy</h3>
          <DataTable columnas={columnas} filas={agenda.data?.data ?? []} cargando={agenda.isLoading} buscador={false} sinPaginacion compacto
            error={agenda.data?.error && !esVistaInexistente(agenda.data.error) && agenda.data.error.code !== 'SIN_CONEXION' ? agenda.data.error : null}
            vacio={{ title: agenda.data?.error ? 'Agenda no disponible' : 'Sin citas hoy', description: nota(agenda.data?.error) ? `${nota(agenda.data.error)}. Las citas del día aparecerán aquí.` : 'Cuando haya citas para hoy aparecerán aquí.', icon: CalendarDays }} />
        </div>
        {verFinanzas && (
          <div>
            <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>Alertas</h3>
            <div className="card" style={{ padding: 0 }}>
              {alertas.data?.data?.length
                ? alertas.data.data.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--row-line)', fontSize: 12.5 }}>
                    <Bell size={14} color={a.severidad === 'alta' ? 'var(--red)' : 'var(--gold)'} style={{ flexShrink: 0, marginTop: 2 }} />{a.mensaje}
                  </div>))
                : <EmptyState compacto icon={Bell} title="Sin alertas" description={nota(alertas.data?.error) ?? 'No hay situaciones por atender.'} />}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
