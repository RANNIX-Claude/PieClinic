// Dashboard financiero (porte de Pie Firme pages/finanzas/Dashboard.jsx + tablero IRP): ingresos, gastos, utilidad, flujo, cartera,
// cuentas por pagar próximas y KPIs (meta de ocupación 80 %, P-097) por sucursal y consolidado. Cada sucursal es una unidad de costo.
import { useMemo, useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { Badge, Button, Card, Fila, Kpi, Select, Titulo, Vacio } from "../../ui/index.jsx";
import { fechaCorta } from "../../lib/format.js";
import * as F from "../../store/acciones_finanzas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { BarrasH, Dona, GraficaBarras, GraficaLineas, Medidor, SelectorSucursal, SinPermiso, corto, mesCorto, monto, pctTxt } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

const Var = ({ v, inverso }) => (v == null ? <span className="mu peq">sin base</span> : <span className={`tes-var ${(v >= 0) !== !!inverso ? "sube" : "baja"}`}>{v > 0 ? "+" : ""}{v.toFixed(1)} %</span>);

export default function Dashboard() {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr();
  const visibles = X.sucursalesTes(d, u, "dashboard");
  const central = X.esCentral(u);
  const [mes, setMes] = useState(F.mesActual());
  const [suc, setSuc] = useState(central ? "" : (visibles.find((s) => s.id === sucursalId) || visibles[0] || {}).id || "");
  const sid = central ? suc || null : suc || (visibles[0] && visibles[0].id) || null;
  const db = useMemo(() => (visibles.length ? X.dashboardFinanciero(d, { mes, sucursalId: sid }) : null), [d, mes, sid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visibles.length) return <SinPermiso />;
  if (!db || !db.ok) return <Vacio icon="lock">{db ? db.error : "Sin datos."}</Vacio>;
  const t = db.totales, k = db.kpis;
  const ant = db.comparativo.mesAnterior, aa = db.comparativo.anioAnterior;
  const formas = Object.entries(db.flujo.porForma).map(([f, v]) => ({ etiqueta: X.formaLabel(f), valor: v }));
  const origenes = Object.entries(db.flujo.porOrigen).map(([o, v]) => ({ etiqueta: X.ORIGENES[o] || o, valor: v }));
  const cad = !sid;

  return (
    <div className="tes-col">
      <div className="tes-filtros tes-no-print">
        <SelectorSucursal visibles={visibles} valor={suc} onChange={setSuc} consolidado={central} />
        <Select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">{F.mesesDisponibles().map((m) => <option key={m} value={m}>{F.nombreMes(m)}{m === F.mesActual() ? " (en curso)" : ""}</option>)}</Select>
      </div>
      <p className="tes-nota">{db.nombre} · {F.nombreMes(mes)}{db.parcial ? " (mes en curso, cifras a la fecha)" : ""}. Ingresos y utilidad del estado de resultados (sin impuestos, P-100); flujo = lo cobrado por fecha de pago (P-091).</p>

      <div className="kpis">
        <Kpi label="Ingresos del mes" valor={corto(t.ingresos)} nota={<>vs mes anterior <Var v={ant && ant.varIngresos} /></>} tono="info" />
        <Kpi label="Gastos" valor={corto(t.gastos)} nota={`variables ${corto(t.gastosVariables)} · fijos ${corto(t.gastosOperacion)}`} />
        <Kpi label="Utilidad operativa" valor={corto(t.utilidadOperativa)} nota={`margen ${pctTxt(t.margen * 100)}`} tono={t.utilidadOperativa >= 0 ? "ok" : "bad"} />
        <Kpi label="Flujo neto (cobrado − pagado)" valor={corto(db.flujo.neto)} nota={`entró ${corto(db.flujo.entradas)} · salió ${corto(db.flujo.salidas)}`} tono={db.flujo.neto >= 0 ? "ok" : "warn"} />
        <Kpi label="Ocupación de agenda" valor={pctTxt(k.ocupacion)} nota={`meta ${k.metaOcupacion} %`} tono={k.cumpleMeta ? "ok" : "warn"} />
        <Kpi label="Cartera por cobrar" valor={corto(db.cartera.total)} nota={`vencido ${corto(db.cartera.vencido)}`} tono={db.cartera.vencido > 0 ? "warn" : "ok"} />
        {db.cxp && <Kpi label="Por pagar (7 días)" valor={corto(db.cxp.proximas.reduce((a, c) => a + c.saldo, 0))} nota={`${db.cxp.proximas.length} documentos · vencido ${corto(db.cxp.vencido)}`} tono={db.cxp.vencido > 0 ? "bad" : "info"} />}
        <Kpi label="Ticket promedio" valor={monto(k.ticket)} nota={`${k.pacientes} pacientes atendidos`} />
      </div>

      <div className="tes-rejilla">
        <Card>
          <div className="tes-cab"><h3>Últimos 6 meses</h3><Button variante="sec" icon="chart" onClick={() => ir("mas/edr")}>Estado de resultados</Button></div>
          <GraficaBarras datos={db.serie.map((x) => ({ etiqueta: mesCorto(x.mes), valores: x }))} series={[{ k: "ingresos", l: "Ingresos", clase: "ing" }, { k: "gastos", l: "Gastos", clase: "gas" }, { k: "utilidad", l: "Utilidad", clase: "uti" }]} />
        </Card>
        <Card>
          <div className="tes-cab"><h3>Flujo diario del mes</h3><span className="mu peq">cobros vs gastos{cad ? " y pagos a proveedores" : ""}</span></div>
          <GraficaLineas datos={db.flujo.diario.map((x) => ({ etiqueta: x.fecha.slice(8, 10), valores: x }))} series={[{ k: "entradas", l: "Entradas", clase: "ing" }, { k: "salidas", l: "Salidas", clase: "gas" }]} cadaEtiqueta={5} />
        </Card>
        <Card>
          <div className="tes-cab"><h3>Cobrado por forma de pago</h3><Button variante="sec" icon="trending" onClick={() => ir("mas/ingresos")} disabled={!central}>Ver ingresos</Button></div>
          <Dona items={formas} centro={corto(db.flujo.entradas)} />
          <p className="tes-nota" style={{ marginTop: 8 }}>Por origen: {origenes.map((o) => `${o.etiqueta} ${corto(o.valor)}`).join(" · ") || "—"}</p>
        </Card>
        <Card>
          <div className="tes-cab"><h3>Ocupación de agenda</h3><Badge tono={k.cumpleMeta ? "ok" : "warn"}>{k.cumpleMeta ? "Cumple meta" : "Bajo meta"}</Badge></div>
          <Medidor valor={k.ocupacion} meta={k.metaOcupacion} etiqueta={cad ? "Cadena" : db.nombre} />
          {cad && <div style={{ marginTop: 12 }}><BarrasH formato={(v) => pctTxt(v)} meta={k.metaOcupacion} items={[...db.porSucursal].sort((a, b) => b.ocupacion - a.ocupacion).map((s) => ({ id: s.sucursalId, etiqueta: s.nombre, valor: s.ocupacion, clase: s.cumpleMeta ? "ok" : "warn" }))} /></div>}
          <p className="tes-nota" style={{ marginTop: 8 }}>Minutos atendidos y agendados ÷ minutos disponibles (8 h por podólogo presente). Meta inicial 80 % (P-097).</p>
        </Card>
      </div>

      {cad && (
        <Card>
          <div className="tes-cab"><h3>Comparativo por sucursal (unidad de costo)</h3><span className="mu peq">el consolidado es la suma</span></div>
          <div className="tes-tabla-w" style={{ marginTop: 8 }}>
            <table className="tes-tabla">
              <thead><tr><th className="c1">Sucursal</th><th>Ingresos</th><th>Gastos</th><th>Utilidad</th><th>Margen</th><th>Cobrado</th><th>Ocupación</th><th>Cartera vencida</th><th>Fondo usado</th></tr></thead>
              <tbody>
                {db.porSucursal.map((s) => (
                  <tr key={s.sucursalId}>
                    <td className="c1 tap" onClick={() => setSuc(s.sucursalId)}>{s.nombre}</td><td>{monto(s.ingresos)}</td><td>{monto(s.gastos)}</td>
                    <td className={s.utilidad < 0 ? "tes-neg" : ""}>{monto(s.utilidad)}</td><td>{pctTxt(s.margen * 100)}</td><td>{monto(s.cobrado)}</td>
                    <td><Badge tono={s.cumpleMeta ? "ok" : "warn"}>{pctTxt(s.ocupacion)}</Badge></td><td>{monto(s.carteraVencida)}</td><td>{pctTxt(s.fondoUso)}</td>
                  </tr>
                ))}
                <tr className="total"><td className="c1">Consolidado</td><td>{monto(t.ingresos)}</td><td>{monto(t.gastos)}</td><td>{monto(t.utilidadOperativa)}</td><td>{pctTxt(t.margen * 100)}</td><td>{monto(db.flujo.entradas)}</td><td>{pctTxt(k.ocupacion)}</td><td>{monto(db.cartera.vencido)}</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="tes-rejilla">
        <Card>
          <div className="tes-cab"><h3>Cartera por antigüedad</h3>{central && <Button variante="sec" icon="wallet" onClick={() => ir("mas/cuentas")}>Cuentas</Button>}</div>
          <BarrasH total={db.cartera.total} items={X.TRAMOS.map((x, i) => ({ id: x.k, etiqueta: x.l, valor: db.cartera[x.k], clase: i === 0 ? "ok" : i < 2 ? "warn" : "bad" }))} />
          <div className="lista" style={{ marginTop: 10 }}>
            {db.cartera.mayores.map((c) => <Fila key={c.id} titulo={c.deudor} sub={`${X.TIPOS_CXC[c.tipo]} · ${c.folio}`} badge={c.diasVencido ? <Badge tono="bad">{c.diasVencido} días</Badge> : <Badge tono="info">Al corriente</Badge>} derecha={<b>{monto(c.saldo)}</b>} />)}
          </div>
        </Card>
        {db.cxp ? (
          <Card>
            <div className="tes-cab"><h3>Por pagar en los próximos 7 días</h3><span className="mu peq">compras centralizadas</span></div>
            <div className="lista" style={{ marginTop: 8 }}>
              {db.cxp.proximas.map((c) => <Fila key={c.id} titulo={c.deudor} sub={`${c.folio} · vence ${fechaCorta(c.vence)}`} badge={c.diasVencido ? <Badge tono="bad">Vencida</Badge> : <Badge tono="warn">Por vencer</Badge>} derecha={<b>{monto(c.saldo)}</b>} />)}
              {!db.cxp.proximas.length && <Vacio icon="check">Nada vence esta semana.</Vacio>}
            </div>
          </Card>
        ) : (
          <Card>
            <div className="tes-cab"><h3>Fondo revolvente</h3><Button variante="sec" icon="cash" onClick={() => ir("mas/fondo")}>Ver fondo</Button></div>
            <div className="kpis" style={{ marginTop: 8 }}><Kpi label="Disponible" valor={monto(db.fondo.saldo)} /><Kpi label="Por reponer" valor={monto(db.fondo.porReponer)} tono={db.fondo.alertas ? "warn" : undefined} /></div>
          </Card>
        )}
        <Card>
          <Titulo>Comparativos</Titulo>
          <div className="resumen">
            <div><span>Ingresos vs {ant ? "mes anterior" : "—"}</span><b>{ant ? <>{monto(ant.ingresos)} <Var v={ant.varIngresos} /></> : "—"}</b></div>
            <div><span>Utilidad vs mes anterior</span><b>{ant ? <>{monto(ant.utilidad)} <Var v={ant.varUtilidad} /></> : "—"}</b></div>
            <div><span>Ingresos vs mismo mes del año anterior</span><b>{aa ? <>{monto(aa.ingresos)} <Var v={aa.varIngresos} /></> : "—"}</b></div>
            <div><span>Gastos pagados en el mes</span><b>{monto(db.flujo.gastos)}</b></div>
            {cad && <div><span>Pagos a proveedores en el mes</span><b>{monto(db.flujo.pagosProveedores)}</b></div>}
          </div>
          {db.parcial && <p className="tes-nota" style={{ marginTop: 8 }}>El mes en curso se compara contra meses completos: la variación se lee como avance.</p>}
        </Card>
        <Card>
          <div className="tes-cab"><h3>Pendientes de la semana</h3><Button variante="sec" icon="calendar" onClick={() => ir("mas/resumen-semanal")}>Resumen semanal</Button></div>
          <div className="lista" style={{ marginTop: 8 }}>
            {db.pendientes.map((p, i) => <Fila key={i} titulo={p.texto} badge={<Badge tono={p.tono}>{p.tipo}</Badge>} />)}
            {!db.pendientes.length && <Vacio icon="check">Sin pendientes.</Vacio>}
          </div>
        </Card>
      </div>
    </div>
  );
}
