// Almacén local del dispositivo (IndexedDB) para operar la caja sin internet.
//  · «snapshot»: copia de lo que Caja necesita ver sin red (catálogo de servicios y productos, características, turno, pacientes mínimos).
//    Se borra al cerrar sesión (P-050: nunca queda información de pacientes en un equipo sin sesión).
//  · «cola»: tickets cobrados sin conexión que esperan sincronizarse. NO se borra al cerrar sesión: es dinero ya cobrado al cliente.
const BD = 'pf-offline'
const VERSION = 1

function abrir() {
  return new Promise((ok, mal) => {
    if (typeof indexedDB === 'undefined') return mal(new Error('Este navegador no tiene almacenamiento local'))
    const r = indexedDB.open(BD, VERSION)
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('snapshot'); d.createObjectStore('cola', { keyPath: 'cliente_uuid' }) }
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

export const guardarSnapshot = (clave, valor) => tx('snapshot', 'readwrite', s => s.put({ valor, guardado: Date.now() }, clave)).catch(() => {})
export const leerSnapshot = clave => tx('snapshot', 'readonly', s => s.get(clave)).then(r => r?.valor ?? null).catch(() => null)
export const borrarSnapshots = () => tx('snapshot', 'readwrite', s => s.clear()).catch(() => {})

export const guardarEnCola = ticket => tx('cola', 'readwrite', s => s.put(ticket))
export const ticketsEnCola = () => tx('cola', 'readonly', s => s.getAll()).then(r => (r ?? []).sort((a, b) => a.creado_en.localeCompare(b.creado_en))).catch(() => [])
export const quitarDeCola = uuid => tx('cola', 'readwrite', s => s.delete(uuid))

/** Número consecutivo del folio provisional por sede (OFF-{clave}-{NNNN}), que no se repite aunque se cierre el navegador. */
export async function siguienteProvisional(sedeId) {
  const clave = `contador:${sedeId}`
  const n = ((await leerSnapshotPersistente(clave)) ?? 0) + 1
  await guardarPersistente(clave, n)
  return n
}
// El contador no debe borrarse con los snapshots: vive en localStorage.
const leerSnapshotPersistente = async clave => { try { const v = localStorage.getItem(`pf.off.${clave}`); return v == null ? null : Number(v) } catch { return null } }
const guardarPersistente = async (clave, v) => { try { localStorage.setItem(`pf.off.${clave}`, String(v)) } catch { /* sin almacenamiento */ } }
