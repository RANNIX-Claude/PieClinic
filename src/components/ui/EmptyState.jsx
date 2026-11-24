import { PackageOpen } from 'lucide-react'

export default function EmptyState({ title = 'Sin registros', description = 'No hay datos para mostrar', action, icon: Icon = PackageOpen, compacto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: compacto ? '20px' : '48px', gap: 10, color: 'var(--muted)' }}>
      <Icon size={compacto ? 32 : 44} style={{ opacity: 0.35 }} />
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12.5, textAlign: 'center', maxWidth: 340 }}>{description}</div>
      {action}
    </div>
  )
}
