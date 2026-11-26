// Pruebas del módulo «Control y Auditoría» (Etapa 0) contra la base QA.   node --test scripts/test-auditoria-qa.mjs
//
// Dos niveles:
//   1) BASE DE DATOS en UNA transacción que SIEMPRE se deshace (no deja filas, ni folios, ni movimientos de inventario):
//      se siembra como dueño de la base y se actúa «como» cada cuenta de prueba (SET LOCAL ROLE authenticated + claims JWT), igual que
//      scripts/test-rls.mjs. Cubre: reglas duras de roles, captura a ciegas, topes de configuración, tope de 30 en custodia, inmutabilidad,
//      folios sin huecos, hora del servidor, hash repetido, PIN, idempotencia del ajuste y separación de funciones al autorizar.
//   2) HTTP REAL (PostgREST con el token de cada cuenta): lo que de verdad recibe un navegador (solo lecturas y rechazos; no persiste nada).
// Cuentas (clave 123456, solo QA; scripts/qa-usuarios-prueba.mjs): a superadmin(soporte) · m dueño · s supervisora · p podólogo · r recepción.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { ambiente, conectar } from "./lib/env.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const SEDE_A = "5e000000-0000-0000-0000-000000000001";   // Chalco (p@g.com trabaja aquí)
const SEDE_B = "5e000000-0000-0000-0000-000000000002";   // Centenario
const CORREOS = ["a@g.com", "m@g.com", "s@g.com", "p@g.com", "r@g.com"];
const PROHIBIDO = /^(saldo_sistema|diferencia_piezas|diferencia_valor|diferencia_precio|diferencia|valor_esperado|valor_diferencia|precio_catalogo|partidas_con_diferencia|dentro_tolerancia|clasificacion_precio|existencia|saldo)$/;

const c = await conectar(cfg);
const ids = {};
let n = 0, prod, causa, ses, part, hoy;

const owner = async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); };
async function como(correo) {
  await owner();
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[correo], role: "authenticated", email: correo })]);
  await c.query("set local role authenticated");
}
/** Ejecuta con savepoint: un error no aborta la transacción. */
async function intentar(sql, params = []) {
  const sp = `sp_${++n}`;
  await c.query(`savepoint ${sp}`);
  try { const r = await c.query(sql, params); await c.query(`release savepoint ${sp}`); return { ok: true, rows: r.rows, r }; }
  catch (e) { await c.query(`rollback to savepoint ${sp}`); return { ok: false, code: e.code, message: e.message }; }
}
const rpc = async (correo, fn, args = []) => {
  await como(correo);
  const marcas = args.map((_, i) => `$${i + 1}`).join(", ");
  return intentar(`select piefirme.${fn}(${marcas}) as r`, args);
};
const uno = async (sql, params) => (await c.query(sql, params)).rows[0];

before(async () => {
  await c.query("begin");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  prod = (await uno("select id from piefirme.productos where organizacion_id = $1 and estado = 'activo' order by nombre limit 1", [ORG])).id;
  causa = (await uno("select id from piefirme.ctl_causa where organizacion_id = $1 order by orden limit 1", [ORG])).id;
  hoy = (await uno("select now() as t")).t;
  // semilla como dueño de la base: sesión de conteo de r@g.com en Chalco con una partida y su cálculo (lo que el sistema esperaba)
  ses = (await uno(`insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, usuario_captura, creado_por)
                    values ($1, $2, 'conteo_apertura', 'completa', $3, $3) returning id, folio`, [ORG, SEDE_A, ids["r@g.com"]]));
  part = (await uno(`insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, creado_por)
                     values ($1, $2, $3, $4, 'PRUEBA-1', 3, $5) returning id`, [ORG, SEDE_A, ses.id, prod, ids["r@g.com"]])).id;
  await c.query(`insert into piefirme.ctl_partida_calculo (partida_id, organizacion_id, sucursal_id, sesion_id, producto_id, saldo_sistema, diferencia_piezas, costo_unitario, diferencia_valor, precio_catalogo)
                 values ($1, $2, $3, $4, $5, 5, -2, 10, -20, 99)`, [part, ORG, SEDE_A, ses.id, prod]);
  await c.query("insert into piefirme.ctl_sesion_resultado (sesion_id, organizacion_id, sucursal_id, partidas_con_diferencia, valor_diferencia) values ($1, $2, $3, 1, -20)", [ses.id, ORG, SEDE_A]);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });   // siempre se deshace todo, aunque una prueba haya abortado la transacción

// ═════════════════════════════ 1 · CAPTURA A CIEGAS ═════════════════════════════
test("captura a ciegas: ningún rol de sucursal recibe saldo, diferencia ni valor esperado (criterio 1)", async (t) => {
  const SENSIBLES = ["ctl_partida_calculo", "ctl_partida_revision", "ctl_sesion_resultado", "ctl_sesion_revision", "ctl_cierre_calculo", "ctl_cierre_revision",
    "ctl_caso", "ctl_caso_bitacora", "ctl_alerta", "ctl_llamada_origen", "ctl_eventos_entrada", "ctl_discrepancia_hora", "ctl_consumo_esperado",
    "v_ctl_productos", "v_ctl_saldos", "v_ctl_movimientos", "v_ctl_ventas", "v_ctl_cancelaciones", "v_ctl_turnos"];
  for (const correo of ["r@g.com", "p@g.com"]) {
    await t.test(`${correo}: cero filas en todo lo sensible`, async () => {
      for (const rel of SENSIBLES) {
        await como(correo);
        const r = await intentar(`select count(*)::int as n from piefirme.${rel}`);
        assert.ok(r.ok, `${correo} ${rel}: ${r.message}`);
        assert.equal(r.rows[0].n, 0, `${correo} ve filas de ${rel}`);
      }
    });
    await t.test(`${correo}: toda relación ctl_* que devuelve filas no tiene columnas de saldo/diferencia`, async () => {
      await owner();
      const rels = (await c.query(`select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                     where n.nspname = 'piefirme' and c.relkind in ('r', 'v') and (c.relname like 'ctl\\_%' or c.relname like 'v\\_ctl\\_%')`)).rows;
      let conFilas = 0;
      for (const { relname } of rels) {
        await como(correo);
        const r = await intentar(`select * from piefirme.${relname} limit 1`);
        if (!r.ok || !r.rows.length) continue;
        conFilas++;
        const prohibidas = Object.keys(r.rows[0]).filter((k) => PROHIBIDO.test(k));
        assert.deepEqual(prohibidas, [], `${correo} recibe ${prohibidas} desde ${relname}`);
      }
      assert.ok(conFilas >= 2, "debe poder ver al menos la captura y el catálogo de escaneo");
    });
    await t.test(`${correo}: la vista de captura no tiene campos prohibidos aunque no haya filas`, async () => {
      await owner();
      for (const rel of ["ctl_partida_captura", "ctl_cierre_puntos", "ctl_producto_captura", "ctl_sesion_conteo", "ctl_partida_conteo", "ctl_cierre_captura", "ctl_lista_solicitada"]) {
        const cols = (await c.query("select column_name from information_schema.columns where table_schema = 'piefirme' and table_name = $1", [rel])).rows.map((x) => x.column_name);
        assert.ok(cols.length, rel);
        assert.deepEqual(cols.filter((k) => PROHIBIDO.test(k)), [], `${rel} expone ${cols.filter((k) => PROHIBIDO.test(k))}`);
      }
    });
    await t.test(`${correo}: captura sí ve la partida pero sin saldo`, async () => {
      await como(correo);
      const r = await intentar("select * from piefirme.ctl_partida_captura where id = $1", [part]);
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].cantidad_fisica, "3.000");
      assert.equal("saldo_sistema" in r.rows[0], false);
    });
    await t.test(`${correo}: ninguna RPC de revisión le responde`, async () => {
      for (const [fn, args] of [["ctl_huecos_folios", []], ["ctl_config_efectiva", [null]], ["ctl_registrar_consulta", ["diferencias", "{}"]],
                                ["ctl_soporte_leer", ["ctl_caso", "{}", 10]], ["ctl_config_guardar", ["muestra_aleatoria", null, "50", false, null]]]) {
        const r = await rpc(correo, fn, args);
        assert.equal(r.ok, false, `${correo} pudo ejecutar ${fn}`);
        assert.equal(r.code, "PF403", `${fn}: ${r.message}`);
      }
    });
    await t.test(`${correo}: su rol del módulo solo captura`, async () => {
      const r = await rpc(correo, "ctl_mi_rol");
      assert.deepEqual(r.rows[0].r.capacidades, ["capturar"]);
      assert.equal(r.rows[0].r.rol, "sucursal");
    });
  }
});

test("supervisor y dueño sí ven lo calculado; el supervisor no autoriza ni configura (reglas duras)", async () => {
  for (const correo of ["s@g.com", "m@g.com"]) {
    await como(correo);
    const r = await intentar("select saldo_sistema, diferencia_piezas, caso_id from piefirme.ctl_partida_revision where id = $1", [part]);
    assert.equal(r.rows.length, 1, correo);
    assert.equal(r.rows[0].saldo_sistema, "5.000");
    assert.equal(r.rows[0].diferencia_piezas, "-2.000");
  }
  let r = await rpc("s@g.com", "ctl_mi_rol");
  assert.deepEqual(r.rows[0].r.capacidades, ["capturar", "ver_diferencias", "investigar"]);
  r = await rpc("m@g.com", "ctl_mi_rol");
  assert.deepEqual(r.rows[0].r.capacidades, ["capturar", "ver_diferencias", "investigar", "autorizar", "configurar"]);
  r = await rpc("a@g.com", "ctl_mi_rol");
  assert.equal(r.rows[0].r.rol, "soporte");
  assert.deepEqual(r.rows[0].r.capacidades, ["ver_diferencias", "configurar"]);
  r = await rpc("s@g.com", "ctl_config_guardar", ["muestra_aleatoria", null, "50", false, null]);
  assert.equal(r.code, "PF403");
  r = await rpc("s@g.com", "ctl_autorizar_ajuste", [ses.id, "123456"]);
  assert.equal(r.code, "PF403");
  r = await rpc("a@g.com", "ctl_autorizar_ajuste", [ses.id, "123456"]);
  assert.equal(r.code, "PF403", "el soporte no autoriza");
  r = await rpc("a@g.com", "ctl_pin_abrir_sesion", ["1234", SEDE_A, null, null]);
  assert.equal(r.code, "PF403", "el soporte no captura");
});

test("el soporte RANNIX lee solo por RPC y cada lectura queda en bitácora", async () => {
  await como("a@g.com");
  let r = await intentar("select count(*)::int as n from piefirme.ctl_partida_calculo");
  assert.equal(r.rows[0].n, 0, "sin lectura directa");
  r = await rpc("a@g.com", "ctl_soporte_leer", ["ctl_partida_revision", JSON.stringify({ sesion_id: ses.id }), 50]);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].r.length, 1);
  assert.equal(Number(r.rows[0].r[0].saldo_sistema), 5);
  await owner();
  const b = await uno("select count(*)::int as n from piefirme.ctl_bitacora_consulta where reporte = 'soporte:ctl_partida_revision' and usuario_id = $1", [ids["a@g.com"]]);
  assert.equal(b.n, 1);
  r = await rpc("m@g.com", "ctl_soporte_leer", ["ctl_caso", "{}", 5]);
  assert.equal(r.code, "PF403", "el dueño lee por pantalla, no por la ruta de soporte");
  r = await rpc("a@g.com", "ctl_soporte_leer", ["perfiles", "{}", 5]);
  assert.equal(r.code, "PF403", "objeto fuera de la lista");
});

test("bitácora de consultas: quién consultó el reporte de diferencias", async () => {
  let r = await rpc("s@g.com", "ctl_registrar_consulta", ["diferencias", JSON.stringify({ desde: "2026-11-01" })]);
  assert.equal(r.ok, true, r.message);
  await como("m@g.com");
  const v = await intentar("select usuario_id, rol_ctl, reporte, filtros from piefirme.ctl_bitacora_consulta where reporte = 'diferencias'");
  assert.equal(v.rows.length, 1);
  assert.equal(v.rows[0].usuario_id, ids["s@g.com"]);
  assert.equal(v.rows[0].rol_ctl, "supervisor");
  await como("s@g.com");
  const s = await intentar("select count(*)::int as n from piefirme.ctl_bitacora_consulta");
  assert.equal(s.rows[0].n, 0, "el supervisor no audita a sus pares");
});

// ═════════════════════════════ 2 · INMUTABILIDAD ═════════════════════════════
test("inmutabilidad: UPDATE/DELETE directo sobre la partida con el usuario de la app = permiso denegado (criterio 8)", async () => {
  for (const correo of ["m@g.com", "r@g.com", "s@g.com", "a@g.com"]) {
    await como(correo);
    for (const sql of ["update piefirme.ctl_partida_conteo set cantidad_fisica = 99", "delete from piefirme.ctl_partida_conteo",
                       "update piefirme.ctl_partida_calculo set saldo_sistema = 0", "update piefirme.ctl_caso set estado = 'rechazada'",
                       "insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica) values ($1, $2, $3, $4, 'x', 1)",
                       "truncate piefirme.ctl_partida_conteo", "delete from piefirme.ctl_caso_bitacora", "update piefirme.ctl_config_bitacora set motivo = 'x'"]) {
      const r = await intentar(sql, sql.startsWith("insert") ? [ORG, SEDE_A, ses.id, prod] : []);
      assert.equal(r.ok, false, `${correo}: ${sql}`);
      assert.equal(r.code, "42501", `${correo}: ${sql} → ${r.message}`);
      assert.match(r.message, /permission denied|permiso denegado/i);
    }
  }
});

test("inmutabilidad en profundidad: aun con privilegios, el trigger bloquea UPDATE/DELETE/TRUNCATE de las tablas de captura", async () => {
  await owner();
  // el trigger es por fila: hay que tener filas que tocar
  await c.query("insert into piefirme.ctl_config_bitacora (organizacion_id, clave, valor_nuevo) values ($1, 'ocupacion_min_min', '7'::jsonb)", [ORG]);
  const kb = await uno(`insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, estado) values ($1, $2, 'diferencia_inventario', 'partida_conteo', 'abierta') returning id`, [ORG, SEDE_A]);
  await c.query("insert into piefirme.ctl_caso_bitacora (organizacion_id, caso_id, tipo, texto) values ($1, $2, 'comentario', 'x')", [ORG, kb.id]);
  await c.query("insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values ($1, $2, 'pin', true)", [ORG, ids["r@g.com"]]);
  for (const sql of ["update piefirme.ctl_partida_conteo set nota = 'cambio'", "delete from piefirme.ctl_partida_conteo",
                     "update piefirme.ctl_partida_calculo set saldo_sistema = 0", "truncate piefirme.ctl_partida_conteo cascade",
                     "update piefirme.ctl_config_bitacora set motivo = 'x'", "delete from piefirme.ctl_caso_bitacora", "update piefirme.ctl_intento set exito = true"]) {
    const r = await intentar(sql);
    assert.equal(r.ok, false, sql);
    assert.equal(r.code, "PF403", `${sql} → ${r.message}`);
  }
  const x = await uno("select cantidad_fisica::text, nota from piefirme.ctl_partida_conteo where id = $1", [part]);
  assert.equal(x.cantidad_fisica, "3.000");
});

test("tablas con estado: solo cambian dentro de una RPC y con transiciones válidas", async () => {
  await owner();
  const k = await uno(`insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, valor, estado, usuario_captura, causa_id)
                       values ($1, $2, 'diferencia_inventario', 'partida_conteo', $3, $4, -2, -20, 'abierta', $5, $6) returning id, folio`, [ORG, SEDE_A, part, prod, ids["r@g.com"], causa]);
  let r = await intentar("update piefirme.ctl_caso set estado = 'en_investigacion' where id = $1", [k.id]);
  assert.equal(r.code, "PF403", "sin la bandera de RPC no se cambia");
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  r = await intentar("update piefirme.ctl_caso set estado = 'cerrada_con_ajuste' where id = $1", [k.id]);
  assert.equal(r.code, "PF409", "abierta → cerrada_con_ajuste no es una transición válida");
  r = await intentar("update piefirme.ctl_caso set estado = 'en_investigacion' where id = $1", [k.id]);
  assert.equal(r.ok, true, r.message);
  r = await intentar("update piefirme.ctl_caso set folio = 'CAS-2000-00001' where id = $1", [k.id]);
  assert.equal(r.code, "PF403", "el folio no se reasigna");
  r = await intentar("update piefirme.ctl_caso set creado_por = $2 where id = $1", [k.id, ids["m@g.com"]]);
  assert.equal(r.code, "PF403", "el autor no se reasigna");
  r = await intentar("delete from piefirme.ctl_caso where id = $1", [k.id]);
  assert.equal(r.code, "PF403");
  await c.query("select set_config('app.ctl_rpc', '', true)");
});

// ═════════════════════════════ 3 · HORA DEL SERVIDOR, FOLIOS ═════════════════════════════
test("hora del servidor: creado_en lo pone el servidor y la discrepancia > 5 min queda registrada (criterio 5)", async () => {
  await owner();
  const p = await uno(`insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, creado_en, escaneado_en, hora_cliente, creado_por)
                       values ($1, $2, $3, $4, 'HORA-1', 1, '2001-01-01', '2001-01-01', now() - interval '3 hours', $5) returning id, creado_en, escaneado_en, hora_cliente`,
                      [ORG, SEDE_A, ses.id, prod, ids["r@g.com"]]);
  const ahora = (await uno("select now() as t")).t;
  assert.equal(new Date(p.creado_en).getTime(), new Date(ahora).getTime(), "creado_en = now() del servidor, no el que mandó el cliente");
  assert.equal(new Date(p.escaneado_en).getTime(), new Date(ahora).getTime());
  const d = await uno("select diferencia_seg, tabla from piefirme.ctl_discrepancia_hora where registro_id = $1", [p.id]);
  assert.ok(d, "se registra la discrepancia");
  assert.ok(Math.abs(d.diferencia_seg + 3 * 3600) <= 2);
  const p2 = await uno(`insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, hora_cliente)
                        values ($1, $2, $3, $4, 'HORA-2', 1, now() - interval '2 minutes') returning id`, [ORG, SEDE_A, ses.id, prod]);
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_discrepancia_hora where registro_id = $1", [p2.id])).n, 0, "dentro de 5 min no se registra");
  await como("m@g.com");
  const v = await intentar("select count(*)::int as n from piefirme.ctl_discrepancia_hora");
  assert.ok(v.rows[0].n >= 1, "el dueño la ve");
});

test("folios consecutivos sin huecos y detectables (casos, cierres, sesiones)", async () => {
  await owner();
  const f = [];
  // tres tipos distintos: desde la Etapa 2 solo puede haber una sesión abierta por sucursal y tipo (índice ctl_sesion_abierta_uq)
  for (const tipo of ['auditoria_puntual', 'auditoria_remota', 'conteo_inicial']) {
    f.push((await uno(`insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, folio) values ($1, $2, $3, 'libre', 'MI-FOLIO') returning folio, folio_num`, [ORG, SEDE_B, tipo])).folio_num);
  }
  assert.equal(f[1], f[0] + 1);
  assert.equal(f[2], f[0] + 2);
  const cie = await uno("insert into piefirme.ctl_cierre (organizacion_id, sucursal_id, tipo) values ($1, $2, 'turno') returning folio", [ORG, SEDE_B]);
  assert.match(cie.folio, /^CIE-\d{4}-\d{5}$/);
  let r = await rpc("m@g.com", "ctl_huecos_folios");
  assert.equal(r.ok, true, r.message);
  await como("m@g.com");
  r = await intentar("select * from piefirme.ctl_huecos_folios()");
  assert.equal(r.rows.length, 0, "sin huecos");
  await owner();
  await c.query("select set_config('app.ctl_purga', 'on', true)");
  const medio = await uno("select id, folio from piefirme.ctl_sesion_conteo where folio_num = $1 and organizacion_id = $2 and sucursal_id = $3", [f[1], ORG, SEDE_B]);
  await c.query("delete from piefirme.ctl_sesion_conteo where id = $1", [medio.id]);
  await c.query("select set_config('app.ctl_purga', '', true)");
  await como("m@g.com");
  r = await intentar("select * from piefirme.ctl_huecos_folios()");
  assert.deepEqual(r.rows.map((x) => x.folio_faltante), [medio.folio], "el hueco se detecta");
});

// ═════════════════════════════ 4 · CONFIGURACIÓN: TOPES DUROS Y VERSIONADO ═════════════════════════════
test("topes de configuración validados en base de datos", async (t) => {
  const casos = [["muestra_aleatoria", "101", /100/], ["descuento_sin_clave_pct", "16", /15/], ["dias_gracia_precio", "91", /90/],
                 ["retencion_fotos_dias", "366", /365/], ["foto_lado_largo_px", "2401", /2,?400/]];
  for (const [clave, valor, rx] of casos) {
    await t.test(`${clave} = ${valor} se rechaza con explicación`, async () => {
      const r = await rpc("m@g.com", "ctl_config_guardar", [clave, null, valor, false, null]);
      assert.equal(r.ok, false);
      assert.equal(r.code, "PF422");
      assert.match(r.message, /tope/i);
      assert.match(r.message, rx);
    });
    await t.test(`${clave} = ${valor} se rechaza AUNQUE se salte la RPC (trigger)`, async () => {
      await owner();
      const r = await intentar("insert into piefirme.ctl_config (organizacion_id, sucursal_id, clave, valor) values ($1, $2, $3, $4::jsonb)", [ORG, SEDE_A, clave, valor]);
      assert.equal(r.code, "PF422", r.message);
    });
  }
  await t.test("en el tope exacto sí se acepta y deja bitácora (quién, cuándo, anterior y nuevo)", async () => {
    const r = await rpc("m@g.com", "ctl_config_guardar", ["muestra_aleatoria", SEDE_A, "100", false, "prueba de tope"]);
    assert.equal(r.ok, true, r.message);
    await owner();
    const b = await uno("select valor_anterior, valor_nuevo, creado_por, creado_en, motivo from piefirme.ctl_config_bitacora where clave = 'muestra_aleatoria' and sucursal_id = $1", [SEDE_A]);
    assert.equal(b.valor_anterior, 20);
    assert.equal(b.valor_nuevo, 100);
    assert.equal(b.creado_por, ids["m@g.com"]);
    assert.ok(b.creado_en);
  });
  await t.test("tolerancia de kits > 0 exige confirmación del dueño (el soporte no puede confirmar)", async () => {
    let r = await rpc("m@g.com", "ctl_config_guardar", ["tolerancia_kits", null, "1", false, null]);
    assert.equal(r.code, "PF422");
    r = await rpc("a@g.com", "ctl_config_guardar", ["tolerancia_kits", null, "1", true, null]);
    assert.equal(r.code, "PF422", "soporte no confirma");
    r = await rpc("m@g.com", "ctl_config_guardar", ["tolerancia_kits", null, "1", true, "autorizo"]);
    assert.equal(r.ok, true, r.message);
    r = await rpc("m@g.com", "ctl_config_guardar", ["tolerancia_kits", null, "0", false, null]);
    assert.equal(r.ok, true, "volver a 0 no necesita confirmación");
  });
  await t.test("valor global por omisión, valor por sucursal y consulta histórica por fecha", async () => {
    await como("m@g.com");
    const ef = async (suc) => (await intentar("select clave, valor, origen from piefirme.ctl_config_efectiva($1)", [suc])).rows.find((x) => x.clave === "muestra_aleatoria");
    assert.deepEqual([(await ef(SEDE_A)).valor, (await ef(SEDE_A)).origen], [100, "sucursal"]);
    assert.deepEqual([(await ef(SEDE_B)).valor, (await ef(SEDE_B)).origen], [20, "omision"], "otra sucursal conserva el global/omisión");
    let r = await rpc("m@g.com", "ctl_config_guardar", ["muestra_aleatoria", null, "30", false, null]);
    assert.equal(r.ok, true);
    assert.equal((await ef(SEDE_B)).valor, 30);
    assert.equal((await ef(SEDE_B)).origen, "global");
    assert.equal((await ef(SEDE_A)).valor, 100, "la sucursal conserva el suyo");
    r = await rpc("m@g.com", "ctl_config_restablecer", ["muestra_aleatoria", SEDE_A, null]);
    assert.equal(r.ok, true);
    assert.equal((await ef(SEDE_A)).valor, 30, "al restablecer vuelve a regir el global");
    // histórico: antes de cualquier cambio rige la omisión
    await como("m@g.com");
    const antes = await intentar("select piefirme.ctl_config_valor_en('muestra_aleatoria', $1, now() - interval '1 day') as v", [SEDE_B]);
    assert.equal(antes.rows[0].v, 20, "un cierre anterior se consulta con la configuración de entonces");
    const ahora = await intentar("select piefirme.ctl_config_valor_en('muestra_aleatoria', $1, now()) as v", [SEDE_B]);
    assert.equal(ahora.rows[0].v, 30);
  });
});

test("catálogos: causas iniciales, puntos de control con versiones", async () => {
  await como("m@g.com");
  const causas = (await intentar("select nombre, requiere_nota from piefirme.ctl_causa order by orden")).rows;
  assert.deepEqual(causas.map((x) => x.nombre), ["Robo", "Merma o producto dañado", "Error de captura en venta", "Entrada de mercancía no registrada", "Traspaso no registrado", "Error en el conteo", "Otra"]);
  let r = await rpc("m@g.com", "ctl_causa_guardar", [null, "Caducidad", false, true]);
  assert.equal(r.ok, true, r.message);
  r = await rpc("m@g.com", "ctl_causa_guardar", [null, "Caducidad", false, true]);
  assert.equal(r.code, "PF409", "nombre repetido");
  r = await rpc("s@g.com", "ctl_causa_guardar", [null, "Otra cosa", false, true]);
  assert.equal(r.code, "PF403");
  await como("m@g.com");
  const pc = (await intentar("select id, nombre, version from piefirme.ctl_punto_control where activo and vigente_hasta is null order by orden limit 1")).rows[0];
  const antes = (await intentar("select count(*)::int as n from piefirme.ctl_punto_control where grupo_id = (select grupo_id from piefirme.ctl_punto_control where id = $1)", [pc.id])).rows[0].n;   // las siembras de la Etapa 4 ya traen versiones previas
  r = await rpc("m@g.com", "ctl_punto_control_guardar", [pc.id, JSON.stringify({ tolerancia: 50 })]);
  assert.equal(r.ok, true, r.message);
  await como("m@g.com");
  const vers = (await intentar("select version, tolerancia, vigente_hasta from piefirme.ctl_punto_control where grupo_id = (select grupo_id from piefirme.ctl_punto_control where id = $1) order by version", [pc.id])).rows;
  assert.equal(vers.length, antes + 1);
  assert.ok(vers.at(-2).vigente_hasta, "la versión anterior queda cerrada, no editada");
  assert.equal(vers.at(-2).tolerancia, "20.00");
  assert.equal(vers.at(-1).tolerancia, "50.00");
  assert.equal(vers.at(-1).version, vers.at(-2).version + 1);
});

// ═════════════════════════════ 5 · CUSTODIA: TOPE DE 30 ═════════════════════════════
test("custodia: no se pueden activar 31 productos en una sucursal (criterio 7)", async () => {
  await owner();
  for (let i = 0; i < 30; i++) await c.query("insert into piefirme.ctl_producto_custodia (organizacion_id, sucursal_id, producto_id) values ($1, $2, gen_random_uuid())", [ORG, SEDE_B]);
  let r = await intentar("insert into piefirme.ctl_producto_custodia (organizacion_id, sucursal_id, producto_id) values ($1, $2, gen_random_uuid())", [ORG, SEDE_B]);
  assert.equal(r.code, "PF422");
  assert.match(r.message, /30 productos/);
  assert.match(r.message, /evidencia falsa/, "la negativa explica por qué");
  r = await rpc("m@g.com", "ctl_custodia_activar", [SEDE_B, prod]);
  assert.equal(r.code, "PF422", r.message);
  // otra sucursal no se afecta
  r = await rpc("m@g.com", "ctl_custodia_activar", [SEDE_A, prod]);
  assert.equal(r.ok, true, r.message);
  // desactivar uno libera un lugar; reactivarlo con 30 activos ya no cabe
  await owner();
  const alguna = await uno("select id from piefirme.ctl_producto_custodia where sucursal_id = $1 limit 1", [SEDE_B]);
  await c.query("select set_config('app.ctl_rpc', 'on', true)");
  await c.query("update piefirme.ctl_producto_custodia set activo = false where id = $1", [alguna.id]);
  r = await intentar("insert into piefirme.ctl_producto_custodia (organizacion_id, sucursal_id, producto_id) values ($1, $2, $3)", [ORG, SEDE_B, prod]);
  assert.equal(r.ok, true, "con un lugar libre sí cabe");
  r = await intentar("update piefirme.ctl_producto_custodia set activo = true where id = $1", [alguna.id]);
  assert.equal(r.code, "PF422", "reactivar el 31.º también se rechaza");
  await c.query("select set_config('app.ctl_rpc', '', true)");
  r = await rpc("s@g.com", "ctl_custodia_activar", [SEDE_A, prod]);
  assert.equal(r.code, "PF403", "el supervisor no configura");
});

// ═════════════════════════════ 6 · EVIDENCIA ═════════════════════════════
test("evidencia: ruta por organización, objeto reciente, hash repetido alerta al dueño y no se le dice a quien captura (criterio 6)", async () => {
  await owner();
  const ruta = (x) => `${ORG}/ctl/${SEDE_A}/${x}.jpg`;
  const objeto = async (nombre, hace = "0 seconds") => c.query("insert into storage.objects (bucket_id, name, metadata) values ('pf-auditoria', $1, '{}'::jsonb)", [nombre])
    .then(() => c.query("update storage.objects set created_at = now() - $2::interval where bucket_id = 'pf-auditoria' and name = $1", [nombre, hace]));
  await objeto(ruta("a")); await objeto(ruta("b")); await objeto(ruta("vieja"), "2 hours");
  const hash = "a".repeat(64);
  let r = await rpc("r@g.com", "ctl_evidencia_registrar", [null, SEDE_A, "cierre_captura", null, ruta("a"), hash, 1000, 800, 600, null, null]);
  assert.equal(r.ok, true, r.message);
  assert.equal("hash_repetido" in r.rows[0].r, false, "quien captura no ve el indicador de hash");
  const idA = r.rows[0].r.id;
  r = await rpc("r@g.com", "ctl_evidencia_registrar", [idA, SEDE_A, "cierre_captura", null, ruta("a"), hash, 1000, 800, 600, null, null]);
  assert.equal(r.rows[0].r.duplicada, true, "reenvío idempotente");
  r = await rpc("m@g.com", "ctl_evidencia_registrar", [null, SEDE_A, "cierre_captura", null, ruta("b"), hash, 1000, 800, 600, null, null]);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rows[0].r.hash_repetido, true, "el dueño sí ve la bandera");
  await owner();
  assert.equal((await uno("select count(*)::int as n from piefirme.ctl_alerta where tipo = 'foto_repetida' and organizacion_id = $1", [ORG])).n, 1, "alerta automática por hash idéntico");
  r = await rpc("r@g.com", "ctl_evidencia_registrar", [null, SEDE_A, "caso", null, `${ORG}/ctl/${SEDE_B}/z.jpg`, "b".repeat(64), 1, 1, 1, null, null]);
  assert.equal(r.code, "PF400", "ruta de otra sucursal");
  r = await rpc("r@g.com", "ctl_evidencia_registrar", [null, SEDE_A, "caso", null, ruta("fantasma"), "c".repeat(64), 1, 1, 1, null, null]);
  assert.equal(r.code, "PF409", "sin objeto subido no hay registro (no hay ruta de galería)");
  r = await rpc("r@g.com", "ctl_evidencia_registrar", [null, SEDE_A, "caso", null, ruta("vieja"), "d".repeat(64), 1, 1, 1, null, null]);
  assert.equal(r.code, "PF409", "una foto subida hace horas no se acepta como captura en vivo");
  r = await rpc("r@g.com", "ctl_evidencia_registrar", [null, SEDE_A, "caso", null, ruta("a"), "no-es-hash", 1, 1, 1, null, null]);
  assert.equal(r.ok, false);
  await como("r@g.com");
  const ev = await intentar("select count(*)::int as n from piefirme.ctl_alerta");
  assert.equal(ev.rows[0].n, 0, "las alertas no llegan a la sucursal");
});

// ═════════════════════════════ 7 · PIN ═════════════════════════════
test("PIN: reutiliza Mi PIN, bloqueo temporal tras 3 fallos, sesión ligada al turno", async () => {
  const U = "p@g.com";                                  // podólogo de Chalco: no tiene turno de caja abierto en QA
  await owner();
  let r = await rpc(U, "definir_pin_personal", ["4321"]);
  assert.equal(r.ok, true, r.message);
  r = await rpc(U, "ctl_pin_abrir_sesion", ["4321", SEDE_B, null, null]);
  assert.equal(r.code, "PF403", "una sucursal que no es suya se rechaza");
  r = await rpc(U, "ctl_pin_abrir_sesion", ["4321", SEDE_A, "00000000-0000-0000-0000-0000000000aa", null]);
  assert.equal(r.code, "PF409", "turno inexistente");
  r = await rpc(U, "ctl_pin_abrir_sesion", ["4321", SEDE_A, null, null]);
  assert.equal(r.rows[0].r.ok, true, JSON.stringify(r.rows[0]));
  const sesion = r.rows[0].r.sesion_id;
  assert.equal(r.rows[0].r.turno_id, null, "sin turno de caja abierto la sesión no se liga a ninguno");
  r = await rpc(U, "ctl_pin_validar_sesion", [sesion]);
  assert.equal(r.rows[0].r.vigente, true);
  // sesión ligada a un turno abierto: al cerrarse el turno, la sesión caduca
  await owner();
  const t = await uno(`insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, fondo_inicial, estado) values ($1, $2, 'PRUEBA-AUD', 'Turno prueba', $3, 0, 'abierto') returning id`, [ORG, SEDE_A, ids[U]]);
  r = await rpc(U, "ctl_pin_abrir_sesion", ["4321", SEDE_A, null, null]);
  assert.equal(r.rows[0].r.turno_id, t.id);
  const sesionTurno = r.rows[0].r.sesion_id;
  r = await rpc("m@g.com", "cerrar_turno", [t.id, "0", "cierre de prueba", null]);
  assert.equal(r.ok, true, `no se pudo cerrar el turno de prueba: ${r.message}`);
  r = await rpc(U, "ctl_pin_validar_sesion", [sesionTurno]);
  assert.deepEqual([r.rows[0].r.vigente, r.rows[0].r.motivo], [false, "turno_cerrado"], "caduca al cerrar el turno");
  // fallos: 3 seguidos bloquean
  for (let i = 0; i < 3; i++) {
    r = await rpc(U, "ctl_pin_abrir_sesion", ["0000", SEDE_A, null, null]);
    assert.equal(r.rows[0].r.ok, false);
    assert.equal(r.rows[0].r.intentos_restantes, 2 - i);
  }
  r = await rpc(U, "ctl_pin_abrir_sesion", ["4321", SEDE_A, null, null]);
  assert.equal(r.code, "PF429", "bloqueo temporal: ni el PIN correcto entra");
  assert.match(r.message, /bloqueado/);
  r = await rpc(U, "ctl_pin_cerrar_sesion", [sesion]);
  r = await rpc(U, "ctl_pin_validar_sesion", [sesion]);
  assert.deepEqual([r.rows[0].r.vigente, r.rows[0].r.motivo], [false, "cerrada"]);
  await como("m@g.com");
  const otra = await intentar("select id from piefirme.ctl_sesion_pin where perfil_id = $1", [ids[U]]);
  assert.ok(otra.rows.length >= 2, "el dueño ve las sesiones de captura");
  await como(U);
  const propia = await intentar("select count(*)::int as n from piefirme.ctl_sesion_pin");
  assert.ok(propia.rows[0].n >= 2, "cada quien ve las suyas");
  await como("r@g.com");
  assert.equal((await intentar("select count(*)::int as n from piefirme.ctl_sesion_pin")).rows[0].n, 0, "y no las de otros");
});

// ═════════════════════════════ 8 · AJUSTE AL ORIGEN: IDEMPOTENCIA ═════════════════════════════
test("ctl_solicitar_ajuste_origen: idempotente por folio_caso, registra petición/respuesta, la app no puede llamarlo (criterios 11-13)", async () => {
  await owner();
  const antes = Number((await uno("select coalesce(sum(existencia), 0)::text as e from piefirme.inventario_sede where sede_id = $1 and producto_id = $2", [SEDE_A, prod])).e);
  const llamar = (folio, delta, prodId = prod) => uno(
    "select piefirme.ctl_solicitar_ajuste_origen($1, $2, $3, $4::numeric, 'ajuste_por_auditoria', 'robo', $5, now(), $6) as r", [folio, SEDE_A, prodId, delta, ids["m@g.com"], ORG]);
  const a = (await llamar("CAS-PRUEBA-1", 2)).r;
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(a.idempotente, false);
  const b = (await llamar("CAS-PRUEBA-1", 2)).r;     // reintento por error de red
  assert.equal(b.ok, true);
  assert.equal(b.idempotente, true);
  assert.equal(b.movimiento_id, a.movimiento_id, "mismo movimiento");
  assert.equal((await uno("select count(*)::int as n from piefirme.movimientos_inventario where referencia_folio = 'CAS-PRUEBA-1'")).n, 1, "un solo movimiento en el origen");
  const despues = Number((await uno("select coalesce(sum(existencia), 0)::text as e from piefirme.inventario_sede where sede_id = $1 and producto_id = $2", [SEDE_A, prod])).e);
  assert.equal(despues - antes, 2, "el saldo se movió una sola vez");
  const ll = await uno("select estado, intentos, movimiento_id, peticion, respuesta from piefirme.ctl_llamada_origen where folio_caso = 'CAS-PRUEBA-1'");
  assert.equal(ll.estado, "aplicada");
  assert.equal(ll.peticion.origen, "ctl");
  assert.equal(ll.peticion.cantidad_delta, 2);
  assert.equal(ll.respuesta.ok, true);
  const mov = await uno("select tipo, cantidad::text, usuario_id from piefirme.movimientos_inventario where id = $1", [a.movimiento_id]);
  assert.deepEqual([mov.tipo, mov.cantidad, mov.usuario_id], ["ajuste", "2.000", ids["m@g.com"]]);
  let r = await intentar("select piefirme.ctl_solicitar_ajuste_origen('CAS-PRUEBA-1', $1, $2, 5::numeric, 'ajuste_por_auditoria', 'x', $3, now(), $4)", [SEDE_A, prod, ids["m@g.com"], ORG]);
  assert.equal(r.code, "PF409", "el mismo folio con otros datos se rechaza");
  r = await intentar("select piefirme.ctl_solicitar_ajuste_origen('CAS-PRUEBA-2', $1, $2, 0::numeric, 'ajuste_por_auditoria', 'x', $3, now(), $4)", [SEDE_A, prod, ids["m@g.com"], ORG]);
  assert.equal(r.code, "PF400", "ajuste en cero");
  r = await intentar("select piefirme.ctl_solicitar_ajuste_origen('CAS-PRUEBA-2', $1, $2, 1::numeric, 'otro', 'x', $3, now(), $4)", [SEDE_A, prod, ids["m@g.com"], ORG]);
  assert.equal(r.code, "PF400", "tipo desconocido");
  // el origen rechaza (producto de otra clínica): ajuste_fallido, visible, reintentable, sin perderse en silencio
  const rech = (await llamar("CAS-PRUEBA-3", 1, "00000000-0000-0000-0000-0000000000ff")).r;
  assert.equal(rech.ok, false);
  const l3 = await uno("select estado, mensaje, intentos from piefirme.ctl_llamada_origen where folio_caso = 'CAS-PRUEBA-3'");
  assert.equal(l3.estado, "rechazada");
  assert.match(l3.mensaje, /producto/);
  const rech2 = (await llamar("CAS-PRUEBA-3", 1, "00000000-0000-0000-0000-0000000000ff")).r;
  assert.equal(rech2.ok, false);
  assert.equal((await uno("select intentos from piefirme.ctl_llamada_origen where folio_caso = 'CAS-PRUEBA-3'")).intentos, 2, "el reintento queda contado");
  // la app NO puede pedir ajustes directo
  for (const correo of ["m@g.com", "s@g.com", "r@g.com", "a@g.com"]) {
    r = await rpc(correo, "ctl_solicitar_ajuste_origen", ["CAS-X", SEDE_A, prod, "1", "ajuste_por_auditoria", "x", ids[correo], hoy, ORG]);
    assert.equal(r.code, "42501", `${correo}: ${r.message}`);
  }
  // nadie de la app escribe en el saldo/inventario a través del módulo; las llamadas al origen no son legibles por sucursal
  await como("r@g.com");
  assert.equal((await intentar("select count(*)::int as n from piefirme.ctl_llamada_origen")).rows[0].n, 0);
});

// ═════════════════════════════ 9 · SEPARACIÓN DE FUNCIONES ═════════════════════════════
test("ctl_autorizar_ajuste: reglas duras en el servidor (criterios 2, 11, 12)", async (t) => {
  await owner();
  const nuevoCaso = async ({ captura, asignado = null, producto = prod, estado = "en_investigacion", cantidad = -1 }) => (await owner(), await uno(
    `insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, valor, estado, usuario_captura, asignado_a, causa_id, responsable_costo, monto_costo)
     values ($1, $2, 'diferencia_inventario', 'partida_conteo', $3, $4, $5, 0, $6, $7, $8, $9, 'empresa', 0) returning id, folio`, [ORG, SEDE_A, part, producto, cantidad, estado, captura, asignado, causa])).id;

  await t.test("quien capturó no puede autorizar su propio caso (aunque sea dueño)", async () => {
    const k = await nuevoCaso({ captura: ids["m@g.com"] });
    const r = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "123456"]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "PF403");
    assert.match(r.message, /capturó/);
    await owner();
    assert.equal((await uno("select estado from piefirme.ctl_caso where id = $1", [k])).estado, "en_investigacion");
  });
  await t.test("también se detecta por la partida de origen cuando el caso no trae usuario_captura", async () => {
    await owner();
    const k = (await uno(`insert into piefirme.ctl_caso (organizacion_id, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, estado, causa_id, responsable_costo)
                          values ($1, $2, 'diferencia_inventario', 'partida_conteo', $3, $4, -1, 'en_investigacion', $5, 'empresa') returning id`, [ORG, SEDE_A, part, prod, causa])).id;
    // la partida la capturó r@g.com: m puede; si la capturara m, no
    const nueva = (await uno(`insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, creado_por) values ($1, $2, $3, $4, 'P-M', 1, $5) returning id`, [ORG, SEDE_A, ses.id, prod, ids["m@g.com"]])).id;
    await c.query("select set_config('app.ctl_rpc', 'on', true)");
    await c.query("update piefirme.ctl_caso set origen_id = $2 where id = $1", [k, nueva]);
    await c.query("select set_config('app.ctl_rpc', '', true)");
    const r = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "123456"]);
    assert.equal(r.code, "PF403");
  });
  await t.test("contraseña completa, no PIN: con el PIN o una clave errónea no se autoriza", async () => {
    const k = await nuevoCaso({ captura: ids["r@g.com"], asignado: ids["m@g.com"] });
    let r = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "4321"]);
    assert.equal(r.rows[0].r.ok, false);
    assert.equal(r.rows[0].r.error, "contrasena_incorrecta");
    await owner();
    assert.equal((await uno("select estado from piefirme.ctl_caso where id = $1", [k])).estado, "en_investigacion");
  });
  await t.test("roles sin la capacidad autorizar son rechazados", async () => {
    const k = await nuevoCaso({ captura: ids["r@g.com"] });
    for (const correo of ["s@g.com", "r@g.com", "p@g.com", "a@g.com"]) {
      const r = await rpc(correo, "ctl_autorizar_ajuste", [k, "123456"]);
      assert.equal(r.code, "PF403", correo);
    }
  });
  await t.test("autorización válida: aplica el ajuste una vez, guarda el movimiento, cierra y deja bitácora (criterio 11)", async () => {
    await owner();
    const ex = async () => Number((await uno("select coalesce(sum(existencia), 0)::text as e from piefirme.inventario_sede where sede_id = $1 and producto_id = $2", [SEDE_A, prod])).e);
    const antes = await ex();
    const k = await nuevoCaso({ captura: ids["r@g.com"], asignado: ids["m@g.com"], cantidad: -2 });   // el dueño investigó: sí puede autorizar
    const r = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "123456"]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.rows[0].r.ok, true, JSON.stringify(r.rows[0]));
    assert.equal(r.rows[0].r.estado, "cerrada_con_ajuste");
    await owner();
    const caso = await uno("select estado, autorizado_por, movimiento_origen_id, cerrado_en from piefirme.ctl_caso where id = $1", [k]);
    assert.equal(caso.estado, "cerrada_con_ajuste");
    assert.equal(caso.autorizado_por, ids["m@g.com"]);
    assert.ok(caso.movimiento_origen_id);
    assert.equal((await ex()) - antes, -2);
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_caso_bitacora where caso_id = $1 and estado_nuevo = 'cerrada_con_ajuste'", [k])).n, 1);
    const otra = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "123456"]);
    assert.equal(otra.code, "PF409", "un caso cerrado no se autoriza de nuevo (no se duplica el ajuste)");
    assert.equal((await ex()) - antes, -2);
  });
  await t.test("si el origen rechaza: ajuste_fallido, visible y sin perderse (criterio 12)", async () => {
    const k = await nuevoCaso({ captura: ids["r@g.com"], producto: "00000000-0000-0000-0000-0000000000ee" });
    const r = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "123456"]);
    assert.equal(r.rows[0].r.ok, false);
    assert.equal(r.rows[0].r.estado, "ajuste_fallido");
    await como("m@g.com");
    const v = await intentar("select estado from piefirme.ctl_caso where id = $1", [k]);
    assert.equal(v.rows[0].estado, "ajuste_fallido");
  });
  await t.test("3 contraseñas erróneas bloquean la autorización", async () => {
    const k = await nuevoCaso({ captura: ids["r@g.com"] });
    for (let i = 0; i < 3; i++) assert.equal((await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "mala"])).rows[0].r.ok, false);
    const r = await rpc("m@g.com", "ctl_autorizar_ajuste", [k, "123456"]);
    assert.equal(r.code, "PF429");
  });
});

// ═════════════════════════════ 10 · HTTP REAL (lo que recibe un navegador) ═════════════════════════════
test("HTTP real: PostgREST con el token de cada cuenta", async (t) => {
  const ESQ = cfg.env.QA_DB_SCHEMA || "piefirme";
  const tokens = {};
  for (const correo of CORREOS) {
    const j = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: cfg.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: correo, password: "123456" }) }).then((x) => x.json());
    assert.ok(j.access_token, `login ${correo}`);
    tokens[correo] = j.access_token;
  }
  const http = async (correo, metodo, ruta, cuerpo) => {
    const r = await fetch(`${cfg.url}/rest/v1/${ruta}`, { method: metodo, headers: { apikey: cfg.anon, Authorization: `Bearer ${tokens[correo]}`, "Content-Type": "application/json", "Accept-Profile": ESQ, "Content-Profile": ESQ, Prefer: "return=representation" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const txt = await r.text(); let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    return { status: r.status, data };
  };
  await t.test("v_ctl_saldos: el dueño ve saldos; recepción y podólogo reciben una lista vacía", async () => {
    const m = await http("m@g.com", "GET", "v_ctl_saldos?select=*&limit=3");
    assert.equal(m.status, 200);
    assert.ok(m.data.length > 0, "el dueño ve saldos reales del origen");
    for (const correo of ["r@g.com", "p@g.com"]) {
      for (const vista of ["v_ctl_saldos", "v_ctl_productos", "v_ctl_movimientos", "v_ctl_ventas", "v_ctl_turnos", "ctl_partida_revision", "ctl_sesion_revision", "ctl_cierre_revision"]) {
        const r = await http(correo, "GET", `${vista}?select=*&limit=5`);
        assert.equal(r.status, 200, `${correo} ${vista}`);
        assert.deepEqual(r.data, [], `${correo} recibe filas de ${vista}`);
      }
    }
  });
  await t.test("ctl_producto_captura: recepción reconoce la pieza pero sin precio, costo ni existencia", async () => {
    const r = await http("r@g.com", "GET", "ctl_producto_captura?select=*&limit=3");
    assert.equal(r.status, 200);
    assert.ok(r.data.length > 0);
    const llaves = Object.keys(r.data[0]);
    assert.deepEqual(llaves.filter((k) => /precio|costo|existencia|saldo/.test(k)), []);
    assert.ok(llaves.includes("descripcion"));
  });
  await t.test("PATCH/DELETE/POST directos a las tablas de captura: permiso denegado con la sesión de cualquier rol", async () => {
    for (const correo of CORREOS) {
      for (const [metodo, ruta, cuerpo] of [["PATCH", "ctl_partida_conteo?id=not.is.null", { cantidad_fisica: 9 }], ["DELETE", "ctl_partida_conteo?id=not.is.null"],
                                           ["POST", "ctl_partida_conteo", { organizacion_id: ORG, sucursal_id: SEDE_A, sesion_id: ses.id, producto_id: prod, codigo_escaneado: "x", cantidad_fisica: 1 }],
                                           ["PATCH", "ctl_caso?id=not.is.null", { estado: "rechazada" }], ["POST", "ctl_config", { organizacion_id: ORG, clave: "muestra_aleatoria", valor: 5 }]]) {
        const r = await http(correo, metodo, ruta, cuerpo);
        assert.ok([401, 403].includes(r.status), `${correo} ${metodo} ${ruta} → ${r.status} ${JSON.stringify(r.data)}`);
        assert.equal(r.data?.code, "42501", `${correo} ${metodo} ${ruta}`);
      }
    }
  });
  await t.test("anon no ve nada del módulo", async () => {
    const r = await fetch(`${cfg.url}/rest/v1/ctl_config_def?select=*`, { headers: { apikey: cfg.anon, Authorization: `Bearer ${cfg.anon}`, "Accept-Profile": ESQ } });
    assert.ok([401, 403, 404].includes(r.status), `status ${r.status}`);
  });
  await t.test("ctl_solicitar_ajuste_origen no es invocable por la app", async () => {
    const r = await http("m@g.com", "POST", "rpc/ctl_solicitar_ajuste_origen", { p_folio_caso: "CAS-X", p_sucursal: SEDE_A, p_producto: prod, p_cantidad_delta: 1, p_tipo: "ajuste_por_auditoria", p_causa: "x", p_autorizado_por: ids["m@g.com"], p_autorizado_en: new Date().toISOString() });
    assert.ok([401, 403, 404].includes(r.status), `${r.status} ${JSON.stringify(r.data)}`);
  });
  await t.test("tope rechazado por la API con explicación (no persiste)", async () => {
    const r = await http("m@g.com", "POST", "rpc/ctl_config_guardar", { p_clave: "muestra_aleatoria", p_sucursal: null, p_valor: 500, p_confirmo_dueno: false });
    assert.ok(r.status >= 400, `${r.status}`);
    assert.match(JSON.stringify(r.data), /tope/i);
  });
  await t.test("ctl_mi_rol por HTTP", async () => {
    const esperado = { "a@g.com": "soporte", "m@g.com": "dueno", "s@g.com": "supervisor", "p@g.com": "sucursal", "r@g.com": "sucursal" };
    for (const [correo, rol] of Object.entries(esperado)) {
      const r = await http(correo, "POST", "rpc/ctl_mi_rol", {});
      assert.equal(r.status, 200, correo);
      assert.equal(r.data.rol, rol, correo);
    }
  });
});
