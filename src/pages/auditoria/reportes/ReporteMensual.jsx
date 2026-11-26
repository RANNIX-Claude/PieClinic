// Reporte mensual (F7.4): PDF de dos páginas por mes, el artefacto comercial del módulo. Aquí se elige el mes, se ve la vista previa con los mismos datos y se descarga el PDF
// («Descargar reporte del mes»). El PDF se arma en el navegador (lib/auditoria/pdf.js, sin dependencias) con lo que devuelve ctl_reporte_mensual; cada generación queda en la
// bitácora de consultas. No hay planificador: el reporte de cualquier mes se genera al pedirlo y siempre sale con los datos vigentes.
import { useState } from 'react'
import { Download } from 'lucide-react'
import KPICard from '../../../components/ui/KPICard'
import DataTable from '../../../components/ui/DataTable'
import { reporteMensual } from '../../../lib/auditoria/reportesApi'
import { armarReporteMensual, nombreArchivoMensual } from '../../../lib/auditoria/reporteMensualPdf'
import { descargarPdf } from '../../../lib/auditoria/pdf'
import { ultimosMeses, variacion } from '../../../lib/auditoria/reportes'
import { mensajeError } from '../../../lib/auditoria/roles'
import { moneda, numero, hoyISO } from '../../../lib/formato'
import { Aviso, Estado, useRpc } from './comun'

export default function ReporteMensual() {
  const meses = ultimosMeses(hoyISO(), 12)
  const [mes, setMes] = useState(meses[0].valor)
  const [generando, setGenerando] = useState(false)
  const [err, setErr] = useState('')
  const q = useRpc(['ctl-rep-mensual', mes], () => reporteMensual(mes))
  const d = q.data
  async function descargar() {
    setGenerando(true); setErr('')
    try {
      const r = await reporteMensual(mes)
      if (r.error) throw new Error(mensajeError(r.error))
      descargarPdf(armarReporteMensual(r.data).generar(), nombreArchivoMensual(r.data))
    } catch (e) { setErr(e.message) } finally { setGenerando(false) }
  }
  const vs = d ? variacion(d.total.faltante_valor, d.total_anterior.faltante_valor) : null
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, minWidth: 200, flex: '0 1 240px' }}><label>Mes</label>
          <select value={mes} onChange={e => setMes(e.target.value)}>{meses.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}</select></div>
        <button type="button" className="btn" onClick={descargar} disabled={generando || !d}><Download size={14} style={{ verticalAlign: -2 }} /> {generando ? 'Generando…' : 'Descargar reporte del mes'}</button>
        <div className="hint" style={{ flex: 1, minWidth: 220 }}>PDF de dos páginas: diferencia valorizada total y por sucursal contra el mes anterior, causas, casos abiertos y cerrados y los diez productos con más recurrencia.</div>
      </div>
      {err && <Aviso tono="alerta">No se pudo generar el reporte: {err}</Aviso>}
      <Estado q={q} />
      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <KPICard title="Faltantes del mes" color="var(--red)" value={moneda(d.total.faltante_valor)} subtitle={`${numero(d.total.faltante_piezas)} pieza(s) · ${vs.texto}`} />
            <KPICard title="Sobrantes del mes" color="var(--green)" value={moneda(d.total.sobrante_valor)} subtitle={`${numero(d.total.sobrante_piezas)} pieza(s)`} />
            <KPICard title="Casos cerrados" value={numero(d.casos.cerrados_en_mes)} subtitle={`${d.casos.cerrados_con_ajuste} con ajuste · ${d.casos.cerrados_sin_ajuste} sin ajuste`} />
            <KPICard title="Abiertos al cierre del mes" color="var(--gold)" value={numero(d.casos.abiertos_al_cierre_del_mes)} subtitle={`${d.casos.nacidos_en_mes} nacieron en el mes`} />
          </div>
          <DataTable buscador={false} sinPaginacion filaKey="sucursal_id" filas={d.por_sucursal} exportarNombre="reporte_mensual_por_sucursal"
            columnas={[
              { key: 'sucursal', label: 'Sucursal' }, { key: 'faltante_valor', label: 'Faltante', align: 'right', render: r => <b>{moneda(r.faltante_valor)}</b> }, { key: 'sobrante_valor', label: 'Sobrante', align: 'right', render: r => moneda(r.sobrante_valor) },
              { key: 'previo_faltante_valor', label: 'Mes anterior', align: 'right', render: r => moneda(r.previo_faltante_valor) },
              { key: 'variacion_pct', label: 'Variación', align: 'right', render: r => (r.variacion_pct == null ? (Number(r.faltante_valor) > 0 ? 'nuevo' : '—') : `${r.variacion_pct > 0 ? '+' : ''}${r.variacion_pct}%`) },
            ]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            <DataTable buscador={false} sinPaginacion compacto filaKey="causa" filas={d.causas} vacio={{ title: 'Sin causas', description: 'Aún no se cerró ningún caso con causa en este mes.' }}
              columnas={[{ key: 'causa', label: 'Causa' }, { key: 'casos', label: 'Casos', align: 'right' }, { key: 'valor', label: 'Valor al costo', align: 'right', render: r => moneda(r.valor) }]} />
            <DataTable buscador={false} sinPaginacion compacto filaKey="puesto" filas={d.top_productos} vacio={{ title: 'Sin recurrencia', description: 'No hubo faltantes de productos en este mes.' }}
              columnas={[{ key: 'puesto', label: '#', align: 'right' }, { key: 'producto', label: 'Producto' }, { key: 'auditorias', label: 'Auditorías', align: 'right' }, { key: 'faltante_valor', label: 'Faltante', align: 'right', render: r => moneda(r.faltante_valor) }]} />
          </div>
          <Aviso>{d.nota}</Aviso>
        </>
      )}
    </div>
  )
}
