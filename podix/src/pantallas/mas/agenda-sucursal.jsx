// Agenda de la sucursal (solo lectura): un día a la vez y filtro por podólogo.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import { citasDelDia } from "../../store/selectors.js";
import { fechaLarga, hoy, hora, sumarDias } from "../../lib/format.js";
import { Badge, Button, Fila, Select, Vacio } from "../../ui/index.jsx";

const EST = { agendada: ["Agendada", "neutral"], por_confirmar: ["Por confirmar", "warn"], confirmada: ["Confirmada", "info"], en_sala: ["En sala", "info"], en_atencion: ["En atención", "ok"], atendida: ["Atendida", "ok"], no_asistio: ["No asistió", "bad"], cancelada: ["Cancelada", "neutral"] };

export default function AgendaSucursal() {
  const { d, sucursalId } = useSesion();
  const [fecha, setFecha] = useState(hoy());
  const [pod, setPod] = useState("todos");
  const citas = useMemo(() => citasDelDia(d, sucursalId, fecha), [d, sucursalId, fecha]);
  const pods = [...new Set(citas.map((c) => c.podologoId))];
  const lista = pod === "todos" ? citas : citas.filter((c) => c.podologoId === pod);
  const todosPods = useMemo(() => [...new Set(d.citas.filter((c) => c.sucursalId === sucursalId).map((c) => c.podologoId))], [d.citas, sucursalId]);
  return (
    <>
      <div className="fila-flex">
        <Button variante="ghost" icon="back" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior" />
        <div style={{ flex: 1, textAlign: "center" }}><b>{fechaLarga(fecha)}</b>{fecha === hoy() && <div className="peq mu">Hoy</div>}</div>
        <Button variante="ghost" icon="chevron" onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente" />
      </div>
      {fecha !== hoy() && <Button variante="sec" block onClick={() => setFecha(hoy())}>Volver a hoy</Button>}
      <Select value={pod} onChange={(e) => setPod(e.target.value)} aria-label="Podólogo">
        <option value="todos">Todos los podólogos ({pods.length} con citas)</option>
        {todosPods.map((p) => <option key={p} value={p}>{R.nombreUsuario(d, p)}</option>)}
      </Select>
      <div className="lista">
        {lista.map((c) => (
          <Fila key={c.id} izquierda={<b style={{ minWidth: 46 }}>{hora(c.inicio)}</b>} titulo={R.nombrePaciente(d, c.pacienteId)} sub={`${R.nombreServicio(d, c.servicioId)} · ${c.duracion} min`}
            badge={<Badge tono={EST[c.estado][1]}>{EST[c.estado][0]}</Badge>} datos={<><span>{R.nombreUsuario(d, c.podologoId)}</span><span>Consultorio {c.consultorioId}</span></>} />
        ))}
        {!lista.length && <Vacio icon="calendar">Sin citas este día.</Vacio>}
      </div>
    </>
  );
}
