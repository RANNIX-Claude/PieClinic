// Conteos (captura a ciegas). Etapa 2 (motor de conteo) y Etapa 5 (PWA de captura). Esta pantalla la ven también encargado, cajero y podólogo:
// NUNCA debe pintar saldo, diferencia ni valor esperado. Lo único que se lee aquí es la lista de sesiones propias de la sucursal (sin cifras calculadas).
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import { listar } from '../../lib/auditoria/api'
import { limpiarParaSucursal } from '../../lib/auditoria/roles'
import { fechaHora } from '../../lib/formato'
import { useDatos, EstadoConsulta, EtapaPendiente } from './comun'

const TIPOS = { conteo_inicial: 'Conteo inicial', conteo_apertura: 'Conteo de apertura', auditoria_puntual: 'Auditoría puntual', auditoria_remota: 'Auditoría remota', relevo_turno: 'Relevo de turno' }

export default function Conteos() {
  const q = useDatos(['ctl-sesiones'], async () => {
    const r = await listar('ctl_sesion_conteo', { orden: [{ columna: 'abierta_en', asc: false }], limite: 100 })
    return r.error ? r : { ...r, data: limpiarParaSucursal(r.data) }
  })
  const columnas = [
    { key: 'folio', label: 'Folio' },
    { key: 'abierta_en', label: 'Abierta', render: f => fechaHora(f.abierta_en) },
    { key: 'tipo', label: 'Tipo', render: f => TIPOS[f.tipo] ?? f.tipo, valor: f => TIPOS[f.tipo] ?? f.tipo, filtro: true },
    { key: 'estado', label: 'Estado', filtro: true },
    { key: 'total_partidas', label: 'Partidas capturadas', align: 'right' },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Conteos" subtitulo="Escaneo y captura a ciegas: quien cuenta nunca ve lo que el sistema espera" />
      <EstadoConsulta q={q} />
      {q.data && !q.data.aviso && <DataTable columnas={columnas} filas={q.data.data} vacio={{ title: 'Sin conteos', description: 'Aún no hay sesiones de conteo en tu sucursal.' }} />}
      <div style={{ marginTop: 14 }}>
        <EtapaPendiente etapa="2" titulo="Motor de conteo"
          descripcion="Los cinco modos de conteo (inicial, apertura, relevo, puntual y remota) comparten un solo motor; la captura de pie en el piso es la PWA de la Etapa 5."
          incluira={['El servidor congela el saldo al escanear y no devuelve la diferencia', 'Lista aleatoria ponderada elegida por el servidor', 'Cierre de sesión con generación de casos']} />
      </div>
    </div>
  )
}
