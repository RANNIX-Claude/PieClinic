// Más · Convenios y membresías. Edición solo para recepción, admin y dirección; el resto consulta.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import { Badge, BarraAccion, Button, Field, Fila, Input, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";

const TIPOS = { asilo: "Asilo", empresa: "Empresa", aseguradora: "Aseguradora", club: "Club", membresia: "Membresía", otro: "Otro" };
const EDITORES = ["recepcion", "admin", "direccion"];

export default function Convenios() {
  const { d, u } = useSesion();
  const puede = !!u && EDITORES.includes(u.rol);
  const [edit, setEdit] = useState(null);   // null | "nuevo" | convenio
  const [ver, setVer] = useState(null);     // id
  return (
    <div className="form">
      <Titulo derecha={<Badge tono="info">{d.convenios.length}</Badge>}>Convenios y membresías</Titulo>
      <div className="lista">
        {d.convenios.map((c) => {
          const n = d.pacientes.filter((p) => p.convenioId === c.id).length;
          return <Fila key={c.id} titulo={c.nombre} sub={TIPOS[c.tipo] || c.tipo} datos={`${n} paciente${n === 1 ? "" : "s"} ligado${n === 1 ? "" : "s"}`} badge={<Badge tono={c.descuentoPct ? "ok" : "neutral"}>{c.descuentoPct}% desc.</Badge>} onClick={() => setVer(c.id)} />;
        })}
        {!d.convenios.length && <Vacio icon="tag">Aún no hay convenios.</Vacio>}
      </div>
      <div style={{ height: 70 }} />
      {puede && <BarraAccion><Button block icon="plus" onClick={() => setEdit("nuevo")}>Nuevo convenio</Button></BarraAccion>}
      {ver && <Detalle id={ver} puede={puede} onClose={() => setVer(null)} onEditar={(c) => { setVer(null); setEdit(c); }} />}
      {edit && <Edicion conv={edit === "nuevo" ? null : edit} puede={puede} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Detalle({ id, puede, onClose, onEditar }) {
  const { d, u } = useSesion();
  const [buscar, setBuscar] = useState(false);
  const c = d.convenios.find((x) => x.id === id);
  if (!c) return null;
  const ligados = d.pacientes.filter((p) => p.convenioId === id);
  const ligar = (p, convenioId) => mutar((dd) => {
    if (!u || !EDITORES.includes(u.rol)) return;
    const x = dd.pacientes.find((y) => y.id === p.id);
    if (!x) return;
    x.convenioId = convenioId;
    auditar(dd, convenioId ? "ligar_convenio" : "desligar_convenio", "paciente", p.id, `${c.nombre}`);
  });
  return (
    <Sheet abierto onClose={onClose} titulo={c.nombre} pie={puede && <div className="dos"><Button variante="sec" block icon="edit" onClick={() => onEditar(c)}>Editar</Button><Button block icon="plus" onClick={() => setBuscar(true)}>Ligar paciente</Button></div>}>
      <div className="form">
        <div><Badge tono="ok">{c.descuentoPct}% de descuento</Badge> <Badge>{TIPOS[c.tipo] || c.tipo}</Badge></div>
        <Titulo>Pacientes ligados ({ligados.length})</Titulo>
        <div className="lista">
          {ligados.map((p) => <Fila key={p.id} titulo={`${p.nombres} ${p.apellidos}`} sub={`${p.folio} · ${p.telefono}`} derecha={puede ? <Button variante="ghost" className="btn-peq" onClick={() => { ligar(p, null); aviso("Paciente desligado", "warn"); }}>Quitar</Button> : null} />)}
          {!ligados.length && <Vacio icon="users">Sin pacientes ligados.</Vacio>}
        </div>
      </div>
      <SelectorPaciente abierto={buscar} onClose={() => setBuscar(false)} titulo={`Ligar a ${c.nombre}`} onElegir={(p) => { ligar(p, id); aviso(`${p.nombres} ligado al convenio`); }} />
    </Sheet>
  );
}

function Edicion({ conv, puede, onClose }) {
  const { u } = useSesion();
  const [f, setF] = useState(conv ? { nombre: conv.nombre, tipo: conv.tipo, descuentoPct: String(conv.descuentoPct) } : { nombre: "", tipo: "empresa", descuentoPct: "10" });
  const pct = Number(f.descuentoPct);
  const valido = f.nombre.trim() && pct >= 0 && pct <= 100 && f.descuentoPct !== "";
  const guardar = () => {
    const ok = mutar((d) => {
      if (!u || !EDITORES.includes(u.rol)) return false;
      if (conv) { const c = d.convenios.find((x) => x.id === conv.id); if (!c) return false; Object.assign(c, { nombre: f.nombre.trim(), tipo: f.tipo, descuentoPct: pct }); auditar(d, "editar_convenio", "convenio", c.id, `${c.nombre} ${pct}%`); }
      else { const c = { id: uid("CV"), nombre: f.nombre.trim(), tipo: f.tipo, descuentoPct: pct }; d.convenios.push(c); auditar(d, "alta_convenio", "convenio", c.id, `${c.nombre} ${pct}%`); }
      return true;
    });
    if (ok) { aviso("Convenio guardado"); onClose(); } else aviso("Sin permiso", "bad");
  };
  return (
    <Sheet abierto onClose={onClose} titulo={conv ? "Editar convenio" : "Nuevo convenio"} pie={<Button block disabled={!valido || !puede} onClick={guardar}>Guardar</Button>}>
      <div className="form">
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        <Field label="Tipo"><Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Descuento (%)" error={f.descuentoPct !== "" && (pct < 0 || pct > 100) ? "Entre 0 y 100" : null}><Input type="number" inputMode="decimal" min={0} max={100} value={f.descuentoPct} onChange={(e) => setF({ ...f, descuentoPct: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}
