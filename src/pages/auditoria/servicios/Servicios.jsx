// Control de servicios (Etapa 8, spec §F5.5). Tres amarres independientes; ninguno sustituye a los otros:
//   1. Expediente de atención LIGADO A COBRO (Atenciones, captura de quien atiende o recepción) y su reporte de atenciones sin cobro (dueño y supervisor).
//   2. Cuadre de insumos por periodo: consumo real del inventario contra el teórico según servicios cobrados (dueño y supervisor; el dueño define el consumo).
//   3. Ocupación del puesto: FASE POSTERIOR AL PILOTO (sin hardware; registro manual y cruce con tickets).
// La sucursal captura y nunca ve saldos, diferencias ni resultados de cuadre: lo exige la base (PF403 en cada reporte).
import { useState } from 'react'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import { usePermiso } from '../../../lib/permisos'
import Atenciones from './Atenciones'
import SinCobro from './SinCobro'
import CuadreInsumos from './CuadreInsumos'
import Ocupacion from './Ocupacion'

export default function Servicios() {
  const captura = usePermiso('auditoria.capturar')
  const revisa = usePermiso('auditoria.investigar')            // dueño y supervisor
  const [tab, setTab] = useState(captura ? 'atenciones' : 'sincobro')
  return (
    <div className="pagina">
      <PageHeader titulo="Servicios" subtitulo="Cada atención se liga a su ticket de cobro; el consumo de insumos se cuadra contra los servicios cobrados" />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'atenciones', label: 'Atenciones', oculto: !captura },
        { id: 'sincobro', label: 'Atenciones sin cobro', oculto: !revisa },
        { id: 'insumos', label: 'Cuadre de insumos', oculto: !revisa },
        { id: 'ocupacion', label: 'Ocupación (posterior al piloto)', oculto: !captura },
      ]} />
      {tab === 'atenciones' && captura && <Atenciones />}
      {tab === 'sincobro' && revisa && <SinCobro />}
      {tab === 'insumos' && revisa && <CuadreInsumos />}
      {tab === 'ocupacion' && captura && <Ocupacion />}
    </div>
  )
}
