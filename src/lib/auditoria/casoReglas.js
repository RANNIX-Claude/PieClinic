// Casos de diferencia (Etapa 3) · reglas puras de la pantalla. La AUTORIDAD es el servidor (migraciones 220–222: RPC ctl_caso_*, ctl_autorizar_ajuste,
// ctl_reintentar_ajuste); esto solo decide qué botones se ofrecen y valida antes de pedir lo que la base rechazaría. Si se cambia una, cambiar la otra y las pruebas.
//
// REGISTRO DE CONTROL INTERNO: el responsable del costo «empleado» NO es una instrucción de descuento a nómina (la Ley Federal del Trabajo restringe los
// descuentos al salario y un faltante de inventario no basta para justificar uno). El módulo no tiene integración con nómina ni un botón que la sugiera.

export const NOMBRE_ESTADO_CASO = {
  abierta: 'Abierta', en_investigacion: 'En investigación', cerrada_con_ajuste: 'Cerrada con ajuste', cerrada_sin_ajuste: 'Cerrada sin ajuste',
  rechazada: 'Rechazada', ajuste_fallido: 'Ajuste fallido',
}
export const ESTADOS_ABIERTOS = ['abierta', 'en_investigacion', 'ajuste_fallido']
export const esAbierto = estado => ESTADOS_ABIERTOS.includes(estado)
export const VARIANTE_ESTADO_CASO = { abierta: 'a', en_investigacion: 'b', ajuste_fallido: 'r', cerrada_con_ajuste: 'v', cerrada_sin_ajuste: 'v', rechazada: 'n' }

export const NOMBRE_TIPO_CASO = {
  diferencia_inventario: 'Diferencia de inventario', diferencia_efectivo: 'Diferencia de efectivo', diferencia_precio: 'Precio de etiqueta a revisar',
  diferencia_kits: 'Diferencia de kits', diferencia_relevo: 'Diferencia en relevo de turno', sello_roto: 'Sello roto', folio_faltante: 'Folio faltante', servicio_sin_cobro: 'Servicio sin cobro',
}

export const RESPONSABLES_COSTO = ['empresa', 'proveedor', 'empleado', 'seguro']
export const NOMBRE_RESPONSABLE = { empresa: 'La empresa', proveedor: 'El proveedor', empleado: 'Empleado (registro de control interno)', seguro: 'El seguro' }
export const AVISO_EMPLEADO = 'Registro de control interno: no es una instrucción de descuento a nómina. La Ley Federal del Trabajo restringe los descuentos al salario y un faltante de inventario no basta para justificar uno.'

export const TOPE_FECHA_COMPROMISO_DIAS = 180
export const COMPROMISO_POR_OMISION_DIAS = 7
export const MIN_RESOLUCION = 10

/** Un caso lleva ajuste de inventario si tiene producto y cantidad distinta de cero (los de precio, efectivo o «no reportado» solo se cierran sin ajuste). */
export const tieneAjusteDeInventario = caso => !!caso?.producto_id && Number(caso?.cantidad) !== 0 && caso?.cantidad != null
/** Rol dentro de una posible sustitución de código: 'faltante_caro' (principal) | 'sobrante_barato' (contraparte) | null. */
export const rolDePar = caso => caso?.contexto?.sustitucion?.rol ?? null
export const esContraparte = caso => rolDePar(caso) === 'sobrante_barato'
export const esPrincipalDePar = caso => rolDePar(caso) === 'faltante_caro'

/** Signo del ajuste: faltante = negativo (baja el saldo), sobrante = positivo (sube el saldo). */
export function deltaDelAjuste(cantidad) {
  const n = Number(cantidad)
  if (!Number.isFinite(n) || n === 0) return { delta: 0, texto: 'Sin ajuste', tipo: 'ninguno' }
  return { delta: n, tipo: n < 0 ? 'faltante' : 'sobrante', texto: n < 0 ? `Faltante: el saldo baja ${Math.abs(n)}` : `Sobrante: el saldo sube ${n}` }
}

/**
 * Qué puede hacer una persona con un caso. `rolAud`: dueno | supervisor | sucursal | soporte. `yo`: { capture, investigue } que devuelve el detalle.
 * Devuelve banderas y, cuando algo se bloquea por separación de funciones, el motivo en lenguaje claro (el servidor vuelve a validar todo).
 */
export function accionesCaso({ caso, rolAud, yo = {} }) {
  const r = { puedeVer: ['dueno', 'supervisor', 'soporte'].includes(rolAud), motivos: {} }
  const investiga = rolAud === 'dueno' || rolAud === 'supervisor'
  const estado = caso?.estado
  const abierto = esAbierto(estado)
  const contra = esContraparte(caso)
  r.puedeComentar = investiga && abierto
  r.puedeAdjuntar = investiga && abierto
  r.puedeTomar = investiga && !contra && (estado === 'abierta' || estado === 'en_investigacion')
  r.puedeAsignar = investiga && !contra && abierto
  r.puedeProponerCierre = investiga && !contra && (estado === 'en_investigacion' || estado === 'ajuste_fallido')
  r.puedeVolverAInvestigar = investiga && !contra && estado === 'ajuste_fallido'
  const cierraSinAjuste = investiga && !contra && estado === 'en_investigacion'
  r.puedeCerrarSinAjuste = cierraSinAjuste && !yo.capture
  r.puedeRechazar = cierraSinAjuste && !yo.capture
  if (cierraSinAjuste && yo.capture) r.motivos.cerrar = 'Quien capturó la diferencia no puede cerrar ni rechazar su propio caso; pida a otra persona autorizada.'
  if (contra && abierto) r.motivos.contraparte = `Este caso es la contraparte de una posible sustitución de código: actúe sobre el caso principal ${caso?.contexto?.sustitucion?.caso_principal_folio ?? ''}`.trim()

  // autorizar / reintentar: solo el dueño, distinto de quien capturó, con causa + responsable + monto, y solo si hay ajuste de inventario
  const hayAjuste = tieneAjusteDeInventario(caso)
  const base = rolAud === 'dueno' && !contra && (estado === 'en_investigacion' || estado === 'ajuste_fallido') && hayAjuste
  const completo = !!caso?.causa_id && !!caso?.responsable_costo && caso?.monto_costo != null
  r.puedeAutorizar = base && estado === 'en_investigacion' && !yo.capture && completo
  r.puedeReintentar = base && estado === 'ajuste_fallido' && !yo.capture && completo
  if (rolAud === 'dueno' && abierto && !contra && !hayAjuste) r.motivos.autorizar = 'Este caso no tiene un ajuste de inventario que autorizar: se cierra sin ajuste o se rechaza.'
  else if (base && yo.capture) r.motivos.autorizar = 'Quien capturó la partida no puede autorizar el ajuste de su propio caso. Pida a otra persona autorizada que lo apruebe.'
  else if (base && !completo) r.motivos.autorizar = 'Antes de autorizar, guarde la propuesta de cierre: causa, quién absorbe el costo y monto.'
  else if (rolAud === 'supervisor' && abierto) r.motivos.autorizar = 'La autorización del ajuste es solo del dueño.'
  r.soloLectura = rolAud === 'soporte' || !investiga
  return r
}

/** Valida la propuesta de cierre antes de enviarla (la base repite las mismas reglas). `tope` = valor al costo del caso (o del par). */
export function validarCierre({ causaId, causaRequiereNota = false, responsable, monto, nota, tope = null }) {
  const err = {}
  if (!causaId) err.causa = 'Elija la causa del catálogo'
  if (causaRequiereNota && String(nota ?? '').trim().length < 10) err.nota = 'Esta causa exige una nota (mínimo 10 caracteres)'
  if (!RESPONSABLES_COSTO.includes(responsable)) err.responsable = 'Indique quién absorbe el costo'
  const m = Number(monto)
  if (monto === '' || monto == null || !Number.isFinite(m) || m < 0) err.monto = 'Escriba el monto al costo (cero si no hay costo que absorber)'
  else if (tope != null && m > Number(tope) + 0.005) err.monto = `No puede ser mayor al valor al costo del caso (${Number(tope).toFixed(2)})`
  return { ok: Object.keys(err).length === 0, errores: err }
}

/** Resolución (cierre sin ajuste) y motivo (rechazo): mínimo 10 caracteres. */
export function validarTexto(texto, minimo = MIN_RESOLUCION) {
  const t = String(texto ?? '').trim()
  return t.length >= minimo ? { ok: true } : { ok: false, error: `Escriba al menos ${minimo} caracteres` }
}

/** Fecha compromiso: hoy en adelante y hasta 180 días. `hoy` y `fecha` en 'YYYY-MM-DD'. */
export function validarFechaCompromiso(fecha, hoy) {
  if (!fecha) return { ok: false, error: 'La fecha compromiso es obligatoria' }
  const d = Date.parse(fecha + 'T00:00:00Z'), h = Date.parse(hoy + 'T00:00:00Z')
  if (!Number.isFinite(d)) return { ok: false, error: 'Fecha no válida' }
  if (d < h) return { ok: false, error: 'No puede estar en el pasado' }
  if ((d - h) / 86400000 > TOPE_FECHA_COMPROMISO_DIAS) return { ok: false, error: `No puede pasar de ${TOPE_FECHA_COMPROMISO_DIAS} días` }
  return { ok: true }
}
export const sumarDias = (fecha, dias) => new Date(Date.parse(fecha + 'T00:00:00Z') + dias * 86400000).toISOString().slice(0, 10)

/** «Hace 3 días», «hoy». */
export const antiguedadTexto = dias => (dias == null ? '—' : dias <= 0 ? 'hoy' : dias === 1 ? '1 día' : `${dias} días`)
/** Cubeta de antigüedad para colorear (misma segmentación que el reporte de abiertos). */
export function cuboAntiguedad(dias) {
  if (dias == null) return 'n'
  if (dias <= 2) return 'v'
  if (dias <= 7) return 'b'
  if (dias <= 14) return 'a'
  return 'r'
}

/** Mensaje de la autorización por código de error del servidor (para el diálogo de contraseña). */
export function mensajeAutorizacion(r) {
  if (!r) return 'No se obtuvo respuesta'
  if (r.error === 'contrasena_incorrecta') return r.mensaje ?? 'Para autorizar un ajuste se exige su contraseña completa (no el PIN).'
  if (r.ok === false && r.estado === 'ajuste_fallido') return `El origen rechazó el ajuste: ${r.mensaje ?? 'sin detalle'}. El caso queda visible y se puede reintentar.`
  if (r.ok) return r.idempotente ? 'Ajuste aplicado (el origen ya tenía este movimiento; no se duplicó).' : r.par ? 'Ajuste del par aplicado: los dos movimientos quedaron guardados.' : 'Ajuste autorizado y aplicado.'
  return r.mensaje ?? 'No se pudo autorizar'
}

// ───────────────────────────── reportes (F4.5) ─────────────────────────────
/** Agrupa filas {sucursal, causa, casos} en series para una gráfica de barras apiladas por causa. Devuelve { filas:[{sucursal,<causa>:n…}], causas:[…] }. */
export function causasParaGrafica(rows = []) {
  const causas = [...new Set(rows.map(r => r.causa))].sort((a, b) => a.localeCompare(b, 'es'))
  const porSucursal = new Map()
  for (const r of rows) {
    if (!porSucursal.has(r.sucursal)) porSucursal.set(r.sucursal, { sucursal: r.sucursal })
    porSucursal.get(r.sucursal)[r.causa] = (porSucursal.get(r.sucursal)[r.causa] ?? 0) + Number(r.casos)
  }
  return { filas: [...porSucursal.values()].sort((a, b) => a.sucursal.localeCompare(b.sucursal, 'es')), causas }
}
/** Total de casos por causa en todas las sucursales, de mayor a menor (la gráfica «que de verdad dice dónde está el problema»). */
export function totalesPorCausa(rows = []) {
  const m = new Map()
  for (const r of rows) m.set(r.causa, (m.get(r.causa) ?? 0) + Number(r.casos))
  return [...m.entries()].map(([causa, casos]) => ({ causa, casos })).sort((a, b) => b.casos - a.casos || a.causa.localeCompare(b.causa, 'es'))
}
/** Frase del indicador de recurrencia: siempre como indicador para investigar y con denominador, nunca como conclusión. */
export function fraseRecurrencia(f) {
  const total = f.relevos_totales != null ? ` de ${f.relevos_totales} relevos entregados en el periodo` : ''
  return `${f.nombre ?? 'Esta persona'} aparece del lado saliente en ${f.relevos_con_diferencia} relevos con diferencia${total}. Es un indicador para investigar: abra cada caso y revise los movimientos de contexto antes de sacar conclusiones.`
}
