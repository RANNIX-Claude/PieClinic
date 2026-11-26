// Pruebas de la PWA móvil de Auditoría (Etapa 5): cola idempotente, reintentos, caducidad de sesión, compresión/hash, sin galería, captura a ciegas.
//   node --test src/lib/auditoria
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearCola, almacenMemoria, esperaSeg, esErrorDeRed, esErrorDeSesion, avisoPendientes, ESPERA_TOPE_SEG } from './pwaCola.js'
import { esPinValido, estadoBloqueo, crearSesionLocal, sesionVigente, horaServidorEstimada } from './pwaSesion.js'
import { caminosDeGaleria, discrepanciaDeReloj, restriccionesFoto } from './pwaCamara.js'
import { crearCierreLocal, aplicarCaptura, aplicarFoto, recorridoLocal, fusionarServidor } from './pwaCierreLocal.js'
import { escalaFoto, hashDeFoto, LADO_LARGO_POR_OMISION } from './foto.js'
import { llavesCiegas } from './conteoCaptura.js'
import { progresoRecorrido, siguientePendiente, tieneCamposEsperado } from './cierres.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(AQUI, '..', '..', '..')

// ───────────── cola idempotente ─────────────
function banco({ ejecutar, t0 = 1_000_000 } = {}) {
  let reloj = t0
  const enviados = []
  const almacen = almacenMemoria()
  const cola = crearCola({ almacen, ahora: () => reloj, ejecutar: ejecutar ?? (async it => { enviados.push(it.id); return { data: { ok: true } } }) })
  return { cola, almacen, enviados, avanzar: s => { reloj += s * 1000 }, ahora: () => reloj }
}

test('cola: encolar dos veces el mismo id no duplica', async () => {
  const b = banco()
  const a = await b.cola.encolar('partida', { codigo: '7501' }, { id: 'p-1' })
  const c = await b.cola.encolar('partida', { codigo: '7501' }, { id: 'p-1' })
  assert.equal(a.repetida, false); assert.equal(c.repetida, true)
  assert.equal((await b.cola.lista()).length, 1)
  await b.cola.sincronizar()
  assert.deepEqual(b.enviados, ['p-1'])
})

test('cola: exige id de cliente (sin id no hay idempotencia)', async () => {
  await assert.rejects(() => banco().cola.encolar('partida', {}), /id/)
})

test('cola: se envía en el orden en que se capturó', async () => {
  const b = banco()
  for (const id of ['a', 'b', 'c']) await b.cola.encolar('cierre_capturar', {}, { id })
  const r = await b.cola.sincronizar()
  assert.deepEqual(b.enviados, ['a', 'b', 'c']); assert.equal(r.enviadas.length, 3); assert.equal((await b.cola.lista()).length, 0)
})

test('reintentos: la falla de red conserva todo, corta la corrida y espera con retroceso exponencial', async () => {
  let red = false
  const b = banco({ ejecutar: async it => (red ? { data: { ok: true } } : { error: { message: 'TypeError: Failed to fetch' } }) })
  await b.cola.encolar('x', {}, { id: '1' }); await b.cola.encolar('x', {}, { id: '2' })
  let r = await b.cola.sincronizar()
  assert.equal(r.sinRed, true); assert.equal(r.pendientes, 2)
  let l = await b.cola.lista(); assert.equal(l[0].intentos, 1); assert.equal(l[1].intentos, 0, 'se cortó la corrida: el segundo ni se intentó')
  // dentro de la espera no se reintenta solo…
  r = await b.cola.sincronizar(); assert.equal((await b.cola.lista())[0].intentos, 1)
  // …pasada la espera sí; la segunda falla espera el doble
  b.avanzar(6); await b.cola.sincronizar(); l = await b.cola.lista(); assert.equal(l[0].intentos, 2)
  assert.equal(esperaSeg(1), 5); assert.equal(esperaSeg(2), 10); assert.equal(esperaSeg(3), 20); assert.equal(esperaSeg(30), ESPERA_TOPE_SEG)
  // vuelve la red: «online» fuerza el envío aunque falte espera; se vacía todo
  red = true
  r = await b.cola.sincronizar({ forzar: true })
  assert.equal(r.enviadas.length, 2); assert.equal((await b.cola.lista()).length, 0)
})

test('reenvío idempotente: si el servidor ya la tenía responde ok y sale de la cola sin duplicar', async () => {
  const servidor = new Map()
  const b = banco({ ejecutar: async it => { const ya = servidor.has(it.id); servidor.set(it.id, true); return { data: { ok: true, idempotente: ya } } } })
  servidor.set('p-9', true)   // el servidor la recibió pero la respuesta se perdió: el teléfono la reenvía
  await b.cola.encolar('partida', {}, { id: 'p-9' }); await b.cola.sincronizar()
  assert.equal(servidor.size, 1); assert.equal((await b.cola.lista()).length, 0)
})

test('rechazo del servidor: queda con su motivo, no se pierde, y lo que depende del cierre rechazado también', async () => {
  const b = banco({ ejecutar: async it => (it.tipo === 'cierre_abrir' ? { error: { code: 'PF409', message: 'No hay un turno de caja abierto' } } : { data: { ok: true } }) })
  await b.cola.encolar('cierre_abrir', { sucursalId: 's' }, { id: 'c1' })
  await b.cola.encolar('cierre_capturar', { cierreId: 'c1' }, { id: 'k1' })
  await b.cola.encolar('partida', {}, { id: 'p1' })
  const r = await b.cola.sincronizar()
  const l = await b.cola.lista()
  assert.equal(l.length, 2, 'lo rechazado no se descarta; lo independiente ya se envió')
  assert.equal(l.find(x => x.id === 'c1').estado, 'rechazada'); assert.match(l.find(x => x.id === 'c1').error, /turno/)
  assert.equal(l.find(x => x.id === 'k1').estado, 'rechazada', 'depende del cierre rechazado')
  assert.equal(l.find(x => x.id === 'p1'), undefined); assert.equal(r.enviadas.length, 1, 'lo independiente sí se envía')
})

test('rechazada: «Reintentar» la vuelve a poner pendiente', async () => {
  let aceptar = false
  const b = banco({ ejecutar: async () => (aceptar ? { data: {} } : { error: { code: 'PF422', message: 'faltan puntos' } }) })
  await b.cola.encolar('cierre_cerrar', { cierreId: 'c' }, { id: 'z' }); await b.cola.sincronizar()
  assert.equal((await b.cola.lista())[0].estado, 'rechazada')
  aceptar = true; await b.cola.reintentar('z'); await b.cola.sincronizar()
  assert.equal((await b.cola.lista()).length, 0)
})

test('alias de cierre: si el servidor retoma otro cierre, las capturas siguientes van a ese id', async () => {
  const usados = []
  const b = banco({ ejecutar: async (it, ctx) => {
    if (it.tipo === 'cierre_abrir') return { data: {}, alias: 'SERVIDOR-1' }
    usados.push(await ctx.resolver(it.datos.cierreId)); return { data: { ok: true } }
  } })
  await b.cola.encolar('cierre_abrir', {}, { id: 'LOCAL-1' }); await b.cola.encolar('cierre_capturar', { cierreId: 'LOCAL-1' }, { id: 'k' })
  await b.cola.sincronizar(); assert.deepEqual(usados, ['SERVIDOR-1'])
})

test('sesión vencida (401): corta sin contar intento; sigue pendiente', async () => {
  const b = banco({ ejecutar: async () => ({ error: { code: 'PGRST301', message: 'JWT expired' } }) })
  await b.cola.encolar('partida', {}, { id: 'p' })
  const r = await b.cola.sincronizar(); const it = (await b.cola.lista())[0]
  assert.equal(r.sinSesion, true); assert.equal(it.estado, 'pendiente'); assert.equal(it.intentos, 0)
})

test('cola: una sola corrida a la vez y por usuario', async () => {
  let enCurso = 0, maximo = 0
  const b = banco({ ejecutar: async () => { enCurso++; maximo = Math.max(maximo, enCurso); await new Promise(r => setTimeout(r, 5)); enCurso--; return { data: {} } } })
  await b.cola.encolar('x', {}, { id: '1', usuario: 'u1' }); await b.cola.encolar('x', {}, { id: '2', usuario: 'u2' })
  await Promise.all([b.cola.sincronizar({ usuario: 'u1' }), b.cola.sincronizar({ usuario: 'u1' })])
  assert.equal(maximo, 1); assert.deepEqual((await b.cola.lista()).map(x => x.id), ['2'], 'lo de u2 espera a que u2 entre')
})

test('clasificación de errores y aviso explícito de pendientes', () => {
  assert.equal(esErrorDeRed({ message: 'TypeError: Failed to fetch' }), true)
  assert.equal(esErrorDeRed({ code: 'PF422', message: 'dato inválido' }), false)
  assert.equal(esErrorDeRed({ code: '57014', message: 'canceling statement due to statement timeout' }), true, 'tiempo de espera de la base = reintentable, no rechazo')
  assert.equal(esErrorDeRed({ code: 'PF409', message: 'el cierre ya está cerrado' }), false)
  assert.equal(esErrorDeSesion({ message: 'JWT expired' }), true)
  assert.equal(avisoPendientes(0), null)
  assert.match(avisoPendientes(3, { enLinea: true }), /^3 capturas pendientes de enviar, mantén la app abierta un momento/)
  assert.match(avisoPendientes(1, { enLinea: true, ios: true }), /iPhone/)
  assert.match(avisoPendientes(2, { enLinea: false }), /Sin señal/)
})

// ───────────── sesión con PIN ─────────────
test('PIN de 4 a 6 dígitos', () => {
  for (const p of ['1234', '12345', '123456']) assert.equal(esPinValido(p), true, p)
  for (const p of ['123', '1234567', '12a4', '', null, 1234]) assert.equal(esPinValido(p), false, String(p))
})
test('bloqueo temporal: 3 fallos en 15 min bloquean; pasado el plazo se libera', () => {
  const t = 10_000_000
  assert.equal(estadoBloqueo([t - 1000, t - 500], t).bloqueado, false)
  const b = estadoBloqueo([t - 3000, t - 2000, t - 1000], t); assert.equal(b.bloqueado, true); assert.ok(b.minutos >= 14)
  assert.equal(estadoBloqueo([t - 3000, t - 2000, t - 1000], t + 16 * 60000).bloqueado, false)
})
test('caducidad de sesión: vence por hora del SERVIDOR, o cuando el servidor dice turno cerrado', () => {
  const ahora = 1_700_000_000_000
  const ses = crearSesionLocal({ sesionId: 's', usuarioId: 'u', sucursalId: 'x', venceEn: new Date(ahora + 3600_000).toISOString(), ahoraServidor: new Date(ahora + 600_000).toISOString(), ahoraLocal: ahora })
  assert.equal(ses.desfaseMs, 600_000, 'el teléfono va 10 min atrasado')
  assert.equal(horaServidorEstimada(ses, ahora), ahora + 600_000)
  assert.equal(sesionVigente(ses, { ahora }).vigente, true)
  assert.equal(sesionVigente(ses, { ahora: ahora + 3_000_000 }).motivo, 'vencida', 'con el desfase del servidor vence antes que con el reloj del teléfono')
  assert.deepEqual(sesionVigente(ses, { ahora, validacion: { vigente: false, motivo: 'turno_cerrado' } }), { vigente: false, motivo: 'turno_cerrado' })
  assert.equal(sesionVigente(null).vigente, false)
})

// ───────────── cámara: compresión, hash, sin galería, reloj ─────────────
test('compresión: lado largo 1,600 por omisión, nunca agranda, respeta el tope de 2,400', () => {
  assert.equal(LADO_LARGO_POR_OMISION, 1600)
  assert.deepEqual(escalaFoto(4000, 3000), { ancho: 1600, alto: 1200, escala: 0.4 })
  assert.deepEqual(escalaFoto(3000, 4000), { ancho: 1200, alto: 1600, escala: 0.4 })
  assert.equal(escalaFoto(800, 600).escala, 1)
  assert.equal(escalaFoto(6000, 3000, 9999).ancho, 2400)
})
test('hash sha256 de la foto: conocido, estable y distinto si cambia un byte', async () => {
  assert.equal(await hashDeFoto(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const a = await hashDeFoto(new Uint8Array([1, 2, 3])), b = await hashDeFoto(new Uint8Array([1, 2, 4]))
  assert.notEqual(a, b); assert.equal(a, await hashDeFoto(new Uint8Array([1, 2, 3])))
})
test('cámara trasera en vivo y sin audio', () => {
  const r = restriccionesFoto(); assert.equal(r.audio, false); assert.equal(r.video.facingMode.ideal, 'environment')
})
test('discrepancia de reloj > 5 min', () => {
  assert.equal(discrepanciaDeReloj(1000, 1000 + 299_000).discrepancia, false)
  assert.equal(discrepanciaDeReloj(1000, 1000 + 301_000).discrepancia, true)
  assert.equal(discrepanciaDeReloj(1000 + 400_000, 1000).discrepancia, true)
})
test('detector de galería reconoce los caminos prohibidos', () => {
  assert.deepEqual(caminosDeGaleria('<input type="file" accept="image/*" capture>').sort(), ['accept=image/*', 'input type=file'].sort())
  assert.ok(caminosDeGaleria('window.showOpenFilePicker()').length)
  assert.deepEqual(caminosDeGaleria('<video playsInline />'), [])
})

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!['node_modules', 'dist'].includes(e.name)) archivos(p, acc) } else if (/\.(jsx?|html|css|webmanifest)$/.test(e.name)) acc.push(p)
  }
  return acc
}
test('la PWA no tiene NINGÚN camino a la galería (código propio y componentes que reutiliza)', () => {
  const propios = [...archivos(path.join(RAIZ, 'auditoria-movil')),
    ...fs.readdirSync(AQUI).filter(f => /^pwa.*\.js$/.test(f) && f !== 'pwaCamara.js').map(f => path.join(AQUI, f)),
    path.join(RAIZ, 'src/pages/auditoria/conteos/CamaraEscaner.jsx'), path.join(RAIZ, 'src/lib/auditoria/foto.js')]
  assert.ok(propios.length > 8)
  for (const f of propios) assert.deepEqual(caminosDeGaleria(fs.readFileSync(f, 'utf8')), [], `${path.relative(RAIZ, f)} tiene un camino a la galería`)
})

// ───────────── cierre guardado en el teléfono ─────────────
const PLANTILLA = {
  lado_largo: 1600, tomas: [{ id: 't1', nombre: 'Mostrador' }],
  puntos: [
    { punto_id: 'p-den', nombre: 'Efectivo', tipo_captura: 'denominaciones', obligatorio: true, requiere_valor: false, requiere_foto: false, toma_fija: false },
    { punto_id: 'p-num', nombre: 'Terminal', tipo_captura: 'numero_y_foto', obligatorio: true, requiere_valor: true, requiere_foto: true, toma_fija: false },
    { punto_id: 'p-toma', nombre: 'Fotos fijas', tipo_captura: 'solo_foto', obligatorio: true, requiere_valor: false, requiere_foto: true, toma_fija: true },
  ],
}
test('cierre local: avance, retoma y obligatorios (sin internet)', () => {
  let c = crearCierreLocal({ id: 'c', sucursalId: 's', tipo: 'dia', plantilla: PLANTILLA })
  let r = recorridoLocal(c); assert.equal(progresoRecorrido(r.puntos).puedeCerrar, false); assert.equal(siguientePendiente(r.puntos), 0)
  c = aplicarCaptura(c, 'p-den', { id: 'k1', denominaciones: [{ denominacion: 500, cantidad: 2 }] })
  c = aplicarCaptura(c, 'p-num', { id: 'k2', valor: 1500 })
  r = recorridoLocal(c); assert.equal(siguientePendiente(r.puntos), 1, 'el valor sin foto no completa el punto')
  c = aplicarFoto(c, 'p-num'); c = aplicarFoto(c, 'p-toma', 't1')
  r = recorridoLocal(c); const p = progresoRecorrido(r.puntos)
  assert.equal(p.puedeCerrar, true); assert.equal(p.porcentaje, 100); assert.equal(siguientePendiente(r.puntos), -1)
})
test('cierre local: no admite total tecleado en denominaciones ni valores negativos', () => {
  const c = crearCierreLocal({ id: 'c', sucursalId: 's', tipo: 'dia', plantilla: PLANTILLA })
  assert.throws(() => aplicarCaptura(c, 'p-den', { id: 'k', valor: 1000 }), /total/)
  assert.throws(() => aplicarCaptura(c, 'p-num', { id: 'k', valor: -1 }), /valor/i)
  assert.throws(() => aplicarCaptura(c, 'no-existe', { id: 'k', valor: 1 }), /no pertenece/)
})
test('cierre local: si el servidor retomó un cierre, se suma lo que ya tenía', () => {
  const c = crearCierreLocal({ id: 'c', sucursalId: 's', tipo: 'dia', plantilla: PLANTILLA })
  const f = fusionarServidor(c, { cierre: { id: 'srv', folio: 'CIE-2026-00001' }, puntos: [{ punto_id: 'p-num', captura: { id: 'k', valor: '900' }, fotos: 1, tomas: null }] })
  assert.equal(f.folio, 'CIE-2026-00001'); assert.equal(f.capturas['p-num'].valor, 900); assert.equal(f.fotos['p-num'].n, 1)
})

// ───────────── captura a ciegas ─────────────
test('lo que guarda el teléfono (plantilla, recorrido, cola) nunca lleva saldo, diferencia ni esperado', async () => {
  let c = crearCierreLocal({ id: 'c', sucursalId: 's', tipo: 'dia', plantilla: PLANTILLA })
  c = aplicarCaptura(c, 'p-num', { id: 'k', valor: 10 })
  assert.deepEqual(llavesCiegas(c), []); assert.deepEqual(llavesCiegas(recorridoLocal(c)), [])
  assert.equal(tieneCamposEsperado(recorridoLocal(c)), false)
  assert.deepEqual(llavesCiegas({ ok: true, siguiente: { codigo: 'x' }, avance: { capturadas: 1 } }), [])
  assert.deepEqual(llavesCiegas({ ok: true, revision: { diferencia_piezas: -2 } }), ['.revision.diferencia_piezas'], 'el detector sí las encuentra')
})
test('la plantilla de la migración 260 no incluye fórmula, tolerancia ni esperado', () => {
  const sql = fs.readFileSync(path.join(RAIZ, 'migraciones/260_ctl_pwa_movil.sql'), 'utf8')
  const plantilla = sql.slice(sql.indexOf('ctl_cierre_plantilla'), sql.indexOf('mis pendientes'))
  for (const k of ['formula_esperado', 'tolerancia', 'valor_esperado', 'saldo', 'diferencia']) assert.equal(plantilla.includes(`'${k}'`), false, k)
})
