// Recursos humanos (estilo IRP): pestañas Empleados · Asistencia · Horarios · Incidencias · Vacaciones · Nómina · Movimientos.
// Gerente: su sucursal. Administración/dirección: todas, con filtro.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Chips, Vacio } from "../../ui/index.jsx";
import { esGestor, esAdmin, sucursalesVisibles } from "../../store/acciones_personas.js";
import { SelectorSuc } from "../../componentes/personas/comunes.jsx";
import Empleados from "../../componentes/personas/Empleados.jsx";
import { Asistencia, Horarios } from "../../componentes/personas/Asistencia.jsx";
import { Incidencias, Vacaciones } from "../../componentes/personas/Incidencias.jsx";
import { Nomina, Movimientos } from "../../componentes/personas/Nomina.jsx";

const TABS = [["empleados", "Empleados"], ["asistencia", "Asistencia"], ["horarios", "Horarios"], ["incidencias", "Incidencias"], ["vacaciones", "Vacaciones"], ["nomina", "Nómina"], ["movimientos", "Movimientos"]];

export default function RH() {
  const { d, u, sucursalId } = useSesion();
  const [tab, setTab] = useState("empleados");
  const visibles = u ? sucursalesVisibles(d, u) : [];
  const [suc, setSuc] = useState(() => (u && !esAdmin(u) ? (visibles.includes(sucursalId) ? sucursalId : visibles[0]) : null));
  if (!u || !esGestor(u)) return <Vacio icon="lock">Recursos humanos es para gerentes y administración. Tu registro de entrada y tu capacitación están en «Más».</Vacio>;

  const sucursalFiltro = esAdmin(u) ? suc : (suc && visibles.includes(suc) ? suc : visibles[0]);
  // Empleados que esta persona ve: de la sucursal elegida, o de todas las suyas.
  const alcance = sucursalFiltro ? [sucursalFiltro] : visibles;
  const empleados = d.rh.empleados.filter((e) => e.sucursales.some((s) => alcance.includes(s)) || (esAdmin(u) && !sucursalFiltro));
  const p = { d, u, sucursalFiltro, visibles: esAdmin(u) ? ["CEN", ...visibles] : visibles, empleados };

  return (
    <>
      {(esAdmin(u) || visibles.length > 1) && <SelectorSuc d={d} opciones={visibles} valor={sucursalFiltro} onChange={setSuc} todas={esAdmin(u)} />}
      <Chips scroll valor={tab} onChange={setTab} opciones={TABS.map(([v, l]) => ({ v, l }))} />
      {tab === "empleados" && <Empleados {...p} />}
      {tab === "asistencia" && <Asistencia {...p} />}
      {tab === "horarios" && <Horarios {...p} />}
      {tab === "incidencias" && <Incidencias {...p} />}
      {tab === "vacaciones" && <Vacaciones {...p} />}
      {tab === "nomina" && <Nomina {...p} />}
      {tab === "movimientos" && <Movimientos {...p} />}
    </>
  );
}
