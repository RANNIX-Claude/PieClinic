// Cuentas por cobrar y por pagar (porte de Pie Firme CuentasPagarCobrar.jsx): cartera de crédito, plazos y apartados, documentos a
// convenios y aseguradoras, y cuentas por pagar a proveedores (d.cxp). Antigüedad de saldos, calendario de vencimientos y cobro/pago.
import { useMemo, useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Field, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { fechaCorta, hoy } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { aCSV } from "../../store/acciones_admin.js";
import { descargar } from "../../componentes/finanzas/util.js";
import { BarrasH, SelectorSucursal, SinPermiso, corto, monto } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

const tonoDias = (n) => (n <= 0 ? "info" : n <= 30 ? "warn" : "bad");

function Detalle({ d, c, lado, onClose }) {
  const ir = useIr();
  const [m, setM] = useState(String(c.saldo));
  const [forma, setForma] = useState("transferencia");
  const [ref, setRef] = useState("");
  const conv = lado === "cobrar" && c.tipo === "convenio" ? d.tes.cxc.find((x) => x.id === c.refId) : null;
  const cobrar = () => {
    const r = mutar((x) => (lado === "pagar" ? X.pagarProveedor(x, { cxpId: c.refId, monto: m, referencia: ref }) : X.registrarCobroConvenio(x, { cxcId: c.refId, monto: m, forma, referencia: ref })));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(lado === "pagar" ? "Pago registrado: se conciliará en la cuenta concentradora." : "Cobro registrado: ya aparece en Ingresos."); onClose();
  };
  const puedeMover = lado === "pagar" || !!conv;
  return (
    <Sheet abierto onClose={onClose} titulo={`${lado === "pagar" ? "Por pagar" : "Por cobrar"} · ${c.folio}`}
      pie={puedeMover ? <Button block icon="check" onClick={cobrar}>{lado === "pagar" ? "Registrar pago" : "Registrar cobro"}</Button> : <Button block variante="sec" icon="cash" onClick={() => ir("porcobrar")}>Se cobra en caja (cajero)</Button>}>
      <div className="form">
        <div className="tes-mov-t"><b>{monto(c.saldo)}</b><Badge tono={tonoDias(c.diasVencido)}>{c.diasVencido ? `${c.diasVencido} días vencido` : "Al corriente"}</Badge></div>
        <div className="resumen">
          <div><span>{lado === "pagar" ? "Proveedor" : "Deudor"}</span><b>{c.deudor}</b></div>
          <div><span>Tipo</span><b>{lado === "pagar" ? "Proveedor (compra centralizada)" : X.TIPOS_CXC[c.tipo]}</b></div>
          {c.sucursalId && <div><span>Sucursal</span><b>{R.nombreSucursal(d, c.sucursalId)}</b></div>}
          <div><span>Vence</span><b>{fechaCorta(c.vence)}</b></div>
          {c.mora > 0 && <div><span>Mora a hoy</span><b>{monto(c.mora)}</b></div>}
          {conv && <div><span>Concepto</span><b>{conv.concepto}</b></div>}
        </div>
        {c.partes.length > 1 && <><Titulo>Parcialidades pendientes</Titulo><div className="resumen">{c.partes.map((p, i) => <div key={i}><span>{fechaCorta(p.vence)}</span><b>{monto(p.monto)}</b></div>)}</div></>}
        {(conv ? conv.pagos : c.pagos || []).length > 0 && <><Titulo>Pagos</Titulo><div className="resumen">{(conv ? conv.pagos : c.pagos).map((p, i) => <div key={i}><span>{fechaCorta(p.fecha)} · {p.referencia || "—"}</span><b>{monto(p.monto)}</b></div>)}</div></>}
        {puedeMover ? <>
          <div className="dos">
            <Field label="Monto"><Input inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} /></Field>
            {lado === "cobrar" && <Field label="Forma"><Select value={forma} onChange={(e) => setForma(e.target.value)}><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="efectivo">Efectivo</option></Select></Field>}
          </div>
          <Field label="Referencia" hint="Se busca en el estado de cuenta al conciliar (P-096)."><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SPEI-…" /></Field>
        </> : <p className="tes-nota">Los abonos de crédito, plazos y apartados los registra el cajero con su turno abierto (con mora y reparto de parcialidades).</p>}
      </div>
    </Sheet>
  );
}

function NuevaCxc({ d, onClose }) {
  const [f, setF] = useState({ convenioId: (d.convenios[0] || {}).id || "", sucursalId: d.sucursales[0].id, concepto: "", monto: "", emitido: hoy(), dias: "30" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const guardar = () => { const r = mutar((x) => X.registrarCxcConvenio(x, { ...f, dias: Number(f.dias) })); if (!r.ok) return aviso(r.error, "bad"); aviso("Documento por cobrar registrado."); onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Documento por cobrar a convenio" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block onClick={guardar}>Guardar</Button></div>}>
      <div className="form">
        <Field label="Convenio o aseguradora"><Select value={f.convenioId} onChange={set("convenioId")}>{d.convenios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
        <Field label="Sucursal que prestó los servicios"><Select value={f.sucursalId} onChange={set("sucursalId")}>{d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
        <Field label="Concepto"><Input value={f.concepto} onChange={set("concepto")} placeholder="Relación de servicios de noviembre" /></Field>
        <div className="dos"><Field label="Monto"><Input inputMode="decimal" value={f.monto} onChange={set("monto")} /></Field><Field label="Días de crédito"><Input inputMode="numeric" value={f.dias} onChange={set("dias")} /></Field></div>
        <Field label="Emitido"><Input type="date" value={f.emitido} max={hoy()} onChange={set("emitido")} /></Field>
      </div>
    </Sheet>
  );
}

export default function Cuentas() {
  const { d, u } = useSesion();
  const visibles = X.sucursalesTes(d, u, "cuentas");
  const [tab, setTab] = useState("cobrar");
  const [suc, setSuc] = useState("");
  const [tipo, setTipo] = useState("");
  const [sel, setSel] = useState(null);
  const [nueva, setNueva] = useState(false);
  const cxc = useMemo(() => X.cuentasPorCobrar(d, { sucursalId: suc || null }).filter((c) => !tipo || c.tipo === tipo), [d, suc, tipo]);
  const cxp = useMemo(() => X.cuentasPorPagar(d), [d]);
  const cal = useMemo(() => X.calendarioVencimientos(d, { sucursalId: suc || null, semanas: 6 }), [d, suc]);
  if (!visibles.length) return <SinPermiso>Las cuentas por cobrar y por pagar son de Administración central y Dirección.</SinPermiso>;
  const lista = tab === "pagar" ? cxp : cxc;
  const ag = X.antiguedad(lista);
  const tarjeta = (c) => (
    <div className="tes-mov">
      <div className="tes-mov-t"><b>{monto(c.saldo)}</b><Badge tono={tonoDias(c.diasVencido)}>{c.diasVencido ? `${c.diasVencido} d` : "corriente"}</Badge></div>
      <div className="fuerte">{c.deudor}</div>
      <div className="tes-mov-s">{c.folio} · {tab === "pagar" ? "Proveedor" : X.TIPOS_CXC[c.tipo]}{c.sucursalId ? ` · ${R.nombreSucursal(d, c.sucursalId)}` : ""}</div>
      <div className="tes-mov-s">Vence {fechaCorta(c.vence)}{c.mora ? ` · mora ${monto(c.mora)}` : ""}</div>
    </div>
  );
  const columnas = [
    { k: "f", t: "Folio", v: (c) => c.folio },
    { k: "d", t: tab === "pagar" ? "Proveedor" : "Deudor", v: (c) => c.deudor },
    ...(tab === "pagar" ? [] : [{ k: "t", t: "Tipo", v: (c) => X.TIPOS_CXC[c.tipo] }, { k: "s", t: "Sucursal", v: (c) => R.nombreSucursal(d, c.sucursalId) }]),
    { k: "v", t: "Vence", v: (c) => fechaCorta(c.vence), orden: (c) => c.vence },
    { k: "dv", t: "Días vencido", der: true, v: (c) => c.diasVencido, orden: (c) => c.diasVencido },
    { k: "m", t: "Saldo", der: true, v: (c) => monto(c.saldo), orden: (c) => c.saldo },
  ];
  const csv = () => descargar(`cuentas_por_${tab}.csv`, aCSV([{ k: "folio", l: "Folio" }, { k: "deudor", l: tab === "pagar" ? "Proveedor" : "Deudor" }, { k: "tipo", l: "Tipo" }, { k: "vence", l: "Vence" }, { k: "diasVencido", l: "Días vencido" }, ...X.TRAMOS.map((t) => ({ k: t.k, l: t.l })), { k: "saldo", l: "Saldo" }], lista.map((c) => ({ ...c, tipo: tab === "pagar" ? "Proveedor" : X.TIPOS_CXC[c.tipo], ...c.tramos }))));
  return (
    <div className="tes-col">
      <Chips opciones={[{ v: "cobrar", l: "Por cobrar", n: cxc.length }, { v: "pagar", l: "Por pagar", n: cxp.length }, { v: "calendario", l: "Calendario" }]} valor={tab} onChange={setTab} />
      {tab !== "pagar" && <div className="tes-filtros">
        <SelectorSucursal visibles={visibles} valor={suc} onChange={setSuc} />
        {tab === "cobrar" && <Select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos los tipos</option>{Object.entries(X.TIPOS_CXC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}
      </div>}
      {tab !== "calendario" ? <>
        <div className="kpis">
          <Kpi label={tab === "pagar" ? "Saldo por pagar" : "Cartera por cobrar"} valor={corto(ag.total)} nota={`${lista.length} cuentas`} tono="info" />
          <Kpi label="Vencido" valor={corto(ag.vencido)} tono={ag.vencido ? "bad" : "ok"} />
          <Kpi label="Más de 90 días" valor={corto(ag.mas)} tono={ag.mas ? "bad" : "ok"} />
          <Kpi label="Por vencer" valor={corto(ag.corriente)} />
        </div>
        <Card><Titulo>Antigüedad de saldos</Titulo><BarrasH total={ag.total} items={X.TRAMOS.map((t, i) => ({ id: t.k, etiqueta: t.l, valor: ag[t.k], clase: i === 0 ? "ok" : i < 2 ? "warn" : "bad" }))} /></Card>
        <div className="tes-acciones">
          <Button variante="sec" icon="download" onClick={csv}>Exportar CSV</Button>
          {tab === "cobrar" && <Button variante="sec" icon="plus" onClick={() => setNueva(true)}>Documento a convenio</Button>}
        </div>
        <Vista id={`tes-cuentas-${tab}`} items={lista} tarjeta={tarjeta} columnas={columnas} onAbrir={setSel} vacio="Sin cuentas con saldo." />
      </> : (
        <div className="lista">
          {cal.map((s) => (
            <Card key={s.clave} tono={s.clave === "vencido" && (s.cobrar || s.pagar) ? "warn" : undefined}>
              <div className="tes-cab"><h3>{s.titulo}</h3><span className="tes-num">cobrar <b className="tes-pos">{monto(s.cobrar)}</b> · pagar <b className="tes-neg">{monto(s.pagar)}</b> · neto <b>{monto(s.cobrar - s.pagar)}</b></span></div>
              {s.items.length ? <div className="tes-tabla-w" style={{ marginTop: 8 }}><table className="tes-tabla"><tbody>
                {s.items.slice(0, 12).map((x, i) => <tr key={i}><td className="c1">{fechaCorta(x.vence)} · {x.deudor}</td><td>{x.folio}</td><td>{x.lado === "pagar" ? "Pagar" : X.TIPOS_CXC[x.tipo]}</td><td className={x.lado === "pagar" ? "tes-neg" : "tes-pos"}>{monto(x.monto)}</td></tr>)}
                {s.items.length > 12 && <tr><td className="c1 mu" colSpan={4}>… y {s.items.length - 12} más</td></tr>}
              </tbody></table></div> : <p className="tes-nota">Sin vencimientos.</p>}
            </Card>
          ))}
        </div>
      )}
      {sel && <Detalle key={sel.id} d={d} c={sel} lado={tab === "pagar" ? "pagar" : "cobrar"} onClose={() => setSel(null)} />}
      {nueva && <NuevaCxc d={d} onClose={() => setNueva(false)} />}
    </div>
  );
}
