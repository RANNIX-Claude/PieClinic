// Piezas de la lista de espera (porte de Pie Firme: pages/comercial/ListaEspera.jsx · P-041).
import { useMemo, useState } from "react";
import { Badge, Button, Chips, Field, Fila, Input, Select, Sheet, Area, Resumen, Titulo, Vacio } from "../../ui/index.jsx";
import SelectorPaciente from "../SelectorPaciente.jsx";
import { hora, hoy, sumarDias, fechaLarga, diasEntre, dia } from "../../lib/format.js";
import * as G from "../../store/acciones_agenda.js";
import { correr, nomPac, nomUsr, nomSv, pacDe, Est, Contacto, Regla, fechaCortaAg } from "./comun.jsx";

/** Ofrecer un hueco a una entrada: mensaje listo, envío MANUAL (wa.me / tel:) y registro del aviso (abre la ventana de 30 min). */
export function OfrecerHueco({ d, e, hueco, ahora, onClose, puede }) {
  if (!e || !hueco) return null;
  const P = G.paramsAgenda(d);
  const pac = pacDe(d, e.pacienteId);
  const texto = G.textoEspera(d, e, hueco);
  const notificar = () => { const r = correr((dd) => G.notificarEspera(dd, e.id, hueco, { ahora }), (r) => `Aviso registrado: tiene hasta las ${hora(r.hasta)} para confirmar.`); if (r.ok) onClose(); };
  const agendar = () => { const r = correr((dd) => G.agendarDesdeEspera(dd, e.id, hueco, { ahora }), "Cita agendada desde la lista de espera."); if (r.ok) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Ofrecer horario liberado">
      <Resumen filas={[["Paciente", nomPac(d, e.pacienteId)], ["Servicio", nomSv(d, e.servicioId)], ["Horario", `${fechaLarga(dia(hueco.inicio))} · ${hora(hueco.inicio)}`], ["Podólogo", nomUsr(d, hueco.podologoId)], ["Teléfono", pac?.telefono || "—"]]} />
      <div className="ag-msg">{texto}</div>
      <Contacto telefono={pac?.telefono} texto={texto} whatsapp={!!pac?.whatsapp} />
      <Regla id="P-041">El envío lo haces tú desde WhatsApp o por teléfono. Al registrar el aviso el paciente tiene {P.esperaVentanaMin} min para confirmar; si no, el hueco pasa al siguiente.</Regla>
      {puede ? <div className="dos"><Button variante="sec" onClick={agendar}>Agendar ya (está al teléfono)</Button><Button onClick={notificar}>Registrar aviso</Button></div> : <p className="peq mu">Solo consulta.</p>}
    </Sheet>
  );
}

/** Horarios libres para una entrada en una fecha: respeta podólogo preferido y franja. */
export function BuscarHueco({ d, e, ahora, onElegir }) {
  const [fecha, setFecha] = useState(sumarDias(hoy(), 1));
  const sv = d.servicios.find((s) => s.id === e.servicioId);
  const slots = useMemo(() => G.huecosDisponibles(d, { sucursalId: e.sucursalId, podologoId: e.podologoId || null, fecha, duracion: sv ? sv.duracion : 30, pacienteId: e.pacienteId, ahora }).filter((h) => G.coincideFranja(e.preferencia, h.hora)), [d, e, fecha, ahora, sv]);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(hoy(), i));
  return (
    <div className="ag-sec">
      <Titulo>Buscar horario libre</Titulo>
      <Chips scroll opciones={dias.map((f) => ({ v: f, l: fechaCortaAg(f) }))} valor={fecha} onChange={setFecha} />
      <Input type="date" value={fecha} min={hoy()} onChange={(x) => setFecha(x.target.value)} aria-label="Fecha" />
      {slots.length ? <div className="ag-slots">{slots.slice(0, 40).map((h) => <button key={h.podologoId + h.inicio} className="ag-slot" onClick={() => onElegir(h)} title={nomUsr(d, h.podologoId)}>{h.hora}{e.podologoId ? "" : ` · ${nomUsr(d, h.podologoId).replace(/^Dra?\.\s*/, "").split(" ")[0]}`}</button>)}</div>
        : <p className="peq mu">Sin horarios libres ese día con la franja y el podólogo pedidos (horarios, bloqueos, festivos y margen de 10 min).</p>}
    </div>
  );
}

export function DetalleEspera({ d, e, ahora, puede, onClose, onOfrecer }) {
  const [motivo, setMotivo] = useState("");
  if (!e) return null;
  const P = G.paramsAgenda(d);
  const est = G.estadoEspera(e, ahora, P);
  const pac = pacDe(d, e.pacienteId);
  const vence = G.venceEspera(e, P.esperaVenceDias);
  const quitar = () => { const r = correr((dd) => G.quitarEspera(dd, e.id, motivo), "Solicitud retirada de la lista."); if (r.ok) onClose(); };
  const reactivar = () => correr((dd) => G.reactivarEspera(dd, e.id), (r) => `Reactivada: vence el ${r.vence}.`);
  return (
    <Sheet abierto onClose={onClose} titulo={nomPac(d, e.pacienteId)}>
      <Resumen filas={[["Estado", <Est mapa={G.ESTADOS_ESPERA} k={est} />], ["Servicio", nomSv(d, e.servicioId)], ["Podólogo preferido", e.podologoId ? nomUsr(d, e.podologoId) : "Cualquiera"], ["Franja", G.FRANJAS[e.preferencia] || e.preferencia], ["Origen", G.ORIGENES_ESPERA[e.origen] || e.origen], ["En lista desde", `${e.creado} (${diasEntre(e.creado, dia(ahora))} días)`], ["Vence", vence], ["Avisos", String(e.intentos || 0)], ["Notas", e.notas || "—"]]} />
      <Contacto telefono={pac?.telefono} whatsapp={!!pac?.whatsapp} />
      {puede && est !== "vencida" && e.estado !== "cerrado" && (
        <>
          <Field label="Prioridad"><Chips opciones={Object.entries(G.PRIORIDADES).map(([v, [l]]) => ({ v, l }))} valor={e.prioridad || "media"} onChange={(p) => correr((dd) => G.cambiarPrioridad(dd, e.id, p), "Prioridad actualizada.")} /></Field>
          {est === "esperando" && <BuscarHueco d={d} e={e} ahora={ahora} onElegir={(h) => onOfrecer(e, h)} />}
        </>
      )}
      {puede && est === "vencida" && <Button block variante="sec" icon="refresh" onClick={reactivar}>Reactivar otros {P.esperaVenceDias} días</Button>}
      {puede && (
        <div className="ag-form">
          <Field label="Motivo para quitar de la lista"><Input value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Ya se atendió en otro lado, ya no le interesa…" /></Field>
          <Button variante="danger" onClick={quitar}>Quitar de la lista</Button>
        </div>
      )}
    </Sheet>
  );
}

export function AltaEspera({ d, sucursalId, onClose }) {
  const [x, setX] = useState({ pacienteId: null, servicioId: d.servicios[0]?.id || "", podologoId: "", preferencia: "cualquiera", prioridad: "media", origen: "llamada", notas: "" });
  const [buscar, setBuscar] = useState(false);
  const pods = G.podologosDe(d, sucursalId);
  const guardar = () => { const r = correr((dd) => G.altaEspera(dd, { ...x, sucursalId, podologoId: x.podologoId || null }), (r) => `Agregado a la lista de espera (vence el ${r.vence}).`); if (r.ok) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Agregar a lista de espera" pie={<Button block onClick={guardar} disabled={!x.pacienteId}>Agregar</Button>}>
      <div className="ag-form dos-col">
        <div className="ancho">
          <Field label="Paciente registrado">{x.pacienteId ? <Fila titulo={nomPac(d, x.pacienteId)} sub={pacDe(d, x.pacienteId)?.telefono} onClick={() => setBuscar(true)} /> : <Button variante="sec" icon="search" block onClick={() => setBuscar(true)}>Buscar paciente</Button>}</Field>
        </div>
        <Field label="Servicio deseado"><Select value={x.servicioId} onChange={(e) => setX({ ...x, servicioId: e.target.value })}>{d.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.duracion} min</option>)}</Select></Field>
        <Field label="Podólogo preferido"><Select value={x.podologoId} onChange={(e) => setX({ ...x, podologoId: e.target.value })}><option value="">Cualquiera</option>{pods.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
        <Field label="Disponibilidad"><Select value={x.preferencia} onChange={(e) => setX({ ...x, preferencia: e.target.value })}>{Object.entries(G.FRANJAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Prioridad"><Select value={x.prioridad} onChange={(e) => setX({ ...x, prioridad: e.target.value })}>{Object.entries(G.PRIORIDADES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Origen"><Select value={x.origen} onChange={(e) => setX({ ...x, origen: e.target.value })}>{Object.entries(G.ORIGENES_ESPERA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <div className="ancho"><Field label="Notas"><Area value={x.notas} onChange={(e) => setX({ ...x, notas: e.target.value })} placeholder="Prefiere tardes, dolor agudo…" /></Field></div>
      </div>
      <SelectorPaciente abierto={buscar} onClose={() => setBuscar(false)} onElegir={(p) => { setX({ ...x, pacienteId: p.id }); setBuscar(false); }} />
    </Sheet>
  );
}

/** Tarjeta de un hueco liberado con sus candidatos en orden de prioridad. */
export function TarjetaHueco({ d, h, onOfrecer, puede }) {
  return (
    <div className="ag-hueco">
      <div className="fila-t"><span>{fechaCortaAg(dia(h.inicio))} · {hora(h.inicio)}</span><Badge tono="ok">{h.duracion} min</Badge></div>
      <div className="peq mu">{nomUsr(d, h.podologoId)} · {h.origen}</div>
      {h.candidatos.length ? h.candidatos.slice(0, 4).map((e, i) => (
        <div key={e.id} className="ag-cand"><span><b>{i + 1}.</b> {nomPac(d, e.pacienteId)} <span className="mu peq">· {nomSv(d, e.servicioId)}</span></span>{e.prioridad === "alta" && <Badge tono="bad">Alta</Badge>}{puede && <Button variante="ghost" className="ag-mini" onClick={() => onOfrecer(e, h)}>Ofrecer</Button>}</div>
      )) : <p className="peq mu">Nadie en la lista coincide con este hueco.</p>}
    </div>
  );
}

export const Vacia = () => <Vacio icon="users">Sin solicitudes en espera.</Vacio>;
