// Subpantallas de «Horarios, bloqueos y festivos» (porte de Pie Firme: pages/comercial/Horarios.jsx). P-047.
import { useMemo, useState } from "react";
import { Badge, Button, Card, Chips, Field, Fila, Input, Select, Sheet, Area, Vacio, Titulo, Resumen } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { ahoraLocal, dia, hora, hoy, fechaLarga } from "../../lib/format.js";
import * as G from "../../store/acciones_agenda.js";
import { correr, nomPac, nomUsr, nomSv, nomSuc, Est, ESTADO_CITA, Regla } from "./comun.jsx";

const { DIAS, ORDEN_DIAS } = G;

// ═════════════════════════ Horario de la sucursal
function DiaSucursal({ sucursalId, k, h, editable }) {
  const [x, setX] = useState({ abre: h?.abre || "09:00", cierra: h?.cierra || "18:00", cerrado: !!h?.cerrado });
  const cambio = !h || x.cerrado !== !!h.cerrado || (!x.cerrado && (x.abre !== h.abre || x.cierra !== h.cierra));
  const guardar = () => correr((d) => G.guardarHorarioSucursal(d, { sucursalId, dia: k, ...x }), (r) => `Horario del ${DIAS[k].toLowerCase()} guardado${r.afectadas ? ` · ${r.afectadas} cita(s) quedan fuera de horario` : ""}.`);
  return (
    <div className={`ag-dia${x.cerrado ? " ag-cerrado" : ""}`}>
      <div className="ag-dia-cab"><span>{DIAS[k]}</span>{x.cerrado ? <Badge tono="neutral">Cerrado</Badge> : <Badge tono="ok">{x.abre}–{x.cierra}</Badge>}</div>
      {editable ? (
        <>
          {!x.cerrado && <div className="ag-horas"><Input type="time" value={x.abre} onChange={(e) => setX({ ...x, abre: e.target.value })} aria-label="Abre" /><span className="mu">a</span><Input type="time" value={x.cierra} onChange={(e) => setX({ ...x, cierra: e.target.value })} aria-label="Cierra" /></div>}
          <label className="ag-check"><input type="checkbox" checked={x.cerrado} onChange={(e) => setX({ ...x, cerrado: e.target.checked })} /> No abre este día</label>
          {cambio && <Button variante="primary" onClick={guardar}>Guardar {DIAS[k].toLowerCase()}</Button>}
        </>
      ) : null}
    </div>
  );
}
export function HorarioSucursal({ d, u, sucursalId }) {
  const editable = G.gestiona(u, sucursalId);
  const lista = (d.agenda && d.agenda.horariosSucursal) || [];
  const fuera = useMemo(() => G.citasFueraDeHorario(d, { sucursalId }), [d, sucursalId]);
  return (
    <div className="ag-sec">
      <Regla id="P-047">Horario de atención de {nomSuc(d, sucursalId)}. Ninguna cita se agenda fuera de él. {editable ? "Puedes editarlo." : "Solo consulta: lo edita el gerente de la sucursal o Administración."}</Regla>
      <div className="ag-dias">{ORDEN_DIAS.map((k) => { const h = lista.find((x) => x.sucursalId === sucursalId && x.dia === k); return <DiaSucursal key={`${sucursalId}-${k}-${h ? `${h.abre}${h.cierra}${h.cerrado}` : ""}`} sucursalId={sucursalId} k={k} h={h} editable={editable} />; })}</div>
      <CitasFuera d={d} fuera={fuera} />
    </div>
  );
}
function CitasFuera({ d, fuera }) {
  if (!fuera.length) return null;
  return (
    <Card tono="warn">
      <b>{fuera.length} cita(s) pendientes ya no caben en el horario vigente</b>
      <p className="peq mu">Reprograma o avisa a esos pacientes desde la agenda de recepción.</p>
      <div className="lista">{fuera.slice(0, 8).map(({ cita, v }) => <Fila key={cita.id} titulo={nomPac(d, cita.pacienteId)} sub={`${fechaLarga(dia(cita.inicio))} · ${hora(cita.inicio)} · ${nomUsr(d, cita.podologoId)}`} datos={<span>{v.textos[0]}</span>} />)}</div>
    </Card>
  );
}

// ═════════════════════════ Jornada y rotación de los podólogos
function DiaPodologo({ podologoId, k, h, editable }) {
  const ini = { descanso: !!h?.descanso, turnos: h?.turnos?.length ? h.turnos.map((t) => ({ ...t })) : [{ de: "09:00", a: "14:00" }] };
  const [x, setX] = useState(ini);
  const cambio = JSON.stringify(x) !== JSON.stringify(ini) || !h;
  const setT = (i, campo, v) => setX({ ...x, turnos: x.turnos.map((t, j) => (j === i ? { ...t, [campo]: v } : t)) });
  const guardar = () => correr((d) => G.guardarHorarioPodologo(d, { podologoId, dia: k, ...x }), (r) => `Jornada del ${DIAS[k].toLowerCase()} guardada${r.afectadas ? ` · ${r.afectadas} cita(s) por reprogramar` : ""}.`);
  return (
    <div className={`ag-dia${x.descanso ? " ag-cerrado" : ""}`}>
      <div className="ag-dia-cab"><span>{DIAS[k]}</span>{x.descanso ? <Badge tono="neutral">Descanso</Badge> : <span className="peq">{x.turnos.map((t) => `${t.de}–${t.a}`).join(" y ")}</span>}</div>
      {editable && (
        <>
          {!x.descanso && x.turnos.map((t, i) => (
            <div key={i} className="ag-horas"><Input type="time" value={t.de} onChange={(e) => setT(i, "de", e.target.value)} aria-label="Desde" /><span className="mu">a</span><Input type="time" value={t.a} onChange={(e) => setT(i, "a", e.target.value)} aria-label="Hasta" /></div>
          ))}
          {!x.descanso && <div className="ag-acciones">
            {x.turnos.length < 3 && <Button variante="ghost" icon="plus" onClick={() => setX({ ...x, turnos: [...x.turnos, { de: "15:00", a: "18:00" }] })}>Turno</Button>}
            {x.turnos.length > 1 && <Button variante="ghost" icon="x" onClick={() => setX({ ...x, turnos: x.turnos.slice(0, -1) })}>Quitar turno</Button>}
          </div>}
          <label className="ag-check"><input type="checkbox" checked={x.descanso} onChange={(e) => setX({ ...x, descanso: e.target.checked })} /> Día de descanso</label>
          {cambio && <Button onClick={guardar}>Guardar {DIAS[k].toLowerCase()}</Button>}
        </>
      )}
    </div>
  );
}
function Rotacion({ d, p, editable }) {
  const r = ((d.agenda && d.agenda.rotacion) || []).find((x) => x.podologoId === p.id);
  const [modo, setModo] = useState(r?.modo || "alterna");
  const [ancla, setAncla] = useState(r?.ancla || hoy());
  const [orden, setOrden] = useState(r?.sucursales?.length ? r.sucursales : p.sucursales);
  const [porDia, setPorDia] = useState(r?.porDia || {});
  const hoyEn = G.sucursalDelPodologo(d, p.id, hoy());
  const guardar = () => correr((dd) => G.guardarRotacion(dd, { podologoId: p.id, modo, ancla, sucursales: orden, porDia }), (x) => `Rotación guardada${x.afectadas ? ` · ${x.afectadas} cita(s) por reprogramar` : ""}.`);
  return (
    <Card>
      <b>Rotación entre sucursales</b>
      <p className="peq mu">Hoy atiende en <b>{hoyEn ? nomSuc(d, hoyEn) : "cualquiera de sus sucursales"}</b>. Sucursales asignadas: {p.sucursales.map((s) => nomSuc(d, s)).join(", ")}.</p>
      {editable ? (
        <div className="ag-form">
          <Chips opciones={[{ v: "alterna", l: "Días alternos" }, { v: "fija", l: "Fija por día" }]} valor={modo} onChange={setModo} />
          {modo === "alterna" ? (
            <>
              <Field label="A partir de (día en que va a la primera)"><Input type="date" value={ancla} onChange={(e) => setAncla(e.target.value)} /></Field>
              <div className="ag-barra"><span className="peq">Orden: {orden.map((s) => nomSuc(d, s)).join(" → ")}</span>{orden.length > 1 && <Button variante="ghost" icon="repeat" onClick={() => setOrden([...orden].reverse())}>Invertir</Button>}</div>
            </>
          ) : (
            <div className="ag-dias">{ORDEN_DIAS.map((k) => (
              <Field key={k} label={DIAS[k]}><Select value={porDia[k] || ""} onChange={(e) => setPorDia({ ...porDia, [k]: e.target.value || null })}><option value="">— sin asignar —</option>{p.sucursales.map((s) => <option key={s} value={s}>{nomSuc(d, s)}</option>)}</Select></Field>
            ))}</div>
          )}
          <Button onClick={guardar}>Guardar rotación</Button>
        </div>
      ) : <p className="peq">{r ? (r.modo === "alterna" ? `Días alternos desde ${r.ancla}: ${r.sucursales.map((s) => nomSuc(d, s)).join(" / ")}` : "Sucursal fija por día de la semana") : "Sin rotación capturada."}</p>}
    </Card>
  );
}
export function HorarioPodologos({ d, u, sucursalId }) {
  const pods = G.podologosDe(d, sucursalId);
  const [sel, setSel] = useState(null);
  const p = pods.find((x) => x.id === sel) || null;
  const editable = G.gestiona(u, sucursalId);
  const lista = (d.agenda && d.agenda.horariosPodologo) || [];
  if (!p) return (
    <div className="ag-sec">
      <Regla id="P-047">Jornada de cada podólogo y la sucursal donde atiende cada día. Los huecos de la agenda salen de aquí.</Regla>
      <Vista id="agenda-podologos" items={pods} onAbrir={(x) => setSel(x.id)} vacio="No hay podólogos en esta sucursal."
        tarjeta={(x) => { const j = G.jornadaPodologo(d, x.id, hoy(), sucursalId); return <div className="persona"><div className="persona-n">{x.nombre}</div><div className="persona-s">{x.sucursales.map((s) => nomSuc(d, s)).join(" · ")}</div><div className="peq mu">Hoy: {j.descanso ? "descanso" : `${j.sucursalId ? nomSuc(d, j.sucursalId) : "—"} · ${j.turnos.map((t) => `${G.aHora(t.de)}–${G.aHora(t.a)}`).join(" y ")}`}</div></div>; }}
        columnas={[{ k: "n", t: "Podólogo", v: (x) => x.nombre }, { k: "s", t: "Sucursales", v: (x) => x.sucursales.map((s) => nomSuc(d, s)).join(", ") }, { k: "h", t: "Hoy en", v: (x) => { const s = G.sucursalDelPodologo(d, x.id, hoy()); return s ? nomSuc(d, s) : "—"; } }]} />
    </div>
  );
  return (
    <div className="ag-sec">
      <div className="ag-barra"><Button variante="ghost" icon="back" onClick={() => setSel(null)}>Podólogos</Button><b>{p.nombre}</b></div>
      <Rotacion key={p.id} d={d} p={p} editable={editable} />
      <Titulo>Jornada semanal</Titulo>
      <div className="ag-dias">{ORDEN_DIAS.map((k) => { const h = lista.find((x) => x.podologoId === p.id && x.dia === k); return <DiaPodologo key={`${p.id}-${k}-${JSON.stringify(h || {})}`} podologoId={p.id} k={k} h={h} editable={editable} />; })}</div>
      <CitasFuera d={d} fuera={G.citasFueraDeHorario(d, { podologoId: p.id })} />
    </div>
  );
}

// ═════════════════════════ Bloqueos
const enSucursal = (d, b, sucursalId) => b.sucursalId === sucursalId || (b.ambito === "podologo" && (d.usuarios.find((x) => x.id === b.podologoId)?.sucursales || []).includes(sucursalId));
export function FormBloqueo({ d, u, sucursalId, abierto, onClose, soloPropio = false, podologoId = null }) {
  const vacio = { ambito: soloPropio || podologoId ? "podologo" : "sucursal", podologoId: soloPropio ? u.id : podologoId || "", consultorioId: "", tipo: soloPropio ? "vacaciones" : "junta", f1: hoy(), h1: "09:00", f2: hoy(), h2: "18:00", todoDia: soloPropio, motivo: "" };
  const [x, setX] = useState(vacio);
  const suc = d.sucursales.find((s) => s.id === sucursalId);
  const pods = G.podologosDe(d, sucursalId);
  const b = { ambito: x.ambito, sucursalId, podologoId: x.podologoId || null, consultorioId: x.consultorioId || null, inicio: `${x.f1}T${x.todoDia ? "00:00" : x.h1}`, fin: `${x.f2}T${x.todoDia ? "23:59" : x.h2}` };
  const afectadas = x.f1 && x.f2 && b.fin > b.inicio ? G.citasAfectadasPorBloqueo(d, b) : [];
  const guardar = () => {
    const r = correr((dd) => G.crearBloqueo(dd, { ...b, tipo: x.tipo, motivo: x.motivo }), (r) => (r.estado === "autorizado" ? "Bloqueo registrado y autorizado." : "Solicitud enviada: la autoriza el gerente o Administración."));
    if (r.ok) { setX(vacio); onClose(); }
  };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={soloPropio ? "Solicitar bloqueo de mi agenda" : "Nuevo bloqueo"} pie={<Button block onClick={guardar}>{soloPropio ? "Enviar solicitud" : "Guardar bloqueo"}</Button>}>
      <div className="ag-form dos-col">
        {!soloPropio && <Field label="Aplica a"><Select value={x.ambito} onChange={(e) => setX({ ...x, ambito: e.target.value })}>{Object.entries(G.AMBITOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>}
        {!soloPropio && x.ambito === "podologo" && <Field label="Podólogo"><Select value={x.podologoId} onChange={(e) => setX({ ...x, podologoId: e.target.value })}><option value="">Elige…</option>{pods.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>}
        {!soloPropio && x.ambito === "consultorio" && <Field label="Consultorio"><Select value={x.consultorioId} onChange={(e) => setX({ ...x, consultorioId: e.target.value })}><option value="">Elige…</option>{(suc?.consultorios || []).map((c) => <option key={c} value={c}>Consultorio {c}</option>)}</Select></Field>}
        <Field label="Tipo"><Select value={x.tipo} onChange={(e) => setX({ ...x, tipo: e.target.value })}>{Object.entries(G.TIPOS_BLOQUEO).filter(([k]) => !soloPropio || ["vacaciones", "permiso", "capacitacion", "otro"].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <label className="ag-check ancho"><input type="checkbox" checked={x.todoDia} onChange={(e) => setX({ ...x, todoDia: e.target.checked })} /> Días completos</label>
        <Field label="Desde"><Input type="date" value={x.f1} onChange={(e) => setX({ ...x, f1: e.target.value, f2: e.target.value > x.f2 ? e.target.value : x.f2 })} /></Field>
        {!x.todoDia && <Field label="Hora de inicio"><Input type="time" value={x.h1} onChange={(e) => setX({ ...x, h1: e.target.value })} /></Field>}
        <Field label="Hasta"><Input type="date" value={x.f2} min={x.f1} onChange={(e) => setX({ ...x, f2: e.target.value })} /></Field>
        {!x.todoDia && <Field label="Hora de fin"><Input type="time" value={x.h2} onChange={(e) => setX({ ...x, h2: e.target.value })} /></Field>}
        <div className="ancho"><Field label={soloPropio ? "Motivo (obligatorio)" : "Motivo"}><Area value={x.motivo} onChange={(e) => setX({ ...x, motivo: e.target.value })} placeholder="Vacaciones, junta, mantenimiento del sillón…" /></Field></div>
      </div>
      {afectadas.length > 0 && <div className="ag-err">{afectadas.length} cita(s) pendientes caen en ese horario y habrá que reprogramarlas: {afectadas.slice(0, 4).map((c) => `${nomPac(d, c.pacienteId)} (${c.inicio.replace("T", " ")})`).join(", ")}{afectadas.length > 4 ? "…" : ""}.</div>}
    </Sheet>
  );
}
function DetalleBloqueo({ d, u, b, onClose }) {
  const [motivo, setMotivo] = useState("");
  if (!b) return null;
  const puede = G.esCentral(u) || (u.rol === "gerente" && (b.ambito === "podologo" ? (d.usuarios.find((x) => x.id === b.podologoId)?.sucursales || []).some((s) => u.sucursales.includes(s)) : u.sucursales.includes(b.sucursalId)));
  const afect = G.citasAfectadasPorBloqueo(d, b);
  const resolver = (dec) => { const r = correr((dd) => G.resolverBloqueo(dd, b.id, dec, motivo), dec === "autorizado" ? "Bloqueo autorizado." : "Bloqueo rechazado."); if (r.ok) onClose(); };
  const cancelar = () => { const r = correr((dd) => G.cancelarBloqueo(dd, b.id), "Bloqueo cancelado."); if (r.ok) onClose(); };
  const vigente = ["solicitado", "autorizado"].includes(b.estado);
  return (
    <Sheet abierto onClose={onClose} titulo={G.etiquetaBloqueo(d, b)}>
      <Resumen filas={[["Estado", <Est mapa={G.ESTADOS_BLOQUEO} k={b.estado} />], ["Desde", b.inicio.replace("T", " ")], ["Hasta", b.fin.replace("T", " ")], ["Motivo", b.motivo || "—"], ["Solicitó", `${nomUsr(d, b.solicitadoPor)} · ${String(b.solicitadoEn || "").replace("T", " ")}`], b.resueltoPor && ["Resolvió", `${nomUsr(d, b.resueltoPor)}${b.motivoResolucion ? ` · ${b.motivoResolucion}` : ""}`]]} />
      <Titulo>Citas afectadas</Titulo>
      {afect.length ? <div className="lista">{afect.map((c) => <Fila key={c.id} titulo={nomPac(d, c.pacienteId)} sub={`${c.inicio.replace("T", " ")} · ${nomSv(d, c.servicioId)}`} badge={<Est mapa={ESTADO_CITA} k={c.estado} />} />)}</div> : <p className="peq mu">No hay citas afectadas.</p>}
      {afect.length > 0 && <p className="peq mu">Reprograma o avisa a esos pacientes desde la agenda de recepción.</p>}
      {b.estado === "solicitado" && puede && (
        <div className="ag-form">
          <Field label="Motivo (obligatorio si rechazas)"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
          <div className="dos"><Button variante="sec" onClick={() => resolver("rechazado")}>Rechazar</Button><Button variante="ok" onClick={() => resolver("autorizado")}>Autorizar</Button></div>
        </div>
      )}
      {vigente && (puede || b.solicitadoPor === u.id) && <Button variante="danger" block onClick={cancelar}>Cancelar bloqueo</Button>}
    </Sheet>
  );
}
export function Bloqueos({ d, u, sucursalId }) {
  const [filtro, setFiltro] = useState("vigentes");
  const [nuevo, setNuevo] = useState(false);
  const [sel, setSel] = useState(null);
  const ahora = ahoraLocal();
  const todos = ((d.agenda && d.agenda.bloqueos) || []).filter((b) => enSucursal(d, b, sucursalId));
  const grupos = {
    vigentes: todos.filter((b) => ["solicitado", "autorizado"].includes(b.estado) && b.fin >= ahora),
    solicitados: todos.filter((b) => b.estado === "solicitado"),
    historial: todos.filter((b) => !["solicitado", "autorizado"].includes(b.estado) || b.fin < ahora),
  };
  const items = [...grupos[filtro]].sort((a, b) => (filtro === "historial" ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio)));
  const puedeCrear = G.gestiona(u, sucursalId);
  const b = sel && todos.find((x) => x.id === sel);
  return (
    <div className="ag-sec">
      <Regla id="P-047">Vacaciones, juntas, mantenimiento y capacitación bloquean la agenda: no se pueden agendar citas encima de un bloqueo autorizado. El podólogo solicita los suyos desde «Mi agenda».</Regla>
      <div className="ag-barra">
        <Chips opciones={[{ v: "vigentes", l: "Vigentes", n: grupos.vigentes.length }, { v: "solicitados", l: "Por autorizar", n: grupos.solicitados.length }, { v: "historial", l: "Historial", n: grupos.historial.length }]} valor={filtro} onChange={setFiltro} scroll />
        {puedeCrear && <Button icon="plus" onClick={() => setNuevo(true)}>Bloqueo</Button>}
      </div>
      <Vista id="agenda-bloqueos" items={items} onAbrir={(x) => setSel(x.id)} vacio="Sin bloqueos en este filtro."
        tarjeta={(x) => <div><div className="fila-t"><span>{G.TIPOS_BLOQUEO[x.tipo]}</span><Est mapa={G.ESTADOS_BLOQUEO} k={x.estado} /></div><div className="fila-s">{G.etiquetaBloqueo(d, x).split(" · ").slice(1).join(" · ")}</div><div className="peq">{x.inicio.replace("T", " ")} → {x.fin.replace("T", " ")}</div>{x.motivo && <div className="peq mu">{x.motivo}</div>}{G.citasAfectadasPorBloqueo(d, x).length > 0 && <Badge tono="bad">{G.citasAfectadasPorBloqueo(d, x).length} cita(s) afectadas</Badge>}</div>}
        columnas={[{ k: "t", t: "Tipo", v: (x) => G.TIPOS_BLOQUEO[x.tipo] }, { k: "a", t: "Aplica a", v: (x) => G.etiquetaBloqueo(d, x).split(" · ").slice(1).join(" · ") }, { k: "i", t: "Desde", v: (x) => x.inicio.replace("T", " ") }, { k: "f", t: "Hasta", v: (x) => x.fin.replace("T", " ") }, { k: "m", t: "Motivo", v: (x) => x.motivo || "—" }, { k: "e", t: "Estado", v: (x) => <Est mapa={G.ESTADOS_BLOQUEO} k={x.estado} />, orden: (x) => x.estado }]} />
      {nuevo && <FormBloqueo d={d} u={u} sucursalId={sucursalId} abierto={nuevo} onClose={() => setNuevo(false)} />}
      {b && <DetalleBloqueo d={d} u={u} b={b} onClose={() => setSel(null)} />}
    </div>
  );
}

// ═════════════════════════ Festivos
function FormFestivo({ d, u, sucursalId, festivo, onClose }) {
  const central = G.esCentral(u);
  const [x, setX] = useState(festivo ? { fecha: festivo.fecha, nombre: festivo.nombre, sucursalId: festivo.sucursalId || "", abre: !!festivo.abre, nota: festivo.nota || "" } : { fecha: hoy(), nombre: "", sucursalId: central ? "" : sucursalId, abre: false, nota: "" });
  const guardar = () => { const r = correr((dd) => G.guardarFestivo(dd, { id: festivo?.id || null, ...x, sucursalId: x.sucursalId || null }), (r) => `Festivo guardado${r.afectadas ? ` · ${r.afectadas} cita(s) por reprogramar` : ""}.`); if (r.ok) onClose(); };
  const quitar = () => { const r = correr((dd) => G.quitarFestivo(dd, festivo.id), "Festivo eliminado."); if (r.ok) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo={festivo ? "Editar festivo" : "Agregar festivo"} pie={<div className="dos">{festivo ? <Button variante="danger" onClick={quitar}>Eliminar</Button> : <span />}<Button onClick={guardar}>Guardar</Button></div>}>
      <div className="ag-form dos-col">
        <Field label="Fecha"><Input type="date" value={x.fecha} onChange={(e) => setX({ ...x, fecha: e.target.value })} /></Field>
        <Field label="Aplica a"><Select value={x.sucursalId} onChange={(e) => setX({ ...x, sucursalId: e.target.value })} disabled={!central}>{central && <option value="">Todas las sucursales</option>}{d.sucursales.filter((s) => central || u.sucursales.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
        <div className="ancho"><Field label="Nombre"><Input value={x.nombre} onChange={(e) => setX({ ...x, nombre: e.target.value })} placeholder="Día de la Revolución" /></Field></div>
        <label className="ag-check ancho"><input type="checkbox" checked={x.abre} onChange={(e) => setX({ ...x, abre: e.target.checked })} /> La sucursal abre ese día (guardia)</label>
        <div className="ancho"><Field label="Nota"><Input value={x.nota} onChange={(e) => setX({ ...x, nota: e.target.value })} /></Field></div>
      </div>
    </Sheet>
  );
}
export function Festivos({ d, u, sucursalId }) {
  const anio = Number(hoy().slice(0, 4));
  const [a, setA] = useState(anio);
  const [edit, setEdit] = useState(null);
  const central = G.esCentral(u);
  const puedeSuc = central || (u.rol === "gerente" && u.sucursales.includes(sucursalId));
  const items = ((d.agenda && d.agenda.festivos) || []).filter((f) => f.fecha.startsWith(String(a)) && (!f.sucursalId || f.sucursalId === sucursalId));
  const puedeEditar = (f) => central || (puedeSuc && f.sucursalId === sucursalId);
  return (
    <div className="ag-sec">
      <Regla id="P-047">Días de descanso obligatorio (art. 74 de la Ley Federal del Trabajo) y festivos locales. En un festivo que cierra no se agenda; si ya había citas se trabaja con guardia.</Regla>
      <div className="ag-barra">
        <Chips opciones={[anio, anio + 1].map((y) => ({ v: y, l: String(y) }))} valor={a} onChange={setA} />
        {central && <Button variante="sec" icon="download" onClick={() => correr((dd) => G.cargarFestivosOficiales(dd, a), (r) => `${r.agregados} festivo(s) oficiales agregados.`)}>Cargar oficiales {a}</Button>}
        {puedeSuc && <Button icon="plus" onClick={() => setEdit("nuevo")}>Festivo</Button>}
      </div>
      <Vista id="agenda-festivos" items={items} inicial="renglones" onAbrir={(f) => puedeEditar(f) && setEdit(f.id)} vacio="Sin festivos capturados en este año."
        tarjeta={(f) => <div><div className="fila-t"><span>{f.nombre}</span>{f.abre ? <Badge tono="ok">Abre</Badge> : <Badge tono="bad">Cierra</Badge>}</div><div className="fila-s">{fechaLarga(f.fecha)}</div><div className="peq mu">{f.sucursalId ? nomSuc(d, f.sucursalId) : "Todas las sucursales"}{f.oficial ? " · oficial" : ""}</div>{f.nota && <div className="peq mu">{f.nota}</div>}</div>}
        columnas={[{ k: "f", t: "Fecha", v: (f) => fechaLarga(f.fecha), orden: (f) => f.fecha }, { k: "n", t: "Festivo", v: (f) => f.nombre }, { k: "o", t: "Tipo", v: (f) => (f.oficial ? "Oficial (LFT)" : "Costumbre / local") }, { k: "s", t: "Aplica a", v: (f) => (f.sucursalId ? nomSuc(d, f.sucursalId) : "Todas") }, { k: "a", t: "Sucursal", v: (f) => (f.abre ? <Badge tono="ok">Abre</Badge> : <Badge tono="bad">Cierra</Badge>), orden: (f) => (f.abre ? 1 : 0) }, { k: "x", t: "Nota", v: (f) => f.nota || "" }]} />
      {edit && <FormFestivo d={d} u={u} sucursalId={sucursalId} festivo={edit === "nuevo" ? null : items.find((f) => f.id === edit)} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ═════════════════════════ Parámetros (solo Administración / Dirección)
export function ParametrosAgenda({ d, u }) {
  const P = G.paramsAgenda(d);
  const [x, setX] = useState(() => Object.fromEntries(Object.keys(G.PARAMS_AGENDA).map((k) => [k, String(P[k])])));
  const editable = G.esCentral(u);
  return (
    <div className="ag-sec">
      <Regla id="REGLAS">Parámetros de la agenda para las 7 sucursales. {editable ? "Los cambios quedan en la bitácora." : "Solo Administración o Dirección los modifican."}</Regla>
      <div className="ag-form dos-col">
        {Object.entries(G.ETIQUETA_PARAM).map(([k, [l, id]]) => <Field key={k} label={`${l} · ${id}`}><Input type="number" inputMode="numeric" min="0" value={x[k]} disabled={!editable} onChange={(e) => setX({ ...x, [k]: e.target.value })} /></Field>)}
      </div>
      {editable && <Button onClick={() => correr((dd) => G.guardarParams(dd, x), (r) => (r.cambios ? `${r.cambios} parámetro(s) actualizados.` : "Sin cambios."))}>Guardar parámetros</Button>}
    </div>
  );
}

export function Vacia() { return <Vacio icon="building">Elige una sucursal.</Vacio>; }
