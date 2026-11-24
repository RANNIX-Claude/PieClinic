// Pestañas «Asistencia» (entradas y salidas por sucursal y fecha) y «Horarios» (quién trabaja dónde cada día).
import { useState } from "react";
import { Badge, Button, Card, Chips, Field, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista, { Foto } from "../../ui/vista.jsx";
import { hoy, fechaCorta, sumarDias, parse } from "../../lib/format.js";
import * as A from "../../store/acciones_personas.js";
import { BadgeEstado, Nota, Aviso, esRes } from "./comunes.jsx";

export function Asistencia({ d, u, sucursalFiltro, visibles }) {
  const [fecha, setFecha] = useState(hoy());
  const [tol, setTol] = useState(null);
  const f = hoy();
  const t = A.asistenciaDia(d, { fecha, sucursalId: sucursalFiltro });
  const filas = t.filas.filter((x) => visibles.includes(x.programada) || (x.registro && visibles.includes(x.registro.sucursalId)));
  const p = A.paramsRH(d);
  const esHoy = fecha === f;
  const sucList = sucursalFiltro ? [sucursalFiltro] : visibles;
  const dentro = (id) => A.quienEstaHoy(d, id, f);

  const marcar = () => { if (!sucursalFiltro) return; const r = A.marcarFaltasDia({ fecha, sucursalId: sucursalFiltro }); if (esRes(r)) aviso(r.n ? `${r.n} falta(s) registradas.` : "No había personas sin registro.", r.n ? "warn" : "ok"); };
  const guardarTol = () => { const r = A.guardarParametrosRH({ toleranciaMin: tol.t, retardosPorFalta: tol.k }); if (esRes(r)) { aviso("Parámetros guardados."); setTol(null); } };

  return (
    <>
      <div className="pp-filtros">
        <Field label="Fecha"><Input type="date" value={fecha} max={sumarDias(f, 7)} onChange={(e) => setFecha(e.target.value || f)} /></Field>
        <div className="fila-flex"><Button variante="sec" onClick={() => setFecha(sumarDias(fecha, -1))}>Día anterior</Button><Button variante="sec" onClick={() => setFecha(f)} disabled={esHoy}>Hoy</Button></div>
        {A.esAdmin(u) && <Button variante="ghost" icon="settings" onClick={() => setTol({ t: p.toleranciaMin, k: p.retardosPorFalta })}>Regla de retardos</Button>}
      </div>
      <Nota>Regla: retardo si la entrada es posterior al horario + {p.toleranciaMin} minutos de tolerancia (parametrizable). Cada {p.retardosPorFalta} retardos descuentan 1 día en la nómina (política de demostración).</Nota>

      <div className="pp-kpis">
        <Kpi label="Esperados" valor={t.resumen.esperados} /><Kpi label="Presentes" valor={t.resumen.presentes} tono="ok" />
        {esHoy && <Kpi label="Dentro ahora" valor={t.resumen.dentro} tono="info" />}
        <Kpi label="Retardos" valor={t.resumen.retardos} tono={t.resumen.retardos ? "warn" : undefined} /><Kpi label="Faltas" valor={t.resumen.faltas} tono={t.resumen.faltas ? "bad" : undefined} />
        <Kpi label={esHoy ? "Aún sin entrada" : "Sin registro"} valor={t.resumen.sinRegistro} tono={t.resumen.sinRegistro ? "warn" : undefined} />
      </div>

      {esHoy && (<>
        <Titulo>Quién está hoy en cada sucursal</Titulo>
        <div className="pp-grid">
          {sucList.map((id) => { const l = dentro(id); return (
            <Card key={id} className="pp-sec"><h3>{A.nombreSuc(d, id)} <Badge tono={l.length ? "ok" : "neutral"}>{l.length} dentro</Badge></h3>
              {!l.length ? <span className="mu peq">Nadie ha registrado entrada.</span> : <div className="pp-presentes">{l.map((x) => (
                <div className="pp-pres-i" key={x.registro.id}><Foto nombre={x.empleado.nombre} src={x.empleado.foto} size={32} /><span style={{ minWidth: 0 }}><b>{x.empleado.nombre}</b><br /><span className="mu peq">desde {x.registro.entrada}{x.registro.estado === "retardo" ? " · retardo" : ""}</span></span></div>))}</div>}
            </Card>); })}
        </div>
      </>)}

      <Titulo derecha={!esHoy && sucursalFiltro && t.resumen.sinRegistro > 0 && A.puedeGestionarEmpleado(u, { sucursales: [sucursalFiltro] }) ? <Button variante="ghost" className="btn-peq" onClick={marcar}>Marcar faltas del día</Button> : null}>Entradas y salidas del día</Titulo>
      {!esHoy && !sucursalFiltro && t.resumen.sinRegistro > 0 && <Aviso>Para marcar faltas elige una sucursal.</Aviso>}
      <Vista id="rh-asistencia" items={filas.map((x) => ({ ...x, id: x.empleado.id }))} vacio="Nadie estaba programado en esta fecha."
        columnas={[
          { k: "n", t: "Empleado", v: (x) => <b>{x.empleado.nombre}</b>, orden: (x) => x.empleado.nombre },
          { k: "p", t: "Programado en", v: (x) => (x.programada ? A.nombreSuc(d, x.programada) : "Descanso") },
          { k: "e", t: "Entrada", v: (x) => (x.registro && x.registro.entrada) || "—", orden: (x) => (x.registro && x.registro.entrada) || "99" },
          { k: "s", t: "Salida", v: (x) => (x.registro && x.registro.salida) || "—" },
          { k: "m", t: "Marcó en", v: (x) => (x.registro ? A.nombreSuc(d, x.registro.sucursalId) : "—") },
          { k: "t", t: "Estado", v: (x) => <BadgeEstado estado={x.estado} />, orden: (x) => x.estado },
        ]}
        tarjeta={(x) => (
          <div className="pp-pad" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Foto nombre={x.empleado.nombre} src={x.empleado.foto} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}><b>{x.empleado.nombre}</b><div className="mu peq">{x.registro && x.registro.entrada ? `${x.registro.entrada} – ${x.registro.salida || "…"} · ${A.nombreSuc(d, x.registro.sucursalId)}` : x.programada ? `Programado en ${A.nombreSuc(d, x.programada)}` : "Descanso"}</div></div>
            <BadgeEstado estado={x.estado} />
          </div>)} />

      <Sheet abierto={!!tol} onClose={() => setTol(null)} titulo="Regla de retardos" pie={<Button block onClick={guardarTol}>Guardar</Button>}>
        {tol && (<>
          <Field label="Tolerancia (minutos)"><Input type="number" inputMode="numeric" min="0" max="60" value={tol.t} onChange={(e) => setTol({ ...tol, t: e.target.value })} /></Field>
          <Field label="Retardos que equivalen a 1 falta (descuento)"><Input type="number" inputMode="numeric" min="1" max="10" value={tol.k} onChange={(e) => setTol({ ...tol, k: e.target.value })} /></Field>
          <Nota>Aplica a todas las sucursales. Los retardos ya registrados no se recalculan.</Nota>
        </>)}
      </Sheet>
    </>
  );
}

// ───────── Horarios / asignaciones por día de la semana
const lunesDe = (x) => { const dw = parse(x).getDay(); return sumarDias(x, dw === 0 ? -6 : 1 - dw); };
const ABR = (d, id) => (id ? A.nombreSuc(d, id).slice(0, 3) : "—");
const DIAS_C = ["L", "M", "M", "J", "V", "S", "D"];

export function Horarios({ d, u, sucursalFiltro, empleados }) {
  const [semana, setSemana] = useState(lunesDe(hoy()));
  const [soloRotan, setSoloRotan] = useState(false);
  const [sel, setSel] = useState(null); // { e, fecha }
  const [alcance, setAlcance] = useState("semanal");
  const [valor, setValor] = useState("");
  const f = hoy();
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(semana, i));
  const lista = empleados.filter((e) => e.estado === "activo" && (!soloRotan || e.sucursales.length > 1) && e.sucursales.length < 7);
  const abrir = (e, fecha) => { setSel({ e, fecha }); setAlcance("semanal"); setValor(A.sucursalHoy(d, e.id, fecha) || ""); };
  const guardar = () => {
    const { e, fecha } = sel;
    const dow = parse(fecha).getDay();
    const r = A.asignarSucursal({ empleadoId: e.id, ...(alcance === "semanal" ? { dow } : { fecha }), sucursalId: valor || null });
    if (esRes(r)) { aviso("Programación guardada."); setSel(null); }
  };
  const quitarExc = () => { const r = A.quitarExcepcion({ empleadoId: sel.e.id, fecha: sel.fecha }); if (esRes(r)) { aviso("Excepción eliminada: rige la programación semanal."); setSel(null); } };
  const tieneExc = (e, fecha) => d.rh.asignaciones.some((a) => a.empleadoId === e.id && a.fecha === fecha);
  const puede = (e) => A.puedeGestionarEmpleado(u, e);

  return (
    <>
      <div className="pp-filtros">
        <div className="fila-flex"><Button variante="sec" icon="back" onClick={() => setSemana(sumarDias(semana, -7))} aria-label="Semana anterior" /><b style={{ flex: 1, textAlign: "center" }}>{fechaCorta(semana)} – {fechaCorta(sumarDias(semana, 6))}</b><Button variante="sec" icon="chevron" onClick={() => setSemana(sumarDias(semana, 7))} aria-label="Semana siguiente" /></div>
        <Chips valor={soloRotan ? "rotan" : "todos"} onChange={(v) => setSoloRotan(v === "rotan")} opciones={[{ v: "todos", l: "Todos" }, { v: "rotan", l: "Solo quienes rotan" }]} />
        <Button variante="ghost" onClick={() => setSemana(lunesDe(f))}>Esta semana</Button>
      </div>
      <Nota>Cada celda es la sucursal donde trabaja esa persona ese día (— = descanso). El borde morado indica una excepción solo para esa fecha. Toca una celda para cambiarla. «Dónde trabaja hoy» se refleja en la tarjeta de la persona.</Nota>
      <div className="pp-grid">
        {!lista.length && <Vacio icon="calendar">No hay personas para mostrar.</Vacio>}
        {lista.map((e) => (
          <Card key={e.id}>
            <div className="fila-flex"><Foto nombre={e.nombre} src={e.foto} size={36} /><div style={{ flex: 1, minWidth: 0 }}><b>{e.nombre}</b><div className="mu peq">{e.puesto} · base {A.nombreSuc(d, e.sucursalBase)}{e.sucursales.length > 1 ? ` · rota entre ${e.sucursales.map((s) => ABR(d, s)).join("/")}` : ""}</div></div></div>
            <div className="pp-semana">
              {fechas.map((x, i) => { const s = A.sucursalHoy(d, e.id, x); return (
                <button key={x} type="button" className={`pp-dia${s ? "" : " desc"}${tieneExc(e, x) ? " exc" : ""}${x === f ? " hoy" : ""}`} onClick={() => abrir(e, x)} disabled={!puede(e)} aria-label={`${fechaCorta(x)}: ${s ? A.nombreSuc(d, s) : "descanso"}`}>
                  {DIAS_C[i]}<small>{parse(x).getDate()}</small>{ABR(d, s)}
                </button>); })}
            </div>
          </Card>))}
      </div>
      <Sheet abierto={!!sel} onClose={() => setSel(null)} titulo={sel ? `${sel.e.nombre} · ${fechaCorta(sel.fecha)}` : ""} pie={<Button block onClick={guardar}>Guardar</Button>}>
        {sel && (<>
          <Field label="Dónde trabaja"><Select value={valor} onChange={(e) => setValor(e.target.value)}><option value="">Descanso</option>{sel.e.sucursales.map((s) => <option key={s} value={s}>{A.nombreSuc(d, s)}</option>)}</Select></Field>
          <Field label="Aplicar a"><Chips valor={alcance} onChange={setAlcance} opciones={[{ v: "semanal", l: `Todos los ${A.NOMBRE_DIA[parse(sel.fecha).getDay()].toLowerCase()}s` }, { v: "fecha", l: "Solo esta fecha" }]} /></Field>
          {tieneExc(sel.e, sel.fecha) && <Button variante="sec" onClick={quitarExc}>Quitar la excepción de esta fecha</Button>}
          <Nota>Solo se pueden elegir sucursales autorizadas para esta persona. Queda en la bitácora.</Nota>
        </>)}
      </Sheet>
    </>
  );
}
