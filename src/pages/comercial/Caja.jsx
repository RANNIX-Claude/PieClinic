// Caja y tickets (mockup 17): turno de caja, cobro, tickets del día y corte de caja. Lee prp_turnos_caja y delega en las pestañas.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Lock, Unlock } from 'lucide-react'
import toast from 'react-hot-toast'
import { useApp } from '../../context/AppContext'
import { usePermiso } from '../../lib/permisos'
import { insertar, leer } from '../../lib/api'
import { fechaHora, moneda } from '../../lib/formato'
import Tabs from '../../components/ui/Tabs'
import FormField from '../../components/ui/FormField'
import CajaCobro from './componentes/CajaCobro'
import CajaTickets from './componentes/CajaTickets'
import CajaCorte from './componentes/CajaCorte'
import { useLeer, useLeerOffline, AvisoError, ejecutar } from './componentes/comun'
import CajaOffline from './componentes/CajaOffline'
import CajaCajon from './componentes/CajaCajon'
import CajaPedidos from '../plataforma/pedidos/CajaPedidos'
import { puedeVender, entregaPendiente, avisoEntregaPendiente } from '../../lib/comercial/cajaControl'

export default function Caja() {
  const { user, sedes, sedeActivaId, sedeActiva, soloLectura } = useApp()
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  const puedeTurno = usePermiso('caja.turno')
  const puedeCobrar = usePermiso('ventas.cobrar')
  const [tab, setTab] = useState(sp.get('tab') ?? 'cobro')
  const [apertura, setApertura] = useState({ caja: 'Caja 1', nombre: '', fondo: '0' })
  const [ocupado, setOcupado] = useState(false)
  const turnoQ = useLeerOffline('turno-abierto', 'prp_turnos_caja', { filtros: { estado: 'abierto', cajero_id: user?.id }, limite: 5 }, !!sedeActivaId && !!user)
  const turno = turnoQ.filas[0] ?? null
  const refrescar = () => qc.invalidateQueries({ queryKey: ['comercial'] })
  // Relevo de turno (Etapa 4): «El turno anterior no ha sido aceptado». El candado de verdad es del servidor (trigger sobre ventas); esto solo avisa ANTES de teclear el ticket,
  // al abrir el turno y cada 20 s. Nunca muestra montos ni diferencias.
  const [bloqueo, setBloqueo] = useState(null)
  useEffect(() => {
    if (!sedeActivaId || !turno?.id || !navigator.onLine) { setBloqueo(null); return }
    let vivo = true
    const revisar = async () => {
      const [a, b] = await Promise.all([puedeVender(sedeActivaId), entregaPendiente(turno.id)])
      if (vivo) setBloqueo(avisoEntregaPendiente(a.data, b.data))
    }
    revisar(); const t = setInterval(revisar, 20000)
    return () => { vivo = false; clearInterval(t) }
  }, [sedeActivaId, turno?.id])

  // Corte de conteo inicial: mientras la sucursal tiene un conteo inicial abierto con corte, el servidor rechaza ventas (trigger de movimientos_inventario).
  // Se avisa desde que se abre la caja, no al cobrar. Si no se puede leer el conteo, no bloquea: el candado de verdad es del servidor.
  const [enConteo, setEnConteo] = useState(false)
  useEffect(() => {
    if (!sedeActivaId || !navigator.onLine) { setEnConteo(false); return }
    let vivo = true
    const revisar = async () => {
      const r = await leer('conteos_fisicos', { sedeCol: false, filtros: { sede_id: sedeActivaId, tipo: 'inicial', estado: ['borrador', 'capturado'] }, columnas: 'id,corte_en', limite: 20 })
      if (vivo && !r.error) setEnConteo(r.data.some(c => c.corte_en))
    }
    revisar(); const t = setInterval(revisar, 30000)
    return () => { vivo = false; clearInterval(t) }
  }, [sedeActivaId])
  const avisoConteo = enConteo ? 'No se puede generar un nuevo ticket: esta sucursal está en conteo inicial de inventario.' : null
  const bloqueoTotal = avisoConteo ?? bloqueo

  const abrir = async () => {
    if (!(Number(apertura.fondo) >= 0)) return toast.error('Fondo inicial inválido')
    setOcupado(true)
    const ok = await ejecutar(insertar('turnos_caja', { sede_id: sedeActivaId, caja: apertura.caja.trim() || 'Caja 1', nombre_turno: apertura.nombre.trim() || null, fondo_inicial: Number(apertura.fondo) || 0 }), 'Turno abierto')
    setOcupado(false)
    if (ok) refrescar()
  }
  const cambiarTab = t => { setTab(t); const n = new URLSearchParams(sp); n.set('tab', t); setSp(n, { replace: true }) }

  return (
    <div className="pagina">
      <div className="cj-barra">
        <div className="cj-barra-info"><b>Caja y tickets</b>{sedeActivaId ? <span>Sede {sedeActiva?.nombre}{turno ? ` · ${turno.caja} · turno abierto ${fechaHora(turno.apertura_en)} · fondo ${moneda(turno.fondo_inicial)}` : ' · sin turno abierto'}</span> : <span>Elige una sede en el encabezado</span>}
          {turno && <span className="bd v"><Unlock size={12} style={{ verticalAlign: -1 }} /> Turno abierto</span>}</div>
        {sedeActivaId && <CajaOffline />}
        {sedeActivaId && turno && puedeCobrar && <CajaCajon sedeId={sedeActivaId} turno={turno} deshabilitado={soloLectura || !navigator.onLine} />}
        {sedeActivaId && <Tabs items={[{ id: 'cobro', label: 'Cobro' }, { id: 'tickets', label: 'Tickets del día' }, { id: 'pedidos', label: 'Pedidos' }, { id: 'corte', label: 'Corte de turno' }]} value={tab} onChange={cambiarTab} />}
      </div>
      {!sedeActivaId ? (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>Caja opera por sede. Elige una sede en el selector del encabezado{sedes.length ? '' : ' (no tienes sedes asignadas)'}.</div>
      ) : (
        <>
          <AvisoError error={turnoQ.error} titulo="No se pudo leer el turno de caja" />
          {bloqueo && <div className="card" role="alert" style={{ borderLeft: '4px solid var(--red)', marginBottom: 10, fontWeight: 600 }}>{bloqueo} No se pueden registrar ventas hasta que quien entra acepte la entrega del turno.</div>}
          {avisoConteo && <div className="card" role="alert" style={{ borderLeft: '4px solid var(--red)', marginBottom: 10, fontWeight: 600 }}>{avisoConteo} No se registran ventas ni traspasos hasta que un administrador o supervisor apruebe o cancele el conteo (Inventario › Conteo inicial).</div>}
          {!turno && !turnoQ.cargando && (
            <div className="card" style={{ maxWidth: 560, marginBottom: 10 }}>
              <h3 style={{ marginBottom: 8 }}><Lock size={16} style={{ verticalAlign: -3 }} /> Abrir turno de caja</h3>
              <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Un turno por caja y cajero. Sin turno abierto no se puede cobrar, pero sí consultar tickets.</div>
              <div className="grid3">
                <FormField label="Caja" value={apertura.caja} onChange={e => setApertura(a => ({ ...a, caja: e.target.value }))} />
                <FormField label="Turno" placeholder="Matutino" value={apertura.nombre} onChange={e => setApertura(a => ({ ...a, nombre: e.target.value }))} />
                <FormField label="Fondo inicial" type="number" min="0" step="0.01" value={apertura.fondo} onChange={e => setApertura(a => ({ ...a, fondo: e.target.value }))} />
              </div>
              {puedeTurno && !soloLectura ? <button className="btn" disabled={ocupado} onClick={abrir}>Abrir turno</button> : <div className="text-muted">Tu rol no abre turnos de caja.</div>}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {tab === 'cobro' && <CajaCobro turno={turno} bloqueo={bloqueoTotal}onListo={refrescar} onTickets={() => cambiarTab('tickets')} />}
            {tab === 'tickets' && <CajaTickets turno={turno} onCambio={refrescar} onRetomar={id => { const n = new URLSearchParams(sp); n.set('venta', id); n.set('tab', 'cobro'); setSp(n); setTab('cobro') }} />}
            {tab === 'pedidos' && <CajaPedidos turno={turno} />}
            {tab === 'corte' && <CajaCorte turno={turno} onCambio={refrescar} />}
          </div>
        </>
      )}
    </div>
  )
}
