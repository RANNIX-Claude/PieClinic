// Pestaña «Empleados»: indicadores, mosaico con foto / renglones, ficha completa de inicio a fin, alta y baja.
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista, { Foto } from "../../ui/vista.jsx";
import { dinero, hoy, fechaCorta, edad } from "../../lib/format.js";
import { NOMBRE_ROL } from "../../config/roles.js";
import * as A from "../../store/acciones_personas.js";
import { Barra, BadgeEstado, BotonesFoto, ETQ_SOL, TONO_SOL, Nota, Aviso, esRes, Hoja } from "./comunes.jsx";
import ReciboHoja from "./ReciboHoja.jsx";

const ROLES_ALTA = ["recepcion", "podologo", "asistente", "cajero", "almacen", "gerente", "admin"];
const gm = (n) => (n || 0).toLocaleString("es-MX");

export default function Empleados({ d, u, sucursalFiltro, visibles, empleados }) {
  const [q, setQ] = useState("");
  const [est, setEst] = useState("activos");
  const [rol, setRol] = useState("");
  const [selId, setSelId] = useState(null);
  const [alta, setAlta] = useState(false);
  const f = hoy();

  const filtrados = useMemo(() => {
    const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return empleados.filter((e) => (est === "todos" || (est === "activos") === (e.estado === "activo")) && (!rol || e.rol === rol) && (!q || n(`${e.nombre} ${e.puesto}`).includes(n(q))));
  }, [empleados, est, rol, q]);

  const activos = empleados.filter((e) => e.estado === "activo");
  const hoyEst = (e) => A.estadoDia(d, e, f);
  const dentro = activos.filter((e) => { const s = hoyEst(e); return s.registro && s.registro.entrada; }).length;
  const retardos = activos.filter((e) => hoyEst(e).estado === "retardo").length;
  const incompletos = activos.filter((e) => A.avanceExpediente(e).pct < 100).length;
  const porAprobar = d.rh.vacaciones.filter((v) => v.estado === "solicitada" && activos.some((e) => e.id === v.empleadoId)).length + d.rh.incidencias.filter((v) => v.estado === "solicitada" && activos.some((e) => e.id === v.empleadoId)).length;
  const nomMensual = activos.reduce((s, e) => s + e.sueldoMensual, 0);
  const roles = [...new Set(empleados.map((e) => e.rol))];

  if (selId) return <Ficha d={d} u={u} id={selId} onVolver={() => setSelId(null)} />;

  const columnas = [
    { k: "n", t: "Nombre", v: (e) => <b>{e.nombre}</b>, orden: (e) => e.nombre },
    { k: "p", t: "Puesto", v: (e) => e.puesto, orden: (e) => e.puesto },
    { k: "s", t: "Sucursal base", v: (e) => A.nombreSuc(d, e.sucursalBase), orden: (e) => A.nombreSuc(d, e.sucursalBase) },
    { k: "h", t: "Hoy", v: (e) => hoyTexto(d, e, f), orden: (e) => hoyTexto(d, e, f) },
    { k: "a", t: "Antigüedad", v: (e) => A.antiguedad(e.ingreso).texto, orden: (e) => -A.antiguedad(e.ingreso).mesesTotales },
    { k: "x", t: "Expediente", v: (e) => `${A.avanceExpediente(e).pct} %`, der: true, orden: (e) => A.avanceExpediente(e).pct },
    { k: "$", t: "Sueldo mensual", v: (e) => dinero(e.sueldoMensual), der: true, orden: (e) => e.sueldoMensual },
    { k: "e", t: "Estado", v: (e) => <Badge tono={e.estado === "activo" ? "ok" : "neutral"}>{e.estado === "activo" ? "Activo" : "Baja"}</Badge>, orden: (e) => e.estado },
  ];

  return (
    <>
      <div className="pp-kpis">
        <Kpi label="Empleados activos" valor={activos.length} nota={`${empleados.length - activos.length} en bajas`} />
        <Kpi label="En el trabajo hoy" valor={dentro} nota="con entrada registrada" tono="ok" />
        <Kpi label="Retardos hoy" valor={retardos} tono={retardos ? "warn" : undefined} />
        <Kpi label="Expedientes incompletos" valor={incompletos} tono={incompletos ? "warn" : "ok"} />
        <Kpi label="Por aprobar" valor={porAprobar} nota="vacaciones e incidencias" tono={porAprobar ? "info" : undefined} />
        <Kpi label="Nómina mensual (bruta)" valor={dinero(nomMensual)} nota="activos de esta vista" />
      </div>

      <div className="pp-filtros">
        <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre o puesto…" />
        <Field label="Puesto"><Select value={rol} onChange={(e) => setRol(e.target.value)}><option value="">Todos</option>{roles.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r] || r}</option>)}</Select></Field>
        {A.esAdmin(u) && <Button icon="plus" onClick={() => setAlta(true)}>Alta de empleado</Button>}
      </div>
      <Chips valor={est} onChange={setEst} opciones={[{ v: "activos", l: "Activos", n: activos.length }, { v: "bajas", l: "Bajas", n: empleados.length - activos.length }, { v: "todos", l: "Todos", n: empleados.length }]} />

      <Vista id="rh-empleados" items={filtrados} onAbrir={(e) => setSelId(e.id)} vacio="Ningún empleado coincide con el filtro." columnas={columnas}
        tarjeta={(e) => {
          const s = hoyEst(e), av = A.avanceExpediente(e);
          const prog = A.sucursalHoy(d, e.id, f);
          return (
            <div className="persona">
              <div className="persona-top" />
              <Foto nombre={e.nombre} src={e.foto} size={64} />
              <div className="persona-n">{e.nombre}</div>
              <div className="persona-s">{e.puesto}</div>
              <div className="persona-b">
                {e.estado !== "activo" ? <Badge tono="neutral">Baja</Badge> : <><Badge tono="info">{prog ? `Hoy: ${A.nombreSuc(d, prog)}` : "Hoy: descanso"}</Badge><BadgeEstado estado={s.estado} /></>}
              </div>
              <div className="persona-d"><span><b>{A.antiguedad(e.ingreso).texto.replace(" m", "m")}</b>antigüedad</span><span><b>{av.pct}%</b>expediente</span><span><b>{dinero(e.sueldoMensual)}</b>sueldo</span></div>
            </div>
          );
        }} />
      <AltaEmpleado d={d} abierto={alta} onClose={() => setAlta(false)} onCreado={(e) => { setAlta(false); setSelId(e.id); }} />
    </>
  );
}

const hoyTexto = (d, e, f) => {
  if (e.estado !== "activo") return "Baja";
  const p = A.sucursalHoy(d, e.id, f);
  return p ? `${A.nombreSuc(d, p)} · ${A.estadoDia(d, e, f).estado}` : "Descanso";
};

// ───────── Ficha completa de una persona
export function Ficha({ d, u, id, onVolver }) {
  const e = d.rh.empleados.find((x) => x.id === id);
  const [edit, setEdit] = useState(false);
  const [baja, setBaja] = useState(false);
  const [rein, setRein] = useState(false);
  const [recibo, setRecibo] = useState(null);
  if (!e) return <Vacio icon="users">No se encontró al empleado.</Vacio>;
  const f = hoy();
  const gestor = A.puedeGestionarEmpleado(u, e);
  const admin = A.esAdmin(u);
  const antig = A.antiguedad(e.ingreso);
  const av = A.avanceExpediente(e);
  const sd = A.saldoVacaciones(d, e);
  const prog = A.sucursalHoy(d, e.id, f);
  const stHoy = A.estadoDia(d, e, f);
  const ult = Array.from({ length: 14 }, (_, i) => { const x = new Date(); x.setDate(x.getDate() - i); const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; return k; });
  const res = A.resumenAsistencia(d, e, ult[13], f);
  const incs = d.rh.incidencias.filter((i) => i.empleadoId === e.id);
  const vacs = d.rh.vacaciones.filter((v) => v.empleadoId === e.id).sort((a, b) => b.desde.localeCompare(a.desde));
  const movs = d.rh.movimientos.filter((m) => m.empleadoId === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const recs = d.rh.recibos.filter((r) => r.empleadoId === e.id).sort((a, b) => b.periodo.desde.localeCompare(a.periodo.desde));
  const usr = e.usuarioId ? d.usuarios.find((x) => x.id === e.usuarioId) : null;
  const cursos = usr ? A.cursosDeUsuario(d, usr) : [];
  const cursosHechos = cursos.filter((c) => c.prog.completo);
  const cursosPend = cursos.filter((c) => !c.prog.completo && c.motivo !== "opcional");
  const mes = f.slice(0, 7), q = Number(f.slice(8)) <= 15 ? 1 : 2;
  const nomActual = e.estado === "activo" ? A.calcularNomina(d, e, A.rangoPeriodo("quincenal", mes, q)) : null;

  const poner = (foto) => { esRes(A.actualizarEmpleado({ id: e.id, cambios: { foto } })) && aviso("Foto actualizada."); };
  const puedeFoto = gestor || (usr && usr.id === u.id);
  const usuarioNombre = (uid) => (d.usuarios.find((x) => x.id === uid) || {}).nombre || "—";

  return (
    <>
      <div className="fila-flex"><Button variante="ghost" icon="back" onClick={onVolver}>Empleados</Button></div>
      <Card>
        <div className="pp-cab-ficha">
          <Foto nombre={e.nombre} src={e.foto} size={92} />
          <div className="nom">
            <h2>{e.nombre}</h2>
            <div className="mu">{e.puesto} · {A.nombreSuc(d, e.sucursalBase)}</div>
            <div className="fila-flex" style={{ flexWrap: "wrap", marginTop: 6 }}>
              <Badge tono={e.estado === "activo" ? "ok" : "neutral"}>{e.estado === "activo" ? "Activo" : `Baja ${e.bajaFecha ? fechaCorta(e.bajaFecha) : ""}`}</Badge>
              {e.estado === "activo" && <><Badge tono="info">{prog ? `Hoy: ${A.nombreSuc(d, prog)}` : "Hoy: descanso"}</Badge><BadgeEstado estado={stHoy.estado} /></>}
              <Badge>{antig.texto}</Badge>
            </div>
          </div>
          {puedeFoto && <BotonesFoto lado={240} onFoto={poner} etiqueta="Foto" />}
        </div>
        <div className="pp-acciones">
          {gestor && <Button variante="sec" icon="edit" onClick={() => setEdit(true)}>Editar datos</Button>}
          {admin && e.estado === "activo" && <Button variante="danger" icon="logout" onClick={() => setBaja(true)}>Dar de baja</Button>}
          {admin && e.estado === "baja" && <Button variante="ok" icon="refresh" onClick={() => setRein(true)}>Reingreso</Button>}
        </div>
      </Card>

      <div className="pp-grid">
        <Card className="pp-sec"><h3>Datos personales y de contacto</h3>
          <div className="pp-dl">
            <div><span>Nacimiento</span><b>{e.nacimiento ? `${fechaCorta(e.nacimiento)} ${e.nacimiento.slice(0, 4)} (${edad(e.nacimiento)} años)` : "—"}</b></div>
            <div><span>CURP</span><b>{e.curp || "—"}</b></div><div><span>RFC</span><b>{e.rfc || "—"}</b></div><div><span>NSS</span><b>{e.nss || "—"}</b></div>
            <div><span>Teléfono</span><b>{e.telefono || "—"}</b></div><div><span>Correo</span><b>{e.correo || "—"}</b></div><div><span>Domicilio</span><b>{e.domicilio || "—"}</b></div>
            <div><span>Contacto de emergencia</span><b>{e.emergencia && e.emergencia.nombre ? `${e.emergencia.nombre} (${e.emergencia.parentesco}) ${e.emergencia.telefono}` : "—"}</b></div>
          </div>
          {e.ficticio && <p className="mu peq" style={{ margin: "8px 0 0" }}>Datos ficticios de demostración (CURP, RFC y NSS no son reales).</p>}
        </Card>

        <Card className="pp-sec"><h3>Puesto, sucursales y contrato</h3>
          <div className="pp-dl">
            <div><span>Puesto</span><b>{e.puesto}</b></div><div><span>Sucursal base</span><b>{A.nombreSuc(d, e.sucursalBase)}</b></div>
            <div><span>Puede trabajar en</span><b>{e.sucursales.length >= 7 ? "Todas las sucursales" : e.sucursales.map((s) => A.nombreSuc(d, s)).join(", ")}</b></div>
            <div><span>Sueldo mensual</span><b>{dinero(e.sueldoMensual)}</b></div><div><span>Sueldo diario</span><b>{dinero(Math.round((e.sueldoMensual / 30) * 100) / 100)}</b></div>
            <div><span>Ingreso</span><b>{fechaCorta(e.ingreso)} {e.ingreso.slice(0, 4)}{e.ingresoOriginal ? ` (reingreso; primer ingreso ${e.ingresoOriginal})` : ""}</b></div>
            <div><span>Antigüedad</span><b>{antig.texto}</b></div>
            <div><span>Contrato</span><b>{e.contrato.tipo}{e.contrato.fin ? ` · vence ${fechaCorta(e.contrato.fin)}` : ""}</b></div>
            <div><span>Contrato firmado</span><b>{e.contrato.firmado ? "Sí" : "Pendiente"}</b></div>
            <div><span>Horario</span><b>{e.horario.entrada} a {e.horario.salida}</b></div>
            {usr && <div><span>Cuenta del sistema</span><b>{usr.correo}{usr.activo === false ? " (desactivada)" : ""}</b></div>}
          </div>
        </Card>

        <Card className="pp-sec"><h3>Expediente <Badge tono={av.pct >= 100 ? "ok" : av.pct < 50 ? "bad" : "warn"}>{av.entregados}/{av.total} · {av.pct}%</Badge></h3>
          <Barra pct={av.pct} />
          <div style={{ marginTop: 6 }}>
            {A.docsRequeridos(e).map((x) => {
              const ok = !!(e.expediente && e.expediente[x.k] && e.expediente[x.k].ok);
              return (
                <div className="pp-doc" key={x.k}>
                  <label><input type="checkbox" checked={ok} disabled={!gestor || e.estado !== "activo"} onChange={(ev) => { const r = A.marcarDocumento({ empleadoId: e.id, doc: x.k, ok: ev.target.checked }); esRes(r); }} /><span>{x.t}</span></label>
                  <span className="mu peq">{ok ? `Entregado ${fechaCorta(e.expediente[x.k].fecha)}` : "Pendiente"}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="pp-sec"><h3>Asistencia (últimos 14 días)</h3>
          <div className="pp-kpis" style={{ marginBottom: 8 }}>
            <Kpi label="A tiempo" valor={res.normal} tono="ok" /><Kpi label="Retardos" valor={res.retardo} tono={res.retardo ? "warn" : undefined} /><Kpi label="Faltas" valor={res.falta} tono={res.falta ? "bad" : undefined} />
            <Kpi label="Ausencias justificadas" valor={res.vacaciones + res.incapacidad + res.permiso} tono="info" />
          </div>
          {ult.slice(0, 7).map((x) => { const s = A.estadoDia(d, e, x); if (s.estado === "descanso" || s.estado === "baja") return null; return (
            <div className="pp-lin" key={x}><span className="fecha">{fechaCorta(x)}</span><div className="cuerpo2">{s.registro && s.registro.entrada ? `${s.registro.entrada} – ${s.registro.salida || "…"} · ${A.nombreSuc(d, s.registro.sucursalId)}` : s.programada ? `Programado en ${A.nombreSuc(d, s.programada)}` : "—"}</div><BadgeEstado estado={s.estado} /></div>); })}
        </Card>

        <Card className="pp-sec"><h3>Incidencias</h3>
          {!incs.length ? <p className="mu" style={{ margin: 0 }}>Sin incidencias registradas.</p> : incs.slice(0, 8).map((i) => (
            <div className="pp-lin" key={i.id}><span className="fecha">{fechaCorta(i.desde)}</span><div className="cuerpo2"><b>{(A.TIPOS_INCIDENCIA.find((t) => t.v === i.tipo) || {}).l || i.tipo}</b><div className="mu peq">{i.detalle}</div></div><Badge tono={TONO_SOL[i.estado]}>{ETQ_SOL[i.estado] || i.estado}</Badge></div>))}
        </Card>

        <Card className="pp-sec"><h3>Vacaciones</h3>
          <div className="pp-kpis" style={{ marginBottom: 8 }}>
            <Kpi label="Derecho del año" valor={`${sd.derecho} d`} nota={sd.anios < 1 ? "aún no cumple 1 año" : `${sd.anios} años de antigüedad`} />
            <Kpi label="Tomados" valor={sd.tomados} /><Kpi label="Por aprobar" valor={sd.pendientes} tono={sd.pendientes ? "warn" : undefined} /><Kpi label="Saldo" valor={sd.saldo} tono="ok" />
          </div>
          {vacs.slice(0, 6).map((v) => (<div className="pp-lin" key={v.id}><span className="fecha">{fechaCorta(v.desde)}</span><div className="cuerpo2">{v.desde} a {v.hasta} · {v.dias} días{v.nota ? <div className="mu peq">{v.nota}</div> : null}</div><Badge tono={TONO_SOL[v.estado]}>{ETQ_SOL[v.estado]}</Badge></div>))}
          <p className="mu peq" style={{ margin: "8px 0 0" }}>Días según la Ley Federal del Trabajo (art. 76, reforma 2023) y prima vacacional del 25 %. Por validar con contador.</p>
        </Card>

        <Card className="pp-sec"><h3>Nómina y recibos</h3>
          {nomActual && <div className="pp-dl" style={{ marginBottom: 8 }}>
            <div><span>Quincena en curso</span><b>{dinero(nomActual.total)}</b></div><div><span>Descuento por faltas / retardos</span><b>{dinero(nomActual.descuentos)}</b></div>
          </div>}
          {!recs.length ? <p className="mu" style={{ margin: 0 }}>Aún no hay recibos generados.</p> : recs.slice(0, 5).map((r) => (
            <div className="pp-lin" key={r.id}><span className="fecha">{r.folio}</span><div className="cuerpo2">{r.periodo.etiqueta}<div className="mu peq">Total {dinero(r.total)}</div></div>
              <span className="fila-flex"><Badge tono={r.firmado ? "ok" : "warn"}>{r.firmado ? "Firmado" : "Sin firma"}</Badge><Button variante="ghost" className="btn-peq" onClick={() => setRecibo(r)}>Ver</Button></span></div>))}
          <p className="mu peq" style={{ margin: "8px 0 0" }}>Cálculo de demostración, no sustituye el timbrado de nómina CFDI (pendiente).</p>
        </Card>

        <Card className="pp-sec"><h3>Capacitación <Badge tono={cursosPend.length ? "warn" : "ok"}>{cursosHechos.length} completados</Badge></h3>
          {!usr ? <p className="mu" style={{ margin: 0 }}>Esta persona no tiene cuenta del sistema.</p> : (
            <>
              {cursosPend.length > 0 && <Aviso>Pendientes obligatorios: {cursosPend.map((c) => c.curso.titulo).join(", ")}</Aviso>}
              {cursos.filter((c) => c.prog.vistas || c.prog.completo).map((c) => (
                <div className="pp-lin" key={c.curso.id}><div className="cuerpo2"><b>{c.curso.titulo}</b><Barra pct={c.prog.pct} /></div><Badge tono={c.prog.completo ? "ok" : "warn"}>{c.prog.completo ? `Constancia ${c.prog.constancia || ""}` : `${c.prog.pct} %`}</Badge></div>))}
              {!cursos.some((c) => c.prog.vistas) && <p className="mu" style={{ margin: 0 }}>Todavía no inicia cursos.</p>}
            </>)}
        </Card>

        <Card className="pp-sec ancho"><h3>Movimientos (alta, cambios, baja y reingreso)</h3>
          {movs.map((m) => (
            <div className="pp-lin" key={m.id}><span className="fecha">{m.fecha}</span>
              <div className="cuerpo2"><b>{({ alta: "Alta", cambio: "Cambio", baja: "Baja", reingreso: "Reingreso" })[m.tipo]}</b> · {m.detalle}
                {m.motivo ? <div className="mu peq">Motivo: {m.motivo}</div> : null}
                {m.finiquito ? <div className="mu peq">Finiquito {m.finiquito.estado === "pagado" ? "pagado" : "por pagar"}: {dinero(m.finiquito.total)} (estimación; por validar con contador)</div> : null}
                <div className="mu peq">Registró: {usuarioNombre(m.usuarioId)}</div></div>
              {m.imss && m.imss.estado === "pendiente_envio" ? <Badge tono="warn">IMSS: pendiente de envío real</Badge> : m.imss && m.imss.estado === "historico" ? <Badge tono="neutral">IMSS: histórico</Badge> : null}
            </div>))}
        </Card>
      </div>

      <EditarEmpleado d={d} u={u} e={e} abierto={edit} onClose={() => setEdit(false)} />
      <BajaEmpleado e={e} d={d} abierto={baja} onClose={() => setBaja(false)} />
      <ReingresoEmpleado e={e} abierto={rein} onClose={() => setRein(false)} />
      <Hoja abierto={!!recibo} onClose={() => setRecibo(null)} titulo={recibo ? `Recibo ${recibo.folio}` : ""}>{recibo && <ReciboHoja d={d} recibo={recibo} />}</Hoja>
    </>
  );
}

function EditarEmpleado({ d, u, e, abierto, onClose }) {
  const admin = A.esAdmin(u);
  const ini = () => ({ telefono: e.telefono || "", correo: e.correo || "", domicilio: e.domicilio || "", curp: e.curp || "", rfc: e.rfc || "", nss: e.nss || "", nacimiento: e.nacimiento || "",
    en: e.emergencia?.nombre || "", ep: e.emergencia?.parentesco || "", et: e.emergencia?.telefono || "", he: e.horario.entrada, hs: e.horario.salida,
    puesto: e.puesto, sueldo: e.sueldoMensual, base: e.sucursalBase, sucs: [...e.sucursales], contrato: e.contrato.tipo });
  const [v, setV] = useState(ini);
  useEffect(() => { if (abierto) setV(ini()); }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (ev) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const guardar = () => {
    const cambios = { telefono: v.telefono, correo: v.correo, domicilio: v.domicilio, curp: v.curp.toUpperCase(), rfc: v.rfc.toUpperCase(), nss: v.nss, nacimiento: v.nacimiento, emergencia: { nombre: v.en, parentesco: v.ep, telefono: v.et }, horario: { entrada: v.he, salida: v.hs } };
    if (admin) Object.assign(cambios, { puesto: v.puesto, sueldoMensual: Number(v.sueldo), sucursalBase: v.base, sucursales: v.sucs, contrato: { ...e.contrato, tipo: v.contrato } });
    if (!A.esGestor(u)) { delete cambios.curp; delete cambios.rfc; delete cambios.nss; delete cambios.nacimiento; delete cambios.horario; delete cambios.correo; }
    if (esRes(A.actualizarEmpleado({ id: e.id, cambios }))) { aviso("Ficha actualizada."); onClose(); }
  };
  const todas = e.sucursales.length >= 7 ? d.sucursales.map((s) => s.id) : [...new Set([...d.sucursales.map((s) => s.id), ...e.sucursales])];
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Editar ficha" pie={<Button block onClick={guardar}>Guardar cambios</Button>}>
      <div className="form2"><Field label="Teléfono"><Input type="tel" inputMode="tel" value={v.telefono} onChange={set("telefono")} /></Field><Field label="Correo"><Input type="email" value={v.correo} onChange={set("correo")} /></Field></div>
      <Field label="Domicilio"><Input value={v.domicilio} onChange={set("domicilio")} autoComplete="street-address" /></Field>
      <div className="form2"><Field label="CURP"><Input value={v.curp} onChange={set("curp")} maxLength={18} /></Field><Field label="RFC"><Input value={v.rfc} onChange={set("rfc")} maxLength={13} /></Field></div>
      <div className="form2"><Field label="NSS"><Input inputMode="numeric" value={v.nss} onChange={set("nss")} maxLength={11} /></Field><Field label="Nacimiento"><Input type="date" value={v.nacimiento} onChange={set("nacimiento")} /></Field></div>
      <Field label="Contacto de emergencia"><Input placeholder="Nombre" value={v.en} onChange={set("en")} /></Field>
      <div className="form2"><Field label="Parentesco"><Input value={v.ep} onChange={set("ep")} /></Field><Field label="Teléfono de emergencia"><Input type="tel" value={v.et} onChange={set("et")} /></Field></div>
      <div className="form2"><Field label="Hora de entrada"><Input type="time" value={v.he} onChange={set("he")} /></Field><Field label="Hora de salida"><Input type="time" value={v.hs} onChange={set("hs")} /></Field></div>
      {admin && (<>
        <Titulo>Solo administración</Titulo>
        <div className="form2"><Field label="Puesto"><Input value={v.puesto} onChange={set("puesto")} /></Field><Field label="Sueldo mensual"><Input type="number" inputMode="decimal" min="0" value={v.sueldo} onChange={set("sueldo")} /></Field></div>
        <div className="form2"><Field label="Sucursal base"><Select value={v.base} onChange={set("base")}>{v.sucs.map((s) => <option key={s} value={s}>{A.nombreSuc(d, s)}</option>)}</Select></Field>
          <Field label="Tipo de contrato"><Select value={v.contrato} onChange={set("contrato")}>{["Indeterminado", "A prueba (30 días)", "Tiempo determinado"].map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
        <Field label="Sucursales donde puede trabajar">
          <div className="chips">{todas.map((s) => <button type="button" key={s} className={`chip${v.sucs.includes(s) ? " on" : ""}`} onClick={() => setV((x) => ({ ...x, sucs: x.sucs.includes(s) ? x.sucs.filter((y) => y !== s) : [...x.sucs, s] }))}>{A.nombreSuc(d, s)}</button>)}</div>
        </Field>
      </>)}
    </Sheet>
  );
}

function BajaEmpleado({ d, e, abierto, onClose }) {
  const [fecha, setFecha] = useState(hoy());
  const [motivo, setMotivo] = useState("");
  const fin = useMemo(() => (abierto ? A.calcularFiniquito(e, fecha, d) : null), [abierto, e, fecha, d]);
  const ok = () => { const r = A.bajaEmpleado({ empleadoId: e.id, fecha, motivo }); if (esRes(r)) { aviso("Baja registrada. Aviso IMSS marcado como pendiente de envío real.", "warn"); setMotivo(""); onClose(); } };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={`Baja de ${e.nombre}`} pie={<Button variante="danger" block onClick={ok}>Confirmar baja</Button>}>
      <Aviso>La persona perderá el acceso al sistema. Esta acción queda en la bitácora.</Aviso>
      <Field label="Fecha de baja"><Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} /></Field>
      <Field label="Motivo (obligatorio)"><Select value={motivo} onChange={(ev) => setMotivo(ev.target.value)}><option value="">Elige un motivo…</option>{["Renuncia voluntaria", "Término de contrato", "Abandono de empleo", "Despido justificado", "Mutuo acuerdo", "Cambio de ciudad", "Otro"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
      {fin && <Card><div className="pp-dl"><div><span>Vacaciones proporcionales ({fin.vacacionesDias} d)</span><b>{dinero(fin.vacaciones)}</b></div><div><span>Prima vacacional 25 %</span><b>{dinero(fin.prima)}</b></div><div><span>Aguinaldo proporcional</span><b>{dinero(fin.aguinaldo)}</b></div><div><span><b>Finiquito estimado</b></span><b>{dinero(fin.total)}</b></div></div></Card>}
      <Nota>{fin ? fin.nota : ""} El aviso de baja al IMSS no se envía desde aquí: queda marcado como pendiente de envío real.</Nota>
    </Sheet>
  );
}

function ReingresoEmpleado({ e, abierto, onClose }) {
  const [fecha, setFecha] = useState(hoy());
  const ok = () => { if (esRes(A.reingresoEmpleado({ empleadoId: e.id, fecha }))) { aviso("Reingreso registrado."); onClose(); } };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={`Reingreso de ${e.nombre}`} pie={<Button variante="ok" block onClick={ok}>Registrar reingreso</Button>}>
      <Field label="Fecha de reingreso"><Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} /></Field>
      <Nota>Se conserva la fecha del primer ingreso y se reinicia la antigüedad. Se reactiva su cuenta si tenía una.</Nota>
    </Sheet>
  );
}

function AltaEmpleado({ d, abierto, onClose, onCreado }) {
  const vacio = { nombre: "", rol: "cajero", puesto: "", sucursalBase: "S1", sueldoMensual: "", ingreso: hoy(), telefono: "", correo: "" };
  const [v, setV] = useState(vacio);
  const set = (k) => (ev) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const ok = () => {
    const r = A.altaEmpleado({ ...v, puesto: v.puesto || NOMBRE_ROL[v.rol], sueldoMensual: Number(v.sueldoMensual) });
    if (esRes(r)) { aviso("Empleado dado de alta. Aviso IMSS marcado como pendiente de envío real."); setV(vacio); onCreado(r.empleado); }
  };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Alta de empleado" pie={<Button block onClick={ok}>Dar de alta</Button>}>
      <Field label="Nombre completo"><Input value={v.nombre} onChange={set("nombre")} autoComplete="off" /></Field>
      <div className="form2"><Field label="Rol"><Select value={v.rol} onChange={set("rol")}>{ROLES_ALTA.map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}</Select></Field><Field label="Puesto (opcional)"><Input value={v.puesto} onChange={set("puesto")} placeholder={NOMBRE_ROL[v.rol]} /></Field></div>
      <div className="form2"><Field label="Sucursal base"><Select value={v.sucursalBase} onChange={set("sucursalBase")}>{d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field><Field label="Sueldo mensual"><Input type="number" inputMode="decimal" min="0" value={v.sueldoMensual} onChange={set("sueldoMensual")} /></Field></div>
      <div className="form2"><Field label="Fecha de ingreso"><Input type="date" value={v.ingreso} onChange={set("ingreso")} /></Field><Field label="Teléfono"><Input type="tel" inputMode="tel" value={v.telefono} onChange={set("telefono")} /></Field></div>
      <Field label="Correo"><Input type="email" value={v.correo} onChange={set("correo")} /></Field>
      <Nota>La ficha nace con contrato a prueba y expediente vacío. Para que pueda entrar al sistema, administración debe crearle su usuario en «Usuarios y roles».</Nota>
    </Sheet>
  );
}
