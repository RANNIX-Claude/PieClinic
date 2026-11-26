// 44 · Usuarios y roles. Clon de IRP Usuarios.jsx adaptado: alta SOLO por invitación de un solo uso (P-119, el administrador no teclea
// contraseñas ajenas), permisos por sede, parámetros de seguridad visibles y matriz de capacidades (solo lectura). Migración 056.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus, ShieldCheck, Copy, Mail } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso, CAPACIDADES, ROLES, ROLES_ASIGNABLES, FUNCIONES, CAPS_SUPERVISOR } from '../../../lib/permisos'
import { leer, rpc } from '../../../lib/api'
import { fechaHora, fecha } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useDatos, errMsg, invocar, EstadoConsulta } from './comun'

const ROL_COLOR = { administrador: 'm', podologo: 'b', recepcion: 'v' }

function SelectorSedes({ sedes, valor, onChange }) {
  const todas = valor.length === 0
  return (
    <div className="field">
      <label>Sedes con acceso</label>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 8, fontSize: 13, fontWeight: 400 }}><input type="checkbox" style={{ width: 18, height: 18, flex: 'none', margin: 0 }} checked={todas} onChange={() => onChange([])} /> Todas las sedes de la clínica</label>
      {!todas || sedes.length ? sedes.map(s => (
        <label key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 8, fontSize: 13, fontWeight: 400, marginLeft: 16 }}>
          <input type="checkbox" style={{ width: 18, height: 18, flex: 'none', margin: 0 }} checked={valor.includes(s.id)} onChange={e => onChange(e.target.checked ? [...valor, s.id] : valor.filter(x => x !== s.id))} /> {s.nombre}
        </label>
      )) : null}
      <span className="hint">Sin ninguna marcada = todas las sedes. Marca una o varias para restringir.</span>
    </div>
  )
}

export default function Usuarios() {
  const { sedes, organizacion, perfil } = useApp()
  const puedeGestionar = usePermiso('usuarios.gestionar')
  const qc = useQueryClient()
  const { confirmar, dialogo } = useConfirmacion()
  const [tab, setTab] = useState('usuarios')
  const [modal, setModal] = useState(null) // 'invitar' | { editar: perfil }
  const [form, setForm] = useState({ email: '', nombre: '', rol: 'recepcion', sedes: [] })
  const [ocupado, setOcupado] = useState(false)
  const [enlace, setEnlace] = useState(null)

  const perfiles = useDatos(['usr-perfiles'], () => leer('perfiles', { sedeCol: false, orden: { columna: 'nombre' }, limite: 500 }))
  const invitaciones = useDatos(['usr-invitaciones'], () => leer('prp_invitaciones', { sedeCol: false, orden: { columna: 'created_at', asc: false }, limite: 200 }))
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['usr-perfiles'] }); qc.invalidateQueries({ queryKey: ['usr-invitaciones'] }) }
  const nombreSedes = ids => (!ids?.length ? 'Todas' : ids.map(i => sedes.find(s => s.id === i)?.nombre ?? '—').join(', '))

  async function accion(accion, datos, exito) {
    setOcupado(true)
    const r = await invocar('usuarios-admin', { accion, ...datos })
    setOcupado(false)
    if (r.error) { toast.error(r.error, { duration: 6000 }); return null }
    toast.success(exito); refrescar(); return r.data
  }

  async function invitar() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return toast.error('Correo inválido')
    const d = await accion('invitar', { email: form.email.trim().toLowerCase(), nombre: form.nombre.trim() || null, rol: form.rol, sedes: form.sedes }, 'Invitación creada')
    if (d) { setEnlace(d.enlace ?? null); if (!d.enlace) { setModal(null) } setForm({ email: '', nombre: '', rol: 'recepcion', sedes: [] }) }
  }
  async function cambiar(p) {
    const d = await accion('cambiar_rol', { usuario_id: p.id, rol: form.rol }, 'Rol actualizado')
    const s = await accion('cambiar_sedes', { usuario_id: p.id, sedes: form.sedes }, 'Sedes actualizadas')
    const f = await accion('cambiar_funciones', { usuario_id: p.id, funciones: form.funciones ?? [] }, 'Funciones actualizadas')
    if (d || s || f) setModal(null)
  }
  async function alternar(p) {
    const des = p.activo
    if (!(await confirmar({ titulo: des ? 'Desactivar usuario' : 'Activar usuario', mensaje: des ? `${p.nombre} dejará de poder entrar. Su historial se conserva.` : `${p.nombre} podrá volver a entrar.`, peligro: des, textoConfirmar: des ? 'Desactivar' : 'Activar' }))) return
    await accion(des ? 'desactivar' : 'activar', { usuario_id: p.id }, des ? 'Usuario desactivado' : 'Usuario activado')
  }
  async function revocar(i) {
    const r = await rpc('invitacion_revocar', { p_invitacion: i.id })
    r.error ? toast.error(errMsg(r.error)) : (toast.success('Invitación revocada'), refrescar())
  }

  const seg = organizacion?.parametros?.seguridad ?? {}
  const caps = Object.entries(CAPACIDADES)

  return (
    <div className="pagina">
      <PageHeader titulo="Usuarios y roles" subtitulo="Alta solo por invitación de un solo uso: la persona crea su propia contraseña. Una cuenta pertenece a una sola clínica."
        acciones={<button className="btn" disabled={!puedeGestionar} onClick={() => { setForm({ email: '', nombre: '', rol: 'recepcion', sedes: [] }); setEnlace(null); setModal('invitar') }}><UserPlus size={14} style={{ verticalAlign: -2 }} /> Invitar usuario</button>} />
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'usuarios', label: 'Usuarios', badge: perfiles.data?.data?.length },
        { id: 'invitaciones', label: 'Invitaciones', badge: (invitaciones.data?.data ?? []).filter(i => i.estado === 'pendiente').length || undefined },
        { id: 'seguridad', label: 'Seguridad' }, { id: 'matriz', label: 'Matriz de capacidades' }]} />

      <div style={{ marginTop: 12 }}>
        {tab === 'usuarios' && (<>
          <EstadoConsulta q={perfiles} />
          {!perfiles.isLoading && !perfiles.isError && (
            <DataTable exportarNombre="usuarios" placeholderBusqueda="Buscar nombre o correo…" filas={perfiles.data?.data ?? []}
              vacio={{ title: 'Sin usuarios', description: 'Invita al primer usuario.' }}
              columnas={[
                { key: 'nombre', label: 'Nombre', valor: p => `${p.nombre} ${p.apellidos ?? ''}`.trim() },
                { key: 'email', label: 'Correo' },
                { key: 'rol', label: 'Rol', filtro: true, valor: p => ROLES[p.rol] ?? p.rol, render: p => <span className={`bd ${ROL_COLOR[p.rol] ?? 'n'}`}>{ROLES[p.rol] ?? p.rol}</span> },
                { key: 'sedes', label: 'Sedes', valor: p => nombreSedes(p.sedes) },
                { key: 'activo', label: 'Estado', filtro: true, valor: p => (p.activo ? 'Activo' : 'Inactivo'), render: p => <StatusBadge estado={p.activo ? 'activo' : 'inactivo'} /> },
                { key: 'ultimo_acceso', label: 'Último acceso', valor: p => p.ultimo_acceso, render: p => (p.ultimo_acceso ? fechaHora(p.ultimo_acceso) : 'Nunca') },
                { key: 'created_at', label: 'Alta', valor: p => p.created_at, render: p => fecha(p.created_at) },
                { key: 'acc', label: '', sortable: false, exportar: false, render: p => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn o sm" disabled={!puedeGestionar} onClick={() => { setForm({ email: p.email, nombre: p.nombre, rol: p.rol, sedes: p.sedes ?? [], funciones: p.funciones ?? [] }); setModal({ editar: p }) }}>Editar</button>
                    {p.id !== perfil?.id && <button className={`btn sm ${p.activo ? 'red' : 'o'}`} disabled={!puedeGestionar || ocupado} onClick={() => alternar(p)}>{p.activo ? 'Desactivar' : 'Activar'}</button>}
                  </div>) },
              ]} />
          )}
        </>)}

        {tab === 'invitaciones' && (<>
          <EstadoConsulta q={invitaciones} />
          {!invitaciones.isLoading && !invitaciones.isError && (
            <DataTable exportarNombre="invitaciones" filas={invitaciones.data?.data ?? []} vacio={{ title: 'Sin invitaciones', description: 'Las invitaciones pendientes y aceptadas aparecen aquí.', icon: Mail }}
              columnas={[
                { key: 'email', label: 'Correo' }, { key: 'nombre', label: 'Nombre' },
                { key: 'rol', label: 'Rol', filtro: true, valor: i => ROLES[i.rol] ?? i.rol },
                { key: 'sedes', label: 'Sedes', valor: i => nombreSedes(i.sedes) },
                { key: 'estado', label: 'Estado', filtro: true, render: i => <StatusBadge estado={i.estado === 'pendiente' ? 'pendiente' : i.estado === 'aceptada' ? 'ok' : i.estado === 'revocada' ? 'cancelada' : 'vencida'} label={i.estado} /> },
                { key: 'expira_en', label: 'Vence', valor: i => i.expira_en, render: i => fecha(i.expira_en) },
                { key: 'acc', label: '', sortable: false, exportar: false, render: i => i.estado === 'pendiente' || i.estado === 'expirada' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn o sm" disabled={!puedeGestionar || ocupado} onClick={async () => { const d = await accion('reenviar', { invitacion_id: i.id, email: i.email }, 'Invitación reenviada'); if (d?.enlace) { setEnlace(d.enlace); setModal('invitar') } }}>Reenviar</button>
                    {i.estado === 'pendiente' && <button className="btn red sm" disabled={!puedeGestionar} onClick={() => revocar(i)}>Revocar</button>}
                  </div>) : null },
              ]} />
          )}
        </>)}

        {tab === 'seguridad' && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> Parámetros de seguridad</h3>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>Valores de la clínica (se cambian en Configuración → Parámetros). La aplicación los aplica en el inicio de sesión.</div>
            <div className="grid2">
              {[
                ['Sesión', `${seg.sesion_min ?? 60} min de inactividad`],
                ['Intentos fallidos antes del bloqueo', seg.intentos_fallidos_max ?? 3],
                ['Tiempo de bloqueo', `${seg.bloqueo_min ?? 15} min`],
                ['Verificación en dos pasos (administradores)', seg.dos_fa_administradores === false ? 'No exigida' : 'Exigida'],
                ['Inicio de sesión con Google', seg.login_google ? 'Habilitado' : 'Deshabilitado'],
              ].map(([k, v]) => <div key={k} className="field"><label>{k}</label><div style={{ fontWeight: 600 }}>{v}</div></div>)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Los parámetros se guardan en la clínica; el bloqueo por intentos y el 2FA dependen de la configuración de autenticación del proyecto (pendiente de confirmar contra Supabase real).</div>
          </div>
        )}

        {tab === 'matriz' && (
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--muted)' }}>Solo lectura. La autoridad real es el RLS de la base; esta matriz es la que usa la interfaz (MATRIZ_ROLES.md).</div>
            <div className="tabla-wrap">
              <table>
                <thead><tr><th>Capacidad</th>{ROLES_ASIGNABLES.map(r => <th key={r} style={{ textAlign: 'center' }}>{ROLES[r]}</th>)}<th style={{ textAlign: 'center' }}>Escritura</th></tr></thead>
                <tbody>{caps.filter(([k]) => k !== 'rannix.panel').map(([k, c]) => (
                  <tr key={k}><td><code>{k}</code></td>{ROLES_ASIGNABLES.map(r => <td key={r} style={{ textAlign: 'center' }}>{(r === 'supervisor' ? CAPS_SUPERVISOR.has(k) : c.roles.includes(r)) ? '✓' : '—'}</td>)}<td style={{ textAlign: 'center' }}>{c.escritura ? 'Sí' : 'No'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal open={modal === 'invitar'} onClose={() => setModal(null)} title="Invitar usuario" size="sm"
        footer={enlace ? <button className="btn" onClick={() => setModal(null)}>Listo</button> : <><button className="btn o" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={invitar}>{ocupado ? 'Enviando…' : 'Crear invitación'}</button></>}>
        {enlace ? (
          <div>
            <p style={{ fontSize: 13 }}>Invitación lista. Comparte este enlace con la persona (se muestra una sola vez y vence en 7 días):</p>
            <div className="card" style={{ padding: 8, wordBreak: 'break-all', fontSize: 12 }}>{enlace}</div>
            <button className="btn o sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(enlace); toast.success('Enlace copiado') }}><Copy size={12} style={{ verticalAlign: -2 }} /> Copiar enlace</button>
          </div>
        ) : (
          <>
            <FormField label="Correo" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" />
            <FormField label="Nombre (opcional)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            <FormField label="Rol" as="select" value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })} options={ROLES_ASIGNABLES.map(r => ({ value: r, label: ROLES[r] }))} />
            <SelectorSedes sedes={sedes ?? []} valor={form.sedes} onChange={s => setForm({ ...form, sedes: s })} />
          </>
        )}
      </Modal>

      <Modal open={!!modal?.editar} onClose={() => setModal(null)} title={`Editar · ${modal?.editar?.nombre ?? ''}`} size="sm"
        footer={<><button className="btn o" onClick={() => setModal(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={() => cambiar(modal.editar)}>Guardar</button></>}>
        <FormField label="Rol" as="select" value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })} options={ROLES_ASIGNABLES.map(r => ({ value: r, label: ROLES[r] }))} />
        <SelectorSedes sedes={sedes ?? []} valor={form.sedes} onChange={s => setForm({ ...form, sedes: s })} />
        <div className="field">
          <label>Funciones habilitadas</label>
          {Object.entries(FUNCIONES).map(([k, etiqueta]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: 8, fontSize: 13, fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 18, height: 18, flex: 'none', margin: 0 }} checked={(form.funciones ?? []).includes(k)}
                onChange={e => setForm({ ...form, funciones: e.target.checked ? [...(form.funciones ?? []), k] : (form.funciones ?? []).filter(x => x !== k) })} /> {etiqueta}
            </label>
          ))}
          <span className="hint">Además de su rol. Quien cobra se firma con su PIN personal.</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>El cambio de rol y de sedes queda en la bitácora. Un administrador no puede quitarse a sí mismo el rol.</div>
      </Modal>
      {dialogo}
    </div>
  )
}
