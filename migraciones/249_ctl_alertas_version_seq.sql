-- 249 · Control y Auditoría · ETAPA 6 · ORDEN DE VERSIONES de reglas y destinatarios.
-- Las reglas de alerta y los destinatarios son versionados (gana la fila más reciente). Dos cambios dentro de la MISMA transacción comparten now(), así que el desempate por id
-- (uuid aleatorio) podía elegir la versión vieja. Se agrega un número de secuencia (seq) y se desempata por él, igual que ctl_config_bitacora.
-- Depende de: 240, 245.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.ctl_alerta_regla add column if not exists seq bigint generated always as identity;
alter table piefirme.ctl_alerta_destinatario add column if not exists seq bigint generated always as identity;
create index if not exists ctl_alerta_regla_seq_idx on piefirme.ctl_alerta_regla (organizacion_id, tipo, creado_en desc, seq desc);
create index if not exists ctl_alerta_dest_seq_idx on piefirme.ctl_alerta_destinatario (organizacion_id, usuario_id, creado_en desc, seq desc);

create or replace function piefirme_app.ctl_alerta_regla_efectiva(p_org uuid, p_tipo text)
returns table (tipo text, nombre text, canales text[], destinatarios text[], inmediata boolean, activa boolean, severidad text, personalizada boolean)
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select c.tipo, c.nombre, coalesce(r.canales, c.canales), coalesce(r.destinatarios, c.destinatarios), coalesce(r.inmediata, c.inmediata), coalesce(r.activa, true), c.severidad, r.id is not null
    from piefirme.ctl_alerta_catalogo c
    left join lateral (select x.* from piefirme.ctl_alerta_regla x where x.organizacion_id = p_org and x.tipo = c.tipo order by x.creado_en desc, x.seq desc limit 1) r on true
   where c.tipo = p_tipo
$$;

create or replace function piefirme_app.ctl_alerta_destinatarios(p_org uuid, p_sucursal uuid, p_roles text[])
returns table (usuario_id uuid, rol text, nombre text, email text, telefono text, techo integer, recibir boolean, sedes uuid[])
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select p.id, case p.rol::text when 'administrador' then 'dueno' when 'supervisor' then 'supervisor' else 'sucursal' end,
         coalesce(nullif(trim(p.nombre || ' ' || coalesce(p.apellidos, '')), ''), p.email), p.email, p.telefono, d.techo_diario, coalesce(d.recibir, true), p.sedes
    from piefirme.perfiles p
    left join lateral (select x.techo_diario, x.recibir from piefirme.ctl_alerta_destinatario x
                        where x.organizacion_id = p.organizacion_id and x.usuario_id = p.id order by x.creado_en desc, x.seq desc limit 1) d on true
   where p.organizacion_id = p_org and p.activo and not exists (select 1 from piefirme.rannix_staff rs where rs.user_id = p.id)
     and (('dueno' = any (p_roles) and p.rol::text = 'administrador')
       or ('supervisor' = any (p_roles) and p.rol::text = 'supervisor' and (p_sucursal is null or cardinality(p.sedes) = 0 or p_sucursal = any (p.sedes)))
       or ('sucursal' = any (p_roles) and p.rol::text in ('recepcion', 'podologo') and p_sucursal is not null and (cardinality(p.sedes) = 0 or p_sucursal = any (p.sedes))))
$$;

revoke all on function piefirme_app.ctl_alerta_regla_efectiva(uuid, text) from public, anon, authenticated;
revoke all on function piefirme_app.ctl_alerta_destinatarios(uuid, uuid, text[]) from public, anon, authenticated;
