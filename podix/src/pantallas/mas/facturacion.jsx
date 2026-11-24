// Más · Facturación (CFDI 4.0 SIMULADO). Portado de Pie Firme (pages/comercial/Facturacion.jsx, lib/comercial/fiscal.js,
// lib/adaptadores/pac.js). Cajero: factura sus tickets del mes. Administración y Dirección: todo (global, notas de crédito,
// complementos de pago, cancelación, emisor). Gerente: consulta las de su sucursal. Reglas P-055 a P-066.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_ventas.js";
import * as R from "../../store/reglas.js";
import { Badge, BarraAccion, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso, useDebounced } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { AvisoSim, BadgeEstado, Imprimible, Pestanas, SelectorSucursal, imprimir } from "../../componentes/ventas/comun.jsx";
import HojaCfdi from "../../componentes/ventas/HojaCfdi.jsx";
import { dinero, fechaCorta, hora, hoy, dia } from "../../lib/format.js";
import "../../estilos_ventas.css";

const vacioRec = { rfc: "", nombre: "", regimen: "", usoCfdi: "D01", cp: "", correo: "" };
const run = (fn, okTxt) => { const r = mutar(fn); if (r && r.ok) { if (okTxt) aviso(okTxt, "ok"); } else aviso((r && r.error) || "No se pudo completar.", "bad"); return r; };

export default function Facturacion() {
  const { d, u } = useSesion();
  const p = A.permisosVentas(u);
  const [tab, setTab] = useState(p.facturar ? "pendientes" : "facturas");
  const [suc, setSuc] = useState("");
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [facturar, setFacturar] = useState(null);   // venta
  const [ver, setVer] = useState(null);             // id de factura
  if (!p.verFacturas) return <Vacio icon="lock">La facturación es de caja, gerencia, Administración central y Dirección.</Vacio>;
  const sucs = A.esCentral(u) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  const res = A.resumenFacturacion(d, u, { mes, sucursalId: suc || null });
  const opts = [
    ...(p.facturar ? [{ v: "pendientes", l: "Por facturar", n: res.pendientes }] : []),
    { v: "facturas", l: "Facturas" },
    ...(p.fiscal ? [{ v: "global", l: "Factura global" }, { v: "plazos", l: "Plazos (PPD)" }, { v: "receptores", l: "Receptores" }, { v: "emisor", l: "Emisor y PAC" }] : []),
  ];
  const fVer = ver ? d.fiscal.facturas.find((f) => f.id === ver) : null;
  return (
    <div className="v-col">
      <Titulo derecha={<Badge tono="warn">Simulado</Badge>}>Facturación electrónica</Titulo>
      <AvisoSim titulo="CFDI 4.0 simulado">{A.AVISO_PAC} El IVA por concepto (servicios de salud exentos, productos 16 %) está «por validar con contador».</AvisoSim>
      <div className="v-filtros">
        <SelectorSucursal d={d} sucursales={sucs} valor={suc} onChange={setSuc} todas={sucs.length > 1} />
        <Input type="month" value={mes} max={hoy().slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Mes" />
      </div>
      <div className="kpis v-kpis">
        <Kpi label="Facturado en el mes" valor={dinero(res.facturado)} nota={`${res.emitidas} CFDI vigentes`} tono="ok" />
        <Kpi label="IVA trasladado" valor={dinero(res.ivaTrasladado)} />
        <Kpi label="Notas de crédito" valor={dinero(res.notas)} tono={res.notas ? "warn" : undefined} />
        <Kpi label="Tickets sin factura" valor={res.pendientes} nota={res.solicitadas ? `${res.solicitadas} la pidieron` : "van a la global"} tono={res.solicitadas ? "warn" : undefined} />
      </div>
      <Pestanas opciones={opts} valor={tab} onChange={setTab} />
      {tab === "pendientes" && <Pendientes d={d} u={u} suc={suc} mes={mes} onFacturar={setFacturar} />}
      {tab === "facturas" && <Facturas d={d} u={u} suc={suc} mes={mes} onVer={(f) => setVer(f.id)} />}
      {tab === "global" && <Global d={d} suc={suc} mes={mes} onVer={(f) => setVer(f.id)} />}
      {tab === "plazos" && <Plazos d={d} onVer={(f) => setVer(f.id)} />}
      {tab === "receptores" && <Receptores d={d} />}
      {tab === "emisor" && <Emisor d={d} />}
      {facturar && <FacturarSheet d={d} venta={facturar} onClose={() => setFacturar(null)} onHecho={(f) => { setFacturar(null); setVer(f.id); }} />}
      {fVer && <DetalleFactura d={d} u={u} f={fVer} onClose={() => setVer(null)} onVer={(x) => setVer(x.id)} />}
    </div>
  );
}

function Pendientes({ d, u, suc, mes, onFacturar }) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [filtro, setFiltro] = useState("todos");
  const lista = useMemo(() => A.pendientesDeFacturar(d, { mes, sucursalId: suc || null, cajeroId: u.rol === "cajero" ? u.id : null })
    .filter((x) => (filtro === "todos" || (filtro === "solicitada" ? x.solicitada : !x.enPlazo)) && (!dq || `${x.venta.folio} ${R.nombrePaciente(d, x.venta.pacienteId)}`.toLowerCase().includes(dq.toLowerCase()))), [d, mes, suc, u, filtro, dq]);
  const fueraMes = mes !== hoy().slice(0, 7);
  return (
    <>
      {u.rol === "cajero" && <p className="peq mu">Ves los tickets que tú cobraste. Un ticket se factura dentro del mismo mes (P-064); lo que no se facture va en la factura global.</p>}
      {fueraMes && <Card tono="warn"><span className="peq">Ese mes ya cerró: sus tickets ya no se facturan individualmente, van a la factura global (Administración).</span></Card>}
      <Buscador valor={q} onChange={setQ} placeholder="Folio o paciente" />
      <Chips opciones={[{ v: "todos", l: "Todos" }, { v: "solicitada", l: "Pidieron factura" }, { v: "fuera", l: "Fuera de plazo" }]} valor={filtro} onChange={setFiltro} />
      <Vista id="v-fact-pend" items={lista.map((x) => ({ ...x, id: x.venta.id }))} inicial="renglones" minTarjeta={220}
        tarjeta={(x) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{x.venta.folio}</b>{x.solicitada ? <Badge tono="warn">Pidió factura</Badge> : x.enPlazo ? <Badge tono="info">En plazo</Badge> : <Badge tono="bad">Fuera de plazo</Badge>}</div>
          <div className="peq mu">{R.nombrePaciente(d, x.venta.pacienteId)}</div><div className="peq">{fechaCorta(x.venta.fecha)} {hora(x.venta.fecha)} · {R.nombreSucursal(d, x.venta.sucursalId)}</div><b>{dinero(x.venta.total)}</b></div>}
        columnas={[
          { k: "f", t: "Ticket", v: (x) => x.venta.folio },
          { k: "fe", t: "Fecha", v: (x) => `${fechaCorta(x.venta.fecha)} ${hora(x.venta.fecha)}`, orden: (x) => x.venta.fecha },
          { k: "p", t: "Paciente", v: (x) => R.nombrePaciente(d, x.venta.pacienteId) },
          { k: "s", t: "Sucursal", v: (x) => R.nombreSucursal(d, x.venta.sucursalId) },
          { k: "e", t: "Estado", v: (x) => (x.solicitada ? <Badge tono="warn">Pidió factura</Badge> : x.enPlazo ? <Badge tono="info">En plazo</Badge> : <Badge tono="bad">Fuera de plazo</Badge>), orden: (x) => (x.solicitada ? 0 : x.enPlazo ? 1 : 2) },
          { k: "t", t: "Total", v: (x) => dinero(x.venta.total), der: true, orden: (x) => x.venta.total },
        ]}
        onAbrir={(x) => (x.enPlazo && A.puedeFacturarVenta(u, x.venta) ? onFacturar(x.venta) : aviso(x.enPlazo ? "No puedes facturar este ticket." : "Fuera de plazo: va en la factura global del mes.", "warn"))}
        vacio="No hay tickets pendientes de facturar." />
    </>
  );
}

function DesgloseTicket({ d, venta }) {
  const c = A.conceptosDeVenta(d, venta);
  return (
    <div className="v-desglose">
      {c.conceptos.map((x, i) => <div key={i}><span>{x.cantidad} × {x.descripcion}</span><Badge tono={x.ivaTipo === "exento" ? "info" : "neutral"}>{x.ivaTipo === "exento" ? "Exento" : "IVA 16 %"}</Badge><b>{dinero(x.base + x.iva)}</b></div>)}
      <Resumen filas={[["Subtotal (sin IVA)", dinero(c.subtotal)], c.descuento > 0 && ["Descuento", `-${dinero(c.descuento)}`], ["IVA 16 %", dinero(c.iva)], ["Total", dinero(c.total), true]]} />
    </div>
  );
}

function FormReceptor({ r, setR, errores = {} }) {
  const campo = (k) => (e) => setR({ ...r, [k]: e.target.value });
  return (
    <div className="form2">
      <Field label="RFC" error={errores.rfc}><Input value={r.rfc} onChange={(e) => setR({ ...r, rfc: e.target.value.toUpperCase() })} autoComplete="off" maxLength={13} /></Field>
      <Field label="Nombre o razón social" error={errores.nombre} hint="Tal como en la constancia, sin régimen societario"><Input value={r.nombre} onChange={campo("nombre")} /></Field>
      <Field label="Régimen fiscal" error={errores.regimen}><Select value={r.regimen} onChange={campo("regimen")}><option value="">Elige…</option>{A.REGIMENES.map((x) => <option key={x[0]} value={x[0]}>{x[0]} · {x[1]}</option>)}</Select></Field>
      <Field label="Uso del CFDI" error={errores.usoCfdi}><Select value={r.usoCfdi} onChange={campo("usoCfdi")}>{A.USOS_CFDI.filter((x) => x[0] !== "CP01").map((x) => <option key={x[0]} value={x[0]}>{x[0]} · {x[1]}</option>)}</Select></Field>
      <Field label="Código postal fiscal" error={errores.cp}><Input inputMode="numeric" maxLength={5} value={r.cp} onChange={(e) => setR({ ...r, cp: e.target.value.replace(/\D/g, "") })} /></Field>
      <Field label="Correo para enviar el CFDI"><Input type="email" value={r.correo || ""} onChange={campo("correo")} /></Field>
    </div>
  );
}

function FacturarSheet({ d, venta, onClose, onHecho }) {
  const propios = A.receptoresDePaciente(d, venta.pacienteId);
  const [modo, setModo] = useState(propios.length ? propios[0].id : "nuevo");
  const [r, setR] = useState(vacioRec);
  const [errores, setErrores] = useState({});
  const [guardar, setGuardar] = useState(true);
  const receptor = modo === "publico" ? A.receptorPublico(d.fiscal.emisor.cp) : modo === "nuevo" ? r : propios.find((x) => x.id === modo);
  const enviar = () => {
    const res = mutar((dd) => {
      if (modo === "nuevo" && guardar) { const g = A.guardarReceptor(dd, { ...r, pacienteId: venta.pacienteId }); if (!g.ok) return g; }
      return A.facturarVenta(dd, { ventaId: venta.id, receptor });
    });
    if (res.ok) { aviso(`Factura ${res.factura.folio} timbrada (simulado).`, "ok"); onHecho(res.factura); }
    else { setErrores(res.errores || {}); aviso(res.error, "bad"); }
  };
  return (
    <Sheet abierto onClose={onClose} titulo={`Facturar ${venta.folio}`} pie={<Button block icon="receipt" onClick={enviar}>Timbrar (simulado)</Button>}>
      <p className="peq mu">{R.nombrePaciente(d, venta.pacienteId)} · {fechaCorta(venta.fecha)} {hora(venta.fecha)} · {R.nombreSucursal(d, venta.sucursalId)}</p>
      <DesgloseTicket d={d} venta={venta} />
      <Titulo>Receptor</Titulo>
      <Chips scroll opciones={[...propios.map((x) => ({ v: x.id, l: x.rfc })), { v: "nuevo", l: "Otro RFC" }, { v: "publico", l: "Público en general" }]} valor={modo} onChange={(v) => { setModo(v); setErrores({}); }} />
      {modo === "nuevo" && <><FormReceptor r={r} setR={setR} errores={errores} /><label className="v-check"><input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} /> Guardar estos datos fiscales en el expediente del paciente</label></>}
      {modo !== "nuevo" && receptor && <Resumen filas={[["RFC", receptor.rfc], ["Nombre", receptor.nombre], ["Régimen", receptor.regimen], ["Uso", receptor.usoCfdi], ["CP", receptor.cp]]} />}
      {modo === "publico" && <p className="peq mu">RFC genérico XAXX010101000, uso S01 (sin efectos fiscales). Normalmente este ticket iría en la factura global.</p>}
    </Sheet>
  );
}

function Facturas({ d, u, suc, mes, onVer }) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const lista = A.facturasVisibles(d, u, { tipo, estado, texto: dq, sucursalId: suc, mes });
  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="Folio, RFC, nombre, ticket o UUID" />
      <Chips scroll opciones={[{ v: "", l: "Todos los tipos" }, ...Object.entries(A.TIPOS_FACTURA).map(([v, l]) => ({ v, l }))]} valor={tipo} onChange={setTipo} />
      <Chips scroll opciones={[{ v: "", l: "Todos" }, ...Object.entries(A.ESTADOS_FACTURA).filter(([k]) => k !== "borrador").map(([v, x]) => ({ v, l: x[0] }))]} valor={estado} onChange={setEstado} />
      <Vista id="v-facturas" items={lista} inicial="renglones"
        tarjeta={(f) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{f.folio}</b><BadgeEstado mapa={A.ESTADOS_FACTURA} k={f.estado} /></div>
          <div className="peq">{A.TIPOS_FACTURA[f.tipo]} · {fechaCorta(f.fecha)}</div><div className="peq mu">{f.receptor.rfc} · {f.receptor.nombre}</div><b>{dinero(f.tipo === "pago" ? f.pago.monto : f.total)}</b></div>}
        columnas={[
          { k: "f", t: "Folio", v: (f) => f.folio },
          { k: "t", t: "Tipo", v: (f) => A.TIPOS_FACTURA[f.tipo] },
          { k: "fe", t: "Fecha", v: (f) => fechaCorta(f.fecha), orden: (f) => f.fecha },
          { k: "r", t: "Receptor", v: (f) => <span>{f.receptor.rfc}<br /><small className="mu">{f.receptor.nombre}</small></span>, orden: (f) => f.receptor.rfc },
          { k: "o", t: "Origen", v: (f) => f.ventaFolio || f.planFolio || (f.relacionada && f.relacionada.folio) || (f.global ? f.global.mes : "—") },
          { k: "e", t: "Estado", v: (f) => <BadgeEstado mapa={A.ESTADOS_FACTURA} k={f.estado} />, orden: (f) => f.estado },
          { k: "m", t: "Total", v: (f) => dinero(f.tipo === "pago" ? f.pago.monto : f.total), der: true, orden: (f) => f.total || (f.pago && f.pago.monto) || 0 },
        ]}
        onAbrir={onVer} vacio="Sin facturas con esos filtros." />
    </>
  );
}

function DetalleFactura({ d, u, f, onClose, onVer }) {
  const p = A.permisosVentas(u);
  const [accion, setAccion] = useState(null);   // nc | cp | cancelar
  const [print, setPrint] = useState(false);
  const relacionadas = d.fiscal.facturas.filter((x) => x.relacionada && x.relacionada.facturaId === f.id);
  const acreditable = ["ingreso", "global"].includes(f.tipo) ? A.saldoAcreditable(d, f) : 0;
  const ppd = f.metodoPago === "PPD" && f.tipo === "ingreso";
  return (
    <Sheet abierto onClose={onClose} titulo={`${A.TIPOS_FACTURA[f.tipo]} ${f.folio}`}
      pie={<div className="v-acciones">
        <Button variante="sec" icon="download" onClick={() => { setPrint(true); imprimir(); setTimeout(() => setPrint(false), 1500); }}>Imprimir</Button>
        {p.fiscal && f.estado === "timbrada" && ["ingreso", "global"].includes(f.tipo) && acreditable > 0 && <Button variante="ghost" onClick={() => setAccion("nc")}>Nota de crédito</Button>}
        {p.fiscal && f.estado === "timbrada" && ppd && A.saldoInsoluto(d, f) > 0 && <Button variante="ghost" onClick={() => setAccion("cp")}>Complemento de pago</Button>}
        {p.fiscal && f.estado === "timbrada" && <Button variante="danger" onClick={() => setAccion("cancelar")}>Cancelar</Button>}
        {p.fiscal && f.estado === "cancelacion_solicitada" && <><Button variante="ok" onClick={() => run((dd) => A.resolverCancelacion(dd, { facturaId: f.id, aceptada: true }), "El receptor aceptó la cancelación (simulado).")}>Receptor acepta</Button>
          <Button variante="sec" onClick={() => run((dd) => A.resolverCancelacion(dd, { facturaId: f.id, aceptada: false }), "El receptor rechazó: la factura sigue vigente.")}>Receptor rechaza</Button></>}
      </div>}>
      <div className="v-hoja-w"><HojaCfdi f={f} /></div>
      <Imprimible abierto={print}><HojaCfdi f={f} /></Imprimible>
      {["ingreso", "global"].includes(f.tipo) && <Resumen filas={[["Acreditado con notas", dinero(A.acreditado(d, f.id))], ["Pendiente de acreditar", dinero(acreditable)], ppd && ["Saldo insoluto (PPD)", dinero(A.saldoInsoluto(d, f)), true]]} />}
      {f.cancelacion && <Card tono={f.estado === "cancelada" ? "bad" : "warn"}><b>Cancelación · motivo {f.cancelacion.motivo}</b><div className="peq">{f.cancelacion.comentario} · {f.cancelacion.directa ? "directa (mismo mes)" : "con aceptación del receptor"} · acuse {f.cancelacion.acuse || "—"}</div></Card>}
      {relacionadas.length > 0 && <><Titulo>CFDI relacionados</Titulo><div className="lista">{relacionadas.map((x) => <Fila key={x.id} titulo={`${A.TIPOS_FACTURA[x.tipo]} ${x.folio}`} sub={fechaCorta(x.fecha)} badge={<BadgeEstado mapa={A.ESTADOS_FACTURA} k={x.estado} />} derecha={<b>{dinero(x.tipo === "pago" ? x.pago.monto : x.total)}</b>} onClick={() => onVer(x)} />)}</div></>}
      {accion === "nc" && <NotaCreditoSheet d={d} f={f} max={acreditable} onClose={() => setAccion(null)} onHecho={(x) => { setAccion(null); onVer(x); }} />}
      {accion === "cp" && <ComplementoSheet d={d} f={f} onClose={() => setAccion(null)} onHecho={(x) => { setAccion(null); onVer(x); }} />}
      {accion === "cancelar" && <CancelarSheet d={d} f={f} onClose={() => setAccion(null)} onHecho={(x) => { setAccion(null); if (x) onVer(x); }} />}
    </Sheet>
  );
}

function NotaCreditoSheet({ d, f, max, onClose, onHecho }) {
  const devs = (d.devoluciones || []).filter((x) => x.ventaId && x.ventaId === f.ventaId);
  const [monto, setMonto] = useState(String(devs[0] ? Math.min(devs[0].monto, max) : ""));
  const [motivo, setMotivo] = useState(devs[0] ? `Devolución ${devs[0].folio} · ${devs[0].motivo}` : "");
  return (
    <Sheet abierto onClose={onClose} titulo={`Nota de crédito a ${f.folio}`} pie={<Button block onClick={() => { const r = run((dd) => A.notaCredito(dd, { facturaId: f.id, monto, motivo, devolucionId: devs[0] ? devs[0].id : null }), "Nota de crédito timbrada (simulado)."); if (r.ok) onHecho(r.factura); }}>Emitir nota de crédito</Button>}>
      <p className="peq mu">CFDI de egreso con relación 01. El monto no puede rebasar lo pendiente de acreditar: {dinero(max)}. El IVA se reparte en proporción a los conceptos de la factura.</p>
      <Field label="Monto con IVA"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
      <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Devolución, bonificación, descuento posterior…" /></Field>
    </Sheet>
  );
}
function ComplementoSheet({ d, f, onClose, onHecho }) {
  const abonos = A.abonosSinComplemento(d, f);
  const [abono, setAbono] = useState(abonos[0] ? abonos[0].id : "");
  const [monto, setMonto] = useState("");
  const [forma, setForma] = useState("efectivo");
  return (
    <Sheet abierto onClose={onClose} titulo={`Complemento de pago · ${f.folio}`} pie={<Button block onClick={() => { const r = run((dd) => A.complementoPago(dd, { facturaId: f.id, abonoId: abono || null, monto, forma }), "Complemento de pago timbrado (simulado)."); if (r.ok) onHecho(r.factura); }}>Emitir complemento</Button>}>
      <p className="peq mu">Saldo insoluto: <b>{dinero(A.saldoInsoluto(d, f))}</b>. Un complemento por abono recibido (CFDI tipo P).</p>
      <Field label="Abono del plan"><Select value={abono} onChange={(e) => setAbono(e.target.value)}><option value="">Pago capturado a mano</option>{abonos.map((a) => <option key={a.id} value={a.id}>{dia(a.fecha)} · {dinero(a.monto)}</option>)}</Select></Field>
      {!abono && <div className="dos"><Field label="Monto"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
        <Field label="Forma"><Select value={forma} onChange={(e) => setForma(e.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></Select></Field></div>}
    </Sheet>
  );
}
function CancelarSheet({ d, f, onClose, onHecho }) {
  const [motivo, setMotivo] = useState("02");
  const [comentario, setComentario] = useState("");
  const [r, setR] = useState({ ...vacioRec, ...f.receptor });
  const directa = A.cancelacionDirecta(f) || f.receptor.rfc === A.RFC_PUBLICO;
  const enviar = () => { const x = run((dd) => A.cancelarFactura(dd, { facturaId: f.id, motivo, comentario, receptorNuevo: motivo === "01" ? r : null }), directa ? "Factura cancelada (simulado)." : "Cancelación enviada: espera la aceptación del receptor."); if (x.ok) onHecho(x.sustituta); };
  return (
    <Sheet abierto onClose={onClose} titulo={`Cancelar ${f.folio}`} pie={<Button variante="danger" block onClick={enviar}>Solicitar cancelación</Button>}>
      <Card tono={directa ? "ok" : "warn"}><span className="peq">{directa ? "Emitida este mes (o a público en general): la cancelación es directa." : "Emitida en un mes anterior: el receptor debe aceptar la cancelación (simulado)."}</span></Card>
      <Field label="Motivo SAT"><Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{A.MOTIVOS_CANCELACION.map((m) => <option key={m[0]} value={m[0]} disabled={m[0] === "01" && !f.ventaId}>{m[0]} · {m[1]}</option>)}</Select></Field>
      <Field label="Comentario interno"><Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué pasó y quién lo pidió" /></Field>
      {motivo === "01" && <><Titulo>Datos de la factura sustituta</Titulo><FormReceptor r={r} setR={setR} /><p className="peq mu">Se timbra la sustituta (relación 04) y se cancela esta en el mismo acto.</p></>}
    </Sheet>
  );
}

function Global({ d, suc, mes, onVer }) {
  const cand = A.candidatosGlobal(d, { mes, sucursalId: suc || null });
  const tot = cand.reduce((a, v) => a + v.total, 0);
  const globales = d.fiscal.facturas.filter((f) => f.tipo === "global").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const [conf, setConf] = useState(false);
  return (
    <>
      <Card><b>Factura global de {mes}{suc ? ` · ${R.nombreSucursal(d, suc)}` : " · todas las sucursales"}</b>
        <div className="peq mu">Ampara los tickets pagados del mes que nadie facturó (receptor público en general, periodicidad mensual). Un concepto por ticket y tipo de IVA.</div>
        <Resumen filas={[["Tickets sin factura", cand.length], ["Importe", dinero(tot), true]]} />
        <Button block disabled={!cand.length} onClick={() => setConf(true)}>Emitir factura global (simulado)</Button>
      </Card>
      {conf && <Sheet abierto onClose={() => setConf(false)} titulo="Confirmar factura global" pie={<Button block onClick={() => { const r = run((dd) => A.facturaGlobal(dd, { mes, sucursalId: suc || null }), "Factura global timbrada (simulado)."); setConf(false); if (r.ok) onVer(r.factura); }}>Emitir</Button>}>
        <p className="txt">Se incluirán {cand.length} tickets por {dinero(tot)}. Después ningún ticket incluido se podrá facturar de forma individual.</p></Sheet>}
      <Titulo>Globales emitidas</Titulo>
      <div className="lista">{globales.map((f) => <Fila key={f.id} titulo={f.folio} sub={`${f.global ? f.global.mes : ""} · ${f.global && f.global.tickets ? `${f.global.tickets} tickets` : "resumen mensual"}`} badge={<BadgeEstado mapa={A.ESTADOS_FACTURA} k={f.estado} />} derecha={<b>{dinero(f.total)}</b>} onClick={() => onVer(f)} />)}
        {!globales.length && <Vacio icon="receipt">Aún no hay facturas globales.</Vacio>}</div>
    </>
  );
}

function Plazos({ d, onVer }) {
  const [plan, setPlan] = useState(null);
  const [r, setR] = useState(vacioRec);
  const planes = d.planes.filter((p) => ["vigente", "liquidado"].includes(p.estado));
  return (
    <>
      <p className="peq mu">Ventas a plazos y crédito: se facturan con método PPD (forma 99) y cada abono se ampara con un complemento de pago.</p>
      <Vista id="v-fact-ppd" items={planes} inicial="renglones"
        tarjeta={(p) => { const f = A.facturaVigenteDePlan(d, p.id); return <div className="v-tar"><b>{p.folio}</b><div className="peq mu">{R.nombrePaciente(d, p.pacienteId)}</div><div>{dinero(p.monto)}</div>{f ? <Badge tono="ok">{f.folio}</Badge> : <Badge tono="warn">Sin factura</Badge>}</div>; }}
        columnas={[{ k: "f", t: "Plan", v: (p) => p.folio }, { k: "p", t: "Paciente", v: (p) => R.nombrePaciente(d, p.pacienteId) }, { k: "t", t: "Tipo", v: (p) => (p.tipo === "plazos" ? "Plazos" : "Crédito") },
          { k: "m", t: "Monto", v: (p) => dinero(p.monto), der: true, orden: (p) => p.monto },
          { k: "fa", t: "Factura", v: (p) => { const f = A.facturaVigenteDePlan(d, p.id); return f ? <Badge tono="ok">{f.folio} · saldo {dinero(A.saldoInsoluto(d, f))}</Badge> : <Badge tono="warn">Sin factura</Badge>; } }]}
        onAbrir={(p) => { const f = A.facturaVigenteDePlan(d, p.id); if (f) onVer(f); else { setPlan(p); const rr = A.receptoresDePaciente(d, p.pacienteId)[0]; setR(rr ? { ...vacioRec, ...rr } : vacioRec); } }} />
      {plan && <Sheet abierto onClose={() => setPlan(null)} titulo={`Facturar ${plan.folio} (PPD)`} pie={<Button block onClick={() => { const x = run((dd) => A.facturarPlan(dd, { planId: plan.id, receptor: r }), "Factura PPD timbrada (simulado)."); if (x.ok) { setPlan(null); onVer(x.factura); } }}>Timbrar (simulado)</Button>}>
        <Resumen filas={[["Monto", dinero(plan.monto)], ["Enganche", dinero(plan.enganche || 0)]]} /><FormReceptor r={r} setR={setR} /></Sheet>}
    </>
  );
}

function Receptores({ d }) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [edit, setEdit] = useState(null);
  const [errores, setErrores] = useState({});
  const lista = d.fiscal.receptores.filter((x) => !dq || `${x.rfc} ${x.nombre}`.toLowerCase().includes(dq.toLowerCase()));
  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="RFC o nombre" />
      <Vista id="v-receptores" items={lista} inicial="renglones"
        tarjeta={(x) => <div className="v-tar"><b>{x.rfc}</b><div className="peq">{x.nombre}</div><div className="peq mu">Régimen {x.regimen} · uso {x.usoCfdi} · CP {x.cp}</div>{x.validado ? <Badge tono="ok">Validado</Badge> : <Badge tono="warn">Por validar</Badge>}</div>}
        columnas={[{ k: "r", t: "RFC", v: (x) => x.rfc }, { k: "n", t: "Nombre", v: (x) => x.nombre }, { k: "p", t: "Paciente", v: (x) => (x.pacienteId ? R.nombrePaciente(d, x.pacienteId) : "—") },
          { k: "g", t: "Régimen / uso", v: (x) => `${x.regimen} · ${x.usoCfdi}` }, { k: "c", t: "CP", v: (x) => x.cp }, { k: "v", t: "Estado", v: (x) => (x.validado ? <Badge tono="ok">Validado</Badge> : <Badge tono="warn">Por validar</Badge>) }]}
        onAbrir={(x) => { setErrores({}); setEdit({ ...vacioRec, ...x }); }} />
      {edit && <Sheet abierto onClose={() => setEdit(null)} titulo={`Receptor ${edit.rfc}`} pie={<Button block onClick={() => { const r = mutar((dd) => A.guardarReceptor(dd, edit)); if (r.ok) { aviso("Datos fiscales guardados.", "ok"); setEdit(null); } else { setErrores(r.errores || {}); aviso(r.error, "bad"); } }}>Guardar</Button>}>
        <FormReceptor r={edit} setR={setEdit} errores={errores} /></Sheet>}
    </>
  );
}

function Emisor({ d }) {
  const [e, setE] = useState({ ...d.fiscal.emisor });
  return (
    <Card>
      <b>Datos del emisor (ficticios en la demostración)</b>
      <div className="form2">
        <Field label="RFC"><Input value={e.rfc} onChange={(x) => setE({ ...e, rfc: x.target.value.toUpperCase() })} /></Field>
        <Field label="Razón social"><Input value={e.razon} onChange={(x) => setE({ ...e, razon: x.target.value })} /></Field>
        <Field label="Régimen"><Select value={e.regimen} onChange={(x) => setE({ ...e, regimen: x.target.value })}>{A.REGIMENES.map((r) => <option key={r[0]} value={r[0]}>{r[0]} · {r[1]}</option>)}</Select></Field>
        <Field label="CP de expedición"><Input inputMode="numeric" maxLength={5} value={e.cp} onChange={(x) => setE({ ...e, cp: x.target.value.replace(/\D/g, "") })} /></Field>
      </div>
      <Button onClick={() => run((dd) => A.guardarEmisor(dd, e), "Emisor actualizado.")}>Guardar emisor</Button>
      <AvisoSim titulo="PAC sin conectar">Modo {A.PAC.modo}. Falta contratar el PAC y cargar el CSD (certificado y llave) en el servidor; el navegador nunca guarda la llave. Punto de integración: PAC.timbrar / PAC.cancelar en acciones_ventas.js.</AvisoSim>
    </Card>
  );
}
