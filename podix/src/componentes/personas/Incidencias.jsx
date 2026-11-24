// Pestañas «Incidencias» y «Vacaciones»: alta/solicitud, aprobación por gerente o administración y saldo por antigüedad.
import { useMemo, useState } from "react";
import { Badge, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Area, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista, { Foto } from "../../ui/vista.jsx";
import { hoy, fechaCorta, sumarDias } from "../../lib/format.js";
import * as A from "../../store/acciones_personas.js";
import { ETQ_SOL, TONO_SOL, Nota, Aviso, esRes, Barra } from "./comunes.jsx";

const nombreDe = (d, id) => (d.usuarios.find((x) => x.id === id) || {}).nombre || "—";
const tipoL = (t) => (A.TIPOS_INCIDENCIA.find((x) => x.v === t) || {}).l || t;

export function Incidencias({ d, u, empleados }) {
  const [est, setEst] = useState("solicitada");
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(false);
  const ids = new Set(empleados.map((e) => e.id));
  const emp = (id) => d.rh.empleados.find((e) => e.id === id);
  const lista = useMemo(() => {
    const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return d.rh.incidencias.filter((i) => ids.has(i.empleadoId) && (est === "todas" || i.estado === est) && (!q || n(`${emp(i.empleadoId)?.nombre} ${i.detalle} ${tipoL(i.tipo)}`).includes(n(q))));
  }, [d.rh.incidencias, est, q, empleados]); // eslint-disable-line react-hooks/exhaustive-deps
  const pend = d.rh.incidencias.filter((i) => ids.has(i.empleadoId) && i.estado === "solicitada").length;
  const resolver = (id, decision) => { if (esRes(A.resolverIncidencia({ id, decision }))) aviso(decision === "aprobada" ? "Incidencia aprobada." : "Incidencia rechazada.", decision === "aprobada" ? "ok" : "warn"); };

  return (
    <>
      <div className="pp-filtros" style={{ gridTemplateColumns: undefined }}>
        <Buscador valor={q} onChange={setQ} placeholder="Buscar por persona o detalle…" />
        <Button icon="plus" onClick={() => setNueva(true)}>Nueva incidencia</Button>
      </div>
      <Chips valor={est} onChange={setEst} opciones={[{ v: "solicitada", l: "Por aprobar", n: pend }, { v: "aprobada", l: "Aprobadas" }, { v: "registrada", l: "Registradas" }, { v: "rechazada", l: "Rechazadas" }, { v: "todas", l: "Todas" }]} />
      {!lista.length ? <Vacio icon="clipboard">Sin incidencias en esta vista.</Vacio> : (
        <div className="lista">
          {lista.map((i) => {
            const e = emp(i.empleadoId);
            const puede = i.estado === "solicitada" && A.puedeGestionarEmpleado(u, e) && e.usuarioId !== u.id;
            return (
              <Card key={i.id}>
                <div className="fila-flex"><Foto nombre={e.nombre} src={e.foto} size={40} /><div style={{ flex: 1, minWidth: 0 }}><b>{e.nombre}</b><div className="mu peq">{tipoL(i.tipo)} · {fechaCorta(i.desde)}{i.hasta !== i.desde ? ` a ${fechaCorta(i.hasta)}` : ""}</div></div><Badge tono={TONO_SOL[i.estado]}>{ETQ_SOL[i.estado]}</Badge></div>
                <p style={{ margin: "8px 0 0" }}>{i.detalle}</p>
                <div className="mu peq" style={{ marginTop: 4 }}>Registró: {nombreDe(d, i.usuarioId)} · {A.nombreSuc(d, i.sucursalId)}</div>
                {puede && <div className="pp-acciones"><Button variante="ok" icon="check" onClick={() => resolver(i.id, "aprobada")}>Aprobar</Button><Button variante="danger" icon="x" onClick={() => resolver(i.id, "rechazada")}>Rechazar</Button></div>}
              </Card>);
          })}
        </div>)}
      <NuevaIncidencia d={d} u={u} empleados={empleados} abierto={nueva} onClose={() => setNueva(false)} />
    </>
  );
}

function NuevaIncidencia({ d, u, empleados, abierto, onClose }) {
  const vacio = { empleadoId: "", tipo: "permiso", desde: hoy(), hasta: "", detalle: "" };
  const [v, setV] = useState(vacio);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const activos = empleados.filter((e) => e.estado === "activo");
  const ok = () => { const r = A.registrarIncidencia({ ...v, hasta: v.hasta || v.desde }); if (esRes(r)) { aviso(r.incidencia.estado === "solicitada" ? "Solicitud enviada para aprobación." : "Incidencia registrada."); setV(vacio); onClose(); } };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Nueva incidencia" pie={<Button block onClick={ok}>Guardar</Button>}>
      <Field label="Persona"><Select value={v.empleadoId} onChange={set("empleadoId")}><option value="">Elige…</option>{activos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select></Field>
      <Field label="Tipo"><Select value={v.tipo} onChange={set("tipo")}>{A.TIPOS_INCIDENCIA.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</Select></Field>
      <div className="form2"><Field label="Desde"><Input type="date" value={v.desde} onChange={set("desde")} /></Field><Field label="Hasta (opcional)"><Input type="date" value={v.hasta} min={v.desde} onChange={set("hasta")} /></Field></div>
      <Field label="Detalle"><Area value={v.detalle} onChange={set("detalle")} placeholder="Qué pasó, folio de incapacidad, motivo del permiso…" /></Field>
      <Nota>Permisos, incapacidades y faltas justificadas cubren esos días (no cuentan como falta en la nómina). Llamadas de atención y actas solo se registran.</Nota>
    </Sheet>
  );
}

export function Vacaciones({ d, u, empleados }) {
  const [nueva, setNueva] = useState(false);
  const [rechazo, setRechazo] = useState(null);
  const [motivo, setMotivo] = useState("");
  const f = hoy();
  const ids = new Set(empleados.map((e) => e.id));
  const emp = (id) => d.rh.empleados.find((e) => e.id === id);
  const activos = empleados.filter((e) => e.estado === "activo");
  const pend = d.rh.vacaciones.filter((v) => ids.has(v.empleadoId) && v.estado === "solicitada").sort((a, b) => a.desde.localeCompare(b.desde));
  const hoyVac = d.rh.vacaciones.filter((v) => ids.has(v.empleadoId) && v.estado === "aprobada" && v.desde <= f && v.hasta >= f);
  const prox = d.rh.vacaciones.filter((v) => ids.has(v.empleadoId) && v.estado === "aprobada" && v.desde > f && v.desde <= sumarDias(f, 30));
  const saldos = activos.map((e) => ({ id: e.id, e, s: A.saldoVacaciones(d, e) }));
  const resolver = (id, decision, m = "") => { const r = A.resolverVacaciones({ id, decision, motivo: m }); if (esRes(r)) { aviso(decision === "aprobada" ? "Vacaciones aprobadas." : "Solicitud rechazada.", decision === "aprobada" ? "ok" : "warn"); setRechazo(null); setMotivo(""); } };

  return (
    <>
      <div className="pp-kpis">
        <Kpi label="Por aprobar" valor={pend.length} tono={pend.length ? "warn" : "ok"} /><Kpi label="De vacaciones hoy" valor={hoyVac.length} tono="info" /><Kpi label="Próximos 30 días" valor={prox.length} />
      </div>
      <div className="fila-flex"><Button icon="plus" onClick={() => setNueva(true)}>Registrar solicitud</Button></div>
      <Nota>Días de vacaciones por antigüedad según la Ley Federal del Trabajo (art. 76, reforma 2023): 12 al primer año, +2 por año hasta 20 al quinto; luego 22 (6.º a 10.º) y +2 cada cinco años. Prima vacacional mínima del 25 %. Criterio por validar con contador.</Nota>

      <Titulo>Solicitudes por aprobar</Titulo>
      {!pend.length ? <Vacio icon="calendar">No hay solicitudes pendientes.</Vacio> : (
        <div className="lista">
          {pend.map((v) => { const e = emp(v.empleadoId); const s = A.saldoVacaciones(d, e); const puede = A.puedeGestionarEmpleado(u, e) && e.usuarioId !== u.id; return (
            <Card key={v.id}>
              <div className="fila-flex"><Foto nombre={e.nombre} src={e.foto} size={40} /><div style={{ flex: 1, minWidth: 0 }}><b>{e.nombre}</b><div className="mu peq">{v.desde} a {v.hasta} · {v.dias} días laborables</div></div><Badge tono="warn">Por aprobar</Badge></div>
              <div className="mu peq" style={{ marginTop: 6 }}>Saldo {s.saldo} de {s.derecho} días · {v.nota || "sin nota"} · solicitó {nombreDe(d, v.usuarioId)}</div>
              {puede ? <div className="pp-acciones"><Button variante="ok" icon="check" onClick={() => resolver(v.id, "aprobada")}>Aprobar</Button><Button variante="danger" icon="x" onClick={() => setRechazo(v)}>Rechazar</Button></div>
                : <div className="mu peq" style={{ marginTop: 6 }}>{e.usuarioId === u.id ? "No puedes aprobar tus propias vacaciones." : "Solo el gerente de la sucursal o administración la aprueban."}</div>}
            </Card>); })}
        </div>)}

      <Titulo>Saldo por persona</Titulo>
      <Vista id="rh-vacaciones" items={saldos} vacio="Sin personas." minTarjeta={260}
        columnas={[
          { k: "n", t: "Empleado", v: (x) => <b>{x.e.nombre}</b>, orden: (x) => x.e.nombre }, { k: "a", t: "Antigüedad", v: (x) => A.antiguedad(x.e.ingreso).texto, orden: (x) => x.e.ingreso },
          { k: "d", t: "Derecho", v: (x) => x.s.derecho, der: true, orden: (x) => x.s.derecho }, { k: "t", t: "Tomados", v: (x) => x.s.tomados, der: true, orden: (x) => x.s.tomados },
          { k: "p", t: "Por aprobar", v: (x) => x.s.pendientes, der: true, orden: (x) => x.s.pendientes }, { k: "s", t: "Saldo", v: (x) => <b>{x.s.saldo}</b>, der: true, orden: (x) => x.s.saldo },
        ]}
        tarjeta={(x) => (
          <div className="pp-pad"><div className="fila-flex"><Foto nombre={x.e.nombre} src={x.e.foto} size={38} /><div style={{ flex: 1, minWidth: 0 }}><b>{x.e.nombre}</b><div className="mu peq">{A.antiguedad(x.e.ingreso).texto}</div></div><Badge tono={x.s.saldo ? "ok" : "neutral"}>{x.s.saldo} d</Badge></div>
            <div style={{ marginTop: 8 }}><Barra pct={x.s.derecho ? (x.s.tomados / x.s.derecho) * 100 : 0} tono="" /></div>
            <div className="mu peq" style={{ marginTop: 4 }}>Derecho {x.s.derecho} · tomados {x.s.tomados} · por aprobar {x.s.pendientes}</div></div>)} />

      <Titulo>Quién está de vacaciones y próximas</Titulo>
      <div className="lista">
        {[...hoyVac, ...prox].map((v) => { const e = emp(v.empleadoId); return <Fila key={v.id} izquierda={<Foto nombre={e.nombre} src={e.foto} size={38} />} titulo={e.nombre} sub={`${v.desde} a ${v.hasta} · ${v.dias} días`} badge={<Badge tono={v.desde <= f ? "info" : "neutral"}>{v.desde <= f ? "De vacaciones hoy" : "Próximas"}</Badge>} />; })}
        {!hoyVac.length && !prox.length && <Vacio icon="calendar">Nadie con vacaciones próximas.</Vacio>}
      </div>

      <NuevaVacacion d={d} empleados={empleados} abierto={nueva} onClose={() => setNueva(false)} />
      <Sheet abierto={!!rechazo} onClose={() => setRechazo(null)} titulo="Rechazar solicitud" pie={<Button variante="danger" block onClick={() => resolver(rechazo.id, "rechazada", motivo)}>Rechazar</Button>}>
        <Field label="Motivo (obligatorio)"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: coincide con inventario general" /></Field>
      </Sheet>
    </>
  );
}

function NuevaVacacion({ d, empleados, abierto, onClose }) {
  const [v, setV] = useState({ empleadoId: "", desde: sumarDias(hoy(), 7), hasta: sumarDias(hoy(), 11), nota: "" });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const e = d.rh.empleados.find((x) => x.id === v.empleadoId);
  const s = e ? A.saldoVacaciones(d, e) : null;
  const dias = e && v.hasta >= v.desde ? A.diasLaborables(d, e.id, v.desde, v.hasta) : 0;
  const ok = () => { const r = A.solicitarVacaciones(v); if (esRes(r)) { aviso("Solicitud registrada: queda por aprobar."); onClose(); } };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Registrar solicitud de vacaciones" pie={<Button block onClick={ok}>Registrar solicitud</Button>}>
      <Field label="Persona"><Select value={v.empleadoId} onChange={set("empleadoId")}><option value="">Elige…</option>{empleados.filter((x) => x.estado === "activo").map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Field>
      <div className="form2"><Field label="Desde"><Input type="date" value={v.desde} onChange={set("desde")} /></Field><Field label="Hasta"><Input type="date" value={v.hasta} min={v.desde} onChange={set("hasta")} /></Field></div>
      <Field label="Nota (opcional)"><Input value={v.nota} onChange={set("nota")} /></Field>
      {e && <Card><div className="pp-dl"><div><span>Días laborables en el periodo</span><b>{dias}</b></div><div><span>Saldo disponible</span><b>{s.disponible} de {s.derecho}</b></div></div>{dias > s.disponible && <div style={{ marginTop: 8 }}><Aviso>No alcanza el saldo para esa duración.</Aviso></div>}</Card>}
    </Sheet>
  );
}
