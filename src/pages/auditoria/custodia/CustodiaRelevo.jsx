// CUSTODIA DEL RELEVO: qué piezas se cuentan en cada relevo de turno. Incluye las de alto valor. TOPE DURO de 30 productos activos por sucursal (lo valida la base de
// datos): la pantalla EXPLICA por qué se niega el 31 (criterio 7) en lugar de rechazar en silencio. Administra el dueño; el supervisor ve; quien captura ve la lista
// (sin existencias). También muestra las tomas fijas de la sucursal (la guía fantasma); se administran en Configuración → Tomas fijas.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, Plus, Trash2, Gem, Camera } from 'lucide-react'
import FormField from '../../../components/ui/FormField'
import EmptyState from '../../../components/ui/EmptyState'
import StatusBadge from '../../../components/ui/StatusBadge'
import { usePermiso } from '../../../lib/permisos'
import { activarCustodia, desactivarCustodia, listar } from '../../../lib/auditoria/api'
import { estadoCustodia, incluirAltoValorEnCustodia, productosEscaneables } from '../../../lib/auditoria/custodiaApi'
import { evaluarTopeCustodia, MOTIVO_TOPE_CUSTODIA } from '../../../lib/auditoria/custodia'
import { TOPE_CUSTODIA } from '../../../lib/auditoria/config'
import { errMsg, useDatos } from '../comun'
import { SelectorSucursal, useSucursalInicial } from './comunCustodia'

export default function CustodiaRelevo() {
  const qc = useQueryClient()
  const administra = usePermiso('auditoria.configurar')
  const veDirecto = usePermiso('auditoria.investigar')
  const [sucursal, setSucursal] = useSucursalInicial()
  const [producto, setProducto] = useState('')
  const [negado, setNegado] = useState(null)       // la explicación que dio la base de datos (o el aviso previo)
  const q = useQuery({ queryKey: ['ctl-custodia-estado', sucursal], enabled: !!sucursal, retry: false,
    queryFn: async () => { const r = await estadoCustodia(sucursal); if (r.error) throw new Error(errMsg(r.error)); return r.data } })
  const prods = useQuery({ queryKey: ['ctl-prod-escaneables'], enabled: administra, retry: false, queryFn: async () => { const r = await productosEscaneables(); return r.data ?? [] } })
  const tomas = useDatos(['ctl-tomas-custodia', sucursal], () => (sucursal ? listar('ctl_toma_fija', { filtros: { sucursal_id: sucursal }, orden: [{ columna: 'orden', asc: true }], limite: 50 }) : Promise.resolve({ data: [] })))
  const e = q.data
  const activos = e?.productos ?? []
  const tope = evaluarTopeCustodia(e?.activos ?? 0)
  const disponibles = useMemo(() => (prods.data ?? []).filter(p => !activos.some(a => a.producto_id === p.id)), [prods.data, activos])
  const refrescar = () => qc.invalidateQueries({ queryKey: ['ctl-custodia-estado'] })

  async function agregar() {
    setNegado(null)
    const r = await activarCustodia(sucursal, producto)
    if (r.error) { setNegado(errMsg(r.error)); return }        // trae la explicación del tope desde la base
    toast.success('Producto en custodia'); setProducto(''); refrescar()
  }
  async function quitar(a) {
    const r = await desactivarCustodia(sucursal, a.producto_id)
    if (r.error) return toast.error(errMsg(r.error))
    setNegado(null); refrescar()
  }
  async function incluirAlto() {
    setNegado(null)
    const r = await incluirAltoValorEnCustodia(sucursal)
    if (r.error) return toast.error(errMsg(r.error))
    if (r.data.agregados?.length) toast.success(`${r.data.agregados.length} producto(s) de alto valor en custodia`)
    if (r.data.omitidos?.length) setNegado(`No entraron: ${r.data.omitidos.map(o => o.descripcion).join(', ')}. ${r.data.mensaje}`)
    refrescar()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="hint" style={{ marginBottom: 8 }}>Lo que se cuenta en cada relevo de turno, incluidas las piezas de alto valor. <b>Tope duro: {TOPE_CUSTODIA} productos activos por sucursal.</b></div>
      <SelectorSucursal value={sucursal} onChange={v => { setSucursal(v); setNegado(null) }} />
      {q.isError && <EmptyState title="No se pudo cargar" description={q.error.message} />}
      {e && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{e.activos} de {e.tope} lugares usados</div>
            <div role="progressbar" aria-valuenow={e.activos} aria-valuemin={0} aria-valuemax={e.tope} style={{ flex: 1, height: 10, background: 'var(--border, #ddd)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (e.activos / e.tope) * 100)}%`, height: '100%', background: e.lleno ? 'var(--red, #c0392b)' : 'var(--accent, #6d4cff)' }} />
            </div>
          </div>
          {(e.lleno || negado) && (
            <div className="card" role="alert" style={{ marginBottom: 10, fontSize: 13.5, borderLeft: '4px solid var(--red, #c0392b)' }}>
              <ShieldAlert size={14} style={{ verticalAlign: -2 }} /> <b>{e.lleno ? 'La custodia está llena.' : 'No se pudo agregar.'}</b> {negado ?? tope.mensaje}
              {!negado && <div className="hint" style={{ marginTop: 4 }}>{MOTIVO_TOPE_CUSTODIA}</div>}
            </div>
          )}
          {administra && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
              <FormField label="Agregar producto a la custodia" as="select" value={producto} onChange={ev => setProducto(ev.target.value)}
                options={[{ value: '', label: 'Seleccione…' }, ...disponibles.map(p => ({ value: p.id, label: `${p.descripcion}${p.requiere_sello ? ' · con sello' : ''}` }))]} />
              <button className="btn" style={{ marginBottom: 8 }} disabled={!producto} onClick={agregar}><Plus size={14} style={{ verticalAlign: -2 }} /> Agregar</button>
              <button className="btn o" style={{ marginBottom: 8 }} onClick={incluirAlto}><Gem size={14} style={{ verticalAlign: -2 }} /> Incluir piezas de alto valor</button>
            </div>
          )}
          {!activos.length && <EmptyState title="Sin productos en custodia" description="Sin productos en custodia no hay relevo de turno que contar. El dueño elige cuáles." />}
          {activos.length > 0 && (
            <div className="tabla-wrap"><table className="tabla">
              <thead><tr><th>Producto</th><th>Código</th><th>Control</th>{veDirecto && <th>Piezas con serie</th>}<th></th></tr></thead>
              <tbody>{activos.map(a => (
                <tr key={a.producto_id}><td>{a.descripcion}</td><td>{a.codigo_barras ?? '—'}</td>
                  <td>{a.alto_valor && <StatusBadge variante="a" label="alto valor" />} {a.requiere_serie && <StatusBadge variante="n" label="serie" />} {a.requiere_sello && <StatusBadge variante="n" label="sello" />}</td>
                  {veDirecto && <td>{a.piezas_en_sucursal ?? '—'}</td>}
                  <td>{administra && <button className="btn o sm" onClick={() => quitar(a)} title="Quitar de la custodia"><Trash2 size={13} /></button>}</td></tr>))}</tbody>
            </table></div>
          )}
        </>
      )}
      <div className="card" style={{ marginTop: 14, padding: 14 }}>
        <h3 style={{ marginTop: 0 }}><Camera size={16} style={{ verticalAlign: -3 }} /> Tomas fijas de la sucursal</h3>
        <div className="hint" style={{ marginBottom: 6 }}>Cada toma lleva una foto anterior como fantasma para alinear el encuadre. Se crean y editan en Configuración de auditoría → Tomas fijas.</div>
        {!(tomas.data?.data ?? []).length && <div className="hint">Esta sucursal no tiene tomas fijas.</div>}
        {(tomas.data?.data ?? []).map(t => <div key={t.id}>{t.nombre} · {t.activa ? 'activa' : 'inactiva'} · {t.evidencia_referencia_id ? 'ya tiene foto de referencia (fantasma)' : 'aún sin foto de referencia'}</div>)}
      </div>
    </div>
  )
}
