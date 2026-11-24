// Acervo de conocimiento: biblioteca buscable de videos (enlace de YouTube), fotos, guías, procedimientos y formatos.
// Todos consultan; gerente y administración publican, revisan y archivan.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Area, Badge, Button, Buscador, Card, Chips, Field, Icon, Input, Select, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { fechaCorta } from "../../lib/format.js";
import { NOMBRE_ROL } from "../../config/roles.js";
import * as A from "../../store/acciones_personas.js";
import "../../estilos_personas.css";
import { BotonesFoto, CampoYoutube, FlujoVideo, Nota, Reproductor, aLineas, esRes, parrafos, urlSegura } from "../../componentes/personas/comunes.jsx";

const ICONO = { video: "video", foto: "image", guia: "book", procedimiento: "clipboard", formato: "file" };
const ROLES = ["recepcion", "podologo", "asistente", "cajero", "almacen", "gerente", "admin", "direccion"];
const nombreDe = (d, id) => (d.usuarios.find((x) => x.id === id) || {}).nombre?.replace(/\s*\(.*\)/, "") || "—";

export default function Acervo() {
  const { d, u, sucursalId } = useSesion();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [tag, setTag] = useState("");
  const [arch, setArch] = useState(false);
  const [ver, setVer] = useState(null);
  const [form, setForm] = useState(null);
  const gestor = !!u && A.esGestor(u);
  const base = useMemo(() => (u ? A.acervoVisible(d, u, sucursalId, { archivados: arch }) : []), [d, u, sucursalId, arch]);
  const items = useMemo(() => (u ? A.acervoVisible(d, u, sucursalId, { q, categoria: cat, tipo, etiqueta: tag, archivados: arch }) : []), [d, u, sucursalId, q, cat, tipo, tag, arch]);
  if (!u) return null;
  const cats = [...new Set(base.map((a) => a.categoria))].sort();
  const tags = [...new Set(base.flatMap((a) => a.etiquetas || []))].sort().slice(0, 24);
  const sel = ver && d.cap.acervo.find((a) => a.id === ver);

  return (
    <>
      <div className="pp-filtros" style={{ gridTemplateColumns: undefined }}>
        <Buscador valor={q} onChange={setQ} placeholder="Buscar procedimientos, videos, formatos…" />
        {gestor && <Button icon="plus" onClick={() => setForm({})}>Publicar material</Button>}
      </div>
      <Chips scroll valor={cat} onChange={setCat} opciones={[{ v: "todas", l: "Todas", n: base.length }, ...cats.map((c) => ({ v: c, l: c, n: base.filter((a) => a.categoria === c).length }))]} />
      <Chips scroll valor={tipo} onChange={setTipo} opciones={[{ v: "todos", l: "Todos los tipos" }, ...A.TIPOS_ACERVO.map((t) => ({ v: t.v, l: t.l }))]} />
      {tags.length > 0 && <Chips scroll valor={tag} onChange={(v) => setTag(v === tag ? "" : v)} opciones={tags.map((t) => ({ v: t, l: `#${t}` }))} />}
      {gestor && <div className="fila-flex"><Chips valor={arch ? "arch" : "pub"} onChange={(v) => setArch(v === "arch")} opciones={[{ v: "pub", l: "Publicados" }, { v: "arch", l: "Archivados" }]} /></div>}

      <Vista id="acervo" items={items} onAbrir={(a) => setVer(a.id)} vacio="No hay material que coincida con la búsqueda." minTarjeta={280}
        columnas={[
          { k: "t", t: "Título", v: (a) => <b>{a.titulo}</b>, orden: (a) => a.titulo }, { k: "y", t: "Tipo", v: (a) => (A.TIPOS_ACERVO.find((t) => t.v === a.tipo) || {}).l, orden: (a) => a.tipo },
          { k: "c", t: "Categoría", v: (a) => a.categoria, orden: (a) => a.categoria }, { k: "u", t: "Subió", v: (a) => nombreDe(d, a.subidoPor) },
          { k: "f", t: "Fecha", v: (a) => fechaCorta(a.fecha), orden: (a) => a.fecha }, { k: "r", t: "Revisión", v: (a) => fechaCorta(a.revision.fecha), orden: (a) => a.revision.fecha },
          { k: "v", t: "Versión", v: (a) => a.version, der: true },
        ]}
        tarjeta={(a) => (
          <div className="pp-pad" style={{ display: "flex", gap: 12 }}>
            <div className="pp-acv-ic"><Icon name={ICONO[a.tipo]} size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{a.titulo}</b>
              <div className="mu peq" style={{ margin: "2px 0 6px" }}>{a.descripcion}</div>
              <div className="fila-flex" style={{ flexWrap: "wrap", gap: 4 }}>
                <Badge>{(A.TIPOS_ACERVO.find((t) => t.v === a.tipo) || {}).l}</Badge><Badge tono="neutral">{a.categoria}</Badge>
                {a.tipo === "video" && !a.youtube && <Badge tono="warn">Video pendiente</Badge>}
                {a.sucursalId && <Badge tono="info">{A.nombreSuc(d, a.sucursalId)}</Badge>}
              </div>
              <div className="mu peq" style={{ marginTop: 6 }}>v{a.version} · revisado {fechaCorta(a.revision.fecha)} por {nombreDe(d, a.revision.responsable)}</div>
            </div>
          </div>)} />

      <Detalle d={d} u={u} a={sel} gestor={gestor} onClose={() => setVer(null)} onEditar={(a) => { setVer(null); setForm(JSON.parse(JSON.stringify(a))); }} />
      <Formulario d={d} u={u} inicial={form} onClose={() => setForm(null)} />
    </>
  );
}

function Detalle({ d, u, a, gestor, onClose, onEditar }) {
  if (!a) return <Sheet abierto={false} onClose={onClose} />;
  const accion = (fn, ok) => { if (esRes(fn)) aviso(ok); };
  return (
    <Sheet abierto onClose={onClose} titulo={a.titulo}
      pie={gestor ? <div className="dos"><Button variante="sec" icon="edit" onClick={() => onEditar(a)}>Editar</Button>{a.estado === "archivado" ? <Button variante="ok" onClick={() => { accion(A.archivarAcervo({ id: a.id, archivar: false }), "Material restaurado."); onClose(); }}>Restaurar</Button> : <Button variante="ghost" onClick={() => { accion(A.archivarAcervo({ id: a.id }), "Material archivado."); onClose(); }}>Archivar</Button>}</div> : null}>
      <div className="fila-flex" style={{ flexWrap: "wrap" }}><Badge>{(A.TIPOS_ACERVO.find((t) => t.v === a.tipo) || {}).l}</Badge><Badge tono="neutral">{a.categoria}</Badge>{a.estado === "archivado" && <Badge tono="bad">Archivado</Badge>}{a.borrador && <Badge tono="warn">Borrador por validar</Badge>}</div>
      <p className="txt">{a.descripcion}</p>
      {a.tipo === "video" && <Reproductor id={a.youtube} titulo={a.titulo} />}
      {parrafos(a.contenido).map((p, i) => <p key={i} className="txt">{p}</p>)}
      {(a.imagenes || []).length > 0 ? <div className="pp-fotos">{a.imagenes.map((s, i) => <img key={i} src={s} alt={`${a.titulo} ${i + 1}`} />)}</div> : a.tipo === "foto" ? <div className="pp-video-vacio"><div><Icon name="image" size={30} /><p style={{ margin: "6px 0 0" }}>Fotografías pendientes de subir</p></div></div> : null}
      {urlSegura(a.docUrl) && <a href={a.docUrl} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16} /> Abrir documento</a>}
      <Card><div className="pp-dl">
        <div><span>Subió</span><b>{nombreDe(d, a.subidoPor)} · {fechaCorta(a.fecha)}</b></div>
        <div><span>Dirigido a</span><b>{a.sucursalId ? A.nombreSuc(d, a.sucursalId) : "Todas las sucursales"} · {a.roles.length ? a.roles.map((r) => NOMBRE_ROL[r] || r).join(", ") : "todos los roles"}</b></div>
        <div><span>Versión</span><b>{a.version}</b></div>
        <div><span>Última revisión</span><b>{fechaCorta(a.revision.fecha)} · {nombreDe(d, a.revision.responsable)}</b></div>
        {(a.etiquetas || []).length > 0 && <div><span>Etiquetas</span><b>{a.etiquetas.map((t) => `#${t}`).join(" ")}</b></div>}
      </div></Card>
      {gestor && a.estado !== "archivado" && <Button variante="sec" icon="check" onClick={() => accion(A.revisarAcervo({ id: a.id }), "Marcado como revisado hoy.")}>Marcar como revisado hoy</Button>}
    </Sheet>
  );
}

function Formulario({ d, u, inicial, onClose }) {
  const [v, setV] = useState(null);
  const [vez, setVez] = useState(null);
  if (inicial && vez !== inicial) { setVez(inicial); setV({ tipo: "guia", categoria: A.CATEGORIAS_ACERVO[0], titulo: "", descripcion: "", contenido: "", etiquetas: "", sucursalId: "", roles: [], youtubeUrl: "", imagenes: [], docUrl: "", ...inicial, etiquetas: (inicial.etiquetas || []).join(", "), sucursalId: inicial.sucursalId || "", docUrl: inicial.docUrl || "", youtubeUrl: "" }); }
  if (!inicial && vez) { setVez(null); setV(null); }
  if (!inicial || !v) return <Sheet abierto={false} onClose={onClose} />;
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const sucs = A.esAdmin(u) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  const ok = () => {
    const r = A.guardarAcervo({ ...v, etiquetas: v.etiquetas.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), sucursalId: v.sucursalId || null, docUrl: v.docUrl || null });
    if (esRes(r)) { aviso(v.id ? `Material actualizado (versión ${r.entrada.version}).` : "Material publicado."); onClose(); }
  };
  return (
    <Sheet abierto onClose={onClose} titulo={v.id ? "Editar material" : "Publicar material"} pie={<Button block onClick={ok}>{v.id ? "Guardar nueva versión" : "Publicar"}</Button>}>
      <Field label="Título"><Input value={v.titulo} onChange={set("titulo")} /></Field>
      <div className="form2"><Field label="Tipo"><Select value={v.tipo} onChange={set("tipo")}>{A.TIPOS_ACERVO.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</Select></Field><Field label="Categoría"><Select value={v.categoria} onChange={set("categoria")}>{[...new Set([...A.CATEGORIAS_ACERVO, v.categoria])].map((c) => <option key={c}>{c}</option>)}</Select></Field></div>
      <Field label="Descripción corta"><Input value={v.descripcion} onChange={set("descripcion")} /></Field>
      {v.tipo === "video" && (<><FlujoVideo /><CampoYoutube valor={v.youtubeUrl} idActual={v.youtube} onChange={(x) => setV((o) => ({ ...o, youtubeUrl: x }))} /></>)}
      <Field label="Contenido (texto, pasos o descripción)"><Area rows={5} value={v.contenido} onChange={set("contenido")} /></Field>
      {(v.tipo === "foto" || v.tipo === "procedimiento" || v.tipo === "guia") && (
        <Field label={`Fotografías (${(v.imagenes || []).length})`}>
          <div className="pp-fotos" style={{ marginBottom: 8 }}>{(v.imagenes || []).map((s, i) => <img key={i} src={s} alt={`Foto ${i + 1}`} onClick={() => setV((x) => ({ ...x, imagenes: x.imagenes.filter((_, j) => j !== i) }))} title="Toca para quitar" />)}</div>
          <BotonesFoto lado={640} etiqueta="Agregar foto" onFoto={(f) => setV((x) => ({ ...x, imagenes: [...(x.imagenes || []), f].slice(0, 8) }))} />
        </Field>)}
      <Field label="Enlace a documento (opcional)"><Input type="url" value={v.docUrl} onChange={set("docUrl")} placeholder="https://…" /></Field>
      <Field label="Etiquetas (separadas por coma)"><Input value={v.etiquetas} onChange={set("etiquetas")} placeholder="corte de caja, checklist" /></Field>
      <Field label="Sucursal destino"><Select value={v.sucursalId} onChange={set("sucursalId")}><option value="">Todas las sucursales</option>{sucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
      <Field label="Roles destino (vacío = todos)"><div className="chips">{ROLES.map((r) => <button type="button" key={r} className={`chip${v.roles.includes(r) ? " on" : ""}`} onClick={() => setV((x) => ({ ...x, roles: x.roles.includes(r) ? x.roles.filter((y) => y !== r) : [...x.roles, r] }))}>{NOMBRE_ROL[r]}</button>)}</div></Field>
      <Nota>Cada cambio sube la versión y guarda quién y cuándo lo revisó. Quedan registrados en la bitácora.</Nota>
    </Sheet>
  );
}
