import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import EmptyState from '../../components/ui/EmptyState'

// Opción que existe en Pie Firme pero que RANNIX todavía no libera para este rol en esta clínica (migración 074).
export default function NoLiberada() {
  return (
    <div className="pagina">
      <div className="card">
        <EmptyState icon={Lock} title="Opción no disponible todavía"
          description="Esta función no forma parte del alcance contratado por tu clínica. Si te interesa, pide a RANNIX que la libere."
          action={<Link to="/" className="btn" style={{ textDecoration: 'none' }}>Ir al inicio</Link>} />
      </div>
    </div>
  )
}
