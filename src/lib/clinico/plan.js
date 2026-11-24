// Plan de tratamiento: genera las sesiones desde la plantilla igual que la RPC generar_sesiones_plan (034):
// cada sesión cae a `intervalo_dias` de la anterior; si la sede no abre ese día, pasa al siguiente día hábil
// y queda «atrasada» (P-028). Extracción de uña = extracción + 4 curaciones diarias consecutivas.
import { sumarDias } from './sinbad.js'

/** ISO weekday (lunes = 1 … domingo = 7) de 'YYYY-MM-DD'. */
export function diaIso(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 ? 7 : w
}

/** Primer día hábil desde `fecha` (máx. 15 saltos como la BD). diasCerrados: [7] = domingo; festivos: ['2026-11-02']. */
export function diaHabil(fecha, diasCerrados = [], festivos = []) {
  let d = fecha
  for (let i = 0; i < 15; i++) {
    if (!diasCerrados.includes(diaIso(d)) && !festivos.includes(d)) return d
    d = sumarDias(d, 1)
  }
  return d
}

/**
 * @param plantillaSesiones [{numero,nombre,procedimiento,tipo,intervalo_dias,ventana_min_dias,ventana_max_dias,duracion_min,precio,agenda_automatica}]
 * @returns sesiones [{numero,nombre,tipo,fecha_propuesta,ventana_desde,ventana_hasta,atrasada,duracion_min,precio,estado:'por_generar'}]
 */
export function generarSesionesPlan({ plantillaSesiones = [], fechaInicio, diasCerrados = [], festivos = [] }) {
  if (!fechaInicio) return []
  let prev = fechaInicio
  return [...plantillaSesiones].sort((a, b) => a.numero - b.numero).map(r => {
    const tentativa = sumarDias(prev, Number(r.intervalo_dias) || 0)
    const fecha = diaHabil(tentativa, diasCerrados, festivos)
    const s = {
      numero: r.numero, nombre: r.nombre, procedimiento: r.procedimiento ?? null, tipo: r.tipo,
      fecha_propuesta: fecha,
      ventana_desde: r.ventana_min_dias != null ? sumarDias(prev, r.ventana_min_dias) : null,
      ventana_hasta: r.ventana_max_dias != null ? sumarDias(prev, r.ventana_max_dias) : null,
      duracion_min: r.duracion_min, precio: Number(r.precio) || 0,
      atrasada: fecha > tentativa, estado: 'por_generar', agenda_automatica: !!r.agenda_automatica,
    }
    prev = fecha
    return s
  })
}

/** Plantilla base de extracción de uña (P-028 / N-03). Solo se usa en pruebas y como referencia: la real viene de plantillas_plan. */
export const PLANTILLA_EXTRACCION_REFERENCIA = [
  { numero: 1, nombre: 'Extracción de uña', tipo: 'procedimiento', intervalo_dias: 0, duracion_min: 60, precio: 1350 },
  ...[1, 2, 3, 4].map(n => ({ numero: n + 1, nombre: `Curación ${n}/4`, tipo: 'curacion', intervalo_dias: 1, duracion_min: 15, precio: 0 })),
]

export const totalPlan = sesiones => sesiones.reduce((a, s) => a + (Number(s.precio) || 0), 0)

/** Resumen de cumplimiento (mockup 05): realizadas de N, faltas, reprogramaciones, atrasadas. */
export function resumenCumplimiento(sesiones = []) {
  const vivas = sesiones.filter(s => s.estado !== 'cancelada')
  return {
    total: vivas.length,
    realizadas: vivas.filter(s => s.estado === 'realizada').length,
    faltas: vivas.filter(s => s.estado === 'falta').length,
    reprogramaciones: vivas.reduce((a, s) => a + (s.reprogramaciones || 0), 0),
    atrasadas: vivas.filter(s => s.atrasada && s.estado !== 'realizada').length,
  }
}

/** P-026: plan «abandonado» tras `dias` sin actividad (la BD lo marca; esto avisa antes en pantalla). */
export function diasSinActividad(ultimaActividadISO, hoyISO) {
  const f = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.max(0, Math.round((f(hoyISO) - f(ultimaActividadISO)) / 86400000))
}
export const planPorAbandonar = (ultimaActividadISO, hoyISO, dias = 30) => diasSinActividad(ultimaActividadISO, hoyISO) >= dias

/** Anticipo y saldo (mockup 05): el anticipo se aplica a la sesión 1. */
export function saldoTrasAnticipo(precioPlan, anticipo) {
  const p = Number(precioPlan) || 0, a = Math.min(Number(anticipo) || 0, p)
  return { anticipo: a, saldo: Math.round((p - a) * 100) / 100 }
}
