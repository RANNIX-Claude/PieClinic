// Lista de casos: filtros (estado, sucursal, tipo, antigüedad, asignado) y bandeja «mis casos». Los filtros los resuelve el servidor (ctl_casos_listar),
// que además deja fuera lo que el rol no puede ver. Solo dueño, supervisor y soporte (solo lectura) la abren.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listarCasos } from '../../../lib/auditoria/casoApi'
import { NOMBRE_ESTADO_CASO, NOMBRE_TIPO_CASO, VARIANTE_ESTADO_CASO, antiguedadTexto, cuboAntiguedad, esAbierto } from '../../../lib/auditoria/casoReglas'
import { mensajeError } from '../../../lib/auditoria/roles'
import { fechaHora, moneda } from '../../../lib/formato'
import { useApp } from '../../../context/AppContext'
import DataTable from '../../../components/ui/DataTable'
import StatusBadge from '../../../components/ui/StatusBadge'
import KPICard from '../../../components/ui/KPICard'

const ANTIGUEDAD = [{ v: '', t: 'Cualquier antigüedad' }, { v: '3', t: '3 días o más' }, { v: '8', t: '8 días o más' }, { v: '15', t: '15 días o más' }, { v: '31', t: 'Más de 30 días' }]

export default function CasosLista({ rolAud, soloMios = false, onAbrir }) {
  const { sedes } = useApp()
  const [f, setF] = useState({ estado: '', sucursal: '', tipo: '', antiguedad_min: '', asignado: '', solo_abiertos: true, vencidos: false, buscar: '' })
  const filtros = useMemo(() => {
    const o = { limite: 500 }
    for (const [k, v] of Object.entries(f)) if (v !== '' && v !== false) o[k] = v
    if (soloMios) o.asignado = 'mio'
    if (f.estado) delete o.solo_abiertos
    return o
  }, [f, soloMios])
  const q = useQuery({
    queryKey: ['ctl-casos', filtros], retry: false, refetchInterval: 30000,
    queryFn: async () => { const r = await listarCasos(filtros); if (r.error) throw new Error(mensajeError(r.error)); return r.data },
  })
  const filas = q.data?.casos ?? []
  const res = q.data?.resumen ?? {}
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const columnas = [
    { key: 'folio', label: 'Folio' },
    { key: 'abierto_en', label: 'Abierto', render: r => fechaHora(r.abierto_en) },
    { key: 'antiguedad_dias', label: 'Antigüedad', align: 'right', render: r => <span className={`bd ${esAbierto(r.estado) ? cuboAntiguedad(r.antiguedad_dias) : 'n'}`}>{antiguedadTexto(r.antiguedad_dias)}</span> },
    { key: 'sucursal', label: 'Sucursal', filtro: true },
    { key: 'tipo', label: 'Tipo', render: r => NOMBRE_TIPO_CASO[r.tipo] ?? r.tipo, valor: r => NOMBRE_TIPO_CASO[r.tipo] ?? r.tipo },
    { key: 'producto', label: 'Producto', render: r => r.producto ?? '—' },
    { key: 'cantidad', label: 'Piezas', align: 'right', render: r => (r.cantidad == null ? (r.no_reportado ? 'No reportado' : '—') : Number(r.cantidad) > 0 ? `+${r.cantidad}` : r.cantidad) },
    { key: 'valor', label: 'Valor al costo', align: 'right', render: r => moneda(r.valor) },
    { key: 'asignado', label: 'Asignado a', render: r => r.asignado ?? <span style={{ opacity: 0.6 }}>Sin asignar</span>, valor: r => r.asignado ?? 'Sin asignar', filtro: true },
    { key: 'fecha_compromiso', label: 'Compromiso', render: r => (r.fecha_compromiso ? <span className={r.vencido ? 'bd r' : undefined}>{fechaHora(r.fecha_compromiso)}</span> : '—') },
    { key: 'estado', label: 'Estado', render: r => <StatusBadge estado={r.estado} label={NOMBRE_ESTADO_CASO[r.estado]} variante={VARIANTE_ESTADO_CASO[r.estado]} />, valor: r => NOMBRE_ESTADO_CASO[r.estado] ?? r.estado, filtro: true },
    { key: 'extra', label: '', sortable: false, exportar: false, render: r => (
      <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {r.con_cancelacion && <span className="bd b" title="El caso nació con una cancelación ligada">Cancelación</span>}
        {r.par_rol && <span className="bd m" title="Posible sustitución de código">Par</span>}
      </span>) },
  ]

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <KPICard title="Abiertas" value={res.abierta ?? 0} activo={f.estado === 'abierta'} onClick={() => set('estado', f.estado === 'abierta' ? '' : 'abierta')} />
        <KPICard title="En investigación" value={res.en_investigacion ?? 0} activo={f.estado === 'en_investigacion'} onClick={() => set('estado', f.estado === 'en_investigacion' ? '' : 'en_investigacion')} />
        <KPICard title="Ajuste fallido" value={res.ajuste_fallido ?? 0} color="var(--danger, #c0392b)" activo={f.estado === 'ajuste_fallido'} onClick={() => set('estado', f.estado === 'ajuste_fallido' ? '' : 'ajuste_fallido')} />
        <KPICard title="Cerradas con ajuste" value={res.cerrada_con_ajuste ?? 0} activo={f.estado === 'cerrada_con_ajuste'} onClick={() => set('estado', f.estado === 'cerrada_con_ajuste' ? '' : 'cerrada_con_ajuste')} />
        <KPICard title="Cerradas sin ajuste" value={res.cerrada_sin_ajuste ?? 0} activo={f.estado === 'cerrada_sin_ajuste'} onClick={() => set('estado', f.estado === 'cerrada_sin_ajuste' ? '' : 'cerrada_sin_ajuste')} />
        <KPICard title="Rechazadas" value={res.rechazada ?? 0} activo={f.estado === 'rechazada'} onClick={() => set('estado', f.estado === 'rechazada' ? '' : 'rechazada')} />
      </div>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0 }}><label>Sucursal</label>
          <select value={f.sucursal} onChange={e => set('sucursal', e.target.value)}><option value="">Todas</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
        <div className="field" style={{ margin: 0 }}><label>Estado</label>
          <select value={f.estado} onChange={e => set('estado', e.target.value)}><option value="">Solo abiertos</option>{Object.entries(NOMBRE_ESTADO_CASO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="field" style={{ margin: 0 }}><label>Tipo</label>
          <select value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="">Todos</option>{Object.entries(NOMBRE_TIPO_CASO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="field" style={{ margin: 0 }}><label>Antigüedad</label>
          <select value={f.antiguedad_min} onChange={e => set('antiguedad_min', e.target.value)}>{ANTIGUEDAD.map(a => <option key={a.v} value={a.v}>{a.t}</option>)}</select></div>
        {!soloMios && (
          <div className="field" style={{ margin: 0 }}><label>Asignado</label>
            <select value={f.asignado} onChange={e => set('asignado', e.target.value)}><option value="">Cualquiera</option><option value="mio">Asignados a mí</option><option value="sin_asignar">Sin asignar</option></select></div>
        )}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.vencidos} onChange={e => set('vencidos', e.target.checked)} /> Fecha compromiso vencida</label>
        <div className="field" style={{ margin: 0, minWidth: 180 }}><label>Folio o producto</label>
          <input value={f.buscar} onChange={e => set('buscar', e.target.value)} placeholder="CAS-2026-… o nombre" /></div>
      </div>
      <DataTable columnas={columnas} filas={filas} cargando={q.isLoading} error={q.isError ? q.error.message : undefined} buscador={false}
        onFila={r => onAbrir(r.id)} exportarNombre={rolAud === 'soporte' ? undefined : 'casos_auditoria'}
        vacio={{ title: soloMios ? 'No tienes casos asignados' : 'Sin casos', description: soloMios ? 'Toma un caso desde la lista o pide que te asignen uno.' : 'Los casos nacen solos al cerrar un conteo o un cierre con diferencias; nunca se capturan a mano.' }} />
      <div className="hint">Un caso nunca se captura a mano: siempre nace de una captura. Mientras esté abierto, el inventario no se mueve.</div>
    </div>
  )
}
