// Pedidos especiales: zapatos, plantillas y aditamentos que se piden al proveedor a nombre de un cliente. Tablero por etapa, lista, «Por autorizar» del propietario,
// alerta de pedidos vencidos y exportación a Excel. Diseño acordado: docs/pedidos_especiales_diagrama.html · reglas y decisiones: docs/PEDIDOS_ESPECIALES.md.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ClipboardCheck, AlertTriangle, PackageCheck, Wallet, LayoutGrid, List, BellRing } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import Tabs from '../../../components/ui/Tabs'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import EmptyState from '../../../components/ui/EmptyState'
import { moneda, fecha } from '../../../lib/formato'
import { ESTADOS, ETAPAS_TABLERO, FINALES, puedeVerCostos, AVISO_MENSAJERIA } from '../../../lib/plataforma/pedidosEspeciales'
import { useLectura, msgError, colsPedido, EstadoPedido, Semaforo, useAccionPedido } from './comun'

const num = v => Number(v) || 0

export default function Pedidos() {
  const nav = useNavigate()
  const { rol, sedeActiva } = useApp()
  const esAdmin = rol === 'administrador'
  const verCostos = puedeVerCostos(rol)
  const [todas, setTodas] = useState(false)
  const [tab, setTab] = useState(esAdmin ? 'autorizar' : 'proceso')
  const [vista, setVista] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 760 ? 'lista' : 'tablero'))
  const [venc, setVenc] = useState(null)
  const q = useLectura('pedidos', 'prp_pedidos_especiales', { sedeId: todas ? null : undefined, orden: [{ columna: 'created_at', asc: false }], limite: 3000 })
  const { correr, ocupado } = useAccionPedido()
  const filas = q.filas
  const k = useMemo(() => {
    const abiertos = filas.filter(p => !FINALES.includes(p.estado))
    return {
      porAutorizar: filas.filter(p => p.estado === 'anticipo_cobrado').length,
      enProceso: abiertos.filter(p => !['en_espera', 'recibido'].includes(p.estado)).length,
      porEntregar: filas.filter(p => p.estado === 'recibido').length,
      atrasados: filas.filter(p => p.semaforo === 'rojo').length,
      saldo: abiertos.filter(p => p.estado !== 'en_espera').reduce((s, p) => s + num(p.saldo), 0),
      enEspera: filas.filter(p => p.estado === 'en_espera').length,
    }
  }, [filas])
  useEffect(() => { if (!esAdmin && tab === 'autorizar') setTab('proceso') }, [esAdmin, tab])
  const visibles = useMemo(() => filas.filter(p => ({
    autorizar: p.estado === 'anticipo_cobrado', proceso: !FINALES.includes(p.estado) && p.estado !== 'en_espera', atrasados: p.semaforo === 'rojo', espera: p.estado === 'en_espera',
    cerrados: FINALES.includes(p.estado), todos: true,
  }[tab] ?? true)), [filas, tab])

  const revisarVencidos = async () => { const r = await correr('pedido_recordatorios_generar', {}); if (r) setVenc(Array.isArray(r) ? r : []) }
  const abrir = p => nav(`/pedidos/${p.id}`)

  return (
    <div className="pagina">
      <PageHeader titulo="Pedidos" subtitulo={`Zapatos, plantillas y aditamentos pedidos al proveedor a nombre de un cliente · ${todas ? 'todas mis sucursales' : (sedeActiva?.nombre ?? 'sucursal activa')}`}
        acciones={<>
          <button className="btn o" onClick={revisarVencidos} disabled={ocupado} title="Genera la lista y la constancia de los pedidos con fecha vencida"><BellRing size={14} /> Revisar vencidos</button>
          <button className="btn" onClick={() => nav('/pedidos/nuevo')}><Plus size={14} /> Nuevo pedido</button>
        </>} />
      {k.atrasados > 0 && (
        <div className="card" role="alert" style={{ borderLeft: '4px solid var(--red)', marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertTriangle size={16} color="var(--red)" /><span style={{ fontSize: 13.5 }}><b>{k.atrasados} pedido{k.atrasados === 1 ? '' : 's'} con fecha vencida</b> (entrega al cliente o saldo sin pagar).</span>
          <button className="btn o sm" onClick={() => setTab('atrasados')}>Ver atrasados</button>
        </div>)}
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        {esAdmin && <KPICard title="Por autorizar" value={k.porAutorizar} icon={ClipboardCheck} color={k.porAutorizar ? 'var(--red)' : undefined} subtitle="anticipo cobrado, espera tu autorización" loading={q.cargando} />}
        <KPICard title="En proceso" value={k.enProceso} icon={LayoutGrid} subtitle="con el proveedor o por llegar" loading={q.cargando} />
        <KPICard title="Listos para entregar" value={k.porEntregar} icon={PackageCheck} color="var(--green)" subtitle="recibidos en la sucursal" loading={q.cargando} />
        <KPICard title="Saldo por cobrar" value={moneda(k.saldo)} icon={Wallet} color="var(--gold)" subtitle={k.enEspera ? `${k.enEspera} en espera` : undefined} loading={q.cargando} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'autorizar', label: 'Por autorizar', badge: k.porAutorizar || null, oculto: !esAdmin }, { id: 'proceso', label: 'En proceso' }, { id: 'atrasados', label: 'Atrasados', badge: k.atrasados || null },
            { id: 'espera', label: 'En espera', badge: k.enEspera || null }, { id: 'cerrados', label: 'Cerrados' }, { id: 'todos', label: 'Todos' }]} />
        </div>
        <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Todas mis sucursales</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn ${vista === 'tablero' ? '' : 'o'} sm`} onClick={() => setVista('tablero')} aria-pressed={vista === 'tablero'}><LayoutGrid size={13} /> Tablero</button>
          <button className={`btn ${vista === 'lista' ? '' : 'o'} sm`} onClick={() => setVista('lista')} aria-pressed={vista === 'lista'}><List size={13} /> Lista</button>
        </div>
      </div>
      {q.error ? <EmptyState title="No se pudo cargar" description={msgError(q.error)} /> : vista === 'tablero' && tab !== 'cerrados'
        ? <Tablero filas={visibles} cargando={q.cargando} onAbrir={abrir} />
        : <DataTable cargando={q.cargando} filas={visibles} exportarNombre="pedidos_especiales" onFila={abrir} columnas={colsPedido({ verCostos })}
            vacio={{ title: 'Sin pedidos aquí', description: tab === 'autorizar' ? 'Nada espera tu autorización.' : 'Crea un pedido con «Nuevo pedido».' }} />}
      <div className="text-muted" style={{ fontSize: 11.5, marginTop: 8 }}>Petición al proveedor: {AVISO_MENSAJERIA}</div>
      {venc && (
        <Modal open onClose={() => setVenc(null)} title="Pedidos con fecha vencida" size="sm" footer={<button className="btn" onClick={() => setVenc(null)}>Cerrar</button>}>
          {venc.length === 0 ? <div className="text-muted">Ningún pedido está vencido.</div> : venc.map(v => (
            <button key={v.id} type="button" onClick={() => nav(`/pedidos/${v.id}`)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', padding: '8px 2px', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}>
              <span><b>{v.folio}</b> · {ESTADOS[v.estado]}</span><span className="text-red" style={{ fontSize: 12.5 }}>{v.tipo === 'saldo_vencido' ? 'Saldo vencido' : 'Entrega vencida'} · {v.dias} d</span></button>))}
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Se dejó constancia en la bitácora de cada pedido (una vez al día). Sin planificador: esta revisión se hace con este botón.</div>
        </Modal>)}
    </div>
  )
}

/** Tablero por etapa: una columna por estado, tarjetas con folio, cliente, producto, saldo y semáforo. */
function Tablero({ filas, cargando, onAbrir }) {
  const porEstado = useMemo(() => { const m = Object.fromEntries(ETAPAS_TABLERO.map(e => [e, []])); for (const p of filas) if (m[p.estado]) m[p.estado].push(p); return m }, [filas])
  if (cargando) return <div className="text-muted">Cargando…</div>
  return (
    <div className="ped-tablero" style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(228px, 1fr)', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
      {ETAPAS_TABLERO.map(e => (
        <section key={e} aria-label={ESTADOS[e]} style={{ background: 'var(--bg-soft, rgba(127,127,127,.07))', borderRadius: 10, padding: 8, minHeight: 120 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12.5, fontWeight: 600 }}>
            <EstadoPedido estado={e} /><span className="bd n">{porEstado[e].length}</span></div>
          <div style={{ display: 'grid', gap: 6 }}>
            {porEstado[e].map(p => (
              <button key={p.id} type="button" className="card" onClick={() => onAbrir(p)} style={{ textAlign: 'left', cursor: 'pointer', padding: 9, border: '1px solid var(--border)', display: 'grid', gap: 3 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b style={{ fontSize: 13 }}>{p.folio}</b><Semaforo valor={p.semaforo} dias={p.dias_retraso} /></span>
                <span style={{ fontSize: 12.5 }}>{p.paciente_nombre}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{p.producto}</span>
                <span className="text-muted" style={{ fontSize: 11.5 }}>{p.proveedor_nombre} · {p.sede_nombre}</span>
                <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Saldo {moneda(p.saldo)}</span><span>{fecha(p.fecha_acordada ?? p.fecha_prometida)}</span></span>
              </button>))}
            {porEstado[e].length === 0 && <div className="text-muted" style={{ fontSize: 12, padding: 6 }}>—</div>}
          </div>
        </section>))}
    </div>
  )
}
