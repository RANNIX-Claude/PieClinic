// Existencias del almacén activo: búsqueda/escáner, tarjetas, capas PEPS y kardex derivado.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import { kardex } from "../../store/acciones_almacen.js";
import { dinero, fechaCorta, normaliza } from "../../lib/format.js";
import { Badge, Button, Buscador, Card, Chips, Fila, Kpi, Resumen, Sheet, Titulo, Vacio, useDebounced } from "../../ui/index.jsx";
import Escaner from "../../componentes/almacen/Escaner.jsx";

export default function Existencias() {
  const { d, sucursalId: alm } = useSesion();
  const central = alm === "CEN";
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [cat, setCat] = useState("todas");
  const [sel, setSel] = useState(null);
  const [scan, setScan] = useState(false);

  const cats = useMemo(() => [...new Set(d.productos.map((p) => p.categoria))], [d.productos]);
  const bajos = useMemo(() => new Set(R.bajoMinimo(d, alm).map((p) => p.id)), [d, alm]);
  const lista = useMemo(() => {
    const n = normaliza(dq).trim();
    return d.productos.filter((p) => (cat === "todas" || (cat === "bajo" ? bajos.has(p.id) : p.categoria === cat)) && (!n || normaliza(`${p.nombre} ${p.sku}`).includes(n)));
  }, [d.productos, dq, cat, bajos]);

  const prod = sel ? d.productos.find((p) => p.id === sel) : null;
  const capas = prod ? d.capas.filter((c) => c.almacenId === alm && c.productoId === prod.id).sort((a, b) => a.fecha.localeCompare(b.fecha)) : [];
  const mov = prod ? kardex(d, alm, prod.id).slice(0, 40) : [];

  return (
    <>
      <div className="kpis">
        <Kpi label="Productos" valor={d.productos.length} nota={R.nombreAlmacen(d, alm)} />
        {central ? <Kpi label="Valuación PEPS" valor={dinero(R.valuacion(d, alm))} nota="Inventario a costo" tono="info" /> : <Kpi label="Bajo mínimo" valor={bajos.size} tono={bajos.size ? "bad" : "ok"} nota="Productos a reponer" />}
      </div>
      <div className="fila-flex">
        <div style={{ flex: 1 }}><Buscador valor={q} onChange={setQ} placeholder="Nombre o SKU" /></div>
        <Button variante="ghost" icon="scan" onClick={() => setScan(true)} aria-label="Escanear">Escanear</Button>
      </div>
      <Chips scroll valor={cat} onChange={setCat} opciones={[{ v: "todas", l: "Todas" }, ...(central ? [] : [{ v: "bajo", l: "Bajo mínimo", n: bajos.size }]), ...cats.map((c) => ({ v: c, l: c }))]} />
      <div className="lista">
        {lista.map((p) => {
          const s = R.stock(d, alm, p.id);
          const bajo = bajos.has(p.id);
          return (
            <Fila key={p.id} titulo={p.nombre} sub={`${p.sku} · ${p.categoria}`} onClick={() => setSel(p.id)}
              badge={bajo ? <Badge tono="bad">Bajo mínimo</Badge> : s === 0 ? <Badge tono="warn">Sin stock</Badge> : <Badge tono="ok">{s} pz</Badge>}
              datos={<><span>Existencia <b>{s}</b></span>{!central && <span>Mínimo {p.minimo}</span>}<span>{d.capas.filter((c) => c.almacenId === alm && c.productoId === p.id).length} capas</span></>} />
          );
        })}
        {!lista.length && <Vacio>Sin productos con ese filtro.</Vacio>}
      </div>

      <Escaner abierto={scan} onClose={() => setScan(false)} productos={d.productos} onCodigo={(p) => { setCat("todas"); setSel(p.id); }} />

      <Sheet abierto={!!prod} onClose={() => setSel(null)} titulo={prod ? prod.nombre : ""}>
        {prod && (<>
          <Card>
            <Resumen filas={[
              ["SKU", prod.sku], ["Categoría", prod.categoria],
              ["Existencia en " + R.nombreAlmacen(d, alm), `${R.stock(d, alm, prod.id)} pz`, true],
              !central && ["Mínimo", prod.minimo],
              !central && ["Reservado en apartados", R.apartadoReservado(d, alm, prod.id)],
              ["Valor a costo PEPS", dinero(capas.reduce((a, c) => a + c.cant * c.costo, 0))],
            ]} />
          </Card>
          <Titulo>Capas PEPS (salen primero las más antiguas)</Titulo>
          <div className="lista">
            {capas.map((c, i) => (
              <Fila key={c.id} titulo={`${i === 0 ? "1.ª en salir · " : ""}Lote ${c.lote || "—"}`} badge={<Badge tono="info">{c.cant} pz</Badge>}
                datos={<><span>Entrada {fechaCorta(c.fecha)}</span><span>Costo {dinero(c.costo)}</span>{c.caducidad && <span>Caduca {c.caducidad}</span>}</>} />
            ))}
            {!capas.length && <Vacio icon="box">No hay capas: sin existencia.</Vacio>}
          </div>
          <Titulo>Kardex (últimos movimientos)</Titulo>
          <div className="lista">
            {mov.map((m, i) => (
              <Fila key={i} titulo={m.concepto} badge={<Badge tono={m.tipo === "entrada" ? "ok" : "warn"}>{m.tipo === "entrada" ? "+" : "−"}{m.cant}</Badge>}
                datos={<><span>{fechaCorta(m.fecha)}</span>{m.costo != null && <span>Costo {dinero(m.costo)}</span>}</>} />
            ))}
            {!mov.length && <Vacio icon="clipboard">Sin movimientos registrados.</Vacio>}
          </div>
        </>)}
      </Sheet>
    </>
  );
}
