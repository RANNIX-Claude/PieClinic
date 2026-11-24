// Recibir: órdenes de compra (almacén central) y traspasos en tránsito hacia el almacén activo.
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { devolverProveedor, ocPorRecibir, pendienteOC, recibirOC, recibirTraspaso, ESTADOS_TRASPASO } from "../../store/acciones_almacen.js";
import { dinero, fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Input, Pasos, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Escaner from "../../componentes/almacen/Escaner.jsx";

const num = (v) => (v === "" || v == null ? NaN : Number(v));

export default function Recibir() {
  const { d, u, sucursalId: alm } = useSesion();
  const central = alm === "CEN" && !!u.almacenCentral;
  const [sec, setSec] = useState(central ? "oc" : "tr");
  const [oc, setOc] = useState(null);
  const [tr, setTr] = useState(null);

  const ocs = central ? ocPorRecibir(d) : [];
  const trs = d.traspasos.filter((t) => t.destinoId === alm && t.estado === "en_transito");
  const hist = [
    ...(central ? d.oc.filter((o) => ["recibida", "recibida_parcial"].includes(o.estado)).map((o) => ({ k: "oc", o, f: o.fecha })) : []),
    ...d.traspasos.filter((t) => t.destinoId === alm && t.estado.startsWith("recibido")).map((t) => ({ k: "tr", o: t, f: t.recibidoEn || t.fecha })),
  ].sort((a, b) => b.f.localeCompare(a.f));

  return (
    <>
      <Chips valor={sec} onChange={setSec} opciones={[...(central ? [{ v: "oc", l: "Órdenes de compra", n: ocs.length }] : []), { v: "tr", l: "Traspasos", n: trs.length }, { v: "hist", l: "Historial" }]} />

      {sec === "oc" && (
        <div className="lista">
          {ocs.map((o) => (
            <Fila key={o.id} titulo={`${o.folio} · ${(d.proveedores.find((p) => p.id === o.proveedorId) || {}).nombre}`} sub={`Pedida ${fechaCorta(o.fecha)}`}
              badge={<Badge tono={o.estado === "enviada" ? "info" : "warn"}>{o.estado === "enviada" ? "Por recibir" : "Parcial"}</Badge>}
              datos={<><span>{o.partidas.length} partidas</span><span>Pendiente {pendienteOC(o)} pz</span></>} onClick={() => setOc(o.id)} />
          ))}
          {!ocs.length && <Vacio icon="download">No hay órdenes de compra por recibir.</Vacio>}
        </div>
      )}
      {sec === "tr" && (
        <div className="lista">
          {trs.map((t) => (
            <Fila key={t.id} titulo={`${t.folio} desde ${R.nombreAlmacen(d, t.origenId)}`} sub={`Enviado ${fechaCorta(t.enviadoEn || t.fecha)}`} badge={<Badge tono="info">{ESTADOS_TRASPASO[t.estado]}</Badge>}
              datos={<><span>{t.partidas.length} partidas</span><span>{t.partidas.reduce((a, p) => a + p.enviado, 0)} pz enviadas</span></>} onClick={() => setTr(t.id)} />
          ))}
          {!trs.length && <Vacio icon="truck">No hay traspasos en tránsito hacia {R.nombreAlmacen(d, alm)}.</Vacio>}
        </div>
      )}
      {sec === "hist" && (
        <div className="lista">
          {hist.map(({ k, o }) => k === "oc"
            ? <Fila key={o.id} titulo={`${o.folio} · ${(d.proveedores.find((p) => p.id === o.proveedorId) || {}).nombre}`} sub={`OC ${fechaCorta(o.fecha)}`} badge={<Badge tono={o.estado === "recibida" ? "ok" : "warn"}>{o.estado === "recibida" ? "Recibida" : "Parcial"}</Badge>} datos={<span>{o.factura ? `CFDI ${o.factura}` : "Sin factura"}</span>} onClick={() => setOc(o.id)} />
            : <Fila key={o.id} titulo={`${o.folio} desde ${R.nombreAlmacen(d, o.origenId)}`} sub={`Traspaso ${fechaCorta(o.recibidoEn || o.fecha)}`} badge={<Badge tono={o.estado === "recibido" ? "ok" : "warn"}>{ESTADOS_TRASPASO[o.estado]}</Badge>} onClick={() => setTr(o.id)} />)}
          {!hist.length && <Vacio icon="clipboard">Aún no hay recepciones.</Vacio>}
        </div>
      )}

      {oc && <FormOC o={d.oc.find((x) => x.id === oc)} onClose={() => setOc(null)} />}
      {tr && <FormTraspaso t={d.traspasos.find((x) => x.id === tr)} onClose={() => setTr(null)} />}
    </>
  );
}

// ───────── Orden de compra: pasos (1 mercancía · 2 factura y confirmación)
function FormOC({ o, onClose }) {
  const { d, u, sucursalId: alm } = useSesion();
  const pend = ["enviada", "recibida_parcial"].includes(o.estado);
  const prov = d.proveedores.find((p) => p.id === o.proveedorId) || {};
  const [paso, setPaso] = useState(0);
  const [scan, setScan] = useState(false);
  const [dev, setDev] = useState(false);
  const [lin, setLin] = useState(() => Object.fromEntries(o.partidas.map((p) => [p.productoId, { recibir: String(Math.max(0, p.cant - (p.recibido || 0))), lote: "", caducidad: "", costo: String(p.costo) }])));
  const [fol, setFol] = useState(o.factura || "");
  const [vence, setVence] = useState(sumarDias(hoy(), prov.dias || 30));
  const [ocupado, setOcupado] = useState(false);
  const set = (pid, k, v) => setLin((s) => ({ ...s, [pid]: { ...s[pid], [k]: v } }));
  const pendDe = (p) => Math.max(0, p.cant - (p.recibido || 0));
  const lineas = o.partidas.map((p) => ({ productoId: p.productoId, recibir: num(lin[p.productoId].recibir), lote: lin[p.productoId].lote, caducidad: lin[p.productoId].caducidad, costo: num(lin[p.productoId].costo) }));
  const invalida = lineas.some((l) => !Number.isInteger(l.recibir) || l.recibir < 0 || !(l.costo >= 0));
  const total = lineas.reduce((a, l) => a + (l.recibir || 0) * (l.costo || 0), 0);
  const difs = o.partidas.filter((p, i) => lineas[i].recibir !== pendDe(p));

  const confirmar = () => {
    setOcupado(true);
    const r = mutar((dd) => recibirOC(dd, o.id, lineas, fol.trim() ? { folio: fol.trim(), vence } : null, dd.usuarios.find((x) => x.id === dd.sesion.userId)));
    setOcupado(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.estado === "recibida" ? "Orden recibida completa ✔" : "Recepción parcial registrada", r.diferencias.length ? "warn" : "ok");
    onClose();
  };
  const ver = (
    <>
      <Card><Resumen filas={[["Proveedor", prov.nombre], ["Estado", o.estado.replace("_", " ")], ["CFDI", o.factura || "—"]]} /></Card>
      <div className="lista">
        {o.partidas.map((p) => (
          <Fila key={p.productoId} titulo={R.nombreProducto(d, p.productoId)} badge={<Badge tono={(p.recibido || 0) >= p.cant ? "ok" : "warn"}>{p.recibido || 0}/{p.cant}</Badge>}
            datos={<><span>Costo {dinero(p.costo)}</span>{p.devuelto ? <span>Devuelto {p.devuelto}</span> : null}</>} />
        ))}
      </div>
      {(d.devolucionesProveedor || []).filter((x) => x.ocId === o.id).map((x) => <Fila key={x.id} titulo={`${x.folio} · ${R.nombreProducto(d, x.productoId)} ×${x.cant}`} sub={x.motivo} badge={<Badge tono="info">{dinero(x.monto)}</Badge>} />)}
    </>
  );
  return (
    <>
      <Sheet abierto onClose={onClose} titulo={`${o.folio} · ${prov.nombre || ""}`}
        pie={pend ? (
          <div className="dos">
            {paso === 0 ? <Button variante="sec" block onClick={onClose}>Cancelar</Button> : <Button variante="sec" block onClick={() => setPaso(0)}>Atrás</Button>}
            {paso === 0 ? <Button block disabled={invalida} onClick={() => setPaso(1)}>Siguiente</Button> : <Button block loading={ocupado} onClick={confirmar}>Confirmar recepción</Button>}
          </div>
        ) : o.recepciones || o.partidas.some((p) => p.recibido) ? <Button variante="sec" block icon="undo" onClick={() => setDev(true)}>Devolver a proveedor</Button> : null}>
        {!pend ? ver : (<>
          <Pasos titulos={["Mercancía recibida", "Factura y confirmación"]} paso={paso} />
          {paso === 0 && (<>
            <div className="fila-flex"><Button variante="ghost" icon="scan" onClick={() => setScan(true)}>Escanear</Button><Button variante="ghost" icon="check" onClick={() => setLin((s) => Object.fromEntries(o.partidas.map((p) => [p.productoId, { ...s[p.productoId], recibir: String(pendDe(p)) }])))}>Marcar todo conforme</Button></div>
            {o.partidas.map((p) => {
              const l = lin[p.productoId], dif = (num(l.recibir) || 0) - pendDe(p);
              return (
                <Card key={p.productoId} tono={dif ? "warn" : undefined}>
                  <div className="fila-t"><b>{R.nombreProducto(d, p.productoId)}</b>{dif ? <Badge tono="warn">{dif < 0 ? `Faltan ${-dif}` : `Sobran ${dif}`}</Badge> : <Badge tono="ok">Conforme</Badge>}</div>
                  <div className="peq mu" style={{ margin: "2px 0 8px" }}>Pedido {p.cant} · ya recibido {p.recibido || 0} · pendiente {pendDe(p)}</div>
                  <div className="form">
                    <Field label="Cantidad recibida"><Input type="number" inputMode="numeric" min="0" value={l.recibir} onChange={(e) => set(p.productoId, "recibir", e.target.value)} /></Field>
                    <Field label="Lote"><Input value={l.lote} onChange={(e) => set(p.productoId, "lote", e.target.value)} placeholder="Opcional" autoCapitalize="characters" /></Field>
                    <Field label="Caducidad"><Input type="date" value={l.caducidad} onChange={(e) => set(p.productoId, "caducidad", e.target.value)} /></Field>
                    <Field label="Costo unitario (de la OC)"><Input type="number" inputMode="decimal" min="0" step="0.01" value={l.costo} onChange={(e) => set(p.productoId, "costo", e.target.value)} /></Field>
                  </div>
                </Card>
              );
            })}
          </>)}
          {paso === 1 && (<>
            <Card><Resumen filas={[["Partidas con mercancía", lineas.filter((l) => l.recibir > 0).length], ["Con diferencia", difs.length], ["Valor recibido", dinero(total), true]]} /></Card>
            {difs.map((p) => <Fila key={p.productoId} titulo={R.nombreProducto(d, p.productoId)} badge={<Badge tono="warn">Diferencia</Badge>} sub={`Esperado ${pendDe(p)} · recibido ${lineas.find((l) => l.productoId === p.productoId).recibir}`} />)}
            <Field label="Folio de factura (CFDI)" hint="Si lo capturas se genera la cuenta por pagar."><Input value={fol} onChange={(e) => setFol(e.target.value)} placeholder="A-12345" autoCapitalize="characters" /></Field>
            <Field label="Vence el pago" hint={`Crédito del proveedor: ${prov.dias || 30} días`}><Input type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></Field>
          </>)}
        </>)}
      </Sheet>
      <Escaner abierto={scan} onClose={() => setScan(false)} productos={o.partidas.map((p) => d.productos.find((x) => x.id === p.productoId))} onCodigo={(p) => { const pt = o.partidas.find((x) => x.productoId === p.id); set(p.id, "recibir", String(pendDe(pt))); aviso(`${p.nombre}: marcado conforme`); }} />
      {dev && <FormDevolucion o={o} onClose={() => setDev(false)} />}
    </>
  );
}

function FormDevolucion({ o, onClose }) {
  const { d } = useSesion();
  const cand = o.partidas.filter((p) => (p.recibido || 0) - (p.devuelto || 0) > 0);
  const [pid, setPid] = useState(cand[0]?.productoId || "");
  const [cant, setCant] = useState("1");
  const [motivo, setMotivo] = useState("");
  const ok = () => {
    const r = mutar((dd) => devolverProveedor(dd, { ocId: o.id, productoId: pid, cant: num(cant), motivo }, dd.usuarios.find((x) => x.id === dd.sesion.userId)));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Nota de crédito ${r.nota.folio} por ${dinero(r.nota.monto)}`); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Devolver a proveedor" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block disabled={!cand.length} onClick={ok}>Devolver</Button></div>}>
      {!cand.length ? <Vacio>No hay mercancía por devolver en esta orden.</Vacio> : (
        <div className="form">
          <Field label="Producto"><Select value={pid} onChange={(e) => setPid(e.target.value)}>{cand.map((p) => <option key={p.productoId} value={p.productoId}>{R.nombreProducto(d, p.productoId)} (máx. {(p.recibido || 0) - (p.devuelto || 0)})</option>)}</Select></Field>
          <Field label="Cantidad"><Input type="number" inputMode="numeric" min="1" value={cant} onChange={(e) => setCant(e.target.value)} /></Field>
          <Field label="Motivo (obligatorio)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Defecto, error de pedido…" /></Field>
          <p className="mu peq">Sale del almacén central por PEPS y genera nota de crédito; baja la cuenta por pagar de la orden.</p>
        </div>
      )}
    </Sheet>
  );
}

// ───────── Traspaso
function FormTraspaso({ t, onClose }) {
  const { d, sucursalId: alm } = useSesion();
  const enTransito = t.estado === "en_transito" && t.destinoId === alm;
  const [rec, setRec] = useState(() => Object.fromEntries(t.partidas.map((p) => [p.productoId, String(p.enviado)])));
  const [nota, setNota] = useState("");
  const [scan, setScan] = useState(false);
  const prods = t.partidas.map((p) => d.productos.find((x) => x.id === p.productoId));
  const todo = () => setRec(Object.fromEntries(t.partidas.map((p) => [p.productoId, String(p.enviado)])));
  const difs = t.partidas.filter((p) => num(rec[p.productoId]) !== p.enviado);
  const invalida = t.partidas.some((p) => { const c = num(rec[p.productoId]); return !Number.isInteger(c) || c < 0 || c > p.enviado; });
  const confirmar = () => {
    const r = mutar((dd) => recibirTraspaso(dd, t.id, Object.fromEntries(t.partidas.map((p) => [p.productoId, num(rec[p.productoId])])), dd.usuarios.find((x) => x.id === dd.sesion.userId), dd.sesion.sucursalId, nota));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.estado === "recibido" ? "Traspaso recibido conforme ✔" : "Recibido con diferencia", r.diferencias.length ? "warn" : "ok");
    onClose();
  };
  return (
    <>
      <Sheet abierto onClose={onClose} titulo={`${t.folio} · ${ESTADOS_TRASPASO[t.estado]}`}
        pie={enTransito ? <div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block disabled={invalida} onClick={confirmar}>{difs.length ? "Recibir con diferencia" : "Confirmar recepción"}</Button></div> : null}>
        <Card><Resumen filas={[["Origen", R.nombreAlmacen(d, t.origenId)], ["Destino", R.nombreAlmacen(d, t.destinoId)], ["Fecha", fechaCorta(t.fecha)]]} /></Card>
        {enTransito && <div className="fila-flex"><Button variante="ghost" icon="scan" onClick={() => setScan(true)}>Escanear</Button><Button variante="ghost" icon="check" onClick={todo}>Marcar todo conforme</Button></div>}
        {t.partidas.map((p) => {
          const c = num(rec[p.productoId]); const dif = (c || 0) - p.enviado;
          return (
            <Card key={p.productoId} tono={enTransito && dif ? "warn" : undefined}>
              <div className="fila-t"><b>{R.nombreProducto(d, p.productoId)}</b>
                {enTransito ? (dif ? <Badge tono="warn">Faltan {-dif}</Badge> : <Badge tono="ok">Conforme</Badge>) : <Badge tono={p.recibido === p.enviado ? "ok" : "warn"}>{p.recibido}/{p.enviado}</Badge>}</div>
              <div className="peq mu">Enviado {p.enviado}{p.costo != null ? ` · costo ${dinero(p.costo)}` : ""}</div>
              {enTransito && <Field label="Cantidad recibida"><Input type="number" inputMode="numeric" min="0" max={p.enviado} value={rec[p.productoId]} onChange={(e) => setRec((s) => ({ ...s, [p.productoId]: e.target.value }))} /></Field>}
            </Card>
          );
        })}
        {enTransito && difs.length > 0 && <Field label="Nota de la diferencia"><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional: faltante, daño…" /></Field>}
        {t.notaRecepcion && <p className="mu">Nota: {t.notaRecepcion}</p>}
      </Sheet>
      <Escaner abierto={scan} onClose={() => setScan(false)} productos={prods} continuo onCodigo={(p) => { const pt = t.partidas.find((x) => x.productoId === p.id); setRec((s) => ({ ...s, [p.id]: String(pt.enviado) })); aviso(`${p.nombre}: conforme`); }} />
    </>
  );
}
