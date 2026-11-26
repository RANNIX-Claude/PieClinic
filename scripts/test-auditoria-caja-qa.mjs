// Pruebas del módulo «Control y Auditoría» · ETAPA 1 (cambios en el ORIGEN: precio no editable, cancelaciones con bloqueo, cajón sin venta, eventos) contra QA.
//   node --test scripts/test-auditoria-caja-qa.mjs
//
// UNA transacción que SIEMPRE se deshace (no deja filas, folios, ventas, movimientos ni alertas): se siembra como dueño de la base y se actúa «como» cada cuenta de
// prueba (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-cierres-qa.mjs. Cada escenario usa una sucursal NUEVA con su turno, producto y precio.
// Cubre: precio de catálogo congelado y NO editable (F1.1/F1.2), precio abierto detrás del parámetro, descuentos con catálogo cerrado + tope + clave con autorizador,
// cancelación con bloqueo (criterio 3: sin pieza no hay cancelación y la pieza no vuelve al inventario), autorizada → pieza vuelve + alerta al dueño, vencimiento a la espera →
// pendiente_de_validación sin devolver, rechazo, devolución, cajón sin venta, cola de eventos y su drenado, venta offline idempotente, y que un evento que falla NO rompe la venta.
// Cuentas (clave 123456, solo QA): a superadmin(soporte) · m dueño · s supervisor · p podólogo · r recepción.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
const J = (x) => JSON.stringify(x);
const PIN = "4827";

const c = await conectar(cfg);
const ids = {};
let n = 0;

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
/** Llama una función de piefirme como `correo`. r.res = lo que devolvió. */
const rpc = async (correo, fn, args = []) => {
  await como(correo);
  const x = await intentar(`select piefirme.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args);
  return x.ok ? { ...x, res: x.rows[0].r } : x;
};
const sqlComo = async (correo, sql, params = []) => { await como(correo); return intentar(sql, params); };
const uno = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows[0]; };
const filas = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows; };
const comoOwner = async (sql, params) => { await owner(); return c.query(sql, params); };

// ───────────── siembra (como dueño de la base) ─────────────
async function nuevaSede(clave) {
  const s = await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, clave, `Sucursal prueba ${clave}`]);
  return s.id;
}
async function nuevoTurno(sede, correo, fondo = 500, caja = "Caja 1") {
  return (await uno("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, cajero_id, fondo_inicial) values ($1, $2, $3, $4, $5) returning id", [ORG, sede, caja, ids[correo], fondo])).id;
}
async function nuevoProducto(nombre, precio, { barras = null } = {}) {
  const sku = "T1-" + crypto.randomUUID().slice(0, 8);
  const p = await uno("insert into piefirme.productos (organizacion_id, sku, nombre, tipo, codigo_barras, iva_tipo) values ($1, $2, $3, 'venta', $4, 'exento') returning id, sku, codigo_barras", [ORG, sku, nombre, barras ?? ("750" + Math.floor(Math.random() * 1e10).toString().padStart(10, "0"))]);
  await c.query("insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio) values ($1, 'producto', $2, current_date - 30, $3)", [ORG, p.id, precio]);
  return p;
}
async function nuevoServicio(nombre, precio, tipoPrecio = "fijo") {
  const s = await uno("insert into piefirme.servicios (organizacion_id, codigo, nombre, tipo_precio, iva_tipo) values ($1, $2, $3, $4, 'exento') returning id", [ORG, "T1-" + crypto.randomUUID().slice(0, 8), nombre, tipoPrecio]);
  if (precio != null) await c.query("insert into piefirme.precios (organizacion_id, item_tipo, servicio_id, vigente_desde, precio, tipo_precio) values ($1, 'servicio', $2, current_date - 30, $3, $4)", [ORG, s.id, precio, tipoPrecio === "fijo" ? "fijo" : tipoPrecio]);
  return s.id;
}
const poner = async (correo, sede, clave, valor) => { const r = await rpc("m@g.com", "ctl_config_guardar", [clave, sede, J(valor), false, null]); assert.ok(r.ok, `config ${clave}: ${r.message}`); return r; };
async function ponerPin(correo) {
  await c.query("insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash) values ($1, $2, piefirme_app.hash_pin($1, $3)) on conflict (perfil_id) do update set pin_hash = excluded.pin_hash", [ids[correo], ORG, PIN]);
}
/** Crea (COMO `correo`) un ticket con las líneas dadas. Devuelve {id, lineas:[resultado de cada inserción]}. */
async function ticket(correo, sede, lineas, extra = {}) {
  await como(correo);
  const v = await intentar("insert into piefirme.ventas (organizacion_id, sede_id, origen) values ($1, $2, 'mostrador') returning id", [ORG, sede]);
  assert.ok(v.ok, `crear ticket: ${v.message}`);
  const id = v.rows[0].id; const res = [];
  for (const l of lineas) {
    res.push(await intentar(`insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, producto_id, servicio_id, cantidad, precio_unitario, descuento_pct, descuento_motivo, descuento_motivo_id, autorizacion_descuento_id, autorizacion_precio_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
      [ORG, sede, id, l.tipo ?? (l.producto_id ? "producto" : "servicio"), l.producto_id ?? null, l.servicio_id ?? null, l.cantidad ?? 1, l.precio ?? 0, l.pct ?? 0, l.motivo ?? null, l.motivo_id ?? null, l.aut ?? null, l.aut_precio ?? null]));
  }
  void extra;
  return { id, lineas: res };
}
/** Paga el total en efectivo y cobra (como `correo`). */
async function cobrar(correo, sede, vid) {
  await owner();
  const t = await uno("select total from piefirme.ventas where id = $1", [vid]);
  await como(correo);
  if (Number(t.total) > 0) { const p = await intentar("insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto) values ($1, $2, $3, 'efectivo', $4)", [ORG, sede, vid, t.total]); assert.ok(p.ok, `pago: ${p.message}`); }
  return rpc(correo, "cobrar_venta", [vid]);
}
const objeto = async (nombre) => { await owner(); await c.query("insert into storage.objects (bucket_id, name, metadata) values ('pf-auditoria', $1, '{}'::jsonb)", [nombre]); };
const hash = () => crypto.randomBytes(32).toString("hex");
/** Resuelve una cancelación como `correo`: código(s), motivo, autorizador+PIN y foto en vivo. */
async function resolver(correo, id, sede, { codigos, motivo, nota = null, autorizador = "s@g.com", pin = PIN, foto = true }) {
  const ev = crypto.randomUUID(); const ruta = `${ORG}/ctl/${sede}/${ev}.jpg`;
  if (foto) await objeto(ruta);
  return rpc(correo, "ctl_cancelacion_resolver", [id, codigos, motivo, nota, ids[autorizador], pin, foto ? ev : null, foto ? ruta : null, foto ? hash() : null, 1000, 1600, 1200, null]);
}
const motivoDe = async (tipo, nombre) => (await uno("select id from piefirme.ctl_motivo where organizacion_id = $1 and tipo = $2 and nombre = $3", [ORG, tipo, nombre])).id;
const movs = (vid, tipo) => filas("select * from piefirme.movimientos_inventario where referencia_id = $1 and tipo = $2", [vid, tipo]);
const eventos = (evento, ext) => filas("select * from piefirme.ctl_eventos_entrada where organizacion_id = $1 and evento = $2 and ($3::text is null or id_externo = $3) order by creado_en", [ORG, evento, ext ?? null]);
const alertas = (tipo, ref) => filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = $2 and ($3::uuid is null or referencia_id = $3) order by creado_en", [ORG, tipo, ref ?? null]);
/** Vence a la fuerza una solicitud (como si hubieran pasado los segundos de espera). */
const vencer = async (id) => { await owner(); await c.query("select set_config('app.ctl_rpc', 'on', true)"); await c.query("update piefirme.ctl_cancelacion set vence_en = now() - interval '1 second' where id = $1", [id]); };

before(async () => {
  await c.query("begin");
  await c.query("set local statement_timeout = '15min'");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  await c.query("update piefirme.perfiles set sedes = '{}' where id = any($1)", [CORREOS.map((e) => ids[e])]);
  for (const e of ["r@g.com", "m@g.com", "s@g.com"]) await ponerPin(e);
  // intentos fallidos de PIN que otras corridas (E2E de la PWA) hayan dejado confirmados en QA en los últimos 15 min bloquearían estas pruebas: se limpian DENTRO de la transacción (se deshace)
  await c.query("delete from piefirme.pin_intentos where solicitante_id = any($1)", [CORREOS.map((e) => ids[e])]);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · CATÁLOGO Y PARÁMETROS ═════════════════════════════
test("catálogo cerrado de motivos y parámetros: lo que cambia la operación nace APAGADO", async (t) => {
  const S = await nuevaSede("T1A");
  await t.test("motivos sembrados por organización (descuento y cancelación) y administrables solo por el dueño", async () => {
    const m = await filas("select tipo, count(*)::int as n from piefirme.ctl_motivo where organizacion_id = $1 and activo group by tipo order by tipo", [ORG]);
    assert.deepEqual(m.map((x) => [x.tipo, x.n >= 6]), [["cancelacion", true], ["descuento", true]]);
    const nuevo = await rpc("m@g.com", "ctl_motivo_guardar", [null, "descuento", "Motivo de prueba", false, true, null]);
    assert.ok(nuevo.ok, nuevo.message);
    const r = await rpc("r@g.com", "ctl_motivo_guardar", [null, "descuento", "Otro de prueba", false, true, null]);
    assert.equal(r.ok, false, "recepción no administra el catálogo");
  });
  await t.test("los interruptores quedan en 0 y la espera en 60 s; el tope sin clave en 0 %", async () => {
    const r = await rpc("r@g.com", "ctl_caja_parametros", [S]);
    assert.ok(r.ok, r.message);
    assert.equal(r.res.precio_abierto_con_clave, false);
    assert.equal(r.res.descuento_motivo_cerrado, false);
    assert.equal(r.res.cancelacion_con_bloqueo, false);
    assert.equal(Number(r.res.cancelacion_espera_seg), 60);
    assert.equal(Number(r.res.descuento_sin_clave_pct), 0);
    assert.ok(r.res.motivos_descuento.length >= 6 && r.res.motivos_cancelacion.length >= 6);
    assert.ok(r.res.autorizadores.some((a) => a.id === ids["s@g.com"]), "el supervisor aparece como autorizador");
    assert.ok(!r.res.autorizadores.some((a) => a.id === ids["a@g.com"]), "el soporte RANNIX no autoriza");
  });
  await t.test("el tope del sistema se respeta: la espera mínima es 10 s y los interruptores solo 0 o 1", async () => {
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["cancelacion_espera_seg", S, J(5), false, null])).ok, false);
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["cancelacion_con_bloqueo", S, J(2), false, null])).ok, false);
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["cancelacion_espera_seg", S, J(30), false, null])).ok, true);
    await rpc("m@g.com", "ctl_config_restablecer", ["cancelacion_espera_seg", S]);
  });
  await t.test("captura a ciegas: la respuesta de la Caja no trae saldo, existencia, costo ni diferencias", async () => {
    const r = await rpc("r@g.com", "ctl_caja_parametros", [S]);
    const txt = JSON.stringify(r.res).toLowerCase();
    for (const prohibido of ["saldo", "existencia", "costo", "diferencia", "esperado"]) assert.ok(!txt.includes(prohibido), `la respuesta no debe mencionar «${prohibido}»`);
    assert.equal((await rpc("p@g.com", "ctl_caja_parametros", [S])).ok, true, "el podólogo puede capturar, así que lee lo mismo");
  });
});

// ═════════════════════════════ 2 · PRECIO NO EDITABLE (F1.1) Y PRECIO DE CATÁLOGO CONGELADO (F1.2) ═════════════════════════════
test("F1.1 y F1.2: el precio sale del catálogo, el cajero no lo edita y la línea guarda el precio vigente", async (t) => {
  const S = await nuevaSede("T1B"); await nuevoTurno(S, "r@g.com");
  const prod = await nuevoProducto("Crema de prueba", 100);
  await t.test("un precio distinto al del catálogo se rechaza en el servidor (no depende de que el campo esté deshabilitado)", async () => {
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 40 }]);
    assert.equal(x.lineas[0].ok, false);
    assert.match(x.lineas[0].message, /precio_no_editable/);
  });
  await t.test("con el precio del catálogo se acepta y se CONGELA precio_catalogo en la línea", async () => {
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 100, cantidad: 2 }]);
    assert.ok(x.lineas[0].ok, x.lineas[0].message);
    const l = await uno("select precio_unitario, precio_catalogo, precio_abierto from piefirme.venta_lineas where id = $1", [x.lineas[0].rows[0].id]);
    assert.equal(Number(l.precio_catalogo), 100);
    assert.equal(l.precio_abierto, false);
    const cobro = await cobrar("r@g.com", S, x.id);
    assert.ok(cobro.ok, cobro.message);
    const v = await rpc("m@g.com", "ctl_registrar_consulta", ["prueba", "{}"]);
    void v;
    await como("m@g.com");
    const vv = await intentar("select precio_cobrado, precio_catalogo_al_momento from piefirme.v_ctl_ventas where venta_id = $1", [x.id]);
    assert.equal(Number(vv.rows[0].precio_catalogo_al_momento), 100, "v_ctl_ventas expone el precio de catálogo al momento");
  });
  await t.test("si el catálogo cambia después, la línea ya cobrada conserva el precio con que se vendió", async () => {
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 100 }]);
    await cobrar("r@g.com", S, x.id);
    await owner();
    await c.query("update piefirme.precios set vigente_hasta = current_date - 1 where producto_id = $1 and vigente_hasta is null", [prod.id]);
    await c.query("insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio) values ($1, 'producto', $2, current_date, 150)", [ORG, prod.id]);
    const l = await uno("select precio_catalogo from piefirme.venta_lineas where venta_id = $1", [x.id]);
    assert.equal(Number(l.precio_catalogo), 100);
    const nuevo = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 100 }]);
    assert.equal(nuevo.lineas[0].ok, false, "con el catálogo nuevo (150), cobrar 100 ya es editar el precio");
    const ok = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 150 }]);
    assert.ok(ok.lineas[0].ok);
    assert.equal(Number((await uno("select precio_catalogo from piefirme.venta_lineas where id = $1", [ok.lineas[0].rows[0].id])).precio_catalogo), 150);
  });
  await t.test("precio_modificado_en_catalogo: cada versión de precio emite su evento con el precio anterior y el nuevo", async () => {
    const ev = await filas("select payload from piefirme.ctl_eventos_entrada where organizacion_id = $1 and evento = 'precio_modificado_en_catalogo' and payload ->> 'producto_id' = $2 order by creado_en", [ORG, prod.id]);
    assert.equal(ev.length, 2);
    assert.equal(Number(ev[1].payload.precio_anterior), 100);
    assert.equal(Number(ev[1].payload.precio_nuevo), 150);
  });
  await t.test("el precio ABIERTO (servicio «a valorar») sigue siendo del cajero mientras precio_abierto_con_clave = 0 (decisión del dueño)", async () => {
    const sv = await nuevoServicio("Producto especial de prueba", 0, "a_valorar");
    const x = await ticket("r@g.com", S, [{ servicio_id: sv, precio: 2400 }]);
    assert.ok(x.lineas[0].ok, x.lineas[0].message);
    const l = await uno("select precio_abierto, precio_catalogo, precio_unitario from piefirme.venta_lineas where id = $1", [x.lineas[0].rows[0].id]);
    assert.equal(l.precio_abierto, true);
    assert.equal(l.precio_catalogo, null, "un precio cotizado no tiene referencia de catálogo");
    assert.equal(Number(l.precio_unitario), 2400);
  });
  await t.test("con precio_abierto_con_clave = 1 el precio cotizado exige la clave de un supervisor y deja al autorizador en la línea", async () => {
    await poner("m@g.com", S, "precio_abierto_con_clave", 1);
    const sv = await nuevoServicio("Plantilla especial", 0, "a_valorar");
    const sin = await ticket("r@g.com", S, [{ servicio_id: sv, precio: 2400 }]);
    assert.equal(sin.lineas[0].ok, false);
    assert.match(sin.lineas[0].message, /precio_abierto_requiere_clave/);
    const mala = await rpc("r@g.com", "ctl_autorizar_caja", ["precio", ids["s@g.com"], "0000", null, "Cotización", S, "{}"]);
    assert.equal(mala.res.ok, false);
    assert.equal(mala.res.error, "clave_incorrecta");
    const buena = await rpc("r@g.com", "ctl_autorizar_caja", ["precio", ids["s@g.com"], PIN, null, "Cotización del molde de yeso", S, "{}"]);
    assert.equal(buena.res.ok, true, JSON.stringify(buena.res));
    const con = await ticket("r@g.com", S, [{ servicio_id: sv, precio: 2400, aut_precio: buena.res.id }]);
    assert.ok(con.lineas[0].ok, con.lineas[0].message);
    const l = await uno("select a.autorizador_id from piefirme.venta_lineas l join piefirme.autorizaciones_admin a on a.id = l.autorizacion_precio_id where l.id = $1", [con.lineas[0].rows[0].id]);
    assert.equal(l.autorizador_id, ids["s@g.com"]);
    // la autorización es del solicitante: otro cajero no la puede usar
    await owner();
    await nuevoTurno(S, "m@g.com", 0, "Caja 2");
    const ajena = await ticket("m@g.com", S, [{ servicio_id: sv, precio: 2400, aut_precio: buena.res.id }]);
    assert.ok(ajena.lineas[0].ok, "el dueño no necesita clave");
    await rpc("m@g.com", "ctl_config_restablecer", ["precio_abierto_con_clave", S]);
  });
});

// ═════════════════════════════ 3 · DESCUENTOS: CATÁLOGO CERRADO, TOPE Y CLAVE (F1.1) ═════════════════════════════
test("F1.1 descuentos: motivo del catálogo, tope sin clave de ctl_config y clave de supervisor con autorizador registrado", async (t) => {
  const S = await nuevaSede("T1C"); await nuevoTurno(S, "r@g.com");
  const prod = await nuevoProducto("Producto con descuento", 1000);
  const promo = await motivoDe("descuento", "Promoción vigente");
  await t.test("apagado (por omisión) la Caja se comporta como siempre: 10 % con motivo libre sin clave; 20 % exige clave", async () => {
    const ok = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 10, motivo: "Cliente frecuente" }]);
    assert.ok(ok.lineas[0].ok, ok.lineas[0].message);
    const no = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 20, motivo: "Cliente frecuente" }]);
    assert.equal(no.lineas[0].ok, false);
    assert.match(no.lineas[0].message, /descuento_requiere_pin/);
  });
  await t.test("encendido: el texto libre ya no se acepta, el motivo debe ser del catálogo", async () => {
    await poner("m@g.com", S, "descuento_motivo_cerrado", 1);
    const libre = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 5, motivo: "porque sí" }]);
    assert.equal(libre.lineas[0].ok, false);
    assert.match(libre.lineas[0].message, /descuento_motivo_cerrado/);
    const falso = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 5, motivo_id: crypto.randomUUID() }]);
    assert.equal(falso.lineas[0].ok, false, "un motivo que no existe en el catálogo se rechaza");
  });
  await t.test("tope sin clave 0 % por omisión: cualquier descuento pide clave; la clave de un supervisor lo autoriza y se registra usuario, motivo, autorizador y monto", async () => {
    const sin = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 5, motivo_id: promo }]);
    assert.equal(sin.lineas[0].ok, false);
    assert.match(sin.lineas[0].message, /descuento_requiere_pin/);
    const mala = await rpc("r@g.com", "ctl_autorizar_caja", ["descuento", ids["s@g.com"], "1111", 5, "Promoción vigente", S, "{}"]);
    assert.equal(mala.res.error, "clave_incorrecta");
    const buena = await rpc("r@g.com", "ctl_autorizar_caja", ["descuento", ids["s@g.com"], PIN, 5, "Promoción vigente", S, "{}"]);
    assert.equal(buena.res.ok, true, JSON.stringify(buena.res));
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 5, motivo_id: promo, aut: buena.res.id }]);
    assert.ok(x.lineas[0].ok, x.lineas[0].message);
    const l = await uno("select descuento, descuento_motivo, descuento_motivo_id, descuento_usuario_id, descuento_autorizado_por, precio_catalogo from piefirme.venta_lineas where id = $1", [x.lineas[0].rows[0].id]);
    assert.equal(Number(l.descuento), 50);
    assert.equal(l.descuento_motivo, "Promoción vigente");
    assert.equal(l.descuento_motivo_id, promo);
    assert.equal(l.descuento_usuario_id, ids["r@g.com"]);
    assert.equal(l.descuento_autorizado_por, ids["s@g.com"]);
    assert.equal(Number(l.precio_catalogo), 1000, "el descuento no altera el precio de catálogo");
    await cobrar("r@g.com", S, x.id);
    await como("m@g.com");
    const vv = await intentar("select autorizador, motivo_descuento, descuento_monto, precio_cobrado, precio_catalogo_al_momento from piefirme.v_ctl_ventas where venta_id = $1", [x.id]);
    assert.equal(vv.rows[0].autorizador, ids["s@g.com"]);
    assert.equal(vv.rows[0].motivo_descuento, "Promoción vigente");
    assert.equal(Number(vv.rows[0].descuento_monto), 50);
  });
  await t.test("el tope sin clave es configurable (máx. 15 %): con 10 % un 8 % pasa solo y un 12 % pide clave; el sistema no deja subirlo de 15", async () => {
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["descuento_sin_clave_pct", S, J(20), false, null])).ok, false);
    await poner("m@g.com", S, "descuento_sin_clave_pct", 10);
    const ocho = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 8, motivo_id: promo }]);
    assert.ok(ocho.lineas[0].ok, ocho.lineas[0].message);
    const l = await uno("select descuento_autorizado_por from piefirme.venta_lineas where id = $1", [ocho.lineas[0].rows[0].id]);
    assert.equal(l.descuento_autorizado_por, null, "dentro del tope no hay autorizador");
    const doce = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000, pct: 12, motivo_id: promo }]);
    assert.equal(doce.lineas[0].ok, false);
  });
  await t.test("la clave no puede ser de la misma persona (un supervisor no se autoriza a sí mismo) ni de un cajero", async () => {
    const cajero = await rpc("r@g.com", "ctl_autorizar_caja", ["descuento", ids["r@g.com"], PIN, 12, "Promoción vigente", S, "{}"]);
    assert.equal(cajero.res.ok, false, "recepción no es autorizador");
    const soporte = await rpc("r@g.com", "ctl_autorizar_caja", ["descuento", ids["a@g.com"], "123456", 12, "Promoción vigente", S, "{}"]);
    assert.equal(soporte.res.ok, false, "el soporte RANNIX no autoriza");
  });
  await t.test("3 claves incorrectas bloquean 15 minutos a quien las pide", async () => {
    for (let i = 0; i < 3; i++) await rpc("r@g.com", "ctl_autorizar_caja", ["descuento", ids["s@g.com"], "9999", 12, "Promoción vigente", S, "{}"]);
    const bloqueada = await rpc("r@g.com", "ctl_autorizar_caja", ["descuento", ids["s@g.com"], PIN, 12, "Promoción vigente", S, "{}"]);
    assert.equal(bloqueada.res.error, "bloqueado");
    await owner(); await c.query("delete from piefirme.pin_intentos where solicitante_id = $1", [ids["r@g.com"]]);
  });
  await t.test("descuento global con motivo del catálogo", async () => {
    await poner("m@g.com", S, "descuento_sin_clave_pct", 15);
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 1000 }]);
    await como("r@g.com");
    const g = await intentar("select piefirme.aplicar_descuento_global($1, 'pct', 10, 'texto', null, $2)", [x.id, promo]);
    assert.ok(g.ok, g.message);
    const l = await uno("select descuento_motivo, descuento_motivo_id, descuento from piefirme.venta_lineas where venta_id = $1", [x.id]);
    assert.equal(l.descuento_motivo, "Promoción vigente");
    assert.equal(Number(l.descuento), 100);
  });
});

// ═════════════════════════════ 4 · CANCELACIÓN CON BLOQUEO (F1.3, criterio 3) ═════════════════════════════
test("F1.3 cancelación con bloqueo: sin pieza no hay cancelación y la pieza no vuelve hasta que el módulo responde", async (t) => {
  const S = await nuevaSede("T1D"); await nuevoTurno(S, "r@g.com");
  const prod = await nuevoProducto("Plantilla de gel", 300, { barras: "7501234567890" });
  const otro = await nuevoProducto("Calcetín", 80, { barras: "7509999999999" });
  const m = await motivoDe("cancelacion", "Producto equivocado");
  async function venta(lineas = [{ producto_id: prod.id, precio: 300 }]) { const x = await ticket("r@g.com", S, lineas); assert.ok(x.lineas.every((l) => l.ok), x.lineas.map((l) => l.message).join()); const b = await cobrar("r@g.com", S, x.id); assert.ok(b.ok, b.message); return x.id; }

  await t.test("apagado (por omisión) cancelar_venta funciona como siempre y la pieza vuelve de inmediato", async () => {
    const v = await venta();
    assert.equal((await movs(v, "venta")).length, 1);
    const r = await rpc("r@g.com", "cancelar_venta", [v, "Error de captura"]);
    assert.ok(r.ok, r.message);
    assert.equal((await movs(v, "devolucion_cliente")).length, 1);
    const req = await rpc("r@g.com", "ctl_cancelacion_requiere", [v]);
    assert.equal(req.res.requiere, false);
  });

  await poner("m@g.com", S, "cancelacion_con_bloqueo", 1);

  await t.test("encendido: cancelar_venta directo de un ticket con piezas se rechaza en el servidor; uno solo de servicios se cancela como siempre", async () => {
    const v = await venta();
    const directo = await rpc("r@g.com", "cancelar_venta", [v, "Quiero cancelar"]);
    assert.equal(directo.ok, false);
    assert.match(directo.message, /cancelacion_con_bloqueo/);
    assert.equal((await movs(v, "devolucion_cliente")).length, 0, "la pieza NO volvió");
    const sv = await nuevoServicio("Quiropodia", 400);
    const s = await ticket("r@g.com", S, [{ servicio_id: sv, precio: 400 }]); await cobrar("r@g.com", S, s.id);
    assert.equal((await rpc("r@g.com", "ctl_cancelacion_requiere", [s.id])).res.requiere, false);
    const sol = await rpc("r@g.com", "ctl_cancelacion_solicitar", [s.id, "x"]);
    assert.equal(sol.res.error, "sin_piezas");
    assert.ok((await rpc("r@g.com", "cancelar_venta", [s.id, "Error"])).ok, "sin piezas no hay nada que escanear");
  });

  await t.test("solicitar deja la cancelación PENDIENTE: el ticket sigue cobrado, la pieza no vuelve y se emite cancelacion_solicitada", async () => {
    const v = await venta();
    assert.equal((await rpc("r@g.com", "ctl_cancelacion_requiere", [v])).res.requiere, true);
    const s = await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "La clienta se equivocó"]);
    assert.ok(s.ok && s.res.ok, s.message);
    assert.equal(s.res.estado, "pendiente");
    assert.equal(s.res.espera_seg, 60);
    assert.match(s.res.folio, /^CCN-\d{4}-\d{5}$/);
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    assert.equal((await movs(v, "devolucion_cliente")).length, 0);
    const ev = await eventos("cancelacion_solicitada", s.res.id);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].payload.ticket, (await uno("select folio from piefirme.ventas where id = $1", [v])).folio);
    // idempotente: una sola solicitud viva por ticket
    const otra = await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "otra vez"]);
    assert.equal(otra.res.existente, true);
    assert.equal(otra.res.id, s.res.id);
    assert.equal((await eventos("cancelacion_solicitada", s.res.id)).length, 1);
  });

  await t.test("criterio 3 · sin escanear la pieza: rechazada y la pieza no vuelve al inventario", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    const r = await resolver("r@g.com", s.id, S, { codigos: [], motivo: m });
    assert.equal(r.res.ok, false);
    assert.equal(r.res.error, "pieza_no_escaneada");
    assert.equal((await uno("select estado, intentos_rechazados from piefirme.ctl_cancelacion where id = $1", [s.id])).intentos_rechazados, 1);
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    assert.equal((await movs(v, "devolucion_cliente")).length, 0);
  });

  await t.test("criterio 3 · un código que no es de la pieza del ticket se rechaza, deja alerta al dueño y la pieza no vuelve", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    const r = await resolver("r@g.com", s.id, S, { codigos: ["7509999999999"], motivo: m });   // el calcetín, no la plantilla
    assert.equal(r.res.ok, false);
    assert.equal(r.res.error, "pieza_no_corresponde");
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    assert.equal((await movs(v, "devolucion_cliente")).length, 0);
    assert.equal((await alertas("cancelacion_pieza_no_corresponde", s.id)).length, 1);
    const ev = await filas("select tipo, detalle from piefirme.ctl_cancelacion_evento where cancelacion_id = $1 order by creado_en", [s.id]);
    assert.ok(ev.some((e) => e.tipo === "pieza_no_corresponde"));
    // sin foto registrada: un intento fallido no deja evidencia
    assert.equal((await filas("select 1 from piefirme.ctl_evidencia where origen_id = $1", [s.id])).length, 0);
  });

  await t.test("faltan piezas por escanear: un ticket de 2 piezas distintas exige las dos; y una pieza de cantidad 2 exige dos escaneos", async () => {
    const v = await venta([{ producto_id: prod.id, precio: 300, cantidad: 2 }, { producto_id: otro.id, precio: 80 }]);
    const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    const a = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890", "7509999999999"], motivo: m });
    assert.equal(a.res.error, "pieza_no_corresponde");
    assert.match(a.res.mensaje, /Falta escanear/);
    const b = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890", "7501234567890", "7509999999999"], motivo: m });
    assert.equal(b.res.ok, true, JSON.stringify(b.res));
    assert.equal((await movs(v, "devolucion_cliente")).length, 2, "las dos piezas volvieron");
  });

  await t.test("motivo del catálogo y foto en vivo son obligatorios; sin foto no hay evidencia ni cancelación", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    const sinMotivo = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: crypto.randomUUID() });
    assert.equal(sinMotivo.ok, false, "un motivo fuera del catálogo se rechaza");
    const sinFoto = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: m, foto: false });
    assert.equal(sinFoto.ok, false);
    assert.match(sinFoto.message, /foto/);
    const vieja = crypto.randomUUID(); const ruta = `${ORG}/ctl/${S}/${vieja}.jpg`;
    const sinObjeto = await rpc("r@g.com", "ctl_cancelacion_resolver", [s.id, ["7501234567890"], m, null, ids["s@g.com"], PIN, vieja, ruta, hash(), 1, 1, 1, null]);
    assert.equal(sinObjeto.ok, false, "una ruta sin objeto recién subido (galería, foto vieja) no vale");
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
  });

  await t.test("clave incorrecta: no se cancela (y queda el intento); la nota es obligatoria en «Otro»", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    const mala = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: m, pin: "0000" });
    assert.equal(mala.res.error, "clave_incorrecta");
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    const otro_ = await motivoDe("cancelacion", "Otro (con nota)");
    const sinNota = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: otro_ });
    assert.equal(sinNota.ok, false);
    assert.match(sinNota.message, /nota/);
    await owner(); await c.query("delete from piefirme.pin_intentos where solicitante_id = $1", [ids["r@g.com"]]);
  });

  await t.test("AUTORIZADA: pieza escaneada + foto + clave + motivo → el ticket se cancela, la pieza vuelve al inventario, queda el autorizador y alerta inmediata al dueño", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "La clienta se equivocó"])).res;
    const r = await resolver("r@g.com", s.id, S, { codigos: [" 7501234567890 "], motivo: m, nota: "Devolvió el empaque" });
    assert.equal(r.res.ok, true, JSON.stringify(r.res));
    assert.equal(r.res.estado, "autorizada");
    const venta_ = await uno("select estado, motivo_cancelacion, cancelada_por, cancelacion_autorizada_por, cancelacion_id from piefirme.ventas where id = $1", [v]);
    assert.equal(venta_.estado, "cancelada");
    assert.match(venta_.motivo_cancelacion, /Producto equivocado/);
    assert.equal(venta_.cancelada_por, ids["r@g.com"]);
    assert.equal(venta_.cancelacion_autorizada_por, ids["s@g.com"]);
    assert.equal(venta_.cancelacion_id, s.id);
    assert.equal((await movs(v, "devolucion_cliente")).length, 1, "la pieza volvió al inventario");
    const row = await uno("select estado, autorizador_id, motivo_nombre, evidencia_id, resuelta_tarde from piefirme.ctl_cancelacion where id = $1", [s.id]);
    assert.deepEqual([row.estado, row.autorizador_id, row.motivo_nombre, row.resuelta_tarde], ["autorizada", ids["s@g.com"], "Producto equivocado", false]);
    assert.ok(row.evidencia_id, "guarda la foto de la pieza de regreso");
    assert.equal((await filas("select 1 from piefirme.ctl_evidencia where origen_id = $1 and tipo_origen = 'cancelacion'", [s.id])).length, 1);
    const al = await alertas("cancelacion_autorizada", v);
    assert.equal(al.length, 1, "alerta inmediata al dueño en cada cancelación autorizada");
    assert.deepEqual(al[0].destinatarios, ["dueno"]);
    // idempotente: reintentar la misma respuesta no vuelve a mover inventario
    const otra = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: m });
    assert.equal(otra.res.idempotente, true);
    assert.equal((await movs(v, "devolucion_cliente")).length, 1);
  });

  await t.test("v_ctl_cancelaciones y el motor de conteo devuelven por fin el AUTORIZADOR (cerraba el pendiente de las Etapas 2 y 3)", async () => {
    await como("m@g.com");
    const r = await intentar("select ticket_original, usuario_id, autorizador, motivo from piefirme.v_ctl_cancelaciones where venta_id in (select venta_id from piefirme.ctl_cancelacion where estado = 'autorizada' and sucursal_id = $1)", [S]);
    assert.ok(r.rows.length >= 2);
    assert.ok(r.rows.every((x) => x.autorizador === ids["s@g.com"] && x.usuario_id === ids["r@g.com"]));
    await owner();
    const o = await c.query("select autorizador from piefirme_app.ctl_o_cancelaciones($1, $2, $3, now() - interval '1 day')", [ORG, S, prod.id]);
    assert.ok(o.rows.some((x) => x.autorizador === ids["s@g.com"]));
  });

  await t.test("VENCIMIENTO: pasada la espera queda pendiente_de_validacion, la pieza NO vuelve, alerta crítica; nunca se resuelve sola", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    await vencer(s.id);
    const st = await rpc("r@g.com", "ctl_cancelacion_estado", [s.id]);
    assert.equal(st.res.estado, "pendiente_de_validacion");
    assert.equal(st.res.segundos_restantes, 0);
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    assert.equal((await movs(v, "devolucion_cliente")).length, 0);
    const al = await alertas("cancelacion_pendiente_validacion", s.id);
    assert.equal(al.length, 1);
    assert.equal(al[0].severidad, "critica");
    // el poleo tampoco la resuelve a favor de cancelar
    await rpc("m@g.com", "ctl_eventos_drenar", [100]);
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    assert.equal((await uno("select estado from piefirme.ctl_cancelacion where id = $1", [s.id])).estado, "pendiente_de_validacion");
    assert.equal((await alertas("cancelacion_pendiente_validacion", s.id)).length, 1, "una sola alerta");
    // solo una validación completa (pieza, foto, clave, motivo) la cierra, y queda marcada como tardía
    const tarde = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: m });
    assert.equal(tarde.res.ok, true, JSON.stringify(tarde.res));
    assert.equal((await uno("select resuelta_tarde from piefirme.ctl_cancelacion where id = $1", [s.id])).resuelta_tarde, true);
    assert.equal((await movs(v, "devolucion_cliente")).length, 1);
  });

  await t.test("la espera es configurable: con 30 s la solicitud vence a los 30", async () => {
    await poner("m@g.com", S, "cancelacion_espera_seg", 30);
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    assert.equal(s.espera_seg, 30);
    const seg = (await uno("select extract(epoch from (vence_en - solicitada_en))::int as s from piefirme.ctl_cancelacion where id = $1", [s.id])).s;
    assert.equal(seg, 30);
    await rpc("m@g.com", "ctl_config_restablecer", ["cancelacion_espera_seg", S]);
  });

  await t.test("RECHAZADA: la venta queda firme y se puede volver a solicitar", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    const r = await rpc("r@g.com", "ctl_cancelacion_rechazar", [s.id, "La clienta se arrepintió de cancelar"]);
    assert.equal(r.res.estado, "rechazada");
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada");
    assert.equal((await movs(v, "devolucion_cliente")).length, 0);
    const despues = await resolver("r@g.com", s.id, S, { codigos: ["7501234567890"], motivo: m });
    assert.equal(despues.res.error, "rechazada", "una solicitud rechazada ya no se autoriza");
    const nueva = await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "otra"]);
    assert.equal(nueva.res.ok, true);
    assert.notEqual(nueva.res.id, s.id);
  });

  await t.test("DEVOLUCIÓN con reingreso: mismo camino; directo en la tabla se rechaza; autorizada devuelve la pieza y deja el autorizador", async () => {
    const v = await venta([{ producto_id: prod.id, precio: 300, cantidad: 3 }]);
    const lin = (await uno("select id from piefirme.venta_lineas where venta_id = $1", [v])).id;
    await como("r@g.com");
    const directo = await intentar("insert into piefirme.devoluciones_venta (organizacion_id, sede_id, venta_id, venta_linea_id, cantidad, monto, motivo, reingresa_inventario) values ($1, $2, $3, $4, 1, 300, 'x', true)", [ORG, S, v, lin]);
    assert.equal(directo.ok, false);
    const s = await rpc("r@g.com", "ctl_devolucion_solicitar", [lin, 1, "Una pieza defectuosa"]);
    assert.equal(s.res.ok, true, JSON.stringify(s.res));
    assert.equal((await eventos("devolucion_solicitada", s.res.id)).length, 1);
    assert.equal((await movs(v, "devolucion_cliente")).length, 0);
    const r = await resolver("r@g.com", s.res.id, S, { codigos: ["7501234567890"], motivo: await motivoDe("cancelacion", "Producto con defecto") });
    assert.equal(r.res.ok, true, JSON.stringify(r.res));
    const d = await uno("select cantidad, monto, autorizado_por, reingresa_inventario from piefirme.devoluciones_venta where venta_id = $1", [v]);
    assert.deepEqual([Number(d.cantidad), Number(d.monto), d.autorizado_por, d.reingresa_inventario], [1, 300, ids["s@g.com"], true]);
    assert.equal((await movs(await (async () => (await uno("select id from piefirme.devoluciones_venta where venta_id = $1", [v])).id)(), "devolucion_cliente")).length, 1);
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v])).estado, "cobrada", "una devolución parcial no cancela el ticket");
  });

  await t.test("quién ve qué: el cajero ve sus solicitudes; el podólogo no cancela; solo quien revisa lee la bitácora de intentos", async () => {
    const v = await venta(); const s = (await rpc("r@g.com", "ctl_cancelacion_solicitar", [v, "x"])).res;
    assert.equal((await rpc("p@g.com", "ctl_cancelacion_solicitar", [v, "x"])).ok, false);
    const pend = await rpc("r@g.com", "ctl_cancelaciones_pendientes", [S]);
    assert.ok(pend.res.some((x) => x.id === s.id));
    const bit = await sqlComo("r@g.com", "select count(*)::int as n from piefirme.ctl_cancelacion_evento");
    assert.equal(bit.rows[0].n, 0, "la bitácora de intentos no la lee quien captura");
    const bit2 = await sqlComo("s@g.com", "select count(*)::int as n from piefirme.ctl_cancelacion_evento where cancelacion_id = $1", [s.id]);
    assert.ok(bit2.rows[0].n >= 1);
  });
});

// ═════════════════════════════ 5 · APERTURA DE CAJÓN SIN VENTA (F1.5) Y EVENTOS ═════════════════════════════
test("F1.5 cajón sin venta y la cola de eventos", async (t) => {
  const S = await nuevaSede("T1E"); const turno = await nuevoTurno(S, "r@g.com", 500, "Caja 7");
  const prod = await nuevoProducto("Producto de evento", 50);
  await t.test("«Abrir cajón (sin venta)» registra usuario, caja, hora del servidor y motivo opcional, y emite cajon_abierto_sin_venta", async () => {
    const id = crypto.randomUUID();
    const r = await rpc("r@g.com", "ctl_cajon_abrir", [S, null, "Dar cambio a un cliente", null, "manual", id]);
    assert.ok(r.ok && r.res.ok, r.message);
    const ev = await eventos("cajon_abierto_sin_venta", "cajon:" + id);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].payload.usuario_id, ids["r@g.com"]);
    assert.equal(ev[0].payload.caja, "Caja 7");
    assert.equal(ev[0].payload.turno_id, turno);
    const ap = await uno("select usuario_id, caja, motivo, sucursal_id, abierta_en, creado_en from piefirme.ctl_apertura_cajon where evento_id = $1", [ev[0].id]);
    assert.equal(ap.usuario_id, ids["r@g.com"]);
    assert.equal(ap.motivo, "Dar cambio a un cliente");
    assert.equal(ap.sucursal_id, S);
    assert.ok(Math.abs(new Date(ap.creado_en) - Date.now()) < 3600e3 * 24, "hora del servidor");
    const sin = await rpc("r@g.com", "ctl_cajon_abrir", [S, null, null, null, "manual", null]);
    assert.ok(sin.res.ok, "el motivo es opcional");
    const dup = await rpc("r@g.com", "ctl_cajon_abrir", [S, null, "otra", null, "manual", id]);
    assert.equal(dup.res.idempotente, true);
    assert.equal((await eventos("cajon_abierto_sin_venta", "cajon:" + id)).length, 1);
    const hw = await rpc("r@g.com", "ctl_cajon_abrir", [S, null, null, null, "hardware", null]);
    assert.ok(hw.res.ok, "contrato del pulso real: la misma RPC con origen hardware");
    assert.equal((await rpc("r@g.com", "ctl_cajon_abrir", [S, null, null, null, "magia", null])).ok, false);
  });
  await t.test("el podólogo no abre el cajón; otra sucursal ajena tampoco", async () => {
    assert.equal((await rpc("p@g.com", "ctl_cajon_abrir", [S, null, null, null, "manual", null])).ok, false);
    assert.equal((await rpc("r@g.com", "ctl_cajon_abrir", [crypto.randomUUID(), null, null, null, "manual", null])).ok, false);
  });
  await t.test("el reporte de la Etapa 6 ya lo cuenta (ctl_apertura_cajon por sucursal y cajero)", async () => {
    const x = await uno("select count(*)::int as n from piefirme.ctl_apertura_cajon where sucursal_id = $1 and usuario_id = $2", [S, ids["r@g.com"]]);
    assert.equal(x.n, 3);
  });
  await t.test("venta_registrada, turno_abierto y turno_cerrado se emiten desde el origen (una vez cada uno)", async () => {
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 50 }]);
    assert.equal((await eventos("venta_registrada", "venta:" + x.id)).length, 0, "un ticket por cobrar aún no es venta registrada");
    await cobrar("r@g.com", S, x.id);
    const ev = await eventos("venta_registrada", "venta:" + x.id);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].payload.sucursal_id, S);
    assert.equal(ev[0].payload.usuario_id, ids["r@g.com"]);
    assert.equal(Number(ev[0].payload.total), 50);
    assert.equal((await eventos("turno_abierto", "turno_abierto:" + turno)).length, 1);
    await como("r@g.com");
    const cierre = await intentar("select piefirme.cerrar_turno($1, $2, 'prueba', null)", [turno, 550]);
    assert.ok(cierre.ok, cierre.message);
    const cerrado = await eventos("turno_cerrado", "turno_cerrado:" + turno);
    assert.equal(cerrado.length, 1);
    assert.ok(!JSON.stringify(cerrado[0].payload).toLowerCase().includes("esperado"), "el evento no lleva lo que el sistema esperaba");
  });
  await t.test("poleo: ctl_eventos_drenar procesa lo pendiente, es idempotente y deja los eventos en «procesado»", async () => {
    const antes = await uno("select count(*)::int as n from piefirme.ctl_eventos_entrada where organizacion_id = $1 and estado = 'pendiente'", [ORG]);
    assert.ok(antes.n >= 4);
    const sinPermiso = await rpc("r@g.com", "ctl_eventos_drenar", [100]);
    assert.equal(sinPermiso.ok, false, "el cajero no drena la cola");
    const r = await rpc("m@g.com", "ctl_eventos_drenar", [5000]);
    assert.ok(r.ok, r.message);
    assert.ok(r.res.procesados >= 4);
    assert.equal(r.res.con_error, 0);
    const despues = await uno("select count(*)::int as n from piefirme.ctl_eventos_entrada where organizacion_id = $1 and estado = 'pendiente'", [ORG]);
    assert.equal(despues.n, 0);
    const otra = await rpc("m@g.com", "ctl_eventos_drenar", [5000]);
    assert.equal(otra.res.procesados, 0, "segunda pasada: nada que hacer");
    const ev = await filas("select estado, procesado_en from piefirme.ctl_eventos_entrada where organizacion_id = $1 and evento = 'cajon_abierto_sin_venta' and payload ->> 'sucursal_id' = $2", [ORG, S]);
    assert.ok(ev.every((e) => e.estado === "procesado" && e.procesado_en));
  });
  await t.test("un evento con payload malo queda en «error» con su mensaje y no frena a los demás", async () => {
    await owner();
    await c.query("insert into piefirme.ctl_eventos_entrada (organizacion_id, evento, origen, id_externo, payload) values ($1, 'cajon_abierto_sin_venta', 'prueba', 'malo-1', '{}'::jsonb)", [ORG]);
    const r = await rpc("m@g.com", "ctl_eventos_drenar", [100]);
    assert.equal(r.res.con_error, 1);
    const e = await uno("select estado, error from piefirme.ctl_eventos_entrada where origen = 'prueba' and id_externo = 'malo-1'");
    assert.equal(e.estado, "error");
    assert.match(e.error, /sucursal_id/);
  });
  await t.test("la app no escribe directo en la cola ni en las tablas nuevas (solo RPC)", async () => {
    for (const correo of CORREOS) {
      for (const tabla of ["ctl_eventos_entrada", "ctl_cancelacion", "ctl_cancelacion_evento", "ctl_motivo"]) {
        for (const sql of [`insert into piefirme.${tabla} (organizacion_id) values ('${ORG}')`, `update piefirme.${tabla} set organizacion_id = organizacion_id`, `delete from piefirme.${tabla}`]) {
          const r = await sqlComo(correo, sql);
          assert.equal(r.ok, false, `${correo} no debe poder: ${sql}`);
        }
      }
    }
  });
});

// ═════════════════════════════ 6 · EL ORIGEN NO SE ROMPE ═════════════════════════════
test("el origen no se rompe: un evento que falla no frena la venta, y la venta offline sincronizada sigue idempotente", async (t) => {
  const S = await nuevaSede("T1F"); await nuevoTurno(S, "r@g.com");
  const prod = await nuevoProducto("Producto offline", 200);
  await t.test("si la cola de eventos rechaza escribir, la venta se cobra igual (bloque de excepción)", async () => {
    await owner();
    await c.query("alter table piefirme.ctl_eventos_entrada add constraint t1_rompe check (evento = 'nunca') not valid");
    const x = await ticket("r@g.com", S, [{ producto_id: prod.id, precio: 200 }]);
    const b = await cobrar("r@g.com", S, x.id);
    assert.ok(b.ok, `el cobro NO debe fallar por el evento: ${b.message}`);
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [x.id])).estado, "cobrada");
    assert.equal((await eventos("venta_registrada", "venta:" + x.id)).length, 0, "el evento no se pudo escribir");
    // también el turno y el precio
    await owner();
    await c.query("insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, sede_id) values ($1, 'producto', $2, current_date, 210, $3)", [ORG, prod.id, S]);
    await nuevoTurno(S, "m@g.com", 0, "Caja 9");
    const s = await rpc("r@g.com", "ctl_cajon_abrir", [S, null, null, null, "manual", null]);
    assert.equal(s.ok, false, "abrir el cajón SÍ falla: el evento es el registro mismo");
    await owner();
    await c.query("alter table piefirme.ctl_eventos_entrada drop constraint t1_rompe");
  });
  await t.test("venta offline: se sincroniza con el precio con que se cobró, es idempotente por cliente_uuid y deja el precio de catálogo para el reporte", async () => {
    const uuid = crypto.randomUUID();
    const payload = { cliente_uuid: uuid, sede_id: S, folio_offline: "OFF-T1F-0001", creado_en: new Date(Date.now() - 3600e3).toISOString(), lineas: [{ tipo: "producto", producto_id: prod.id, descripcion: "Producto offline", cantidad: 1, precio_unitario: 180, tipo_precio: "fijo", descuento_pct: 0 }],
      pagos: [{ metodo: "efectivo", monto: 180 }] };   // el equipo tenía una copia vieja del catálogo: 180 en vez de 210
    const a = await rpc("r@g.com", "sincronizar_ticket_offline", [J(payload)]);
    assert.ok(a.ok, a.message);
    assert.equal(a.res.ya_existia, false);
    const b = await rpc("r@g.com", "sincronizar_ticket_offline", [J(payload)]);
    assert.ok(b.ok, b.message);
    assert.equal(b.res.ya_existia, true);
    assert.equal(b.res.venta_id, a.res.venta_id);
    assert.equal((await filas("select 1 from piefirme.ventas where cliente_uuid = $1", [uuid])).length, 1);
    assert.equal((await movs(a.res.venta_id, "venta")).length, 1, "una sola salida de inventario");
    assert.equal((await eventos("venta_registrada", "venta:" + a.res.venta_id)).length, 1);
    const l = await uno("select precio_unitario, precio_catalogo from piefirme.venta_lineas where venta_id = $1", [a.res.venta_id]);
    assert.equal(Number(l.precio_unitario), 180);
    assert.ok(Number(l.precio_catalogo) > Number(l.precio_unitario), "el reporte «ventas por debajo de catálogo» lo verá: se cobró 180 contra un catálogo de 210");
    const ev = (await eventos("venta_registrada", "venta:" + a.res.venta_id))[0];
    assert.equal(ev.payload.offline, true);
  });
  await t.test("un ticket offline con descuento (límite sin PIN de la clínica) sigue sincronizando aunque el catálogo cerrado esté encendido", async () => {
    await poner("m@g.com", S, "descuento_motivo_cerrado", 1);
    const uuid = crypto.randomUUID();
    const payload = { cliente_uuid: uuid, sede_id: S, folio_offline: "OFF-T1F-0002", creado_en: new Date().toISOString(), lineas: [{ tipo: "producto", producto_id: prod.id, descripcion: "Producto offline", cantidad: 1, precio_unitario: 210, tipo_precio: "fijo", descuento_pct: 5, descuento_motivo: "Cliente frecuente" }],
      pagos: [{ metodo: "efectivo", monto: 199.5 }] };
    const a = await rpc("r@g.com", "sincronizar_ticket_offline", [J(payload)]);
    assert.ok(a.ok, `la cola offline NO debe quedarse atorada: ${a.message}`);
    const l = await uno("select descuento_motivo, descuento_usuario_id, descuento_autorizado_por from piefirme.venta_lineas where venta_id = $1", [a.res.venta_id]);
    assert.equal(l.descuento_motivo, "Cliente frecuente");
    assert.equal(l.descuento_usuario_id, ids["r@g.com"], "queda quién lo aplicó");
  });
  await t.test("ninguna función nueva es ejecutable por anon", async () => {
    await owner();
    const r = await c.query(`select p.oid::regprocedure::text as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('piefirme', 'piefirme_app') and (p.proname like 'ctl_cancelacion%' or p.proname like 'ctl_devolucion%' or p.proname in ('ctl_cajon_abrir', 'ctl_caja_parametros', 'ctl_autorizar_caja', 'ctl_motivo_guardar',
        'ctl_eventos_drenar', 'ctl_eventos_drenar_org', 'ctl_eventos_drenar_todas', 'ctl_emitir_evento', 'ctl_verificar_clave', 'ctl_precio_catalogo', 'ctl_piezas_de_venta'))
        and has_function_privilege('anon', p.oid, 'execute')`);
    assert.deepEqual(r.rows, []);
  });
});
