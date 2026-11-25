// Prueba de comportamiento de la migración 132 (simulador de jornada) en una BD local desechable (PGlite). No toca Supabase.
//   node scripts/probar-jornada-local.mjs
// Cubre: candados (admin + clínica de prueba), olas en orden, acumulado por sucursal y hora, supervisor solo lectura,
// cierre de cajas, reinicio sin tocar tickets reales.
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
  try { await db.exec(fs.readFileSync(path.join(dir, f), "utf8").replace(/create extension[^;]*;/gi, "")); }
  catch (e) { console.error("✗ migración", f, "→", e.message); process.exit(1); }
}
console.log("migraciones aplicadas:", archivos.length);

const O = "00000000-0000-0000-0000-000000000001", O2 = "00000000-0000-0000-0000-000000000002";
const id = { admin: "00000000-0000-0000-0000-0000000000a1", sup: "00000000-0000-0000-0000-0000000000b1", rec: "00000000-0000-0000-0000-0000000000c1", podo: "00000000-0000-0000-0000-0000000000d1", real: "00000000-0000-0000-0000-0000000000a2" };
const S = { cen: "00000000-0000-0000-0000-0000000000f1", cha: "00000000-0000-0000-0000-0000000000f2", gal: "00000000-0000-0000-0000-0000000000f3" };
await db.exec(`
  insert into auth.users (id, email) values ('${id.admin}','a@t'),('${id.sup}','s@t'),('${id.rec}','r@t'),('${id.podo}','p@t'),('${id.real}','real@t');
  insert into piefirme.organizaciones (id, nombre, estado, parametros) values ('${O}','Clínica de prueba','activa','{"es_prueba": true}'), ('${O2}','Clínica real','activa','{}');
  insert into piefirme.sedes (id, organizacion_id, clave, nombre) values ('${S.cen}','${O}','CEN','Centenario'),('${S.cha}','${O}','CHA','Chalco'),('${S.gal}','${O}','GAL','Galerías');
  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, sedes) values
    ('${id.admin}','${O}','administrador','Dueño','{}'), ('${id.sup}','${O}','supervisor','Supervisora','{${S.cha}}'),
    ('${id.rec}','${O}','recepcion','Caja','{}'), ('${id.podo}','${O}','podologo','Podólogo','{}'),
    ('${id.real}','${O2}','administrador','Dueño real','{}');
  insert into piefirme.servicios (organizacion_id, codigo, nombre, tipo_precio, iva_tipo) values ('${O}','SV-001','Quiropodia','fijo','exento'), ('${O}','SV-002','Onicocriptosis','fijo','exento');
  insert into piefirme.productos (organizacion_id, sku, nombre, tipo, iva_tipo) values ('${O}','PF-AM-001','Crema','venta','16');
  insert into piefirme.pacientes (organizacion_id, sede_registro_id, nombre, alta_rapida, telefono_celular) values ('${O}','${S.cen}','Paciente A', true, '5511111111'), ('${O}','${S.cha}','Paciente B', true, '5522222222');
  alter table piefirme.precios disable trigger user;
  insert into piefirme.precios (organizacion_id, item_tipo, servicio_id, precio, vigente_desde) select organizacion_id, 'servicio', id, 450, date '2025-01-01' from piefirme.servicios;
  insert into piefirme.precios (organizacion_id, item_tipo, producto_id, precio, vigente_desde) select organizacion_id, 'producto', id, 180, date '2025-01-01' from piefirme.productos;
  alter table piefirme.precios enable trigger user;
`);

let ok = 0, mal = 0;
const como = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, msg: e.message }; }
  finally { await db.exec("reset role;"); }
};
const esperar = (nombre, cond, extra = "") => { if (cond) { ok++; console.log("  ✓", nombre); } else { mal++; console.log("  ✗", nombre, extra); } };
const DIA = "2026-11-25";
const tickets = { [S.cen]: 6, [S.cha]: 4, [S.gal]: 2 };

let r = await como(id.rec, `select piefirme.simular_ola('${DIA}', 1, '${JSON.stringify(tickets)}'::jsonb)`);
esperar("recepción NO simula", !r.ok && /administración/.test(r.msg), r.msg);
r = await como(id.sup, `select piefirme.simular_ola('${DIA}', 1, '${JSON.stringify(tickets)}'::jsonb)`);
esperar("supervisor NO simula", !r.ok, r.msg);
r = await como(id.real, `select piefirme.simular_ola('${DIA}', 1, '${JSON.stringify(tickets)}'::jsonb)`);
esperar("una clínica real NO puede simular", !r.ok && /prueba/.test(r.msg), r.msg);
r = await como(id.admin, `select piefirme.simular_ola('${DIA}', 2, '${JSON.stringify(tickets)}'::jsonb)`);
esperar("no se salta la ola 1", !r.ok && /primero/.test(r.msg), r.msg);

// ola 1
r = await como(id.admin, `select piefirme.simular_ola('${DIA}', 1, '${JSON.stringify(tickets)}'::jsonb) as r`);
esperar("ola 1 se inyecta", r.ok && r.rows[0].r.tickets === 12, r.msg ?? JSON.stringify(r.rows?.[0]));
r = await como(id.admin, `select piefirme.simular_ola('${DIA}', 1, '${JSON.stringify(tickets)}'::jsonb)`);
esperar("la misma ola no se inyecta dos veces", !r.ok && /ya se inyect/.test(r.msg), r.msg);

const resumen = async (uid) => (await como(uid, `select sede_clave, sum(tickets)::int t, sum(ventas) v from piefirme.prp_operacion_hora where dia = '${DIA}' group by 1 order by 1`)).rows ?? [];
let rs = await resumen(id.admin);
esperar("dueño ve las 3 sucursales con sus tickets", rs.length === 3 && rs.find((x) => x.sede_clave === "CEN")?.t === 6 && rs.find((x) => x.sede_clave === "GAL")?.t === 2, JSON.stringify(rs));
rs = await resumen(id.sup);
esperar("supervisor ve solo su sucursal (Chalco)", rs.length === 1 && rs[0].sede_clave === "CHA" && rs[0].t === 4, JSON.stringify(rs));
rs = await resumen(id.podo);
esperar("podólogo NO ve el resumen consolidado", rs.length === 0 || rs.every((x) => false), JSON.stringify(rs));

// las horas: la ola 1 cae entre 09:00 y 11:00 (hora local)
r = await como(id.admin, `select min(hora)::int a, max(hora)::int b from piefirme.prp_operacion_hora where dia = '${DIA}'`);
esperar("tickets de la ola 1 fechados entre las 9 y las 11", r.ok && r.rows[0].a >= 9 && r.rows[0].b <= 11, JSON.stringify(r.rows?.[0]));

// olas 2..4 acumulan
for (const k of [2, 3, 4]) { r = await como(id.admin, `select piefirme.simular_ola('${DIA}', ${k}) as r`); esperar(`ola ${k} con el ritmo por omisión`, r.ok && r.rows[0].r.tickets > 0, r.msg); }
r = await como(id.admin, `select sum(tickets)::int t, count(distinct hora)::int h from piefirme.prp_operacion_hora where dia = '${DIA}'`);
esperar("el día acumula tickets en varias horas", r.ok && r.rows[0].t > 12 && r.rows[0].h >= 4, JSON.stringify(r.rows?.[0]));
const totalAntes = r.rows[0].t;

// ticket real que el reinicio NO debe tocar
await db.exec(`
  select set_config('request.jwt.claim.sub','${id.admin}',false);
  insert into piefirme.turnos_caja (organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial) values ('${O}','${S.cha}','Caja 2','Real','${id.rec}', date '${DIA}' - 1 + time '09:00', 0);
`);

// ventas del dueño por vista de siempre (prp_ventas_por_dia) coincide
r = await como(id.admin, `select sum(tickets)::int t from piefirme.prp_ventas_por_dia where dia = '${DIA}'`);
esperar("prp_ventas_por_dia (la vista de siempre) coincide con el resumen de la jornada", r.ok && r.rows[0].t === totalAntes, JSON.stringify(r.rows?.[0]));

// cierre
r = await como(id.admin, `select piefirme.cerrar_jornada('${DIA}') as r`);
esperar("cierre de cajas", r.ok && r.rows[0].r.cajas_cerradas === 3, r.msg ?? JSON.stringify(r.rows?.[0]));
r = await como(id.admin, `select count(*)::int n from piefirme.turnos_caja where estado = 'revisado' and nombre_turno = 'Simulación'`);
esperar("las 3 cajas quedan revisadas", r.ok && r.rows[0].n === 3, JSON.stringify(r.rows?.[0]));
r = await como(id.admin, `select piefirme.cerrar_jornada('${DIA}')`);
esperar("no se cierra dos veces", !r.ok, r.msg);

// reinicio
r = await como(id.admin, `select piefirme.reiniciar_jornada('${DIA}') as r`);
esperar("reinicio borra los tickets simulados", r.ok && r.rows[0].r.tickets_borrados === totalAntes, r.msg ?? JSON.stringify(r.rows?.[0]));
r = await como(id.admin, `select (select count(*) from piefirme.ventas where nota = 'SIM-JORNADA')::int v, (select count(*) from piefirme.pagos)::int p, (select count(*) from piefirme.turnos_caja where nombre_turno = 'Simulación')::int t, (select count(*) from piefirme.simulacion_jornada)::int s, (select count(*) from piefirme.turnos_caja where nombre_turno = 'Real')::int real`);
esperar("no quedan ventas, pagos ni turnos simulados; el turno real sigue", r.ok && r.rows[0].v === 0 && r.rows[0].p === 0 && r.rows[0].t === 0 && r.rows[0].s === 0 && r.rows[0].real === 1, r.msg ?? JSON.stringify(r.rows?.[0]));
r = await como(id.admin, `select piefirme.simular_ola('${DIA}', 1, '${JSON.stringify(tickets)}'::jsonb) as r`);
esperar("tras reiniciar se puede volver a correr el día", r.ok && r.rows[0].r.tickets === 12, r.msg);

console.log(`\n${ok} correctas, ${mal} con falla`);
process.exit(mal ? 1 : 0);
