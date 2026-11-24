// Nómina (E129/E130): periodos, prenómina, captura manual de IMSS/ISR/subsidio, autorización y exportación para el contador.
// P-104: solo prenómina y exportación; sin timbrado de nómina. Clon de TabNomina de IRP adaptado a periodos_nomina/prenomina.
import { useEffect, useMemo, useState } from 'react'
import { Calculator, CheckCircle2, Download, Plus, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import KPICard from '../../../../components/ui/KPICard'
import Modal from '../../../../components/ui/Modal'
import FormField from '../../../../components/ui/FormField'
import StatusBadge from '../../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../../components/ui/ConfirmDialog'
import { usePermiso } from '../../../../lib/permisos'
import { insertar, actualizar, borrar, rpc } from '../../../../lib/api'
import { moneda, fecha } from '../../../../lib/formato'
import { totalesPeriodo, quincenasDelMes } from '../../../../lib/plataforma/nomina'
import { useVista, Estado, useEscribir, descargarExcel, etiquetaPuesto, enmascararClabe, hoy } from '../comun'

function Celda({ valor, editable, onGuardar }) {
  const [v, setV] = useState(valor ?? 0)
  useEffect(() => setV(valor ?? 0), [valor])
  if (!editable) return moneda(valor)
  return <input type="number" step="0.01" min="0" value={v || ''} style={{ width: 82, textAlign: 'right', padding: '3px 5px' }} onChange={e => setV(e.target.value)}
    onBlur={() => { if (Number(v || 0) !== Number(valor || 0)) onGuardar(Number(v || 0)) }} />
}

export default function TabNomina() {
  const puede = usePermiso('rh.editar')
  const { ejecutar, ocupado } = useEscribir()
  const { confirmar, dialogo } = useConfirmacion()
  const [period, setPeriod] = useState('quincenal')
  const qp = useVista('nomina-periodos', 'prp_nomina_periodos', { orden: [{ columna: 'desde', asc: false }], limite: 200 }, { conSede: false })
  const periodos = (qp.data ?? []).filter(p => p.periodicidad === period)
  const [selId, setSelId] = useState(null)
  const sel = periodos.find(p => p.id === selId) ?? periodos[0] ?? null
  const qn = useVista(['prenomina', sel?.id], 'prp_prenomina', { filtros: { periodo_id: sel?.id }, orden: [{ columna: 'nombre_completo' }], limite: 500 }, { habilitado: !!sel, conSede: false })
  const [nuevo, setNuevo] = useState(null)
  const filas = sel ? qn.data ?? [] : []
  const bloqueado = !sel || ['autorizada', 'pagada'].includes(sel.estado)
  const tot = useMemo(() => totalesPeriodo(filas), [filas])

  const crear = async () => {
    if (!nuevo.desde || !nuevo.hasta || nuevo.hasta < nuevo.desde) { toast.error('Fechas inválidas'); return }
    const ok = await ejecutar(() => insertar('periodos_nomina', { periodicidad: nuevo.periodicidad, desde: nuevo.desde, hasta: nuevo.hasta, fecha_pago: nuevo.fecha_pago || null }), 'Periodo creado')
    if (ok) setNuevo(null)
  }
  const sugerir = () => {
    const d = new Date(`${hoy()}T00:00:00Z`)
    const [q1, q2] = quincenasDelMes(d.getUTCFullYear(), d.getUTCMonth() + 1)
    const p = d.getUTCDate() <= 15 ? q1 : q2
    setNuevo({ periodicidad: period, ...p, fecha_pago: p.hasta })
  }
  const calcular = () => ejecutar(() => rpc('nomina_calcular_periodo', { p_periodo: sel.id }), 'Prenómina calculada (comisiones cerradas, asistencia e incidencias)')
  const autorizar = async () => {
    if (await confirmar({ titulo: 'Autorizar nómina', mensaje: `Se congelan los montos del periodo ${fecha(sel.desde)} – ${fecha(sel.hasta)} (${moneda(tot.neto)} netos) y las incidencias descontadas quedan aplicadas. No se podrá recalcular.`, textoConfirmar: 'Autorizar' }))
      ejecutar(() => rpc('nomina_autorizar_periodo', { p_periodo: sel.id }), 'Nómina autorizada; los recibos ya están disponibles')
  }
  const pagar = async () => { if (await confirmar({ titulo: 'Marcar como pagada', mensaje: 'Confirma que el pago ya se dispersó.', textoConfirmar: 'Marcar pagada' })) ejecutar(() => rpc('nomina_marcar_pagada', { p_periodo: sel.id }), 'Nómina pagada') }
  const eliminar = async () => { if (await confirmar({ titulo: 'Eliminar periodo', mensaje: 'Solo se eliminan periodos sin calcular.', peligro: true, textoConfirmar: 'Eliminar' })) ejecutar(() => borrar('periodos_nomina', sel.id), 'Periodo eliminado') }
  const editar = (r, campo) => v => ejecutar(() => actualizar('prenomina', r.id, { [campo]: v }), null)
  const exportar = () => descargarExcel(`prenomina_${sel.desde}_${sel.hasta}`, [
    { nombre: 'Prenómina', columnas: ['No.', 'Empleado', 'Puesto', 'Esquema', 'Banco', 'CLABE', 'Días trabajados', 'Salario', 'Comisión', 'Bono', 'Subsidio', 'Percepción total', 'Desc. incidencias', 'IMSS', 'ISR', 'Otras deducciones', 'Deducción total', 'Neto'],
      filas: filas.map(r => [r.numero_empleado, r.nombre_completo, etiquetaPuesto(r.puesto), r.esquema_contratacion, r.banco ?? '', r.clabe ?? '', r.dias_trabajados, r.salario_periodo, r.comision, r.bono, r.subsidio, r.percepcion_total, r.desc_incidencias, r.imss, r.isr, r.otras_deducciones, r.deduccion_total, r.neto]) },
    { nombre: 'Resumen', columnas: ['Periodo', 'Periodicidad', 'Estado', 'Empleados', 'Percepciones', 'Deducciones', 'Neto', 'Fecha de pago'],
      filas: [[`${sel.desde} a ${sel.hasta}`, sel.periodicidad, sel.estado, tot.empleados, tot.percepciones, tot.deducciones, tot.neto, sel.fecha_pago ?? '']] },
  ], 'nomina')

  return (
    <>
      <div className="toolbar">
        <FormField label="Periodicidad" as="select" options={[{ value: 'semanal', label: 'Semanal' }, { value: 'quincenal', label: 'Quincenal' }, { value: 'mensual', label: 'Mensual' }]} value={period} onChange={e => { setPeriod(e.target.value); setSelId(null) }} style={{ maxWidth: 150 }} />
        <FormField label="Periodo" as="select" placeholder="Sin periodos" options={periodos.map(p => ({ value: p.id, label: `${fecha(p.desde)} – ${fecha(p.hasta)} · ${p.estado}` }))} value={sel?.id ?? ''} onChange={e => setSelId(e.target.value)} style={{ maxWidth: 320 }} />
        {sel && <StatusBadge estado={sel.estado} />}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {puede && <button className="btn o sm" onClick={sugerir}><Plus size={12} style={{ verticalAlign: -2 }} /> Crear periodo</button>}
          {puede && sel && !bloqueado && <button className="btn sm" disabled={ocupado} onClick={calcular}><Calculator size={12} style={{ verticalAlign: -2 }} /> Calcular</button>}
          {puede && sel?.estado === 'calculada' && <button className="btn green sm" disabled={ocupado} onClick={autorizar}><CheckCircle2 size={12} style={{ verticalAlign: -2 }} /> Autorizar nómina</button>}
          {puede && sel?.estado === 'autorizada' && <button className="btn green sm" disabled={ocupado} onClick={pagar}><Wallet size={12} style={{ verticalAlign: -2 }} /> Marcar pagada</button>}
          {puede && sel?.estado === 'creado' && <button className="btn o sm" onClick={eliminar}>Eliminar</button>}
          {sel && <button className="btn o sm" disabled={!filas.length} onClick={exportar}><Download size={12} style={{ verticalAlign: -2 }} /> Exportar para el contador</button>}
        </div>
      </div>
      <Estado q={qp} esVacio={() => !periodos.length} vacio={{ title: 'Sin periodos de nómina', description: puede ? 'Crea el primer periodo y calcula la prenómina.' : 'Aún no hay periodos.' }}>
        {sel && <>
          <div className="grid-kpis">
            <KPICard title="Empleados" value={tot.empleados} loading={qn.isLoading} />
            <KPICard title="Percepciones" value={moneda(tot.percepciones)} loading={qn.isLoading} />
            <KPICard title="Deducciones" value={moneda(tot.deducciones)} color="var(--red)" loading={qn.isLoading} />
            <KPICard title="Neto a pagar" value={moneda(tot.neto)} color="var(--green)" subtitle={sel.fecha_pago ? `Pago ${fecha(sel.fecha_pago)}` : 'Sin fecha de pago'} loading={qn.isLoading} />
          </div>
          <Estado q={qn} esVacio={d => !d.length} vacio={{ title: 'Prenómina vacía', description: sel.estado === 'creado' ? 'Pulsa «Calcular» para generar los renglones.' : 'Sin renglones.' }}>
            <div className="card" style={{ padding: 0 }}><div className="tabla-wrap"><table>
              <thead><tr><th>Empleado</th><th>Puesto</th><th>Banco / CLABE</th><th className="num">Días</th><th className="num">Salario</th><th className="num">Comisión</th><th className="num">Bono</th><th className="num">Subsidio</th><th className="num">Percepción</th><th className="num">Desc. incid.</th><th className="num">IMSS</th><th className="num">ISR</th><th className="num">Otras</th><th className="num">Neto</th><th>CFDI</th></tr></thead>
              <tbody>
                {filas.map(r => (
                  <tr key={r.id}><td><b>{r.nombre_completo}</b></td><td>{etiquetaPuesto(r.puesto)}</td><td>{r.banco ?? '—'} {enmascararClabe(r.clabe, false)}</td>
                    <td className="num">{r.dias_trabajados}</td><td className="num">{moneda(r.salario_periodo)}</td><td className="num">{r.comision > 0 ? moneda(r.comision) : '—'}</td>
                    <td className="num">{moneda(r.bono)}</td>
                    <td className="num"><Celda valor={r.subsidio} editable={puede && !bloqueado} onGuardar={editar(r, 'subsidio')} /></td>
                    <td className="num">{moneda(r.percepcion_total)}</td><td className="num">{r.desc_incidencias > 0 ? moneda(r.desc_incidencias) : '—'}</td>
                    <td className="num"><Celda valor={r.imss} editable={puede && !bloqueado} onGuardar={editar(r, 'imss')} /></td>
                    <td className="num"><Celda valor={r.isr} editable={puede && !bloqueado} onGuardar={editar(r, 'isr')} /></td>
                    <td className="num"><Celda valor={r.otras_deducciones} editable={puede && !bloqueado} onGuardar={editar(r, 'otras_deducciones')} /></td>
                    <td className="num"><b>{moneda(r.neto)}</b></td><td><span className="bd n" title="Sin timbrado de nómina en esta fase (P-104)">No aplica</span></td></tr>
                ))}
              </tbody>
            </table></div></div>
          </Estado>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>IMSS, ISR y subsidio se capturan a mano (P-104: no se calculan ni se timbran). Las comisiones entran de los periodos de comisión cerrados dentro de este periodo y una sola vez (CA-18). Autorizada la nómina, los montos quedan congelados.</div>
        </>}
      </Estado>
      <Modal open={!!nuevo} onClose={() => setNuevo(null)} title="Crear periodo de nómina" size="sm" footer={<><button className="btn o" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn" disabled={ocupado} onClick={crear}>Crear</button></>}>
        {nuevo && <div style={{ display: 'grid', gap: 10 }}>
          <FormField label="Periodicidad" as="select" options={[{ value: 'semanal', label: 'Semanal' }, { value: 'quincenal', label: 'Quincenal' }, { value: 'mensual', label: 'Mensual' }]} value={nuevo.periodicidad} onChange={e => setNuevo({ ...nuevo, periodicidad: e.target.value })} />
          <FormField label="Desde" type="date" value={nuevo.desde} onChange={e => setNuevo({ ...nuevo, desde: e.target.value })} />
          <FormField label="Hasta" type="date" value={nuevo.hasta} onChange={e => setNuevo({ ...nuevo, hasta: e.target.value })} />
          <FormField label="Fecha de pago" type="date" value={nuevo.fecha_pago ?? ''} onChange={e => setNuevo({ ...nuevo, fecha_pago: e.target.value })} />
        </div>}
      </Modal>
      {dialogo}
    </>
  )
}
