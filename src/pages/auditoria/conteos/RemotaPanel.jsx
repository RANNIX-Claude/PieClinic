// Auditoría remota (F2.3). El dueño elige sucursales (por omisión TODAS; «una sola» es la excepción y pide motivo), el tamaño de la muestra y el
// tiempo límite, y lanza. Aquí mismo ve el avance en vivo: quién abrió, partidas capturadas, tiempo transcurrido y expiradas. Jamás diferencias.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Radio } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { avanceRemota, lanzarRemota, listarRemotas } from '../../../lib/auditoria/conteoApi'
import { validarMuestra, TOPE_MUESTRA, puedeLanzarRemota } from '../../../lib/auditoria/conteoModos'
import { NOMBRE_RESPUESTA, VARIANTE_RESPUESTA, formatoDuracion, porcentajeAvance, resumenFrase, hayPendientes } from '../../../lib/auditoria/remotaAvance'
import { mensajeError } from '../../../lib/auditoria/roles'
import { fechaHora } from '../../../lib/formato'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'

export default function RemotaPanel({ rolAud }) {
  const qc = useQueryClient()
  const { sedes } = useApp()
  const { confirmar, dialogo } = useConfirmacion()
  const [grupo, setGrupo] = useState(null)
  const [todas, setTodas] = useState(true)               // «todas a la vez» es el camino fácil
  const [elegidas, setElegidas] = useState([])
  const [muestra, setMuestra] = useState('')
  const [limite, setLimite] = useState('')
  const [recientes, setRecientes] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const puedeLanzar = puedeLanzarRemota(rolAud)

  const grupos = useQuery({ queryKey: ['ctl-remotas'], queryFn: async () => { const r = await listarRemotas(10); if (r.error) throw new Error(mensajeError(r.error)); return r.data ?? [] }, retry: false })
  const av = useQuery({
    queryKey: ['ctl-remota-avance', grupo],
    queryFn: async () => { const r = await avanceRemota(grupo); if (r.error) throw new Error(mensajeError(r.error)); return r.data },
    refetchInterval: q => (q.state.data && !hayPendientes(q.state.data) ? 30000 : 5000),   // avance en vivo mientras haya sucursales pendientes
    retry: false,
  })
  const unaSola = !todas && elegidas.length === 1 && sedes.length > 1
  const errMuestra = muestra !== '' ? validarMuestra(muestra) : { ok: true }

  const lanzar = async () => {
    if (!todas && elegidas.length === 0) return toast.error('Elige al menos una sucursal, o déjalas todas.')
    if (!errMuestra.ok) return toast.error(errMuestra.error)
    if (unaSola && motivo.trim().length < 3) return toast.error('Lanzar a una sola sucursal es la excepción: escribe el motivo.')
    const ok = await confirmar({
      titulo: 'Lanzar auditoría remota',
      mensaje: `Se pedirá a ${todas ? 'TODAS las sucursales' : `${elegidas.length} sucursal(es)`} contar una muestra${muestra ? ` de ${muestra}` : ''} con límite de ${limite || 'los minutos configurados'} min. Cada sucursal recibe su propia lista aleatoria; el servidor la elige.`,
      textoConfirmar: 'Lanzar',
    })
    if (!ok) return
    setOcupado(true)
    const r = await lanzarRemota({ sucursales: todas ? null : elegidas, muestra: muestra === '' ? null : Number(muestra), limiteMin: limite === '' ? null : Number(limite), incluirRecientes: recientes, motivo: unaSola ? motivo.trim() : null })
    setOcupado(false)
    if (r.error) return toast.error(mensajeError(r.error))
    toast.success(`Auditoría lanzada a ${r.data.sesiones.length} sucursal(es)${r.data.omitidas?.length ? ` · ${r.data.omitidas.length} omitida(s)` : ''}`)
    setGrupo(r.data.grupo_id)
    qc.invalidateQueries({ queryKey: ['ctl-remotas'] }); qc.invalidateQueries({ queryKey: ['ctl-remota-avance'] }); qc.invalidateQueries({ queryKey: ['ctl-sesiones'] })
  }

  const d = av.data
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {puedeLanzar && (
        <div className="card" style={{ maxWidth: 720 }}>
          <h3 style={{ marginTop: 0 }}><Radio size={16} style={{ verticalAlign: -2 }} /> Lanzar auditoría remota</h3>
          <div style={{ marginBottom: 8, fontSize: 13 }}>
            <label style={{ marginRight: 14 }}><input type="radio" checked={todas} onChange={() => setTodas(true)} /> <b>Todas las sucursales</b> (recomendado)</label>
            <label><input type="radio" checked={!todas} onChange={() => setTodas(false)} /> Elegir sucursales</label>
          </div>
          {!todas && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '6px 0 10px' }}>
              {sedes.map(s => (
                <label key={s.id} style={{ fontSize: 13 }}><input type="checkbox" checked={elegidas.includes(s.id)} onChange={e => setElegidas(x => (e.target.checked ? [...x, s.id] : x.filter(i => i !== s.id)))} /> {s.nombre}</label>
              ))}
            </div>
          )}
          {unaSola && <FormField label="Motivo (lanzar a una sola es la excepción: permite que las tiendas se presten mercancía)" value={motivo} onChange={e => setMotivo(e.target.value)} />}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <FormField label={`Muestra por sucursal (tope ${TOPE_MUESTRA})`} type="number" min="1" max={TOPE_MUESTRA} value={muestra} onChange={e => setMuestra(e.target.value)} placeholder="Configuración" error={errMuestra.ok ? undefined : errMuestra.error} style={{ flex: 1, minWidth: 160 }} />
            <FormField label="Tiempo límite (min)" type="number" min="1" value={limite} onChange={e => setLimite(e.target.value)} placeholder="Configuración (120)" style={{ flex: 1, minWidth: 160 }} />
          </div>
          <label style={{ display: 'block', fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={recientes} onChange={e => setRecientes(e.target.checked)} /> Incluir productos contados en las últimas 24 h</label>
          <button className="btn" style={{ minHeight: 44 }} disabled={ocupado || !errMuestra.ok} onClick={lanzar}>{ocupado ? 'Lanzando…' : 'Lanzar auditoría'}</button>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Avance en vivo</h3>
          {(grupos.data ?? []).length > 0 && (
            <select value={grupo ?? ''} onChange={e => setGrupo(e.target.value || null)} aria-label="Auditoría">
              <option value="">La más reciente</option>
              {grupos.data.map(g => <option key={g.grupo_id} value={g.grupo_id}>{fechaHora(g.lanzada_en)} · {g.sucursales} suc.</option>)}
            </select>
          )}
        </div>
        {av.isLoading && <div style={{ padding: 12 }}>Cargando…</div>}
        {av.isError && <div style={{ padding: 12 }}>{av.error.message}</div>}
        {d && !d.grupo_id && <div style={{ padding: 12 }}>Aún no se ha lanzado ninguna auditoría remota.</div>}
        {d?.grupo_id && (
          <>
            <div style={{ margin: '8px 0', fontSize: 14 }}>{resumenFrase(d)} · transcurrido {formatoDuracion(d.transcurrido_seg)}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13.5 }}>
                <thead><tr><th style={{ textAlign: 'left' }}>Sucursal</th><th style={{ textAlign: 'left' }}>Estado</th><th style={{ textAlign: 'left' }}>Abrió</th><th style={{ textAlign: 'left', minWidth: 140 }}>Avance</th><th style={{ textAlign: 'right' }}>Transcurrido</th><th style={{ textAlign: 'right' }}>Restante</th></tr></thead>
                <tbody>
                  {d.sucursales.map(s => (
                    <tr key={s.sesion_id}>
                      <td>{s.sucursal}</td>
                      <td><StatusBadge estado={s.respuesta} label={NOMBRE_RESPUESTA[s.respuesta] ?? s.respuesta} variante={VARIANTE_RESPUESTA[s.respuesta]} /></td>
                      <td>{s.abrio ? `Sí${s.respuesta_seg != null ? ` (${formatoDuracion(s.respuesta_seg)})` : ''}` : 'No'}</td>
                      <td>
                        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${porcentajeAvance(s.capturadas, s.en_lista)}%`, height: '100%', background: 'var(--ok, #2e8b57)' }} /></div>
                        <span style={{ fontSize: 12 }}>{s.capturadas} de {s.en_lista}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatoDuracion(s.transcurrido_seg)}</td>
                      <td style={{ textAlign: 'right' }}>{s.restante_seg != null ? formatoDuracion(s.restante_seg) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {dialogo}
    </div>
  )
}
