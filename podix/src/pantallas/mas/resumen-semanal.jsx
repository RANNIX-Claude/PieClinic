// Resumen semanal de corte (sábado → viernes, P-088), porte de Pie Firme ResumenSemanal.jsx e IRP: cobrado por forma de pago,
// gastos, depósitos de efectivo, diferencias de caja y pendientes. Imprimible. El gerente registra la ficha de depósito de sus cortes.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Field, Fila, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as F from "../../store/acciones_finanzas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { descargar } from "../../componentes/finanzas/util.js";
import { BarrasH, GraficaBarras, SelectorSucursal, SinPermiso, corto, monto } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

function FormDeposito({ d, visibles, inicial, turno, onClose }) {
  const [f, setF] = useState(() => ({
    sucursalId: turno ? turno.sucursalId : inicial, diaVenta: turno ? (turno.cerradoEn || turno.abiertoEn).slice(0, 10) : sumarDias(hoy(), -1), fecha: hoy(),
    monto: turno ? String(X.efectivoDeCorte(turno)) : "", referencia: "",
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const guardar = () => {
    const r = mutar((x) => X.registrarDeposito(x, { ...f, turnoId: turno ? turno.id : null }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Ficha de depósito registrada."); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Registrar ficha de depósito" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block onClick={guardar}>Guardar</Button></div>}>
      <div className="form">
        {turno && <p className="tes-nota">Corte del turno {turno.turno} de {R.nombreUsuario(d, turno.cajeroId)}: efectivo contado menos el fondo fijo de caja (P-059).</p>}
        <Field label="Sucursal"><Select value={f.sucursalId} onChange={set("sucursalId")} disabled={!!turno}>{visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
        <div className="dos">
          <Field label="Día de venta que ampara"><Input type="date" value={f.diaVenta} max={hoy()} onChange={set("diaVenta")} /></Field>
          <Field label="Fecha del depósito"><Input type="date" value={f.fecha} max={hoy()} onChange={set("fecha")} /></Field>
        </div>
        <Field label="Monto depositado"><Input inputMode="decimal" value={f.monto} onChange={set("monto")} /></Field>
        <Field label="Referencia de la ficha" hint="Si la dejas vacía se usa DEP-<sucursal>-<mmdd>, la que se busca al conciliar."><Input value={f.referencia} onChange={set("referencia")} /></Field>
      </div>
    </Sheet>
  );
}

export default function ResumenSemanal() {
  const { d, u, sucursalId } = useSesion();
  const visibles = X.sucursalesTes(d, u, "resumen-semanal");
  const central = X.esCentral(u);
  const semanas = useMemo(() => X.semanasRecientes(10), []);
  const [ini, setIni] = useState(semanas[0].inicio);
  const [suc, setSuc] = useState(central ? "" : (visibles.find((s) => s.id === sucursalId) || visibles[0] || {}).id || "");
  const [dep, setDep] = useState(null); // null | "nuevo" | turno
  const sid = central ? suc || null : suc || (visibles[0] && visibles[0].id) || null;
  const res = useMemo(() => (visibles.length ? X.resumenSemanal(d, { inicio: ini, sucursalId: sid }) : null), [d, ini, sid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!visibles.length) return <SinPermiso />;
  if (!res || !res.ok) return <Vacio icon="lock">{res ? res.error : "Sin datos."}</Vacio>;
  const s = res.semana;
  const nombre = sid ? R.nombreSucursal(d, sid) : "Consolidado de la cadena";
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(s.inicio, i));
  const nombreCat = (id) => (F.categoriasDe(d).find((c) => c.id === id) || { nombre: id }).nombre;

  return (
    <div className="tes-col">
      <div className="tes-filtros tes-no-print">
        <SelectorSucursal visibles={visibles} valor={suc} onChange={setSuc} consolidado={central} />
        <Select value={ini} onChange={(e) => setIni(e.target.value)} aria-label="Semana">{semanas.map((w) => <option key={w.inicio} value={w.inicio}>{w.etiqueta} · {X.etiquetaRango(w.inicio, w.fin)}{w.inicio === semanas[0].inicio ? " (en curso)" : ""}</option>)}</Select>
      </div>
      <div className="tes-solo-print"><h2>Resumen semanal {s.etiqueta} · {X.etiquetaRango(s.inicio, s.fin)}</h2><p>{nombre} · impreso {fechaCorta(hoy())}</p></div>
      <p className="tes-nota">{nombre} · semana {s.etiqueta} del sábado {fechaCorta(s.inicio)} al viernes {fechaCorta(s.fin)} (P-088).{res.semanaCerrada ? " Periodo cerrado: solo lectura." : ""}</p>

      <div className="kpis">
        <Kpi label="Cobrado en la semana" valor={corto(res.ingresos.total)} nota={`${res.ingresos.n} cobros`} tono="info" />
        <Kpi label="Gastos" valor={corto(res.gastos.total)} nota={`${res.gastos.n} registros · fondo ${corto(res.gastos.fondo)}`} />
        <Kpi label="Neto" valor={corto(res.neto)} tono={res.neto >= 0 ? "ok" : "bad"} />
        <Kpi label="Efectivo por depositar" valor={corto(res.depositos.porDepositar)} nota={`depositado ${corto(res.depositos.registrado)}`} tono={res.depositos.porDepositar > 0.5 ? "warn" : "ok"} />
        <Kpi label="Diferencias de caja" valor={monto(res.caja.sobrante - res.caja.faltante)} nota={`faltante ${monto(res.caja.faltante)} · ${res.caja.cortes} cortes`} tono={res.caja.faltante ? "bad" : "ok"} />
        <Kpi label="Pendientes" valor={String(res.pendientes.length)} tono={res.pendientes.length ? "warn" : "ok"} />
      </div>

      <div className="tes-rejilla">
        <Card>
          <Titulo>Cobrado por forma de pago</Titulo>
          <BarrasH total={res.ingresos.total} items={Object.entries(res.ingresos.porForma).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, etiqueta: X.formaLabel(k), valor: v }))} />
          <Titulo>Por origen</Titulo>
          <BarrasH total={res.ingresos.total} items={Object.entries(res.ingresos.porOrigen).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, etiqueta: X.ORIGENES[k] || k, valor: v, clase: "ok" }))} />
        </Card>
        <Card>
          <Titulo>Día por día</Titulo>
          <GraficaBarras datos={dias.map((f) => ({ etiqueta: fechaCorta(f).slice(0, 6), valores: { ing: res.ingresos.porDia[f] || 0, gas: res.gastosDet.filter((g) => g.fecha === f).reduce((a, g) => a + g.monto, 0) } }))} series={[{ k: "ing", l: "Cobrado", clase: "ing" }, { k: "gas", l: "Gastos", clase: "gas" }]} />
        </Card>
        <Card>
          <Titulo>Gastos por categoría</Titulo>
          <BarrasH total={res.gastos.total} items={Object.entries(res.gastos.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, etiqueta: nombreCat(k), valor: v, clase: "warn" }))} />
        </Card>
        <Card>
          <div className="tes-cab"><h3>Depósitos de efectivo</h3><Button variante="sec" icon="plus" className="tes-no-print" onClick={() => setDep("nuevo")}>Ficha de depósito</Button></div>
          <div className="resumen" style={{ marginTop: 8 }}>
            <div><span>Efectivo cobrado</span><b>{monto(res.depositos.efectivoCobrado)}</b></div>
            <div><span>Depositado ({res.depositos.n} fichas)</span><b>{monto(res.depositos.registrado)}</b></div>
            <div><span>Ya reflejado en el banco</span><b>{monto(res.depositos.enBanco)}</b></div>
            <div><span>En tránsito</span><b>{monto(res.depositos.enTransito)}</b></div>
            <div className="fuerte"><span>Por depositar</span><b>{monto(res.depositos.porDepositar)}</b></div>
          </div>
          {res.cortesSinDeposito.length > 0 && <>
            <p className="tes-nota" style={{ margin: "10px 0 6px" }}>Cortes cerrados sin ficha de depósito:</p>
            <div className="lista">{res.cortesSinDeposito.map((t) => <Fila key={t.id} titulo={`${R.nombreSucursal(d, t.sucursalId)} · ${t.turno}`} sub={`${fechaCorta(t.cerradoEn || t.abiertoEn)} · ${R.nombreUsuario(d, t.cajeroId)}`} derecha={<b>{monto(X.efectivoDeCorte(t))}</b>} onClick={() => setDep(t)} />)}</div>
          </>}
        </Card>
      </div>

      {res.porSucursal && (
        <Card>
          <div className="tes-cab"><h3>Por sucursal</h3><Button variante="sec" icon="download" className="tes-no-print" onClick={() => descargar(`resumen_semanal_${s.inicio}.csv`, X.csvResumenSemanal(res))}>CSV</Button></div>
          <div className="tes-tabla-w" style={{ marginTop: 8 }}>
            <table className="tes-tabla">
              <thead><tr><th className="c1">Sucursal</th><th>Cobrado</th><th>Efectivo</th><th>Tarjeta</th><th>Transf.</th><th>En línea</th><th>Gastos</th><th>Depositado</th><th>Por depositar</th><th>Dif. caja</th><th>Neto</th></tr></thead>
              <tbody>
                {[...res.porSucursal.filas, res.porSucursal.consolidado].map((f) => (
                  <tr key={f.sucursalId} className={f.sucursalId === "CAD" ? "total" : ""}>
                    <td className={`c1${f.sucursalId !== "CAD" ? " tap" : ""}`} onClick={f.sucursalId !== "CAD" ? () => setSuc(f.sucursalId) : undefined}>{f.nombre}</td>
                    <td>{monto(f.ingresos)}</td><td>{monto(f.efectivo)}</td><td>{monto(f.tarjeta)}</td><td>{monto(f.transferencia)}</td><td>{monto(f.enLinea)}</td>
                    <td>{monto(f.gastos)}</td><td>{monto(f.depositado)}</td><td className={f.porDepositar > 0.5 ? "tes-neg" : ""}>{monto(f.porDepositar)}</td>
                    <td className={f.diferencia < 0 ? "tes-neg" : ""}>{monto(f.diferencia)}</td><td>{monto(f.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <Titulo>Pendientes</Titulo>
        <div className="lista">
          {res.pendientes.map((p, i) => <Fila key={i} titulo={p.texto} badge={<Badge tono={p.tono}>{p.tipo}</Badge>} />)}
          {!res.pendientes.length && <Vacio icon="check">Sin pendientes en la semana.</Vacio>}
        </div>
      </Card>
      <div className="tes-acciones tes-no-print"><Button variante="sec" icon="file" onClick={() => window.print()}>Imprimir resumen</Button></div>
      {dep && <FormDeposito d={d} visibles={visibles} inicial={sid || visibles[0].id} turno={dep === "nuevo" ? null : dep} onClose={() => setDep(null)} />}
    </div>
  );
}
