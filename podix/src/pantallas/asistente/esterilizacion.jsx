// Asistente · Esterilización (tab central): sets, ciclos de autoclave, falla y trazabilidad por paciente.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import { siguienteFolioCiclo, resultadoCiclo, loteAuto, ROLES_ASISTENTE } from "../../store/logica_recepcion.js";
import { Badge, BarraAccion, Button, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { fechaCorta, hora, hoy, ahoraLocal } from "../../lib/format.js";
import * as R from "../../store/reglas.js";

const TONO_RES = { conforme: "ok", no_conforme: "bad", pendiente: "warn" };
const TXT = { conforme: "Conforme", no_conforme: "No conforme", pendiente: "Pendiente" };

export default function Esterilizacion() {
  const { d, u, sucursalId } = useSesion();
  const [vista, setVista] = useState("sets");
  const [nuevo, setNuevo] = useState(false);
  const [ciclo, setCiclo] = useState(null);
  const [set, setSet] = useState(null);
  const [asignar, setAsignar] = useState(false);
  const puede = !!u && ROLES_ASISTENTE.includes(u.rol);

  const sets = d.sets.filter((s) => s.sucursalId === sucursalId);
  const ciclos = d.ciclos.filter((c) => c.sucursalId === sucursalId).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sucios = sets.filter((s) => s.estado === "sucio").length;
  const bioPend = ciclos.filter((c) => c.indicadorBiologico === "pendiente").length;

  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Sets sucios" valor={sucios} tono={sucios ? "warn" : "ok"} />
        <Kpi label="Esterilizados" valor={sets.length - sucios} />
        <Kpi label="Biológico pendiente" valor={bioPend} tono={bioPend ? "warn" : undefined} />
      </div>
      <Chips valor={vista} onChange={setVista} opciones={[{ v: "sets", l: "Sets", n: sets.length }, { v: "ciclos", l: "Ciclos", n: ciclos.length }, { v: "traza", l: "Trazabilidad" }]} />

      {vista === "sets" && <div className="lista">
        {sets.map((s) => <Fila key={s.id} titulo={s.nombre} sub={s.estado === "sucio" ? "Pendiente de esterilizar" : "Listo para usar"} badge={<Badge tono={s.estado === "sucio" ? "warn" : "ok"}>{s.estado === "sucio" ? "Sucio" : "Esterilizado"}</Badge>} onClick={() => setSet(s.id)} />)}
        {!sets.length && <Vacio icon="sparkle">Esta sucursal no tiene sets registrados.</Vacio>}
      </div>}

      {vista === "ciclos" && <div className="lista">
        {ciclos.slice(0, 30).map((c) => (
          <Fila key={c.id} titulo={c.folio} sub={`${c.autoclave} · lote ${c.lote} · ${fechaCorta(c.fecha)} ${hora(c.fecha)}`} datos={`${c.sets.length} set(s) · biológico ${TXT[c.indicadorBiologico] || c.indicadorBiologico}`} badge={<Badge tono={TONO_RES[c.resultado]}>{TXT[c.resultado]}</Badge>} onClick={() => setCiclo(c.id)} />
        ))}
        {!ciclos.length && <Vacio icon="sparkle">Sin ciclos registrados.</Vacio>}
      </div>}

      {vista === "traza" && <>
        <Button block icon="plus" disabled={!puede} onClick={() => setAsignar(true)}>Asignar set a un paciente de hoy</Button>
        <Titulo>Últimos usos</Titulo>
        <div className="lista">
          {(d.usoSets || []).filter((x) => d.sets.find((s) => s.id === x.setId && s.sucursalId === sucursalId)).slice().reverse().slice(0, 25).map((x) => (
            <Fila key={x.id} titulo={`${(d.sets.find((s) => s.id === x.setId) || {}).nombre || x.setId} → ${R.nombrePaciente(d, x.pacienteId)}`} sub={`Ciclo ${x.cicloFolio || "—"} · consultorio ${x.consultorio}`} datos={`${fechaCorta(x.fecha)} ${hora(x.fecha)}`} />
          ))}
          {!(d.usoSets || []).some((x) => d.sets.find((s) => s.id === x.setId && s.sucursalId === sucursalId)) && <Vacio icon="file">Aún no hay usos registrados.</Vacio>}
        </div>
      </>}

      <div style={{ height: 70 }} />
      <BarraAccion><Button block icon="sparkle" disabled={!puede} onClick={() => setNuevo(true)}>Registrar ciclo de autoclave</Button></BarraAccion>
      {nuevo && <NuevoCiclo onClose={() => setNuevo(false)} />}
      {ciclo && <DetalleCiclo id={ciclo} puede={puede} onClose={() => setCiclo(null)} />}
      {set && <DetalleSet id={set} onClose={() => setSet(null)} />}
      {asignar && <AsignarSet onClose={() => setAsignar(false)} />}
    </div>
  );
}

function NuevoCiclo({ onClose }) {
  const { d, u, sucursalId } = useSesion();
  const sucios = d.sets.filter((s) => s.sucursalId === sucursalId && s.estado === "sucio");
  const nCiclos = d.ciclos.filter((c) => c.sucursalId === sucursalId && c.fecha.slice(0, 10) === hoy()).length;
  const [f, setF] = useState({ autoclave: "AC-1", lote: loteAuto(hoy(), nCiclos), quimico: "conforme", biologico: "pendiente" });
  const [sel, setSel] = useState(sucios.map((s) => s.id));
  const res = resultadoCiclo(f.quimico, f.biologico);
  const alt = (id) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const guardar = () => {
    const r = mutar((dd) => {
      if (!u || !ROLES_ASISTENTE.includes(u.rol)) return null;
      const folio = siguienteFolioCiclo(dd.ciclos);
      dd.contadores.CIC = Number(folio.replace(/\D/g, ""));
      const c = { id: uid("CC"), folio, sucursalId, autoclave: f.autoclave, lote: f.lote.trim(), indicadorQuimico: f.quimico, indicadorBiologico: f.biologico, responsableId: u.id, fecha: ahoraLocal(), sets: sel.slice(), resultado: res };
      dd.ciclos.push(c);
      if (res === "conforme") dd.sets.forEach((s) => { if (sel.includes(s.id) && s.sucursalId === sucursalId) s.estado = "esterilizado"; });
      auditar(dd, "registrar_ciclo", "ciclo", c.id, `${folio} ${res} ${sel.length} sets`);
      return { folio, res };
    });
    if (!r) return aviso("Sin permiso", "bad");
    aviso(r.res === "conforme" ? `${r.folio}: ${sel.length} set(s) esterilizados` : `${r.folio}: no conforme, los sets siguen sucios`, r.res === "conforme" ? "ok" : "warn");
    onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Registrar ciclo" pie={<Button block disabled={!sel.length || !f.lote.trim()} onClick={guardar}>Guardar ciclo</Button>}>
      <div className="form">
        <Field label="Autoclave"><Select value={f.autoclave} onChange={(e) => setF({ ...f, autoclave: e.target.value })}><option>AC-1</option><option>AC-2</option></Select></Field>
        <Field label="Lote"><Input value={f.lote} onChange={(e) => setF({ ...f, lote: e.target.value })} /></Field>
        <div className="dos">
          <Field label="Indicador químico"><Select value={f.quimico} onChange={(e) => setF({ ...f, quimico: e.target.value })}><option value="conforme">Conforme</option><option value="no_conforme">No conforme</option></Select></Field>
          <Field label="Indicador biológico (semanal)"><Select value={f.biologico} onChange={(e) => setF({ ...f, biologico: e.target.value })}><option value="pendiente">Pendiente</option><option value="conforme">Conforme</option><option value="no_conforme">No conforme</option></Select></Field>
        </div>
        <Titulo derecha={<Badge tono={TONO_RES[res]}>{res === "conforme" ? "Libera sets" : "No libera"}</Badge>}>Sets sucios</Titulo>
        <div className="lista">
          {sucios.map((s) => <Fila key={s.id} titulo={s.nombre} sub="Sucio" badge={<Badge tono={sel.includes(s.id) ? "ok" : "neutral"}>{sel.includes(s.id) ? "Incluido" : "Fuera"}</Badge>} onClick={() => alt(s.id)} />)}
          {!sucios.length && <Vacio icon="check">No hay sets sucios por esterilizar.</Vacio>}
        </div>
      </div>
    </Sheet>
  );
}

function DetalleCiclo({ id, puede, onClose }) {
  const { d, u } = useSesion();
  const c = d.ciclos.find((x) => x.id === id);
  const [motivo, setMotivo] = useState("");
  const [falla, setFalla] = useState(false);
  if (!c) return null;
  const usos = (d.usoSets || []).filter((x) => x.cicloId === c.id);
  const bio = (valor) => mutar((dd) => {
    if (!u || !ROLES_ASISTENTE.includes(u.rol)) return;
    const x = dd.ciclos.find((y) => y.id === id); x.indicadorBiologico = valor;
    if (valor === "no_conforme") { x.resultado = "no_conforme"; dd.sets.forEach((s) => { if (x.sets.includes(s.id)) s.estado = "sucio"; }); }
    auditar(dd, "indicador_biologico", "ciclo", id, valor);
  });
  const reportar = () => {
    mutar((dd) => {
      if (!u || !ROLES_ASISTENTE.includes(u.rol)) return;
      const x = dd.ciclos.find((y) => y.id === id);
      x.resultado = "no_conforme"; x.falla = { motivo: motivo.trim(), por: u.id, en: ahoraLocal() };
      dd.sets.forEach((s) => { if (x.sets.includes(s.id)) s.estado = "sucio"; });
      auditar(dd, "reportar_falla_ciclo", "ciclo", id, motivo.trim());
    });
    aviso("Falla reportada: los sets regresan a sucio", "warn"); setFalla(false); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo={c.folio} pie={puede && c.resultado !== "no_conforme" && <Button variante="danger" block icon="alert" onClick={() => setFalla(true)}>Reportar falla</Button>}>
      <div className="form">
        <Resumen filas={[["Fecha", `${fechaCorta(c.fecha)} ${hora(c.fecha)}`], ["Autoclave", c.autoclave], ["Lote", c.lote], ["Químico", TXT[c.indicadorQuimico]], ["Biológico", TXT[c.indicadorBiologico] || c.indicadorBiologico], ["Responsable", R.nombreUsuario(d, c.responsableId).replace(/\s*\(.*\)/, "")], ["Resultado", TXT[c.resultado], true], c.falla && ["Falla", c.falla.motivo]]} />
        <Titulo>Sets del ciclo</Titulo>
        <div className="chips">{c.sets.map((s) => <Badge key={s}>{(d.sets.find((x) => x.id === s) || {}).nombre || s}</Badge>)}</div>
        {c.indicadorBiologico === "pendiente" && puede && <div className="dos"><Button variante="sec" block onClick={() => bio("conforme")}>Biológico conforme</Button><Button variante="danger" block onClick={() => { bio("no_conforme"); aviso("Biológico no conforme: sets a sucio", "warn"); }}>No conforme</Button></div>}
        <Titulo>Pacientes con sets de este ciclo ({usos.length})</Titulo>
        <div className="lista">{usos.map((x) => <Fila key={x.id} titulo={R.nombrePaciente(d, x.pacienteId)} sub={`Consultorio ${x.consultorio}`} datos={`${fechaCorta(x.fecha)} ${hora(x.fecha)}`} />)}{!usos.length && <Vacio icon="users">Sin usos registrados.</Vacio>}</div>
      </div>
      <Sheet abierto={falla} onClose={() => setFalla(false)} titulo="Reportar falla" pie={<Button variante="danger" block disabled={!motivo.trim()} onClick={reportar}>Marcar no conforme</Button>}>
        <Field label="¿Qué falló?"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Indicador sin viraje, bolsa húmeda" /></Field>
        <p className="mu peq">El ciclo queda no conforme y sus {c.sets.length} set(s) regresan a sucio.</p>
      </Sheet>
    </Sheet>
  );
}

function DetalleSet({ id, onClose }) {
  const { d } = useSesion();
  const s = d.sets.find((x) => x.id === id);
  if (!s) return null;
  const ciclos = d.ciclos.filter((c) => c.sets.includes(id)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const usos = (d.usoSets || []).filter((x) => x.setId === id).slice().reverse();
  return (
    <Sheet abierto onClose={onClose} titulo={s.nombre}>
      <div className="form">
        <Badge tono={s.estado === "sucio" ? "warn" : "ok"}>{s.estado === "sucio" ? "Sucio" : "Esterilizado"}</Badge>
        <Titulo>Ciclos recientes</Titulo>
        <div className="lista">{ciclos.slice(0, 6).map((c) => <Fila key={c.id} titulo={c.folio} sub={`${c.autoclave} · lote ${c.lote}`} datos={fechaCorta(c.fecha)} badge={<Badge tono={TONO_RES[c.resultado]}>{TXT[c.resultado]}</Badge>} />)}{!ciclos.length && <Vacio>Sin ciclos.</Vacio>}</div>
        <Titulo>Pacientes atendidos con este set</Titulo>
        <div className="lista">{usos.map((x) => <Fila key={x.id} titulo={R.nombrePaciente(d, x.pacienteId)} sub={`Ciclo ${x.cicloFolio || "—"} · consultorio ${x.consultorio}`} datos={`${fechaCorta(x.fecha)} ${hora(x.fecha)}`} />)}{!usos.length && <Vacio icon="users">Sin usos registrados.</Vacio>}</div>
      </div>
    </Sheet>
  );
}

function AsignarSet({ onClose }) {
  const { d, u, sucursalId } = useSesion();
  const libres = d.sets.filter((s) => s.sucursalId === sucursalId && s.estado === "esterilizado");
  const citas = d.citas.filter((c) => c.sucursalId === sucursalId && c.inicio.slice(0, 10) === hoy() && !["cancelada", "no_asistio"].includes(c.estado)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const [setId, setSetId] = useState("");
  const [citaId, setCitaId] = useState("");
  const guardar = () => {
    const r = mutar((dd) => {
      if (!u || !ROLES_ASISTENTE.includes(u.rol)) return false;
      const s = dd.sets.find((x) => x.id === setId), c = dd.citas.find((x) => x.id === citaId);
      if (!s || !c || s.estado !== "esterilizado") return false;
      const ciclo = dd.ciclos.filter((x) => x.sets.includes(s.id) && x.resultado === "conforme").sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      (dd.usoSets ||= []).push({ id: uid("US"), setId: s.id, cicloId: ciclo ? ciclo.id : null, cicloFolio: ciclo ? ciclo.folio : null, pacienteId: c.pacienteId, citaId: c.id, consultorio: c.consultorioId, fecha: ahoraLocal() });
      s.estado = "sucio"; // tras usarse el set queda pendiente de esterilizar
      auditar(dd, "uso_set", "set", s.id, `${R.nombrePaciente(dd, c.pacienteId)} · ${ciclo ? ciclo.folio : "sin ciclo"}`);
      return true;
    });
    if (r) { aviso("Set asignado; queda pendiente de esterilizar"); onClose(); } else aviso("No se pudo asignar", "bad");
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Asignar set a paciente" pie={<Button block disabled={!setId || !citaId} onClick={guardar}>Asignar</Button>}>
      <div className="form">
        <Field label="Set esterilizado"><Select value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">Elegir…</option>{libres.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
        {!libres.length && <div className="card card-warn">No hay sets esterilizados disponibles.</div>}
        <Field label="Cita de hoy"><Select value={citaId} onChange={(e) => setCitaId(e.target.value)}><option value="">Elegir…</option>{citas.map((c) => <option key={c.id} value={c.id}>{hora(c.inicio)} · {R.nombrePaciente(d, c.pacienteId)} · {c.consultorioId}</option>)}</Select></Field>
      </div>
    </Sheet>
  );
}
