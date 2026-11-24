export default function LoadingSpinner({ size = 32, label = 'Cargando...', compacto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: compacto ? 16 : 48, gap: 12 }} role="status">
      <div style={{ width: size, height: size, border: '3px solid var(--color-neutral)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'pf-spin .8s linear infinite' }} />
      <style>{'@keyframes pf-spin { to { transform: rotate(360deg); } }'}</style>
      {label && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>}
    </div>
  )
}
