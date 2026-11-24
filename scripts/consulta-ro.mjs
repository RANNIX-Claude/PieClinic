// Consulta de SOLO LECTURA a cualquier ambiente (lectura en producción: libre).
//
//   node scripts/consulta-ro.mjs qa   "select count(*) from piefirme.pacientes"
//   node scripts/consulta-ro.mjs prod "select * from piefirme.citas where id = '…'" --json=ruta.json
//
// Corre dentro de BEGIN READ ONLY … ROLLBACK, así que no puede escribir aunque el SQL lo intente.
// Es lo que usan qa-tester (verificar lo guardado) y /rannix-diagnostico.
import fs from "fs";
import { ambiente, conectar, posicionales } from "./lib/env.mjs";

const [amb, sql] = posicionales();
if (!amb || !sql) { console.error('uso: node scripts/consulta-ro.mjs qa|prod "<select …>" [--json=archivo]'); process.exit(2); }

const c = await conectar(ambiente(amb), { soloLectura: true });
try {
  await c.query("begin read only");
  const r = await c.query(sql);
  await c.query("rollback");
  const filas = r.rows ?? [];
  const destino = process.argv.find((a) => a.startsWith("--json="))?.slice(7);
  if (destino) fs.writeFileSync(destino, JSON.stringify(filas, null, 2));
  console.log(JSON.stringify(filas, null, 2));
  console.error(`(${filas.length} fila${filas.length === 1 ? "" : "s"} · ambiente ${amb} · solo lectura)`);
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("ERROR:", e.message); process.exit(1);
} finally { await c.end(); }
