// Piezas compartidas de las pantallas de recepción: estados de cita, tarjeta, acciones (confirmar/reprogramar/cancelar/contacto).
import { useMemo, useState } from "react";
import { mutar, auditar } from "../../store/core.js";
import { useSesion } from "../../shell/sesion.js";
import { empalmes, horariosLibres, waLink, telLink } from "../../store/logica_recepcion.js";
import { Badge, Button, Field, Input, Area, Sheet, Resumen, Fila, Icon, aviso, Vacio } from "../../ui/index.jsx";
import { hora, ahoraLocal, hoy, fechaCorta } from "../../lib/format.js";

export const ESTADOS = {
  agendada: ["Agendada", "neutral"], por_confirmar: ["Por confirmar", "warn"], confirmada: ["Confirmada", "info"], en_sala: ["En sala", "info"],
  en_atencion: ["En atención", "ok"], atendida: ["Atendida", "ok"], cancelada: ["Cancelada", "bad"], no_asistio: ["No asistió", "bad"],
};
export const EstadoBadge = ({ estado }) => { const [l, t] = ESTADOS[estado] || [estado, "neutral"]; return <Badge tono={t}>{l}</Badge>; };

export const ROLES_CITAS = ["recepcion", "gerente", "admin", "direccion"];
export const permite = (u, roles = ROLES_CITAS) => !!u && roles.includes(u.rol);

export function pacienteDe(d, id) { return d.pacientes.find((p) => p.id === id); }
export function datosCita(d, c) {
  const sv = d.servicios.find((s) => s.id === c.servicioId);
  return { pac: pacienteDe(d, c.pacienteId), sv, pod: d.usuarios.find((u) => u.id === c.podologoId) };
}
export const corto = (n) => String(n || "—").replace(/\s*\(.*\)/, "");

export function CitaFila({ d, c, onClick, derecha, extra }) {
  const { pac, sv, pod } = datosCita(d, c);
  return (
    <Fila onClick={onClick} derecha={derecha}
      izquierda={<div className="fuerte" style={{ minWidth: 46, textAlign: "center" }}>{hora(c.inicio)}</div>}
      titulo={pac ? `${pac.nombres} ${pac.apellidos}` : "—"} badge={<EstadoBadge estado={c.estado} />}
      sub={`${sv ? sv.nombre : "Servicio"} · ${c.duracion} min`}
      datos={<span>{corto(pod && pod.nombre)} · {c.consultorioId}{extra ? <> · {extra}</> : null}</span>} />
  );
}

export function BotonesContacto({ tel, nombre }) {
  return (
    <div className="dos">
      <a className="btn btn-sec btn-block" href={telLink(tel)} aria-label={`Llamar a ${nombre}`}><Icon name="phone" size={18} />Llamar</a>
      <a className="btn btn-sec btn-block" href={waLink(tel)} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${nombre}`}><Icon name="message" size={18} />WhatsApp</a>
    </div>
  );
}

// ───── Acciones (siempre validan rol dentro de mutar)
export function confirmarCita(u, id) {
  return mutar((d) => {
    if (!permite(u)) return false;
    const c = d.citas.find((x) => x.id === id);
    if (!c || !["agendada", "por_confirmar"].includes(c.estado)) return false;
    c.estado = "confirmada"; c.confirmadaEn = ahoraLocal();
    auditar(d, "confirmar_cita", "cita", id, "Cita confirmada");
    return true;
  });
}
export function cancelarCita(u, id, motivo) {
  return mutar((d) => {
    if (!permite(u) || !String(motivo).trim()) return false;
    const c = d.citas.find((x) => x.id === id);
    if (!c || !["agendada", "por_confirmar", "confirmada"].includes(c.estado)) return false;
    c.estado = "cancelada"; c.motivoCancelacion = motivo.trim();
    auditar(d, "cancelar_cita", "cita", id, motivo.trim());
    return true;
  });
}
/** Reprograma validando empalmes del paciente, el podólogo y el consultorio. Devuelve {ok, error}. */
export function reprogramarCita(u, id, fecha, hhmm, consultorioId) {
  return mutar((d) => {
    if (!permite(u)) return { ok: false, error: "Sin permiso" };
    const c = d.citas.find((x) => x.id === id);
    if (!c || !["agendada", "por_confirmar", "confirmada", "no_asistio"].includes(c.estado)) return { ok: false, error: "La cita ya no se puede mover" };
    const inicio = `${fecha}T${hhmm}`;
    const ch = empalmes(d.citas, { inicio, duracion: c.duracion, pacienteId: c.pacienteId, podologoId: c.podologoId, consultorioId, sucursalId: c.sucursalId, ignorarIds: [id] });
    if (ch.length) return { ok: false, error: `Se empalma (${[...new Set(ch.flatMap((x) => x.motivos))].join(", ")})` };
    (c.historialReprog ||= []).push({ de: c.inicio, consultorioId: c.consultorioId, por: u.id, en: ahoraLocal() });
    const antes = c.inicio;
    c.inicio = inicio; c.consultorioId = consultorioId; c.estado = "agendada";
    auditar(d, "reprogramar_cita", "cita", id, `${antes} → ${inicio}`);
    return { ok: true };
  });
}

/** Hoja con el detalle de una cita y sus acciones. */
export function AccionesCita({ cita, onClose }) {
  if (!cita) return null;
  return <AccionesInterno key={cita.id} cita={cita} onClose={onClose} />;
}
function AccionesInterno({ cita, onClose }) {
  const { d, u } = useSesion();
  const [modo, setModo] = useState("menu"); // menu | reprog | cancel
  const [fecha, setFecha] = useState(hoy());
  const [sel, setSel] = useState(null);
  const [motivo, setMotivo] = useState("");
  const c = d.citas.find((x) => x.id === cita.id);
  const libres = useMemo(() => c && modo === "reprog" ? horariosLibres(d, { fecha, sucursalId: c.sucursalId, duracion: c.duracion, pacienteId: c.pacienteId, podologoId: c.podologoId, ignorarIds: [c.id], ahora: fecha === hoy() ? ahoraLocal() : null }) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.citas, modo, fecha]);
  if (!c) return null;
  const { pac, sv, pod } = datosCita(d, c);
  const modificable = ["agendada", "por_confirmar", "confirmada"].includes(c.estado) && permite(u);
  const titulo = modo === "reprog" ? "Reprogramar cita" : modo === "cancel" ? "Cancelar cita" : "Cita";
  let pie = null;
  if (modo === "reprog") pie = <Button block disabled={!sel} onClick={() => {
    const r = reprogramarCita(u, c.id, fecha, sel.hora, sel.consultorioId);
    if (r.ok) { aviso("Cita reprogramada"); onClose(); } else aviso(r.error, "bad");
  }}>Guardar nuevo horario</Button>;
  if (modo === "cancel") pie = <Button block variante="danger" disabled={!motivo.trim()} onClick={() => { if (cancelarCita(u, c.id, motivo)) { aviso("Cita cancelada", "warn"); onClose(); } else aviso("No se pudo cancelar", "bad"); }}>Cancelar la cita</Button>;
  return (
    <Sheet abierto onClose={onClose} titulo={titulo} pie={pie}>
      <div className="form">
        <Resumen filas={[["Paciente", pac ? `${pac.nombres} ${pac.apellidos}` : "—"], ["Servicio", sv ? sv.nombre : "—"], ["Podólogo", corto(pod && pod.nombre)],
          ["Cuándo", `${fechaCorta(c.inicio)} ${hora(c.inicio)} · ${c.consultorioId}`], ["Teléfono", pac ? pac.telefono : "—"]]} />
        <div><EstadoBadge estado={c.estado} />{c.motivoCancelacion && <span className="mu peq"> · {c.motivoCancelacion}</span>}</div>
        {modo === "menu" && pac && <>
          <BotonesContacto tel={pac.telefono} nombre={pac.nombres} />
          {modificable && <>
            {["agendada", "por_confirmar"].includes(c.estado) && <Button block icon="check" onClick={() => { if (confirmarCita(u, c.id)) { aviso("Cita confirmada"); onClose(); } }}>Confirmar cita</Button>}
            <div className="dos">
              <Button variante="sec" block icon="refresh" onClick={() => setModo("reprog")}>Reprogramar</Button>
              <Button variante="danger" block icon="x" onClick={() => setModo("cancel")}>Cancelar</Button>
            </div></>}
        </>}
        {modo === "reprog" && <>
          <Field label="Nueva fecha"><Input type="date" value={fecha} min={hoy()} onChange={(e) => { setFecha(e.target.value); setSel(null); }} /></Field>
          <div className="mu peq">Horarios libres (paciente, podólogo y consultorio sin empalme)</div>
          {libres.length ? <div className="chips">{libres.map((l) => <button key={l.hora} className={`chip${sel && sel.hora === l.hora ? " on" : ""}`} onClick={() => setSel(l)}>{l.hora}</button>)}</div> : <Vacio icon="clock">Sin horarios libres ese día.</Vacio>}
          <Button variante="ghost" block onClick={() => setModo("menu")}>Volver</Button>
        </>}
        {modo === "cancel" && <>
          <Field label="Motivo de la cancelación"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. El paciente avisó que no puede asistir" /></Field>
          <Button variante="ghost" block onClick={() => setModo("menu")}>Volver</Button>
        </>}
      </div>
    </Sheet>
  );
}
