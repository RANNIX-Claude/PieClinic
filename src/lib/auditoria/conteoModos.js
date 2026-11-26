// Motor de conteo · los cinco modos (especificación F2). La AUTORIDAD es el servidor (ctl_sesion_iniciar / ctl_remota_lanzar, migraciones 211 y 213);
// esto solo decide qué modos ofrece la pantalla a cada rol del módulo. Si se cambia una, cambiar la otra y las pruebas.
export const MODOS_CONTEO = {
  conteo_inicial:    { nombre: 'Conteo inicial', quien: ['dueno', 'supervisor'], lista: 'completa', efecto: 'Fija el saldo de arranque; no genera casos.', iniciaAqui: true },
  conteo_apertura:   { nombre: 'Conteo de apertura', quien: ['dueno', 'supervisor', 'sucursal'], lista: 'completa', efecto: 'Genera un caso por cada diferencia.', iniciaAqui: true },
  relevo_turno:      { nombre: 'Relevo de turno', quien: ['dueno', 'supervisor', 'sucursal'], lista: 'custodia', efecto: 'Cuenta la custodia (hasta 30 piezas) y transfiere la entrega.', iniciaAqui: true },
  auditoria_puntual: { nombre: 'Auditoría puntual', quien: ['dueno', 'supervisor'], lista: 'aleatoria', efecto: 'Aleatoria o libre; el auditor ve la diferencia al instante.', iniciaAqui: true },
  auditoria_remota:  { nombre: 'Auditoría remota', quien: ['dueno'], lista: 'aleatoria', efecto: 'La lanza el dueño a todas las sucursales, con tiempo límite.', iniciaAqui: false },
}
export const NOMBRE_MODO = Object.fromEntries(Object.entries(MODOS_CONTEO).map(([k, v]) => [k, v.nombre]))
export const NOMBRE_LISTA = { completa: 'Lista completa', custodia: 'Custodia', aleatoria: 'Muestra aleatoria', libre: 'Libre' }
export const NOMBRE_ESTADO_SESION = { abierta: 'Abierta', cerrada: 'Cerrada', expirada: 'Expirada', cancelada: 'Cancelada' }

/** Modos que puede iniciar un rol del módulo (dueno | supervisor | sucursal). Soporte no captura: lista vacía. */
export const modosQuePuedeIniciar = rolAud => Object.entries(MODOS_CONTEO).filter(([, m]) => m.iniciaAqui && m.quien.includes(rolAud)).map(([k]) => k)
export const puedeIniciarModo = (rolAud, modo) => !!MODOS_CONTEO[modo]?.quien.includes(rolAud)
/** Solo el dueño lanza una auditoría remota. */
export const puedeLanzarRemota = rolAud => puedeIniciarModo(rolAud, 'auditoria_remota')
/** Solo dueño y supervisor ven el resultado de una sesión (diferencias valorizadas). */
export const puedeVerResultado = rolAud => rolAud === 'dueno' || rolAud === 'supervisor'
/** El auditor de una auditoría puntual (supervisor o dueño) recibe la diferencia al instante; nadie más. */
export const recibeDiferenciaAlInstante = (rolAud, tipoSesion) => tipoSesion === 'auditoria_puntual' && puedeVerResultado(rolAud)

export const TOPE_MUESTRA = 100
/** Valida el tamaño de la muestra aleatoria (el tope también lo hace cumplir la base de datos). */
export function validarMuestra(valor) {
  const n = Number(valor)
  if (valor === '' || valor == null || !Number.isInteger(n)) return { ok: false, error: 'Escribe un número entero' }
  if (n < 1) return { ok: false, error: 'La muestra mínima es 1' }
  if (n > TOPE_MUESTRA) return { ok: false, error: `El tope del sistema es ${TOPE_MUESTRA}: una muestra mayor se termina capturando sin contar y eso genera evidencia falsa.` }
  return { ok: true }
}
