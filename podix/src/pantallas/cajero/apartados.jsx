// Apartados (abonar, liquidar, entregar, prórroga, liberar) y créditos / plazos (abonos con mora).
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { liberarApartado } from "../../store/acciones.js";
import { abonarApartado, aplicarPoliticaAnticipo, deudaParcialidad, deudaPlan, entregarApartado, entregarPlan, num, registrarAbonoCredito, repartirAbono, solicitarProrroga } from "../../store/acciones_cajero.js";
import { Badge, Button, Card, Chips, Confirmar, Field, Fila, Input, Resumen, Sheet, Titulo, Vacio, Buscador, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta, normaliza } from "../../lib/format.js";
import SheetPago from "../../componentes/cajero/PagoMixto.jsx";
import Ticket from "../../componentes/cajero/Comprobante.jsx";

const TONO_AP = { vigente: "ok", por_vencer: "warn", vencido: "bad" };
const TXT_AP = { vigente: "Vigente", por_vencer: "Por vencer", vencido: "Vencido" };
const TONO_PAR = { pendiente: "neutral", en_gracia: "warn", vencida: "bad", pagada: "ok" };
const TXT_PAR = { pendiente: "Pendiente", en_gracia: "En gracia", vencida: "Vencida", pagada: "Pagada" };
const POLITICA = { no_devuelve: "El anticipo NO se devuelve (se pierde).", devuelve: "El anticipo se devuelve en caja.", saldo_a_favor: "El anticipo queda como saldo a favor del paciente." };

export default function Apartados() {
  const { d, u, sucursalId, params } = useSesion();
  const [sec, setSec] = useState("apartados");
  return (
    <>
      <Chips opciones={[{ v: "apartados", l: "Apartados" }, { v: "creditos", l: "Créditos y plazos" }]} valor={sec} onChange={setSec} />
      {sec === "apartados" ? <SeccionApartados d={d} u={u} sucursalId={sucursalId} params={params} /> : <SeccionCreditos d={d} u={u} sucursalId={sucursalId} />}
    </>
  );
}

function SeccionApartados({ d, u, sucursalId, params }) {
  const [f, setF] = useState("activos");
  const [selId, setSelId] = useState(null);
  const [monto, setMonto] = useState("");
  const [pago, setPago] = useState(null); // { modo: "abono"|"liquidar", monto }
  const [liberar, setLiberar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [ticket, setTicket] = useState(null);
  const turno = R.turnoAbierto(d, u.id);
  const lista = d.apartados.filter((a) => a.sucursalId === sucursalId && (f === "activos" ? a.estado === "activo" : f === "vencidos" ? a.estado === "activo" && R.estadoApartado(a) === "vencido" : a.estado !== "activo"))
    .sort((a, b) => a.vence.localeCompare(b.vence));
  const ap = selId ? d.apartados.find((a) => a.id === selId) : null;
  const est = ap ? R.estadoApartado(ap) : null;
  const saldo = ap ? R.saldoApartado(ap) : 0;
  const porEntregar = ap && ap.estado === "activo" && saldo <= 0.005;
  const pend = ap ? d.autorizaciones.find((a) => a.tipo === "prorroga" && a.estado === "pendiente" && a.ref?.apartadoId === ap.id) : null;
  const cerrar = () => { setSelId(null); setMonto(""); setPago(null); };

  const cobrar = (pagos) => {
    setCargando(true);
    const r = mutar((dd) => {
      const a = abonarApartado(dd, { apartadoId: ap.id, pagos });
      if (!a.ok || pago.modo !== "liquidar") return a;
      return entregarApartado(dd, { apartadoId: ap.id });
    });
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    if (r.venta) { aviso("Liquidado y entregado"); setTicket(r.venta); cerrar(); } else { aviso("Abono registrado"); setPago(null); setMonto(""); }
  };
  const entregar = () => {
    const r = mutar((dd) => entregarApartado(dd, { apartadoId: ap.id }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Producto entregado"); setTicket(r.venta); cerrar();
  };
  const prorroga = () => {
    const r = mutar((dd) => solicitarProrroga(dd, { apartadoId: ap.id }));
    r.ok ? aviso(`Prórroga de 5 días solicitada al nivel ${params.prorrogaAutorizaRol}`) : aviso(r.error, "bad");
  };
  const liberarYa = () => {
    if (params.politicaAnticipoVencido === "devuelve" && !turno) { setLiberar(false); return aviso("Abre turno para devolver el anticipo en caja.", "warn"); }
    const l = liberarApartado(ap.id);
    if (!l.ok) return aviso("No se pudo liberar.", "bad");
    const r = mutar((dd) => aplicarPoliticaAnticipo(dd, { apartadoId: ap.id }));
    setLiberar(false); cerrar();
    aviso(r.ok ? `Liberado · anticipo ${r.resolucion === "perdido" ? "no devuelto" : r.resolucion === "devuelto" ? "devuelto" : "como saldo a favor"}` : r.error, r.ok ? "ok" : "warn");
  };
  const m = num(monto);

  return (
    <>
      <Chips opciones={[{ v: "activos", l: "Activos" }, { v: "vencidos", l: "Vencidos" }, { v: "cerrados", l: "Cerrados" }]} valor={f} onChange={setF} />
      <div className="lista">
        {lista.map((a) => { const e = R.estadoApartado(a), s = R.saldoApartado(a); return (
          <Fila key={a.id} titulo={R.nombrePaciente(d, a.pacienteId)} sub={`${a.folio} · ${a.cant} × ${a.nombre}`}
            badge={a.estado === "activo" ? (s <= 0.005 ? <Badge tono="info">Por entregar</Badge> : <Badge tono={TONO_AP[e]}>{TXT_AP[e]}</Badge>) : <Badge tono="neutral">{a.estado}</Badge>}
            datos={<><span>Saldo {dinero(s)}</span><span>Pagado {dinero(R.pagadoApartado(a))}</span><span>Vence {fechaCorta(a.vence)}</span></>} onClick={() => setSelId(a.id)} />); })}
        {!lista.length && <Vacio icon="bookmark">No hay apartados en esta vista.</Vacio>}
      </div>

      <Sheet abierto={!!ap} onClose={cerrar} titulo={ap ? ap.folio : ""}
        pie={ap && ap.estado === "activo" ? (
          porEntregar ? <Button block icon="check" onClick={entregar}>Entregar producto</Button>
          : est === "vencido" ? <Button block variante="danger" icon="x" onClick={() => setLiberar(true)}>Liberar apartado vencido</Button>
          : <div className="dos"><Button block variante="sec" disabled={!(m > 0 && m < saldo)} onClick={() => setPago({ modo: "abono", monto: m })}>Abonar</Button><Button block onClick={() => setPago({ modo: "liquidar", monto: saldo })}>Liquidar y entregar</Button></div>
        ) : null}>
        {ap && (<>
          <Card><Resumen filas={[["Paciente", R.nombrePaciente(d, ap.pacienteId)], ["Producto", `${ap.cant} × ${ap.nombre}`], ["Precio", dinero(ap.precio)], ["Pagado", dinero(R.pagadoApartado(ap))], ["Vence", fechaCorta(ap.vence) + (ap.prorrogas.length ? ` (${ap.prorrogas.length} prórroga)` : "")], ["Saldo", dinero(saldo), true]]} /></Card>
          {ap.estado === "activo" && !porEntregar && est !== "vencido" && (
            <Field label="Monto del abono" hint={`Saldo ${dinero(saldo)}. Para pagarlo todo usa Liquidar y entregar.`}>
              <Input type="text" inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} />
            </Field>)}
          {ap.estado === "activo" && !turno && <Badge tono="warn">Sin turno abierto: no podrás cobrar</Badge>}
          {ap.estado === "activo" && (est === "vencido" || est === "por_vencer") && saldo > 0.005 && (
            pend ? <Badge tono="info">Prórroga pendiente de autorización</Badge> : <Button variante="ghost" icon="clock" block onClick={prorroga}>Solicitar prórroga (5 días)</Button>)}
          {est === "vencido" && saldo > 0.005 && <Card tono="bad"><b>Política de anticipo</b><p className="txt">{POLITICA[params.politicaAnticipoVencido]} Anticipo acumulado: {dinero(R.pagadoApartado(ap))}.</p></Card>}
          {ap.anticipoResolucion && <Badge tono="neutral">Anticipo: {ap.anticipoResolucion}</Badge>}
          <Titulo>Abonos</Titulo>
          <div className="lista">{ap.abonos.map((a, i) => <Fila key={i} titulo={dinero(a.monto)} sub={fechaCorta(a.fecha)} />)}</div>
        </>)}
      </Sheet>

      <SheetPago abierto={!!pago && !!ap} onClose={() => setPago(null)} total={pago ? pago.monto : 0} titulo={pago?.modo === "liquidar" ? "Liquidar y entregar" : "Abonar"} confirmar={pago?.modo === "liquidar" ? "Cobrar y entregar" : "Abonar"} onConfirmar={cobrar} cargando={cargando} />
      <Confirmar abierto={liberar} peligro titulo="Liberar apartado" confirmar="Liberar" texto={ap ? `El producto vuelve a estar disponible. ${POLITICA[params.politicaAnticipoVencido]}` : ""} onSi={liberarYa} onNo={() => setLiberar(false)} />
      {ticket && <Ticket venta={ticket} onClose={() => setTicket(null)} />}
    </>
  );
}

function SeccionCreditos({ d, u, sucursalId }) {
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [monto, setMonto] = useState("");
  const [pago, setPago] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ticket, setTicket] = useState(null);
  const turno = R.turnoAbierto(d, u.id);
  const n = normaliza(q).trim();
  const planes = d.planes.filter((p) => !["liquidado", "cancelado"].includes(p.estado) && (!n || normaliza(`${R.nombrePaciente(d, p.pacienteId)} ${p.folio}`).includes(n)))
    .map((p) => ({ p, dias: R.diasMoraPlan(d, p) })).sort((a, b) => b.dias - a.dias).slice(0, 60);
  const plan = selId ? d.planes.find((p) => p.id === selId) : null;
  const par = plan ? d.params[plan.sucursalId] : null;
  const deuda = plan ? deudaPlan(plan, par) : null;
  const m = num(monto);
  const rep = plan && m > 0 ? repartirAbono(plan, par, m) : null;
  const cerrar = () => { setSelId(null); setMonto(""); setPago(null); };

  const cobrar = (pagos) => {
    setCargando(true);
    const r = mutar((dd) => registrarAbonoCredito(dd, { planId: plan.id, pagos }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.liquidado ? "Plan liquidado" : "Abono registrado"); setPago(null); setMonto("");
  };
  const entregar = () => {
    const r = mutar((dd) => entregarPlan(dd, { planId: plan.id }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Producto entregado"); setTicket(r.venta);
  };

  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="Paciente o folio CR-…" />
      <div className="lista">
        {planes.map(({ p, dias }) => {
          const dp = deudaPlan(p, d.params[p.sucursalId]), bloq = p.estado === "pendiente_autorizacion";
          return <Fila key={p.id} titulo={R.nombrePaciente(d, p.pacienteId)} sub={`${p.folio} · ${p.tipo === "abierto" ? "Crédito abierto" : "Venta a plazos"} · ${R.nombreSucursal(d, p.sucursalId)}`}
            badge={bloq ? <Badge tono="info">Por autorizar</Badge> : dias > 0 ? <Badge tono="bad">{dias} d mora</Badge> : <Badge tono="ok">Al corriente</Badge>}
            datos={<><span>Capital {dinero(dp.capital)}</span><span>Mora {dinero(dp.mora)}</span></>}
            onClick={() => (bloq ? aviso("El plan está bloqueado hasta que lo autorice el nivel correspondiente.", "warn") : setSelId(p.id))} />;
        })}
        {!planes.length && <Vacio icon="card">Sin créditos ni planes con ese criterio.</Vacio>}
      </div>

      <Sheet abierto={!!plan} onClose={cerrar} titulo={plan ? plan.folio : ""}
        pie={plan ? <Button block disabled={!rep || !rep.ok || !turno} onClick={() => setPago({ monto: m })}>{turno ? "Registrar abono" : "Abre turno para cobrar"}</Button> : null}>
        {plan && (<>
          <Card><Resumen filas={[["Paciente", R.nombrePaciente(d, plan.pacienteId)], ["Tipo", plan.tipo === "abierto" ? `Crédito abierto · interés ${par.interesMensualPct} % mensual` : `A plazos · recargo único ${par.recargoUnicoPct} %`], ["Gracia", `${par.diasGracia} días`], ["Capital pendiente", dinero(deuda.capital)], ["Mora", dinero(deuda.mora)], ["Total a liquidar", dinero(deuda.total), true]]} /></Card>
          <Titulo>Parcialidades</Titulo>
          <div className="lista">
            {plan.parcialidades.map((p) => { const x = deudaParcialidad(plan, p, par); return (
              <Fila key={p.n} titulo={`Parcialidad ${p.n}`} badge={<Badge tono={TONO_PAR[x.estado]}>{TXT_PAR[x.estado]}</Badge>}
                datos={<><span>Vence {fechaCorta(p.vence)}</span><span>Capital {dinero(p.capital)}</span><span>Pagado {dinero(p.pagado)}</span>{x.mora > 0 && <span style={{ color: "var(--er)" }}>Mora {dinero(x.mora)}</span>}</>} />); })}
          </div>
          <Field label="Monto del abono" hint="Se aplica a las parcialidades más antiguas: primero la mora y luego el capital (supuesto, pendiente CR3).">
            <Input type="text" inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Field>
          <div className="chips">
            {deuda.vencido > 0 && <button className="chip" onClick={() => setMonto(String(deuda.vencido))}>Pagar vencido {dinero(deuda.vencido)}</button>}
            <button className="chip" onClick={() => setMonto(String(deuda.total))}>Liquidar {dinero(deuda.total)}</button>
          </div>
          {rep && (rep.ok ? <Card tono="info"><Resumen filas={[["A mora", dinero(rep.mora)], ["A capital", dinero(rep.capital)], ...rep.aplicaciones.map((a) => [`Parcialidad ${a.n}`, dinero(a.mora + a.capital)])]} /></Card> : <Badge tono="bad">{rep.error}</Badge>)}
          {!turno && <Badge tono="warn">Sin turno abierto: no podrás cobrar</Badge>}
          {plan.pendienteEntrega !== false && plan.partidas?.length > 0 && !plan.entregado && plan.sucursalId === sucursalId &&
            <Button variante="sec" block icon="box" onClick={entregar}>Entregar producto ({plan.partidas.map((x) => `${x.cant} × ${x.nombre}`).join(", ")})</Button>}
          <small className="mu">Los abonos se pueden cobrar en cualquier sucursal.</small>
        </>)}
      </Sheet>
      <SheetPago abierto={!!pago && !!plan} onClose={() => setPago(null)} total={pago ? pago.monto : 0} titulo="Abono de crédito" confirmar="Registrar abono" onConfirmar={cobrar} cargando={cargando} />
      {ticket && <Ticket venta={ticket} onClose={() => setTicket(null)} />}
    </>
  );
}
