-- 161 · Implementación Pie Clinic · Completar un provisional respeta el precio de venta que ya se puso al contarlo (migración 160).
-- Antes siempre insertaba una versión de precio; si el producto ya traía precio vigente de hoy, chocaba con la vigencia. Ahora: si el precio vigente es el mismo no
-- duplica la versión; si es distinto y se fijó hoy pide corregirlo en Catálogo y precios; si es de otro día crea la versión nueva. Mismo resto que 078.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.producto_provisional_completar(p_producto uuid, p_nombre text, p_marca text, p_categoria text, p_costo numeric, p_precio numeric, p_duplicado_de uuid default null)
returns text language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.productos%rowtype; k record; v_otro uuid; v_hoy date; v_ant piefirme.precios%rowtype; v_hay boolean;
begin
  if piefirme_app.rol()::text not in ('administrador', 'supervisor') then raise exception 'solo Administración o la supervisión completan productos provisionales' using errcode = '42501'; end if;
  select * into p from piefirme.productos where id = p_producto and organizacion_id = piefirme_app.org_id();
  if not found then raise exception 'producto inexistente' using errcode = 'PF404'; end if;
  if p.estado <> 'provisional' then raise exception 'el producto ya no es provisional' using errcode = 'PF409'; end if;
  if p_duplicado_de is not null then
    if p_duplicado_de = p_producto or not exists (select 1 from piefirme.productos where id = p_duplicado_de and organizacion_id = p.organizacion_id and estado <> 'provisional') then
      raise exception 'elige el producto del catálogo del que es duplicado' using errcode = '22023';
    end if;
    for k in select cp.* from piefirme.conteo_capturas cp join piefirme.conteos_fisicos cf on cf.id = cp.conteo_id
              where cp.producto_id = p_producto and cf.estado in ('borrador', 'capturado') loop
      select id into v_otro from piefirme.conteo_capturas where zona_id = k.zona_id and producto_id = p_duplicado_de;
      if v_otro is not null then
        update piefirme.conteo_capturas set cantidad = cantidad + k.cantidad, actualizado_por = auth.uid(), actualizado_en = now() where id = v_otro;
        delete from piefirme.conteo_capturas where id = k.id;
      else
        update piefirme.conteo_capturas set producto_id = p_duplicado_de, actualizado_por = auth.uid(), actualizado_en = now() where id = k.id;
      end if;
    end loop;
    update piefirme.productos set estado = 'pausado', provisional_nota = 'Duplicado de ' || (select sku from piefirme.productos where id = p_duplicado_de) where id = p_producto;
    return 'duplicado';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) = 0 then raise exception 'falta el nombre' using errcode = '22023'; end if;
  if p_categoria is null or length(btrim(p_categoria)) = 0 or btrim(p_categoria) = 'Por clasificar' then raise exception 'elige la categoría' using errcode = '22023'; end if;
  if p_precio is null or p_precio <= 0 then raise exception 'falta el precio de lista' using errcode = '22023'; end if;
  v_hoy := piefirme_app.hoy_org(p.organizacion_id);
  select * into v_ant from piefirme.precios where producto_id = p_producto and item_tipo = 'producto' and sede_id is null
     and vigente_desde <= v_hoy and (vigente_hasta is null or vigente_hasta >= v_hoy) order by vigente_desde desc limit 1;
  v_hay := found;
  if v_hay and v_ant.precio <> p_precio and v_ant.vigente_desde >= v_hoy then
    raise exception 'el producto ya tiene precio de venta de % fijado hoy; para cambiarlo usa Catálogo y precios', v_ant.precio using errcode = 'PF409';
  end if;
  update piefirme.productos set nombre = btrim(p_nombre), marca = nullif(btrim(coalesce(p_marca, '')), ''), categoria = btrim(p_categoria),
         costo_promedio = greatest(coalesce(p_costo, 0), 0), estado = 'activo' where id = p_producto;
  if not v_hay or v_ant.precio <> p_precio then
    insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio, motivo)
    values (p.organizacion_id, 'producto', p_producto, v_hoy, p_precio, 'fijo', 'Alta desde conteo inicial (producto provisional)');
  end if;
  return 'completado';
end $$;
revoke all on function piefirme.producto_provisional_completar(uuid, text, text, text, numeric, numeric, uuid) from public, anon;
grant execute on function piefirme.producto_provisional_completar(uuid, text, text, text, numeric, numeric, uuid) to authenticated;
