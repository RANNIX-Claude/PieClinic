// Sección «Folio de tickets» de Parámetros de los dueños (migraciones 300–302; docs/FOLIO_TICKET.md).
// El formato y el reinicio se validan en la base; la validación local (lib/comercial/folioTicket.js, mismo código) solo da respuesta inmediata.
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Ticket } from 'lucide-react'
import { rpc } from '../../../lib/api'
import { useApp } from '../../../context/AppContext'
import { validarFormato, FICHAS, REINICIOS, FORMATO_DEFECTO, REINICIO_DEFECTO } from '../../../lib/comercial/folioTicket'
import { useDatos, errMsg, EstadoConsulta } from './comun'

export default function FolioTickets() {
  const qc = useQueryClient()
  const { sedeActivaId, sedes } = useApp()
  const q = useDatos(['folio-ticket-par'], async () => { const r = await rpc('folio_ticket_parametros'); return { data: r.data ? [r.data] : [], error: r.error } })
  const par = q.data?.data?.[0]
  const [formato, setFormato] = useState(FORMATO_DEFECTO)
  const [reinicio, setReinicio] = useState(REINICIO_DEFECTO)
  const [codigos, setCodigos] = useState({})
  const [prev, setPrev] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    if (!par) return
    setFormato(par.formato); setReinicio(par.reinicio)
    setCodigos(Object.fromEntries(par.sedes.map(s => [s.id, s.codigo_corto ?? ''])))
  }, [par])

  const errorLocal = validarFormato(formato, reinicio)
  const sedeVista = sedeActivaId ?? par?.sedes?.[0]?.id
  const nombreSede = (par?.sedes ?? sedes ?? []).find(s => s.id === sedeVista)?.nombre
  const digitos = (formato.match(/\{(N+)\}/)?.[1] ?? '').length
  const cambioPendiente = par && (formato !== par.formato || reinicio !== par.reinicio)

  // Vista previa en vivo: los 3 folios siguientes de la sucursal activa (sin consumir números).
  useEffect(() => {
    if (!par || !sedeVista || errorLocal) { setPrev(null); return }
    let vivo = true
    const t = setTimeout(async () => {
      const r = await rpc('folio_ticket_proximos', { p_sede: sedeVista, p_cuantos: 3, p_formato: formato, p_reinicio: reinicio })
      if (vivo) setPrev(r.error ? { valido: false, error: errMsg(r.error) } : r.data)
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [par, sedeVista, formato, reinicio, errorLocal])

  function insertar(ficha) {
    const el = campo.current
    const a = el?.selectionStart ?? formato.length, b = el?.selectionEnd ?? formato.length
    setFormato(formato.slice(0, a) + ficha + formato.slice(b))
    requestAnimationFrame(() => { el?.focus(); const p = a + ficha.length; el?.setSelectionRange(p, p) })
  }
  function ponerDigitos(d) {
    const n = '{' + 'N'.repeat(d) + '}'
    setFormato(/\{N+\}/.test(formato) ? formato.replace(/\{N+\}/, n) : formato + n)
  }

  async function guardarFormato() {
    if (errorLocal) return toast.error(errorLocal, { duration: 6000 })
    setOcupado(true)
    const r = await rpc('guardar_folio_ticket', { p_formato: formato.trim(), p_reinicio: reinicio })
    setOcupado(false)
    if (r.error) { toast.error(errMsg(r.error), { duration: 8000 }); return }
    toast.success('Formato guardado. Aplica solo a los tickets nuevos.')
    qc.invalidateQueries({ queryKey: ['folio-ticket-par'] })
  }

  const codigoRepetido = id => { const v = codigos[id]; return v && Object.entries(codigos).some(([k, x]) => k !== id && x === v) }
  const codigoMalo = id => codigos[id] !== '' && !/^[0-9]{2}$/.test(codigos[id] ?? '')
  async function guardarCodigos() {
    const cambios = (par?.sedes ?? []).filter(s => (codigos[s.id] ?? '') !== (s.codigo_corto ?? '')).map(s => ({ sede_id: s.id, codigo_corto: codigos[s.id] }))
    if (!cambios.length) return toast('No hay cambios en los códigos.')
    setOcupado(true)
    const r = await rpc('guardar_codigos_sedes', { p: cambios })
    setOcupado(false)
    if (r.error) { toast.error(errMsg(r.error), { duration: 8000 }); return }
    toast.success('Códigos guardados. Aplican solo a los tickets nuevos.')
    qc.invalidateQueries({ queryKey: ['folio-ticket-par'] })
  }
  const hayCodigoInvalido = (par?.sedes ?? []).some(s => codigoRepetido(s.id) || codigoMalo(s.id) || !codigos[s.id])

  return (
    <div className="card" style={{ maxWidth: 720, marginTop: 16 }} data-testid="folio-tickets">
      <h3 style={{ marginTop: 0 }}><Ticket size={16} style={{ verticalAlign: -3 }} /> Folio de tickets</h3>
      <EstadoConsulta q={q} />
      {par && (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>
            El folio sigue un consecutivo por sucursal, sin importar quién emita el ticket (recepción, podólogo o encargado). <b>El cambio aplica solo a tickets nuevos</b>: los folios ya emitidos no se modifican.
          </div>
          <div className="field">
            <label htmlFor="folio-formato">Formato</label>
            <input id="folio-formato" ref={campo} value={formato} onChange={e => setFormato(e.target.value)} maxLength={40} spellCheck={false} style={{ fontFamily: 'monospace' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {FICHAS.map(f => <button key={f} type="button" className="btn o sm" style={{ fontFamily: 'monospace' }} onClick={() => insertar(f)}>{f}</button>)}
              <button type="button" className="btn o sm" onClick={() => { setFormato(par.defecto_formato); setReinicio(par.defecto_reinicio) }}>Valor por omisión</button>
            </div>
            <span className="hint">{'{SUC}'} código de la sucursal · {'{AAMMDD}'} fecha · {'{NNN}'} consecutivo (cada N es un dígito). Se permiten letras, dígitos y - . / _ ; máximo 24 caracteres.</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="folio-reinicio">El consecutivo reinicia</label>
              <select id="folio-reinicio" value={reinicio} onChange={e => setReinicio(e.target.value)}>
                {Object.entries(REINICIOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="field" style={{ minWidth: 160 }}>
              <label htmlFor="folio-digitos">Dígitos del consecutivo</label>
              <select id="folio-digitos" value={digitos || ''} onChange={e => ponerDigitos(Number(e.target.value))}>
                {!digitos && <option value="">—</option>}
                {[2, 3, 4, 5, 6, 7, 8, 9].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {errorLocal && <div className="err" role="alert" style={{ marginBottom: 8 }}>{errorLocal}</div>}
          <div data-testid="folio-vista-previa" style={{ background: 'var(--bg-soft, #f4f6f8)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div className="hint" style={{ marginBottom: 4 }}>Vista previa: los 3 folios siguientes{nombreSede ? ` de ${nombreSede}` : ''}{par.zona ? ` (día en ${par.zona})` : ''}</div>
            {errorLocal ? <span className="hint">Corrige el formato para ver la vista previa.</span>
              : prev?.valido ? <div style={{ fontFamily: 'monospace', fontSize: 16 }}>{prev.folios.map(f => <div key={f}>{f}</div>)}</div>
              : prev?.error ? <span className="err">{prev.error}</span> : <span className="hint">Calculando…</span>}
          </div>
          <button className="btn" disabled={ocupado || !!errorLocal || !cambioPendiente} onClick={guardarFormato}>Guardar formato</button>
          {!cambioPendiente && <span className="hint" style={{ marginLeft: 10 }}>Sin cambios.</span>}

          <h4 style={{ marginBottom: 4 }}>Código corto por sucursal</h4>
          <div className="hint" style={{ marginBottom: 6 }}>Dos dígitos, distinto en cada sucursal. Es el {'{SUC}'} del folio.</div>
          <table className="tabla" style={{ width: '100%' }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Sucursal</th><th style={{ width: 120 }}>Código</th></tr></thead>
            <tbody>
              {par.sedes.map(s => (
                <tr key={s.id}>
                  <td>{s.nombre}{!s.activa && <span className="hint"> (inactiva)</span>}</td>
                  <td>
                    <input aria-label={`Código de ${s.nombre}`} value={codigos[s.id] ?? ''} maxLength={2} inputMode="numeric" style={{ width: 70, fontFamily: 'monospace' }}
                      onChange={e => setCodigos({ ...codigos, [s.id]: e.target.value.replace(/\D/g, '') })} />
                    {codigoRepetido(s.id) && <span className="err" style={{ marginLeft: 6 }}>repetido</span>}
                    {!codigoRepetido(s.id) && (codigoMalo(s.id) || !codigos[s.id]) && <span className="err" style={{ marginLeft: 6 }}>2 dígitos</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" style={{ marginTop: 10 }} disabled={ocupado || hayCodigoInvalido} onClick={guardarCodigos}>Guardar códigos</button>
        </>
      )}
    </div>
  )
}
