-- 302 · Corrección de 300: si el consecutivo rebasa los dígitos del formato, el número crece (antes lpad lo truncaba y habría repetido folios).
-- Depende de: 300.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.folio_ticket_formatear(p_formato text, p_codigo text, p_fecha date, p_n bigint) returns text
language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare f text := p_formato; m text; num text;
begin
  f := replace(f, '{AAMMDD}', to_char(p_fecha, 'YYMMDD'));
  f := replace(f, '{AAAA}', to_char(p_fecha, 'YYYY'));
  f := replace(f, '{AA}', to_char(p_fecha, 'YY'));
  f := replace(f, '{MM}', to_char(p_fecha, 'MM'));
  f := replace(f, '{DD}', to_char(p_fecha, 'DD'));
  f := replace(f, '{SUC}', p_codigo);
  m := (regexp_match(f, '\{(N+)\}'))[1];
  if m is not null then
    num := p_n::text;
    f := replace(f, '{' || m || '}', case when length(num) >= length(m) then num else lpad(num, length(m), '0') end);
  end if;
  return f;
end $$;
