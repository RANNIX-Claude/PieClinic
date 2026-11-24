// Más · Paquetes y membresías. Portado de Pie Firme (pages/comercial/Paquetes.jsx; migraciones 052-053; P-068 a P-073):
// paquetes de sesiones, planes de láser, membresías y gift cards: venta, saldo, consumo, vigencia de 12 meses con aviso a 30 días.
// Recepción y caja venden y registran sesiones; gerencia y Administración cancelan y transfieren; Administración edita el catálogo.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_ventas.js";
import * as R from "../../store/reglas.js";
import { Badge, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso, useDebounced, Area } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import { BadgeEstado, Pestanas, SelectorSucursal } from "../../componentes/ventas/comun.jsx";
import { dinero, fechaCorta, fechaLarga, hoy, normaliza } from "../../lib/format.js";
import "../../estilos_ventas.css";

const run = (fn, okTxt) => { const r = mutar(fn); if (r && r.ok) { if (okTxt) aviso(okTxt, "ok"); } else aviso((r && r.error) || "No se pudo completar.", "bad"); return r; };
const ICONO = { paquete: "box", plan_laser: "sparkle", membresia: "award", gift_card: "card" };
const EST_MEMB = { vigente: ["Vigente", "ok"], vencida: ["Vencida", "bad"], renovada: ["Renovada", "neutral"], cancelada: ["Cancelada", "bad"] };
const EST_GIFT = { activa: ["Activa", "ok"], canjeada: ["Canjeada", "neutral"], caducada: ["Caducada", "bad"], cancelada: ["Cancelada", "bad"] };

export default function Paquetes() {
  const { d, u, sucursalId } = useSesion();
  const nav = useNavigate();
  const p = A.permisosVentas(u);
  const [tab, setTab] = useState("vender");
  const [suc, setSuc] = useState("");
  if (!p.paquetes) return <Vacio icon="lock">Paquetes y membresías: recepción, caja, gerencia y Administración.</Vacio>;
  const sucs = A.esCentral(u) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  const filtroSuc = A.esCentral(u) ? suc || null : u.rol === "gerente" ? sucursalId : null;
  const res = A.resumenPaquetes(d, { sucursalId: filtroSuc });
  const avisos = A.avisosVencimiento(d, { sucursalId: filtroSuc });
  const verConvenios = () => nav("/mas/convenios");
  return (
    <div className="v-col">
      <Titulo>Paquetes, membresías y gift cards</Titulo>
      {A.esCentral(u) && <SelectorSucursal d={d} sucursales={sucs} valor={suc} onChange={setSuc} />}
      <div className="kpis v-kpis">
        <Kpi label="Paquetes vigentes" valor={res.vigentes} nota={`${res.sesionesPendientes} sesiones por usar`} tono="ok" />
        <Kpi label="Por vencer (30 días)" valor={res.porVencer + res.membresiasPorVencer} tono={res.porVencer ? "warn" : undefined} />
        <Kpi label="Saldo por cobrar" valor={dinero(res.porCobrar)} />
        <Kpi label="Gift cards (pasivo)" valor={dinero(res.pasivoGift)} nota={`${res.giftActivas} activas · P-073`} />
      </div>
      <Pestanas valor={tab} onChange={setTab} opciones={[{ v: "vender", l: "Vender" }, { v: "vendidos", l: "Paquetes y planes" }, { v: "membresias", l: "Membresías", n: res.membresias }, { v: "gift", l: "Gift cards" }, { v: "avisos", l: "Por vencer", n: avisos.length }, ...(p.ofertas ? [{ v: "catalogo", l: "Catálogo" }] : [])]} />
      {tab === "vender" && <Vender d={d} />}
      {tab === "vendidos" && <Vendidos d={d} u={u} suc={filtroSuc} />}
      {tab === "membresias" && <Membresias d={d} suc={filtroSuc} verConvenios={verConvenios} />}
      {tab === "gift" && <Gift d={d} suc={filtroSuc} />}
      {tab === "avisos" && <Avisos d={d} avisos={avisos} />}
      {tab === "catalogo" && <Catalogo d={d} verConvenios={verConvenios} />}
    </div>
  );
}

function Pagos({ pagos, setPagos }) {
  return <div className="dos">{["efectivo", "tarjeta", "transferencia"].map((f) => (
    <Field key={f} label={f[0].toUpperCase() + f.slice(1)}><Input inputMode="decimal" value={pagos[f] || ""} onChange={(e) => setPagos({ ...pagos, [f]: e.target.value })} /></Field>))}</div>;
}
const listaPagos = (pg) => Object.entries(pg).map(([forma, monto]) => ({ forma, monto })).filter((x) => Number(x.monto) > 0);

function Vender({ d }) {
  const [tipo, setTipo] = useState("");
  const [sel, setSel] = useState(null);
  const ofertas = A.ofertasActivas(d, tipo);
  return (
    <>
      <Chips scroll opciones={[{ v: "", l: "Todo" }, ...Object.entries(A.TIPOS_OFERTA).map(([v, l]) => ({ v, l }))]} valor={tipo} onChange={setTipo} />
      <div className="v-mosaico">{ofertas.map((o) => (
        <Card key={o.id} onClick={() => setSel(o)} className="v-oferta">
          <div className="fila-flex" style={{ justifyContent: "space-between" }}><Badge tono="info">{A.TIPOS_OFERTA[o.tipo]}</Badge><span className="peq mu">{o.codigo}</span></div>
          <b>{o.nombre}</b>
          <div className="peq mu">{o.descripcion || (o.beneficios || []).join(" · ")}</div>
          <div className="v-precio">{dinero(o.precio)}</div>
          {o.sesionesTotal && <div className="peq">{o.sesionesTotal} sesiones · {dinero(o.precio / o.sesionesTotal)} c/u · vigencia {o.caducidadMeses} meses</div>}
          {o.tipo === "membresia" && <div className="peq">{o.descuentoPct} % de descuento por convenio · 12 meses</div>}
        </Card>))}</div>
      {!ofertas.length && <Vacio icon="tag">No hay ofertas activas de ese tipo.</Vacio>}
      {sel && <VenderSheet d={d} o={sel} onClose={() => setSel(null)} />}
    </>
  );
}
function VenderSheet({ d, o, onClose }) {
  const [pac, setPac] = useState(null);
  const [buscar, setBuscar] = useState(false);
  const [pagos, setPagos] = useState({ tarjeta: String(o.precio) });
  const [benef, setBenef] = useState("");
  const total = listaPagos(pagos).reduce((a, x) => a + Number(x.monto), 0);
  const parcial = ["paquete", "plan_laser"].includes(o.tipo);
  const vender = () => { const r = run((dd) => A.venderOferta(dd, { ofertaId: o.id, pacienteId: pac && pac.id, pagos: listaPagos(pagos), beneficiario: benef }), "Venta registrada."); if (r.ok) { aviso(`Ticket ${r.venta.folio}${r.registro.codigo ? ` · código ${r.registro.codigo}` : ""}`, "ok"); onClose(); } };
  return (
    <Sheet abierto onClose={onClose} titulo={`Vender · ${o.nombre}`} pie={<Button block icon="cash" onClick={vender}>Cobrar {dinero(total)}</Button>}>
      <Field label={o.tipo === "gift_card" ? "Comprador (opcional)" : "Paciente"}><Button variante="sec" block icon="user" onClick={() => setBuscar(true)}>{pac ? `${pac.nombres} ${pac.apellidos}` : "Buscar paciente"}</Button></Field>
      {o.tipo === "gift_card" && <Field label="Para quién es (beneficiario)"><Input value={benef} onChange={(e) => setBenef(e.target.value)} /></Field>}
      <Resumen filas={[["Precio", dinero(o.precio)], parcial && ["Anticipo mínimo (50 %)", dinero(o.precio / 2)], ["Vigencia", `12 meses · vence ${A.venceDe(hoy(), o.caducidadMeses || 12)}`]]} />
      <Pagos pagos={pagos} setPagos={setPagos} />
      <p className="peq mu">{parcial ? "Con saldo pendiente solo se usan las sesiones ya pagadas." : "Se paga completa."} Se genera un ticket en tu turno de caja (si lo tienes abierto) para el corte.</p>
      <SelectorPaciente abierto={buscar} onClose={() => setBuscar(false)} onElegir={setPac} />
    </Sheet>
  );
}

function Vendidos({ d, u, suc }) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [est, setEst] = useState("vigente");
  const [ver, setVer] = useState(null);
  const lista = useMemo(() => d.paq.adquiridos.filter((a) => (!suc || a.sucursalId === suc) && (!est || A.estadoVisibleAdq(a) === est || (est === "vigente" && A.estadoVisibleAdq(a) === "por_vencer"))
    && (!dq || normaliza(`${a.folio} ${a.nombre} ${R.nombrePaciente(d, a.pacienteId)}`).includes(normaliza(dq)))), [d, suc, est, dq]);
  const a = ver ? d.paq.adquiridos.find((x) => x.id === ver) : null;
  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="Paciente, folio o paquete" />
      <Chips scroll opciones={[{ v: "vigente", l: "Vigentes" }, { v: "por_vencer", l: "Por vencer" }, { v: "consumido", l: "Consumidos" }, { v: "caducado", l: "Caducados" }, { v: "cancelado", l: "Cancelados" }, { v: "", l: "Todos" }]} valor={est} onChange={setEst} />
      <Vista id="v-paq-adq" items={lista}
        tarjeta={(x) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{x.folio}</b><BadgeEstado mapa={A.ESTADOS_ADQ} k={A.estadoVisibleAdq(x)} /></div>
          <div>{x.nombre}</div><div className="peq mu">{R.nombrePaciente(d, x.pacienteId)}</div>
          <div className="v-barra"><i style={{ width: `${(x.sesionesUsadas / x.sesionesTotal) * 100}%` }} /></div>
          <div className="peq">{x.sesionesUsadas}/{x.sesionesTotal} sesiones · vence {fechaLarga(x.vence)}{x.saldoPendiente > 0 ? ` · saldo ${dinero(x.saldoPendiente)}` : ""}</div></div>}
        columnas={[{ k: "f", t: "Folio", v: (x) => x.folio }, { k: "p", t: "Paciente", v: (x) => R.nombrePaciente(d, x.pacienteId) }, { k: "n", t: "Paquete", v: (x) => x.nombre },
          { k: "s", t: "Sesiones", v: (x) => `${x.sesionesUsadas}/${x.sesionesTotal}`, orden: (x) => A.sesionesRestantes(x) },
          { k: "v", t: "Vence", v: (x) => fechaLarga(x.vence), orden: (x) => x.vence }, { k: "sa", t: "Saldo", v: (x) => dinero(x.saldoPendiente), der: true, orden: (x) => x.saldoPendiente },
          { k: "e", t: "Estado", v: (x) => <BadgeEstado mapa={A.ESTADOS_ADQ} k={A.estadoVisibleAdq(x)} />, orden: (x) => A.estadoVisibleAdq(x) }]}
        onAbrir={(x) => setVer(x.id)} vacio="Sin paquetes con ese filtro." />
      {a && <DetallePaquete d={d} u={u} a={a} onClose={() => setVer(null)} />}
    </>
  );
}
function DetallePaquete({ d, u, a, onClose }) {
  const p = A.permisosVentas(u);
  const [modo, setModo] = useState(null);
  const [pod, setPod] = useState("");
  const [monto, setMonto] = useState(String(a.saldoPendiente || ""));
  const [forma, setForma] = useState("efectivo");
  const [motivo, setMotivo] = useState("");
  const [destino, setDestino] = useState(null);
  const [buscar, setBuscar] = useState(false);
  const consumos = d.paq.consumos.filter((c) => c.adquiridoId === a.id).sort((x, y) => x.n - y.n);
  const trans = d.paq.transferencias.filter((t) => t.adquiridoId === a.id);
  const pods = d.usuarios.filter((x) => x.rol === "podologo" && x.sucursales.includes(d.sesion.sucursalId));
  const est = A.estadoVisibleAdq(a);
  const vivo = ["vigente", "por_vencer"].includes(est);
  return (
    <Sheet abierto onClose={onClose} titulo={`${a.folio} · ${a.nombre}`}
      pie={<div className="v-acciones">
        {vivo && <Button icon="check" onClick={() => setModo("consumir")}>Registrar sesión</Button>}
        {a.saldoPendiente > 0 && a.estado !== "cancelado" && <Button variante="sec" onClick={() => setModo("abonar")}>Abonar</Button>}
        {p.paquetesGestion && vivo && a.transferible && <Button variante="ghost" onClick={() => setModo("transferir")}>Transferir</Button>}
        {p.paquetesGestion && a.estado !== "cancelado" && <Button variante="danger" onClick={() => setModo("cancelar")}>Cancelar</Button>}
      </div>}>
      <Resumen filas={[["Paciente", R.nombrePaciente(d, a.pacienteId)], ["Estado", A.ESTADOS_ADQ[est][0]], ["Compra", `${fechaCorta(a.fechaCompra)} · ${R.nombreSucursal(d, a.sucursalId)}`], ["Vence", `${fechaLarga(a.vence)} (${A.diasParaVencer(a)} días)`],
        ["Sesiones", `${a.sesionesUsadas} usadas de ${a.sesionesTotal} · ${A.sesionesPagadas(a)} pagadas`], ["Valor por sesión", dinero(A.valorSesion(a))], ["Pagado", dinero(a.pagado)], ["Saldo", dinero(a.saldoPendiente), true]]} />
      {est === "por_vencer" && <Card tono="warn"><span className="peq">Vence en {A.diasParaVencer(a)} días: al caducar se pierden las sesiones sin usar (P-070). Avísale al paciente.</span></Card>}
      {a.motivoCancelacion && <Card tono="bad"><span className="peq">Cancelado: {a.motivoCancelacion}{a.reembolsoSugerido != null ? ` · reembolso sugerido ${dinero(a.reembolsoSugerido)}` : ""}</span></Card>}
      <Titulo>Sesiones usadas</Titulo>
      <div className="lista">{consumos.map((c) => <Fila key={c.id} titulo={`Sesión ${c.n}`} sub={`${fechaCorta(c.fecha)} · ${R.nombreSucursal(d, c.sucursalId)}`} datos={R.nombreUsuario(d, c.podologoId)} derecha={<span className="peq">{dinero(c.valor)}</span>} />)}
        {!consumos.length && <Vacio icon="calendar">Aún no se usa ninguna sesión.</Vacio>}</div>
      {trans.length > 0 && <><Titulo>Transferencias</Titulo>{trans.map((t) => <Fila key={t.id} titulo={`${R.nombrePaciente(d, t.dePacienteId)} → ${R.nombrePaciente(d, t.aPacienteId)}`} sub={`${fechaCorta(t.fecha)} · ${t.motivo}`} />)}</>}
      {modo === "consumir" && <Sheet abierto onClose={() => setModo(null)} titulo="Registrar sesión" pie={<Button block onClick={() => { const r = run((dd) => A.consumirSesion(dd, { adquiridoId: a.id, podologoId: pod }), "Sesión registrada."); if (r.ok) setModo(null); }}>Registrar</Button>}>
        <Field label="Podólogo que atendió"><Select value={pod} onChange={(e) => setPod(e.target.value)}><option value="">Elige…</option>{(pods.length ? pods : d.usuarios.filter((x) => x.rol === "podologo")).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
        <p className="peq mu">Se usa en cualquier sucursal; queda con la sucursal en la que trabajas hoy. La sesión se comisiona al podólogo a su valor congelado (P-107).</p></Sheet>}
      {modo === "abonar" && <Sheet abierto onClose={() => setModo(null)} titulo="Abonar al paquete" pie={<Button block onClick={() => { const r = run((dd) => A.abonarPaquete(dd, { adquiridoId: a.id, monto, forma }), "Abono registrado."); if (r.ok) setModo(null); }}>Cobrar abono</Button>}>
        <div className="dos"><Field label="Monto"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field>
          <Field label="Forma"><Select value={forma} onChange={(e) => setForma(e.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></Select></Field></div></Sheet>}
      {modo === "transferir" && <Sheet abierto onClose={() => setModo(null)} titulo="Transferir a otro paciente" pie={<Button block onClick={() => { const r = run((dd) => A.transferirPaquete(dd, { adquiridoId: a.id, aPacienteId: destino && destino.id, motivo }), "Paquete transferido."); if (r.ok) setModo(null); }}>Transferir</Button>}>
        <Button variante="sec" block icon="user" onClick={() => setBuscar(true)}>{destino ? `${destino.nombres} ${destino.apellidos}` : "Elegir paciente"}</Button>
        <Field label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. lo compró para un familiar" /></Field>
        <p className="peq mu">Conserva la vigencia original y las sesiones ya usadas.</p>
        <SelectorPaciente abierto={buscar} onClose={() => setBuscar(false)} onElegir={setDestino} /></Sheet>}
      {modo === "cancelar" && <Sheet abierto onClose={() => setModo(null)} titulo="Cancelar paquete" pie={<Button variante="danger" block onClick={() => { const r = run((dd) => A.cancelarPaquete(dd, { adquiridoId: a.id, motivo })); if (r.ok) { aviso(`Cancelado. Reembolso sugerido: ${dinero(r.reembolso)}`, "ok"); setModo(null); } }}>Cancelar paquete</Button>}>
        <p className="peq">Reembolso sugerido = pagado − sesiones usadas × valor de sesión = <b>{dinero(Math.max(0, a.pagado - a.sesionesUsadas * A.valorSesion(a)))}</b> (la devolución de dinero se hace en Devoluciones).</p>
        <Field label="Motivo"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field></Sheet>}
    </Sheet>
  );
}

function Membresias({ d, suc, verConvenios }) {
  const [ver, setVer] = useState(null);
  const [pagos, setPagos] = useState({});
  const lista = d.paq.membresias.filter((m) => !suc || m.sucursalId === suc);
  const m = ver ? d.paq.membresias.find((x) => x.id === ver) : null;
  return (
    <>
      <Card><div className="fila-flex" style={{ justifyContent: "space-between" }}><span className="peq">El descuento de la membresía lo aplica la caja por <b>convenio</b> del paciente.</span><Button variante="ghost" className="btn-peq" icon="link" onClick={verConvenios}>Convenios</Button></div></Card>
      <Vista id="v-membresias" items={lista}
        tarjeta={(x) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{x.folio}</b><BadgeEstado mapa={EST_MEMB} k={A.estadoMembresia(x)} /></div><div>{x.nombre}</div><div className="peq mu">{R.nombrePaciente(d, x.pacienteId)}</div><div className="peq">{x.descuentoPct} % · vence {fechaLarga(x.vence)}</div></div>}
        columnas={[{ k: "f", t: "Folio", v: (x) => x.folio }, { k: "p", t: "Paciente", v: (x) => R.nombrePaciente(d, x.pacienteId) }, { k: "n", t: "Membresía", v: (x) => x.nombre }, { k: "d", t: "Desc.", v: (x) => `${x.descuentoPct} %`, der: true },
          { k: "v", t: "Vence", v: (x) => fechaLarga(x.vence), orden: (x) => x.vence }, { k: "e", t: "Estado", v: (x) => <BadgeEstado mapa={EST_MEMB} k={A.estadoMembresia(x)} />, orden: (x) => A.estadoMembresia(x) }]}
        onAbrir={(x) => { setVer(x.id); setPagos({ tarjeta: String(x.precio) }); }} />
      {m && <Sheet abierto onClose={() => setVer(null)} titulo={`${m.folio} · ${m.nombre}`} pie={!["renovada", "cancelada"].includes(m.estado) && <Button block icon="repeat" onClick={() => { const r = run((dd) => A.renovarMembresia(dd, { membresiaId: m.id, pagos: listaPagos(pagos) }), "Membresía renovada."); if (r.ok) setVer(null); }}>Renovar 12 meses</Button>}>
        <Resumen filas={[["Paciente", R.nombrePaciente(d, m.pacienteId)], ["Vigencia", `${fechaLarga(m.inicio)} a ${fechaLarga(m.vence)}`], ["Descuento", `${m.descuentoPct} % (convenio ${m.convenioId})`], ["Precio", dinero(m.precio)]]} />
        <ul className="v-lista-b">{(m.beneficios || []).map((b) => <li key={b}>{b}</li>)}</ul>
        {!["renovada", "cancelada"].includes(m.estado) && <><Titulo>Pago de la renovación</Titulo><Pagos pagos={pagos} setPagos={setPagos} /></>}
      </Sheet>}
    </>
  );
}

function Gift({ d, suc }) {
  const [codigo, setCodigo] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const g = codigo.length >= 6 ? A.buscarGift(d, codigo) : null;
  const lista = d.paq.giftCards.filter((x) => !suc || x.sucursalId === suc);
  const movs = g ? d.paq.giftMovs.filter((m) => m.giftId === g.id) : [];
  return (
    <>
      <Card>
        <b>Canjear gift card</b>
        <div className="dos"><Field label="Código"><Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="GC-XXXX-XXXX" autoComplete="off" /></Field>
          <Field label="Monto a canjear"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></Field></div>
        {g && <Resumen filas={[["Estado", EST_GIFT[A.estadoGift(g)][0]], ["Saldo", dinero(g.saldo), true], ["Vence", fechaLarga(g.vence)], ["Beneficiario", g.beneficiario || "—"]]} />}
        {codigo.length >= 6 && !g && <p className="peq" style={{ color: "var(--er)" }}>No existe una gift card con ese código.</p>}
        <Field label="Concepto"><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Servicio o producto que paga" /></Field>
        <Button disabled={!g} onClick={() => { const r = run((dd) => A.canjearGift(dd, { codigo, monto, concepto }), "Canje aplicado."); if (r.ok) { setMonto(""); aviso(`Saldo restante ${dinero(r.saldo)}`, "ok"); } }}>Canjear</Button>
        <p className="peq mu">No se combina con promociones (P-073). Cobra la diferencia en caja.</p>
      </Card>
      {g && <><Titulo>Movimientos de {g.codigo}</Titulo><div className="lista">{movs.map((m) => <Fila key={m.id} titulo={m.tipo === "emision" ? "Emisión" : "Canje"} sub={`${fechaCorta(m.fecha)} · ${R.nombreSucursal(d, m.sucursalId)} · ${m.ref}`} derecha={<b>{dinero(m.monto)}</b>} />)}</div></>}
      <Titulo>Gift cards emitidas</Titulo>
      <Vista id="v-gift" items={lista} inicial="renglones"
        tarjeta={(x) => <div className="v-tar"><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{x.codigo}</b><BadgeEstado mapa={EST_GIFT} k={A.estadoGift(x)} /></div><div className="peq">{x.beneficiario || R.nombrePaciente(d, x.compradorId)}</div><b>{dinero(x.saldo)} de {dinero(x.montoInicial)}</b></div>}
        columnas={[{ k: "c", t: "Código", v: (x) => x.codigo }, { k: "b", t: "Beneficiario", v: (x) => x.beneficiario || "—" }, { k: "e", t: "Emitida", v: (x) => fechaCorta(x.emitida), orden: (x) => x.emitida }, { k: "v", t: "Vence", v: (x) => fechaLarga(x.vence), orden: (x) => x.vence },
          { k: "s", t: "Saldo", v: (x) => dinero(x.saldo), der: true, orden: (x) => x.saldo }, { k: "es", t: "Estado", v: (x) => <BadgeEstado mapa={EST_GIFT} k={A.estadoGift(x)} />, orden: (x) => A.estadoGift(x) }]}
        onAbrir={(x) => setCodigo(x.codigo)} />
    </>
  );
}

function Avisos({ d, avisos }) {
  return (
    <>
      <p className="peq mu">Lo que vence en los próximos 30 días. Llama o escribe al paciente para que use sus sesiones o renueve.</p>
      <div className="lista">{avisos.map((x) => <Fila key={x.id} izquierda={<span className="v-ico"><Badge tono={x.dias <= 7 ? "bad" : "warn"}>{x.dias} d</Badge></span>} titulo={x.nombre} sub={`${A.TIPOS_OFERTA[x.tipo] || x.tipo} · ${x.pacienteId ? R.nombrePaciente(d, x.pacienteId) : "—"}`} datos={`Vence ${fechaLarga(x.vence)} · ${x.detalle}`} />)}
        {!avisos.length && <Vacio icon="calendar">Nada por vencer en los próximos 30 días.</Vacio>}</div>
    </>
  );
}

function Catalogo({ d, verConvenios }) {
  const [edit, setEdit] = useState(null);
  const vacio = { tipo: "paquete", nombre: "", descripcion: "", precio: "", sesionesTotal: "", servicioBaseId: "", intervaloDias: "30", descuentoPct: "", transferible: true };
  const campo = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <>
      <div className="fila-flex"><Button icon="plus" onClick={() => setEdit(vacio)}>Nueva oferta</Button><Button variante="ghost" icon="link" onClick={verConvenios}>Convenios</Button></div>
      <Vista id="v-ofertas" items={d.paq.ofertas} inicial="renglones"
        tarjeta={(o) => <div className="v-tar"><Badge tono="info">{A.TIPOS_OFERTA[o.tipo]}</Badge><b>{o.nombre}</b><div>{dinero(o.precio)}</div>{o.estado !== "activa" && <Badge tono="neutral">Inactiva</Badge>}</div>}
        columnas={[{ k: "c", t: "Código", v: (o) => o.codigo }, { k: "t", t: "Tipo", v: (o) => A.TIPOS_OFERTA[o.tipo] }, { k: "n", t: "Nombre", v: (o) => o.nombre }, { k: "s", t: "Sesiones", v: (o) => o.sesionesTotal || "—" },
          { k: "p", t: "Precio", v: (o) => dinero(o.precio), der: true, orden: (o) => o.precio }, { k: "e", t: "Estado", v: (o) => <Badge tono={o.estado === "activa" ? "ok" : "neutral"}>{o.estado === "activa" ? "Activa" : "Inactiva"}</Badge> }]}
        onAbrir={(o) => setEdit({ ...vacio, ...o, precio: String(o.precio), sesionesTotal: String(o.sesionesTotal || ""), descuentoPct: String(o.descuentoPct || ""), intervaloDias: String(o.intervaloDias || "") })} />
      {edit && <Sheet abierto onClose={() => setEdit(null)} titulo={edit.id ? `Editar ${edit.codigo}` : "Nueva oferta"} pie={<Button block onClick={() => { const r = run((dd) => A.guardarOferta(dd, edit), "Oferta guardada."); if (r.ok) setEdit(null); }}>Guardar</Button>}>
        <div className="form2">
          <Field label="Tipo"><Select value={edit.tipo} onChange={campo("tipo")} disabled={!!edit.id}>{Object.entries(A.TIPOS_OFERTA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Nombre"><Input value={edit.nombre} onChange={campo("nombre")} /></Field>
          <Field label="Precio"><Input inputMode="decimal" value={edit.precio} onChange={campo("precio")} /></Field>
          {["paquete", "plan_laser"].includes(edit.tipo) && <><Field label="Sesiones"><Input inputMode="numeric" value={edit.sesionesTotal} onChange={campo("sesionesTotal")} /></Field>
            <Field label="Servicio que cubre"><Select value={edit.servicioBaseId || ""} onChange={campo("servicioBaseId")}><option value="">Elige…</option>{d.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
            <Field label="Intervalo recomendado (días)"><Input inputMode="numeric" value={edit.intervaloDias} onChange={campo("intervaloDias")} /></Field></>}
          {edit.tipo === "membresia" && <Field label="Descuento %" hint="Se crea / actualiza el convenio ligado"><Input inputMode="decimal" value={edit.descuentoPct} onChange={campo("descuentoPct")} /></Field>}
          <Field label="Estado"><Select value={edit.estado || "activa"} onChange={campo("estado")}><option value="activa">Activa</option><option value="inactiva">Inactiva</option></Select></Field>
        </div>
        <Field label="Descripción"><Area value={edit.descripcion || ""} onChange={campo("descripcion")} /></Field>
        <label className="v-check"><input type="checkbox" checked={edit.transferible !== false} onChange={(e) => setEdit({ ...edit, transferible: e.target.checked })} /> Transferible entre pacientes</label>
      </Sheet>}
    </>
  );
}
