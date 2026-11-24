import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Card, Chips, Fila, Kpi, Sheet, Titulo, Vacio } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import { PERIODOS, ORDENES_RANKING, periodo, rankingSucursales, resumenSucursal, detalleSucursal } from "../../store/acciones_admin.js";
import { Barra } from "../../componentes/admin/comunes.jsx";

const METRICAS = [
  ["ventas", "Ventas", (v) => dinero(v)],
  ["pacientes", "Pacientes", (v) => v],
  ["ticket", "Ticket", (v) => dinero(v)],
  ["ocupacion", "Ocupación", (v) => `${v} %`],
];

export default function Consolidado() {
  const { d } = useSesion();
  const [per, setPer] = useState("hoy");
  const [orden, setOrden] = useState("ventas");
  const [sel, setSel] = useState(null);
  const p = useMemo(() => periodo(per), [per]);
  const g = useMemo(() => resumenSucursal(d, p), [d, p]);
  const rank = useMemo(() => rankingSucursales(d, p, orden), [d, p, orden]);
  const max = useMemo(() => Object.fromEntries(METRICAS.map(([k]) => [k, Math.max(...rank.map((r) => r[k]), 0)])), [rank]);
  const det = useMemo(() => (sel ? detalleSucursal(d, p, sel) : null), [d, p, sel]);
  const rs = sel ? rank.find((r) => r.sucursalId === sel) : null;

  return (
    <>
      <Chips opciones={PERIODOS} valor={per} onChange={setPer} />
      <div className="mu peq">{p.etiqueta} · {p.desde === p.hasta ? p.desde : `${p.desde} a ${p.hasta}`}</div>
      <div className="kpis">
        <Kpi label="Ventas netas" valor={dinero(g.ventas)} nota={`${g.nVentas} tickets`} />
        <Kpi label="Pacientes atendidos" valor={g.pacientes} tono="ok" />
        <Kpi label="Ticket promedio" valor={dinero(g.ticket)} tono="info" />
        <Kpi label="Ocupación de agenda" valor={`${g.ocupacion} %`} tono="warn" />
        <Kpi label="Cartera vencida" valor={dinero(g.cartera)} tono="bad" nota="a hoy" />
        <Kpi label="Faltantes de caja" valor={dinero(g.faltantes)} tono={g.faltantes ? "bad" : "ok"} />
      </div>

      <Titulo>Ranking por sucursal</Titulo>
      <Chips scroll opciones={ORDENES_RANKING} valor={orden} onChange={setOrden} />
      <div className="lista">
        {rank.map((r, i) => (
          <Card key={r.sucursalId} onClick={() => setSel(r.sucursalId)}>
            <div className="fila-flex" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <b>{i + 1}. {r.nombre}</b>
              {r.faltantes > 0 ? <Badge tono="bad">Faltante {dinero(r.faltantes)}</Badge> : <Badge tono="neutral">{r.nVentas} tickets</Badge>}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {METRICAS.map(([k, l, f]) => (
                <div key={k} className="fila-flex" style={{ opacity: k === orden ? 1 : 0.75 }}>
                  <span className="peq mu" style={{ width: 70, flex: "none", fontWeight: k === orden ? 700 : 400 }}>{l}</span>
                  <Barra valor={r[k]} max={max[k]} tono={k === orden ? "var(--p)" : "var(--mu)"} />
                  <span className="peq der" style={{ width: 84, flex: "none", fontWeight: k === orden ? 700 : 400 }}>{f(r[k])}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {!rank.length && <Vacio icon="chart">Sin sucursales.</Vacio>}
      </div>

      <Sheet abierto={!!sel} onClose={() => setSel(null)} titulo={rs ? `Sucursal ${rs.nombre}` : ""}>
        {rs && det && (<>
          <div className="kpis">
            <Kpi label="Ventas" valor={dinero(rs.ventas)} />
            <Kpi label="Pacientes" valor={rs.pacientes} tono="ok" />
            <Kpi label="Ticket" valor={dinero(rs.ticket)} tono="info" />
            <Kpi label="Ocupación" valor={`${rs.ocupacion} %`} tono="warn" />
            <Kpi label="Cartera vencida" valor={dinero(rs.cartera)} tono="bad" />
            <Kpi label="Faltantes caja" valor={dinero(rs.faltantes)} />
          </div>
          <Titulo>Top servicios</Titulo>
          <div className="lista">
            {det.topServicios.map((x) => <Fila key={x.id} titulo={x.nombre} datos={<span>{x.cant} vendidos</span>} derecha={<b>{dinero(x.importe)}</b>} />)}
            {!det.topServicios.length && <Vacio icon="file">Sin servicios cobrados en el periodo.</Vacio>}
          </div>
          <Titulo>Top productos</Titulo>
          <div className="lista">
            {det.topProductos.map((x) => <Fila key={x.id} titulo={x.nombre} datos={<span>{x.cant} vendidos</span>} derecha={<b>{dinero(x.importe)}</b>} />)}
            {!det.topProductos.length && <Vacio icon="box">Sin productos vendidos en el periodo.</Vacio>}
          </div>
          <Titulo>Podólogos</Titulo>
          <div className="lista">
            {det.podologos.map((x) => <Fila key={x.id} titulo={x.nombre} datos={<><span>{x.consultas} consultas</span><span>{x.citas} citas</span></>} derecha={<b>{dinero(x.ingresos)}</b>} />)}
            {!det.podologos.length && <Vacio icon="users">Sin actividad de podólogos en el periodo.</Vacio>}
          </div>
        </>)}
      </Sheet>
    </>
  );
}
