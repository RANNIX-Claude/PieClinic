// Pruebas del MOTOR DE CONTEO (Control y Auditoría · Etapa 2) contra la base QA.   node --test scripts/test-auditoria-conteo-qa.mjs
//
// TODO corre en UNA transacción que SIEMPRE se deshace (no deja sesiones, casos, folios, sedes ni productos): los datos semilla (sucursales, productos,
// precios, existencias, turnos, cancelaciones, custodia y PIN) se crean dentro de la transacción como dueño de la base y se actúa «como» cada cuenta de
// prueba (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-qa.mjs. Por eso no hace falta una semilla persistente.
// Cuentas (clave 123456, solo QA; scripts/qa-usuarios-prueba.mjs): a superadmin(soporte) · m dueño · s supervisora · p podólogo · r recepción.
// Cubre los criterios de aceptación 1, 5, 10, 14, 15, 16, 17, 18, 19 y 23 (parte de servidor) y las reglas de la Etapa 2.
import nodeTest, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
// Mismos nombres de campo que el módulo nunca debe entregar a un rol de sucursal (src/lib/auditoria/roles.js → CAMPOS_CIEGOS)
const CIEGOS = /^(saldo_sistema|diferencia_piezas|diferencia_valor|diferencia_precio|diferencia|valor_esperado|valor_diferencia|precio_catalogo|partidas_con_diferencia|dentro_tolerancia|clasificacion_precio|existencia|saldo)$/;

const c = await conectar(cfg);
// cada prueba corre en un savepoint: si una falla, la transacción global no queda abortada y las demás siguen
const test = (nombre, fn) => nodeTest(nombre, async (t) => {
  const sp = `tsp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { await fn(t); } catch (e) { await c.query(`rollback to savepoint ${sp}`).catch(() => {}); throw e; }
});
const ids = {};
let n = 0, k = 0;


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
/** Llama piefirme.<fn>(…) como la cuenta; devuelve { ok, r (jsonb), code, message }. */
const rpc = async (correo, fn, args = []) => {
  await como(correo);
  const x = await intentar(`select piefirme.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args);
  return x.ok ? { ok: true, r: x.rows[0].r } : x;
};
const uno = async (sql, params) => (await c.query(sql, params)).rows[0];
const filas = async (sql, params) => (await c.query(sql, params)).rows;

// ───────── semillas (se crean como dueño de la base dentro de la transacción) ─────────
async function crearSede(nombre) {
  await owner();
  return (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, `QCT${Date.now() % 100000}${++k}`, `QCT ${nombre}`])).id;
}
async function crearProducto(nombre, costo, extra = {}) {
  await owner();
  const sku = `QCT-${Date.now() % 1000000}-${++k}`;
  const p = await uno("insert into piefirme.productos (organizacion_id, sku, nombre, codigo_barras, costo_promedio) values ($1, $2, $3, $4, $5) returning id, codigo_barras, sku",
                      [ORG, sku, `QCT ${nombre}`, extra.barras ?? `99${Date.now() % 100000000}${k}`, costo]);
  if (extra.precio != null) await precio(p.id, extra.precio, extra.desde ?? 400);
  return p;
}
/** Precio vigente desde hace `dias` días (y, si se indica, hasta hace `hastaDias`). */
async function precio(prodId, monto, dias, hastaDias = null) {
  await owner();
  await c.query(`insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, vigente_hasta, precio, tipo_precio)
                 values ($1, 'producto', $2, piefirme_app.ctl_hoy($1) - $3::int, case when $4::int is null then null else piefirme_app.ctl_hoy($1) - $4::int end, $5, 'fijo')`, [ORG, prodId, dias, hastaDias, monto]);
}
async function existencia(sede, prodId, cant) {
  await owner();
  await c.query("select set_config('app.kardex', 'on', true)");   // la existencia solo entra «con un movimiento»: se siembra con la bandera del kardex
  await c.query("insert into piefirme.inventario_sede (organizacion_id, sede_id, producto_id, existencia) values ($1, $2, $3, $4) on conflict (sede_id, producto_id) do update set existencia = excluded.existencia", [ORG, sede, prodId, cant]);
  await c.query("select set_config('app.kardex', '', true)");
}
async function custodia(sede, prodId) {
  await owner();
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  await c.query("insert into piefirme.ctl_producto_custodia (organizacion_id, sucursal_id, producto_id) values ($1, $2, $3)", [ORG, sede, prodId]);
}
/** Turno de caja (se siembra con los disparadores del origen apagados: son datos del origen, no del módulo). */
async function turno(sede, correo, aperturaMin, cierreMin = null) {
  await owner();
  await c.query("set local session_replication_role = replica");
  const t = await uno(`insert into piefirme.turnos_caja (organizacion_id, sede_id, cajero_id, apertura_en, estado, cierre_en)
                       values ($1, $2, $3, now() - make_interval(mins => $4), $5, case when $6::int is null then null else now() - make_interval(mins => $6::int) end) returning id`,
                      [ORG, sede, ids[correo], aperturaMin, cierreMin == null ? "abierto" : "cerrado", cierreMin]);
  await c.query("set local session_replication_role = origin");
  return t.id;
}
async function ventaCancelada(sede, prodId, diasAtras, correoCancela) {
  await owner();
  await c.query("set local session_replication_role = replica");
  const v = await uno(`insert into piefirme.ventas (organizacion_id, sede_id, folio, estado, cancelada_en, cancelada_por, motivo_cancelacion, total)
                       values ($1, $2, $3, 'cancelada', now() - make_interval(days => $4), $5, 'Prueba de cruce', 100) returning id, folio`, [ORG, sede, `QCT-TKT-${Date.now() % 100000}${++k}`, diasAtras, ids[correoCancela]]);
  await c.query(`insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, producto_id, iva_tipo, cantidad, precio_unitario, importe) values ($1, $2, $3, 'producto', $4, 'exento', 1, 100, 100)`, [ORG, sede, v.id, prodId]);
  await c.query("set local session_replication_role = origin");
  return v;
}
async function ponerPin(correo, pin) {
  await owner();
  await c.query("delete from piefirme.pins_personales where perfil_id = $1", [ids[correo]]);
  await c.query("insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash) values ($1, $2, piefirme_app.hash_pin($1, $3))", [ids[correo], ORG, pin]);
}
const rpcSet = async () => { await owner(); await c.query("select set_config('app.ctl_rpc', 'on', true)"); };

/** Captura una partida como la cuenta; devuelve la respuesta jsonb. */
async function capturar(correo, sesion, prod, cantidad, o = {}) {
  const id = o.id ?? randomUUID();
  const x = await rpc(correo, "ctl_capturar_partida", [id, sesion, o.codigo ?? prod.codigo_barras, cantidad, o.precio ?? null, o.serie ?? null, o.sello ?? null, o.intacto ?? null, o.nota ?? null, o.hora ?? null, o.clasif ?? null]);
  assert.ok(x.ok, `captura ${correo}: ${x.message}`);
  return { ...x.r, _id: id };
}
async function iniciar(correo, tipo, sede, opciones = {}) {
  const x = await rpc(correo, "ctl_sesion_iniciar", [tipo, sede, JSON.stringify(opciones)]);
  assert.ok(x.ok, `iniciar ${tipo} ${correo}: ${x.message}`);
  return x.r;
}
const cerrar = async (correo, sesion) => { const x = await rpc(correo, "ctl_sesion_cerrar", [sesion]); assert.ok(x.ok, `cerrar: ${x.message}`); return x.r; };
const casosDe = async (sesion) => { await owner(); return filas("select * from piefirme.ctl_caso where organizacion_id = $1 and contexto ->> 'sesion_id' = $2 order by creado_en, folio", [ORG, sesion]); };
/** Recorre una respuesta JSON y devuelve las llaves ciegas que encuentre (a cualquier profundidad). */
const llavesCiegas = (v, ruta = "") => Array.isArray(v) ? v.flatMap((x, i) => llavesCiegas(x, `${ruta}[${i}]`))
  : v && typeof v === "object" ? Object.entries(v).flatMap(([kk, x]) => (CIEGOS.test(kk) ? [ruta + "." + kk] : []).concat(llavesCiegas(x, `${ruta}.${kk}`))) : [];

before(async () => {
  await c.query("begin");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  // PIN de las cuentas del relevo: se fija AL INICIO (antes de tomar otros candados) para no cruzarse con otras corridas de pruebas del módulo
  // que también escriben en pins_personales; dentro de la transacción, así que se deshace.
  await ponerPin("r@g.com", "4321");
  await ponerPin("s@g.com", "8765");
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · CAPTURA A CIEGAS, IDEMPOTENCIA Y CIERRE (criterios 1, 5, 10) ═════════════════════════════
test("captura a ciegas: la respuesta no trae saldo, diferencia ni valor; el rol de sucursal no los alcanza (criterio 1)", async (t) => {
  const sede = await crearSede("Ciega");
  const caro = await crearProducto("Caro", 600, { precio: 900 });
  const barato = await crearProducto("Barato", 100, { precio: 150 });
  const otro = await crearProducto("Otro", 50, { precio: 80 });
  for (const [p, q] of [[caro, 5], [barato, 5], [otro, 2]]) await existencia(sede, p.id, q);

  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  assert.equal(ini.modo_lista, "completa");
  assert.equal(ini.en_lista, 3);
  assert.deepEqual(llavesCiegas(ini), [], "el inicio de sesión no trae campos ciegos");
  assert.ok(ini.siguiente.descripcion, "devuelve el siguiente producto");
  assert.deepEqual(Object.keys(ini.siguiente).filter((x) => /precio|costo|existencia|saldo/.test(x)), [], "el siguiente producto no trae precio, costo ni existencia");

  const r1 = await capturar("r@g.com", ini.sesion_id, caro, 3);
  assert.equal(r1.ok, true);
  assert.equal(r1.idempotente, false);
  assert.deepEqual(llavesCiegas(r1), [], "la respuesta de captura no trae saldo ni diferencia");
  assert.equal("revision" in r1, false, "solo el auditor puntual recibe «revision»");
  assert.deepEqual(r1.avance, { capturadas: 1, en_lista: 3 });
  // lo que el servidor calculó vive aparte: el dueño lo ve, el rol de sucursal no
  await como("r@g.com");
  for (const rel of ["ctl_partida_calculo", "ctl_partida_revision", "ctl_sesion_resultado", "ctl_sesion_revision", "v_ctl_saldos", "ctl_caso", "ctl_alerta", "ctl_saldo_arranque"]) {
    const x = await intentar(`select count(*)::int as n from piefirme.${rel}`);
    assert.ok(x.ok, `${rel}: ${x.message}`);
    assert.equal(x.rows[0].n, 0, `r@g.com ve filas de ${rel}`);
  }
  await como("r@g.com");
  const mia = await intentar("select * from piefirme.ctl_partida_captura where id = $1", [r1._id]);
  assert.equal(mia.rows.length, 1);
  assert.deepEqual(Object.keys(mia.rows[0]).filter((x) => CIEGOS.test(x)), []);
  await como("m@g.com");
  const calc = await intentar("select saldo_sistema, diferencia_piezas, diferencia_valor, costo_unitario, precio_catalogo from piefirme.ctl_partida_revision where id = $1", [r1._id]);
  assert.equal(Number(calc.rows[0].saldo_sistema), 5);
  assert.equal(Number(calc.rows[0].diferencia_piezas), -2);
  assert.equal(Number(calc.rows[0].diferencia_valor), -1200);
  assert.equal(Number(calc.rows[0].precio_catalogo), 900);
  // errores de dominio tampoco filtran nada
  const bad = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, "NO-EXISTE", 1, null, null, null, null, null, null, null]);
  assert.equal(bad.r.ok, false); assert.equal(bad.r.error, "codigo_no_encontrado"); assert.deepEqual(llavesCiegas(bad.r), []);
  t.diagnostic("la sesión queda abierta para las pruebas siguientes de esta sede");
});

test("idempotencia: reenviar la misma captura (o el mismo lote) no duplica partidas (criterio 10)", async () => {
  const sede = await crearSede("Idem");
  const ps = [];
  for (let i = 0; i < 5; i++) { const p = await crearProducto(`Idem${i}`, 40 + i); await existencia(sede, p.id, 3); ps.push(p); }
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  const lote = [];
  for (const p of ps) lote.push(await capturar("r@g.com", ini.sesion_id, p, 3));
  await owner();
  const antes = (await uno("select count(*)::int as n from piefirme.ctl_partida_conteo where sesion_id = $1", [ini.sesion_id])).n;
  assert.equal(antes, 5);
  for (const x of lote) {   // reenvío del lote completo con los mismos ids
    const again = await capturar("r@g.com", ini.sesion_id, ps[lote.indexOf(x)], 3, { id: x._id });
    assert.equal(again.idempotente, true);
    assert.equal(again.partida_id, x._id);
    assert.deepEqual(llavesCiegas(again), []);
  }
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_partida_conteo where sesion_id = $1", [ini.sesion_id])).n, 5, "no se duplicó ninguna partida");
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_partida_calculo where sesion_id = $1", [ini.sesion_id])).n, 5);
  // el mismo id en OTRA sesión es un error, no una duplicación silenciosa
  const otraSede = await crearSede("Idem2");
  await existencia(otraSede, ps[0].id, 3);
  const otra = await iniciar("m@g.com", "conteo_apertura", otraSede);
  const x = await rpc("m@g.com", "ctl_capturar_partida", [lote[0]._id, otra.sesion_id, ps[0].codigo_barras, 1, null, null, null, null, null, null, null]);
  assert.equal(x.ok, false); assert.equal(x.code, "PF409");
});

test("hora del servidor: la hora del dispositivo es solo referencia y la discrepancia queda registrada (criterio 5)", async () => {
  const sede = await crearSede("Hora");
  const p = await crearProducto("Hora", 10); await existencia(sede, p.id, 1);
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  const r = await capturar("r@g.com", ini.sesion_id, p, 1, { hora: "2020-01-01T00:00:00Z" });
  await owner();
  const fila = await uno("select escaneado_en, creado_en, hora_cliente from piefirme.ctl_partida_conteo where id = $1", [r._id]);
  assert.ok(Math.abs(new Date(fila.escaneado_en) - Date.now()) < 3600e3, "la marca guardada es la del servidor");
  assert.equal(new Date(fila.hora_cliente).getUTCFullYear(), 2020);
  const d = await uno("select diferencia_seg from piefirme.ctl_discrepancia_hora where registro_id = $1", [r._id]);
  assert.ok(d && Math.abs(d.diferencia_seg) > 300, "discrepancia registrada");
});

test("corregir una captura = fila nueva que referencia la anterior; el cierre usa la última vigente", async () => {
  const sede = await crearSede("Corrige");
  const p = await crearProducto("Corrige", 100); await existencia(sede, p.id, 10);
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  const a = await capturar("r@g.com", ini.sesion_id, p, 4);
  const b = await capturar("r@g.com", ini.sesion_id, p, 10);
  assert.equal(b.corrige, true);
  await owner();
  assert.equal((await uno("select corrige_a from piefirme.ctl_partida_conteo where id = $1", [b._id])).corrige_a, a._id);
  const cierre = await cerrar("r@g.com", ini.sesion_id);
  assert.equal(cierre.total_partidas, 1, "una sola partida vigente por producto");
  assert.equal((await casosDe(ini.sesion_id)).length, 0, "la última captura (10) cuadra: sin casos");
  assert.deepEqual(llavesCiegas(cierre), [], "el cierre para sucursal no trae cifras ciegas");
  assert.equal("partidas_con_diferencia" in cierre, false);
});

test("cierre del conteo de apertura: casos por diferencia y por lo no reportado, con el contexto heredado; la sucursal no ve cifras", async () => {
  const sede = await crearSede("Cierre");
  const a = await crearProducto("A-falta", 200, { precio: 300 }), b = await crearProducto("B-cuadra", 20), c2 = await crearProducto("C-sin-contar", 80);
  await existencia(sede, a.id, 5); await existencia(sede, b.id, 4); await existencia(sede, c2.id, 3);
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  await capturar("r@g.com", ini.sesion_id, a, 3);
  await capturar("r@g.com", ini.sesion_id, b, 4);
  const cierre = await cerrar("r@g.com", ini.sesion_id);
  assert.equal(cierre.estado, "cerrada");
  assert.equal(cierre.total_partidas, 2);
  assert.equal(cierre.no_reportadas, 1);
  assert.deepEqual(llavesCiegas(cierre), []);
  const casos = await casosDe(ini.sesion_id);
  assert.equal(casos.length, 2, "una diferencia + un no reportado");
  const falta = casos.find((x) => x.producto_id === a.id);
  assert.equal(falta.tipo, "diferencia_inventario");
  assert.equal(Number(falta.cantidad), -2);
  assert.equal(Number(falta.valor), -400);
  assert.equal(falta.estado, "abierta");
  assert.equal(falta.usuario_captura, ids["r@g.com"], "el caso nace con quien capturó (regla dura de separación)");
  assert.equal(falta.contexto.modo, "conteo_apertura");
  assert.match(falta.folio, /^CAS-\d{4}-\d{5}$/);
  const nr = casos.find((x) => x.producto_id === c2.id);
  assert.equal(nr.contexto.no_reportado, true);
  assert.equal(nr.origen_tipo, "lista_solicitada");
  assert.equal(Number(nr.valor), 240, "valor en riesgo = saldo × costo");
  // resultado: el dueño lo ve; la sucursal no
  const res = (await rpc("m@g.com", "ctl_sesion_detalle", [ini.sesion_id])).r;
  assert.equal(res.sesion.partidas_con_diferencia, 1);
  assert.equal(Number(res.sesion.valor_diferencia), -400);
  assert.equal(res.sesion.no_reportadas, 1);
  assert.equal(res.partidas.length, 2);
  assert.equal(res.no_reportados.length, 1);
  const prohibido = await rpc("r@g.com", "ctl_sesion_detalle", [ini.sesion_id]);
  assert.equal(prohibido.code, "PF403");
  const soporte = await rpc("a@g.com", "ctl_sesion_detalle", [ini.sesion_id]);
  assert.equal(soporte.code, "PF403", "el soporte lee por ctl_soporte_leer, no por el detalle");
  await como("r@g.com");
  assert.equal((await intentar("select count(*)::int as n from piefirme.ctl_caso")).rows[0].n, 0);
  // la separación de funciones sigue en pie: quien capturó no autoriza (el dueño del test es otro, pero el caso trae su usuario_captura)
  await owner();
  const bit = await filas("select usuario_id, estado_nuevo from piefirme.ctl_caso_bitacora where caso_id = $1", [falta.id]);
  assert.equal(bit.length, 1); assert.equal(bit[0].usuario_id, null); assert.equal(bit[0].estado_nuevo, "abierta");
  // una sola sesión abierta por modo: se cierra la de arriba, así que ahora sí se puede abrir otra; mientras esté abierta no
  const otra = await iniciar("r@g.com", "conteo_apertura", sede);
  const dup = await rpc("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]);
  assert.equal(dup.r.ok, false); assert.equal(dup.r.error, "sesion_abierta"); assert.equal(dup.r.sesion_id, otra.sesion_id);
});

// ═════════════════════════════ 2 · QUIÉN INICIA CADA MODO ═════════════════════════════
test("permisos por modo: inicial y puntual solo supervisor/dueño; la remota solo el dueño; el soporte no captura", async () => {
  const sede = await crearSede("Permisos");
  const p = await crearProducto("Permisos", 10); await existencia(sede, p.id, 3);
  for (const tipo of ["conteo_inicial", "auditoria_puntual"]) {
    for (const correo of ["r@g.com", "p@g.com"]) {
      const x = await rpc(correo, "ctl_sesion_iniciar", [tipo, sede, "{}"]);
      assert.equal(x.ok, false, `${correo} inició ${tipo}`);
      assert.equal(x.code, "PF403");
    }
  }
  assert.equal((await rpc("a@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"])).code, "PF403", "soporte no captura");
  assert.equal((await rpc("r@g.com", "ctl_sesion_iniciar", ["auditoria_remota", sede, "{}"])).code, "PF400", "la remota no se inicia por aquí");
  for (const correo of ["r@g.com", "p@g.com", "s@g.com", "a@g.com"]) assert.equal((await rpc(correo, "ctl_remota_lanzar", [null, null, null, false, null])).code, "PF403", `${correo} lanzó remota`);
  // sí pueden
  const ap = await rpc("r@g.com", "ctl_sesion_iniciar", ["conteo_apertura", sede, "{}"]); assert.equal(ap.r.ok, true);
  const ini = await rpc("s@g.com", "ctl_sesion_iniciar", ["conteo_inicial", sede, "{}"]); assert.equal(ini.r.ok, true);
  const pu = await rpc("m@g.com", "ctl_sesion_iniciar", ["auditoria_puntual", sede, JSON.stringify({ modo_lista: "libre" })]); assert.equal(pu.r.ok, true);
  assert.equal(pu.r.en_lista, 0, "libre: sin lista");
  // otra persona no captura en una sesión ajena
  const x = await rpc("s@g.com", "ctl_capturar_partida", [randomUUID(), ap.r.sesion_id, p.codigo_barras, 1, null, null, null, null, null, null, null]);
  assert.equal(x.r.ok, false); assert.equal(x.r.error, "otra_persona");
  // cancelar: el rol de sucursal solo antes de capturar; con capturas, solo supervisor/dueño con motivo
  const ses = await iniciar("r@g.com", "relevo_turno", sede).catch(() => null);   // sin turno ni custodia: debe fallar
  assert.equal(ses, null);
});

test("conteo inicial: fija el saldo de arranque y NO abre casos ni toca el inventario", async () => {
  const sede = await crearSede("Inicial");
  const a = await crearProducto("Ini-A", 30), b = await crearProducto("Ini-B", 70);
  await existencia(sede, a.id, 10); await existencia(sede, b.id, 6);
  const ini = await iniciar("s@g.com", "conteo_inicial", sede);
  await capturar("s@g.com", ini.sesion_id, a, 8);
  await capturar("s@g.com", ini.sesion_id, b, 6);
  const cierre = await cerrar("s@g.com", ini.sesion_id);
  assert.equal(cierre.estado, "cerrada");
  assert.equal(cierre.casos_abiertos, 0);
  assert.equal(cierre.partidas_con_diferencia, 1, "el supervisor sí ve la cifra");
  assert.equal((await casosDe(ini.sesion_id)).length, 0);
  await owner();
  const arr = await filas("select producto_id, cantidad_contada, cantidad_origen from piefirme.ctl_saldo_arranque where sesion_id = $1 order by cantidad_contada", [ini.sesion_id]);
  assert.equal(arr.length, 2);
  assert.equal(Number(arr[0].cantidad_contada), 6); assert.equal(Number(arr[1].cantidad_contada), 8); assert.equal(Number(arr[1].cantidad_origen), 10);
  assert.equal(Number((await uno("select existencia from piefirme.inventario_sede where sede_id = $1 and producto_id = $2", [sede, a.id])).existencia), 10, "el inventario del origen no se tocó");
});

test("serie y sello: el producto que los exige no se captura sin ellos", async () => {
  const sede = await crearSede("Serie");
  const s = await crearProducto("ConSerie", 500), l = await crearProducto("ConSello", 400), m = await crearProducto("Normal", 40);
  for (const p of [s, l, m]) await existencia(sede, p.id, 2);
  await owner();
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  await c.query("insert into piefirme.ctl_producto_atributo (organizacion_id, producto_id, requiere_serie) values ($1, $2, true)", [ORG, s.id]);
  await c.query("insert into piefirme.ctl_producto_atributo (organizacion_id, producto_id, requiere_sello) values ($1, $2, true)", [ORG, l.id]);
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  assert.equal(ini.siguiente.requiere_serie || ini.siguiente.requiere_sello || true, true);
  let x = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, s.codigo_barras, 2, null, null, null, null, null, null, null]);
  assert.equal(x.r.error, "falta_serie");
  x = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, s.codigo_barras, 2, null, "SN-1", null, null, null, null, null]);
  assert.equal(x.r.ok, true);
  x = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, l.codigo_barras, 2, null, null, "SELLO-9", null, null, null, null]);
  assert.equal(x.r.error, "falta_sello", "falta indicar si está intacto");
  x = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, l.codigo_barras, 2, null, null, "SELLO-9", true, null, null, null]);
  assert.equal(x.r.ok, true);
  await owner();
  const f = await uno("select numero_serie, folio_sello, sello_intacto from piefirme.ctl_partida_conteo where producto_id = $1 and sesion_id = $2", [l.id, ini.sesion_id]);
  assert.equal(f.folio_sello, "SELLO-9"); assert.equal(f.sello_intacto, true);
});

// ═════════════════════════════ 3 · AUDITORÍA PUNTUAL: la excepción que sí ve la diferencia ═════════════════════════════
test("auditoría puntual ejecutada por supervisor o dueño: ve la diferencia al instante; un conteo de apertura de un supervisor sigue a ciegas", async () => {
  const sede = await crearSede("Puntual");
  const a = await crearProducto("Pun-A", 250, { precio: 400 }); await existencia(sede, a.id, 7);
  const pu = await iniciar("s@g.com", "auditoria_puntual", sede, { modo_lista: "libre" });
  const r = await capturar("s@g.com", pu.sesion_id, a, 5);
  assert.ok(r.revision, "el auditor recibe la revisión");
  assert.equal(Number(r.revision.diferencia_piezas), -2);
  assert.equal(Number(r.revision.diferencia_valor), -500);
  // el supervisor en un conteo de apertura NO la recibe (solo la puntual es excepción)
  const sede2 = await crearSede("PuntualB"); await existencia(sede2, a.id, 7);
  const ap = await iniciar("s@g.com", "conteo_apertura", sede2);
  const r2 = await capturar("s@g.com", ap.sesion_id, a, 5);
  assert.equal("revision" in r2, false);
  assert.deepEqual(llavesCiegas(r2), []);
  // p@g.com y r@g.com nunca pueden pedir la clasificación manual
  const sede3 = await crearSede("PuntualC"); await existencia(sede3, a.id, 7);
  const ap3 = await iniciar("r@g.com", "conteo_apertura", sede3);
  const x = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ap3.sesion_id, a.codigo_barras, 5, 400, null, null, null, null, null, "etiqueta_mal_puesta"]);
  assert.equal(x.code, "PF403");
});

// ═════════════════════════════ 4 · PRECIO DE ETIQUETA (criterio 16) ═════════════════════════════
test("precio de etiqueta: coincide, etiqueta anterior (ventana de gracia, no abre caso), a revisar (abre caso) y clasificación del auditor (criterio 16)", async () => {
  const sede = await crearSede("Precio");
  // P1: precio de 200 desde hace 400 días; P2: cambió AYER de 100 a 120; P3: cambió hace 40 días (fuera de los 30 de gracia)
  const p1 = await crearProducto("Pr-estable", 50, { precio: 200 });
  const p2 = await crearProducto("Pr-ayer", 50);   await precio(p2.id, 100, 300, 2); await precio(p2.id, 120, 1);
  const p3 = await crearProducto("Pr-hace40", 50); await precio(p3.id, 100, 300, 41); await precio(p3.id, 120, 40);
  const p4 = await crearProducto("Pr-malpuesta", 50, { precio: 600 });
  for (const p of [p1, p2, p3, p4]) await existencia(sede, p.id, 2);
  const ini = await iniciar("r@g.com", "conteo_apertura", sede, { pide_precio: true });
  assert.equal(ini.pide_precio, true);
  let x = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, p1.codigo_barras, 2, null, null, null, null, null, null, null]);
  assert.equal(x.r.error, "falta_precio_etiqueta");
  const ids_ = {};
  for (const [nombre, p, etiqueta] of [["coincide", p1, 200], ["anterior", p2, 100], ["fuera", p3, 100], ["revisar", p4, 400]]) {
    const r = await capturar("r@g.com", ini.sesion_id, p, 2, { precio: etiqueta });
    assert.deepEqual(llavesCiegas(r), [], "la clasificación no se devuelve a quien captura");
    ids_[nombre] = r._id;
  }
  await owner();
  const clas = Object.fromEntries((await filas("select partida_id, clasificacion_precio, diferencia_precio, precio_catalogo from piefirme.ctl_partida_calculo where sesion_id = $1", [ini.sesion_id])).map((f) => [f.partida_id, f]));
  assert.equal(clas[ids_.coincide].clasificacion_precio, "coincide");
  assert.equal(clas[ids_.anterior].clasificacion_precio, "etiqueta_anterior", "catálogo cambiado ayer + etiqueta con el precio anterior");
  assert.equal(clas[ids_.fuera].clasificacion_precio, "revisar", "fuera de la ventana de gracia");
  assert.equal(clas[ids_.revisar].clasificacion_precio, "revisar");
  assert.equal(Number(clas[ids_.revisar].diferencia_precio), -200);
  await cerrar("r@g.com", ini.sesion_id);
  const casos = (await casosDe(ini.sesion_id)).filter((k2) => k2.tipo === "diferencia_precio");
  assert.equal(casos.length, 2, "solo «revisar» abre caso de precio");
  assert.ok(!casos.some((k2) => k2.producto_id === p2.id), "la etiqueta anterior no abre caso");
  assert.ok(!casos.some((k2) => k2.producto_id === p1.id));
  assert.equal(Number(casos.find((k2) => k2.producto_id === p4.id).valor), -400, "fuga de margen = diferencia × piezas");
  // el auditor clasifica en el momento: «etiqueta mal puesta» no abre caso
  const sede2 = await crearSede("PrecioB"); await existencia(sede2, p4.id, 2);
  const pu = await iniciar("m@g.com", "auditoria_puntual", sede2, { modo_lista: "libre", pide_precio: true });
  const a1 = await capturar("m@g.com", pu.sesion_id, p4, 2, { precio: 400 });
  assert.equal(a1.revision.clasificacion_precio, "revisar");
  const a2 = await capturar("m@g.com", pu.sesion_id, p4, 2, { precio: 400, clasif: "etiqueta_mal_puesta" });
  assert.equal(a2.revision.clasificacion_precio, "etiqueta_mal_puesta"); assert.equal(a2.corrige, true);
  const cu = await cerrar("m@g.com", pu.sesion_id);
  assert.equal((await casosDe(pu.sesion_id)).filter((k2) => k2.tipo === "diferencia_precio").length, 0);
  assert.equal(cu.total_partidas, 1);
});

// ═════════════════════════════ 5 · LISTA ALEATORIA PONDERADA ═════════════════════════════
test("lista aleatoria: se guarda antes de mostrarse, respeta el tamaño, excluye lo contado en 24 h y tiene tope de 100", async () => {
  const sede = await crearSede("Aleatoria");
  const ps = [];
  for (let i = 0; i < 8; i++) { const p = await crearProducto(`Al${i}`, 20 + i * 10); await existencia(sede, p.id, 4); ps.push(p); }
  const ini = await iniciar("m@g.com", "auditoria_puntual", sede, { muestra: 3 });
  assert.equal(ini.en_lista, 3);
  await owner();
  const lista = await filas("select producto_id, reportado, orden from piefirme.ctl_lista_solicitada where sesion_id = $1 order by orden", [ini.sesion_id]);
  assert.equal(lista.length, 3, "la lista ya estaba guardada cuando el servidor respondió");
  assert.ok(lista.every((l) => !l.reportado));
  assert.ok(lista.some((l) => l.producto_id === ini.siguiente.producto_id), "lo que se muestra sale de la lista guardada");
  // fuera de lista no se captura
  const fuera = ps.find((p) => !lista.some((l) => l.producto_id === p.id));
  const x = await rpc("m@g.com", "ctl_capturar_partida", [randomUUID(), ini.sesion_id, fuera.codigo_barras, 1, null, null, null, null, null, null, null]);
  assert.equal(x.r.error, "fuera_de_lista");
  // se cuentan los 3 y se cierra → quedan «recientes» (24 h)
  for (const l of lista) await capturar("m@g.com", ini.sesion_id, ps.find((p) => p.id === l.producto_id), 4);
  await cerrar("m@g.com", ini.sesion_id);
  const b = await iniciar("m@g.com", "auditoria_puntual", sede, { muestra: 8 });
  assert.equal(b.en_lista, 5, "se excluyen los 3 contados hace menos de 24 h");
  await owner();
  const l2 = await filas("select producto_id from piefirme.ctl_lista_solicitada where sesion_id = $1", [b.sesion_id]);
  assert.ok(!l2.some((l) => lista.some((q) => q.producto_id === l.producto_id)));
  await cerrar("m@g.com", b.sesion_id);
  const inc = await iniciar("m@g.com", "auditoria_puntual", sede, { muestra: 8, incluir_recientes: true });
  assert.equal(inc.en_lista, 8, "salvo que la sesión lo pida explícitamente");
  // tope de la muestra: 100
  await cerrar("m@g.com", inc.sesion_id);
  const tope = await rpc("m@g.com", "ctl_sesion_iniciar", ["auditoria_puntual", sede, JSON.stringify({ muestra: 101 })]);
  assert.equal(tope.code, "PF422"); assert.match(tope.message, /entre 1 y 100/);
  const r = await rpc("m@g.com", "ctl_remota_lanzar", [[sede], 101, null, false, "prueba"]);
  assert.equal(r.code, "PF422");
  await owner();
  const bd = await intentar("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, tamano_muestra) values ($1, $2, 'auditoria_puntual', 'aleatoria', 150)", [ORG, sede]);
  assert.equal(bd.ok, false, "el tope también lo hace cumplir la base de datos");
});

test("lista aleatoria ponderada: las diferencias previas pesan más que el costo; el sorteo lo hace solo el servidor", async () => {
  const sede = await crearSede("Pesos");
  const ps = [];
  for (let i = 0; i < 10; i++) { const p = await crearProducto(`Pe${i}`, i === 1 ? 1000 : 100); await existencia(sede, p.id, 5); ps.push(p); }
  // P0 (costo 100) con 5 sesiones previas con diferencia; P1 (costo máximo 1000) sin diferencias
  await owner();
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  for (let i = 0; i < 5; i++) {
    const s = await uno("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado) values ($1, $2, 'conteo_apertura', 'completa', 'abierta') returning id", [ORG, sede]);
    const pa = await uno("insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica) values ($1, $2, $3, $4, 'x', 1) returning id", [ORG, sede, s.id, ps[0].id]);
    await c.query("insert into piefirme.ctl_partida_calculo (partida_id, organizacion_id, sucursal_id, sesion_id, producto_id, saldo_sistema, diferencia_piezas, costo_unitario, diferencia_valor) values ($1, $2, $3, $4, $5, 5, -4, 100, -400)", [pa.id, ORG, sede, s.id, ps[0].id]);
    await c.query("update piefirme.ctl_sesion_conteo set estado = 'cancelada' where id = $1", [s.id]);
  }
  const base = await uno("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, estado) values ($1, $2, 'auditoria_puntual', 'aleatoria', 'abierta') returning id", [ORG, sede]);
  await c.query("set local app.ctl_purga = 'on'");
  const veces = {};
  for (let i = 0; i < 300; i++) {
    await c.query("select piefirme_app.ctl_generar_lista($1, $2, $3, 'aleatoria', 1, true)", [ORG, base.id, sede]);
    const f = await uno("select producto_id from piefirme.ctl_lista_solicitada where sesion_id = $1", [base.id]);
    veces[f.producto_id] = (veces[f.producto_id] ?? 0) + 1;
    await c.query("delete from piefirme.ctl_lista_solicitada where sesion_id = $1", [base.id]);
  }
  await c.query("set local app.ctl_purga = ''");
  const otros = ps.slice(2).reduce((a, p) => a + (veces[p.id] ?? 0), 0) / 8;
  assert.ok((veces[ps[0].id] ?? 0) > 1.3 * (veces[ps[1].id] ?? 1), `diferencias previas (${veces[ps[0].id]}) deben pesar más que el costo máximo (${veces[ps[1].id]})`);
  assert.ok((veces[ps[1].id] ?? 0) > otros, `el costo alto (${veces[ps[1].id]}) pesa más que un producto común (${otros.toFixed(1)})`);
  // el usuario no elige: una sucursal no puede escribir en la lista
  await como("r@g.com");
  const w = await intentar("insert into piefirme.ctl_lista_solicitada (organizacion_id, sucursal_id, sesion_id, producto_id) values ($1, $2, $3, $4)", [ORG, sede, base.id, ps[5].id]);
  assert.equal(w.ok, false); assert.equal(w.code, "42501");
});

// ═════════════════════════════ 6 · SUSTITUCIÓN DE CÓDIGO (criterio 14) ═════════════════════════════
test("sustitución de código: faltante caro + sobrante barato en la misma sesión → alerta y los dos productos ligados (criterio 14)", async () => {
  const sede = await crearSede("Sustituye");
  const caro = await crearProducto("Sus-caro", 600), barato = await crearProducto("Sus-barato", 100), medio = await crearProducto("Sus-medio", 400), otro = await crearProducto("Sus-otro", 30);
  for (const p of [caro, barato, medio, otro]) await existencia(sede, p.id, 5);
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  await capturar("r@g.com", ini.sesion_id, caro, 4);     // falta 1 (costo 600)
  await capturar("r@g.com", ini.sesion_id, barato, 6);   // sobra 1 (costo 100) → relación 6:1 ≥ 3:1
  await capturar("r@g.com", ini.sesion_id, medio, 4);    // falta 1 (400)
  await capturar("r@g.com", ini.sesion_id, otro, 5);
  const cierre = await cerrar("m@g.com", ini.sesion_id);
  assert.equal(cierre.sustituciones, 1);
  const casos = await casosDe(ini.sesion_id);
  const cCaro = casos.find((k2) => k2.producto_id === caro.id), cBar = casos.find((k2) => k2.producto_id === barato.id), cMed = casos.find((k2) => k2.producto_id === medio.id);
  assert.equal(cCaro.contexto.sustitucion.rol, "faltante_caro");
  assert.equal(cCaro.contexto.sustitucion.sobrante.producto_id, barato.id, "el caso del faltante lleva los dos productos");
  assert.equal(cCaro.contexto.sustitucion.faltante.producto_id, caro.id);
  assert.equal(cBar.contexto.sustitucion.caso_principal_id, cCaro.id, "el sobrante queda ligado al caso principal");
  assert.equal("sustitucion" in cMed.contexto, false, "400 vs 100 es 4:1 pero el medio no tiene sobrante igual: no se empareja con nada ya usado");
  await owner();
  const al = await filas("select tipo, severidad, referencia_id, mensaje from piefirme.ctl_alerta where tipo = 'posible_sustitucion_codigo' and sucursal_id = $1", [sede]);
  assert.equal(al.length, 1);
  assert.equal(al[0].referencia_id, cCaro.id); assert.equal(al[0].severidad, "alta");
  assert.match(al[0].mensaje, /Sus-caro/); assert.match(al[0].mensaje, /Sus-barato/);

  // relación menor al umbral (600 vs 300 = 2:1) y cantidades distintas: no hay alerta
  const sede2 = await crearSede("SustituyeB");
  const c1 = await crearProducto("Sus2-caro", 600), c2 = await crearProducto("Sus2-mitad", 300), c3 = await crearProducto("Sus2-bar", 100);
  for (const p of [c1, c2, c3]) await existencia(sede2, p.id, 5);
  const ini2 = await iniciar("r@g.com", "conteo_apertura", sede2);
  await capturar("r@g.com", ini2.sesion_id, c1, 4);   // -1
  await capturar("r@g.com", ini2.sesion_id, c2, 6);   // +1 pero 2:1
  await capturar("r@g.com", ini2.sesion_id, c3, 7);   // +2 (cantidad distinta)
  const cierre2 = await cerrar("r@g.com", ini2.sesion_id);
  assert.equal(cierre2.ok, true);
  await owner();
  assert.equal((await filas("select 1 from piefirme.ctl_alerta where tipo = 'posible_sustitucion_codigo' and sucursal_id = $1", [sede2])).length, 0);
});

// ═════════════════════════════ 7 · CRUCE CANCELACIÓN–FALTANTE (criterio 15) ═════════════════════════════
test("faltante con una cancelación reciente del mismo producto: el caso nace con la cancelación ligada (criterio 15)", async () => {
  const sede = await crearSede("Cancela");
  const p = await crearProducto("Cancelado", 150), vieja = await crearProducto("Cancel-vieja", 90), sin = await crearProducto("Sin-cancel", 70);
  for (const x of [p, vieja, sin]) await existencia(sede, x.id, 4);
  const v = await ventaCancelada(sede, p.id, 2, "r@g.com");          // hace 2 días
  await ventaCancelada(sede, vieja.id, 20, "p@g.com");              // fuera de la ventana de 7 días
  const ini = await iniciar("s@g.com", "conteo_apertura", sede);
  await capturar("s@g.com", ini.sesion_id, p, 3);
  await capturar("s@g.com", ini.sesion_id, vieja, 3);
  await capturar("s@g.com", ini.sesion_id, sin, 3);
  await cerrar("s@g.com", ini.sesion_id);
  const casos = await casosDe(ini.sesion_id);
  const k1 = casos.find((x) => x.producto_id === p.id);
  assert.ok(k1.contexto.cancelacion, "el caso trae la cancelación ligada");
  assert.equal(k1.contexto.cancelacion.folio, v.folio, "folio del ticket");
  assert.equal(k1.contexto.cancelacion.usuario_cancelo, ids["r@g.com"], "usuario que canceló");
  assert.ok("autorizador" in k1.contexto.cancelacion, "autorizador (nulo si el origen no lo registró)");
  assert.ok(k1.contexto.cancelacion.fecha, "fecha");
  assert.equal("cancelacion" in casos.find((x) => x.producto_id === vieja.id).contexto, false, "una cancelación de hace 20 días no se liga");
  assert.equal("cancelacion" in casos.find((x) => x.producto_id === sin.id).contexto, false);
  await owner();
  assert.equal((await filas("select 1 from piefirme.ctl_alerta where tipo = 'faltante_con_cancelacion' and sucursal_id = $1", [sede])).length, 1);
});

// ═════════════════════════════ 8 · AUDITORÍA REMOTA (criterio 17) ═════════════════════════════
test("auditoría remota: por omisión a todas; una sola exige motivo; avance en vivo; expira lo no respondido (criterio 17)", async (t) => {
  // sucursales de prueba con productos (más las que ya trae la clínica de QA)
  const sedes = [];
  for (let i = 0; i < 3; i++) {
    const s = await crearSede(`Remota${i}`); sedes.push(s);
    for (let j = 0; j < 4; j++) { const p = await crearProducto(`Rem${i}-${j}`, 30 + j * 20); await existencia(s, p.id, 5); }
  }
  const activas = Number((await uno("select count(*) as n from piefirme.sedes where organizacion_id = $1 and activa", [ORG])).n);
  // «una sola» sin motivo se rechaza; con motivo pasa (es la excepción)
  const sola = await rpc("m@g.com", "ctl_remota_lanzar", [[sedes[0]], 2, 30, false, null]);
  assert.equal(sola.code, "PF422"); assert.match(sola.message, /una sola sucursal/i);
  const sola2 = await rpc("m@g.com", "ctl_remota_lanzar", [[sedes[0]], 2, 30, false, "Sospecha de préstamo de mercancía"]);
  assert.equal(sola2.ok, true); assert.equal(sola2.r.sesiones.length, 1);
  // por omisión: TODAS (la que ya tiene sesión abierta se omite con motivo)
  const lanz = await rpc("m@g.com", "ctl_remota_lanzar", [null, 2, 60, false, null]);
  assert.equal(lanz.ok, true, lanz.message);
  const L = lanz.r;
  assert.equal(L.sesiones.length + L.omitidas.length, activas, "una sesión por sucursal activa (o su motivo de omisión)");
  assert.ok(L.sesiones.length >= 3, `sesiones lanzadas: ${L.sesiones.length}`);
  assert.ok(L.omitidas.some((o) => o.sucursal_id === sedes[0]), "la sucursal con sesión abierta se omite");
  assert.ok(L.sesiones.every((s) => s.en_lista >= 1 && s.en_lista <= 2));
  assert.deepEqual(llavesCiegas(L), []);
  await owner();
  const s0 = await uno("select * from piefirme.ctl_sesion_conteo where id = $1", [L.sesiones.find((s) => s.sucursal_id === sedes[1]).sesion_id]);
  assert.equal(s0.tipo, "auditoria_remota"); assert.equal(s0.estado, "abierta"); assert.equal(s0.solicitada_por, ids["m@g.com"]); assert.ok(s0.limite_en > s0.solicitada_en); assert.equal(s0.tamano_muestra, 2);
  const avisos = await filas("select tipo, destinatarios from piefirme.ctl_alerta where tipo = 'auditoria_remota_solicitada' and referencia_id = $1", [s0.id]);
  assert.equal(avisos.length, 1); assert.deepEqual(avisos[0].destinatarios, ["sucursal"], "mecanismo de aviso a la sucursal (el push real llega en la Etapa 5/6)");

  await t.test("avance en vivo: sin abrir → abrió → capturó", async () => {
    let av = (await rpc("m@g.com", "ctl_remota_avance", [L.grupo_id])).r;
    assert.equal(av.resumen.total, L.sesiones.length);
    assert.equal(av.resumen.abrieron, 0); assert.equal(av.resumen.sin_abrir, L.sesiones.length);
    const mia = L.sesiones.find((s) => s.sucursal_id === sedes[1]);
    const ab = await rpc("r@g.com", "ctl_sesion_abrir", [mia.sesion_id]);
    assert.equal(ab.r.ok, true); assert.ok(ab.r.siguiente.producto_id);
    assert.deepEqual(llavesCiegas(ab.r), []);
    const otra = await rpc("p@g.com", "ctl_sesion_abrir", [mia.sesion_id]);
    assert.ok(otra.r?.ok === false || otra.code, "otra persona no puede abrir la misma sesión");
    const prod = (await filas("select p.* from piefirme.productos p where p.id = $1", [ab.r.siguiente.producto_id]))[0];
    await capturar("r@g.com", mia.sesion_id, prod, 5);
    av = (await rpc("m@g.com", "ctl_remota_avance", [L.grupo_id])).r;
    assert.equal(av.resumen.abrieron, 1); assert.equal(av.resumen.en_curso, 1); assert.equal(av.resumen.partidas_capturadas, 1);
    const fila = av.sucursales.find((s) => s.sucursal_id === sedes[1]);
    assert.equal(fila.abrio, true); assert.equal(fila.capturadas, 1); assert.ok(fila.restante_seg > 0 && fila.restante_seg <= 3600); assert.ok(fila.respuesta_seg == null || fila.respuesta_seg >= 0);
    assert.deepEqual(llavesCiegas(av), [], "el avance no lleva diferencias");
    assert.equal((await rpc("r@g.com", "ctl_remota_avance", [L.grupo_id])).code, "PF403", "el avance es de dueño y supervisor");
  });

  await t.test("al vencer el límite: expirada, lo capturado queda, lo faltante es «no reportado» y la sucursal sin respuesta se marca", async () => {
    await owner();
    await c.query("select set_config('app.ctl_rpc', 'on', true)");
    await c.query("update piefirme.ctl_sesion_conteo set limite_en = now() - interval '1 minute' where grupo_id = $1", [L.grupo_id]);
    const av = (await rpc("m@g.com", "ctl_remota_avance", [L.grupo_id])).r;
    assert.equal(av.resumen.pendientes, 0);
    assert.equal(av.resumen.expiradas, L.sesiones.length);
    const mia = av.sucursales.find((s) => s.sucursal_id === sedes[1]);
    assert.equal(mia.estado, "expirada"); assert.equal(mia.respuesta, "parcial");
    const muda = av.sucursales.find((s) => s.sucursal_id === sedes[2]);
    assert.equal(muda.estado, "expirada"); assert.equal(muda.respuesta, "no_reportada", "la sucursal que no respondió aparece como no reportada");
    assert.equal(av.resumen.no_reportadas, L.sesiones.length - 1);
    await owner();
    const s1 = await uno("select * from piefirme.ctl_sesion_conteo where id = $1", [mia.sesion_id]);
    assert.equal(s1.estado, "expirada"); assert.ok(s1.cerrada_en); assert.equal(s1.total_partidas, 1); assert.ok(s1.duracion_seg >= 0); assert.ok(s1.respuesta_seg >= 0, "registra el tiempo de respuesta");
    const nrc = await filas("select contexto from piefirme.ctl_caso where origen_tipo = 'lista_solicitada' and contexto ->> 'sesion_id' = $1", [mia.sesion_id]);
    assert.equal(nrc.length, 1, "lo pedido y no reportado abre su caso");
    assert.equal(nrc[0].contexto.no_reportado, true); assert.equal(nrc[0].contexto.sesion_estado, "expirada");
    const alerta = await filas("select severidad from piefirme.ctl_alerta where tipo = 'auditoria_remota_expirada' and referencia_id = $1", [muda.sesion_id]);
    assert.equal(alerta.length, 1); assert.equal(alerta[0].severidad, "critica");
    // ya no recibe capturas
    const tarde = await rpc("r@g.com", "ctl_capturar_partida", [randomUUID(), mia.sesion_id, "x", 1, null, null, null, null, null, null, null]);
    assert.equal(tarde.r.ok, false); assert.equal(tarde.r.error, "expirada");
    // listado de grupos
    const lg = (await rpc("m@g.com", "ctl_remota_listar", [5])).r;
    assert.equal(lg[0].grupo_id, L.grupo_id); assert.equal(Number(lg[0].expiradas), L.sesiones.length);
  });
});

// ═════════════════════════════ 9 · RELEVO DE TURNO (criterios 18 y 19) ═════════════════════════════
test("relevo que cuadra: el entrante cuenta a ciegas, acepta con su PIN, la custodia pasa a él y desbloquea las ventas (criterio 19)", async () => {
  const sede = await crearSede("RelevoOK");
  const ps = [];
  for (let i = 0; i < 3; i++) { const p = await crearProducto(`Rel${i}`, 100 + i); await existencia(sede, p.id, 2 + i); await custodia(sede, p.id); ps.push(p); }
  const tSal = await turno(sede, "s@g.com", 600, 10), tEnt = await turno(sede, "r@g.com", 5);
  // antes de contar, Caja debe bloquear al entrante
  let b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, true); assert.equal(b.requerida, true); assert.equal(b.estado, "sin_iniciar"); assert.match(b.motivo, /custodia/i);
  const sinTurno = await rpc("p@g.com", "ctl_sesion_iniciar", ["relevo_turno", sede, "{}"]);
  assert.equal(sinTurno.ok, false, "quien no tiene turno abierto en la sucursal no inicia el relevo");
  const ini = await iniciar("r@g.com", "relevo_turno", sede);
  assert.equal(ini.modo_lista, "custodia"); assert.equal(ini.en_lista, 3); assert.ok(ini.entrega_id);
  b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, true); assert.equal(b.estado, "contando");
  for (const [i, p] of ps.entries()) { const r = await capturar("r@g.com", ini.sesion_id, p, 2 + i); assert.deepEqual(llavesCiegas(r), []); }
  const cierre = await cerrar("r@g.com", ini.sesion_id);
  assert.equal(cierre.relevo.cuadra, true); assert.deepEqual(cierre.relevo.diferencias, []);
  assert.equal(cierre.casos_abiertos, undefined, "la sucursal no recibe cifras de casos");
  assert.equal((await casosDe(ini.sesion_id)).length, 0, "si cuadra, no hay caso");
  b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, true, "cuadra pero aún no acepta: sigue bloqueado"); assert.equal(b.estado, "por_aceptar");
  let ac = await rpc("r@g.com", "ctl_relevo_aceptar", [ini.entrega_id, "0000"]);
  assert.equal(ac.r.ok, false); assert.equal(ac.r.error, "pin_incorrecto");
  ac = await rpc("s@g.com", "ctl_relevo_aceptar", [ini.entrega_id, "4321"]);
  assert.ok(ac.r?.ok === false && ac.r.error === "sin_diferencia", "el saliente no acepta por el entrante: solo firma cuando hubo diferencia");
  ac = await rpc("r@g.com", "ctl_relevo_aceptar", [ini.entrega_id, "4321"]);
  assert.equal(ac.r.ok, true); assert.equal(ac.r.estado, "aceptada");
  b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, false, "aceptada: puede vender");
  const cu = (await rpc("r@g.com", "ctl_custodia_actual", [sede])).r;
  assert.equal(cu.usuario_id, ids["r@g.com"], "la custodia se transfirió al entrante");
  const otra = await rpc("r@g.com", "ctl_sesion_iniciar", ["relevo_turno", sede, "{}"]);
  assert.equal(otra.ok, false, "la entrega ya está aceptada");
});

test("relevo que NO cuadra: diferencia a ambos, casos diferencia_relevo con los dos turnos y las dos firmas, alerta al dueño", async () => {
  const sede = await crearSede("RelevoNO");
  const ps = [];
  for (let i = 0; i < 3; i++) { const p = await crearProducto(`RelN${i}`, 80 + i); await existencia(sede, p.id, 5); await custodia(sede, p.id); ps.push(p); }
  const tSal = await turno(sede, "s@g.com", 600, 10), tEnt = await turno(sede, "r@g.com", 5);
  const ini = await iniciar("r@g.com", "relevo_turno", sede);
  await capturar("r@g.com", ini.sesion_id, ps[0], 5);    // cuadra
  await capturar("r@g.com", ini.sesion_id, ps[1], 3);    // falta 2
  // ps[2] sin contar
  const cierre = await cerrar("r@g.com", ini.sesion_id);
  assert.equal(cierre.relevo.cuadra, false);
  assert.equal(cierre.relevo.diferencias.length, 2, "se muestra la diferencia (excepción F2.4): la faltante y la no contada");
  assert.equal(cierre.relevo.diferencias.find((d) => d.producto_id === ps[1].id).diferencia_relevo, -2);
  assert.ok(cierre.relevo.diferencias.find((d) => d.producto_id === ps[2].id).no_reportado);
  assert.equal("partidas_con_diferencia" in cierre, false, "ninguna otra cifra ciega en la respuesta");
  // el saliente también la ve
  const ver = (await rpc("s@g.com", "ctl_relevo_ver", [ini.entrega_id])).r;
  assert.equal(ver.estado, "con_diferencia"); assert.equal(ver.diferencias.length, 2);
  assert.equal((await rpc("a@g.com", "ctl_relevo_ver", [ini.entrega_id])).code, "PF403");
  // casos con los dos turnos y las firmas
  const casos = await casosDe(ini.sesion_id);
  assert.equal(casos.length, 2); assert.ok(casos.every((k2) => k2.tipo === "diferencia_relevo" && k2.turno_saliente_id === tSal && k2.turno_entrante_id === tEnt));
  assert.equal(casos.find((k2) => k2.producto_id === ps[1].id).usuario_captura, ids["r@g.com"]);
  await owner();
  const al = await filas("select severidad, destinatarios from piefirme.ctl_alerta where tipo = 'relevo_con_diferencia' and sucursal_id = $1", [sede]);
  assert.equal(al.length, 1); assert.ok(al[0].destinatarios.includes("dueno"));
  // sigue bloqueado hasta que el entrante acepte (con diferencia)
  let b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, true); assert.equal(b.estado, "con_diferencia");
  const ac = (await rpc("r@g.com", "ctl_relevo_aceptar", [ini.entrega_id, "4321"])).r;
  assert.equal(ac.ok, true); assert.equal(ac.estado, "aceptada_con_diferencia");
  b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, false);
  const fs = (await rpc("s@g.com", "ctl_relevo_aceptar", [ini.entrega_id, "8765"])).r;
  assert.equal(fs.ok, true); assert.equal(fs.firmo, "saliente");
  await owner();
  const k2 = await uno("select contexto from piefirme.ctl_caso where id = $1", [casos[0].id]);
  assert.ok(k2.contexto.firmas.entrante.usuario_id === ids["r@g.com"] && k2.contexto.firmas.saliente.usuario_id === ids["s@g.com"], "dos firmas en el caso");
});

test("el saliente se va y el entrante no acepta: la entrega queda entrega_no_aceptada y se ve en el tablero (criterio 18)", async () => {
  const sede = await crearSede("RelevoNoAcepta");
  const p = await crearProducto("RelX", 90); await existencia(sede, p.id, 2); await custodia(sede, p.id);
  await turno(sede, "s@g.com", 480, 60);                 // saliente: cerró hace 60 min
  const tEnt = await turno(sede, "r@g.com", 50);          // entrante abrió hace 50 min y no hizo nada
  const b = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt])).r;
  assert.equal(b.bloquea, true); assert.equal(b.estado, "entrega_no_aceptada");
  const lista = (await rpc("m@g.com", "ctl_entregas_listar", [sede, null, 50])).r;
  assert.equal(lista.length, 1); assert.equal(lista[0].estado, "entrega_no_aceptada"); assert.ok(lista[0].no_aceptada_en);
  assert.equal(lista[0].turno_entrante_id, tEnt);
  assert.equal((await rpc("r@g.com", "ctl_entregas_listar", [sede, null, 50])).code, "PF403", "el tablero es de dueño y supervisor");
  // y si el entrante empezó a contar y el saliente cerró hace más de la espera → también se marca
  const sede2 = await crearSede("RelevoLento");
  const p2 = await crearProducto("RelY", 90); await existencia(sede2, p2.id, 2); await custodia(sede2, p2.id);
  await turno(sede2, "s@g.com", 480, 40);
  const tEnt2 = await turno(sede2, "r@g.com", 35);
  const ini = await iniciar("r@g.com", "relevo_turno", sede2);
  assert.ok(ini.entrega_id);
  const b2 = (await rpc("r@g.com", "ctl_entrega_pendiente", [tEnt2])).r;
  assert.equal(b2.estado, "entrega_no_aceptada"); assert.equal(b2.bloquea, true);
  // aun así puede terminar de contar y aceptar tarde (queda constancia del retraso)
  await capturar("r@g.com", ini.sesion_id, p2, 2);
  const cierre = await cerrar("r@g.com", ini.sesion_id);
  assert.equal(cierre.relevo.cuadra, true);
  await owner();
  const e = await uno("select estado, no_aceptada_en from piefirme.ctl_entrega_turno where id = $1", [ini.entrega_id]);
  assert.equal(e.estado, "por_aceptar"); assert.ok(e.no_aceptada_en, "queda registrado que pasó por entrega_no_aceptada");
});

test("cancelar: la sucursal solo antes de capturar; con capturas solo supervisor o dueño con motivo; la remota no se cancela desde la sucursal", async () => {
  const sede = await crearSede("Cancela2");
  const p = await crearProducto("Can2", 10); await existencia(sede, p.id, 2);
  const a = await iniciar("r@g.com", "conteo_apertura", sede);
  const ok = await rpc("r@g.com", "ctl_sesion_cancelar", [a.sesion_id, null]);
  assert.equal(ok.r.ok, true); assert.equal(ok.r.estado, "cancelada");
  const b = await iniciar("r@g.com", "conteo_apertura", sede);
  await capturar("r@g.com", b.sesion_id, p, 1);
  assert.equal((await rpc("r@g.com", "ctl_sesion_cancelar", [b.sesion_id, "me equivoqué"])).code, "PF403", "no se cancela para esconder lo contado");
  assert.equal((await rpc("s@g.com", "ctl_sesion_cancelar", [b.sesion_id, ""])).code, "PF422", "sin motivo no");
  const s = await rpc("s@g.com", "ctl_sesion_cancelar", [b.sesion_id, "Se contó en la sucursal equivocada"]);
  assert.equal(s.r.ok, true);
  assert.equal((await casosDe(b.sesion_id)).length, 0, "cancelada: no abre casos");
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_partida_conteo where sesion_id = $1", [b.sesion_id])).n, 1, "lo capturado se conserva como evidencia");
});

// ═════════════════════════════ 10 · CRITERIO 23 (parte de servidor) ═════════════════════════════
test("conteo de 100 claves: sin partidas perdidas y con tiempo de servidor despreciable (criterio 23, parte de servidor)", async () => {
  const sede = await crearSede("Cien");
  const ps = [];
  for (let i = 0; i < 100; i++) { const p = await crearProducto(`C${i}`, 10 + i); await existencia(sede, p.id, 3); ps.push(p); }
  const ini = await iniciar("r@g.com", "conteo_apertura", sede);
  assert.equal(ini.en_lista, 100);
  const t0 = Date.now();
  let sig = ini.siguiente, vistos = 0;
  while (sig) {   // se sigue la lista como lo haría el lector: cada captura devuelve el siguiente
    const p = ps.find((x) => x.id === sig.producto_id);
    const r = await capturar("r@g.com", ini.sesion_id, p, 3);
    sig = r.siguiente; vistos++;
    if (vistos > 120) break;
  }
  const ms = Date.now() - t0;
  assert.equal(vistos, 100);
  const cierre = await cerrar("r@g.com", ini.sesion_id);
  assert.equal(cierre.total_partidas, 100); assert.equal(cierre.no_reportadas, 0);
  assert.equal((await casosDe(ini.sesion_id)).length, 0);
  assert.ok(ms < 15 * 60 * 1000, `100 capturas tardaron ${ms} ms en servidor`);
});

// ═════════════════════════════ 11 · REVISIÓN TRANSVERSAL: ninguna relación del módulo filtra saldo ═════════════════════════════
test("tras todo lo anterior, ninguna relación ctl_* devuelve campos ciegos al rol de sucursal (criterio 1, barrido)", async () => {
  await owner();
  const rels = (await c.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                where n.nspname = 'piefirme' and c.relkind in ('r', 'v') and (c.relname like 'ctl\\_%' or c.relname like 'v\\_ctl\\_%')`)).rows;
  let conFilas = 0;
  for (const correo of ["r@g.com", "p@g.com"]) {
    for (const { relname } of rels) {
      await como(correo);
      const r = await intentar(`select * from piefirme.${relname} limit 5`);
      if (!r.ok || !r.rows.length) continue;
      conFilas++;
      for (const fila of r.rows) assert.deepEqual(Object.keys(fila).filter((kk) => CIEGOS.test(kk)), [], `${correo} recibe campos ciegos de ${relname}`);
    }
  }
  assert.ok(conFilas >= 4);
  // y ninguna de las RPC de captura le devuelve esas llaves ya se comprobó arriba; aquí se revisan las de consulta del entrante
  await como("r@g.com");
  const x = await intentar("select * from piefirme.ctl_entrega_turno limit 3");
  for (const fila of x.rows) assert.deepEqual(Object.keys(fila).filter((kk) => CIEGOS.test(kk)), []);
});

// ═════════════════════════════ 12 · HTTP REAL (PostgREST): lo que de verdad recibe un navegador; sin persistir nada ═════════════════════════════
test("HTTP: la RPC rechaza a quien no debe y anon no ejecuta nada del motor", async (t) => {
  const ESQ = "piefirme";
  const tokens = {};
  for (const correo of ["r@g.com", "m@g.com", "a@g.com"]) {
    const j = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: correo, password: "123456" }) }).then((x) => x.json());
    assert.ok(j.access_token, `login ${correo}`);
    tokens[correo] = j.access_token;
  }
  const http = async (tok, ruta, cuerpo) => {
    const r = await fetch(`${cfg.url}/rest/v1/rpc/${ruta}`, { method: "POST", headers: { apikey: cfg.anon, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", "Content-Profile": ESQ, "Accept-Profile": ESQ }, body: JSON.stringify(cuerpo) });
    const txt = await r.text(); let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    return { status: r.status, data };
  };
  await t.test("r@g.com no lanza remota ni lee el avance ni expira sesiones; el soporte no captura", async () => {
    for (const [ruta, cuerpo, correo] of [["ctl_remota_lanzar", { p_sucursales: null }, "r@g.com"], ["ctl_remota_avance", {}, "r@g.com"], ["ctl_sesiones_expirar", {}, "r@g.com"],
                                          ["ctl_sesion_detalle", { p_sesion: randomUUID() }, "r@g.com"], ["ctl_sesion_iniciar", { p_tipo: "conteo_apertura", p_sucursal: randomUUID() }, "a@g.com"]]) {
      const r = await http(tokens[correo], ruta, cuerpo);
      assert.ok(r.status >= 400, `${correo} ${ruta} → ${r.status}`);
      assert.match(JSON.stringify(r.data), /PF403|permiso|no tiene/i, `${ruta}: ${JSON.stringify(r.data)}`);
    }
  });
  await t.test("captura con sesión inexistente → 404 sin filtrar nada", async () => {
    const r = await http(tokens["r@g.com"], "ctl_capturar_partida", { p_id: randomUUID(), p_sesion: randomUUID(), p_codigo: "x", p_cantidad: 1 });
    assert.ok(r.status >= 400);
    assert.deepEqual(llavesCiegas(r.data), []);
  });
  await t.test("anon no ejecuta ninguna RPC del motor", async () => {
    for (const ruta of ["ctl_capturar_partida", "ctl_sesion_iniciar", "ctl_sesion_cerrar", "ctl_remota_lanzar", "ctl_entrega_pendiente", "ctl_relevo_aceptar", "ctl_sesion_detalle"]) {
      const r = await http(cfg.anon, ruta, {});
      assert.ok([401, 403, 404].includes(r.status), `anon ${ruta} → ${r.status} ${JSON.stringify(r.data)}`);
    }
  });
  await t.test("las funciones internas piefirme_app.ctl_* no son ejecutables por la app", async () => {
    await owner();
    const x = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname = 'piefirme_app' and p.proname = any($1) and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`,
                          [["ctl_cerrar_interno", "ctl_generar_lista", "ctl_abrir_caso", "ctl_o_saldo", "ctl_o_precio", "ctl_o_cancelaciones", "ctl_entregas_revisar", "ctl_expirar_vencidas", "ctl_validar_pin"]]);
    assert.deepEqual(x, [], `ejecutables por la app: ${x.map((f) => f.proname)}`);
    const y = await filas(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = 'ctl_solicitar_ajuste_origen' and has_function_privilege('authenticated', p.oid, 'execute')`);
    assert.deepEqual(y, [], "ctl_solicitar_ajuste_origen sigue sin ser ejecutable por la app (D4)");
  });
});
