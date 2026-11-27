// Mi sucursal (podólogo responsable): ve el personal del día, quién llega a cubrir y quién sale, la firma de entrada y la operación
// de SU sucursal. Solo lectura: no ve sueldos, CLABE ni finanzas (migración 310: personal_de_mi_sucursal() y políticas *_sel_responsable).
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import PageHeader from '../../../components/ui/PageHeader'
import KPICard from '../../../components/ui/KPICard'
import { useApp } from '../../../context/AppContext'
import { rpc } from '../../../lib/api'
import { moneda, hora, telefono } from '../../../lib/formato'
import { useVista, Estado, Foto, etiquetaPuesto, hoyZona } from './comun'

const SENTIDO = {
  base: { txt: 'En su sucursal', cls: 'n', Icono: null },
  llega: { txt: 'Llega a cubrir', cls: 'a', Icono: ArrowLeft },
  sale: { txt: 'Hoy va a otra sucursal', cls: 'n', Icono: ArrowRight },
}

export default function MiSucursal() {
  const { contextoSucursal, sedes, organizacion } = useApp()
  const sedeId = contextoSucursal.responsable_de
  const sede = sedes.find(s => s.id === sedeId)
  const zona = organizacion?.zona_horaria
  const hoy = hoyZona(zona)
  const qPer = useQuery({ queryKey: ['mi-sucursal-personal', sedeId], enabled: !!sedeId, refetchInterval: 60_000, queryFn: async () => { const r = await rpc('personal_de_mi_sucursal'); if (r.error) throw r.error; return r.data ?? [] } })
  const qVen = useVista('mi-sucursal-ventas', 'prp_ventas', { sedeCol: false, filtros: { sede_id: sedeId }, orden: [{ columna: 'created_at', asc: false }], limite: 300 }, { habilitado: !!sedeId, conSede: false })
  const ventasHoy = useMemo(() => (qVen.data ?? []).filter(v => new Date(v.created_at).toLocaleDateString('en-CA', { timeZone: zona || 'America/Mexico_City' }) === hoy), [qVen.data, hoy, zona])
  const cobradas = ventasHoy.filter(v => ['cobrada', 'por_facturar', 'facturada'].includes(v.estado))
  const personal = qPer.data ?? []
  const aqui = personal.filter(p => p.sentido !== 'sale')
  const sinFirmar = aqui.filter(p => !p.entrada_hoy).length

  if (!sedeId) return <div className="pagina"><div className="card">Aún no eres responsable de una sucursal. Los propietarios te asignan en Asignación de personal.</div></div>
  return (
    <div className="pagina">
      <PageHeader titulo={`Mi sucursal · ${sede?.nombre ?? ''}`} subtitulo="Personal del día, firmas de entrada y operación de tu sucursal (solo lectura)" />
      <div className="grid-kpis">
        <KPICard title="Personal hoy" value={aqui.length} subtitle={`${personal.filter(p => p.sentido === 'llega').length} llegan a cubrir · ${personal.filter(p => p.sentido === 'sale').length} salen`} loading={qPer.isLoading} />
        <KPICard title="Sin firmar entrada" value={sinFirmar} color={sinFirmar ? 'var(--gold)' : undefined} subtitle="Personal de hoy que aún no firma" loading={qPer.isLoading} />
        <KPICard title="Tickets de hoy" value={ventasHoy.length} subtitle={`${cobradas.length} cobrados`} loading={qVen.isLoading} />
        <KPICard title="Cobrado hoy" value={moneda(cobradas.reduce((s, v) => s + Number(v.total || 0), 0))} color="var(--green)" subtitle="Total de tickets cobrados" loading={qVen.isLoading} />
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Personal de hoy</h3>
        <Estado q={qPer} vacio={{ title: 'Sin personal', description: 'No hay personal activo ligado a tu sucursal.', compacto: true }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {personal.map(p => {
              const s = SENTIDO[p.sentido] ?? SENTIDO.base
              return (
                <div key={p.empleado_id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: 10, opacity: p.sentido === 'sale' ? 0.65 : 1 }}>
                  <Foto nombre={p.nombre_completo} ruta={p.foto_path} size={52} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nombre_completo}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{etiquetaPuesto(p.puesto)}{p.telefono ? ` · ${telefono(p.telefono)}` : ''}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                      <span className={`bd ${s.cls}`}>{s.Icono && <s.Icono size={11} style={{ verticalAlign: -2 }} />} {p.sentido === 'sale' ? `Hoy en ${p.sede_hoy_nombre}` : p.sentido === 'llega' ? `Viene de ${p.sede_base_nombre}` : s.txt}</span>
                      {p.sentido !== 'sale' && (p.entrada_hoy
                        ? <span className="bd v"><CheckCircle2 size={11} style={{ verticalAlign: -2 }} /> Entrada {hora(p.entrada_hoy)}{p.salida_hoy ? ` · salida ${hora(p.salida_hoy)}` : ''}</span>
                        : <span className="bd n"><Clock size={11} style={{ verticalAlign: -2 }} /> Sin firmar</span>)}
                    </div>
                    {p.motivo && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{p.motivo}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </Estado>
      </div>
      <div className="card">
        <h3>Tickets de hoy</h3>
        <Estado q={qVen} vacio={{ title: 'Sin tickets', description: 'Aún no hay tickets hoy.', compacto: true }}>
          {ventasHoy.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Aún no hay tickets hoy en tu sucursal.</div> : (
            <div className="tabla-wrap"><table>
              <thead><tr><th>Folio</th><th>Hora</th><th>Paciente</th><th>Podólogo</th><th>Cajero</th><th>Estado</th><th className="num">Total</th></tr></thead>
              <tbody>{ventasHoy.map(v => <tr key={v.id}><td>{v.folio}</td><td>{hora(v.created_at)}</td><td>{v.paciente_nombre ?? '—'}</td><td>{v.podologo_nombre ?? '—'}</td><td>{v.cajero_nombre ?? '—'}</td><td>{v.estado}</td><td className="num">{moneda(v.total)}</td></tr>)}</tbody>
            </table></div>)}
        </Estado>
      </div>
    </div>
  )
}
