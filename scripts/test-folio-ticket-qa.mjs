// Pruebas del FOLIO DE TICKET parametrizable (migraciones 300–301) contra la base QA.   node --test scripts/test-folio-ticket-qa.mjs
// Casi todo corre en UNA transacción que SIEMPRE se deshace (se actúa «como» cada cuenta con SET LOCAL ROLE + claims JWT).
// ÚNICA excepción: la prueba de concurrencia real necesita conexiones separadas, así que confirma una sede temporal (clave QFT…) y la borra al terminar.
// NO correr en paralelo con otras suites.
import nodeTest, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";
import { CASOS_FORMATO, CASOS_INVALIDOS } from "../src/lib/comercial/folioTicketCasos.js";
import { validarFormato, vistaPrevia } from "../src/lib/comercial/folioTicket.js";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CHA = "5e000000-0000-0000-0000-000000000001";   // sede donde p@g.com tiene turno abierto
const CORREOS = ["m@g.com", "p@g.com", "r@g.com"];
const DEF = "{SUC}-{AAMMDD}-{NNN}";
const c = await conectar(cfg);
let n = 0;
const ids = {};
const test = (nombre, fn) => nodeTest(nombre, async (t) => {
  const sp = `tsp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(t); } catch (e) { await c.query(`rollback to savepoint ${sp}`).catch(() => {}); throw e; }
});
const owner = async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); };
async function como(correo) {
  await owner();
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[correo], role: "authenticated", email: correo })]);
  await c.query("set local role authenticated");
}
async function intentar(sql, params = []) {
  const sp = `sp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { const r = await c.query(sql, params); await c.query(`release savepoint ${sp}`); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { await c.query(`rollback to savepoint ${sp}`); return { ok: false, code: e.code, message: e.message }; }
}
const uno = async (sql, params) => (await c.query(sql, params)).rows[0];
const filas = async (sql, params) => (await c.query(sql, params)).rows;
async function rpc(correo, fn, args = []) {
  await como(correo);
  const x = await intentar(`select piefirme.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args);
  return x.ok ? { ok: true, r: x.rows[0].r } : x;
}
const bien = async (correo, fn, args = []) => { const x = await rpc(correo, fn, args); assert.ok(x.ok, `${correo} ${fn}: ${x.message}`); return x.r; };
const hoy = async () => (await uno("select piefirme_app.hoy_org($1)::text as h", [ORG])).h;
async function fijarFormato(formato, reinicio) { await owner(); await c.query("update piefirme.organizaciones set parametros = parametros || $2::jsonb where id = $1", [ORG, JSON.stringify({ folio_ticket_formato: formato, folio_ticket_reinicio: reinicio })]); }
/** Ticket nuevo (por cobrar) emitido «como» el usuario: el folio lo pone la base. */
async function ticket(correo, sede = CHA) {
  await como(correo);
  const x = await intentar("insert into piefirme.ventas (organizacion_id, sede_id, origen, estado) values ($1, $2, 'mostrador', 'por_cobrar') returning folio, id", [ORG, sede]);
  assert.ok(x.ok, `${correo} no pudo crear ticket: ${x.message}`);
  return x.rows[0];
}
/** Sucursal nueva (dentro de la transacción) para pruebas que necesitan contador limpio. */
async function sedeNueva() { await owner(); return (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, 'QFT temporal') returning id", [ORG, "QFT" + (Date.now() % 100000) + (++n)])).id; }
const numero = (folio) => Number(folio.match(/(\d+)$/)[1]);

before(async () => {
  await c.query("begin");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  await fijarFormato(DEF, "diario");
  await c.query("delete from piefirme.folio_ticket_contador where organizacion_id = $1 and sede_id = $2", [ORG, CHA]);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ───────── 1 · paridad SQL = JS ─────────
test("formateo, período y vista previa: la base da lo mismo que la función pura JS", async () => {
  for (const k of CASOS_FORMATO) {
    const r = await bien("m@g.com", "folio_ticket_vista_previa", [k.f, k.r, k.cod, k.fecha, k.n]);
    assert.deepEqual(r, { valido: true, folio: k.folio, periodo: k.periodo }, k.f);
    assert.deepEqual(r, vistaPrevia(k.f, k.r, k.cod, k.fecha, k.n));
  }
});
test("validación: SQL y JS rechazan lo mismo y con el mismo mensaje", async () => {
  for (const k of CASOS_INVALIDOS) {
    const r = await bien("m@g.com", "folio_ticket_vista_previa", [k.f, k.r, "01", "2026-11-26", 1]);
    assert.equal(r.valido, false, `SQL debía rechazar «${k.f}» / ${k.r}`);
    assert.match(r.error, k.msg);
    assert.equal(r.error, validarFormato(k.f, k.r), "mismo texto en JS y SQL");
  }
});

// ───────── 2 · validación en la base (cualquier ruta) ─────────
test("el trigger de organizaciones rechaza formatos inválidos aunque se escriban directo", async () => {
  await owner();
  for (const k of CASOS_INVALIDOS.filter((x) => x.f !== "")) {
    const x = await intentar("update piefirme.organizaciones set parametros = parametros || $2::jsonb where id = $1", [ORG, JSON.stringify({ folio_ticket_formato: k.f, folio_ticket_reinicio: k.r })]);
    assert.equal(x.ok, false, `debía fallar ${k.f}`);
    assert.equal(x.code, "PF400");
  }
  const g = (await uno("select parametros->>'folio_ticket_formato' as f from piefirme.organizaciones where id = $1", [ORG])).f;
  assert.equal(g, DEF, "el formato guardado no cambió");
});
test("solo el administrador cambia el formato; recepción y podólogo no", async () => {
  for (const correo of ["r@g.com", "p@g.com"]) {
    const x = await rpc(correo, "guardar_folio_ticket", ["{SUC}-{NNNN}", "nunca"]);
    assert.equal(x.ok, false); assert.equal(x.code, "PF403", correo);
  }
  await como("r@g.com");
  const y = await intentar("update piefirme.organizaciones set parametros = parametros || '{\"folio_ticket_formato\":\"{SUC}-{NNNN}\"}' where id = $1", [ORG]);
  assert.ok(!y.ok || y.rowCount === 0, "recepción no escribe parámetros directo");
});
test("cada cambio queda en la bitácora con quién, cuándo y antes/después (sin secretos)", async () => {
  await owner();
  const antes = (await uno("select count(*)::int n from piefirme.bitacora where organizacion_id = $1 and detalle->>'cambio' = 'folio_ticket'", [ORG])).n;
  const r = await bien("m@g.com", "guardar_folio_ticket", ["{SUC}-{AA}{MM}-{NNNN}", "mensual"]);
  assert.equal(r.formato, "{SUC}-{AA}{MM}-{NNNN}");
  await owner();
  const b = await filas("select usuario_id, created_at, detalle from piefirme.bitacora where organizacion_id = $1 and detalle->>'cambio' = 'folio_ticket' order by created_at desc", [ORG]);
  assert.equal(b.length, antes + 1);
  assert.equal(b[0].usuario_id, ids["m@g.com"]);
  assert.ok(b[0].created_at);
  assert.deepEqual(b[0].detalle.antes, { formato: DEF, reinicio: "diario" });
  assert.deepEqual(b[0].detalle.despues, { formato: "{SUC}-{AA}{MM}-{NNNN}", reinicio: "mensual" });
  assert.doesNotMatch(JSON.stringify(b[0].detalle), /password|token|secret|clave/i);
  const mal = await rpc("m@g.com", "guardar_folio_ticket", ["{SUC}-{NNN}", "diario"]);
  assert.equal(mal.ok, false); assert.match(mal.message, /año, el mes y el día/);
});

// ───────── 3 · generador ─────────
test("los tres roles (recepción, podólogo, administrador/encargado) comparten UN consecutivo por sucursal", async () => {
  await fijarFormato(DEF, "diario");
  const f = [];
  for (const correo of ["r@g.com", "p@g.com", "m@g.com", "r@g.com", "p@g.com"]) f.push((await ticket(correo)).folio);
  const h = await hoy();
  const aamdd = h.slice(2, 4) + h.slice(5, 7) + h.slice(8, 10);
  const cod = (await uno("select codigo_corto from piefirme.sedes where id = $1", [CHA])).codigo_corto;
  const nums = f.map(numero);
  for (let i = 1; i < nums.length; i++) assert.equal(nums[i], nums[i - 1] + 1, `consecutivo roto: ${f.join(", ")}`);
  assert.equal(nums[0], 1, "arranca en 001 el día");
  for (const x of f) assert.match(x, new RegExp(`^${cod}-${aamdd}-\\d{3}$`));
  assert.equal(new Set(f).size, f.length);
});
test("otra sucursal lleva su propio consecutivo", async () => {
  const otra = "5e000000-0000-0000-0000-000000000002";
  await owner(); await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [otra]);
  const a = await ticket("m@g.com", otra), b = await ticket("m@g.com", otra);
  assert.equal(numero(a.folio), 1); assert.equal(numero(b.folio), 2);
  const cod = (await uno("select codigo_corto from piefirme.sedes where id = $1", [otra])).codigo_corto;
  assert.ok(a.folio.startsWith(cod + "-"));
});
test("reinicio diario: el día nuevo empieza en 001; el período viejo no se toca", async () => {
  const S = await sedeNueva();
  await fijarFormato(DEF, "diario");
  await owner();
  await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [S]);
  const ayer = (await uno("select ($1::date - 1)::text d", [await hoy()])).d;
  await c.query("insert into piefirme.folio_ticket_contador (organizacion_id, sede_id, periodo, ultimo) values ($1, $2, $3, 57)", [ORG, S, "D" + ayer]);
  const t = await ticket("r@g.com", S);
  assert.equal(numero(t.folio), 1);
  await owner();
  assert.equal(Number((await uno("select ultimo from piefirme.folio_ticket_contador where sede_id = $1 and periodo = $2", [S, "D" + ayer])).ultimo), 57);
});
test("reinicio mensual, anual y nunca: períodos independientes que no reinician dentro del período", async () => {
  const S = await sedeNueva();
  for (const [fmt, rei, esperaPer] of [["{SUC}-{AA}{MM}-{NNNN}".replace("{AAMM}", "{AA}{MM}"), "mensual", /^M\d{4}-\d{2}$/], ["{SUC}-{AAAA}-{NNNN}", "anual", /^A\d{4}$/], ["{SUC}-{NNNNNN}", "nunca", /^N$/]]) {
    await fijarFormato(fmt, rei);
    await owner(); await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [S]);
    const a = await ticket("r@g.com", S), b = await ticket("m@g.com", S);
    assert.equal(numero(b.folio), numero(a.folio) + 1, rei);
    await owner();
    const per = await filas("select periodo from piefirme.folio_ticket_contador where sede_id = $1", [S]);
    assert.equal(per.length, 1); assert.match(per[0].periodo, esperaPer);
  }
});
test("cambio de formato: aplica solo a tickets NUEVOS; los emitidos no cambian ni se pueden reescribir", async () => {
  const S = await sedeNueva();
  await fijarFormato(DEF, "diario");
  await owner(); await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [S]);
  const viejo = await ticket("r@g.com", S);
  await bien("m@g.com", "guardar_folio_ticket", ["{SUC}{AAMMDD}{NNNN}", "diario"]);
  const nuevo = await ticket("r@g.com", S);
  assert.match(nuevo.folio, /^\d{2}\d{6}0002$/, nuevo.folio);       // sigue el consecutivo del día con el formato nuevo
  await owner();
  assert.equal((await uno("select folio from piefirme.ventas where id = $1", [viejo.id])).folio, viejo.folio);
  assert.match(viejo.folio, /^\d{2}-\d{6}-001$/);
  const x = await intentar("update piefirme.ventas set folio = 'X-1' where id = $1", [viejo.id]);
  assert.equal(x.ok, false); assert.equal(x.code, "PF409");
});
test("si el formato nuevo coincide con un folio histórico, se salta el número (nunca repite)", async () => {
  const S = await sedeNueva();
  await fijarFormato(DEF, "diario");
  await owner(); await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [S]);
  const t1 = await ticket("r@g.com", S);            // …-001
  await owner();
  await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [S]);   // contador «perdido»: el siguiente sería 001 otra vez
  const t2 = await ticket("r@g.com", S);
  assert.notEqual(t2.folio, t1.folio);
  assert.equal(numero(t2.folio), 2);
});
test("los folios de otros tipos (cita, anticipo, nota de crédito) conservan su formato", async () => {
  await owner();
  const f = (await uno("select piefirme_app.siguiente_folio_comercial($1, 'CIT') as f", [CHA])).f;
  assert.match(f, /^[A-Z0-9]+-CIT-\d{6}$/);
});

// ───────── 4 · código corto por sucursal ─────────
test("todas las sucursales tienen código de 2 dígitos único por organización", async () => {
  await owner();
  const r = await uno("select count(*)::int n, count(distinct codigo_corto)::int d, count(*) filter (where codigo_corto ~ '^[0-9]{2}$')::int ok from piefirme.sedes where organizacion_id = $1", [ORG]);
  assert.equal(r.n, r.d); assert.equal(r.n, r.ok);
});
test("código repetido o mal formado se rechaza con mensaje claro; intercambiar dos códigos sí se permite", async () => {
  await owner();
  const [a, b] = await filas("select id, codigo_corto from piefirme.sedes where organizacion_id = $1 order by created_at, id limit 2", [ORG]);
  const dup = await rpc("m@g.com", "guardar_codigos_sedes", [JSON.stringify([{ sede_id: a.id, codigo_corto: b.codigo_corto }])]);
  assert.equal(dup.ok, false); assert.equal(dup.code, "PF409"); assert.match(dup.message, /repetido/);
  const mal = await rpc("m@g.com", "guardar_codigos_sedes", [JSON.stringify([{ sede_id: a.id, codigo_corto: "1" }])]);
  assert.equal(mal.ok, false); assert.match(mal.message, /2 dígitos/);
  const ok = await rpc("m@g.com", "guardar_codigos_sedes", [JSON.stringify([{ sede_id: a.id, codigo_corto: b.codigo_corto }, { sede_id: b.id, codigo_corto: a.codigo_corto }])]);
  assert.ok(ok.ok, ok.message);
  await owner();
  const d = await filas("select id, codigo_corto from piefirme.sedes where id = any($1)", [[a.id, b.id]]);
  assert.equal(d.find((x) => x.id === a.id).codigo_corto, b.codigo_corto);
  const bit = await filas("select 1 from piefirme.bitacora where entidad = 'sedes' and entidad_id = $1 and detalle->>'cambio' = 'codigo_corto'", [a.id]);
  assert.ok(bit.length >= 1, "cambio de código en bitácora");
  const sr = await rpc("r@g.com", "guardar_codigos_sedes", [JSON.stringify([{ sede_id: a.id, codigo_corto: "98" }])]);
  assert.equal(sr.ok, false); assert.equal(sr.code, "PF403");
});
test("una sucursal nueva recibe el siguiente código libre; un código duplicado directo lo frena la restricción", async () => {
  await owner();
  const s = await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, 'QFT nueva') returning id, codigo_corto", [ORG, "QFTN" + Date.now() % 100000]);
  assert.match(s.codigo_corto, /^\d{2}$/);
  const x = await intentar("update piefirme.sedes set codigo_corto = (select codigo_corto from piefirme.sedes where organizacion_id = $1 and id <> $2 limit 1) where id = $2", [ORG, s.id]);
  assert.equal(x.ok, false); assert.equal(x.code, "23505");
});

// ───────── 5 · vista previa con el contador real ─────────
test("los 3 folios siguientes de la sucursal se calculan sin consumir números", async () => {
  const S = await sedeNueva();
  await fijarFormato(DEF, "diario");
  await owner(); await c.query("delete from piefirme.folio_ticket_contador where sede_id = $1", [S]);
  await ticket("r@g.com", S); await ticket("r@g.com", S);
  const p1 = await bien("m@g.com", "folio_ticket_proximos", [S, 3, null, null]);
  const p2 = await bien("m@g.com", "folio_ticket_proximos", [S, 3, null, null]);
  assert.deepEqual(p1, p2, "ver la vista previa no avanza el contador");
  assert.deepEqual(p1.folios.map(numero), [3, 4, 5]);
  const cand = await bien("m@g.com", "folio_ticket_proximos", [S, 3, "{SUC}/{AAAA}{MM}{DD}/{NNNNN}", "diario"]);
  assert.match(cand.folios[0], /^\d{2}\/\d{8}\/00003$/);
  const malo = await bien("m@g.com", "folio_ticket_proximos", [S, 3, "{SUC}", "diario"]);
  assert.equal(malo.valido, false);
  const t = await ticket("r@g.com", S);
  assert.equal(numero(t.folio), 3, "el siguiente real coincide con lo previsto");
});

// ───────── 6 · offline ─────────
test("ticket offline: sincroniza idempotente, el folio definitivo lo asigna el servidor y el provisional se conserva", async () => {
  await fijarFormato(DEF, "diario");
  await owner();
  const sede = "5e000000-0000-0000-0000-000000000002";   // r@g.com tiene turno abierto aquí
  const q = await intentar("select s.id, pr.precio from piefirme.servicios s join lateral (select precio from piefirme.precios where servicio_id = s.id and organizacion_id = $1 and sede_id is null and tipo_precio = 'fijo' and precio > 0 and vigente_desde <= current_date and (vigente_hasta is null or vigente_hasta >= current_date) order by vigente_desde desc limit 1) pr on true where s.organizacion_id = $1 and s.estado = 'activo' limit 1", [ORG]);
  assert.ok(q.ok && q.rows[0], "no hay un servicio con precio de lista en QA para armar el ticket offline: " + q.message);
  const srv = q.rows[0];
  const uuid = randomUUID();
  const payload = { cliente_uuid: uuid, sede_id: sede, folio_offline: "OFF-TEST-0001", creado_en: new Date().toISOString(), lineas: [{ tipo: "servicio", servicio_id: srv.id, descripcion: "Servicio de prueba", cantidad: 1, precio_unitario: Number(srv.precio) }], pagos: [{ metodo: "efectivo", monto: Number(srv.precio) }] };
  const a = await rpc("r@g.com", "sincronizar_ticket_offline", [JSON.stringify(payload)]);
  if (!a.ok) { assert.fail("sincronizar_ticket_offline: " + a.message); }
  const b = await rpc("r@g.com", "sincronizar_ticket_offline", [JSON.stringify(payload)]);
  assert.ok(b.ok);
  assert.equal(b.r.venta_id, a.r.venta_id); assert.equal(b.r.folio, a.r.folio); assert.equal(b.r.ya_existia, true);
  assert.doesNotMatch(a.r.folio, /^OFF-/);
  assert.match(a.r.folio, /^\d{2}-\d{6}-\d{3}$/);
  await owner();
  const v = await uno("select folio, folio_offline from piefirme.ventas where id = $1", [a.r.venta_id]);
  assert.equal(v.folio_offline, "OFF-TEST-0001");
  assert.equal((await filas("select 1 from piefirme.ventas where cliente_uuid = $1", [uuid])).length, 1);
  // el siguiente ticket (en línea) continúa sin hueco
  const sig = await ticket("r@g.com", sede);
  assert.equal(numero(sig.folio), numero(a.r.folio) + 1);
});

// ───────── 7 · función «encargado» ─────────
test("la función «encargado» es válida en perfiles.funciones; una inventada no", async () => {
  await owner();
  const ok = await intentar("update piefirme.perfiles set funciones = array['encargado','caja'] where id = $1", [ids["r@g.com"]]);
  assert.ok(ok.ok, ok.message);
  const mal = await intentar("update piefirme.perfiles set funciones = array['jefe'] where id = $1", [ids["r@g.com"]]);
  assert.equal(mal.ok, false);
});

// ───────── 8 · concurrencia REAL (conexiones separadas; confirma y limpia una sede temporal) ─────────
nodeTest("10 cajeros simultáneos de la misma sucursal nunca reciben el mismo número ni dejan huecos", async () => {
  await c.query("rollback"); await c.query("begin");   // cierra la transacción global antes de abrir conexiones nuevas
  const adm = await conectar(cfg);
  let sede;
  try {
    sede = (await adm.query("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, 'QFT concurrencia (temporal)') returning id", [ORG, "QFT" + (Date.now() % 100000)])).rows[0].id;
    const org = (await adm.query("select parametros->>'folio_ticket_formato' f from piefirme.organizaciones where id = $1", [ORG])).rows[0];
    const clientes = await Promise.all(Array.from({ length: 10 }, () => conectar(cfg)));
    const folios = await Promise.all(clientes.map(async (k) => {
      await k.query("begin");
      const f = (await k.query("select piefirme_app.siguiente_folio_ticket($1) as f", [sede])).rows[0].f;
      await new Promise((r) => setTimeout(r, 40));   // la fila del contador queda bloqueada: los demás esperan
      await k.query("commit");
      return f;
    }));
    await Promise.all(clientes.map((k) => k.end()));
    assert.equal(new Set(folios).size, 10, `repetidos: ${folios.sort().join(", ")}`);
    assert.deepEqual(folios.map(numero).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(org);
  } finally {
    if (sede) await adm.query("delete from piefirme.sedes where id = $1", [sede]);   // cascada: borra su contador
    await adm.end();
  }
});
