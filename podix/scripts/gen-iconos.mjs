// Genera, sin dependencias, los íconos PNG (180/192/512) y el manifiesto de cada rol → public/.
// Una puerta instalable por rol; el ícono NO otorga el rol (lo da la cuenta).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROLES = {
  recepcion: ["Recepción", "#7b5ea7"], podologo: ["Podólogo", "#0f766e"], asistente: ["Asistente", "#0369a1"], cajero: ["Cajero", "#b45309"],
  almacen: ["Almacén", "#4d7c0f"], gerente: ["Gerente", "#6d28d9"], admin: ["Administración", "#be185d"],
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const t = Buffer.from(tipo); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([len, t, datos, crc]);
}
function png(S, color) {
  const [R, G, B] = hex(color);
  const raw = Buffer.alloc((S * 4 + 1) * S);
  // línea de pulso (latido): puntos en coordenadas 0..1
  const pts = [[0.16, 0.52], [0.34, 0.52], [0.42, 0.3], [0.54, 0.74], [0.62, 0.52], [0.84, 0.52]].map(([x, y]) => [x * S, y * S]);
  const grosor = S * 0.055, rad = S * 0.22;
  const dist = (px, py, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  };
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      const o = y * (S * 4 + 1) + 1 + x * 4;
      // esquinas redondeadas
      const cx = Math.min(Math.max(x, rad), S - rad), cy = Math.min(Math.max(y, rad), S - rad);
      const dentro = Math.hypot(x - cx, y - cy) <= rad;
      let d = 99; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, dist(x, y, pts[i], pts[i + 1]));
      const linea = d < grosor;
      raw[o] = linea ? 255 : R; raw[o + 1] = linea ? 255 : G; raw[o + 2] = linea ? 255 : B; raw[o + 3] = dentro ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const icons = path.join(RAIZ, "public", "icons");
fs.mkdirSync(icons, { recursive: true });
for (const [rol, [nombre, color]] of Object.entries(ROLES)) {
  for (const S of [180, 192, 512]) fs.writeFileSync(path.join(icons, `${rol}-${S}.png`), png(S, color));
  fs.writeFileSync(path.join(RAIZ, "public", `manifest-${rol}.webmanifest`), JSON.stringify({
    name: `Podología · ${nombre}`, short_name: `Podo ${nombre}`.slice(0, 14), lang: "es", display: "standalone",
    start_url: `/app/${rol}.html`, scope: "/app/", theme_color: color, background_color: "#f4f5f9",
    icons: [{ src: `/app/icons/${rol}-192.png`, sizes: "192x192", type: "image/png" }, { src: `/app/icons/${rol}-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" }],
  }, null, 2));
}
fs.writeFileSync(path.join(RAIZ, "public", "manifest.webmanifest"), JSON.stringify({
  name: "Pie Clinic", short_name: "Pie Clinic", lang: "es", display: "standalone", start_url: "/app/", scope: "/app/",
  theme_color: "#7b5ea7", background_color: "#f4f5f9", icons: [{ src: "/app/icons/recepcion-192.png", sizes: "192x192", type: "image/png" }, { src: "/app/icons/recepcion-512.png", sizes: "512x512", type: "image/png" }],
}, null, 2));

// Puertas HTML por rol (una por ícono instalable). Comparten un solo bundle.
const html = (rol, nombre, color) => `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Podología · ${nombre}</title>
  <meta name="theme-color" content="${color}" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Podo ${nombre}" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="/app/manifest-${rol}.webmanifest" />
  <link rel="apple-touch-icon" href="/app/icons/${rol}-180.png" />
  <link rel="icon" type="image/png" href="/app/icons/${rol}-192.png" />
  <script>window.__ROL__ = "${rol}";</script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`;
for (const [rol, [nombre, color]] of Object.entries(ROLES)) fs.writeFileSync(path.join(RAIZ, `${rol}.html`), html(rol, nombre, color));
const idx = html("recepcion", "Clínicas", "#7b5ea7").replace('window.__ROL__ = "recepcion";', "window.__ROL__ = null;").replace("manifest-recepcion", "manifest").replace("Podo Clínicas", "Podología");
fs.writeFileSync(path.join(RAIZ, "index.html"), idx);

// Service worker: solo el armazón estático de la app. NUNCA respuestas de datos ni peticiones con credenciales.
fs.writeFileSync(path.join(RAIZ, "public", "sw.js"), `const V = "podo-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || !u.pathname.startsWith("/app/") || r.headers.has("authorization")) return;
  if (!/\\.(js|css|png|svg|woff2?)$/.test(u.pathname) && !u.pathname.endsWith(".html") && !u.pathname.endsWith("/")) return;
  e.respondWith(fetch(r).then((res) => { const c = res.clone(); caches.open(V).then((k) => k.put(r, c)); return res; }).catch(() => caches.match(r)));
});
`);
console.log("Íconos, manifiestos, puertas por rol y service worker generados.");
