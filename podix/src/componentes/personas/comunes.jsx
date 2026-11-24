// Piezas compartidas del dominio «personas»: filtros, insignias, hoja imprimible, YouTube y subida de fotos.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Field, Icon, Input, Select, aviso } from "../../ui/index.jsx";
import { reducirImagen } from "../../ui/vista.jsx";
import { extraerIdYoutube, urlEmbedYoutube } from "../../store/acciones_personas.js";
import "../../estilos_personas.css";

export const ESTADO_DIA = {
  normal: ["ok", "A tiempo"], retardo: ["warn", "Retardo"], falta: ["bad", "Falta"], vacaciones: ["info", "Vacaciones"], incapacidad: ["info", "Incapacidad"],
  permiso: ["info", "Permiso"], descanso: ["neutral", "Descanso"], pendiente: ["neutral", "Sin entrada aún"], sin_registro: ["warn", "Sin registro"], programado: ["neutral", "Programado"], baja: ["neutral", "Baja"],
};
export const BadgeEstado = ({ estado }) => { const [t, l] = ESTADO_DIA[estado] || ["neutral", estado]; return <Badge tono={t}>{l}</Badge>; };
export const TONO_SOL = { solicitada: "warn", aprobada: "ok", rechazada: "bad", registrada: "neutral" };
export const ETQ_SOL = { solicitada: "Por aprobar", aprobada: "Aprobada", rechazada: "Rechazada", registrada: "Registrada" };

export const Aviso = ({ children }) => <div className="pp-aviso">{children}</div>;
export const Nota = ({ children }) => <div className="pp-nota">{children}</div>;
export const Barra = ({ pct, tono }) => <div className={`pp-barra ${tono || (pct >= 100 ? "ok" : pct < 40 ? "bad" : "")}`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;

/** Selector de sucursal: opciones = ids visibles; todas = permite «Todas». */
export function SelectorSuc({ d, opciones, valor, onChange, todas = true, label = "Sucursal" }) {
  if (opciones.length <= 1 && !todas) return null;
  return (
    <Field label={label}>
      <Select value={valor || ""} onChange={(e) => onChange(e.target.value || null)} aria-label={label}>
        {todas && opciones.length > 1 && <option value="">Todas las sucursales</option>}
        {opciones.map((id) => <option key={id} value={id}>{(d.sucursales.find((s) => s.id === id) || { nombre: id === "CEN" ? "Almacén central" : id }).nombre}</option>)}
      </Select>
    </Field>
  );
}

/** Hoja imprimible: vista previa en pantalla y window.print() que muestra solo la hoja. */
export function Hoja({ abierto, onClose, titulo, children }) {
  useEffect(() => {
    if (!abierto) return undefined;
    const h = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [abierto, onClose]);
  if (!abierto) return null;
  const imprimir = () => {
    document.body.classList.add("pp-imprimiendo");
    const fin = () => { document.body.classList.remove("pp-imprimiendo"); removeEventListener("afterprint", fin); };
    addEventListener("afterprint", fin);
    try { window.print(); } finally { setTimeout(fin, 1500); }
  };
  return createPortal(
    <div className="pp-hoja-fondo" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="pp-hoja-barra"><b>{titulo}</b><span style={{ display: "flex", gap: 8 }}><Button icon="file" onClick={imprimir}>Imprimir</Button><Button variante="sec" onClick={onClose}>Cerrar</Button></span></div>
      <div className="pp-hoja">{children}</div>
    </div>, document.body);
}

/** Video de YouTube incrustado (nocookie) o aviso de «video pendiente». */
export function Reproductor({ id, titulo }) {
  if (!id) return <div className="pp-video-vacio"><div><Icon name="video" size={34} /><p style={{ margin: "8px 0 0" }}><b>Video pendiente de subir</b><br /><span className="peq">Aún no se ha pegado el enlace de YouTube de esta lección.</span></p></div></div>;
  return <div className="pp-video"><iframe src={urlEmbedYoutube(id)} title={titulo || "Video"} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>;
}

export function FlujoVideo() {
  return (
    <div className="pp-nota">
      <b>Cómo se agrega un video</b>
      <div className="pp-flujo" style={{ marginTop: 6 }}><b>1. Grabar</b> → <b>2. Subir a YouTube como video NO LISTADO en el canal de la empresa</b> → <b>3. Pegar aquí el enlace</b></div>
      <div className="peq" style={{ marginTop: 6 }}>El sistema solo guarda el enlace; el video no se sube aquí.</div>
    </div>
  );
}

/** Campo de enlace de YouTube con validación: onChange(url, id|null). */
export function CampoYoutube({ valor, idActual, onChange }) {
  const url = valor ?? "";
  const id = url.trim() ? extraerIdYoutube(url) : null;
  const malo = url.trim() && !id;
  return (
    <Field label="Enlace de YouTube" hint={id ? `Video reconocido (${id})` : idActual && !url ? `Enlace actual guardado (${idActual}). Pega otro para cambiarlo.` : "Acepta watch?v=, youtu.be/, embed/ o shorts/"} error={malo ? "El enlace no es válido. Pega la dirección del video de YouTube." : null}>
      <Input type="url" inputMode="url" autoComplete="off" placeholder="https://youtu.be/…" value={url} onChange={(e) => onChange(e.target.value, extraerIdYoutube(e.target.value))} />
    </Field>
  );
}

/** Botones «Subir foto» y «Tomar foto» que devuelven una miniatura (dataURL) ya reducida. */
export function BotonesFoto({ onFoto, lado = 480, etiqueta = "Subir foto", camara = true }) {
  const a = useRef(null), b = useRef(null);
  const [cargando, setCargando] = useState(false);
  const elegir = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    setCargando(true);
    try { onFoto(await reducirImagen(f, lado)); } catch (x) { aviso(x.message || "No se pudo leer la imagen.", "bad"); } finally { setCargando(false); }
  };
  return (
    <div className="fila-flex" style={{ flexWrap: "wrap" }}>
      <input ref={a} type="file" accept="image/*" hidden onChange={elegir} />
      <input ref={b} type="file" accept="image/*" capture="environment" hidden onChange={elegir} />
      <Button type="button" variante="sec" icon="image" loading={cargando} onClick={() => a.current.click()}>{etiqueta}</Button>
      {camara && <Button type="button" variante="sec" icon="camera" onClick={() => b.current.click()}>Tomar foto</Button>}
    </div>
  );
}

export const aLineas = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
export const urlSegura = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : null);
export const parrafos = (t) => String(t || "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
export function descargar(nombre, texto, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
export const esRes = (r) => { if (r && r.ok === false) { aviso(r.error, "bad"); return false; } return true; };
