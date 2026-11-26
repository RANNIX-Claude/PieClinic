// Detalle de un caso (F4.3): la diferencia, lo que pasó con el producto desde el conteo anterior (entradas, traspasos, ventas, cancelaciones y devoluciones),
// la evidencia, la línea de tiempo (bitácora de solo inserciones), la asignación con fecha compromiso y el cierre (causa, quién absorbe el costo, autorización).
// Solo dueño, supervisor y soporte (solo lectura) llegan aquí; el rol de sucursal no ve casos ni diferencias (lo exige la base).
// La pantalla INFORMA, no acusa: acota la ventana de tiempo y las personas con acceso, sin etiquetas de culpa.
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, MessageSquarePlus, UserCheck, ShieldCheck, RotateCcw, XCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import {
  detalleCaso, tomarCaso, asignarCaso, comentarCaso, guardarCierreCaso, cerrarSinAjuste, rechazarCaso, volverAInvestigar, autorizarAjuste, reintentarAjuste,
  adjuntarEvidencia, listarCausas, listarInvestigadores,
} from '../../../lib/auditoria/casoApi'
import {
  NOMBRE_ESTADO_CASO, VARIANTE_ESTADO_CASO, NOMBRE_TIPO_CASO, RESPONSABLES_COSTO, NOMBRE_RESPONSABLE, AVISO_EMPLEADO, COMPROMISO_POR_OMISION_DIAS,
  accionesCaso, deltaDelAjuste, validarCierre, validarTexto, validarFechaCompromiso, sumarDias, antiguedadTexto, mensajeAutorizacion, esContraparte, esPrincipalDePar,
} from '../../../lib/auditoria/casoReglas'
import { urlEvidencia } from '../../../lib/auditoria/urlFirmadaAuditoria'
import { mensajeError } from '../../../lib/auditoria/roles'
import { fechaHora, fecha, moneda, hoyISO } from '../../../lib/formato'
import PageHeader from '../../../components/ui/PageHeader'
import StatusBadge from '../../../components/ui/StatusBadge'
import DataTable from '../../../components/ui/DataTable'
import Tabs from '../../../components/ui/Tabs'
import Modal from '../../../components/ui/Modal'
import KPICard from '../../../components/ui/KPICard'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import EmptyState from '../../../components/ui/EmptyState'
import CamaraEvidencia from './CamaraEvidencia'
import AutorizarDialogo from './AutorizarDialogo'

const signo = n => (Number(n) > 0 ? `+${n}` : String(n))

function DialogoTexto({ open, titulo, etiqueta, ayuda, minimo = 10, ocupado, textoConfirmar, peligro, onConfirm, onCancel }) {
  const [t, setT] = useState('')
  const v = validarTexto(t, minimo)
  const cerrar = () => { setT(''); onCancel?.() }
  return (
    <Modal open={open} onClose={cerrar} title={titulo} size="sm" cerrarAlClicFuera={false}
      footer={<><button type="button" className="btn o" onClick={cerrar} disabled={ocupado}>Cancelar</button>
        <button type="button" className={`btn${peligro ? ' red' : ''}`} disabled={!v.ok || ocupado} onClick={async () => { const r = await onConfirm?.(t.trim()); if (r !== false) setT('') }}>{ocupado ? 'Procesando…' : textoConfirmar}</button></>}>
      <div className="field"><label className="req">{etiqueta}</label>
        <textarea rows={4} value={t} onChange={e => setT(e.target.value)} maxLength={2000} />
        {ayuda && <span className="hint">{ayuda}</span>}
        {!v.ok && t.length > 0 && <span className="err">{v.error}</span>}</div>
    </Modal>
  )
}

function Miniatura({ ruta }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let vivo = true; urlEvidencia(ruta, 120).then(u => { if (vivo) setUrl(u) }); return () => { vivo = false } }, [ruta])
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Evidencia del caso" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border, #ddd)' }} /></a>
    : <div style={{ width: 120, height: 90, borderRadius: 6, background: 'var(--bg-soft, #eee)', display: 'grid', placeItems: 'center', fontSize: 11 }}>Foto…</div>
}

const NOMBRE_TIPO_MOV = {
  compra: 'Entrada de mercancía', venta: 'Venta', traspaso_salida: 'Traspaso (salida)', traspaso_entrada: 'Traspaso (entrada)', merma: 'Merma', conteo: 'Conteo', ajuste: 'Ajuste',
  consumo_consulta: 'Consumo en consulta', devolucion_proveedor: 'Devolución a proveedor', devolucion_cliente: 'Devolución de cliente',
}

export default function CasoDetalle({ casoId, rolAud, onSalir }) {
  const { organizacion } = useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState('movimientos')
  const [camara, setCamara] = useState(false)
  const [coment, setComent] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [dlg, setDlg] = useState(null)   // 'autorizar' | 'reintentar' | 'sin_ajuste' | 'rechazar' | 'volver'
  const [msgAut, setMsgAut] = useState('')
  const [compromiso, setCompromiso] = useState(sumarDias(hoyISO(), COMPROMISO_POR_OMISION_DIAS))
  const [asignar, setAsignar] = useState({ usuario: '', fecha: sumarDias(hoyISO(), COMPROMISO_POR_OMISION_DIAS) })
  const [cierre, setCierre] = useState({ causa: '', responsable: '', monto: '', nota: '' })

  const q = useQuery({
    queryKey: ['ctl-caso', casoId], retry: false,
    queryFn: async () => { const r = await detalleCaso(casoId); if (r.error) throw new Error(mensajeError(r.error)); return r.data },
  })
  const causas = useQuery({ queryKey: ['ctl-causas'], retry: false, enabled: rolAud !== 'soporte', queryFn: async () => (await listarCausas()).data ?? [] })
  const inv = useQuery({ queryKey: ['ctl-investigadores'], retry: false, enabled: rolAud !== 'soporte', queryFn: async () => (await listarInvestigadores()).data ?? [] })

  const d = q.data
  const caso = d?.caso
  useEffect(() => {   // precarga la propuesta guardada
    if (!caso) return
    setCierre({ causa: caso.causa_id ?? '', responsable: caso.responsable_costo ?? '', monto: caso.monto_costo ?? '', nota: caso.nota_cierre ?? '' })
  }, [caso?.id, caso?.causa_id, caso?.responsable_costo, caso?.monto_costo, caso?.nota_cierre, caso?.estado]) // eslint-disable-line react-hooks/exhaustive-deps

  const refrescar = async () => { await q.refetch(); qc.invalidateQueries({ queryKey: ['ctl-casos'] }) }
  /** Ejecuta una RPC, muestra el error del servidor tal cual (mensaje claro) y refresca. Devuelve los datos o null. */
  const ejecutar = async (fn, ok) => {
    setOcupado(true)
    try {
      const r = await fn()
      if (r.error) { toast.error(mensajeError(r.error)); return null }
      if (ok) toast.success(ok)
      await refrescar()
      return r.data ?? {}
    } finally { setOcupado(false) }
  }

  if (q.isLoading) return <LoadingSpinner />
  if (q.isError) return <div className="pagina"><button className="btn o sm" onClick={onSalir}><ArrowLeft size={14} /> Volver</button><EmptyState title="No se pudo abrir el caso" description={q.error.message} /></div>

  const par = d.par
  const a = accionesCaso({ caso, rolAud, yo: d.yo })
  const ctx = d.contexto
  const posteriores = [...(ctx.movimientos ?? []), ...(ctx.ventas ?? []), ...(ctx.cancelaciones ?? [])].filter(x => x.posterior_al_conteo).length
  const delta = deltaDelAjuste(caso.cantidad)
  const ultimaLlamada = [...(d.llamadas_origen ?? [])].reverse().find(l => l.estado === 'rechazada')
  const topeMonto = Math.abs(Number(caso.valor ?? 0)) + (par && esPrincipalDePar(caso) ? Math.abs(Number(par.valor ?? 0)) : 0)
  const vCierre = validarCierre({ causaId: cierre.causa, causaRequiereNota: !!causas.data?.find(c => c.id === cierre.causa)?.requiere_nota, responsable: cierre.responsable, monto: cierre.monto, nota: cierre.nota, tope: topeMonto })
  const investigadores = (inv.data ?? []).filter(u => !u.sucursales?.length || u.sucursales.includes(caso.sucursal_id))
  const sucursalNombre = caso.sucursal

  const colMov = [
    { key: 'fecha', label: 'Fecha', render: f => fechaHora(f.fecha) },
    { key: 'tipo', label: 'Movimiento', render: f => NOMBRE_TIPO_MOV[f.tipo] ?? f.tipo, valor: f => NOMBRE_TIPO_MOV[f.tipo] ?? f.tipo, filtro: true },
    { key: 'cantidad', label: 'Cantidad', align: 'right', render: f => signo(Number(f.cantidad)) },
    { key: 'documento', label: 'Documento', render: f => f.documento ?? '—' },
    { key: 'usuario', label: 'Registró', render: f => f.usuario ?? '—' },
    { key: 'posterior_al_conteo', label: '', sortable: false, render: f => (f.posterior_al_conteo ? <span className="bd a">Después del conteo</span> : null) },
  ]
  const colVen = [
    { key: 'fecha_hora', label: 'Fecha', render: f => fechaHora(f.fecha_hora) },
    { key: 'ticket', label: 'Ticket' },
    { key: 'estado', label: 'Estado' },
    { key: 'cantidad', label: 'Piezas', align: 'right' },
    { key: 'precio_cobrado', label: 'Precio cobrado', align: 'right', render: f => moneda(f.precio_cobrado) },
    { key: 'usuario', label: 'Cobró', render: f => f.usuario ?? '—' },
    { key: 'posterior_al_conteo', label: '', sortable: false, render: f => (f.posterior_al_conteo ? <span className="bd a">Después del conteo</span> : null) },
  ]
  const colCan = [
    { key: 'fecha', label: 'Fecha', render: f => fechaHora(f.fecha) },
    { key: 'tipo', label: 'Tipo', render: f => (f.tipo === 'devolucion' ? 'Devolución' : 'Cancelación') },
    { key: 'ticket', label: 'Ticket' },
    { key: 'usuario', label: 'Registró', render: f => f.usuario ?? '—' },
    { key: 'autorizador_nombre', label: 'Autorizó', render: f => f.autorizador_nombre ?? '—' },
    { key: 'motivo', label: 'Motivo', render: f => f.motivo ?? '—' },
    { key: 'ligada_al_caso', label: '', sortable: false, render: f => (f.ligada_al_caso ? <span className="bd b">Ligada a este caso</span> : null) },
  ]
  const colTur = [
    { key: 'apertura_en', label: 'Apertura', render: f => fechaHora(f.apertura_en) },
    { key: 'cierre_en', label: 'Cierre', render: f => (f.cierre_en ? fechaHora(f.cierre_en) : 'Abierto') },
    { key: 'nombre_turno', label: 'Turno', render: f => f.nombre_turno ?? f.caja ?? '—' },
    { key: 'usuario', label: 'Cajero', render: f => f.usuario ?? '—' },
  ]

  const onAutorizar = reintento => async clave => {
    setMsgAut('')
    setOcupado(true)
    try {
      const r = await (reintento ? reintentarAjuste : autorizarAjuste)(caso.id, clave)
      if (r.error) { setMsgAut(mensajeError(r.error)); return false }
      const res = r.data
      if (!res?.ok) {
        setMsgAut(mensajeAutorizacion(res))
        if (res?.estado === 'ajuste_fallido') { toast.error('El origen rechazó el ajuste: el caso queda como «ajuste fallido» y se puede reintentar.'); setDlg(null); await refrescar() }
        return false
      }
      toast.success(mensajeAutorizacion(res)); setDlg(null); await refrescar()
      return true
    } finally { setOcupado(false) }
  }

  return (
    <div className="pagina">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn o sm" onClick={onSalir}><ArrowLeft size={14} /> Casos</button>
        <StatusBadge estado={caso.estado} label={NOMBRE_ESTADO_CASO[caso.estado]} variante={VARIANTE_ESTADO_CASO[caso.estado]} />
        {caso.vencido && <span className="bd r">Fecha compromiso vencida</span>}
        {rolAud === 'soporte' && <span className="bd n">Solo lectura (soporte): tus consultas quedan en bitácora</span>}
      </div>
      <PageHeader titulo={`${caso.folio} · ${NOMBRE_TIPO_CASO[caso.tipo] ?? caso.tipo}`}
        subtitulo={`${sucursalNombre} · abierto ${fechaHora(caso.abierto_en)} · ${caso.estado === 'abierta' || caso.estado === 'en_investigacion' || caso.estado === 'ajuste_fallido' ? 'lleva' : 'duró'} ${antiguedadTexto(caso.antiguedad_dias)}`} />

      {caso.estado === 'ajuste_fallido' && (
        <div className="card" style={{ borderColor: 'var(--danger, #c0392b)', marginBottom: 12 }}>
          <b><AlertTriangle size={15} style={{ verticalAlign: -2 }} /> El origen rechazó el ajuste</b>
          <div style={{ fontSize: 13, marginTop: 4 }}>{ultimaLlamada?.mensaje ?? 'Sin detalle'} · intentos: {ultimaLlamada?.intentos ?? 1}. El inventario no se movió. Corrija lo que corresponda y reintente con su contraseña, o vuelva a investigar el caso.</div>
        </div>
      )}
      {posteriores > 0 && esAbierto(caso.estado) && (
        <div className="card" style={{ borderColor: 'var(--warn, #d68910)', marginBottom: 12, fontSize: 13 }}>
          <Info size={15} style={{ verticalAlign: -2 }} /> Hay <b>{posteriores}</b> movimiento(s) registrado(s) <b>después</b> del conteo. Antes de ajustar, confirme que la diferencia sigue vigente: una entrada o un traspaso registrado tarde puede explicarla.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <KPICard title="Producto" value={<span style={{ fontSize: 15 }}>{caso.producto?.descripcion ?? '—'}</span>} subtitle={caso.producto?.codigo_barras} />
        <KPICard title="Diferencia" value={caso.cantidad == null ? '—' : signo(Number(caso.cantidad))} subtitle={caso.cantidad == null ? (caso.contexto?.no_reportado ? 'No reportado' : '') : delta.texto} />
        <KPICard title="Valor al costo" value={moneda(caso.valor)} subtitle={caso.contexto?.saldo_al_contar != null ? `Saldo al contar ${caso.contexto.saldo_al_contar} · contado ${caso.contexto.cantidad_fisica ?? '—'}` : undefined} />
        <KPICard title="Saldo actual" value={ctx.saldo_actual == null ? '—' : Number(ctx.saldo_actual)} subtitle="Solo dueño y supervisor" />
        <KPICard title="Asignado a" value={<span style={{ fontSize: 15 }}>{caso.asignado ?? 'Sin asignar'}</span>} subtitle={caso.fecha_compromiso ? `Compromiso ${fecha(caso.fecha_compromiso)}` : undefined} />
      </div>

      {par && (
        <div className="card" style={{ marginBottom: 12, fontSize: 13 }}>
          <b>Posible sustitución de código</b> (relación de costo {par.relacion_costo ?? '—'} a 1). {esContraparte(caso) ? `Este caso es la contraparte: actúe sobre el principal ${par.folio}.` : 'Este es el caso principal: el cierre y el ajuste aplican a los dos productos a la vez.'}
          <div style={{ marginTop: 4 }}>{par.folio} · {par.producto} · {signo(Number(par.cantidad))} · {NOMBRE_ESTADO_CASO[par.estado]}</div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Qué pasó con este producto desde el conteo anterior</h3>
        <div className="hint" style={{ marginBottom: 8 }}>
          Ventana: {ctx.conteo_anterior ? `desde el conteo anterior (${fechaHora(ctx.conteo_anterior)})` : `sin conteo anterior: últimos 30 días (${fechaHora(ctx.desde)})`} hasta hoy · conteo que originó el caso: {fechaHora(ctx.corte)}.
          {ctx.nota ? ` ${ctx.nota}` : ''}
        </div>
        <Tabs value={tab} onChange={setTab} items={[
          { id: 'movimientos', label: 'Entradas, traspasos y mermas', badge: ctx.movimientos?.length ?? 0 },
          { id: 'ventas', label: 'Ventas', badge: ctx.ventas?.length ?? 0 },
          { id: 'cancelaciones', label: 'Cancelaciones y devoluciones', badge: ctx.cancelaciones?.length ?? 0 },
          { id: 'turnos', label: 'Turnos y personas con acceso', badge: ctx.turnos?.length ?? 0 },
        ]} />
        <div style={{ marginTop: 8 }}>
          {tab === 'movimientos' && <DataTable columnas={colMov} filas={ctx.movimientos ?? []} buscador={false} sinPaginacion vacio={{ title: 'Sin movimientos', description: 'No hay entradas, traspasos ni mermas registrados en la ventana. Una entrada que nunca se registró es la causa más común de un faltante.' }} />}
          {tab === 'ventas' && <DataTable columnas={colVen} filas={ctx.ventas ?? []} filaKey="linea_id" buscador={false} sinPaginacion vacio={{ title: 'Sin ventas', description: 'No se vendió este producto en la ventana.' }} />}
          {tab === 'cancelaciones' && <DataTable columnas={colCan} filas={ctx.cancelaciones ?? []} filaKey="venta_id" buscador={false} sinPaginacion vacio={{ title: 'Sin cancelaciones', description: 'No hay cancelaciones ni devoluciones de este producto en la ventana.' }} />}
          {tab === 'turnos' && (
            <>
              <DataTable columnas={colTur} filas={ctx.turnos ?? []} buscador={false} sinPaginacion vacio={{ title: 'Sin turnos', description: 'No hay turnos de caja en la ventana.' }} />
              {(ctx.personas ?? []).length > 0 && <div style={{ fontSize: 13, marginTop: 8 }}><b>Personas con movimientos o turnos en la ventana</b> (orden alfabético; es información de contexto, no un señalamiento): {ctx.personas.map(p => p.nombre).join(', ')}.</div>}
            </>
          )}
        </div>
        {(d.historial_producto ?? []).length > 0 && <div style={{ fontSize: 12.5, marginTop: 8 }}>Casos anteriores de este producto en la sucursal: {d.historial_producto.map(h => `${h.folio} (${NOMBRE_ESTADO_CASO[h.estado]}${h.causa ? ` · ${h.causa}` : ''})`).join(' · ')}</div>}
      </div>

      {!a.soloLectura && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Investigación</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {a.puedeTomar && (
              <div className="field" style={{ margin: 0 }}><label>Fecha compromiso</label>
                <input type="date" value={compromiso} onChange={e => setCompromiso(e.target.value)} /></div>
            )}
            {a.puedeTomar && <button className="btn" disabled={ocupado || !validarFechaCompromiso(compromiso, hoyISO()).ok}
              onClick={() => ejecutar(() => tomarCaso(caso.id, compromiso), caso.estado === 'abierta' ? 'Caso en investigación' : 'Fecha actualizada')}><UserCheck size={14} /> {caso.estado === 'abierta' ? 'Tomar el caso' : 'Tomar / actualizar fecha'}</button>}
            {a.puedeAdjuntar && <button className="btn o" disabled={ocupado} onClick={() => setCamara(true)}><Camera size={14} /> Adjuntar evidencia</button>}
          </div>
          {a.puedeAsignar && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
              <div className="field" style={{ margin: 0 }}><label>Asignar a</label>
                <select value={asignar.usuario} onChange={e => setAsignar(s => ({ ...s, usuario: e.target.value }))}>
                  <option value="">Elige…</option>{investigadores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
              <div className="field" style={{ margin: 0 }}><label>Fecha compromiso</label>
                <input type="date" value={asignar.fecha} onChange={e => setAsignar(s => ({ ...s, fecha: e.target.value }))} /></div>
              <button className="btn o" disabled={ocupado || !asignar.usuario || !validarFechaCompromiso(asignar.fecha, hoyISO()).ok}
                onClick={() => ejecutar(() => asignarCaso(caso.id, asignar.usuario, asignar.fecha), 'Responsable asignado')}>Asignar</button>
            </div>
          )}
          {a.puedeComentar && (
            <div style={{ marginTop: 10 }}>
              <div className="field" style={{ margin: 0 }}><label>Comentario (queda en la bitácora; no se edita ni se borra)</label>
                <textarea rows={2} value={coment} onChange={e => setComent(e.target.value)} maxLength={2000} /></div>
              <button className="btn o sm" style={{ marginTop: 6 }} disabled={ocupado || coment.trim().length < 3}
                onClick={async () => { const r = await ejecutar(() => comentarCaso(caso.id, coment.trim()), 'Comentario registrado'); if (r) setComent('') }}><MessageSquarePlus size={14} /> Agregar comentario</button>
            </div>
          )}
          {a.motivos.contraparte && <div className="hint" style={{ marginTop: 8 }}>{a.motivos.contraparte}{par ? ` ${par.folio}` : ''}</div>}
        </div>
      )}

      {a.puedeProponerCierre && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Cierre del caso</h3>
          <div className="hint" style={{ marginBottom: 8 }}>Tres datos obligatorios: causa (catálogo cerrado), quién absorbe el costo con su monto al costo, y la autorización del ajuste por otra persona con su contraseña completa.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            <div className={`field${vCierre.errores.causa && cierre.causa === '' ? '' : ''}`}><label className="req">Causa</label>
              <select value={cierre.causa} onChange={e => setCierre(s => ({ ...s, causa: e.target.value }))}>
                <option value="">Elige la causa…</option>{(causas.data ?? []).map(c => <option key={c.id} value={c.id}>{c.nombre}{c.requiere_nota ? ' (exige nota)' : ''}</option>)}</select></div>
            <div className="field"><label className="req">Quién absorbe el costo</label>
              <select value={cierre.responsable} onChange={e => setCierre(s => ({ ...s, responsable: e.target.value }))}>
                <option value="">Elige…</option>{RESPONSABLES_COSTO.map(r => <option key={r} value={r}>{NOMBRE_RESPONSABLE[r]}</option>)}</select></div>
            <div className="field"><label className="req">Monto al costo</label>
              <input type="number" min="0" step="0.01" value={cierre.monto} onChange={e => setCierre(s => ({ ...s, monto: e.target.value }))} />
              {vCierre.errores.monto && cierre.monto !== '' && <span className="err">{vCierre.errores.monto}</span>}
              <span className="hint">Tope: {moneda(topeMonto)}</span></div>
          </div>
          {cierre.responsable === 'empleado' && <div className="hint" style={{ margin: '6px 0' }}>{AVISO_EMPLEADO}</div>}
          <div className="field"><label className={causas.data?.find(c => c.id === cierre.causa)?.requiere_nota ? 'req' : ''}>Nota</label>
            <textarea rows={2} value={cierre.nota} onChange={e => setCierre(s => ({ ...s, nota: e.target.value }))} maxLength={2000} />
            {vCierre.errores.nota && <span className="err">{vCierre.errores.nota}</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn o" disabled={ocupado || !vCierre.ok}
              onClick={() => ejecutar(() => guardarCierreCaso({ casoId: caso.id, causaId: cierre.causa, responsable: cierre.responsable, monto: Number(cierre.monto), nota: cierre.nota.trim() || null }), 'Propuesta de cierre guardada')}>Guardar propuesta de cierre</button>
            {rolAud === 'dueno' && (a.puedeAutorizar || a.puedeReintentar) && (
              <button className="btn" disabled={ocupado} onClick={() => { setMsgAut(''); setDlg(a.puedeReintentar ? 'reintentar' : 'autorizar') }}>
                {a.puedeReintentar ? <><RotateCcw size={14} /> Reintentar el ajuste</> : <><ShieldCheck size={14} /> Autorizar el ajuste</>}</button>
            )}
            {a.puedeCerrarSinAjuste && <button className="btn o" disabled={ocupado || !cierre.causa} onClick={() => setDlg('sin_ajuste')}><CheckCircle2 size={14} /> Cerrar sin ajuste</button>}
            {a.puedeRechazar && <button className="btn o red" disabled={ocupado} onClick={() => setDlg('rechazar')}><XCircle size={14} /> Rechazar el caso</button>}
            {a.puedeVolverAInvestigar && <button className="btn o" disabled={ocupado} onClick={() => setDlg('volver')}>Volver a investigar</button>}
          </div>
          {[a.motivos.autorizar, a.motivos.cerrar].filter(Boolean).map(m => <div key={m} className="hint" style={{ marginTop: 6 }}>{m}</div>)}
          {caso.estado === 'en_investigacion' && !vCierre.ok && <div className="hint" style={{ marginTop: 6 }}>Para guardar la propuesta falta: {Object.values(vCierre.errores).join(' · ')}.</div>}
        </div>
      )}
      {!a.puedeProponerCierre && ['cerrada_con_ajuste', 'cerrada_sin_ajuste', 'rechazada'].includes(caso.estado) && (
        <div className="card" style={{ marginBottom: 12, fontSize: 13 }}>
          <b>Cierre</b>: {NOMBRE_ESTADO_CASO[caso.estado]} el {fechaHora(caso.cerrado_en)}.
          {caso.causa && <> Causa: <b>{caso.causa}</b>.</>}
          {caso.responsable_costo && <> Absorbe: <b>{NOMBRE_RESPONSABLE[caso.responsable_costo]}</b> ({moneda(caso.monto_costo)}).</>}
          {caso.autorizador && <> Autorizó el ajuste: <b>{caso.autorizador}</b> el {fechaHora(caso.autorizado_en)}.</>}
          {caso.movimiento_origen_id && <> Movimiento en el origen: <code>{caso.movimiento_origen_id}</code>.</>}
          {caso.nota_cierre && <div style={{ marginTop: 4 }}>Resolución: {caso.nota_cierre}</div>}
          {caso.responsable_costo === 'empleado' && <div className="hint" style={{ marginTop: 4 }}>{AVISO_EMPLEADO}</div>}
        </div>
      )}

      {(d.evidencias ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Evidencia adjunta</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {d.evidencias.map(e => (
              <div key={e.id} style={{ fontSize: 11.5, maxWidth: 140 }}><Miniatura ruta={e.ruta} />
                <div>{fechaHora(e.capturado_en)}</div><div>{e.usuario ?? '—'}</div><div title={e.hash_sha256}>sha256 {e.hash_sha256.slice(0, 10)}…</div></div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Línea de tiempo (bitácora de solo inserciones)</h3>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {d.bitacora.map(b => (
            <li key={b.id} style={{ borderLeft: '3px solid var(--border, #ccc)', paddingLeft: 10, fontSize: 13 }}>
              <div style={{ fontSize: 11.5, opacity: 0.75 }}>{fechaHora(b.creado_en)} · {b.usuario}{b.folio !== caso.folio ? ` · ${b.folio}` : ''}{b.estado_nuevo ? ` · ${NOMBRE_ESTADO_CASO[b.estado_anterior] ?? '—'} → ${NOMBRE_ESTADO_CASO[b.estado_nuevo] ?? b.estado_nuevo}` : ''}</div>
              <div>{b.texto}</div>
            </li>
          ))}
        </ol>
      </div>

      {(d.llamadas_origen ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 12, fontSize: 13 }}>
          <h3 style={{ marginTop: 0 }}>Llamadas al origen (ajuste)</h3>
          {d.llamadas_origen.map(l => (
            <div key={l.id}>{l.folio_caso} · <StatusBadge estado={l.estado} label={l.estado === 'aplicada' ? 'Aplicada' : l.estado === 'rechazada' ? 'Rechazada' : 'Pendiente'} /> · intentos {l.intentos}{l.movimiento_id ? ` · movimiento ${l.movimiento_id}` : ''}{l.mensaje ? ` · ${l.mensaje}` : ''}</div>
          ))}
        </div>
      )}

      <CamaraEvidencia open={camara} onClose={() => setCamara(false)}
        onFoto={async foto => {
          const r = await adjuntarEvidencia({ casoId: caso.id, organizacionId: organizacion?.id, sucursalId: caso.sucursal_id, blob: foto.blob, hash: foto.hash, ancho: foto.ancho, alto: foto.alto, nota: foto.nota })
          if (r.error) { toast.error(mensajeError(r.error)); throw r.error }
          toast.success('Evidencia adjunta'); await refrescar()
        }} />
      <AutorizarDialogo open={dlg === 'autorizar' || dlg === 'reintentar'} caso={caso} par={par} reintento={dlg === 'reintentar'} ocupado={ocupado} mensaje={msgAut}
        onCancelar={() => setDlg(null)} onConfirmar={onAutorizar(dlg === 'reintentar')} />
      <DialogoTexto open={dlg === 'sin_ajuste'} titulo="Cerrar sin ajuste" etiqueta="Resolución" textoConfirmar="Cerrar sin ajuste" ocupado={ocupado} onCancel={() => setDlg(null)}
        ayuda="Qué se encontró (apareció la pieza, era error de conteo…). El saldo de inventario no se toca."
        onConfirm={async t => {
          const r = await ejecutar(() => cerrarSinAjuste({ casoId: caso.id, causaId: cierre.causa, resolucion: t, responsable: cierre.responsable || null, monto: cierre.responsable ? Number(cierre.monto || 0) : 0 }), 'Caso cerrado sin ajuste')
          if (r) setDlg(null); else return false
          return true
        }} />
      <DialogoTexto open={dlg === 'rechazar'} titulo="Rechazar el caso" etiqueta="Motivo del rechazo" textoConfirmar="Rechazar" peligro ocupado={ocupado} onCancel={() => setDlg(null)}
        ayuda="El caso no procede (se abrió por error, está duplicado, el conteo fue inválido…). El saldo no se toca."
        onConfirm={async t => { const r = await ejecutar(() => rechazarCaso(caso.id, t), 'Caso rechazado'); if (r) setDlg(null); else return false; return true }} />
      <DialogoTexto open={dlg === 'volver'} titulo="Volver a investigar" etiqueta="Por qué vuelve a investigación" textoConfirmar="Volver a investigar" ocupado={ocupado} onCancel={() => setDlg(null)}
        onConfirm={async t => { const r = await ejecutar(() => volverAInvestigar(caso.id, t), 'El caso vuelve a investigación'); if (r) setDlg(null); else return false; return true }} />
    </div>
  )
}

function esAbierto(estado) { return ['abierta', 'en_investigacion', 'ajuste_fallido'].includes(estado) }
