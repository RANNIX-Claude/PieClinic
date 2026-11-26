// Semilla IDEMPOTENTE y SOLO QA de la cadena de custodia (Etapa 7): deja datos de prueba para recorrer las pantallas.
//   node scripts/semilla-auditoria-custodia-qa.mjs [--quitar]
// Qué deja (todo por las mismas RPC que usa la app, actuando como el dueño m@g.com):
//   · 3 productos del catálogo marcados: uno de ALTO VALOR (serie + sello + peso de caja llena), uno con SELLO y PESO, uno con SERIE.
//   · 2 piezas con número de serie del producto de alto valor en la primera sucursal.
//   · 1 talonario de contingencia (folios 5001–5050) en la primera sucursal.
// `--quitar` desmarca los 3 productos (lo demás es evidencia y no se borra: las tablas son de solo inserción).
// Rechaza correr contra producción.
import { ambiente, conectar } from "./lib/env.mjs";

const cfg = ambiente("qa");
const ORG = "00000000-0000-0000-0000-00000000c0de";
const quitar = process.argv.includes("--quitar");
const c = await conectar(cfg);
const J = JSON.stringify;

async function como(correo) {
  const u = (await c.query("select id from piefirme.perfiles where email = $1", [correo])).rows[0];
  if (!u) throw new Error(`falta la cuenta ${correo}: corre scripts/qa-usuarios-prueba.mjs qa`);
  await c.query("select set_config('request.jwt.claims', $1, true)", [J({ sub: u.id, role: "authenticated", email: correo })]);
  await c.query("set local role authenticated");
}
const owner = async () => { await c.query("reset role"); await c.query("select set_config('request.jwt.claims', '', true)"); };

try {
  await c.query("begin");
  await owner();
  const prods = (await c.query("select id, nombre from piefirme.productos where organizacion_id = $1 and estado = 'activo' order by nombre limit 3", [ORG])).rows;
  const sede = (await c.query("select id, nombre from piefirme.sedes where organizacion_id = $1 and activa order by nombre limit 1", [ORG])).rows[0];
  if (prods.length < 3 || !sede) throw new Error("QA no tiene productos o sucursales suficientes");
  const [alto, sello, serie] = prods;
  await como("m@g.com");
  const g = async (p, ...a) => (await c.query("select piefirme.ctl_producto_atributo_guardar($1, $2, $3, $4, $5) as r", [p.id, ...a])).rows[0].r;
  if (quitar) {
    for (const p of prods) await g(p, false, false, false, null);
    console.log("[qa] productos desmarcados");
  } else {
    await g(alto, true, true, true, 1850);
    await g(sello, false, true, false, 420);
    await g(serie, true, false, false, null);
    console.log(`[qa] marcados: alto valor «${alto.nombre}», con sello «${sello.nombre}», con serie «${serie.nombre}»`);
    for (const s of ["DEMO-AV-0001", "DEMO-AV-0002"]) {
      const sp = `sp_${s.replace(/\W/g, "")}`;
      await c.query(`savepoint ${sp}`);
      try { await c.query("select piefirme.ctl_pieza_registrar(gen_random_uuid(), $1, $2, $3, null)", [sede.id, alto.id, s]); console.log(`[qa] pieza ${s} registrada en ${sede.nombre}`); await c.query(`release savepoint ${sp}`); }
      catch (e) { await c.query(`rollback to savepoint ${sp}`); console.log(`[qa] pieza ${s}: ${e.message}`); }
    }
    await owner(); await como("m@g.com");
    const hay = (await c.query("select 1 from piefirme.ctl_talonario where organizacion_id = $1 and folio_inicial = 5001 and estado <> 'cancelado'", [ORG])).rows.length;
    if (hay) console.log("[qa] el talonario 5001–5050 ya existe");
    else {
      const sp = "sp_tal";
      await c.query(`savepoint ${sp}`);
      try { await c.query("select piefirme.ctl_talonario_alta($1, 5001, 5050, null, 'Encargada de la sucursal (demo)', now(), 'Talonario de demostración')", [sede.id]); console.log(`[qa] talonario 5001–5050 dado de alta en ${sede.nombre}`); await c.query(`release savepoint ${sp}`); }
      catch (e) { await c.query(`rollback to savepoint ${sp}`); console.log(`[qa] talonario: ${e.message}`); }
    }
  }
  await owner();
  await c.query("commit");
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("[qa] error:", e.message); process.exitCode = 1;
} finally { await c.end(); }
