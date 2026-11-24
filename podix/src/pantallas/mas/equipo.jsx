// Equipo de la sucursal por rol y rotación de podólogos (dónde está cada uno hoy, según sus citas).
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import { equipoSucursal, ubicacionHoy } from "../../store/acciones_gerente.js";
import { NOMBRE_ROL } from "../../config/roles.js";
import { Avatar, Badge, Chips, Fila, Titulo, Vacio } from "../../ui/index.jsx";

export default function Equipo() {
  const { d, sucursalId } = useSesion();
  const [f, setF] = useState("podologos");
  const eq = equipoSucursal(d, sucursalId);
  const pods = eq.filter((u) => u.rol === "podologo");
  const resto = eq.filter((u) => u.rol !== "podologo");
  const roles = [...new Set(resto.map((u) => u.rol))];
  return (
    <>
      <Chips valor={f} onChange={setF} opciones={[{ v: "podologos", l: "Podólogos", n: pods.length }, { v: "personal", l: "Personal", n: resto.length }]} />
      {f === "podologos" && (
        <div className="lista">
          {pods.map((p) => {
            const hoyEn = ubicacionHoy(d, p.id);
            const aqui = hoyEn.find((x) => x.sucursalId === sucursalId);
            const otras = p.sucursales.filter((s) => s !== sucursalId);
            return (
              <Fila key={p.id} izquierda={<Avatar nombre={p.nombre} tono={aqui ? "ok" : undefined} />} titulo={p.nombre}
                badge={aqui ? <Badge tono="ok">Aquí hoy</Badge> : hoyEn.length ? <Badge tono="info">En {R.nombreSucursal(d, hoyEn[0].sucursalId)}</Badge> : <Badge tono="neutral">Sin citas hoy</Badge>}
                sub={`Rota con: ${otras.map((s) => R.nombreSucursal(d, s)).join(", ") || "—"}`}
                datos={<>{hoyEn.map((x) => <span key={x.sucursalId}>{R.nombreSucursal(d, x.sucursalId)}: {x.citas} citas hoy</span>)}</>} />
            );
          })}
          {!pods.length && <Vacio icon="users">No hay podólogos asignados.</Vacio>}
        </div>
      )}
      {f === "personal" && roles.map((r) => (
        <div key={r} className="lista">
          <Titulo>{NOMBRE_ROL[r] || r}</Titulo>
          {resto.filter((u) => u.rol === r).map((u) => <Fila key={u.id} izquierda={<Avatar nombre={u.nombre} />} titulo={u.nombre} sub={u.correo} />)}
        </div>
      ))}
    </>
  );
}
