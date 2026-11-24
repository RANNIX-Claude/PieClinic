// Paquetes, planes multisesión, membresías, gift cards y promociones (mockup 20).
// Lee prp_ofertas (+ prp_planes_adquiridos, prp_membresias, prp_gift_cards); escribe ofertas, oferta_componentes y precios.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import { usePermiso } from '../../lib/permisos'
import { actualizar, borrar, insertar, leer } from '../../lib/api'
import { fecha, hoyISO, moneda } from '../../lib/formato'
import { useApp } from '../../context/AppContext'
import PageHeader from '../../components/ui/PageHeader'
import KPICard from '../../components/ui/KPICard'
import Tabs from '../../components/ui/Tabs'
import DataTable from '../../components/ui/DataTable'
import StatusBadge from '../../components/ui/StatusBadge'
import Modal from '../../components/ui/Modal'
import FormField from '../../components/ui/FormField'
import { suma } from '../../lib/comercial/dinero'
import { nuevaVersionPrecio } from '../../lib/comercial/precios'
import { useLeer, AvisoError, ejecutar, textoError } from './componentes/comun'

const TIPOS = { paquete: 'Paquete servicio+producto', plan_multisesion: 'Plan multisesión', membresia: 'Membresía / anualidad', gift_card: 'Gift card', promocion: 'Promoción' }
const mesMas = n => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10) }

export default function Paquetes() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const puedeEditar = usePermiso('catalogo.editar')
  const [tab, setTab] = useState('todos')
  const [buscar, setBuscar] = useState('')
  const [estadoF, setEstadoF] = useState('')
  const [edit, setEdit] = useState(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['comercial'] })

  const of = useLeer('ofertas', 'prp_ofertas', { sedeCol: false, orden: { columna: 'codigo' }, limite: 500 })
  const planes = useLeer('planes-adq', 'prp_planes_adquiridos', { sedeCol: false, orden: { columna: 'caduca_el' }, limite: 500 })
  const membs = useLeer('membresias', 'prp_membresias', { sedeCol: false, orden: { columna: 'vencimiento' }, limite: 500 })
  const gifts = useLeer('gifts', 'prp_gift_cards', { sedeCol: false, orden: { columna: 'caduca_el' }, limite: 500 })

  const lista = of.filas.filter(o => (tab === 'todos' || tab === 'vendidos' || o.tipo === tab) && (!estadoF || o.estado_efectivo === estadoF) && (!buscar || `${o.codigo} ${o.nombre}`.toLowerCase().includes(buscar.toLowerCase())))
  const planesVig = planes.filas.filter(p => p.estado === 'vigente')
  const membVig = membs.filas.filter(m => m.estado === 'vigente')
  const giftsAct = gifts.filas.filter(g => g.estado === 'activa')

  const cambiarEstado = async (o, estado) => { if (await ejecutar(actualizar('ofertas', o.id, { estado }), 'Actualizado')) refrescar() }
  const contenido = o => ({
    paquete: `${o.suma_componentes ? 'Suma ' + moneda(o.suma_componentes) : 'Componentes'}`, plan_multisesion: `${o.sesiones_total} sesiones · caduca a ${o.caducidad_meses} meses`, membresia: `${o.caducidad_meses} meses · ${(o.beneficios ?? []).length} beneficios`,
    gift_card: `Saldo ${moneda(o.monto_saldo)} · caduca a ${o.caducidad_meses} meses`, promocion: `${o.usos}/${o.limite_usos ?? '∞'} usos${o.acumulable_paquete ? ' · acumulable' : ''}`,
  }[o.tipo])

  const columnas = [
    { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' }, { key: 'tipo', label: 'Tipo', render: o => TIPOS[o.tipo], valor: o => TIPOS[o.tipo], filtro: true },
    { key: 'contenido', label: 'Contenido', render: contenido, sortable: false },
    { key: 'precio', label: 'Precio', align: 'right', render: o => (o.tipo === 'promocion' ? `−${o.descuento_pct} %` : o.precio_lista == null ? '—' : moneda(o.precio_lista)), valor: o => Number(o.precio_lista ?? -o.descuento_pct ?? 0) },
    { key: 'vigencia', label: 'Vigencia', render: o => (o.vigente_hasta ? `${fecha(o.vigente_desde)} → ${fecha(o.vigente_hasta)}` : 'Sin fin'), sortable: false },
    { key: 'vendidos', label: 'Vendidos / activos', render: o => (o.tipo === 'promocion' ? `${o.usos} usos` : `${o.vendidos} / ${o.activos}`), sortable: false },
    { key: 'estado_efectivo', label: 'Estatus', render: o => <StatusBadge estado={o.estado_efectivo} variante={o.estado_efectivo === 'programada' ? 'a' : undefined} />, filtro: true },
    { key: 'acc', label: '', sortable: false, exportar: false, render: o => puedeEditar && (
      <div style={{ display: 'flex', gap: 4 }}><button className="btn o" onClick={() => setEdit(o)}>Editar</button>
        {o.estado === 'activa' && <button className="btn o" onClick={() => cambiarEstado(o, 'pausada')}>Pausar</button>}
        {o.estado === 'pausada' && <button className="btn o" onClick={() => cambiarEstado(o, 'activa')}>Activar</button>}
        {['programada'].includes(o.estado) && <button className="btn o" onClick={() => cambiarEstado(o, 'cancelada')}>Cancelar</button>}
        {['vencida', 'cancelada'].includes(o.estado_efectivo) && <button className="btn o" onClick={() => setEdit({ ...o, id: null, codigo: `${o.codigo}-COPIA`, estado: 'pausada', duplicada: true })}>Duplicar</button>}</div>) },
  ]

  return (
    <div className="pagina">
      <PageHeader titulo="Paquetes y membresías" subtitulo="Paquetes servicio+producto, planes multisesión, anualidad, gift cards y promociones con vigencia"
        acciones={puedeEditar && Object.entries(TIPOS).map(([t, l]) => <button key={t} className="btn" onClick={() => setEdit({ tipo: t, nuevo: true })}><Plus size={13} /> {l.split(' ')[0] === 'Paquete' ? 'Nuevo paquete' : t === 'plan_multisesion' ? 'Nuevo plan' : t === 'membresia' ? 'Membresía' : t === 'gift_card' ? 'Gift card' : 'Promoción'}</button>)} />
      <div className="grid-kpis" style={{ marginBottom: 12 }}>
        <KPICard title="Planes activos de pacientes" value={planesVig.length} subtitle={`${moneda(suma(planesVig.map(p => p.saldo_pendiente)))} por cobrar`} loading={planes.cargando} />
        <KPICard title="Membresías vigentes" value={membVig.length} subtitle={`${membVig.filter(m => m.dias_para_vencer <= 30).length} renuevan en 30 días`} color="var(--green)" loading={membs.cargando} />
        <KPICard title="Gift cards con saldo" value={giftsAct.length} subtitle={`${moneda(suma(giftsAct.map(g => g.saldo)))} por canjear`} color="var(--gold)" loading={gifts.cargando} />
        <KPICard title="Promociones activas" value={of.filas.filter(o => o.tipo === 'promocion' && o.estado_efectivo === 'activa').length} subtitle={`${of.filas.filter(o => o.tipo === 'promocion' && o.estado_efectivo === 'programada').length} programadas`} color="var(--accent2)" loading={of.cargando} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ id: 'todos', label: 'Todos' }, { id: 'paquete', label: 'Paquetes' }, { id: 'plan_multisesion', label: 'Planes multisesión' }, { id: 'membresia', label: 'Membresías' }, { id: 'gift_card', label: 'Gift cards' }, { id: 'promocion', label: 'Promociones' }, { id: 'vendidos', label: 'Vendidos' }]} />
      {tab !== 'vendidos' ? (
        <>
          <div className="toolbar" style={{ margin: '10px 0' }}><input placeholder="Buscar…" value={buscar} onChange={e => setBuscar(e.target.value)} /><select value={estadoF} onChange={e => setEstadoF(e.target.value)}><option value="">Estatus: todos</option>{['activa', 'programada', 'pausada', 'vencida', 'cancelada'].map(e => <option key={e}>{e}</option>)}</select></div>
          <AvisoError error={of.error} />
          <div className="card" style={{ padding: 0 }}><DataTable columnas={columnas} filas={lista} cargando={of.cargando} exportarNombre="ofertas" vacio={{ title: 'Sin ofertas', description: 'Crea paquetes, planes, membresías, gift cards o promociones con los botones de arriba.' }} /></div>
        </>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: 0 }}><div style={{ padding: '10px 14px', fontWeight: 700 }}>Planes de pacientes</div><AvisoError error={planes.error} />
            <DataTable cargando={planes.cargando} filas={planes.filas} exportarNombre="planes-adquiridos" onFila={p => nav(`/pacientes/${p.paciente_id}`)} vacio={{ title: 'Sin planes vendidos' }}
              columnas={[{ key: 'folio', label: 'Folio' }, { key: 'oferta_nombre', label: 'Plan' }, { key: 'fecha_compra', label: 'Compra', render: p => fecha(p.fecha_compra) }, { key: 'sesiones', label: 'Sesiones', render: p => `${p.sesiones_usadas}/${p.sesiones_total}`, valor: p => p.sesiones_saldo },
                { key: 'precio_sesion', label: 'Valor sesión', align: 'right', render: p => moneda(p.precio_sesion) }, { key: 'saldo_pendiente', label: 'Por cobrar', align: 'right', render: p => moneda(p.saldo_pendiente) }, { key: 'caduca_el', label: 'Caduca', render: p => <span className={p.por_caducar ? 'text-red' : ''}>{fecha(p.caduca_el)}</span>, valor: p => p.caduca_el }, { key: 'estado', label: 'Estado', render: p => <StatusBadge estado={p.estado} />, filtro: true }]} /></div>
          <div className="card" style={{ padding: 0 }}><div style={{ padding: '10px 14px', fontWeight: 700 }}>Membresías</div>
            <DataTable cargando={membs.cargando} filas={membs.filas} exportarNombre="membresias" onFila={m => nav(`/pacientes/${m.paciente_id}`)} vacio={{ title: 'Sin membresías vendidas' }}
              columnas={[{ key: 'oferta_nombre', label: 'Membresía' }, { key: 'inicio', label: 'Inicio', render: m => fecha(m.inicio) }, { key: 'vencimiento', label: 'Vence', render: m => fecha(m.vencimiento), valor: m => m.vencimiento }, { key: 'dias_para_vencer', label: 'Días', align: 'right' }, { key: 'estado', label: 'Estado', render: m => <StatusBadge estado={m.estado} />, filtro: true }]} /></div>
          <div className="card" style={{ padding: 0 }}><div style={{ padding: '10px 14px', fontWeight: 700 }}>Gift cards</div>
            <DataTable cargando={gifts.cargando} filas={gifts.filas} exportarNombre="gift-cards" vacio={{ title: 'Sin gift cards vendidas' }}
              columnas={[{ key: 'codigo', label: 'Código' }, { key: 'fecha_venta', label: 'Venta', render: g => fecha(g.fecha_venta) }, { key: 'monto_inicial', label: 'Monto', align: 'right', render: g => moneda(g.monto_inicial) }, { key: 'saldo', label: 'Saldo', align: 'right', render: g => moneda(g.saldo), valor: g => Number(g.saldo) },
                { key: 'caduca_el', label: 'Caduca', render: g => fecha(g.caduca_el) }, { key: 'beneficiario', label: 'Beneficiario' }, { key: 'estado', label: 'Estado', render: g => <StatusBadge estado={g.estado} />, filtro: true }]} /></div>
        </div>
      )}
      {edit && <EditorOferta oferta={edit} onClose={() => setEdit(null)} onListo={() => { setEdit(null); refrescar() }} />}
    </div>
  )
}

function EditorOferta({ oferta, onClose, onListo }) {
  const { sedes } = useApp()
  const nuevo = !oferta.id
  const tipo = oferta.tipo
  const serv = useLeer('of-serv', 'prp_servicios', { sedeCol: false, filtros: { estado: 'activo' }, orden: { columna: 'nombre' }, limite: 500 })
  const prod = useLeer('of-prod', 'prp_productos', { sedeCol: false, filtros: { estado: ['activo', 'sin_existencia'] }, orden: { columna: 'nombre' }, limite: 800 })
  const comps = useLeer('of-comps', 'oferta_componentes', { sedeCol: false, filtros: { oferta_id: oferta.id }, orden: { columna: 'orden' } }, !!oferta.id)
  const preciosQ = useLeer('of-precios', 'precios', { sedeCol: false, filtros: { oferta_id: oferta.id }, orden: { columna: 'vigente_desde', asc: false } }, !!oferta.id)
  const [f, setF] = useState({
    codigo: oferta.codigo ?? '', nombre: oferta.nombre ?? '', descripcion: oferta.descripcion ?? '', vigente_desde: oferta.vigente_desde ?? hoyISO(),
    vigente_hasta: oferta.vigente_hasta ?? (['paquete', 'promocion'].includes(tipo) ? mesMas(12) : ''), estado: oferta.estado ?? 'activa', servicio_base_id: oferta.servicio_base_id ?? '', sesiones_total: oferta.sesiones_total ?? 6,
    caducidad_meses: oferta.caducidad_meses ?? 12, usable_otra_sede: oferta.usable_otra_sede ?? true, monto_saldo: oferta.monto_saldo ?? '', descuento_pct: oferta.descuento_pct ?? '', limite_usos: oferta.limite_usos ?? '', acumulable_paquete: !!oferta.acumulable_paquete,
    beneficiosTxt: (oferta.beneficios ?? []).join('\n'), renovacion_aviso_dias: oferta.renovacion_aviso_dias ?? 30, sedes_aplica: oferta.sedes_aplica ?? [],
    sesiones: oferta.plantilla_sesiones?.length ? oferta.plantilla_sesiones : null, precio: oferta.precio_lista ?? '',
  })
  const [items, setItems] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const [ocupado, setOcupado] = useState(false)
  const lista = items ?? comps.filas.map(c => ({ tipo: c.tipo, id: c.servicio_id ?? c.producto_id, cantidad: Number(c.cantidad), precio_lista: c.precio_lista ?? '', aplica_en: c.aplica_en ?? '' }))
  const sesiones = f.sesiones ?? Array.from({ length: Number(f.sesiones_total) || 0 }, (_, i) => ({ nombre: `Sesión ${i + 1}`, intervalo_dias: i === 0 ? '0' : '30-35' }))
  const sumaComp = suma(lista.map(c => (Number(c.cantidad) || 0) * (Number(c.precio_lista) || 0)))
  const precioNum = Number(f.precio) || 0
  const precioDe = c => (c.tipo === 'servicio' ? serv.filas.find(s => s.id === c.id)?.precio_lista : prod.filas.find(p => p.id === c.id)?.precio_lista)

  const guardar = async () => {
    if (!f.codigo.trim() || !f.nombre.trim()) return toast.error('Código y nombre son obligatorios')
    if (tipo === 'plan_multisesion' && (!f.servicio_base_id || !(Number(f.sesiones_total) > 0))) return toast.error('Elige el servicio base y el número de sesiones')
    if (tipo === 'gift_card' && !(Number(f.monto_saldo) > 0)) return toast.error('Captura el monto de la gift card')
    if (tipo === 'promocion' && (!(Number(f.descuento_pct) > 0) || !f.vigente_hasta || !(Number(f.limite_usos) > 0))) return toast.error('Una promoción exige descuento, vigencia y límite de usos')
    if (tipo === 'paquete' && !f.vigente_hasta) return toast.error('El paquete exige fecha de fin de vigencia')
    if (tipo !== 'promocion' && !(precioNum >= 0 && f.precio !== '')) return toast.error('Captura el precio')
    setOcupado(true)
    try {
      const datos = { codigo: f.codigo.trim(), nombre: f.nombre.trim(), tipo, descripcion: f.descripcion || null, vigente_desde: f.vigente_desde, vigente_hasta: f.vigente_hasta || null, estado: f.estado,
        servicio_base_id: tipo === 'plan_multisesion' ? f.servicio_base_id : null, sesiones_total: tipo === 'plan_multisesion' ? Number(f.sesiones_total) : null,
        plantilla_sesiones: tipo === 'plan_multisesion' ? sesiones : [], caducidad_meses: ['plan_multisesion', 'membresia', 'gift_card'].includes(tipo) ? Number(f.caducidad_meses) : null, usable_otra_sede: !!f.usable_otra_sede,
        beneficios: tipo === 'membresia' ? f.beneficiosTxt.split('\n').map(s => s.trim()).filter(Boolean) : [], renovacion_aviso_dias: Number(f.renovacion_aviso_dias) || 30, monto_saldo: tipo === 'gift_card' ? Number(f.monto_saldo) : null,
        combinable_promos: false, descuento_pct: tipo === 'promocion' ? Number(f.descuento_pct) : null, limite_usos: tipo === 'promocion' ? Number(f.limite_usos) : null, acumulable_paquete: tipo === 'promocion' ? !!f.acumulable_paquete : false, sedes_aplica: f.sedes_aplica }
      let id = oferta.id
      if (id) { const r = await actualizar('ofertas', id, datos); if (r.error) throw new Error(textoError(r.error)) }
      else { const r = await insertar('ofertas', datos); if (r.error) throw new Error(textoError(r.error)); id = r.data[0].id }
      if (['paquete', 'promocion'].includes(tipo)) {
        for (const c of comps.filas) await borrar('oferta_componentes', c.id)
        const filas = lista.filter(c => c.id).map((c, i) => ({ oferta_id: id, tipo: c.tipo, servicio_id: c.tipo === 'servicio' ? c.id : null, producto_id: c.tipo === 'producto' ? c.id : null, cantidad: Number(c.cantidad) || 1, precio_lista: c.precio_lista === '' ? null : Number(c.precio_lista), aplica_en: c.aplica_en || null, orden: i }))
        if (filas.length) { const r = await insertar('oferta_componentes', filas); if (r.error) throw new Error(textoError(r.error)) }
      }
      if (tipo !== 'promocion' && f.precio !== '') {
        const actual = (preciosQ.filas ?? []).find(p => !p.sede_id && (!p.vigente_hasta))
        if (!actual || Number(actual.precio) !== precioNum) {
          const v = nuevaVersionPrecio(preciosQ.filas.filter(p => !p.sede_id), { vigente_desde: hoyISO() > f.vigente_desde ? hoyISO() : f.vigente_desde, precio: precioNum, motivo: nuevo ? 'Alta inicial' : 'Ajuste' })
          if (!v.ok) throw new Error(v.error)
          const r = await insertar('precios', { item_tipo: 'oferta', oferta_id: id, vigente_desde: v.nueva.vigente_desde, precio: precioNum, tipo_precio: 'fijo', motivo: v.nueva.motivo }); if (r.error) throw new Error(textoError(r.error))
        }
      }
      toast.success('Guardado'); onListo()
    } catch (e) { toast.error(textoError(e)) }
    setOcupado(false)
  }

  const setItem = (i, c) => setItems((items ?? lista).map((x, j) => (j === i ? { ...x, ...c } : x)))
  return (
    <Modal open onClose={onClose} size="wide" title={`${nuevo ? 'Nuevo' : 'Editar'} · ${TIPOS[tipo]}`} footer={<><button className="btn o" onClick={onClose}>Cancelar</button><button className="btn" disabled={ocupado} onClick={guardar}>Guardar</button></>}>
      <div className="grid2">
        <FormField label="Código" required value={f.codigo} onChange={e => set('codigo', e.target.value)} />
        <FormField label="Nombre" required value={f.nombre} onChange={e => set('nombre', e.target.value)} />
        <FormField label="Vigente desde" type="date" value={f.vigente_desde} onChange={e => set('vigente_desde', e.target.value)} />
        <FormField label={`Vigente hasta${['paquete', 'promocion'].includes(tipo) ? ' (obligatorio)' : ''}`} type="date" value={f.vigente_hasta} onChange={e => set('vigente_hasta', e.target.value)} />
      </div>
      <FormField label="Descripción" value={f.descripcion} onChange={e => set('descripcion', e.target.value)} />

      {tipo === 'plan_multisesion' && (<>
        <div className="grid3">
          <FormField label="Servicio base" as="select" value={f.servicio_base_id} onChange={e => set('servicio_base_id', e.target.value)} options={serv.filas.map(s => ({ value: s.id, label: s.nombre }))} />
          <FormField label="Sesiones" type="number" min="1" value={f.sesiones_total} onChange={e => { set('sesiones_total', e.target.value); set('sesiones', null) }} />
          <FormField label="Caducidad (meses)" type="number" min="1" value={f.caducidad_meses} onChange={e => set('caducidad_meses', e.target.value)} />
        </div>
        <table style={{ marginBottom: 8 }}><thead><tr><th>#</th><th>Nombre de sesión</th><th>Intervalo (días)</th></tr></thead>
          <tbody>{sesiones.map((s, i) => <tr key={i}><td>{i + 1}</td><td><input value={s.nombre} onChange={e => set('sesiones', sesiones.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} /></td><td><input value={s.intervalo_dias} style={{ width: 90 }} onChange={e => set('sesiones', sesiones.map((x, j) => (j === i ? { ...x, intervalo_dias: e.target.value } : x)))} /></td></tr>)}</tbody></table>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.usable_otra_sede} onChange={e => set('usable_otra_sede', e.target.checked)} /> Se puede usar en otra sede</label>
        <div className="text-muted" style={{ fontSize: 12.5 }}>El saldo se descuenta al atender la cita; reprogramar no consume sesión. Al caducar se pierden las sesiones sin usar, sin reembolso. Valor por sesión = precio total / sesiones{f.precio ? ` = ${moneda(precioNum / Math.max(1, Number(f.sesiones_total)))}` : ''}.</div>
      </>)}

      {['paquete', 'promocion'].includes(tipo) && (
        <div className="card" style={{ margin: '8px 0' }}>
          <h4>{tipo === 'paquete' ? 'Componentes' : 'Aplica a (servicios o productos)'}</h4>
          <table><thead><tr><th>Tipo</th><th>Componente</th><th>Cant.</th><th>Precio lista</th><th>Aplica en</th><th /></tr></thead>
            <tbody>{lista.map((c, i) => (
              <tr key={i}><td><select value={c.tipo} onChange={e => setItem(i, { tipo: e.target.value, id: '' })}><option value="servicio">Servicio</option><option value="producto">Producto</option></select></td>
                <td><select value={c.id ?? ''} onChange={e => setItem(i, { id: e.target.value, precio_lista: precioDe({ ...c, id: e.target.value }) ?? '' })}><option value="">Elige…</option>{(c.tipo === 'servicio' ? serv.filas : prod.filas).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></td>
                <td><input type="number" min="0.01" step="0.01" style={{ width: 64 }} value={c.cantidad} onChange={e => setItem(i, { cantidad: e.target.value })} /></td>
                <td><input type="number" min="0" style={{ width: 90 }} value={c.precio_lista} onChange={e => setItem(i, { precio_lista: e.target.value })} /></td>
                <td><input value={c.aplica_en} placeholder="Cita 1" onChange={e => setItem(i, { aplica_en: e.target.value })} /></td>
                <td><button className="btn o" onClick={() => setItems(lista.filter((_, j) => j !== i))}><X size={12} /></button></td></tr>))}</tbody></table>
          <button className="btn o" style={{ marginTop: 6 }} onClick={() => setItems([...lista, { tipo: 'servicio', id: '', cantidad: 1, precio_lista: '', aplica_en: '' }])}><Plus size={12} /> Agregar componente</button>
          {tipo === 'paquete' && <div style={{ marginTop: 8, fontSize: 13 }}>Suma de componentes <b>{moneda(sumaComp)}</b>{precioNum > 0 && sumaComp > 0 && <> · ahorro <b>{moneda(sumaComp - precioNum)}</b> ({Math.round(((sumaComp - precioNum) / sumaComp) * 100)} %)</>}. Descuenta inventario de la sede donde se entrega.</div>}
        </div>
      )}

      {tipo === 'membresia' && (<>
        <div className="grid2"><FormField label="Vigencia (meses)" type="number" min="1" value={f.caducidad_meses} onChange={e => set('caducidad_meses', e.target.value)} /><FormField label="Aviso de renovación (días antes)" type="number" min="0" value={f.renovacion_aviso_dias} onChange={e => set('renovacion_aviso_dias', e.target.value)} /></div>
        <FormField label="Beneficios (uno por línea; cada clínica define los suyos)" as="textarea" rows={4} value={f.beneficiosTxt} onChange={e => set('beneficiosTxt', e.target.value)} placeholder={'12 quiropodias básicas\n10 % en productos'} />
      </>)}
      {tipo === 'gift_card' && (<>
        <div className="grid2"><FormField label="Monto / saldo" type="number" min="1" value={f.monto_saldo} onChange={e => { set('monto_saldo', e.target.value); if (f.precio === '') set('precio', e.target.value) }} /><FormField label="Caducidad (meses)" type="number" min="1" value={f.caducidad_meses} onChange={e => set('caducidad_meses', e.target.value)} /></div>
        <div className="text-muted" style={{ fontSize: 12.5 }}>Código generado al vender (GC-XXXX-XXXX). La venta es un pasivo; el ingreso se reconoce al canjear. No se combina con promociones (plazo a validar con abogado).</div>
      </>)}
      {tipo === 'promocion' && (<>
        <div className="grid3"><FormField label="Descuento %" type="number" min="1" max="100" value={f.descuento_pct} onChange={e => set('descuento_pct', e.target.value)} /><FormField label="Límite de usos" type="number" min="1" value={f.limite_usos} onChange={e => set('limite_usos', e.target.value)} /><label style={{ fontSize: 13, alignSelf: 'center' }}><input type="checkbox" checked={f.acumulable_paquete} onChange={e => set('acumulable_paquete', e.target.checked)} /> Acumulable con paquete</label></div>
        <div className="field"><label>Sedes (ninguna marcada = todas)</label><div style={{ display: 'flex', gap: 12, fontSize: 13 }}>{sedes.map(s => <label key={s.id}><input type="checkbox" checked={f.sedes_aplica.includes(s.id)} onChange={e => set('sedes_aplica', e.target.checked ? [...f.sedes_aplica, s.id] : f.sedes_aplica.filter(x => x !== s.id))} /> {s.nombre}</label>)}</div></div>
        <div className="text-muted" style={{ fontSize: 12.5 }}>Una sola promoción por línea; las de paquete tienen prioridad. Descuentos mayores a 10 % piden PIN de Administrador a Recepción al cobrar.</div>
      </>)}
      {tipo !== 'promocion' && <FormField label={tipo === 'gift_card' ? 'Precio de venta' : tipo === 'plan_multisesion' ? 'Precio total del plan (IVA incluido)' : 'Precio (IVA incluido)'} required type="number" min="0" step="0.01" value={f.precio} onChange={e => set('precio', e.target.value)} hint="Cada cambio crea una versión en el histórico de precios" />}
      <FormField label="Estatus" as="select" value={f.estado} onChange={e => set('estado', e.target.value)} options={['activa', 'programada', 'pausada', 'cancelada'].map(v => ({ value: v, label: v }))} />
      <AvisoError error={serv.error ?? comps.error} />
    </Modal>
  )
}
