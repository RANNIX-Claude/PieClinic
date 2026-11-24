// Inventario físico: cíclico/general, captura a ciegas, segundo conteo de diferencias, comparativo y ajuste autorizado.
// Funciona sin señal: cada captura se aplica en local y se encola con registrarOp (lo hace la acción).
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar, hayConexion } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import {
  MOTIVOS_INV, asegurarPartidas, capturarConteo, categoriasDe, cerrarInventario, comparativo, completarEnCero, iniciarInventario, progresoInv, proponerAjusteInv, terminarConteo,
} from "../../store/acciones_almacen.js";
import { dinero, fechaCorta, normaliza } from "../../lib/format.js";
import { Badge, Button, Buscador, Card, Chips, Field, Fila, Icon, Input, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Escaner from "../../componentes/almacen/Escaner.jsx";

const ETIQ = { abierto: "Primer conteo", segundo_conteo: "Segundo conteo", comparativo: "Comparativo", cerrado: "Cerrado" };
const TONO = { abierto: "info", segundo_conteo: "warn", comparativo: "warn", cerrado: "ok" };
const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);

export default function Conteo() {
  const { d, sucursalId: alm } = useSesion();
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const lista = d.inventarios.filter((i) => i.sucursalId === alm);
  const inv = abierto ? d.inventarios.find((x) => x.id === abierto) : null;

  if (inv) return <Captura inv={inv} onVolver={() => setAbierto(null)} />;
  return (
    <>
      {!hayConexion(d) && <Card tono="warn"><span className="peq"><Icon name="wifioff" size={14} /> Sin señal: puedes seguir contando; todo queda pendiente de sincronizar.</span></Card>}
      <Button block icon="plus" onClick={() => setNuevo(true)} disabled={lista.some((i) => i.estado !== "cerrado")}>Iniciar inventario</Button>
      {lista.some((i) => i.estado !== "cerrado") && <p className="mu peq">Cierra el inventario abierto antes de iniciar otro.</p>}
      <div className="lista">
        {lista.map((i) => {
          const pr = progresoInv(i);
          return (
            <Fila key={i.id} titulo={`${i.folio || "Inventario"} · ${i.tipo === "general" ? "General" : "Cíclico"}`} sub={i.alcance} badge={<Badge tono={TONO[i.estado]}>{ETIQ[i.estado]}</Badge>}
              datos={<><span>{fechaCorta(i.fecha)}</span>{i.estado !== "cerrado" && pr.total > 0 && <span>{pr.hechos}/{pr.total} contados</span>}{i.congelado && <Badge tono="bad">Movimientos congelados</Badge>}</>}
              onClick={() => { mutar((dd) => { asegurarPartidas(dd, i.id); }); setAbierto(i.id); }} />
          );
        })}
        {!lista.length && <Vacio icon="clipboard">Aún no hay inventarios en este almacén.</Vacio>}
      </div>
      {nuevo && <FormNuevo onClose={() => setNuevo(false)} onCreado={(id) => setAbierto(id)} />}
    </>
  );
}

function FormNuevo({ onClose, onCreado }) {
  const { d, sucursalId: alm } = useSesion();
  const [tipo, setTipo] = useState("ciclico");
  const [cat, setCat] = useState(categoriasDe(d)[0]);
  const crear = () => {
    const r = mutar((dd) => iniciarInventario(dd, { almacenId: alm, tipo, categoria: cat }, yo(dd)));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Inventario ${r.inventario.folio} iniciado`); onClose(); onCreado(r.inventario.id);
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Iniciar inventario" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block onClick={crear}>Iniciar</Button></div>}>
      <div className="form">
        <Chips valor={tipo} onChange={setTipo} opciones={[{ v: "ciclico", l: "Cíclico (por categoría)" }, { v: "general", l: "General" }]} />
        {tipo === "ciclico" && <Field label="Categoría a contar"><Select value={cat} onChange={(e) => setCat(e.target.value)}>{categoriasDe(d).map((c) => <option key={c}>{c}</option>)}</Select></Field>}
        {tipo === "general" && <Card tono="warn"><span className="peq"><b>Congela los movimientos</b> del almacén (recepciones, envíos y recibos de traspaso) hasta cerrar el inventario.</span></Card>}
        <p className="mu peq">La captura es a ciegas: no verás la existencia del sistema hasta el comparativo.</p>
      </div>
    </Sheet>
  );
}

function Captura({ inv, onVolver }) {
  const { d } = useSesion();
  const [q, setQ] = useState("");
  const [scan, setScan] = useState(false);
  const [borr, setBorr] = useState({});
  const conteo2 = inv.estado === "segundo_conteo";
  const campo = conteo2 ? "c2" : "c1";
  const pr = progresoInv(inv);
  const visibles = inv.partidas.filter((p) => (!conteo2 || p.requiere2) && (!q.trim() || normaliza(R.nombreProducto(d, p.productoId) + (d.productos.find((x) => x.id === p.productoId) || {}).sku).includes(normaliza(q))));
  const guardar = (pid, v, sumar = false) => {
    const r = mutar((dd) => capturarConteo(dd, inv.id, pid, Number(v), yo(dd), { sumar }));
    if (!r.ok) return aviso(r.error, "bad");
    setBorr((s) => { const n = { ...s }; delete n[pid]; return n; });
    return r;
  };
  const terminar = () => {
    const r = mutar((dd) => terminarConteo(dd, inv.id, yo(dd)));
    if (!r.ok) return aviso(r.error, "bad");
    if (r.estado === "segundo_conteo") aviso(`${r.diferencias} producto(s) con diferencia: cuéntalos de nuevo`, "warn");
    else aviso(r.estado === "comparativo" ? "Conteo terminado: revisa el comparativo" : "Listo");
  };

  return (
    <>
      <div className="fila-flex"><Button variante="ghost" icon="back" onClick={onVolver}>Inventarios</Button><Badge tono={TONO[inv.estado]}>{ETIQ[inv.estado]}</Badge>{inv.congelado && <Badge tono="bad">Congelado</Badge>}</div>
      <Card><Resumen filas={[["Folio", inv.folio || "—"], ["Alcance", inv.alcance], ["Fecha", fechaCorta(inv.fecha)]]} /></Card>
      {["abierto", "segundo_conteo"].includes(inv.estado) && (<>
        <Card tono="info">
          <div className="fila-t"><b>{conteo2 ? "Segundo conteo: solo diferencias" : "Primer conteo a ciegas"}</b><span>{pr.hechos}/{pr.total}</span></div>
          <div className="pasos-barra" style={{ marginTop: 8 }}><div style={{ width: `${pr.total ? (pr.hechos / pr.total) * 100 : 0}%`, height: "100%", background: "var(--p)" }} /></div>
        </Card>
        <div className="fila-flex"><div style={{ flex: 1 }}><Buscador valor={q} onChange={setQ} placeholder="Nombre o SKU" /></div><Button variante="ghost" icon="scan" onClick={() => setScan(true)}>Escanear</Button></div>
        <div className="lista">
          {visibles.map((p) => {
            const pd = d.productos.find((x) => x.id === p.productoId);
            const val = borr[p.productoId] ?? (p[campo] ?? "");
            return (
              <Card key={p.productoId}>
                <div className="fila-t"><b>{pd.nombre}</b>{p[campo] != null ? <Badge tono="ok">Contado</Badge> : <Badge tono="neutral">Pendiente</Badge>}</div>
                <div className="peq mu">{pd.sku}{conteo2 ? " · diferencia en el primer conteo" : ""}</div>
                <div className="fila-flex" style={{ marginTop: 8 }}>
                  <Input type="number" inputMode="numeric" min="0" placeholder="Cantidad" value={val} onChange={(e) => setBorr((s) => ({ ...s, [p.productoId]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && val !== "" && guardar(p.productoId, val)} />
                  <Button variante="ghost" icon="check" disabled={val === "" || String(val) === String(p[campo] ?? "")} onClick={() => guardar(p.productoId, val)}>Guardar</Button>
                </div>
              </Card>
            );
          })}
          {!visibles.length && <Vacio>Sin productos con ese filtro.</Vacio>}
        </div>
        <div className="form">
          {pr.hechos < pr.total && <Button variante="sec" block onClick={() => { const r = mutar((dd) => completarEnCero(dd, inv.id, yo(dd))); if (r.ok) aviso(`${r.n} productos marcados en 0`); }}>Marcar no contados en 0 ({pr.total - pr.hechos})</Button>}
          <Button block disabled={pr.hechos < pr.total} onClick={terminar}>{conteo2 ? "Terminar segundo conteo" : "Terminar primer conteo"}</Button>
        </div>
        <Escaner abierto={scan} onClose={() => setScan(false)} continuo titulo="Escanear: cada lectura suma 1" productos={inv.partidas.filter((p) => !conteo2 || p.requiere2).map((p) => d.productos.find((x) => x.id === p.productoId))}
          onCodigo={(p) => { const r = guardar(p.id, 1, true); if (r && r.ok) aviso(`${p.nombre}: ${r.contado}`); }} />
      </>)}
      {inv.estado === "comparativo" && <Comparativo inv={inv} />}
      {inv.estado === "cerrado" && <Comparativo inv={inv} soloLectura />}
    </>
  );
}

function Comparativo({ inv, soloLectura }) {
  const { d } = useSesion();
  const filas = comparativo(d, inv);
  const difs = filas.filter((f) => f.dif);
  const falt = difs.filter((f) => f.valor < 0).reduce((a, f) => a + f.valor, 0), sob = difs.filter((f) => f.valor > 0).reduce((a, f) => a + f.valor, 0);
  const [motivo, setMotivo] = useState({});
  const proponer = (pid) => {
    const r = mutar((dd) => proponerAjusteInv(dd, inv.id, pid, motivo[pid], yo(dd)));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Ajuste enviado a autorización (${r.autorizacion.nivel})`);
  };
  const cerrar = () => { const r = mutar((dd) => cerrarInventario(dd, inv.id, yo(dd))); if (!r.ok) return aviso(r.error, "bad"); aviso("Inventario cerrado ✔"); };
  return (
    <>
      <Card><Resumen filas={[["Productos contados", filas.length], ["Conformes", filas.length - difs.length], ["Con diferencia", difs.length], ["Faltante (costo PEPS)", dinero(falt)], ["Sobrante (costo PEPS)", dinero(sob)], ["Diferencia neta", dinero(falt + sob), true]]} /></Card>
      <Titulo>Diferencias</Titulo>
      <div className="lista">
        {difs.map((f) => {
          const a = f.partida.ajusteAutId ? d.autorizaciones.find((x) => x.id === f.partida.ajusteAutId) : null;
          return (
            <Card key={f.productoId} tono={f.dif < 0 ? "bad" : "warn"}>
              <div className="fila-t"><b>{R.nombreProducto(d, f.productoId)}</b><Badge tono={f.dif < 0 ? "bad" : "warn"}>{f.dif > 0 ? "+" : ""}{f.dif}</Badge></div>
              <div className="fila-d"><span>Sistema {f.sistema}</span><span>Contado {f.contado}</span><span>Valor {dinero(f.valor)}</span></div>
              {a ? <div style={{ marginTop: 8 }}><Badge tono={a.estado === "autorizado" ? "ok" : a.estado === "rechazado" ? "bad" : "info"}>Ajuste {a.estado} · {a.nivel}</Badge> <span className="peq mu">{f.partida.motivoAjuste}</span></div>
                : !soloLectura && (
                  <div className="form" style={{ marginTop: 8 }}>
                    <Field label="Motivo del ajuste"><Select value={motivo[f.productoId] || ""} onChange={(e) => setMotivo((s) => ({ ...s, [f.productoId]: e.target.value }))}><option value="">Elegir…</option>{MOTIVOS_INV.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                    <Button variante="sec" block disabled={!motivo[f.productoId]} onClick={() => proponer(f.productoId)}>Proponer ajuste</Button>
                  </div>)}
            </Card>
          );
        })}
        {!difs.length && <Vacio icon="check">Todo conforme: sin diferencias.</Vacio>}
      </div>
      {!soloLectura && <Button block onClick={cerrar}>Cerrar inventario</Button>}
      <p className="mu peq">El ajuste se aplica cuando el gerente o la administración central lo autorizan.</p>
    </>
  );
}
