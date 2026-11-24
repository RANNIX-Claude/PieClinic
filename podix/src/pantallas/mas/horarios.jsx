// Horarios, bloqueos y festivos (porte de Pie Firme: pages/comercial/Horarios.jsx · P-047).
// Gerente: edita su sucursal · Administración/Dirección: todo y parámetros · Recepción y podólogo: consulta.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Chips, Vacio } from "../../ui/index.jsx";
import { sucursalesVisibles, consulta, esCentral } from "../../store/acciones_agenda.js";
import { SelSucursal } from "../../componentes/agenda/comun.jsx";
import { HorarioSucursal, HorarioPodologos, Bloqueos, Festivos, ParametrosAgenda } from "../../componentes/agenda/horarios.jsx";

export default function Horarios() {
  const { d, u, sucursalId } = useSesion();
  const visibles = sucursalesVisibles(d, u);
  const [suc, setSuc] = useState(() => (visibles.some((s) => s.id === sucursalId) ? sucursalId : visibles[0]?.id || null));
  const [tab, setTab] = useState("sucursal");
  if (!u || !consulta(u)) return <Vacio icon="lock">Tu rol no consulta los horarios de la agenda.</Vacio>;
  const sid = visibles.some((s) => s.id === suc) ? suc : visibles[0]?.id;
  if (!sid) return <Vacio icon="building">No tienes sucursales asignadas.</Vacio>;
  const tabs = [{ v: "sucursal", l: "Sucursal" }, { v: "podologos", l: "Podólogos" }, { v: "bloqueos", l: "Bloqueos" }, { v: "festivos", l: "Festivos" }, ...(esCentral(u) ? [{ v: "params", l: "Parámetros" }] : [])];
  return (
    <div className="ag-pant">
      <div className="ag-barra"><SelSucursal sucursales={visibles} valor={sid} onChange={setSuc} /></div>
      <Chips opciones={tabs} valor={tab} onChange={setTab} scroll />
      {tab === "sucursal" && <HorarioSucursal key={sid} d={d} u={u} sucursalId={sid} />}
      {tab === "podologos" && <HorarioPodologos key={sid} d={d} u={u} sucursalId={sid} />}
      {tab === "bloqueos" && <Bloqueos key={sid} d={d} u={u} sucursalId={sid} />}
      {tab === "festivos" && <Festivos key={sid} d={d} u={u} sucursalId={sid} />}
      {tab === "params" && <ParametrosAgenda d={d} u={u} />}
    </div>
  );
}
