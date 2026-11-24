// Traspasos: solicitar (destino = mi almacén), autorizar y enviar (solo el origen), seguimiento e historial.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { autorizarTraspaso, crearTraspaso, enviarTraspaso, ESTADOS_TRASPASO } from "../../store/acciones_almacen.js";
import { dinero, fechaCorta } from "../../lib/format.js";
import { Badge, Button, Card, Chips, Field, Fila, Icon, Input, Resumen, Select, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import Escaner from "../../componentes/almacen/Escaner.jsx";

const TONO = { solicitado: "warn", autorizado: "info", en_transito: "info", recibido: "ok", recibido_con_diferencia: "bad" };
const num = (v) => (v === "" || v == null ? NaN : Number(v));
const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);

export default function Traspasos() {
  const { d, sucursalId: alm } = useSesion();
  const [vista, setVista] = useState("enviar");
  const [nuevo, setNuevo] = useState(false);
  const [sel, setSel] = useState(null);

  const mios = d.traspasos.filter((t) => t.origenId === alm || t.destinoId === alm);
  const porEnviar = mios.filter((t) => t.origenId === alm && ["solicitado", "autorizado"].includes(t.estado));
  const pedidos = mios.filter((t) => t.destinoId === alm && !t.estado.startsWith("recibido"));
  const hist = mios.filter((t) => t.estado.startsWith("recibido"));
  const lista = vista === "enviar" ? porEnviar : vista === "pedidos" ? pedidos : hist;

  return (
    <>
      <Button block icon="plus" onClick={() => setNuevo(true)} disabled={alm === "CEN"}>Solicitar traspaso</Button>
      {alm === "CEN" && <p className="mu peq">El almacén central surte a las sucursales; para solicitar mercancía cambia a tu sucursal (Más ▸ Cambiar sucursal activa).</p>}
      <Chips valor={vista} onChange={setVista} opciones={[{ v: "enviar", l: "Por enviar", n: porEnviar.length }, { v: "pedidos", l: "Mis solicitudes", n: pedidos.length }, { v: "hist", l: "Historial" }]} />
      <div className="lista">
        {lista.map((t) => (
          <Fila key={t.id} titulo={`${t.folio} · ${R.nombreAlmacen(d, t.origenId)} → ${R.nombreAlmacen(d, t.destinoId)}`} sub={`Solicitado ${fechaCorta(t.fecha)}`}
            badge={<Badge tono={TONO[t.estado]}>{ESTADOS_TRASPASO[t.estado]}</Badge>}
            datos={<><span>{t.partidas.length} partidas</span><span>{t.partidas.reduce((a, p) => a + p.solicitado, 0)} pz solicitadas</span></>} onClick={() => setSel(t.id)} />
        ))}
        {!lista.length && <Vacio icon="repeat">{vista === "enviar" ? "No hay traspasos por enviar desde este almacén." : vista === "pedidos" ? "No tienes solicitudes abiertas." : "Sin historial."}</Vacio>}
      </div>
      {nuevo && <FormNuevo onClose={() => setNuevo(false)} />}
      {sel && <Detalle t={d.traspasos.find((x) => x.id === sel)} onClose={() => setSel(null)} />}
    </>
  );
}

function FormNuevo({ onClose }) {
  const { d, sucursalId: alm } = useSesion();
  const origenes = d.almacenes.filter((a) => a.id !== alm);
  const [origen, setOrigen] = useState("CEN");
  const [items, setItems] = useState([]); // [{productoId, cant}]
  const [pid, setPid] = useState("");
  const [scan, setScan] = useState(false);
  const agregar = (id) => { if (!id) return; setItems((s) => (s.some((x) => x.productoId === id) ? s : [...s, { productoId: id, cant: "1" }])); setPid(""); };
  const guardar = () => {
    const r = mutar((dd) => crearTraspaso(dd, { origenId: origen, destinoId: alm, partidas: items.map((x) => ({ productoId: x.productoId, solicitado: num(x.cant) })) }, yo(dd)));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Traspaso ${r.traspaso.folio} solicitado`); onClose();
  };
  return (
    <>
      <Sheet abierto onClose={onClose} titulo="Solicitar traspaso" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block disabled={!items.length} onClick={guardar}>Solicitar</Button></div>}>
        <div className="form">
          <Field label="Destino"><Input value={R.nombreAlmacen(d, alm)} readOnly /></Field>
          <Field label="Origen"><Select value={origen} onChange={(e) => setOrigen(e.target.value)}>{origenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></Field>
          <Field label="Agregar producto">
            <div className="fila-flex">
              <Select value={pid} onChange={(e) => agregar(e.target.value)}><option value="">Elegir…</option>{d.productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}</Select>
              <Button variante="ghost" icon="scan" onClick={() => setScan(true)} aria-label="Escanear" />
            </div>
          </Field>
          {items.map((x) => (
            <Card key={x.productoId}>
              <div className="fila-t"><b>{R.nombreProducto(d, x.productoId)}</b><button className="icono" aria-label="Quitar" onClick={() => setItems((s) => s.filter((y) => y !== x))}><Icon name="x" /></button></div>
              <div className="peq mu">En {R.nombreAlmacen(d, origen)}: {R.stock(d, origen, x.productoId)} pz · en el tuyo: {R.stock(d, alm, x.productoId)}</div>
              <Field label="Cantidad"><Input type="number" inputMode="numeric" min="1" value={x.cant} onChange={(e) => setItems((s) => s.map((y) => (y === x ? { ...y, cant: e.target.value } : y)))} /></Field>
            </Card>
          ))}
          {!items.length && <p className="mu">Agrega los productos que necesitas.</p>}
        </div>
      </Sheet>
      <Escaner abierto={scan} onClose={() => setScan(false)} productos={d.productos} onCodigo={(p) => agregar(p.id)} />
    </>
  );
}

function Detalle({ t, onClose }) {
  const { d, sucursalId: alm } = useSesion();
  const soyOrigen = t.origenId === alm;
  const puedeEnviar = soyOrigen && ["solicitado", "autorizado"].includes(t.estado);
  const [cant, setCant] = useState(() => Object.fromEntries(t.partidas.map((p) => [p.productoId, String(p.solicitado)])));
  const mapa = () => Object.fromEntries(t.partidas.map((p) => [p.productoId, num(cant[p.productoId])]));
  const falta = t.partidas.filter((p) => num(cant[p.productoId]) > R.stock(d, t.origenId, p.productoId));
  const invalida = falta.length > 0 || t.partidas.some((p) => !Number.isInteger(num(cant[p.productoId])) || num(cant[p.productoId]) < 0);
  const enviar = () => {
    const r = mutar((dd) => enviarTraspaso(dd, t.id, mapa(), yo(dd), dd.sesion.sucursalId));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Traspaso enviado: en tránsito ✔"); onClose();
  };
  const autorizar = () => {
    const r = mutar((dd) => autorizarTraspaso(dd, t.id, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Traspaso autorizado");
  };
  return (
    <Sheet abierto onClose={onClose} titulo={`${t.folio} · ${ESTADOS_TRASPASO[t.estado]}`}
      pie={puedeEnviar ? (
        <div className="form">
          <Button block icon="truck" disabled={invalida} onClick={enviar}>{t.estado === "solicitado" ? "Autorizar y enviar" : "Enviar"}</Button>
          {t.estado === "solicitado" && <Button variante="sec" block onClick={autorizar}>Solo autorizar</Button>}
        </div>) : null}>
      <Card><Resumen filas={[["Origen", R.nombreAlmacen(d, t.origenId)], ["Destino", R.nombreAlmacen(d, t.destinoId)], ["Solicitado", fechaCorta(t.fecha)], t.enviadoEn && ["Enviado", fechaCorta(t.enviadoEn)], t.recibidoEn && ["Recibido", fechaCorta(t.recibidoEn)]]} /></Card>
      {t.partidas.map((p) => (
        <Card key={p.productoId} tono={puedeEnviar && num(cant[p.productoId]) > R.stock(d, t.origenId, p.productoId) ? "bad" : undefined}>
          <div className="fila-t"><b>{R.nombreProducto(d, p.productoId)}</b>
            {t.estado.startsWith("recibido") && <Badge tono={p.recibido === p.enviado ? "ok" : "warn"}>{p.recibido}/{p.enviado}</Badge>}</div>
          <div className="peq mu">Solicitado {p.solicitado}{p.enviado ? ` · enviado ${p.enviado}` : ""}{p.costo != null ? ` · costo ${dinero(p.costo)}` : ""}{puedeEnviar ? ` · existencia ${R.stock(d, t.origenId, p.productoId)}` : ""}</div>
          {puedeEnviar && <Field label="Cantidad a enviar" error={num(cant[p.productoId]) > R.stock(d, t.origenId, p.productoId) ? "No hay existencia suficiente" : null}><Input type="number" inputMode="numeric" min="0" value={cant[p.productoId]} onChange={(e) => setCant((s) => ({ ...s, [p.productoId]: e.target.value }))} /></Field>}
        </Card>
      ))}
      {!soyOrigen && t.estado === "solicitado" && <p className="mu">Esperando que {R.nombreAlmacen(d, t.origenId)} autorice y envíe.</p>}
    </Sheet>
  );
}
