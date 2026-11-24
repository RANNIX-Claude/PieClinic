// Órdenes de laboratorio de la sucursal: recepción con control de calidad, retrabajo y entrega al paciente con firma.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { ESTADOS_LAB_SUC, entregarOrdenLab, labRetrasada, recibirDeLaboratorio } from "../../store/acciones_almacen.js";
import { fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Input, Resumen, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import Firma from "../../componentes/almacen/Firma.jsx";

const ETIQ = { enviada: "En laboratorio", retrasada: "Retrasada", en_prueba: "En prueba", recibida: "Lista para entregar" };
const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);

export default function EntregaLab() {
  const { d, sucursalId: alm } = useSesion();
  const [f, setF] = useState("lab");
  const [sel, setSel] = useState(null);
  const todas = d.ordenesLab.filter((o) => o.sucursalId === alm && ESTADOS_LAB_SUC.includes(o.estado));
  const enLab = todas.filter((o) => ["enviada", "retrasada"].includes(o.estado));
  const listas = todas.filter((o) => ["recibida", "en_prueba"].includes(o.estado));
  const lista = (f === "lab" ? enLab : listas).sort((a, b) => a.prometida.localeCompare(b.prometida));
  const orden = sel ? d.ordenesLab.find((o) => o.id === sel) : null;

  if (alm === "CEN") return <Vacio icon="flask">Las órdenes de laboratorio son de cada sucursal. Cambia a tu sucursal (Más ▸ Cambiar sucursal activa).</Vacio>;
  return (
    <>
      <Chips valor={f} onChange={setF} opciones={[{ v: "lab", l: "En laboratorio", n: enLab.length }, { v: "listas", l: "Por entregar", n: listas.length }]} />
      <div className="lista">
        {lista.map((o) => (
          <Fila key={o.id} titulo={`${o.folio} · ${R.nombrePaciente(d, o.pacienteId)}`} sub={`${o.tipo} · pie ${o.pie.toLowerCase()} · talla ${o.talla}`}
            badge={<Badge tono={labRetrasada(o) ? "bad" : o.estado === "recibida" ? "ok" : "info"}>{labRetrasada(o) ? "Retrasada" : ETIQ[o.estado]}</Badge>}
            datos={<><span>Prometida {fechaCorta(o.prometida)}</span><span>{R.nombreUsuario(d, o.podologoId)}</span>{o.retrabajos && <span>Retrabajos {o.retrabajos.length}</span>}</>} onClick={() => setSel(o.id)} />
        ))}
        {!lista.length && <Vacio icon="flask">{f === "lab" ? "No hay órdenes pendientes del laboratorio." : "No hay plantillas listas para entregar."}</Vacio>}
      </div>
      {orden && (["enviada", "retrasada"].includes(orden.estado) ? <FormRecepcion o={orden} onClose={() => setSel(null)} /> : <FormEntrega o={orden} onClose={() => setSel(null)} />)}
    </>
  );
}

function Resumen_({ o }) {
  const { d } = useSesion();
  return <Card><Resumen filas={[["Paciente", R.nombrePaciente(d, o.pacienteId)], ["Prescripción", o.tipo], ["Pie / talla", `${o.pie} · ${o.talla}`], ["Toma", o.toma], ["Correcciones", o.correcciones], ["Laboratorio", (d.laboratorios.find((l) => l.id === o.laboratorioId) || {}).nombre], ["Prometida", fechaCorta(o.prometida)]]} /></Card>;
}

// Recepción del laboratorio con control de calidad
function FormRecepcion({ o, onClose }) {
  const { sucursalId } = useSesion();
  const [ok, setOk] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [prom, setProm] = useState(sumarDias(hoy(), 7));
  const guardar = () => {
    const r = mutar((dd) => recibirDeLaboratorio(dd, o.id, { ok, motivo, prometida: prom }, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(ok ? "Recibida: lista para entregar ✔" : "Devuelta al laboratorio para retrabajo", ok ? "ok" : "warn"); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo={`Recibir ${o.folio}`} pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block variante={ok ? "ok" : "danger"} onClick={guardar}>{ok ? "Registrar recepción" : "Enviar a retrabajo"}</Button></div>}>
      <Resumen_ o={o} />
      <Field label="Control de calidad"><Chips valor={ok ? "ok" : "no"} onChange={(v) => setOk(v === "ok")} opciones={[{ v: "ok", l: "Cumple" }, { v: "no", l: "No cumple" }]} /></Field>
      {!ok && (<div className="form">
        <Field label="Motivo del retrabajo (obligatorio)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Talla, acabado, soporte de arco…" /></Field>
        <Field label="Nueva fecha prometida" hint="La orden vuelve al estado enviada."><Input type="date" value={prom} min={sumarDias(hoy(), 1)} onChange={(e) => setProm(e.target.value)} /></Field>
      </div>)}
      {(o.retrabajos || []).map((r, i) => <Fila key={i} titulo={`Retrabajo ${fechaCorta(r.fecha)}`} sub={r.motivo} />)}
    </Sheet>
  );
}

// Entrega al paciente con firma de recibido (o reporte de defecto → retrabajo)
function FormEntrega({ o, onClose }) {
  const [firma, setFirma] = useState(null);
  const [defecto, setDefecto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [prom, setProm] = useState(sumarDias(hoy(), 7));
  const entregar = () => {
    const r = mutar((dd) => entregarOrdenLab(dd, o.id, { firma }, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Entregada al paciente ✔"); onClose();
  };
  const retrabajo = () => {
    const r = mutar((dd) => recibirDeLaboratorio(dd, o.id, { ok: false, motivo, prometida: prom }, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Devuelta al laboratorio", "warn"); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo={defecto ? `Defecto en ${o.folio}` : `Entregar ${o.folio}`}
      pie={defecto
        ? <div className="dos"><Button variante="sec" block onClick={() => setDefecto(false)}>Atrás</Button><Button block variante="danger" onClick={retrabajo}>Enviar a retrabajo</Button></div>
        : <div className="form"><Button block variante="ok" icon="check" disabled={!firma} onClick={entregar}>Entregar al paciente</Button><Button block variante="ghost" onClick={() => setDefecto(true)}>Reportar defecto (retrabajo)</Button></div>}>
      <Resumen_ o={o} />
      {!defecto ? (<>
        <Field label="Firma de recibido del paciente"><Firma onChange={setFirma} /></Field>
        <p className="mu peq">La entrega registra la fecha de hoy ({fechaCorta(hoy())}) y la firma en la orden.</p>
      </>) : (
        <div className="form">
          <Field label="Motivo (obligatorio)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué falla se detectó" /></Field>
          <Field label="Nueva fecha prometida"><Input type="date" value={prom} min={sumarDias(hoy(), 1)} onChange={(e) => setProm(e.target.value)} /></Field>
        </div>)}
    </Sheet>
  );
}
