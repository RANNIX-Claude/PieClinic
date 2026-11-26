// Inventario · Códigos de productos (pruebas de lectura). Consulta los productos con su código de barras y lo dibuja GRANDE en pantalla,
// para apuntar la cámara del celular (Conteo inicial, Caja) o el escáner Bluetooth a esta pantalla y validar que la lectura funciona.
// Es solo lectura: no cambia nada del catálogo.
import { useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { ScanBarcode, Search, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import { moneda } from '../../../lib/formato'
import { useLectura, msgError } from './comun'

const sinAcentos = t => (t ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ean13Valido = c => /^\d{13}$/.test(c) && ((10 - ([...c.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10) === Number(c[12])
// Un producto sin código de barras numérico se identifica por su SKU (alfanumérico, p. ej. T0COC05-3): Code 128 sí lo representa y Conteo inicial y Caja lo reconocen igual.
const codigoDe = p => p.codigo_barras || p.sku || ''
const formatoDe = c => (ean13Valido(c) ? 'EAN13' : 'CODE128')

function Barras({ valor, ancho }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !valor) return
    try { JsBarcode(ref.current, valor, { format: formatoDe(valor), height: 110, width: ancho, fontSize: 18, margin: 14, displayValue: true, background: '#ffffff', lineColor: '#000000' }) }
    catch { /* código no representable en ese formato */ }
  }, [valor, ancho])
  return <svg ref={ref} style={{ maxWidth: '100%', height: 'auto', background: '#fff' }} role="img" aria-label={`Código de barras ${valor}`} />
}
function Qr({ valor }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let vivo = true; QRCode.toDataURL(valor, { margin: 2, width: 360, errorCorrectionLevel: 'M' }).then(u => vivo && setSrc(u)).catch(() => {}); return () => { vivo = false } }, [valor])
  return src ? <img src={src} width={150} height={150} alt={`QR ${valor}`} style={{ background: '#fff' }} /> : null
}

export default function CodigosProductos() {
  const q = useLectura('codigos-productos', 'prp_productos', { sedeCol: false, filtros: { estado: ['activo', 'provisional'] }, orden: [{ columna: 'categoria' }, { columna: 'nombre' }], limite: 2000,
    columnas: 'id,sku,codigo_barras,nombre,categoria,marca,presentacion,precio_lista' })
  const [texto, setTexto] = useState('')
  const [soloConCodigo, setSoloConCodigo] = useState(false)
  const [conQr, setConQr] = useState(false)
  const [grueso, setGrueso] = useState(2.6)   // ancho de barra: más grueso = más fácil para la cámara
  const [elegido, setElegido] = useState(null)

  const filas = useMemo(() => {
    const t = sinAcentos(texto.trim())
    return q.filas.filter(p => (!soloConCodigo || p.codigo_barras) && (!t || sinAcentos(`${p.nombre} ${p.sku} ${p.codigo_barras} ${p.categoria} ${p.marca}`).includes(t)))
  }, [q.filas, texto, soloConCodigo])
  const total = q.filas.length, conCodigo = q.filas.filter(p => p.codigo_barras).length
  const copiar = async c => { try { await navigator.clipboard.writeText(c); toast.success('Código copiado') } catch { toast.error('No se pudo copiar') } }

  return (
    <div className="pagina">
      <PageHeader titulo="Códigos de productos (pruebas de lectura)" subtitulo="Productos con su código de barras en grande. Apunta la cámara del celular o el escáner a esta pantalla para validar la lectura en Conteo inicial y en Caja." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <KPICard title="Productos activos" value={total} />
        <KPICard title="Con código de barras" value={conCodigo} />
        <KPICard title="Sin código de barras (usan SKU)" value={total - conCodigo} />
      </div>
      {q.error && <div className="card" style={{ color: 'var(--red)', marginBottom: 10 }}>{msgError(q.error)}</div>}

      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
          <input aria-label="Buscar producto o código" placeholder="Buscar por nombre, SKU, código o categoría…" value={texto} onChange={e => setTexto(e.target.value)} style={{ width: '100%', paddingLeft: 32 }} />
        </div>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={soloConCodigo} onChange={e => setSoloConCodigo(e.target.checked)} /> Solo con código de barras real (sin los que usan SKU)</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={conQr} onChange={e => setConQr(e.target.checked)} /> Mostrar también QR</label>
        <label style={{ fontSize: 13 }}>Grosor de barras <input type="range" min="1.6" max="4" step="0.2" value={grueso} onChange={e => setGrueso(Number(e.target.value))} style={{ verticalAlign: 'middle' }} /></label>
      </div>

      {q.cargando ? <div className="card">Cargando…</div> : filas.length === 0 ? <div className="card">Sin productos con ese criterio.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {filas.map(p => (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.nombre}</div>
              <div className="text-muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>{[p.sku, p.categoria, p.presentacion].filter(Boolean).join(' · ')}{p.precio_lista != null ? ` · ${moneda(p.precio_lista)}` : ''}</div>
              {codigoDe(p) ? (
                <>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', borderRadius: 8, padding: 4, justifyContent: 'center' }}>
                    <Barras valor={codigoDe(p)} ancho={grueso} />
                    {conQr && <Qr valor={codigoDe(p)} />}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <code style={{ fontSize: 13 }}>{codigoDe(p)}</code>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>{p.codigo_barras ? (formatoDe(p.codigo_barras) === 'EAN13' ? 'EAN-13' : 'Code 128') : 'SKU alfanumérico · Code 128'}</span>
                    <button type="button" className="btn o" style={{ marginLeft: 'auto', padding: '4px 10px' }} onClick={() => copiar(codigoDe(p))}><Copy size={13} style={{ verticalAlign: -2 }} /> Copiar</button>
                    <button type="button" className="btn o" style={{ padding: '4px 10px' }} onClick={() => setElegido(p)}><ScanBarcode size={13} style={{ verticalAlign: -2 }} /> Pantalla completa</button>
                  </div>
                </>
              ) : <div className="text-muted" style={{ fontSize: 13 }}>Sin código de barras ni SKU.</div>}
            </div>
          ))}
        </div>
      )}

      {elegido && (
        <div role="dialog" aria-label={`Código de ${elegido.nombre}`} onClick={() => setElegido(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16 }}>
          <div style={{ color: '#000', fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{elegido.nombre}</div>
          <Barras valor={codigoDe(elegido)} ancho={4} />
          {conQr && <Qr valor={codigoDe(elegido)} />}
          <div style={{ color: '#555', fontSize: 14 }}>Toca para cerrar</div>
        </div>
      )}
    </div>
  )
}
