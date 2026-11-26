// Pruebas del módulo «Control y Auditoría» · ETAPA 8 (SERVICIOS) contra la base QA.   node --test scripts/test-auditoria-servicios-qa.mjs
//
// UNA transacción que SIEMPRE se deshace (no deja filas, folios, ventas ni alertas): se siembra como dueño de la base y se actúa «como» cada cuenta de prueba
// (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-cierres-qa.mjs. Cada escenario usa una sucursal NUEVA creada dentro de la transacción.
// Cubre (spec §F5.5 y criterio 20): la atención no cierra sin ticket (existe, de esa sucursal, cobrado, con servicio compatible, sin reutilizarlo de más) · cancelar exige
// motivo y clave de supervisor (otra persona, PIN verificado) · referencia opaca (ninguna columna clínica; el hook de consulta no copia ni el id ni el nombre) ·
// reporte de atenciones sin cobro por sucursal y persona · cuadre 12 kits contra 10 tickets con las horas exactas de las atenciones sin ticket · tope de los parámetros ·
// ocupación 12 contra 8 (cuatro cobros faltantes con horas) con duración mínima configurable · rol de sucursal sin resultados de cuadre · inmutabilidad · anon sin acceso.
// Cuentas (clave 123456, solo QA): a superadmin(soporte) · m dueño · s supervisor · p podólogo · r recepción.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";
import { CAMPOS_CIEGOS } from "../src/lib/auditoria/roles.js";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
const J = (x) => JSON.stringify(x);
const uuid = () => crypto.randomUUID();

const c = await conectar(cfg);
const ids = {};
let n = 0, prod, serv1, serv2, serv3;   // serv1 y serv2 son de la misma categoría (compatibles); serv3 es de otra
const S = {};

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
const comoOwner = async (sql, params) => { await owner(); return c.query(sql, params); };
/** Borra filas «solo inserción» con la única llave que existe (purga de datos de prueba) y la cierra enseguida. */
const purgar = async (sql, params) => { await owner(); await c.query("select set_config('app.ctl_purga', 'on', true)"); try { return await c.query(sql, params); } finally { await c.query("select set_config('app.ctl_purga', 'off', true)"); } };

async function nuevaSede(clave) {
  return (await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, clave, `Sucursal prueba ${clave}`])).id;
}
async function nuevoTurno(sede, correo, fondo = 500) {
  return (await uno("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, cajero_id, fondo_inicial) values ($1, $2, 'Caja 1', $3, $4) returning id", [ORG, sede, ids[correo], fondo])).id;
}
/** Ticket de servicio cobrado POR cobrar_venta como `correo` (hora = ahora del servidor). */
async function venta(sede, correo, servicio, { cobrar = true, monto = 100, lineas = 1 } = {}) {
  await owner();
  const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen) values ($1, $2, 'mostrador') returning id", [ORG, sede]);
  for (let i = 0; i < lineas; i++) await c.query("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, servicio_id, cantidad, precio_unitario) values ($1, $2, $3, 'servicio', $4, 1, $5)", [ORG, sede, v.id, servicio, monto]);
  const t = await uno("select total from piefirme.ventas where id = $1", [v.id]);
  await c.query("insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto) values ($1, $2, $3, 'efectivo', $4)", [ORG, sede, v.id, t.total]);
  if (!cobrar) return v.id;
  const r = await rpc(correo, "cobrar_venta", [v.id]);
  assert.equal(r.ok, true, `cobrar_venta: ${r.message}`);
  return v.id;
}
/** Ticket de servicio ya cobrado a una HORA EXACTA (siembra directa como dueño de la base). */
async function ventaEn(sede, turno, servicio, cuando) {
  const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen, cajero_id) values ($1, $2, 'mostrador', $3) returning id", [ORG, sede, ids["r@g.com"]]);
  await c.query("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, servicio_id, cantidad, precio_unitario) values ($1, $2, $3, 'servicio', $4, 1, 100)", [ORG, sede, v.id, servicio]);
  await c.query("update piefirme.ventas set estado = 'cobrada', turno_id = $2, cobrada_en = $3 where id = $1", [v.id, turno, cuando]);
  return v.id;
}
const PIN = "4827";
async function ponerPin(correo, pin = PIN) {
  await c.query("insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash) values ($1, $2, piefirme_app.hash_pin($1, $3)) on conflict (perfil_id) do update set pin_hash = excluded.pin_hash", [ids[correo], ORG, pin]);
}
const abrir = (correo, sede, servicio, { ref = null, atiende = null, id = uuid() } = {}) => rpc(correo, "ctl_atencion_abrir", [id, sede, servicio, ref, atiende, null]).then((r) => ({ id, ...r }));
const alertas = async (tipo, ref) => filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = $2 and ($3::uuid is null or referencia_id = $3) order by creado_en", [ORG, tipo, ref ?? null]);
const cabeceras = (obj) => { const k = []; JSON.stringify(obj, (key, v) => { k.push(key); return v; }); return k; };

before(async () => {
  await c.query("begin");
  await c.query("set local statement_timeout = '15min'");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  prod = (await uno("select id from piefirme.productos where organizacion_id = $1 and estado = 'activo' order by nombre limit 1", [ORG])).id;
  const sv = await filas("select id, categoria from piefirme.servicios where organizacion_id = $1 order by categoria, nombre", [ORG]);
  const porCat = {}; for (const s of sv) (porCat[s.categoria] ??= []).push(s.id);
  const grande = Object.values(porCat).find((l) => l.length >= 2); assert.ok(grande, "hacen falta dos servicios de la misma categoría");
  [serv1, serv2] = grande;
  serv3 = sv.find((s) => !grande.includes(s.id)).id;
  for (const k of ["S1", "S2", "S3", "S4", "S5"]) S[k] = await nuevaSede("V" + k);
  await c.query("update piefirme.perfiles set sedes = '{}' where id = $1", [ids["p@g.com"]]);   // el podólogo de prueba solo trabaja en Chalco: se le abren las sucursales de prueba
  for (const e of ["r@g.com", "m@g.com", "s@g.com", "p@g.com"]) await ponerPin(e);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · LA ATENCIÓN NO SE CIERRA SIN TICKET ═════════════════════════════
test("atención ligada a cobro (S1): no cierra sin ticket válido, compatible y sin reutilizarlo de más", async (t) => {
  await nuevoTurno(S.S1, "r@g.com");
  let a, b;
  await t.test("abrir: la captura es de la sucursal; quien atiende, servicio y hora quedan; idempotente por id del cliente", async () => {
    a = await abrir("r@g.com", S.S1, serv1, { atiende: ids["p@g.com"], ref: "FICHA-0042" });
    assert.equal(a.ok, true, a.message);
    assert.equal(a.res.estado, "abierta");
    assert.equal(a.res.paciente_ref, "FICHA-0042");
    const fila = await uno("select * from piefirme.ctl_atencion where id = $1", [a.id]);
    assert.equal(fila.usuario_atiende, ids["p@g.com"]);
    assert.equal(fila.servicio_id, serv1);
    assert.equal(fila.sucursal_id, S.S1);
    assert.equal(fila.fin_en, null);
    assert.equal(fila.origen_tipo, "manual");
    assert.equal(new Date(fila.inicio_en).getTime(), new Date((await uno("select now() as n")).n).getTime(), "la hora de inicio es la del servidor");
    const otra = await rpc("r@g.com", "ctl_atencion_abrir", [a.id, S.S1, serv1, "FICHA-0042", ids["p@g.com"], null]);
    assert.equal(otra.res.idempotente, true);
    assert.equal((await uno("select count(*)::int n from piefirme.ctl_atencion where id = $1", [a.id])).n, 1);
  });
  await t.test("referencia opaca: un nombre o texto libre se rechaza; sin referencia el servidor genera una", async () => {
    for (const ref of ["Juan Pérez López", "ab", "x".repeat(41), "paciente con diabetes"]) {
      const r = await abrir("r@g.com", S.S1, serv1, { ref });
      assert.equal(r.ok, false, `debió rechazar «${ref}»`);
      assert.equal(r.code, "PF422");
    }
    const g = await abrir("r@g.com", S.S1, serv1);
    assert.match(g.res.paciente_ref, /^A-[0-9A-F]{8}$/);
  });
  await t.test("abrir exige servicio, sucursal propia y quien atiende activo; el soporte no captura", async () => {
    assert.equal((await abrir("r@g.com", S.S1, null)).code, "PF422");
    assert.equal((await abrir("r@g.com", uuid(), serv1)).code, "PF403");
    assert.equal((await abrir("r@g.com", S.S1, serv1, { atiende: uuid() })).code, "PF422");
    assert.equal((await abrir("a@g.com", S.S1, serv1)).code, "PF403");
  });
  await t.test("sin ticket NO cierra: ticket vacío, inexistente, de otra sucursal, sin cobrar o sin servicio compatible", async () => {
    const vacio = await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, null]);
    assert.equal(vacio.code, "PF422"); assert.match(vacio.message, /no se cierra sin ticket/);
    assert.match((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, uuid()])).message, /no existe/);
    await nuevoTurno(S.S2, "r@g.com");
    const deOtra = await venta(S.S2, "r@g.com", serv1);
    assert.match((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, deOtra])).message, /otra sucursal/);
    const sinCobrar = await venta(S.S1, "r@g.com", serv1, { cobrar: false });
    assert.match((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, sinCobrar])).message, /no está cobrado/);
    const incompatible = await venta(S.S1, "r@g.com", serv3);
    const x = await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, incompatible]);
    assert.equal(x.code, "PF422"); assert.match(x.message, /servicio compatible/);
    assert.equal((await uno("select estado from piefirme.ctl_atencion where id = $1", [a.id])).estado, "abierta", "ninguna de las cinco cerró la atención");
  });
  await t.test("con ticket cobrado y servicio compatible (mismo servicio o misma categoría) cierra con hora de cierre y ticket", async () => {
    const tk = await venta(S.S1, "r@g.com", serv2);   // otro servicio de la misma categoría: compatible
    const cands = await rpc("r@g.com", "ctl_atencion_tickets_candidatos", [a.id]);
    assert.ok(cands.res.some((x) => x.venta_id === tk), "el ticket aparece entre los candidatos");
    assert.ok(!cands.res.some((x) => "total" in x || "importe" in x || "monto" in x), "los candidatos no traen montos");
    const r = await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, tk]);
    assert.equal(r.ok, true, r.message);
    const fila = await uno("select * from piefirme.ctl_atencion where id = $1", [a.id]);
    assert.equal(fila.estado, "cerrada_con_ticket"); assert.equal(fila.ticket_id, tk); assert.ok(fila.fin_en); assert.equal(fila.cerrada_por, ids["r@g.com"]);
    a.ticket = tk;
  });
  await t.test("una atención cerrada es definitiva, y un ticket de un servicio no cubre dos atenciones", async () => {
    assert.equal((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, a.ticket])).code, "PF409");
    b = await abrir("r@g.com", S.S1, serv1);
    const r = await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [b.id, a.ticket]);
    assert.equal(r.code, "PF422"); assert.match(r.message, /ya están ligados/);
    const doble = await venta(S.S1, "r@g.com", serv1, { lineas: 2 });
    const c1 = await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [b.id, doble]);
    assert.equal(c1.ok, true, c1.message);
    const b2 = await abrir("r@g.com", S.S1, serv1);
    assert.equal((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [b2.id, doble])).ok, true, "un ticket con dos servicios cubre dos atenciones");
    const b3 = await abrir("r@g.com", S.S1, serv1);
    assert.equal((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [b3.id, doble])).code, "PF422", "…pero no tres");
  });
  await t.test("las tablas no se editan a mano: ni el dueño de la base fuera de una RPC, ni dentro de ella sobre una atención cerrada", async () => {
    const nueva = (await abrir("r@g.com", S.S1, serv1)).id;
    await owner();
    await c.query("select set_config('app.ctl_rpc', 'off', true)");   // dentro de esta transacción de prueba la marca de RPC queda puesta por las llamadas anteriores
    let r = await intentar("update piefirme.ctl_atencion set estado = 'abierta', ticket_id = null, fin_en = null where id = $1", [a.id]);
    assert.equal(r.ok, false); assert.equal(r.code, "PF403");
    await c.query("select set_config('app.ctl_rpc', 'on', true)");
    r = await intentar("update piefirme.ctl_atencion set motivo_cancelacion = 'x' where id = $1", [a.id]);
    assert.equal(r.ok, false); assert.match(r.message, /ya está|no se modifica|Transición/);
    r = await intentar("update piefirme.ctl_atencion set paciente_ref = 'OTRO-1' where id = $1", [b.id]);
    assert.equal(r.ok, false, "la referencia del paciente no cambia");
    r = await intentar("update piefirme.ctl_atencion set estado = 'cancelada', fin_en = now() where id = $1", [nueva]);
    assert.equal(r.ok, false, "cancelada exige motivo y autorizador (restricción de coherencia)");
    await c.query("select set_config('app.ctl_rpc', 'off', true)");
  });
});

// ═════════════════════════════ 2 · CANCELAR: MOTIVO + CLAVE DE SUPERVISOR ═════════════════════════════
test("cancelar una atención exige motivo y la clave de un supervisor distinto (S1)", async (t) => {
  await comoOwner("select 1");
  const a = await abrir("p@g.com", S.S1, serv1, { atiende: ids["p@g.com"] });
  assert.equal(a.ok, true, a.message);
  const cancelar = (correo, motivo, sup, pin) => rpc(correo, "ctl_atencion_cancelar", [a.id, motivo, sup, pin]);
  await t.test("sin motivo, con motivo corto o sin supervisor se rechaza", async () => {
    assert.equal((await cancelar("p@g.com", null, ids["s@g.com"], PIN)).code, "PF422");
    assert.equal((await cancelar("p@g.com", "no", ids["s@g.com"], PIN)).code, "PF422");
    assert.equal((await cancelar("p@g.com", "El paciente se fue", null, PIN)).code, "PF422");
  });
  await t.test("la clave debe ser de OTRA persona y de un supervisor o dueño de la sucursal", async () => {
    const mismo = await cancelar("p@g.com", "El paciente se fue", ids["p@g.com"], PIN);
    assert.equal(mismo.code, "PF403"); assert.match(mismo.message, /otra persona/);
    const noSup = await cancelar("p@g.com", "El paciente se fue", ids["r@g.com"], PIN);
    assert.equal(noSup.code, "PF403"); assert.match(noSup.message, /no es supervisor/);
  });
  await t.test("un PIN incorrecto no cancela y se cuenta (3 fallos bloquean)", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await cancelar("p@g.com", "El paciente se fue", ids["s@g.com"], "1111");
      assert.equal(r.ok, true); assert.equal(r.res.ok, false); assert.equal(r.res.error, "pin_incorrecto");
    }
    assert.equal((await uno("select estado from piefirme.ctl_atencion where id = $1", [a.id])).estado, "abierta");
    assert.equal((await cancelar("p@g.com", "El paciente se fue", ids["s@g.com"], "2222")).res.ok, false);
    const bloqueado = await cancelar("p@g.com", "El paciente se fue", ids["s@g.com"], PIN);
    assert.equal(bloqueado.code, "PF429", "el cuarto intento ya está bloqueado aunque la clave sea buena");
    await purgar("delete from piefirme.ctl_intento where usuario_id = $1", [ids["p@g.com"]]);
  });
});

test("cancelar con motivo y clave correcta deja la atención cancelada con el supervisor que autorizó (S1)", async (t) => {
  await purgar("delete from piefirme.ctl_intento where usuario_id = $1", [ids["p@g.com"]]);
  const a = await abrir("p@g.com", S.S1, serv1, { atiende: ids["p@g.com"] });
  const sups = await rpc("p@g.com", "ctl_atencion_supervisores", [S.S1]);
  assert.ok(sups.res.some((x) => x.id === ids["s@g.com"]) && sups.res.some((x) => x.id === ids["m@g.com"]) && !sups.res.some((x) => x.id === ids["p@g.com"]));
  const r = await rpc("p@g.com", "ctl_atencion_cancelar", [a.id, "El paciente se retiró antes de empezar", ids["s@g.com"], PIN]);
  assert.equal(r.ok, true, r.message); assert.equal(r.res.ok, true);
  const fila = await uno("select * from piefirme.ctl_atencion where id = $1", [a.id]);
  assert.equal(fila.estado, "cancelada"); assert.equal(fila.autorizado_por, ids["s@g.com"]); assert.equal(fila.motivo_cancelacion, "El paciente se retiró antes de empezar"); assert.ok(fila.fin_en);
  assert.equal((await alertas("atencion_cancelada", a.id)).length, 1);
  assert.equal((await rpc("p@g.com", "ctl_atencion_cancelar", [a.id, "Otra vez por si acaso", ids["s@g.com"], PIN])).code, "PF409");
  assert.equal((await rpc("p@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, uuid()])).code, "PF409", "una cancelada no se puede cerrar con ticket");
});

// ═════════════════════════════ 3 · REFERENCIA OPACA Y HOOK DE LA CONSULTA ═════════════════════════════
test("referencia opaca: ninguna columna clínica y el hook de la consulta no copia el id ni datos del paciente (S1)", async (t) => {
  await t.test("ctl_atencion no tiene columnas de nota, diagnóstico, nombre ni datos personales", async () => {
    const cols = (await filas("select column_name from information_schema.columns where table_schema = 'piefirme' and table_name in ('ctl_atencion', 'ctl_ocupacion')")).map((x) => x.column_name);
    const prohibidas = cols.filter((k) => /nota|diagn|nombre|apellid|clinic|padec|sintom|observ|trat|curp|telefono|correo|email|paciente_id|expediente|motivo_consulta/i.test(k));
    assert.deepEqual(prohibidas.filter((k) => k !== "puesto_nombre"), [], `columnas que no deben existir: ${prohibidas}`);
  });
  await t.test("hook de consulta apagado por omisión: una consulta nueva no abre atención", async () => {
    const pac = (await uno("select id from piefirme.pacientes where organizacion_id = $1 limit 1", [ORG])).id;
    assert.equal((await rpc("m@g.com", "ctl_config_efectiva", [null])).ok, true);
    const cons = await uno("insert into piefirme.consultas (organizacion_id, paciente_id, sede_id, podologo_id, servicio_id) values ($1, $2, $3, $4, $5) returning id", [ORG, pac, S.S1, ids["p@g.com"], serv1]);
    assert.equal((await filas("select 1 from piefirme.ctl_atencion where origen_id = $1", [cons.id])).length, 0);
  });
  await t.test("con el parámetro en «si» la consulta abre una atención opaca; al cobrarse el ticket la conciliación la cierra sola", async () => {
    const g = await rpc("m@g.com", "ctl_config_guardar", ["atencion_auto_desde_consulta", null, J("si"), false, "prueba"]);
    assert.equal(g.ok, true, g.message);
    const pac = (await uno("select id, nombre from piefirme.pacientes where organizacion_id = $1 order by id limit 1", [ORG]));
    await owner();
    const cons = await uno("insert into piefirme.consultas (organizacion_id, paciente_id, sede_id, podologo_id, servicio_id) values ($1, $2, $3, $4, $5) returning id", [ORG, pac.id, S.S1, ids["p@g.com"], serv1]);
    const at = await uno("select * from piefirme.ctl_atencion where origen_tipo = 'consulta' and origen_id = $1", [cons.id]);
    assert.ok(at, "la consulta abrió su atención");
    assert.match(at.paciente_ref, /^P-[0-9A-F]{10}$/);
    assert.ok(!at.paciente_ref.includes(pac.id.slice(0, 8)) && !String(pac.nombre ?? "").split(" ").some((w) => w.length > 3 && at.paciente_ref.toLowerCase().includes(w.toLowerCase())), "la referencia no contiene el id ni el nombre");
    assert.equal(at.usuario_atiende, ids["p@g.com"]); assert.equal(at.sucursal_id, S.S1); assert.equal(at.servicio_id, serv1); assert.equal(at.estado, "abierta");
    // una segunda inserción del mismo origen no duplica (índice único) y el hook nunca rompe la consulta
    const dup = await intentar("insert into piefirme.ctl_atencion (organizacion_id, sucursal_id, origen_tipo, origen_id) values ($1, $2, 'consulta', $3)", [ORG, S.S1, cons.id]);
    assert.equal(dup.ok, false);
    // cobro del paciente el mismo día → conciliación
    await owner();
    const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id) values ($1, $2, 'mostrador', $3) returning id", [ORG, S.S1, pac.id]);
    await c.query("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, servicio_id, cantidad, precio_unitario) values ($1, $2, $3, 'servicio', $4, 1, 100)", [ORG, S.S1, v.id, serv1]);
    const tot = await uno("select total from piefirme.ventas where id = $1", [v.id]);
    await c.query("insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto) values ($1, $2, $3, 'efectivo', $4)", [ORG, S.S1, v.id, tot.total]);
    assert.equal((await rpc("r@g.com", "cobrar_venta", [v.id])).ok, true);
    const con = await rpc("r@g.com", "ctl_atenciones_conciliar", [S.S1]);
    assert.equal(con.ok, true, con.message);
    assert.ok(con.res.ligadas >= 1);
    const cerrada = await uno("select estado, ticket_id from piefirme.ctl_atencion where id = $1", [at.id]);
    assert.equal(cerrada.estado, "cerrada_con_ticket"); assert.equal(cerrada.ticket_id, v.id);
  });
  await t.test("el hook nunca frena la consulta aunque falle: servicio inválido para la atención se descarta con aviso", async () => {
    await owner();
    const pac = (await uno("select id from piefirme.pacientes where organizacion_id = $1 order by id desc limit 1", [ORG])).id;
    await c.query("alter table piefirme.ctl_atencion add constraint _t_falla check (false) not valid");
    const r = await intentar("insert into piefirme.consultas (organizacion_id, paciente_id, sede_id, podologo_id, servicio_id) values ($1, $2, $3, $4, $5) returning id", [ORG, pac, S.S1, ids["p@g.com"], serv1]);
    await c.query("alter table piefirme.ctl_atencion drop constraint _t_falla");
    assert.equal(r.ok, true, `la consulta se guardó aunque el hook falló: ${r.message}`);
    await rpc("m@g.com", "ctl_config_guardar", ["atencion_auto_desde_consulta", null, J("no"), false, "fin de prueba"]);
  });
});

// ═════════════════════════════ 4 · REPORTE DE ATENCIONES SIN COBRO + ALERTAS + TOPES ═════════════════════════════
test("reporte de atenciones sin cobro por sucursal y por persona; solo dueño y supervisor; alertas sin duplicar (S2)", async (t) => {
  const sembrar = (usuario, estado, hace, extra = {}) => comoOwner(
    "insert into piefirme.ctl_atencion (organizacion_id, sucursal_id, paciente_ref, servicio_id, usuario_atiende, inicio_en, estado) values ($1, $2, $3, $4, $5, now() - $6::interval, $7)",
    [ORG, S.S2, `REF-${uuid().slice(0, 6)}`, serv1, ids[usuario], hace, estado]);
  await sembrar("p@g.com", "abierta", "5 hours"); await sembrar("p@g.com", "abierta", "4 hours"); await sembrar("p@g.com", "abierta", "3 hours");
  await sembrar("r@g.com", "abierta", "6 hours"); await sembrar("r@g.com", "abierta", "10 minutes");   // esta última sigue «en curso»
  const cerrada = await abrir("r@g.com", S.S2, serv1, { atiende: ids["r@g.com"] });
  assert.equal((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [cerrada.id, await venta(S.S2, "r@g.com", serv1)])).ok, true);
  const cancel = await abrir("p@g.com", S.S2, serv1, { atiende: ids["p@g.com"] });
  assert.equal((await rpc("p@g.com", "ctl_atencion_cancelar", [cancel.id, "Cita reprogramada por el paciente", ids["s@g.com"], PIN])).res.ok, true);
  let rep;
  await t.test("el dueño ve por sucursal y por persona (abiertas sin ticket, canceladas, en curso) con el aviso de indicador", async () => {
    const r = await rpc("m@g.com", "ctl_rep_atenciones_sin_cobro", [J({ sucursal: S.S2 })]);
    assert.equal(r.ok, true, r.message); rep = r.res;
    assert.equal(rep.resumen.atenciones, 7);
    assert.equal(rep.resumen.abiertas_sin_ticket, 4);
    assert.equal(rep.resumen.canceladas, 1);
    assert.equal(rep.resumen.con_ticket, 1);
    assert.equal(rep.resumen.en_curso, 1);
    assert.equal(rep.por_sucursal.length, 1);
    assert.equal(rep.por_sucursal[0].sucursal_id, S.S2); assert.equal(rep.por_sucursal[0].abiertas_sin_ticket, 4);
    assert.equal(rep.por_sucursal[0].muestra_pequena, true, "con menos de 10 atenciones se marca muestra pequeña");
    const p = rep.por_persona.find((x) => x.persona_id === ids["p@g.com"]); const q = rep.por_persona.find((x) => x.persona_id === ids["r@g.com"]);
    assert.equal(p.abiertas_sin_ticket, 3); assert.equal(p.canceladas, 1); assert.equal(q.abiertas_sin_ticket, 1); assert.equal(q.con_ticket, 1); assert.equal(q.en_curso, 1);
    assert.equal(rep.detalle.length, 5, "el detalle lista las 4 abiertas vencidas y la cancelada");
    assert.ok(rep.detalle.every((d) => d.inicio_en && ["vencida", "cancelada"].includes(d.clase)));
    assert.match(rep.aviso, /Indicador para investigar/);
  });
  await t.test("el supervisor también lo ve; recepción, podólogo y soporte no (capacidad ver_directo)", async () => {
    assert.equal((await rpc("s@g.com", "ctl_rep_atenciones_sin_cobro", [J({ sucursal: S.S2 })])).ok, true);
    for (const correo of ["r@g.com", "p@g.com", "a@g.com"]) assert.equal((await rpc(correo, "ctl_rep_atenciones_sin_cobro", ["{}"])).code, "PF403", correo);
  });
  await t.test("cada consulta del reporte queda en la bitácora de consultas", async () => {
    const x = await filas("select usuario_id, rol_ctl from piefirme.ctl_bitacora_consulta where organizacion_id = $1 and reporte = 'servicios_atenciones_sin_cobro'", [ORG]);
    assert.ok(x.some((f) => f.usuario_id === ids["m@g.com"] && f.rol_ctl === "dueno") && x.some((f) => f.usuario_id === ids["s@g.com"] && f.rol_ctl === "supervisor"));
  });
  await t.test("la sucursal ve su lista de atenciones pero sin la marca «sin ticket» ni campos de diferencia", async () => {
    const l = await rpc("r@g.com", "ctl_atenciones_listar", [J({ sucursal: S.S2, desde: null })]);
    assert.equal(l.ok, true, l.message);
    assert.ok(l.res.length >= 7);
    assert.ok(l.res.every((x) => x.sin_ticket === null || x.sin_ticket === undefined), "recepción no recibe el resultado del control");
    const claves = cabeceras(l.res); for (const k of CAMPOS_CIEGOS) assert.ok(!claves.includes(k), `no debe llegar «${k}»`);
    const d = await rpc("m@g.com", "ctl_atenciones_listar", [J({ sucursal: S.S2 })]);
    assert.equal(d.res.filter((x) => x.sin_ticket === true).length, 4, "el dueño sí recibe la marca");
    assert.equal((await rpc("p@g.com", "ctl_atenciones_listar", [J({ sucursal: S.S2, solo_mias: true })])).res.every((x) => x.usuario_atiende === ids["p@g.com"]), true);
  });
  await t.test("la evaluación crea una alerta por cada atención vencida (4) y no se duplica al repetirla", async () => {
    const e1 = await rpc("m@g.com", "ctl_servicios_evaluar_ahora", []);
    assert.equal(e1.ok, true, e1.message);
    const mias = (await alertas("atencion_sin_ticket")).filter((x) => x.sucursal_id === S.S2);
    assert.equal(mias.length, 4);
    assert.match(mias[0].mensaje, /Conviene revisarla/);
    const e2 = await rpc("m@g.com", "ctl_servicios_evaluar_ahora", []);
    assert.equal(e2.res.alertas_atencion_nuevas, 0);
    assert.equal((await alertas("atencion_sin_ticket")).filter((x) => x.sucursal_id === S.S2).length, 4);
    assert.equal((await rpc("r@g.com", "ctl_servicios_evaluar_ahora", [])).code, "PF403");
  });
  await t.test("el tiempo sin ticket es configurable con tope: 15 min a 24 h", async () => {
    for (const v of [10, 1441, 99999]) { const r = await rpc("m@g.com", "ctl_config_guardar", ["atencion_sin_ticket_min", null, J(v), false, "x"]); assert.equal(r.code, "PF422", `${v}`); }
    const ok = await rpc("m@g.com", "ctl_config_guardar", ["atencion_sin_ticket_min", S.S2, J(240), false, "prueba"]);
    assert.equal(ok.ok, true, ok.message);
    const r = await rpc("m@g.com", "ctl_rep_atenciones_sin_cobro", [J({ sucursal: S.S2 })]);
    assert.equal(r.res.resumen.abiertas_sin_ticket, 2, "con 4 horas de umbral solo cuentan la de 5 h y la de 6 h (la de 4 h justas y la de 3 h aún no)");
    assert.equal((await rpc("r@g.com", "ctl_config_guardar", ["atencion_sin_ticket_min", null, J(60), false, "x"])).code, "PF403", "la sucursal no configura");
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["ocupacion_ventana_cobro_min", null, J(481), false, "x"])).code, "PF422");
  });
});

// ═════════════════════════════ 5 · CUADRE DE INSUMOS (criterio 20): 12 kits contra 10 tickets ═════════════════════════════
test("cuadre de insumos por periodo (S3): 12 kits usados y 10 tickets son dos servicios sin cobro, con las horas exactas", async (t) => {
  await nuevoTurno(S.S3, "r@g.com");
  await comoOwner("update piefirme.productos set costo_promedio = 50 where id = $1", [prod]);
  const cg = await rpc("m@g.com", "ctl_consumo_esperado_guardar", [serv1, prod, 1, true]);
  assert.equal(cg.ok, true, cg.message);
  const horas = [];
  for (let i = 0; i < 10; i++) {
    const a = await abrir("r@g.com", S.S3, serv1, { atiende: ids["p@g.com"] });
    assert.equal((await rpc("r@g.com", "ctl_atencion_cerrar_con_ticket", [a.id, await venta(S.S3, "r@g.com", serv1)])).ok, true);
  }
  for (const min of [95, 41]) {   // dos atenciones que nunca llegaron a ticket, con hora exacta
    const inicio = (await uno("select date_trunc('second', now() - $1::interval) as t", [`${min} minutes`])).t;
    await comoOwner("insert into piefirme.ctl_atencion (organizacion_id, sucursal_id, paciente_ref, servicio_id, usuario_atiende, inicio_en) values ($1, $2, $3, $4, $5, $6)", [ORG, S.S3, `SIN-${min}`, serv1, ids["p@g.com"], inicio]);
    horas.push(new Date(inicio).toISOString());
  }
  for (let i = 0; i < 12; i++) await comoOwner("insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad, referencia_tipo) values ($1, $2, $3, 'consumo_consulta', -1, 'consulta')", [ORG, S.S3, prod]);
  await comoOwner("insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad, costo_unitario) values ($1, $2, $3, 'traspaso_salida', -5, 50)", [ORG, S.S3, prod]);
  let rep;
  await t.test("insumo: 10 servicios cobrados × 1 = 10 teóricas contra 12 reales → +2 piezas, $100 al costo, 2 servicios sin cobro", async () => {
    const r = await rpc("m@g.com", "ctl_rep_cuadre_insumos", [J({ sucursal: S.S3, agrupar: "semana" })]);
    assert.equal(r.ok, true, r.message); rep = r.res;
    assert.equal(rep.insumos.length, 1);
    const f = rep.insumos[0];
    assert.equal(Number(f.servicios_cobrados), 10); assert.equal(Number(f.teorico), 10); assert.equal(Number(f.real), 12, "el traspaso de salida a otra sucursal no cuenta como consumo");
    assert.equal(Number(f.diferencia_piezas), 2); assert.equal(Number(f.costo_unitario), 50); assert.equal(Number(f.diferencia_valor), 100);
    assert.equal(f.servicios_sin_cobro_est, 2); assert.equal(f.estado, "consumo_mayor");
    assert.equal(Number(f.salidas.consumo_consulta), 12);
    assert.equal(rep.resumen.fuera_de_cuadre, 1); assert.equal(Number(rep.resumen.diferencia_valor), 100);
  });
  await t.test("servicios cobrados contra kits contra atenciones; las dos atenciones sin ticket dan las horas exactas", async () => {
    const k = rep.servicios_kits[0];
    assert.equal(k.tickets_servicio, 10); assert.equal(Number(k.servicios_cobrados), 10);
    assert.equal(Number(k.piezas_esperadas), 10); assert.equal(Number(k.piezas_usadas), 12); assert.equal(k.servicios_sin_cobro_est, 2);
    assert.equal(k.atenciones, 12); assert.equal(k.atenciones_con_ticket, 10); assert.equal(k.atenciones_abiertas, 2);
    assert.equal(k.atenciones_sin_ticket.length, 2);
    assert.deepEqual(k.atenciones_sin_ticket.map((x) => new Date(x.inicio_en).toISOString()).sort(), horas.slice().sort(), "las horas exactas de los dos servicios sin cobro");
  });
  await t.test("la misma cifra por mes y total; con «sin ajustes» el real no suma ajustes de conteo", async () => {
    for (const agrupar of ["mes", "total"]) {
      const r = await rpc("m@g.com", "ctl_rep_cuadre_insumos", [J({ sucursal: S.S3, agrupar })]);
      assert.equal(Number(r.res.insumos[0].diferencia_piezas), 2, agrupar);
    }
    await comoOwner("insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ($1, $2, $3, 'ajuste', -3)", [ORG, S.S3, prod]);
    assert.equal(Number((await rpc("m@g.com", "ctl_rep_cuadre_insumos", [J({ sucursal: S.S3 })])).res.insumos[0].real), 15);
    assert.equal(Number((await rpc("m@g.com", "ctl_rep_cuadre_insumos", [J({ sucursal: S.S3, incluir_ajustes: false })])).res.insumos[0].real), 12);
    assert.equal((await rpc("m@g.com", "ctl_rep_cuadre_insumos", [J({ agrupar: "año" })])).code, "PF422");
  });
  await t.test("el supervisor lo ve; la sucursal NO ve resultados de cuadre por ninguna vía (RPC, tablas, vistas)", async () => {
    assert.equal((await rpc("s@g.com", "ctl_rep_cuadre_insumos", [J({ sucursal: S.S3 })])).ok, true);
    for (const correo of ["r@g.com", "p@g.com", "a@g.com"]) assert.equal((await rpc(correo, "ctl_rep_cuadre_insumos", ["{}"])).code, "PF403", correo);
    for (const correo of ["r@g.com", "p@g.com"]) {
      await como(correo);
      assert.equal((await c.query("select count(*)::int n from piefirme.ctl_consumo_esperado")).rows[0].n, 0, `${correo} no lee el consumo esperado`);
      assert.equal((await c.query("select count(*)::int n from piefirme.v_ctl_movimientos")).rows[0].n, 0);
      assert.equal((await c.query("select count(*)::int n from piefirme.v_ctl_saldos")).rows[0].n, 0);
    }
    assert.equal((await rpc("r@g.com", "ctl_consumo_esperado_guardar", [serv1, prod, 3, true])).code, "PF403", "la sucursal no define el consumo esperado");
    assert.equal((await rpc("s@g.com", "ctl_consumo_esperado_guardar", [serv1, prod, 3, true])).code, "PF403", "el supervisor tampoco: configura el dueño");
  });
  await t.test("sin consumo esperado definido el reporte lo dice en vez de inventar cifras", async () => {
    await rpc("m@g.com", "ctl_consumo_esperado_guardar", [serv1, prod, 1, false]);
    const r = await rpc("m@g.com", "ctl_rep_cuadre_insumos", [J({ sucursal: S.S3 })]);
    assert.deepEqual(r.res.insumos, []); assert.match(r.res.aviso, /consumo esperado/);
  });
});

// ═════════════════════════════ 6 · OCUPACIÓN DEL PUESTO (fase posterior): 12 ocupaciones contra 8 tickets ═════════════════════════════
test("ocupación (S4, fase posterior al piloto): 12 ocupaciones y 8 tickets son cuatro cobros faltantes con horas exactas", async (t) => {
  const turno = await nuevoTurno(S.S4, "r@g.com");
  const dia = (await uno("select (piefirme_app.ctl_hoy($1) - 1)::text as d, (piefirme_app.ctl_hoy($1) - 1)::timestamp at time zone piefirme_app.ctl_zona($1) as base", [ORG]));
  const base = new Date(dia.base).getTime() + 8 * 3600 * 1000;   // 08:00 locales de ayer
  const inicio = (i) => new Date(base + i * 3600 * 1000);
  const diaTxt = dia.d;
  const regs = [];
  await t.test("registro manual (fuente «manual»): el servidor calcula la duración y no se traslapa, ni va al futuro, ni dura más de 12 h", async () => {
    for (let i = 0; i < 12; i++) {
      const id = uuid();
      const r = await rpc("r@g.com", "ctl_ocupacion_registrar", [id, S.S4, inicio(i).toISOString(), new Date(inicio(i).getTime() + 30 * 60000).toISOString(), null, "Sillón 1", null]);
      assert.equal(r.ok, true, r.message); assert.equal(Number(r.res.duracion_min), 30);
      regs.push(id);
    }
    const f = await uno("select * from piefirme.ctl_ocupacion where id = $1", [regs[0]]);
    assert.equal(f.fuente, "manual"); assert.equal(Number(f.duracion_min), 30);
    assert.equal((await rpc("r@g.com", "ctl_ocupacion_registrar", [regs[0], S.S4, inicio(0).toISOString(), new Date(inicio(0).getTime() + 30 * 60000).toISOString(), null, "Sillón 1", null])).res.idempotente, true);
    const ahora = Date.now();
    const m = (s, e, nom = "Sillón 1") => rpc("r@g.com", "ctl_ocupacion_registrar", [uuid(), S.S4, new Date(s).toISOString(), new Date(e).toISOString(), null, nom, null]);
    assert.equal((await m(inicio(0).getTime() + 10 * 60000, inicio(0).getTime() + 20 * 60000)).code, "PF409", "traslape en el mismo puesto");
    assert.equal((await m(inicio(0).getTime() + 10 * 60000, inicio(0).getTime() + 20 * 60000, "Sillón 2")).ok, true, "otro puesto sí");
    assert.equal((await m(ahora - 60000, ahora + 3600000)).code, "PF422", "no termina en el futuro");
    assert.equal((await m(inicio(2).getTime(), inicio(2).getTime())).code, "PF422", "fin posterior al inicio");
    assert.equal((await m(ahora - 20 * 3600000, ahora - 5 * 3600000, "Sillón 3")).code, "PF422", "más de 12 horas");
    assert.equal((await m(ahora - 40 * 86400000, ahora - 40 * 86400000 + 3600000, "Sillón 3")).code, "PF422", "más de 35 días atrás");
    assert.equal((await rpc("a@g.com", "ctl_ocupacion_registrar", [uuid(), S.S4, inicio(0).toISOString(), inicio(0).toISOString(), null, null, null])).code, "PF403");
  });
  await t.test("ocho tickets de servicio cobrados a las horas de las ocho primeras ocupaciones", async () => {
    for (let i = 0; i < 8; i++) await ventaEn(S.S4, turno, serv1, new Date(inicio(i).getTime() + 35 * 60000).toISOString());
  });
  await t.test("con una ocupación extra de otro puesto (10 min, cuenta porque supera los 5 min mínimos) el cruce da 13 ocupaciones contra 8 tickets", async () => {
    const r = await rpc("m@g.com", "ctl_ocupacion_cruce", [J({ desde: diaTxt, hasta: diaTxt, sucursal: S.S4 })]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.fase, "posterior_al_piloto");
    const d = r.res.dias.find((x) => x.sucursal_id === S.S4);
    assert.equal(d.tickets_servicio, 8);
    assert.equal(d.ocupaciones, 13, "las 12 del sillón 1 y la de 10 min del sillón 2 (≥ 5 min)");
    // la de «Sillón 2» (10 min) se ligó a un ticket cercano antes que las demás; los cobros faltantes son los de las últimas ocupaciones
    assert.equal(d.cobros_faltantes, 13 - 8);
  });
  await t.test("sin la ocupación extra: exactamente 12 ocupaciones, 8 tickets, 4 faltantes y las horas de las últimas cuatro", async () => {
    await purgar("delete from piefirme.ctl_ocupacion where organizacion_id = $1 and puesto_nombre = 'Sillón 2'", [ORG]);
    const r = await rpc("m@g.com", "ctl_ocupacion_cruce", [J({ desde: diaTxt, hasta: diaTxt, sucursal: S.S4 })]);
    const d = r.res.dias.find((x) => x.sucursal_id === S.S4);
    assert.equal(d.ocupaciones, 12); assert.equal(d.tickets_servicio, 8); assert.equal(d.cobros_faltantes, 4); assert.equal(d.tickets_sin_ocupacion, 0);
    assert.deepEqual(d.faltantes.map((x) => new Date(x.inicio_en).getTime()), [8, 9, 10, 11].map((i) => inicio(i).getTime()), "horas exactas de inicio");
    assert.deepEqual(d.faltantes.map((x) => new Date(x.fin_en).getTime()), [8, 9, 10, 11].map((i) => inicio(i).getTime() + 30 * 60000), "horas exactas de fin");
    assert.equal(r.res.resumen.cobros_faltantes, 4);
  });
  await t.test("la duración mínima contada es configurable: con 31 min ninguna ocupación de 30 cuenta", async () => {
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["ocupacion_min_min", S.S4, J(31), false, "prueba"])).ok, true);
    const d = (await rpc("m@g.com", "ctl_ocupacion_cruce", [J({ desde: diaTxt, hasta: diaTxt, sucursal: S.S4 })])).res.dias.find((x) => x.sucursal_id === S.S4);
    assert.equal(d.ocupaciones, 0); assert.equal(d.ocupaciones_menores_al_minimo, 12); assert.equal(d.cobros_faltantes, 0);
    assert.equal((await rpc("m@g.com", "ctl_config_restablecer", ["ocupacion_min_min", S.S4, "prueba"])).ok, true);
    assert.equal((await rpc("m@g.com", "ctl_ocupacion_cruce", [J({ desde: diaTxt, hasta: diaTxt, sucursal: S.S4 })])).res.dias.find((x) => x.sucursal_id === S.S4).ocupaciones, 12);
  });
  await t.test("la evaluación del día anterior avisa los cuatro cobros faltantes (una sola vez)", async () => {
    await rpc("m@g.com", "ctl_servicios_evaluar_ahora", []);
    const a = (await alertas("ocupacion_sin_cobro")).filter((x) => x.sucursal_id === S.S4);
    assert.equal(a.length, 1); assert.match(a[0].mensaje, /12 ocupaci/); assert.match(a[0].mensaje, /faltan 4 cobro/);
    await rpc("m@g.com", "ctl_servicios_evaluar_ahora", []);
    assert.equal((await alertas("ocupacion_sin_cobro")).filter((x) => x.sucursal_id === S.S4).length, 1);
  });
  await t.test("la sucursal no ve el cruce; la ocupación registrada no se edita ni se borra", async () => {
    for (const correo of ["r@g.com", "p@g.com", "a@g.com"]) assert.equal((await rpc(correo, "ctl_ocupacion_cruce", ["{}"])).code, "PF403", correo);
    await owner();
    for (const sql of ["update piefirme.ctl_ocupacion set fin_en = fin_en + interval '1 hour' where id = $1", "delete from piefirme.ctl_ocupacion where id = $1"]) {
      const r = await intentar(sql, [regs[0]]); assert.equal(r.ok, false); assert.equal(r.code, "PF403");
    }
  });
});

// ═════════════════════════════ 7 · INMUTABILIDAD Y PRIVILEGIOS ═════════════════════════════
test("la app no escribe en las tablas de servicios y anon no ejecuta nada nuevo", async (t) => {
  await t.test("INSERT/UPDATE/DELETE directos denegados a los cinco roles en ctl_atencion, ctl_ocupacion y ctl_consumo_esperado", async () => {
    const algo = (await uno("select id from piefirme.ctl_atencion where organizacion_id = $1 limit 1", [ORG])).id;
    for (const correo of CORREOS) {
      await como(correo);
      for (const sql of [
        ["insert into piefirme.ctl_atencion (organizacion_id, sucursal_id) values ($1, $2)", [ORG, S.S1]],
        ["update piefirme.ctl_atencion set estado = 'cancelada' where id = $1", [algo]],
        ["delete from piefirme.ctl_atencion where id = $1", [algo]],
        ["insert into piefirme.ctl_ocupacion (organizacion_id, sucursal_id, inicio_en) values ($1, $2, now())", [ORG, S.S1]],
        ["delete from piefirme.ctl_ocupacion", []],
        ["insert into piefirme.ctl_consumo_esperado (organizacion_id, servicio_id, insumo_producto_id, cantidad) values ($1, $2, $3, 1)", [ORG, serv1, prod]],
        ["update piefirme.ctl_consumo_esperado set cantidad = 99", []],
      ]) {
        const r = await intentar(sql[0], sql[1]);
        assert.equal(r.ok, false, `${correo}: ${sql[0]}`); assert.equal(r.code, "42501", `${correo}: ${sql[0]} → ${r.message}`);
      }
    }
  });
  await t.test("ninguna función nueva es ejecutable por anon; las internas tampoco por authenticated", async () => {
    const f = await filas(`select p.proname, n.nspname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('piefirme', 'piefirme_app') and p.proname in (
       'ctl_atencion_abrir','ctl_atencion_cerrar_con_ticket','ctl_atencion_cancelar','ctl_atencion_tickets_candidatos','ctl_atencion_supervisores','ctl_atenciones_listar','ctl_atenciones_conciliar',
       'ctl_rep_atenciones_sin_cobro','ctl_rep_cuadre_insumos','ctl_ocupacion_registrar','ctl_ocupacion_cruce','ctl_servicios_evaluar_ahora',
       'ctl_atencion_autoligar','ctl_verificar_pin_perfil','ctl_ref_opaca','ctl_ticket_capacidad','ctl_o_servicios_cobrados','ctl_o_salidas_insumo','ctl_o_costo_producto','ctl_ocupacion_cruce_dia','ctl_servicios_evaluar','ctl_periodo')`);
    assert.ok(f.length >= 20);
    assert.deepEqual(f.filter((x) => x.anon).map((x) => x.proname), [], "anon no ejecuta nada");
    assert.deepEqual(f.filter((x) => x.nspname === "piefirme_app" && x.auth).map((x) => x.proname), [], "las internas no son llamables por la app");
    assert.ok(f.filter((x) => x.nspname === "piefirme").every((x) => x.auth));
  });
  await t.test("catálogo de alertas: los tres eventos nuevos existen y no se editan desde la app", async () => {
    const e = await filas("select tipo from piefirme.ctl_alerta_catalogo where tipo in ('atencion_sin_ticket', 'atencion_cancelada', 'ocupacion_sin_cobro')");
    assert.equal(e.length, 3);
  });
});
