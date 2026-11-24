// Carga del detalle de comisión desde ventas cobradas con ingreso VALIDADO (P-107/P-090) y ajustes por cancelaciones (P-108).
// La base es base_neta de venta_lineas (cobrado sin IVA, neto de descuentos). El % lo pone la BD con el esquema vigente a la fecha.
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import EmptyState from '../../../../components/ui/EmptyState'
import { usePermiso } from '../../../../lib/permisos'
import { rpc } from '../../../../lib/api'
import { supabase } from '../../../../lib/supabase'
import { moneda, fecha, offsetZona, zonaHoraria } from '../../../../lib/formato'
import { agruparComisionables, ajustesPorCancelacion, esquemaVigente } from '../../../../lib/plataforma/nomina'
import { useVista, useEscribir, textoError, CLAVE } from '../comun'

const diaLocal = iso => new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const ESTADOS_COBRADA = ['cobrada', 'por_facturar', 'facturada']

export default function CargarDetalle({ periodo, detalle }) {
  const puede = usePermiso('comisiones.ver_todas') && usePermiso('rh.editar')
  const { ejecutar, ocupado } = useEscribir()
  const qc = useQueryClient()
  const qe = useVista('podologos-perfil', 'prp_empleados', { filtros: { puesto: 'podologo' }, limite: 200 })
  const qs = useVista('esquemas', 'prp_esquemas_comision', { limite: 500 }, { conSede: false })
  const [cargando, setCargando] = useState(false)
  const [res, setRes] = useState(null) // { incluidas, excluidas, ajustes }
  const [marcadas, setMarcadas] = useState({})
  const [aj, setAj] = useState(null)
  const abierto = periodo && periodo.estado !== 'cerrado'
  const emps = qe.data ?? []
  const nombre = id => emps.find(e => e.id === id)?.nombre_completo ?? '—'

  async function buscar() {
    setCargando(true); setRes(null)
    try {
      const porPerfil = Object.fromEntries(emps.filter(e => e.perfil_id).map(e => [e.perfil_id, e.id]))
      if (!Object.keys(porPerfil).length) { toast.error('Ningún podólogo tiene usuario ligado (perfil): sin él no se identifica quién atendió'); return }
      const off = offsetZona()
      const { data: lineas, error } = await supabase.from('venta_lineas')
        .select('venta_id, tipo, descripcion, base_neta, atendio_id, sede_id, ventas!inner(id, folio, cita_id, estado, cobrada_en)')
        .in('atendio_id', Object.keys(porPerfil)).in('ventas.estado', ESTADOS_COBRADA)
        .gte('ventas.cobrada_en', `${periodo.desde}T00:00:00${off}`).lte('ventas.cobrada_en', `${periodo.hasta}T23:59:59.999${off}`).limit(5000)
      if (error) { toast.error(textoError(error)); return }
      const ids = [...new Set(lineas.map(l => l.venta_id))]
      let validadas = new Set()
      if (ids.length) {
        const { data: ing, error: e2 } = await supabase.from('ingresos').select('venta_id, estatus_validacion, es_reembolso').in('venta_id', ids).in('estatus_validacion', ['validado', 'validado_cfdi']).eq('es_reembolso', false).limit(10000)
        if (e2) { toast.error(textoError(e2)); return }
        validadas = new Set(ing.map(i => i.venta_id))
      }
      let registradas = new Set()
      if (ids.length) {
        const { data: ya } = await supabase.from('prp_comision_detalle').select('venta_id, tipo, empleado_id').in('venta_id', ids).neq('tipo', 'ajuste').limit(10000)
        registradas = new Set((ya ?? []).map(d => `${d.venta_id}|${d.tipo}|${d.empleado_id}`))
      }
      const planas = lineas.map(l => ({ ...l, cita_id: l.ventas.cita_id, fecha: diaLocal(l.ventas.cobrada_en) }))
      const { incluidas, excluidas } = agruparComisionables({ lineas: planas, validadas, registradas, empleadoPorPerfil: porPerfil })
      // cancelaciones posteriores de ventas ya comisionadas en este periodo (ajustes con referencia)
      const idsDet = [...new Set(detalle.filter(d => d.venta_id).map(d => d.venta_id))]
      let ajustes = []
      if (idsDet.length) {
        const { data: canc } = await supabase.from('ventas').select('id').in('id', idsDet).eq('estado', 'cancelada')
        ajustes = ajustesPorCancelacion(detalle, new Set((canc ?? []).map(c => c.id)), periodo.hasta)
      }
      setRes({ incluidas, excluidas, ajustes })
      setMarcadas(Object.fromEntries([...incluidas.map(i => [`i|${i.venta_id}|${i.tipo}|${i.empleado_id}`, true]), ...ajustes.map(a => [`a|${a.referencia_detalle_id}`, true])]))
    } finally { setCargando(false) }
  }

  const esquemas = qs.data ?? []
  const sinEsquema = f => !esquemaVigente(esquemas.filter(e => e.empleado_id === f.empleado_id), f.fecha)
  const filas = useMemo(() => (res ? [...res.incluidas.map(i => ({ ...i, clave: `i|${i.venta_id}|${i.tipo}|${i.empleado_id}` })), ...res.ajustes.map(a => ({ ...a, clave: `a|${a.referencia_detalle_id}` }))] : []), [res])
  const elegidas = filas.filter(f => marcadas[f.clave])
  const bloqueadas = elegidas.filter(f => f.tipo !== 'ajuste' && sinEsquema(f))

  async function registrar() {
    const payload = elegidas.map(({ clave, conceptos, ...f }) => f)
    const ok = await ejecutar(() => rpc('comisiones_registrar_detalle', { p_periodo: periodo.id, p_filas: payload }), `${payload.length} renglón(es) registrados; la comisión se recalculó`)
    if (ok) { setRes(null); qc.invalidateQueries({ queryKey: [CLAVE] }) }
  }
  const guardarAjuste = async () => {
    if (!aj.empleado_id || !aj.base || !aj.concepto?.trim()) { toast.error('Podólogo, importe y concepto son obligatorios'); return }
    const fila = { empleado_id: aj.empleado_id, fecha: periodo.hasta, tipo: 'ajuste', base: -Math.abs(Number(aj.base)) * (aj.signo === '+' ? -1 : 1), concepto: aj.concepto.trim(), referencia_detalle_id: aj.ref || null }
    const ok = await ejecutar(() => rpc('comisiones_registrar_detalle', { p_periodo: periodo.id, p_filas: [fila] }), 'Ajuste registrado')
    if (ok) setAj(null)
  }

  if (!periodo) return <EmptyState title="Elige o crea un periodo" description="La carga trabaja sobre un periodo de comisiones abierto." />
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Trae las ventas cobradas del <b>{fecha(periodo.desde)}</b> al <b>{fecha(periodo.hasta)}</b> atendidas por podólogos, con <b>ingreso validado</b>. Cada venta y tipo se registra una sola vez. Los porcentajes salen del esquema vigente a la fecha del servicio.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" disabled={!puede || !abierto || cargando || qe.isLoading} onClick={buscar}>{cargando ? 'Buscando…' : 'Buscar ventas validadas'}</button>
          <button className="btn o" disabled={!puede || !abierto} onClick={() => setAj({ signo: '-', base: '', concepto: '', ref: '' })}>Ajuste manual</button>
        </div>
        {!abierto && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>El periodo está cerrado: reábrelo (con motivo) o registra el ajuste en el periodo siguiente.</div>}
      </div>
      {res && <>
        <DataTable buscador={false} sinPaginacion filaKey="clave" filas={filas} vacio={{ title: 'Nada nuevo por comisionar', description: `Sin ventas validadas pendientes. Excluidas: ${res.excluidas.length}.` }}
          columnas={[
            { key: 'm', label: '', sortable: false, exportar: false, render: f => <input type="checkbox" checked={!!marcadas[f.clave]} onChange={e => setMarcadas(m => ({ ...m, [f.clave]: e.target.checked }))} /> },
            { key: 'fecha', label: 'Fecha', render: f => fecha(f.fecha) },
            { key: 'empleado_id', label: 'Podólogo', valor: f => nombre(f.empleado_id) },
            { key: 'tipo', label: 'Tipo', filtro: true },
            { key: 'concepto', label: 'Concepto' },
            { key: 'base', label: 'Base', align: 'right', render: f => moneda(f.base) },
            { key: 'estado', label: 'Aviso', sortable: false, render: f => (f.tipo === 'ajuste' ? <span className="bd a">Cancelación</span> : sinEsquema(f) ? <span className="bd r">Sin esquema vigente</span> : <span className="bd v">Lista</span>) },
          ]} />
        {res.excluidas.length > 0 && <details style={{ margin: '8px 0', fontSize: 12 }}><summary>{res.excluidas.length} línea(s) excluida(s)</summary>
          {Object.entries(res.excluidas.reduce((m, x) => ({ ...m, [x.motivo]: (m[x.motivo] ?? 0) + 1 }), {})).map(([k, v]) => <div key={k}>{v} × {k}</div>)}</details>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <b>{elegidas.length}</b> renglón(es) · base {moneda(elegidas.reduce((s, f) => s + f.base, 0))}
          {bloqueadas.length > 0 && <span style={{ color: 'var(--red)', fontSize: 12 }}>{bloqueadas.length} sin esquema vigente: define el esquema del podólogo primero (P-106).</span>}
          <button className="btn green" style={{ marginLeft: 'auto' }} disabled={ocupado || !elegidas.length || bloqueadas.length > 0} onClick={registrar}>Registrar en el periodo</button>
        </div>
      </>}
      <Modal open={!!aj} onClose={() => setAj(null)} size="sm" title="Ajuste manual de comisión" footer={<><button className="btn o" onClick={() => setAj(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardarAjuste}>Registrar ajuste</button></>}>
        {aj && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Podólogo" as="select" options={emps.map(e => ({ value: e.id, label: e.nombre_completo }))} value={aj.empleado_id ?? ''} onChange={e => setAj({ ...aj, empleado_id: e.target.value })} />
          <FormField label="Sentido" as="select" options={[{ value: '-', label: 'Resta (cancelación, devolución)' }, { value: '+', label: 'Suma (corrección a favor)' }]} value={aj.signo} onChange={e => setAj({ ...aj, signo: e.target.value })} />
          <FormField label="Base del ajuste (MXN, sin IVA)" type="number" step="0.01" min="0" value={aj.base} onChange={e => setAj({ ...aj, base: e.target.value })} hint="Usa el % del renglón original si lo refieres; si no, el servicio del esquema vigente." />
          <FormField label="Renglón original (opcional)" as="select" options={detalle.filter(d => d.tipo !== 'ajuste' && d.empleado_id === aj.empleado_id).map(d => ({ value: d.id, label: `${fecha(d.fecha)} · ${d.concepto ?? d.tipo} · ${moneda(d.base)}` }))} value={aj.ref} onChange={e => setAj({ ...aj, ref: e.target.value })} />
          <FormField label="Concepto" value={aj.concepto} onChange={e => setAj({ ...aj, concepto: e.target.value })} />
        </div>}
      </Modal>
    </>
  )
}
