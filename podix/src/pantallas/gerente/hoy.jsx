// Tablero del gerente: KPIs por periodo (cada tarjeta abre su detalle) y productividad por podólogo.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import { carteraPorPaciente, difCorte, kpisSucursal } from "../../store/acciones_gerente.js";
import { dinero, fechaCorta, hora } from "../../lib/format.js";
import { Avatar, Badge, Card, Chips, Fila, Kpi, Resumen, Sheet, Titulo, Vacio } from "../../ui/index.jsx";

const PER = { hoy: "Hoy", semana: "Últimos 7 días", mes: "Últimos 30 días" };

export default function GerenteHoy() {
  const { d, sucursalId, sucursal } = useSesion();
  const [per, setPer] = useState("hoy");
  const [det, setDet] = useState(null);
  const k = useMemo(() => kpisSucursal(d, sucursalId, per), [d, sucursalId, per]);
  const cartera = useMemo(() => carteraPorPaciente(d, sucursalId), [d, sucursalId]);
  const caja = k.faltante + k.sobrante;

  const tarjetas = [
    { id: "ventas", label: "Ventas", valor: dinero(k.ventas), nota: `${k.nVentas} tickets${k.devuelto ? ` · −${dinero(k.devuelto)} devol.` : ""}`, tono: "ok" },
    { id: "atendidos", label: "Pacientes atendidos", valor: k.atendidos, nota: "Consultas cerradas/cobradas" },
    { id: "ocupacion", label: "Ocupación de agenda", valor: `${k.ocupacionPct}%`, nota: `${Math.round(k.minOcupados / 60)} h de ${Math.round(k.minDisponibles / 60)} h`, tono: k.ocupacionPct < 40 ? "warn" : "ok" },
    { id: "noshow", label: "No-shows", valor: `${k.noShowPct}%`, nota: `${k.nNoShows} de ${k.baseNoShow} citas`, tono: k.noShowPct > 10 ? "bad" : "ok" },
    { id: "ticket", label: "Ticket promedio", valor: dinero(k.ticket), nota: "Venta / ticket", tono: "info" },
    { id: "cartera", label: "Cartera vencida", valor: dinero(k.cartera), nota: `${cartera.length} pacientes`, tono: k.cartera ? "bad" : "ok" },
    { id: "caja", label: "Caja: faltante/sobrante", valor: dinero(caja), nota: `Falt. ${dinero(k.faltante)} · Sobr. ${dinero(k.sobrante)}`, tono: caja < 0 ? "bad" : caja > 0 ? "warn" : "ok" },
    { id: "bajo", label: "Productos bajo mínimo", valor: k.bajoMinimo, nota: "En el almacén de la sucursal", tono: k.bajoMinimo ? "warn" : "ok" },
  ];
  return (
    <>
      <div className="fila-t"><b>{sucursal?.nombre}</b><span className="mu peq">{PER[per]}</span></div>
      <Chips valor={per} onChange={setPer} opciones={[{ v: "hoy", l: "Hoy" }, { v: "semana", l: "Semana" }, { v: "mes", l: "Mes" }]} />
      <div className="kpis">
        {tarjetas.map((t) => (
          <div key={t.id} role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => setDet(t.id)} onKeyDown={(e) => e.key === "Enter" && setDet(t.id)}>
            <Kpi label={t.label} valor={t.valor} nota={t.nota} tono={t.tono} />
          </div>
        ))}
      </div>
      <Titulo>Productividad por podólogo</Titulo>
      <div className="lista">
        {k.productividad.map((p) => (
          <Fila key={p.podologoId} izquierda={<Avatar nombre={R.nombreUsuario(d, p.podologoId)} />} titulo={R.nombreUsuario(d, p.podologoId)}
            badge={<Badge tono="ok">{dinero(p.ingreso)}</Badge>} datos={<><span>{p.consultas} consultas</span><span>{p.consultas ? dinero(p.ingreso / p.consultas) : "$0"} por consulta</span></>} />
        ))}
        {!k.productividad.length && <Vacio icon="chart">Sin consultas en el periodo.</Vacio>}
      </div>
      <Sheet abierto={!!det} onClose={() => setDet(null)} titulo={det ? tarjetas.find((t) => t.id === det).label : ""}>
        {det && <Detalle id={det} k={k} cartera={cartera} />}
      </Sheet>
    </>
  );
}

function Detalle({ id, k, cartera }) {
  const { d, sucursalId } = useSesion();
  const dt = k.det;
  if (id === "ventas") return (<>
    <Card><Resumen filas={[["Ventas brutas", dinero(k.ventasBrutas)], ["Devoluciones", `−${dinero(k.devuelto)}`], ["Ventas netas", dinero(k.ventas), true]]} /></Card>
    <div className="lista">{dt.ventas.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40).map((v) => (
      <Fila key={v.id} titulo={`${v.folio} · ${R.nombrePaciente(d, v.pacienteId)}`} badge={<Badge tono="ok">{dinero(v.total)}</Badge>} datos={<><span>{fechaCorta(v.fecha)} {hora(v.fecha)}</span><span>{v.pagos.map((p) => p.forma).join(" + ")}</span></>} />
    ))}{!dt.ventas.length && <Vacio icon="receipt">Sin ventas en el periodo.</Vacio>}</div></>);
  if (id === "atendidos") return <div className="lista">{dt.consultas.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 40).map((c) => (
    <Fila key={c.id} titulo={R.nombrePaciente(d, c.pacienteId)} sub={c.diagnostico} badge={<Badge tono={c.estado === "cobrada" ? "ok" : "warn"}>{c.estado === "cobrada" ? "Cobrada" : "Por cobrar"}</Badge>} datos={<><span>{fechaCorta(c.fecha)}</span><span>{R.nombreUsuario(d, c.podologoId)}</span></>} />
  ))}{!dt.consultas.length && <Vacio>Sin consultas en el periodo.</Vacio>}</div>;
  if (id === "ocupacion") return <div className="lista">{dt.ocupacion.map((o) => (
    <Fila key={o.fecha} titulo={fechaCorta(o.fecha)} badge={<Badge tono={o.ocupado / o.disponible < 0.4 ? "warn" : "ok"}>{Math.round((o.ocupado / o.disponible) * 100)}%</Badge>} datos={<><span>{o.podologos} podólogos</span><span>{o.ocupado} de {o.disponible} min</span></>} />
  ))}{!dt.ocupacion.length && <Vacio>Sin agenda en el periodo.</Vacio>}<p className="mu peq">Disponible = 8 h por podólogo con citas ese día. Ocupado = citas atendidas, confirmadas, en sala o en atención.</p></div>;
  if (id === "noshow") return <div className="lista">{dt.noShows.map((c) => (
    <Fila key={c.id} titulo={R.nombrePaciente(d, c.pacienteId)} sub={R.nombreServicio(d, c.servicioId)} badge={<Badge tono="bad">No asistió</Badge>} datos={<><span>{fechaCorta(c.inicio)} {hora(c.inicio)}</span><span>{R.nombreUsuario(d, c.podologoId)}</span></>} />
  ))}{!dt.noShows.length && <Vacio icon="check">Sin no-shows en el periodo.</Vacio>}</div>;
  if (id === "ticket") return <Card><Resumen filas={[["Ventas brutas", dinero(k.ventasBrutas)], ["Tickets", k.nVentas], ["Ticket promedio", dinero(k.ticket), true]]} /></Card>;
  if (id === "cartera") return <div className="lista">{cartera.map((c) => (
    <Fila key={c.pacienteId} titulo={R.nombrePaciente(d, c.pacienteId)} badge={<Badge tono="bad">{dinero(c.vencido)}</Badge>} datos={<><span>{c.diasMora} d de mora</span><span>Saldo {dinero(c.saldo)}</span></>} />
  ))}{!cartera.length && <Vacio icon="check">Sin cartera vencida.</Vacio>}<p className="mu peq">Bloquea el crédito desde Caja y cartera.</p></div>;
  if (id === "caja") return <div className="lista">{dt.difs.map(({ turno: t, dif }) => (
    <Fila key={t.id} titulo={`Turno ${t.turno} · ${R.nombreUsuario(d, t.cajeroId)}`} sub={t.corte.justificacion} badge={<Badge tono={dif < 0 ? "bad" : "warn"}>{dinero(dif)}</Badge>} datos={<span>{t.corte.estado.replace("_", " ")}</span>} />
  ))}{!dt.difs.length && <Vacio icon="check">Sin diferencias de caja en el periodo.</Vacio>}</div>;
  if (id === "bajo") return <div className="lista">{dt.bajo.map((p) => (
    <Fila key={p.id} titulo={p.nombre} sub={p.sku} badge={<Badge tono="bad">{R.stock(d, sucursalId, p.id)}/{p.minimo}</Badge>} />
  ))}{!dt.bajo.length && <Vacio icon="check">Todo sobre el mínimo.</Vacio>}</div>;
  return null;
}
