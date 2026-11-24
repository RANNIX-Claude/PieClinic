// Validación del sistema (clon adaptado de IRP «Validación»): chequeos de integridad por clínica.
// Las vistas prp_validacion_chequeos / prp_validacion_detalle (migración 060) devuelven los renglones con problema; aquí viven
// el catálogo de chequeos, el semáforo y el armado del resumen. Solo señala: nunca corrige datos.

/** severidad: 'critica' (rojo con 1 solo caso) | 'alta' (ámbar con 1, rojo desde 10) | 'media' (ámbar siempre). */
export const CHEQUEOS = [
  { clave: 'ingresos_sin_cobro', grupo: 'Dinero', titulo: 'Ingresos sin cobro', severidad: 'critica', ruta: '/ingresos', moduloLabel: 'Ingresos',
    que: 'Ingresos ligados a un ticket cancelado sin reembolso o que sigue «por cobrar».', como: 'Revisa el ticket en Caja; cancela con reembolso o regulariza el cobro.' },
  { clave: 'ventas_sin_ingreso', grupo: 'Dinero', titulo: 'Ventas cobradas sin ingreso', severidad: 'critica', ruta: '/caja', moduloLabel: 'Caja',
    que: 'Tickets cobrados con pagos reales que no generaron su ingreso (el dinero no llega al EDR ni a la conciliación).', como: 'Avisa a soporte: el ingreso se genera por trigger al registrar el pago.' },
  { clave: 'facturas_sin_venta', grupo: 'Dinero', titulo: 'Facturas sin venta', severidad: 'alta', ruta: '/facturacion', moduloLabel: 'Facturación',
    que: 'CFDI de ingreso vigentes sin ticket de origen (o factura global sin tickets).', como: 'Liga la factura a su ticket o cancélala con el motivo SAT.' },
  { clave: 'ingresos_descuadrados', grupo: 'Dinero', titulo: 'Ingresos descuadrados', severidad: 'alta', ruta: '/ingresos', moduloLabel: 'Ingresos',
    que: 'Ingresos cuyas aplicaciones a cuentas por cobrar no suman su importe.', como: 'Corrige las aplicaciones en Ingresos → Cuentas por cobrar.' },
  { clave: 'citas_sin_cobro', grupo: 'Operación', titulo: 'Citas atendidas sin cobro', severidad: 'alta', ruta: '/caja', moduloLabel: 'Caja',
    que: 'Citas atendidas hace más de 24 h sin ticket (excluye planes, garantías y precio $0).', como: 'Cobra la cita en Caja o registra el motivo (cortesía/garantía).' },
  { clave: 'notas_sin_firmar', grupo: 'Clínico', titulo: 'Notas clínicas sin firmar', severidad: 'alta', ruta: '/consultas', moduloLabel: 'Consultas',
    que: 'Consultas en borrador o pendientes de firma por más de 24 h (NOM-004).', como: 'El podólogo firma la nota; sin firma no se cierra ni se imprime.' },
  { clave: 'consentimientos_faltantes', grupo: 'Clínico', titulo: 'Consentimientos faltantes', severidad: 'alta', ruta: '/pacientes', moduloLabel: 'Pacientes',
    que: 'Pacientes con consulta y sin aviso de privacidad o consentimiento de datos de salud firmados.', como: 'Recaba la firma en pantalla o sube el papel escaneado al expediente.' },
  { clave: 'expedientes_duplicados', grupo: 'Clínico', titulo: 'Expedientes duplicados', severidad: 'media', ruta: '/pacientes', moduloLabel: 'Pacientes',
    que: 'Pacientes activos con el mismo nombre, apellido paterno y fecha de nacimiento (si no se confirmó «no es la misma persona»).', como: 'Fusiona los expedientes (solo Administrador) o confirma que son homónimos.' },
  { clave: 'inventario_negativo', grupo: 'Operación', titulo: 'Inventario negativo', severidad: 'media', ruta: '/inventario', moduloLabel: 'Inventario',
    que: 'Productos con existencia menor a cero en alguna sede (se permite vender sin existencia, P-085, pero hay que conciliar).', como: 'Registra la compra o el conteo físico que regulariza la existencia.' },
  { clave: 'conciliacion_pendiente', grupo: 'Dinero', titulo: 'Conciliación pendiente', severidad: 'media', ruta: '/conciliacion', moduloLabel: 'Conciliación',
    que: 'Movimientos del banco sin conciliar pasados 3 días.', como: 'Concilia contra cobros o márcalos como gasto / sin cobro.' },
  { clave: 'cuadre_edr_ingresos', grupo: 'Dinero', titulo: 'Cuadre EDR vs ingresos', severidad: 'critica', ruta: '/estado-resultados', moduloLabel: 'Estado de resultados',
    que: 'Periodos abiertos (últimos 6 meses) donde el real automático de ingresos del EDR difiere más de $1.00 de los ingresos del mes (base sin IVA, reembolsos restan).', como: 'Recalcula el periodo en el EDR; si persiste, revisa ingresos sin renglón.' },
  { clave: 'cuadre_edr_gastos', grupo: 'Dinero', titulo: 'Cuadre EDR vs gastos', severidad: 'alta', ruta: '/estado-resultados', moduloLabel: 'Estado de resultados',
    que: 'Meses donde los gastos de renglón (gasto y fijo) del EDR difieren más de $1.00 de los gastos guardados del mes.', como: 'Revisa grupos de gasto sin renglón del EDR y recalcula el periodo.' },
]

export const CHEQUEO_POR_CLAVE = Object.fromEntries(CHEQUEOS.map(c => [c.clave, c]))
export const GRUPOS_CHEQUEO = [...new Set(CHEQUEOS.map(c => c.grupo))]

/** Semáforo de un chequeo según su conteo y severidad: 'v' verde, 'a' ámbar, 'r' rojo. */
export function semaforoChequeo(n, severidad = 'media', rojoDesde = 10) {
  const c = Number(n) || 0
  if (c === 0) return 'v'
  if (severidad === 'critica') return 'r'
  if (severidad === 'alta') return c >= rojoDesde ? 'r' : 'a'
  return 'a'
}
export const ETIQUETA_SEMAFORO = { v: 'Sin problemas', a: 'Por revisar', r: 'Atender ya' }

/**
 * Junta las filas de prp_validacion_chequeos (por sede y chequeo) en una fila por chequeo del catálogo.
 * Los chequeos sin filas salen con 0 (verde). `sedeId` filtra a una sede (las filas sin sede, como el cuadre de gastos, se cuentan siempre).
 */
export function resumenChequeos(filas = [], { sedeId = null } = {}) {
  const por = {}
  for (const f of filas) {
    if (sedeId && f.sede_id && f.sede_id !== sedeId) continue
    const a = (por[f.clave] ??= { n: 0, importe: 0, desde: null, hasta: null, sedes: new Set() })
    a.n += Number(f.n) || 0
    a.importe += Number(f.importe) || 0
    if (f.desde && (!a.desde || f.desde < a.desde)) a.desde = f.desde
    if (f.hasta && (!a.hasta || f.hasta > a.hasta)) a.hasta = f.hasta
    if (f.sede_id) a.sedes.add(f.sede_id)
  }
  return CHEQUEOS.map(c => {
    const a = por[c.clave] ?? { n: 0, importe: 0, desde: null, hasta: null, sedes: new Set() }
    return { ...c, n: a.n, importe: Math.round(a.importe * 100) / 100, desde: a.desde, hasta: a.hasta, sedes: a.sedes.size, semaforo: semaforoChequeo(a.n, c.severidad) }
  })
}

/** Totales del tablero: cuántos chequeos en cada color y semáforo global (el peor). */
export function totalesValidacion(resumen = []) {
  const t = { v: 0, a: 0, r: 0, problemas: 0 }
  for (const c of resumen) { t[c.semaforo]++; t.problemas += c.n }
  t.global = t.r ? 'r' : t.a ? 'a' : 'v'
  t.total = resumen.length
  return t
}

/** Salud como porcentaje: chequeos en verde / total. */
export const saludPct = t => (t.total ? Math.round((t.v / t.total) * 100) : 0)

/** Filas de detalle → filas listas para exportar (etiquetas en español). */
export function filasExportables(detalle = []) {
  return detalle.map(d => ({ chequeo: CHEQUEO_POR_CLAVE[d.clave]?.titulo ?? d.clave, referencia: d.referencia, fecha: d.fecha, importe: d.importe, descripcion: d.descripcion }))
}
