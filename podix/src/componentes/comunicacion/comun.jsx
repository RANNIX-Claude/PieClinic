// Piezas compartidas por Mensajes, Correo y Feed: selector de personas/grupos, adjunto de imagen, ejecución segura de acciones.
import "../../estilos_comunicacion.css";
import { useRef, useState } from "react";
import { mutar } from "../../store/core.js";
import { aviso, Avatar, Buscador, Button, Icon, Select, Sheet } from "../../ui/index.jsx";
import { reducirImagen } from "../../ui/vista.jsx";
import { nombreCorto, ROL_ETIQUETA, sucursalDePersona, etiquetaToken } from "../../store/acciones_comunicacion.js";
import { normaliza } from "../../lib/format.js";

/** Ejecuta una acción sobre el estado; si la acción rechaza (permiso, validación) muestra el motivo. Devuelve {ok, r}. */
export function hacer(fn, ok) {
  try {
    const r = mutar(fn);
    if (ok) aviso(ok, "ok");
    return { ok: true, r };
  } catch (e) {
    aviso(e?.message || "No se pudo completar la acción.", "warn");
    return { ok: false, r: null };
  }
}

/** ¿Pantalla ancha (≥ 1024 px)? */
export function useAncha() {
  const [on] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(min-width: 1024px)").matches);
  return on;
}

/** Botón para adjuntar una imagen pequeña (se reduce antes de guardarla). valor = dataURL | null. */
export function AdjuntoImagen({ valor, onChange, lado = 480, etiqueta = "Adjuntar imagen", soloIcono }) {
  const ref = useRef(null);
  const [cargando, setCargando] = useState(false);
  const elegir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { aviso("Elige un archivo de imagen.", "warn"); return; }
    setCargando(true);
    try { onChange(await reducirImagen(f, lado, 0.72)); } catch (err) { aviso(err.message, "warn"); } finally { setCargando(false); }
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*" className="com-solo" tabIndex={-1} onChange={elegir} aria-hidden="true" />
      {valor && !soloIcono ? (
        <div className="com-img-p"><img src={valor} alt="Imagen adjunta" /><Button variante="ghost" icon="trash" type="button" onClick={() => onChange(null)}>Quitar</Button></div>
      ) : soloIcono ? (
        <button type="button" className="icono" onClick={() => ref.current?.click()} aria-label={etiqueta} disabled={cargando}><Icon name="image" /></button>
      ) : (
        <Button variante="sec" icon="image" type="button" loading={cargando} onClick={() => ref.current?.click()}>{etiqueta}</Button>
      )}
    </>
  );
}

/** Lista de personas elegibles (con buscador y filtros por sucursal y rol). valor = ids; grupos = [{token, etiqueta}] opcionales. */
export function SelectorPersonas({ d, yo, valor, onChange, multi = true, grupos = [], excluirYo = true, limitar }) {
  const [q, setQ] = useState("");
  const [suc, setSuc] = useState("");
  const [rol, setRol] = useState("");
  const nq = normaliza(q);
  const gente = d.usuarios
    .filter((u) => u.activo !== false && (!excluirYo || u.id !== yo.id) && (!limitar || limitar.includes(u.id)))
    .filter((u) => !suc || u.sucursales.includes(suc))
    .filter((u) => !rol || u.rol === rol)
    .filter((u) => !nq || normaliza(`${u.nombre} ${ROL_ETIQUETA[u.rol]}`).includes(nq))
    .sort((a, b) => nombreCorto(a).localeCompare(nombreCorto(b), "es"));
  const poner = (id) => {
    if (!multi) return onChange([id]);
    onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  };
  return (
    <div className="com-pers">
      {grupos.length > 0 && (
        <>
          <div className="mu peq fuerte">Grupos</div>
          <div className="chips">{grupos.map((g) => (
            <button key={g.token} type="button" className={`chip${valor.includes(g.token) ? " on" : ""}`} onClick={() => poner(g.token)}>{g.etiqueta}</button>
          ))}</div>
        </>
      )}
      <Buscador valor={q} onChange={setQ} placeholder="Buscar persona…" />
      <div className="dos">
        <Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Filtrar por sucursal"><option value="">Todas las sucursales</option>{d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select>
        <Select value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Filtrar por rol"><option value="">Todos los roles</option>{Object.entries(ROL_ETIQUETA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </div>
      <div className="com-pers-lista">
        {gente.map((u) => (
          <button key={u.id} type="button" className={`com-pers-f${valor.includes(u.id) ? " on" : ""}`} onClick={() => poner(u.id)} aria-pressed={valor.includes(u.id)}>
            <Avatar nombre={u.nombre} />
            <span className="fila-c"><div className="nm">{nombreCorto(u)}</div><div className="rl">{ROL_ETIQUETA[u.rol]} · {sucursalDePersona(d, u)}</div></span>
            {valor.includes(u.id) && <Icon name="check" size={18} />}
          </button>
        ))}
        {!gente.length && <p className="mu peq">Nadie coincide con el filtro.</p>}
      </div>
    </div>
  );
}

/** Campo «Para / CC»: muestra lo elegido como etiquetas y abre el selector en una hoja. */
export function CampoPersonas({ d, yo, label, valor, onChange, grupos = [], multi = true, vacio = "Elegir…" }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="com-sel-c">
        {valor.map((t) => (
          <span key={t} className={`com-pill${String(t).startsWith("g:") ? " g" : ""}`}>{etiquetaToken(d, t)}<button type="button" aria-label={`Quitar ${etiquetaToken(d, t)}`} onClick={() => onChange(valor.filter((x) => x !== t))}><Icon name="x" size={14} /></button></span>
        ))}
        <button type="button" className="com-add" onClick={() => setAbierto(true)}><Icon name="plus" size={14} />{valor.length ? "Agregar" : vacio}</button>
      </div>
      <Sheet abierto={abierto} onClose={() => setAbierto(false)} titulo={label} pie={<Button block onClick={() => setAbierto(false)}>Listo{valor.length ? ` (${valor.length})` : ""}</Button>}>
        <SelectorPersonas d={d} yo={yo} valor={valor} onChange={onChange} multi={multi} grupos={grupos} />
      </Sheet>
    </div>
  );
}
