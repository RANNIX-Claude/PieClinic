// Registro de errores de la aplicación (Utilerías · Salud del sistema). Captura errores de ventana, promesas sin atrapar y
// los que atrapa el LimiteError de App.jsx, y los manda a la RPC piefirme.registrar_error. Nunca lanza ni bloquea la app:
// si no hay sesión, no hay conexión o la migración 062 no está aplicada, simplemente no registra.
import { supabase } from './supabase'

const vistos = new Map()   // mensaje → última vez (evita inundar la bitácora con el mismo error)
let instalado = false

export async function registrarError({ ruta, mensaje, detalle, origen = 'app' }) {
  try {
    const m = String(mensaje ?? 'sin mensaje').slice(0, 1000)
    const ahora = Date.now()
    if (ahora - (vistos.get(m) ?? 0) < 60_000) return
    vistos.set(m, ahora)
    await supabase.rpc('registrar_error', {
      p_ruta: ruta ?? window.location.pathname, p_mensaje: m, p_detalle: detalle ? String(detalle).slice(0, 4000) : null,
      p_origen: origen, p_agente: navigator.userAgent,
    })
  } catch { /* el registro de errores jamás debe causar otro error */ }
}

export function instalarCapturaErrores() {
  if (instalado) return
  instalado = true
  window.addEventListener('error', e => registrarError({ mensaje: e.message, detalle: `${e.filename}:${e.lineno}:${e.colno}\n${e.error?.stack ?? ''}` }))
  window.addEventListener('unhandledrejection', e => registrarError({ mensaje: e.reason?.message ?? String(e.reason), detalle: e.reason?.stack, origen: 'api' }))
}
