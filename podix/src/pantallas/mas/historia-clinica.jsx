// Historia clínica e impresos (porte de Pie Firme: HistoriaClinica.jsx + ImprimirHistoria.jsx).
// Elegir paciente → antecedentes, dato restringido (N-04), miembro inferior (N-02), mapa del pie, seguimiento e impresos.
// Sin paciente: formatos en blanco para el consultorio.
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { Titulo, Vacio, Chips } from "../../ui/index.jsx";
import { useEffect, useState } from "react";
import { BuscadorPacientes, CabeceraPaciente, usePacienteSel } from "../../componentes/expediente/comunes.jsx";
import PanelHistoria, { PanelImpresos } from "../../componentes/expediente/Historia.jsx";
import "../../estilos_expediente.css";

export default function HistoriaClinica() {
  const { d, u, sucursalId } = useSesion();
  const [id, setId] = usePacienteSel();
  const [modo, setModo] = useState("paciente");
  const p = id ? d.pacientes.find((x) => x.id === id) : null;
  const alcance = p ? A.alcanceExpediente(d, u, sucursalId, p) : null;
  useEffect(() => {
    if (!p || !alcance || alcance === "otra" || A.abiertoHoy(d, u, p.id)) return;
    mutar((x) => A.abrirExpediente(x, p.id, u, { origen: "expediente" }));
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!A.puedeAbrirExpediente(u)) return <div className="pantalla"><Vacio icon="lock">Tu rol no consulta historias clínicas.</Vacio></div>;
  if (p && alcance === "otra" && !A.abiertoHoy(d, u, p.id)) {
    return <div className="pantalla exp"><CabeceraPaciente d={d} p={p} onCambiar={() => setId(null)} clinico={false} /><Vacio icon="lock">Paciente de otra sucursal: ábrelo primero desde «Expediente clínico» registrando el motivo (P-002).</Vacio></div>;
  }
  return (
    <div className="pantalla exp">
      <Titulo>Historia clínica e impresos</Titulo>
      {!p && <Chips opciones={[{ v: "paciente", l: "De un paciente" }, { v: "blanco", l: "Formatos en blanco" }]} valor={modo} onChange={setModo} />}
      {p ? (
        <>
          <CabeceraPaciente d={d} p={p} onCambiar={() => setId(null)} clinico={A.puedeVerClinico(u)} />
          <PanelHistoria key={p.id} d={d} u={u} p={p} />
        </>
      ) : modo === "blanco" ? <PanelImpresos d={d} u={u} p={null} /> : <BuscadorPacientes id="exp-historia" d={d} u={u} sucursalId={sucursalId} onElegir={setId} />}
    </div>
  );
}
