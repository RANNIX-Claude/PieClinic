// Utilidades de navegador del dominio «finanzas» (descarga de archivos, formatos, imagen de ejemplo).
import { dinero } from "../../lib/format.js";

/** Descarga un texto como archivo (CSV con BOM ya incluido por aCSV). */
export function descargar(nombre, texto, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export const pct = (x, dec = 1) => `${((Number(x) || 0) * 100).toFixed(dec)} %`;
export const monto = (n) => dinero(Math.round((Number(n) || 0) * 100) / 100);
/** Importe con signo de variación: "+$1,200" / "-$300". */
export const variacion = (n) => (n > 0 ? "+" : n < 0 ? "" : "") + dinero(Math.round(n));
/** Foto de nota de ejemplo (para la demostración cuando no hay una foto a la mano). Devuelve dataURL JPEG pequeña. */
export function fotoEjemplo() {
  const c = document.createElement("canvas"); c.width = 420; c.height = 560;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#222"; g.font = "bold 22px sans-serif"; g.fillText("NOTA DE REMISION (ejemplo)", 24, 48);
  g.font = "15px sans-serif";
  for (let i = 0; i < 12; i++) { g.fillStyle = "#bbb"; g.fillRect(24, 90 + i * 34, 372 - (i % 3) * 40, 3); g.fillStyle = "#666"; g.fillText(`Partida ${i + 1}  ........  ${(i * 37 + new Date().getMinutes()) % 90}`, 24, 84 + i * 34); }
  g.fillStyle = "#222"; g.fillText(new Date().toLocaleString("es-MX"), 24, 530);
  return c.toDataURL("image/jpeg", 0.6);
}
