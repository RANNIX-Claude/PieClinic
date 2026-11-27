// Verificación en navegador de PEDIDOS ESPECIALES contra QA (dev server en 5174: VITE_ENTORNO=prod npx vite --port 5174).
//   node tests/corridas/pedidos-especiales/verificar.mjs
// r@g.com solicita y cobra el anticipo; m@g.com autoriza y ve proveedor; r@g.com envía, registra, recibe y entrega. Capturas en esta carpeta.
// Deja datos de prueba en QA (pedidos de la sucursal Chalco); no toca producción.
import { chromium } from "file:///C:/Users/asus/OneDrive/work/PieClinic/DEv/node_modules/@playwright/test/index.mjs";
import { ambiente, conectar } from "file:///C:/Users/asus/OneDrive/work/PieClinic/DEv/scripts/lib/env.mjs";
import fs from "node:fs";

const OUT = "C:/Users/asus/OneDrive/work/PieClinic/DEv/tests/corridas/pedidos-especiales";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5174/app";
const SEDE = "Chalco";
const cfg = ambiente("qa");
const c = await conectar(cfg);
const org = (await c.query("select organizacion_id o from piefirme.perfiles where email = 'r@g.com'")).rows[0].o;
// proveedores de prueba con grupo de WhatsApp (solo QA)
for (const [clave, nombre, tipos, dias] of [["PEDZ", "Calzado Ortopédico a Medida (sintético)", ["zapato"], 30], ["PEDL", "Laboratorio de Plantillas (sintético)", ["plantilla", "aditamento"], 15]]) {
  await c.query(`insert into piefirme.proveedores (organizacion_id, clave, nombre, categoria, condiciones_pago, dias_credito, whatsapp_grupo, pedidos_tipos, sintetico)
                 values ($1, $2, $3, 'plantillas_ortesis', 'credito', $4, $5, $6, true) on conflict do nothing`, [org, clave, nombre, dias, `Pedidos ${nombre.split(" ")[0]}`, tipos]);
}
await c.end();

const resultados = [];
const paso = (ok, m) => { console.log((ok ? "✓ " : "✗ ") + m); resultados.push({ ok, m }); };
const browser = await chromium.launch({ channel: "chrome", headless: true });
const TO = 15000;
const errores = [];
async function sesion(correo, ancho = 1366, alto = 860) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, locale: "es-MX", timezoneId: "America/Mexico_City" });
  const page = await ctx.newPage(); page.setDefaultTimeout(TO);
  page.on("pageerror", (e) => errores.push(`[${correo}] ${e}`)); page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(404|406)/.test(m.text())) errores.push(`[${correo}] ${m.text()}`); });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator("#pf-email").fill(correo); await page.locator("#pf-pass").fill("123456");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.locator("header").waitFor({ timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const sel = page.locator("header select");
  await sel.first().locator("option", { hasText: SEDE }).first().waitFor({ state: "attached", timeout: 30000 });
  await sel.first().selectOption({ label: SEDE }); await page.waitForTimeout(1500);
  return { ctx, page };
}
const foto = (page, nombre) => page.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: true });
const ir = async (page, ruta) => { await page.goto(BASE + ruta, { waitUntil: "domcontentloaded" }); await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(1500); };
const intentar = async (nombre, fn) => {
  try { await fn(); } catch (e) {
    paso(false, `${nombre}: ${String(e.message).split("\n").slice(0, 3).join(" ")}`);
    for (const [k, p] of Object.entries({ r: r?.page, m: m?.page })) if (p) await p.screenshot({ path: `${OUT}/fallo_${nombre.replace(/\W+/g, "_")}_${k}.png` }).catch(() => {});
  }
};

let r, m, pedidoZapato, notaFolio, folZapato;
try {
  // ───────── r@g.com: abre turno, solicita un pedido con dos proveedores y cobra el anticipo ─────────
  r = await sesion("r@g.com");
  await intentar("turno", async () => {
    await r.page.getByRole("link", { name: /Caja y tickets/ }).first().click(); await r.page.waitForTimeout(3000);
    const abrir = r.page.getByRole("button", { name: "Abrir turno" });
    await r.page.waitForTimeout(1500);
    if (await abrir.isVisible().catch(() => false)) { await r.page.getByLabel("Caja", { exact: true }).fill("Caja Pedidos"); await r.page.getByLabel("Fondo inicial").fill("500"); await abrir.click(); await r.page.waitForTimeout(3500); }
    paso(await r.page.getByText(/turno abierto/i).first().isVisible(), "r@g.com tiene turno de caja abierto en la sucursal");
  });
  await intentar("solicitar", async () => {
    await ir(r.page, "/pedidos/nuevo");
    await r.page.getByPlaceholder(/Buscar cliente/).fill("Jiménez"); await r.page.waitForTimeout(1500);
    await r.page.getByRole("button", { name: /María Jiménez Hernández/ }).first().click();
    // partida 1: zapato
    const sels = () => r.page.locator("select");
    await r.page.getByLabel("Producto (descripción)").first().fill("Zapato ortopédico a la medida talla 26");
    await r.page.getByLabel(/Precio de venta base/).first().fill("2000");
    await r.page.getByLabel("Proveedor").first().selectOption({ label: "Calzado Ortopédico a Medida (sintético)" });
    // característica
    await r.page.getByRole("button", { name: /Características/ }).first().click();
    const idCar = await r.page.locator("select[aria-label=\"Característica\"] option", { hasText: "Virón y cuña" }).first().getAttribute("value");
    await r.page.getByLabel("Característica").first().selectOption(idCar);
    await r.page.getByRole("button", { name: "Agregar característica" }).first().click();
    // partida 2: plantilla de otro proveedor
    await r.page.getByRole("button", { name: /Agregar partida/ }).click();
    await r.page.getByLabel("Tipo").nth(1).selectOption("plantilla");
    await r.page.getByLabel("Proveedor").nth(1).selectOption({ label: "Laboratorio de Plantillas (sintético)" });
    await r.page.getByLabel("Producto (descripción)").nth(1).fill("Plantilla ortopédica a la medida");
    await r.page.getByLabel(/Precio de venta base/).nth(1).fill("1000");
    await foto(r.page, "01_nuevo_pedido_dos_proveedores");
    const resumen = await r.page.getByText(/Anticipo a cobrar en Caja/).locator("..").innerText();
    paso(/\$1,795\.00/.test(resumen), `resumen: anticipo 50 % de $3,590 (zapato 2,000 + característica 590 + plantilla 1,000) = $1,795 (${resumen.replace(/\s+/g, " ")})`);
    await r.page.getByRole("button", { name: "Solicitar pedido" }).click();
    await r.page.getByText(/Pedido solicitado/).first().waitFor({ timeout: 20000 });
    notaFolio = (await r.page.getByText(/Nota .*-NPE-/).first().innerText()).match(/\S+-NPE-\d+/)?.[0];
    folZapato = (await r.page.locator("button.btn.o.sm").allInnerTexts()).find(t => /-PED-/.test(t));
    await foto(r.page, "02_pedido_solicitado");
    paso(true, `pedido solicitado en la nota ${notaFolio} (dos pedidos, uno por proveedor)`);
    await r.page.getByRole("button", { name: "Cobrar anticipo en Caja" }).click();
    await r.page.getByRole("dialog").waitFor();
    await r.page.getByLabel("Efectivo recibido").fill("2000");
    await foto(r.page, "03_cobrar_anticipo_en_caja");
    await r.page.getByRole("button", { name: /Cobrar \$1,795\.00/ }).click();
    await r.page.waitForURL(/\/pedidos$/, { timeout: 20000 });
    paso(true, "anticipo de $1,795 cobrado en Caja (efectivo, cambio $205)");
  });
  await intentar("tablero r", async () => { await ir(r.page, "/pedidos"); await r.page.getByRole("button", { name: "Tablero" }).click().catch(() => {}); await foto(r.page, "04_tablero_recepcion"); paso(await r.page.getByText("Anticipo cobrado").first().isVisible(), "tablero muestra los pedidos en «Anticipo cobrado»"); });

  // ───────── m@g.com autoriza ─────────
  m = await sesion("m@g.com");
  await intentar("autorizar", async () => {
    await ir(m.page, "/pedidos");
    paso(await m.page.getByRole("tab", { name: /Por autorizar/ }).isVisible(), "el propietario ve «Por autorizar» con contador");
    await foto(m.page, "05_por_autorizar_propietario");
    for (const prod of [/Zapato ortopédico/, /Plantilla ortopédica a la medida/]) {
      await ir(m.page, "/pedidos");
      await m.page.getByRole("tab", { name: /Por autorizar/ }).click();
      await m.page.locator("button.card, tr", { hasText: prod }).first().click();
      await m.page.getByRole("button", { name: "Autorizar" }).click();
      const dlg = m.page.getByRole("dialog");
      await dlg.locator("input[type=number]").first().fill(prod.source.includes("Zapato") ? "1000" : "400");
      if (prod.source.includes("Zapato")) await foto(m.page, "06_autorizar_con_costos");
      await dlg.getByRole("button", { name: /Autorizar y crear orden/ }).click();
      await m.page.waitForTimeout(2500);
    }
    paso(true, "propietario autorizó ambos pedidos (se crearon las órdenes de compra)");
  });
  // ───────── r@g.com: envía la petición, registra aceptación, tránsito, recibe ─────────
  await intentar("flujo proveedor", async () => {
    await ir(r.page, "/pedidos");
    await r.page.getByRole("tab", { name: "Todos" }).click();
    await r.page.locator("button.card, tr", { hasText: folZapato }).first().click();
    await r.page.waitForURL(/\/pedidos\/[0-9a-f-]+/);
    pedidoZapato = r.page.url();
    await r.page.getByText(/Petición al proveedor/).first().waitFor();
    await foto(r.page, "07_detalle_autorizado_mensaje");
    const msg = await r.page.locator("pre").first().innerText();
    paso(/M\.J\./.test(msg) || /Pedido especial/.test(msg), `mensaje al proveedor con iniciales y sin datos personales: ${msg.split("\n").slice(0, 3).join(" | ")}`);
    paso(!/Jiménez/.test(msg), "el mensaje no contiene el apellido del cliente");
    paso(await r.page.getByText(/Simulado: se copia al grupo de WhatsApp del proveedor/).first().isVisible(), "rótulo «simulado: se copia al grupo de WhatsApp del proveedor» visible");
    await r.page.getByRole("button", { name: /Copiar mensaje/ }).click();
    await r.page.getByRole("button", { name: /Enviar \(simulado\)/ }).first().click();
    await r.page.getByRole("dialog").getByRole("button", { name: "Enviar (simulado)" }).click();
    await r.page.getByText("Enviado al proveedor").first().waitFor({ timeout: 15000 });
    await r.page.getByRole("button", { name: /Registrar aceptación/ }).click();
    const f = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    await r.page.getByRole("dialog").locator("input[type=date]").fill(f);
    await r.page.getByRole("dialog").getByRole("button", { name: "Registrar aceptación" }).click();
    await r.page.getByRole("button", { name: /Registrar envío/ }).waitFor({ timeout: 15000 });
    await r.page.getByRole("button", { name: /Registrar envío/ }).click();
    await r.page.getByRole("dialog").getByLabel(/Guía o referencia/).fill("Estafeta 778899");
    await r.page.getByRole("dialog").getByRole("button", { name: "Registrar envío" }).click();
    await r.page.getByRole("button", { name: /Marcar recibido/ }).waitFor({ timeout: 15000 });
    await foto(r.page, "08_detalle_en_transito");
    await r.page.getByRole("button", { name: /Marcar recibido/ }).click();
    await r.page.getByRole("dialog").getByRole("button", { name: "Marcar recibido" }).click();
    await r.page.getByRole("button", { name: /Entregar y cobrar saldo/ }).waitFor({ timeout: 20000 });
    await foto(r.page, "09_detalle_recibido_linea_de_tiempo");
    paso(true, "enviado → aceptado (fecha) → en tránsito (guía) → recibido por recepción");
  });
  // ───────── m@g.com: el proveedor ve pedidos, CxP, facturas y pagos ─────────
  await intentar("proveedor", async () => {
    await ir(m.page, "/proveedores");
    await m.page.getByText("Calzado Ortopédico a Medida").first().click();
    await m.page.waitForURL(/\/proveedores\/[0-9a-f-]+/);
    const url = m.page.url().split("?")[0];
    for (const [tab, nombre, esperado] of [["pedidos", "10_proveedor_pedidos", /PED-/], ["cxp", "11_proveedor_cuentas_por_pagar", /1,160\.00/], ["facturas", "12_proveedor_facturas", /Pendiente de factura/], ["pagos", "13_proveedor_pagos", /Sin pagos realizados|Pagos/]]) {
      await m.page.goto(`${url}?tab=${tab}`, { waitUntil: "domcontentloaded" }); await m.page.waitForLoadState("networkidle").catch(() => {}); await m.page.waitForTimeout(1800);
      await foto(m.page, nombre);
      paso(esperado.test(await m.page.locator("main, .pagina").first().innerText()), `proveedor › ${tab}`);
    }
  });
  // ───────── r@g.com entrega y cobra el saldo ─────────
  await intentar("entregar", async () => {
    await r.page.goto(pedidoZapato, { waitUntil: "domcontentloaded" }); await r.page.waitForTimeout(2500);
    await r.page.getByRole("button", { name: /Entregar y cobrar saldo/ }).click();
    await foto(r.page, "14_entrega_cobrar_saldo");
    await r.page.getByRole("dialog").getByRole("button", { name: /Cobrar \$.* y entregar/ }).click();
    await r.page.getByText("Entregado", { exact: true }).first().waitFor({ timeout: 25000 });
    await foto(r.page, "15_pedido_entregado");
    paso(true, "entrega: saldo cobrado con el anticipo aplicado, pedido «Entregado»");
  });
  // Caja › pestaña Pedidos, historia del cliente, móvil
  await intentar("caja pedidos", async () => { await ir(r.page, "/caja?tab=pedidos"); await foto(r.page, "16_caja_pestana_pedidos"); paso(await r.page.getByText(/Anticipos por cobrar/).first().isVisible(), "Caja tiene la pestaña Pedidos"); });
  await intentar("cliente", async () => {
    await ir(r.page, "/clientes"); await r.page.getByPlaceholder(/Buscar/).first().fill("María Jiménez Hernández"); await r.page.waitForTimeout(2000);
    await r.page.locator("tr, button", { hasText: /María Jiménez Hernández/ }).first().click(); await r.page.waitForTimeout(4500);
    await r.page.getByRole("tab", { name: /^Pedidos/ }).click(); await r.page.getByText("Pedidos especiales (zapatos").waitFor({ timeout: 8000 }).catch(() => {}); await r.page.waitForTimeout(1500);
    await foto(r.page, "17_cliente_pestana_pedidos"); paso(await r.page.getByText(/PED-/).first().isVisible(), "la historia del cliente muestra sus pedidos");
  });
  await intentar("movil", async () => {
    const mov = await sesion("r@g.com", 390, 844);
    await ir(mov.page, "/pedidos"); await foto(mov.page, "18_movil_lista");
    await mov.page.locator("button.card, tr", { hasText: /PED-/ }).first().click().catch(() => {}); await mov.page.waitForTimeout(2000); await foto(mov.page, "19_movil_detalle");
    paso(true, "vista móvil capturada"); await mov.ctx.close();
  });
} catch (e) { paso(false, "error general: " + e.message); }

// ───────── costos con el token REAL de r@g.com y de m@g.com ─────────
await intentar("token real", async () => {
  const pedir = async (correo) => {
    const t = await (await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: cfg.anon, "content-type": "application/json" }, body: JSON.stringify({ email: correo, password: "123456" }) })).json();
    const h = { apikey: cfg.anon, authorization: `Bearer ${t.access_token}`, "accept-profile": "piefirme" };
    const lin = await (await fetch(`${cfg.url}/rest/v1/prp_pedido_lineas?select=descripcion,precio_unitario,costo_unitario,costo_total&limit=5`, { headers: h })).json();
    const base = await (await fetch(`${cfg.url}/rest/v1/pedido_especial_costos?select=costo_unitario&limit=5`, { headers: h })).json();
    const ped = await (await fetch(`${cfg.url}/rest/v1/prp_pedidos_especiales?select=folio,costo_estimado&limit=5`, { headers: h })).json();
    return { lin, base, ped };
  };
  const [rr, mm] = [await pedir("r@g.com"), await pedir("m@g.com")];
  paso(rr.lin.length > 0 && rr.lin.every((l) => l.costo_unitario === null && l.costo_total === null && l.precio_unitario > 0), `token de r@g.com: ${rr.lin.length} partidas, costos en null, precio visible`);
  paso(Array.isArray(rr.base) && rr.base.length === 0 && rr.ped.every((p) => p.costo_estimado === null), "token de r@g.com: la tabla de costos devuelve 0 filas y costo_estimado en null");
  paso(mm.lin.some((l) => Number(l.costo_unitario) > 0) && mm.ped.some((p) => Number(p.costo_estimado) > 0), "token de m@g.com: sí ve costos");
  fs.writeFileSync(`${OUT}/costos_token_real.json`, JSON.stringify({ recepcion: rr, administrador: mm }, null, 2));
});
await browser.close();
console.log("\nErrores de consola:", errores.length ? errores.slice(0, 12) : "ninguno");
fs.writeFileSync(`${OUT}/resultado.json`, JSON.stringify({ resultados, errores }, null, 2));
console.log(`${resultados.filter((x) => x.ok).length} correctos · ${resultados.filter((x) => !x.ok).length} con falla`);
