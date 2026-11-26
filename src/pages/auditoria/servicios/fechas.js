// Fechas «AAAA-MM-DD» para los filtros de los reportes de servicios (sin zona horaria: son días locales de la clínica).
import { hoyISO } from '../../../lib/formato'

export function desdeHace(dias, base = hoyISO()) {
  const [a, m, d] = base.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d - dias))
  return f.toISOString().slice(0, 10)
}
