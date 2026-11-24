-- 065 · V2 · Checador: cada persona registra su propia checada en la sede donde trabaja ese día.
-- ADITIVA: agrega columnas a checadas y UNA política nueva de insert (las políticas existentes no se tocan; las políticas permisivas se suman con OR).
-- Reglas: la checada propia debe ser del empleado ligado a la sesión, origen 'app', en la sede «trabajando en» de hoy (asignación del día,
--   o su sede de contrato si no eligió), con hora del servidor (±10 min) para que no se pueda registrar en otra fecha.
-- Depende de: 051 (checadas), 064 (empleado_asignaciones, sede_hoy, hoy).
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.checadas add column if not exists registrado_por uuid default auth.uid();
alter table piefirme.checadas add column if not exists asignacion_id uuid references piefirme.empleado_asignaciones(id) on delete set null;
create index if not exists checadas_registrado_por_idx on piefirme.checadas (organizacion_id, registrado_por) where registrado_por is not null;

drop policy if exists chk_ins_propia on piefirme.checadas;
create policy chk_ins_propia on piefirme.checadas for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa()
              and empleado_id is not null and empleado_id = piefirme_app.empleado_id()
              and origen = 'app' and registrado_por = auth.uid()
              and sede_id = piefirme_app.sede_hoy()
              and fecha_hora between now() - interval '10 minutes' and now() + interval '10 minutes');

-- Registrar mi checada: entrada o salida; la sede la fija «trabajando en» de hoy. security invoker: lo valida la política anterior.
create or replace function piefirme.checar(p_operacion text) returns piefirme.checadas
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_emp uuid := piefirme_app.empleado_id(); v_sede uuid := piefirme_app.sede_hoy(); v_row piefirme.checadas; v_asig uuid;
begin
  if v_emp is null then raise exception 'La sesión no está ligada a un empleado' using errcode = 'PF403'; end if;
  if p_operacion not in ('entrada', 'salida') then raise exception 'operación inválida (entrada | salida)'; end if;
  if v_sede is null then raise exception 'No hay sede de trabajo para hoy' using errcode = 'PF409'; end if;
  select a.id into v_asig from piefirme.empleado_asignaciones a where a.empleado_id = v_emp and a.fecha = piefirme_app.hoy();
  insert into piefirme.checadas (organizacion_id, sede_id, empleado_id, operacion, fecha_hora, origen, registrado_por, asignacion_id)
  values (piefirme_app.org_id(), v_sede, v_emp, p_operacion, now(), 'app', auth.uid(), v_asig)
  returning * into v_row;
  return v_row;
end $$;
revoke all on function piefirme.checar(text) from public, anon;
grant execute on function piefirme.checar(text) to authenticated;
