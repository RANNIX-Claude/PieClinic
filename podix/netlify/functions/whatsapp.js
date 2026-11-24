// WhatsApp Cloud API (Meta) para la demo de Pie Clinic. UNA sola función con tres rutas (comparten memoria mientras la instancia siga viva):
//   POST /.netlify/functions/whatsapp/enviar   { evento, texto, boton?: { id, titulo } }  → manda el mensaje a WA_DESTINATARIOS
//   GET|POST /.netlify/functions/whatsapp/webhook                                           → verificación de Meta y respuestas («Recibido», «faltaron 2»)
//   GET  /.netlify/functions/whatsapp/eventos                                               → la app lee (y vacía) las respuestas pendientes y actualiza el inventario
// Eventos: compra | envio | recibido | falta | minimo. Las credenciales viven SOLO en variables de entorno de Netlify (ver docs/WHATSAPP_REAL.md).
// LÍMITE CONOCIDO: la cola de respuestas está en memoria de la función (se pierde si Netlify reinicia la instancia). Para producción usar Netlify Blobs o la base.
import crypto from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";
const env = (k) => process.env[k] || "";
const cola = (globalThis.__pcEventos ||= []);          // [{ accion, traspasoId, faltantes, de, ts }]
const ultimoEnvio = (globalThis.__pcUltimoEnvio ||= {}); // número → traspasoId del último envío con botón

const json = (status, cuerpo) => ({ statusCode: status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(cuerpo) });
const destinatarios = () => env("WA_DESTINATARIOS").split(",").map((x) => x.trim().replace(/\D/g, "")).filter(Boolean);

async function graph(cuerpo) {
  const r = await fetch(`${GRAPH}/${env("WA_PHONE_ID")}/messages`, { method: "POST", headers: { Authorization: `Bearer ${env("WA_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

async function enviar(body) {
  if (!env("WA_TOKEN") || !env("WA_PHONE_ID")) return json(503, { ok: false, error: "Faltan WA_TOKEN y WA_PHONE_ID en las variables de entorno." });
  const para = destinatarios();
  if (!para.length) return json(503, { ok: false, error: "Falta WA_DESTINATARIOS (números registrados en la lista de prueba de Meta)." });
  const { evento = "aviso", texto = "", boton = null } = body || {};
  const salida = [];
  for (const to of para) {
    const cuerpo = boton
      ? { to, type: "interactive", interactive: { type: "button", body: { text: texto.slice(0, 1000) }, action: { buttons: [{ type: "reply", reply: { id: String(boton.id).slice(0, 256), title: String(boton.titulo || "Recibido").slice(0, 20) } }] } } }
      : { to, type: "text", text: { body: texto.slice(0, 1000) } };
    let r = await graph(cuerpo);
    // Fuera de la ventana de 24 h el texto libre se rechaza (131047): se manda la plantilla de prueba hello_world para abrir la conversación.
    if (!r.ok && [131047, 131026].includes(r.j?.error?.code)) r = await graph({ to, type: "template", template: { name: "hello_world", language: { code: "en_US" } } });
    if (r.ok && boton && String(boton.id).startsWith("recibido:")) ultimoEnvio[to] = String(boton.id).split(":")[1];
    salida.push({ to: `…${to.slice(-4)}`, ok: r.ok, estado: r.status, error: r.ok ? undefined : r.j?.error?.message });
  }
  return json(200, { ok: salida.some((x) => x.ok), evento, enviados: salida });
}

function firmaValida(event) {
  const secreto = env("WA_APP_SECRET");
  if (!secreto) return true;                                    // sin secreto configurado no se valida (solo pruebas)
  const dado = (event.headers["x-hub-signature-256"] || "").replace("sha256=", "");
  const esperado = crypto.createHmac("sha256", secreto).update(event.body || "").digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(dado, "hex"), Buffer.from(esperado, "hex")); } catch { return false; }
}

function webhook(event) {
  if (event.httpMethod === "GET") {                             // verificación de Meta al registrar el webhook
    const q = event.queryStringParameters || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === env("WA_VERIFY_TOKEN") && env("WA_VERIFY_TOKEN")) return { statusCode: 200, body: q["hub.challenge"] };
    return { statusCode: 403, body: "Token de verificación incorrecto" };
  }
  if (!firmaValida(event)) return { statusCode: 401, body: "Firma inválida" };
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "JSON inválido" }; }
  for (const entrada of b.entry || []) for (const cambio of entrada.changes || []) for (const m of cambio.value?.messages || []) {
    const de = m.from;
    const idBoton = m.interactive?.button_reply?.id || m.button?.payload || "";
    if (idBoton.startsWith("recibido:")) cola.push({ accion: "recibido", traspasoId: idBoton.split(":")[1], faltantes: 0, de, ts: Date.now() });
    else if (m.type === "text") {
      const f = /falt\w*\s+(\d+)/i.exec(m.text?.body || "");
      if (f && ultimoEnvio[de]) cola.push({ accion: "recibido", traspasoId: ultimoEnvio[de], faltantes: Number(f[1]), de, ts: Date.now() });
    }
  }
  return { statusCode: 200, body: "ok" };                       // Meta exige 200 rápido
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  const ruta = (event.path || "").split("/").pop();
  if (ruta === "webhook") return webhook(event);
  if (ruta === "eventos") return json(200, { eventos: cola.splice(0, cola.length) });
  if (ruta === "enviar" && event.httpMethod === "POST") { let b = {}; try { b = JSON.parse(event.body || "{}"); } catch { /* cuerpo vacío */ } return enviar(b); }
  return json(404, { ok: false, error: "Ruta no encontrada" });
};
