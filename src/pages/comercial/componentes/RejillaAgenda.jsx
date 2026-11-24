// Rejilla de agenda por columnas (podólogo, cabina o día) con tarjetas por estado, bloqueos y arrastrar para reprogramar.
import { useMemo, useRef, useState } from 'react'
import { hora } from '../../../lib/formato'
import { COLOR_TARJETA, ESTADOS_CITA } from '../../../lib/comercial/agenda'
import { minutosDe, minAHhmm, diaDe } from './comun'

const PPM = 1.15        // píxeles por minuto
const PASO = 15         // snap al soltar

/** Asigna carriles a las tarjetas que se empalman en una columna (sobrecupo). */
function carriles(items) {
  const orden = [...items].sort((a, b) => a.ini - b.ini || b.fin - a.fin)
  const fin = []
  const out = orden.map(it => {
    let c = fin.findIndex(f => f <= it.ini)
    if (c < 0) { c = fin.length; fin.push(it.fin) } else fin[c] = it.fin
    return { ...it, carril: c }
  })
  return out.map(it => ({ ...it, carriles: Math.max(1, ...out.filter(o => o.ini < it.fin && o.fin > it.ini).map(o => o.carril + 1)) }))
}

/**
 * columnas: [{ key, label, sub, dia, esHoy, festivo, citas:[], bloqueos:[] }]
 * onCita(c) abre el detalle; onDropCita(cita, columna, minutos) pide reprogramar; puedeArrastrar(c) → boolean
 * onHueco(columna, minutos) clic en espacio libre (nueva cita).
 */
export default function RejillaAgenda({ columnas, desdeMin = 8 * 60, hastaMin = 21 * 60, onCita, onDropCita, onHueco, puedeArrastrar, ahora = new Date() }) {
  const [sobre, setSobre] = useState(null)
  const arrastrando = useRef(null)
  const todas = columnas.flatMap(c => c.citas)
  const ini = Math.min(desdeMin, ...todas.map(c => Math.floor(minutosDe(c.inicio) / 60) * 60))
  const fin = Math.max(hastaMin, ...todas.map(c => Math.ceil(minutosDe(c.fin) / 60) * 60))
  const alto = (fin - ini) * PPM
  const horas = useMemo(() => { const h = []; for (let m = ini; m < fin; m += 60) h.push(m); return h }, [ini, fin])
  const minAhora = minutosDe(ahora)
  const hoyDia = diaDe(ahora)

  const minutosDesdeEvento = (e, el) => {
    const r = el.getBoundingClientRect()
    const m = ini + (e.clientY - r.top) / PPM
    return Math.max(ini, Math.min(fin - PASO, Math.round(m / PASO) * PASO))
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: '72vh' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${columnas.length}, minmax(150px, 1fr))`, minWidth: 52 + columnas.length * 150 }}>
        {/* encabezados */}
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--th-bg)', borderBottom: '1px solid var(--border)' }} />
        {columnas.map(c => (
          <div key={c.key} style={{ position: 'sticky', top: 0, zIndex: 5, background: c.esHoy ? 'var(--accent-light)' : 'var(--th-bg)', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--row-line)', padding: '8px 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
            {c.sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.sub}</div>}
            {c.festivo && <div className="bd a" style={{ marginTop: 3 }}>{c.festivo.nombre}{c.festivo.abre ? ' · abre' : ' · cerrado'}</div>}
          </div>
        ))}
        {/* eje de horas */}
        <div style={{ position: 'relative', height: alto, borderRight: '1px solid var(--row-line)' }}>
          {horas.map(m => <div key={m} style={{ position: 'absolute', top: (m - ini) * PPM - 7, right: 6, fontSize: 11, color: 'var(--muted)' }}>{minAHhmm(m)}</div>)}
        </div>
        {columnas.map(col => {
          const items = carriles(col.citas.map(c => ({ c, ini: minutosDe(c.inicio), fin: Math.max(minutosDe(c.fin), minutosDe(c.inicio) + 15) })))
          return (
            <div key={col.key} style={{ position: 'relative', height: alto, borderLeft: '1px solid var(--row-line)',
              background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PPM - 1}px, var(--row-line) ${60 * PPM - 1}px, var(--row-line) ${60 * PPM}px)`,
              outline: sobre?.key === col.key ? '2px dashed var(--accent)' : undefined, outlineOffset: -2 }}
              onDragOver={e => { if (arrastrando.current) { e.preventDefault(); setSobre({ key: col.key }) } }}
              onDragLeave={() => setSobre(null)}
              onDrop={e => { e.preventDefault(); setSobre(null); const c = arrastrando.current; arrastrando.current = null; if (c) onDropCita?.(c, col, minutosDesdeEvento(e, e.currentTarget)) }}
              onClick={e => { if (e.target === e.currentTarget) onHueco?.(col, minutosDesdeEvento(e, e.currentTarget)) }}>
              {col.bloqueos.map(b => {
                const bi = Math.max(ini, col.dia === diaDe(b.inicio) ? minutosDe(b.inicio) : 0), bf = Math.min(fin, col.dia === diaDe(b.fin) ? minutosDe(b.fin) : 24 * 60)
                if (bf <= bi) return null
                return (
                  <div key={b.id} title={`${b.tipo}${b.motivo ? ' · ' + b.motivo : ''}`} style={{ position: 'absolute', left: 0, right: 0, top: (bi - ini) * PPM, height: (bf - bi) * PPM,
                    background: 'repeating-linear-gradient(45deg, var(--bd-n-bg), var(--bd-n-bg) 6px, transparent 6px, transparent 12px)', color: 'var(--muted)', fontSize: 11, padding: '2px 6px', pointerEvents: 'none', borderTop: '1px solid var(--border)' }}>
                    Bloqueo: {b.tipo}{b.motivo ? ` · ${b.motivo}` : ''}
                  </div>
                )
              })}
              {col.dia === hoyDia && minAhora >= ini && minAhora <= fin && <div style={{ position: 'absolute', left: 0, right: 0, top: (minAhora - ini) * PPM, borderTop: '2px solid var(--red)', zIndex: 3, pointerEvents: 'none' }} />}
              {items.map(({ c, ini: i, fin: f, carril, carriles: n }) => {
                const col2 = COLOR_TARJETA[c.estado] ?? COLOR_TARJETA.por_confirmar
                const arrastrable = puedeArrastrar?.(c)
                return (
                  <div key={c.id} draggable={!!arrastrable}
                    onDragStart={e => { arrastrando.current = c; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
                    onDragEnd={() => { arrastrando.current = null; setSobre(null) }}
                    onClick={e => { e.stopPropagation(); onCita?.(c) }}
                    title={`${hora(c.inicio)}–${hora(c.fin)} · ${c.paciente_nombre} · ${c.servicio_nombre}${arrastrable ? '\nArrastra para reprogramar' : ''}`}
                    style={{ position: 'absolute', top: (i - ini) * PPM, height: Math.max((f - i) * PPM - 2, 22), left: `calc(${(carril / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`,
                      background: col2.bg, color: col2.fg, border: `1px solid ${col2.fg}`, borderLeftWidth: 4, borderRadius: 6, padding: '2px 6px', fontSize: 11.5, lineHeight: 1.25,
                      overflow: 'hidden', cursor: arrastrable ? 'grab' : 'pointer', zIndex: 2, opacity: c.estado === 'cancelada' ? 0.6 : 1 }}>
                    <b>{hora(c.inicio)}</b> {c.paciente_nombre}
                    <div style={{ opacity: 0.9 }}>{c.servicio_nombre}{c.sobrecupo ? ' · sobrecupo' : ''}</div>
                    <div style={{ fontWeight: 700 }}>{ESTADOS_CITA[c.estado]?.label ?? c.estado}{c.tipo_atencion !== 'presencial' ? ` · ${c.tipo_atencion}` : ''}{c.plan_adquirido_id ? ' · plan' : ''}</div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
