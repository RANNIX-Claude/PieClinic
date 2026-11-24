// Capa de datos · punto de entrada liviano (no carga Supabase: eso lo hace cliente.js con import() dinámico).
//   origenDe("rh.empleados") → "qa" | "demo"   (¿de dónde salen hoy los datos de esa colección?)
import { getState } from "../store/core.js";
import { origenEn, tablaOrigen, MODO, ETIQUETA_MODO, CATALOGO } from "./catalogo.js";

export { MODO, ETIQUETA_MODO, CATALOGO, tablaOrigen, origenEn };

/** "qa" si la colección se hidrató de la base QA en esta sesión; "demo" en cualquier otro caso (incluye las que quedan vacías a propósito). */
export function origenDe(coleccion, d = getState()) {
  return origenEn(d, coleccion) === "qa" ? "qa" : "demo";
}
