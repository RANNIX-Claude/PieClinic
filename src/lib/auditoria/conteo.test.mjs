// node --test src/lib/auditoria  ·  motor de conteo (Etapa 2): modos y quién los inicia, captura a ciegas, precio de etiqueta, reintento idempotente y avance remoto.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MODOS_CONTEO, modosQuePuedeIniciar, puedeIniciarModo, puedeLanzarRemota, puedeVerResultado, recibeDiferenciaAlInstante, validarMuestra, TOPE_MUESTRA } from './conteoModos.js'
import { clasificarPrecio, abreCasoPrecio } from './conteoPrecio.js'
import { nuevoIdCaptura, llavesCiegas, respuestaDeCaptura, validarEntrada, enviarConReintento } from './conteoCaptura.js'
import { formatoDuracion, porcentajeAvance, resumenFrase, hayPendientes } from './remotaAvance.js'
import { validarParametro } from './config.js'

test('cinco modos y quién inicia cada uno (spec F2)', () => {
  assert.deepEqual(Object.keys(MODOS_CONTEO).sort(), ['auditoria_puntual', 'auditoria_remota', 'conteo_apertura', 'conteo_inicial', 'relevo_turno'])
  assert.deepEqual(modosQuePuedeIniciar('sucursal').sort(), ['conteo_apertura', 'relevo_turno'], 'el encargado/cajero solo apertura y relevo')
  assert.deepEqual(modosQuePuedeIniciar('supervisor').sort(), ['auditoria_puntual', 'conteo_apertura', 'conteo_inicial', 'relevo_turno'])
  assert.deepEqual(modosQuePuedeIniciar('dueno').sort(), ['auditoria_puntual', 'conteo_apertura', 'conteo_inicial', 'relevo_turno'], 'la remota no se inicia aquí: se lanza')
  assert.deepEqual(modosQuePuedeIniciar('soporte'), [], 'el soporte no captura')
  assert.equal(puedeLanzarRemota('dueno'), true)
  for (const r of ['supervisor', 'sucursal', 'soporte']) assert.equal(puedeLanzarRemota(r), false, `${r} no lanza remota`)
  assert.equal(puedeIniciarModo('sucursal', 'conteo_inicial'), false)
  assert.equal(puedeIniciarModo('sucursal', 'auditoria_puntual'), false)
})

test('solo dueño y supervisor ven resultados; solo el auditor de una puntual recibe la diferencia al instante', () => {
  assert.equal(puedeVerResultado('dueno'), true); assert.equal(puedeVerResultado('supervisor'), true)
  assert.equal(puedeVerResultado('sucursal'), false); assert.equal(puedeVerResultado('soporte'), false)
  assert.equal(recibeDiferenciaAlInstante('supervisor', 'auditoria_puntual'), true)
  assert.equal(recibeDiferenciaAlInstante('dueno', 'auditoria_puntual'), true)
  assert.equal(recibeDiferenciaAlInstante('supervisor', 'conteo_apertura'), false)
  assert.equal(recibeDiferenciaAlInstante('sucursal', 'auditoria_puntual'), false)
})

test('muestra aleatoria: tope duro de 100', () => {
  assert.equal(TOPE_MUESTRA, 100)
  assert.equal(validarMuestra(20).ok, true); assert.equal(validarMuestra(100).ok, true)
  assert.equal(validarMuestra(101).ok, false); assert.match(validarMuestra(101).error, /100/)
  assert.equal(validarMuestra(0).ok, false); assert.equal(validarMuestra('').ok, false); assert.equal(validarMuestra(2.5).ok, false)
  assert.equal(validarParametro('muestra_aleatoria', 101).ok, false, 'espejo de configuración')
})

test('precio de etiqueta: coincide / etiqueta anterior (ventana de gracia) / revisar (criterio 16)', () => {
  const base = { catalogo: 120, hoy: '2026-11-26', gracia: 30, tolerancia: 0 }
  assert.equal(clasificarPrecio({ ...base, etiqueta: 120, vigenteDesde: '2026-01-01' }), 'coincide')
  assert.equal(clasificarPrecio({ ...base, etiqueta: null, vigenteDesde: '2026-01-01' }), null, 'sin captura de precio no se clasifica')
  // catálogo cambiado ayer, etiqueta con el precio anterior → etiqueta_anterior y NO abre caso
  const ayer = clasificarPrecio({ ...base, etiqueta: 100, vigenteDesde: '2026-11-25', preciosPrevios: [{ precio: 100, hasta: '2026-11-24' }] })
  assert.equal(ayer, 'etiqueta_anterior'); assert.equal(abreCasoPrecio(ayer), false)
  // fuera de la ventana de gracia → revisar (abre caso)
  const viejo = clasificarPrecio({ ...base, etiqueta: 100, vigenteDesde: '2026-10-01', preciosPrevios: [{ precio: 100, hasta: '2026-09-30' }] })
  assert.equal(viejo, 'revisar'); assert.equal(abreCasoPrecio(viejo), true)
  // dentro de la ventana pero con un precio que nunca existió → revisar (una pieza de 600 etiquetada en 400 es fuga de margen)
  assert.equal(clasificarPrecio({ ...base, etiqueta: 90, vigenteDesde: '2026-11-25', preciosPrevios: [{ precio: 100, hasta: '2026-11-24' }] }), 'revisar')
  assert.equal(clasificarPrecio({ ...base, etiqueta: 100, catalogo: null }), 'revisar', 'sin precio vigente no se puede validar')
  // tolerancia
  assert.equal(clasificarPrecio({ ...base, etiqueta: 119, tolerancia: 2, vigenteDesde: '2026-01-01' }), 'coincide')
  assert.equal(abreCasoPrecio('etiqueta_mal_puesta'), false); assert.equal(abreCasoPrecio('etiqueta_anterior'), false)
})

test('captura a ciegas: la respuesta que se conserva no trae saldo ni diferencia; solo el auditor puntual conserva «revision»', () => {
  const del = { ok: true, partida_id: 'p1', avance: { capturadas: 2, en_lista: 20 }, siguiente: { producto_id: 'x', descripcion: 'Crema' }, saldo_sistema: 5, diferencia_piezas: -1, revision: { diferencia_piezas: -2 } }
  assert.deepEqual(llavesCiegas(del).sort(), ['.diferencia_piezas', '.revision.diferencia_piezas', '.saldo_sistema'])
  const sucursal = respuestaDeCaptura(del)
  assert.deepEqual(llavesCiegas(sucursal), [], 'nada ciego aunque el servidor lo hubiera mandado')
  assert.equal('revision' in sucursal, false)
  assert.deepEqual(sucursal.avance, { capturadas: 2, enLista: 20 })
  assert.equal(sucursal.siguiente.descripcion, 'Crema')
  const auditor = respuestaDeCaptura(del, { esAuditorPuntual: true })
  assert.deepEqual(auditor.revision, { diferencia_piezas: -2 })
  assert.equal(respuestaDeCaptura(null).ok, false)
})

test('validación local de la captura (serie, sello, precio de etiqueta)', () => {
  assert.equal(validarEntrada({ cantidad: '' }).ok, false)
  assert.equal(validarEntrada({ cantidad: -1 }).ok, false)
  assert.equal(validarEntrada({ cantidad: 0 }).ok, true, '0 piezas es una captura válida')
  assert.equal(validarEntrada({ cantidad: 2, pidePrecio: true, precioEtiqueta: '' }).ok, false)
  assert.equal(validarEntrada({ cantidad: 2, pidePrecio: true, precioEtiqueta: 150 }).ok, true)
  assert.equal(validarEntrada({ cantidad: 1, producto: { requiere_serie: true } }).ok, false)
  assert.equal(validarEntrada({ cantidad: 1, producto: { requiere_serie: true }, serie: 'SN1' }).ok, true)
  assert.equal(validarEntrada({ cantidad: 1, producto: { requiere_sello: true }, sello: 'S-1' }).ok, false, 'falta indicar si está intacto')
  assert.equal(validarEntrada({ cantidad: 1, producto: { requiere_sello: true }, sello: 'S-1', selloIntacto: false }).ok, true)
})

test('reintento idempotente: mismo id en cada intento, solo se reintenta ante errores de red', async () => {
  const idDel = nuevoIdCaptura()
  assert.match(idDel, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.notEqual(nuevoIdCaptura(), nuevoIdCaptura())
  const vistos = []
  const r = await enviarConReintento(async id => { vistos.push(id); return vistos.length < 3 ? { data: null, error: { message: 'Failed to fetch' } } : { data: { ok: true }, error: null } },
    { id: idDel, dormir: async () => {} })
  assert.equal(r.error ?? null, null); assert.equal(r.intentos, 3)
  assert.deepEqual([...new Set(vistos)], [idDel], 'todos los intentos llevan el mismo id: el servidor no duplica')
  const dominio = []
  const r2 = await enviarConReintento(async id => { dominio.push(id); return { data: null, error: { code: 'PF403', message: 'sin permiso' } } }, { dormir: async () => {} })
  assert.equal(dominio.length, 1, 'un error del servidor no se reintenta'); assert.equal(r2.error.code, 'PF403')
})

test('avance de la auditoría remota', () => {
  assert.equal(formatoDuracion(95), '1 min 35 s'); assert.equal(formatoDuracion(3725), '1 h 02 min'); assert.equal(formatoDuracion(null), '—'); assert.equal(formatoDuracion(12), '12 s')
  assert.equal(porcentajeAvance(5, 20), 25); assert.equal(porcentajeAvance(0, 0), 0); assert.equal(porcentajeAvance(30, 20), 100)
  const av = { resumen: { total: 7, abrieron: 5, partidas_capturadas: 61, pendientes: 2, expiradas: 0, no_reportadas: 0 } }
  assert.equal(hayPendientes(av), true); assert.equal(hayPendientes({ resumen: { pendientes: 0 } }), false)
  assert.match(resumenFrase(av), /5 de 7 sucursales abrieron/); assert.match(resumenFrase(av), /61 partida/)
  assert.match(resumenFrase({ resumen: { total: 7, abrieron: 6, partidas_capturadas: 90, pendientes: 0, expiradas: 7, no_reportadas: 1 } }), /1 sin respuesta/)
  assert.equal(resumenFrase(null), 'Sin auditoría remota reciente.')
})
