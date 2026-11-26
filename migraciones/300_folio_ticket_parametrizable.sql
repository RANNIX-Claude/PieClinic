-- 300 · Folio de TICKET parametrizable por la clínica (decisión del dueño, 2026-11-26).
--   · sedes.codigo_corto (2 dígitos, único por organización) con valores por omisión 01, 02… en orden de creación.
--   · organizaciones.parametros: folio_ticket_formato ({SUC}, {AAAA}|{AA}, {MM}, {DD}, {AAMMDD}, {NNN…}) y folio_ticket_reinicio.
--   · Formateo y validación escritos UNA vez en SQL (el espejo JS vive en src/lib/comercial/folioTicket.js y se prueba contra los mismos casos).
--   · Validación en BASE DE DATOS (trigger sobre organizaciones): ninguna ruta (RPC, API, SQL) guarda un formato inválido.
--   · Cada cambio de formato / reinicio / código corto queda en piefirme.bitacora (quién y cuándo).
-- Depende de: 001, 020, 026, 073. El generador y el trigger de ventas van en 301.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── código corto por sucursal ─────────────────────────────
alter table piefirme.sedes add column if not exists codigo_corto text;
do $$ begin
  alter table piefirme.sedes add constraint sedes_codigo_corto_chk check (codigo_corto is null or codigo_corto ~ '^[0-9]{2}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.sedes add constraint sedes_codigo_corto_uq unique (organizacion_id, codigo_corto) deferrable initially immediate;   -- diferible: permite intercambiar dos códigos
exception when duplicate_table or duplicate_object then null; end $$;

-- Siguiente código libre (01..99) de una organización.
create or replace function piefirme_app.siguiente_codigo_sede(p_org uuid) returns text
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare i integer; c text;
begin
  for i in 1..99 loop
    c := lpad(i::text, 2, '0');
    if not exists (select 1 from piefirme.sedes where organizacion_id = p_org and codigo_corto = c) then return c; end if;
  end loop;
  raise exception 'no quedan códigos cortos libres (máximo 99 sucursales)' using errcode = 'PF409';
end $$;

-- Valores por omisión para las sedes actuales: en orden de creación, sin tocar las que ya tengan uno.
do $$
declare r record;
begin
  for r in select id, organizacion_id from piefirme.sedes where codigo_corto is null order by organizacion_id, created_at, id loop
    update piefirme.sedes set codigo_corto = piefirme_app.siguiente_codigo_sede(r.organizacion_id) where id = r.id;
  end loop;
end $$;

create or replace function piefirme_app.sedes_codigo_corto_biu() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.codigo_corto is null then new.codigo_corto := piefirme_app.siguiente_codigo_sede(new.organizacion_id); end if;
  else
    if new.codigo_corto is null and old.codigo_corto is not null then
      raise exception 'toda sucursal necesita su código corto de 2 dígitos' using errcode = 'PF400';
    end if;
    if new.codigo_corto is distinct from old.codigo_corto and auth.uid() is not null then
      insert into piefirme.bitacora (organizacion_id, usuario_id, sede_id, accion, entidad, entidad_id, detalle)
      values (new.organizacion_id, auth.uid(), new.id, 'actualizar', 'sedes', new.id::text,
              jsonb_build_object('cambio', 'codigo_corto', 'antes', old.codigo_corto, 'despues', new.codigo_corto, 'nota', 'aplica solo a tickets nuevos'));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_codigo_corto on piefirme.sedes;
create trigger t_codigo_corto before insert or update of codigo_corto on piefirme.sedes for each row execute function piefirme_app.sedes_codigo_corto_biu();

-- ───────────────────────────── formateo (la única implementación SQL) ─────────────────────────────
-- Campos: {SUC} código corto · {AAAA} año 4 díg. · {AA} año 2 díg. · {MM} mes · {DD} día · {AAMMDD} · {N…N} consecutivo (la cantidad de N = dígitos).
-- Si el consecutivo rebasa los dígitos, el número crece (nunca se trunca).
create or replace function piefirme_app.folio_ticket_formatear(p_formato text, p_codigo text, p_fecha date, p_n bigint) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare f text := p_formato; m text;
begin
  f := replace(f, '{AAMMDD}', to_char(p_fecha, 'YYMMDD'));
  f := replace(f, '{AAAA}', to_char(p_fecha, 'YYYY'));
  f := replace(f, '{AA}', to_char(p_fecha, 'YY'));
  f := replace(f, '{MM}', to_char(p_fecha, 'MM'));
  f := replace(f, '{DD}', to_char(p_fecha, 'DD'));
  f := replace(f, '{SUC}', p_codigo);
  m := (regexp_match(f, '\{(N+)\}'))[1];
  if m is not null then f := replace(f, '{' || m || '}', lpad(p_n::text, length(m), '0')); end if;
  return f;
end $$;

-- Llave del período en que reinicia el consecutivo (el día se toma en la zona horaria de la organización).
create or replace function piefirme_app.folio_ticket_periodo(p_reinicio text, p_fecha date) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case p_reinicio when 'diario' then 'D' || to_char(p_fecha, 'YYYY-MM-DD') when 'mensual' then 'M' || to_char(p_fecha, 'YYYY-MM')
                         when 'anual' then 'A' || to_char(p_fecha, 'YYYY') when 'nunca' then 'N' end
$$;

-- Devuelve NULL si el formato y el reinicio son válidos; si no, el motivo en español.
create or replace function piefirme_app.folio_ticket_validar(p_formato text, p_reinicio text) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare resto text; m text; n_n integer; n_suc integer; largo integer;
  t_anio boolean; t_mes boolean; t_dia boolean;
begin
  if p_formato is null or btrim(p_formato) = '' then return 'El formato del folio no puede quedar vacío.'; end if;
  if p_reinicio is null or p_reinicio not in ('diario', 'mensual', 'anual', 'nunca') then return 'El reinicio debe ser diario, mensual, anual o nunca.'; end if;
  n_suc := (length(p_formato) - length(replace(p_formato, '{SUC}', ''))) / 5;
  if n_suc <> 1 then return 'El formato debe llevar exactamente un {SUC} (código de la sucursal): sin él los folios de dos sucursales se repetirían.'; end if;
  n_n := (select count(*) from regexp_matches(p_formato, '\{N+\}', 'g'));
  if n_n <> 1 then return 'El formato debe llevar exactamente un consecutivo, escrito con N: por ejemplo {NNN} para 3 dígitos.'; end if;
  m := (regexp_match(p_formato, '\{(N+)\}'))[1];
  if length(m) < 2 then return 'El consecutivo debe tener al menos 2 dígitos (por ejemplo {NN} o {NNN}).'; end if;
  if length(m) > 9 then return 'El consecutivo no puede pasar de 9 dígitos.'; end if;
  resto := replace(replace(replace(replace(replace(replace(replace(p_formato, '{AAMMDD}', ''), '{AAAA}', ''), '{AA}', ''), '{MM}', ''), '{DD}', ''), '{SUC}', ''), '{' || m || '}', '');
  if resto ~ '[{}]' then return 'Hay un campo que no existe o está mal escrito. Los campos válidos son {SUC}, {AAAA}, {AA}, {MM}, {DD}, {AAMMDD} y {NNN}.'; end if;
  if resto !~ '^[A-Za-z0-9./_-]*$' then return 'Solo se permiten letras, dígitos, guion, punto, diagonal y guion bajo (sin espacios ni otros símbolos).'; end if;
  largo := length(piefirme_app.folio_ticket_formatear(p_formato, '01', date '2026-12-31', 0));
  if largo > 24 then return format('El folio mide %s caracteres con este formato; el máximo es 24.', largo); end if;
  t_anio := p_formato like '%{AAAA}%' or p_formato like '%{AA}%' or p_formato like '%{AAMMDD}%';
  t_mes  := p_formato like '%{MM}%' or p_formato like '%{AAMMDD}%';
  t_dia  := p_formato like '%{DD}%' or p_formato like '%{AAMMDD}%';
  if p_reinicio = 'diario' and not (t_anio and t_mes and t_dia) then
    return 'Con reinicio diario el formato debe llevar el año, el mes y el día (por ejemplo {AAMMDD}); si no, dos días distintos repetirían el folio.';
  elsif p_reinicio = 'mensual' and not (t_anio and t_mes) then
    return 'Con reinicio mensual el formato debe llevar el año y el mes (por ejemplo {AA}{MM}); si no, dos meses distintos repetirían el folio.';
  elsif p_reinicio = 'anual' and not t_anio then
    return 'Con reinicio anual el formato debe llevar el año ({AA} o {AAAA}); si no, dos años distintos repetirían el folio.';
  end if;
  return null;
end $$;

-- Valores por omisión globales.
create or replace function piefirme_app.folio_ticket_config(p_org uuid) returns table (formato text, reinicio text)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(nullif(o.parametros ->> 'folio_ticket_formato', ''), '{SUC}-{AAMMDD}-{NNN}'),
         coalesce(nullif(o.parametros ->> 'folio_ticket_reinicio', ''), 'diario')
    from piefirme.organizaciones o where o.id = p_org
$$;

-- Vista previa sin efectos (no toca contadores): sirve a la pantalla y a las pruebas de paridad con el JS.
create or replace function piefirme.folio_ticket_vista_previa(p_formato text, p_reinicio text, p_codigo text, p_fecha date, p_n bigint) returns jsonb
language plpgsql immutable set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare e text;
begin
  if p_codigo is null or p_codigo !~ '^[0-9]{2}$' then return jsonb_build_object('valido', false, 'error', 'El código corto de la sucursal debe ser de 2 dígitos.'); end if;
  if p_fecha is null or p_n is null or p_n < 1 then return jsonb_build_object('valido', false, 'error', 'Fecha o número inválidos.'); end if;
  e := piefirme_app.folio_ticket_validar(p_formato, p_reinicio);
  if e is not null then return jsonb_build_object('valido', false, 'error', e); end if;
  return jsonb_build_object('valido', true, 'folio', piefirme_app.folio_ticket_formatear(p_formato, p_codigo, p_fecha, p_n),
                            'periodo', piefirme_app.folio_ticket_periodo(p_reinicio, p_fecha));
end $$;

-- ───────────────────────────── validación + bitácora al guardar los parámetros de la organización ─────────────────────────────
create or replace function piefirme_app.org_folio_ticket_biu() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare nf text; nr text; of_ text; or_ text; e text;
begin
  nf := coalesce(nullif(new.parametros ->> 'folio_ticket_formato', ''), '{SUC}-{AAMMDD}-{NNN}');
  nr := coalesce(nullif(new.parametros ->> 'folio_ticket_reinicio', ''), 'diario');
  if tg_op = 'INSERT' then
    if new.parametros ? 'folio_ticket_formato' or new.parametros ? 'folio_ticket_reinicio' then
      e := piefirme_app.folio_ticket_validar(nf, nr);
      if e is not null then raise exception '%', e using errcode = 'PF400'; end if;
    end if;
    return new;
  end if;
  of_ := coalesce(nullif(old.parametros ->> 'folio_ticket_formato', ''), '{SUC}-{AAMMDD}-{NNN}');
  or_ := coalesce(nullif(old.parametros ->> 'folio_ticket_reinicio', ''), 'diario');
  if new.parametros ->> 'folio_ticket_formato' is distinct from old.parametros ->> 'folio_ticket_formato'
     or new.parametros ->> 'folio_ticket_reinicio' is distinct from old.parametros ->> 'folio_ticket_reinicio' then
    e := piefirme_app.folio_ticket_validar(nf, nr);
    if e is not null then raise exception '%', e using errcode = 'PF400'; end if;
    if (nf, nr) is distinct from (of_, or_) then
      insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
      values (new.id, auth.uid(), 'actualizar', 'organizaciones', new.id::text,
              jsonb_build_object('cambio', 'folio_ticket', 'antes', jsonb_build_object('formato', of_, 'reinicio', or_),
                                 'despues', jsonb_build_object('formato', nf, 'reinicio', nr), 'nota', 'aplica solo a tickets nuevos; los folios emitidos no cambian'));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_folio_ticket on piefirme.organizaciones;
create trigger t_folio_ticket before insert or update of parametros on piefirme.organizaciones for each row execute function piefirme_app.org_folio_ticket_biu();

-- ───────────────────────────── RPC de la pantalla «Parámetros de los dueños» ─────────────────────────────
create or replace function piefirme.folio_ticket_parametros() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); c record;
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños ven estos parámetros' using errcode = 'PF403'; end if;
  select * into c from piefirme_app.folio_ticket_config(v_org);
  return jsonb_build_object('formato', c.formato, 'reinicio', c.reinicio, 'defecto_formato', '{SUC}-{AAMMDD}-{NNN}', 'defecto_reinicio', 'diario',
    'hoy', piefirme_app.hoy_org(v_org), 'zona', piefirme_app.zona_org(v_org),
    'sedes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'clave', s.clave, 'nombre', s.nombre, 'codigo_corto', s.codigo_corto, 'activa', s.activa) order by s.created_at, s.id)
                         from piefirme.sedes s where s.organizacion_id = v_org), '[]'::jsonb));
end $$;

create or replace function piefirme.guardar_folio_ticket(p_formato text, p_reinicio text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); e text;
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños cambian el formato del folio' using errcode = 'PF403'; end if;
  e := piefirme_app.folio_ticket_validar(btrim(p_formato), p_reinicio);
  if e is not null then raise exception '%', e using errcode = 'PF400'; end if;
  update piefirme.organizaciones set parametros = coalesce(parametros, '{}'::jsonb) || jsonb_build_object('folio_ticket_formato', btrim(p_formato), 'folio_ticket_reinicio', p_reinicio) where id = v_org;
  return piefirme.folio_ticket_parametros();   -- la bitácora la escribe el trigger t_folio_ticket
end $$;

-- p: [{"sede_id": "...", "codigo_corto": "02"}, …]. Verifica unicidad del estado final (permite intercambiar dos códigos).
create or replace function piefirme.guardar_codigos_sedes(p jsonb) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); x jsonb; v_id uuid; v_cod text; v_dup text; v_ids uuid[] := '{}';
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if not piefirme_app.es_admin() then raise exception 'solo los dueños cambian el código de las sucursales' using errcode = 'PF403'; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'formato de códigos inválido' using errcode = 'PF400'; end if;
  create temp table if not exists _cod_final (sede_id uuid primary key, codigo text not null) on commit drop;
  delete from _cod_final;
  insert into _cod_final select id, codigo_corto from piefirme.sedes where organizacion_id = v_org and codigo_corto is not null;
  for x in select * from jsonb_array_elements(p) loop
    v_id := (x ->> 'sede_id')::uuid; v_cod := btrim(x ->> 'codigo_corto');
    if not exists (select 1 from piefirme.sedes where id = v_id and organizacion_id = v_org) then raise exception 'sucursal inexistente' using errcode = 'PF404'; end if;
    if v_cod is null or v_cod !~ '^[0-9]{2}$' then raise exception 'El código corto debe ser de 2 dígitos (por ejemplo 01).' using errcode = 'PF400'; end if;
    insert into _cod_final values (v_id, v_cod) on conflict (sede_id) do update set codigo = excluded.codigo;
    v_ids := v_ids || v_id;
  end loop;
  select codigo into v_dup from _cod_final group by codigo having count(*) > 1 limit 1;
  if v_dup is not null then raise exception 'El código % está repetido: cada sucursal necesita un código distinto.', v_dup using errcode = 'PF409'; end if;
  set constraints piefirme.sedes_codigo_corto_uq deferred;   -- la unicidad se revisa al final (intercambios 01 <-> 02)
  update piefirme.sedes s set codigo_corto = f.codigo from _cod_final f where s.id = f.sede_id and s.id = any(v_ids) and s.codigo_corto is distinct from f.codigo;
  set constraints piefirme.sedes_codigo_corto_uq immediate;
  return piefirme.folio_ticket_parametros();
end $$;

revoke all on function piefirme_app.folio_ticket_formatear(text, text, date, bigint), piefirme_app.folio_ticket_periodo(text, date),
  piefirme_app.folio_ticket_validar(text, text), piefirme_app.folio_ticket_config(uuid), piefirme_app.siguiente_codigo_sede(uuid),
  piefirme_app.sedes_codigo_corto_biu(), piefirme_app.org_folio_ticket_biu() from public, anon;
grant execute on function piefirme_app.folio_ticket_formatear(text, text, date, bigint), piefirme_app.folio_ticket_periodo(text, date),
  piefirme_app.folio_ticket_validar(text, text), piefirme_app.folio_ticket_config(uuid), piefirme_app.siguiente_codigo_sede(uuid) to authenticated;
revoke all on function piefirme.folio_ticket_vista_previa(text, text, text, date, bigint), piefirme.folio_ticket_parametros(),
  piefirme.guardar_folio_ticket(text, text), piefirme.guardar_codigos_sedes(jsonb) from public, anon;
grant execute on function piefirme.folio_ticket_vista_previa(text, text, text, date, bigint), piefirme.folio_ticket_parametros(),
  piefirme.guardar_folio_ticket(text, text), piefirme.guardar_codigos_sedes(jsonb) to authenticated, service_role;
