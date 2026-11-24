// Más · Mantenimiento de equipos. Portado de Pie Firme (pages/plataforma/equipo/Mantenimiento.jsx y mantenimiento/*; P-112):
// equipos por sucursal, plan preventivo, órdenes de trabajo con bitácora y evidencias, presupuesto mensual. Una OT urgente de
// hasta $2,000 se atiende sin autorización previa y se regulariza después; el resto la autoriza Administración.
// Gerente: su sucursal. Administración y Dirección: todas. Al cerrar, el costo puede registrarse como gasto (Más ▸ Gastos).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_ventas.js";
import * as R from "../../store/reglas.js";
import { Area, Badge, Button, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { BadgeEstado, Pestanas, SelectorSucursal } from "../../componentes/ventas/comun.jsx";
import { dinero, fechaCorta, hora, hoy } from "../../lib/format.js";
import "../../estilos_ventas.css";

const run = (fn, okTxt) => { const r = mutar(fn); if (r && r.ok) { if (okTxt) aviso(okTxt, "ok"); } else aviso((r && r.error) || "No se pudo completar.", "bad"); return r; };

export default function Mantenimiento() {
  const { d, u, sucursalId } = useSesion();
  const nav = useNavigate();
  const p = A.permisosVentas(u);
  const sucs = A.sucursalesMant(d, u);
  const [suc, setSuc] = useState(() => (sucs.some((s) => s.id === sucursalId) ? sucursalId : sucs[0] ? sucs[0].id : ""));
  const [tab, setTab] = useState("ordenes");
  const [ot, setOt] = useState(null);
  const [eq, setEq] = useState(null);
  const [nueva, setNueva] = useState(null);
  if (!p.mantenimiento) return <Vacio icon="lock">Mantenimiento: gerente de sucursal, Administración central y Dirección.</Vacio>;
  const mes = hoy().slice(0, 7);
  const equipos = d.mant.equipos.filter((e) => !suc || e.sucursalId === suc);
  const ordenes = d.mant.ordenes.filter((o) => !suc || o.sucursalId === suc);
  const pres = suc ? A.presupuestoMes(d, suc, mes) : null;
  const pend = A.preventivosPendientes(d, { sucursalId: suc || null });
  const abiertas = ordenes.filter((o) => A.OT_ABIERTAS.includes(o.estado));
  const porAutorizar = ordenes.filter((o) => o.estado === "solicitado" || o.autorizacionPendiente);
  const otSel = ot ? d.mant.ordenes.find((x) => x.id === ot) : null;
  const eqSel = eq ? d.mant.equipos.find((x) => x.id === eq) : null;
  return (
    <div className="v-col">
      <Titulo>Mantenimiento de equipos</Titulo>
      <SelectorSucursal d={d} sucursales={sucs} valor={suc} onChange={setSuc} todas={A.esCentral(u)} />
      <div className="kpis v-kpis">
        <Kpi label="Órdenes abiertas" valor={abiertas.length} nota={`${porAutorizar.length} por autorizar`} tono={porAutorizar.length ? "warn" : undefined} />
        <Kpi label="Preventivos pendientes" valor={pend.length} tono={pend.length ? "warn" : undefined} />
        <Kpi label="Equipos con falla" valor={equipos.filter((e) => ["falla", "en_proceso"].includes(e.estado)).length} />
        {pres ? <Kpi label={`Presupuesto ${mes}`} valor={dinero(pres.disponible)} nota={`de ${dinero(pres.presupuesto)} · ejercido ${dinero(pres.ejercido)}`} tono={pres.excedido ? "bad" : "ok"} /> : <Kpi label="Equipos" valor={equipos.length} />}
      </div>
      <Card><span className="peq">Urgente de hasta <b>{dinero(A.cfgVentas(d).mantUrgenteTope)}</b>: se atiende de inmediato y Administración la regulariza después (P-112). Lo demás espera autorización.</span></Card>
      <Pestanas valor={tab} onChange={setTab} opciones={[{ v: "ordenes", l: "Órdenes de trabajo", n: abiertas.length }, { v: "equipos", l: "Equipos", n: equipos.length }, { v: "plan", l: "Plan preventivo", n: pend.length }, { v: "presupuesto", l: "Presupuesto" }]} />
      {tab === "ordenes" && <>
        <Button icon="plus" disabled={!suc} onClick={() => setNueva({ equipoId: "", tipo: "normal", descripcion: "", costoEstimado: "", proveedor: "" })}>Nueva orden</Button>
        {!suc && <p className="peq mu">Elige una sucursal para levantar órdenes.</p>}
        <Vista id="v-ots" items={ordenes} inicial="renglones"
          tarjeta={(o) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{o.folio}</b><BadgeEstado mapa={A.ESTADOS_OT} k={o.estado} /></div>
            <div>{(d.mant.equipos.find((e) => e.id === o.equipoId) || {}).nombre}</div><div className="peq mu">{A.TIPOS_OT[o.tipo]} · {fechaCorta(o.fecha)}</div><div className="peq">{o.descripcion}</div>
            <b>{dinero(o.costoReal ?? o.costoEstimado)}</b>{o.autorizacionPendiente && <Badge tono="warn">Falta regularizar</Badge>}</div>}
          columnas={[{ k: "f", t: "Folio", v: (o) => o.folio }, { k: "fe", t: "Fecha", v: (o) => fechaCorta(o.fecha), orden: (o) => o.fecha },
            { k: "e", t: "Equipo", v: (o) => (d.mant.equipos.find((e) => e.id === o.equipoId) || {}).nombre }, { k: "s", t: "Sucursal", v: (o) => R.nombreSucursal(d, o.sucursalId) },
            { k: "t", t: "Tipo", v: (o) => <Badge tono={o.tipo === "urgente" ? "bad" : o.tipo === "preventivo" ? "info" : "neutral"}>{A.TIPOS_OT[o.tipo]}</Badge>, orden: (o) => o.tipo },
            { k: "c", t: "Costo", v: (o) => dinero(o.costoReal ?? o.costoEstimado), der: true, orden: (o) => o.costoReal ?? o.costoEstimado },
            { k: "es", t: "Estado", v: (o) => <span><BadgeEstado mapa={A.ESTADOS_OT} k={o.estado} />{o.autorizacionPendiente ? " ·por regularizar" : ""}</span>, orden: (o) => o.estado }]}
          onAbrir={(o) => setOt(o.id)} vacio="Sin órdenes de trabajo." />
      </>}
      {tab === "equipos" && <>
        <Button icon="plus" variante="sec" disabled={!suc} onClick={() => setEq("nuevo")}>Agregar equipo</Button>
        <Vista id="v-equipos" items={equipos}
          tarjeta={(e) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{e.nombre}</b><BadgeEstado mapa={A.ESTADOS_EQUIPO} k={A.estadoEquipo(e)} /></div>
            <div className="peq mu">{e.codigo} · {e.marca} {e.modelo}</div><div className="peq">{e.ubicacion}</div><div className="peq">Próximo servicio {A.proximoServicio(e) ? fechaCorta(A.proximoServicio(e)) : "—"}</div></div>}
          columnas={[{ k: "c", t: "Código", v: (e) => e.codigo }, { k: "n", t: "Equipo", v: (e) => e.nombre }, { k: "t", t: "Tipo", v: (e) => A.TIPOS_EQUIPO[e.tipo] }, { k: "s", t: "Sucursal", v: (e) => R.nombreSucursal(d, e.sucursalId) },
            { k: "u", t: "Último servicio", v: (e) => fechaCorta(e.ultimoServicio), orden: (e) => e.ultimoServicio }, { k: "p", t: "Próximo", v: (e) => (A.proximoServicio(e) ? fechaCorta(A.proximoServicio(e)) : "—"), orden: (e) => A.proximoServicio(e) || "" },
            { k: "e", t: "Estado", v: (e) => <BadgeEstado mapa={A.ESTADOS_EQUIPO} k={A.estadoEquipo(e)} />, orden: (e) => A.estadoEquipo(e) }]}
          onAbrir={(e) => setEq(e.id)} />
      </>}
      {tab === "plan" && <>
        <p className="peq mu">Equipos con servicio vencido o en los próximos 15 días que aún no tienen orden abierta.</p>
        {suc && pend.length > 0 && <Button icon="calendar" onClick={() => run((dd) => { const r = A.programarPreventivos(dd, { sucursalId: suc }); if (r.ok) aviso(`Órdenes creadas: ${r.creadas.join(", ")}`, "ok"); return r; })}>Programar los {pend.length} preventivos</Button>}
        <div className="lista">{pend.map((e) => <Fila key={e.id} titulo={e.nombre} sub={`${e.codigo} · ${R.nombreSucursal(d, e.sucursalId)}`} datos={`Cada ${e.periodicidadDias} días · tocaba ${fechaCorta(A.proximoServicio(e))}`} badge={<BadgeEstado mapa={A.ESTADOS_EQUIPO} k={A.estadoEquipo(e)} />} onClick={() => setNueva({ equipoId: e.id, tipo: "preventivo", descripcion: "Servicio preventivo programado", costoEstimado: "", proveedor: "" })} />)}
          {!pend.length && <Vacio icon="check">El plan preventivo está al corriente.</Vacio>}</div>
      </>}
      {tab === "presupuesto" && <Presupuesto d={d} u={u} sucs={suc ? sucs.filter((s) => s.id === suc) : sucs} irGastos={d.fin ? () => nav("/mas/gastos") : null} />}
      {nueva && <NuevaOT d={d} suc={suc} inicial={nueva} onClose={() => setNueva(null)} onCreada={(id) => { setNueva(null); setOt(id); }} />}
      {otSel && <DetalleOT d={d} u={u} o={otSel} onClose={() => setOt(null)} irGastos={d.fin ? () => nav("/mas/gastos") : null} />}
      {eq && <EquipoSheet d={d} suc={suc} e={eqSel} onClose={() => setEq(null)} verOT={(id) => { setEq(null); setOt(id); }} />}
    </div>
  );
}

function NuevaOT({ d, suc, inicial, onClose, onCreada }) {
  const [f, setF] = useState(inicial);
  const eqs = d.mant.equipos.filter((e) => e.sucursalId === suc && e.estado !== "baja");
  const tope = A.cfgVentas(d).mantUrgenteTope;
  const sinAut = f.tipo === "urgente" && Number(f.costoEstimado || 0) <= tope;
  return (
    <Sheet abierto onClose={onClose} titulo="Nueva orden de trabajo" pie={<Button block onClick={() => { const r = run((dd) => A.crearOT(dd, f), "Orden registrada."); if (r.ok) onCreada(r.orden.id); }}>Registrar orden</Button>}>
      <Field label="Equipo"><Select value={f.equipoId} onChange={(e) => setF({ ...f, equipoId: e.target.value })}><option value="">Elige…</option>{eqs.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.codigo}</option>)}</Select></Field>
      <Chips opciones={Object.entries(A.TIPOS_OT).map(([v, l]) => ({ v, l }))} valor={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} />
      <Field label="Trabajo o falla"><Area value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Field>
      <div className="dos"><Field label="Costo estimado"><Input inputMode="decimal" value={f.costoEstimado} onChange={(e) => setF({ ...f, costoEstimado: e.target.value })} /></Field>
        <Field label="Técnico / proveedor"><Select value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })}><option value="">Por asignar</option>{(d.mant.tecnicos || []).map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field></div>
      <Card tono={sinAut ? "ok" : "warn"}><span className="peq">{sinAut ? `Urgente de hasta ${dinero(tope)}: puedes iniciarla ya; Administración la regulariza después.` : "Requiere autorización de Administración antes de iniciar."}</span></Card>
    </Sheet>
  );
}

function DetalleOT({ d, u, o, onClose, irGastos }) {
  const p = A.permisosVentas(u);
  const [modo, setModo] = useState(null);
  const [f, setF] = useState({ costoReal: String(o.costoEstimado || ""), resultado: "", gasto: !!d.fin, nota: "", motivo: "" });
  const eq = d.mant.equipos.find((e) => e.id === o.equipoId) || {};
  const puedeIniciar = o.estado === "autorizado" || A.puedeIniciarSinAutorizar(o, d);
  const evid = async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; try { const img = await reducirImagen(file, 320); run((dd) => A.notaOT(dd, { otId: o.id, nota: "Evidencia fotográfica", evidencia: img }), "Evidencia agregada."); } catch (x) { aviso(x.message, "bad"); } };
  const gasto = o.gastoId && d.fin ? d.fin.gastos.find((g) => g.id === o.gastoId) : null;
  return (
    <Sheet abierto onClose={onClose} titulo={`${o.folio} · ${eq.nombre || ""}`}
      pie={<div className="v-acciones">
        {p.mantAutoriza && o.estado === "solicitado" && <><Button variante="ok" onClick={() => run((dd) => A.autorizarOT(dd, { otId: o.id, aprobar: true }), "Orden autorizada.")}>Autorizar</Button><Button variante="danger" onClick={() => setModo("rechazar")}>Rechazar</Button></>}
        {p.mantAutoriza && o.autorizacionPendiente && <Button variante="ok" onClick={() => run((dd) => A.autorizarOT(dd, { otId: o.id }), "Orden regularizada.")}>Regularizar</Button>}
        {puedeIniciar && <Button onClick={() => run((dd) => A.iniciarOT(dd, { otId: o.id }), "Orden en proceso.")}>Iniciar</Button>}
        {o.estado === "en_proceso" && <Button variante="ok" onClick={() => setModo("cerrar")}>Cerrar</Button>}
        {A.OT_ABIERTAS.includes(o.estado) && <Button variante="sec" onClick={() => setModo("nota")}>Nota</Button>}
      </div>}>
      <Resumen filas={[["Equipo", `${eq.nombre} · ${eq.codigo}`], ["Sucursal", R.nombreSucursal(d, o.sucursalId)], ["Tipo", A.TIPOS_OT[o.tipo]], ["Estado", A.ESTADOS_OT[o.estado][0] + (o.autorizacionPendiente ? " · por regularizar" : "")],
        ["Costo estimado", dinero(o.costoEstimado)], o.costoReal != null && ["Costo real", dinero(o.costoReal), true], ["Técnico", o.asignadoA || o.proveedor || "Por asignar"], o.autorizadoPor && ["Autorizó", R.nombreUsuario(d, o.autorizadoPor)]]} />
      <p className="txt">{o.descripcion}</p>
      {o.motivoRechazo && <Card tono="bad"><span className="peq">Rechazada: {o.motivoRechazo}</span></Card>}
      {o.resultado && <Card tono="ok"><span className="peq">Resultado: {o.resultado}</span></Card>}
      {gasto && <Card><div className="fila-flex" style={{ justifyContent: "space-between" }}><span className="peq">Registrada como gasto de mantenimiento: {dinero(gasto.monto)} ({fechaCorta(gasto.fecha)})</span>{irGastos && <Button variante="ghost" className="btn-peq" icon="link" onClick={irGastos}>Gastos</Button>}</div></Card>}
      {o.evidencias.length > 0 && <div className="v-mosaico">{o.evidencias.map((x, i) => <img key={i} className="v-foto" src={x.img} alt={`Evidencia ${i + 1}`} />)}</div>}
      {A.OT_ABIERTAS.includes(o.estado) && <label className="btn btn-ghost btn-peq">Agregar evidencia (foto)<input type="file" accept="image/*" capture="environment" hidden onChange={evid} /></label>}
      <Titulo>Bitácora</Titulo>
      <div className="lista">{[...o.historial].reverse().map((h, i) => <Fila key={i} titulo={h.nota || `${h.de || "—"} → ${h.a}`} sub={`${fechaCorta(h.fecha)} ${hora(h.fecha)} · ${R.nombreUsuario(d, h.por)}`} badge={h.de !== h.a ? <BadgeEstado mapa={A.ESTADOS_OT} k={h.a} /> : null} />)}</div>
      {modo === "cerrar" && <Sheet abierto onClose={() => setModo(null)} titulo="Cerrar orden" pie={<Button block onClick={() => { const r = run((dd) => A.cerrarOT(dd, { otId: o.id, costoReal: f.costoReal, resultado: f.resultado, registrarComoGasto: f.gasto }), "Orden cerrada."); if (r.ok) setModo(null); }}>Cerrar orden</Button>}>
        <Field label="Costo real"><Input inputMode="decimal" value={f.costoReal} onChange={(e) => setF({ ...f, costoReal: e.target.value })} /></Field>
        <Field label="Resultado"><Area value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value })} /></Field>
        {d.fin && <label className="v-check"><input type="checkbox" checked={f.gasto} onChange={(e) => setF({ ...f, gasto: e.target.checked })} /> Registrar como gasto de mantenimiento de la sucursal</label>}
        {o.autorizacionPendiente && <p className="peq mu">Urgente sin regularizar: el costo real no puede pasar de {dinero(A.cfgVentas(d).mantUrgenteTope)}.</p>}
      </Sheet>}
      {modo === "nota" && <Sheet abierto onClose={() => setModo(null)} titulo="Nota de bitácora" pie={<Button block onClick={() => { const r = run((dd) => A.notaOT(dd, { otId: o.id, nota: f.nota }), "Nota agregada."); if (r.ok) setModo(null); }}>Agregar</Button>}>
        <Field label="Nota"><Area value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Field></Sheet>}
      {modo === "rechazar" && <Sheet abierto onClose={() => setModo(null)} titulo="Rechazar orden" pie={<Button variante="danger" block onClick={() => { const r = run((dd) => A.autorizarOT(dd, { otId: o.id, aprobar: false, motivo: f.motivo }), "Orden rechazada."); if (r.ok) setModo(null); }}>Rechazar</Button>}>
        <Field label="Motivo"><Area value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Field></Sheet>}
    </Sheet>
  );
}

function EquipoSheet({ d, suc, e, onClose, verOT }) {
  const [f, setF] = useState(e ? { ...e, periodicidadDias: String(e.periodicidadDias), valor: String(e.valor || "") } : { sucursalId: suc, tipo: "sillon", nombre: "", marca: "", modelo: "", serie: "", ubicacion: "", periodicidadDias: "180", valor: "", ultimoServicio: hoy() });
  const c = (k) => (x) => setF({ ...f, [k]: x.target.value });
  const ots = e ? d.mant.ordenes.filter((o) => o.equipoId === e.id) : [];
  return (
    <Sheet abierto onClose={onClose} titulo={e ? `${e.codigo} · ${e.nombre}` : "Nuevo equipo"} pie={<Button block onClick={() => { const r = run((dd) => A.guardarEquipo(dd, f), "Equipo guardado."); if (r.ok) onClose(); }}>Guardar</Button>}>
      <div className="form2">
        <Field label="Tipo"><Select value={f.tipo} onChange={c("tipo")}>{Object.entries(A.TIPOS_EQUIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Nombre"><Input value={f.nombre} onChange={c("nombre")} /></Field>
        <Field label="Marca"><Input value={f.marca} onChange={c("marca")} /></Field>
        <Field label="Modelo"><Input value={f.modelo} onChange={c("modelo")} /></Field>
        <Field label="Serie"><Input value={f.serie} onChange={c("serie")} /></Field>
        <Field label="Ubicación"><Input value={f.ubicacion} onChange={c("ubicacion")} /></Field>
        <Field label="Preventivo cada (días)"><Input inputMode="numeric" value={f.periodicidadDias} onChange={c("periodicidadDias")} /></Field>
        <Field label="Último servicio"><Input type="date" value={f.ultimoServicio} onChange={c("ultimoServicio")} /></Field>
        <Field label="Valor del equipo"><Input inputMode="decimal" value={f.valor} onChange={c("valor")} /></Field>
        {e && <Field label="Estado"><Select value={f.estado === "baja" ? "baja" : "activo"} onChange={(x) => setF({ ...f, estado: x.target.value === "baja" ? "baja" : e.estado })}><option value="activo">En uso</option><option value="baja">Dar de baja</option></Select></Field>}
      </div>
      {e && e.garantiaHasta && <p className="peq mu">Garantía {e.garantiaHasta >= hoy() ? "vigente hasta" : "vencida el"} {fechaCorta(e.garantiaHasta)}.</p>}
      {ots.length > 0 && <><Titulo>Historial de órdenes</Titulo><div className="lista">{ots.map((o) => <Fila key={o.id} titulo={o.folio} sub={`${fechaCorta(o.fecha)} · ${A.TIPOS_OT[o.tipo]} · ${o.descripcion}`} badge={<BadgeEstado mapa={A.ESTADOS_OT} k={o.estado} />} onClick={() => verOT(o.id)} />)}</div></>}
    </Sheet>
  );
}

function Presupuesto({ d, u, sucs, irGastos }) {
  const mes = hoy().slice(0, 7);
  const [edit, setEdit] = useState(null);
  return (
    <>
      {irGastos && <Button variante="ghost" icon="link" onClick={irGastos}>Ver gastos de la sucursal</Button>}
      <div className="lista">{sucs.map((s) => { const x = A.presupuestoMes(d, s.id, mes); const pct = x.presupuesto ? Math.min(100, ((x.ejercido + x.comprometido) / x.presupuesto) * 100) : 0; return (
        <Card key={s.id} tono={x.excedido ? "bad" : undefined}>
          <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{s.nombre}</b>{A.esCentral(u) && <Button variante="ghost" className="btn-peq" onClick={() => setEdit({ sucursalId: s.id, mes, monto: String(x.presupuesto) })}>Fijar</Button>}</div>
          <div className={`v-barra${x.excedido ? " bad" : pct > 80 ? " warn" : ""}`}><i style={{ width: `${pct}%` }} /></div>
          <div className="peq">Presupuesto {dinero(x.presupuesto)} · ejercido {dinero(x.ejercido)} · comprometido {dinero(x.comprometido)} · disponible <b>{dinero(x.disponible)}</b></div>
        </Card>); })}</div>
      {edit && <Sheet abierto onClose={() => setEdit(null)} titulo={`Presupuesto ${edit.mes} · ${R.nombreSucursal(d, edit.sucursalId)}`} pie={<Button block onClick={() => { const r = run((dd) => A.fijarPresupuestoMant(dd, edit), "Presupuesto fijado."); if (r.ok) setEdit(null); }}>Guardar</Button>}>
        <Field label="Monto mensual"><Input inputMode="decimal" value={edit.monto} onChange={(e) => setEdit({ ...edit, monto: e.target.value })} /></Field></Sheet>}
    </>
  );
}
