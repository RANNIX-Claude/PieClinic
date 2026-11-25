// Prueba de comportamiento de la migración 078 (conteo inicial de inventario) en una BD local desechable (PGlite).
//   node scripts/probar-conteo-inicial-local.mjs
// Cubre: roles, zonas, captura con suma y trazabilidad, búsqueda por código, producto provisional (alta y completar/duplicado), corte que
// bloquea ventas y traspasos, resumen, aprobación (movimientos, ceros, no editable) y que un conteo posterior sigue siendo posible.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ROOT } from "./lib/env.mjs";

const dir = path.join(ROOT, "migraciones");
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
`);
const ORG = "00000000-0000-0000-0000-000000000001", SEDE = "00000000-0000-0000-0000-0000000000f1", SEDE2 = "00000000-0000-0000-0000-0000000000f2";
const U = { admin: "00000000-0000-0000-0000-0000000000a1", rec: "00000000-0000-0000-0000-0000000000c1", sup: "00000000-0000-0000-0000-0000000000b1", pod: "00000000-0000-0000-0000-0000000000d1" };
const archivos = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
for (const f of archivos) {
  if (f.startsWith("076_")) {   // datos de base antes de las migraciones nuevas
    await db.exec(`
      insert into auth.users (id, email) values ('${U.admin}','a@t'),('${U.rec}','r@t'),('${U.sup}','s@t'),('${U.pod}','p@t');
      insert into piefirme.organizaciones (id, nombre, estado) values ('${ORG}','Pie Clinic QA','activa');
      insert into piefirme.sedes (id, organizacion_id, clave, nombre) values ('${SEDE}','${ORG}','CEN','Centenario'),('${SEDE2}','${ORG}','PVC','Patio Valle de Chalco');
      insert into piefirme.perfiles (id, organizacion_id, rol, nombre, sedes) values
        ('${U.admin}','${ORG}','administrador','Dueño','{}'),('${U.rec}','${ORG}','recepcion','Caja','{}'),('${U.sup}','${ORG}','supervisor','Supervisora','{}'),('${U.pod}','${ORG}','podologo','Podólogo','{}');
    `);
  }
  await db.exec(fs.readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, ""));
}

let ok = 0, mal = 0;
const como = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, msg: e.message }; }
  finally { await db.exec("reset role;"); }
};
const esperar = (n, c, extra = "") => { if (c) { ok++; console.log("  ✓", n); } else { mal++; console.log("  ✗", n, extra); } };

// catálogo de prueba
await db.exec(`
  insert into piefirme.productos (organizacion_id, sku, codigo_barras, nombre, categoria, marca, estado, clave_alterna) values
    ('${ORG}','SKU-A','7501000000001','Soporte abdominal XL gris','Ortopedia','Ortho','activo','ALT-A'),
    ('${ORG}','SKU-B','7501000000002','Plantilla gel talla 27','Ortopedia','Gel','activo',null),
    ('${ORG}','SKU-C','7501000000003','Crema para talones','Cuidado','Cuida','activo',null),
    ('${ORG}','SKU-D','0000000004567','Faja lumbar M','Ortopedia','Ortho','activo',null);
`);
const pid = async (sku) => (await db.query(`select id from piefirme.productos where sku='${sku}'`)).rows[0].id;
const A = await pid("SKU-A"), B = await pid("SKU-B"), C = await pid("SKU-C"), D = await pid("SKU-D");
// C ya tiene existencia (de una prueba anterior): como no se cuenta, debe quedar en 0
await db.exec(`insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad, nota) values ('${ORG}','${SEDE}','${C}','ajuste', 7, 'existencia previa')`);

console.log("── conteo inicial: inicio y roles ──");
let r = await como(U.rec, `select piefirme.conteo_inicial_iniciar('${SEDE}')`);
esperar("caja NO inicia el conteo inicial", !r.ok, r.msg);
r = await como(U.pod, `select piefirme.conteo_inicial_iniciar('${SEDE}')`);
esperar("el podólogo NO inicia el conteo inicial", !r.ok, r.msg);
r = await como(U.sup, `select piefirme.conteo_inicial_iniciar('${SEDE}') as id`);
esperar("la supervisión inicia el conteo inicial", r.ok && r.rows[0].id, r.msg);
const CONTEO = r.rows?.[0]?.id;
r = await como(U.admin, `select piefirme.conteo_inicial_iniciar('${SEDE}') as id`);
esperar("iniciar de nuevo devuelve el mismo conteo (no duplica)", r.ok && r.rows[0].id === CONTEO, r.msg);
r = await db.query(`select tipo, estado, corte_en is not null as corte, folio from piefirme.conteos_fisicos where id='${CONTEO}'`);
esperar("el conteo es tipo inicial, borrador, con corte y folio", r.rows[0].tipo === "inicial" && r.rows[0].estado === "borrador" && r.rows[0].corte && /CNT-/.test(r.rows[0].folio ?? ""), JSON.stringify(r.rows[0]));

console.log("── zonas y captura ──");
r = await como(U.rec, `select piefirme.conteo_zona_abrir('${CONTEO}', 'Anaquel 1') as id`);
esperar("caja abre una zona", r.ok, r.msg);
const Z1 = r.rows?.[0]?.id;
r = await como(U.rec, `select piefirme.conteo_zona_abrir('${CONTEO}', ' anaquel 1 ') as id`);
esperar("abrir la misma zona (otro formato) devuelve la misma", r.ok && r.rows[0].id === Z1, r.msg);
r = await como(U.rec, `select piefirme.conteo_zona_abrir('${CONTEO}', '   ')`);
esperar("una zona sin nombre se rechaza", !r.ok, r.msg);
r = await como(U.pod, `select piefirme.conteo_zona_abrir('${CONTEO}', 'Mostrador')`);
esperar("el podólogo NO abre zonas", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.producto_por_codigo('7501000000001') as p`);
esperar("el escáner encuentra el producto por código de barras", r.ok && r.rows[0].p?.nombre === "Soporte abdominal XL gris", JSON.stringify(r.rows?.[0]) + (r.msg ?? ""));
r = await como(U.rec, `select piefirme.producto_por_codigo('ALT-A') as p`);
esperar("también por clave alterna", r.ok && r.rows[0].p?.sku === "SKU-A", r.msg);
r = await como(U.rec, `select piefirme.producto_por_codigo('4567') as p`);
esperar("un código sin ceros a la izquierda encuentra el EAN con ceros", r.ok && r.rows[0].p?.sku === "SKU-D", JSON.stringify(r.rows?.[0]) + (r.msg ?? ""));
r = await como(U.rec, `select piefirme.producto_por_codigo('999') as p`);
esperar("un código que no existe devuelve vacío", r.ok && r.rows[0].p === null, r.msg);
for (let i = 0; i < 3; i++) await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${A}', 1, null, 'escaner')`);
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${A}', 1, null, 'camara') as n`);
esperar("cada escaneo suma 1 (4 en total)", r.ok && Number(r.rows[0].n) === 4, r.msg);
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${A}', -1, null, 'manual') as n`);
esperar("el botón − resta 1", r.ok && Number(r.rows[0].n) === 3, r.msg);
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${A}', 0, 12, 'manual') as n`);
esperar("se puede teclear la cantidad directo", r.ok && Number(r.rows[0].n) === 12, r.msg);
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${B}', -5) as n`);
esperar("restar de más no baja de cero", r.ok && Number(r.rows[0].n) === 0, r.msg);
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${B}', 0, -3)`);
esperar("una cantidad negativa se rechaza", !r.ok, r.msg);
r = await como(U.rec, `select actualizado_por_nombre, metodo, zona_nombre from piefirme.prp_conteo_capturas where producto_id='${A}'`);
esperar("queda quién contó, cómo y en qué zona", r.ok && r.rows[0].actualizado_por_nombre === "Caja" && r.rows[0].metodo === "manual" && r.rows[0].zona_nombre === "Anaquel 1", JSON.stringify(r.rows?.[0]) + (r.msg ?? ""));
r = await db.query(`select contado from piefirme.conteo_lineas where conteo_id='${CONTEO}' and producto_id='${A}'`);
esperar("la línea del conteo suma lo capturado", r.rows.length === 1 && Number(r.rows[0].contado) === 12, JSON.stringify(r.rows));
r = await como(U.rec, `insert into piefirme.conteo_capturas (organizacion_id, sede_id, conteo_id, zona_id, producto_id, cantidad) values ('${ORG}','${SEDE}','${CONTEO}','${Z1}','${C}', 5)`);
esperar("no se escribe directo en las capturas (solo con la función)", !r.ok, r.msg);

console.log("── la misma pieza en dos zonas se suma ──");
r = await como(U.rec, `select piefirme.conteo_zona_abrir('${CONTEO}', 'Vitrina') as id`);
const Z2 = r.rows?.[0]?.id;
await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z2}','${A}', 0, 5, 'manual')`);
r = await db.query(`select contado from piefirme.conteo_lineas where conteo_id='${CONTEO}' and producto_id='${A}'`);
esperar("12 en el anaquel + 5 en la vitrina = 17", Number(r.rows[0]?.contado) === 17, JSON.stringify(r.rows));
r = await como(U.rec, `select id from piefirme.prp_conteo_capturas where zona_id='${Z2}' and producto_id='${A}'`);
const capVitrina = r.rows?.[0]?.id;
r = await como(U.rec, `select piefirme.conteo_captura_borrar('${capVitrina}')`);
esperar("se puede borrar un conteo de la lista", r.ok, r.msg);
r = await db.query(`select contado from piefirme.conteo_lineas where conteo_id='${CONTEO}' and producto_id='${A}'`);
esperar("al borrar, la suma baja a 12", Number(r.rows[0]?.contado) === 12, JSON.stringify(r.rows));

console.log("── producto no encontrado: provisional ──");
r = await como(U.rec, `select piefirme.producto_provisional_crear('${CONTEO}','${Z1}','7509999999999','  ', 3)`);
esperar("el provisional exige nombre", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.producto_provisional_crear('${CONTEO}','${Z1}','7501000000001','Repetido', 3)`);
esperar("no se da de alta un código que ya existe", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.producto_provisional_crear('${CONTEO}','${Z1}','7509999999999','Tobillera neopreno ch', 6, '${ORG}/conteo/etiqueta.jpg') as p`);
esperar("caja da de alta un provisional (código, nombre, cantidad y foto)", r.ok && r.rows[0].p?.estado === "provisional", r.msg);
const PROV = r.rows?.[0]?.p?.id;
r = await db.query(`select estado, categoria, codigo_barras, provisional_foto_path, provisional_conteo_id from piefirme.productos where id='${PROV}'`);
esperar("queda estado provisional, por clasificar, con su foto y su conteo", r.rows[0].estado === "provisional" && r.rows[0].categoria === "Por clasificar" && r.rows[0].provisional_foto_path?.endsWith("etiqueta.jpg") && r.rows[0].provisional_conteo_id === CONTEO, JSON.stringify(r.rows[0]));
r = await como(U.rec, `select count(*)::int as n from piefirme.prp_productos_provisionales`);
esperar("aparece en la vista de provisionales", r.ok && r.rows[0].n === 1, r.msg);
r = await como(U.rec, `select piefirme.producto_provisional_completar('${PROV}','Tobillera neopreno chica','Ortho','Ortopedia', 80, 150)`);
esperar("caja NO completa provisionales", !r.ok, r.msg);
r = await como(U.admin, `select piefirme.producto_provisional_completar('${PROV}','Tobillera neopreno chica','Ortho','Por clasificar', 80, 150)`);
esperar("no se completa sin elegir categoría", !r.ok, r.msg);
r = await como(U.admin, `select piefirme.producto_provisional_completar('${PROV}','Tobillera neopreno chica','Ortho','Ortopedia', 80, 0)`);
esperar("no se completa sin precio", !r.ok, r.msg);
r = await como(U.sup, `select piefirme.producto_provisional_completar('${PROV}','Tobillera neopreno chica','Ortho','Ortopedia', 80, 150) as x`);
esperar("la supervisión completa el provisional", r.ok && r.rows[0].x === "completado", r.msg);
r = await db.query(`select p.estado, p.marca, p.categoria, (select precio from piefirme.precios where producto_id=p.id) as precio from piefirme.productos p where id='${PROV}'`);
esperar("queda activo, con marca, categoría y precio de lista", r.rows[0].estado === "activo" && r.rows[0].marca === "Ortho" && r.rows[0].categoria === "Ortopedia" && Number(r.rows[0].precio) === 150, JSON.stringify(r.rows[0]));
// duplicado
r = await como(U.rec, `select piefirme.producto_provisional_crear('${CONTEO}','${Z1}','AAA-DUP','Soporte abdominal XL (otro)', 2) as p`);
const DUP = r.rows?.[0]?.p?.id;
r = await como(U.admin, `select piefirme.producto_provisional_completar('${DUP}', null, null, null, null, null, '${DUP}')`);
esperar("un provisional no puede ser duplicado de sí mismo", !r.ok, r.msg);
r = await como(U.admin, `select piefirme.producto_provisional_completar('${DUP}', null, null, null, null, null, '${A}') as x`);
esperar("se marca como duplicado de un producto del catálogo", r.ok && r.rows[0].x === "duplicado", r.msg);
r = await db.query(`select contado from piefirme.conteo_lineas where conteo_id='${CONTEO}' and producto_id='${A}'`);
esperar("lo contado del duplicado pasa al producto correcto (12 + 2 = 14)", Number(r.rows[0]?.contado) === 14, JSON.stringify(r.rows));
r = await db.query(`select estado from piefirme.productos where id='${DUP}'`);
esperar("el duplicado queda pausado", r.rows[0].estado === "pausado");
r = await db.query(`select count(*)::int as n from piefirme.conteo_lineas where conteo_id='${CONTEO}' and producto_id='${DUP}'`);
esperar("y sin línea de conteo propia", r.rows[0].n === 0);

console.log("── corte: sin ventas ni traspasos ──");
r = await como(U.rec, `insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ('${ORG}','${SEDE}','${A}','venta', -1)`);
esperar("durante el corte la sucursal NO registra ventas", !r.ok && /corte/i.test(r.msg ?? ""), r.msg);
r = await como(U.rec, `insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ('${ORG}','${SEDE}','${A}','traspaso_salida', -1)`);
esperar("ni traspasos", !r.ok, r.msg);
r = await como(U.rec, `insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ('${ORG}','${SEDE2}','${A}','venta', -1)`);
esperar("pero la OTRA sucursal sigue vendiendo", r.ok, r.msg);

console.log("── cierre de zonas, resumen y aprobación ──");
r = await como(U.admin, `select piefirme.conteo_inicial_aprobar('${CONTEO}')`);
esperar("no se aprueba con zonas abiertas", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.conteo_zona_cerrar('${Z1}')`);
esperar("caja cierra la zona", r.ok, r.msg);
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${A}', 1)`);
esperar("una zona cerrada ya no recibe capturas", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.conteo_zona_reabrir('${Z1}')`);
esperar("caja NO reabre una zona", !r.ok, r.msg);
r = await como(U.sup, `select piefirme.conteo_zona_reabrir('${Z1}')`);
esperar("la supervisión reabre una zona", r.ok, r.msg);
await como(U.rec, `select piefirme.conteo_zona_cerrar('${Z1}')`);
await como(U.rec, `select piefirme.conteo_zona_cerrar('${Z2}')`);
r = await como(U.sup, `select * from piefirme.prp_conteo_inicial_resumen where conteo_id='${CONTEO}'`);
const R = r.rows?.[0] ?? {};
esperar("el resumen cuenta productos, piezas, provisionales y zonas", r.ok && R.productos_contados === 3 && Number(R.piezas) === 14 + 0 + 6 && R.provisionales === 0 && R.zonas_total === 2 && R.zonas_cerradas === 2 && R.estado === "capturado", JSON.stringify(R) + (r.msg ?? ""));
esperar("el resumen dice cuántos del catálogo no se contaron", R.sin_contar === 2, JSON.stringify(R));
r = await como(U.rec, `select piefirme.conteo_inicial_aprobar('${CONTEO}')`);
esperar("caja NO aprueba", !r.ok, r.msg);
r = await como(U.sup, `select piefirme.conteo_inicial_aprobar('${CONTEO}')`);
esperar("la supervisión NO aprueba (solo Administración)", !r.ok, r.msg);
r = await como(U.admin, `select piefirme.conteo_inicial_aprobar('${CONTEO}') as x`);
esperar("Administración aprueba", r.ok && r.rows[0].x?.puestos_en_cero === 1, JSON.stringify(r.rows?.[0]) + (r.msg ?? ""));
r = await db.query(`select producto_id, existencia from piefirme.inventario_sede where sede_id='${SEDE}'`);
const ex = Object.fromEntries(r.rows.map((x) => [x.producto_id, Number(x.existencia)]));
esperar("la existencia de A es 14 y la de la tobillera 6", ex[A] === 14 && ex[PROV] === 6, JSON.stringify(ex));
esperar("lo que no se contó (C tenía 7) queda en 0", ex[C] === 0, JSON.stringify(ex));
r = await db.query(`select count(*)::int as n from piefirme.movimientos_inventario where referencia_tipo='conteo' and referencia_id='${CONTEO}'`);
esperar("hay movimientos de conteo en el kardex", r.rows[0].n === 3, JSON.stringify(r.rows));
r = await como(U.rec, `select piefirme.conteo_capturar('${CONTEO}','${Z1}','${A}', 1)`);
esperar("un conteo aprobado ya no se edita (captura)", !r.ok, r.msg);
r = await db.query(`select estado, corte_en from piefirme.conteos_fisicos where id='${CONTEO}'`);
esperar("queda autorizado y el corte se levanta", r.rows[0].estado === "autorizado" && r.rows[0].corte_en === null, JSON.stringify(r.rows));
r = await como(U.rec, `insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ('${ORG}','${SEDE}','${A}','venta', -1)`);
esperar("al aprobar, la sucursal vuelve a vender", r.ok, r.msg);
r = await como(U.admin, `select piefirme.conteo_inicial_iniciar('${SEDE}')`);
esperar("no se inicia otro conteo inicial en una sucursal ya aprobada", !r.ok, r.msg);

console.log("── cancelar levanta el corte ──");
r = await como(U.admin, `select piefirme.conteo_inicial_iniciar('${SEDE2}') as id`);
const C2 = r.rows?.[0]?.id;
r = await como(U.rec, `insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ('${ORG}','${SEDE2}','${A}','venta', -1)`);
esperar("la segunda sucursal queda en corte", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.conteo_inicial_cancelar('${C2}')`);
esperar("caja NO cancela el conteo", !r.ok, r.msg);
r = await como(U.admin, `select piefirme.conteo_inicial_cancelar('${C2}')`);
esperar("Administración cancela el conteo", r.ok, r.msg);
r = await como(U.rec, `insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad) values ('${ORG}','${SEDE2}','${A}','venta', -1)`);
esperar("al cancelar, la sucursal vuelve a vender", r.ok, r.msg);

console.log(`\n${ok} correctas, ${mal} fallidas`);
process.exitCode = mal ? 1 : 0;
