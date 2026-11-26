// Planificador de la CADENA DE CUSTODIA (Etapa 7). Se invoca por cron / tarea programada mientras el punto de venta no emita sus eventos.
//
//   node scripts/custodia-planificador.mjs qa [--horas=72]
//   node scripts/custodia-planificador.mjs prod --confirmo-produccion
//
// Hace, para cada clínica activa o en prueba:
//   1. Evalúa las ventas cobradas de las últimas N horas y avisa al dueño de cada venta de pieza de alto valor (piefirme_app.ctl_alto_valor_evaluar). Idempotente por
//      línea de venta: se puede correr cada minuto sin repetir alertas.
//   2. Genera la alerta DIARIA de folios de talonario faltantes (piefirme_app.ctl_talonario_alerta_diaria): una por clínica y día; la consume el correo diario simulado.
// CONTRATO con el origen: cuando el punto de venta emita el evento `venta_registrada`, basta llamar piefirme_app.ctl_alto_valor_procesar(org, venta) en el momento.
// Las dos funciones son internas (la app no las ejecuta): este script se conecta con el rol de base de datos.
import { ambiente, conectar, exigirConfirmacionProd, arg, posicionales } from "./lib/env.mjs";

const [amb] = posicionales();
if (!amb) { console.error("uso: node scripts/custodia-planificador.mjs qa|prod [--horas=72] [--confirmo-produccion]"); process.exit(2); }
exigirConfirmacionProd(amb);
const horas = Number((process.argv.find((a) => a.startsWith("--horas=")) ?? "--horas=72").split("=")[1]) || 72;

const c = await conectar(ambiente(amb));
try {
  const orgs = (await c.query("select id, nombre from piefirme.organizaciones where estado in ('prueba', 'activa') order by nombre")).rows;
  let ventas = 0, folios = 0;
  for (const o of orgs) {
    const v = (await c.query("select piefirme_app.ctl_alto_valor_evaluar($1, now() - make_interval(hours => $2::int)) as n", [o.id, horas])).rows[0].n;
    const f = (await c.query("select piefirme_app.ctl_talonario_alerta_diaria($1) as n", [o.id])).rows[0].n;
    ventas += v; folios += f;
    if (v || f) console.log(`[${amb}] ${o.nombre}: ${v} venta(s) de alto valor nueva(s), ${f} talonario(s) con folios faltantes en la alerta diaria`);
  }
  console.log(`[${amb}] listo: ${orgs.length} clínica(s) revisada(s), ${ventas} venta(s) de alto valor, ${folios} talonario(s) con faltantes.`);
} finally { await c.end(); }
