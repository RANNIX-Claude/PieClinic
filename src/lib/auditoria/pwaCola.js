// Cola de envío de la PWA de Auditoría (Etapa 5, F6.4). PURA: el almacenamiento (IndexedDB en el teléfono, memoria en las pruebas) y el envío
// al servidor se inyectan. Reglas:
//  · Cada operación lleva un `id` generado en el dispositivo: encolar dos veces el mismo id NO duplica, y un reenvío al servidor (que ya la recibió)
//    responde «duplicada/idempotente» y se da por enviada.
//  · Se envía en el ORDEN en que se capturó (abrir cierre → capturas → fotos → cerrar).
//  · Falla de red: se conserva, se reintenta con espera creciente (5 s, 10 s, 20 s… tope 5 min) y se corta la corrida (el orden importa).
//  · Sesión vencida (401/JWT): se corta la corrida SIN contar intento; sigue pendiente hasta volver a entrar.
//  · Rechazo del servidor (regla de negocio): queda «rechazada» CON SU MOTIVO y no se pierde; las operaciones que dependen de ese cierre también.
//  · Nada se descarta solo: la única salida de la cola es que el servidor la acepte.
export const ESPERA_BASE_SEG = 5
export const ESPERA_TOPE_SEG = 300

// Reintentables: red caída Y fallas transitorias del servidor (tiempo de espera de la base por candados, deadlock, 5xx). Un rechazo de regla de negocio (PF4xx) NO lo es.
export const esErrorDeRed = e => !!e && (e.status === 0 || e.status >= 500 || (!e.code && /failed to fetch|network|load failed|sin conexi|fetch/i.test(String(e.message ?? e))) || e.code === 'SIN_CONEXION'
  || ['57014', '40001', '40P01', '55P03', '53300', '08006'].includes(e.code) || /statement timeout|deadlock detected|could not obtain lock/i.test(String(e.message ?? '')))
export const esErrorDeSesion = e => !!e && (['PGRST301', 'PGRST303', 'PF401'].includes(e.code) || e.status === 401 || /jwt (expired|invalid)|sin sesi[oó]n v[aá]lida/i.test(String(e.message ?? '')))
/** Espera antes del siguiente intento tras `intentos` fallas de red. */
export const esperaSeg = intentos => Math.min(ESPERA_TOPE_SEG, ESPERA_BASE_SEG * 2 ** Math.max(0, intentos - 1))

/** Almacén en memoria (pruebas y respaldo si el navegador no tiene IndexedDB). */
export function almacenMemoria() {
  const items = new Map(), alias = new Map()
  return {
    async todos() { return [...items.values()].map(x => structuredClone(x)).sort((a, b) => a.seq - b.seq) },
    async obtener(id) { const x = items.get(id); return x ? structuredClone(x) : null },
    async guardar(it) { items.set(it.id, structuredClone(it)) },
    async quitar(id) { items.delete(id) },
    async alias(id) { return alias.get(id) ?? null },
    async fijarAlias(id, destino) { alias.set(id, destino) },
  }
}

/**
 * @param {object} o
 * @param {object} o.almacen  { todos, obtener, guardar, quitar, alias, fijarAlias }
 * @param {(item, ctx)=>Promise<{data?:any, error?:any, alias?:string}>} o.ejecutar  manda UNA operación al servidor
 */
export function crearCola({ almacen, ejecutar, ahora = () => Date.now(), alCambiar = () => {} }) {
  let enCurso = null

  async function encolar(tipo, datos, { id, usuario = null, capturada = new Date(ahora()).toISOString() } = {}) {
    if (!id) throw new Error('Toda operación de la cola lleva un id generado en el dispositivo.')
    const previo = await almacen.obtener(id)
    if (previo) return { id, repetida: true, item: previo }
    const todos = await almacen.todos()
    const seq = (todos.at(-1)?.seq ?? 0) + 1
    const item = { id, seq, tipo, datos, usuario, capturada, estado: 'pendiente', intentos: 0, error: null, proximo: 0 }
    await almacen.guardar(item); alCambiar()
    return { id, repetida: false, item }
  }

  const lista = () => almacen.todos()
  async function resumen() {
    const t = await almacen.todos()
    return { total: t.length, pendientes: t.filter(x => x.estado === 'pendiente').length, rechazadas: t.filter(x => x.estado === 'rechazada').length }
  }

  async function reintentar(id) {
    const it = await almacen.obtener(id)
    if (it && it.estado === 'rechazada') { await almacen.guardar({ ...it, estado: 'pendiente', error: null, proximo: 0 }); alCambiar() }
  }

  async function _correr({ forzar, usuario }) {
    const res = { enviadas: [], rechazadas: [], sinRed: false, sinSesion: false, pendientes: 0 }
    const cierresRechazados = new Set()
    const ctx = { resolver: async id => (await almacen.alias(id)) ?? id }
    for (const it of await almacen.todos()) {
      if (usuario && it.usuario && it.usuario !== usuario) continue
      const cid = it.datos?.cierreId ?? (it.tipo === 'cierre_abrir' ? it.id : null)
      if (it.estado === 'rechazada') { if (cid) cierresRechazados.add(cid); continue }
      if (!forzar && it.proximo > ahora()) { res.sinRed = true; break }   // sigue la espera de la falla anterior: el orden obliga a esperar
      if (cid && cierresRechazados.has(cid) && it.tipo !== 'cierre_abrir') {
        await almacen.guardar({ ...it, estado: 'rechazada', error: 'Depende de un cierre que el servidor rechazó.' }); res.rechazadas.push(it.id); continue
      }
      let r
      try { r = await ejecutar(it, ctx) } catch (e) { r = { error: e } }
      if (!r?.error) {
        if (r?.alias && r.alias !== it.id) await almacen.fijarAlias(it.id, r.alias)
        await almacen.quitar(it.id); res.enviadas.push({ id: it.id, tipo: it.tipo, respuesta: r?.data ?? null }); alCambiar(); continue
      }
      if (esErrorDeSesion(r.error)) { res.sinSesion = true; break }
      if (esErrorDeRed(r.error)) {
        const n = it.intentos + 1
        await almacen.guardar({ ...it, intentos: n, error: 'Sin conexión', proximo: ahora() + esperaSeg(n) * 1000 }); res.sinRed = true; alCambiar(); break
      }
      await almacen.guardar({ ...it, estado: 'rechazada', intentos: it.intentos + 1, error: String(r.error.message ?? r.error) })
      res.rechazadas.push(it.id); if (cid) cierresRechazados.add(cid); alCambiar()
    }
    res.pendientes = (await almacen.todos()).filter(x => x.estado === 'pendiente').length
    return res
  }

  /** Una sola corrida a la vez (dos eventos «online» seguidos no mandan en paralelo). */
  function sincronizar({ forzar = false, usuario = null } = {}) {
    if (enCurso) return enCurso
    enCurso = _correr({ forzar, usuario }).finally(() => { enCurso = null })
    return enCurso
  }

  return { encolar, sincronizar, reintentar, lista, resumen }
}

/** Texto del aviso explícito de F6.4 (en iPhone no hay sincronización en segundo plano). */
export function avisoPendientes(n, { enLinea = true, ios = false } = {}) {
  if (!n) return null
  const cuantas = n === 1 ? '1 captura pendiente de enviar' : `${n} capturas pendientes de enviar`
  if (!enLinea) return `${cuantas}. Sin señal: se enviarán solas al volver; no cierres sesión.`
  return `${cuantas}, mantén la app abierta un momento${ios ? ' (en iPhone no se envía en segundo plano)' : ''}.`
}
