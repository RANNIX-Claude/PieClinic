// Asignación de personal (propietarios): mandar a alguien a otra sucursal por un día (cobertura por ausencias) y fijar al
// responsable de cada sucursal. Reglas (migración 310): una sola sucursal por persona y día; quien cubre opera SOLO en la sucursal
// asignada (tickets, agenda, caja…) y debe firmar su entrada ahí; el día de hoy en adelante, nunca fechas pasadas.
import { useMemo, useState } from 'react'
import { Plus, ArrowRight, Trash2, CheckCircle2, Clock } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useApp } from '../../../context/AppContext'
import { rpc, borrar } from '../../../lib/api'
import { fecha } from '../../../lib/formato'
import { useVista, Estado, useEscribir, AvisoSoloLectura, Foto, etiquetaPuesto, hoyZona } from './comun'

const sumaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const VACIO = { empleado_id: '', sede_id: '', fecha: '', motivo: '', cubre_a: '' }

function Persona({ e, nota, tono, onClick }) {
  return (
    <button type="button" onClick={onClick} title="Mandar a otra sucursal ese día"
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: tono === 'sale' ? 'var(--bg)' : 'var(--card, white)', opacity: tono === 'sale' ? 0.7 : 1, cursor: 'pointer' }}>
      <Foto nombre={e.nombre_completo} ruta={e.foto_path} size={34} borde="2px solid white" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nombre_completo}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{etiquetaPuesto(e.puesto)}</span>
      </span>
      {nota}
    </button>
  )
}

export default function AsignacionPersonal() {
  const { sedes, organizacion } = useApp()
  const hoy = hoyZona(organizacion?.zona_horaria)
  const { ejecutar, ocupado } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const [dia, setDia] = useState(hoy)
  const [modal, setModal] = useState(null)
  const [f, setF] = useState(VACIO)
  const [err, setErr] = useState({})

  const qEmp = useVista('asig-empleados', 'prp_empleados', { filtros: { estado: 'activo' }, orden: [{ columna: 'nombre_completo' }], limite: 1000 }, { conSede: false })
  const qDia = useVista(['asig-dia', dia], 'prp_asignaciones_personal', { filtros: { fecha: dia }, limite: 1000 }, { conSede: false })
  const qProx = useVista('asig-proximas', 'prp_asignaciones_personal', { filtros: { origen: 'cobertura', fecha: { gte: sumaDias(hoy, -3) } }, orden: [{ columna: 'fecha' }], limite: 300 }, { conSede: false })
  const qPod = useVista('asig-podologos', 'perfiles', { filtros: { rol: 'podologo', activo: true }, orden: [{ columna: 'nombre' }], limite: 200 }, { conSede: false })
  const qSedes = useVista('asig-sedes', 'sedes', { filtros: { activa: true }, orden: [{ columna: 'nombre' }], limite: 100 }, { conSede: false })

  const emps = qEmp.data ?? []
  const deDia = useMemo(() => Object.fromEntries((qDia.data ?? []).map(a => [a.empleado_id, a])), [qDia.data])
  const sedesOrg = qSedes.data?.length ? qSedes.data : sedes
  const nombrePerfil = id => { const p = (qPod.data ?? []).find(x => x.id === id); return p ? `${p.nombre} ${p.apellidos ?? ''}`.trim() : null }
  const respDe = s => s.responsable_id
  const ubicacion = e => { const a = deDia[e.id]; return a ? a.sede_id : e.sede_id }

  function abrir(emp, sedeDestino) {
    setErr({}); setF({ ...VACIO, empleado_id: emp?.id ?? '', sede_id: sedeDestino ?? '', fecha: dia })
    setModal('asignar')
  }
  async function guardar() {
    const e = {}
    if (!f.empleado_id) e.empleado_id = 'Elige a la persona'
    if (!f.sede_id) e.sede_id = 'Elige la sucursal'
    if (!f.fecha) e.fecha = 'Elige la fecha'
    else if (f.fecha < hoy) e.fecha = 'No se asigna a una fecha pasada'
    const emp = emps.find(x => x.id === f.empleado_id)
    if (emp && f.sede_id === emp.sede_id && !deDia[emp.id]) e.sede_id = 'Esa es su sucursal habitual: no hace falta asignarla'
    setErr(e)
    if (Object.keys(e).length) return
    const ok = await ejecutar(() => rpc('asignar_personal_dia', { p_empleado: f.empleado_id, p_sede: f.sede_id, p_fecha: f.fecha, p_motivo: f.motivo || null, p_cubre_a: f.cubre_a || null }), 'Asignación guardada: la persona opera solo en esa sucursal ese día')
    if (ok) { setModal(null); setDia(f.fecha) }
  }
  async function quitar(a) {
    if (await confirmar({ titulo: 'Quitar asignación', mensaje: `${a.nombre_completo} volverá a su sucursal (${a.sede_base_nombre}) el ${fecha(a.fecha)}.`, textoConfirmar: 'Quitar', peligro: true }))
      ejecutar(() => borrar('empleado_asignaciones', a.id), 'Asignación quitada')
  }
  const fijarResponsable = (sede, perfilId) => ejecutar(() => rpc('asignar_responsable_sucursal', { p_sede: sede.id, p_perfil: perfilId || null }), perfilId ? 'Responsable asignado' : 'Responsable quitado')

  return (
    <div className="pagina">
      <PageHeader titulo="Asignación de personal" subtitulo="Cobertura por ausencias y responsable de cada sucursal"
        acciones={<button className="btn" onClick={() => abrir(null, '')}><Plus size={14} style={{ verticalAlign: -3 }} /> Asignar a otra sucursal</button>} />
      <AvisoSoloLectura />
      <div className="card" style={{ marginBottom: 14, fontSize: 12.5, lineHeight: 1.5 }}>
        <b>Cómo funciona.</b> La persona asignada <b>solo puede operar en la sucursal asignada ese día</b> (generar tickets, agenda, caja) y no en las demás; no puede estar en dos sucursales el mismo día.
        Debe <b>firmar su entrada</b> en la sucursal asignada antes de generar tickets. Cada sucursal tiene un <b>responsable</b>: es podólogo, da servicio y además ve el personal, la asistencia y la operación de su sucursal.
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Responsable de cada sucursal</h3>
        <Estado q={qSedes}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
            {sedesOrg.map(s => (
              <FormField key={s.id} label={s.nombre} as="select" value={respDe(s) ?? ''} disabled={ocupado}
                options={(qPod.data ?? []).map(p => ({ value: p.id, label: `${p.nombre} ${p.apellidos ?? ''}`.trim() }))}
                onChange={e => fijarResponsable(s, e.target.value)} hint={respDe(s) ? `Responsable: ${nombrePerfil(respDe(s)) ?? '—'}` : 'Sin responsable asignado'} />
            ))}
          </div>
          {(qPod.data ?? []).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay podólogos con usuario activo. Da de alta el usuario del podólogo en Usuarios y vuelve aquí.</div>}
        </Estado>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ margin: 0, flex: 1 }}>Quién está dónde</h3>
          <button className="btn o sm" onClick={() => setDia(sumaDias(dia, -1))}>‹</button>
          <input type="date" value={dia} onChange={e => e.target.value && setDia(e.target.value)} aria-label="Día" />
          <button className="btn o sm" onClick={() => setDia(sumaDias(dia, 1))}>›</button>
          {dia !== hoy && <button className="btn o sm" onClick={() => setDia(hoy)}>Hoy</button>}
        </div>
        <Estado q={qEmp} vacio={{ title: 'Sin personal', description: 'Da de alta al personal en RH.' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 12 }}>
            {sedesOrg.map(s => {
              const aqui = emps.filter(e => ubicacion(e) === s.id)
              const salen = emps.filter(e => e.sede_id === s.id && ubicacion(e) !== s.id)
              return (
                <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{s.nombre}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>{aqui.length} persona(s) · responsable: {nombrePerfil(respDe(s)) ?? 'sin asignar'}</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {aqui.map(e => {
                      const a = deDia[e.id], llega = a && e.sede_id !== s.id
                      return <Persona key={e.id} e={e} onClick={() => abrir(e, '')}
                        nota={llega ? <span className="bd a" title={a.motivo ?? ''}>Cubre · viene de {a.sede_base_nombre}</span> : null} />
                    })}
                    {salen.map(e => <Persona key={e.id} e={e} tono="sale" onClick={() => abrir(e, '')}
                      nota={<span className="bd n"><ArrowRight size={11} style={{ verticalAlign: -2 }} /> {deDia[e.id]?.sede_nombre}</span>} />)}
                    {!aqui.length && !salen.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin personal.</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </Estado>
      </div>

      <div className="card">
        <h3>Asignaciones programadas</h3>
        <Estado q={qProx} vacio={{ title: 'Sin asignaciones', description: 'Cuando mandes a alguien a otra sucursal aparecerá aquí.', compacto: true }}>
          <div className="tabla-wrap"><table>
            <thead><tr><th>Fecha</th><th>Persona</th><th>De</th><th>A</th><th>Cubre a</th><th>Motivo</th><th>Firma de entrada</th><th /></tr></thead>
            <tbody>{(qProx.data ?? []).map(a => (
              <tr key={a.id}>
                <td>{fecha(a.fecha)}{a.fecha === hoy && <span className="bd a" style={{ marginLeft: 6 }}>Hoy</span>}</td>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Foto nombre={a.nombre_completo} ruta={a.foto_path} size={28} borde="2px solid white" /> {a.nombre_completo}</span></td>
                <td>{a.sede_base_nombre}</td><td><b>{a.sede_nombre}</b></td><td>{a.cubre_a_nombre ?? '—'}</td><td>{a.motivo ?? '—'}</td>
                <td>{a.firmo_entrada ? <span className="bd v"><CheckCircle2 size={11} style={{ verticalAlign: -2 }} /> Firmó</span> : a.fecha < hoy ? <span className="bd r">No firmó</span> : <span className="bd n"><Clock size={11} style={{ verticalAlign: -2 }} /> Pendiente</span>}</td>
                <td>{a.fecha >= hoy && !a.firmo_entrada && <button className="btn o sm" onClick={() => quitar(a)} aria-label="Quitar"><Trash2 size={12} /></button>}</td>
              </tr>))}</tbody>
          </table></div>
        </Estado>
      </div>

      <Modal open={modal === 'asignar'} onClose={() => setModal(null)} title="Asignar a otra sucursal" cerrarAlClicFuera={false}
        footer={<><button className="btn o" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button><button className="btn" onClick={guardar} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Asignar'}</button></>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <FormField label="Persona *" as="select" error={err.empleado_id} value={f.empleado_id} onChange={e => setF(x => ({ ...x, empleado_id: e.target.value }))}
            options={emps.map(e => ({ value: e.id, label: `${e.nombre_completo} · ${etiquetaPuesto(e.puesto)} · ${e.sede_nombre}` }))} />
          <FormField label="Sucursal donde trabajará *" as="select" error={err.sede_id} value={f.sede_id} onChange={e => setF(x => ({ ...x, sede_id: e.target.value }))}
            options={sedesOrg.map(s => ({ value: s.id, label: s.nombre }))} hint="Ese día solo podrá operar en esta sucursal." />
          <FormField label="Fecha *" type="date" error={err.fecha} min={hoy} value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value }))} />
          <FormField label="A quién cubre (opcional)" as="select" value={f.cubre_a} onChange={e => setF(x => ({ ...x, cubre_a: e.target.value }))}
            options={emps.filter(e => e.id !== f.empleado_id).map(e => ({ value: e.id, label: `${e.nombre_completo} · ${e.sede_nombre}` }))} />
          <FormField label="Motivo (opcional)" value={f.motivo} onChange={e => setF(x => ({ ...x, motivo: e.target.value }))} placeholder="Ausencia, incapacidad, evento…" />
          {f.empleado_id && deDia[f.empleado_id] && f.fecha === dia && <div className="aviso warn">Esa persona ya tiene una asignación el {fecha(dia)} ({deDia[f.empleado_id].sede_nombre}): se reemplaza por la nueva.</div>}
        </div>
      </Modal>
      {dialogo}
    </div>
  )
}
