// MIS PENDIENTES (F2.3 / F6): auditorías remotas solicitadas (con cuenta regresiva del tiempo límite, contada con la hora del SERVIDOR), cierres en captura,
// entregas por aceptar y capturas pendientes de enviar. Se consulta cada 20 s mientras la app está abierta (sondeo corto) y al volver a primer plano.
// Consultas, reportes y autorizaciones viven en escritorio.
import { useCallback, useEffect, useState } from 'react'
import { aceptarEntrega } from '../../../src/lib/auditoria/apiCierres'
import { formatoDuracion } from '../../../src/lib/auditoria/remotaAvance.js'
import { NOMBRE_TIPO_CIERRE } from '../../../src/lib/auditoria/cierres.js'
import { avisoPendientes } from '../../../src/lib/auditoria/pwaCola.js'
import { discrepanciaDeReloj } from '../../../src/lib/auditoria/pwaCamara.js'
import { cierresLocales } from '../almacen'
import { pendientesServidor } from '../datos'
import { alCambiarCola, cola, sincronizarAhora } from '../envio'
import { activarAvisos } from '../push'

const NOMBRE_OP = { cierre_abrir: 'Abrir cierre', cierre_capturar: 'Punto del cierre', cierre_foto: 'Foto del cierre', cierre_cerrar: 'Cerrar el cierre', partida: 'Partida de conteo' }

export function usePendientes(ctx) {
  const [datos, setDatos] = useState(null)
  const [cola_, setCola] = useState([])
  const [locales, setLocales] = useState([])
  const [desfase, setDesfase] = useState(ctx.ses.desfaseMs ?? 0)
  const [fallo, setFallo] = useState(false)
  const leerCola = useCallback(async () => { setCola(await cola.lista()); setLocales(await cierresLocales()) }, [])
  const recargar = useCallback(async () => {
    await leerCola()
    if (navigator.onLine === false) { setFallo(true); return }
    const r = await pendientesServidor(ctx.sucursal.id)
    if (r.error || !r.data) { setFallo(true); return }
    setFallo(false); setDatos(r.data); setDesfase(new Date(r.data.ahora).getTime() - Date.now())
  }, [ctx.sucursal.id, leerCola])
  useEffect(() => {
    recargar()
    const t = setInterval(recargar, 20000)
    const vis = () => { if (document.visibilityState === 'visible') recargar() }
    document.addEventListener('visibilitychange', vis); window.addEventListener('online', recargar)
    const off = alCambiarCola(leerCola)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', recargar); off() }
  }, [recargar, leerCola])
  const mios = cola_.filter(x => !x.usuario || x.usuario === ctx.usuario.id)
  const n = (datos?.remotas?.length ?? 0) + (datos?.entregas?.filter(e => e.puede_aceptar).length ?? 0)
  return { datos, cola: mios, locales, desfase, fallo, recargar, urgentes: n, enCola: mios.filter(x => x.estado === 'pendiente').length, rechazadas: mios.filter(x => x.estado === 'rechazada').length }
}

export default function Pendientes({ ctx, pend, enLinea, onAbrirSesion }) {
  const { datos, cola: items, locales, desfase, fallo, recargar } = pend
  const [ahora, setAhora] = useState(Date.now())
  const [aviso, setAviso] = useState(null)
  const [aceptando, setAceptando] = useState(null)
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t) }, [])
  const pendientes = items.filter(x => x.estado === 'pendiente')
  const rechazadas = items.filter(x => x.estado === 'rechazada')
  const dis = datos ? discrepanciaDeReloj(Date.now(), new Date(datos.ahora).getTime()) : null
  const enCaptura = locales.filter(c => c.usuarioId === ctx.usuario.id && c.sucursalId === ctx.sucursal.id && c.estado === 'en_captura')
  const cerradosSinEnviar = locales.filter(c => c.usuarioId === ctx.usuario.id && c.estado === 'cerrado_local')

  async function activar() { setAviso(null); const r = await activarAvisos(ctx.sucursal.id); setAviso(r) }

  return (
    <div>
      <h2>Mis pendientes</h2>
      {fallo && <div className="aviso" data-testid="pend-sin-datos">{enLinea ? 'No se pudo consultar al servidor; se reintenta solo.' : 'Sin señal: se muestran solo los pendientes guardados en el teléfono.'}</div>}
      {dis?.discrepancia && <div className="aviso rojo" role="alert" data-testid="aviso-reloj">El reloj de este teléfono difiere {Math.round(Math.abs(dis.segundos) / 60)} min de la hora del servidor. Las fotos y capturas llevan la hora del servidor; el desfase se registra.</div>}

      <section className="card" data-testid="sec-remotas">
        <h3>Auditorías remotas solicitadas</h3>
        {!datos?.remotas?.length && <div className="hint">Ninguna por ahora. Si el dueño lanza una, aparece aquí (esta pantalla se actualiza sola cada 20 s).</div>}
        {datos?.remotas?.map(s => {
          const rest = s.limite_en ? Math.max(0, Math.round((new Date(s.limite_en).getTime() - (ahora + desfase)) / 1000)) : null
          return (
            <div key={s.sesion_id} className="fila sp" style={{ padding: '8px 0' }} data-testid="remota">
              <div><b>{s.folio}</b><div className="hint">{s.sucursal} · muestra de {s.tamano_muestra ?? '—'}</div></div>
              <div style={{ textAlign: 'right' }}>
                {rest != null && <div className={`cuenta ${rest < 300 ? 'chip r' : ''}`} data-testid="cuenta-regresiva">{rest === 0 ? 'Vencida' : formatoDuracion(rest)}</div>}
                <button className="btn sm" style={{ marginTop: 4 }} disabled={rest === 0} onClick={() => onAbrirSesion(s.sesion_id)}>Contar</button>
              </div>
            </div>)
        })}
      </section>

      <section className="card" data-testid="sec-cierres">
        <h3>Cierres en captura</h3>
        {!enCaptura.length && !datos?.cierres?.length && <div className="hint">Ninguno.</div>}
        {enCaptura.map(c => <div key={c.id} className="fila sp" style={{ padding: '6px 0' }}><span>{NOMBRE_TIPO_CIERRE[c.tipo]}</span><span className="chip a">en este teléfono</span></div>)}
        {datos?.cierres?.filter(x => !enCaptura.some(c => c.serverId === x.cierre_id)).map(c => <div key={c.cierre_id} className="fila sp" style={{ padding: '6px 0' }}><span>{NOMBRE_TIPO_CIERRE[c.tipo]} · {c.folio}</span><span className="chip a">en captura</span></div>)}
        {cerradosSinEnviar.map(c => <div key={c.id} className="fila sp" style={{ padding: '6px 0' }}><span>{NOMBRE_TIPO_CIERRE[c.tipo]} cerrado</span><span className="chip">por enviar</span></div>)}
      </section>

      <section className="card" data-testid="sec-entregas">
        <h3>Entregas por aceptar</h3>
        {!datos?.entregas?.length && <div className="hint">Ninguna.</div>}
        {datos?.entregas?.map(e => (
          <div key={e.id} style={{ padding: '8px 0' }} data-testid="entrega">
            <div className="fila sp"><div><b>{e.folio}</b><div className="hint">Entrega {e.entrega} · hace {e.horas} h</div></div>
              {e.puede_aceptar ? <button className="btn sm" onClick={() => setAceptando(e)}>Contar y aceptar</button> : <span className="hint">La acepta otra persona</span>}</div>
          </div>))}
        {aceptando && <AceptarEntrega e={aceptando} enLinea={enLinea} onCerrar={() => setAceptando(null)} onListo={() => { setAceptando(null); recargar() }} />}
      </section>

      <section className="card" data-testid="sec-cola">
        <h3>Capturas pendientes de enviar</h3>
        {!items.length && <div className="hint" data-testid="cola-vacia">Todo enviado.</div>}
        {pendientes.length > 0 && <div className="aviso" data-testid="aviso-pendientes">{avisoPendientes(pendientes.length, { enLinea, ios: /iPhone|iPad|iPod/i.test(navigator.userAgent) })}</div>}
        {rechazadas.map(x => (
          <div key={x.id} className="aviso rojo" data-testid="rechazada"><b>{NOMBRE_OP[x.tipo] ?? x.tipo}</b>: {x.error}
            <div className="hint">No se pierde: queda guardada. Avisa a tu supervisor o reintenta.</div><button className="btn sm o" onClick={async () => { await cola.reintentar(x.id); sincronizarAhora({ forzar: true, usuario: ctx.usuario.id }) }}>Reintentar</button></div>))}
        {pendientes.length > 0 && <button className="btn bloque" onClick={() => sincronizarAhora({ forzar: true, usuario: ctx.usuario.id })} data-testid="enviar-ahora">Enviar ahora</button>}
      </section>

      <section className="card">
        <h3>Avisos al teléfono</h3>
        <p className="hint">Para enterarte de una auditoría remota aunque la app esté cerrada. Sin llaves de notificación el aviso es simulado (se rotula); la app igual consulta cada 20 s al estar abierta.</p>
        <button className="btn o bloque" onClick={activar} data-testid="activar-avisos">Activar avisos</button>
        {aviso && <div className={`aviso ${aviso.ok ? (aviso.simulada ? '' : 'ok') : 'rojo'}`} style={{ marginTop: 8 }} data-testid="aviso-push">{aviso.simulada && <b>SIMULADO · </b>}{aviso.mensaje}</div>}
      </section>
    </div>
  )
}

function AceptarEntrega({ e, enLinea, onCerrar, onListo }) {
  const [monto, setMonto] = useState(''), [pin, setPin] = useState(''), [error, setError] = useState(null), [res, setRes] = useState(null), [ocupado, setOcupado] = useState(false)
  async function enviar() {
    setOcupado(true); setError(null)
    const r = await aceptarEntrega({ entregaId: e.id, pin, montoContado: Number(monto) })
    setOcupado(false)
    if (r.error) return setError(r.error.message)
    if (r.data?.ok === false) return setError(r.data.mensaje ?? 'No se pudo aceptar.')
    setRes(r.data)
  }
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="cuerpo">
        <h2>Aceptar entrega {e.folio}</h2>
        {!res ? <>
          <p className="hint">Cuenta el efectivo y escribe lo que contaste. Firma con tu PIN. Necesita señal.</p>
          {!enLinea && <div className="aviso rojo">Sin señal: aceptar una entrega exige conexión (el PIN lo valida el servidor).</div>}
          <label>Efectivo contado</label><input inputMode="decimal" value={monto} onChange={ev => setMonto(ev.target.value.replace(/[^0-9.]/g, ''))} data-testid="monto-contado" />
          <label>Tu PIN</label><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={ev => setPin(ev.target.value.replace(/\D/g, ''))} data-testid="pin-entrega" />
          {error && <div className="aviso rojo" role="alert" style={{ marginTop: 8 }}>{error}</div>}
        </> : <div className="aviso ok" data-testid="entrega-resultado">{res.cuadra ? 'Cuadra. Entrega aceptada.' : 'Entrega aceptada con diferencia: se abrió un caso y se avisó a la administración.'}</div>}
      </div>
      <div className="pie">
        {!res ? <><button className="btn o" onClick={onCerrar}>Cancelar</button><button className="btn" style={{ flex: 1 }} disabled={ocupado || !enLinea || monto === '' || pin.length < 4} onClick={enviar}>{ocupado ? 'Enviando…' : 'Aceptar'}</button></>
          : <button className="btn bloque" onClick={onListo}>Listo</button>}
      </div>
    </div>
  )
}
