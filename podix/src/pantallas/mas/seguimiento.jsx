// Más ▸ Seguimiento de pacientes (CRM) (porte de Pie Firme: Seguimiento, lib/clinico/crm). Segmentos: inactivos a 180 días,
// revisión de pie diabético vencida, planes abandonados, cumpleaños y revisión de ajuste de plantillas. Campañas con aprobación de
// Administración. El contacto es MANUAL (wa.me y tel:): el sistema no envía mensajes; solo se anota el resultado en la bitácora.
// La satisfacción del paciente vive en Más ▸ Evaluación de clientes (no se duplica aquí).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_clinica.js";
import { fechaCorta, hora } from "../../lib/format.js";
import { Area, Badge, BarraAccion, Button, Buscador, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { Barra, FiltroSucursal, SinAcceso, resultado } from "../../componentes/clinica/comunes.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);
const nomSuc = (d, id) => (d.sucursales.find((s) => s.id === id) || {}).nombre || id;

export default function Seguimiento() {
  const { d, u } = useSesion();
  const nav = useNavigate();
  const [tab, setTab] = useState("lista");
  const [seg, setSeg] = useState("inactivos");
  const [suc, setSuc] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [camp, setCamp] = useState(null);
  const [nuevaCamp, setNuevaCamp] = useState(false);
  const [verExcluidos, setVerExcluidos] = useState(false);
  const visibles = A.sucursalesVisibles(d, u);
  const sucursales = suc ? [suc] : A.esAdmin(u) ? null : visibles;
  const lista0 = useMemo(() => (A.puede(u, "crm.ver") ? A.listaContacto(d, { segmento: seg, sucursales }) : []), [d, u, seg, suc]); // eslint-disable-line
  if (!A.puede(u, "crm.ver")) return <SinAcceso>El seguimiento de pacientes es de Recepción, el gerente y Administración.</SinAcceso>;
  const lista = lista0.filter((x) => (verExcluidos || !x.excluido) && A.buscarTexto(q, x.nombre, x.telefono));
  const conteo = Object.fromEntries(Object.keys(A.SEGMENTOS).map((k) => [k, k === seg ? lista0.filter((x) => !x.excluido).length : null]));
  const crm = d.crm || {};
  const camps = (crm.campanas || []).filter((c) => A.esAdmin(u) || !c.sucursalId || visibles.includes(c.sucursalId));
  const contactos = (crm.contactos || []).filter((c) => A.esAdmin(u) || visibles.includes(c.sucursalId));
  const semana = contactos.filter((c) => c.fecha >= A.ahoraMas(-7));
  const P = A.paramsClinica(d);
  return (
    <div className="form">
      <div className="kpis">
        <Kpi label={A.SEGMENTOS[seg]} valor={lista0.filter((x) => !x.excluido).length} />
        <Kpi label="Sin contacto aún" valor={lista0.filter((x) => !x.excluido && !x.ultimoContacto).length} tono="warn" />
        <Kpi label="Contactos (7 días)" valor={semana.length} />
        <Kpi label="Agendaron (7 días)" valor={semana.filter((c) => c.resultado === "agendo").length} tono="ok" />
      </div>
      <Card><div className="cl-entre"><span className="peq">¿Cómo califican los pacientes su atención? Las encuestas viven en Evaluación de clientes.</span><Button variante="sec" className="btn-peq" icon="star" onClick={() => nav("/mas/evaluaciones")}>Evaluación de clientes</Button></div></Card>
      <FiltroSucursal d={d} ids={visibles} valor={suc} onChange={setSuc} />
      <Chips valor={tab} onChange={setTab} opciones={[{ v: "lista", l: "Por contactar" }, { v: "campanas", l: "Campañas", n: camps.length }, { v: "bitacora", l: "Bitácora", n: contactos.length }]} />

      {tab === "lista" && <>
        <Chips scroll valor={seg} onChange={setSeg} opciones={Object.entries(A.SEGMENTOS).map(([v, l]) => ({ v, l, n: conteo[v] ?? undefined }))} />
        <div className="cl-entre"><Buscador valor={q} onChange={setQ} placeholder="Nombre o teléfono" />
          <label className="cl-fila-h peq"><input type="checkbox" checked={verExcluidos} onChange={(e) => setVerExcluidos(e.target.checked)} /> Ver excluidos</label></div>
        {seg === "inactivos" && <p className="mu peq">Inactivo: {P.diasInactivo} días o más desde su última visita.</p>}
        <Vista id="clinica-crm" items={lista} onAbrir={(x) => setSel(x)} vacio="Nadie en este segmento."
          tarjeta={(x) => (
            <div className="form" style={{ gap: 6 }}>
              <div className="cl-entre"><b>{x.nombre}</b>{x.excluido ? <Badge tono="bad">No contactar</Badge> : x.tieneCita ? <Badge tono="ok">Ya tiene cita</Badge> : x.ultimoContacto ? <Badge tono={A.TONO_RESULTADO[x.ultimoContacto.resultado]}>{A.RESULTADOS_CONTACTO[x.ultimoContacto.resultado]}</Badge> : <Badge tono="warn">Sin contactar</Badge>}</div>
              <div className="peq">{x.detalle}</div>
              <div className="mu peq">{x.telefono} · {nomSuc(d, x.sucursalId)} · última visita {x.ultimaVisita ? fechaCorta(x.ultimaVisita) : "—"}</div>
            </div>
          )}
          columnas={[{ k: "n", t: "Paciente", v: (x) => x.nombre }, { k: "d", t: "Motivo", v: (x) => x.detalle, orden: (x) => x.peso }, { k: "t", t: "Teléfono", v: (x) => x.telefono }, { k: "s", t: "Sucursal", v: (x) => nomSuc(d, x.sucursalId) },
            { k: "u", t: "Última visita", v: (x) => (x.ultimaVisita ? fechaCorta(x.ultimaVisita) : "—"), orden: (x) => x.ultimaVisita || "" }, { k: "c", t: "Último contacto", v: (x) => (x.ultimoContacto ? `${fechaCorta(x.ultimoContacto.fecha)} · ${A.RESULTADOS_CONTACTO[x.ultimoContacto.resultado]}` : "—"), orden: (x) => (x.ultimoContacto ? x.ultimoContacto.fecha : "") }]} />
      </>}

      {tab === "campanas" && <div className="lista">
        {camps.map((c) => { const r = A.resumenCampana(d, c); return (
          <Card key={c.id} onClick={() => setCamp(c.id)}>
            <div className="cl-entre"><b>{c.nombre}</b><Badge tono={A.TONO_CAMPANA[c.estado]}>{A.ESTADOS_CAMPANA[c.estado]}</Badge></div>
            <div className="mu peq">{c.folio} · {A.SEGMENTOS[c.segmento]} · {c.sucursalId ? nomSuc(d, c.sucursalId) : "Todas las sucursales"}</div>
            <Barra pct={r.avancePct} tono="info" />
            <div className="peq">{r.contactados}/{r.total} contactados · {r.agendaron} agendaron</div>
          </Card>); })}
        {!camps.length && <Vacio icon="megaphone">Sin campañas.</Vacio>}
      </div>}

      {tab === "bitacora" && <div className="lista">
        {contactos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 80).map((c) => (
          <Fila key={c.id} titulo={A.nombrePac(d, c.pacienteId)} sub={`${A.CANALES_CONTACTO[c.canal]} · ${A.nombreCorto(d, c.usuarioId)}${c.nota ? ` · ${c.nota}` : ""}`} datos={`${fechaCorta(c.fecha)} ${hora(c.fecha)}`} badge={<Badge tono={A.TONO_RESULTADO[c.resultado]}>{A.RESULTADOS_CONTACTO[c.resultado]}</Badge>} />
        ))}
        {!contactos.length && <Vacio icon="phone">Aún no hay contactos registrados.</Vacio>}
      </div>}

      <div style={{ height: 70 }} />
      {A.puede(u, "crm.campanas") && <BarraAccion><Button block icon="megaphone" onClick={() => setNuevaCamp(true)}>Nueva campaña</Button></BarraAccion>}
      {sel && <Contactar fila={sel} segmento={seg} onClose={() => setSel(null)} />}
      {camp && <DetalleCampana id={camp} onClose={() => setCamp(null)} onContactar={(f) => setSel(f)} />}
      {nuevaCamp && <NuevaCampana onClose={() => setNuevaCamp(false)} />}
    </div>
  );
}

function Contactar({ fila, segmento, campanaId = null, onClose }) {
  const { d, u, sucursal } = useSesion();
  const p = d.pacientes.find((x) => x.id === fila.pacienteId);
  const camp = campanaId ? ((d.crm || {}).campanas || []).find((c) => c.id === campanaId) : null;
  const [f, setF] = useState({ canal: p && p.whatsapp ? "whatsapp" : "telefono", resultado: "contactado", nota: "" });
  if (!p) return null;
  const msg = A.vistaPreviaMensaje((camp && camp.mensaje) || A.MENSAJES_BASE[segmento] || A.MENSAJES_BASE.inactivos, { nombre: p.nombres.split(" ")[0], sucursal: (d.sucursales.find((s) => s.id === p.sucursalAlta) || sucursal || {}).nombre || "", dias: fila.detalle, telefono: p.telefono });
  const wa = A.ligaWhatsApp(p.telefono, msg), tel = A.ligaTel(p.telefono);
  const excluido = ((d.crm || {}).noContactar || []).includes(p.id);
  const hist = A.bitacoraContacto(d, p.id);
  const guardar = () => { const r = mutar((dd) => A.registrarContacto(dd, { pacienteId: p.id, ...f, campanaId, segmento }, yo(dd), dd.sesion.sucursalId)); if (resultado(r, aviso, "Contacto anotado")) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo={`${p.nombres} ${p.apellidos}`} pie={!excluido && A.puede(u, "crm.contactar") && <Button block onClick={guardar}>Anotar resultado</Button>}>
      <div className="form">
        <Resumen filas={[["Motivo", fila.detalle], ["Teléfono", `${p.telefono}${p.whatsapp ? " · WhatsApp" : ""}`], ["Última visita", fila.ultimaVisita ? fechaCorta(fila.ultimaVisita) : "—"], fila.tieneCita && ["Cita", "Ya tiene una cita próxima"]]} />
        {excluido ? <div className="card card-bad">Pidió no ser contactado (o ejerció un derecho ARCO). No se le contacta.
          {A.puede(u, "crm.aprobar") && <div style={{ marginTop: 8 }}><Button variante="sec" className="btn-peq" onClick={() => { const r = mutar((dd) => A.permitirContacto(dd, p.id, yo(dd))); resultado(r, aviso, "El paciente vuelve a recibir contacto"); }}>Permitir contacto de nuevo</Button></div>}</div> : <>
          <Titulo>Mensaje sugerido</Titulo>
          <Card><p className="txt peq">{msg}</p></Card>
          <div className="dos">
            {wa && p.whatsapp ? <a className="btn btn-primary btn-block" href={wa} target="_blank" rel="noreferrer">Abrir WhatsApp</a> : <Button block disabled>Sin WhatsApp</Button>}
            {tel ? <a className="btn btn-sec btn-block" href={tel}>Llamar</a> : <Button variante="sec" block disabled>Sin teléfono válido</Button>}
          </div>
          {/* INTEGRACIÓN: envío por proveedor de WhatsApp Business. No contratado: el envío es manual desde el teléfono de la sucursal. */}
          <p className="cl-sim">Contacto manual: se abre WhatsApp o la llamada en tu dispositivo; el sistema no envía nada. Anota después cómo te fue.</p>
          <div className="form2">
            <Field label="Canal"><Select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>{Object.entries(A.CANALES_CONTACTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Resultado"><Select value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value })}>{Object.entries(A.RESULTADOS_CONTACTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          </div>
          <Field label="Nota"><Area value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Field>
        </>}
        <Titulo>Historial de contacto</Titulo>
        {hist.map((c) => <div key={c.id} className="cl-nota">{A.RESULTADOS_CONTACTO[c.resultado]} · {A.CANALES_CONTACTO[c.canal]}{c.nota ? ` · ${c.nota}` : ""}<small>{fechaCorta(c.fecha)} {hora(c.fecha)} · {A.nombreCorto(d, c.usuarioId)}</small></div>)}
        {!hist.length && <p className="mu peq">Sin contactos previos.</p>}
      </div>
    </Sheet>
  );
}

function DetalleCampana({ id, onClose }) {
  const { d, u } = useSesion();
  const c = ((d.crm || {}).campanas || []).find((x) => x.id === id);
  const [cont, setCont] = useState(null);
  if (!c) return null;
  const r = A.resumenCampana(d, c);
  const ult = new Map();
  ((d.crm || {}).contactos || []).filter((x) => x.campanaId === c.id).forEach((x) => { if (!ult.has(x.pacienteId) || ult.get(x.pacienteId).fecha < x.fecha) ult.set(x.pacienteId, x); });
  const activa = ["aprobada", "en_curso"].includes(c.estado);
  return (
    <Sheet abierto onClose={onClose} titulo={c.nombre} pie={<div className="dos">
      {c.estado === "borrador" && A.puede(u, "crm.aprobar") && <Button block variante="ok" onClick={() => { const x = mutar((dd) => A.aprobarCampana(dd, c.id, yo(dd))); resultado(x, aviso, "Campaña aprobada"); }}>Aprobar</Button>}
      {activa && A.puede(u, "crm.campanas") && <Button block variante="sec" onClick={() => { const x = mutar((dd) => A.terminarCampana(dd, c.id, yo(dd))); resultado(x, aviso, "Campaña terminada"); }}>Terminar</Button>}
    </div>}>
      <div className="form">
        <Resumen filas={[["Folio", c.folio], ["Estado", A.ESTADOS_CAMPANA[c.estado]], ["Segmento", A.SEGMENTOS[c.segmento]], ["Sucursal", c.sucursalId ? nomSuc(d, c.sucursalId) : "Todas"], ["Creada", `${fechaCorta(c.creada)} · ${A.nombreCorto(d, c.creadaPor)}`], c.aprobadaPor && ["Aprobada", `${fechaCorta(c.aprobadaEn)} · ${A.nombreCorto(d, c.aprobadaPor)}`], ["Avance", `${r.contactados}/${r.total} · ${r.agendaron} agendaron`, true]]} />
        {c.estado === "borrador" && <div className="card card-warn">La campaña espera la aprobación de Administración antes de contactar.</div>}
        <Titulo>Destinatarios</Titulo>
        <div className="lista">{c.destinatarios.map((pid) => { const x = ult.get(pid), p = d.pacientes.find((y) => y.id === pid); return (
          <Fila key={pid} titulo={A.nombrePac(d, pid)} sub={p ? p.telefono : ""} badge={x ? <Badge tono={A.TONO_RESULTADO[x.resultado]}>{A.RESULTADOS_CONTACTO[x.resultado]}</Badge> : <Badge tono="neutral">Pendiente</Badge>}
            onClick={activa && A.puede(u, "crm.contactar") ? () => setCont({ pacienteId: pid, detalle: c.nombre, ultimaVisita: A.mapaUltimaVisita(d).get(pid) || null }) : undefined} />); })}</div>
      </div>
      {cont && <Contactar fila={cont} segmento={c.segmento} campanaId={c.id} onClose={() => setCont(null)} />}
    </Sheet>
  );
}

function NuevaCampana({ onClose }) {
  const { d, u } = useSesion();
  const sucs = A.esAdmin(u) ? d.sucursales.map((s) => s.id) : u.sucursales;
  const [f, setF] = useState({ nombre: "", segmento: "inactivos", sucursalId: A.esAdmin(u) ? "" : sucs[0], mensaje: A.MENSAJES_BASE.inactivos });
  const n = useMemo(() => A.listaContacto(d, { segmento: f.segmento, sucursales: f.sucursalId ? [f.sucursalId] : null }).filter((x) => !x.excluido).length, [d, f.segmento, f.sucursalId]);
  const guardar = () => { const r = mutar((dd) => A.crearCampana(dd, f, yo(dd))); if (resultado(r, aviso, r.campana && r.campana.estado === "aprobada" ? "Campaña creada y aprobada" : "Campaña creada: espera aprobación de Administración")) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Nueva campaña" pie={<Button block onClick={guardar}>Crear campaña · {n} pacientes</Button>}>
      <div className="form">
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Reactivación de invierno" /></Field>
        <Field label="Segmento"><Select value={f.segmento} onChange={(e) => setF({ ...f, segmento: e.target.value, mensaje: A.MENSAJES_BASE[e.target.value] })}>{Object.entries(A.SEGMENTOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Sucursal"><Select value={f.sucursalId} onChange={(e) => setF({ ...f, sucursalId: e.target.value })}>{A.esAdmin(u) && <option value="">Todas</option>}{sucs.map((s) => <option key={s} value={s}>{nomSuc(d, s)}</option>)}</Select></Field>
        <Field label="Mensaje" hint="Variables: {{nombre}}, {{sucursal}}, {{dias}}"><Area rows={4} value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} /></Field>
        <p className="mu peq">La lista de destinatarios se congela al crearla y excluye a quien pidió no ser contactado.</p>
      </div>
    </Sheet>
  );
}
