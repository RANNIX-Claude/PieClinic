// Siembra los datos de la DEMO en QA (nunca producción): 4 podólogos, 1 recepcionista, 1 dueño, 10 pacientes con nombres mexicanos,
// horarios de atención, la semana pasada ya atendida y cobrada, y la semana de la demo con citas confirmadas.
//   node demo/sembrar-demo.mjs            (idempotente)
// Escribe demo/estado.json con el día de la demo y las cuentas. Usa la service_role del servidor (jamás se imprime).
import fs from "fs";
import path from "path";
import { ambiente, conectar, ROOT } from "../scripts/lib/env.mjs";

const cfg = ambiente("qa", { exigirBD: false });
if (!cfg.url || !cfg.service ) { console.error("Faltan llaves de QA en .env.local"); process.exit(2); }

const ORG = "00000000-0000-0000-0000-00000000c0de";
const SEDES = { chalco: "5e000000-0000-0000-0000-000000000001", centenario: "5e000000-0000-0000-0000-000000000002", galerias: "5e000000-0000-0000-0000-000000000003" };
const CLAVE = "Demo2026!";
const DOM = "piefirme-demo.mx";

const USUARIOS = [
  { clave: "dueno", email: `ricardo.villarreal@${DOM}`, nombre: "Ricardo", apellidos: "Villarreal Garza", rol: "administrador", sedes: [] },
  { clave: "recepcion", email: `ana.torres@${DOM}`, nombre: "Ana Karen", apellidos: "Torres Beltrán", rol: "recepcion", sedes: [SEDES.chalco] },
  { clave: "pod1", email: `mariana.ortega@${DOM}`, nombre: "Mariana", apellidos: "Ortega Villaseñor", rol: "podologo", cedula: "10482316", sedes: [SEDES.chalco] },
  { clave: "pod2", email: `alejandro.ramirez@${DOM}`, nombre: "Alejandro", apellidos: "Ramírez Cuevas", rol: "podologo", cedula: "09875541", sedes: [SEDES.chalco] },
  { clave: "pod3", email: `paulina.soto@${DOM}`, nombre: "Paulina", apellidos: "Soto Escamilla", rol: "podologo", cedula: "11230784", sedes: [SEDES.centenario] },
  { clave: "pod4", email: `luis.mendoza@${DOM}`, nombre: "Luis Fernando", apellidos: "Mendoza Rojas", rol: "podologo", cedula: "10967420", sedes: [SEDES.galerias] },
];

const h = { apikey: cfg.service, Authorization: `Bearer ${cfg.service}`, "Content-Type": "application/json" };
async function http(m, ruta, cuerpo) {
  const r = await fetch(cfg.url + ruta, { method: m, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { ok: r.ok, status: r.status, data: j };
}
async function buscar(email) {
  for (let p = 1; p <= 20; p++) {
    const r = await http("GET", `/auth/v1/admin/users?page=${p}&per_page=200`);
    const l = r.data?.users ?? [];
    const u = l.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (l.length < 200) return null;
  }
  return null;
}
for (const u of USUARIOS) {
  const cuerpo = { email: u.email, password: CLAVE, email_confirm: true, user_metadata: { demo: true } };
  const r = await http("POST", "/auth/v1/admin/users", cuerpo);
  if (r.ok) u.id = r.data.id;
  else {
    const x = await buscar(u.email);
    if (!x) throw new Error(`No se pudo crear ${u.email}: ${r.status}`);
    await http("PUT", `/auth/v1/admin/users/${x.id}`, { password: CLAVE, email_confirm: true, ban_duration: "none" });
    u.id = x.id;
  }
  console.log(`✓ ${u.rol.padEnd(13)} ${u.nombre} ${u.apellidos}`);
}

// Día de la demo = próximo día hábil (L-V) después de hoy; semana pasada = la semana que ya transcurrió.
const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
const dia = new Date(hoy); do { dia.setDate(dia.getDate() + 1); } while ([0, 6].includes(dia.getDay()));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lunes = new Date(dia); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
const lunesAnt = new Date(lunes); lunesAnt.setDate(lunesAnt.getDate() - 7);

const usuariosJson = JSON.stringify(USUARIOS.map(({ id, email, nombre, apellidos, rol, cedula, sedes }) => ({ id, email, nombre, apellidos, rol, cedula: cedula ?? null, sedes })));
const sqlSemilla = `
do $$
declare
  o constant uuid := '${ORG}'; tz constant text := 'America/Mexico_City';
  v_lun_ant date := date '${iso(lunesAnt)}'; v_lun date := date '${iso(lunes)}'; v_demo date := date '${iso(dia)}';
  us jsonb := '${usuariosJson.replace(/'/g, "''")}'::jsonb;
  u jsonb; v_pods uuid[]; v_pac uuid[]; v_n int;
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  for u in select * from jsonb_array_elements(us) loop
    insert into piefirme.perfiles (id, organizacion_id, rol, nombre, apellidos, email, cedula, sedes, activo)
    values ((u->>'id')::uuid, o, (u->>'rol')::piefirme.rol_usuario, u->>'nombre', u->>'apellidos', u->>'email', u->>'cedula',
            coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(u->'sedes') x), '{}'::uuid[]), true)
    on conflict (id) do update set rol = excluded.rol, nombre = excluded.nombre, apellidos = excluded.apellidos, email = excluded.email,
      cedula = excluded.cedula, sedes = excluded.sedes, activo = true;
  end loop;
  select array_agg((x->>'id')::uuid order by x->>'email') into v_pods from jsonb_array_elements(us) x where x->>'rol' = 'podologo';

  delete from piefirme.horarios_atencion where podologo_id = any (v_pods);
  insert into piefirme.horarios_atencion (organizacion_id, sede_id, podologo_id, dia_semana, hora_inicio, hora_fin, vigente_desde, activo)
  select o, (select sedes[1] from piefirme.perfiles where id = p), p, d, time '09:00', case when d = 6 then time '14:00' else time '19:00' end, date '2026-01-01', true
    from unnest(v_pods) p cross join generate_series(1, 6) d;

  insert into piefirme.pacientes (organizacion_id, sede_registro_id, nombre, apellido_paterno, apellido_materno, sexo, fecha_nacimiento, telefono_celular, email, colonia, municipio, estado_domicilio, ocupacion, origen_registro)
  select o, s, n, ap, am, sx, fn::date, tel, em, col, mun, est, ocu, 'recepcion' from (values
    ('${SEDES.chalco}'::uuid,'Sofía','Hernández','Bautista','mujer','1985-03-14','5523148801','sofia.hernandez@correo-demo.mx','Santa Martha','Chalco','Estado de México','Contadora'),
    ('${SEDES.chalco}','José Luis','Ramírez','Cervantes','hombre','1958-07-02','5523148802','joseluis.ramirez@correo-demo.mx','San Gregorio Cuautzingo','Chalco','Estado de México','Jubilado'),
    ('${SEDES.chalco}','María Guadalupe','Martínez','Olvera','mujer','1962-12-09','5523148803','lupita.martinez@correo-demo.mx','Culturas de México','Chalco','Estado de México','Comerciante'),
    ('${SEDES.chalco}','Carlos Alberto','Mendoza','Rangel','hombre','1975-05-21','5523148804','carlos.mendoza@correo-demo.mx','Providencia','Chalco','Estado de México','Chofer'),
    ('${SEDES.centenario}','Laura Patricia','Jiménez','Salgado','mujer','1990-09-30','5523148805','laura.jimenez@correo-demo.mx','Del Valle Centro','Benito Juárez','Ciudad de México','Enfermera'),
    ('${SEDES.centenario}','Miguel Ángel','Torres','Zamora','hombre','1949-01-17','5523148806','miguel.torres@correo-demo.mx','Narvarte Poniente','Benito Juárez','Ciudad de México','Jubilado'),
    ('${SEDES.centenario}','Daniela Fernanda','Ortiz','Lozano','mujer','2001-11-05','5523148807','daniela.ortiz@correo-demo.mx','Portales Sur','Benito Juárez','Ciudad de México','Estudiante'),
    ('${SEDES.galerias}','Roberto Carlos','Domínguez','Aguirre','hombre','1968-04-26','5523148808','roberto.dominguez@correo-demo.mx','Lindavista','Gustavo A. Madero','Ciudad de México','Ingeniero'),
    ('${SEDES.galerias}','Ana Cristina','Vargas','Montes','mujer','1979-08-12','5523148809','ana.vargas@correo-demo.mx','Vallejo','Azcapotzalco','Ciudad de México','Maestra'),
    ('${SEDES.galerias}','Francisco Javier','Castillo','Ibarra','hombre','1955-02-28','5523148810','francisco.castillo@correo-demo.mx','Industrial','Gustavo A. Madero','Ciudad de México','Comerciante')
  ) t(s, n, ap, am, sx, fn, tel, em, col, mun, est, ocu)
  where not exists (select 1 from piefirme.pacientes p where p.organizacion_id = o and p.email = t.em);
  select array_agg(id order by email) into v_pac from piefirme.pacientes where organizacion_id = o and email like '%@correo-demo.mx';

  if not exists (select 1 from piefirme.citas where podologo_id = any (v_pods)) then
    insert into piefirme.citas (organizacion_id, sede_id, paciente_id, servicio_id, podologo_id, atendio_id, cabina_id, inicio, fin, duracion_min, estado, origen, primera_vez,
                              precio_servicio, motivo_cancelacion, cancelada_en, fin_atencion_en, llegada_en)
    select o, s.sede, s.pac, sv.id, s.pod, case when s.est = 'atendida' then s.pod end, null::uuid, s.ini, s.ini + make_interval(mins => sv.duracion_min), sv.duracion_min, s.est,
           (array['llamada','presencial','whatsapp','presencial'])[1 + s.k % 4], (s.k % 7 = 0),
           coalesce(piefirme_app.precio_servicio(o, sv.id, s.sede, s.dia), 0),
           case when s.est = 'cancelada' then 'El paciente avisó que no podrá asistir' end, case when s.est = 'cancelada' then s.ini - interval '1 day' end,
           case when s.est = 'atendida' then s.ini + make_interval(mins => sv.duracion_min) end, case when s.est = 'atendida' then s.ini - interval '6 minutes' end
      from (
        select g.dia, p.pod, p.sede, p.nro_cab, ((g.dia + sl.t) at time zone tz) as ini, sl.n, (g.dia - v_lun_ant) * 7 + p.ord * 3 + sl.n as k,
               v_pac[1 + ((g.dia - v_lun_ant) * 7 + p.ord * 3 + sl.n) % 10] as pac,
               (array['SV-001','SV-002','SV-005','SV-006','SV-008','SV-009','SV-001','SV-011'])[1 + ((g.dia - v_lun_ant) * 3 + p.ord + sl.n) % 8] as cod,
               case when g.dia < v_lun then (case when (g.dia - v_lun_ant + sl.n + p.ord) % 11 = 0 then 'no_asistio' when (g.dia - v_lun_ant + sl.n + p.ord) % 13 = 0 then 'cancelada' else 'atendida' end)
                    else (case when (g.dia - v_lun + sl.n + p.ord) % 4 = 0 then 'por_confirmar' else 'confirmada' end) end as est
          from (select d::date as dia from generate_series(v_lun_ant, v_lun + 5, interval '1 day') d) g
          cross join lateral (select x.id as pod, x.sedes[1] as sede, row_number() over (partition by x.sedes[1] order by x.email) as nro_cab, (row_number() over (order by x.email) - 1)::int as ord
                                from piefirme.perfiles x where x.id = any (v_pods)) p
          cross join (values (time '09:00', 0), (time '10:15', 1), (time '11:30', 2), (time '12:45', 3), (time '16:00', 4), (time '17:15', 5)) sl(t, n)
         where extract(isodow from g.dia) <= 6
           and not exists (select 1 from piefirme.festivos f where f.organizacion_id = o and f.fecha = g.dia)
           and (sl.n % 3 <> 1 or (g.dia - v_lun_ant + p.ord) % 2 = 0)
           and not (g.dia = v_demo and p.ord = 0 and sl.n in (1, 2, 3))
           and not (extract(isodow from g.dia) = 6 and sl.t > time '13:00')
      ) s
      join piefirme.servicios sv on sv.organizacion_id = o and sv.codigo = s.cod
      left join piefirme.cabinas cb on cb.sede_id = s.sede and cb.nombre = 'Cabina ' || s.nro_cab
     order by s.ini;
    get diagnostics v_n = row_count;
    raise notice 'demo: % citas', v_n;
  end if;
end $$;
`;

const bd = await conectar(ambiente("qa"));
async function sql(q) { try { await bd.query(q); } catch (e) { console.error("ERROR SQL:", e.message); await bd.end(); process.exit(1); } }
await sql(sqlSemilla);
console.log("✓ perfiles, horarios, pacientes y citas");

// Cobro de la semana pasada: misma lógica de la semilla E_04 (turno de caja, ticket, pagos, cierre y revisión del administrador).
const e04 = fs.readFileSync(path.join(ROOT, "supabase", "semillas", "E_04_cobro_agenda_podologo.sql"), "utf8")
  .replaceAll("{{DESDE}}", iso(lunesAnt)).replaceAll("{{HASTA}}", iso(lunes));
await sql(e04);
console.log("✓ cobros de la semana pasada");

const estado = { diaDemo: iso(dia), lunes: iso(lunes), clave: CLAVE, cuentas: Object.fromEntries(USUARIOS.map((u) => [u.clave, { email: u.email, nombre: `${u.nombre} ${u.apellidos}` }])) };
fs.writeFileSync(path.join(ROOT, "demo", "estado.json"), JSON.stringify(estado, null, 2));
await bd.end();
console.log("✓ demo/estado.json · día de la demo:", estado.diaDemo);
