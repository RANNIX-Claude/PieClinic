// Notificaciones push (F2.3). El registro de la suscripción y el contrato quedan listos; el ENVÍO real exige llaves VAPID (variable VITE_VAPID_PUBLIC_KEY
// en la app y la privada en el servidor, de la Etapa 6). Sin llaves la suscripción se guarda como SIMULADA y la pantalla lo rotula así.
// Contrato con la Etapa 6: lee piefirme.ctl_push_suscripcion (organizacion_id, sucursal_id, endpoint, claves, simulada) desde ctl_alerta y manda
// {titulo, cuerpo, url} al endpoint; el service worker (public/sw.js) lo muestra. «Mis pendientes» consulta cada 20 s mientras la app está abierta.
import { rpc } from '../../src/lib/api'

export const hayVapid = () => !!import.meta.env.VITE_VAPID_PUBLIC_KEY
const b64 = s => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))) }

export async function activarAvisos(sucursalId) {
  if (hayVapid() && 'serviceWorker' in navigator && 'PushManager' in window) {
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return { ok: false, mensaje: 'No diste el permiso de notificaciones.' }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(import.meta.env.VITE_VAPID_PUBLIC_KEY) })
    const j = sub.toJSON()
    const r = await rpc('ctl_push_registrar', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_sucursal: sucursalId, p_agente: navigator.userAgent, p_simulada: false })
    return r.error ? { ok: false, mensaje: r.error.message } : { ok: true, simulada: false, mensaje: 'Avisos activados.' }
  }
  // Sin llaves: suscripción SIMULADA (identificador de este teléfono; no llega ningún aviso real)
  let id = localStorage.getItem('pf-aud-push-id'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('pf-aud-push-id', id) }
  const r = await rpc('ctl_push_registrar', { p_endpoint: `simulada://${id}`, p_sucursal: sucursalId, p_agente: navigator.userAgent, p_simulada: true })
  return r.error ? { ok: false, mensaje: r.error.message } : { ok: true, simulada: true, mensaje: 'Avisos SIMULADOS: no hay llaves VAPID, así que no llegará ninguna notificación real. Las auditorías remotas se ven al abrir la app (se consulta cada 20 s).' }
}
