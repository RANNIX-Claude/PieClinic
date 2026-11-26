-- 294 · Control y Auditoría · ETAPA 1 · la serie de folios de las cancelaciones («CCN-AAAA-NNNNN», 290) entra al contador sin huecos de la Etapa 0 y a su detector.
-- Depende de: 200, 203, 290.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.ctl_folio_seq drop constraint if exists ctl_folio_seq_serie_check;
alter table piefirme.ctl_folio_seq add constraint ctl_folio_seq_serie_check check (serie in ('SES', 'CIE', 'CAS', 'CCN'));

create or replace function piefirme.ctl_huecos_folios() returns table (serie text, anio integer, folio_faltante text)
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('ver_diferencias');
begin
  return query
    with f as (
      select 'SES'::text s, x.folio_anio a, x.folio_num n from piefirme.ctl_sesion_conteo x where x.organizacion_id = v_org
      union all select 'CIE', x.folio_anio, x.folio_num from piefirme.ctl_cierre x where x.organizacion_id = v_org
      union all select 'CAS', x.folio_anio, x.folio_num from piefirme.ctl_caso x where x.organizacion_id = v_org
      union all select 'CCN', x.folio_anio, x.folio_num from piefirme.ctl_cancelacion x where x.organizacion_id = v_org)
    select q.serie, q.anio, q.serie || '-' || q.anio || '-' || lpad(g.n::text, 5, '0')
      from piefirme.ctl_folio_seq q
      cross join lateral generate_series(1, q.ultimo) g(n)
     where q.organizacion_id = v_org and not exists (select 1 from f where f.s = q.serie and f.a = q.anio and f.n = g.n)
     order by 1, 2, 3;
end $$;
revoke all on function piefirme.ctl_huecos_folios() from public, anon;
grant execute on function piefirme.ctl_huecos_folios() to authenticated;
