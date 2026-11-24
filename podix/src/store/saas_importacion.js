// Importación de datos (portado de Pie Firme: src/lib/plataforma/importacion.js). LÓGICA PURA: sin core.js ni localStorage.
// Analizador CSV propio (comillas, comas y saltos de línea dentro de un campo), mapeo heurístico de columnas a campos con puntaje
// de confianza, normalización, validación fila por fila y detección de duplicados.
// Reglas de Pie Firme: P-122 (nada se carga sin confirmar; cada carga es un lote reversible), P-123 (confianza < 80 % o campo
// clínico → revisión humana campo por campo; en conflicto gana el dato existente) y P-006 (paciente duplicado = nombre completo +
// fecha de nacimiento; el teléfono compartido solo avisa).
// La parte de «IA» (interpretar columnas ambiguas por su contenido o un texto libre) es una SIMULACIÓN: ver `// INTEGRACIÓN:`.

export const UMBRAL_CONFIANZA = 80; // P-123

export const TIPOS_IMPORTACION = [
  { id: "pacientes", nombre: "Pacientes", destino: "pacientes", nota: "Alta de expedientes. Duplicado = nombre completo + fecha de nacimiento (P-006)." },
  { id: "productos", nombre: "Productos", destino: "productos", nota: "Catálogo de productos; la existencia inicial entra como capa de inventario." },
  { id: "servicios", nombre: "Servicios y precios", destino: "servicios", nota: "Catálogo de servicios con su precio base." },
  { id: "existencias", nombre: "Existencias", destino: "capas", nota: "Inventario inicial por SKU: entra como capa PEPS en el almacén elegido." },
  { id: "cartera", nombre: "Saldos de cartera", destino: "planes", nota: "Saldos por cobrar de pacientes que ya existen: entran como crédito abierto." },
];

/** Campos destino por tipo. requerido = sin él la fila es error. clinico = siempre a revisión humana (P-123). dato = cómo se normaliza. */
export const CAMPOS_DESTINO = {
  pacientes: [
    { campo: "nombres", etiqueta: "Nombre(s)", dato: "nombre", alias: ["nombre", "nombres", "first name", "primer nombre", "nombre s"] },
    { campo: "nombre_completo", etiqueta: "Nombre completo (se separa)", dato: "texto", alias: ["nombre completo", "paciente", "nombre paciente", "name", "full name", "cliente", "nombre y apellidos"] },
    { campo: "apellidos", etiqueta: "Apellidos", dato: "nombre", alias: ["apellidos", "apellido", "last name"] },
    { campo: "apellido_paterno", etiqueta: "Apellido paterno", dato: "nombre", alias: ["apellido paterno", "ap paterno", "paterno", "primer apellido"] },
    { campo: "apellido_materno", etiqueta: "Apellido materno", dato: "nombre", alias: ["apellido materno", "ap materno", "materno", "segundo apellido"] },
    { campo: "nacimiento", etiqueta: "Fecha de nacimiento", dato: "fecha", alias: ["fecha nacimiento", "nacimiento", "fecha nac", "f nac", "fec nac", "nac", "birth", "birthday", "cumpleanos", "fecha nacim"] },
    { campo: "sexo", etiqueta: "Sexo", dato: "sexo", alias: ["sexo", "genero", "sex", "gender"] },
    { campo: "telefono", etiqueta: "Teléfono", dato: "telefono", alias: ["telefono", "celular", "movil", "whatsapp", "tel", "telefono celular", "cel", "phone", "mobile", "tel celular"] },
    { campo: "correo", etiqueta: "Correo electrónico", dato: "correo", alias: ["email", "correo", "correo electronico", "e mail", "mail"] },
    { campo: "domicilio", etiqueta: "Domicilio", dato: "texto", alias: ["domicilio", "direccion", "calle", "address", "calle y numero"] },
    { campo: "ocupacion", etiqueta: "Ocupación", dato: "texto", alias: ["ocupacion", "profesion", "trabajo"] },
    { campo: "folio_anterior", etiqueta: "Folio / expediente anterior", dato: "texto", alias: ["folio", "expediente", "numero expediente", "num exp", "id paciente", "clave", "folio anterior"] },
    { campo: "alergias", etiqueta: "Alergias (clínico)", dato: "texto", clinico: true, alias: ["alergias", "alergia", "alergico a"] },
    { campo: "diabetes", etiqueta: "Diabetes (clínico)", dato: "texto", clinico: true, alias: ["diabetes", "diabetico", "padece diabetes"] },
    { campo: "notas_clinicas", etiqueta: "Diagnóstico / antecedentes (clínico)", dato: "texto", clinico: true, alias: ["diagnostico", "padecimiento", "antecedentes", "medicamentos", "tratamiento", "observaciones clinicas", "enfermedades"] },
    { campo: "notas", etiqueta: "Notas administrativas", dato: "texto", alias: ["notas", "observaciones", "comentarios", "nota"] },
  ],
  productos: [
    { campo: "sku", etiqueta: "SKU / clave", dato: "sku", requerido: true, alias: ["sku", "clave", "codigo", "codigo interno", "cve", "no parte"] },
    { campo: "nombre", etiqueta: "Nombre", dato: "texto", requerido: true, alias: ["nombre", "producto", "descripcion", "articulo", "concepto"] },
    { campo: "categoria", etiqueta: "Categoría", dato: "texto", alias: ["categoria", "linea", "familia", "tipo producto", "grupo"] },
    { campo: "costo", etiqueta: "Costo", dato: "numero", alias: ["costo", "costo unitario", "costo promedio", "precio compra", "cost"] },
    { campo: "precio", etiqueta: "Precio de venta", dato: "numero", alias: ["precio", "precio venta", "precio publico", "pvp", "price", "precio base"] },
    { campo: "existencia", etiqueta: "Existencia inicial", dato: "numero", alias: ["existencia", "stock", "inventario", "cantidad", "qty", "existencia inicial"] },
    { campo: "minimo", etiqueta: "Mínimo", dato: "numero", alias: ["minimo", "stock minimo", "min", "punto reorden"] },
  ],
  servicios: [
    { campo: "nombre", etiqueta: "Servicio", dato: "texto", requerido: true, alias: ["servicio", "nombre", "descripcion", "concepto", "tratamiento", "procedimiento"] },
    { campo: "precio", etiqueta: "Precio", dato: "numero", requerido: true, alias: ["precio", "precio base", "tarifa", "costo", "importe", "precio publico", "price"] },
    { campo: "duracion", etiqueta: "Duración (minutos)", dato: "numero", alias: ["duracion", "minutos", "tiempo", "min", "duracion min"] },
  ],
  existencias: [
    { campo: "sku", etiqueta: "SKU / clave", dato: "sku", requerido: true, alias: ["sku", "clave", "codigo", "codigo interno", "cve", "producto"] },
    { campo: "cantidad", etiqueta: "Cantidad", dato: "numero", requerido: true, alias: ["cantidad", "existencia", "stock", "piezas", "pzas", "qty", "inventario", "conteo"] },
    { campo: "costo", etiqueta: "Costo unitario", dato: "numero", alias: ["costo", "costo unitario", "costo promedio", "cost"] },
    { campo: "almacen", etiqueta: "Almacén / sucursal", dato: "texto", alias: ["almacen", "sucursal", "bodega", "ubicacion", "sede"] },
    { campo: "lote", etiqueta: "Lote", dato: "texto", alias: ["lote", "lot", "no lote"] },
  ],
  cartera: [
    { campo: "paciente", etiqueta: "Paciente (nombre o folio EXP-…)", dato: "texto", requerido: true, alias: ["paciente", "nombre", "cliente", "nombre completo", "expediente", "folio", "deudor"] },
    { campo: "saldo", etiqueta: "Saldo por cobrar", dato: "numero", requerido: true, alias: ["saldo", "adeudo", "debe", "saldo pendiente", "importe", "monto", "por cobrar", "saldo actual"] },
    { campo: "fecha", etiqueta: "Fecha del adeudo", dato: "fecha", alias: ["fecha", "fecha venta", "fecha adeudo", "desde", "date"] },
    { campo: "vence", etiqueta: "Vencimiento", dato: "fecha", alias: ["vence", "vencimiento", "fecha vencimiento", "fecha limite", "limite pago"] },
    { campo: "concepto", etiqueta: "Concepto", dato: "texto", alias: ["concepto", "descripcion", "notas", "detalle", "observaciones"] },
  ],
};
export const campoDe = (tipo, campo) => (CAMPOS_DESTINO[tipo] || []).find((c) => c.campo === campo) || null;

// ═════════════════════════ Analizador CSV
const DELIMITADORES = [",", ";", "\t", "|"];
/** Delimitador más probable: el que más aparece FUERA de comillas en la primera línea lógica. */
export function detectarDelimitador(texto) {
  const cuenta = Object.fromEntries(DELIMITADORES.map((x) => [x, 0]));
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') { if (enComillas && texto[i + 1] === '"') i++; else enComillas = !enComillas; continue; }
    if (enComillas) continue;
    if (c === "\n" || c === "\r") { if (DELIMITADORES.some((x) => cuenta[x] > 0)) break; continue; }
    if (c in cuenta) cuenta[c] += 1;
  }
  return DELIMITADORES.reduce((m, x) => (cuenta[x] > cuenta[m] ? x : m), ",");
}
/** Texto delimitado → matriz de celdas. Respeta comillas dobles, comillas escapadas ("") y saltos de línea dentro de un campo. */
export function parsearMatriz(texto, delimitador = null) {
  let t = String(texto ?? "");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); // BOM
  const del = delimitador || detectarDelimitador(t);
  const filas = [];
  let fila = [], celda = "", enComillas = false, huboComillas = false;
  const cerrarCelda = () => { fila.push(huboComillas ? celda : celda.trim()); celda = ""; huboComillas = false; };
  const cerrarFila = () => { cerrarCelda(); if (fila.some((x) => x !== "")) filas.push(fila); fila = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else enComillas = false; }
      else celda += c === "\r" ? "" : c;
      continue;
    }
    if (c === '"' && celda.trim() === "") { enComillas = true; huboComillas = true; celda = ""; }
    else if (c === del) cerrarCelda();
    else if (c === "\n") cerrarFila();
    else if (c === "\r") { /* CRLF: el salto lo cierra \n; un \r suelto también es fin de línea */ if (t[i + 1] !== "\n") cerrarFila(); }
    else celda += c;
  }
  if (celda !== "" || fila.length || huboComillas) cerrarFila();
  return { matriz: filas, delimitador: del, comillasSinCerrar: enComillas };
}
/**
 * CSV (o tabla pegada desde Excel: tabuladores) → { columnas, filas:[{columna: valor}], delimitador, avisos }.
 * La primera fila no vacía son los encabezados; los vacíos se nombran «Columna N» y los repetidos se numeran.
 */
export function parsearCSV(texto, { delimitador = null } = {}) {
  const { matriz, delimitador: del, comillasSinCerrar } = parsearMatriz(texto, delimitador);
  const avisos = [];
  if (comillasSinCerrar) avisos.push("Hay unas comillas sin cerrar: revisa la última fila.");
  if (!matriz.length) return { columnas: [], filas: [], delimitador: del, avisos: ["El archivo está vacío."] };
  const vistos = new Map();
  const ancho = Math.max(...matriz.map((f) => f.length));
  const columnas = Array.from({ length: ancho }, (_, i) => {
    let n = String(matriz[0][i] ?? "").replace(/\s+/g, " ").trim() || `Columna ${i + 1}`;
    const k = n.toLowerCase();
    vistos.set(k, (vistos.get(k) || 0) + 1);
    if (vistos.get(k) > 1) n = `${n} (${vistos.get(k)})`;
    return n;
  });
  const filas = matriz.slice(1).map((f) => Object.fromEntries(columnas.map((c, i) => [c, f[i] ?? ""])));
  const desiguales = matriz.slice(1).filter((f) => f.length !== matriz[0].length).length;
  if (desiguales) avisos.push(`${desiguales} fila(s) tienen distinto número de columnas que el encabezado.`);
  if (!filas.length) avisos.push("Solo hay encabezados: no hay filas de datos.");
  return { columnas, filas, delimitador: del, avisos };
}
/** Matriz → CSV con comillas donde hace falta (comas, comillas, saltos). Inverso de parsearCSV. */
export function aCSV(columnas, filas, delimitador = ",") {
  const esc = (v) => { const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return s.includes(delimitador) || /["\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columnas.map(esc).join(delimitador), ...filas.map((f) => columnas.map((c) => esc(Array.isArray(f) ? f[columnas.indexOf(c)] : f[c])).join(delimitador))].join("\r\n");
}

// ═════════════════════════ Mapeo heurístico de columnas
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "no", "num", "numero", "nro", "y", "o", "en"]);
/** Normaliza para comparar: minúsculas, sin acentos ni signos. */
export const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const fichas = (s) => { const t = norm(s).split(" ").filter(Boolean); const u = t.filter((x) => !VACIAS.has(x)); return u.length ? u : t; };

/**
 * Parecido 0..1 entre el encabezado del archivo y un sinónimo del campo.
 * 1 = igual (sin acentos ni palabras vacías); abreviatura clara ≈ 0.86; el encabezado solo cubre una parte del sinónimo (o al revés)
 * → 0.60–0.80 según cuánto cubre (queda DEBAJO del umbral: pide confirmación); coincidencia parcial → menos.
 */
export function similitud(a, b) {
  const ta = fichas(a), tb = fichas(b);
  if (!ta.length || !tb.length) return 0;
  const sa = ta.join(" "), sb = tb.join(" ");
  if (sa === sb) return 1;
  const A = new Set(ta), B = new Set(tb);
  const [corto, largo] = A.size <= B.size ? [A, B] : [B, A];
  if ([...corto].every((t) => largo.has(t))) return 0.6 + 0.2 * (Math.min(sa.length, sb.length) / Math.max(sa.length, sb.length));
  // abreviaturas: cada ficha de uno es prefijo (≥ 3 letras) de una ficha del otro, en el mismo número de fichas
  const pref = (x, y) => x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x));
  if (A.size === B.size && ta.every((x, i) => pref(x, tb[i]))) return 0.86;
  const inter = [...A].filter((x) => B.has(x) || [...B].some((y) => pref(x, y))).length;
  return (inter / new Set([...A, ...B]).size) * 0.7;
}

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Refuerzo por contenido cuando el nombre de la columna ya apunta al campo (heurística real, no IA). */
function similitudPorContenido(def, ejemplos, nombreCol) {
  if (!ejemplos.length) return 0;
  const todos = (pred) => ejemplos.every(pred);
  if (def.dato === "correo" && /(mail|correo)/.test(nombreCol) && todos((v) => RE_CORREO.test(String(v).trim()))) return 0.92;
  if (def.campo === "nacimiento" && /(nac|birth|cumple)/.test(nombreCol) && todos((v) => fechaISO(v))) return 0.9;
  if (def.dato === "telefono" && /(tel|cel|movil|whats|phone)/.test(nombreCol) && todos((v) => telefono10(v).length === 10)) return 0.9;
  return 0;
}
const TRANSFORMACION = { nombre_completo: "Separar nombre y apellidos", fecha: "Fecha a AAAA-MM-DD", telefono: "Solo dígitos (10)", correo: "Minúsculas", sexo: "Normalizar a M / F", numero: "Número decimal", sku: "Mayúsculas sin espacios", nombre: "Mayúscula inicial" };
const transformacionDe = (def) => TRANSFORMACION[def.campo] || TRANSFORMACION[def.dato] || null;
const accionDe = (def, confianza, umbral) => (def.clinico || confianza < umbral ? "revisar" : "aceptar");

/**
 * Mapeador heurístico por nombre de columna (funciona sin IA).
 * @returns [{ columna, ejemplo, campo, confianza (0–99 | null), origen, clinico, transformacion, accion, confirmado }]
 *   accion: "aceptar" solo si confianza ≥ umbral y no es clínico; "revisar" si hay campo pero falta confirmarlo (P-123);
 *           "elegir_campo" si no se encontró destino. Cada campo destino se asigna a una sola columna (la de mayor puntaje).
 */
export function mapearColumnas(columnas, filas = [], tipo = "pacientes", umbral = UMBRAL_CONFIANZA) {
  const campos = CAMPOS_DESTINO[tipo] || [];
  const candidatos = columnas.map((col) => {
    const nc = norm(col);
    const ejemplos = filas.slice(0, 30).map((f) => f && f[col]).filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
    const puntos = campos.map((c) => {
      const porNombre = Math.max(...c.alias.map((a) => similitud(col, a)), similitud(col, c.campo.replace(/_/g, " ")));
      const porContenido = similitudPorContenido(c, ejemplos, nc);
      return { c, s: Math.max(porNombre, porContenido), origen: porContenido > porNombre ? "contenido" : "nombre" };
    }).sort((a, b) => b.s - a.s);
    return { col, ejemplo: ejemplos.length ? String(ejemplos[0]).slice(0, 60) : "", puntos };
  });
  // Asignación codiciosa: el par (columna, campo) de mayor puntaje se queda con el campo.
  const pares = candidatos.flatMap((cand) => cand.puntos.filter((p) => p.s >= 0.5).map((p) => ({ cand, p }))).sort((a, b) => b.p.s - a.p.s);
  const usados = new Set(), asignado = new Map();
  for (const { cand, p } of pares) {
    if (asignado.has(cand.col) || usados.has(p.c.campo)) continue;
    usados.add(p.c.campo); asignado.set(cand.col, p);
  }
  return candidatos.map(({ col, ejemplo }) => {
    const m = asignado.get(col);
    if (!m) return { columna: col, ejemplo, campo: null, confianza: null, origen: null, clinico: false, transformacion: null, accion: "elegir_campo", confirmado: false };
    const confianza = Math.round(Math.min(0.99, m.s) * 100);
    return { columna: col, ejemplo, campo: m.c.campo, confianza, origen: m.origen, clinico: !!m.c.clinico, transformacion: transformacionDe(m.c), accion: accionDe(m.c, confianza, umbral), confirmado: false };
  });
}

/**
 * «IA» para columnas ambiguas: propone destino para las columnas SIN campo mirando sus valores.
 * // INTEGRACIÓN: modelo de lenguaje (P-124). Hoy es una SIMULACIÓN de demostración: reglas sobre el contenido (correos, teléfonos,
 * fechas, importes, sexo). En producción esta función envía encabezados y una muestra SIN datos clínicos al proveedor de IA y recibe
 * { columna, campo, confianza }. Su propuesta SIEMPRE queda en «revisar»: una persona confirma campo por campo (P-122, P-123).
 */
export function interpretarColumnasIA(mapeos, filas = [], tipo = "pacientes") {
  const campos = CAMPOS_DESTINO[tipo] || [];
  const usados = new Set(mapeos.filter((m) => m.campo).map((m) => m.campo));
  const libre = (dato, campo) => campos.find((c) => !usados.has(c.campo) && (campo ? c.campo === campo : c.dato === dato));
  let propuestas = 0;
  const salida = mapeos.map((m) => {
    if (m.campo || m.accion === "descartar") return m;
    const vals = filas.slice(0, 40).map((f) => f && f[m.columna]).filter((v) => v !== null && v !== undefined && String(v).trim() !== "").map((v) => String(v).trim());
    if (vals.length < 1) return m;
    const parte = (pred) => vals.filter(pred).length / vals.length;
    let def = null, confianza = 0;
    if (parte((v) => RE_CORREO.test(v)) >= 0.8) { def = libre("correo"); confianza = 78; }
    else if (parte((v) => telefono10(v).length === 10 && /^[\d\s()+.-]+$/.test(v)) >= 0.8) { def = libre("telefono"); confianza = 72; }
    else if (parte((v) => !!fechaISO(v)) >= 0.8) { def = libre("fecha"); confianza = 60; }
    else if (parte((v) => SEXO[norm(v)] !== undefined) >= 0.9) { def = libre("sexo"); confianza = 74; }
    else if (parte((v) => /^[A-Z]{2,5}-?\d{2,5}$/i.test(v)) >= 0.8) { def = libre("sku"); confianza = 66; }
    else if (parte((v) => Number.isFinite(aNumero(v))) >= 0.9) { def = libre("numero"); confianza = 52; }
    else if (parte((v) => v.split(/\s+/).length >= 2 && /^[\p{L} .'-]+$/u.test(v)) >= 0.8) { def = libre(null, "nombre_completo") || libre(null, "paciente"); confianza = 64; }
    if (!def) return m;
    usados.add(def.campo); propuestas += 1;
    return { ...m, campo: def.campo, confianza, origen: "ia_simulada", clinico: !!def.clinico, transformacion: transformacionDe(def), accion: "revisar", confirmado: false };
  });
  return { mapeos: salida, propuestas, simulada: true };
}

/**
 * «IA» para texto libre: una persona por renglón, sin columnas («Juan Pérez López, 55 1234 5678, nació 12/03/1975, juan@correo.mx»).
 * // INTEGRACIÓN: modelo de lenguaje (P-124). SIMULACIÓN de demostración con expresiones regulares: extrae correo, teléfono y fecha,
 * y toma el resto como nombre. Devuelve una tabla normal (columnas + filas) que pasa por el MISMO mapeo, vista previa y confirmación.
 */
export function interpretarTextoLibre(texto) {
  const filas = [];
  for (const linea of String(texto ?? "").split(/\r?\n/)) {
    let resto = linea.trim();
    if (!resto) continue;
    const saca = (re) => { const m = resto.match(re); if (!m) return ""; resto = resto.replace(m[0], " "); return m[0].trim(); };
    const correo = saca(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/);
    const fecha = saca(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/);
    const telefono = saca(/(?:\+?52\s?)?(?:\d[\s.-]?){10}\b/);
    const nombre = resto.replace(/(^|[\s,;])(naci[oó]|nacimiento|tel[eé]fono|celular|tel|cel|correo|email|fecha|el)(?=[\s.:,;]|$)\.?:?/gi, " ").replace(/[,;|:()]+/g, " ").replace(/(^|\s)-+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
    filas.push({ "Nombre completo": nombre, "Teléfono": telefono, "Fecha de nacimiento": fecha, Correo: correo });
  }
  return { columnas: ["Nombre completo", "Teléfono", "Fecha de nacimiento", "Correo"], filas, simulada: true, avisos: filas.length ? ["Texto libre interpretado por la simulación de IA: revisa cada columna antes de confirmar."] : ["No se reconoció ningún renglón."] };
}

/** Cambia a mano el destino de una columna (o la descarta con campo = null). Un cambio manual cuenta como confirmado. */
export function asignarCampo(mapeos, columna, campo, tipo) {
  const def = campo ? campoDe(tipo, campo) : null;
  return mapeos.map((m) => {
    if (m.columna === columna) return def ? { ...m, campo: def.campo, confianza: 100, origen: "manual", clinico: !!def.clinico, transformacion: transformacionDe(def), accion: "aceptar", confirmado: true } : { ...m, campo: null, confianza: null, origen: "manual", clinico: false, transformacion: null, accion: "descartar", confirmado: true };
    // un campo destino solo puede venir de una columna: la anterior lo suelta
    if (def && m.campo === def.campo) return { ...m, campo: null, confianza: null, origen: null, clinico: false, transformacion: null, accion: "elegir_campo", confirmado: false };
    return m;
  });
}
/** Confirma (persona) el destino propuesto de una columna que estaba en «revisar». */
export const confirmarMapeo = (mapeos, columna) => mapeos.map((m) => (m.columna === columna && m.campo ? { ...m, accion: "aceptar", confirmado: true } : m));

/** ¿Se puede pasar a la vista previa? Bloquea si queda algo por revisar (P-123) o falta un campo obligatorio. */
export function estadoMapeo(mapeos, tipo, umbral = UMBRAL_CONFIANZA) {
  const porRevisar = mapeos.filter((m) => m.campo && !m.confirmado && (m.clinico || (m.confianza ?? 0) < umbral));
  const con = new Set(mapeos.filter((m) => m.campo).map((m) => m.campo));
  const faltan = (CAMPOS_DESTINO[tipo] || []).filter((c) => c.requerido && !con.has(c.campo)).map((c) => c.etiqueta);
  if (tipo === "pacientes" && !con.has("nombres") && !con.has("nombre_completo")) faltan.push("Nombre(s) o Nombre completo");
  const duplicados = [...con].filter((c) => mapeos.filter((m) => m.campo === c).length > 1);
  return { listo: !porRevisar.length && !faltan.length && !duplicados.length && con.size > 0, porRevisar, faltan, duplicados, sinDestino: mapeos.filter((m) => !m.campo && m.accion !== "descartar").length };
}

// ═════════════════════════ Normalización
const pad = (n) => String(n).padStart(2, "0");
/** Fecha a AAAA-MM-DD; acepta dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd y número de serie de Excel. Año de 2 dígitos: > 30 → 19xx. */
export function fechaISO(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) { const x = new Date(Math.round((+s - 25569) * 86400000)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += y > 30 ? 1900 : 2000;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
export const telefono10 = (v) => { const d = String(v ?? "").replace(/\D/g, "").replace(/^(521|52)(?=\d{10}$)/, ""); return d.length >= 10 ? d.slice(-10) : d; };
/** 10 dígitos → «55 1234 5678» (el formato que usa la app). */
export const telefonoBonito = (d10) => `${d10.slice(0, 2)} ${d10.slice(2, 6)} ${d10.slice(6)}`;
export const capitalizar = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
export function separarNombre(completo) {
  let s = String(completo ?? "").trim().replace(/\s+/g, " ");
  if (s.includes(",")) { const [ap, no] = s.split(",").map((x) => x.trim()); if (ap && no) return { nombres: capitalizar(no), apellidos: capitalizar(ap) }; s = s.replace(/,/g, " "); }
  const p = s.split(" ").filter(Boolean);
  if (p.length <= 1) return { nombres: capitalizar(p[0] || ""), apellidos: "" };
  if (p.length === 2) return { nombres: capitalizar(p[0]), apellidos: capitalizar(p[1]) };
  return { nombres: capitalizar(p.slice(0, -2).join(" ")), apellidos: capitalizar(p.slice(-2).join(" ")) };
}
// En esta app el sexo se guarda como "M" (masculino) / "F" (femenino): una «M» suelta se lee como masculino.
const SEXO = { m: "M", f: "F", mujer: "F", femenino: "F", femenina: "F", fem: "F", h: "M", hombre: "M", masculino: "M", masc: "M", varon: "M" };
export const aNumero = (v) => { if (v === null || v === undefined || String(v).trim() === "") return null; const x = Number(String(v).replace(/[$\s]|mxn/gi, "").replace(/,(?=\d{3}(\D|$))/g, "")); return Number.isFinite(x) ? x : NaN; };
const nombreCompleto = (v) => norm([v.nombres, v.apellidos].filter(Boolean).join(" "));

/** Fila cruda + mapeos → valores normalizados y mensajes [{ campo, motivo }] (dato con formato inválido: se omite y se avisa). */
export function normalizarFila(fila, mapeos, tipo) {
  const v = {}, mensajes = [];
  const ap = {};
  for (const m of mapeos) {
    if (!m.campo) continue;
    const def = campoDe(tipo, m.campo);
    const crudo = fila[m.columna];
    if (!def || crudo === null || crudo === undefined || String(crudo).trim() === "") continue;
    const x = String(crudo).trim();
    if (def.campo === "nombre_completo") { const s = separarNombre(x); if (s.nombres) v.nombres = s.nombres; if (s.apellidos) v.apellidos = s.apellidos; }
    else if (def.campo === "apellido_paterno" || def.campo === "apellido_materno") ap[def.campo] = capitalizar(x);
    else if (def.dato === "nombre") v[def.campo] = capitalizar(x);
    else if (def.dato === "fecha") { const f = fechaISO(x); if (f) v[def.campo] = f; else mensajes.push({ campo: def.campo, motivo: `Fecha no reconocida: «${x}»` }); }
    else if (def.dato === "telefono") { const t = telefono10(x); if (t.length === 10) v[def.campo] = telefonoBonito(t); else mensajes.push({ campo: def.campo, motivo: `Teléfono incompleto (se esperan 10 dígitos): «${x}»` }); }
    else if (def.dato === "correo") { const e = x.toLowerCase(); if (RE_CORREO.test(e)) v[def.campo] = e; else mensajes.push({ campo: def.campo, motivo: `Correo inválido: «${x}»` }); }
    else if (def.dato === "sexo") { const s = SEXO[norm(x)]; if (s) v.sexo = s; else mensajes.push({ campo: "sexo", motivo: `Sexo no reconocido: «${x}»` }); }
    else if (def.dato === "numero") { const n = aNumero(x); if (Number.isNaN(n)) mensajes.push({ campo: def.campo, motivo: `Número inválido: «${x}»` }); else if (n < 0) mensajes.push({ campo: def.campo, motivo: `No puede ser negativo: «${x}»` }); else v[def.campo] = n; }
    else if (def.dato === "sku") v[def.campo] = x.toUpperCase().replace(/\s+/g, "");
    else v[def.campo] = x.replace(/\s+/g, " ");
  }
  if (ap.apellido_paterno || ap.apellido_materno) v.apellidos = [ap.apellido_paterno, ap.apellido_materno].filter(Boolean).join(" ");
  if (tipo === "pacientes" && v.nacimiento && v.nacimiento > hoyISO()) { delete v.nacimiento; mensajes.push({ campo: "nacimiento", motivo: "La fecha de nacimiento está en el futuro" }); }
  return { valores: v, mensajes };
}
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ═════════════════════════ Validación y duplicados
/** Lo que ya existe, para comparar: se arma del estado sin modificarlo. */
export function contextoImportacion(d, { almacenId = null } = {}) {
  return {
    hoy: hoyISO(), almacenId,
    pacientes: (d.pacientes || []).map((p) => ({ id: p.id, folio: p.folio, clave: `${nombreCompleto(p)}|${p.nacimiento || ""}`, nombre: nombreCompleto(p), tel: telefono10(p.telefono) })),
    productos: (d.productos || []).map((p) => ({ id: p.id, sku: String(p.sku || "").toUpperCase(), nombre: norm(p.nombre), costo: p.costo })),
    servicios: (d.servicios || []).map((s) => ({ id: s.id, nombre: norm(s.nombre) })),
    almacenes: (d.almacenes || []).map((a) => ({ id: a.id, nombre: norm(a.nombre) })),
    sucursales: (d.sucursales || []).map((s) => ({ id: s.id, nombre: norm(s.nombre) })),
    planes: (d.planes || []).filter((p) => p.importado).map((p) => `${p.pacienteId}|${p.monto}|${p.creado}`),
  };
}
const REQ = "Dato obligatorio vacío";
function resolverAlmacen(ctx, texto) {
  if (!texto) return ctx.almacenId ? { id: ctx.almacenId } : { error: "Falta elegir el almacén destino" };
  const t = norm(texto);
  const a = ctx.almacenes.find((x) => norm(x.id) === t || x.nombre === t) || ctx.sucursales.find((x) => norm(x.id) === t || x.nombre === t) || ctx.almacenes.find((x) => x.nombre.endsWith(` ${t}`));
  return a ? { id: a.id } : { error: `Almacén o sucursal no encontrado: «${texto}»` };
}
function resolverPaciente(ctx, texto) {
  const t = String(texto || "").trim();
  if (/^EXP-?\d+$/i.test(t)) { const n = Number(t.replace(/\D/g, "")); const p = ctx.pacientes.find((x) => Number(String(x.folio).replace(/\D/g, "")) === n); return p ? { id: p.id } : { error: `No existe el expediente ${t.toUpperCase()}` }; }
  const s = separarNombre(t), n = norm([s.nombres, s.apellidos].filter(Boolean).join(" ")), n2 = norm(t.replace(/,/g, " "));
  const hallados = ctx.pacientes.filter((x) => x.nombre === n || x.nombre === n2);
  if (!hallados.length) return { error: `Paciente no encontrado: «${t}» (impórtalo primero o usa su folio EXP-…)` };
  if (hallados.length > 1) return { error: `Hay ${hallados.length} pacientes llamados «${t}»: usa el folio EXP-…` };
  return { id: hallados[0].id };
}

/**
 * Valida y clasifica todas las filas. Resultado por fila: "valido" | "advertencia" | "error" | "duplicado".
 * Se importan válidas y con advertencia; errores y duplicados se RECHAZAN (en conflicto gana el dato existente, P-123).
 * @returns {{ filas:[{ n, original, valores, resultado, mensajes:[{campo,motivo}], duplicadoDe }], resumen:{ total, validos, advertencias, errores, duplicados, aceptables } }}
 */
export function validarLote(filas, mapeos, tipo, ctx) {
  const activos = mapeos.filter((m) => m.campo);
  const requeridos = (CAMPOS_DESTINO[tipo] || []).filter((c) => c.requerido).map((c) => c.campo);
  const enBase = new Set(), vistos = new Map(), telBase = new Set(ctx.pacientes.map((p) => p.tel).filter((t) => t.length === 10)), telArchivo = new Map();
  if (tipo === "pacientes") ctx.pacientes.forEach((p) => enBase.add(p.clave));
  if (tipo === "productos") ctx.productos.forEach((p) => enBase.add(`sku:${p.sku}`));
  if (tipo === "servicios") ctx.servicios.forEach((s) => enBase.add(`sv:${s.nombre}`));
  if (tipo === "cartera") ctx.planes.forEach((k) => enBase.add(k));
  const nombresBase = tipo === "pacientes" ? new Map(ctx.pacientes.map((p) => [p.nombre, p])) : null;

  const out = filas.map((fila, i) => {
    const { valores: v, mensajes } = normalizarFila(fila, activos, tipo);
    const msgs = [...mensajes];
    let error = false;
    const falla = (campo, motivo) => { error = true; msgs.push({ campo, motivo }); };
    const avisa = (campo, motivo) => msgs.push({ campo, motivo });
    requeridos.forEach((r) => { if (v[r] === undefined || v[r] === "") { const ya = msgs.find((m) => m.campo === r); if (ya) error = true; else falla(r, REQ); } });
    let clave = null;
    if (tipo === "pacientes") {
      if (!v.nombres) falla("nombres", REQ);
      else if (!v.apellidos) avisa("apellidos", "Sin apellidos");
      if (!error) clave = v.nacimiento ? `${nombreCompleto(v)}|${v.nacimiento}` : null;
    } else if (tipo === "productos") {
      if (v.sku) clave = `sku:${v.sku}`;
      if (!error && v.precio === undefined) avisa("precio", "Sin precio de venta: queda en $0 hasta que se capture");
      if (!error && v.nombre && ctx.productos.some((p) => p.nombre === norm(v.nombre) && p.sku !== v.sku)) avisa("nombre", "Ya existe un producto con ese nombre y otro SKU");
    } else if (tipo === "servicios") {
      if (v.nombre) clave = `sv:${norm(v.nombre)}`;
      if (!error && v.duracion === undefined) avisa("duracion", "Sin duración: se asignan 30 minutos");
    } else if (tipo === "existencias") {
      const p = v.sku ? ctx.productos.find((x) => x.sku === v.sku) : null;
      if (v.sku && !p) falla("sku", `El SKU ${v.sku} no existe en el catálogo (importa primero los productos)`);
      if (v.cantidad !== undefined && !(v.cantidad > 0)) falla("cantidad", "La cantidad debe ser mayor a cero");
      const a = resolverAlmacen(ctx, v.almacen);
      if (a.error) falla("almacen", a.error); else v.almacenId = a.id;
      if (p) { v.productoId = p.id; if (v.costo === undefined) { v.costo = p.costo; avisa("costo", "Sin costo en el archivo: se usa el costo del catálogo"); } }
      if (!error) clave = `ex:${v.sku}|${v.almacenId}|${v.lote || ""}`;
    } else if (tipo === "cartera") {
      if (v.paciente) { const p = resolverPaciente(ctx, v.paciente); if (p.error) falla("paciente", p.error); else v.pacienteId = p.id; }
      if (v.saldo !== undefined && !(v.saldo > 0)) falla("saldo", "El saldo debe ser mayor a cero");
      if (!v.fecha) { v.fecha = ctx.hoy; if (!error) avisa("fecha", "Sin fecha del adeudo: se toma la de hoy"); }
      if (v.vence && v.vence < v.fecha) { delete v.vence; avisa("vence", "El vencimiento es anterior a la fecha del adeudo: se recalcula"); }
      if (!error) clave = `${v.pacienteId}|${v.saldo}|${v.fecha}`;
    }
    let resultado = error ? "error" : msgs.length ? "advertencia" : "valido", duplicadoDe = null;
    if (!error && clave) {
      if (enBase.has(clave)) { resultado = "duplicado"; duplicadoDe = "base"; msgs.push({ campo: null, motivo: "Duplicado: ya existe en el sistema (gana el dato existente)" }); }
      else if (vistos.has(clave)) { resultado = "duplicado"; duplicadoDe = `fila ${vistos.get(clave)}`; msgs.push({ campo: null, motivo: `Repetida en el archivo (igual a la fila ${vistos.get(clave)})` }); }
      else vistos.set(clave, i + 1);
    }
    if (tipo === "pacientes" && !error && resultado !== "duplicado") {
      const tel = v.telefono ? telefono10(v.telefono) : "";
      if (!v.nacimiento) {
        const igual = nombresBase.get(nombreCompleto(v));
        if (igual && tel && igual.tel === tel) { resultado = "duplicado"; duplicadoDe = "base"; msgs.push({ campo: null, motivo: `Duplicado: mismo nombre y teléfono que ${igual.folio}` }); }
        else { resultado = "advertencia"; msgs.push({ campo: "nacimiento", motivo: igual ? `Sin fecha de nacimiento y ya existe alguien con ese nombre (${igual.folio}): verifica que no sea la misma persona` : "Sin fecha de nacimiento: no se puede verificar duplicado" }); }
      }
      if (tel && resultado !== "duplicado") {
        if (telBase.has(tel) || telArchivo.has(tel)) { resultado = "advertencia"; msgs.push({ campo: "telefono", motivo: telBase.has(tel) ? "Teléfono ya registrado con otra persona (solo aviso)" : `Teléfono repetido en el archivo (fila ${telArchivo.get(tel)}; solo aviso)` }); }
        if (!telArchivo.has(tel)) telArchivo.set(tel, i + 1);
      }
    }
    return { n: i + 1, original: fila, valores: v, resultado, mensajes: msgs, duplicadoDe };
  });
  return { filas: out, resumen: resumirFilas(out) };
}
export function resumirFilas(filas) {
  const r = { total: filas.length, validos: 0, advertencias: 0, errores: 0, duplicados: 0, aceptables: 0 };
  for (const f of filas) {
    if (f.resultado === "valido") r.validos += 1;
    else if (f.resultado === "advertencia") r.advertencias += 1;
    else if (f.resultado === "error") r.errores += 1;
    else if (f.resultado === "duplicado") r.duplicados += 1;
  }
  r.aceptables = r.validos + r.advertencias;
  return r;
}
export const filasAceptables = (filas) => filas.filter((f) => f.resultado === "valido" || f.resultado === "advertencia");
export const filasRechazadas = (filas) => filas.filter((f) => f.resultado === "error" || f.resultado === "duplicado");
export const ETIQUETA_RESULTADO = { valido: ["Válida", "ok"], advertencia: ["Con aviso", "warn"], error: ["Error", "bad"], duplicado: ["Duplicada", "bad"] };

// ═════════════════════════ Archivos de ejemplo (para probar la importación; datos ficticios)
/**
 * CSV de ejemplo por tipo, con casos a propósito: encabezados con sinónimos y abreviaturas, una columna ambigua, comas y saltos de
 * línea entre comillas, una fecha imposible, un teléfono corto, un obligatorio vacío, un duplicado dentro del archivo y otro contra
 * lo que ya existe en el sistema.
 */
export function archivoEjemplo(tipo, d = {}) {
  const pac = d.pacientes || [], prod = d.productos || [], serv = d.servicios || [];
  if (tipo === "pacientes") {
    const ya = pac[0];
    return { nombre: "ejemplo_pacientes.csv", texto: aCSV(["Nombre del paciente", "F. Nac.", "Sexo", "Cel", "Contacto", "Direcc.", "Alergias", "Observaciones"], [
      ["Valeria Montiel Arce", "14/02/1988", "F", "55 2817 4410", "valeria.montiel@correo.example", "Av. Reforma 222, Depto. 4, Col. Juárez", "", "Prefiere citas por la tarde"],
      ["Rogelio Ibarra Quintana", "03-11-1961", "Masculino", "(55) 3390-1127", "rogelio.iq@correo.example", "Calle Sur 8 #41", "Penicilina", "Paciente \"frecuente\"; viene con su esposa"],
      ["Carmina Luján Ochoa", "1979-07-30", "mujer", "5544102298", "carmina.lujan@correo.example", "Cda. Pinos 12", "", "Nota en dos líneas:\ntrae plantillas de otro laboratorio"],
      ["Ezequiel Barragán Solís", "31/02/1990", "H", "55 1002 77", "ezequiel@correo.example", "Oriente 157 #88", "", "Fecha y teléfono con error a propósito"],
      ["", "12/05/1970", "F", "55 6120 3344", "", "", "", "Sin nombre: debe rechazarse"],
      ["Valeria Montiel Arce", "14/02/1988", "F", "55 9981 0042", "", "", "", "Repetida en el archivo"],
      ...(ya ? [[`${ya.nombres} ${ya.apellidos}`, ya.nacimiento.split("-").reverse().join("/"), ya.sexo, ya.telefono, ya.correo || "", ya.domicilio || "", "", "Ya existe en el sistema"]] : []),
      ["Ofelia Zamudio Peña", "", "F", "55 7045 1186", "ofelia.zp@correo.example", "Norte 45 #310", "Látex", "Sin fecha de nacimiento"],
    ]) };
  }
  if (tipo === "productos") {
    const ya = prod[0];
    return { nombre: "ejemplo_productos.csv", texto: aCSV(["Clave", "Descripción", "Línea", "Costo unitario", "Precio público", "Stock", "Mín."], [
      ["SEP-010", "Separador de dedos de silicón, par", "Ortesis", "38.50", "$95.00", "24", "6"],
      ["CRE-077", "Crema hidratante con urea 20 %, 120 g", "Cremas", "86", "189", "36", "8"],
      ["LIM-004", "Lima de cristal \"profesional\", 14 cm", "Higiene", "52", "129", "12", "4"],
      ["TAL-021", "Taloneras de gel, talla única", "Ortesis", "61", "", "18", "6"],
      ["", "Producto sin clave", "Higiene", "10", "25", "3", "1"],
      ["SEP-010", "Separador de dedos (repetido)", "Ortesis", "38.50", "95", "5", "2"],
      ["VEN-300", "Venda elástica 10 cm", "Curación", "abc", "49", "20", "5"],
      ...(ya ? [[ya.sku, ya.nombre, ya.categoria, String(ya.costo), String(ya.precioBase), "4", String(ya.minimo ?? 2)]] : []),
    ]) };
  }
  if (tipo === "servicios") {
    const ya = serv[0];
    return { nombre: "ejemplo_servicios.csv", texto: aCSV(["Tratamiento", "Tarifa", "Minutos"], [
      ["Reflexología podal", "480", "45"],
      ["Valoración de pie diabético, con monofilamento", "$650.00", "40"],
      ["Colocación de ortonixia", "1,250", "60"],
      ["Curación de úlcera", "", "30"],
      ["Reflexología podal", "500", "45"],
      ["Estudio de la pisada", "900", ""],
      ...(ya ? [[ya.nombre, String(ya.precioBase), String(ya.duracion)]] : []),
    ]) };
  }
  if (tipo === "existencias") {
    const s = prod.slice(0, 4);
    return { nombre: "ejemplo_existencias.csv", texto: aCSV(["Código", "Piezas", "Costo", "Sucursal", "Lote"], [
      ...s.map((p, i) => [p.sku, String(12 + i * 5), String(p.costo), i % 2 ? "Patio Valle de Chalco" : "Chalco Centro", `INI-${100 + i}`]),
      ...(s[0] ? [[s[0].sku, "3", "", "Chalco Centro", "INI-100"], [s[0].sku, "0", "", "Centenario", "INI-200"]] : []),
      ["ZZZ-999", "10", "50", "Chalco Centro", "INI-300"],
      ...(s[1] ? [[s[1].sku, "8", String(s[1].costo), "Sucursal Lunar", "INI-400"]] : []),
    ]) };
  }
  if (tipo === "cartera") {
    const s = pac.slice(3, 7);
    return { nombre: "ejemplo_saldos_cartera.csv", texto: aCSV(["Cliente", "Adeudo", "Fecha", "Vencimiento", "Detalle"], [
      ...s.map((p, i) => [i % 2 ? p.folio : `${p.nombres} ${p.apellidos}`, ["1,850.00", "$640", "2300", "975.50"][i], ["05/09/2026", "18/09/2026", "02/10/2026", ""][i], ["05/12/2026", "18/12/2026", "", ""][i], "Saldo del sistema anterior, plantillas y consulta"]),
      ...(s[0] ? [[`${s[0].nombres} ${s[0].apellidos}`, "1,850.00", "05/09/2026", "05/12/2026", "Repetido en el archivo"]] : []),
      ["Persona Que No Existe", "500", "01/10/2026", "", "Paciente no registrado"],
      ...(s[1] ? [[s[1].folio, "0", "01/10/2026", "", "Saldo en cero"]] : []),
    ]) };
  }
  return { nombre: "ejemplo.csv", texto: "" };
}
/** Texto libre de ejemplo para la simulación de IA. */
export const TEXTO_LIBRE_EJEMPLO = "Maribel Cisneros Aguirre, cel 55 4410 8822, nació 09/04/1983, maribel.ca@correo.example\nAurelio Tapia Rendón tel. 55 3021 7745 12/12/1957\nJimena Robles Gil - jimena.rg@correo.example - 55 7781 2090";
