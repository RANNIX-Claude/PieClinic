import test from 'node:test'
import assert from 'node:assert/strict'
import { formatearFolio, periodoClave, validarFormato, vistaPrevia, proximos, FORMATO_DEFECTO } from './folioTicket.js'
import { CASOS_FORMATO, CASOS_INVALIDOS } from './folioTicketCasos.js'

test('formato y período de cada caso', () => {
  for (const c of CASOS_FORMATO) {
    assert.equal(validarFormato(c.f, c.r), null, `${c.f} / ${c.r}`)
    assert.equal(formatearFolio(c.f, c.cod, c.fecha, c.n), c.folio)
    assert.equal(periodoClave(c.r, c.fecha), c.periodo)
    assert.deepEqual(vistaPrevia(c.f, c.r, c.cod, c.fecha, c.n), { valido: true, folio: c.folio, periodo: c.periodo })
  }
})
test('el valor por omisión da el ejemplo del dueño: 01-261126-003', () => {
  assert.equal(FORMATO_DEFECTO, '{SUC}-{AAMMDD}-{NNN}')
  assert.equal(formatearFolio(FORMATO_DEFECTO, '01', '2026-11-26', 3), '01-261126-003')
})
test('validaciones: cada formato inválido se rechaza con su motivo', () => {
  for (const c of CASOS_INVALIDOS) {
    const e = validarFormato(c.f, c.r)
    assert.ok(e, `debía rechazar «${c.f}» / ${c.r}`)
    assert.match(e, c.msg, `${c.f}: ${e}`)
  }
})
test('reinicio diario/mensual/anual/nunca: el contador reinicia solo al cambiar el período', () => {
  const sim = (r, fechas) => { const c = new Map(); return fechas.map(f => { const k = periodoClave(r, f); c.set(k, (c.get(k) ?? 0) + 1); return c.get(k) }) }
  assert.deepEqual(sim('diario', ['2026-11-26', '2026-11-26', '2026-11-27']), [1, 2, 1])
  assert.deepEqual(sim('mensual', ['2026-11-26', '2026-11-30', '2026-12-01']), [1, 2, 1])
  assert.deepEqual(sim('anual', ['2026-12-31', '2026-12-31', '2027-01-01']), [1, 2, 1])
  assert.deepEqual(sim('nunca', ['2026-12-31', '2027-01-01', '2030-05-05']), [1, 2, 3])
})
test('vista previa: código corto inválido y números inválidos', () => {
  assert.equal(vistaPrevia(FORMATO_DEFECTO, 'diario', '1', '2026-11-26', 1).valido, false)
  assert.equal(vistaPrevia(FORMATO_DEFECTO, 'diario', '01', '2026-11-26', 0).valido, false)
  assert.match(vistaPrevia('{SUC}', 'nunca', '01', '2026-11-26', 1).error, /consecutivo/)
})
test('los 3 folios siguientes', () => {
  assert.deepEqual(proximos(FORMATO_DEFECTO, 'diario', '01', '2026-11-26', 2).map(x => x.folio), ['01-261126-003', '01-261126-004', '01-261126-005'])
})
test('10 tickets simultáneos no repiten (modelo del contador: la fila bloqueada serializa)', async () => {
  let ultimo = 0, cola = Promise.resolve()
  const emitir = () => { const p = cola.then(async () => { await new Promise(r => setTimeout(r, Math.random() * 3)); ultimo += 1; return formatearFolio(FORMATO_DEFECTO, '01', '2026-11-26', ultimo) }); cola = p.catch(() => {}); return p }
  const f = await Promise.all(Array.from({ length: 10 }, emitir))
  assert.equal(new Set(f).size, 10)
  assert.deepEqual([...f].sort(), Array.from({ length: 10 }, (_, i) => `01-261126-${String(i + 1).padStart(3, '0')}`))
})
test('cambio de formato solo hacia adelante: los folios emitidos conservan su texto', () => {
  const emitidos = [formatearFolio('{SUC}-{AAMMDD}-{NNN}', '01', '2026-11-26', 1)]
  const nuevo = formatearFolio('{SUC}{AAMMDD}{NNNN}', '01', '2026-11-26', 2)
  assert.deepEqual(emitidos, ['01-261126-001'])
  assert.equal(nuevo, '012611260002')
})
test('los tres roles comparten el consecutivo: el folio no depende de quien cobra', () => {
  const por = new Map()
  const cobrar = (_rol, sede) => { por.set(sede, (por.get(sede) ?? 0) + 1); return formatearFolio(FORMATO_DEFECTO, sede, '2026-11-26', por.get(sede)) }
  assert.deepEqual(['recepcion', 'podologo', 'encargado', 'recepcion'].map(r => cobrar(r, '01')), ['01-261126-001', '01-261126-002', '01-261126-003', '01-261126-004'])
  assert.equal(cobrar('recepcion', '02'), '02-261126-001')
})
test('offline idempotente: mismo cliente_uuid devuelve el mismo folio definitivo y conserva el provisional', () => {
  const ventas = new Map(); let ultimo = 0
  const sincronizar = p => {
    if (ventas.has(p.uuid)) return { ...ventas.get(p.uuid), ya_existia: true }
    ultimo += 1
    const v = { folio: formatearFolio(FORMATO_DEFECTO, '01', '2026-11-26', ultimo), folio_offline: p.provisional }
    ventas.set(p.uuid, v); return { ...v, ya_existia: false }
  }
  const a = sincronizar({ uuid: 'u1', provisional: 'OFF-CENTENARIO-0001' }), b = sincronizar({ uuid: 'u1', provisional: 'OFF-CENTENARIO-0001' }), c = sincronizar({ uuid: 'u2', provisional: 'OFF-CENTENARIO-0002' })
  assert.equal(a.folio, '01-261126-001'); assert.equal(b.folio, a.folio); assert.equal(b.ya_existia, true)
  assert.equal(c.folio, '01-261126-002'); assert.equal(c.folio_offline, 'OFF-CENTENARIO-0002')
})
