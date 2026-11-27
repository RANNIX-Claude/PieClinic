-- 324 · Pedidos especiales · pedido_proveedores() ofrece también los proveedores marcados como sintéticos (en QA todos lo son); corrige 321.
create or replace function piefirme.pedido_proveedores()
returns jsonb language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if v_org is null or piefirme_app.rol()::text not in ('administrador', 'recepcion', 'podologo', 'supervisor') then raise exception 'sin permiso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'categoria', p.categoria, 'tipos', p.pedidos_tipos,
            'anticipo_pct', coalesce(p.anticipo_pct, piefirme_app.param_num(v_org, 'pedido_anticipo_pct', 50)), 'whatsapp', coalesce(p.whatsapp_grupo, p.whatsapp_contacto) is not null) order by p.nombre)
     from piefirme.proveedores p where p.organizacion_id = v_org and p.activo), '[]'::jsonb);
end $$;


revoke all on function piefirme.pedido_proveedores() from public, anon;
grant execute on function piefirme.pedido_proveedores() to authenticated, service_role;
