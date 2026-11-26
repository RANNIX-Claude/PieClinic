// Casos de diferencia. Etapa 3 (ciclo de vida, investigación, cierre con causa, autorización y detalle con movimientos de contexto).
// Etapa 0: lista de solo lectura de lo que haya en ctl_caso (para verificar permisos y datos).
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { listar } from '../../lib/auditoria/api'
import { fechaHora, moneda } from '../../lib/formato'
import { useDatos, EstadoConsulta, EtapaPendiente, NOMBRE_ESTADO } from './comun'

export default function Casos() {
  const q = useDatos(['ctl-casos'], () => listar('ctl_caso', { orden: [{ columna: 'abierto_en', asc: false }], limite: 200 }))
  const columnas = [
    { key: 'folio', label: 'Folio' },
    { key: 'abierto_en', label: 'Abierto', render: f => fechaHora(f.abierto_en) },
    { key: 'tipo', label: 'Tipo', filtro: true },
    { key: 'cantidad', label: 'Piezas', align: 'right' },
    { key: 'valor', label: 'Valor al costo', align: 'right', render: f => moneda(f.valor) },
    { key: 'estado', label: 'Estado', filtro: true, render: f => <StatusBadge estado={f.estado} label={NOMBRE_ESTADO[f.estado] ?? f.estado} />, valor: f => NOMBRE_ESTADO[f.estado] ?? f.estado },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Casos de diferencia" subtitulo="Toda diferencia se vuelve un caso con folio; mientras esté abierto, el inventario no se mueve" />
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && <DataTable columnas={columnas} filas={q.data.data} exportarNombre="casos_auditoria" vacio={{ title: 'Sin casos', description: 'Los casos nacen al cerrar un conteo o un cierre con diferencias.' }} />}
      <div style={{ marginTop: 14 }}>
        <EtapaPendiente etapa="3" titulo="Investigación y cierre de casos"
          descripcion="Aquí se completa el ciclo abierta → en investigación → cerrada. La separación de funciones y el ajuste idempotente ya están en la base."
          incluira={['Bitácora de solo inserciones, evidencia y asignación con fecha compromiso', 'Detalle con los movimientos de inventario del producto desde el conteo anterior', 'Cierre con causa, quién absorbe el costo y autorización con contraseña completa', 'Reintento de ajustes fallidos']} />
      </div>
    </div>
  )
}
