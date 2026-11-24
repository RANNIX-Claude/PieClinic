// Más ▸ Quejas y derechos ARCO (porte de Pie Firme: Quejas, migración 039). P-020 meta de 3 días naturales, P-021 evento adverso
// ligado a la sesión, P-022 compensación con costo autorizada por Administración, P-141 ARCO a 20 días. Semáforo de plazos.
// Recepción registra; gerente da seguimiento en su sucursal; Administración/Dirección ve todo, autoriza compensaciones y atiende ARCO.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_clinica.js";
import { dinero, fechaCorta, hora, hoy } from "../../lib/format.js";
import { Area, Badge, BarraAccion, Button, Buscador, Card, Chips, Field, Input, Kpi, Resumen, Select, Sheet, Titulo, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { CampoPaciente, FiltroSucursal, Semaforo, SinAcceso, resultado } from "../../componentes/clinica/comunes.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);
const nomSuc = (d, id) => (d.sucursales.find((s) => s.id === id) || {}).nombre || id;

export default function Quejas() {
  const { d, u } = useSesion();
  const [tab, setTab] = useState("quejas");
  const [f, setF] = useState("abiertas");
  const [suc, setSuc] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [selA, setSelA] = useState(null);
  const [nueva, setNueva] = useState(null);
  const ref = hoy();
  const quejas = useMemo(() => A.quejasVisibles(d, u), [d, u]);
  const arco = useMemo(() => A.arcoVisibles(d, u), [d, u]);
  if (!A.puede(u, "quejas.ver")) return <SinAcceso>Las quejas las registra Recepción y les da seguimiento el gerente.</SinAcceso>;
  const enSuc = (x) => !suc || x.sucursalId === suc;
  const qs = quejas.filter(enSuc), as = arco.filter(enSuc);
  const R = A.resumenQuejas(qs, ref);
  const FQ = { abiertas: A.quejaAbierta, vencidas: (x) => A.quejaAbierta(x) && A.semaforoQueja(x, ref).color === "rojo", adversos: (x) => x.clase === "evento_adverso", compensacion: (x) => x.compensacion && x.compensacion.estado === "propuesta", todas: () => true };
  const listaQ = qs.filter(FQ[f]).filter((x) => A.buscarTexto(q, x.folio, A.nombrePac(d, x.pacienteId), x.descripcion, A.TIPOS_QUEJA[x.tipo])).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const listaA = as.filter((x) => (f === "abiertas" ? A.arcoAbierta(x) : true)).filter((x) => A.buscarTexto(q, x.folio, A.nombrePac(d, x.pacienteId))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const arcoAbiertas = as.filter(A.arcoAbierta);
  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Quejas abiertas" valor={R.abiertas} />
        <Kpi label="Vencidas (3 días)" valor={R.vencidas} tono={R.vencidas ? "bad" : undefined} nota={R.porVencer ? `${R.porVencer} por vencer` : "P-020"} />
        <Kpi label="Resueltas a tiempo" valor={R.aTiempoPct == null ? "—" : `${R.aTiempoPct} %`} nota={R.tiempoMedio == null ? "" : `${R.tiempoMedio} días en promedio`} />
        <Kpi label="ARCO abiertas" valor={arcoAbiertas.length} tono={arcoAbiertas.some((x) => A.semaforoArco(x, ref).color === "rojo") ? "bad" : undefined} nota="20 días" />
      </div>
      {R.eventosAdversos > 0 && <Card tono="bad">{R.eventosAdversos} evento(s) adverso(s) clínico(s) abierto(s): requieren revisión del podólogo y de Dirección.</Card>}
      {A.puede(u, "quejas.compensar") && R.compensacionesPendientes > 0 && <Card tono="warn"><div className="cl-entre"><span>{R.compensacionesPendientes} compensación(es) esperan tu autorización (P-022).</span><Button className="btn-peq" variante="sec" onClick={() => { setTab("quejas"); setF("compensacion"); }}>Ver</Button></div></Card>}
      <FiltroSucursal d={d} ids={A.sucursalesVisibles(d, u)} valor={suc} onChange={setSuc} />
      <Chips valor={tab} onChange={(v) => { setTab(v); setF("abiertas"); }} opciones={[{ v: "quejas", l: "Quejas", n: qs.length }, { v: "arco", l: "Derechos ARCO", n: as.length }]} />
      {tab === "quejas" ? <Chips scroll valor={f} onChange={setF} opciones={[["abiertas", "Abiertas"], ["vencidas", "Vencidas"], ["adversos", "Eventos adversos"], ["compensacion", "Compensación por autorizar"], ["todas", "Todas"]].map(([v, l]) => ({ v, l, n: qs.filter(FQ[v]).length }))} />
        : <Chips valor={f} onChange={setF} opciones={[{ v: "abiertas", l: "Abiertas", n: arcoAbiertas.length }, { v: "todas", l: "Todas", n: as.length }]} />}
      <Buscador valor={q} onChange={setQ} placeholder="Folio, paciente o texto" />
      {tab === "quejas" ? <Vista id="clinica-quejas" items={listaQ} onAbrir={(x) => setSel(x.id)} vacio="Sin quejas en este filtro."
        tarjeta={(x) => (
          <div className="form" style={{ gap: 6 }}>
            <div className="cl-entre"><b>{x.folio}</b><Badge tono={A.TONO_QUEJA[x.estado]}>{A.ESTADOS_QUEJA[x.estado]}</Badge></div>
            <div className="peq">{A.TIPOS_QUEJA[x.tipo]} · <Badge tono={A.TONO_GRAVEDAD[x.gravedad]}>{A.GRAVEDADES[x.gravedad]}</Badge>{x.clase === "evento_adverso" && <> <Badge tono="bad">Evento adverso</Badge></>}</div>
            <div className="mu peq">{x.pacienteId ? A.nombrePac(d, x.pacienteId) : "Sin paciente"} · {nomSuc(d, x.sucursalId)} · {fechaCorta(x.fecha)}</div>
            <Semaforo s={A.semaforoQueja(x, ref)} />
          </div>
        )}
        columnas={[{ k: "f", t: "Folio", v: (x) => x.folio }, { k: "fe", t: "Fecha", v: (x) => fechaCorta(x.fecha), orden: (x) => x.fecha }, { k: "p", t: "Paciente", v: (x) => (x.pacienteId ? A.nombrePac(d, x.pacienteId) : "—") }, { k: "s", t: "Sucursal", v: (x) => nomSuc(d, x.sucursalId) },
          { k: "t", t: "Tipo", v: (x) => A.TIPOS_QUEJA[x.tipo] }, { k: "g", t: "Gravedad", v: (x) => <Badge tono={A.TONO_GRAVEDAD[x.gravedad]}>{A.GRAVEDADES[x.gravedad]}</Badge>, orden: (x) => ["baja", "media", "alta"].indexOf(x.gravedad) },
          { k: "r", t: "Responsable", v: (x) => (x.responsableId ? A.nombreCorto(d, x.responsableId) : "Sin asignar") }, { k: "pl", t: "Plazo", v: (x) => <Semaforo s={A.semaforoQueja(x, ref)} />, orden: (x) => x.limite },
          { k: "e", t: "Estado", v: (x) => <Badge tono={A.TONO_QUEJA[x.estado]}>{A.ESTADOS_QUEJA[x.estado]}</Badge>, orden: (x) => x.estado }]} />
        : <Vista id="clinica-arco" items={listaA} onAbrir={(x) => setSelA(x.id)} vacio="Sin solicitudes ARCO."
          tarjeta={(x) => (
            <div className="form" style={{ gap: 6 }}>
              <div className="cl-entre"><b>{x.folio} · {A.DERECHOS_ARCO[x.derecho]}</b><Badge tono={A.TONO_ARCO[x.estado]}>{A.ESTADOS_ARCO[x.estado]}</Badge></div>
              <div className="mu peq">{A.nombrePac(d, x.pacienteId)} · {nomSuc(d, x.sucursalId)} · {fechaCorta(x.fecha)}</div>
              <Semaforo s={A.semaforoArco(x, ref)} />
            </div>
          )}
          columnas={[{ k: "f", t: "Folio", v: (x) => x.folio }, { k: "d", t: "Derecho", v: (x) => A.DERECHOS_ARCO[x.derecho] }, { k: "p", t: "Titular", v: (x) => A.nombrePac(d, x.pacienteId) }, { k: "fe", t: "Recibida", v: (x) => fechaCorta(x.fecha), orden: (x) => x.fecha },
            { k: "l", t: "Plazo", v: (x) => <Semaforo s={A.semaforoArco(x, ref)} />, orden: (x) => x.limite }, { k: "e", t: "Estado", v: (x) => <Badge tono={A.TONO_ARCO[x.estado]}>{A.ESTADOS_ARCO[x.estado]}</Badge>, orden: (x) => x.estado }]} />}
      <div style={{ height: 70 }} />
      <BarraAccion><div className="dos">
        <Button block icon="plus" disabled={!A.puede(u, "quejas.registrar")} onClick={() => setNueva("queja")}>Nueva queja</Button>
        <Button block variante="sec" icon="shield" disabled={!A.puede(u, "arco.registrar")} onClick={() => setNueva("arco")}>Solicitud ARCO</Button>
      </div></BarraAccion>
      {nueva === "queja" && <NuevaQueja onClose={() => setNueva(null)} />}
      {nueva === "arco" && <NuevaArco onClose={() => setNueva(null)} />}
      {sel && <DetalleQueja id={sel} onClose={() => setSel(null)} />}
      {selA && <DetalleArco id={selA} onClose={() => setSelA(null)} />}
    </div>
  );
}

function NuevaQueja({ onClose }) {
  const { d, u, sucursalId } = useSesion();
  const sucs = A.sucursalesVisibles(d, u);
  const [f, setF] = useState({ pacienteId: "", clase: "administrativa", tipo: "tiempo_espera", gravedad: "media", canal: "presencial", descripcion: "", consultaId: "", podologoId: "", sucursalId: sucs.includes(sucursalId) ? sucursalId : sucs[0], responsableId: "" });
  const [err, setErr] = useState({});
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const sesiones = f.pacienteId ? d.consultas.filter((c) => c.pacienteId === f.pacienteId).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 10) : [];
  const resp = d.usuarios.filter((x) => (x.rol === "gerente" && x.sucursales.includes(f.sucursalId)) || ["admin", "direccion"].includes(x.rol));
  const adverso = f.clase === "evento_adverso";
  const guardar = () => {
    const r = mutar((dd) => A.registrarQueja(dd, f, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) { setErr(r.errores || {}); return aviso(r.error, "bad"); }
    aviso(`${r.queja.folio} registrada · límite ${fechaCorta(r.queja.limite)}`); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Nueva queja o incidencia" pie={<Button block onClick={guardar}>Registrar queja</Button>}>
      <div className="form">
        <Field label="Clase" error={err.clase}><Chips valor={f.clase} onChange={(v) => setF((x) => ({ ...x, clase: v, tipo: v === "evento_adverso" ? "evento_adverso_infeccion" : "tiempo_espera", gravedad: v === "evento_adverso" ? "alta" : x.gravedad }))} opciones={[{ v: "administrativa", l: "Administrativa" }, { v: "evento_adverso", l: "Evento adverso clínico" }]} /></Field>
        <CampoPaciente d={d} valor={f.pacienteId} onChange={(v) => setF((x) => ({ ...x, pacienteId: v, consultaId: "" }))} opcional={!adverso} label={adverso ? "Paciente (obligatorio)" : "Paciente (opcional)"} error={err.pacienteId} />
        {f.pacienteId && <Field label={adverso ? "Sesión ligada (obligatoria, P-021)" : "Sesión ligada (opcional)"} error={err.consultaId}>
          <Select value={f.consultaId} onChange={(e) => { const c = d.consultas.find((x) => x.id === e.target.value); setF((x) => ({ ...x, consultaId: e.target.value, podologoId: c ? c.podologoId : x.podologoId })); }}>
            <option value="">Sin sesión</option>{sesiones.map((c) => <option key={c.id} value={c.id}>{fechaCorta(c.fecha)} · {A.nombreCorto(d, c.podologoId)} · {c.diagnostico}</option>)}
          </Select></Field>}
        <div className="form2">
          <Field label="Tipo" error={err.tipo}><Select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{Object.entries(A.TIPOS_QUEJA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Gravedad" error={err.gravedad}><Select value={f.gravedad} onChange={(e) => set("gravedad", e.target.value)}>{Object.entries(A.GRAVEDADES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Canal"><Select value={f.canal} onChange={(e) => set("canal", e.target.value)}>{Object.entries(A.CANALES_QUEJA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Sucursal" error={err.sucursalId}><Select value={f.sucursalId} onChange={(e) => set("sucursalId", e.target.value)}>{sucs.map((s) => <option key={s} value={s}>{nomSuc(d, s)}</option>)}</Select></Field>
        </div>
        <Field label="Responsable de seguimiento"><Select value={f.responsableId} onChange={(e) => set("responsableId", e.target.value)}><option value="">Sin asignar</option>{resp.map((x) => <option key={x.id} value={x.id}>{A.nombreCorto(d, x.id)}</option>)}</Select></Field>
        <Field label="Descripción" error={err.descripcion}><Area value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Qué pasó, cuándo y qué pide el paciente" /></Field>
        <p className="mu peq">Meta de resolución: {A.paramsClinica(d).diasQueja} días naturales (P-020). Un evento adverso de gravedad alta se escala solo a Administración.</p>
      </div>
    </Sheet>
  );
}

function DetalleQueja({ id, onClose }) {
  const { d, u } = useSesion();
  const x = (d.quejas || []).find((y) => y.id === id);
  const [p, setP] = useState(() => ({ estado: x ? x.estado : "", responsableId: (x && x.responsableId) || "", fechaCompromiso: (x && x.fechaCompromiso) || "", resolucion: (x && x.resolucion) || "", nota: "" }));
  const [comp, setComp] = useState({ tipo: "disculpa", monto: "" });
  const [motivo, setMotivo] = useState("");
  if (!x) return null;
  const co = x.consultaId ? d.consultas.find((c) => c.id === x.consultaId) : null;
  const resolver = A.puede(u, "quejas.resolver") && A.alcanza(d, u, x.sucursalId);
  const resp = d.usuarios.filter((y) => (y.rol === "gerente" && y.sucursales.includes(x.sucursalId)) || ["admin", "direccion"].includes(y.rol));
  const acc = (fn, ok) => { const r = mutar((dd) => fn(dd, yo(dd))); resultado(r, aviso, ok); return r; };
  return (
    <Sheet abierto onClose={onClose} titulo={`${x.folio} · ${A.TIPOS_QUEJA[x.tipo]}`} pie={resolver && x.estado !== "cerrada" && <Button block onClick={() => { if (acc((dd, uu) => A.actualizarQueja(dd, x.id, p, uu), "Seguimiento guardado").ok) setP((y) => ({ ...y, nota: "" })); }}>Guardar seguimiento</Button>}>
      <div className="form">
        <div className="cl-entre"><Semaforo s={A.semaforoQueja(x)} /><Badge tono={A.TONO_QUEJA[x.estado]}>{A.ESTADOS_QUEJA[x.estado]}</Badge></div>
        <Card><p className="txt">{x.descripcion}</p></Card>
        <Resumen filas={[["Clase", A.CLASES_QUEJA[x.clase]], ["Gravedad", A.GRAVEDADES[x.gravedad]], ["Paciente", x.pacienteId ? A.nombrePac(d, x.pacienteId) : "Sin paciente"], co && ["Sesión ligada", `${fechaCorta(co.fecha)} · ${co.diagnostico}`], x.podologoId && ["Podólogo señalado", A.nombreCorto(d, x.podologoId)],
          ["Sucursal", nomSuc(d, x.sucursalId)], ["Canal", A.CANALES_QUEJA[x.canal]], ["Recibida", `${fechaCorta(x.fecha)} ${hora(x.fecha)} · ${A.nombreCorto(d, x.registradaPor)}`], ["Límite (3 días)", fechaCorta(x.limite)], x.resueltaEn && ["Resuelta", fechaCorta(x.resueltaEn)]]} />
        {resolver && x.estado !== "cerrada" ? <>
          <div className="form2">
            <Field label="Estado"><Select value={p.estado} onChange={(e) => setP({ ...p, estado: e.target.value })}>{Object.entries(A.ESTADOS_QUEJA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Fecha compromiso"><Input type="date" value={p.fechaCompromiso} onChange={(e) => setP({ ...p, fechaCompromiso: e.target.value })} /></Field>
          </div>
          <Field label="Responsable"><Select value={p.responsableId} onChange={(e) => setP({ ...p, responsableId: e.target.value })}><option value="">Sin asignar</option>{resp.map((y) => <option key={y.id} value={y.id}>{A.nombreCorto(d, y.id)}</option>)}</Select></Field>
          <Field label="Resolución / acción correctiva"><Area value={p.resolucion} onChange={(e) => setP({ ...p, resolucion: e.target.value })} /></Field>
          <Field label="Nota de seguimiento"><Input value={p.nota} onChange={(e) => setP({ ...p, nota: e.target.value })} /></Field>
        </> : x.resolucion && <Resumen filas={[["Resolución", x.resolucion]]} />}

        <Titulo>Compensación (P-022)</Titulo>
        {x.compensacion ? <Card tono={x.compensacion.estado === "autorizada" ? "ok" : x.compensacion.estado === "rechazada" ? "bad" : "warn"}>
          <b>{A.COMPENSACIONES[x.compensacion.tipo]}{x.compensacion.monto ? ` · ${dinero(x.compensacion.monto)}` : ""}</b>
          <div className="peq">{x.compensacion.estado === "propuesta" ? `Propuesta por ${A.nombreCorto(d, x.compensacion.propuestaPor)}: espera autorización de Administración.` : x.compensacion.estado === "autorizada" ? `Autorizada por ${A.nombreCorto(d, x.compensacion.autorizadaPor)}.` : `Rechazada: ${x.compensacion.motivoRechazo || ""}`}</div>
          {x.compensacion.estado === "propuesta" && A.puede(u, "quejas.compensar") && <div className="form" style={{ marginTop: 8 }}>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (solo si se rechaza)" />
            <div className="dos"><Button variante="danger" block onClick={() => acc((dd, uu) => A.resolverCompensacion(dd, x.id, false, uu, motivo), "Compensación rechazada")}>Rechazar</Button><Button variante="ok" block onClick={() => acc((dd, uu) => A.resolverCompensacion(dd, x.id, true, uu), "Compensación autorizada")}>Autorizar</Button></div>
          </div>}
        </Card> : <p className="mu peq">Sin compensación.</p>}
        {resolver && (!x.compensacion || x.compensacion.estado === "rechazada") && x.estado !== "cerrada" && <div className="form">
          <div className="form2">
            <Field label="Proponer"><Select value={comp.tipo} onChange={(e) => setComp({ ...comp, tipo: e.target.value })}>{Object.entries(A.COMPENSACIONES).filter(([k]) => k !== "ninguna").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            {["reembolso", "descuento"].includes(comp.tipo) && <Field label="Monto"><Input inputMode="decimal" value={comp.monto} onChange={(e) => setComp({ ...comp, monto: e.target.value })} /></Field>}
          </div>
          {A.compensacionConCosto(comp.tipo) && !A.puede(u, "quejas.compensar") && <p className="mu peq">Tiene costo: queda como propuesta hasta que Administración la autorice.</p>}
          <Button variante="sec" onClick={() => acc((dd, uu) => A.proponerCompensacion(dd, x.id, comp, uu), "Compensación registrada")}>Registrar compensación</Button>
        </div>}

        <Titulo>Bitácora</Titulo>
        {[...x.seguimiento].reverse().map((s, i) => <div key={i} className="cl-nota">{s.texto}<small>{fechaCorta(s.fecha)} {hora(s.fecha)} · {A.nombreCorto(d, s.por)}</small></div>)}
        {!resolver && A.puede(u, "quejas.registrar") && x.estado !== "cerrada" && <NotaRapida onGuardar={(t) => acc((dd, uu) => A.notaQueja(dd, x.id, t, uu), "Nota agregada")} />}
      </div>
    </Sheet>
  );
}
function NotaRapida({ onGuardar }) {
  const [t, setT] = useState("");
  return <div className="cl-fila-h"><Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Agregar nota" style={{ flex: 1 }} /><Button className="btn-peq" onClick={() => { if (onGuardar(t).ok) setT(""); }}>Anotar</Button></div>;
}

function NuevaArco({ onClose }) {
  const { d, u, sucursalId } = useSesion();
  const sucs = A.sucursalesVisibles(d, u);
  const [f, setF] = useState({ pacienteId: "", derecho: "acceso", descripcion: "", medio: "presencial", identidadVerificada: false, sucursalId: sucs.includes(sucursalId) ? sucursalId : sucs[0] });
  const [err, setErr] = useState({});
  const guardar = () => { const r = mutar((dd) => A.registrarArco(dd, f, yo(dd), dd.sesion.sucursalId)); if (!r.ok) { setErr(r.errores || {}); return aviso(r.error, "bad"); } aviso(`${r.solicitud.folio} recibida · respuesta a más tardar ${fechaCorta(r.solicitud.limite)}`); onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Solicitud de derechos ARCO" pie={<Button block onClick={guardar}>Registrar solicitud</Button>}>
      <div className="form">
        <CampoPaciente d={d} valor={f.pacienteId} onChange={(v) => setF({ ...f, pacienteId: v })} label="Titular de los datos" error={err.pacienteId} />
        <Field label="Derecho" error={err.derecho}><Chips valor={f.derecho} onChange={(v) => setF({ ...f, derecho: v })} opciones={Object.entries(A.DERECHOS_ARCO).map(([v, l]) => ({ v, l }))} /></Field>
        <div className="form2">
          <Field label="Medio"><Select value={f.medio} onChange={(e) => setF({ ...f, medio: e.target.value })}><option value="presencial">Presencial</option><option value="correo">Correo</option></Select></Field>
          <Field label="Sucursal" error={err.sucursalId}><Select value={f.sucursalId} onChange={(e) => setF({ ...f, sucursalId: e.target.value })}>{sucs.map((s) => <option key={s} value={s}>{nomSuc(d, s)}</option>)}</Select></Field>
        </div>
        <label className="cl-fila-h peq"><input type="checkbox" checked={f.identidadVerificada} onChange={(e) => setF({ ...f, identidadVerificada: e.target.checked })} /> Se verificó la identidad del titular (INE o representante legal)</label>
        <Field label="Qué solicita" error={err.descripcion}><Area value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Field>
        <p className="mu peq">Plazo de respuesta: {A.paramsClinica(d).diasArco} días naturales (P-141). La atiende el responsable de datos personales (Administración).</p>
      </div>
    </Sheet>
  );
}

function DetalleArco({ id, onClose }) {
  const { d, u } = useSesion();
  const a = (d.arco || []).find((x) => x.id === id);
  const [f, setF] = useState({ estado: a && a.estado === "recibida" ? "en_proceso" : "atendida", respuesta: (a && a.respuesta) || "" });
  if (!a) return null;
  const atiende = A.puede(u, "arco.atender") && A.arcoAbierta(a);
  return (
    <Sheet abierto onClose={onClose} titulo={`${a.folio} · ${A.DERECHOS_ARCO[a.derecho]}`} pie={atiende && <Button block onClick={() => { const r = mutar((dd) => A.atenderArco(dd, a.id, f, yo(dd))); if (resultado(r, aviso, "Solicitud actualizada")) onClose(); }}>Guardar</Button>}>
      <div className="form">
        <div className="cl-entre"><Semaforo s={A.semaforoArco(a)} /><Badge tono={A.TONO_ARCO[a.estado]}>{A.ESTADOS_ARCO[a.estado]}</Badge></div>
        <Card><p className="txt">{a.descripcion}</p></Card>
        <Resumen filas={[["Titular", A.nombrePac(d, a.pacienteId)], ["Sucursal", nomSuc(d, a.sucursalId)], ["Medio", a.medio === "correo" ? "Correo" : "Presencial"], ["Identidad verificada", a.identidadVerificada ? "Sí" : "No"], ["Recibida", `${fechaCorta(a.fecha)} · ${A.nombreCorto(d, a.registradaPor)}`], ["Límite (20 días)", fechaCorta(a.limite)], a.atendidaEn && ["Cerrada", `${fechaCorta(a.atendidaEn)} · ${A.nombreCorto(d, a.atendidaPor)}`], a.respuesta && ["Respuesta", a.respuesta]]} />
        {!a.identidadVerificada && <div className="card card-warn">Falta verificar la identidad del titular antes de entregar o modificar datos.</div>}
        {atiende ? <>
          <Field label="Estado"><Select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>{Object.entries(A.ESTADOS_ARCO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Respuesta al titular"><Area value={f.respuesta} onChange={(e) => setF({ ...f, respuesta: e.target.value })} /></Field>
          {["cancelacion", "oposicion"].includes(a.derecho) && <p className="mu peq">Al atenderla, el titular queda excluido de las campañas de Seguimiento.</p>}
        </> : A.arcoAbierta(a) && <p className="mu peq">La atiende Administración (responsable de datos personales).</p>}
      </div>
    </Sheet>
  );
}
