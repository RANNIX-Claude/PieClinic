// SELLOS VOID CON FOLIO (F5.2): colocar, verificar (intacto + peso con báscula, sin abrir) y registrar la REAPERTURA (pieza, motivo, usuario, nuevo folio).
// Un sello roto sin registro de reapertura es alerta automática al supervisor y abre un caso. Quien captura NUNCA ve el peso esperado ni la diferencia:
// el servidor solo le dice si el peso coincide (para que sepa si debe abrir la caja).
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Scale, Tag, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react'
import FormField from '../../../components/ui/FormField'
import Tabs from '../../../components/ui/Tabs'
import EmptyState from '../../../components/ui/EmptyState'
import StatusBadge from '../../../components/ui/StatusBadge'
import { usePermiso } from '../../../lib/permisos'
import { fechaHora } from '../../../lib/formato'
import { nuevoId, colocarSello, verificarSello, listarSellos, productosEscaneables } from '../../../lib/auditoria/custodiaApi'
import { rpc } from '../../../lib/api'
import { horaClienteISO } from '../../../lib/auditoria/hora'
import { NOMBRE_ESTADO_SELLO, normalizarFolio } from '../../../lib/auditoria/custodia'
import { listar } from '../../../lib/auditoria/api'
import { errMsg, useDatos, EstadoConsulta } from '../comun'
import { FotoEnVivo, SelectorSucursal, useSucursalInicial, grande } from './comunCustodia'

export default function Sellos() {
  const revisa = usePermiso('auditoria.investigar')
  const [tab, setTab] = useState('verificar')
  const [sucursal, setSucursal] = useSucursalInicial()
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        { id: 'verificar', label: 'Verificar sello' }, { id: 'colocar', label: 'Colocar sello' }, { id: 'reabrir', label: 'Reabrir caja' },
        { id: 'lista', label: 'Sellos registrados', oculto: !revisa },
      ]} />
      <div style={{ marginTop: 12, maxWidth: tab === 'lista' ? 'none' : 560 }}>
        {tab !== 'lista' && <SelectorSucursal value={sucursal} onChange={setSucursal} />}
        {tab === 'verificar' && <Verificar sucursal={sucursal} />}
        {tab === 'colocar' && <Colocar sucursal={sucursal} />}
        {tab === 'reabrir' && <Reabrir sucursal={sucursal} />}
        {tab === 'lista' && revisa && <ListaSellos />}
      </div>
    </>
  )
}

function Verificar({ sucursal }) {
  const [id, setId] = useState(() => nuevoId())
  const [folio, setFolio] = useState('')
  const [intacto, setIntacto] = useState(true)
  const [peso, setPeso] = useState('')
  const [evidencia, setEvidencia] = useState(null)
  const [res, setRes] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  async function enviar() {
    setOcupado(true)
    const r = await verificarSello({ id, sucursalId: sucursal, folio, intacto, peso: peso === '' ? null : Number(peso), evidenciaId: evidencia })
    setOcupado(false)
    if (r.error) return toast.error(errMsg(r.error), { duration: 8000 })
    if (!r.data.ok) return toast.error(r.data.mensaje ?? 'No se pudo verificar', { duration: 8000 })
    setRes({ ...r.data, intacto, folio: normalizarFolio(folio), conPeso: peso !== '' })
  }
  function otra() { setRes(null); setId(nuevoId()); setFolio(''); setPeso(''); setEvidencia(null); setIntacto(true) }
  if (res) {
    const roto = !res.intacto
    return (
      <div className="card" style={{ padding: 16 }} role="status">
        <h3 style={{ marginTop: 0 }}>{roto ? <ShieldAlert size={18} style={{ verticalAlign: -3 }} /> : <CheckCircle2 size={18} style={{ verticalAlign: -3 }} />} Sello {res.folio}: verificación registrada</h3>
        {roto && <p className="text-red"><b>Sello roto.</b> Se abrió un caso y se avisó al supervisor. Si la caja se abrió con motivo, registre la reapertura con un sello nuevo.</p>}
        {res.conPeso && res.peso_coincide === true && <p>El peso <b>coincide</b>.</p>}
        {res.conPeso && res.peso_coincide === false && <p className="text-red" role="alert"><b>El peso NO coincide.</b> Abra la caja y verifique el contenido (puede venir vacía o incompleta). Se avisó al supervisor.</p>}
        <button className="btn" style={{ ...grande, width: '100%' }} onClick={otra}>Verificar otro sello</button>
      </div>
    )
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}><Scale size={16} style={{ verticalAlign: -3 }} /> Verificar sin abrir la caja</h3>
      <FormField label="Folio del sello" value={folio} onChange={e => setFolio(e.target.value.toUpperCase())} />
      <div role="radiogroup" aria-label="¿El sello está intacto?" style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button type="button" role="radio" aria-checked={intacto} className={intacto ? 'btn' : 'btn o'} style={{ ...grande, flex: 1 }} onClick={() => setIntacto(true)}>Intacto</button>
        <button type="button" role="radio" aria-checked={!intacto} className={!intacto ? 'btn' : 'btn o'} style={{ ...grande, flex: 1 }} onClick={() => setIntacto(false)}>Roto o alterado</button>
      </div>
      <FormField label="Peso en la báscula, en gramos (opcional)" type="number" inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} />
      <FotoEnVivo titulo="Foto del sello" obligatoria={false} tipoOrigen="sello" origenId={id} sucursalId={sucursal} evidenciaId={evidencia} onFoto={setEvidencia} />
      <button className="btn" style={{ ...grande, width: '100%', marginTop: 10 }} disabled={!folio.trim() || !sucursal || ocupado} onClick={enviar}>{ocupado ? 'Registrando…' : 'Registrar verificación'}</button>
    </div>
  )
}

function Colocar({ sucursal }) {
  const [id, setId] = useState(() => nuevoId())
  const [producto, setProducto] = useState('')
  const [folio, setFolio] = useState('')
  const [serie, setSerie] = useState('')
  const [evidencia, setEvidencia] = useState(null)
  const prods = useDatos(['ctl-prod-escaneables-sellos'], () => productosEscaneables())
  const conSello = useMemo(() => (prods.data?.data ?? []).filter(p => p.requiere_sello), [prods.data])
  const p = conSello.find(x => x.id === producto)
  async function enviar() {
    const r = await colocarSello({ id, sucursalId: sucursal, folio, productoId: producto, serie: p?.requiere_serie ? serie : null, evidenciaId: evidencia })
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    toast.success(`Sello ${normalizarFolio(folio)} colocado`); setId(nuevoId()); setFolio(''); setSerie(''); setEvidencia(null)
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}><Tag size={16} style={{ verticalAlign: -3 }} /> Colocar un sello</h3>
      <EstadoConsulta q={prods} />
      <FormField label="Producto con sello" as="select" value={producto} onChange={e => setProducto(e.target.value)}
        options={[{ value: '', label: conSello.length ? 'Seleccione…' : 'No hay productos con sello: el dueño los marca en Catálogo de control' }, ...conSello.map(x => ({ value: x.id, label: x.descripcion }))]} />
      {p?.requiere_serie && <FormField label="Número de serie de ESTA pieza" value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} />}
      <FormField label="Folio del sello" value={folio} onChange={e => setFolio(e.target.value.toUpperCase())} />
      <FotoEnVivo titulo="Foto del sello colocado" obligatoria={false} tipoOrigen="sello" origenId={id} sucursalId={sucursal} evidenciaId={evidencia} onFoto={setEvidencia} />
      <button className="btn" style={{ ...grande, width: '100%', marginTop: 10 }} disabled={!producto || !folio.trim() || (p?.requiere_serie && !serie.trim())} onClick={enviar}>Colocar sello</button>
    </div>
  )
}

function Reabrir({ sucursal }) {
  const [id, setId] = useState(() => nuevoId())
  const [anterior, setAnterior] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [evidencia, setEvidencia] = useState(null)
  async function enviar() {
    const r = await rpc('ctl_sello_reabrir_por_folio', { p_id: id, p_sucursal: sucursal, p_folio_anterior: anterior, p_motivo: motivo, p_nuevo_folio: nuevo, p_evidencia: evidencia, p_hora_cliente: horaClienteISO() })
    if (r.error) return toast.error(errMsg(r.error), { duration: 9000 })
    if (r.data?.ok === false) return toast.error(r.data.mensaje, { duration: 9000 })
    toast.success(`Reapertura registrada: nuevo sello ${normalizarFolio(nuevo)}`); setId(nuevoId()); setAnterior(''); setMotivo(''); setNuevo(''); setEvidencia(null)
  }
  return (
    <div className="card" style={{ padding: 14 }}>
      <h3 style={{ marginTop: 0 }}><RefreshCw size={16} style={{ verticalAlign: -3 }} /> Reabrir una caja</h3>
      <div className="hint" style={{ marginBottom: 8 }}>Si hay que abrir una caja (por ejemplo, para mostrarla a un cliente), registre el sello que se retira, el motivo y el folio del sello nuevo. Un sello roto SIN este registro es una alerta.</div>
      <FormField label="Folio del sello que se retira" value={anterior} onChange={e => setAnterior(e.target.value.toUpperCase())} />
      <FormField label="Motivo de la reapertura" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Se abrió para mostrarla a un cliente" />
      <FormField label="Folio del sello NUEVO" value={nuevo} onChange={e => setNuevo(e.target.value.toUpperCase())} />
      <FotoEnVivo titulo="Foto del sello nuevo" obligatoria={false} tipoOrigen="sello" origenId={id} sucursalId={sucursal} evidenciaId={evidencia} onFoto={setEvidencia} />
      <button className="btn" style={{ ...grande, width: '100%', marginTop: 10 }} disabled={!anterior.trim() || motivo.trim().length < 5 || !nuevo.trim()} onClick={enviar}>Registrar reapertura</button>
    </div>
  )
}

function ListaSellos() {
  const qc = useQueryClient()
  const [estado, setEstado] = useState('')
  const q = useDatos(['ctl-sellos', estado], () => listarSellos({ estado: estado || null, limite: 300 }))
  const prods = useDatos(['ctl-prod-nombres'], () => productosEscaneables())
  const sedes = useDatos(['ctl-sedes'], () => listar('v_ctl_sucursales', { limite: 100 }))
  const nombre = useMemo(() => Object.fromEntries((prods.data?.data ?? []).map(p => [p.id, p.descripcion])), [prods.data])
  const suc = useMemo(() => Object.fromEntries((sedes.data?.data ?? []).map(s => [s.id, s.nombre])), [sedes.data])
  const filas = q.data?.data ?? []
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <FormField label="Estado" as="select" value={estado} onChange={e => setEstado(e.target.value)} options={[{ value: '', label: 'Todos' }, ...Object.entries(NOMBRE_ESTADO_SELLO).map(([value, label]) => ({ value, label }))]} />
        <button className="btn o" style={{ marginBottom: 8 }} onClick={() => qc.invalidateQueries({ queryKey: ['ctl-sellos'] })}>Actualizar</button>
      </div>
      <EstadoConsulta q={q} />
      {!q.isLoading && !q.isError && !filas.length && <EmptyState title="Sin sellos" description="Aún no se coloca ningún sello. Se registran al recibir, al colocar o al reabrir una caja." />}
      {filas.length > 0 && (
        <div className="tabla-wrap"><table className="tabla">
          <thead><tr><th>Folio</th><th>Pieza</th><th>Serie</th><th>Sucursal</th><th>Estado</th><th>Colocado</th><th>Reabrió / motivo</th></tr></thead>
          <tbody>{filas.map(s => (
            <tr key={s.id}>
              <td><b>{s.folio_sello}</b></td><td>{nombre[s.producto_id] ?? '—'}</td><td>{s.numero_serie ?? '—'}</td><td>{suc[s.sucursal_id] ?? '—'}</td>
              <td><StatusBadge variante={s.estado === 'vigente' ? 'v' : s.estado === 'roto_sin_registro' ? 'r' : 'n'} label={NOMBRE_ESTADO_SELLO[s.estado]} /></td>
              <td>{fechaHora(s.colocado_en)}</td><td>{s.motivo_reapertura ?? (s.sello_anterior_id ? 'Reapertura' : '—')}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}
