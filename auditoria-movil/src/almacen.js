// Almacén local de la PWA de Auditoría (IndexedDB `pf-aud-movil`; distinto de `pf-offline` de la Caja: mismo origen, otra base, sin choques de versión).
//  · cola      : operaciones por enviar (ver lib/auditoria/pwaCola.js). NO se borra al cerrar sesión: es evidencia ya capturada.
//  · alias     : id local de un cierre → id que le dio el servidor (si lo retomó).
//  · cierres   : cierres guardados en el dispositivo (retoma y sin conexión).
//  · meta      : copias para operar sin red (plantillas de cierre, perfil, sedes) y la sesión local. Se limpia al cerrar sesión, salvo lo anterior.
const BD = 'pf-aud-movil'
const VERSION = 1

function abrir() {
  return new Promise((ok, mal) => {
    if (typeof indexedDB === 'undefined') return mal(new Error('Este navegador no tiene almacenamiento local'))
    const r = indexedDB.open(BD, VERSION)
    r.onupgradeneeded = () => {
      const d = r.result
      d.createObjectStore('cola', { keyPath: 'id' }); d.createObjectStore('alias'); d.createObjectStore('cierres', { keyPath: 'id' }); d.createObjectStore('meta')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => mal(r.error)
  })
}
const tx = async (store, modo, fn) => {
  const db = await abrir()
  return new Promise((ok, mal) => {
    const t = db.transaction(store, modo)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => { db.close(); ok(req?.result) }
    t.onerror = () => { db.close(); mal(t.error) }
    t.onabort = () => { db.close(); mal(t.error) }
  })
}

/** Almacén de la cola con la forma que pide crearCola. */
export const almacenCola = {
  todos: () => tx('cola', 'readonly', s => s.getAll()).then(r => (r ?? []).sort((a, b) => a.seq - b.seq)),
  obtener: id => tx('cola', 'readonly', s => s.get(id)).then(r => r ?? null),
  guardar: it => tx('cola', 'readwrite', s => s.put(it)),
  quitar: id => tx('cola', 'readwrite', s => s.delete(id)),
  alias: id => tx('alias', 'readonly', s => s.get(id)).then(r => r ?? null),
  fijarAlias: (id, destino) => tx('alias', 'readwrite', s => s.put(destino, id)),
}

export const guardarCierre = c => tx('cierres', 'readwrite', s => s.put(c))
export const leerCierre = id => tx('cierres', 'readonly', s => s.get(id)).then(r => r ?? null).catch(() => null)
export const cierresLocales = () => tx('cierres', 'readonly', s => s.getAll()).then(r => r ?? []).catch(() => [])
export const quitarCierre = id => tx('cierres', 'readwrite', s => s.delete(id))

export const guardarMeta = (clave, valor) => tx('meta', 'readwrite', s => s.put(valor, clave)).catch(() => {})
export const leerMeta = clave => tx('meta', 'readonly', s => s.get(clave)).then(r => r ?? null).catch(() => null)
export const borrarMeta = clave => tx('meta', 'readwrite', s => s.delete(clave)).catch(() => {})
export const limpiarMeta = () => tx('meta', 'readwrite', s => s.clear()).catch(() => {})
