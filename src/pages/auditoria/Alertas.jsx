// Alertas de Control y Auditoría (F7.3). Regla de diseño: POCAS alertas que importen. Cada evento tiene su canal y su destinatario; cada persona tiene un TECHO DIARIO (el propio o el
// general): al excederlo se agrupa y llega en un solo resumen diario. Los envíos Push/WhatsApp/correo están SIMULADOS (sin proveedor): aquí se ve la bandeja real y lo que SE HABRÍA enviado.
// Dueño y supervisor atienden alertas; el dueño (y el soporte) configuran reglas y techos; el soporte solo lee. El rol de sucursal no entra.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bell, Play, Mail } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { ALERTAS_AVISO } from '../../lib/adaptadores/alertasAuditoria'
import {
  listarAlertas, atenderAlertas, reglasAlertas, guardarReglaAlerta, destinatariosAlertas, guardarDestinatario, enviosAlertas, evaluarAlertasAhora, generarResumenDiario,
} from '../../lib/auditoria/reportesApi'
import { NOMBRE_CANAL, NOMBRE_DESTINATARIO, NOMBRE_MODO_ENVIO, NOMBRE_SEVERIDAD, VARIANTE_SEVERIDAD, textoRegla, techoAlcanzado } from '../../lib/auditoria/reportes'
import { mensajeError } from '../../lib/auditoria/roles'
import { fechaHora, numero } from '../../lib/formato'
import { Aviso, Estado, useRpc } from './reportes/comun'

export default function Alertas() {
  const verDif = usePermiso('auditoria.ver_diferencias')
  const atiende = usePermiso('auditoria.investigar')
  const configura = usePermiso('auditoria.configurar')
  const qc = useQueryClient()
  const [tab, setTab] = useState('bandeja')
  const [ocupado, setOcupado] = useState('')
  if (!verDif) {
    return (
      <div className="pagina">
        <PageHeader titulo="Alertas" subtitulo="Esta pantalla es de dueño y supervisor" />
        <div className="card">Quien captura no recibe alertas de diferencias: así el conteo se hace a ciegas.</div>
      </div>
    )
  }
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ctl-alertas'] }).then(() => qc.invalidateQueries({ queryKey: ['ctl-tablero'] }))
  async function operar(clave, fn, texto) {
    setOcupado(clave)
    try {
      const r = await fn()
      if (r.error) { toast.error(mensajeError(r.error)); return }
      toast.success(texto(r.data)); refrescar()
    } finally { setOcupado('') }
  }
  return (
    <div className="pagina">
      <PageHeader titulo="Alertas" subtitulo="Pocas alertas que importen · techo diario por persona · resumen diario para el resto"
        acciones={configura && <>
          <button type="button" className="btn o sm" disabled={!!ocupado} onClick={() => operar('eval', evaluarAlertasAhora, d => `Evaluado: ${d.sin_conteo_apertura} sin apertura, ${d.sin_cierre} sin cierre, ${d.sin_sincronizar} sin sincronizar, ${d.cancelaciones} cancelación(es), ${d.ventas_alto_valor} pieza(s) de alto valor.`)}>
            <Play size={12} style={{ verticalAlign: -2 }} /> {ocupado === 'eval' ? 'Evaluando…' : 'Evaluar ahora'}</button>
          <button type="button" className="btn o sm" disabled={!!ocupado} onClick={() => operar('resumen', () => generarResumenDiario(null), d => `Resumen diario: ${d.resumenes} generado(s), ${d.ya_generados} ya existían.`)}>
            <Mail size={12} style={{ verticalAlign: -2 }} /> {ocupado === 'resumen' ? 'Generando…' : 'Generar resumen de hoy'}</button>
        </>} />
      <div style={{ marginBottom: 10 }}><Aviso tono="simulado"><b>Envíos simulados.</b> {ALERTAS_AVISO} Hoy tampoco hay planificador: «Evaluar ahora» (o <code>scripts/auditoria-alertas-programadas.mjs</code>) revisa las alertas por hora; el resumen diario se genera con el botón o con el script.</Aviso></div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'bandeja', label: 'Bandeja' }, { id: 'reglas', label: 'Eventos y canales' }, { id: 'destinatarios', label: 'Destinatarios y techo' }, { id: 'envios', label: 'Lo que se habría enviado' },
      ]} />
      <div style={{ marginTop: 12 }}>
        {tab === 'bandeja' && <Bandeja atiende={atiende} onCambio={refrescar} />}
        {tab === 'reglas' && <Reglas configura={configura} onCambio={refrescar} />}
        {tab === 'destinatarios' && <Destinatarios configura={configura} onCambio={refrescar} />}
        {tab === 'envios' && <Envios />}
      </div>
    </div>
  )
}

function Bandeja({ atiende, onCambio }) {
  const { sedes } = useApp()
  const [f, setF] = useState({ estado: 'sin_atender', severidad: '', tipo: '', sucursal: '' })
  const [sel, setSel] = useState([])
  const [nota, setNota] = useState('')
  const [dlg, setDlg] = useState(false)
  const filtros = Object.fromEntries(Object.entries(f).filter(([, v]) => v))
  const q = useRpc(['ctl-alertas', 'bandeja', filtros], () => listarAlertas({ ...filtros, limite: 300 }), { refetchInterval: 45000 })
  const d = q.data
  const set = (k, v) => { setSel([]); setF(s => ({ ...s, [k]: v })) }
  async function marcar(estado) {
    const r = await atenderAlertas(sel, estado, nota || null)
    if (r.error) { toast.error(mensajeError(r.error)); return }
    toast.success(`${r.data.cambiadas} alerta(s) marcada(s) como ${estado === 'atendida' ? 'atendidas' : 'vistas'}`)
    setSel([]); setNota(''); setDlg(false); q.refetch(); onCambio()
  }
  const columnas = [
    ...(atiende ? [{ key: 'sel', label: '', sortable: false, exportar: false, render: r => (r.estado === 'atendida' ? null : <input type="checkbox" aria-label={`Elegir ${r.nombre}`} checked={sel.includes(r.id)} onChange={() => setSel(s => (s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id]))} />) }] : []),
    { key: 'creado_en', label: 'Cuándo', render: r => fechaHora(r.creado_en) },
    { key: 'severidad', label: 'Severidad', render: r => <StatusBadge estado={r.severidad} label={NOMBRE_SEVERIDAD[r.severidad]} variante={VARIANTE_SEVERIDAD[r.severidad]} />, valor: r => NOMBRE_SEVERIDAD[r.severidad] },
    { key: 'nombre', label: 'Evento' }, { key: 'sucursal', label: 'Sucursal', render: r => r.sucursal ?? '—' },
    { key: 'mensaje', label: 'Qué pasó', render: r => <span style={{ whiteSpace: 'normal', minWidth: 260, display: 'inline-block' }}>{r.mensaje}</span> },
    { key: 'estado', label: 'Estado', render: r => (r.estado === 'atendida' ? <span title={r.nota_atencion ?? ''}><StatusBadge estado="atendida" label={`Atendida${r.atendida_por ? ` · ${r.atendida_por}` : ''}`} /></span> : <StatusBadge estado={r.estado} label={r.estado === 'nueva' ? 'Nueva' : 'Vista'} />) },
    { key: 'envios', label: 'Avisos', align: 'right', render: r => (r.envios || r.agrupados ? <span className="hint" title="Avisos individuales / agrupados para el resumen diario">{r.envios} / {r.agrupados}</span> : '—') },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, minWidth: 150, flex: '0 1 170px' }}><label>Estado</label>
          <select value={f.estado} onChange={e => set('estado', e.target.value)}><option value="sin_atender">Sin atender</option><option value="atendida">Atendidas</option><option value="todas">Todas</option></select></div>
        <div className="field" style={{ margin: 0, minWidth: 130, flex: '0 1 150px' }}><label>Severidad</label>
          <select value={f.severidad} onChange={e => set('severidad', e.target.value)}><option value="">Todas</option>{Object.entries(NOMBRE_SEVERIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field" style={{ margin: 0, minWidth: 180, flex: '0 1 230px' }}><label>Evento</label>
          <select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="">Todos</option>{(d?.tipos ?? []).map(t => <option key={t.tipo} value={t.tipo}>{t.nombre} ({t.n})</option>)}</select></div>
        <div className="field" style={{ margin: 0, minWidth: 150, flex: '0 1 190px' }}><label>Sucursal</label>
          <select value={f.sucursal} onChange={e => set('sucursal', e.target.value)}><option value="">Todas</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
        {atiende && <button type="button" className="btn sm" disabled={!sel.length} onClick={() => setDlg(true)}>Marcar atendida ({sel.length})</button>}
        {atiende && <button type="button" className="btn o sm" disabled={!sel.length} onClick={() => marcar('vista')}>Marcar vista</button>}
      </div>
      <Estado q={q} />
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <KPICard title="Nuevas" icon={Bell} color={d.resumen.nueva ? 'var(--gold)' : 'var(--green)'} value={numero(d.resumen.nueva)} />
            <KPICard title="Vistas, sin atender" value={numero(d.resumen.vista)} />
            <KPICard title="Atendidas" color="var(--green)" value={numero(d.resumen.atendida)} />
          </div>
          <DataTable buscador={false} sinPaginacion filaKey="id" filas={d.alertas} columnas={columnas} exportarNombre="alertas" vacio={{ title: 'Nada pendiente', description: 'No hay alertas con estos filtros. Pocas alertas, las que importan.' }} />
        </>
      )}
      <Modal open={dlg} onClose={() => setDlg(false)} title={`Marcar ${sel.length} alerta(s) como atendidas`} size="sm"
        footer={<><button type="button" className="btn o" onClick={() => setDlg(false)}>Cancelar</button><button type="button" className="btn" onClick={() => marcar('atendida')}>Marcar atendidas</button></>}>
        <div className="field"><label>Qué se hizo (opcional)</label><textarea rows={3} maxLength={500} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. Se habló con la encargada y se corrigió el cierre." /></div>
      </Modal>
    </div>
  )
}

function Reglas({ configura, onCambio }) {
  const q = useRpc(['ctl-alertas', 'reglas'], reglasAlertas)
  const [edit, setEdit] = useState(null)
  const d = q.data
  async function guardar() {
    const r = await guardarReglaAlerta({ tipo: edit.tipo, canales: edit.canales, destinatarios: edit.destinatarios, inmediata: edit.inmediata, activa: edit.activa, motivo: edit.motivo || null })
    if (r.error) { toast.error(mensajeError(r.error)); return }
    toast.success('Regla guardada (queda versionada)'); setEdit(null); q.refetch(); onCambio()
  }
  const alternar = (k, v) => setEdit(e => ({ ...e, [k]: e[k].includes(v) ? e[k].filter(x => x !== v) : [...e[k], v] }))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Estado q={q} />
      {d && (
        <>
          <Aviso>Techo general: <b>{d.techo_general} alertas por persona y día</b> (se cambia por persona en «Destinatarios y techo» o en Configuración de auditoría). Pasado el techo, lo demás se agrupa en el resumen diario. Las reglas se versionan: cada cambio queda registrado.</Aviso>
          <DataTable buscador={false} sinPaginacion filaKey="tipo" filas={d.eventos} exportarNombre="alertas_eventos"
            columnas={[
              { key: 'nombre', label: 'Evento', render: r => <span title={r.descripcion}><b>{r.nombre}</b>{r.fuente === 'sistema' && <span className="hint"> · propio del sistema</span>}</span> },
              { key: 'regla', label: 'Canal → destinatario', render: r => textoRegla(r), valor: r => textoRegla(r) },
              { key: 'activa', label: 'Estado', render: r => (r.activa ? <StatusBadge estado="activa" label="Activa" /> : <StatusBadge estado="inactivo" label="Apagada" />), valor: r => (r.activa ? 'Activa' : 'Apagada') },
              { key: 'emite', label: 'Quién lo genera', render: r => <span className="hint">{r.emite}</span> },
              { key: 'ultimos_30_dias', label: 'Últimos 30 días', align: 'right' },
              ...(configura ? [{ key: 'ed', label: '', sortable: false, exportar: false, render: r => <button type="button" className="btn o sm" onClick={() => setEdit({ tipo: r.tipo, nombre: r.nombre, canales: r.canales, destinatarios: r.destinatarios, inmediata: r.inmediata, activa: r.activa, motivo: '' })}>Cambiar</button> }] : []),
            ]} />
        </>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Regla: ${edit.nombre}` : ''} size="sm"
        footer={<><button type="button" className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button type="button" className="btn" disabled={!edit?.canales.length || !edit?.destinatarios.length} onClick={guardar}>Guardar regla</button></>}>
        {edit && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div><b>Canales</b> <span className="hint">(simulados)</span><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {Object.entries(NOMBRE_CANAL).map(([k, v]) => <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={edit.canales.includes(k)} onChange={() => alternar('canales', k)} /> {v}</label>)}</div></div>
            <div><b>Destinatarios</b><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {Object.entries(NOMBRE_DESTINATARIO).map(([k, v]) => <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={edit.destinatarios.includes(k)} onChange={() => alternar('destinatarios', k)} /> {v}</label>)}</div></div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.inmediata} onChange={e => setEdit({ ...edit, inmediata: e.target.checked })} /> Avisar al momento (si no, solo va en el resumen diario)</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.activa} onChange={e => setEdit({ ...edit, activa: e.target.checked })} /> Regla activa</label>
            <div className="field"><label>Motivo del cambio (opcional)</label><input maxLength={300} value={edit.motivo} onChange={e => setEdit({ ...edit, motivo: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Destinatarios({ configura, onCambio }) {
  const q = useRpc(['ctl-alertas', 'destinatarios'], destinatariosAlertas)
  const [edit, setEdit] = useState(null)
  const d = q.data
  async function guardar() {
    const techo = edit.techo === '' ? null : Number(edit.techo)
    const r = await guardarDestinatario({ usuario: edit.usuario_id, techo, recibir: edit.recibir, motivo: null })
    if (r.error) { toast.error(mensajeError(r.error)); return }
    toast.success('Guardado'); setEdit(null); q.refetch(); onCambio()
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Estado q={q} />
      {d && (
        <>
          <Aviso>Techo general: <b>{d.techo_general}</b> alertas inmediatas por persona y día. Cada persona puede tener el suyo; al alcanzarlo recibe un solo aviso y el resto llega en el resumen diario.</Aviso>
          <DataTable buscador={false} sinPaginacion filaKey="usuario_id" filas={d.destinatarios} exportarNombre="alertas_destinatarios" vacio={{ title: 'Sin destinatarios', description: 'No hay dueños ni supervisores activos.' }}
            columnas={[
              { key: 'nombre', label: 'Persona' }, { key: 'rol', label: 'Rol', render: r => NOMBRE_DESTINATARIO[r.rol] ?? r.rol },
              { key: 'techo_efectivo', label: 'Techo diario', align: 'right', render: r => <span>{r.techo_efectivo}{r.techo_propio == null ? <span className="hint"> (general)</span> : <span className="hint"> (propio)</span>}</span>, valor: r => r.techo_efectivo },
              { key: 'enviadas_hoy', label: 'Enviadas hoy', align: 'right', render: r => <b style={{ color: techoAlcanzado(r.enviadas_hoy, r.techo_efectivo) ? 'var(--red)' : undefined }}>{r.enviadas_hoy}</b> },
              { key: 'agrupadas_hoy', label: 'Agrupadas hoy', align: 'right' },
              { key: 'recibir', label: 'Recibe', render: r => (r.recibir ? 'Sí' : 'No') },
              ...(configura ? [{ key: 'ed', label: '', sortable: false, exportar: false, render: r => <button type="button" className="btn o sm" onClick={() => setEdit({ ...r, techo: r.techo_propio ?? '' })}>Cambiar</button> }] : []),
            ]} />
        </>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Alertas de ${edit.nombre}` : ''} size="sm"
        footer={<><button type="button" className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button type="button" className="btn" onClick={guardar}>Guardar</button></>}>
        {edit && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="field"><label>Techo diario propio (1 a 200; vacío = el general)</label><input type="number" min="1" max="200" value={edit.techo} onChange={e => setEdit({ ...edit, techo: e.target.value })} /></div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.recibir} onChange={e => setEdit({ ...edit, recibir: e.target.checked })} /> Recibe alertas</label>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Envios() {
  const [modo, setModo] = useState('')
  const q = useRpc(['ctl-alertas', 'envios', modo], () => enviosAlertas({ ...(modo ? { modo } : {}), limite: 200 }))
  const d = q.data
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, minWidth: 220, flex: '0 1 260px' }}><label>Tipo de aviso</label>
          <select value={modo} onChange={e => setModo(e.target.value)}><option value="">Todos</option>{Object.entries(NOMBRE_MODO_ENVIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {d && <div className="hint">{Object.entries(d.por_modo).map(([k, n]) => `${NOMBRE_MODO_ENVIO[k] ?? k}: ${n}`).join(' · ')}</div>}
      </div>
      <Estado q={q} />
      {d && (
        <DataTable buscador={false} sinPaginacion filaKey="id" filas={d.envios} exportarNombre="alertas_envios_simulados" vacio={{ title: 'Nada que mostrar', description: 'Todavía no se ha despachado ninguna alerta.' }}
          columnas={[
            { key: 'creado_en', label: 'Cuándo', render: r => fechaHora(r.creado_en) }, { key: 'modo', label: 'Tipo', render: r => NOMBRE_MODO_ENVIO[r.modo] ?? r.modo },
            { key: 'canal', label: 'Canal', render: r => NOMBRE_CANAL[r.canal] ?? '—' }, { key: 'destinatario', label: 'Para', render: r => r.destinatario ?? '—' },
            { key: 'mensaje', label: 'Mensaje', render: r => <span style={{ whiteSpace: 'normal', minWidth: 260, display: 'inline-block' }}><b>{r.asunto}</b><br />{r.mensaje}</span>, valor: r => `${r.asunto}: ${r.mensaje}` },
            { key: 'simulado', label: '', exportar: false, render: r => (r.simulado ? <span className="bd m" title="No salió nada: no hay proveedor">SIMULADO</span> : <span className="bd v">Enviado</span>) },
          ]} />
      )}
    </div>
  )
}
