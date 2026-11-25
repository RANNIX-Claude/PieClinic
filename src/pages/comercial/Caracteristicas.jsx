// Catálogo › Características y adaptaciones (pieza F17): lo que se elige al vender un producto especial a la medida (plantillas, calzado).
// Cada característica aporta una frase a la descripción del renglón (sale en ticket y factura) y puede sumar al precio (fijo o por unidad).
// Lee/escribe caracteristicas_producto; solo el Administrador edita. RPC caracteristicas_inicializar() carga el catálogo base de Pie Clinic.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import { usePermiso } from '../../lib/permisos'
import { actualizar, insertar, rpc } from '../../lib/api'
import { moneda } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import FormField from '../../components/ui/FormField'
import Modal from '../../components/ui/Modal'
import DataTable from '../../components/ui/DataTable'
import { useLeer, AvisoError, ejecutar, textoError } from './componentes/comun'

const EFECTOS = [['ninguno', 'No cambia el precio'], ['fijo', 'Suma un monto fijo'], ['por_unidad', 'Suma un monto por unidad (cm, mm…)']]
const vacio = { grupo: '', nombre: '', frase: '', tipo_valor: 'ninguno', unidad: '', efecto_precio: 'ninguno', monto: '', nota: '', orden: 0, activa: true }

export default function Caracteristicas() {
  const qc = useQueryClient()
  const puedeEditar = usePermiso('catalogo.editar')
  const q = useLeer('caracteristicas', 'caracteristicas_producto', { sedeCol: false, orden: { columna: 'grupo' }, limite: 500 })
  const [f, setF] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['comercial'] }); q.refetch() }

  const inicializar = async () => {
    setOcupado(true)
    const { data, error } = await rpc('caracteristicas_inicializar', {})
    setOcupado(false)
    if (error) return toast.error(textoError(error))
    toast.success(data > 0 ? `Se cargaron ${data} características base` : 'El catálogo base ya estaba cargado')
    refrescar()
  }
  const guardar = async () => {
    if (!f.grupo.trim() || !f.nombre.trim() || !f.frase.trim()) return toast.error('Captura grupo, nombre y la frase para la descripción')
    if (f.efecto_precio === 'por_unidad' && f.tipo_valor !== 'numero') return toast.error('Un precio por unidad necesita que la característica lleve un valor numérico')
    const fila = { grupo: f.grupo.trim(), nombre: f.nombre.trim(), frase: f.frase.trim(), tipo_valor: f.tipo_valor, unidad: f.tipo_valor === 'numero' ? f.unidad || null : null,
      efecto_precio: f.efecto_precio, monto: f.efecto_precio === 'ninguno' ? 0 : Number(f.monto) || 0, nota: f.nota || null, orden: Number(f.orden) || 0, activa: !!f.activa }
    setOcupado(true)
    const ok = await ejecutar(f.id ? actualizar('caracteristicas_producto', f.id, fila) : insertar('caracteristicas_producto', fila), 'Característica guardada')
    setOcupado(false)
    if (ok) { setF(null); refrescar() }
  }

  const columnas = [
    { key: 'grupo', label: 'Grupo', filtro: true }, { key: 'nombre', label: 'Característica' },
    { key: 'frase', label: 'Frase en el ticket', render: c => <span className="text-muted">{c.frase}</span> },
    { key: 'efecto_precio', label: 'Precio', render: c => (c.efecto_precio === 'ninguno' ? '—' : `${moneda(c.monto)}${c.efecto_precio === 'por_unidad' ? ` por ${c.unidad || 'unidad'}` : ''}`), valor: c => Number(c.monto) },
    { key: 'activa', label: 'Estado', render: c => (c.activa ? 'Activa' : 'Inactiva'), filtro: true, valor: c => (c.activa ? 'Activa' : 'Inactiva') },
    { key: 'acc', label: '', sortable: false, exportar: false, render: c => puedeEditar && <button className="btn o" onClick={() => setF({ ...vacio, ...c, unidad: c.unidad ?? '', nota: c.nota ?? '', monto: c.monto ?? '' })}>Editar</button> },
  ]
  return (
    <div className="pagina">
      <PageHeader titulo="Características y adaptaciones" subtitulo="Catálogo › Producto especial a la medida"
        acciones={puedeEditar && <><button className="btn o" disabled={ocupado} onClick={inicializar}>Cargar catálogo base</button> <button className="btn" onClick={() => setF({ ...vacio })}><Plus size={14} style={{ verticalAlign: -2 }} /> Nueva característica</button></>} />
      <div className="card" style={{ marginBottom: 12, fontSize: 13 }}>
        Un producto especial (plantilla a la medida, calzado) se vende como un <b>servicio con «Admite características»</b> (se marca en Catálogo y precios). En Caja se eligen estas
        características: cada una agrega su frase a la descripción del renglón y, si tiene precio, lo suma al total. El precio base del servicio se cotiza en el momento.
      </div>
      <AvisoError error={q.error} />
      <div className="card" style={{ padding: 0 }}>
        <DataTable columnas={columnas} filas={q.filas} cargando={q.cargando} exportarNombre="caracteristicas" vacio={{ title: 'Sin características', description: 'Pulsa «Cargar catálogo base» para empezar con las adaptaciones de Pie Clinic.' }} />
      </div>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? 'Editar característica' : 'Nueva característica'} size="sm"
        footer={<><button className="btn o" onClick={() => setF(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
        {f && <>
          <FormField label="Grupo" required value={f.grupo} onChange={e => set('grupo', e.target.value)} hint="Material, Altura y grosor, Adaptación, Lado…" />
          <FormField label="Nombre" required value={f.nombre} onChange={e => set('nombre', e.target.value)} />
          <FormField label="Frase para la descripción" required value={f.frase} onChange={e => set('frase', e.target.value)} hint="Con valor numérico usa {valor}: «altura {valor} mm»" />
          <div className="grid2">
            <FormField label="Lleva valor" as="select" value={f.tipo_valor} onChange={e => set('tipo_valor', e.target.value)} options={[{ value: 'ninguno', label: 'No' }, { value: 'numero', label: 'Sí, un número' }]} />
            <FormField label="Unidad" value={f.unidad} onChange={e => set('unidad', e.target.value)} disabled={f.tipo_valor !== 'numero'} hint="cm, mm, almas" />
          </div>
          <FormField label="Efecto en el precio" as="select" value={f.efecto_precio} onChange={e => set('efecto_precio', e.target.value)} options={EFECTOS.map(([value, label]) => ({ value, label }))} />
          {f.efecto_precio !== 'ninguno' && <FormField label="Monto (IVA incluido)" type="number" min="0" step="0.01" value={f.monto} onChange={e => set('monto', e.target.value)} />}
          <FormField label="Nota" value={f.nota} onChange={e => set('nota', e.target.value)} />
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!f.activa} onChange={e => set('activa', e.target.checked)} /> Activa (aparece en Caja)</label>
        </>}
      </Modal>
    </div>
  )
}
