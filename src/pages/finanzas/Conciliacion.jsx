// Conciliación bancaria — mockup 36; clon funcional de IRP Conciliacion.jsx (CSV con mapeo, automática, manual, deshacer).
import { useMemo, useRef, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Zap, Undo2, Settings } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, rpc, actualizar, esVistaInexistente } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { BUCKETS, rutaStorage } from '../../lib/urlFirmada'
import { moneda, fecha, hoyISO } from '../../lib/formato'
import { usePermiso } from '../../lib/permisos'
import { parsearCSV, aplicarMapeo, sugerirCoincidencias } from '../../lib/finanzas/conciliacion.js'
import { parametrosFinanzas, FORMAS_PAGO } from '../../lib/finanzas/constantes.js'
import { sumarDias } from '../../lib/finanzas/semana.js'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import StatusBadge from '../../components/ui/StatusBadge'
import Tabs from '../../components/ui/Tabs'
import EmptyState from '../../components/ui/EmptyState'
import { Chips, SelectorMes, anioMesActual, BotonesExportar, VistaNoDisponible, mensajeError, AvisoSimulado, TablaImprimible } from './componentes/comunes.jsx'
import { rangoMes } from '../../lib/finanzas/semana.js'

const ESTADOS = [['', 'Todos'], ['conciliado', 'Pagados (conciliados)'], ['sugerido', 'Sugeridos'], ['ambiguo', 'Ambiguos'], ['detectado', 'Detectados'], ['es_gasto', 'Es gasto'], ['sin_cobro', 'Sin cobro']]
const ETQ = { detectado: 'Detectado', conciliado: 'Conciliado', sugerido: 'Sugerido', ambiguo: 'Ambiguo', es_gasto: 'Es gasto', sin_cobro: 'Sin cobro' }

export default function Conciliacion() {
  const { organizacion, sedeActivaId } = useApp()
  const puedeEditar = usePermiso('finanzas.editar')
  const qc = useQueryClient()
  const [cuentaId, setCuentaId] = useState('')
  const [{ anio, mes }, setPeriodo] = useState(anioMesActual())
  const [estado, setEstado] = useState('')
  const [tab, setTab] = useState('movimientos')
  const [carga, setCarga] = useState(false)
  const [manual, setManual] = useState(null)
  const [mapeoAbierto, setMapeoAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const params = parametrosFinanzas(organizacion)
  const { desde, hasta } = rangoMes(anio, mes)

  const qCuentas = useQuery({ queryKey: ['finanzas', 'conc', 'cuentas', sedeActivaId], queryFn: async () => {
    const r = await leer('prp_cuentas_bancarias', { sedeId: sedeActivaId, sedeCol: false, filtros: { activa: true } })
    if (r.error && !esVistaInexistente(r.error)) throw new Error(r.error.message)
    return { data: r.data, nd: esVistaInexistente(r.error) }
  } })
  const cuentas = qCuentas.data?.data ?? []
  useEffect(() => { if (!cuentaId && cuentas.length) setCuentaId(cuentas[0].id) }, [cuentas, cuentaId])
  const cuenta = cuentas.find(c => c.id === cuentaId)

  const qMov = useQuery({ queryKey: ['finanzas', 'conc', 'mov', cuentaId, anio, mes], enabled: !!cuentaId, queryFn: async () => {
    const r = await leer('prp_movimientos_bancarios', { sedeCol: false, filtros: { cuenta_id: cuentaId, fecha: { gte: desde, lte: hasta } }, orden: [{ columna: 'fecha', asc: false }], limite: 2000 })
    if (r.error) throw new Error(r.error.message)
    return r.data
  } })
  const qCobros = useQuery({ queryKey: ['finanzas', 'conc', 'cobros', sedeActivaId, anio, mes], queryFn: async () => {
    const r = await leer('prp_conciliacion_cobros', { sedeId: sedeActivaId, filtros: { fecha_pago: { gte: sumarDias(desde, -params.conciliacion_tolerancia_dias), lte: sumarDias(hasta, params.conciliacion_tolerancia_dias) } }, orden: [{ columna: 'fecha_pago', asc: false }], limite: 3000 })
    return r.data
  } })
  const qClip = useQuery({ queryKey: ['finanzas', 'conc', 'clip'], enabled: tab === 'clip', queryFn: async () => (await leer('prp_liquidaciones_clip', { sedeCol: false, orden: [{ columna: 'fecha_liquidacion', asc: false }], limite: 200 })).data })
  const qEC = useQuery({ queryKey: ['finanzas', 'conc', 'estados', cuentaId], enabled: !!cuentaId && tab === 'archivos', queryFn: async () => (await leer('estados_cuenta', { sedeCol: false, filtros: { cuenta_id: cuentaId }, orden: [{ columna: 'created_at', asc: false }], limite: 100 })).data })

  const movs = qMov.data ?? []
  const filtrados = estado ? movs.filter(m => m.estado === estado) : movs
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas', 'conc'] })
  const cnt = e => movs.filter(m => m.estado === e)
  const sum = l => l.reduce((s, m) => s + Math.abs(Number(m.monto)), 0)
  const pendientes = movs.filter(m => ['sugerido', 'ambiguo', 'detectado'].includes(m.estado))
  const mora = movs.filter(m => ['sin_cobro', 'es_gasto'].includes(m.estado))

  async function automatico() {
    setOcupado(true)
    const { data, error } = await rpc('conciliar_automatico', { p_cuenta: cuentaId, p_desde: desde, p_hasta: hasta })
    setOcupado(false)
    if (error) return toast.error(mensajeError(error))
    toast.success(`Conciliación automática: ${JSON.stringify(data)}`)
    refrescar()
  }
  async function deshacer(m) {
    if (!window.confirm('¿Deshacer la conciliación de este movimiento? Los cobros regresan a «por validar».')) return
    const { error } = await rpc('conciliar_deshacer', { p_movimiento: m.id })
    if (error) return toast.error(mensajeError(error))
    toast.success('Conciliación deshecha.'); refrescar()
  }
  async function marcar(m, e) {
    const { error } = await rpc('movimiento_marcar', { p_movimiento: m.id, p_estado: e })
    if (error) return toast.error(mensajeError(error))
    toast.success(e === 'es_gasto' ? 'Marcado como gasto.' : 'Marcado como sin cobro.'); refrescar()
  }
  async function sincronizarClip() {
    const { data, error } = await rpc('clip_sincronizar_liquidaciones')
    if (error) return toast.error(mensajeError(error))
    toast.success(`Liquidaciones Clip sincronizadas (${data ?? 0}).`); refrescar()
  }

  const columnas = [
    { key: 'fecha', label: 'Fecha', render: m => fecha(m.fecha) },
    { key: 'descripcion', label: 'Movimiento bancario', render: m => <div><div>{m.descripcion || '—'}</div>{m.referencia && <small style={{ color: 'var(--muted)' }}>Ref. {m.referencia}</small>}</div>, valor: m => `${m.descripcion} ${m.referencia ?? ''}` },
    { key: 'monto', label: 'Monto', align: 'right', render: m => <b style={{ color: m.monto < 0 ? 'var(--red)' : undefined }}>{moneda(m.monto)}</b>, valor: m => Number(m.monto) },
    { key: 'pendiente', label: 'Por conciliar', align: 'right', render: m => moneda(m.pendiente), valor: m => Number(m.pendiente) },
    { key: 'num_vinculos', label: 'Vínculos', align: 'center' },
    { key: 'estado', label: 'Estado', render: m => <StatusBadge estado={m.estado} label={ETQ[m.estado]} />, valor: m => ETQ[m.estado], filtro: true },
    { key: 'acc', label: '', sortable: false, exportar: false, render: m => !puedeEditar ? null : (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {m.estado === 'conciliado' ? <button type="button" className="btn o sm" onClick={() => deshacer(m)}><Undo2 size={11} style={{ verticalAlign: -1 }} /> Deshacer</button> : (
          <>
            <button type="button" className="btn sm" onClick={() => setManual(m)}>{m.estado === 'sugerido' ? 'Palomear' : 'Elegir…'}</button>
            {m.monto < 0 && m.estado !== 'es_gasto' && <button type="button" className="btn o sm" onClick={() => marcar(m, 'es_gasto')}>Es gasto</button>}
            {m.estado !== 'sin_cobro' && <button type="button" className="btn o sm" onClick={() => marcar(m, 'sin_cobro')}>Sin cobro</button>}
          </>
        )}
      </div>) },
  ]
  const exportCols = [{ key: 'fecha', label: 'Fecha' }, { key: 'descripcion', label: 'Descripción' }, { key: 'referencia', label: 'Referencia' }, { key: 'monto', label: 'Monto', formato: 'moneda' }, { key: 'estadoTxt', label: 'Estado' }]
  const exportFilas = filtrados.map(m => ({ ...m, estadoTxt: ETQ[m.estado] }))

  if (qCuentas.data?.nd) return <div className="pagina"><PageHeader titulo="Conciliación bancaria" /><VistaNoDisponible nombre="prp_cuentas_bancarias" /></div>

  return (
    <div className="pagina">
      <PageHeader titulo="Conciliación bancaria" subtitulo="Estado de cuenta contra cobros, gastos y pagos a proveedores · cruce por referencia y por monto + fecha"
        acciones={<>
          <BotonesExportar nombre="conciliacion" titulo={`Conciliación ${cuenta?.etiqueta ?? ''} ${mes}/${anio}`} hojas={[{ nombre: 'Movimientos', columnas: exportCols, filas: exportFilas }]} deshabilitado={!filtrados.length}>
            <TablaImprimible columnas={[{ key: 'fecha', label: 'Fecha' }, { key: 'descripcion', label: 'Descripción' }, { key: 'monto', label: 'Monto', align: 'right' }, { key: 'estadoTxt', label: 'Estado' }]} filas={exportFilas.map(f => ({ ...f, monto: moneda(f.monto) }))} />
          </BotonesExportar>
          {puedeEditar && <button type="button" className="btn o" onClick={() => setMapeoAbierto(true)} disabled={!cuenta}><Settings size={14} style={{ verticalAlign: -3 }} /> Mapeo del CSV</button>}
          {puedeEditar && <button type="button" className="btn o" onClick={automatico} disabled={!cuenta || ocupado}><Zap size={14} style={{ verticalAlign: -3 }} /> {ocupado ? 'Conciliando…' : 'Conciliar automático'}</button>}
          {puedeEditar && <button type="button" className="btn" onClick={() => setCarga(true)} disabled={!cuenta}><Upload size={14} style={{ verticalAlign: -3 }} /> Cargar estado de cuenta</button>}
        </>} />

      <div className="toolbar">
        <select value={cuentaId} onChange={e => setCuentaId(e.target.value)} aria-label="Cuenta bancaria">
          {!cuentas.length && <option value="">Sin cuentas bancarias</option>}
          {cuentas.map(c => <option key={c.id} value={c.id}>{c.etiqueta}{c.alias ? ` · ${c.alias}` : ''}{c.sede_nombre ? ` (${c.sede_nombre})` : ''}</option>)}
        </select>
        <SelectorMes anio={anio} mes={mes} onChange={setPeriodo} />
      </div>

      {!qCuentas.isLoading && !cuentas.length ? <EmptyState title="Sin cuentas bancarias" description="Da de alta una cuenta bancaria en la configuración de la clínica para cargar estados de cuenta." /> : (
        <>
          <div className="grid-kpis" style={{ marginTop: 12 }}>
            <KPICard title="Pagados (conciliados)" value={cnt('conciliado').length} subtitle={moneda(sum(cnt('conciliado')))} color="var(--green)" onClick={() => setEstado(estado === 'conciliado' ? '' : 'conciliado')} activo={estado === 'conciliado'} loading={qMov.isLoading} />
            <KPICard title="Pendientes" value={pendientes.length} subtitle={moneda(sum(pendientes))} color="var(--gold)" loading={qMov.isLoading} onClick={() => setEstado(estado === 'sugerido' ? '' : 'sugerido')} activo={estado === 'sugerido'} ayuda="Detectados, sugeridos y ambiguos: faltan por palomear." />
            <KPICard title="Sin cobro / es gasto" value={mora.length} subtitle={moneda(sum(mora))} color="var(--red)" loading={qMov.isLoading} onClick={() => setEstado(estado === 'sin_cobro' ? '' : 'sin_cobro')} activo={estado === 'sin_cobro'} />
            <KPICard title="Total movimientos" value={movs.length} subtitle={moneda(movs.reduce((s, m) => s + Number(m.monto), 0))} color="var(--accent)" loading={qMov.isLoading} ayuda="Suma neta del mes (abonos − cargos)." />
          </div>

          <Tabs value={tab} onChange={setTab} items={[{ id: 'movimientos', label: 'Movimientos vs. cobros' }, { id: 'clip', label: 'Liquidaciones Clip' }, { id: 'archivos', label: 'Archivos cargados' }]} />
          <div style={{ marginTop: 10 }}>
            {tab === 'movimientos' && (
              <>
                <div style={{ marginBottom: 8 }}><Chips opciones={ESTADOS.map(([v, l]) => ({ value: v, label: l, n: v ? cnt(v).length : movs.length }))} valor={estado} onChange={setEstado} /></div>
                <DataTable columnas={columnas} filas={filtrados} cargando={qMov.isLoading} error={qMov.error} placeholderBusqueda="Buscar referencia o descripción…" vacio={{ title: 'Sin movimientos', description: 'No hay movimientos en el mes. Carga el estado de cuenta (CSV).' }} />
              </>
            )}
            {tab === 'clip' && (
              <>
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  {puedeEditar && <button type="button" className="btn o sm" onClick={sincronizarClip}>Sincronizar liquidaciones de Clip</button>}
                  <AvisoSimulado texto="Clip: sin llave — las liquidaciones llegan de pagos_clip registrados" />
                </div>
                <DataTable columnas={[
                  { key: 'lote', label: 'Lote' }, { key: 'fecha_liquidacion', label: 'Fecha', render: l => fecha(l.fecha_liquidacion) },
                  { key: 'cobros_incluidos', label: 'Cobros', align: 'right' },
                  { key: 'monto_bruto', label: 'Bruto', align: 'right', render: l => moneda(l.monto_bruto) }, { key: 'comision_retenida', label: 'Comisión', align: 'right', render: l => moneda(l.comision_retenida) },
                  { key: 'monto_depositado', label: 'Depositado', align: 'right', render: l => moneda(l.monto_depositado) },
                  { key: 'diferencia', label: 'Dif. vs cobros', align: 'right', render: l => <span style={{ color: Math.abs(l.diferencia) > 0.01 ? 'var(--red)' : undefined }}>{moneda(l.diferencia)}</span> },
                  { key: 'estado', label: 'Estado', render: l => <StatusBadge estado={l.estado === 'conciliada' ? 'conciliado' : 'pendiente'} label={l.estado === 'conciliada' ? 'Conciliada' : 'Pendiente'} />, valor: l => l.estado, filtro: true },
                ]} filas={qClip.data ?? []} cargando={qClip.isLoading} exportarNombre="liquidaciones_clip" vacio={{ title: 'Sin liquidaciones', description: 'Aún no hay liquidaciones de Clip.' }} />
              </>
            )}
            {tab === 'archivos' && (
              <DataTable columnas={[
                { key: 'archivo_nombre', label: 'Archivo' }, { key: 'periodo', label: 'Periodo', render: e => `${fecha(e.periodo_desde)} – ${fecha(e.periodo_hasta)}`, valor: e => `${e.periodo_desde} ${e.periodo_hasta}` },
                { key: 'num_movimientos', label: 'Movimientos nuevos', align: 'right' }, { key: 'created_at', label: 'Cargado', render: e => fecha(e.created_at) },
              ]} filas={qEC.data ?? []} cargando={qEC.isLoading} vacio={{ title: 'Sin archivos', description: 'No se han cargado estados de cuenta para esta cuenta.' }} />
            )}
          </div>
        </>
      )}

      <CargaCSV abierto={carga} cuenta={cuenta} onClose={() => setCarga(false)} onListo={() => { setCarga(false); refrescar() }} />
      <MapeoModal abierto={mapeoAbierto} cuenta={cuenta} onClose={() => setMapeoAbierto(false)} onGuardado={() => { setMapeoAbierto(false); qc.invalidateQueries({ queryKey: ['finanzas', 'conc', 'cuentas'] }) }} />
      <ManualModal mov={manual} cobros={qCobros.data ?? []} tolDias={params.conciliacion_tolerancia_dias} onClose={() => setManual(null)} onListo={() => { setManual(null); refrescar() }} />
    </div>
  )
}

function CargaCSV({ abierto, cuenta, onClose, onListo }) {
  const { organizacion } = useApp()
  const input = useRef(null)
  const [archivo, setArchivo] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [mapeo, setMapeo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (abierto) { setArchivo(null); setParsed(null); setMapeo(cuenta?.mapeo_csv ?? null) } }, [abierto, cuenta])
  const resultado = useMemo(() => (parsed && mapeo ? aplicarMapeo(parsed, mapeo) : null), [parsed, mapeo])
  async function elegir(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setArchivo(f); setParsed(parsearCSV(await f.text()))
  }
  async function enviar() {
    setEnviando(true)
    try {
      let ruta = null
      if (organizacion?.id) {
        ruta = rutaStorage(organizacion.id, 'bancos', `${crypto.randomUUID()}.csv`)
        const { error } = await supabase.storage.from(BUCKETS.importaciones).upload(ruta, archivo, { contentType: 'text/csv' })
        if (error) { console.warn('[conciliación] no se guardó el archivo original:', error.message); ruta = null }
      }
      const { data, error } = await rpc('conciliar_importar', { p_cuenta: cuenta.id, p_archivo: archivo.name, p_filas: resultado.filas, p_archivo_path: ruta })
      if (error) throw error
      toast.success(`${data.nuevos} movimiento(s) nuevos · ${data.duplicados} duplicado(s) omitidos.`)
      await rpc('conciliar_automatico', { p_cuenta: cuenta.id })
      onListo()
    } catch (e) { toast.error(mensajeError(e)) } finally { setEnviando(false) }
  }
  const set = (k, v) => setMapeo(m => ({ ...m, [k]: v }))
  const opciones = (parsed?.encabezados ?? []).map(h => ({ value: h, label: h }))
  return (
    <Modal open={abierto} onClose={onClose} size="wide" title={`Cargar estado de cuenta · ${cuenta?.etiqueta ?? ''}`} cerrarAlClicFuera={false}
      footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!resultado?.filas.length || enviando} onClick={enviar}>{enviando ? 'Importando…' : `Importar ${resultado?.filas.length ?? 0} movimientos`}</button></>}>
      <input ref={input} type="file" accept=".csv,text/csv,.txt" onChange={elegir} style={{ display: 'none' }} />
      <button type="button" className="btn o" onClick={() => input.current?.click()}><Upload size={14} style={{ verticalAlign: -3 }} /> {archivo ? archivo.name : 'Elegir archivo CSV'}</button>
      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>Los duplicados se detectan por huella y se omiten. Después se corre la conciliación automática.</span>
      {parsed && mapeo && (
        <>
          <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Mapeo de columnas</h4>
          <div className="grid3">
            {[['fecha', 'Fecha'], ['descripcion', 'Descripción'], ['monto', 'Monto (+ abono / − cargo)'], ['referencia', 'Referencia']].map(([k, l]) => (
              <FormField key={k} label={l} as="select" options={opciones} value={mapeo[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder="(no usar)" />
            ))}
            <FormField label="Formato de fecha" as="select" value={mapeo.formato_fecha ?? 'YYYY-MM-DD'} onChange={e => set('formato_fecha', e.target.value)} options={['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'].map(x => ({ value: x, label: x }))} />
            <FormField label="Columna cargo (opcional)" as="select" options={opciones} value={mapeo.cargo ?? ''} onChange={e => set('cargo', e.target.value)} placeholder="(no usar)" />
            <FormField label="Columna abono (opcional)" as="select" options={opciones} value={mapeo.abono ?? ''} onChange={e => set('abono', e.target.value)} placeholder="(no usar)" />
          </div>
          {resultado?.errores.length > 0 && (
            <div className="card" style={{ marginTop: 10, borderLeft: '3px solid var(--red)', fontSize: 12 }}>
              <b>{resultado.errores.length} fila(s) con problema (no se importan):</b>
              <ul style={{ margin: '4px 0 0 16px' }}>{resultado.errores.slice(0, 8).map((e, i) => <li key={i}>{e.linea ? `Línea ${e.linea}: ` : ''}{e.motivo}</li>)}</ul>
            </div>
          )}
          <h4 style={{ margin: '14px 0 6px', fontSize: 13 }}>Vista previa ({resultado?.filas.length ?? 0} filas válidas)</h4>
          <div className="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Referencia</th><th className="num">Monto</th></tr></thead>
            <tbody>{(resultado?.filas ?? []).slice(0, 10).map((f, i) => <tr key={i}><td>{fecha(f.fecha)}</td><td>{f.descripcion}</td><td>{f.referencia ?? '—'}</td><td className="num">{moneda(f.monto)}</td></tr>)}</tbody></table></div>
        </>
      )}
    </Modal>
  )
}

function MapeoModal({ abierto, cuenta, onClose, onGuardado }) {
  const [m, setM] = useState({})
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (abierto) setM(cuenta?.mapeo_csv ?? {}) }, [abierto, cuenta])
  const set = (k, v) => setM(x => ({ ...x, [k]: v }))
  async function guardar() {
    setGuardando(true)
    try { const { error } = await actualizar('cuentas_bancarias', cuenta.id, { mapeo_csv: m }); if (error) throw error; toast.success('Mapeo guardado.'); onGuardado() } catch (e) { toast.error(mensajeError(e)) } finally { setGuardando(false) }
  }
  return (
    <Modal open={abierto} onClose={onClose} title={`Mapeo del CSV · ${cuenta?.etiqueta ?? ''}`} footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" onClick={guardar} disabled={guardando}>Guardar</button></>}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Nombres de las columnas tal como vienen en el CSV del banco (se usan como valor inicial al cargar un archivo).</div>
      <div className="grid2">
        {[['fecha', 'Columna de fecha'], ['descripcion', 'Columna de descripción'], ['monto', 'Columna de monto'], ['referencia', 'Columna de referencia'], ['cargo', 'Columna de cargo (opc.)'], ['abono', 'Columna de abono (opc.)']].map(([k, l]) => (
          <FormField key={k} label={l} value={m[k] ?? ''} onChange={e => set(k, e.target.value)} />
        ))}
        <FormField label="Formato de fecha" as="select" value={m.formato_fecha ?? 'YYYY-MM-DD'} onChange={e => set('formato_fecha', e.target.value)} options={['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY'].map(x => ({ value: x, label: x }))} />
      </div>
    </Modal>
  )
}

function ManualModal({ mov, cobros, tolDias, onClose, onListo }) {
  const [sel, setSel] = useState([])
  const [forma, setForma] = useState('Transferencia')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setSel([]), [mov])
  const sug = useMemo(() => (mov ? sugerirCoincidencias({ fecha: mov.fecha, monto: Number(mov.monto), referencia: mov.referencia }, cobros.map(c => ({ ...c, fecha: c.fecha_pago, importe: Number(c.importe), referencia: c.referencia_pago })), tolDias) : null), [mov, cobros, tolDias])
  const lista = useMemo(() => {
    if (!mov) return []
    const ids = new Set((mov.sugeridos ?? []).concat(sug?.candidatos.map(c => c.id) ?? []))
    const base = cobros.filter(c => !c.conciliado && (ids.has(c.id) || Math.abs(Number(c.importe) - Number(mov.monto)) < 0.01))
    return base.length ? base : cobros.filter(c => !c.conciliado).slice(0, 60)
  }, [mov, cobros, sug])
  useEffect(() => { if (sug?.estado === 'sugerido') setSel(sug.candidatos.map(c => c.id)) }, [sug])
  const total = lista.filter(c => sel.includes(c.id)).reduce((s, c) => s + Number(c.importe), 0)
  const dif = mov ? Math.round((Number(mov.monto) - total) * 100) / 100 : 0
  async function confirmar() {
    setGuardando(true)
    const { error } = await rpc('conciliar_confirmar', { p_movimiento: mov.id, p_vinculos: sel.map(id => ({ tipo: 'ingreso', id })) })
    setGuardando(false)
    if (error) return toast.error(mensajeError(error))
    toast.success('Movimiento conciliado; los cobros quedan validados.'); onListo()
  }
  return (
    <Modal open={!!mov} onClose={onClose} size="wide" title="Palomear cobro manualmente" footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!sel.length || guardando} onClick={confirmar}>{guardando ? 'Confirmando…' : 'Confirmar'}</button></>}>
      {mov && <div className="card" style={{ marginBottom: 10, background: 'var(--accent-light)' }}><b>{fecha(mov.fecha)} · {mov.descripcion}</b> · {moneda(mov.monto)}{mov.referencia && ` · Ref. ${mov.referencia}`}
        {sug?.estado === 'ambiguo' && <div style={{ fontSize: 12, marginTop: 4 }}>Hay {sug.candidatos.length} cobros posibles con el mismo monto y fecha ± {tolDias} días: elige el correcto.</div>}</div>}
      {mov?.monto < 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Los cargos se concilian con gastos o pagos a proveedor (automático por monto + fecha). Si es un gasto sin registrar, márcalo «Es gasto».</div>}
      <FormField label="Forma de pago (referencia informativa)" as="select" value={forma} onChange={e => setForma(e.target.value)} options={FORMAS_PAGO.map(f => ({ value: f, label: f }))} />
      <div className="tabla-wrap" style={{ maxHeight: 320, overflow: 'auto' }}><table>
        <thead><tr><th /><th>Fecha</th><th>Forma</th><th>Clasificación</th><th>Referencia</th><th className="num">Importe</th><th>Estatus</th></tr></thead>
        <tbody>{lista.map(c => (
          <tr key={c.id}><td><input type="checkbox" style={{ width: 'auto' }} checked={sel.includes(c.id)} onChange={e => setSel(s => (e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id)))} /></td>
            <td>{fecha(c.fecha_pago)}</td><td>{c.forma_pago}</td><td>{c.clasificacion}</td><td>{c.referencia_pago ?? '—'}</td><td className="num">{moneda(c.importe)}</td><td><StatusBadge estado={c.estatus_validacion} /></td></tr>))}
          {!lista.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>No hay cobros pendientes de conciliar en el rango.</td></tr>}
        </tbody></table></div>
      <div style={{ marginTop: 8, fontSize: 12 }}>Seleccionado: <b>{moneda(total)}</b> · Diferencia con el movimiento: <b style={{ color: Math.abs(dif) > 0.01 ? 'var(--red)' : 'var(--green)' }}>{moneda(dif)}</b>{Math.abs(dif) > 0.01 && ' (el movimiento quedará parcial)'}</div>
    </Modal>
  )
}
