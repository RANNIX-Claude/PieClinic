// Tablas del estado de resultados con el formato del IRP: bandas oscuras, utilidad bruta resaltada, filas expandibles, totales en verde claro.
import { monto, pct, variacion } from "./util.js";

const Flecha = ({ on }) => <span className={`edr-flecha${on ? " on" : ""}`} aria-hidden="true">›</span>;
const neg = (n) => (n < 0 ? " fin-neg" : "");

/** Una sucursal (o la cadena): columnas Importe, % sobre ingresos y variación contra el mes anterior. */
export function TablaEdr({ edr, anterior, abiertos, alternar }) {
  const ant = anterior || null;
  const A = {};
  if (ant) ant.bandas.forEach((b) => { if (b.resultado) A[b.id] = b.monto; else { b.filas.forEach((f) => { A[f.id] = f.monto; (f.detalle || []).forEach((x) => { A[`${f.id}/${x.id}`] = x.monto; }); }); A[b.total.id] = b.total.monto; } });
  const celdas = (m, p, clave) => {
    const a = ant && A[clave] != null ? A[clave] : null;
    const dif = a != null ? m - a : null;
    return (<>
      <td className={neg(m)}>{monto(m)}{dif != null && <small className="edr-antm">{variacion(dif)} vs. mes ant.</small>}</td>
      <td>{pct(p)}</td>
      <td className="edr-ant">{a != null ? <>{monto(a)}<small>{variacion(dif)}</small></> : "—"}</td>
    </>);
  };
  const cols = 4;
  return (
    <div className="edr-w" role="region" aria-label={`Estado de resultados ${edr.nombre}`} tabIndex={0}>
      <table className="edr">
        <thead><tr><th className="c1">Concepto</th><th>Importe</th><th>% ingresos</th><th className="edr-ant">Mes anterior</th></tr></thead>
        <tbody>
          {edr.bandas.map((b) => b.resultado ? (
            <tr key={b.id} className={`edr-banda ${b.tono}`}><td className="c1">{b.titulo}</td>{celdas(b.monto, b.pct, b.id)}</tr>
          ) : [
            <tr key={b.id} className="edr-banda"><td className="c1" colSpan={cols}>{b.titulo}</td></tr>,
            ...b.filas.flatMap((f) => {
              const abre = !!f.detalle; const on = abre && abiertos.has(f.id);
              return [
                <tr key={f.id} className={`edr-fila${abre ? " abre" : ""}`} onClick={abre ? () => alternar(f.id) : undefined}>
                  <td className="c1">{abre ? <button type="button" aria-expanded={on} onClick={(e) => { e.stopPropagation(); alternar(f.id); }}><Flecha on={on} />{f.etiqueta}</button> : <span style={{ paddingLeft: 20, display: "inline-block" }}>{f.etiqueta}</span>}</td>
                  {celdas(f.monto, f.pct, f.id)}
                </tr>,
                ...(on ? f.detalle.map((x) => <tr key={`${f.id}/${x.id}`} className="edr-det"><td className="c1">{x.etiqueta}</td>{celdas(x.monto, x.pct, `${f.id}/${x.id}`)}</tr>) : []),
              ];
            }),
            <tr key={b.total.id} className="edr-total"><td className="c1">{b.total.etiqueta}</td>{celdas(b.total.monto, b.total.pct, b.total.id)}</tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}

/** Comparativo: una columna por sucursal + Cadena. Cada celda: importe y % sobre ingresos de esa columna. */
export function TablaComparativo({ comp, abiertos, alternar }) {
  const cols = comp.columnas;
  const celdas = (montos, pcts) => cols.map((c) => <td key={c.id} className={`${c.id === "CAD" ? "cad" : ""}${neg(montos[c.id])}`}>{monto(montos[c.id])}<small>{pct(pcts[c.id])}</small></td>);
  return (
    <div className="edr-w" role="region" aria-label="Comparativo por sucursal" tabIndex={0}>
      <table className="edr edr-cmp">
        <thead><tr><th className="c1">Concepto</th>{cols.map((c) => <th key={c.id} className={c.id === "CAD" ? "cad" : ""}>{c.nombre}</th>)}</tr></thead>
        <tbody>
          {comp.bandas.map((b) => b.resultado ? (
            <tr key={b.id} className={`edr-banda ${b.tono}`}><td className="c1">{b.titulo}</td>{celdas(b.montos, b.pcts)}</tr>
          ) : [
            <tr key={b.id} className="edr-banda"><td className="c1" colSpan={cols.length + 1}>{b.titulo}</td></tr>,
            ...b.filas.flatMap((f) => {
              const abre = !!f.detalle; const on = abre && abiertos.has(f.id);
              return [
                <tr key={f.id} className={`edr-fila${abre ? " abre" : ""}`} onClick={abre ? () => alternar(f.id) : undefined}>
                  <td className="c1">{abre ? <button type="button" aria-expanded={on} onClick={(e) => { e.stopPropagation(); alternar(f.id); }}><Flecha on={on} />{f.etiqueta}</button> : <span style={{ paddingLeft: 20, display: "inline-block" }}>{f.etiqueta}</span>}</td>
                  {celdas(f.montos, f.pcts)}
                </tr>,
                ...(on ? f.detalle.map((x) => <tr key={`${f.id}/${x.id}`} className="edr-det"><td className="c1">{x.etiqueta}</td>{celdas(x.montos, x.pcts)}</tr>) : []),
              ];
            }),
            <tr key={b.total.id} className="edr-total"><td className="c1">{b.total.etiqueta}</td>{celdas(b.total.montos, b.total.pcts)}</tr>,
          ])}
        </tbody>
      </table>
    </div>
  );
}
