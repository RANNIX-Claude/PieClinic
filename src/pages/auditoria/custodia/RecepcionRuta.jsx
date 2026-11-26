// Ruta propia de la RECEPCIÓN con responsiva (/auditoria/custodia/recepcion): la misma pantalla pensada para el móvil, sin pestañas. El componente reutilizable
// es Recepcion.jsx (la PWA de la Etapa 5 lo monta en su pantalla RECEPCIÓN).
import PageHeader from '../../../components/ui/PageHeader'
import Recepcion from './Recepcion'

export default function RecepcionRuta() {
  return (
    <div className="pagina">
      <PageHeader titulo="Recepción con responsiva" subtitulo="Escanee, verifique, fotografíe y firme con su PIN: la pieza queda bajo su responsabilidad" />
      <Recepcion />
    </div>
  )
}
