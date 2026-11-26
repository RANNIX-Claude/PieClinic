// Envío de la cola al servidor (Etapa 5). Cada tipo de operación llama a la RPC que YA es idempotente por el id del cliente (migraciones 211, 231–233):
// un reenvío no duplica. El id de cada operación es el id de la fila que crea (partida, captura, evidencia); el cierre usa el id local como p_id.
// La hora oficial la pone el servidor; `hora_cliente` es el reloj del teléfono AL CAPTURAR (referencia: una diferencia > 5 min la registra la base).
import { rpc } from '../../src/lib/api'
import { supabase } from '../../src/lib/supabase'
import { BUCKETS } from '../../src/lib/urlFirmada'
import { crearCola } from '../../src/lib/auditoria/pwaCola.js'
import { fusionarServidor, marcarEstado } from '../../src/lib/auditoria/pwaCierreLocal.js'
import { bytesABlob } from '../../src/lib/auditoria/pwaCamara.js'
import { almacenCola, leerCierre, guardarCierre } from './almacen'

const escuchas = new Set()
export const alCambiarCola = fn => { escuchas.add(fn); return () => escuchas.delete(fn) }
const emitir = () => escuchas.forEach(f => { try { f() } catch { /* escucha rota */ } })

const yaExiste = e => !!e && (String(e.statusCode) === '409' || /already exists|duplicate|ya existe/i.test(String(e.message ?? '')))
const rechazoDeDatos = r => (r.data && r.data.ok === false ? { error: { message: r.data.mensaje || r.data.error || 'El servidor no aceptó la captura' } } : r)

async function ejecutar(it, { resolver }) {
  const d = it.datos
  switch (it.tipo) {
    case 'cierre_abrir': {
      const r = await rpc('ctl_cierre_abrir', { p_id: it.id, p_sucursal: d.sucursalId, p_tipo: d.tipo, p_turno: d.turnoId ?? null, p_hora_cliente: it.capturada })
      if (r.error) return r
      const local = await leerCierre(it.id)
      if (local) await guardarCierre(fusionarServidor(local, r.data))   // si el servidor retomó un cierre con capturas, se suman
      return { data: r.data, alias: r.data?.cierre?.id ?? it.id }
    }
    case 'cierre_capturar': {
      const cierre = await resolver(d.cierreId)
      return rechazoDeDatos(await rpc('ctl_cierre_capturar', { p_id: it.id, p_cierre: cierre, p_punto: d.puntoId, p_valor: d.valor ?? null, p_denominaciones: d.denominaciones ?? null, p_hora_cliente: it.capturada }))
    }
    case 'cierre_foto': {
      const cierre = await resolver(d.cierreId)
      const ruta = `${d.organizacionId}/ctl/${d.sucursalId}/${it.id}.jpg`
      const blob = bytesABlob(d.foto)
      const up = await supabase.storage.from(BUCKETS.auditoria).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
      if (up.error && !yaExiste(up.error)) return { error: up.error }
      return rechazoDeDatos(await rpc('ctl_cierre_foto', { p_evidencia_id: it.id, p_cierre: cierre, p_punto: d.puntoId, p_ruta: ruta, p_hash: d.hash, p_bytes: blob.size,
        p_ancho: d.ancho, p_alto: d.alto, p_toma_fija: d.tomaId ?? null, p_hora_cliente: it.capturada }))
    }
    case 'cierre_cerrar': {
      const cierre = await resolver(d.cierreId)
      const r = await rpc('ctl_cierre_cerrar', { p_cierre: cierre, p_con_entrega: d.conEntrega ?? null, p_monto_confirmado: d.montoConfirmado ?? null, p_hora_cliente: it.capturada })
      if (!r.error) { const l = await leerCierre(d.cierreId); if (l) await guardarCierre({ ...marcarEstado(l, r.data?.estado ?? 'cerrado'), folio: r.data?.folio ?? l.folio }) }
      return r
    }
    case 'partida':
      return rechazoDeDatos(await rpc('ctl_capturar_partida', { p_id: it.id, p_sesion: d.sesionId, p_codigo: d.codigo, p_cantidad: d.cantidad, p_precio_etiqueta: d.precioEtiqueta ?? null,
        p_numero_serie: d.serie ?? null, p_folio_sello: d.sello ?? null, p_sello_intacto: d.selloIntacto ?? null, p_nota: d.nota ?? null, p_hora_cliente: it.capturada, p_clasificacion: d.clasificacion ?? null }))
    default:
      return { error: { message: `Operación desconocida: ${it.tipo}` } }
  }
}

export const cola = crearCola({ almacen: almacenCola, ejecutar, alCambiar: emitir })
export const nuevoId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))

/** Sincroniza ya (o respetando la espera de la última falla). Devuelve el resultado de la corrida. */
export async function sincronizarAhora({ forzar = false, usuario = null } = {}) {
  const r = await cola.sincronizar({ forzar, usuario })
  emitir()
  return r
}

let timer = null
/** Mientras la app esté abierta: al volver la red, al volver a primer plano y cada 10 s. (En iPhone no hay sincronización en segundo plano.) */
export function iniciarSincronizacion(usuario) {
  detenerSincronizacion()
  const ir = () => sincronizarAhora({ usuario })
  const alVolver = () => sincronizarAhora({ forzar: true, usuario })
  window.addEventListener('online', alVolver)
  const vis = () => { if (document.visibilityState === 'visible') ir() }
  document.addEventListener('visibilitychange', vis)
  timer = { id: setInterval(ir, 10000), alVolver, vis }
  ir()
}
export function detenerSincronizacion() {
  if (!timer) return
  clearInterval(timer.id); window.removeEventListener('online', timer.alVolver); document.removeEventListener('visibilitychange', timer.vis); timer = null
}
