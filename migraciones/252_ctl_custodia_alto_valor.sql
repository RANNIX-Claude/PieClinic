-- 252 · Control y Auditoría · ETAPA 7 · CADENA DE CUSTODIA (3/4): piezas de alto valor (F5.3) y custodia del relevo.
--   · ctl_pieza_registrar: alta de una pieza con SU número de serie (por pieza, no por modelo; una serie no se repite dentro de la clínica).
--   · ctl_custodia_estado / ctl_custodia_incluir_alto_valor: la custodia del relevo respeta el tope DURO de 30 activos por sucursal (trigger de la Etapa 0);
--     aquí se EXPLICA, no se oculta: nunca se rechaza en silencio.
--   · Venta de pieza de alto valor → alerta inmediata al dueño (pieza, serie, sucursal, precio). El origen todavía no emite el evento `venta_registrada`:
--     la detección es por POLEO (piefirme_app.ctl_alto_valor_evaluar, invocable por scripts/evaluar-ventas-alto-valor.mjs o un planificador) y, cuando el origen
--     emita el evento, basta llamar piefirme_app.ctl_alto_valor_procesar(org, venta). Ambas son idempotentes por línea de venta (ctl_venta_alto_valor).
-- Depende de: 200–206, 230–235, 250, 251.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_pieza_registrar(p_id uuid, p_sucursal uuid, p_producto uuid, p_serie text, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_serie text := nullif(upper(btrim(coalesce(p_serie, ''))), ''); a piefirme.ctl_producto_atributo; z piefirme.ctl_pieza; v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if exists (select 1 from piefirme.ctl_pieza x where x.id = v_id and x.organizacion_id = v_org) then return jsonb_build_object('ok', true, 'id', v_id, 'idempotente', true); end if;
  if not exists (select 1 from piefirme.productos p where p.id = p_producto and p.organizacion_id = v_org) then raise exception 'producto no válido' using errcode = 'PF404'; end if;
  select * into a from piefirme.ctl_producto_atributo where organizacion_id = v_org and producto_id = p_producto;
  if not coalesce(a.requiere_serie, false) then
    raise exception '«%» no se controla por número de serie: el dueño lo marca en Catálogo de control (requiere serie o alto valor)', piefirme_app.ctl_cus_nombre_producto(p_producto) using errcode = 'PF422';
  end if;
  if v_serie is null or length(v_serie) < 3 or length(v_serie) > 60 then raise exception 'capture el número de serie de ESTA pieza (de 3 a 60 caracteres): la serie es por pieza, no por modelo' using errcode = 'PF422'; end if;
  select * into z from piefirme.ctl_pieza where organizacion_id = v_org and producto_id = p_producto and numero_serie = v_serie;
  if found then
    raise exception 'la serie % de «%» ya está registrada (%): una serie identifica a una sola pieza', v_serie, piefirme_app.ctl_cus_nombre_producto(p_producto),
      case when z.estado = 'en_sucursal' then 'en ' || piefirme_app.ctl_cus_nombre_sede(z.sucursal_id) else replace(z.estado, '_', ' ') end using errcode = 'PF409';
  end if;
  perform piefirme_app.ctl_rpc_on();
  insert into piefirme.ctl_pieza (id, organizacion_id, sucursal_id, producto_id, numero_serie, origen) values (v_id, v_org, p_sucursal, p_producto, v_serie, 'manual');
  return jsonb_build_object('ok', true, 'id', v_id, 'numero_serie', v_serie);
end $$;

-- ───────────────────────────── custodia del relevo: estado y explicación del tope ─────────────────────────────
create or replace function piefirme.ctl_custodia_estado(p_sucursal uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_n integer; v_ver boolean := piefirme_app.ctl_puede('ver_directo'); v_prods jsonb;
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', c.producto_id, 'descripcion', p.nombre, 'codigo_barras', p.codigo_barras,
           'alto_valor', coalesce(a.alto_valor, false), 'requiere_serie', coalesce(a.requiere_serie, false), 'requiere_sello', coalesce(a.requiere_sello, false)
           ) || case when v_ver then jsonb_build_object('piezas_en_sucursal', (select count(*) from piefirme.ctl_pieza z where z.organizacion_id = v_org and z.sucursal_id = p_sucursal and z.producto_id = c.producto_id and z.estado = 'en_sucursal')) else '{}'::jsonb end
           order by p.nombre), '[]'::jsonb), count(*)::integer
    into v_prods, v_n
    from piefirme.ctl_producto_custodia c
    join piefirme.productos p on p.id = c.producto_id and p.organizacion_id = c.organizacion_id
    left join piefirme.ctl_producto_atributo a on a.producto_id = c.producto_id and a.organizacion_id = c.organizacion_id
   where c.organizacion_id = v_org and c.sucursal_id = p_sucursal and c.activo;
  return jsonb_build_object('sucursal_id', p_sucursal, 'tope', 30, 'activos', v_n, 'restantes', greatest(0, 30 - v_n), 'lleno', v_n >= 30,
    'explicacion', 'El tope es de 30 productos en custodia por sucursal y lo valida la base de datos. Con más piezas el relevo de turno pasa de dos minutos a veinte, el personal termina capturando sin contar y eso genera evidencia falsa, que es peor que no tener control. Para agregar otro producto, retire uno antes.',
    'productos', v_prods);
end $$;

-- Mete a la custodia los productos de alto valor que tienen piezas en la sucursal, hasta el tope; los que no caben se devuelven con la explicación (sin lanzar error).
create or replace function piefirme.ctl_custodia_incluir_alto_valor(p_sucursal uuid) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('configurar'); r record; v_n integer; v_ok jsonb := '[]'::jsonb; v_no jsonb := '[]'::jsonb;
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  for r in
    select p.id, p.nombre from piefirme.productos p join piefirme.ctl_producto_atributo a on a.producto_id = p.id and a.organizacion_id = p.organizacion_id and a.alto_valor
     where p.organizacion_id = v_org
       and exists (select 1 from piefirme.ctl_pieza z where z.organizacion_id = v_org and z.sucursal_id = p_sucursal and z.producto_id = p.id and z.estado = 'en_sucursal')
       and not exists (select 1 from piefirme.ctl_producto_custodia c where c.organizacion_id = v_org and c.sucursal_id = p_sucursal and c.producto_id = p.id and c.activo)
     order by p.nombre
  loop
    select count(*) into v_n from piefirme.ctl_producto_custodia c where c.organizacion_id = v_org and c.sucursal_id = p_sucursal and c.activo;
    if v_n >= 30 then
      v_no := v_no || jsonb_build_array(jsonb_build_object('producto_id', r.id, 'descripcion', r.nombre));
    else
      perform piefirme.ctl_custodia_activar(p_sucursal, r.id);
      v_ok := v_ok || jsonb_build_array(jsonb_build_object('producto_id', r.id, 'descripcion', r.nombre));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'agregados', v_ok, 'omitidos', v_no,
    'mensaje', case when jsonb_array_length(v_no) > 0 then 'No caben todos: el tope duro es de 30 productos en custodia por sucursal (con más, el relevo se captura sin contar). Retire productos de menor riesgo para dar lugar a los de alto valor.' end);
end $$;

-- ───────────────────────────── venta de una pieza de alto valor ─────────────────────────────
-- Procesa una venta cobrada: por cada línea de producto marcado alto_valor, registra la línea (una sola vez) y alerta al dueño.
-- La serie vendida se determina solo si es inequívoca (una sola pieza en sucursal y una unidad vendida); si no, se listan las candidatas.
create or replace function piefirme_app.ctl_alto_valor_procesar(p_org uuid, p_venta uuid) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare r record; v_cands text[]; v_serie text; v_reg uuid; v_alerta uuid; v_precio numeric; v_n integer := 0; v_texto text;
begin
  perform piefirme_app.ctl_rpc_on();
  for r in
    select vl.id as linea_id, vl.producto_id, vl.cantidad, vl.importe, ve.id as venta_id, ve.folio, ve.sede_id, coalesce(ve.cobrada_en, ve.created_at) as fecha
      from piefirme.venta_lineas vl
      join piefirme.ventas ve on ve.id = vl.venta_id
      join piefirme.ctl_producto_atributo a on a.organizacion_id = ve.organizacion_id and a.producto_id = vl.producto_id and a.alto_valor
     where ve.id = p_venta and ve.organizacion_id = p_org and ve.estado in ('cobrada', 'por_facturar', 'facturada') and vl.tipo = 'producto'
     order by vl.orden, vl.id
  loop
    v_precio := round(r.importe / nullif(r.cantidad, 0), 2);
    select coalesce(array_agg(z.numero_serie order by z.numero_serie), '{}') into v_cands from piefirme.ctl_pieza z
     where z.organizacion_id = p_org and z.sucursal_id = r.sede_id and z.producto_id = r.producto_id and z.estado = 'en_sucursal';
    v_serie := case when cardinality(v_cands) = 1 and r.cantidad = 1 then v_cands[1] end;
    perform pg_advisory_xact_lock(hashtextextended('ctl_av:' || r.linea_id::text, 0));
    continue when exists (select 1 from piefirme.ctl_venta_alto_valor x where x.organizacion_id = p_org and x.linea_id = r.linea_id);   -- ya procesada
    v_reg := gen_random_uuid();
    v_n := v_n + 1;
    if v_serie is not null then
      update piefirme.ctl_pieza set estado = 'vendida', vendida_en = r.fecha, venta_id = r.venta_id where organizacion_id = p_org and producto_id = r.producto_id and numero_serie = v_serie and estado = 'en_sucursal';
    end if;
    v_texto := case when v_serie is not null then 'serie ' || v_serie
                    when cardinality(v_cands) > 1 then 'serie sin determinar (una de: ' || array_to_string(v_cands, ', ') || ')'
                    else 'sin serie registrada: la pieza vendida no estaba dada de alta' end;
    v_alerta := piefirme_app.ctl_cus_alerta(p_org, r.sede_id, 'venta_alto_valor', 'critica', array['dueno'],
      format('Venta de pieza de alto valor en %s: «%s», %s, a $%s%s (ticket %s).', piefirme_app.ctl_cus_nombre_sede(r.sede_id), piefirme_app.ctl_cus_nombre_producto(r.producto_id), v_texto,
             to_char(v_precio, 'FM999,999,990.00'), case when r.cantidad > 1 then ' c/u, ' || r.cantidad || ' piezas' else '' end, coalesce(r.folio, 's/f')),
      'venta_alto_valor', v_reg);
    insert into piefirme.ctl_venta_alto_valor (id, organizacion_id, sucursal_id, venta_id, linea_id, producto_id, numero_serie, candidatas, precio, ticket, vendida_en, alerta_id)
    values (v_reg, p_org, r.sede_id, r.venta_id, r.linea_id, r.producto_id, v_serie, to_jsonb(case when v_serie is null then v_cands else '{}'::text[] end), coalesce(v_precio, 0), r.folio, r.fecha, v_alerta);
  end loop;
  return v_n;
end $$;

-- Poleo: evalúa las ventas cobradas desde `p_desde` (72 h por omisión) que tengan líneas de alto valor aún no evaluadas.
create or replace function piefirme_app.ctl_alto_valor_evaluar(p_org uuid, p_desde timestamptz default null) returns integer
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v record; v_n integer := 0;
begin
  for v in
    select distinct ve.id from piefirme.ventas ve
      join piefirme.venta_lineas vl on vl.venta_id = ve.id and vl.tipo = 'producto'
      join piefirme.ctl_producto_atributo a on a.organizacion_id = ve.organizacion_id and a.producto_id = vl.producto_id and a.alto_valor
     where ve.organizacion_id = p_org and ve.estado in ('cobrada', 'por_facturar', 'facturada')
       and coalesce(ve.cobrada_en, ve.created_at) >= coalesce(p_desde, now() - interval '72 hours')
       and not exists (select 1 from piefirme.ctl_venta_alto_valor x where x.organizacion_id = p_org and x.linea_id = vl.id)
  loop
    v_n := v_n + piefirme_app.ctl_alto_valor_procesar(p_org, v.id);
  end loop;
  return v_n;
end $$;

-- Botón «Revisar ventas ahora» (dueño y supervisor): corre el mismo poleo para la clínica del usuario.
create or replace function piefirme.ctl_alto_valor_revisar(p_horas integer default 72) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); v_n integer;
begin
  v_n := piefirme_app.ctl_alto_valor_evaluar(v_org, now() - make_interval(hours => least(greatest(coalesce(p_horas, 72), 1), 720)));
  return jsonb_build_object('ok', true, 'ventas_nuevas', v_n);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_pieza_registrar', 'ctl_custodia_estado', 'ctl_custodia_incluir_alto_valor', 'ctl_alto_valor_procesar',
                  'ctl_alto_valor_evaluar', 'ctl_alto_valor_revisar') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
