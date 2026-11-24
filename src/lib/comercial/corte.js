// Corte de caja (P-058/P-059): efectivo esperado, diferencia y tolerancia.
import { redondear, suma } from './dinero.js'

/** Efectivo a depositar = fondo + efectivo cobrado − retiros/gastos/devoluciones (+ depósitos) − cancelaciones en efectivo. */
export function efectivoEsperado({ fondo_inicial = 0, ventas_efectivo = 0, retiros = 0, depositos = 0, cancelaciones_efectivo = 0 }) {
  return redondear(Number(fondo_inicial) + Number(ventas_efectivo) - Number(retiros) + Number(depositos) - Number(cancelaciones_efectivo))
}

export const diferencia = (contado, esperado) => redondear(Number(contado) - Number(esperado))

/** ¿La diferencia supera la tolerancia ($50)? Solo entonces exige Administrador (P-058). */
export const fueraDeTolerancia = (dif, tolerancia = 50) => Math.abs(Number(dif)) > Number(tolerancia)

/**
 * Estado del cierre: sin diferencia → listo; diferencia dentro de tolerancia → justificación del cajero;
 * fuera de tolerancia → justificación + autorización de Administrador (PIN) salvo que cierre el propio Administrador.
 */
export function evaluarCierre({ contado, esperado, tolerancia = 50, justificacion = '', esAdmin = false, autorizado = false }) {
  const dif = diferencia(contado, esperado)
  if (dif === 0) return { dif, ok: true, requiere: [], fueraDeTolerancia: false }
  const requiere = []
  if (!String(justificacion).trim()) requiere.push('justificacion')
  const fuera = fueraDeTolerancia(dif, tolerancia)
  if (fuera && !esAdmin && !autorizado) requiere.push('administrador')
  return { dif, ok: requiere.length === 0, requiere, fueraDeTolerancia: fuera }
}

/**
 * Resumen del turno a partir de los pagos del turno (por método) y los movimientos de caja.
 * Los anticipos aplicados NO son dinero del turno (P-059): se muestran aparte y no entran al efectivo esperado.
 */
export function resumenTurno({ turno, pagos = [], movimientos = [], canceladasEfectivo = 0, canceladasTotal = 0, numeroCancelaciones = 0, ventasTotal = 0 }) {
  const por = m => suma(pagos.filter(p => p.metodo === m).map(p => p.monto))
  const retiros = suma(movimientos.filter(m => ['retiro', 'gasto', 'devolucion'].includes(m.tipo)).map(m => m.monto))
  const depositos = suma(movimientos.filter(m => m.tipo === 'deposito').map(m => m.monto))
  const ventas_efectivo = por('efectivo')
  const neto = redondear(retiros - depositos)
  return {
    fondo_inicial: Number(turno?.fondo_inicial ?? 0), ventas_efectivo, ventas_tarjeta: por('tarjeta'), ventas_transferencia: por('transferencia'),
    ventas_clip: por('clip'), ventas_gift_card: por('gift_card'), anticipos_aplicados: por('anticipo'), cortesias: por('cortesia'),
    retiros: neto, cancelaciones_efectivo: Number(canceladasEfectivo), cancelaciones_total: Number(canceladasTotal),
    numero_cancelaciones: numeroCancelaciones, ventas_total: Number(ventasTotal),
    efectivo_esperado: efectivoEsperado({ fondo_inicial: turno?.fondo_inicial ?? 0, ventas_efectivo, retiros: neto, cancelaciones_efectivo: canceladasEfectivo }),
  }
}
