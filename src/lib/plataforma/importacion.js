// Importación de datos (pantalla 13). Lógica pura: mapeo heurístico por nombre de columna, validación y detección de duplicados.
// P-122 (nada se carga sin confirmar; lote reversible), P-123 (campos clínicos o confianza < umbral → «revisar»; en conflicto gana el dato existente),
// P-006 (duplicado = nombre completo + fecha de nacimiento; el teléfono compartido solo avisa).

/** Campos destino por tipo de datos. clinico = va siempre a revisión humana (P-123). requerido = sin él la fila es error. */
export const CAMPOS_DESTINO = {
  pacientes: [
    { campo: 'nombre', etiqueta: 'Nombre(s)', requerido: true, alias: ['nombre', 'nombres', 'first name', 'primer nombre'] },
    { campo: 'nombre_completo', etiqueta: 'Nombre completo (se separa)', alias: ['nombre completo', 'paciente', 'nombre del paciente', 'name', 'full name', 'cliente'] },
    { campo: 'apellido_paterno', etiqueta: 'Apellido paterno', alias: ['apellido paterno', 'ap paterno', 'paterno', 'primer apellido', 'apellido', 'apellidos', 'last name'] },
    { campo: 'apellido_materno', etiqueta: 'Apellido materno', alias: ['apellido materno', 'ap materno', 'materno', 'segundo apellido'] },
    { campo: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento', alias: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'f nac', 'fec nac', 'birth', 'birthday', 'cumpleanos'] },
    { campo: 'sexo', etiqueta: 'Sexo', alias: ['sexo', 'genero', 'sex', 'gender'] },
    { campo: 'telefono_celular', etiqueta: 'Teléfono celular', alias: ['telefono', 'celular', 'movil', 'whatsapp', 'tel', 'telefono celular', 'cel', 'phone', 'mobile'] },
    { campo: 'telefono_fijo', etiqueta: 'Teléfono fijo', alias: ['telefono fijo', 'tel fijo', 'telefono casa', 'tel casa'] },
    { campo: 'email', etiqueta: 'Correo electrónico', alias: ['email', 'correo', 'correo electronico', 'e-mail', 'mail'] },
    { campo: 'curp', etiqueta: 'CURP', alias: ['curp'] },
    { campo: 'calle', etiqueta: 'Calle', alias: ['calle', 'domicilio', 'direccion', 'address'] },
    { campo: 'colonia', etiqueta: 'Colonia', alias: ['colonia', 'col'] },
    { campo: 'municipio', etiqueta: 'Municipio', alias: ['municipio', 'delegacion', 'alcaldia', 'ciudad', 'city'] },
    { campo: 'codigo_postal', etiqueta: 'Código postal', alias: ['codigo postal', 'cp', 'c p', 'zip'] },
    { campo: 'ocupacion', etiqueta: 'Ocupación', alias: ['ocupacion', 'profesion', 'trabajo'] },
    { campo: 'folio_anterior', etiqueta: 'Folio / expediente anterior', alias: ['folio', 'expediente', 'no expediente', 'numero de expediente', 'num exp', 'id paciente', 'clave'] },
    { campo: 'alergias_resumen', etiqueta: 'Alergias (clínico)', clinico: true, alias: ['alergias', 'alergia', 'alergico a'] },
    { campo: 'diabetes', etiqueta: 'Diabetes (clínico)', clinico: true, alias: ['diabetes', 'diabetico', 'padece diabetes'] },
    { campo: 'notas_importadas', etiqueta: 'Diagnóstico / antecedentes (clínico)', clinico: true, alias: ['diagnostico', 'padecimiento', 'antecedentes', 'medicamentos', 'tratamiento', 'observaciones clinicas', 'enfermedades'] },
    { campo: 'notas_administrativas', etiqueta: 'Notas administrativas', alias: ['notas', 'observaciones', 'comentarios', 'nota'] },
  ],
  productos: [
    { campo: 'sku', etiqueta: 'SKU / clave', requerido: true, alias: ['sku', 'clave', 'codigo', 'codigo interno', 'cve', 'articulo', 'no parte'] },
    { campo: 'nombre', etiqueta: 'Nombre', requerido: true, alias: ['nombre', 'producto', 'descripcion', 'articulo', 'concepto'] },
    { campo: 'codigo_barras', etiqueta: 'Código de barras', alias: ['codigo de barras', 'barras', 'ean', 'upc', 'gtin'] },
    { campo: 'categoria', etiqueta: 'Categoría', alias: ['categoria', 'linea', 'familia', 'tipo producto', 'grupo'] },
    { campo: 'marca', etiqueta: 'Marca', alias: ['marca', 'fabricante', 'brand'] },
    { campo: 'presentacion', etiqueta: 'Presentación', alias: ['presentacion', 'contenido', 'unidad', 'medida'] },
    { campo: 'costo_promedio', etiqueta: 'Costo', alias: ['costo', 'costo unitario', 'costo promedio', 'precio compra', 'cost'] },
    { campo: 'precio', etiqueta: 'Precio de venta', alias: ['precio', 'precio venta', 'precio publico', 'pvp', 'price'] },
    { campo: 'existencia', etiqueta: 'Existencia inicial', alias: ['existencia', 'stock', 'inventario', 'cantidad', 'qty'] },
    { campo: 'minimo', etiqueta: 'Mínimo', alias: ['minimo', 'stock minimo', 'min'] },
  ],
  proveedores: [
    { campo: 'nombre', etiqueta: 'Nombre comercial', requerido: true, alias: ['nombre', 'proveedor', 'nombre comercial', 'empresa'] },
    { campo: 'razon_social', etiqueta: 'Razón social', alias: ['razon social', 'denominacion'] },
    { campo: 'rfc', etiqueta: 'RFC', alias: ['rfc'] },
    { campo: 'contacto', etiqueta: 'Contacto', alias: ['contacto', 'atencion', 'vendedor'] },
    { campo: 'telefono', etiqueta: 'Teléfono', alias: ['telefono', 'tel', 'celular', 'phone'] },
    { campo: 'email', etiqueta: 'Correo', alias: ['email', 'correo', 'mail'] },
    { campo: 'dias_credito', etiqueta: 'Días de crédito', alias: ['dias credito', 'credito', 'dias de credito', 'plazo'] },
    { campo: 'condiciones_pago', etiqueta: 'Condiciones de pago', alias: ['condiciones de pago', 'condiciones', 'forma de pago'] },
    { campo: 'notas', etiqueta: 'Notas', alias: ['notas', 'observaciones', 'comentarios'] },
  ],
  citas: [
    { campo: 'paciente', etiqueta: 'Paciente', requerido: true, alias: ['paciente', 'nombre', 'cliente'] },
    { campo: 'fecha', etiqueta: 'Fecha', requerido: true, alias: ['fecha', 'dia', 'fecha cita', 'date'] },
    { campo: 'hora', etiqueta: 'Hora', alias: ['hora', 'horario', 'time'] },
    { campo: 'servicio', etiqueta: 'Servicio', alias: ['servicio', 'motivo', 'tratamiento', 'procedimiento'] },
    { campo: 'podologo', etiqueta: 'Podólogo', alias: ['podologo', 'doctor', 'doctora', 'medico', 'especialista'] },
    { campo: 'notas', etiqueta: 'Notas', alias: ['notas', 'observaciones', 'comentarios'] },
  ],
  historial: [
    { campo: 'paciente', etiqueta: 'Paciente', requerido: true, alias: ['paciente', 'nombre', 'expediente'] },
    { campo: 'fecha', etiqueta: 'Fecha de consulta', requerido: true, alias: ['fecha', 'fecha consulta', 'date'] },
    { campo: 'motivo', etiqueta: 'Motivo (clínico)', clinico: true, alias: ['motivo', 'motivo de consulta', 'queja'] },
    { campo: 'diagnostico', etiqueta: 'Diagnóstico (clínico)', clinico: true, alias: ['diagnostico', 'dx', 'padecimiento'] },
    { campo: 'tratamiento', etiqueta: 'Tratamiento (clínico)', clinico: true, alias: ['tratamiento', 'procedimiento', 'plan'] },
    { campo: 'notas', etiqueta: 'Notas (clínico)', clinico: true, alias: ['notas', 'nota', 'observaciones', 'evolucion'] },
  ],
  checadas: [
    { campo: 'numero_empleado', etiqueta: 'Número de empleado', requerido: true, alias: ['numero de empleado', 'no empleado', 'id', 'clave', 'empleado', 'no', 'user id', 'userid'] },
    { campo: 'fecha_hora', etiqueta: 'Fecha y hora', requerido: true, alias: ['fecha y hora', 'fecha hora', 'checada', 'timestamp', 'datetime', 'time'] },
    { campo: 'fecha', etiqueta: 'Fecha', alias: ['fecha', 'dia', 'date'] },
    { campo: 'hora', etiqueta: 'Hora', alias: ['hora', 'time'] },
    { campo: 'tipo', etiqueta: 'Tipo (entrada/salida)', alias: ['tipo', 'evento', 'estado', 'status', 'movimiento'] },
  ],
  imagenes_expediente: [
    { campo: 'paciente', etiqueta: 'Paciente', requerido: true, alias: ['paciente', 'nombre', 'expediente'] },
    { campo: 'archivo', etiqueta: 'Archivo', requerido: true, alias: ['archivo', 'imagen', 'foto', 'nombre archivo'] },
    { campo: 'fecha', etiqueta: 'Fecha', alias: ['fecha'] },
  ],
}

export const TIPOS_DATOS = [
  { id: 'pacientes', etiqueta: 'Pacientes' },
  { id: 'productos', etiqueta: 'Productos e inventario inicial' },
  { id: 'proveedores', etiqueta: 'Proveedores' },
  { id: 'citas', etiqueta: 'Citas' },
  { id: 'historial', etiqueta: 'Historial clínico' },
  { id: 'checadas', etiqueta: 'Checadas del reloj (RH)' },
  { id: 'imagenes_expediente', etiqueta: 'Imágenes de expediente' },
]

/** Normaliza un texto para comparar: minúsculas, sin acentos, sin signos. */
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim()

function similitud(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const ta = new Set(a.split(' ')), tb = new Set(b.split(' '))
  const [corto, largo] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  if ([...corto].every(t => largo.has(t))) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.15 + 0.82
  const inter = [...ta].filter(x => tb.has(x)).length
  return inter / new Set([...ta, ...tb]).size * 0.8
}

/**
 * Mapeador heurístico por nombre de columna (funciona sin IA con Excel/CSV).
 * @param {string[]} columnas encabezados del archivo
 * @param {object[]} filas    muestra de filas (objetos columna → valor) para el ejemplo y la comprobación por contenido
 * @returns {{columna, ejemplo, campo_destino, confianza, transformacion, campo_clinico, accion}[]}
 *   accion: 'aceptar' solo si confianza >= umbral y no es clínico; 'revisar' si no; 'elegir_campo' si no hay destino (P-123).
 */
export function mapearColumnas(columnas, filas = [], tipo = 'pacientes', umbral = 80) {
  const campos = CAMPOS_DESTINO[tipo] ?? []
  const usados = new Set()
  const candidatos = columnas.map(col => {
    const nc = norm(col)
    const ejemplos = filas.map(f => f?.[col]).filter(v => v != null && String(v).trim() !== '')
    let mejor = null
    for (const c of campos) {
      let s = Math.max(...c.alias.map(a => similitud(nc, norm(a))), similitud(nc, norm(c.campo)))
      s = Math.max(s, similitudPorContenido(c.campo, ejemplos, nc))
      if (!mejor || s > mejor.s) mejor = { c, s }
    }
    return { col, ejemplo: ejemplos[0] != null ? String(ejemplos[0]) : '', mejor }
  })
  // el mejor candidato de cada campo se lo queda; el resto de columnas que lo quisieran quedan sin destino
  const orden = [...candidatos].sort((a, b) => (b.mejor?.s ?? 0) - (a.mejor?.s ?? 0))
  const asignado = new Map()
  for (const cand of orden) {
    if (cand.mejor && cand.mejor.s >= 0.55 && !usados.has(cand.mejor.c.campo)) {
      usados.add(cand.mejor.c.campo)
      asignado.set(cand.col, cand.mejor)
    }
  }
  return candidatos.map(({ col, ejemplo }) => {
    const m = asignado.get(col)
    if (!m) return { columna: col, ejemplo, campo_destino: null, confianza: null, transformacion: null, campo_clinico: false, accion: 'elegir_campo' }
    const confianza = Math.round(Math.min(0.99, m.s) * 100)
    const clinico = !!m.c.clinico
    return {
      columna: col, ejemplo, campo_destino: m.c.campo, confianza,
      transformacion: transformacionPara(m.c.campo),
      campo_clinico: clinico,
      accion: clinico || confianza < umbral ? 'revisar' : 'aceptar',
    }
  })
}

function similitudPorContenido(campo, ejemplos, nombreCol) {
  if (!ejemplos.length) return 0
  const todos = pred => ejemplos.every(pred)
  if (campo === 'email' && todos(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v)))) return 0.9
  if (campo === 'curp' && todos(v => /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i.test(String(v).trim()))) return 0.95
  if (campo === 'rfc' && todos(v => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(String(v).trim()))) return 0.92
  if (campo === 'fecha_nacimiento' && /(nac|birth)/.test(nombreCol) && todos(v => fechaISO(v))) return 0.9
  return 0
}

function transformacionPara(campo) {
  return ({
    nombre_completo: 'Separar nombre y apellidos', fecha_nacimiento: 'Fecha a AAAA-MM-DD', fecha: 'Fecha a AAAA-MM-DD', sexo: 'Normalizar a mujer/hombre/otro',
    telefono_celular: 'Solo dígitos (10)', telefono_fijo: 'Solo dígitos (10)', telefono: 'Solo dígitos (10)', email: 'Minúsculas', rfc: 'Mayúsculas', curp: 'Mayúsculas',
    costo_promedio: 'Número decimal', precio: 'Número decimal', existencia: 'Número decimal', diabetes: 'Normalizar a no/tipo1/tipo2/prediabetes/no_sabe',
    fecha_hora: 'Fecha y hora ISO',
  })[campo] ?? null
}

// ───────────────────────────── normalización ─────────────────────────────
/** Fecha a AAAA-MM-DD; acepta dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd, número serial de Excel y Date. Año de 2 dígitos: >30 → 19xx. */
export function fechaISO(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  let y, mo, d
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3] } else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
    if (!m) return null
    d = +m[1]; mo = +m[2]; y = +m[3]
    if (y < 100) y += y > 30 ? 1900 : 2000
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const capitalizar = s => String(s ?? '').trim().toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
export const telefono10 = v => { const d = String(v ?? '').replace(/\D/g, '').replace(/^(52|521)(?=\d{10}$)/, ''); return d.length >= 10 ? d.slice(-10) : d }

export function separarNombre(completo) {
  const p = String(completo ?? '').trim().split(/\s+/).filter(Boolean)
  if (p.length <= 1) return { nombre: capitalizar(p[0] ?? ''), apellido_paterno: '', apellido_materno: '' }
  if (p.length === 2) return { nombre: capitalizar(p[0]), apellido_paterno: capitalizar(p[1]), apellido_materno: '' }
  const mat = p[p.length - 1], pat = p[p.length - 2]
  return { nombre: capitalizar(p.slice(0, -2).join(' ')), apellido_paterno: capitalizar(pat), apellido_materno: capitalizar(mat) }
}

const SEXO = { m: 'mujer', f: 'mujer', mujer: 'mujer', femenino: 'mujer', femenina: 'mujer', h: 'hombre', hombre: 'hombre', masculino: 'hombre', otro: 'otro' }
const DIAB = { no: 'no', ninguna: 'no', si: null, tipo1: 'tipo1', 'tipo 1': 'tipo1', i: 'tipo1', tipo2: 'tipo2', 'tipo 2': 'tipo2', ii: 'tipo2', prediabetes: 'prediabetes', 'no se': 'no_sabe', 'no sabe': 'no_sabe' }
const aNumero = v => { if (v == null || v === '') return null; const x = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : NaN }

/** Convierte una fila cruda con los mapeos aceptados a valores normalizados + mensajes. mapeos: [{columna, campo_destino}] */
export function normalizarFila(fila, mapeos, tipo) {
  const out = {}, mensajes = []
  for (const m of mapeos) {
    if (!m.campo_destino) continue
    const crudo = fila[m.columna]
    if (crudo == null || String(crudo).trim() === '') continue
    const campo = m.campo_destino
    let v = typeof crudo === 'string' ? crudo.trim() : crudo
    if (campo === 'nombre_completo') Object.assign(out, separarNombre(v))
    else if (['nombre', 'apellido_paterno', 'apellido_materno'].includes(campo)) out[campo] = capitalizar(v)
    else if (['fecha_nacimiento', 'fecha'].includes(campo)) {
      const f = fechaISO(v)
      if (f) out[campo] = f; else mensajes.push({ campo, motivo: `Fecha no reconocida: «${v}»` })
    } else if (campo === 'fecha_hora') {
      const d = v instanceof Date ? v : new Date(typeof v === 'number' ? Math.round((v - 25569) * 86400000) : String(v).replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1'))
      if (Number.isNaN(d.getTime())) mensajes.push({ campo, motivo: `Fecha y hora no reconocida: «${v}»` }); else out[campo] = d.toISOString()
    } else if (campo === 'sexo') {
      const s = SEXO[norm(v)]
      if (s) out.sexo = s; else mensajes.push({ campo, motivo: `Sexo no reconocido: «${v}»` })
    } else if (['telefono_celular', 'telefono_fijo', 'telefono'].includes(campo)) {
      const t = telefono10(v)
      if (t.length === 10) out[campo] = t; else mensajes.push({ campo, motivo: `Teléfono incompleto: «${v}»` })
    } else if (campo === 'email') {
      const e = String(v).toLowerCase()
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.email = e; else mensajes.push({ campo, motivo: `Correo inválido: «${v}»` })
    } else if (campo === 'rfc' || campo === 'curp') out[campo] = String(v).toUpperCase().replace(/\s/g, '')
    else if (['costo_promedio', 'precio', 'existencia', 'minimo', 'dias_credito'].includes(campo)) {
      const x = aNumero(v)
      if (Number.isNaN(x)) mensajes.push({ campo, motivo: `Número inválido: «${v}»` }); else out[campo] = x
    } else if (campo === 'diabetes') {
      const d = DIAB[norm(v)]
      out.diabetes = d === undefined ? 'no_sabe' : d
      if (d === null) { out.diabetes = 'no_sabe'; mensajes.push({ campo, motivo: 'Dice «sí» sin tipo: queda «no sabe» para revisión' }) }
    } else out[campo] = typeof v === 'string' ? v : String(v)
  }
  return { valores: out, mensajes, tipo }
}

const REQ_ESPECIAL = { pacientes: v => !!(v.nombre) }

/** Clave de duplicado (P-006) por tipo. */
export function claveDuplicado(valores, tipo) {
  if (tipo === 'pacientes') {
    const nombre = norm([valores.nombre, valores.apellido_paterno, valores.apellido_materno].filter(Boolean).join(' '))
    return nombre && valores.fecha_nacimiento ? `${nombre}|${valores.fecha_nacimiento}` : null
  }
  if (tipo === 'productos') return valores.sku ? `sku:${norm(valores.sku)}` : (valores.codigo_barras ? `cb:${valores.codigo_barras}` : null)
  if (tipo === 'proveedores') return valores.rfc ? `rfc:${valores.rfc}` : (valores.nombre ? `n:${norm(valores.nombre)}` : null)
  return null
}

/**
 * Valida y clasifica todas las filas.
 * existentes: registros ya guardados (misma forma normalizada) para detectar duplicados contra la base.
 * Resultado por fila: 'valido' | 'advertencia' | 'error' | 'duplicado'. Los duplicados entre filas del mismo archivo también se marcan.
 * @returns {{filas: {numero_fila, valores_originales, valores_normalizados, resultado, mensajes, duplicado_de}[], resumen}}
 */
export function validarLote(filas, mapeos, tipo, existentes = [], { telefonoCompartidoAvisa = true } = {}) {
  const claves = new Map(existentes.map(e => [claveDuplicado(e, tipo), 'base']).filter(([k]) => k))
  const telefonos = new Map()
  for (const e of existentes) { const t = e.telefono_celular ?? e.telefono; if (t) telefonos.set(t, 'base') }
  const vistos = new Map()
  const campos = CAMPOS_DESTINO[tipo] ?? []
  const requeridos = campos.filter(c => c.requerido).map(c => c.campo)
  const out = filas.map((fila, i) => {
    const { valores, mensajes } = normalizarFila(fila, mapeos, tipo)
    const msgs = [...mensajes]
    let resultado = mensajes.length ? 'advertencia' : 'valido'
    const faltan = requeridos.filter(r => {
      if (valores[r] != null && valores[r] !== '') return false
      if (tipo === 'pacientes' && r === 'nombre') return true
      if (tipo === 'checadas' && r === 'fecha_hora') return !(valores.fecha && valores.hora)
      return true
    })
    if (faltan.length) {
      resultado = 'error'
      faltan.forEach(f => msgs.push({ campo: f, motivo: 'Dato obligatorio vacío' }))
    }
    let duplicadoDe = null
    const clave = resultado === 'error' ? null : claveDuplicado(valores, tipo)
    if (clave) {
      if (claves.has(clave)) { resultado = 'duplicado'; duplicadoDe = 'base'; msgs.push({ campo: null, motivo: 'Posible duplicado: ya existe en la clínica' }) }
      else if (vistos.has(clave)) { resultado = 'duplicado'; duplicadoDe = `fila ${vistos.get(clave)}`; msgs.push({ campo: null, motivo: `Repetida en el archivo (fila ${vistos.get(clave)})` }) }
      else vistos.set(clave, i + 1)
    }
    const tel = valores.telefono_celular
    if (tel && telefonoCompartidoAvisa && resultado !== 'error') {
      if (telefonos.has(tel) && resultado !== 'duplicado') { if (resultado === 'valido') resultado = 'advertencia'; msgs.push({ campo: 'telefono_celular', motivo: 'Teléfono ya registrado con otra persona (solo aviso)' }) }
      telefonos.set(tel, 'archivo')
    }
    if (tipo === 'pacientes' && resultado !== 'error' && !valores.fecha_nacimiento) { if (resultado === 'valido') resultado = 'advertencia'; msgs.push({ campo: 'fecha_nacimiento', motivo: 'Sin fecha de nacimiento: no se puede verificar duplicado' }) }
    return { numero_fila: i + 1, valores_originales: fila, valores_normalizados: valores, resultado, mensajes: msgs, duplicado_de: duplicadoDe }
  })
  return { filas: out, resumen: resumirFilas(out) }
}

export function resumirFilas(filas) {
  const r = { validos: 0, advertencias: 0, errores: 0, duplicados: 0 }
  for (const f of filas) {
    if (f.resultado === 'valido') r.validos++
    else if (f.resultado === 'advertencia') r.advertencias++
    else if (f.resultado === 'error') r.errores++
    else if (f.resultado === 'duplicado') r.duplicados++
  }
  return r
}

/** Filas que se cargarían tras confirmar: válidas, con advertencia y duplicados cuya decisión no sea «omitir» (en conflicto gana el existente, P-123). */
export function filasACargar(filas, politica = 'omitir') {
  return filas.filter(f => f.resultado === 'valido' || f.resultado === 'advertencia' || (f.resultado === 'duplicado' && (f.decision ?? politica) !== 'omitir'))
}

/** ¿Quedan columnas por revisar? (bloquea la confirmación, igual que importacion_confirmar). */
export const mapeosPorRevisar = mapeos => mapeos.filter(m => m.campo_destino && m.accion !== 'aceptar')

/** Registros que se pueden revertir: el lote entero solo si ninguno se modificó después (P-122). */
export function puedeRevertir(filas) {
  const mod = filas.filter(f => f.modificado_despues).length
  return mod === 0 ? { ok: true } : { ok: false, motivo: `${mod} registro(s) ya se modificaron después de la carga` }
}
