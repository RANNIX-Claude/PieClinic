// Consulta de diferencias (pantalla principal del dueño). Etapa 6. Solo roles con «ver diferencias» llegan aquí (ruta con cap auditoria.ver_diferencias);
// cada consulta de este reporte debe registrarse con registrarConsulta() (bitácora de consultas: quién consultó qué).
import PageHeader from '../../components/ui/PageHeader'
import { EtapaPendiente } from './comun'

export default function Diferencias() {
  return (
    <div className="pagina">
      <PageHeader titulo="Diferencias" subtitulo="Faltantes y sobrantes por sucursal, producto y auditor" />
      <EtapaPendiente etapa="6" descripcion="Se alimenta de las partidas que captura el motor de conteo (Etapa 2)."
        incluira={['Filtros: fechas, sucursal, auditor, producto, tipo y umbral en piezas o pesos', 'Orden por omisión: mayor diferencia valorizada primero', 'Totales del periodo y casos pendientes de ajuste', 'Exportación a Excel y PDF respetando los filtros', 'Bitácora de quién consultó el reporte (ya existe en la base)']} />
    </div>
  )
}
