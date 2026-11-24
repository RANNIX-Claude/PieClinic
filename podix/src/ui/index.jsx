// Componentes compartidos. Un solo juego de íconos (trazo 1.8), áreas táctiles ≥ 44 px, campos ≥ 16 px.
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const P = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  flask: '<path d="M10 2v7.5L4 20a1 1 0 0 0 1 1.5h14a1 1 0 0 0 1-1.5l-6-10.5V2M8.5 2h7"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  wallet: '<path d="M20 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h13"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/><path d="M21 12h-4a2 2 0 0 0 0 4h4z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  repeat: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  wifioff: '<path d="M1 1l22 22M16.7 11.1A11 11 0 0 1 21 13.6M5 13a11 11 0 0 1 5.2-2.8M8.5 16.4a6 6 0 0 1 7 0M12 20h.01"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V22h16"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M22 7l-6 5 6 5z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/>',
  shop: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  trending: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
};
export const ICONOS = Object.keys(P);

export function Icon({ name, size = 20, className = "" }) {
  return <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] || P.more }} />;
}

export function Button({ children, variante = "primary", icon, block, loading, ...p }) {
  return (
    <button {...p} disabled={p.disabled || loading} className={`btn btn-${variante}${block ? " btn-block" : ""} ${p.className || ""}`}>
      {icon && <Icon name={icon} size={18} />}{loading ? "Procesando…" : children}
    </button>
  );
}
export const Card = ({ children, className = "", onClick, tono }) => (
  <div className={`card${tono ? ` card-${tono}` : ""}${onClick ? " card-tap" : ""} ${className}`} onClick={onClick} role={onClick ? "button" : undefined}>{children}</div>
);
export const Badge = ({ children, tono = "neutral" }) => <span className={`badge badge-${tono}`}>{children}</span>;
export const Kpi = ({ label, valor, nota, tono }) => (
  <div className={`kpi${tono ? ` kpi-${tono}` : ""}`}><small>{label}</small><b>{valor}</b>{nota && <em>{nota}</em>}</div>
);
export const Titulo = ({ children, derecha }) => <div className="titulo"><h2>{children}</h2>{derecha}</div>;
export const Vacio = ({ icon = "search", children }) => <div className="vacio"><Icon name={icon} size={32} /><p>{children}</p></div>;
export const Avatar = ({ nombre, tono }) => {
  const ini = String(nombre || "?").split(/\s+/).filter((x) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x)).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  return <span className={`avatar${tono ? ` avatar-${tono}` : ""}`}>{ini}</span>;
};

/** Fila de lista (la "tabla en tarjetas" del estándar): título, subtítulo, datos clave, insignia y acción. */
export function Fila({ titulo, sub, datos, badge, derecha, onClick, izquierda }) {
  return (
    <div className={`fila${onClick ? " fila-tap" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      {izquierda}
      <div className="fila-c">
        <div className="fila-t"><span>{titulo}</span>{badge}</div>
        {sub && <div className="fila-s">{sub}</div>}
        {datos && <div className="fila-d">{datos}</div>}
      </div>
      {derecha}{onClick && !derecha && <Icon name="chevron" size={18} className="ic-mu" />}
    </div>
  );
}

export function Field({ label, error, hint, children }) {
  return <label className="field"><span>{label}</span>{children}{hint && <em>{hint}</em>}{error && <strong>{error}</strong>}</label>;
}
export const Input = (p) => <input {...p} className={`inp ${p.className || ""}`} />;
export const Select = ({ children, ...p }) => <select {...p} className={`inp ${p.className || ""}`}>{children}</select>;
export const Area = (p) => <textarea rows={3} {...p} className={`inp ${p.className || ""}`} />;
export function Buscador({ valor, onChange, placeholder = "Buscar…" }) {
  return <div className="buscador"><Icon name="search" size={18} /><input type="search" value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="search" /></div>;
}
/** Control segmentado / chips. opciones: [{v, l, n?}] */
export function Chips({ opciones, valor, onChange, scroll }) {
  return (
    <div className={`chips${scroll ? " chips-scroll" : ""}`} role="tablist">
      {opciones.map((o) => (
        <button key={o.v} role="tab" aria-selected={valor === o.v} className={`chip${valor === o.v ? " on" : ""}`} onClick={() => onChange(o.v)}>
          {o.l}{o.n != null && <i>{o.n}</i>}
        </button>
      ))}
    </div>
  );
}

/** Hoja inferior (listas largas, formularios cortos, confirmaciones). */
export function Sheet({ abierto, onClose, titulo, children, pie }) {
  useEffect(() => {
    if (!abierto) return;
    const h = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [abierto, onClose]);
  if (!abierto) return null;
  return createPortal(
    <div className="sheet-fondo" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="sheet-asa" />
        <div className="sheet-cab"><h3>{titulo}</h3><button className="icono" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button></div>
        <div className="sheet-cuerpo">{children}</div>
        {pie && <div className="sheet-pie">{pie}</div>}
      </div>
    </div>, document.body);
}

/** Pasos con barra de progreso (formularios de más de ~7 campos). */
export function Pasos({ titulos, paso }) {
  return (
    <div className="pasos" aria-label={`Paso ${paso + 1} de ${titulos.length}`}>
      <div className="pasos-barra"><div style={{ width: `${((paso + 1) / titulos.length) * 100}%` }} /></div>
      <div className="pasos-t"><b>{titulos[paso]}</b><span>{paso + 1}/{titulos.length}</span></div>
    </div>
  );
}
/** Botón(es) principal(es) fijos abajo, sobre la barra de tabs. */
export const BarraAccion = ({ children }) => <div className="barra-accion">{children}</div>;
export const Fab = ({ onClick, label = "Nuevo", icon = "plus" }) => (
  <button className="fab" onClick={onClick} aria-label={label}><Icon name={icon} size={24} /><span>{label}</span></button>
);
export const Cargando = () => <div className="esqueleto"><i /><i /><i /></div>;
export const Resumen = ({ filas }) => (
  <div className="resumen">{filas.filter(Boolean).map(([k, v, fuerte], i) => <div key={i} className={fuerte ? "fuerte" : ""}><span>{k}</span><b>{v}</b></div>)}</div>
);

// ───────── Avisos (toast)
let avisos = [], subs = new Set(), nAviso = 0;
const emitir = () => subs.forEach((f) => f());
export function aviso(texto, tono = "ok") {
  const id = ++nAviso; avisos = [...avisos, { id, texto, tono }]; emitir();
  setTimeout(() => { avisos = avisos.filter((a) => a.id !== id); emitir(); }, 3200);
}
export function Avisos() {
  const a = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => avisos);
  return <div className="avisos" aria-live="polite">{a.map((x) => <div key={x.id} className={`aviso aviso-${x.tono}`}>{x.texto}</div>)}</div>;
}

/** Confirmación: <Confirmar abierto titulo texto onSi onNo /> */
export function Confirmar({ abierto, titulo, texto, confirmar = "Confirmar", peligro, onSi, onNo }) {
  return (
    <Sheet abierto={abierto} onClose={onNo} titulo={titulo} pie={<div className="dos"><Button variante="sec" block onClick={onNo}>Cancelar</Button><Button variante={peligro ? "danger" : "primary"} block onClick={onSi}>{confirmar}</Button></div>}>
      <p className="txt">{texto}</p>
    </Sheet>
  );
}
export function useDebounced(v, ms = 200) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}
