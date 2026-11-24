// Reversa de un lote CARGADO (P-122): la RPC importacion_revertir exige que ningún registro creado se haya modificado después y devuelve
// la lista de registros a borrar; aquí se borran con el JWT del Administrador (RLS) y solo en tablas permitidas. Las checadas del lote se
// borran por importacion_id. Los registros «combinados» (que solo rellenaron huecos de un existente) no se tocan: no tienen registro_id.
// POST { importacion_id } → { borrados, fallidos:[{tabla,id,motivo}] }
import { json, identificar, leerCuerpo, rest, rpc } from './_lib/comun.js'

const TABLAS = new Set(['pacientes', 'productos', 'proveedores'])

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  if (!quien.perfil?.activo || quien.perfil.rol !== 'administrador') return json(403, { error: 'Solo el Administrador revierte importaciones' })
  const b = await leerCuerpo(req)
  if (!b || !/^[0-9a-f-]{36}$/i.test(b.importacion_id ?? '')) return json(400, { error: 'Lote inválido' })
  const ctx = quien.ctx

  const li = await rest(ctx, 'GET', `/rest/v1/importaciones?id=eq.${b.importacion_id}&select=tipo_datos,estado`)
  const imp = li.data?.[0]
  if (!imp) return json(404, { error: 'Lote no encontrado' })

  const r = await rpc(ctx, 'importacion_revertir', { p_importacion: b.importacion_id })
  if (!r.ok) return json(409, { error: r.error })
  const registros = Array.isArray(r.data) ? r.data : []
  let borrados = 0
  const fallidos = []
  for (const x of registros) {
    if (!TABLAS.has(x.tabla) || !/^[0-9a-f-]{36}$/i.test(x.id ?? '')) { fallidos.push({ ...x, motivo: 'Tabla no permitida' }); continue }
    const d = await rest(ctx, 'DELETE', `/rest/v1/${x.tabla}?id=eq.${x.id}`)
    if (d.ok && (d.data?.length ?? 0) > 0) borrados++
    else fallidos.push({ ...x, motivo: d.error || 'No se pudo borrar (puede tener movimientos asociados)' })
  }
  if (imp.tipo_datos === 'checadas') {
    const d = await rest(ctx, 'DELETE', `/rest/v1/checadas?importacion_id=eq.${b.importacion_id}`)
    if (d.ok) borrados += d.data?.length ?? 0
    else fallidos.push({ tabla: 'checadas', id: b.importacion_id, motivo: d.error })
  }
  return json(fallidos.length ? 207 : 200, { data: { borrados, fallidos }, borrados, fallidos })
}
