// Pestaña «Corte de turno»: resumen por método, movimientos de caja, efectivo contado, tolerancia de $50, PIN del Administrador,
// cierre (RPC cerrar_turno), impresión del corte y revisión por el Administrador.
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Printer } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { insertar, leer, rpc } from '../../../lib/api'
import { fechaHora, moneda } from '../../../lib/formato'
import { resumenTurno, evaluarCierre } from '../../../lib/comercial/corte'
import { param } from '../../../lib/comercial/anticipo'
import { suma } from '../../../lib/comercial/dinero'
import FormField from '../../../components/ui/FormField'
import Modal from '../../../components/ui/Modal'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import PinModal from './PinModal'
import { corteHtml, imprimirHtml } from './ticket'
import { useQuery } from '@tanstack/react-query'
import { useLeer, AvisoError, ejecutar, textoError } from './comun'

export default function CajaCorte({ turno, onCambio }) {
  const { organizacion, sedeActiva, rol, user } = useApp()
  const qc = useQueryClient()
  const esAdmin = rol === 'administrador'
  const puedeTurno = usePermiso('caja.turno')
  const tolerancia = param(organizacion?.parametros, 'tolerancia_corte_mxn')
  const [contado, setContado] = useState('')
  const [justificacion, setJustificacion] = useState('')
  const [aut, setAut] = useState(null)
  const [pin, setPin] = useState(false)
  const [mov, setMov] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['comercial'] }); onCambio?.() }

  const datos = useQuery({
    queryKey: ['comercial', 'corte-datos', turno?.id], enabled: !!turno,
    queryFn: async () => {
      const ventas = await leer('prp_ventas', { sedeCol: false, filtros: { turno_id: turno.id }, limite: 1000 })
      const canceladas = await leer('prp_ventas', { sedeCol: false, filtros: { cancelada_turno_id: turno.id }, limite: 500 })
      const ids = [...new Set([...ventas.data, ...canceladas.data].map(v => v.id))]
      const pagos = ids.length ? await leer('pagos', { sedeCol: false, filtros: { venta_id: ids }, limite: 5000 }) : { data: [] }
      const movs = await leer('movimientos_caja', { sedeCol: false, filtros: { turno_id: turno.id }, orden: { columna: 'created_at' } })
      return { ventas: ventas.data, canceladas: canceladas.data, pagos: pagos.data, movs: movs.data, error: ventas.error ?? pagos.error ?? movs.error }
    },
  })
  const d = datos.data
  const resumen = useMemo(() => {
    if (!turno || !d) return null
    const idsCanc = new Set(d.canceladas.map(v => v.id))
    // Igual que cerrar_turno en el servidor: los pagos de TODAS las ventas del turno (incluidas las canceladas en él); su reverso entra en «Cancelaciones».
    const idsTurno = new Set(d.ventas.map(v => v.id))
    const pagosTurno = d.pagos.filter(p => idsTurno.has(p.venta_id))
    const efCanc = suma(d.pagos.filter(p => idsCanc.has(p.venta_id) && p.metodo === 'efectivo').map(p => p.monto))
    return resumenTurno({ turno, pagos: pagosTurno, movimientos: d.movs, canceladasEfectivo: efCanc, canceladasTotal: suma(d.canceladas.map(v => v.total)), numeroCancelaciones: d.canceladas.length, ventasTotal: suma(d.ventas.filter(v => v.estado !== 'cancelada').map(v => v.total)) })
  }, [turno, d])

  const ev = resumen && contado !== '' ? evaluarCierre({ contado: Number(contado), esperado: resumen.efectivo_esperado, tolerancia, justificacion, esAdmin, autorizado: !!aut }) : null

  const cerrar = async () => {
    if (!ev) return toast.error('Captura el efectivo contado')
    if (!ev.ok) return toast.error(ev.requiere.includes('justificacion') ? 'Justifica la diferencia' : `La diferencia (${moneda(ev.dif)}) supera la tolerancia de ${moneda(tolerancia)}: requiere PIN del Administrador`)
    setOcupado(true)
    const { error } = await rpc('cerrar_turno', { p_turno: turno.id, p_efectivo_contado: Number(contado), p_justificacion: justificacion || null, p_autorizacion: aut })
    setOcupado(false)
    if (error) return toast.error(textoError(error))
    toast.success('Turno cerrado')
    imprimirHtml(corteHtml({ org: organizacion, sede: sedeActiva, turno, resumen, contado: Number(contado), diferencia: ev.dif, justificacion }))
    setContado(''); setJustificacion(''); setAut(null); refrescar()
  }
  const guardarMov = async () => {
    if (!(Number(mov.monto) > 0) || !mov.concepto.trim()) return toast.error('Captura monto y concepto')
    if (await ejecutar(insertar('movimientos_caja', { sede_id: turno.sede_id, turno_id: turno.id, tipo: mov.tipo, monto: Number(mov.monto), concepto: mov.concepto.trim() }), 'Movimiento registrado')) { setMov(null); datos.refetch() }
  }
  const cortes = useLeer('cortes', 'prp_cortes_caja', { orden: { columna: 'created_at', asc: false }, limite: 30 })
  const revisar = async c => { const { error } = await rpc('revisar_turno', { p_turno: c.turno_id }); if (error) toast.error(textoError(error)); else { toast.success('Turno revisado'); refrescar() } }

  const R = resumen
  return (
    <div>
      {!turno ? <div className="card" style={{ marginBottom: 12 }}>No tienes un turno abierto en esta sede. Ábrelo arriba para cobrar y cerrarlo aquí.</div> : (
        <div className="grid2" style={{ gap: 12, alignItems: 'start', marginBottom: 14 }}>
          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Corte del turno · {turno.caja}{turno.nombre_turno ? ` · ${turno.nombre_turno}` : ''}</h3>
            <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Abierto {fechaHora(turno.apertura_en)} · {turno.cajero_nombre}</div>
            <AvisoError error={datos.data?.error ?? datos.error} />
            {!R ? <div className="text-muted">Calculando…</div> : (
              <table><tbody>
                {[['Fondo inicial', R.fondo_inicial], [`Ventas en efectivo`, R.ventas_efectivo], ['Tarjeta (terminal)', R.ventas_tarjeta], ['Transferencia SPEI', R.ventas_transferencia], ['Clip', R.ventas_clip], ['Gift card', R.ventas_gift_card],
                  ['Anticipos aplicados (no es dinero del turno)', R.anticipos_aplicados], ['Cortesías', R.cortesias], ['Retiros / gastos de caja', -R.retiros], [`Cancelaciones (${R.numero_cancelaciones} ticket${R.numero_cancelaciones === 1 ? '' : 's'}) en efectivo`, -R.cancelaciones_efectivo]].map(([k, v]) =>
                  <tr key={k}><td>{k}</td><td className="num">{moneda(v)}</td></tr>)}
                <tr><td><b>Ventas totales del turno</b></td><td className="num"><b>{moneda(R.ventas_total)}</b></td></tr>
                <tr><td><b>Efectivo esperado en caja</b></td><td className="num"><b>{moneda(R.efectivo_esperado)}</b></td></tr>
              </tbody></table>
            )}
            <div style={{ marginTop: 8 }}><button className="btn o" onClick={() => setMov({ tipo: 'retiro', monto: '', concepto: '' })} disabled={!puedeTurno}>Registrar retiro / gasto / depósito</button></div>
            {d?.movs.length > 0 && <table style={{ marginTop: 8, fontSize: 12.5 }}><tbody>{d.movs.map(m => <tr key={m.id}><td>{m.tipo}</td><td>{m.concepto}</td><td className="num">{moneda(m.monto)}</td></tr>)}</tbody></table>}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Cerrar turno</h3>
            <FormField label="Efectivo contado (billetes y monedas)" type="number" min="0" step="0.01" value={contado} onChange={e => { setContado(e.target.value); setAut(null) }} />
            {ev && (
              <div style={{ margin: '4px 0 8px', fontSize: 14 }}>
                Diferencia: <b className={ev.dif === 0 ? 'text-green' : ev.fueraDeTolerancia ? 'text-red' : ''}>{moneda(ev.dif)}</b>
                {ev.dif !== 0 && <span className="text-muted" style={{ fontSize: 12.5 }}> · tolerancia {moneda(tolerancia)} {ev.fueraDeTolerancia ? '(excedida)' : '(dentro)'}</span>}
              </div>
            )}
            {ev && ev.dif !== 0 && <FormField label="Justificación de la diferencia" required as="textarea" rows={2} value={justificacion} onChange={e => setJustificacion(e.target.value)} />}
            {ev?.fueraDeTolerancia && !esAdmin && (aut ? <span className="bd v">Autorizado por Administrador</span> : <button className="btn red" onClick={() => setPin(true)}>Pedir PIN del Administrador</button>)}
            <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0' }}>Cierra: {turno.cajero_nombre} · revisa el Administrador.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" disabled={ocupado || !puedeTurno || !ev} onClick={cerrar}>Cerrar turno</button>
              {R && <button className="btn o" onClick={() => imprimirHtml(corteHtml({ org: organizacion, sede: sedeActiva, turno, resumen: R, contado: contado === '' ? null : Number(contado), diferencia: ev?.dif ?? null, justificacion }))}><Printer size={14} /> Imprimir corte</button>}
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '10px 14px', fontWeight: 700 }}>Cortes anteriores</div>
        <AvisoError error={cortes.error} />
        <DataTable cargando={cortes.cargando} filas={cortes.filas} exportarNombre="cortes-caja" vacio={{ title: 'Sin cortes', description: 'Los cortes aparecen al cerrar turnos.' }}
          columnas={[
            { key: 'cierre_en', label: 'Cierre', render: c => fechaHora(c.cierre_en), valor: c => c.cierre_en }, { key: 'sede_nombre', label: 'Sede', filtro: true }, { key: 'caja', label: 'Caja' }, { key: 'cajero_nombre', label: 'Cajero', filtro: true },
            { key: 'ventas_total', label: 'Ventas', align: 'right', render: c => moneda(c.ventas_total), valor: c => Number(c.ventas_total) },
            { key: 'efectivo_esperado', label: 'Esperado', align: 'right', render: c => moneda(c.efectivo_esperado) }, { key: 'efectivo_contado', label: 'Contado', align: 'right', render: c => moneda(c.efectivo_contado) },
            { key: 'diferencia', label: 'Diferencia', align: 'right', render: c => <span className={c.diferencia_fuera_de_tolerancia ? 'text-red' : ''}>{moneda(c.diferencia)}</span>, valor: c => Number(c.diferencia) },
            { key: 'turno_estado', label: 'Estado', render: c => <StatusBadge estado={c.turno_estado} />, filtro: true },
            { key: 'acc', label: '', sortable: false, exportar: false, render: c => esAdmin && c.turno_estado === 'cerrado' && <button className="btn o" onClick={() => revisar(c)}>Marcar revisado</button> },
          ]} />
      </div>
      <PinModal open={pin} tipo="diferencia_corte" titulo="Autorizar diferencia de caja" motivoInicial={justificacion} onClose={() => setPin(false)} onAutorizado={id => { setAut(id); setPin(false); toast.success('Diferencia autorizada (10 min)') }} />
      <Modal open={!!mov} onClose={() => setMov(null)} size="sm" title="Movimiento de caja" footer={<><button className="btn o" onClick={() => setMov(null)}>Cancelar</button><button className="btn" onClick={guardarMov}>Guardar</button></>}>
        {mov && <>
          <FormField label="Tipo" as="select" value={mov.tipo} onChange={e => setMov(m => ({ ...m, tipo: e.target.value }))} options={[{ value: 'retiro', label: 'Retiro' }, { value: 'gasto', label: 'Gasto de caja' }, { value: 'deposito', label: 'Depósito' }]} />
          <FormField label="Monto" type="number" min="0" step="0.01" value={mov.monto} onChange={e => setMov(m => ({ ...m, monto: e.target.value }))} />
          <FormField label="Concepto" value={mov.concepto} onChange={e => setMov(m => ({ ...m, concepto: e.target.value }))} />
        </>}
      </Modal>
    </div>
  )
}
