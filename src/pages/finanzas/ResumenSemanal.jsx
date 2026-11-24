// Corte semanal operativo (mockup 32; clon de IRP ResumenSemanal). Semana sábado → viernes (P-088).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { rpc } from '../../lib/api'
import { moneda, numero, fecha, hoyISO } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DataTable from '../../components/ui/DataTable'
import { semanaCorte, sumarDias, etiquetaRango, estadoSemana } from '../../lib/finanzas/semana.js'
import { parametrosFinanzas } from '../../lib/finanzas/constantes.js'
import { variacionPeriodo } from '../../lib/finanzas/kpis.js'
import { useVista, BotonesExportar, TablaImprimible, VistaNoDisponible, mensajeError } from './componentes/comunes.jsx'
import { BotonCierre } from './componentes/cierres.jsx'

const CAMPOS = ['ingresos', 'ing_efectivo', 'ing_tarjeta_clip', 'ing_tarjeta', 'ing_transferencia', 'ing_cheque', 'ing_servicios', 'ing_productos', 'ing_anticipos', 'ing_planes', 'ing_mixtos', 'gastos', 'gastos_fondo', 'comisiones_terminal', 'neto', 'efectivo_a_depositar', 'por_validar', 'observados']
const sumaFilas = filas => Object.fromEntries(CAMPOS.map(c => [c, filas.reduce((s, f) => s + (Number(f[c]) || 0), 0)]))
const ETQ_ESTADO = { en_curso: 'En curso', por_cerrar: 'Por cerrar', cerrada: 'Cerrada', futura: 'Futura' }

export default function ResumenSemanal() {
  const { organizacion, sedeActivaId, sedeActiva } = useApp()
  const dow = parametrosFinanzas(organizacion).semana_inicio_dow
  const hoy = hoyISO()
  const [sel, setSel] = useState(() => semanaCorte(hoy, dow).inicio)
  const semana = semanaCorte(sel, dow)

  const hist = useVista('rs-hist', 'prp_resumen_semanal', { orden: { columna: 'semana_inicio', asc: false }, limite: 3000 })
  const cierresV = useVista('rs-cierres', 'prp_cierres_periodo', { sedeCol: false, filtros: { tipo: 'semana' }, limite: 500 })
  const cierres = cierresV.filas.filter(c => (c.sede_id ?? null) === (sedeActivaId ?? null))

  const rpcQ = useQuery({
    queryKey: ['finanzas', 'rs-rpc', sedeActivaId, semana.inicio],
    queryFn: async () => { const r = await rpc('resumen_semanal', { p_sede: sedeActivaId ?? null, p_fecha: semana.inicio }); if (r.error) throw r.error; return r.data },
  })
  const ingresosDet = useVista('rs-ing', 'prp_ingresos', { filtros: { fecha_pago: { gte: semana.inicio, lte: semana.fin } }, orden: { columna: 'fecha_pago', asc: false }, limite: 1000 })
  const gastosDet = useVista('rs-gas', 'prp_gastos', { filtros: { fecha: { gte: semana.inicio, lte: semana.fin }, estado: 'guardado' }, orden: { columna: 'fecha', asc: false }, limite: 1000 })

  // Historial: una fila por semana (suma de sedes en alcance) + la semana en curso aunque no tenga movimientos
  const semanas = useMemo(() => {
    const m = new Map()
    for (const f of hist.filas) { const a = m.get(f.semana_inicio) ?? []; a.push(f); m.set(f.semana_inicio, a) }
    const actual = semanaCorte(hoy, dow)
    if (!m.has(actual.inicio)) m.set(actual.inicio, [])
    return [...m.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([inicio, filas]) => ({ ...semanaCorte(inicio, dow), filas, t: sumaFilas(filas) }))
  }, [hist.filas, hoy, dow])

  const act = semanas.find(s => s.inicio === semana.inicio) ?? { ...semana, filas: [], t: sumaFilas([]) }
  const previa = semanas.find(s => s.inicio === sumarDias(semana.inicio, -7))
  const cierre = cierres.find(c => c.fecha_inicio === semana.inicio)
  const estado = estadoSemana(semana, hoy, cierres)
  const t = act.t
  const nCobros = ingresosDet.filas.length

  const gastosGrupo = useMemo(() => {
    const g = rpcQ.data?.gastos_por_grupo
    if (g && Object.keys(g).length) return Object.entries(g).map(([k, v]) => ({ concepto: k, importe: Number(v) })).sort((a, b) => b.importe - a.importe)
    const m = {}; gastosDet.filas.forEach(x => { m[x.grupo_nombre] = (m[x.grupo_nombre] ?? 0) + Number(x.total) })
    return Object.entries(m).map(([concepto, importe]) => ({ concepto, importe })).sort((a, b) => b.importe - a.importe)
  }, [rpcQ.data, gastosDet.filas])

  const formas = [
    { forma: 'Efectivo', importe: t.ing_efectivo, n: ingresosDet.filas.filter(i => i.forma_pago === 'efectivo').length },
    { forma: 'Tarjeta (terminal Clip)', importe: t.ing_tarjeta_clip, n: ingresosDet.filas.filter(i => i.forma_pago === 'tarjeta_clip').length },
    { forma: 'Tarjeta', importe: t.ing_tarjeta, n: ingresosDet.filas.filter(i => i.forma_pago === 'tarjeta').length },
    { forma: 'Transferencia / depósito', importe: t.ing_transferencia, n: ingresosDet.filas.filter(i => ['transferencia', 'deposito'].includes(i.forma_pago)).length },
    { forma: 'Cheque', importe: t.ing_cheque, n: ingresosDet.filas.filter(i => i.forma_pago === 'cheque').length },
  ]
  const conceptos = [
    { concepto: 'Servicios', importe: t.ing_servicios }, { concepto: 'Venta de productos', importe: t.ing_productos },
    { concepto: 'Anticipos y pagos en línea', importe: t.ing_anticipos }, { concepto: 'Planes y membresías', importe: t.ing_planes }, { concepto: 'Mixtos', importe: t.ing_mixtos },
  ]
  const porSede = act.filas.map(f => ({ sede: f.sede_nombre, ingresos: f.ingresos, gastos: f.gastos, neto: f.neto, efectivo: f.efectivo_a_depositar }))

  const colsIng = [
    { key: 'fecha_pago', label: 'Fecha', render: r => fecha(r.fecha_pago), valor: r => r.fecha_pago },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'concepto', label: 'Concepto', valor: r => r.concepto ?? r.clasificacion },
    { key: 'referencia', label: 'Referencia' },
    { key: 'forma_pago', label: 'Forma', filtro: true },
    { key: 'importe_neto', label: 'Importe', align: 'right', render: r => moneda(r.importe_neto) },
    { key: 'estatus_validacion', label: 'Estado', render: r => <StatusBadge estado={r.estatus_validacion} />, filtro: true },
  ]
  const colsGas = [
    { key: 'fecha', label: 'Fecha', render: r => fecha(r.fecha) },
    { key: 'sede_nombre', label: 'Sede', valor: r => r.sede_nombre ?? 'Compartido', filtro: true },
    { key: 'grupo_nombre', label: 'Categoría', filtro: true },
    { key: 'proveedor_nombre', label: 'Proveedor' },
    { key: 'metodo_pago', label: 'Método' },
    { key: 'total', label: 'Total', align: 'right', render: r => moneda(r.total) },
  ]
  const nav = n => setSel(sumarDias(semana.inicio, 7 * n))

  const hojas = [
    { nombre: 'Corte', columnas: [{ label: 'Concepto', key: 'k' }, { label: 'Importe', key: 'v', formato: 'moneda' }], filas: [
      { k: `Semana ${semana.etiqueta} (${semana.inicio} a ${semana.fin})`, v: '' }, { k: 'Ingresos', v: t.ingresos }, { k: 'Gastos', v: t.gastos }, { k: 'Neto', v: t.neto },
      { k: 'Efectivo a depositar', v: t.efectivo_a_depositar }, ...formas.map(f => ({ k: f.forma, v: f.importe })), ...conceptos.map(c => ({ k: c.concepto, v: c.importe })) ] },
    { nombre: 'Gastos por categoría', columnas: [{ label: 'Categoría', key: 'concepto' }, { label: 'Importe', key: 'importe', formato: 'moneda' }], filas: gastosGrupo },
    { nombre: 'Ingresos', columnas: [{ label: 'Fecha', key: 'fecha_pago' }, { label: 'Sede', key: 'sede_nombre' }, { label: 'Concepto', key: 'concepto' }, { label: 'Forma', key: 'forma_pago' }, { label: 'Importe', key: 'importe_neto', formato: 'moneda' }, { label: 'Estado', key: 'estatus_validacion' }], filas: ingresosDet.filas },
    { nombre: 'Gastos', columnas: [{ label: 'Fecha', key: 'fecha' }, { label: 'Sede', key: 'sede_nombre' }, { label: 'Categoría', key: 'grupo_nombre' }, { label: 'Proveedor', key: 'proveedor_nombre' }, { label: 'Total', key: 'total', formato: 'moneda' }], filas: gastosDet.filas },
  ]

  if (hist.noDisponible) return <div className="pagina"><PageHeader titulo="Resumen semanal" /><VistaNoDisponible nombre="prp_resumen_semanal" /></div>

  return (
    <div className="pagina">
      <PageHeader titulo="Corte semanal operativo" subtitulo={`Semana sábado → viernes · ${semana.etiqueta} · ${etiquetaRango(semana.inicio, semana.fin)} · ${sedeActiva?.nombre ?? 'todas mis sedes'}`}
        acciones={<>
          <BotonesExportar nombre={`corte_${semana.etiqueta}`} titulo={`Corte semanal ${semana.etiqueta} (${semana.inicio} a ${semana.fin})`} hojas={hojas} entidad="resumen_semanal">
            <TablaImprimible columnas={[{ key: 'k', label: 'Concepto' }, { key: 'v', label: 'Importe', align: 'right', render: r => (r.v === '' ? '' : moneda(r.v)) }]} filas={hojas[0].filas} />
            <h3>Gastos por categoría</h3>
            <TablaImprimible columnas={[{ key: 'concepto', label: 'Categoría' }, { key: 'importe', label: 'Importe', align: 'right', render: r => moneda(r.importe) }]} filas={gastosGrupo} />
          </BotonesExportar>
          <BotonCierre tipo="semana" fecha={semana.inicio} etiqueta={semana.etiqueta} sedeId={sedeActivaId} cierre={cierre} terminado={semana.fin < hoy} />
        </>} />

      <div className="grid2" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px' }}>
            <button type="button" className="btn o sm" onClick={() => nav(-1)} aria-label="Semana anterior"><ChevronLeft size={12} /></button>
            <b style={{ flex: 1, textAlign: 'center', fontSize: 13 }}>{semana.etiqueta} · {etiquetaRango(semana.inicio, semana.fin)}</b>
            <button type="button" className="btn o sm" onClick={() => nav(1)} aria-label="Semana siguiente" disabled={semana.fin >= hoy}><ChevronRight size={12} /></button>
          </div>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            {hist.cargando ? <LoadingSpinner /> : (
              <table><thead><tr><th>Semana</th><th className="num">Ingresos</th><th className="num">Neto</th><th>Estado</th></tr></thead>
                <tbody>{semanas.slice(0, 60).map(s => {
                  const e = estadoSemana(s, hoy, cierres)
                  return (
                    <tr key={s.inicio} className="clickable" onClick={() => setSel(s.inicio)} style={s.inicio === semana.inicio ? { background: 'var(--accent-light)' } : undefined}>
                      <td><b>{s.etiqueta}</b><div className="mini" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{etiquetaRango(s.inicio, s.fin)}</div></td>
                      <td className="num">{moneda(s.t.ingresos)}</td><td className="num">{moneda(s.t.neto)}</td>
                      <td><StatusBadge estado={e === 'cerrada' ? 'cerrada' : e === 'por_cerrar' ? 'pendiente' : 'enviado'} label={ETQ_ESTADO[e]} /></td>
                    </tr>)
                })}</tbody></table>
            )}
          </div>
        </div>

        <div>
          {rpcQ.error && <div className="card" style={{ borderLeft: '4px solid var(--gold)', marginBottom: 12, fontSize: 12.5 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {mensajeError(rpcQ.error)} Se muestra el resumen por sede disponible.</div>}
          {(t.por_validar > 0 || t.observados > 0) && (
            <div className="card" style={{ borderLeft: '4px solid var(--gold)', marginBottom: 12, fontSize: 12.5 }}>
              <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {numero(t.por_validar)} cobro(s) por validar y {numero(t.observados)} observado(s). Los observados no bloquean el corte. <Link to="/ingresos">Ir a ingresos</Link>
            </div>
          )}
          <div className="grid-kpis">
            <KPICard title="Ingresos de la semana" value={moneda(t.ingresos)} subtitle={`${numero(nCobros)} cobros`} color="var(--green)" trend={previa ? variacionPeriodo(t.ingresos, previa.t.ingresos) : undefined} />
            <KPICard title="Efectivo a depositar" value={moneda(t.efectivo_a_depositar)} subtitle="Efectivo cobrado − gastos del fondo" />
            <KPICard title="Gastos pagados" value={moneda(t.gastos)} subtitle={`${numero(gastosDet.filas.length)} gastos · fondo ${moneda(t.gastos_fondo)}`} color="var(--red)" />
            <KPICard title="Neto de la semana" value={moneda(t.neto)} subtitle={ETQ_ESTADO[estado]} color="var(--accent)" />
          </div>

          {!hist.cargando && !act.filas.length && <EmptyState title="Sin movimientos" description="No hay cobros ni gastos registrados en esta semana." />}

          <div className="grid2" style={{ marginBottom: 12 }}>
            <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Ingresos por concepto</h3>
              <table><tbody>{conceptos.map(c => <tr key={c.concepto}><td>{c.concepto}</td><td className="num">{moneda(c.importe)}</td></tr>)}
                <tr><td><b>Total ingresos</b></td><td className="num"><b>{moneda(t.ingresos)}</b></td></tr></tbody></table>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}><Link to="/ingresos" className="btn o sm">Ver cobros</Link></div>
            </div>
            <div className="card"><h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Gastos y fondo por categoría</h3>
              {gastosGrupo.length ? <table><tbody>{gastosGrupo.map(g => <tr key={g.concepto}><td>{g.concepto}</td><td className="num">{moneda(g.importe)}</td></tr>)}
                <tr><td><b>Total gastos</b></td><td className="num"><b>{moneda(t.gastos)}</b></td></tr></tbody></table> : <EmptyState compacto title="Sin gastos" description="No hay gastos guardados en la semana." />}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}><Link to="/gastos" className="btn o sm">Ver gastos</Link><Link to="/fondo-revolvente" className="btn o sm">Ver fondo</Link></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}><h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Desglose por forma de cobro</h3>
            <div className="tabla-wrap"><table><thead><tr><th>Forma de cobro</th><th className="num">Cobros</th><th className="num">Importe</th></tr></thead>
              <tbody>{formas.map(f => <tr key={f.forma}><td>{f.forma}</td><td className="num">{numero(f.n)}</td><td className="num">{moneda(f.importe)}</td></tr>)}</tbody></table></div>
            <div className="mini" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Comisiones de terminal pagadas en la semana: {moneda(t.comisiones_terminal)}.</div>
          </div>

          {porSede.length > 1 && (
            <div className="card" style={{ marginBottom: 12 }}><h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Por sede</h3>
              <div className="tabla-wrap"><table><thead><tr><th>Sede</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Neto</th><th className="num">Efectivo a depositar</th></tr></thead>
                <tbody>{porSede.map(s => <tr key={s.sede}><td>{s.sede}</td><td className="num">{moneda(s.ingresos)}</td><td className="num">{moneda(s.gastos)}</td><td className="num">{moneda(s.neto)}</td><td className="num">{moneda(s.efectivo)}</td></tr>)}</tbody></table></div>
            </div>
          )}

          {cierre && (
            <div className="card" style={{ marginBottom: 12, fontSize: 12.5 }}>
              <b>Cierre:</b> <StatusBadge estado={cierre.estado} /> · cerrado {fecha(cierre.cerrado_en)} · ingresos {moneda(cierre.ingresos)} · gastos {moneda(cierre.gastos)} · neto {moneda(cierre.neto)}
              {cierre.estado === 'reabierto' && <div>Reabierto {fecha(cierre.reabierto_en)}: {cierre.motivo_reapertura}</div>}
            </div>
          )}
        </div>
      </div>

      <h3 style={{ margin: '14px 0 8px' }}>Detalle de ingresos de la semana</h3>
      <DataTable columnas={colsIng} filas={ingresosDet.filas} cargando={ingresosDet.cargando} error={ingresosDet.error} exportarNombre={`ingresos_${semana.etiqueta}`}
        vacio={{ title: 'Sin cobros', description: 'No hay cobros en la semana.' }} acciones={<Link to="/ingresos" className="btn o sm">Editar en Ingresos</Link>} />
      <h3 style={{ margin: '14px 0 8px' }}>Detalle de gastos de la semana</h3>
      <DataTable columnas={colsGas} filas={gastosDet.filas} cargando={gastosDet.cargando} error={gastosDet.error} exportarNombre={`gastos_${semana.etiqueta}`}
        vacio={{ title: 'Sin gastos', description: 'No hay gastos guardados en la semana.' }} />
    </div>
  )
}
