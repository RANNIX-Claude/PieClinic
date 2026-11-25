// Piezas compartidas por las pantallas del módulo clínico (solo se importan desde pages/clinico).
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, Search, ArrowLeft, Info, FlaskConical } from 'lucide-react'
import { leer, esVistaInexistente } from '../../../lib/api'
import { useApp } from '../../../context/AppContext'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'
import { nombreCompletoPaciente } from '../../../lib/clinico/impresos'
import { calcularEdad } from '../../../lib/clinico/edad'

/** '' → null y recorta textos, para insertar en la BD sin cadenas vacías. */
export const limpiar = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v]))
export const num = v => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))
/**
 * Sede en la que se registra un documento clínico nuevo: la sede activa; si el usuario trabaja en «todas mis sedes», la sede de registro del paciente
 * SOLO si es una de las suyas; si no, la primera suya. (Antes se tomaba la del paciente sin revisar: un podólogo de una sola sede que abría a un paciente de otra
 * recibía «No tienes permiso» por la política de sede de la BD.)
 */
export const sedeDeRegistro = (sedeActivaId, paciente, sedes) => sedeActivaId ?? ((sedes ?? []).some(s => s.id === paciente?.sede_registro_id) ? paciente.sede_registro_id : sedes?.[0]?.id)
export const mensajeError = e => {
  const m = e?.message || String(e || 'Error desconocido')
  if (e?.code === 'SIN_CONEXION') return m
  if (e?.code === '42501') return 'No tienes permiso para esta acción.'
  if (e?.code === '23505') return 'Ya existe un registro con esos datos.'
  return m
}

/** Lee una vista prp_* con React Query; si la vista aún no existe devuelve `noDisponible`. data siempre es un arreglo. */
export function useVista(clave, vista, opciones = {}, { enabled = true } = {}) {
  const { sedeActivaId } = useApp()
  return useQuery({
    queryKey: ['clinico', clave, sedeActivaId, JSON.stringify(opciones)],
    enabled,
    queryFn: async () => {
      const r = await leer(vista, { sedeId: sedeActivaId, ...opciones })
      if (r.error) {
        if (esVistaInexistente(r.error)) return { filas: [], noDisponible: true, count: 0 }
        throw r.error
      }
      return { filas: r.data, noDisponible: false, count: r.count }
    },
  })
}

/** Estado de carga/error/«vista no disponible» de una consulta. Si todo bien muestra `children`. */
export function EstadoConsulta({ q, vacio, children, compacto }) {
  if (q.isLoading) return <LoadingSpinner compacto={compacto} />
  if (q.error) return <EmptyState compacto={compacto} title="No se pudo cargar" description={mensajeError(q.error)} icon={AlertTriangle} />
  if (q.data?.noDisponible) return <EmptyState compacto={compacto} title="Información aún no disponible" description="La vista de datos todavía no existe en esta base (migración pendiente)." />
  if (vacio && !q.data?.filas?.length) return <EmptyState compacto={compacto} title={vacio.title} description={vacio.description} />
  return children
}

/** Ejecuta una escritura con aviso de éxito/error, bandera de «ocupado» e invalidación de consultas. */
export function useAccion() {
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const ejecutar = async (fn, { ok, invalidar = ['clinico'] } = {}) => {
    setOcupado(true)
    try {
      const r = await fn()
      if (r?.error) throw r.error
      if (ok) toast.success(ok)
      invalidar.forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      return r ?? true
    } catch (e) {
      toast.error(mensajeError(e))
      return null
    } finally { setOcupado(false) }
  }
  return { ejecutar, ocupado }
}

export function Seccion({ titulo, acciones, children, ayuda, style }) {
  return (
    <div className="card" style={{ marginBottom: 14, ...style }}>
      {(titulo || acciones) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, flex: 1 }}>{titulo}</h3>{acciones}
        </div>
      )}
      {ayuda && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{ayuda}</div>}
      {children}
    </div>
  )
}

export function Aviso({ tipo = 'warn', icono: Icono = Info, children, style }) {
  const color = tipo === 'err' ? 'var(--red)' : tipo === 'ok' ? 'var(--green)' : tipo === 'sim' ? 'var(--accent-dark)' : '#7A5200'
  const fondo = tipo === 'err' ? 'var(--bd-r-bg)' : tipo === 'ok' ? 'var(--bd-v-bg)' : tipo === 'sim' ? 'var(--accent-light)' : 'var(--bd-a-bg)'
  return (
    <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 8, background: fondo, color, fontSize: 12.5, marginBottom: 12, ...style }}>
      <Icono size={15} style={{ flexShrink: 0, marginTop: 1 }} /><div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

/** Aviso permanente de adaptador sin llave (nunca fingir que algo real ocurrió). */
export const AvisoSimulado = ({ children }) => <Aviso tipo="sim" icono={FlaskConical}>{children}</Aviso>

/** Sí / No / No sabe */
export function TriEstado({ value, onChange, disabled, opciones = [['si', 'Sí'], ['no', 'No'], ['no_sabe', 'No sabe']] }) {
  return (
    <div className="chip-group" role="radiogroup">
      {opciones.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} className={`chip${value === v ? ' on' : ''}`}
          style={{ padding: '4px 11px' }} onClick={() => onChange(value === v ? null : v)}>{l}</button>
      ))}
    </div>
  )
}

/** Selección múltiple con chips. value: arreglo de valores. */
export function Chips({ options, value = [], onChange, disabled }) {
  const alternar = v => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  return (
    <div className="chip-group">
      {options.map(o => (
        <button key={o.value} type="button" disabled={disabled} aria-pressed={value.includes(o.value)} className={`chip${value.includes(o.value) ? ' on' : ''}`}
          style={{ padding: '4px 11px' }} onClick={() => alternar(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export const Volver = ({ a, children = 'Volver' }) => <Link to={a} className="btn o sm" style={{ textDecoration: 'none' }}><ArrowLeft size={12} style={{ verticalAlign: -2 }} /> {children}</Link>

/** Buscador de paciente por nombre, expediente o celular (vista prp_pacientes). Llama onElegir(paciente). */
export function PacienteBuscador({ onElegir, etiqueta = 'Paciente', seleccionado }) {
  const { sedeActivaId } = useApp()
  const [texto, setTexto] = useState('')
  const buscar = texto.trim().length >= 2
  const q = useQuery({
    queryKey: ['clinico', 'buscar-paciente', texto, sedeActivaId],
    enabled: buscar,
    queryFn: async () => {
      const r = await leer('prp_pacientes', { sedeCol: false, buscar: { columnas: ['nombre_completo', 'numero_expediente', 'telefono_celular', 'apellido_paterno'], texto }, orden: { columna: 'nombre' }, limite: 8, filtros: { estado: ['activo', 'inactivo'], tipo_registro: 'paciente' } })
      if (r.error) throw r.error
      return r.data
    },
  })
  return (
    <div className="field" style={{ position: 'relative' }}>
      <label>{etiqueta}</label>
      {seleccionado ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>{seleccionado.nombre_completo ?? nombreCompletoPaciente(seleccionado)}</b>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{seleccionado.numero_expediente} · {calcularEdad(seleccionado.fecha_nacimiento) ?? '—'} a</span>
          <button type="button" className="btn o sm" onClick={() => onElegir(null)}>Cambiar</button>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nombre, N.º de expediente o celular…" style={{ paddingLeft: 30 }} />
          </div>
          {buscar && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--white)', maxHeight: 240, overflowY: 'auto' }}>
              {q.isLoading && <div style={{ padding: 10, fontSize: 12 }}>Buscando…</div>}
              {q.error && <div style={{ padding: 10, fontSize: 12, color: 'var(--red)' }}>{mensajeError(q.error)}</div>}
              {q.data?.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--muted)' }}>Sin coincidencias.</div>}
              {q.data?.map(p => (
                <button key={p.id} type="button" onClick={() => { onElegir(p); setTexto('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 0, borderBottom: '1px solid var(--row-line)', background: 'none', cursor: 'pointer', color: 'var(--text)' }}>
                  <b>{p.nombre_completo}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>· {p.numero_expediente} · {p.fecha_nacimiento ?? 'sin fecha'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Carga un paciente por id (vista prp_pacientes). */
export function usePaciente(id) {
  return useQuery({
    queryKey: ['clinico', 'paciente', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await leer('prp_pacientes', { sedeCol: false, filtros: { id }, limite: 1 })
      if (r.error) throw r.error
      return r.data[0] ?? null
    },
  })
}

/** Encabezado compacto del paciente (nombre, expediente, edad) para las pantallas hijas. */
export function CabeceraPaciente({ paciente }) {
  if (!paciente) return null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
      <b style={{ fontSize: 15 }}>{paciente.nombre_completo}</b>
      <span className="bd m">{paciente.numero_expediente ?? 'sin N.º de expediente'}</span>
      <span style={{ color: 'var(--muted)' }}>{paciente.edad ?? calcularEdad(paciente.fecha_nacimiento) ?? '—'} años</span>
      {paciente.es_menor && <span className="bd a">Menor de edad</span>}
      {paciente.alta_rapida && <span className="bd a">Alta rápida: ficha incompleta</span>}
    </div>
  )
}
