import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_podologo.js";
import { Card, Fila, Badge, Chips, Kpi, Titulo, Vacio } from "../../ui/index.jsx";
import { Progreso, useAsegurarPlanes } from "../../componentes/podologo/comunes.jsx";
import { dinero, hoy, fechaCorta } from "../../lib/format.js";

export default function Productividad() {
  const { d, u } = useSesion();
  const [per, setPer] = useState("semana");
  const [suc, setSuc] = useState("todas");
  useAsegurarPlanes(d);
  if (u.rol !== "podologo") return <Vacio icon="lock">Esta pantalla es para podólogos.</Vacio>;

  const rango = A.rangoPeriodo(per);
  const p = A.productividad(d, u.id, { ...rango, sucursalId: suc === "todas" ? null : suc });
  const planes = A.resumenPlanes(d, u.id);
  return (
    <>
      <Chips opciones={[{ v: "semana", l: "Semana (7 días)" }, { v: "mes", l: "Mes (30 días)" }]} valor={per} onChange={setPer} />
      <Chips scroll opciones={[{ v: "todas", l: "Todas" }, ...u.sucursales.map((s) => ({ v: s, l: R.nombreSucursal(d, s) }))]} valor={suc} onChange={setSuc} />
      <div className="peq mu">{fechaCorta(rango.desde)} al {fechaCorta(rango.hasta)}</div>
      <div className="kpis">
        <Kpi label="Consultas atendidas" valor={p.consultas} />
        <Kpi label="Ingreso generado" valor={dinero(p.ingreso)} tono="ok" nota={`${p.ventas} venta(s)`} />
        <Kpi label="Ticket promedio" valor={dinero(p.ticket)} tono="info" />
        <Kpi label="Comisión estimada" valor={dinero(p.comision)} tono="warn" nota={`${A.COMISION_PCT} %`} />
      </div>
      <Card tono="warn"><b>Supuesto, pendiente PA-V5</b><div className="peq">Comisión estimada = ingreso × {A.COMISION_PCT} %. La base, el porcentaje por rol y cuándo se genera aún no están definidos por el cliente.</div></Card>

      <Titulo>Por sucursal</Titulo>
      {p.porSucursal.length ? <div className="lista">{p.porSucursal.map((s) => (
        <Fila key={s.sucursalId} titulo={R.nombreSucursal(d, s.sucursalId)} sub={`${s.consultas} consulta(s)`} derecha={<div className="der"><b>{dinero(s.ingreso)}</b><div className="peq mu">Com. {dinero(A.comisionEstimada(s.ingreso))}</div></div>} />
      ))}</div> : <Vacio icon="chart">Sin consultas ni ventas en este periodo.</Vacio>}

      <Titulo>Cumplimiento de planes de tratamiento</Titulo>
      <div className="kpis">
        <Kpi label="Avance global" valor={`${planes.avancePct} %`} />
        <Kpi label="Planes activos" valor={planes.activos} nota={`${planes.completados} completados`} />
      </div>
      {planes.enRiesgo > 0 && <Card tono="warn"><span className="peq">{planes.enRiesgo} plan(es) sin sesión en más de 1.5 veces su frecuencia.</span></Card>}
      <div className="lista">{planes.planes.map((pl) => (
        <Card key={pl.id}>
          <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{R.nombrePaciente(d, pl.pacienteId)}</b>
            <Badge tono={pl.estado === "completado" ? "ok" : A.planEnRiesgo(pl) ? "warn" : "info"}>{pl.estado === "completado" ? "Completado" : A.planEnRiesgo(pl) ? "En riesgo" : "Al corriente"}</Badge></div>
          <div className="peq mu" style={{ margin: "2px 0 6px" }}>{pl.descripcion} · {pl.frecuencia} · {pl.sesionActual}/{pl.sesionesTotal}</div>
          <Progreso pct={(pl.sesionActual / pl.sesionesTotal) * 100} />
        </Card>))}</div>
      {!planes.planes.length && <Vacio icon="clipboard">Sin planes de tratamiento.</Vacio>}
    </>
  );
}
