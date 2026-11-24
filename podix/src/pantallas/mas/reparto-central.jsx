// Almacén central (Centenario): entrada de compra con foto de factura → reparto sugerido por sucursal (ajustable) → envío →
// la sucursal confirma «recibido» o captura faltantes. Alertas de mínimo y celular de WhatsApp simulado a un lado.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Field, Input, Select, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { reducirImagen } from "../../ui/vista.jsx";
import { dinero } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as P from "../../store/acciones_pie_clinic.js";
import Celular from "../../componentes/pie/Celular.jsx";
import "../../estilos_pie.css";

const correr = (fn) => { const r = mutar(fn); if (r && r.ok === false) aviso(r.error, "bad"); return r; };

export default function RepartoCentral() {
  const { d, u } = useSesion();
  const ventas = useMemo(() => d.productos.filter((p) => p.tipo === "venta"), [d.productos]);
  const [pid, setPid] = useState(() => ventas.find((p) => p.sku === "PLA-011")?.id || ventas[0]?.id);
  const [cant, setCant] = useState("25");
  const [costo, setCosto] = useState("");
  const [fac, setFac] = useState("FAC-" + String(1200 + Math.floor(Math.random() * 90)));
  const [foto, setFoto] = useState(null);
  const [total, setTotal] = useState("25");
  const [plan, setPlan] = useState(null); // [{sucursalId,nombre,existencia,venta,sugerido,ajustado}]
  const alertas = useMemo(() => P.alertasMinimo(d), [d]);
  const camino = P.enCamino(d);
  const prod = d.productos.find((p) => p.id === pid);
  const stockCen = R.stock(d, "CEN", pid);
  const [falt, setFalt] = useState({});

  if (!u) return <Vacio icon="lock">Inicia sesión.</Vacio>;
  const nombreProd = (id) => d.productos.find((p) => p.id === id)?.nombre || id;
  const nombreSuc = (id) => d.sucursales.find((s) => s.id === id)?.nombre || id;

  const subirFoto = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { setFoto(await reducirImagen(f, 520, 0.6)); } catch (x) { aviso(x.message, "bad"); }
  };
  const registrar = () => {
    const r = correr((x) => P.entradaCentral(x, { productoId: pid, cant, costo: costo === "" ? undefined : costo, folioFactura: fac, proveedor: "Proveedor", foto }, u));
    if (r?.ok) { aviso("Entrada registrada en el almacén central"); setTotal(String(cant)); setFoto(null); }
  };
  const sugerir = () => {
    const filas = P.sugerirReparto(d, pid, Number(total));
    setPlan(filas.map((f) => ({ ...f, ajustado: f.sugerido })));
  };
  const sumaAj = plan ? plan.reduce((a, f) => a + (Number(f.ajustado) || 0), 0) : 0;
  const aprobar = () => {
    const r = correr((x) => P.aprobarReparto(x, { productoId: pid, partidas: plan.map((f) => ({ sucursalId: f.sucursalId, cant: f.ajustado })) }, u));
    if (r?.ok) { aviso("Reparto aprobado y enviado"); setPlan(null); }
  };

  return (
    <div className="pc-cel-w">
      <div className="pc-izq pc-w">
        <div className="pc-marca">Pie Clinic · Almacén central (Centenario)</div>

        <Card>
          <h3>Alertas de inventario mínimo {alertas.length > 0 && <Badge tono="bad">{alertas.length}</Badge>}</h3>
          {!alertas.length && <div className="mu">Todo por encima del mínimo.</div>}
          <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
            {alertas.slice(0, 12).map((a) => (
              <div key={`${a.almacenId}${a.productoId}`} className="fila-flex" style={{ justifyContent: "space-between", gap: 8 }}>
                <span><b>{a.almacen}</b> · {a.producto}</span><Badge tono="bad">{a.stock} / mín. {a.minimo}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3>1 · Entrada de compra con foto de factura</h3>
          <Field label="Producto"><Select value={pid} onChange={(e) => { setPid(e.target.value); setPlan(null); }}>{ventas.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.marca}</option>)}</Select></Field>
          <div className="form2">
            <Field label="Cantidad"><Input type="number" inputMode="numeric" value={cant} onChange={(e) => setCant(e.target.value)} /></Field>
            <Field label={`Costo unitario (lista ${dinero(prod?.costo || 0)})`}><Input type="number" inputMode="decimal" value={costo} placeholder={String(prod?.costo || "")} onChange={(e) => setCosto(e.target.value)} /></Field>
          </div>
          <Field label="Folio de la factura"><Input value={fac} onChange={(e) => setFac(e.target.value)} /></Field>
          <Field label="Foto de la factura"><Input type="file" accept="image/*" capture="environment" onChange={subirFoto} /></Field>
          {foto && <img src={foto} alt="Factura" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, margin: "6px 0" }} />}
          <Button icon="download" block onClick={registrar}>Registrar entrada en Centenario</Button>
          <div className="mu peq" style={{ marginTop: 6 }}>Existencia actual en el almacén central: <b>{stockCen}</b></div>
          {(d.entradasCentral || []).slice(0, 2).map((e) => <div key={e.id} className="mu peq">• {e.folio} · {e.cant} × {nombreProd(e.productoId)} · {e.folioFactura} {e.foto ? "📎" : ""}</div>)}
        </Card>

        <Card>
          <h3>2 · Reparto sugerido por sucursal</h3>
          <div className="mu peq" style={{ marginBottom: 6 }}>Se propone según lo vendido el último mes y la existencia de cada sucursal. El responsable ajusta y aprueba.</div>
          <div className="form2">
            <Field label="Piezas a repartir"><Input type="number" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></Field>
            <div style={{ alignSelf: "end" }}><Button variante="sec" icon="sparkle" block onClick={sugerir}>Sugerir reparto</Button></div>
          </div>
          {plan && (
            <>
              <table className="pc-cuadro">
                <thead><tr><th>Sucursal</th><th>Tiene</th><th>Vendió</th><th>Sugerido</th><th>Enviar</th></tr></thead>
                <tbody>
                  {plan.map((f, i) => (
                    <tr key={f.sucursalId}><td>{f.nombre}</td><td>{f.existencia}</td><td>{f.venta}</td><td>{f.sugerido}</td>
                      <td><input className="inp" style={{ width: 64, textAlign: "right" }} type="number" inputMode="numeric" min="0" value={f.ajustado} onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, ajustado: e.target.value } : x)))} /></td></tr>
                  ))}
                </tbody>
              </table>
              <div className={sumaAj > stockCen ? "pc-mal" : "mu"} style={{ margin: "8px 0" }}>Total a enviar: <b>{sumaAj}</b> de {stockCen} en el almacén central</div>
              <Button icon="check" block onClick={aprobar} disabled={!sumaAj || sumaAj > stockCen}>Aprobar y enviar reparto</Button>
            </>
          )}
        </Card>

        <Card>
          <h3>3 · Envíos en camino ({camino.length})</h3>
          {!camino.length && <div className="mu">No hay envíos en camino. Aprueba un reparto para verlo aquí.</div>}
          {camino.map((t) => {
            const p0 = t.partidas[0];
            return (
              <div key={t.id} style={{ borderTop: "1px solid #e5e7eb", padding: "10px 0" }}>
                <b>{nombreSuc(t.destinoId)}</b> · {p0.enviado} × {nombreProd(p0.productoId)} <span className="mu">({t.folio})</span>
                <div className="pc-acciones" style={{ marginTop: 6, alignItems: "center" }}>
                  <Button icon="check" onClick={() => correr((x) => P.confirmarRecepcion(x, t.id, 0))}>Recibido completo</Button>
                  <Input style={{ width: 104 }} type="number" inputMode="numeric" min="0" placeholder="Faltan" value={falt[t.id] ?? ""} onChange={(e) => setFalt({ ...falt, [t.id]: e.target.value })} />
                  <Button variante="sec" icon="alert" onClick={() => correr((x) => P.confirmarRecepcion(x, t.id, falt[t.id] || 0))}>Capturar faltantes</Button>
                </div>
              </div>
            );
          })}
          <div className="mu peq" style={{ marginTop: 6 }}>Demostración: aquí se hace lo que cada sucursal confirma desde su celular. El inventario se actualiza solo y la diferencia queda registrada.</div>
        </Card>
        <Titulo>Pie Clinic</Titulo>
      </div>
      <Celular />
    </div>
  );
}
