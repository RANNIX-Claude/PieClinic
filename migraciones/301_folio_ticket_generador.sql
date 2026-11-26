-- 301 · Generador del folio de ticket: contador atómico por (organización, sucursal, período) y vista de próximos folios.
--   · El folio NO depende de quién cobra (recepción, podólogo, encargado): solo de la sucursal del ticket.
--   · El trigger de ventas (venta_bi, 026+) sigue llamando piefirme_app.siguiente_folio_comercial(sede, 'TKT'): para 'TKT' ahora delega aquí
--     (así no se reescribe venta_bi). Los demás tipos (LP, CIT, ANT, NC) conservan el formato {SEDE}-{TIPO}-{NNNNNN}.
--   · Día del folio = fecha de la zona horaria de la organización (America/Mexico_City) tomada de now() del servidor (UTC en base).
-- Depende de: 020, 026, 081, 300.
set search_path = piefirme, piefirme_app, extensions;

create table if not exists piefirme.folio_ticket_contador (
  organizacion_id uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id         uuid not null references piefirme.sedes(id) on delete cascade,
  periodo         text not null,                       -- D2026-11-26 | M2026-11 | A2026 | N
  ultimo          bigint not null default 0 check (ultimo >= 0),
  actualizado_en  timestamptz not null default now(),
  primary key (organizacion_id, sede_id, periodo)
);
alter table piefirme.folio_ticket_contador enable row level security;   -- sin políticas: solo funciones security definer

-- Siguiente folio. El upsert bloquea la fila hasta el fin de la transacción: dos cajas simultáneas se serializan y nunca reciben el mismo
-- número; si la transacción se deshace, el contador también (sin huecos). El bucle solo gira si el folio ya existiera en ventas
-- (p. ej. un formato nuevo que coincide con folios históricos): salta ese número, nunca repite.
create or replace function piefirme_app.siguiente_folio_ticket(p_sede uuid) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_cod text; v_fmt text; v_rei text; v_fecha date; v_per text; v_n bigint; v_folio text; i integer := 0;
begin
  select organizacion_id, codigo_corto into v_org, v_cod from piefirme.sedes where id = p_sede;
  if v_org is null then raise exception 'sede inexistente' using errcode = 'PF404'; end if;
  if v_cod is null then
    update piefirme.sedes set codigo_corto = piefirme_app.siguiente_codigo_sede(v_org) where id = p_sede returning codigo_corto into v_cod;
  end if;
  select formato, reinicio into v_fmt, v_rei from piefirme_app.folio_ticket_config(v_org);
  v_fecha := piefirme_app.hoy_org(v_org);
  v_per := piefirme_app.folio_ticket_periodo(v_rei, v_fecha);
  loop
    insert into piefirme.folio_ticket_contador as c (organizacion_id, sede_id, periodo, ultimo) values (v_org, p_sede, v_per, 1)
    on conflict (organizacion_id, sede_id, periodo) do update set ultimo = c.ultimo + 1, actualizado_en = now()
    returning c.ultimo into v_n;
    v_folio := piefirme_app.folio_ticket_formatear(v_fmt, v_cod, v_fecha, v_n);
    exit when not exists (select 1 from piefirme.ventas where organizacion_id = v_org and folio = v_folio);
    i := i + 1;
    if i > 1000 then raise exception 'no se encontró un folio libre; revisa el formato' using errcode = 'PF409'; end if;
  end loop;
  return v_folio;
end $$;

-- 'TKT' delega al generador parametrizable; los demás tipos no cambian.
create or replace function piefirme_app.siguiente_folio_comercial(p_sede uuid, p_tipo text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_clave text; v_n bigint;
begin
  if p_tipo = 'TKT' then return piefirme_app.siguiente_folio_ticket(p_sede); end if;
  select organizacion_id, upper(clave) into v_org, v_clave from piefirme.sedes where id = p_sede;
  if v_org is null then raise exception 'sede inexistente' using errcode = 'PF404'; end if;
  insert into piefirme.contadores_folio_comercial as c (organizacion_id, sede_id, tipo, ultimo)
  values (v_org, p_sede, p_tipo, 1)
  on conflict (organizacion_id, sede_id, tipo) do update set ultimo = c.ultimo + 1
  returning ultimo into v_n;
  return format('%s-%s-%s', v_clave, p_tipo, lpad(v_n::text, 6, '0'));
end $$;

-- Un folio emitido no se reescribe nunca (ni cambiando el formato ni a mano).
create or replace function piefirme_app.ventas_folio_inmutable() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if old.folio is not null and new.folio is distinct from old.folio then
    raise exception 'el folio de un ticket emitido no se cambia' using errcode = 'PF409';
  end if;
  return new;
end $$;
drop trigger if exists t_folio_inmutable on piefirme.ventas;
create trigger t_folio_inmutable before update of folio on piefirme.ventas for each row execute function piefirme_app.ventas_folio_inmutable();

-- Próximos N folios de una sucursal con el formato GUARDADO o con uno candidato (vista previa en vivo). Sin efectos: no consume números.
create or replace function piefirme.folio_ticket_proximos(p_sede uuid, p_cuantos integer default 3, p_formato text default null, p_reinicio text default null) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_cod text; c record; v_fmt text; v_rei text; v_fecha date; v_per text; v_ult bigint; e text; r jsonb := '[]'::jsonb; i integer;
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños ven la vista previa' using errcode = 'PF403'; end if;
  select codigo_corto into v_cod from piefirme.sedes where id = p_sede and organizacion_id = v_org;
  if not found then raise exception 'sucursal inexistente' using errcode = 'PF404'; end if;
  select * into c from piefirme_app.folio_ticket_config(v_org);
  v_fmt := coalesce(nullif(btrim(p_formato), ''), c.formato); v_rei := coalesce(p_reinicio, c.reinicio);
  e := piefirme_app.folio_ticket_validar(v_fmt, v_rei);
  if e is not null then return jsonb_build_object('valido', false, 'error', e); end if;
  v_cod := coalesce(v_cod, piefirme_app.siguiente_codigo_sede(v_org));
  v_fecha := piefirme_app.hoy_org(v_org);
  v_per := piefirme_app.folio_ticket_periodo(v_rei, v_fecha);
  select ultimo into v_ult from piefirme.folio_ticket_contador where organizacion_id = v_org and sede_id = p_sede and periodo = v_per;
  v_ult := coalesce(v_ult, 0);
  for i in 1..least(greatest(coalesce(p_cuantos, 3), 1), 10) loop
    r := r || to_jsonb(piefirme_app.folio_ticket_formatear(v_fmt, v_cod, v_fecha, v_ult + i));
  end loop;
  return jsonb_build_object('valido', true, 'folios', r, 'periodo', v_per, 'fecha', v_fecha);
end $$;

-- 'encargado' como función habilitable sobre el rol Recepción (no es un rol nuevo; sin permisos adicionales por ahora).
alter table piefirme.perfiles drop constraint if exists perfiles_funciones_chk;
alter table piefirme.perfiles add constraint perfiles_funciones_chk
  check (funciones <@ array['caja', 'recepcion_mercancia', 'podologia', 'encargado']::text[]);

revoke all on function piefirme_app.siguiente_folio_ticket(uuid), piefirme_app.ventas_folio_inmutable() from public, anon;
grant execute on function piefirme_app.siguiente_folio_ticket(uuid) to authenticated;
revoke all on function piefirme.folio_ticket_proximos(uuid, integer, text, text) from public, anon;
grant execute on function piefirme.folio_ticket_proximos(uuid, integer, text, text) to authenticated, service_role;
