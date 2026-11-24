// Mapa del pie (porte de Pie Firme: MapaPie.jsx + MapaPieImpreso.jsx). Siluetas SVG propias, 4 vistas: D/I × dorsal/plantar.
// Uña afectada = ámbar; lesión = rojo. Los números no se espejan: se dibujan en coordenadas normalizadas guardadas.
import { useState } from "react";
import { CONTORNO, ANCHO, ALTO, zonasDeVista, espejar, VISTAS_FORMATO, nombreZona } from "../../store/reglas_expediente.js";

export function VistaPie({ pie, vista, hallazgos = [], onMarcar, onHallazgo, seleccion, ancho = 150, titulo, imprimible }) {
  const [hover, setHover] = useState(null);
  const espejo = espejar(pie, vista);
  const zonas = zonasDeVista(vista);
  const propios = hallazgos.filter((h) => h.pie === pie && h.vista === vista);
  const activas = new Set(propios.map((h) => h.zona));
  const interactivo = !!onMarcar;
  const tf = espejo ? `translate(${ANCHO} 0) scale(-1 1)` : undefined;
  const forma = (z) => {
    const relleno = activas.has(z.codigo) ? (imprimible ? "rgba(0,0,0,.12)" : "rgba(217,119,6,.35)") : hover === z.codigo ? "rgba(91,64,160,.22)" : "transparent";
    const comunes = {
      key: z.codigo, fill: relleno, stroke: z.f === "r" ? "transparent" : imprimible ? "#444" : "var(--mu)", strokeWidth: 0.6,
      style: { cursor: interactivo ? "pointer" : "default" },
      onMouseEnter: () => setHover(z.codigo), onMouseLeave: () => setHover(null),
      onClick: interactivo ? () => onMarcar({ pie, vista, zona: z.codigo }) : undefined,
    };
    const t = <title>{z.nombre}</title>;
    if (z.f === "c") return <circle {...comunes} cx={z.cx} cy={z.cy} r={z.r}>{t}</circle>;
    if (z.f === "e") return <ellipse {...comunes} cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry}>{t}</ellipse>;
    return <rect {...comunes} x={z.x} y={z.y} width={z.w} height={z.h}>{t}</rect>;
  };
  const dentro = zonas.filter((z) => !z.fuera), fuera = zonas.filter((z) => z.fuera);
  const idClip = `exp-clip-${pie}-${vista}${imprimible ? "-p" : ""}`;
  const lado = pie === "D" ? "derecho" : "izquierdo";
  return (
    <figure className="exp-pie">
      {titulo !== false && <figcaption>{titulo ?? `Pie ${lado} · ${vista}`}</figcaption>}
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ancho} role="img" aria-label={`Pie ${lado}, vista ${vista}`} style={{ maxWidth: "100%", touchAction: "manipulation" }}>
        <defs><clipPath id={idClip}><path d={CONTORNO} /></clipPath></defs>
        <g transform={tf}>
          <path d={CONTORNO} fill={imprimible ? "#fff" : "var(--pl)"} stroke={imprimible ? "#111" : "var(--tx)"} strokeWidth="1.2" />
          <g clipPath={`url(#${idClip})`}>{dentro.filter((z) => z.f === "r").map(forma)}</g>
          {dentro.filter((z) => z.f !== "r").map(forma)}
          {fuera.map(forma)}
        </g>
        {propios.map((h) => {
          const cx = (h.x ?? 0.5) * ANCHO, cy = (h.y ?? 0.5) * ALTO;
          const col = imprimible ? "#111" : h.marca === "ungueal" ? "var(--al)" : "var(--er)";
          return (
            <g key={h.id ?? h.numero} onClick={onHallazgo ? (e) => { e.stopPropagation(); onHallazgo(h); } : undefined} style={{ cursor: onHallazgo ? "pointer" : "default" }}>
              <circle cx={cx} cy={cy} r={seleccion === h.id ? 8.5 : 7} fill={col} stroke="#fff" strokeWidth="1" />
              <text x={cx} y={cy + 3.2} textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">{h.numero}</text>
            </g>
          );
        })}
        <text x="4" y="12" fontSize="10" fontWeight="800" fill={imprimible ? "#444" : "var(--mu)"}>{pie}</text>
      </svg>
      {!imprimible && <div className="exp-pie-zona">{hover ? nombreZona(hover) : " "}</div>}
    </figure>
  );
}

/** Las 4 vistas del formato (D dorsal, I dorsal, D plantar, I plantar). */
export default function MapaPie({ hallazgos = [], onMarcar, onHallazgo, seleccion, ancho = 150, imprimible, titulos = true }) {
  return (
    <div className="exp-mapa">
      {VISTAS_FORMATO.map(([pie, vista]) => (
        <VistaPie key={pie + vista} pie={pie} vista={vista} hallazgos={hallazgos} onMarcar={onMarcar} onHallazgo={onHallazgo}
          seleccion={seleccion} ancho={ancho} imprimible={imprimible} titulo={titulos ? undefined : false} />
      ))}
    </div>
  );
}

/** Las 4 siluetas del formato 3 en blanco y negro para impresión. */
export function MapaPieImpreso({ hallazgos = [] }) {
  return (
    <div className="figs">
      {VISTAS_FORMATO.map(([pie, vista]) => (
        <div key={pie + vista} style={{ textAlign: "center", fontSize: 10 }}>
          <VistaPie pie={pie} vista={vista} hallazgos={hallazgos} ancho={110} titulo={false} imprimible />
          <div>{pie} · {vista}</div>
        </div>
      ))}
    </div>
  );
}
