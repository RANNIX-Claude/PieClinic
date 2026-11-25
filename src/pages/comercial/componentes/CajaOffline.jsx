// Banda de estado de la caja sin internet: avisa que se puede seguir cobrando, cuenta los tickets por sincronizar y los sincroniza solos
// al volver la conexión (también cada 30 s y con el botón). Los tickets que el servidor rechaza quedan a la vista con su motivo; nunca se pierden.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { moneda } from '../../../lib/formato'
import { pendientes, sincronizarCola, reintentar } from '../../../lib/offline/cola'
import { useEnLinea } from './comun'

export default function CajaOffline() {
  const { user } = useApp()
  const qc = useQueryClient()
  const enLinea = useEnLinea()
  const [lista, setLista] = useState([])
  const [sincronizando, setSincronizando] = useState(false)
  const [reporte, setReporte] = useState([])      // tickets recién sincronizados: provisional → oficial
  const ocupado = useRef(false)

  const cargar = useCallback(async () => setLista((await pendientes()).filter(t => t.user_id === user?.id)), [user?.id])
  useEffect(() => { cargar() }, [cargar, enLinea])
  useEffect(() => { window.addEventListener('pf-cola', cargar); return () => window.removeEventListener('pf-cola', cargar) }, [cargar])

  const sincronizar = useCallback(async manual => {
    if (!user?.id || !navigator.onLine || ocupado.current) return
    ocupado.current = true; setSincronizando(true)
    const r = await sincronizarCola(user.id)
    ocupado.current = false; setSincronizando(false)
    await cargar()
    if (r.sincronizados.length) {
      setReporte(r.sincronizados.map(t => ({ prov: t.folio_provisional, oficial: t.folio_oficial, total: t.total })))
      toast.success(`${r.sincronizados.length} ticket${r.sincronizados.length === 1 ? '' : 's'} sincronizado${r.sincronizados.length === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['comercial'] })
    }
    if (r.conError.length && manual) toast.error(`${r.conError.length} ticket${r.conError.length === 1 ? '' : 's'} no se pudo${r.conError.length === 1 ? '' : 'ieron'} sincronizar: revisa el motivo`)
  }, [user?.id, cargar, qc])

  useEffect(() => { if (enLinea) sincronizar(false) }, [enLinea, sincronizar])
  useEffect(() => { const t = setInterval(() => sincronizar(false), 30_000); return () => clearInterval(t) }, [sincronizar])

  const conError = lista.filter(t => t.estado === 'error')
  const porSincronizar = lista.filter(t => t.estado !== 'error')
  if (enLinea && !lista.length && !reporte.length) return null
  return (
    <div className="cj-offline" role="status" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: enLinea ? 'var(--accent-light)' : '#FFF4D6', border: `1px solid ${enLinea ? 'var(--border)' : '#E5B93C'}` }}>
      {!enLinea && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CloudOff size={17} /><b>Sin conexión.</b> Puedes seguir cobrando en efectivo, tarjeta o transferencia: los tickets se guardan en este equipo y se sincronizan solos al volver el internet.</div>}
      {porSincronizar.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: enLinea ? 0 : 6 }}>
          <b>{porSincronizar.length} ticket{porSincronizar.length === 1 ? '' : 's'} por sincronizar</b>
          <span className="text-muted">{porSincronizar.map(t => `${t.folio_provisional} · ${moneda(t.total)}`).join('  ·  ')}</span>
          {enLinea && <button type="button" className="btn o" disabled={sincronizando} onClick={() => sincronizar(true)}><RefreshCw size={13} style={{ verticalAlign: -2 }} /> {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}</button>}
        </div>
      )}
      {conError.map(t => (
        <div key={t.cliente_uuid} className="text-red" style={{ marginTop: 6 }}>
          {t.folio_provisional} ({moneda(t.total)}) no se pudo sincronizar: {String(t.error).replace(/^PF\d+:?\s*/, '')}{' '}
          <button type="button" className="btn o" onClick={async () => { await reintentar(t.cliente_uuid); await cargar(); sincronizar(true) }}>Reintentar</button>
        </div>
      ))}
      {enLinea && reporte.length > 0 && porSincronizar.length === 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><CheckCircle2 size={16} color="var(--green)" /><b>Sincronizado.</b>
          {reporte.map(r => <span key={r.prov} className="bd v">{r.prov} → {r.oficial}</span>)}
          <button type="button" className="btn o" onClick={() => setReporte([])}>Cerrar</button></div>
      )}
    </div>
  )
}
