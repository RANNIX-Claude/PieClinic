// Panel del superadministrador RANNIX (pantalla 48). Todas las RPC rannix_* verifican app.es_rannix() con el JWT del llamante;
// aquí además se exige que el usuario esté en rannix_staff y solo se permiten las acciones de la lista (nunca datos de salud, MATRIZ §3.3).
// Para `alta_clinica` arma el enlace de invitación del primer administrador (el token se muestra una sola vez).
// Cuerpo: { accion: 'panel_clinicas' | 'panel_resumen' | 'clinicas_por_suspender' | 'cambiar_estado_org' | 'marcar_vencida' | 'registrar_pago'
//          | 'alta_clinica' | 'tickets' | 'responder_ticket', args: { p_… } }  →  { data } | { error }
import { json, identificar, leerCuerpo, rpc, origenSitio } from './_lib/comun.js'

const ACCIONES = new Set(['panel_clinicas', 'panel_resumen', 'clinicas_por_suspender', 'cambiar_estado_org', 'marcar_vencida', 'registrar_pago', 'alta_clinica', 'tickets', 'responder_ticket'])

export default async req => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })
  const quien = await identificar(req)
  if (quien.error) return json(quien.status, { error: quien.error })
  if (!quien.rannix) return json(403, { error: 'Solo el personal de RANNIX puede usar este panel' })
  const b = await leerCuerpo(req)
  if (!b || !ACCIONES.has(b.accion)) return json(400, { error: 'Acción no permitida' })
  const args = b.args && typeof b.args === 'object' ? b.args : {}
  const r = await rpc(quien.ctx, `rannix_${b.accion}`, args)
  if (!r.ok) return json(r.status >= 500 ? 502 : 400, { error: r.error })
  let data = r.data
  if (b.accion === 'alta_clinica' && data?.token) {
    const origen = origenSitio(req)
    data = { ...data, enlace: `${origen}/app/aceptar-invitacion?token=${encodeURIComponent(data.token)}` }
  }
  return json(200, { data })
}
