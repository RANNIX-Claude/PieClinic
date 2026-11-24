// Estado de resultados (EDR) — mockup 35; clon funcional de IRP EDR.jsx adaptado a edr_* / prp_edr*.
//  proy_ = MANUAL (solo administrador, RPC edr_guardar_proyeccion). real_ = AUTOMÁTICO (edr_recalcular) + ajustes con motivo.
import { useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { RefreshCw, Lock, Unlock, Send, Plus } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, rpc, insertar, actualizar, esVistaInexistente } from '../../lib/api'
import { moneda, porcentaje } from '../../lib/formato'
import { usePermiso } from '../../lib/permisos'
import { armarEDR, consolidarSedes, puedeProyectar, semaforoVariacion, variacionPct } from '../../lib/finanzas/edr.js'
import { MESES } from '../../lib/finanzas/constantes.js'
import { sumarDias } from '../../lib/finanzas/semana.js'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import Tabs from '../../components/ui/Tabs'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import EmptyState from '../../components/ui/EmptyState'
import StatusBadge from '../../components/ui/StatusBadge'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { SelectorMes, anioMesActual, BotonesExportar, VistaNoDisponible, mensajeError, TablaImprimible } from './componentes/comunes.jsx'

const pctTxt = v => (v == null ? '—' : `${Math.round(v + 100)}%`) // «Real vs Proy» como % del proyectado
const COLOR = { v: 'var(--green)', a: 'var(--gold)', r: 'var(--red)', n: 'var(--muted)' }

export default function EDR() {
  const { sedes, sedeActivaId, rol } = useApp()
  const puedeEscribir = usePermiso('edr.proyectar')
  const qc = useQueryClient()
  const hoy = anioMesActual()
  const [{ anio, mes }, setPeriodo] = useState(hoy)
  const [tab, setTab] = useState('tablero')
  const [vista, setVista] = useState('consolidado') // consolidado | sede
  const [sedeId, setSedeId] = useState(sedeActivaId ?? '')
  const [comparar, setComparar] = useState(false)
  const [desglose, setDesglose] = useState(null)
  const [ajuste, setAjuste] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setSedeId(sedeActivaId ?? '') }, [sedeActivaId])

  const anterior = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
  const sedeEfectiva = sedeId || null
  const porSede = vista === 'sede' || !!sedeEfectiva

  const cargarEDR = async (a, m) => {
    const r = await leer('prp_edr', { sedeId: sedeEfectiva, filtros: { anio: a, mes: m }, orden: [{ columna: 'orden' }] })
    if (r.error && !esVistaInexistente(r.error)) throw new Error(r.error.message)
    return { filas: r.data, noDisponible: esVistaInexistente(r.error) }
  }
  const q = useQuery({ queryKey: ['finanzas', 'edr', 'filas', sedeEfectiva, anio, mes], queryFn: () => cargarEDR(anio, mes) })
  const qAnt = useQuery({ queryKey: ['finanzas', 'edr', 'filas', sedeEfectiva, anterior.anio, anterior.mes], queryFn: () => cargarEDR(anterior.anio, anterior.mes), enabled: comparar })
  const qCons = useQuery({
    queryKey: ['finanzas', 'edr', 'consolidado', anio, mes],
    enabled: !sedeEfectiva && vista === 'consolidado',
    queryFn: async () => { const r = await leer('prp_edr_consolidado', { sedeCol: false, filtros: { anio, mes }, orden: [{ columna: 'orden' }] }); return r.data },
  })
  const qRen = useQuery({
    queryKey: ['finanzas', 'edr', 'renglones'],
    queryFn: async () => { const r = await leer('edr_renglones', { sedeCol: false, filtros: { activo: true }, orden: [{ columna: 'orden' }] }); return r.data },
  })
  const qPer = useQuery({
    queryKey: ['finanzas', 'edr', 'periodos', anio, mes],
    queryFn: async () => { const r = await leer('edr_periodos', { sedeCol: 'sede_id', filtros: { anio, mes } }); return r.data },
  })
  const qRes = useQuery({
    queryKey: ['finanzas', 'edr', 'resultados', sedeEfectiva],
    queryFn: async () => { const r = await leer('prp_edr_resultados', { sedeId: sedeEfectiva, filtros: { anio: { gte: anio - 1 } }, limite: 2000 }); return r.data },
  })

  const filasSede = q.data?.filas ?? []
  const filasActuales = useMemo(() => {
    if (sedeEfectiva) return filasSede
    if (vista === 'consolidado') return qCons.data?.length ? qCons.data : consolidarSedes(filasSede)
    return filasSede
  }, [filasSede, qCons.data, vista, sedeEfectiva])
  const consolidadoParcial = !sedeEfectiva && vista === 'consolidado' && !qCons.data?.length && filasSede.length > 0

  const edr = useMemo(() => armarEDR(filasActuales), [filasActuales])
  const edrAnt = useMemo(() => armarEDR(sedeEfectiva ? qAnt.data?.filas ?? [] : consolidarSedes(qAnt.data?.filas ?? [])), [qAnt.data, sedeEfectiva])

  const periodos = qPer.data ?? []
  const periodoDe = sid => periodos.find(p => p.sede_id === sid)
  const estadoPeriodo = sedeEfectiva ? periodoDe(sedeEfectiva)?.estado : periodos.length && periodos.every(p => p.estado === 'cerrado') ? 'cerrado' : periodos.length && periodos.every(p => p.estado === 'publicado' || p.estado === 'cerrado') ? 'publicado' : periodos.length ? 'en_elaboracion' : null
  const cerrado = estadoPeriodo === 'cerrado'

  const ultimoCalculo = useMemo(() => filasActuales.map(f => f.real_calculado_en).filter(Boolean).sort().pop(), [filasActuales])
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas', 'edr'] })

  async function recalcular() {
    setOcupado(true)
    const { error } = await rpc('edr_recalcular', { p_anio: anio, p_mes: mes })
    setOcupado(false)
    if (error) return toast.error(mensajeError(error))
    toast.success('Real recalculado desde ingresos, gastos y fondo.')
    refrescar()
  }
  async function cambiarEstado(nuevo) {
    const ps = sedeEfectiva ? [periodoDe(sedeEfectiva)].filter(Boolean) : periodos
    if (!ps.length) return toast.error('No hay periodos en elaboración para este mes. Captura una proyección o recalcula primero.')
    setOcupado(true)
    try {
      for (const p of ps) {
        if (p.estado === 'cerrado') continue
        const { error } = await actualizar('edr_periodos', p.id, { estado: nuevo })
        if (error) throw error
      }
      toast.success(nuevo === 'publicado' ? 'EDR publicado.' : 'EDR regresado a elaboración.')
      refrescar()
    } catch (e) { toast.error(mensajeError(e)) } finally { setOcupado(false) }
  }
  async function cerrarMes() {
    setOcupado(true)
    const { error } = await rpc('cerrar_periodo', { p_tipo: 'mes', p_fecha: `${anio}-${String(mes).padStart(2, '0')}-01`, p_sede: sedeEfectiva })
    setOcupado(false); setConfirmar(null)
    if (error) return toast.error(mensajeError(error))
    toast.success('Mes cerrado.'); refrescar()
  }

  // Excel / PDF
  const lineasExport = edr.secciones.flatMap(s => [
    { concepto: s.titulo.toUpperCase(), proy: '', real: '', dif: '', pct: '' },
    ...s.filas.map(f => ({ concepto: f.renglon_nombre, proy: Number(f.proy_importe), real: Number(f.real_importe), dif: Number(f.real_importe) - Number(f.proy_importe), pct: pctTxt(variacionPct(f.real_importe, f.proy_importe)) })),
    { concepto: `Total ${s.titulo.toLowerCase()}`, proy: s.total.proy, real: s.total.real, dif: s.total.var, pct: pctTxt(s.total.pct) },
  ]).concat([{ concepto: 'UTILIDAD (sin impuestos)', proy: edr.utilidad.proy, real: edr.utilidad.real, dif: edr.utilidad.var, pct: pctTxt(edr.utilidad.pct) }])
  const colsExport = [{ key: 'concepto', label: 'Concepto' }, { key: 'proy', label: 'Proyectado (proy_)', formato: 'moneda' }, { key: 'real', label: 'Real (real_)', formato: 'moneda' }, { key: 'dif', label: 'Diferencia', formato: 'moneda' }, { key: 'pct', label: 'Real vs Proy' }]
  const nombreVista = sedeEfectiva ? sedes.find(s => s.id === sedeEfectiva)?.nombre : 'Consolidado'

  // últimos 6 meses
  const serie = useMemo(() => {
    const acum = new Map()
    for (const r of qRes.data ?? []) {
      const k = `${r.anio}-${String(r.mes).padStart(2, '0')}`
      const a = acum.get(k) ?? { k, ing: 0, gas: 0, proy: 0 }
      a.ing += Number(r.real_ingresos) || 0; a.gas += Number(r.real_gastos) || 0; a.proy += Number(r.proy_ingresos) || 0
      acum.set(k, a)
    }
    const hasta = `${anio}-${String(mes).padStart(2, '0')}`
    return [...acum.values()].filter(a => a.k <= hasta).sort((a, b) => a.k.localeCompare(b.k)).slice(-6)
      .map(a => ({ mes: MESES[Number(a.k.slice(5)) - 1].slice(0, 3), Ingresos: Math.round(a.ing), Gastos: Math.round(a.gas), Proyectado: Math.round(a.proy) }))
  }, [qRes.data, anio, mes])

  // Por sede (mes) — del resultado
  const porSedeMes = useMemo(() => (qRes.data ?? []).filter(r => r.anio === anio && r.mes === mes), [qRes.data, anio, mes])

  if (q.data?.noDisponible) return <div className="pagina"><PageHeader titulo="Estado de resultados (EDR)" /><VistaNoDisponible nombre="prp_edr" /></div>

  const sinDatos = !q.isLoading && !filasActuales.length && !(qRen.data ?? []).length

  return (
    <div className="pagina">
      <PageHeader titulo="Estado de resultados (EDR)" subtitulo={`${MESES[mes - 1].replace(/^./, c => c.toUpperCase())} ${anio} · proyectado (captura manual) vs. real (automático)${nombreVista ? ` · ${nombreVista}` : ''}`}
        acciones={<>
          <button type="button" className="btn o" onClick={() => setPeriodo(anterior)}>‹ Mes anterior</button>
          <button type="button" className="btn o" onClick={() => setPeriodo(hoy)}>Mes actual</button>
          <BotonesExportar nombre={`edr_${anio}-${String(mes).padStart(2, '0')}`} titulo={`Estado de resultados ${MESES[mes - 1]} ${anio} — ${nombreVista}`} entidad="edr"
            hojas={[{ nombre: 'EDR', columnas: colsExport, filas: lineasExport }]} deshabilitado={!filasActuales.length}>
            <TablaImprimible columnas={colsExport.map(c => ({ ...c, align: c.key === 'concepto' || c.key === 'pct' ? 'left' : 'right' }))}
              filas={lineasExport.map(l => ({ ...l, proy: l.proy === '' ? '' : moneda(l.proy), real: l.real === '' ? '' : moneda(l.real), dif: l.dif === '' ? '' : moneda(l.dif) }))} />
          </BotonesExportar>
        </>} />

      <Tabs value={tab} onChange={setTab} items={[{ id: 'tablero', label: 'Tablero' }, { id: 'elaboracion', label: 'En elaboración (proyecciones)', oculto: !puedeProyectar(rol) }]} />

      <div className="toolbar" style={{ margin: '12px 0' }}>
        <SelectorMes anio={anio} mes={mes} onChange={setPeriodo} />
        <select value={sedeId} onChange={e => setSedeId(e.target.value)} aria-label="Sede">
          <option value="">Todas las sedes</option>
          {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {!sedeId && tab === 'tablero' && (
          <select value={vista} onChange={e => setVista(e.target.value)} aria-label="Vista">
            <option value="consolidado">Vista: consolidado</option>
            <option value="sede">Vista: por sede (separado)</option>
          </select>
        )}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={comparar} onChange={e => setComparar(e.target.checked)} style={{ width: 'auto' }} /> Comparar con mes anterior</label>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {estadoPeriodo && <StatusBadge estado={estadoPeriodo} />}
          {ultimoCalculo && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Real calculado: {new Date(ultimoCalculo).toLocaleString('es-MX')}</span>}
          {puedeEscribir && <button type="button" className="btn o sm" onClick={recalcular} disabled={ocupado || cerrado}><RefreshCw size={12} style={{ verticalAlign: -2 }} /> Recalcular real</button>}
        </span>
      </div>

      {consolidadoParcial && <div className="card" style={{ marginBottom: 12, fontSize: 12 }}>El consolidado oficial solo se muestra con todas las sedes asignadas (P-135). Esta suma es de las sedes a las que tienes acceso.</div>}
      {sinDatos && <EmptyState title="Sin estado de resultados" description="Aún no hay renglones ni periodos para este mes. Recalcula el real o captura una proyección." />}
      {q.isLoading || qRen.isLoading ? <LoadingSpinner /> : q.error ? <EmptyState title="No se pudo cargar" description={q.error.message} /> : (
        <>
          {tab === 'tablero' && (
            <>
              <div className="grid-kpis">
                <KPICard title="Ingresos reales" value={moneda(edr.secciones[0].total.real)} subtitle={`Proyectado ${moneda(edr.secciones[0].total.proy)} · ${pctTxt(edr.secciones[0].total.pct)}`} color="var(--green)"
                  trend={comparar && edrAnt.secciones[0].total.real ? Math.round(((edr.secciones[0].total.real - edrAnt.secciones[0].total.real) / edrAnt.secciones[0].total.real) * 100) : undefined} />
                <KPICard title="Gastos reales" value={moneda(edr.secciones[1].total.real + edr.secciones[2].total.real)} subtitle={`Proyectado ${moneda(edr.secciones[1].total.proy + edr.secciones[2].total.proy)}`} color="var(--red)" />
                <KPICard title="Utilidad (sin impuestos)" value={moneda(edr.utilidad.real)} subtitle={`Proyectada ${moneda(edr.utilidad.proy)} · ${pctTxt(edr.utilidad.pct)}`} color="var(--accent)"
                  ayuda="Utilidad gerencial: ingresos − gastos − fijos. El IVA queda como memo, fuera de la utilidad (P-100)." />
                <KPICard title="Margen real" value={porcentaje(edr.margenPct)} subtitle="Utilidad / ingresos" color="var(--gold)" />
              </div>

              {vista === 'sede' && !sedeEfectiva ? (
                sedes.map(s => <TablaEDR key={s.id} titulo={s.nombre} edr={armarEDR(filasSede.filter(f => f.sede_id === s.id))} comparar={comparar} edrAnt={null} onDesglose={(f) => setDesglose({ ...f, sede_id: s.id, sede_nombre: s.nombre })} />)
              ) : (
                <TablaEDR titulo={nombreVista} edr={edr} comparar={comparar} edrAnt={edrAnt} onDesglose={f => setDesglose(f)} sedeUnica={sedeEfectiva} />
              )}

              <div className="grid2" style={{ marginTop: 14 }}>
                <div className="card">
                  <h3>Por sede (real, mes)</h3>
                  {!porSedeMes.length ? <EmptyState compacto title="Sin datos" description="No hay resultados por sede para este mes." /> : (
                    <div className="tabla-wrap"><table><thead><tr><th>Sede</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                      <tbody>{porSedeMes.map(r => <tr key={r.sede_id}><td>{r.sede_nombre}</td><td className="num">{moneda(r.real_ingresos)}</td><td className="num">{moneda(r.real_gastos)}</td><td className="num">{moneda(r.real_utilidad)}</td><td className="num">{porcentaje(r.real_margen_pct)}</td></tr>)}</tbody></table></div>
                  )}
                </div>
                <div className="card">
                  <h3>Últimos 6 meses (real)</h3>
                  {!serie.length ? <EmptyState compacto title="Sin histórico" description="Aún no hay meses calculados." /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={serie}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="mes" /><YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} /><Tooltip formatter={v => moneda(v)} /><Legend />
                        <Line type="monotone" dataKey="Ingresos" stroke="var(--green)" strokeWidth={2} /><Line type="monotone" dataKey="Gastos" stroke="var(--red)" strokeWidth={2} /><Line type="monotone" dataKey="Proyectado" stroke="var(--accent)" strokeDasharray="4 4" /></LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {puedeEscribir && (
                <div className="card" style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <b style={{ fontSize: 13 }}>Estado del mes:</b> {estadoPeriodo ? <StatusBadge estado={estadoPeriodo} /> : <span style={{ color: 'var(--muted)' }}>sin periodo</span>}
                  {estadoPeriodo === 'en_elaboracion' && <button type="button" className="btn sm" disabled={ocupado} onClick={() => cambiarEstado('publicado')}><Send size={12} style={{ verticalAlign: -2 }} /> Publicar</button>}
                  {estadoPeriodo === 'publicado' && <button type="button" className="btn o sm" disabled={ocupado} onClick={() => cambiarEstado('en_elaboracion')}>Regresar a elaboración</button>}
                  {estadoPeriodo && !cerrado && <button type="button" className="btn red sm" disabled={ocupado} onClick={() => setConfirmar('cerrar')}><Lock size={12} style={{ verticalAlign: -2 }} /> Cerrar mes</button>}
                  {cerrado && <span style={{ fontSize: 12, color: 'var(--muted)' }}><Unlock size={12} style={{ verticalAlign: -2 }} /> Para reabrir usa «Cierre de periodos» (con motivo).</span>}
                </div>
              )}
            </>
          )}

          {tab === 'elaboracion' && (
            <Elaboracion renglones={qRen.data ?? []} filas={filasSede} sedes={sedes} sedeId={sedeEfectiva} anio={anio} mes={mes} cerrado={cerrado} periodos={periodos}
              onGuardado={refrescar} onAjuste={setAjuste} />
          )}
        </>
      )}

      <Desglose abierto={desglose} anio={anio} mes={mes} sedeFallback={sedeEfectiva} sedes={sedes} onClose={() => setDesglose(null)} onAjuste={setAjuste} puedeAjustar={puedeEscribir && !cerrado} />
      <AjusteModal ajuste={ajuste} periodos={periodos} onClose={() => setAjuste(null)} onGuardado={() => { setAjuste(null); refrescar() }} />
      <ConfirmDialog open={confirmar === 'cerrar'} titulo="Cerrar el mes" peligro textoConfirmar="Cerrar mes" ocupado={ocupado} onCancel={() => setConfirmar(null)} onConfirm={cerrarMes}
        mensaje={`Se cerrará ${MESES[mes - 1]} ${anio}${sedeEfectiva ? ' para la sede seleccionada' : ' para toda la clínica'}. Los registros con fecha en ese mes ya no se podrán crear, editar ni borrar (ajustes en el periodo vigente).`} />
    </div>
  )
}

function TablaEDR({ titulo, edr, comparar, edrAnt, onDesglose, sedeUnica }) {
  const fila = (f, s) => {
    const sem = semaforoVariacion(f.renglon_tipo, f.real_importe, f.proy_importe)
    const pct = variacionPct(f.real_importe, f.proy_importe)
    const ant = comparar && edrAnt ? edrAnt.secciones.find(x => x.tipo === s.tipo)?.filas.find(x => x.renglon_clave === f.renglon_clave) : null
    return (
      <tr key={f.renglon_clave}>
        <td>{f.renglon_nombre}</td>
        <td className="num">{moneda(f.proy_importe)}</td>
        <td className="num"><button type="button" className="btn ghost sm" style={{ padding: '0 4px', color: 'var(--text)', fontWeight: 700 }} title="Ver desglose" onClick={() => onDesglose(f)}>{moneda(f.real_importe)}</button>
          {Number(f.real_ajustes) !== 0 && <span title={`Incluye ajustes manuales por ${moneda(f.real_ajustes)}`} style={{ color: 'var(--gold)' }}> *</span>}</td>
        <td className="num">{moneda(Number(f.real_importe) - Number(f.proy_importe))}</td>
        <td className="num" style={{ color: COLOR[sem], fontWeight: 700 }}>{pctTxt(pct)}</td>
        {comparar && <td className="num">{ant ? moneda(ant.real_importe) : '—'}</td>}
      </tr>
    )
  }
  const tot = (txt, t, fuerte) => (
    <tr style={{ fontWeight: 800, background: fuerte ? 'var(--accent-light)' : undefined }}>
      <td>{txt}</td><td className="num">{moneda(t.proy)}</td><td className="num">{moneda(t.real)}</td><td className="num">{moneda(t.var)}</td><td className="num">{pctTxt(t.pct)}</td>{comparar && <td />}
    </tr>
  )
  return (
    <div className="card" style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
      <div className="tabla-wrap"><table>
        <thead><tr><th>Concepto {titulo ? `· ${titulo}` : ''}</th><th className="num">Proyectado (proy_)</th><th className="num">Real (real_)</th><th className="num">Diferencia</th><th className="num">Real vs Proy</th>{comparar && <th className="num">Mes anterior (real)</th>}</tr></thead>
        <tbody>
          {edr.secciones.filter(s => s.filas.length).map(s => (
            <FragmentoSeccion key={s.tipo} s={s} fila={fila} tot={tot} cols={comparar ? 6 : 5} />
          ))}
          {tot('Utilidad (sin impuestos)', edr.utilidad, true)}
        </tbody></table></div>
      {!edr.secciones.some(s => s.filas.length) && <EmptyState compacto title="Sin renglones" description="No hay líneas del EDR en esta vista." />}
    </div>
  )
}
function FragmentoSeccion({ s, fila, tot, cols }) {
  return (
    <>
      <tr><td colSpan={cols} style={{ fontWeight: 800, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', paddingTop: 12 }}>{s.titulo}</td></tr>
      {s.filas.map(f => fila(f, s))}
      {s.tipo !== 'memo' && tot(`Total ${s.titulo.toLowerCase()}`, s.total)}
    </>
  )
}

// Captura manual de proyecciones (solo administrador): proy_ únicamente por RPC edr_guardar_proyeccion
function Elaboracion({ renglones, filas, sedes, sedeId, anio, mes, cerrado, periodos, onGuardado, onAjuste }) {
  const { rol } = useApp()
  const puedeEscribir = usePermiso('edr.proyectar')
  const [valores, setValores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const sedeActual = sedeId
  const lineaDe = clave => filas.find(f => f.renglon_clave === clave && f.sede_id === sedeActual)
  useEffect(() => setValores({}), [sedeActual, anio, mes])
  if (!puedeProyectar(rol)) return <EmptyState title="Solo Administración" description="Las proyecciones son manuales y solo las captura el administrador." />
  if (!sedeActual) return <EmptyState title="Elige una sede" description="La proyección se captura por sede y mes. Selecciona una sede en el filtro superior." />
  const sede = sedes.find(s => s.id === sedeActual)
  const cambios = Object.entries(valores).filter(([c, v]) => v !== '' && Number(v) !== Number(lineaDe(c)?.proy_importe ?? 0))
  async function guardar() {
    setGuardando(true)
    let ok = 0
    for (const [clave, v] of cambios) {
      const { error } = await rpc('edr_guardar_proyeccion', { p_sede: sedeActual, p_anio: anio, p_mes: mes, p_renglon: clave, p_importe: Number(v) })
      if (error) { toast.error(`${clave}: ${mensajeError(error)}`); break }
      ok++
    }
    setGuardando(false)
    if (ok) { toast.success(`${ok} proyección(es) guardada(s).`); setValores({}); onGuardado() }
  }
  const tipos = [['ingreso', 'Ingresos'], ['gasto', 'Gastos'], ['fijo', 'Gastos fijos'], ['memo', 'Memo (IVA)']]
  const periodo = periodos.find(p => p.sede_id === sedeActual)
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>Proyección manual · {sede?.nombre} · {MESES[mes - 1]} {anio}</b> {periodo && <StatusBadge estado={periodo.estado} />}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>El real es automático y no se edita; los ajustes llevan motivo y quedan en bitácora.</span>
        <button type="button" className="btn" style={{ marginLeft: 'auto' }} disabled={!cambios.length || guardando || cerrado || !puedeEscribir} onClick={guardar}>{guardando ? 'Guardando…' : `Guardar proyecciones (${cambios.length})`}</button>
      </div>
      {cerrado && <div style={{ padding: '0 14px 10px', color: 'var(--red)', fontSize: 12 }}>El periodo está cerrado: no se puede capturar la proyección.</div>}
      <div className="tabla-wrap"><table>
        <thead><tr><th>Renglón</th><th className="num">Proyectado (proy_)</th><th className="num">Real automático</th><th className="num">Ajustes</th><th className="num">Real</th><th /></tr></thead>
        <tbody>
          {tipos.map(([t, tit]) => {
            const rs = renglones.filter(r => r.tipo === t)
            if (!rs.length) return null
            return [
              <tr key={t}><td colSpan={6} style={{ fontWeight: 800, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', paddingTop: 12 }}>{tit}</td></tr>,
              ...rs.map(r => {
                const l = lineaDe(r.clave)
                return (
                  <tr key={r.clave}>
                    <td>{r.nombre}</td>
                    <td className="num"><input type="number" step="0.01" style={{ width: 130, textAlign: 'right' }} disabled={cerrado} value={valores[r.clave] ?? (l ? l.proy_importe : '')} placeholder="0.00"
                      onChange={e => setValores(v => ({ ...v, [r.clave]: e.target.value }))} /></td>
                    <td className="num">{moneda(l?.real_auto ?? 0)}</td>
                    <td className="num">{moneda(l?.real_ajustes ?? 0)}</td>
                    <td className="num">{moneda(l?.real_importe ?? 0)}</td>
                    <td><button type="button" className="btn o sm" disabled={cerrado || !periodo} title={periodo ? 'Ajuste manual con motivo' : 'Guarda primero una proyección o recalcula para crear el periodo'}
                      onClick={() => onAjuste({ sede_id: sedeActual, renglon_id: r.id, renglon_nombre: r.nombre })}><Plus size={11} /> Ajuste</button></td>
                  </tr>
                )
              }),
            ]
          })}
        </tbody></table></div>
    </div>
  )
}

function Desglose({ abierto, anio, mes, sedeFallback, sedes, onClose, onAjuste, puedeAjustar }) {
  const sede = abierto?.sede_id ?? sedeFallback
  const q = useQuery({
    queryKey: ['finanzas', 'edr', 'desglose', abierto?.renglon_clave, sede, anio, mes],
    enabled: !!abierto,
    queryFn: async () => {
      const sedesLista = sede ? [sede] : sedes.map(s => s.id)
      const out = []
      for (const sid of sedesLista) {
        const { data, error } = await rpc('edr_desglose', { p_sede: sid, p_anio: anio, p_mes: mes, p_renglon: abierto.renglon_clave })
        if (error) throw new Error(error.message)
        out.push(...(data ?? []).map(x => ({ ...x, sede: sedes.find(s => s.id === sid)?.nombre })))
      }
      return out
    },
  })
  const porOrigen = useMemo(() => { const m = {}; for (const x of q.data ?? []) { m[x.origen] = m[x.origen] ?? { n: 0, t: 0 }; m[x.origen].n++; m[x.origen].t += Number(x.importe) } return m }, [q.data])
  return (
    <Modal open={!!abierto} onClose={onClose} size="wide" title={`Desglose · ${abierto?.renglon_nombre ?? ''}${abierto?.sede_nombre ? ` · ${abierto.sede_nombre}` : ''}`}
      footer={<>{puedeAjustar && sede && <button type="button" className="btn o" onClick={() => { onAjuste({ sede_id: sede, renglon_id: abierto.renglon_id, renglon_nombre: abierto.renglon_nombre }); onClose() }}>Agregar ajuste manual</button>}<button type="button" className="btn" onClick={onClose}>Cerrar</button></>}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Registros que integran el importe real (base sin IVA). El real se calcula automáticamente; para corregirlo agrega un ajuste con motivo.</div>
      {q.isLoading ? <LoadingSpinner /> : q.error ? <EmptyState compacto title="No se pudo cargar" description={q.error.message} /> : !q.data?.length ? <EmptyState compacto title="Sin registros" description="Este renglón no tiene registros en el mes." /> : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {Object.entries(porOrigen).map(([o, v]) => <span key={o} className="bd m">{o}: {v.n} · {moneda(v.t)}</span>)}
          </div>
          <div className="tabla-wrap"><table><thead><tr><th>Origen</th><th>Fecha</th><th>Descripción</th>{!sede || true ? <th>Sede</th> : null}<th className="num">Importe</th></tr></thead>
            <tbody>{q.data.map((x, i) => <tr key={x.registro_id + i}><td>{x.origen}</td><td>{x.fecha}</td><td>{x.descripcion}</td><td>{x.sede}</td><td className="num">{moneda(x.importe)}</td></tr>)}</tbody></table></div>
        </>
      )}
    </Modal>
  )
}

function AjusteModal({ ajuste, periodos, onClose, onGuardado }) {
  const [importe, setImporte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { setImporte(''); setMotivo('') }, [ajuste])
  const periodo = periodos.find(p => p.sede_id === ajuste?.sede_id)
  const valido = Number(importe) !== 0 && motivo.trim().length >= 3 && periodo
  async function guardar() {
    setGuardando(true)
    try {
      const { error } = await insertar('edr_ajustes', { sede_id: ajuste.sede_id, periodo_id: periodo.id, renglon_id: ajuste.renglon_id, importe: Number(importe), motivo: motivo.trim() })
      if (error) throw error
      toast.success('Ajuste registrado.'); onGuardado()
    } catch (e) { toast.error(mensajeError(e)) } finally { setGuardando(false) }
  }
  return (
    <Modal open={!!ajuste} onClose={onClose} size="sm" title={`Ajuste manual · ${ajuste?.renglon_nombre ?? ''}`}
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!valido || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Registrar ajuste'}</button></>}>
      {!periodo && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>La sede no tiene periodo este mes. Recalcula el real o captura una proyección primero.</div>}
      <FormField label="Importe (positivo suma, negativo resta)" required type="number" step="0.01" value={importe} onChange={e => setImporte(e.target.value)} />
      <FormField label="Motivo" required as="textarea" value={motivo} onChange={e => setMotivo(e.target.value)} hint="Queda en bitácora. Los ajustes no se editan: se corrigen con otro ajuste." />
    </Modal>
  )
}
