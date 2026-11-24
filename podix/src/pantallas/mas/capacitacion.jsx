// Capacitación: «Mis cursos» para todos; gerente y administración además gestionan cursos y ven el avance del equipo.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Chips, Vacio } from "../../ui/index.jsx";
import { esGestor } from "../../store/acciones_personas.js";
import "../../estilos_personas.css";
import { MisCursos } from "../../componentes/personas/Cursos.jsx";
import { GestionCursos, AvanceEquipo } from "../../componentes/personas/GestionCursos.jsx";

export default function Capacitacion() {
  const { d, u } = useSesion();
  const [tab, setTab] = useState("mis");
  if (!u) return null;
  const gestor = esGestor(u);
  return (
    <>
      {gestor && <Chips valor={tab} onChange={setTab} opciones={[{ v: "mis", l: "Mis cursos" }, { v: "equipo", l: "Avance del equipo" }, { v: "gestion", l: "Gestionar cursos" }]} />}
      {(!gestor || tab === "mis") && (d.rh.empleados.some((e) => e.usuarioId === u.id) ? <MisCursos d={d} u={u} /> : <Vacio icon="book">Tu cuenta no tiene ficha de empleado, por eso no hay cursos asignados. Puedes consultar el acervo.</Vacio>)}
      {gestor && tab === "equipo" && <AvanceEquipo d={d} u={u} />}
      {gestor && tab === "gestion" && <GestionCursos d={d} u={u} />}
    </>
  );
}
