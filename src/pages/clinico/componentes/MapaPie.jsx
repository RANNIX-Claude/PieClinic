import { useState } from 'react'
import { CONTORNO, ANCHO, ALTO, zonasDeVista, espejar, VISTAS_FORMATO, nombreZona } from '../../../lib/clinico/mapaPie'

/**
 * Una vista del pie (pie D/I × dorsal/plantar). Clic en una zona → onMarcar({ pie, vista, zona_codigo, x, y }).
 * hallazgos: [{ numero, pie, vista, zona_codigo, marca:'ungueal'|'lesion', x, y }] (solo se dibujan los de esta vista)
 * Colores: uña afectada = ámbar (token --gold), lesión = rojo (token --red).
 */
export function VistaPie({ pie, vista, hallazgos = [], onMarcar, onHallazgo, seleccion, ancho = 150, titulo, imprimible }) {
  const [hover, setHover] = useState(null)
  const espejo = espejar(pie, vista)
  const zonas = zonasDeVista(vista)
  const propios = hallazgos.filter(h => h.pie === pie && h.vista === vista)
  const activas = new Set(propios.map(h => h.zona_codigo))
  const interactivo = !!onMarcar
  const tf = espejo ? `translate(${ANCHO} 0) scale(-1 1)` : undefined

  const punto = (e, z) => {
    const svg = e.currentTarget.ownerSVGElement
    const r = svg.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    onMarcar({ pie, vista, zona_codigo: z.codigo, x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) })
  }
  const forma = z => {
    const relleno = activas.has(z.codigo) ? 'color-mix(in srgb, var(--gold) 45%, transparent)' : hover === z.codigo ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'transparent'
    const comunes = {
      key: z.codigo, fill: relleno, stroke: z.f === 'r' ? 'transparent' : 'var(--muted)', strokeWidth: 0.6,
      style: { cursor: interactivo ? 'pointer' : 'default' },
      onMouseEnter: () => setHover(z.codigo), onMouseLeave: () => setHover(null),
      onClick: interactivo ? e => punto(e, z) : undefined,
    }
    const t = <title>{z.nombre}</title>
    if (z.f === 'c') return <circle {...comunes} cx={z.cx} cy={z.cy} r={z.r}>{t}</circle>
    if (z.f === 'e') return <ellipse {...comunes} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry}>{t}</ellipse>
    return <rect {...comunes} x={z.x} y={z.y} width={z.w} height={z.h}>{t}</rect>
  }
  const dentro = zonas.filter(z => !z.fuera), fuera = zonas.filter(z => z.fuera)
  const idClip = `clip-${pie}-${vista}`
  return (
    <figure style={{ margin: 0, textAlign: 'center' }}>
      {titulo !== false && <figcaption style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{titulo ?? `Pie ${pie === 'D' ? 'derecho' : 'izquierdo'} · ${vista}`}</figcaption>}
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ancho} role="img" aria-label={`Pie ${pie === 'D' ? 'derecho' : 'izquierdo'}, vista ${vista}`} style={{ maxWidth: '100%', touchAction: 'manipulation' }}>
        <defs><clipPath id={idClip}><path d={CONTORNO} /></clipPath></defs>
        <g transform={tf}>
          <path d={CONTORNO} fill={imprimible ? '#fff' : 'var(--accent-light)'} stroke="var(--text)" strokeWidth="1.2" />
          <g clipPath={`url(#${idClip})`}>{dentro.filter(z => z.f === 'r').map(forma)}</g>
          {dentro.filter(z => z.f !== 'r').map(forma)}
          {fuera.map(forma)}
        </g>
        {/* Los números no se espejan: se dibujan en las coordenadas normalizadas guardadas */}
        {propios.map(h => {
          const cx = (h.x ?? 0.5) * ANCHO, cy = (h.y ?? 0.5) * ALTO
          const col = h.marca === 'ungueal' ? 'var(--gold)' : 'var(--red)'
          return (
            <g key={h.id ?? h.numero} onClick={onHallazgo ? () => onHallazgo(h) : undefined} style={{ cursor: onHallazgo ? 'pointer' : 'default' }}>
              <circle cx={cx} cy={cy} r={seleccion === h.numero ? 8.5 : 7} fill={col} stroke="#fff" strokeWidth="1" />
              <text x={cx} y={cy + 3.2} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{h.numero}</text>
            </g>
          )
        })}
        <text x="4" y="12" fontSize="10" fontWeight="800" fill="var(--muted)">{pie}</text>
      </svg>
      {hover && !imprimible && <div style={{ fontSize: 10.5, color: 'var(--muted)', minHeight: 14 }}>{nombreZona(hover)}</div>}
    </figure>
  )
}

/** Las 4 vistas del formato (D dorsal, I dorsal, D plantar, I plantar). */
export default function MapaPie({ hallazgos = [], onMarcar, onHallazgo, seleccion, ancho = 150, imprimible, titulos = true }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
      {VISTAS_FORMATO.map(([pie, vista]) => (
        <VistaPie key={pie + vista} pie={pie} vista={vista} hallazgos={hallazgos} onMarcar={onMarcar} onHallazgo={onHallazgo}
          seleccion={seleccion} ancho={ancho} imprimible={imprimible} titulo={titulos ? undefined : false} />
      ))}
    </div>
  )
}
