// Alta de paciente (porte de Pie Firme: PacienteNuevo.jsx): pasos, duplicados por nombre completo + fecha de nacimiento
// (P-006), tutor de menores (P-005), aviso de privacidad y datos de salud con firma (P-003), número de expediente manual (N-08).
import { useMemo, useState } from "react";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { Badge, Button, Field, Input, Select, Sheet, Pasos, Chips, Fila, aviso } from "../../ui/index.jsx";
import Firma from "../recepcion/Firma.jsx";
import { Aviso } from "./comunes.jsx";

const VACIO = { nombres: "", apellidos: "", nacimiento: "", sexo: "", telefono: "", correo: "", curp: "", folioManual: "", domicilio: "", colonia: "", ocupacion: "", estadoCivil: "", lugarOrigen: "", origen: "", emergencia: { nombre: "", telefono: "" }, tutor: { nombre: "", parentesco: "", identificacion: "", telefono: "" } };

export default function AltaPaciente({ d, u, sucursalId, abierto, onClose, onCreado }) {
  const [f, setF] = useState(VACIO);
  const [rapida, setRapida] = useState(false);
  const [paso, setPaso] = useState(0);
  const [aviso1, setAviso1] = useState(false);
  const [salud, setSalud] = useState(false);
  const [firma, setFirma] = useState("");
  const [noDup, setNoDup] = useState("");
  const [err, setErr] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const menor = A.esMenorDeEdad(f.nacimiento);
  const titulos = rapida ? ["Alta rápida"] : ["Identificación", "Contacto y domicilio", ...(menor ? ["Tutor"] : []), "Aviso y consentimientos"];
  const actual = titulos[paso];
  const dups = useMemo(() => (f.nombres && (f.nacimiento || f.telefono) ? A.buscarDuplicados(d.pacientes, f) : []), [d.pacientes, f]);
  const bloquea = dups.some((x) => x.tipo === "bloquea");
  const cerrar = () => { setF(VACIO); setPaso(0); setAviso1(false); setSalud(false); setFirma(""); setNoDup(""); setErr({}); setRapida(false); onClose(); };
  const validarPaso = () => {
    const e = A.validarAlta({ ...f, sucursalAlta: sucursalId }, { rapida });
    const campos = { Identificación: ["nombres", "apellidos", "nacimiento", "telefono", "correo", "curp", "folioManual"], Tutor: ["tutor"], "Alta rápida": ["nombres", "telefono"] }[actual] || [];
    const sub = Object.fromEntries(Object.entries(e).filter(([k]) => campos.includes(k)));
    setErr(sub);
    if (Object.keys(sub).length) return false;
    if ((actual === "Identificación" || rapida) && bloquea && noDup.trim().length < 5) { aviso("Posible duplicado: abre el existente o explica por qué no es la misma persona.", "warn"); return false; }
    return true;
  };
  const guardar = () => {
    if (!validarPaso()) return;
    const r = mutar((x) => A.altaPaciente(x, { ...f, sucursalAlta: sucursalId }, u, { rapida, noEsDuplicado: bloquea ? noDup : null, aviso: aviso1, datosSalud: salud, firma }));
    if (!r.ok) { setErr(r.errores || {}); aviso(r.error, "bad"); return; }
    aviso(`Expediente ${r.paciente.folio} creado`, "ok");
    if (r.avisos?.length) aviso(`Aviso: el teléfono coincide con ${r.avisos.map((x) => x.paciente.folio).join(", ")}`, "warn");
    const id = r.paciente.id; cerrar(); onCreado?.(id);
  };
  const ultimo = paso === titulos.length - 1;
  const pie = (
    <div className="dos">
      <Button variante="sec" block onClick={() => (paso ? setPaso(paso - 1) : cerrar())}>{paso ? "Atrás" : "Cancelar"}</Button>
      {ultimo ? <Button block onClick={guardar} disabled={!rapida && (!aviso1 || !salud || !firma)}>Crear expediente</Button> : <Button block onClick={() => validarPaso() && setPaso(paso + 1)}>Siguiente</Button>}
    </div>
  );
  const aviso_ = A.plantillaActiva(d, "aviso_privacidad"), salud_ = A.plantillaActiva(d, "consentimiento_datos_salud");
  const vars = A.variablesConsentimiento({ paciente: f, clinica: "Pie Clinic" });
  return (
    <Sheet abierto={abierto} onClose={cerrar} titulo="Nuevo paciente" pie={pie}>
      <Chips opciones={[{ v: "completa", l: "Alta completa" }, { v: "rapida", l: "Alta rápida" }]} valor={rapida ? "rapida" : "completa"} onChange={(v) => { setRapida(v === "rapida"); setPaso(0); }} />
      <Pasos titulos={titulos} paso={paso} />
      {(actual === "Identificación" || actual === "Alta rápida") && (
        <div className="form2">
          <Field label="Nombre(s)" error={err.nombres}><Input value={f.nombres} onChange={(e) => set("nombres", e.target.value)} autoComplete="off" /></Field>
          {!rapida && <Field label="Apellidos" error={err.apellidos}><Input value={f.apellidos} onChange={(e) => set("apellidos", e.target.value)} autoComplete="off" /></Field>}
          <Field label="Celular" error={err.telefono}><Input type="tel" inputMode="tel" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} /></Field>
          {!rapida && <>
            <Field label="Fecha de nacimiento" error={err.nacimiento} hint={f.nacimiento ? A.textoEdad(f.nacimiento) : ""}><Input type="date" value={f.nacimiento} onChange={(e) => set("nacimiento", e.target.value)} /></Field>
            <Field label="Sexo"><Select value={f.sexo} onChange={(e) => set("sexo", e.target.value)}><option value="">—</option><option value="F">Mujer</option><option value="M">Hombre</option></Select></Field>
            <Field label="Correo" error={err.correo}><Input type="email" value={f.correo} onChange={(e) => set("correo", e.target.value)} /></Field>
            <Field label="CURP (opcional)" error={err.curp}><Input value={f.curp} onChange={(e) => set("curp", e.target.value.toUpperCase())} maxLength={18} /></Field>
            <Field label="N.º de expediente vigente (migración)" error={err.folioManual} hint="Vacío: lo asigna el sistema (N-08)."><Input value={f.folioManual} onChange={(e) => set("folioManual", e.target.value)} /></Field>
          </>}
          {rapida && <p className="mu peq">Alta rápida: nombre y celular. El resto se exige antes de la primera consulta clínica (P-003).</p>}
        </div>
      )}
      {(actual === "Identificación" || actual === "Alta rápida") && dups.length > 0 && (
        <div className="exp-dups">
          <Aviso tono={bloquea ? "bad" : "warn"}>{bloquea ? "Posible duplicado: mismo nombre completo y fecha de nacimiento (P-006)." : "Aviso: otro paciente tiene el mismo teléfono."}</Aviso>
          {dups.slice(0, 4).map((x) => <Fila key={x.paciente.id} titulo={A.nombreCompleto(x.paciente)} sub={`${x.paciente.folio} · ${A.fechaPapel(x.paciente.nacimiento)} · ${x.paciente.telefono}`}
            badge={<Badge tono={x.tipo === "bloquea" ? "bad" : "warn"}>{x.tipo === "bloquea" ? "Coincide" : "Teléfono"}</Badge>}
            derecha={<Button variante="ghost" onClick={() => { const id = x.paciente.id; cerrar(); onCreado?.(id); }}>Abrir</Button>} />)}
          {bloquea && <Field label="No es la misma persona: explica por qué" hint="Queda en la bitácora."><Input value={noDup} onChange={(e) => setNoDup(e.target.value)} /></Field>}
        </div>
      )}
      {actual === "Contacto y domicilio" && (
        <div className="form2">
          <Field label="Calle y número"><Input value={f.domicilio} onChange={(e) => set("domicilio", e.target.value)} autoComplete="street-address" /></Field>
          <Field label="Colonia"><Input value={f.colonia} onChange={(e) => set("colonia", e.target.value)} /></Field>
          <Field label="Ocupación"><Input value={f.ocupacion} onChange={(e) => set("ocupacion", e.target.value)} /></Field>
          <Field label="Estado civil"><Select value={f.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)}><option value="">—</option>{A.ESTADOS_CIVILES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Lugar de origen"><Input value={f.lugarOrigen} onChange={(e) => set("lugarOrigen", e.target.value)} /></Field>
          <Field label="¿Cómo nos conoció?"><Select value={f.origen} onChange={(e) => set("origen", e.target.value)}><option value="">—</option>{["Referido médico", "Redes sociales", "Recomendación", "Convenio", "Búsqueda web"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Contacto de emergencia"><Input value={f.emergencia.nombre} onChange={(e) => set("emergencia", { ...f.emergencia, nombre: e.target.value })} /></Field>
          <Field label="Teléfono de emergencia"><Input type="tel" value={f.emergencia.telefono} onChange={(e) => set("emergencia", { ...f.emergencia, telefono: e.target.value })} /></Field>
        </div>
      )}
      {actual === "Tutor" && (
        <>
          <Aviso>Paciente menor de 18 años ({A.textoEdad(f.nacimiento)}): el tutor firma los consentimientos. Al cumplir 18 se pedirá su propia firma (P-005).</Aviso>
          {err.tutor && <Aviso tono="bad">{err.tutor}</Aviso>}
          <div className="form2">
            <Field label="Nombre completo del tutor"><Input value={f.tutor.nombre} onChange={(e) => set("tutor", { ...f.tutor, nombre: e.target.value })} /></Field>
            <Field label="Parentesco"><Select value={f.tutor.parentesco} onChange={(e) => set("tutor", { ...f.tutor, parentesco: e.target.value })}><option value="">—</option>{["Madre", "Padre", "Abuela", "Abuelo", "Tutor legal", "Otro"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
            <Field label="Identificación (tipo y folio)"><Input value={f.tutor.identificacion} onChange={(e) => set("tutor", { ...f.tutor, identificacion: e.target.value })} placeholder="INE 1234567890" /></Field>
            <Field label="Teléfono del tutor"><Input type="tel" value={f.tutor.telefono} onChange={(e) => set("tutor", { ...f.tutor, telefono: e.target.value })} /></Field>
          </div>
        </>
      )}
      {actual === "Aviso y consentimientos" && (
        <>
          <details className="exp-det" open><summary>{aviso_?.nombre} (v{aviso_?.version})</summary><div className="exp-texto-legal">{A.sustituirVariables(aviso_?.contenido, vars)}</div></details>
          <label className="exp-check"><input type="checkbox" checked={aviso1} onChange={(e) => setAviso1(e.target.checked)} /> {menor ? "El tutor leyó" : "El paciente leyó"} y acepta el aviso de privacidad</label>
          <details className="exp-det"><summary>{salud_?.nombre} (v{salud_?.version})</summary><div className="exp-texto-legal">{A.sustituirVariables(salud_?.contenido, vars)}</div></details>
          <label className="exp-check"><input type="checkbox" checked={salud} onChange={(e) => setSalud(e.target.checked)} /> Acepta el tratamiento de sus datos de salud</label>
          <p className="peq"><b>Firma {menor ? `del tutor (${f.tutor.nombre || "—"})` : "del paciente"}</b></p>
          <Firma onChange={setFirma} alto={140} />
          <p className="mu peq">Textos pendientes de validación legal (N-06). Se guarda la versión aceptada con cada firma (P-139).</p>
        </>
      )}
    </Sheet>
  );
}
