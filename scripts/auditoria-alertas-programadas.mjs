// Evaluaciones programadas de alertas y resumen diario de Control y Auditoría (F7.3). HOY NO HAY PLANIFICADOR: se corre a mano (o desde el Programador de tareas / cron).
//   node scripts/auditoria-alertas-programadas.mjs qa                    # evalúa ahora (sin conteo de apertura, sin cierre, sin sincronizar, cancelaciones, alto valor)
//   node scripts/auditoria-alertas-programadas.mjs qa --resumen          # además genera el resumen diario de hoy
//   node scripts/auditoria-alertas-programadas.mjs qa --ahora=2026-11-26T22:30:00Z   # reloj simulado (para probar «a la hora configurada»)
//   node scripts/auditoria-alertas-programadas.mjs qa --org=<uuid>       # una sola organización
// Llama a las funciones SQL ctl_alertas_programadas / ctl_resumen_diario_generar (solo service_role) con la conexión de base de datos del ambiente. Los envíos
// Push/WhatsApp/correo son SIMULADOS: solo queda el registro de lo que se habría enviado (tabla ctl_alerta_envio; se ve en Auditoría → Alertas → «Lo que se habría enviado»).
// Producción exige --confirmo-produccion (escribe alertas).
import { ambiente, conectar, exigirConfirmacionProd, posicionales, arg } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb) { console.error("uso: node scripts/auditoria-alertas-programadas.mjs qa|prod [--resumen] [--ahora=ISO] [--org=uuid] [--confirmo-produccion]"); process.exit(2); }
exigirConfirmacionProd(amb);
const val = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const ahora = val("ahora"), org = val("org");
if (ahora && Number.isNaN(Date.parse(ahora))) { console.error("--ahora no es una fecha válida"); process.exit(2); }

const c = await conectar(ambiente(amb));
try {
  await c.query("begin");
  const ev = (await c.query("select piefirme.ctl_alertas_programadas($1::uuid, coalesce($2::timestamptz, now())) as r", [org ?? null, ahora ?? null])).rows[0].r;
  console.log("Evaluación:", JSON.stringify(ev, null, 1));
  if (arg("--resumen")) {
    const rs = (await c.query("select piefirme.ctl_resumen_diario_generar($1::uuid, null) as r", [org ?? null])).rows[0].r;
    console.log("Resumen diario:", JSON.stringify(rs, null, 1));
  }
  await c.query("commit");
  console.log("Listo. (Envíos simulados: revise Auditoría → Alertas → «Lo que se habría enviado».)");
} catch (e) { await c.query("rollback").catch(() => {}); console.error("ERROR:", e.message); process.exitCode = 1; } finally { await c.end(); }
