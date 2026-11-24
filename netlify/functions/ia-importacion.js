// Propuesta de mapeo de columnas con IA (pantalla 13). SIN LLAVE responde {modo:'no_configurado'} y el navegador usa su mapeador
// heurístico etiquetado como simulado. Con llave: pide al modelo un JSON {mapeos:[{columna,ejemplo,campo_destino,confianza,transformacion,campo_clinico}]}.
// P-122/P-123: la propuesta nunca se aplica sola; el Administrador la revisa (los campos clínicos y los de baja confianza nacen en «revisar»).
// P-128: solo recibe columnas y una muestra del archivo que el propio administrador subió; no lee datos de la base.
// Pendiente: lectura de PDF e imágenes (requiere enviar el archivo del bucket `importaciones` al modelo con visión).
import { json, identificar, leerCuerpo } from './_lib/comun.js'

const MODELO = process.env.IA_MODELO || 'claude-sonnet-4-5'
const DESTINOS = {
  pacientes: 'nombre, nombre_completo, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, telefono_celular, telefono_fijo, email, curp, calle, colonia, municipio, codigo_postal, ocupacion, folio_anterior, alergias_resumen, diabetes, notas_importadas, notas_administrativas',
  productos: 'sku, nombre, codigo_barras, categoria, marca, presentacion, costo_promedio, precio, existencia, minimo',
  proveedores: 'nombre, razon_social, rfc, contacto, telefono, email, dias_credito, condiciones_pago, notas',
  citas: 'paciente, fecha, hora, servicio, podologo, notas',
  historial: 'paciente, fecha, motivo, diagnostico, tratamiento, notas',
  checadas: 'numero_empleado, fecha_hora, fecha, hora, tipo',
  imagenes_expediente: 'paciente, archivo, fecha',
}

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  if (!quien.perfil?.activo || quien.perfil.rol !== 'administrador') return json(403, { error: 'Solo el Administrador importa datos' })
  const llave = process.env.ANTHROPIC_API_KEY || process.env.IA_API_KEY
  if (!llave) return json(200, { modo: 'no_configurado', proveedor: null })

  const b = await leerCuerpo(req)
  if (!b || !DESTINOS[b.tipo]) return json(400, { error: 'Solicitud inválida' })
  if (!Array.isArray(b.columnas)) return json(501, { error: 'La lectura de PDF e imágenes con IA aún no está implementada en esta función.' })
  const prompt = 'Eres un asistente de migración de datos de una clínica de podología en México. Tienes las columnas de un archivo y una muestra de filas.\n' +
    `Campos destino válidos para «${b.tipo}»: ${DESTINOS[b.tipo]}.\n` +
    'Responde SOLO un JSON {"mapeos":[{"columna":"","ejemplo":"","campo_destino":"campo o null","confianza":0-100,"transformacion":"texto o null","campo_clinico":true|false}]} con un elemento por columna. ' +
    'Marca campo_clinico=true en alergias, diagnósticos, medicamentos, antecedentes. No inventes campos. Si dudas, campo_destino null.\n' +
    `Columnas: ${JSON.stringify(b.columnas).slice(0, 4000)}\nMuestra: ${JSON.stringify((b.muestra ?? []).slice(0, 5)).slice(0, 6000)}`
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': llave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!r.ok) return json(502, { error: 'El proveedor de IA no respondió correctamente' })
    const j = await r.json()
    const texto = (j.content ?? []).map(c => c.text ?? '').join('')
    const m = texto.match(/\{[\s\S]*\}/)
    const prop = m ? JSON.parse(m[0]) : null
    if (!Array.isArray(prop?.mapeos)) return json(502, { error: 'La IA no devolvió un mapeo válido' })
    const umbral = Number(b.umbral ?? 80)
    const mapeos = prop.mapeos.map(x => {
      const clinico = !!x.campo_clinico
      const conf = x.confianza == null ? null : Math.max(0, Math.min(100, Number(x.confianza)))
      return {
        columna: String(x.columna), ejemplo: x.ejemplo == null ? '' : String(x.ejemplo), campo_destino: x.campo_destino || null, confianza: conf,
        transformacion: x.transformacion || null, campo_clinico: clinico,
        accion: !x.campo_destino ? 'elegir_campo' : (clinico || (conf ?? 0) < umbral ? 'revisar' : 'aceptar'),
      }
    })
    return json(200, { modo: 'activo', proveedor: process.env.IA_PROVEEDOR || 'anthropic', mapeos })
  } catch (e) {
    return json(502, { error: 'No se pudo contactar a la IA: ' + e.message })
  }
}
