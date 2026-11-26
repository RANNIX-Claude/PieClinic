// Matriz rol → capacidades (MATRIZ_ROLES.md, §4). NO sustituye al RLS: la base de datos es la que manda;
// esto solo decide qué se muestra y evita pedirle al usuario acciones que la base va a rechazar.
// Lo marcado [PROPUESTO] en la matriz está aquí como propuesta; cuando el dueño lo confirme se cambia SOLO este archivo.
import { useApp } from '../context/AppContext'

export const ROLES = {
  administrador: 'Administrador',
  podologo: 'Podólogo',
  recepcion: 'Recepción',
  supervisor: 'Supervisor',
  rannix: 'Superadministrador RANNIX',
}
export const ROLES_CLINICA = ['administrador', 'podologo', 'recepcion']
// Cuarto rol (migración 073): supervisor de sucursales. Se agrega SIN tocar las matrices de arriba: sus capacidades y rutas viven aquí.
export const ROLES_ASIGNABLES = [...ROLES_CLINICA, 'supervisor']
// Funciones que se habilitan a un usuario además de su rol (perfiles.funciones). Cobrar exige además firmar con el PIN personal.
export const FUNCIONES = { caja: 'Caja (cobrar)', recepcion_mercancia: 'Recepción de mercancía', podologia: 'Servicio de podología' }
// El supervisor ve (solo lectura) lo de sus sedes y autoriza descuentos y devoluciones dentro del tope que fijan los dueños.
// No cambia precios, catálogo ni configuración. La autoridad real es el RLS (073).
export const CAPS_SUPERVISOR = new Set([
  'agenda.ver', 'ventas.ver', 'inventario.ver', 'compras.ver', 'catalogo.ver', 'dashboard.ver', 'reportes.ver', 'mantenimiento.solicitar',
  'conteo.operar', 'conteo.iniciar', 'conteo.provisionales',
])
export const RUTAS_SUPERVISOR = [
  '/dashboard', '/resumen-semanal', '/analisis/ejecutivo', '/operacion-dia', '/reportes', '/agenda', '/catalogo',
  '/inventario', '/traspasos', '/compras', '/mermas-conteos', '/conteo-inicial', '/productos-provisionales', '/catalogo/codigos', '/catalogo/codigos-productos', '/mi-pin',
]
export const TODOS_LOS_ROLES = ['administrador', 'podologo', 'recepcion', 'supervisor', 'rannix']

const A = 'administrador', P = 'podologo', R = 'recepcion', X = 'rannix'
// cap(roles, escritura): escritura=true se bloquea para todos cuando la clínica está suspendida o dada de baja.
const cap = (roles, escritura = false) => ({ roles, escritura })

export const CAPACIDADES = {
  // Pacientes y agenda (4.1)
  'pacientes.ver':            cap([A, P, R]),
  'pacientes.editar':         cap([A, P, R], true),
  'pacientes.datos_fiscales': cap([A, R], true),
  'pacientes.fusionar':       cap([A], true),
  'expediente.ver':           cap([A, P]),                 // antecedentes, consultas, exploración (Recepción: solo contacto, ver P-130)
  'consultas.escribir':       cap([P], true),
  'consultas.firmar':         cap([P], true),
  'fotos.ver':                cap([A, P]),
  'fotos.subir':              cap([P], true),
  'planes.ver':               cap([A, P, R]),
  'planes.editar':            cap([A, P, R], true),
  'ortopedia.editar':         cap([A, P], true),
  'agenda.ver':               cap([A, P, R]),
  'agenda.editar':            cap([A, P, R], true),
  'agenda.autorizar_sobrecupo': cap([A], true),
  'lista_espera.gestionar':   cap([A, R], true),
  'importar.usar':            cap([A], true),
  'crm.ver':                  cap([A, P, R]),
  'crm.editar':               cap([A, R], true),
  'quejas.ver':               cap([A, P, R]),
  'quejas.registrar':         cap([A, R], true),
  'quejas.resolver':          cap([A], true),
  'esterilizacion.ver':       cap([A, P, R]),
  'esterilizacion.operar':    cap([A, R], true),
  'esterilizacion.liberar':   cap([A], true),
  // Ventas y facturación (4.2)
  'ventas.ver':               cap([A, P, R]),
  'ventas.cobrar':            cap([A, R], true),
  'ventas.cancelar':          cap([A, R], true),
  'caja.turno':               cap([A, R], true),
  'facturas.ver':             cap([A, R]),
  'facturas.timbrar':         cap([A, R], true),
  'facturas.cancelar':        cap([A], true),
  'catalogo.ver':             cap([A, P, R]),
  'catalogo.editar':          cap([A], true),
  // Inventario (4.3)
  'inventario.ver':           cap([A, P, R]),
  'inventario.operar':        cap([A, R], true),
  'inventario.autorizar':     cap([A], true),
  // Conteo inicial (078): cuenta quien opera inventario; inicia y reabre Administración o la supervisión; los provisionales los completa Administración o la supervisión
  'conteo.operar':            cap([A, R], true),
  'conteo.iniciar':           cap([A], true),
  'conteo.provisionales':     cap([A], true),
  'compras.ver':              cap([A, R]),
  'compras.editar':           cap([A], true),
  'proveedores.ver':          cap([A, R]),
  'proveedores.editar':       cap([A], true),
  // Finanzas (4.4): solo Administración
  'finanzas.ver':             cap([A]),
  'finanzas.editar':          cap([A], true),
  'fondo.operar':             cap([A, R], true),
  'edr.proyectar':            cap([A], true),               // proy_* es manual: nunca desde código automático
  'dashboard.ver':            cap([A, P, R]),
  'dashboard.finanzas':       cap([A]),
  'reportes.ver':             cap([A, P]),
  'asistente.usar':           cap([A, P]),
  'utilerias.usar':           cap([X]),                    // Utilerías (cálculos, validación, catálogos, consulta a BD, entrega): solo el Superadministrador RANNIX; el administrador de la clínica ya no ve el grupo
  // RH, comisiones, mantenimiento (4.5)
  'rh.ver':                   cap([A]),
  'rh.editar':                cap([A], true),
  'rh.propio':                cap([P, R]),
  'comisiones.ver_todas':     cap([A]),
  'comisiones.ver_propias':   cap([P]),
  'mantenimiento.solicitar':  cap([A, P, R], true),
  'mantenimiento.gestionar':  cap([A], true),
  // Sistema y plataforma (4.6)
  'usuarios.gestionar':       cap([A], true),
  'configuracion.editar':     cap([A], true),
  'bitacora.ver':             cap([A]),
  'suscripcion.ver':          cap([A]),
  'suscripcion.editar':       cap([A], true),
  // Panel RANNIX (solo metadatos de uso y cobro; nunca datos de salud)
  'rannix.panel':             cap([X], true),
}

// Superadministrador = persona de rannix_staff que además tiene perfil de administrador en la clínica (cuenta a@g.com en QA).
// Opera la clínica como administrador (el RLS la ve así) y suma el panel RANNIX. AppContext lo fija al cargar el perfil.
let superadmin = false
export const fijarSuperadmin = v => { superadmin = !!v }
export const esSuperadmin = () => superadmin

/** ¿El rol tiene la capacidad? `soloLectura` (clínica suspendida/baja) apaga las capacidades de escritura. */
export function puede(rol, capacidad, { soloLectura = false } = {}) {
  const c = CAPACIDADES[capacidad]
  if (!c || !rol) return false
  if (c.escritura && soloLectura) return false
  if (rol === 'supervisor') return CAPS_SUPERVISOR.has(capacidad)
  return c.roles.includes(rol) || (superadmin && c.roles.includes(X))
}

/** ¿El rol está en la lista de roles de una ruta o ítem de menú? Lista vacía/ausente = cualquier usuario con sesión. */
export const rolPermitido = (rol, roles, path) => !roles || roles.length === 0 || roles.includes(rol) || (superadmin && roles.includes(X)) || (rol === 'supervisor' && !!path && RUTAS_SUPERVISOR.includes(path))

/** Hook: ¿puede el usuario actual esta capacidad? Respeta rol y modo solo lectura. */
export function usePermiso(capacidad) {
  const { rol, soloLectura } = useApp()
  return puede(rol, capacidad, { soloLectura })
}

/** Hook: varios permisos a la vez → { 'pacientes.editar': true, ... } */
export function usePermisos(...capacidades) {
  const { rol, soloLectura } = useApp()
  return Object.fromEntries(capacidades.map(c => [c, puede(rol, c, { soloLectura })]))
}

/** Roles que tienen la capacidad (útil para declarar `roles` de una ruta: roles: rolesCon('finanzas.ver')). */
export const rolesCon = capacidad => CAPACIDADES[capacidad]?.roles ?? []
