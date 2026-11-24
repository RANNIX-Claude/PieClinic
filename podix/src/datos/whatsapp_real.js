// WhatsApp REAL (Meta Cloud API) para la demo de Pie Clinic. Apagado por defecto: la demo funciona sin internet con el celular simulado.
// Se activa con VITE_WHATSAPP_REAL=1 (y las variables del servidor de docs/WHATSAPP_REAL.md). Si la red falla, la demo sigue sin avisar al usuario.
const BASE = (import.meta.env && import.meta.env.VITE_WA_FUNCION) || "/.netlify/functions/whatsapp";
export const WA_REAL = !!(import.meta.env && import.meta.env.VITE_WHATSAPP_REAL === "1");

/** Manda el mismo mensaje que se ve en el celular simulado. `boton` agrega el botón «Recibido» (respuesta que llega por webhook). */
export function enviarReal(evento, texto, boton = null) {
  if (!WA_REAL || typeof fetch === "undefined") return;
  fetch(`${BASE}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evento, texto, boton }) }).catch(() => { /* sin red: la simulación sigue */ });
}
/** Respuestas pendientes de los destinatarios («Recibido», «faltaron 2»), ya vaciadas del servidor. */
export async function leerEventos() {
  if (!WA_REAL) return [];
  try { const r = await fetch(`${BASE}/eventos`); const j = await r.json(); return j.eventos || []; } catch { return []; }
}
