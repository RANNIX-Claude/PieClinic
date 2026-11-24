import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Avatar, Badge, Button, Card, Chips, Field, Fila, Input, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import { hoy, hora, dia, fechaCorta } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { podologos, dondeEstaHoy, asignarSucursales, citasFuturasEn, conflictosRotacion } from "../../store/acciones_admin.js";
import { SelectorSucursal, Nota } from "../../componentes/admin/comunes.jsx";

const ESTADO = { agendada: ["Agendada", "neutral"], por_confirmar: ["Por confirmar", "warn"], confirmada: ["Confirmada", "info"], en_sala: ["En sala", "info"], en_atencion: ["En atención", "ok"], atendida: ["Atendida", "ok"], no_asistio: ["No asistió", "bad"], cancelada: ["Cancelada", "neutral"] };

export default function Rotacion() {
  const { d } = useSesion();
  const [vista, setVista] = useState("pods");
  const [fecha, setFecha] = useState(hoy());
  const [suc, setSuc] = useState(d.sucursales[0].id);
  const [ed, setEd] = useState(null); // { id, sucursales }
  const pods = useMemo(() => podologos(d), [d]);
  const conflictos = useMemo(() => conflictosRotacion(d, fecha), [d, fecha]);
  const enConflicto = new Set(conflictos.flatMap((c) => [c.a.id, c.b.id]));
  const citasSuc = d.citas.filter((c) => c.sucursalId === suc && dia(c.inicio) === fecha && c.estado !== "cancelada").sort((a, b) => a.inicio.localeCompare(b.inicio));
  const sn = (id) => R.nombreSucursal(d, id);
  const pEd = ed ? d.usuarios.find((x) => x.id === ed.id) : null;
  const quitadas = pEd ? pEd.sucursales.filter((s) => !ed.sucursales.includes(s)) : [];
  const futuras = pEd ? quitadas.reduce((a, s) => a + citasFuturasEn(d, pEd.id, s), 0) : 0;

  const marcar = (id) => setEd({ ...ed, sucursales: ed.sucursales.includes(id) ? ed.sucursales.filter((x) => x !== id) : ed.sucursales.length >= 3 ? ed.sucursales : [...ed.sucursales, id] });
  const guardar = () => {
    const r = mutar((x) => asignarSucursales(x, ed.id, ed.sucursales));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Rotación actualizada."); setEd(null);
  };
  const Dia = <Field label="Día"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoy())} /></Field>;

  return (
    <>
      <Chips opciones={[{ v: "pods", l: "Podólogos" }, { v: "agenda", l: "Agenda" }, { v: "conf", l: "Conflictos", n: conflictos.length }]} valor={vista} onChange={setVista} />

      {vista === "pods" && (
        <div className="lista">
          {pods.map((p) => {
            const h = dondeEstaHoy(d, p.id, hoy());
            return <Fila key={p.id} izquierda={<Avatar nombre={p.nombre} />} titulo={p.nombre} badge={p.activo === false ? <Badge tono="bad">Inactivo</Badge> : null}
              sub={p.sucursales.map(sn).join(" · ")}
              datos={<span>{h.sucursalId ? `Hoy: ${sn(h.sucursalId)} · ${h.citas} cita${h.citas > 1 ? "s" : ""}${h.sucursales.length > 1 ? " (varias sucursales)" : ""}` : "Hoy: sin citas"}</span>}
              onClick={() => setEd({ id: p.id, sucursales: [...p.sucursales] })} />;
          })}
          {!pods.length && <Vacio icon="users">Sin podólogos.</Vacio>}
        </div>
      )}

      {vista === "agenda" && (<>
        <div className="dos"><SelectorSucursal d={d} valor={suc} onChange={setSuc} />{Dia}</div>
        <div className="lista">
          {citasSuc.map((c) => { const [l, t] = ESTADO[c.estado] || [c.estado, "neutral"]; return (
            <Fila key={c.id} titulo={`${hora(c.inicio)} · ${R.nombreUsuario(d, c.podologoId)}`} badge={<Badge tono={t}>{l}</Badge>}
              sub={`${R.nombreServicio(d, c.servicioId)} · ${R.nombrePaciente(d, c.pacienteId)}`}
              datos={<><span>{c.consultorioId}</span><span>{c.duracion} min</span>{enConflicto.has(c.id) && <Badge tono="bad">Conflicto</Badge>}</>} />
          ); })}
          {!citasSuc.length && <Vacio icon="calendar">Sin citas en {sn(suc)} el {fechaCorta(fecha)}.</Vacio>}
        </div>
      </>)}

      {vista === "conf" && (<>
        {Dia}
        <div className="lista">
          {conflictos.map((c, i) => (
            <Card key={i} tono="bad">
              <b>{R.nombreUsuario(d, c.podologoId)}</b>
              <p className="txt peq" style={{ margin: "4px 0 0" }}>{c.tipo === "sucursales" ? "Citas traslapadas en sucursales distintas" : "Doble reserva en la misma sucursal"}</p>
              <div className="fila-d"><span>{hora(c.a.inicio)} · {sn(c.a.sucursalId)} ({c.a.consultorioId})</span><span>{hora(c.b.inicio)} · {sn(c.b.sucursalId)} ({c.b.consultorioId})</span></div>
            </Card>
          ))}
          {!conflictos.length && <Vacio icon="check">Sin conflictos de agenda el {fechaCorta(fecha)}.</Vacio>}
        </div>
      </>)}

      <Sheet abierto={!!ed} onClose={() => setEd(null)} titulo={pEd ? pEd.nombre : ""}
        pie={ed && <Button block disabled={ed.sucursales.length < 1} onClick={guardar}>Guardar rotación</Button>}>
        {ed && (<>
          <p className="txt">Elige de 1 a 3 sucursales donde puede trabajar.</p>
          {d.sucursales.map((s) => {
            const on = ed.sucursales.includes(s.id);
            return <label key={s.id} className="fila-flex" style={{ minHeight: 44, opacity: !on && ed.sucursales.length >= 3 ? 0.5 : 1 }}>
              <input type="checkbox" checked={on} disabled={!on && ed.sucursales.length >= 3} onChange={() => marcar(s.id)} style={{ width: 22, height: 22 }} /> {s.nombre}</label>;
          })}
          {ed.sucursales.length < 1 && <Nota>Asigna al menos una sucursal.</Nota>}
          {futuras > 0 && <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}>Tiene {futuras} cita(s) futura(s) en sucursales que le quitas. Siguen agendadas: reprográmalas desde Recepción.</p></Card>}
        </>)}
      </Sheet>
    </>
  );
}
