import test from 'node:test'
import assert from 'node:assert/strict'
import { mapearColumnas, validarLote, normalizarFila, fechaISO, separarNombre, filasACargar, mapeosPorRevisar, puedeRevertir, claveDuplicado } from './importacion.js'

const cols = ['Nombre completo', 'Fecha de nacimiento', 'Tel', 'Correo electrónico', 'Alergias', 'Columna rara']
const muestra = [{ 'Nombre completo': 'ana lopez ruiz', 'Fecha de nacimiento': '12/03/1985', Tel: '55 1234 5678', 'Correo electrónico': 'ana@x.com', Alergias: 'Penicilina', 'Columna rara': 'zzz' }]

test('mapeo heurístico por nombre de columna', () => {
  const m = Object.fromEntries(mapearColumnas(cols, muestra, 'pacientes').map(x => [x.columna, x]))
  assert.equal(m['Nombre completo'].campo_destino, 'nombre_completo')
  assert.equal(m['Fecha de nacimiento'].campo_destino, 'fecha_nacimiento')
  assert.equal(m.Tel.campo_destino, 'telefono_celular')
  assert.equal(m['Correo electrónico'].campo_destino, 'email')
  assert.equal(m['Columna rara'].campo_destino, null)
  assert.equal(m['Columna rara'].accion, 'elegir_campo')
})

test('campos clínicos siempre a revisión humana aunque la confianza sea alta (P-123)', () => {
  const al = mapearColumnas(cols, muestra, 'pacientes').find(x => x.columna === 'Alergias')
  assert.equal(al.campo_clinico, true)
  assert.equal(al.accion, 'revisar')
})

test('confianza bajo el umbral → revisar; con umbral 0 se acepta lo no clínico', () => {
  const alto = mapearColumnas(['Nombre completo'], muestra, 'pacientes', 80)[0]
  assert.equal(alto.accion, 'aceptar')
  const parcial = mapearColumnas(['Telefono de contacto'], [{ 'Telefono de contacto': '5512345678' }], 'pacientes', 99)[0]
  assert.equal(parcial.accion, 'revisar')
})

test('un campo destino se asigna a una sola columna', () => {
  const m = mapearColumnas(['Nombre', 'Nombres'], [], 'pacientes')
  assert.equal(m.filter(x => x.campo_destino === 'nombre').length, 1)
})

test('productos: mapea sku, nombre, costo y precio', () => {
  const m = Object.fromEntries(mapearColumnas(['Clave', 'Producto', 'Costo', 'Precio venta', 'Stock'], [], 'productos').map(x => [x.columna, x.campo_destino]))
  assert.deepEqual(m, { Clave: 'sku', Producto: 'nombre', Costo: 'costo_promedio', 'Precio venta': 'precio', Stock: 'existencia' })
})

test('fechas y nombres se normalizan', () => {
  assert.equal(fechaISO('12/03/1985'), '1985-03-12')
  assert.equal(fechaISO('1-2-85'), '1985-02-01')
  assert.equal(fechaISO('31/02/2000'), null)
  assert.equal(fechaISO(25569), '1970-01-01')
  assert.deepEqual(separarNombre('maría de la luz pérez gómez'), { nombre: 'María De La Luz', apellido_paterno: 'Pérez', apellido_materno: 'Gómez' })
  const n = normalizarFila({ T: '+52 55 1234 5678' }, [{ columna: 'T', campo_destino: 'telefono_celular' }], 'pacientes')
  assert.equal(n.valores.telefono_celular, '5512345678')
})

const mapeos = [
  { columna: 'Nombre completo', campo_destino: 'nombre_completo' },
  { columna: 'Fecha de nacimiento', campo_destino: 'fecha_nacimiento' },
  { columna: 'Tel', campo_destino: 'telefono_celular' },
]

test('duplicados: nombre completo + fecha de nacimiento contra la base y dentro del archivo (P-006)', () => {
  const filas = [
    { 'Nombre completo': 'Ana López Ruiz', 'Fecha de nacimiento': '12/03/1985', Tel: '5511111111' },
    { 'Nombre completo': 'ana lopez ruiz', 'Fecha de nacimiento': '1985-03-12', Tel: '5522222222' },
    { 'Nombre completo': 'Luis Pérez Soto', 'Fecha de nacimiento': '01/01/1970', Tel: '5533333333' },
    { 'Nombre completo': '', 'Fecha de nacimiento': '01/01/1970', Tel: '' },
  ]
  const existentes = [{ nombre: 'Luis', apellido_paterno: 'Pérez', apellido_materno: 'Soto', fecha_nacimiento: '1970-01-01' }]
  const { filas: r, resumen } = validarLote(filas, mapeos, 'pacientes', existentes)
  assert.equal(r[0].resultado, 'valido')
  assert.equal(r[1].resultado, 'duplicado')
  assert.match(r[1].duplicado_de, /fila 1/)
  assert.equal(r[2].resultado, 'duplicado')
  assert.equal(r[2].duplicado_de, 'base')
  assert.equal(r[3].resultado, 'error')
  assert.deepEqual(resumen, { validos: 1, advertencias: 0, errores: 1, duplicados: 2 })
})

test('teléfono compartido solo avisa (advertencia), no bloquea', () => {
  const filas = [
    { 'Nombre completo': 'Ana López', 'Fecha de nacimiento': '12/03/1985', Tel: '5511111111' },
    { 'Nombre completo': 'Beto López', 'Fecha de nacimiento': '10/10/1990', Tel: '5511111111' },
  ]
  const { filas: r } = validarLote(filas, mapeos, 'pacientes')
  assert.equal(r[1].resultado, 'advertencia')
})

test('qué se carga: duplicados se omiten por defecto (gana el existente); se pueden combinar', () => {
  const f = [{ resultado: 'valido' }, { resultado: 'duplicado' }, { resultado: 'error' }, { resultado: 'advertencia' }, { resultado: 'duplicado', decision: 'crear_nuevo' }]
  assert.equal(filasACargar(f, 'omitir').length, 3)
  assert.equal(filasACargar(f, 'combinar').length, 4)
})

test('confirmación bloqueada con columnas por revisar; reversa bloqueada si hubo modificaciones (P-122)', () => {
  assert.equal(mapeosPorRevisar([{ campo_destino: 'a', accion: 'revisar' }, { campo_destino: null, accion: 'elegir_campo' }, { campo_destino: 'b', accion: 'aceptar' }]).length, 1)
  assert.equal(puedeRevertir([{ modificado_despues: false }]).ok, true)
  assert.equal(puedeRevertir([{ modificado_despues: true }]).ok, false)
})

test('clave de duplicado de productos y proveedores', () => {
  assert.equal(claveDuplicado({ sku: 'AB-1' }, 'productos'), 'sku:ab 1')
  assert.equal(claveDuplicado({ rfc: 'XAXX010101000' }, 'proveedores'), 'rfc:XAXX010101000')
})
