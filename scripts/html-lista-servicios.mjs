import fs from "fs"; import QRCode from "qrcode";
const S = "C:/Users/asus/AppData/Local/Temp/claude/4125a1f408f3b12c/a25db0d4-c41e-4f7f-b1eb-519dd164bbd5/scratchpad";
const r = await fetch("https://api.supabase.com/v1/projects/esximvxedczymlueyzfb/database/query", { method: "POST", headers: { Authorization: "Bearer " + process.env.SB_TOKEN, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "select s.folio, s.nombre, s.categoria, s.tipo_precio, s.admite_caracteristicas adm, coalesce(s.codigo_barras, s.folio) cod, pieclinic.precio_vigente('servicio', s.id, null) precio from pieclinic.servicios s where s.estado='activo' order by s.categoria, s.nombre" }) });
const filas = await r.json(); if (!Array.isArray(filas)) throw new Error(JSON.stringify(filas));
const mon = n => "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const por = {}; for (const f of filas) (por[f.categoria] ??= []).push(f);
let cuerpo = "";
for (const [cat, lista] of Object.entries(por)) {
  cuerpo += `<section><h2>${cat}</h2><div class="g">`;
  for (const s of lista) {
    const qr = await QRCode.toString(s.cod, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    cuerpo += `<div class="c"><div class="t"><b>${s.nombre}</b><div class="m">${s.folio} · ${s.tipo_precio === "a_valorar" ? "a valorar" : (s.tipo_precio === "desde" ? "desde " : "") + mon(s.precio)}${s.adm ? " · con adaptaciones" : ""}</div><svg class="b" data-c="${s.cod}"></svg></div><div class="q">${qr}</div></div>`;
  }
  cuerpo += "</div></section>";
}
const js = fs.readFileSync("node_modules/jsbarcode/dist/JsBarcode.all.min.js", "utf8");
const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
fs.writeFileSync(S + "/servicios.html", `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Lista de servicios con códigos</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px/1.35 Arial,Helvetica,sans-serif;color:#000;margin:0}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #7B5EA7;padding-bottom:6px;margin-bottom:10px}
header h1{margin:0;font-size:19px;color:#5b4380}header span{color:#555;font-size:11px}
h2{font-size:14px;margin:12px 0 6px;color:#5b4380}.g{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.c{border:1px solid #aaa;border-radius:6px;padding:8px;display:flex;gap:8px;align-items:center;break-inside:avoid}.t{flex:1;min-width:0}.m{color:#444;font-size:10.5px;margin:2px 0 4px}
.q svg{width:78px;height:78px;display:block}.b{max-width:100%}.nota{margin-top:14px;font-size:10.5px;color:#555}section{break-inside:auto}</style></head><body>
<header><div><h1>Pie Clinic · Lista de servicios con códigos</h1><span>Escanea el código de barras o el QR en Caja y el servicio entra con su precio</span></div><span>${fecha}</span></header>
${cuerpo}<p class="nota">Los precios son de arranque y están por confirmar con los dueños. El código es el folio del servicio; también puede teclearse en Caja.</p>
<script>${js}</script><script>document.querySelectorAll('svg.b').forEach(function(s){JsBarcode(s,s.dataset.c,{format:'CODE128',height:42,width:1.5,fontSize:11,margin:0,displayValue:true})})</script></body></html>`);
console.log("servicios:", filas.length);
