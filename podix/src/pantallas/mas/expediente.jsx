// Expediente clínico único (porte de Pie Firme: Pacientes.jsx + Expediente.jsx + PacienteNuevo.jsx).
// Buscador (Vista mosaico | renglones) → expediente con pestañas. Cada apertura queda en bitácora (P-002); el podólogo sin
// relación con el paciente ni con su sucursal registra motivo y se avisa a Administración. Recepción/Gerencia: solo datos.
import { useEffect, useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { ROLES, appDeRol } from "../../config/roles.js";
import { Badge, Button, Card, Chips, Field, Input, Select, Fila, Sheet, Titulo, Vacio, Kpi, aviso } from "../../ui/index.jsx";
import { fechaLarga, hora, dinero } from "../../lib/format.js";
import { BuscadorPacientes, CabeceraPaciente, usePacienteSel, Aviso, Seccion } from "../../componentes/expediente/comunes.jsx";
import AltaPaciente from "../../componentes/expediente/Alta.jsx";
import PanelNotas from "../../componentes/expediente/Notas.jsx";
import PanelHistoria from "../../componentes/expediente/Historia.jsx";
import PanelFotos from "../../componentes/expediente/Fotos.jsx";
import PanelDocumentos from "../../componentes/expediente/Documentos.jsx";
import "../../estilos_expediente.css";

export const tieneRuta = (u, key) => { const r = ROLES[appDeRol(u?.rol)]; return !!r && [...(r.tabs || []), ...(r.mas || [])].some((m) => m.key === key); };

export default function Expediente() {
  const { d, u, sucursalId } = useSesion();
  const [id, setId] = usePacienteSel();
  const [alta, setAlta] = useState(false);
  const p = id ? d.pacientes.find((x) => x.id === id) : null;
  if (!A.puedeAbrirExpediente(u)) return <div className="pantalla"><Vacio icon="lock">Tu rol no consulta expedientes de pacientes.</Vacio></div>;
  return (
    <div className="pantalla exp">
      {!p ? (
        <>
          <Titulo derecha={A.puedeAltaPaciente(u) && <Button icon="plus" onClick={() => setAlta(true)}>Nuevo paciente</Button>}>Expediente clínico</Titulo>
          <p className="mu peq">Un solo expediente por paciente en toda la clínica (N-08). Cada apertura queda en la bitácora (P-002).</p>
          <BuscadorPacientes d={d} u={u} sucursalId={sucursalId} onElegir={(x) => setId(x)} />
        </>
      ) : <Detalle key={p.id} d={d} u={u} p={p} sucursalId={sucursalId} onCerrar={() => setId(null)} />}
      <AltaPaciente d={d} u={u} sucursalId={sucursalId} abierto={alta} onClose={() => setAlta(false)} onCreado={(x) => setId(x)} />
    </div>
  );
}

function Detalle({ d, u, p, sucursalId, onCerrar }) {
  const alcance = A.alcanceExpediente(d, u, sucursalId, p);
  const [acceso, setAcceso] = useState(() => (A.abiertoHoy(d, u, p.id) ? "ok" : "pendiente"));
  const [motivo, setMotivo] = useState("");
  const clinico = A.puedeVerClinico(u);
  const [tab, setTab] = useState("datos");
  useEffect(() => {
    if (acceso !== "pendiente") return;
    const r = mutar((x) => A.abrirExpediente(x, p.id, u));
    if (r.ok) setAcceso("ok"); else if (r.requiereMotivo) setAcceso("motivo"); else { aviso(r.error, "bad"); onCerrar(); }
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (acceso === "motivo") {
    return (
      <Card tono="warn">
        <h3>Expediente de otra sucursal</h3>
        <p className="txt">{A.nombreCompleto(p)} no es paciente tuyo ni de la sucursal donde trabajas hoy. Registra el motivo: queda en la bitácora y se avisa a Administración (P-002).</p>
        <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="p. ej. interconsulta solicitada por el tratante" /></Field>
        <div className="dos">
          <Button variante="sec" block onClick={onCerrar}>Volver</Button>
          <Button block onClick={() => { const r = mutar((x) => A.abrirExpediente(x, p.id, u, { motivo })); if (r.ok) { setAcceso("ok"); aviso("Apertura registrada; se avisó a Administración", "warn"); } else aviso(r.error, "bad"); }}>Abrir expediente</Button>
        </div>
      </Card>
    );
  }
  if (acceso !== "ok") return null;
  const tabs = [
    { v: "datos", l: "Datos" },
    ...(clinico ? [{ v: "historia", l: "Antecedentes e historia" }] : [{ v: "historia", l: "Impresos" }]),
    { v: "consultas", l: "Consultas y notas" },
    ...(A.puedeVerFotos(u) ? [{ v: "fotos", l: "Fotos" }] : []),
    ...(clinico ? [{ v: "planes", l: "Planes y órdenes" }] : []),
    { v: "documentos", l: "Documentos" },
    ...(A.puedeVerBitacoraAperturas(u) || u.rol === "podologo" ? [{ v: "bitacora", l: "Bitácora" }] : []),
  ];
  return (
    <>
      <CabeceraPaciente d={d} p={p} onCambiar={onCerrar} clinico={clinico}>
        <div className="mu peq">Alcance: {{ total: "Administración (todo)", propio: "paciente tuyo", sucursal: "paciente de tu sucursal", otra: "otra sucursal (con motivo)", datos: "solo datos (sin notas clínicas)" }[alcance]} · versión {A.versionExpediente(d, p.id)} del expediente</div>
      </CabeceraPaciente>
      <Chips opciones={tabs} valor={tab} onChange={setTab} scroll />
      {tab === "datos" && <Datos d={d} u={u} p={p} />}
      {tab === "historia" && <PanelHistoria d={d} u={u} p={p} />}
      {tab === "consultas" && <PanelNotas d={d} u={u} p={p} clinico={clinico} />}
      {tab === "fotos" && <PanelFotos d={d} u={u} p={p} />}
      {tab === "planes" && <Planes d={d} u={u} p={p} />}
      {tab === "documentos" && <PanelDocumentos d={d} u={u} p={p} />}
      {tab === "bitacora" && <BitacoraPaciente d={d} u={u} p={p} />}
    </>
  );
}

function Datos({ d, u, p }) {
  const [ed, setEd] = useState(null);
  const suc = (id) => d.sucursales.find((s) => s.id === id)?.nombre ?? "—";
  const cs = A.consultasPaciente(d, p.id);
  const ventas = (d.ventas || []).filter((v) => v.pacienteId === p.id && v.estado !== "cancelada");
  const proxima = (d.citas || []).filter((c) => c.pacienteId === p.id && ["agendada", "por_confirmar", "confirmada"].includes(c.estado)).map((c) => c.inicio).sort()[0];
  const filas = [
    ["Expediente", `${p.folio}${p.folioManual ? ` · vigente ${p.folioManual}` : ""}`], ["Nacimiento", `${A.fechaPapel(p.nacimiento) || "—"} (${A.textoEdad(p.nacimiento)})`], ["Celular", `${p.telefono}${p.whatsapp ? " · WhatsApp" : ""}`],
    ["Correo", p.correo || "—"], ["Domicilio", [p.domicilio, p.colonia].filter(Boolean).join(", ") || "—"], ["Ocupación", p.ocupacion || "—"], ["Estado civil", p.estadoCivil ? A.etiquetaDe(A.ESTADOS_CIVILES, p.estadoCivil) : "—"],
    ["CURP", p.curp || "—"], ["Emergencia", p.emergencia?.nombre ? `${p.emergencia.nombre} · ${p.emergencia.telefono}` : "—"], ["Sucursal de registro", suc(p.sucursalAlta)], ["Cómo nos conoció", p.origen || "—"],
    p.tutor?.nombre ? ["Tutor", `${p.tutor.nombre} (${p.tutor.parentesco || "—"})${p.tutor.identificacion ? ` · ${p.tutor.identificacion}` : ""}`] : null,
  ].filter(Boolean);
  return (
    <div>
      <div className="kpis">
        <Kpi label="Consultas" valor={cs.length} />
        <Kpi label="Última visita" valor={cs[0] ? fechaLarga(cs[0].fecha) : "—"} />
        <Kpi label="Próxima cita" valor={proxima ? `${fechaLarga(proxima)} ${hora(proxima)}` : "—"} tono={proxima ? "info" : undefined} />
        <Kpi label="Compras" valor={dinero(ventas.reduce((a, v) => a + v.total, 0))} nota={`${ventas.length} ticket(s)`} />
      </div>
      <Seccion titulo="Ficha del paciente" derecha={A.puedeEditarDatos(u) && <Button variante="sec" icon="edit" onClick={() => setEd({ ...p, emergencia: { ...(p.emergencia || {}) }, tutor: p.tutor ? { ...p.tutor } : { nombre: "", parentesco: "" } })}>{p.altaRapida ? "Completar ficha" : "Editar"}</Button>}>
        <div className="resumen">{filas.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </Seccion>
      {ed && <EditarFicha d={d} u={u} p={p} f={ed} setF={setEd} />}
    </div>
  );
}

function EditarFicha({ u, p, f, setF }) {
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [err, setErr] = useState({});
  const menor = A.esMenorDeEdad(f.nacimiento);
  const guardar = () => {
    const patch = { nombres: f.nombres, apellidos: f.apellidos, nacimiento: f.nacimiento, sexo: f.sexo, telefono: f.telefono, correo: f.correo, domicilio: f.domicilio, colonia: f.colonia, ocupacion: f.ocupacion, estadoCivil: f.estadoCivil, curp: f.curp, emergencia: f.emergencia, ...(menor ? { tutor: f.tutor } : {}), ...(p.altaRapida ? { completar: true } : {}) };
    const r = mutar((x) => A.editarDatosPaciente(x, p.id, patch, u));
    if (r.ok) { aviso("Ficha actualizada", "ok"); setF(null); } else { setErr(r.errores || {}); aviso(r.error, "bad"); }
  };
  return (
    <Sheet abierto onClose={() => setF(null)} titulo={p.altaRapida ? "Completar ficha (P-003)" : "Editar ficha"} pie={<div className="dos"><Button variante="sec" block onClick={() => setF(null)}>Cancelar</Button><Button block onClick={guardar}>Guardar</Button></div>}>
      <div className="form2">
        <Field label="Nombre(s)" error={err.nombres}><Input value={f.nombres || ""} onChange={(e) => set("nombres", e.target.value)} /></Field>
        <Field label="Apellidos" error={err.apellidos}><Input value={f.apellidos || ""} onChange={(e) => set("apellidos", e.target.value)} /></Field>
        <Field label="Nacimiento" error={err.nacimiento}><Input type="date" value={f.nacimiento || ""} onChange={(e) => set("nacimiento", e.target.value)} /></Field>
        <Field label="Sexo"><Select value={f.sexo || ""} onChange={(e) => set("sexo", e.target.value)}><option value="">—</option><option value="F">Mujer</option><option value="M">Hombre</option></Select></Field>
        <Field label="Celular" error={err.telefono}><Input type="tel" value={f.telefono || ""} onChange={(e) => set("telefono", e.target.value)} /></Field>
        <Field label="Correo" error={err.correo}><Input type="email" value={f.correo || ""} onChange={(e) => set("correo", e.target.value)} /></Field>
        <Field label="Domicilio"><Input value={f.domicilio || ""} onChange={(e) => set("domicilio", e.target.value)} /></Field>
        <Field label="Colonia"><Input value={f.colonia || ""} onChange={(e) => set("colonia", e.target.value)} /></Field>
        <Field label="Ocupación"><Input value={f.ocupacion || ""} onChange={(e) => set("ocupacion", e.target.value)} /></Field>
        <Field label="Estado civil"><Select value={f.estadoCivil || ""} onChange={(e) => set("estadoCivil", e.target.value)}><option value="">—</option>{A.ESTADOS_CIVILES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="CURP" error={err.curp}><Input value={f.curp || ""} maxLength={18} onChange={(e) => set("curp", e.target.value.toUpperCase())} /></Field>
        <Field label="Contacto de emergencia"><Input value={f.emergencia?.nombre || ""} onChange={(e) => set("emergencia", { ...f.emergencia, nombre: e.target.value })} /></Field>
        <Field label="Teléfono de emergencia"><Input type="tel" value={f.emergencia?.telefono || ""} onChange={(e) => set("emergencia", { ...f.emergencia, telefono: e.target.value })} /></Field>
      </div>
      {menor && <>
        {err.tutor && <Aviso tono="bad">{err.tutor}</Aviso>}
        <div className="form2">
          <Field label="Tutor"><Input value={f.tutor?.nombre || ""} onChange={(e) => set("tutor", { ...f.tutor, nombre: e.target.value })} /></Field>
          <Field label="Parentesco"><Input value={f.tutor?.parentesco || ""} onChange={(e) => set("tutor", { ...f.tutor, parentesco: e.target.value })} /></Field>
        </div>
      </>}
    </Sheet>
  );
}

function Planes({ d, u, p }) {
  const ir = useIr();
  const planes = A.planesDe(d, p.id), ordenes = A.ordenesDe(d, p.id);
  const enlace = (key, t) => tieneRuta(u, key) && <Button variante="ghost" onClick={() => ir(key.includes("/") ? key : `mas/${key}`, { p: p.id })}>{t}</Button>;
  return (
    <div>
      <Seccion titulo={`Planes de tratamiento (${planes.length})`} derecha={enlace("planes-trat", "Abrir planes")}>
        {!planes.length && <Vacio icon="clipboard">Sin planes de tratamiento.</Vacio>}
        {planes.map((x) => <Fila key={x.id} titulo={x.descripcion || x.nombre || "Plan"} sub={`${x.sesionActual ?? "—"}/${x.sesionesTotal ?? "—"} sesiones · ${x.frecuencia || ""}`} badge={<Badge tono={x.estado === "activo" ? "info" : "neutral"}>{x.estado}</Badge>} />)}
      </Seccion>
      <Seccion titulo={`Órdenes de laboratorio (${ordenes.length})`} derecha={u.rol === "podologo" && <Button variante="ghost" onClick={() => ir("ordenes")}>Abrir órdenes</Button>}>
        {!ordenes.length && <Vacio icon="flask">Sin órdenes de plantillas u ortesis.</Vacio>}
        {ordenes.map((o) => <Fila key={o.id} titulo={`${o.folio} · ${o.tipo}`} sub={`Pie ${o.pie} · talla ${o.talla} · ${o.toma}`} datos={`Enviada ${o.enviada} · prometida ${o.prometida}`} badge={<Badge tono={o.estado === "entregada" ? "ok" : o.estado === "retrasada" ? "bad" : "info"}>{o.estado}</Badge>} />)}
      </Seccion>
      {tieneRuta(u, "pie-diabetico") && <Seccion titulo="Pie diabético" derecha={enlace("pie-diabetico", "Abrir valoración")}><p className="mu peq">Valoraciones de riesgo en su pantalla propia.</p></Seccion>}
    </div>
  );
}

function BitacoraPaciente({ d, u, p }) {
  const l = A.bitacoraAperturas(d, u, { pacienteId: p.id });
  const nombre = (id) => d.usuarios.find((x) => x.id === id)?.nombre ?? id;
  const suc = (id) => d.sucursales.find((s) => s.id === id)?.nombre ?? id;
  const ORIGEN = { expediente: "Expediente", consulta: "Consulta", dato_sensible: "Dato restringido" };
  return (
    <div>
      <p className="mu peq">{A.esAdministracion(u) ? "Todas las aperturas del expediente (P-002)." : "Tus aperturas de este expediente. La bitácora completa la revisa Administración."}</p>
      <div className="lista">
        {!l.length && <Vacio icon="shield">Sin aperturas registradas.</Vacio>}
        {l.slice(0, 80).map((a) => <Fila key={a.id} titulo={`${nombre(a.usuarioId)} · ${a.rol}`} sub={`${fechaLarga(a.fecha)} ${hora(a.fecha)} · ${suc(a.sucursalId)} · ${ORIGEN[a.origen] || a.origen}`} datos={a.motivo}
          badge={<>{a.notificaAdmin && <Badge tono="warn">Avisado a Admón.</Badge>}<Badge tono={a.origen === "dato_sensible" ? "bad" : "neutral"}>{a.alcance}</Badge></>} />)}
      </div>
      {A.esAdministracion(u) && <Seccion titulo="Impresiones">{A.emitidosDe(d, p.id).map((e) => <Fila key={e.id} titulo={`${e.folio} · ${A.TIPOS_IMPRESO[e.tipo]}`} sub={`${fechaLarga(e.fecha)} · ${nombre(e.porId)}`} badge={e.incluyeSensibles ? <Badge tono="bad">Con dato restringido</Badge> : null} />)}</Seccion>}
    </div>
  );
}
