// Pruebas de la lógica de reportes, tablero y alertas (Etapa 6):  node --test src/lib/auditoria
import test from 'node:test'
import assert from 'node:assert/strict'
import { PdfDoc, anchoTexto, envolverTexto, recortarTexto } from './pdf.js'
import { armarReporteMensual, filasSucursales, nombreArchivoMensual } from './reporteMensualPdf.js'
import { armarPdfDiferencias, TOPE_RENGLONES_PDF } from './diferenciasPdf.js'
import {
  limpiarFiltros, describirFiltros, variacion, ultimosMeses, nombreMes, techoAlcanzado, fraseMezcla, textoRegla, esPendienteDeAjuste, NOMBRE_ESTADO_AJUSTE,
  columnasExcelDiferencias, filasExcelDiferencias, horasTexto, textoValor,
} from './reportes.js'
import { esCampoCiego } from './roles.js'

const texto = u8 => new TextDecoder('latin1').decode(u8)

/** Revisa que un PDF sea estructuralmente válido: cabecera, xref con offsets que apuntan a «N 0 obj», y devuelve el número de páginas. */
function validarPdf(bytes) {
  const s = texto(bytes)
  assert.ok(s.startsWith('%PDF-1.4'), 'cabecera PDF')
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'fin de archivo')
  const inicio = Number(s.match(/startxref\n(\d+)\n%%EOF/)[1])
  assert.ok(s.slice(inicio).startsWith('xref\n'), 'startxref apunta a la tabla xref')
  const [, n] = s.slice(inicio).match(/xref\n0 (\d+)\n/)
  const lineas = s.slice(inicio).split('\n').slice(2, 2 + Number(n))
  assert.equal(lineas.length, Number(n))
  lineas.slice(1).forEach((l, i) => {
    const off = Number(l.slice(0, 10))
    assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `el objeto ${i + 1} está en su offset`)
  })
  return Number(s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1])
}

const D = {
  ok: true, mes: '2026-11-01', mes_anterior: '2026-10-01', organizacion: 'Pie Clinic', zona: 'America/Mexico_City', generado_en: '2026-11-30T20:00:00Z',
  total: { faltante_valor: 21500, sobrante_valor: 3200, neto_valor: -18300, faltante_piezas: 40, sobrante_piezas: 8, lineas: 31, auditorias: 14 },
  total_anterior: { faltante_valor: 14000, sobrante_valor: 2000, neto_valor: -12000, lineas: 20 },
  por_sucursal: Array.from({ length: 7 }, (_, i) => ({ sucursal: `Sucursal ${i + 1}`, sucursal_id: `s${i}`, faltante_valor: 6000 - i * 800, sobrante_valor: 500, previo_faltante_valor: i === 6 ? 0 : 4000, variacion_pct: i === 6 ? null : 12.5 })),
  causas: [{ causa: 'Robo', casos: 3, valor: 4200, monto_absorbido: 3000 }, { causa: 'Error en el conteo', casos: 7, valor: 900, monto_absorbido: 0 }],
  casos: { nacidos_en_mes: 31, cerrados_en_mes: 12, cerrados_con_ajuste: 5, cerrados_sin_ajuste: 6, rechazados: 1, abiertos_al_cierre_del_mes: 19, abiertos_hoy: 19 },
  top_productos: Array.from({ length: 10 }, (_, i) => ({ puesto: i + 1, producto: `Producto con un nombre bastante largo para recortar ${i + 1}`, codigo_barras: `96${i}`, auditorias: 10 - i, sucursales: 3, faltante_piezas: 9 - i, faltante_valor: 3000 - i * 200 })),
  no_reportados: 2, nota: 'Valores al costo. La recurrencia de un producto es un indicador para investigar, no una conclusión.',
}

test('PDF mínimo: estructura válida, páginas contadas y acentos en WinAnsi', () => {
  const doc = new PdfDoc({ titulo: 'Prueba áéíóú ñ' })
  doc.texto(40, 40, 'Diferencia valorizada — ¿cuánto sobró? “comillas” • €', { size: 12, bold: true })
  doc.rect(10, 10, 100, 20, { relleno: [200, 0, 0], borde: [0, 0, 0] }); doc.linea(0, 0, 50, 50)
  doc.nuevaPagina(); doc.texto(10, 10, 'segunda')
  const bytes = doc.generar()
  assert.equal(validarPdf(bytes), 2)
  const s = texto(bytes)
  assert.match(s, /\/BaseFont \/Helvetica /); assert.match(s, /\/WinAnsiEncoding/)
  assert.ok(s.includes('e1'), 'la á va como byte 0xE1 (en hexadecimal)')
})

test('medidas de texto: acentos miden como su letra base; envolver y recortar respetan el ancho', () => {
  assert.equal(anchoTexto('á', 10), anchoTexto('a', 10)); assert.ok(anchoTexto('Hola mundo', 12, true) > anchoTexto('Hola mundo', 12, false))
  const lineas = envolverTexto('uno dos tres cuatro cinco seis siete ocho nueve diez', 10, 60)
  assert.ok(lineas.length > 2); for (const l of lineas) assert.ok(anchoTexto(l, 10) <= 60 || !l.includes(' '))
  assert.ok(anchoTexto(recortarTexto('Un texto larguísimo que no cabe', 9, 60), 9) <= 60)
  assert.equal(recortarTexto('corto', 9, 200), 'corto')
})

test('reporte mensual: SIEMPRE dos páginas, con datos, sin datos y con muchas sucursales', () => {
  assert.equal(validarPdf(armarReporteMensual(D).generar()), 2)
  const vacio = { ...D, total: { faltante_valor: 0, sobrante_valor: 0, neto_valor: 0, faltante_piezas: 0, sobrante_piezas: 0, lineas: 0, auditorias: 0 }, total_anterior: { faltante_valor: 0, sobrante_valor: 0, neto_valor: 0, lineas: 0 },
    por_sucursal: [], causas: [], top_productos: [], no_reportados: 0, casos: { ...D.casos, nacidos_en_mes: 0, cerrados_en_mes: 0, abiertos_al_cierre_del_mes: 0 } }
  assert.equal(validarPdf(armarReporteMensual(vacio).generar()), 2)
  const muchas = { ...D, por_sucursal: Array.from({ length: 40 }, (_, i) => ({ sucursal: `S${i}`, faltante_valor: 1000 - i, sobrante_valor: 0, previo_faltante_valor: 500, variacion_pct: 5 })) }
  assert.equal(validarPdf(armarReporteMensual(muchas).generar()), 2)
  assert.equal(nombreArchivoMensual(D), 'reporte_auditoria_2026-11.pdf')
})

test('reporte mensual: la recurrencia se rotula como indicador para investigar y los valores van al costo', () => {
  const s = texto(armarReporteMensual(D).generar())
  const decodificado = [...s.matchAll(/<([0-9a-f]+)> Tj/g)].map(x => Buffer.from(x[1], 'hex').toString('latin1')).join('\n')
  assert.match(decodificado, /Indicador para investigar/i); assert.match(decodificado, /al costo/i)
  assert.match(decodificado, /Control y Auditor.a/); assert.match(decodificado, /noviembre de 2026|noviembre 2026/i)
})

test('filasSucursales: más de 12 sucursales se agrupan en «Otras» sin perder el total', () => {
  const mucho = Array.from({ length: 15 }, (_, i) => ({ sucursal: `S${i}`, faltante_valor: 100, sobrante_valor: 10, previo_faltante_valor: 50 }))
  const f = filasSucursales(mucho, 12)
  assert.equal(f.length, 12); assert.equal(f[11].sucursal, 'Otras 4 sucursales'); assert.equal(f.reduce((s, x) => s + x.faltante_valor, 0), 1500)
  assert.equal(filasSucursales(mucho.slice(0, 5), 12).length, 5)
})

test('PDF de diferencias: encabezado, totales, varias páginas y tope de renglones', () => {
  const filas = Array.from({ length: 120 }, (_, i) => ({ fecha_hora: '2026-11-26T15:00:00Z', sucursal: 'Centenario', producto: `Producto ${i}`, fisica: 3, sistema: 4, dif_piezas: -1, dif_valor: -250, auditor: 'Ana', estado_ajuste: 'abierta' }))
  const d = { filas, total_filas: 120, totales: { faltantes_piezas: 120, faltantes_valor: 30000, sobrantes_piezas: 0, sobrantes_valor: 0, casos_pendientes_ajuste: 120 } }
  const pags = validarPdf(armarPdfDiferencias(d, { filtrosTexto: 'Periodo: 2026-09-01 a 2026-11-26 · Sucursales: todas', organizacion: 'Pie Clinic', fmtFecha: x => x }).generar())
  assert.ok(pags >= 3, `120 renglones horizontales ocupan varias páginas (${pags})`)
  const gigante = { ...d, filas: Array.from({ length: TOPE_RENGLONES_PDF + 50 }, () => filas[0]), total_filas: TOPE_RENGLONES_PDF + 50 }
  const s = texto(armarPdfDiferencias(gigante, {}).generar())
  const dec = [...s.matchAll(/<([0-9a-f]+)> Tj/g)].map(x => Buffer.from(x[1], 'hex').toString('latin1')).join('\n')
  assert.match(dec, /exporte a Excel/)
  assert.equal(validarPdf(armarPdfDiferencias({ filas: [], total_filas: 0, totales: d.totales }, {}).generar()), 1)
})

test('filtros: se limpian los vacíos y se describen en español', () => {
  assert.deepEqual(limpiarFiltros({ desde: '2026-09-01', tipo: '', auditor: null, sucursales: [], umbral_pesos: 500, exportar: false }), { desde: '2026-09-01', umbral_pesos: 500 })
  const t = describirFiltros({ desde: '2026-09-01', hasta: '2026-11-26', sucursales: ['a', 'b'], tipo: 'faltantes', umbral_pesos: 500, auditor: 'u1' },
    { sucursales: { a: 'Centenario', b: 'Chalco' }, auditores: { u1: 'Ana' } })
  assert.match(t, /Centenario, Chalco/); assert.match(t, /Solo faltantes/); assert.match(t, /Auditor: Ana/); assert.match(t, /Mínimo \$500 al costo/)
  assert.match(describirFiltros({}), /todas/)
})

test('variación contra el mes anterior: subir un faltante es malo', () => {
  assert.equal(variacion(150, 100).tono, 'malo'); assert.equal(variacion(150, 100).pct, 50)
  assert.equal(variacion(50, 100).tono, 'bueno'); assert.equal(variacion(0, 0).tono, 'neutro'); assert.equal(variacion(10, 0).tono, 'malo')
})

test('meses del reporte mensual', () => {
  const m = ultimosMeses('2026-11-26', 4)
  assert.deepEqual(m.map(x => x.valor), ['2026-11-01', '2026-10-01', '2026-09-01', '2026-08-01'])
  assert.match(nombreMes('2026-11-01'), /noviembre/i)
  assert.equal(ultimosMeses('2026-01-15', 2)[1].valor, '2025-12-01')
})

test('alertas: techo, textos y reglas', () => {
  assert.equal(techoAlcanzado(9, 10), false); assert.equal(techoAlcanzado(10, 10), true)
  assert.equal(textoRegla({ canales: ['push', 'whatsapp'], destinatarios: ['dueno'], inmediata: true }), 'Push + WhatsApp → Dueño')
  assert.match(textoRegla({ canales: ['correo'], destinatarios: ['dueno'], inmediata: false }), /solo en el resumen diario/)
  assert.match(horasTexto(30), /30 h/); assert.match(horasTexto(100), /4 días/); assert.equal(horasTexto(null), 'sin señal')
})

test('mezcla de pago: siempre «indicador para investigar», nunca hallazgo, y sin muestra no se compara', () => {
  assert.match(fraseMezcla({ muestra_suficiente: false }), /insuficiente/)
  assert.match(fraseMezcla({ muestra_suficiente: true, para_investigar: true, desviacion_pp: 20 }), /indicador para investigar/)
  assert.doesNotMatch(fraseMezcla({ muestra_suficiente: true, para_investigar: true, desviacion_pp: -20 }), /hallazgo|robo|culpa/i)
  assert.match(fraseMezcla({ muestra_suficiente: true, para_investigar: false, desviacion_pp: 2 }), /Dentro del rango/)
})

test('estado del ajuste: pendiente = abierta, en investigación o ajuste fallido', () => {
  for (const e of ['abierta', 'en_investigacion', 'ajuste_fallido']) assert.ok(esPendienteDeAjuste(e))
  for (const e of ['cerrada_con_ajuste', 'cerrada_sin_ajuste', 'rechazada', 'sin_caso']) assert.ok(!esPendienteDeAjuste(e))
  for (const e of ['sin_caso', 'abierta', 'en_investigacion', 'ajuste_fallido', 'cerrada_con_ajuste', 'cerrada_sin_ajuste', 'rechazada']) assert.ok(NOMBRE_ESTADO_AJUSTE[e])
})

test('exportación a Excel: columnas y filas con los campos del reporte (la diferencia es solo de dueño, supervisor y soporte)', () => {
  const cols = columnasExcelDiferencias()
  assert.deepEqual(cols.map(c => c.label), ['Fecha y hora', 'Sucursal', 'Producto', 'Código', 'Física', 'Sistema', 'Diferencia (pzas)', 'Diferencia al costo', 'Auditor', 'Estado del ajuste', 'Nota'])
  const f = filasExcelDiferencias([{ fecha_hora: '2026-11-26T15:00:00Z', sucursal: 'A', producto: 'P', fisica: '2', sistema: '3', dif_piezas: '-1', dif_valor: '-250.00', estado_ajuste: 'cerrada_con_ajuste', auditor: null, nota: null }], x => 'f')
  assert.deepEqual(f[0], { fecha_hora: 'f', sucursal: 'A', producto: 'P', codigo_barras: '', fisica: 2, sistema: 3, dif_piezas: -1, dif_valor: -250, auditor: '', estado_ajuste: 'Ajustada', nota: '' })
  assert.equal(textoValor(-250, n => `$${n}`), '−$250'); assert.equal(textoValor(0, n => `$${n}`), '$0')
  // estas columnas son justo las que NUNCA llegan a un rol de sucursal: confirman que la pantalla es de revisión
  assert.ok(esCampoCiego('dif_piezas') || esCampoCiego('diferencia_piezas') || esCampoCiego('saldo_sistema'))
})
