-- 253 · Control y Auditoría · ETAPA 7 · CADENA DE CUSTODIA (4/4): talonarios de contingencia, tickets manuales, auditoría del talonario y caídas del sistema (F5.4).
--   · Alta de talonarios (oficina central: supervisor o dueño): rango que no se traslapa con otro talonario de la clínica.
--   · Ticket manual: el SERVIDOR valida que el folio caiga en un talonario ACTIVO de esa sucursal y que no esté repetido; foto en vivo del papel obligatoria.
--   · Auditoría del talonario: «el siguiente folio en blanco es el N»; los folios del inicial al N-1 deben estar todos capturados (venta o cancelado). Los que falten se
--     marcan (fila 'faltante'), abren UN caso folio_faltante por auditoría y alertan al dueño (alerta diaria para el correo simulado: ctl_talonario_alerta_diaria).
--   · Caídas del sistema: inicio, fin y tickets manuales; la venta del periodo se compara con el promedio de la tienda (mismas horas, mismo día de la semana, 8 semanas
--     previas). Una sucursal que «se cae» seguido y vende poco en esos ratos genera alerta. El esperado vive en ctl_caida_resumen (solo ver diferencias).
-- Depende de: 200–206, 230–235, 250–252.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── talonarios ─────────────────────────────
create or replace function piefirme.ctl_talonario_alta(p_sucursal uuid, p_inicial integer, p_final integer, p_entregado_a uuid default null, p_recibido_nombre text default null,
                                                      p_entregado_en timestamptz default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); v_id uuid := gen_random_uuid(); x piefirme.ctl_talonario; v_ent timestamptz := least(coalesce(p_entregado_en, now()), now());
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if p_inicial is null or p_final is null or p_inicial < 1 or p_final < p_inicial then raise exception 'el folio final debe ser igual o mayor al inicial, y ambos mayores a cero' using errcode = 'PF422'; end if;
  if p_final - p_inicial + 1 > 2000 then raise exception 'un talonario de más de 2,000 folios no es un talonario: registre varios' using errcode = 'PF422'; end if;
  if v_ent < now() - interval '365 days' then raise exception 'la fecha de entrega no puede ser de hace más de un año' using errcode = 'PF422'; end if;
  if p_entregado_a is null and length(btrim(coalesce(p_recibido_nombre, ''))) < 3 then raise exception 'indique quién recibió el talonario (persona del sistema o su nombre)' using errcode = 'PF422'; end if;
  if p_entregado_a is not null and not exists (select 1 from piefirme.perfiles p where p.id = p_entregado_a and p.organizacion_id = v_org) then raise exception 'la persona que recibe no es de esta clínica' using errcode = 'PF422'; end if;
  select * into x from piefirme.ctl_talonario t
   where t.organizacion_id = v_org and t.estado <> 'cancelado' and t.folio_inicial <= p_final and t.folio_final >= p_inicial limit 1;
  if found then
    raise exception 'el rango % a % se traslapa con el talonario % a % de %: un folio impreso no puede existir en dos talonarios', p_inicial, p_final, x.folio_inicial, x.folio_final, piefirme_app.ctl_cus_nombre_sede(x.sucursal_id) using errcode = 'PF409';
  end if;
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_talonario (id, organizacion_id, sucursal_id, folio_inicial, folio_final, entregado_a, recibido_nombre, entregado_en, nota)
  values (v_id, v_org, p_sucursal, p_inicial, p_final, p_entregado_a, nullif(btrim(coalesce(p_recibido_nombre, '')), ''), v_ent, nullif(btrim(coalesce(p_nota, '')), ''));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function piefirme.ctl_talonario_cancelar(p_talonario uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); t piefirme.ctl_talonario%rowtype;
begin
  select * into t from piefirme.ctl_talonario where id = p_talonario and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(t.sucursal_id) then raise exception 'talonario no encontrado' using errcode = 'PF404'; end if;
  if t.estado <> 'activo' then raise exception 'el talonario ya está %', t.estado using errcode = 'PF409'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'indique el motivo de la cancelación' using errcode = 'PF422'; end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_talonario set estado = 'cancelado', motivo_cancelacion = btrim(p_motivo) where id = t.id;
  return jsonb_build_object('ok', true, 'id', t.id);
end $$;

-- ───────────────────────────── ticket manual ─────────────────────────────
create or replace function piefirme.ctl_ticket_manual_capturar(p_id uuid, p_sucursal uuid, p_folio integer, p_monto numeric, p_productos jsonb, p_evidencia uuid,
                                                              p_cancelado boolean default false, p_fecha_venta date default null, p_hora_venta timestamptz default null,
                                                              p_caida uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid := coalesce(p_id, gen_random_uuid()); t piefirme.ctl_talonario%rowtype; k piefirme.ctl_ticket_manual%rowtype; e jsonb;
        v_caida uuid := p_caida; v_fecha date; v_tz text; v_estado text; v_n integer; v_row uuid;
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if exists (select 1 from piefirme.ctl_ticket_manual x where x.organizacion_id = v_org and (x.id = v_id or (p_evidencia is not null and x.evidencia_id = p_evidencia))) then
    return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true);
  end if;
  if p_folio is null or p_folio < 1 then raise exception 'escriba el folio del ticket de papel' using errcode = 'PF422'; end if;
  select * into t from piefirme.ctl_talonario x where x.organizacion_id = v_org and x.sucursal_id = p_sucursal and x.estado = 'activo' and p_folio between x.folio_inicial and x.folio_final for update;
  if not found then
    raise exception 'el folio % no cae en un talonario activo de esta sucursal: revise el número del ticket; si el talonario es nuevo, la oficina central debe darlo de alta primero', p_folio using errcode = 'PF422';
  end if;
  select * into k from piefirme.ctl_ticket_manual x where x.talonario_id = t.id and x.folio = p_folio for update;
  if found and k.estado <> 'faltante' then raise exception 'el folio % ya está capturado: un folio de talonario no se repite', p_folio using errcode = 'PF409'; end if;
  v_estado := case when coalesce(p_cancelado, false) then 'cancelado' else 'capturado' end;
  if p_monto is null or p_monto < 0 then raise exception 'el monto debe ser cero o mayor' using errcode = 'PF422'; end if;
  if v_estado = 'capturado' then
    if p_monto <= 0 then raise exception 'un ticket vendido lleva monto mayor a cero (si el folio se anuló, márquelo como cancelado)' using errcode = 'PF422'; end if;
    if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) not between 1 and 50 then raise exception 'capture al menos un producto o servicio del ticket (máximo 50)' using errcode = 'PF422'; end if;
    for e in select * from jsonb_array_elements(p_productos) loop
      if jsonb_typeof(e) <> 'object' or (coalesce(btrim(e ->> 'descripcion'), '') = '' and nullif(e ->> 'producto_id', '') is null) or coalesce((e ->> 'cantidad')::numeric, 0) <= 0 then
        raise exception 'cada renglón del ticket lleva descripción (o producto) y cantidad mayor a cero' using errcode = 'PF422';
      end if;
    end loop;
  end if;
  perform piefirme_app.ctl_cus_evidencia_ok(v_org, p_sucursal, p_evidencia, 'ticket_manual', v_id, 'el ticket de papel');
  select coalesce(o.zona_horaria, 'America/Mexico_City') into v_tz from piefirme.organizaciones o where o.id = v_org;
  v_fecha := coalesce(p_fecha_venta, (now() at time zone coalesce(v_tz, 'America/Mexico_City'))::date);
  if v_fecha > (now() at time zone coalesce(v_tz, 'America/Mexico_City'))::date + 1 or v_fecha < (now() at time zone coalesce(v_tz, 'America/Mexico_City'))::date - 90 then
    raise exception 'la fecha de venta debe estar dentro de los últimos 90 días y no ser futura' using errcode = 'PF422';
  end if;
  -- caída a la que pertenece: la indicada, la abierta o la que contiene la hora de la venta
  if v_caida is null then
    select c.id into v_caida from piefirme.ctl_caida_sistema c where c.organizacion_id = v_org and c.sucursal_id = p_sucursal and c.fin_en is null limit 1;
    if v_caida is null and p_hora_venta is not null then
      select c.id into v_caida from piefirme.ctl_caida_sistema c where c.organizacion_id = v_org and c.sucursal_id = p_sucursal and c.inicio_en <= p_hora_venta and c.fin_en >= p_hora_venta order by c.inicio_en desc limit 1;
    end if;
  elsif not exists (select 1 from piefirme.ctl_caida_sistema c where c.id = v_caida and c.organizacion_id = v_org and c.sucursal_id = p_sucursal) then
    raise exception 'la caída indicada no es de esta sucursal' using errcode = 'PF422';
  end if;
  perform piefirme_app.ctl_rpc_on();
  if k.id is not null then   -- el folio estaba marcado «faltante» por una auditoría: aparece el papel, el faltante se resuelve
    update piefirme.ctl_ticket_manual set estado = v_estado, monto = p_monto, fecha_venta = v_fecha, productos = coalesce(p_productos, '[]'::jsonb), evidencia_id = p_evidencia, caida_id = v_caida,
           hora_venta = p_hora_venta, capturado_por = auth.uid(), capturado_en = now(), hora_cliente = p_hora_cliente, nota = 'Folio localizado después de marcarse faltante'
     where id = k.id;
    v_row := k.id;
  else
    insert into piefirme.ctl_ticket_manual (id, organizacion_id, sucursal_id, talonario_id, folio, monto, fecha_venta, hora_cliente, estado, productos, caida_id, hora_venta, evidencia_id)
    values (v_id, v_org, p_sucursal, t.id, p_folio, p_monto, v_fecha, p_hora_cliente, v_estado, coalesce(p_productos, '[]'::jsonb), v_caida, p_hora_venta, p_evidencia);
    v_row := v_id;
  end if;
  select count(*) into v_n from piefirme.ctl_ticket_manual x where x.talonario_id = t.id and x.estado in ('capturado', 'cancelado');
  if v_n = t.folio_final - t.folio_inicial + 1 then
    update piefirme.ctl_talonario set estado = 'consumido', consumido_en = now() where id = t.id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_row, 'folio', p_folio, 'talonario_id', t.id, 'caida_id', v_caida, 'talonario_consumido', v_n = t.folio_final - t.folio_inicial + 1);
end $$;

-- Cobertura de cada talonario (sin nada que el sistema espere de ventas: solo lo capturado en papel).
create or replace function piefirme.ctl_talonario_resumen(p_sucursal uuid default null) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_res jsonb;
begin
  if p_sucursal is not null then perform piefirme_app.ctl_cus_sede(v_org, p_sucursal); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.entregado_en desc), '[]'::jsonb) into v_res from (
    select t.id, t.sucursal_id, t.folio_inicial, t.folio_final, t.estado, t.entregado_en, t.entregado_a, t.recibido_nombre, t.nota, t.motivo_cancelacion,
           (select count(*) from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.estado = 'capturado')::integer as capturados,
           (select count(*) from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.estado = 'cancelado')::integer as cancelados,
           (select count(*) from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.estado = 'faltante')::integer as faltantes_marcados,
           (select max(k.folio) from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.estado in ('capturado', 'cancelado')) as ultimo_capturado,
           (select min(n) from generate_series(t.folio_inicial, t.folio_final) n
             where not exists (select 1 from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.folio = n and k.estado in ('capturado', 'cancelado'))) as siguiente_sin_capturar
      from piefirme.ctl_talonario t
     where t.organizacion_id = v_org and piefirme_app.puede_sede(t.sucursal_id) and (p_sucursal is null or t.sucursal_id = p_sucursal)) x;
  return v_res;
end $$;

-- ───────────────────────────── auditoría del talonario (criterio 21) ─────────────────────────────
create or replace function piefirme.ctl_talonario_auditar(p_id uuid, p_talonario uuid, p_siguiente integer, p_evidencia uuid, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); t piefirme.ctl_talonario%rowtype; v_id uuid := coalesce(p_id, gen_random_uuid());
        v_falt integer[]; v_ya integer[]; v_nuevos integer[]; v_adel integer[]; v_cap integer; v_can integer; v_continuo boolean; v_caso uuid; v_caso_folio text; v_suc text; n integer;
begin
  select * into t from piefirme.ctl_talonario where id = p_talonario and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(t.sucursal_id) then raise exception 'talonario no encontrado' using errcode = 'PF404'; end if;
  if exists (select 1 from piefirme.ctl_talonario_auditoria a where a.id = v_id and a.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true); end if;
  if t.estado = 'cancelado' then raise exception 'el talonario está cancelado: no se audita' using errcode = 'PF409'; end if;
  if p_siguiente is null or p_siguiente < t.folio_inicial or p_siguiente > t.folio_final + 1 then
    raise exception 'el siguiente folio en blanco debe estar entre % y % (el talonario es del % al %)', t.folio_inicial, t.folio_final + 1, t.folio_inicial, t.folio_final using errcode = 'PF422';
  end if;
  perform piefirme_app.ctl_cus_evidencia_ok(v_org, t.sucursal_id, p_evidencia, 'talonario_auditoria', v_id, 'el siguiente folio en blanco');
  v_suc := piefirme_app.ctl_cus_nombre_sede(t.sucursal_id);
  select coalesce(array_agg(g order by g), '{}') into v_falt from generate_series(t.folio_inicial, p_siguiente - 1) g
   where not exists (select 1 from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.folio = g and k.estado in ('capturado', 'cancelado'));
  select coalesce(array_agg(g order by g), '{}') into v_ya from unnest(v_falt) g
   where exists (select 1 from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.folio = g and k.estado = 'faltante');
  select coalesce(array_agg(g order by g), '{}') into v_nuevos from unnest(v_falt) g where not (g = any (v_ya));
  select coalesce(array_agg(k.folio order by k.folio), '{}') into v_adel from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.folio >= p_siguiente and k.estado in ('capturado', 'cancelado');
  select count(*) filter (where k.estado = 'capturado'), count(*) filter (where k.estado = 'cancelado') into v_cap, v_can from piefirme.ctl_ticket_manual k where k.talonario_id = t.id and k.folio < p_siguiente;
  v_continuo := cardinality(v_falt) = 0 and cardinality(v_adel) = 0;
  perform piefirme_app.ctl_rpc_on();
  foreach n in array v_nuevos loop
    insert into piefirme.ctl_ticket_manual (organizacion_id, sucursal_id, talonario_id, folio, monto, estado, productos, nota)
    values (v_org, t.sucursal_id, t.id, n, 0, 'faltante', '[]'::jsonb, 'Folio sin capturar detectado en la auditoría del talonario');
  end loop;
  if cardinality(v_nuevos) > 0 or cardinality(v_adel) > 0 then
    v_caso := piefirme_app.ctl_abrir_caso(v_org, t.sucursal_id, 'folio_faltante', 'talonario_auditoria', v_id, null, cardinality(v_nuevos)::numeric, null, auth.uid(),
        jsonb_build_object('talonario_id', t.id, 'rango', t.folio_inicial || '–' || t.folio_final, 'siguiente_en_blanco', p_siguiente, 'folios_faltantes', to_jsonb(v_falt), 'folios_nuevos', to_jsonb(v_nuevos),
                           'folios_ya_marcados', to_jsonb(v_ya), 'folios_adelantados', to_jsonb(v_adel)),
        null, null, 'Caso abierto automáticamente por la auditoría del talonario ' || t.folio_inicial || '–' || t.folio_final);
    select folio into v_caso_folio from piefirme.ctl_caso where id = v_caso;
    perform piefirme_app.ctl_cus_alerta(v_org, t.sucursal_id, 'folio_faltante', 'alta', array['dueno'],
      format('%s: la auditoría del talonario %s–%s encontró el folio %s en blanco, pero %s%s%s. Caso %s.', v_suc, t.folio_inicial, t.folio_final, p_siguiente,
             case when cardinality(v_falt) > 0 then 'faltan por capturar los folios ' || array_to_string(v_falt, ', ') else 'sin folios faltantes' end,
             case when cardinality(v_adel) > 0 then '; ya están capturados folios posteriores al «en blanco» (' || array_to_string(v_adel, ', ') || ')' else '' end, '', v_caso_folio),
      'caso', v_caso);
  end if;
  insert into piefirme.ctl_talonario_auditoria (id, organizacion_id, sucursal_id, talonario_id, siguiente_folio, evidencia_id, capturados, cancelados, folios_faltantes, folios_nuevos, folios_adelantados, continuo, caso_id, hora_cliente)
  values (v_id, v_org, t.sucursal_id, t.id, p_siguiente, p_evidencia, coalesce(v_cap, 0), coalesce(v_can, 0), v_falt, v_nuevos, v_adel, v_continuo, v_caso, p_hora_cliente);
  return jsonb_build_object('ok', true, 'id', v_id, 'continuo', v_continuo, 'faltantes', to_jsonb(v_falt), 'nuevos', to_jsonb(v_nuevos), 'adelantados', to_jsonb(v_adel), 'caso_id', v_caso, 'caso_folio', v_caso_folio);
end $$;

-- Alerta diaria (la consume el correo diario simulado de la Etapa 6; mientras no exista, queda en ctl_alerta): una por clínica y día con todos los folios aún faltantes.
create or replace function piefirme_app.ctl_talonario_alerta_diaria(p_org uuid) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_txt text; v_n integer;
begin
  if exists (select 1 from piefirme.ctl_alerta a where a.organizacion_id = p_org and a.tipo = 'folio_faltante_diario' and a.creado_en > now() - interval '20 hours') then return 0; end if;
  select count(*)::integer, string_agg(x.linea, '; ' order by x.linea) into v_n, v_txt from (
    select piefirme_app.ctl_cus_nombre_sede(t.sucursal_id) || ' (talonario ' || t.folio_inicial || '–' || t.folio_final || '): ' || string_agg(k.folio::text, ', ' order by k.folio) as linea
      from piefirme.ctl_ticket_manual k join piefirme.ctl_talonario t on t.id = k.talonario_id
     where k.organizacion_id = p_org and k.estado = 'faltante' group by t.id, t.sucursal_id, t.folio_inicial, t.folio_final) x;
  if v_n = 0 then return 0; end if;
  perform piefirme_app.ctl_cus_alerta(p_org, null, 'folio_faltante_diario', 'alta', array['dueno'], 'Folios de talonario que siguen sin capturar: ' || v_txt, null, null);
  return v_n;
end $$;

-- ───────────────────────────── caídas del sistema ─────────────────────────────
-- Venta del periodo contra el promedio de la tienda: mismas horas, mismo día de la semana, 8 semanas previas (se necesitan al menos 2 con venta).
create or replace function piefirme_app.ctl_caida_calcular(c piefirme.ctl_caida_sistema) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_fin timestamptz := coalesce(c.fin_en, now()); v_sis numeric; v_man numeric; v_sum numeric := 0; v_mues integer := 0; v_s numeric; k integer; v_esp numeric; v_prop numeric; v_pct numeric;
begin
  select coalesce(sum(ve.total), 0) into v_sis from piefirme.ventas ve
   where ve.organizacion_id = c.organizacion_id and ve.sede_id = c.sucursal_id and ve.estado in ('cobrada', 'por_facturar', 'facturada') and coalesce(ve.cobrada_en, ve.created_at) >= c.inicio_en and coalesce(ve.cobrada_en, ve.created_at) < v_fin;
  select coalesce(sum(t.monto), 0) into v_man from piefirme.ctl_ticket_manual t where t.caida_id = c.id and t.estado = 'capturado';
  for k in 1..8 loop
    select coalesce(sum(ve.total), 0) into v_s from piefirme.ventas ve
     where ve.organizacion_id = c.organizacion_id and ve.sede_id = c.sucursal_id and ve.estado in ('cobrada', 'por_facturar', 'facturada')
       and coalesce(ve.cobrada_en, ve.created_at) >= c.inicio_en - make_interval(days => 7 * k) and coalesce(ve.cobrada_en, ve.created_at) < v_fin - make_interval(days => 7 * k);
    v_sum := v_sum + v_s; if v_s > 0 then v_mues := v_mues + 1; end if;
  end loop;
  if v_mues >= 2 then
    v_esp := round(v_sum / 8, 2);
    v_prop := case when v_esp > 0 then round((v_sis + v_man) / v_esp * 100, 2) end;
    v_pct := piefirme_app.ctl_cfg_num(c.organizacion_id, 'caida_baja_venta_pct', c.sucursal_id);
  end if;
  return jsonb_build_object('venta_sistema', v_sis, 'venta_manual', v_man, 'venta_esperada', v_esp, 'proporcion', v_prop, 'baja', case when v_prop is not null then v_prop < v_pct end, 'muestras', v_mues);
end $$;

create or replace function piefirme_app.ctl_caidas_evaluar(p_org uuid, p_sucursal uuid) returns boolean
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_n integer; v_conoc integer; v_bajas integer; v_minimo integer; v_dias integer;
begin
  v_minimo := piefirme_app.ctl_cfg_num(p_org, 'caidas_frecuentes_n', p_sucursal)::integer;
  v_dias := piefirme_app.ctl_cfg_num(p_org, 'caidas_ventana_dias', p_sucursal)::integer;
  select count(*)::integer, count(r.baja)::integer, count(*) filter (where r.baja)::integer into v_n, v_conoc, v_bajas
    from piefirme.ctl_caida_sistema c left join piefirme.ctl_caida_resumen r on r.caida_id = c.id
   where c.organizacion_id = p_org and c.sucursal_id = p_sucursal and c.inicio_en >= now() - make_interval(days => v_dias);
  if v_n >= v_minimo and v_bajas >= 2 and v_bajas * 2 > v_conoc
     and not exists (select 1 from piefirme.ctl_alerta a where a.organizacion_id = p_org and a.sucursal_id = p_sucursal and a.tipo = 'sucursal_se_cae' and a.creado_en > now() - interval '24 hours') then
    perform piefirme_app.ctl_cus_alerta(p_org, p_sucursal, 'sucursal_se_cae', 'alta', array['dueno', 'supervisor'],
      format('%s: el sistema se cayó %s veces en %s días y en %s de ellas vendió menos de lo normal. Es un patrón para revisar, no una conclusión.', piefirme_app.ctl_cus_nombre_sede(p_sucursal), v_n, v_dias, v_bajas), 'sucursal', p_sucursal);
    return true;
  end if;
  return false;
end $$;

create or replace function piefirme.ctl_caida_iniciar(p_id uuid, p_sucursal uuid, p_inicio timestamptz default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_id uuid := coalesce(p_id, gen_random_uuid()); v_ini timestamptz := least(coalesce(p_inicio, now()), now()); c piefirme.ctl_caida_sistema%rowtype;
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if exists (select 1 from piefirme.ctl_caida_sistema x where x.id = v_id and x.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true); end if;
  select * into c from piefirme.ctl_caida_sistema x where x.organizacion_id = v_org and x.sucursal_id = p_sucursal and x.fin_en is null;
  if found then return jsonb_build_object('ok', true, 'id', c.id, 'ya_abierta', true, 'inicio_en', c.inicio_en); end if;
  if v_ini < now() - interval '48 hours' then raise exception 'una caída no puede haber empezado hace más de 48 horas' using errcode = 'PF422'; end if;
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_caida_sistema (id, organizacion_id, sucursal_id, inicio_en, detectada_por) values (v_id, v_org, p_sucursal, v_ini, 'manual');
  return jsonb_build_object('ok', true, 'id', v_id, 'inicio_en', v_ini);
end $$;

create or replace function piefirme.ctl_caida_cerrar(p_caida uuid, p_fin timestamptz default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); c piefirme.ctl_caida_sistema%rowtype; v_fin timestamptz; v_n integer; v_r jsonb;
begin
  select * into c from piefirme.ctl_caida_sistema where id = p_caida and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(c.sucursal_id) then raise exception 'caída no encontrada' using errcode = 'PF404'; end if;
  if c.fin_en is not null then return jsonb_build_object('ok', true, 'id', c.id, 'idempotente', true); end if;
  v_fin := least(coalesce(p_fin, now()), now());
  if v_fin <= c.inicio_en then raise exception 'el fin de la caída debe ser posterior a su inicio' using errcode = 'PF422'; end if;
  select count(*)::integer into v_n from piefirme.ctl_ticket_manual t where t.caida_id = c.id and t.estado in ('capturado', 'cancelado');
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_caida_sistema set fin_en = v_fin, tickets_manuales = v_n, nota = nullif(btrim(coalesce(p_nota, '')), '') where id = c.id;
  select * into c from piefirme.ctl_caida_sistema where id = c.id;
  v_r := piefirme_app.ctl_caida_calcular(c);
  insert into piefirme.ctl_caida_resumen (caida_id, organizacion_id, sucursal_id, venta_sistema, venta_manual, venta_esperada, proporcion, baja, muestras)
  values (c.id, v_org, c.sucursal_id, (v_r ->> 'venta_sistema')::numeric, (v_r ->> 'venta_manual')::numeric, (v_r ->> 'venta_esperada')::numeric, (v_r ->> 'proporcion')::numeric, (v_r ->> 'baja')::boolean, (v_r ->> 'muestras')::integer);
  perform piefirme_app.ctl_caidas_evaluar(v_org, c.sucursal_id);
  return jsonb_build_object('ok', true, 'id', c.id, 'tickets_manuales', v_n, 'duracion_min', round(extract(epoch from (v_fin - c.inicio_en)) / 60));
end $$;

-- Lista de caídas. Quien captura ve inicio, fin y tickets; la comparación con el promedio (lo que el sistema esperaba) solo la ven dueño y supervisor.
create or replace function piefirme.ctl_caidas_listar(p_sucursal uuid default null, p_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_ver boolean := piefirme_app.ctl_puede('ver_directo'); v_res jsonb := '[]'::jsonb; c record;
begin
  if p_sucursal is not null then perform piefirme_app.ctl_cus_sede(v_org, p_sucursal); end if;
  for c in select * from piefirme.ctl_caida_sistema x where x.organizacion_id = v_org and piefirme_app.puede_sede(x.sucursal_id) and (p_sucursal is null or x.sucursal_id = p_sucursal)
            order by x.inicio_en desc limit least(greatest(coalesce(p_limite, 50), 1), 200) loop
    v_res := v_res || jsonb_build_array(jsonb_build_object('id', c.id, 'sucursal_id', c.sucursal_id, 'inicio_en', c.inicio_en, 'fin_en', c.fin_en, 'abierta', c.fin_en is null,
        'tickets_manuales', coalesce((select count(*) from piefirme.ctl_ticket_manual t where t.caida_id = c.id and t.estado in ('capturado', 'cancelado')), 0), 'detectada_por', c.detectada_por, 'nota', c.nota)
        || case when v_ver then jsonb_build_object('comparacion', piefirme_app.ctl_caida_calcular(c)) else '{}'::jsonb end);
  end loop;
  return v_res;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_talonario_alta', 'ctl_talonario_cancelar', 'ctl_ticket_manual_capturar', 'ctl_talonario_resumen', 'ctl_talonario_auditar',
                  'ctl_talonario_alerta_diaria', 'ctl_caida_calcular', 'ctl_caidas_evaluar', 'ctl_caida_iniciar', 'ctl_caida_cerrar', 'ctl_caidas_listar') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
