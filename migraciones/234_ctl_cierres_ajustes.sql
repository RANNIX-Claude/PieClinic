-- 234 · Control y Auditoría · ETAPA 4 · ajustes tras las pruebas y lecturas mínimas para quien captura.
--   · ctl_foto_lado_largo: quien captura necesita el lado largo configurado para comprimir la foto en el dispositivo (ctl_config_efectiva es solo de dueño/soporte).
-- Depende de: 200–206, 230–233.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_foto_lado_largo(p_sucursal uuid default null) returns integer
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar');
begin
  if p_sucursal is not null and (not exists (select 1 from piefirme.sedes s where s.id = p_sucursal and s.organizacion_id = v_org) or not piefirme_app.puede_sede(p_sucursal)) then
    raise exception 'sucursal no permitida' using errcode = 'PF403';
  end if;
  return (piefirme_app.ctl_config_en(v_org, 'foto_lado_largo_px', p_sucursal, now()) #>> '{}')::integer;
end $$;
revoke all on function piefirme.ctl_foto_lado_largo(uuid) from public, anon;
grant execute on function piefirme.ctl_foto_lado_largo(uuid) to authenticated;
