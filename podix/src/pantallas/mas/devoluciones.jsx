// Devolución de cliente: reembolso, cambio o nota de crédito; reingreso a inventario o merma.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { FORMAS, FORMA_LABEL, aplicarDevolucionAutorizada, crearDevolucion, devueltoDe, montoDevolucion } from "../../store/acciones_cajero.js";
import { Area, Badge, BarraAccion, Button, Card, Chips, Field, Fila, Resumen, Select, Sheet, Titulo, Vacio, Buscador, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta, normaliza } from "../../lib/format.js";
import { Cant, SinTurno } from "../../componentes/cajero/piezas.jsx";

const MOTIVOS = ["Producto defectuoso", "Talla o medida incorrecta", "El paciente ya no lo requiere", "Error de cobro", "Otro"];
const RES = [{ v: "reembolso", l: "Reembolso" }, { v: "cambio", l: "Cambio" }, { v: "nota_credito", l: "Nota de crédito" }];
const TONO = { aplicada: "ok", pendiente_autorizacion: "warn", pendiente: "neutral" };

export default function Devoluciones() {
  const { d, u, sucursalId, params } = useSesion();
  const turno = R.turnoAbierto(d, u.id);
  const [q, setQ] = useState("");
  const [vId, setVId] = useState(null);
  const [cants, setCants] = useState({});
  const [destinos, setDestinos] = useState({});
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [detalle, setDetalle] = useState("");
  const [res, setRes] = useState("reembolso");
  const [forma, setForma] = useState("efectivo");
  const [cargando, setCargando] = useState(false);

  const n = normaliza(q).replace(/\s/g, "");
  const encontradas = n.length < 2 ? [] : d.ventas.filter((v) => normaliza(v.folio).includes(n) || normaliza(v.folio).replace(/^t-0*/, "").includes(n.replace(/^t-0*/, ""))).slice(0, 15);
  const venta = vId ? d.ventas.find((v) => v.id === vId) : null;
  const items = venta ? venta.partidas.map((p, idx) => ({ idx, cant: cants[idx] || 0, destino: destinos[idx] || "reingresa" })).filter((i) => i.cant > 0) : [];
  const monto = venta ? montoDevolucion(venta, items) : 0;
  const requiere = monto > params.limiteAjusteGerente;
  const mias = d.devoluciones.filter((x) => x.sucursalId === sucursalId).slice(0, 15);

  const reset = () => { setVId(null); setCants({}); setDestinos({}); setMotivo(MOTIVOS[0]); setDetalle(""); setRes("reembolso"); setForma("efectivo"); };
  const registrar = () => {
    setCargando(true);
    const r = mutar((dd) => crearDevolucion(dd, { ventaId: venta.id, items, motivo: motivo === "Otro" ? detalle || "Otro" : `${motivo}${detalle ? " — " + detalle : ""}`, resolucion: res, formaReembolso: forma }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.requiereAutorizacion ? "Solicitud enviada: la devolución espera autorización" : `Devolución ${r.devolucion.folio} aplicada`, r.requiereAutorizacion ? "warn" : "ok");
    reset(); setQ("");
  };
  const aplicar = (dev) => { const r = mutar((dd) => aplicarDevolucionAutorizada(dd, { devolucionId: dev.id })); r.ok ? aviso("Devolución aplicada") : aviso(r.error, "bad"); };

  return (
    <>
      {!turno && <SinTurno texto="Los reembolsos se registran en la caja de tu turno. Para cambios y notas de crédito no es indispensable." />}
      <Buscador valor={q} onChange={setQ} placeholder="Folio del ticket (T-0042)" />
      <div className="lista">
        {encontradas.map((v) => (
          <Fila key={v.id} titulo={v.folio} sub={`${v.pacienteId ? R.nombrePaciente(d, v.pacienteId) : "Público general"} · ${R.nombreSucursal(d, v.sucursalId)}`}
            badge={<Badge tono={v.estado === "pagada" ? "ok" : v.estado === "cancelada" ? "bad" : "info"}>{v.estado}</Badge>} datos={<><span>{fechaCorta(v.fecha)}</span><span>{dinero(v.total)}</span></>}
            onClick={() => (["pagada", "con_devolucion", "a_credito"].includes(v.estado) ? setVId(v.id) : aviso("Esta venta no admite devoluciones.", "warn"))} />
        ))}
        {n.length >= 2 && !encontradas.length && <Vacio>No se encontró el ticket.</Vacio>}
      </div>

      <Titulo>Devoluciones recientes</Titulo>
      <div className="lista">
        {mias.map((x) => { const a = d.autorizaciones.find((y) => y.id === x.autorizacionId); const v = d.ventas.find((y) => y.id === x.ventaId); return (
          <Fila key={x.id} titulo={`${x.folio} · ${dinero(x.monto)}`} sub={`${v ? v.folio : ""} · ${x.resolucion.replace("_", " ")} · ${fechaCorta(x.fecha)}`}
            badge={<Badge tono={TONO[x.estado]}>{x.estado === "pendiente_autorizacion" ? (a ? a.estado : "por autorizar") : x.estado}</Badge>}
            derecha={x.estado === "pendiente_autorizacion" && a && a.estado === "autorizado" ? <Button className="btn-peq" onClick={() => aplicar(x)}>Aplicar</Button> : null} />); })}
        {!mias.length && <Vacio icon="undo">Sin devoluciones registradas en esta sucursal.</Vacio>}
      </div>

      <Sheet abierto={!!venta} onClose={reset} titulo={venta ? `Devolver ${venta.folio}` : ""}
        pie={<Button block loading={cargando} disabled={!items.length || (res === "reembolso" && !turno)} onClick={registrar}>{requiere ? "Solicitar autorización" : "Registrar devolución"} · {dinero(monto)}</Button>}>
        {venta && (<>
          <p className="peq mu" style={{ margin: 0 }}>{venta.pacienteId ? R.nombrePaciente(d, venta.pacienteId) : "Público general"} · {R.nombreSucursal(d, venta.sucursalId)} · {fechaCorta(venta.fecha)}</p>
          {venta.partidas.map((p, idx) => { const max = p.cant - devueltoDe(venta, idx); if (p.tipo === "anticipo") return null; return (
            <Card key={idx}>
              <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{p.nombre}</b><span className="mu">{dinero(p.precio)}</span></div>
              <div className="peq mu">Vendido {p.cant}{devueltoDe(venta, idx) ? ` · ya devuelto ${devueltoDe(venta, idx)}` : ""}</div>
              {max > 0 ? (<div className="form" style={{ marginTop: 6 }}>
                <Cant valor={cants[idx] || 0} max={max} onChange={(c) => setCants({ ...cants, [idx]: c })} />
                {p.tipo === "producto" && (cants[idx] || 0) > 0 && <Chips opciones={[{ v: "reingresa", l: "Reingresa a inventario" }, { v: "merma", l: "Merma" }]} valor={destinos[idx] || "reingresa"} onChange={(v) => setDestinos({ ...destinos, [idx]: v })} />}
              </div>) : <Badge tono="neutral">Totalmente devuelto</Badge>}
            </Card>); })}
          <Field label="Motivo"><Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          <Field label={motivo === "Otro" ? "Describe el motivo" : "Comentario (opcional)"}><Area value={detalle} onChange={(e) => setDetalle(e.target.value)} /></Field>
          <Field label="Resolución"><Chips opciones={RES} valor={res} onChange={setRes} /></Field>
          {res === "reembolso" && <Field label="Reembolsar en"><Select value={forma} onChange={(e) => setForma(e.target.value)}>{FORMAS.map((f) => <option key={f} value={f}>{FORMA_LABEL[f]}</option>)}</Select></Field>}
          {res !== "reembolso" && <small className="mu">Se genera una {res === "cambio" ? "nota de crédito para el cambio" : "nota de crédito a favor del paciente"}; no sale dinero de caja.</small>}
          <Resumen filas={[["Monto a devolver", dinero(monto), true]]} />
          {requiere && <Badge tono="warn">Supera {dinero(params.limiteAjusteGerente)}: requiere autorización (supuesto, pendiente PA-V2)</Badge>}
          {res === "reembolso" && !turno && <Badge tono="bad">Abre turno para reembolsar</Badge>}
        </>)}
      </Sheet>
    </>
  );
}
