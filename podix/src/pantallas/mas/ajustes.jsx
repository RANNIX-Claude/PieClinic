// Ajustes de inventario: solicitar (merma, robo, daño, caducidad) y ver su autorización y aplicación.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { MOTIVOS_AJUSTE, solicitarAjuste, valorDiferencia } from "../../store/acciones_almacen.js";
import { dinero, fechaCorta } from "../../lib/format.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Input, Select, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import Escaner from "../../componentes/almacen/Escaner.jsx";

const NIVEL = { gerente: "Gerente", admin: "Administración", direccion: "Dirección" };
const TONO = { pendiente: "warn", autorizado: "ok", rechazado: "bad" };

export default function Ajustes() {
  const { d, sucursalId: alm } = useSesion();
  const [f, setF] = useState("pendiente");
  const [nuevo, setNuevo] = useState(false);
  const propias = d.autorizaciones.filter((a) => a.tipo === "ajuste_inventario" && (a.ref ? a.ref.almacenId === alm : a.sucursalId === alm));
  const lista = propias.filter((a) => (f === "pendiente" ? a.estado === "pendiente" : f === "autorizado" ? a.estado === "autorizado" : a.estado === "rechazado"));
  const aplicados = d.ajustesInventario.filter((a) => a.almacenId === alm);
  return (
    <>
      <Button block icon="plus" onClick={() => setNuevo(true)}>Solicitar ajuste</Button>
      <Chips valor={f} onChange={setF} opciones={[
        { v: "pendiente", l: "Por autorizar", n: propias.filter((a) => a.estado === "pendiente").length },
        { v: "autorizado", l: "Aplicados", n: aplicados.length }, { v: "rechazado", l: "Rechazados" }]} />
      <div className="lista">
        {f === "autorizado" && aplicados.map((a) => (
          <Fila key={a.id} titulo={R.nombreProducto(d, a.productoId)} sub={a.motivo} badge={<Badge tono={a.cant < 0 ? "warn" : "ok"}>{a.cant > 0 ? "+" : ""}{a.cant}</Badge>}
            datos={<><span>{fechaCorta(a.fecha)}</span><span>Autorizó {R.nombreUsuario(d, a.autorizadoPor)}</span></>} />
        ))}
        {f !== "autorizado" && lista.map((a) => (
          <Fila key={a.id} titulo={a.detalle} badge={<Badge tono={TONO[a.estado]}>{a.estado}</Badge>}
            datos={<><span>{a.monto ? dinero(a.monto) : "sin monto"}</span><span>Lo autoriza: {NIVEL[a.nivel]}</span><span>{fechaCorta(a.fecha)}</span>{a.motivo && <span>Motivo: {a.motivo}</span>}</>} />
        ))}
        {((f === "autorizado" && !aplicados.length) || (f !== "autorizado" && !lista.length)) && <Vacio icon="edit">Sin ajustes en esta lista.</Vacio>}
      </div>
      {nuevo && <FormAjuste onClose={() => setNuevo(false)} />}
    </>
  );
}

function FormAjuste({ onClose }) {
  const { d, u, sucursalId: alm } = useSesion();
  const [pid, setPid] = useState("");
  const [sentido, setSentido] = useState("-");
  const [cant, setCant] = useState("1");
  const [motivo, setMotivo] = useState("merma");
  const [nota, setNota] = useState("");
  const [scan, setScan] = useState(false);
  const n = Number(cant), signed = sentido === "-" ? -n : n;
  const valor = pid && Number.isInteger(n) && n > 0 ? Math.abs(valorDiferencia(d, alm, pid, signed)) : 0;
  const nivel = alm === "CEN" ? "admin" : R.nivelAjuste(d, alm, valor);
  const enviar = () => {
    const r = mutar((dd) => solicitarAjuste(dd, { almacenId: alm, productoId: pid, cant: signed, motivo, nota }, dd.usuarios.find((x) => x.id === dd.sesion.userId)));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Solicitud enviada a ${NIVEL[r.autorizacion.nivel]}`); onClose();
  };
  return (
    <>
      <Sheet abierto onClose={onClose} titulo="Solicitar ajuste" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block disabled={!pid || !(n > 0)} onClick={enviar}>Solicitar</Button></div>}>
        <div className="form">
          <Field label="Producto">
            <div className="fila-flex"><Select value={pid} onChange={(e) => setPid(e.target.value)}><option value="">Elegir…</option>{d.productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}</Select><Button variante="ghost" icon="scan" onClick={() => setScan(true)} aria-label="Escanear" /></div>
          </Field>
          {pid && <p className="mu peq">Existencia actual en {R.nombreAlmacen(d, alm)}: <b>{R.stock(d, alm, pid)}</b></p>}
          <Field label="Sentido"><Select value={sentido} onChange={(e) => setSentido(e.target.value)}><option value="-">Salida (−) faltante</option><option value="+">Entrada (+) sobrante</option></Select></Field>
          <Field label="Cantidad"><Input type="number" inputMode="numeric" min="1" value={cant} onChange={(e) => setCant(e.target.value)} /></Field>
          <Field label="Motivo"><Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS_AJUSTE.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Comentario"><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué pasó (opcional)" /></Field>
          {pid && <Card tono="info"><span className="peq">Valor a costo PEPS: <b>{dinero(valor)}</b> · lo autoriza <b>{NIVEL[nivel]}</b></span></Card>}
        </div>
      </Sheet>
      <Escaner abierto={scan} onClose={() => setScan(false)} productos={d.productos} onCodigo={(p) => setPid(p.id)} />
    </>
  );
}
