-- 061 · Alinea dos parámetros que dos dominios nombraron distinto (hallazgo de la revisión de Utilerías):
--   Configuración (D, 057) edita 'anticipo_pct' y 'reprogramaciones_sin_costo'; el portal y las citas (B, 023/024) leían
--   'anticipo_portal_pct' y 'reprogramaciones_max'. Sin esto, cambiar el valor en Configuración no afectaba al portal.
-- param_num ahora acepta ambos nombres: manda el que edita Configuración; si no existe, el nombre original.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.param_num(p_org uuid, p_clave text, p_def numeric default null) returns numeric
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(
    (select coalesce(
              nullif(o.parametros ->> (case p_clave when 'anticipo_portal_pct' then 'anticipo_pct'
                                                    when 'reprogramaciones_max' then 'reprogramaciones_sin_costo' end), '')::numeric,
              nullif(o.parametros ->> p_clave, '')::numeric)
       from piefirme.organizaciones o where o.id = p_org),
    p_def)
$$;
