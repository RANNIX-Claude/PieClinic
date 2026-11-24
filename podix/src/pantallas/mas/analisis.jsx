// Análisis de datos (gerente de su sucursal, administración y dirección): tableros con gráficas SVG propias.
// Todo se calcula del estado: d.hist para meses cerrados y d.ventas / d.citas / d.consultas para lo reciente. Sin cifras fijas.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_desempeno.js";
import { Badge, Card, Chips, Kpi, Titulo, Vacio } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { dinero, fechaCorta, hoy, redondear } from "../../lib/format.js";
import { BotonCSV, descargar, dif, tonoDif } from "../../componentes/desempeno/comunes.jsx";
import { BarraApilada, BarrasHorizontales, GraficaPeriodos, PALETA } from "../../componentes/desempeno/graficas.jsx";

const csv = (nombre, columnas, filas) => descargar(`${nombre}-${hoy()}.csv`, A.aCSV(columnas, filas));

export default function Analisis() {
  const { d, u } = useSesion();
  const [pt, setPt] = useState("mes");
  const [suc, setSuc] = useState("todas");
  const [vistaVentas, setVistaVentas] = useState("total");
  const rolOk = u && (A.esAdmin(u) || u.rol === "gerente");
  const visibles = u ? A.sucursalesVisibles(d, u) : [];
  const sucursalId = suc === "todas" ? (visibles.length === 1 ? visibles[0] : null) : suc;
  const per = useMemo(() => A.periodoAnalisis(d, pt), [d, pt]);
  const serie = useMemo(() => A.serieMensual(d, { sucursalId }), [d, sucursalId]);
  const rango = { desde: per.vivoDesde, hasta: per.hasta };
  const sel = serie.filter((x) => per.meses.includes(x.mes));
  const ranking = useMemo(() => A.rankingPodologos(d, { ...rango, sucursalId }), [d, per, sucursalId]);
  const ocup = useMemo(() => A.ocupacionPorSucursal(d, { ...rango, sucursalId }), [d, per, sucursalId]);
  const prod = useMemo(() => A.analisisProductos(d, { desde: per.ventasDesde, hasta: per.hasta, sucursalId }), [d, per, sucursalId]);
  const cmp = useMemo(() => A.comparativoSucursales(d, per, { sucursalId }), [d, per, sucursalId]);
  const cartera = useMemo(() => A.carteraPorSucursal(d, sucursalId), [d, sucursalId]);
  if (!rolOk) return <Vacio icon="lock">El análisis de datos es para gerentes, Administración central y Dirección.</Vacio>;

  const ventasPer = sel.reduce((a, x) => a + x.total, 0), pacPer = sel.reduce((a, x) => a + x.pacientes, 0);
  const mix = { servicios: sel.reduce((a, x) => a + x.servicios, 0), plantillas: sel.reduce((a, x) => a + x.plantillas, 0), productos: sel.reduce((a, x) => a + x.productos, 0) };
  const carteraTotal = cartera.reduce((a, x) => a + x.monto, 0);
  const miFila = cmp.filas[0];
  const lineasSuc = !sucursalId && visibles.length > 1;
  const datosMes = serie.map((x) => ({ ...x, etq: A.nombreMesCorto(x.mes).split(" ")[0] }));
  const nombreSuc = sucursalId ? R.nombreSucursal(d, sucursalId) : "las 7 sucursales";

  return (
    <>
      <Chips opciones={A.PERIODOS_ANALISIS} valor={pt} onChange={setPt} />
      {visibles.length > 1 && <Chips scroll opciones={[{ v: "todas", l: "Todas" }, ...visibles.map((s) => ({ v: s, l: R.nombreSucursal(d, s) }))]} valor={suc} onChange={setSuc} />}
      <div className="peq mu">Datos de {nombreSuc}. {per.limitado ? `Las citas y consultas (ocupación, ranking) existen desde el ${fechaCorta(per.vivoDesde)} y los tickets (productos, ticket promedio) desde el ${fechaCorta(per.ventasDesde)}; antes solo hay totales mensuales.` : "Detalle operativo del periodo completo."}</div>

      <div className="dsp-kpis">
        <Kpi label="Ventas del periodo" valor={dinero(ventasPer)} tono="ok" nota={`${per.meses.length} mes(es)${per.meses.includes(A.mesActual()) ? ", el actual a la fecha" : ""}`} />
        <Kpi label="Pacientes atendidos" valor={pacPer.toLocaleString("es-MX")} tono="info" />
        <Kpi label="Ticket promedio" valor={dinero(miFila && sucursalId ? miFila.ticket : redondear(cmp.medias.ticket))} nota="tickets del periodo disponible" />
        <Kpi label="Cartera vencida" valor={dinero(carteraTotal)} tono={carteraTotal > 0 ? "warn" : "ok"} nota="parcialidades vencidas" />
      </div>

      <div className="dsp-grid">
        <Card className="dsp-ancho">
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Ventas por mes{lineasSuc && vistaVentas === "suc" ? " y sucursal" : ""}</h3>
              <div className="dsp-cab">
                {lineasSuc && <Chips opciones={[{ v: "total", l: "Total" }, { v: "suc", l: "Por sucursal" }]} valor={vistaVentas} onChange={setVistaVentas} />}
                <BotonCSV onClick={() => csv("ventas-por-mes", [{ k: "mes", l: "Mes" }, { k: "servicios", l: "Servicios" }, { k: "plantillas", l: "Plantillas" }, { k: "productos", l: "Productos" }, { k: "total", l: "Total" }, { k: "pacientes", l: "Pacientes" }], serie)} /></div></div>
            {lineasSuc && vistaVentas === "suc" ? (
              <GraficaPeriodos titulo="Ventas mensuales por sucursal" datos={datosMes}
                series={d.sucursales.filter((s) => visibles.includes(s.id)).map((s, i) => ({ k: s.id, nombre: s.nombre, tipo: "linea", color: PALETA[i % PALETA.length], valor: (x) => x.porSucursal[s.id] }))} />
            ) : (
              <GraficaPeriodos titulo="Ventas mensuales" datos={datosMes} apilado
                series={[{ k: "servicios", nombre: "Servicios", tipo: "barra", color: PALETA[0], valor: (x) => x.servicios }, { k: "plantillas", nombre: "Plantillas", tipo: "barra", color: PALETA[1], valor: (x) => x.plantillas }, { k: "productos", nombre: "Productos", tipo: "barra", color: PALETA[2], valor: (x) => x.productos }]} />
            )}
            <div className="peq mu">El último mes es el actual (a la fecha, de las ventas registradas); los anteriores salen del histórico mensual.</div>
          </div>
        </Card>

        <Card>
          <div className="dsp-sec">
            <h3>Mezcla de ingresos del periodo</h3>
            {ventasPer > 0 ? <BarraApilada partes={[{ etq: "Servicios", valor: mix.servicios, color: PALETA[0] }, { etq: "Plantillas", valor: mix.plantillas, color: PALETA[1] }, { etq: "Productos", valor: mix.productos, color: PALETA[2] }]} /> : <Vacio icon="chart">Sin ventas en el periodo.</Vacio>}
          </div>
        </Card>

        <Card>
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Tendencia de pacientes</h3></div>
            <GraficaPeriodos titulo="Pacientes atendidos por mes" datos={datosMes} formato={(n) => String(Math.round(n))} alto={200}
              series={[{ k: "p", nombre: "Pacientes", tipo: "linea", color: PALETA[3], valor: (x) => x.pacientes }]} />
          </div>
        </Card>

        <Card className="dsp-ancho">
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Ranking de podólogos</h3><BotonCSV onClick={() => csv("ranking-podologos", [{ k: "nombre", l: "Podólogo" }, { k: "consultas", l: "Consultas" }, { k: "ingreso", l: "Ingreso atribuido" }, { k: "ticket", l: "Ticket" }, { k: "ocupacion", l: "Ocupación %" }], ranking)} /></div>
            <Vista id="an-pod" items={ranking.map((r) => ({ ...r, id: r.usuarioId }))} minTarjeta={230} vacio="Sin podólogos en el filtro."
              tarjeta={(x) => <div className="dsp-tarj"><div className="dsp-tarj-top"><b>{x.nombre}</b><Badge tono={x.ocupacion >= 70 ? "ok" : x.ocupacion >= 40 ? "warn" : "bad"}>{x.ocupacion} % ocup.</Badge></div>
                <div className="dsp-cifras"><div>Consultas<b>{x.consultas}</b></div><div>Ticket<b>{dinero(x.ticket)}</b></div><div className="der">Ingreso<b>{dinero(x.ingreso)}</b></div></div></div>}
              columnas={[{ k: "n", t: "Podólogo", v: (x) => x.nombre, orden: (x) => x.nombre }, { k: "c", t: "Consultas", v: (x) => x.consultas, der: true, orden: (x) => x.consultas }, { k: "i", t: "Ingreso", v: (x) => dinero(x.ingreso), der: true, orden: (x) => x.ingreso },
                { k: "t", t: "Ticket", v: (x) => dinero(x.ticket), der: true, orden: (x) => x.ticket }, { k: "o", t: "Ocupación", v: (x) => `${x.ocupacion} %`, der: true, orden: (x) => x.ocupacion }]} />
          </div>
        </Card>

        <Card>
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Ocupación de agenda por sucursal</h3><BotonCSV onClick={() => csv("ocupacion", [{ k: "nombre", l: "Sucursal" }, { k: "min", l: "Minutos ocupados" }, { k: "disp", l: "Minutos disponibles" }, { k: "pct", l: "Ocupación %" }], ocup)} /></div>
            <BarrasHorizontales titulo="Ocupación por sucursal" filas={ocup.map((o) => ({ id: o.sucursalId, etq: o.nombre, valor: o.pct, color: o.pct >= 70 ? "var(--ok)" : o.pct >= 40 ? "var(--al)" : "var(--er)" }))} formato={(n) => `${n} %`} max={100} />
            <div className="peq mu">Minutos de cita ÷ (8 h × podólogos presentes cada día).</div>
          </div>
        </Card>

        <Card>
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Cartera vencida</h3><BotonCSV onClick={() => csv("cartera-vencida", [{ k: "nombre", l: "Sucursal" }, { k: "monto", l: "Vencido" }], cartera)} /></div>
            {carteraTotal > 0 ? <BarrasHorizontales titulo="Cartera vencida por sucursal" filas={cartera.map((c) => ({ id: c.sucursalId, etq: c.nombre, valor: c.monto, color: "var(--al)" }))} formato={dinero} /> : <Vacio icon="check">Sin parcialidades vencidas.</Vacio>}
          </div>
        </Card>

        <Card>
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Productos más vendidos</h3><BotonCSV onClick={() => csv("productos", [{ k: "nombre", l: "Producto" }, { k: "cant", l: "Unidades" }, { k: "importe", l: "Importe" }, { k: "existencia", l: "Existencia" }], prod.masVendidos)} /></div>
            {prod.masVendidos.length ? <BarrasHorizontales titulo="Productos más vendidos por importe" filas={prod.masVendidos.map((p) => ({ id: p.id, etq: p.nombre, valor: p.importe, color: "var(--p)" }))} formato={dinero} /> : <Vacio icon="box">Sin ventas de producto en el periodo.</Vacio>}
          </div>
        </Card>

        <Card>
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Productos de menor rotación</h3><BotonCSV onClick={() => csv("menor-rotacion", [{ k: "nombre", l: "Producto" }, { k: "cant", l: "Unidades vendidas" }, { k: "existencia", l: "Existencia" }, { k: "coberturaDias", l: "Cobertura (días)" }], prod.menorRotacion)} /></div>
            <div className="lista">{prod.menorRotacion.map((p) => (
              <div key={p.id} className="fila"><div className="fila-c"><div className="fila-t"><span>{p.nombre}</span></div><div className="fila-s">{p.categoria} · {p.cant} vendida(s) en {prod.dias} día(s)</div></div>
                <div className="der"><b>{p.existencia}</b><div className="peq mu">en existencia{p.coberturaDias != null ? ` · ${p.coberturaDias} d` : ""}</div></div></div>
            ))}</div>
            <div className="peq mu">Menor relación entre unidades vendidas y existencia en el periodo; cobertura = días que alcanzaría la existencia al ritmo de venta.</div>
          </div>
        </Card>

        <Card className="dsp-ancho">
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>{sucursalId ? "Mi sucursal contra el promedio de la cadena" : "Sucursales contra el promedio de la cadena"}</h3>
              <BotonCSV onClick={() => csv("comparativo-sucursales", [{ k: "nombre", l: "Sucursal" }, { k: "ventas", l: "Ventas" }, { k: "difVentas", l: "Ventas vs promedio %" }, { k: "ticket", l: "Ticket" }, { k: "difTicket", l: "Ticket vs promedio %" }, { k: "pacientes", l: "Pacientes" }, { k: "ocupacion", l: "Ocupación %" }, { k: "difOcupacion", l: "Ocupación vs promedio %" }, { k: "cartera", l: "Cartera vencida" }], cmp.filas)} /></div>
            <Vista id="an-cmp" items={cmp.filas.map((f) => ({ ...f, id: f.sucursalId }))} minTarjeta={240}
              tarjeta={(x) => <div className="dsp-tarj"><div className="dsp-tarj-top"><b>{x.nombre}</b><Badge tono={tonoDif(x.difVentas)}>{dif(x.difVentas)}</Badge></div>
                <div className="dsp-cifras"><div>Ventas<b>{dinero(x.ventas)}</b></div><div>Ticket<b>{dinero(x.ticket)}</b></div><div className="der">Ocup.<b>{x.ocupacion} %</b></div></div>
                <div className="dsp-nota">Pacientes {x.pacientes} · ticket {dif(x.difTicket)} · ocupación {dif(x.difOcupacion)} frente al promedio</div></div>}
              columnas={[{ k: "n", t: "Sucursal", v: (x) => x.nombre, orden: (x) => x.nombre }, { k: "v", t: "Ventas", v: (x) => dinero(x.ventas), der: true, orden: (x) => x.ventas }, { k: "dv", t: "vs prom.", v: (x) => <Badge tono={tonoDif(x.difVentas)}>{dif(x.difVentas)}</Badge>, der: true, orden: (x) => x.difVentas },
                { k: "t", t: "Ticket", v: (x) => dinero(x.ticket), der: true, orden: (x) => x.ticket }, { k: "p", t: "Pacientes", v: (x) => x.pacientes, der: true, orden: (x) => x.pacientes }, { k: "o", t: "Ocupación", v: (x) => `${x.ocupacion} %`, der: true, orden: (x) => x.ocupacion }, { k: "c", t: "Cartera", v: (x) => dinero(x.cartera), der: true, orden: (x) => x.cartera }]} />
            <div className="peq mu">Promedio de la cadena: ventas {dinero(Math.round(cmp.medias.ventas))} · ticket {dinero(Math.round(cmp.medias.ticket))} · pacientes {Math.round(cmp.medias.pacientes)} · ocupación {redondear(cmp.medias.ocupacion)} %.</div>
          </div>
        </Card>
      </div>
    </>
  );
}
