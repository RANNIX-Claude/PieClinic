import { Link } from 'react-router-dom'
import { PauseCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { puede } from '../../lib/permisos'
import EmptyState from '../../components/ui/EmptyState'
import StatusBadge from '../../components/ui/StatusBadge'

// Pantalla de clínica suspendida o dada de baja. La app sigue en SOLO LECTURA (consultar y exportar; nada se crea ni se edita).
export default function Suspendida() {
  const { organizacion, estadoClinica, rol } = useApp()
  const baja = estadoClinica === 'baja'
  const activa = estadoClinica === 'activa' || estadoClinica === 'prueba'
  return (
    <div className="pagina" style={{ maxWidth: 720 }}>
      <div className="card">
        <EmptyState icon={PauseCircle} title={activa ? 'Tu clínica está al corriente' : baja ? 'Clínica dada de baja' : 'Clínica suspendida'}
          description={activa ? 'No hay ninguna restricción en tu cuenta.'
            : baja ? 'La cuenta fue dada de baja. Tu información se conserva y puedes consultarla o exportarla, pero ya no se puede modificar.'
            : 'El acceso está en modo solo lectura mientras se regulariza la suscripción. Tu información está intacta: puedes consultarla y exportarla.'}
          action={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13 }}>{organizacion?.nombre} <StatusBadge estado={estadoClinica} /></div>
              {puede(rol, 'suscripcion.ver') && !activa && <Link to="/suscripcion" className="btn" style={{ textDecoration: 'none' }}>Ir a mi suscripción</Link>}
              {!puede(rol, 'suscripcion.ver') && !activa && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Avisa a tu administrador para reactivar el servicio.</div>}
              <Link to="/" style={{ color: 'var(--accent-dark)', fontSize: 12.5 }}>Seguir en modo lectura</Link>
            </div>
          } />
      </div>
    </div>
  )
}
