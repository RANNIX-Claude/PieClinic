import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import EmptyState from '../../components/ui/EmptyState'

export default function Forbidden() {
  return (
    <div className="pagina">
      <div className="card">
        <EmptyState icon={ShieldAlert} title="403 · Sin permiso"
          description="Tu rol no tiene acceso a esta pantalla. Si crees que es un error, pide a tu administrador que revise tu rol."
          action={<Link to="/" className="btn" style={{ textDecoration: 'none' }}>Ir al inicio</Link>} />
      </div>
    </div>
  )
}
