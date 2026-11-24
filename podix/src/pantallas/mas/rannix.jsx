// Panel RANNIX multi-clínica (porte de Pie Firme: RannixPanel.jsx + RannixSoporte.jsx, migraciones 059 y 062; P-121, P-128).
// DEMOSTRACIÓN SIN AISLAMIENTO REAL: las tres clínicas viven en este navegador; Pie Clinic (fundador) se lee en vivo y las otras dos son
// ficticias. En producción el panel solo recibe metadatos de uso y cobro (nunca datos de salud) desde una función de servidor.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, Button, Card, Chips, Field, Input, Kpi, Resumen, Select, Sheet, Area, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import * as R from "../../store/reglas.js";
import { dinero } from "../../lib/format.js";
import { puedeSaas, panelRannix, cambiarEstadoClinica, crearTicket, responderTicket, publicarAviso, retirarAviso, ESTADOS_CLINICA, ESTADOS_TICKET } from "../../store/acciones_saas.js";
import { Denegado, Nota, fechaHora, numero } from "../../componentes/plataforma/comun.jsx";
import { useSaas, useErrores } from "../../componentes/saas/comun.jsx";

const Est = ({ e, tabla }) => { const x = tabla[e] || [e, "neutral"]; return <Badge tono={x[1]}>{x[0]}</Badge>; };

export default function Rannix() {
  const { d, u } = useSesion();
  const listo = useSaas(d);
  const errores = useErrores();
  const [tab, setTab] = useState("clinicas");
  const [cl, setCl] = useState(null);
  const [cambio, setCambio] = useState({ estado: "", motivo: "" });
  const [fEst, setFEst] = useState("abiertos");
  const [tk, setTk] = useState(null);
  const [resp, setResp] = useState({ texto: "", de: "rannix", estado: "" });
  const [nuevo, setNuevo] = useState(null);
  const [av, setAv] = useState({ titulo: "", texto: "", alcance: "todas", nivel: "info" });
  const p = useMemo(() => (listo ? panelRannix(d, { errores }) : null), [d, errores, listo]);
  if (!puedeSaas(u)) return <Denegado>El panel RANNIX es solo para Administración central y Dirección.</Denegado>;
  if (!p) return null;

  const nombre = (id) => (d.clinicas.find((c) => c.id === id) || { nombre: id }).nombre;
  const tickets = d.saas.soporte.tickets.filter((t) => fEst === "todos" || (fEst === "abiertos" ? !["resuelto", "cerrado"].includes(t.estado) : t.estado === fEst));
  const ticketSel = tk && d.saas.soporte.tickets.find((t) => t.id === tk);
  const clSel = cl && p.clinicas.find((c) => c.id === cl);
  const hacer = (fn, txt) => { const r = mutar(fn); aviso(r.ok ? txt : r.error, r.ok ? "ok" : "bad"); return r.ok; };
  const aplicarEstado = () => { if (hacer((x) => cambiarEstadoClinica(x, { clinicaId: cl, ...cambio }), "Estado actualizado y registrado en la bitácora.")) setCambio({ estado: "", motivo: "" }); };
  const responder = () => { if (hacer((x) => responderTicket(x, { ticketId: tk, ...resp }), "Respuesta registrada.")) setResp({ texto: "", de: resp.de, estado: "" }); };
  const crear = () => { if (hacer((x) => crearTicket(x, nuevo), "Ticket creado.")) setNuevo(null); };
  const publicar = () => { if (hacer((x) => publicarAviso(x, av), "Aviso publicado.")) setAv({ titulo: "", texto: "", alcance: "todas", nivel: "info" }); };
  const r = p.resumen;

  return (
    <>
      <Card tono="warn"><p className="txt peq"><b>Demostración sin aislamiento real.</b> Las clínicas comparten este navegador; en producción cada clínica es una organización separada en la base (P-128) y RANNIX solo ve metadatos de uso y cobro, nunca datos de salud. El soporte no suplanta usuarios (P-121).</p></Card>
      <div className="kpis">
        <Kpi label="Clínicas activas" valor={r.activas} nota={`${r.enPrueba} en prueba · ${r.vencidas} vencida(s) · ${r.suspendidas} suspendida(s)`} tono="ok" />
        <Kpi label="Ingreso recurrente (MRR)" valor={dinero(r.mrr)} nota="Mensual sin IVA · precios por validar" />
        <Kpi label="Tickets abiertos" valor={r.ticketsAbiertos} tono={r.urgentes ? "bad" : r.ticketsAbiertos ? "warn" : "ok"} nota={`${r.urgentes} urgente(s)`} />
        <Kpi label="Por decidir" valor={p.porDecidir.length} tono={p.porDecidir.length ? "warn" : "ok"} nota="Prueba o gracia terminadas" />
      </div>
      {p.porDecidir.length > 0 && <Card tono="warn"><p className="txt peq"><b>Por decidir:</b> {p.porDecidir.map((x) => `${x.nombre} — ${x.motivo} desde ${x.desde}`).join(" · ")}</p></Card>}
      <Chips valor={tab} onChange={setTab} opciones={[{ v: "clinicas", l: "Clínicas", n: p.clinicas.length }, { v: "soporte", l: "Soporte", n: r.ticketsAbiertos }, { v: "avisos", l: "Avisos", n: d.saas.soporte.avisos.filter((a) => a.activo).length }]} />

      {tab === "clinicas" && (
        <Vista id="sa-clinicas" items={p.clinicas} onAbrir={(c) => { setCl(c.id); setCambio({ estado: "", motivo: "" }); }} minTarjeta={260}
          tarjeta={(c) => (
            <div className="sa-modulo">
              <div className="sa-col-t"><h4>{c.nombre}</h4><Est e={c.estado} tabla={ESTADOS_CLINICA} /></div>
              <span className="peq">{c.plan}{c.fundador ? " · fundador" : ""}{c.propia ? " · esta instalación (en vivo)" : " · ficticia"}</span>
              <span className="mu peq">{c.region} · {c.sucursales} sucursal(es) · {c.usuarios} usuarios · {numero(c.citasMes)} citas en el mes</span>
              <span className="mu peq">MRR {dinero(c.mrr || 0)} · {c.almacenamientoMB} MB · salud {c.salud && c.salud.pct != null ? `${c.salud.pct} %` : "sin validar"} · {c.ticketsAbiertos} ticket(s)</span>
            </div>
          )}
          columnas={[{ k: "n", t: "Clínica", v: (c) => c.nombre }, { k: "e", t: "Estado", v: (c) => <Est e={c.estado} tabla={ESTADOS_CLINICA} />, orden: (c) => c.estado }, { k: "p", t: "Plan", v: (c) => c.plan },
            { k: "s", t: "Sucursales", der: true, v: (c) => c.sucursales }, { k: "u", t: "Usuarios", der: true, v: (c) => c.usuarios }, { k: "ci", t: "Citas mes", der: true, v: (c) => numero(c.citasMes), orden: (c) => c.citasMes },
            { k: "mb", t: "MB", der: true, v: (c) => c.almacenamientoMB }, { k: "m", t: "MRR", der: true, v: (c) => dinero(c.mrr || 0), orden: (c) => c.mrr || 0 },
            { k: "sa", t: "Salud", der: true, v: (c) => (c.salud && c.salud.pct != null ? `${c.salud.pct} %` : "—") }, { k: "t", t: "Tickets", der: true, v: (c) => c.ticketsAbiertos }]} />
      )}

      {tab === "soporte" && (
        <>
          <div className="pl-barra">
            <Chips scroll valor={fEst} onChange={setFEst} opciones={[{ v: "abiertos", l: "Abiertos" }, { v: "todos", l: "Todos" }, ...Object.entries(ESTADOS_TICKET).map(([v, [l]]) => ({ v, l }))]} />
            <Button className="btn-peq" icon="plus" onClick={() => setNuevo({ clinicaId: "CL1", asunto: "", descripcion: "", prioridad: "normal" })}>Nuevo ticket</Button>
          </div>
          <Vista id="sa-tickets" items={tickets} onAbrir={(t) => { setTk(t.id); setResp({ texto: "", de: "rannix", estado: "" }); }} vacio="Sin tickets con ese filtro."
            tarjeta={(t) => <div className="sa-modulo"><div className="sa-col-t"><b>{t.folio}</b><Est e={t.estado} tabla={ESTADOS_TICKET} /></div><span>{t.asunto}</span><span className="mu peq">{nombre(t.clinicaId)} · {fechaHora(t.creado)} · {t.mensajes.length} mensaje(s)</span>{t.prioridad === "urgente" && <Badge tono="bad">Urgente</Badge>}</div>}
            columnas={[{ k: "f", t: "Folio", v: (t) => t.folio }, { k: "c", t: "Clínica", v: (t) => nombre(t.clinicaId) }, { k: "a", t: "Asunto", v: (t) => t.asunto }, { k: "p", t: "Prioridad", v: (t) => t.prioridad },
              { k: "e", t: "Estado", v: (t) => <Est e={t.estado} tabla={ESTADOS_TICKET} />, orden: (t) => t.estado }, { k: "m", t: "Mensajes", der: true, v: (t) => t.mensajes.length }, { k: "cr", t: "Creado", v: (t) => fechaHora(t.creado), orden: (t) => t.creado }]} />
          <Nota>Los tickets solo llevan metadatos; no incluyas datos de pacientes. Para ayudar, la clínica otorga un acceso temporal con motivo (P-121; pendiente con base de datos).</Nota>
        </>
      )}

      {tab === "avisos" && (
        <>
          <Card>
            <div className="sa-rejilla">
              <Field label="Título"><Input value={av.titulo} onChange={(e) => setAv({ ...av, titulo: e.target.value })} /></Field>
              <Field label="Para"><Select value={av.alcance} onChange={(e) => setAv({ ...av, alcance: e.target.value })}><option value="todas">Todas las clínicas</option>{d.clinicas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
              <Field label="Nivel"><Select value={av.nivel} onChange={(e) => setAv({ ...av, nivel: e.target.value })}><option value="info">Informativo</option><option value="importante">Importante</option></Select></Field>
            </div>
            <Field label="Texto"><Area value={av.texto} onChange={(e) => setAv({ ...av, texto: e.target.value })} /></Field>
            <div className="pl-acc"><Button icon="megaphone" onClick={publicar}>Publicar aviso</Button></div>
            <Nota>El aviso aparece en la pantalla de Suscripción de la clínica destinataria.</Nota>
          </Card>
          <Vista id="sa-avisos" items={d.saas.soporte.avisos}
            tarjeta={(a) => <div className="sa-modulo"><div className="sa-col-t"><b>{a.titulo}</b><Badge tono={a.activo ? (a.nivel === "importante" ? "warn" : "info") : "neutral"}>{a.activo ? (a.nivel === "importante" ? "Importante" : "Informativo") : "Retirado"}</Badge></div><span className="peq">{a.texto}</span><span className="mu peq">{a.alcance === "todas" ? "Todas" : nombre(a.alcance)} · {fechaHora(a.ts)}</span>{a.activo && <Button className="btn-peq" variante="ghost" onClick={() => hacer((x) => retirarAviso(x, a.id), "Aviso retirado.")}>Retirar</Button>}</div>}
            columnas={[{ k: "t", t: "Título", v: (a) => a.titulo }, { k: "p", t: "Para", v: (a) => (a.alcance === "todas" ? "Todas" : nombre(a.alcance)) }, { k: "n", t: "Nivel", v: (a) => a.nivel }, { k: "f", t: "Fecha", v: (a) => fechaHora(a.ts), orden: (a) => a.ts },
              { k: "e", t: "Estado", v: (a) => (a.activo ? <Button className="btn-peq" variante="ghost" onClick={() => hacer((x) => retirarAviso(x, a.id), "Aviso retirado.")}>Retirar</Button> : "Retirado") }]} />
        </>
      )}

      <Sheet abierto={!!clSel} onClose={() => setCl(null)} titulo={clSel ? clSel.nombre : ""} pie={clSel && <Button block disabled={!cambio.estado} onClick={aplicarEstado}>Aplicar cambio de estado</Button>}>
        {clSel && <>
          <Resumen filas={[["Estado", (ESTADOS_CLINICA[clSel.estado] || [clSel.estado])[0]], ["Plan", clSel.plan], ["Alta", clSel.alta], ["Contacto", clSel.contacto], clSel.pruebaHasta && ["Prueba hasta", clSel.pruebaHasta], clSel.graciaHasta && clSel.estado === "vencida" && ["Gracia hasta", clSel.graciaHasta],
            ["Último acceso", clSel.ultimoAcceso ? fechaHora(clSel.ultimoAcceso) : "—"], ["Errores 24 h", clSel.salud ? clSel.salud.errores24h : "—"]]} />
          <p className="txt peq">{clSel.notas}</p>
          <Field label="Nuevo estado"><Select value={cambio.estado} onChange={(e) => setCambio({ ...cambio, estado: e.target.value })}><option value="">Sin cambio</option>{Object.entries(ESTADOS_CLINICA).filter(([k]) => k !== clSel.estado).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Motivo (obligatorio)" hint={clSel.propia ? "En esta instalación, «suspendida» o «baja» apagan los módulos (solo lectura y exportación)." : "Queda en la bitácora."}><Area value={cambio.motivo} onChange={(e) => setCambio({ ...cambio, motivo: e.target.value })} /></Field>
          {(clSel.historial || []).length > 0 && <Nota>Historial: {clSel.historial.map((h) => `${fechaHora(h.ts)} ${h.de} → ${h.a} (${h.motivo})`).join(" · ")}</Nota>}
        </>}
      </Sheet>
      <Sheet abierto={!!ticketSel} onClose={() => setTk(null)} titulo={ticketSel ? `${ticketSel.folio} · ${nombre(ticketSel.clinicaId)}` : ""} pie={ticketSel && <Button block icon="send" onClick={responder}>Registrar</Button>}>
        {ticketSel && <>
          <p className="txt"><b>{ticketSel.asunto}</b> <Est e={ticketSel.estado} tabla={ESTADOS_TICKET} /></p>
          <div className="sa-hilo">{ticketSel.mensajes.map((m) => <div key={m.id} className={`sa-msj ${m.de}`}><small>{m.de === "rannix" ? "RANNIX" : nombre(ticketSel.clinicaId)}{m.usuarioId ? ` · ${R.nombreUsuario(d, m.usuarioId)}` : ""} · {fechaHora(m.ts)}</small>{m.texto}</div>)}</div>
          <div className="sa-rejilla">
            <Field label="Responder como"><Select value={resp.de} onChange={(e) => setResp({ ...resp, de: e.target.value })}><option value="rannix">RANNIX (soporte)</option><option value="clinica">La clínica</option></Select></Field>
            <Field label="Nuevo estado"><Select value={resp.estado} onChange={(e) => setResp({ ...resp, estado: e.target.value })}><option value="">Sin cambio</option>{Object.entries(ESTADOS_TICKET).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          </div>
          <Field label="Mensaje"><Area value={resp.texto} onChange={(e) => setResp({ ...resp, texto: e.target.value })} disabled={ticketSel.estado === "cerrado"} /></Field>
          <Nota>En la demostración la misma persona puede escribir como clínica o como RANNIX.</Nota>
        </>}
      </Sheet>
      <Sheet abierto={!!nuevo} onClose={() => setNuevo(null)} titulo="Nuevo ticket de soporte" pie={<Button block onClick={crear}>Crear ticket</Button>}>
        {nuevo && <>
          <Field label="Clínica"><Select value={nuevo.clinicaId} onChange={(e) => setNuevo({ ...nuevo, clinicaId: e.target.value })}>{d.clinicas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
          <Field label="Asunto"><Input value={nuevo.asunto} onChange={(e) => setNuevo({ ...nuevo, asunto: e.target.value })} /></Field>
          <Field label="Descripción" hint="No incluyas datos de pacientes."><Area value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} /></Field>
          <Field label="Prioridad"><Select value={nuevo.prioridad} onChange={(e) => setNuevo({ ...nuevo, prioridad: e.target.value })}><option value="normal">Normal</option><option value="urgente">Urgente</option></Select></Field>
        </>}
      </Sheet>
    </>
  );
}
