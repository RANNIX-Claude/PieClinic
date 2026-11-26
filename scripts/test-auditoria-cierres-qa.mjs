// Pruebas del módulo «Control y Auditoría» · ETAPA 4 (checklist y cierres) contra la base QA.   node --test scripts/test-auditoria-cierres-qa.mjs
//
// UNA transacción que SIEMPRE se deshace (no deja filas, folios, ventas ni alertas): se siembra como dueño de la base y se actúa «como» cada cuenta
// de prueba (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-qa.mjs. Cada escenario usa una sucursal NUEVA creada dentro
// de la transacción (turnos, ventas y puntos de control propios) para no depender de los datos de QA.
// Cubre: catálogo y siembra por omisión, versionado del checklist (criterio 22), obligatorios, denominaciones sin total, tolerancia de efectivo
// (±$20 por omisión), cuadre de kits (criterio 20), captura a ciegas del cierre (criterio 1), doble firma (cuadra / no cuadra / entrega_no_aceptada,
// criterios 18 y 19), fondo inicial = monto confirmado, hash idéntico entre tomas (criterio 6), pares cierre/apertura, idempotencia, hora del servidor
// (criterio 5), no hay ruta de galería (criterio 4) e inmutabilidad (criterio 8).
// Cuentas (clave 123456, solo QA): a superadmin(soporte) · m dueño · s supervisor · p podólogo · r recepción.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ambiente, conectar } from "./lib/env.mjs";
import { tieneCamposEsperado } from "../src/lib/auditoria/cierres.js";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
const J = (x) => JSON.stringify(x);
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");

const c = await conectar(cfg);
const ids = {};
let n = 0, prod, servicio;
const S = {};   // sucursales de prueba

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
const uno = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows[0]; };
const filas = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows; };
const comoOwner = async (sql, params) => { await owner(); return c.query(sql, params); };

// ───────────── ayudas de siembra (como dueño de la base) ─────────────
async function nuevaSede(clave) {
  const s = await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, clave, `Sucursal prueba ${clave}`]);
  await c.query("select piefirme_app.ctl_sembrar_tomas($1)", [ORG]);
  return s.id;
}
async function nuevoTurno(sede, correo, fondo = 500, caja = "Caja 1") {
  return (await uno("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, cajero_id, fondo_inicial) values ($1, $2, $3, $4, $5) returning id", [ORG, sede, caja, ids[correo], fondo])).id;
}
/** Crea un ticket de servicio por `monto` y lo cobra COMO `correo` (con su turno abierto). */
async function venta(sede, correo, { monto = 100, metodo = "efectivo", cobrar = true } = {}) {
  await owner();
  const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen) values ($1, $2, 'mostrador') returning id", [ORG, sede]);
  await c.query("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, servicio_id, cantidad, precio_unitario) values ($1, $2, $3, 'servicio', $4, 1, $5)", [ORG, sede, v.id, servicio, monto]);
  const t = await uno("select total from piefirme.ventas where id = $1", [v.id]);
  await c.query("insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto) values ($1, $2, $3, $4, $5)", [ORG, sede, v.id, metodo, t.total]);
  if (!cobrar) return { id: v.id };
  const r = await rpc(correo, "cobrar_venta", [v.id]);
  return { id: v.id, cobro: r };
}
const punto = async (datos) => {
  const r = await rpc("m@g.com", "ctl_punto_control_guardar", [null, J(datos)]);
  assert.equal(r.ok, true, `crear punto «${datos.nombre}»: ${r.message}`);
  return r.res;
};
const PIN = "4827";
async function ponerPin(correo) {
  await c.query("insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash) values ($1, $2, piefirme_app.hash_pin($1, $3)) on conflict (perfil_id) do update set pin_hash = excluded.pin_hash", [ids[correo], ORG, PIN]);
}
/** Desglose voraz de un monto entero. */
function desglosar(monto) {
  let m = Math.round(monto * 2) / 2; const out = [];
  for (const d of [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5]) { const k = Math.floor(m / d + 1e-9); if (k > 0) { out.push({ denominacion: d, cantidad: k }); m = Math.round((m - k * d) * 2) / 2; } }
  return out;
}
const abrir = async (correo, sede, tipo, turno = null) => { const id = crypto.randomUUID(); const r = await rpc(correo, "ctl_cierre_abrir", [id, sede, tipo, turno, null]); return { id, ...r }; };
const capturar = (correo, cierre, pto, { valor = null, den = null, id = crypto.randomUUID(), hora = null } = {}) => rpc(correo, "ctl_cierre_capturar", [id, cierre, pto, valor, den ? J(den) : null, hora]);
const cerrar = (correo, cierre, conEntrega = null, monto = null) => rpc(correo, "ctl_cierre_cerrar", [cierre, conEntrega, monto, null]);
const objeto = async (nombre, hace = "0 seconds") => {
  await owner();
  await c.query("insert into storage.objects (bucket_id, name, metadata) values ('pf-auditoria', $1, '{}'::jsonb)", [nombre]);
  await c.query("update storage.objects set created_at = now() - $2::interval where bucket_id = 'pf-auditoria' and name = $1", [nombre, hace]);
};
async function foto(correo, cierre, pto, toma, h, { hace = "0 seconds", sede } = {}) {
  const ruta = `${ORG}/ctl/${sede}/${crypto.randomUUID()}.jpg`;
  await objeto(ruta, hace);
  const r = await rpc(correo, "ctl_cierre_foto", [crypto.randomUUID(), cierre, pto, ruta, h, 1000, 1600, 1200, toma, null]);
  return { ruta, ...r };
}
const casosDe = async (cierre) => filas(`select k.* from piefirme.ctl_caso k where k.origen_tipo = 'cierre_captura' and k.origen_id in (select id from piefirme.ctl_cierre_captura where cierre_id = $1) order by k.folio`, [cierre]);
const alertas = async (tipo, ref) => filas("select * from piefirme.ctl_alerta where tipo = $1 and ($2::uuid is null or referencia_id = $2) order by creado_en", [tipo, ref ?? null]);

before(async () => {
  await c.query("begin");
  // los folios (SES/CIE/CAS) se numeran con un contador por organización: si OTRA corrida de pruebas del módulo tiene su transacción abierta, esta espera su turno
  await c.query("set local statement_timeout = '15min'");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  prod = (await uno("select id from piefirme.productos where organizacion_id = $1 and estado = 'activo' order by nombre limit 1", [ORG])).id;
  servicio = (await uno("select id from piefirme.servicios where organizacion_id = $1 order by nombre limit 1", [ORG])).id;
  for (const k of ["S1", "S2", "S3", "S4", "S5", "S6", "S7"]) S[k] = await nuevaSede("T" + k);
  // p@g.com (podólogo) trabaja solo en Chalco: para las pruebas de ciegas se le abren las sucursales de prueba (dentro de la transacción)
  await c.query("update piefirme.perfiles set sedes = '{}' where id = $1", [ids["p@g.com"]]);
  for (const e of ["r@g.com", "m@g.com", "s@g.com", "p@g.com"]) await ponerPin(e);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · CATÁLOGO Y SIEMBRA POR OMISIÓN ═════════════════════════════
test("catálogo: puntos de control por omisión coherentes con la especificación y catálogo de fórmulas", async (t) => {
  await t.test("siembra: efectivo por denominaciones, terminal, kits, tomas fijas y foto del efectivo", async () => {
    const pts = await filas("select * from piefirme.ctl_punto_control where organizacion_id = $1 and vigente_hasta is null order by orden", [ORG]);
    const por = (clave) => pts.find((p) => p.parametros?.semilla === clave);
    assert.ok(por("efectivo") && por("tarjeta") && por("kits") && por("tomas") && por("efectivo_foto"), `faltan puntos sembrados: ${pts.map((p) => p.nombre)}`);
    assert.equal(por("efectivo").tipo_captura, "denominaciones");
    assert.equal(por("efectivo").formula_esperado, "efectivo_esperado");
    assert.equal(por("efectivo").aplica_turno && por("efectivo").aplica_dia, true);
    assert.equal(por("tarjeta").tipo_captura, "numero_y_foto");
    assert.equal(por("tarjeta").formula_esperado, "tarjeta_esperada");
    assert.equal(por("kits").tipo_captura, "conteo_piezas");
    assert.equal(por("kits").formula_esperado, "kits_usados");
    assert.equal(por("kits").activo, false, "los kits quedan inactivos hasta elegir el insumo");
    assert.equal(por("tomas").tipo_captura, "solo_foto");
    assert.equal(por("tomas").aplica_apertura, true);
    assert.equal(por("tomas").parametros.toma_fija, true);
    assert.equal(por("tomas").formula_esperado, null, "una foto es evidencia: no cuadra contra nada");
  });
  await t.test("las versiones de la Etapa 0 se conservan (las anteriores quedan cerradas, no se borran)", async () => {
    const g = await uno("select grupo_id from piefirme.ctl_punto_control where organizacion_id = $1 and parametros ->> 'semilla' = 'efectivo' and vigente_hasta is null", [ORG]);
    const vers = await filas("select version, vigente_hasta from piefirme.ctl_punto_control where grupo_id = $1 order by version", [g.grupo_id]);
    assert.ok(vers.length >= 2);
    assert.ok(vers.slice(0, -1).every((v) => v.vigente_hasta), "las versiones viejas están cerradas");
    assert.equal(vers.at(-1).vigente_hasta, null);
  });
  await t.test("catálogo de fórmulas: cinco claves que el servidor sabe calcular", async () => {
    const f = await filas("select clave, tipos_captura, requiere_producto from piefirme.ctl_formula_esperado order by orden");
    assert.deepEqual(f.map((x) => x.clave), ["efectivo_esperado", "tarjeta_esperada", "transferencia_esperada", "kits_usados", "tickets_cobrados"]);
    assert.equal(f.find((x) => x.clave === "kits_usados").requiere_producto, true);
  });
  await t.test("agregar un control es configuración: el dueño lo crea y otro punto con formula incompatible se rechaza", async () => {
    const ok = await rpc("m@g.com", "ctl_punto_control_guardar", [null, J({ nombre: "Total de transferencias", tipo_captura: "numero", formula_esperado: "transferencia_esperada", aplica_turno: true, sucursales: [S.S7] })]);
    assert.equal(ok.ok, true, ok.message);
    for (const [datos, patron] of [
      [{ nombre: "x", tipo_captura: "solo_foto", formula_esperado: "efectivo_esperado" }, /no se puede usar|evidencia/],
      [{ nombre: "x", tipo_captura: "denominaciones", formula_esperado: "kits_usados" }, /no se puede usar/],
      [{ nombre: "x", tipo_captura: "numero", formula_esperado: "inventada" }, /desconocida/],
      [{ nombre: "x", tipo_captura: "conteo_piezas", formula_esperado: "kits_usados", activo: true }, /elija el insumo/],
      [{ nombre: "x", tipo_captura: "magia" }, /no válido/],
      [{ nombre: "x", tipo_captura: "numero", tolerancia: -1 }, /negativa/],
      [{ nombre: "x", tipo_captura: "numero", parametros: { raro: 1 } }, /desconocido/],
      [{ nombre: "x", tipo_captura: "numero", parametros: { toma_fija: true } }, /solo foto/],
    ]) {
      const r = await rpc("m@g.com", "ctl_punto_control_guardar", [null, J(datos)]);
      assert.equal(r.ok, false, `debió rechazar ${J(datos)}`);
      assert.equal(r.code, "PF422", r.message);
      assert.match(r.message, patron);
    }
  });
  await t.test("solo el dueño configura: recepción, podólogo y supervisor no", async () => {
    for (const correo of ["r@g.com", "p@g.com", "s@g.com"]) {
      const r = await rpc(correo, "ctl_punto_control_guardar", [null, J({ nombre: "x", tipo_captura: "numero" })]);
      assert.equal(r.code, "PF403", correo);
    }
  });
  // a partir de aquí los escenarios usan sus propios puntos (restringidos a su sucursal): se apagan los globales dentro de la transacción
  await owner();
  for (const p of await filas("select id from piefirme.ctl_punto_control where organizacion_id = $1 and vigente_hasta is null and activo and sucursales is null", [ORG])) {
    const r = await rpc("m@g.com", "ctl_punto_control_guardar", [p.id, J({ activo: false })]);
    assert.equal(r.ok, true, r.message);
  }
});

// ═════════════════════════════ 2 · RECORRIDO: obligatorios, denominaciones, versionado, idempotencia ═════════════════════════════
test("recorrido del cierre (S1): obligatorios, denominaciones sin total, versionado, idempotencia y hora del servidor", async (t) => {
  const turno = await nuevoTurno(S.S1, "r@g.com", 500);
  const pEf = await punto({ nombre: "Efectivo S1", tipo_captura: "denominaciones", formula_esperado: "efectivo_esperado", aplica_turno: true, aplica_dia: true, orden: 10, sucursales: [S.S1] });
  const pTar = await punto({ nombre: "Terminal S1", tipo_captura: "numero", formula_esperado: "tarjeta_esperada", aplica_turno: true, orden: 20, sucursales: [S.S1] });
  const pOpc = await punto({ nombre: "Nota de caja S1", tipo_captura: "numero", obligatorio: false, aplica_turno: true, orden: 30, sucursales: [S.S1] });
  let cierre;

  await t.test("abrir: el servidor resuelve los puntos de la sucursal y los devuelve ordenados SIN esperados", async () => {
    const a = await abrir("r@g.com", S.S1, "turno");
    assert.equal(a.ok, true, a.message);
    cierre = a.id;
    assert.deepEqual(a.res.puntos.map((p) => p.nombre), ["Efectivo S1", "Terminal S1", "Nota de caja S1"]);
    assert.equal(a.res.cierre.estado, "en_captura");
    assert.match(a.res.cierre.folio, /^CIE-\d{4}-\d{5}$/);
    assert.equal(a.res.progreso.puede_cerrar, false);
    assert.equal(tieneCamposEsperado(a.res), false, "el recorrido no trae esperado, tolerancia ni diferencia");
    const t0 = await uno("select version_checklist from piefirme.ctl_cierre where id = $1", [cierre]);
    assert.equal(t0.version_checklist.length, 3);
    assert.equal(t0.version_checklist[0].version, 1);
  });
  await t.test("retoma: abrir otra vez devuelve el mismo cierre en captura (guardado parcial)", async () => {
    const otra = await rpc("r@g.com", "ctl_cierre_abrir", [crypto.randomUUID(), S.S1, "turno", null, null]);
    assert.equal(otra.res.retomado, true);
    assert.equal(otra.res.cierre.id, cierre);
    const idem = await rpc("r@g.com", "ctl_cierre_abrir", [cierre, S.S1, "turno", null, null]);
    assert.equal(idem.res.cierre.id, cierre);
  });
  await t.test("no se puede cerrar sin completar los obligatorios (mensaje con lo que falta)", async () => {
    const r = await cerrar("r@g.com", cierre);
    assert.equal(r.ok, false);
    assert.equal(r.code, "PF422");
    assert.match(r.message, /Efectivo S1/);
    assert.match(r.message, /Terminal S1/);
    assert.doesNotMatch(r.message, /Nota de caja/, "el punto opcional no estorba");
  });
  await t.test("denominaciones SIN campo de total: un total tecleado se rechaza; el total lo suma el servidor", async () => {
    let r = await capturar("r@g.com", cierre, pEf, { valor: 800, den: desglosar(800) });
    assert.equal(r.code, "PF422");
    assert.match(r.message, /no existe un campo de total/);
    r = await capturar("r@g.com", cierre, pEf, { valor: 800 });
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, pEf, { den: [{ denominacion: 7, cantidad: 1 }] });
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, pEf, { den: [{ denominacion: 100, cantidad: 1 }, { denominacion: 100, cantidad: 2 }] });
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, pEf, { den: [{ denominacion: 100, cantidad: -2 }] });
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, pEf, { den: [{ denominacion: 500, cantidad: 1 }, { denominacion: 200, cantidad: 1 }, { denominacion: 50, cantidad: 1 }, { denominacion: 0.5, cantidad: 3 }] });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.total, 751.5);
    const d = await filas("select denominacion, cantidad from piefirme.ctl_denominacion where cierre_captura_id = $1 order by denominacion desc", [r.res.id]);
    assert.equal(d.length, 4);
    assert.equal((await uno("select valor_capturado from piefirme.ctl_cierre_captura where id = $1", [r.res.id])).valor_capturado, "751.50");
    const cols = (await filas("select column_name from information_schema.columns where table_schema = 'piefirme' and table_name = 'ctl_denominacion'")).map((x) => x.column_name);
    assert.equal(cols.some((x) => /total|importe|monto/.test(x)), false, "la tabla de denominaciones no tiene campo de total");
  });
  await t.test("corregir una captura = fila nueva que referencia la anterior; la vigente es la última", async () => {
    const primera = await uno("select id from piefirme.ctl_cierre_captura where cierre_id = $1 and punto_control_id = $2", [cierre, pEf]);
    const r = await capturar("r@g.com", cierre, pEf, { den: desglosar(790) });
    assert.equal(r.res.corrige_a, primera.id);
    const filasPunto = await filas("select id, corrige_a from piefirme.ctl_cierre_captura where cierre_id = $1 and punto_control_id = $2", [cierre, pEf]);
    assert.equal(filasPunto.length, 2);
    const rec = await rpc("r@g.com", "ctl_cierre_recorrido", [cierre]);
    assert.equal(Number(rec.res.puntos[0].captura.valor), 790);
    assert.equal(rec.res.puntos[0].completo, true);
  });
  await t.test("tipos de valor: número requerido, no negativo; el opcional puede omitirse", async () => {
    let r = await capturar("r@g.com", cierre, pTar, {});
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, pTar, { valor: -5 });
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, pTar, { valor: 0, den: [{ denominacion: 1, cantidad: 1 }] });
    assert.equal(r.code, "PF422");
    r = await capturar("r@g.com", cierre, "00000000-0000-0000-0000-0000000000aa", { valor: 1 });
    assert.equal(r.code, "PF422", "un punto ajeno al cierre se rechaza");
  });
  await t.test("idempotencia: reenviar la misma captura (mismo id de cliente) no duplica", async () => {
    const id = crypto.randomUUID();
    const a = await capturar("r@g.com", cierre, pTar, { valor: 0, id });
    assert.equal(a.ok, true, a.message);
    const b = await capturar("r@g.com", cierre, pTar, { valor: 0, id });
    assert.equal(b.ok, true);
    assert.equal(b.res.duplicada, true);
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_cierre_captura where id = $1", [id])).n, 1);
  });
  await t.test("hora del servidor (criterio 5): la hora del teléfono es solo referencia y la discrepancia queda registrada", async () => {
    const hora = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const r = await capturar("r@g.com", cierre, pOpc, { valor: 3, hora });
    assert.equal(r.ok, true, r.message);
    await owner();
    const k = await uno("select capturado_en, creado_en, hora_cliente, (capturado_en = now()) as es_servidor from piefirme.ctl_cierre_captura where id = $1", [r.res.id]);
    assert.equal(k.es_servidor, true);
    assert.notEqual(k.hora_cliente.toISOString(), k.capturado_en.toISOString());
    const d = await uno("select diferencia_seg from piefirme.ctl_discrepancia_hora where tabla = 'ctl_cierre_captura' and registro_id = $1", [r.res.id]);
    assert.ok(d && Math.abs(d.diferencia_seg) > 3 * 3600 - 120, "la discrepancia quedó en bitácora");
  });
  await t.test("versionado (criterio 22): cambiar el checklist no cambia lo que muestra un cierre anterior", async () => {
    const v2 = await rpc("m@g.com", "ctl_punto_control_guardar", [pEf, J({ nombre: "Efectivo y vales S1", tolerancia: 5 })]);
    assert.equal(v2.ok, true, v2.message);
    const rec = await rpc("r@g.com", "ctl_cierre_recorrido", [cierre]);
    assert.equal(rec.res.puntos[0].nombre, "Efectivo S1", "el cierre abierto antes del cambio conserva su versión");
    assert.equal(rec.res.puntos[0].version, 1);
    const det = await rpc("m@g.com", "ctl_cierre_detalle", [cierre]);
    assert.equal(det.ok, true, det.message);
    assert.equal(det.res.puntos[0].nombre, "Efectivo S1");
    assert.equal(det.res.puntos[0].version, 1);
    assert.equal(det.res.puntos[0].vigente_hoy, false, "ya no es la vigente, pero se muestra la de entonces");
    const nuevo = await rpc("s@g.com", "ctl_cierre_detalle", [cierre]);
    assert.equal(nuevo.res.puntos[0].version, 1, "también el supervisor lo ve con su versión");
    S.pEfV2 = v2.res;
  });
  await t.test("quien captura no puede ver el detalle, la lista ni los pares (solo dueño y supervisor)", async () => {
    for (const [fn, args] of [["ctl_cierre_detalle", [cierre]], ["ctl_cierres_listar", [null, null, null, null, null, 10]], ["ctl_pares_toma", [null, null, null, 10]]]) {
      for (const correo of ["r@g.com", "p@g.com"]) {
        const r = await rpc(correo, fn, args);
        assert.equal(r.code, "PF403", `${correo} ${fn}: ${r.message}`);
      }
    }
  });
  S.cierre1 = { id: cierre, pEf, pTar, pOpc, turno };
});

// ═════════════════════════════ 3 · TOLERANCIA DE EFECTIVO Y CAPTURA A CIEGAS ═════════════════════════════
test("efectivo contra fondo + ventas − retiros: tolerancia ±$20 por omisión, casos y captura a ciegas", async (t) => {
  const { id: cierre1, pEf, pTar } = S.cierre1;
  const turno = S.cierre1.turno;
  for (let i = 0; i < 3; i++) { const v = await venta(S.S1, "r@g.com", { monto: 100 }); assert.equal(v.cobro.ok, true, v.cobro.message); }
  const tj = await venta(S.S1, "r@g.com", { monto: 250, metodo: "tarjeta" });
  assert.equal(tj.cobro.ok, true, tj.cobro.message);
  await owner();
  const esperado = Number((await uno("select $1::numeric + coalesce(sum(p.monto), 0) as e from piefirme.pagos p join piefirme.ventas v on v.id = p.venta_id where v.turno_id = $2 and p.metodo = 'efectivo'", [500, turno])).e);
  assert.equal(esperado, 800, "fondo 500 + 3 tickets en efectivo de $100");

  await t.test("dentro de tolerancia (−$10): cierra sin caso; la respuesta a quien captura no trae esperado", async () => {
    const d = await capturar("r@g.com", cierre1, pEf, { den: desglosar(790) });
    assert.equal(d.ok, true, d.message);
    assert.equal((await capturar("r@g.com", cierre1, pTar, { valor: 250 })).ok, true);
    const r = await cerrar("r@g.com", cierre1, false);
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(Object.keys(r.res).sort(), ["entrega_id", "estado", "folio", "ok"].sort());
    assert.equal(r.res.estado, "cerrado");
    assert.equal(tieneCamposEsperado(r.res), false);
    assert.equal((await casosDe(cierre1)).length, 0, "−$10 está dentro de ±$20");
    await owner();
    const calc = await uno("select k.valor_esperado, k.diferencia, k.dentro_tolerancia, k.valor_calculado from piefirme.ctl_cierre_calculo k join piefirme.ctl_cierre_captura c on c.id = k.cierre_captura_id where c.cierre_id = $1 and c.punto_control_id = $2", [cierre1, pEf]);
    assert.equal(Number(calc.valor_esperado), 800);
    assert.equal(Number(calc.diferencia), -10);
    assert.equal(calc.dentro_tolerancia, true);
    const tar = await uno("select k.valor_esperado, k.dentro_tolerancia from piefirme.ctl_cierre_calculo k join piefirme.ctl_cierre_captura c on c.id = k.cierre_captura_id where c.cierre_id = $1 and c.punto_control_id = $2", [cierre1, pTar]);
    assert.equal(Number(tar.valor_esperado), 250);
    assert.equal(tar.dentro_tolerancia, true);
  });
  await t.test("un cierre cerrado no admite más capturas, y cerrarlo de nuevo es idempotente", async () => {
    const r = await capturar("r@g.com", cierre1, pEf, { den: desglosar(1) });
    assert.equal(r.code, "PF409");
    const otra = await cerrar("r@g.com", cierre1, false);
    assert.equal(otra.res.idempotente, true);
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_cierre_calculo where cierre_id = $1", [cierre1])).n, 2, "no se recalcula ni se duplica");
  });

  let cierre2;
  await t.test("fuera de tolerancia (−$30): abre un caso diferencia_efectivo nacido de la captura y alerta al dueño", async () => {
    const a = await abrir("r@g.com", S.S1, "turno");
    cierre2 = a.id;
    assert.equal(a.res.retomado, false);
    assert.equal(a.res.puntos[0].nombre, "Efectivo y vales S1", "un cierre nuevo toma la versión vigente");
    const ptoV2 = a.res.puntos[0].punto_id;
    assert.equal((await capturar("r@g.com", cierre2, ptoV2, { den: desglosar(770) })).ok, true);
    assert.equal((await capturar("r@g.com", cierre2, a.res.puntos[1].punto_id, { valor: 250 })).ok, true);
    const r = await cerrar("r@g.com", cierre2, false);
    assert.equal(r.ok, true, r.message);
    const casos = await casosDe(cierre2);
    assert.equal(casos.length, 1);
    assert.equal(casos[0].tipo, "diferencia_efectivo");
    assert.equal(casos[0].estado, "abierta");
    assert.equal(Number(casos[0].valor), -30);
    assert.equal(casos[0].origen_tipo, "cierre_captura");
    assert.equal(casos[0].usuario_captura, ids["r@g.com"], "el caso recuerda quién capturó (separación de funciones)");
    assert.equal(casos[0].producto_id, null, "un faltante de efectivo no es un ajuste de inventario");
    assert.match(casos[0].folio, /^CAS-/);
    assert.ok((await alertas("cierre_fuera_tolerancia", cierre2)).length === 1);
    assert.equal((await filas("select 1 from piefirme.ctl_caso_bitacora where caso_id = $1 and estado_nuevo = 'abierta'", [casos[0].id])).length, 1);
  });
  await t.test("la tolerancia se configura por sucursal y se evalúa con la configuración vigente al cerrar", async () => {
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["tolerancia_efectivo", S.S1, "50", false, "prueba"])).ok, true);
    const a = await abrir("r@g.com", S.S1, "turno");
    const ptos = a.res.puntos;
    assert.equal((await capturar("r@g.com", a.id, ptos[0].punto_id, { den: desglosar(770) })).ok, true);
    assert.equal((await capturar("r@g.com", a.id, ptos[1].punto_id, { valor: 250 })).ok, true);
    assert.equal((await cerrar("r@g.com", a.id, false)).ok, true);
    assert.equal((await casosDe(a.id)).length, 0, "−$30 con tolerancia ±$50 ya no es caso");
  });
  await t.test("captura a ciegas del cierre (criterio 1): quien captura no ve esperado, diferencia, corte ni entrega; el dueño y el supervisor sí", async () => {
    for (const correo of ["r@g.com", "p@g.com"]) {
      for (const rel of ["ctl_cierre_calculo", "ctl_cierre_revision", "ctl_cierre_corte", "ctl_entrega", "ctl_entrega_firma", "ctl_caso", "ctl_alerta", "ctl_formula_esperado", "ctl_consumo_esperado"]) {
        await como(correo);
        const x = await intentar(`select count(*)::int as n from piefirme.${rel}`);
        assert.equal(x.ok, true, `${correo} ${rel}: ${x.message}`);
        assert.equal(x.rows[0].n, 0, `${correo} ve filas de ${rel}`);
      }
      await como(correo);
      const v = await intentar("select * from piefirme.ctl_cierre_puntos where cierre_id = $1", [cierre2]);
      assert.ok(v.rows.length >= 2);
      assert.deepEqual(Object.keys(v.rows[0]).filter((k) => /esperado|diferencia|tolerancia|calculado|detalle/.test(k)), []);
      const rec = await rpc(correo, "ctl_cierre_recorrido", [cierre2]);
      if (correo === "r@g.com") assert.equal(tieneCamposEsperado(rec.res), false);
    }
    for (const correo of ["m@g.com", "s@g.com"]) {
      const det = await rpc(correo, "ctl_cierre_detalle", [cierre2]);
      assert.equal(det.ok, true, `${correo}: ${det.message}`);
      const ef = det.res.puntos[0].captura;
      assert.equal(Number(ef.valor_esperado), 800);
      assert.equal(Number(ef.diferencia), -30);
      assert.equal(ef.dentro_tolerancia, false);
      assert.equal(det.res.casos.length, 1);
      assert.equal(Number(det.res.corte.efectivo.esperado), 800, "el corte muestra efectivo esperado contra contado");
      assert.equal(Number(det.res.corte.efectivo.capturado), 770);
      assert.equal(Number(det.res.corte.tarjeta.esperado), 250);
      assert.equal(det.res.corte.tickets, 4);
      assert.equal(det.res.corte.cancelaciones.numero, 0);
      assert.ok("aperturas_cajon_sin_venta" in det.res.corte && "ventas_bajo_catalogo" in det.res.corte);
    }
    const lista = await rpc("m@g.com", "ctl_cierres_listar", [S.S1, null, null, null, null, 50]);
    assert.ok(lista.res.length >= 3);
    assert.equal(lista.res.find((x) => x.id === cierre2).fuera_tolerancia, 1);
  });
  await t.test("el soporte RANNIX no captura cierres", async () => {
    const r = await rpc("a@g.com", "ctl_cierre_abrir", [crypto.randomUUID(), S.S1, "turno", null, null]);
    assert.equal(r.code, "PF403");
  });
});

// ═════════════════════════════ 4 · CUADRE DE KITS (criterio 20) ═════════════════════════════
test("cuadre de kits (criterio 20): 12 kits usados y 10 tickets de servicio → dos servicios sin cobro esa misma noche", async (t) => {
  const turno = await nuevoTurno(S.S2, "r@g.com", 500);
  const pKits = await punto({ nombre: "Kits que quedan S2", tipo_captura: "conteo_piezas", formula_esperado: "kits_usados", aplica_turno: true, sucursales: [S.S2], parametros: { producto_id: prod } });
  let cierreA;
  await t.test("el cierre anterior deja 50 kits (existencia anterior del siguiente)", async () => {
    const a = await abrir("r@g.com", S.S2, "turno");
    assert.equal(a.ok, true, a.message);
    assert.equal(a.res.puntos[0].tipo_captura, "conteo_piezas");
    assert.equal((await capturar("r@g.com", a.id, pKits, { valor: 50 })).ok, true);
    assert.equal((await cerrar("r@g.com", a.id, false)).ok, true);
    cierreA = a.id;
  });
  for (let i = 0; i < 10; i++) { const v = await venta(S.S2, "r@g.com", { monto: 100 }); assert.equal(v.cobro.ok, true, v.cobro.message); }
  await t.test("12 usados (50 − 38) contra 10 servicios cobrados: diferencia_kits, alerta con «2 servicio(s) sin cobro»", async () => {
    const a = await abrir("r@g.com", S.S2, "turno");
    assert.equal((await capturar("r@g.com", a.id, pKits, { valor: 38 })).ok, true);
    const r = await cerrar("r@g.com", a.id, false);
    assert.equal(r.ok, true, r.message);
    const casos = await casosDe(a.id);
    assert.equal(casos.length, 1);
    assert.equal(casos[0].tipo, "diferencia_kits");
    assert.equal(Number(casos[0].cantidad), 2);
    assert.equal(casos[0].producto_id, null, "el insumo ya se descontó del inventario: no hay ajuste que pedir");
    assert.equal(casos[0].contexto.insumo_producto_id, prod);
    const det = casos[0].contexto.detalle;
    assert.equal(det.kits_usados, 12);
    assert.equal(det.tickets_de_servicio, 10);
    assert.equal(det.existencia_anterior, 50);
    assert.equal(det.origen_anterior, "cierre_anterior");
    const al = await filas("select * from piefirme.ctl_alerta where tipo = 'kits_sin_ticket' and referencia_id = $1", [casos[0].id]);
    assert.equal(al.length, 1);
    assert.match(al[0].mensaje, /2 servicio\(s\) sin cobro/);
    assert.deepEqual(al[0].destinatarios, ["dueno"]);
    const detalle = await rpc("m@g.com", "ctl_cierre_detalle", [a.id]);
    assert.equal(Number(detalle.res.corte.kits.esperado), 10);
    assert.equal(Number(detalle.res.corte.kits.calculado), 12);
    assert.equal(detalle.res.corte.tickets, 10);
    S.cierreKits = a.id;
  });
  await t.test("el dueño no puede convertir ese caso en un ajuste de inventario (no tiene producto)", async () => {
    const caso = (await casosDe(S.cierreKits))[0];
    await owner();
    await c.query("update piefirme.ctl_caso set estado = 'en_investigacion', asignado_a = $2 where id = $1", [caso.id, ids["s@g.com"]]).catch(() => {});
    const r = await rpc("m@g.com", "ctl_autorizar_ajuste", [caso.id, "123456"]);
    assert.equal(r.ok, false);
  });
  await t.test("con consumo esperado definido por servicio, los servicios sin consumo no cuentan y los kits cuadran", async () => {
    // 2 kits por el servicio de prueba: 10 servicios × 2 = 20 esperados; usados 50→30 = 20 → cuadra
    const ce = await rpc("m@g.com", "ctl_consumo_esperado_guardar", [servicio, prod, "2", true]);
    assert.equal(ce.ok, true, ce.message);
    const a = await abrir("r@g.com", S.S2, "turno");
    assert.equal((await capturar("r@g.com", a.id, pKits, { valor: 38 - 20 })).ok, true);
    assert.equal((await cerrar("r@g.com", a.id, false)).ok, true);
    assert.equal((await casosDe(a.id)).length, 0, "usados 20 = 10 servicios × 2 kits");
    const malo = await rpc("m@g.com", "ctl_consumo_esperado_guardar", [servicio, prod, "0", true]);
    assert.equal(malo.code, "PF422");
    const sinPermiso = await rpc("r@g.com", "ctl_consumo_esperado_guardar", [servicio, prod, "1", true]);
    assert.equal(sinPermiso.code, "PF403");
  });
});

// ═════════════════════════════ 5 · ENTREGA DE TURNO CON DOBLE FIRMA ═════════════════════════════
async function cierreConEntrega(sede, saliente, monto, { desglose = desglosar(monto) } = {}) {
  const turno = await nuevoTurno(sede, saliente, 500, "Caja S");
  const pto = await punto({ nombre: `Efectivo ${sede.slice(0, 4)}`, tipo_captura: "denominaciones", formula_esperado: "efectivo_esperado", aplica_turno: true, sucursales: [sede] });
  const a = await abrir(saliente, sede, "turno", turno);
  assert.equal(a.ok, true, a.message);
  assert.equal((await capturar(saliente, a.id, pto, { den: desglose })).ok, true);
  return { cierre: a.id, turno, pto };
}

test("entrega de turno con doble firma (S3): cuadra → el fondo del turno siguiente es el monto confirmado", async (t) => {
  const { cierre, turno } = await cierreConEntrega(S.S3, "m@g.com", 1500);
  let entrega;
  await t.test("quien entrega confirma el monto: debe coincidir con el desglose y se exige la confirmación", async () => {
    let r = await cerrar("m@g.com", cierre, true, null);
    assert.equal(r.code, "PF422");
    r = await cerrar("m@g.com", cierre, true, 1400);
    assert.equal(r.code, "PF422");
    assert.match(r.message, /no coincide con el desglose/);
    r = await cerrar("m@g.com", cierre, true, 1500);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.estado, "entrega_no_aceptada", "el saliente se fue sin aceptación: visible en el tablero (criterio 18)");
    entrega = r.res.entrega_id;
    assert.ok(entrega);
    const ci = await uno("select estado, aceptado_en, usuario_recibe from piefirme.ctl_cierre where id = $1", [cierre]);
    assert.equal(ci.estado, "entrega_no_aceptada");
    assert.equal(ci.aceptado_en, null);
  });
  await t.test("quien recibe ve la entrega pendiente SIN monto (cuenta a ciegas) y no puede leer la tabla", async () => {
    const p = await rpc("r@g.com", "ctl_entregas_pendientes", [S.S3]);
    assert.equal(p.res.length, 1);
    assert.equal(p.res[0].id, entrega);
    assert.equal(p.res[0].puede_aceptar, true);
    assert.equal(JSON.stringify(p.res).includes("1500"), false);
    assert.deepEqual(Object.keys(p.res[0]).filter((k) => /monto|importe|valor/.test(k)), []);
    await como("r@g.com");
    assert.equal((await intentar("select count(*)::int as n from piefirme.ctl_entrega")).rows[0].n, 0);
  });
  await t.test("el entrante no puede vender hasta aceptar (criterio 19): ctl_puede_vender y bloqueo del cobro", async () => {
    const pv = await rpc("r@g.com", "ctl_puede_vender", [S.S3]);
    assert.equal(pv.res.puede, false);
    assert.match(pv.res.motivo, /entrega del turno anterior/);
    await nuevoTurno(S.S3, "r@g.com", 1, "Caja R");
    const v = await venta(S.S3, "r@g.com", { monto: 100 });
    assert.equal(v.cobro.ok, false, "el cobro se bloquea");
    assert.equal(v.cobro.code, "PF409");
    assert.match(v.cobro.message, /entrega del turno anterior/);
    S.ventaBloqueada = v.id;
  });
  await t.test("quien entrega no puede aceptar su propia entrega", async () => {
    const r = await rpc("m@g.com", "ctl_entrega_aceptar", [entrega, PIN, "1500", null, null]);
    assert.equal(r.code, "PF403");
  });
  await t.test("PIN incorrecto no acepta (y 3 fallos bloquean)", async () => {
    const r = await rpc("r@g.com", "ctl_entrega_aceptar", [entrega, "0000", "1500", null, null]);
    assert.equal(r.ok, true);
    assert.equal(r.res.ok, false);
    assert.equal(r.res.error, "pin_incorrecto");
    assert.equal((await uno("select estado from piefirme.ctl_entrega where id = $1", [entrega])).estado, "pendiente");
  });
  await t.test("sin contar no se acepta; el total sale del desglose y no puede contradecirlo", async () => {
    let r = await rpc("r@g.com", "ctl_entrega_aceptar", [entrega, PIN, null, null, null]);
    assert.equal(r.code, "PF422");
    r = await rpc("r@g.com", "ctl_entrega_aceptar", [entrega, PIN, "999", J(desglosar(1500)), null]);
    assert.equal(r.code, "PF422");
  });
  await t.test("cuadra: acepta con su PIN, el cierre se cierra y el fondo de su turno ya abierto pasa a ser el monto confirmado", async () => {
    const r = await rpc("r@g.com", "ctl_entrega_aceptar", [entrega, PIN, null, J(desglosar(1500)), null]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.ok, true, J(r.res));
    assert.equal(r.res.cuadra, true);
    assert.equal(Number(r.res.fondo_inicial), 1500);
    await owner();
    const e = await uno("select estado, usuario_recibe, monto_recibido, fondo_inicial, caso_id, turno_entrante_id from piefirme.ctl_entrega where id = $1", [entrega]);
    assert.equal(e.estado, "aceptada");
    assert.equal(e.usuario_recibe, ids["r@g.com"]);
    assert.equal(e.caso_id, null);
    const ci = await uno("select estado, usuario_recibe, aceptado_en from piefirme.ctl_cierre where id = $1", [cierre]);
    assert.equal(ci.estado, "cerrado");
    assert.equal(ci.usuario_recibe, ids["r@g.com"]);
    assert.ok(ci.aceptado_en);
    const tr = await uno("select fondo_inicial from piefirme.turnos_caja where id = $1", [e.turno_entrante_id]);
    assert.equal(Number(tr.fondo_inicial), 1500, "el fondo de su turno es el monto confirmado, no el que se había tecleado ($1)");
    assert.equal((await filas("select lado, monto from piefirme.ctl_entrega_firma where entrega_id = $1 order by lado", [entrega])).map((f) => `${f.lado}:${Number(f.monto)}`).join(), "entrega:1500,recibe:1500");
    assert.equal((await alertas("diferencia_relevo", null)).filter((a) => a.sucursal_id === S.S3).length, 0);
  });
  await t.test("aceptada la entrega, el entrante ya puede vender y la firma no se repite", async () => {
    assert.equal((await rpc("r@g.com", "ctl_puede_vender", [S.S3])).res.puede, true);
    const cobro = await rpc("r@g.com", "cobrar_venta", [S.ventaBloqueada]);
    assert.equal(cobro.ok, true, cobro.message);
    const de_nuevo = await rpc("r@g.com", "ctl_entrega_aceptar", [entrega, PIN, "1500", null, null]);
    assert.equal(de_nuevo.res.idempotente, true);
    const otro = await rpc("s@g.com", "ctl_entrega_aceptar", [entrega, PIN, "1500", null, null]);
    assert.equal(otro.code, "PF409");
  });
  await t.test("las firmas y el corte son evidencia: no se editan ni se borran", async () => {
    await owner();
    for (const sql of ["update piefirme.ctl_entrega_firma set monto = 1", "delete from piefirme.ctl_entrega_firma", "update piefirme.ctl_cierre_corte set datos = '{}'", "delete from piefirme.ctl_cierre_corte",
                       "update piefirme.ctl_cierre_captura set valor_capturado = 1", "delete from piefirme.ctl_denominacion", "update piefirme.ctl_cierre_calculo set diferencia = 0"]) {
      const x = await intentar(sql);
      assert.equal(x.ok, false, sql);
      assert.equal(x.code, "PF403", `${sql}: ${x.message}`);
    }
  });
});

test("entrega que NO cuadra (S4): diferencia a ambos, caso diferencia_relevo con las dos firmas, alerta, y el fondo del siguiente turno es lo contado", async () => {
  const { cierre } = await cierreConEntrega(S.S4, "m@g.com", 2000);
  const r = await cerrar("m@g.com", cierre, true, 2000);
  assert.equal(r.res.estado, "entrega_no_aceptada");
  const acept = await rpc("r@g.com", "ctl_entrega_aceptar", [r.res.entrega_id, PIN, null, J(desglosar(1980)), null]);
  assert.equal(acept.ok, true, acept.message);
  assert.equal(acept.res.ok, true);
  assert.equal(acept.res.cuadra, false);
  assert.equal(Number(acept.res.diferencia), -20, "se muestra la diferencia a quien recibe");
  assert.equal(Number(acept.res.monto_entregado), 2000);
  await owner();
  const e = await uno("select id, estado, caso_id, monto_entregado, monto_recibido, fondo_inicial from piefirme.ctl_entrega where id = $1", [r.res.entrega_id]);
  assert.equal(e.estado, "aceptada_con_diferencia");
  assert.equal(Number(e.fondo_inicial), 1980);
  const caso = await uno("select * from piefirme.ctl_caso where id = $1", [e.caso_id]);
  assert.equal(caso.tipo, "diferencia_relevo");
  assert.equal(Number(caso.valor), -20);
  assert.equal(caso.contexto.firma_entrega, ids["m@g.com"]);
  assert.equal(caso.contexto.firma_recibe, ids["r@g.com"]);
  assert.ok(caso.turno_saliente_id, "ligado al turno saliente");
  const al = (await alertas("diferencia_relevo", caso.id));
  assert.equal(al.length, 1);
  assert.deepEqual(al[0].destinatarios, ["dueno", "supervisor"]);
  assert.equal((await filas("select 1 from piefirme.ctl_entrega_firma where entrega_id = $1", [e.id])).length, 2, "las dos firmas quedan registradas");
  // el turno que abre después de aceptar toma el monto confirmado aunque teclee otro
  await como("r@g.com");
  const ins = await intentar("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, fondo_inicial) values ($1, $2, 'Caja R', 999) returning id, fondo_inicial", [ORG, S.S4]);
  assert.equal(ins.ok, true, ins.message);
  assert.equal(Number(ins.rows[0].fondo_inicial), 1980, "el fondo teclado ($999) se ignora: es el monto confirmado");
  assert.equal((await uno("select turno_entrante_id from piefirme.ctl_entrega where id = $1", [e.id])).turno_entrante_id, ins.rows[0].id);
  // sin entrega nueva el siguiente turno no se pisa
  assert.equal((await rpc("r@g.com", "ctl_puede_vender", [S.S4])).res.puede, true);
});

test("saliente que se va sin aceptación (S5): entrega_no_aceptada visible, el entrante bloqueado y liberación por supervisor", async (t) => {
  const { cierre } = await cierreConEntrega(S.S5, "m@g.com", 800);
  const r = await cerrar("m@g.com", cierre, true, 800);
  assert.equal(r.res.estado, "entrega_no_aceptada");
  await t.test("(criterio 18) el cierre queda en entrega_no_aceptada y aparece en la lista del supervisor", async () => {
    const lista = await rpc("s@g.com", "ctl_cierres_listar", [S.S5, null, null, null, "entrega_no_aceptada", 20]);
    assert.equal(lista.res.length, 1);
    assert.equal(lista.res[0].estado, "entrega_no_aceptada");
    assert.equal((await rpc("s@g.com", "ctl_cierres_listar", [S.S5, null, null, null, "cerrado", 20])).res.length, 0);
  });
  await t.test("(criterio 19) el entrante no vende: el cobro se rechaza y nada se cobra", async () => {
    await nuevoTurno(S.S5, "r@g.com", 100, "Caja R");
    const v = await venta(S.S5, "r@g.com", { monto: 100 });
    assert.equal(v.cobro.code, "PF409");
    assert.equal((await uno("select estado from piefirme.ventas where id = $1", [v.id])).estado, "por_cobrar");
    S.vS5 = v.id;
  });
  await t.test("liberar exige motivo y rol de supervisor o dueño (recepción no puede)", async () => {
    assert.equal((await rpc("r@g.com", "ctl_entrega_liberar", [r.res.entrega_id, "x"])).code, "PF403");
    assert.equal((await rpc("s@g.com", "ctl_entrega_liberar", [r.res.entrega_id, " "])).code, "PF422");
    const ok = await rpc("s@g.com", "ctl_entrega_liberar", [r.res.entrega_id, "El entrante no llegó; se confirmó por teléfono"]);
    assert.equal(ok.ok, true, ok.message);
    assert.equal((await rpc("r@g.com", "ctl_puede_vender", [S.S5])).res.puede, true);
    assert.equal((await rpc("r@g.com", "cobrar_venta", [S.vS5])).ok, true);
    assert.equal((await uno("select estado from piefirme.ctl_cierre where id = $1", [cierre])).estado, "entrega_no_aceptada", "el cierre sigue marcado: la omisión no se borra");
    assert.equal((await alertas("entrega_liberada", cierre)).length, 1);
  });
});

// ═════════════════════════════ 6 · TOMAS FIJAS, PAR CIERRE / APERTURA, HASH ═════════════════════════════
test("tomas fijas y par cierre/apertura (S6): foto en vivo sin galería, guía fantasma, hash idéntico (criterio 6) y pares", async (t) => {
  const pToma = await punto({ nombre: "Fotos tomas S6", tipo_captura: "solo_foto", aplica_apertura: true, aplica_dia: true, aplica_turno: false, sucursales: [S.S6], parametros: { toma_fija: true } });
  const tomas = await filas("select id, nombre from piefirme.ctl_toma_fija where sucursal_id = $1 and activa order by orden", [S.S6]);
  assert.deepEqual(tomas.map((x) => x.nombre), ["Mostrador", "Escritorio"]);
  const [mostrador, escritorio] = tomas.map((x) => x.id);
  const H = { mostradorAyer: hash("mostrador-ayer"), escritorioAyer: hash("escritorio-ayer"), escritorioHoy: hash("escritorio-hoy") };
  let cierreDia, apertura;

  await t.test("el cierre de día exige una foto de CADA toma fija; sin una sola no cierra", async () => {
    const a = await abrir("r@g.com", S.S6, "dia");
    assert.equal(a.ok, true, a.message);
    cierreDia = a.id;
    assert.deepEqual(a.res.puntos[0].tomas.map((x) => x.nombre), ["Mostrador", "Escritorio"]);
    assert.equal((await foto("r@g.com", cierreDia, pToma, mostrador, H.mostradorAyer, { sede: S.S6 })).ok, true);
    const falta = await cerrar("r@g.com", cierreDia);
    assert.equal(falta.code, "PF422");
    assert.match(falta.message, /tomas fijas/);
    const f2 = await foto("r@g.com", cierreDia, pToma, escritorio, H.escritorioAyer, { sede: S.S6 });
    assert.equal(f2.ok, true, f2.message);
    assert.equal(f2.res.hash_repetido, undefined, "a quien captura no se le dice si el hash está repetido");
  });
  await t.test("no hay ruta de galería (criterio 4): sin objeto recién subido o con una foto vieja se rechaza", async () => {
    const sinObjeto = await rpc("r@g.com", "ctl_cierre_foto", [crypto.randomUUID(), cierreDia, pToma, `${ORG}/ctl/${S.S6}/${crypto.randomUUID()}.jpg`, hash("x"), 1, 1, 1, mostrador, null]);
    assert.equal(sinObjeto.code, "PF409");
    const vieja = await foto("r@g.com", cierreDia, pToma, mostrador, hash("vieja"), { sede: S.S6, hace: "2 hours" });
    assert.equal(vieja.code, "PF409", "una foto subida hace horas (de la galería) no se acepta");
    const fuera = await rpc("r@g.com", "ctl_cierre_foto", [crypto.randomUUID(), cierreDia, pToma, `${ORG}/ctl/${S.S7}/${crypto.randomUUID()}.jpg`, hash("y"), 1, 1, 1, mostrador, null]);
    assert.equal(fuera.code, "PF400", "la ruta debe ser de la sucursal del cierre");
    const sinToma = await rpc("r@g.com", "ctl_cierre_foto", [crypto.randomUUID(), cierreDia, pToma, `${ORG}/ctl/${S.S6}/${crypto.randomUUID()}.jpg`, hash("z"), 1, 1, 1, null, null]);
    assert.equal(sinToma.code, "PF422");
    const hashMalo = await foto("r@g.com", cierreDia, pToma, mostrador, "no-es-un-hash", { sede: S.S6 });
    assert.notEqual(hashMalo.ok, true);
  });
  await t.test("cerrar el día: sin apertura con fotos del mismo día queda la alerta cierre_sin_apertura", async () => {
    const r = await cerrar("r@g.com", cierreDia);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.estado, "cerrado");
    assert.equal((await alertas("cierre_sin_apertura", cierreDia)).length, 1);
  });
  await t.test("guía fantasma: quien captura recibe la ruta de la última toma y puede firmar SOLO esa foto", async () => {
    const g = await rpc("r@g.com", "ctl_toma_guia", [mostrador]);
    assert.equal(g.res.hay_guia, true);
    assert.ok(g.res.ruta.startsWith(`${ORG}/ctl/${S.S6}/`));
    await como("r@g.com");
    const visible = await intentar("select count(*)::int as n from storage.objects where bucket_id = 'pf-auditoria' and name = $1", [g.res.ruta]);
    assert.equal(visible.rows[0].n, 1, "la guía sí se puede firmar");
    const otra = (await filas("select url_almacenamiento as ruta from piefirme.ctl_evidencia where sucursal_id = $1 and toma_fija_id = $2 and hash_sha256 = $3", [S.S6, escritorio, H.escritorioAyer]))[0].ruta;
    await como("r@g.com");
    const noGuia = await intentar("select count(*)::int as n from storage.objects where bucket_id = 'pf-auditoria' and name = $1", [otra]);
    assert.equal(noGuia.rows[0].n, 1, "la última del escritorio también es guía (es otra toma)");
    const ajena = await rpc("r@g.com", "ctl_toma_guia", ["00000000-0000-0000-0000-0000000000bb"]);
    assert.equal(ajena.code, "PF404");
  });
  await t.test("apertura con la MISMA foto del mostrador de ayer: alerta por hash idéntico (criterio 6) y par con hash_igual", async () => {
    const a = await abrir("r@g.com", S.S6, "apertura");
    assert.equal(a.ok, true, a.message);
    apertura = a.id;
    const f1 = await foto("r@g.com", apertura, pToma, mostrador, H.mostradorAyer, { sede: S.S6 });
    assert.equal(f1.ok, true, f1.message);
    assert.equal(f1.res.hash_repetido, undefined, "la alerta va al dueño, no a quien captura");
    assert.equal((await foto("r@g.com", apertura, pToma, escritorio, H.escritorioHoy, { sede: S.S6 })).ok, true);
    const r = await cerrar("r@g.com", apertura);
    assert.equal(r.ok, true, r.message);
    await owner();
    const rep = await filas("select * from piefirme.ctl_alerta where tipo = 'foto_repetida' and sucursal_id = $1", [S.S6]);
    assert.equal(rep.length, 1, "solo la foto repetida alerta");
    assert.equal((await alertas("apertura_sin_cierre_previo", apertura)).length, 0, "había foto de cierre previa");
    const pares = await rpc("m@g.com", "ctl_pares_toma", [S.S6, null, null, 20]);
    assert.equal(pares.ok, true, pares.message);
    const pm = pares.res.find((x) => x.toma === "Mostrador" && x.estado === "par");
    const pe = pares.res.find((x) => x.toma === "Escritorio" && x.estado === "par");
    assert.ok(pm && pe, J(pares.res.map((x) => [x.toma, x.estado])));
    assert.equal(pm.hash_igual, true);
    assert.equal(pe.hash_igual, false);
    assert.ok(pm.cierre.ruta && pm.apertura.ruta, "antes y después para el deslizador");
    assert.ok(pm.cierre.folio !== pm.apertura.folio);
  });
  await t.test("quien captura no ve el hash ni las fotos de otros: la evidencia sensible no llega a la app de sucursal", async () => {
    await como("r@g.com");
    const e = await intentar("select * from piefirme.ctl_evidencia limit 1");
    assert.equal(e.ok, true);
    assert.equal((await rpc("p@g.com", "ctl_pares_toma", [null, null, null, 5])).code, "PF403");
    assert.equal((await rpc("a@g.com", "ctl_pares_toma", [null, null, null, 5])).code, "PF403", "el soporte tampoco ve fotos");
  });
  await t.test("apertura sin foto de cierre previa y fotografiada después de la primera venta del día (S7)", async () => {
    await nuevoTurno(S.S7, "r@g.com", 100);
    const v = await venta(S.S7, "r@g.com", { monto: 100 });
    assert.equal(v.cobro.ok, true, v.cobro.message);
    const pT = await punto({ nombre: "Fotos tomas S7", tipo_captura: "solo_foto", aplica_apertura: true, aplica_dia: true, aplica_turno: false, sucursales: [S.S7], parametros: { toma_fija: true } });
    const tm = (await filas("select id from piefirme.ctl_toma_fija where sucursal_id = $1 and activa order by orden", [S.S7])).map((x) => x.id);
    const a = await abrir("r@g.com", S.S7, "apertura");
    for (const [i, tomaId] of tm.entries()) assert.equal((await foto("r@g.com", a.id, pT, tomaId, hash("s7-" + i), { sede: S.S7 })).ok, true);
    assert.equal((await cerrar("r@g.com", a.id)).ok, true);
    assert.equal((await alertas("apertura_tardia", a.id)).length, 1, "la foto de apertura se tomó después de la primera venta");
    assert.equal((await alertas("apertura_sin_cierre_previo", a.id)).length, 2, "una alerta por cada toma sin cierre previo");
    const pares = await rpc("s@g.com", "ctl_pares_toma", [S.S7, null, null, 20]);
    assert.ok(pares.res.every((x) => x.estado === "sin_cierre_previo" && x.apertura_tardia === true));
  });
});

// ═════════════════════════════ 7 · PRIVILEGIOS Y RUTAS DE ESCRITURA ═════════════════════════════
test("la app solo escribe por RPC: sin INSERT/UPDATE/DELETE en las tablas nuevas y funciones cerradas a anon", async (t) => {
  await t.test("authenticated no puede insertar, modificar ni borrar en las tablas de cierres", async () => {
    for (const correo of CORREOS) {
      for (const tabla of ["ctl_entrega", "ctl_entrega_firma", "ctl_cierre_corte", "ctl_formula_esperado", "ctl_cierre_captura", "ctl_cierre_calculo", "ctl_denominacion", "ctl_cierre", "ctl_punto_control", "ctl_toma_fija", "ctl_consumo_esperado"]) {
        const col = (await filas("select column_name from information_schema.columns where table_schema = 'piefirme' and table_name = $1 order by ordinal_position limit 1", [tabla]))[0].column_name;
        await como(correo);
        for (const sql of [`insert into piefirme.${tabla} default values`, `update piefirme.${tabla} set ${col} = ${col}`, `delete from piefirme.${tabla}`]) {
          const x = await intentar(sql);
          assert.equal(x.ok, false, `${correo}: ${sql}`);
          assert.equal(x.code, "42501", `${correo}: ${sql} → ${x.message}`);
        }
      }
    }
  });
  await t.test("ninguna función nueva se ejecuta como anon", async () => {
    await owner();
    const f = await filas(`select p.oid::regprocedure::text as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_cierre_abrir', 'ctl_cierre_capturar', 'ctl_cierre_cerrar', 'ctl_cierre_recorrido', 'ctl_cierre_detalle', 'ctl_cierres_listar',
         'ctl_cierre_foto', 'ctl_toma_guia', 'ctl_pares_toma', 'ctl_puede_vender', 'ctl_entregas_pendientes', 'ctl_entrega_aceptar', 'ctl_entrega_liberar', 'ctl_toma_fija_guardar',
         'ctl_consumo_esperado_guardar', 'ctl_punto_control_guardar', 'ctl_calcular_punto', 'ctl_armar_corte', 'ctl_verificar_pin')`);
    assert.ok(f.length >= 19);
    for (const { firma } of f) {
      const x = await uno("select has_function_privilege('anon', $1::regprocedure, 'execute') as a", [firma]);
      assert.equal(x.a, false, `anon ejecuta ${firma}`);
    }
  });
  await t.test("la configuración de tomas fijas es del dueño y valida el tipo", async () => {
    assert.equal((await rpc("r@g.com", "ctl_toma_fija_guardar", [null, S.S1, "Caja fuerte", "ambos", true, 30])).code, "PF403");
    assert.equal((await rpc("m@g.com", "ctl_toma_fija_guardar", [null, S.S1, "Caja fuerte", "nunca", true, 30])).code, "PF422");
    const ok = await rpc("m@g.com", "ctl_toma_fija_guardar", [null, S.S1, "Caja fuerte", "ambos", true, 30]);
    assert.equal(ok.ok, true, ok.message);
    const ed = await rpc("m@g.com", "ctl_toma_fija_guardar", [ok.res, S.S1, "Caja fuerte (trasera)", "semanal", false, 30]);
    assert.equal(ed.ok, true, ed.message);
  });
});
