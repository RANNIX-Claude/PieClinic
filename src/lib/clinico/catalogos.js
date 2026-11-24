// Catálogos de listas cortas del módulo clínico (valores = los CHECK de las migraciones 010, 030-039).
export const TRI = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }, { value: 'no_sabe', label: 'No sabe' }]
export const SEXOS = [{ value: 'mujer', label: 'Mujer' }, { value: 'hombre', label: 'Hombre' }, { value: 'otro', label: 'Otro' }]
export const ESTADOS_CIVILES = [
  { value: 'soltero', label: 'Soltero(a)' }, { value: 'casado', label: 'Casado(a)' }, { value: 'union_libre', label: 'Unión libre' },
  { value: 'divorciado', label: 'Divorciado(a)' }, { value: 'viudo', label: 'Viudo(a)' }, { value: 'separado', label: 'Separado(a)' }, { value: 'otro', label: 'Otro' },
]
export const DIABETES = [{ value: 'no', label: 'No' }, { value: 'tipo1', label: 'Tipo 1' }, { value: 'tipo2', label: 'Tipo 2' }, { value: 'prediabetes', label: 'Prediabetes' }, { value: 'no_sabe', label: 'No sabe' }]
export const DIABETES_TIPO = [{ value: 'tipo1', label: 'Tipo 1' }, { value: 'tipo2', label: 'Tipo 2' }, { value: 'prediabetes', label: 'Prediabetes' }, { value: 'gestacional', label: 'Gestacional' }, { value: 'otra', label: 'Otra' }]
export const CONTACTO_PREFERIDO = [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }, { value: 'correo', label: 'Correo' }, { value: 'llamada', label: 'Llamada' }]
export const PARENTESCOS_CONTACTO = ['Esposo(a)', 'Padre', 'Madre', 'Hijo(a)', 'Hermano(a)', 'Abuelo(a)', 'Tío(a)', 'Amigo(a)', 'Otro'].map(v => ({ value: v, label: v }))
export const COMO_NOS_CONOCIO = [
  { value: 'referido_paciente', label: 'Referido por paciente' }, { value: 'referido_medico', label: 'Referido por médico' }, { value: 'google', label: 'Google / internet' },
  { value: 'redes_sociales', label: 'Redes sociales' }, { value: 'pasaba_por_aqui', label: 'Pasó por la clínica' }, { value: 'otro', label: 'Otro' },
]
export const REGIMENES_FISCALES = [
  { value: '601', label: '601 General de Ley Personas Morales' }, { value: '605', label: '605 Sueldos y salarios' }, { value: '606', label: '606 Arrendamiento' },
  { value: '612', label: '612 Personas físicas con actividad empresarial' }, { value: '621', label: '621 Incorporación fiscal' }, { value: '626', label: '626 RESICO' }, { value: '616', label: '616 Sin obligaciones fiscales' },
]
export const USOS_CFDI = [
  { value: 'G03', label: 'G03 Gastos en general' }, { value: 'D01', label: 'D01 Honorarios médicos, dentales y gastos hospitalarios' },
  { value: 'S01', label: 'S01 Sin efectos fiscales' }, { value: 'CP01', label: 'CP01 Pagos' },
]

export const CATEGORIAS_DIAGNOSTICO = [
  { value: 'onicomicosis', label: 'Onicomicosis' }, { value: 'papiloma_plantar', label: 'Papiloma plantar' }, { value: 'pie_atleta', label: 'Pie de atleta' },
  { value: 'micosis', label: 'Micosis' }, { value: 'hiperqueratosis', label: 'Hiperqueratosis' }, { value: 'otros', label: 'Otros' },
]
export const TIPOS_ATENCION = [{ value: 'presencial', label: 'Presencial' }, { value: 'a_distancia', label: 'A distancia' }, { value: 'domicilio', label: 'A domicilio' }]
export const ANESTESIA = [{ value: 'no_aplico', label: 'No aplicó' }, { value: 'topica', label: 'Tópica' }, { value: 'infiltrativa', label: 'Infiltrativa' }, { value: 'otra', label: 'Otra' }]
export const PRONOSTICOS = [{ value: 'bueno', label: 'Bueno' }, { value: 'reservado', label: 'Reservado' }, { value: 'malo', label: 'Malo' }]
export const GRAVEDAD_HALLAZGO = [{ value: 'leve', label: 'Leve' }, { value: 'moderada', label: 'Moderada' }, { value: 'grave', label: 'Grave' }]
export const TIPOS_HALLAZGO = [
  ['callosidad', 'Callosidad'], ['helomas', 'Helomas'], ['hiperqueratosis', 'Hiperqueratosis'], ['onicomicosis', 'Onicomicosis'], ['una_encarnada', 'Uña encarnada'],
  ['onicocriptosis', 'Onicocriptosis'], ['papiloma_plantar', 'Papiloma plantar'], ['pie_de_atleta', 'Pie de atleta'], ['micosis', 'Micosis'], ['fisura', 'Fisura'],
  ['lesion', 'Lesión'], ['ulcera', 'Úlcera'], ['maceracion', 'Maceración'], ['deformidad', 'Deformidad'], ['dolor', 'Dolor'], ['otro', 'Otro'],
].map(([value, label]) => ({ value, label }))
export const TIPOS_EXPLORACION = [
  { value: 'dermatologica', label: 'Dermatológica' }, { value: 'ungueal', label: 'Ungueal' }, { value: 'ortopedica', label: 'Ortopédica / biomecánica' },
  { value: 'vascular', label: 'Vascular' }, { value: 'neurologica', label: 'Neurológica' },
]
/** Campos de cada exploración (se guardan en exploraciones.datos jsonb). */
export const CAMPOS_EXPLORACION = {
  ungueal: [['forma', 'Forma', ['Normal', 'Involuta', 'En pinza', 'Hipertrófica', 'Onicolisis']], ['grosor', 'Grosor', ['Normal', 'Engrosada', 'Delgada']], ['color', 'Color', null],
    ['patron_onicomicosis', 'Patrón de onicomicosis', ['—', 'Distal lateral', 'Blanca superficial', 'Proximal subungueal', 'Distrófica total']],
    ['pliegues', 'Estado de pliegues', ['Sin inflamación', 'Eritema', 'Edema', 'Granuloma']], ['dolor_presion', 'Dolor a la presión (0–10)', 'num'], ['infeccion', 'Signos de infección', ['Ninguno', 'Local', 'Sistémico']]],
  dermatologica: [['hidratacion', 'Hidratación', ['Normal', 'Seca', 'Muy seca']], ['hiperqueratosis', 'Hiperqueratosis', null], ['helomas', 'Helomas', null], ['fisuras', 'Fisuras', null],
    ['maceracion', 'Maceración', null], ['tinea', 'Tiña', null], ['verrugas', 'Verrugas', null], ['hiperhidrosis', 'Hiperhidrosis', ['No', 'Leve', 'Moderada', 'Severa']]],
  ortopedica: [['arco', 'Arco', ['Normal', 'Plano', 'Cavo']], ['hallux_valgus', 'Hallux valgus', ['No', 'Leve', 'Moderado', 'Severo']], ['dedos_garra', 'Dedos en garra', null], ['retropie', 'Retropié', ['Neutro', 'Valgo', 'Varo']],
    ['marcha', 'Marcha', null], ['huella', 'Huella', null]],
  vascular: [['pulso_pedio', 'Pulso pedio', ['Presente', 'Disminuido', 'Ausente', 'No evaluado']], ['pulso_tibial', 'Pulso tibial posterior', ['Presente', 'Disminuido', 'Ausente', 'No evaluado']], ['temperatura', 'Temperatura', ['Normal', 'Fría', 'Caliente']],
    ['llenado_capilar_s', 'Llenado capilar (s)', 'num'], ['edema', 'Edema', ['No', 'Leve', 'Moderado', 'Severo']], ['itb', 'ITB (vacío = no evaluado)', 'num']],
  neurologica: [['monofilamento', 'Monofilamento', ['Conservado', 'Disminuido', 'Ausente', 'No evaluado']], ['diapason', 'Diapasón 128 Hz', ['Presente', 'Disminuida', 'Ausente', 'No evaluado']], ['reflejos', 'Reflejos', ['Presentes', 'Disminuidos', 'Ausentes', 'No evaluado']],
    ['termica_dolor', 'Sensibilidad térmica / dolor', ['Normal', 'Disminuida', 'Ausente', 'No evaluado']]],
}
export const MOMENTOS_FOTO = [{ value: 'antes', label: 'Antes' }, { value: 'despues_inmediato', label: 'Después inmediato' }, { value: 'despues', label: 'Después' }, { value: 'seguimiento', label: 'Seguimiento' }]
export const VISTAS_FOTO = [{ value: 'dorsal', label: 'Dorsal' }, { value: 'plantar', label: 'Plantar' }, { value: 'medial', label: 'Medial' }, { value: 'lateral', label: 'Lateral' }, { value: 'posterior', label: 'Posterior' }]
export const NIVELES_AUTORIZACION = [{ value: 'clinico', label: 'Solo expediente clínico' }, { value: 'docencia', label: 'Docencia / difusión' }]
export const TIPOS_QUEJA = [
  { value: 'dolor_posterior', label: 'Dolor posterior al procedimiento' }, { value: 'tiempo_espera', label: 'Tiempo de espera excesivo' }, { value: 'cobro_incorrecto', label: 'Cobro / ticket incorrecto' },
  { value: 'evento_adverso_infeccion', label: 'Evento adverso / infección' }, { value: 'trato_personal', label: 'Trato del personal' }, { value: 'instrumental_higiene', label: 'Instrumental / higiene' }, { value: 'otro', label: 'Otro' },
]
export const CANALES_QUEJA = [{ value: 'llamada', label: 'Llamada' }, { value: 'presencial', label: 'Presencial' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'correo', label: 'Correo' }, { value: 'portal', label: 'Portal' }, { value: 'otro', label: 'Otro' }]
export const COMPENSACIONES = [{ value: 'ninguna', label: 'Ninguna' }, { value: 'disculpa', label: 'Disculpa' }, { value: 'consulta_sin_costo', label: 'Consulta sin costo' }, { value: 'reembolso', label: 'Reembolso' }, { value: 'descuento', label: 'Descuento' }]
export const GRAVEDADES = [{ value: 'baja', label: 'Baja' }, { value: 'media', label: 'Media' }, { value: 'alta', label: 'Alta' }]
export const ESTADOS_QUEJA = ['nueva', 'en_revision', 'escalada', 'resuelta', 'cerrada']
export const ESTADOS_PLAN = ['en_curso', 'pausado', 'abandonado', 'concluido']
export const TIPOS_PIE_ORTOPEDICO = [{ value: 'plano', label: 'Plano' }, { value: 'normal', label: 'Normal' }, { value: 'cavo', label: 'Cavo' }]
export const ESTUDIOS_PISADA = [{ value: 'baropodometria', label: 'Baropodometría' }, { value: 'huella_plantar', label: 'Huella plantar' }, { value: 'observacion_clinica', label: 'Observación clínica' }, { value: 'otro', label: 'Otro' }]
export const COBERTURAS = [{ value: 'completa', label: 'Completa' }, { value: 'tres_cuartos', label: '3/4' }, { value: 'antepie', label: 'Antepié' }, { value: 'otra', label: 'Otra' }]
export const SECCIONES_DICTADO = [{ value: 'nota_evolucion', label: 'Nota de evolución' }, { value: 'descripcion_procedimiento', label: 'Descripción del procedimiento' }, { value: 'hallazgos', label: 'Hallazgos' }]

export const etiquetaDe = (lista, valor) => lista.find(x => x.value === valor)?.label ?? valor ?? '—'
