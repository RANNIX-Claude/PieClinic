// Consulta asistente: bitácora de lo que se le pregunta al asistente inteligente (d.asistenteLog, del dominio comercial):
// pregunta, usuario, fecha, intención detectada y si se respondió; preguntas sin respuesta para mejorarlo; y calificación de respuestas.
// No duplica el asistente: lo audita. Solo administración y dirección.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Fila, Kpi, Resumen, Select, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import * as R from "../../store/reglas.js";
import { esCentral, consultasAsistente, calificarRespuesta, TIPO_RESPUESTA, csvDe, nombreMesDW } from "../../store/acciones_plataforma.js";
import { Denegado, GraficaRanking, Nota, Paginador, Seccion, TablaDatos, descargar, fechaHora, numero, rutaDe, usePlataforma } from "../../componentes/plataforma/comun.jsx";
import { hoy } from "../../lib/format.js";

const PAG = 30;
const corto = (n) => String(n || "—").replace(/\s*\(.*\)$/, "");

export default function ConsultaAsistente() {
  const { d, u } = useSesion();
  usePlataforma(d);
  const nav = useNavigate();
  const [vista, setVista] = useState("consultas");
  const [q, setQ] = useState("");
  const [f, setF] = useState({ usuarioId: "", estado: "", mes: "" });
  const [pag, setPag] = useState(1);
  const [selId, setSelId] = useState(null);
  const [cal, setCal] = useState({ util: null, nota: "" });
  const r = useMemo(() => consultasAsistente(d, { ...f, texto: q }), [d.asistenteLog, d.asistenteCalif, d.sesion, f, q]);
  if (!esCentral(u)) return <Denegado />;
  if (!r.ok) return <Denegado>{r.error}</Denegado>;

  const irAsistente = rutaDe(u, "asistente-ia");
  const sel = selId ? r.filas.find((x) => x.id === selId) || null : null;
  const abrir = (x) => { setSelId(x.id); setCal({ util: x.calif ? x.calif.util : null, nota: x.calif ? x.calif.nota : "" }); };
  const calificar = () => {
    const x = mutar((s) => calificarRespuesta(s, { entradaId: sel.id, util: cal.util, nota: cal.nota }));
    if (!x.ok) return aviso(x.error, "bad");
    aviso("Calificación guardada."); setSelId(null);
  };
  const exportar = () => {
    descargar(`consultas_asistente_${hoy()}.csv`, csvDe([{ k: "ts", l: "Fecha" }, { k: "usuario", l: "Usuario" }, { k: "sucursal", l: "Sucursal" }, { k: "pregunta", l: "Pregunta" }, { k: "intencion", l: "Intención" }, { k: "resultado", l: "Resultado" }, { k: "calif", l: "Calificación" }, { k: "nota", l: "Nota" }],
      r.filas.map((x) => ({ ts: x.ts, usuario: R.nombreUsuario(d, x.usuarioId), sucursal: R.nombreSucursal(d, x.sucursalId), pregunta: x.pregunta, intencion: x.intencion || "", resultado: (TIPO_RESPUESTA[x.tipo] || [x.tipo])[0], calif: x.calif ? (x.calif.util ? "Útil" : "No útil") : "", nota: x.calif ? x.calif.nota : "" }))));
    aviso("CSV descargado.");
  };
  const s = r.resumen, pctResp = s.total ? Math.round((s.respondidas / s.total) * 100) : 0;
  const setF2 = (p) => { setF({ ...f, ...p }); setPag(1); };

  if (!r.total) return (
    <>
      <Vacio icon="message">{r.existe ? "Todavía nadie le ha preguntado nada al asistente inteligente." : "El asistente inteligente aún no guarda historial de consultas."}</Vacio>
      <Card tono="info">
        <p className="txt peq" style={{ margin: 0 }}>Aquí aparecerá cada pregunta que gerentes, administración y dirección le hagan al asistente: quién la hizo, cuándo, qué intención detectó y si pudo responder. Las preguntas que no entendió se agrupan para saber qué enseñarle, y cada respuesta se puede calificar como útil o no útil.</p>
        <p className="txt peq" style={{ margin: "8px 0 0" }}>El asistente de esta demostración responde con un motor de reglas sobre los datos del sistema; no hay un modelo de lenguaje conectado (Configuración ▸ Integraciones).</p>
      </Card>
      {irAsistente && <div className="pl-acc"><Button icon="sparkle" onClick={() => nav(irAsistente)}>Abrir el asistente</Button></div>}
    </>
  );

  return (
    <>
      <div className="kpis">
        <Kpi label="Consultas" valor={numero(s.total)} nota={`${s.usuarios} persona(s)`} />
        <Kpi label="Respondidas" valor={`${pctResp} %`} tono={pctResp >= 80 ? "ok" : pctResp >= 50 ? "warn" : "bad"} nota={`${s.respondidas} de ${s.total}`} />
        <Kpi label="Sin respuesta" valor={s.sinRespuesta} tono={s.sinRespuesta ? "warn" : "ok"} nota="No entendió, sin dato o fuera de permiso" />
        <Kpi label="Calificadas" valor={`${s.calificadas} / ${s.total}`} tono={s.noUtiles ? "warn" : "ok"} nota={`${s.utiles} útiles · ${s.noUtiles} no útiles`} />
      </div>
      <div className="pl-barra">
        <Chips scroll valor={vista} onChange={setVista} opciones={[{ v: "consultas", l: "Consultas", n: r.filas.length }, { v: "sin", l: "Sin respuesta", n: r.sinRespuesta.length }, { v: "intenciones", l: "Intenciones", n: r.intenciones.length }]} />
        {irAsistente && <Button variante="sec" className="btn-peq" icon="sparkle" onClick={() => nav(irAsistente)}>Abrir el asistente</Button>}
      </div>

      {vista === "consultas" && (
        <>
          <Buscador valor={q} onChange={(x) => { setQ(x); setPag(1); }} placeholder="Buscar en las preguntas…" />
          <div className="pl-barra">
            <Field label="Usuario"><Select value={f.usuarioId} onChange={(e) => setF2({ usuarioId: e.target.value })}><option value="">Todos</option>{r.usuarios.map((id) => <option key={id} value={id}>{corto(R.nombreUsuario(d, id))}</option>)}</Select></Field>
            <Field label="Resultado"><Select value={f.estado} onChange={(e) => setF2({ estado: e.target.value })}><option value="">Todos</option><option value="respondidas">Respondidas</option><option value="sin_respuesta">Sin respuesta</option><option value="sin_calificar">Sin calificar</option><option value="mal_calificadas">Calificadas como no útiles</option></Select></Field>
            <Field label="Mes"><Select value={f.mes} onChange={(e) => setF2({ mes: e.target.value })}><option value="">Todos</option>{r.meses.map((m) => <option key={m} value={m}>{nombreMesDW(m)}</option>)}</Select></Field>
            <Button variante="sec" icon="download" disabled={!r.filas.length} onClick={exportar}>CSV</Button>
          </div>
          <div className="lista">
            {r.filas.slice((pag - 1) * PAG, pag * PAG).map((x) => (
              <Fila key={x.id} titulo={x.pregunta} badge={<Badge tono={(TIPO_RESPUESTA[x.tipo] || ["", "neutral"])[1]}>{(TIPO_RESPUESTA[x.tipo] || [x.tipo])[0]}</Badge>}
                sub={`${corto(R.nombreUsuario(d, x.usuarioId))} · ${R.nombreSucursal(d, x.sucursalId)} · ${fechaHora(x.ts)}`}
                datos={<><span>Intención: {x.intencion || "no detectada"}</span>{x.calif ? <span>{x.calif.util ? "Calificada: útil" : "Calificada: no útil"}</span> : <span>Sin calificar</span>}</>} onClick={() => abrir(x)} />
            ))}
            {!r.filas.length && <Vacio>Ninguna consulta coincide con los filtros.</Vacio>}
          </div>
          <Paginador pagina={pag} paginas={Math.ceil(r.filas.length / PAG)} total={r.filas.length} onChange={setPag} />
        </>
      )}

      {vista === "sin" && (
        <Seccion titulo="Preguntas que el asistente no pudo responder">
          {r.sinRespuesta.length ? (
            <TablaDatos clave={(x, i) => i} columnas={[{ k: "p", t: "Pregunta", v: (x) => x.pregunta }, { k: "t", t: "Motivo", v: (x) => <Badge tono={(TIPO_RESPUESTA[x.tipo] || ["", "neutral"])[1]}>{(TIPO_RESPUESTA[x.tipo] || [x.tipo])[0]}</Badge> }, { k: "v", t: "Veces", der: true, v: (x) => x.veces }, { k: "u", t: "Personas", der: true, v: (x) => x.usuarios }, { k: "f", t: "Última vez", v: (x) => fechaHora(x.ultima) }]} filas={r.sinRespuesta} />
          ) : <Vacio icon="check">El asistente respondió todo lo que se le preguntó.</Vacio>}
          <Nota>Agrupadas por texto (sin signos ni mayúsculas). Las más repetidas son las primeras candidatas para agregar al asistente.</Nota>
        </Seccion>
      )}

      {vista === "intenciones" && (
        <Seccion titulo="Qué se le pregunta">
          <GraficaRanking titulo="Consultas por intención detectada" filas={r.intenciones.map((x) => ({ id: x.intencion, nombre: x.intencion.replace(/_/g, " "), valor: x.n }))} formato={(n) => numero(n)} />
        </Seccion>
      )}
      <Nota>Se conservan las últimas 150 consultas del asistente. Las calificaciones se guardan aparte y quedan en la bitácora de auditoría.</Nota>

      <Sheet abierto={!!sel} onClose={() => setSelId(null)} titulo="Consulta al asistente" pie={sel && <Button block disabled={cal.util === null} onClick={calificar}>Guardar calificación</Button>}>
        {sel && (
          <>
            <b style={{ fontSize: 16 }}>«{sel.pregunta}»</b>
            <Resumen filas={[["Quién", R.nombreUsuario(d, sel.usuarioId)], ["Sucursal activa", R.nombreSucursal(d, sel.sucursalId)], ["Cuándo", fechaHora(sel.ts)], ["Intención detectada", sel.intencion ? sel.intencion.replace(/_/g, " ") : "No detectada"], ["Resultado", (TIPO_RESPUESTA[sel.tipo] || [sel.tipo])[0]], sel.acciones.length ? ["Acciones propuestas", sel.acciones.map((a) => `${a.tipo} (${a.estado})`).join(", ")] : null]} />
            <Card tono={sel.respondida ? "ok" : "warn"}><b>{sel.titulo}</b>{sel.cifra && <div style={{ fontSize: 20, fontWeight: 700 }}>{typeof sel.cifra === "object" ? sel.cifra.valor ?? sel.cifra.texto ?? "" : sel.cifra}</div>}<p className="txt peq" style={{ margin: "4px 0 0" }}>{sel.respuesta}</p></Card>
            <b>¿La respuesta fue útil?</b>
            <Chips valor={cal.util === null ? "" : cal.util ? "si" : "no"} onChange={(v) => setCal({ ...cal, util: v === "si" })} opciones={[{ v: "si", l: "Útil" }, { v: "no", l: "No útil" }]} />
            <Field label={cal.util === false ? "Qué debió responder" : "Nota (opcional)"}><Area rows={3} value={cal.nota} onChange={(e) => setCal({ ...cal, nota: e.target.value })} /></Field>
            {sel.calif && <Nota>Calificada el {fechaHora(sel.calif.ts)} por {R.nombreUsuario(d, sel.calif.usuarioId)}.</Nota>}
          </>
        )}
      </Sheet>
    </>
  );
}
