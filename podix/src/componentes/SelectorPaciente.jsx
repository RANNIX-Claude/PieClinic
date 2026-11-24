// Buscador de pacientes en hoja inferior (listas largas → buscador, según el estándar móvil).
//   <SelectorPaciente abierto onClose onElegir={(paciente) => …} />
import { useMemo, useState } from "react";
import { useStore } from "../store/core.js";
import { normaliza } from "../lib/format.js";
import { Avatar, Buscador, Fila, Sheet, Vacio, useDebounced, Badge } from "../ui/index.jsx";

export function filtrarPacientes(pacientes, q, max = 30) {
  const n = normaliza(q).trim();
  if (!n) return pacientes.slice(0, max);
  return pacientes.filter((p) => normaliza(`${p.nombres} ${p.apellidos} ${p.folio} ${p.telefono}`).includes(n)).slice(0, max);
}

export default function SelectorPaciente({ abierto, onClose, onElegir, titulo = "Buscar paciente" }) {
  const d = useStore();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const lista = useMemo(() => filtrarPacientes(d.pacientes, dq), [d.pacientes, dq]);
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={titulo}>
      <Buscador valor={q} onChange={setQ} placeholder="Nombre, teléfono o folio EXP-…" />
      <div className="lista">
        {lista.map((p) => (
          <Fila key={p.id} izquierda={<Avatar nombre={`${p.nombres} ${p.apellidos}`} />} titulo={`${p.nombres} ${p.apellidos}`} sub={`${p.folio} · ${p.telefono}`}
            badge={p.alertas[0] ? <Badge tono="warn">{p.alertas[0]}</Badge> : null} onClick={() => { onElegir(p); onClose(); setQ(""); }} />
        ))}
        {!lista.length && <Vacio>Sin coincidencias en las 7 sucursales.</Vacio>}
      </div>
    </Sheet>
  );
}
