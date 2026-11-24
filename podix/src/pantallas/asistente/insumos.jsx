// Asistente · Insumos: stock del almacén de la sucursal y consumo rápido (PEPS), con escáner simulado por SKU.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, auditar, uid } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { ROLES_ASISTENTE } from "../../store/logica_recepcion.js";
import { Badge, Button, Buscador, Chips, Field, Fila, Icon, Input, Sheet, Titulo, Vacio, aviso, useDebounced } from "../../ui/index.jsx";
import { normaliza, ahoraLocal, hora, fechaCorta } from "../../lib/format.js";

export default function Insumos() {
  const { d, u, sucursalId } = useSesion();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [filtro, setFiltro] = useState("todos");
  const [sku, setSku] = useState("");
  const [sel, setSel] = useState(null);
  const insumos = d.productos.filter((p) => p.tipo === "insumo");
  const filas = useMemo(() => insumos.map((p) => ({ p, st: R.stock(d, sucursalId, p.id) })).filter(({ p, st }) =>
    (filtro === "todos" || st < p.minimo) && (!dq || normaliza(`${p.nombre} ${p.sku}`).includes(normaliza(dq)))), [d.capas, d.productos, sucursalId, dq, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const bajos = insumos.filter((p) => R.stock(d, sucursalId, p.id) < p.minimo).length;
  const recientes = (d.consumosInsumos || []).filter((x) => x.sucursalId === sucursalId).slice(-6).reverse();

  const escanear = () => {
    const p = insumos.find((x) => normaliza(x.sku) === normaliza(sku.trim()));
    if (p) { setSel(p.id); setSku(""); } else aviso("SKU no encontrado entre los insumos", "warn");
  };
  return (
    <div className="form">
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><Input value={sku} onChange={(e) => setSku(e.target.value)} onKeyDown={(e) => e.key === "Enter" && escanear()} placeholder="Escanear / escribir SKU (INS-001)" enterKeyHint="go" autoCapitalize="characters" aria-label="SKU" /></div>
        <Button icon="scan" variante="sec" onClick={escanear} aria-label="Buscar SKU">Ir</Button>
      </div>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar insumo" />
      <Chips valor={filtro} onChange={setFiltro} opciones={[{ v: "todos", l: "Todos", n: insumos.length }, { v: "bajos", l: "Bajo mínimo", n: bajos }]} />
      <div className="lista">
        {filas.map(({ p, st }) => (
          <Fila key={p.id} titulo={p.nombre} sub={`${p.sku} · mínimo ${p.minimo}`} datos={<b>{st} en existencia</b>} badge={st < p.minimo ? <Badge tono={st === 0 ? "bad" : "warn"}>{st === 0 ? "Agotado" : "Bajo mínimo"}</Badge> : <Badge tono="ok">OK</Badge>}
            derecha={<Button className="btn-peq" variante="sec" onClick={() => setSel(p.id)}>Consumir</Button>} />
        ))}
        {!filas.length && <Vacio icon="box">Sin insumos con ese criterio.</Vacio>}
      </div>
      {recientes.length > 0 && <>
        <Titulo>Últimos consumos</Titulo>
        <div className="lista">{recientes.map((x) => <Fila key={x.id} titulo={`${x.cant} × ${R.nombreProducto(d, x.productoId)}`} sub={R.nombreUsuario(d, x.usuarioId).replace(/\s*\(.*\)/, "")} datos={`${fechaCorta(x.fecha)} ${hora(x.fecha)}`} />)}</div>
      </>}
      {sel && <Consumo id={sel} puede={!!u && ROLES_ASISTENTE.includes(u.rol)} onClose={() => setSel(null)} />}
    </div>
  );
}

function Consumo({ id, puede, onClose }) {
  const { d, u, sucursalId } = useSesion();
  const p = d.productos.find((x) => x.id === id);
  const [cant, setCant] = useState(1);
  if (!p) return null;
  const st = R.stock(d, sucursalId, id);
  const consumir = () => {
    const r = mutar((dd) => {
      if (!puede) return { ok: false, motivo: "Sin permiso" };
      const s = R.salidaPEPS(dd, sucursalId, id, cant);
      if (!s.ok) return { ok: false, motivo: `No alcanza el stock: faltan ${s.faltan}` };
      (dd.consumosInsumos ||= []).push({ id: uid("CN"), sucursalId, productoId: id, cant, costo: s.costo, usuarioId: u.id, fecha: ahoraLocal() });
      auditar(dd, "consumo_insumo", "producto", id, `${cant} × ${p.nombre}`);
      return { ok: true };
    });
    if (r.ok) { aviso(`Consumo registrado: ${cant} × ${p.nombre}`); onClose(); } else aviso(r.motivo, "bad");
  };
  const paso = (n) => setCant((c) => Math.max(1, c + n));
  return (
    <Sheet abierto onClose={onClose} titulo={p.nombre} pie={<Button block disabled={!puede || cant > st} onClick={consumir}>Registrar consumo de {cant}</Button>}>
      <div className="form">
        <div className="mu">{p.sku} · {st} en existencia (mínimo {p.minimo})</div>
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 56px", gap: 10, alignItems: "center" }}>
          <Button variante="sec" onClick={() => paso(-1)} aria-label="Menos">−</Button>
          <Input type="number" inputMode="numeric" min={1} value={cant} onChange={(e) => setCant(Math.max(1, Math.floor(Number(e.target.value)) || 1))} style={{ textAlign: "center", fontSize: 22, fontWeight: 700 }} aria-label="Cantidad" />
          <Button variante="sec" onClick={() => paso(1)} aria-label="Más">+</Button>
        </div>
        <div className="chips">{[1, 2, 5, 10].map((n) => <button key={n} className="chip" onClick={() => setCant(n)}>{n}</button>)}</div>
        {cant > st && <div className="card card-bad">No alcanza: solo hay {st}.</div>}
        {st - cant < p.minimo && cant <= st && <div className="card card-warn">Quedará bajo el mínimo ({st - cant} de {p.minimo}).</div>}
      </div>
    </Sheet>
  );
}
