// Folio de ticket parametrizable. Espejo JS de piefirme_app.folio_ticket_formatear / _validar / _periodo (migración 300).
// MISMA lógica que en SQL: las pruebas comparan ambas contra los mismos casos (folioTicketCasos.js).
export const FORMATO_DEFECTO = '{SUC}-{AAMMDD}-{NNN}'
export const REINICIO_DEFECTO = 'diario'
export const REINICIOS = { diario: 'Cada día', mensual: 'Cada mes', anual: 'Cada año', nunca: 'Nunca' }
export const FICHAS = ['{SUC}', '{AAMMDD}', '{AA}', '{AAAA}', '{MM}', '{DD}', '{NNN}']

/** fecha: 'YYYY-MM-DD' (el día ya en la zona de la clínica). */
function partes(fecha) { const [y, m, d] = String(fecha).slice(0, 10).split('-'); return { y, m, d } }

export function formatearFolio(formato, codigo, fecha, n) {
  const { y, m, d } = partes(fecha)
  let f = formato
    .split('{AAMMDD}').join(y.slice(2) + m + d).split('{AAAA}').join(y).split('{AA}').join(y.slice(2))
    .split('{MM}').join(m).split('{DD}').join(d).split('{SUC}').join(codigo)
  const mm = f.match(/\{(N+)\}/)
  if (mm) f = f.split(mm[0]).join(String(n).padStart(mm[1].length, '0'))
  return f
}

export function periodoClave(reinicio, fecha) {
  const { y, m, d } = partes(fecha)
  return { diario: `D${y}-${m}-${d}`, mensual: `M${y}-${m}`, anual: `A${y}`, nunca: 'N' }[reinicio]
}

/** null si es válido; si no, el motivo en español (mismos textos que la base). */
export function validarFormato(formato, reinicio) {
  if (formato == null || String(formato).trim() === '') return 'El formato del folio no puede quedar vacío.'
  if (!['diario', 'mensual', 'anual', 'nunca'].includes(reinicio)) return 'El reinicio debe ser diario, mensual, anual o nunca.'
  const nSuc = formato.split('{SUC}').length - 1
  if (nSuc !== 1) return 'El formato debe llevar exactamente un {SUC} (código de la sucursal): sin él los folios de dos sucursales se repetirían.'
  const ns = formato.match(/\{N+\}/g) ?? []
  if (ns.length !== 1) return 'El formato debe llevar exactamente un consecutivo, escrito con N: por ejemplo {NNN} para 3 dígitos.'
  const dig = ns[0].length - 2
  if (dig < 2) return 'El consecutivo debe tener al menos 2 dígitos (por ejemplo {NN} o {NNN}).'
  if (dig > 9) return 'El consecutivo no puede pasar de 9 dígitos.'
  const resto = ['{AAMMDD}', '{AAAA}', '{AA}', '{MM}', '{DD}', '{SUC}', ns[0]].reduce((s, t) => s.split(t).join(''), formato)
  if (/[{}]/.test(resto)) return 'Hay un campo que no existe o está mal escrito. Los campos válidos son {SUC}, {AAAA}, {AA}, {MM}, {DD}, {AAMMDD} y {NNN}.'
  if (!/^[A-Za-z0-9./_-]*$/.test(resto)) return 'Solo se permiten letras, dígitos, guion, punto, diagonal y guion bajo (sin espacios ni otros símbolos).'
  const largo = formatearFolio(formato, '01', '2026-12-31', 0).length
  if (largo > 24) return `El folio mide ${largo} caracteres con este formato; el máximo es 24.`
  const anio = /\{AAAA\}|\{AA\}|\{AAMMDD\}/.test(formato), mes = /\{MM\}|\{AAMMDD\}/.test(formato), dia = /\{DD\}|\{AAMMDD\}/.test(formato)
  if (reinicio === 'diario' && !(anio && mes && dia)) return 'Con reinicio diario el formato debe llevar el año, el mes y el día (por ejemplo {AAMMDD}); si no, dos días distintos repetirían el folio.'
  if (reinicio === 'mensual' && !(anio && mes)) return 'Con reinicio mensual el formato debe llevar el año y el mes (por ejemplo {AA}{MM}); si no, dos meses distintos repetirían el folio.'
  if (reinicio === 'anual' && !anio) return 'Con reinicio anual el formato debe llevar el año ({AA} o {AAAA}); si no, dos años distintos repetirían el folio.'
  return null
}

/** Equivale a piefirme.folio_ticket_vista_previa. */
export function vistaPrevia(formato, reinicio, codigo, fecha, n) {
  if (!/^[0-9]{2}$/.test(codigo ?? '')) return { valido: false, error: 'El código corto de la sucursal debe ser de 2 dígitos.' }
  if (!fecha || !(n >= 1)) return { valido: false, error: 'Fecha o número inválidos.' }
  const e = validarFormato(formato, reinicio)
  if (e) return { valido: false, error: e }
  return { valido: true, folio: formatearFolio(formato, codigo, fecha, n), periodo: periodoClave(reinicio, fecha) }
}

/** Los N folios siguientes dado el último número usado en el período (vista previa en vivo). */
export function proximos(formato, reinicio, codigo, fecha, ultimo, cuantos = 3) {
  return Array.from({ length: cuantos }, (_, i) => vistaPrevia(formato, reinicio, codigo, fecha, ultimo + i + 1))
}
