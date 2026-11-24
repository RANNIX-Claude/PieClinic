// Más · Expediente de producto. Portado de Pie Firme (pages/plataforma/inventario/ExpedienteProducto.jsx, Inventario.jsx,
// MermasConteos.jsx; P-081 a P-086): datos y foto reducida, existencias por sucursal con capas PEPS, kardex con saldo que cuadra
// contra las capas, precios por sucursal e historial, proveedores, mermas con autorización y rotación.
// Almacén y Administración editan; gerencia consulta.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_ventas.js";
import * as R from "../../store/reglas.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso, useDebounced } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { BadgeEstado, Pestanas } from "../../componentes/ventas/comun.jsx";
import { dinero, fechaCorta } from "../../lib/format.js";
import "../../estilos_ventas.css";

const run = (fn, okTxt) => { const r = mutar(fn); if (r && r.ok) { if (okTxt) aviso(okTxt, "ok"); } else aviso((r && r.error) || "No se pudo completar.", "bad"); return r; };
const IVA_L = { 16: "IVA 16 %", exento: "Exento", tasa0: "Tasa 0 %" };

export default function ExpedienteProducto() {
  const { d, u, sucursalId } = useSesion();
  const p = A.permisosVentas(u);
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [cat, setCat] = useState("");
  const [alm, setAlm] = useState(() => (u && u.rol === "almacen" ? (u.almacenCentral ? "CEN" : sucursalId) : u && u.rol === "gerente" ? sucursalId : ""));
  const [sel, setSel] = useState(null);
  const lista = useMemo(() => A.catalogoProductos(d, { texto: dq, categoria: cat, almacenId: alm || null }), [d, dq, cat, alm]);
  if (!p.inventarioVer) return <Vacio icon="lock">El expediente de producto es del almacén, gerencia y Administración.</Vacio>;
  const cats = [...new Set(d.productos.map((x) => x.categoria))];
  const almacenes = A.esCentral(u) || (u.rol === "almacen" && u.almacenCentral) ? d.almacenes : d.almacenes.filter((a) => u.sucursales.includes(a.id));
  const valor = lista.reduce((a, x) => a + x.valor, 0);
  return (
    <div className="v-col">
      <Titulo>Expediente de producto</Titulo>
      <Buscador valor={q} onChange={setQ} placeholder="Nombre, SKU, marca o código de barras" />
      <Chips scroll opciones={[{ v: "", l: "Todas las categorías" }, ...cats.map((c) => ({ v: c, l: c }))]} valor={cat} onChange={setCat} />
      <Select value={alm} onChange={(e) => setAlm(e.target.value)} aria-label="Almacén">
        {(A.esCentral(u) || u.almacenCentral) && <option value="">Todos los almacenes</option>}
        {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
      </Select>
      <div className="kpis v-kpis">
        <Kpi label="Productos" valor={lista.length} />
        <Kpi label="Valor del inventario" valor={dinero(valor)} nota="a costo PEPS" />
        <Kpi label="Bajo mínimo" valor={lista.filter((x) => x.bajo).length} tono={lista.some((x) => x.bajo) ? "warn" : undefined} />
        <Kpi label="Sin existencia" valor={lista.filter((x) => x.stock === 0).length} />
      </div>
      <Vista id="v-productos" items={lista} minTarjeta={210}
        tarjeta={(x) => (
          <div className="v-tar">
            {x.ficha.fotos && x.ficha.fotos[0] ? <img className="v-foto" src={x.ficha.fotos[0]} alt={x.nombre} /> : <div className="v-foto">{x.categoria}</div>}
            <b>{x.nombre}</b><div className="peq mu">{x.sku} · {x.ficha.marca || "—"}</div>
            <div className="fila-flex" style={{ justifyContent: "space-between" }}><span>{x.stock} pzas</span>{x.bajo ? <Badge tono="warn">Bajo mínimo</Badge> : <Badge tono={x.tipo === "insumo" ? "neutral" : "info"}>{x.tipo === "insumo" ? "Insumo" : "Venta"}</Badge>}</div>
            <div className="peq">{dinero(x.precioBase)} · {IVA_L[x.ficha.ivaTipo || "16"]}</div>
          </div>)}
        columnas={[
          { k: "s", t: "SKU", v: (x) => x.sku }, { k: "n", t: "Producto", v: (x) => x.nombre }, { k: "c", t: "Categoría", v: (x) => x.categoria },
          { k: "m", t: "Marca", v: (x) => x.ficha.marca || "—" }, { k: "e", t: "Existencia", v: (x) => x.stock, der: true },
          { k: "min", t: "Mínimo", v: (x) => x.minimo, der: true }, { k: "v", t: "Valor", v: (x) => dinero(x.valor), der: true, orden: (x) => x.valor },
          { k: "p", t: "Precio base", v: (x) => dinero(x.precioBase), der: true, orden: (x) => x.precioBase },
          { k: "b", t: "Estado", v: (x) => (x.bajo ? <Badge tono="warn">Bajo mínimo</Badge> : <Badge tono="ok">OK</Badge>), orden: (x) => (x.bajo ? 0 : 1) },
        ]}
        onAbrir={(x) => setSel(x.id)} />
      {sel && <Ficha d={d} u={u} productoId={sel} almacenId={alm || null} onClose={() => setSel(null)} />}
    </div>
  );
}

function Ficha({ d, u, productoId, almacenId, onClose }) {
  const p = A.permisosVentas(u);
  const [tab, setTab] = useState("datos");
  const ex = A.expedienteProducto(d, productoId, { almacenId });
  if (!ex) return null;
  const { producto: pr } = ex;
  return (
    <Sheet abierto onClose={onClose} titulo={`${pr.sku} · ${pr.nombre}`}>
      <Pestanas valor={tab} onChange={setTab} opciones={[{ v: "datos", l: "Datos" }, { v: "exist", l: "Existencias" }, { v: "kardex", l: "Kardex" }, { v: "precios", l: "Precios" }, { v: "prov", l: "Proveedores", n: ex.proveedores.length }, { v: "mermas", l: "Mermas", n: ex.mermas.length }, { v: "rot", l: "Rotación" }]} />
      {tab === "datos" && <Datos d={d} ex={ex} puede={p.inventario} />}
      {tab === "exist" && <Existencias ex={ex} />}
      {tab === "kardex" && <Kardex d={d} ex={ex} almacenId={almacenId} />}
      {tab === "precios" && <Precios d={d} ex={ex} />}
      {tab === "prov" && <div className="lista">{ex.proveedores.map((x) => <Fila key={x.id} titulo={x.nombre} sub={`SKU proveedor ${x.skuProveedor}`} datos={`Costo ref. ${dinero(x.costoRef)} · última compra ${x.ultimaCompra ? `${fechaCorta(x.ultimaCompra)} a ${dinero(x.ultimoCosto)}` : "—"}`} />)}
        {!ex.proveedores.length && <Vacio icon="truck">Sin proveedores ligados.</Vacio>}</div>}
      {tab === "mermas" && <Mermas d={d} u={u} ex={ex} almacenId={almacenId} />}
      {tab === "rot" && <Rotacion ex={ex} />}
    </Sheet>
  );
}

function Datos({ d, ex, puede }) {
  const f0 = ex.ficha;
  const [f, setF] = useState({ descripcion: f0.descripcion || "", marca: f0.marca || "", claveSat: f0.claveSat || "", unidadSat: f0.unidadSat || "H87", ivaTipo: f0.ivaTipo || "16", ubicacion: f0.ubicacion || "", codigoBarras: f0.codigoBarras || "", fotos: f0.fotos || [] });
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const foto = async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; try { const img = await reducirImagen(file, 320); setF({ ...f, fotos: [img, ...f.fotos].slice(0, 3) }); } catch (x) { aviso(x.message, "bad"); } };
  return (
    <div className="v-ficha">
      <div>
        {f.fotos[0] ? <img className="v-foto" src={f.fotos[0]} alt={ex.producto.nombre} /> : <div className="v-foto">Sin foto</div>}
        {puede && <label className="btn btn-ghost btn-peq" style={{ marginTop: 8 }}>Subir foto<input type="file" accept="image/*" capture="environment" hidden onChange={foto} /></label>}
        {puede && f.fotos.length > 0 && <Button variante="ghost" className="btn-peq" onClick={() => setF({ ...f, fotos: f.fotos.slice(1) })}>Quitar foto</Button>}
      </div>
      <div className="v-col">
        <Resumen filas={[["Categoría", ex.producto.categoria], ["Tipo", ex.producto.tipo === "insumo" ? "Insumo clínico" : "Venta"], ["Precio base", dinero(ex.producto.precioBase)], ["Costo promedio", dinero(ex.costoPromedio)], ["Mínimo por sucursal", ex.producto.minimo]]} />
        <div className="form2">
          <Field label="Marca"><Input value={f.marca} onChange={campo("marca")} disabled={!puede} /></Field>
          <Field label="Ubicación"><Input value={f.ubicacion} onChange={campo("ubicacion")} disabled={!puede} /></Field>
          <Field label="Código de barras"><Input inputMode="numeric" value={f.codigoBarras} onChange={campo("codigoBarras")} disabled={!puede} /></Field>
          <Field label="Clave SAT" hint="Por validar con contador"><Input inputMode="numeric" maxLength={8} value={f.claveSat} onChange={campo("claveSat")} disabled={!puede} /></Field>
          <Field label="Unidad SAT"><Input value={f.unidadSat} onChange={campo("unidadSat")} disabled={!puede} /></Field>
          <Field label="IVA" hint="Producto: 16 % salvo indicación del contador"><Select value={f.ivaTipo} onChange={campo("ivaTipo")} disabled={!puede}>{Object.entries(IVA_L).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        </div>
        <Field label="Descripción"><Area value={f.descripcion} onChange={campo("descripcion")} disabled={!puede} /></Field>
        {puede && <Button onClick={() => run((dd) => A.guardarFichaProducto(dd, ex.producto.id, f), "Ficha guardada.")}>Guardar ficha</Button>}
        {f0.actualizado && <p className="peq mu">Actualizada {fechaCorta(f0.actualizado)}{f0.actualizadoPor ? ` por ${R.nombreUsuario(d, f0.actualizadoPor)}` : ""}</p>}
      </div>
    </div>
  );
}

function Existencias({ ex }) {
  return (
    <>
      <div className="kpis"><Kpi label="Existencia" valor={ex.stock} /><Kpi label="Valor" valor={dinero(ex.valor)} /></div>
      <p className="peq mu">Capas PEPS: la más antigua sale primero (P-083).</p>
      <div className="v-rejilla">{ex.existencias.filter((e) => e.stock > 0 || e.almacenId !== "CEN").map((e) => (
        <Card key={e.almacenId} tono={ex.bajoMinimo.includes(e.almacenId) ? "warn" : undefined}>
          <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{e.nombre}</b><span>{e.stock} pzas</span></div>
          <div className="peq mu">{dinero(e.valor)}{ex.bajoMinimo.includes(e.almacenId) ? " · bajo mínimo" : ""}</div>
          <div className="v-capas">{e.capas.map((c, i) => <div key={c.id}><span>{i === 0 ? "▶ " : ""}{c.lote || "s/lote"} · {fechaCorta(c.fecha)}</span><span>{c.cant} × {dinero(c.costo)}</span></div>)}</div>
        </Card>))}</div>
    </>
  );
}

function Kardex({ d, ex, almacenId }) {
  const k = ex.kardex;
  return (
    <>
      <Card tono={k.cuadra ? "ok" : "bad"}><b>{k.cuadra ? "El kardex cuadra con las capas PEPS" : "El kardex NO cuadra con las capas"}</b>
        <div className="peq">Saldo inicial {k.saldoInicial} + entradas {k.entradas} − salidas {k.salidas} = {k.saldoFinal} · capas {ex.stock}{almacenId ? "" : " (todos los almacenes)"}</div></Card>
      <Vista id="v-kardex" items={k.filas.map((m, i) => ({ ...m, id: i }))} inicial="renglones"
        tarjeta={(m) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{m.tipo === "entrada" ? `+${m.cant}` : `−${m.cant}`}</b><span>Saldo {m.saldo}</span></div><div className="peq">{m.concepto}</div><div className="peq mu">{fechaCorta(m.fecha)} · {R.nombreAlmacen(d, m.almacenId)}</div></div>}
        columnas={[{ k: "f", t: "Fecha", v: (m) => fechaCorta(m.fecha), orden: (m) => m.fecha }, { k: "a", t: "Almacén", v: (m) => R.nombreAlmacen(d, m.almacenId) }, { k: "c", t: "Concepto", v: (m) => m.concepto },
          { k: "e", t: "Entrada", v: (m) => (m.tipo === "entrada" ? m.cant : ""), der: true }, { k: "s", t: "Salida", v: (m) => (m.tipo === "salida" ? m.cant : ""), der: true }, { k: "sa", t: "Saldo", v: (m) => m.saldo, der: true }]}
        vacio="Sin movimientos registrados." />
    </>
  );
}

function Precios({ d, ex }) {
  return (
    <>
      <p className="peq mu">Precio = base × (1 + ajuste de la sucursal). Se cambia en Administración ▸ Precios (catálogo central).</p>
      <div className="lista">{ex.precios.map((x) => <Fila key={x.sucursalId} titulo={x.nombre} sub={`Ajuste ${x.ajuste} %`} derecha={<b>{dinero(x.precio)}</b>} />)}</div>
      <Titulo>Historial de cambios</Titulo>
      <div className="lista">{ex.hist.map((h, i) => <Fila key={i} titulo={`${h.campo === "precioBase" ? "Precio base" : "Ajuste %"}: ${h.antes} → ${h.despues}`} sub={`${h.sucursalId === "*" ? "Todas" : R.nombreSucursal(d, h.sucursalId)} · ${h.fecha ? fechaCorta(h.fecha) : ""}`} datos={h.motivo} />)}
        {!ex.hist.length && <Vacio icon="tag">Sin cambios de precio registrados.</Vacio>}</div>
    </>
  );
}

function Mermas({ d, u, ex, almacenId }) {
  const [f, setF] = useState(null);
  const alm = almacenId || (u.almacenCentral ? "CEN" : u.sucursales[0]);
  const foto = async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; try { setF({ ...f, foto: await reducirImagen(file, 320) }); } catch (x) { aviso(x.message, "bad"); } };
  return (
    <>
      {u.rol === "almacen" && <Button icon="plus" onClick={() => setF({ cant: "1", motivo: "merma", nota: "", foto: null })}>Registrar merma</Button>}
      <p className="peq mu">La merma crea una solicitud de ajuste: la autoriza gerencia o Administración según el monto (P-086).</p>
      <div className="lista">{ex.mermas.map((m) => <Fila key={m.id} titulo={`${m.folio} · ${m.cant} pzas · ${m.motivo}`} sub={`${fechaCorta(m.fecha)} · ${R.nombreAlmacen(d, m.almacenId)} · ${R.nombreUsuario(d, m.registradoPor)}`} datos={m.nota} badge={<BadgeEstado mapa={{ ...A.ESTADOS_MERMA, autorizado: ["Autorizada", "ok"], rechazado: ["Rechazada", "bad"] }} k={m.estadoActual} />} derecha={<span className="peq">{dinero(m.valor)}</span>} />)}
        {!ex.mermas.length && <Vacio icon="box">Sin mermas.</Vacio>}</div>
      {f && <Sheet abierto onClose={() => setF(null)} titulo={`Merma en ${R.nombreAlmacen(d, alm)}`} pie={<Button block onClick={() => { const r = run((dd) => A.registrarMerma(dd, { almacenId: alm, productoId: ex.producto.id, ...f }), "Merma registrada: pendiente de autorización."); if (r.ok) setF(null); }}>Solicitar ajuste</Button>}>
        <div className="dos"><Field label="Cantidad"><Input inputMode="numeric" value={f.cant} onChange={(e) => setF({ ...f, cant: e.target.value })} /></Field>
          <Field label="Motivo"><Select value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })}>{A.MOTIVOS_AJUSTE.map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field></div>
        <Field label="Nota"><Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Field>
        <label className="btn btn-ghost btn-peq">Foto de evidencia<input type="file" accept="image/*" capture="environment" hidden onChange={foto} /></label>
        {f.foto && <img className="v-foto" src={f.foto} alt="Evidencia" />}
      </Sheet>}
    </>
  );
}

function Rotacion({ ex }) {
  const r = ex.rotacion30, r9 = ex.rotacion90;
  return (
    <>
      <div className="kpis">
        <Kpi label="Vendidas / usadas 30 días" valor={r.unidades} nota={dinero(r.importe)} />
        <Kpi label="Promedio diario" valor={r.diario} />
        <Kpi label="Días de inventario" valor={r.diasInventario ?? "—"} tono={r.diasInventario != null && r.diasInventario < 15 ? "warn" : undefined} />
        <Kpi label="Unidades 90 días" valor={r9.unidades} />
      </div>
      <p className="peq mu">Incluye ventas en mostrador y consumo en consulta. La demostración solo tiene tickets recientes: el promedio usa los días con datos.</p>
    </>
  );
}
