// Reportes de Control y Auditoría (Etapa 6): ventas por debajo de catálogo, aperturas de cajón sin venta y mezcla de formas de pago (F1.2, F1.5, F1.6), el reporte mensual en PDF
// (F7.4), la bitácora de consultas y la retención de fotos. Los de caja leen del origen y son de dueño y supervisor; la bitácora y la retención, de dueño y soporte RANNIX.
// Los reportes de seguimiento de casos (F4.5) ya están en Casos → Seguimiento y no se duplican aquí.
import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import { usePermiso } from '../../lib/permisos'
import VentasBajoCatalogo from './reportes/VentasBajoCatalogo'
import CajonSinVenta from './reportes/CajonSinVenta'
import MezclaPago from './reportes/MezclaPago'
import ReporteMensual from './reportes/ReporteMensual'
import BitacoraConsultas from './reportes/BitacoraConsultas'
import Retencion from './reportes/Retencion'

export default function Reportes() {
  const verDif = usePermiso('auditoria.ver_diferencias')
  const investiga = usePermiso('auditoria.investigar')   // dueño y supervisor: leen ventas y pagos del origen
  const configura = usePermiso('auditoria.configurar')   // dueño y soporte: bitácora y retención
  const [tab, setTab] = useState(investiga ? 'bajo' : 'mensual')
  if (!verDif) {
    return (
      <div className="pagina">
        <PageHeader titulo="Reportes de auditoría" subtitulo="Esta pantalla es de dueño y supervisor" />
        <div className="card">Quien captura no ve reportes ni diferencias: así el conteo se hace a ciegas.</div>
      </div>
    )
  }
  return (
    <div className="pagina">
      <PageHeader titulo="Reportes de auditoría" subtitulo="Caja y precio, reporte mensual, bitácora de consultas y retención de fotos · valores al costo" />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'bajo', label: 'Ventas bajo catálogo', oculto: !investiga }, { id: 'cajon', label: 'Cajón sin venta', oculto: !investiga }, { id: 'mezcla', label: 'Formas de pago', oculto: !investiga },
        { id: 'mensual', label: 'Reporte mensual' }, { id: 'bitacora', label: 'Quién consultó qué', oculto: !configura }, { id: 'retencion', label: 'Retención de fotos', oculto: !configura },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'bajo' && investiga && <VentasBajoCatalogo />}
        {tab === 'cajon' && investiga && <CajonSinVenta />}
        {tab === 'mezcla' && investiga && <MezclaPago />}
        {tab === 'mensual' && <ReporteMensual />}
        {tab === 'bitacora' && configura && <BitacoraConsultas />}
        {tab === 'retencion' && configura && <Retencion />}
      </div>
    </div>
  )
}
