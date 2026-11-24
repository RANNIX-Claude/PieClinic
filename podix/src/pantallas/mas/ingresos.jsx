// Ingresos consolidados (porte de Pie Firme Ingresos.jsx, P-090/P-091): todo lo cobrado por fecha de pago — ventas y consultas,
// anticipos de plantillas, abonos de apartados, crédito y plazos, enganches, pedidos en línea y cobros a convenios. Mosaico/renglones, filtros y CSV.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Badge, Buscador, Button, Card, Kpi, Select, Sheet, Titulo, Input, Field } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { descargar } from "../../componentes/finanzas/util.js";
import { BarrasH, SelectorSucursal, SinPermiso, corto, monto } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

const TONO_FORMA = { efectivo: "ok", tarjeta: "info", transferencia: "neutral", en_linea: "warn" };

function Detalle({ d, f, onClose }) {
  const c = X.cuentaLigada(d, f);
  const conc = X.clavesConciliadas(d);
  const validado = conc.has(f.id) || (f.forma === "tarjeta" && conc.has(`L:${f.sucursalId}:${f.fecha}`));
  return (
    <Sheet abierto onClose={onClose} titulo={`Cobro ${f.folio}`}>
      <div className="form">
        <div className="tes-mov-t"><b>{monto(f.monto)}</b><Badge tono={TONO_FORMA[f.forma]}>{X.formaLabel(f.forma)}</Badge></div>
        <div className="resumen">
          <div><span>Origen</span><b>{X.ORIGENES[f.origen]}</b></div>
          <div><span>Concepto</span><b>{f.concepto}</b></div>
          <div><span>Paga</span><b>{X.quienPaga(d, f)}</b></div>
          <div><span>Fecha de pago</span><b>{fechaCorta(f.fecha)}{f.hora ? ` · ${f.hora}` : ""}</b></div>
          <div><span>Sucursal</span><b>{R.nombreSucursal(d, f.sucursalId)}</b></div>
          <div><span>Registró</span><b>{f.usuarioId ? R.nombreUsuario(d, f.usuarioId) : "Sistema (en línea)"}</b></div>
          <div><span>Referencia</span><b>{f.referencia || "—"}</b></div>
          <div><span>Validado en banco (P-090)</span><b>{f.forma === "efectivo" ? "Vía depósito del día" : validado ? "Conciliado" : "Pendiente de conciliar"}</b></div>
        </div>
        {f.formaSupuesta && <p className="tes-nota">El registro original no guardó la forma de pago: se asume efectivo.</p>}
        {c && <Card><Titulo>Cuenta ligada</Titulo><div className="resumen">
          <div><span>{c.tipo}</span><b>{c.folio}</b></div><div><span>Total</span><b>{monto(c.total)}</b></div>
          <div><span>Saldo hoy</span><b>{monto(c.saldo)}</b></div><div><span>Estado</span><b>{c.estado}</b></div>
        </div></Card>}
      </div>
    </Sheet>
  );
}

export default function Ingresos() {
  const { d, u } = useSesion();
  const visibles = X.sucursalesTes(d, u, "ingresos");
  const [suc, setSuc] = useState("");
  const [desde, setDesde] = useState(sumarDias(hoy(), -6));
  const [hasta, setHasta] = useState(hoy());
  const [forma, setForma] = useState("");
  const [origen, setOrigen] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const r = useMemo(() => (visibles.length ? X.ingresos(d, { desde, hasta, sucursalId: suc || null, forma, origen, texto: q }) : null), [d, desde, hasta, suc, forma, origen, q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!visibles.length) return <SinPermiso>Los ingresos consolidados son de Administración central y Dirección.</SinPermiso>;
  if (!r.ok) return <SinPermiso>{r.error}</SinPermiso>;
  const t = r.totales;
  const tarjeta = (f) => (
    <div className="tes-mov">
      <div className="tes-mov-t"><b>{monto(f.monto)}</b><span className="mu peq">{fechaCorta(f.fecha)}{f.hora ? ` ${f.hora}` : ""}</span></div>
      <div className="fuerte">{X.quienPaga(d, f)}</div>
      <div className="tes-mov-s">{f.folio} · {f.concepto}</div>
      <div className="tes-mov-s">{R.nombreSucursal(d, f.sucursalId)}</div>
      <div className="tes-acciones" style={{ gap: 6 }}><Badge tono={TONO_FORMA[f.forma]}>{X.formaLabel(f.forma)}</Badge><Badge>{X.ORIGENES[f.origen]}</Badge></div>
    </div>
  );
  const columnas = [
    { k: "f", t: "Fecha", v: (f) => `${fechaCorta(f.fecha)} ${f.hora}`, orden: (f) => f.fecha + f.hora },
    { k: "s", t: "Sucursal", v: (f) => R.nombreSucursal(d, f.sucursalId) },
    { k: "o", t: "Origen", v: (f) => X.ORIGENES[f.origen] },
    { k: "fo", t: "Folio", v: (f) => f.folio },
    { k: "p", t: "Paga", v: (f) => X.quienPaga(d, f) },
    { k: "c", t: "Concepto", v: (f) => f.concepto },
    { k: "fp", t: "Forma", v: (f) => <Badge tono={TONO_FORMA[f.forma]}>{X.formaLabel(f.forma)}</Badge>, orden: (f) => f.forma },
    { k: "m", t: "Importe", der: true, v: (f) => monto(f.monto), orden: (f) => f.monto },
  ];
  return (
    <div className="tes-col">
      <div className="tes-filtros">
        <Buscador valor={q} onChange={setQ} placeholder="Folio, paciente, concepto o referencia…" />
        <SelectorSucursal visibles={visibles} valor={suc} onChange={setSuc} />
        <Field label="Desde"><Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={hasta} max={hoy()} onChange={(e) => setHasta(e.target.value)} /></Field>
        <Select value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Forma de pago"><option value="">Todas las formas</option>{Object.entries(X.FORMAS_TES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Origen"><option value="">Todos los orígenes</option>{Object.entries(X.ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </div>
      <div className="kpis">
        <Kpi label="Cobrado" valor={corto(t.total)} nota={`${t.n} cobros`} tono="info" />
        {Object.entries(X.FORMAS_TES).map(([k, l]) => <Kpi key={k} label={l} valor={corto(t.porForma[k] || 0)} nota={t.total ? `${Math.round(((t.porForma[k] || 0) / t.total) * 100)} %` : ""} />)}
      </div>
      <div className="tes-rejilla">
        <Card><Titulo>Por origen</Titulo><BarrasH total={t.total} items={Object.entries(t.porOrigen).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, etiqueta: X.ORIGENES[k], valor: v }))} /></Card>
        {!suc && <Card><Titulo>Por sucursal</Titulo><BarrasH total={t.total} items={Object.entries(t.porSucursal).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ id: k, etiqueta: R.nombreSucursal(d, k), valor: v, clase: "ok" }))} /></Card>}
      </div>
      <div className="tes-acciones"><Button variante="sec" icon="download" onClick={() => descargar(`ingresos_${desde}_${hasta}.csv`, X.csvIngresos(d, r.filas))} disabled={!r.filas.length}>Exportar CSV</Button></div>
      <p className="tes-regla">Ingreso real = cobrado y registrado, por fecha de pago; las ventas a crédito, plazos y apartados cuentan cuando entra cada abono (P-090, P-091).</p>
      <Vista id="tes-ingresos" items={r.filas} tarjeta={tarjeta} columnas={columnas} onAbrir={setSel} inicial="renglones" vacio="No hay cobros con esos filtros." />
      {sel && <Detalle d={d} f={sel} onClose={() => setSel(null)} />}
    </div>
  );
}
