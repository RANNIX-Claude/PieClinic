-- 255 · Control y Auditoría · ETAPA 7 · recepción: una serie ya registrada (o repetida en la misma recepción) se rechaza ANTES de tocar los sellos, con el mensaje claro.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_recepcion_registrar(p_id uuid, p_sucursal uuid, p_documento text, p_lineas jsonb, p_pin text, p_nota text default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); l jsonb; v_n integer; a piefirme.ctl_producto_atributo; v_pin jsonb; s piefirme.ctl_sello%rowtype; v_prod uuid; v_folio text; v_nuevo text; v_serie text;
        v_ver text; v_ev uuid; v_peso numeric; v_sello uuid; v_pieza uuid; v_inc integer := 0; v_firma timestamptz; v_ev_vistas uuid[] := '{}'; v_r jsonb; v_lin uuid; v_resumen jsonb := '[]'::jsonb; v_nvid uuid; v_series text[] := '{}';
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if p_id is null then raise exception 'falta el identificador de la recepción' using errcode = 'PF422'; end if;
  if exists (select 1 from piefirme.ctl_recepcion r where r.id = p_id and r.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', p_id, 'idempotente', true); end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) not between 1 and 50 then
    raise exception 'la recepción lleva de 1 a 50 piezas, cada una escaneada y verificada' using errcode = 'PF422';
  end if;
  -- 1 · validar todo antes de firmar (no se gasta un intento de PIN en una captura incompleta)
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_prod := nullif(l ->> 'producto_id', '')::uuid; v_ver := l ->> 'verificacion'; v_ev := nullif(l ->> 'evidencia_id', '')::uuid;
    v_folio := piefirme_app.ctl_cus_folio(l ->> 'folio_sello'); v_nuevo := piefirme_app.ctl_cus_folio(l ->> 'nuevo_folio_sello'); v_serie := nullif(upper(btrim(coalesce(l ->> 'numero_serie', ''))), '');
    if not exists (select 1 from piefirme.productos p where p.id = v_prod and p.organizacion_id = v_org) then raise exception 'una de las piezas no es un producto válido' using errcode = 'PF404'; end if;
    select * into a from piefirme.ctl_producto_atributo where organizacion_id = v_org and producto_id = v_prod;
    if not coalesce(a.requiere_sello, false) then
      raise exception 'la recepción con responsiva solo aplica a productos con sello («%» no lo requiere): en el piloto se controla lo caro y en caja, no las 2,000 claves', piefirme_app.ctl_cus_nombre_producto(v_prod) using errcode = 'PF422';
    end if;
    if v_ver not in ('sello_intacto', 'abierta_y_resellada', 'sello_roto') then raise exception 'indique cómo se verificó «%»: sello intacto, abierta y resellada o sello roto', piefirme_app.ctl_cus_nombre_producto(v_prod) using errcode = 'PF422'; end if;
    if coalesce(a.requiere_serie, false) and v_serie is null then raise exception '«%» se identifica por número de serie: capture la serie de esta pieza', piefirme_app.ctl_cus_nombre_producto(v_prod) using errcode = 'PF422'; end if;
    if coalesce(a.requiere_serie, false) then
      if exists (select 1 from piefirme.ctl_pieza z where z.organizacion_id = v_org and z.producto_id = v_prod and z.numero_serie = v_serie) then
        raise exception 'la pieza «%» con serie % ya está registrada: una serie no se recibe dos veces', piefirme_app.ctl_cus_nombre_producto(v_prod), v_serie using errcode = 'PF409';
      end if;
      if (v_prod::text || ':' || v_serie) = any (v_series) then raise exception 'la serie % viene repetida en esta recepción: cada pieza tiene la suya', v_serie using errcode = 'PF422'; end if;
      v_series := v_series || (v_prod::text || ':' || v_serie);
    end if;
    if v_ver in ('sello_intacto', 'sello_roto') and v_folio is null then raise exception 'capture el folio del sello que trae «%»', piefirme_app.ctl_cus_nombre_producto(v_prod) using errcode = 'PF422'; end if;
    if v_ver = 'abierta_y_resellada' and v_nuevo is null then raise exception 'si se abrió «%», capture el folio del sello nuevo', piefirme_app.ctl_cus_nombre_producto(v_prod) using errcode = 'PF422'; end if;
    perform piefirme_app.ctl_cus_evidencia_ok(v_org, p_sucursal, v_ev, 'recepcion', p_id, 'cada pieza («' || piefirme_app.ctl_cus_nombre_producto(v_prod) || '»)');
    if v_ev = any (v_ev_vistas) then raise exception 'cada pieza lleva su propia foto: la misma foto no puede servir a dos piezas' using errcode = 'PF422'; end if;
    v_ev_vistas := v_ev_vistas || v_ev;
    if v_ver = 'sello_roto' then v_inc := v_inc + 1; end if;
    if nullif(l ->> 'peso_medido', '') is not null and (l ->> 'peso_medido')::numeric <= 0 then raise exception 'el peso debe ser mayor a cero (en gramos)' using errcode = 'PF422'; end if;
  end loop;
  -- 2 · firma con PIN (el PIN es de quien recibe: a partir de aquí las piezas son su responsabilidad)
  v_pin := piefirme_app.ctl_verificar_pin(v_org, p_pin);
  if not coalesce((v_pin ->> 'ok')::boolean, false) then return v_pin; end if;
  v_n := jsonb_array_length(p_lineas);
  v_firma := now();
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_recepcion (id, organizacion_id, sucursal_id, documento, nota, lineas, con_incidencias, firmada_en, hora_cliente)
  values (p_id, v_org, p_sucursal, nullif(btrim(coalesce(p_documento, '')), ''), nullif(btrim(coalesce(p_nota, '')), ''), v_n, v_inc > 0, v_firma, p_hora_cliente);
  -- 3 · cada pieza: sello, pieza con serie y línea de responsiva
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_prod := (l ->> 'producto_id')::uuid; v_ver := l ->> 'verificacion'; v_ev := (l ->> 'evidencia_id')::uuid; v_peso := nullif(l ->> 'peso_medido', '')::numeric;
    v_folio := piefirme_app.ctl_cus_folio(l ->> 'folio_sello'); v_nuevo := piefirme_app.ctl_cus_folio(l ->> 'nuevo_folio_sello'); v_serie := nullif(upper(btrim(coalesce(l ->> 'numero_serie', ''))), '');
    select * into a from piefirme.ctl_producto_atributo where organizacion_id = v_org and producto_id = v_prod;
    v_sello := null; v_pieza := null; v_r := null;
    if v_folio is not null then select * into s from piefirme.ctl_sello where organizacion_id = v_org and folio_sello = v_folio for update; else s := null; end if;
    if s.id is not null then
      if s.sucursal_id <> p_sucursal then
        raise exception 'el sello % está registrado en otra sucursal: una pieza sellada que cambia de sucursal se reabre y se vuelve a sellar (reapertura con folio nuevo)', v_folio using errcode = 'PF409';
      end if;
      if s.producto_id <> v_prod or (v_serie is not null and s.numero_serie is not null and s.numero_serie <> v_serie) then
        raise exception 'el sello % pertenece a otra pieza: revise el folio o la serie', v_folio using errcode = 'PF409';
      end if;
    end if;
    if v_ver = 'sello_intacto' then
      if s.id is not null and s.estado <> 'vigente' then raise exception 'el sello % ya no es el vigente de la pieza (está %): verifíquelo con su supervisor', v_folio, replace(s.estado, '_', ' ') using errcode = 'PF409'; end if;
      if s.id is null then
        v_sello := gen_random_uuid();
        insert into piefirme.ctl_sello (id, organizacion_id, sucursal_id, folio_sello, producto_id, numero_serie, colocado_por, origen, evidencia_id)
        values (v_sello, v_org, p_sucursal, v_folio, v_prod, v_serie, auth.uid(), 'recepcion', v_ev);
      else v_sello := s.id; end if;
      v_nvid := gen_random_uuid();
      v_r := piefirme_app.ctl_sello_verificar_interno(v_org, p_sucursal, v_nvid, v_sello, v_folio, v_prod, v_serie, true, v_peso, v_ev, 'recepcion', p_id, p_hora_cliente);
    elsif v_ver = 'abierta_y_resellada' then
      if exists (select 1 from piefirme.ctl_sello x where x.organizacion_id = v_org and x.folio_sello = v_nuevo) then raise exception 'el folio de sello % ya está registrado: el sello nuevo debe ser distinto', v_nuevo using errcode = 'PF409'; end if;
      if s.id is not null then
        if s.estado not in ('vigente', 'roto_sin_registro') then raise exception 'el sello % ya fue reemplazado', v_folio using errcode = 'PF409'; end if;
        update piefirme.ctl_sello set estado = 'reemplazado' where id = s.id;
      end if;
      v_sello := gen_random_uuid();
      insert into piefirme.ctl_sello (id, organizacion_id, sucursal_id, folio_sello, producto_id, numero_serie, colocado_por, sello_anterior_id, motivo_reapertura, origen, evidencia_id)
      values (v_sello, v_org, p_sucursal, v_nuevo, v_prod, v_serie, auth.uid(), s.id, case when s.id is not null then 'Se abrió al recibir para verificar el contenido' end, case when s.id is not null then 'reapertura' else 'recepcion' end, v_ev);
    else   -- sello_roto: llegó abierto; queda la pieza a cargo de quien firma, el sello se marca roto y se abre el caso
      if s.id is null then
        v_sello := gen_random_uuid();
        insert into piefirme.ctl_sello (id, organizacion_id, sucursal_id, folio_sello, producto_id, numero_serie, colocado_por, origen, evidencia_id)
        values (v_sello, v_org, p_sucursal, v_folio, v_prod, v_serie, auth.uid(), 'recepcion', v_ev);
      else v_sello := s.id; end if;
      v_nvid := gen_random_uuid();
      v_r := piefirme_app.ctl_sello_verificar_interno(v_org, p_sucursal, v_nvid, v_sello, v_folio, v_prod, v_serie, false, v_peso, v_ev, 'recepcion', p_id, p_hora_cliente);
    end if;
    if coalesce(a.requiere_serie, false) then
      if exists (select 1 from piefirme.ctl_pieza z where z.organizacion_id = v_org and z.producto_id = v_prod and z.numero_serie = v_serie) then
        raise exception 'la pieza «%» con serie % ya está registrada: una serie no se recibe dos veces', piefirme_app.ctl_cus_nombre_producto(v_prod), v_serie using errcode = 'PF409';
      end if;
      v_pieza := gen_random_uuid();
      insert into piefirme.ctl_pieza (id, organizacion_id, sucursal_id, producto_id, numero_serie, origen, sello_id) values (v_pieza, v_org, p_sucursal, v_prod, v_serie, 'recepcion', v_sello);
    end if;
    insert into piefirme.ctl_recepcion_linea (organizacion_id, sucursal_id, recepcion_id, producto_id, numero_serie, folio_sello, verificacion, nuevo_folio_sello, sello_id, pieza_id, peso_medido, evidencia_id, responsable_id, responsable_desde)
    values (v_org, p_sucursal, p_id, v_prod, v_serie, v_folio, v_ver, v_nuevo, v_sello, v_pieza, v_peso, v_ev, auth.uid(), v_firma) returning id into v_lin;
    v_resumen := v_resumen || jsonb_build_array(jsonb_build_object('producto_id', v_prod, 'numero_serie', v_serie, 'verificacion', v_ver, 'peso_coincide', v_r -> 'peso_coincide'));
  end loop;
  -- 4 · evento hacia quien lo consuma (tablero, reportes): la cola es la de la Etapa 0
  insert into piefirme.ctl_eventos_entrada (organizacion_id, evento, origen, id_externo, payload, estado, procesado_en)
  values (v_org, 'recepcion_registrada', 'ctl', p_id::text,
          jsonb_build_object('recepcion_id', p_id, 'sucursal_id', p_sucursal, 'usuario_id', auth.uid(), 'firmada_en', v_firma, 'lineas', v_n, 'con_incidencias', v_inc > 0), 'procesado', now())
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'id', p_id, 'lineas', v_n, 'firmada_en', v_firma, 'con_incidencias', v_inc > 0, 'detalle', v_resumen);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'piefirme' and p.proname = 'ctl_recepcion_registrar' loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
end $$;
