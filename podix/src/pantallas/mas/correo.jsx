// Correo interno: bandeja tipo correo entre usuarios del sistema (Entrada, Enviados, Borradores, Destacados, Archivados).
// Los correos se guardan en el estado y aparecen en la entrada del destinatario cuando entra con su cuenta.
// La salida a correos externos y el envío masivo NO existen en la demo: ver enviarCorreoExterno() en acciones_comunicacion.js.
import { useEffect, useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { aviso, Avatar, Badge, Buscador, Button, Chips, Field, Icon, Input, Area, Sheet } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { AdjuntoImagen, CampoPersonas, hacer } from "../../componentes/comunicacion/comun.jsx";
import * as C from "../../store/acciones_comunicacion.js";
import { getState } from "../../store/core.js";
import { fechaCorta, hora } from "../../lib/format.js";

const VACIO = { id: null, para: [], cc: [], asunto: "", cuerpo: "", imagen: null, etiquetas: [], responderA: null, externo: false };

const quienesTxt = (d, c, tokens, ids) => {
  const l = (tokens && tokens.length ? tokens : ids).map((t) => C.etiquetaToken(d, t));
  return l.length ? l.join(", ") : "(sin destinatarios)";
};

function Redactar({ d, yo, abierto, inicial, onClose }) {
  const [f, setF] = useState(VACIO);
  const [cc, setCc] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (abierto) { setF({ ...VACIO, ...inicial }); setCc(!!inicial?.cc?.length); } }, [abierto, inicial]);
  const grupos = C.gruposDestinatarios(d, yo);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const campos = () => ({ id: f.id, para: f.para, cc: f.cc, asunto: f.asunto, cuerpo: f.cuerpo, imagen: f.imagen, etiquetas: f.etiquetas, responderA: f.responderA });
  const enviar = () => {
    setEnviando(true);
    const { ok, r } = hacer((dd) => C.enviarCorreo(dd, { ...campos(), borradorId: f.id }), null);
    setEnviando(false);
    if (!ok) return;
    const n = r.para.length + r.cc.length;
    aviso(`Correo enviado a ${n} ${n === 1 ? "persona" : "personas"}.`, "ok");
    if (f.externo) { const x = C.enviarCorreoExterno(r, [yo.correo]); aviso(x.motivo, "warn"); }
    onClose();
  };
  const guardar = () => { const { ok } = hacer((dd) => C.guardarBorrador(dd, campos()), "Borrador guardado."); if (ok) onClose(); };
  const alternarEt = (e) => set("etiquetas")(f.etiquetas.includes(e) ? f.etiquetas.filter((x) => x !== e) : [...f.etiquetas, e]);
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={f.responderA ? "Responder" : f.id ? "Borrador" : "Redactar correo"}
      pie={<div className="dos"><Button variante="sec" block icon="file" onClick={guardar}>Guardar borrador</Button><Button block icon="send" loading={enviando} onClick={enviar}>Enviar</Button></div>}>
      <div className="com-nota"><Icon name="alert" size={16} /><span>Correo interno del sistema. La salida a correos externos (Gmail, Outlook…) y el envío masivo requieren configurar un proveedor de correo (pendiente).</span></div>
      <CampoPersonas d={d} yo={yo} label="Para" valor={f.para} onChange={set("para")} grupos={grupos} vacio="Elegir personas o grupos" />
      {cc ? <CampoPersonas d={d} yo={yo} label="CC" valor={f.cc} onChange={set("cc")} grupos={grupos} vacio="Elegir personas o grupos" /> : <button type="button" className="com-add" style={{ justifySelf: "start" }} onClick={() => setCc(true)}><Icon name="plus" size={14} />Agregar CC</button>}
      <Field label="Asunto"><Input value={f.asunto} onChange={(e) => set("asunto")(e.target.value)} maxLength={140} autoComplete="off" /></Field>
      <div className="field"><span>Etiquetas</span><div className="chips">{C.ETIQUETAS_CORREO.map((e) => <button key={e} type="button" className={`chip${f.etiquetas.includes(e) ? " on" : ""}`} onClick={() => alternarEt(e)}>{e}</button>)}</div></div>
      <Field label="Mensaje"><Area rows={9} value={f.cuerpo} onChange={(e) => set("cuerpo")(e.target.value)} placeholder="Escribe tu mensaje…" /></Field>
      <AdjuntoImagen valor={f.imagen} onChange={set("imagen")} lado={640} etiqueta="Adjuntar imagen pequeña" />
      <label className="fila-flex" style={{ minHeight: 44 }}>
        <input type="checkbox" checked={f.externo} onChange={(e) => set("externo")(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span>Enviar también una copia a mi correo externo <Badge tono="warn">simulación</Badge></span>
      </label>
    </Sheet>
  );
}

function Lector({ d, yo, correo, onAtras, onResponder, onAbrirBorrador }) {
  const hilo = C.hiloCorreo(d, yo.id, correo.id);
  const lista = hilo.length ? hilo : [correo];
  const destacado = (correo.destacadoPor || []).includes(yo.id);
  const archivado = (correo.archivadoPor || []).includes(yo.id);
  // Marca como leídos los de la cadena que me llegaron
  useEffect(() => {
    const sin = lista.filter((c) => !C.correoLeido(c, yo.id)).map((c) => c.id);
    if (sin.length) hacer((dd) => sin.forEach((id) => C.marcarCorreoLeido(dd, id, true)));
  }, [correo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const otros = correo.para.length + (correo.cc || []).length > 1;
  const alternarEt = (e) => hacer((dd) => C.etiquetarCorreo(dd, correo.id, (correo.etiquetas || []).includes(e) ? correo.etiquetas.filter((x) => x !== e) : [...(correo.etiquetas || []), e]));
  return (
    <div className="lista" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <div className="com-barra">
        <Button variante="ghost" icon="back" onClick={onAtras}>Volver</Button>
        <Button variante="sec" icon="undo" onClick={() => onResponder(hacerArmar(correo.id, "responder"))}>Responder</Button>
        {otros && <Button variante="sec" icon="users" onClick={() => onResponder(hacerArmar(correo.id, "todos"))}>Responder a todos</Button>}
        <Button variante="sec" icon="send" onClick={() => onResponder(hacerArmar(correo.id, "reenviar"))}>Reenviar</Button>
      </div>
      <div className="com-barra">
        <Button variante="ghost" icon="star" onClick={() => hacer((dd) => C.destacarCorreo(dd, correo.id), destacado ? "Quitado de destacados." : "Destacado.")}>{destacado ? "Quitar destacado" : "Destacar"}</Button>
        <Button variante="ghost" icon="download" onClick={() => { hacer((dd) => C.archivarCorreo(dd, correo.id), archivado ? "Devuelto a la entrada." : "Correo archivado."); onAtras(); }}>{archivado ? "Desarchivar" : "Archivar"}</Button>
        {correo.de !== yo.id && <Button variante="ghost" icon="mail" onClick={() => { hacer((dd) => C.marcarCorreoLeido(dd, correo.id, false), "Marcado como no leído."); onAtras(); }}>Marcar no leído</Button>}
      </div>
      <h2 style={{ margin: "4px 0 0", fontSize: 19 }}>{correo.asunto}</h2>
      <div className="chips">{C.ETIQUETAS_CORREO.map((e) => <button key={e} type="button" className={`chip${(correo.etiquetas || []).includes(e) ? " on" : ""}`} onClick={() => alternarEt(e)}>{e}</button>)}</div>
      {lista.map((c) => (
        <article key={c.id} className={`com-mail${c.de === yo.id ? " mio" : ""}`}>
          <div className="com-mail-cab">
            <Avatar nombre={C.nombreDe(d, c.de)} />
            <div className="fila-c">
              <div className="fila-t"><span>{C.nombreDe(d, c.de)}</span><span className="peq mu">{fechaCorta(c.ts)} · {hora(c.ts)}</span></div>
              <div className="com-dest">{C.rolDe(d, c.de)} · Para: {quienesTxt(d, c, c.paraTokens, c.para)}{c.cc?.length ? ` · CC: ${quienesTxt(d, c, c.ccTokens, c.cc)}` : ""}</div>
            </div>
          </div>
          <div className="com-mail-cuerpo">{c.cuerpo}</div>
          {c.adjuntos?.map((a, i) => a.src && <img key={i} src={a.src} alt={a.nombre || "Imagen adjunta"} />)}
        </article>
      ))}
    </div>
  );
}

// Arma los campos de respuesta/reenvío validando permiso en la acción (lectura sin mutar el estado)
function hacerArmar(id, modo) {
  try {
    const d = getState();
    if (modo === "reenviar") return C.armarReenvio(d, id);
    return C.armarRespuesta(d, id, { todos: modo === "todos" });
  } catch (e) { aviso(e.message, "warn"); return null; }
}

export default function Correo() {
  const { d, u } = useSesion();
  const [carpeta, setCarpeta] = useState("entrada");
  const [q, setQ] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [soloNL, setSoloNL] = useState(false);
  const [abiertoId, setAbiertoId] = useState(null);
  const [redactar, setRedactar] = useState(null);

  const cont = useMemo(() => C.conteosCorreo(d, u.id), [d, u.id]);
  const items = useMemo(() => C.carpetaCorreo(d, u.id, carpeta, { q, etiqueta: etiqueta || null, soloNoLeidos: soloNL }), [d, u.id, carpeta, q, etiqueta, soloNL]);
  const correo = abiertoId ? d.com.correos.find((c) => c.id === abiertoId) : null;
  const esSalida = carpeta === "enviados" || carpeta === "borradores";

  const abrir = (c) => {
    if (c.borrador) { setRedactar({ id: c.id, para: c.paraTokens || [], cc: c.ccTokens || [], asunto: c.asunto, cuerpo: c.cuerpo, imagen: c.adjuntos?.[0]?.src || null, etiquetas: c.etiquetas || [], responderA: c.enRespuestaA || null }); return; }
    setAbiertoId(c.id);
  };
  const redactarDesde = (campos) => { if (campos) setRedactar({ ...VACIO, ...campos }); };

  const columnas = [
    { k: "est", t: "", v: (c) => <button type="button" className={`com-estrella${(c.destacadoPor || []).includes(u.id) ? " on" : ""}`} aria-label="Destacar" onClick={(e) => { e.stopPropagation(); if (!c.borrador) hacer((dd) => C.destacarCorreo(dd, c.id)); }}><Icon name="star" size={18} /></button> },
    { k: "de", t: esSalida ? "Para" : "De", v: (c) => { const nl = !C.correoLeido(c, u.id); return <span className={nl ? "com-nl" : ""}>{esSalida ? quienesTxt(d, c, c.paraTokens, c.para) : C.nombreDe(d, c.de)}</span>; }, orden: (c) => (esSalida ? quienesTxt(d, c, c.paraTokens, c.para) : C.nombreDe(d, c.de)) },
    { k: "asu", t: "Asunto", v: (c) => { const nl = !C.correoLeido(c, u.id); return <span className="com-asu">{c.borrador && <span className="com-borrador">Borrador</span>}<b className={nl ? "com-nl" : ""} style={nl ? undefined : { fontWeight: 600 }}>{c.asunto || "(sin asunto)"}</b></span>; }, orden: (c) => c.asunto },
    { k: "et", t: "Etiquetas", v: (c) => <span className="com-tags">{(c.etiquetas || []).map((e) => <span key={e} className="com-et">{e}</span>)}</span> },
    { k: "ts", t: "Fecha", v: (c) => C.marcaCorta(c.ts), orden: (c) => c.ts, der: true },
  ];

  if (correo && !correo.borrador) {
    return (
      <>
        <Lector d={d} yo={u} correo={correo} onAtras={() => setAbiertoId(null)} onResponder={redactarDesde} />
        <Redactar d={d} yo={u} abierto={!!redactar} inicial={redactar} onClose={() => setRedactar(null)} />
      </>
    );
  }
  return (
    <>
      <div className="com-nota"><Icon name="alert" size={16} /><span>Correo interno del sistema. La salida a correos externos (Gmail, Outlook…) y el envío masivo requieren configurar un proveedor de correo (pendiente).</span></div>
      <div className="com-barra">
        <Button icon="plus" onClick={() => setRedactar({ ...VACIO })}>Redactar</Button>
        <Buscador valor={q} onChange={setQ} placeholder="Buscar por asunto, texto o persona…" />
      </div>
      <Chips scroll valor={carpeta} onChange={(v) => { setCarpeta(v); setAbiertoId(null); }} opciones={C.CARPETAS_CORREO.map((c) => ({ v: c.v, l: c.l, n: cont[c.v] || undefined }))} />
      <div className="com-barra">
        <Chips scroll valor={etiqueta} onChange={(v) => setEtiqueta(etiqueta === v ? "" : v)} opciones={C.ETIQUETAS_CORREO.map((e) => ({ v: e, l: e }))} />
        <button type="button" className={`chip${soloNL ? " on" : ""}`} onClick={() => setSoloNL(!soloNL)} aria-pressed={soloNL}>Solo no leídos</button>
      </div>
      <Vista id="correo-lista" inicial="renglones" items={items} columnas={columnas} onAbrir={abrir} minTarjeta={300}
        vacio={carpeta === "entrada" ? "Tu entrada está vacía." : "No hay correos en esta carpeta con ese filtro."}
        tarjeta={(c) => {
          const nl = !C.correoLeido(c, u.id);
          return (
            <div className="fila-c">
              <div className="fila-t"><span className={nl ? "com-nl" : ""}>{c.borrador ? "Borrador · " : ""}{esSalida ? quienesTxt(d, c, c.paraTokens, c.para) : C.nombreDe(d, c.de)}</span><span className="peq mu">{C.marcaCorta(c.ts)}</span></div>
              <div className={`fila-s${nl ? " com-nl" : ""}`}>{c.asunto || "(sin asunto)"}</div>
              <div className="fila-d"><span className="com-tags">{(c.etiquetas || []).map((e) => <span key={e} className="com-et">{e}</span>)}</span></div>
            </div>
          );
        }} />
      <Redactar d={d} yo={u} abierto={!!redactar} inicial={redactar} onClose={() => setRedactar(null)} />
    </>
  );
}
