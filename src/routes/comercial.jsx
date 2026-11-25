// Rutas del área COMERCIAL: agenda, citas, lista de espera, caja, facturación, catálogo, paquetes y portal público del paciente.
// Las rutas con `publica: true` NO requieren sesión (App.jsx las renderiza fuera del marco): solo usan las RPC portal_* (anon).
import { lazy } from 'react'
import { rolesCon } from '../lib/permisos'

const A = 'administrador', P = 'podologo', R = 'recepcion'
export default [
  { path: '/agenda', element: lazy(() => import('../pages/comercial/Agenda.jsx')), roles: rolesCon('agenda.ver'), titulo: 'Agenda', cap: 'agenda.ver' },
  { path: '/agenda/nueva', element: lazy(() => import('../pages/comercial/CitaNueva.jsx')), roles: rolesCon('agenda.editar'), titulo: 'Nueva cita', cap: 'agenda.editar' },
  { path: '/agenda/horarios', element: lazy(() => import('../pages/comercial/Horarios.jsx')), roles: [A, P, R], titulo: 'Horarios y bloqueos', cap: 'agenda.ver' },
  { path: '/mi-agenda', element: lazy(() => import('../pages/comercial/MiAgenda.jsx')), roles: [A, P, R], titulo: 'Mi agenda', cap: 'agenda.ver' },
  { path: '/lista-espera', element: lazy(() => import('../pages/comercial/ListaEspera.jsx')), roles: rolesCon('lista_espera.gestionar'), titulo: 'Lista de espera', cap: 'lista_espera.gestionar' },
  { path: '/recordatorios', element: lazy(() => import('../pages/comercial/Recordatorios.jsx')), roles: [A, R], titulo: 'Recordatorios', cap: 'lista_espera.gestionar' },
  { path: '/caja', element: lazy(() => import('../pages/comercial/Caja.jsx')), roles: rolesCon('ventas.cobrar'), titulo: 'Caja y tickets', cap: 'ventas.ver' },
  { path: '/facturacion', element: lazy(() => import('../pages/comercial/Facturacion.jsx')), roles: rolesCon('facturas.ver'), titulo: 'Facturación', cap: 'facturas.ver' },
  { path: '/catalogo', element: lazy(() => import('../pages/comercial/Catalogo.jsx')), roles: rolesCon('catalogo.ver'), titulo: 'Catálogo y precios', cap: 'catalogo.ver' },
  { path: '/catalogo/caracteristicas', element: lazy(() => import('../pages/comercial/Caracteristicas.jsx')), roles: rolesCon('catalogo.ver'), titulo: 'Características y adaptaciones', cap: 'catalogo.ver' },
  { path: '/paquetes', element: lazy(() => import('../pages/comercial/Paquetes.jsx')), roles: rolesCon('catalogo.ver'), titulo: 'Paquetes y membresías', cap: 'catalogo.ver' },
  // Portal público del paciente (sin sesión)
  { path: '/reservar/:clinica', element: lazy(() => import('../pages/portal/PortalReservar.jsx')), publica: true, titulo: 'Reserva tu cita' },
  { path: '/cita/:token', element: lazy(() => import('../pages/portal/PortalCita.jsx')), publica: true, titulo: 'Tu cita' },
  { path: '/sala/:token', element: lazy(() => import('../pages/portal/PortalSala.jsx')), publica: true, titulo: 'Videoconsulta' },
]
