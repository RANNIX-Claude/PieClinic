// Recepción · Sala: citas de hoy por etapa (por llegar / en sala / en atención / atendidas).
import { useEffect, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar } from "../../store/core.js";
import { minutosEspera } from "../../store/logica_recepcion.js";
import { Badge, Button, Kpi, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { CitaFila, AccionesCita, permite } from "../../componentes/recepcion/comun.jsx";
import { hoy, ahoraLocal, hora } from "../../lib/format.js";

const POR_LLEGAR = ["agendada", "por_confirmar", "confirmada"];

function mover(u, id, de, a, campo) {
  return mutar((d) => {
    if (!permite(u)) return false;
    const c = d.citas.find((x) => x.id === id);
    if (!c || !de.includes(c.estado)) return false;
    c.estado = a; if (campo) c[campo] = ahoraLocal();
    auditar(d, a === "en_sala" ? "marcar_llegada" : "pasar_consultorio", "cita", id, `${c.consultorioId}`);
    return true;
  });
}

export default function Sala() {
  const { d, u, sucursalId } = useSesion();
  const [, tick] = useState(0);
  const [abierta, setAbierta] = useState(null);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const ahora = ahoraLocal();
  const dehoy = d.citas.filter((c) => c.sucursalId === sucursalId && c.inicio.slice(0, 10) === hoy()).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const grupo = (est) => dehoy.filter((c) => est.includes(c.estado));
  const porLlegar = grupo(POR_LLEGAR), enSala = grupo(["en_sala"]).sort((a, b) => String(a.llegada).localeCompare(String(b.llegada))), enAtencion = grupo(["en_atencion"]), atendidas = grupo(["atendida"]);

  const Seccion = ({ titulo, lista, vacio, render }) => (
    <>
      <Titulo derecha={<Badge tono={lista.length ? "info" : "neutral"}>{lista.length}</Badge>}>{titulo}</Titulo>
      <div className="lista">{lista.map(render)}{!lista.length && <div className="mu peq" style={{ padding: "4px 2px" }}>{vacio}</div>}</div>
    </>
  );
  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Por llegar" valor={porLlegar.length} />
        <Kpi label="En sala" valor={enSala.length} tono={enSala.length ? "warn" : undefined} />
        <Kpi label="En atención" valor={enAtencion.length} />
        <Kpi label="Atendidas" valor={atendidas.length} />
      </div>
      <Seccion titulo="Por llegar" lista={porLlegar} vacio="Nadie pendiente de llegar." render={(c) => (
        <div key={c.id}><CitaFila d={d} c={c} onClick={() => setAbierta(c)} />
          <div style={{ marginTop: 4 }}><Button block icon="check" disabled={!permite(u)} onClick={() => mover(u, c.id, POR_LLEGAR, "en_sala", "llegada") && aviso("Llegada registrada")}>Marcar llegada</Button></div></div>
      )} />
      <Seccion titulo="En sala" lista={enSala} vacio="Sala de espera vacía." render={(c) => {
        const m = minutosEspera(c.llegada, ahora);
        return (
          <div key={c.id}><CitaFila d={d} c={c} onClick={() => setAbierta(c)} extra={`espera ${m} min`} />
            <div style={{ marginTop: 4, display: "grid", gap: 4 }}>
              <div><Badge tono={m > 20 ? "bad" : m > 10 ? "warn" : "ok"}>Esperando {m} min · llegó {hora(c.llegada || ahora)}</Badge></div>
              <Button block icon="chevron" disabled={!permite(u)} onClick={() => mover(u, c.id, ["en_sala"], "en_atencion", "inicioAtencion") && aviso(`Pasa al consultorio ${c.consultorioId}`)}>Pasar a consultorio {c.consultorioId}</Button>
            </div></div>
        );
      }} />
      <Seccion titulo="En atención" lista={enAtencion} vacio="Ninguna consulta en curso." render={(c) => <CitaFila key={c.id} d={d} c={c} onClick={() => setAbierta(c)} />} />
      <Seccion titulo="Atendidas" lista={atendidas} vacio="Aún sin pacientes atendidos." render={(c) => <CitaFila key={c.id} d={d} c={c} onClick={() => setAbierta(c)} />} />
      <AccionesCita cita={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
