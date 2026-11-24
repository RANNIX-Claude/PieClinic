// Piezas compartidas del dominio «plataforma»: gráficas SVG propias (sin librerías), tabla de datos, hoja imprimible, paginador.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Card, Icon, Vacio } from "../../ui/index.jsx";
import { dinero, fechaCorta } from "../../lib/format.js";
import { ROLES, appDeRol } from "../../config/roles.js";
import { mutar } from "../../store/core.js";
import { asegurarPlataforma, faltaPlataforma } from "../../store/acciones_plataforma.js";
import "../../estilos_plataforma.css";

/** Si los datos guardados en el navegador son anteriores a este dominio, siembra lo que falta (una sola vez). */
export function usePlataforma(d) {
  const falta = faltaPlataforma(d);
  useEffect(() => { if (falta) mutar((x) => asegurarPlataforma(x)); }, [falta]);
  return !falta;
}

export const PALETA = ["var(--p)", "var(--ok)", "var(--al)", "var(--info)", "var(--er)", "#0f766e", "#be185d", "#4d7c0f", "#b45309"];
export const numero = (n, dec = 0) => (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: dec });
export const abrevia = (n) => { const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)} k` : String(Math.round(n)); };
export const fechaHora = (ts) => (ts ? `${fechaCorta(ts)} ${String(ts).slice(11, 16)}`.trim() : "—");
/** Formatea un valor según su tipo: dinero | num | pct | fecha | bool | texto. */
export function formatea(valor, fmt) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (fmt === "dinero") return typeof valor === "number" ? dinero(valor) : String(valor);
  if (fmt === "num") return typeof valor === "number" ? numero(valor, 2) : String(valor);
  if (fmt === "pct") return typeof valor === "number" ? `${numero(valor, 2)} %` : String(valor);
  if (fmt === "fecha") return fechaCorta(valor);
  if (fmt === "bool") return valor ? "Sí" : "No";
  return String(valor);
}
/** Descarga un archivo de texto (CSV con BOM, JSON…). */
export function descargar(nombre, texto, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** ¿El rol del usuario tiene esa pantalla en su menú? (para no ofrecer enlaces que no abren). */
export function rutaDe(u, key) {
  const cfg = u && ROLES[appDeRol(u.rol)];
  if (!cfg) return null;
  if (cfg.mas.some((m) => m.key === key)) return `/mas/${key}`;
  if (cfg.tabs.some((t) => t.key === key)) return `/${key}`;
  return null;
}
export const Denegado = ({ children = "Esta pantalla es solo de Administración central y Dirección." }) => <Vacio icon="lock">{children}</Vacio>;
export const Nota = ({ children, className = "" }) => <p className={`mu peq ${className}`} style={{ margin: 0 }}>{children}</p>;
export const Seccion = ({ titulo, derecha, children }) => <section className="pl-sec"><div className="titulo"><h2>{titulo}</h2>{derecha}</div>{children}</section>;

/** KPI con comparativo contra el periodo anterior. mejor = "sube" | "baja" decide el color de la variación. */
export function KpiComparado({ label, valor, fmt, anterior, varPct, mejor = "sube", nota }) {
  const sinDato = varPct === null || varPct === undefined;
  const bien = !sinDato && (varPct === 0 ? null : mejor === "sube" ? varPct > 0 : varPct < 0);
  return (
    <div className={`kpi pl-kpi${bien === true ? " kpi-ok" : bien === false ? " kpi-bad" : ""}`}>
      <small>{label}</small>
      <b>{formatea(valor, fmt)}</b>
      <em>
        {sinDato ? "Sin dato comparable del periodo anterior" : (
          <><span className={`pl-var ${bien === true ? "ok" : bien === false ? "bad" : ""}`}>{varPct > 0 ? "▲" : varPct < 0 ? "▼" : "="} {numero(Math.abs(varPct), 1)} %</span> vs. {formatea(anterior, fmt)}</>
        )}
      </em>
      {nota && <em className="pl-kpi-nota">{nota}</em>}
    </div>
  );
}

/** Líneas / área. datos: [{ x: etiqueta, y: número }]. */
export function GraficaLinea({ datos, alto = 200, formato = abrevia, color = "var(--p)", titulo }) {
  const [sel, setSel] = useState(null);
  if (!datos.length) return <Vacio icon="chart">Sin datos para graficar.</Vacio>;
  const W = 640, H = alto, mx = 44, my = 18, mb = 26;
  const max = Math.max(1, ...datos.map((p) => p.y)), paso = datos.length > 1 ? (W - mx - 12) / (datos.length - 1) : 0;
  const X = (i) => mx + (datos.length > 1 ? i * paso : (W - mx - 12) / 2), Y = (v) => my + (H - my - mb) * (1 - v / max);
  const linea = datos.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const cada = Math.max(1, Math.ceil(datos.length / 8));
  const s = sel != null ? datos[sel] : null;
  return (
    <figure className="pl-fig">
      {titulo && <figcaption>{titulo}{s && <b> · {s.x}: {formato(s.y)}</b>}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo || "Gráfica de líneas"} onMouseLeave={() => setSel(null)}>
        {[0, 0.5, 1].map((k) => <g key={k}><line x1={mx} x2={W - 12} y1={Y(max * k)} y2={Y(max * k)} className="pl-eje" /><text x={mx - 6} y={Y(max * k) + 4} textAnchor="end" className="pl-tx">{formato(max * k)}</text></g>)}
        <path d={`${linea} L${X(datos.length - 1).toFixed(1)},${Y(0)} L${X(0).toFixed(1)},${Y(0)} Z`} fill={color} opacity="0.12" />
        <path d={linea} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {datos.map((p, i) => (
          <g key={i}>
            <circle cx={X(i)} cy={Y(p.y)} r={sel === i ? 5 : 3} fill={color} />
            {i % cada === 0 && <text x={X(i)} y={H - 8} textAnchor="middle" className="pl-tx">{p.x}</text>}
            <rect x={X(i) - Math.max(8, paso / 2)} y={0} width={Math.max(16, paso)} height={H} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Barras verticales agrupadas. datos: [{ x, [serie.k]: número, tenue?: bool }], series: [{ k, l, color }]. */
export function GraficaBarras({ datos, series, alto = 220, formato = abrevia, titulo }) {
  const [sel, setSel] = useState(null);
  if (!datos.length) return <Vacio icon="chart">Sin datos para graficar.</Vacio>;
  const W = 640, H = alto, mx = 44, my = 18, mb = 26;
  const max = Math.max(1, ...datos.flatMap((p) => series.map((s) => Math.max(0, p[s.k] || 0))));
  const g = (W - mx - 12) / datos.length, b = Math.max(3, (g * 0.72) / series.length);
  const Y = (v) => my + (H - my - mb) * (1 - Math.max(0, v) / max);
  const cada = Math.max(1, Math.ceil(datos.length / 9));
  const s = sel != null ? datos[sel] : null;
  return (
    <figure className="pl-fig">
      {titulo && <figcaption>{titulo}{s && <b> · {s.x}: {series.map((q) => `${q.l} ${formato(s[q.k] || 0)}`).join(" · ")}</b>}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo || "Gráfica de barras"} onMouseLeave={() => setSel(null)}>
        {[0, 0.5, 1].map((k) => <g key={k}><line x1={mx} x2={W - 12} y1={Y(max * k)} y2={Y(max * k)} className="pl-eje" /><text x={mx - 6} y={Y(max * k) + 4} textAnchor="end" className="pl-tx">{formato(max * k)}</text></g>)}
        {datos.map((p, i) => (
          <g key={i} opacity={p.tenue ? 0.55 : 1}>
            {series.map((q, j) => <rect key={q.k} x={mx + i * g + g * 0.14 + j * b} y={Y(p[q.k] || 0)} width={b - 1} height={Math.max(0, Y(0) - Y(p[q.k] || 0))} rx="2" fill={q.color} />)}
            {i % cada === 0 && <text x={mx + i * g + g / 2} y={H - 8} textAnchor="middle" className="pl-tx">{p.x}</text>}
            <rect x={mx + i * g} y={0} width={g} height={H} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
          </g>
        ))}
      </svg>
      {series.length > 1 && <div className="pl-ley">{series.map((q) => <span key={q.k}><i style={{ background: q.color }} />{q.l}</span>)}</div>}
    </figure>
  );
}

/** Barras horizontales (ranking). filas: [{ id, nombre, valor, sub? }]. */
export function GraficaRanking({ filas, formato = dinero, titulo, color = "var(--p)", vacio = "Sin datos en este periodo." }) {
  if (!filas.length) return <figure className="pl-fig">{titulo && <figcaption>{titulo}</figcaption>}<Nota>{vacio}</Nota></figure>;
  const max = Math.max(1, ...filas.map((f) => f.valor));
  const alto = 30, W = 640;
  return (
    <figure className="pl-fig">
      {titulo && <figcaption>{titulo}</figcaption>}
      <svg viewBox={`0 0 ${W} ${filas.length * alto + 4}`} role="img" aria-label={titulo || "Ranking"}>
        {filas.map((f, i) => (
          <g key={f.id ?? i} transform={`translate(0,${i * alto})`}>
            <text x="0" y="12" className="pl-tx pl-tx-n">{String(f.nombre).slice(0, 46)}{f.sub ? ` · ${f.sub}` : ""}</text>
            <text x={W} y="12" textAnchor="end" className="pl-tx pl-tx-v">{formato(f.valor)}</text>
            <rect x="0" y="17" width={W} height="8" rx="4" className="pl-barra-f" />
            <rect x="0" y="17" width={Math.max(4, (f.valor / max) * W)} height="8" rx="4" fill={color} />
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** Dona de participación. partes: [{ id, nombre, valor }]. */
export function GraficaDona({ partes, formato = dinero, titulo }) {
  const total = partes.reduce((a, p) => a + Math.max(0, p.valor), 0);
  if (!total) return <figure className="pl-fig">{titulo && <figcaption>{titulo}</figcaption>}<Nota>Sin datos en este periodo.</Nota></figure>;
  const R = 54, C = 2 * Math.PI * R;
  let acum = 0;
  return (
    <figure className="pl-fig">
      {titulo && <figcaption>{titulo}</figcaption>}
      <div className="pl-dona">
        <svg viewBox="0 0 140 140" role="img" aria-label={titulo || "Participación"}>
          <g transform="rotate(-90 70 70)">
            {partes.map((p, i) => { const f = Math.max(0, p.valor) / total, seg = <circle key={p.id ?? i} cx="70" cy="70" r={R} fill="none" stroke={PALETA[i % PALETA.length]} strokeWidth="20" strokeDasharray={`${f * C} ${C}`} strokeDashoffset={-acum * C} />; acum += f; return seg; })}
          </g>
          <text x="70" y="67" textAnchor="middle" className="pl-tx">Total</text>
          <text x="70" y="84" textAnchor="middle" className="pl-tx pl-tx-v">{abrevia(total)}</text>
        </svg>
        <ul>{partes.map((p, i) => <li key={p.id ?? i}><i style={{ background: PALETA[i % PALETA.length] }} /><span>{p.nombre}</span><b>{formato(p.valor)}</b><em>{numero((p.valor / total) * 100, 1)} %</em></li>)}</ul>
      </div>
    </figure>
  );
}

/** Tabla de datos de solo lectura. En teléfono cada renglón se vuelve tarjeta (etiqueta: valor). */
export function TablaDatos({ columnas, filas, onAbrir, orden, onOrden, compacta = false, clave = (f, i) => f.id ?? i }) {
  if (!filas.length) return <Vacio icon="search">Sin registros.</Vacio>;
  return (
    <div className="pl-tabla-w">
      <table className={`pl-tabla${compacta ? " pl-tabla-c" : ""}`}>
        <thead><tr>{columnas.map((c) => <th key={c.k} className={`${c.der ? "der" : ""}${onOrden ? " tap" : ""}`} onClick={onOrden ? () => onOrden(c.k) : undefined} aria-sort={orden && orden.k === c.k ? (orden.desc ? "descending" : "ascending") : undefined}>{c.t}{orden && orden.k === c.k ? (orden.desc ? " ▾" : " ▴") : ""}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => (
          <tr key={clave(f, i)} className={onAbrir ? "tap" : ""} onClick={onAbrir ? () => onAbrir(f) : undefined}>
            {columnas.map((c) => <td key={c.k} className={c.der ? "der" : ""} data-l={c.t}>{c.v(f)}</td>)}
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export function Paginador({ pagina, paginas, onChange, total }) {
  if (paginas <= 1) return total != null ? <Nota>{numero(total)} registro(s).</Nota> : null;
  return (
    <div className="pl-pag">
      <Button variante="sec" className="btn-peq" disabled={pagina <= 1} onClick={() => onChange(pagina - 1)} icon="back">Anterior</Button>
      <span className="mu peq">Página {pagina} de {paginas}{total != null ? ` · ${numero(total)} registro(s)` : ""}</span>
      <Button variante="sec" className="btn-peq" disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)}>Siguiente</Button>
    </div>
  );
}

/** Hoja imprimible a pantalla completa: «Imprimir» usa la impresión del navegador (también guarda como PDF). */
export function HojaImprimible({ abierto, onClose, titulo, children }) {
  useEffect(() => {
    if (!abierto) return undefined;
    document.body.classList.add("pl-imprimiendo");
    const h = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", h);
    return () => { document.body.classList.remove("pl-imprimiendo"); removeEventListener("keydown", h); };
  }, [abierto, onClose]);
  if (!abierto) return null;
  return createPortal(
    <div className="pl-hoja-fondo" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="pl-hoja-barra">
        <b>{titulo}</b>
        <span><Button className="btn-peq" icon="download" onClick={() => window.print()}>Imprimir o guardar PDF</Button> <Button className="btn-peq" variante="sec" icon="x" onClick={onClose}>Cerrar</Button></span>
      </div>
      <div className="pl-hoja">{children}</div>
    </div>, document.body);
}

/** Aviso del estado del data warehouse (última carga y cuadre). */
export function AvisoDW({ cuadre, onIr }) {
  if (cuadre.sinCarga) return <Card tono="warn"><p className="txt peq" style={{ margin: 0 }}><b>El data warehouse no se ha cargado.</b> El tablero se calcula en vivo sobre las vistas dw_*.</p></Card>;
  return (
    <Card tono={cuadre.ok ? "ok" : "warn"}>
      <div className="fila-flex" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <p className="txt peq" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <Icon name={cuadre.ok ? "check" : "alert"} size={15} /> Última carga del DW: <b>{fechaHora(cuadre.ts)}</b>. {cuadre.ok ? "Cuadra en cero contra la operación." : `${cuadre.diferencias} total(es) ya no cuadran: hay movimientos posteriores a la carga.`} El tablero en pantalla se calcula en vivo.
        </p>
        {onIr && <Button variante="sec" className="btn-peq" icon="refresh" onClick={onIr}>Control de ETL</Button>}
      </div>
    </Card>
  );
}
export const Semaforo = ({ estado, etiquetas }) => { const e = etiquetas[estado] || [estado, "neutral"]; return <Badge tono={e[1]}>{e[0]}</Badge>; };
