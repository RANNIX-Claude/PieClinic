import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { leer, insertar, borrar } from '../../../lib/api'
import FormField from '../../../components/ui/FormField'
import { fecha, hoyISO } from '../../../lib/formato'
import { kitUsable } from '../../../lib/clinico/esterilizacion'
import { Aviso, useAccion, mensajeError, num } from './comunes'

/** Productos y material usado (consumos_consulta) + kit de instrumental y su lote de autoclave (trazabilidad, P-023). */
export default function ConsultaProductos({ consulta, editable }) {
  const { ejecutar, ocupado } = useAccion()
  const consumos = useQuery({ queryKey: ['clinico', 'consumos', consulta.id], queryFn: async () => { const r = await leer('consumos_consulta', { sedeCol: false, filtros: { consulta_id: consulta.id }, orden: { columna: 'created_at' } }); if (r.error) throw r.error; return r.data } })
  const prods = useQuery({ queryKey: ['clinico', 'productos'], queryFn: async () => { const r = await leer('prp_productos', { sedeCol: false, columnas: 'id,nombre', orden: { columna: 'nombre' }, limite: 500 }); return r.error ? [] : r.data } })
  const usos = useQuery({ queryKey: ['clinico', 'usos-kit', consulta.id], queryFn: async () => { const r = await leer('uso_kit_consulta', { sedeCol: false, filtros: { consulta_id: consulta.id } }); if (r.error) throw r.error; return r.data } })
  const kits = useQuery({
    queryKey: ['clinico', 'kits-disponibles', consulta.sede_id], enabled: editable,
    queryFn: async () => {
      const k = await leer('kits_instrumental', { sedeCol: false, filtros: { sede_id: consulta.sede_id, estado: 'esterilizado', activo: true }, orden: { columna: 'codigo' } })
      if (k.error) throw k.error
      const ids = [...new Set(k.data.map(x => x.ultimo_lote_id).filter(Boolean))]
      const l = ids.length ? await leer('prp_esterilizacion_lotes', { sedeCol: false, filtros: { lote_id: ids } }) : { data: [] }
      const lm = Object.fromEntries((l.data ?? []).map(x => [x.lote_id, x]))
      return k.data.map(x => ({ ...x, lote: lm[x.ultimo_lote_id] }))
    },
  })
  const todosKits = useQuery({ queryKey: ['clinico', 'kits-todos', consulta.sede_id], queryFn: async () => { const r = await leer('kits_instrumental', { sedeCol: false, filtros: { sede_id: consulta.sede_id }, columnas: 'id,codigo,nombre' }); return r.error ? [] : r.data } })
  const [n, setN] = useState({ producto_id: '', lote_texto: '', caducidad: '', cantidad: '1', cobrar: false })
  const [kitId, setKitId] = useState('')
  const pm = Object.fromEntries((prods.data ?? []).map(p => [p.id, p.nombre]))
  const km = Object.fromEntries((todosKits.data ?? []).map(k => [k.id, k]))
  const err = consumos.error ?? usos.error
  if (err) return <Aviso tipo="err">{mensajeError(err)}</Aviso>
  const elegido = (kits.data ?? []).find(k => k.id === kitId)
  const chequeo = elegido ? kitUsable(elegido, elegido.lote ? { estado: elegido.lote.estado, esteril_hasta: elegido.lote.esteril_hasta } : null, hoyISO()) : null

  return (
    <div>
      <table>
        <thead><tr><th>Producto</th><th>Lote</th><th>Caduca</th><th className="num">Cant.</th><th>Cobrar</th><th></th></tr></thead>
        <tbody>
          {(consumos.data ?? []).length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>Sin productos registrados.</td></tr>}
          {(consumos.data ?? []).map(c => <tr key={c.id}><td>{pm[c.producto_id] ?? 'Producto'}</td><td>{c.lote_texto ?? '—'}</td><td>{fecha(c.caducidad)}</td><td className="num">{c.cantidad}</td><td>{c.cobrar ? 'Sí' : 'No'}</td>
            <td>{editable && <button type="button" className="btn o sm" onClick={() => ejecutar(() => borrar('consumos_consulta', c.id), { invalidar: ['clinico'] })}>Quitar</button>}</td></tr>)}
        </tbody>
      </table>
      {editable && (
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <FormField label="Producto" as="select" options={(prods.data ?? []).map(p => ({ value: p.id, label: p.nombre }))} value={n.producto_id} onChange={e => setN(s => ({ ...s, producto_id: e.target.value }))} />
          <FormField label="Lote" value={n.lote_texto} onChange={e => setN(s => ({ ...s, lote_texto: e.target.value }))} />
          <FormField label="Caduca" type="date" value={n.caducidad} onChange={e => setN(s => ({ ...s, caducidad: e.target.value }))} />
          <FormField label="Cantidad" type="number" min="0.001" step="any" value={n.cantidad} onChange={e => setN(s => ({ ...s, cantidad: e.target.value }))} style={{ maxWidth: 100 }} />
          <label style={{ fontSize: 12, paddingBottom: 8 }}><input type="checkbox" checked={n.cobrar} onChange={e => setN(s => ({ ...s, cobrar: e.target.checked }))} /> Cobrar</label>
          <button type="button" className="btn sm" disabled={ocupado || !n.producto_id || !(num(n.cantidad) > 0)} onClick={async () => {
            if (await ejecutar(() => insertar('consumos_consulta', { consulta_id: consulta.id, sede_id: consulta.sede_id, producto_id: n.producto_id, lote_texto: n.lote_texto || null, caducidad: n.caducidad || null, cantidad: num(n.cantidad), cobrar: n.cobrar }), { ok: 'Producto agregado', invalidar: ['clinico'] })) setN({ producto_id: '', lote_texto: '', caducidad: '', cantidad: '1', cobrar: false })
          }}>+ Producto</button>
        </div>)}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '6px 0' }}>El descuento de existencias lo hace Inventario al cobrar el ticket (los productos marcados «Cobrar» pasan a Caja).</div>

      <h4 style={{ margin: '14px 0 6px', fontSize: 12.5 }}>Instrumental y lote de autoclave (trazabilidad)</h4>
      {(usos.data ?? []).map(u => <div key={u.id} style={{ fontSize: 13, padding: '3px 0' }}>Kit <b>{km[u.kit_id]?.codigo ?? ''}</b> {km[u.kit_id]?.nombre ?? ''} · usado {fecha(u.usado_en)} · método {u.metodo_seleccion}</div>)}
      {!(usos.data ?? []).length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Aún no se ligó un kit a esta consulta.</div>}
      {editable && (
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <FormField label="Kit esterilizado disponible" as="select" value={kitId} onChange={e => setKitId(e.target.value)}
            options={(kits.data ?? []).map(k => ({ value: k.id, label: `${k.codigo} · ${k.nombre} · lote ${k.lote?.lote ?? '—'} (${k.lote?.estado ?? '—'})` }))} />
          <button type="button" className="btn sm" disabled={ocupado || !kitId || chequeo?.ok === false} onClick={async () => {
            if (await ejecutar(() => insertar('uso_kit_consulta', { consulta_id: consulta.id, kit_id: kitId, lote_id: elegido.ultimo_lote_id, cabina_id: consulta.cabina_id ?? null, metodo_seleccion: 'manual', usado_en: new Date().toISOString() }), { ok: 'Kit ligado a la consulta', invalidar: ['clinico'] })) setKitId('')
          }}>Usar kit</button>
        </div>)}
      {chequeo?.ok === false && <Aviso tipo="err">{chequeo.motivo}</Aviso>}
      {editable && kits.data && !kits.data.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No hay kits esterilizados en esta sede. Registra un lote en Esterilización.</div>}
    </div>
  )
}
