// Lista de precios de la sucursal activa (solo lectura): base, ajuste % y precio final.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import { dinero, normaliza } from "../../lib/format.js";
import { Badge, Buscador, Chips, Fila, Vacio, useDebounced } from "../../ui/index.jsx";

export default function PreciosConsulta() {
  const { d, sucursalId, sucursal } = useSesion();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [tipo, setTipo] = useState("servicio");
  const sid = d.params[sucursalId] ? sucursalId : d.sucursales[0].id; // el central no tiene lista propia
  const items = useMemo(() => {
    const n = normaliza(dq).trim();
    const base = tipo === "servicio" ? d.servicios : d.productos.filter((p) => p.tipo === "venta");
    return base.filter((x) => !n || normaliza(`${x.nombre} ${x.sku || ""}`).includes(n));
  }, [d, dq, tipo]);
  return (
    <>
      <p className="mu peq">Precios de {sucursal?.nombre || R.nombreSucursal(d, sid)}. Solo consulta: los cambios los hace la administración central.</p>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar servicio o producto" />
      <Chips valor={tipo} onChange={setTipo} opciones={[{ v: "servicio", l: "Servicios" }, { v: "producto", l: "Productos" }]} />
      <div className="lista">
        {items.map((x) => {
          const pct = R.ajustePct(d, sid, tipo, x.id);
          return (
            <Fila key={x.id} titulo={x.nombre} sub={x.sku || `${x.duracion} min`} badge={<b>{dinero(R.precioFinal(d, sid, tipo, x.id))}</b>}
              datos={<><span>Base {dinero(x.precioBase)}</span><Badge tono={pct > 0 ? "warn" : pct < 0 ? "ok" : "neutral"}>Ajuste {pct > 0 ? "+" : ""}{pct}%</Badge></>} />
          );
        })}
        {!items.length && <Vacio>Sin resultados.</Vacio>}
      </div>
    </>
  );
}
