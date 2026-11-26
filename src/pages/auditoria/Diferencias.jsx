// Consulta de diferencias (F7.1) — pantalla principal del dueño. Etapa 6.
// Filtros: rango de fechas, sucursal (una, varias o todas), auditor, producto o categoría, tipo (faltantes, sobrantes o ambas) y umbral mínimo en piezas o en pesos al costo.
// Orden por omisión: MAYOR DIFERENCIA VALORIZADA primero. Encabezado con totales, agrupaciones por sucursal / producto / auditor y exportación a Excel y PDF respetando los filtros.
// Todo se agrega en la base de datos (ctl_dif_consultar) y cada consulta queda en la bitácora de consultas. Solo dueño, supervisor y soporte (solo lectura): el rol de sucursal
// no entra (la base le responde PF403). Los valores van SIEMPRE al costo.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileText, Search, Eraser, Timer } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Tabs from '../../components/ui/Tabs'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import { useApp } from '../../context/AppContext'
import { usePermiso, esSuperadmin } from '../../lib/permisos'
import { consultarDiferencias, opcionesReportes } from '../../lib/auditoria/reportesApi'
import {
  limpiarFiltros, describirFiltros, NOMBRE_ESTADO_AJUSTE, VARIANTE_ESTADO_AJUSTE, NOMBRE_MODO_SESION, columnasExcelDiferencias, filasExcelDiferencias,
} from '../../lib/auditoria/reportes'
import { armarPdfDiferencias } from '../../lib/auditoria/diferenciasPdf'
import { descargarPdf } from '../../lib/auditoria/pdf'
import { mensajeError } from '../../lib/auditoria/roles'
import { exportarExcel } from '../../lib/finanzas/exportar'
import { fechaHora, moneda, numero, hoyISO, zonaHoraria } from '../../lib/formato'
import AgrupacionesDif from './reportes/AgrupacionesDif'
import { Aviso, Estado, restarDias, useRpc, colorValor } from './reportes/comun'

const TAM = 100
const ORDEN_COLUMNA = { fecha_hora: 'fecha', sucursal: 'sucursal', producto: 'producto', dif_piezas: 'piezas', dif_valor: 'valor' }
const inicial = () => ({ desde: restarDias(89), hasta: hoyISO(), sucursales: [], auditor: '', categoria: '', buscar: '', tipo: 'ambas', umbral_piezas: '', umbral_pesos: '', orden: 'valor' })

export default function Diferencias() {
  const { sedes, organizacion } = useApp()
  const verDif = usePermiso('auditoria.ver_diferencias')
  const nav = useNavigate()
  const [f, setF] = useState(inicial)
  const [aplicados, setAplicados] = useState(inicial)
  const [pagina, setPagina] = useState(0)
  const [tab, setTab] = useState('detalle')
  const [exportando, setExportando] = useState('')
  const [errExp, setErrExp] = useState('')
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const opciones = useRpc(['ctl-rep-opciones'], opcionesReportes, { enabled: verDif, staleTime: 60000 })
  const filtros = useMemo(() => limpiarFiltros({ ...aplicados, umbral_piezas: aplicados.umbral_piezas, umbral_pesos: aplicados.umbral_pesos }), [aplicados])
  const q = useRpc(['ctl-dif', filtros, pagina], () => consultarDiferencias({ ...filtros, limite: TAM, offset: pagina * TAM }), { enabled: verDif, placeholderData: prev => prev })
  const d = q.data
  const t = d?.totales

  const nombres = useMemo(() => ({
    sucursales: Object.fromEntries((opciones.data?.sucursales ?? sedes).map(s => [s.id, s.nombre])),
    auditores: Object.fromEntries((opciones.data?.auditores ?? []).map(a => [a.id, a.nombre])),
  }), [opciones.data, sedes])

  if (!verDif) {
    return (
      <div className="pagina">
        <PageHeader titulo="Diferencias" subtitulo="Esta pantalla es de dueño y supervisor" />
        <div className="card">Quien captura los conteos no ve diferencias ni saldos del sistema, en ninguna pantalla: así el conteo se hace a ciegas.</div>
      </div>
    )
  }

  const aplicar = () => { setPagina(0); setAplicados({ ...f }) }
  const limpiar = () => { const i = inicial(); setF(i); setAplicados(i); setPagina(0) }
  const alternarSucursal = id => set('sucursales', f.sucursales.includes(id) ? f.sucursales.filter(x => x !== id) : [...f.sucursales, id])

  async function traerTodo() {
    const r = await consultarDiferencias({ ...filtros, exportar: true })
    if (r.error) throw new Error(mensajeError(r.error))
    return r.data
  }
  async function exportar(formato) {
    setExportando(formato); setErrExp('')
    try {
      const todo = await traerTodo()
      const texto = describirFiltros(aplicados, nombres)
      if (formato === 'excel') {
        await exportarExcel('diferencias', [
          { nombre: 'Diferencias', columnas: columnasExcelDiferencias(), filas: filasExcelDiferencias(todo.filas, fechaHora) },
          { nombre: 'Resumen', columnas: [{ key: 'concepto', label: 'Concepto' }, { key: 'valor', label: 'Valor', formato: 'moneda' }], filas: [
            { concepto: texto, valor: '' }, { concepto: 'Faltantes (piezas)', valor: todo.totales.faltantes_piezas }, { concepto: 'Faltantes al costo', valor: todo.totales.faltantes_valor },
            { concepto: 'Sobrantes (piezas)', valor: todo.totales.sobrantes_piezas }, { concepto: 'Sobrantes al costo', valor: todo.totales.sobrantes_valor }, { concepto: 'Casos pendientes de ajuste', valor: todo.totales.casos_pendientes_ajuste },
            ...(todo.truncado ? [{ concepto: `Se exportaron las primeras ${todo.limite} filas: acote el rango`, valor: '' }] : []),
          ] },
          { nombre: 'Por sucursal', columnas: [{ key: 'sucursal', label: 'Sucursal' }, { key: 'faltantes_piezas', label: 'Faltantes (pzas)' }, { key: 'faltantes_valor', label: 'Faltantes al costo', formato: 'moneda' }, { key: 'sobrantes_valor', label: 'Sobrantes al costo', formato: 'moneda' }, { key: 'casos_pendientes', label: 'Casos pendientes' }], filas: todo.por_sucursal },
          { nombre: 'Por producto', columnas: [{ key: 'producto', label: 'Producto' }, { key: 'auditorias', label: 'Auditorías con diferencia' }, { key: 'sucursales', label: 'Sucursales' }, { key: 'faltantes_piezas', label: 'Faltantes (pzas)' }, { key: 'faltantes_valor', label: 'Faltantes al costo', formato: 'moneda' }], filas: todo.por_producto },
          { nombre: 'Por auditor', columnas: [{ key: 'auditor', label: 'Auditor' }, { key: 'auditorias', label: 'Auditorías hechas' }, { key: 'partidas', label: 'Partidas contadas' }, { key: 'lineas_con_diferencia', label: 'Con diferencia' }], filas: todo.por_auditor },
        ], { entidad: 'auditoria_diferencias', detalle: { filtros, filas: todo.filas.length } })
      } else {
        const doc = armarPdfDiferencias(todo, { filtrosTexto: texto, organizacion: organizacion?.nombre ?? '', fmtFecha: fechaHora })
        descargarPdf(doc.generar(), `diferencias_${hoyISO()}.pdf`)
      }
    } catch (e) { setErrExp(e.message) } finally { setExportando('') }
  }

  const columnas = [
    { key: 'fecha_hora', label: 'Fecha y hora', render: r => fechaHora(r.fecha_hora) },
    { key: 'sucursal', label: 'Sucursal' },
    { key: 'producto', label: 'Producto', render: r => <span title={r.codigo_barras}>{r.producto}</span> },
    { key: 'fisica', label: 'Física', align: 'right', sortable: false, render: r => numero(r.fisica) },
    { key: 'sistema', label: 'Sistema', align: 'right', sortable: false, render: r => numero(r.sistema) },
    { key: 'dif_piezas', label: 'Dif. (pzas)', align: 'right', render: r => <b style={{ color: colorValor(r.dif_piezas) }}>{Number(r.dif_piezas) > 0 ? '+' : ''}{numero(r.dif_piezas)}</b> },
    { key: 'dif_valor', label: 'Dif. al costo', align: 'right', render: r => <b style={{ color: colorValor(r.dif_valor) }}>{Number(r.dif_valor) > 0 ? '+' : Number(r.dif_valor) < 0 ? '−' : ''}{moneda(Math.abs(r.dif_valor))}</b> },
    { key: 'auditor', label: 'Auditor', sortable: false, render: r => r.auditor ?? '—' },
    { key: 'estado_ajuste', label: 'Ajuste', sortable: false, render: r => <StatusBadge estado={r.estado_ajuste} label={NOMBRE_ESTADO_AJUSTE[r.estado_ajuste]} variante={VARIANTE_ESTADO_AJUSTE[r.estado_ajuste]} /> },
    { key: 'nota', label: 'Nota', sortable: false, render: r => r.nota ?? '' },
    { key: 'modo', label: 'Origen', sortable: false, exportar: false, render: r => <span className="hint">{NOMBRE_MODO_SESION[r.modo] ?? r.modo}</span> },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Diferencias" subtitulo="Faltantes y sobrantes por sucursal, producto y auditor · valores al costo · lo que más dinero representa va primero"
        acciones={<>
          <button type="button" className="btn o sm" disabled={!!exportando || !d} onClick={() => exportar('excel')}><Download size={12} style={{ verticalAlign: -2 }} /> {exportando === 'excel' ? 'Preparando…' : 'Excel'}</button>
          <button type="button" className="btn o sm" disabled={!!exportando || !d} onClick={() => exportar('pdf')}><FileText size={12} style={{ verticalAlign: -2 }} /> {exportando === 'pdf' ? 'Preparando…' : 'PDF'}</button>
        </>} />
      {esSuperadmin() && <div style={{ marginBottom: 10 }}><Aviso>Cuenta de soporte RANNIX: lectura para diagnosticar. Cada consulta que haces queda en la bitácora de consultas.</Aviso></div>}

      <form className="card" onSubmit={e => { e.preventDefault(); aplicar() }} style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0, minWidth: 130 }}><label>Desde</label><input type="date" value={f.desde} max={f.hasta} onChange={e => set('desde', e.target.value)} /></div>
          <div className="field" style={{ margin: 0, minWidth: 130 }}><label>Hasta</label><input type="date" value={f.hasta} min={f.desde} onChange={e => set('hasta', e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label>Auditor</label>
            <select value={f.auditor} onChange={e => set('auditor', e.target.value)}><option value="">Todos</option>{(opciones.data?.auditores ?? []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div className="field" style={{ margin: 0 }}><label>Categoría</label>
            <select value={f.categoria} onChange={e => set('categoria', e.target.value)}><option value="">Todas</option>{(opciones.data?.categorias ?? []).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field" style={{ margin: 0 }}><label>Producto (nombre o código)</label><input value={f.buscar} placeholder="Buscar…" onChange={e => set('buscar', e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 150, flex: '0 1 170px' }}><label>Tipo</label>
            <select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="ambas">Faltantes y sobrantes</option><option value="faltantes">Solo faltantes</option><option value="sobrantes">Solo sobrantes</option></select></div>
          <div className="field" style={{ margin: 0, minWidth: 130, flex: '0 1 150px' }}><label>Umbral mínimo (piezas)</label><input type="number" min="0" step="1" value={f.umbral_piezas} placeholder="0" onChange={e => set('umbral_piezas', e.target.value)} /></div>
          <div className="field" style={{ margin: 0, minWidth: 130, flex: '0 1 170px' }}><label>Umbral mínimo (pesos al costo)</label><input type="number" min="0" step="50" value={f.umbral_pesos} placeholder="0" onChange={e => set('umbral_pesos', e.target.value)} /></div>
          <div className="field" style={{ margin: 0, minWidth: 150, flex: '0 1 190px' }}><label>Orden</label>
            <select value={f.orden} onChange={e => set('orden', e.target.value)}><option value="valor">Mayor diferencia valorizada</option><option value="piezas">Más piezas</option><option value="fecha">Más reciente</option><option value="sucursal">Sucursal</option><option value="producto">Producto</option></select></div>
          <button type="submit" className="btn sm"><Search size={12} style={{ verticalAlign: -2 }} /> Aplicar</button>
          <button type="button" className="btn o sm" onClick={limpiar}><Eraser size={12} style={{ verticalAlign: -2 }} /> Limpiar</button>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>Sucursales {f.sucursales.length === 0 ? '(todas)' : `(${f.sucursales.length} elegida${f.sucursales.length === 1 ? '' : 's'})`}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className={`btn sm ${f.sucursales.length === 0 ? '' : 'o'}`} onClick={() => set('sucursales', [])}>Todas</button>
            {(opciones.data?.sucursales ?? sedes).map(s => (
              <button key={s.id} type="button" aria-pressed={f.sucursales.includes(s.id)} className={`btn sm ${f.sucursales.includes(s.id) ? '' : 'o'}`} onClick={() => alternarSucursal(s.id)}>{s.nombre}</button>
            ))}
          </div>
        </div>
      </form>
      {errExp && <div style={{ marginTop: 8 }}><Aviso tono="alerta">No se pudo exportar: {errExp}</Aviso></div>}

      <Estado q={q} />
      {d && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <KPICard title="Faltantes" color="var(--red)" value={moneda(t.faltantes_valor)} subtitle={`${numero(t.faltantes_piezas)} pieza(s) · ${t.faltantes_lineas} renglón(es) · al costo`} />
            <KPICard title="Sobrantes" color="var(--green)" value={moneda(t.sobrantes_valor)} subtitle={`${numero(t.sobrantes_piezas)} pieza(s) · ${t.sobrantes_lineas} renglón(es) · al costo`} />
            <KPICard title="Neto" value={`${Number(t.neto_valor) < 0 ? '−' : ''}${moneda(Math.abs(t.neto_valor))}`} subtitle="Sobrantes menos faltantes" />
            <KPICard title="Casos pendientes de ajuste" color="var(--gold)" value={numero(t.casos_pendientes_ajuste)} subtitle={`${t.casos_ajustados} ya ajustado(s) · ${t.casos_total} caso(s) en total`}
              onClick={() => nav('/auditoria/casos')} />
            <KPICard title="Pedidos y no reportados" color={d.no_reportados ? 'var(--red)' : 'var(--green)'} value={numero(d.no_reportados)} subtitle="El silencio también es dato" />
          </div>
          <div className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Timer size={12} /> {d.total_filas} renglón(es) en el periodo {d.periodo.desde} a {d.periodo.hasta} · consultado en {d.ms} ms · zona {zonaHoraria()}. El conteo inicial no entra (fija el saldo de arranque).
          </div>
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'detalle', label: 'Detalle', badge: d.total_filas }, { id: 'sucursal', label: 'Por sucursal' }, { id: 'producto', label: 'Por producto' }, { id: 'auditor', label: 'Por auditor' },
          ]} />
          {tab === 'detalle' && (
            <DataTable columnas={columnas} filas={d.filas} filaKey="partida_id" buscador={false} tamanoPagina={TAM} cargando={q.isFetching && !q.isLoading}
              onFila={r => (r.caso_id ? nav(`/auditoria/casos?caso=${r.caso_id}`) : undefined)}
              servidor={{ total: d.total_filas, pagina, tamano: TAM, onPagina: setPagina, onOrden: o => { const orden = (o && ORDEN_COLUMNA[o.columna]) || 'valor'; setPagina(0); setAplicados(a => ({ ...a, orden })); setF(s => ({ ...s, orden })) } }}
              vacio={{ title: 'Sin diferencias', description: 'No hay diferencias con estos filtros. Si todo cuadra, así debe verse.' }} />
          )}
          {tab !== 'detalle' && <AgrupacionesDif tab={tab} d={d} onFiltrarProducto={nombre => { setTab('detalle'); setPagina(0); setF(s => ({ ...s, buscar: nombre })); setAplicados(a => ({ ...a, buscar: nombre })) }} />}
        </div>
      )}
    </div>
  )
}
