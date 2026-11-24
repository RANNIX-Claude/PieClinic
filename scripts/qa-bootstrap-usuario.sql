-- qa-bootstrap-usuario.sql · Alta del primer administrador de QA de Pie Firme (idempotente).
-- NO crea el usuario de auth: ese lo da de alta el flujo de GoTrue (invitación / admin API / panel) para no escribir en auth.users a mano.
-- Antes de ejecutarlo, sustituir {{ADMIN_USER_ID}} por el id (uuid) del usuario ya creado en auth.users, y {{ADMIN_EMAIL}} por su correo.
-- Qué hace (solo dentro del esquema piefirme; no toca public, comercio_cdmx ni auth):
--   1) organización de ejemplo 00000000-0000-0000-0000-00000000c0de (la misma que usan las semillas; si ya existe no la cambia)
--   2) perfil administrador ligado a ese usuario, con sedes vacío = todas las sedes
-- Puede correrse antes o después de las semillas (D_01 y A_01 respetan lo existente). Se ejecuta como postgres/service_role.
do $$
declare
  v_admin uuid;
  v_org   constant uuid := '00000000-0000-0000-0000-00000000c0de';
begin
  if '{{ADMIN_USER_ID}}' like '{{%' then raise exception 'Falta sustituir {{ADMIN_USER_ID}} por el uuid del usuario de auth'; end if;
  v_admin := '{{ADMIN_USER_ID}}'::uuid;
  if not exists (select 1 from auth.users where id = v_admin) then raise exception 'El usuario % no existe en auth.users: créalo primero', v_admin; end if;

  insert into piefirme.organizaciones (id, nombre, razon_social, rfc, regimen_fiscal, codigo_postal, plan, estado)
  values (v_org, 'Pie Clinic (sintético)', 'Pie Clinic SA de CV (sintético)', 'PCL000000AA0', '601', '56600', 'por_clinica', 'activa')
  on conflict (id) do nothing;

  insert into piefirme.perfiles (id, organizacion_id, rol, nombre, apellidos, email, activo, sedes)
  values (v_admin, v_org, 'administrador', 'Administrador', 'QA', '{{ADMIN_EMAIL}}', true, '{}')
  on conflict (id) do update set organizacion_id = excluded.organizacion_id, rol = 'administrador', activo = true;
end $$;
