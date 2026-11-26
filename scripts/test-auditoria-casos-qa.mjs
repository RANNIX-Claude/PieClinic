// Pruebas de CASOS (Control y Auditoría · Etapa 3) contra la base QA.   node --test scripts/test-auditoria-casos-qa.mjs
//
// TODO corre en UNA transacción que SIEMPRE se deshace (no deja casos, folios, sedes, productos ni movimientos): los datos semilla se crean dentro de la transacción
// como dueño de la base y se actúa «como» cada cuenta de prueba (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-conteo-qa.mjs.
// Los casos NACEN del motor de conteo real (iniciar → capturar → cerrar), nunca se capturan a mano; solo los escenarios que exigen un estado imposible de
// alcanzar de otro modo (origen que rechaza, llamada ya aplicada) preparan el caso como dueño de la base.
// Cuentas (clave 123456, solo QA; scripts/qa-usuarios-prueba.mjs): a superadmin(soporte) · m dueño · s supervisora · p podólogo · r recepción.
// Cubre los criterios de aceptación 1, 2, 11, 12, 13, 15, 24 y las reglas duras de F4 (separación de funciones, bitácora solo-inserción, sin escritura directa en saldo).
// NO correr en paralelo con otras suites del módulo (se bloquean entre sí por pins_personales y los contadores de folio).
import nodeTest, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
const CIEGOS = /^(saldo_sistema|diferencia_piezas|diferencia_valor|diferencia_precio|diferencia|valor_esperado|valor_diferencia|precio_catalogo|partidas_con_diferencia|dentro_tolerancia|clasificacion_precio|existencia|saldo)$/;

const c = await conectar(cfg);
const test = (nombre, fn) => nodeTest(nombre, async (t) => {
  const sp = `tsp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(t); } catch (e) { await c.query(`rollback to savepoint ${sp}`).catch(() => {}); throw e; }
});
// subpruebas con su propio savepoint: si una falla, la transacción global no queda abortada y las demás siguen
const sub = (t, nombre, fn) => t.test(nombre, async () => {
  const sp = `ssp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(); } catch (e) { await c.query(`rollback to savepoint ${sp}`).catch(() => {}); throw e; }
});
const ids = {};
let n = 0, k = 0, otraOrg = null;

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
/** RPC que debe salir bien: devuelve el jsonb. */
const bien = async (correo, fn, args = []) => { const x = await rpc(correo, fn, args); assert.ok(x.ok, `${correo} ${fn}: ${x.message}`); return x.r; };
const uno = async (sql, params) => (await c.query(sql, params)).rows[0];
const filas = async (sql, params) => (await c.query(sql, params)).rows;
const llavesCiegas = (v, ruta = "") => Array.isArray(v) ? v.flatMap((x, i) => llavesCiegas(x, `${ruta}[${i}]`))
  : v && typeof v === "object" ? Object.entries(v).flatMap(([kk, x]) => (CIEGOS.test(kk) ? [ruta + "." + kk] : []).concat(llavesCiegas(x, `${ruta}.${kk}`))) : [];
const fechaEn = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

// ───────── semillas (como dueño de la base, dentro de la transacción) ─────────
async function crearSede(nombre) {
  await owner();
  return (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, `QCS${Date.now() % 100000}${++k}`, `QCS ${nombre}`])).id;
}
async function crearProducto(nombre, costo, extra = {}) {
  await owner();
  const p = await uno("insert into piefirme.productos (organizacion_id, sku, nombre, codigo_barras, costo_promedio) values ($1, $2, $3, $4, $5) returning id, codigo_barras, sku",
                      [extra.org ?? ORG, `QCS-${Date.now() % 1000000}-${++k}`, `QCS ${nombre}`, `98${Date.now() % 100000000}${k}`, costo]);
  if (extra.precio != null) {
    await c.query(`insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio) values ($1, 'producto', $2, piefirme_app.ctl_hoy($1) - 400, $3, 'fijo')`, [ORG, p.id, extra.precio]);
  }
  return p;
}
async function existencia(sede, prodId, cant) {
  await owner();
  await c.query("select set_config('app.kardex', 'on', true)");
  await c.query("insert into piefirme.inventario_sede (organizacion_id, sede_id, producto_id, existencia) values ($1, $2, $3, $4) on conflict (sede_id, producto_id) do update set existencia = excluded.existencia", [ORG, sede, prodId, cant]);
  await c.query("select set_config('app.kardex', '', true)");
}
const saldo = async (sede, prodId) => { await owner(); return Number((await uno("select coalesce(sum(existencia), 0)::text as e from piefirme.inventario_sede where sede_id = $1 and producto_id = $2", [sede, prodId])).e); };
/** Movimiento histórico del kardex (como dueño de la base; fija la fecha). */
async function mov(sede, prodId, tipo, cantidad, hace, o = {}) {
  await owner();
  return (await uno(`insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad, costo_unitario, fecha, usuario_id, referencia_folio)
                     values ($1, $2, $3, $4, $5, $6, now() - $7::interval, $8, $9) returning id, fecha`,
                    [ORG, sede, prodId, tipo, cantidad, o.costo ?? 50, hace, o.usuario ? ids[o.usuario] : null, o.doc ?? null]));
}
/** Turno de caja del origen (se siembra con los disparadores apagados: son datos del origen, no del módulo). */
async function turno(sede, correo, abrioHaceMin, cerroHaceMin = null) {
  await owner();
  await c.query("set local session_replication_role = replica");
  const t = await uno(`insert into piefirme.turnos_caja (organizacion_id, sede_id, cajero_id, apertura_en, estado, cierre_en)
                       values ($1, $2, $3, now() - make_interval(mins => $4), $5, case when $6::int is null then null else now() - make_interval(mins => $6::int) end) returning id`,
                      [ORG, sede, ids[correo], abrioHaceMin, cerroHaceMin == null ? "abierto" : "cerrado", cerroHaceMin]);
  await c.query("set local session_replication_role = origin");
  return t.id;
}
async function venta(sede, prodId, estado, diasAtras, correo) {
  const turnoId = estado === "cobrada" ? await turno(sede, correo, diasAtras * 1440 + 60, diasAtras * 1440 - 60) : null;
  await owner();
  await c.query("set local session_replication_role = replica");
  const v = await uno(`insert into piefirme.ventas (organizacion_id, sede_id, folio, estado, cobrada_en, cancelada_en, cancelada_por, cajero_id, motivo_cancelacion, total, turno_id)
                       values ($1, $2, $3, $4, now() - make_interval(days => $5), case when $4 = 'cancelada' then now() - make_interval(days => $5) end, case when $4 = 'cancelada' then $6::uuid end, $6::uuid,
                               case when $4 = 'cancelada' then 'Prueba de caso' end, 100, $7) returning id, folio`, [ORG, sede, `QCS-TKT-${Date.now() % 100000}${++k}`, estado, diasAtras, ids[correo], turnoId]);
  await c.query(`insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, producto_id, iva_tipo, cantidad, precio_unitario, importe) values ($1, $2, $3, 'producto', $4, 'exento', 1, 100, 100)`, [ORG, sede, v.id, prodId]);
  await c.query("set local session_replication_role = origin");
  return v;
}
async function ponerPin(correo, pin) {
  await owner();
  await c.query("delete from piefirme.pins_personales where perfil_id = $1", [ids[correo]]);
  await c.query("insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash) values ($1, $2, piefirme_app.hash_pin($1, $3))", [ids[correo], ORG, pin]);
}
/** Casos del motor para una sesión. */
const casosDe = async (sesion) => { await owner(); return filas("select * from piefirme.ctl_caso where organizacion_id = $1 and contexto ->> 'sesion_id' = $2 order by creado_en, folio", [ORG, sesion]); };
const caso = async (id) => { await owner(); return uno("select * from piefirme.ctl_caso where id = $1", [id]); };
const bitacora = async (id) => { await owner(); return filas("select * from piefirme.ctl_caso_bitacora where caso_id = $1 order by creado_en, id", [id]); };
const causaId = async (nombre) => { await owner(); return (await uno("select id from piefirme.ctl_causa where organizacion_id = $1 and nombre = $2", [ORG, nombre])).id; };

/** Caso REAL: lo abre el motor de conteo al cerrar la sesión (apertura). Devuelve { sede, prod, caso, sesion }. */
async function casoDelMotor({ saldoSis = 5, fisico = 3, costo = 100, capturista = "r@g.com", cierra = "m@g.com", nombre = "Producto" } = {}) {
  const sede = await crearSede(nombre);
  const prod = await crearProducto(nombre, costo, { precio: costo * 2 });
  await existencia(sede, prod.id, saldoSis);
  const ini = await bien(capturista, "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  const cap = await bien(capturista, "ctl_capturar_partida", [randomUUID(), ini.sesion_id, prod.codigo_barras, fisico, null, null, null, null, null, null, null]);
  assert.equal(cap.ok, true);
  const cierre = await bien(cierra, "ctl_sesion_cerrar", [ini.sesion_id]);
  assert.equal(cierre.ok, true);
  const casos = await casosDe(ini.sesion_id);
  return { sede, prod, sesion: ini.sesion_id, caso: casos.find((x) => x.producto_id === prod.id), casos };
}
/** Lleva un caso a «en investigación» con propuesta de cierre completa (lo hace la supervisora). */
async function investigado(cs, { causa = "Error en el conteo", monto = 0, responsable = "empresa", nota = null } = {}) {
  await bien("s@g.com", "ctl_caso_tomar", [cs.id, fechaEn(5), null]);
  await bien("s@g.com", "ctl_caso_guardar_cierre", [cs.id, await causaId(causa), responsable, monto, nota]);
}

before(async () => {
  await c.query("begin");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  await ponerPin("m@g.com", "4321");   // el PIN del dueño: probar que NO sirve para autorizar (se fija al inicio, dentro de la transacción)
  otraOrg = (await uno("insert into piefirme.organizaciones (nombre) values ('QCS otra clínica (se deshace)') returning id")).id;
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · UN CASO NUNCA SE CAPTURA A MANO ═════════════════════════════
test("no hay ruta de alta manual: la app no inserta en ctl_caso y ninguna RPC de casos crea uno (F4.2)", async () => {
  for (const correo of ["m@g.com", "s@g.com", "r@g.com", "a@g.com"]) {
    await como(correo);
    const x = await intentar(`insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo) values ($1, $2, 'diferencia_inventario', 'manual')`, [ORG, randomUUID()]);
    assert.equal(x.code, "42501", `${correo} no debe poder insertar un caso`);
    const y = await rpc(correo, "ctl_abrir_caso", [ORG]);
    assert.ok(!y.ok, "ctl_abrir_caso no existe en el esquema de la app");
  }
  await owner();
  const ejecutables = await filas(`select p.proname, n.nspname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                    where n.nspname = 'piefirme_app' and p.proname = 'ctl_abrir_caso' and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`);
  assert.deepEqual(ejecutables, [], "ctl_abrir_caso (interna) no es ejecutable por la app");
  // ninguna RPC de la familia «caso» (lista, detalle, ciclo de vida, autorización) inserta en ctl_caso
  const familia = await filas(`select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                where n.nspname = 'piefirme' and p.proname ~ '^(ctl_caso_|ctl_casos_|ctl_autorizar|ctl_reintentar)' and has_function_privilege('authenticated', p.oid, 'execute')`);
  assert.ok(familia.length >= 12, `esperaba la familia de RPC de casos, hay ${familia.length}`);
  for (const f of familia) assert.doesNotMatch(f.prosrc, /insert\s+into\s+piefirme\.ctl_caso\s*\(/i, `${f.proname} inserta casos`);
});

test("ningún rol escribe directo en el saldo; el único camino es el ajuste de un caso autorizado (regla dura)", async () => {
  const sede = await crearSede("SaldoDirecto"); const p = await crearProducto("SaldoDirecto", 40); await existencia(sede, p.id, 7);
  for (const correo of ["m@g.com", "s@g.com", "r@g.com", "p@g.com", "a@g.com"]) {
    await como(correo);
    const x = await intentar("update piefirme.inventario_sede set existencia = existencia + 100 where sede_id = $1 and producto_id = $2", [sede, p.id]);
    const afectadas = x.ok ? x.r.rowCount : 0;
    assert.equal(afectadas, 0, `${correo} no debe poder tocar el saldo directamente`);
  }
  assert.equal(await saldo(sede, p.id), 7);
  await owner();
  // estático: ninguna función que la app pueda ejecutar dentro de la familia ctl_* inserta movimientos ni escribe el saldo; solo ctl_solicitar_ajuste_origen (no ejecutable)
  const escritoras = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'piefirme' and p.proname like 'ctl\\_%' and has_function_privilege('authenticated', p.oid, 'execute')
                                     and p.prosrc ~* '(insert\\s+into\\s+piefirme\\.movimientos_inventario|update\\s+piefirme\\.inventario_sede|insert\\s+into\\s+piefirme\\.inventario_sede)'`);
  assert.deepEqual(escritoras, [], `RPC que escriben el saldo: ${escritoras.map((f) => f.proname)}`);
  const y = await filas(`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = 'ctl_solicitar_ajuste_origen' and has_function_privilege('authenticated', p.oid, 'execute')`);
  assert.deepEqual(y, []);
});

// ═════════════════════════════ 2 · CICLO DE VIDA ═════════════════════════════
test("ciclo de vida: abierta → en investigación → cerrada sin ajuste; bitácora de solo inserciones y el saldo NO se mueve", async (t) => {
  const cs = await casoDelMotor({ saldoSis: 5, fisico: 3, nombre: "Ciclo" });
  assert.equal(cs.caso.estado, "abierta");
  assert.equal(Number(cs.caso.cantidad), -2);
  assert.equal(cs.caso.usuario_captura, ids["r@g.com"], "nace de una captura de r@g.com");
  let bit = await bitacora(cs.caso.id);
  assert.equal(bit.length, 1); assert.equal(bit[0].estado_nuevo, "abierta"); assert.equal(bit[0].usuario_id, null, "la apertura es del sistema");

  await sub(t, "transiciones inválidas: no se cierra, rechaza, comenta ni guarda cierre sin tomar el caso", async () => {
    for (const [fn, args] of [["ctl_caso_cerrar_sin_ajuste", [cs.caso.id, await causaId("Error en el conteo"), "Apareció la pieza en bodega", null, 0]],
                              ["ctl_caso_rechazar", [cs.caso.id, "No procede el caso, duplicado"]],
                              ["ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Error en el conteo"), "empresa", 0, null]],
                              ["ctl_caso_volver_a_investigar", [cs.caso.id, "no aplica porque no está fallido"]],
                              ["ctl_reintentar_ajuste", [cs.caso.id, "123456"]], ["ctl_autorizar_ajuste", [cs.caso.id, "123456"]]]) {
      const x = await rpc("m@g.com", fn, args);
      assert.ok(!x.ok && ["PF409", "PF422"].includes(x.code), `${fn} desde «abierta» debe rechazarse (${x.code} ${x.message})`);
    }
    assert.equal((await caso(cs.caso.id)).estado, "abierta");
  });
  await sub(t, "quien no investiga (sucursal, soporte) no toma, no comenta, no asigna", async () => {
    for (const correo of ["r@g.com", "p@g.com", "a@g.com"]) {
      for (const [fn, args] of [["ctl_caso_tomar", [cs.caso.id, null, null]], ["ctl_caso_comentar", [cs.caso.id, "hola mundo"]], ["ctl_caso_asignar", [cs.caso.id, ids["s@g.com"], fechaEn(3), null]]]) {
        const x = await rpc(correo, fn, args);
        assert.equal(x.code, "PF403", `${correo} ${fn}: ${x.message}`);
      }
    }
  });
  await sub(t, "tomar: asigna con fecha compromiso y pasa a investigación; valida la fecha y a quién se asigna", async () => {
    let x = await rpc("s@g.com", "ctl_caso_asignar", [cs.caso.id, ids["s@g.com"], fechaEn(-3), null]);
    assert.equal(x.code, "PF422", "fecha compromiso en el pasado");
    x = await rpc("s@g.com", "ctl_caso_asignar", [cs.caso.id, ids["s@g.com"], fechaEn(400), null]);
    assert.equal(x.code, "PF422", "tope de 180 días");
    x = await rpc("s@g.com", "ctl_caso_asignar", [cs.caso.id, ids["r@g.com"], fechaEn(3), null]);
    assert.equal(x.code, "PF422", "no se asigna a quien no investiga");
    x = await rpc("s@g.com", "ctl_caso_asignar", [cs.caso.id, ids["a@g.com"], fechaEn(3), null]);
    assert.equal(x.code, "PF422", "ni al soporte RANNIX");
    const r = await bien("s@g.com", "ctl_caso_tomar", [cs.caso.id, fechaEn(4), "lo reviso hoy"]);
    assert.equal(r.estado, "en_investigacion");
    const k2 = await caso(cs.caso.id);
    assert.equal(k2.estado, "en_investigacion"); assert.equal(k2.asignado_a, ids["s@g.com"]); assert.ok(k2.fecha_compromiso);
    bit = await bitacora(cs.caso.id);
    assert.ok(bit.some((b) => b.tipo === "asignacion" && b.usuario_id === ids["s@g.com"] && b.datos.asignado_a === ids["s@g.com"]));
    assert.ok(bit.some((b) => b.tipo === "cambio_estado" && b.estado_anterior === "abierta" && b.estado_nuevo === "en_investigacion"));
    const otro = await rpc("m@g.com", "ctl_caso_tomar", [cs.caso.id, null, null]);
    assert.equal(otro.code, "PF409", "no se pisa a quien ya lo investiga");
    await bien("m@g.com", "ctl_caso_asignar", [cs.caso.id, ids["m@g.com"], fechaEn(6), "reasigna el dueño"]);
    assert.equal((await caso(cs.caso.id)).asignado_a, ids["m@g.com"], "reasignar sí es posible, con rastro");
    await bien("m@g.com", "ctl_caso_asignar", [cs.caso.id, ids["s@g.com"], fechaEn(5), null]);
  });
  await sub(t, "comentar y adjuntar evidencia (con hash); el reenvío no duplica", async () => {
    await bien("s@g.com", "ctl_caso_comentar", [cs.caso.id, "Se revisó la bodega trasera."]);
    assert.equal((await rpc("s@g.com", "ctl_caso_comentar", [cs.caso.id, "  "])).code, "PF422");
    await owner();
    const ruta = `${ORG}/ctl/${cs.sede}/remision-1.jpg`;
    await c.query("insert into storage.objects (bucket_id, name, metadata) values ('pf-auditoria', $1, '{}'::jsonb)", [ruta]);
    const evId = randomUUID(), hash = "b".repeat(64);
    const e1 = await bien("s@g.com", "ctl_caso_adjuntar_evidencia", [cs.caso.id, evId, ruta, hash, 1500, 800, 600, null, "Foto de la remisión del proveedor"]);
    assert.equal(e1.ok, true);
    const e2 = await bien("s@g.com", "ctl_caso_adjuntar_evidencia", [cs.caso.id, evId, ruta, hash, 1500, 800, 600, null, "Foto de la remisión del proveedor"]);
    assert.equal(e2.duplicada, true, "el reenvío es idempotente");
    await owner();
    const ev = await filas("select * from piefirme.ctl_evidencia where origen_id = $1 and tipo_origen = 'caso'", [cs.caso.id]);
    assert.equal(ev.length, 1); assert.equal(ev[0].hash_sha256, hash);
    bit = await bitacora(cs.caso.id);
    assert.equal(bit.filter((b) => b.tipo === "evidencia").length, 1, "una sola entrada de bitácora por la evidencia");
    assert.equal(bit.find((b) => b.tipo === "evidencia").evidencia_id, evId);
    const sinFoto = await rpc("s@g.com", "ctl_caso_adjuntar_evidencia", [cs.caso.id, randomUUID(), `${ORG}/ctl/${cs.sede}/no-existe.jpg`, "c".repeat(64), 1, 1, 1, null, null]);
    assert.equal(sinFoto.code, "PF409", "sin foto reciente en el bucket no hay evidencia (no hay ruta de galería)");
  });
  await sub(t, "la causa del catálogo cerrado es obligatoria; «Otra» exige nota; el monto no excede el valor al costo", async () => {
    let x = await rpc("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, null, "empresa", 0, null]);
    assert.equal(x.code, "PF422");
    x = await rpc("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, randomUUID(), "empresa", 0, null]);
    assert.equal(x.code, "PF422", "causa fuera del catálogo");
    x = await rpc("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Otra"), "empresa", 0, "corta"]);
    assert.equal(x.code, "PF422"); assert.match(x.message, /nota/i);
    x = await rpc("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Robo"), "banco", 0, null]);
    assert.equal(x.code, "PF422", "responsable fuera de empresa|proveedor|empleado|seguro");
    x = await rpc("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Robo"), "empresa", 9999, null]);
    assert.equal(x.code, "PF422"); assert.match(x.message, /no puede ser mayor/);
    x = await rpc("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Robo"), "empresa", -1, null]);
    assert.equal(x.code, "PF422");
  });
  await sub(t, "cerrar sin ajuste: exige resolución y causa, deja la resolución y el saldo intacto", async () => {
    const saldoAntes = await saldo(cs.sede, cs.prod.id);
    assert.equal(saldoAntes, 5, "mientras el caso estuvo abierto el inventario no se movió");
    const sinRes = await rpc("s@g.com", "ctl_caso_cerrar_sin_ajuste", [cs.caso.id, await causaId("Error en el conteo"), "corta", null, 0]);
    assert.equal(sinRes.code, "PF422");
    const r = await bien("s@g.com", "ctl_caso_cerrar_sin_ajuste", [cs.caso.id, await causaId("Error en el conteo"), "Apareció la pieza en el cajón de la bodega; error de conteo.", null, 0]);
    assert.equal(r.estado, "cerrada_sin_ajuste");
    const k2 = await caso(cs.caso.id);
    assert.equal(k2.estado, "cerrada_sin_ajuste"); assert.ok(k2.cerrado_en); assert.match(k2.nota_cierre, /bodega/); assert.equal(k2.movimiento_origen_id, null);
    assert.equal(await saldo(cs.sede, cs.prod.id), 5, "cerrar sin ajuste NO toca el saldo");
    await owner();
    assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = $1", [cs.caso.folio])).n, 0);
    // ya cerrado: nada se modifica ni se comenta; no se autoriza un ajuste
    for (const [fn, args] of [["ctl_caso_comentar", [cs.caso.id, "otro comentario"]], ["ctl_caso_tomar", [cs.caso.id, null, null]], ["ctl_caso_rechazar", [cs.caso.id, "ya no procede, otro motivo"]],
                              ["ctl_autorizar_ajuste", [cs.caso.id, "123456"]]]) {
      const x = await rpc("m@g.com", fn, args);
      assert.equal(x.code, "PF409", `${fn} sobre un caso cerrado: ${x.message}`);
    }
    bit = await bitacora(cs.caso.id);
    assert.ok(bit.length >= 6, "la bitácora conserva toda la historia");
    assert.equal(bit.filter((b) => b.estado_nuevo === "cerrada_sin_ajuste").length, 1);
  });
});

test("rechazar: el caso improcedente se rechaza con motivo y el saldo no se toca", async () => {
  const cs = await casoDelMotor({ saldoSis: 4, fisico: 3, nombre: "Rechazo" });
  await bien("s@g.com", "ctl_caso_tomar", [cs.caso.id, null, null]);
  const corto = await rpc("m@g.com", "ctl_caso_rechazar", [cs.caso.id, "no"]);
  assert.equal(corto.code, "PF422");
  const r = await bien("m@g.com", "ctl_caso_rechazar", [cs.caso.id, "El conteo se hizo con la bodega abierta; no procede."]);
  assert.equal(r.estado, "rechazada");
  const k2 = await caso(cs.caso.id);
  assert.equal(k2.estado, "rechazada"); assert.ok(k2.cerrado_en);
  assert.equal(await saldo(cs.sede, cs.prod.id), 4);
});

test("bitácora de solo inserciones: ni la app ni el dueño de la base la editan o borran", async () => {
  const cs = await casoDelMotor({ nombre: "BitInmutable" });
  await bien("s@g.com", "ctl_caso_tomar", [cs.caso.id, null, null]);
  for (const correo of ["m@g.com", "s@g.com", "r@g.com"]) {
    await como(correo);
    for (const sql of ["update piefirme.ctl_caso_bitacora set texto = 'editado'", "delete from piefirme.ctl_caso_bitacora", "insert into piefirme.ctl_caso_bitacora (organizacion_id, caso_id, tipo) values ($1, $2, 'comentario')"]) {
      const x = await intentar(sql, sql.startsWith("insert") ? [ORG, cs.caso.id] : []);
      assert.equal(x.code, "42501", `${correo}: ${sql}`);
    }
    const t = await intentar("truncate piefirme.ctl_caso_bitacora");
    assert.equal(t.code, "42501");
  }
  await owner();
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  assert.equal((await intentar("update piefirme.ctl_caso_bitacora set texto = 'x' where caso_id = $1", [cs.caso.id])).code, "PF403");
  assert.equal((await intentar("delete from piefirme.ctl_caso_bitacora where caso_id = $1", [cs.caso.id])).code, "PF403");
  assert.equal((await intentar("truncate piefirme.ctl_caso_bitacora")).code, "PF403");
  // los casos tampoco se editan fuera de una RPC ni se borran
  await c.query("select set_config('app.ctl_rpc', '', true)");
  assert.equal((await intentar("update piefirme.ctl_caso set estado = 'rechazada' where id = $1", [cs.caso.id])).code, "PF403");
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  assert.equal((await intentar("update piefirme.ctl_caso set estado = 'abierta' where id = $1", [cs.caso.id])).code, "PF409", "transición inválida en_investigacion → abierta por la puerta de atrás");
  assert.equal((await intentar("delete from piefirme.ctl_caso where id = $1", [cs.caso.id])).code, "PF403");
});

// ═════════════════════════════ 3 · SEPARACIÓN DE FUNCIONES Y CONTRASEÑA (criterio 2) ═════════════════════════════
test("quien capturó no autoriza su propio caso, ni cierra ni rechaza el suyo (criterio 2); el supervisor no autoriza; el PIN no sirve", async (t) => {
  // el DUEÑO capturó (auditoría puntual de m@g.com) → su caso lo debe autorizar otra persona
  const sede = await crearSede("Separa"); const prod = await crearProducto("Separa", 80, { precio: 160 }); await existencia(sede, prod.id, 6);
  const pu = await bien("m@g.com", "ctl_sesion_iniciar", ["auditoria_puntual", sede, JSON.stringify({ modo_lista: "libre" })]);
  await bien("m@g.com", "ctl_capturar_partida", [randomUUID(), pu.sesion_id, prod.codigo_barras, 4, null, null, null, null, null, null, null]);
  await bien("m@g.com", "ctl_sesion_cerrar", [pu.sesion_id]);
  const propio = (await casosDe(pu.sesion_id))[0];
  assert.equal(propio.usuario_captura, ids["m@g.com"]);
  await investigado(propio, { monto: 160 });

  await sub(t, "el dueño que capturó recibe un rechazo claro del servidor y el caso no cambia", async () => {
    const x = await rpc("m@g.com", "ctl_autorizar_ajuste", [propio.id, "123456"]);
    assert.equal(x.code, "PF403"); assert.match(x.message, /capturó/i); assert.match(x.message, /otra persona/i);
    for (const [fn, args] of [["ctl_caso_cerrar_sin_ajuste", [propio.id, await causaId("Error en el conteo"), "Apareció en la bodega trasera.", null, 0]], ["ctl_caso_rechazar", [propio.id, "No procede, motivo suficiente"]]]) {
      const y = await rpc("m@g.com", fn, args);
      assert.equal(y.code, "PF403", `${fn}: quien capturó no cierra su propio caso`);
    }
    assert.equal((await caso(propio.id)).estado, "en_investigacion");
    assert.equal(await saldo(sede, prod.id), 6, "el inventario no se movió");
    assert.equal((await rpc("m@g.com", "ctl_reintentar_ajuste", [propio.id, "123456"])).code, "PF409");
  });
  await sub(t, "el supervisor (aunque investigó) no autoriza: la capacidad es solo del dueño", async () => {
    const x = await rpc("s@g.com", "ctl_autorizar_ajuste", [propio.id, "123456"]);
    assert.equal(x.code, "PF403");
    assert.equal((await rpc("s@g.com", "ctl_reintentar_ajuste", [propio.id, "123456"])).code, "PF403");
  });
  await sub(t, "sucursal y soporte tampoco autorizan", async () => {
    for (const correo of ["r@g.com", "p@g.com", "a@g.com"]) assert.equal((await rpc(correo, "ctl_autorizar_ajuste", [propio.id, "123456"])).code, "PF403", correo);
  });
  await sub(t, "otra persona (el dueño, siendo r@g.com quien capturó y s@g.com quien investigó) puede; con el PIN no, con la contraseña completa sí (criterio 2/11)", async () => {
    const cs = await casoDelMotor({ saldoSis: 5, fisico: 3, nombre: "Pw" });
    await investigado(cs.caso, { monto: 200 });
    const conPin = await bien("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, "4321"]);
    assert.equal(conPin.ok, false); assert.equal(conPin.error, "contrasena_incorrecta");
    assert.match(conPin.mensaje, /contraseña completa/);
    assert.equal((await caso(cs.caso.id)).estado, "en_investigacion"); assert.equal(await saldo(cs.sede, cs.prod.id), 5);
    const vacio = await bien("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, ""]);
    assert.equal(vacio.ok, false);
    const bien1 = await bien("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, "123456"]);
    assert.equal(bien1.ok, true); assert.equal(bien1.estado, "cerrada_con_ajuste");
  });
  await sub(t, "la autorización exige causa, responsable del costo y monto", async () => {
    const cs = await casoDelMotor({ saldoSis: 5, fisico: 4, nombre: "SinDatos" });
    await bien("s@g.com", "ctl_caso_tomar", [cs.caso.id, null, null]);
    const sinCausa = await rpc("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, "123456"]);
    assert.equal(sinCausa.code, "PF422"); assert.match(sinCausa.message, /causa/);
    await bien("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Robo"), "proveedor", 50, null]);
    const ok = await bien("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, "123456"]);
    assert.equal(ok.ok, true);
    const k2 = await caso(cs.caso.id);
    assert.equal(k2.responsable_costo, "proveedor"); assert.equal(Number(k2.monto_costo), 50);
  });
  await sub(t, "«Otra» sin nota no se autoriza aunque se haya forzado guardar", async () => {
    const cs = await casoDelMotor({ saldoSis: 5, fisico: 4, nombre: "OtraSinNota" });
    await bien("s@g.com", "ctl_caso_tomar", [cs.caso.id, null, null]);
    await owner();
    await c.query("select set_config('app.ctl_rpc', 'on', true)");
    await c.query("update piefirme.ctl_caso set causa_id = $2, responsable_costo = 'empresa', monto_costo = 0 where id = $1", [cs.caso.id, await causaId("Otra")]);
    const x = await rpc("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, "123456"]);
    assert.equal(x.code, "PF422"); assert.match(x.message, /nota/i);
  });
});

// ═════════════════════════════ 4 · AJUSTE APLICADO (criterio 11) ═════════════════════════════
test("autorizado el caso: el origen aplica el ajuste, el caso guarda el id del movimiento y el delta lleva el signo correcto (criterio 11)", async () => {
  // faltante → delta negativo
  const f = await casoDelMotor({ saldoSis: 5, fisico: 3, costo: 120, nombre: "AjusteFalt" });
  await investigado(f.caso, { causa: "Merma o producto dañado", monto: 240, responsable: "empresa", nota: null });
  assert.equal(await saldo(f.sede, f.prod.id), 5, "abierto: no se mueve");
  const r = await bien("m@g.com", "ctl_autorizar_ajuste", [f.caso.id, "123456"]);
  assert.equal(r.ok, true); assert.equal(r.estado, "cerrada_con_ajuste"); assert.ok(r.movimiento_id); assert.equal(r.par, false);
  const k2 = await caso(f.caso.id);
  assert.equal(k2.estado, "cerrada_con_ajuste"); assert.equal(k2.movimiento_origen_id, r.movimiento_id); assert.equal(k2.autorizado_por, ids["m@g.com"]); assert.ok(k2.autorizado_en); assert.ok(k2.cerrado_en);
  assert.equal(await saldo(f.sede, f.prod.id), 3, "faltante de 2: el saldo baja 2");
  await owner();
  const mv = await uno("select tipo, cantidad::text as cantidad, sede_id, producto_id, referencia_tipo, referencia_folio, usuario_id from piefirme.movimientos_inventario where id = $1", [r.movimiento_id]);
  assert.equal(mv.tipo, "ajuste"); assert.equal(Number(mv.cantidad), -2); assert.equal(mv.referencia_folio, f.caso.folio); assert.equal(mv.referencia_tipo, "ctl_caso"); assert.equal(mv.usuario_id, ids["m@g.com"]);
  const ll = await uno("select estado, movimiento_id, peticion, respuesta, intentos from piefirme.ctl_llamada_origen where folio_caso = $1", [f.caso.folio]);
  assert.equal(ll.estado, "aplicada"); assert.equal(ll.movimiento_id, r.movimiento_id); assert.equal(Number(ll.peticion.cantidad_delta), -2); assert.equal(ll.respuesta.ok, true);
  const bit = await bitacora(f.caso.id);
  const fin = bit.find((b) => b.estado_nuevo === "cerrada_con_ajuste");
  assert.ok(fin); assert.equal(fin.usuario_id, ids["m@g.com"]); assert.equal(fin.datos.movimiento_id, r.movimiento_id);
  // un reenvío de la autorización (doble clic / error de red) no duplica el ajuste
  const otra = await rpc("m@g.com", "ctl_autorizar_ajuste", [f.caso.id, "123456"]);
  assert.equal(otra.code, "PF409");
  assert.equal(await saldo(f.sede, f.prod.id), 3);
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = $1", [f.caso.folio])).n, 1);

  // sobrante → delta positivo
  const s = await casoDelMotor({ saldoSis: 2, fisico: 5, costo: 30, nombre: "AjusteSobr" });
  assert.equal(Number(s.caso.cantidad), 3);
  await investigado(s.caso, { causa: "Entrada de mercancía no registrada", monto: 0, responsable: "proveedor" });
  const r2 = await bien("m@g.com", "ctl_autorizar_ajuste", [s.caso.id, "123456"]);
  assert.equal(r2.ok, true);
  assert.equal(await saldo(s.sede, s.prod.id), 5, "sobrante de 3: el saldo sube 3");
  await owner();
  assert.equal(Number((await uno("select cantidad::text as c from piefirme.movimientos_inventario where id = $1", [r2.movimiento_id])).c), 3);
});

test("el responsable «empleado» es registro de control interno: queda anotado así y el módulo no tiene integración con nómina", async () => {
  const cs = await casoDelMotor({ saldoSis: 3, fisico: 2, costo: 90, nombre: "Empleado" });
  await bien("s@g.com", "ctl_caso_tomar", [cs.caso.id, null, null]);
  await bien("s@g.com", "ctl_caso_guardar_cierre", [cs.caso.id, await causaId("Error de captura en venta"), "empleado", 90, "registro interno"]);
  const bit = await bitacora(cs.caso.id);
  const prop = bit.find((b) => b.datos?.accion === "propuesta_cierre");
  assert.match(prop.texto, /registro de control interno/i); assert.match(prop.texto, /no es instrucción de descuento a nómina/i);
  await owner();
  const fuentes = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('piefirme', 'piefirme_app') and p.proname like 'ctl\\_%' and p.proname ~* '(^|_)(nomina|payroll|descuento|descuentos)(_|$)'`);
  assert.deepEqual(fuentes, [], "ninguna función del módulo toca nómina");
});

// ═════════════════════════════ 5 · EL ORIGEN RECHAZA (criterio 12) E IDEMPOTENCIA (criterio 13) ═════════════════════════════
test("el origen rechaza: ajuste_fallido visible con su mensaje y alerta; el reintento lo aplica una sola vez (criterios 12 y 13)", async (t) => {
  // el producto aún no pertenece a la clínica en el origen: el kardex lo rechaza («producto de otra clínica»)
  const sede = await crearSede("Rechaza"); const ajeno = await crearProducto("Ajeno", 70, { org: otraOrg });
  await owner();
  const nuevo = (await uno(`insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, valor, estado, usuario_captura, asignado_a, causa_id, responsable_costo, monto_costo)
                            values ($1, $2, 'diferencia_inventario', 'partida_conteo', $3, $4, -2, -140, 'en_investigacion', $5, $6, $7, 'empresa', 0) returning id, folio`,
                           [ORG, sede, randomUUID(), ajeno.id, ids["r@g.com"], ids["s@g.com"], await causaId("Merma o producto dañado")]));
  await sub(t, "rechazo: ajuste_fallido, sin mover el saldo, con mensaje, bitácora y alerta; visible en la lista", async () => {
    const r = await bien("m@g.com", "ctl_autorizar_ajuste", [nuevo.id, "123456"]);
    assert.equal(r.ok, false); assert.equal(r.estado, "ajuste_fallido"); assert.match(r.mensaje, /otra clínica/);
    const k2 = await caso(nuevo.id);
    assert.equal(k2.estado, "ajuste_fallido"); assert.equal(k2.movimiento_origen_id, null); assert.equal(k2.cerrado_en, null);
    await owner();
    const ll = await uno("select estado, mensaje, intentos from piefirme.ctl_llamada_origen where folio_caso = $1", [nuevo.folio]);
    assert.equal(ll.estado, "rechazada"); assert.match(ll.mensaje, /otra clínica/); assert.equal(ll.intentos, 1);
    assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = $1", [nuevo.folio])).n, 0);
    const bit = await bitacora(nuevo.id);
    assert.ok(bit.some((b) => b.estado_nuevo === "ajuste_fallido" && /rechazó el ajuste/.test(b.texto)));
    const al = await filas("select * from piefirme.ctl_alerta where tipo = 'ajuste_fallido' and referencia_id = $1", [nuevo.id]);
    assert.equal(al.length, 1); assert.equal(al[0].estado, "nueva"); assert.equal(al[0].severidad, "alta");
    const lista = await bien("m@g.com", "ctl_casos_listar", [JSON.stringify({ estados: ["ajuste_fallido"], sucursal: sede })]);
    assert.equal(lista.total, 1); assert.equal(lista.casos[0].folio, nuevo.folio); assert.equal(lista.casos[0].estado, "ajuste_fallido");
  });
  await sub(t, "reintentar sin que el origen se haya recuperado: sigue fallido, cuenta el intento, no duplica la alerta", async () => {
    const r = await bien("m@g.com", "ctl_reintentar_ajuste", [nuevo.id, "123456"]);
    assert.equal(r.ok, false); assert.equal(r.estado, "ajuste_fallido");
    await owner();
    assert.equal((await uno("select intentos from piefirme.ctl_llamada_origen where folio_caso = $1", [nuevo.folio])).intentos, 2);
    assert.equal((await filas("select 1 from piefirme.ctl_alerta where tipo = 'ajuste_fallido' and referencia_id = $1", [nuevo.id])).length, 1);
    assert.equal((await rpc("s@g.com", "ctl_reintentar_ajuste", [nuevo.id, "123456"])).code, "PF403", "reintentar es autorizar de nuevo: solo el dueño");
    assert.equal((await rpc("m@g.com", "ctl_reintentar_ajuste", [nuevo.id, "mala"])).r.ok, false, "reintentar exige la contraseña completa");
  });
  await sub(t, "el origen se recupera: el reintento aplica UN movimiento, cierra el caso y atiende la alerta (criterio 13)", async () => {
    await owner();
    await c.query("update piefirme.productos set organizacion_id = $2, folio = null where id = $1", [ajeno.id, ORG]);   // el origen ya reconoce el producto
    await existencia(sede, ajeno.id, 9);
    const r = await bien("m@g.com", "ctl_reintentar_ajuste", [nuevo.id, "123456"]);
    assert.equal(r.ok, true); assert.equal(r.estado, "cerrada_con_ajuste"); assert.ok(r.movimiento_id);
    assert.equal(await saldo(sede, ajeno.id), 7);
    await owner();
    assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = $1", [nuevo.folio])).n, 1);
    const ll = await uno("select estado, movimiento_id, intentos from piefirme.ctl_llamada_origen where folio_caso = $1", [nuevo.folio]);
    assert.equal(ll.estado, "aplicada"); assert.equal(ll.movimiento_id, r.movimiento_id); assert.equal(ll.intentos, 3);
    assert.equal((await caso(nuevo.id)).movimiento_origen_id, r.movimiento_id);
    assert.equal((await uno("select estado from piefirme.ctl_alerta where tipo = 'ajuste_fallido' and referencia_id = $1", [nuevo.id])).estado, "atendida");
    // otro reintento sobre el caso ya cerrado no hace nada
    assert.equal((await rpc("m@g.com", "ctl_reintentar_ajuste", [nuevo.id, "123456"])).code, "PF409");
    assert.equal(await saldo(sede, ajeno.id), 7);
  });
});

test("idempotencia por folio_caso: si el origen ya había aplicado el movimiento (se perdió la respuesta), autorizar devuelve ese mismo movimiento y no crea otro (criterio 13)", async () => {
  const cs = await casoDelMotor({ saldoSis: 6, fisico: 4, costo: 60, nombre: "Idem" });
  await investigado(cs.caso, { causa: "Traspaso no registrado", monto: 0, responsable: "empresa" });
  // el «error de red»: el origen aplicó el ajuste pero el módulo no alcanzó a registrar la respuesta
  await owner();
  const previo = await uno("select piefirme.ctl_solicitar_ajuste_origen($1, $2, $3, $4::numeric, 'ajuste_por_auditoria', 'Traspaso no registrado', $5, now(), $6) as r",
                           [cs.caso.folio, cs.sede, cs.prod.id, Number(cs.caso.cantidad), ids["m@g.com"], ORG]);
  assert.equal(previo.r.ok, true);
  assert.equal(await saldo(cs.sede, cs.prod.id), 4);
  const r = await bien("m@g.com", "ctl_autorizar_ajuste", [cs.caso.id, "123456"]);
  assert.equal(r.ok, true); assert.equal(r.idempotente, true); assert.equal(r.movimiento_id, previo.r.movimiento_id);
  assert.equal(await saldo(cs.sede, cs.prod.id), 4, "el saldo se movió una sola vez");
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = $1", [cs.caso.folio])).n, 1);
  assert.equal((await caso(cs.caso.id)).movimiento_origen_id, previo.r.movimiento_id);
  // el mismo folio con otros datos se rechaza (el módulo no puede reutilizar un folio para otra cantidad)
  const x = await intentar("select piefirme.ctl_solicitar_ajuste_origen($1, $2, $3, 99, 'ajuste_por_auditoria', 'x', $4, now(), $5)", [cs.caso.folio, cs.sede, cs.prod.id, ids["m@g.com"], ORG]);
  assert.equal(x.code, "PF409");
});

// ═════════════════════════════ 6 · SUSTITUCIÓN DE CÓDIGO: AJUSTE DEL PAR ═════════════════════════════
test("sustitución de código: el caso lleva los dos productos y el ajuste del par se aplica completo o no se aplica (criterio 14 + F4.4)", async (t) => {
  async function par(nombre) {
    const sede = await crearSede(nombre);
    const caro = await crearProducto(nombre + "-caro", 600, { precio: 900 }), barato = await crearProducto(nombre + "-barato", 100, { precio: 150 });
    await existencia(sede, caro.id, 2); await existencia(sede, barato.id, 1);
    const ini = await bien("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
    await bien("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, caro.codigo_barras, 1, null, null, null, null, null, null, null]);      // falta 1 (600)
    await bien("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, barato.codigo_barras, 2, null, null, null, null, null, null, null]);   // sobra 1 (100)
    const cierre = await bien("m@g.com", "ctl_sesion_cerrar", [ini.sesion_id]);
    assert.equal(cierre.sustituciones, 1);
    const casos = await casosDe(ini.sesion_id);
    return { sede, caro, barato, principal: casos.find((x) => x.producto_id === caro.id), contra: casos.find((x) => x.producto_id === barato.id) };
  }
  const P = await par("Par");
  assert.equal(P.principal.contexto.sustitucion.rol, "faltante_caro"); assert.equal(P.contra.contexto.sustitucion.rol, "sobrante_barato");
  assert.equal(Number(P.principal.cantidad), -1); assert.equal(Number(P.contra.cantidad), 1);

  await sub(t, "las acciones se hacen sobre el principal; la contraparte solo admite comentarios y las acciones se reflejan en ambos", async () => {
    for (const [fn, args] of [["ctl_caso_tomar", [P.contra.id, null, null]], ["ctl_caso_guardar_cierre", [P.contra.id, await causaId("Robo"), "empresa", 0, null]],
                              ["ctl_caso_cerrar_sin_ajuste", [P.contra.id, await causaId("Robo"), "Apareció la pieza en otra caja.", null, 0]], ["ctl_caso_rechazar", [P.contra.id, "no procede, es duplicado"]]]) {
      const x = await rpc("s@g.com", fn, args);
      assert.equal(x.code, "PF422", `${fn}: ${x.message}`); assert.match(x.message, new RegExp(P.principal.folio));
    }
    await bien("s@g.com", "ctl_caso_tomar", [P.principal.id, fechaEn(4), null]);
    assert.equal((await caso(P.contra.id)).estado, "en_investigacion", "la contraparte pasa con su principal");
    assert.equal((await caso(P.contra.id)).asignado_a, ids["s@g.com"]);
    await bien("s@g.com", "ctl_caso_comentar", [P.contra.id, "Los dos códigos se parecen en la etiqueta."]);
    const alto = await rpc("s@g.com", "ctl_caso_guardar_cierre", [P.principal.id, await causaId("Error de captura en venta"), "empresa", 701, null]);
    assert.equal(alto.code, "PF422", "el tope del monto es el valor del par (600 + 100)");
    await bien("s@g.com", "ctl_caso_guardar_cierre", [P.principal.id, await causaId("Error de captura en venta"), "empresa", 500, null]);
    assert.equal((await caso(P.contra.id)).causa_id, await causaId("Error de captura en venta"), "la causa se refleja en el par");
    const sobre = await rpc("m@g.com", "ctl_autorizar_ajuste", [P.contra.id, "123456"]);
    assert.equal(sobre.code, "PF422", "no se autoriza la contraparte por separado");
  });
  await sub(t, "autorizar el principal aplica los DOS ajustes (faltante negativo, sobrante positivo) y deja un movimiento por caso", async () => {
    const r = await bien("m@g.com", "ctl_autorizar_ajuste", [P.principal.id, "123456"]);
    assert.equal(r.ok, true); assert.equal(r.par, true); assert.equal(r.movimientos.length, 2);
    assert.equal(await saldo(P.sede, P.caro.id), 1); assert.equal(await saldo(P.sede, P.barato.id), 2);
    const a = await caso(P.principal.id), b = await caso(P.contra.id);
    assert.equal(a.estado, "cerrada_con_ajuste"); assert.equal(b.estado, "cerrada_con_ajuste");
    assert.ok(a.movimiento_origen_id && b.movimiento_origen_id && a.movimiento_origen_id !== b.movimiento_origen_id);
    await owner();
    const mv = await filas("select referencia_folio, cantidad::text as cantidad, producto_id from piefirme.movimientos_inventario where referencia_folio = any($1) order by cantidad", [[P.principal.folio, P.contra.folio]]);
    assert.equal(mv.length, 2); assert.equal(Number(mv[0].cantidad), -1); assert.equal(mv[0].producto_id, P.caro.id); assert.equal(Number(mv[1].cantidad), 1); assert.equal(mv[1].producto_id, P.barato.id);
    const bitA = await bitacora(P.principal.id), bitB = await bitacora(P.contra.id);
    assert.equal(bitA.find((x) => x.estado_nuevo === "cerrada_con_ajuste").datos.par, P.contra.folio, "el par queda documentado en la bitácora");
    assert.equal(bitB.find((x) => x.estado_nuevo === "cerrada_con_ajuste").datos.principal, P.principal.folio);
  });
  await sub(t, "si el origen rechaza UNO de los dos, no se aplica NINGUNO: ambos casos en ajuste_fallido y el reintento aplica el par", async () => {
    const Q = await par("ParFalla");
    await investigado(Q.principal, { monto: 100 });
    await owner();
    await c.query("update piefirme.productos set organizacion_id = $2, folio = null where id = $1", [Q.barato.id, otraOrg]);   // el origen deja de reconocer la contraparte
    const r = await bien("m@g.com", "ctl_autorizar_ajuste", [Q.principal.id, "123456"]);
    assert.equal(r.ok, false); assert.equal(r.estado, "ajuste_fallido"); assert.match(r.mensaje, /par se revirtió completo/);
    assert.equal(await saldo(Q.sede, Q.caro.id), 2, "el faltante tampoco se aplicó");
    assert.equal(await saldo(Q.sede, Q.barato.id), 1);
    assert.equal((await caso(Q.principal.id)).estado, "ajuste_fallido"); assert.equal((await caso(Q.contra.id)).estado, "ajuste_fallido");
    await owner();
    const lls = await filas("select folio_caso, estado from piefirme.ctl_llamada_origen where folio_caso = any($1) order by folio_caso", [[Q.principal.folio, Q.contra.folio]]);
    assert.equal(lls.length, 2); assert.ok(lls.every((l) => l.estado === "rechazada"), "las dos peticiones quedan registradas como rechazadas");
    assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = any($1)", [[Q.principal.folio, Q.contra.folio]])).n, 0);
    await c.query("update piefirme.productos set organizacion_id = $2, folio = null where id = $1", [Q.barato.id, ORG]);   // el origen se recupera
    const r2 = await bien("m@g.com", "ctl_reintentar_ajuste", [Q.principal.id, "123456"]);
    assert.equal(r2.ok, true); assert.equal(r2.movimientos.length, 2);
    assert.equal(await saldo(Q.sede, Q.caro.id), 1); assert.equal(await saldo(Q.sede, Q.barato.id), 2);
    assert.equal((await caso(Q.contra.id)).estado, "cerrada_con_ajuste");
  });
});

// ═════════════════════════════ 7 · DETALLE CON MOVIMIENTOS DE CONTEXTO (criterios 15 y 24) ═════════════════════════════
test("detalle: movimientos desde el conteo anterior, cancelación ligada, evidencia, bitácora y asignación; informa, no acusa (criterios 15 y 24)", async (t) => {
  const sede = await crearSede("Detalle"); const prod = await crearProducto("Detalle", 120, { precio: 240 });
  // línea de tiempo del producto (como dueño de la base, con fechas explícitas)
  await mov(sede, prod.id, "compra", 20, "25 days", { costo: 100, doc: "OC-VIEJA" });                         // ANTES del conteo anterior: no debe salir
  const previo = await mov(sede, prod.id, "conteo", 1, "10 days", { usuario: "r@g.com" });                     // el conteo anterior
  await mov(sede, prod.id, "compra", 6, "6 days", { costo: 100, doc: "OC-6DIAS", usuario: "s@g.com" });        // entrada de mercancía
  await mov(sede, prod.id, "traspaso_entrada", 2, "4 days", { doc: "TRP-4", usuario: "s@g.com" });             // traspaso
  await mov(sede, prod.id, "merma", -1, "1 day", { doc: "MER-1", usuario: "p@g.com" });
  const vta = await venta(sede, prod.id, "cobrada", 3, "r@g.com");                                              // venta
  const canc = await venta(sede, prod.id, "cancelada", 2, "r@g.com");                                           // cancelación (cae dentro de los 7 días del cruce)
  const lejana = await venta(sede, prod.id, "cancelada", 15, "p@g.com");                                        // cancelación fuera de ventana y anterior al conteo previo
  await existencia(sede, prod.id, 6);
  const ini = await bien("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  await bien("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, prod.codigo_barras, 4, null, null, null, null, null, null, null]);
  await bien("m@g.com", "ctl_sesion_cerrar", [ini.sesion_id]);
  const cs = (await casosDe(ini.sesion_id))[0];
  assert.ok(cs.contexto.cancelacion, "el caso nace con la cancelación ligada (criterio 15)");
  assert.equal(cs.contexto.cancelacion.folio, canc.folio);
  await investigado(cs, { monto: 0 });
  // un movimiento POSTERIOR al conteo (p. ej. la entrada que alguien registró tarde)
  await mov(sede, prod.id, "compra", 1, "-2 hours", { costo: 100, doc: "OC-TARDE", usuario: "s@g.com" });

  const d = await bien("s@g.com", "ctl_caso_detalle", [cs.id]);
  await sub(t, "trae la diferencia, los movimientos desde el conteo anterior y no los anteriores a él", async () => {
    assert.equal(d.caso.folio, cs.folio); assert.equal(Number(d.caso.cantidad), -2); assert.equal(d.caso.sucursal, `QCS Detalle`);
    assert.equal(new Date(d.contexto.conteo_anterior).getTime(), new Date(previo.fecha).getTime(), "la ventana empieza en el conteo anterior");
    assert.equal(d.contexto.ventana_por_omision, false);
    const docs = d.contexto.movimientos.map((m2) => m2.documento);
    for (const esperado of ["OC-6DIAS", "TRP-4", "MER-1", "OC-TARDE"]) assert.ok(docs.includes(esperado), `falta ${esperado}`);
    assert.ok(!docs.includes("OC-VIEJA"), "la compra de hace 25 días es anterior al conteo anterior");
    const tipos = new Set(d.contexto.movimientos.map((m2) => m2.tipo));
    assert.ok(tipos.has("compra") && tipos.has("traspaso_entrada") && tipos.has("merma"));
    assert.equal(d.contexto.movimientos.find((m2) => m2.documento === "OC-TARDE").posterior_al_conteo, true, "lo registrado después del conteo se marca");
    assert.equal(d.contexto.movimientos.find((m2) => m2.documento === "OC-6DIAS").posterior_al_conteo, false);
    assert.ok(d.contexto.ventas.some((v) => v.ticket === vta.folio), "la venta aparece");
    assert.equal(Number(d.contexto.saldo_actual), 7, "6 al contar + la entrada registrada después");
  });
  await sub(t, "las cancelaciones y devoluciones de la ventana aparecen, y la ligada al caso va marcada", async () => {
    const lig = d.contexto.cancelaciones.find((x) => x.ticket === canc.folio);
    assert.ok(lig, "la cancelación del cruce F1.4 está en el detalle"); assert.equal(lig.ligada_al_caso, true);
    assert.ok(!d.contexto.cancelaciones.some((x) => x.ticket === lejana.folio), "una cancelación de hace 15 días queda fuera de la ventana");
    assert.ok(d.caso.contexto.cancelacion, "y el contexto original del caso la conserva");
  });
  await sub(t, "acota ventana y personas con acceso (turnos), sin etiquetas de culpa ni ranking", async () => {
    assert.ok(d.contexto.desde && d.contexto.hasta && d.contexto.corte);
    assert.ok(Array.isArray(d.contexto.personas) && d.contexto.personas.length >= 2);
    const nombres = d.contexto.personas.map((p2) => p2.nombre);
    assert.deepEqual(nombres, [...nombres].sort((x, y) => x.localeCompare(y)), "las personas van en orden alfabético, no por «sospecha»");
    assert.match(d.contexto.nota, /no es una conclusión/i);
    const texto = JSON.stringify({ ...d, contexto: { ...d.contexto, nota: "" } }).toLowerCase();   // la nota fija del servidor aclara que no señala culpables
    for (const culpa of ["culpable", "sospechoso", "ladrón", "ladron", "robó", "robo sospechado", "responsable del faltante"]) assert.ok(!texto.includes(culpa), `la respuesta no debe etiquetar con «${culpa}»`);
  });
  await sub(t, "incluye bitácora (con el usuario), asignación, historial del producto y la evidencia adjunta", async () => {
    await owner();
    const ruta = `${ORG}/ctl/${sede}/detalle.jpg`;
    await c.query("insert into storage.objects (bucket_id, name, metadata) values ('pf-auditoria', $1, '{}'::jsonb)", [ruta]);
    await bien("s@g.com", "ctl_caso_adjuntar_evidencia", [cs.id, randomUUID(), ruta, "d".repeat(64), 900, 640, 480, null, "Nota de compra del proveedor"]);
    const d2 = await bien("m@g.com", "ctl_caso_detalle", [cs.id]);
    assert.equal(d2.caso.asignado_a, ids["s@g.com"]); assert.ok(d2.caso.fecha_compromiso);
    assert.ok(d2.bitacora.length >= 4); assert.ok(d2.bitacora.some((b) => b.usuario === "Sistema" && b.estado_nuevo === "abierta"), "la apertura es del sistema");
    const orden = d2.bitacora.map((b) => b.tipo + ":" + (b.estado_nuevo ?? ""));
    assert.ok(orden.indexOf("asignacion:") < orden.indexOf("cambio_estado:en_investigacion"), "la asignación se lee antes del cambio de estado que provoca");
    assert.equal(d2.evidencias.length, 1); assert.equal(d2.evidencias[0].hash_sha256, "d".repeat(64));
    assert.deepEqual(d2.yo, { capture: false, investigue: false });
    const d3 = await bien("s@g.com", "ctl_caso_detalle", [cs.id]);
    assert.equal(d3.yo.investigue, true);
    assert.ok(Array.isArray(d2.historial_producto));
  });
  await sub(t, "cada consulta de detalle deja renglón en la bitácora de consultas; soporte lee sin movimientos ni fotos", async () => {
    await owner();
    const antes = (await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where reporte = 'caso_detalle' and (filtros ->> 'caso_id') = $1", [cs.id])).n;
    const ds = await bien("a@g.com", "ctl_caso_detalle", [cs.id]);
    assert.equal(ds.caso.folio, cs.folio); assert.deepEqual(ds.contexto.movimientos, []); assert.deepEqual(ds.evidencias, [], "el soporte no ve fotos");
    await owner();
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where reporte = 'caso_detalle' and (filtros ->> 'caso_id') = $1", [cs.id])).n, antes + 1);
  });
  await sub(t, "sin conteo anterior la ventana es de 30 días y se avisa que es por omisión", async () => {
    const x = await casoDelMotor({ saldoSis: 3, fisico: 2, nombre: "SinPrevio" });
    const dx = await bien("s@g.com", "ctl_caso_detalle", [x.caso.id]);
    assert.equal(dx.contexto.ventana_por_omision, true); assert.equal(dx.contexto.conteo_anterior, null);
  });
});

test("criterio 1: el rol de sucursal no ve casos, diferencias ni reportes de casos (RLS y RPC)", async () => {
  const cs = await casoDelMotor({ saldoSis: 5, fisico: 2, nombre: "Ciego" });
  for (const correo of ["r@g.com", "p@g.com"]) {
    await como(correo);
    for (const rel of ["ctl_caso", "ctl_caso_bitacora", "ctl_llamada_origen", "ctl_alerta", "ctl_causa"]) {
      const x = await intentar(`select count(*)::int as n from piefirme.${rel}`);
      assert.ok(x.ok, `${rel}: ${x.message}`); assert.equal(x.rows[0].n, 0, `${correo} ve filas de ${rel}`);
    }
    for (const [fn, args] of [["ctl_casos_listar", ["{}"]], ["ctl_caso_detalle", [cs.caso.id]], ["ctl_casos_reportes", [null, null, null]]]) {
      const x = await rpc(correo, fn, args);
      assert.equal(x.code, "PF403", `${correo} ${fn}: ${x.message}`);
    }
  }
});

// ═════════════════════════════ 8 · LISTA, FILTROS Y BANDEJA «MIS CASOS» ═════════════════════════════
test("lista: filtros por estado, sucursal, tipo, antigüedad y asignado; «mis casos» y resumen por estado", async () => {
  const sede = await crearSede("Lista");
  const ps = []; for (let i = 0; i < 3; i++) { const p = await crearProducto(`Lista${i}`, 50 + i, { precio: 100 }); await existencia(sede, p.id, 5); ps.push(p); }
  const ini = await bien("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  for (const p of ps) await bien("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, p.codigo_barras, 3, null, null, null, null, null, null, null]);
  await bien("m@g.com", "ctl_sesion_cerrar", [ini.sesion_id]);
  const casos = await casosDe(ini.sesion_id);
  assert.equal(casos.length, 3);
  await bien("s@g.com", "ctl_caso_tomar", [casos[0].id, fechaEn(3), null]);
  await bien("m@g.com", "ctl_caso_tomar", [casos[1].id, fechaEn(3), null]);
  await owner();   // un caso añejo (hace 12 días), para el filtro de antigüedad
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  await c.query("update piefirme.ctl_caso set abierto_en = now() - interval '12 days' where id = $1", [casos[2].id]);
  const lista = async (correo, f) => bien(correo, "ctl_casos_listar", [JSON.stringify({ sucursal: sede, ...f })]);

  let r = await lista("m@g.com", {});
  assert.equal(r.total, 3); assert.deepEqual(r.resumen, { abierta: 1, en_investigacion: 2 });
  assert.ok(r.casos[0].antiguedad_dias >= 12, "los más antiguos de lo abierto van primero");
  r = await lista("s@g.com", { asignado: "mio" });
  assert.equal(r.total, 1); assert.equal(r.casos[0].id, casos[0].id);
  r = await lista("m@g.com", { asignado: "mio" }); assert.equal(r.casos[0].id, casos[1].id);
  r = await lista("m@g.com", { asignado: "sin_asignar" }); assert.equal(r.total, 1); assert.equal(r.casos[0].id, casos[2].id);
  r = await lista("m@g.com", { estados: ["en_investigacion"] }); assert.equal(r.total, 2);
  r = await lista("m@g.com", { estado: "abierta" }); assert.equal(r.total, 1);
  r = await lista("m@g.com", { antiguedad_min: 10 }); assert.equal(r.total, 1); assert.equal(r.casos[0].id, casos[2].id);
  r = await lista("m@g.com", { antiguedad_max: 5 }); assert.equal(r.total, 2);
  r = await lista("m@g.com", { tipo: "diferencia_precio" }); assert.equal(r.total, 0);
  r = await lista("m@g.com", { tipo: "diferencia_inventario", buscar: casos[1].folio }); assert.equal(r.total, 1);
  r = await lista("m@g.com", { buscar: "Lista2" }); assert.equal(r.total, 1);
  r = await lista("m@g.com", { solo_abiertos: true }); assert.equal(r.total, 3);
  r = await lista("m@g.com", { sucursal: randomUUID() }); assert.equal(r.total, 0);
  r = await lista("m@g.com", { limite: 2, offset: 0 }); assert.equal(r.casos.length, 2); assert.equal(r.total, 3);
  assert.equal(r.casos[0].sucursal, "QCS Lista"); assert.ok(r.casos[0].producto);
  // el soporte consulta con bitácora
  await owner();
  const antes = (await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where reporte = 'soporte:casos_listar'")).n;
  const rs = await lista("a@g.com", {}); assert.equal(rs.total, 3);
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where reporte = 'soporte:casos_listar'")).n, antes + 1);
  // y no puede escribir
  assert.equal((await rpc("a@g.com", "ctl_caso_tomar", [casos[2].id, null, null])).code, "PF403");
});

// ═════════════════════════════ 9 · REPORTES DE SEGUIMIENTO (F4.5) ═════════════════════════════
test("reportes: abiertos por sucursal y antigüedad, causas, monto absorbido y recurrencia como indicador para investigar", async () => {
  const sede = await crearSede("Reporte");
  const ps = []; for (let i = 0; i < 3; i++) { const p = await crearProducto(`Rep${i}`, 100, { precio: 200 }); await existencia(sede, p.id, 5); ps.push(p); }
  const ini = await bien("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  for (const p of ps) await bien("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, p.codigo_barras, 4, null, null, null, null, null, null, null]);
  await bien("m@g.com", "ctl_sesion_cerrar", [ini.sesion_id]);
  const casos = await casosDe(ini.sesion_id);
  // uno cerrado con ajuste (empresa 100), uno cerrado sin ajuste (proveedor 100), uno abierto y añejo
  await investigado(casos[0], { causa: "Merma o producto dañado", monto: 100, responsable: "empresa" });
  await bien("m@g.com", "ctl_autorizar_ajuste", [casos[0].id, "123456"]);
  await bien("s@g.com", "ctl_caso_tomar", [casos[1].id, null, null]);
  await bien("m@g.com", "ctl_caso_cerrar_sin_ajuste", [casos[1].id, await causaId("Entrada de mercancía no registrada"), "Llegó la remisión del proveedor, la entrada estaba sin registrar.", "proveedor", 100]);
  await owner();
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  await c.query("update piefirme.ctl_caso set abierto_en = now() - interval '40 days' where id = $1", [casos[2].id]);
  // dos relevos con diferencia del mismo saliente (r@g.com) y uno de otra persona
  const relevo = async (saliente, entrega) => (await uno(`insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, valor, usuario_captura, contexto)
                                                          values ($1, $2, 'diferencia_relevo', 'partida_conteo', $3, $4, -1, -100, $5, $6) returning id, folio`,
                                                         [ORG, sede, randomUUID(), ps[0].id, ids["p@g.com"], JSON.stringify({ usuario_saliente: ids[saliente], entrega_id: entrega })]));
  const e1 = randomUUID(), e2 = randomUUID();
  await relevo("r@g.com", e1); await relevo("r@g.com", e2); await relevo("p@g.com", randomUUID());

  const rep = await bien("m@g.com", "ctl_casos_reportes", [fechaEn(-30), fechaEn(1), sede]);
  const ab = rep.abiertos_por_sucursal.find((x) => x.sucursal_id === sede);
  assert.equal(ab.abiertos, 4, "1 añejo + 3 de relevo abiertos"); assert.equal(ab.mas_de_30, 1); assert.ok(ab.mas_antiguo_dias >= 40);
  assert.equal(ab.sin_asignar, 4);
  const causas = rep.causas.filter((x) => x.sucursal_id === sede);
  assert.deepEqual(causas.map((x) => x.causa).sort(), ["Entrada de mercancía no registrada", "Merma o producto dañado"]);
  assert.ok(causas.every((x) => x.casos === 1));
  assert.equal(Number(rep.monto.empresa_total), 100, "solo lo que absorbe la empresa");
  const prov = rep.monto.por_responsable.find((x) => x.responsable === "proveedor"); assert.equal(Number(prov.monto), 100);
  const rp = rep.recurrencia.por_persona_saliente;
  assert.equal(rp.length, 1, "solo aparece quien repite (≥ 2 relevos con diferencia)");
  assert.equal(rp[0].usuario_id, ids["r@g.com"]); assert.equal(rp[0].relevos_con_diferencia, 2); assert.equal(rp[0].casos, 2);
  assert.ok(rp[0].lista.length === 2 && rp[0].lista[0].folio, "los casos de contexto van a la vista, para abrir su detalle");
  assert.ok("relevos_totales" in rp[0], "el denominador acompaña al indicador");
  assert.match(rep.recurrencia.nota, /no una conclusión/i);
  // periodo inválido y consulta registrada
  assert.equal((await rpc("m@g.com", "ctl_casos_reportes", [fechaEn(5), fechaEn(-5), null])).code, "PF422");
  await owner();
  assert.ok((await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where reporte = 'casos_reportes' and usuario_id = $1", [ids["m@g.com"]])).n >= 1, "cada consulta del reporte queda registrada");
  assert.equal((await rpc("r@g.com", "ctl_casos_reportes", [null, null, null])).code, "PF403");
});

// ═════════════════════════════ 10 · BARRIDO Y HTTP ═════════════════════════════
test("anon no ejecuta nada de casos; las RPC internas no son ejecutables por la app", async () => {
  await owner();
  const publicas = ["ctl_caso_asignar", "ctl_caso_tomar", "ctl_caso_comentar", "ctl_caso_adjuntar_evidencia", "ctl_caso_guardar_cierre", "ctl_caso_cerrar_sin_ajuste", "ctl_caso_rechazar",
                    "ctl_caso_volver_a_investigar", "ctl_autorizar_ajuste", "ctl_reintentar_ajuste", "ctl_casos_listar", "ctl_caso_detalle", "ctl_casos_reportes"];
  const anon = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = any($1) and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))`, [publicas]);
  assert.deepEqual(anon, [], "anon/public no ejecutan RPC de casos");
  const autenticadas = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = any($1) and has_function_privilege('authenticated', p.oid, 'execute')`, [publicas]);
  assert.equal(autenticadas.length, publicas.length, "las 13 RPC están disponibles para la app");
  const internas = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme_app' and p.proname = any($1) and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`,
                               [["ctl_autorizar_interno", "ctl_caso_bit", "ctl_caso_cargar", "ctl_caso_par", "ctl_caso_exigir_principal", "ctl_caso_validar_causa", "ctl_caso_capturista", "ctl_caso_tope_monto", "ctl_nombre_usuario"]]);
  assert.deepEqual(internas, [], `internas ejecutables: ${internas.map((f) => f.proname)}`);
});

test("HTTP real: PostgREST con el token de cada cuenta (sucursal rechazada, dueño y supervisor leen, anon fuera)", async (t) => {
  const ESQ = "piefirme";
  const tokens = {};
  for (const correo of ["r@g.com", "p@g.com", "m@g.com", "s@g.com", "a@g.com"]) {
    const j = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: correo, password: "123456" }) }).then((x) => x.json());
    assert.ok(j.access_token, `login ${correo}`);
    tokens[correo] = j.access_token;
  }
  const http = async (tok, ruta, cuerpo) => {
    const r = await fetch(`${cfg.url}/rest/v1/rpc/${ruta}`, { method: "POST", headers: { apikey: cfg.anon, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", "Content-Profile": ESQ, "Accept-Profile": ESQ }, body: JSON.stringify(cuerpo) });
    const txt = await r.text(); let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    return { status: r.status, data };
  };
  await sub(t, "r@g.com y p@g.com reciben 403 en listar, detalle, reportes, tomar y autorizar", async () => {
    for (const correo of ["r@g.com", "p@g.com"]) {
      for (const [ruta, cuerpo] of [["ctl_casos_listar", { p_filtros: {} }], ["ctl_caso_detalle", { p_caso: randomUUID() }], ["ctl_casos_reportes", {}], ["ctl_caso_tomar", { p_caso: randomUUID() }],
                                    ["ctl_autorizar_ajuste", { p_caso: randomUUID(), p_password: "123456" }], ["ctl_reintentar_ajuste", { p_caso: randomUUID(), p_password: "123456" }]]) {
        const r = await http(tokens[correo], ruta, cuerpo);
        assert.ok(r.status >= 400, `${correo} ${ruta} → ${r.status}`);
        assert.match(JSON.stringify(r.data), /PF403|permiso|no tiene/i, `${ruta}: ${JSON.stringify(r.data)}`);
        assert.deepEqual(llavesCiegas(r.data), []);
      }
    }
  });
  await sub(t, "m@g.com y s@g.com listan; a@g.com (soporte) lista pero no investiga; s@g.com no autoriza", async () => {
    for (const correo of ["m@g.com", "s@g.com", "a@g.com"]) {
      const r = await http(tokens[correo], "ctl_casos_listar", { p_filtros: { limite: 5 } });
      assert.equal(r.status, 200, `${correo} listar: ${JSON.stringify(r.data)}`);
      assert.ok(Array.isArray(r.data.casos));
    }
    assert.ok((await http(tokens["a@g.com"], "ctl_caso_tomar", { p_caso: randomUUID() })).status >= 400);
    assert.match(JSON.stringify((await http(tokens["s@g.com"], "ctl_autorizar_ajuste", { p_caso: randomUUID(), p_password: "123456" })).data), /PF403|permiso/i);
  });
  await sub(t, "anon no ejecuta nada de casos", async () => {
    for (const ruta of ["ctl_casos_listar", "ctl_caso_detalle", "ctl_caso_tomar", "ctl_autorizar_ajuste", "ctl_reintentar_ajuste", "ctl_casos_reportes", "ctl_caso_comentar"]) {
      const r = await http(cfg.anon, ruta, {});
      assert.ok([401, 403, 404].includes(r.status), `anon ${ruta} → ${r.status} ${JSON.stringify(r.data)}`);
    }
  });
  await sub(t, "PATCH/DELETE directos a ctl_caso y su bitácora: permiso denegado", async () => {
    for (const correo of ["m@g.com", "s@g.com"]) {
      for (const tabla of ["ctl_caso", "ctl_caso_bitacora"]) {
        for (const metodo of ["PATCH", "DELETE", "POST"]) {
          const r = await fetch(`${cfg.url}/rest/v1/${tabla}?id=eq.${randomUUID()}`, { method: metodo, headers: { apikey: cfg.anon, Authorization: `Bearer ${tokens[correo]}`, "Content-Type": "application/json", "Content-Profile": ESQ, "Accept-Profile": ESQ }, body: metodo === "DELETE" ? undefined : JSON.stringify(tabla === "ctl_caso" ? { estado: "rechazada" } : { texto: "editado" }) });
          assert.ok([401, 403, 404, 405].includes(r.status), `${correo} ${metodo} ${tabla} → ${r.status}`);
        }
      }
    }
  });
});
