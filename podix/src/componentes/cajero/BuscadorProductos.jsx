// Producto de venta por nombre/SKU (escáner simulado: SKU exacto + Enter lo agrega).
import { useMemo, useState } from "react";
import { Badge, Buscador, Fila, Sheet, Vacio } from "../../ui/index.jsx";
import { dinero, normaliza } from "../../lib/format.js";
import * as R from "../../store/reglas.js";

export default function BuscadorProductos({ abierto, onClose, d, sucursalId, onElegir }) {
  const [q, setQ] = useState("");
  const lista = useMemo(() => {
    const n = normaliza(q).trim();
    return d.productos.filter((p) => p.tipo === "venta" && (!n || normaliza(`${p.nombre} ${p.sku}`).includes(n))).slice(0, 40);
  }, [d.productos, q]);
  const elegir = (p) => { if (R.disponible(d, sucursalId, p.id) <= 0) return; onElegir(p); onClose(); setQ(""); };
  const enter = (e) => {
    if (e.key !== "Enter") return;
    const p = d.productos.find((x) => x.tipo === "venta" && normaliza(x.sku) === normaliza(q).trim());
    if (p) elegir(p);
  };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Agregar producto">
      <div onKeyDown={enter}><Buscador valor={q} onChange={setQ} placeholder="Nombre o SKU (escáner)" /></div>
      <div className="lista">
        {lista.map((p) => {
          const disp = R.disponible(d, sucursalId, p.id);
          return <Fila key={p.id} titulo={p.nombre} sub={`${p.sku} · ${dinero(R.precioFinal(d, sucursalId, "producto", p.id))}`}
            badge={<Badge tono={disp <= 0 ? "bad" : disp <= p.minimo ? "warn" : "ok"}>{disp <= 0 ? "Sin stock" : `${disp} disp.`}</Badge>} onClick={disp > 0 ? () => elegir(p) : undefined} />;
        })}
        {!lista.length && <Vacio>Sin productos con ese nombre o SKU.</Vacio>}
      </div>
    </Sheet>
  );
}
