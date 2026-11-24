// Recepción · Pendientes: citas por confirmar, lista de espera y no-shows de ayer.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import { horariosLibres, empalmes, waLink, telLink } from "../../store/logica_recepcion.js";
import { Badge, Button, Chips, Field, Input, Select, Fila, Sheet, Vacio, Icon, aviso } from "../../ui/index.jsx";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import { CitaFila, AccionesCita, confirmarCita, reprogramarCita, permite, corto, pacienteDe } from "../../componentes/recepcion/comun.jsx";
import { hoy, ahoraLocal, sumarDias, fechaCorta, dia } from "../../lib/format.js";

const PREFS = { cualquiera: "Cualquier horario", manana: "Mañana (9–13)", tarde: "Tarde (13–18)" };

export default function Pendientes() {
  const { d, u, sucursalId } = useSesion();
  const [vista, setVista] = useState("confirmar");
  const [abierta, setAbierta] = useState(null);
  const [reag, setReag] = useState(null);
  const [agregar, setAgregar] = useState(false);
  const [hueco, setHueco] = useState(null);

  const porConfirmar = d.citas.filter((c) => c.sucursalId === sucursalId && dia(c.inicio) >= hoy() && c.estado === "por_confirmar").sort((a, b) => a.inicio.localeCompare(b.inicio));
  const espera = (d.listaEspera || []).filter((e) => e.sucursalId === sucursalId);
  const ayer = sumarDias(hoy(), -1);
  const noShows = d.citas.filter((c) => c.sucursalId === sucursalId && dia(c.inicio) === ayer && c.estado === "no_asistio");

  const quitar = (id) => mutar((dd) => { if (!permite(u)) return; dd.listaEspera = (dd.listaEspera || []).filter((e) => e.id !== id); auditar(dd, "quitar_lista_espera", "listaEspera", id, ""); });

  return (
    <div className="form">
      <Chips valor={vista} onChange={setVista} opciones={[{ v: "confirmar", l: "Por confirmar", n: porConfirmar.length }, { v: "espera", l: "Lista de espera", n: espera.length }, { v: "noshow", l: "No-shows", n: noShows.length }]} />

      {vista === "confirmar" && <div className="lista">
        {porConfirmar.map((c) => {
          const p = pacienteDe(d, c.pacienteId);
          return (
            <div key={c.id} className="card" style={{ display: "grid", gap: 8 }}>
              <CitaFila d={d} c={c} onClick={() => setAbierta(c)} extra={fechaCorta(c.inicio)} />
              {p && <div className="dos" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <a className="btn btn-sec btn-peq" href={telLink(p.telefono)} aria-label="Llamar"><Icon name="phone" size={16} />Llamar</a>
                <a className="btn btn-sec btn-peq" href={waLink(p.telefono)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><Icon name="message" size={16} />WhatsApp</a>
                <Button className="btn-peq" icon="check" onClick={() => confirmarCita(u, c.id) && aviso("Cita confirmada")}>Confirmar</Button>
              </div>}
            </div>
          );
        })}
        {!porConfirmar.length && <Vacio icon="check">No hay citas por confirmar.</Vacio>}
      </div>}

      {vista === "espera" && <>
        <Button block icon="plus" onClick={() => setAgregar(true)} disabled={!permite(u)}>Agregar a lista de espera</Button>
        <div className="lista">
          {espera.map((e) => {
            const p = pacienteDe(d, e.pacienteId), sv = d.servicios.find((s) => s.id === e.servicioId);
            return (
              <div key={e.id} className="card" style={{ display: "grid", gap: 8 }}>
                <Fila titulo={p ? `${p.nombres} ${p.apellidos}` : "—"} sub={sv ? sv.nombre : "Servicio"} datos={`${PREFS[e.preferencia] || e.preferencia} · desde ${fechaCorta(e.creado)}`} badge={<Badge tono="warn">En espera</Badge>} />
                <div className="dos">
                  <Button variante="sec" icon="trash" disabled={!permite(u)} onClick={() => quitar(e.id)}>Quitar</Button>
                  <Button icon="calendar" disabled={!permite(u)} onClick={() => setHueco(e)}>Agendar</Button>
                </div>
              </div>
            );
          })}
          {!espera.length && <Vacio icon="clock">Lista de espera vacía.</Vacio>}
        </div>
      </>}

      {vista === "noshow" && <div className="lista">
        <div className="mu peq">Pacientes que no llegaron ayer ({fechaCorta(ayer)}).</div>
        {noShows.map((c) => (
          <div key={c.id} className="card" style={{ display: "grid", gap: 8 }}>
            <CitaFila d={d} c={c} onClick={() => setAbierta(c)} />
            <Button icon="refresh" disabled={!permite(u)} onClick={() => setReag(c)}>Reagendar</Button>
          </div>
        ))}
        {!noShows.length && <Vacio icon="check">Sin no-shows ayer.</Vacio>}
      </div>}

      <AccionesCita cita={abierta} onClose={() => setAbierta(null)} />
      {agregar && <AgregarEspera onClose={() => setAgregar(false)} />}
      {reag && <Reagendar cita={reag} onClose={() => setReag(null)} />}
      {hueco && <AgendarEspera item={hueco} onClose={() => setHueco(null)} />}
    </div>
  );
}

function AgregarEspera({ onClose }) {
  const { d, u, sucursalId } = useSesion();
  const [pac, setPac] = useState(null);
  const [buscar, setBuscar] = useState(false);
  const [sv, setSv] = useState("");
  const [pref, setPref] = useState("cualquiera");
  const ok = pac && sv;
  return (
    <Sheet abierto onClose={onClose} titulo="Lista de espera" pie={<Button block disabled={!ok} onClick={() => {
      mutar((dd) => {
        if (!permite(u)) return;
        (dd.listaEspera ||= []).push({ id: uid("LE"), pacienteId: pac.id, servicioId: sv, preferencia: pref, sucursalId, creado: hoy() });
        auditar(dd, "alta_lista_espera", "listaEspera", pac.id, sv);
      });
      aviso("Agregado a la lista de espera"); onClose();
    }}>Agregar</Button>}>
      <div className="form">
        {pac ? <Fila titulo={`${pac.nombres} ${pac.apellidos}`} sub={`${pac.folio} · ${pac.telefono}`} /> : <Vacio icon="users">Elige al paciente.</Vacio>}
        <Button variante="sec" block icon="search" onClick={() => setBuscar(true)}>{pac ? "Cambiar paciente" : "Buscar paciente"}</Button>
        <SelectorPaciente abierto={buscar} onClose={() => setBuscar(false)} onElegir={setPac} />
        <Field label="Servicio"><Select value={sv} onChange={(e) => setSv(e.target.value)}><option value="">Elegir…</option>{d.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
        <Field label="Preferencia de horario"><Select value={pref} onChange={(e) => setPref(e.target.value)}>{Object.entries(PREFS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
    </Sheet>
  );
}

function Franjas({ libres, sel, setSel }) {
  return libres.length ? <div className="chips">{libres.map((l) => <button key={l.hora} className={`chip${sel && sel.hora === l.hora ? " on" : ""}`} onClick={() => setSel(l)}>{l.hora}</button>)}</div> : <Vacio icon="clock">Sin horarios libres ese día.</Vacio>;
}

function Reagendar({ cita, onClose }) {
  const { d, u } = useSesion();
  const [fecha, setFecha] = useState(hoy());
  const [sel, setSel] = useState(null);
  const libres = useMemo(() => horariosLibres(d, { fecha, sucursalId: cita.sucursalId, duracion: cita.duracion, pacienteId: cita.pacienteId, podologoId: cita.podologoId, ignorarIds: [cita.id], ahora: fecha === hoy() ? ahoraLocal() : null }), [d.citas, fecha]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet abierto onClose={onClose} titulo="Reagendar no-show" pie={<Button block disabled={!sel} onClick={() => { const r = reprogramarCita(u, cita.id, fecha, sel.hora, sel.consultorioId); if (r.ok) { aviso("Cita reagendada"); onClose(); } else aviso(r.error, "bad"); }}>Reagendar</Button>}>
      <div className="form">
        <Field label="Nueva fecha"><Input type="date" min={hoy()} value={fecha} onChange={(e) => { setFecha(e.target.value); setSel(null); }} /></Field>
        <Franjas libres={libres} sel={sel} setSel={setSel} />
      </div>
    </Sheet>
  );
}

function AgendarEspera({ item, onClose }) {
  const { d, u, sucursalId } = useSesion();
  const sv = d.servicios.find((s) => s.id === item.servicioId);
  const podologos = d.usuarios.filter((x) => x.rol === "podologo" && x.sucursales.includes(sucursalId));
  const [podId, setPodId] = useState(podologos[0] ? podologos[0].id : "");
  const [fecha, setFecha] = useState(hoy());
  const [sel, setSel] = useState(null);
  const libres = useMemo(() => {
    const l = podId ? horariosLibres(d, { fecha, sucursalId, duracion: sv.duracion, pacienteId: item.pacienteId, podologoId: podId, ahora: fecha === hoy() ? ahoraLocal() : null }) : [];
    return l.filter((x) => item.preferencia === "manana" ? x.hora < "13:00" : item.preferencia === "tarde" ? x.hora >= "13:00" : true);
  }, [d.citas, podId, fecha]); // eslint-disable-line react-hooks/exhaustive-deps
  const agendar = () => {
    const r = mutar((dd) => {
      if (!permite(u)) return false;
      const inicio = `${fecha}T${sel.hora}`;
      if (empalmes(dd.citas, { inicio, duracion: sv.duracion, pacienteId: item.pacienteId, podologoId: podId, consultorioId: sel.consultorioId, sucursalId }).length) return false;
      const c = { id: uid("CI"), pacienteId: item.pacienteId, servicioId: sv.id, podologoId: podId, consultorioId: sel.consultorioId, sucursalId, inicio, duracion: sv.duracion, estado: "agendada", recordatorio: "whatsapp", aDomicilio: false, serieId: null };
      dd.citas.push(c);
      dd.listaEspera = (dd.listaEspera || []).filter((e) => e.id !== item.id);
      auditar(dd, "agendar_desde_espera", "cita", c.id, inicio);
      return true;
    });
    if (r) { aviso("Cita agendada"); onClose(); } else aviso("No se pudo agendar (empalme)", "bad");
  };
  return (
    <Sheet abierto onClose={onClose} titulo={`Agendar · ${sv ? sv.nombre : ""}`} pie={<Button block disabled={!sel} onClick={agendar}>Agendar en este hueco</Button>}>
      <div className="form">
        <Field label="Podólogo"><Select value={podId} onChange={(e) => { setPodId(e.target.value); setSel(null); }}>{podologos.map((p) => <option key={p.id} value={p.id}>{corto(p.nombre)}</option>)}</Select></Field>
        <Field label="Fecha"><Input type="date" min={hoy()} value={fecha} onChange={(e) => { setFecha(e.target.value); setSel(null); }} /></Field>
        <div className="mu peq">Preferencia: {PREFS[item.preferencia]}</div>
        <Franjas libres={libres} sel={sel} setSel={setSel} />
      </div>
    </Sheet>
  );
}
