// Mis recibos (rh.propio): el podólogo o la recepcionista ve solo sus recibos autorizados y los firma. El RLS lo garantiza (P-111).
import PageHeader from '../../../components/ui/PageHeader'
import Recibos from './rh/Recibos'

export default function MisRecibos() {
  return (
    <div className="pagina">
      <PageHeader titulo="Mis recibos de nómina" subtitulo="Solo tus recibos, cuando la nómina del periodo ya se autorizó" />
      <Recibos propios />
    </div>
  )
}
