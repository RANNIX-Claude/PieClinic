// node --test src/lib/plataforma/pedidosEspeciales.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAPAS, TRANSICIONES, puedeTransitar, desglosarAnticipo, separarPorProveedor, accionesDisponibles, semaforo, inicialesCliente, sinCostos, puedeVerCostos, mensajeProveedor, importeLinea,
} from './pedidosEspeciales.js'

test('transiciones válidas: el camino feliz avanza una etapa a la vez', () => {
  for (let i = 0; i < ETAPAS.length - 1; i++) {
    const de = ETAPAS[i], a = ETAPAS[i + 1]
    // aceptado puede saltar a recibido (llega sin aviso de tránsito), el resto es estrictamente la siguiente etapa
    assert.equal(puedeTransitar(de, a), true, `${de} → ${a}`)
  }
  assert.equal(puedeTransitar('aceptado', 'recibido'), true)
  assert.equal(puedeTransitar('en_espera', 'solicitado'), true)
  assert.equal(puedeTransitar('en_espera', 'anticipo_cobrado'), true)
})

test('transiciones inválidas: no se salta ninguna etapa ni se sale de un estado final', () => {
  for (const [de, a] of [['solicitado', 'autorizado'], ['solicitado', 'entregado'], ['anticipo_cobrado', 'enviado_proveedor'], ['autorizado', 'recibido'], ['enviado_proveedor', 'recibido'],
    ['en_transito', 'entregado'], ['recibido', 'cancelado'], ['recibido', 'en_espera'], ['entregado', 'solicitado'], ['cancelado', 'solicitado'], ['entregado', 'cancelado']]) {
    assert.equal(puedeTransitar(de, a), false, `${de} → ${a} no debe permitirse`)
  }
  assert.deepEqual(TRANSICIONES.entregado, []); assert.deepEqual(TRANSICIONES.cancelado, [])
})

test('anticipo 50 % de $2,000 = $1,000 y saldo $1,000; otros porcentajes y topes', () => {
  assert.deepEqual(desglosarAnticipo(2000), { total: 2000, pct: 50, anticipo: 1000, saldo: 1000 })
  assert.deepEqual(desglosarAnticipo(2000, 30), { total: 2000, pct: 30, anticipo: 600, saldo: 1400 })
  assert.deepEqual(desglosarAnticipo(999.99, 50), { total: 999.99, pct: 50, anticipo: 500, saldo: 499.99 })
  assert.equal(desglosarAnticipo(2000, 150).anticipo, 2000, 'nunca más que el total')
  assert.equal(desglosarAnticipo(2000, 0).saldo, 2000)
})

test('una nota con zapato y plantilla de proveedores distintos se separa en dos pedidos con un solo anticipo por cobrar', () => {
  const lineas = [
    { proveedor_id: 'calzado', descripcion: 'Zapato', cantidad: 1, precio_unitario: 2000 },
    { proveedor_id: 'lab', descripcion: 'Plantilla', cantidad: 1, precio_unitario: 1000 },
    { proveedor_id: 'lab', descripcion: 'Realce', cantidad: 2, precio_unitario: 300 },
  ]
  const r = separarPorProveedor(lineas, id => (id === 'lab' ? 30 : null))
  assert.equal(r.pedidos.length, 2)
  const cal = r.pedidos.find(p => p.proveedor_id === 'calzado'), lab = r.pedidos.find(p => p.proveedor_id === 'lab')
  assert.equal(cal.total, 2000); assert.equal(cal.anticipo, 1000)
  assert.equal(lab.total, 1600); assert.equal(lab.anticipo, 480); assert.equal(lab.lineas.length, 2)
  assert.equal(r.total, 3600); assert.equal(r.anticipo, 1480); assert.equal(r.saldo, 2120)
  assert.equal(importeLinea(lineas[2]), 600)
})

test('acciones por etapa y rol: autoriza solo el propietario; recepción envía, registra y recibe; podología solo solicita', () => {
  const a = (estado, rol, extra = {}) => accionesDisponibles({ estado, rol, ...extra })
  assert.deepEqual(a('solicitado', 'recepcion'), ['cobrar_anticipo'])
  assert.deepEqual(a('solicitado', 'recepcion', { esSolicitante: true }), ['cobrar_anticipo', 'cancelar'])
  assert.deepEqual(a('solicitado', 'podologo', { esSolicitante: true }), ['cancelar'], 'el podólogo no cobra')
  assert.deepEqual(a('anticipo_cobrado', 'recepcion'), [], 'recepción no autoriza')
  assert.deepEqual(a('anticipo_cobrado', 'podologo'), [])
  assert.deepEqual(a('anticipo_cobrado', 'administrador'), ['autorizar', 'rechazar', 'cancelar'])
  assert.deepEqual(a('autorizado', 'recepcion'), ['enviar'])
  assert.deepEqual(a('enviado_proveedor', 'recepcion'), ['registrar_aceptacion', 'proveedor_rechaza'])
  assert.deepEqual(a('aceptado', 'recepcion'), ['registrar_transito', 'recibir'])
  assert.deepEqual(a('en_transito', 'recepcion'), ['recibir'])
  assert.deepEqual(a('recibido', 'recepcion'), ['entregar'])
  assert.deepEqual(a('recibido', 'podologo'), [])
  assert.deepEqual(a('entregado', 'administrador'), []); assert.deepEqual(a('cancelado', 'administrador'), [])
  assert.deepEqual(a('solicitado', 'administrador', { anticipoMonto: 0 }), ['cancelar'], 'sin anticipo no hay nada que cobrar')
})

test('semáforo de retraso: rojo vencido, ámbar en ≤ 2 días, verde a tiempo; sin semáforo al cerrarse', () => {
  const hoy = '2026-11-26'
  assert.equal(semaforo({ estado: 'autorizado', fecha_prometida: '2026-11-20' }, hoy), 'rojo')
  assert.equal(semaforo({ estado: 'autorizado', fecha_prometida: '2026-11-28' }, hoy), 'ambar')
  assert.equal(semaforo({ estado: 'autorizado', fecha_prometida: '2026-12-10' }, hoy), 'verde')
  assert.equal(semaforo({ estado: 'aceptado', fecha_prometida: '2026-12-10', fecha_acordada: '2026-11-25' }, hoy), 'rojo', 'manda la fecha acordada con el proveedor')
  assert.equal(semaforo({ estado: 'recibido', fecha_prometida: '2026-11-01', plazo_saldo: '2026-12-05' }, hoy), 'verde', 'recibido corre con el plazo del saldo')
  assert.equal(semaforo({ estado: 'recibido', fecha_prometida: '2026-12-01', plazo_saldo: '2026-11-25' }, hoy), 'rojo')
  for (const e of ['entregado', 'cancelado', 'en_espera']) assert.equal(semaforo({ estado: e, fecha_prometida: '2020-01-01' }, hoy), null)
})

test('costos solo para administrador y supervisor; el cliente se nombra por iniciales', () => {
  const fila = { folio: 'X', total: 2000, costo_estimado: 1200, costo_unitario: 1200, costo_total: 1200, partidas_sin_costo: 0 }
  assert.equal(puedeVerCostos('administrador'), true); assert.equal(puedeVerCostos('supervisor'), true)
  assert.equal(puedeVerCostos('recepcion'), false); assert.equal(puedeVerCostos('podologo'), false)
  assert.deepEqual(sinCostos(fila, 'recepcion'), { folio: 'X', total: 2000 })
  assert.deepEqual(sinCostos(fila, 'podologo'), { folio: 'X', total: 2000 })
  assert.equal(sinCostos(fila, 'administrador').costo_estimado, 1200)
  assert.equal(inicialesCliente('María', 'González', 'Ramírez'), 'M.G.R.')
  assert.equal(inicialesCliente('Ana', null, ''), 'A.')
})

test('el mensaje al proveedor lleva producto, características, cantidad, iniciales, nota, fecha y sucursal, y ningún dato personal ni precio', () => {
  const t = mensajeProveedor({ folio: 'CHA-PED-000012', notaFolio: 'CHA-NPE-000009', iniciales: 'M.G.R.', sede: 'Chalco', fechaRequerida: '2026-12-15',
    lineas: [{ cantidad: 1, descripcion: 'Zapato a la medida talla 26', tipo_item: 'zapato', caracteristicas: [{ frase: 'piel color negro' }, { frase: 'suela de hule' }] }] })
  for (const parte of ['CHA-PED-000012', 'CHA-NPE-000009', 'M.G.R.', 'Chalco', '15/12/2026', '1 × Zapato a la medida talla 26', 'piel color negro; suela de hule']) assert.ok(t.includes(parte), parte)
  assert.doesNotMatch(t, /María|González|\$|2000/)
})
