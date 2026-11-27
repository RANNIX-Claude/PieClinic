// Catálogo de personal (clon del de IRP): fotografía y expediente completo en dos formatos — MOSAICO (tarjetas) y GRID (tabla con todas las columnas).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, LayoutGrid, Table2, FileText, Search, MapPin, Phone, Contact, Briefcase, AlertTriangle } from 'lucide-react'
import DataTable from '../../../../components/ui/DataTable'
import KPICard from '../../../../components/ui/KPICard'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { useApp } from '../../../../context/AppContext'
import { usePermiso } from '../../../../lib/permisos'
import { moneda, fecha, telefono } from '../../../../lib/formato'
import { useVista, Estado, etiquetaPuesto, enmascararClabe, Foto, OBLIGATORIOS, nombreDoc, hoyZona } from '../comun'
import ModalEmpleado from './ModalEmpleado'

export function Medidor({ datos = 0, total = 9, docs = 0, docsTotal = 6 }) {
  const pct = Math.round(((datos + docs) / (total + docsTotal)) * 100)
  const color = pct >= 90 ? 'var(--green)' : pct >= 60 ? 'var(--gold)' : 'var(--red)'
  return (
    <div title={`${datos}/${total} datos · ${docs}/${docsTotal} documentos`} style={{ minWidth: 90 }}>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 4 }}><div style={{ width: `${pct}%`, height: 6, background: color, borderRadius: 4 }} /></div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{pct}% del expediente</div>
    </div>
  )
}

const domicilioTxt = d => [d?.calle, d?.numero_ext && `#${d.numero_ext}`, d?.numero_int && `int. ${d.numero_int}`, d?.colonia, d?.municipio, d?.estado, d?.codigo_postal && `CP ${d.codigo_postal}`].filter(Boolean).join(', ')
const emergenciaTxt = c => (c?.nombre ? `${c.nombre}${c.parentesco ? ` (${c.parentesco})` : ''}${c.telefono ? ` · ${telefono(c.telefono)}` : ''}` : '')
const esquemaTxt = v => (v === 'nomina' ? 'Nómina' : 'Honorarios')
const LS_VISTA = 'pf.rh.vistaPersonal'

function Linea({ k, v, mono }) {
  return <div style={{ display: 'flex', gap: 6, fontSize: 12, lineHeight: 1.45 }}><span style={{ color: 'var(--muted)', minWidth: 78, flexShrink: 0 }}>{k}</span><span style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-word' }}>{v || '—'}</span></div>
}
function Bloque({ icono: I, titulo, children }) {
  return <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}><div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><I size={12} /> {titulo}</div>{children}</div>
}

/** Tarjeta de mosaico con el expediente completo de una persona. */
function TarjetaEmpleado({ e, x, docs, hoyEn, sedesNombre, esAdmin, editar, onAbrir, onEditar }) {
  const tiene = new Set(docs.map(d => d.tipo))
  const vencidos = docs.filter(d => d.vencido).length
  const otras = (e.sedes ?? []).map(id => sedesNombre(id)).filter(Boolean)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: e.estado === 'baja' ? 0.7 : 1 }}>
      <div style={{ height: 52, background: 'linear-gradient(135deg, var(--accent-dark, #5A4080), var(--accent, #7B5EA7))', position: 'relative' }}>
        <span style={{ position: 'absolute', top: 8, right: 10, fontSize: 10, fontWeight: 700, color: 'white', background: 'rgba(255,255,255,.22)', padding: '2px 8px', borderRadius: 10 }}>No. {e.numero_empleado}</span>
        <div style={{ position: 'absolute', bottom: -34, left: 16 }}><Foto nombre={e.nombre_completo} ruta={e.foto_path} size={72} /></div>
      </div>
      <div style={{ padding: '40px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{e.nombre_completo}</div>
          <div style={{ fontSize: 12.5, color: 'var(--accent-dark, #5A4080)', fontWeight: 600 }}>{etiquetaPuesto(e.puesto)}{e.cedula ? ` · Céd. ${e.cedula}` : ''}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
            <StatusBadge estado={e.estado} />
            {e.responsable_de_sede_id && <span className="bd v">Responsable de sucursal</span>}
            {hoyEn && hoyEn.sede_id !== e.sede_id && <span className="bd a" title={hoyEn.motivo ?? ''}>Hoy cubre en {hoyEn.sede_nombre}</span>}
            {e.tiene_sesion && <span className="bd n">Con sesión</span>}
          </div>
        </div>
        <Bloque icono={MapPin} titulo="Sucursal">
          <Linea k="Contrato" v={e.sede_nombre} />
          <Linea k="También en" v={otras.length ? otras.join(', ') : 'Solo la de contrato'} />
          <Linea k="Hoy en" v={hoyEn ? hoyEn.sede_nombre : e.sede_nombre} />
        </Bloque>
        <Bloque icono={Contact} titulo="Identificación">
          <Linea k="RFC" v={e.rfc} mono /><Linea k="CURP" v={e.curp} mono /><Linea k="NSS" v={e.nss} mono />
          <Linea k="Nacimiento" v={e.fecha_nacimiento ? `${fecha(e.fecha_nacimiento)}${e.lugar_nacimiento ? ` · ${e.lugar_nacimiento}` : ''}` : null} />
          <Linea k="Estado civil" v={[e.estado_civil, e.escolaridad].filter(Boolean).join(' · ')} />
        </Bloque>
        <Bloque icono={Phone} titulo="Contacto">
          <Linea k="Celular" v={telefono(e.telefono)} /><Linea k="Fijo" v={telefono(e.telefono_fijo)} /><Linea k="Correo" v={e.email} />
          <Linea k="Domicilio" v={domicilioTxt(e.domicilio)} /><Linea k="Emergencia" v={emergenciaTxt(e.contacto_emergencia)} />
        </Bloque>
        <Bloque icono={Briefcase} titulo="Contrato y pago">
          <Linea k="Esquema" v={`${esquemaTxt(e.esquema_contratacion)}${e.tipo_jornada ? ` · ${e.tipo_jornada}` : ''}`} />
          <Linea k="Ingreso" v={e.fecha_ingreso ? `${fecha(e.fecha_ingreso)}${e.antiguedad_anios != null ? ` · ${e.antiguedad_anios} año(s)` : ''}` : null} />
          {e.fecha_baja && <Linea k="Baja" v={`${fecha(e.fecha_baja)}${e.motivo_baja ? ` · ${e.motivo_baja}` : ''}`} />}
          <Linea k="Supervisor" v={e.supervisor} />
          <Linea k="Sueldo" v={`${moneda(e.salario_periodo)} ${e.periodicidad_pago ?? ''}${Number(e.bono_periodo) ? ` + bono ${moneda(e.bono_periodo)}` : ''}`} />
          <Linea k="Banco" v={e.banco ? `${e.banco} ${enmascararClabe(e.clabe, esAdmin)}` : null} mono />
        </Bloque>
        <Bloque icono={FileText} titulo="Expediente">
          <Medidor datos={x?.datos_presentes} total={x?.datos_total} docs={x?.documentos_presentes} docsTotal={x?.documentos_total} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {OBLIGATORIOS.map(t => <span key={t} className={`bd ${tiene.has(t) ? 'v' : 'r'}`} style={{ fontSize: 10 }}>{tiene.has(t) ? '✓' : '✕'} {nombreDoc(t)}</span>)}
          </div>
          {vencidos > 0 && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}><AlertTriangle size={12} /> {vencidos} documento(s) vencido(s)</div>}
          {e.notas && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Notas: {e.notas}</div>}
        </Bloque>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        <button className="btn ghost" style={{ flex: 1, borderRadius: 0 }} onClick={onAbrir}><FileText size={13} style={{ verticalAlign: -2 }} /> Expediente</button>
        {editar && <button className="btn ghost" style={{ flex: 1, borderRadius: 0, borderLeft: '1px solid var(--border)' }} onClick={onEditar}><Pencil size={13} style={{ verticalAlign: -2 }} /> Editar</button>}
      </div>
    </div>
  )
}

export default function TabEmpleados({ nuevo, onNuevoCerrado }) {
  const nav = useNavigate()
  const { rol, sedes, organizacion } = useApp()
  const esAdmin = rol === 'administrador'
  const editar = usePermiso('rh.editar')
  const q = useVista('empleados', 'prp_empleados', { orden: [{ columna: 'numero_empleado' }], limite: 1000 })
  const qExp = useVista('expedientes', 'prp_expediente_empleado', { limite: 1000 }, { conSede: false })
  const qDocs = useVista('empleados-docs', 'prp_empleado_documentos', { limite: 5000 }, { conSede: false })
  const qHoy = useVista('empleados-hoy', 'prp_asignaciones_personal', { filtros: { fecha: hoyZona(organizacion?.zona_horaria) }, limite: 1000 }, { conSede: false })
  const [sel, setSel] = useState(null)
  const [verBajas, setVerBajas] = useState(false)
  const [busca, setBusca] = useState('')
  const [fSede, setFSede] = useState('')
  const [fPuesto, setFPuesto] = useState('')
  const [vista, setVista] = useState(() => { try { return localStorage.getItem(LS_VISTA) || 'mosaico' } catch { return 'mosaico' } })
  const cambiarVista = v => { setVista(v); try { localStorage.setItem(LS_VISTA, v) } catch { /* sin storage */ } }

  const exp = useMemo(() => Object.fromEntries((qExp.data ?? []).map(e => [e.empleado_id, e])), [qExp.data])
  const docsDe = useMemo(() => { const m = {}; for (const d of qDocs.data ?? []) (m[d.empleado_id] ||= []).push(d); return m }, [qDocs.data])
  const hoyDe = useMemo(() => Object.fromEntries((qHoy.data ?? []).map(a => [a.empleado_id, a])), [qHoy.data])
  const sedesNombre = id => sedes.find(s => s.id === id)?.nombre
  const filas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter(e => (verBajas || e.estado !== 'baja') && (!fSede || e.sede_id === fSede) && (!fPuesto || e.puesto === fPuesto)
      && (!t || [e.nombre_completo, e.numero_empleado, e.puesto, e.rfc, e.curp, e.email, e.telefono, e.cedula].some(v => String(v ?? '').toLowerCase().includes(t))))
  }, [q.data, verBajas, busca, fSede, fPuesto])
  const activos = (q.data ?? []).filter(e => e.estado === 'activo')
  const porPuesto = p => activos.filter(e => e.puesto === p).length
  const siguiente = useMemo(() => {
    const nums = (q.data ?? []).map(e => parseInt(String(e.numero_empleado).replace(/\D/g, ''), 10)).filter(Number.isFinite)
    return `E${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
  }, [q.data])
  const faltan = e => OBLIGATORIOS.filter(t => !(docsDe[e.id] ?? []).some(d => d.tipo === t))

  const columnas = [
    { key: 'foto', label: '', sortable: false, exportar: false, ancho: 56, render: e => <Foto nombre={e.nombre_completo} ruta={e.foto_path} size={38} borde="2px solid white" /> },
    { key: 'numero_empleado', label: 'No.', ancho: 70 },
    { key: 'nombre_completo', label: 'Empleado', render: e => <><b>{e.nombre_completo}</b>{e.responsable_de_sede_id && <span className="bd v" style={{ marginLeft: 6 }}>Responsable</span>}</> },
    { key: 'puesto', label: 'Puesto', filtro: true, valor: e => etiquetaPuesto(e.puesto) },
    { key: 'cedula', label: 'Cédula' },
    { key: 'sede_nombre', label: 'Sede de contrato', filtro: true },
    { key: 'otras', label: 'También en', valor: e => (e.sedes ?? []).map(sedesNombre).filter(Boolean).join(', ') },
    { key: 'hoy', label: 'Hoy en', valor: e => hoyDe[e.id]?.sede_nombre ?? e.sede_nombre, render: e => (hoyDe[e.id] && hoyDe[e.id].sede_id !== e.sede_id ? <span className="bd a" title={hoyDe[e.id].motivo ?? ''}>{hoyDe[e.id].sede_nombre}</span> : e.sede_nombre) },
    { key: 'estado', label: 'Estado', filtro: true, render: e => <StatusBadge estado={e.estado} /> },
    { key: 'esquema_contratacion', label: 'Esquema', filtro: true, valor: e => esquemaTxt(e.esquema_contratacion) },
    { key: 'tipo_jornada', label: 'Jornada' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'fecha_ingreso', label: 'Ingreso', render: e => fecha(e.fecha_ingreso) },
    { key: 'antiguedad_anios', label: 'Antigüedad', align: 'right', render: e => (e.antiguedad_anios == null ? '—' : `${e.antiguedad_anios} año(s)`) },
    { key: 'fecha_nacimiento', label: 'Nacimiento', render: e => fecha(e.fecha_nacimiento) },
    { key: 'rfc', label: 'RFC' }, { key: 'curp', label: 'CURP' }, { key: 'nss', label: 'NSS' },
    { key: 'telefono', label: 'Celular', render: e => telefono(e.telefono) },
    { key: 'email', label: 'Correo' },
    { key: 'domicilio', label: 'Domicilio', valor: e => domicilioTxt(e.domicilio) },
    { key: 'contacto_emergencia', label: 'Emergencia', valor: e => emergenciaTxt(e.contacto_emergencia) },
    { key: 'banco', label: 'Banco / CLABE', valor: e => `${e.banco ?? ''} ${enmascararClabe(e.clabe, esAdmin)}`, render: e => `${e.banco ?? '—'} ${enmascararClabe(e.clabe, esAdmin)}` },
    { key: 'salario_periodo', label: 'Salario periodo', align: 'right', render: e => moneda(e.salario_periodo) },
    { key: 'exp', label: 'Expediente', sortable: false, exportar: false, render: e => <Medidor datos={exp[e.id]?.datos_presentes} total={exp[e.id]?.datos_total} docs={exp[e.id]?.documentos_presentes} docsTotal={exp[e.id]?.documentos_total} /> },
    { key: 'faltan', label: 'Documentos que faltan', valor: e => faltan(e).map(nombreDoc).join(', '), render: e => { const f = faltan(e); return f.length ? <span style={{ color: 'var(--red)', fontSize: 12 }}>{f.map(nombreDoc).join(', ')}</span> : <span className="bd v">Completo</span> } },
    { key: 'acc', label: '', sortable: false, exportar: false, render: e => editar && <button className="btn o sm" onClick={ev => { ev.stopPropagation(); setSel(e) }}><Pencil size={12} /> Editar</button> },
  ]
  return (
    <>
      <div className="grid-kpis">
        <KPICard title="Empleados activos" value={activos.length} subtitle={`${porPuesto('podologo')} podólogos · ${porPuesto('recepcion')} recepción · ${porPuesto('apoyo')} apoyo`} loading={q.isLoading} />
        <KPICard title="Nómina mensual aprox." value={moneda(activos.reduce((s, e) => s + Number(e.salario_periodo) * ({ semanal: 4.33, quincenal: 2, mensual: 1 }[e.periodicidad_pago] ?? 1), 0))} subtitle="Salarios base de activos" loading={q.isLoading} />
        <KPICard title="Con sesión en el sistema" value={activos.filter(e => e.tiene_sesion).length} subtitle="Pueden ver sus recibos" loading={q.isLoading} />
        <KPICard title="Expedientes incompletos" value={activos.filter(e => { const x = exp[e.id]; return !x || x.documentos_presentes < x.documentos_total }).length} color="var(--gold)" subtitle="Faltan documentos obligatorios" loading={q.isLoading || qExp.isLoading} />
      </div>
      <div className="toolbar" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nombre, número, puesto, RFC, CURP, correo…" style={{ width: '100%', paddingLeft: 30 }} />
        </div>
        <select value={fSede} onChange={e => setFSede(e.target.value)} aria-label="Sede"><option value="">Todas las sedes</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
        <select value={fPuesto} onChange={e => setFPuesto(e.target.value)} aria-label="Puesto"><option value="">Todos los puestos</option>{['podologo', 'recepcion', 'apoyo', 'administrador', 'otro'].map(p => <option key={p} value={p}>{etiquetaPuesto(p)}</option>)}</select>
        <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} /> Ver bajas</label>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="Formato">
          <button className={`btn sm ${vista === 'mosaico' ? '' : 'ghost'}`} style={{ borderRadius: 0 }} onClick={() => cambiarVista('mosaico')} title="Mosaico: tarjetas con el expediente completo"><LayoutGrid size={14} style={{ verticalAlign: -3 }} /> Mosaico</button>
          <button className={`btn sm ${vista === 'grid' ? '' : 'ghost'}`} style={{ borderRadius: 0 }} onClick={() => cambiarVista('grid')} title="Grid: tabla con todas las columnas"><Table2 size={14} style={{ verticalAlign: -3 }} /> Grid</button>
        </div>
      </div>
      <Estado q={q} vacio={{ title: 'Sin empleados', description: 'Da de alta al primer empleado con «Nuevo empleado».' }}>
        {vista === 'mosaico'
          ? (filas.length
            ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
              {filas.map(e => <TarjetaEmpleado key={e.id} e={e} x={exp[e.id]} docs={docsDe[e.id] ?? []} hoyEn={hoyDe[e.id]} sedesNombre={sedesNombre} esAdmin={esAdmin} editar={editar}
                onAbrir={() => nav(`/rh/empleado/${e.id}`)} onEditar={() => setSel(e)} />)}
            </div>
            : <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>Nadie coincide con los filtros.</div>)
          : <DataTable columnas={columnas} filas={filas} buscador={false} exportarNombre="empleados" onFila={e => nav(`/rh/empleado/${e.id}`)} tamanoPagina={50} />}
      </Estado>
      <ModalEmpleado abierto={nuevo || !!sel} empleado={sel} siguienteNumero={siguiente} onClose={() => { setSel(null); onNuevoCerrado?.() }} />
    </>
  )
}
