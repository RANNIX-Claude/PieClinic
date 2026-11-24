// Piezas compartidas por las pantallas de Administración central y Dirección.
import { Select, Field } from "../../ui/index.jsx";

/** Barra proporcional (valor / max). */
export function Barra({ valor, max, tono = "var(--p)" }) {
  const w = max > 0 ? Math.max(2, Math.min(100, (valor / max) * 100)) : 0;
  return <div style={{ height: 8, background: "var(--bd)", borderRadius: 4, overflow: "hidden", flex: 1, minWidth: 0 }}><div style={{ width: `${w}%`, height: "100%", background: tono, borderRadius: 4 }} /></div>;
}
/** Descarga un CSV (UTF-8 con BOM) con Blob. */
export function descargarCSV(nombre, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SelectorSucursal({ d, valor, onChange, label = "Sucursal", todas }) {
  return (
    <Field label={label}>
      <Select value={valor} onChange={(e) => onChange(e.target.value)}>
        {todas && <option value="">Todas las sucursales</option>}
        {d.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </Select>
    </Field>
  );
}
export const Nota = ({ children }) => <p className="mu peq" style={{ margin: 0 }}>{children}</p>;
