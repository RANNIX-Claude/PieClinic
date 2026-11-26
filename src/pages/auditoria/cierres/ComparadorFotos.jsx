// Antes / después con deslizador: la foto de cierre de ayer contra la de apertura de hoy de la misma toma fija.
import { useEffect, useState } from 'react'
import { urlEvidencia } from '../../../lib/auditoria/urlFirmadaAuditoria'

export default function ComparadorFotos({ antesRuta, despuesRuta, antesEtiqueta = 'Cierre', despuesEtiqueta = 'Apertura' }) {
  const [antes, setAntes] = useState(null)
  const [despues, setDespues] = useState(null)
  const [pos, setPos] = useState(50)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [a, d] = await Promise.all([antesRuta ? urlEvidencia(antesRuta, 240) : null, despuesRuta ? urlEvidencia(despuesRuta, 240) : null])
      if (vivo) { setAntes(a); setDespues(d) }
    })()
    return () => { vivo = false }
  }, [antesRuta, despuesRuta])
  if (!antesRuta || !despuesRuta) {
    const url = antes ?? despues
    return url ? <img src={url} alt="Foto de la toma" style={{ width: '100%', borderRadius: 8 }} /> : <div className="hint">Sin foto para comparar.</div>
  }
  return (
    <div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#111', borderRadius: 8, overflow: 'hidden', userSelect: 'none' }}>
        {despues && <img src={despues} alt={despuesEtiqueta} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
        {antes && <img src={antes} alt={antesEtiqueta} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', clipPath: `inset(0 ${100 - pos}% 0 0)` }} />}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: '#fff', boxShadow: '0 0 4px #000' }} />
        <span style={{ position: 'absolute', top: 6, left: 8, background: '#000a', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>{antesEtiqueta}</span>
        <span style={{ position: 'absolute', top: 6, right: 8, background: '#000a', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>{despuesEtiqueta}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={e => setPos(Number(e.target.value))} aria-label="Deslizar entre el cierre y la apertura" style={{ width: '100%', marginTop: 6 }} />
    </div>
  )
}
