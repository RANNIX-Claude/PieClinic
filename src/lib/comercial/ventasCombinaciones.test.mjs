// Combinaciones de conceptos, cantidades, descuentos (por renglón y global), IVA y anticipos: reglas que deben cumplirse siempre.
// Corre: node --test src/lib/comercial/ventasCombinaciones.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularLinea, totalesVenta, repartirDescuentoGlobal, requierePin, validarDescuento, cambio } from './ventas.js'
import { redondear, suma } from './dinero.js'

const PRECIOS = [0, 1, 99.99, 350, 750, 1234.56]
const CANTIDADES = [1, 2, 3, 7, 0.5]
const PCTS = [0, 5, 10, 10.01, 33.33, 50, 100, 120]
const IVAS = ['exento', '16']
const ANTICIPOS = [0, 100, 350, 5000]
const GLOBALES = [['pct', 0], ['pct', 10], ['pct', 100], ['monto', 50], ['monto', 400], ['monto', 99999]]

function* tickets() {
  for (const n of [1, 2, 3]) {
    const base = []
    for (const p of PRECIOS) for (const c of CANTIDADES) for (const iva of IVAS) base.push({ precio_unitario: p, cantidad: c, iva_tipo: iva })
    // n renglones tomados de forma determinista (rotando) para cubrir muchas mezclas
    for (let i = 0; i < base.length; i += 3) {
      const ls = Array.from({ length: n }, (_, k) => ({ ...base[(i + k * 7) % base.length], descuento_pct: 0, descuento_monto: 0 }))
      yield ls
    }
  }
}

test('línea: el descuento nunca pasa del importe, ni hay importes negativos, ni NaN', () => {
  const malos = []
  for (const p of PRECIOS) for (const c of CANTIDADES) for (const d of PCTS) for (const iva of IVAS) for (const dm of [0, 10, 5000]) {
    const r = calcularLinea({ precio_unitario: p, cantidad: c, descuento_pct: d, descuento_monto: dm, iva_tipo: iva })
    const vals = Object.values(r)
    if (!vals.every(Number.isFinite) || r.importe < 0 || r.descuento > r.importe_bruto + 0.001 || Math.abs(r.importe + r.descuento - r.importe_bruto) > 0.011 || Math.abs(r.base_neta + r.iva_monto - r.importe) > 0.011) malos.push({ p, c, d, iva, dm, r })
  }
  assert.equal(malos.length, 0, JSON.stringify(malos.slice(0, 3)))
})

test('ticket: total = suma de renglones, a_cobrar nunca negativo, con descuento por renglón, global y anticipo', () => {
  const malos = []
  let casos = 0
  for (const ls of tickets()) for (const d of [0, 10, 50]) for (const [tipo, valor] of GLOBALES) for (const ant of ANTICIPOS) {
    const conPct = ls.map(l => ({ ...l, descuento_pct: d }))
    const lineas = valor > 0 ? repartirDescuentoGlobal(conPct, tipo, valor) : conPct
    const t = totalesVenta(lineas, { anticipo: ant, pagos: [] })
    casos++
    const sumaImportes = suma(t.lineas.map(l => l.importe))
    const bien = [t.total, t.a_cobrar, t.subtotal, t.descuento_total, t.iva_total].every(Number.isFinite)
      && t.a_cobrar >= 0 && t.total >= 0 && Math.abs(t.total - sumaImportes) < 0.011
      && t.anticipo_aplicado <= t.total + 0.001 && Math.abs(t.subtotal - t.descuento_total - t.total) < 0.021
      && Math.abs(t.a_cobrar - (t.total - t.anticipo_aplicado)) < 0.011 && t.saldo === t.a_cobrar
    if (!bien && malos.length < 5) malos.push({ lineas: lineas.map(l => [l.precio_unitario, l.cantidad, l.descuento_pct, l.descuento_monto, l.iva_tipo]), d, tipo, valor, ant, t: { total: t.total, a_cobrar: t.a_cobrar, desc: t.descuento_total, sub: t.subtotal } })
  }
  assert.ok(casos > 1000, `solo ${casos} casos`)
  assert.equal(malos.length, 0, JSON.stringify(malos, null, 1))
})

test('descuento global en $: lo repartido suma lo pedido (tope: el subtotal)', () => {
  const malos = []
  for (const ls of tickets()) for (const v of [1, 50, 400, 99999]) {
    const rep = repartirDescuentoGlobal(ls, 'monto', v)
    const bruto = suma(ls.map(l => calcularLinea(l).importe_bruto))
    const esperado = Math.min(v, bruto)
    const dado = suma(rep.map(l => l.descuento_monto))
    if (Math.abs(dado - esperado) > 0.011) malos.push({ v, bruto, dado })
  }
  assert.equal(malos.length, 0, JSON.stringify(malos.slice(0, 3)))
})

test('PIN: recepción pasa del límite → pide PIN; administrador nunca; el podólogo no aplica descuentos', () => {
  for (const pct of [0, 5, 10, 10.004, 10.01, 50]) {
    assert.equal(requierePin({ pct, maxPct: 10, esAdmin: false }), pct > 10.005)
    assert.equal(requierePin({ pct, maxPct: 10, esAdmin: true }), false)
  }
  assert.equal(validarDescuento({ pct: 5, motivo: 'x', rol: 'podologo' }).ok, false)
  assert.equal(validarDescuento({ pct: 5, motivo: '', rol: 'recepcion' }).ok, false)
  assert.equal(validarDescuento({ pct: 50, motivo: 'x', rol: 'recepcion', autorizado: false }).pin, true)
  assert.equal(validarDescuento({ pct: 50, motivo: 'x', rol: 'recepcion', autorizado: true }).ok, true)
  assert.equal(validarDescuento({ pct: 0, motivo: '', rol: 'recepcion' }).ok, true)
})

test('cambio: nunca negativo y exacto', () => {
  for (const [r, m] of [[100, 350], [350, 350], [500, 350], [0, 0], ['', 10], [1000, 99.99]]) assert.ok(cambio(r, m) >= 0)
  assert.equal(cambio(500, 350), 150)
  assert.equal(cambio(1000, 99.99), 900.01)
})
