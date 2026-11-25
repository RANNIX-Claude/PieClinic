// Hoja de códigos de los servicios: cada servicio con su folio, precio, código de barras (Code 128) y QR, para imprimir o guardar como PDF.
// En Caja basta escanear (o teclear) el folio y el servicio entra con su precio vigente. El código es el «código de barras» del servicio si lo
// tiene; si no, su folio (SRV-000001).
import { useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import PageHeader from '../../../components/ui/PageHeader'
import ImprimirHoja from '../../../components/ui/ImprimirHoja'
import { moneda } from '../../../lib/formato'
import { useLectura, msgError } from './comun'

function Barras({ valor }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current && valor) { try { JsBarcode(ref.current, valor, { format: 'CODE128', height: 46, width: 1.6, fontSize: 12, margin: 0, displayValue: true }) } catch { /* código no representable */ } } }, [valor])
  return <svg ref={ref} style={{ maxWidth: '100%' }} role="img" aria-label={`Código de barras ${valor}`} />
}
function Qr({ valor, tam = 84 }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let vivo = true; QRCode.toDataURL(valor, { margin: 0, width: tam * 3, errorCorrectionLevel: 'M' }).then(u => vivo && setSrc(u)).catch(() => {}); return () => { vivo = false } }, [valor, tam])
  return src ? <img src={src} width={tam} height={tam} alt={`QR ${valor}`} /> : <div style={{ width: tam, height: tam }} />
}

function Lista({ servicios }) {
  const porCategoria = useMemo(() => {
    const m = new Map()
    servicios.forEach(s => { const c = s.categoria || 'General'; if (!m.has(c)) m.set(c, []); m.get(c).push(s) })
    return [...m.entries()]
  }, [servicios])
  return (
    <div>
      {porCategoria.map(([cat, lista]) => (
        <section key={cat} style={{ marginBottom: 14, breakInside: 'avoid-page' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>{cat}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
            {lista.map(s => {
              const codigo = s.codigo_barras || s.folio
              return (
                <div key={s.id} style={{ border: '1px solid #bbb', borderRadius: 6, padding: 8, display: 'flex', gap: 8, alignItems: 'center', breakInside: 'avoid', background: '#fff', color: '#000' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.25 }}>{s.nombre}</div>
                    <div style={{ fontSize: 11.5, color: '#444', margin: '2px 0 4px' }}>{s.folio} · {s.tipo_precio === 'a_valorar' ? 'a valorar' : `${s.tipo_precio === 'desde' ? 'desde ' : ''}${moneda(s.precio_lista)}`}{s.admite_caracteristicas ? ' · con adaptaciones' : ''}</div>
                    {codigo ? <Barras valor={codigo} /> : <i style={{ fontSize: 11 }}>sin folio</i>}
                  </div>
                  {codigo && <Qr valor={codigo} />}
                </div>)
            })}
          </div>
        </section>))}
    </div>
  )
}

export default function HojaCodigos() {
  const q = useLectura('hoja-servicios', 'prp_servicios', { sedeCol: false, filtros: { estado: 'activo' }, orden: [{ columna: 'categoria' }, { columna: 'nombre' }], limite: 1000 })
  return (
    <div className="pagina">
      <PageHeader titulo="Códigos de servicios" subtitulo="Cada servicio con su folio, código de barras y QR. En Caja se escanea o se teclea el folio y entra con su precio."
        acciones={<ImprimirHoja titulo="Lista de servicios con códigos" etiqueta="Imprimir / guardar como PDF" className="btn"><Lista servicios={q.filas} /></ImprimirHoja>} />
      {q.error && <div className="card" style={{ color: 'var(--red)' }}>{msgError(q.error)}</div>}
      {q.cargando ? <div className="card">Cargando…</div> : <div className="card"><Lista servicios={q.filas} /></div>}
    </div>
  )
}
