-- Semilla E_03 · Agenda de la cuenta de prueba p@g.com (Podólogo): ~12 meses de citas atendidas / no asistió / canceladas y las próximas semanas,
-- para que su inicio móvil, «Mi agenda» y sus comisiones tengan datos. Sede Chalco, Cabina 2 (no choca con el podólogo sintético 1 de Cabina 1).
-- Requiere: scripts/qa-usuarios-prueba.mjs ejecutado (existe el perfil p@g.com) y B_00/B_02 (servicios, pacientes c1000000-…).
-- Idempotente: si p@g.com ya tiene citas, no hace nada. Sintético.
do $$
declare
  o     constant uuid := '00000000-0000-0000-0000-00000000c0de';
  sede  constant uuid := '5e000000-0000-0000-0000-000000000001';
  tz    constant text := 'America/Mexico_City';
  pod   uuid; cab uuid; v_n int;
begin
  select id into pod from piefirme.perfiles where organizacion_id = o and email = 'p@g.com';
  if pod is null then raise notice 'E_03: no existe el perfil p@g.com (corre scripts/qa-usuarios-prueba.mjs primero)'; return; end if;
  if exists (select 1 from piefirme.citas where podologo_id = pod) then raise notice 'E_03: p@g.com ya tiene citas'; return; end if;
  select id into cab from piefirme.cabinas where sede_id = sede and nombre = 'Cabina 2';

  insert into piefirme.citas (organizacion_id, sede_id, paciente_id, servicio_id, podologo_id, atendio_id, cabina_id, inicio, fin, duracion_min, estado, origen, primera_vez,
                            precio_servicio, motivo_cancelacion, cancelada_en, fin_atencion_en, llegada_en)
  select o, sede, s.pac, sv.id, pod, case when s.est = 'atendida' then pod end, cab, s.ini, s.ini + make_interval(mins => sv.duracion_min), sv.duracion_min, s.est,
         (array['llamada', 'presencial', 'whatsapp', 'llamada'])[1 + s.h4 % 4], (s.h5 % 6 = 0),
         coalesce(piefirme_app.precio_servicio(o, sv.id, sede, s.dia), 0),
         case when s.est = 'cancelada' then 'Cancelación sintética (paciente)' end, case when s.est = 'cancelada' then s.ini - interval '2 days' end,
         case when s.est = 'atendida' then s.ini + make_interval(mins => sv.duracion_min) end, case when s.est = 'atendida' then s.ini - interval '5 minutes' end
    from (
      select b.dia, b.ini, b.h4, b.h5, b.pac,
             case when b.h2 < 45 then 'SV-001' when b.h2 < 60 then 'SV-002' when b.h2 < 72 then 'SV-005' when b.h2 < 84 then 'SV-006' when b.h2 < 92 then 'SV-008' else 'SV-011' end as cod,
             case when b.dia < date '2026-10-31' then (case when b.h3 < 74 then 'atendida' when b.h3 < 85 then 'no_asistio' else 'cancelada' end)
                  else (case when b.h3 < 8 then 'cancelada' when b.h3 < 65 then 'confirmada' else 'por_confirmar' end) end as est
        from (
          select g.dia, ((g.dia + sl.t) at time zone tz) as ini,
                 ('c1000000-0000-0000-0000-0000000000' || lpad((1 + abs(hashtext('pz' || g.dia || sl.t)) % 40)::text, 2, '0'))::uuid as pac,
                 abs(hashtext('pa' || g.dia || sl.t)) % 100 as h1, abs(hashtext('pb' || g.dia || sl.t)) % 100 as h2, abs(hashtext('pc' || g.dia || sl.t)) % 100 as h3,
                 abs(hashtext('pd' || g.dia || sl.t)) % 100 as h4, abs(hashtext('pe' || g.dia || sl.t)) % 100 as h5
            from (select d::date as dia from generate_series(date '2025-11-03', date '2026-11-14', interval '1 day') d) g
            cross join (values (time '09:00'), (time '10:15'), (time '11:30'), (time '15:00'), (time '16:15')) sl(t)
           where extract(isodow from g.dia) <= 5 and not exists (select 1 from piefirme.festivos f where f.organizacion_id = o and f.fecha = g.dia)
        ) b where b.h1 >= 30
    ) s
    join piefirme.servicios sv on sv.organizacion_id = o and sv.codigo = s.cod
   order by s.ini;
  get diagnostics v_n = row_count;
  raise notice 'E_03: % citas para p@g.com', v_n;
end $$;
