// Semilla de CASOS de demostración para QA (Control y Auditoría · Etapa 3). IDEMPOTENTE: si la sucursal «DEMO Casos» ya existe no hace nada.
//   node scripts/semilla-auditoria-casos-qa.mjs [--ambiente=qa]       (solo QA; producción se rechaza)
// Todo es dato de prueba generado y claramente marcado: sucursal «DEMO Casos (datos de prueba)» con productos «DEMO …». Los casos NO se insertan a mano:
// nacen del motor real (conteo de apertura de r@g.com cerrado por m@g.com) y luego se llevan a distintos estados con las RPC de la Etapa 3 (como s@g.com y m@g.com),
// de modo que la lista, el detalle, la bitácora, el ajuste y los reportes tienen material realista. Cuentas: clave 123456 (scripts/qa-usuarios-prueba.mjs).
import { randomUUID } from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";

const amb = (process.argv.find((a) => a.startsWith("--ambiente=")) ?? "--ambiente=qa").split("=")[1];
if (amb !== "qa") { console.error("La semilla de demostración solo corre en QA."); process.exit(3); }
const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const c = await conectar(cfg);
const ids = {};
const owner = async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); };
async function como(correo) {
  await owner();
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[correo], role: "authenticated", email: correo })]);
  await c.query("set local role authenticated");
}
const rpc = async (correo, fn, args = []) => { await como(correo); return (await c.query(`select piefirme.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).rows[0].r; };
const uno = async (sql, p) => (await c.query(sql, p)).rows[0];
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

try {
  await c.query("begin");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [["m@g.com", "s@g.com", "r@g.com"]])).rows) ids[r.email] = r.id;
  for (const e of ["m@g.com", "s@g.com", "r@g.com"]) if (!ids[e]) throw new Error(`falta la cuenta ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  if ((await uno("select 1 as x from piefirme.sedes where organizacion_id = $1 and clave = 'DEMOCAS'", [ORG]))) { console.log("La semilla de casos ya existe (sucursal DEMO Casos): nada que hacer."); await c.query("rollback"); process.exit(0); }

  const sede = (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, 'DEMOCAS', 'DEMO Casos (datos de prueba)') returning id", [ORG])).id;
  const catalogo = [["Gel antiséptico 500 ml", 85, 4], ["Bisturí desechable (caja)", 240, 6], ["Crema para talón", 60, 8], ["Plantilla ortopédica", 600, 3], ["Plantilla genérica", 100, 5],
                    ["Fresa de pulido", 150, 5], ["Gasas estériles", 25, 20], ["Tijera de cutícula", 320, 4]];
  const prods = [];
  await c.query("select set_config('app.kardex', 'on', true)");
  for (const [nombre, costo, saldo] of catalogo) {
    const p = await uno("insert into piefirme.productos (organizacion_id, sku, nombre, codigo_barras, costo_promedio) values ($1, $2, $3, $4, $5) returning id, codigo_barras",
                        [ORG, `DEMO-${prods.length + 1}`, `DEMO ${nombre}`, `97000000${prods.length + 1}`, costo]);
    await c.query(`insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio) values ($1, 'producto', $2, piefirme_app.ctl_hoy($1) - 400, $3, 'fijo')`, [ORG, p.id, costo * 2]);
    await c.query("insert into piefirme.inventario_sede (organizacion_id, sede_id, producto_id, existencia) values ($1, $2, $3, $4)", [ORG, sede, p.id, saldo]);
    prods.push({ ...p, nombre, saldo });
  }
  await c.query("select set_config('app.kardex', '', true)");
  // una cancelación reciente del primer producto, para que su caso nazca con la cancelación ligada (criterio 15)
  await c.query("set local session_replication_role = replica");
  const v = await uno(`insert into piefirme.ventas (organizacion_id, sede_id, folio, estado, cancelada_en, cancelada_por, motivo_cancelacion, total) values ($1, $2, 'DEMO-TKT-0001', 'cancelada', now() - interval '2 days', $3, 'Cliente se arrepintió (dato de prueba)', 170) returning id`, [ORG, sede, ids["r@g.com"]]);
  await c.query(`insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, producto_id, iva_tipo, cantidad, precio_unitario, importe) values ($1, $2, $3, 'producto', $4, 'exento', 1, 170, 170)`, [ORG, sede, v.id, prods[0].id]);
  await c.query("set local session_replication_role = origin");

  // el conteo de apertura (lo hace la recepcionista a ciegas) → el motor abre los casos al cerrar
  const fisicos = [3, 4, 8, 2, 6, 5, 20, 3];   // gel -1 (con cancelación), bisturí -2, crema =, plantilla ortopédica -1 y genérica +1 (sustitución), fresa =, gasas =, tijera -1
  const ini = await rpc("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  for (let i = 0; i < prods.length; i++) await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, prods[i].codigo_barras, fisicos[i], null, null, null, null, null, null, null]);
  const cierre = await rpc("m@g.com", "ctl_sesion_cerrar", [ini.sesion_id]);
  await owner();
  const casos = (await c.query("select * from piefirme.ctl_caso where contexto ->> 'sesion_id' = $1 order by creado_en, folio", [ini.sesion_id])).rows;
  const de = (i) => casos.find((k) => k.producto_id === prods[i].id);
  const causa = async (n) => (await uno("select id from piefirme.ctl_causa where organizacion_id = $1 and nombre = $2", [ORG, n])).id;

  // bisturí: en investigación con comentario y propuesta (listo para que el dueño autorice)
  await rpc("s@g.com", "ctl_caso_tomar", [de(1).id, dia(3), "Reviso las remisiones de la semana"]);
  await rpc("s@g.com", "ctl_caso_comentar", [de(1).id, "Se revisó la bodega trasera: no está."]);
  await rpc("s@g.com", "ctl_caso_guardar_cierre", [de(1).id, await causa("Merma o producto dañado"), "empresa", 480, "Cajas dañadas por humedad (dato de prueba)"]);
  // gel: investigado y cerrado sin ajuste (apareció la pieza)
  await rpc("s@g.com", "ctl_caso_tomar", [de(0).id, dia(5), null]);
  await rpc("m@g.com", "ctl_caso_cerrar_sin_ajuste", [de(0).id, await causa("Error en el conteo"), "Apareció el gel en el anaquel de curaciones; error de conteo (dato de prueba).", null, 0]);
  // par de sustitución: tomado por la supervisora, propuesta lista
  await rpc("s@g.com", "ctl_caso_tomar", [de(3).id, dia(4), null]);
  await rpc("s@g.com", "ctl_caso_guardar_cierre", [de(3).id, await causa("Error de captura en venta"), "empresa", 600, "Se cobró la plantilla genérica en lugar de la ortopédica (dato de prueba)"]);
  // tijera: queda ABIERTA sin asignar (para ver la bandeja)
  console.log(`Sesión ${ini.sesion_id}: ${casos.length} casos, ${cierre.sustituciones} sustitución, ${cierre.con_cancelacion} con cancelación ligada.`);
  await c.query("commit");
  console.log("Semilla de casos creada en QA (sucursal «DEMO Casos (datos de prueba)»).");
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("Falló la semilla (se deshizo todo):", e.message);
  process.exitCode = 1;
} finally { await c.end(); }
