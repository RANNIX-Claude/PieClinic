// Ilustraciones SVG limpias por categoría de producto (no hay fotos reales; nunca imágenes externas).
// <Ilustracion categoria="Bastones" nombre="Bastón 4 puntas" /> dibuja un icono grande sobre fondo suave.
const PALETAS = {
  Bastones: ["#e8f1fb", "#2f6fb0", "#9cc3ea"], Andaderas: ["#eaf6f1", "#1f8a6b", "#9bd6c0"], Plantillas: ["#f1ecfa", "#6a4aa0", "#c8b6e6"],
  Calzado: ["#fdf0e6", "#c4621a", "#f2c29a"], Cremas: ["#fcebf1", "#b83c6b", "#f1b3cb"], Calcetas: ["#eaf3fb", "#3b82a6", "#a9d2e6"],
};
const base = (cat) => PALETAS[cat] || ["#eef0f5", "#5b6475", "#c5cad6"];

function Dibujo({ cat, nombre }) {
  const [, f, s] = base(cat);
  const trazo = { fill: "none", stroke: f, strokeWidth: 9, strokeLinecap: "round", strokeLinejoin: "round" };
  if (cat === "Bastones") {
    const cuatro = /4 puntas/i.test(nombre || "");
    return cuatro ? (
      <g>
        <path d="M112 150 V70 C112 38 74 38 74 68" {...trazo} />
        <path d="M112 150 L84 176 M112 150 L140 176 M112 150 L104 180 M112 150 L124 180" {...trazo} strokeWidth="6" />
        <circle cx="84" cy="176" r="4" fill={f} /><circle cx="140" cy="176" r="4" fill={f} /><circle cx="104" cy="181" r="4" fill={f} /><circle cx="124" cy="181" r="4" fill={f} />
        <path d="M74 68 V62" stroke={s} strokeWidth="14" strokeLinecap="round" />
      </g>
    ) : (
      <g>
        <path d="M112 168 V70 C112 38 74 38 74 68" {...trazo} />
        <rect x="104" y="160" width="16" height="20" rx="4" fill={s} />
        <path d="M74 62 V70" stroke={s} strokeWidth="14" strokeLinecap="round" />
        <path d="M112 100 V128" stroke="#fff" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
      </g>
    );
  }
  if (cat === "Andaderas") {
    const ruedas = /ruedas/i.test(nombre || "");
    return (
      <g>
        <path d="M54 72 H146 M54 72 V150 M146 72 V150 M54 112 H146" {...trazo} />
        <path d="M54 72 C54 60 64 58 72 58 M146 72 C146 60 136 58 128 58" {...trazo} strokeWidth="6" />
        {ruedas ? <><circle cx="54" cy="160" r="11" fill={s} stroke={f} strokeWidth="4" /><circle cx="146" cy="160" r="11" fill={s} stroke={f} strokeWidth="4" /></> : <><rect x="46" y="150" width="16" height="16" rx="4" fill={s} /><rect x="138" y="150" width="16" height="16" rx="4" fill={s} /></>}
        <path d="M84 72 V112 M116 72 V112" stroke={s} strokeWidth="5" strokeLinecap="round" />
      </g>
    );
  }
  if (cat === "Plantillas") {
    return (
      <g>
        <path d="M100 30 C132 30 142 62 132 98 C126 122 134 150 122 168 C110 184 80 180 76 160 C70 130 84 110 78 84 C72 54 80 30 100 30Z" fill={s} stroke={f} strokeWidth="6" strokeLinejoin="round" />
        <path d="M92 70 C100 84 100 104 92 120 M108 56 C116 74 116 96 110 112" fill="none" stroke={f} strokeWidth="3.5" strokeLinecap="round" strokeOpacity=".7" />
        <circle cx="100" cy="160" r="6" fill={f} fillOpacity=".35" />
      </g>
    );
  }
  if (cat === "Calzado") {
    return (
      <g>
        <path d="M38 132 C38 100 60 78 78 78 L98 78 C104 100 120 108 142 112 C162 116 172 128 172 142 V150 H38Z" fill={s} stroke={f} strokeWidth="6" strokeLinejoin="round" />
        <rect x="36" y="150" width="138" height="16" rx="8" fill={f} />
        <path d="M82 78 L96 100 M92 78 L104 96 M72 92 L86 112" stroke={f} strokeWidth="4" strokeLinecap="round" />
        <path d="M98 78 C100 66 94 60 82 60" fill="none" stroke={f} strokeWidth="6" strokeLinecap="round" />
      </g>
    );
  }
  if (cat === "Cremas") {
    return (
      <g>
        <rect x="64" y="84" width="72" height="80" rx="14" fill={s} stroke={f} strokeWidth="6" />
        <rect x="58" y="58" width="84" height="30" rx="8" fill={f} />
        <rect x="76" y="106" width="48" height="34" rx="6" fill="#fff" fillOpacity=".75" />
        <path d="M84 118 H116 M84 128 H108" stroke={f} strokeWidth="4" strokeLinecap="round" />
      </g>
    );
  }
  if (cat === "Calcetas") {
    return (
      <g>
        <path d="M78 40 H122 V104 C122 118 134 124 146 134 C162 148 160 168 142 170 C124 172 108 156 96 144 C84 132 78 124 78 108Z" fill={s} stroke={f} strokeWidth="6" strokeLinejoin="round" />
        <rect x="76" y="34" width="48" height="18" rx="5" fill={f} />
        <path d="M82 64 H118 M82 78 H118 M82 92 H118" stroke={f} strokeWidth="3" strokeOpacity=".55" />
      </g>
    );
  }
  return <g><circle cx="100" cy="100" r="42" fill={s} stroke={f} strokeWidth="6" /><path d="M80 100 H120 M100 80 V120" stroke={f} strokeWidth="8" strokeLinecap="round" /></g>;
}

export function Ilustracion({ categoria, nombre, className = "" }) {
  const [bg] = base(categoria);
  return (
    <svg className={`cm-ilus ${className}`} viewBox="0 0 200 200" role="img" aria-label={nombre || categoria || "Producto"} preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="200" fill={bg} />
      <circle cx="100" cy="104" r="78" fill="#fff" fillOpacity=".55" />
      <ellipse cx="100" cy="186" rx="52" ry="6" fill="#000" fillOpacity=".06" />
      <Dibujo cat={categoria} nombre={nombre} />
    </svg>
  );
}
export const CATEGORIAS_TIENDA = ["Bastones", "Andaderas", "Plantillas", "Calzado", "Cremas", "Calcetas"];
export const DESCRIPCION_CATEGORIA = {
  Bastones: "Apoyo seguro para caminar con ligereza. Altura ajustable y punta antiderrapante.",
  Andaderas: "Estabilidad para recuperar o mantener la marcha, con estructura ligera y fácil de plegar.",
  Plantillas: "Soporte plantar que distribuye la presión y alivia el cansancio del pie.",
  Calzado: "Calzado amplio y acolchado, pensado para pies sensibles y con ajuste cómodo.",
  Cremas: "Cuidado diario de la piel del pie: hidrata, suaviza y previene resequedad.",
  Calcetas: "Calcetas sin costuras irritantes y con elástico suave que no aprieta.",
};
