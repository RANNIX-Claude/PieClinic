import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Field, Fila, Input, Pasos, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { ESTADOS_OC, totalOC, crearOC, aprobarEnviarOC, ordenarCxp, estadoCxp, registrarPagoCxp, saldoCxp } from "../../store/acciones_admin.js";

const TR_ESTADO = { solicitado: ["Solicitado", "neutral"], autorizado: ["Autorizado", "info"], en_transito: ["En tránsito", "warn"], recibido: ["Recibido", "ok"], recibido_con_diferencia: ["Recibido con diferencia", "bad"] };
const CXP_ESTADO = { vencida: ["Vencida", "bad"], por_vencer: ["Vence pronto", "warn"], vigente: ["Vigente", "info"], pagada: ["Pagada", "ok"] };

function NuevaOC({ d, abierto, onClose }) {
  const [paso, setPaso] = useState(0);
  const [prov, setProv] = useState("");
  const [partidas, setPartidas] = useState([]);
  const [pid, setPid] = useState("");
  const [cant, setCant] = useState("");
  const [costo, setCosto] = useState("");
  const [cargando, setCargando] = useState(false);
  const total = partidas.reduce((a, x) => a + Number(x.cant) * Number(x.costo), 0);
  const cerrar = () => { setPaso(0); setProv(""); setPartidas([]); setPid(""); setCant(""); setCosto(""); onClose(); };

  const elegir = (id) => { setPid(id); const p = d.productos.find((x) => x.id === id); if (p) setCosto(String(p.costo)); };
  const agregar = () => {
    if (!pid) return aviso("Elige un producto.", "warn");
    if (!(Number.isInteger(Number(cant)) && Number(cant) > 0)) return aviso("La cantidad debe ser un entero mayor que cero.", "warn");
    if (!(Number(costo) > 0)) return aviso("Escribe el costo unitario.", "warn");
    setPartidas((ps) => [...ps.filter((x) => x.productoId !== pid), { productoId: pid, cant: Number(cant), costo: Number(costo) }]);
    setPid(""); setCant(""); setCosto("");
  };
  const siguiente = () => {
    if (paso === 0 && !prov) return aviso("Elige un proveedor.", "warn");
    if (paso === 1 && !partidas.length) return aviso("Agrega al menos una partida.", "warn");
    setPaso(paso + 1);
  };
  const crear = () => {
    setCargando(true);
    const r = mutar((x) => crearOC(x, { proveedorId: prov, partidas, almacenId: "CEN" }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`${r.oc.folio} creada. Falta aprobarla y enviarla.`);
    cerrar();
  };
  const pr = d.proveedores.find((x) => x.id === prov);
  return (
    <Sheet abierto={abierto} onClose={cerrar} titulo="Nueva orden de compra"
      pie={<div className="dos">
        <Button variante="sec" block onClick={() => (paso ? setPaso(paso - 1) : cerrar())}>{paso ? "Atrás" : "Cancelar"}</Button>
        {paso < 2 ? <Button block onClick={siguiente}>Siguiente</Button> : <Button block loading={cargando} onClick={crear}>Crear orden</Button>}
      </div>}>
      <Pasos titulos={["Proveedor", "Partidas", "Resumen"]} paso={paso} />
      {paso === 0 && (<div className="form">
        <Field label="Proveedor"><Select value={prov} onChange={(e) => setProv(e.target.value)}><option value="">Elige…</option>{d.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre} · crédito {p.dias} días</option>)}</Select></Field>
        <Field label="Almacén destino"><Input value="Almacén central (CEN)" disabled readOnly /></Field>
      </div>)}
      {paso === 1 && (<div className="form">
        <Field label="Producto"><Select value={pid} onChange={(e) => elegir(e.target.value)}><option value="">Elige…</option>{d.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
        <div className="dos">
          <Field label="Cantidad"><Input value={cant} onChange={(e) => setCant(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Costo unitario"><Input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" /></Field>
        </div>
        <Button block variante="sec" icon="plus" onClick={agregar}>Agregar partida</Button>
        <div className="lista">
          {partidas.map((x) => (
            <Fila key={x.productoId} titulo={R.nombreProducto(d, x.productoId)} datos={<span>{x.cant} × {dinero(x.costo)}</span>} derecha={<><b>{dinero(x.cant * x.costo)}</b><button className="icono" aria-label="Quitar" onClick={() => setPartidas(partidas.filter((y) => y !== x))}>✕</button></>} />
          ))}
        </div>
        {!!partidas.length && <Resumen filas={[["Total", dinero(total), true]]} />}
      </div>)}
      {paso === 2 && (<>
        <Resumen filas={[["Proveedor", pr ? pr.nombre : "—"], ["Destino", "Almacén central"], ["Partidas", partidas.length], ["Total", dinero(total), true]]} />
        <div className="lista">{partidas.map((x) => <Fila key={x.productoId} titulo={R.nombreProducto(d, x.productoId)} datos={<span>{x.cant} × {dinero(x.costo)}</span>} derecha={<b>{dinero(x.cant * x.costo)}</b>} />)}</div>
        <p className="mu peq">La orden se crea “por aprobar”. Al aprobarla se envía y el almacén central puede recibirla.</p>
      </>)}
    </Sheet>
  );
}

export default function Compras() {
  const { d } = useSesion();
  const [vista, setVista] = useState("oc");
  const [oc, setOc] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [cx, setCx] = useState(null);
  const [monto, setMonto] = useState("");
  const [ref, setRef] = useState("");
  const ocs = [...d.oc].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.folio.localeCompare(a.folio));
  const cxps = ordenarCxp(d);
  const vencidas = d.cxp.filter((c) => estadoCxp(c) === "vencida");
  const porPagar = d.cxp.reduce((a, c) => a + saldoCxp(c), 0);
  const devs = d.devolucionesProveedor || [];
  const o = oc ? d.oc.find((x) => x.id === oc) : null;
  const c = cx ? d.cxp.find((x) => x.id === cx) : null;
  const prov = (id) => (d.proveedores.find((x) => x.id === id) || {}).nombre || id;

  const aprobar = () => { const r = mutar((x) => aprobarEnviarOC(x, o.id)); r.ok ? aviso("Orden aprobada y enviada.") : aviso(r.error, "bad"); };
  const pagar = (m) => {
    const r = mutar((x) => registrarPagoCxp(x, { cxpId: c.id, monto: m, referencia: ref }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.saldo === 0 ? "Cuenta liquidada." : `Pago registrado. Saldo ${dinero(r.saldo)}.`);
    setMonto(""); setRef(""); if (r.saldo === 0) setCx(null);
  };

  return (
    <>
      <Chips scroll opciones={[{ v: "oc", l: "Órdenes de compra" }, { v: "cxp", l: "Por pagar", n: vencidas.length || undefined }, { v: "tr", l: "Traspasos" }, { v: "dev", l: "Devoluciones" }]} valor={vista} onChange={setVista} />

      {vista === "oc" && (<>
        <Button block icon="plus" onClick={() => setNueva(true)}>Nueva orden de compra</Button>
        <div className="lista">
          {ocs.map((x) => { const [l, t] = ESTADOS_OC[x.estado] || [x.estado, "neutral"]; return (
            <Fila key={x.id} titulo={x.folio} badge={<Badge tono={t}>{l}</Badge>} sub={prov(x.proveedorId)} datos={<><span>{fechaCorta(x.fecha)}</span><span>{x.partidas.length} partidas</span></>} derecha={<b>{dinero(totalOC(x))}</b>} onClick={() => setOc(x.id)} />
          ); })}
          {!ocs.length && <Vacio icon="box">Sin órdenes de compra.</Vacio>}
        </div>
      </>)}

      {vista === "cxp" && (<>
        <div className="kpis">
          <Card tono="warn"><small className="mu">Por pagar</small><div style={{ fontSize: 22, fontWeight: 700 }}>{dinero(porPagar)}</div></Card>
          <Card tono={vencidas.length ? "bad" : "ok"}><small className="mu">Vencido</small><div style={{ fontSize: 22, fontWeight: 700 }}>{dinero(vencidas.reduce((a, x) => a + saldoCxp(x), 0))}</div></Card>
        </div>
        <div className="lista">
          {cxps.map((x) => { const e = estadoCxp(x); const [l, t] = CXP_ESTADO[e]; return (
            <Fila key={x.id} titulo={prov(x.proveedorId)} badge={<Badge tono={t}>{l}</Badge>} sub={`Factura ${x.doc}`} datos={<span>Vence {fechaCorta(x.vence)}</span>} derecha={<b>{dinero(saldoCxp(x))}</b>} onClick={() => { setCx(x.id); setMonto(String(saldoCxp(x))); }} />
          ); })}
          {!cxps.length && <Vacio icon="wallet">Sin cuentas por pagar.</Vacio>}
        </div>
      </>)}

      {vista === "tr" && (
        <div className="lista">
          {[...d.traspasos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((t) => { const [l, tn] = TR_ESTADO[t.estado] || [t.estado, "neutral"]; return (
            <Fila key={t.id} titulo={t.folio} badge={<Badge tono={tn}>{l}</Badge>} sub={`${R.nombreAlmacen(d, t.origenId)} → ${R.nombreAlmacen(d, t.destinoId)}`}
              datos={<><span>{fechaCorta(t.fecha)}</span>{t.partidas.map((p) => <span key={p.productoId}>{R.nombreProducto(d, p.productoId)}: {p.recibido || p.enviado || p.solicitado}/{p.solicitado}</span>)}</>} />
          ); })}
          {!d.traspasos.length && <Vacio icon="repeat">Sin traspasos.</Vacio>}
        </div>
      )}

      {vista === "dev" && (
        <div className="lista">
          {devs.map((x, i) => (
            <Fila key={x.id || i} titulo={x.folio || `Devolución ${i + 1}`} badge={<Badge tono="info">{x.estado || "registrada"}</Badge>} sub={prov(x.proveedorId)}
              datos={<>{x.fecha && <span>{fechaCorta(x.fecha)}</span>}{x.motivo && <span>{x.motivo}</span>}</>} derecha={x.monto != null ? <b>{dinero(x.monto)}</b> : null} />
          ))}
          {!devs.length && <Vacio icon="undo">No hay devoluciones a proveedor registradas.</Vacio>}
        </div>
      )}

      <NuevaOC d={d} abierto={nueva} onClose={() => setNueva(false)} />

      <Sheet abierto={!!o} onClose={() => setOc(null)} titulo={o ? o.folio : ""} pie={o && o.estado === "por_aprobar" ? <Button block icon="send" onClick={aprobar}>Aprobar y enviar</Button> : null}>
        {o && (<>
          <Resumen filas={[["Proveedor", prov(o.proveedorId)], ["Destino", R.nombreAlmacen(d, o.almacenId)], ["Fecha", fechaCorta(o.fecha)], ["Estado", (ESTADOS_OC[o.estado] || [o.estado])[0]], o.factura && ["Factura", o.factura], ["Total", dinero(totalOC(o)), true]]} />
          <Titulo>Partidas</Titulo>
          <div className="lista">{o.partidas.map((x) => <Fila key={x.productoId} titulo={R.nombreProducto(d, x.productoId)} datos={<><span>{x.cant} × {dinero(x.costo)}</span><span>Recibido {x.recibido || 0}</span></>} derecha={<b>{dinero(x.cant * x.costo)}</b>} />)}</div>
        </>)}
      </Sheet>

      <Sheet abierto={!!c} onClose={() => setCx(null)} titulo={c ? `Pago a ${prov(c.proveedorId)}` : ""}
        pie={c && saldoCxp(c) > 0 ? <div className="dos"><Button variante="sec" block onClick={() => pagar(monto)}>Pago parcial</Button><Button block onClick={() => pagar(saldoCxp(c))}>Pagar total</Button></div> : null}>
        {c && (<>
          <Resumen filas={[["Factura", c.doc], ["Vence", fechaCorta(c.vence)], ["Estado", CXP_ESTADO[estadoCxp(c)][0]], ["Saldo", dinero(saldoCxp(c)), true]]} />
          {saldoCxp(c) > 0 && <div className="form">
            <Field label="Monto del pago parcial (MXN)" hint={`Máximo ${dinero(saldoCxp(c))}`}><Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Referencia (opcional)"><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transferencia, cheque…" /></Field>
          </div>}
          {(c.pagos || []).length > 0 && (<><Titulo>Pagos registrados</Titulo><div className="lista">{c.pagos.map((p, i) => <Fila key={i} titulo={dinero(p.monto)} sub={p.referencia || "Sin referencia"} datos={<><span>{fechaCorta(p.fecha)}</span><span>{R.nombreUsuario(d, p.usuarioId)}</span></>} />)}</div></>)}
        </>)}
      </Sheet>
    </>
  );
}
