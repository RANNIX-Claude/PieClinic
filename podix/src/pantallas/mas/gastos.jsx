import { useMemo, useRef, useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, BarraAccion, Buscador, Button, Card, Chips, Confirmar, Field, Fila, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { dinero, fechaCorta, hoy } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import { ordenarCxp, estadoCxp } from "../../store/acciones_admin.js";
import * as F from "../../store/acciones_finanzas.js";
import { monto } from "../../componentes/finanzas/util.js";
import "../../estilos_finanzas.css";

const CXP_ESTADO = { vencida: ["Vencida", "bad"], por_vencer: ["Vence pronto", "warn"], vigente: ["Vigente", "info"], pagada: ["Pagada", "ok"] };
const FUENTE_TONO = { manual: "neutral", nota_ia: "info", recurrente: "ok" };

function Barras({ items, total, alt }) {
  const max = Math.max(1, ...items.map((x) => x.valor));
  return (
    <div className="fin-barras">
      {items.map((x) => (
        <div key={x.id} className="fin-barra-i">
          <div><span>{x.etiqueta}</span><b>{monto(x.valor)}{total ? <span className="mu peq"> · {Math.round((x.valor / total) * 100)} %</span> : null}</b></div>
          <div className="fin-barra-pista"><i className={alt ? "alt" : ""} style={{ width: `${(x.valor / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function FormGasto({ d, u, visibles, abierto, onClose, inicial }) {
  const vacio = { sucursalId: inicial, fecha: hoy(), categoria: "", concepto: "", monto: "", proveedorId: "", acreedor: "", comprobante: null };
  const [f, setF] = useState(vacio);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cerrar = () => { setF({ ...vacio, sucursalId: inicial }); onClose(); };
  const foto = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    setSubiendo(true);
    try { setF((x) => ({ ...x, comprobante: null })); const img = await reducirImagen(file, 640, 0.7); setF((x) => ({ ...x, comprobante: img })); }
    catch (er) { aviso(er.message, "bad"); }
    setSubiendo(false); e.target.value = "";
  };
  const guardar = () => {
    setCargando(true);
    const r = mutar((x) => F.registrarGasto(x, { ...f, sucursalId: f.sucursalId || inicial, proveedorId: f.proveedorId || null }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Gasto registrado.");
    cerrar();
  };
  return (
    <Sheet abierto={abierto} onClose={cerrar} titulo="Registrar gasto"
      pie={<div className="dos"><Button variante="sec" block onClick={cerrar}>Cancelar</Button><Button block loading={cargando} onClick={guardar}>Guardar gasto</Button></div>}>
      <div className="form">
        <Field label="Sucursal (unidad de costo)">
          <Select value={f.sucursalId} onChange={set("sucursalId")}>{visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select>
        </Field>
        <div className="dos">
          <Field label="Fecha"><Input type="date" value={f.fecha} max={hoy()} onChange={set("fecha")} /></Field>
          <Field label="Monto"><Input inputMode="decimal" value={f.monto} onChange={set("monto")} placeholder="0.00" /></Field>
        </div>
        <Field label="Categoría"><Select value={f.categoria} onChange={set("categoria")}><option value="">Elige…</option>{F.categoriasDe(d).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
        <Field label="Concepto"><Input value={f.concepto} onChange={set("concepto")} placeholder="Ej. Recibo de luz octubre" autoComplete="off" /></Field>
        <Field label="Proveedor (opcional)"><Select value={f.proveedorId} onChange={set("proveedorId")}><option value="">Sin proveedor del catálogo</option>{d.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
        <Field label="Quién cobra (opcional)"><Input value={f.acreedor} onChange={set("acreedor")} placeholder="Ej. CFE, arrendador" autoComplete="off" /></Field>
        <Field label="Comprobante (foto opcional)" hint="Se guarda reducida; no se suben archivos grandes.">
          <input ref={archivo} type="file" accept="image/*" capture="environment" onChange={foto} hidden />
          <div className="fin-acciones">
            <Button variante="sec" icon="camera" onClick={() => archivo.current.click()} loading={subiendo}>{f.comprobante ? "Cambiar foto" : "Tomar o elegir foto"}</Button>
            {f.comprobante && <img className="fin-miniatura" src={f.comprobante} alt="Comprobante" />}
            {f.comprobante && <Button variante="sec" icon="trash" onClick={() => setF((x) => ({ ...x, comprobante: null }))}>Quitar</Button>}
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

function DetalleGasto({ d, g, fuera, onClose, puedeEliminar }) {
  const [motivo, setMotivo] = useState("");
  const [conf, setConf] = useState(false);
  if (!g) return null;
  const baja = () => {
    const r = mutar((x) => F.eliminarGasto(x, g.id, motivo));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Gasto eliminado."); setConf(false); onClose();
  };
  const cat = F.categoriasDe(d).find((c) => c.id === g.categoria);
  return (
    <Sheet abierto onClose={onClose} titulo="Gasto" pie={puedeEliminar ? <Button variante="danger" block icon="trash" onClick={() => setConf(true)}>Eliminar gasto</Button> : null}>
      <div className="form">
        <div className="gasto-t"><b>{dinero(g.monto)}</b><Badge tono={FUENTE_TONO[g.fuente] || "neutral"}>{F.FUENTES_GASTO[g.fuente] || g.fuente}</Badge></div>
        {fuera && <Badge tono="warn">Fuera de patrón para esta sucursal y categoría</Badge>}
        <div className="resumen">
          <div><span>Concepto</span><b>{g.concepto}</b></div>
          <div><span>Sucursal</span><b>{R.nombreSucursal(d, g.sucursalId)}</b></div>
          <div><span>Categoría</span><b>{cat ? cat.nombre : g.categoria}</b></div>
          <div><span>Fecha</span><b>{fechaCorta(g.fecha)}</b></div>
          {(g.proveedorId || g.acreedor) && <div><span>Proveedor</span><b>{F.proveedorNombre(d, g.proveedorId) || g.acreedor}</b></div>}
          <div><span>Registró</span><b>{R.nombreUsuario(d, g.registradoPor)}</b></div>
        </div>
        {g.comprobante ? <img className="fin-comp" src={g.comprobante} alt="Comprobante del gasto" /> : <p className="fin-nota">Sin comprobante adjunto.</p>}
        {puedeEliminar && <Field label="Motivo de la baja"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Obligatorio para eliminar" /></Field>}
      </div>
      <Confirmar abierto={conf} peligro titulo="Eliminar gasto" texto={`Se elimina «${g.concepto}» (${dinero(g.monto)}) y baja de las cifras del estado de resultados. Queda en la bitácora.`} confirmar="Eliminar" onSi={baja} onNo={() => setConf(false)} />
    </Sheet>
  );
}

function FormRecurrente({ d, visibles, abierto, edit, onClose, inicial }) {
  const [f, setF] = useState(null);
  const v = f || (edit ? { ...edit, monto: String(edit.monto) } : { sucursalId: inicial, categoria: "", concepto: "", monto: "", diaMes: "5", acreedor: "", activo: true });
  const set = (k) => (e) => setF({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const cerrar = () => { setF(null); onClose(); };
  const guardar = () => {
    const r = mutar((x) => F.guardarRecurrente(x, { id: edit ? edit.id : null, ...v }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Gasto recurrente guardado."); cerrar();
  };
  return (
    <Sheet abierto={abierto} onClose={cerrar} titulo={edit ? "Editar recurrente" : "Nuevo gasto recurrente"}
      pie={<div className="dos"><Button variante="sec" block onClick={cerrar}>Cancelar</Button><Button block onClick={guardar}>Guardar</Button></div>}>
      <div className="form">
        <Field label="Sucursal"><Select value={v.sucursalId} onChange={set("sucursalId")} disabled={!!edit}>{visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
        <Field label="Categoría"><Select value={v.categoria} onChange={set("categoria")}><option value="">Elige…</option>{F.categoriasDe(d).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
        <Field label="Concepto"><Input value={v.concepto} onChange={set("concepto")} placeholder="Ej. Renta del local" /></Field>
        <div className="dos">
          <Field label="Monto mensual"><Input inputMode="decimal" value={v.monto} onChange={set("monto")} /></Field>
          <Field label="Día del mes (1–28)"><Input inputMode="numeric" value={v.diaMes} onChange={set("diaMes")} /></Field>
        </div>
        <Field label="Quién cobra"><Input value={v.acreedor || ""} onChange={set("acreedor")} /></Field>
        <label className="fin-check"><input type="checkbox" checked={!!v.activo} onChange={set("activo")} />Activo (se incluye en «Generar los del mes»)</label>
      </div>
    </Sheet>
  );
}

export default function Gastos() {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr();
  const visibles = F.sucursalesVisibles(d, u);
  const central = F.esCentral(u);
  const [tab, setTab] = useState("gastos");
  const [suc, setSuc] = useState(central ? "" : (visibles.find((s) => s.id === sucursalId) || visibles[0] || {}).id || "");
  const [cat, setCat] = useState("");
  const [mes, setMes] = useState(F.mesActual());
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [sel, setSel] = useState(null);
  const [rec, setRec] = useState(null); // null | "nuevo" | recurrente
  const meses = F.mesesDisponibles();
  const filtroSuc = central ? suc : (suc || (visibles[0] && visibles[0].id));

  const lista = useMemo(() => {
    const ids = new Set(visibles.map((s) => s.id));
    return F.filtrarGastos(d, { sucursalId: filtroSuc, categoria: cat, mes, texto: q }).filter((g) => ids.has(g.sucursalId));
  }, [d, filtroSuc, cat, mes, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const fuera = useMemo(() => F.gastosFueraDePatron(d), [d]);
  const tot = useMemo(() => F.totalesGastos(lista), [lista]);
  const cxp = useMemo(() => (central ? F.resumenCxp(d) : null), [d, central]);

  if (!visibles.length) return <Vacio icon="lock">Los gastos los ven el gerente de su sucursal, Administración central y Dirección.</Vacio>;
  const nombreCat = (id) => (F.categoriasDe(d).find((c) => c.id === id) || { nombre: id }).nombre;
  const nFuera = lista.filter((g) => fuera.has(g.id)).length;
  const sucDefecto = (visibles.find((s) => s.id === (filtroSuc || sucursalId)) || visibles[0]).id;
  const pendRec = F.recurrentesPendientes(d, F.mesActual(), central ? (suc || null) : filtroSuc).filter((r) => F.puedeGastosDe(u, r.sucursalId));
  const recs = ((d.fin && d.fin.recurrentes) || []).filter((r) => visibles.some((s) => s.id === r.sucursalId) && (!filtroSuc || r.sucursalId === filtroSuc));

  const generar = () => {
    const r = mutar((x) => F.generarRecurrentes(x, { mes: F.mesActual(), sucursalId: central ? (suc || null) : filtroSuc }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.creados.length ? `${r.creados.length} gastos recurrentes generados.` : "Ya estaban generados todos los del mes.", r.creados.length ? "ok" : "warn");
  };

  const tarjeta = (g) => (
    <div className={fuera.has(g.id) ? "gasto-fuera" : ""} style={fuera.has(g.id) ? { paddingLeft: 8, margin: -2 } : undefined}>
      <div className="gasto-t"><b>{dinero(g.monto)}</b><span className="mu peq">{fechaCorta(g.fecha)}</span></div>
      <div className="fuerte" style={{ marginTop: 2 }}>{g.concepto}</div>
      <div className="gasto-s">{R.nombreSucursal(d, g.sucursalId)} · {nombreCat(g.categoria)}</div>
      <div className="gasto-b">
        <Badge tono={FUENTE_TONO[g.fuente] || "neutral"}>{F.FUENTES_GASTO[g.fuente] || g.fuente}</Badge>
        {fuera.has(g.id) && <Badge tono="warn">Fuera de patrón</Badge>}
        {g.comprobante && <Badge tono="info">Con comprobante</Badge>}
      </div>
    </div>
  );
  const columnas = [
    { k: "f", t: "Fecha", v: (g) => fechaCorta(g.fecha), orden: (g) => g.fecha },
    { k: "s", t: "Sucursal", v: (g) => R.nombreSucursal(d, g.sucursalId) },
    { k: "c", t: "Categoría", v: (g) => nombreCat(g.categoria) },
    { k: "n", t: "Concepto", v: (g) => <>{g.concepto}{fuera.has(g.id) && <> <Badge tono="warn">Fuera de patrón</Badge></>}</>, orden: (g) => g.concepto },
    { k: "m", t: "Monto", der: true, v: (g) => dinero(g.monto), orden: (g) => g.monto },
    { k: "r", t: "Registró", v: (g) => R.nombreUsuario(d, g.registradoPor) },
  ];

  return (
    <div className="fin-col">
      <div className="kpis">
        <Kpi label="Gastos del filtro" valor={monto(tot.total)} nota={`${lista.length} registros`} />
        <Kpi label="Fuera de patrón" valor={String(nFuera)} nota="por revisar" tono={nFuera ? "warn" : "ok"} />
        <Kpi label="Recurrentes por generar" valor={String(pendRec.length)} nota={F.nombreMes(F.mesActual())} tono={pendRec.length ? "warn" : "ok"} />
        {cxp && <Kpi label="Por pagar a proveedores" valor={monto(cxp.total)} nota={cxp.nVencidas ? `${cxp.nVencidas} vencidas` : "sin vencidas"} tono={cxp.nVencidas ? "bad" : "info"} />}
      </div>

      <Chips scroll opciones={[{ v: "gastos", l: "Gastos" }, { v: "totales", l: "Totales" }, { v: "recurrentes", l: "Recurrentes", n: pendRec.length || undefined }, ...(central ? [{ v: "pagar", l: "Por pagar" }] : [])]} valor={tab} onChange={setTab} />

      {(tab === "gastos" || tab === "totales") && (
        <div className="fin-filtros">
          <Buscador valor={q} onChange={setQ} placeholder="Buscar concepto o proveedor…" />
          {(central || visibles.length > 1) ? (
            <Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Sucursal">{central && <option value="">Todas las sucursales</option>}{visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select>
          ) : <Select value={visibles[0].id} disabled aria-label="Sucursal"><option>{visibles[0].nombre}</option></Select>}
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría"><option value="">Todas las categorías</option>{F.categoriasDe(d).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          <Select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes"><option value="">Todos los meses</option>{meses.map((m) => <option key={m} value={m}>{F.nombreMes(m)}{m === F.mesActual() ? " (en curso)" : ""}</option>)}</Select>
        </div>
      )}

      {tab === "gastos" && (<>
        <Vista id="fin-gastos" items={lista} tarjeta={tarjeta} columnas={columnas} onAbrir={setSel} vacio="No hay gastos con esos filtros." />
        <BarraAccion><Button block icon="plus" onClick={() => setNuevo(true)}>Registrar gasto</Button></BarraAccion>
      </>)}

      {tab === "totales" && (
        <div className="lista" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
          <Card>
            <Titulo>Por categoría</Titulo>
            {Object.keys(tot.porCategoria).length ? <Barras total={tot.total} items={Object.entries(tot.porCategoria).sort((a, b) => b[1] - a[1]).map(([id, valor]) => ({ id, etiqueta: nombreCat(id), valor }))} /> : <Vacio icon="chart">Sin gastos con esos filtros.</Vacio>}
          </Card>
          <Card>
            <Titulo>Por sucursal (unidad de costo)</Titulo>
            {Object.keys(tot.porSucursal).length ? <Barras alt total={tot.total} items={Object.entries(tot.porSucursal).sort((a, b) => b[1] - a[1]).map(([id, valor]) => ({ id, etiqueta: R.nombreSucursal(d, id), valor }))} /> : <Vacio icon="chart">Sin gastos con esos filtros.</Vacio>}
            <p className="fin-nota" style={{ marginTop: 10 }}>Cada sucursal es una unidad de costo: estos gastos y su nómina alimentan su estado de resultados.</p>
          </Card>
        </div>
      )}

      {tab === "recurrentes" && (<>
        <Card tono={pendRec.length ? "warn" : "ok"}>
          <div className="fuerte">{pendRec.length ? `Faltan ${pendRec.length} gastos recurrentes de ${F.nombreMes(F.mesActual())}` : `Los recurrentes de ${F.nombreMes(F.mesActual())} ya están generados`}</div>
          <p className="fin-nota" style={{ margin: "4px 0 10px" }}>Renta, luz, agua, internet y limpieza de cada sucursal. No se duplican si ya existen.</p>
          <div className="fin-acciones">
            <Button icon="refresh" onClick={generar} disabled={!pendRec.length}>Generar los del mes</Button>
            <Button variante="sec" icon="plus" onClick={() => setRec("nuevo")}>Nuevo recurrente</Button>
          </div>
        </Card>
        {central && <div className="fin-filtros"><Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Sucursal"><option value="">Todas las sucursales</option>{visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></div>}
        <div className="lista">
          {recs.map((r) => (
            <Fila key={r.id} titulo={r.concepto} sub={`${R.nombreSucursal(d, r.sucursalId)} · ${nombreCat(r.categoria)} · día ${r.diaMes}`}
              datos={<span>{monto(r.monto)} al mes{r.acreedor ? ` · ${r.acreedor}` : ""}</span>}
              badge={!r.activo ? <Badge>Inactivo</Badge> : pendRec.some((x) => x.id === r.id) ? <Badge tono="warn">Pendiente</Badge> : <Badge tono="ok">Generado</Badge>}
              onClick={F.puedeGastosDe(u, r.sucursalId) ? () => setRec(r) : undefined} />
          ))}
          {!recs.length && <Vacio icon="repeat">No hay gastos recurrentes configurados.</Vacio>}
        </div>
      </>)}

      {tab === "pagar" && cxp && (<>
        <div className="kpis">
          <Kpi label="Saldo por pagar" valor={monto(cxp.total)} tono="info" />
          <Kpi label="Vencido" valor={monto(cxp.vencido)} nota={`${cxp.nVencidas} documentos`} tono={cxp.nVencidas ? "bad" : "ok"} />
          <Kpi label="Vence en 7 días" valor={monto(cxp.porVencer)} nota={`${cxp.nPorVencer} documentos`} tono={cxp.nPorVencer ? "warn" : "ok"} />
        </div>
        <Titulo>Proveedores</Titulo>
        <div className="lista">{cxp.porProveedor.map((p) => <Fila key={p.id} titulo={p.nombre} sub={`Crédito ${p.dias} días`} datos={<span>{p.docs} documentos por pagar</span>} derecha={<b>{monto(p.saldo)}</b>} />)}</div>
        <Titulo>Cuentas más urgentes</Titulo>
        <div className="lista">
          {ordenarCxp(d).filter((c) => estadoCxp(c) !== "pagada").slice(0, 6).map((c) => {
            const e = estadoCxp(c); const [l, t] = CXP_ESTADO[e];
            return <Fila key={c.id} titulo={c.doc} sub={(d.proveedores.find((p) => p.id === c.proveedorId) || {}).nombre} badge={<Badge tono={t}>{l}</Badge>} datos={<span>Vence {fechaCorta(c.vence)}</span>} derecha={<b>{monto(c.saldo)}</b>} />;
          })}
        </div>
        <Button variante="sec" icon="box" onClick={() => ir("compras")}>Pagar en Compras</Button>
      </>)}

      <FormGasto key={`${nuevo}-${sucDefecto}`} d={d} u={u} visibles={visibles} abierto={nuevo} onClose={() => setNuevo(false)} inicial={sucDefecto} />
      {sel && <DetalleGasto d={d} g={sel} fuera={fuera.has(sel.id)} onClose={() => setSel(null)} puedeEliminar={central} />}
      {rec && <FormRecurrente key={rec === "nuevo" ? "n" : rec.id} d={d} visibles={visibles} abierto edit={rec === "nuevo" ? null : rec} onClose={() => setRec(null)} inicial={sucDefecto} />}
    </div>
  );
}
