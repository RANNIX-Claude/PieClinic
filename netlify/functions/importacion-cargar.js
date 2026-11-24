// Carga efectiva de un lote de importación YA CONFIRMADO por el Administrador (P-122: nada se carga sin confirmar).
// Corre con el JWT del Administrador (RLS de su clínica) — no usa la service_role. Cada registro creado se anota en
// importacion_filas.registro_tabla/registro_id (base de la reversa). Es idempotente: las filas ya cargadas se saltan, así que se puede reintentar.
// Tipos con cargador: pacientes, productos, proveedores, checadas. citas, historial e imagenes_expediente quedan PENDIENTES (501):
// dependen de agenda/consultas de otro dominio y de leer archivos con IA.
// P-123: en conflicto gana el dato existente (combinar solo rellena campos vacíos); los pacientes entran marcados importado=true con su lote.
// POST { importacion_id } → { cargados, combinados, omitidos, errores:[{fila,motivo}] }
import { json, identificar, leerCuerpo, rest, rpc } from './_lib/comun.js'

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const q = v => encodeURIComponent(String(v))
const lotes = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

const vacio = v => v == null || v === ''
const CAMPOS_PAC = ['nombre', 'apellido_paterno', 'apellido_materno', 'fecha_nacimiento', 'sexo', 'telefono_celular', 'telefono_fijo', 'email', 'curp', 'calle', 'colonia', 'municipio', 'codigo_postal', 'ocupacion', 'folio_anterior', 'alergias_resumen', 'diabetes', 'notas_administrativas']
const CAMPOS_PROD = ['sku', 'nombre', 'codigo_barras', 'categoria', 'marca', 'presentacion', 'costo_promedio']
const CAMPOS_PROV = ['nombre', 'razon_social', 'rfc', 'contacto', 'telefono', 'email', 'dias_credito', 'condiciones_pago', 'notas']
const solo = (obj, campos) => Object.fromEntries(campos.filter(c => !vacio(obj[c])).map(c => [c, obj[c]]))

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  if (!quien.perfil?.activo || quien.perfil.rol !== 'administrador') return json(403, { error: 'Solo el Administrador carga importaciones' })
  const b = await leerCuerpo(req)
  if (!b || !/^[0-9a-f-]{36}$/i.test(b.importacion_id ?? '')) return json(400, { error: 'Lote inválido' })
  const ctx = quien.ctx, org = quien.perfil.organizacion_id

  const li = await rest(ctx, 'GET', `/rest/v1/importaciones?id=eq.${b.importacion_id}&select=*`)
  const imp = li.data?.[0]
  if (!imp) return json(404, { error: 'Lote no encontrado' })
  if (imp.estado !== 'confirmado') return json(409, { error: `El lote está en «${imp.estado}»: solo se carga un lote confirmado` })
  if (!['pacientes', 'productos', 'proveedores', 'checadas'].includes(imp.tipo_datos)) {
    return json(501, { error: `La carga de «${imp.tipo_datos}» aún no está implementada (depende de otros módulos). El lote queda confirmado sin cargar.` })
  }

  const fr = await rest(ctx, 'GET', `/rest/v1/importacion_filas?importacion_id=eq.${imp.id}&resultado=in.(valido,advertencia,duplicado)&registro_id=is.null&order=numero_fila&limit=100000&select=id,numero_fila,resultado,decision,valores_normalizados`)
  if (!fr.ok) return json(400, { error: fr.error })
  const filas = (fr.data ?? []).filter(f => f.resultado !== 'duplicado' || (f.decision ?? imp.politica_duplicados) !== 'omitir')
  const omitidos = (fr.data ?? []).length - filas.length
  const salida = { cargados: 0, combinados: 0, omitidos, errores: [] }
  const marcar = (f, tabla, id) => rest(ctx, 'PATCH', `/rest/v1/importacion_filas?id=eq.${f.id}`, { registro_tabla: tabla, registro_id: id })

  // ───────── checadas: una sola RPC (reimportar no duplica) ─────────
  if (imp.tipo_datos === 'checadas') {
    if (!imp.sede_id) return json(400, { error: 'El lote de checadas necesita una sede destino' })
    const payload = filas.map(f => {
      const v = f.valores_normalizados ?? {}
      const fh = v.fecha_hora ?? (v.fecha && v.hora ? `${v.fecha}T${String(v.hora).slice(0, 5)}:00` : null)
      const op = /sal/i.test(v.tipo ?? '') ? 'salida' : 'entrada'
      return { numero_empleado: v.numero_empleado, fecha_hora: fh, operacion: op }
    }).filter(x => x.numero_empleado && x.fecha_hora)
    const r = await rpc(ctx, 'rh_importar_checadas', { p_sede: imp.sede_id, p_filas: payload, p_importacion: imp.id })
    if (!r.ok) return json(400, { error: r.error })
    salida.cargados = r.data?.insertadas ?? 0
    salida.omitidos += (r.data?.repetidas ?? 0)
    salida.sin_empleado = r.data?.sin_empleado ?? 0
    const m = await rpc(ctx, 'importacion_marcar_cargado', { p_importacion: imp.id })
    if (!m.ok) return json(409, { error: m.error, ...salida })
    return json(200, { data: salida, ...salida })
  }

  // ───────── pacientes / productos / proveedores ─────────
  let clavesProv = null
  if (imp.tipo_datos === 'proveedores') {
    const e = await rest(ctx, 'GET', `/rest/v1/proveedores?select=clave&limit=100000`)
    clavesProv = new Set((e.data ?? []).map(x => x.clave))
  }
  const claveNueva = nombre => {
    const base = (norm(nombre).replace(/ /g, '').toUpperCase().slice(0, 6) || 'PROV')
    let n = 1, c = `${base}-${String(n).padStart(2, '0')}`
    while (clavesProv.has(c)) c = `${base}-${String(++n).padStart(2, '0')}`
    clavesProv.add(c)
    return c
  }

  async function cargarFila(f) {
    const v = f.valores_normalizados ?? {}
    const esDup = f.resultado === 'duplicado'
    const decision = f.decision ?? imp.politica_duplicados
    if (imp.tipo_datos === 'pacientes') {
      const datos = solo(v, CAMPOS_PAC)
      if (v.notas_importadas) datos.notas_administrativas = [datos.notas_administrativas, `[Importado] ${v.notas_importadas}`].filter(Boolean).join('\n')
      if (esDup && decision === 'combinar') {
        const filtro = `nombre=ilike.${q(v.nombre ?? '')}&apellido_paterno=ilike.${q(v.apellido_paterno ?? '')}` + (v.fecha_nacimiento ? `&fecha_nacimiento=eq.${v.fecha_nacimiento}` : '')
        const ex = await rest(ctx, 'GET', `/rest/v1/pacientes?${filtro}&select=*&limit=1`)
        const p = ex.data?.[0]
        if (!p) return { error: 'No se encontró el paciente existente para combinar' }
        const relleno = Object.fromEntries(Object.entries(datos).filter(([k]) => vacio(p[k]) && k !== 'notas_administrativas'))
        if (Object.keys(relleno).length) { const u = await rest(ctx, 'PATCH', `/rest/v1/pacientes?id=eq.${p.id}`, relleno); if (!u.ok) return { error: u.error } }
        return { combinado: true }
      }
      if (!imp.sede_id) return { error: 'El lote necesita una sede de registro' }
      const falta = vacio(datos.apellido_paterno) || vacio(datos.fecha_nacimiento) || vacio(datos.telefono_celular)
      const ins = await rest(ctx, 'POST', '/rest/v1/pacientes', {
        organizacion_id: org, sede_registro_id: imp.sede_id, origen_registro: 'importacion', importado: true, lote_importacion_id: imp.id,
        alta_rapida: falta, homonimo_confirmado: esDup && decision === 'crear_nuevo', ...datos,
      })
      if (!ins.ok) return { error: /posible_duplicado/.test(ins.error ?? '') ? 'Posible duplicado (ya existe en la clínica)' : ins.error }
      await marcar(f, 'pacientes', ins.data[0].id)
      return { creado: true }
    }
    if (imp.tipo_datos === 'productos') {
      const datos = solo(v, CAMPOS_PROD)
      if (esDup && decision === 'combinar') {
        const ex = await rest(ctx, 'GET', `/rest/v1/productos?sku=eq.${q(v.sku ?? '')}&select=*&limit=1`)
        const p = ex.data?.[0]
        if (!p) return { error: 'No se encontró el producto existente para combinar' }
        const relleno = Object.fromEntries(Object.entries(datos).filter(([k]) => vacio(p[k])))
        if (Object.keys(relleno).length) { const u = await rest(ctx, 'PATCH', `/rest/v1/productos?id=eq.${p.id}`, relleno); if (!u.ok) return { error: u.error } }
        return { combinado: true }
      }
      if (esDup) datos.sku = `${datos.sku}-IMP${String(f.numero_fila).padStart(3, '0')}`
      const ins = await rest(ctx, 'POST', '/rest/v1/productos', { organizacion_id: org, ...datos })
      if (!ins.ok) return { error: ins.error }
      await marcar(f, 'productos', ins.data[0].id)
      return { creado: true }
    }
    // proveedores
    const datos = solo(v, CAMPOS_PROV)
    if (esDup && decision === 'combinar') {
      const filtro = v.rfc ? `rfc=eq.${q(v.rfc)}` : `nombre=ilike.${q(v.nombre ?? '')}`
      const ex = await rest(ctx, 'GET', `/rest/v1/proveedores?${filtro}&select=*&limit=1`)
      const p = ex.data?.[0]
      if (!p) return { error: 'No se encontró el proveedor existente para combinar' }
      const relleno = Object.fromEntries(Object.entries(datos).filter(([k]) => vacio(p[k])))
      if (Object.keys(relleno).length) { const u = await rest(ctx, 'PATCH', `/rest/v1/proveedores?id=eq.${p.id}`, relleno); if (!u.ok) return { error: u.error } }
      return { combinado: true }
    }
    const ins = await rest(ctx, 'POST', '/rest/v1/proveedores', { organizacion_id: org, clave: claveNueva(datos.nombre), ...datos })
    if (!ins.ok) return { error: ins.error }
    await marcar(f, 'proveedores', ins.data[0].id)
    return { creado: true }
  }

  for (const grupo of lotes(filas, 8)) {
    const rs = await Promise.all(grupo.map(f => cargarFila(f).catch(e => ({ error: e.message }))))
    rs.forEach((r, i) => {
      if (r.error) salida.errores.push({ fila: grupo[i].numero_fila, motivo: r.error })
      else if (r.combinado) salida.combinados++
      else salida.cargados++
    })
  }

  if (salida.errores.length) {
    // el lote sigue «confirmado»: se corrigen los errores o se reintenta; lo ya cargado no se duplica (registro_id marcado)
    return json(207, { error: `${salida.errores.length} fila(s) no se pudieron cargar; el lote sigue confirmado y puedes reintentar.`, ...salida })
  }
  const m = await rpc(ctx, 'importacion_marcar_cargado', { p_importacion: imp.id })
  if (!m.ok) return json(409, { error: m.error, ...salida })
  return json(200, { data: salida, ...salida })
}
