// Prueba de comportamiento de la migración 076 (etapa 1: catálogo completo) en una BD local desechable (PGlite).
//   node scripts/probar-etapa1-local.mjs
// Cubre: folio automático y relleno de lo existente, factor de unidades, listas de precio con caída a la lista 1, mínimo de SICAR que se
// activa con la primera entrada, inventario inicial como conteo, e inicialización del catálogo. No toca Supabase.
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
const archivos = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
// Hasta la 075 y, ANTES de la 076, un servicio y un producto «ya existentes» para probar el relleno de folios.
for (const f of archivos.filter((x) => x < "076")) await db.exec(fs.readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, ""));

const ORG = "00000000-0000-0000-0000-000000000001", SEDE = "00000000-0000-0000-0000-0000000000f1";
const U = { admin: "00000000-0000-0000-0000-0000000000a1", rec: "00000000-0000-0000-0000-0000000000c1", sup: "00000000-0000-0000-0000-0000000000b1" };
await db.exec(`
  insert into auth.users (id, email) values ('${U.admin}','a@t'),('${U.rec}','r@t'),('${U.sup}','s@t');
  insert into piefirme.organizaciones (id, nombre, estado) values ('${ORG}','Pie Clinic QA','activa');
  insert into piefirme.sedes (id, organizacion_id, clave, nombre) values ('${SEDE}','${ORG}','CEN','Centenario');
  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, sedes) values
    ('${U.admin}','${ORG}','administrador','Dueño','{}'),('${U.rec}','${ORG}','recepcion','Caja','{}'),('${U.sup}','${ORG}','supervisor','Supervisora','{}');
  insert into piefirme.servicios (organizacion_id, codigo, nombre, categoria) values ('${ORG}','VIEJO-1','Servicio anterior','General');
  insert into piefirme.productos (organizacion_id, sku, nombre, categoria) values ('${ORG}','SKU-VIEJO','Producto anterior','General');
`);
await db.exec(fs.readFileSync(path.join(dir, archivos.find((x) => x.startsWith("076_"))), "utf8"));

let ok = 0, mal = 0;
const como = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, msg: e.message }; }
  finally { await db.exec("reset role;"); }
};
const esperar = (n, c, extra = "") => { if (c) { ok++; console.log("  ✓", n); } else { mal++; console.log("  ✗", n, extra); } };

// folios
let r = await db.query(`select (select folio from piefirme.servicios where codigo='VIEJO-1') as s, (select folio from piefirme.productos where sku='SKU-VIEJO') as p`);
esperar("lo que ya existía recibe folio (SRV-000001 y PRD-000001)", r.rows[0].s === "SRV-000001" && r.rows[0].p === "PRD-000001", JSON.stringify(r.rows[0]));
r = await como(U.admin, `insert into piefirme.servicios (organizacion_id, codigo, nombre, categoria) values ('${ORG}','NUEVO-1','Servicio nuevo','General') returning folio`);
esperar("un servicio nuevo recibe el folio siguiente", r.ok && r.rows[0].folio === "SRV-000002", r.msg ?? JSON.stringify(r.rows));
r = await como(U.admin, `insert into piefirme.productos (organizacion_id, sku, nombre, categoria) values ('${ORG}','SKU-2','Producto 2','General') returning folio`);
esperar("un producto nuevo recibe el folio siguiente", r.ok && r.rows[0].folio === "PRD-000002", r.msg ?? JSON.stringify(r.rows));
r = await como(U.admin, `insert into piefirme.servicios (organizacion_id, codigo, nombre, categoria, folio) values ('${ORG}','NUEVO-2','Con folio propio','General','SRV-000002')`);
esperar("el folio no se repite", !r.ok, r.msg);

// campos nuevos
r = await como(U.admin, `update piefirme.productos set factor = 0 where sku='SKU-2'`);
esperar("el factor debe ser mayor que cero", !r.ok, r.msg);
r = await como(U.admin, `update piefirme.productos set unidad_compra='caja', unidad_venta='pieza', factor=10, clave_alterna='ALT-2', margen_objetivo_pct=40, regla_precio_compra='mantener_precio' where sku='SKU-2' returning factor`);
esperar("el producto guarda unidades con factor, clave alterna y margen", r.ok && Number(r.rows[0].factor) === 10, r.msg);
r = await como(U.admin, `update piefirme.productos set regla_precio_compra='otra' where sku='SKU-2'`);
esperar("la regla de precio de compra solo admite valores válidos", !r.ok, r.msg);

// catálogo inicial
r = await como(U.rec, `select piefirme.catalogo_inicializar()`);
esperar("caja NO inicializa el catálogo", !r.ok, r.msg);
r = await como(U.admin, `select piefirme.catalogo_inicializar() as c`);
esperar("los dueños inicializan 3 departamentos y 4 listas", r.ok && r.rows[0].c.departamentos_nuevos === 3 && r.rows[0].c.listas_nuevas === 4, JSON.stringify(r.rows?.[0]) + (r.msg ?? ""));
r = await como(U.admin, `select piefirme.catalogo_inicializar() as c`);
esperar("inicializar de nuevo no duplica", r.ok && r.rows[0].c.departamentos_nuevos === 0 && r.rows[0].c.listas_nuevas === 0, JSON.stringify(r.rows?.[0]));
r = await como(U.sup, `select count(*)::int as n from piefirme.departamentos`);
esperar("el supervisor lee los departamentos", r.ok && r.rows[0].n === 3, r.msg);
r = await como(U.rec, `insert into piefirme.departamentos (organizacion_id, clave, nombre) values ('${ORG}','otro','Otro')`);
esperar("caja NO crea departamentos", !r.ok, r.msg);

// listas de precio
const prod = (await db.query(`select id from piefirme.productos where sku='SKU-2'`)).rows[0].id;
await db.exec(`insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio, motivo) values ('${ORG}','producto','${prod}', current_date - 10, 500, 'fijo', 'Alta inicial')`);
r = await como(U.admin, `insert into piefirme.precios_lista (organizacion_id, item_tipo, producto_id, lista_numero, precio, motivo) values ('${ORG}','producto','${prod}', 3, 420, 'Convenio') returning id`);
esperar("los dueños fijan el precio de la lista 3", r.ok, r.msg);
r = await como(U.rec, `insert into piefirme.precios_lista (organizacion_id, item_tipo, producto_id, lista_numero, precio) values ('${ORG}','producto','${prod}', 2, 450)`);
esperar("caja NO fija precios de lista", !r.ok, r.msg);
r = await como(U.admin, `insert into piefirme.precios_lista (organizacion_id, item_tipo, producto_id, lista_numero, precio) values ('${ORG}','producto','${prod}', 1, 450)`);
esperar("las listas propias son de la 2 a la 4", !r.ok, r.msg);
r = await como(U.rec, `select piefirme.precio_de_lista('producto', '${prod}', 3::smallint) as p3, piefirme.precio_de_lista('producto', '${prod}', 2::smallint) as p2, piefirme.precio_de_lista('producto', '${prod}', 1::smallint) as p1`);
esperar("lista 3 usa su precio; lista 2 sin precio cae a la lista 1", r.ok && Number(r.rows[0].p3) === 420 && Number(r.rows[0].p2) === 500 && Number(r.rows[0].p1) === 500, JSON.stringify(r.rows?.[0]) + (r.msg ?? ""));
r = await db.query(`select count(*)::int as n from pg_constraint where conname = 'pacientes_lista_precio_chk'`);
esperar("el número de lista del paciente va de 1 a 4 (restricción creada)", r.rows[0].n === 1);
r = await db.query(`select column_default from information_schema.columns where table_schema='piefirme' and table_name='pacientes' and column_name='lista_precio'`);
esperar("el paciente nuevo entra en la lista 1", String(r.rows[0]?.column_default) === "1", JSON.stringify(r.rows[0]));

// mínimo de SICAR + inventario inicial
await db.exec(`update piefirme.productos set minimo_sicar = 5, maximo_sicar = 8 where sku='SKU-2'`);
await db.exec(`insert into piefirme.inventario_sede (organizacion_id, sede_id, producto_id) values ('${ORG}','${SEDE}','${prod}')`);
let m = (await db.query(`select minimo from piefirme.inventario_sede where producto_id='${prod}'`)).rows[0];
esperar("sin entradas, el mínimo de SICAR sigue guardado aparte (0 activo)", Number(m.minimo) === 0, JSON.stringify(m));
const cid = (await db.query(`insert into piefirme.conteos_fisicos (organizacion_id, sede_id, folio, responsable_id, estado, tipo) values ('${ORG}','${SEDE}','INI-0001','${U.admin}','borrador','inicial') returning id`)).rows[0].id;
await db.exec(`insert into piefirme.conteo_lineas (organizacion_id, sede_id, conteo_id, producto_id, esperado, contado) values ('${ORG}','${SEDE}','${cid}','${prod}', 0, 12)`);
r = await como(U.admin, `select piefirme.conteo_autorizar('${cid}') as n`);
esperar("el inventario inicial se autoriza como conteo", r.ok && Number(r.rows[0].n) === 1, r.msg);
m = (await db.query(`select existencia, minimo, maximo from piefirme.inventario_sede where producto_id='${prod}'`)).rows[0];
esperar("la primera entrada deja existencia 12", Number(m.existencia) === 12, JSON.stringify(m));
esperar("y activa el mínimo (5) y el máximo (8) de SICAR", Number(m.minimo) === 5 && Number(m.maximo) === 8, JSON.stringify(m));
r = await db.query(`select tipo from piefirme.conteos_fisicos where id='${cid}'`);
esperar("el conteo quedó como tipo «inicial»", r.rows[0].tipo === "inicial");

console.log(`\n${ok} correctas, ${mal} fallidas`);
process.exitCode = mal ? 1 : 0;
