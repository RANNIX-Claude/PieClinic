// Utilerías · Catálogos. Clon adaptado de IRP Catalogos.jsx: visor de solo lectura de los catálogos del sistema con búsqueda, columnas técnicas
// y exportación. NO duplica la edición: cada catálogo enlaza a la pantalla donde se edita (Configuración → Catálogos, Catálogo y precios, Proveedores…).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BookOpen, Search, Download, Pencil } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, contarFilas } from '../../lib/api'
import { exportarExcel } from '../../lib/finanzas/exportar'
import { CATALOGOS_SISTEMA, NOMBRES_CATALOGO, columnasDe, filtrarFilas, textoCelda } from '../../lib/utilerias/catalogos'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import { useDatos, EstadoConsulta, errMsg } from './comun'

const GRUPOS = [...new Set(CATALOGOS_SISTEMA.map(c => c.grupo))]

export default function Catalogos() {
  const { sedeActivaId } = useApp()
  const [sel, setSel] = useState(CATALOGOS_SISTEMA[0])
  const cont = useQuery({ queryKey: ['cat-conteos', sedeActivaId], queryFn: async () => Object.fromEntries(await Promise.all(CATALOGOS_SISTEMA.map(async c => [c.id, (await contarFilas(c.vista, { sedeId: sedeActivaId, sedeCol: c.sede ? 'sede_id' : false })).count]))) })
  const conteos = cont.data ?? {}
  const [q, setQ] = useState('')
  const [tecnicas, setTecnicas] = useState(false)
  const [subcat, setSubcat] = useState('')
  const datos = useDatos(['cat-vista', sel.vista, sel.sede ? sedeActivaId : null], () => leer(sel.vista, { sedeId: sedeActivaId, sedeCol: sel.sede ? 'sede_id' : false, orden: sel.orden, limite: 5000 }))
  const filas = datos.data?.data ?? []
  const subcats = useMemo(() => (sel.id === 'cat_config' ? [...new Set(filas.map(f => f.catalogo))] : []), [sel, filas])
  const base = useMemo(() => (sel.id === 'cat_config' && subcat ? filas.filter(f => f.catalogo === subcat) : filas), [sel, subcat, filas])
  const visibles = useMemo(() => filtrarFilas(base, q), [base, q])
  const columnas = useMemo(() => columnasDe(base, { tecnicas }), [base, tecnicas])

  const elegir = c => { setSel(c); setQ(''); setSubcat('') }
  const exportar = () => exportarExcel(`catalogo_${sel.vista.replace(/^prp_/, '')}`, [{ nombre: sel.nombre, columnas: columnasDe(base, { tecnicas: true }).map(k => ({ label: k, key: k })), filas: visibles.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, textoCelda(v)]))) }], { entidad: 'catalogos', detalle: { catalogo: sel.vista, filas: visibles.length } })
    .catch(e => toast.error(`No se pudo exportar: ${errMsg(e)}`))

  return (
    <div className="pagina">
      <PageHeader titulo="Catálogos" subtitulo="Consulta todos los catálogos del sistema en un solo lugar. Para modificarlos, usa el botón «Editar» de cada uno." />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 280px) 1fr', gap: 14, alignItems: 'start' }} className="cat-grid">
        <div className="card" style={{ padding: 8 }}>
          {GRUPOS.map(g => (
            <div key={g}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 8px 4px' }}>{g}</div>
              {CATALOGOS_SISTEMA.filter(c => c.grupo === g).map(c => (
                <button key={c.id} type="button" onClick={() => elegir(c)} aria-current={sel.id === c.id}
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, textAlign: 'left', padding: '7px 8px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13,
                    background: sel.id === c.id ? 'var(--accent-light)' : 'transparent', color: sel.id === c.id ? 'var(--accent-dark)' : 'var(--text)', fontWeight: sel.id === c.id ? 700 : 500 }}>
                  <span>{c.nombre.length > 40 ? `${c.nombre.slice(0, 38)}…` : c.nombre}</span>
                  <span className="bd n">{cont.isLoading ? '…' : (conteos[c.id] ?? '—')}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <BookOpen size={18} color="var(--accent)" />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800 }}>{sel.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{visibles.length.toLocaleString('es-MX')} de {base.length.toLocaleString('es-MX')} registro(s)</div>
              </div>
              <Link className="btn o sm" to={sel.editar}><Pencil size={12} style={{ verticalAlign: -2 }} /> Editar en {sel.editarLabel}</Link>
              <button type="button" className="btn sm" onClick={exportar} disabled={!visibles.length}><Download size={12} style={{ verticalAlign: -2 }} /> Exportar a Excel</button>
            </div>
            <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el catálogo…" style={{ paddingLeft: 30, width: '100%' }} aria-label="Buscar en el catálogo" />
              </div>
              {subcats.length > 0 && <select value={subcat} onChange={e => setSubcat(e.target.value)} aria-label="Catálogo de la clínica"><option value="">Todos los catálogos</option>{subcats.map(s => <option key={s} value={s}>{NOMBRES_CATALOGO[s] ?? s}</option>)}</select>}
              <label style={{ fontSize: 12.5, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={tecnicas} onChange={e => setTecnicas(e.target.checked)} /> Columnas técnicas</label>
            </div>
          </div>
          <EstadoConsulta q={datos} />
          {!datos.isLoading && !datos.isError && !datos.data?.aviso && (
            visibles.length === 0
              ? <div className="card"><EmptyState title="Sin registros" description={q ? 'Nada coincide con la búsqueda.' : 'Este catálogo aún no tiene registros. Agrégalos desde su pantalla de edición.'} /></div>
              : (
                <div className="card" style={{ padding: 0 }}>
                  <div className="tabla-wrap" style={{ maxHeight: '62vh', overflow: 'auto' }}><table>
                    <thead><tr>{columnas.map(c => <th key={c} style={{ position: 'sticky', top: 0 }}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
                    <tbody>{visibles.slice(0, 1000).map((f, i) => <tr key={f.id ?? i}>{columnas.map(c => <td key={c} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={textoCelda(f[c])}>{textoCelda(f[c]) || <span style={{ color: 'var(--muted)' }}>—</span>}</td>)}</tr>)}</tbody>
                  </table></div>
                  {visibles.length > 1000 && <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>Se muestran las primeras 1,000 filas; exporta a Excel para verlas todas.</div>}
                </div>
              )
          )}
        </div>
      </div>
      <style>{'@media (max-width: 800px) { .cat-grid { grid-template-columns: 1fr !important; } }'}</style>
    </div>
  )
}
