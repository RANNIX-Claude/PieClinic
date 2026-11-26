// Conteo inicial de inventario por sucursal (migraciones 078 y 160). Pantalla de CAPTURA pensada para celular:
// botón grande «Escanear» (cámara/QR/código de barras; el escáner Bluetooth sigue activo) → hoja de captura a pantalla completa
// (producto, PRECIO DE VENTA y EXISTENCIA con − / +) → «Guardar» guarda precio + piezas en un solo paso y vuelve a la cámara.
// La zona/anaquel es un selector compacto (se recuerda la última; si no hay ninguna se crea «General»). Zonas, cierre, aprobación y
// últimos conteos viven en «Resumen» (tarjetas, sin tablas). Todas las escrituras van por funciones de la base.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Camera, CameraOff, Minus, Plus, Trash2, ScanLine, Lock, CheckCircle2, MapPin, X, ListChecks, ChevronDown } from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { usePermiso } from '../../../lib/permisos'
import { rpc, leer } from '../../../lib/api'
import { moneda } from '../../../lib/formato'
import { urlFirmada, BUCKETS } from '../../../lib/urlFirmada'
import PageHeader from '../../../components/ui/PageHeader'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import StatusBadge from '../../../components/ui/StatusBadge'
import { useConfirmacion } from '../../../components/ui/ConfirmDialog'
import { useLectura, useAccion, msgError, num, qty, CLAVE } from './comun'
import { sonido, vibrar } from './conteoSonido'

const ESTADO = { borrador: 'En captura', capturado: 'Zonas cerradas', autorizado: 'Aprobado', cancelado: 'Cancelado' }
const fechaCorta = v => (v ? new Date(v).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const GRANDE = { minHeight: 52, fontSize: 17 }
const clavesZona = id => `pf-ci-zona-${id}`
const leerZonaGuardada = id => { try { return localStorage.getItem(clavesZona(id)) } catch { return null } }
const guardarZona = (id, z) => { try { localStorage.setItem(clavesZona(id), z) } catch { /* sin almacenamiento */ } }

export default function ConteoInicial() {
  const qc = useQueryClient()
  const { sedes, sedeActivaId } = useApp()
  const esAdmin = usePermiso('inventario.autorizar')
  const puedeIniciar = usePermiso('conteo.iniciar')
  const puedePrecio = usePermiso('catalogo.editar')   // solo Administración fija precios (igual que Catálogo y precios)
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
  const [cambiandoZona, setCambiandoZona] = useState(false)
  const [resumen, setResumen] = useState(false)
  const zona = zonas.filas.find(z => z.id === zonaId)
  const refrescar = () => qc.invalidateQueries({ queryKey: [CLAVE] })
  const elegirZona = id => { setZonaId(id); if (conteoId && id) guardarZona(conteoId, id); setCambiandoZona(false) }

  // Zona activa: la última recordada si sigue abierta; si no, la última abierta. Sin zonas se crea «General» (no bloquea la captura).
  const creandoGeneral = useRef(false)
  useEffect(() => {
    if (!abierto || !conteoId || zonas.cargando) return
    if (zonaId && zonas.filas.some(z => z.id === zonaId)) return
    const abiertas = zonas.filas.filter(z => z.estado === 'abierta')
    const guardada = leerZonaGuardada(conteoId)
    const elegida = abiertas.find(z => z.id === guardada) ?? abiertas[abiertas.length - 1]
    if (elegida) { setZonaId(elegida.id); return }
    if (!zonas.filas.length && !creandoGeneral.current) {
      creandoGeneral.current = true
      rpc('conteo_zona_abrir', { p_conteo: conteoId, p_nombre: 'General' }).then(async r => {
        if (r.error) { toast.error(msgError(r.error)); return }
        await zonas.refrescar(); setZonaId(r.data); guardarZona(conteoId, r.data); refrescar()
      }).finally(() => { creandoGeneral.current = false })
    }
  }, [abierto, conteoId, zonas.cargando, zonas.filas, zonaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── captura ──
  const campo = useRef(null)
  const [codigo, setCodigo] = useState('')
  const [camara, setCamara] = useState(false)
  const [hoja, setHoja] = useState(null)        // hoja de captura abierta: { codigo, producto|null, nombre, cantidad, precio, precioAct, existente, metodo }
  const [guardando, setGuardando] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState(null)
  const zonaAbierta = zona?.estado === 'abierta'
  const enfocar = useCallback(() => { if (campo.current && !hoja && window.matchMedia?.('(min-width: 700px)').matches) campo.current.focus({ preventScroll: true }) }, [hoja])
  useEffect(() => { enfocar() }, [zonaId, abierto, hoja, enfocar])

  const capturar = async ({ productoId, cantidad, metodo = 'manual', zona: z = zonaId }) => {
    const r = await rpc('conteo_capturar', { p_conteo: conteoId, p_zona: z, p_producto: productoId, p_delta: 0, p_cantidad: cantidad, p_metodo: metodo })
    if (r.error) { sonido('error'); toast.error(msgError(r.error)); return null }
    refrescar(); return Number(r.data)
  }
  // Un código recién leído (escáner, cámara o teclado) abre la hoja de captura.
  const leerCodigo = async (texto, metodo = 'escaner') => {
    const c = String(texto ?? '').trim()
    if (!c || hoja) return
    if (!zonaId || !zonaAbierta) { sonido('error'); toast.error('Elige una zona abierta con «Cambiar».'); return }
    const r = await rpc('producto_por_codigo', { p_codigo: c })
    if (r.error) { sonido('error'); toast.error(msgError(r.error)); return }
    sonido('ok'); vibrar('ok')
    if (!r.data) { setHoja({ codigo: c, producto: null, nombre: '', cantidad: '1', precio: '', precioAct: null, existente: null, metodo }); return }
    const [p, k] = await Promise.all([
      leer('prp_productos', { sedeCol: false, filtros: { id: r.data.id }, columnas: 'id,precio_lista', limite: 1 }),
      leer('prp_conteo_capturas', { sedeCol: false, filtros: { conteo_id: conteoId, producto_id: r.data.id }, columnas: 'id,cantidad,zona_id', limite: 50 }),
    ])
    const precioAct = p.data?.[0]?.precio_lista ?? null
    const enZona = (k.data ?? []).find(x => x.zona_id === zonaId)
    const existente = enZona ? num(enZona.cantidad) : null
    const totalConteo = (k.data ?? []).reduce((a, x) => a + num(x.cantidad), 0)
    setHoja({ codigo: c, producto: r.data, nombre: r.data.nombre, cantidad: String(existente != null ? existente : 1), precio: precioAct != null ? String(Number(precioAct)) : '', precioAct: precioAct != null ? Number(precioAct) : null, existente, totalConteo, metodo })
  }
  const enviar = e => { e.preventDefault(); const c = codigo; setCodigo(''); leerCodigo(c, 'escaner') }
  const cerrarHoja = () => { setHoja(null); setTimeout(enfocar, 80) }

  // Precio de venta: nunca pisa un precio vigente distinto sin confirmar; queda como versión nueva en el histórico de precios.
  const fijarPrecio = async (productoId, nombre, precio) => {
    let r = await rpc('conteo_precio_fijar', { p_conteo: conteoId, p_producto: productoId, p_precio: precio, p_confirmar: false })
    if (r.error) { sonido('error'); toast.error(msgError(r.error)); return false }
    if (r.data?.requiere_confirmacion) {
      if (!(await confirmar({ titulo: 'Cambiar el precio de venta', mensaje: `«${nombre}» ya tiene precio vigente de ${moneda(r.data.anterior)}. ¿Cambiarlo a ${moneda(precio)}? El anterior queda en el histórico de Catálogo y precios.`, textoConfirmar: 'Cambiar precio' }))) return false
      r = await rpc('conteo_precio_fijar', { p_conteo: conteoId, p_producto: productoId, p_precio: precio, p_confirmar: true })
      if (r.error) { sonido('error'); toast.error(msgError(r.error)); return false }
    }
    return true
  }
  const guardarHoja = async () => {
    const h = hoja; const cant = num(h.cantidad)
    if (h.cantidad === '' || !(cant >= 0)) return toast.error('Escribe cuántas piezas hay.')
    const precio = h.precio === '' ? null : num(h.precio)
    if (!h.producto && !h.nombre.trim()) return toast.error('Escribe el nombre del producto.')
    if (!h.producto && puedePrecio && !(precio > 0)) return toast.error('Escribe el precio de venta.')
    setGuardando(true)
    try {
      const nombre = h.nombre.trim() || h.producto?.nombre; let precioFinal = h.precioAct
      if (!h.producto) {
        const r = await rpc('producto_provisional_crear', { p_conteo: conteoId, p_zona: zonaId, p_codigo: h.codigo, p_nombre: h.nombre, p_cantidad: cant, p_foto_path: null, p_precio: puedePrecio && precio > 0 ? precio : null })
        if (r.error) { sonido('error'); return toast.error(msgError(r.error)) }
        precioFinal = puedePrecio && precio > 0 ? precio : null
      } else {
        if (await capturar({ productoId: h.producto.id, cantidad: cant, metodo: h.metodo }) == null) return
        if (puedePrecio && precio > 0 && precio !== h.precioAct) { if (await fijarPrecio(h.producto.id, nombre, precio)) precioFinal = precio }
      }
      sonido('ok'); vibrar('ok'); refrescar()
      setUltimoGuardado({ nombre, cantidad: cant, precio: precioFinal })
      setHoja(null)   // la cámara (si está encendida) vuelve a abrirse sola para el siguiente producto
    } finally { setGuardando(false) }
  }

  // ── zonas ──
  const abrirZona = async () => {
    const nombre = zonaNueva.trim(); if (!nombre) return toast.error('Escribe el nombre del anaquel o zona.')
    const id = await correr(() => rpc('conteo_zona_abrir', { p_conteo: conteoId, p_nombre: nombre }))
    if (id && id !== true) { await zonas.refrescar(); setZonaNueva(''); elegirZona(id) }   // primero se recarga la lista, si no la zona recién creada se descarta
  }
  const cerrarZona = async () => {
    if (await confirmar({ titulo: `Cerrar «${zona.nombre}»`, mensaje: `Se contaron ${zona.productos} productos (${qty(zona.piezas)} piezas). Una zona cerrada ya no recibe conteos.`, textoConfirmar: 'Cerrar zona' }))
      if (await correr(() => rpc('conteo_zona_cerrar', { p_zona: zona.id }), 'Zona cerrada')) { setUltimoGuardado(null); setZonaId(null) }
  }
  const reabrirZona = async (z) => { if (await correr(() => rpc('conteo_zona_reabrir', { p_zona: z.id }), 'Zona reabierta')) { await zonas.refrescar(); elegirZona(z.id) } }

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
  const borrarCaptura = async (c) => { if (await confirmar({ titulo: 'Borrar conteo', peligro: true, mensaje: `${c.producto_nombre}: se quitan ${qty(c.cantidad)} piezas de «${c.zona_nombre}».`, textoConfirmar: 'Borrar' })) await correr(() => rpc('conteo_captura_borrar', { p_captura: c.id })) }
  const editarCaptura = async (c, valor) => { if (valor === '' || Number(valor) === num(c.cantidad)) return; await capturar({ productoId: c.producto_id, cantidad: Number(valor), zona: c.zona_id }) }

  const error = res.error
  const pendientes = conteo ? conteo.zonas_total - conteo.zonas_cerradas : 0
  if (!sede && !res.cargando) return <div className="pagina"><PageHeader titulo="Conteo inicial" /><div className="card"><EmptyState icon={MapPin} title="Sin sucursal" description="No tienes sucursales asignadas." /></div></div>

  return (
    <div className="pagina" style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 90 }}>
      {dialogo}
      <PageHeader titulo="Conteo inicial" subtitulo="Escanea, pon el precio y las piezas, y guarda"
        acciones={sedes.length > 1 && !sedeActivaId ? <select value={sedeId ?? ''} onChange={e => { setSedeId(e.target.value); setZonaId(null) }}>{sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select> : null} />
      {error && <div className="card" style={{ color: 'var(--red)', marginBottom: 10 }}>{msgError(error)}</div>}
      {res.cargando && <LoadingSpinner />}

      {!res.cargando && !conteo && (
        <div className="card"><EmptyState icon={ScanLine} title={`${sede?.nombre ?? 'La sucursal'} aún no tiene inventario inicial`}
          description="Se cuenta en un corte: un día y una hora sin ventas ni traspasos. Solo se cuenta lo que hay físicamente; lo que no se cuente quedará en 0."
          action={puedeIniciar ? <button className="btn" style={GRANDE} disabled={ocupado} onClick={iniciar}>Iniciar conteo inicial</button> : <span style={{ color: 'var(--muted)' }}>Lo inicia Administración o la supervisión.</span>} /></div>
      )}

      {conteo && (
        <>
          <div className="card" style={{ marginBottom: 10, padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b>{sede?.nombre}</b> <StatusBadge estado={conteo.estado} label={ESTADO[conteo.estado]} /> <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{conteo.folio} · {conteo.productos_contados} productos · {qty(conteo.piezas)} piezas</span>
            </div>
            {abierto && <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}><Lock size={12} style={{ verticalAlign: -2 }} /> Corte activo: la sucursal no registra ventas ni traspasos hasta aprobar o cancelar.</div>}
          </div>

          {abierto && (
            <>
              {/* zona compacta */}
              <div className="card" style={{ marginBottom: 10, padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <MapPin size={18} /> <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>Zona o anaquel</div><b data-testid="zona-actual">{zona ? zona.nombre : zonas.cargando ? '…' : 'Sin zona abierta'}</b></div>
                  <button className="btn o" style={{ minHeight: 44 }} onClick={() => setCambiandoZona(v => !v)}>Cambiar <ChevronDown size={14} style={{ verticalAlign: -2 }} /></button>
                </div>
                {cambiandoZona && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {zonas.filas.map(z => (
                      <button key={z.id} className={`btn ${z.id === zonaId ? '' : 'o'}`} style={{ minHeight: 48, justifyContent: 'flex-start' }} onClick={() => (z.estado === 'abierta' ? elegirZona(z.id) : reabrirZona(z))}>
                        {z.estado === 'cerrada' && <Lock size={13} />} {z.nombre} · {z.productos} productos{z.estado === 'cerrada' ? ' · cerrada (reabrir)' : ''}
                      </button>))}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ flex: 1, minWidth: 0, minHeight: 48, fontSize: 16 }} placeholder="Nueva zona (ej. Vitrina)" value={zonaNueva} onChange={e => setZonaNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') abrirZona() }} />
                      <button className="btn" style={{ minHeight: 48 }} disabled={ocupado} onClick={abrirZona}>Abrir</button>
                    </div>
                  </div>)}
              </div>

              {/* captura */}
              <div className="card" style={{ marginBottom: 10, padding: 12 }}>
                <button className={`btn ${camara ? 'red' : ''}`} style={{ width: '100%', minHeight: 64, fontSize: 20, fontWeight: 800 }} disabled={!zonaAbierta} onClick={() => setCamara(v => !v)} data-testid="boton-escanear">
                  {camara ? <><CameraOff size={22} style={{ verticalAlign: -4 }} /> Apagar cámara</> : <><Camera size={22} style={{ verticalAlign: -4 }} /> Escanear</>}
                </button>
                {camara && !hoja && <Camara onCodigo={c => leerCodigo(c, 'camara')} onError={m => { toast.error(m); setCamara(false) }} />}
                <form onSubmit={enviar} style={{ marginTop: 10 }}>
                  <input ref={campo} value={codigo} onChange={e => setCodigo(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="text"
                    placeholder={zonaAbierta ? 'Escáner Bluetooth o escribe el código y Enter' : 'Elige una zona abierta'} disabled={!zonaAbierta} aria-label="Código de barras" style={{ width: '100%', minHeight: 52, fontSize: 17 }} />
                </form>
                {ultimoGuardado && (
                  <div role="status" style={{ marginTop: 10, padding: 10, borderRadius: 10, background: '#e3f3dc', border: '2px solid #3b6d11', color: '#173404' }} data-testid="ultimo-guardado">
                    <CheckCircle2 size={16} style={{ verticalAlign: -3 }} /> <b>{ultimoGuardado.nombre}</b> guardado: {qty(ultimoGuardado.cantidad)} piezas{ultimoGuardado.precio != null ? ` · ${moneda(ultimoGuardado.precio)}` : ' · SIN PRECIO'}
                  </div>)}
              </div>
            </>
          )}

          <button className="btn o" style={{ width: '100%', minHeight: 52, marginBottom: 10 }} onClick={() => setResumen(v => !v)} data-testid="boton-resumen">
            <ListChecks size={18} style={{ verticalAlign: -4 }} /> {resumen ? 'Ocultar resumen' : `Resumen del conteo · ${conteo.productos_contados} productos`}
          </button>

          {resumen && (
            <div data-testid="resumen">
              <div className="grid-kpis" style={{ marginBottom: 10, gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <Dato t="Productos contados" v={conteo.productos_contados} /><Dato t="Piezas" v={qty(conteo.piezas)} />
                <Dato t="Provisionales" v={conteo.provisionales} alerta={conteo.provisionales > 0} /><Dato t="Zonas cerradas" v={`${conteo.zonas_cerradas} de ${conteo.zonas_total}`} />
                <Dato t="Del catálogo sin contar" v={conteo.sin_contar} sub="quedarán en 0" />
              </div>

              <div className="card" style={{ marginBottom: 10, padding: 12 }}>
                <h3 style={{ marginBottom: 8 }}>Últimos conteos</h3>
                {!recientes.filas.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{recientes.cargando ? 'Cargando…' : 'Todavía no hay conteos.'}</div>}
                {recientes.filas.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{c.producto_nombre}{c.producto_estado === 'provisional' && <span className="bd o" style={{ marginLeft: 6 }}>Provisional</span>}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.zona_nombre} · {fechaCorta(c.actualizado_en)} · {c.metodo}</div>
                    </div>
                    {abierto && c.zona_estado === 'abierta'
                      ? <><input key={`${c.id}-${c.cantidad}`} type="number" inputMode="decimal" min="0" step="any" defaultValue={num(c.cantidad)} style={{ width: 84, minHeight: 48, fontSize: 18, textAlign: 'right', fontWeight: 700 }} aria-label={`Cantidad de ${c.producto_nombre}`}
                          onBlur={e => editarCaptura(c, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
                        <button className="btn o" style={{ minHeight: 48, minWidth: 48 }} onClick={() => borrarCaptura(c)} aria-label="Borrar"><Trash2 size={16} /></button></>
                      : <b>{qty(c.cantidad)}</b>}
                  </div>))}
              </div>

              <div className="card" style={{ marginBottom: 10, padding: 12 }}>
                <h3 style={{ marginBottom: 8 }}>Zonas</h3>
                {!zonas.filas.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sin zonas</div>}
                {zonas.filas.map(z => (
                  <div key={z.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    <b>{z.nombre}</b> <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>· {z.estado === 'cerrada' ? 'Cerrada' : 'Abierta'} · {z.productos} productos · {qty(z.piezas)} piezas</span>
                  </div>))}
                {abierto && zonaAbierta && <button className="btn" style={{ width: '100%', minHeight: 52, marginTop: 10 }} disabled={ocupado} onClick={cerrarZona}><Lock size={15} style={{ verticalAlign: -2 }} /> Cerrar zona «{zona.nombre}» · {zona.productos} productos, {qty(zona.piezas)} piezas</button>}
              </div>

              {abierto && (
                <div className="card" style={{ padding: 12 }}>
                  <h3 style={{ marginBottom: 6 }}>Cierre y aprobación</h3>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                    {conteo.zonas_total === 0 ? 'Abre y cuenta al menos una zona.' : pendientes > 0 ? `Faltan ${pendientes} zona(s) por cerrar.` : 'Todas las zonas están cerradas.'}
                    {conteo.provisionales > 0 && ` Hay ${conteo.provisionales} producto(s) provisional(es): después completa su categoría en «Productos provisionales».`}
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {esAdmin ? <button className="btn" style={{ minHeight: 52 }} disabled={ocupado || conteo.zonas_total === 0 || pendientes > 0} onClick={aprobar}><CheckCircle2 size={15} style={{ verticalAlign: -2 }} /> Aprobar inventario inicial</button>
                      : <span style={{ color: 'var(--muted)', fontSize: 13 }}>La aprobación es de Administración.</span>}
                    {puedeIniciar && <button className="btn red" style={{ minHeight: 52 }} disabled={ocupado} onClick={cancelar}>Cancelar conteo</button>}
                  </div>
                </div>)}
            </div>
          )}
        </>
      )}

      {hoja && <HojaCaptura hoja={hoja} setHoja={setHoja} zona={zona} puedePrecio={puedePrecio} guardando={guardando} guardar={guardarHoja} cerrar={cerrarHoja} />}
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

/** Hoja de captura a pantalla completa: producto, precio de venta y existencia con − / + y teclado numérico; «Guardar» en un solo paso. */
function HojaCaptura({ hoja, setHoja, zona, puedePrecio, guardando, guardar, cerrar }) {
  const nuevo = !hoja.producto
  const cant = hoja.cantidad === '' ? 0 : num(hoja.cantidad)
  const mover = d => setHoja(h => ({ ...h, cantidad: String(Math.max(0, (h.cantidad === '' ? 0 : num(h.cantidad)) + d)) }))
  const grande = { width: '100%', minHeight: 64, fontSize: 30, fontWeight: 800, textAlign: 'center' }
  return (
    <div role="dialog" aria-label="Captura del producto" data-testid="hoja-captura"
      style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--bg, #fff)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card, #fff)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{zona?.nombre ?? ''} · código {hoja.codigo}</div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>{nuevo ? 'Producto nuevo' : hoja.producto.nombre}</div>
          {!nuevo && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{hoja.producto.sku}{hoja.producto.marca ? ` · ${hoja.producto.marca}` : ''}{hoja.producto.estado === 'provisional' ? ' · PROVISIONAL' : ''}</div>}
        </div>
        {!nuevo && <Foto path={hoja.producto.imagen_path} />}
        <button className="btn o" style={{ minHeight: 48, minWidth: 48 }} onClick={cerrar} aria-label="Cancelar captura"><X size={20} /></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'grid', gap: 16, alignContent: 'start' }}>
        {nuevo && (
          <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>Nombre del producto
            <input value={hoja.nombre} onChange={e => setHoja(h => ({ ...h, nombre: e.target.value }))} placeholder="Ej. Tobillera neopreno chica" autoComplete="off" style={{ minHeight: 56, fontSize: 20 }} />
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>Código no registrado: queda como provisional hasta que Administración le asigne categoría.</span>
          </label>)}

        {!nuevo && (
          <div data-testid="registrado" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Existencia registrada</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{qty(hoja.totalConteo ?? 0)} <span style={{ fontSize: 14, fontWeight: 600 }}>pzas</span></div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>en este conteo{hoja.existente != null ? ` · ${qty(hoja.existente)} en esta zona` : ''}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Precio de venta registrado</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{hoja.precioAct != null ? moneda(hoja.precioAct) : 'sin precio'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>precio vigente con IVA</div>
            </div>
          </div>)}

        {puedePrecio
          ? <label style={{ display: 'grid', gap: 6, fontWeight: 600 }}>{nuevo ? 'Precio de venta (con IVA) *' : 'Nuevo precio de venta (con IVA)'}
              <input type="number" inputMode="decimal" min="0" step="0.01" value={hoja.precio} onChange={e => setHoja(h => ({ ...h, precio: e.target.value }))} placeholder="$ 0.00" aria-label="Precio de venta" style={grande} />
              {!nuevo && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{hoja.precioAct != null ? 'Déjalo igual para conservar el precio; si lo cambias se pide confirmación y queda en el histórico.' : 'Este producto no tiene precio de venta todavía: captúralo aquí.'}</span>}
            </label>
          : <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>El precio de venta solo lo cambia Administración.</div>}

        <div style={{ display: 'grid', gap: 6, fontWeight: 600 }}>{nuevo ? 'Existencia (piezas)' : 'Nueva existencia (piezas)'}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="btn o" style={{ width: 72, minHeight: 64 }} onClick={() => mover(-1)} aria-label="Restar una pieza"><Minus size={28} /></button>
            <input type="number" inputMode="decimal" min="0" step="any" value={hoja.cantidad} onChange={e => setHoja(h => ({ ...h, cantidad: e.target.value }))} aria-label="Existencia en piezas" style={{ ...grande, flex: 1, minWidth: 0 }} />
            <button type="button" className="btn" style={{ width: 72, minHeight: 64 }} onClick={() => mover(1)} aria-label="Sumar una pieza"><Plus size={28} /></button>
          </div>
          {hoja.existente != null && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>Lo que pongas aquí reemplaza las {qty(hoja.existente)} que ya tenías registradas en esta zona.</span>}
        </div>
      </div>

      <div style={{ padding: '12px 14px calc(14px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border)', background: 'var(--card, #fff)' }}>
        <button className="btn" style={{ width: '100%', minHeight: 60, fontSize: 20, fontWeight: 800 }} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : `Guardar · ${qty(cant)} piezas`}</button>
      </div>
    </div>
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
        // Códigos de barras 1D: más resolución, enfoque continuo y un recuadro ancho (el de 260×140 era muy chico y el celular lo veía borroso)
        const config = {
          fps: 15,
          qrbox: w => ({ width: Math.floor(w * 0.86), height: Math.floor(w * 0.5) }),
          videoConstraints: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' }] },
        }
        await lector.start({ facingMode: 'environment' }, config, texto => {
          const ahora = Date.now()
          if (texto === ultimo.current.c && ahora - ultimo.current.t < 2000) return
          ultimo.current = { c: texto, t: ahora }; cb.current(texto)
        }, () => {})
      } catch (e) { onError?.(e?.message?.includes('Permission') ? 'Permite el acceso a la cámara en el navegador.' : `No se pudo abrir la cámara: ${e?.message ?? e}`) }
    })()
    return () => { vivo = false; if (lector) { lector.stop().catch(() => {}).finally(() => { try { lector.clear() } catch { /* ya liberada */ } }) } }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  // El video del celular sale vertical y muy alto: se muestra solo la franja central (donde está el recuadro de lectura) para verlo completo sin bajar la pantalla.
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420, height: 'min(44vh, 340px)', margin: '10px auto 0', borderRadius: 10, overflow: 'hidden', background: '#111' }}>
      <div id={id.current} style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)' }} />
    </div>
  )
}
