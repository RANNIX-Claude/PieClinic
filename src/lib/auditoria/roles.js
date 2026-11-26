// Módulo Control y Auditoría · matriz de roles (espejo de la base). La AUTORIDAD es el servidor (piefirme_app.ctl_puede, migración 200):
// esto solo decide qué se muestra y evita pedir acciones que la base va a rechazar. Si se cambia una, cambiar las dos y las pruebas.
// Mapeo de roles de Pie Firme (decisión de arquitectura): dueño = administrador · supervisor = supervisor · encargado y cajero = recepcion ·
// podólogo = podologo · Administrador RANNIX (soporte) = fila en rannix_staff (superadministrador).

/** Capacidades del módulo. ver_directo = leer tablas sensibles por pantalla (el soporte lee por RPC con bitácora). */
export const CAPS_AUDITORIA = ['capturar', 'ver_diferencias', 'ver_directo', 'investigar', 'autorizar', 'configurar']

export const MATRIZ_AUDITORIA = {
  dueno:      ['capturar', 'ver_diferencias', 'ver_directo', 'investigar', 'autorizar', 'configurar'],
  supervisor: ['capturar', 'ver_diferencias', 'ver_directo', 'investigar'],
  sucursal:   ['capturar'],                                   // encargado, cajero y podólogo: capturan a ciegas
  soporte:    ['ver_diferencias', 'configurar'],              // lee para diagnosticar; no captura, no investiga, no autoriza
}

export const ROL_AUDITORIA_NOMBRE = { dueno: 'Dueño', supervisor: 'Supervisor', sucursal: 'Sucursal (captura)', soporte: 'Soporte RANNIX' }

/** Rol del módulo a partir del rol de la clínica (y de si la cuenta es superadministrador RANNIX). */
export function rolAuditoria(rolApp, esSuperadmin = false) {
  if (esSuperadmin || rolApp === 'rannix') return 'soporte'
  return { administrador: 'dueno', supervisor: 'supervisor', recepcion: 'sucursal', podologo: 'sucursal' }[rolApp] ?? null
}

/** ¿Puede esta cuenta la capacidad `cap` del módulo? (`cap` sin el prefijo «auditoria.») */
export function puedeAuditoria(rolApp, cap, esSuperadmin = false) {
  const r = rolAuditoria(rolApp, esSuperadmin)
  return !!r && MATRIZ_AUDITORIA[r].includes(cap)
}

/** Campos que NUNCA deben llegar a un rol de sucursal (saldo, diferencia, valor esperado). Se filtra en la base; esto es defensa extra. */
export const CAMPOS_CIEGOS = [
  'saldo_sistema', 'diferencia_piezas', 'diferencia_valor', 'diferencia_precio', 'diferencia', 'valor_esperado', 'valor_diferencia',
  'precio_catalogo', 'partidas_con_diferencia', 'dentro_tolerancia', 'clasificacion_precio', 'existencia', 'saldo',
]
export const esCampoCiego = k => CAMPOS_CIEGOS.includes(k)

/** Quita (recursivamente) los campos ciegos de lo que se vaya a pintar o guardar en una pantalla de captura. */
export function limpiarParaSucursal(valor) {
  if (Array.isArray(valor)) return valor.map(limpiarParaSucursal)
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).filter(([k]) => !esCampoCiego(k)).map(([k, v]) => [k, limpiarParaSucursal(v)]))
  return valor
}

/** Mensaje claro de los errores del módulo (códigos PF4xx de la base). */
export function mensajeError(e) {
  const m = typeof e === 'string' ? e : e?.message || 'Error desconocido'
  if (e?.code === '42501') return 'No tienes permiso para esta operación.'
  return m
}
