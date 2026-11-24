// Cuentas por pagar (proveedores) y por cobrar (pacientes) — mockup 38; clon de IRP cuentas_pagar y Cobranza (aplicaciones de pago).
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Link2, Wallet, Ban } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { leer, rpc, insertar, actualizar } from '../../lib/api'
import { moneda, fecha, hoyISO, nombreCompleto } from '../../lib/formato'
import { usePermiso } from '../../lib/permisos'
import { validarAplicaciones, autoDistribuir } from '../../lib/finanzas/aplicaciones.js'
import { rangoMes } from '../../lib/finanzas/semana.js'
import { FORMAS_PAGO } from '../../lib/finanzas/constantes.js'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import StatusBadge from '../../components/ui/StatusBadge'
import Tabs from '../../components/ui/Tabs'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useVista, Chips, VistaNoDisponible, mensajeError, TablaImprimible, BotonesExportar } from './componentes/comunes.jsx'

const ETQ = { programada: 'Programada', por_vencer: 'Por vencer', vencida: 'Vencida', parcial: 'Parcial', pagada: 'Pagada', cancelada: 'Cancelada', reciente: 'Reciente', pendiente: 'Pendiente', en_mora: 'En mora', cobrada: 'Cobrada' }
const ORIGEN = { venta: 'Venta', plan: 'Plan de tratamiento', plantilla_apartado: 'Plantillas (apartado)', cita_sin_cobro: 'Cita sin cobro', otro: 'Otro' }

export default function CuentasPagarCobrar() {
  const { sedes, sedeActivaId } = useApp()
  const puedeEditar = usePermiso('finanzas.editar')
  const qc = useQueryClient()
  const [tab, setTab] = useState('pagar')
  const [filtro, setFiltro] = useState('')
  const [nuevaCxP, setNuevaCxP] = useState(false)
  const [nuevaCxC, setNuevaCxC] = useState(false)
  const [pago, setPago] = useState(null)
  const [ligar, setLigar] = useState(null)
  const [aplicar, setAplicar] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['finanzas'] })

  const pagar = useVista('cxp', 'prp_cuentas_pagar', { orden: [{ columna: 'fecha_vencimiento' }], limite: 3000 })
  const cobrar = useVista('cxc', 'prp_cuentas_cobrar', { orden: [{ columna: 'fecha_emision' }], limite: 3000 })
  const antig = useVista('cxp_ant', 'prp_antiguedad_saldos_pagar', {}, { enabled: tab === 'antiguedad' })
  const pagos = useVista('cxp_pagos', 'prp_pagos_proveedor', { orden: [{ columna: 'fecha', asc: false }], limite: 1000 }, { enabled: tab === 'pagos' })
  const qPac = useQuery({ queryKey: ['finanzas', 'pacientes-nombres'], enabled: tab === 'cobrar', queryFn: async () => (await leer('prp_pacientes', { sedeCol: false, columnas: 'id,nombre_completo', limite: 5000 })).data })
  const nombrePac = id => qPac.data?.find(p => p.id === id)?.nombre_completo ?? '—'

  const cxp = pagar.filas, cxc = cobrar.filas
  const abiertasP = cxp.filter(c => !['pagada', 'cancelada'].includes(c.estado))
  const semana = abiertasP.filter(c => c.estado === 'por_vencer' || c.estado === 'vencida')
  const abiertasC = cxc.filter(c => !['cobrada', 'cancelada'].includes(c.estado))
  const { desde, hasta } = rangoMes(...hoyISO().split('-').slice(0, 2).map(Number))
  const cobradoMes = cxc.reduce((s, c) => s + Number(c.cobrado ?? 0), 0)

  const filtradasP = filtro ? cxp.filter(c => c.estado === filtro) : cxp
  const filtradasC = filtro ? cxc.filter(c => c.estado === filtro) : cxc
  const cuenta = (l, e) => l.filter(c => c.estado === e).length

  if (pagar.noDisponible) return <div className="pagina"><PageHeader titulo="Cuentas por pagar y por cobrar" /><VistaNoDisponible nombre="prp_cuentas_pagar" /></div>

  const colsP = [
    { key: 'folio_factura', label: 'Folio', render: c => c.folio_factura ?? '—' },
    { key: 'proveedor_nombre', label: 'Proveedor', filtro: true },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'concepto', label: 'Concepto' },
    { key: 'fecha_emision', label: 'Emisión', render: c => fecha(c.fecha_emision) },
    { key: 'fecha_vencimiento', label: 'Vence', render: c => fecha(c.fecha_vencimiento) },
    { key: 'importe', label: 'Importe', align: 'right', render: c => moneda(c.importe), valor: c => Number(c.importe) },
    { key: 'pagado', label: 'Pagado', align: 'right', render: c => moneda(c.pagado), valor: c => Number(c.pagado) },
    { key: 'saldo', label: 'Saldo', align: 'right', render: c => <b>{moneda(c.saldo)}</b>, valor: c => Number(c.saldo) },
    { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} label={ETQ[c.estado]} />, valor: c => ETQ[c.estado] },
    { key: 'acc', label: '', sortable: false, exportar: false, render: c => puedeEditar && !['pagada', 'cancelada'].includes(c.estado) && (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn sm" onClick={() => setPago(c)}><Wallet size={11} style={{ verticalAlign: -1 }} /> Registrar pago</button>
        {!c.gasto_id && <button type="button" className="btn o sm" onClick={() => setLigar(c)}><Link2 size={11} style={{ verticalAlign: -1 }} /> Ligar a gasto</button>}
        {Number(c.pagado) === 0 && <button type="button" className="btn o sm" onClick={() => setCancelar({ tipo: 'pagar', c })}><Ban size={11} style={{ verticalAlign: -1 }} /> Cancelar</button>}
      </div>) },
  ]
  const colsC = [
    { key: 'paciente', label: 'Paciente', render: c => nombrePac(c.paciente_id), valor: c => nombrePac(c.paciente_id) },
    { key: 'concepto', label: 'Concepto' },
    { key: 'origen_tipo', label: 'Origen', render: c => ORIGEN[c.origen_tipo] ?? c.origen_tipo, valor: c => ORIGEN[c.origen_tipo], filtro: true },
    { key: 'sede_nombre', label: 'Sede', filtro: true },
    { key: 'importe', label: 'Importe', align: 'right', render: c => moneda(c.importe), valor: c => Number(c.importe) },
    { key: 'cobrado', label: 'Cobrado', align: 'right', render: c => moneda(c.cobrado), valor: c => Number(c.cobrado) },
    { key: 'saldo', label: 'Saldo', align: 'right', render: c => <b>{moneda(c.saldo)}</b>, valor: c => Number(c.saldo) },
    { key: 'dias_antiguedad', label: 'Días', align: 'right' },
    { key: 'estado', label: 'Estado', render: c => <StatusBadge estado={c.estado} label={ETQ[c.estado]} />, valor: c => ETQ[c.estado] },
    { key: 'acc', label: '', sortable: false, exportar: false, render: c => puedeEditar && !['cobrada', 'cancelada'].includes(c.estado) && (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm" onClick={() => setAplicar(c)}>Aplicar cobro</button>
        {Number(c.cobrado) === 0 && <button type="button" className="btn o sm" onClick={() => setCancelar({ tipo: 'cobrar', c })}>Cancelar</button>}
      </div>) },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Cuentas por pagar y por cobrar" subtitulo={`Proveedores y saldos de pacientes · corte al ${fecha(hoyISO())}`}
        acciones={puedeEditar && <button type="button" className="btn" onClick={() => (tab === 'cobrar' ? setNuevaCxC(true) : setNuevaCxP(true))}><Plus size={14} style={{ verticalAlign: -3 }} /> Registrar cuenta</button>} />

      <div className="grid-kpis">
        <KPICard title="Por pagar total" value={moneda(abiertasP.reduce((s, c) => s + Number(c.saldo), 0))} subtitle={`${abiertasP.length} facturas`} color="var(--red)" loading={pagar.cargando} />
        <KPICard title="Por vencer / vencidas" value={moneda(semana.reduce((s, c) => s + Number(c.saldo), 0))} subtitle={`${semana.length} facturas`} color="var(--gold)" loading={pagar.cargando} ayuda="Vencen en la ventana de «por vencer» (7 días) o ya vencieron." />
        <KPICard title="Por cobrar total" value={moneda(abiertasC.reduce((s, c) => s + Number(c.saldo), 0))} subtitle={`${new Set(abiertasC.map(c => c.paciente_id)).size} pacientes`} color="var(--accent)" loading={cobrar.cargando} />
        <KPICard title="Cobrado de saldos" value={moneda(cobradoMes)} subtitle="Aplicado a cuentas vigentes" color="var(--green)" loading={cobrar.cargando} />
      </div>

      <Tabs value={tab} onChange={t => { setTab(t); setFiltro('') }} items={[
        { id: 'pagar', label: 'Por pagar (proveedores)', badge: abiertasP.length }, { id: 'cobrar', label: 'Por cobrar (pacientes)', badge: abiertasC.length },
        { id: 'antiguedad', label: 'Antigüedad de saldos' }, { id: 'pagos', label: 'Pagos a proveedores' }]} />
      <div style={{ marginTop: 10 }}>
        {tab === 'pagar' && (<>
          <div style={{ marginBottom: 8 }}><Chips valor={filtro} onChange={setFiltro} opciones={[{ value: '', label: 'Todas', n: cxp.length }, ...['programada', 'por_vencer', 'vencida', 'parcial', 'pagada'].map(e => ({ value: e, label: ETQ[e], n: cuenta(cxp, e) }))]} /></div>
          <DataTable columnas={colsP} filas={filtradasP} cargando={pagar.cargando} error={pagar.error} exportarNombre="cuentas_por_pagar" placeholderBusqueda="Buscar folio, proveedor o concepto…"
            vacio={{ title: 'Sin cuentas por pagar', description: 'Nacen solas al recibir una compra con factura, o regístralas a mano.' }} />
        </>)}
        {tab === 'cobrar' && (<>
          <div style={{ marginBottom: 8 }}><Chips valor={filtro} onChange={setFiltro} opciones={[{ value: '', label: 'Todas', n: cxc.length }, ...['reciente', 'pendiente', 'parcial', 'en_mora', 'cobrada'].map(e => ({ value: e, label: ETQ[e], n: cuenta(cxc, e) }))]} /></div>
          <DataTable columnas={colsC} filas={filtradasC} cargando={cobrar.cargando} error={cobrar.error} exportarNombre="cuentas_por_cobrar" placeholderBusqueda="Buscar paciente o concepto…"
            vacio={{ title: 'Sin cuentas por cobrar', description: 'Aquí aparecen planes, apartados y citas sin cobro con saldo.' }} />
        </>)}
        {tab === 'antiguedad' && (
          <DataTable columnas={[
            { key: 'proveedor_nombre', label: 'Proveedor' },
            ...[['r_0_30', '0–30 días'], ['r_31_60', '31–60 días'], ['r_61_90', '61–90 días'], ['r_mas_90', '+90 días'], ['saldo_total', 'Saldo total']].map(([k, l]) => ({ key: k, label: l, align: 'right', render: r => moneda(r[k] ?? 0), valor: r => Number(r[k] ?? 0) })),
          ]} filas={antig.filas} cargando={antig.cargando} error={antig.error} exportarNombre="antiguedad_saldos" vacio={{ title: 'Sin saldos pendientes', description: 'No hay saldos por pagar.' }} />
        )}
        {tab === 'pagos' && (
          <DataTable columnas={[
            { key: 'fecha', label: 'Fecha', render: p => fecha(p.fecha) }, { key: 'proveedor_nombre', label: 'Proveedor', filtro: true }, { key: 'folio_factura', label: 'Folio' },
            { key: 'forma_pago', label: 'Forma', filtro: true }, { key: 'referencia', label: 'Referencia' }, { key: 'monto', label: 'Monto', align: 'right', render: p => moneda(p.monto), valor: p => Number(p.monto) },
            { key: 'conciliado', label: 'Conciliado', render: p => <StatusBadge estado={p.conciliado ? 'conciliado' : 'pendiente'} label={p.conciliado ? 'Sí' : 'No'} />, valor: p => (p.conciliado ? 'Sí' : 'No') },
          ]} filas={pagos.filas} cargando={pagos.cargando} error={pagos.error} exportarNombre="pagos_proveedor" vacio={{ title: 'Sin pagos', description: 'Aún no se han registrado pagos a proveedores.' }} />
        )}
      </div>

      <NuevaCxP abierto={nuevaCxP} sedes={sedes} sedeActivaId={sedeActivaId} onClose={() => setNuevaCxP(false)} onListo={() => { setNuevaCxP(false); refrescar() }} />
      <NuevaCxC abierto={nuevaCxC} sedes={sedes} sedeActivaId={sedeActivaId} pacientes={qPac.data ?? []} onClose={() => setNuevaCxC(false)} onListo={() => { setNuevaCxC(false); refrescar() }} />
      <PagoModal cuenta={pago} onClose={() => setPago(null)} onListo={() => { setPago(null); refrescar() }} />
      <LigarModal cuenta={ligar} onClose={() => setLigar(null)} onListo={() => { setLigar(null); refrescar() }} />
      <AplicarModal cuenta={aplicar} nombre={aplicar ? nombrePac(aplicar.paciente_id) : ''} onClose={() => setAplicar(null)} onListo={() => { setAplicar(null); refrescar() }} />
      <ConfirmDialog open={!!cancelar} titulo="Cancelar cuenta" pedirMotivo peligro textoConfirmar="Cancelar cuenta" onCancel={() => setCancelar(null)}
        mensaje="La cuenta no se borra: queda como cancelada con el motivo en bitácora. Solo se puede cancelar si no tiene pagos ni cobros."
        onConfirm={async motivo => {
          const tabla = cancelar.tipo === 'pagar' ? 'cuentas_por_pagar' : 'cuentas_por_cobrar'
          const { error } = await actualizar(tabla, cancelar.c.id, { estado: 'cancelada', cancelada_motivo: motivo })
          setCancelar(null)
          if (error) return toast.error(mensajeError(error))
          toast.success('Cuenta cancelada.'); refrescar()
        }} />
    </div>
  )
}

function NuevaCxP({ abierto, sedes, sedeActivaId, onClose, onListo }) {
  const [f, setF] = useState({})
  const [guardando, setGuardando] = useState(false)
  const qProv = useQuery({ queryKey: ['finanzas', 'proveedores'], enabled: abierto, queryFn: async () => (await leer('prp_proveedores', { sedeCol: false, filtros: { activo: true }, orden: [{ columna: 'nombre' }], limite: 1000 })).data })
  useEffect(() => { if (abierto) setF({ sede_id: sedeActivaId ?? sedes[0]?.id ?? '', fecha_emision: hoyISO(), fecha_vencimiento: hoyISO(), iva: 0 }) }, [abierto, sedeActivaId, sedes])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const errores = []
  if (!f.proveedor_id) errores.push('Elige el proveedor.')
  if (!f.sede_id) errores.push('Elige la sede.')
  if (!f.concepto?.trim()) errores.push('Escribe el concepto.')
  if (!(Number(f.importe) > 0)) errores.push('El importe debe ser mayor a cero.')
  if (Number(f.iva) > Number(f.importe)) errores.push('El IVA no puede exceder el importe.')
  if (f.fecha_vencimiento < f.fecha_emision) errores.push('El vencimiento no puede ser anterior a la emisión.')
  async function guardar() {
    setGuardando(true)
    try {
      const { error } = await insertar('cuentas_por_pagar', { sede_id: f.sede_id, proveedor_id: f.proveedor_id, folio_factura: f.folio_factura || null, concepto: f.concepto.trim(), fecha_emision: f.fecha_emision, fecha_vencimiento: f.fecha_vencimiento, importe: Number(f.importe), iva: Number(f.iva || 0), cfdi_uuid: f.cfdi_uuid || null })
      if (error) throw error
      toast.success('Cuenta por pagar registrada.'); onListo()
    } catch (e) { toast.error(mensajeError(e)) } finally { setGuardando(false) }
  }
  return (
    <Modal open={abierto} onClose={onClose} title="Registrar cuenta por pagar" footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={errores.length > 0 || guardando} onClick={guardar}>Guardar</button></>}>
      <div className="grid2">
        <FormField label="Proveedor" required as="select" value={f.proveedor_id ?? ''} onChange={e => set('proveedor_id', e.target.value)} options={(qProv.data ?? []).map(p => ({ value: p.id, label: p.nombre }))} />
        <FormField label="Sede" required as="select" value={f.sede_id ?? ''} onChange={e => set('sede_id', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Folio de factura" value={f.folio_factura ?? ''} onChange={e => set('folio_factura', e.target.value)} />
        <FormField label="UUID CFDI" value={f.cfdi_uuid ?? ''} onChange={e => set('cfdi_uuid', e.target.value)} />
        <FormField label="Concepto" required value={f.concepto ?? ''} onChange={e => set('concepto', e.target.value)} />
        <FormField label="Importe (con IVA)" required type="number" step="0.01" value={f.importe ?? ''} onChange={e => set('importe', e.target.value)} />
        <FormField label="IVA" type="number" step="0.01" value={f.iva ?? ''} onChange={e => set('iva', e.target.value)} />
        <FormField label="Emisión" required type="date" value={f.fecha_emision ?? ''} onChange={e => set('fecha_emision', e.target.value)} />
        <FormField label="Vencimiento" required type="date" value={f.fecha_vencimiento ?? ''} onChange={e => set('fecha_vencimiento', e.target.value)} />
      </div>
      {errores.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Falta: {errores.join(' ')}</div>}
    </Modal>
  )
}

function NuevaCxC({ abierto, sedes, sedeActivaId, pacientes, onClose, onListo }) {
  const [f, setF] = useState({})
  const [busq, setBusq] = useState('')
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (abierto) { setF({ sede_id: sedeActivaId ?? sedes[0]?.id ?? '', origen_tipo: 'otro', clasificacion: 'servicio', fecha_emision: hoyISO() }); setBusq('') } }, [abierto, sedeActivaId, sedes])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const lista = busq.trim().length >= 2 ? pacientes.filter(p => p.nombre_completo?.toLowerCase().includes(busq.toLowerCase())).slice(0, 30) : []
  const valido = f.paciente_id && f.sede_id && f.concepto?.trim() && Number(f.importe) > 0
  async function guardar() {
    setGuardando(true)
    try {
      const { error } = await insertar('cuentas_por_cobrar', { sede_id: f.sede_id, paciente_id: f.paciente_id, origen_tipo: f.origen_tipo, concepto: f.concepto.trim(), clasificacion: f.clasificacion, importe: Number(f.importe), fecha_emision: f.fecha_emision, fecha_limite: f.fecha_limite || null })
      if (error) throw error
      toast.success('Cuenta por cobrar registrada.'); onListo()
    } catch (e) { toast.error(mensajeError(e)) } finally { setGuardando(false) }
  }
  return (
    <Modal open={abierto} onClose={onClose} title="Registrar cuenta por cobrar" footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!valido || guardando} onClick={guardar}>Guardar</button></>}>
      <FormField label="Paciente" required hint={f.paciente_id ? `Seleccionado: ${pacientes.find(p => p.id === f.paciente_id)?.nombre_completo}` : 'Escribe al menos 2 letras'}>
        <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar paciente…" />
      </FormField>
      {lista.length > 0 && <div style={{ maxHeight: 130, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>{lista.map(p => <div key={p.id} style={{ padding: '6px 10px', cursor: 'pointer', background: f.paciente_id === p.id ? 'var(--accent-light)' : undefined }} onClick={() => { set('paciente_id', p.id); setBusq('') }}>{p.nombre_completo}</div>)}</div>}
      <div className="grid2">
        <FormField label="Sede" required as="select" value={f.sede_id ?? ''} onChange={e => set('sede_id', e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Origen" as="select" value={f.origen_tipo} onChange={e => set('origen_tipo', e.target.value)} options={Object.entries(ORIGEN).map(([v, l]) => ({ value: v, label: l }))} />
        <FormField label="Concepto" required value={f.concepto ?? ''} onChange={e => set('concepto', e.target.value)} />
        <FormField label="Clasificación" as="select" value={f.clasificacion} onChange={e => set('clasificacion', e.target.value)} options={['servicio', 'producto', 'anticipo', 'plan'].map(v => ({ value: v, label: v }))} />
        <FormField label="Importe" required type="number" step="0.01" value={f.importe ?? ''} onChange={e => set('importe', e.target.value)} />
        <FormField label="Fecha límite" type="date" value={f.fecha_limite ?? ''} onChange={e => set('fecha_limite', e.target.value)} />
      </div>
    </Modal>
  )
}

function PagoModal({ cuenta, onClose, onListo }) {
  const [f, setF] = useState({})
  const [guardando, setGuardando] = useState(false)
  const qCta = useQuery({ queryKey: ['finanzas', 'cuentas-bancarias-pago'], enabled: !!cuenta, queryFn: async () => (await leer('prp_cuentas_bancarias', { sedeCol: false, filtros: { activa: true } })).data })
  useEffect(() => { if (cuenta) setF({ monto: Number(cuenta.saldo), forma: 'Transferencia', fecha: hoyISO(), cuenta_bancaria_id: '', referencia: '' }) }, [cuenta])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const saldo = Number(cuenta?.saldo ?? 0)
  const errores = []
  if (!(Number(f.monto) > 0)) errores.push('El monto debe ser mayor a cero.')
  if (Number(f.monto) > saldo + 0.01) errores.push(`El pago no puede exceder el saldo (${moneda(saldo)}).`)
  if (f.forma !== 'Efectivo' && !f.cuenta_bancaria_id) errores.push('Elige la cuenta bancaria desde la que se paga.')
  async function guardar() {
    setGuardando(true)
    const { error } = await rpc('pagar_proveedor', { p_cuenta: cuenta.id, p_monto: Number(f.monto), p_forma: f.forma, p_cuenta_bancaria: f.cuenta_bancaria_id || null, p_referencia: f.referencia || null, p_fecha: f.fecha })
    setGuardando(false)
    if (error) return toast.error(mensajeError(error))
    toast.success('Pago registrado; se generó el gasto (base caja).'); onListo()
  }
  return (
    <Modal open={!!cuenta} onClose={onClose} size="sm" title={`Registrar pago · ${cuenta?.proveedor_nombre ?? ''}`} footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={errores.length > 0 || guardando} onClick={guardar}>{guardando ? 'Registrando…' : 'Registrar pago'}</button></>}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>Folio {cuenta?.folio_factura ?? '—'} · saldo <b>{moneda(saldo)}</b>. Solo Administración autoriza pagos (P-096).</div>
      <FormField label="Monto" required type="number" step="0.01" value={f.monto ?? ''} onChange={e => set('monto', e.target.value)} />
      <FormField label="Forma de pago" as="select" value={f.forma ?? ''} onChange={e => set('forma', e.target.value)} options={FORMAS_PAGO.map(x => ({ value: x, label: x }))} />
      <FormField label="Cuenta bancaria" required={f.forma !== 'Efectivo'} as="select" value={f.cuenta_bancaria_id ?? ''} onChange={e => set('cuenta_bancaria_id', e.target.value)} options={(qCta.data ?? []).map(c => ({ value: c.id, label: c.etiqueta }))} />
      <FormField label="Referencia" value={f.referencia ?? ''} onChange={e => set('referencia', e.target.value)} />
      <FormField label="Fecha" type="date" value={f.fecha ?? ''} onChange={e => set('fecha', e.target.value)} />
      {errores.length > 0 && <div style={{ fontSize: 12, color: 'var(--red)' }}>{errores.join(' ')}</div>}
    </Modal>
  )
}

function LigarModal({ cuenta, onClose, onListo }) {
  const [gastoId, setGastoId] = useState('')
  const q = useQuery({ queryKey: ['finanzas', 'ligar-gastos', cuenta?.id], enabled: !!cuenta, queryFn: async () => (await leer('prp_gastos', { sedeId: cuenta.sede_id, filtros: { estado: 'guardado', proveedor_id: cuenta.proveedor_id }, orden: [{ columna: 'fecha', asc: false }], limite: 60 })).data })
  useEffect(() => setGastoId(''), [cuenta])
  async function guardar() {
    const { error } = await actualizar('cuentas_por_pagar', cuenta.id, { gasto_id: gastoId })
    if (error) return toast.error(mensajeError(error))
    toast.success('Cuenta ligada al gasto.'); onListo()
  }
  return (
    <Modal open={!!cuenta} onClose={onClose} title="Ligar cuenta a un gasto" size="sm" footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!gastoId} onClick={guardar}>Ligar</button></>}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Gastos guardados del mismo proveedor y sede. Evita duplicar el gasto cuando la factura ya se capturó.</div>
      <FormField label="Gasto" as="select" value={gastoId} onChange={e => setGastoId(e.target.value)} options={(q.data ?? []).map(g => ({ value: g.id, label: `${fecha(g.fecha)} · ${g.descripcion ?? g.grupo_nombre} · ${moneda(g.total)}` }))} />
    </Modal>
  )
}

// Aplicar un cobro (ingreso) a una cuenta por cobrar: nunca excede el ingreso ni el saldo (clon de IRP aplicaciones_pago)
function AplicarModal({ cuenta, nombre, onClose, onListo }) {
  const [ingresoId, setIngresoId] = useState('')
  const [monto, setMonto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const q = useQuery({ queryKey: ['finanzas', 'ingresos-paciente', cuenta?.paciente_id], enabled: !!cuenta, queryFn: async () => (await leer('prp_ingresos', { sedeId: cuenta.sede_id, filtros: { paciente_id: cuenta.paciente_id, es_reembolso: false }, orden: [{ columna: 'fecha_pago', asc: false }], limite: 100 })).data })
  const libres = (q.data ?? []).filter(i => Number(i.importe) - Number(i.aplicado) > 0.009)
  const ing = libres.find(i => i.id === ingresoId)
  const disponible = ing ? Number(ing.importe) - Number(ing.aplicado) : 0
  const saldo = Number(cuenta?.saldo ?? 0)
  useEffect(() => { setIngresoId(''); setMonto('') }, [cuenta])
  useEffect(() => { if (ing) setMonto(String(Math.min(disponible, saldo))) }, [ingresoId]) // eslint-disable-line
  const val = ing ? validarAplicaciones({ importe: disponible, paciente_id: cuenta.paciente_id }, [{ cuenta_id: cuenta.id, importe_aplicado: Number(monto) }], { [cuenta.id]: { importe: Number(cuenta.importe), cobrado: Number(cuenta.cobrado), estado: cuenta.estado_registro, paciente_id: cuenta.paciente_id } }) : { ok: false, errores: [] }
  async function guardar() {
    setGuardando(true)
    const { error } = await insertar('aplicaciones_cobro', { sede_id: cuenta.sede_id, ingreso_id: ingresoId, cuenta_id: cuenta.id, importe_aplicado: Number(monto) })
    setGuardando(false)
    if (error) return toast.error(mensajeError(error))
    toast.success('Cobro aplicado a la cuenta.'); onListo()
  }
  return (
    <Modal open={!!cuenta} onClose={onClose} title={`Aplicar cobro · ${nombre}`} size="sm" footer={<><button type="button" className="btn o" onClick={onClose}>Cancelar</button><button type="button" className="btn" disabled={!val.ok || guardando} onClick={guardar}>{guardando ? 'Aplicando…' : 'Aplicar'}</button></>}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>{cuenta?.concepto} · saldo <b>{moneda(saldo)}</b></div>
      <FormField label="Cobro del paciente (con saldo sin aplicar)" required as="select" value={ingresoId} onChange={e => setIngresoId(e.target.value)}
        options={libres.map(i => ({ value: i.id, label: `${fecha(i.fecha_pago)} · ${i.forma_pago} · libre ${moneda(Number(i.importe) - Number(i.aplicado))}` }))} />
      {!q.isLoading && !libres.length && <div style={{ fontSize: 12, color: 'var(--muted)' }}>El paciente no tiene cobros con saldo sin aplicar. Registra el cobro en Ingresos.</div>}
      <FormField label="Importe a aplicar" required type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} hint={ing ? `Máximo ${moneda(Math.min(disponible, saldo))}` : undefined} />
      {val.errores.length > 0 && <div style={{ fontSize: 12, color: 'var(--red)' }}>{val.errores.join(' ')}</div>}
    </Modal>
  )
}
