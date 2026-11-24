// Más · Expediente de proveedor. Portado de Pie Firme (pages/plataforma/inventario/ExpedienteProveedor.jsx, Proveedores.jsx,
// OrdenEditor.jsx; P-081): datos y condiciones, productos, órdenes de compra (desde $5,000 requieren autorización),
// cuentas por pagar y pagos, notas de compra (d.fin.notasCompra), devoluciones, evaluación y documentos.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_ventas.js";
import * as R from "../../store/reglas.js";
import { Area, Badge, Button, Buscador, Card, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso, useDebounced } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { BadgeEstado, Estrellas, Pestanas } from "../../componentes/ventas/comun.jsx";
import { dinero, fechaCorta, normaliza } from "../../lib/format.js";
import "../../estilos_ventas.css";

const run = (fn, okTxt) => { const r = mutar(fn); if (r && r.ok) { if (okTxt) aviso(okTxt, "ok"); } else aviso((r && r.error) || "No se pudo completar.", "bad"); return r; };
const EST_CXP = { vencida: ["Vencida", "bad"], por_vencer: ["Por vencer", "warn"], vigente: ["Vigente", "info"], pagada: ["Pagada", "ok"] };

export default function ExpedienteProveedor() {
  const { d, u } = useSesion();
  const p = A.permisosVentas(u);
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [sel, setSel] = useState(null);
  if (!p.inventarioVer) return <Vacio icon="lock">El expediente de proveedor es del almacén, gerencia y Administración.</Vacio>;
  const lista = d.proveedores.map((x) => ({ ...x, ficha: (d.inv.provFichas || {})[x.id] || {}, res: A.resumenProveedor(d, x.id), ev: A.evaluacionProveedor(d, x.id) }))
    .filter((x) => !dq || normaliza(`${x.nombre} ${x.ficha.razon || ""} ${x.ficha.rfc || ""} ${x.ficha.categoria || ""}`).includes(normaliza(dq)));
  const saldo = lista.reduce((a, x) => a + x.res.saldo, 0), vencido = lista.reduce((a, x) => a + x.res.vencido, 0);
  return (
    <div className="v-col">
      <Titulo>Expediente de proveedor</Titulo>
      <Buscador valor={q} onChange={setQ} placeholder="Nombre, RFC o categoría" />
      <div className="kpis v-kpis">
        <Kpi label="Proveedores" valor={lista.length} />
        <Kpi label="Por pagar" valor={dinero(saldo)} />
        <Kpi label="Vencido" valor={dinero(vencido)} tono={vencido ? "bad" : undefined} />
        <Kpi label="OC por aprobar" valor={lista.reduce((a, x) => a + x.res.porAprobar, 0)} tono="warn" nota="desde $5,000" />
      </div>
      <Vista id="v-proveedores" items={lista}
        tarjeta={(x) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{x.ficha.razon || x.nombre}</b>{x.ficha.estado === "inactivo" ? <Badge tono="neutral">Inactivo</Badge> : <Badge tono="ok">Activo</Badge>}</div>
          <div className="peq mu">{x.ficha.categoria || "—"} · {x.ficha.rfc || "sin RFC"}</div><div className="peq">Crédito {x.dias} días · saldo {dinero(x.res.saldo)}</div>
          <Estrellas valor={Math.round(x.ev.general || 0)} /></div>}
        columnas={[{ k: "n", t: "Proveedor", v: (x) => x.ficha.razon || x.nombre }, { k: "c", t: "Categoría", v: (x) => x.ficha.categoria || "—" }, { k: "r", t: "RFC", v: (x) => x.ficha.rfc || "—" },
          { k: "d", t: "Crédito", v: (x) => `${x.dias} días`, orden: (x) => x.dias }, { k: "co", t: "Comprado", v: (x) => dinero(x.res.comprado), der: true, orden: (x) => x.res.comprado },
          { k: "s", t: "Saldo", v: (x) => dinero(x.res.saldo), der: true, orden: (x) => x.res.saldo }, { k: "e", t: "Evaluación", v: (x) => (x.ev.general != null ? `${x.ev.general} / 5` : "—"), der: true, orden: (x) => x.ev.general || 0 }]}
        onAbrir={(x) => setSel(x.id)} />
      {sel && <Expediente d={d} u={u} proveedorId={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function Expediente({ d, u, proveedorId, onClose }) {
  const [tab, setTab] = useState("datos");
  const ex = A.expedienteProveedor(d, proveedorId);
  if (!ex) return null;
  return (
    <Sheet abierto onClose={onClose} titulo={ex.ficha.razon || ex.proveedor.nombre}>
      <div className="kpis">
        <Kpi label="Comprado" valor={dinero(ex.resumen.comprado)} nota={`${ex.resumen.ordenes} OC`} />
        <Kpi label="Saldo por pagar" valor={dinero(ex.resumen.saldo)} tono={ex.resumen.vencido ? "bad" : undefined} nota={ex.resumen.vencido ? `${dinero(ex.resumen.vencido)} vencido` : "al corriente"} />
      </div>
      <Pestanas valor={tab} onChange={setTab} opciones={[{ v: "datos", l: "Datos" }, { v: "prod", l: "Productos", n: ex.productos.length }, { v: "oc", l: "Órdenes", n: ex.ordenes.length }, { v: "cxp", l: "Por pagar", n: ex.cxp.filter((c) => c.saldo > 0).length },
        ...(ex.hayNotas ? [{ v: "notas", l: "Notas de compra", n: ex.notas.length }] : []), { v: "dev", l: "Devoluciones", n: ex.devoluciones.length }, { v: "eval", l: "Evaluación" }, { v: "docs", l: "Documentos", n: ex.docs.length }]} />
      {tab === "datos" && <Datos d={d} u={u} ex={ex} />}
      {tab === "prod" && <div className="lista">{ex.productos.map((x) => <Fila key={x.id} titulo={x.producto ? x.producto.nombre : x.productoId} sub={`${x.skuProveedor} · ${x.nombreProveedor}`} derecha={<b>{dinero(x.costoRef)}</b>} />)}{!ex.productos.length && <Vacio icon="box">Sin productos ligados.</Vacio>}</div>}
      {tab === "oc" && <Ordenes d={d} u={u} ex={ex} />}
      {tab === "cxp" && <Cxp d={d} u={u} ex={ex} />}
      {tab === "notas" && <div className="lista">{ex.notas.map((n) => <Fila key={n.id} titulo={`${n.folio} · ${n.folioProveedor || ""}`} sub={`${fechaCorta(n.fecha)} · ${n.tipo} · ${n.origen || ""}`} datos={`${n.partidas.length} partida(s)`} derecha={<b>{dinero(n.total)}</b>} />)}{!ex.notas.length && <Vacio icon="file">Sin notas de compra.</Vacio>}</div>}
      {tab === "dev" && <div className="lista">{ex.devoluciones.map((x) => <Fila key={x.id} titulo={`${x.folio} · ${R.nombreProducto(d, x.productoId)} × ${x.cant}`} sub={`${fechaCorta(x.fecha)} · ${x.motivo}`} derecha={<b>{dinero(x.monto)}</b>} />)}{!ex.devoluciones.length && <Vacio icon="undo">Sin devoluciones a este proveedor. Se registran al recibir (Almacén ▸ Recibir).</Vacio>}</div>}
      {tab === "eval" && <Evaluacion d={d} u={u} ex={ex} />}
      {tab === "docs" && <Docs d={d} u={u} ex={ex} />}
    </Sheet>
  );
}

function Datos({ u, ex }) {
  const p = A.permisosVentas(u);
  const f0 = ex.ficha;
  const [f, setF] = useState({ razon: f0.razon || ex.proveedor.nombre, rfc: f0.rfc || "", regimen: f0.regimen || "601", cp: f0.cp || "", contacto: f0.contacto || "", telefono: f0.telefono || "", correo: f0.correo || "", domicilio: f0.domicilio || "", categoria: f0.categoria || "",
    condiciones: f0.condiciones || "", diasCredito: String(ex.proveedor.dias), entregaDias: String(f0.entregaDias ?? ""), minimoCompra: String(f0.minimoCompra ?? ""), estado: f0.estado || "activo", notas: f0.notas || "" });
  const [banco, setBanco] = useState({ banco: (f0.banco || {}).banco || "", clabe: (f0.banco || {}).clabe || "" });
  const c = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const dis = !p.inventario;
  return (
    <>
      <div className="form2">
        <Field label="Razón social"><Input value={f.razon} onChange={c("razon")} disabled={dis} /></Field>
        <Field label="RFC"><Input value={f.rfc} onChange={(e) => setF({ ...f, rfc: e.target.value.toUpperCase() })} disabled={dis} /></Field>
        <Field label="Categoría"><Input value={f.categoria} onChange={c("categoria")} disabled={dis} /></Field>
        <Field label="Contacto"><Input value={f.contacto} onChange={c("contacto")} disabled={dis} /></Field>
        <Field label="Teléfono"><Input type="tel" value={f.telefono} onChange={c("telefono")} disabled={dis} /></Field>
        <Field label="Correo"><Input type="email" value={f.correo} onChange={c("correo")} disabled={dis} /></Field>
        <Field label="Condiciones de pago"><Input value={f.condiciones} onChange={c("condiciones")} disabled={dis} /></Field>
        <Field label="Días de crédito"><Input inputMode="numeric" value={f.diasCredito} onChange={c("diasCredito")} disabled={dis} /></Field>
        <Field label="Días de entrega"><Input inputMode="numeric" value={f.entregaDias} onChange={c("entregaDias")} disabled={dis} /></Field>
        <Field label="Mínimo de compra"><Input inputMode="decimal" value={f.minimoCompra} onChange={c("minimoCompra")} disabled={dis} /></Field>
        <Field label="CP fiscal"><Input inputMode="numeric" maxLength={5} value={f.cp} onChange={c("cp")} disabled={dis} /></Field>
        <Field label="Estado"><Select value={f.estado} onChange={c("estado")} disabled={dis}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></Select></Field>
      </div>
      <Field label="Domicilio"><Input value={f.domicilio} onChange={c("domicilio")} disabled={dis} /></Field>
      <Field label="Notas"><Area value={f.notas} onChange={c("notas")} disabled={dis} /></Field>
      {p.inventario && <Button onClick={() => run((dd) => A.guardarFichaProveedor(dd, ex.proveedor.id, { ...f, diasCredito: Number(f.diasCredito) }), "Expediente guardado.")}>Guardar datos</Button>}
      <Titulo>Datos bancarios</Titulo>
      <div className="dos"><Field label="Banco"><Input value={banco.banco} onChange={(e) => setBanco({ ...banco, banco: e.target.value })} disabled={!A.esCentral(u)} /></Field>
        <Field label="CLABE" hint={A.esCentral(u) ? "18 dígitos" : "Solo Administración la cambia"}><Input inputMode="numeric" maxLength={18} value={banco.clabe} onChange={(e) => setBanco({ ...banco, clabe: e.target.value.replace(/\D/g, "") })} disabled={!A.esCentral(u)} /></Field></div>
      {A.esCentral(u) && <Button variante="sec" onClick={() => run((dd) => A.guardarFichaProveedor(dd, ex.proveedor.id, banco), "Datos bancarios actualizados (queda en bitácora).")}>Guardar datos bancarios</Button>}
    </>
  );
}

function Ordenes({ d, u, ex }) {
  const p = A.permisosVentas(u);
  const [nueva, setNueva] = useState(null);
  const [ver, setVer] = useState(null);
  const total = nueva ? A.totalPartidas(nueva.filter((x) => x.productoId)) : 0;
  const o = ver ? ex.ordenes.find((x) => x.id === ver) : null;
  return (
    <>
      {p.compras && <Button icon="plus" onClick={() => setNueva(ex.productos.slice(0, 2).map((x) => ({ productoId: x.productoId, cant: "", costo: String(x.costoRef) })))}>Nueva orden de compra</Button>}
      <div className="lista">{ex.ordenes.map((x) => <Fila key={x.id} titulo={x.folio} sub={`${fechaCorta(x.fecha)} · ${R.nombreAlmacen(d, x.almacenId)} · ${x.partidas.length} partida(s)`} badge={<BadgeEstado mapa={A.ESTADOS_OC} k={x.estado} />} derecha={<b>{dinero(x.total)}</b>} onClick={() => setVer(x.id)} />)}
        {!ex.ordenes.length && <Vacio icon="truck">Sin órdenes de compra.</Vacio>}</div>
      {o && <Sheet abierto onClose={() => setVer(null)} titulo={`${o.folio} · ${A.ESTADOS_OC[o.estado] ? A.ESTADOS_OC[o.estado][0] : o.estado}`}
        pie={o.estado === "por_aprobar" && A.esCentral(u) && <Button block icon="check" onClick={() => { const r = run((dd) => A.aprobarCompra(dd, o.id), "Orden autorizada y enviada."); if (r.ok) setVer(null); }}>Autorizar y enviar</Button>}>
        {o.estado === "por_aprobar" && <Card tono="warn"><span className="peq">Orden de {dinero(o.total)}: desde $5,000 la autoriza Administración (P-081).</span></Card>}
        <div className="lista">{o.partidas.map((x) => <Fila key={x.productoId} titulo={R.nombreProducto(d, x.productoId)} sub={`${x.cant} × ${dinero(x.costo)} · recibido ${x.recibido || 0}${x.devuelto ? ` · devuelto ${x.devuelto}` : ""}`} derecha={<b>{dinero(x.cant * x.costo)}</b>} />)}</div>
        <Resumen filas={[["Total", dinero(o.total), true], o.creadaPor && ["Creada por", R.nombreUsuario(d, o.creadaPor)], o.aprobadaPor && ["Aprobada por", R.nombreUsuario(d, o.aprobadaPor)]]} />
      </Sheet>}
      {nueva && <Sheet abierto onClose={() => setNueva(null)} titulo="Nueva orden de compra" pie={<Button block onClick={() => { const r = run((dd) => A.solicitarCompra(dd, { proveedorId: ex.proveedor.id, partidas: nueva.filter((x) => x.productoId && x.cant) })); if (r.ok) { aviso(r.requiereAutorizacion && r.oc.estado === "por_aprobar" ? `${r.oc.folio} enviada a autorización (≥ $5,000).` : `${r.oc.folio} aprobada y enviada.`, "ok"); setNueva(null); } }}>Crear orden · {dinero(total)}</Button>}>
        {nueva.map((x, i) => (
          <div key={i} className="form2">
            <Field label={`Producto ${i + 1}`}><Select value={x.productoId} onChange={(e) => { const n = [...nueva]; const pp = ex.productos.find((y) => y.productoId === e.target.value); n[i] = { ...x, productoId: e.target.value, costo: pp ? String(pp.costoRef) : x.costo }; setNueva(n); }}>
              <option value="">Elige…</option>{(ex.productos.length ? ex.productos.map((y) => y.producto) : d.productos).filter(Boolean).map((y) => <option key={y.id} value={y.id}>{y.nombre}</option>)}</Select></Field>
            <div className="dos"><Field label="Cantidad"><Input inputMode="numeric" value={x.cant} onChange={(e) => { const n = [...nueva]; n[i] = { ...x, cant: e.target.value }; setNueva(n); }} /></Field>
              <Field label="Costo"><Input inputMode="decimal" value={x.costo} onChange={(e) => { const n = [...nueva]; n[i] = { ...x, costo: e.target.value }; setNueva(n); }} /></Field></div>
          </div>))}
        <Button variante="ghost" icon="plus" onClick={() => setNueva([...nueva, { productoId: "", cant: "", costo: "" }])}>Agregar partida</Button>
        <Card tono={A.requiereAutorizacionCompra(total, d) ? "warn" : "ok"}><span className="peq">{A.requiereAutorizacionCompra(total, d) ? "Desde $5,000: queda «por aprobar» hasta que Administración la autorice." : "Menos de $5,000: sale aprobada."}{ex.ficha.minimoCompra ? ` Mínimo del proveedor: ${dinero(ex.ficha.minimoCompra)}.` : ""}</span></Card>
      </Sheet>}
    </>
  );
}

function Cxp({ d, u, ex }) {
  const [pago, setPago] = useState(null);
  return (
    <>
      <div className="lista">{ex.cxp.map((c) => <Fila key={c.id} titulo={`Factura ${c.doc}`} sub={`Vence ${fechaCorta(c.vence)}${c.ocId ? ` · ${(d.oc.find((o) => o.id === c.ocId) || {}).folio || ""}` : ""}`}
        datos={(c.pagos || []).length ? `Pagos: ${(c.pagos || []).map((x) => dinero(x.monto)).join(", ")}` : "Sin pagos"} badge={<BadgeEstado mapa={EST_CXP} k={c.estadoActual} />}
        derecha={<div className="der"><b>{dinero(c.saldo)}</b>{A.permisosVentas(u).pagos && c.saldo > 0 && <div><Button variante="ghost" className="btn-peq" onClick={(e) => { e.stopPropagation(); setPago({ cxpId: c.id, monto: String(c.saldo), referencia: "" }); }}>Pagar</Button></div>}</div>} />)}
        {!ex.cxp.length && <Vacio icon="wallet">Sin cuentas por pagar.</Vacio>}</div>
      {pago && <Sheet abierto onClose={() => setPago(null)} titulo="Registrar pago al proveedor" pie={<Button block onClick={() => { const r = run((dd) => A.pagarCxp(dd, pago), "Pago registrado."); if (r.ok) setPago(null); }}>Registrar pago</Button>}>
        <Field label="Monto"><Input inputMode="decimal" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} /></Field>
        <Field label="Referencia de transferencia"><Input value={pago.referencia} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} /></Field>
        <p className="peq mu">Simulación: no se mueve dinero. Solo se registra el pago hecho en la banca.</p>
      </Sheet>}
    </>
  );
}

function Evaluacion({ d, u, ex }) {
  const e = ex.evaluacion;
  const [f, setF] = useState(null);
  return (
    <>
      <div className="kpis">
        <Kpi label="Calificación general" valor={e.general != null ? `${e.general} / 5` : "—"} nota={`${e.n} evaluaciones`} />
        <Kpi label="Entregas completas" valor={e.entregasCompletasPct != null ? `${e.entregasCompletasPct} %` : "—"} nota={`${e.ordenesRecibidas} OC recibidas · ${e.devoluciones} devoluciones`} />
      </div>
      <div className="lista">{A.CRITERIOS_EVAL.map(([k, l]) => <Fila key={k} titulo={l} derecha={<Estrellas valor={Math.round(e.porCriterio[k] || 0)} />} />)}</div>
      {A.permisosVentas(u).inventario && <Button icon="star" onClick={() => setF({ puntualidad: 0, calidad: 0, precio: 0, servicio: 0, comentario: "" })}>Evaluar</Button>}
      <Titulo>Historial</Titulo>
      <div className="lista">{ex.evaluaciones.map((x) => <Fila key={x.id} titulo={`${fechaCorta(x.fecha)} · ${R.nombreUsuario(d, x.evaluadoPor)}`} sub={x.comentario} datos={`P ${x.puntualidad} · C ${x.calidad} · $ ${x.precio} · S ${x.servicio}`} />)}</div>
      {f && <Sheet abierto onClose={() => setF(null)} titulo="Evaluar proveedor" pie={<Button block onClick={() => { const r = run((dd) => A.evaluarProveedor(dd, { proveedorId: ex.proveedor.id, ...f }), "Evaluación guardada."); if (r.ok) setF(null); }}>Guardar</Button>}>
        {A.CRITERIOS_EVAL.map(([k, l]) => <Field key={k} label={l}><Estrellas valor={f[k]} onChange={(n) => setF({ ...f, [k]: n })} /></Field>)}
        <Field label="Comentario"><Area value={f.comentario} onChange={(x) => setF({ ...f, comentario: x.target.value })} /></Field>
      </Sheet>}
    </>
  );
}

function Docs({ u, ex }) {
  const [f, setF] = useState(null);
  const img = async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; try { setF({ ...f, miniatura: await reducirImagen(file, 360) }); } catch (x) { aviso(x.message, "bad"); } };
  return (
    <>
      {A.permisosVentas(u).inventario && <Button icon="plus" onClick={() => setF({ nombre: "", tipo: "fiscal", vigenteHasta: "", miniatura: null })}>Agregar documento</Button>}
      <div className="lista">{ex.docs.map((x) => <Fila key={x.id} titulo={x.nombre} sub={`${x.tipo} · subido ${fechaCorta(x.subido)}`} datos={x.nota}
        badge={x.vencido ? <Badge tono="bad">Vencido</Badge> : x.porVencer ? <Badge tono="warn">Vence pronto</Badge> : x.vigenteHasta ? <Badge tono="ok">Vigente</Badge> : <Badge tono="neutral">Sin vigencia</Badge>}
        derecha={x.vigenteHasta ? <span className="peq">{fechaCorta(x.vigenteHasta)}</span> : null} />)}</div>
      {f && <Sheet abierto onClose={() => setF(null)} titulo="Nuevo documento" pie={<Button block onClick={() => { const r = run((dd) => A.agregarDocumentoProveedor(dd, { proveedorId: ex.proveedor.id, ...f }), "Documento agregado."); if (r.ok) setF(null); }}>Guardar</Button>}>
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Opinión de cumplimiento 32-D" /></Field>
        <div className="dos"><Field label="Tipo"><Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="fiscal">Fiscal</option><option value="contrato">Contrato</option><option value="banco">Bancario</option><option value="otro">Otro</option></Select></Field>
          <Field label="Vigente hasta"><Input type="date" value={f.vigenteHasta} onChange={(e) => setF({ ...f, vigenteHasta: e.target.value })} /></Field></div>
        <label className="btn btn-ghost btn-peq">Foto del documento (miniatura)<input type="file" accept="image/*" hidden onChange={img} /></label>
        {f.miniatura && <img className="v-foto" src={f.miniatura} alt="Documento" />}
      </Sheet>}
    </>
  );
}
