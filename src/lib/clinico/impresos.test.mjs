import test from 'node:test'
import assert from 'node:assert/strict'
import {
  casillaTri, etiquetaTri, fechaCorta, domicilioImpreso, ultimaGlucosa, patologicosImpreso, exploracionImpresa, diagnosticoImpreso,
  paginarVisitas, piePagina, sustituirVariables, variablesConsentimiento, resumenAntecedentesTexto, nombreArchivoImpreso, noPatologicosImpreso,
} from './impresos.js'

test('casillas Sí / No / No sabe', () => {
  assert.deepEqual(casillaTri('si'), { si: true, no: false, noSabe: false })
  assert.deepEqual(casillaTri('no_sabe'), { si: false, no: false, noSabe: true })
  assert.deepEqual(casillaTri(null), { si: false, no: false, noSabe: false })
  assert.equal(etiquetaTri('no_sabe'), 'NO SABE')
  assert.equal(etiquetaTri(undefined), '—')
})
test('fechas y domicilio como en el papel (Mz, Lt, colonia)', () => {
  assert.equal(fechaCorta('2026-10-27'), '27/10/2026')
  assert.equal(fechaCorta('2026-10-27T10:00:00Z'), '27/10/2026')
  assert.equal(fechaCorta(null), '')
  const d = domicilioImpreso({ calle: 'Av. Chalco', num_exterior: '123', manzana: '14', lote: '7', colonia: 'Santa Catarina' })
  assert.deepEqual(d, { calle: 'Av. Chalco 123', mz: '14', lt: '7', colonia: 'Santa Catarina', extra: '' })
})
test('última glucosa: fecha + texto', () => {
  assert.equal(ultimaGlucosa({ ultima_glucosa_fecha: '2026-10-20', ultima_glucosa_texto: '142 mg/dl' }), '20/10/2026 (142 mg/dl)')
  assert.equal(ultimaGlucosa({ ultima_glucosa_texto: 'hace 1 semana' }), 'hace 1 semana')
  assert.equal(ultimaGlucosa({}), '')
})
test('patológicos en el orden del papel y VIH restringido (N-04)', () => {
  const f = patologicosImpreso({ diabetes: 'si', alergicos: 'si', alergicos_detalle: 'Penicilina', otras_enfermedades: 'no' })
  assert.deepEqual(f.map(x => x.clave), ['diabetes', 'hipertension', 'alergicos', 'artritis', 'obesidad', 'traumaticos', 'varices', 'vih', 'otras'])
  assert.equal(f[2].detalle, 'Penicilina')
  const vih = f.find(x => x.clave === 'vih')
  assert.equal(vih.restringido, true)
  assert.equal(vih.si || vih.no, false)
  assert.equal(patologicosImpreso({}, 'no').find(x => x.clave === 'vih').no, true)
  assert.equal(noPatologicosImpreso({ tabaquismo: 'si' })[0].si, true)
})
test('exploración: siluetas por pierna', () => {
  const e = exploracionImpresa([{ pierna: 'D', siluetas: ['normal'] }, { pierna: 'I', siluetas: ['genu_valgum', 'normal'] }])
  assert.equal(e.find(x => x.clave === 'normal').D, true)
  assert.equal(e.find(x => x.clave === 'genu_valgum').D, false)
  assert.equal(e.find(x => x.clave === 'genu_valgum').I, true)
  assert.equal(e.length, 5)
})
test('diagnóstico: casillas y texto de otros', () => {
  const d = diagnosticoImpreso([{ categoria: 'onicomicosis' }, { categoria: 'otros', texto_otros: 'uña encarnada D' }])
  assert.equal(d.casillas.find(c => c.clave === 'onicomicosis').marcada, true)
  assert.equal(d.casillas.find(c => c.clave === 'micosis').marcada, false)
  assert.equal(d.otros, 'uña encarnada D')
})
test('tabla de visitas: páginas de 10 con renglones en blanco', () => {
  const vs = Array.from({ length: 12 }, (_, i) => ({ fecha: `2026-10-${String(i + 1).padStart(2, '0')}`, atendio: 'M. Mena', servicio: 'Curación' }))
  const p = paginarVisitas(vs)
  assert.equal(p.length, 2)
  assert.equal(p[0].length, 10)
  assert.equal(p[1].filter(f => f.vacia).length, 8)
  assert.equal(p[0][0].fecha, '01/10/2026')
  const vacio = paginarVisitas([])
  assert.equal(vacio.length, 1)
  assert.ok(vacio[0].every(f => f.vacia))
})
test('pie de página con versión del expediente y COPIA', () => {
  assert.equal(piePagina({ expediente: 'PC-GAL-004231', fecha: '2026-10-27', impresoPor: 'M. Mena', version: 3 }), 'Expediente PC-GAL-004231 · impreso 27/10/2026 por M. Mena · versión 3 del expediente')
  assert.match(piePagina({ expediente: 'X', fecha: '2026-10-27', esCopia: true }), /COPIA$/)
  assert.equal(piePagina({ enBlanco: true }), 'Formato en blanco')
})
test('plantilla con variables; faltantes quedan en raya', () => {
  assert.equal(sustituirVariables('Yo {{nombre_paciente}} y {{ nombre_podologo }} el {{fecha}}', { nombre_paciente: 'María', nombre_podologo: 'Marco' }), 'Yo María y Marco el ________')
  const v = variablesConsentimiento({ paciente: { nombre: 'María', apellido_paterno: 'Pérez', fecha_nacimiento: '1971-03-14' }, podologo: { nombre: 'Marco Mena Ibarra' }, fecha: '2026-10-27' })
  assert.equal(v.nombre_paciente, 'María Pérez')
  assert.equal(v.nombre_tutor, '— no aplica —')
  assert.equal(v.tutor, '')
  assert.equal(v.paciente, 'María Pérez')
  const menor = variablesConsentimiento({ paciente: { nombre: 'Leo', apellido_paterno: 'X', fecha_nacimiento: '2018-01-01' }, tutor: { nombre_completo: 'Ana X', parentesco: 'Madre' }, fecha: '2026-10-27' })
  assert.equal(menor.tutor, ', representado(a) por su madre Ana X')
  assert.equal(v.fecha, '27/10/2026')
})
test('resumen de antecedentes y nombre de archivo', () => {
  assert.match(resumenAntecedentesTexto({ diabetes: 'si', diabetes_tipo: 'tipo2', hipertension: 'si', hf_padre: 'Diabetes' }, [{ sustancia: 'penicilina' }]), /Diabetes tipo 2 · hipertensión · heredofamiliares \(padre: Diabetes\) · alérgica\(o\) a penicilina/)
  assert.equal(nombreArchivoImpreso('impreso_historia_completa', 'PC-GAL/004231', '2026-10-27T10:00'), 'historia_completa_PC-GAL_004231_2026-10-27')
})
