// Comunidad (feed): muro para toda la empresa o por sucursal. Avisos oficiales solo de admin/dirección/gerente;
// Logro, Reconocimiento, Evento y Foto los publica cualquier rol. Reacciones, comentarios, fijados y moderación.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Avatar, Badge, Buscador, Button, Card, Chips, Confirmar, Field, Icon, Input, Area, Select, Sheet, Titulo, Vacio } from "../../ui/index.jsx";
import { AdjuntoImagen, hacer } from "../../componentes/comunicacion/comun.jsx";
import * as C from "../../store/acciones_comunicacion.js";

const TONO = { aviso: "warn", logro: "ok", reconocimiento: "info", evento: "neutral", foto: "neutral" };
const ETQ = Object.fromEntries(C.TIPOS_FEED.map((t) => [t.v, t.l]));
const VACIO = { tipo: "logro", titulo: "", texto: "", imagen: null, alcance: "todos", fijado: false, etiquetadoId: "" };

function Publicar({ d, u, abierto, editando, onClose }) {
  const [f, setF] = useState(VACIO);
  const permitidos = C.tiposFeedPermitidos(u);
  const puedeFijar = ["admin", "direccion", "gerente"].includes(u.rol);
  const sucs = ["admin", "direccion"].includes(u.rol) ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));
  useEffect(() => {
    if (!abierto) return;
    setF(editando ? { ...VACIO, tipo: editando.tipo, titulo: editando.titulo, texto: editando.texto, imagen: editando.imagen || null, alcance: editando.alcance, fijado: editando.fijado, etiquetadoId: editando.etiquetadoId || "" } : { ...VACIO, tipo: permitidos[0]?.v === "aviso" ? "aviso" : "logro", alcance: "todos" });
  }, [abierto, editando]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const gente = d.usuarios.filter((x) => x.activo !== false && x.id !== u.id).sort((a, b) => C.nombreCorto(a).localeCompare(C.nombreCorto(b), "es"));
  const publicar = () => {
    const { ok } = editando
      ? hacer((dd) => C.editarPublicacion(dd, editando.id, { titulo: f.titulo, texto: f.texto, imagen: f.imagen, alcance: f.alcance }), "Publicación actualizada.")
      : hacer((dd) => C.publicarFeed(dd, { tipo: f.tipo, titulo: f.titulo, texto: f.texto, imagen: f.imagen, alcance: f.alcance, fijado: f.fijado, etiquetadoId: f.etiquetadoId || null }), "Publicado en la comunidad.");
    if (ok) onClose();
  };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={editando ? "Editar publicación" : "Nueva publicación"} pie={<Button block icon="send" onClick={publicar}>{editando ? "Guardar cambios" : "Publicar"}</Button>}>
      {!editando && <Chips scroll valor={f.tipo} onChange={set("tipo")} opciones={permitidos.map((t) => ({ v: t.v, l: t.l }))} />}
      {!editando && u.rol && !permitidos.some((t) => t.v === "aviso") && <p className="mu peq">Los avisos oficiales los publican Administración, Dirección y gerentes.</p>}
      {f.tipo === "reconocimiento" && !editando && (
        <Field label="¿A quién reconoces?"><Select value={f.etiquetadoId} onChange={(e) => set("etiquetadoId")(e.target.value)}><option value="">Elegir persona…</option>{gente.map((x) => <option key={x.id} value={x.id}>{C.nombreCorto(x)} · {C.ROL_ETIQUETA[x.rol]} · {C.sucursalDePersona(d, x)}</option>)}</Select></Field>
      )}
      <Field label="Título"><Input value={f.titulo} onChange={(e) => set("titulo")(e.target.value)} maxLength={90} placeholder={f.tipo === "evento" ? "Ej. Jornada de salud del pie" : "Ej. ¡Meta cumplida!"} /></Field>
      <Field label={f.tipo === "foto" ? "Texto (opcional)" : "Texto"}><Area rows={5} value={f.texto} onChange={(e) => set("texto")(e.target.value)} placeholder="Cuenta lo que quieres compartir con la comunidad…" /></Field>
      <div className="field"><span>{f.tipo === "foto" ? "Foto" : "Imagen (opcional)"}</span><AdjuntoImagen valor={f.imagen} onChange={set("imagen")} lado={640} etiqueta={f.imagen ? "Cambiar imagen" : "Agregar imagen"} /></div>
      <Field label="¿Quién lo ve?"><Select value={f.alcance} onChange={(e) => set("alcance")(e.target.value)}><option value="todos">Toda la empresa</option>{sucs.map((s) => <option key={s.id} value={s.id}>Solo {s.nombre}</option>)}</Select></Field>
      {puedeFijar && !editando && (
        <label className="fila-flex" style={{ minHeight: 44 }}><input type="checkbox" checked={f.fijado} onChange={(e) => set("fijado")(e.target.checked)} style={{ width: 22, height: 22 }} /><span>Fijar arriba del muro</span></label>
      )}
    </Sheet>
  );
}

function Post({ d, u, p, nuevo, onEditar, onEliminar }) {
  const [coms, setComs] = useState(false);
  const [texto, setTexto] = useState("");
  const [menu, setMenu] = useState(false);
  const au = d.usuarios.find((x) => x.id === p.autorId);
  const etiquetado = p.etiquetadoId ? d.usuarios.find((x) => x.id === p.etiquetadoId) : null;
  const puedeEd = C.puedeEditarPublicacion(d, u, p), puedeFij = C.puedeFijarPublicacion(d, u, p);
  const nCom = (p.comentarios || []).length;
  const suc = p.alcance === "todos" ? "Toda la empresa" : `Solo ${C.nombreSucursal(d, p.alcance)}`;
  const comentar = () => { const { ok } = hacer((dd) => C.comentarPublicacion(dd, p.id, texto)); if (ok) setTexto(""); };
  return (
    <article className={`com-post${p.fijado ? " fij" : ""}${nuevo ? " nuevo" : ""}`}>
      <div className="com-post-cab">
        <Avatar nombre={C.nombreDe(d, p.autorId)} />
        <div className="fila-c">
          <div className="n">{C.nombreDe(d, p.autorId)}</div>
          <div className="s">{au ? C.ROL_ETIQUETA[au.rol] : ""} · {C.nombreSucursal(d, p.sucursalId) || "Oficinas centrales"} · {C.tiempoRelativo(p.ts)}{p.editado ? " · editado" : ""}</div>
        </div>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flex: "none" }}>
          {p.fijado && <Badge tono="info">Fijado</Badge>}
          {nuevo && <Badge tono="ok">Nuevo</Badge>}
          <Badge tono={TONO[p.tipo]}>{ETQ[p.tipo]}</Badge>
        </span>
        {(puedeEd || puedeFij) && <button type="button" className="icono" aria-label="Opciones de la publicación" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="more" /></button>}
      </div>
      {menu && (
        <div className="com-acc">
          {puedeEd && <Button variante="ghost" icon="edit" onClick={() => { setMenu(false); onEditar(p); }}>Editar</Button>}
          {puedeFij && <Button variante="ghost" icon="bookmark" onClick={() => { hacer((dd) => C.fijarPublicacion(dd, p.id), p.fijado ? "Publicación desfijada." : "Publicación fijada."); setMenu(false); }}>{p.fijado ? "Quitar fijado" : "Fijar arriba"}</Button>}
          {puedeEd && <Button variante="danger" icon="trash" onClick={() => { setMenu(false); onEliminar(p); }}>Eliminar</Button>}
        </div>
      )}
      <h3>{p.titulo}</h3>
      {etiquetado && <div className="com-reco"><Icon name="award" size={18} />Reconocimiento para {C.nombreCorto(etiquetado)} · {C.ROL_ETIQUETA[etiquetado.rol]}</div>}
      {p.texto && <p>{p.texto}</p>}
      {p.imagen && <img className="img" src={p.imagen} alt={p.titulo} />}
      <div className="mu peq">Visible para: {suc}</div>
      <div className="com-reacs">
        {C.REACCIONES.map((e) => {
          const l = p.reacciones?.[e] || [];
          const yo = l.includes(u.id);
          return (
            <button key={e} type="button" className={`com-r${yo ? " on" : ""}`} aria-pressed={yo} aria-label={`${e} ${l.length}`} title={l.map((id) => C.nombreDe(d, id)).join(", ")} onClick={() => hacer((dd) => C.reaccionar(dd, p.id, e))}>
              <span>{e}</span>{l.length > 0 && <b>{l.length}</b>}
            </button>
          );
        })}
        <button type="button" className="com-r txt" onClick={() => setComs(!coms)} aria-expanded={coms}><Icon name="message" size={16} />{nCom ? `${nCom} ${nCom === 1 ? "comentario" : "comentarios"}` : "Comentar"}</button>
      </div>
      {coms && (
        <div className="com-coms">
          {(p.comentarios || []).map((c) => (
            <div key={c.id} className="com-com">
              <Avatar nombre={C.nombreDe(d, c.de)} />
              <div className="cu">
                <b>{C.nombreDe(d, c.de)}</b><small>{C.tiempoRelativo(c.ts)}</small>
                <p>{c.texto}</p>
              </div>
              {(c.de === u.id || C.puedeModerar(d, u, p)) && <button type="button" className="icono" aria-label="Eliminar comentario" onClick={() => hacer((dd) => C.eliminarComentario(dd, p.id, c.id), "Comentario eliminado.")}><Icon name="trash" size={16} /></button>}
            </div>
          ))}
          <div className="com-com-f">
            <input className="inp" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comentar()} placeholder="Escribe un comentario…" aria-label="Comentario" maxLength={600} />
            <Button icon="send" onClick={comentar} disabled={!texto.trim()} aria-label="Enviar comentario">Enviar</Button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Feed() {
  const { d, u } = useSesion();
  const [tipo, setTipo] = useState("");
  const [suc, setSuc] = useState("");
  const [q, setQ] = useState("");
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const visto = useRef(d.com?.feedVisto?.[u.id] || "");

  // Al abrir el muro, lo nuevo se marca como visto (el distintivo «Nuevo» sigue en esta visita)
  useEffect(() => { if (C.feedNuevos(d, u.id) > 0) hacer((dd) => C.marcarFeedVisto(dd)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => C.feedDe(d, u.id, { tipo: tipo || null, sucursalId: suc || null, q }), [d, u.id, tipo, suc, q]);
  const todas = useMemo(() => C.feedDe(d, u.id), [d, u.id]);
  const fijados = todas.filter((p) => p.fijado);
  const eventos = todas.filter((p) => p.tipo === "evento").slice(0, 4);
  const puedeTodas = ["admin", "direccion"].includes(u.rol);
  const sucs = puedeTodas ? d.sucursales : d.sucursales.filter((s) => u.sucursales.includes(s.id));

  return (
    <>
      <div className="com-feed">
        <div className="com-feed-col">
          <button type="button" className="com-comp-inicio" onClick={() => { setEditando(null); setNueva(true); }}>
            <Avatar nombre={u.nombre} /><span>¿Qué quieres compartir con la comunidad?</span><Icon name="plus" size={20} />
          </button>
          <div className="com-barra">
            <Buscador valor={q} onChange={setQ} placeholder="Buscar en el muro…" />
            <Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Filtrar por alcance" style={{ width: "auto", minWidth: 170 }}>
              <option value="">Todo el muro</option><option value="todos">Toda la empresa</option>{sucs.map((s) => <option key={s.id} value={s.id}>Solo {s.nombre}</option>)}
            </Select>
          </div>
          <Chips scroll valor={tipo} onChange={(v) => setTipo(tipo === v ? "" : v)} opciones={C.TIPOS_FEED.map((t) => ({ v: t.v, l: t.l }))} />
          {lista.map((p) => <Post key={p.id} d={d} u={u} p={p} nuevo={p.autorId !== u.id && p.ts > visto.current} onEditar={(x) => { setEditando(x); setNueva(true); }} onEliminar={setBorrar} />)}
          {!lista.length && <Vacio icon="megaphone">{q || tipo || suc ? "Ninguna publicación coincide con el filtro." : "Aún no hay publicaciones. ¡Sé la primera persona en compartir algo!"}</Vacio>}
        </div>
        <aside className="com-feed-lado" aria-label="Resumen del muro">
          {fijados.length > 0 && (
            <Card><Titulo>Fijados</Titulo><div className="lista" style={{ marginTop: 8 }}>{fijados.map((p) => <div key={p.id} className="fila-s"><b style={{ color: "var(--tx)" }}>{p.titulo}</b><div className="peq">{C.nombreDe(d, p.autorId)} · {C.tiempoRelativo(p.ts)}</div></div>)}</div></Card>
          )}
          {eventos.length > 0 && (
            <Card><Titulo>Eventos</Titulo><div className="lista" style={{ marginTop: 8 }}>{eventos.map((p) => <div key={p.id} className="fila-s"><b style={{ color: "var(--tx)" }}>{p.titulo}</b><div className="peq">{p.alcance === "todos" ? "Toda la empresa" : C.nombreSucursal(d, p.alcance)} · {C.tiempoRelativo(p.ts)}</div></div>)}</div></Card>
          )}
          <p className="mu peq">Muro de la comunidad: aquí compartimos logros, reconocimientos y avisos. Cuida el tono: es de todos.</p>
        </aside>
      </div>
      <Publicar d={d} u={u} abierto={nueva} editando={editando} onClose={() => { setNueva(false); setEditando(null); }} />
      <Confirmar abierto={!!borrar} peligro titulo="Eliminar publicación" texto={borrar ? `Se eliminará «${borrar.titulo}» con sus reacciones y comentarios.${borrar.autorId !== u.id ? " Quedará registrado en la bitácora como moderación." : ""}` : ""} confirmar="Eliminar"
        onNo={() => setBorrar(null)} onSi={() => { hacer((dd) => C.eliminarPublicacion(dd, borrar.id), "Publicación eliminada."); setBorrar(null); }} />
    </>
  );
}
