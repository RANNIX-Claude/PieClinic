// Pantalla 40 · Comisiones y productividad por podólogo. Administración ve todas; el podólogo solo las suyas (RLS).
// La base viene de ventas con ingreso validado (P-107/P-090); el % lo fija el cliente en el esquema (P-106, sin valor por defecto).
import { useMemo, useState } from 'react'
import { Plus, Lock, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../../components/ui/PageHeader'
import Tabs from '../../../components/ui/Tabs'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { insertar, rpc } from '../../../lib/api'
import { moneda, fecha, porcentaje, numero } from '../../../lib/formato'
import { useVista, Estado, useEscribir, AvisoSoloLectura, nSede, hoy } from './comun'
import Esquemas from './comisiones/Esquemas'
import CargarDetalle from './comisiones/CargarDetalle'
import Metas from './comisiones/Metas'

const ESQ = { porcentaje: '% sobre servicio', porcentaje_viatico: '% + viático', sueldo_bono: 'Sueldo + bono', renta_cabina: 'Renta de cabina' }

export default function Comisiones() {
  const admin = usePermiso('comisiones.ver_todas')
  const editar = usePermiso('rh.editar')
  const { sedes, sedeActivaId } = useApp()
  const { ejecutar, ocupado } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const [tab, setTab] = useState('resumen')
  const [periodoId, setPeriodoId] = useState(null)
  const [nuevo, setNuevo] = useState(null)
  const [reabrir, setReabrir] = useState(null)
  const [empSel, setEmpSel] = useState(null)
  const qp = useVista('periodos-com', 'periodos_comision', { orden: [{ columna: 'desde', asc: false }], limite: 60 }, { conSede: false })
  const periodos = qp.data ?? []
  const periodo = periodos.find(p => p.id === periodoId) ?? periodos[0] ?? null
  const qc = useVista(['comisiones', periodo?.id], 'prp_comisiones', { filtros: { periodo_id: periodo?.id }, orden: [{ columna: 'comision_total', asc: false }], limite: 300 }, { conSede: false, habilitado: !!periodo })
  const qd = useVista(['com-detalle', periodo?.id], 'prp_comision_detalle', { filtros: { periodo_id: periodo?.id }, orden: [{ columna: 'fecha' }], limite: 5000 }, { conSede: false, habilitado: !!periodo })
  const filas = useMemo(() => (qc.data ?? []).filter(c => !sedeActivaId || c.sede_id === sedeActivaId), [qc.data, sedeActivaId])
  const det = qd.data ?? []
  const tot = useMemo(() => ({ com: filas.reduce((s, c) => s + Number(c.comision_total), 0), base: filas.reduce((s, c) => s + Number(c.base_comisionable), 0), citas: filas.reduce((s, c) => s + c.citas, 0), quejas: filas.reduce((s, c) => s + c.quejas_periodo, 0),
    serv: filas.reduce((s, c) => s + Number(c.ingreso_servicios), 0), prod: filas.reduce((s, c) => s + Number(c.venta_productos), 0) }), [filas])
  const top = [...filas].sort((a, b) => b.base_comisionable - a.base_comisionable)[0]
  const cerrado = periodo?.estado === 'cerrado'
  const sel = filas.find(c => c.empleado_id === empSel)

  const matriz = useMemo(() => {
    const m = {}, emps = {}
    det.filter(d => d.tipo === 'servicio' || d.tipo === 'plan').forEach(d => { const k = d.concepto ?? '(sin concepto)'; (m[k] ??= {})[d.empleado_id] = (m[k][d.empleado_id] ?? 0) + Number(d.base); emps[d.empleado_id] = true })
    return { conceptos: Object.entries(m).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)).slice(0, 12), emps: Object.keys(emps) }
  }, [det])
  const nombre = id => (qc.data ?? []).find(c => c.empleado_id === id)?.nombre_completo ?? '—'

  const crear = async () => {
    if (!nuevo.desde || !nuevo.hasta || nuevo.hasta < nuevo.desde) { toast.error('Fechas inválidas'); return }
    const ok = await ejecutar(() => insertar('periodos_comision', { desde: nuevo.desde, hasta: nuevo.hasta }), 'Periodo creado')
    if (ok) setNuevo(null)
  }
  const sugerir = () => { const d = new Date(`${hoy()}T00:00:00Z`); const y = d.getUTCFullYear(), m = d.getUTCMonth(); setNuevo({ desde: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), hasta: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) }) }
  const cerrar = async () => {
    if (await confirmar({ titulo: 'Cerrar periodo de comisiones', mensaje: `Del ${fecha(periodo.desde)} al ${fecha(periodo.hasta)}: ${moneda(tot.com)} en comisiones. Un periodo cerrado es de solo lectura; los ajustes posteriores van al siguiente periodo con referencia (P-108). Entra a la nómina de la quincena de su fecha de cierre.`, textoConfirmar: 'Cerrar periodo' }))
      ejecutar(() => rpc('comisiones_cerrar_periodo', { p_periodo: periodo.id }), 'Periodo cerrado')
  }
  const reabrirOk = async () => {
    if ((reabrir.motivo ?? '').trim().length < 3) { toast.error('La reapertura exige motivo'); return }
    const ok = await ejecutar(() => rpc('comisiones_reabrir_periodo', { p_periodo: periodo.id, p_motivo: reabrir.motivo.trim() }), 'Periodo reabierto')
    if (ok) setReabrir(null)
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Comisiones y productividad por podólogo" subtitulo={periodo ? `${fecha(periodo.desde)} – ${fecha(periodo.hasta)} · calculadas de los ingresos validados` : 'Calculadas de los ingresos validados'}
        acciones={admin && editar && <>{<button className="btn o" onClick={sugerir}><Plus size={14} style={{ verticalAlign: -3 }} /> Nuevo periodo</button>}
          {periodo && !cerrado && <button className="btn" disabled={ocupado} onClick={cerrar}><Lock size={14} style={{ verticalAlign: -3 }} /> Cerrar periodo</button>}
          {periodo && cerrado && <button className="btn o" onClick={() => setReabrir({ motivo: '' })}><Unlock size={14} style={{ verticalAlign: -3 }} /> Reabrir</button>}</>} />
      <AvisoSoloLectura />
      <Tabs value={tab} onChange={setTab} items={[{ id: 'resumen', label: 'Resumen' }, { id: 'carga', label: 'Cargar detalle', oculto: !admin }, { id: 'esquemas', label: 'Esquemas por podólogo', oculto: !admin }, { id: 'metas', label: 'Metas' }]} />

      {tab !== 'esquemas' && tab !== 'metas' && (
        <div className="toolbar">
          <FormField label="Periodo" as="select" placeholder="Sin periodos" options={periodos.map(p => ({ value: p.id, label: `${fecha(p.desde)} – ${fecha(p.hasta)} · ${p.estado === 'cerrado' ? 'cerrado' : 'por cerrar'}` }))} value={periodo?.id ?? ''} onChange={e => { setPeriodoId(e.target.value); setEmpSel(null) }} style={{ maxWidth: 340 }} />
          {periodo && <StatusBadge estado={periodo.estado === 'cerrado' ? 'cerrado' : 'abierta'} label={periodo.estado === 'cerrado' ? 'Cerrado' : 'Por cerrar'} />}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Solo ingresos validados</span>
        </div>
      )}

      {tab === 'resumen' && <Estado q={qp} esVacio={d => !d.length} vacio={{ title: 'Sin periodos de comisión', description: admin ? 'Crea el primer periodo y carga el detalle desde las ventas validadas.' : 'Administración aún no abre periodos.' }}>
        {periodo && <>
          <div className="grid-kpis">
            <KPICard title="Comisiones del periodo" value={moneda(tot.com)} subtitle={tot.base ? `${porcentaje((tot.com / tot.base) * 100)} de la base comisionable` : 'Sin base'} loading={qc.isLoading} />
            <KPICard title="Mayor productividad" value={top ? top.nombre_completo : '—'} subtitle={top ? `${moneda(top.base_comisionable)} · ${top.citas} citas` : undefined} color="var(--green)" loading={qc.isLoading} />
            <KPICard title="Base comisionable" value={moneda(tot.base)} subtitle={`Servicios ${moneda(tot.serv)} · productos ${moneda(tot.prod)}`} color="var(--accent2)" loading={qc.isLoading} />
            <KPICard title="Citas / quejas" value={`${numero(tot.citas)} / ${numero(tot.quejas)}`} subtitle="Quejas del periodo (dominio clínico)" color="var(--gold)" loading={qc.isLoading} />
          </div>
          <Estado q={qc}>
            <DataTable exportarNombre={`comisiones_${periodo.desde}`} filas={filas} onFila={c => setEmpSel(c.empleado_id)} filaKey="id"
              vacio={{ title: 'Sin comisiones en el periodo', description: admin ? 'Usa «Cargar detalle» para traer las ventas validadas del periodo.' : 'Aún no hay comisiones calculadas para ti en este periodo.' }}
              columnas={[
                { key: 'nombre_completo', label: 'Podólogo', render: c => <b>{c.nombre_completo}</b> },
                { key: 'sede_id', label: 'Sede', valor: c => nSede(sedes, c.sede_id), filtro: true },
                { key: 'citas', label: 'Citas', align: 'right' },
                { key: 'ingreso_servicios', label: 'Ingreso servicios', align: 'right', render: c => moneda(c.ingreso_servicios) },
                { key: 'venta_productos', label: 'Venta productos', align: 'right', render: c => moneda(c.venta_productos) },
                { key: 'ingreso_planes', label: 'Planes', align: 'right', render: c => moneda(c.ingreso_planes) },
                { key: 'base_comisionable', label: 'Base comisionable', align: 'right', render: c => moneda(c.base_comisionable) },
                { key: 'esquema', label: 'Esquema' },
                { key: 'ajustes', label: 'Ajustes', align: 'right', render: c => (Number(c.ajustes) ? moneda(c.ajustes) : '—') },
                { key: 'viatico', label: 'Viático', align: 'right', render: c => (Number(c.viatico) ? moneda(c.viatico) : '—') },
                { key: 'comision_total', label: 'Comisión', align: 'right', render: c => <b>{moneda(c.comision_total)}{c.piso_aplicado ? ' *' : ''}</b> },
                { key: 'quejas_periodo', label: 'Quejas', align: 'right' },
                { key: 'estado', label: 'Estado', filtro: true, render: c => <StatusBadge estado={c.estado === 'cerrado' ? 'cerrado' : 'abierta'} label={c.estado === 'cerrado' ? 'Cerrado' : 'Por cerrar'} /> },
              ]} />
          </Estado>
          <div style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 12px' }}>* Se aplicó el piso del periodo del esquema. Clic en un podólogo para ver su detalle.</div>
          {sel && <div className="card"><h3>Detalle · {sel.nombre_completo}</h3>
            <DataTable exportarNombre={`detalle_comision_${sel.numero_empleado}`} buscador={false} filas={det.filter(d => d.empleado_id === sel.empleado_id)} sinPaginacion
              vacio={{ title: 'Sin renglones', description: 'No hay detalle para este podólogo.' }}
              columnas={[{ key: 'fecha', label: 'Fecha', render: d => fecha(d.fecha) }, { key: 'tipo', label: 'Tipo', filtro: true }, { key: 'concepto', label: 'Concepto' }, { key: 'base', label: 'Base', align: 'right', render: d => moneda(d.base) }, { key: 'pct', label: '%', align: 'right', render: d => `${d.pct}%` }, { key: 'comision', label: 'Comisión', align: 'right', render: d => moneda(d.comision) }, { key: 'referencia_detalle_id', label: 'Ajuste de', render: d => (d.referencia_detalle_id ? <span className="bd a">Referencia</span> : '') }]} /></div>}
          {admin && matriz.conceptos.length > 0 && <div className="card" style={{ marginTop: 14 }}><h3>Base por concepto y podólogo</h3>
            <div className="tabla-wrap"><table><thead><tr><th>Concepto</th>{matriz.emps.map(e => <th key={e} className="num">{nombre(e).split(' ').slice(0, 2).join(' ')}</th>)}</tr></thead>
              <tbody>{matriz.conceptos.map(([k, v]) => <tr key={k}><td>{k}</td>{matriz.emps.map(e => <td key={e} className="num">{v[e] ? moneda(v[e]) : '—'}</td>)}</tr>)}</tbody></table></div></div>}
        </>}
      </Estado>}
      {tab === 'carga' && admin && <CargarDetalle periodo={periodo} detalle={det} />}
      {tab === 'esquemas' && admin && <Esquemas ESQ={ESQ} />}
      {tab === 'metas' && <Metas admin={admin} />}

      <Modal open={!!nuevo} onClose={() => setNuevo(null)} title="Nuevo periodo de comisiones" size="sm" footer={<><button className="btn o" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={crear}>Crear</button></>}>
        {nuevo && <div style={{ display: 'grid', gap: 10 }}><FormField label="Desde" type="date" value={nuevo.desde} onChange={e => setNuevo({ ...nuevo, desde: e.target.value })} /><FormField label="Hasta" type="date" value={nuevo.hasta} onChange={e => setNuevo({ ...nuevo, hasta: e.target.value })} /></div>}
      </Modal>
      <Modal open={!!reabrir} onClose={() => setReabrir(null)} title="Reabrir periodo cerrado" size="sm" footer={<><button className="btn o" onClick={() => setReabrir(null)}>Cancelar</button><button className="btn red" disabled={ocupado} onClick={reabrirOk}>Reabrir</button></>}>
        {reabrir && <FormField label="Motivo (queda en bitácora)" as="textarea" value={reabrir.motivo} onChange={e => setReabrir({ motivo: e.target.value })} />}
      </Modal>
      {dialogo}
    </div>
  )
}
