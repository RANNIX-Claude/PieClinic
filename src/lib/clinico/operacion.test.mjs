import test from 'node:test'
import assert from 'node:assert/strict'
import { validarAlta, claveDuplicado, coincidencia, curpValida, consentimientosFaltantes } from './pacientes.js'
import { diasSinVenir, esInactivo, cumpleEnVentana, segmentarDestinatarios, revisionVencida, ligaWhatsApp } from './crm.js'
import { estadoLoteSugerido, kitUsable, loteUsable } from './esterilizacion.js'

const HOY = new Date(2026, 9, 27)
test('alta completa vs alta rápida (P-003)', () => {
  assert.deepEqual(Object.keys(validarAlta({}, { hoy: HOY })).sort(), ['apellido_paterno', 'fecha_nacimiento', 'nombre', 'sede_registro_id', 'telefono_celular'])
  assert.deepEqual(Object.keys(validarAlta({ nombre: 'Ana', telefono_celular: '5561209981' }, { rapida: true })), [])
  assert.deepEqual(validarAlta({ nombre: 'Ana', apellido_paterno: 'López', fecha_nacimiento: '1980-01-01', telefono_celular: '55 6120 9981', sede_registro_id: 's1' }, { hoy: HOY }), {})
})
test('menor de edad exige tutor', () => {
  const base = { nombre: 'Leo', apellido_paterno: 'X', fecha_nacimiento: '2015-05-05', telefono_celular: '5561209981', sede_registro_id: 's1' }
  assert.ok(validarAlta(base, { hoy: HOY }).tutor)
  assert.equal(validarAlta({ ...base, tutor: { nombre_completo: 'Mamá X', parentesco: 'Madre' } }, { hoy: HOY }).tutor, undefined)
})
test('duplicados: nombre+nacimiento bloquea (sin acentos), teléfono solo avisa (P-006)', () => {
  const a = { nombre: 'Carmen', apellido_paterno: 'Ortega', apellido_materno: 'Salas', fecha_nacimiento: '1975-05-02', telefono_celular: '55 6120 9981' }
  const b = { nombre: 'CÁRMEN', apellido_paterno: 'ortega', apellido_materno: 'salas', fecha_nacimiento: '1975-05-02', telefono_celular: '1' }
  assert.equal(claveDuplicado(a), claveDuplicado(b))
  assert.equal(coincidencia(a, b), 'bloquea')
  assert.equal(coincidencia(a, { nombre: 'Otra', fecha_nacimiento: '1990-01-01', telefono_celular: '+52 55 6120 9981' }), 'avisa')
  assert.equal(coincidencia(a, { nombre: 'Otra', fecha_nacimiento: '1990-01-01', telefono_celular: '5500000000' }), null)
  assert.equal(curpValida('OESC750502MDFRLR08'), true)
  assert.equal(curpValida('XXX'), false)
  assert.deepEqual(consentimientosFaltantes({ aviso: true, datosSalud: false, firmaVacia: true }), ['Consentimiento de tratamiento de datos de salud', 'Firma del paciente'])
})
test('CRM: inactivos a 180 días, revisiones y cumpleaños', () => {
  assert.equal(diasSinVenir('2026-03-12', '2026-10-27'), 229)
  assert.equal(esInactivo(229), true)
  assert.equal(esInactivo(179), false)
  assert.equal(esInactivo(null), false)
  assert.equal(revisionVencida('2026-09-01', 35, '2026-10-27'), true)
  assert.equal(revisionVencida('2026-10-01', 35, '2026-10-27'), false)
  assert.equal(cumpleEnVentana('1980-10-30', HOY), true)
  assert.equal(cumpleEnVentana('1980-11-10', HOY), false)
  assert.equal(ligaWhatsApp('55 6120 9981'), 'https://wa.me/525561209981')
  assert.equal(ligaWhatsApp('123'), null)
})
test('campañas: sin consentimiento comercial vigente se excluye (P-148)', () => {
  const v = [
    { paciente_id: 'a', tipo: 'comerciales', canal: 'whatsapp', otorgado: true },
    { paciente_id: 'b', tipo: 'comerciales', canal: 'whatsapp', otorgado: false },
    { paciente_id: 'c', tipo: 'recordatorios', canal: 'whatsapp', otorgado: true },
  ]
  assert.deepEqual(segmentarDestinatarios(['a', 'b', 'c', 'd'], v, ['whatsapp', 'correo']), { incluidos: ['a'], excluidos: ['b', 'c', 'd'] })
})
test('esterilización: estado del lote y uso de kit (P-023)', () => {
  assert.equal(estadoLoteSugerido({ indicador_quimico: 'no_viro', indicador_biologico: 'no_aplica' }), 'rechazado')
  assert.equal(estadoLoteSugerido({ indicador_quimico: 'viro', indicador_biologico: 'positivo' }), 'bloqueado')
  assert.equal(estadoLoteSugerido({ indicador_quimico: 'viro', indicador_biologico: 'pendiente' }), 'liberado_condicionado')
  assert.equal(estadoLoteSugerido({ indicador_quimico: 'viro', indicador_biologico: 'negativo' }), 'liberado')
  const lote = { estado: 'liberado', esteril_hasta: '2026-11-27' }
  assert.equal(kitUsable({ estado: 'esterilizado' }, lote, '2026-10-27').ok, true)
  assert.equal(kitUsable({ estado: 'en_uso' }, lote, '2026-10-27').ok, false)
  assert.equal(kitUsable({ estado: 'esterilizado' }, { estado: 'bloqueado' }, '2026-10-27').ok, false)
  assert.equal(loteUsable(lote, '2026-12-01'), false)
})
