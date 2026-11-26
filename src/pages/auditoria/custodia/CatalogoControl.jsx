// CATÁLOGO DE CONTROL (solo el dueño y el soporte RANNIX configuran): banderas por producto que deciden qué se controla en la cadena de custodia.
//   · requiere sello  → entra a la recepción con responsiva y a los sellos VOID (en el piloto solo lo caro y en caja, NO las 2,000 claves).
//   · requiere serie  → número de serie por pieza (no por modelo).
//   · alto valor      → serie obligatoria, entra a la custodia del relevo y su venta avisa de inmediato al dueño.
//   · peso de caja llena (gramos) → permite verificar con báscula sin abrir la caja.
// Cada cambio queda en bitácora (quién, cuándo, antes y después).
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import FormField from '../../../components/ui/FormField'
import Modal from '../../../components/ui/Modal'
import EmptyState from '../../../components/ui/EmptyState'
import StatusBadge from '../../../components/ui/StatusBadge'
import { listarProductosControl, guardarAtributos } from '../../../lib/auditoria/custodiaApi'
import { errMsg } from '../comun'

export default function CatalogoControl({ puedeEditar = true }) {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [soloMarcados, setSoloMarcados] = useState(true)
  const [edit, setEdit] = useState(null)
  const q = useQuery({ queryKey: ['ctl-catalogo-control', busqueda, soloMarcados], retry: false,
    queryFn: async () => { const r = await listarProductosControl({ busqueda: busqueda || null, soloMarcados, limite: 200 }); if (r.error) throw new Error(errMsg(r.error)); return r.data ?? [] } })
  async function guardar() {
    const r = await guardarAtributos({ productoId: edit.id, requiereSerie: edit.requiere_serie, requiereSello: edit.requiere_sello, altoValor: edit.alto_valor, pesoCajaLlena: edit.peso_caja_llena === '' || edit.peso_caja_llena == null ? null : Number(edit.peso_caja_llena) })
    if (r.error) return toast.error(errMsg(r.error), { duration: 8000 })
    toast.success('Banderas guardadas'); setEdit(null); qc.invalidateQueries({ queryKey: ['ctl-catalogo-control'] }); qc.invalidateQueries({ queryKey: ['ctl-prod-escaneables'] })
  }
  const filas = q.data ?? []
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>
        Marque solo lo que de verdad se controla: exigir sello o serie en 2,000 claves hace que en dos semanas lo dejen de usar. Una pieza de <b>alto valor</b> siempre se identifica por su número de serie.
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <FormField label="Buscar producto (nombre, código o SKU)" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <label style={{ fontSize: 13, marginBottom: 14 }}><input type="checkbox" checked={soloMarcados} onChange={e => setSoloMarcados(e.target.checked)} /> Solo los marcados</label>
      </div>
      {q.isError && <EmptyState title="No se pudo cargar" description={q.error.message} />}
      {!q.isLoading && !q.isError && !filas.length && <EmptyState title={soloMarcados ? 'Ningún producto marcado todavía' : 'Sin resultados'} description={soloMarcados ? 'Desactive «Solo los marcados» para buscar un producto y marcarlo.' : 'Pruebe con otro nombre, código o SKU.'} />}
      {filas.length > 0 && (
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Producto</th><th>Código</th><th>Sello</th><th>Serie</th><th>Alto valor</th><th>Peso caja llena (g)</th><th></th></tr></thead>
          <tbody>{filas.map(p => (
            <tr key={p.id}>
              <td>{p.descripcion}</td><td>{p.codigo_barras ?? p.sku}</td>
              <td>{p.requiere_sello ? <StatusBadge variante="v" label="Sí" /> : '—'}</td><td>{p.requiere_serie ? <StatusBadge variante="v" label="Sí" /> : '—'}</td>
              <td>{p.alto_valor ? <StatusBadge variante="a" label="Sí" /> : '—'}</td><td>{p.peso_caja_llena ?? '—'}</td>
              <td>{puedeEditar && <button className="btn o sm" aria-label={`Editar ${p.descripcion}`} onClick={() => setEdit({ ...p, peso_caja_llena: p.peso_caja_llena ?? '' })}><Pencil size={13} /></button>}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.descripcion ?? ''} size="sm" footer={<><button className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
        {edit && <>
          <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={!!edit.requiere_sello} onChange={e => setEdit({ ...edit, requiere_sello: e.target.checked })} /> Requiere sello VOID (recepción con responsiva)</label>
          <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={!!edit.requiere_serie || !!edit.alto_valor} disabled={!!edit.alto_valor} onChange={e => setEdit({ ...edit, requiere_serie: e.target.checked })} /> Requiere número de serie por pieza</label>
          <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={!!edit.alto_valor} onChange={e => setEdit({ ...edit, alto_valor: e.target.checked, requiere_serie: e.target.checked ? true : edit.requiere_serie })} /> Alto valor (su venta avisa al dueño; entra a la custodia del relevo)</label>
          <FormField label="Peso de la caja llena, en gramos (opcional)" type="number" inputMode="decimal" value={edit.peso_caja_llena} onChange={e => setEdit({ ...edit, peso_caja_llena: e.target.value })} />
          <div className="hint">Con el peso, una caja vacía se detecta en dos segundos con la báscula, sin abrirla. La tolerancia se configura en Parámetros (±5 % por omisión, tope 25 %).</div>
        </>}
      </Modal>
    </>
  )
}
