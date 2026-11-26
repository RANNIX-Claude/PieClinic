// Retención de fotos de evidencia: son datos personales de empleados (quién contó, a qué hora, fotos tomadas en la tienda), así que guardarlas indefinidamente es un pasivo.
// 90 días por omisión, tope de 365 (se cambia en Configuración de auditoría). La purga NO corre sola: hoy no hay planificador; la ejecuta scripts/auditoria-purgar-fotos.mjs.
import { useNavigate } from 'react-router-dom'
import KPICard from '../../../components/ui/KPICard'
import { resumenRetencion } from '../../../lib/auditoria/reportesApi'
import { fechaHora, numero } from '../../../lib/formato'
import { usePermiso } from '../../../lib/permisos'
import { Aviso, Estado, useRpc } from './comun'

export default function Retencion() {
  const nav = useNavigate()
  const configura = usePermiso('auditoria.configurar')
  const q = useRpc(['ctl-retencion'], resumenRetencion)
  const d = q.data
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Estado q={q} />
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <KPICard title="Retención configurada" value={`${d.retencion_dias} días`} subtitle={`Tope del sistema: ${d.tope_dias} días`} />
            <KPICard title="Fotos de evidencia" value={numero(d.fotos_total)} subtitle={`${numero(d.fotos_purgadas)} ya purgada(s)`} />
            <KPICard title="Vencidas por purgar" color={d.por_purgar_ahora ? 'var(--gold)' : 'var(--green)'} value={numero(d.por_purgar_ahora)} subtitle="Pasaron su plazo de retención" />
            <KPICard title="Vencen en 7 días" value={numero(d.vencen_en_7_dias)} subtitle={d.mas_antigua ? `La más antigua vigente: ${fechaHora(d.mas_antigua)}` : 'Sin fotos vigentes'} />
          </div>
          <div className="card" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            <div><b>Última purga:</b> {d.ultima_purga ? fechaHora(d.ultima_purga) : 'nunca'}</div>
            <div>{d.nota}</div>
            <div className="hint">Para purgar a mano: <code>node scripts/auditoria-purgar-fotos.mjs qa</code> (simulacro) y luego con <code>--ejecutar</code>. No se purga la foto adjunta a un caso abierto ni la última de cada toma fija.</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {d.por_sucursal.map(s => <span key={s.sucursal_id} className="bd n">{s.sucursal}: {s.retencion_dias} días</span>)}
            </div>
            {configura && <div><button type="button" className="btn o sm" onClick={() => nav('/auditoria/configuracion')}>Cambiar la retención (Configuración)</button></div>}
          </div>
          <Aviso>La fila de cada evidencia y su huella (hash) se conservan al purgar, para seguir detectando fotos repetidas; solo se borra el archivo.</Aviso>
        </>
      )}
    </div>
  )
}
