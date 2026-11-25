-- 130 · Hallazgo del video caja-facturar (lote F): Recepción tiene el permiso facturas.timbrar, pero timbrar_factura_simulado
-- corría con los permisos de quien llama y pac_configuracion solo la lee el Administrador, así que a Recepción le respondía
-- «el PAC no está en modo simulado» aunque lo estuviera. La función pasa a SECURITY DEFINER con el mismo control de rol, añade
-- la verificación de la clínica (antes la daba el RLS) y trata «sin configuración» como simulado, igual que el adaptador del front.
create or replace function piefirme.timbrar_factura_simulado(p_factura uuid) returns uuid
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.facturas%rowtype; v_uuid uuid := gen_random_uuid(); v_modo text;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  select * into f from piefirme.facturas where id = p_factura and organizacion_id = piefirme_app.org_id() for update;
  if not found or f.estado <> 'borrador' then raise exception 'la factura no está en borrador' using errcode = 'PF409'; end if;
  select modo into v_modo from piefirme.pac_configuracion where organizacion_id = f.organizacion_id limit 1;
  if v_modo is not null and v_modo not in ('simulado', 'no_configurado') then
    raise exception 'el PAC no está en modo simulado: el timbrado real lo hace la función de servidor' using errcode = 'PF409';
  end if;
  perform set_config('app.pac_simulado', 'on', true);
  update piefirme.facturas set estado = 'vigente', uuid = v_uuid, pac_modo = 'simulado', pac_respuesta = jsonb_build_object('sintetico', true) where id = p_factura;
  perform set_config('app.pac_simulado', 'off', true);
  return v_uuid;
end $$;
revoke all on function piefirme.timbrar_factura_simulado(uuid) from public, anon;
grant execute on function piefirme.timbrar_factura_simulado(uuid) to authenticated;
