// Más · Comisiones por servicio y por podólogo. Portado de Pie Firme (pages/plataforma/equipo/Comisiones.jsx, comisiones/*;
// P-106 a P-109). Complementa a «Bonos y metas» (escalones sobre venta y metas de sucursal) y a «Mi productividad» (estimado
// del podólogo): aquí el % sale del esquema del podólogo y del SERVICIO de cada renglón del ticket, sobre la base sin IVA,
// y se congela al cerrar el periodo. Los paquetes se comisionan por sesión atendida.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_ventas.js";
import * as R from "../../store/reglas.js";
import { Badge, Button, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { Pestanas } from "../../componentes/ventas/comun.jsx";
import { dinero, fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import "../../estilos_ventas.css";

const run = (fn, okTxt) => { const r = mutar(fn); if (r && r.ok) { if (okTxt) aviso(okTxt, "ok"); } else aviso((r && r.error) || "No se pudo completar.", "bad"); return r; };
const EST_PER = { por_cerrar: ["Abierto", "warn"], cerrado: ["Cerrado", "ok"] };

export default function Comisiones() {
  const { d, u } = useSesion();
  const nav = useNavigate();
  const p = A.permisosVentas(u);
  const [tab, setTab] = useState("periodos");
  const [perId, setPerId] = useState(() => (d.comi.periodos[0] || {}).id);
  if (!p.comisionesVer) return <Vacio icon="lock">Comisiones: Administración central y Dirección (gerencia consulta su sucursal).</Vacio>;
  const per = d.comi.periodos.find((x) => x.id === perId) || d.comi.periodos[0];
  return (
    <div className="v-col">
      <Titulo>Comisiones por servicio</Titulo>
      <Card><div className="fila-flex" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <span className="peq">Comisión = base sin IVA × % del servicio (o el general del esquema). Es complementaria a los bonos por meta.</span>
        <Button variante="ghost" className="btn-peq" icon="award" onClick={() => nav("/mas/bonos")}>Bonos y metas</Button></div></Card>
      <Card tono="warn"><span className="peq">Supuesto de demostración (P-106): los porcentajes los fija el cliente. «Cobrado» se toma como «validado» porque aún no hay conciliación bancaria en este dominio.</span></Card>
      <Pestanas valor={tab} onChange={setTab} opciones={[{ v: "periodos", l: "Periodos" }, ...(p.comisiones ? [{ v: "esquemas", l: "Esquemas", n: d.comi.esquemas.filter((e) => !e.vigenteHasta).length }, { v: "simular", l: "Simular" }] : [])]} />
      {tab === "periodos" && <Periodos d={d} u={u} per={per} setPerId={setPerId} />}
      {tab === "esquemas" && <Esquemas d={d} />}
      {tab === "simular" && <Simular d={d} />}
    </div>
  );
}

function Periodos({ d, u, per, setPerId }) {
  const p = A.permisosVentas(u);
  const [nuevo, setNuevo] = useState(null);
  const [verPod, setVerPod] = useState(null);
  const res = per ? A.comisionesVisibles(d, u, per.id) : null;
  const det = per ? d.comi.detalle.filter((x) => x.periodoId === per.id && (A.esCentral(u) || u.sucursales.includes(x.sucursalId))) : [];
  const pendientes = per && per.estado !== "cerrado" ? A.lineasComisionables(d, { desde: per.desde, hasta: per.hasta > hoy() ? hoy() : per.hasta }).length + A.ajustesPorCancelacion(d).length : 0;
  const q = A.quincenaDe(sumarDias(hoy(), 16));
  return (
    <>
      <Chips scroll opciones={d.comi.periodos.map((x) => ({ v: x.id, l: `${fechaCorta(x.desde)} – ${fechaCorta(x.hasta)}` }))} valor={per && per.id} onChange={setPerId} />
      {p.comisiones && <Button variante="sec" icon="plus" onClick={() => setNuevo({ desde: q.desde, hasta: q.hasta })}>Nuevo periodo</Button>}
      {!per ? <Vacio icon="dollar">Aún no hay periodos.</Vacio> : <>
        <div className="kpis v-kpis">
          <Kpi label="Base comisionable" valor={dinero(res.base)} nota="sin IVA, neta de devoluciones" />
          <Kpi label="Comisión" valor={dinero(res.comision)} />
          <Kpi label="Total a pagar" valor={dinero(res.total)} nota="incluye viáticos y pisos" tono="ok" />
          <Kpi label="Estado" valor={EST_PER[per.estado][0]} nota={per.estado === "cerrado" ? `cerrado ${fechaCorta(per.cerradoEn)}` : `${pendientes} renglón(es) por cargar`} tono={per.estado === "cerrado" ? "ok" : "warn"} />
        </div>
        {res.parcial && <p className="peq mu">Ves solo a los podólogos que atendieron en tu sucursal; el total de cada uno incluye todo su periodo.</p>}
        {per.resumen && <p className="peq mu">Periodo histórico: los tickets de esas quincenas no viven en la demostración; quedan los totales congelados.</p>}
        {p.comisiones && per.estado !== "cerrado" && <div className="v-acciones">
          <Button icon="download" disabled={!pendientes} onClick={() => run((dd) => { const r = A.cargarDetalleComision(dd, per.id); if (r.ok) aviso(`${r.renglones} renglones y ${r.ajustes} ajustes cargados.`, "ok"); return r; })}>Cargar detalle ({pendientes})</Button>
          <Button variante="ok" icon="lock" onClick={() => run((dd) => A.cerrarPeriodoComision(dd, per.id), "Periodo cerrado: las comisiones quedaron congeladas.")}>Cerrar periodo</Button>
        </div>}
        <Vista id="v-comi-res" items={res.filas.map((f) => ({ ...f, id: f.podologoId }))} inicial="renglones"
          tarjeta={(f) => <div className="v-tar"><b>{R.nombreUsuario(d, f.podologoId)}</b><div className="peq mu">{f.citas} citas · {f.renglones} renglones</div><div className="peq">Base {dinero(f.base)} · comisión {dinero(f.comision)}{f.viatico ? ` · viático ${dinero(f.viatico)}` : ""}</div><b>{dinero(f.total)}</b>{f.pisoAplicado && <Badge tono="info">Piso aplicado</Badge>}</div>}
          columnas={[{ k: "p", t: "Podólogo", v: (f) => R.nombreUsuario(d, f.podologoId) }, { k: "c", t: "Citas", v: (f) => f.citas, der: true },
            { k: "b", t: "Base", v: (f) => dinero(f.base), der: true, orden: (f) => f.base }, { k: "s", t: "Servicios", v: (f) => dinero(f.porTipo.servicio || 0), der: true, orden: (f) => f.porTipo.servicio || 0 },
            { k: "pr", t: "Productos", v: (f) => dinero(f.porTipo.producto || 0), der: true, orden: (f) => f.porTipo.producto || 0 }, { k: "pl", t: "Paquetes", v: (f) => dinero(f.porTipo.plan || 0), der: true, orden: (f) => f.porTipo.plan || 0 },
            { k: "a", t: "Ajustes", v: (f) => dinero(f.porTipo.ajuste || 0), der: true, orden: (f) => f.porTipo.ajuste || 0 }, { k: "v", t: "Viático", v: (f) => dinero(f.viatico), der: true, orden: (f) => f.viatico },
            { k: "t", t: "Total", v: (f) => <b>{dinero(f.total)}{f.pisoAplicado ? " (piso)" : ""}</b>, der: true, orden: (f) => f.total }]}
          onAbrir={(f) => setVerPod(f.podologoId)} vacio="Sin comisiones cargadas en este periodo." />
      </>}
      {verPod && <Sheet abierto onClose={() => setVerPod(null)} titulo={`Detalle · ${R.nombreUsuario(d, verPod)}`}>
        <div className="lista">{det.filter((x) => x.podologoId === verPod).map((x) => <Fila key={x.id} titulo={`${x.folio} · ${x.descripcion}`} sub={`${fechaCorta(x.fecha)} · ${R.nombreSucursal(d, x.sucursalId)} · ${x.tipo}`} datos={`Base ${dinero(x.base)} × ${x.pct} %`} badge={x.tipo === "ajuste" ? <Badge tono="bad">Ajuste</Badge> : x.sinEsquema ? <Badge tono="warn">Sin esquema</Badge> : null} derecha={<b>{dinero(x.comision)}</b>} />)}
          {!det.some((x) => x.podologoId === verPod) && <Vacio>El detalle de este periodo es un resumen congelado.</Vacio>}</div>
      </Sheet>}
      {nuevo && <Sheet abierto onClose={() => setNuevo(null)} titulo="Nuevo periodo" pie={<Button block onClick={() => { const r = run((dd) => A.crearPeriodoComision(dd, nuevo), "Periodo creado."); if (r.ok) { setPerId(r.periodo.id); setNuevo(null); } }}>Crear</Button>}>
        <div className="dos"><Field label="Desde"><Input type="date" value={nuevo.desde} onChange={(e) => setNuevo({ ...nuevo, desde: e.target.value })} /></Field>
          <Field label="Hasta"><Input type="date" value={nuevo.hasta} onChange={(e) => setNuevo({ ...nuevo, hasta: e.target.value })} /></Field></div>
        <p className="peq mu">Quincenal por omisión. Los periodos no se traslapan.</p></Sheet>}
    </>
  );
}

function Esquemas({ d }) {
  const [edit, setEdit] = useState(null);
  const pods = d.usuarios.filter((x) => x.rol === "podologo");
  const lista = [...d.comi.esquemas].sort((a, b) => (a.vigenteHasta ? 1 : 0) - (b.vigenteHasta ? 1 : 0) || String(a.podologoId).localeCompare(String(b.podologoId)));
  const abrir = (e) => setEdit(e ? { ...e, porServicio: Object.fromEntries(Object.entries(e.porServicio || {}).map(([k, v]) => [k, String(v)])), pctServicio: String(e.pctServicio), pctProducto: String(e.pctProducto), pctPlan: String(e.pctPlan), viaticoPorCita: String(e.viaticoPorCita || ""), pisoPeriodo: String(e.pisoPeriodo || "") }
    : { podologoId: "", nombre: "", pctServicio: "30", pctProducto: "5", pctPlan: "25", porServicio: {}, viaticoPorCita: "", pisoPeriodo: "", vigenteDesde: hoy(), vigenteHasta: "" });
  return (
    <>
      <Button icon="plus" onClick={() => abrir(null)}>Nuevo esquema</Button>
      <Vista id="v-comi-esq" items={lista} inicial="renglones"
        tarjeta={(e) => <div className="v-tar"><b>{e.nombre}</b><div className="peq mu">{e.podologoId ? R.nombreUsuario(d, e.podologoId) : "General"}</div><div className="peq">Servicio {e.pctServicio} % · producto {e.pctProducto} % · paquete {e.pctPlan} %</div>{e.vigenteHasta ? <Badge tono="neutral">Hasta {fechaCorta(e.vigenteHasta)}</Badge> : <Badge tono="ok">Vigente</Badge>}</div>}
        columnas={[{ k: "n", t: "Esquema", v: (e) => e.nombre }, { k: "p", t: "Podólogo", v: (e) => (e.podologoId ? R.nombreUsuario(d, e.podologoId) : "General") },
          { k: "s", t: "Servicio", v: (e) => `${e.pctServicio} %`, der: true }, { k: "ps", t: "Por servicio", v: (e) => Object.keys(e.porServicio || {}).length || "—", der: true },
          { k: "pr", t: "Producto", v: (e) => `${e.pctProducto} %`, der: true }, { k: "pl", t: "Paquete", v: (e) => `${e.pctPlan} %`, der: true },
          { k: "v", t: "Vigencia", v: (e) => `${fechaCorta(e.vigenteDesde)} – ${e.vigenteHasta ? fechaCorta(e.vigenteHasta) : "hoy"}`, orden: (e) => e.vigenteDesde }]}
        onAbrir={abrir} />
      {edit && <Sheet abierto onClose={() => setEdit(null)} titulo={edit.id ? edit.nombre : "Nuevo esquema"} pie={<Button block onClick={() => { const r = run((dd) => A.guardarEsquemaComision(dd, edit), "Esquema guardado."); if (r.ok) setEdit(null); }}>Guardar</Button>}>
        <div className="form2">
          <Field label="Nombre"><Input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
          <Field label="Podólogo"><Select value={edit.podologoId || ""} onChange={(e) => setEdit({ ...edit, podologoId: e.target.value })} disabled={!!edit.id}><option value="">General (todos sin esquema propio)</option>{pods.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
          <Field label="% servicios"><Input inputMode="decimal" value={edit.pctServicio} onChange={(e) => setEdit({ ...edit, pctServicio: e.target.value })} /></Field>
          <Field label="% productos"><Input inputMode="decimal" value={edit.pctProducto} onChange={(e) => setEdit({ ...edit, pctProducto: e.target.value })} /></Field>
          <Field label="% paquetes (por sesión)"><Input inputMode="decimal" value={edit.pctPlan} onChange={(e) => setEdit({ ...edit, pctPlan: e.target.value })} /></Field>
          <Field label="Viático por cita"><Input inputMode="decimal" value={edit.viaticoPorCita} onChange={(e) => setEdit({ ...edit, viaticoPorCita: e.target.value })} /></Field>
          <Field label="Piso por periodo"><Input inputMode="decimal" value={edit.pisoPeriodo} onChange={(e) => setEdit({ ...edit, pisoPeriodo: e.target.value })} /></Field>
          <Field label="Vigente desde" hint={edit.id ? "" : "Cierra la vigencia del esquema anterior"}><Input type="date" value={edit.vigenteDesde} onChange={(e) => setEdit({ ...edit, vigenteDesde: e.target.value })} /></Field>
        </div>
        <Titulo>% por servicio (vacío = el general)</Titulo>
        <div className="form2">{d.servicios.map((s) => <Field key={s.id} label={s.nombre}><Input inputMode="decimal" value={edit.porServicio[s.id] ?? ""} placeholder={`${edit.pctServicio} %`} onChange={(e) => setEdit({ ...edit, porServicio: { ...edit.porServicio, [s.id]: e.target.value } })} /></Field>)}</div>
      </Sheet>}
    </>
  );
}

function Simular({ d }) {
  const pods = d.usuarios.filter((x) => x.rol === "podologo");
  const [f, setF] = useState({ podologoId: pods[0] ? pods[0].id : "", tipo: "servicio", itemId: d.servicios[0].id, importe: String(d.servicios[0].precioBase) });
  const s = f.podologoId ? A.simularComision(d, { ...f, importe: Number(f.importe) || 0 }) : null;
  const items = f.tipo === "servicio" ? d.servicios : d.productos.filter((x) => x.tipo === "venta");
  return (
    <Card>
      <div className="form2">
        <Field label="Podólogo"><Select value={f.podologoId} onChange={(e) => setF({ ...f, podologoId: e.target.value })}>{pods.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
        <Field label="Tipo"><Select value={f.tipo} onChange={(e) => { const t = e.target.value; const it = t === "servicio" ? d.servicios[0] : d.productos.find((x) => x.tipo === "venta"); setF({ ...f, tipo: t, itemId: it.id, importe: String(it.precioBase) }); }}><option value="servicio">Servicio</option><option value="producto">Producto</option></Select></Field>
        <Field label="Concepto"><Select value={f.itemId} onChange={(e) => { const it = items.find((x) => x.id === e.target.value); setF({ ...f, itemId: e.target.value, importe: String(it ? it.precioBase : f.importe) }); }}>{items.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
        <Field label="Importe cobrado (con IVA)"><Input inputMode="decimal" value={f.importe} onChange={(e) => setF({ ...f, importe: e.target.value })} /></Field>
      </div>
      {s && <Resumen filas={[["Esquema", s.esquema ? s.esquema.nombre : "Sin esquema"], ["Base sin IVA", dinero(s.base)], ["Porcentaje", `${s.pct} %`], ["Comisión", dinero(s.comision), true]]} />}
    </Card>
  );
}
