// Tablero de dueño (F7.2): «¿cómo van mis tiendas hoy?» en UNA pantalla, responsiva. Cierres del día y cuáles faltan, sucursales sin conteo de apertura, casos abiertos por
// antigüedad, diferencia valorizada del periodo con su tendencia (contra el periodo anterior), alertas sin atender, turnos con entrega no aceptada, auditorías remotas en curso
// y el tablero de salud (sucursales que no han sincronizado en más de N horas). Todo sale de UNA llamada (ctl_tablero) que además queda en la bitácora de consultas.
// Solo dueño, supervisor (sus sucursales) y soporte en lectura. Valores al costo.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Bell, CalendarCheck, ClipboardCheck, FolderOpen, HeartPulse, PackageX, RadioTower, ScanLine } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import StatusBadge from '../../components/ui/StatusBadge'
import { usePermiso, esSuperadmin } from '../../lib/permisos'
import { tableroDueno } from '../../lib/auditoria/reportesApi'
import { NOMBRE_ESTADO_TABLERO, VARIANTE_ESTADO_TABLERO, horasTexto, variacion, VARIANTE_SEVERIDAD, NOMBRE_SEVERIDAD } from '../../lib/auditoria/reportes'
import { fechaHora, moneda, numero, fechaCorta } from '../../lib/formato'
import { Aviso, Estado, useRpc } from './reportes/comun'

const DIAS = [{ v: 7, t: '7 días' }, { v: 30, t: '30 días' }, { v: 60, t: '60 días' }, { v: 90, t: '90 días' }]

export default function Tablero() {
  const nav = useNavigate()
  const verDif = usePermiso('auditoria.ver_diferencias')
  const [dias, setDias] = useState(30)
  const q = useRpc(['ctl-tablero', dias], () => tableroDueno(dias), { enabled: verDif, refetchInterval: 60000 })
  const d = q.data

  if (!verDif) {
    return (
      <div className="pagina">
        <PageHeader titulo="Tablero de auditoría" subtitulo="Esta pantalla es de dueño y supervisor" />
        <div className="card">Quien captura no ve diferencias ni saldos del sistema. Para capturar un conteo o un cierre usa las opciones <b>Conteos</b> y <b>Cierres</b> del menú.</div>
      </div>
    )
  }
  const r = d?.resumen
  const dif = d?.diferencia
  const vs = dif ? variacion(dif.periodo.faltante_valor, dif.anterior.faltante_valor) : null
  const tendencia = (dif?.tendencia ?? []).map(x => ({ ...x, dia: fechaCorta(`${x.fecha}T12:00:00Z`) }))

  return (
    <div className="pagina">
      <PageHeader titulo="Tablero de auditoría" subtitulo="¿Cómo van mis tiendas hoy? · valores al costo · se actualiza cada minuto"
        acciones={<select value={dias} onChange={e => setDias(Number(e.target.value))} aria-label="Periodo de la tendencia">{DIAS.map(x => <option key={x.v} value={x.v}>Tendencia: {x.t}</option>)}</select>} />
      {esSuperadmin() && <div style={{ marginBottom: 10 }}><Aviso>Cuenta de soporte RANNIX: lectura para diagnosticar; tu consulta queda en la bitácora.</Aviso></div>}
      <Estado q={q} />
      {d && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <KPICard title="Cierres de hoy" icon={ClipboardCheck} color={r.cierres_faltan ? 'var(--gold)' : 'var(--green)'} value={`${r.cierres_hechos} de ${r.sucursales}`} subtitle={r.cierres_faltan ? `Faltan ${r.cierres_faltan}` : 'Todos hechos'} />
            <KPICard title="Sin conteo de apertura" icon={ScanLine} color={r.sin_apertura ? 'var(--red)' : 'var(--green)'} value={numero(r.sin_apertura)} subtitle={`Pasadas las ${d.hora_sin_apertura}:00 y ya operaron`} />
            <KPICard title="Entregas sin aceptar" icon={PackageX} color={r.entregas_no_aceptadas ? 'var(--red)' : 'var(--green)'} value={numero(r.entregas_no_aceptadas)} subtitle="Turnos con entrega no aceptada" onClick={() => document.getElementById('tab-entregas')?.scrollIntoView({ behavior: 'smooth' })} />
            <KPICard title="Casos abiertos" icon={FolderOpen} color={r.casos_abiertos ? 'var(--gold)' : 'var(--green)'} value={numero(r.casos_abiertos)} subtitle={`${d.casos.ajuste_fallido} ajuste(s) fallido(s) · ${d.casos.sin_asignar} sin asignar`} onClick={() => nav('/auditoria/casos')} />
            <KPICard title="Alertas sin atender" icon={Bell} color={r.alertas_sin_atender ? 'var(--gold)' : 'var(--green)'} value={numero(r.alertas_sin_atender)} subtitle={`${d.alertas.por_severidad.alta + d.alertas.por_severidad.critica} alta(s) o crítica(s)`} onClick={() => nav('/auditoria/alertas')} />
            <KPICard title="Auditorías remotas" icon={RadioTower} color="var(--accent2)" value={numero(r.remotas_en_curso)} subtitle="En curso ahora" />
            <KPICard title="Sin sincronizar" icon={HeartPulse} color={r.sin_sincronizar ? 'var(--red)' : 'var(--green)'} value={numero(r.sin_sincronizar)} subtitle={`Más de ${d.umbral_sync_horas} h sin señal`} />
          </div>

          <section>
            <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}><CalendarCheck size={16} /> Sucursales hoy</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
              {d.sucursales.map(s => (
                <div key={s.id} className="card" style={{ padding: 12, display: 'grid', gap: 6, borderLeft: `4px solid ${s.sin_sync || s.apertura === 'tarde' || s.cierre === 'tarde' ? 'var(--red)' : s.cierre === 'hecho' ? 'var(--green)' : 'var(--border, #d8dce4)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <b>{s.nombre}</b><span className="hint">{s.opero_hoy ? 'Operó hoy' : 'Sin operación hoy'}</span>
                  </div>
                  {!s.usa_modulo ? <div className="hint">Aún no usa el módulo de auditoría.</div> : (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span title="Conteo de apertura"><StatusBadge estado={s.apertura} label={`Apertura: ${NOMBRE_ESTADO_TABLERO[s.apertura]}`} variante={VARIANTE_ESTADO_TABLERO[s.apertura]} /></span>
                        <span title="Cierre del día o del turno"><StatusBadge estado={s.cierre} label={`Cierre: ${NOMBRE_ESTADO_TABLERO[s.cierre]}`} variante={VARIANTE_ESTADO_TABLERO[s.cierre]} /></span>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                        <span>{s.casos_abiertos} caso(s) abierto(s)</span>
                        <span>{s.alertas_sin_atender} alerta(s)</span>
                        {s.entregas_pendientes > 0 && <b style={{ color: 'var(--red)' }}>{s.entregas_pendientes} entrega(s) sin aceptar</b>}
                        {s.remotas_en_curso > 0 && <span>Auditoría remota en curso</span>}
                      </div>
                      <div style={{ fontSize: 12, color: s.sin_sync ? 'var(--red)' : 'var(--muted)' }}>
                        {s.sin_sync ? <b>Sin sincronizar: </b> : 'Última señal: '}{s.ultima_actividad ? `${fechaHora(s.ultima_actividad)} (${horasTexto(s.horas_sin_sync)})` : 'nunca'}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {d.sucursales.length === 0 && <div className="card">No hay sucursales activas a las que tengas acceso.</div>}
            </div>
          </section>

          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <h3 style={{ margin: 0 }}>Diferencia valorizada · últimos {d.diferencia.dias} días</h3>
              <span className="hint">{d.diferencia.desde} a {d.diferencia.hasta}</span>
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '10px 0' }}>
              <div><div className="hint">Faltantes</div><b style={{ fontSize: 20, color: 'var(--red)' }}>{moneda(dif.periodo.faltante_valor)}</b>
                <div style={{ fontSize: 12, color: vs.tono === 'malo' ? 'var(--red)' : vs.tono === 'bueno' ? 'var(--green)' : 'var(--muted)' }}>{vs.texto.replace('mes anterior', 'periodo anterior')}</div></div>
              <div><div className="hint">Sobrantes</div><b style={{ fontSize: 20, color: 'var(--green)' }}>{moneda(dif.periodo.sobrante_valor)}</b></div>
              <div><div className="hint">Neto</div><b style={{ fontSize: 20 }}>{Number(dif.periodo.neto_valor) < 0 ? '−' : ''}{moneda(Math.abs(dif.periodo.neto_valor))}</b></div>
              <div><div className="hint">Periodo anterior (faltantes)</div><b style={{ fontSize: 20, color: 'var(--muted)' }}>{moneda(dif.anterior.faltante_valor)}</b></div>
              <button type="button" className="btn o sm" style={{ alignSelf: 'center' }} onClick={() => nav('/auditoria/diferencias')}>Ver el detalle</button>
            </div>
            <div style={{ height: 240 }} aria-label="Tendencia diaria de faltantes y sobrantes al costo">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tendencia} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${numero(v)}`} width={64} />
                  <Tooltip formatter={(v, n) => [moneda(v), n]} labelFormatter={l => l} /><Legend />
                  <Area type="monotone" dataKey="faltante" name="Faltantes" stroke="#b02a2a" fill="#b02a2a" fillOpacity={0.18} strokeWidth={2} />
                  <Area type="monotone" dataKey="sobrante" name="Sobrantes" stroke="#1f7a4d" fill="#1f7a4d" fillOpacity={0.14} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            <section className="card">
              <h3 style={{ marginTop: 0 }}>Casos abiertos por antigüedad</h3>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.casos.cubetas} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="cubeta" tick={{ fontSize: 10.5 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip /><Bar dataKey="casos" name="Casos" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="hint">El más antiguo lleva {d.casos.mas_antiguo_dias} día(s) · valor abierto {moneda(d.casos.valor_abierto)} · {d.casos.sin_asignar} sin asignar</div>
            </section>

            <section className="card">
              <h3 style={{ marginTop: 0 }}>Alertas sin atender</h3>
              {d.alertas.recientes.length === 0 ? <div className="hint">Nada pendiente. Pocas alertas, las que importan.</div> : d.alertas.recientes.map(a => (
                <div key={a.id} style={{ borderTop: '1px solid var(--row-line, #eee)', padding: '6px 0', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusBadge estado={a.severidad} label={NOMBRE_SEVERIDAD[a.severidad]} variante={VARIANTE_SEVERIDAD[a.severidad]} /><b>{a.nombre}</b><span className="hint">{fechaHora(a.creado_en)}</span>
                  </div>
                  <div style={{ color: 'var(--muted)' }}>{a.mensaje}</div>
                </div>
              ))}
              <button type="button" className="btn o sm" style={{ marginTop: 8 }} onClick={() => nav('/auditoria/alertas')}>Abrir la bandeja ({d.alertas.sin_atender})</button>
            </section>

            <section className="card" id="tab-entregas">
              <h3 style={{ marginTop: 0 }}>Entregas de turno sin aceptar</h3>
              {d.entregas_no_aceptadas.length === 0 ? <div className="hint">Ninguna: todas las entregas se aceptaron.</div> : d.entregas_no_aceptadas.map(e => (
                <div key={e.id} style={{ borderTop: '1px solid var(--row-line, #eee)', padding: '6px 0', fontSize: 12.5 }}>
                  <b>{e.sucursal}</b> · cierre {e.cierre_folio} <span className="bd r">hace {Math.round(e.horas)} h</span>
                  <div style={{ color: 'var(--muted)' }}>Entregó {e.usuario_entrega ?? '—'} el {fechaHora(e.entregado_en)} · {moneda(e.monto_entregado)}</div>
                </div>
              ))}
              <h3 style={{ margin: '14px 0 6px' }}>Auditorías remotas en curso</h3>
              {d.remotas_en_curso.length === 0 ? <div className="hint">No hay auditorías remotas abiertas.</div> : d.remotas_en_curso.map(a => (
                <div key={a.id} style={{ borderTop: '1px solid var(--row-line, #eee)', padding: '6px 0', fontSize: 12.5 }}>
                  <b>{a.sucursal}</b> · {a.folio}
                  <div style={{ height: 6, background: '#e4e8f0', borderRadius: 3, margin: '4px 0' }}><div style={{ width: `${a.en_lista ? Math.round((a.reportadas * 100) / a.en_lista) : 0}%`, height: 6, background: 'var(--accent2, #1d4ed8)', borderRadius: 3 }} /></div>
                  <span className="hint">{a.reportadas} de {a.en_lista} productos reportados · quedan {a.minutos_restantes} min</span>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
