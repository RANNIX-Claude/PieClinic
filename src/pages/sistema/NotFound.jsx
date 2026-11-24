import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import EmptyState from '../../components/ui/EmptyState'

export default function NotFound() {
  return (
    <div className="pagina">
      <div className="card">
        <EmptyState icon={SearchX} title="404 · No encontramos esta página"
          description="La dirección no existe o el módulo todavía no está disponible."
          action={<Link to="/" className="btn" style={{ textDecoration: 'none' }}>Ir al inicio</Link>} />
      </div>
    </div>
  )
}
