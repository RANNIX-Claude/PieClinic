-- 251 · Control y Auditoría · ETAPA 7 · CADENA DE CUSTODIA (2/4): banderas de catálogo, sellos VOID, verificación por peso y recepción con responsiva.
--   · ctl_producto_atributo_guardar (solo dueño/soporte): requiere_serie, requiere_sello, alto_valor, peso_caja_llena; cada cambio queda en bitácora.
--   · Sellos: colocar, reabrir (pieza, motivo, usuario, nuevo folio, sello_anterior_id) y verificar (intacto + peso con báscula). Un sello roto SIN registro de
--     reapertura (hallado en un conteo, en una recepción o en una verificación) pasa a «roto_sin_registro», abre un caso sello_roto y alerta al supervisor.
--   · Recepción con responsiva (F5.1): escanear, verificar, foto en vivo por pieza y firma con PIN; desde ese instante la pieza es del que firmó. Evento recepcion_registrada.
--   · Captura a ciegas: a quien captura NO se le devuelve el peso esperado, la desviación ni el estado del sello; solo si el peso coincide (sí/no) para que sepa si debe abrir la caja.
-- Depende de: 200–206, 230–235, 250.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── ayudas internas ─────────────────────────────
create or replace function piefirme_app.ctl_cus_sede(p_org uuid, p_sucursal uuid) returns void
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if p_sucursal is null or not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = p_org) or not piefirme_app.puede_sede(p_sucursal) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
end $$;

create or replace function piefirme_app.ctl_cus_folio(p text) returns text
language sql immutable as $$ select nullif(upper(btrim(coalesce(p, ''))), '') $$;

create or replace function piefirme_app.ctl_cus_nombre_sede(p_sede uuid) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select s.nombre from piefirme.sedes s where s.id = p_sede), 'sucursal')
$$;

create or replace function piefirme_app.ctl_cus_nombre_producto(p_producto uuid) returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce((select p.nombre from piefirme.productos p where p.id = p_producto), 'producto')
$$;

create or replace function piefirme_app.ctl_cus_alerta(p_org uuid, p_sucursal uuid, p_tipo text, p_sev text, p_dest text[], p_msg text, p_ref_tipo text, p_ref_id uuid) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid;
begin
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
  values (p_org, p_sucursal, p_tipo, p_sev, p_dest, p_msg, p_ref_tipo, p_ref_id) returning id into v_id;
  return v_id;
end $$;

-- La foto debe ser de quien captura, de esa sucursal, del tipo y del origen que se declara (se registró antes con ctl_evidencia_registrar: objeto en vivo ≤ 15 min).
create or replace function piefirme_app.ctl_cus_evidencia_ok(p_org uuid, p_sucursal uuid, p_evidencia uuid, p_tipo text, p_origen uuid, p_que text) returns void
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if p_evidencia is null or not exists (select 1 from piefirme.ctl_evidencia e where e.id = p_evidencia and e.organizacion_id = p_org and e.sucursal_id = p_sucursal
                                           and e.tipo_origen = p_tipo and e.origen_id = p_origen and e.usuario_id = auth.uid()) then
    raise exception 'falta la foto en vivo de %: se toma con la cámara en el momento y no se acepta de la galería', p_que using errcode = 'PF422';
  end if;
end $$;

-- ───────────────────────────── banderas de catálogo (solo dueño y soporte) ─────────────────────────────
create or replace function piefirme.ctl_producto_atributo_guardar(p_producto uuid, p_requiere_serie boolean, p_requiere_sello boolean, p_alto_valor boolean, p_peso_caja_llena numeric default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); a piefirme.ctl_producto_atributo; v_serie boolean := coalesce(p_requiere_serie, false); v_ant jsonb; v_nuevo jsonb;
begin
  if not exists (select 1 from piefirme.productos p where p.id = p_producto and p.organizacion_id = v_org) then raise exception 'producto no válido' using errcode = 'PF404'; end if;
  if p_peso_caja_llena is not null and p_peso_caja_llena <= 0 then raise exception 'el peso de la caja llena debe ser mayor a cero (en gramos)' using errcode = 'PF422'; end if;
  if coalesce(p_alto_valor, false) then v_serie := true; end if;     -- una pieza de alto valor SIEMPRE se identifica por su número de serie
  select * into a from piefirme.ctl_producto_atributo where organizacion_id = v_org and producto_id = p_producto for update;
  v_ant := case when found then jsonb_build_object('requiere_serie', a.requiere_serie, 'requiere_sello', a.requiere_sello, 'alto_valor', a.alto_valor, 'peso_caja_llena', a.peso_caja_llena) end;
  v_nuevo := jsonb_build_object('requiere_serie', v_serie, 'requiere_sello', coalesce(p_requiere_sello, false), 'alto_valor', coalesce(p_alto_valor, false), 'peso_caja_llena', p_peso_caja_llena);
  if v_ant is not distinct from v_nuevo then return jsonb_build_object('ok', true, 'sin_cambios', true) || v_nuevo; end if;
  perform piefirme_app.ctl_rpc_on();
  if a.id is null then
    insert into piefirme.ctl_producto_atributo (organizacion_id, producto_id, requiere_serie, requiere_sello, alto_valor, peso_caja_llena)
    values (v_org, p_producto, v_serie, coalesce(p_requiere_sello, false), coalesce(p_alto_valor, false), p_peso_caja_llena);
  else
    update piefirme.ctl_producto_atributo set requiere_serie = v_serie, requiere_sello = coalesce(p_requiere_sello, false), alto_valor = coalesce(p_alto_valor, false), peso_caja_llena = p_peso_caja_llena where id = a.id;
  end if;
  insert into piefirme.ctl_producto_atributo_bitacora (organizacion_id, producto_id, anterior, nuevo) values (v_org, p_producto, v_ant, v_nuevo);
  return jsonb_build_object('ok', true) || v_nuevo;
end $$;

-- Catálogo para administrar las banderas (sin precio, costo ni existencia). Dueño, soporte y supervisor lo consultan; quien captura no.
create or replace function piefirme.ctl_productos_control_listar(p_busqueda text default null, p_solo_marcados boolean default false, p_limite integer default 100) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir(null); v_res jsonb; v_b text := nullif(btrim(coalesce(p_busqueda, '')), '');
begin
  if not (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')) then raise exception 'su rol no tiene permiso para esta consulta' using errcode = 'PF403'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.descripcion), '[]'::jsonb) into v_res from (
    select p.id, p.nombre as descripcion, p.codigo_barras, p.sku, coalesce(a.requiere_serie, false) as requiere_serie, coalesce(a.requiere_sello, false) as requiere_sello,
           coalesce(a.alto_valor, false) as alto_valor, a.peso_caja_llena
      from piefirme.productos p
      left join piefirme.ctl_producto_atributo a on a.producto_id = p.id and a.organizacion_id = p.organizacion_id
     where p.organizacion_id = v_org and p.estado in ('activo', 'sin_existencia')
       and (v_b is null or p.nombre ilike '%' || v_b || '%' or p.codigo_barras = v_b or p.sku ilike v_b || '%')
       and (not coalesce(p_solo_marcados, false) or a.requiere_serie or a.requiere_sello or a.alto_valor or a.peso_caja_llena is not null)
     order by p.nombre limit least(greatest(coalesce(p_limite, 100), 1), 500)) x;
  return v_res;
end $$;

-- ───────────────────────────── sello roto: caso + alerta (interno) ─────────────────────────────
create or replace function piefirme_app.ctl_sello_marcar_roto(p_sello uuid, p_origen_tipo text, p_origen_id uuid, p_usuario uuid, p_texto text default null) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s piefirme.ctl_sello%rowtype; v_caso uuid; v_nom text;
begin
  select * into s from piefirme.ctl_sello where id = p_sello for update;
  if not found or s.estado <> 'vigente' then return null; end if;        -- ya se había marcado o ya se reabrió con registro
  perform piefirme_app.ctl_rpc_on();
  v_nom := piefirme_app.ctl_cus_nombre_producto(s.producto_id);
  v_caso := piefirme_app.ctl_abrir_caso(s.organizacion_id, s.sucursal_id, 'sello_roto', p_origen_tipo, p_origen_id, s.producto_id, null, null, p_usuario,
              jsonb_build_object('sello_id', s.id, 'folio_sello', s.folio_sello, 'numero_serie', s.numero_serie, 'producto', v_nom),
              null, null, coalesce(p_texto, 'Caso abierto automáticamente: sello roto sin registro de reapertura'));
  update piefirme.ctl_sello set estado = 'roto_sin_registro', roto_en = now(), caso_id = v_caso where id = s.id;
  perform piefirme_app.ctl_cus_alerta(s.organizacion_id, s.sucursal_id, 'sello_roto_sin_registro', 'alta', array['supervisor', 'dueno'],
    format('%s: el sello %s de «%s»%s está roto y no hay registro de reapertura.', piefirme_app.ctl_cus_nombre_sede(s.sucursal_id), s.folio_sello, v_nom,
           case when s.numero_serie is not null then ' (serie ' || s.numero_serie || ')' else '' end), 'caso', v_caso);
  return v_caso;
end $$;

-- Un conteo que reporta «sello no intacto» sobre un folio conocido y vigente es un sello roto sin registro (nunca debe romper la captura del conteo).
create or replace function piefirme_app.ctl_trg_partida_sello() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_sello uuid;
begin
  if new.sello_intacto is false and piefirme_app.ctl_cus_folio(new.folio_sello) is not null then
    begin
      select s.id into v_sello from piefirme.ctl_sello s
       where s.organizacion_id = new.organizacion_id and s.folio_sello = piefirme_app.ctl_cus_folio(new.folio_sello) and s.sucursal_id = new.sucursal_id and s.estado = 'vigente';
      if v_sello is not null then
        perform piefirme_app.ctl_sello_marcar_roto(v_sello, 'partida_conteo', new.id, new.creado_por, 'Caso abierto automáticamente: el conteo reportó el sello no intacto');
      end if;
    exception when others then
      raise warning 'ctl_trg_partida_sello: %', sqlerrm;   -- el conteo nunca se pierde por esto
    end;
  end if;
  return null;
end $$;
drop trigger if exists t_92_sello on piefirme.ctl_partida_conteo;
create trigger t_92_sello after insert on piefirme.ctl_partida_conteo for each row execute function piefirme_app.ctl_trg_partida_sello();

-- ───────────────────────────── verificación (intacto + peso): interno ─────────────────────────────
create or replace function piefirme_app.ctl_sello_verificar_interno(p_org uuid, p_sucursal uuid, p_id uuid, p_sello uuid, p_folio text, p_producto uuid, p_serie text, p_intacto boolean,
                                                                    p_peso numeric, p_evidencia uuid, p_origen text, p_origen_id uuid, p_hora timestamptz) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare a piefirme.ctl_producto_atributo; v_tol numeric; v_dev numeric; v_dentro boolean; v_res text; v_caso uuid;
begin
  insert into piefirme.ctl_sello_verificacion (id, organizacion_id, sucursal_id, sello_id, folio_sello, producto_id, numero_serie, intacto, peso_medido, evidencia_id, origen, origen_id, hora_cliente)
  values (p_id, p_org, p_sucursal, p_sello, p_folio, p_producto, p_serie, p_intacto, p_peso, p_evidencia, p_origen, p_origen_id, p_hora);
  select * into a from piefirme.ctl_producto_atributo where organizacion_id = p_org and producto_id = p_producto;
  v_tol := piefirme_app.ctl_cfg_num(p_org, 'sello_peso_tolerancia_pct', p_sucursal);
  if p_peso is not null and a.peso_caja_llena is not null and a.peso_caja_llena > 0 then
    v_dev := round(abs(p_peso - a.peso_caja_llena) / a.peso_caja_llena * 100, 2);
    v_dentro := v_dev <= v_tol;
  end if;
  v_res := case when not p_intacto then 'sello_roto'
                when p_peso is null then 'ok'
                when a.peso_caja_llena is null then 'sin_peso_esperado'
                when v_dentro then 'ok' else 'peso_fuera_de_rango' end;
  insert into piefirme.ctl_sello_verificacion_calculo (verificacion_id, organizacion_id, sucursal_id, peso_esperado, desviacion_pct, tolerancia_pct, dentro_tolerancia, resultado)
  values (p_id, p_org, p_sucursal, a.peso_caja_llena, v_dev, v_tol, v_dentro, v_res);
  if not p_intacto and p_sello is not null then
    v_caso := piefirme_app.ctl_sello_marcar_roto(p_sello, 'sello_verificacion', p_id, auth.uid(),
                case when p_origen = 'recepcion' then 'Caso abierto automáticamente: el sello llegó roto en una recepción' else 'Caso abierto automáticamente: la verificación halló el sello roto' end);
  end if;
  if v_res = 'peso_fuera_de_rango' then
    perform piefirme_app.ctl_cus_alerta(p_org, p_sucursal, 'peso_fuera_de_rango', 'alta', array['supervisor', 'dueno'],
      format('%s: la caja de «%s» (sello %s) pesa distinto de lo esperado (%s %% de diferencia, tolerancia %s %%): puede venir vacía o incompleta.',
             piefirme_app.ctl_cus_nombre_sede(p_sucursal), piefirme_app.ctl_cus_nombre_producto(p_producto), p_folio, v_dev, v_tol), 'sello_verificacion', p_id);
  end if;
  return jsonb_build_object('resultado', v_res, 'peso_coincide', v_dentro, 'caso_id', v_caso);
end $$;

-- ───────────────────────────── sellos: colocar, reabrir, verificar ─────────────────────────────
create or replace function piefirme.ctl_sello_colocar(p_id uuid, p_sucursal uuid, p_folio text, p_producto uuid, p_serie text default null, p_evidencia uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_folio text := piefirme_app.ctl_cus_folio(p_folio); v_serie text := nullif(upper(btrim(coalesce(p_serie, ''))), ''); a piefirme.ctl_producto_atributo;
        v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if exists (select 1 from piefirme.ctl_sello s where s.id = v_id and s.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true); end if;
  if v_folio is null or length(v_folio) > 40 then raise exception 'escriba el folio del sello (hasta 40 caracteres)' using errcode = 'PF422'; end if;
  if not exists (select 1 from piefirme.productos p where p.id = p_producto and p.organizacion_id = v_org) then raise exception 'producto no válido' using errcode = 'PF404'; end if;
  select * into a from piefirme.ctl_producto_atributo where organizacion_id = v_org and producto_id = p_producto;
  if not coalesce(a.requiere_sello, false) then
    raise exception 'este producto no lleva sello: en el piloto solo se sellan los productos marcados con «requiere sello» en el catálogo de control' using errcode = 'PF422';
  end if;
  if coalesce(a.requiere_serie, false) and v_serie is null then raise exception 'esta pieza se identifica por su número de serie: capture la serie de la pieza (no del modelo)' using errcode = 'PF422'; end if;
  if exists (select 1 from piefirme.ctl_sello s where s.organizacion_id = v_org and s.folio_sello = v_folio) then raise exception 'el folio de sello % ya está registrado: cada sello es único', v_folio using errcode = 'PF409'; end if;
  if v_serie is not null and exists (select 1 from piefirme.ctl_sello s where s.organizacion_id = v_org and s.producto_id = p_producto and s.numero_serie = v_serie and s.estado = 'vigente') then
    raise exception 'la pieza con serie % ya tiene un sello vigente: si se abrió, regístrelo como reapertura', v_serie using errcode = 'PF409';
  end if;
  if p_evidencia is not null then perform piefirme_app.ctl_cus_evidencia_ok(v_org, p_sucursal, p_evidencia, 'sello', v_id, 'el sello'); end if;
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_sello (id, organizacion_id, sucursal_id, folio_sello, producto_id, numero_serie, colocado_por, origen, evidencia_id)
  values (v_id, v_org, p_sucursal, v_folio, p_producto, v_serie, auth.uid(), 'manual', p_evidencia);
  return jsonb_build_object('ok', true, 'id', v_id, 'folio_sello', v_folio);
end $$;

create or replace function piefirme.ctl_sello_reabrir(p_id uuid, p_sello_anterior uuid, p_motivo text, p_nuevo_folio text, p_evidencia uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); s piefirme.ctl_sello%rowtype; v_folio text := piefirme_app.ctl_cus_folio(p_nuevo_folio); v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if exists (select 1 from piefirme.ctl_sello x where x.id = v_id and x.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true); end if;
  select * into s from piefirme.ctl_sello where id = p_sello_anterior and organizacion_id = v_org for update;
  if not found or not piefirme_app.puede_sede(s.sucursal_id) then raise exception 'sello no encontrado' using errcode = 'PF404'; end if;
  if s.estado not in ('vigente', 'roto_sin_registro') then raise exception 'ese sello ya fue reemplazado: use el sello vigente de la pieza' using errcode = 'PF409'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'indique el motivo de la reapertura (por ejemplo: se abrió para mostrarla a un cliente)' using errcode = 'PF422'; end if;
  if v_folio is null or length(v_folio) > 40 then raise exception 'escriba el folio del sello nuevo' using errcode = 'PF422'; end if;
  if v_folio = s.folio_sello or exists (select 1 from piefirme.ctl_sello x where x.organizacion_id = v_org and x.folio_sello = v_folio) then
    raise exception 'el folio de sello % ya está registrado: la reapertura exige un sello nuevo', v_folio using errcode = 'PF409';
  end if;
  if p_evidencia is not null then perform piefirme_app.ctl_cus_evidencia_ok(v_org, s.sucursal_id, p_evidencia, 'sello', v_id, 'el sello nuevo'); end if;
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_sello set estado = 'reemplazado' where id = s.id;
  insert into piefirme.ctl_sello (id, organizacion_id, sucursal_id, folio_sello, producto_id, numero_serie, colocado_por, sello_anterior_id, motivo_reapertura, origen, evidencia_id)
  values (v_id, v_org, s.sucursal_id, v_folio, s.producto_id, s.numero_serie, auth.uid(), s.id, btrim(p_motivo), 'reapertura', p_evidencia);
  if s.caso_id is not null then   -- el sello ya se había hallado roto: queda constancia en el caso (entrada del sistema, no cuenta como «investigó»)
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.caso_id, null, 'comentario',
      format('Se registró la reapertura del sello %s con motivo «%s»; sello nuevo %s.', s.folio_sello, btrim(p_motivo), v_folio), null, null, jsonb_build_object('sello_nuevo', v_id));
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'folio_sello', v_folio, 'sello_anterior_id', s.id);
end $$;

create or replace function piefirme.ctl_sello_verificar(p_id uuid, p_sucursal uuid, p_folio text, p_intacto boolean, p_peso numeric default null, p_evidencia uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_folio text := piefirme_app.ctl_cus_folio(p_folio); s piefirme.ctl_sello%rowtype; v_id uuid := coalesce(p_id, gen_random_uuid()); v_r jsonb;
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if p_intacto is null then raise exception 'indique si el sello está intacto' using errcode = 'PF422'; end if;
  if p_peso is not null and p_peso <= 0 then raise exception 'el peso debe ser mayor a cero (en gramos)' using errcode = 'PF422'; end if;
  if exists (select 1 from piefirme.ctl_sello_verificacion v where v.id = v_id and v.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true); end if;
  if v_folio is null then raise exception 'escriba o escanee el folio del sello' using errcode = 'PF422'; end if;
  select * into s from piefirme.ctl_sello where organizacion_id = v_org and folio_sello = v_folio for update;
  if not found or s.sucursal_id <> p_sucursal then
    return jsonb_build_object('ok', false, 'error', 'sello_desconocido', 'mensaje', 'Ese folio de sello no está registrado en esta sucursal. Revise el folio de la pieza o avise a su supervisor.');
  end if;
  if s.estado = 'reemplazado' then
    return jsonb_build_object('ok', false, 'error', 'sello_reemplazado', 'mensaje', 'Ese sello ya no es el vigente de la pieza (se reabrió y se reemplazó). Revise el folio del sello que trae la pieza.');
  end if;
  -- el peso se puede probar a mano para adivinar el esperado: se limitan los intentos por persona y folio
  if (select count(*) from piefirme.ctl_sello_verificacion v where v.organizacion_id = v_org and v.folio_sello = v_folio and v.creado_por = auth.uid() and v.creado_en > now() - interval '1 hour') >= 5 then
    raise exception 'demasiadas verificaciones de este sello en la última hora: avise a su supervisor' using errcode = 'PF429';
  end if;
  if p_evidencia is not null then perform piefirme_app.ctl_cus_evidencia_ok(v_org, p_sucursal, p_evidencia, 'sello', v_id, 'el sello'); end if;
  perform piefirme_app.ctl_rpc_on();
  v_r := piefirme_app.ctl_sello_verificar_interno(v_org, p_sucursal, v_id, s.id, v_folio, s.producto_id, s.numero_serie, p_intacto, p_peso, p_evidencia, 'verificacion', v_id, p_hora_cliente);
  -- a quien captura solo se le dice si el peso coincide (para que sepa si debe abrir la caja), nunca el peso esperado ni la desviación
  return jsonb_build_object('ok', true, 'id', v_id, 'peso_coincide', v_r -> 'peso_coincide')
         || case when piefirme_app.ctl_puede('ver_directo') then jsonb_build_object('resultado', v_r ->> 'resultado') else '{}'::jsonb end;
end $$;

-- ───────────────────────────── recepción con responsiva (F5.1) ─────────────────────────────
create or replace function piefirme.ctl_recepcion_registrar(p_id uuid, p_sucursal uuid, p_documento text, p_lineas jsonb, p_pin text, p_nota text default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); l jsonb; v_n integer; a piefirme.ctl_producto_atributo; v_pin jsonb; s piefirme.ctl_sello%rowtype; v_prod uuid; v_folio text; v_nuevo text; v_serie text;
        v_ver text; v_ev uuid; v_peso numeric; v_sello uuid; v_pieza uuid; v_inc integer := 0; v_firma timestamptz; v_ev_vistas uuid[] := '{}'; v_r jsonb; v_lin uuid; v_resumen jsonb := '[]'::jsonb; v_nvid uuid;
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

-- ───────────────────────────── privilegios de ejecución: nada para anon; las RPC solo para authenticated ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_cus_sede', 'ctl_cus_folio', 'ctl_cus_nombre_sede', 'ctl_cus_nombre_producto', 'ctl_cus_alerta', 'ctl_cus_evidencia_ok',
                  'ctl_producto_atributo_guardar', 'ctl_productos_control_listar', 'ctl_sello_marcar_roto', 'ctl_trg_partida_sello', 'ctl_sello_verificar_interno',
                  'ctl_sello_colocar', 'ctl_sello_reabrir', 'ctl_sello_verificar', 'ctl_recepcion_registrar') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
