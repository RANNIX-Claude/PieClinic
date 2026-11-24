// Gestión de cursos (gerente / administración): crear y editar cursos y lecciones, asignar, publicar y ver quién no ha terminado.
import { useEffect, useState } from "react";
import { Area, Badge, Button, Card, Chips, Field, Fila, Input, Kpi, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { Foto } from "../../ui/vista.jsx";
import { fechaCorta } from "../../lib/format.js";
import { NOMBRE_ROL } from "../../config/roles.js";
import * as A from "../../store/acciones_personas.js";
import { Barra, BotonesFoto, CampoYoutube, FlujoVideo, Nota, esRes, aLineas } from "./comunes.jsx";

const ROLES = ["recepcion", "podologo", "asistente", "cajero", "almacen", "gerente", "admin", "direccion"];
const EST = { publicado: ["ok", "Publicado"], borrador: ["warn", "Borrador"], archivado: ["neutral", "Archivado"] };
const nuevoCurso = () => ({ titulo: "", categoria: "General", resumen: "", estado: "borrador", ruta: 0, asignado: { roles: [], personas: [], nuevos: false }, lecciones: [{ titulo: "", minutos: 5, video: false, youtube: null, youtubeUrl: "", texto: "", pasos: [], checklist: [] }], evaluacion: null });

export function GestionCursos({ d, u }) {
  const [edit, setEdit] = useState(null);
  const [asig, setAsig] = useState(null);
  if (edit) return <Editor d={d} inicial={edit} onVolver={() => setEdit(null)} />;
  const cambiar = (c, estado) => { if (esRes(A.estadoCurso({ cursoId: c.id, estado }))) aviso(estado === "publicado" ? "Curso publicado." : estado === "archivado" ? "Curso archivado." : "Curso en borrador.", estado === "publicado" ? "ok" : "warn"); };
  return (
    <>
      <div className="fila-flex"><Button icon="plus" onClick={() => setEdit(nuevoCurso())}>Nuevo curso</Button></div>
      <FlujoVideo />
      <div className="pp-grid">
        {d.cap.cursos.map((c) => {
          const [t, l] = EST[c.estado];
          const alcance = A.avancePorPersona(d, c);
          const comp = alcance.filter((x) => x.estado === "completo").length;
          return (
            <Card key={c.id} className="pp-curso">
              <div className="fila-flex" style={{ alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0 }}><h4>{c.titulo}</h4><p>{c.categoria} · {c.lecciones.length} lecciones · {c.lecciones.filter((x) => x.video && !x.youtube).length} videos pendientes{c.evaluacion ? ` · evaluación (${c.evaluacion.preguntas.length})` : ""}</p></div><Badge tono={t}>{l}</Badge></div>
              <div className="mu peq">Asignado a: {c.asignado.roles.length >= 8 ? "todos los roles" : c.asignado.roles.map((r) => NOMBRE_ROL[r] || r).join(", ") || "nadie por rol"}{c.asignado.personas.length ? ` + ${c.asignado.personas.length} persona(s)` : ""}{c.asignado.nuevos ? " · personal nuevo" : ""}</div>
              <div><Barra pct={alcance.length ? (comp / alcance.length) * 100 : 0} /><div className="mu peq" style={{ marginTop: 3 }}>{comp} de {alcance.length} personas lo han completado</div></div>
              <div className="pp-acciones">
                <Button variante="sec" icon="edit" onClick={() => setEdit(JSON.parse(JSON.stringify(c)))}>Editar</Button>
                <Button variante="sec" icon="users" onClick={() => setAsig(c)}>Asignar</Button>
                {c.estado !== "publicado" ? <Button variante="ok" onClick={() => cambiar(c, "publicado")}>Publicar</Button> : <Button variante="sec" onClick={() => cambiar(c, "borrador")}>Despublicar</Button>}
                {c.estado !== "archivado" && <Button variante="ghost" onClick={() => cambiar(c, "archivado")}>Archivar</Button>}
              </div>
            </Card>);
        })}
      </div>
      <Asignar d={d} curso={asig} onClose={() => setAsig(null)} />
    </>
  );
}

function Asignar({ d, curso, onClose }) {
  const [a, setA] = useState(null);
  useEffect(() => { setA(curso ? JSON.parse(JSON.stringify(curso.asignado)) : null); }, [curso]);
  const tog = (k, v) => setA((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const ok = () => { if (esRes(A.asignarCurso({ cursoId: curso.id, ...a }))) { aviso("Asignación guardada."); onClose(); } };
  const personas = d.rh.empleados.filter((e) => e.estado === "activo" && e.usuarioId);
  return (
    <Sheet abierto={!!curso && !!a} onClose={onClose} titulo={curso ? `Asignar: ${curso.titulo}` : ""} pie={<Button block onClick={ok}>Guardar asignación</Button>}>
      {a && (<>
        <Field label="Obligatorio para estos roles"><div className="chips">{ROLES.map((r) => <button key={r} type="button" className={`chip${a.roles.includes(r) ? " on" : ""}`} onClick={() => tog("roles", r)}>{NOMBRE_ROL[r]}</button>)}</div></Field>
        <label className="pp-chk"><input type="checkbox" checked={a.nuevos} onChange={(e) => setA({ ...a, nuevos: e.target.checked })} /><span>Incluir en la ruta de bienvenida del personal nuevo</span></label>
        <Field label="Además, estas personas"><Select value="" onChange={(e) => e.target.value && tog("personas", e.target.value)}><option value="">Agregar persona…</option>{personas.filter((e) => !a.personas.includes(e.usuarioId)).map((e) => <option key={e.id} value={e.usuarioId}>{e.nombre}</option>)}</Select></Field>
        <div className="chips">{a.personas.map((id) => { const e = personas.find((x) => x.usuarioId === id); return <button type="button" key={id} className="chip on" onClick={() => tog("personas", id)}>{e ? e.nombre : id} ×</button>; })}</div>
      </>)}
    </Sheet>
  );
}

export function AvanceEquipo({ d, u }) {
  const cursos = d.cap.cursos.filter((c) => c.estado === "publicado");
  const [cid, setCid] = useState(cursos[0] ? cursos[0].id : "");
  const [suc, setSuc] = useState(A.esAdmin(u) ? "" : u.sucursales[0]);
  const [solo, setSolo] = useState("pendientes");
  const c = cursos.find((x) => x.id === cid);
  if (!c) return <Vacio icon="book">No hay cursos publicados.</Vacio>;
  const todos = A.avancePorPersona(d, c, suc || null);
  const lista = todos.filter((x) => solo === "todos" || x.estado !== "completo").sort((a, b) => a.prog.pct - b.prog.pct);
  const comp = todos.filter((x) => x.estado === "completo").length;
  const sucs = A.esAdmin(u) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  return (
    <>
      <div className="pp-filtros">
        <Field label="Curso"><Select value={cid} onChange={(e) => setCid(e.target.value)}>{cursos.map((x) => <option key={x.id} value={x.id}>{x.titulo}</option>)}</Select></Field>
        <Field label="Sucursal"><Select value={suc} onChange={(e) => setSuc(e.target.value)}>{A.esAdmin(u) && <option value="">Todas</option>}{sucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
      </div>
      <div className="pp-kpis"><Kpi label="Aplica a" valor={todos.length} /><Kpi label="Completaron" valor={comp} tono="ok" /><Kpi label="Sin terminar" valor={todos.length - comp} tono={todos.length - comp ? "warn" : "ok"} /></div>
      <Chips valor={solo} onChange={setSolo} opciones={[{ v: "pendientes", l: "Quién no ha terminado", n: todos.length - comp }, { v: "todos", l: "Todos", n: todos.length }]} />
      {!lista.length ? <Vacio icon="check">{todos.length ? "Todos terminaron este curso." : "Este curso no aplica a nadie en esta sucursal."}</Vacio> : (
        <div className="lista">
          {lista.map((x) => (
            <Fila key={x.empleado.id} izquierda={<Foto nombre={x.empleado.nombre} src={x.empleado.foto} size={40} />} titulo={x.empleado.nombre}
              badge={<Badge tono={x.estado === "completo" ? "ok" : x.estado === "en_curso" ? "warn" : "bad"}>{x.estado === "completo" ? "Completo" : x.estado === "en_curso" ? "En curso" : "Sin iniciar"}</Badge>}
              sub={`${x.empleado.puesto} · ${A.nombreSuc(d, x.empleado.sucursalBase)}`}
              datos={<span style={{ width: "100%" }}><Barra pct={x.prog.pct} /><span>{x.prog.vistas}/{x.prog.total} lecciones · {x.prog.pct} % · {x.motivo === "nuevo" ? "personal nuevo" : x.motivo}{x.empleado.ingreso ? ` · ingreso ${fechaCorta(x.empleado.ingreso)}` : ""}</span></span>} />))}
        </div>)}
    </>
  );
}

// ───────── Editor de curso
function Editor({ d, inicial, onVolver }) {
  const [c, setC] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const lec = (i, k, v) => setC((x) => ({ ...x, lecciones: x.lecciones.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const mover = (i, di) => setC((x) => { const a = [...x.lecciones]; const j = i + di; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, lecciones: a }; });
  const quitar = (i) => setC((x) => ({ ...x, lecciones: x.lecciones.filter((_, j) => j !== i) }));
  const ev = (patch) => setC((x) => ({ ...x, evaluacion: { ...x.evaluacion, ...patch } }));
  const preg = (i, patch) => setC((x) => ({ ...x, evaluacion: { ...x.evaluacion, preguntas: x.evaluacion.preguntas.map((p, j) => (j === i ? { ...p, ...patch } : p)) } }));
  const guardar = () => {
    setGuardando(true);
    const r = A.guardarCurso({ ...c, lecciones: c.lecciones.map((l) => ({ ...l, checklist: Array.isArray(l.checklist) ? l.checklist : aLineas(l.checklist) })) });
    setGuardando(false);
    if (esRes(r)) { aviso(c.id ? "Curso actualizado." : "Curso creado como borrador. Publícalo cuando esté listo."); onVolver(); }
  };
  return (
    <>
      <div className="fila-flex"><Button variante="ghost" icon="back" onClick={onVolver}>Cursos</Button></div>
      <Titulo>{c.id ? "Editar curso" : "Nuevo curso"}</Titulo>
      <FlujoVideo />
      <Card>
        <div className="form">
          <Field label="Título"><Input value={c.titulo} onChange={(e) => set("titulo", e.target.value)} /></Field>
          <div className="form2"><Field label="Categoría"><Input value={c.categoria} onChange={(e) => set("categoria", e.target.value)} /></Field><Field label="Estado"><Select value={c.estado} onChange={(e) => set("estado", e.target.value)}><option value="borrador">Borrador</option><option value="publicado">Publicado</option><option value="archivado">Archivado</option></Select></Field></div>
          <Field label="Resumen"><Area value={c.resumen} onChange={(e) => set("resumen", e.target.value)} /></Field>
          <Field label="Obligatorio para estos roles"><div className="chips">{ROLES.map((r) => <button type="button" key={r} className={`chip${c.asignado.roles.includes(r) ? " on" : ""}`} onClick={() => set("asignado", { ...c.asignado, roles: c.asignado.roles.includes(r) ? c.asignado.roles.filter((x) => x !== r) : [...c.asignado.roles, r] })}>{NOMBRE_ROL[r]}</button>)}</div></Field>
          <label className="pp-chk"><input type="checkbox" checked={c.asignado.nuevos} onChange={(e) => set("asignado", { ...c.asignado, nuevos: e.target.checked })} /><span>Parte de la ruta de bienvenida del personal nuevo</span></label>
        </div>
      </Card>

      <Titulo derecha={<Button variante="sec" className="btn-peq" icon="plus" onClick={() => setC((x) => ({ ...x, lecciones: [...x.lecciones, { titulo: "", minutos: 5, video: false, youtube: null, youtubeUrl: "", texto: "", pasos: [], checklist: [] }] }))}>Lección</Button>}>Lecciones</Titulo>
      {c.lecciones.map((l, i) => (
        <div className="pp-ed-bloque" key={l.id || i}>
          <div className="fila-flex"><b style={{ flex: 1 }}>Lección {i + 1}</b><Button variante="ghost" className="btn-peq" onClick={() => mover(i, -1)} disabled={i === 0}>↑</Button><Button variante="ghost" className="btn-peq" onClick={() => mover(i, 1)} disabled={i === c.lecciones.length - 1}>↓</Button><Button variante="ghost" className="btn-peq" icon="trash" onClick={() => quitar(i)} disabled={c.lecciones.length === 1} aria-label="Quitar lección" /></div>
          <div className="form2"><Field label="Título"><Input value={l.titulo} onChange={(e) => lec(i, "titulo", e.target.value)} /></Field><Field label="Minutos"><Input type="number" inputMode="numeric" min="1" value={l.minutos} onChange={(e) => lec(i, "minutos", Number(e.target.value))} /></Field></div>
          <label className="pp-chk"><input type="checkbox" checked={!!l.video} onChange={(e) => lec(i, "video", e.target.checked)} /><span>Esta lección lleva video de YouTube</span></label>
          {l.video && <CampoYoutube valor={l.youtubeUrl} idActual={l.youtube} onChange={(v) => lec(i, "youtubeUrl", v)} />}
          <Field label="Texto de la lección"><Area value={l.texto} onChange={(e) => lec(i, "texto", e.target.value)} placeholder="Explicación. Deja una línea en blanco para separar párrafos." /></Field>
          <Field label="Pasos con fotografía (opcional)">
            <div style={{ display: "grid", gap: 8 }}>
              {(l.pasos || []).map((p, k) => (
                <div key={k} className="pp-ed-bloque" style={{ padding: 8 }}>
                  <div className="pp-fila-campos"><b>{k + 1}</b><Input value={p.t} placeholder="Describe el paso" onChange={(e) => lec(i, "pasos", l.pasos.map((x, j) => (j === k ? { ...x, t: e.target.value } : x)))} /><Button variante="ghost" className="btn-peq" icon="trash" aria-label="Quitar paso" onClick={() => lec(i, "pasos", l.pasos.filter((_, j) => j !== k))} /></div>
                  {p.foto && <img src={p.foto} alt={`Paso ${k + 1}`} style={{ maxWidth: 180, borderRadius: 10 }} />}
                  <BotonesFoto lado={640} etiqueta={p.foto ? "Cambiar foto" : "Subir foto"} onFoto={(f) => lec(i, "pasos", l.pasos.map((x, j) => (j === k ? { ...x, foto: f } : x)))} />
                </div>))}
              <Button variante="sec" className="btn-peq" icon="plus" onClick={() => lec(i, "pasos", [...(l.pasos || []), { t: "", foto: null }])}>Agregar paso</Button>
            </div>
          </Field>
          <Field label="Lista de verificación (una por línea)"><Area value={Array.isArray(l.checklist) ? l.checklist.join("\n") : l.checklist} onChange={(e) => lec(i, "checklist", e.target.value)} /></Field>
          <div className="form2"><Field label="Documento enlazado (https://…)"><Input type="url" value={l.docUrl || ""} onChange={(e) => lec(i, "docUrl", e.target.value || null)} /></Field><Field label="Nombre del documento"><Input value={l.docTitulo || ""} onChange={(e) => lec(i, "docTitulo", e.target.value)} /></Field></div>
        </div>))}

      <Titulo>Evaluación (opcional)</Titulo>
      <Card>
        <label className="pp-chk"><input type="checkbox" checked={!!c.evaluacion} onChange={(e) => set("evaluacion", e.target.checked ? { minimo: 80, preguntas: [0, 1, 2].map(() => ({ p: "", opciones: ["", "", ""], correcta: 0 })) } : null)} /><span>Incluir mini-evaluación de 3 a 5 preguntas con constancia</span></label>
        {c.evaluacion && (
          <div className="form" style={{ marginTop: 10 }}>
            <Field label="Calificación mínima para aprobar (50 a 100)"><Input type="number" inputMode="numeric" min="50" max="100" value={c.evaluacion.minimo} onChange={(e) => ev({ minimo: Number(e.target.value) })} /></Field>
            {c.evaluacion.preguntas.map((p, i) => (
              <div className="pp-ed-bloque" key={i}>
                <div className="fila-flex"><b style={{ flex: 1 }}>Pregunta {i + 1}</b>{c.evaluacion.preguntas.length > 3 && <Button variante="ghost" className="btn-peq" icon="trash" aria-label="Quitar pregunta" onClick={() => ev({ preguntas: c.evaluacion.preguntas.filter((_, j) => j !== i) })} />}</div>
                <Input value={p.p} placeholder="Texto de la pregunta" onChange={(e) => preg(i, { p: e.target.value })} />
                {p.opciones.map((o, j) => (
                  <label key={j} className="pp-fila-campos"><input type="radio" name={`ok${i}`} checked={p.correcta === j} onChange={() => preg(i, { correcta: j })} style={{ width: 22, height: 22 }} aria-label={`Opción ${j + 1} correcta`} /><Input value={o} placeholder={`Opción ${j + 1}${p.correcta === j ? " (correcta)" : ""}`} onChange={(e) => preg(i, { opciones: p.opciones.map((x, k) => (k === j ? e.target.value : x)) })} /></label>))}
              </div>))}
            {c.evaluacion.preguntas.length < 5 && <Button variante="sec" icon="plus" onClick={() => ev({ preguntas: [...c.evaluacion.preguntas, { p: "", opciones: ["", "", ""], correcta: 0 }] })}>Agregar pregunta</Button>}
          </div>)}
      </Card>
      <Nota>Los cursos y lecciones con video solo guardan el enlace de YouTube. Mientras no se pegue, la lección muestra «Video pendiente de subir».</Nota>
      <div className="barra-accion"><Button block loading={guardando} onClick={guardar}>Guardar curso</Button></div>
    </>
  );
}
