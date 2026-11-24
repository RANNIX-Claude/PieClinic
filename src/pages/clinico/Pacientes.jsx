import { useMemo, useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { UserPlus, Users, FileWarning, ShieldAlert, Baby } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { useConfirmacion } from '../../components/ui/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { leer, contarFilas, rpc, actualizar, esVistaInexistente } from '../../lib/api'
import { fecha, telefono } from '../../lib/formato'
import { claveDuplicado, coincidencia } from '../../lib/clinico/pacientes'
import { fusionDeshacible } from '../../lib/clinico/inmutabilidad'
import { useAccion, mensajeError, Aviso, Seccion } from './componentes/comunes'

const COLUMNAS_LISTA = 'id,numero_expediente,nombre,apellido_paterno,apellido_materno,nombre_completo,fecha_nacimiento,edad,es_menor,telefono_celular,email,estado,sede_registro_id,alta_rapida,aviso_privacidad_firmado,datos_salud_firmado,diabetes,homonimo_confirmado,created_at'

function useDebounce(v, ms = 350) {
  const [x, setX] = useState(v)
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t) }, [v, ms])
  return x
}

export default function Pacientes() {
  const nav = useNavigate()
  const { sedes, sedeActivaId } = useApp()
  const puedeEditar = usePermiso('pacientes.editar')
  const puedeFusionar = usePermiso('pacientes.fusionar')
  const [tab, setTab] = useState('lista')
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(0)
  const [orden, setOrden] = useState({ columna: 'created_at', asc: false })
  const [filtro, setFiltro] = useState(null) // 'alta_rapida' | 'sin_aviso' | 'menores'
  const texto = useDebounce(buscar)
  const sedePorId = useMemo(() => Object.fromEntries(sedes.map(s => [s.id, s])), [sedes])
  const TAM = 25

  useEffect(() => { setPagina(0) }, [texto, filtro, sedeActivaId])

  const filtros = { estado: ['activo', 'inactivo', 'bloqueado'] }
  if (filtro === 'alta_rapida') filtros.alta_rapida = true
  if (filtro === 'sin_aviso') filtros.aviso_privacidad_firmado = false
  if (filtro === 'menores') filtros.es_menor = true

  const lista = useQuery({
    queryKey: ['clinico', 'pacientes', sedeActivaId, texto, pagina, orden, filtro],
    queryFn: async () => {
      const r = await leer('prp_pacientes', {
        sedeId: sedeActivaId, sedeCol: 'sede_registro_id', filtros, columnas: COLUMNAS_LISTA, contar: true, pagina, tamano: TAM, orden,
        buscar: { columnas: ['nombre_completo', 'numero_expediente', 'telefono_celular', 'email'], texto },
      })
      if (r.error) { if (esVistaInexistente(r.error)) return { filas: [], count: 0, noDisponible: true }; throw r.error }
      return { filas: r.data, count: r.count ?? 0 }
    },
  })
  const kpis = useQuery({
    queryKey: ['clinico', 'pacientes-kpis', sedeActivaId],
    queryFn: async () => {
      const base = { sedeId: sedeActivaId, sedeCol: 'sede_registro_id' }
      const [t, a, s, m] = await Promise.all([
        contarFilas('prp_pacientes', { ...base, filtros: { estado: ['activo', 'inactivo', 'bloqueado'] } }),
        contarFilas('prp_pacientes', { ...base, filtros: { alta_rapida: true, estado: 'activo' } }),
        contarFilas('prp_pacientes', { ...base, filtros: { aviso_privacidad_firmado: false, estado: 'activo' } }),
        contarFilas('prp_pacientes', { ...base, filtros: { es_menor: true, estado: 'activo' } }),
      ])
      return { total: t.count, rapida: a.count, sinAviso: s.count, menores: m.count, error: t.error }
    },
  })
  const k = kpis.data ?? {}

  const columnas = [
    { key: 'numero_expediente', label: 'Expediente', render: p => <b>{p.numero_expediente ?? '—'}</b> },
    { key: 'nombre_completo', label: 'Paciente', render: p => <div><b>{p.nombre_completo}</b>{p.homonimo_confirmado && <span className="bd n" style={{ marginLeft: 6 }}>Homónimo confirmado</span>}</div> },
    { key: 'edad', label: 'Edad', valor: p => p.edad, render: p => (p.edad ?? '—') + (p.es_menor ? ' · menor' : ''), align: 'right' },
    { key: 'fecha_nacimiento', label: 'Nacimiento', render: p => fecha(p.fecha_nacimiento) },
    { key: 'telefono_celular', label: 'Celular', render: p => telefono(p.telefono_celular) },
    { key: 'sede', label: 'Sede de registro', valor: p => sedePorId[p.sede_registro_id]?.nombre ?? '', sortable: false },
    { key: 'ficha', label: 'Ficha', sortable: false, render: p => p.alta_rapida ? <span className="bd a">Alta rápida</span> : <span className="bd v">Completa</span> },
    { key: 'aviso', label: 'Aviso privacidad', sortable: false, render: p => p.aviso_privacidad_firmado ? <span className="bd v">Firmado</span> : <span className="bd r">Pendiente</span> },
    { key: 'estado', label: 'Estado', render: p => <StatusBadge estado={p.estado} /> },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Pacientes" subtitulo="Directorio, búsqueda anti-duplicados y fusión de expedientes"
        acciones={puedeEditar && <Link to="/pacientes/nuevo" className="btn" style={{ textDecoration: 'none' }}><UserPlus size={14} style={{ verticalAlign: -3 }} /> Registrar paciente</Link>} />
      <div className="grid-kpis">
        <KPICard title="Pacientes" value={k.total ?? '—'} icon={Users} loading={kpis.isLoading} onClick={() => setFiltro(null)} activo={!filtro} />
        <KPICard title="Alta rápida (ficha incompleta)" value={k.rapida ?? '—'} icon={FileWarning} color="var(--gold)" loading={kpis.isLoading} subtitle="Deben completarse antes de la 1.ª consulta" onClick={() => setFiltro(f => (f === 'alta_rapida' ? null : 'alta_rapida'))} activo={filtro === 'alta_rapida'} />
        <KPICard title="Sin aviso de privacidad firmado" value={k.sinAviso ?? '—'} icon={ShieldAlert} color="var(--red)" loading={kpis.isLoading} onClick={() => setFiltro(f => (f === 'sin_aviso' ? null : 'sin_aviso'))} activo={filtro === 'sin_aviso'} />
        <KPICard title="Menores de 18 años" value={k.menores ?? '—'} icon={Baby} color="var(--accent2)" loading={kpis.isLoading} onClick={() => setFiltro(f => (f === 'menores' ? null : 'menores'))} activo={filtro === 'menores'} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'lista', label: 'Pacientes' }, { id: 'duplicados', label: 'Posibles duplicados' }, { id: 'fusiones', label: 'Fusiones', oculto: !puedeFusionar }]} />
      {tab === 'lista' && (
        <>
          {lista.data?.noDisponible && <Aviso>La vista de pacientes aún no existe en esta base de datos.</Aviso>}
          <DataTable columnas={columnas} filas={lista.data?.filas ?? []} cargando={lista.isLoading} error={lista.error ? mensajeError(lista.error) : null}
            onFila={p => nav(`/pacientes/${p.id}`)} exportarNombre="pacientes" placeholderBusqueda="Nombre, N.º de expediente, celular o correo…"
            vacio={{ title: 'Sin pacientes', description: buscar ? 'Ninguno coincide con la búsqueda.' : 'Todavía no hay pacientes registrados en esta sede.' }}
            servidor={{ total: lista.data?.count ?? 0, pagina, tamano: TAM, onPagina: setPagina, buscar, onBuscar: setBuscar, onOrden: o => setOrden(o ?? { columna: 'created_at', asc: false }) }} />
        </>
      )}
      {tab === 'duplicados' && <Duplicados puedeFusionar={puedeFusionar} puedeEditar={puedeEditar} sedePorId={sedePorId} />}
      {tab === 'fusiones' && puedeFusionar && <Fusiones />}
    </div>
  )
}

/** Agrupa pacientes activos por nombre completo + fecha de nacimiento (bloquea) o por celular (avisa). */
function Duplicados({ puedeFusionar, puedeEditar, sedePorId }) {
  const { sedeActivaId } = useApp()
  const { ejecutar, ocupado } = useAccion()
  const [fusion, setFusion] = useState(null) // { grupo }
  const q = useQuery({
    queryKey: ['clinico', 'dup-base', sedeActivaId],
    queryFn: async () => {
      const r = await leer('prp_pacientes', { sedeCol: false, filtros: { estado: ['activo', 'inactivo'] }, columnas: 'id,numero_expediente,nombre,apellido_paterno,apellido_materno,nombre_completo,fecha_nacimiento,telefono_celular,sede_registro_id,homonimo_confirmado,estado', limite: 5000, orden: { columna: 'nombre' } })
      if (r.error) throw r.error
      return r.data
    },
  })
  const grupos = useMemo(() => {
    const filas = q.data ?? [], porNombre = new Map(), porTel = new Map()
    for (const p of filas) {
      if (p.fecha_nacimiento) { const c = claveDuplicado(p); porNombre.set(c, [...(porNombre.get(c) ?? []), p]) }
      const t = String(p.telefono_celular ?? '').replace(/\D/g, '').slice(-10)
      if (t.length === 10) porTel.set(t, [...(porTel.get(t) ?? []), p])
    }
    const out = [], usados = new Set()
    for (const [clave, g] of porNombre) if (g.length > 1) { out.push({ tipo: 'bloquea', clave, pacientes: g }); g.forEach(p => usados.add(p.id)) }
    for (const [t, g] of porTel) {
      const libres = g.filter(p => !usados.has(p.id) || g.some(x => coincidencia(p, x) === 'avisa'))
      if (g.length > 1 && !out.some(o => g.every(p => o.pacientes.some(x => x.id === p.id)))) out.push({ tipo: 'avisa', clave: t, pacientes: libres.length > 1 ? libres : g })
    }
    return out
  }, [q.data])

  const noEsMisma = async g => { for (const p of g.pacientes) await actualizar('pacientes', p.id, { homonimo_confirmado: true }) }

  return (
    <>
      <Aviso tipo="warn">Coincidencia por <b>nombre completo + fecha de nacimiento</b> = posible duplicado (se bloquea el alta). El celular compartido solo avisa. Solo Administración combina expedientes y se puede deshacer 30 días (P-006).</Aviso>
      {q.isLoading ? <p>Buscando coincidencias…</p> : q.error ? <Aviso tipo="err">{mensajeError(q.error)}</Aviso> : grupos.length === 0 ? (
        <Seccion titulo="Sin coincidencias">No se detectaron posibles duplicados entre los pacientes activos.</Seccion>
      ) : grupos.map(g => (
        <Seccion key={g.tipo + g.clave} titulo={g.tipo === 'bloquea' ? 'Mismo nombre y fecha de nacimiento' : 'Mismo celular'}
          acciones={<>
            {puedeEditar && g.pacientes.some(p => !p.homonimo_confirmado) && (
              <button type="button" className="btn o sm" disabled={ocupado} onClick={() => ejecutar(() => noEsMisma(g), { ok: 'Marcados como personas distintas', invalidar: ['clinico'] })}>No es la misma persona</button>)}
            {puedeFusionar && g.pacientes.length >= 2 && <button type="button" className="btn sm" onClick={() => setFusion({ grupo: g })}>Fusionar…</button>}
          </>}>
          <table><thead><tr><th>Expediente</th><th>Nombre</th><th>Nacimiento</th><th>Celular</th><th>Sede</th><th></th></tr></thead>
            <tbody>{g.pacientes.map(p => (
              <tr key={p.id}><td>{p.numero_expediente}</td><td><Link to={`/pacientes/${p.id}`}>{p.nombre_completo}</Link></td><td>{fecha(p.fecha_nacimiento)}</td><td>{telefono(p.telefono_celular)}</td>
                <td>{sedePorId[p.sede_registro_id]?.nombre ?? '—'}</td><td>{p.homonimo_confirmado && <span className="bd n">Homónimo confirmado</span>}</td></tr>))}</tbody></table>
        </Seccion>
      ))}
      {fusion && <ModalFusion grupo={fusion.grupo} onClose={() => setFusion(null)} />}
    </>
  )
}

function ModalFusion({ grupo, onClose }) {
  const { ejecutar, ocupado } = useAccion()
  const [destino, setDestino] = useState(grupo.pacientes[0].id)
  const [origen, setOrigen] = useState(grupo.pacientes[1].id)
  const [motivo, setMotivo] = useState('')
  const valido = destino !== origen && motivo.trim().length >= 5
  const op = grupo.pacientes.map(p => ({ value: p.id, label: `${p.numero_expediente} · ${p.nombre_completo}` }))
  async function fusionar() {
    const r = await ejecutar(() => rpc('fusionar_pacientes', { p_origen: origen, p_destino: destino, p_motivo: motivo.trim() }), { ok: 'Expedientes combinados. Puedes deshacerlo durante 30 días.', invalidar: ['clinico'] })
    if (r) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Fusionar expedientes" size="md"
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!valido || ocupado} onClick={fusionar}>{ocupado ? 'Fusionando…' : 'Fusionar'}</button></>}>
      <Aviso>El expediente de <b>origen</b> pasa a «fusionado» y sus consultas, fotos y documentos quedan en el de <b>destino</b>. Queda en bitácora y se puede deshacer 30 días.</Aviso>
      <div className="row">
        <FormField label="Conservar (destino)" as="select" options={op} value={destino} onChange={e => setDestino(e.target.value)} />
        <FormField label="Absorber (origen)" as="select" options={op} value={origen} onChange={e => setOrigen(e.target.value)} />
      </div>
      <FormField label="Motivo de la fusión" required as="textarea" value={motivo} onChange={e => setMotivo(e.target.value)} hint="Mínimo 5 caracteres." error={destino === origen ? 'Elige expedientes distintos.' : undefined} />
    </Modal>
  )
}

function Fusiones() {
  const { ejecutar, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const q = useQuery({
    queryKey: ['clinico', 'fusiones'],
    queryFn: async () => {
      const f = await leer('paciente_fusiones', { sedeCol: false, orden: { columna: 'realizada_en', asc: false }, limite: 200 })
      if (f.error) throw f.error
      const ids = [...new Set(f.data.flatMap(x => [x.paciente_origen_id, x.paciente_destino_id]))]
      const p = ids.length ? await leer('prp_pacientes', { sedeCol: false, filtros: { id: ids }, columnas: 'id,numero_expediente,nombre_completo', limite: 400 }) : { data: [] }
      const mapa = Object.fromEntries((p.data ?? []).map(x => [x.id, x]))
      return f.data.map(x => ({ ...x, origen: mapa[x.paciente_origen_id], destino: mapa[x.paciente_destino_id] }))
    },
  })
  async function deshacer(f) {
    if (!(await confirmar({ titulo: 'Deshacer fusión', mensaje: `Se restaura el expediente ${f.origen?.numero_expediente ?? ''} como paciente independiente.`, textoConfirmar: 'Deshacer fusión' }))) return
    await ejecutar(() => rpc('deshacer_fusion', { p_fusion: f.id }), { ok: 'Fusión deshecha', invalidar: ['clinico'] })
  }
  const cols = [
    { key: 'realizada_en', label: 'Fecha', render: f => fecha(f.realizada_en) },
    { key: 'o', label: 'Origen (absorbido)', valor: f => f.origen?.nombre_completo ?? f.paciente_origen_id, render: f => <>{f.origen?.numero_expediente} · {f.origen?.nombre_completo}</> },
    { key: 'd', label: 'Destino (conservado)', valor: f => f.destino?.nombre_completo ?? '', render: f => <>{f.destino?.numero_expediente} · {f.destino?.nombre_completo}</> },
    { key: 'motivo', label: 'Motivo' },
    { key: 'lim', label: 'Se puede deshacer hasta', render: f => fecha(f.limite_deshacer) },
    { key: 'est', label: 'Estado', sortable: false, render: f => f.deshecha_en ? <span className="bd n">Deshecha {fecha(f.deshecha_en)}</span> : fusionDeshacible(f) ? <span className="bd a">Reversible</span> : <span className="bd v">Definitiva</span> },
    { key: 'acc', label: '', sortable: false, exportar: false, render: f => fusionDeshacible(f) && <button type="button" className="btn o sm" disabled={ocupado} onClick={() => deshacer(f)}>Deshacer</button> },
  ]
  return <><DataTable columnas={cols} filas={q.data ?? []} cargando={q.isLoading} error={q.error ? mensajeError(q.error) : null} exportarNombre="fusiones" vacio={{ title: 'Sin fusiones', description: 'Aún no se han combinado expedientes.' }} />{dialogo}</>
}
