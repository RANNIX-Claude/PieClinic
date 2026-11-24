// Formateo de los impresos fieles al papel de Pie Clinic (consentimiento, antecedentes, seguimiento clínico).
// Funciones puras que convierten el JSON de la RPC datos_impreso en lo que dibujan las hojas A4.
import { calcularEdad } from './edad.js'

export const TIPOS_IMPRESO = {
  impreso_consentimiento: 'Consentimiento informado para Tratamiento Podológico',
  impreso_antecedentes: 'Antecedentes personales',
  impreso_seguimiento: 'Seguimiento clínico',
  impreso_historia_completa: 'Historia clínica completa',
  impreso_en_blanco: 'Formato en blanco',
}

/** Casillas Sí/No/No sabe del papel: { si, no, noSabe } booleanos para marcar la opción. */
export function casillaTri(valor) {
  return { si: valor === 'si', no: valor === 'no', noSabe: valor === 'no_sabe' }
}
export const etiquetaTri = v => ({ si: 'SÍ', no: 'NO', no_sabe: 'NO SABE' })[v] ?? '—'

const SEXO = { mujer: 'F', hombre: 'M', otro: 'Otro' }
export const sexoCorto = s => SEXO[s] ?? ''
const ESTADO_CIVIL = { soltero: 'Soltero(a)', casado: 'Casado(a)', union_libre: 'Unión libre', divorciado: 'Divorciado(a)', viudo: 'Viudo(a)', separado: 'Separado(a)', otro: 'Otro' }
export const estadoCivilTexto = v => ESTADO_CIVIL[v] ?? ''

/** dd/mm/aaaa desde 'YYYY-MM-DD' o ISO (sin correr por zona horaria si es solo fecha). */
export function fechaCorta(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

export const nombreCompletoPaciente = p => [p?.nombre, p?.apellido_paterno, p?.apellido_materno].filter(Boolean).join(' ').trim()

/** Línea de domicilio del papel: Calle, Mz, Lt, Col. (+ CP/municipio si existen). */
export function domicilioImpreso(p) {
  return {
    calle: [p?.calle, p?.num_exterior].filter(Boolean).join(' ') + (p?.num_interior ? ` int. ${p.num_interior}` : ''),
    mz: p?.manzana ?? '', lt: p?.lote ?? '', colonia: p?.colonia ?? '',
    extra: [p?.codigo_postal && `C.P. ${p.codigo_postal}`, p?.municipio, p?.estado_domicilio].filter(Boolean).join(', '),
  }
}

/** Cadena «Última glucosa»: fecha + texto (p. ej. «20/10/2026 (142 mg/dl)»). */
export function ultimaGlucosa(a) {
  const f = fechaCorta(a?.ultima_glucosa_fecha), t = a?.ultima_glucosa_texto
  if (f && t) return `${f} (${t})`
  return f || t || ''
}

/** Los renglones de «Padece alguna enfermedad su:» */
export const PARENTESCOS = [['hf_padre', 'Padre'], ['hf_madre', 'Madre'], ['hf_hermanos', 'Hermanos'], ['hf_esposo', 'Esposa(o)'], ['hf_hijos', 'Hijos']]

/** Patológicos en el orden del papel. `detalle` es el texto que acompaña (¿A qué?, Especifique). */
export function patologicosImpreso(a = {}, vih = undefined) {
  const fila = (clave, etiqueta, valor, detalle) => ({ clave, etiqueta, valor, detalle: detalle ?? '', ...casillaTri(valor) })
  const filas = [
    fila('diabetes', 'Diabetes', a?.diabetes, a?.diabetes_tipo ? `tipo ${a.diabetes_tipo}` : ''),
    fila('hipertension', 'Hipertensión', a?.hipertension),
    fila('alergicos', 'Alérgicos', a?.alergicos, a?.alergicos_detalle),
    fila('artritis', 'Artritis', a?.artritis),
    fila('obesidad', 'Obesidad', a?.obesidad),
    fila('traumaticos', 'Traumáticos', a?.traumaticos, a?.traumaticos_detalle),
    fila('varices', 'Várices', a?.varices),
  ]
  // VIH (N-04): solo se dibuja el valor si la RPC lo devolvió (podólogo/Administración y se pidió expresamente)
  filas.push(vih === undefined ? { clave: 'vih', etiqueta: 'VIH', valor: null, detalle: '', restringido: true, si: false, no: false, noSabe: false } : fila('vih', 'VIH', vih))
  filas.push(fila('otras', 'Otras', a?.otras_enfermedades, a?.otras_enfermedades_detalle))
  return filas
}

export const noPatologicosImpreso = (a = {}) => [
  { clave: 'tabaquismo', etiqueta: 'Tabaquismo', ...casillaTri(a?.tabaquismo) },
  { clave: 'alcoholismo', etiqueta: 'Alcoholismo', ...casillaTri(a?.alcoholismo) },
  { clave: 'toxicomanias', etiqueta: 'Toxicomanías', ...casillaTri(a?.toxicomanias) },
]

/** Las 5 siluetas y su etiqueta; `seleccion` es el arreglo guardado por pierna. */
export const SILUETAS = [['genu_valgum', 'Genu valgum'], ['genu_varum', 'Genu varum'], ['normal', 'Normal'], ['genu_recurvatum', 'Genu recurvatum'], ['genu_flexum', 'Genu flexum']]
export function exploracionImpresa(filas = []) {
  const por = pierna => filas.find(f => f.pierna === pierna)?.siluetas ?? []
  return SILUETAS.map(([clave, etiqueta]) => ({ clave, etiqueta, D: por('D').includes(clave), I: por('I').includes(clave) }))
}

/** Casillas del diagnóstico (formato 3). Devuelve el conjunto marcado y el texto de «Otros». */
export const CASILLAS_DIAGNOSTICO = [['onicomicosis', 'ONICOMICOSIS'], ['papiloma_plantar', 'PAPILOMA PLANTAR'], ['pie_atleta', 'PIE DE ATLETA'], ['micosis', 'MICOSIS'], ['hiperqueratosis', 'HIPERQUERATOSIS'], ['otros', 'OTROS']]
export function diagnosticoImpreso(diagnosticos = []) {
  const marcadas = new Set(diagnosticos.map(d => d.categoria).filter(Boolean))
  const otros = [...new Set(diagnosticos.filter(d => d.categoria === 'otros' && d.texto_otros).map(d => d.texto_otros))].join('; ')
  return { marcadas, otros, casillas: CASILLAS_DIAGNOSTICO.map(([k, e]) => ({ clave: k, etiqueta: e, marcada: marcadas.has(k) })) }
}

/** Resumen de «Antecedentes» del formato 3 (enfermedades hereditarias y no hereditarias) en una frase. */
export function resumenAntecedentesTexto(a = {}, alergias = []) {
  const p = []
  if (a?.diabetes === 'si') p.push(`Diabetes${a.diabetes_tipo ? ` ${String(a.diabetes_tipo).replace('tipo', 'tipo ')}` : ''}`)
  if (a?.hipertension === 'si') p.push('hipertensión')
  if (a?.varices === 'si') p.push('várices')
  if (a?.artritis === 'si') p.push('artritis')
  if (a?.obesidad === 'si') p.push('obesidad')
  const heredo = PARENTESCOS.filter(([k]) => a?.[k]).map(([k, e]) => `${e.toLowerCase()}: ${a[k]}`)
  if (heredo.length) p.push(`heredofamiliares (${heredo.join('; ')})`)
  const al = alergias.map(x => x.sustancia).filter(Boolean)
  if (al.length) p.push(`alérgica(o) a ${al.join(', ')}`)
  return p.join(' · ')
}

/** Tabla de visitas: páginas de `porPagina` renglones, siempre con renglones en blanco para completar a mano (mínimo `minimo`). */
export function paginarVisitas(visitas = [], { porPagina = 10, minimo = 10 } = {}) {
  const filas = visitas.map(v => ({
    fecha: fechaCorta(v.fecha), atendio: v.atendio ?? '', servicio: v.servicio ?? '', observaciones: v.observaciones ?? '', proxima: fechaCorta(v.proxima_visita), folio: v.folio ?? '',
  }))
  const total = Math.max(minimo, Math.ceil(filas.length / porPagina) * porPagina)
  while (filas.length < total) filas.push({ fecha: '', atendio: '', servicio: '', observaciones: '', proxima: '', folio: '', vacia: true })
  const paginas = []
  for (let i = 0; i < filas.length; i += porPagina) paginas.push(filas.slice(i, i + porPagina))
  return paginas
}

/** Pie de página de cada hoja: «Expediente X · impreso dd/mm/aaaa por Y · versión N del expediente [· COPIA]». */
export function piePagina({ expediente, fecha, impresoPor, version, esCopia, enBlanco }) {
  if (enBlanco) return 'Formato en blanco'
  return [`Expediente ${expediente || '—'}`, `impreso ${fechaCorta(fecha)}${impresoPor ? ` por ${impresoPor}` : ''}`, version != null ? `versión ${version} del expediente` : null, esCopia ? 'COPIA' : null].filter(Boolean).join(' · ')
}

/** Sustituye {{variable}} en el texto de una plantilla (consentimiento editable por clínica, P-139). Lo no encontrado queda subrayado. */
export function sustituirVariables(texto, vars = {}) {
  return String(texto ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== '' ? String(vars[k]) : '________'))
}

/** Variables que alimentan el consentimiento: las de la plantilla base ({{paciente}}, {{tutor}}, {{podologo}}, {{clinica}}) y alias explícitos. */
export function variablesConsentimiento({ paciente, tutor, podologo, fecha, clinica }) {
  const edad = calcularEdad(paciente?.fecha_nacimiento)
  const menor = edad !== null && edad < 18
  const nombre = nombreCompletoPaciente(paciente)
  return {
    paciente: nombre, nombre_paciente: nombre,
    tutor: menor && tutor?.nombre_completo ? `, representado(a) por su ${String(tutor.parentesco ?? 'tutor').toLowerCase()} ${tutor.nombre_completo}` : '',
    nombre_tutor: menor ? (tutor?.nombre_completo ?? '') : '— no aplica —',
    podologo: podologo?.nombre ?? '', nombre_podologo: podologo?.nombre ?? '',
    cedula_podologo: podologo?.cedula ?? '', clinica: clinica ?? '', fecha: fechaCorta(fecha),
  }
}

/** Nombre de archivo sugerido para guardar el PDF (sin datos sensibles en el nombre). */
export const nombreArchivoImpreso = (tipo, expediente, fecha) =>
  `${tipo.replace('impreso_', '')}_${String(expediente || 'sin-expediente').replace(/[^\w-]+/g, '_')}_${String(fecha || '').slice(0, 10)}`
