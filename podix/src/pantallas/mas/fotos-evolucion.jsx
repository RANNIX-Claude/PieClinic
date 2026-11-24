// Fotos clínicas y evolución (porte de Pie Firme: CompararFotos.jsx + SubirFotoClinica.jsx). P-007 a P-009.
import { useEffect } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { Titulo, Vacio } from "../../ui/index.jsx";
import { BuscadorPacientes, CabeceraPaciente, usePacienteSel } from "../../componentes/expediente/comunes.jsx";
import PanelFotos from "../../componentes/expediente/Fotos.jsx";
import "../../estilos_expediente.css";

export default function FotosEvolucion() {
  const { d, u, sucursalId } = useSesion();
  const [id, setId, sp] = usePacienteSel();
  const p = id ? d.pacientes.find((x) => x.id === id) : null;
  const alcance = p ? A.alcanceExpediente(d, u, sucursalId, p) : null;
  useEffect(() => {
    if (!p || !alcance || alcance === "otra" || A.abiertoHoy(d, u, p.id)) return;
    mutar((x) => A.abrirExpediente(x, p.id, u));
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!A.puedeVerFotos(u)) return <div className="pantalla"><Vacio icon="lock">Las fotos clínicas solo las ven Podología y Administración.</Vacio></div>;
  if (p && alcance === "otra" && !A.abiertoHoy(d, u, p.id)) return <div className="pantalla exp"><CabeceraPaciente d={d} p={p} onCambiar={() => setId(null)} clinico={false} /><Vacio icon="lock">Paciente de otra sucursal: ábrelo primero desde «Expediente clínico» registrando el motivo (P-002).</Vacio></div>;
  return (
    <div className="pantalla exp">
      <Titulo>Fotos y evolución</Titulo>
      {p ? (
        <>
          <CabeceraPaciente d={d} p={p} onCambiar={() => setId(null)} clinico />
          <PanelFotos key={p.id} d={d} u={u} p={p} inicial={sp.get("ver") === "comparar" ? "comparar" : sp.get("ver") === "subir" ? "subir" : "sesiones"} />
        </>
      ) : <BuscadorPacientes id="exp-fotos" d={d} u={u} sucursalId={sucursalId} onElegir={setId} />}
    </div>
  );
}
