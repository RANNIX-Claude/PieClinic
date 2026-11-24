// Piezas compartidas de las pantallas del cajero.
import { useIr } from "../../shell/sesion.js";
import { Button, Card, Icon } from "../../ui/index.jsx";

/** Stepper de cantidad con áreas táctiles de 44 px. */
export function Cant({ valor, onChange, min = 0, max = 999 }) {
  const b = { minWidth: 44, minHeight: 44, padding: 0 };
  return (
    <div className="fila-flex" style={{ gap: 4 }}>
      <Button variante="ghost" style={b} aria-label="Menos" onClick={() => onChange(Math.max(min, valor - 1))}>−</Button>
      <b style={{ minWidth: 28, textAlign: "center" }}>{valor}</b>
      <Button variante="ghost" style={b} aria-label="Más" onClick={() => onChange(Math.min(max, valor + 1))}>+</Button>
    </div>
  );
}
/** Aviso cuando el cajero no tiene turno abierto. */
export function SinTurno({ texto = "Para cobrar necesitas un turno abierto." }) {
  const ir = useIr();
  return (
    <Card tono="warn">
      <div className="form">
        <div className="fila-flex"><Icon name="lock" /><b>Sin turno abierto</b></div>
        <p className="txt">{texto}</p>
        <Button block icon="cash" onClick={() => ir("caja")}>Ir a Caja y abrir turno</Button>
      </div>
    </Card>
  );
}
