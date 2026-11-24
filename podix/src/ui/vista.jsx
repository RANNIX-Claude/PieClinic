// Vista dual (estándar IRP): cada lista se puede ver en MOSAICO (tarjetas con foto) o en RENGLONES (tabla ordenable).
// La elección se recuerda por lista (id). En pantalla angosta (teléfono) los renglones se muestran como tarjetas compactas.
import { useState, useMemo } from "react";
import { Icon, Vacio } from "./index.jsx";

const KEY = "podologia.vista.";
const leer = (id, def) => { try { return localStorage.getItem(KEY + id) || def; } catch { return def; } };
const guardar = (id, v) => { try { localStorage.setItem(KEY + id, v); } catch { /* sin almacenamiento */ } };

/** Botones Mosaico | Renglones. */
export function AlternarVista({ valor, onChange }) {
  const b = (v, icon, l) => (
    <button type="button" className={`vista-b${valor === v ? " on" : ""}`} onClick={() => onChange(v)} aria-pressed={valor === v}>
      <Icon name={icon} size={16} /><span>{l}</span>
    </button>
  );
  return <div className="vista-alt" role="group" aria-label="Tipo de vista">{b("mosaico", "grid", "Mosaico")}{b("renglones", "list", "Renglones")}</div>;
}

/**
 * <Vista id="rh-empleados" items={[...]} tarjeta={(it)=><...>} columnas={[{k:"nombre", t:"Nombre", v:(it)=>it.nombre, der?:true, orden?:(it)=>valorOrdenable}]}
 *        onAbrir={(it)=>...} vacio="Sin resultados" inicial="mosaico" />
 * - tarjeta: contenido de cada tarjeta del mosaico (el contenedor ya es clicable si hay onAbrir).
 * - columnas: v devuelve texto o JSX; orden devuelve un valor comparable (por omisión v si es texto/número).
 */
export default function Vista({ id, items, tarjeta, columnas, onAbrir, vacio = "Sin resultados.", inicial = "mosaico", minTarjeta = 230 }) {
  const [modo, setModo] = useState(() => leer(id, inicial));
  const [ord, setOrd] = useState({ k: null, desc: false });
  const cambiar = (v) => { setModo(v); guardar(id, v); };
  const filas = useMemo(() => {
    if (!ord.k) return items;
    const c = columnas.find((x) => x.k === ord.k);
    if (!c) return items;
    const val = (it) => (c.orden ? c.orden(it) : c.v(it));
    const r = [...items].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === "number" && typeof y === "number") return x - y;
      return String(x ?? "").localeCompare(String(y ?? ""), "es");
    });
    return ord.desc ? r.reverse() : r;
  }, [items, ord, columnas]);

  return (
    <div className="vista">
      <div className="vista-cab"><span className="mu peq">{items.length} {items.length === 1 ? "registro" : "registros"}</span><AlternarVista valor={modo} onChange={cambiar} /></div>
      {!items.length ? <Vacio icon="search">{vacio}</Vacio> : modo === "mosaico" ? (
        <div className="vista-mosaico" style={{ "--min": `${minTarjeta}px` }}>
          {filas.map((it, i) => (
            <div key={it.id ?? i} className={`vista-tarjeta${onAbrir ? " tap" : ""}`} onClick={onAbrir ? () => onAbrir(it) : undefined} role={onAbrir ? "button" : undefined} tabIndex={onAbrir ? 0 : undefined}
              onKeyDown={onAbrir ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir(it)) : undefined}>
              {tarjeta(it)}
            </div>
          ))}
        </div>
      ) : (
        <div className="vista-tabla-w">
          <table className="vista-tabla">
            <thead><tr>{columnas.map((c) => (
              <th key={c.k} className={c.der ? "der" : ""} onClick={() => setOrd((o) => ({ k: c.k, desc: o.k === c.k ? !o.desc : false }))} aria-sort={ord.k === c.k ? (ord.desc ? "descending" : "ascending") : "none"}>
                {c.t}{ord.k === c.k ? (ord.desc ? " ▾" : " ▴") : ""}
              </th>))}</tr></thead>
            <tbody>
              {filas.map((it, i) => (
                <tr key={it.id ?? i} className={onAbrir ? "tap" : ""} onClick={onAbrir ? () => onAbrir(it) : undefined}>
                  {columnas.map((c) => <td key={c.k} className={c.der ? "der" : ""} data-l={c.t}>{c.v(it)}</td>)}
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Avatar con foto (dataURL pequeña) o iniciales. */
export function Foto({ nombre, src, size = 56, tono }) {
  const ini = String(nombre || "?").split(/\s+/).filter((x) => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(x)).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
  const st = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  return src
    ? <img className="foto" src={src} alt={nombre} style={{ width: size, height: size }} />
    : <span className={`avatar${tono ? ` avatar-${tono}` : ""}`} style={st}>{ini}</span>;
}

/** Reduce una imagen elegida por el usuario a una miniatura JPEG (dataURL) para guardarla en el navegador. */
export function reducirImagen(file, lado = 240, calidad = 0.78) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("No se pudo leer la imagen."));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error("Archivo de imagen no válido."));
      im.onload = () => {
        const k = Math.min(1, lado / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", calidad));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
