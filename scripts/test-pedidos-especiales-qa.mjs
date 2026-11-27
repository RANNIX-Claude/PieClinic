// Pruebas de PEDIDOS ESPECIALES contra la base QA.   node --test scripts/test-pedidos-especiales-qa.mjs
//   (con CON_MIGRACIONES=1 aplica 320-322 dentro de la misma transacción antes de probar: sirve para probar sin haber aplicado nada)
//
// UNA transacción que SIEMPRE se deshace (no deja pedidos, folios, ventas ni inventario): se siembra como dueño de la base y se actúa «como» cada cuenta
// de prueba (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-servicios-qa.mjs. NO correr dos suites a la vez (candados compartidos).
// Cubre: transiciones válidas e inválidas · autorización separada · anticipo 50 % de $2,000 = $1,000 y saldo · un pedido por proveedor desde una nota con dos
// proveedores · rechazo con devolución o con saldo a favor · recepción abre la CxP del proveedor correcto · entrega cobra el saldo y cierra · costos enmascarados
// para recepción y podología · bitácora inmutable · RLS por sucursal · anticipo del pedido no se aplica a otro ticket · recordatorios · anon sin acceso.
// Cuentas (clave 123456, solo QA): m dueño · p podólogo · r recepción.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ambiente, conectar } from "./lib/env.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["m@g.com", "p@g.com", "r@g.com"];
const c = await conectar(cfg);
const ids = {};
let n = 0;
const S = {}, P = {}, PV = {};

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
  return x.ok ? { ...x, res: x.rows[0].r } : x;
};
const uno = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows[0]; };
const filas = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows; };
const comoFilas = async (correo, sql, params) => { await como(correo); const x = await intentar(sql, params); await owner(); return x; };
const ok = (r, msg) => assert.equal(r.ok, true, `${msg ?? "debió funcionar"}: ${r.message}`);
const falla = (r, patron, code) => { assert.equal(r.ok, false, "debió rechazarse"); if (patron) assert.match(r.message, patron); if (code) assert.equal(r.code, code); };

const nuevaSede = async (clave) => (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, clave, `Sucursal ${clave}`])).id;
const nuevoTurno = async (sede, correo, fondo = 500) => (await uno("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, cajero_id, fondo_inicial) values ($1, $2, 'Caja 1', $3, $4) returning id", [ORG, sede, ids[correo], fondo])).id;
const nuevoPaciente = async (sede, nombre = "María", ap = "González", am = "Ramírez") =>
  (await uno("insert into piefirme.pacientes (organizacion_id, sede_registro_id, nombre, apellido_paterno, apellido_materno, alta_rapida) values ($1, $2, $3, $4, $5, true) returning id", [ORG, sede, nombre, ap, am])).id;
const nuevoProveedor = async (clave, nombre, dias = 30, extra = {}) =>
  (await uno("insert into piefirme.proveedores (organizacion_id, clave, nombre, categoria, condiciones_pago, dias_credito, whatsapp_grupo, anticipo_pct) values ($1, $2, $3, 'plantillas_ortesis', 'Crédito', $4, $5, $6) returning id",
    [ORG, clave, nombre, dias, extra.wa ?? `Grupo ${nombre}`, extra.pct ?? null])).id;
const hoyMas = async (d) => (await uno("select (piefirme_app.hoy_org($1) + $2::int)::text as f", [ORG, d])).f;
const car = [{ id: null, grupo: "Material", nombre: "Piel", frase: "piel color negro", efecto_precio: "fijo", monto_unitario: 200, importe: 200 }];
const linea = (prov, extra = {}) => ({ proveedor_id: prov, tipo_item: "zapato", descripcion: "Zapato a la medida talla 26", caracteristicas: car, cantidad: 1, precio_unitario: 2000, ...extra });
const crear = async (correo, sede, pac, lineas, { fecha, plazo, nota = null, pct = null } = {}) =>
  rpc(correo, "pedido_crear", [sede, pac, JSON.stringify(lineas), fecha ?? (await hoyMas(10)), plazo ?? (await hoyMas(20)), nota, pct]);
const ped = (id) => uno("select * from piefirme.pedidos_especiales where id = $1", [id]);
const bit = (id) => filas("select * from piefirme.pedido_especial_bitacora where pedido_id = $1 order by en, id", [id]);
const COSTO = 1200;
const costosDe = async (pedId, costo = COSTO) => (await filas("select id from piefirme.pedido_especial_lineas where pedido_id = $1", [pedId])).map((l) => ({ linea_id: l.id, costo }));

/** Lleva un pedido (de una sola partida) hasta «autorizado» con el anticipo cobrado en efectivo. */
async function hastaAutorizado(sede, pac, prov, { solicita = "r@g.com", precio = 2000 } = {}) {
  const r = await crear(solicita, sede, pac, [linea(prov, { precio_unitario: precio })]);
  ok(r);
  const pedido = r.res.pedidos[0];
  ok(await rpc("r@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "efectivo", null, precio]));
  ok(await rpc("m@g.com", "pedido_autorizar", [pedido.id, JSON.stringify(await costosDe(pedido.id))]));
  return { nota: r.res.nota_id, id: pedido.id, folio: pedido.folio };
}
async function hastaRecibido(sede, pac, prov, opts) {
  const x = await hastaAutorizado(sede, pac, prov, opts);
  ok(await rpc("r@g.com", "pedido_enviar", [x.id, "whatsapp_simulado", null]));
  ok(await rpc("r@g.com", "pedido_registrar_aceptacion", [x.id, await hoyMas(5), "Lo hacemos en 5 días"]));
  ok(await rpc("r@g.com", "pedido_registrar_transito", [x.id, "DHL 123456", await hoyMas(4)]));
  const rec = await rpc("r@g.com", "pedido_recibir", [x.id, null, null]);
  ok(rec);
  return { ...x, rec: rec.res };
}

before(async () => {
  await c.query("begin");
  await c.query("set local statement_timeout = '15min'");
  if ((process.env.CON_MIGRACIONES === "1")) {
    for (const f of ["320_pedidos_especiales_esquema", "321_pedidos_especiales_rpc", "322_pedidos_especiales_vistas"])
      await c.query(fs.readFileSync(new URL(`../migraciones/${f}.sql`, import.meta.url), "utf8"));
  }
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  for (const k of ["A", "B", "C", "D", "E", "F"]) S[k] = await nuevaSede("PD" + k);
  await c.query("update piefirme.perfiles set sedes = '{}' where id = any($1)", [[ids["p@g.com"], ids["r@g.com"], ids["m@g.com"]]]);   // el podólogo de prueba solo trabaja en Chalco: se le abren las sucursales de prueba
  for (const k of ["A", "B", "C", "D", "E", "F"]) P[k] = await nuevoPaciente(S[k]);
  PV.calzado = await nuevoProveedor("PDZ1", "Calzado a Medida SA", 30, { pct: null });
  PV.lab = await nuevoProveedor("PDZ2", "Laboratorio de Plantillas", 15);
  for (const k of ["A", "B", "C", "D", "E"]) await nuevoTurno(S[k], "r@g.com");
  PV.pct30 = await nuevoProveedor("PDZ3", "Proveedor 30 por ciento", 0, { pct: 30 });
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · SOLICITUD, ANTICIPO Y UN PEDIDO POR PROVEEDOR ═════════════════════════════
test("solicitud: anticipo 50 % de $2,000 = $1,000 y saldo $1,000; un pedido por proveedor desde una nota", async (t) => {
  await t.test("zapato de $2,000: anticipo $1,000, saldo $1,000, folio y bitácora de alta con el usuario que solicita", async () => {
    const r = await crear("r@g.com", S.A, P.A, [linea(PV.calzado)]);
    ok(r);
    assert.equal(r.res.pedidos.length, 1);
    const x = await ped(r.res.pedidos[0].id);
    assert.equal(x.estado, "solicitado");
    assert.equal(Number(x.total), 2000); assert.equal(Number(x.anticipo_monto), 1000); assert.equal(Number(x.saldo), 1000); assert.equal(Number(x.anticipo_pct), 50);
    assert.match(x.folio, /^PDA-PED-\d{6}$/, "folio por sucursal con el generador existente");
    assert.match(r.res.folio, /^PDA-NPE-\d{6}$/);
    const b = await bit(x.id);
    assert.equal(b.length, 1); assert.equal(b[0].estado_nuevo, "solicitado"); assert.equal(b[0].usuario_id, ids["r@g.com"]);
    const y = await ped((await crear("r@g.com", S.A, P.A, [linea(PV.calzado)])).res.pedidos[0].id);
    assert.equal(Number(y.folio.slice(-6)), Number(x.folio.slice(-6)) + 1, "folios consecutivos sin huecos");
  });
  await t.test("el porcentaje sale del proveedor (30 %) o de la organización (50 %); solo administración lo cambia a mano", async () => {
    const a = await ped((await crear("r@g.com", S.A, P.A, [linea(PV.pct30)])).res.pedidos[0].id);
    assert.equal(Number(a.anticipo_pct), 30); assert.equal(Number(a.anticipo_monto), 600);
    const b = await ped((await crear("r@g.com", S.A, P.A, [linea(PV.calzado)], { pct: 80 })).res.pedidos[0].id);
    assert.equal(Number(b.anticipo_pct), 50, "recepción no puede cambiar el porcentaje");
    const d = await ped((await crear("m@g.com", S.A, P.A, [linea(PV.calzado)], { pct: 80 })).res.pedidos[0].id);
    assert.equal(Number(d.anticipo_pct), 80); assert.equal(Number(d.anticipo_monto), 1600);
  });
  await t.test("una nota con zapato y plantilla de proveedores distintos se separa en dos pedidos con la misma nota y un solo anticipo por cobrar", async () => {
    const r = await crear("p@g.com", S.A, P.A, [linea(PV.calzado), linea(PV.lab, { tipo_item: "plantilla", descripcion: "Plantilla ortopédica", caracteristicas: [], precio_unitario: 1000 }),
      linea(PV.lab, { tipo_item: "aditamento", descripcion: "Realce", caracteristicas: [], precio_unitario: 300, cantidad: 2 })]);
    ok(r, "el podólogo también solicita");
    assert.equal(r.res.pedidos.length, 2, "un pedido por proveedor");
    assert.equal(Number(r.res.total), 3600); assert.equal(Number(r.res.anticipo), 1800); assert.equal(Number(r.res.saldo), 1800);
    const hijos = await filas("select * from piefirme.pedidos_especiales where nota_id = $1 order by folio", [r.res.nota_id]);
    assert.equal(hijos.length, 2);
    const lab = hijos.find((h) => h.proveedor_id === PV.lab), cal = hijos.find((h) => h.proveedor_id === PV.calzado);
    assert.equal(Number(lab.total), 1600); assert.equal(Number(cal.total), 2000);
    assert.equal((await filas("select * from piefirme.pedido_especial_lineas where pedido_id = $1", [lab.id])).length, 2);
    assert.equal(lab.paciente_id, cal.paciente_id);
  });
  await t.test("validaciones: partidas, precio, fechas pasadas, proveedor ajeno o sin permiso", async () => {
    falla(await crear("r@g.com", S.A, P.A, []), /no tiene partidas/);
    falla(await crear("r@g.com", S.A, P.A, [linea(PV.calzado, { precio_unitario: 0 })]), /mayores a cero/);
    falla(await crear("r@g.com", S.A, P.A, [linea(PV.calzado)], { fecha: await hoyMas(-1) }), /pasado/);
    falla(await crear("r@g.com", S.A, P.A, [linea(PV.calzado)], { plazo: await hoyMas(-1) }), /pasado/);
    falla(await crear("r@g.com", S.A, P.A, [linea("00000000-0000-0000-0000-000000000009")]), /proveedor inexistente/);
    falla(await crear("r@g.com", S.A, P.A, [linea(PV.calzado, { tipo_item: "carro" })]), /inválido/);
  });
  await t.test("el costo estimado solo lo captura administración: recepción lo envía y se ignora", async () => {
    const a = await crear("r@g.com", S.A, P.A, [linea(PV.calzado, { costo_estimado: 900 })]);
    assert.equal((await filas("select * from piefirme.pedido_especial_costos where pedido_id = $1", [a.res.pedidos[0].id])).length, 0);
    const b = await crear("m@g.com", S.A, P.A, [linea(PV.calzado, { costo_estimado: 900 })]);
    assert.equal(Number((await uno("select costo_unitario from piefirme.pedido_especial_costos where pedido_id = $1", [b.res.pedidos[0].id])).costo_unitario), 900);
  });
});

// ═════════════════════════════ 2 · ANTICIPO EN CAJA ═════════════════════════════
test("anticipo en Caja: turno abierto, ligado al pedido, saldo por cobrar con fecha límite y efectivo al corte", async (t) => {
  const r = await crear("r@g.com", S.B, P.B, [linea(PV.calzado)], { plazo: await hoyMas(30) });
  const id = r.res.pedidos[0].id;
  await t.test("sin turno abierto no se cobra; el podólogo no cobra; método inválido", async () => {
    const sinTurno = await crear("r@g.com", S.F, P.F, [linea(PV.calzado)]);
    falla(await rpc("r@g.com", "pedido_cobrar_anticipo", [sinTurno.res.nota_id, "efectivo", null, 1000]), /turno de caja/);
      falla(await rpc("p@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "efectivo", null, 1000]), /caja/);
    falla(await rpc("r@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "bitcoin", null, null]), /inválido/);
    falla(await rpc("r@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "efectivo", null, 500]), /no cubre/);
  });
  await t.test("cobro en efectivo: anticipo pagado ligado al pedido, ingreso, depósito en el turno, cuenta por cobrar con fecha límite", async () => {
    const cobro = await rpc("r@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "efectivo", null, 1200]);
    ok(cobro);
    assert.equal(Number(cobro.res.monto), 1000); assert.equal(Number(cobro.res.cambio), 200);
    const x = await ped(id);
    assert.equal(x.estado, "anticipo_cobrado");
    const a = await uno("select * from piefirme.anticipos where id = $1", [x.anticipo_id]);
    assert.equal(a.estado, "pagado"); assert.equal(a.pedido_especial_id, id); assert.equal(Number(a.monto), 1000); assert.equal(a.metodo, "efectivo"); assert.ok(a.turno_id); assert.match(a.folio, /ANT/);
    assert.equal((await uno("select count(*)::int n from piefirme.ingresos where anticipo_id = $1", [a.id])).n, 1, "el anticipo entra a ingresos");
    const mov = await uno("select * from piefirme.movimientos_caja where turno_id = $1", [a.turno_id]);
    assert.equal(mov.tipo, "deposito"); assert.equal(Number(mov.monto), 1000);
    const cxc = await uno("select * from piefirme.cuentas_por_cobrar where id = $1", [x.cuenta_cobrar_id]);
    assert.equal(Number(cxc.importe), 1000); assert.equal(cxc.estado, "pendiente"); assert.equal(cxc.fecha_limite.toISOString().slice(0, 10), await hoyMas(30));
    const bt = await bit(id); assert.deepEqual(bt.map((b) => b.estado_nuevo), ["solicitado", "anticipo_cobrado"]);
  });
  await t.test("no se cobra dos veces", async () => { falla(await rpc("r@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "efectivo", null, 1000]), /sin anticipo pendiente|no tiene anticipo/); });
  await t.test("el anticipo de un pedido en curso NO se aplica a otro ticket (ni se ofrece en Caja); el de uno en espera sí", async () => {
    const a = (await ped(id)).anticipo_id;
    assert.equal((await uno("select aplicable_en_caja from piefirme.prp_anticipos where id = $1", [a])).aplicable_en_caja, false);
    const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id) values ($1, $2, 'mostrador', $3) returning id", [ORG, S.B, P.B]);
    const sv = (await uno("select id from piefirme.servicios where organizacion_id = $1 and tipo_precio = 'fijo' limit 1", [ORG])).id;
    await c.query("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, servicio_id, cantidad, precio_unitario) values ($1, $2, $3, 'servicio', $4, 1, 100)", [ORG, S.B, v.id, sv]).catch(() => {});
    const x = await intentar("insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto, anticipo_id) values ($1, $2, $3, 'anticipo', 1000, $4)", [ORG, S.B, v.id, a]);
    falla(x, /pertenece al pedido/);
  });
});

// ═════════════════════════════ 3 · AUTORIZACIÓN, TRANSICIONES Y FLUJO COMPLETO ═════════════════════════════
test("autorización separada del solicitante y transiciones válidas / inválidas", async (t) => {
  const r = await crear("r@g.com", S.C, P.C, [linea(PV.calzado)]);
  const id = r.res.pedidos[0].id;
  await t.test("no se autoriza sin anticipo cobrado ni se salta ninguna etapa", async () => {
    falla(await rpc("m@g.com", "pedido_autorizar", [id, JSON.stringify(await costosDe(id))]), /anticipo cobrado/);
    falla(await rpc("r@g.com", "pedido_enviar", [id, "whatsapp_simulado", null]), /autorizado/);
    falla(await rpc("r@g.com", "pedido_registrar_aceptacion", [id, await hoyMas(3), null]), /enviado/);
    falla(await rpc("r@g.com", "pedido_registrar_transito", [id, "X", null]), /aceptado/);
    falla(await rpc("r@g.com", "pedido_recibir", [id, null, null]), /aceptado o en tránsito/);
    falla(await rpc("r@g.com", "pedido_entregar", [id, "[]"]), /recibido/);
    // y aunque alguien con acceso directo lo intente, el trigger lo impide
    await owner();
    falla(await intentar("update piefirme.pedidos_especiales set estado = 'entregado' where id = $1", [id]), /transición de pedido no permitida/, "PF409");
    falla(await intentar("update piefirme.pedidos_especiales set estado = 'autorizado' where id = $1", [id]), /transición de pedido no permitida/, "PF409");
    assert.equal((await ped(id)).estado, "solicitado");
  });
  await t.test("autoriza solo administración: quien solicita (recepción, podólogo) no se autoriza; sin costos no se autoriza; el propietario sí", async () => {
    ok(await rpc("r@g.com", "pedido_cobrar_anticipo", [r.res.nota_id, "tarjeta", "AUT-1", null]));
    const costos = JSON.stringify(await costosDe(id));
    falla(await rpc("r@g.com", "pedido_autorizar", [id, costos]), /propietario/, "42501");
    falla(await rpc("p@g.com", "pedido_autorizar", [id, costos]), /propietario/, "42501");
    falla(await rpc("m@g.com", "pedido_autorizar", [id, null]), /costo estimado/);
    const a = await rpc("m@g.com", "pedido_autorizar", [id, costos]);
    ok(a);
    const x = await ped(id);
    assert.equal(x.estado, "autorizado"); assert.equal(x.autorizado_por, ids["m@g.com"]); assert.ok(x.autorizado_en);
    const oc = await uno("select * from piefirme.ordenes_compra where id = $1", [x.oc_id]);
    assert.equal(oc.proveedor_id, PV.calzado); assert.equal(oc.estado, "borrador"); assert.equal(oc.autorizada_por, ids["m@g.com"]); assert.equal(oc.dias_credito, 30);
    assert.equal(Number(oc.subtotal), COSTO); assert.match(oc.notas, /PED-/);
    falla(await rpc("m@g.com", "pedido_autorizar", [id, costos]), /anticipo cobrado/, "PF409");
  });
  await t.test("un administrador que solicita sí puede autorizar su propio pedido (es el propietario)", async () => {
    const propio = await crear("m@g.com", S.C, P.C, [linea(PV.calzado)]);
    ok(await rpc("r@g.com", "pedido_cobrar_anticipo", [propio.res.nota_id, "efectivo", null, null]));
    ok(await rpc("m@g.com", "pedido_autorizar", [propio.res.pedidos[0].id, JSON.stringify(await costosDe(propio.res.pedidos[0].id))]));
  });
  await t.test("recepción no rechaza ni cancela un pedido ya cobrado; el podólogo solo cancela el suyo sin anticipo", async () => {
    const q = await crear("r@g.com", S.C, P.C, [linea(PV.calzado)]);
    falla(await rpc("p@g.com", "pedido_cancelar", [q.res.pedidos[0].id, "no es mío", null]), /propietario/);
    ok(await rpc("r@g.com", "pedido_cancelar", [q.res.pedidos[0].id, "el cliente se arrepintió", null]));
    assert.equal((await ped(q.res.pedidos[0].id)).estado, "cancelado");
    falla(await rpc("r@g.com", "pedido_cancelar", [id, "ya autorizado", "devolucion"]), /propietario/);
    falla(await rpc("m@g.com", "pedido_cancelar", [id, "", "devolucion"]), /motivo/);
  });
});

test("flujo completo: petición sin datos personales → aceptación → tránsito → recepción abre la CxP del proveedor → entrega cobra el saldo", async (t) => {
  // una nota con dos proveedores: el zapato (30 días de crédito) y la plantilla (15 días)
  const nota = await crear("r@g.com", S.D, P.D, [linea(PV.calzado), linea(PV.lab, { tipo_item: "plantilla", descripcion: "Plantilla ortopédica a la medida", caracteristicas: [], precio_unitario: 1000 })]);
  ok(nota);
  ok(await rpc("r@g.com", "pedido_cobrar_anticipo", [nota.res.nota_id, "efectivo", null, 1500]));
  const A = nota.res.pedidos.find((x) => x.proveedor_id === PV.calzado), B = nota.res.pedidos.find((x) => x.proveedor_id === PV.lab);
  ok(await rpc("m@g.com", "pedido_autorizar", [A.id, JSON.stringify(await costosDe(A.id, 1000))]));
  ok(await rpc("m@g.com", "pedido_autorizar", [B.id, JSON.stringify(await costosDe(B.id, 400))]));

  await t.test("la petición al proveedor lleva producto, características, cantidad, iniciales, nota, fecha y sucursal; NUNCA datos personales ni costos", async () => {
    const m = await rpc("r@g.com", "pedido_mensaje", [A.id]);
    ok(m);
    assert.match(m.res, /Pedido especial PDD-PED-\d{6}/); assert.match(m.res, /piel color negro/); assert.match(m.res, /Zapato a la medida talla 26/);
    assert.match(m.res, /M\.G\.R\./); assert.match(m.res, /PDD-NPE-/); assert.match(m.res, /Sucursal PDD/); assert.match(m.res, /Fecha requerida: \d\d\/\d\d\/\d{4}/);
    assert.doesNotMatch(m.res, /María|González|Ramírez/); assert.doesNotMatch(m.res, /1000|1,000|1200|2000|2,000/, "sin costos ni precios");
    const env = await rpc("r@g.com", "pedido_enviar", [A.id, "whatsapp_simulado", null]);
    ok(env);
    const reg = await uno("select * from piefirme.pedido_mensajes where pedido_id = $1", [A.id]);
    assert.equal(reg.canal, "whatsapp_simulado"); assert.equal(reg.destino, "Grupo Calzado a Medida SA"); assert.equal(reg.enviado_por, ids["r@g.com"]);
    assert.equal((await ped(A.id)).estado, "enviado_proveedor");
    assert.equal((await uno("select estado from piefirme.ordenes_compra where id = $1", [(await ped(A.id)).oc_id])).estado, "enviada");
    falla(await rpc("r@g.com", "pedido_enviar", [A.id, "whatsapp_simulado", null]), /autorizado/);
    await owner();
    falla(await intentar("update piefirme.pedido_mensajes set texto = 'otro' where id = $1", [reg.id]), /solo inserción/, "PF409");
  });
  await t.test("aceptación con fecha acordada (no pasada) y tránsito con guía obligatoria", async () => {
    falla(await rpc("r@g.com", "pedido_registrar_aceptacion", [A.id, await hoyMas(-2), null]), /pasado/);
    ok(await rpc("r@g.com", "pedido_registrar_aceptacion", [A.id, await hoyMas(6), "Listo en 6 días"]));
    const x = await ped(A.id);
    assert.equal(x.estado, "aceptado"); assert.ok(x.aceptado_en); assert.equal(x.fecha_acordada.toISOString().slice(0, 10), await hoyMas(6));
    assert.equal((await uno("select entrega_esperada::text f from piefirme.ordenes_compra where id = $1", [x.oc_id])).f, await hoyMas(6));
    falla(await rpc("r@g.com", "pedido_registrar_transito", [A.id, " ", null]), /guía/);
    ok(await rpc("r@g.com", "pedido_registrar_transito", [A.id, "Estafeta 998877", await hoyMas(5)]));
    const y = await ped(A.id); assert.equal(y.estado, "en_transito"); assert.equal(y.guia_envio, "Estafeta 998877");
  });
  await t.test("recepción: el podólogo no recibe; recibe recepción → recepción de mercancía, inventario de la sucursal, orden recibida y CxP del proveedor con su vencimiento", async () => {
    falla(await rpc("p@g.com", "pedido_recibir", [A.id, null, null]), /opera la sucursal/);
    const rec = await rpc("r@g.com", "pedido_recibir", [A.id, null, null]);
    ok(rec);
    const x = await ped(A.id);
    assert.equal(x.estado, "recibido"); assert.equal(x.recibido_por, ids["r@g.com"]); assert.ok(x.recibido_en); assert.equal(x.recepcion_id, rec.res.recepcion_id);
    assert.equal((await uno("select estado from piefirme.ordenes_compra where id = $1", [x.oc_id])).estado, "recibida");
    const mov = await filas("select * from piefirme.movimientos_inventario where referencia_id = $1", [x.recepcion_id]);
    assert.equal(mov.length, 1); assert.equal(mov[0].tipo, "compra"); assert.equal(mov[0].sede_id, S.D, "entra al inventario de la sucursal"); assert.equal(Number(mov[0].costo_unitario), 1000);
    const cxp = await uno("select *, (fecha_vencimiento - fecha_emision) as dias from piefirme.cuentas_por_pagar where id = $1", [x.cuenta_pagar_id]);
    assert.equal(cxp.proveedor_id, PV.calzado, "la deuda es con el proveedor de ese pedido");
    assert.equal(Number(cxp.dias), 30, "vencimiento según condiciones de pago del proveedor");
    assert.equal(cxp.oc_id, x.oc_id); assert.equal(cxp.recepcion_id, x.recepcion_id); assert.equal(Number(cxp.importe), 1160, "1,000 + IVA 16 %");
    assert.equal((await uno("select cuenta_por_pagar_id from piefirme.recepciones where id = $1", [x.recepcion_id])).cuenta_por_pagar_id, cxp.id);
    // el otro pedido de la misma nota sigue por su cuenta: su CxP aparece solo cuando se recibe, con el proveedor B y 15 días
    assert.equal((await ped(B.id)).estado, "autorizado");
    ok(await rpc("r@g.com", "pedido_enviar", [B.id, "copiado_manual", "texto editado"]));
    ok(await rpc("r@g.com", "pedido_registrar_aceptacion", [B.id, await hoyMas(2), null]));
    ok(await rpc("r@g.com", "pedido_recibir", [B.id, JSON.stringify({ numero: "FAC-77", importe: 464, vencimiento: await hoyMas(40) }), null]));
    const cb = await uno("select * from piefirme.cuentas_por_pagar where id = $1", [(await ped(B.id)).cuenta_pagar_id]);
    assert.equal(cb.proveedor_id, PV.lab); assert.equal(cb.folio_factura, "FAC-77"); assert.equal(Number(cb.importe), 464);
    assert.notEqual(cb.id, cxp.id);
    falla(await rpc("r@g.com", "pedido_recibir", [A.id, null, null]), /aceptado o en tránsito/);
  });
  await t.test("entrega: el saldo debe cuadrar; cobra el saldo con el anticipo aplicado, el ticket queda cobrado, la pieza sale del inventario y el pedido se cierra", async () => {
    falla(await rpc("r@g.com", "pedido_entregar", [A.id, JSON.stringify([{ metodo: "efectivo", monto: 900 }])]), /saldo del pedido/);
    falla(await rpc("p@g.com", "pedido_entregar", [A.id, "[]"]), /caja/);
    const e = await rpc("r@g.com", "pedido_entregar", [A.id, JSON.stringify([{ metodo: "efectivo", monto: 1000, efectivo_recibido: 1000 }])]);
    ok(e);
    const x = await ped(A.id);
    assert.equal(x.estado, "entregado"); assert.equal(x.venta_id, e.res.venta_id); assert.equal(Number(x.saldo_cobrado), 1000); assert.ok(x.entregado_en);
    const v = await uno("select * from piefirme.ventas where id = $1", [x.venta_id]);
    assert.equal(v.estado, "cobrada"); assert.equal(Number(v.total), 2000); assert.equal(Number(v.anticipo_aplicado), 1000); assert.equal(Number(v.saldo), 0); assert.equal(v.paciente_id, P.D);
    const pagos = await filas("select metodo, monto from piefirme.pagos where venta_id = $1 order by metodo", [v.id]);
    assert.deepEqual(pagos.map((p) => [p.metodo, Number(p.monto)]), [["anticipo", 1000], ["efectivo", 1000]]);
    const car = await filas("select vc.frase from piefirme.venta_linea_caracteristicas vc join piefirme.venta_lineas vl on vl.id = vc.venta_linea_id where vl.venta_id = $1", [v.id]);
    assert.deepEqual(car.map((k) => k.frase), ["piel color negro"], "las características viajan al ticket (producto especial)");
    assert.equal((await uno("select estado from piefirme.anticipos where id = $1", [x.anticipo_id])).estado, "aplicado");
    assert.equal((await uno("select estado from piefirme.cuentas_por_cobrar where id = $1", [x.cuenta_cobrar_id])).estado, "cobrada");
    const inv = await uno("select coalesce(sum(cantidad), 0) q from piefirme.movimientos_inventario where sede_id = $1 and producto_id = (select producto_id from piefirme.pedido_especial_lineas where pedido_id = $2 limit 1)", [S.D, A.id]);
    assert.equal(Number(inv.q), 0, "entró al recibir y salió al entregar: inventario en cero");
    assert.equal((await uno("select count(*)::int n from piefirme.ingresos where venta_id = $1 and anticipo_id is null", [v.id])).n >= 1, true, "el cobro del saldo entra a ingresos");
    falla(await rpc("r@g.com", "pedido_entregar", [A.id, "[]"]), /recibido/, "PF409");
    falla(await rpc("m@g.com", "pedido_cancelar", [A.id, "ya entregado", null]), /no se cancela/);
    assert.deepEqual((await bit(A.id)).filter((b) => b.accion === "estado").map((b) => b.estado_nuevo),
      ["solicitado", "anticipo_cobrado", "autorizado", "enviado_proveedor", "aceptado", "en_transito", "recibido", "entregado"]);
  });
  await t.test("sin saldo (anticipo 100 %): la entrega solo aplica el anticipo", async () => {
    const q = await crear("m@g.com", S.D, P.D, [linea(PV.calzado)], { pct: 100 });
    ok(await rpc("r@g.com", "pedido_cobrar_anticipo", [q.res.nota_id, "transferencia", "SPEI 1", null]));
    const id = q.res.pedidos[0].id;
    ok(await rpc("m@g.com", "pedido_autorizar", [id, JSON.stringify(await costosDe(id))]));
    ok(await rpc("r@g.com", "pedido_enviar", [id, "whatsapp_simulado", null]));
    ok(await rpc("r@g.com", "pedido_registrar_aceptacion", [id, await hoyMas(1), null]));
    ok(await rpc("r@g.com", "pedido_recibir", [id, null, null]));
    ok(await rpc("r@g.com", "pedido_entregar", [id, "[]"]));
    assert.equal((await ped(id)).estado, "entregado");
  });
});

// ═════════════════════════════ 4 · RECHAZOS: DEVOLUCIÓN O SALDO A FAVOR ═════════════════════════════
test("rechazo del propietario o del proveedor: pedido en espera con motivo; el anticipo se devuelve o queda a favor (auditable)", async (t) => {
  const nuevo = async (pct) => { const q = await crear("r@g.com", S.E, P.E, [linea(PV.calzado)]); ok(await rpc("r@g.com", "pedido_cobrar_anticipo", [q.res.nota_id, "efectivo", null, 5000])); return q.res.pedidos[0].id; };
  await t.test("el propietario rechaza con devolución: en espera, anticipo reembolsado (pendiente de entregar al cliente), cuenta por cobrar cancelada, motivo y usuario en bitácora", async () => {
    const id = await nuevo();
    falla(await rpc("r@g.com", "pedido_rechazar", [id, "no", "devolucion"]), /propietario/, "42501");
    falla(await rpc("m@g.com", "pedido_rechazar", [id, "", "devolucion"]), /motivo/);
    falla(await rpc("m@g.com", "pedido_rechazar", [id, "Muy caro", null]), /anticipo/);
    ok(await rpc("m@g.com", "pedido_rechazar", [id, "Muy caro para ese cliente", "devolucion"]));
    const x = await ped(id);
    assert.equal(x.estado, "en_espera"); assert.equal(x.espera_origen, "propietario"); assert.equal(x.espera_motivo, "Muy caro para ese cliente"); assert.equal(x.destino_anticipo, "devolucion");
    const a = await uno("select * from piefirme.anticipos where id = $1", [x.anticipo_id]);
    assert.equal(a.estado, "reembolsado"); assert.equal(a.reembolso_estado, "solicitado"); assert.equal(Number(a.reembolso_monto), 1000);
    assert.equal((await uno("select estado from piefirme.cuentas_por_cobrar where id = $1", [x.cuenta_cobrar_id])).estado, "cancelada");
    const b = (await bit(id)).pop(); assert.equal(b.estado_nuevo, "en_espera"); assert.equal(b.motivo, "Muy caro para ese cliente"); assert.equal(b.usuario_id, ids["m@g.com"]);
    ok(await rpc("r@g.com", "registrar_reembolso_anticipo", [x.anticipo_id, "manual", "Efectivo devuelto en mostrador"]));
    assert.equal((await uno("select reembolso_estado from piefirme.anticipos where id = $1", [x.anticipo_id])).reembolso_estado, "manual");
    // se reanuda: vuelve a solicitado y se cobra un anticipo nuevo
    ok(await rpc("r@g.com", "pedido_reanudar", [id, PV.lab]));
    const y = await ped(id); assert.equal(y.estado, "solicitado"); assert.equal(y.anticipo_id, null); assert.equal(y.proveedor_id, PV.lab);
  });
  await t.test("el propietario rechaza con saldo a favor: el anticipo sigue pagado y ahora SÍ se puede aplicar a otra compra del cliente", async () => {
    const id = await nuevo();
    ok(await rpc("m@g.com", "pedido_rechazar", [id, "Cambió el modelo", "saldo_favor"]));
    const x = await ped(id);
    assert.equal(x.destino_anticipo, "saldo_favor");
    const a = await uno("select * from piefirme.anticipos where id = $1", [x.anticipo_id]);
    assert.equal(a.estado, "pagado");
    assert.equal((await uno("select aplicable_en_caja from piefirme.prp_anticipos where id = $1", [a.id])).aplicable_en_caja, true);
    ok(await rpc("r@g.com", "pedido_reanudar", [id, null]));
    assert.equal((await ped(id)).estado, "anticipo_cobrado", "con saldo a favor vuelve a autorización con el mismo anticipo");
    assert.ok((await ped(id)).cuenta_cobrar_id, "se reabre la cuenta por cobrar del saldo");
  });
  await t.test("el proveedor rechaza el pedido enviado: en espera, la orden de compra se cancela y el anticipo sigue el destino elegido", async () => {
    const id = await nuevo();
    ok(await rpc("m@g.com", "pedido_autorizar", [id, JSON.stringify(await costosDe(id))]));
    ok(await rpc("r@g.com", "pedido_enviar", [id, "whatsapp_simulado", null]));
    const oc = (await ped(id)).oc_id;
    falla(await rpc("p@g.com", "pedido_proveedor_rechaza", [id, "no lo fabrica", "saldo_favor"]), /permiso/);
    ok(await rpc("r@g.com", "pedido_proveedor_rechaza", [id, "No fabrican esa medida", "saldo_favor"]));
    const x = await ped(id);
    assert.equal(x.estado, "en_espera"); assert.equal(x.espera_origen, "proveedor"); assert.equal(x.oc_id, null); assert.equal(x.autorizado_por, null);
    const o = await uno("select estado, cancelada_motivo from piefirme.ordenes_compra where id = $1", [oc]);
    assert.equal(o.estado, "cancelada"); assert.match(o.cancelada_motivo, /No fabrican/);
    falla(await rpc("r@g.com", "pedido_proveedor_rechaza", [id, "otra vez", "devolucion"]), /enviado/);
  });
  await t.test("cancelar un pedido cobrado: motivo y destino del anticipo obligatorios; un pedido recibido ya no se cancela", async () => {
    const id = await nuevo();
    falla(await rpc("m@g.com", "pedido_cancelar", [id, "Se cancela", null]), /anticipo/);
    ok(await rpc("m@g.com", "pedido_cancelar", [id, "El cliente ya no lo quiere", "devolucion"]));
    const x = await ped(id); assert.equal(x.estado, "cancelado"); assert.equal(x.cancelado_motivo, "El cliente ya no lo quiere");
    assert.equal((await uno("select estado from piefirme.anticipos where id = $1", [x.anticipo_id])).estado, "reembolsado");
    falla(await intentar("update piefirme.pedidos_especiales set estado = 'solicitado' where id = $1", [id]), /transición/, "PF409");
  });
});

// ═════════════════════════════ 5 · COSTOS, BITÁCORA, RLS, RECORDATORIOS, ANON ═════════════════════════════
test("costos solo para administrador y supervisor: enmascarados para recepción y podología en tablas y vistas", async () => {
  const x = await hastaAutorizado(S.A, P.A, PV.calzado);
  const lin = await comoFilas("m@g.com", "select costo_unitario, costo_total from piefirme.prp_pedido_lineas where pedido_id = $1", [x.id]);
  assert.equal(Number(lin.rows[0].costo_unitario), COSTO);
  assert.equal(Number((await comoFilas("m@g.com", "select costo_estimado from piefirme.prp_pedidos_especiales where id = $1", [x.id])).rows[0].costo_estimado), COSTO);
  for (const quien of ["r@g.com", "p@g.com"]) {
    const l = await comoFilas(quien, "select descripcion, precio_unitario, costo_unitario, costo_total from piefirme.prp_pedido_lineas where pedido_id = $1", [x.id]);
    ok(l); assert.equal(l.rows.length, 1);
    assert.equal(l.rows[0].costo_unitario, null, `${quien}: el costo no se expone`); assert.equal(l.rows[0].costo_total, null); assert.equal(Number(l.rows[0].precio_unitario), 2000, "el precio de venta sí se ve");
    const p = await comoFilas(quien, "select costo_estimado, partidas_sin_costo from piefirme.prp_pedidos_especiales where id = $1", [x.id]);
    assert.equal(p.rows[0].costo_estimado, null);
    const base = await comoFilas(quien, "select * from piefirme.pedido_especial_costos where pedido_id = $1", [x.id]);
    assert.equal(base.rows.length, 0, "la tabla base de costos tampoco se lee");
    falla(await comoFilas(quien, "insert into piefirme.pedido_especial_costos (linea_id, organizacion_id, sede_id, pedido_id, costo_unitario) select id, organizacion_id, sede_id, pedido_id, 1 from piefirme.pedido_especial_lineas limit 1"), /permission denied|policy/);
    falla(await rpc(quien, "pedido_actualizar_costos", [x.id, "[]"]), /administración/, "42501");
  }
});

test("bitácora inmutable con usuario y hora de servidor; el pedido no se escribe directo con el token del usuario", async () => {
  const q = await crear("r@g.com", S.A, P.A, [linea(PV.calzado)]);
  const id = q.res.pedidos[0].id;
  const b = (await bit(id))[0];
  assert.equal(b.usuario_id, ids["r@g.com"]);
  const ahora = await uno("select extract(epoch from (now() - $1::timestamptz)) s", [b.en]);
  assert.ok(Math.abs(Number(ahora.s)) < 120, "la hora la pone el servidor");
  falla(await intentar("update piefirme.pedido_especial_bitacora set motivo = 'reescrita' where id = $1", [b.id]), /solo inserción/, "PF409");
  falla(await intentar("delete from piefirme.pedido_especial_bitacora where id = $1", [b.id]), /solo inserción/, "PF409");
  await como("m@g.com");
  falla(await intentar("update piefirme.pedido_especial_bitacora set motivo = 'reescrita'"), /permission denied|solo de inserción/);
  falla(await intentar("update piefirme.pedidos_especiales set total = 1 where id = $1", [id]), /permission denied/);
  falla(await intentar("delete from piefirme.pedidos_especiales where id = $1", [id]), /permission denied/);
  falla(await intentar("insert into piefirme.pedido_especial_bitacora (organizacion_id, sede_id, pedido_id, estado_nuevo) values ($1, $2, $3, 'entregado')", [ORG, S.A, id]), /permission denied/);
  await owner();
  assert.equal((await bit(id)).length, 1);
});

test("RLS por sucursal y rol: quien trabaja en otra sucursal no ve ni solicita; el supervisor solo lee; anon no ejecuta", async () => {
  const pedA = (await crear("r@g.com", S.A, P.A, [linea(PV.calzado)])).res.pedidos[0].id;
  const pedB = (await crear("r@g.com", S.B, P.B, [linea(PV.calzado)])).res.pedidos[0].id;
  await owner();
  await c.query("update piefirme.perfiles set sedes = $2 where id = $1", [ids["r@g.com"], [S.A]]);
  const vistos = (await comoFilas("r@g.com", "select id from piefirme.prp_pedidos_especiales where id = any($1)", [[pedA, pedB]])).rows.map((r) => r.id);
  assert.deepEqual(vistos, [pedA], "recepción de la sucursal A solo ve su sucursal");
  assert.equal((await comoFilas("r@g.com", "select id from piefirme.pedido_especial_lineas where pedido_id = $1", [pedB])).rows.length, 0);
  assert.equal((await comoFilas("r@g.com", "select id from piefirme.pedido_especial_bitacora where pedido_id = $1", [pedB])).rows.length, 0);
  falla(await crear("r@g.com", S.B, P.B, [linea(PV.calzado)]), /sucursal no permitida/, "42501");
  falla(await rpc("r@g.com", "pedido_cancelar", [pedB, "intento ajeno", null]), /otra sucursal/, "42501");
  falla(await rpc("r@g.com", "pedido_enviar", [pedB, "whatsapp_simulado", null]), /otra sucursal/, "42501");
  assert.equal((await comoFilas("m@g.com", "select id from piefirme.prp_pedidos_especiales where id = any($1)", [[pedA, pedB]])).rows.length, 2, "el propietario ve todas");
  // anon
  await owner();
  await c.query("set local role anon");
  for (const f of ["pedido_proveedores()", "pedido_recordatorios_generar()"]) falla(await intentar(`select piefirme.${f}`), /permission denied/);
  falla(await intentar("select * from piefirme.prp_pedidos_especiales"), /permission denied/);
  await owner();
  await c.query("update piefirme.perfiles set sedes = '{}' where id = $1", [ids["r@g.com"]]);
});

test("recordatorios: los pedidos con fecha vencida salen en la lista y dejan constancia una vez al día; el semáforo se pone en rojo", async () => {
  const x = await hastaAutorizado(S.A, P.A, PV.calzado);
  ok(await rpc("r@g.com", "pedido_enviar", [x.id, "whatsapp_simulado", null]));
  await owner();
  await c.query("update piefirme.pedidos_especiales set fecha_prometida = piefirme_app.hoy_org(organizacion_id) - 3 where id = $1", [x.id]);
  const v = (await uno("select semaforo, dias_retraso from piefirme.prp_pedidos_especiales where id = $1", [x.id]));
  assert.equal(v.semaforo, "rojo"); assert.equal(Number(v.dias_retraso), 3);
  const r1 = await rpc("r@g.com", "pedido_recordatorios_generar", []);
  ok(r1);
  const mio = r1.res.find((p) => p.id === x.id);
  assert.ok(mio, "el pedido vencido aparece"); assert.equal(mio.tipo, "entrega_vencida"); assert.equal(Number(mio.dias), 3);
  await rpc("r@g.com", "pedido_recordatorios_generar", []);
  assert.equal((await bit(x.id)).filter((b) => b.accion === "recordatorio").length, 1, "una constancia por día");
  falla(await rpc("p@g.com", "pedido_recordatorios_generar", []), /sin permiso/);
});

test("lista de proveedores para el formulario: sin datos fiscales ni bancarios; anticipo efectivo por proveedor", async () => {
  const r = await rpc("p@g.com", "pedido_proveedores", []);
  ok(r);
  const lab = r.res.find((p) => p.id === PV.pct30);
  assert.equal(Number(lab.anticipo_pct), 30); assert.equal(lab.whatsapp, true);
  assert.deepEqual(Object.keys(lab).sort(), ["anticipo_pct", "categoria", "id", "nombre", "tipos", "whatsapp"]);
  assert.equal(Number(r.res.find((p) => p.id === PV.calzado).anticipo_pct), 50);
});
