// Utilidades compartidas por las pantallas del área comercial (agenda, caja, facturación, catálogo, portal).
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, WifiOff, FlaskConical } from 'lucide-react'
import toast from 'react-hot-toast'
import { leer, esVistaInexistente, rpc } from '../../../lib/api'
import { zonaHoraria, offsetZona } from '../../../lib/formato'
import { useApp } from '../../../context/AppContext'

/** Texto legible de un error de Supabase (o de excepción). */
export function textoError(e) {
  if (!e) return ''
  if (e.code === 'SIN_CONEXION') return 'Sin conexión con la base de datos.'
  if (esVistaInexistente(e)) return 'Esta vista aún no está disponible (migración sin aplicar).'
  const m = String(e.message ?? e)
  if (/descuento_requiere_pin/.test(m)) return 'Más del límite de descuento: requiere PIN de Administrador.'
  return m.replace(/^PF\d+:?\s*/, '')
}

/**
 * Lectura de una vista prp_* con React Query. Devuelve { filas, cargando, error, count, refetch }.
 * La sede activa va en la queryKey. `enabled=false` no consulta.
 */
export function useLeer(clave, vista, opts = {}, enabled = true) {
  const { sedeActivaId } = useApp()
  const q = useQuery({
    queryKey: ['comercial', clave, sedeActivaId, JSON.stringify(opts)],
    enabled,
    queryFn: async () => {
      const r = await leer(vista, { sedeId: sedeActivaId, ...opts })
      return r
    },
  })
  return { filas: q.data?.data ?? [], count: q.data?.count ?? null, cargando: q.isLoading, error: q.data?.error ?? q.error ?? null, refetch: q.refetch, fetching: q.isFetching }
}

/** Mensaje de error / sin conexión con el estilo del sistema. */
export function AvisoError({ error, titulo = 'No se pudo cargar' }) {
  if (!error) return null
  const sinCon = error.code === 'SIN_CONEXION'
  const Icono = sinCon ? WifiOff : AlertTriangle
  return (
    <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', borderLeft: '4px solid var(--red)', marginBottom: 12 }}>
      <Icono size={18} color="var(--red)" />
      <div style={{ fontSize: 13 }}><b>{titulo}.</b> {textoError(error)}</div>
    </div>
  )
}

/** Banda visible de integración simulada (Clip, PAC, mensajería): nunca se finge algo real. */
export function BannerSimulado({ texto, compacto }) {
  return (
    <div role="note" style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--bd-a-bg)', color: 'var(--bd-a-fg)', border: '1px solid var(--bd-a-fg)', borderRadius: 8,
      padding: compacto ? '5px 10px' : '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: compacto ? 8 : 12 }}>
      <FlaskConical size={15} /> {texto}
    </div>
  )
}

/** Ejecuta una escritura mostrando toast de éxito/error. Devuelve true si salió bien. */
export async function ejecutar(promesa, ok = 'Guardado') {
  try {
    const r = await promesa
    if (r?.error) { toast.error(textoError(r.error)); return false }
    if (ok) toast.success(ok)
    return true
  } catch (e) { toast.error(textoError(e)); return false }
}

// ── Fechas en la zona de la clínica ─────────────────────────────────────────────────────────────────
const fmtDia = zona => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
/** 'YYYY-MM-DD' (zona de la clínica) de un instante. */
export const diaDe = iso => fmtDia(zonaHoraria()).format(new Date(iso))
/** Minutos desde medianoche (zona de la clínica) de un instante. */
export function minutosDe(iso) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: zonaHoraria(), hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  return Number(p.find(x => x.type === 'hour').value) % 24 * 60 + Number(p.find(x => x.type === 'minute').value)
}
/** ISO con desfase de la clínica a partir de 'YYYY-MM-DD' y minutos del día. */
export function isoDe(dia, minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0'), m = String(minutos % 60).padStart(2, '0')
  return `${dia}T${h}:${m}:00${offsetZona()}`
}
export const hhmmAMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0) }
export const minAHhmm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
export function sumarDias(dia, n) { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** Lunes de la semana de un día. */
export function lunesDe(dia) { const d = new Date(`${dia}T12:00:00Z`); const w = (d.getUTCDay() + 6) % 7; return sumarDias(dia, -w) }
export const rangoDias = (desde, hasta) => [isoDe(desde, 0), isoDe(hasta, 24 * 60 - 1)]
export const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export const etiquetaDia = dia => { const d = new Date(`${dia}T12:00:00Z`); return `${NOMBRE_DIA[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')}` }
export const diaSemanaISO = dia => { const d = new Date(`${dia}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d }

/** Nombre completo de un perfil (podólogo/usuario). */
export const nombrePerfil = p => (p ? [p.nombre, p.apellidos].filter(Boolean).join(' ') : '')

/** Podólogos activos (perfiles) de la sede activa. Si el rol no puede leer `perfiles`, devuelve la lista vacía. */
export function usePodologos() {
  const { sedeActivaId } = useApp()
  const q = useLeer('podologos', 'perfiles', { sedeCol: false, filtros: { rol: ['podologo', 'administrador'], activo: true }, columnas: 'id,nombre,apellidos,rol,sedes,cedula', orden: { columna: 'nombre' } })
  const filas = q.filas.filter(p => !sedeActivaId || !p.sedes?.length || p.sedes.includes(sedeActivaId))
  return { ...q, filas }
}

/** Parámetros de la clínica (organizaciones.parametros). */
export function useParametros() {
  const { organizacion } = useApp()
  return organizacion?.parametros ?? {}
}

export { rpc }
