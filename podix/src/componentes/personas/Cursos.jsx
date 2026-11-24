// «Mis cursos»: progreso, ruta de bienvenida, reproductor de lección, evaluación y constancia imprimible.
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Icon, Kpi, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { hoy, fechaLarga } from "../../lib/format.js";
import * as A from "../../store/acciones_personas.js";
import { Aviso, Barra, Hoja, Nota, Reproductor, esRes, parrafos, urlSegura } from "./comunes.jsx";

const MOTIVO = { obligatorio: ["bad", "Obligatorio"], nuevo: ["warn", "Para personal nuevo"], asignado: ["info", "Asignado a ti"], opcional: ["neutral", "Opcional"] };

export function MisCursos({ d, u }) {
  const [abierto, setAbierto] = useState(null);
  const emp = A.empleadoDeUsuario(d, u.id);
  const nuevo = A.esPersonalNuevo(emp);
  const todos = A.cursosDeUsuario(d, u);
  const obligs = todos.filter((c) => c.motivo !== "opcional");
  const hechos = obligs.filter((c) => c.prog.completo).length;
  const enCurso = todos.filter((c) => !c.prog.completo && (c.prog.vistas > 0 || c.prog.aprobado)).length;
  const lecPend = obligs.reduce((s, c) => s + (c.prog.completo ? 0 : c.prog.total - c.prog.vistas), 0);
  const ruta = obligs.filter((c) => c.curso.asignado.nuevos || c.motivo === "nuevo").sort((a, b) => (a.curso.ruta || 9) - (b.curso.ruta || 9));

  if (abierto) return <CursoVista d={d} u={u} cursoId={abierto} onVolver={() => setAbierto(null)} />;

  const Tarjeta = ({ c }) => {
    const [t, l] = MOTIVO[c.motivo];
    return (
      <Card className="pp-curso" onClick={() => setAbierto(c.curso.id)}>
        <div className="fila-flex" style={{ alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0 }}><h4>{c.curso.titulo}</h4></div><Badge tono={t}>{l}</Badge></div>
        <p>{c.curso.resumen}</p>
        <Barra pct={c.prog.pct} />
        <div className="fila-flex"><span className="mu peq" style={{ flex: 1 }}>{c.prog.vistas}/{c.prog.total} lecciones{c.prog.tieneEval ? (c.prog.aprobado ? " · evaluación aprobada" : " · con evaluación") : ""}</span>
          {c.prog.completo ? <Badge tono="ok">Completado</Badge> : <Button className="btn-peq" variante={c.prog.vistas ? "primary" : "sec"}>{c.prog.vistas ? "Continuar" : "Empezar"}</Button>}</div>
      </Card>
    );
  };
  const grupo = (titulo, lista) => lista.length ? (<><Titulo>{titulo}</Titulo><div className="pp-grid">{lista.map((c) => <Tarjeta key={c.curso.id} c={c} />)}</div></>) : null;

  return (
    <>
      <div className="pp-kpis">
        <Kpi label="Obligatorios completados" valor={`${hechos}/${obligs.length}`} tono={hechos === obligs.length ? "ok" : "warn"} /><Kpi label="En curso" valor={enCurso} tono="info" /><Kpi label="Lecciones pendientes" valor={lecPend} tono={lecPend ? "warn" : "ok"} />
      </div>
      <Nota>Los cursos son borradores redactados para la clínica y deben validarse con ella. Aquí aprendes cómo se hacen las cosas: videos, fotografías paso a paso y listas de verificación.</Nota>
      {nuevo && ruta.length > 0 && (
        <Card tono="info"><div className="pp-sec"><h3>Tu ruta de bienvenida <Badge tono="info">{ruta.filter((c) => c.prog.completo).length}/{ruta.length}</Badge></h3></div>
          <p className="mu" style={{ margin: "0 0 8px" }}>Bienvenido(a). Sigue estos cursos en orden durante tus primeras semanas.</p>
          <div className="lista">
            {ruta.map((c, i) => (
              <button key={c.curso.id} className={`pp-leccion${c.prog.completo ? " hecha" : ""}`} onClick={() => setAbierto(c.curso.id)}><span className="n">{c.prog.completo ? "✓" : i + 1}</span><span style={{ flex: 1, minWidth: 0 }}><b>{c.curso.titulo}</b><br /><span className="mu peq">{c.prog.pct} % · {c.prog.vistas}/{c.prog.total} lecciones</span></span><Icon name="chevron" size={18} className="ic-mu" /></button>))}
          </div>
        </Card>)}
      {!todos.length && <Vacio icon="book">Aún no hay cursos publicados.</Vacio>}
      {grupo("Obligatorios y asignados", todos.filter((c) => c.motivo !== "opcional" && !c.prog.completo))}
      {grupo("Completados", todos.filter((c) => c.motivo !== "opcional" && c.prog.completo))}
      {grupo("Opcionales para ti", todos.filter((c) => c.motivo === "opcional"))}
    </>
  );
}

export function CursoVista({ d, u, cursoId, onVolver }) {
  const curso = d.cap.cursos.find((c) => c.id === cursoId);
  const prog = curso ? A.progresoCurso(d, u.id, curso) : null;
  const [idx, setIdx] = useState(() => { if (!curso) return 0; const i = curso.lecciones.findIndex((l) => prog.pendientes.some((p) => p.id === l.id)); return i < 0 ? 0 : i; });
  const [verEval, setVerEval] = useState(false);
  const [constancia, setConstancia] = useState(false);
  if (!curso) return <Vacio icon="book">Curso no disponible.</Vacio>;
  const lec = curso.lecciones[Math.min(idx, curso.lecciones.length - 1)];
  const vistas = new Set((A.avanceDe(d, u.id, curso.id) || { vistas: [] }).vistas);
  const marcar = () => { const r = A.marcarLeccionVista({ cursoId: curso.id, leccionId: lec.id }); if (esRes(r)) { aviso(r.completado ? `¡Curso completado! Constancia ${r.constancia}` : "Lección marcada como vista."); if (idx < curso.lecciones.length - 1) setIdx(idx + 1); else if (prog.tieneEval) setVerEval(true); } };

  return (
    <>
      <div className="fila-flex"><Button variante="ghost" icon="back" onClick={onVolver}>Mis cursos</Button></div>
      <Card>
        <div className="fila-flex" style={{ alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 20 }}>{curso.titulo}</h2><div className="mu">{curso.resumen}</div></div>{curso.borrador && <Badge tono="warn">Borrador por validar</Badge>}</div>
        <div style={{ marginTop: 10 }}><Barra pct={prog.pct} /></div>
        <div className="mu peq" style={{ marginTop: 4 }}>{prog.vistas} de {prog.total} lecciones{prog.tieneEval ? ` · evaluación mínima ${curso.evaluacion.minimo}` : ""} · {prog.pct} %</div>
        {prog.completo && <div className="pp-acciones"><Badge tono="ok">Completado {prog.completado || ""}</Badge><Button variante="sec" icon="award" onClick={() => setConstancia(true)}>Ver constancia</Button></div>}
      </Card>

      <div className="pp-grid">
        <div className="lista" style={{ alignContent: "start" }}>
          {curso.lecciones.map((l, i) => (
            <button key={l.id} className={`pp-leccion${i === idx && !verEval ? " on" : ""}${vistas.has(l.id) ? " hecha" : ""}`} onClick={() => { setIdx(i); setVerEval(false); }}>
              <span className="n">{vistas.has(l.id) ? "✓" : i + 1}</span><span style={{ flex: 1, minWidth: 0 }}>{l.titulo}<br /><span className="mu peq">{l.video ? "Video · " : ""}{l.minutos} min</span></span></button>))}
          {prog.tieneEval && <button className={`pp-leccion${verEval ? " on" : ""}${prog.aprobado ? " hecha" : ""}`} onClick={() => setVerEval(true)}><span className="n">{prog.aprobado ? "✓" : "?"}</span><span style={{ flex: 1 }}>Evaluación<br /><span className="mu peq">{curso.evaluacion.preguntas.length} preguntas · mínimo {curso.evaluacion.minimo}{prog.ultimaCalif != null ? ` · última ${prog.ultimaCalif}` : ""}</span></span></button>}
        </div>

        {verEval ? <Evaluacion d={d} curso={curso} prog={prog} onConstancia={() => setConstancia(true)} /> : (
          <Card>
            <h3 style={{ margin: "0 0 10px" }}>{lec.titulo}</h3>
            {lec.video && <div style={{ marginBottom: 12 }}><Reproductor id={lec.youtube} titulo={lec.titulo} /></div>}
            {parrafos(lec.texto).map((p, i) => <p key={i} style={{ margin: "0 0 10px" }}>{p}</p>)}
            {lec.pasos && lec.pasos.length > 0 && (<ol className="pp-pasos" style={{ marginBottom: 12 }}>{lec.pasos.map((p, i) => <li key={i}><div style={{ flex: 1, minWidth: 0 }}>{p.t}{p.foto && <img src={p.foto} alt={`Paso ${i + 1}`} />}</div></li>)}</ol>)}
            {lec.checklist && lec.checklist.length > 0 && <Checklist items={lec.checklist} clave={`${curso.id}-${lec.id}`} />}
            {urlSegura(lec.docUrl) && <p><a href={lec.docUrl} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16} /> {lec.docTitulo || "Documento enlazado"}</a></p>}
            <div className="pp-acciones">
              {idx > 0 && <Button variante="sec" onClick={() => setIdx(idx - 1)}>Anterior</Button>}
              <Button variante={vistas.has(lec.id) ? "sec" : "ok"} icon="check" onClick={marcar}>{vistas.has(lec.id) ? "Ya vista · siguiente" : "Marcar como vista"}</Button>
            </div>
          </Card>)}
      </div>
      <Hoja abierto={constancia} onClose={() => setConstancia(false)} titulo="Constancia de capacitación"><Constancia d={d} u={u} curso={curso} prog={prog} /></Hoja>
    </>
  );
}

function Checklist({ items, clave }) {
  const k = `podologia.chk.${clave}`;
  const [hechos, setHechos] = useState(() => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(k, JSON.stringify(hechos)); } catch { /* sin almacenamiento */ } }, [k, hechos]);
  return (
    <div style={{ marginBottom: 12 }}>
      {items.map((t, i) => (
        <label className="pp-chk" key={i}><input type="checkbox" checked={hechos.includes(i)} onChange={() => setHechos((h) => (h.includes(i) ? h.filter((x) => x !== i) : [...h, i]))} /><span style={{ textDecoration: hechos.includes(i) ? "line-through" : "none" }}>{t}</span></label>))}
    </div>
  );
}

function Evaluacion({ d, curso, prog, onConstancia }) {
  const ps = curso.evaluacion.preguntas;
  const [resp, setResp] = useState(Array(ps.length).fill(null));
  const [res, setRes] = useState(null);
  const listo = prog.leccionesCompletas;
  const enviar = () => { const r = A.evaluarCurso({ cursoId: curso.id, respuestas: resp }); if (esRes(r)) { setRes(r); aviso(r.aprobado ? `Aprobaste con ${r.calif}.` : `Calificación ${r.calif}: necesitas ${r.minimo}. Puedes intentarlo de nuevo.`, r.aprobado ? "ok" : "warn"); } };
  const reintentar = () => { setRes(null); setResp(Array(ps.length).fill(null)); };
  if (!listo) return <Card><Aviso>Termina todas las lecciones para presentar la evaluación ({prog.vistas}/{prog.total}).</Aviso></Card>;
  return (
    <Card>
      <h3 style={{ margin: "0 0 6px" }}>Evaluación: {curso.titulo}</h3>
      <p className="mu" style={{ margin: "0 0 10px" }}>{ps.length} preguntas. Calificación mínima para aprobar: {curso.evaluacion.minimo}.</p>
      {ps.map((p, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <b>{i + 1}. {p.p}</b>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {p.opciones.map((o, j) => {
              const cls = res ? (j === p.correcta ? " bien" : resp[i] === j ? " mal" : "") : resp[i] === j ? " on" : "";
              return <label key={j} className={`pp-opcion${cls}`}><input type="radio" name={`q${i}`} checked={resp[i] === j} disabled={!!res} onChange={() => setResp((r) => r.map((x, k) => (k === i ? j : x)))} /><span>{o}</span></label>;
            })}
          </div>
        </div>))}
      {res ? (
        <div className="pp-acciones"><Badge tono={res.aprobado ? "ok" : "bad"}>{res.aprobado ? `Aprobado: ${res.calif}` : `No aprobado: ${res.calif}`} ({res.correctas}/{res.total})</Badge>
          {res.aprobado ? <Button variante="sec" icon="award" onClick={onConstancia}>Ver constancia</Button> : <Button onClick={reintentar}>Intentar de nuevo</Button>}</div>
      ) : <Button block disabled={resp.some((x) => x == null)} onClick={enviar}>Enviar evaluación</Button>}
    </Card>
  );
}

function Constancia({ d, u, curso, prog }) {
  const av = A.avanceDe(d, u.id, curso.id);
  return (
    <div className="pp-constancia">
      <h1>Constancia de capacitación</h1>
      <div>Pie Clinic certifica que</div>
      <div className="nombre">{u.nombre.replace(/\s*\(.*\)/, "")}</div>
      <div>completó el curso</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "8px 0" }}>{curso.titulo}</div>
      <div>{prog.tieneEval && av && av.evaluaciones.length ? `con calificación de ${Math.max(...av.evaluaciones.map((e) => e.calif))} (mínima ${curso.evaluacion.minimo})` : "con todas las lecciones vistas"}</div>
      <div style={{ marginTop: 14 }}>Fecha: {fechaLarga(prog.completado || hoy())} · Folio {prog.constancia || "—"} · Sucursal {A.nombreSuc(d, d.sesion.sucursalId)}</div>
      <div className="marca" style={{ marginTop: 18, fontSize: 12, color: "#92400e" }}>Constancia interna de demostración. Contenido del curso en borrador por validar con la clínica.</div>
    </div>
  );
}
