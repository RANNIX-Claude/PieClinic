// Utilerías · Validación del sistema. Clon adaptado de IRP Validacion.jsx: tablero de integridad por clínica con semáforo, conteos,
// detalle por chequeo y exportación. Lee las vistas prp_validacion_chequeos / prp_validacion_detalle (migración 060, solo Administrador).
// Solo señala: no corrige datos; cada chequeo indica cómo resolverlo y lleva al módulo.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShieldCheck, RefreshCw, Download, ArrowRight, X, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer } from '../../lib/api'
import { registrarBitacora } from '../../lib/bitacora'
import { exportarExcel } from '../../lib/finanzas/exportar'
import { moneda, fecha, fechaHora } from '../../lib/formato'
import { CHEQUEO_POR_CLAVE, GRUPOS_CHEQUEO, ETIQUETA_SEMAFORO, resumenChequeos, totalesValidacion, saludPct, filasExportables } from '../../lib/utilerias/validacion'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import { useDatos, EstadoConsulta, errMsg } from './comun'

const COLOR = { v: 'var(--green)', a: 'var(--gold)', r: 'var(--red)' }

function Detalle({ chequeo, sedeId, onCerrar }) {
  const q = useDatos(['val-detalle', chequeo.clave], () => leer('prp_validacion_detalle', { sedeCol: false, filtros: { clave: chequeo.clave }, orden: [{ columna: 'fecha', asc: false }], limite: 2000 }))
  const filas = useMemo(() => (q.data?.data ?? []).filter(f => !sedeId || !f.sede_id || f.sede_id === sedeId), [q.data, sedeId])
  const exportar = () => exportarExcel(`validacion_${chequeo.clave}`, [{ nombre: chequeo.titulo, columnas: [{ label: 'Chequeo', key: 'chequeo' }, { label: 'Referencia', key: 'referencia' }, { label: 'Fecha', key: 'fecha' }, { label: 'Importe', key: 'importe', formato: 'moneda' }, { label: 'Descripción', key: 'descripcion' }], filas: filasExportables(filas) }], { entidad: 'validacion_sistema', detalle: { chequeo: chequeo.clave, filas: filas.length } })
    .catch(e => toast.error(`No se pudo exportar: ${errMsg(e)}`))
  return (
    <div className="card" style={{ marginTop: 14, borderLeft: `4px solid ${COLOR[chequeo.semaforo]}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{chequeo.titulo}</h3>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0' }}>{chequeo.que}</div>
          <div style={{ fontSize: 12.5 }}><b>Cómo corregirlo:</b> {chequeo.como}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn sm" to={chequeo.ruta}>Ir a {chequeo.moduloLabel} <ArrowRight size={12} style={{ verticalAlign: -2 }} /></Link>
          <button type="button" className="btn o sm" onClick={exportar} disabled={!filas.length}><Download size={12} style={{ verticalAlign: -2 }} /> Exportar a Excel</button>
          <button type="button" className="btn ghost sm" onClick={onCerrar} aria-label="Cerrar detalle"><X size={14} /></button>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <EstadoConsulta q={q} />
        {!q.isLoading && !q.isError && !q.data?.aviso && (
          <DataTable filas={filas} filaKey="registro_id" tamanoPagina={15} placeholderBusqueda="Buscar en el detalle…" exportarNombre={`validacion_${chequeo.clave}`}
            vacio={{ title: 'Sin casos', description: 'Este chequeo no encontró registros con problema.' }}
            columnas={[
              { key: 'referencia', label: 'Referencia' },
              { key: 'fecha', label: 'Fecha', render: f => fecha(f.fecha), valor: f => f.fecha ?? '' },
              { key: 'importe', label: 'Importe', align: 'right', render: f => (f.importe == null ? '—' : moneda(f.importe)), valor: f => (f.importe == null ? null : Number(f.importe)) },
              { key: 'descripcion', label: 'Qué pasa' },
            ]} />
        )}
      </div>
    </div>
  )
}

export default function Validacion() {
  const { sedeActivaId, sedes } = useApp()
  const [abierto, setAbierto] = useState(null)
  const [grupo, setGrupo] = useState('')
  const [exportando, setExportando] = useState(false)
  const q = useDatos(['val-chequeos'], () => leer('prp_validacion_chequeos', { sedeCol: false, limite: 2000 }))
  useEffect(() => { registrarBitacora('ver', 'validacion_sistema', null, {}, sedeActivaId) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = useMemo(() => resumenChequeos(q.data?.data ?? [], { sedeId: sedeActivaId }), [q.data, sedeActivaId])
  const totales = useMemo(() => totalesValidacion(resumen), [resumen])
  const visibles = resumen.filter(c => !grupo || c.grupo === grupo)
  const seleccionado = resumen.find(c => c.clave === abierto)
  const sedeNombre = sedes.find(s => s.id === sedeActivaId)?.nombre

  async function exportarTodo() {
    setExportando(true)
    try {
      const r = await leer('prp_validacion_detalle', { sedeCol: false, orden: [{ columna: 'clave' }, { columna: 'fecha', asc: false }], limite: 5000 })
      if (r.error) throw new Error(errMsg(r.error))
      const filas = r.data.filter(f => !sedeActivaId || !f.sede_id || f.sede_id === sedeActivaId)
      await exportarExcel('validacion_del_sistema', [
        { nombre: 'Resumen', columnas: [{ label: 'Chequeo', key: 'titulo' }, { label: 'Grupo', key: 'grupo' }, { label: 'Semáforo', key: 'semaforo_txt' }, { label: 'Casos', key: 'n' }, { label: 'Importe', key: 'importe', formato: 'moneda' }, { label: 'Desde', key: 'desde' }, { label: 'Hasta', key: 'hasta' }, { label: 'Cómo corregirlo', key: 'como' }],
          filas: resumen.map(c => ({ ...c, semaforo_txt: ETIQUETA_SEMAFORO[c.semaforo] })) },
        { nombre: 'Detalle', columnas: [{ label: 'Chequeo', key: 'chequeo' }, { label: 'Referencia', key: 'referencia' }, { label: 'Fecha', key: 'fecha' }, { label: 'Importe', key: 'importe', formato: 'moneda' }, { label: 'Descripción', key: 'descripcion' }], filas: filasExportables(filas) },
      ], { entidad: 'validacion_sistema', detalle: { chequeos: resumen.length, filas: filas.length, truncado: r.data.length >= 5000 }, sedeId: sedeActivaId })
      if (r.data.length >= 5000) toast('El detalle se limitó a 5,000 filas; exporta por chequeo para ver el resto.', { icon: '⚠️' })
    } catch (e) { toast.error(`No se pudo exportar: ${errMsg(e)}`) } finally { setExportando(false) }
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Validación del sistema" subtitulo={`Chequeos de integridad de ${sedeNombre ? `la sede ${sedeNombre}` : 'tus sedes'}: lo que no cuadra entre ventas, cobros, facturas, inventario, expedientes y estado de resultados.`}
        acciones={<>
          <button type="button" className="btn o" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw size={14} style={{ verticalAlign: -2 }} /> {q.isFetching ? 'Revisando…' : 'Volver a revisar'}</button>
          <button type="button" className="btn" onClick={exportarTodo} disabled={exportando || q.isLoading || !!q.data?.aviso || q.isError}><Download size={14} style={{ verticalAlign: -2 }} /> {exportando ? 'Exportando…' : 'Exportar todo'}</button>
        </>} />
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && !q.data?.aviso && (<>
        <div className="grid-kpis">
          <KPICard title="Salud del sistema" value={`${saludPct(totales)} %`} subtitle={`${totales.v} de ${totales.total} chequeos sin problemas`} icon={totales.global === 'v' ? ShieldCheck : AlertTriangle} color={COLOR[totales.global]} />
          <KPICard title="Atender ya" value={totales.r} subtitle="Chequeos en rojo" icon={AlertCircle} color="var(--red)" />
          <KPICard title="Por revisar" value={totales.a} subtitle="Chequeos en ámbar" icon={AlertTriangle} color="var(--gold)" />
          <KPICard title="Casos encontrados" value={totales.problemas.toLocaleString('es-MX')} subtitle="Registros con problema" icon={CheckCircle2} color="var(--accent)" />
        </div>
        <div className="toolbar" style={{ margin: '14px 0 8px' }}>
          <span className={`chip${grupo === '' ? ' on' : ''}`} role="button" tabIndex={0} onClick={() => setGrupo('')}>Todos</span>
          {GRUPOS_CHEQUEO.map(g => <span key={g} className={`chip${grupo === g ? ' on' : ''}`} role="button" tabIndex={0} onClick={() => setGrupo(g)}>{g}</span>)}
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="tabla-wrap"><table>
            <thead><tr><th style={{ width: 90 }}>Semáforo</th><th>Chequeo</th><th className="num">Casos</th><th className="num">Importe</th><th>Periodo</th><th /></tr></thead>
            <tbody>{visibles.map(c => (
              <tr key={c.clave} style={{ cursor: 'pointer', background: abierto === c.clave ? 'var(--accent-light)' : undefined }} onClick={() => setAbierto(a => (a === c.clave ? null : c.clave))}>
                <td><span className={`bd ${c.semaforo}`}>{ETIQUETA_SEMAFORO[c.semaforo]}</span></td>
                <td><div style={{ fontWeight: 700 }}>{c.titulo}</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.que}</div></td>
                <td className="num" style={{ fontWeight: 800, color: c.n ? COLOR[c.semaforo] : undefined }}>{c.n}</td>
                <td className="num">{c.n && c.importe ? moneda(c.importe) : '—'}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{c.n && c.desde ? `${fecha(c.desde)}${c.hasta && c.hasta !== c.desde ? ` → ${fecha(c.hasta)}` : ''}` : '—'}</td>
                <td><button type="button" className="btn o sm" disabled={!c.n}>{abierto === c.clave ? 'Ocultar' : 'Ver detalle'}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        {seleccionado && <Detalle key={seleccionado.clave} chequeo={seleccionado} sedeId={sedeActivaId} onCerrar={() => setAbierto(null)} />}
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
          Revisado {fechaHora(q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : null)}. Estos chequeos solo leen datos: no corrigen nada. {Object.keys(CHEQUEO_POR_CLAVE).length} chequeos activos.
        </div>
      </>)}
    </div>
  )
}
