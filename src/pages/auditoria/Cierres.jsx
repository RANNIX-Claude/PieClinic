// Cierres de turno y de día. Etapa 4 (checklist, tipos de captura, doble firma, esperados al cerrar) y Etapa 5 (PWA).
// Visible para roles de sucursal: nunca se pinta el valor esperado ni la diferencia (solo en la revisión de dueño y supervisor).
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import { listar } from '../../lib/auditoria/api'
import { fechaHora } from '../../lib/formato'
import { useDatos, EstadoConsulta, EtapaPendiente } from './comun'

export default function Cierres() {
  const q = useDatos(['ctl-cierres'], () => listar('ctl_cierre', { orden: [{ columna: 'abierto_en', asc: false }], limite: 100 }))
  const columnas = [
    { key: 'folio', label: 'Folio' },
    { key: 'abierto_en', label: 'Abierto', render: f => fechaHora(f.abierto_en) },
    { key: 'tipo', label: 'Tipo', filtro: true },
    { key: 'estado', label: 'Estado', filtro: true },
    { key: 'cerrado_en', label: 'Cerrado', render: f => fechaHora(f.cerrado_en) },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Cierres" subtitulo="Recorrido de los puntos de control del turno y del día" />
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && <DataTable columnas={columnas} filas={q.data.data} vacio={{ title: 'Sin cierres', description: 'Aún no hay cierres registrados.' }} />}
      <div style={{ marginTop: 14 }}>
        <EtapaPendiente etapa="4" titulo="Checklist y cierres"
          descripcion="El cierre es el recorrido de los puntos de control activos (los define el dueño en Configuración de auditoría)."
          incluira={['Cinco tipos de captura y desglose por denominación (sin campo de total)', 'Doble firma de entrega de turno', 'Esperados calculados al cerrar, nunca mostrados antes', 'Se consulta con la versión del checklist vigente en su fecha']} />
      </div>
    </div>
  )
}
