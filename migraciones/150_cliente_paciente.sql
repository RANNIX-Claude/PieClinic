-- 150 · Cliente → Paciente (decidido por el dueño 2026-11-25)
-- Todo paciente es un cliente, pero no todo cliente es paciente: hay quien solo compra una pomada o una plantilla.
-- Un CLIENTE se da de alta con nombre y teléfono (p. ej. desde la caja), no tiene expediente ni número de expediente.
-- Al darlo de alta como PACIENTE se conserva el mismo registro (misma id): su historial de compras queda asociado.
-- No hay vuelta atrás (un paciente no regresa a cliente: tiene expediente clínico).

alter table piefirme.pacientes add column if not exists tipo_registro text not null default 'paciente';
alter table piefirme.pacientes drop constraint if exists pacientes_tipo_registro_check;
alter table piefirme.pacientes add constraint pacientes_tipo_registro_check check (tipo_registro in ('cliente', 'paciente'));
alter table piefirme.pacientes drop constraint if exists pacientes_cliente_rapido_check;
alter table piefirme.pacientes add constraint pacientes_cliente_rapido_check check (tipo_registro = 'paciente' or alta_rapida);

create or replace function piefirme_app.paciente_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dup uuid;
begin
  new.nombre := btrim(new.nombre);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.telefono_celular := nullif(regexp_replace(coalesce(new.telefono_celular, ''), '[^0-9+]', '', 'g'), '');
  new.telefono_fijo := nullif(regexp_replace(coalesce(new.telefono_fijo, ''), '[^0-9+]', '', 'g'), '');
  new.curp := nullif(upper(btrim(coalesce(new.curp, ''))), '');
  if new.sede_registro_id is not null and not exists (select 1 from piefirme.sedes s where s.id = new.sede_registro_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'La sede de registro no pertenece a la clínica' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.tipo_registro = 'paciente' and new.tipo_registro = 'cliente' then
    raise exception 'Un paciente con expediente no puede volver a ser solo cliente' using errcode = 'P0001';
  end if;
  -- número de expediente: consecutivo por sede, o el número vigente capturado a mano (N-08). Un cliente no tiene expediente.
  if tg_op = 'INSERT' then
    if new.tipo_registro = 'cliente' then
      new.numero_expediente := null; new.numero_expediente_manual := false;
    elsif new.numero_expediente is null or btrim(new.numero_expediente) = '' then
      new.numero_expediente := piefirme_app.siguiente_folio_clinico(new.sede_registro_id, 'EXP');
      new.numero_expediente_manual := false;
    else
      new.numero_expediente_manual := true;
    end if;
  elsif old.tipo_registro = 'cliente' and new.tipo_registro = 'paciente' then
    -- alta como paciente: nace su expediente
    if new.numero_expediente is null or btrim(new.numero_expediente) = '' then
      new.numero_expediente := piefirme_app.siguiente_folio_clinico(new.sede_registro_id, 'EXP');
      new.numero_expediente_manual := false;
    else
      new.numero_expediente_manual := true;
    end if;
  elsif new.numero_expediente is distinct from old.numero_expediente and not piefirme_app.es_admin() and auth.uid() is not null then
    raise exception 'Solo el administrador cambia el número de expediente' using errcode = 'P0001';
  end if;
  -- P-006: coincidencia por nombre completo + fecha de nacimiento bloquea el alta (el teléfono compartido solo avisa)
  if new.fecha_nacimiento is not null and new.apellido_paterno is not null and new.estado <> 'fusionado' and not new.homonimo_confirmado
     and (tg_op = 'INSERT' or new.nombre is distinct from old.nombre or new.apellido_paterno is distinct from old.apellido_paterno
          or new.apellido_materno is distinct from old.apellido_materno or new.fecha_nacimiento is distinct from old.fecha_nacimiento) then
    select p.id into v_dup from piefirme.pacientes p
     where p.organizacion_id = new.organizacion_id and p.id <> new.id and p.estado <> 'fusionado'
       and lower(btrim(p.nombre)) = lower(new.nombre)
       and lower(btrim(coalesce(p.apellido_paterno, ''))) = lower(btrim(new.apellido_paterno))
       and lower(btrim(coalesce(p.apellido_materno, ''))) = lower(btrim(coalesce(new.apellido_materno, '')))
       and p.fecha_nacimiento = new.fecha_nacimiento
     limit 1;
    if v_dup is not null then
      raise exception 'posible_duplicado' using errcode = 'P0001', detail = v_dup::text,
        hint = 'Abra el expediente existente o confirme que no es la misma persona (homonimo_confirmado)';
    end if;
  end if;
  return new;
end $$;

-- El expediente clínico y los antecedentes nacen solo para pacientes (al insertar, o al pasar de cliente a paciente).
create or replace function piefirme_app.paciente_ai() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.tipo_registro <> 'paciente' then return null; end if;
  insert into piefirme.expedientes (organizacion_id, paciente_id) values (new.organizacion_id, new.id) on conflict do nothing;
  insert into piefirme.antecedentes_paciente (paciente_id, organizacion_id, tipo_calzado, numero_calzado, deporte_detalle)
  values (new.id, new.organizacion_id, new.tipo_calzado, new.talla_calzado, new.deporte) on conflict do nothing;
  return null;
end $$;
drop trigger if exists t_paciente_au on piefirme.pacientes;
create trigger t_paciente_au after update of tipo_registro on piefirme.pacientes for each row when (old.tipo_registro = 'cliente' and new.tipo_registro = 'paciente') execute function piefirme_app.paciente_ai();

-- Vista: se agrega tipo_registro al final (misma definición, security_invoker).
do $$
declare d text;
begin
  d := pg_get_viewdef('piefirme.prp_pacientes'::regclass, true);
  d := regexp_replace(d, ';\s*$', '');
  execute 'create or replace view piefirme.prp_pacientes with (security_invoker = true) as select q.*, p0.tipo_registro from (' || d || ') q join piefirme.pacientes p0 on p0.id = q.id';
end $$;
grant select on piefirme.prp_pacientes to authenticated;

-- Convertir un cliente en paciente (misma id: conserva todo su historial de compras).
create or replace function piefirme.convertir_cliente_en_paciente(p_id uuid) returns uuid language plpgsql security invoker set search_path = piefirme, piefirme_app, pg_temp as $$
begin
  update piefirme.pacientes set tipo_registro = 'paciente' where id = p_id and tipo_registro = 'cliente';
  if not found then raise exception 'El registro no existe o ya es paciente' using errcode = 'P0001'; end if;
  return p_id;
end $$;
revoke all on function piefirme.convertir_cliente_en_paciente(uuid) from public, anon;
grant execute on function piefirme.convertir_cliente_en_paciente(uuid) to authenticated;
