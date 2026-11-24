import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

// Tarjeta KPI (mockup .kpi: borde superior de color, valor grande). `color` por defecto = acento de marca.
export default function KPICard({ title, value, subtitle, icon: Icon, color = 'var(--accent)', trend, onClick, activo, ayuda, loading }) {
  const [verAyuda, setVerAyuda] = useState(false)
  const clickeable = !!onClick
  return (
    <div onClick={onClick} style={{
      background: 'var(--white)', borderRadius: 10, boxShadow: activo ? `0 0 0 2px ${color}` : 'var(--card-sh)',
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: `3px solid ${color}`,
      cursor: clickeable ? 'pointer' : 'default', position: 'relative', minHeight: 84,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{title}</span>
            {ayuda && (
              <button type="button" onClick={e => { e.stopPropagation(); setVerAyuda(v => !v) }} title="Cómo se calcula"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--muted)' }}>
                <HelpCircle size={13} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {loading ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}>…</span> : value}
          </div>
        </div>
        {Icon && (
          <div style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, borderRadius: 8, padding: 8, display: 'flex' }}>
            <Icon size={18} color={color} />
          </div>
        )}
      </div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{subtitle}</div>}
      {trend != null && (
        <div style={{ fontSize: 11, color: trend > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs mes anterior
        </div>
      )}
      {clickeable && <div style={{ fontSize: 10, color: activo ? color : 'var(--muted)', fontWeight: 600 }}>{activo ? '● Filtro activo — clic para quitar' : 'Clic para filtrar'}</div>}
      {verAyuda && ayuda && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20, width: 260, maxWidth: '80vw',
          background: '#1F2937', color: 'white', fontSize: 11.5, lineHeight: 1.5, padding: '10px 12px', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
          {ayuda}
        </div>
      )}
    </div>
  )
}
