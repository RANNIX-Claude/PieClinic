// Lectura de CSV para la importación: UTF-8 con acentos y fechas ISO tal cual (regresión del video vid-importar-ia: «María» salía «MarÃ­a» y «1969-05-20» salía «5/19/69»).
import test from 'node:test'
import assert from 'node:assert/strict'
import { leerTabla } from './archivos.js'

const archivo = (nombre, texto) => { const b = Buffer.from(texto, 'utf8'); return { name: nombre, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }

test('CSV UTF-8: conserva acentos, fechas ISO y celdas vacías', async () => {
  const { hojas } = await leerTabla(archivo('p.csv', 'Nombre,Apellido paterno,Fecha de nacimiento,Alergias\nMaría,Jiménez,1965-08-12,\n,Quiroz,1969-05-20,Penicilina\n'))
  assert.deepEqual(hojas[0].columnas, ['Nombre', 'Apellido paterno', 'Fecha de nacimiento', 'Alergias'])
  assert.equal(hojas[0].filas[0].Nombre, 'María')
  assert.equal(hojas[0].filas[0]['Apellido paterno'], 'Jiménez')
  assert.equal(hojas[0].filas[0]['Fecha de nacimiento'], '1965-08-12')
  assert.equal(hojas[0].filas[1]['Fecha de nacimiento'], '1969-05-20')
  assert.equal(hojas[0].filas[1].Nombre, '')
})

test('CSV con BOM y en Windows-1252 también se lee bien', async () => {
  const bom = await leerTabla(archivo('b.csv', '\uFEFFNombre,Apellido\nÁngel,Núñez\n'))
  assert.equal(bom.hojas[0].columnas[0], 'Nombre')
  assert.equal(bom.hojas[0].filas[0].Nombre, 'Ángel')
  const l1 = Buffer.from('Nombre,Apellido\nJosé,Peña\n', 'latin1')
  const w = await leerTabla({ name: 'w.csv', arrayBuffer: async () => l1.buffer.slice(l1.byteOffset, l1.byteOffset + l1.byteLength) })
  assert.equal(w.hojas[0].filas[0].Nombre, 'José')
  assert.equal(w.hojas[0].filas[0].Apellido, 'Peña')
})
