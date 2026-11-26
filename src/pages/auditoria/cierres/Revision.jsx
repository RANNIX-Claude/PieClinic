// Revisión de cierres (SOLO dueño y supervisor): lista, corte con esperado contra capturado, versión del checklist con la que se abrió cada cierre,
// entrega de turno y pares antes/después de las tomas fijas. El servidor no entrega nada de esto a un rol de sucursal.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Camera } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import DataTable from '../../../components/ui/DataTable'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import EmptyState from '../../../components/ui/EmptyState'
import { moneda, fechaHora, numero } from '../../../lib/formato'
import { listarCierres, detalleCierre, paresToma } from '../../../lib/auditoria/apiCierres'
import { NOMBRE_TIPO_CIERRE, NOMBRE_ESTADO_CIERRE, NOMBRE_TIPO_CAPTURA, NOMBRE_ESTADO_ENTREGA } from '../../../lib/auditoria/cierres'
import { urlEvidencia } from '../../../lib/auditoria/urlFirmadaAuditoria'
import { errMsg, NOMBRE_ESTADO } from '../comun'
import ComparadorFotos from './ComparadorFotos'

const consulta = (key, fn) => ({ queryKey: key, queryFn: async () => { const r = await fn(); if (r.error) throw new Error(errMsg(r.error)); return r.data }, retry: false })

export function ListaCierres() {
  const { sedes } = useApp()
  const [sucursal, setSucursal] = useState('')
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  const [abierto, setAbierto] = useState(null)
  const q = useQuery(consulta(['ctl-cierres-lista', sucursal, tipo, estado], () => listarCierres({ sucursalId: sucursal || null, tipo: tipo || null, estado: estado || null, limite: 200 })))
  const columnas = [
    { key: 'folio', label: 'Folio' },
    { key: 'sucursal', label: 'Sucursal', filtro: true },
    { key: 'tipo', label: 'Tipo', render: f => NOMBRE_TIPO_CIERRE[f.tipo], valor: f => NOMBRE_TIPO_CIERRE[f.tipo] },
    { key: 'estado', label: 'Estado', render: f => <StatusBadge variante={f.estado === 'cerrado' ? 'v' : f.estado === 'entrega_no_aceptada' ? 'r' : 'a'} label={NOMBRE_ESTADO_CIERRE[f.estado]} />, valor: f => NOMBRE_ESTADO_CIERRE[f.estado] },
    { key: 'usuario_cierra', label: 'Cerró' },
    { key: 'abierto_en', label: 'Abierto', render: f => fechaHora(f.abierto_en), valor: f => f.abierto_en },
    { key: 'fuera_tolerancia', label: 'Fuera de tolerancia', align: 'right', render: f => (f.fuera_tolerancia ? <b className="text-red">{f.fuera_tolerancia}</b> : '0') },
    { key: 'casos', label: 'Casos', align: 'right' },
    { key: 'ver', label: '', exportar: false, sortable: false, render: f => <button className="btn o sm" onClick={() => setAbierto(f.id)}>Ver corte</button> },
  ]
  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <FormField label="Sucursal" as="select" placeholder="Todas" value={sucursal} onChange={e => setSucursal(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
        <FormField label="Tipo" as="select" placeholder="Todos" value={tipo} onChange={e => setTipo(e.target.value)} options={Object.entries(NOMBRE_TIPO_CIERRE).map(([value, label]) => ({ value, label }))} />
        <FormField label="Estado" as="select" placeholder="Todos" value={estado} onChange={e => setEstado(e.target.value)} options={Object.entries(NOMBRE_ESTADO_CIERRE).map(([value, label]) => ({ value, label }))} />
      </div>
      {q.isLoading && <div className="card">Cargando…</div>}
      {q.isError && <EmptyState title="No se pudo cargar" description={q.error.message} />}
      {q.data && <DataTable columnas={columnas} filas={q.data} vacio={{ title: 'Sin cierres', description: 'Aún no hay cierres con estos filtros.' }} />}
      {abierto && <DetalleCierre id={abierto} onClose={() => setAbierto(null)} />}
    </>
  )
}

const Celda = ({ etiqueta, children, mal }) => (
  <div style={{ padding: 10, border: '1px solid var(--border, #ddd)', borderRadius: 8, borderColor: mal ? 'var(--red, #c0392b)' : undefined }}>
    <div className="hint" style={{ fontSize: 12 }}>{etiqueta}</div><div style={{ fontSize: 16, fontWeight: 600 }}>{children}</div>
  </div>
)
const fm = (x, esMoneda) => (x == null ? '—' : esMoneda ? moneda(x) : numero(x))

function DetalleCierre({ id, onClose }) {
  const q = useQuery(consulta(['ctl-cierre-detalle', id], () => detalleCierre(id)))
  const d = q.data
  const corte = d?.corte
  return (
    <Modal open title={d ? `${d.cierre.folio} · ${d.sucursal} · ${NOMBRE_TIPO_CIERRE[d.cierre.tipo]}` : 'Cierre'} onClose={onClose} size="wide">
      {q.isLoading && <div>Cargando…</div>}
      {q.isError && <div className="text-red">{q.error.message}</div>}
      {d && <>
        <div className="hint" style={{ marginBottom: 8 }}>
          Estado: <b>{NOMBRE_ESTADO_CIERRE[d.cierre.estado]}</b> · abrió y cerró {d.usuario_cierra} · abierto {fechaHora(d.cierre.abierto_en)}{d.cierre.cerrado_en ? ` · cerrado ${fechaHora(d.cierre.cerrado_en)}` : ''}
          {d.usuario_recibe ? ` · recibió ${d.usuario_recibe} (${fechaHora(d.cierre.aceptado_en)})` : ''}
        </div>

        {corte && (
          <>
            <h3 style={{ margin: '8px 0' }}>Corte</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
              {corte.efectivo && <Celda etiqueta="Efectivo: esperado / contado" mal={corte.efectivo.dentro_tolerancia === false}>{fm(corte.efectivo.esperado, true)} / {fm(corte.efectivo.calculado, true)} <span className="hint">(dif. {fm(corte.efectivo.diferencia, true)})</span></Celda>}
              {corte.tarjeta && <Celda etiqueta="Tarjeta: esperada / terminal" mal={corte.tarjeta.dentro_tolerancia === false}>{fm(corte.tarjeta.esperado, true)} / {fm(corte.tarjeta.calculado, true)}</Celda>}
              {corte.transferencia && <Celda etiqueta="Transferencias: esperadas / capturadas" mal={corte.transferencia.dentro_tolerancia === false}>{fm(corte.transferencia.esperado, true)} / {fm(corte.transferencia.calculado, true)}</Celda>}
              {corte.kits && <Celda etiqueta="Kits usados / servicios cobrados" mal={corte.kits.dentro_tolerancia === false}>{fm(corte.kits.calculado)} / {fm(corte.kits.esperado)} {corte.kits.diferencia > 0 && <span className="text-red">· {fm(corte.kits.diferencia)} sin cobro</span>}</Celda>}
              <Celda etiqueta="Tickets cobrados">{fm(corte.tickets)}</Celda>
              <Celda etiqueta="Cancelaciones del turno">{fm(corte.cancelaciones?.numero)} <span className="hint">({moneda(corte.cancelaciones?.monto ?? 0)})</span></Celda>
              <Celda etiqueta="Aperturas de cajón sin venta">{fm(corte.aperturas_cajon_sin_venta)}</Celda>
              <Celda etiqueta="Ventas por debajo de catálogo" mal={corte.ventas_bajo_catalogo?.lineas > 0}>{fm(corte.ventas_bajo_catalogo?.lineas)} <span className="hint">({moneda(corte.ventas_bajo_catalogo?.monto ?? 0)})</span></Celda>
            </div>
            {corte.ventas_bajo_catalogo?.detalle?.length > 0 && (
              <details style={{ marginTop: 6 }}><summary>Detalle de ventas bajo catálogo</summary>
                <table className="tabla"><thead><tr><th>Ticket</th><th>Concepto</th><th>Catálogo</th><th>Cobrado</th><th>Motivo</th></tr></thead>
                  <tbody>{corte.ventas_bajo_catalogo.detalle.map((v, i) => <tr key={i}><td>{v.ticket}</td><td>{v.concepto}</td><td>{moneda(v.catalogo)}</td><td>{moneda(v.cobrado)}</td><td>{v.motivo ?? '—'}</td></tr>)}</tbody></table></details>)}
          </>
        )}

        <h3 style={{ margin: '12px 0 4px' }}>Puntos de control <span className="hint" style={{ fontSize: 12, fontWeight: 400 }}>(versión del checklist con la que se abrió este cierre)</span></h3>
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Punto</th><th>Versión</th><th>Captura</th><th>Capturado</th><th>Esperado</th><th>Diferencia</th><th>Resultado</th><th>Fotos</th></tr></thead>
          <tbody>{d.puntos.map(p => {
            const k = p.captura
            const dinero = p.formula_esperado !== 'kits_usados' && p.formula_esperado !== 'tickets_cobrados'
            return (
              <tr key={p.punto_id}>
                <td>{p.nombre}{!p.obligatorio && <span className="hint"> (opcional)</span>}</td>
                <td>v{p.version}{!p.vigente_hoy && <span className="hint"> (hoy ya no vigente)</span>}</td>
                <td>{NOMBRE_TIPO_CAPTURA[p.tipo_captura]}</td>
                <td>{k ? (k.valor_calculado != null && !dinero ? <>{fm(k.valor)} <span className="hint">→ {fm(k.valor_calculado)} usados</span></> : fm(k.valor, p.tipo_captura === 'denominaciones' || dinero)) : '—'}
                  {k?.denominaciones?.length > 0 && <div className="hint" style={{ fontSize: 11 }}>{k.denominaciones.filter(x => x.cantidad > 0).map(x => `${x.cantidad}×${x.denominacion}`).join(' · ')}</div>}</td>
                <td>{k?.valor_esperado != null ? fm(k.valor_esperado, dinero) : '—'}</td>
                <td>{k?.diferencia != null ? fm(k.diferencia, dinero) : '—'}</td>
                <td>{k?.dentro_tolerancia == null ? '—' : k.dentro_tolerancia ? <StatusBadge variante="v" label="Dentro" /> : <StatusBadge variante="r" label={`Fuera (±${p.tolerancia})`} />}</td>
                <td>{p.evidencias.length ? <Fotos evidencias={p.evidencias} /> : '—'}</td>
              </tr>)
          })}</tbody>
        </table></div>

        {d.entrega && (
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <b>Entrega de turno:</b> {NOMBRE_ESTADO_ENTREGA[d.entrega.estado]} · entregó {moneda(d.entrega.monto_entregado)}
            {d.entrega.monto_recibido != null && <> · recibió {moneda(d.entrega.monto_recibido)} (fondo del turno siguiente {moneda(d.entrega.fondo_inicial)})</>}
            {d.entrega.motivo_liberacion && <> · liberada: {d.entrega.motivo_liberacion}</>}
          </div>)}
        {d.casos.length > 0 && (
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <b><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Casos abiertos por este cierre:</b>{' '}
            {d.casos.map(k => <span key={k.id} style={{ marginRight: 10 }}>{k.folio} · {k.tipo.replace(/_/g, ' ')} · {NOMBRE_ESTADO[k.estado] ?? k.estado}</span>)}
          </div>)}
      </>}
    </Modal>
  )
}

function Fotos({ evidencias }) {
  const [url, setUrl] = useState(null)
  const [etiqueta, setEtiqueta] = useState('')
  async function ver(e) { setEtiqueta(e.toma ?? 'Foto'); setUrl(await urlEvidencia(e.ruta, 240)) }
  return (
    <>
      {evidencias.map(e => <button key={e.id} className="btn o sm" style={{ marginRight: 4 }} onClick={() => ver(e)} title={e.toma ?? 'Foto'}><Camera size={12} style={{ verticalAlign: -2 }} /> {e.toma ?? 'Foto'}</button>)}
      {url && <Modal open title={etiqueta} onClose={() => setUrl(null)}><img src={url} alt={etiqueta} style={{ width: '100%', borderRadius: 8 }} /></Modal>}
    </>
  )
}

// ───────────────────────────── pares antes / después de tomas fijas ─────────────────────────────
const ESTADO_PAR = { par: 'Par completo', sin_cierre_previo: 'Apertura sin foto de cierre previa', sin_apertura: 'Cierre sin apertura posterior', pendiente_apertura: 'Cierre en espera de la apertura' }
export function ParesTomas() {
  const { sedes } = useApp()
  const [sucursal, setSucursal] = useState('')
  const nombre = useMemo(() => Object.fromEntries(sedes.map(s => [s.id, s.nombre])), [sedes])
  const q = useQuery(consulta(['ctl-pares', sucursal], () => paresToma({ sucursalId: sucursal || null, limite: 60 })))
  return (
    <>
      <div className="hint" style={{ marginBottom: 8 }}>La foto de cierre de ayer contra la de apertura de hoy, de la misma toma fija. Reduce la ventana de un mes a una noche y de siete personas a dos: quien cerró y quien abrió.</div>
      <FormField label="Sucursal" as="select" placeholder="Todas" value={sucursal} onChange={e => setSucursal(e.target.value)} options={sedes.map(s => ({ value: s.id, label: s.nombre }))} />
      {q.isLoading && <div className="card">Cargando…</div>}
      {q.isError && <EmptyState title="No se pudo cargar" description={q.error.message} />}
      {q.data && !q.data.length && <EmptyState title="Sin tomas" description="Aún no hay fotos de tomas fijas." />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {(q.data ?? []).map((p, i) => (
          <div key={i} className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{nombre[p.sucursal_id] ?? ''} · {p.toma}</div>
            <div style={{ margin: '4px 0 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <StatusBadge variante={p.estado === 'par' ? 'v' : 'a'} label={ESTADO_PAR[p.estado]} />
              {p.hash_igual && <StatusBadge variante="r" label="Misma imagen (hash idéntico)" />}
              {p.apertura_tardia && <StatusBadge variante="r" label="Apertura tras la primera venta" />}
            </div>
            <ComparadorFotos antesRuta={p.cierre?.ruta} despuesRuta={p.apertura?.ruta} />
            <div className="hint" style={{ marginTop: 6 }}>
              {p.cierre && <>Cierre {p.cierre.folio} · {p.cierre.usuario} · {fechaHora(p.cierre.capturado_en)}<br /></>}
              {p.apertura && <>Apertura {p.apertura.folio} · {p.apertura.usuario} · {fechaHora(p.apertura.capturado_en)}</>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
