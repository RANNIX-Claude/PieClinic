// Pago mixto (efectivo + tarjeta + transferencia) con validación de suma y cálculo de cambio.
import { useEffect, useState } from "react";
import { Button, Field, Input, Resumen, Sheet } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import { FORMAS, FORMA_LABEL, validarPagos } from "../../store/acciones_cajero.js";

export const PAGO_VACIO = { efectivo: "", tarjeta: "", transferencia: "" };

export function CamposPago({ total, valor, onChange }) {
  const v = validarPagos(valor, total);
  const set = (k, x) => onChange({ ...valor, [k]: x });
  const todo = (k) => onChange({ ...PAGO_VACIO, [k]: String(total) });
  return (
    <div className="form">
      <div className="chips">{FORMAS.map((f) => <button key={f} className="chip" onClick={() => todo(f)}>Todo {FORMA_LABEL[f].toLowerCase()}</button>)}</div>
      {FORMAS.map((f) => (
        <Field key={f} label={FORMA_LABEL[f]}>
          <Input type="text" inputMode="decimal" placeholder="0.00" value={valor[f]} onChange={(e) => set(f, e.target.value)} />
        </Field>
      ))}
      <Resumen filas={[["Total a cobrar", dinero(total)], ["Recibido", dinero(v.suma)], v.ok && v.cambio > 0 ? ["Cambio", dinero(v.cambio), true] : !v.ok && v.suma > 0 ? ["Falta", dinero(v.falta), true] : null]} />
      {!v.ok && v.suma > 0 && v.error && <small style={{ color: "var(--er)" }}>{v.error}</small>}
    </div>
  );
}

/** Hoja de pago: onConfirmar(pagosNetos, cambio). */
export default function SheetPago({ abierto, onClose, total, titulo = "Cobrar", confirmar = "Cobrar", onConfirmar, cargando }) {
  const [val, setVal] = useState(PAGO_VACIO);
  useEffect(() => { if (abierto) setVal({ ...PAGO_VACIO, efectivo: String(total) }); }, [abierto, total]);
  const v = validarPagos(val, total);
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={titulo}
      pie={<Button block loading={cargando} disabled={!v.ok} onClick={() => onConfirmar(v.pagos, v.cambio)}>{confirmar} {dinero(total)}</Button>}>
      <CamposPago total={total} valor={val} onChange={setVal} />
    </Sheet>
  );
}
