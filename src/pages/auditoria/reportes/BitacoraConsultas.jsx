// Bitácora de consultas a reportes: quién consultó qué, con qué filtros y cuándo. La llena el SERVIDOR en cada consulta de diferencias, tablero, casos, reportes de caja y reporte
// mensual (no depende de la pantalla). La ven el dueño y el soporte RANNIX (el supervisor no audita a sus pares). También protege a RANNIX: queda constancia de sus lecturas.
import { useMemo, useState } from 'react'
import DataTable from '../../../components/ui/DataTable'
import { bitacoraConsultas } from '../../../lib/auditoria/reportesApi'
import { fechaHora, hoyISO } from '../../../lib/formato'
import { Aviso, Estado, FiltroPeriodo, restarDias, useRpc } from './comun'

const TAM = 100
const NOMBRE_ROL = { dueno: 'Dueño', supervisor: 'Supervisor', soporte: 'Soporte RANNIX', sucursal: 'Sucursal' }
const resumenFiltros = f => Object.entries(f ?? {}).filter(([k, v]) => v !== '' && v != null && !['desde_efectivo', 'hasta_efectivo'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')

export default function BitacoraConsultas() {
  const [f, setF] = useState({ desde: restarDias(29), hasta: hoyISO(), reporte: '' })
  const [ap, setAp] = useState(f)
  const [pagina, setPagina] = useState(0)
  const filtros = useMemo(() => ({ desde: ap.desde, hasta: ap.hasta, ...(ap.reporte ? { reporte: ap.reporte } : {}) }), [ap])
  const q = useRpc(['ctl-bitacora-consultas', filtros, pagina], () => bitacoraConsultas({ ...filtros, limite: TAM, offset: pagina * TAM }), { placeholderData: prev => prev })
  const d = q.data
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <FiltroPeriodo valor={f} onCambio={setF} onAplicar={() => { setPagina(0); setAp(f) }} cargando={q.isFetching}>
        <div className="field" style={{ margin: 0, minWidth: 180, flex: '0 1 220px' }}><label>Reporte contiene</label><input value={f.reporte} placeholder="p. ej. diferencias" onChange={e => setF({ ...f, reporte: e.target.value })} /></div>
      </FiltroPeriodo>
      <Aviso>Cada consulta a un reporte de diferencias queda aquí con quién la hizo y con qué filtros. Quienes consultan no pueden borrar ni editar estos renglones.</Aviso>
      <Estado q={q} />
      {d && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5 }}>
            {d.por_usuario.slice(0, 6).map(u => <span key={u.usuario_id ?? u.usuario} className="bd n">{u.usuario} ({NOMBRE_ROL[u.rol] ?? u.rol}): {u.n}</span>)}
            {d.por_reporte.slice(0, 6).map(r => <span key={r.reporte} className="bd b">{r.reporte}: {r.n}</span>)}
          </div>
          <DataTable buscador={false} filaKey="id" filas={d.filas} cargando={q.isFetching && !q.isLoading} tamanoPagina={TAM} exportarNombre="bitacora_consultas"
            servidor={{ total: d.total, pagina, tamano: TAM, onPagina: setPagina }} vacio={{ title: 'Sin consultas', description: 'Nadie ha consultado reportes en este periodo.' }}
            columnas={[
              { key: 'creado_en', label: 'Fecha y hora', render: r => fechaHora(r.creado_en) }, { key: 'usuario', label: 'Quién' }, { key: 'rol', label: 'Rol', render: r => NOMBRE_ROL[r.rol] ?? r.rol },
              { key: 'reporte', label: 'Qué consultó' }, { key: 'filtros', label: 'Filtros', render: r => <span className="hint">{resumenFiltros(r.filtros)}</span>, valor: r => resumenFiltros(r.filtros) },
            ]} />
        </>
      )}
    </div>
  )
}
