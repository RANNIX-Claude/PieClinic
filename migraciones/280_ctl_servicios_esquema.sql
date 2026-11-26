-- 280 · Control y Auditoría · ETAPA 8 (SERVICIOS) · ESQUEMA: expediente de atención ligado a cobro, ocupación del puesto y parámetros.
--   · ctl_atencion (Etapa 0) gana el vínculo con el origen (origen_tipo/origen_id, SIN llave foránea), quién cerró/canceló y reglas de coherencia:
--       cerrada_con_ticket exige ticket y hora de cierre · cancelada exige motivo y autorizador (supervisor) · una atención cerrada o cancelada es definitiva.
--     Referencia de paciente OPACA: solo letras, números, guion y guion bajo (3–40). El piloto NO guarda nota clínica: no hay columna para ella (F5.5, LFPDPPP).
--   · ctl_ocupacion (fase POSTERIOR al piloto; no hay hardware): duración calculada por el servidor, rango validado y fuente 'manual' por omisión.
--   · Parámetros nuevos con tope en base de datos: atencion_sin_ticket_min (24 h), atencion_auto_desde_consulta (si/no), ocupacion_ventana_cobro_min (8 h).
--   · Alertas nuevas en el catálogo: atencion_sin_ticket, atencion_cancelada, ocupacion_sin_cobro.
-- Depende de: 200, 201, 240 (catálogo de alertas).
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── ctl_atencion ─────────────────────────────
alter table piefirme.ctl_atencion add column if not exists origen_tipo text;     -- 'consulta' | 'manual' (referencia lógica al origen: sin FK, decisión D2)
alter table piefirme.ctl_atencion add column if not exists origen_id   uuid;
alter table piefirme.ctl_atencion add column if not exists cerrada_por uuid;     -- quien cerró con ticket o canceló
alter table piefirme.ctl_atencion add column if not exists hora_cliente timestamptz;

do $$ begin
  alter table piefirme.ctl_atencion add constraint ctl_atencion_ref_opaca_chk
    check (paciente_ref is null or paciente_ref ~ '^[A-Za-z0-9_-]{3,40}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.ctl_atencion add constraint ctl_atencion_origen_chk
    check (origen_tipo is null or origen_tipo in ('consulta', 'manual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.ctl_atencion add constraint ctl_atencion_estado_coherente_chk check (
    (estado = 'abierta'            and fin_en is null and ticket_id is null and motivo_cancelacion is null and autorizado_por is null)
 or (estado = 'cerrada_con_ticket' and fin_en is not null and ticket_id is not null and motivo_cancelacion is null)
 or (estado = 'cancelada'          and fin_en is not null and ticket_id is null and nullif(btrim(motivo_cancelacion), '') is not null and autorizado_por is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table piefirme.ctl_atencion add constraint ctl_atencion_fin_chk check (fin_en is null or fin_en >= inicio_en);
exception when duplicate_object then null; end $$;

create unique index if not exists ctl_atencion_origen_uq on piefirme.ctl_atencion (organizacion_id, origen_tipo, origen_id) where origen_id is not null;
create index if not exists ctl_atencion_suc_inicio_idx on piefirme.ctl_atencion (organizacion_id, sucursal_id, inicio_en desc);
create index if not exists ctl_atencion_abiertas_idx on piefirme.ctl_atencion (organizacion_id, inicio_en) where estado = 'abierta';
create index if not exists ctl_atencion_ticket_idx on piefirme.ctl_atencion (ticket_id) where ticket_id is not null;

-- Una atención cerrada o cancelada es definitiva; lo que identifica la atención nunca cambia (el trigger de estado de la Etapa 0 cuida id, org, sucursal y autoría).
create or replace function piefirme_app.ctl_trg_atencion() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
declare k text;
begin
  if tg_op = 'UPDATE' then
    foreach k in array array['paciente_ref', 'servicio_id', 'usuario_atiende', 'inicio_en', 'origen_tipo', 'origen_id'] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'El campo % de la atención no se puede cambiar.', k using errcode = 'PF403';
      end if;
    end loop;
    if old.estado <> 'abierta' then
      raise exception 'La atención ya está %: no se modifica.', replace(old.estado, '_', ' ') using errcode = 'PF409';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_20_atencion on piefirme.ctl_atencion;
create trigger t_20_atencion before update on piefirme.ctl_atencion for each row execute function piefirme_app.ctl_trg_atencion();

-- ───────────────────────────── ctl_ocupacion (fase posterior al piloto) ─────────────────────────────
alter table piefirme.ctl_ocupacion add column if not exists puesto_nombre text;
alter table piefirme.ctl_ocupacion add column if not exists hora_cliente timestamptz;
do $$ begin
  alter table piefirme.ctl_ocupacion add constraint ctl_ocupacion_rango_chk check (fin_en is null or fin_en > inicio_en);
exception when duplicate_object then null; end $$;
create index if not exists ctl_ocupacion_suc_inicio_idx on piefirme.ctl_ocupacion (organizacion_id, sucursal_id, inicio_en desc);

-- la duración la calcula el servidor (el sensor o la persona no la teclean)
create or replace function piefirme_app.ctl_trg_ocupacion() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
begin
  if new.fin_en is not null then new.duracion_min := round(extract(epoch from (new.fin_en - new.inicio_en)) / 60.0, 2);
  else new.duracion_min := null; end if;
  return new;
end $$;
drop trigger if exists t_05_duracion on piefirme.ctl_ocupacion;
create trigger t_05_duracion before insert or update on piefirme.ctl_ocupacion for each row execute function piefirme_app.ctl_trg_ocupacion();

-- La ocupación no se corrige: es evidencia del puesto. (Está en la clase «estado» de la Etapa 0; aquí se le cierra el UPDATE.)
create or replace function piefirme_app.ctl_trg_ocupacion_fija() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
begin
  if coalesce(current_setting('app.ctl_purga', true), '') = 'on' then return coalesce(old, new); end if;
  raise exception 'Las ocupaciones registradas no se modifican ni se borran.' using errcode = 'PF403';
end $$;
drop trigger if exists t_06_fija on piefirme.ctl_ocupacion;
create trigger t_06_fija before update or delete on piefirme.ctl_ocupacion for each row execute function piefirme_app.ctl_trg_ocupacion_fija();

-- ───────────────────────────── parámetros con tope ─────────────────────────────
insert into piefirme.ctl_config_def (clave, descripcion, tipo, omision, minimo, tope, opciones, unidad, confirma_dueno, explicacion_tope, orden) values
 ('atencion_sin_ticket_min', 'Minutos abierta una atención antes de contarla «sin ticket»', 'num', '120', 15, 1440, null, 'min', false,
    'Más de 24 horas abierta deja de ser una atención en curso: es un servicio que nadie cobró ni canceló, y esperar más solo retrasa la revisión.', 150),
 ('atencion_auto_desde_consulta', 'Abrir la atención automáticamente al iniciar una consulta', 'texto', '"no"', null, null, array['si', 'no'], null, false, null, 160),
 ('ocupacion_ventana_cobro_min', 'Ventana para ligar una ocupación con su ticket de servicio', 'num', '60', 5, 480, null, 'min', false,
    'Una ventana mayor a 8 horas liga cualquier ocupación con cualquier ticket del día y el cruce deja de detectar cobros faltantes.', 170)
on conflict (clave) do nothing;

-- ───────────────────────────── eventos de alerta ─────────────────────────────
insert into piefirme.ctl_alerta_catalogo (tipo, nombre, descripcion, canales, destinatarios, inmediata, severidad, fuente, emite, orden) values
 ('atencion_sin_ticket', 'Atención abierta sin ticket', 'Una atención lleva abierta más del tiempo configurado sin ticket ni cancelación autorizada (F5.5). Es un indicador para investigar: no acusa a nadie.',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'especificacion', 'servicios (Etapa 8: ctl_servicios_evaluar_ahora)', 200),
 ('atencion_cancelada', 'Atención cancelada con clave de supervisor', 'Una atención se canceló con motivo y clave de supervisor (F5.5). Va en el resumen diario.',
    array['correo'], array['dueno'], false, 'media', 'especificacion', 'servicios (Etapa 8)', 201),
 ('ocupacion_sin_cobro', 'Ocupaciones del puesto sin ticket de servicio', 'El cruce diario encontró ocupaciones sin su ticket (F5.5, fase posterior al piloto).',
    array['correo'], array['dueno'], false, 'media', 'especificacion', 'servicios (Etapa 8: ctl_ocupacion_cruce)', 202)
on conflict (tipo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, canales = excluded.canales, destinatarios = excluded.destinatarios,
  inmediata = excluded.inmediata, severidad = excluded.severidad, fuente = excluded.fuente, emite = excluded.emite, orden = excluded.orden;
