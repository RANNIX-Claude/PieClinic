// Caja y cartera (solo excepciones): cortes con diferencia por aprobar, turnos abiertos y cartera vencida con bloqueo manual de crédito.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { bloquearCredito, carteraPorPaciente, cortesPendientes, difCorte, resolverCorte, turnosAbiertos } from "../../store/acciones_gerente.js";
import { dinero, fechaCorta, hora } from "../../lib/format.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Resumen, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);

export default function CajaCartera() {
  const { d, sucursalId } = useSesion();
  const [vista, setVista] = useState("cortes");
  const [corte, setCorte] = useState(null);
  const [pac, setPac] = useState(null);
  const cortes = cortesPendientes(d, sucursalId);
  const abiertos = turnosAbiertos(d, sucursalId);
  const cartera = carteraPorPaciente(d, sucursalId);
  const total = cartera.reduce((a, c) => a + c.vencido, 0);

  return (
    <>
      <Chips valor={vista} onChange={setVista} opciones={[{ v: "cortes", l: "Cortes", n: cortes.length }, { v: "cartera", l: "Cartera vencida", n: cartera.length }]} />
      {vista === "cortes" && (<>
        <Titulo>Por aprobar</Titulo>
        <div className="lista">
          {cortes.map((t) => (
            <Fila key={t.id} titulo={`Turno ${t.turno} · ${R.nombreUsuario(d, t.cajeroId)}`} sub={t.corte.justificacion || "Sin justificación"} badge={<Badge tono={difCorte(t) < 0 ? "bad" : "warn"}>{difCorte(t) < 0 ? "Faltante" : "Sobrante"} {dinero(Math.abs(difCorte(t)))}</Badge>}
              datos={<span>{fechaCorta(t.corte.fecha)}</span>} onClick={() => setCorte(t.id)} />
          ))}
          {!cortes.length && <Vacio icon="check">No hay cortes con diferencia por aprobar.</Vacio>}
        </div>
        <Titulo>Turnos abiertos ahora</Titulo>
        <div className="lista">
          {abiertos.map((t) => (
            <Fila key={t.id} titulo={`${t.turno} · ${R.nombreUsuario(d, t.cajeroId)}`} sub={`Abierto ${fechaCorta(t.abiertoEn)} ${hora(t.abiertoEn)}`} badge={<Badge tono="info">Abierto</Badge>}
              datos={<><span>Fondo {dinero(t.fondo)}</span><span>Ventas {dinero(R.ventasDeTurno(d, t.id).reduce((a, v) => a + v.total, 0))}</span></>} />
          ))}
          {!abiertos.length && <Vacio icon="cash">No hay turnos abiertos.</Vacio>}
        </div>
      </>)}
      {vista === "cartera" && (<>
        <Card tono={total ? "bad" : "ok"}><Resumen filas={[["Pacientes con mora", cartera.length], ["Cartera vencida", dinero(total), true]]} /></Card>
        <div className="lista">
          {cartera.map((c) => (
            <Fila key={c.pacienteId} titulo={R.nombrePaciente(d, c.pacienteId)} badge={c.credito?.bloqueado ? <Badge tono="bad">Crédito bloqueado</Badge> : <Badge tono="warn">{c.diasMora} d de mora</Badge>}
              datos={<><span>Vencido {dinero(c.vencido)}</span><span>Mora {dinero(c.mora)}</span><span>Saldo {dinero(c.saldo)}</span></>} onClick={() => setPac(c.pacienteId)} />
          ))}
          {!cartera.length && <Vacio icon="check">Sin cartera vencida en esta sucursal.</Vacio>}
        </div>
      </>)}
      {corte && <DetalleCorte t={d.turnos.find((x) => x.id === corte)} onClose={() => setCorte(null)} />}
      {pac && <DetallePaciente id={pac} onClose={() => setPac(null)} />}
    </>
  );
}

function DetalleCorte({ t, onClose }) {
  const { d } = useSesion();
  const [motivo, setMotivo] = useState("");
  const act = (dec) => {
    const r = mutar((dd) => resolverCorte(dd, t.id, dec, motivo, yo(dd)));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(dec === "aprobar" ? "Corte aprobado ✔" : "Corte rechazado"); onClose();
  };
  const pend = t.corte.estado === "diferencia_pendiente";
  return (
    <Sheet abierto onClose={onClose} titulo={`Corte · ${t.turno}`}
      pie={pend ? <div className="dos"><Button variante="danger" block onClick={() => act("rechazar")}>Rechazar</Button><Button variante="ok" block onClick={() => act("aprobar")}>Aprobar</Button></div> : null}>
      <Card><Resumen filas={[["Cajero", R.nombreUsuario(d, t.cajeroId)], ["Fecha", fechaCorta(t.corte.fecha)], t.corte.entregaId && ["Entrega", R.nombreUsuario(d, t.corte.entregaId)], t.corte.recibeId && ["Recibe", R.nombreUsuario(d, t.corte.recibeId)], ["Estado", t.corte.estado.replace("_", " ")]]} /></Card>
      <div className="lista">
        {t.corte.filas.map((f) => (
          <Fila key={f.forma} titulo={f.forma[0].toUpperCase() + f.forma.slice(1)} badge={<Badge tono={f.diferencia ? (f.diferencia < 0 ? "bad" : "warn") : "ok"}>{f.diferencia ? dinero(f.diferencia) : "Cuadra"}</Badge>} datos={<><span>Esperado {dinero(f.esperado)}</span><span>Contado {dinero(f.contado)}</span></>} />
        ))}
      </div>
      {t.corte.justificacion && <Card><b>Justificación del cajero</b><p className="txt">{t.corte.justificacion}</p></Card>}
      {t.corte.firma && <Card><span className="peq mu">Firmado por el cajero</span>{String(t.corte.firma).startsWith("data:") && <img src={t.corte.firma} alt="Firma" style={{ width: "100%", maxHeight: 90, objectFit: "contain", background: "#fff", borderRadius: 8 }} />}</Card>}
      {pend && <Field label="Motivo (obligatorio al rechazar)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Qué se necesita aclarar" /></Field>}
      {t.corte.motivoResolucion && <p className="mu">Resolución: {t.corte.motivoResolucion}</p>}
    </Sheet>
  );
}

function DetallePaciente({ id, onClose }) {
  const { d, sucursalId } = useSesion();
  const [motivo, setMotivo] = useState("");
  const c = carteraPorPaciente(d, sucursalId).find((x) => x.pacienteId === id);
  const p = d.pacientes.find((x) => x.id === id);
  const cred = R.credito(d, id);
  const tel = (p?.telefono || "").replace(/\D/g, "");
  const bloq = (b) => {
    const r = mutar((dd) => bloquearCredito(dd, id, b, motivo, yo(dd), sucursalId));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(b ? "Crédito bloqueado" : "Crédito desbloqueado", b ? "warn" : "ok"); setMotivo("");
  };
  if (!c) return <Sheet abierto onClose={onClose} titulo="Cartera"><Vacio icon="check">Este paciente ya no tiene mora.</Vacio></Sheet>;
  const msg = encodeURIComponent(`Hola ${p.nombres}, le recordamos que tiene un saldo vencido de ${dinero(c.vencido)}. Le esperamos en la clínica para regularizarlo.`);
  return (
    <Sheet abierto onClose={onClose} titulo={R.nombrePaciente(d, id)}
      pie={<div className="form">
        <div className="dos"><a className="btn btn-sec btn-block" href={`tel:+52${tel}`} style={{ textDecoration: "none" }}>Llamar</a><a className="btn btn-ok btn-block" href={`https://wa.me/52${tel}?text=${msg}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>WhatsApp</a></div>
        {cred?.bloqueado ? <Button variante="ghost" block icon="lock" onClick={() => bloq(false)}>Desbloquear crédito</Button> : <Button variante="danger" block icon="lock" onClick={() => bloq(true)}>Bloquear crédito</Button>}
      </div>}>
      <Card tono="bad"><Resumen filas={[["Teléfono", p.telefono], ["Vencido", dinero(c.vencido)], ["Mora acumulada", dinero(c.mora)], ["Saldo total", dinero(c.saldo)], ["Días de mora (máx.)", c.diasMora], cred && ["Límite de crédito", dinero(cred.limite)]]} /></Card>
      {cred?.bloqueado && <Card tono="warn"><b>Crédito bloqueado</b><p className="txt">{cred.bloqueadoMotivo} · {cred.bloqueadoEn && fechaCorta(cred.bloqueadoEn)} · {R.nombreUsuario(d, cred.bloqueadoPor)}</p></Card>}
      <Titulo>Planes</Titulo>
      <div className="lista">
        {c.planes.map(({ plan, saldo, diasMora, vencidas }) => (
          <Fila key={plan.id} titulo={`${plan.folio} · ${plan.tipo === "plazos" ? "Venta a plazos" : "Crédito abierto"}`} badge={<Badge tono="bad">{diasMora} d</Badge>}
            datos={<><span>{vencidas} parcialidad(es) vencida(s)</span><span>Vencido {dinero(saldo.vencido)}</span><span>Mora {dinero(saldo.mora)}</span></>} />
        ))}
      </div>
      {!cred?.bloqueado && <Field label="Motivo del bloqueo" hint="Manual: no hay bloqueo automático ni tope de mora."><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Obligatorio para bloquear" /></Field>}
    </Sheet>
  );
}
