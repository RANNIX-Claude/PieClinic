// Exportación completa de datos de la clínica (P-128, P-114: también disponible en solo lectura). Usa las RPC exportar_clinica_* con la sesión
// del administrador (la base solo entrega filas de su organizacion_id) y arma un ZIP en el navegador: un JSON y un CSV por tabla,
// manifiesto y, opcionalmente, los archivos de Storage. Cada exportación queda en la bitácora.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Archive } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { rpc } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'
import { bitacoraExportar } from '../../../lib/bitacora'
import { fechaHora } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import { useDatos, errMsg, EstadoConsulta } from './comun'

const PAGINA = 1000
const aCsv = filas => {
  if (!filas.length) return ''
  const cols = [...new Set(filas.flatMap(f => Object.keys(f)))]
  const celda = v => `"${(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/"/g, '""')}"`
  return [cols.join(','), ...filas.map(f => cols.map(c => celda(f[c])).join(','))].join('\n')
}

export default function ExportarDatos() {
  const { organizacion } = useApp()
  const puede = true // la ruta ya exige Administrador; exportar se permite también en solo lectura (el RLS decide)
  const [conArchivos, setConArchivos] = useState(false)
  const [progreso, setProgreso] = useState(null) // { etapa, hecho, total }
  const cat = useDatos(['exp-catalogo'], () => rpc('exportar_clinica_catalogo'))
  const tablas = (cat.data?.data ?? []).filter(t => Number(t.filas) > 0)
  const totalFilas = tablas.reduce((s, t) => s + Number(t.filas), 0)

  async function exportar() {
    setProgreso({ etapa: 'Preparando…', hecho: 0, total: tablas.length })
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const manifiesto = { clinica: organizacion?.nombre, organizacion_id: organizacion?.id, generado: new Date().toISOString(), formato: 'pie-firme-export-1', tablas: {}, archivos: 0 }
      let n = 0
      for (const t of tablas) {
        setProgreso({ etapa: `Tabla ${t.tabla}`, hecho: n, total: tablas.length })
        let desde = 0, todas = []
        for (;;) {
          const r = await rpc('exportar_clinica_tabla', { p_tabla: t.tabla, p_desde: desde, p_limite: PAGINA })
          if (r.error) throw new Error(`${t.tabla}: ${errMsg(r.error)}`)
          const filas = r.data ?? []
          todas = todas.concat(filas)
          if (filas.length < PAGINA) break
          desde += PAGINA
        }
        zip.file(`tablas/${t.tabla}.json`, JSON.stringify(todas, null, 1))
        zip.file(`tablas/${t.tabla}.csv`, '﻿' + aCsv(todas))
        manifiesto.tablas[t.tabla] = todas.length
        n++
      }
      const ar = await rpc('exportar_clinica_archivos')
      if (ar.error) throw new Error(`archivos: ${errMsg(ar.error)}`)
      const lista = ar.data ?? []
      zip.file('archivos.json', JSON.stringify(lista, null, 1))
      if (conArchivos) {
        let k = 0
        for (const a of lista) {
          setProgreso({ etapa: `Archivo ${a.ruta}`, hecho: k++, total: lista.length })
          const dl = await supabase.storage.from(a.bucket).download(a.ruta)
          if (dl.error) { manifiesto.archivos_con_error = [...(manifiesto.archivos_con_error ?? []), `${a.bucket}/${a.ruta}`]; continue }
          zip.file(`archivos/${a.bucket}/${a.ruta}`, dl.data); manifiesto.archivos++
        }
      }
      zip.file('manifiesto.json', JSON.stringify(manifiesto, null, 2))
      setProgreso({ etapa: 'Comprimiendo…', hecho: tablas.length, total: tablas.length })
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `exportacion_${(organizacion?.nombre ?? 'clinica').replace(/\W+/g, '_')}_${new Date().toISOString().slice(0, 10)}.zip`
      a.click(); URL.revokeObjectURL(a.href)
      bitacoraExportar('clinica_completa', { tablas: tablas.length, filas: totalFilas, archivos: conArchivos ? manifiesto.archivos : 0 })
      toast.success('Exportación lista')
    } catch (e) { toast.error(`No se pudo exportar: ${errMsg(e)}`, { duration: 7000 }) } finally { setProgreso(null) }
  }

  return (
    <div className="pagina">
      <PageHeader titulo="Exportar mis datos" subtitulo="Descarga todo lo que tu clínica tiene en el sistema. Disponible siempre, incluso con la clínica en solo lectura." />
      <EstadoConsulta q={cat} />
      {!cat.isLoading && !cat.isError && !cat.data?.aviso && (<>
        <div className="grid-kpis">
          <KPICard title="Tablas con datos" value={tablas.length} color="var(--accent)" />
          <KPICard title="Registros" value={totalFilas.toLocaleString('es-MX')} color="var(--green)" />
        </div>
        <div className="card" style={{ margin: '12px 0' }}>
          <p style={{ marginTop: 0, fontSize: 13.5 }}>El archivo ZIP contiene un JSON y un CSV por tabla, la lista de archivos de Storage (expedientes, fotos, documentos, comprobantes) y un manifiesto. Los datos de salud viajan completos: guárdalo en un lugar seguro. La exportación se registra en la bitácora.</p>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, marginBottom: 10 }}><input type="checkbox" checked={conArchivos} onChange={e => setConArchivos(e.target.checked)} /> Incluir también los archivos (fotos, documentos, comprobantes). Puede ser pesado.</label>
          <button className="btn" disabled={!puede || !!progreso || !tablas.length} onClick={exportar}><Archive size={14} style={{ verticalAlign: -2 }} /> {progreso ? 'Exportando…' : 'Generar y descargar ZIP'}</button>
          {progreso && (
            <div style={{ marginTop: 10, fontSize: 12.5 }}>
              {progreso.etapa} ({progreso.hecho}/{progreso.total})
              <div style={{ height: 6, background: 'var(--row-line)', borderRadius: 3, marginTop: 4 }}><div style={{ height: 6, borderRadius: 3, background: 'var(--accent)', width: `${progreso.total ? Math.min(100, (progreso.hecho / progreso.total) * 100) : 0}%` }} /></div>
            </div>
          )}
        </div>
        <DataTable exportarNombre="catalogo_exportacion" filas={tablas} filaKey="tabla" sinPaginacion={false} tamanoPagina={50} placeholderBusqueda="Buscar tabla…"
          columnas={[{ key: 'tabla', label: 'Tabla' }, { key: 'filas', label: 'Registros', align: 'right', valor: t => Number(t.filas) }]} vacio={{ title: 'Sin datos', description: 'La clínica aún no tiene registros.', icon: Download }} />
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Consultado {fechaHora(new Date().toISOString())}</div>
      </>)}
    </div>
  )
}
