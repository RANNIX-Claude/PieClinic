// Facturación CFDI 4.0 (mockup 18). PAC SIMULADO: el timbrado no tiene validez fiscal (adaptador src/lib/adaptadores/pac.js).
// Lee prp_facturacion_pendiente, prp_facturas, prp_notas_credito y cfdi_receptores. Escribe por RPC (crear_factura_desde_venta,
// timbrar_factura_simulado, emitir_nota_credito, generar_factura_global_borrador) y cfdi_cancelaciones.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Printer } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { actualizar, borrar, insertar, leer, leerUno, rpc } from '../../lib/api'
import { fecha, fechaHora, moneda } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { conceptosCfdi, validarRfc, RFC_PUBLICO, REGIMENES, USOS_CFDI, FORMAS_PAGO_SAT, MOTIVOS_CANCELACION } from '../../lib/comercial/fiscal'
import { suma } from '../../lib/comercial/dinero'
import { timbrar, modoPac, PAC_AVISO, ESTADOS_CANCELACION } from '../../lib/adaptadores/pac'
import { imprimirHtml } from './componentes/ticket'
import { useLeer, AvisoError, BannerSimulado, ejecutar, textoError } from './componentes/comun'

const FORMAS = [['01', '01 Efectivo'], ['03', '03 Transferencia'], ['04', '04 Tarjeta de crédito'], ['28', '28 Tarjeta de débito'], ['99', '99 Por definir']]
const mes1 = () => { const d = new Date(); d.setUTCDate(1); return d.toISOString().slice(0, 10) }
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

export default function Facturacion() {
  const { sedes, sedeActivaId, sedeActiva, rol, organizacion } = useApp()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const puedeTimbrar = usePermiso('facturas.timbrar')
  const puedeCancelar = usePermiso('facturas.cancelar')
  const esAdmin = rol === 'administrador'
  const [tab, setTab] = useState('pendientes')
  const [ventaFactura, setVentaFactura] = useState(sp.get('venta'))
  const [cancelar, setCancelar] = useState(null)
  const [nota, setNota] = useState(null)
  const [borrarF, setBorrarF] = useState(null)
  const [modo, setModo] = useState({ modo: 'simulado' })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['comercial'] })
  useEffect(() => { modoPac().then(setModo) }, [])

  const pend = useLeer('fact-pend', 'prp_facturacion_pendiente', { orden: { columna: 'cobrada_en', asc: false }, limite: 300 })
  const facts = useLeer('facturas', 'prp_facturas', { orden: { columna: 'created_at', asc: false }, limite: 500 })
  const notas = useLeer('notas', 'prp_notas_credito', { orden: { columna: 'created_at', asc: false }, limite: 200 })
  const recs = useLeer('receptores', 'cfdi_receptores', { sedeCol: false, filtros: { activo: true }, orden: { columna: 'razon_social' }, limite: 500 })

  const vigentes = facts.filas.filter(f => ['vigente', 'cancelacion_en_proceso', 'borrador'].includes(f.estado))
  const timbradas = facts.filas.filter(f => f.estado === 'vigente')
  const canceladas = facts.filas.filter(f => f.estado === 'cancelada')

  const timbrarBorrador = async f => {
    const r = await timbrar(f.id)
    if (!r.ok) return toast.error(textoError({ message: r.error }))
    toast.success('Timbrada (SIMULADO: sin validez fiscal)'); refrescar()
  }
  const imprimirFactura = async f => {
    const { data: cs } = await leer('factura_conceptos', { sedeCol: false, filtros: { factura_id: f.id } })
    const filas = cs.map(c => `<tr><td>${esc(c.clave_sat)}</td><td>${esc(c.descripcion)}</td><td>${c.cantidad}</td><td style="text-align:right">${moneda(c.valor_unitario)}</td><td>${c.iva_tipo === 'exento' ? 'Exento' : c.iva_tipo + ' %'}</td><td style="text-align:right">${moneda(c.importe)}</td></tr>`).join('')
    imprimirHtml(`<!doctype html><html><head><meta charset="utf-8"><title>CFDI</title><style>body{font:12px Arial;margin:24px;position:relative}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:4px;text-align:left}.m{position:fixed;top:40%;left:5%;font-size:64px;color:rgba(200,0,0,.18);transform:rotate(-20deg);font-weight:700}</style></head><body>
      <div class="m">SIMULADO · SIN VALIDEZ FISCAL</div><h2>Representación impresa de CFDI 4.0 (${f.tipo_comprobante === 'E' ? 'Egreso' : 'Ingreso'})</h2>
      <p><b>Serie y folio:</b> ${esc(f.serie ?? '')}${f.folio ?? ''} · <b>UUID:</b> ${esc(f.uuid ?? 'borrador')} · <b>Emisión:</b> ${esc(fechaHora(f.fecha_emision ?? f.created_at))}</p>
      <p><b>Emisor:</b> ${esc(f.emisor_razon_social ?? organizacion?.nombre ?? '')} ${esc(f.emisor_rfc ?? '')}<br><b>Receptor:</b> ${esc(f.receptor_razon_social)} · ${esc(f.receptor_rfc)} · CP ${esc(f.receptor_cp)} · Régimen ${esc(f.receptor_regimen)} · Uso ${esc(f.uso_cfdi)}</p>
      <table><tr><th>Clave SAT</th><th>Descripción</th><th>Cant.</th><th>V. unitario</th><th>IVA</th><th>Importe</th></tr>${filas}</table>
      <p style="text-align:right">Subtotal ${moneda(f.subtotal)} · Descuento ${moneda(f.descuento)} · IVA trasladado ${moneda(f.iva_trasladado)} (base ${moneda(f.iva_trasladado_base)}) · IVA exento base ${moneda(f.iva_exento_base)}<br><b>Total ${moneda(f.total)}</b> · ${esc(f.moneda)} · ${esc(f.metodo_pago)} · forma ${esc(f.forma_pago)}</p></body></html>`)
  }
  const eliminar = async f => { setBorrarF(null); if (await ejecutar(borrar('facturas', f.id), 'Borrador eliminado')) refrescar() }
  const global = async () => {
    if (!sedeActivaId) return toast.error('Elige una sede para generar la factura global')
    const { error } = await rpc('generar_factura_global_borrador', { p_sede: sedeActivaId, p_mes: mes1() })
    if (error) toast.error(textoError(error)); else { toast.success('Factura global en borrador: revísala con el contador antes de timbrar'); refrescar() }
  }

  const colFact = [
    { key: 'folio', label: 'Folio', render: f => (f.folio ? `${f.serie ?? ''}-${String(f.folio).padStart(6, '0')}` : '—'), valor: f => f.folio ?? 0 },
    { key: 'created_at', label: 'Fecha', render: f => fecha(f.fecha_emision ?? f.created_at), valor: f => f.fecha_emision ?? f.created_at },
    { key: 'receptor', label: 'Cliente (RFC)', render: f => `${f.receptor_razon_social} (${f.receptor_rfc})`, valor: f => f.receptor_razon_social },
    { key: 'uuid', label: 'UUID', render: f => (f.uuid ? `${f.uuid.slice(0, 4)}…${f.uuid.slice(-4)}` : '—') },
    { key: 'total', label: 'Total', align: 'right', render: f => moneda(f.total), valor: f => Number(f.total) },
    { key: 'estado', label: 'Estatus', render: f => <div><StatusBadge estado={f.estado} variante={f.estado === 'cancelacion_en_proceso' ? 'a' : undefined} label={f.estado === 'cancelacion_en_proceso' ? 'Cancelación en proceso' : undefined} />{f.sintetico || f.pac_modo === 'simulado' ? <span className="bd a" style={{ marginLeft: 4 }}>Simulado</span> : null}</div>, filtro: true, valor: f => f.estado },
    { key: 'acc', label: 'Acciones', sortable: false, exportar: false, render: f => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {f.estado === 'borrador' && puedeTimbrar && <button className="btn" onClick={() => timbrarBorrador(f)}>Timbrar</button>}
        {f.estado === 'borrador' && puedeTimbrar && <button className="btn o" onClick={() => setBorrarF(f)}>Eliminar</button>}
        {f.estado !== 'borrador' && <button className="btn o" onClick={() => imprimirFactura(f)}><Printer size={12} /> PDF</button>}
        {f.estado === 'vigente' && puedeCancelar && <button className="btn o" onClick={() => setCancelar(f)}>Cancelar</button>}
        {f.estado === 'vigente' && esAdmin && f.tipo_comprobante === 'I' && <button className="btn o" onClick={() => setNota(f)}>Nota de crédito</button>}
        {f.estado === 'cancelacion_en_proceso' && <span className="text-muted" style={{ fontSize: 12 }}>Esperando aceptación del receptor</span>}
        {Number(f.notas_credito) > 0 && <span className="bd b">{f.notas_credito} NC · {moneda(f.notas_credito_importe)}</span>}
      </div>) },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Facturación · CFDI 4.0" subtitulo="Timbrado integrado al cobro · datos fiscales del cliente guardados en su ficha"
        acciones={<>{puedeTimbrar && <button className="btn" onClick={() => setVentaFactura('nueva')}><Plus size={14} /> Nueva factura</button>}{esAdmin && <button className="btn o" onClick={global}>Factura global del mes (borrador)</button>}</>} />
      <BannerSimulado texto={`${PAC_AVISO}${modo.modo !== 'simulado' ? ` (modo configurado: ${modo.modo})` : ''}`} />
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Tickets por facturar" value={pend.filas.length} subtitle={`${moneda(suma(pend.filas.map(p => p.total)))} pendientes`} color="var(--gold)" loading={pend.cargando} />
        <KPICard title="Timbradas" value={timbradas.length} subtitle={moneda(suma(timbradas.map(f => f.total)))} color="var(--green)" loading={facts.cargando} />
        <KPICard title="Canceladas" value={canceladas.length} subtitle={moneda(suma(canceladas.map(f => f.total)))} color="var(--red)" loading={facts.cargando} />
        <KPICard title="Notas de crédito" value={notas.filas.filter(n => n.estado === 'emitida').length} subtitle={moneda(suma(notas.filas.filter(n => n.estado === 'emitida').map(n => n.importe)))} loading={notas.cargando} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'pendientes', label: 'Por facturar', badge: pend.filas.length || undefined }, { id: 'timbradas', label: 'Timbradas' }, { id: 'canceladas', label: 'Canceladas' }, { id: 'notas', label: 'Notas de crédito' },
        { id: 'receptores', label: 'Datos fiscales de clientes' }, { id: 'config', label: 'Configuración fiscal', oculto: !esAdmin }]} />
      <div className="card" style={{ padding: 0, marginTop: 10 }}>
        {tab === 'pendientes' && (<><AvisoError error={pend.error} /><DataTable cargando={pend.cargando} filas={pend.filas} exportarNombre="por-facturar" vacio={{ title: 'Nada por facturar', description: 'Los tickets cobrados con «requiere factura» aparecen aquí. Se factura dentro del mismo mes calendario.' }}
          columnas={[
            { key: 'folio', label: 'Ticket' }, { key: 'cobrada_en', label: 'Cobrado', render: p => fechaHora(p.cobrada_en), valor: p => p.cobrada_en }, { key: 'paciente_nombre', label: 'Paciente', render: p => p.paciente_nombre ?? 'Mostrador' },
            { key: 'sede_nombre', label: 'Sede', filtro: true }, { key: 'total', label: 'Total', align: 'right', render: p => moneda(p.total), valor: p => Number(p.total) },
            { key: 'dias', label: 'Plazo', render: p => <span className={p.dias_para_vencer_plazo <= 3 ? 'text-red' : ''}>{p.dias_para_vencer_plazo} días</span>, valor: p => p.dias_para_vencer_plazo },
            { key: 'acc', label: '', sortable: false, exportar: false, render: p => puedeTimbrar && <button className="btn" onClick={() => setVentaFactura(p.venta_id)}>Facturar</button> }]} /></>)}
        {tab === 'timbradas' && (<><AvisoError error={facts.error} /><DataTable cargando={facts.cargando} filas={vigentes} columnas={colFact} exportarNombre="facturas" vacio={{ title: 'Sin facturas', description: 'Aún no hay CFDI emitidos ni borradores.' }} /></>)}
        {tab === 'canceladas' && <DataTable cargando={facts.cargando} filas={canceladas} columnas={colFact.slice(0, 6)} exportarNombre="facturas-canceladas" vacio={{ title: 'Sin cancelaciones' }} />}
        {tab === 'notas' && (<><AvisoError error={notas.error} /><DataTable cargando={notas.cargando} filas={notas.filas} exportarNombre="notas-credito" vacio={{ title: 'Sin notas de crédito', description: 'Las emite solo el Administrador, relacionadas al CFDI original.' }}
          columnas={[{ key: 'folio', label: 'Folio' }, { key: 'created_at', label: 'Fecha', render: n => fecha(n.created_at) }, { key: 'factura', label: 'Factura origen', render: n => `${n.factura_serie ?? ''}-${n.factura_folio ?? ''}`, valor: n => n.factura_folio }, { key: 'receptor_razon_social', label: 'Cliente' },
            { key: 'tipo', label: 'Tipo', filtro: true }, { key: 'concepto', label: 'Concepto' }, { key: 'importe', label: 'Importe', align: 'right', render: n => moneda(n.importe), valor: n => Number(n.importe) },
            { key: 'devolver_dinero', label: 'Dinero', render: n => (n.devolver_dinero ? 'Sale de caja' : '—') }, { key: 'estado', label: 'Estado', render: n => <StatusBadge estado={n.estado} />, filtro: true }]} /></>)}
        {tab === 'receptores' && <Receptores recs={recs} onCambio={refrescar} puede={puedeTimbrar} />}
        {tab === 'config' && esAdmin && <ConfigFiscal onCambio={() => { refrescar(); modoPac().then(setModo) }} />}
      </div>

      {ventaFactura && <FormFactura ventaId={ventaFactura === 'nueva' ? null : ventaFactura} onClose={() => { setVentaFactura(null); if (sp.get('venta')) { const n = new URLSearchParams(sp); n.delete('venta'); setSp(n, { replace: true }) } }} onListo={() => { setVentaFactura(null); refrescar(); setTab('timbradas') }} />}
      {cancelar && <FormCancelacion factura={cancelar} facturas={facts.filas} onClose={() => setCancelar(null)} onListo={() => { setCancelar(null); refrescar() }} />}
      {nota && <FormNota factura={nota} onClose={() => setNota(null)} onListo={() => { setNota(null); refrescar() }} />}
      <ConfirmDialog open={!!borrarF} titulo="Eliminar borrador" peligro textoConfirmar="Eliminar" mensaje="Se elimina el borrador (no está timbrado). El ticket queda por facturar." onConfirm={() => eliminar(borrarF)} onCancel={() => setBorrarF(null)} />
    </div>
  )
}

// ── Nueva factura desde ticket ───────────────────────────────────────────────────────────────────────
function FormFactura({ ventaId, onClose, onListo }) {
  const { sedeActivaId } = useApp()
  const [vId, setVId] = useState(ventaId)
  const [venta, setVenta] = useState(null)
  const [lineas, setLineas] = useState([])
  const [pagosV, setPagosV] = useState([])
  const [receptores, setReceptores] = useState([])
  const [recId, setRecId] = useState('')
  const [r, setR] = useState({ rfc: '', razon: '', cp: '', regimen: '612', uso: 'D01', correo: '', guardar: true, publico: false })
  const [forma, setForma] = useState('99'), [metodo, setMetodo] = useState('PUE')
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const pend = useLeer('fact-pend-modal', 'prp_facturacion_pendiente', { limite: 200 }, !ventaId)
  const set = (k, v) => setR(x => ({ ...x, [k]: v }))

  useEffect(() => {
    if (!vId) return
    setCargando(true)
    ;(async () => {
      const [v, l, p] = await Promise.all([leerUno('prp_ventas', { id: vId }), leer('prp_venta_lineas', { sedeCol: false, filtros: { venta_id: vId }, orden: { columna: 'orden' } }), leer('pagos', { sedeCol: false, filtros: { venta_id: vId } })])
      setVenta(v.data); setLineas(l.data); setPagosV(p.data)
      const mayor = [...p.data].filter(x => x.metodo !== 'anticipo').sort((a, b) => b.monto - a.monto)[0]
      setForma(FORMAS_PAGO_SAT[mayor?.metodo] ?? '99')
      if (v.data?.paciente_id) {
        const rs = await leer('cfdi_receptores', { sedeCol: false, filtros: { paciente_id: v.data.paciente_id, activo: true } })
        setReceptores(rs.data); if (rs.data[0]) setRecId(rs.data[0].id)
        else {   // el paciente guardó sus datos fiscales en su ficha (datos_fiscales_paciente) pero aún no hay receptor CFDI: se precargan para que el RFC no se capture dos veces
          const df = await leer('datos_fiscales_paciente', { sedeCol: false, filtros: { paciente_id: v.data.paciente_id, activo: true }, orden: { columna: 'predeterminado', asc: false }, limite: 1 })
          const d = df.data?.[0]
          if (d) setR(x => ({ ...x, rfc: d.rfc ?? '', razon: d.razon_social ?? '', cp: d.codigo_postal_fiscal ?? '', regimen: d.regimen_fiscal ?? x.regimen, uso: d.uso_cfdi ?? x.uso, correo: d.email_factura ?? '', publico: false }))
        }
      }
      setCargando(false)
    })()
  }, [vId])
  useEffect(() => {
    const rec = receptores.find(x => x.id === recId)
    if (rec) setR(x => ({ ...x, rfc: rec.rfc, razon: rec.razon_social, cp: rec.codigo_postal, regimen: rec.regimen_fiscal, uso: rec.uso_cfdi, correo: rec.correo ?? '', publico: false }))
  }, [recId, receptores])
  useEffect(() => {
    if (r.publico) setR(x => ({ ...x, rfc: RFC_PUBLICO, razon: 'PUBLICO EN GENERAL', regimen: '616', uso: 'S01' }))
  }, [r.publico])

  const cfdi = conceptosCfdi(lineas)
  const cuadra = venta ? cfdi.total === Number(venta.total) : true
  const errores = []
  if (!vId) errores.push('Elige el ticket')
  if (venta && !['cobrada', 'por_facturar'].includes(venta.estado)) errores.push(`El ticket está ${venta.estado}`)
  if (!validarRfc(r.rfc)) errores.push('RFC inválido')
  if (!r.razon.trim()) errores.push('Falta la razón social')
  if (!/^\d{5}$/.test(r.cp)) errores.push('CP fiscal de 5 dígitos')
  if (!cuadra) errores.push('El CFDI no cuadra con el ticket')

  const crear = async timbrarYa => {
    if (errores.length) return toast.error(errores[0])
    setOcupado(true)
    try {
      let receptorId = r.publico ? null : recId || null
      if (!r.publico) {
        const datos = { rfc: r.rfc.toUpperCase(), razon_social: r.razon.trim().toUpperCase(), regimen_fiscal: r.regimen, codigo_postal: r.cp, uso_cfdi: r.uso, correo: r.correo || null }
        if (recId) { const x = await actualizar('cfdi_receptores', recId, datos); if (x.error) throw new Error(textoError(x.error)) }
        else { const x = await insertar('cfdi_receptores', { ...datos, paciente_id: venta?.paciente_id ?? null }); if (x.error) throw new Error(textoError(x.error)); receptorId = x.data[0].id }
      }
      const { data: fid, error } = await rpc('crear_factura_desde_venta', { p_venta: vId, p_receptor: receptorId, p_forma_pago: forma, p_metodo_pago: metodo })
      if (error) throw new Error(textoError(error))
      if (timbrarYa) {
        const t = await timbrar(fid)
        if (!t.ok) { toast.error(`Borrador creado, pero no se timbró: ${t.error}`); onListo(); return }
        toast.success('Timbrada (SIMULADO: sin validez fiscal)')
      } else toast.success('Borrador guardado')
      onListo()
    } catch (e) { toast.error(textoError(e)) }
    setOcupado(false)
  }

  return (
    <Modal open onClose={onClose} size="wide" title={`Nueva factura${venta ? ` · ticket ${venta.folio} · ${moneda(venta.total)}` : ''}`}
      footer={<><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn o" disabled={ocupado || errores.length > 0} onClick={() => crear(false)}>Guardar borrador</button><button className="btn" disabled={ocupado || errores.length > 0} onClick={() => crear(true)}>Timbrar y enviar (simulado)</button></>}>
      <BannerSimulado compacto texto={PAC_AVISO} />
      {!ventaId && (
        <FormField label="Ticket por facturar" as="select" value={vId ?? ''} onChange={e => setVId(e.target.value || null)} placeholder="Selecciona un ticket…"
          options={pend.filas.map(p => ({ value: p.venta_id, label: `${p.folio} · ${p.paciente_nombre ?? 'Mostrador'} · ${moneda(p.total)}` }))} />
      )}
      {cargando && <div className="text-muted">Cargando ticket…</div>}
      {venta && (
        <div className="grid2" style={{ gap: 14, alignItems: 'start' }}>
          <div>
            <h4 style={{ marginBottom: 6 }}>Receptor</h4>
            {receptores.length > 0 && <FormField label="Datos fiscales guardados" as="select" value={recId} onChange={e => setRecId(e.target.value)} placeholder="Capturar nuevos…" options={receptores.map(x => ({ value: x.id, label: `${x.rfc} · ${x.razon_social}` }))} />}
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={r.publico} onChange={e => set('publico', e.target.checked)} /> Facturar a público en general ({RFC_PUBLICO})</label>
            <div className="grid2" style={{ marginTop: 6 }}>
              <FormField label="RFC" required value={r.rfc} disabled={r.publico} onChange={e => set('rfc', e.target.value.toUpperCase())} />
              <FormField label="C.P. del domicilio fiscal" required value={r.cp} onChange={e => set('cp', e.target.value.replace(/\D/g, '').slice(0, 5))} />
            </div>
            <FormField label="Nombre o razón social (igual que la constancia)" required value={r.razon} disabled={r.publico} onChange={e => set('razon', e.target.value)} />
            <FormField label="Régimen fiscal" as="select" value={r.regimen} disabled={r.publico} onChange={e => set('regimen', e.target.value)} options={REGIMENES.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} />
            <FormField label="Uso del CFDI" as="select" value={r.uso} disabled={r.publico} onChange={e => set('uso', e.target.value)} options={USOS_CFDI.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} />
            <FormField label="Correo para envío" type="email" value={r.correo} onChange={e => set('correo', e.target.value)} />
            <div className="grid2">
              <FormField label="Forma de pago" as="select" value={forma} onChange={e => setForma(e.target.value)} options={FORMAS.map(([value, label]) => ({ value, label }))} />
              <FormField label="Método de pago" as="select" value={metodo} onChange={e => setMetodo(e.target.value)} options={[{ value: 'PUE', label: 'PUE · Pago en una sola exhibición' }, { value: 'PPD', label: 'PPD · Pago en parcialidades o diferido' }]} />
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>Los datos fiscales se guardan en la ficha del cliente para facturas futuras. Un CFDI timbrado congela los datos del receptor (P-066). El anticipo no genera CFDI automático (P-062).</div>
          </div>
          <div>
            <h4 style={{ marginBottom: 6 }}>Conceptos (calculados del ticket)</h4>
            <table style={{ fontSize: 12 }}><thead><tr><th>Clave SAT</th><th>Descripción</th><th>Cant.</th><th className="num">V. unit.</th><th>IVA</th><th className="num">Importe</th></tr></thead>
              <tbody>{cfdi.conceptos.map((c, i) => <tr key={i}><td>{c.clave_sat}</td><td>{c.descripcion}</td><td>{c.cantidad}</td><td className="num">{moneda(c.valor_unitario)}</td><td>{c.iva_tipo === 'exento' ? 'Exento' : `${c.iva_tipo} %`}</td><td className="num">{moneda(c.importe)}</td></tr>)}</tbody></table>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {[['Subtotal', cfdi.subtotal], ['Descuento', -cfdi.descuento], [`IVA trasladado 16 % (base ${moneda(cfdi.iva_trasladado_base)})`, cfdi.iva_trasladado], [`IVA exento (base ${moneda(cfdi.iva_exento_base)})`, 0]].map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span>{moneda(v)}</span></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16 }}><span>TOTAL CFDI 4.0</span><span className={cuadra ? '' : 'text-red'}>{moneda(cfdi.total)}</span></div>
              {!cuadra && <div className="text-red" style={{ fontSize: 12.5 }}>No cuadra con el ticket ({moneda(venta.total)}). Revisa las líneas.</div>}
              <div className="text-muted" style={{ fontSize: 12 }}>Claves SAT, unidades y la regla de IVA (servicios clínicos exentos, productos 16 %) son sugerencias a validar con el contador.</div>
            </div>
          </div>
        </div>
      )}
      {errores.length > 0 && venta && <div className="text-red" style={{ fontSize: 12.5, marginTop: 8 }}>{errores.join(' · ')}</div>}
    </Modal>
  )
}

function FormCancelacion({ factura, facturas, onClose, onListo }) {
  const [motivo, setMotivo] = useState('02'), [sust, setSust] = useState(''), [com, setCom] = useState('')
  const candidatas = facturas.filter(f => f.id !== factura.id && f.uuid && f.estado === 'vigente')
  const guardar = async () => {
    if (motivo === '01' && !sust) return toast.error('El motivo 01 exige el UUID que sustituye')
    if (await ejecutar(insertar('cfdi_cancelaciones', { factura_id: factura.id, motivo_sat: motivo, uuid_sustituto: motivo === '01' ? sust : null, comentario: com || null }), 'Cancelación solicitada: queda en proceso hasta la respuesta del receptor')) onListo()
  }
  return (
    <Modal open onClose={onClose} size="sm" title={`Cancelar CFDI ${factura.serie ?? ''}-${factura.folio ?? ''}`} footer={<><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn red" onClick={guardar}>Solicitar cancelación</button></>}>
      <BannerSimulado compacto texto="Modo simulado: la cancelación no llega al SAT." />
      <FormField label="Motivo SAT" as="select" value={motivo} onChange={e => setMotivo(e.target.value)} options={MOTIVOS_CANCELACION.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} />
      {motivo === '01' && <FormField label="UUID que sustituye" as="select" value={sust} onChange={e => setSust(e.target.value)} options={candidatas.map(f => ({ value: f.uuid, label: `${f.serie}-${f.folio} · ${f.uuid.slice(0, 8)}…` }))} />}
      <FormField label="Comentario interno" value={com} onChange={e => setCom(e.target.value)} />
      <div className="text-muted" style={{ fontSize: 12 }}>Solo Administración cancela. Si el ticket sigue cobrado, quedará sin CFDI vigente.</div>
    </Modal>
  )
}

function FormNota({ factura, onClose, onListo }) {
  const { user } = useApp()
  const [f, setF] = useState({ tipo: 'devolucion', importe: '', concepto: '', dinero: false })
  const guardar = async () => {
    if (!(Number(f.importe) > 0) || Number(f.importe) > Number(factura.total)) return toast.error('Importe inválido (no puede exceder la factura)')
    const { error } = await rpc('emitir_nota_credito', { p_factura: factura.id, p_tipo: f.tipo, p_importe: Number(f.importe), p_concepto: f.concepto, p_devolver_dinero: f.dinero })
    if (error) toast.error(textoError(error)); else { toast.success('Nota de crédito emitida (SIMULADA)'); onListo() }
  }
  return (
    <Modal open onClose={onClose} size="sm" title={`Nota de crédito sobre ${factura.serie}-${factura.folio} · ${moneda(factura.total)}`} footer={<><button className="btn o" onClick={onClose}>Cerrar</button><button className="btn" onClick={guardar}>Emitir CFDI de egreso</button></>}>
      <BannerSimulado compacto texto="Modo simulado: el CFDI de egreso no tiene validez fiscal." />
      <FormField label="Tipo" as="select" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })} options={[{ value: 'devolucion', label: 'Devolución' }, { value: 'descuento', label: 'Descuento' }, { value: 'bonificacion', label: 'Bonificación' }]} />
      <FormField label="Importe" type="number" min="0" step="0.01" value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} />
      <FormField label="Concepto" required value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} />
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.dinero} onChange={e => setF({ ...f, dinero: e.target.checked })} /> Devolver dinero en caja (requiere tu turno abierto)</label>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>Relación SAT 01 · Nota de crédito de los documentos relacionados. Solo el Administrador la emite.</div>
    </Modal>
  )
}

// ── Datos fiscales de clientes ───────────────────────────────────────────────────────────────────────
function Receptores({ recs, onCambio, puede }) {
  const [edit, setEdit] = useState(null)
  const guardar = async () => {
    const e = edit
    if (!validarRfc(e.rfc) || !e.razon_social?.trim() || !/^\d{5}$/.test(e.codigo_postal ?? '')) return toast.error('Revisa RFC, razón social y CP')
    const datos = { rfc: e.rfc.toUpperCase(), razon_social: e.razon_social.trim().toUpperCase(), regimen_fiscal: e.regimen_fiscal, codigo_postal: e.codigo_postal, uso_cfdi: e.uso_cfdi, correo: e.correo || null, validado: !!e.validado, facturacion_automatica: !!e.facturacion_automatica, paciente_id: e.paciente_id ?? null }
    if (await ejecutar(e.id ? actualizar('cfdi_receptores', e.id, datos) : insertar('cfdi_receptores', datos), 'Datos fiscales guardados')) { setEdit(null); onCambio() }
  }
  return (
    <>
      <div style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="text-muted" style={{ fontSize: 12.5 }}>La facturación automática solo con consentimiento y datos validados (P-066).</span>
        {puede && <button className="btn" onClick={() => setEdit({ regimen_fiscal: '612', uso_cfdi: 'D01' })}><Plus size={13} /> Agregar</button>}</div>
      <AvisoError error={recs.error} />
      <DataTable cargando={recs.cargando} filas={recs.filas} exportarNombre="datos-fiscales" onFila={puede ? setEdit : undefined} vacio={{ title: 'Sin datos fiscales', description: 'Se guardan al facturar o aquí.' }}
        columnas={[{ key: 'rfc', label: 'RFC' }, { key: 'razon_social', label: 'Razón social' }, { key: 'regimen_fiscal', label: 'Régimen' }, { key: 'codigo_postal', label: 'CP' }, { key: 'uso_cfdi', label: 'Uso CFDI' }, { key: 'correo', label: 'Correo' },
          { key: 'validado', label: 'Validado', render: r => (r.validado ? '✓' : '—') }, { key: 'facturacion_automatica', label: 'Auto', render: r => (r.facturacion_automatica ? 'Sí' : 'No') }]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Datos fiscales" footer={<><button className="btn o" onClick={() => setEdit(null)}>Cancelar</button><button className="btn" onClick={guardar}>Guardar</button></>}>
        {edit && <>
          <div className="grid2"><FormField label="RFC" value={edit.rfc ?? ''} onChange={e => setEdit({ ...edit, rfc: e.target.value.toUpperCase() })} /><FormField label="C.P." value={edit.codigo_postal ?? ''} onChange={e => setEdit({ ...edit, codigo_postal: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></div>
          <FormField label="Razón social" value={edit.razon_social ?? ''} onChange={e => setEdit({ ...edit, razon_social: e.target.value })} />
          <div className="grid2"><FormField label="Régimen" as="select" value={edit.regimen_fiscal} onChange={e => setEdit({ ...edit, regimen_fiscal: e.target.value })} options={REGIMENES.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} />
            <FormField label="Uso CFDI" as="select" value={edit.uso_cfdi} onChange={e => setEdit({ ...edit, uso_cfdi: e.target.value })} options={USOS_CFDI.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} /></div>
          <FormField label="Correo" value={edit.correo ?? ''} onChange={e => setEdit({ ...edit, correo: e.target.value })} />
          <label style={{ fontSize: 13, marginRight: 14 }}><input type="checkbox" checked={!!edit.validado} onChange={e => setEdit({ ...edit, validado: e.target.checked })} /> Validado con constancia</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!edit.facturacion_automatica} onChange={e => setEdit({ ...edit, facturacion_automatica: e.target.checked })} /> Facturación automática (con consentimiento)</label>
        </>}
      </Modal>
    </>
  )
}

// ── Emisor fiscal y modo del PAC (Administrador) ─────────────────────────────────────────────────────
function ConfigFiscal({ onCambio }) {
  const em = useLeer('emisor', 'emisor_fiscal', { sedeCol: false, limite: 5 })
  const pac = useLeer('pac-cfg', 'pac_configuracion', { sedeCol: false, limite: 1 })
  const [e, setE] = useState(null)
  useEffect(() => { if (em.filas[0] && !e) setE(em.filas[0]) }, [em.filas]) // eslint-disable-line
  const guardar = async () => {
    const d = { rfc: (e.rfc ?? '').toUpperCase() || null, razon_social: e.razon_social || null, regimen_fiscal: e.regimen_fiscal || null, codigo_postal: e.codigo_postal || null, serie: e.serie || 'A' }
    if (d.rfc && !validarRfc(d.rfc)) return toast.error('RFC del emisor inválido')
    if (await ejecutar(e.id ? actualizar('emisor_fiscal', e.id, d) : insertar('emisor_fiscal', d), 'Emisor guardado')) onCambio()
  }
  const activarSim = async () => {
    const p = pac.filas[0]
    if (await ejecutar(p ? actualizar('pac_configuracion', p.id, { modo: 'simulado' }) : insertar('pac_configuracion', { modo: 'simulado', proveedor: 'por_definir' }), 'PAC en modo simulado')) { pac.refetch(); onCambio() }
  }
  return (
    <div style={{ padding: 14 }}>
      <h3>Emisor fiscal de la clínica</h3>
      <AvisoError error={em.error} />
      {e ? (
        <div style={{ maxWidth: 560 }}>
          <div className="grid2"><FormField label="RFC" value={e.rfc ?? ''} onChange={x => setE({ ...e, rfc: x.target.value.toUpperCase() })} /><FormField label="C.P. de expedición" value={e.codigo_postal ?? ''} onChange={x => setE({ ...e, codigo_postal: x.target.value })} /></div>
          <FormField label="Razón social" value={e.razon_social ?? ''} onChange={x => setE({ ...e, razon_social: x.target.value })} />
          <div className="grid2"><FormField label="Régimen fiscal" as="select" value={e.regimen_fiscal ?? ''} onChange={x => setE({ ...e, regimen_fiscal: x.target.value })} options={REGIMENES.map(([v, l]) => ({ value: v, label: `${v} · ${l}` }))} /><FormField label="Serie" value={e.serie ?? 'A'} onChange={x => setE({ ...e, serie: x.target.value })} /></div>
          <button className="btn" onClick={guardar}>Guardar emisor</button>
        </div>
      ) : <button className="btn" onClick={() => setE({ serie: 'A' })}>Configurar emisor</button>}
      <h3 style={{ marginTop: 18 }}>PAC (timbrado)</h3>
      <div style={{ fontSize: 13, margin: '6px 0' }}>Modo actual: <b>{pac.filas[0]?.modo ?? 'no configurado'}</b> · proveedor {pac.filas[0]?.proveedor ?? 'por definir'}. El certificado (CSD) de cada clínica se carga cifrado en servidor y nunca en el fuente.</div>
      <button className="btn o" onClick={activarSim}>Activar modo simulado</button>
    </div>
  )
}
