// Resultado de una sesión de conteo: SOLO dueño y supervisor (diferencias valorizadas). El servidor lo exige (ctl_sesion_detalle → PF403 para
// cualquier otro rol) y cada consulta queda en la bitácora de consultas.
import { useQuery } from '@tanstack/react-query'
import { detalleSesion } from '../../../lib/auditoria/conteoApi'
import { NOMBRE_MODO, NOMBRE_ESTADO_SESION, NOMBRE_LISTA } from '../../../lib/auditoria/conteoModos'
import { NOMBRE_CLASE_PRECIO } from '../../../lib/auditoria/conteoPrecio'
import { formatoDuracion } from '../../../lib/auditoria/remotaAvance'
import { mensajeError } from '../../../lib/auditoria/roles'
import { fechaHora, moneda } from '../../../lib/formato'
import Modal from '../../../components/ui/Modal'
import DataTable from '../../../components/ui/DataTable'
import KPICard from '../../../components/ui/KPICard'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'

export default function ResultadoSesion({ sesionId, onClose }) {
  const q = useQuery({ queryKey: ['ctl-sesion-detalle', sesionId], enabled: !!sesionId, retry: false,
    queryFn: async () => { const r = await detalleSesion(sesionId); if (r.error) throw new Error(mensajeError(r.error)); return r.data } })
  const s = q.data?.sesion
  const columnas = [
    { key: 'descripcion', label: 'Producto' },
    { key: 'cantidad_fisica', label: 'Contado', align: 'right' },
    { key: 'saldo_sistema', label: 'Saldo', align: 'right' },
    { key: 'diferencia_piezas', label: 'Diferencia', align: 'right', render: f => <b style={{ color: Number(f.diferencia_piezas) === 0 ? undefined : 'var(--danger, #c0392b)' }}>{Number(f.diferencia_piezas) > 0 ? `+${f.diferencia_piezas}` : f.diferencia_piezas}</b> },
    { key: 'diferencia_valor', label: 'Valor al costo', align: 'right', render: f => moneda(f.diferencia_valor) },
    { key: 'precio_etiqueta', label: 'Etiqueta', align: 'right', render: f => (f.precio_etiqueta == null ? '—' : moneda(f.precio_etiqueta)) },
    { key: 'clasificacion_precio', label: 'Precio', render: f => (f.clasificacion_precio ? NOMBRE_CLASE_PRECIO[f.clasificacion_precio] + (f.clasificacion_manual ? ' (auditor)' : '') : '—') },
    { key: 'caso_folio', label: 'Caso', render: f => [f.caso_folio, f.caso_precio_folio].filter(Boolean).join(' · ') || '—' },
  ]
  return (
    <Modal open onClose={onClose} size="wide" title={s ? `${s.folio} · ${NOMBRE_MODO[s.tipo] ?? s.tipo}` : 'Resultado de la sesión'}>
      {q.isLoading && <LoadingSpinner />}
      {q.isError && <EmptyState title="No disponible" description={q.error.message} />}
      {s && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {s.sucursal} · {NOMBRE_ESTADO_SESION[s.estado] ?? s.estado} · {NOMBRE_LISTA[s.modo_lista]} · abierta {fechaHora(s.abierta_en)}{s.cerrada_en ? ` · cerrada ${fechaHora(s.cerrada_en)}` : ''}
            {s.capturista ? ` · captura: ${s.capturista}` : ''}{s.respuesta_seg != null ? ` · respondió en ${formatoDuracion(s.respuesta_seg)}` : ''}{s.duracion_seg != null ? ` · duración ${formatoDuracion(s.duracion_seg)}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <KPICard title="Partidas" value={s.total_partidas ?? 0} />
            <KPICard title="Con diferencia" value={s.partidas_con_diferencia ?? 0} />
            <KPICard title="Valor neto" value={moneda(s.valor_diferencia ?? 0)} />
            <KPICard title="No reportadas" value={s.no_reportadas ?? 0} />
            <KPICard title="Casos abiertos" value={s.casos_abiertos ?? 0} />
          </div>
          <DataTable columnas={columnas} filas={q.data.partidas} vacio={{ title: 'Sin partidas', description: 'No se capturó nada en esta sesión.' }} />
          {q.data.no_reportados.length > 0 && (
            <div>
              <h4 style={{ margin: '4px 0' }}>No reportados (la lista lo pidió y nadie lo reportó)</h4>
              <DataTable columnas={[{ key: 'descripcion', label: 'Producto' }, { key: 'codigo_barras', label: 'Código' }, { key: 'caso_folio', label: 'Caso', render: f => f.caso_folio ?? '—' }]} filas={q.data.no_reportados} />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
