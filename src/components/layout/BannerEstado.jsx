import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { fecha } from '../../lib/formato'

/** Avisos globales bajo el encabezado: sin conexión (falta Supabase), clínica suspendida/baja (solo lectura), periodo de prueba. */
export default function BannerEstado() {
  const { sinConexion, mensajeSinConexion, estadoClinica, organizacion } = useApp()
  return (
    <>
      {sinConexion && <div className="aviso err" role="alert"><b>Sin conexión.</b> {mensajeSinConexion}</div>}
      {(estadoClinica === 'suspendida' || estadoClinica === 'baja') && (
        <div className="aviso err" role="alert">
          <b>{estadoClinica === 'baja' ? 'Clínica dada de baja.' : 'Clínica suspendida.'}</b> La información está en modo solo lectura: no se puede crear ni modificar nada.
          <Link to="/suspendida">Ver detalles</Link>
        </div>
      )}
      {estadoClinica === 'prueba' && organizacion?.prueba_hasta && (
        <div className="aviso warn">Periodo de prueba hasta el <b>{fecha(organizacion.prueba_hasta)}</b>.</div>
      )}
    </>
  )
}
