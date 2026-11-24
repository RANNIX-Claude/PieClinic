import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_podologo.js";
import { Card, Fila, Badge, Button, Sheet, Field, Input, Area, Confirmar, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import { AlertasClinicas } from "../../componentes/podologo/comunes.jsx";
import { fechaCorta, hora } from "../../lib/format.js";

const VACIA = { pacienteId: "", medicamento: "", dosis: "", duracion: "", indicaciones: "" };

export default function Recetas() {
  const { d, u, sucursalId } = useSesion();
  const [nueva, setNueva] = useState(false);
  const [f, setF] = useState(VACIA);
  const [selPac, setSelPac] = useState(false);
  const [det, setDet] = useState(null);
  const [forzar, setForzar] = useState(false);
  if (u.rol !== "podologo") return <Vacio icon="lock">Las recetas las emiten los podólogos.</Vacio>;

  const mias = (d.recetas || []).filter((r) => r.podologoId === u.id);
  const pac = d.pacientes.find((p) => p.id === f.pacienteId);
  const alerg = pac ? A.coincideAlergia(pac, `${f.medicamento} ${f.indicaciones}`) : null;
  const set = (p) => setF((x) => ({ ...x, ...p }));

  function emitir() {
    setForzar(false);
    const r = mutar((x) => A.crearReceta(x, f, x.usuarios.find((y) => y.id === x.sesion.userId), sucursalId));
    if (!r.ok) return aviso(r.error, "warn");
    aviso(`Receta ${r.receta.folio} emitida.`);
    setNueva(false); setF(VACIA); setDet(r.receta.id);
  }
  const intentar = () => (alerg ? setForzar(true) : emitir());
  const r = det && (d.recetas || []).find((x) => x.id === det);
  const compartir = (rec) => {
    const p = d.pacientes.find((x) => x.id === rec.pacienteId);
    window.open(A.urlWhatsApp(p?.telefono, A.textoReceta(d, rec)), "_blank", "noopener");
  };

  return (
    <>
      <Button block icon="plus" onClick={() => setNueva(true)}>Nueva receta</Button>
      <Titulo>Recetas emitidas ({mias.length})</Titulo>
      <div className="lista">{mias.map((x) => (
        <Fila key={x.id} titulo={`${x.folio} · ${R.nombrePaciente(d, x.pacienteId)}`} sub={x.medicamento} badge={x.alergiaAviso ? <Badge tono="bad">Aviso alergia</Badge> : null}
          datos={<><span>{fechaCorta(x.fecha)} {hora(x.fecha)}</span><span>{x.dosis}</span></>} onClick={() => setDet(x.id)} />
      ))}</div>
      {!mias.length && <Vacio icon="file">Aún no has emitido recetas.</Vacio>}

      <Sheet abierto={nueva} onClose={() => setNueva(false)} titulo="Nueva receta" pie={<Button block onClick={intentar}>Emitir receta</Button>}>
        <Button block variante="sec" icon="search" onClick={() => setSelPac(true)}>{pac ? `${pac.nombres} ${pac.apellidos}` : "Elegir paciente"}</Button>
        {pac && <AlertasClinicas paciente={pac} />}
        <div className="form">
          <Field label="Medicamento / indicación"><Input value={f.medicamento} onChange={(e) => set({ medicamento: e.target.value })} placeholder="Ej. Terbinafina 250 mg" /></Field>
          <Field label="Dosis"><Input value={f.dosis} onChange={(e) => set({ dosis: e.target.value })} placeholder="1 tableta cada 24 h" /></Field>
          <Field label="Duración"><Input value={f.duracion} onChange={(e) => set({ duracion: e.target.value })} placeholder="12 semanas" /></Field>
          <Field label="Indicaciones (opcional)"><Area value={f.indicaciones} onChange={(e) => set({ indicaciones: e.target.value })} /></Field>
        </div>
        {alerg && <Card tono="bad"><b>Posible alergia: {alerg}</b><div className="peq">El paciente tiene una alergia registrada que coincide con el texto de la receta.</div></Card>}
      </Sheet>
      <SelectorPaciente abierto={selPac} onClose={() => setSelPac(false)} onElegir={(p) => set({ pacienteId: p.id })} />
      <Confirmar abierto={forzar} peligro titulo="Alergia registrada" texto={`El paciente tiene alergia a "${alerg}" y coincide con la receta. ¿Emitir de todos modos? Quedará en la bitácora.`} confirmar="Emitir con aviso" onSi={emitir} onNo={() => setForzar(false)} />

      <Sheet abierto={!!r} onClose={() => setDet(null)} titulo={r ? r.folio : ""} pie={r && <Button block variante="ok" icon="send" onClick={() => compartir(r)}>Compartir por WhatsApp</Button>}>
        {r && <>{r.alergiaAviso && <Card tono="bad"><span className="peq">Emitida con aviso de alergia ({r.alergiaAviso}).</span></Card>}
          <Card><pre style={{ margin: 0, whiteSpace: "pre-wrap", font: "inherit" }}>{A.textoReceta(d, r)}</pre></Card></>}
      </Sheet>
    </>
  );
}
