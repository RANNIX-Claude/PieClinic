// Prueba de comportamiento (PGlite, sin tocar Supabase) de la migración 310: responsable de sucursal y cobertura de personal.
//   node scripts/test-cobertura-local.mjs
// Aplica las migraciones ≤170 y la 310, arma una clínica con dos sucursales y recorre las reglas del dueño.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ROOT } from "./lib/env.mjs";

const dir = path.join(ROOT, "migraciones");
const archivos = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort().filter((f) => { const n = parseInt(f, 10); return n <= 170 || n === 310; });
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
`);
for (const f of archivos) await db.exec(fs.readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, ""));

const U = { admin: "00000000-0000-0000-0000-0000000000a1", juan: "00000000-0000-0000-0000-0000000000b1", resp: "00000000-0000-0000-0000-0000000000c1", otro: "00000000-0000-0000-0000-0000000000d1" };
await db.exec(`
  insert into auth.users (id, email) values ('${U.admin}', 'a@x'), ('${U.juan}', 'j@x'), ('${U.resp}', 'r@x'), ('${U.otro}', 'o@x');
  insert into piefirme.organizaciones (id, nombre, estado) values ('11111111-1111-1111-1111-111111111111', 'Org', 'activa');
  insert into piefirme.sedes (id, organizacion_id, clave, nombre) values
    ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'A', 'Sede A'),
    ('bbbbbbbb-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'B', 'Sede B');
  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, sedes) values
    ('${U.admin}', '11111111-1111-1111-1111-111111111111', 'administrador', 'Dueño', '{}'),
    ('${U.juan}', '11111111-1111-1111-1111-111111111111', 'podologo', 'Juan', '{aaaaaaaa-0000-0000-0000-00000000000a}'),
    ('${U.resp}', '11111111-1111-1111-1111-111111111111', 'podologo', 'Rosa', '{}'),
    ('${U.otro}', '11111111-1111-1111-1111-111111111111', 'recepcion', 'Ana', '{aaaaaaaa-0000-0000-0000-00000000000a}');
  insert into piefirme.empleados (id, organizacion_id, sede_id, perfil_id, numero_empleado, nombre, puesto) values
    ('eeeeeeee-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', '${U.juan}', 'E001', 'Juan', 'podologo'),
    ('eeeeeeee-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', '${U.otro}', 'E002', 'Ana', 'recepcion');
`);

let fallos = 0;
const como = async (uid, sql) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); ${uid ? "set role authenticated;" : ""}`); return db.query(sql); };
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };
const falla = async (uid, sql, fragmento, m) => { try { await como(uid, sql); ok(false, `${m} (no falló)`); } catch (e) { ok(!fragmento || e.message.includes(fragmento), `${m} → ${e.message.slice(0, 90)}`); } };
const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b", JUAN = "eeeeeeee-0000-0000-0000-0000000000b1";
const venta = (sede) => `insert into piefirme.ventas (organizacion_id, sede_id, origen, estado) values ('11111111-1111-1111-1111-111111111111', '${sede}', 'mostrador', 'por_cobrar')`;

console.log("Responsable de sucursal");
await falla(U.admin, `select piefirme.asignar_responsable_sucursal('${A}', '${U.otro}')`, "podólogo", "recepción no puede ser responsable");
await como(U.admin, `select piefirme.asignar_responsable_sucursal('${A}', '${U.resp}')`);
ok((await como(U.resp, `select piefirme_app.es_responsable('${A}') as r`)).rows[0].r === true, "Rosa es responsable de A");
ok((await como(U.resp, `select piefirme_app.es_responsable('${B}') as r`)).rows[0].r === false, "Rosa no es responsable de B");
await falla(U.juan, `select piefirme.asignar_responsable_sucursal('${A}', '${U.juan}')`, "propietarios", "un podólogo no asigna responsables");
await como(U.admin, `select piefirme.asignar_responsable_sucursal('${B}', '${U.resp}')`);
ok((await como(U.admin, `select responsable_id from piefirme.sedes where id = '${A}'`)).rows[0].responsable_id === null, "al pasar a B deja de serlo de A (una sola sucursal)");
await como(U.admin, `select piefirme.asignar_responsable_sucursal('${A}', '${U.resp}')`);

console.log("Cobertura por día");
ok((await como(U.juan, `select piefirme_app.puede_sede('${A}') as a, piefirme_app.puede_sede('${B}') as b`)).rows[0].a === true, "sin cobertura Juan opera en A");
await falla(U.juan, `select piefirme.asignar_personal_dia('${JUAN}', '${B}', current_date)`, "propietarios", "Juan no se asigna solo");
await falla(U.admin, `select piefirme.asignar_personal_dia('${JUAN}', '${B}', current_date - 1)`, "fecha pasada", "no se asigna a una fecha pasada");
await como(U.admin, `select piefirme.asignar_personal_dia('${JUAN}', '${B}', (now() at time zone 'America/Mexico_City')::date, 'Cubre ausencia de Luis')`);
const p = (await como(U.juan, `select piefirme_app.puede_sede('${A}') as a, piefirme_app.puede_sede('${B}') as b`)).rows[0];
ok(p.a === false && p.b === true, "con cobertura hoy Juan solo opera en B");
const ctx = (await como(U.juan, `select piefirme.mi_contexto_sucursal() as c`)).rows[0].c;
ok(ctx.cobertura_sede === B, "su contexto avisa la sucursal de hoy");
await falla(U.juan, venta(A), null, "no genera ticket en A (su sucursal habitual)");
await falla(U.juan, venta(B), "firma tu entrada", "en B no genera ticket sin firmar entrada");
await falla(U.juan, `update piefirme.empleado_asignaciones set sede_id = '${A}', origen = 'autoelegida' where empleado_id = '${JUAN}'`, null, "no puede quitarse la cobertura por su cuenta");
await falla(U.juan, `insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, operacion, fecha_hora, origen) values ('11111111-1111-1111-1111-111111111111', '${A}', '${JUAN}', 'entrada', now(), 'app')`, null, "no puede firmar en A hoy");
await como(U.juan, `insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, operacion, fecha_hora, origen, registrado_por) values ('11111111-1111-1111-1111-111111111111', '${B}', '${JUAN}', 'entrada', now(), 'app', '${U.juan}')`);
await como(U.juan, venta(B)); ok(true, "firmada la entrada en B, genera ticket en B");
await falla(U.admin, `insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, operacion, fecha_hora, origen) values ('11111111-1111-1111-1111-111111111111', '${A}', '${JUAN}', 'salida', now(), 'manual')`, "dos sucursales", "ni siquiera el dueño registra una checada en otra sede el mismo día");
await falla(U.admin, `delete from piefirme.empleado_asignaciones where empleado_id = '${JUAN}'`, "checadas", "con checadas ese día la cobertura ya no se quita");
ok((await como(U.admin, `select piefirme_app.puede_sede('${A}') as a, piefirme_app.puede_sede('${B}') as b`)).rows[0].a === true, "el propietario nunca queda restringido");
ok((await como(U.otro, `select piefirme_app.puede_sede('${A}') as a`)).rows[0].a === true, "quien no tiene cobertura no cambia");

console.log("Lo que ve el responsable (Rosa, responsable de A)");
const pers = (await como(U.resp, `select nombre_completo, sentido from piefirme.personal_de_mi_sucursal() order by 1`)).rows;
ok(pers.some((r) => r.nombre_completo === "Juan" && r.sentido === "sale"), "ve que Juan sale a cubrir a otra sucursal");
ok(pers.some((r) => r.nombre_completo === "Ana" && r.sentido === "base"), "ve a Ana en su sucursal");
ok(!Object.keys(pers[0]).some((k) => /salario|clabe|rfc|curp|nss/.test(k)), "no recibe sueldos ni datos fiscales");
ok((await como(U.resp, `select count(*)::int n from piefirme.empleados`)).rows[0].n === 0, "la tabla de empleados (con sueldos) sigue cerrada para ella");
await falla(U.resp, `insert into piefirme.empleado_asignaciones (organizacion_id, empleado_id, sede_id, fecha, origen) values ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-0000000000d1', '${A}', current_date + 1, 'cobertura')`, null, "el responsable no asigna cobertura (es de los propietarios)");

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : "\nTodo bien");
process.exitCode = fallos ? 1 : 0;
