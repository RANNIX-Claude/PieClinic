// Piezas compartidas del dominio «ventas»: aviso de simulación, PIN de gerente, selector de sucursal, hoja imprimible.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Chips, Field, Icon, Input, Sheet } from "../../ui/index.jsx";
import { nombreSucursal } from "../../store/reglas.js";

/** Rótulo obligatorio de lo simulado (AMPLIACION_V2: honestidad en la interfaz). */
export function AvisoSim({ titulo = "Simulación de demostración", children }) {
  return <div className="v-sim"><Icon name="alert" size={18} /><div><b>{titulo}</b><span>{children}</span></div></div>;
}

/** Selector de sucursal: central elige cualquiera (o todas); el resto ve sus sucursales. */
export function SelectorSucursal({ d, sucursales, valor, onChange, todas = true }) {
  const ops = [...(todas ? [{ v: "", l: "Todas" }] : []), ...sucursales.map((s) => ({ v: s.id, l: (s.nombre || nombreSucursal(d, s.id)).replace(/^Sucursal /, "") }))];
  if (ops.length <= 1) return null;
  return <Chips scroll opciones={ops} valor={valor} onChange={onChange} />;
}

/** Hoja inferior para pedir el PIN de gerente (portado de PinModal de Pie Firme). onConfirmar(pin). */
export function PinModal({ abierto, titulo = "Autorización de gerente", texto, onCerrar, onConfirmar, error }) {
  const [pin, setPin] = useState("");
  const cerrar = () => { setPin(""); onCerrar(); };
  return (
    <Sheet abierto={abierto} onClose={cerrar} titulo={titulo}
      pie={<div className="dos"><Button variante="sec" block onClick={cerrar}>Cancelar</Button><Button block icon="lock" disabled={pin.length < 4} onClick={() => { onConfirmar(pin); setPin(""); }}>Autorizar</Button></div>}>
      {texto && <p className="txt" style={{ marginBottom: 10 }}>{texto}</p>}
      <Field label="PIN de 4 dígitos" error={error} hint="El gerente de la sucursal (o Administración) escribe su PIN en este dispositivo.">
        <Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <p className="peq mu">Demostración: el PIN se valida en el navegador. En producción se valida en el servidor.</p>
    </Sheet>
  );
}

/** Imprime un nodo: lo monta en un contenedor propio y oculta el resto con @media print (estilos_ventas.css). */
export function Imprimible({ abierto, children }) {
  if (!abierto) return null;
  return createPortal(<div className="v-print-root">{children}</div>, document.body);
}
export function imprimir() {
  document.body.classList.add("v-imprimiendo");
  const fin = () => { document.body.classList.remove("v-imprimiendo"); removeEventListener("afterprint", fin); };
  addEventListener("afterprint", fin);
  setTimeout(() => { window.print(); setTimeout(fin, 500); }, 50);
}

export const tonoDe = (mapa, k) => (mapa[k] ? mapa[k][1] : "neutral");
export const etiquetaDe = (mapa, k) => (mapa[k] ? mapa[k][0] : k);
export const BadgeEstado = ({ mapa, k }) => <Badge tono={tonoDe(mapa, k)}>{etiquetaDe(mapa, k)}</Badge>;

/** Barra de pestañas internas (chips) con contador opcional. */
export function Pestanas({ opciones, valor, onChange }) {
  return <Chips scroll opciones={opciones} valor={valor} onChange={onChange} />;
}

/** Estrellas de 1 a 5 (evaluación de proveedor). */
export function Estrellas({ valor, onChange }) {
  return (
    <div className="v-estrellas" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} className={n <= (valor || 0) ? "on" : ""} onClick={onChange ? () => onChange(n) : undefined} disabled={!onChange} aria-label={`${n} de 5`}>
          <Icon name="star" size={20} />
        </button>
      ))}
    </div>
  );
}
