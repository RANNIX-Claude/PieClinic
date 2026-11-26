// Ocupación del puesto de atención · FASE POSTERIOR AL PILOTO. No hay hardware ni sensores conectados: aquí solo hay registro manual (fuente «manual») y el cruce
// diario ocupaciones contra tickets de servicio, para tener lista la tabla y el cálculo el día que se instale el sensor.
//   Sensor recomendado: celdas de carga bajo el sillón con un ESP32 (unos 15 a 20 USD en partes): señal inequívoca, no graba nada y no tiene implicaciones de
//   privacidad. Una cámara apuntada al sillón queda DESCARTADA: un paciente descalzo recibiendo un procedimiento, grabado, no vale el riesgo cuando un sensor da el mismo dato.
//   Contar cruces de puerta no sirve: el podólogo entra y sale varias veces. Hay que medir la ocupación del sillón.
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import DataTable from '../../../components/ui/DataTable'
import FormField from '../../../components/ui/FormField'
import KPICard from '../../../components/ui/KPICard'
import { fechaHora, hoyISO } from '../../../lib/formato'
import { registrarOcupacion, cruceOcupacionServidor } from '../../../lib/auditoria/serviciosApi'
import { duracionMin, horasMinutos } from '../../../lib/auditoria/servicios'
import { errMsg } from '../comun'
import { desdeHace } from './fechas'

export default function Ocupacion() {
  const { sedes, sedeActivaId } = useApp()
  const revisa = usePermiso('auditoria.investigar')
  return (
    <>
      <div className="card" style={{ borderLeft: '4px solid var(--amber, #d4900a)', marginBottom: 12 }}>
        <b><Clock size={14} style={{ verticalAlign: -2 }} /> Fase posterior al piloto.</b> Todavía no hay sensor conectado: las ocupaciones se registran a mano. El sensor recomendado son
        <b> celdas de carga bajo el sillón con un ESP32</b> (15 a 20 USD, no graba nada); <b>una cámara apuntada al sillón queda descartada</b> por privacidad.
      </div>
      <Registro sedes={sedes} sucursalInicial={sedeActivaId} />
      {revisa && <Cruce sedes={sedes} />}
    </>
  )
}

function Registro({ sedes, sucursalInicial }) {
  const qc = useQueryClient()
  const hoy = hoyISO()
  const [f, setF] = useState({ sucursalId: sucursalInicial || sedes[0]?.id || '', dia: hoy, desde: '09:00', hasta: '09:30', puesto: 'Sillón 1' })
  const [ocupado, setOcupado] = useState(false)
  const instante = hhmm => new Date(`${f.dia}T${hhmm}:00`).toISOString()   // hora local del dispositivo; el servidor valida el rango con su reloj
  const min = f.desde && f.hasta && f.dia ? duracionMin(instante(f.desde), instante(f.hasta)) : 0
  async function guardar() {
    setOcupado(true)
    const r = await registrarOcupacion({ sucursalId: f.sucursalId, inicio: instante(f.desde), fin: instante(f.hasta), puestoNombre: f.puesto })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error))
    toast.success(`Ocupación registrada (${horasMinutos(r.data.duracion_min)})`); qc.invalidateQueries({ queryKey: ['ctl-ocupacion-cruce'] })
  }
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Registrar una ocupación (manual)</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <FormField label="Sucursal" as="select" value={f.sucursalId} onChange={e => setF({ ...f, sucursalId: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Puesto" value={f.puesto} onChange={e => setF({ ...f, puesto: e.target.value })} maxLength={60} />
        <FormField label="Día" type="date" max={hoy} value={f.dia} onChange={e => setF({ ...f, dia: e.target.value })} />
        <FormField label="De" type="time" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} />
        <FormField label="A" type="time" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} />
        <button className="btn" disabled={ocupado || !f.sucursalId || !(min > 0)} onClick={guardar}>Registrar</button>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Duración: {min > 0 ? horasMinutos(min) : '—'}. El servidor calcula la duración, rechaza horas futuras y traslapes, y no se puede corregir después: si se equivocó, avise al dueño.</div>
    </div>
  )
}

function Cruce({ sedes }) {
  const [f, setF] = useState({ desde: desdeHace(6), hasta: hoyISO(), sucursal: '' })
  const q = useQuery({
    queryKey: ['ctl-ocupacion-cruce', f], retry: false,
    queryFn: async () => { const r = await cruceOcupacionServidor({ desde: f.desde, hasta: f.hasta, sucursal: f.sucursal || null }); if (r.error) throw new Error(errMsg(r.error)); return r.data },
  })
  const d = q.data
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Cruce diario: ocupaciones contra tickets de servicio</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <FormField label="Desde" type="date" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} />
        <FormField label="Hasta" type="date" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} />
        <FormField label="Sucursal" as="select" placeholder="Todas" value={f.sucursal} onChange={e => setF({ ...f, sucursal: e.target.value })} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      </div>
      {q.isLoading && <div>Calculando…</div>}
      {q.isError && <div>{q.error.message}</div>}
      {d && <>
        <div className="hint" style={{ marginBottom: 8 }}>{d.aviso}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <KPICard title="Ocupaciones" value={d.resumen.ocupaciones} /><KPICard title="Tickets de servicio" value={d.resumen.tickets_servicio} />
          <KPICard title="Cobros faltantes" value={d.resumen.cobros_faltantes} color="var(--red, #c0392b)" subtitle="ocupaciones sin ticket" />
        </div>
        <DataTable exportarNombre="cruce-ocupacion" buscador={false} filas={d.dias.map(x => ({ ...x, id: `${x.fecha}${x.sucursal_id}` }))}
          vacio={{ title: 'Sin ocupaciones ni tickets', description: 'No hay datos en el periodo.' }}
          columnas={[
            { key: 'fecha', label: 'Día' }, { key: 'sucursal', label: 'Sucursal', filtro: true },
            { key: 'ocupaciones', label: 'Ocupaciones', align: 'right' }, { key: 'tickets_servicio', label: 'Tickets', align: 'right' },
            { key: 'cobros_faltantes', label: 'Cobros faltantes', align: 'right', render: x => (x.cobros_faltantes ? <b className="text-red">{x.cobros_faltantes}</b> : '0') },
            { key: 'tickets_sin_ocupacion', label: 'Tickets sin ocupación', align: 'right' },
            { key: 'faltantes', label: 'Horas exactas de lo que falta', sortable: false, exportar: false,
              render: x => (x.faltantes.length ? x.faltantes.map(o => <div key={o.ocupacion_id} className="hint">{fechaHora(o.inicio_en)} → {fechaHora(o.fin_en)} ({horasMinutos(o.duracion_min)}){o.puesto ? ` · ${o.puesto}` : ''}</div>) : '—') },
          ]} />
        <div className="hint" style={{ marginTop: 6 }}>Solo cuentan las ocupaciones de al menos la duración mínima configurada (5 min por omisión) y cada ocupación toma el ticket de servicio más cercano dentro de la ventana configurada.</div>
      </>}
    </div>
  )
}
