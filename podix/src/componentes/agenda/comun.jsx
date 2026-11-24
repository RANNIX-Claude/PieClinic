// Piezas compartidas por las pantallas del dominio «agenda» (horarios, lista de espera, recordatorios, mi agenda).
import "../../estilos_agenda.css";
import { mutar } from "../../store/core.js";
import { aviso, Badge, Button, Icon, Select } from "../../ui/index.jsx";
import { fechaLarga, hoy, sumarDias } from "../../lib/format.js";
import { semanaDe, DIAS_CORTOS, diaSemana } from "../../store/reglas_agenda.js";
import { waEnlace, telEnlace } from "../../store/acciones_agenda.js";

/** Ejecuta una acción del dominio dentro de mutar(); muestra el error de validación o de permiso si lo hay. Devuelve el resultado. */
export function correr(fn, okTexto) {
  let r;
  try { r = mutar(fn); } catch (e) { r = { ok: false, error: e?.message || "No se pudo completar la acción." }; }
  if (r && r.ok === false) aviso(r.error || "No se pudo completar la acción.", "warn");
  else if (okTexto) aviso(typeof okTexto === "function" ? okTexto(r) : okTexto, "ok");
  return r || { ok: true };
}

export const ESTADO_CITA = { agendada: ["Agendada", "neutral"], por_confirmar: ["Por confirmar", "warn"], confirmada: ["Confirmada", "info"], en_sala: ["En sala", "info"], en_atencion: ["En atención", "ok"], atendida: ["Atendida", "ok"], no_asistio: ["No asistió", "bad"], cancelada: ["Cancelada", "neutral"] };
/** Insignia a partir de un mapa { clave: [texto, tono] }. */
export const Est = ({ mapa, k }) => { const x = mapa[k] || [k, "neutral"]; return <Badge tono={x[1]}>{x[0]}</Badge>; };

export const nomPac = (d, id) => { const p = d.pacientes.find((x) => x.id === id); return p ? `${p.nombres} ${p.apellidos}` : "—"; };
export const nomUsr = (d, id) => (d.usuarios.find((x) => x.id === id) || {}).nombre || "—";
export const nomSv = (d, id) => (d.servicios.find((x) => x.id === id) || {}).nombre || "—";
export const nomSuc = (d, id) => (d.sucursales.find((x) => x.id === id) || {}).nombre || "—";
export const pacDe = (d, id) => d.pacientes.find((x) => x.id === id) || null;

/** Selector de sucursal cuando el usuario ve más de una. */
export function SelSucursal({ sucursales, valor, onChange, todas = false }) {
  if (sucursales.length <= 1 && !todas) return sucursales[0] ? <div className="ag-suc"><Icon name="building" size={16} /> {sucursales[0].nombre}</div> : null;
  return (
    <Select value={valor || ""} onChange={(e) => onChange(e.target.value || null)} aria-label="Sucursal">
      {todas && <option value="">Todas las sucursales</option>}
      {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </Select>
  );
}

/** Navegación por día. */
export function NavDia({ fecha, onChange, paso = 1, etiqueta }) {
  return (
    <div className="ag-nav">
      <Button variante="ghost" icon="back" onClick={() => onChange(sumarDias(fecha, -paso))} aria-label="Anterior" />
      <div className="ag-nav-c"><b>{etiqueta || fechaLarga(fecha)}</b>{fecha === hoy() && <span className="peq mu">Hoy</span>}{fecha === sumarDias(hoy(), 1) && <span className="peq mu">Mañana</span>}</div>
      <Button variante="ghost" icon="chevron" onClick={() => onChange(sumarDias(fecha, paso))} aria-label="Siguiente" />
    </div>
  );
}
export const etiquetaSemana = (fecha) => { const s = semanaDe(fecha); return `Semana del ${fechaCortaAg(s[0])} al ${fechaCortaAg(s[6])}`; };
export const fechaCortaAg = (f) => `${DIAS_CORTOS[diaSemana(f)]} ${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;

/** Enlaces de contacto MANUAL: WhatsApp (wa.me con el texto listo) y llamada (tel:). Los abre la persona; el sistema no envía nada. */
export function Contacto({ telefono, texto, whatsapp = true, onUsar }) {
  if (!telefono) return <span className="peq mu">Sin teléfono</span>;
  return (
    <div className="ag-contacto">
      {whatsapp && <a className="btn btn-ghost ag-mini" href={waEnlace(telefono, texto)} target="_blank" rel="noreferrer" onClick={() => onUsar && onUsar("whatsapp")}><Icon name="message" size={16} />WhatsApp</a>}
      <a className="btn btn-ghost ag-mini" href={telEnlace(telefono)} onClick={() => onUsar && onUsar("llamada")}><Icon name="phone" size={16} />Llamar</a>
    </div>
  );
}

/** Rótulo obligatorio de lo simulado (AMPLIACION_V2: honestidad en la interfaz). */
export const Simulado = ({ children }) => <div className="ag-sim"><Icon name="alert" size={16} /><span><b>Simulación de demostración.</b> {children}</span></div>;

/** Aviso de regla de negocio con su id (P-0xx). */
export const Regla = ({ id, children }) => <div className="ag-regla"><span className="ag-regla-id">{id}</span><span>{children}</span></div>;

export const minATexto = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
