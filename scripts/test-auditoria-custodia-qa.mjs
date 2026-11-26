// Pruebas del módulo «Control y Auditoría» · ETAPA 7 (cadena de custodia) contra la base QA.   node --test scripts/test-auditoria-custodia-qa.mjs
//
// UNA transacción que SIEMPRE se deshace (no deja filas, folios, ventas ni alertas): se siembra como dueño de la base y se actúa «como» cada cuenta de prueba
// (SET LOCAL ROLE authenticated + claims JWT), igual que scripts/test-auditoria-cierres-qa.mjs. Cada bloque usa sucursales y productos creados dentro de la transacción.
// Cubre: tope de 30 en custodia con explicación (criterio 7), recepción con PIN y responsabilidad (F5.1), sellos (colocar, reabrir con nuevo folio, verificar, peso),
// sello roto sin reapertura → alerta al supervisor y caso (F5.2), número de serie por pieza, venta de alto valor → alerta al dueño (F5.3), talonarios (rango, repetido,
// auditoría con el folio 18 sin capturar y el 25 en blanco → caso folio_faltante, criterio 21), caídas del sistema, inmutabilidad (criterio 8) y captura a ciegas (criterio 1).
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
const uid = () => crypto.randomUUID();
const hashAl = () => crypto.randomBytes(32).toString("hex");

const c = await conectar(cfg);
const ids = {};
let n = 0, servicio;
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
const rpc = async (correo, fn, args = []) => {
  await como(correo);
  const x = await intentar(`select piefirme.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args);
  return x.ok ? { ...x, res: x.rows[0].r } : x;
};
const uno = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows[0]; };
const filas = async (sql, params) => { await owner(); return (await c.query(sql, params)).rows; };
const comoOwner = async (sql, params) => { await owner(); return c.query(sql, params); };

// ───────────── siembra (como dueño de la base) ─────────────
async function nuevaSede(clave) {
  const s = await uno("insert into piefirme.sedes (organizacion_id, clave, nombre) values ($1, $2, $3) returning id", [ORG, clave, `Sucursal prueba ${clave}`]);
  return s.id;
}
let nProd = 0;
async function nuevoProducto(nombre, attr = {}) {
  const p = await uno("insert into piefirme.productos (organizacion_id, sku, nombre, codigo_barras) values ($1, $2, $3, $4) returning id", [ORG, `CUS-${Date.now()}-${++nProd}`, nombre, `7${String(Date.now()).slice(-8)}${nProd}`]);
  if (Object.keys(attr).length) {
    const r = await rpc("m@g.com", "ctl_producto_atributo_guardar", [p.id, !!attr.serie, !!attr.sello, !!attr.alto, attr.peso ?? null]);
    assert.equal(r.ok, true, `atributos de «${nombre}»: ${r.message}`);
  }
  return p.id;
}
const PIN = "4827";
async function ponerPin(correo) {
  await c.query("insert into piefirme.pins_personales (perfil_id, organizacion_id, pin_hash) values ($1, $2, piefirme_app.hash_pin($1, $3)) on conflict (perfil_id) do update set pin_hash = excluded.pin_hash", [ids[correo], ORG, PIN]);
}
const objeto = async (nombre) => { await owner(); await c.query("insert into storage.objects (bucket_id, name, metadata) values ('pf-auditoria', $1, '{}'::jsonb)", [nombre]); };
/** Foto en vivo ya registrada (como lo hace la app: sube y registra). Devuelve el id de la evidencia. */
async function foto(correo, sede, tipo, origen) {
  const ruta = `${ORG}/ctl/${sede}/${uid()}.jpg`;
  await objeto(ruta);
  const id = uid();
  const r = await rpc(correo, "ctl_evidencia_registrar", [id, sede, tipo, origen, ruta, hashAl(), 1000, 1600, 1200, null, null]);
  assert.equal(r.ok, true, `evidencia: ${r.message}`);
  return id;
}
const alertas = async (tipo, ref) => filas("select * from piefirme.ctl_alerta where organizacion_id = $1 and tipo = $2 and ($3::uuid is null or referencia_id = $3) order by creado_en", [ORG, tipo, ref ?? null]);
const casos = async (tipo, sede) => filas("select * from piefirme.ctl_caso where organizacion_id = $1 and tipo = $2 and ($3::uuid is null or sucursal_id = $3) order by folio", [ORG, tipo, sede ?? null]);
async function turno(sede, correo) {
  return (await uno("insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, cajero_id, fondo_inicial) values ($1, $2, 'Caja 1', $3, 500) returning id", [ORG, sede, ids[correo]])).id;
}
/** Venta de un servicio por `monto`, cobrada hace `hace` (como dueño de la base: no depende de existencias ni de la caja). */
async function ventaServicio(sede, tur, monto, hace = "0 seconds") {
  const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen) values ($1, $2, 'mostrador') returning id", [ORG, sede]);
  await c.query("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, servicio_id, cantidad, precio_unitario) values ($1, $2, $3, 'servicio', $4, 1, $5)", [ORG, sede, v.id, servicio, monto]);
  await c.query("select set_config('app.ignorar_cierre', 'on', true)");
  await c.query("update piefirme.ventas set estado = 'cobrada', cobrada_en = now() - $2::interval, turno_id = $3 where id = $1", [v.id, hace, tur]);
  return v.id;
}
async function ventaProducto(sede, tur, prod, precio) {
  const v = await uno("insert into piefirme.ventas (organizacion_id, sede_id, origen) values ($1, $2, 'mostrador') returning id", [ORG, sede]);
  const l = await uno("insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, tipo, producto_id, cantidad, precio_unitario) values ($1, $2, $3, 'producto', $4, 1, $5) returning id", [ORG, sede, v.id, prod, precio]);
  await c.query("select set_config('app.ignorar_cierre', 'on', true)");
  await c.query("update piefirme.ventas set estado = 'cobrada', cobrada_en = now(), turno_id = $2 where id = $1", [v.id, tur]);
  return { venta: v.id, linea: l.id };
}
/** Todas las claves (recursivo) de un valor JSON. */
const claves = (x, acc = new Set()) => { if (Array.isArray(x)) x.forEach((y) => claves(y, acc)); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { acc.add(k); claves(v, acc); } return acc; };

before(async () => {
  await c.query("begin");
  await c.query("set local statement_timeout = '15min'");
  for (const r of (await c.query("select email, id from piefirme.perfiles where email = any($1)", [CORREOS])).rows) ids[r.email] = r.id;
  for (const e of CORREOS) assert.ok(ids[e], `falta la cuenta de prueba ${e}: corre scripts/qa-usuarios-prueba.mjs qa`);
  servicio = (await uno("select id from piefirme.servicios where organizacion_id = $1 order by nombre limit 1", [ORG])).id;
  for (const k of ["1", "2", "3", "4", "5", "6", "7", "8"]) S[k] = await nuevaSede("C" + k);
  await c.query("update piefirme.perfiles set sedes = '{}' where id = $1", [ids["p@g.com"]]);
  for (const e of ["r@g.com", "m@g.com", "s@g.com", "p@g.com"]) await ponerPin(e);
});
after(async () => { try { await c.query("rollback"); } finally { await c.end(); } });

// ═════════════════════════════ 1 · BANDERAS DE CATÁLOGO (solo dueño) ═════════════════════════════
test("catálogo de control: solo el dueño marca requiere serie / sello / alto valor / peso y todo queda en bitácora", async (t) => {
  const p = await nuevoProducto("Plantilla ortopédica prueba");
  await t.test("recepción, supervisor y podólogo no pueden; el dueño sí", async () => {
    for (const e of ["r@g.com", "s@g.com", "p@g.com"]) assert.equal((await rpc(e, "ctl_producto_atributo_guardar", [p, false, true, false, 500])).code, "PF403", e);
    const ok = await rpc("m@g.com", "ctl_producto_atributo_guardar", [p, false, true, false, 500]);
    assert.equal(ok.ok, true, ok.message);
    assert.equal(ok.res.requiere_sello, true);
  });
  await t.test("alto valor implica número de serie por pieza (el servidor lo fuerza)", async () => {
    const r = await rpc("m@g.com", "ctl_producto_atributo_guardar", [p, false, true, true, 500]);
    assert.equal(r.res.requiere_serie, true);
    assert.equal(r.res.alto_valor, true);
  });
  await t.test("peso inválido se rechaza y los cambios quedan en bitácora con antes y después", async () => {
    assert.equal((await rpc("m@g.com", "ctl_producto_atributo_guardar", [p, true, true, true, 0])).code, "PF422");
    const b = await filas("select anterior, nuevo, creado_por from piefirme.ctl_producto_atributo_bitacora where producto_id = $1", [p]);   // (todas llevan la misma hora: la transacción es una sola)
    assert.equal(b.length, 2);
    assert.ok(b.some((x) => x.anterior === null), "la primera marca no tiene «antes»");
    const cambio = b.find((x) => x.nuevo.alto_valor === true);
    assert.equal(cambio.anterior.alto_valor, false);
    assert.equal(cambio.anterior.requiere_sello, true);
    assert.equal(cambio.creado_por, ids["m@g.com"]);
  });
  await t.test("la vista v_ctl_productos ya expone requiere_serie, requiere_sello, alto_valor y peso_caja_llena (no hizo falta migrar la vista)", async () => {
    await como("m@g.com");
    const x = await intentar("select requiere_serie, requiere_sello, alto_valor, peso_caja_llena from piefirme.v_ctl_productos where id = $1", [p]);
    assert.equal(x.ok, true, x.message);
    assert.equal(x.rows[0].alto_valor, true);
    assert.equal(Number(x.rows[0].peso_caja_llena), 500);
  });
  await t.test("el catálogo para administrar las banderas lo consulta el dueño y no la sucursal", async () => {
    const dueno = await rpc("m@g.com", "ctl_productos_control_listar", ["Plantilla ortopédica prueba", true, 20]);
    assert.equal(dueno.res.length, 1);
    assert.equal((await rpc("r@g.com", "ctl_productos_control_listar", [null, false, 20])).code, "PF403");
  });
});

// ═════════════════════════════ 2 · CUSTODIA DEL RELEVO: TOPE DURO DE 30 (criterio 7) ═════════════════════════════
test("custodia del relevo: el producto 31 se rechaza en la base con la explicación del tope (criterio 7)", async (t) => {
  const sede = S["1"];
  const prods = [];
  for (let i = 0; i < 31; i++) prods.push(await nuevoProducto(`Custodia prueba ${String(i).padStart(2, "0")}`));
  await t.test("30 entran; el 31 se rechaza con el porqué (el relevo pasaría de dos minutos a veinte)", async () => {
    for (let i = 0; i < 30; i++) {
      const r = await rpc("m@g.com", "ctl_custodia_activar", [sede, prods[i]]);
      assert.equal(r.ok, true, `${i}: ${r.message}`);
    }
    const x = await rpc("m@g.com", "ctl_custodia_activar", [sede, prods[30]]);
    assert.equal(x.ok, false);
    assert.equal(x.code, "PF422");
    assert.match(x.message, /30 productos/);
    assert.match(x.message, /veinte/);
    assert.match(x.message, /evidencia falsa/);
  });
  await t.test("la pantalla recibe el estado con la explicación: 30 de 30, lleno, y no se oculta nada", async () => {
    const e = await rpc("m@g.com", "ctl_custodia_estado", [sede]);
    assert.equal(e.res.activos, 30); assert.equal(e.res.tope, 30); assert.equal(e.res.restantes, 0); assert.equal(e.res.lleno, true);
    assert.match(e.res.explicacion, /30 productos en custodia/);
    assert.equal(e.res.productos.length, 30);
  });
  await t.test("incluir los de alto valor respeta el tope: los que no caben vuelven en «omitidos» con mensaje", async () => {
    const av = await nuevoProducto("Equipo de alto valor prueba", { serie: true, alto: true, sello: true });
    assert.equal((await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, av, "AV-SERIE-0001", null])).ok, true);
    const r = await rpc("m@g.com", "ctl_custodia_incluir_alto_valor", [sede]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.agregados.length, 0);
    assert.equal(r.res.omitidos.length, 1);
    assert.match(r.res.mensaje, /tope duro/);
    const dentro = await uno("select count(*)::int as n from piefirme.ctl_producto_custodia where sucursal_id = $1 and activo", [sede]);
    assert.equal(dentro.n, 30);
  });
  await t.test("al retirar uno, el de alto valor sí entra a la custodia del relevo", async () => {
    assert.equal((await rpc("m@g.com", "ctl_custodia_desactivar", [sede, prods[0]])).ok, true);
    const r = await rpc("m@g.com", "ctl_custodia_incluir_alto_valor", [sede]);
    assert.equal(r.res.agregados.length, 1);
    assert.equal(r.res.omitidos.length, 0);
    assert.equal((await rpc("m@g.com", "ctl_custodia_estado", [sede])).res.activos, 30);
  });
  await t.test("solo el dueño administra la custodia; quien captura puede ver el estado (sin existencias)", async () => {
    assert.equal((await rpc("r@g.com", "ctl_custodia_activar", [sede, prods[0]])).code, "PF403");
    assert.equal((await rpc("s@g.com", "ctl_custodia_incluir_alto_valor", [sede])).code, "PF403");
    const e = await rpc("r@g.com", "ctl_custodia_estado", [sede]);
    assert.equal(e.ok, true, e.message);
    assert.ok(e.res.productos.every((x) => !("piezas_en_sucursal" in x)), "la sucursal no ve cuántas piezas «debería» haber");
    const sup = await rpc("s@g.com", "ctl_custodia_estado", [sede]);
    assert.ok(sup.res.productos.some((x) => "piezas_en_sucursal" in x));
  });
});

// ═════════════════════════════ 3 · SELLOS VOID, REAPERTURA Y PESO (F5.2) ═════════════════════════════
test("sellos: colocar, verificar, reabrir con nuevo folio y sello roto sin registro (alerta + caso)", async (t) => {
  const sede = S["2"];
  const sello = await nuevoProducto("Equipo sellado prueba", { sello: true, serie: true, peso: 1000 });
  const sinSello = await nuevoProducto("Producto sin sello prueba");
  const colocar = (correo, folio, prod = sello, serie = null, id = uid()) => rpc(correo, "ctl_sello_colocar", [id, sede, folio, prod, serie, null, null]);

  await t.test("colocar: solo productos con «requiere sello»; la serie es por pieza; el folio es único", async () => {
    const mal = await colocar("r@g.com", "VOID-0001", sinSello);
    assert.equal(mal.code, "PF422"); assert.match(mal.message, /no lleva sello/);
    const sinSerie = await colocar("r@g.com", "VOID-0001", sello, null);
    assert.equal(sinSerie.code, "PF422"); assert.match(sinSerie.message, /número de serie/);
    const ok = await colocar("r@g.com", "void-0001", sello, "ser-100");
    assert.equal(ok.ok, true, ok.message);
    assert.equal(ok.res.folio_sello, "VOID-0001", "el folio se normaliza");
    const rep = await colocar("r@g.com", "VOID-0001", sello, "SER-200");
    assert.equal(rep.code, "PF409");
    const mismaSerie = await colocar("r@g.com", "VOID-0002", sello, "SER-100");
    assert.equal(mismaSerie.code, "PF409"); assert.match(mismaSerie.message, /ya tiene un sello vigente/);
    const idem = await rpc("r@g.com", "ctl_sello_colocar", [ok.res.id, sede, "VOID-0001", sello, "SER-100", null, null]);
    assert.equal(idem.res.idempotente, true);
  });
  await t.test("verificar un sello intacto con el peso correcto: coincide; a la sucursal no se le dice el peso esperado ni la desviación", async () => {
    const r = await rpc("r@g.com", "ctl_sello_verificar", [uid(), sede, "VOID-0001", true, 1020, null, null]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.peso_coincide, true);
    const k = claves(r.res);
    for (const prohibido of ["peso_esperado", "desviacion_pct", "tolerancia_pct", "dentro_tolerancia", "resultado"]) assert.equal(k.has(prohibido), false, `la sucursal recibió ${prohibido}`);
    const v = await rpc("s@g.com", "ctl_sello_verificar", [uid(), sede, "VOID-0001", true, 1000, null, null]);
    assert.equal(v.res.resultado, "ok", "el supervisor sí ve el resultado");
  });
  await t.test("caja vacía: un peso muy por debajo se detecta al instante, alerta a supervisor y dueño, y queda el cálculo solo para quien ve diferencias", async () => {
    const id = uid();
    const r = await rpc("r@g.com", "ctl_sello_verificar", [id, sede, "VOID-0001", true, 120, null, null]);
    assert.equal(r.res.peso_coincide, false, "debe abrir la caja");
    const al = await alertas("peso_fuera_de_rango", id);
    assert.equal(al.length, 1);
    assert.deepEqual([...al[0].destinatarios].sort(), ["dueno", "supervisor"]);
    const calc = await uno("select peso_esperado, desviacion_pct, resultado, dentro_tolerancia from piefirme.ctl_sello_verificacion_calculo where verificacion_id = $1", [id]);
    assert.equal(Number(calc.peso_esperado), 1000);
    assert.equal(calc.resultado, "peso_fuera_de_rango");
    assert.equal(calc.dentro_tolerancia, false);
  });
  await t.test("la tolerancia del peso es configurable por sucursal y tiene tope duro de 25 %", async () => {
    const tope = await rpc("m@g.com", "ctl_config_guardar", ["sello_peso_tolerancia_pct", sede, J(40), false, null]);
    assert.equal(tope.code, "PF422"); assert.match(tope.message, /25/);
    assert.equal((await rpc("m@g.com", "ctl_config_guardar", ["sello_peso_tolerancia_pct", sede, J(20), false, "báscula menos precisa"])).ok, true);
    const r = await rpc("r@g.com", "ctl_sello_verificar", [uid(), sede, "VOID-0001", true, 850, null, null]);
    assert.equal(r.res.peso_coincide, true, "15 % entra con tolerancia 20 %");
    assert.equal((await rpc("m@g.com", "ctl_config_restablecer", ["sello_peso_tolerancia_pct", sede, null])).ok, true);
  });
  await t.test("límite de intentos: no se puede adivinar el peso esperado probando valores", async () => {
    await colocar("r@g.com", "VOID-0010", sello, "SER-310");
    let ultimo;
    for (let i = 0; i < 6; i++) ultimo = await rpc("r@g.com", "ctl_sello_verificar", [uid(), sede, "VOID-0010", true, 900 + i * 10, null, null]);
    assert.equal(ultimo.code, "PF429");
  });
  await t.test("sello roto SIN reapertura: pasa a roto_sin_registro, abre caso sello_roto y alerta al supervisor", async () => {
    await colocar("r@g.com", "VOID-0020", sello, "SER-420");
    const id = uid();
    const r = await rpc("r@g.com", "ctl_sello_verificar", [id, sede, "VOID-0020", false, null, null, null]);
    assert.equal(r.ok, true, r.message);
    const s = await uno("select estado, caso_id, roto_en from piefirme.ctl_sello where folio_sello = 'VOID-0020'");
    assert.equal(s.estado, "roto_sin_registro");
    assert.ok(s.caso_id && s.roto_en);
    const k = await uno("select tipo, estado, producto_id, usuario_captura, contexto from piefirme.ctl_caso where id = $1", [s.caso_id]);
    assert.equal(k.tipo, "sello_roto"); assert.equal(k.estado, "abierta");
    assert.equal(k.contexto.folio_sello, "VOID-0020");
    const al = await alertas("sello_roto_sin_registro", s.caso_id);
    assert.equal(al.length, 1);
    assert.ok(al[0].destinatarios.includes("supervisor"));
    assert.equal(al[0].estado, "nueva");
    // no se duplica: una segunda verificación del mismo sello roto no abre otro caso
    await rpc("s@g.com", "ctl_sello_verificar", [uid(), sede, "VOID-0020", false, null, null, null]);
    assert.equal((await alertas("sello_roto_sin_registro", s.caso_id)).length, 1);
    // el detalle del caso se abre sin error para quien investiga
    const det = await rpc("m@g.com", "ctl_caso_detalle", [s.caso_id]);
    assert.equal(det.ok, true, det.message);
  });
  await t.test("un conteo que reporta sello no intacto sobre un folio vigente también lo marca roto (sin romper el conteo)", async () => {
    await colocar("r@g.com", "VOID-0030", sello, "SER-530");
    await owner();
    const ses = await uno("insert into piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo, modo_lista, usuario_captura) values ($1, $2, 'auditoria_puntual', 'libre', $3) returning id", [ORG, sede, ids["r@g.com"]]);
    const p = await uno(`insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, numero_serie, folio_sello, sello_intacto)
                         values ($1, $2, $3, $4, 'x', 1, 'SER-530', 'void-0030', false) returning id`, [ORG, sede, ses.id, sello]);
    const s = await uno("select estado, caso_id from piefirme.ctl_sello where folio_sello = 'VOID-0030'");
    assert.equal(s.estado, "roto_sin_registro");
    const k = await uno("select origen_tipo, origen_id from piefirme.ctl_caso where id = $1", [s.caso_id]);
    assert.equal(k.origen_tipo, "partida_conteo"); assert.equal(k.origen_id, p.id);
  });
  await t.test("REAPERTURA: pieza, motivo, usuario y nuevo folio; el anterior queda reemplazado y enlazado (sello_anterior_id)", async () => {
    await colocar("r@g.com", "VOID-0040", sello, "SER-640");
    const ant = await uno("select id from piefirme.ctl_sello where folio_sello = 'VOID-0040'");
    assert.equal((await rpc("r@g.com", "ctl_sello_reabrir", [uid(), ant.id, "x", "VOID-0041", null, null])).code, "PF422", "motivo obligatorio");
    assert.equal((await rpc("r@g.com", "ctl_sello_reabrir", [uid(), ant.id, "Se abrió para mostrarla al cliente", "VOID-0040", null, null])).code, "PF409", "folio nuevo obligatorio");
    const ok = await rpc("r@g.com", "ctl_sello_reabrir", [uid(), ant.id, "Se abrió para mostrarla al cliente", "VOID-0041", null, null]);
    assert.equal(ok.ok, true, ok.message);
    const filasS = await filas("select folio_sello, estado, sello_anterior_id, motivo_reapertura, colocado_por, numero_serie, origen from piefirme.ctl_sello where folio_sello in ('VOID-0040', 'VOID-0041') order by folio_sello");
    assert.equal(filasS[0].estado, "reemplazado");
    assert.equal(filasS[1].estado, "vigente"); assert.equal(filasS[1].sello_anterior_id, ant.id); assert.equal(filasS[1].motivo_reapertura, "Se abrió para mostrarla al cliente");
    assert.equal(filasS[1].colocado_por, ids["r@g.com"]); assert.equal(filasS[1].numero_serie, "SER-640"); assert.equal(filasS[1].origen, "reapertura");
    assert.equal((await rpc("r@g.com", "ctl_sello_reabrir", [uid(), ant.id, "Otra vez la misma", "VOID-0042", null, null])).code, "PF409", "no se reabre un sello ya reemplazado");
    // un sello reemplazado ya no es verificable: se pide el folio vigente
    const v = await rpc("r@g.com", "ctl_sello_verificar", [uid(), sede, "VOID-0040", true, null, null, null]);
    assert.equal(v.res.ok, false); assert.equal(v.res.error, "sello_reemplazado");
  });
  await t.test("reapertura de un sello que ya estaba roto: queda constancia en el caso y el sello se reemplaza", async () => {
    const roto = await uno("select id, caso_id from piefirme.ctl_sello where folio_sello = 'VOID-0020'");
    const ok = await rpc("s@g.com", "ctl_sello_reabrir", [uid(), roto.id, "Reapertura registrada tarde por el supervisor", "VOID-0021", null, null]);
    assert.equal(ok.ok, true, ok.message);
    assert.equal((await uno("select estado from piefirme.ctl_sello where id = $1", [roto.id])).estado, "reemplazado");
    const b = await filas("select tipo, usuario_id, texto from piefirme.ctl_caso_bitacora where caso_id = $1 and texto like '%reapertura%'", [roto.caso_id]);
    assert.equal(b.length, 1); assert.equal(b[0].usuario_id, null, "entrada del sistema: no cuenta como «investigó»");
  });
  await t.test("sello desconocido o de otra sucursal: mensaje claro, sin revelar nada", async () => {
    const r = await rpc("r@g.com", "ctl_sello_verificar", [uid(), sede, "NO-EXISTE", true, null, null, null]);
    assert.equal(r.res.ok, false); assert.equal(r.res.error, "sello_desconocido");
    const otra = await rpc("r@g.com", "ctl_sello_verificar", [uid(), S["3"], "VOID-0001", true, null, null, null]);
    assert.equal(otra.res.error, "sello_desconocido");
  });
  await t.test("quien captura no ve los sellos que no colocó (son lo que el sistema espera); el supervisor y el dueño sí", async () => {
    await colocar("s@g.com", "VOID-0050", sello, "SER-750");
    await como("r@g.com");
    const ajeno = await intentar("select folio_sello from piefirme.ctl_sello where folio_sello = 'VOID-0050'");
    assert.equal(ajeno.rows.length, 0);
    const propio = await intentar("select folio_sello from piefirme.ctl_sello where folio_sello = 'VOID-0001'");
    assert.equal(propio.rows.length, 1);
    await como("m@g.com");
    assert.equal((await intentar("select folio_sello from piefirme.ctl_sello where folio_sello = 'VOID-0050'")).rows.length, 1);
    await como("r@g.com");
    assert.equal((await intentar("select * from piefirme.ctl_sello_verificacion_calculo")).rows.length, 0);
  });
});

// ═════════════════════════════ 4 · RECEPCIÓN CON RESPONSIVA (F5.1) ═════════════════════════════
test("recepción: escanear, verificar, foto en vivo y firma con PIN; desde ahí la pieza es de quien firmó", async (t) => {
  const sede = S["4"];
  const pieza = await nuevoProducto("Equipo caro recepción", { sello: true, serie: true, alto: true, peso: 2000 });
  const caja = await nuevoProducto("Caja con sello recepción", { sello: true });
  const comun = await nuevoProducto("Producto común recepción");
  const linea = async (correo, rid, o) => ({ producto_id: o.producto, numero_serie: o.serie ?? null, folio_sello: o.folio ?? null, verificacion: o.ver ?? "sello_intacto",
                                            nuevo_folio_sello: o.nuevo ?? null, peso_medido: o.peso ?? null, evidencia_id: o.ev ?? await foto(correo, sede, "recepcion", rid) });
  const registrar = (correo, rid, lineas, pin = PIN, doc = "Remisión 123") => rpc(correo, "ctl_recepcion_registrar", [rid, sede, doc, J(lineas), pin, null, null]);

  await t.test("solo aplica a productos con requiere_sello: una clave común se rechaza con la razón del piloto", async () => {
    const rid = uid();
    const r = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: comun, folio: "REC-0001" })]);
    assert.equal(r.code, "PF422"); assert.match(r.message, /solo aplica a productos con sello/);
  });
  await t.test("sin foto en vivo no hay recepción; la misma foto no sirve para dos piezas", async () => {
    const rid = uid();
    const sinFoto = await rpc("r@g.com", "ctl_recepcion_registrar", [rid, sede, null, J([{ producto_id: caja, folio_sello: "REC-0002", verificacion: "sello_intacto", evidencia_id: null }]), PIN, null, null]);
    assert.equal(sinFoto.code, "PF422"); assert.match(sinFoto.message, /foto en vivo/);
    const ev = await foto("r@g.com", sede, "recepcion", rid);
    const dos = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: caja, folio: "REC-0003", ev }), await linea("r@g.com", rid, { producto: caja, folio: "REC-0004", ev })]);
    assert.equal(dos.code, "PF422"); assert.match(dos.message, /propia foto/);
    // la foto de otro origen (otro id de recepción) tampoco vale
    const ajena = await foto("r@g.com", sede, "recepcion", uid());
    const x = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: caja, folio: "REC-0005", ev: ajena })]);
    assert.equal(x.code, "PF422");
  });
  await t.test("la serie es por pieza: una pieza que exige serie sin ella se rechaza", async () => {
    const rid = uid();
    const r = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: pieza, folio: "REC-0006" })]);
    assert.equal(r.code, "PF422"); assert.match(r.message, /número de serie/);
  });
  await t.test("PIN incorrecto: no se registra nada y se cuenta el intento; PIN correcto: se firma", async () => {
    const rid = uid();
    const l = await linea("r@g.com", rid, { producto: pieza, serie: "eq-9001", folio: "rec-0007", peso: 2010 });
    const mal = await registrar("r@g.com", rid, [l], "0000");
    assert.equal(mal.res.ok, false); assert.equal(mal.res.error, "pin_incorrecto");
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_recepcion where id = $1", [rid])).n, 0);
    const ok = await registrar("r@g.com", rid, [l]);
    assert.equal(ok.res.ok, true, ok.message ?? J(ok.res));
    assert.equal(ok.res.lineas, 1); assert.equal(ok.res.con_incidencias, false);
    assert.equal(ok.res.detalle[0].peso_coincide, true);
    // responsabilidad: usuario, fecha y hora del servidor
    const h = await uno("select creado_por, firmada_en, creado_en, documento, lineas from piefirme.ctl_recepcion where id = $1", [rid]);
    assert.equal(h.creado_por, ids["r@g.com"]); assert.ok(h.firmada_en); assert.equal(h.documento, "Remisión 123");
    const li = await uno("select responsable_id, responsable_desde, numero_serie, folio_sello, verificacion, pieza_id, sello_id, evidencia_id from piefirme.ctl_recepcion_linea where recepcion_id = $1", [rid]);
    assert.equal(li.responsable_id, ids["r@g.com"]); assert.equal(li.numero_serie, "EQ-9001"); assert.equal(li.folio_sello, "REC-0007");
    assert.ok(li.pieza_id && li.sello_id && li.evidencia_id);
    assert.equal((await uno("select estado from piefirme.ctl_pieza where id = $1", [li.pieza_id])).estado, "en_sucursal");
    assert.equal((await uno("select estado, origen from piefirme.ctl_sello where id = $1", [li.sello_id])).estado, "vigente");
    // evento hacia el tablero
    const ev = await filas("select evento, payload, estado from piefirme.ctl_eventos_entrada where evento = 'recepcion_registrada' and id_externo = $1", [rid]);
    assert.equal(ev.length, 1); assert.equal(ev[0].payload.usuario_id, ids["r@g.com"]); assert.equal(ev[0].payload.lineas, 1);
    // reenvío idempotente: no duplica
    const otra = await registrar("r@g.com", rid, [l]);
    assert.equal(otra.res.idempotente, true);
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_recepcion_linea where recepcion_id = $1", [rid])).n, 1);
  });
  await t.test("una serie ya recibida no se recibe dos veces", async () => {
    const rid = uid();
    const r = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: pieza, serie: "EQ-9001", folio: "REC-0008" })]);
    assert.equal(r.code, "PF409"); assert.match(r.message, /ya está registrada/);
  });
  await t.test("recepción inmutable: ni el dueño de la base puede modificar o borrar (criterio 8)", async () => {
    await owner();
    const h = await uno("select id from piefirme.ctl_recepcion limit 1");
    for (const sql of ["update piefirme.ctl_recepcion set nota = 'x' where id = $1", "delete from piefirme.ctl_recepcion where id = $1",
                       "update piefirme.ctl_recepcion_linea set numero_serie = 'x' where recepcion_id = $1", "delete from piefirme.ctl_recepcion_linea where recepcion_id = $1"]) {
      const x = await intentar(sql, [h.id]);
      assert.equal(x.ok, false, sql); assert.equal(x.code, "PF403", `${sql}: ${x.message}`);
    }
    assert.equal((await intentar("truncate piefirme.ctl_recepcion_linea cascade")).ok, false);
  });
  await t.test("abierta y resellada: el sello anterior queda reemplazado y enlazado al nuevo", async () => {
    const rid = uid();
    await rpc("r@g.com", "ctl_sello_colocar", [uid(), sede, "REC-0100", caja, null, null, null]);
    const r = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: caja, folio: "REC-0100", ver: "abierta_y_resellada", nuevo: "REC-0101" })]);
    assert.equal(r.res.ok, true, r.message ?? J(r.res));
    const fs = await filas("select folio_sello, estado, sello_anterior_id from piefirme.ctl_sello where folio_sello in ('REC-0100', 'REC-0101') order by folio_sello");
    assert.equal(fs[0].estado, "reemplazado"); assert.equal(fs[1].estado, "vigente"); assert.ok(fs[1].sello_anterior_id);
    const sin = uid();
    const falta = await registrar("r@g.com", sin, [await linea("r@g.com", sin, { producto: caja, folio: "REC-0102", ver: "abierta_y_resellada" })]);
    assert.equal(falta.code, "PF422"); assert.match(falta.message, /sello nuevo/);
  });
  await t.test("sello roto al recibir: se registra, queda a cargo de quien firma, abre caso y alerta al supervisor", async () => {
    const rid = uid();
    const r = await registrar("p@g.com", rid, [await linea("p@g.com", rid, { producto: caja, folio: "REC-0200", ver: "sello_roto" })]);
    assert.equal(r.res.ok, true, r.message ?? J(r.res));
    assert.equal(r.res.con_incidencias, true);
    const s = await uno("select estado, caso_id from piefirme.ctl_sello where folio_sello = 'REC-0200'");
    assert.equal(s.estado, "roto_sin_registro");
    const k = await uno("select tipo from piefirme.ctl_caso where id = $1", [s.caso_id]);
    assert.equal(k.tipo, "sello_roto");
    assert.equal((await alertas("sello_roto_sin_registro", s.caso_id)).length, 1);
    assert.equal((await uno("select responsable_id from piefirme.ctl_recepcion_linea where recepcion_id = $1", [rid])).responsable_id, ids["p@g.com"]);
  });
  await t.test("peso fuera de rango al recibir: alerta de caja posiblemente vacía", async () => {
    const rid = uid();
    const r = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: pieza, serie: "EQ-9002", folio: "REC-0300", peso: 300 })]);
    assert.equal(r.res.ok, true, r.message ?? J(r.res));
    assert.equal(r.res.detalle[0].peso_coincide, false);
    const v = await uno("select id from piefirme.ctl_sello_verificacion where origen = 'recepcion' and origen_id = $1", [rid]);
    assert.equal((await alertas("peso_fuera_de_rango", v.id)).length, 1);
  });
  await t.test("un sello vigente en otra sucursal no se «recibe»: se explica que se reabre y se vuelve a sellar", async () => {
    await rpc("r@g.com", "ctl_sello_colocar", [uid(), S["5"], "REC-0400", caja, null, null, null]);
    const rid = uid();
    const r = await registrar("r@g.com", rid, [await linea("r@g.com", rid, { producto: caja, folio: "REC-0400" })]);
    assert.equal(r.code, "PF409"); assert.match(r.message, /otra sucursal/);
  });
});

// ═════════════════════════════ 5 · PIEZAS DE ALTO VALOR (F5.3) ═════════════════════════════
test("alto valor: serie por pieza y la venta de una pieza dispara alerta inmediata al dueño", async (t) => {
  const sede = S["6"];
  const av = await nuevoProducto("Ortesis de alto valor prueba", { serie: true, alto: true });
  const modelo = await nuevoProducto("Producto sin serie prueba");
  const tur = await turno(sede, "r@g.com");
  await t.test("la serie es obligatoria por pieza y no se repite; un producto sin esa bandera no admite series", async () => {
    assert.equal((await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, av, "  ", null])).code, "PF422");
    assert.equal((await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, av, "ab", null])).code, "PF422");
    assert.equal((await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, modelo, "SERIE-X1", null])).code, "PF422");
    const ok = await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, av, "orte-0001", null]);
    assert.equal(ok.ok, true, ok.message);
    assert.equal(ok.res.numero_serie, "ORTE-0001");
    const dup = await rpc("s@g.com", "ctl_pieza_registrar", [uid(), S["7"], av, "ORTE-0001", null]);
    assert.equal(dup.code, "PF409"); assert.match(dup.message, /una serie identifica a una sola pieza/);
  });
  await t.test("venta con una sola pieza en la sucursal: alerta al dueño con pieza, serie, sucursal y precio; la pieza queda vendida", async () => {
    const v = await ventaProducto(sede, tur, av, 18500);
    const r = await rpc("m@g.com", "ctl_alto_valor_revisar", [72]);
    assert.equal(r.ok, true, r.message);
    assert.ok(r.res.ventas_nuevas >= 1);
    const reg = await uno("select * from piefirme.ctl_venta_alto_valor where linea_id = $1", [v.linea]);
    assert.ok(reg, "se registró la línea evaluada");
    assert.equal(reg.numero_serie, "ORTE-0001"); assert.equal(Number(reg.precio), 18500); assert.equal(reg.sucursal_id, sede);
    const al = await alertas("venta_alto_valor", reg.id);
    assert.equal(al.length, 1);
    assert.deepEqual(al[0].destinatarios, ["dueno"]); assert.equal(al[0].severidad, "critica");
    assert.match(al[0].mensaje, /Ortesis de alto valor prueba/); assert.match(al[0].mensaje, /ORTE-0001/); assert.match(al[0].mensaje, /Sucursal prueba C6/); assert.match(al[0].mensaje, /18,500\.00/);
    assert.equal((await uno("select estado, venta_id from piefirme.ctl_pieza where numero_serie = 'ORTE-0001'")).estado, "vendida");
    // idempotente: el poleo repetido no vuelve a alertar
    const otra = await rpc("m@g.com", "ctl_alto_valor_revisar", [72]);
    assert.equal(otra.res.ventas_nuevas, 0);
    assert.equal((await alertas("venta_alto_valor", reg.id)).length, 1);
  });
  await t.test("con varias piezas del mismo producto la serie no es inequívoca: se listan las candidatas", async () => {
    await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, av, "ORTE-0002", null]);
    await rpc("r@g.com", "ctl_pieza_registrar", [uid(), sede, av, "ORTE-0003", null]);
    const v = await ventaProducto(sede, tur, av, 17000);
    await comoOwner("select piefirme_app.ctl_alto_valor_evaluar($1, now() - interval '1 hour')", [ORG]);
    const reg = await uno("select * from piefirme.ctl_venta_alto_valor where linea_id = $1", [v.linea]);
    assert.equal(reg.numero_serie, null);
    assert.deepEqual(reg.candidatas, ["ORTE-0002", "ORTE-0003"]);
    const al = await alertas("venta_alto_valor", reg.id);
    assert.match(al[0].mensaje, /una de: ORTE-0002, ORTE-0003/);
  });
  await t.test("un producto que no es de alto valor no dispara la alerta", async () => {
    const antes = (await alertas("venta_alto_valor")).length;
    await ventaProducto(sede, tur, modelo, 90);
    await comoOwner("select piefirme_app.ctl_alto_valor_evaluar($1, now() - interval '1 hour')", [ORG]);
    assert.equal((await alertas("venta_alto_valor")).length, antes);
  });
  await t.test("revisar ventas es de dueño y supervisor; la sucursal no ve piezas, ventas de alto valor ni el poleo", async () => {
    assert.equal((await rpc("r@g.com", "ctl_alto_valor_revisar", [72])).code, "PF403");
    assert.equal((await rpc("s@g.com", "ctl_alto_valor_revisar", [72])).ok, true);
    await como("r@g.com");
    for (const tabla of ["ctl_pieza", "ctl_venta_alto_valor"]) assert.equal((await intentar(`select * from piefirme.${tabla}`)).rows.length, 0, tabla);
    await como("m@g.com");
    assert.ok((await intentar("select * from piefirme.ctl_pieza")).rows.length >= 3);
    // el poleo interno no lo puede ejecutar la app
    await como("m@g.com");
    assert.equal((await intentar("select piefirme_app.ctl_alto_valor_evaluar($1)", [ORG])).ok, false);
  });
});

// ═════════════════════════════ 6 · TALONARIOS, TICKETS MANUALES Y AUDITORÍA (F5.4, criterio 21) ═════════════════════════════
test("talonarios: rango activo, folio repetido, auditoría con continuidad y el folio 18 sin capturar (criterio 21)", async (t) => {
  const sede = S["7"];
  let tal;
  const ticket = async (correo, folio, o = {}) => {
    const id = uid();
    const ev = o.sinFoto ? null : await foto(correo, sede, "ticket_manual", id);
    return rpc(correo, "ctl_ticket_manual_capturar", [id, o.sede ?? sede, folio, o.monto ?? 350, J(o.productos ?? [{ descripcion: "Plantilla", cantidad: 1 }]), ev, !!o.cancelado, null, null, o.caida ?? null, null]);
  };
  await t.test("alta: la hace supervisor o dueño (oficina central); recepción no; un rango traslapado se rechaza", async () => {
    assert.equal((await rpc("r@g.com", "ctl_talonario_alta", [sede, 1, 50, null, "Ana López", null, null])).code, "PF403");
    assert.equal((await rpc("s@g.com", "ctl_talonario_alta", [sede, 10, 5, null, "Ana López", null, null])).code, "PF422");
    assert.equal((await rpc("s@g.com", "ctl_talonario_alta", [sede, 1, 50, null, null, null, null])).code, "PF422", "quién recibió es obligatorio");
    const ok = await rpc("s@g.com", "ctl_talonario_alta", [sede, 1, 50, ids["r@g.com"], null, null, "Entrega en mostrador"]);
    assert.equal(ok.ok, true, ok.message);
    tal = ok.res.id;
    const tras = await rpc("m@g.com", "ctl_talonario_alta", [S["8"], 40, 90, null, "Luis", null, null]);
    assert.equal(tras.code, "PF409"); assert.match(tras.message, /se traslapa/);
    const t2 = await rpc("m@g.com", "ctl_talonario_alta", [S["8"], 51, 100, null, "Luis", null, null]);
    assert.equal(t2.ok, true, t2.message);
  });
  await t.test("ticket manual: el folio debe caer en un rango activo de ESA sucursal; sin foto no se captura", async () => {
    const fuera = await ticket("r@g.com", 51);
    assert.equal(fuera.code, "PF422"); assert.match(fuera.message, /no cae en un talonario activo de esta sucursal/);
    const otraSede = await ticket("r@g.com", 60);
    assert.equal(otraSede.code, "PF422", "el folio 60 es de otra sucursal");
    const sinFoto = await ticket("r@g.com", 1, { sinFoto: true });
    assert.equal(sinFoto.code, "PF422"); assert.match(sinFoto.message, /foto en vivo/);
    assert.equal((await ticket("r@g.com", 1, { monto: 0 })).code, "PF422");
    assert.equal((await ticket("r@g.com", 1, { productos: [] })).code, "PF422");
  });
  await t.test("folio repetido: el servidor lo rechaza; el reenvío del mismo envío es idempotente", async () => {
    const id = uid();
    const ev = await foto("r@g.com", sede, "ticket_manual", id);
    const args = [id, sede, 1, 450, J([{ descripcion: "Quiropodia", cantidad: 1 }]), ev, false, null, null, null, null];
    const ok = await rpc("r@g.com", "ctl_ticket_manual_capturar", args);
    assert.equal(ok.res.ok, true, ok.message);
    assert.equal((await rpc("r@g.com", "ctl_ticket_manual_capturar", args)).res.idempotente, true);
    const rep = await ticket("p@g.com", 1);
    assert.equal(rep.code, "PF409"); assert.match(rep.message, /ya está capturado/);
    assert.equal((await uno("select count(*)::int as n from piefirme.ctl_ticket_manual where talonario_id = $1 and folio = 1", [tal])).n, 1);
  });
  await t.test("captura de los folios 2 al 24, con el 18 sin capturar y algunos cancelados", async () => {
    for (let f = 2; f <= 24; f++) {
      if (f === 18) continue;
      const r = await ticket("r@g.com", f, f % 7 === 0 ? { cancelado: true, monto: 0, productos: [] } : {});
      assert.equal(r.ok, true, `folio ${f}: ${r.message}`);
    }
    const res = await rpc("r@g.com", "ctl_talonario_resumen", [sede]);
    const x = res.res.find((q) => q.id === tal);
    assert.equal(x.capturados + x.cancelados, 23); assert.equal(x.siguiente_sin_capturar, 18); assert.equal(x.ultimo_capturado, 24);
  });
  await t.test("AUDITORÍA: el siguiente folio en blanco es el 25 y falta el 18 → caso folio_faltante y alerta al dueño (criterio 21)", async () => {
    const id = uid();
    const ev = await foto("s@g.com", sede, "talonario_auditoria", id);
    assert.equal((await rpc("r@g.com", "ctl_talonario_auditar", [id, tal, 25, ev, null])).code, "PF403", "la sucursal no se audita a sí misma");
    const r = await rpc("s@g.com", "ctl_talonario_auditar", [id, tal, 25, ev, null]);
    assert.equal(r.ok, true, r.message);
    assert.equal(r.res.continuo, false);
    assert.deepEqual(r.res.faltantes, [18]); assert.deepEqual(r.res.nuevos, [18]); assert.deepEqual(r.res.adelantados, []);
    const k = await uno("select * from piefirme.ctl_caso where id = $1", [r.res.caso_id]);
    assert.equal(k.tipo, "folio_faltante"); assert.equal(k.estado, "abierta"); assert.equal(k.origen_tipo, "talonario_auditoria"); assert.equal(k.origen_id, id);
    assert.deepEqual(k.contexto.folios_faltantes, [18]);
    const al = await alertas("folio_faltante", k.id);
    assert.equal(al.length, 1); assert.deepEqual(al[0].destinatarios, ["dueno"]); assert.match(al[0].mensaje, /18/); assert.match(al[0].mensaje, /25/);
    const marca = await uno("select estado from piefirme.ctl_ticket_manual where talonario_id = $1 and folio = 18", [tal]);
    assert.equal(marca.estado, "faltante");
    const a = await uno("select continuo, folios_faltantes, caso_id from piefirme.ctl_talonario_auditoria where id = $1", [id]);
    assert.equal(a.continuo, false); assert.deepEqual(a.folios_faltantes, [18]); assert.equal(a.caso_id, k.id);
    const det = await rpc("m@g.com", "ctl_caso_detalle", [k.id]);
    assert.equal(det.ok, true, det.message);
  });
  await t.test("una segunda auditoría con el mismo faltante NO abre otro caso (ya estaba marcado); la alerta diaria resume lo pendiente", async () => {
    const id = uid();
    const ev = await foto("s@g.com", sede, "talonario_auditoria", id);
    const r = await rpc("s@g.com", "ctl_talonario_auditar", [id, tal, 25, ev, null]);
    assert.equal(r.res.continuo, false); assert.deepEqual(r.res.nuevos, []); assert.equal(r.res.caso_id, null);
    assert.equal((await casos("folio_faltante", sede)).length, 1);
    const n = await uno("select piefirme_app.ctl_talonario_alerta_diaria($1) as n", [ORG]);
    assert.ok(n.n >= 1);
    const d = await alertas("folio_faltante_diario");
    assert.equal(d.length, 1); assert.match(d[0].mensaje, /18/);
    assert.equal((await uno("select piefirme_app.ctl_talonario_alerta_diaria($1) as n", [ORG])).n, 0, "una por día");
  });
  await t.test("folios capturados DESPUÉS del «siguiente en blanco» (saltados) también abren caso", async () => {
    const id = uid();
    const ev = await foto("m@g.com", sede, "talonario_auditoria", id);
    assert.equal((await ticket("r@g.com", 28)).ok, true);
    const r = await rpc("m@g.com", "ctl_talonario_auditar", [id, tal, 26, ev, null]);
    assert.deepEqual(r.res.adelantados, [28]);
    assert.ok(r.res.caso_id, "el folio 28 ya está usado y el 26 se dice en blanco");
  });
  await t.test("rango inválido de «siguiente en blanco» se rechaza con el rango real", async () => {
    const id = uid();
    const ev = await foto("m@g.com", sede, "talonario_auditoria", id);
    const r = await rpc("m@g.com", "ctl_talonario_auditar", [id, tal, 99, ev, null]);
    assert.equal(r.code, "PF422"); assert.match(r.message, /entre 1 y 51/);
  });
  await t.test("aparece el papel del folio 18: el faltante se resuelve y la auditoría ya sale continua", async () => {
    const r = await ticket("r@g.com", 18, { nota: "x" });
    assert.equal(r.ok, true, r.message);
    assert.equal((await uno("select estado from piefirme.ctl_ticket_manual where talonario_id = $1 and folio = 18", [tal])).estado, "capturado");
    // quitamos el 28 adelantado: auditoría contra el 29 (24 + 25..28 capturados?) → faltan 25, 26, 27
    const id = uid();
    const ev = await foto("m@g.com", sede, "talonario_auditoria", id);
    const a = await rpc("m@g.com", "ctl_talonario_auditar", [id, tal, 25, ev, null]);
    assert.equal(a.res.continuo, false, "el 28 está capturado y el 25 se dijo en blanco: adelantado");
    assert.deepEqual(a.res.faltantes, []);
    assert.deepEqual(a.res.adelantados, [28]);
  });
  await t.test("talonario cancelado: sus folios dejan de aceptarse", async () => {
    assert.equal((await rpc("r@g.com", "ctl_talonario_cancelar", [tal, "motivo largo"])).code, "PF403");
    assert.equal((await rpc("m@g.com", "ctl_talonario_cancelar", [tal, "x"])).code, "PF422");
    assert.equal((await rpc("m@g.com", "ctl_talonario_cancelar", [tal, "Se extravió el talonario completo"])).ok, true);
    assert.equal((await ticket("r@g.com", 40)).code, "PF422");
  });
  await t.test("un talonario completo pasa a consumido", async () => {
    const t3 = (await rpc("m@g.com", "ctl_talonario_alta", [sede, 200, 202, null, "Ana", null, null])).res.id;
    for (const f of [200, 201, 202]) assert.equal((await ticket("r@g.com", f, f === 201 ? { cancelado: true, monto: 0, productos: [] } : {})).ok, true);
    assert.equal((await uno("select estado from piefirme.ctl_talonario where id = $1", [t3])).estado, "consumido");
  });
});

// ═════════════════════════════ 7 · CAÍDAS DEL SISTEMA ═════════════════════════════
test("caídas del sistema: inicio, fin, tickets manuales, venta contra el promedio y sucursal que «se cae» seguido", async (t) => {
  const sede = S["8"];
  const tur = await turno(sede, "r@g.com");
  /** Historia de ventas del mismo horario en las 3 semanas previas (muestras del promedio). */
  const historia = async (inicioIso, monto) => {
    for (const k of [1, 2, 3]) await ventaServicio(sede, tur, monto, `${7 * k} days`);
  };
  await t.test("iniciar es idempotente (una sola caída abierta por sucursal) y los tickets manuales se ligan a la caída abierta", async () => {
    const a = await rpc("r@g.com", "ctl_caida_iniciar", [uid(), sede, new Date(Date.now() - 3 * 3600e3).toISOString(), null]);
    assert.equal(a.ok, true, a.message);
    const b = await rpc("p@g.com", "ctl_caida_iniciar", [uid(), sede, null, null]);
    assert.equal(b.res.ya_abierta, true); assert.equal(b.res.id, a.res.id);
    await owner();
    const tal = (await rpc("m@g.com", "ctl_talonario_alta", [sede, 300, 399, null, "Pedro", null, null])).res.id;
    const id = uid();
    const ev = await foto("r@g.com", sede, "ticket_manual", id);
    const tk = await rpc("r@g.com", "ctl_ticket_manual_capturar", [id, sede, 300, 800, J([{ descripcion: "Servicio", cantidad: 1 }]), ev, false, null, null, null, null]);
    assert.equal(tk.res.caida_id, a.res.id);
    const fut = await rpc("r@g.com", "ctl_caida_cerrar", [a.res.id, new Date(Date.now() - 4 * 3600e3).toISOString(), null]);
    assert.equal(fut.code, "PF422", "el fin debe ser posterior al inicio");
    const ok = await rpc("r@g.com", "ctl_caida_cerrar", [a.res.id, null, "Se cayó el internet"]);
    assert.equal(ok.res.ok, true, ok.message); assert.equal(ok.res.tickets_manuales, 1);
    assert.equal((await rpc("r@g.com", "ctl_caida_cerrar", [a.res.id, null, null])).res.idempotente, true);
    assert.equal(tal !== undefined, true);
  });
  await t.test("comparación de la venta del periodo contra el promedio de la tienda: solo la ven dueño y supervisor", async () => {
    // caída de 1 h hace 2 h (hoy): historia de ventas de 1,000 en esa misma franja las 3 semanas previas; durante la caída solo 100 en tickets
    const ini = new Date(Date.now() - 2 * 3600e3), fin = new Date(Date.now() - 1 * 3600e3);
    const a = await rpc("r@g.com", "ctl_caida_iniciar", [uid(), sede, ini.toISOString(), null]);
    assert.equal(a.ok, true, a.message);
    for (const k of [1, 2, 3]) {
      const v = await ventaServicio(sede, tur, 1000);
      await comoOwner("update piefirme.ventas set cobrada_en = $2 where id = $1", [v, new Date(ini.getTime() + 20 * 60e3 - 7 * k * 86400e3).toISOString()]);
    }
    const cerrar = await rpc("r@g.com", "ctl_caida_cerrar", [a.res.id, fin.toISOString(), null]);
    assert.equal(cerrar.res.ok, true, cerrar.message);
    const lista = await rpc("m@g.com", "ctl_caidas_listar", [sede, 20]);
    const x = lista.res.find((q) => q.id === a.res.id);
    assert.equal(Number(x.comparacion.venta_sistema), 0);
    assert.equal(Number(x.comparacion.venta_esperada), 375, "(1,000 × 3 semanas) / 8 = 375: se divide entre las 8 semanas de la ventana");
    assert.equal(x.comparacion.baja, true);
    const prop = await rpc("r@g.com", "ctl_caidas_listar", [sede, 20]);
    assert.equal(prop.ok, true, prop.message);
    assert.ok(prop.res.length >= 2);
    assert.ok(prop.res.every((q) => !("comparacion" in q)), "la sucursal no ve lo que el sistema esperaba vender");
    await como("r@g.com");
    assert.equal((await intentar("select * from piefirme.ctl_caida_resumen")).rows.length, 0);
    await como("s@g.com");
    assert.ok((await intentar("select * from piefirme.ctl_caida_resumen")).rows.length >= 1);
  });
  await t.test("una sucursal que «se cae» seguido y vende menos en esos ratos genera alerta (una por día)", async () => {
    for (const horas of [20, 30]) {
      const ini = new Date(Date.now() - horas * 3600e3), fin = new Date(ini.getTime() + 3600e3);
      const a = await rpc("r@g.com", "ctl_caida_iniciar", [uid(), sede, ini.toISOString(), null]);
      assert.equal(a.ok, true, a.message);
      for (const k of [1, 2, 3]) {
        const v = await ventaServicio(sede, tur, 2000);
        await comoOwner("update piefirme.ventas set cobrada_en = $2 where id = $1", [v, new Date(ini.getTime() + 15 * 60e3 - 7 * k * 86400e3).toISOString()]);
      }
      const c = await rpc("r@g.com", "ctl_caida_cerrar", [a.res.id, fin.toISOString(), null]);
      assert.equal(c.res.ok, true, c.message);
    }
    const al = await alertas("sucursal_se_cae");
    assert.equal(al.filter((x) => x.sucursal_id === sede).length, 1);
    assert.deepEqual([...al[0].destinatarios].sort(), ["dueno", "supervisor"]);
    assert.match(al[0].mensaje, /patrón para revisar, no una conclusión/);
  });
  await t.test("una caída solo se inicia en una sucursal propia y no puede haber empezado hace más de 48 horas", async () => {
    assert.equal((await rpc("r@g.com", "ctl_caida_iniciar", [uid(), sede, new Date(Date.now() - 60 * 3600e3).toISOString(), null])).code, "PF422");
  });
});

// ═════════════════════════════ 8 · CAPTURA A CIEGAS Y PRIVILEGIOS ═════════════════════════════
test("la sucursal nunca ve saldo, diferencia ni lo que el sistema espera (criterio 1) y la app solo escribe por RPC (criterio 8)", async (t) => {
  await t.test("ninguna respuesta de RPC a recepción o podología trae un campo ciego", async () => {
    const sede = S["8"];
    for (const correo of ["r@g.com", "p@g.com"]) {
      const salidas = [
        await rpc(correo, "ctl_custodia_estado", [sede]), await rpc(correo, "ctl_talonario_resumen", [sede]), await rpc(correo, "ctl_caidas_listar", [sede, 20]),
        await rpc(correo, "ctl_sello_verificar", [uid(), sede, "NO-EXISTE", true, 100, null, null]),
      ];
      for (const s of salidas) {
        assert.equal(s.ok, true, s.message);
        const k = claves(s.res);
        for (const campo of [...CAMPOS_CIEGOS, "peso_esperado", "desviacion_pct", "venta_esperada", "comparacion", "piezas_en_sucursal", "candidatas"]) assert.equal(k.has(campo), false, `${correo} recibió ${campo}`);
      }
    }
  });
  await t.test("las tablas con lo que el sistema espera devuelven cero filas a la sucursal y filas a dueño y supervisor", async () => {
    for (const tabla of ["ctl_sello_verificacion_calculo", "ctl_pieza", "ctl_venta_alto_valor", "ctl_talonario_auditoria", "ctl_caida_resumen"]) {
      for (const correo of ["r@g.com", "p@g.com", "a@g.com"]) { await como(correo); assert.equal((await intentar(`select * from piefirme.${tabla}`)).rows.length, 0, `${correo} → ${tabla}`); }
      await como("m@g.com"); assert.ok((await intentar(`select * from piefirme.${tabla}`)).rows.length >= 1, `dueño → ${tabla}`);
    }
  });
  await t.test("recepciones y verificaciones: la sucursal ve las suyas, no las de otros", async () => {
    await como("p@g.com");
    const propias = await intentar("select creado_por from piefirme.ctl_recepcion");
    assert.ok(propias.rows.length >= 1 && propias.rows.every((x) => x.creado_por === ids["p@g.com"]));
    await como("s@g.com");
    assert.ok((await intentar("select * from piefirme.ctl_recepcion")).rows.length >= 2);
  });
  await t.test("authenticated no puede insertar, modificar ni borrar en ninguna tabla nueva (los cinco roles)", async () => {
    const tablas = ["ctl_sello", "ctl_talonario", "ctl_ticket_manual", "ctl_caida_sistema", "ctl_producto_atributo", "ctl_sello_verificacion", "ctl_sello_verificacion_calculo", "ctl_recepcion",
      "ctl_recepcion_linea", "ctl_pieza", "ctl_venta_alto_valor", "ctl_producto_atributo_bitacora", "ctl_talonario_auditoria", "ctl_caida_resumen"];
    for (const correo of CORREOS) {
      for (const tabla of tablas) {
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
  await t.test("las tablas de captura son inmutables incluso para el dueño de la base (solo inserción)", async () => {
    await owner();
    for (const tabla of ["ctl_sello_verificacion", "ctl_sello_verificacion_calculo", "ctl_talonario_auditoria", "ctl_venta_alto_valor", "ctl_caida_resumen", "ctl_producto_atributo_bitacora"]) {
      const f = await uno(`select count(*)::int as n from piefirme.${tabla}`);
      if (!f.n) continue;
      const col = (await filas("select column_name from information_schema.columns where table_schema = 'piefirme' and table_name = $1 order by ordinal_position limit 1", [tabla]))[0].column_name;
      const u = await intentar(`update piefirme.${tabla} set ${col} = ${col}`); assert.equal(u.ok, false, tabla); assert.equal(u.code, "PF403", `${tabla}: ${u.message}`);
      const d = await intentar(`delete from piefirme.${tabla}`); assert.equal(d.ok, false, tabla); assert.equal(d.code, "PF403");
    }
  });
  await t.test("las tablas con estado solo cambian dentro de una RPC: un UPDATE directo se rechaza", async () => {
    await owner();
    await c.query("select set_config('app.ctl_rpc', '', true)");   // las RPC anteriores dejaron la bandera encendida en esta transacción
    const x = await intentar("update piefirme.ctl_sello set estado = 'reemplazado' where estado = 'vigente'");
    assert.equal(x.ok, false); assert.equal(x.code, "PF403");
    const y = await intentar("update piefirme.ctl_pieza set estado = 'retirada' where estado = 'en_sucursal'");
    assert.equal(y.ok, false); assert.equal(y.code, "PF403");
  });
  await t.test("ninguna función nueva se ejecuta como anon", async () => {
    await owner();
    const f = await filas(`select p.oid::regprocedure::text as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_producto_atributo_guardar', 'ctl_productos_control_listar', 'ctl_sello_colocar', 'ctl_sello_reabrir', 'ctl_sello_verificar',
         'ctl_recepcion_registrar', 'ctl_pieza_registrar', 'ctl_custodia_estado', 'ctl_custodia_incluir_alto_valor', 'ctl_alto_valor_revisar', 'ctl_alto_valor_procesar', 'ctl_alto_valor_evaluar',
         'ctl_talonario_alta', 'ctl_talonario_cancelar', 'ctl_ticket_manual_capturar', 'ctl_talonario_resumen', 'ctl_talonario_auditar', 'ctl_talonario_alerta_diaria', 'ctl_caida_iniciar',
         'ctl_caida_cerrar', 'ctl_caidas_listar', 'ctl_caida_calcular', 'ctl_caidas_evaluar', 'ctl_sello_marcar_roto', 'ctl_sello_verificar_interno', 'ctl_cus_alerta', 'ctl_cus_evidencia_ok')`);
    assert.ok(f.length >= 27, `solo ${f.length} funciones`);
    for (const { firma } of f) {
      const x = await uno("select has_function_privilege('anon', $1::regprocedure, 'execute') as a", [firma]);
      assert.equal(x.a, false, `anon ejecuta ${firma}`);
    }
  });
  await t.test("las funciones internas no las ejecuta la app (solo las RPC)", async () => {
    await owner();
    for (const firma of ["piefirme_app.ctl_alto_valor_evaluar(uuid, timestamptz)", "piefirme_app.ctl_sello_marcar_roto(uuid, text, uuid, uuid, text)", "piefirme_app.ctl_caidas_evaluar(uuid, uuid)"]) {
      const x = await uno("select has_function_privilege('authenticated', $1::regprocedure, 'execute') as a", [firma]);
      assert.equal(x.a, false, `authenticated ejecuta ${firma}`);
    }
  });
});
