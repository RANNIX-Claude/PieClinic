// Línea de tiempo de evolución: por pie, ángulo y zona, las fotos en orden con su fecha y la semana de tratamiento
// (contada desde la primera foto de esa zona). Es lo que se le enseña al paciente para ver cómo va avanzando.
import { useMemo } from 'react'
import { fecha } from '../../../lib/formato'
import { etiquetaDe, MOMENTOS_FOTO } from '../../../lib/clinico/catalogos'
import { semanasDesde } from './FotoRapida'

export default function EvolucionFotos({ filas = [], urls = {} }) {
  const grupos = useMemo(() => {
    const m = new Map()
    for (const f of filas) {
      const k = `${f.pie ?? '-'}|${f.vista ?? '-'}|${f.zona_codigo ?? ''}`
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(f)
    }
    return [...m.entries()]
      .map(([k, fs]) => ({ k, fs: [...fs].sort((a, b) => new Date(a.tomada_en) - new Date(b.tomada_en)) }))
      .filter(g => g.fs.length >= 2)
      .sort((a, b) => b.fs.length - a.fs.length)
  }, [filas])
  if (!grupos.length) return null
  return (
    <div style={{ marginBottom: 16 }} aria-label="Evolución por zona">
      <h4 style={{ margin: '0 0 8px' }}>Evolución</h4>
      {grupos.map(({ k, fs }) => {
        const [pie, vista, zona] = k.split('|')
        const inicio = fs[0].tomada_en
        return (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 4 }}><b>{pie === 'D' ? 'Pie derecho' : pie === 'I' ? 'Pie izquierdo' : 'Pie'}</b> · {vista} {zona ? `· ${zona}` : ''} · {fs.length} fotos en {semanasDesde(inicio, fs.at(-1).tomada_en)} semanas</div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {fs.map((f, i) => (
                <div key={f.id} style={{ flex: '0 0 130px', fontSize: 11 }}>
                  {urls[f.id] ? <img src={urls[f.id]} alt={`Evolución ${fecha(f.tomada_en)}`} style={{ width: 130, height: 130, objectFit: 'cover', borderRadius: 8, border: i === 0 || i === fs.length - 1 ? '2px solid var(--accent)' : '1px solid var(--border)' }} /> : <div style={{ width: 130, height: 130, background: 'var(--accent-light)', borderRadius: 8 }} />}
                  <div><b>{i === 0 ? 'Inicio' : i === fs.length - 1 ? 'Más reciente' : `Semana ${semanasDesde(inicio, f.tomada_en)}`}</b></div>
                  <div style={{ color: 'var(--muted)' }}>{fecha(f.tomada_en)} · {etiquetaDe(MOMENTOS_FOTO, f.momento)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
