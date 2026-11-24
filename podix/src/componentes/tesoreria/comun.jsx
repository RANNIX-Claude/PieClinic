// Componentes del dominio «tesorería»: selector de sucursal, gráficas SVG propias (sin librerías) y avisos.
import { Badge, Icon, Select, Vacio } from "../../ui/index.jsx";
import { dinero } from "../../lib/format.js";
import { monto } from "../finanzas/util.js";
import { nombreMes } from "../../store/dominios/finanzas.js";

export { monto };
export const corto = (n) => {
  const a = Math.abs(Number(n) || 0), s = n < 0 ? "-" : "";
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)} M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)} k` : `${s}${dinero(a)}`;
};
export const pctTxt = (x, dec = 1) => (x == null ? "—" : `${Number(x).toFixed(dec)} %`);
export const mesCorto = (mes) => nombreMes(mes).slice(0, 3) + " " + mes.slice(2, 4);

/** Selector de sucursal: admin/dirección con opción «Todas (consolidado)»; gerente solo la suya. */
export function SelectorSucursal({ visibles, valor, onChange, consolidado = true, etiqueta = "Sucursal" }) {
  if (visibles.length <= 1 && !consolidado) return <Select value={visibles[0] ? visibles[0].id : ""} disabled aria-label={etiqueta}><option>{visibles[0] ? visibles[0].nombre : "—"}</option></Select>;
  return (
    <Select value={valor} onChange={(e) => onChange(e.target.value)} aria-label={etiqueta}>
      {consolidado && <option value="">Todas las sucursales (consolidado)</option>}
      {visibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </Select>
  );
}

export const SinPermiso = ({ children }) => <Vacio icon="lock">{children || "Esta pantalla es para la gerencia de la sucursal, Administración central y Dirección."}</Vacio>;
export const Simulado = ({ children }) => <div className="tes-sim"><Icon name="alert" size={18} /><div>{children}</div></div>;
export const Regla = ({ id, children }) => <p className="tes-regla">{children}{id ? <> <Badge>{id}</Badge></> : null}</p>;

/** Barras verticales agrupadas. datos: [{ etiqueta, valores:{k:n} }], series: [{ k, l, clase }]. */
export function GraficaBarras({ datos, series, alto = 180, formato = corto }) {
  if (!datos.length) return <Vacio icon="chart">Sin datos.</Vacio>;
  const max = Math.max(1, ...datos.flatMap((x) => series.map((s) => Math.abs(x.valores[s.k] || 0))));
  const W = 640, H = alto, pad = 26, base = H - pad, grupo = (W - 20) / datos.length, bw = Math.max(4, Math.min(28, (grupo - 10) / series.length));
  return (
    <figure className="tes-graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfica de barras">
        {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1="10" x2={W - 10} y1={base - (base - 12) * f} y2={base - (base - 12) * f} className="tes-rej" /><text x="12" y={base - (base - 12) * f - 3} className="tes-eje">{formato(max * f)}</text></g>)}
        <line x1="10" x2={W - 10} y1={base} y2={base} className="tes-base" />
        {datos.map((x, i) => {
          const x0 = 10 + i * grupo + (grupo - bw * series.length) / 2;
          return (
            <g key={x.etiqueta}>
              {series.map((s, j) => { const v = Math.max(0, x.valores[s.k] || 0); const h = ((base - 12) * v) / max; return <rect key={s.k} x={x0 + j * bw} y={base - h} width={bw - 2} height={h} rx="3" className={`tes-b ${s.clase || ""}`}><title>{`${x.etiqueta} · ${s.l}: ${monto(x.valores[s.k] || 0)}`}</title></rect>; })}
              <text x={10 + i * grupo + grupo / 2} y={H - 8} textAnchor="middle" className="tes-eje">{x.etiqueta}</text>
            </g>
          );
        })}
      </svg>
      <Leyenda series={series} />
    </figure>
  );
}
export const Leyenda = ({ series }) => <figcaption className="tes-ley">{series.map((s) => <span key={s.k}><i className={`tes-b ${s.clase || ""}`} />{s.l}</span>)}</figcaption>;

/** Líneas (una o más series) sobre días o meses. */
export function GraficaLineas({ datos, series, alto = 170, formato = corto, cadaEtiqueta = 5 }) {
  if (datos.length < 2) return <Vacio icon="chart">Sin suficientes datos para la serie.</Vacio>;
  const vals = datos.flatMap((x) => series.map((s) => x.valores[s.k] || 0));
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const W = 640, H = alto, pad = 24, top = 12, base = H - pad;
  const X = (i) => 14 + (i * (W - 28)) / (datos.length - 1);
  const Y = (v) => base - ((v - min) * (base - top)) / (max - min || 1);
  return (
    <figure className="tes-graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfica de líneas">
        {[0, 0.5, 1].map((f) => { const v = min + (max - min) * f; return <g key={f}><line x1="10" x2={W - 10} y1={Y(v)} y2={Y(v)} className="tes-rej" /><text x="12" y={Y(v) - 3} className="tes-eje">{formato(v)}</text></g>; })}
        {min < 0 && <line x1="10" x2={W - 10} y1={Y(0)} y2={Y(0)} className="tes-base" />}
        {series.map((s) => (
          <g key={s.k}>
            <polyline fill="none" className={`tes-l ${s.clase || ""}`} points={datos.map((x, i) => `${X(i)},${Y(x.valores[s.k] || 0)}`).join(" ")} />
            {datos.map((x, i) => <circle key={i} cx={X(i)} cy={Y(x.valores[s.k] || 0)} r="2.6" className={`tes-p ${s.clase || ""}`}><title>{`${x.etiqueta} · ${s.l}: ${monto(x.valores[s.k] || 0)}`}</title></circle>)}
          </g>
        ))}
        {datos.map((x, i) => (i % cadaEtiqueta === 0 || i === datos.length - 1) && <text key={i} x={X(i)} y={H - 7} textAnchor="middle" className="tes-eje">{x.etiqueta}</text>)}
      </svg>
      <Leyenda series={series} />
    </figure>
  );
}

const COLORES = ["c1", "c2", "c3", "c4", "c5", "c6"];
/** Dona de participación. items: [{ etiqueta, valor }]. */
export function Dona({ items, centro }) {
  const tot = items.reduce((a, x) => a + Math.max(0, x.valor), 0);
  if (!tot) return <Vacio icon="chart">Sin datos.</Vacio>;
  let ang = -Math.PI / 2;
  const R0 = 62, R1 = 40, C = 70;
  const arco = (a0, a1) => {
    const g = a1 - a0 >= Math.PI * 2 - 1e-6 ? a1 - 1e-4 : a1;
    const p = (r, a) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
    const large = g - a0 > Math.PI ? 1 : 0;
    return `M${p(R0, a0)} A${R0},${R0} 0 ${large} 1 ${p(R0, g)} L${p(R1, g)} A${R1},${R1} 0 ${large} 0 ${p(R1, a0)} Z`;
  };
  return (
    <div className="tes-dona">
      <svg viewBox="0 0 140 140" role="img" aria-label="Participación">
        {items.filter((x) => x.valor > 0).map((x, i) => { const a0 = ang; ang += (x.valor / tot) * Math.PI * 2; return <path key={x.etiqueta} d={arco(a0, ang)} className={`tes-b ${COLORES[i % COLORES.length]}`}><title>{`${x.etiqueta}: ${monto(x.valor)}`}</title></path>; })}
        {centro && <text x="70" y="75" textAnchor="middle" className="tes-dona-c">{centro}</text>}
      </svg>
      <ul>{items.filter((x) => x.valor > 0).map((x, i) => <li key={x.etiqueta}><i className={`tes-b ${COLORES[i % COLORES.length]}`} /><span>{x.etiqueta}</span><b>{monto(x.valor)}</b><em>{Math.round((x.valor / tot) * 100)} %</em></li>)}</ul>
    </div>
  );
}

/** Barras horizontales con valor y porcentaje. items: [{ id, etiqueta, valor, nota?, clase? }]. */
export function BarrasH({ items, total, formato = monto, meta = null }) {
  if (!items.length) return <Vacio icon="chart">Sin datos.</Vacio>;
  const max = Math.max(1, meta || 0, ...items.map((x) => Math.abs(x.valor)));
  return (
    <div className="tes-barras">
      {items.map((x) => (
        <div key={x.id} className="tes-barra">
          <div><span>{x.etiqueta}</span><b>{formato(x.valor)}{total ? <span className="mu peq"> · {Math.round((x.valor / total) * 100)} %</span> : null}{x.nota ? <span className="mu peq"> · {x.nota}</span> : null}</b></div>
          <div className="tes-pista">
            <i className={x.clase || ""} style={{ width: `${(Math.max(0, x.valor) / max) * 100}%` }} />
            {meta != null && <s style={{ left: `${(meta / max) * 100}%` }} title={`Meta ${formato(meta)}`} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Indicador con meta (p. ej. ocupación 80 %). */
export function Medidor({ valor, meta, etiqueta }) {
  const v = Math.max(0, Math.min(100, Number(valor) || 0));
  return (
    <div className={`tes-medidor ${v >= meta ? "ok" : "bajo"}`}>
      <div className="tes-medidor-t"><span>{etiqueta}</span><b>{pctTxt(v)}</b></div>
      <div className="tes-pista"><i style={{ width: `${v}%` }} /><s style={{ left: `${meta}%` }} /></div>
      <small>Meta {meta} % · {v >= meta ? "cumple" : `faltan ${(meta - v).toFixed(1)} puntos`}</small>
    </div>
  );
}
