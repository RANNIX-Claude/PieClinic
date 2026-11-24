// Utilerías · Cálculos del Sistema. Clon adaptado de IRP Calculos.jsx: documenta cada fórmula del sistema (de dónde sale cada número),
// muestra los parámetros VIGENTES de la clínica y ofrece un probador con entradas manuales que usa las mismas funciones puras que la app.
// Los casos de referencia se corren en vivo (✔/✘): si una fórmula cambia en el código y deja de dar lo documentado, aquí se nota.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, Search, ChevronDown, ChevronRight, CheckCircle2, XCircle, Settings, Sigma } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { moneda, numero, porcentaje, fecha } from '../../lib/formato'
import { CALCULOS, GRUPOS_CALCULO, ejecutarCalculo, parametrosVigentes, verificarCalculo, verificarTodos, parametroModificado } from '../../lib/utilerias/calculos'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import EmptyState from '../../components/ui/EmptyState'

function formatear(r) {
  const v = r.valor
  if (v === null || v === undefined) return '—'
  switch (r.fmt) {
    case 'moneda': return moneda(v)
    case 'num': return numero(v)
    case 'pct': return porcentaje(v)
    case 'fecha': return fecha(v)
    case 'bool': return v ? 'Sí' : 'No'
    default: return String(v)
  }
}

function Campo({ campo, valor, onChange }) {
  const id = `c-${campo.k}`
  let control
  if (campo.tipo === 'select') control = <select id={id} value={valor} onChange={e => onChange(e.target.value)}>{campo.opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  else if (campo.tipo === 'check') control = <input id={id} type="checkbox" checked={!!valor} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18 }} />
  else control = <input id={id} type={campo.tipo === 'date' ? 'date' : campo.tipo === 'number' ? 'number' : 'text'} step={campo.paso} value={valor} onChange={e => onChange(e.target.value)} />
  return <div className="field" style={{ minWidth: 140, maxWidth: 220 }}><label htmlFor={id}>{campo.label}</label>{control}</div>
}

function Probador({ calculo, parametros }) {
  const [valores, setValores] = useState(() => Object.fromEntries(calculo.campos.map(c => [c.k, c.def])))
  const { resultado, error } = useMemo(() => {
    try { return { resultado: ejecutarCalculo(calculo, valores, parametros), error: null } } catch (e) { return { resultado: [], error: e.message } }
  }, [calculo, valores, parametros])
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        {calculo.campos.map(c => <Campo key={c.k} campo={c} valor={valores[c.k]} onChange={v => setValores(x => ({ ...x, [c.k]: v }))} />)}
      </div>
      {error
        ? <div className="aviso err" role="alert">{error}</div>
        : (
          <div className="tabla-wrap"><table>
            <tbody>{resultado.map(r => <tr key={r.label}><td style={{ color: 'var(--muted)' }}>{r.label}</td><td className="num" style={{ fontWeight: 700 }}>{formatear(r)}</td></tr>)}</tbody>
          </table></div>
        )}
      <button type="button" className="btn o sm" style={{ marginTop: 8 }} onClick={() => setValores(Object.fromEntries(calculo.campos.map(c => [c.k, c.def])))}>Restablecer ejemplo</button>
    </div>
  )
}

function Verificacion({ calculo }) {
  const casos = useMemo(() => verificarCalculo(calculo), [calculo])
  return (
    <div>
      {casos.map(c => (
        <div key={c.nombre} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', fontSize: 12.5 }}>
          {c.ok ? <CheckCircle2 size={15} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div>
            {c.nombre}
            {!c.ok && <div style={{ color: 'var(--red)' }}>{c.error ?? c.fallas.map(f => `${f.etiqueta}: se esperaba ${f.esperado}, dio ${f.obtenido}`).join(' · ')}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Tarjeta({ calculo, parametros, abierta, onAbrir }) {
  const P = useMemo(() => parametrosVigentes(parametros), [parametros])
  const casos = useMemo(() => verificarCalculo(calculo), [calculo])
  const fallan = casos.filter(c => !c.ok).length
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button type="button" onClick={onAbrir} aria-expanded={abierta} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Sigma size={15} color="var(--accent)" />
        <span style={{ fontWeight: 800, fontSize: 14, flex: 1 }}>{calculo.titulo}</span>
        <span className="bd m">{calculo.regla}</span>
        <span className={`bd ${fallan ? 'r' : 'v'}`}>{fallan ? `${fallan} falla(n)` : `${casos.length} caso(s) ✔`}</span>
      </button>
      {abierta && (
        <div style={{ marginTop: 12, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Fórmula</div>
            <div className="font-mono" style={{ background: 'var(--accent-light)', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.6 }}>{calculo.formula}</div>
            <p style={{ fontSize: 13, margin: '8px 0 2px' }}>{calculo.descripcion}</p>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}><b>Origen:</b> {calculo.origen}</div>
          </div>
          {calculo.parametros.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Parámetros vigentes de la clínica</div>
              <div className="tabla-wrap"><table>
                <thead><tr><th>Parámetro</th><th className="num">Valor vigente</th><th className="num">De fábrica</th><th /></tr></thead>
                <tbody>{calculo.parametros.map(k => (
                  <tr key={k}><td>{P[k].label}</td><td className="num" style={{ fontWeight: 700 }}>{String(P[k].valor)}</td><td className="num">{String(P[k].defecto)}</td>
                    <td>{parametroModificado(P[k]) && <span className="bd a">Personalizado</span>}</td></tr>
                ))}</tbody>
              </table></div>
              <Link to="/configuracion" style={{ fontSize: 12, color: 'var(--accent-dark)', display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 4 }}><Settings size={12} /> Cambiar parámetros en Configuración</Link>
            </div>
          )}
          <div className="grid2" style={{ alignItems: 'start' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Probador (entradas manuales)</div>
              <Probador calculo={calculo} parametros={parametros} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Verificación con casos de referencia</div>
              <Verificacion calculo={calculo} />
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Los casos usan los valores de fábrica, no los de tu clínica.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Calculos() {
  const { organizacion } = useApp()
  const parametros = organizacion?.parametros ?? {}
  const [grupo, setGrupo] = useState('')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState(CALCULOS[0].id)
  const resumen = useMemo(() => verificarTodos(), [])
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return CALCULOS.filter(c => (!grupo || c.grupo === grupo) && (!t || [c.titulo, c.formula, c.descripcion, c.regla].some(x => x.toLowerCase().includes(t))))
  }, [grupo, q])
  const porGrupo = GRUPOS_CALCULO.map(g => [g, lista.filter(c => c.grupo === g)]).filter(([, l]) => l.length)

  return (
    <div className="pagina">
      <PageHeader titulo="Cálculos del sistema" subtitulo="De dónde sale cada número: la fórmula, los parámetros vigentes de tu clínica y un probador con tus propios valores." />
      <div className="grid-kpis" style={{ marginBottom: 14 }}>
        <KPICard title="Cálculos documentados" value={CALCULOS.length} icon={Calculator} color="var(--accent)" />
        <KPICard title="Casos de referencia" value={`${resumen.ok} / ${resumen.total}`} subtitle={resumen.fallan ? `${resumen.fallan} no dan lo documentado` : 'Todas las fórmulas dan lo documentado'} icon={resumen.fallan ? XCircle : CheckCircle2} color={resumen.fallan ? 'var(--red)' : 'var(--green)'} />
      </div>
      <div className="card" style={{ marginBottom: 14, fontSize: 12.5 }}>
        La pantalla es documentación viva: el probador llama a las mismas funciones que usan Caja, Finanzas y Equipo. Si una fórmula cambia en el código, los casos de referencia lo delatan. Los parámetros se leen de la configuración de <b>{organizacion?.nombre ?? 'la clínica'}</b>.
      </div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por fórmula, regla o tema…" style={{ paddingLeft: 30, width: '100%' }} aria-label="Buscar cálculo" />
        </div>
        <select value={grupo} onChange={e => setGrupo(e.target.value)} aria-label="Grupo"><option value="">Todos los grupos</option>{GRUPOS_CALCULO.map(g => <option key={g}>{g}</option>)}</select>
      </div>
      {porGrupo.length === 0 && <EmptyState title="Sin resultados" description="Ningún cálculo coincide con la búsqueda." />}
      {porGrupo.map(([g, items]) => (
        <section key={g} style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-dark)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '14px 0 8px' }}>{g}</h2>
          {items.map(c => <Tarjeta key={c.id} calculo={c} parametros={parametros} abierta={abierta === c.id} onAbrir={() => setAbierta(a => (a === c.id ? null : c.id))} />)}
        </section>
      ))}
    </div>
  )
}
