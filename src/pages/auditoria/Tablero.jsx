// Tablero de auditoría («¿cómo van mis tiendas hoy?»). Etapa 0: cifras reales de lo que ya existe (casos, alertas, sesiones, folios) y
// el resto del tablero (cierres del día, tendencia de la diferencia valorizada) llega en la Etapa 6.
import { FolderOpen, Bell, ScanLine, ListChecks, ShieldAlert } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import { contarFilas } from '../../lib/api'
import { huecosDeFolio } from '../../lib/auditoria/api'
import { esSuperadmin } from '../../lib/permisos'
import { numero } from '../../lib/formato'
import { useDatos, EstadoConsulta, EtapaPendiente } from './comun'

export default function Tablero() {
  const q = useDatos(['ctl-tablero'], async () => {
    const cuenta = (tabla, filtros) => contarFilas(tabla, { sedeCol: false, filtros }).then(r => r.count ?? 0)
    const [abiertos, fallidos, alertas, sesiones, huecos] = await Promise.all([
      cuenta('ctl_caso', { estado: ['abierta', 'en_investigacion'] }),
      cuenta('ctl_caso', { estado: 'ajuste_fallido' }),
      cuenta('ctl_alerta', { estado: 'nueva' }),
      cuenta('ctl_sesion_conteo', { estado: 'abierta' }),
      huecosDeFolio().then(r => (r.error ? null : (r.data ?? []).length)),
    ])
    return { data: { abiertos, fallidos, alertas, sesiones, huecos } }
  })
  const d = q.data?.data
  const soporte = esSuperadmin()
  return (
    <div className="pagina">
      <PageHeader titulo="Tablero de auditoría" subtitulo="¿Cómo van mis tiendas hoy? Casos, alertas y conteos del módulo de Control y Auditoría" />
      <EstadoConsulta q={q} />
      {d && (
        <div className="grid-kpis">
          <KPICard title="Casos abiertos" icon={FolderOpen} color={d.abiertos ? 'var(--gold)' : 'var(--green)'} value={numero(d.abiertos)} subtitle="Abiertos o en investigación" />
          <KPICard title="Ajustes fallidos" icon={ShieldAlert} color={d.fallidos ? 'var(--red)' : 'var(--green)'} value={numero(d.fallidos)} subtitle="El origen rechazó el ajuste: reintentar" />
          <KPICard title="Alertas sin atender" icon={Bell} color={d.alertas ? 'var(--gold)' : 'var(--green)'} value={numero(d.alertas)} subtitle="Incluye fotos repetidas" />
          <KPICard title="Conteos en curso" icon={ScanLine} color="var(--accent2)" value={numero(d.sesiones)} subtitle="Sesiones abiertas" />
          <KPICard title="Folios con hueco" icon={ListChecks} color={d.huecos ? 'var(--red)' : 'var(--green)'} value={d.huecos == null ? '—' : numero(d.huecos)} subtitle="Casos, cierres y sesiones consecutivos" />
        </div>
      )}
      {soporte && <div className="hint" style={{ margin: '8px 0' }}>Cuenta de soporte RANNIX: las cifras de casos y alertas se consultan por la bitácora de soporte (no se leen directo), por eso pueden verse en cero.</div>}
      <div style={{ marginTop: 14 }}>
        <EtapaPendiente etapa="6" titulo="Tablero completo del dueño"
          descripcion="El tablero de dueño y las alertas con techo diario se construyen sobre los conteos y cierres de las etapas 2 a 4."
          incluira={['Cierres del día y cuáles faltan', 'Sucursales sin conteo de apertura', 'Casos abiertos por antigüedad', 'Diferencia valorizada del periodo con su tendencia', 'Turnos con entrega no aceptada']} />
      </div>
    </div>
  )
}
