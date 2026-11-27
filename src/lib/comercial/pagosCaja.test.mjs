// Pruebas de TODAS las combinaciones de botones de pago de la caja (sin navegador, en segundos).
// Corre: node --test src/lib/comercial/pagosCaja.test.mjs
// Explora exhaustivamente las secuencias cortas de gestos y miles de secuencias largas al azar, y reporta cada regla rota con su ejemplo más corto.
import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarPago, alternarMetodo, quitarPago, fijarMonto, completarPago, fijarRecibido, recibirExacto, validarPagos, saldoPagos, ajustarAuto } from './pagosCaja.js'

const METODOS = ['efectivo', 'tarjeta', 'transferencia']
let k = 0
const clave = () => `t${++k}`
const por = (pagos, m) => pagos.find(p => p.metodo === m)

// ── gestos: cada uno recibe {pagos,total} y devuelve el estado nuevo ──
const GESTOS = []
for (const m of METODOS) GESTOS.push({ n: `elegir/quitar ${m}`, seguro: true, f: s => ({ ...s, pagos: alternarMetodo(s.pagos, m, s.total, clave()) }) })
for (const m of METODOS) GESTOS.push({ n: `X de ${m}`, seguro: true, f: s => { const p = por(s.pagos, m); return p ? { ...s, pagos: quitarPago(s.pagos, p.clave, s.total) } : s } })
GESTOS.push({ n: 'Exacto', seguro: true, f: s => { const p = por(s.pagos, 'efectivo'); return p ? { ...s, pagos: recibirExacto(s.pagos, p.clave) } : s } })
for (const v of [100, 200, 500, 1000]) GESTOS.push({ n: `recibido $${v}`, seguro: true, f: s => { const p = por(s.pagos, 'efectivo'); return p ? { ...s, pagos: fijarRecibido(s.pagos, p.clave, v, s.total) } : s } })
for (const t of [350, 600, 1100]) GESTOS.push({ n: `total→${t}`, seguro: true, f: s => ({ ...s, total: t, pagos: ajustarAuto(s.pagos, t) }) })
for (const m of METODOS) for (const v of [0, 50, 250, 5000]) GESTOS.push({ n: `teclear monto ${m}=${v}`, seguro: false, f: s => { const p = por(s.pagos, m); return p ? { ...s, pagos: fijarMonto(s.pagos, p.clave, v, s.total) } : s } })
for (const m of METODOS) GESTOS.push({ n: `Completar ${m}`, seguro: false, f: s => { const p = por(s.pagos, m); return p ? { ...s, pagos: completarPago(s.pagos, p.clave, s.total) } : s } })

// ── reglas que deben cumplirse SIEMPRE ──
const REGLAS = [
  ['R1 montos finitos y no negativos', (s) => s.pagos.every(p => Number.isFinite(Number(p.monto)) && Number(p.monto) >= 0)],
  ['R2 un método no se repite', (s) => new Set(s.pagos.map(p => p.metodo)).size === s.pagos.length],
  ['R3 a lo más un pago automático', (s) => s.pagos.filter(p => p.auto).length <= 1],
  ['R4 si hay pagos y alguno es automático, el saldo es 0 (o los fijos ya se pasan)', (s) => {
    if (!s.pagos.some(p => p.auto)) return true
    const fijos = s.pagos.filter(p => !p.auto).reduce((a, p) => a + Number(p.monto), 0)
    return saldoPagos(s.pagos, s.total) === 0 || fijos > s.total
  }],
  ['R5 el efectivo recibido nunca es menor al monto del efectivo (con cualquier gesto, también tecleando el monto)', (s) => {
    const e = por(s.pagos, 'efectivo'); return !e || e.recibido === '' || Number(e.recibido) >= Number(e.monto)
  }],
  ['R6 con gestos seguros y algún pago, nada queda sin cubrir ni de más (salvo fijos que ya se pasan)', (s, seguro) => {
    if (!seguro || !s.pagos.length) return true
    const sal = saldoPagos(s.pagos, s.total)
    if (sal === 0) return true
    const fijos = s.pagos.filter(p => !p.auto).reduce((a, p) => a + Number(p.monto), 0)
    if (s.pagos.length === 1 && s.pagos[0].metodo === 'efectivo' && s.pagos[0].recibido !== '') return true // efectivo parcial a propósito: falta otro método
    return sal < 0 && fijos > s.total
  }],
  ['R7 con gestos seguros, sin pagos de $0 salvo el recién agregado sobre un total ya cubierto', (s, seguro) => {
    if (!seguro) return true
    return s.pagos.filter(p => Number(p.monto) === 0).length <= Math.max(0, s.pagos.length - 1)
  }],
  ['R8 un pago único siempre es el total (con gestos seguros y sin recibido parcial)', (s, seguro) => {
    if (!seguro || s.pagos.length !== 1) return true
    const p = s.pagos[0]
    if (p.metodo === 'efectivo' && p.recibido !== '' && !p.auto) return true // efectivo parcial elegido a propósito
    return Number(p.monto) === s.total
  }],
  ['R9 el cambio nunca es negativo (con gestos seguros)', (s, seguro) => { const e = por(s.pagos, 'efectivo'); return !seguro || !e || e.recibido === '' || Number(e.recibido) - Number(e.monto) >= 0 }],
  ['R10 validarPagos no truena y devuelve texto o null', (s) => { const r = validarPagos(s.pagos, s.total); return r === null || (typeof r === 'string' && r.length > 0) }],
]

function revisar(estado, seguro, ruta, fallas) {
  for (const [nombre, ok] of REGLAS) {
    let bien
    try { bien = ok(estado, seguro) } catch { bien = false }
    if (!bien && !fallas.has(nombre)) fallas.set(nombre, { ruta: ruta.join(' → '), estado: JSON.stringify(estado.pagos.map(p => ({ m: p.metodo, monto: p.monto, auto: p.auto, rec: p.recibido })) ) + ` total=${estado.total}` })
  }
}

test('exploración exhaustiva de secuencias cortas', () => {
  const fallas = new Map()
  const inicial = [350, 1100]
  const recorrer = (estado, ruta, seguro, prof) => {
    if (prof === 0) return
    for (const g of GESTOS) {
      const sig = g.f(estado)
      const r = [...ruta, g.n], seg = seguro && g.seguro
      revisar(sig, seg, r, fallas)
      recorrer(sig, r, seg, prof - 1)
    }
  }
  for (const t of inicial) recorrer({ pagos: [], total: t }, [`total ${t}`], true, 4)
  const lista = [...fallas].map(([r, v]) => `${r}\n    ejemplo: ${v.ruta}\n    queda: ${v.estado}`)
  assert.equal(lista.length, 0, `\nREGLAS ROTAS (${lista.length}):\n  ${lista.join('\n  ')}\n`)
})

test('secuencias largas al azar', () => {
  const fallas = new Map()
  let semilla = 12345
  const rnd = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296
  for (let i = 0; i < 20000; i++) {
    let estado = { pagos: [], total: [350, 600, 1100][Math.floor(rnd() * 3)] }, seg = true
    const ruta = [`total ${estado.total}`]
    for (let j = 0; j < 12; j++) {
      const g = GESTOS[Math.floor(rnd() * GESTOS.length)]
      estado = g.f(estado); seg = seg && g.seguro; ruta.push(g.n)
      revisar(estado, seg, ruta, fallas)
    }
  }
  const lista = [...fallas].map(([r, v]) => `${r}\n    ejemplo: ${v.ruta}\n    queda: ${v.estado}`)
  assert.equal(lista.length, 0, `\nREGLAS ROTAS (${lista.length}):\n  ${lista.join('\n  ')}\n`)
})

// ── casos reales que reportó el cajero ──
test('A: Efectivo con un concepto y luego se agregan más: el pago sigue al total', () => {
  let p = agregarPago([], 'efectivo', 350, 'e')
  p = ajustarAuto(p, 1100)
  assert.equal(p[0].monto, 1100)
})
test('B: total 1,100, Efectivo, Tarjeta, recibido $500 → efectivo 500 y tarjeta 600', () => {
  let p = agregarPago([], 'efectivo', 1100, 'e'); p = agregarPago(p, 'tarjeta', 1100, 't')
  p = fijarRecibido(p, 'e', 500, 1100)
  assert.equal(por(p, 'efectivo').monto, 500)
  assert.equal(saldoPagos(p, 1100), 0)
})
test('C: Tarjeta primero y luego Efectivo con recibido $100 → tarjeta 250, efectivo 100, cambio 0', () => {
  let p = agregarPago([], 'tarjeta', 350, 't'); p = agregarPago(p, 'efectivo', 350, 'e')
  p = fijarRecibido(p, 'e', 100, 350)
  assert.equal(por(p, 'tarjeta').monto, 250)
  assert.equal(por(p, 'efectivo').monto, 100)
  assert.match(validarPagos(p, 350), /autorización/)          // la tarjeta exige su autorización
  p = p.map(x => (x.metodo === 'tarjeta' ? { ...x, referencia: 'A1234' } : x))
  assert.equal(validarPagos(p, 350), null)
})
test('G: tarjeta y transferencia exigen su referencia; con ella pasan', () => {
  let p = agregarPago([], 'tarjeta', 350, 't'); p = agregarPago(p, 'transferencia', 350, 's'); p = fijarMonto(p, 's', 100, 350)
  assert.match(validarPagos(p, 350), /autorización de la tarjeta/)
  p = p.map(x => (x.metodo === 'tarjeta' ? { ...x, referencia: '  ' } : x))
  assert.match(validarPagos(p, 350), /autorización de la tarjeta/)   // solo espacios no cuenta
  p = p.map(x => (x.metodo === 'tarjeta' ? { ...x, referencia: 'A1234' } : x))
  assert.match(validarPagos(p, 350), /clave de rastreo/)
  p = p.map(x => (x.metodo === 'transferencia' ? { ...x, referencia: 'RAST-998877' } : x))
  assert.equal(validarPagos(p, 350), null)
})
test('D: elegir un método por error y quitarlo con el mismo botón', () => {
  let p = agregarPago([], 'tarjeta', 350, 't'); p = alternarMetodo(p, 'tarjeta', 350)
  assert.deepEqual(p, [])
})
test('E: Tarjeta + Efectivo de $100 y se quita la tarjeta → el efectivo vuelve a cubrir el total', () => {
  let p = agregarPago([], 'tarjeta', 350, 't'); p = agregarPago(p, 'efectivo', 350, 'e'); p = fijarRecibido(p, 'e', 100, 350)
  p = quitarPago(p, 't', 350)
  assert.equal(p.length, 1); assert.equal(p[0].monto, 350)
})
test('F: pasarse del total avisa «de más»; quedarse corto avisa «faltan»', () => {
  let p = agregarPago([], 'efectivo', 1100, 'e'); p = agregarPago(p, 'tarjeta', 1100, 't'); p = fijarMonto(p, 't', 600, 1100)
  assert.equal(saldoPagos(p, 1100), 0) // el efectivo automático bajó a 500
  p = fijarMonto(p, 'e', 1100, 1100)
  assert.match(validarPagos(p, 1100), /de más/)
  p = fijarMonto(p, 'e', 100, 1100); p = fijarMonto(p, 't', 100, 1100)
  assert.match(validarPagos(p, 1100), /faltan/)
})

test('H: si se cambia el monto del efectivo a mano, lo recibido lo sigue (no queda un cambio fantasma)', () => {
  let p = agregarPago([], 'clip', 650, 'c'); p = agregarPago(p, 'efectivo', 650, 'e')
  p = fijarMonto(p, 'e', 200, 650); p = fijarRecibido(p, 'e', 200, 650)   // efectivo 200 recibido 200
  p = fijarMonto(p, 'e', 150, 650)                                          // el cajero corrige el monto a 150
  assert.equal(por(p, 'efectivo').recibido, '150')
  assert.equal(por(p, 'clip').monto, 500)
  assert.equal(saldoPagos(p, 650), 0)
  const e = por(p, 'efectivo'); assert.equal(Number(e.recibido) - Number(e.monto), 0)  // cambio 0, no $50
})
