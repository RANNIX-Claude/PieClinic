// Cola de tickets cobrados sin conexión y su sincronización con el servidor.
// Reglas (decididas 2026-11-25, revisables): se cobra sin internet SOLO efectivo, tarjeta y transferencia de servicios y productos de catálogo;
// no hay descuentos que pidan PIN, anticipos, gift cards, planes ni citas (necesitan al servidor). Cada ticket lleva un cliente_uuid único:
// el servidor no lo duplica aunque la red se corte a la mitad. Se sincroniza en el orden en que se cobraron y el folio oficial lo da el servidor.
import { rpc } from '../api'
import { guardarEnCola, ticketsEnCola, quitarDeCola, siguienteProvisional } from './almacen'

export const nuevoUuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) }))

/** Folio provisional que se imprime offline: OFF-{clave de sede}-{NNNN}. */
export async function folioProvisional(sede) {
  const n = await siguienteProvisional(sede.id)
  return `OFF-${(sede.clave ?? sede.nombre ?? 'SED').toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)}-${String(n).padStart(4, '0')}`
}

export async function encolarTicket(ticket) {
  await guardarEnCola({ ...ticket, estado: 'pendiente', error: null, intentos: 0 })
}
export const pendientes = () => ticketsEnCola()

const esErrorDeRed = e => !e || e.status === 0 || /failed to fetch|network|load failed|sin conexi/i.test(String(e.message ?? e))

/** Envía a Supabase los tickets pendientes del usuario, del más antiguo al más nuevo. Se detiene ante una falla de red. */
export async function sincronizarCola(userId) {
  const lista = (await ticketsEnCola()).filter(t => t.user_id === userId)
  const res = { sincronizados: [], conError: [], faltan: 0, sinRed: false }
  for (const t of lista) {
    if (t.estado === 'error') { res.conError.push(t); continue }
    const { data, error } = await rpc('sincronizar_ticket_offline', { p_payload: t.payload })
    if (error) {
      if (esErrorDeRed(error)) { res.sinRed = true; res.faltan = lista.length - res.sincronizados.length - res.conError.length; break }
      // Rechazo del servidor (p. ej. sin turno abierto, sin existencia): se conserva con su motivo para que alguien lo resuelva; no se pierde.
      await guardarEnCola({ ...t, estado: 'error', error: error.message ?? String(error), intentos: (t.intentos ?? 0) + 1 })
      res.conError.push({ ...t, error: error.message })
      continue
    }
    await quitarDeCola(t.cliente_uuid)
    res.sincronizados.push({ ...t, folio_oficial: data?.folio, ya_existia: data?.ya_existia === true })
  }
  return res
}

/** Vuelve a intentar un ticket que el servidor rechazó (después de abrir turno, ajustar inventario, etc.). */
export async function reintentar(uuid) {
  const t = (await ticketsEnCola()).find(x => x.cliente_uuid === uuid)
  if (t) await guardarEnCola({ ...t, estado: 'pendiente', error: null })
}
