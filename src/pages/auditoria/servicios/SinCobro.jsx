// Atenciones sin cobro por sucursal y por persona (SOLO dueño y supervisor; el servidor responde PF403 a cualquier otro rol). Es un INDICADOR PARA INVESTIGAR:
// una atención sin ticket puede ser un cobro pendiente, una consulta sin cargo o un olvido de captura; el sistema no acusa a nadie.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import DataTable from '../../../components/ui/DataTable'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import KPICard from '../../../components/ui/KPICard'
import { fechaHora, hoyISO } from '../../../lib/formato'
import { repAtencionesSinCobro, evaluarServicios } from '../../../lib/auditoria/serviciosApi'
import { horasMinutos } from '../../../lib/auditoria/servicios'
import { errMsg } from '../comun'
import { desdeHace } from './fechas'

const pct = v => (v == null ? '—' : `${v}%`)

export default function SinCobro() {
  const { sedes } = useApp()
  const qc = useQueryClient()
  const [f, setF] = useState({ desde: desdeHace(29), hasta: hoyISO(), sucursal: '' })
  const q = useQuery({ queryKey: ['ctl-sin-cobro', f], queryFn: async () => { const r = await repAtencionesSinCobro({ desde: f.desde, hasta: f.hasta, sucursal: f.sucursal || null }); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })
  const evaluar = async () => {
    const r = await evaluarServicios()
    if (r.error) return toast.error(errMsg(r.error))
    toast.success(`Alertas nuevas: ${r.data.alertas_atencion_nuevas} de atenciones sin ticket · ${r.data.atenciones_ligadas} atención(es) ligada(s)`)
    qc.invalidateQueries({ queryKey: ['ctl-sin-cobro'] })
  }
  const d = q.data
  const colsAgrupadas = (clave, etiqueta) => [
    { key: clave, label: etiqueta, filtro: true },
    { key: 'atenciones', label: 'Atenciones', align: 'right' },
    { key: 'con_ticket', label: 'Con ticket', align: 'right' },
    { key: 'abiertas_sin_ticket', label: 'Abiertas sin ticket', align: 'right', render: x => (x.abiertas_sin_ticket ? <b className="text-red">{x.abiertas_sin_ticket}</b> : '0') },
    { key: 'canceladas', label: 'Canceladas', align: 'right' },
    { key: 'en_curso', label: 'En curso', align: 'right' },
    { key: 'pct_sin_ticket', label: '% sin ticket', align: 'right', render: x => <>{pct(x.pct_sin_ticket)}{x.muestra_pequena && <span className="hint" title="Menos de 10 atenciones: muestra pequeña"> *</span>}</> },
  ]
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <FormField label="Desde" type="date" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} />
        <FormField label="Hasta" type="date" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} />
        <FormField label="Sucursal" as="select" placeholder="Todas" value={f.sucursal} onChange={e => setF({ ...f, sucursal: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <button className="btn o" onClick={evaluar} title="Liga las atenciones ya cobradas y crea las alertas de las que llevan demasiado tiempo abiertas"><Bell size={14} style={{ verticalAlign: -2 }} /> Evaluar y avisar</button>
      </div>
      {q.isLoading && <div className="card">Cargando…</div>}
      {q.isError && <div className="card">{q.error.message}</div>}
      {d && <>
        <div className="hint" style={{ marginBottom: 10 }}>{d.aviso}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <KPICard title="Atenciones" value={d.resumen.atenciones} />
          <KPICard title="Con ticket" value={d.resumen.con_ticket} color="var(--green, #2e8b57)" />
          <KPICard title="Abiertas sin ticket" value={d.resumen.abiertas_sin_ticket} color="var(--red, #c0392b)" />
          <KPICard title="Canceladas" value={d.resumen.canceladas} color="var(--amber, #d4900a)" />
          <KPICard title="% sin ticket" value={pct(d.resumen.pct_sin_ticket)} subtitle="no cuenta las que siguen en curso" />
        </div>
        <h3>Por sucursal</h3>
        <DataTable columnas={colsAgrupadas('sucursal', 'Sucursal')} filas={d.por_sucursal} filaKey="sucursal_id" buscador={false} sinPaginacion vacio={{ title: 'Sin atenciones', description: 'No hay atenciones en el periodo.' }} />
        <h3 style={{ marginTop: 16 }}>Por persona que atiende</h3>
        <DataTable columnas={colsAgrupadas('persona', 'Persona')} filas={d.por_persona} filaKey="persona_id" exportarNombre="atenciones-sin-cobro-por-persona" vacio={{ title: 'Sin atenciones', description: 'No hay atenciones en el periodo.' }} />
        <div className="hint" style={{ margin: '4px 0 12px' }}>* Muestra pequeña (menos de 10 atenciones): una sola atención mueve el porcentaje; úselo como pista, no como conclusión.</div>
        <h3>Detalle para investigar</h3>
        <DataTable filaKey="id" exportarNombre="atenciones-sin-ticket" filas={d.detalle} vacio={{ title: 'Nada que investigar', description: 'No hay atenciones abiertas sin ticket ni canceladas.' }}
          columnas={[
            { key: 'inicio_en', label: 'Inicio', render: x => fechaHora(x.inicio_en), valor: x => x.inicio_en },
            { key: 'sucursal', label: 'Sucursal', filtro: true }, { key: 'atiende', label: 'Atiende', filtro: true }, { key: 'servicio', label: 'Servicio' }, { key: 'paciente_ref', label: 'Ref.' },
            { key: 'clase', label: 'Situación', render: x => <StatusBadge variante={x.clase === 'vencida' ? 'r' : 'n'} label={x.clase === 'vencida' ? `Abierta ${horasMinutos(x.minutos)}` : 'Cancelada'} />, valor: x => x.clase },
            { key: 'motivo', label: 'Motivo / autorizó', render: x => (x.motivo ? `${x.motivo} · ${x.autorizo}` : '—') },
          ]} />
      </>}
    </>
  )
}
