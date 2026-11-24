// Alertas priorizadas de la sucursal, con chips por tipo y la acción sugerida.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { alertasSucursal } from "../../store/acciones_gerente.js";
import { Badge, Card, Chips, Icon, Vacio } from "../../ui/index.jsx";

const TIPOS = { stock: ["Stock", "box"], apartado: ["Apartados", "bookmark"], laboratorio: ["Laboratorio", "flask"], caja: ["Caja", "cash"], esterilizacion: ["Esteriliz.", "sparkle"] };
const PRI = { 1: ["Alta", "bad"], 2: ["Media", "warn"], 3: ["Baja", "info"] };

export default function Alertas() {
  const { d, sucursalId } = useSesion();
  const [f, setF] = useState("todas");
  const todas = useMemo(() => alertasSucursal(d, sucursalId), [d, sucursalId]);
  const lista = f === "todas" ? todas : todas.filter((a) => a.tipo === f);
  return (
    <>
      <Chips scroll valor={f} onChange={setF} opciones={[{ v: "todas", l: "Todas", n: todas.length }, ...Object.entries(TIPOS).map(([v, [l]]) => ({ v, l, n: todas.filter((a) => a.tipo === v).length }))]} />
      <div className="lista">
        {lista.map((a) => (
          <Card key={a.id} tono={a.prioridad === 1 ? "bad" : a.prioridad === 2 ? "warn" : "info"}>
            <div className="fila-t"><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name={TIPOS[a.tipo][1]} size={18} />{a.titulo}</span><Badge tono={PRI[a.prioridad][1]}>{PRI[a.prioridad][0]}</Badge></div>
            <div style={{ marginTop: 4 }}>{a.dato}</div>
            <div className="peq mu" style={{ marginTop: 6 }}><b>Qué hacer:</b> {a.accion}</div>
          </Card>
        ))}
        {!lista.length && <Vacio icon="check">Sin alertas en esta categoría. Todo en orden.</Vacio>}
      </div>
    </>
  );
}
