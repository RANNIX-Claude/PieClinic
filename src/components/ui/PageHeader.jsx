/** Encabezado de página de módulo: título, subtítulo y acciones a la derecha (mockup: h1 + .sub + .bar). */
export default function PageHeader({ titulo, subtitulo, acciones, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 className="pagina-titulo">{titulo}</h1>
          {subtitulo && <div className="pagina-sub" style={{ marginBottom: 0 }}>{subtitulo}</div>}
        </div>
        {acciones && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acciones}</div>}
      </div>
      {children}
    </div>
  )
}
