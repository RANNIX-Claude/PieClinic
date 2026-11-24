// Prueba de comportamiento de las migraciones 073, 074 y 075 (ola 1a de la implementación Pie Clinic) en una BD local desechable (PGlite).
//   node scripts/probar-ola1a-local.mjs
// Cubre: topes que fijan los dueños, autorización del supervisor, PIN personal con bloqueo, función de caja y liberación por RANNIX.
// No toca Supabase.
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
for (const f of archivos) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, "");
  await db.exec(sql);
}
console.log("migraciones aplicadas:", archivos.length);

const ids = { admin: "00000000-0000-0000-0000-0000000000a1", sup: "00000000-0000-0000-0000-0000000000b1", rec: "00000000-0000-0000-0000-0000000000c1", podo: "00000000-0000-0000-0000-0000000000d1", rannix: "00000000-0000-0000-0000-0000000000e1" };
await db.exec(`
  insert into auth.users (id, email) values ('${ids.admin}','a@t'),('${ids.sup}','s@t'),('${ids.rec}','r@t'),('${ids.podo}','p@t'),('${ids.rannix}','x@t');
  insert into piefirme.organizaciones (id, nombre, estado) values ('00000000-0000-0000-0000-000000000001','Pie Clinic QA','activa');
  insert into piefirme.sedes (id, organizacion_id, clave, nombre) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000001','CEN','Centenario');
  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, sedes) values
    ('${ids.admin}','00000000-0000-0000-0000-000000000001','administrador','Dueño','{}'),
    ('${ids.sup}','00000000-0000-0000-0000-000000000001','supervisor','Supervisora','{}'),
    ('${ids.rec}','00000000-0000-0000-0000-000000000001','recepcion','Caja','{}'),
    ('${ids.podo}','00000000-0000-0000-0000-000000000001','podologo','Podologo','{}');
  insert into piefirme.rannix_staff (user_id, nombre) values ('${ids.rannix}','RANNIX');
`);

let ok = 0, mal = 0;
const como = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, msg: e.message }; }
  finally { await db.exec("reset role;"); }
};
const esperar = (nombre, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", nombre); } else { mal++; console.log("  ✗", nombre, extra); } };

// parámetros
let r = await como(ids.rec, `select piefirme.guardar_parametros_duenos('{"supervisor_descuento_max_pct": 15}'::jsonb)`);
esperar("recepción NO fija parámetros", !r.ok && /dueños/.test(r.msg), r.msg);
r = await como(ids.sup, `select piefirme.guardar_parametros_duenos('{"supervisor_descuento_max_pct": 15}'::jsonb)`);
esperar("supervisor NO fija parámetros", !r.ok, r.msg);
r = await como(ids.admin, `select piefirme.guardar_parametros_duenos('{"supervisor_descuento_max_pct": 15, "supervisor_devolucion_max": 500, "gasto_tope_sin_autorizacion": 300}'::jsonb) as p`);
esperar("dueños fijan los topes", r.ok && Number(r.rows[0].p.supervisor_descuento_max_pct) === 15, r.msg);
r = await como(ids.admin, `select piefirme.guardar_parametros_duenos('{"cualquier_cosa": 1}'::jsonb)`);
esperar("rechaza parámetros no permitidos", !r.ok, r.msg);
r = await como(ids.admin, `select piefirme.guardar_parametros_duenos('{"supervisor_descuento_max_pct": -3}'::jsonb)`);
esperar("rechaza valores negativos", !r.ok, r.msg);

// PIN y autorizaciones del supervisor
await como(ids.sup, `select piefirme.definir_pin_personal('4321')`);
await como(ids.rec, `select piefirme.definir_pin_personal('1111')`);
r = await como(ids.rec, `select piefirme.definir_pin_personal('12')`);
esperar("PIN corto se rechaza", !r.ok, r.msg);
r = await como(ids.rec, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','4321','descuento',12,'cliente frecuente') as id`);
esperar("supervisor autoriza descuento dentro del tope", r.ok && r.rows[0].id, r.msg);
r = await como(ids.rec, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','4321','descuento',20,'cliente frecuente')`);
esperar("descuento arriba del tope exige a los dueños", !r.ok && /tope/.test(r.msg), r.msg);
r = await como(ids.rec, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','4321','devolucion',400,'producto dañado') as id`);
esperar("supervisor autoriza devolución dentro del monto", r.ok, r.msg);
r = await como(ids.rec, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','4321','devolucion',900,'producto dañado')`);
esperar("devolución arriba del monto se rechaza", !r.ok, r.msg);
r = await como(ids.rec, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','4321','ajuste_inventario',10,'x')`);
esperar("supervisor NO autoriza ajustes de inventario", !r.ok, r.msg);
r = await como(ids.rec, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','0000','descuento',5,'x')`);
esperar("PIN incorrecto devuelve nulo y no autoriza", r.ok && r.rows[0].piefirme_autorizar === undefined ? true : (r.ok && Object.values(r.rows[0])[0] === null), r.msg);
r = await como(ids.podo, `select piefirme.autorizar_con_pin_supervisor('${ids.sup}','4321','descuento',5,'x')`);
esperar("podólogo sin función de caja no pide autorización", !r.ok, r.msg);

// función de caja para el podólogo + firma al cobrar
await db.exec(`update piefirme.perfiles set funciones = array['caja'] where id = '${ids.podo}'`);
await como(ids.podo, `select piefirme.definir_pin_personal('2222')`);
r = await como(ids.podo, `select piefirme.firmar_con_pin('2222') as id`);
esperar("podólogo con función de caja se firma con su PIN", r.ok && r.rows[0].id, r.msg);
r = await como(ids.podo, `select piefirme.firmar_con_pin('9999')`);
esperar("firma con PIN incorrecto devuelve nulo", r.ok && Object.values(r.rows[0])[0] === null, r.msg);
r = await como(ids.sup, `select piefirme.firmar_con_pin('4321')`);
esperar("supervisor sin función de caja no firma cobros", !r.ok, r.msg);

// tres fallos bloquean
await como(ids.podo, `select piefirme.firmar_con_pin('0')`);
await como(ids.podo, `select piefirme.firmar_con_pin('0')`);
r = await como(ids.podo, `select piefirme.firmar_con_pin('2222')`);
esperar("tres fallos bloquean 15 minutos", !r.ok && /bloqueado/.test(r.msg), r.msg);

// liberación de funciones
r = await como(ids.admin, `select piefirme.liberar_funciones('00000000-0000-0000-0000-000000000001', array['/caja'], array['recepcion'])`);
esperar("dueños NO liberan funciones (solo RANNIX)", !r.ok && /RANNIX/.test(r.msg), r.msg);
r = await como(ids.rec, `select piefirme.funciones_habilitadas() as f`);
esperar("sin liberación estricta todo sigue habilitado", r.ok && r.rows[0].f.estricta === false, r.msg);
r = await como(ids.rannix, `select piefirme.liberar_funciones('00000000-0000-0000-0000-000000000001', array['/caja','/pacientes'], array['recepcion']) as n`);
esperar("RANNIX libera funciones por rol", r.ok && Number(r.rows[0].n) === 2, r.msg);
r = await como(ids.rannix, `select piefirme.liberar_funciones('00000000-0000-0000-0000-000000000001', array['/no-existe'], array['recepcion'])`);
esperar("función desconocida se rechaza", !r.ok, r.msg);
r = await como(ids.rannix, `select piefirme.activar_liberacion_estricta('00000000-0000-0000-0000-000000000001', true)`);
esperar("RANNIX activa la liberación estricta", r.ok, r.msg);
r = await como(ids.rec, `select piefirme.funciones_habilitadas() as f`);
esperar("caja solo ve lo liberado", r.ok && r.rows[0].f.estricta === true && r.rows[0].f.claves.length === 2, JSON.stringify(r.rows?.[0]));
r = await como(ids.podo, `select piefirme.funciones_habilitadas() as f`);
esperar("el podólogo no tiene nada liberado todavía", r.ok && r.rows[0].f.claves.length === 0, JSON.stringify(r.rows?.[0]));
r = await como(ids.rec, `select count(*)::int as n from piefirme.funciones_liberadas`);
esperar("caja lee solo las liberaciones de su clínica", r.ok && r.rows[0].n === 2, JSON.stringify(r.rows?.[0]));
r = await como(ids.rec, `insert into piefirme.funciones_liberadas (organizacion_id, clave, rol) values ('00000000-0000-0000-0000-000000000001','/rh','recepcion')`);
esperar("nadie escribe liberaciones directo en la tabla", !r.ok, r.msg);

// políticas del supervisor
r = await db.query(`select count(*)::int as n from pg_policies where schemaname='piefirme' and policyname like '%_sel_supervisor'`);
esperar("políticas de lectura del supervisor creadas (" + r.rows[0].n + ")", r.rows[0].n >= 10);
r = await como(ids.sup, `select count(*)::int as n from piefirme.pacientes`);
esperar("supervisor NO lee pacientes (clínico)", r.ok && r.rows[0].n === 0, r.msg);

// documentación (075) y estado de la liberación
const ORG = "00000000-0000-0000-0000-000000000001";
r = await como(ids.admin, `select piefirme.documentacion_guardar('${ORG}','plan_prueba','Plan de prueba','# Plan texto', 10)`);
esperar("el administrador NO carga documentación (solo RANNIX)", !r.ok && /RANNIX/.test(r.msg), r.msg);
r = await como(ids.rannix, `select piefirme.documentacion_guardar('${ORG}','plan_prueba','Plan de prueba','# Plan texto', 10) as id`);
esperar("RANNIX carga documentación", r.ok && r.rows[0].id, r.msg);
r = await como(ids.rannix, `select piefirme.documentacion_guardar('${ORG}','Mal Nombre','x','y')`);
esperar("clave inválida se rechaza", !r.ok, r.msg);
r = await como(ids.admin, `select count(*)::int as n from piefirme.prp_documentacion`);
esperar("el administrador lee la documentación de su clínica", r.ok && r.rows[0].n === 1, r.msg);
for (const [nombre, uid] of [["caja", ids.rec], ["podólogo", ids.podo], ["supervisor", ids.sup]]) {
  r = await como(uid, `select count(*)::int as n from piefirme.prp_documentacion`);
  esperar(`${nombre} NO ve la documentación`, r.ok && r.rows[0].n === 0, r.msg);
}
r = await como(ids.admin, `insert into piefirme.documentacion (organizacion_id, clave, titulo, contenido) values ('${ORG}','otra','t','c')`);
esperar("nadie escribe documentación directo en la tabla", !r.ok, r.msg);
r = await como(ids.admin, `select piefirme.estado_liberacion('${ORG}')`);
esperar("el administrador NO consulta el estado de la liberación", !r.ok, r.msg);
r = await como(ids.rannix, `select piefirme.estado_liberacion('${ORG}') as e`);
esperar("RANNIX consulta el estado de la liberación", r.ok && r.rows[0].e.estricta === true && Number(r.rows[0].e.liberadas) === 2, JSON.stringify(r.rows?.[0]));
r = await como(ids.rec, `select count(*)::int as n from piefirme.prp_catalogo_funciones`);
esperar("el catálogo de funciones es legible con sesión (" + (r.rows?.[0]?.n ?? 0) + ")", r.ok && r.rows[0].n >= 50, r.msg);

console.log(`\n${ok} correctas, ${mal} fallidas`);
process.exitCode = mal ? 1 : 0;
