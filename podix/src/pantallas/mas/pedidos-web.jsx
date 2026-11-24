// Pedidos en línea (tienda pública): cajero, almacén, gerente y administración.
// nuevo → preparando → listo → entregado / cancelado. Al entregar se crea la venta (T-…) y se descuenta el inventario (PEPS).
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as C from "../../store/acciones_comercial.js";
import { Badge, Button, Chips, Buscador, Sheet, Field, Select, Area, Icon, Kpi, Vacio, Resumen, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { dinero, fechaCorta, hora } from "../../lib/format.js";
import "../../estilos_comercial.css";

const FORMA = { en_linea: "En línea (simulado)", en_sucursal: "En sucursal / contra entrega" };
const PAGO_EST = { pagado: ["ok", "Pagado"], pendiente: ["warn", "Por cobrar"], por_reembolsar: ["bad", "Por reembolsar"] };
const verTienda = () => { location.hash = "#/tienda"; mutar(() => {}); };

export default function PedidosWeb() {
  const { d, u, sucursalId } = useSesion();
  const [estado, setEstado] = useState("activos");
  const [suc, setSuc] = useState("activa");
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [entregando, setEntregando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [forma, setForma] = useState("efectivo");
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);

  const central = C.esCentral(u);
  const permitido = C.ROLES_PEDIDOS.includes(u.rol);
  const filtroSuc = central ? (suc === "activa" ? sucursalId : suc === "todas" ? null : suc) : sucursalId;
  const todos = useMemo(() => (permitido ? C.pedidosVisibles(d, u, filtroSuc) : []), [d, u, filtroSuc, permitido]);
  const cuenta = (e) => todos.filter((p) => p.estado === e).length;
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return todos.filter((p) => (estado === "activos" ? C.ACTIVOS.includes(p.estado) : estado === "todos" || p.estado === estado) && (!t || `${p.folio} ${p.cliente.nombre} ${p.cliente.telefono}`.toLowerCase().includes(t)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [todos, estado, q]);
  const sel = selId ? (d.pedidosWeb || []).find((p) => p.id === selId) : null;

  if (!permitido) return <Vacio icon="lock">Tu rol no atiende pedidos en línea.</Vacio>;

  const correr = (fn, ok) => {
    setCargando(true);
    const r = mutar((s) => fn(s));
    setCargando(false);
    if (!r.ok) { aviso(r.error, "bad"); return r; }
    if (ok) aviso(ok, "ok");
    return r;
  };
  const faltan = sel ? sel.partidas.filter((x) => R.disponible(d, sel.sucursalId, x.productoId) < x.cant).map((x) => `${x.nombre} (hay ${Math.max(0, R.disponible(d, sel.sucursalId, x.productoId))}, necesita ${x.cant})`) : [];
  const otraSuc = sel && sel.sucursalId !== sucursalId;

  const tarjeta = (p) => (
    <div className="cm-ped">
      <div className="cm-ped-t"><span>{p.folio}</span><Badge tono={C.TONO_ESTADO[p.estado]}>{C.ESTADOS_PEDIDO[p.estado]}</Badge></div>
      <div>{p.cliente.nombre}</div>
      <div className="cm-ped-d"><span>{fechaCorta(p.fecha)} {hora(p.fecha)}</span><span>{p.entrega === "domicilio" ? "A domicilio" : "Recoge"}</span><span>{R.nombreSucursal(d, p.sucursalId)}</span></div>
      <div className="cm-ped-t"><b>{dinero(p.total)}</b><Badge tono={PAGO_EST[p.pago.estado][0]}>{PAGO_EST[p.pago.estado][1]}</Badge></div>
    </div>
  );
  const columnas = [
    { k: "f", t: "Folio", v: (p) => p.folio, orden: (p) => p.folio },
    { k: "c", t: "Cliente", v: (p) => p.cliente.nombre },
    { k: "s", t: "Sucursal", v: (p) => R.nombreSucursal(d, p.sucursalId) },
    { k: "e", t: "Estado", v: (p) => <Badge tono={C.TONO_ESTADO[p.estado]}>{C.ESTADOS_PEDIDO[p.estado]}</Badge>, orden: (p) => p.estado },
    { k: "g", t: "Entrega", v: (p) => (p.entrega === "domicilio" ? "A domicilio" : "En sucursal") },
    { k: "p", t: "Pago", v: (p) => <Badge tono={PAGO_EST[p.pago.estado][0]}>{PAGO_EST[p.pago.estado][1]}</Badge>, orden: (p) => p.pago.estado },
    { k: "t", t: "Total", v: (p) => dinero(p.total), der: true, orden: (p) => p.total },
    { k: "d", t: "Fecha", v: (p) => `${fechaCorta(p.fecha)} ${hora(p.fecha)}`, orden: (p) => p.fecha },
  ];

  return (
    <>
      <div className="kpis">
        <Kpi label="Nuevos" valor={cuenta("nuevo")} tono="info" />
        <Kpi label="Preparando" valor={cuenta("preparando")} tono="warn" />
        <Kpi label="Listos para entregar" valor={cuenta("listo")} tono="ok" />
        <Kpi label="Entregados" valor={cuenta("entregado")} />
      </div>
      <div className="cm-barra">
        <div style={{ flex: "1 1 240px" }}><Buscador valor={q} onChange={setQ} placeholder="Folio, cliente o teléfono" /></div>
        {central && (
          <div style={{ flex: "0 1 220px" }}>
            <Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Sucursal">
              <option value="activa">Sucursal activa ({R.nombreSucursal(d, sucursalId)})</option><option value="todas">Todas las sucursales</option>
              {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </div>
        )}
        <Button variante="sec" icon="shop" onClick={verTienda}>Ver tienda en línea</Button>
      </div>
      {!central && <div className="cm-aviso cm-aviso-info"><Icon name="building" size={16} /><span>Ves los pedidos que se recogen en tu sucursal activa: <b>{R.nombreSucursal(d, sucursalId)}</b>.</span></div>}
      <Chips scroll valor={estado} onChange={setEstado} opciones={[
        { v: "activos", l: "Por atender", n: todos.filter((p) => C.ACTIVOS.includes(p.estado)).length }, { v: "nuevo", l: "Nuevos", n: cuenta("nuevo") }, { v: "preparando", l: "Preparando", n: cuenta("preparando") },
        { v: "listo", l: "Listos", n: cuenta("listo") }, { v: "entregado", l: "Entregados", n: cuenta("entregado") }, { v: "cancelado", l: "Cancelados", n: cuenta("cancelado") }, { v: "todos", l: "Todos", n: todos.length }]} />
      <div className="cm-ped-lista">
        <Vista id="pedidos-web" items={items} tarjeta={tarjeta} columnas={columnas} onAbrir={(p) => setSelId(p.id)} vacio="No hay pedidos con esos filtros." minTarjeta={270} />
      </div>

      <Sheet abierto={!!sel} onClose={() => setSelId(null)} titulo={sel ? `Pedido ${sel.folio}` : ""}
        pie={sel && (
          <div className="form">
            {sel.estado === "nuevo" && <Button block loading={cargando} icon="check" onClick={() => correr((s) => C.avanzarPedido(s, sel.id), "Pedido en preparación")}>Empezar a preparar</Button>}
            {sel.estado === "preparando" && <Button block loading={cargando} icon="check" onClick={() => correr((s) => C.avanzarPedido(s, sel.id), "Pedido listo para entregar")}>Marcar como listo</Button>}
            {sel.estado === "listo" && <Button block loading={cargando} icon="receipt" disabled={otraSuc} onClick={() => { if (sel.pago.estado !== "pagado") { setEntregando(true); return; } const r = correr((s) => C.entregarPedido(s, sel.id), "Pedido entregado y venta registrada"); if (r.ok) setSelId(null); }}>Entregar al cliente</Button>}
            {C.ACTIVOS.includes(sel.estado) && <Button block variante="sec" icon="x" onClick={() => { setMotivo(""); setCancelando(true); }}>Cancelar pedido</Button>}
          </div>
        )}>
        {sel && (
          <>
            <div className="cm-ped-t"><Badge tono={C.TONO_ESTADO[sel.estado]}>{C.ESTADOS_PEDIDO[sel.estado]}</Badge><Badge tono={PAGO_EST[sel.pago.estado][0]}>{PAGO_EST[sel.pago.estado][1]}</Badge></div>
            <div className="card">
              <b>{sel.cliente.nombre}</b>
              <div className="mu peq">{sel.cliente.telefono} · {sel.cliente.correo}</div>
              <div className="mu peq">{sel.entrega === "domicilio" ? `Envío a: ${sel.direccion}` : `Recoge en ${R.nombreSucursal(d, sel.sucursalId)}`}</div>
              <div className="mu peq">Pedido del {fechaCorta(sel.fecha)} {hora(sel.fecha)} · se surte en {R.nombreSucursal(d, sel.sucursalId)}</div>
            </div>
            <div className="card">
              {sel.partidas.map((x) => <div key={x.productoId} className="cm-linea"><span>{x.cant} × {x.nombre}</span><b>{dinero(x.importe)}</b></div>)}
              {sel.envio > 0 && <div className="cm-linea"><span>Envío a domicilio{sel.envioPorValidar ? " (por validar)" : ""}</span><b>{dinero(sel.envio)}</b></div>}
              <div className="cm-linea"><span className="fuerte">Total</span><b>{dinero(sel.total)}</b></div>
              <div className="mu peq">Forma de pago: {FORMA[sel.pago.forma]}{sel.pago.simulado ? " · cobro simulado" : ""}{sel.pago.ref ? ` · ref. ${sel.pago.ref}` : ""}</div>
            </div>
            {C.ACTIVOS.includes(sel.estado) && faltan.length > 0 && <div className="cm-aviso cm-aviso-bad"><Icon name="alert" size={16} /><span>Falta existencia física para entregar: {faltan.join("; ")}. Pide un traspaso o cancela el pedido.</span></div>}
            {sel.estado === "listo" && otraSuc && <div className="cm-aviso"><Icon name="alert" size={16} /><span>Para entregar, cambia tu sucursal activa a {R.nombreSucursal(d, sel.sucursalId)}.</span></div>}
            {sel.estado === "listo" && sel.pago.estado !== "pagado" && u.rol !== "cajero" && <div className="cm-aviso"><Icon name="cash" size={16} /><span>Este pedido se cobra al entregar: lo registra un cajero con turno abierto.</span></div>}
            {sel.ventaId && <div className="cm-aviso cm-aviso-info"><Icon name="receipt" size={16} /><span>Venta {(d.ventas.find((v) => v.id === sel.ventaId) || {}).folio || "—"} registrada al entregar.</span></div>}
            {sel.motivoCancelacion && <div className="cm-aviso cm-aviso-bad"><Icon name="x" size={16} /><span>Cancelado: {sel.motivoCancelacion}</span></div>}
            <h3 style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--mu)" }}>Historial</h3>
            <div className="cm-hist">{[...sel.historial].reverse().map((h, i) => <div key={i}><b>{C.ESTADOS_PEDIDO[h.estado]}</b><span>{fechaCorta(h.ts)} {hora(h.ts)}{h.usuarioId ? ` · ${R.nombreUsuario(d, h.usuarioId).replace(/ \(.*\)/, "")}` : " · cliente"}</span>{h.nota ? <span>{h.nota}</span> : null}</div>)}</div>
          </>
        )}
      </Sheet>

      <Sheet abierto={entregando && !!sel} onClose={() => setEntregando(false)} titulo="Cobrar y entregar"
        pie={<Button block loading={cargando} onClick={() => { const r = correr((s) => C.entregarPedido(s, sel.id, { formaPago: forma }), "Pedido entregado y cobrado"); if (r && r.ok) { setEntregando(false); setSelId(null); } }}>Cobrar {sel ? dinero(sel.total) : ""} y entregar</Button>}>
        {sel && <>
          <Resumen filas={[["Pedido", sel.folio], ["Total a cobrar", dinero(sel.total), true]]} />
          <Field label="Forma de pago"><Select value={forma} onChange={(e) => setForma(e.target.value)}>{C.FORMAS_ENTREGA_PAGO.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}</Select></Field>
          <p className="mu peq">El cobro se liga a tu turno de caja abierto y descuenta el inventario de {R.nombreSucursal(d, sel.sucursalId)} con costeo PEPS.</p>
        </>}
      </Sheet>

      <Sheet abierto={cancelando && !!sel} onClose={() => setCancelando(false)} titulo="Cancelar pedido"
        pie={<Button block variante="danger" loading={cargando} onClick={() => { const r = correr((s) => C.cancelarPedido(s, sel.id, motivo), "Pedido cancelado; las piezas quedaron libres"); if (r && r.ok) { setCancelando(false); setSelId(null); } }}>Cancelar pedido</Button>}>
        <p className="txt">Las piezas apartadas para este pedido quedan libres otra vez.{sel && sel.pago.estado === "pagado" ? " El pago en línea quedará marcado como «por reembolsar»." : ""}</p>
        <Field label="Motivo"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. el cliente ya no lo necesita" /></Field>
      </Sheet>
    </>
  );
}
