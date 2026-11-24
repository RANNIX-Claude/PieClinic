// Recepción · Agenda del día de la sucursal activa, con alta de cita por pasos (único botón flotante).
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import { horariosLibres, fechasSerie, empalmes } from "../../store/logica_recepcion.js";
import { Button, Chips, Fab, Field, Input, Select, Fila, Pasos, Resumen, Sheet, Titulo, Vacio, Badge, aviso } from "../../ui/index.jsx";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import { CitaFila, AccionesCita, permite, corto } from "../../componentes/recepcion/comun.jsx";
import { hoy, ahoraLocal, sumarDias, fechaCorta, dinero } from "../../lib/format.js";
import * as R from "../../store/reglas.js";

const PASOS = ["Paciente", "Servicio", "Podólogo", "Fecha y hora", "Recurrencia", "Confirmar"];

export default function Agenda() {
  const { d, u, sucursalId } = useSesion();
  const [fecha, setFecha] = useState(hoy());
  const [pod, setPod] = useState("todos");
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(false);

  const podologos = useMemo(() => d.usuarios.filter((x) => x.rol === "podologo" && x.sucursales.includes(sucursalId)), [d.usuarios, sucursalId]);
  const citas = useMemo(() => d.citas.filter((c) => c.sucursalId === sucursalId && c.inicio.slice(0, 10) === fecha && (pod === "todos" || c.podologoId === pod)).sort((a, b) => a.inicio.localeCompare(b.inicio)), [d.citas, sucursalId, fecha, pod]);
  const activas = citas.filter((c) => !["cancelada", "no_asistio"].includes(c.estado)).length;

  return (
    <div className="form">
      <div className="dos" style={{ alignItems: "center", gridTemplateColumns: "44px 1fr 44px" }}>
        <Button variante="ghost" aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}>‹</Button>
        <button className="btn btn-sec" style={{ justifyContent: "center" }} onClick={() => setFecha(hoy())}>{fecha === hoy() ? "Hoy · " : ""}{fechaCorta(fecha)}</button>
        <Button variante="ghost" aria-label="Día siguiente" onClick={() => setFecha(sumarDias(fecha, 1))}>›</Button>
      </div>
      <Field label="Ir a fecha"><Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></Field>
      <div className="chips">
        <button className={`chip${pod === "todos" ? " on" : ""}`} onClick={() => setPod("todos")}>Todos</button>
        {podologos.map((p) => <button key={p.id} className={`chip${pod === p.id ? " on" : ""}`} onClick={() => setPod(p.id)}>{corto(p.nombre).replace(/^(Dr\.|Dra\.)\s*/, "")}</button>)}
      </div>
      <Titulo derecha={<Badge tono="info">{activas} citas</Badge>}>Citas del día</Titulo>
      <div className="lista">
        {citas.map((c) => <CitaFila key={c.id} d={d} c={c} onClick={() => setAbierta(c)} />)}
        {!citas.length && <Vacio icon="calendar">Sin citas este día{pod !== "todos" ? " para ese podólogo" : ""}.</Vacio>}
      </div>
      <div style={{ height: 80 }} />
      <AccionesCita cita={abierta} onClose={() => setAbierta(null)} />
      {permite(u) && <Fab label="Nueva cita" onClick={() => setNueva(true)} />}
      {nueva && <NuevaCita onClose={() => setNueva(false)} fechaInicial={fecha} />}
    </div>
  );
}

function NuevaCita({ onClose, fechaInicial }) {
  const { d, u, sucursalId } = useSesion();
  const [paso, setPaso] = useState(0);
  const [pac, setPac] = useState(null);
  const [buscar, setBuscar] = useState(false);
  const [svId, setSvId] = useState("");
  const [podId, setPodId] = useState("");
  const [fecha, setFecha] = useState(fechaInicial < hoy() ? hoy() : fechaInicial);
  const [sel, setSel] = useState(null);
  const [rec, setRec] = useState(false);
  const [cada, setCada] = useState(1);
  const [veces, setVeces] = useState(4);
  const [guardando, setGuardando] = useState(false);

  const sv = d.servicios.find((s) => s.id === svId);
  const podologos = d.usuarios.filter((x) => x.rol === "podologo" && x.sucursales.includes(sucursalId));
  const libres = useMemo(() => sv && podId && pac ? horariosLibres(d, { fecha, sucursalId, duracion: sv.duracion, pacienteId: pac.id, podologoId: podId, ahora: fecha === hoy() ? ahoraLocal() : null }) : [], [d.citas, sv, podId, pac, fecha, sucursalId]);
  const fechas = rec ? fechasSerie(fecha, cada, veces) : [fecha];
  // Para cada fecha de la serie busca el mismo horario libre.
  const plan = useMemo(() => !sel || !sv ? [] : fechas.map((f) => {
    const l = horariosLibres(d, { fecha: f, sucursalId, duracion: sv.duracion, pacienteId: pac.id, podologoId: podId }).find((x) => x.hora === sel.hora);
    return { fecha: f, consultorioId: l ? l.consultorioId : null };
  }), [d.citas, sel, sv, fechas.join(), pac, podId]); // eslint-disable-line react-hooks/exhaustive-deps
  const conflictos = plan.filter((p) => !p.consultorioId);

  const puede = [!!pac, !!sv, !!podId, !!sel, (!rec || (cada >= 1 && veces >= 2 && veces <= 24)) && conflictos.length === 0, conflictos.length === 0 && plan.length > 0][paso];

  const guardar = () => {
    setGuardando(true);
    const r = mutar((dd) => {
      if (!permite(u)) return { ok: false, error: "Sin permiso" };
      const serieId = plan.length > 1 ? uid("SE") : null;
      const nuevas = [];
      for (const p of plan) {
        const inicio = `${p.fecha}T${sel.hora}`;
        if (empalmes(dd.citas, { inicio, duracion: sv.duracion, pacienteId: pac.id, podologoId: podId, consultorioId: p.consultorioId, sucursalId }).length) return { ok: false, error: `Se empalma el ${fechaCorta(p.fecha)}` };
        nuevas.push({ id: uid("CI"), pacienteId: pac.id, servicioId: sv.id, podologoId: podId, consultorioId: p.consultorioId, sucursalId, inicio, duracion: sv.duracion, estado: "agendada", recordatorio: "whatsapp", aDomicilio: false, serieId });
      }
      dd.citas.push(...nuevas);
      auditar(dd, "crear_cita", "cita", nuevas[0].id, `${nuevas.length} cita(s) · ${pac.folio} · ${sv.nombre}${serieId ? " · serie " + serieId : ""}`);
      return { ok: true, n: nuevas.length };
    });
    setGuardando(false);
    if (r.ok) { aviso(r.n > 1 ? `${r.n} citas agendadas` : "Cita agendada"); onClose(); } else aviso(r.error, "bad");
  };

  const pie = <div className="dos">
    <Button variante="sec" block onClick={() => (paso ? setPaso(paso - 1) : onClose())}>{paso ? "Atrás" : "Cancelar"}</Button>
    {paso < PASOS.length - 1 ? <Button block disabled={!puede} onClick={() => setPaso(paso + 1)}>Siguiente</Button> : <Button block loading={guardando} disabled={!puede} onClick={guardar}>Agendar</Button>}
  </div>;

  return (
    <Sheet abierto onClose={onClose} titulo="Nueva cita" pie={pie}>
      <div className="form">
        <Pasos titulos={PASOS} paso={paso} />
        {paso === 0 && <>
          {pac ? <Fila titulo={`${pac.nombres} ${pac.apellidos}`} sub={`${pac.folio} · ${pac.telefono}`} badge={pac.alertas[0] ? <Badge tono="warn">{pac.alertas[0]}</Badge> : null} /> : <Vacio icon="users">Elige al paciente (expediente único de las 7 sucursales).</Vacio>}
          <Button variante="sec" block icon="search" onClick={() => setBuscar(true)}>{pac ? "Cambiar paciente" : "Buscar paciente"}</Button>
          <SelectorPaciente abierto={buscar} onClose={() => setBuscar(false)} onElegir={(p) => { setPac(p); setSel(null); }} />
        </>}
        {paso === 1 && <div className="lista">{d.servicios.map((s) => (
          <Fila key={s.id} titulo={s.nombre} sub={`${s.duracion} min`} datos={dinero(R.precioFinal(d, sucursalId, "servicio", s.id))} badge={svId === s.id ? <Badge tono="ok">Elegido</Badge> : null} onClick={() => { setSvId(s.id); setSel(null); }} />
        ))}</div>}
        {paso === 2 && <div className="lista">{podologos.map((p) => (
          <Fila key={p.id} titulo={corto(p.nombre)} sub={`Atiende en ${p.sucursales.length} sucursales`} badge={podId === p.id ? <Badge tono="ok">Elegido</Badge> : null} onClick={() => { setPodId(p.id); setSel(null); }} />
        ))}{!podologos.length && <Vacio>Ningún podólogo asignado a esta sucursal.</Vacio>}</div>}
        {paso === 3 && <>
          <Field label="Fecha"><Input type="date" min={hoy()} value={fecha} onChange={(e) => { setFecha(e.target.value); setSel(null); }} /></Field>
          <div className="mu peq">Franjas de 30 min · {sv && sv.duracion} min de duración · sin empalme de paciente, podólogo ni consultorio</div>
          {libres.length ? <div className="chips">{libres.map((l) => <button key={l.hora} className={`chip${sel && sel.hora === l.hora ? " on" : ""}`} onClick={() => setSel(l)}>{l.hora}</button>)}</div> : <Vacio icon="clock">Sin horarios libres ese día.</Vacio>}
        </>}
        {paso === 4 && <>
          <Chips valor={rec ? "si" : "no"} onChange={(v) => setRec(v === "si")} opciones={[{ v: "no", l: "Cita única" }, { v: "si", l: "Se repite" }]} />
          {rec && <div className="dos">
            <Field label="Cada (semanas)"><Input type="number" inputMode="numeric" min={1} max={12} value={cada} onChange={(e) => setCada(Math.max(1, Number(e.target.value) || 1))} /></Field>
            <Field label="Veces (total)"><Input type="number" inputMode="numeric" min={2} max={24} value={veces} onChange={(e) => setVeces(Math.min(24, Math.max(2, Number(e.target.value) || 2)))} /></Field>
          </div>}
          {rec && conflictos.length > 0 && <div className="card card-warn"><b>No hay lugar el mismo horario:</b> {conflictos.map((c) => fechaCorta(c.fecha)).join(", ")}. Cambia la frecuencia o el horario.</div>}
        </>}
        {paso === 5 && sv && pac && sel && <>
          <Resumen filas={[["Paciente", `${pac.nombres} ${pac.apellidos}`], ["Servicio", sv.nombre], ["Podólogo", corto(d.usuarios.find((x) => x.id === podId).nombre)], ["Horario", `${sel.hora} · ${sv.duracion} min`], ["Citas", plan.length], ["Recordatorio", "WhatsApp"]]} />
          <div className="lista">{plan.map((p) => <Fila key={p.fecha} titulo={fechaCorta(p.fecha)} sub={p.consultorioId ? `Consultorio ${p.consultorioId}` : "Sin lugar"} badge={<Badge tono={p.consultorioId ? "ok" : "bad"}>{p.consultorioId ? "Libre" : "Ocupado"}</Badge>} />)}</div>
        </>}
      </div>
    </Sheet>
  );
}
