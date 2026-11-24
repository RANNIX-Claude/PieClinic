// Consulta Asistente (clon adaptado de IRP «Utilerías → Consulta Asistente»): auditoría de lo que el asistente de IA consultó.
// El asistente vive en /asistente (pages/plataforma/admin/Asistente.jsx); aquí solo se REVISA su uso: qué vistas consultó,
// cuántas filas devolvió, si identificó a un paciente y si el acceso fue bloqueado. Lógica pura de filtrado y agrupación.
const mes = iso => String(iso ?? '').slice(0, 7)
const dia = iso => String(iso ?? '').slice(0, 10)

export function filtrarAccesos(accesos = [], { mes: m = '', vista = '', soloPaciente = false, soloBloqueados = false, texto = '' } = {}) {
  const t = texto.trim().toLowerCase()
  return accesos.filter(a =>
    (!m || mes(a.created_at) === m) && (!vista || a.vista === vista) && (!soloPaciente || a.identifica_paciente) && (!soloBloqueados || a.permitido === false)
    && (!t || [a.vista, a.motivo_bloqueo].some(x => String(x ?? '').toLowerCase().includes(t))))
}
export const mesesDe = accesos => [...new Set(accesos.map(a => mes(a.created_at)).filter(Boolean))].sort().reverse()
export const vistasDe = accesos => [...new Set(accesos.map(a => a.vista).filter(Boolean))].sort()
export function agruparPorDia(accesos = []) {
  const m = new Map()
  for (const a of accesos) { const d = dia(a.created_at); if (!m.has(d)) m.set(d, []); m.get(d).push(a) }
  return [...m.entries()].sort((x, y) => y[0].localeCompare(x[0]))
}
export function resumenAccesos(accesos = []) {
  const porVista = {}
  for (const a of accesos) porVista[a.vista] = (porVista[a.vista] ?? 0) + 1
  const top = Object.entries(porVista).sort((x, y) => y[1] - x[1])[0] ?? null
  return {
    total: accesos.length, bloqueados: accesos.filter(a => a.permitido === false).length, conPaciente: accesos.filter(a => a.identifica_paciente).length,
    filas: accesos.reduce((s, a) => s + (Number(a.filas_devueltas) || 0), 0), vistaTop: top ? { vista: top[0], n: top[1] } : null,
  }
}
