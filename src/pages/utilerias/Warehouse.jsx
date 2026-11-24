// Utilerías · Data warehouse. Catálogo del modelo dimensional (dw_catalogo / dw_metricas), vista previa de cada tabla y exportación
// a CSV, Excel o paquete ZIP para conectar herramientas de BI (Power BI, Looker Studio, Metabase). Solo Administrador.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Database, Download, Eye, Package, X } from 'lucide-react'
import { leer } from '../../lib/api'
import { exportarExcel } from '../../lib/finanzas/exportar'
import { registrarBitacora } from '../../lib/bitacora'
import { numero } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import KPICard from '../../components/ui/KPICard'
import { useDatos, EstadoConsulta, descargar, errMsg } from './comun'

const csvCelda = v => { if (v == null) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const aCsv = filas => {
  if (!filas.length) return ''
  const cols = Object.keys(filas[0])
  return [cols.join(','), ...filas.map(f => cols.map(c => csvCelda(f[c])).join(','))].join('\r\n')
}

/** Baja una vista completa de a 1000 filas (límite de la API). */
async function bajarTodo(objeto, tope = 100000) {
  const todo = []
  for (let pagina = 0; todo.length < tope; pagina++) {
    const r = await leer(objeto, { sedeCol: false, pagina, tamano: 1000 })
    if (r.error) throw new Error(errMsg(r.error))
    todo.push(...r.data)
    if (r.data.length < 1000) break
  }
  return todo
}

export default function Warehouse() {
  const [vista, setVista] = useState(null)
  const [ocupado, setOcupado] = useState('')
  const cat = useDatos(['dw-catalogo'], () => leer('dw_catalogo', { sedeCol: false, limite: 100 }))
  const met = useDatos(['dw-metricas'], () => leer('dw_metricas', { sedeCol: false, limite: 100 }))
  const prev = useQuery({
    queryKey: ['dw-previa', vista], enabled: !!vista,
    queryFn: async () => { const r = await leer(vista, { sedeCol: false, limite: 25 }); if (r.error) throw new Error(errMsg(r.error)); return r.data },
  })

  const objetos = cat.data?.data ?? []
  const dims = objetos.filter(o => o.tipo === 'dimensión').length, hechos = objetos.filter(o => o.tipo === 'hecho').length, tableros = objetos.filter(o => o.tipo === 'tablero').length

  async function csv(objeto) {
    setOcupado(objeto)
    try {
      const filas = await bajarTodo(objeto)
      descargar(`${objeto}.csv`, aCsv(filas))
      registrarBitacora('exportar', 'data_warehouse', objeto, { formato: 'csv', filas: filas.length })
      toast.success(`${objeto}: ${numero(filas.length)} filas`)
    } catch (e) { toast.error(`No se pudo exportar: ${errMsg(e)}`) } finally { setOcupado('') }
  }
  async function zip() {
    setOcupado('zip')
    try {
      const JSZip = (await import('jszip')).default
      const z = new JSZip()
      const esquema = []
      for (const o of objetos) {
        const filas = await bajarTodo(o.objeto)
        z.file(`${o.objeto}.csv`, '﻿' + aCsv(filas))
        esquema.push({ ...o, filas: filas.length, columnas: filas[0] ? Object.keys(filas[0]) : [] })
      }
      z.file('esquema.json', JSON.stringify({ generado_en: new Date().toISOString(), zona_horaria: 'America/Mexico_City', objetos: esquema, metricas: met.data?.data ?? [] }, null, 2))
      z.file('LEEME.txt', 'Paquete BI de Pie Firme. Un CSV por tabla (UTF-8). Llaves: *_id (uuid) y fecha_key (AAAAMMDD) -> dw_dim_tiempo.fecha_key. Ver esquema.json y docs/DW_DICCIONARIO.md.')
      const blob = await z.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'piefirme_bi.zip'; a.click(); URL.revokeObjectURL(a.href)
      registrarBitacora('exportar', 'data_warehouse', 'paquete_bi', { objetos: objetos.length })
      toast.success('Paquete BI descargado')
    } catch (e) { toast.error(`No se pudo armar el paquete: ${errMsg(e)}`) } finally { setOcupado('') }
  }
  async function excelTableros() {
    setOcupado('xlsx')
    try {
      const hojas = []
      for (const o of objetos.filter(x => x.tipo === 'tablero')) {
        const filas = await bajarTodo(o.objeto, 20000)
        if (!filas.length) continue
        hojas.push({ nombre: o.objeto.replace('dw_kpi_', ''), columnas: Object.keys(filas[0]).map(k => ({ label: k, key: k })), filas })
      }
      await exportarExcel('tableros_ejecutivos', hojas, { entidad: 'data_warehouse', detalle: { hojas: hojas.length } })
    } catch (e) { toast.error(`No se pudo exportar: ${errMsg(e)}`) } finally { setOcupado('') }
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Data warehouse" subtitulo="Modelo dimensional (estrella) para tableros ejecutivos y herramientas de BI"
        acciones={<>
          <button className="btn o sm" onClick={excelTableros} disabled={!!ocupado}><Download size={13} style={{ verticalAlign: -2 }} /> {ocupado === 'xlsx' ? 'Generando…' : 'Tableros a Excel'}</button>
          <button className="btn sm" onClick={zip} disabled={!!ocupado || !objetos.length}><Package size={13} style={{ verticalAlign: -2 }} /> {ocupado === 'zip' ? 'Armando paquete…' : 'Paquete BI (ZIP de CSV)'}</button>
        </>} />
      <div className="grid-kpis">
        <KPICard title="Dimensiones" icon={Database} value={dims} subtitle="Tiempo, sede, servicio, producto, podólogo, paciente (anonimizado)…" />
        <KPICard title="Tablas de hechos" icon={Database} color="var(--accent2)" value={hechos} subtitle="Citas, ventas, pagos, ingresos, gastos, inventario, consultas…" />
        <KPICard title="Tableros" icon={Database} color="var(--green)" value={tableros} subtitle="KPIs mensuales, por servicio, podólogo, método de pago…" />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0' }}>
        Las llaves de tiempo son <code>fecha_key</code> (AAAAMMDD) y se unen con <code>dw_dim_tiempo</code>. El paciente va anonimizado (sin nombre, CURP ni contacto).
        Para conectar BI directo a la base usa un rol de solo lectura sobre las vistas <code>piefirme.dw_*</code> (ver <code>docs/DW_DICCIONARIO.md</code>).
      </p>

      <EstadoConsulta q={cat} />
      {!cat.isLoading && !cat.isError && (
        <DataTable filas={objetos} filaKey="objeto" tamanoPagina={40} exportarNombre="catalogo_dw" placeholderBusqueda="Buscar objeto…"
          columnas={[
            { key: 'tipo', label: 'Tipo', filtro: true, ancho: 110 },
            { key: 'objeto', label: 'Objeto', render: f => <code>{f.objeto}</code> },
            { key: 'grano', label: 'Grano' },
            { key: 'descripcion', label: 'Qué contiene' },
            { key: 'llaves', label: 'Llaves' },
            { key: 'acc', label: '', sortable: false, exportar: false, ancho: 160, render: f => (
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost sm" onClick={() => setVista(f.objeto)} title="Vista previa"><Eye size={13} /></button>
                <button className="btn o sm" onClick={() => csv(f.objeto)} disabled={!!ocupado}>{ocupado === f.objeto ? '…' : 'CSV'}</button>
              </span>) },
          ]} />
      )}

      {vista && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 14, flex: 1 }}>Vista previa · <code>{vista}</code> (25 filas)</h3>
            <button className="btn ghost sm" onClick={() => setVista(null)} aria-label="Cerrar"><X size={14} /></button>
          </div>
          <EstadoConsulta q={prev} />
          {prev.data && (prev.data.length
            ? <DataTable filas={prev.data} filaKey={Object.keys(prev.data[0])[0]} sinPaginacion buscador={false} compacto
                columnas={Object.keys(prev.data[0]).map(k => ({ key: k, label: k, valor: f => (typeof f[k] === 'object' && f[k] ? JSON.stringify(f[k]) : f[k]) }))} />
            : <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin filas.</p>)}
        </div>
      )}

      <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Diccionario de métricas</h3>
      <EstadoConsulta q={met} />
      {!met.isLoading && !met.isError && (
        <DataTable filas={met.data?.data ?? []} filaKey="metrica" tamanoPagina={25} exportarNombre="metricas_dw" buscador={false}
          columnas={[{ key: 'metrica', label: 'Métrica', render: f => <b>{f.metrica}</b> }, { key: 'formula', label: 'Fórmula' }, { key: 'fuente', label: 'Fuente', render: f => <code>{f.fuente}</code> }, { key: 'unidad', label: 'Unidad', ancho: 90 }]} />
      )}
    </div>
  )
}
