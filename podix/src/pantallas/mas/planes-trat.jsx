// Más ▸ Planes de tratamiento (porte de Pie Firme: Planes, PlanNuevo, PlanDetalle). Reglas P-026 a P-029.
// Colección d.planesTrat (NO d.planes, que es de ventas a plazos). Los planes creados al cerrar consulta (d.planesTratamiento)
// se muestran como «Desde consulta» y se pueden traer sin modificar el original.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_clinica.js";
import { dinero, fechaCorta, hoy, sumarDias } from "../../lib/format.js";
import { Area, Badge, BarraAccion, Button, Card, Chips, Field, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, Buscador, aviso, Confirmar } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { Barra, CampoPaciente, SinAcceso, resultado } from "../../componentes/clinica/comunes.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);
const nomSuc = (d, id) => (d.sucursales.find((s) => s.id === id) || {}).nombre || id;

export default function PlanesTrat() {
  const { d, u } = useSesion();
  const [filtro, setFiltro] = useState("activo");
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [sel, setSel] = useState(null);
  const [plantilla, setPlantilla] = useState(null);
  const [aplicar, setAplicar] = useState(false);
  const ref = hoy();
  const P = A.paramsClinica(d);
  const todos = useMemo(() => A.planesVisibles(d, u), [d, u]);
  const legados = useMemo(() => A.planesDeConsulta(d, u), [d, u]);
  if (!A.puede(u, "planes.ver")) return <SinAcceso>Los planes de tratamiento son del podólogo y de Administración.</SinAcceso>;

  const porAbandonar = todos.filter((p) => A.planPorAbandonar(p, ref, P.diasAbandono));
  const abandonables = todos.filter((p) => A.planAbandonable(p, ref, P.diasAbandono));
  const cuenta = (e) => todos.filter((p) => p.estado === e).length;
  const base = filtro === "riesgo" ? [...abandonables, ...porAbandonar] : filtro === "todos" ? todos : todos.filter((p) => p.estado === filtro);
  const lista = base.filter((p) => A.buscarTexto(q, A.nombrePac(d, p.pacienteId), p.nombre, p.folio, p.diagnostico))
    .map((p) => ({ ...p, cumpl: A.resumenCumplimiento(p.sesiones, ref), sig: A.siguienteSesion(p), sin: A.diasSinActividad(p, ref) }));
  const activos = todos.filter((p) => p.estado === "activo");
  const avance = activos.length ? Math.round(activos.reduce((a, p) => a + A.resumenCumplimiento(p.sesiones, ref).avancePct, 0) / activos.length) : 0;
  const esAdm = A.puede(u, "planes.plantillas");

  const tonoPlan = (p) => (A.planAbandonable(p, ref, P.diasAbandono) ? "bad" : A.planPorAbandonar(p, ref, P.diasAbandono) ? "warn" : A.TONO_PLAN[p.estado]);
  const txtPlan = (p) => (A.planAbandonable(p, ref, P.diasAbandono) ? `${p.sin} días sin cita` : A.planPorAbandonar(p, ref, P.diasAbandono) ? "Por abandonar" : A.ESTADOS_PLAN[p.estado]);

  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Planes activos" valor={activos.length} />
        <Kpi label="Avance promedio" valor={`${avance} %`} />
        <Kpi label="Por abandonar" valor={porAbandonar.length} tono={porAbandonar.length ? "warn" : undefined} nota="7 días o menos" />
        <Kpi label={`Sin cita ${P.diasAbandono}+ días`} valor={abandonables.length} tono={abandonables.length ? "bad" : undefined} nota="P-026" />
      </div>
      {abandonables.length > 0 && (
        <Card tono="bad"><div className="cl-entre"><span>{abandonables.length} plan(es) llevan {P.diasAbandono} días o más sin sesión ni cita: la regla los marca como abandonados.</span>
          <Button variante="danger" className="btn-peq" onClick={() => setAplicar(true)}>Aplicar regla</Button></div></Card>
      )}
      <Chips scroll valor={filtro} onChange={setFiltro} opciones={[
        { v: "activo", l: "Activos", n: cuenta("activo") }, { v: "riesgo", l: "En riesgo", n: abandonables.length + porAbandonar.length }, { v: "abandonado", l: "Abandonados", n: cuenta("abandonado") },
        { v: "completado", l: "Completados", n: cuenta("completado") }, { v: "todos", l: "Todos", n: todos.length }, ...(legados.length ? [{ v: "legado", l: "Desde consulta", n: legados.length }] : []), ...(esAdm ? [{ v: "plantillas", l: "Plantillas", n: (d.plantillasPlan || []).length }] : []),
      ]} />

      {filtro === "plantillas" ? <Plantillas d={d} onAbrir={setPlantilla} /> : filtro === "legado" ? <Legados d={d} lista={legados} /> : <>
        <Buscador valor={q} onChange={setQ} placeholder="Paciente, plan, folio o diagnóstico" />
        <Vista id="clinica-planes" items={lista} onAbrir={(p) => setSel(p.id)} vacio="No hay planes en este filtro."
          tarjeta={(p) => (
            <div className="form" style={{ gap: 8 }}>
              <div className="cl-entre"><b>{A.nombrePac(d, p.pacienteId)}</b><Badge tono={tonoPlan(p)}>{txtPlan(p)}</Badge></div>
              <div className="mu peq">{p.folio} · {p.nombre}</div>
              <Barra pct={p.cumpl.avancePct} tono={p.estado === "completado" ? "ok" : tonoPlan(p) === "bad" ? "bad" : "info"} />
              <div className="cl-entre peq"><span>{p.cumpl.realizadas}/{p.cumpl.total} sesiones · {dinero(A.totalPlan(p.sesiones))}</span>
                <span className="mu">{p.sig ? `Sig.: ${p.sig.nombre} ${fechaCorta(p.sig.fecha)}` : "Sin pendientes"}</span></div>
              {p.cumpl.atrasadas > 0 && p.estado === "activo" && <Badge tono="warn">{p.cumpl.atrasadas} atrasada(s)</Badge>}
            </div>
          )}
          columnas={[
            { k: "f", t: "Folio", v: (p) => p.folio }, { k: "p", t: "Paciente", v: (p) => A.nombrePac(d, p.pacienteId) }, { k: "n", t: "Plan", v: (p) => p.nombre },
            { k: "pod", t: "Podólogo", v: (p) => A.nombreCorto(d, p.podologoId) }, { k: "s", t: "Sucursal", v: (p) => nomSuc(d, p.sucursalId) },
            { k: "a", t: "Avance", v: (p) => `${p.cumpl.realizadas}/${p.cumpl.total}`, orden: (p) => p.cumpl.avancePct, der: true },
            { k: "sin", t: "Días sin actividad", v: (p) => p.sin, der: true }, { k: "e", t: "Estado", v: (p) => <Badge tono={tonoPlan(p)}>{txtPlan(p)}</Badge>, orden: (p) => p.estado },
          ]} />
      </>}

      <div style={{ height: 70 }} />
      {A.puede(u, "planes.editar") && <BarraAccion>
        {filtro === "plantillas" ? <Button block icon="plus" onClick={() => setPlantilla("nueva")}>Nueva plantilla de plan</Button> : <Button block icon="plus" onClick={() => setNuevo(true)}>Nuevo plan de tratamiento</Button>}
      </BarraAccion>}
      {nuevo && <NuevoPlan onClose={() => setNuevo(false)} onCreado={(id) => { setNuevo(false); setSel(id); }} />}
      {sel && <DetallePlan id={sel} onClose={() => setSel(null)} />}
      {plantilla && <EditarPlantilla id={plantilla === "nueva" ? null : plantilla} onClose={() => setPlantilla(null)} />}
      <Confirmar abierto={aplicar} titulo="Aplicar regla de abandono" texto={`Se marcarán como «Abandonado» ${abandonables.length} plan(es) sin sesión ni cita en ${P.diasAbandono} días (P-026). Se pueden reactivar después.`}
        confirmar="Marcar abandonados" peligro onNo={() => setAplicar(false)}
        onSi={() => { const r = mutar((dd) => A.aplicarAbandonos(dd, yo(dd))); setAplicar(false); resultado(r, aviso, `${r.marcados ? r.marcados.length : 0} plan(es) marcados como abandonados`); }} />
    </div>
  );
}

function Legados({ d, lista }) {
  return (
    <div className="lista">
      <p className="mu peq">Planes abiertos al cerrar una consulta. Al traerlos se copian a Planes de tratamiento con sus sesiones; el registro de la consulta no cambia.</p>
      {lista.map((p) => (
        <Card key={p.id}><div className="cl-entre"><div><b>{A.nombrePac(d, p.pacienteId)}</b><div className="mu peq">{p.nombre} · {p.sesiones.filter((s) => s.estado === "realizada").length}/{p.sesiones.length} sesiones · {p.frecuencia}</div></div>
          <Button variante="sec" className="btn-peq" icon="download" onClick={() => { const r = mutar((dd) => A.importarPlanConsulta(dd, p.origenId, yo(dd))); resultado(r, aviso, "Plan traído a Planes de tratamiento"); }}>Traer</Button></div></Card>
      ))}
      {!lista.length && <Vacio icon="check">No hay planes de consulta por traer.</Vacio>}
    </div>
  );
}

function Plantillas({ d, onAbrir }) {
  const lista = (d.plantillasPlan || []).map((p) => ({ ...p, total: A.totalPlan(p.sesiones.map((s) => ({ ...s, estado: "por_generar" }))), incl: p.sesiones.filter((s) => Number(s.precio) === 0).length }));
  return (
    <Vista id="clinica-plantillas-plan" items={lista} onAbrir={(p) => onAbrir(p.id)}
      tarjeta={(p) => <div className="form" style={{ gap: 6 }}><div className="cl-entre"><b>{p.nombre}</b><Badge tono={p.activa ? "ok" : "neutral"}>{p.activa ? "Activa" : "Inactiva"}</Badge></div><div className="mu peq">{p.descripcion}</div><div className="peq">{p.sesiones.length} sesiones · {dinero(p.total)}{p.incl ? ` · ${p.incl} incluidas a $0` : ""}</div></div>}
      columnas={[{ k: "n", t: "Plantilla", v: (p) => p.nombre }, { k: "s", t: "Sesiones", v: (p) => p.sesiones.length, der: true }, { k: "i", t: "Incluidas $0", v: (p) => p.incl, der: true }, { k: "t", t: "Total", v: (p) => dinero(p.total), orden: (p) => p.total, der: true }, { k: "e", t: "Estado", v: (p) => (p.activa ? "Activa" : "Inactiva") }]} />
  );
}

const filaVacia = () => ({ nombre: "", tipo: "sesion", intervaloDias: 7, duracion: 30, precio: 0, ventanaMin: "", ventanaMax: "" });
function EditorSesiones({ filas, onChange }) {
  const set = (i, k, v) => onChange(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <div className="form">
      {filas.map((f, i) => (
        <Card key={i}>
          <div className="cl-entre"><b>Sesión {i + 1}</b><Button variante="ghost" className="btn-peq" icon="trash" disabled={filas.length < 2} onClick={() => onChange(filas.filter((_, j) => j !== i))}>Quitar</Button></div>
          <Field label="Nombre"><Input value={f.nombre} onChange={(e) => set(i, "nombre", e.target.value)} /></Field>
          <div className="form2">
            <Field label="Tipo"><Select value={f.tipo} onChange={(e) => set(i, "tipo", e.target.value)}>{Object.entries(A.TIPOS_SESION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Precio ($0 = incluida)"><Input inputMode="decimal" value={f.precio} onChange={(e) => set(i, "precio", e.target.value)} /></Field>
            <Field label={i ? "Días tras la anterior" : "Días tras el inicio"}><Input inputMode="numeric" value={f.intervaloDias} onChange={(e) => set(i, "intervaloDias", e.target.value)} /></Field>
            <Field label="Duración (min)"><Input inputMode="numeric" value={f.duracion} onChange={(e) => set(i, "duracion", e.target.value)} /></Field>
            <Field label="Ventana desde (días)"><Input inputMode="numeric" value={f.ventanaMin ?? ""} onChange={(e) => set(i, "ventanaMin", e.target.value)} /></Field>
            <Field label="Ventana hasta (días)"><Input inputMode="numeric" value={f.ventanaMax ?? ""} onChange={(e) => set(i, "ventanaMax", e.target.value)} /></Field>
          </div>
        </Card>
      ))}
      <Button variante="sec" icon="plus" onClick={() => onChange([...filas, filaVacia()])}>Agregar sesión</Button>
    </div>
  );
}

function EditarPlantilla({ id, onClose }) {
  const { d } = useSesion();
  const p = id ? (d.plantillasPlan || []).find((x) => x.id === id) : null;
  const [f, setF] = useState(() => (p ? { ...p, sesiones: p.sesiones.map((s) => ({ ...s, ventanaMin: s.ventanaMin ?? "", ventanaMax: s.ventanaMax ?? "" })) } : { nombre: "", descripcion: "", servicioId: "SV1", activa: true, sesiones: [filaVacia()] }));
  const guardar = () => { const r = mutar((dd) => A.guardarPlantillaPlan(dd, f, yo(dd))); if (resultado(r, aviso, "Plantilla guardada")) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo={p ? "Editar plantilla" : "Nueva plantilla"} pie={<Button block onClick={guardar}>Guardar plantilla</Button>}>
      <div className="form">
        <p className="mu peq">Los cambios no afectan a planes ya vendidos: cada plan copia sus sesiones (P-027).</p>
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        <Field label="Descripción"><Area value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Field>
        <div className="form2">
          <Field label="Servicio de la cita"><Select value={f.servicioId} onChange={(e) => setF({ ...f, servicioId: e.target.value })}>{d.servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
          <Field label="Estado"><Select value={f.activa ? "1" : "0"} onChange={(e) => setF({ ...f, activa: e.target.value === "1" })}><option value="1">Activa</option><option value="0">Inactiva</option></Select></Field>
        </div>
        <EditorSesiones filas={f.sesiones} onChange={(sesiones) => setF({ ...f, sesiones })} />
      </div>
    </Sheet>
  );
}

function NuevoPlan({ onClose, onCreado }) {
  const { d, u, sucursalId } = useSesion();
  const activas = (d.plantillasPlan || []).filter((p) => p.activa);
  const ids = u.rol === "podologo" ? A.pacientesDe(d, u) : null;
  const pods = d.usuarios.filter((x) => x.rol === "podologo" && x.activo !== false);
  const deP = (pl) => pl.sesiones.map((s) => ({ ...s, ventanaMin: s.ventanaMin ?? "", ventanaMax: s.ventanaMax ?? "" }));
  const [f, setF] = useState(() => ({ pacienteId: "", plantillaId: activas[0] ? activas[0].id : "", nombre: activas[0] ? activas[0].nombre : "", diagnostico: "", fechaInicio: hoy(), formaCobro: "por_sesion", anticipo: 0, podologoId: pods[0] ? pods[0].id : "", sesiones: activas[0] ? deP(activas[0]) : [filaVacia()] }));
  const [err, setErr] = useState({});
  const elegir = (pid) => { const pl = activas.find((x) => x.id === pid); setF({ ...f, plantillaId: pid, nombre: pl ? pl.nombre : f.nombre, sesiones: pl ? deP(pl) : f.sesiones }); };
  const vista = useMemo(() => A.generarSesiones({ sesiones: f.sesiones.map((s, i) => ({ ...s, n: i + 1, ventanaMin: s.ventanaMin === "" ? null : Number(s.ventanaMin), ventanaMax: s.ventanaMax === "" ? null : Number(s.ventanaMax) })), fechaInicio: f.fechaInicio, festivos: A.festivosDe(d) }), [f.sesiones, f.fechaInicio, d]);
  const crear = () => {
    const sesiones = f.sesiones.map((s, i) => ({ ...s, n: i + 1, ventanaMin: s.ventanaMin === "" ? null : Number(s.ventanaMin), ventanaMax: s.ventanaMax === "" ? null : Number(s.ventanaMax) }));
    const r = mutar((dd) => A.crearPlanTrat(dd, { ...f, sesiones }, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) { setErr(r.errores || {}); return aviso(r.error, "bad"); }
    aviso(`Plan ${r.plan.folio} creado`); onCreado(r.plan.id);
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Nuevo plan de tratamiento" pie={<Button block onClick={crear}>Crear plan · {dinero(A.totalPlan(vista))}</Button>}>
      <div className="form">
        <CampoPaciente d={d} ids={ids} valor={f.pacienteId} onChange={(pacienteId) => setF({ ...f, pacienteId })} error={err.pacienteId} />
        {u.rol !== "podologo" && <Field label="Podólogo tratante" error={err.podologoId}><Select value={f.podologoId} onChange={(e) => setF({ ...f, podologoId: e.target.value })}>{pods.map((p) => <option key={p.id} value={p.id}>{A.nombreCorto(d, p.id)}</option>)}</Select></Field>}
        <Field label="Plantilla"><Select value={f.plantillaId} onChange={(e) => elegir(e.target.value)}><option value="">Plan libre (sin plantilla)</option>{activas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
        <Field label="Nombre del plan" error={err.nombre}><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Field>
        <Field label="Diagnóstico"><Input value={f.diagnostico} onChange={(e) => setF({ ...f, diagnostico: e.target.value })} placeholder="Ej. L60.0 Uña encarnada" /></Field>
        <div className="form2">
          <Field label="Inicio" error={err.fechaInicio}><Input type="date" value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} /></Field>
          <Field label="Forma de cobro"><Select value={f.formaCobro} onChange={(e) => setF({ ...f, formaCobro: e.target.value })}>{Object.entries(A.FORMAS_COBRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Anticipo" error={err.anticipo}><Input inputMode="decimal" value={f.anticipo} onChange={(e) => setF({ ...f, anticipo: e.target.value })} /></Field>
        </div>
        <Titulo>Sesiones</Titulo>
        <EditorSesiones filas={f.sesiones} onChange={(sesiones) => setF({ ...f, sesiones })} />
        {err.sesiones && <div className="card card-bad">{err.sesiones}</div>}
        <Titulo derecha={<span className="peq mu">{A.sesionesIncluidas(vista)} incluidas a $0</span>}>Calendario propuesto</Titulo>
        <div className="cl-sesiones">{vista.map((s) => (
          <div key={s.n} className="cl-sesion"><b className="n">{s.n}</b><div>{s.nombre}<small>{fechaCorta(s.fecha)}{s.ventanaDesde ? ` · ventana ${fechaCorta(s.ventanaDesde)}–${fechaCorta(s.ventanaHasta)}` : ""}{s.atrasada ? " · se recorre por día cerrado" : ""}</small></div><b>{s.precio ? dinero(s.precio) : "$0"}</b></div>
        ))}</div>
      </div>
    </Sheet>
  );
}

function DetallePlan({ id, onClose }) {
  const { d, u } = useSesion();
  const p = (d.planesTrat || []).find((x) => x.id === id);
  const [agendar, setAgendar] = useState(null);
  const [cancelar, setCancelar] = useState(null); // "plan" | n
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  if (!p) return null;
  const ref = hoy();
  const cumpl = A.resumenCumplimiento(p.sesiones, ref), saldo = A.saldoPlan(p);
  const editable = A.puede(u, "planes.editar") && A.esSuyo(u, p);
  const accion = (fn, ok) => { const r = mutar((dd) => fn(dd, yo(dd))); resultado(r, aviso, ok); return r; };
  return (
    <Sheet abierto onClose={onClose} titulo={`${p.folio} · ${p.nombre}`}>
      <div className="form">
        <div className="cl-entre"><b>{A.nombrePac(d, p.pacienteId)}</b><Badge tono={A.TONO_PLAN[p.estado]}>{A.ESTADOS_PLAN[p.estado]}</Badge></div>
        <Barra pct={cumpl.avancePct} tono={p.estado === "completado" ? "ok" : "info"} />
        <Resumen filas={[["Podólogo", A.nombreCorto(d, p.podologoId)], ["Sucursal", nomSuc(d, p.sucursalId)], p.diagnostico && ["Diagnóstico", p.diagnostico], ["Inicio", fechaCorta(p.fechaInicio)], ["Forma de cobro", A.FORMAS_COBRO[p.formaCobro]],
          ["Sesiones", `${cumpl.realizadas} realizadas · ${cumpl.faltas} faltas · ${cumpl.reprogramaciones} reprog. · ${cumpl.atrasadas} atrasadas`], ["Total del plan", dinero(saldo.total)], saldo.anticipo > 0 && ["Anticipo", dinero(saldo.anticipo)],
          ["Devengado", dinero(saldo.devengado)], ["Por devengar", dinero(saldo.porDevengar), true], p.estado === "activo" && ["Días sin actividad", `${A.diasSinActividad(p, ref)} (abandono a los ${A.paramsClinica(d).diasAbandono})`]]} />
        <p className="mu peq">El cargo de cada sesión se cobra en Caja con la consulta; las incluidas generan $0 (P-027, P-028). Fuera de la ventana solo se marca «atrasada» (P-029).</p>
        <Titulo>Sesiones</Titulo>
        <div className="cl-sesiones">{p.sesiones.map((s) => (
          <div key={s.n} className={`cl-sesion ${s.estado}`}>
            <b className="n">{s.n}</b>
            <div>{s.nombre} <Badge tono={A.sesionAtrasada(s, ref) && s.estado !== "realizada" ? "warn" : A.TONO_SESION[s.estado]}>{A.sesionAtrasada(s, ref) && !["realizada", "cancelada"].includes(s.estado) ? "Atrasada" : A.ESTADOS_SESION[s.estado]}</Badge>
              <small>{s.estado === "realizada" ? `Realizada ${fechaCorta(s.realizadaEn)}` : `${fechaCorta(s.fecha)}${s.hora ? ` ${s.hora}` : ""}`}{s.ventanaHasta ? ` · ventana hasta ${fechaCorta(s.ventanaHasta)}` : ""}{s.reprogramaciones ? ` · ${s.reprogramaciones} reprog.` : ""}{s.cargo ? ` · ${s.cargo.concepto}` : ""}</small>
              {editable && p.estado === "activo" && ["por_generar", "agendada", "falta"].includes(s.estado) && (
                <div className="cl-fila-h" style={{ marginTop: 6 }}>
                  <Button variante="sec" className="btn-peq" icon="calendar" onClick={() => setAgendar(s)}>{s.estado === "agendada" ? "Reprogramar" : "Agendar"}</Button>
                  <Button variante="ok" className="btn-peq" icon="check" onClick={() => accion((dd, uu) => A.realizarSesion(dd, p.id, s.n, uu), "Sesión realizada")}>Realizada</Button>
                  {s.estado === "agendada" && <Button variante="ghost" className="btn-peq" onClick={() => accion((dd, uu) => A.faltaSesion(dd, p.id, s.n, uu), "Falta registrada")}>Faltó</Button>}
                  <Button variante="ghost" className="btn-peq" icon="x" onClick={() => { setMotivo(""); setCancelar(s.n); }}>Cancelar</Button>
                </div>
              )}
            </div>
            <b>{s.precio === null ? "Caja" : s.precio ? dinero(s.precio) : "$0"}</b>
          </div>
        ))}</div>
        <Titulo>Notas</Titulo>
        {(p.notas || []).map((n, i) => <div key={i} className="cl-nota">{n.texto}<small>{fechaCorta(n.fecha)} · {n.por ? A.nombreCorto(d, n.por) : "Sistema"}</small></div>)}
        {!(p.notas || []).length && <p className="mu peq">Sin notas.</p>}
        {editable && <div className="cl-fila-h"><Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota" style={{ flex: 1 }} /><Button className="btn-peq" onClick={() => { if (accion((dd, uu) => A.notaPlan(dd, p.id, nota, uu), "Nota agregada").ok) setNota(""); }}>Anotar</Button></div>}
        {editable && <div className="dos">
          {p.estado === "abandonado" && <Button variante="sec" block icon="refresh" onClick={() => accion((dd, uu) => A.reactivarPlan(dd, p.id, uu), "Plan reactivado")}>Reactivar</Button>}
          {["activo", "abandonado"].includes(p.estado) && <Button variante="danger" block onClick={() => { setMotivo(""); setCancelar("plan"); }}>Cancelar plan</Button>}
        </div>}
      </div>
      {agendar && <AgendarSesion plan={p} s={agendar} onClose={() => setAgendar(null)} />}
      <Sheet abierto={cancelar != null} onClose={() => setCancelar(null)} titulo={cancelar === "plan" ? "Cancelar plan" : `Cancelar sesión ${cancelar}`}
        pie={<Button variante="danger" block onClick={() => { const r = accion((dd, uu) => (cancelar === "plan" ? A.cancelarPlan(dd, p.id, motivo, uu) : A.cancelarSesion(dd, p.id, cancelar, motivo, uu)), "Cancelado"); if (r.ok) setCancelar(null); }}>Confirmar cancelación</Button>}>
        <Field label="Motivo"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
      </Sheet>
    </Sheet>
  );
}

function AgendarSesion({ plan, s, onClose }) {
  const { d } = useSesion();
  const suc = d.sucursales.find((x) => x.id === plan.sucursalId);
  const [f, setF] = useState({ fecha: s.fecha >= hoy() ? s.fecha : sumarDias(hoy(), 1), hora: s.hora || "10:00", consultorioId: (suc && suc.consultorios[0]) || "C1" });
  const fuera = (s.ventanaDesde && f.fecha < s.ventanaDesde) || (s.ventanaHasta && f.fecha > s.ventanaHasta);
  const guardar = () => {
    const r = mutar((dd) => A.agendarSesion(dd, plan.id, s.n, f, yo(dd)));
    if (!resultado(r, aviso, "Sesión agendada en la agenda")) return;
    if (r.aviso) aviso(r.aviso, "warn");
    onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo={`${s.estado === "agendada" ? "Reprogramar" : "Agendar"}: ${s.nombre}`} pie={<Button block icon="calendar" onClick={guardar}>Guardar cita</Button>}>
      <div className="form">
        <div className="form2">
          <Field label="Fecha"><Input type="date" min={hoy()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Field>
          <Field label="Hora"><Input type="time" step="900" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></Field>
        </div>
        <Field label="Consultorio"><Select value={f.consultorioId} onChange={(e) => setF({ ...f, consultorioId: e.target.value })}>{((suc && suc.consultorios) || ["C1"]).map((c) => <option key={c}>{c}</option>)}</Select></Field>
        {s.ventanaDesde && <div className={`card ${fuera ? "card-warn" : "card-ok"}`}>Ventana recomendada: {fechaCorta(s.ventanaDesde)} a {fechaCorta(s.ventanaHasta)}.{fuera ? " Fuera de ventana: se permite, pero la sesión queda «atrasada»." : ""}</div>}
        <p className="mu peq">Se crea la cita en la agenda de {suc ? suc.nombre : "la sucursal"} con {A.nombreCorto(d, plan.podologoId)}.</p>
      </div>
    </Sheet>
  );
}
