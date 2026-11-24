// Mensajes: chat interno (directos, grupos, canal por sucursal, canal por rol y «Toda la empresa»).
// Escritorio ≥ 1024 px: dos paneles (lista + conversación). Teléfono: lista → conversación con botón de regreso.
// Sin servidor: no hay respuestas automáticas; los mensajes de otras personas solo existen en la semilla.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { Avatar, Buscador, Button, Chips, Field, Icon, Input, Select, Sheet, Vacio } from "../../ui/index.jsx";
import { AdjuntoImagen, SelectorPersonas, hacer } from "../../componentes/comunicacion/comun.jsx";
import * as C from "../../store/acciones_comunicacion.js";
import { dia, fechaCorta, hora } from "../../lib/format.js";

function AvatarHilo({ d, h, titulo, yo }) {
  if (h.tipo === "directo") return <Avatar nombre={titulo} />;
  const icon = h.global ? "building" : h.tipo === "sucursal" ? "shop" : h.tipo === "rol" ? "users" : "message";
  const cls = h.global ? "com-av-t" : h.tipo === "sucursal" ? "com-av-c" : "com-av-g";
  return <span className={`avatar ${cls}`}><Icon name={icon} size={20} /></span>;
}

function FilaHilo({ d, yo, x, activo, onClick }) {
  const h = x.hilo;
  const u = x.ultimo;
  const quien = u ? (u.de === yo.id ? "Tú: " : h.tipo === "directo" ? "" : `${C.nombreDe(d, u.de).split(" ")[0]}: `) : "";
  const resumen = u ? `${quien}${u.texto || (u.adjuntos?.length ? "📷 Imagen" : "")}` : "Sin mensajes todavía";
  return (
    <button type="button" className={`com-item${activo ? " on" : ""}${x.noLeidos ? " nl" : ""}`} onClick={onClick}>
      <AvatarHilo d={d} h={h} titulo={x.titulo} yo={yo} />
      <span className="com-item-c">
        <span className="com-item-t"><span>{x.titulo}</span><small>{u ? C.marcaCorta(u.ts) : ""}</small></span>
        <span className="com-item-s">
          <span>{resumen}</span>
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            {x.fijado && <Icon name="bookmark" size={14} className="ic-mu" />}
            {x.silenciado && <span className="peq mu" aria-label="Silenciada">silenciada</span>}
            {x.noLeidos > 0 && <span className={`com-n${x.silenciado ? " mudo" : ""}`} aria-label={`${x.noLeidos} sin leer`}>{x.noLeidos}</span>}
          </span>
        </span>
      </span>
    </button>
  );
}

function NuevaConversacion({ d, yo, abierto, onClose, onCreada }) {
  const tipos = C.tiposHiloPermitidos(yo);
  const [tipo, setTipo] = useState("directo");
  const [nombre, setNombre] = useState("");
  const [pers, setPers] = useState([]);
  const [suc, setSuc] = useState(yo.sucursales[0] || "S1");
  const [rol, setRol] = useState("podologo");
  useEffect(() => { if (abierto) { setTipo("directo"); setNombre(""); setPers([]); } }, [abierto]);
  const esDirecto = tipo === "directo";
  const crear = () => {
    const { ok, r } = hacer((dd) => C.crearHilo(dd, { tipo, nombre, miembros: pers, sucursalId: suc, rol }).id, null);
    if (ok) { onCreada(r); onClose(); }
  };
  const sucursalesPermitidas = yo.rol === "gerente" ? d.sucursales.filter((s) => yo.sucursales.includes(s.id)) : d.sucursales;
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo="Nueva conversación"
      pie={<Button block icon="message" onClick={crear} disabled={tipo === "todos" ? false : esDirecto ? !pers.length : tipo === "grupo" ? pers.length < 2 : false}>
        {tipo === "todos" ? "Abrir «Toda la empresa»" : "Crear conversación"}</Button>}>
      {tipos.length > 1 && <Chips scroll valor={tipo} onChange={(v) => { setTipo(v); setPers([]); }} opciones={tipos.map((t) => ({ v: t.v, l: t.l }))} />}
      {tipo === "grupo" && <Field label="Nombre del grupo"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Comité de compras" maxLength={60} /></Field>}
      {tipo === "sucursal" && (
        <>
          <Field label="Sucursal"><Select value={suc} onChange={(e) => setSuc(e.target.value)}>{sucursalesPermitidas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
          <Field label="Nombre del canal (opcional)" hint="Se agrega a todo el personal de la sucursal."><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Turno tarde" maxLength={60} /></Field>
        </>
      )}
      {tipo === "rol" && (
        <>
          <Field label="Rol o equipo"><Select value={rol} onChange={(e) => setRol(e.target.value)}>{Object.entries(C.ROL_ETIQUETA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Nombre del canal (opcional)"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} /></Field>
        </>
      )}
      {tipo === "todos" && <p className="txt mu">Canal con todo el personal. Si ya existe, se abre.</p>}
      {(esDirecto || tipo === "grupo") && (
        <>
          <p className="mu peq">{esDirecto ? "Elige a la persona (filtra por sucursal o rol)." : "Elige al menos dos personas más; tú entras automáticamente."}</p>
          <SelectorPersonas d={d} yo={yo} valor={pers} onChange={setPers} multi={!esDirecto} />
        </>
      )}
    </Sheet>
  );
}

function Integrantes({ d, h, abierto, onClose }) {
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={`Integrantes (${h.miembros.length})`}>
      <div className="lista">{h.miembros.map((id) => {
        const u = d.usuarios.find((x) => x.id === id);
        if (!u) return null;
        const t = C.trabajandoEn(d, id);
        return <div key={id} className="fila"><Avatar nombre={u.nombre} /><div className="fila-c"><div className="fila-t"><span>{C.nombreCorto(u)}</span></div><div className="fila-s">{C.ROL_ETIQUETA[u.rol]} · {C.sucursalDePersona(d, u)}</div>{t && <div className="fila-d"><span style={{ color: "var(--ok)" }}>Trabajando en: {t}</span></div>}</div></div>;
      })}</div>
    </Sheet>
  );
}

function Conversacion({ d, yo, h, onAtras, resaltar }) {
  const [texto, setTexto] = useState("");
  const [img, setImg] = useState(null);
  const [info, setInfo] = useState(false);
  const fin = useRef(null);
  const cuerpo = useRef(null);
  const titulo = C.tituloHilo(d, h, yo.id);
  const otro = h.tipo === "directo" ? d.usuarios.find((u) => u.id === h.miembros.find((x) => x !== yo.id)) : null;
  const trab = otro ? C.trabajandoEn(d, otro.id) : null;
  const fijado = (h.fijadoPor || []).includes(yo.id), silenciado = (h.silenciadoPor || []).includes(yo.id);
  const n = h.mensajes.length;
  const sinLeer = C.noLeidosHilo(h, yo.id);

  // Marcar leído al abrir (y cuando llegue algo mientras está abierto)
  useEffect(() => { if (sinLeer > 0) hacer((dd) => C.marcarHiloLeido(dd, h.id)); }, [h.id, sinLeer]);
  // Ir al final, o al mensaje encontrado en la búsqueda
  useEffect(() => {
    const el = resaltar ? cuerpo.current?.querySelector(`[data-m="${resaltar}"]`) : null;
    if (el) el.scrollIntoView({ block: "center" }); else fin.current?.scrollIntoView({ block: "end" });
  }, [h.id, n, resaltar]);
  useEffect(() => { setTexto(""); setImg(null); }, [h.id]);

  const enviar = () => {
    if (!texto.trim() && !img) return;
    const { ok } = hacer((dd) => C.enviarMensaje(dd, h.id, { texto, imagen: img }));
    if (ok) { setTexto(""); setImg(null); }
  };
  const clave = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } };

  let ultimoDia = "";
  return (
    <>
      <div className="com-conv-cab">
        <button type="button" className="icono com-atras" onClick={onAtras} aria-label="Volver a la lista"><Icon name="back" /></button>
        <AvatarHilo d={d} h={h} titulo={titulo} yo={yo} />
        <div className="com-item-c" role="button" tabIndex={0} onClick={() => setInfo(true)} onKeyDown={(e) => e.key === "Enter" && setInfo(true)}>
          <div className="fila-t"><span>{titulo}</span></div>
          <div className="sub">{otro ? <>{C.ROL_ETIQUETA[otro.rol]} · {C.sucursalDePersona(d, otro)}{trab && <> · <span className="trab">Trabajando en: {trab}</span></>}</> : C.subtituloHilo(d, h)}</div>
        </div>
        <button type="button" className="icono" onClick={() => hacer((dd) => C.fijarHilo(dd, h.id), fijado ? "Conversación desfijada" : "Conversación fijada")} aria-label={fijado ? "Desfijar conversación" : "Fijar conversación"} aria-pressed={fijado} style={fijado ? { color: "var(--p)" } : undefined}><Icon name="bookmark" /></button>
        <button type="button" className="icono" onClick={() => hacer((dd) => C.silenciarHilo(dd, h.id), silenciado ? "Notificaciones activadas" : "Conversación silenciada")} aria-label={silenciado ? "Quitar silencio" : "Silenciar conversación"} aria-pressed={silenciado} style={silenciado ? { color: "var(--al)" } : undefined}><Icon name={silenciado ? "wifioff" : "bell"} /></button>
      </div>
      <div className="com-msgs" ref={cuerpo}>
        {!n && <div className="com-vacio"><Icon name="message" size={32} /><p>Aún no hay mensajes. Escribe el primero.</p></div>}
        {h.mensajes.map((m) => {
          const f = dia(m.ts);
          const sep = f !== ultimoDia; ultimoDia = f;
          const yoEs = m.de === yo.id;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {sep && <div className="com-dia">{fechaCorta(m.ts)}</div>}
              <div className={`com-b${yoEs ? " yo" : ""}${resaltar === m.id ? " res" : ""}`} data-m={m.id}>
                {!yoEs && h.tipo !== "directo" && <span className="quien">{C.nombreDe(d, m.de)} <i>· {C.rolDe(d, m.de)}</i></span>}
                {m.adjuntos?.map((a, i) => a.tipo === "imagen" && <img key={i} src={a.src} alt="Imagen enviada" />)}
                {m.texto}
                <time>{hora(m.ts)}</time>
              </div>
            </div>
          );
        })}
        <div ref={fin} />
      </div>
      {img && <div className="com-prev"><img src={img} alt="Vista previa" /><span className="mu peq" style={{ flex: 1 }}>Imagen lista para enviar</span><button type="button" className="icono" onClick={() => setImg(null)} aria-label="Quitar imagen"><Icon name="x" /></button></div>}
      <div className="com-comp">
        <AdjuntoImagen soloIcono valor={img} onChange={setImg} lado={420} etiqueta="Adjuntar imagen" />
        <textarea className="inp" rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={clave} placeholder="Escribe un mensaje…" aria-label="Mensaje" maxLength={2000} />
        <Button icon="send" onClick={enviar} disabled={!texto.trim() && !img} aria-label="Enviar">Enviar</Button>
      </div>
      <Integrantes d={d} h={h} abierto={info} onClose={() => setInfo(false)} />
    </>
  );
}

export default function Mensajes() {
  const { d, u } = useSesion();
  const [selId, setSelId] = useState(null);
  const [resaltar, setResaltar] = useState(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [nueva, setNueva] = useState(false);

  const todos = useMemo(() => C.hilosDe(d, u.id), [d, u.id]);
  const ver = useMemo(() => {
    const nq = q.trim();
    let l = nq ? C.hilosDe(d, u.id, nq) : todos;
    if (filtro === "nl") l = l.filter((x) => x.noLeidos > 0);
    if (filtro === "dir") l = l.filter((x) => x.hilo.tipo === "directo");
    if (filtro === "can") l = l.filter((x) => x.hilo.tipo !== "directo");
    return l;
  }, [d, u.id, todos, q, filtro]);
  const enMensajes = useMemo(() => (q.trim().length >= 2 ? C.buscarMensajes(d, u.id, q) : []), [d, u.id, q]);
  const sel = selId ? d.com.hilos.find((h) => h.id === selId && h.miembros.includes(u.id)) : null;
  const noLeidos = C.mensajesNoLeidos(d, u.id);

  const abrir = (id, msg = null) => { setSelId(id); setResaltar(msg); };
  return (
    <>
      <div className={`com-chat${sel ? " sel" : ""}`}>
        <section className="com-lista" aria-label="Conversaciones">
          <div className="com-lista-cab">
            <div className="com-barra">
              <Buscador valor={q} onChange={setQ} placeholder="Buscar conversaciones y mensajes…" />
              <Button icon="plus" onClick={() => setNueva(true)} aria-label="Nueva conversación">Nueva</Button>
            </div>
            <Chips scroll valor={filtro} onChange={setFiltro} opciones={[{ v: "todas", l: "Todas" }, { v: "nl", l: "No leídas", n: noLeidos || undefined }, { v: "dir", l: "Directos" }, { v: "can", l: "Grupos y canales" }]} />
          </div>
          <div className="com-lista-cuerpo">
            {ver.map((x) => <FilaHilo key={x.id} d={d} yo={u} x={x} activo={x.id === selId} onClick={() => abrir(x.id)} />)}
            {!ver.length && <Vacio icon="message">{q ? "Ninguna conversación coincide." : filtro === "nl" ? "No tienes mensajes sin leer." : "Aún no tienes conversaciones. Crea una con «Nueva»."}</Vacio>}
            {enMensajes.length > 0 && (
              <>
                <div className="com-sec">En los mensajes ({enMensajes.length})</div>
                {enMensajes.map((m) => (
                  <button key={m.msgId} type="button" className="com-item" onClick={() => abrir(m.hiloId, m.msgId)}>
                    <Avatar nombre={C.nombreDe(d, m.de)} />
                    <span className="com-item-c">
                      <span className="com-item-t"><span>{m.hilo}</span><small>{C.marcaCorta(m.ts)}</small></span>
                      <span className="com-item-s"><span>{C.nombreDe(d, m.de).split(" ")[0]}: {m.texto}</span></span>
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </section>
        <section className="com-conv" aria-label="Conversación">
          {sel ? <Conversacion key={sel.id} d={d} yo={u} h={sel} resaltar={resaltar} onAtras={() => { setSelId(null); setResaltar(null); }} />
            : <div className="com-vacio"><Icon name="message" size={40} /><p>Elige una conversación de la lista.</p></div>}
        </section>
      </div>
      <NuevaConversacion d={d} yo={u} abierto={nueva} onClose={() => setNueva(false)} onCreada={(id) => abrir(id)} />
    </>
  );
}
