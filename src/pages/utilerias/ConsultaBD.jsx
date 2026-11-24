// Utilerías · Consulta a Base de Datos. Clon adaptado de IRP Utilidades.jsx: consulta de SOLO LECTURA a una lista blanca de vistas prp_*
// (lib/utilerias/consulta.js) con selección de columnas, filtros estructurados, orden, límite de filas y exportación a Excel.
// NO hay SQL libre en el navegador: la consulta se arma con leer() (PostgREST) y el RLS sigue mandando. Cada consulta queda en la bitácora
// (vista, columnas, forma de los filtros y número de filas; nunca los valores de los filtros). Solo Administrador.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Database, Play, Plus, X, ShieldCheck } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, esVistaInexistente } from '../../lib/api'
import { registrarBitacora } from '../../lib/bitacora'
import { fechaHora, numero } from '../../lib/formato'
import { VISTAS_PERMITIDAS, VISTA_POR_NOMBRE, GRUPOS_CONSULTA, OPERADORES, LIMITES, LIMITE_DEFECTO, validarConsulta, aFiltrosLeer, tipoColumna, esColumnaTecnica, detalleBitacora } from '../../lib/utilerias/consulta'
import { textoCelda } from '../../lib/utilerias/catalogos'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { errMsg } from './comun'

const FILTRO_VACIO = { columna: '', op: 'eq', valor: '' }

export default function ConsultaBD() {
  const { sedeActivaId, sedes } = useApp()
  const [vista, setVista] = useState('')
  const [columnasDisp, setColumnasDisp] = useState([])
  const [muestra, setMuestra] = useState([])
  const [cargandoVista, setCargandoVista] = useState(false)
  const [avisoVista, setAvisoVista] = useState('')
  const [elegidas, setElegidas] = useState([])
  const [filtros, setFiltros] = useState([])
  const [orden, setOrden] = useState({ columna: '', asc: true })
  const [limite, setLimite] = useState(LIMITE_DEFECTO)
  const [corriendo, setCorriendo] = useState(false)
  const [resultado, setResultado] = useState(null) // { filas, columnas, vista, en, errores }
  const [error, setError] = useState('')
  const meta = VISTA_POR_NOMBRE[vista]
  const sedeNombre = sedes.find(s => s.id === sedeActivaId)?.nombre

  async function elegirVista(v) {
    setVista(v); setResultado(null); setError(''); setAvisoVista(''); setColumnasDisp([]); setMuestra([]); setElegidas([]); setFiltros([]); setOrden({ columna: '', asc: true })
    if (!v) return
    setCargandoVista(true)
    const m = VISTA_POR_NOMBRE[v]
    const r = await leer(v, { sedeId: sedeActivaId, sedeCol: m.sede ? 'sede_id' : false, limite: 20 })
    setCargandoVista(false)
    if (r.error) { setAvisoVista(esVistaInexistente(r.error) ? 'Esta vista aún no existe en la base de datos (migración pendiente).' : errMsg(r.error)); return }
    const cols = [...new Set(r.data.flatMap(f => Object.keys(f)))]
    setMuestra(r.data); setColumnasDisp(cols)
    if (!cols.length) setAvisoVista('La vista no tiene filas visibles para tu sede: no se pueden detectar sus columnas todavía.')
  }

  async function ejecutar() {
    const { ok, errores, consulta } = validarConsulta({ vista, columnas: elegidas, filtros, limite, orden: orden.columna ? orden : null }, columnasDisp)
    if (!ok) { setError(errores.join(' ')); return }
    setError(''); setCorriendo(true)
    const r = await leer(vista, { sedeId: sedeActivaId, sedeCol: meta.sede ? 'sede_id' : false, columnas: consulta.columnas.length ? consulta.columnas.join(',') : '*', filtros: aFiltrosLeer(consulta.filtros), orden: consulta.orden ? { columna: consulta.orden.columna, asc: consulta.orden.asc } : undefined, limite: consulta.limite })
    setCorriendo(false)
    if (r.error) { setError(errMsg(r.error)); return }
    await registrarBitacora('ver', 'consulta_bd', vista, detalleBitacora(consulta, r.data.length), sedeActivaId)
    const cols = consulta.columnas.length ? consulta.columnas : [...new Set(r.data.flatMap(f => Object.keys(f)))]
    setResultado({ filas: r.data, columnas: cols, vista, en: new Date().toISOString(), limite: consulta.limite, truncado: r.data.length >= consulta.limite })
    if (r.data.length >= consulta.limite) toast(`Se alcanzó el límite de ${consulta.limite} filas: afina los filtros o sube el límite.`, { icon: '⚠️' })
  }

  const columnasTabla = useMemo(() => (resultado?.columnas ?? []).map(c => {
    const tipo = tipoColumna(resultado.filas, c)
    return { key: c, label: c.replace(/_/g, ' '), align: tipo === 'numero' ? 'right' : undefined, valor: f => (tipo === 'numero' ? (f[c] == null ? null : Number(f[c])) : textoCelda(f[c])), render: f => (tipo === 'numero' && f[c] != null ? numero(f[c]) : (textoCelda(f[c]) || '—')) }
  }), [resultado])

  const alternar = c => setElegidas(x => (x.includes(c) ? x.filter(y => y !== c) : [...x, c]))
  const cambiarFiltro = (i, parche) => setFiltros(fs => fs.map((f, j) => (j === i ? { ...f, ...parche } : f)))

  return (
    <div className="pagina">
      <PageHeader titulo="Consulta a base de datos" subtitulo="Consulta de solo lectura a las vistas administrativas permitidas de tu clínica. Sin SQL libre: eliges vista, columnas y filtros." />
      <div className="aviso warn" style={{ borderRadius: 8, marginBottom: 12 }}><ShieldCheck size={16} /> <span>Solo lectura. Las vistas con datos de pacientes (expediente, notas, fotos) no están disponibles aquí. Cada consulta y cada exportación queda en la bitácora.</span></div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <div className="field" style={{ minWidth: 260 }}>
            <label htmlFor="cbd-vista">Vista</label>
            <select id="cbd-vista" value={vista} onChange={e => elegirVista(e.target.value)}>
              <option value="">Elige una vista…</option>
              {GRUPOS_CONSULTA.map(g => <optgroup key={g} label={g}>{VISTAS_PERMITIDAS.filter(v => v.grupo === g).map(v => <option key={v.vista} value={v.vista}>{v.nombre}</option>)}</optgroup>)}
            </select>
            {meta && <span className="hint">{vista} · {meta.sede ? `filtrada por ${sedeNombre ? `la sede ${sedeNombre}` : 'tus sedes'}` : 'toda la clínica'}</span>}
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="cbd-lim">Máximo de filas</label>
            <select id="cbd-lim" value={limite} onChange={e => setLimite(Number(e.target.value))}>{LIMITES.map(l => <option key={l} value={l}>{l.toLocaleString('es-MX')}</option>)}</select>
          </div>
        </div>
        {cargandoVista && <LoadingSpinner compacto label="Leyendo columnas…" />}
        {avisoVista && <div className="aviso err" role="alert" style={{ borderRadius: 8, marginTop: 10 }}>{avisoVista}</div>}

        {columnasDisp.length > 0 && (<>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Columnas {elegidas.length ? `(${elegidas.length} elegidas)` : '(todas)'}</div>
            <div className="chip-group">
              {columnasDisp.map(c => <span key={c} role="button" tabIndex={0} aria-pressed={elegidas.includes(c)} className={`chip${elegidas.includes(c) ? ' on' : ''}`} style={esColumnaTecnica(c) && !elegidas.includes(c) ? { opacity: .6 } : undefined} onClick={() => alternar(c)} onKeyDown={e => { if (e.key === 'Enter') alternar(c) }}>{c}</span>)}
              {elegidas.length > 0 && <span role="button" tabIndex={0} className="chip-quick" onClick={() => setElegidas([])}>Quitar selección</span>}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Filtros</div>
            {filtros.map((f, i) => (
              <div key={i} className="row" style={{ marginBottom: 6, alignItems: 'flex-end' }}>
                <div className="field" style={{ maxWidth: 220 }}><select aria-label="Columna" value={f.columna} onChange={e => cambiarFiltro(i, { columna: e.target.value })}><option value="">Columna…</option>{columnasDisp.map(c => <option key={c}>{c}</option>)}</select></div>
                <div className="field" style={{ maxWidth: 200 }}><select aria-label="Operador" value={f.op} onChange={e => cambiarFiltro(i, { op: e.target.value })}>{OPERADORES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
                <div className="field"><input aria-label="Valor" type={f.columna && tipoColumna(muestra, f.columna) === 'fecha' && f.op !== 'ilike' ? 'date' : 'text'} value={f.valor} onChange={e => cambiarFiltro(i, { valor: e.target.value })} placeholder="Valor" /></div>
                <button type="button" className="btn ghost sm" onClick={() => setFiltros(fs => fs.filter((_, j) => j !== i))} aria-label="Quitar filtro"><X size={14} /></button>
              </div>
            ))}
            <button type="button" className="btn o sm" onClick={() => setFiltros(fs => [...fs, { ...FILTRO_VACIO }])}><Plus size={12} style={{ verticalAlign: -2 }} /> Agregar filtro</button>
          </div>
          <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ maxWidth: 240 }}><label htmlFor="cbd-ord">Ordenar por</label>
              <select id="cbd-ord" value={orden.columna} onChange={e => setOrden(o => ({ ...o, columna: e.target.value }))}><option value="">Sin orden</option>{columnasDisp.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="field" style={{ maxWidth: 160 }}><select aria-label="Dirección" value={orden.asc ? 'asc' : 'desc'} onChange={e => setOrden(o => ({ ...o, asc: e.target.value === 'asc' }))}><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></div>
            <button type="button" className="btn" onClick={ejecutar} disabled={corriendo}><Play size={14} style={{ verticalAlign: -2 }} /> {corriendo ? 'Consultando…' : 'Consultar'}</button>
          </div>
        </>)}
        {error && <div className="aviso err" role="alert" style={{ borderRadius: 8, marginTop: 10 }}>{error}</div>}
      </div>

      {!vista && <div className="card"><EmptyState icon={Database} title="Elige una vista para empezar" description="Verás sus columnas, podrás filtrar, ordenar y exportar el resultado a Excel." /></div>}
      {resultado && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>
            {resultado.filas.length.toLocaleString('es-MX')} fila(s) de <b>{resultado.vista}</b> · {fechaHora(resultado.en)}{resultado.truncado ? ` · límite de ${resultado.limite.toLocaleString('es-MX')} alcanzado` : ''}
          </div>
          <DataTable columnas={columnasTabla} filas={resultado.filas} filaKey="__i" tamanoPagina={25} exportarNombre={`consulta_${resultado.vista.replace(/^prp_/, '')}`}
            vacio={{ title: 'Sin filas', description: 'La consulta no devolvió registros con esos filtros.' }} />
        </div>
      )}
    </div>
  )
}
