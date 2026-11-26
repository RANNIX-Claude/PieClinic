// Entregas de turno (relevo). Quien entra o sale ve las suyas y puede aceptar o firmar con PIN; dueño y supervisor ven todas, incluidas las
// «entrega no aceptada» (lo que alimenta el tablero de la Etapa 6). Caja consulta piefirme.ctl_entrega_pendiente para bloquear ventas.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../../../context/AppContext'
import { leer } from '../../../lib/api'
import { listarEntregas, verRelevo } from '../../../lib/auditoria/conteoApi'
import { mensajeError } from '../../../lib/auditoria/roles'
import { fechaHora } from '../../../lib/formato'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import ResultadoRelevo from './ResultadoRelevo'

const NOMBRE = { contando: 'Contando', por_aceptar: 'Cuadra: falta aceptar', con_diferencia: 'Con diferencia', aceptada: 'Aceptada', aceptada_con_diferencia: 'Aceptada con diferencia', entrega_no_aceptada: 'Entrega no aceptada', cancelada: 'Cancelada' }
const VARIANTE = { contando: 'b', por_aceptar: 'a', con_diferencia: 'r', aceptada: 'v', aceptada_con_diferencia: 'a', entrega_no_aceptada: 'r', cancelada: 'n' }

export default function Entregas({ revisor }) {
  const { user, sedes } = useApp()
  const [sel, setSel] = useState(null)
  const nombreSede = id => sedes.find(s => s.id === id)?.nombre ?? '—'
  const q = useQuery({
    queryKey: ['ctl-entregas', revisor], retry: false, refetchInterval: 15000,
    queryFn: async () => {
      if (revisor) { const r = await listarEntregas({ limite: 100 }); if (r.error) throw new Error(mensajeError(r.error)); return r.data ?? [] }
      const r = await leer('ctl_entrega_turno', { sedeCol: false, orden: [{ columna: 'creado_en', asc: false }], limite: 50 })
      if (r.error) throw new Error(mensajeError(r.error))
      return r.data.filter(e => e.usuario_entrante === user?.id || e.usuario_saliente === user?.id)
    },
  })
  const detalle = useQuery({
    queryKey: ['ctl-relevo', sel?.id], enabled: !!sel?.id, retry: false,
    queryFn: async () => { const r = await verRelevo(sel.id); if (r.error) throw new Error(mensajeError(r.error)); return r.data },
  })
  const columnas = [
    { key: 'sucursal', label: 'Sucursal', render: f => f.sucursal ?? nombreSede(f.sucursal_id), valor: f => f.sucursal ?? nombreSede(f.sucursal_id), filtro: true },
    { key: 'estado', label: 'Estado', filtro: true, valor: f => NOMBRE[f.estado] ?? f.estado, render: f => <StatusBadge estado={f.estado} label={NOMBRE[f.estado] ?? f.estado} variante={VARIANTE[f.estado]} /> },
    { key: 'entrante', label: 'Entrante', render: f => f.entrante ?? (f.usuario_entrante === user?.id ? 'Tú' : '—') },
    { key: 'saliente', label: 'Saliente', render: f => f.saliente ?? (f.usuario_saliente === user?.id ? 'Tú' : '—') },
    { key: 'creado_en', label: 'Creada', render: f => fechaHora(f.creado_en) },
    { key: 'aceptada_en', label: 'Aceptada', render: f => (f.aceptada_en ? fechaHora(f.aceptada_en) : '—') },
  ]
  const mia = sel && (sel.usuario_entrante === user?.id || sel.usuario_saliente === user?.id)
  const d = detalle.data
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <DataTable columnas={columnas} filas={q.data ?? []} cargando={q.isLoading} error={q.isError ? q.error.message : undefined} onFila={setSel}
        vacio={{ title: 'Sin entregas', description: 'Los relevos de turno con custodia aparecen aquí; la entrega que nadie acepta queda marcada «entrega no aceptada».' }} />
      {sel && (
        <div className="card" style={{ maxWidth: 640 }}>
          <b>{sel.sucursal ?? nombreSede(sel.sucursal_id)}</b> · <StatusBadge estado={sel.estado} label={NOMBRE[sel.estado] ?? sel.estado} variante={VARIANTE[sel.estado]} />
          {detalle.isLoading && <div style={{ marginTop: 8 }}>Cargando…</div>}
          {detalle.isError && <div style={{ marginTop: 8 }}>{detalle.error.message}</div>}
          {d && ['por_aceptar', 'con_diferencia', 'aceptada_con_diferencia'].includes(d.estado) && mia && (
            <div style={{ marginTop: 10 }}>
              <ResultadoRelevo relevo={{ cuadra: d.estado === 'por_aceptar', diferencias: d.diferencias }} entregaId={d.entrega_id} saliente={sel.usuario_saliente === user?.id && sel.usuario_entrante !== user?.id} />
            </div>
          )}
          {d && !mia && d.diferencias?.length > 0 && (
            <ul style={{ margin: '10px 0 0 18px', fontSize: 13 }}>{d.diferencias.map(x => <li key={x.producto_id}>{x.descripcion}: {x.no_reportado ? 'sin contar' : `${x.diferencia_relevo > 0 ? '+' : ''}${x.diferencia_relevo}`}</li>)}</ul>
          )}
          {d && d.estado === 'entrega_no_aceptada' && <div className="hint" style={{ marginTop: 8 }}>El turno anterior cerró y la entrega no se aceptó a tiempo{d.no_aceptada_en ? ` (${fechaHora(d.no_aceptada_en)})` : ''}. El entrante sigue sin poder vender hasta contar y aceptar.</div>}
        </div>
      )}
    </div>
  )
}
