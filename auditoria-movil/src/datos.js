// Copias para operar sin conexión (plantillas del cierre) y lecturas «mis pendientes». Nada de lo que se guarda aquí lleva esperado ni diferencia.
import { rpc } from '../../src/lib/api'
import { guardarMeta, leerMeta } from './almacen'

export const TIPOS = ['apertura', 'turno', 'dia', 'semanal']
const clave = (suc, tipo) => `plantilla:${suc}:${tipo}`

/** Con señal: pide la plantilla al servidor y la guarda. Sin señal (o si falla): usa la última copia. */
export async function plantillaDeCierre(sucursalId, tipo) {
  if (navigator.onLine !== false) {
    const r = await rpc('ctl_cierre_plantilla', { p_sucursal: sucursalId, p_tipo: tipo })
    if (!r.error && r.data) { await guardarMeta(clave(sucursalId, tipo), { ...r.data, guardada: Date.now() }); return { plantilla: r.data, deCopia: false } }
    if (r.error && !/failed to fetch|network|sin conexi/i.test(r.error.message)) return { error: r.error.message }
  }
  const copia = await leerMeta(clave(sucursalId, tipo))
  return copia ? { plantilla: copia, deCopia: true } : { error: 'Sin señal y sin una copia de este cierre. Conéctate una vez para preparar el teléfono.' }
}

/** Con la app abierta y señal: deja listas las cuatro plantillas (el cierre se completa luego sin internet). */
export async function precargar(sucursalId) { for (const t of TIPOS) await plantillaDeCierre(sucursalId, t) }

export const pendientesServidor = sucursalId => rpc('ctl_pwa_pendientes', { p_sucursal: sucursalId })
