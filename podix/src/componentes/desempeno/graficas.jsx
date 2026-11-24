// Gráficas SVG propias del dominio «desempeño» (sin librerías). Colores solo con variables CSS (vía style, no atributos).
// Cada gráfica trae título accesible y <title> en cada punto; en teléfono el contenedor propio hace scroll horizontal, no la página.
import { dinero } from "../../lib/format.js";

export const PALETA = ["var(--p)", "var(--ok)", "var(--al)", "var(--info)", "var(--er)", "#0f766e", "#be185d"];

export const abrevia = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${+(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};
const bonito = (max) => {
  if (!(max > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(max))), f = max / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
};

/**
 * Gráfica por periodos (meses). datos: [{ etq, ...cualquier campo }]. series: [{ k, nombre, tipo:"barra"|"linea", color, valor:(dato)=>number|null, colorDe?:(dato)=>color }]
 * Las barras se agrupan lado a lado (o se apilan con apilado); las líneas llevan punto en cada periodo. formato: (n)=>texto del eje y de los títulos.
 */
export function GraficaPeriodos({ datos, series, formato = abrevia, titulo, apilado = false, alto = 240, minAncho }) {
  const n = datos.length, W = 680, H = alto, PL = 50, PR = 12, PT = 14, PB = 34;
  const barras = series.filter((s) => s.tipo === "barra"), lineas = series.filter((s) => s.tipo === "linea");
  const val = (s, d) => { const v = s.valor(d); return v == null || Number.isNaN(v) ? null : v; };
  let max = 0;
  datos.forEach((d) => {
    if (apilado) max = Math.max(max, barras.reduce((a, s) => a + (val(s, d) || 0), 0));
    else barras.forEach((s) => { max = Math.max(max, val(s, d) || 0); });
    lineas.forEach((s) => { max = Math.max(max, val(s, d) || 0); });
  });
  const tope = bonito(max * 1.05), paso = tope / 4;
  const x0 = PL, x1 = W - PR, st = (x1 - x0) / Math.max(1, n);
  const y = (v) => PT + (H - PT - PB) * (1 - v / tope);
  const gb = apilado ? 1 : Math.max(1, barras.length), bw = Math.min(34, (st * 0.64) / gb);
  const cx = (i) => x0 + st * (i + 0.5);
  return (
    <div className="dsp-graf">
      <div className="dsp-graf-in" style={{ minWidth: minAncho || Math.max(460, n * 44) }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo || "Gráfica por periodos"} preserveAspectRatio="xMidYMid meet">
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line x1={x0} x2={x1} y1={y(paso * i)} y2={y(paso * i)} className="dsp-rej" />
              <text x={x0 - 6} y={y(paso * i) + 4} textAnchor="end" className="dsp-eje">{formato(paso * i)}</text>
            </g>
          ))}
          {datos.map((d, i) => {
            let acum = 0;
            return (
              <g key={i}>
                {barras.map((s, j) => {
                  const v = val(s, d);
                  if (v == null) return null;
                  const h = Math.max(0, (H - PT - PB) * (v / tope));
                  const base = apilado ? acum : 0; if (apilado) acum += v;
                  const bx = apilado ? cx(i) - bw / 2 : cx(i) - (bw * gb) / 2 + bw * j;
                  const yy = apilado ? y(base + v) : H - PB - h;
                  return <rect key={s.k} x={bx} y={yy} width={bw * 0.92} height={h} rx="2" style={{ fill: s.colorDe ? s.colorDe(d) : s.color }}><title>{`${d.etq} · ${s.nombre}: ${formato(v)}`}</title></rect>;
                })}
                <text x={cx(i)} y={H - PB + 15} textAnchor="middle" className="dsp-eje">{d.etq}</text>
              </g>
            );
          })}
          {lineas.map((s) => {
            const pts = datos.map((d, i) => ({ i, v: val(s, d), d })).filter((p) => p.v != null);
            return (
              <g key={s.k}>
                <polyline points={pts.map((p) => `${cx(p.i)},${y(p.v)}`).join(" ")} fill="none" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: s.color }} strokeDasharray={s.punteada ? "5 4" : undefined} />
                {pts.map((p) => <circle key={p.i} cx={cx(p.i)} cy={y(p.v)} r="3.2" style={{ fill: s.color }}><title>{`${p.d.etq} · ${s.nombre}: ${formato(p.v)}`}</title></circle>)}
              </g>
            );
          })}
        </svg>
      </div>
      <Leyenda series={series} />
    </div>
  );
}
export function Leyenda({ series }) {
  return (
    <div className="dsp-ley">{series.map((s) => (
      <span key={s.k}><i className={s.tipo === "linea" ? "ln" : ""} style={{ background: s.color }} />{s.nombre}</span>
    ))}</div>
  );
}

/** Barras horizontales con etiqueta y valor (SVG). filas: [{ etq, valor, nota?, color? }]. */
export function BarrasHorizontales({ filas, formato = (n) => String(n), max, titulo }) {
  const m = max ?? Math.max(1, ...filas.map((f) => f.valor));
  const RH = 34, W = 640, LW = 150, VW = 92, alto = filas.length * RH + 6;
  const w = W - LW - VW - 8;
  return (
    <div className="dsp-graf dsp-graf-h">
      <svg viewBox={`0 0 ${W} ${alto}`} role="img" aria-label={titulo || "Barras"}>
        {filas.map((f, i) => (
          <g key={f.id ?? i} transform={`translate(0 ${i * RH + 4})`}>
            <text x={LW - 8} y={RH / 2 + 1} textAnchor="end" className="dsp-eje dsp-et">{String(f.etq).length > 22 ? `${String(f.etq).slice(0, 21)}…` : f.etq}</text>
            <rect x={LW} y={6} width={w} height={RH - 14} rx="4" className="dsp-pista" />
            <rect x={LW} y={6} width={Math.max(2, (w * Math.max(0, f.valor)) / m)} height={RH - 14} rx="4" style={{ fill: f.color || "var(--p)" }}><title>{`${f.etq}: ${formato(f.valor)}`}</title></rect>
            <text x={LW + w + 8} y={RH / 2 + 1} className="dsp-val">{formato(f.valor)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Barra apilada única con su leyenda y porcentajes. partes: [{ etq, valor, color }] */
export function BarraApilada({ partes, formato = dinero }) {
  const total = partes.reduce((a, p) => a + p.valor, 0) || 1;
  let acc = 0;
  return (
    <div>
      <svg viewBox="0 0 600 34" className="dsp-apil" role="img" aria-label={`Mezcla: ${partes.map((p) => `${p.etq} ${Math.round((p.valor / total) * 100)} %`).join(", ")}`}>
        {partes.map((p) => {
          const w = (p.valor / total) * 600, x = acc; acc += w;
          return <rect key={p.etq} x={x} y="2" width={Math.max(0, w - 2)} height="30" rx="4" style={{ fill: p.color }}><title>{`${p.etq}: ${formato(p.valor)} (${Math.round((p.valor / total) * 100)} %)`}</title></rect>;
        })}
      </svg>
      <div className="dsp-ley dsp-ley-g">{partes.map((p) => <span key={p.etq}><i style={{ background: p.color }} />{p.etq} <b>{Math.round((p.valor / total) * 100)} %</b> · {formato(p.valor)}</span>)}</div>
    </div>
  );
}

/** Estrellas de solo lectura. */
export function Estrellas({ valor, tam = 16 }) {
  const v = Math.round(valor || 0);
  return (
    <span className="dsp-est" role="img" aria-label={`${valor ?? "sin"} de 5`} style={{ fontSize: tam }}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= v ? "on" : ""}>★</span>)}
    </span>
  );
}
