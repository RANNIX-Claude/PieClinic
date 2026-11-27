// Utilidades compartidas de la pantalla Pedidos (pedidos especiales a proveedores a nombre de un cliente).
// Lecturas de las vistas prp_pedidos_especiales / prp_pedido_lineas / prp_pedido_bitacora y escrituras SOLO por RPC (migración 321).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useApp } from '../../../context/AppContext'
import { rpc } from '../../../lib/api'
import { textoError } from '../../comercial/componentes/comun'
import { ESTADOS, SEMAFORO } from '../../../lib/plataforma/pedidosEspeciales'
import { moneda, fecha } from '../../../lib/formato'
import StatusBadge from '../../../components/ui/StatusBadge'
import { CLAVE } from '../inventario/comun'

export { useLectura, msgError } from '../inventario/comun'
export { textoError }

/** Variante de color de cada estado del pedido. */
export const VARIANTE_ESTADO = {
  solicitado: 'n', anticipo_cobrado: 'b', autorizado: 'm', enviado_proveedor: 'b', aceptado: 'm', en_transito: 'a', recibido: 'v', entregado: 'v', en_espera: 'a', cancelado: 'n',
}
export const EstadoPedido = ({ estado }) => <StatusBadge estado={estado} label={ESTADOS[estado] ?? estado} variante={VARIANTE_ESTADO[estado]} />
export const Semaforo = ({ valor, dias }) => (valor ? <span className={`bd ${SEMAFORO[valor].variante}`}>{SEMAFORO[valor].texto}{dias > 0 ? ` · ${dias} d` : ''}</span> : null)

/** Ejecuta una RPC del pedido: avisa con toast, refresca las lecturas y devuelve el resultado (o false si falló). */
export function useAccionPedido() {
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const correr = async (fn, args, ok) => {
    setOcupado(true)
    try {
      const r = await rpc(fn, args)
      if (r.error) throw new Error(textoError(r.error))
      if (ok) toast.success(ok)
      qc.invalidateQueries({ queryKey: [CLAVE] }); qc.invalidateQueries({ queryKey: ['comercial'] }); qc.invalidateQueries({ queryKey: ['pedidos'] })
      return r.data ?? true
    } catch (e) { toast.error(e.message || 'No se pudo completar la acción'); return false } finally { setOcupado(false) }
  }
  return { correr, ocupado }
}

/** Turno de caja abierto del usuario en la sede (para cobrar anticipos y saldos). */
export function useTurnoAbierto(sedeId) {
  const { user } = useApp()
  const q = useQuery({
    queryKey: ['pedidos', 'turno', sedeId, user?.id], enabled: !!sedeId && !!user?.id,
    queryFn: async () => (await import('../../../lib/api')).leer('prp_turnos_caja', { sedeCol: false, filtros: { sede_id: sedeId, estado: 'abierto', cajero_id: user.id }, limite: 1 }),
  })
  return { turno: q.data?.data?.[0] ?? null, cargando: q.isLoading }
}

/** Columnas comunes de las tablas de pedidos. */
export const colsPedido = ({ verCostos = false, conCliente = true, conProveedor = true } = {}) => [
  { key: 'folio', label: 'Folio', render: p => <b>{p.folio}</b> },
  ...(conCliente ? [{ key: 'paciente_nombre', label: 'Cliente' }] : []),
  { key: 'producto', label: 'Producto', render: p => <span style={{ fontSize: 12.5 }}>{p.producto}</span> },
  ...(conProveedor ? [{ key: 'proveedor_nombre', label: 'Proveedor', filtro: true }] : []),
  { key: 'sede_nombre', label: 'Sucursal', filtro: true },
  { key: 'estado', label: 'Etapa', filtro: true, valor: p => ESTADOS[p.estado] ?? p.estado, render: p => <EstadoPedido estado={p.estado} /> },
  { key: 'total', label: 'Total', align: 'right', render: p => moneda(p.total), valor: p => Number(p.total) },
  { key: 'anticipo_monto', label: 'Anticipo', align: 'right', render: p => moneda(p.anticipo_monto), valor: p => Number(p.anticipo_monto) },
  { key: 'saldo', label: 'Saldo', align: 'right', render: p => moneda(p.saldo), valor: p => Number(p.saldo) },
  { key: 'fecha_prometida', label: 'Prometida', render: p => fecha(p.fecha_acordada ?? p.fecha_prometida), valor: p => p.fecha_acordada ?? p.fecha_prometida },
  { key: 'semaforo', label: 'Retraso', valor: p => (p.semaforo ? SEMAFORO[p.semaforo].texto : ''), render: p => <Semaforo valor={p.semaforo} dias={p.dias_retraso} /> },
  ...(verCostos ? [{ key: 'costo_estimado', label: 'Costo est.', align: 'right', render: p => (p.costo_estimado == null ? '—' : moneda(p.costo_estimado)), valor: p => Number(p.costo_estimado ?? 0) }] : []),
]
