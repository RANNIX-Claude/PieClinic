// Exporta todo el data warehouse (vistas piefirme.dw_*) a CSV + esquema.json, listo para conectar herramientas de BI.
//
//   node scripts/exportar-dw.mjs qa [carpeta]      (por omisión: ./exportacion_dw/<ambiente>-AAAA-MM-DD)
//
// Usa la service_role del SERVIDOR (jamás llega al navegador). Las vistas dw_* piden es_admin(), que con service_role (auth.uid() nulo) no
// pasa; por eso se consulta por la API de administración de Supabase (SQL directo como propietario). Producción: solo lectura, libre.
import fs from "fs";
import path from "path";
import { ambiente, posicionales, hoy, ROOT } from "./lib/env.mjs";

const [amb, destino] = posicionales();
if (!amb) { console.error("uso: node scripts/exportar-dw.mjs qa|prod [carpeta]"); process.exit(2); }
const cfg = ambiente(amb, { exigirBD: false });
const token = cfg.env.SUPABASE_ACCESS_TOKEN;
if (!token || !cfg.ref) { console.error("Faltan SUPABASE_ACCESS_TOKEN y la referencia del proyecto en .env.local"); process.exit(2); }
const carpeta = path.resolve(ROOT, destino ?? path.join("exportacion_dw", `${amb}-${hoy()}`));
fs.mkdirSync(carpeta, { recursive: true });

const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${cfg.ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const celda = (v) => { if (v == null) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Como propietario no hay sesión: se reemplaza es_admin() por verdadero SOLO dentro de esta transacción de lectura.
const prefijo = `set local role postgres; select set_config('request.jwt.claims', json_build_object('sub', (select id::text from piefirme.perfiles where rol = 'administrador' and activo order by created_at limit 1), 'role', 'authenticated')::text, true); set local role authenticated;`;
const objetos = await sql(`${prefijo} select objeto, tipo, grano, descripcion, llaves from piefirme.dw_catalogo order by tipo, objeto`);
const metricas = await sql(`${prefijo} select * from piefirme.dw_metricas`);
const esquema = [];
for (const o of objetos) {
  const filas = await sql(`${prefijo} select * from piefirme.${o.objeto}`);
  const cols = filas[0] ? Object.keys(filas[0]) : [];
  fs.writeFileSync(path.join(carpeta, `${o.objeto}.csv`), "﻿" + (cols.length ? [cols.join(","), ...filas.map((f) => cols.map((c) => celda(f[c])).join(","))].join("\r\n") : ""));
  esquema.push({ ...o, filas: filas.length, columnas: cols });
  console.log(`${o.objeto.padEnd(26)} ${String(filas.length).padStart(7)} filas`);
}
fs.writeFileSync(path.join(carpeta, "esquema.json"), JSON.stringify({ generado_en: new Date().toISOString(), ambiente: amb, zona_horaria: "America/Mexico_City", objetos: esquema, metricas }, null, 2));
console.log(`\nListo → ${carpeta}`);
