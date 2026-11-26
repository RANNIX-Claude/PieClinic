// Poleo de la cola de eventos del origen hacia Control y Auditoría (ctl_eventos_entrada). EJEMPLO de «poleo cada 30 segundos si no hay broker» (especificación, Eventos de PODIX).
//   node scripts/auditoria-eventos-poleo.mjs qa                   # un ciclo cada 30 s hasta Ctrl+C
//   node scripts/auditoria-eventos-poleo.mjs qa --una-vez         # un solo ciclo y termina
//   node scripts/auditoria-eventos-poleo.mjs qa --cada=10         # otro intervalo (segundos)
// Cada ciclo llama a piefirme_app.ctl_eventos_drenar_todas(): vence las cancelaciones que pasaron su espera (quedan «pendiente de validación», nunca se resuelven solas),
// revisa relevos al abrir o cerrar turno, evalúa ventas de alto valor, asegura el registro de cada apertura de cajón y marca los eventos como procesados (o «error» con su motivo).
// HOY NO HAY PLANIFICADOR en el servidor: este script (o el botón «Procesar ahora» del dueño, o pg_cron: select cron.schedule('ctl-eventos', '30 seconds', $$select piefirme_app.ctl_eventos_drenar_todas()$$))
// lo hace. Producción exige --confirmo-produccion (escribe).
import { ambiente, conectar, exigirConfirmacionProd, posicionales, arg } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb) { console.error("uso: node scripts/auditoria-eventos-poleo.mjs qa|prod [--una-vez] [--cada=30] [--confirmo-produccion]"); process.exit(2); }
exigirConfirmacionProd(amb);
const cada = Math.max(5, Number(process.argv.find((a) => a.startsWith("--cada="))?.split("=")[1] ?? 30));
const unaVez = !!arg("--una-vez");

const c = await conectar(ambiente(amb));
let parar = false;
process.on("SIGINT", () => { parar = true; });
async function ciclo() {
  try {
    await c.query("begin");
    const r = (await c.query("select piefirme_app.ctl_eventos_drenar_todas(500) as r")).rows[0].r;
    await c.query("commit");
    const t = r.reduce((a, o) => ({ procesados: a.procesados + o.procesados, errores: a.errores + o.con_error, vencidas: a.vencidas + o.cancelaciones_vencidas }), { procesados: 0, errores: 0, vencidas: 0 });
    console.log(`[${new Date().toISOString()}] procesados ${t.procesados} · con error ${t.errores} · cancelaciones vencidas ${t.vencidas}`);
  } catch (e) { await c.query("rollback").catch(() => {}); console.error("ERROR:", e.message); process.exitCode = 1; }
}
try {
  do { await ciclo(); if (unaVez) break; for (let i = 0; i < cada && !parar; i++) await new Promise((ok) => setTimeout(ok, 1000)); } while (!parar);
} finally { await c.end(); }
