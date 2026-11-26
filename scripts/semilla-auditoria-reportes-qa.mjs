// Semilla de REPORTES de Control y Auditoría (Etapa 6) — SOLO QA. Deja COMMITEADOS datos sintéticos marcados «RQA» (7 sucursales RQA1…RQA7, 120 productos, conteos diarios,
// casos, tickets, pagos, cierres, una entrega pendiente, una auditoría remota en curso y unas alertas) para ver el reporte de diferencias, el tablero y los reportes de caja
// con material realista. IDEMPOTENTE: si ya existe la sucursal RQA1 no hace nada.
//   node scripts/semilla-auditoria-reportes-qa.mjs                 # 90 días × 7 sucursales (~63 mil partidas, ~5 mil tickets)
//   node scripts/semilla-auditoria-reportes-qa.mjs --dias=30       # otra profundidad
//   node scripts/semilla-auditoria-reportes-qa.mjs --quitar        # borra todo lo marcado RQA
// Producción se rechaza. Requiere las cuentas de prueba (scripts/qa-usuarios-prueba.mjs qa).
import { ambiente, conectar } from "./lib/env.mjs";
import { sembrar, quitar, ORG } from "./lib/semilla-reportes.mjs";

const amb = (process.argv.find((a) => a.startsWith("--ambiente=")) ?? "--ambiente=qa").split("=")[1];
if (amb !== "qa") { console.error("La semilla de reportes solo corre en QA."); process.exit(3); }
const dias = Number((process.argv.find((a) => a.startsWith("--dias=")) ?? "--dias=90").split("=")[1]);
const c = await conectar(ambiente("qa"));
try {
  await c.query("begin");
  const t0 = Date.now();
  if (process.argv.includes("--quitar")) {
    const r = await quitar(c);
    await c.query("commit");
    console.log("Semilla RQA eliminada:", JSON.stringify(r));
  } else {
    const ids = {};
    for (const r of (await c.query("select email, id from piefirme.perfiles where organizacion_id = $1 and email = any($2)", [ORG, ["r@g.com", "s@g.com", "m@g.com", "p@g.com"]])).rows) ids[r.email[0]] = r.id;
    for (const k of ["r", "s", "m", "p"]) if (!ids[k]) throw new Error(`falta la cuenta ${k}@g.com: corre scripts/qa-usuarios-prueba.mjs qa`);
    const r = await sembrar(c, ids, { dias });
    if (r.yaExiste) { await c.query("rollback"); console.log("La semilla de reportes ya existe (sucursal RQA1): nada que hacer. Para rehacerla: --quitar y de nuevo."); }
    else {
      await c.query("commit");
      console.log(`Semilla de reportes lista en ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(r));
    }
  }
} catch (e) { await c.query("rollback").catch(() => {}); console.error("ERROR:", e.message); process.exitCode = 1; } finally { await c.end(); }
