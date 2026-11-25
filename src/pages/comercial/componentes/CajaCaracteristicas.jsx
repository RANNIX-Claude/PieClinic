// Producto especial a la medida dentro de un renglón de Caja: precio base cotizado + características elegidas de un catálogo.
// Cada característica agrega su frase a la descripción del renglón (sale en el ticket y la factura) y suma al precio si tiene monto.
import { useState } from 'react'
import { X } from 'lucide-react'
import { moneda } from '../../../lib/formato'

/** Importe que suma una característica elegida (monto fijo, o monto × valor). */
export const importeCaracteristica = c => (c.efecto_precio === 'fijo' ? Number(c.monto) : c.efecto_precio === 'por_unidad' ? Number(c.monto) * Number(c.valor || 0) : 0)
export const fraseCaracteristica = c => (c.tipo_valor === 'numero' ? c.frase.replace('{valor}', String(Number(c.valor))) : c.frase)

/** Recalcula descripción y precio unitario de un renglón con características a partir de su precio base y lo elegido. */
export function recomponer(l) {
  if (!l.admite_caracteristicas) return l
  const frases = (l.caracteristicas ?? []).map(fraseCaracteristica)
  const suma = (l.caracteristicas ?? []).reduce((a, c) => a + importeCaracteristica(c), 0)
  return { ...l, descripcion: frases.length ? `${l.base_nombre}: ${frases.join(', ')}` : l.base_nombre, precio_unitario: Math.round(((Number(l.precio_base) || 0) + suma) * 100) / 100 }
}

export default function CajaCaracteristicas({ linea: l, catalogo, onCambio }) {
  const [id, setId] = useState('')
  const [valor, setValor] = useState('')
  const elegida = catalogo.find(c => c.id === id)
  const grupos = [...new Set(catalogo.map(c => c.grupo))]
  const aplicar = cambios => onCambio(recomponer({ ...l, ...cambios }))
  const agregar = () => {
    if (!elegida) return
    if (elegida.tipo_valor === 'numero' && !(Number(valor) > 0)) return
    if ((l.caracteristicas ?? []).some(c => c.id === elegida.id)) return
    aplicar({ caracteristicas: [...(l.caracteristicas ?? []), { ...elegida, valor: elegida.tipo_valor === 'numero' ? Number(valor) : null }] })
    setId(''); setValor('')
  }
  const quitar = cid => aplicar({ caracteristicas: l.caracteristicas.filter(c => c.id !== cid) })
  return (
    <div className="cj-carac" style={{ flexBasis: '100%', borderTop: '1px dashed var(--border)', paddingTop: 8, marginTop: 4 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Producto especial: precio base y características</div>
      <label style={{ fontSize: 12.5 }}>Precio base cotizado
        <input type="number" min="0" step="0.01" aria-label="Precio base cotizado" value={l.precio_base} style={{ width: 110, marginLeft: 6 }} onChange={e => aplicar({ precio_base: e.target.value })} /></label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
        <select aria-label="Característica" value={id} onChange={e => { setId(e.target.value); setValor('') }} style={{ minWidth: 220 }}>
          <option value="">Elegir característica…</option>
          {grupos.map(g => <optgroup key={g} label={g}>{catalogo.filter(c => c.grupo === g).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.efecto_precio !== 'ninguno' ? ` (+${moneda(c.monto)}${c.efecto_precio === 'por_unidad' ? ` por ${c.unidad || 'unidad'}` : ''})` : ''}</option>)}</optgroup>)}
        </select>
        {elegida?.tipo_valor === 'numero' && <input type="number" min="0" step="any" aria-label="Valor" placeholder={elegida.unidad || 'valor'} value={valor} style={{ width: 90 }} onChange={e => setValor(e.target.value)} />}
        <button type="button" className="btn o" aria-label="Agregar característica" disabled={!elegida || (elegida.tipo_valor === 'numero' && !(Number(valor) > 0))} onClick={agregar}>Agregar</button>
      </div>
      {(l.caracteristicas ?? []).length === 0 ? <div className="text-muted" style={{ fontSize: 12 }}>Aún no hay características: la descripción sale solo con el nombre del producto.</div> : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {l.caracteristicas.map(c => (
            <span key={c.id} className="bd m" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {fraseCaracteristica(c)}{importeCaracteristica(c) > 0 && ` · +${moneda(importeCaracteristica(c))}`}
              <button type="button" aria-label={`Quitar ${c.nombre}`} onClick={() => quitar(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
