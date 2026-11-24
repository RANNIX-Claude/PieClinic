// Bitácora — mockup 43; clon de IRP Bitacora.jsx: accesos y cambios, filtros, detalle antes/después, exportar.
// Lee la tabla public.bitacora (RLS: solo administrador). Registra su propia exportación (bitacoraExportar).
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../../context/AppContext'
import { leer } from '../../lib/api'
import { fechaHora, hoyISO, offsetZona } from '../../lib/formato'
import { sumarDias } from '../../lib/finanzas/semana.js'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import StatusBadge from '../../components/ui/StatusBadge'
import { Chips, BotonesExportar, TablaImprimible } from './componentes/comunes.jsx'

const ACCIONES = { insertar: 'Registro creado', actualizar: 'Registro editado', borrar: 'Registro eliminado', ver: 'Vista de pantalla', imprimir: 'Impresión', exportar: 'Exportación', iniciar_sesion: 'Inicio de sesión' }
const VARIANTE = { insertar: 'v', actualizar: 'b', borrar: 'r', ver: 'n', imprimir: 'm', exportar: 'm', iniciar_sesion: 'a' }
const ENTIDADES_EXPEDIENTE = /paciente|expediente|consulta|nota|foto|exploracion|diagnostic|plan_trat|plantilla_orto|pie_diab|historia/i
const modulo = e => String(e ?? '').split('_')[0].toUpperCase()

/** Resume el detalle jsonb en una línea legible. */
function descripcion(b) {
  const d = b.detalle ?? {}
  if (d.descripcion) return d.descripcion
  if (d.antes !== undefined || d.despues !== undefined) return `Cambio: ${JSON.stringify(d.antes ?? null)} → ${JSON.stringify(d.despues ?? null)}`
  if (d.titulo) return d.titulo
  const k = Object.keys(d).slice(0, 4).map(x => `${x}: ${typeof d[x] === 'object' ? JSON.stringify(d[x]) : d[x]}`).join(' · ')
  return k || '—'
}

export default function Bitacora() {
  const { sedes } = useApp()
  const [desde, setDesde] = useState(sumarDias(hoyISO(), -6))
  const [hasta, setHasta] = useState(hoyISO())
  const [entidad, setEntidad] = useState('')
  const [accion, setAccion] = useState('')
  const [usuario, setUsuario] = useState('')
  const [sede, setSede] = useState('')
  const [detalle, setDetalle] = useState(null)
  const off = offsetZona()

  const qPerfiles = useQuery({ queryKey: ['finanzas', 'bitacora', 'perfiles'], queryFn: async () => (await leer('perfiles', { sedeCol: false, columnas: 'id,nombre,apellidos,rol', limite: 500 })).data })
  const nombreDe = id => { const p = qPerfiles.data?.find(x => x.id === id); return p ? `${p.nombre} ${p.apellidos ?? ''}`.trim() : id ? 'Usuario eliminado' : 'Sistema' }

  const q = useQuery({
    queryKey: ['finanzas', 'bitacora', desde, hasta, accion, usuario, sede],
    queryFn: async () => {
      const r = await leer('bitacora', { sedeCol: false, filtros: { created_at: { gte: `${desde}T00:00:00${off}`, lte: `${hasta}T23:59:59.999${off}` }, accion, usuario_id: usuario, sede_id: sede }, orden: [{ columna: 'created_at', asc: false }], limite: 3000 })
      if (r.error) throw new Error(r.error.message)
      return r.data
    },
  })
  const todas = q.data ?? []
  const entidades = useMemo(() => [...new Set(todas.map(b => b.entidad))].sort(), [todas])
  const filas = useMemo(() => (entidad ? todas.filter(b => b.entidad === entidad) : todas).map(b => ({ ...b, _usuario: nombreDe(b.usuario_id), _sede: sedes.find(s => s.id === b.sede_id)?.nombre ?? '—', _desc: descripcion(b), _mod: modulo(b.entidad), _accion: ACCIONES[b.accion] ?? b.accion })), [todas, entidad, sedes, qPerfiles.data]) // eslint-disable-line
  const expediente = todas.filter(b => b.accion === 'ver' && ENTIDADES_EXPEDIENTE.test(b.entidad))
  const cambiosExp = todas.filter(b => ['insertar', 'actualizar', 'borrar'].includes(b.accion) && ENTIDADES_EXPEDIENTE.test(b.entidad))
  const fallidos = todas.filter(b => b.accion === 'iniciar_sesion' && (b.detalle?.exito === false || b.detalle?.resultado === 'fallido'))
  const pacientesVistos = new Set(expediente.map(b => b.entidad_id).filter(Boolean)).size
  const conteoAccion = a => todas.filter(b => b.accion === a).length

  const cols = [
    { key: 'created_at', label: 'Fecha y hora', render: b => fechaHora(b.created_at), valor: b => b.created_at },
    { key: '_mod', label: 'Módulo', render: b => <span className="bd m">{b._mod}</span>, filtro: true },
    { key: '_accion', label: 'Acción', render: b => <span className={`bd ${VARIANTE[b.accion] ?? 'n'}`}>{b._accion}</span>, filtro: true },
    { key: '_desc', label: 'Descripción', render: b => <span style={{ fontSize: 12 }}>{b._desc.length > 110 ? `${b._desc.slice(0, 110)}…` : b._desc}</span> },
    { key: 'entidad', label: 'Entidad', render: b => `${b.entidad}${b.entidad_id ? ` #${String(b.entidad_id).slice(0, 8)}` : ''}`, valor: b => `${b.entidad} ${b.entidad_id ?? ''}` },
    { key: '_usuario', label: 'Usuario', filtro: true },
    { key: '_sede', label: 'Sede' },
  ]
  const exportCols = [{ key: 'created_at', label: 'Fecha y hora' }, { key: '_mod', label: 'Módulo' }, { key: '_accion', label: 'Acción' }, { key: '_desc', label: 'Descripción' }, { key: 'entidad', label: 'Entidad' }, { key: 'entidad_id', label: 'Id entidad' }, { key: '_usuario', label: 'Usuario' }, { key: '_sede', label: 'Sede' }]

  return (
    <div className="pagina">
      <PageHeader titulo="Bitácora" subtitulo="Accesos y cambios del sistema, incluidos accesos al expediente clínico"
        acciones={<BotonesExportar nombre="bitacora" titulo={`Bitácora ${desde} a ${hasta}`} entidad="bitacora" deshabilitado={!filas.length}
          hojas={[{ nombre: 'Bitácora', columnas: exportCols, filas: filas.map(f => ({ ...f, created_at: fechaHora(f.created_at) })) }]}>
          <TablaImprimible columnas={[{ key: 'f', label: 'Fecha' }, { key: '_mod', label: 'Módulo' }, { key: '_accion', label: 'Acción' }, { key: '_desc', label: 'Descripción' }, { key: '_usuario', label: 'Usuario' }]}
            filas={filas.slice(0, 500).map(f => ({ ...f, f: fechaHora(f.created_at) }))} />
        </BotonesExportar>} />

      <div className="toolbar">
        <label style={{ fontSize: 12 }}>Desde <input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
        <label style={{ fontSize: 12 }}>Hasta <input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} /></label>
        <select value={entidad} onChange={e => setEntidad(e.target.value)} aria-label="Módulo / entidad"><option value="">Todos los módulos</option>{entidades.map(e => <option key={e} value={e}>{e}</option>)}</select>
        <select value={accion} onChange={e => setAccion(e.target.value)} aria-label="Acción"><option value="">Todas las acciones</option>{Object.entries(ACCIONES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={usuario} onChange={e => setUsuario(e.target.value)} aria-label="Usuario"><option value="">Todos los usuarios</option>{(qPerfiles.data ?? []).map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellidos ?? ''}</option>)}</select>
        <select value={sede} onChange={e => setSede(e.target.value)} aria-label="Sede"><option value="">Todas las sedes</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
      </div>

      <div className="grid-kpis" style={{ marginTop: 12 }}>
        <KPICard title="Eventos del periodo" value={todas.length} subtitle={`${desde} a ${hasta}${todas.length >= 3000 ? ' (primeros 3,000)' : ''}`} color="var(--accent)" loading={q.isLoading} />
        <KPICard title="Accesos al expediente" value={expediente.length} subtitle={`de ${pacientesVistos} registros distintos`} color="var(--green)" loading={q.isLoading} onClick={() => setAccion(accion === 'ver' ? '' : 'ver')} activo={accion === 'ver'} />
        <KPICard title="Cambios en expediente" value={cambiosExp.length} subtitle="Altas, ediciones y bajas" color="var(--gold)" loading={q.isLoading} />
        <KPICard title="Inicios de sesión fallidos" value={fallidos.length} subtitle={`${conteoAccion('iniciar_sesion')} inicios de sesión en total`} color="var(--red)" loading={q.isLoading} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <Chips valor={accion} onChange={setAccion} opciones={[{ value: '', label: 'Todos', n: todas.length }, ...Object.entries(ACCIONES).map(([v, l]) => ({ value: v, label: l, n: conteoAccion(v) }))]} />
      </div>
      <DataTable columnas={cols} filas={filas} cargando={q.isLoading} error={q.error} onFila={setDetalle} tamanoPagina={50} placeholderBusqueda="Buscar descripción, entidad o usuario…"
        vacio={{ title: 'Sin eventos', description: 'No hay eventos con esos filtros en el rango de fechas.' }} />

      <Modal open={!!detalle} onClose={() => setDetalle(null)} size="wide" title="Detalle del evento" footer={<button type="button" className="btn" onClick={() => setDetalle(null)}>Cerrar</button>}>
        {detalle && (
          <>
            <div className="grid2" style={{ fontSize: 13, marginBottom: 10 }}>
              <div><b>Fecha:</b> {fechaHora(detalle.created_at)}</div><div><b>Acción:</b> <StatusBadge estado={detalle.accion} label={detalle._accion} variante={VARIANTE[detalle.accion]} /></div>
              <div><b>Usuario:</b> {detalle._usuario}</div><div><b>Sede:</b> {detalle._sede}</div>
              <div><b>Entidad:</b> {detalle.entidad}</div><div><b>Id:</b> {detalle.entidad_id ?? '—'}</div>
            </div>
            {(detalle.detalle?.antes !== undefined || detalle.detalle?.despues !== undefined) && (
              <div className="grid2" style={{ marginBottom: 10 }}>
                <div className="card"><h3>Antes</h3><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{JSON.stringify(detalle.detalle.antes ?? null, null, 2)}</pre></div>
                <div className="card"><h3>Después</h3><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{JSON.stringify(detalle.detalle.despues ?? null, null, 2)}</pre></div>
              </div>
            )}
            <div className="card"><h3>Detalle completo</h3><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0, maxHeight: 280, overflow: 'auto' }}>{JSON.stringify(detalle.detalle ?? {}, null, 2)}</pre></div>
          </>
        )}
      </Modal>
    </div>
  )
}
