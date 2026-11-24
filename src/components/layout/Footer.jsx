const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

export default function Footer() {
  return (
    <footer style={{
      height: 'var(--footer-height)', background: 'var(--footer-bg)', color: 'var(--footer-text)', fontSize: 11,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
    }}>
      <span>© Pie Firme · RANNIX · {new Date().getFullYear()}</span>
      <span style={{ marginLeft: 'auto', opacity: 0.8 }}>{VERSION}</span>
    </footer>
  )
}
