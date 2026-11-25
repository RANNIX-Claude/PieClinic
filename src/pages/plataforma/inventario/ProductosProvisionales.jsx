// Productos provisionales (migración 078): códigos que no estaban en el catálogo y se dieron de alta durante el conteo inicial.
// Administración o la supervisión completan marca, categoría, costo y precio (queda activo) o los marcan como duplicado de un producto del catálogo.
import { useEffect, useMemo, useState } from 'react'
import { Eye, PackageSearch } from 'lucide-react'
import toast from 'react-hot-toast'
import { rpc } from '../../../lib/api'
import { urlFirmada, BUCKETS } from '../../../lib/urlFirmada'
import PageHeader from '../../../components/ui/PageHeader'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import { useLectura, useProductos, useAccion, msgError, SelectorProducto, qty, num } from './comun'

const fecha = v => (v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

export default function ProductosProvisionales() {
  const q = useLectura('provisionales', 'prp_productos_provisionales', { sedeCol: false, orden: [{ columna: 'provisional_en', asc: false }], limite: 1000 })
  const { productos } = useProductos()
  const [sel, setSel] = useState(null)
  const categorias = useMemo(() => [...new Set(productos.map(p => p.categoria).filter(c => c && c !== 'Por clasificar'))].sort(), [productos])
  const cols = [
    { key: 'codigo_barras', label: 'Código' },
    { key: 'nombre', label: 'Nombre capturado', render: f => <b>{f.nombre}</b> },
    { key: 'cantidad_contada', label: 'Contado', align: 'right', render: f => qty(f.cantidad_contada), valor: f => num(f.cantidad_contada) },
    { key: 'conteo_folio', label: 'Conteo', filtro: true },
    { key: 'creado_por_nombre', label: 'Lo capturó' },
    { key: 'provisional_en', label: 'Cuándo', render: f => fecha(f.provisional_en) },
    { key: 'foto', label: 'Etiqueta', sortable: false, exportar: false, render: f => f.provisional_foto_path ? <button className="btn o sm" onClick={async e => { e.stopPropagation(); const u = await urlFirmada(BUCKETS.comprobantes, f.provisional_foto_path, 300); if (u) window.open(u, '_blank', 'noopener'); else toast.error('No se pudo abrir la foto.') }}><Eye size={12} /> Ver</button> : '—' },
    { key: 'acc', label: '', sortable: false, exportar: false, render: f => <button className="btn sm" onClick={e => { e.stopPropagation(); setSel(f) }}>Completar</button> },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Productos provisionales" subtitulo="Códigos dados de alta durante el conteo inicial: completa precio, marca y categoría, o márcalos como duplicado" />
      <DataTable columnas={cols} filas={q.filas} cargando={q.cargando} error={msgError(q.error)} exportarNombre="productos_provisionales" placeholderBusqueda="Buscar código o nombre…"
        onFila={f => setSel(f)} vacio={{ icon: PackageSearch, title: 'Sin productos provisionales', description: 'Todo lo contado estaba en el catálogo, o ya se completó.' }} />
      {sel && <Completar prov={sel} productos={productos.filter(p => p.estado !== 'provisional')} categorias={categorias} onClose={() => setSel(null)} />}
    </div>
  )
}

function Completar({ prov, productos, categorias, onClose }) {
  const { correr, ocupado } = useAccion()
  const [f, setF] = useState({ nombre: prov.nombre, marca: '', categoria: '', costo: '', precio: '' })
  const [dup, setDup] = useState('')
  const [modo, setModo] = useState('completar')
  const [foto, setFoto] = useState(null)
  useEffect(() => { let vivo = true; if (prov.provisional_foto_path) urlFirmada(BUCKETS.comprobantes, prov.provisional_foto_path, 600).then(u => vivo && setFoto(u)); return () => { vivo = false } }, [prov.provisional_foto_path])
  const listo = modo === 'duplicado' ? !!dup : f.nombre.trim() && f.categoria && num(f.precio) > 0
  const guardar = async () => {
    const r = await correr(() => rpc('producto_provisional_completar', { p_producto: prov.id, p_nombre: f.nombre, p_marca: f.marca, p_categoria: f.categoria, p_costo: num(f.costo), p_precio: num(f.precio), p_duplicado_de: modo === 'duplicado' ? dup : null }),
      modo === 'duplicado' ? 'Marcado como duplicado: lo contado pasó al producto correcto' : 'Producto completado y activo')
    if (r) onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Provisional · ${prov.codigo_barras}`} cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn" disabled={!listo || ocupado} onClick={guardar}>{modo === 'duplicado' ? 'Marcar como duplicado' : 'Completar y activar'}</button></>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        {foto && <img src={foto} alt="Etiqueta" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />}
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Capturado como «{prov.nombre}» · contado {qty(prov.cantidad_contada)} · {prov.conteo_folio}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button className={`btn ${modo === 'completar' ? '' : 'o'} sm`} onClick={() => setModo('completar')}>Completar datos</button>
        <button className={`btn ${modo === 'duplicado' ? '' : 'o'} sm`} onClick={() => setModo('duplicado')}>Es un duplicado</button>
      </div>
      {modo === 'completar' ? (
        <>
          <FormField label="Nombre" required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
          <FormField label="Marca" value={f.marca} onChange={e => setF({ ...f, marca: e.target.value })} />
          <FormField label="Categoría" required as="select" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} placeholder="Elige…" options={categorias.map(c => ({ value: c, label: c }))} />
          <FormField label="Costo" type="number" min="0" step="any" value={f.costo} onChange={e => setF({ ...f, costo: e.target.value })} />
          <FormField label="Precio de lista (IVA incluido)" required type="number" min="0" step="any" value={f.precio} onChange={e => setF({ ...f, precio: e.target.value })} />
        </>
      ) : (
        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Elige el producto del catálogo del que es duplicado. Lo contado pasa a ese producto y el provisional queda pausado.</div>
          <SelectorProducto productos={productos} value={dup} onChange={setDup} placeholder="SKU o nombre del producto del catálogo…" />
        </div>
      )}
    </Modal>
  )
}
