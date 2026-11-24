-- F_04 · Tarea 0 (datos de operación) · AGENDA DE HOY Y DE LOS PRÓXIMOS 6 DÍAS, relativa a la fecha en que se corre.
-- Todas las citas anteriores son pasadas; sin esto, «Hoy» del móvil (recepción, podólogo, administrador) saldría vacío.
-- Un podólogo por usuario de prueba (p@g.com, p1..p5@g.com); franjas de 60 min de 09:00 a 16:00 (sin empalmes ni cabinas repetidas, regla P-037).
-- Hoy: hay llegadas (en sala), una consulta en curso, confirmadas, por confirmar y una cancelación. Días siguientes: confirmadas y por confirmar.
-- Marca: citas.notas = 'SINT-HOY'. Idempotente (si ya existe la marca, no hace nada). Purga: delete from piefirme.citas where notas = 'SINT-HOY' (con usuario admin).
-- Para refrescar en otra fecha: borrar las marcadas y volver a correr.
--@resumen: select jsonb_build_object('citas_hoy',(select count(*) from piefirme.citas where notas='SINT-HOY' and (inicio at time zone 'America/Mexico_City')::date=(now() at time zone 'America/Mexico_City')::date),'citas_total',(select count(*) from piefirme.citas where notas='SINT-HOY'),'estados',(select jsonb_object_agg(estado,n) from (select estado,count(*) n from piefirme.citas where notas='SINT-HOY' group by 1) x),'en_sala',(select count(*) from piefirme.citas where notas='SINT-HOY' and llegada_en is not null),'en_atencion',(select count(*) from piefirme.citas where notas='SINT-HOY' and inicio_atencion_en is not null),'ultimo_dia',(select max((inicio at time zone 'America/Mexico_City')::date) from piefirme.citas where notas='SINT-HOY'))::text
do $$
declare
  o constant uuid := '00000000-0000-0000-0000-00000000c0de';
  recep constant uuid := 'a0000000-0000-0000-0000-000000000002';
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_n int;
begin
  if exists (select 1 from piefirme.citas where organizacion_id = o and notas = 'SINT-HOY') then
    raise notice 'agenda de hoy: ya sembrada';
  else
    insert into piefirme.citas (organizacion_id, sede_id, paciente_id, servicio_id, podologo_id, cabina_id, inicio, fin, duracion_min, estado, origen, notas, agendado_por,
                                llegada_en, inicio_atencion_en, motivo_cancelacion, tipo_atencion)
    select o, s.sede_id, pa.id, sv.id, s.podologo_id, s.cabina_id, s.inicio, s.inicio + make_interval(mins => sv.duracion_min), sv.duracion_min,
           d.estado,
           (array['whatsapp','portal','llamada','presencial','referido'])[1 + abs(hashtext('oh' || s.podologo_id || s.inicio)) % 5],
           'SINT-HOY', recep,
           case when d.estado = 'confirmada' and s.dia = 0 and s.k <= 2 then s.inicio - interval '8 minutes' end,
           case when d.estado = 'confirmada' and s.dia = 0 and s.k = 2 then s.inicio + interval '3 minutes' end,
           case when d.estado = 'cancelada' then 'El paciente avisó que no puede asistir' end,
           'presencial'
      from (
        select p.sede_id, p.podologo_id, (c.cabinas)[1 + (p.rango - 1) % array_length(c.cabinas, 1)] as cabina_id, g.dia, k.k,
               ((v_hoy + g.dia)::timestamp + time '09:00' + make_interval(hours => k.k)) at time zone 'America/Mexico_City' as inicio
          from (select f.id as podologo_id, f.sedes[1] as sede_id,
                       row_number() over (partition by f.sedes[1] order by f.id) as rango
                  from piefirme.perfiles f join auth.users u on u.id = f.id
                 where f.organizacion_id = o and f.rol = 'podologo' and u.email in ('p@g.com','p1@g.com','p2@g.com','p3@g.com','p4@g.com','p5@g.com')) p
          join (select sede_id, array_agg(id order by id) as cabinas from piefirme.cabinas group by 1) c on c.sede_id = p.sede_id
          cross join generate_series(0, 6) as g(dia)
          cross join generate_series(0, 7) as k(k)
         where extract(isodow from v_hoy + g.dia) <> 7
      ) s
      join lateral (select case
               when s.dia = 0 and s.k = 7 and abs(hashtext('cx' || s.podologo_id)) % 3 = 0 then 'cancelada'
               when s.dia = 0 and s.k <= 5 then 'confirmada'
               when s.dia = 0 then (case when abs(hashtext('d0' || s.podologo_id || s.k)) % 100 < 50 then 'confirmada' else 'por_confirmar' end)
               else (case when abs(hashtext('dn' || s.podologo_id || s.dia || s.k)) % 100 < 60 then 'confirmada' else 'por_confirmar' end) end as estado,
             abs(hashtext('ll' || s.podologo_id || s.dia || s.k)) % 100 as r) d on true
      -- ocupación: hoy 90 %, mañana 80 %, el resto 65 % (la cancelación de hoy entra siempre que le toque)
      join lateral (select 1 as ok where d.estado = 'cancelada' or d.r < case when s.dia = 0 then 90 when s.dia = 1 then 80 else 65 end) oc on true
      join lateral (select id, duracion_min from piefirme.servicios
                     where organizacion_id = o and estado = 'activo' and codigo in ('SV-001','SV-002','SV-005','SV-007','SV-010','SV-012','SV-004')
                     order by hashtext('sv' || s.podologo_id || s.dia || s.k) limit 1) sv on true
      join lateral (select id from piefirme.pacientes
                     where organizacion_id = o and sede_registro_id = s.sede_id and notas_administrativas like 'SINT-F:%'
                     order by hashtext('pa' || s.podologo_id || s.dia || s.k || id) limit 1) pa on true;
    get diagnostics v_n = row_count;
    raise notice 'agenda de hoy: % citas', v_n;
  end if;
  {{FIN}}
end $$;
