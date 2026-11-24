// Piezas compartidas por las pantallas de desempeño: selector de periodo, insignias de estado, progreso, descarga de CSV.
import "../../estilos_desempeno.css";
import { Badge, Button, Chips, Icon } from "../../ui/index.jsx";
import { sumarMeses, periodoDe, mesActual } from "../../store/desempeno_motor.js";
import * as R from "../../store/reglas.js";
import { dinero, fechaCorta, hora } from "../../lib/format.js";

export const ESTADO_BONO = { calculado: ["Calculado", "neutral"], aprobado: ["Aprobado", "info"], pagado: ["Pagado", "ok"] };
export const EstadoBono = ({ estado }) => { const [l, t] = ESTADO_BONO[estado] || ["—", "neutral"]; return <Badge tono={t}>{l}</Badge>; };

export function Progreso({ pct, tono }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return <div className={`dsp-prog${tono ? ` ${tono}` : ""}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin="0" aria-valuemax="100"><div style={{ width: `${p}%` }} /></div>;
}

/** Selector de periodo: mensual o trimestral y flechas para recorrer. onChange({per, mes}). */
export function SelectorPeriodo({ per, mes, onChange, soloMensual = false }) {
  const paso = per === "trimestral" ? 3 : 1;
  const p = periodoDe(per, mes);
  const act = periodoDe(per, mesActual());
  return (
    <div className="dsp-sel">
      {!soloMensual && <Chips opciones={[{ v: "mensual", l: "Mensual" }, { v: "trimestral", l: "Trimestral" }]} valor={per} onChange={(v) => onChange({ per: v, mes })} />}
      <div className="dsp-nav">
        <button className="icono" aria-label="Periodo anterior" onClick={() => onChange({ per, mes: sumarMeses(mes, -paso) })}><Icon name="back" /></button>
        <div><b>{p.etiqueta}</b>{p.clave === act.clave && <small>en curso</small>}</div>
        <button className="icono" aria-label="Periodo siguiente" disabled={p.clave >= act.clave} onClick={() => onChange({ per, mes: sumarMeses(mes, paso) })}><Icon name="chevron" /></button>
      </div>
    </div>
  );
}

/** Descarga un CSV (BOM UTF-8) hecho con aCSV(). */
export function descargar(nombre, csv) {
  try {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* sin descarga disponible */ }
}
export const BotonCSV = ({ onClick, children = "Exportar CSV" }) => <Button variante="sec" icon="download" onClick={onClick}>{children}</Button>;

export const dif = (n) => (n > 0 ? `+${n} %` : `${n} %`);
export const tonoDif = (n) => (n >= 5 ? "ok" : n <= -5 ? "bad" : "neutral");

/** Tabla compacta de ventas atribuidas (folio, fecha, sucursal de la venta, importe). */
export function ListaVentas({ d, ventas }) {
  if (!ventas.length) return null;
  const mostrar = ventas.slice(0, 60);
  return (
    <div className="dsp-tabla-ventas" aria-label="Ventas atribuidas">
      <div className="enc"><span>Folio</span><span>Fecha</span><span>Sucursal</span><span>Importe</span></div>
      {mostrar.map((v) => <div key={v.id}><span>{v.folio}</span><span>{fechaCorta(v.fecha)} {hora(v.fecha)}</span><span>{R.nombreSucursal(d, v.sucursalId)}</span><b>{dinero(v.importe)}</b></div>)}
      {ventas.length > mostrar.length && <div><span className="peq mu">+{ventas.length - mostrar.length} venta(s) más</span></div>}
    </div>
  );
}
/** Condiciones del esquema (asistencia, calificación) con su resultado. */
export function Condiciones({ cond }) {
  if (!cond || !cond.detalle.length) return <div className="peq mu">Este esquema no tiene condiciones adicionales.</div>;
  return <div className="dsp-cond">{cond.detalle.map((c) => <div key={c.k}><span className={c.ok ? "si" : "no"}>{c.ok ? "✔" : "✖"}</span><span>{c.texto}</span></div>)}</div>;
}

