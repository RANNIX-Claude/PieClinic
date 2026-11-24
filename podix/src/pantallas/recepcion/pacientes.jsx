// Recepción · Pacientes: búsqueda sobre las 7 sucursales, alta por pasos con anti-duplicados y firma, y detalle.
import { useMemo, useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { buscarDuplicados, siguienteFolioExp, esMenor, validarPaso } from "../../store/logica_recepcion.js";
import { Avatar, BarraAccion, Badge, Buscador, Button, Card, Chips, Field, Fab, Fila, Input, Pasos, Resumen, Select, Sheet, Titulo, Vacio, aviso, useDebounced } from "../../ui/index.jsx";
import { filtrarPacientes } from "../../componentes/SelectorPaciente.jsx";
import Firma from "../../componentes/recepcion/Firma.jsx";
import { BotonesContacto, CitaFila, permite, EstadoBadge } from "../../componentes/recepcion/comun.jsx";
import { dinero, edad, fechaCorta, fechaLarga, hora, ahoraLocal, hoy } from "../../lib/format.js";

const VACIO = { nombres: "", apellidos: "", nacimiento: "", sexo: "", ocupacion: "", telefono: "", whatsapp: true, correo: "", domicilio: "", emergNombre: "", emergTel: "", origen: "Recomendación", convenioId: "", tutorNombre: "", tutorParentesco: "", alertas: "", acepta: false, firma: "" };
const PASOS = ["Datos básicos", "Contacto y domicilio", "Tutor y salud", "Aviso y firma", "Revisar"];

export default function Pacientes() {
  const { d, u } = useSesion();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [ver, setVer] = useState(null);
  const [alta, setAlta] = useState(false);
  const lista = useMemo(() => filtrarPacientes(d.pacientes, dq, 40), [d.pacientes, dq]);
  const total = dq ? "Resultados" : "Pacientes recientes";
  return (
    <div className="form">
      <Buscador valor={q} onChange={setQ} placeholder="Nombre, teléfono o folio EXP-…" />
      <Titulo derecha={<Badge tono="info">{d.pacientes.length} en total</Badge>}>{total}</Titulo>
      <div className="lista">
        {lista.map((p) => (
          <Fila key={p.id} izquierda={<Avatar nombre={`${p.nombres} ${p.apellidos}`} />} titulo={`${p.nombres} ${p.apellidos}`} sub={`${p.folio} · ${p.telefono}`}
            badge={p.alertas[0] ? <Badge tono="warn">{p.alertas[0]}</Badge> : null} onClick={() => setVer(p.id)} />
        ))}
        {!lista.length && <Vacio icon="users">Sin coincidencias. Puedes dar de alta al paciente.</Vacio>}
      </div>
      <div style={{ height: 70 }} />
      {permite(u) && <BarraAccion><Button block icon="plus" onClick={() => setAlta(true)}>Alta de paciente</Button></BarraAccion>}
      {ver && <Detalle id={ver} onClose={() => setVer(null)} />}
      {alta && <Alta onClose={() => setAlta(false)} onCreado={(id) => { setAlta(false); setVer(id); }} onExistente={(id) => { setAlta(false); setVer(id); }} />}
    </div>
  );
}

function Detalle({ id, onClose }) {
  const { d } = useSesion();
  const ir = useIr();
  const p = d.pacientes.find((x) => x.id === id);
  if (!p) return null;
  const conv = d.convenios.find((c) => c.id === p.convenioId);
  const saldo = R.saldoCreditoPaciente(d, p.id);
  const citas = d.citas.filter((c) => c.pacienteId === p.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
  const prox = citas.filter((c) => c.inicio >= ahoraLocal() && !["cancelada", "no_asistio"].includes(c.estado)).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  const nom = `${p.nombres} ${p.apellidos}`;
  return (
    <Sheet abierto onClose={onClose} titulo={nom} pie={<Button block icon="calendar" onClick={() => { onClose(); ir("agenda"); }}>Agendar cita</Button>}>
      <div className="form">
        <Resumen filas={[["Folio", p.folio], ["Edad", `${edad(p.nacimiento)} años · ${p.sexo === "F" ? "Mujer" : "Hombre"}`], ["Nacimiento", fechaLarga(p.nacimiento)], ["Teléfono", p.telefono], ["Correo", p.correo || "—"], ["Domicilio", p.domicilio || "—"],
          ["Emergencia", p.emergencia ? `${p.emergencia.nombre} · ${p.emergencia.telefono}` : "—"], p.tutor && ["Tutor", `${p.tutor.nombre} (${p.tutor.parentesco})`], ["Convenio", conv ? `${conv.nombre} (${conv.descuentoPct}%)` : "Ninguno"], ["Saldo de crédito", dinero(saldo), saldo > 0]]} />
        <BotonesContacto tel={p.telefono} nombre={p.nombres} />
        {p.alertas.length > 0 && <div><div className="mu peq">Alertas clínicas</div><div className="chips">{p.alertas.map((a) => <Badge key={a} tono="warn">{a}</Badge>)}</div></div>}
        <div><Badge tono={p.avisoFirmado ? "ok" : "bad"}>{p.avisoFirmado ? "Aviso de privacidad firmado" : "Falta aviso"}</Badge></div>
        <Titulo>Próxima cita</Titulo>
        {prox ? <CitaFila d={d} c={prox} extra={fechaCorta(prox.inicio)} /> : <Vacio icon="calendar">Sin cita próxima.</Vacio>}
        <Titulo>Historial de citas</Titulo>
        <div className="lista">{citas.slice(0, 15).map((c) => <CitaFila key={c.id} d={d} c={c} extra={fechaCorta(c.inicio)} />)}{!citas.length && <Vacio>Aún sin citas.</Vacio>}</div>
      </div>
    </Sheet>
  );
}

function Alta({ onClose, onCreado, onExistente }) {
  const { d, u, sucursalId } = useSesion();
  const [f, setF] = useState(VACIO);
  const [paso, setPaso] = useState(0);
  const [err, setErr] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const menor = esMenor(f.nacimiento);
  const dups = useMemo(() => paso === 4 ? buscarDuplicados(d.pacientes, f) : [], [paso]); // eslint-disable-line react-hooks/exhaustive-deps
  const folioNuevo = siguienteFolioExp(d.pacientes);

  const siguiente = () => {
    const e = validarPaso(paso, f);
    setErr(e);
    if (!Object.keys(e).length) setPaso(paso + 1);
  };
  const guardar = () => {
    const r = mutar((dd) => {
      if (!permite(u)) return { ok: false };
      const folio = siguienteFolioExp(dd.pacientes);
      const p = {
        id: uid("PA"), folio, nombres: f.nombres.trim(), apellidos: f.apellidos.trim(), nacimiento: f.nacimiento, sexo: f.sexo, telefono: f.telefono.trim(), whatsapp: !!f.whatsapp,
        correo: f.correo.trim(), domicilio: f.domicilio.trim(), ocupacion: f.ocupacion.trim(), emergencia: { nombre: f.emergNombre.trim(), telefono: f.emergTel.trim() },
        origen: f.origen, convenioId: f.convenioId || null, alertas: f.alertas.split(",").map((x) => x.trim()).filter(Boolean), sucursalAlta: sucursalId,
        avisoFirmado: true, consentimientoFirmado: true, firmaAviso: f.firma, fechaAviso: ahoraLocal(),
        tutor: menor ? { nombre: f.tutorNombre.trim(), parentesco: f.tutorParentesco.trim() } : null, activo: true,
      };
      dd.pacientes.push(p);
      auditar(dd, "alta_paciente", "paciente", p.id, `${folio} ${p.nombres} ${p.apellidos}`);
      return { ok: true, id: p.id, folio };
    });
    if (r.ok) { aviso(`Paciente creado · ${r.folio}`); onCreado(r.id); } else aviso("Sin permiso", "bad");
  };

  const pie = <div className="dos">
    <Button variante="sec" block onClick={() => (paso ? setPaso(paso - 1) : onClose())}>{paso ? "Atrás" : "Cancelar"}</Button>
    {paso < 4 ? <Button block onClick={siguiente}>Siguiente</Button> : <Button block onClick={guardar}>{dups.length ? "No es el mismo, crear" : "Guardar paciente"}</Button>}
  </div>;
  const E = ({ k }) => err[k] ? <strong style={{ color: "var(--er)", fontSize: 12 }}>{err[k]}</strong> : null;

  return (
    <Sheet abierto onClose={onClose} titulo="Alta de paciente" pie={pie}>
      <div className="form">
        <Pasos titulos={PASOS} paso={paso} />
        {paso === 0 && <>
          <Field label="Nombre(s)" error={err.nombres}><Input value={f.nombres} onChange={set("nombres")} autoComplete="given-name" /></Field>
          <Field label="Apellidos" error={err.apellidos}><Input value={f.apellidos} onChange={set("apellidos")} autoComplete="family-name" /></Field>
          <Field label="Fecha de nacimiento" error={err.nacimiento}><Input type="date" value={f.nacimiento} max={hoy()} onChange={set("nacimiento")} /></Field>
          <Field label="Sexo" error={err.sexo}><Select value={f.sexo} onChange={set("sexo")}><option value="">Elegir…</option><option value="F">Mujer</option><option value="M">Hombre</option></Select></Field>
          <Field label="Ocupación"><Input value={f.ocupacion} onChange={set("ocupacion")} /></Field>
          {menor && <div className="card card-info">Es menor de edad: en el paso 3 se pedirá tutor.</div>}
        </>}
        {paso === 1 && <>
          <Field label="Teléfono" error={err.telefono}><Input type="tel" inputMode="tel" autoComplete="tel" value={f.telefono} onChange={set("telefono")} placeholder="55 1234 5678" /></Field>
          <Chips valor={f.whatsapp ? "si" : "no"} onChange={(v) => setF((x) => ({ ...x, whatsapp: v === "si" }))} opciones={[{ v: "si", l: "Tiene WhatsApp" }, { v: "no", l: "Sin WhatsApp" }]} />
          <Field label="Correo" error={err.correo}><Input type="email" inputMode="email" autoComplete="email" value={f.correo} onChange={set("correo")} /></Field>
          <Field label="Domicilio"><Input value={f.domicilio} onChange={set("domicilio")} autoComplete="street-address" /></Field>
          <Field label="Contacto de emergencia"><Input value={f.emergNombre} onChange={set("emergNombre")} placeholder="Nombre" /></Field>
          <Field label="Teléfono de emergencia"><Input type="tel" inputMode="tel" value={f.emergTel} onChange={set("emergTel")} /></Field>
          <Field label="¿Cómo nos conoció?"><Select value={f.origen} onChange={set("origen")}>{["Referido médico", "Redes sociales", "Recomendación", "Convenio", "Búsqueda web"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
        </>}
        {paso === 2 && <>
          {menor ? <>
            <div className="card card-warn">Paciente menor de 18 años: tutor obligatorio.</div>
            <Field label="Nombre del tutor" error={err.tutorNombre}><Input value={f.tutorNombre} onChange={set("tutorNombre")} /></Field>
            <Field label="Parentesco" error={err.tutorParentesco}><Input value={f.tutorParentesco} onChange={set("tutorParentesco")} placeholder="Madre, padre, tutor legal…" /></Field>
          </> : <div className="mu">Paciente mayor de edad: no requiere tutor.</div>}
          <Field label="Alertas clínicas" hint="Separadas por coma (ej. Diabetes tipo 2, Alergia: látex)"><Input value={f.alertas} onChange={set("alertas")} /></Field>
          <Field label="Convenio"><Select value={f.convenioId} onChange={set("convenioId")}><option value="">Ninguno</option>{d.convenios.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.descuentoPct}%)</option>)}</Select></Field>
        </>}
        {paso === 3 && <>
          <Card><p className="txt peq">Aviso de privacidad y consentimiento informado. Autorizo el tratamiento de mis datos personales y de salud para la atención podológica, y los procedimientos que mi podólogo me explique. Puedo ejercer mis derechos ARCO en cualquier sucursal.</p></Card>
          <label style={{ display: "flex", gap: 10, alignItems: "center", minHeight: 44 }}><input type="checkbox" checked={f.acepta} onChange={(e) => setF((x) => ({ ...x, acepta: e.target.checked }))} style={{ width: 24, height: 24 }} /> He leído y acepto{menor ? " (en nombre del menor, como tutor)" : ""}</label>
          <E k="acepta" />
          <div className="mu peq">Firma {menor ? "del tutor" : "del paciente"}</div>
          <Firma onChange={(v) => setF((x) => ({ ...x, firma: v }))} />
          <E k="firma" />
        </>}
        {paso === 4 && <>
          {dups.length > 0 && <>
            <div className="card card-warn"><b>Posibles duplicados.</b> Si es la misma persona, ábrela en lugar de crear otro expediente.</div>
            <div className="lista">{dups.map((x) => <Fila key={x.paciente.id} titulo={`${x.paciente.nombres} ${x.paciente.apellidos}`} sub={`${x.paciente.folio} · ${x.paciente.telefono}`} badge={<Badge tono="warn">{x.motivos.join(" y ")}</Badge>} derecha={<Button variante="sec" onClick={() => onExistente(x.paciente.id)}>Es el mismo</Button>} />)}</div>
          </>}
          <Resumen filas={[["Folio", folioNuevo], ["Paciente", `${f.nombres} ${f.apellidos}`], ["Nacimiento", f.nacimiento], ["Teléfono", f.telefono], menor && ["Tutor", `${f.tutorNombre} (${f.tutorParentesco})`], ["Alertas", f.alertas || "—"], ["Aviso firmado", f.firma ? "Sí" : "No"]]} />
        </>}
      </div>
    </Sheet>
  );
}
