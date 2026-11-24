// Estado de resultados (EDR) — reglas P-090/P-100.
//  · proy_importe es MANUAL (solo Administración, vía RPC edr_guardar_proyeccion). NUNCA se escribe desde código automático.
//  · real_auto lo calcula la base (edr_recalcular); real_ajustes son ajustes manuales con motivo; real_importe = real_auto + real_ajustes.
//  · Utilidad gerencial «sin impuestos» = ingresos − gastos − fijos; el renglón memo (IVA) queda fuera.
const r2 = n => Math.round((Number(n) || 0) * 100) / 100

/** Columnas que el código automático puede escribir en edr_lineas: ninguna de proy_*. */
export const CAMPOS_PROY = ['proy_importe']
export const CAMPOS_REAL = ['real_auto', 'real_ajustes', 'real_importe']

/** ¿Puede el rol proyectar? (solo administrador). */
export const puedeProyectar = rol => rol === 'administrador'

/** Descarta cualquier campo proy_* de un objeto de cambios automáticos (defensa; la BD también lo impide). */
export function sinProyecciones(cambios) {
  return Object.fromEntries(Object.entries(cambios ?? {}).filter(([k]) => !k.startsWith('proy_')))
}
/** Cambios de una captura manual de proyección: solo si el actor es administrador y el periodo no está cerrado. */
export function cambiosProyeccion({ rol, estadoPeriodo, renglones }) {
  if (!puedeProyectar(rol)) return { ok: false, error: 'Solo Administración puede capturar proyecciones.' }
  if (estadoPeriodo === 'cerrado') return { ok: false, error: 'El periodo está cerrado.' }
  return { ok: true, lineas: (renglones ?? []).map(r => ({ renglon: r.clave, proy_importe: r2(r.proy_importe) })) }
}
/** real_importe esperado de una línea. */
export const realImporte = l => r2((Number(l.real_auto) || 0) + (Number(l.real_ajustes) || 0))

/** Orden y secciones del EDR. */
export const SECCIONES_EDR = [
  { tipo: 'ingreso', titulo: 'Ingresos', signo: 1 },
  { tipo: 'gasto', titulo: 'Gastos variables', signo: -1 },
  { tipo: 'fijo', titulo: 'Gastos fijos', signo: -1 },
  { tipo: 'memo', titulo: 'Memo (IVA, fuera de la utilidad)', signo: 0 },
]
export const variacion = (real, proy) => r2((Number(real) || 0) - (Number(proy) || 0))
export const variacionPct = (real, proy) => (Number(proy) ? Math.round(((real - proy) / Math.abs(proy)) * 1000) / 10 : null)

/**
 * Arma el estado de resultados a partir de filas de prp_edr / prp_edr_consolidado.
 * @returns { secciones:[{tipo,titulo,filas,total:{proy,real,var,pct}}], utilidad:{proy,real,var,pct}, margenPct }
 */
export function armarEDR(filas) {
  const secciones = SECCIONES_EDR.map(s => {
    const f = (filas ?? []).filter(x => (x.renglon_tipo ?? x.tipo) === s.tipo).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const proy = r2(f.reduce((a, x) => a + (Number(x.proy_importe) || 0), 0))
    const real = r2(f.reduce((a, x) => a + (Number(x.real_importe) || 0), 0))
    return { ...s, filas: f, total: { proy, real, var: variacion(real, proy), pct: variacionPct(real, proy) } }
  })
  const t = tipo => secciones.find(s => s.tipo === tipo).total
  const proy = r2(t('ingreso').proy - t('gasto').proy - t('fijo').proy)
  const real = r2(t('ingreso').real - t('gasto').real - t('fijo').real)
  return {
    secciones,
    utilidad: { proy, real, var: variacion(real, proy), pct: variacionPct(real, proy) },
    margenPct: t('ingreso').real > 0 ? Math.round((real / t('ingreso').real) * 1000) / 10 : null,
  }
}
/** Suma de varias sedes (cuando no hay consolidado): agrupa por renglón. */
export function consolidarSedes(filas) {
  const m = new Map()
  for (const x of filas ?? []) {
    const k = x.renglon_clave
    const a = m.get(k) ?? { ...x, proy_importe: 0, real_auto: 0, real_ajustes: 0, real_importe: 0, sede_id: null, sede_nombre: 'Consolidado' }
    a.proy_importe += Number(x.proy_importe) || 0; a.real_auto += Number(x.real_auto) || 0
    a.real_ajustes += Number(x.real_ajustes) || 0; a.real_importe += Number(x.real_importe) || 0
    m.set(k, a)
  }
  return [...m.values()]
}
/** Semáforo de variación para un renglón: ingresos por debajo de lo proyectado y gastos por encima son rojos. */
export function semaforoVariacion(tipo, real, proy, umbralPct = 10) {
  const pct = variacionPct(real, proy)
  if (pct == null) return 'n'
  const mala = tipo === 'ingreso' ? -pct : pct
  return mala > umbralPct ? 'r' : mala > 0 ? 'a' : 'v'
}
