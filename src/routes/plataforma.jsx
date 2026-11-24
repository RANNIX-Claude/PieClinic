// Rutas del área PLATAFORMA: inventario, compras, proveedores, equipo (RH, comisiones, mantenimiento) y administración
// (importar, usuarios, configuración, suscripción, asistente, exportación, panel RANNIX). Cada clúster declara las suyas.
import { lazy } from 'react'
import inventario from '../pages/plataforma/inventario/rutas.jsx'
import equipo from '../pages/plataforma/equipo/rutas.jsx'
import admin from '../pages/plataforma/admin/rutas.jsx'

export default [
  ...inventario, ...equipo, ...admin,
  // pública (sin sesión): enlace de invitación de usuario / alta de clínica
  { path: '/aceptar-invitacion', element: lazy(() => import('../pages/plataforma/admin/AceptarInvitacion.jsx')), publica: true, titulo: 'Aceptar invitación' },
]
