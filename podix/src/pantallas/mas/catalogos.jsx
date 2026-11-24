// Catálogos generales: sucursales, categorías de producto, servicios, productos, formas de pago, motivos, laboratorios,
// categorías de gasto, proveedores y convenios. Administración edita; el gerente consulta. Los precios NO se editan aquí (se enlaza
// la pantalla de Precios, que lleva motivo e historial). Duplicados, permisos y auditoría se resuelven en acciones_plataforma.js.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Buscador, Card, Chips, Confirmar, Field, Icon, Input, Select, Sheet, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { dinero, normaliza } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as P from "../../store/acciones_plataforma.js";
import { Denegado, Nota, numero, rutaDe, usePlataforma } from "../../componentes/plataforma/comun.jsx";

const act = (x, k = "activo") => x[k] !== false;
const Estado = ({ on }) => <Badge tono={on ? "ok" : "neutral"}>{on ? "Activo" : "Inactivo"}</Badge>;

/** Definición de cada catálogo: de dónde salen los registros, qué se muestra, qué campos se capturan y qué acción guarda. */
function definiciones(d, uso) {
  const cats = d.catalogos || { formasPago: [], motivos: [], categoriasProducto: [] };
  const opCat = cats.categoriasProducto.filter((c) => c.activa !== false).map((c) => [c.nombre, c.nombre]);
  return {
    sucursales: { titulo: "Sucursales", singular: "sucursal", items: d.sucursales, nombre: (x) => x.nombre, activo: (x) => act(x, "activa"),
      sub: (x) => x.direccion, datos: (x) => [`${x.consultorios.length} consultorios`, `${numero(uso.usuariosPorSucursal[x.id] || 0)} personas`, `${numero(uso.citasPorSucursal[x.id] || 0)} citas`],
      cols: [{ k: "id", t: "Clave", v: (x) => x.id }, { k: "dir", t: "Dirección", v: (x) => x.direccion }, { k: "tel", t: "Teléfono", v: (x) => x.telefono }, { k: "con", t: "Consultorios", der: true, v: (x) => x.consultorios.length, orden: (x) => x.consultorios.length }],
      campos: [{ k: "nombre", l: "Nombre" }, { k: "direccion", l: "Dirección" }, { k: "telefono", l: "Teléfono", tel: true }, { k: "consultorios", l: "Número de consultorios", num: true }],
      aForm: (x) => ({ id: x.id, nombre: x.nombre, direccion: x.direccion || "", telefono: x.telefono || "", consultorios: x.consultorios.length }), nuevo: { nombre: "", direccion: "", telefono: "", consultorios: 3 },
      guardar: P.guardarSucursal, activar: (s, x, on) => P.activarSucursal(s, x.id, on), bloqueos: (x) => P.bloqueosSucursal(d, x.id),
      nota: "Al dar de alta una sucursal se crean su almacén, sus parámetros de fábrica y su ajuste general de precio en 0 %. Después asígnale gerente y personal en Usuarios y roles.", enlace: ["parametros", "Parámetros por sucursal"] },
    categorias: { titulo: "Categorías de producto", singular: "categoría", items: cats.categoriasProducto, nombre: (x) => x.nombre, activo: (x) => act(x, "activa"),
      datos: (x) => [`${uso.productosPorCategoria[x.nombre] || 0} productos`], cols: [{ k: "n", t: "Productos", der: true, v: (x) => uso.productosPorCategoria[x.nombre] || 0, orden: (x) => uso.productosPorCategoria[x.nombre] || 0 }],
      campos: [{ k: "nombre", l: "Nombre" }], aForm: (x) => ({ id: x.id, nombre: x.nombre }), nuevo: { nombre: "" },
      guardar: P.guardarCategoriaProducto, activar: (s, x, on) => P.activarCategoriaProducto(s, x.id, on), nota: "Renombrar una categoría actualiza todos sus productos." },
    servicios: { titulo: "Servicios", singular: "servicio", items: d.servicios, nombre: (x) => x.nombre, activo: (x) => act(x),
      datos: (x) => [`${x.duracion} min`, `Lista: ${dinero(x.precioBase)}`, `${(x.consumo || []).length} insumos por receta`, `${numero(uso.vendidos.servicio[x.id] || 0)} vendidos`],
      cols: [{ k: "du", t: "Duración", der: true, v: (x) => `${x.duracion} min`, orden: (x) => x.duracion }, { k: "pr", t: "Precio de lista", der: true, v: (x) => dinero(x.precioBase), orden: (x) => x.precioBase }, { k: "ve", t: "Vendidos", der: true, v: (x) => numero(uso.vendidos.servicio[x.id] || 0), orden: (x) => uso.vendidos.servicio[x.id] || 0 }],
      campos: [{ k: "nombre", l: "Nombre" }, { k: "duracion", l: "Duración (minutos)", num: true }, { k: "precioBase", l: "Precio de lista", num: true, soloAlta: true }],
      aForm: (x) => ({ id: x.id, nombre: x.nombre, duracion: x.duracion }), nuevo: { nombre: "", duracion: 30, precioBase: "" },
      guardar: P.guardarServicio, activar: (s, x, on) => P.activarItem(s, "servicio", x.id, on), nota: "El precio se captura solo al dar de alta. Para cambiarlo usa Precios: pide motivo y guarda el historial.", enlace: ["precios", "Precios"] },
    productos: { titulo: "Productos", singular: "producto", items: d.productos, nombre: (x) => x.nombre, activo: (x) => act(x),
      sub: (x) => `${x.sku} · ${x.categoria}`, datos: (x) => [x.tipo === "venta" ? `Lista: ${dinero(x.precioBase)}` : "Insumo", `Costo: ${dinero(x.costo)}`, `Mínimo: ${x.minimo}`],
      cols: [{ k: "sku", t: "Clave", v: (x) => x.sku }, { k: "cat", t: "Categoría", v: (x) => x.categoria }, { k: "ti", t: "Tipo", v: (x) => (x.tipo === "venta" ? "Venta" : "Insumo") }, { k: "pr", t: "Precio de lista", der: true, v: (x) => (x.tipo === "venta" ? dinero(x.precioBase) : "—"), orden: (x) => x.precioBase }, { k: "mi", t: "Mínimo", der: true, v: (x) => x.minimo, orden: (x) => x.minimo }],
      campos: [{ k: "sku", l: "Clave (SKU)", hint: "Formato AAA-000" }, { k: "nombre", l: "Nombre" }, { k: "categoria", l: "Categoría", ops: opCat }, { k: "tipo", l: "Tipo", ops: [["venta", "Producto de venta"], ["insumo", "Insumo clínico"]] }, { k: "minimo", l: "Existencia mínima por sucursal", num: true }, { k: "precioBase", l: "Precio de lista", num: true, soloAlta: true, si: (f) => f.tipo === "venta" }, { k: "costo", l: "Costo de referencia", num: true, soloAlta: true }],
      aForm: (x) => ({ id: x.id, sku: x.sku, nombre: x.nombre, categoria: x.categoria, tipo: x.tipo, minimo: x.minimo }), nuevo: { sku: "", nombre: "", categoria: (opCat[0] || [""])[0], tipo: "venta", minimo: 5, precioBase: "", costo: "" },
      guardar: P.guardarProducto, activar: (s, x, on) => P.activarItem(s, "producto", x.id, on), nota: "Precio y costo se capturan solo al dar de alta. El costo real de cada salida es PEPS, por capa de compra.", enlace: ["precios", "Precios"] },
    formas: { titulo: "Formas de pago", singular: "forma de pago", items: cats.formasPago, nombre: (x) => x.nombre, activo: (x) => act(x, "activa"),
      datos: (x) => [x.sistema ? "Del sistema" : "Agregada", x.daCambio ? "Da cambio" : "Sin cambio", `${numero(uso.pagosPorForma[x.id] || 0)} pagos`],
      cols: [{ k: "id", t: "Clave", v: (x) => x.id }, { k: "or", t: "Origen", v: (x) => (x.sistema ? "Del sistema" : "Agregada") }, { k: "pa", t: "Pagos", der: true, v: (x) => numero(uso.pagosPorForma[x.id] || 0), orden: (x) => uso.pagosPorForma[x.id] || 0 }],
      campos: [{ k: "nombre", l: "Nombre" }, { k: "daCambio", l: "Da cambio (solo efectivo o equivalente)", check: true }], aForm: (x) => ({ id: x.id, nombre: x.nombre, daCambio: !!x.daCambio }), nuevo: { nombre: "", daCambio: false },
      guardar: P.guardarFormaPago, activar: (s, x, on) => P.activarFormaPago(s, x.id, on), nota: "Caja cobra hoy con efectivo, tarjeta y transferencia. Una forma nueva queda en el catálogo; para cobrar con ella falta que Caja lea este catálogo (ajuste pendiente)." },
    motivos: { titulo: "Motivos", singular: "motivo", items: cats.motivos, nombre: (x) => x.nombre, activo: (x) => act(x), grupo: (x) => P.TIPOS_MOTIVO[x.tipo] || x.tipo,
      datos: (x) => [P.TIPOS_MOTIVO[x.tipo] || x.tipo], cols: [{ k: "ti", t: "Tipo", v: (x) => P.TIPOS_MOTIVO[x.tipo] || x.tipo }],
      campos: [{ k: "tipo", l: "Tipo", ops: Object.entries(P.TIPOS_MOTIVO), soloAlta: true }, { k: "nombre", l: "Motivo" }], aForm: (x) => ({ id: x.id, tipo: x.tipo, nombre: x.nombre }), nuevo: { tipo: "devolucion", nombre: "" },
      guardar: P.guardarMotivo, activar: (s, x, on) => P.activarMotivo(s, x.id, on), nota: "Catálogo de motivos de devolución, ajuste de inventario, baja de personal y cancelación de cita. Las pantallas operativas todavía usan sus listas internas; conectarlas a este catálogo es un ajuste pendiente." },
    laboratorios: { titulo: "Laboratorios", singular: "laboratorio", items: d.laboratorios, nombre: (x) => x.nombre, activo: (x) => act(x),
      datos: (x) => [`${numero(uso.ordenesPorLab[x.id] || 0)} órdenes`, x.diasEntrega ? `${x.diasEntrega} días de entrega` : "Entrega: 14 días (por omisión)", x.contacto || "Sin contacto"],
      cols: [{ k: "id", t: "Clave", v: (x) => x.id }, { k: "co", t: "Contacto", v: (x) => x.contacto || "—" }, { k: "te", t: "Teléfono", v: (x) => x.telefono || "—" }, { k: "or", t: "Órdenes", der: true, v: (x) => numero(uso.ordenesPorLab[x.id] || 0), orden: (x) => uso.ordenesPorLab[x.id] || 0 }],
      campos: [{ k: "nombre", l: "Nombre" }, { k: "contacto", l: "Contacto" }, { k: "telefono", l: "Teléfono", tel: true }, { k: "diasEntrega", l: "Días de entrega", num: true }], aForm: (x) => ({ id: x.id, nombre: x.nombre, contacto: x.contacto || "", telefono: x.telefono || "", diasEntrega: x.diasEntrega || 14 }), nuevo: { nombre: "", contacto: "", telefono: "", diasEntrega: 14 },
      guardar: P.guardarLaboratorio, activar: (s, x, on) => P.activarLaboratorio(s, x.id, on) },
    gastos: d.fin ? { titulo: "Categorías de gasto", singular: "categoría de gasto", items: d.fin.categorias || [], nombre: (x) => x.nombre, activo: () => true, sinEstado: true,
      datos: (x) => [x.fijo ? "Gasto fijo" : "Gasto variable", x.recurrente ? "Recurrente" : "Eventual", `${numero(uso.gastosPorCategoria[x.id] || 0)} gastos`],
      cols: [{ k: "id", t: "Clave", v: (x) => x.id }, { k: "fi", t: "Tipo", v: (x) => (x.fijo ? "Fijo" : "Variable") }, { k: "re", t: "Recurrente", v: (x) => (x.recurrente ? "Sí" : "No") }, { k: "ga", t: "Gastos", der: true, v: (x) => numero(uso.gastosPorCategoria[x.id] || 0), orden: (x) => uso.gastosPorCategoria[x.id] || 0 }],
      campos: [{ k: "nombre", l: "Nombre" }, { k: "fijo", l: "Es gasto fijo", check: true }, { k: "recurrente", l: "Se repite cada mes", check: true }], aForm: (x) => ({ id: x.id, nombre: x.nombre, fijo: !!x.fijo, recurrente: !!x.recurrente }), nuevo: { nombre: "", fijo: false, recurrente: false },
      guardar: P.guardarCategoriaGasto, nota: "Las categorías alimentan el estado de resultados. No se eliminan (los gastos ya capturados las usan).", enlace: ["gastos", "Compras y gastos"] } : null,
    proveedores: { titulo: "Proveedores", singular: "proveedor", items: d.proveedores, nombre: (x) => x.nombre, activo: () => true, sinEstado: true, lectura: true,
      datos: (x) => [`Crédito: ${x.dias} días`, `${uso.ocPorProveedor[x.id] || 0} órdenes de compra`], cols: [{ k: "id", t: "Clave", v: (x) => x.id }, { k: "di", t: "Días de crédito", der: true, v: (x) => x.dias, orden: (x) => x.dias }, { k: "oc", t: "Órdenes", der: true, v: (x) => uso.ocPorProveedor[x.id] || 0, orden: (x) => uso.ocPorProveedor[x.id] || 0 }],
      nota: "Los proveedores se administran junto con las órdenes de compra y las cuentas por pagar.", enlace: ["compras", "Compras"] },
    convenios: { titulo: "Convenios", singular: "convenio", items: d.convenios, nombre: (x) => x.nombre, activo: () => true, sinEstado: true, lectura: true,
      datos: (x) => [x.tipo, `Descuento: ${x.descuentoPct} %`, `${uso.pacientesPorConvenio[x.id] || 0} pacientes`], cols: [{ k: "ti", t: "Tipo", v: (x) => x.tipo }, { k: "de", t: "Descuento", der: true, v: (x) => `${x.descuentoPct} %`, orden: (x) => x.descuentoPct }, { k: "pa", t: "Pacientes", der: true, v: (x) => uso.pacientesPorConvenio[x.id] || 0, orden: (x) => uso.pacientesPorConvenio[x.id] || 0 }],
      nota: "Los convenios y membresías se administran en Recepción ▸ Convenios y membresías.", enlace: ["convenios", "Convenios y membresías"] },
  };
}

export default function Catalogos() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const edita = P.esCentral(u);
  const [cat, setCat] = useState("sucursales");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);
  const [conf, setConf] = useState(null);
  const uso = useMemo(() => P.usoCatalogo(d), [d]);
  const defs = useMemo(() => definiciones(d, uso), [d, uso]);
  if (!P.puedeVerCatalogos(u)) return <Denegado>Los catálogos los consulta gerencia y los administra Administración central.</Denegado>;

  const claves = Object.keys(defs).filter((k) => defs[k]);
  const def = defs[cat] || defs.sucursales;
  const t = normaliza(q);
  const items = def.items.filter((x) => !t || normaliza(`${def.nombre(x)} ${def.sub ? def.sub(x) : ""} ${x.id} ${x.sku || ""}`).includes(t));
  const puede = edita && !def.lectura;
  const guardar = () => {
    const r = mutar((s) => def.guardar(s, form));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(form.id ? "Cambios guardados." : `Se dio de alta: ${form.nombre}.`); setForm(null);
  };
  const alternar = (x, on) => {
    const r = mutar((s) => def.activar(s, x, on));
    setConf(null);
    r.ok ? aviso(on ? "Activado." : "Desactivado.") : aviso(r.error, "bad");
  };
  const ruta = def.enlace && (rutaDe(u, def.enlace[0]) || (def.enlace[0] === "precios" ? rutaDe(u, "precios-consulta") : null));
  const visibles = (f) => def.campos.filter((c) => (!c.soloAlta || !f.id) && (!c.si || c.si(f)));

  return (
    <>
      <Chips scroll valor={cat} onChange={(k) => { setCat(k); setQ(""); }} opciones={claves.map((k) => ({ v: k, l: defs[k].titulo, n: defs[k].items.length }))} />
      {!edita && <Card tono="info"><p className="txt peq" style={{ margin: 0 }}>Consulta de catálogos. Las altas y cambios los hace Administración central.</p></Card>}
      <div className="pl-barra">
        <Buscador valor={q} onChange={setQ} placeholder={`Buscar en ${def.titulo.toLowerCase()}…`} />
        {puede && <Button icon="plus" onClick={() => setForm({ id: null, ...def.nuevo })}>Nuevo</Button>}
        {ruta && <Button variante="sec" icon="link" onClick={() => nav(ruta)}>{def.enlace[1]}</Button>}
      </div>
      {def.nota && <Nota>{def.nota}{def.enlace && !ruta ? " (Esa pantalla no está en tu menú.)" : ""}</Nota>}

      <Vista id={`pl-cat-${cat}`} items={items} minTarjeta={250} vacio="Sin registros con esa búsqueda." onAbrir={puede ? (x) => setForm(def.aForm(x)) : undefined}
        tarjeta={(x) => (
          <div className="pl-doc" style={{ opacity: def.activo(x) ? 1 : 0.6 }}>
            <div className="fila-flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}><div className="pl-doc-t">{def.nombre(x)}</div>{!def.sinEstado && <Estado on={def.activo(x)} />}</div>
            {def.sub && <Nota>{def.sub(x)}</Nota>}
            <div className="fila-d">{def.datos(x).map((t2, i) => <span key={i}>{t2}</span>)}</div>
          </div>)}
        columnas={[{ k: "nom", t: def.singular.charAt(0).toUpperCase() + def.singular.slice(1), v: (x) => <b>{def.nombre(x)}</b>, orden: (x) => def.nombre(x) }, ...def.cols, ...(def.sinEstado ? [] : [{ k: "est", t: "Estado", v: (x) => <Estado on={def.activo(x)} />, orden: (x) => (def.activo(x) ? 0 : 1) }])]} />

      <Sheet abierto={!!form} onClose={() => setForm(null)} titulo={form ? `${form.id ? "Editar" : "Alta de"} ${def.singular}` : ""}
        pie={form && (
          <div className="pl-acc">
            <Button onClick={guardar} icon="check">{form.id ? "Guardar cambios" : "Dar de alta"}</Button>
            {form.id && def.activar && (() => { const x = def.items.find((y) => y.id === form.id); if (!x) return null; const on = def.activo(x); return <Button variante={on ? "ghost" : "sec"} onClick={() => setConf({ x, on: !on })}>{on ? "Desactivar" : "Activar"}</Button>; })()}
          </div>)}>
        {form && (
          <>
            {visibles(form).map((c) => c.check
              ? <label key={c.k} className="pl-chk"><input type="checkbox" checked={!!form[c.k]} onChange={(e) => setForm({ ...form, [c.k]: e.target.checked })} /> <span>{c.l}</span></label>
              : <Field key={c.k} label={c.l} hint={c.hint}>{c.ops
                ? <Select value={form[c.k] ?? ""} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })}>{c.ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                : <Input value={form[c.k] ?? ""} type={c.tel ? "tel" : "text"} inputMode={c.num ? "decimal" : undefined} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} />}</Field>)}
            {form.id && def.campos.some((c) => c.soloAlta && c.k === "precioBase") && <Card tono="info"><div className="fila-flex"><Icon name="tag" /><Nota>El precio no se edita aquí: se cambia en Precios, con motivo e historial.</Nota></div></Card>}
            <Nota>No se permiten nombres repetidos (se comparan sin acentos ni mayúsculas). Cada cambio queda en la bitácora.</Nota>
          </>
        )}
      </Sheet>
      <Confirmar abierto={!!conf} titulo={conf ? `${conf.on ? "Activar" : "Desactivar"} ${def.singular}` : ""} peligro={conf && !conf.on} confirmar={conf && conf.on ? "Activar" : "Desactivar"}
        texto={conf ? (conf.on ? `«${def.nombre(conf.x)}» volverá a estar disponible.` : `«${def.nombre(conf.x)}» quedará marcado como inactivo en el catálogo; no se borra nada de su historial. Hoy solo la tienda en línea deja de ofrecer una sucursal inactiva: agenda y caja todavía no filtran lo inactivo (ajuste pendiente).${def.bloqueos && def.bloqueos(conf.x).length ? ` Ojo: tiene ${def.bloqueos(conf.x).join(", ")}; el sistema no permitirá desactivarla mientras eso siga abierto.` : ""}`) : ""}
        onSi={() => { alternar(conf.x, conf.on); setForm(null); }} onNo={() => setConf(null)} />
      {cat === "sucursales" && edita && <Nota>Para dar de baja una sucursal primero se cierran sus turnos, se reagendan sus citas y se traspasa su inventario. Sucursal activa en este catálogo: {d.sucursales.filter((s) => s.activa !== false).map((s) => R.nombreSucursal(d, s.id)).join(", ")}.</Nota>}
    </>
  );
}
