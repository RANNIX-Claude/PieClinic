// Evaluación de clientes: encuesta corta al terminar la cita (3 calificaciones 1–5 y comentario). Tablero por sucursal y por podólogo,
// respuestas, alerta inmediata de calificaciones ≤ 2 con seguimiento y envío SIMULADO de la encuesta (integración pendiente).
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_desempeno.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Fila, Kpi, Resumen, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { dinero, fechaCorta, hora } from "../../lib/format.js";
import { Estrellas } from "../../componentes/desempeno/graficas.jsx";
import { Progreso } from "../../componentes/desempeno/comunes.jsx";

const run = (fn, textoOk) => {
  const r = mutar(fn);
  if (r && r.ok) aviso(textoOk || "Listo."); else aviso((r && r.error) || "No se pudo completar.", "bad");
  return r;
};
const Tend = ({ v }) => (v == null ? <span className="mu peq">—</span> : <span className={v >= 0 ? "dsp-tend-up" : "dsp-tend-dn"}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}</span>);
const SIMULACION = "Simulación de demostración: en producción el envío saldría por la API de WhatsApp o por correo saliente (integración pendiente de contratar). Aquí solo se registra que se «envió».";

function Voto({ etiqueta, valor, onChange }) {
  return (
    <div className="field"><span>{etiqueta}</span>
      <div className="dsp-voto" role="radiogroup" aria-label={etiqueta}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={valor === n} className={valor === n ? "on" : ""} onClick={() => onChange(n)}>{n}</button>)}</div>
    </div>
  );
}

export default function Evaluaciones() {
  const { d, u } = useSesion();
  const [tab, setTab] = useState("tablero");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [suc, setSuc] = useState("todas");
  const [sel, setSel] = useState(null);
  const [envio, setEnvio] = useState(null);
  const [resp, setResp] = useState(null);
  const [seg, setSeg] = useState(null);
  const base = useMemo(() => A.evaluacionesVisibles(d, u), [d, u]);
  const permitido = u && (A.esAdmin(u) || ["gerente", "recepcion", "podologo"].includes(u.rol));
  const gestiona = u && (A.esAdmin(u) || ["gerente", "recepcion"].includes(u.rol));
  const sucs = [...new Set(base.map((e) => e.sucursalId))].sort();
  const lista = useMemo(() => (suc === "todas" ? base : base.filter((e) => e.sucursalId === suc)), [base, suc]);
  const stats = useMemo(() => A.estadisticasEval(lista), [lista]);
  const alertas = useMemo(() => A.alertasEval(lista), [lista]);

  const resps = useMemo(() => {
    let l = lista.filter((e) => e.estado === "respondida");
    if (filtro === "bajas") l = l.filter(A.esBaja);
    if (filtro === "altas") l = l.filter((e) => A.califGeneral(e) >= 4);
    if (filtro === "comentario") l = l.filter((e) => e.comentario);
    return A.buscarEval(d, l, q).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [lista, filtro, q, d]);
  const pendientes = lista.filter((e) => e.estado === "pendiente").sort((a, b) => b.fecha.localeCompare(a.fecha));
  const porSuc = useMemo(() => A.agruparEval(d, lista.filter((e) => e.estado === "respondida"), "sucursal"), [d, lista]);
  const porPod = useMemo(() => A.agruparEval(d, lista.filter((e) => e.estado === "respondida"), "podologo"), [d, lista]);
  if (!permitido) return <Vacio icon="lock">Esta pantalla es para recepción, podólogos, gerentes, Administración y Dirección.</Vacio>;
  const enSel = sel ? base.find((e) => e.id === sel) : null;
  const tabs = [{ v: "tablero", l: "Tablero" }, { v: "respuestas", l: "Respuestas", n: stats.n }, ...(gestiona ? [{ v: "pendientes", l: "Pendientes", n: stats.pendientes }] : [])];

  return (
    <>
      {sucs.length > 1 && <Chips scroll opciones={[{ v: "todas", l: "Todas" }, ...sucs.map((s) => ({ v: s, l: R.nombreSucursal(d, s) }))]} valor={suc} onChange={setSuc} />}
      <div className="dsp-kpis">
        <Kpi label="Calificación general" valor={stats.promGeneral != null ? `${stats.promGeneral} / 5` : "—"} tono="ok" nota={`${stats.n} respuesta(s)`} />
        <Kpi label="NPS-like" valor={stats.nps != null ? stats.nps : "—"} tono="info" nota="% promotores − % detractores" />
        <Kpi label="Alertas por atender" valor={alertas.length} tono={alertas.length ? "bad" : "ok"} nota="calificación de 2 o menos" />
        <Kpi label="Encuestas pendientes" valor={stats.pendientes} tono="warn" nota="sin responder" />
      </div>

      {alertas.length > 0 && (
        <>
          <Titulo>Alertas: calificaciones de 2 o menos</Titulo>
          <div className="lista">{alertas.slice(0, tab === "tablero" ? 6 : 3).map((e) => (
            <Card key={e.id} className="dsp-alerta">
              <div className="fila-flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div><b>{R.nombrePaciente(d, e.pacienteId)}</b><div className="peq mu">{R.nombreSucursal(d, e.sucursalId)} · {R.nombreUsuario(d, e.podologoId)} · {fechaCorta(e.fecha)}</div></div>
                <Badge tono={A.ESTADOS_SEGUIMIENTO[e.seguimiento?.estado || "nuevo"][1]}>{A.ESTADOS_SEGUIMIENTO[e.seguimiento?.estado || "nuevo"][0]}</Badge>
              </div>
              <div className="fila-flex" style={{ gap: 14, flexWrap: "wrap" }}><span className="peq">Servicio <Estrellas valor={e.califServicio} tam={14} /></span><span className="peq">Podólogo <Estrellas valor={e.califPodologo} tam={14} /></span><span className="peq">Sucursal <Estrellas valor={e.califSucursal} tam={14} /></span></div>
              {e.comentario && <q>{e.comentario}</q>}
              {e.seguimiento?.nota && <div className="peq mu">Seguimiento: {e.seguimiento.nota}</div>}
              {gestiona && <div className="dos"><Button variante="sec" onClick={() => setSeg({ id: e.id, estado: "contactado", nota: e.seguimiento?.nota || "" })}>Marcar contactado</Button><Button onClick={() => setSeg({ id: e.id, estado: "resuelto", nota: e.seguimiento?.nota || "" })}>Marcar resuelto</Button></div>}
            </Card>))}</div>
          {alertas.length > 6 && tab === "tablero" && <div className="peq mu">+{alertas.length - 6} alerta(s) más; verlas en Respuestas ▸ Bajas.</div>}
          {!gestiona && <div className="peq mu">El seguimiento de quejas lo da recepción o la gerencia de la sucursal.</div>}
        </>
      )}

      <Chips opciones={tabs} valor={tab} onChange={setTab} />

      {tab === "tablero" && (
        <div className="dsp-grid">
          <div>
            <Titulo>Por sucursal</Titulo>
            <Vista id="ev-suc" items={porSuc} minTarjeta={230} vacio="Sin respuestas todavía." tarjeta={(g) => <GrupoTarjeta g={g} />} columnas={colsGrupo("Sucursal")} />
          </div>
          <div>
            <Titulo>{u.rol === "podologo" ? "Mi calificación" : "Por podólogo"}</Titulo>
            <Vista id="ev-pod" items={porPod} minTarjeta={230} vacio="Sin respuestas todavía." tarjeta={(g) => <GrupoTarjeta g={g} />} columnas={colsGrupo("Podólogo")} />
          </div>
          <div className="dsp-ancho peq mu">NPS-like: promotor = promedio de las 3 calificaciones de 4.5 o más; detractor = 3 o menos. Tendencia: promedio de la mitad más reciente de las respuestas menos el de la mitad anterior (se necesitan al menos 6 respuestas).</div>
        </div>
      )}

      {tab === "respuestas" && (
        <>
          <Buscador valor={q} onChange={setQ} placeholder="Buscar paciente, podólogo o comentario…" />
          <Chips scroll opciones={[{ v: "todas", l: "Todas" }, { v: "bajas", l: "Bajas (≤ 2)" }, { v: "altas", l: "Altas (4–5)" }, { v: "comentario", l: "Con comentario" }]} valor={filtro} onChange={setFiltro} />
          <Vista id="ev-resp" items={resps} onAbrir={(e) => setSel(e.id)} minTarjeta={250} vacio="Sin respuestas con esos filtros."
            tarjeta={(e) => (
              <div className="dsp-tarj">
                <div className="dsp-tarj-top"><div><b>{R.nombrePaciente(d, e.pacienteId)}</b><small>{R.nombreUsuario(d, e.podologoId)} · {R.nombreSucursal(d, e.sucursalId)}</small></div>{A.esBaja(e) ? <Badge tono="bad">Baja</Badge> : <Badge tono="ok">{A.califGeneral(e)}</Badge>}</div>
                <Estrellas valor={A.califGeneral(e)} />
                {e.comentario ? <div className="peq">«{e.comentario}»</div> : <div className="peq mu">Sin comentario</div>}
                <div className="dsp-nota">{fechaCorta(e.fecha)} · {e.canal === "correo" ? "correo" : "WhatsApp"}</div>
              </div>)}
            columnas={[
              { k: "f", t: "Fecha", v: (e) => `${fechaCorta(e.fecha)} ${hora(e.fecha)}`, orden: (e) => e.fecha },
              { k: "p", t: "Paciente", v: (e) => R.nombrePaciente(d, e.pacienteId) },
              { k: "d", t: "Podólogo", v: (e) => R.nombreUsuario(d, e.podologoId) },
              { k: "s", t: "Sucursal", v: (e) => R.nombreSucursal(d, e.sucursalId) },
              { k: "a", t: "Serv.", v: (e) => e.califServicio, der: true }, { k: "b", t: "Pod.", v: (e) => e.califPodologo, der: true }, { k: "c", t: "Suc.", v: (e) => e.califSucursal, der: true },
              { k: "g", t: "General", v: (e) => (A.esBaja(e) ? <Badge tono="bad">{A.califGeneral(e)}</Badge> : A.califGeneral(e)), der: true, orden: (e) => A.califGeneral(e) },
            ]} />
        </>
      )}

      {tab === "pendientes" && gestiona && (
        <>
          <Button variante="sec" icon="refresh" onClick={() => { const r = mutar((x) => A.generarEncuestasFaltantes(x)); r && r.ok ? aviso(r.n ? `${r.n} encuesta(s) creada(s) de citas atendidas.` : "No hay citas atendidas sin encuesta.", r.n ? "ok" : "warn") : aviso(r?.error || "No se pudo.", "bad"); }}>Crear encuestas de citas atendidas sin encuesta</Button>
          <div className="dsp-sim">{SIMULACION}</div>
          <div className="lista">{pendientes.map((e) => (
            <Card key={e.id}>
              <div className="dsp-sec">
                <div className="dsp-cab"><div><b>{R.nombrePaciente(d, e.pacienteId)}</b><div className="peq mu">{R.nombreUsuario(d, e.podologoId)} · {R.nombreSucursal(d, e.sucursalId)} · cita del {fechaCorta(e.fecha)}</div></div>
                  {e.enviadaEn ? <Badge tono="info">Enviada por {e.canal === "correo" ? "correo" : "WhatsApp"}</Badge> : <Badge tono="warn">Por enviar</Badge>}</div>
                <div className="dos"><Button variante="sec" onClick={() => setEnvio({ id: e.id, canal: e.canal || "whatsapp", hecho: false })}>{e.enviadaEn ? "Reenviar" : "Enviar encuesta"}</Button><Button onClick={() => setResp({ id: e.id, a: 0, b: 0, c: 0, texto: "" })}>Simular respuesta</Button></div>
              </div>
            </Card>))}</div>
          {!pendientes.length && <Vacio icon="check">No hay encuestas pendientes.</Vacio>}
        </>
      )}

      <DetalleRespuesta d={d} e={enSel} gestiona={gestiona} onClose={() => setSel(null)} onSeg={(e) => setSeg({ id: e.id, estado: "contactado", nota: e.seguimiento?.nota || "" })} />
      <HojaEnvio d={d} envio={envio} setEnvio={setEnvio} />
      <HojaResponder d={d} resp={resp} setResp={setResp} />
      <HojaSeguimiento seg={seg} setSeg={setSeg} />
    </>
  );
}

const colsGrupo = (t) => [
  { k: "n", t, v: (g) => g.nombre, orden: (g) => g.nombre }, { k: "p", t: "Promedio", v: (g) => g.promGeneral ?? "—", der: true, orden: (g) => g.promGeneral ?? 0 },
  { k: "nps", t: "NPS", v: (g) => g.nps ?? "—", der: true, orden: (g) => g.nps ?? -999 }, { k: "n2", t: "Resp.", v: (g) => g.n, der: true, orden: (g) => g.n },
  { k: "t", t: "Tendencia", v: (g) => <Tend v={g.tendencia} />, der: true, orden: (g) => g.tendencia ?? 0 }, { k: "b", t: "Bajas", v: (g) => g.bajas, der: true, orden: (g) => g.bajas },
];
function GrupoTarjeta({ g }) {
  return (
    <div className="dsp-tarj">
      <div className="dsp-tarj-top"><b>{g.nombre}</b><Tend v={g.tendencia} /></div>
      <div className="dsp-cifras"><div>Promedio<b>{g.promGeneral ?? "—"}</b></div><div>NPS<b>{g.nps ?? "—"}</b></div><div className="der">Respuestas<b>{g.n}</b></div></div>
      <Progreso pct={g.promGeneral ? (g.promGeneral / 5) * 100 : 0} tono={g.promGeneral >= 4.3 ? "ok" : g.promGeneral >= 3.8 ? "warn" : "bad"} />
      <div className="dsp-nota">Servicio {g.promServicio ?? "—"} · Podólogo {g.promPodologo ?? "—"} · Sucursal {g.promSucursal ?? "—"}{g.bajas ? ` · ${g.bajas} baja(s)` : ""}</div>
    </div>
  );
}

function DetalleRespuesta({ d, e, gestiona, onClose, onSeg }) {
  if (!e) return null;
  const baja = A.esBaja(e);
  return (
    <Sheet abierto onClose={onClose} titulo="Respuesta de encuesta" pie={baja && gestiona ? <Button block onClick={() => onSeg(e)}>Dar seguimiento</Button> : null}>
      <div className="form">
        <Resumen filas={[["Paciente", R.nombrePaciente(d, e.pacienteId)], ["Podólogo", R.nombreUsuario(d, e.podologoId)], ["Sucursal", R.nombreSucursal(d, e.sucursalId)], ["Respondida", `${fechaCorta(e.fecha)} ${hora(e.fecha)}`], ["Canal", e.canal === "correo" ? "Correo" : "WhatsApp"]]} />
        <div className="lista">
          {[["Servicio", e.califServicio], ["Podólogo", e.califPodologo], ["Sucursal", e.califSucursal]].map(([l, v]) => <Fila key={l} titulo={l} derecha={<Estrellas valor={v} tam={20} />} />)}
        </div>
        {e.comentario ? <Card><q style={{ fontStyle: "italic" }}>{e.comentario}</q></Card> : <div className="peq mu">Sin comentario.</div>}
        {baja && <Card tono={e.seguimiento?.estado === "resuelto" ? "ok" : "bad"}><b>Seguimiento: {A.ESTADOS_SEGUIMIENTO[e.seguimiento?.estado || "nuevo"][0]}</b>
          <div className="peq">{e.seguimiento?.nota || "Sin nota todavía."}{e.seguimiento?.por ? ` — ${R.nombreUsuario(d, e.seguimiento.por)}, ${fechaCorta(e.seguimiento.fecha)}` : ""}</div></Card>}
      </div>
    </Sheet>
  );
}

function HojaEnvio({ d, envio, setEnvio }) {
  if (!envio) return null;
  const e = d.eval.find((x) => x.id === envio.id);
  if (!e) return null;
  const p = d.pacientes.find((x) => x.id === e.pacienteId);
  const enviar = () => { const r = run((s) => A.enviarEncuesta(s, { evalId: e.id, canal: envio.canal }), "Envío simulado registrado."); if (r && r.ok) setEnvio({ ...envio, hecho: true }); };
  return (
    <Sheet abierto onClose={() => setEnvio(null)} titulo="Enviar encuesta" pie={envio.hecho ? <Button block onClick={() => setEnvio(null)}>Cerrar</Button> : <Button block icon="send" onClick={enviar}>Enviar (simulación)</Button>}>
      <div className="form">
        <div className="dsp-sim">{SIMULACION}</div>
        <Resumen filas={[["Paciente", R.nombrePaciente(d, e.pacienteId)], ["Teléfono", p ? p.telefono : "—"], ["Correo", p && p.correo ? p.correo : "Sin correo"]]} />
        <Field label="Canal"><Chips opciones={[{ v: "whatsapp", l: "WhatsApp" }, { v: "correo", l: "Correo" }]} valor={envio.canal} onChange={(v) => setEnvio({ ...envio, canal: v })} /></Field>
        <Field label="Mensaje y enlace"><Card><div className="peq" style={{ wordBreak: "break-word" }}>{A.mensajeEncuesta(d, e)}</div></Card></Field>
        {envio.hecho && <Card tono="ok"><span className="peq">Registrado como enviado. En esta demostración no salió ningún mensaje real.</span></Card>}
      </div>
    </Sheet>
  );
}

function HojaResponder({ d, resp, setResp }) {
  if (!resp) return null;
  const e = d.eval.find((x) => x.id === resp.id);
  if (!e) return null;
  const listo = resp.a && resp.b && resp.c;
  const enviar = () => { const r = run((s) => A.responderEncuesta(s, { evalId: e.id, califServicio: resp.a, califPodologo: resp.b, califSucursal: resp.c, comentario: resp.texto }), "Respuesta registrada."); if (r && r.ok) setResp(null); };
  return (
    <Sheet abierto onClose={() => setResp(null)} titulo="Responder encuesta" pie={<Button block disabled={!listo} onClick={enviar}>Enviar respuesta</Button>}>
      <div className="form">
        <div className="dsp-sim">Simulación: así contestaría el paciente desde el enlace de la encuesta (en producción no inicia sesión). La respuesta queda registrada como simulada en la bitácora.</div>
        <div><b>¿Cómo te fue con {R.nombreUsuario(d, e.podologoId)} en {R.nombreSucursal(d, e.sucursalId)}?</b><div className="peq mu">1 = muy mal · 5 = excelente</div></div>
        <Voto etiqueta="El servicio recibido" valor={resp.a} onChange={(v) => setResp({ ...resp, a: v })} />
        <Voto etiqueta="La atención del podólogo" valor={resp.b} onChange={(v) => setResp({ ...resp, b: v })} />
        <Voto etiqueta="La sucursal (limpieza, espera, trato)" valor={resp.c} onChange={(v) => setResp({ ...resp, c: v })} />
        <Field label="Comentario (opcional)"><Area value={resp.texto} onChange={(x) => setResp({ ...resp, texto: x.target.value })} maxLength={500} placeholder="Cuéntanos qué podemos mejorar" /></Field>
      </div>
    </Sheet>
  );
}

function HojaSeguimiento({ seg, setSeg }) {
  if (!seg) return null;
  const guardar = () => { const r = run((s) => A.seguimientoEval(s, { evalId: seg.id, estado: seg.estado, nota: seg.nota }), seg.estado === "resuelto" ? "Queja marcada como resuelta." : "Seguimiento registrado."); if (r && r.ok) setSeg(null); };
  return (
    <Sheet abierto onClose={() => setSeg(null)} titulo="Seguimiento de la queja" pie={<Button block onClick={guardar}>Guardar seguimiento</Button>}>
      <div className="form">
        <Field label="Estado"><Chips opciones={[{ v: "contactado", l: "Contactado" }, { v: "resuelto", l: "Resuelto" }]} valor={seg.estado} onChange={(v) => setSeg({ ...seg, estado: v })} /></Field>
        <Field label="Nota" hint="Qué se habló con el paciente y qué se acordó."><Area value={seg.nota} onChange={(x) => setSeg({ ...seg, nota: x.target.value })} /></Field>
      </div>
    </Sheet>
  );
}
