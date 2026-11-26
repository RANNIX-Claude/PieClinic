// Pruebas de REPORTES, TABLERO Y ALERTAS (Control y Auditoría · Etapa 6) contra la base QA.   node --test scripts/test-auditoria-reportes-qa.mjs
//
// TODO corre en UNA transacción que SIEMPRE se deshace (no deja sedes, productos, casos, alertas, ventas ni la semilla de rendimiento): los datos se crean dentro de la transacción como
// dueño de la base y se actúa «como» cada cuenta de prueba (SET LOCAL ROLE authenticated + claims JWT). Los casos nacen del motor de conteo real (iniciar → capturar → cerrar).
// Cuentas (clave 123456, solo QA; scripts/qa-usuarios-prueba.mjs): a superadmin (soporte) · m dueño · s supervisora · p podólogo · r recepción.
// Cubre: rol de sucursal sin acceso a diferencias ni reportes; filtros, umbral y orden por valor; totales contra consulta directa; correcciones que no cuentan; bitácora de consultas;
// reportes de caja (bajo catálogo, cajón sin venta, mezcla de pago); tablero; alertas (techo diario, agrupación, resumen diario, reglas versionadas, programadas, deduplicación);
// reporte mensual; retención y purga de fotos; solo inserción en las tablas nuevas; rendimiento con la semilla de 90 días × 7 sucursales (script de semilla en scripts/lib/semilla-reportes.mjs).
// NO correr en paralelo con otras suites del módulo (se bloquean entre sí por pins_personales y los contadores de folio).
import nodeTest, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";
import { sembrar, existe } from "./lib/semilla-reportes.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
const c = await conectar(cfg);
const test = (nombre, fn) => nodeTest(nombre, async (t) => {
  const sp = `tsp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(t); } catch (e) { await c.query(`rollback to savepoint ${sp}`).catch(() => {}); throw e; }
});
const sub = (t, nombre, fn) => t.test(nombre, async () => {
  const sp = `ssp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(); } catch (e) { await c.query(`rollback to savepoint ${sp}`).catch(() => {}); throw e; }
});
const ids = {};
let n = 0, k = 0;
const E = {};   // escenario compartido

const owner = async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); };
async function como(correo) {
  await owner();
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[correo], role: "authenticated", email: correo })]);
  await c.query("set local role authenticated");
}
async function intentar(sql, params = []) {
  const sp = `sp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { const r = await c.query(sql, params); await c.query(`release savepoint ${sp}`); return { ok: true, rows: r.rows, r }; }
  catch (e) { await c.query(`rollback to savepoint ${sp}`); return { ok: false, code: e.code, message: e.message }; }
}
const rpc = async (correo, fn, args = []) => {
  await como(correo);
  const x = await intentar(`select piefirme.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args);
  return x.ok ? { ok: true, r: x.rows[0].r } : x;
};
const bien = async (correo, fn, args = []) => { const x = await rpc(correo, fn, args); assert.ok(x.ok, `${correo} ${fn}: ${x.message}`); return x.r; };
const uno = async (sql, params) => (await c.query(sql, params)).rows[0];
const filas = async (sql, params) => (await c.query(sql, params)).rows;
const dif = (f = {}, correo = "m@g.com") => bien(correo, "ctl_dif_consultar", [JSON.stringify(f)]);
const num = (v) => Number(v);
let semilla = null;
/** La semilla de 90 días × 7 sucursales: si ya está commiteada en QA se usa; si no, se crea DENTRO de la transacción (se deshace). */
async function semillaLista() {
  if (semilla) return semilla;
  const yaHabia = await existe(c);
  const t0 = Date.now();
  const r = await sembrar(c, { r: ids["r@g.com"], s: ids["s@g.com"], m: ids["m@g.com"], p: ids["p@g.com"] }, { dias: 90, ventas: false, alertas: false });
  await owner(); await c.query("analyze piefirme.ctl_partida_conteo"); await c.query("analyze piefirme.ctl_partida_calculo"); await c.query("analyze piefirme.ctl_caso");
  console.log(`   semilla de rendimiento: ${yaHabia ? "ya existía (commiteada)" : `${(Date.now() - t0) / 1000} s, ${JSON.stringify(r)}`}`);
  return (semilla = { yaHabia, ...r });
}

// ───────── semillas (como dueño de la base, dentro de la transacción) ─────────
async function crearSede(nombre) {
  await owner();
  return (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, `RPT${Date.now() % 100000}${++k}`, `RPT ${nombre}`])).id;
}
async function crearProducto(nombre, costo, extra = {}) {
  await owner();
  const p = await uno("insert into piefirme.productos (organizacion_id, sku, nombre, codigo_barras, costo_promedio, categoria) values ($1, $2, $3, $4, $5, $6) returning id, codigo_barras, sku",
                      [ORG, `RPT-${Date.now() % 1000000}-${++k}`, `RPT ${nombre}`, `97${Date.now() % 100000000}${k}`, costo, extra.categoria ?? "General"]);
  if (extra.precio != null) await c.query(`insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio) values ($1, 'producto', $2, piefirme_app.ctl_hoy($1) - 400, $3, 'fijo')`, [ORG, p.id, extra.precio]);
  return p;
}
async function existencia(sede, prodId, cant) {
  await owner();
  await c.query("select set_config('app.kardex', 'on', true)");
  await c.query("insert into piefirme.inventario_sede (organizacion_id, sede_id, producto_id, existencia) values ($1, $2, $3, $4) on conflict (sede_id, producto_id) do update set existencia = excluded.existencia", [ORG, sede, prodId, cant]);
  await c.query("select set_config('app.kardex', '', true)");
}
const causaId = async (nombre) => { await owner(); return (await uno("select id from piefirme.ctl_causa where organizacion_id = $1 and nombre = $2", [ORG, nombre])).id; };
const fechaEn = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
/** Sesión de conteo de apertura capturada por `capt` y cerrada por `cierra`. conteos: [[producto, fisico]…]. */
async function sesion(sede, conteos, { capt = "r@g.com", cierra = "m@g.com" } = {}) {
  const ini = await bien(capt, "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  for (const [p, f] of conteos) {
    const r = await bien(capt, "ctl_capturar_partida", [randomUUID(), ini.sesion_id, p.codigo_barras, f, null, null, null, null, null, null, null]);
    assert.equal(r.ok, true);
  }
  assert.equal((await bien(cierra, "ctl_sesion_cerrar", [ini.sesion_id])).ok, true);
  return ini.sesion_id;
}
/** Venta del origen (se siembra con los disparadores apagados: son datos del origen, no del módulo). */
async function venta({ sede, usuario, lineas, pagos, estado = "cobrada", turno = null, cobradaEn = "now()", canceladaEn = null }) {
  if (estado !== "cancelada" && !turno) turno = await turnoCaja(sede, usuario);   // una venta cobrada exige turno de caja
  await owner();
  await c.query("set local session_replication_role = replica");
  const total = lineas.reduce((s, l) => s + l.importe, 0);
  const v = await uno(`insert into piefirme.ventas (organizacion_id, sede_id, folio, estado, cajero_id, created_by, turno_id, subtotal, total, pagado_total, cobrada_en, cancelada_en, cancelada_por, motivo_cancelacion)
                       values ($1, $2, $3, $4, $5, $5, $6, $7, $7, $7, ${cobradaEn}, ${canceladaEn ?? "null"}, case when $4 = 'cancelada' then $5::uuid end, case when $4 = 'cancelada' then 'Prueba' end) returning id, folio`,
                      [ORG, sede, `RPT-T-${Date.now() % 100000}${++k}`, estado, ids[usuario], turno, total]);
  for (const [i, l] of lineas.entries()) {
    await c.query(`insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, orden, tipo, producto_id, descripcion, iva_tipo, cantidad, precio_unitario, tipo_precio, importe_bruto, descuento, importe, descuento_motivo, autorizacion_descuento_id)
                   values ($1, $2, $3, $4, 'producto', $5, $6, 'exento', $7, $8, 'fijo', $9, $10, $11, $12, $13)`,
                  [ORG, sede, v.id, i + 1, l.producto.id, l.producto.nombre ?? "RPT producto", l.cantidad ?? 1, l.precio, (l.cantidad ?? 1) * l.precio, (l.cantidad ?? 1) * l.precio - l.importe, l.importe, l.motivo ?? null, l.autorizacion ?? null]);
  }
  for (const p of pagos ?? [{ metodo: "efectivo", monto: total }]) await c.query("insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto) values ($1, $2, $3, $4, $5)", [ORG, sede, v.id, p.metodo, p.monto]);
  await c.query("set local session_replication_role = origin");
  return v;
}
const turnoCaja = async (sede, correo, caja = "Caja 1") => {
  await owner();
  await c.query("set local session_replication_role = replica");
  const t = await uno(`insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial, estado, cierre_en) values ($1, $2, $3, 'Matutino', $4, now() - interval '3 hours', 500, 'cerrado', now() - interval '1 hour') returning id`, [ORG, sede, caja, ids[correo]]);
  await c.query("set local session_replication_role = origin");
  return t.id;
};
const alerta = async (sede, tipo, mensaje, ref = null) => { await owner(); return (await uno("select piefirme_app.ctl_alerta_nueva($1, $2, $3, $4, $5, $6) as id", [ORG, sede, tipo, mensaje, ref ? "prueba" : null, ref])).id; };
const envios = async (alertaId, destino) => { await owner(); return filas("select * from piefirme.ctl_alerta_envio where alerta_id = $1 and ($2::uuid is null or destinatario_id = $2) order by creado_en, id", [alertaId, destino ?? null]); };
const consultas = async (correo, reporte) => { await owner(); return (await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where usuario_id = $1 and reporte = $2", [ids[correo], reporte])).n; };

before(async () => {
  await c.query("begin");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  // escenario: dos sucursales con diferencias reales generadas por el motor de conteo
  E.A = await crearSede("A"); E.B = await crearSede("B");
  E.p1 = await crearProducto("P1 caro", 500, { categoria: "CatX", precio: 1000 }); E.p2 = await crearProducto("P2", 100, { categoria: "CatX", precio: 200 });
  E.p3 = await crearProducto("P3", 50, { categoria: "CatY", precio: 100 }); E.p4 = await crearProducto("P4 barato", 20, { categoria: "CatY", precio: 40 }); E.p5 = await crearProducto("P5 carísimo", 800, { categoria: "CatZ", precio: 1600 });
  for (const p of [E.p1, E.p2, E.p3, E.p4]) await existencia(E.A, p.id, 10);
  await existencia(E.B, E.p1.id, 5); await existencia(E.B, E.p5.id, 3);
  // A (r captura, m cierra): P1 −2 (−$1,000) · P2 −1 y luego corregida a 0 · P3 +3 (+$150) · P4 −1 (−$20)
  const ini = await bien("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", E.A, "{}"]);
  E.sesionA = ini.sesion_id;
  const cap = (p, f, corrige = null) => bien("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, p.codigo_barras, f, null, null, null, null, null, null, null]);
  await cap(E.p1, 8); await cap(E.p2, 9); await cap(E.p3, 13); await cap(E.p4, 9);
  E.correccion = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, E.p2.codigo_barras, 10, null, null, null, null, null, null, null]);   // el segundo escaneo del mismo producto corrige el anterior
  await bien("m@g.com", "ctl_sesion_cerrar", [ini.sesion_id]);
  // B (s captura, m cierra): P1 −1 (−$500) · P5 −1 (−$800)
  E.sesionB = await sesion(E.B, [[E.p1, 4], [E.p5, 2]], { capt: "s@g.com" });
  await owner();
  E.casoP4 = (await uno("select id from piefirme.ctl_caso where origen_tipo = 'partida_conteo' and sucursal_id = $1 and producto_id = $2", [E.A, E.p4.id])).id;
  await bien("s@g.com", "ctl_caso_tomar", [E.casoP4, fechaEn(5), null]);
  await bien("s@g.com", "ctl_caso_cerrar_sin_ajuste", [E.casoP4, await causaId("Error en el conteo"), "Apareció la pieza en bodega", null, 0]);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · EL ROL DE SUCURSAL NO ENTRA A NINGUNA PARTE ═════════════════════════════
const MIS_FUNCIONES = ["ctl_alerta_regla_efectiva", "ctl_alerta_destinatarios", "ctl_envio_insertar", "ctl_envio_destino", "ctl_alerta_despachar", "ctl_trg_alerta_despachar", "ctl_alertas_despachar_pendientes",
  "ctl_alerta_nueva", "ctl_o_opero", "ctl_o_cancelaciones_desde", "ctl_alertas_programadas_org", "ctl_resumen_diario", "ctl_alertas_listar", "ctl_alerta_atender", "ctl_alertas_reglas", "ctl_alerta_regla_guardar",
  "ctl_alerta_destinatarios_listar", "ctl_alerta_destinatario_guardar", "ctl_alertas_envios_listar", "ctl_alertas_evaluar_ahora", "ctl_resumen_diario_ahora", "ctl_alertas_programadas", "ctl_resumen_diario_generar",
  "ctl_trg_cajon_evento", "ctl_zona", "ctl_log_consulta", "ctl_rango", "ctl_sedes_filtro", "ctl_dif_filas", "ctl_ultima_actividad", "ctl_sucursal_usa_modulo", "ctl_trg_catalogo_fijo", "ctl_reportes_opciones",
  "ctl_dif_consultar", "ctl_tablero", "ctl_rep_ventas_bajo_catalogo", "ctl_rep_cajon", "ctl_rep_mezcla_pago", "ctl_reporte_mensual", "ctl_bitacora_consultas_listar", "ctl_fotos_vencidas", "ctl_fotos_por_purgar",
  "ctl_fotos_marcar_purgadas", "ctl_retencion_resumen"];
const RPC_REVISION = [["ctl_dif_consultar", ["{}"]], ["ctl_reportes_opciones", []], ["ctl_tablero", [30]], ["ctl_reporte_mensual", [null]], ["ctl_alertas_listar", ["{}"]], ["ctl_alertas_reglas", []],
  ["ctl_alerta_destinatarios_listar", []], ["ctl_alertas_envios_listar", ["{}"]], ["ctl_retencion_resumen", []], ["ctl_bitacora_consultas_listar", ["{}"]],
  ["ctl_rep_ventas_bajo_catalogo", ["{}"]], ["ctl_rep_cajon", ["{}"]], ["ctl_rep_mezcla_pago", ["{}"]]];

test("el rol de sucursal (cajero, encargado, podólogo) no tiene acceso a diferencias, tablero, reportes ni alertas: PF403 y cero filas (criterio 1)", async (t) => {
  for (const correo of ["r@g.com", "p@g.com"]) {
    for (const [fn, args] of RPC_REVISION) {
      const x = await rpc(correo, fn, args);
      assert.equal(x.ok, false, `${correo} no debe poder ${fn}`);
      assert.equal(x.code, "PF403", `${correo} ${fn} debe dar PF403 (dio ${x.code})`);
    }
    for (const [fn, args] of [["ctl_alerta_atender", [[randomUUID()], "atendida", null]], ["ctl_alerta_regla_guardar", ["cierre_fuera_tolerancia", ["push"], ["dueno"], true, true, null]],
                              ["ctl_alerta_destinatario_guardar", [ids["m@g.com"], 5, true, null]], ["ctl_alertas_evaluar_ahora", []], ["ctl_resumen_diario_ahora", [null]]]) {
      const x = await rpc(correo, fn, args);
      assert.equal(x.code, "PF403", `${correo} ${fn}`);
    }
    await como(correo);
    for (const tabla of ["ctl_alerta_regla", "ctl_alerta_destinatario", "ctl_alerta_envio", "ctl_apertura_cajon", "ctl_evidencia_purga", "ctl_alerta_catalogo", "ctl_alerta", "v_ctl_pagos", "v_ctl_ventas"]) {
      const x = await intentar(`select count(*)::int as n from piefirme.${tabla}`);
      assert.ok(x.ok && x.rows[0].n === 0, `${correo} no debe ver filas de ${tabla}`);
    }
  }
});

test("quién puede qué entre dueño, supervisor y soporte", async () => {
  // supervisor: revisa y atiende; no configura ni lee la bitácora de consultas
  for (const [fn, args] of [["ctl_dif_consultar", ["{}"]], ["ctl_tablero", [30]], ["ctl_alertas_listar", ["{}"]], ["ctl_rep_ventas_bajo_catalogo", ["{}"]], ["ctl_reporte_mensual", [null]]]) await bien("s@g.com", fn, args);
  for (const [fn, args] of [["ctl_bitacora_consultas_listar", ["{}"]], ["ctl_alertas_evaluar_ahora", []], ["ctl_alerta_regla_guardar", ["cierre_fuera_tolerancia", ["push"], ["dueno"], true, true, null]]]) assert.equal((await rpc("s@g.com", fn, args)).code, "PF403", `supervisor ${fn}`);
  // soporte: lee diferencias, tablero, alertas y bitácora; NO lee ventas crudas ni atiende alertas
  for (const [fn, args] of [["ctl_dif_consultar", ["{}"]], ["ctl_tablero", [30]], ["ctl_alertas_listar", ["{}"]], ["ctl_bitacora_consultas_listar", ["{}"]], ["ctl_retencion_resumen", []], ["ctl_reporte_mensual", [null]]]) await bien("a@g.com", fn, args);
  for (const [fn, args] of [["ctl_rep_ventas_bajo_catalogo", ["{}"]], ["ctl_rep_cajon", ["{}"]], ["ctl_rep_mezcla_pago", ["{}"]], ["ctl_alerta_atender", [[randomUUID()], "atendida", null]]]) assert.equal((await rpc("a@g.com", fn, args)).code, "PF403", `soporte ${fn}`);
  // el dueño todo
  for (const [fn, args] of RPC_REVISION) await bien("m@g.com", fn, args);
});

test("las tablas nuevas son solo inserción: la app no escribe y ni el dueño de la base actualiza o borra (sin la bandera de purga)", async () => {
  for (const tabla of ["ctl_alerta_regla", "ctl_alerta_destinatario", "ctl_alerta_envio", "ctl_apertura_cajon", "ctl_evidencia_purga", "ctl_alerta_catalogo"]) {
    for (const correo of ["m@g.com", "s@g.com", "a@g.com", "r@g.com"]) {
      await como(correo);
      const ins = tabla === "ctl_alerta_catalogo" ? `insert into piefirme.${tabla} (tipo) values ('x')` : `insert into piefirme.${tabla} (organizacion_id) values ('${ORG}')`;
      for (const sql of [ins, `update piefirme.${tabla} set ${tabla === "ctl_alerta_catalogo" ? "nombre = nombre" : "organizacion_id = organizacion_id"}`, `delete from piefirme.${tabla}`, `truncate piefirme.${tabla}`]) {
        const x = await intentar(sql);
        assert.equal(x.code, "42501", `${correo} no debe escribir en ${tabla}: ${sql} → ${x.code}`);
      }
    }
  }
  await owner();
  const e = await uno("select piefirme_app.ctl_alerta_nueva($1, $2, 'sin_cierre', 'prueba solo inserción', 'prueba', $3) as id", [ORG, E.A, randomUUID()]);
  assert.ok(e.id);
  for (const sql of ["update piefirme.ctl_alerta_envio set asunto = 'x'", "delete from piefirme.ctl_alerta_envio", "update piefirme.ctl_alerta_regla set activa = false", "update piefirme.ctl_apertura_cajon set caja = 'x'",
                     "delete from piefirme.ctl_evidencia_purga", "update piefirme.ctl_alerta_destinatario set recibir = false"]) {
    const x = await intentar(sql);
    assert.ok(!x.ok || x.r.rowCount === 0, `solo inserción: ${sql}`);
    if (!x.ok) assert.equal(x.code, "PF403");
  }
  const cat = await intentar("update piefirme.ctl_alerta_catalogo set nombre = 'x' where tipo = 'sin_cierre'");
  assert.ok(cat.ok, "el dueño de la base (migraciones) sí actualiza el catálogo del sistema");
  await como("m@g.com");
  assert.equal((await intentar("update piefirme.ctl_alerta_catalogo set nombre = 'x'")).code, "42501");
});

test("seguridad de las funciones nuevas: ninguna es ejecutable por anon, todas fijan search_path y las de planificador solo las ejecuta service_role", async () => {
  await owner();
  const f = await filas(`select p.oid::regprocedure::text as firma, n.nspname, p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                          where n.nspname in ('piefirme', 'piefirme_app') and p.proname = any ($1)`, [MIS_FUNCIONES]);
  assert.equal(f.length, MIS_FUNCIONES.length, `esperaba ${MIS_FUNCIONES.length} funciones, hay ${f.length}`);
  for (const x of f) {
    assert.equal(x.anon, false, `${x.firma}: anon no ejecuta`);
    if (x.prosecdef) assert.ok((x.proconfig ?? []).some((v) => v.startsWith("search_path=")), `${x.firma}: SECURITY DEFINER sin search_path fijo`);
    if (x.nspname === "piefirme_app") assert.equal(x.auth, false, `${x.firma}: las utilerías internas no son ejecutables por la app`);
  }
  for (const nombre of ["ctl_alertas_programadas", "ctl_resumen_diario_generar", "ctl_fotos_por_purgar", "ctl_fotos_marcar_purgadas"]) {
    const g = await uno(`select p.oid::regprocedure::text as firma, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as srv
                           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = $1`, [nombre]);
    assert.equal(g.auth, false, `${nombre}: la app no la ejecuta`); assert.equal(g.srv, true, `${nombre}: la ejecuta service_role`);
  }
  await como("m@g.com");
  assert.equal((await intentar("select piefirme.ctl_alertas_programadas(null, now())")).code, "42501");
  assert.equal((await intentar("select piefirme.ctl_fotos_por_purgar(null, 10)")).code, "42501");
});

// ═════════════════════════════ 2 · CONSULTA DE DIFERENCIAS (F7.1) ═════════════════════════════
test("diferencias: orden por omisión por mayor valor, totales y estado del ajuste; las correcciones no cuentan; cuadran contra la consulta directa", async (t) => {
  const r = await dif({ sucursales: [E.A, E.B] });
  assert.equal(r.ok, true);
  const valores = r.filas.map((x) => Math.abs(num(x.dif_valor)));
  assert.deepEqual(valores, [1000, 800, 500, 150, 20], "mayor diferencia valorizada primero");
  assert.deepEqual(valores, [...valores].sort((a, b) => b - a));
  assert.equal(r.total_filas, 5, "P2 se corrigió a 0: la partida reemplazada y la vigente no cuentan");
  assert.ok(!r.filas.some((x) => x.producto === "RPT P2"));
  assert.equal(num(r.totales.faltantes_piezas), 5); assert.equal(num(r.totales.faltantes_valor), 2320); assert.equal(num(r.totales.sobrantes_piezas), 3); assert.equal(num(r.totales.sobrantes_valor), 150);
  assert.equal(num(r.totales.neto_valor), -2170);
  assert.equal(num(r.totales.casos_pendientes_ajuste), 4, "4 casos abiertos; el de P4 ya está cerrado sin ajuste");
  const estados = Object.fromEntries(r.filas.map((x) => [x.producto + x.sucursal_id, x.estado_ajuste]));
  assert.equal(estados["RPT P4 barato" + E.A], "cerrada_sin_ajuste"); assert.equal(estados["RPT P3" + E.A], "abierta");
  for (const f of r.filas) { assert.ok(f.fecha_hora && f.sucursal && f.auditor && f.caso_folio, "fila completa: fecha, sucursal, auditor y caso"); assert.equal(num(f.dif_piezas) * num(f.costo), num(f.dif_valor)); }
  // contra la consulta directa a las tablas (como dueño de la base)
  await owner();
  const d = await uno(`select sum(-c.diferencia_valor) filter (where c.diferencia_piezas < 0) as falt, sum(c.diferencia_valor) filter (where c.diferencia_piezas > 0) as sobr, count(*)::int as n
                         from piefirme.ctl_partida_calculo c join piefirme.ctl_partida_conteo p on p.id = c.partida_id
                        where p.sucursal_id = any ($1) and c.diferencia_piezas <> 0 and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)`, [[E.A, E.B]]);
  assert.equal(num(d.falt), num(r.totales.faltantes_valor)); assert.equal(num(d.sobr), num(r.totales.sobrantes_valor)); assert.equal(d.n, r.total_filas);
  // por sucursal: ranking por faltante valorizado
  assert.deepEqual(r.por_sucursal.map((s) => [s.sucursal_id, num(s.faltantes_valor), s.puesto]), [[E.B, 1300, 1], [E.A, 1020, 2]]);
  assert.equal(num(r.por_sucursal[0].casos_pendientes), 2);
  // por producto (recurrencia): P1 aparece en 2 auditorías y 2 sucursales
  const p1 = r.por_producto.find((x) => x.producto === "RPT P1 caro");
  assert.equal(p1.auditorias, 2); assert.equal(p1.sucursales, 2); assert.equal(num(p1.faltantes_valor), 1500); assert.equal(r.por_producto[0].producto, "RPT P1 caro", "la recurrencia ordena primero");
  // por auditor: número de auditorías hechas (r hizo 1 y s hizo 1)
  assert.equal(r.por_auditor.find((a) => a.auditor_id === ids["r@g.com"]).auditorias, 1); assert.equal(r.por_auditor.find((a) => a.auditor_id === ids["s@g.com"]).auditorias, 1);
  assert.equal(r.por_auditor.find((a) => a.auditor_id === ids["r@g.com"]).partidas, 4, "las 4 partidas vigentes de r (la corrección reemplaza a la anterior)");
});

test("diferencias: filtros por sucursal, auditor, producto, categoría, tipo y umbral en piezas y en pesos", async (t) => {
  await sub(t, "una sola sucursal y varias", async () => {
    assert.equal((await dif({ sucursal: E.A })).total_filas, 3); assert.equal((await dif({ sucursales: [E.B] })).total_filas, 2); assert.equal((await dif({ sucursales: [E.A, E.B] })).total_filas, 5);
    assert.equal((await dif({ sucursales: [randomUUID()] })).total_filas, 0, "una sucursal ajena no devuelve nada");
  });
  await sub(t, "tipo: faltantes, sobrantes o ambas", async () => {
    const f = await dif({ sucursales: [E.A, E.B], tipo: "faltantes" }), s = await dif({ sucursales: [E.A, E.B], tipo: "sobrantes" });
    assert.equal(f.total_filas, 4); assert.ok(f.filas.every((x) => num(x.dif_piezas) < 0)); assert.equal(s.total_filas, 1); assert.equal(s.filas[0].producto, "RPT P3");
    assert.equal(num(s.totales.faltantes_valor), 0);
    assert.equal((await rpc("m@g.com", "ctl_dif_consultar", [JSON.stringify({ tipo: "otra" })])).code, "PF422");
  });
  await sub(t, "umbral en piezas y en pesos (al costo)", async () => {
    const base = { sucursales: [E.A, E.B] };
    assert.deepEqual((await dif({ ...base, umbral_piezas: 2 })).filas.map((x) => x.producto).sort(), ["RPT P1 caro", "RPT P3"]);   // |−2| y |+3|
    assert.deepEqual((await dif({ ...base, umbral_pesos: 800 })).filas.map((x) => Math.abs(num(x.dif_valor))), [1000, 800]);
    assert.equal((await dif({ ...base, umbral_pesos: 5000 })).total_filas, 0);
    assert.equal(num((await dif({ ...base, umbral_pesos: 800 })).totales.faltantes_valor), 1800);
    assert.equal((await rpc("m@g.com", "ctl_dif_consultar", [JSON.stringify({ umbral_pesos: -1 })])).code, "PF422");
  });
  await sub(t, "auditor, producto, categoría y búsqueda", async () => {
    const base = { sucursales: [E.A, E.B] };
    assert.equal((await dif({ ...base, auditor: ids["s@g.com"] })).total_filas, 2); assert.equal((await dif({ ...base, auditor: ids["r@g.com"] })).total_filas, 3);
    assert.equal((await dif({ ...base, producto: E.p1.id })).total_filas, 2); assert.equal((await dif({ ...base, categoria: "CatY" })).total_filas, 2);
    assert.equal((await dif({ ...base, buscar: "carísimo" })).total_filas, 1); assert.equal((await dif({ ...base, buscar: E.p4.codigo_barras })).total_filas, 1);
  });
  await sub(t, "fechas, orden alterno y paginación", async () => {
    const base = { sucursales: [E.A, E.B] };
    assert.equal((await dif({ ...base, desde: fechaEn(1), hasta: fechaEn(5) })).total_filas, 0, "mañana todavía no hay nada");
    assert.equal((await dif({ ...base, desde: fechaEn(-1), hasta: fechaEn(0) })).total_filas, 5);
    assert.equal((await rpc("m@g.com", "ctl_dif_consultar", [JSON.stringify({ desde: fechaEn(5), hasta: fechaEn(0) })])).code, "PF422");
    assert.equal((await rpc("m@g.com", "ctl_dif_consultar", [JSON.stringify({ desde: fechaEn(-500), hasta: fechaEn(0) })])).code, "PF422", "un rango de más de 400 días se rechaza");
    const porSuc = await dif({ ...base, orden: "sucursal" }); assert.equal(porSuc.filas[0].sucursal_id, E.A);
    const pag1 = await dif({ ...base, limite: 2, offset: 0 }), pag2 = await dif({ ...base, limite: 2, offset: 2 }), pag3 = await dif({ ...base, limite: 2, offset: 4 });
    assert.deepEqual([pag1.filas.length, pag2.filas.length, pag3.filas.length], [2, 2, 1]); assert.equal(pag1.total_filas, 5, "el total no depende de la página");
    const todas = [...pag1.filas, ...pag2.filas, ...pag3.filas].map((x) => x.partida_id); assert.equal(new Set(todas).size, 5);
    assert.deepEqual(todas, (await dif(base)).filas.map((x) => x.partida_id), "paginar conserva el orden");
  });
  await sub(t, "el supervisor con acceso a una sola sucursal solo ve esa", async () => {
    await owner();
    await c.query("update piefirme.perfiles set sedes = $1 where id = $2", [[E.A], ids["s@g.com"]]);
    const r = await dif({ sucursales: [E.A, E.B] }, "s@g.com");
    assert.equal(r.total_filas, 3); assert.ok(r.filas.every((x) => x.sucursal_id === E.A)); assert.deepEqual(r.por_sucursal.map((x) => x.sucursal_id), [E.A]);
    const t2 = await bien("s@g.com", "ctl_tablero", [30]); assert.deepEqual(t2.sucursales.map((x) => x.id), [E.A]);
    await owner();
    await c.query("update piefirme.perfiles set sedes = '{}' where id = $1", [ids["s@g.com"]]);
  });
});

test("la exportación entrega las filas con los mismos filtros, avisa si se truncó y queda en la bitácora", async () => {
  const todo = await dif({ sucursales: [E.A, E.B], exportar: true, tipo: "faltantes" });
  assert.equal(todo.filas.length, 4); assert.equal(todo.limite, 20000); assert.equal(todo.truncado, false);
  assert.equal(await consultas("m@g.com", "diferencias:exportar") >= 1, true);
});

test("cada consulta del reporte de diferencias queda en la bitácora de consultas: quién, qué filtros y cuántas filas (y la ven dueño y soporte)", async () => {
  const antes = await consultas("m@g.com", "diferencias");
  const r = await dif({ sucursales: [E.A], tipo: "faltantes", umbral_pesos: 10 });
  assert.equal(await consultas("m@g.com", "diferencias"), antes + 1);
  await owner();
  const b = await uno("select * from piefirme.ctl_bitacora_consulta where usuario_id = $1 and reporte = 'diferencias' and filtros ->> 'tipo' = 'faltantes' and (filtros ->> 'umbral_pesos')::numeric = 10", [ids["m@g.com"]]);
  assert.equal(b.rol_ctl, "dueno"); assert.equal(b.filtros.tipo, "faltantes"); assert.equal(num(b.filtros.umbral_pesos), 10); assert.equal(b.filtros.filas_resultado, r.total_filas); assert.deepEqual(b.filtros.sucursales, [E.A]);
  assert.equal(new Date(b.creado_en).getTime(), new Date((await uno("select now() as t")).t).getTime(), "la hora la pone el servidor (now() de la transacción)");
  await dif({}, "s@g.com");
  await dif({}, "a@g.com");
  assert.equal(await consultas("s@g.com", "diferencias") >= 1, true); assert.equal(await consultas("a@g.com", "diferencias") >= 1, true);
  const lista = await bien("m@g.com", "ctl_bitacora_consultas_listar", [JSON.stringify({ reporte: "diferencias" })]);
  const quienes = new Set(lista.filas.map((x) => x.usuario_id)); assert.ok(quienes.has(ids["m@g.com"]) && quienes.has(ids["s@g.com"]) && quienes.has(ids["a@g.com"]), "el dueño ve quién consultó qué");
  assert.ok(lista.filas.find((x) => x.usuario_id === ids["a@g.com"]).rol === "soporte");
  assert.ok(lista.por_reporte.some((x) => x.reporte === "diferencias"));
  const soloM = await bien("a@g.com", "ctl_bitacora_consultas_listar", [JSON.stringify({ usuario: ids["m@g.com"] })]); assert.ok(soloM.filas.every((x) => x.usuario_id === ids["m@g.com"]), "el soporte también la lee, filtrada");
  // quien no consulta no deja rastro; quien no puede, tampoco
  const n0 = await consultas("r@g.com", "diferencias"); await rpc("r@g.com", "ctl_dif_consultar", ["{}"]); assert.equal(await consultas("r@g.com", "diferencias"), n0);
  // la bitácora es solo inserción
  await owner(); assert.equal((await intentar("delete from piefirme.ctl_bitacora_consulta where usuario_id = $1", [ids["m@g.com"]])).code, "PF403");
});

// ═════════════════════════════ 3 · REPORTES DE CAJA (F1.2 · F1.5 · F1.6) ═════════════════════════════
test("ventas por debajo de catálogo: renglón por renglón, totales por cajero y sucursal; lo cobrado a catálogo no aparece (F1.2)", async (t) => {
  const sede = await crearSede("Caja"); const turno = await turnoCaja(sede, "r@g.com", "Caja 2");
  await owner(); const aut = (await uno("insert into piefirme.autorizaciones_admin (organizacion_id, tipo, solicitante_id, autorizador_id, motivo) values ($1, 'descuento', $2, $3, 'Prueba') returning id", [ORG, ids["r@g.com"], ids["m@g.com"]])).id;
  // 140 por una pieza de 1,140 (el cajero edita el precio: el inventario cuadra y ninguna auditoría de cantidades lo ve) + una a catálogo + una con autorización
  const vMal = await venta({ sede, usuario: "r@g.com", turno, lineas: [{ producto: { id: E.p1.id, nombre: "Pieza de 1,140" }, precio: 1140, importe: 140 }] });
  await venta({ sede, usuario: "r@g.com", turno, cobradaEn: "now() - interval '20 days'", lineas: [{ producto: E.p1, precio: 1000, importe: 1000 }] });   // cuando el catálogo aún valía 1,000
  await venta({ sede, usuario: "p@g.com", lineas: [{ producto: E.p2, precio: 200, importe: 150, motivo: "Cortesía", autorizacion: aut }] });
  await owner(); await c.query("insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio) values ($1, 'producto', $2, piefirme_app.ctl_hoy($1) - 10, 1140, 'fijo')", [ORG, E.p1.id]);
  const r = await bien("m@g.com", "ctl_rep_ventas_bajo_catalogo", [JSON.stringify({ sucursal: sede })]);
  assert.equal(r.total_filas, 2); assert.equal(num(r.totales.monto), 1050); assert.equal(r.totales.tickets, 2);
  const mal = r.filas.find((x) => x.ticket === vMal.folio);
  assert.equal(num(mal.catalogo), 1140, "precio de catálogo vigente al momento de la venta"); assert.equal(num(mal.cobrado), 140); assert.equal(num(mal.diferencia), 1000); assert.equal(mal.caja, "Caja 2");
  assert.equal(mal.cajero, "Recepción Prueba"); assert.equal(mal.motivo, null); assert.equal(mal.autorizador, null); assert.equal(r.totales.sin_motivo_ni_autorizador, 1);
  const cort = r.filas.find((x) => x.ticket !== vMal.folio); assert.equal(cort.motivo, "Cortesía"); assert.equal(cort.autorizador, "Administrador Prueba"); assert.equal(num(cort.diferencia), 50);
  assert.deepEqual(r.filas.map((x) => num(x.diferencia)), [1000, 50], "mayor diferencia primero");
  assert.equal(r.por_cajero.length, 2); assert.equal(num(r.por_cajero.find((x) => x.cajero_id === ids["r@g.com"]).monto), 1000); assert.equal(num(r.por_sucursal[0].monto), 1050);
  assert.ok(r.limitaciones.length >= 3 && r.limitaciones.join(" ").includes("servicios"), "lo que falta del origen se declara");
  assert.equal((await bien("m@g.com", "ctl_rep_ventas_bajo_catalogo", [JSON.stringify({ sucursal: sede, cajero: ids["p@g.com"] })])).total_filas, 1, "filtro por cajero");
  assert.equal((await bien("s@g.com", "ctl_rep_ventas_bajo_catalogo", [JSON.stringify({ sucursal: sede })])).total_filas, 2);
  assert.ok(await consultas("m@g.com", "ventas_bajo_catalogo") >= 2);
  // una venta cancelada no cuenta; una sucursal ajena no devuelve nada
  await venta({ sede, usuario: "r@g.com", estado: "cancelada", cobradaEn: "null", canceladaEn: "now()", lineas: [{ producto: E.p3, precio: 100, importe: 10 }] });
  assert.equal((await bien("m@g.com", "ctl_rep_ventas_bajo_catalogo", [JSON.stringify({ sucursal: sede })])).total_filas, 2);
  assert.equal((await bien("m@g.com", "ctl_rep_ventas_bajo_catalogo", [JSON.stringify({ sucursal: E.A })])).total_filas, 0);
});

test("aperturas de cajón sin venta: sin evento del origen responde estado vacío honesto; con eventos, por cajero y sucursal con comparativo (F1.5)", async (t) => {
  const sede1 = await crearSede("Cajón 1"), sede2 = await crearSede("Cajón 2"); const turno = await turnoCaja(sede1, "r@g.com");
  await sub(t, "el origen aún no emite el evento", async () => {
    await owner(); await c.query("delete from piefirme.ctl_apertura_cajon where organizacion_id = $1", [ORG]).catch(() => {});
    await owner(); const hay = (await uno("select count(*)::int as n from piefirme.ctl_eventos_entrada where evento = 'cajon_abierto_sin_venta'")).n;
    if (hay === 0) {
      const r = await bien("m@g.com", "ctl_rep_cajon", ["{}"]);
      assert.equal(r.origen_activo, false); assert.equal(r.aperturas, 0); assert.match(r.aviso_origen, /todavía no emite/); assert.deepEqual(r.filas, []);
    }
  });
  await sub(t, "con eventos: se llena la tabla, idempotente por evento, y el comparativo por 100 tickets", async () => {
    await venta({ sede: sede1, usuario: "r@g.com", turno, lineas: [{ producto: E.p1, precio: 1000, importe: 1000 }] }); await venta({ sede: sede1, usuario: "r@g.com", turno, lineas: [{ producto: E.p2, precio: 200, importe: 200 }] });
    await venta({ sede: sede2, usuario: "p@g.com", lineas: [{ producto: E.p3, precio: 100, importe: 100 }] }); await venta({ sede: sede2, usuario: "p@g.com", lineas: [{ producto: E.p4, precio: 40, importe: 40 }] });
    await owner();
    const ev = async (sede, usuario, extra = {}) => (await uno(`insert into piefirme.ctl_eventos_entrada (organizacion_id, evento, id_externo, payload) values ($1, 'cajon_abierto_sin_venta', $2, $3) returning id`,
      [ORG, `cj-${randomUUID()}`, JSON.stringify({ sucursal_id: sede, usuario_id: ids[usuario], caja: "Caja 1", motivo: "Dar cambio", ...extra })])).id;
    const e1 = await ev(sede1, "r@g.com"); await ev(sede1, "r@g.com"); await ev(sede1, "r@g.com"); await ev(sede2, "p@g.com");
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_apertura_cajon where evento_id = $1", [e1])).n, 1);
    const malo = await intentar("insert into piefirme.ctl_eventos_entrada (organizacion_id, evento, id_externo, payload) values ($1, 'cajon_abierto_sin_venta', $2, '{\"caja\":\"X\"}')", [ORG, `cj-${randomUUID()}`]);
    assert.ok(malo.ok, "un evento sin sucursal no debe frenar al origen (solo avisa)");
    const r = await bien("m@g.com", "ctl_rep_cajon", [JSON.stringify({ sucursales: [sede1, sede2] })]);
    assert.equal(r.origen_activo, true); assert.equal(r.aperturas, 4); assert.equal(r.tickets, 4); assert.equal(num(r.promedio_por_100_tickets), 100);
    const s1 = r.por_sucursal.find((x) => x.sucursal_id === sede1), s2 = r.por_sucursal.find((x) => x.sucursal_id === sede2);
    assert.equal(s1.aperturas, 3); assert.equal(s2.aperturas, 1); assert.equal(num(s1.por_100_tickets), 150); assert.equal(num(s2.por_100_tickets), 50);
    assert.equal(r.por_cajero[0].cajero, "Recepción Prueba"); assert.equal(r.por_cajero[0].aperturas, 3); assert.equal(r.filas[0].motivo, "Dar cambio");
    assert.match(r.nota, /indicador para investigar/i);
    assert.equal((await bien("m@g.com", "ctl_rep_cajon", [JSON.stringify({ sucursal: sede2 })])).aperturas, 1, "filtro por sucursal");
  });
});

test("mezcla de formas de pago: por monto, con el promedio de la cadena y siempre como indicador para investigar (F1.6)", async () => {
  const s1 = await crearSede("Mezcla 1"), s2 = await crearSede("Mezcla 2");
  const venderN = async (sede, usuario, n, metodo) => { for (let i = 0; i < n; i++) await venta({ sede, usuario, lineas: [{ producto: E.p2, precio: 100, importe: 100 }], pagos: [{ metodo, monto: 100 }] }); };
  await venderN(s1, "r@g.com", 8, "efectivo"); await venderN(s1, "r@g.com", 2, "tarjeta");   // 80 % efectivo
  await venderN(s2, "p@g.com", 3, "efectivo"); await venderN(s2, "p@g.com", 6, "clip"); await venderN(s2, "p@g.com", 1, "transferencia");   // 30 % efectivo, 60 % tarjeta (Clip cuenta como tarjeta)
  const r = await bien("m@g.com", "ctl_rep_mezcla_pago", [JSON.stringify({ sucursales: [s1, s2], minimo_tickets: 10, umbral_pp: 15 })]);
  assert.equal(r.cadena.tickets, 20); assert.equal(num(r.cadena.efectivo), 1100); assert.equal(num(r.cadena.tarjeta), 800); assert.equal(num(r.cadena.otros), 100); assert.equal(num(r.cadena.pct_efectivo), 55); assert.equal(num(r.cadena.pct_tarjeta), 40);
  const a = r.por_sucursal.find((x) => x.sucursal_id === s1), b = r.por_sucursal.find((x) => x.sucursal_id === s2);
  assert.equal(num(a.pct_efectivo), 80); assert.equal(num(a.desviacion_pp), 25); assert.equal(a.muestra_suficiente, true); assert.equal(a.para_investigar, true);
  assert.equal(num(b.pct_efectivo), 30); assert.equal(num(b.pct_tarjeta), 60); assert.equal(num(b.desviacion_pp), -25); assert.equal(b.para_investigar, true);
  assert.equal(r.por_cajero.length, 2); assert.equal(r.por_cajero.find((x) => x.cajero_id === ids["r@g.com"]).tickets, 10);
  assert.match(r.aviso, /Indicador para investigar, no un hallazgo/); assert.doesNotMatch(JSON.stringify(r), /hallazgo confirmado|culpable|robo/i);
  const poca = await bien("m@g.com", "ctl_rep_mezcla_pago", [JSON.stringify({ sucursales: [s1, s2], minimo_tickets: 30 })]);
  assert.ok(poca.por_sucursal.every((x) => x.muestra_suficiente === false && x.para_investigar === false), "con muestra insuficiente no se marca nada");
  const cajero = await bien("m@g.com", "ctl_rep_mezcla_pago", [JSON.stringify({ sucursales: [s1, s2], cajero: ids["p@g.com"] })]); assert.equal(cajero.cadena.tickets, 10);
  assert.ok(await consultas("m@g.com", "mezcla_pago") >= 3);
});

// ═════════════════════════════ 4 · TABLERO DE DUEÑO (F7.2) ═════════════════════════════
test("tablero: apertura y cierre del día, entrega sin aceptar, auditoría remota en curso, casos por antigüedad, tendencia y salud de sincronización", async (t) => {
  const t0 = await bien("m@g.com", "ctl_tablero", [30]);
  assert.ok(t0.sucursales.length >= 2 && t0.casos.cubetas.length === 5 && t0.diferencia.tendencia.length === 30);
  const a = t0.sucursales.find((x) => x.id === E.A);
  assert.equal(a.usa_modulo, true); assert.equal(a.apertura, "hecha", "el conteo de apertura de hoy ya se cerró"); assert.ok(["pendiente", "tarde"].includes(a.cierre), "todavía no hay cierre");
  assert.equal(a.casos_abiertos, 2); assert.ok(a.alertas_sin_atender >= 0);
  assert.equal(num(t0.diferencia.periodo.faltante_valor) >= 1020, true);
  const hoy = t0.diferencia.tendencia.at(-1); assert.ok(num(hoy.faltante) >= 1020 && hoy.fecha === t0.hoy, "la tendencia incluye hoy");
  // sucursal que nunca usó el módulo
  const nueva = await crearSede("Sin módulo"); const sn = (await bien("m@g.com", "ctl_tablero", [30])).sucursales.find((x) => x.id === nueva);
  assert.equal(sn.usa_modulo, false); assert.equal(sn.apertura, "sin_modulo"); assert.equal(sn.cierre, "sin_modulo"); assert.equal(sn.sin_sync, false);
  // entrega no aceptada (criterio 18) y auditoría remota en curso
  await owner();
  const cierre = await uno(`insert into piefirme.ctl_cierre (organizacion_id, sucursal_id, tipo, usuario_cierra, estado, cerrado_en) values ($1, $2, 'turno', $3, 'entrega_no_aceptada', now()) returning id, folio`, [ORG, E.B, ids["r@g.com"]]);
  await c.query("insert into piefirme.ctl_entrega (organizacion_id, sucursal_id, cierre_id, usuario_entrega, monto_entregado, estado) values ($1, $2, $3, $4, 3200, 'pendiente')", [ORG, E.B, cierre.id, ids["r@g.com"]]);
  const rem = await bien("m@g.com", "ctl_remota_lanzar", [[E.B], 2, 60, true, "prueba del tablero"]); assert.equal(rem.sesiones.length, 1);
  const t1 = await bien("m@g.com", "ctl_tablero", [30]);
  const e = t1.entregas_no_aceptadas.find((x) => x.cierre_folio === cierre.folio);
  assert.ok(e && e.sucursal_id === E.B && num(e.monto_entregado) === 3200 && e.usuario_entrega === "Recepción Prueba"); assert.equal(t1.sucursales.find((x) => x.id === E.B).entregas_pendientes, 1);
  assert.equal(t1.resumen.entregas_no_aceptadas, t0.resumen.entregas_no_aceptadas + 1);
  const rr = t1.remotas_en_curso.find((x) => x.sucursal_id === E.B); assert.ok(rr && rr.en_lista >= 1 && rr.reportadas === 0 && rr.minutos_restantes > 0 && rr.minutos_restantes <= 60); assert.equal(t1.resumen.remotas_en_curso, t0.resumen.remotas_en_curso + 1);
  // sin sincronizar: una sucursal cuya última señal es de hace 3 días (umbral 24 h)
  const vieja = await crearSede("Vieja"); await owner();
  await c.query("set local session_replication_role = replica");
  await c.query("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado, abierta_en, cerrada_en, creado_en) values ($1, $2, 'conteo_apertura', 'completa', 'cerrada', now() - interval '3 days', now() - interval '3 days', now() - interval '3 days')", [ORG, vieja]);
  await c.query("set local session_replication_role = origin");
  const t2 = await bien("m@g.com", "ctl_tablero", [30]); const sv = t2.sucursales.find((x) => x.id === vieja);
  assert.equal(sv.sin_sync, true); assert.ok(num(sv.horas_sin_sync) >= 71); assert.equal(t2.resumen.sin_sincronizar, t1.resumen.sin_sincronizar + 1); assert.equal(a.sin_sync, false);
  // la hora configurada de apertura/cierre cambia la lectura («tarde») de una sucursal que operó hoy sin cierre
  await owner(); await c.query("set local session_replication_role = replica");
  await c.query("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, cajero_id, apertura_en, fondo_inicial, estado) values ($1, $2, 'C9', $3, now(), 100, 'abierto')", [ORG, E.A, ids["r@g.com"]]);
  await c.query("set local session_replication_role = origin");
  await bien("m@g.com", "ctl_config_guardar", ["alertas_hora_sin_cierre", null, JSON.stringify(0), false, "prueba"]);
  assert.equal((await bien("m@g.com", "ctl_tablero", [30])).sucursales.find((x) => x.id === E.A).cierre, "tarde", "operó hoy, no hay cierre y ya pasó la hora configurada");
  await bien("m@g.com", "ctl_config_guardar", ["alertas_hora_sin_cierre", null, JSON.stringify(23), false, "prueba"]);
  if (new Date().getUTCHours() - 6 < 23) assert.equal((await bien("m@g.com", "ctl_tablero", [30])).sucursales.find((x) => x.id === E.A).cierre, "pendiente");
  assert.ok(await consultas("m@g.com", "tablero") >= 4);
});

// ═════════════════════════════ 5 · ALERTAS (F7.3) ═════════════════════════════
test("catálogo: los diez eventos de la especificación existen con canal y destinatario por evento", async () => {
  const r = await bien("m@g.com", "ctl_alertas_reglas");
  const por = Object.fromEntries(r.eventos.map((e) => [e.tipo, e]));
  for (const tipo of ["cancelacion_autorizada", "venta_alto_valor", "relevo_con_diferencia", "diferencia_relevo", "cierre_fuera_tolerancia", "sello_roto_sin_registro", "folio_faltante", "folio_faltante_diario", "peso_fuera_de_rango", "sucursal_se_cae", "sin_conteo_apertura", "sin_cierre",
                      "posible_sustitucion_codigo", "kits_sin_ticket", "ajuste_fallido"]) assert.ok(por[tipo], `falta el evento ${tipo}`);
  assert.deepEqual(por.cancelacion_autorizada.canales, ["push", "whatsapp"]); assert.deepEqual(por.cancelacion_autorizada.destinatarios, ["dueno"]); assert.deepEqual(por.sello_roto_sin_registro.destinatarios, ["supervisor"]);
  assert.deepEqual(por.folio_faltante.canales, ["correo"]); assert.equal(por.folio_faltante.inmediata, false, "correo diario"); assert.equal(por.folio_talonario_faltante, undefined, "el nombre provisional se retiró");
  assert.deepEqual(por.diferencia_relevo.destinatarios.sort(), ["dueno", "supervisor"]); assert.equal(r.simulado, true); assert.match(r.aviso, /SIMULADOS/);
  assert.equal(r.eventos.filter((e) => e.fuente === "especificacion").length >= 12, true);
});

// QA es una base compartida: otras corridas (PWA, cierres) ya dejaron alertas de hoy y los dueños pueden haber llegado a su techo. Estas pruebas miden RELATIVO a lo que ya hay.
const hoyDe = async (correo) => { const d = await bien("m@g.com", "ctl_alerta_destinatarios_listar"); return d.destinatarios.find((x) => x.usuario_id === ids[correo]); };
const fijarTecho = (correo, techo) => bien("m@g.com", "ctl_alerta_destinatario_guardar", [ids[correo], techo, true, "prueba"]);

test("techo diario por destinatario: pasado el techo se avisa UNA vez y lo demás se agrupa; el resumen diario junta lo agrupado (criterio de diseño de F7.3)", async (t) => {
  const m0 = await hoyDe("m@g.com");
  await fijarTecho("m@g.com", m0.enviadas_hoy + 2); await fijarTecho("s@g.com", 200);
  const sede = E.A; const ids_ = [];
  for (let i = 0; i < 5; i++) ids_.push(await alerta(sede, "cierre_fuera_tolerancia", `RPT A: cierre ${i} fuera de tolerancia`, randomUUID()));
  const delM = (await Promise.all(ids_.map((id) => envios(id, ids["m@g.com"])))).flat();
  const indiv = delM.filter((x) => x.modo === "individual"), agrup = delM.filter((x) => x.modo === "pendiente_resumen");
  assert.equal(indiv.length, 2, "dos alertas inmediatas más (el techo propio de m es lo ya enviado hoy + 2)"); assert.equal(agrup.length, 3, "las otras tres se agrupan");
  assert.ok(indiv.every((x) => x.canal === "push" && x.simulado === true), "canal Push SIMULADO"); assert.ok(agrup.every((x) => x.canal === "correo" && x.payload.por_techo === true));
  await owner();
  const avisos = await filas("select * from piefirme.ctl_alerta_envio where destinatario_id = $1 and modo = 'aviso_techo' and fecha_local = piefirme_app.ctl_hoy($2)", [ids["m@g.com"], ORG]);
  assert.equal(avisos.length, 1, "UN solo aviso de techo alcanzado por persona y día, por muchas alertas que se agrupen"); assert.match(avisos[0].mensaje, /techo diario/);
  // la supervisora (techo propio alto) recibe las cinco: la regla incluye dueño y supervisor
  const delS = (await Promise.all(ids_.map((id) => envios(id, ids["s@g.com"])))).flat(); assert.equal(delS.filter((x) => x.modo === "individual").length, 5);
  // el soporte RANNIX no es destinatario de alertas de dueño aunque su perfil sea administrador
  assert.equal((await Promise.all(ids_.map((id) => envios(id, ids["a@g.com"])))).flat().length, 0);
  // los eventos de «solo resumen» (folio de talonario) no cuentan para el techo
  const antes = await hoyDe("m@g.com");
  const idF = await alerta(sede, "folio_faltante", "RPT A: falta el folio 7 del talonario T-1", randomUUID());
  const f = await envios(idF, ids["m@g.com"]); assert.deepEqual(f.map((x) => x.modo), ["pendiente_resumen"]); assert.equal(f[0].canal, "correo");
  assert.equal((await hoyDe("m@g.com")).enviadas_hoy, antes.enviadas_hoy, "no cuenta para el techo");
  // resumen diario: un correo por persona con lo agrupado y lo que sigue sin atender; idempotente
  const agrupadasM = (await hoyDe("m@g.com")).agrupadas_hoy;
  const res = await bien("m@g.com", "ctl_resumen_diario_ahora", [null]); assert.ok(res.resumenes >= 1);
  await owner();
  const rd = await uno("select * from piefirme.ctl_alerta_envio where destinatario_id = $1 and modo = 'resumen_diario' and fecha_local = piefirme_app.ctl_hoy($2)", [ids["m@g.com"], ORG]);
  assert.equal(rd.canal, "correo"); assert.equal(rd.simulado, true); assert.equal(rd.payload.agrupadas, agrupadasM, "lo agrupado de hoy (por techo y de solo resumen)"); assert.equal(rd.payload.techo_alcanzado, true);
  assert.match(rd.mensaje, /Resumen diario de auditoría/); assert.match(rd.mensaje, /Se alcanzó el techo diario/); assert.match(rd.mensaje, /Folio de talonario faltante: [1-9]/); assert.match(rd.mensaje, /Cierre fuera de tolerancia: [3-9]|Cierre fuera de tolerancia: \d{2,}/);
  assert.ok(rd.payload.por_tipo.some((x) => x.tipo === "folio_faltante" && x.n >= 1));
  const otra = await bien("m@g.com", "ctl_resumen_diario_ahora", [null]); assert.equal(otra.resumenes, 0, "no se duplica"); assert.ok(otra.ya_generados >= 1);
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_alerta_envio where destinatario_id = $1 and modo = 'resumen_diario' and fecha_local = piefirme_app.ctl_hoy($2)", [ids["m@g.com"], ORG])).n, 1);
  // techo propio vs general: la lista de destinatarios lo muestra
  const m = await hoyDe("m@g.com");
  assert.equal(m.techo_propio, m0.enviadas_hoy + 2); assert.equal(m.techo_efectivo, m.techo_propio); assert.equal(m.enviadas_hoy, m0.enviadas_hoy + 2); assert.ok(m.agrupadas_hoy >= 4); assert.ok(!(await bien("m@g.com", "ctl_alerta_destinatarios_listar")).destinatarios.some((x) => x.usuario_id === ids["a@g.com"]));
  assert.equal((await rpc("m@g.com", "ctl_alerta_destinatario_guardar", [ids["m@g.com"], 500, true, null])).code, "PF422", "el techo propio va de 1 a 200");
  assert.equal((await rpc("m@g.com", "ctl_alerta_destinatario_guardar", [ids["r@g.com"], 5, true, null])).code, "PF422", "un cajero no es destinatario");
  // un destinatario que apaga sus alertas deja de recibirlas
  await bien("m@g.com", "ctl_alerta_destinatario_guardar", [ids["s@g.com"], null, false, null]);
  const idQ = await alerta(sede, "cierre_fuera_tolerancia", "RPT A: otra", randomUUID()); assert.equal((await envios(idQ, ids["s@g.com"])).length, 0);
  await fijarTecho("m@g.com", 200); await bien("m@g.com", "ctl_alerta_destinatario_guardar", [ids["s@g.com"], 200, true, null]);
});

test("reglas por evento: se cambian por el dueño, quedan versionadas y se respetan al despachar; una regla apagada no avisa a nadie", async () => {
  await fijarTecho("m@g.com", 200); await fijarTecho("s@g.com", 200);
  const antes = (await bien("m@g.com", "ctl_alertas_reglas")).eventos.find((e) => e.tipo === "kits_sin_ticket"); assert.equal(antes.personalizada, false);
  await bien("m@g.com", "ctl_alerta_regla_guardar", ["kits_sin_ticket", ["push", "whatsapp"], ["dueno", "supervisor"], true, true, "prueba"]);
  const a1 = await alerta(E.A, "kits_sin_ticket", "RPT A: se usaron 12 kits y se cobraron 10", randomUUID());
  const e1 = await envios(a1, ids["m@g.com"]); assert.deepEqual(e1.map((x) => x.canal).sort(), ["push", "whatsapp"], "dos canales: dos avisos simulados"); assert.ok(e1.every((x) => x.modo === "individual"));
  assert.deepEqual((await envios(a1, ids["s@g.com"])).map((x) => x.canal).sort(), ["push", "whatsapp"], "ahora también la supervisora");
  await bien("m@g.com", "ctl_alerta_regla_guardar", ["kits_sin_ticket", ["push"], ["dueno"], true, false, "se apaga para la prueba"]);
  const a2 = await alerta(E.A, "kits_sin_ticket", "RPT A: otro", randomUUID()); const e2 = await envios(a2); assert.deepEqual(e2.map((x) => x.modo), ["regla_desactivada"]);
  await owner();
  const versiones = await filas("select activa, canales from piefirme.ctl_alerta_regla where organizacion_id = $1 and tipo = 'kits_sin_ticket' order by creado_en, id", [ORG]);
  assert.equal(versiones.length, 2, "cada cambio es una fila nueva (versionado)"); assert.equal(versiones.filter((v) => v.activa === false).length, 1);
  assert.equal((await rpc("m@g.com", "ctl_alerta_regla_guardar", ["inventado", ["push"], ["dueno"], true, true, null])).code, "PF400");
  assert.equal((await rpc("m@g.com", "ctl_alerta_regla_guardar", ["sin_cierre", ["paloma"], ["dueno"], true, true, null])).code, "PF422");
  assert.equal((await rpc("m@g.com", "ctl_alerta_regla_guardar", ["sin_cierre", ["push"], [], true, true, null])).code, "PF422");
  assert.equal((await bien("a@g.com", "ctl_alertas_reglas")).eventos.find((e) => e.tipo === "kits_sin_ticket").activa, false, "el soporte la ve");
  await bien("a@g.com", "ctl_alerta_regla_guardar", ["kits_sin_ticket", ["push"], ["dueno"], true, true, "el soporte puede configurar"]);   // soporte tiene «configurar»
});

test("bandeja: marcar vista y atendida solo por dueño o supervisor, con nota; el soporte solo lee; no se re-atiende", async () => {
  const id = await alerta(E.A, "sin_cierre", "RPT A: sin cierre", randomUUID());
  const l0 = await bien("m@g.com", "ctl_alertas_listar", [JSON.stringify({ sucursal: E.A })]); assert.ok(l0.alertas.some((x) => x.id === id && x.estado === "nueva"));
  assert.ok(l0.alertas.every((x) => ["nueva", "vista"].includes(x.estado)), "por omisión solo lo sin atender");
  assert.equal((await rpc("a@g.com", "ctl_alerta_atender", [[id], "atendida", null])).code, "PF403");
  assert.equal((await bien("s@g.com", "ctl_alerta_atender", [[id], "vista", null])).cambiadas, 1);
  assert.equal((await bien("s@g.com", "ctl_alerta_atender", [[id], "vista", null])).cambiadas, 0, "ya estaba vista");
  assert.equal((await bien("m@g.com", "ctl_alerta_atender", [[id], "atendida", "Se habló con la encargada"])).cambiadas, 1);
  assert.equal((await bien("m@g.com", "ctl_alerta_atender", [[id], "atendida", "otra vez"])).cambiadas, 0);
  await owner(); const a = await uno("select * from piefirme.ctl_alerta where id = $1", [id]);
  assert.equal(a.estado, "atendida"); assert.equal(a.atendida_por, ids["m@g.com"]); assert.equal(a.nota_atencion, "Se habló con la encargada"); assert.ok(a.atendida_en && a.vista_en);
  assert.equal((await rpc("m@g.com", "ctl_alerta_atender", [[id], "borrada", null])).code, "PF422");
  const atendidas = await bien("m@g.com", "ctl_alertas_listar", [JSON.stringify({ estado: "atendida", sucursal: E.A })]); assert.ok(atendidas.alertas.some((x) => x.id === id && x.atendida_por === "Administrador Prueba"));
  const filtrada = await bien("m@g.com", "ctl_alertas_listar", [JSON.stringify({ estado: "todas", tipo: "sin_cierre", severidad: "alta" })]); assert.ok(filtrada.alertas.every((x) => x.tipo === "sin_cierre" && x.severidad === "alta"));
  // una alerta de otra clínica no se puede atender
  await owner(); const otra = (await uno("insert into piefirme.organizaciones (nombre) values ('RPT otra clínica (se deshace)') returning id")).id;
  const ajena = (await uno("select piefirme_app.ctl_alerta_nueva($1, null, 'sin_cierre', 'ajena', null, null) as id", [otra])).id;
  assert.equal((await bien("m@g.com", "ctl_alerta_atender", [[ajena], "atendida", null])).cambiadas, 0);
  assert.ok(!(await bien("m@g.com", "ctl_alertas_listar", [JSON.stringify({ estado: "todas" })])).alertas.some((x) => x.id === ajena));
});

test("la misma alerta no se duplica, y un fallo del despacho nunca frena la operación que la generó", async () => {
  const ref = randomUUID();
  const a = await alerta(E.A, "posible_sustitucion_codigo", "RPT: sustitución", ref), b = await alerta(E.A, "posible_sustitucion_codigo", "RPT: sustitución (otra vez)", ref);
  assert.equal(a, b, "misma referencia = misma alerta");
  await owner(); assert.equal((await uno("select count(*)::int as n from piefirme.ctl_alerta_envio where alerta_id = $1", [a])).n >= 1, true, "se despachó (individual o agrupada, según el techo de hoy)");
  // evento desconocido emitido a mano en la tabla: se despacha como push inmediato al destinatario que indicó quien lo emitió
  const x = (await uno("insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, destinatarios, mensaje) values ($1, $2, 'evento_nuevo', array['supervisor'], 'RPT evento nuevo') returning id", [ORG, E.A])).id;
  const e = await envios(x); assert.ok(e.length >= 1 && e.every((r) => r.rol_destinatario === "supervisor" && ["push", "correo"].includes(r.canal)));
  assert.equal((await intentar("select piefirme_app.ctl_alerta_nueva($1, $2, 'inventado', 'x')", [ORG, E.A])).code, "PF400");
  // despachar de nuevo no repite
  assert.equal((await uno("select piefirme_app.ctl_alerta_despachar($1) as n", [x])).n, 0);
});

test("evaluaciones programadas: sin conteo de apertura y sin cierre a la hora configurada, una vez por día; sin sincronizar; cancelaciones y piezas de alto valor", async (t) => {
  const sede = await crearSede("Programadas"); const p = await crearProducto("Alto valor", 900, { precio: 2000 }); const turno = await turnoCaja(sede, "r@g.com");
  await existencia(sede, p.id, 3);
  await owner();
  // la sucursal ya usó el módulo (un conteo de apertura de ayer) y HOY operó (una venta cobrada)
  await c.query("set local session_replication_role = replica");
  await c.query("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado, abierta_en, cerrada_en, creado_en) values ($1, $2, 'conteo_apertura', 'completa', 'cerrada', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day')", [ORG, sede]);
  await c.query("set local session_replication_role = origin");
  await venta({ sede, usuario: "r@g.com", turno, lineas: [{ producto: p, precio: 2000, importe: 2000 }] });
  const ahoraLocal = async (hora) => (await uno("select (((piefirme_app.ctl_hoy($1)::timestamp + make_interval(hours => $2::int, mins => 30)) at time zone piefirme_app.ctl_zona($1)))::text as t", [ORG, hora])).t;
  const evaluar = async (hora) => { await owner(); return (await uno("select piefirme_app.ctl_alertas_programadas_org($1, $2::timestamptz) as r", [ORG, await ahoraLocal(hora)])).r; };
  const delDia = async (tipo) => { await owner(); return (await filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = $2 and referencia_id = $3", [ORG, tipo, sede])); };
  await sub(t, "antes de la hora configurada no se alerta", async () => {
    await owner(); await c.query("select 1");
    await bien("m@g.com", "ctl_config_guardar", ["alertas_hora_sin_apertura", null, JSON.stringify(11), false, "prueba"]); await bien("m@g.com", "ctl_config_guardar", ["alertas_hora_sin_cierre", null, JSON.stringify(22), false, "prueba"]);
    await evaluar(9);
    assert.equal((await delDia("sin_conteo_apertura")).length, 0); assert.equal((await delDia("sin_cierre")).length, 0);
  });
  await sub(t, "a la hora configurada: sin conteo de apertura (11:00) y, más tarde, sin cierre (22:00); una sola vez por día", async () => {
    const r1 = await evaluar(11); assert.ok(r1.sin_conteo_apertura >= 1); assert.equal((await delDia("sin_conteo_apertura")).length, 1); assert.equal((await delDia("sin_cierre")).length, 0, "todavía no es la hora del cierre");
    const r2 = await evaluar(12); assert.equal((await delDia("sin_conteo_apertura")).length, 1, "no se repite el mismo día");
    const r3 = await evaluar(22); assert.equal((await delDia("sin_cierre")).length, 1); const r4 = await evaluar(23); assert.equal((await delDia("sin_cierre")).length, 1);
    const a = (await delDia("sin_cierre"))[0]; assert.match(a.mensaje, /ya operó hoy y no hay cierre/); assert.equal(a.severidad, "alta"); assert.equal(r2.sin_conteo_apertura >= 0, true); assert.equal(r4.sin_cierre >= 0, true); assert.equal(r3.hora_local, 22);
    const dueño = await envios(a.id, ids["m@g.com"]); assert.ok(dueño.length >= 1, "el dueño recibe el aviso simulado"); assert.equal((await envios(a.id, ids["s@g.com"])).length, 0, "la regla es solo para dueños");
  });
  await sub(t, "la hora es configurable por el dueño y un cierre hecho evita la alerta", async () => {
    const s2 = await crearSede("Programadas 2"); await owner();
    await c.query("set local session_replication_role = replica");
    await c.query("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado, abierta_en, cerrada_en, creado_en) values ($1, $2, 'conteo_apertura', 'completa', 'cerrada', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day')", [ORG, s2]);
    await c.query("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado, abierta_en, cerrada_en, creado_en) values ($1, $2, 'conteo_apertura', 'completa', 'cerrada', now(), now(), now())", [ORG, s2]);
    await c.query("insert into piefirme.ctl_cierre (organizacion_id, sucursal_id, tipo, usuario_cierra, estado, cerrado_en) values ($1, $2, 'dia', $3, 'cerrado', now())", [ORG, s2, ids["r@g.com"]]);
    await c.query("set local session_replication_role = origin");
    await venta({ sede: s2, usuario: "r@g.com", lineas: [{ producto: p, precio: 2000, importe: 2000 }] });
    await evaluar(23); assert.equal((await filas("select 1 from piefirme.ctl_alerta where organizacion_id = $1 and sucursal_id = $2 and tipo in ('sin_cierre', 'sin_conteo_apertura')", [ORG, s2])).length, 0, "con apertura y cierre hechos no se alerta");
    await bien("m@g.com", "ctl_config_guardar", ["alertas_hora_sin_cierre", sede, JSON.stringify(23), false, "por sucursal"]);   // la hora puede ser por sucursal
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["alertas_hora_sin_cierre", sede, JSON.stringify(30), false, "fuera de rango"])).code, "PF422", "la hora va de 0 a 23");
  });
  await sub(t, "cancelaciones y ventas de piezas de alto valor del origen", async () => {
    await owner(); await c.query("insert into piefirme.ctl_producto_atributo (organizacion_id, producto_id, alto_valor, requiere_serie) values ($1, $2, true, true)", [ORG, p.id]);
    const hoyNow = (await uno("select now() as t")).t;
    const v = await venta({ sede, usuario: "r@g.com", turno, lineas: [{ producto: p, precio: 2000, importe: 2000 }] });
    const canc = await venta({ sede, usuario: "r@g.com", estado: "cancelada", cobradaEn: "null", canceladaEn: "now()", lineas: [{ producto: E.p3, precio: 100, importe: 100 }] });
    await owner(); const r = (await uno("select piefirme_app.ctl_alertas_programadas_org($1, now()) as r", [ORG])).r;
    assert.ok(r.cancelaciones >= 1 && r.ventas_alto_valor >= 1, JSON.stringify(r));
    const al = await filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = 'venta_alto_valor' and sucursal_id = $2", [ORG, sede]);
    assert.ok(al.length >= 1 && /alto valor/i.test(al[0].mensaje) && al[0].mensaje.includes("2,000.00"), "la detecta la Etapa 7 (qué pieza, qué sucursal, a qué precio) y el motor de alertas la despacha: " + al[0]?.mensaje);
    assert.equal(al[0].severidad, "critica"); assert.ok((await envios(al[0].id, ids["m@g.com"])).length >= 1, "el dueño la recibe (simulada)");
    const ca = await filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = 'cancelacion_autorizada' and referencia_id = $2", [ORG, canc.id]); assert.equal(ca.length, 1);
    const ca2 = await filas("select * from piefirme.ctl_alerta_envio where alerta_id = $1 and canal = 'whatsapp'", [ca[0].id]); assert.ok(ca2.length >= 1, "push y WhatsApp (simulados) al dueño");
    const r2 = (await uno("select piefirme_app.ctl_alertas_programadas_org($1, now()) as r", [ORG])).r; assert.equal(r2.ventas_alto_valor, 0, "no repite la misma venta"); assert.equal(r2.cancelaciones, 0);
    assert.ok(hoyNow && v.id);
  });
  await sub(t, "sin sincronizar: una sucursal sin señal en más de las horas configuradas genera un aviso para el resumen", async () => {
    const vieja = await crearSede("Sin señal"); await owner();
    await c.query("set local session_replication_role = replica");
    await c.query("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado, abierta_en, cerrada_en, creado_en) values ($1, $2, 'conteo_apertura', 'completa', 'cerrada', now() - interval '4 days', now() - interval '4 days', now() - interval '4 days')", [ORG, vieja]);
    await c.query("set local session_replication_role = origin");
    const r = (await uno("select piefirme_app.ctl_alertas_programadas_org($1, now()) as r", [ORG])).r; assert.ok(r.sin_sincronizar >= 1);
    const al = (await filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = 'sin_sincronizar' and referencia_id = $2", [ORG, vieja]))[0]; assert.match(al.mensaje, /no ha enviado nada al módulo/);
    assert.deepEqual((await envios(al.id, ids["m@g.com"])).map((x) => x.modo), ["pendiente_resumen"], "va al resumen diario, no al celular");
  });
  await sub(t, "el botón «Evaluar ahora» del dueño corre la misma evaluación; el supervisor no", async () => {
    const r = await bien("m@g.com", "ctl_alertas_evaluar_ahora"); assert.equal(r.organizacion_id, ORG); assert.ok("sin_cierre" in r);
    assert.equal((await rpc("s@g.com", "ctl_alertas_evaluar_ahora")).code, "PF403");
  });
  assert.ok(true);
});

test("el registro de lo que se habría enviado se puede consultar con sus filtros y rotula todo como simulado", async () => {
  const r = await bien("m@g.com", "ctl_alertas_envios_listar", [JSON.stringify({ limite: 50 })]);
  assert.equal(r.simulado, true); assert.ok(r.envios.length > 0 && r.envios.every((x) => x.simulado === true && x.mensaje));
  assert.ok(Object.keys(r.por_modo).includes("individual"));
  const solo = await bien("m@g.com", "ctl_alertas_envios_listar", [JSON.stringify({ modo: "aviso_techo" })]); assert.ok(solo.envios.every((x) => x.modo === "aviso_techo"));
  assert.ok((await bien("a@g.com", "ctl_alertas_envios_listar", ["{}"])).total > 0, "el soporte lo lee");
  assert.ok(await consultas("a@g.com", "soporte:alertas_envios") >= 1, "y su lectura queda en la bitácora");
});

// ═════════════════════════════ 6 · REPORTE MENSUAL (F7.4) ═════════════════════════════
test("reporte mensual: totales y comparativo contra el mes anterior cuadran con la consulta de diferencias; causas, casos y diez productos con más recurrencia", async () => {
  await semillaLista();
  const mes = (await uno("select date_trunc('month', piefirme_app.ctl_hoy($1) - interval '1 month')::date::text as m", [ORG])).m;
  const rm = await bien("m@g.com", "ctl_reporte_mensual", [mes]);
  const fin = (await uno("select ($1::date + interval '1 month' - interval '1 day')::date::text as f", [mes])).f;
  const sedesRqa = (await filas("select id from piefirme.sedes where organizacion_id = $1 and clave like 'RQA_'", [ORG])).map((x) => x.id);
  const d = await dif({ desde: mes, hasta: fin, sucursales: sedesRqa });
  const delMes = rm.por_sucursal.filter((s) => sedesRqa.includes(s.sucursal_id));
  assert.equal(delMes.reduce((a, s) => a + num(s.faltante_valor), 0), num(d.totales.faltantes_valor), "el total por sucursal del mensual es el de la consulta de diferencias");
  assert.equal(delMes.reduce((a, s) => a + num(s.sobrante_valor), 0), num(d.totales.sobrantes_valor));
  const mesAnt = (await uno("select ($1::date - interval '1 month')::date::text as m", [mes])).m, finAnt = (await uno("select ($1::date - interval '1 day')::date::text as f", [mes])).f;
  const dAnt = await dif({ desde: mesAnt, hasta: finAnt, sucursales: sedesRqa });
  assert.equal(delMes.reduce((a, s) => a + num(s.previo_faltante_valor), 0), num(dAnt.totales.faltantes_valor), "el comparativo contra el mes anterior cuadra");
  assert.equal(rm.mes, mes); assert.equal(rm.mes_anterior, mesAnt);
  assert.ok(rm.top_productos.length === 10 && rm.top_productos.every((x, i) => x.puesto === i + 1)); assert.ok(rm.top_productos[0].auditorias >= rm.top_productos[9].auditorias, "ordenados por recurrencia");
  assert.ok(rm.causas.length >= 1 && rm.causas.every((x) => x.causa && x.casos > 0));
  assert.ok(rm.casos.nacidos_en_mes > 0 && rm.casos.cerrados_en_mes >= rm.casos.cerrados_con_ajuste + rm.casos.cerrados_sin_ajuste);
  assert.match(rm.nota, /indicador para investigar/i); assert.equal(rm.ok, true);
  assert.equal((await rpc("m@g.com", "ctl_reporte_mensual", [fechaEn(70)])).code, "PF422", "un mes futuro no se genera");
  assert.ok(await consultas("m@g.com", "reporte_mensual") >= 1);
  assert.equal((await rpc("r@g.com", "ctl_reporte_mensual", [mes])).code, "PF403");
});

// ═════════════════════════════ 7 · RETENCIÓN Y PURGA DE FOTOS ═════════════════════════════
test("retención de fotos: vencen a los 90 días (tope 365), no se purga lo de un caso abierto ni la última toma, y la purga se anota sin borrar la evidencia", async (t) => {
  const sede = await crearSede("Fotos");
  const ev = async (dias, extra = {}) => {
    await owner(); await c.query("set local session_replication_role = replica");
    const e = await uno(`insert into piefirme.ctl_evidencia (organizacion_id, sucursal_id, tipo_origen, origen_id, url_almacenamiento, hash_sha256, capturado_en, toma_fija_id, creado_en)
                          values ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7::int), $8, now() - make_interval(days => $7::int)) returning id`,
                        [ORG, sede, extra.tipo ?? "partida_conteo", extra.origen ?? randomUUID(), `${ORG}/ctl/${sede}/${randomUUID()}.jpg`, randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""), dias, extra.toma ?? null]);
    await c.query("set local session_replication_role = origin");
    return e.id;
  };
  const vieja = await ev(100), reciente = await ev(10), de365 = await ev(200);
  const caso = await alertaCaso(sede); const protegida = await ev(150, { tipo: "caso", origen: caso });
  await owner(); await c.query("set local session_replication_role = replica");
  const toma = (await uno("insert into piefirme.ctl_toma_fija (organizacion_id, sucursal_id, nombre) values ($1, $2, 'Mostrador') returning id", [ORG, sede])).id; await c.query("set local session_replication_role = origin");
  const tomaVieja = await ev(120, { toma }), tomaUltima = await ev(110, { toma });
  const vencidas = async () => { await owner(); return (await uno("select piefirme.ctl_fotos_por_purgar($1, 1000) as r", [ORG])).r.fotos.filter((f) => f.sucursal_id === sede).map((f) => f.evidencia_id); };
  await sub(t, "con 90 días: vencen las viejas; no la reciente, no la de un caso abierto, no la última de la toma", async () => {
    const v = await vencidas();
    for (const id of [vieja, de365, tomaVieja]) assert.ok(v.includes(id), "debe vencer");
    for (const id of [reciente, protegida, tomaUltima]) assert.ok(!v.includes(id), "no debe vencer");
    const res = await bien("m@g.com", "ctl_retencion_resumen"); assert.equal(res.retencion_dias, 90); assert.equal(res.tope_dias, 365); assert.ok(res.por_purgar_ahora >= 3);
    assert.match(res.nota, /scripts\/auditoria-purgar-fotos\.mjs/);
  });
  await sub(t, "el tope de la base: 365 días", async () => {
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["retencion_fotos_dias", null, JSON.stringify(400), false, "prueba"])).code, "PF422");
    await bien("m@g.com", "ctl_config_guardar", ["retencion_fotos_dias", null, JSON.stringify(365), false, "prueba"]);
    const v = await vencidas(); assert.ok(!v.includes(vieja) && !v.includes(de365), "con 365 días ya no vencen las de 100 ni 200");
    await bien("m@g.com", "ctl_config_guardar", ["retencion_fotos_dias", sede, JSON.stringify(30), false, "esta sucursal retiene menos"]);
    const v2 = await vencidas(); assert.ok(v2.includes(vieja) && v2.includes(de365) && v2.includes(protegida) === false, "la retención es por sucursal");
    await bien("m@g.com", "ctl_config_guardar", ["retencion_fotos_dias", sede, JSON.stringify(90), false, "vuelve a 90"]); await bien("m@g.com", "ctl_config_guardar", ["retencion_fotos_dias", null, JSON.stringify(90), false, "vuelve a 90"]);
  });
  await sub(t, "marcar purgadas: se anota, no se vuelve a listar, la evidencia se conserva y la app no puede llamarlas", async () => {
    await owner();
    const r = (await uno("select piefirme.ctl_fotos_marcar_purgadas($1, $2::jsonb) as r", [ORG, JSON.stringify([{ evidencia_id: vieja, objeto_borrado: true }, { evidencia_id: de365, objeto_borrado: false }])])).r;
    assert.equal(r.anotadas, 2);
    const v = await vencidas(); assert.ok(!v.includes(vieja), "ya purgada"); assert.ok(v.includes(de365), "la que no se pudo borrar se reintenta");
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_evidencia where id = any ($1)", [[vieja, de365]])).n, 2, "la fila de evidencia y su hash se conservan");
    const p = await uno("select * from piefirme.ctl_evidencia_purga where evidencia_id = $1", [vieja]); assert.equal(p.retencion_dias, 90); assert.match(p.hash_sha256, /^[0-9a-f]{64}$/);
    assert.equal((await intentar("delete from piefirme.ctl_evidencia_purga where evidencia_id = $1", [vieja])).code, "PF403");
    assert.equal((await intentar("delete from piefirme.ctl_evidencia where id = $1", [vieja])).code, "PF403", "la evidencia sigue siendo solo inserción");
    for (const correo of ["m@g.com", "s@g.com", "a@g.com", "r@g.com"]) { await como(correo); assert.equal((await intentar("select piefirme.ctl_fotos_marcar_purgadas($1, '[]'::jsonb)", [ORG])).code, "42501"); }
    const res = await bien("m@g.com", "ctl_retencion_resumen"); assert.ok(res.fotos_purgadas >= 1 && res.ultima_purga);
  });
  assert.ok(tomaUltima && tomaVieja);
});
async function alertaCaso(sede) {
  await owner();
  await c.query("set local session_replication_role = replica");
  const k_ = await uno(`insert into piefirme.ctl_caso (organizacion_id, folio, sucursal_id, tipo, origen_tipo, estado, contexto) values ($1, $2, $3, 'diferencia_inventario', 'partida_conteo', 'abierta', '{}') returning id`, [ORG, `CAS-RPT-${Date.now() % 100000}${++k}`, sede]);
  await c.query("set local session_replication_role = origin");
  return k_.id;
}

// ═════════════════════════════ 8 · RENDIMIENTO CON LA SEMILLA DE 90 DÍAS × 7 SUCURSALES ═════════════════════════════
test("rendimiento: el reporte de diferencias de 90 días y 7 sucursales responde en menos de 2 segundos (también con filtros), y las agrupaciones cuadran", async (t) => {
  await semillaLista();
  const sedes = (await filas("select id from piefirme.sedes where organizacion_id = $1 and clave like 'RQA_'", [ORG])).map((x) => x.id);
  assert.equal(sedes.length, 7);
  await owner();
  const hoy = (await uno("select piefirme_app.ctl_hoy($1)::text as h", [ORG])).h;
  const base = { sucursales: sedes };
  const medir = async (nombre, f) => { await como("m@g.com"); const ini = Date.now(); const x = await intentar("select piefirme.ctl_dif_consultar($1) as r", [JSON.stringify(f)]); const ms = Date.now() - ini; assert.ok(x.ok, x.message); console.log(`   ${nombre}: ${ms} ms (servidor ${x.rows[0].r.ms} ms, ${x.rows[0].r.total_filas} renglones)`); return { ms, r: x.rows[0].r }; };
  const cal = await medir("calentamiento", base); assert.ok(cal.r.total_filas > 1000, "la semilla trae miles de diferencias");
  const a = await medir("90 días, 7 sucursales", base); assert.ok(a.ms < 2000, `90 días y 7 sucursales debe tardar < 2 s (tardó ${a.ms} ms)`);
  const b = await medir("faltantes ≥ $500", { ...base, tipo: "faltantes", umbral_pesos: 500 }); assert.ok(b.ms < 2000);
  const c2 = await medir("una sucursal", { sucursal: sedes[2] }); assert.ok(c2.ms < 2000);
  const d = await medir("exportación completa", { ...base, exportar: true }); assert.ok(d.ms < 4000, "exportar hasta 20,000 renglones"); assert.equal(d.r.filas.length, d.r.total_filas);
  assert.ok(a.r.filas.length === 100 && a.r.total_filas > 1000, "se pagina: PostgREST corta a 1,000 y aquí se devuelven 100 por página");
  // las agrupaciones cuadran con el total
  assert.equal(a.r.por_sucursal.reduce((s_, x) => s_ + num(x.faltantes_valor), 0), num(a.r.totales.faltantes_valor));
  assert.equal(a.r.por_sucursal.length, 7); assert.equal(a.r.por_sucursal[0].puesto, 1);
  assert.equal(a.r.por_sucursal[0].sucursal, "RQA Centro", "la sucursal con más faltante valorizado es la que la semilla diseñó para serlo (más diferencias)");
  assert.equal(a.r.por_auditor.reduce((s_, x) => s_ + x.auditorias, 0), 631, "630 conteos de apertura (7 sucursales × 90 días) + la auditoría remota en curso de la semilla");
  assert.ok(a.r.por_producto[0].auditorias >= a.r.por_producto.at(-1).auditorias);
  // contra la consulta directa
  await owner();
  const dir = await uno(`select count(*)::int as n, sum(-c.diferencia_valor) filter (where c.diferencia_piezas < 0) as falt from piefirme.ctl_partida_calculo c join piefirme.ctl_partida_conteo p on p.id = c.partida_id join piefirme.ctl_sesion_conteo s on s.id = p.sesion_id
                          where p.sucursal_id = any ($1) and c.diferencia_piezas <> 0 and s.tipo <> 'conteo_inicial' and p.escaneado_en >= (piefirme_app.ctl_hoy($2) - 89)::timestamp at time zone piefirme_app.ctl_zona($2)
                            and not exists (select 1 from piefirme.ctl_partida_conteo x where x.corrige_a = p.id)`, [sedes, ORG]);
  assert.equal(dir.n, a.r.total_filas); assert.equal(num(dir.falt), num(a.r.totales.faltantes_valor));
  // el tablero y el mensual también responden con la semilla
  await como("m@g.com"); let ini = Date.now(); await intentar("select piefirme.ctl_tablero(90)"); const mt = Date.now() - ini; console.log(`   tablero: ${mt} ms`); assert.ok(mt < 4000, `el tablero tardó ${mt} ms`);
  ini = Date.now(); await intentar("select piefirme.ctl_reporte_mensual(null)"); const mm = Date.now() - ini; console.log(`   reporte mensual: ${mm} ms`); assert.ok(mm < 2000);
  assert.ok(hoy);
});
