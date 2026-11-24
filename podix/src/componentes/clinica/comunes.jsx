// Piezas compartidas por las pantallas del dominio «clínica»: QR en SVG propio, semáforo de plazos, barra de avance,
// selector de paciente acotado (el podólogo solo ve a sus pacientes), selector de sucursal y aviso de acceso.
import { useMemo, useState } from "react";
import { qrMatriz } from "../../store/reglas_clinica.js";
import { normaliza } from "../../lib/format.js";
import { Avatar, Badge, Buscador, Fila, Field, Select, Sheet, Vacio, useDebounced } from "../../ui/index.jsx";
import "../../estilos_clinica.css";

/** Código QR dibujado en SVG (sin dependencias). */
export function QrSvg({ texto, size = 120, titulo }) {
  const m = useMemo(() => { try { return qrMatriz(texto); } catch { return null; } }, [texto]);
  if (!m) return <span className="mu peq">Texto demasiado largo para el QR</span>;
  const n = m.length, q = 4, t = n + q * 2;
  let path = "";
  m.forEach((fila, y) => fila.forEach((v, x) => { if (v) path += `M${x + q} ${y + q}h1v1h-1z`; }));
  return (
    <svg className="cl-qr" width={size} height={size} viewBox={`0 0 ${t} ${t}`} role="img" aria-label={titulo || `Código QR: ${texto}`} shapeRendering="crispEdges">
      <rect width={t} height={t} fill="#fff" /><path d={path} fill="#000" />
    </svg>
  );
}

/** Insignia de semáforo a partir del resultado de semaforo(). */
export const Semaforo = ({ s }) => (
  <span className={`cl-sem cl-sem-${s.color}`}><i aria-hidden="true" />{s.texto}</span>
);

export const Barra = ({ pct, tono = "ok" }) => (
  <div className="cl-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={`cl-barra-${tono}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
);

export const SinAcceso = ({ children = "Tu perfil no tiene acceso a este módulo." }) => <Vacio icon="lock">{children}</Vacio>;

/** Selector de sucursal para quien ve varias (admin/dirección y gerentes multi-sucursal). valor "" = todas. */
export function FiltroSucursal({ d, ids, valor, onChange }) {
  if (!ids || ids.length < 2) return null;
  return (
    <Field label="Sucursal">
      <Select value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todas ({ids.length})</option>
        {ids.map((id) => <option key={id} value={id}>{(d.sucursales.find((s) => s.id === id) || {}).nombre || id}</option>)}
      </Select>
    </Field>
  );
}

/** Hoja para elegir paciente de una lista dada (ids). Sin ids: todos los pacientes. */
export function ElegirPaciente({ d, ids, abierto, onClose, onElegir, titulo = "Elegir paciente" }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const lista = useMemo(() => {
    const base = ids ? d.pacientes.filter((p) => ids.has ? ids.has(p.id) : ids.includes(p.id)) : d.pacientes;
    const n = normaliza(dq).trim();
    return (n ? base.filter((p) => normaliza(`${p.nombres} ${p.apellidos} ${p.folio} ${p.telefono}`).includes(n)) : base).slice(0, 40);
  }, [d.pacientes, ids, dq]);
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={titulo}>
      <Buscador valor={q} onChange={setQ} placeholder="Nombre, teléfono o folio EXP-…" />
      <div className="lista">
        {lista.map((p) => (
          <Fila key={p.id} izquierda={<Avatar nombre={`${p.nombres} ${p.apellidos}`} />} titulo={`${p.nombres} ${p.apellidos}`} sub={`${p.folio} · ${p.telefono}`}
            badge={p.alertas && p.alertas[0] ? <Badge tono="warn">{p.alertas[0]}</Badge> : null} onClick={() => { onElegir(p); onClose(); setQ(""); }} />
        ))}
        {!lista.length && <Vacio>{ids ? "Sin coincidencias entre tus pacientes." : "Sin coincidencias."}</Vacio>}
      </div>
    </Sheet>
  );
}

/** Campo que muestra el paciente elegido y abre el selector. */
export function CampoPaciente({ d, ids, valor, onChange, label = "Paciente", error, opcional }) {
  const [abierto, setAbierto] = useState(false);
  const p = valor ? d.pacientes.find((x) => x.id === valor) : null;
  return (
    <Field label={label} error={error}>
      <button type="button" className="inp cl-campo-pac" onClick={() => setAbierto(true)}>
        {p ? `${p.nombres} ${p.apellidos} · ${p.folio}` : opcional ? "Sin paciente (opcional)" : "Elegir paciente…"}
      </button>
      {opcional && p && <button type="button" className="cl-link peq" onClick={() => onChange("")}>Quitar paciente</button>}
      <ElegirPaciente d={d} ids={ids} abierto={abierto} onClose={() => setAbierto(false)} onElegir={(x) => onChange(x.id)} />
    </Field>
  );
}

/** Mensaje de resultado de una acción: { ok, error } → aviso. Devuelve true si salió bien. */
export function resultado(r, aviso, okTexto) {
  if (!r || !r.ok) { aviso((r && r.error) || "No se pudo completar.", "bad"); return false; }
  if (okTexto) aviso(okTexto, "ok");
  return true;
}
