-- 160 · Implementación Pie Clinic · Conteo inicial con PRECIO DE VENTA en el mismo paso de captura.
--   · producto_provisional_crear gana p_precio: el producto desconocido se da de alta con nombre, cantidad y precio de lista (solo Administración puede poner precio;
--     el precio queda como versión en piefirme.precios, que es el histórico que muestra Catálogo y precios). Sin precio sigue siendo válido (se completa después).
--   · conteo_precio_fijar: para un producto ya conocido, fija/cambia el precio de lista al contarlo. Nunca pisa un precio vigente distinto sin confirmación
--     explícita (p_confirmar) y siempre crea una versión nueva (el anterior queda cerrado en el histórico).
-- ADITIVA salvo el reemplazo de la firma de producto_provisional_crear (se elimina la de 6 parámetros para evitar ambigüedad en PostgREST). Depende de 078.
set search_path = piefirme, piefirme_app, extensions;

drop function if exists piefirme.producto_provisional_crear(uuid, uuid, text, text, numeric, text);

create or replace function piefirme.producto_provisional_crear(p_conteo uuid, p_zona uuid, p_codigo text, p_nombre text, p_cantidad numeric, p_foto_path text default null, p_precio numeric default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; z piefirme.conteo_zonas%rowtype; v_cod text := btrim(coalesce(p_codigo, '')); v_id uuid;
begin
  c := piefirme_app.conteo_acceso(p_conteo);
  select * into z from piefirme.conteo_zonas where id = p_zona and conteo_id = p_conteo;
  if not found then raise exception 'zona inexistente' using errcode = 'PF404'; end if;
  if z.estado <> 'abierta' then raise exception 'la zona «%» está cerrada', z.nombre using errcode = 'PF409'; end if;
  if v_cod = '' then raise exception 'falta el código' using errcode = '22023'; end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'escribe el nombre del producto' using errcode = '22023'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'la cantidad debe ser cero o más' using errcode = '22023'; end if;
  if p_precio is not null and p_precio <= 0 then raise exception 'el precio de venta debe ser mayor que cero' using errcode = '22023'; end if;
  if p_precio is not null and piefirme_app.rol()::text <> 'administrador' then raise exception 'solo Administración puede poner el precio de venta' using errcode = '42501'; end if;
  if exists (select 1 from piefirme.productos where organizacion_id = c.organizacion_id and (codigo_barras = v_cod or sku = v_cod or sku = 'PROV-' || v_cod)) then
    raise exception 'ese código ya existe en el catálogo; vuelve a escanearlo' using errcode = 'PF409';
  end if;
  insert into piefirme.productos (organizacion_id, sku, codigo_barras, nombre, categoria, tipo, iva_tipo, estado, origen,
                                  provisional_conteo_id, provisional_por, provisional_en, provisional_foto_path)
  values (c.organizacion_id, 'PROV-' || v_cod, v_cod, btrim(p_nombre), 'Por clasificar', 'venta', 'exento', 'provisional', 'conteo',
          p_conteo, auth.uid(), now(), nullif(btrim(coalesce(p_foto_path, '')), ''))
  returning id into v_id;
  insert into piefirme.conteo_capturas (organizacion_id, sede_id, conteo_id, zona_id, producto_id, cantidad, metodo)
  values (c.organizacion_id, c.sede_id, p_conteo, p_zona, v_id, p_cantidad, 'manual');
  if p_precio is not null then
    insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio, motivo)
    values (c.organizacion_id, 'producto', v_id, piefirme_app.hoy_org(c.organizacion_id), p_precio, 'fijo', 'Alta inicial (conteo inicial)');
  end if;
  return jsonb_build_object('id', v_id, 'nombre', btrim(p_nombre), 'sku', 'PROV-' || v_cod, 'codigo_barras', v_cod, 'estado', 'provisional', 'cantidad', p_cantidad, 'precio', p_precio);
end $$;

-- Fija el precio de lista de un producto durante el conteo. Devuelve {cambio, anterior, actual} o {requiere_confirmacion: true, anterior} si ya hay un precio distinto.
create or replace function piefirme.conteo_precio_fijar(p_conteo uuid, p_producto uuid, p_precio numeric, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.conteos_fisicos%rowtype; v_ant piefirme.precios%rowtype; v_hoy date;
begin
  c := piefirme_app.conteo_acceso(p_conteo, array['administrador']);
  if p_precio is null or p_precio <= 0 then raise exception 'el precio de venta debe ser mayor que cero' using errcode = '22023'; end if;
  if not exists (select 1 from piefirme.productos where id = p_producto and organizacion_id = c.organizacion_id) then raise exception 'producto inexistente' using errcode = 'PF404'; end if;
  v_hoy := piefirme_app.hoy_org(c.organizacion_id);
  select * into v_ant from piefirme.precios
   where producto_id = p_producto and item_tipo = 'producto' and sede_id is null and vigente_desde <= v_hoy and (vigente_hasta is null or vigente_hasta >= v_hoy)
   order by vigente_desde desc limit 1;
  if found and v_ant.precio = p_precio then return jsonb_build_object('cambio', false, 'anterior', v_ant.precio, 'actual', p_precio); end if;
  if found and not p_confirmar then return jsonb_build_object('requiere_confirmacion', true, 'anterior', v_ant.precio, 'actual', p_precio); end if;
  if found and v_ant.vigente_desde >= v_hoy then
    raise exception 'el precio vigente se fijó hoy; para corregirlo usa Catálogo y precios (queda en el histórico)' using errcode = 'PF409';
  end if;
  insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio, motivo)
  values (c.organizacion_id, 'producto', p_producto, v_hoy, p_precio, 'fijo', case when found then 'Ajuste (conteo inicial)' else 'Alta inicial (conteo inicial)' end);
  return jsonb_build_object('cambio', true, 'anterior', case when found then v_ant.precio end, 'actual', p_precio);
end $$;

revoke all on function piefirme.producto_provisional_crear(uuid, uuid, text, text, numeric, text, numeric), piefirme.conteo_precio_fijar(uuid, uuid, numeric, boolean) from public, anon;
grant execute on function piefirme.producto_provisional_crear(uuid, uuid, text, text, numeric, text, numeric), piefirme.conteo_precio_fijar(uuid, uuid, numeric, boolean) to authenticated;
