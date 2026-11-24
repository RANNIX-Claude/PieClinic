// Bonos y metas (administración, dirección y gerente de su sucursal). Cálculo transparente: cada bono muestra sus ventas atribuidas,
// el escalón alcanzado y la fórmula. Aprobar y pagar es de administración/dirección y queda en la bitácora.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_desempeno.js";
import { NOMBRE_ROL } from "../../config/roles.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { dinero, fechaCorta, hora, normaliza } from "../../lib/format.js";
import { Condiciones, EstadoBono, ListaVentas, Progreso, SelectorPeriodo } from "../../componentes/desempeno/comunes.jsx";
import { GraficaPeriodos } from "../../componentes/desempeno/graficas.jsx";

const run = (fn, textoOk) => {
  const r = mutar(fn);
  if (r && r.ok) aviso(textoOk || "Listo."); else aviso((r && r.error) || "No se pudo completar.", "bad");
  return r;
};
const monto = (x) => (x.tipo === "individual" ? x.bono : x.bolsa);
const clavePersona = (x) => `${x.esquemaId}|${x.usuarioId}`;
const claveSuc = (x) => `${x.esquemaId}|${x.sucursalId}`;

export default function Bonos() {
  const { d, u } = useSesion();
  const [tab, setTab] = useState("resumen");
  const [pm, setPm] = useState({ per: "mensual", mes: A.mesActual() });
  const [suc, setSuc] = useState("todas");
  const admin = A.esAdmin(u);
  if (!A.puedeVerBonos(u)) return <Vacio icon="lock">Esta pantalla es para Administración, Dirección y gerentes. Tus propios bonos están en «Mis bonos y metas».</Vacio>;

  const visibles = A.sucursalesVisibles(d, u);
  const sucursalIds = suc === "todas" ? (admin ? null : visibles) : [suc];
  const nombresSuc = visibles.map((s) => ({ v: s, l: R.nombreSucursal(d, s) }));
  const tabs = [{ v: "resumen", l: "Resumen" }, { v: "ind", l: "Individuales" }, { v: "suc", l: "Por sucursal" }, { v: "esq", l: "Esquemas" }, { v: "metas", l: "Metas" }];
  return (
    <>
      <Chips scroll opciones={tabs} valor={tab} onChange={setTab} />
      {tab !== "esq" && tab !== "metas" && (
        <>
          <SelectorPeriodo per={pm.per} mes={pm.mes} onChange={setPm} />
          {visibles.length > 1 && <Chips scroll opciones={[{ v: "todas", l: "Todas" }, ...nombresSuc]} valor={suc} onChange={setSuc} />}
        </>
      )}
      {tab === "resumen" && <Resumen_ d={d} u={u} pm={pm} sucursalIds={sucursalIds} admin={admin} irA={setTab} />}
      {tab === "ind" && <Individuales d={d} pm={pm} sucursalIds={sucursalIds} admin={admin} />}
      {tab === "suc" && <PorSucursal d={d} pm={pm} sucursalIds={sucursalIds} admin={admin} />}
      {tab === "esq" && <Esquemas d={d} admin={admin} />}
      {tab === "metas" && <Metas d={d} u={u} admin={admin} visibles={visibles} />}
    </>
  );
}

// ───────────────────────── Resumen
function Resumen_({ d, pm, sucursalIds, admin, irA }) {
  const r = useMemo(() => A.resumenPeriodo(d, { mes: pm.mes, periodo: pm.per, sucursalIds }), [d, pm, sucursalIds]);
  const per = A.periodoDe(pm.per, pm.mes);
  const terminado = A.periodoTerminado(per);
  const todos = [...r.individuales, ...r.sucursales].filter((x) => monto(x) > 0);
  const porAprobar = todos.filter((x) => x.estado === "calculado").length, porPagar = todos.filter((x) => x.estado === "aprobado").length;
  const proy = r.individuales.reduce((a, x) => a + (x.proyeccion ? x.proyeccion.bono : x.bono), 0) + r.sucursales.reduce((a, x) => a + (x.proyeccion ? x.proyeccion.bolsa : x.bolsa), 0);
  const total = r.totalIndividual + r.totalSucursal;
  const esq = A.esquemasActivos(d).filter((e) => e.periodo === pm.per);
  return (
    <>
      <div className="dsp-kpis">
        <Kpi label="Bonos individuales" valor={dinero(r.totalIndividual)} tono="info" nota={`${r.individuales.filter((x) => monto(x) > 0).length} persona(s) con bono`} />
        <Kpi label="Bonos de sucursal" valor={dinero(r.totalSucursal)} tono="info" nota={`${r.sucursales.filter((x) => x.bolsa > 0).length} sucursal(es) con bolsa`} />
        <Kpi label="Por aprobar" valor={porAprobar} tono={porAprobar ? "warn" : "ok"} nota={terminado ? "periodo cerrado" : "el periodo sigue en curso"} />
        <Kpi label="Por pagar" valor={porPagar} tono={porPagar ? "warn" : "ok"} nota="ya aprobados" />
      </div>
      {!terminado && (
        <Card tono="info"><b>Periodo en curso</b>
          <div className="peq">Con lo vendido a hoy el total sería {dinero(total)}. Al ritmo actual (proyección lineal al cierre) se estima {dinero(proy)}. Los bonos se aprueban cuando el periodo termina.</div></Card>
      )}
      {!esq.length && <Card tono="warn"><span className="peq">No hay esquemas {pm.per === "mensual" ? "mensuales" : "trimestrales"} activos. Créalos en la pestaña Esquemas.</span></Card>}
      {admin && terminado && (porAprobar > 0 || porPagar > 0) && (
        <div className="dos">
          <Button block disabled={!porAprobar} onClick={() => run((x) => A.procesarPeriodo(x, { mes: pm.mes, periodo: pm.per, accion: "aprobar", sucursalIds }), "Bonos aprobados.")}>Aprobar los {porAprobar} pendientes</Button>
          <Button block variante="sec" disabled={!porPagar} onClick={() => run((x) => A.procesarPeriodo(x, { mes: pm.mes, periodo: pm.per, accion: "pagar", sucursalIds }), "Bonos marcados como pagados.")}>Marcar {porPagar} como pagados</Button>
        </div>
      )}
      <Titulo>Sucursales del periodo</Titulo>
      <div className="lista">{r.sucursales.map((s) => (
        <Fila key={claveSuc(s)} titulo={R.nombreSucursal(d, s.sucursalId)} sub={`${s.nombre} · ${s.mesesConMeta.length ? `${s.pct} % de la meta` : "sin meta"}`}
          badge={<EstadoBono estado={s.estado} />} derecha={<div className="der"><b>{dinero(s.bolsa)}</b><div className="peq mu">{s.reparto.filter((x) => !x.excluido).length} persona(s)</div></div>}
          onClick={() => irA("suc")} />
      ))}</div>
      {!r.sucursales.length && <Vacio icon="award">Sin esquemas de sucursal en este periodo.</Vacio>}
    </>
  );
}

// ───────────────────────── Individuales
function Individuales({ d, pm, sucursalIds, admin }) {
  const [q, setQ] = useState("");
  const [est, setEst] = useState("todos");
  const [sel, setSel] = useState(null);
  const r = useMemo(() => A.resumenPeriodo(d, { mes: pm.mes, periodo: pm.per, sucursalIds }), [d, pm, sucursalIds]);
  const items = useMemo(() => r.individuales.map((x) => ({ ...x, id: clavePersona(x), nombrePersona: R.nombreUsuario(d, x.usuarioId) }))
    .filter((x) => (est === "todos" || x.estado === est) && (!q || normaliza(`${x.nombrePersona} ${x.nombre}`).includes(normaliza(q))))
    .sort((a, b) => b.bono - a.bono || b.base - a.base), [r, est, q, d]);
  const actual = sel ? r.individuales.find((x) => clavePersona(x) === sel) : null;
  return (
    <>
      <Buscador valor={q} onChange={setQ} placeholder="Buscar persona o esquema…" />
      <Chips scroll opciones={[{ v: "todos", l: "Todos" }, { v: "calculado", l: "Calculados" }, { v: "aprobado", l: "Aprobados" }, { v: "pagado", l: "Pagados" }]} valor={est} onChange={setEst} />
      <Vista id="bonos-ind" items={items} onAbrir={(x) => setSel(x.id)} minTarjeta={250} vacio="Sin personas elegibles con esos filtros."
        tarjeta={(x) => (
          <div className="dsp-tarj">
            <div className="dsp-tarj-top"><div><b>{x.nombrePersona}</b><small>{x.nombre}</small></div><EstadoBono estado={x.estado} /></div>
            <div className="dsp-cifras"><div>Base<b>{dinero(x.base)}</b></div><div className="der">Bono<b>{dinero(x.bono)}</b></div></div>
            <Progreso pct={x.siguiente ? (x.base / x.siguiente.desde) * 100 : 100} tono={x.condiciones.ok ? "ok" : "bad"} />
            <div className="dsp-nota">{x.siguiente ? `Faltan ${dinero(x.faltante)} para el siguiente escalón` : x.escalon ? "Escalón máximo alcanzado" : "Aún sin escalón"}{!x.condiciones.ok ? " · condición no cumplida" : ""}</div>
          </div>)}
        columnas={[
          { k: "p", t: "Persona", v: (x) => x.nombrePersona, orden: (x) => x.nombrePersona },
          { k: "e", t: "Esquema", v: (x) => x.nombre, orden: (x) => x.nombre },
          { k: "b", t: "Base", v: (x) => dinero(x.base), der: true, orden: (x) => x.base },
          { k: "s", t: "Escalón", v: (x) => (x.escalon ? `${x.numeroEscalon}/${x.totalEscalones}` : "—"), orden: (x) => x.numeroEscalon },
          { k: "o", t: "Bono", v: (x) => dinero(x.bono), der: true, orden: (x) => x.bono },
          { k: "t", t: "Estado", v: (x) => <EstadoBono estado={x.estado} />, orden: (x) => x.estado },
        ]} />
      <DetalleIndividual d={d} x={actual} mes={pm.mes} admin={admin} onClose={() => setSel(null)} />
    </>
  );
}

function DetalleIndividual({ d, x, mes, admin, onClose }) {
  if (!x) return <Sheet abierto={false} onClose={onClose} titulo="" />;
  const per = A.periodoDe(x.periodo, mes);
  const cerrado = A.periodoTerminado(per);
  const clave = { esquemaId: x.esquemaId, mes, usuarioId: x.usuarioId };
  const pie = admin && x.estado !== "pagado" ? (
    x.estado === "calculado"
      ? <Button block disabled={!cerrado || !(x.bono > 0)} onClick={() => run((s) => A.aprobarBono(s, clave), "Bono aprobado.")}>{cerrado ? (x.bono > 0 ? "Aprobar bono" : "Sin bono que aprobar") : "Se aprueba al cierre del periodo"}</Button>
      : <Button block onClick={() => run((s) => A.pagarBono(s, clave), "Bono marcado como pagado.")}>Marcar como pagado</Button>
  ) : null;
  return (
    <Sheet abierto onClose={onClose} titulo={R.nombreUsuario(d, x.usuarioId)} pie={pie}>
      <div className="form">
        <div className="fila-flex" style={{ justifyContent: "space-between" }}><div><b>{x.nombre}</b><div className="peq mu">{x.etiquetaPeriodo}</div></div><EstadoBono estado={x.estado} /></div>
        <Resumen filas={[[x.baseEtiqueta, dinero(x.base)], ["Ventas atribuidas", x.nVentas], ["Escalón", x.escalon ? `${x.numeroEscalon} de ${x.totalEscalones}` : "Sin escalón"], ["Bono", dinero(x.bono), true]]} />
        <div className="dsp-formula"><b>Fórmula</b><div>{x.formula}</div></div>
        {x.estado !== "calculado" && x.bonoCalculado !== undefined && x.bonoCalculado !== x.bono && <Card tono="warn"><span className="peq">El bono aprobado ({dinero(x.bono)}) quedó congelado; con las reglas de hoy se calcularía {dinero(x.bonoCalculado)}.</span></Card>}
        {x.siguiente && <div><div className="peq mu">Siguiente escalón: desde {dinero(x.siguiente.desde)} · faltan {dinero(x.faltante)}</div><Progreso pct={(x.base / x.siguiente.desde) * 100} /></div>}
        {x.proyeccion && <div className="peq mu">Al ritmo actual cerraría con {dinero(x.proyeccion.base)} (escalón {x.proyeccion.numeroEscalon}) y un bono de {dinero(x.proyeccion.bono)}.</div>}
        <Titulo>Condiciones</Titulo>
        <Condiciones cond={x.condiciones} />
        {Object.keys(x.porSucursal).length > 0 && (<><Titulo>Por sucursal de la venta</Titulo>
          <div className="lista">{Object.entries(x.porSucursal).map(([s, o]) => <Fila key={s} titulo={R.nombreSucursal(d, s)} sub={`${o.nVentas} venta(s) · ${o.dias} día(s)`} derecha={<b>{dinero(o.base)}</b>} />)}</div></>)}
        <Titulo>Ventas atribuidas</Titulo>
        {x.fuenteHistorica && !x.ventas.length ? <div className="peq mu">Mes cerrado: se conserva el resumen por persona y sucursal (arriba); el detalle de cada ticket ya no se guarda en esta demostración.</div>
          : x.ventas.length ? <ListaVentas d={d} ventas={x.ventas} /> : <div className="peq mu">Sin ventas atribuidas en el periodo.</div>}
        {x.ventas.length > 0 && x.fuenteHistorica && <div className="peq mu">Los meses cerrados del periodo se muestran resumidos; solo hay tickets del mes en curso.</div>}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Por sucursal
function PorSucursal({ d, pm, sucursalIds, admin }) {
  const [sel, setSel] = useState(null);
  const r = useMemo(() => A.resumenPeriodo(d, { mes: pm.mes, periodo: pm.per, sucursalIds }), [d, pm, sucursalIds]);
  const items = r.sucursales.map((x) => ({ ...x, id: claveSuc(x), nombreSuc: R.nombreSucursal(d, x.sucursalId) }));
  const actual = sel ? r.sucursales.find((x) => claveSuc(x) === sel) : null;
  return (
    <>
      <Vista id="bonos-suc" items={items} onAbrir={(x) => setSel(x.id)} minTarjeta={270} vacio="No hay esquemas de sucursal para este periodo."
        tarjeta={(x) => (
          <div className="dsp-tarj">
            <div className="dsp-tarj-top"><div><b>{x.nombreSuc}</b><small>{x.nombre}</small></div><EstadoBono estado={x.estado} /></div>
            <div className="dsp-cifras"><div>Venta<b>{dinero(x.venta)}</b></div><div>Meta<b>{x.meta ? dinero(x.meta) : "—"}</b></div><div className="der">Bolsa<b>{dinero(x.bolsa)}</b></div></div>
            <Progreso pct={x.meta ? (x.venta / x.meta) * 100 : 0} tono={x.pct >= 100 ? "ok" : x.pct >= 95 ? "warn" : undefined} />
            <div className="dsp-nota">{x.meta ? `${x.pct} % de la meta` : "Sin meta"}{x.siguiente ? ` · faltan ${x.baseEtiqueta.includes("meta") ? `${+x.faltante.toFixed(1)} puntos` : dinero(x.faltante)} para el siguiente escalón` : x.escalon ? " · escalón máximo" : ""}</div>
            <div className="dsp-nota">{x.reparto.filter((p) => !p.excluido).length} persona(s) en el reparto</div>
          </div>)}
        columnas={[
          { k: "s", t: "Sucursal", v: (x) => x.nombreSuc, orden: (x) => x.nombreSuc },
          { k: "e", t: "Esquema", v: (x) => x.nombre },
          { k: "v", t: "Venta", v: (x) => dinero(x.venta), der: true, orden: (x) => x.venta },
          { k: "m", t: "Meta", v: (x) => (x.meta ? dinero(x.meta) : "—"), der: true, orden: (x) => x.meta },
          { k: "p", t: "Cumpl.", v: (x) => `${x.pct} %`, der: true, orden: (x) => x.pct },
          { k: "b", t: "Bolsa", v: (x) => dinero(x.bolsa), der: true, orden: (x) => x.bolsa },
          { k: "t", t: "Estado", v: (x) => <EstadoBono estado={x.estado} />, orden: (x) => x.estado },
        ]} />
      <DetalleSucursal d={d} x={actual} mes={pm.mes} admin={admin} onClose={() => setSel(null)} />
    </>
  );
}
function DetalleSucursal({ d, x, mes, admin, onClose }) {
  if (!x) return <Sheet abierto={false} onClose={onClose} titulo="" />;
  const per = A.periodoDe(x.periodo, mes), cerrado = A.periodoTerminado(per);
  const clave = { esquemaId: x.esquemaId, mes, sucursalId: x.sucursalId };
  const pie = admin && x.estado !== "pagado" ? (
    x.estado === "calculado"
      ? <Button block disabled={!cerrado || !(x.bolsa > 0)} onClick={() => run((s) => A.aprobarBono(s, clave), "Bono de sucursal aprobado.")}>{cerrado ? (x.bolsa > 0 ? "Aprobar bolsa y reparto" : "Sin bolsa que aprobar") : "Se aprueba al cierre del periodo"}</Button>
      : <Button block onClick={() => run((s) => A.pagarBono(s, clave), "Bono de sucursal pagado.")}>Marcar como pagado</Button>
  ) : null;
  return (
    <Sheet abierto onClose={onClose} titulo={R.nombreSucursal(d, x.sucursalId)} pie={pie}>
      <div className="form">
        <div className="fila-flex" style={{ justifyContent: "space-between" }}><div><b>{x.nombre}</b><div className="peq mu">{x.etiquetaPeriodo}</div></div><EstadoBono estado={x.estado} /></div>
        <Resumen filas={[["Venta del periodo", dinero(x.venta)], ["Meta", x.meta ? dinero(x.meta) : "Sin meta"], ["Cumplimiento", `${x.pct} %`], ["Bolsa", dinero(x.bolsa), true]]} />
        <div className="dsp-formula"><b>Fórmula</b><div>{x.formula}</div></div>
        {x.proyeccion && <div className="peq mu">Al ritmo actual cerraría en {x.proyeccion.pct} % ({dinero(x.proyeccion.venta)}) con una bolsa de {dinero(x.proyeccion.bolsa)}.</div>}
        <Titulo>Reparto entre quienes trabajaron en la sucursal</Titulo>
        {x.sinTrabajadores ? <div className="peq mu">Nadie con rol elegible registra actividad en esta sucursal en el periodo.</div> : (
          <div className="lista">{x.reparto.map((p) => (
            <Fila key={p.usuarioId} titulo={R.nombreUsuario(d, p.usuarioId)} sub={`${NOMBRE_ROL[p.rol] || p.rol} · ${p.dias} día(s) trabajados`}
              badge={p.excluido ? <Badge tono="bad">Fuera: condición</Badge> : null}
              datos={p.condiciones && p.condiciones.detalle.length ? <span>{p.condiciones.detalle.map((c) => (c.ok ? "✔ " : "✖ ") + c.texto.split(":")[0]).join(" · ")}</span> : null}
              derecha={<b>{dinero(p.monto)}</b>} />
          ))}</div>
        )}
        <div className="peq mu">El reparto es proporcional a los días trabajados en esta sucursal (ventas, citas atendidas, turnos de caja, esterilización o asistencia). Quien no cumple una condición no recibe parte y su porción se reparte entre los demás.</div>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Esquemas
const nuevoEsquema = () => ({ id: null, nombre: "", tipo: "individual", periodo: "mensual", base: "ventas", roles: [], escalones: [{ desde: "", tipo: "pct", valor: "" }], tope: "", asistenciaMin: "", califMin: "", nota: "" });
function Esquemas({ d, admin }) {
  const [ed, setEd] = useState(null);
  const lista = d.bonos.esquemas;
  const abrir = (e) => setEd(e ? { id: e.id, nombre: e.nombre, tipo: e.tipo, periodo: e.periodo, base: e.base, roles: [...e.roles], escalones: e.escalones.map((x) => ({ ...x })), tope: e.tope ?? "", asistenciaMin: e.condiciones?.asistenciaMin ?? "", califMin: e.condiciones?.califMin ?? "", nota: e.nota || "" } : nuevoEsquema());
  return (
    <>
      {!admin && <Card tono="info"><span className="peq">Los esquemas los define Administración central o Dirección. Aquí puedes consultarlos.</span></Card>}
      {admin && <Button icon="plus" onClick={() => abrir(null)}>Nuevo esquema</Button>}
      <div className="lista">{lista.map((e) => (
        <Fila key={e.id} titulo={e.nombre} sub={`${e.tipo === "individual" ? "Individual" : "Por sucursal"} · ${e.periodo === "mensual" ? "mensual" : "trimestral"} · ${A.BASES[e.base]}`}
          badge={e.activo === false ? <Badge>Archivado</Badge> : e.porValidar ? <Badge tono="warn">Por validar con el cliente</Badge> : <Badge tono="ok">Vigente</Badge>}
          datos={<><span>Roles: {e.roles.map((r) => NOMBRE_ROL[r] || r).join(", ")}</span><span>{e.escalones.length} escalón(es){e.tope ? ` · tope ${dinero(e.tope)}` : ""}</span></>}
          onClick={() => abrir(e)} />
      ))}</div>
      <Card><div className="peq mu"><b>Parámetros de demostración.</b> Porcentajes, montos, topes y condiciones de los esquemas sembrados son supuestos para probar el módulo; el cliente debe validarlos antes de pagar bonos reales.</div></Card>
      <EditorEsquema d={d} ed={ed} setEd={setEd} admin={admin} />
    </>
  );
}
function EditorEsquema({ d, ed, setEd, admin }) {
  if (!ed) return null;
  const set = (k, v) => setEd((x) => ({ ...x, [k]: v }));
  const setEsc = (i, k, v) => setEd((x) => ({ ...x, escalones: x.escalones.map((e, j) => (j === i ? { ...e, [k]: v } : e)) }));
  const bases = Object.entries(A.BASES).filter(([k]) => ed.tipo === "sucursal" || k !== "cumplimiento");
  const base = bases.some(([k]) => k === ed.base) ? ed.base : "ventas";
  const esCump = base === "cumplimiento";
  const exist = ed.id ? d.bonos.esquemas.find((e) => e.id === ed.id) : null;
  const guardar = () => {
    const r = run((s) => A.guardarEsquema(s, { ...ed, base, condiciones: { asistenciaMin: ed.asistenciaMin, califMin: ed.califMin } }), "Esquema guardado.");
    if (r && r.ok) setEd(null);
  };
  return (
    <Sheet abierto onClose={() => setEd(null)} titulo={ed.id ? "Esquema de bono" : "Nuevo esquema"}
      pie={admin ? <div className="dos">{exist ? <Button variante="sec" block onClick={() => { run((s) => A.activarEsquema(s, ed.id, exist.activo === false), exist.activo === false ? "Esquema activado." : "Esquema archivado."); setEd(null); }}>{exist.activo === false ? "Activar" : "Archivar"}</Button> : <Button variante="sec" block onClick={() => setEd(null)}>Cancelar</Button>}<Button block onClick={guardar}>Guardar</Button></div> : <Button block variante="sec" onClick={() => setEd(null)}>Cerrar</Button>}>
      <fieldset disabled={!admin} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form">
          <Field label="Nombre"><Input value={ed.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Podólogos · individual mensual" /></Field>
          <div className="form2">
            <Field label="Tipo"><Select value={ed.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="individual">Individual</option><option value="sucursal">Por sucursal</option></Select></Field>
            <Field label="Periodo"><Select value={ed.periodo} onChange={(e) => set("periodo", e.target.value)}><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option></Select></Field>
          </div>
          <Field label="Base de cálculo" hint={esCump ? "Los escalones se miden en % de cumplimiento de la meta de la sucursal." : "Los escalones se miden en pesos de la base elegida."}><Select value={base} onChange={(e) => set("base", e.target.value)}>{bases.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Roles elegibles">
            <div className="chips">{A.ROLES_ELEGIBLES.map((r) => (
              <button key={r} type="button" className={`chip${ed.roles.includes(r) ? " on" : ""}`} aria-pressed={ed.roles.includes(r)} onClick={() => set("roles", ed.roles.includes(r) ? ed.roles.filter((x) => x !== r) : [...ed.roles, r])}>{NOMBRE_ROL[r] || r}</button>
            ))}</div>
          </Field>
          <Titulo>Escalones</Titulo>
          <div className="dsp-escalones">
            {ed.escalones.map((e, i) => (
              <div key={i} className="dsp-esc">
                <Field label={esCump ? "Desde (%)" : "Desde ($)"}><Input type="number" inputMode="decimal" value={e.desde} onChange={(x) => setEsc(i, "desde", x.target.value)} /></Field>
                <Field label="Paga"><Select value={e.tipo} onChange={(x) => setEsc(i, "tipo", x.target.value)}><option value="pct">% de la base</option><option value="monto">Monto fijo</option></Select></Field>
                <Field label={e.tipo === "pct" ? "Porcentaje" : "Monto ($)"}><Input type="number" inputMode="decimal" value={e.valor} onChange={(x) => setEsc(i, "valor", x.target.value)} /></Field>
                <button type="button" className="icono" aria-label="Quitar escalón" disabled={ed.escalones.length < 2} onClick={() => setEd((x) => ({ ...x, escalones: x.escalones.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <Button variante="sec" icon="plus" onClick={() => setEd((x) => ({ ...x, escalones: [...x.escalones, { desde: "", tipo: "pct", valor: "" }] }))}>Agregar escalón</Button>
            <div className="peq mu">{ed.tipo === "sucursal" ? "En esquemas por sucursal el escalón fija la bolsa (monto fijo, o % de la venta de la sucursal) que se reparte entre quienes trabajaron." : "El porcentaje se aplica sobre toda la base, no solo sobre el excedente del escalón."}</div>
          </div>
          <Field label="Tope (opcional)" hint={ed.tipo === "sucursal" ? "Máximo de la bolsa." : "Máximo por persona y periodo."}><Input type="number" inputMode="decimal" value={ed.tope} onChange={(e) => set("tope", e.target.value)} placeholder="Sin tope" /></Field>
          <div className="form2">
            <Field label="Asistencia mínima (%)"><Input type="number" inputMode="decimal" value={ed.asistenciaMin} onChange={(e) => set("asistenciaMin", e.target.value)} placeholder="Sin condición" /></Field>
            <Field label="Calificación mínima (1–5)"><Input type="number" inputMode="decimal" value={ed.califMin} onChange={(e) => set("califMin", e.target.value)} placeholder="Sin condición" /></Field>
          </div>
          <div className="peq mu">La asistencia sale del checador (RH) y la calificación de las encuestas de clientes; si no hay datos suficientes la condición se considera cumplida y así se indica.</div>
          <Field label="Nota"><Area value={ed.nota} onChange={(e) => set("nota", e.target.value)} /></Field>
        </div>
      </fieldset>
    </Sheet>
  );
}

// ───────────────────────── Metas
function Metas({ d, u, admin, visibles }) {
  const act = A.mesActual();
  const [suc, setSuc] = useState(visibles[0]);
  const [mes, setMes] = useState(A.sumarMeses(act, 1));
  const [valor, setValor] = useState("");
  const hist = useMemo(() => A.historialMetas(d, suc), [d, suc]);
  const sg = useMemo(() => A.sugerirMeta(d, suc, mes), [d, suc, mes]);
  const vigente = A.metaSucursal(d, suc, mes);
  const pend = (d.bonos.propuestas || []).filter((p) => p.estado === "pendiente" && (admin ? visibles.includes(p.sucursalId) : p.sucursalId === suc));
  const propia = pend.find((p) => p.sucursalId === suc && p.mes === mes);
  const datos = hist.map((h) => ({ etq: A.nombreMesCorto(h.mes).split(" ")[0], ...h }));
  const cumple = hist.filter((h) => !h.futuro && !h.enCurso && h.meta);
  const alDia = cumple.filter((h) => h.pct >= 100).length;
  const meses = [act, A.sumarMeses(act, 1), A.sumarMeses(act, 2)];
  const guardar = () => run((s) => (admin ? A.fijarMeta(s, { sucursalId: suc, mes, meta: valor }) : A.proponerMeta(s, { sucursalId: suc, mes, meta: valor })), admin ? "Meta guardada." : "Propuesta enviada a Administración.");
  const aceptar = () => run((s) => A.aceptarSugerencia(s, { sucursalId: suc, mes }), admin ? "Meta fijada con la sugerencia." : "Sugerencia enviada como propuesta.");
  return (
    <>
      {visibles.length > 1 && <Chips scroll opciones={visibles.map((s) => ({ v: s, l: R.nombreSucursal(d, s) }))} valor={suc} onChange={(v) => { setSuc(v); setValor(""); }} />}
      <Card>
        <div className="dsp-sec">
          <div className="dsp-cab"><h3>{R.nombreSucursal(d, suc)} · ventas contra meta</h3><Badge tono={alDia >= cumple.length / 2 ? "ok" : "warn"}>{alDia} de {cumple.length} meses cumplidos</Badge></div>
          <GraficaPeriodos titulo="Ventas reales contra la meta de cada mes" datos={datos}
            series={[{ k: "real", nombre: "Venta real (verde = meta cumplida)", tipo: "barra", color: "var(--ok)", valor: (x) => x.real, colorDe: (x) => (x.meta && x.real >= x.meta ? "var(--ok)" : "var(--al)") }, { k: "meta", nombre: "Meta", tipo: "linea", color: "var(--p)", valor: (x) => x.meta }]} />
          <div className="peq mu">Mes en curso: {hist.find((h) => h.enCurso)?.pct ?? "—"} % de la meta a hoy; al ritmo actual cerraría en {hist.find((h) => h.enCurso)?.pctProyectado ?? "—"} %.</div>
        </div>
      </Card>
      <Titulo>Planear metas</Titulo>
      <Chips opciones={meses.map((m) => ({ v: m, l: A.nombreMes(m).replace(/ \d{4}/, "") }))} valor={mes} onChange={(v) => { setMes(v); setValor(""); }} />
      <div className="dsp-grid">
        <Card>
          <div className="dsp-sec">
            <div className="dsp-cab"><h3>Meta de {A.nombreMes(mes)}</h3>{vigente ? <Badge tono="ok">Vigente</Badge> : <Badge tono="warn">Sin meta</Badge>}</div>
            <div className="dsp-cifras"><div>Meta vigente<b>{vigente ? dinero(vigente) : "—"}</b></div><div className="der">Sugerida<b>{sg.ok ? dinero(sg.sugerida) : "—"}</b></div></div>
            {propia && <Card tono="info"><span className="peq">Propuesta pendiente de {R.nombreUsuario(d, propia.porId)}: {dinero(propia.meta)}. Administración debe aceptarla.</span></Card>}
            <Field label={admin ? "Fijar meta ($)" : "Proponer meta ($)"} hint={admin ? "Tú fijas la meta; el gerente solo la propone." : "Administración la acepta o la rechaza."}>
              <Input type="number" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={vigente ? String(vigente) : sg.ok ? String(sg.sugerida) : "Importe"} />
            </Field>
            <div className="dos">
              <Button variante="sec" block disabled={!sg.ok} onClick={aceptar}>{admin ? "Aceptar sugerencia" : "Proponer sugerencia"}</Button>
              <Button block disabled={!valor} onClick={guardar}>{admin ? "Guardar meta" : "Proponer"}</Button>
            </div>
          </div>
        </Card>
        <Card>
          <div className="dsp-sug">
            <h3 style={{ margin: 0, fontSize: 15 }}>Cómo se calcula la sugerencia</h3>
            {sg.ok ? (<>
              <ol>{sg.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
              <div className="dsp-formula"><b>Meta sugerida: {dinero(sg.sugerida)}</b><div className="peq">Redondeada al millar. Es una ayuda: tú decides la meta.</div></div>
            </>) : <div className="peq mu">{sg.motivo}</div>}
          </div>
        </Card>
      </div>
      {admin && pend.length > 0 && (<>
        <Titulo>Propuestas de gerentes</Titulo>
        <div className="lista">{pend.map((p) => (
          <Fila key={p.id} titulo={`${R.nombreSucursal(d, p.sucursalId)} · ${A.nombreMes(p.mes)}`} sub={`${R.nombreUsuario(d, p.porId)}${p.nota ? ` · ${p.nota}` : ""}`}
            derecha={<div className="der"><b>{dinero(p.meta)}</b><div className="dos" style={{ marginTop: 6 }}>
              <Button variante="sec" onClick={() => run((s) => A.resolverPropuestaMeta(s, { id: p.id, aceptar: false }), "Propuesta rechazada.")}>No</Button>
              <Button onClick={() => run((s) => A.resolverPropuestaMeta(s, { id: p.id, aceptar: true }), "Meta fijada.")}>Sí</Button></div></div>} />
        ))}</div>
      </>)}
      <Titulo>Historial</Titulo>
      <div className="lista">{[...hist].reverse().map((h) => (
        <Fila key={h.mes} titulo={A.nombreMes(h.mes)} sub={h.futuro ? "Aún no empieza" : h.enCurso ? `En curso · proyección ${h.pctProyectado ?? "—"} %` : "Cerrado"}
          badge={h.meta && !h.futuro ? <Badge tono={h.pct >= 100 ? "ok" : h.pct >= 90 ? "warn" : "bad"}>{h.pct} %</Badge> : null}
          derecha={<div className="der"><b>{h.futuro ? "—" : dinero(h.real)}</b><div className="peq mu">Meta {h.meta ? dinero(h.meta) : "—"}</div></div>} />
      ))}</div>
    </>
  );
}
