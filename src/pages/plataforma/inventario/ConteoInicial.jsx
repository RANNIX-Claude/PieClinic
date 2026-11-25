// Conteo inicial de inventario por sucursal (migración 078). Móvil primero: escáner Bluetooth (teclado) siempre activo, cámara opcional, zonas,
// producto provisional si el código no existe, resumen y aprobación (solo Administración). Todas las escrituras van por funciones de la base.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Camera, CameraOff, Keyboard, Minus, Plus, Trash2, ScanLine, AlertTriangle, Lock, CheckCircle2, MapPin } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { rpc } from '../../../lib/api'
import { urlFirmada, BUCKETS } from '../../../lib/urlFirmada'
import PageHeader from '../../../components/ui/PageHeader'
import Modal from '../../../components/ui/Modal'
import FormField from '../../../components/ui/FormField'
import StatusBadge from '../../../components/ui/StatusBadge'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import SubirComprobante from '../../finanzas/componentes/SubirComprobante'
import { useLectura, useAccion, msgError, num, qty, CLAVE } from './comun'
import { sonido, vibrar } from './conteoSonido'

const ESTADO = { borrador: 'En captura', capturado: 'Zonas cerradas', autorizado: 'Aprobado', cancelado: 'Cancelado' }
const fechaCorta = v => (v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

export default function ConteoInicial() {
  const qc = useQueryClient()
  const { sedes, sedeActivaId } = useApp()
  const esAdmin = usePermiso('inventario.autorizar')
  const puedeIniciar = usePermiso('conteo.iniciar')
  const { correr, ocupado } = useAccion()
  const { confirmar, dialogo } = useConfirmacion()
  const [sedeId, setSedeId] = useState(sedeActivaId ?? sedes[0]?.id ?? null)
  useEffect(() => { if (sedeActivaId) setSedeId(sedeActivaId); else if (!sedeId && sedes[0]) setSedeId(sedes[0].id) }, [sedeActivaId, sedes]) // eslint-disable-line react-hooks/exhaustive-deps
  const sede = sedes.find(s => s.id === sedeId)

  const res = useLectura('ci-res', 'prp_conteo_inicial_resumen', { sedeId, orden: [{ columna: 'created_at', asc: false }], limite: 10 }, !!sedeId)
  const conteo = useMemo(() => res.filas.find(c => ['borrador', 'capturado'].includes(c.estado)) ?? res.filas.find(c => c.estado === 'autorizado') ?? null, [res.filas])
  const abierto = !!conteo && ['borrador', 'capturado'].includes(conteo.estado)
  const conteoId = conteo?.conteo_id
  const zonas = useLectura('ci-zonas', 'prp_conteo_zonas', { sedeId, filtros: { conteo_id: conteoId }, orden: [{ columna: 'abierta_en' }] }, !!conteoId)
  const recientes = useLectura('ci-cap', 'prp_conteo_capturas', { sedeId, filtros: { conteo_id: conteoId }, orden: [{ columna: 'actualizado_en', asc: false }], limite: 25 }, !!conteoId)

  const [zonaId, setZonaId] = useState(null)
  const [zonaNueva, setZonaNueva] = useState('')
  const zona = zonas.filas.find(z => z.id === zonaId)
  useEffect(() => { if (zonaId && !zonas.filas.some(z => z.id === zonaId)) setZonaId(null) }, [zonas.filas, zonaId])
  const refrescar = () => qc.invalidateQueries({ queryKey: [CLAVE] })

  // ── escaneo ──
  const campo = useRef(null)
  const [codigo, setCodigo] = useState('')
  const [tecladoVirtual, setTecladoVirtual] = useState(false)
  const [ultimo, setUltimo] = useState(null)        // { producto, cantidad }
  const [noEncontrado, setNoEncontrado] = useState(null)
  const [camara, setCamara] = useState(false)
  const [alta, setAlta] = useState(null)
  const enfocar = useCallback(() => { if (campo.current && !alta) campo.current.focus({ preventScroll: true }) }, [alta])
  useEffect(() => {
    const f = e => { if (!/^(INPUT|BUTTON|SELECT|TEXTAREA|A|LABEL)$/.test(e.target.tagName)) enfocar() }
    window.addEventListener('click', f); return () => window.removeEventListener('click', f)
  }, [enfocar])
  useEffect(() => { enfocar() }, [zonaId, abierto, enfocar])

  const capturar = async ({ productoId, delta = 1, cantidad = null, metodo = 'escaner', zona: z = zonaId }) => {
    const r = await rpc('conteo_capturar', { p_conteo: conteoId, p_zona: z, p_producto: productoId, p_delta: delta, p_cantidad: cantidad, p_metodo: metodo })
    if (r.error) { sonido('error'); toast.error(msgError(r.error)); return null }
    refrescar(); return Number(r.data)
  }
  const leerCodigo = async (texto, metodo = 'escaner') => {
    const c = String(texto ?? '').trim()
    if (!c) return
    if (!zonaId || zona?.estado !== 'abierta') { sonido('error'); toast.error('Abre o elige una zona antes de contar.'); return }
    const r = await rpc('producto_por_codigo', { p_codigo: c })
    if (r.error) { sonido('error'); toast.error(msgError(r.error)); return }
    if (!r.data) { sonido('error'); vibrar('error'); setUltimo(null); setNoEncontrado(c); return }
    const n = await capturar({ productoId: r.data.id, delta: 1, metodo })
    if (n == null) return
    setNoEncontrado(null); setUltimo({ producto: r.data, cantidad: n }); sonido('ok'); vibrar('ok')
  }
  const enviar = e => { e.preventDefault(); const c = codigo; setCodigo(''); leerCodigo(c, 'escaner'); enfocar() }
  const ajustar = async (delta) => { const n = await capturar({ productoId: ultimo.producto.id, delta, metodo: 'manual' }); if (n != null) setUltimo(u => ({ ...u, cantidad: n })) }
  const fijar = async (valor) => { if (valor === '' || Number.isNaN(Number(valor))) return; const n = await capturar({ productoId: ultimo.producto.id, delta: 0, cantidad: Number(valor), metodo: 'manual' }); if (n != null) setUltimo(u => ({ ...u, cantidad: n })) }

  // ── zonas ──
  const abrirZona = async () => {
    const nombre = zonaNueva.trim(); if (!nombre) return toast.error('Escribe el nombre del anaquel o zona.')
    const id = await correr(() => rpc('conteo_zona_abrir', { p_conteo: conteoId, p_nombre: nombre }))
    if (id && id !== true) { setZonaId(id); setZonaNueva('') }
  }
  const cerrarZona = async () => {
    if (await confirmar({ titulo: `Cerrar «${zona.nombre}»`, mensaje: `Se contaron ${zona.productos} productos (${qty(zona.piezas)} piezas). Una zona cerrada ya no recibe conteos.`, textoConfirmar: 'Cerrar zona' }))
      if (await correr(() => rpc('conteo_zona_cerrar', { p_zona: zona.id }), 'Zona cerrada')) setUltimo(null)
  }
  const reabrirZona = async (z) => { await correr(() => rpc('conteo_zona_reabrir', { p_zona: z.id }), 'Zona reabierta') }

  // ── conteo ──
  const iniciar = async () => {
    if (await confirmar({ titulo: 'Iniciar conteo inicial', mensaje: `Se inicia el corte de ${sede?.nombre}: mientras el conteo esté abierto la sucursal NO podrá registrar ventas ni traspasos. Hazlo en un día y hora sin movimiento.`, textoConfirmar: 'Iniciar corte' }))
      await correr(() => rpc('conteo_inicial_iniciar', { p_sede: sedeId }), 'Conteo iniciado')
  }
  const aprobar = async () => {
    if (await confirmar({ titulo: 'Aprobar inventario inicial', mensaje: `Se generará el inventario inicial de ${sede?.nombre}: ${conteo.productos_contados} productos, ${qty(conteo.piezas)} piezas. Lo que no se contó queda en 0 y el conteo ya no se podrá editar. La sucursal vuelve a vender.`, textoConfirmar: 'Aprobar' }))
      await correr(() => rpc('conteo_inicial_aprobar', { p_conteo: conteoId }), 'Inventario inicial aprobado')
  }
  const cancelar = async () => {
    if (await confirmar({ titulo: 'Cancelar conteo', peligro: true, mensaje: 'No se genera inventario y se levanta el corte de la sucursal.', textoConfirmar: 'Cancelar conteo' }))
      await correr(() => rpc('conteo_inicial_cancelar', { p_conteo: conteoId }), 'Conteo cancelado')
  }
  const borrarCaptura = async (c) => { if (await confirmar({ titulo: 'Borrar conteo', peligro: true, mensaje: `${c.producto_nombre}: se quitan ${qty(c.cantidad)} piezas de «${c.zona_nombre}».`, textoConfirmar: 'Borrar' })) { await correr(() => rpc('conteo_captura_borrar', { p_captura: c.id })); setUltimo(u => (u?.producto.id === c.producto_id ? null : u)) } }
  const editarCaptura = async (c, valor) => { if (valor === '' || Number(valor) === num(c.cantidad)) return; await capturar({ productoId: c.producto_id, delta: 0, cantidad: Number(valor), metodo: 'manual', zona: c.zona_id }) }

  const error = res.error
  if (!sede && !res.cargando) return <div className="pagina"><PageHeader titulo="Conteo inicial" /><div className="card"><EmptyState icon={MapPin} title="Sin sucursal" description="No tienes sucursales asignadas." /></div></div>

  return (
    <div className="pagina">
      {dialogo}
      <PageHeader titulo="Conteo inicial de inventario" subtitulo="Cuenta con la cámara o un escáner Bluetooth; cada lectura suma 1 pieza"
        acciones={sedes.length > 1 && !sedeActivaId ? <select value={sedeId ?? ''} onChange={e => { setSedeId(e.target.value); setZonaId(null); setUltimo(null) }}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select> : null} />
      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 10 }}>{msgError(error)}</div>}
      {res.cargando && <LoadingSpinner />}

      {!res.cargando && !conteo && (
        <div className="card"><EmptyState icon={ScanLine} title={`${sede?.nombre ?? 'La sucursal'} aún no tiene inventario inicial`}
          description="Se cuenta en un corte: un día y una hora sin ventas ni traspasos. Solo se cuenta lo que hay físicamente; lo que no se cuente quedará en 0."
          action={puedeIniciar ? <button className="btn" disabled={ocupado} onClick={iniciar}>Iniciar conteo inicial</button> : <span style={{ color: 'var(--muted)' }}>Lo inicia Administración o la supervisión.</span>} /></div>
      )}

      {conteo && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>{sede?.nombre}</b> <StatusBadge estado={conteo.estado} label={ESTADO[conteo.estado]} /> <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{conteo.folio} · corte {fechaCorta(conteo.corte_en ?? conteo.created_at)}</span>
            </div>
            {abierto && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--gold-light, #fdf0d6)', fontSize: 13 }}><Lock size={13} style={{ verticalAlign: -2 }} /> Corte activo: esta sucursal no registra ventas ni traspasos hasta aprobar o cancelar el conteo.</div>}
            <div className="grid-kpis" style={{ marginTop: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <Dato t="Productos contados" v={conteo.productos_contados} /><Dato t="Piezas" v={qty(conteo.piezas)} />
              <Dato t="Provisionales" v={conteo.provisionales} alerta={conteo.provisionales > 0} /><Dato t="Zonas cerradas" v={`${conteo.zonas_cerradas} de ${conteo.zonas_total}`} />
              <Dato t="Del catálogo sin contar" v={conteo.sin_contar} sub="quedarán en 0" />
            </div>
          </div>

          {abierto && (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginBottom: 8 }}>1 · Anaquel o zona</h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {zonas.filas.map(z => (
                    <button key={z.id} className={`btn ${z.id === zonaId ? '' : 'o'} sm`} onClick={() => { setZonaId(z.id); setUltimo(null); setNoEncontrado(null) }}>
                      {z.estado === 'cerrada' && <Lock size={11} style={{ verticalAlign: -1 }} />} {z.nombre} · {z.productos}
                    </button>))}
                  {!zonas.filas.length && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Sin zonas todavía: escribe el nombre del primer anaquel.</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ flex: 1, minWidth: 0 }} placeholder="Nueva zona (ej. Anaquel 1, Vitrina)" value={zonaNueva} onChange={e => setZonaNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') abrirZona() }} />
                  <button className="btn o" disabled={ocupado} onClick={abrirZona}>Abrir zona</button>
                </div>
                {zona?.estado === 'cerrada' && <div style={{ marginTop: 8, fontSize: 13 }}>La zona «{zona.nombre}» está cerrada. {puedeIniciar && <button className="btn o sm" onClick={() => reabrirZona(zona)}>Reabrir</button>}</div>}
              </div>

              <div className="card" style={{ marginBottom: 12 }}>
                <h3 style={{ marginBottom: 8 }}>2 · Escanear {zona ? `— ${zona.nombre}` : ''}</h3>
                <form onSubmit={enviar} style={{ display: 'flex', gap: 6 }}>
                  <input ref={campo} value={codigo} onChange={e => setCodigo(e.target.value)} autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false}
                    inputMode={tecladoVirtual ? 'text' : 'none'} placeholder={zona?.estado === 'abierta' ? 'Escanea o escribe el código y Enter' : 'Primero elige una zona abierta'}
                    disabled={!zona || zona.estado !== 'abierta'} style={{ flex: 1, minWidth: 0, fontSize: 18, padding: '12px 10px' }} aria-label="Código de barras" />
                  <button type="button" className="btn o" title="Teclado en pantalla" onClick={() => { setTecladoVirtual(v => !v); setTimeout(enfocar, 50) }}><Keyboard size={16} /></button>
                  <button type="button" className={`btn ${camara ? '' : 'o'}`} disabled={!zona || zona.estado !== 'abierta'} onClick={() => setCamara(v => !v)}>{camara ? <CameraOff size={16} /> : <Camera size={16} />}</button>
                </form>
                {camara && <Camara onCodigo={c => leerCodigo(c, 'camara')} onError={m => { toast.error(m); setCamara(false) }} />}

                {noEncontrado && (
                  <div role="alert" style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#fde4e4', border: '2px solid #b53030', color: '#5c1717' }}>
                    <b><AlertTriangle size={16} style={{ verticalAlign: -3 }} /> El código {noEncontrado} no está en el catálogo.</b>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn" onClick={() => setAlta({ codigo: noEncontrado, nombre: '', cantidad: '1', foto: '' })}>Agregar producto</button>
                      <button className="btn o" onClick={() => { setNoEncontrado(null); enfocar() }}>Omitir</button>
                    </div>
                  </div>)}

                {ultimo && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#e3f3dc', border: '2px solid #3b6d11', color: '#173404' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Foto path={ultimo.producto.imagen_path} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{ultimo.producto.nombre}</div>
                        <div style={{ fontSize: 12.5, opacity: .85 }}>{ultimo.producto.sku}{ultimo.producto.marca ? ` · ${ultimo.producto.marca}` : ''}{ultimo.producto.estado === 'provisional' ? ' · PROVISIONAL' : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
                      <button className="btn o" style={{ width: 64, height: 56 }} onClick={() => ajustar(-1)} aria-label="Restar uno"><Minus size={26} /></button>
                      <input key={`${ultimo.producto.id}-${ultimo.cantidad}`} type="number" min="0" step="any" defaultValue={ultimo.cantidad} aria-label="Cantidad contada"
                        onBlur={e => fijar(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                        style={{ width: 110, height: 56, fontSize: 30, fontWeight: 800, textAlign: 'center' }} />
                      <button className="btn" style={{ width: 64, height: 56 }} onClick={() => ajustar(1)} aria-label="Sumar uno"><Plus size={26} /></button>
                    </div>
                  </div>)}
              </div>

              {zona?.estado === 'abierta' && <div style={{ marginBottom: 12 }}><button className="btn" style={{ width: '100%', padding: 12 }} disabled={ocupado} onClick={cerrarZona}><Lock size={15} style={{ verticalAlign: -2 }} /> Cerrar zona «{zona.nombre}» · {zona.productos} productos, {qty(zona.piezas)} piezas</button></div>}
            </>
          )}

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Últimos conteos</h3>
            {!recientes.filas.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{recientes.cargando ? 'Cargando…' : 'Todavía no hay conteos.'}</div>}
            {recientes.filas.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.producto_nombre}{c.producto_estado === 'provisional' && <span className="bd o" style={{ marginLeft: 6 }}>Provisional</span>}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.zona_nombre} · {c.actualizado_por_nombre ?? '—'} · {fechaCorta(c.actualizado_en)} · {c.metodo}</div>
                </div>
                {abierto && c.zona_estado === 'abierta'
                  ? <><input key={`${c.id}-${c.cantidad}`} type="number" min="0" step="any" defaultValue={num(c.cantidad)} style={{ width: 80, textAlign: 'right', fontWeight: 700 }} aria-label={`Cantidad de ${c.producto_nombre}`}
                      onBlur={e => editarCaptura(c, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                      <button className="btn o sm" onClick={() => borrarCaptura(c)} aria-label="Borrar"><Trash2 size={14} /></button></>
                  : <b>{qty(c.cantidad)}</b>}
              </div>))}
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 8 }}>Zonas</h3>
            <div className="tabla-wrap"><table><thead><tr><th>Zona</th><th>Estado</th><th style={{ textAlign: 'right' }}>Productos</th><th style={{ textAlign: 'right' }}>Piezas</th><th>Abrió</th><th>Cerró</th></tr></thead>
              <tbody>{zonas.filas.map(z => <tr key={z.id}><td>{z.nombre}</td><td>{z.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}</td><td style={{ textAlign: 'right' }}>{z.productos}</td><td style={{ textAlign: 'right' }}>{qty(z.piezas)}</td><td>{z.abierta_por_nombre ?? '—'}</td><td>{z.cerrada_en ? fechaCorta(z.cerrada_en) : '—'}</td></tr>)}
                {!zonas.filas.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 12 }}>Sin zonas</td></tr>}</tbody></table></div>
          </div>

          {abierto && (
            <div className="card">
              <h3 style={{ marginBottom: 6 }}>Cierre y aprobación</h3>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                {conteo.zonas_total === 0 ? 'Abre y cuenta al menos una zona.' : conteo.zonas_cerradas < conteo.zonas_total ? `Faltan ${conteo.zonas_total - conteo.zonas_cerradas} zona(s) por cerrar.` : 'Todas las zonas están cerradas.'}
                {conteo.provisionales > 0 && ` Hay ${conteo.provisionales} producto(s) provisional(es): después completa su precio, marca y categoría en «Productos provisionales».`}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {esAdmin ? <button className="btn" disabled={ocupado || conteo.zonas_total === 0 || conteo.zonas_cerradas < conteo.zonas_total} onClick={aprobar}><CheckCircle2 size={15} style={{ verticalAlign: -2 }} /> Aprobar inventario inicial</button>
                  : <span style={{ color: 'var(--muted)', fontSize: 13 }}>La aprobación es de Administración.</span>}
                {puedeIniciar && <button className="btn red" disabled={ocupado} onClick={cancelar}>Cancelar conteo</button>}
              </div>
            </div>)}
        </>
      )}

      {alta && <ModalAlta alta={alta} setAlta={setAlta} cerrar={() => { setAlta(null); setTimeout(enfocar, 80) }}
        guardar={async () => {
          const r = await rpc('producto_provisional_crear', { p_conteo: conteoId, p_zona: zonaId, p_codigo: alta.codigo, p_nombre: alta.nombre, p_cantidad: num(alta.cantidad), p_foto_path: alta.foto || null })
          if (r.error) { sonido('error'); return toast.error(msgError(r.error)) }
          toast.success('Producto provisional agregado y contado'); sonido('ok'); vibrar('ok')
          setUltimo({ producto: { id: r.data.id, nombre: r.data.nombre, sku: r.data.sku, estado: 'provisional' }, cantidad: num(alta.cantidad) })
          setNoEncontrado(null); setAlta(null); refrescar(); setTimeout(enfocar, 80)
        }} />}
    </div>
  )
}

function Dato({ t, v, sub, alerta }) {
  return <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--card-alt, #f6f3fa)' }}><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t}</div><div style={{ fontSize: 22, fontWeight: 800, color: alerta ? 'var(--gold)' : undefined }}>{v}</div>{sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}</div>
}

function Foto({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { let vivo = true; if (path) urlFirmada(BUCKETS.documentos, path, 600).then(u => vivo && setUrl(u)); return () => { vivo = false } }, [path])
  if (!url) return <div style={{ width: 64, height: 64, borderRadius: 8, background: 'rgba(0,0,0,.08)', display: 'grid', placeItems: 'center', flex: 'none' }}><ScanLine size={26} /></div>
  return <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, flex: 'none' }} />
}

function ModalAlta({ alta, setAlta, guardar, cerrar }) {
  const [ocupado, setOcupado] = useState(false)
  const ok = alta.nombre.trim().length > 0 && alta.cantidad !== '' && num(alta.cantidad) >= 0
  return (
    <Modal open onClose={cerrar} title="Agregar producto (provisional)" size="sm" cerrarAlClicFuera={false}
      footer={<><button className="btn o" onClick={cerrar}>Cancelar</button><button className="btn" disabled={!ok || ocupado} onClick={async () => { setOcupado(true); try { await guardar() } finally { setOcupado(false) } }}>Agregar y contar</button></>}>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>Queda como provisional: después Administración completa precio, marca y categoría y revisa que no sea un duplicado.</p>
      <FormField label="Código leído" value={alta.codigo} readOnly />
      <FormField label="Nombre del producto" required value={alta.nombre} autoFocus onChange={e => setAlta({ ...alta, nombre: e.target.value })} placeholder="Ej. Tobillera neopreno chica" />
      <FormField label="Cantidad contada" required type="number" min="0" step="any" value={alta.cantidad} onChange={e => setAlta({ ...alta, cantidad: e.target.value })} />
      <div style={{ marginTop: 6 }}><div style={{ fontSize: 12.5, marginBottom: 4 }}>Foto de la etiqueta</div>
        <SubirComprobante carpeta="conteo" capture="environment" etiqueta="Tomar foto" valor={alta.foto} onSubida={({ ruta }) => setAlta(a => ({ ...a, foto: ruta }))} /></div>
    </Modal>
  )
}

/** Cámara con html5-qrcode (usa BarcodeDetector del navegador cuando existe). Ignora la misma lectura durante 2 s. */
function Camara({ onCodigo, onError }) {
  const id = useRef(`cam-${Math.random().toString(36).slice(2, 8)}`)
  const ultimo = useRef({ c: '', t: 0 })
  const cb = useRef(onCodigo); cb.current = onCodigo
  useEffect(() => {
    let lector = null, vivo = true
    ;(async () => {
      try {
        if (!window.isSecureContext) throw new Error('La cámara necesita HTTPS.')
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
        if (!vivo) return
        lector = new Html5Qrcode(id.current, { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.QR_CODE], experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false })
        await lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, texto => {
          const ahora = Date.now()
          if (texto === ultimo.current.c && ahora - ultimo.current.t < 2000) return
          ultimo.current = { c: texto, t: ahora }; cb.current(texto)
        }, () => {})
      } catch (e) { onError?.(e?.message?.includes('Permission') ? 'Permite el acceso a la cámara en el navegador.' : `No se pudo abrir la cámara: ${e?.message ?? e}`) }
    })()
    return () => { vivo = false; if (lector) { lector.stop().catch(() => {}).finally(() => { try { lector.clear() } catch { /* ya liberada */ } }) } }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  return <div id={id.current} style={{ width: '100%', maxWidth: 420, margin: '10px auto 0', borderRadius: 10, overflow: 'hidden' }} />
}
