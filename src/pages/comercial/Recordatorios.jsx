// Configuración de recordatorios y notificaciones + cola de mensajes (prp_recordatorios). Mensajería SIMULADA: sin proveedor.
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { actualizar, rpc } from '../../lib/api'
import { fechaHora } from '../../lib/formato'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import FormField from '../../components/ui/FormField'
import Tabs from '../../components/ui/Tabs'
import { CANALES, TIPOS_RECORDATORIO, PLANTILLAS, redactar, MENSAJERIA_AVISO } from '../../lib/adaptadores/mensajeria'
import { param } from '../../lib/comercial/anticipo'
import { useLeer, AvisoError, BannerSimulado, ejecutar, textoError } from './componentes/comun'

export default function Recordatorios() {
  const { organizacion, recargarPerfil } = useApp()
  const qc = useQueryClient()
  const puedeConfig = usePermiso('configuracion.editar')
  const puedeEnviar = usePermiso('agenda.editar')
  const [tab, setTab] = useState('cola')
  const p = organizacion?.parametros ?? {}
  const [cfg, setCfg] = useState({})
  useEffect(() => {
    setCfg({
      horas: String(p.recordatorio_horas_antes ?? 24), segundoActivo: !!p.recordatorio_segundo_activo, segundoHoras: String(p.recordatorio_segundo_horas ?? 2), canal: p.recordatorio_canal ?? 'correo',
      aviso: String(param(p, 'cancelacion_horas_aviso')), ventana: String(param(p, 'lista_espera_ventana_min')), vence: String(param(p, 'lista_espera_vence_dias')), tolerancia: String(param(p, 'tolerancia_no_asistio_min')),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizacion?.id])
  const set = (k, v) => setCfg(x => ({ ...x, [k]: v }))
  const cola = useLeer('recordatorios', 'prp_recordatorios', { orden: { columna: 'programado_para', asc: false }, limite: 300 })

  const guardar = async () => {
    const nuevos = { ...p, recordatorio_horas_antes: Number(cfg.horas), recordatorio_segundo_activo: cfg.segundoActivo, recordatorio_segundo_horas: Number(cfg.segundoHoras), recordatorio_canal: cfg.canal,
      cancelacion_horas_aviso: Number(cfg.aviso), lista_espera_ventana_min: Number(cfg.ventana), lista_espera_vence_dias: Number(cfg.vence), tolerancia_no_asistio_min: Number(cfg.tolerancia) }
    if (Object.values(nuevos).some(v => typeof v === 'number' && !(v >= 0))) return toast.error('Revisa los números')
    if (await ejecutar(actualizar('organizaciones', organizacion.id, { parametros: nuevos }), 'Parámetros guardados')) { recargarPerfil?.(); qc.invalidateQueries({ queryKey: ['comercial'] }) }
  }
  const reenviar = async r => {
    const { error } = await rpc('reenviar_recordatorio', { p_cita: r.cita_id, p_canal: r.canal })
    if (error) toast.error(textoError(error)); else { toast.success('Reprogramado en la cola (envío simulado)'); cola.refetch() }
  }
  const n = e => cola.filas.filter(r => r.estado === e).length

  return (
    <div className="pagina">
      <PageHeader titulo="Recordatorios y notificaciones" subtitulo="Agenda › Recordatorios · cola de mensajes y reglas de la clínica" />
      <BannerSimulado texto={MENSAJERIA_AVISO} />
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Programados" value={n('programado')} color="var(--gold)" loading={cola.cargando} />
        <KPICard title="Enviados" value={n('enviado') + n('entregado') + n('respondido')} color="var(--green)" loading={cola.cargando} />
        <KPICard title="Fallidos" value={n('fallido')} color="var(--red)" loading={cola.cargando} />
        <KPICard title="Omitidos / cancelados" value={n('omitido') + n('cancelado')} loading={cola.cargando} />
      </div>
      <Tabs items={[{ id: 'cola', label: 'Cola de mensajes' }, { id: 'reglas', label: 'Reglas' }, { id: 'plantillas', label: 'Plantillas' }]} value={tab} onChange={setTab} />
      <div style={{ marginTop: 10 }}>
        {tab === 'cola' && (
          <div className="card" style={{ padding: 0 }}>
            <AvisoError error={cola.error} />
            <DataTable cargando={cola.cargando} filas={cola.filas} exportarNombre="recordatorios" vacio={{ title: 'Sin mensajes en la cola', description: 'Al agendar citas se programan los recordatorios según las reglas.' }}
              columnas={[
                { key: 'tipo', label: 'Tipo', render: r => TIPOS_RECORDATORIO[r.tipo] ?? r.tipo, valor: r => TIPOS_RECORDATORIO[r.tipo] ?? r.tipo, filtro: true },
                { key: 'paciente_nombre', label: 'Paciente' }, { key: 'cita_folio', label: 'Cita' }, { key: 'canal', label: 'Canal', render: r => CANALES[r.canal] ?? r.canal, valor: r => CANALES[r.canal], filtro: true },
                { key: 'destino', label: 'Destino' }, { key: 'programado_para', label: 'Programado', render: r => fechaHora(r.programado_para), valor: r => r.programado_para },
                { key: 'enviado_en', label: 'Enviado', render: r => (r.enviado_en ? fechaHora(r.enviado_en) : '—') },
                { key: 'estado', label: 'Estado', render: r => <StatusBadge estado={r.estado} />, filtro: true }, { key: 'error', label: 'Error' },
                { key: 'acc', label: '', sortable: false, exportar: false, render: r => puedeEnviar && r.cita_id && ['fallido', 'omitido', 'cancelado'].includes(r.estado) && <button className="btn o" onClick={() => reenviar(r)}>Reenviar</button> },
              ]} />
          </div>
        )}
        {tab === 'reglas' && (
          <div className="card">
            <div className="grid2">
              <FormField label="Primer aviso: horas antes de la cita" type="number" min="1" value={cfg.horas ?? ''} onChange={e => set('horas', e.target.value)} disabled={!puedeConfig} />
              <FormField label="Canal por defecto" as="select" value={cfg.canal ?? 'correo'} onChange={e => set('canal', e.target.value)} disabled={!puedeConfig} options={Object.entries(CANALES).map(([value, label]) => ({ value, label }))} />
            </div>
            <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!cfg.segundoActivo} disabled={!puedeConfig} onChange={e => set('segundoActivo', e.target.checked)} /> Segundo aviso</label>
            {cfg.segundoActivo && <FormField label="Segundo aviso: horas antes" type="number" min="1" value={cfg.segundoHoras ?? ''} onChange={e => set('segundoHoras', e.target.value)} disabled={!puedeConfig} />}
            <div className="grid2" style={{ marginTop: 10 }}>
              <FormField label="Cancelación sin costo: horas de aviso" type="number" min="0" value={cfg.aviso ?? ''} onChange={e => set('aviso', e.target.value)} disabled={!puedeConfig} hint="Fuera de plazo el anticipo no se reembolsa (P-033)" />
              <FormField label="Tolerancia para «No asistió» (min)" type="number" min="0" value={cfg.tolerancia ?? ''} onChange={e => set('tolerancia', e.target.value)} disabled={!puedeConfig} />
              <FormField label="Lista de espera: ventana por notificado (min)" type="number" min="1" value={cfg.ventana ?? ''} onChange={e => set('ventana', e.target.value)} disabled={!puedeConfig} />
              <FormField label="Lista de espera: vence a los (días)" type="number" min="1" value={cfg.vence ?? ''} onChange={e => set('vence', e.target.value)} disabled={!puedeConfig} />
            </div>
            {puedeConfig ? <button className="btn" onClick={guardar}>Guardar reglas</button> : <div className="text-muted" style={{ fontSize: 12.5 }}>Solo el Administrador modifica las reglas.</div>}
          </div>
        )}
        {tab === 'plantillas' && (
          <div className="card">
            <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Textos por defecto (vista previa con datos de ejemplo). Los mensajes de WhatsApp se abren en wa.me con este texto para envío manual.</div>
            {Object.keys(PLANTILLAS).map(t => (
              <div key={t} style={{ marginBottom: 10 }}><b style={{ fontSize: 13 }}>{TIPOS_RECORDATORIO[t]}</b>
                <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>{redactar(t, { nombre: 'María', fecha: 'jueves 29 de octubre', hora: '11:30', sede: 'Sede Centro', liga: 'https://…/app/cita/ABC123', monto: '$200.00', minutos: 30 })}</div></div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
