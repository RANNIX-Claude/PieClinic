// Prueba de comportamiento (PGlite, sin tocar Supabase) de la migración 311: vista prp_rotacion_personal.
//   node scripts/test-rotacion-local.mjs
// Aplica las migraciones ≤170, la 310 y la 311; arma dos sucursales y comprueba la precedencia
// asignación del día > horario semanal > sucursal de contrato > descanso, y el contraste con la checada real.
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { ROOT } from "./lib/env.mjs";

const dir = path.join(ROOT, "migraciones");
const archivos = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort().filter((f) => { const n = parseInt(f, 10); return n <= 170 || n === 310 || n === 311; });
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

const ORG = "11111111-1111-1111-1111-111111111111";
const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b";
const ANA = "eeeeeeee-0000-0000-0000-0000000000a1", LUIS = "eeeeeeee-0000-0000-0000-0000000000b2", SOLA = "eeeeeeee-0000-0000-0000-0000000000c3";
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}', 'a@x');
  insert into piefirme.organizaciones (id, nombre, estado) values ('${ORG}', 'Org', 'activa');
  insert into piefirme.sedes (id, organizacion_id, clave, nombre) values ('${A}', '${ORG}', 'A', 'Sede A'), ('${B}', '${ORG}', 'B', 'Sede B');
  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, sedes) values ('${ADMIN}', '${ORG}', 'administrador', 'Dueño', '{}');
  insert into piefirme.empleados (id, organizacion_id, sede_id, numero_empleado, nombre, puesto, fecha_ingreso) values
    ('${ANA}', '${ORG}', '${A}', 'E1', 'Ana', 'podologo', '2026-11-01'),
    ('${LUIS}', '${ORG}', '${A}', 'E2', 'Luis', 'recepcion', '2026-11-01'),
    ('${SOLA}', '${ORG}', '${B}', 'E3', 'Sola', 'recepcion', '2026-11-01');
  -- Ana rota: martes y jueves en B; lunes, miércoles y viernes en A (sin sábado ni domingo = descanso)
  insert into piefirme.horarios_laborales (organizacion_id, sede_id, empleado_id, dia_semana, entrada, salida, vigente_desde) values
    ${[[1, A], [2, B], [3, A], [4, B], [5, A]].map(([d, s]) => `('${ORG}', '${s}', '${ANA}', ${d}, '09:00', '18:00', '2026-11-01')`).join(",")};
`);
// Luis: cobertura del miércoles 4-nov en B (la sede de contrato es A y no tiene horarios).
// La regla de 310 impide asignar fechas pasadas, así que el trigger se apaga solo para sembrar historia.
await db.exec(`alter table piefirme.empleado_asignaciones disable trigger t_cobertura`);
await db.exec(`insert into piefirme.empleado_asignaciones (organizacion_id, empleado_id, sede_id, fecha, origen, motivo) values ('${ORG}', '${LUIS}', '${B}', '2026-11-04', 'cobertura', 'Ausencia')`);
// Ana firmó el jueves 5-nov en A aunque le tocaba B
await db.exec(`insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, fecha, fecha_hora, operacion) values ('${ORG}', '${A}', '${ANA}', '2026-11-05', '2026-11-05 15:00:00+00', 'entrada')`);

let fallos = 0;
const ok = (c, m) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fallos++; };
const dia = async (emp, f) => (await db.query(`select * from piefirme.prp_rotacion_personal where empleado_id = '${emp}' and fecha = '${f}'`)).rows[0];

console.log("Rotación semanal por horario");
// 2-nov-2026 es lunes
ok((await dia(ANA, "2026-11-02")).sede_id === A && (await dia(ANA, "2026-11-02")).fuente === "horario", "lunes → Sede A (horario)");
ok((await dia(ANA, "2026-11-03")).sede_id === B, "martes → Sede B");
ok((await dia(ANA, "2026-11-04")).sede_id === A, "miércoles → Sede A");
ok((await dia(ANA, "2026-11-05")).sede_id === B, "jueves → Sede B");
const sab = await dia(ANA, "2026-11-07");
ok(sab.sede_id === null && sab.fuente === "descanso", "sábado sin horario → descanso (no cae a la sucursal de contrato)");

console.log("Sin horario: sucursal de contrato");
const l = await dia(LUIS, "2026-11-03");
ok(l.sede_id === A && l.fuente === "base", "Luis sin horario → su sucursal de contrato");

console.log("Asignación del día manda sobre todo");
const c = await dia(LUIS, "2026-11-04");
ok(c.sede_id === B && c.fuente === "cobertura" && c.motivo === "Ausencia", "Luis el 4-nov cubre en B (cobertura)");

console.log("Contraste con la checada real");
const j = await dia(ANA, "2026-11-05");
ok(j.checo_en_otra === true && j.sede_checada_id === A, "Ana firmó en A cuando le tocaba B → marca ⚠");
ok((await dia(ANA, "2026-11-02")).checo_en_otra === false, "sin checada no hay alerta");

console.log("Quiénes estuvieron en una sucursal ese día (una, dos o tres personas)");
const enB = (await db.query(`select empleado_id from piefirme.prp_rotacion_personal where sede_id = '${B}' and fecha = '2026-11-04'`)).rows.map((r) => r.empleado_id).sort();
ok(enB.length === 2 && enB.includes(LUIS) && enB.includes(SOLA), "el 4-nov en B: Luis (cubre) y Sola");
const enB3 = (await db.query(`select count(*)::int n from piefirme.prp_rotacion_personal where sede_id = '${B}' and fecha = '2026-11-03'`)).rows[0].n;
ok(enB3 === 2, "el 3-nov en B: Sola y Ana (martes)");

console.log("Límites de fechas");
ok(!(await dia(ANA, "2026-10-31")), "antes del ingreso no hay registro");
await db.exec(`update piefirme.empleados set fecha_baja = '2026-11-10', estado = 'baja' where id = '${SOLA}'`);
ok(!(await dia(SOLA, "2026-11-11")) && !!(await dia(SOLA, "2026-11-10")), "después de la baja no hay registro; el día de baja sí");

console.log("Seguridad");
ok((await db.query(`select reloptions::text r from pg_class where relname = 'prp_rotacion_personal'`)).rows[0].r.includes("security_invoker=true"), "la vista es security_invoker");

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo en orden");
process.exit(fallos ? 1 : 0);
