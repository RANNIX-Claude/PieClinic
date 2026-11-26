-- 240 · Control y Auditoría · ETAPA 6 (reportes, tablero y alertas) · ESQUEMA.
-- Qué agrega (todo con prefijo ctl_ y sin llaves foráneas hacia el origen, igual que la Etapa 0):
--   · parámetros nuevos de configuración (hora de «sin conteo de apertura» y «sin cierre», umbral del tablero de salud) con los mismos topes validados por trigger;
--   · motor de alertas: catálogo del sistema (ctl_alerta_catalogo), reglas por organización VERSIONADAS (ctl_alerta_regla), destinatarios con techo propio VERSIONADOS
--     (ctl_alerta_destinatario) y registro de lo que se enviaría (ctl_alerta_envio; los canales Push/WhatsApp/correo son SIMULADOS: no hay llaves);
--   · ctl_apertura_cajon (F1.5: aperturas de cajón sin venta; el origen aún no emite el evento: la tabla y el reporte quedan listos);
--   · ctl_evidencia_purga (bitácora de la purga de fotos por retención; la evidencia es solo-inserción: la fila de ctl_evidencia se conserva y se anota que el
--     archivo ya no existe);
--   · índices para que el reporte de diferencias de 90 días y 7 sucursales responda en < 2 s.
-- Las tablas nuevas son SOLO INSERCIÓN (las reglas y destinatarios se versionan: gana la fila más reciente). Nada se actualiza ni se borra desde la app.
-- Depende de: 200–206, 210–213, 220–223, 230–235.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── parámetros nuevos ─────────────────────────────
insert into piefirme.ctl_config_def (clave, descripcion, tipo, omision, minimo, tope, opciones, unidad, confirma_dueno, explicacion_tope, orden) values
 ('alertas_hora_sin_apertura', 'Hora local desde la cual se alerta una sucursal que operó sin conteo de apertura', 'num', '11', 0, 23, null, 'hora (0–23)', false, null, 180),
 ('alertas_hora_sin_cierre',   'Hora local desde la cual se alerta una sucursal que operó sin cierre', 'num', '22', 0, 23, null, 'hora (0–23)', false, null, 190),
 ('salud_sync_horas',          'Horas sin sincronizar para marcar una sucursal en el tablero de salud', 'num', '24', 1, 720, null, 'horas', false,
    'Más de 30 días sin sincronizar ya no es un aviso de salud: es una sucursal que dejó de usar el módulo.', 200)
on conflict (clave) do nothing;

-- ───────────────────────────── catálogo de eventos de alerta (catálogo del sistema) ─────────────────────────────
-- «fuente» = de dónde sale el evento (especificación F7.3 o evento propio del sistema); «emite» = qué parte del sistema lo genera hoy.
create table if not exists piefirme.ctl_alerta_catalogo (
  tipo           text primary key,
  nombre         text not null,
  descripcion    text not null,
  canales        text[] not null,
  destinatarios  text[] not null,
  inmediata      boolean not null default true,       -- false = solo entra al resumen diario (no cuenta para el techo)
  severidad      text not null default 'alta' check (severidad in ('baja', 'media', 'alta', 'critica')),
  fuente         text not null check (fuente in ('especificacion', 'sistema')),
  emite          text not null,
  orden          integer not null default 100,
  check (canales <@ array['push', 'whatsapp', 'correo'] and cardinality(canales) > 0),
  check (destinatarios <@ array['dueno', 'supervisor', 'sucursal'])
);

insert into piefirme.ctl_alerta_catalogo (tipo, nombre, descripcion, canales, destinatarios, inmediata, severidad, fuente, emite, orden) values
 ('cancelacion_autorizada',      'Cancelación autorizada', 'Una venta se canceló. Con el volumen de la operación cada cancelación se revisa una por una (F1.3). Hoy se detecta la cancelación en el origen; cuando la Etapa 1 emita «cancelación autorizada» se ligará a ese evento.',
    array['push', 'whatsapp'], array['dueno'], true, 'alta', 'especificacion', 'evaluador del origen (ctl_alertas_programadas)', 10),
 ('venta_alto_valor',            'Venta de pieza de alto valor', 'Se vendió una pieza marcada como de alto valor: qué pieza, en qué sucursal y a qué precio (F5.3).',
    array['push', 'whatsapp'], array['dueno'], true, 'alta', 'especificacion', 'evaluador del origen (ctl_alertas_programadas)', 20),
 ('relevo_con_diferencia',       'Diferencia en relevo de turno (piezas en custodia)', 'El entrante contó la custodia y no cuadra con el sistema (F2.4).',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'especificacion', 'motor de conteo (Etapa 2)', 30),
 ('diferencia_relevo',           'Diferencia en relevo de turno (efectivo)', 'El efectivo contado al recibir el turno no coincide con el entregado (F3.3).',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'especificacion', 'cierres (Etapa 4)', 31),
 ('cierre_fuera_tolerancia',     'Cierre fuera de tolerancia', 'Un punto del cierre quedó fuera de la tolerancia configurada (F3.6).',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'especificacion', 'cierres (Etapa 4)', 40),
 ('sello_roto_sin_registro',     'Sello roto sin registro', 'Un sello VOID aparece roto sin un registro de reapertura (F5.2).',
    array['push'], array['supervisor'], true, 'alta', 'especificacion', 'custodia (Etapa 7)', 50),
 ('folio_talonario_faltante',    'Folio de talonario faltante', 'Falta un folio dentro de un talonario de contingencia (F5.4). Va en el correo diario.',
    array['correo'], array['dueno'], false, 'media', 'especificacion', 'custodia (Etapa 7)', 60),
 ('sin_conteo_apertura',         'Sucursal sin conteo de apertura', 'La sucursal ya operó hoy y nadie hizo el conteo de apertura a la hora configurada.',
    array['push'], array['dueno'], true, 'alta', 'especificacion', 'programada (ctl_alertas_programadas)', 70),
 ('sin_cierre',                  'Sucursal sin cierre', 'La sucursal ya operó hoy y nadie hizo el cierre a la hora configurada.',
    array['push'], array['dueno'], true, 'alta', 'especificacion', 'programada (ctl_alertas_programadas)', 71),
 ('posible_sustitucion_codigo',  'Posible sustitución de código', 'Un producto caro falta y uno barato sobra en la misma sesión, en cantidades compatibles (F2.5).',
    array['push'], array['dueno'], true, 'alta', 'especificacion', 'motor de conteo (Etapa 2)', 80),
 ('kits_sin_ticket',             'Kits usados sin ticket de servicio', 'Se usaron más kits de los servicios cobrados en el turno (F3.4).',
    array['push'], array['dueno'], true, 'alta', 'especificacion', 'cierres (Etapa 4)', 90),
 ('ajuste_fallido',              'Ajuste rechazado por el origen', 'El origen rechazó el ajuste de un caso autorizado; el caso queda en «ajuste fallido» y se puede reintentar (F4.1).',
    array['push'], array['dueno'], true, 'alta', 'especificacion', 'casos (Etapa 3)', 100),
 -- eventos propios del sistema (no están en la tabla de la especificación; se rotulan así)
 ('foto_repetida',               'Foto repetida', 'La foto subida es idéntica (mismo hash) a una anterior de la sucursal (criterio de aceptación 6).',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'sistema', 'evidencia (Etapa 0)', 110),
 ('faltante_con_cancelacion',    'Faltante con cancelación reciente', 'Un faltante coincide con una cancelación reciente del mismo producto (F1.4).',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'sistema', 'motor de conteo (Etapa 2)', 120),
 ('auditoria_remota_expirada',   'Auditoría remota vencida', 'Una auditoría remota venció con productos sin reportar.',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'sistema', 'motor de conteo (Etapa 2)', 130),
 ('auditoria_remota_solicitada', 'Auditoría remota solicitada', 'Aviso al dispositivo de la sucursal: hay una auditoría remota por contestar. No lleva cifras.',
    array['push'], array['sucursal'], true, 'media', 'sistema', 'motor de conteo (Etapa 2)', 140),
 ('sesion_con_diferencias',      'Conteo cerrado con diferencias', 'Un conteo cerró con diferencias (los casos y el tablero ya lo muestran): solo va en el resumen diario.',
    array['correo'], array['dueno', 'supervisor'], false, 'media', 'sistema', 'motor de conteo (Etapa 2)', 150),
 ('apertura_tardia',             'Foto de apertura tardía', 'La foto de apertura se tomó después de la primera venta del día (F3.5).',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'sistema', 'cierres (Etapa 4)', 160),
 ('apertura_sin_cierre_previo',  'Apertura sin foto de cierre previa', 'No hay foto de cierre con la que emparejar la de apertura (F3.5): resumen diario.',
    array['correo'], array['dueno', 'supervisor'], false, 'media', 'sistema', 'cierres (Etapa 4)', 170),
 ('cierre_sin_apertura',         'Cierre sin foto de apertura', 'Hay fotos de cierre pero hoy no hubo foto de apertura (F3.5): resumen diario.',
    array['correo'], array['dueno', 'supervisor'], false, 'media', 'sistema', 'cierres (Etapa 4)', 180),
 ('entrega_liberada',            'Entrega liberada sin aceptación', 'Un supervisor liberó una entrega de turno sin que el entrante la aceptara: resumen diario.',
    array['correo'], array['dueno'], false, 'media', 'sistema', 'cierres (Etapa 4)', 190),
 ('sin_sincronizar',             'Sucursal sin sincronizar', 'La sucursal no ha enviado nada al módulo en más horas de las configuradas (tablero de salud): resumen diario.',
    array['correo'], array['dueno'], false, 'media', 'sistema', 'programada (ctl_alertas_programadas)', 200)
on conflict (tipo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, canales = excluded.canales, destinatarios = excluded.destinatarios,
  inmediata = excluded.inmediata, severidad = excluded.severidad, fuente = excluded.fuente, emite = excluded.emite, orden = excluded.orden;

-- ───────────────────────────── reglas por organización (versionadas: gana la más reciente) ─────────────────────────────
create table if not exists piefirme.ctl_alerta_regla (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  tipo             text not null,
  canales          text[] not null check (canales <@ array['push', 'whatsapp', 'correo'] and cardinality(canales) > 0),
  destinatarios    text[] not null check (destinatarios <@ array['dueno', 'supervisor', 'sucursal'] and cardinality(destinatarios) > 0),
  inmediata        boolean not null default true,
  activa           boolean not null default true,
  motivo           text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_alerta_regla_idx on piefirme.ctl_alerta_regla (organizacion_id, tipo, creado_en desc);

-- ───────────────────────────── destinatarios: techo diario propio (versionado) ─────────────────────────────
create table if not exists piefirme.ctl_alerta_destinatario (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  usuario_id       uuid not null,
  techo_diario     integer check (techo_diario is null or techo_diario between 1 and 200),   -- null = el techo general (alertas_techo_diario)
  recibir          boolean not null default true,
  motivo           text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_alerta_dest_idx on piefirme.ctl_alerta_destinatario (organizacion_id, usuario_id, creado_en desc);

-- ───────────────────────────── lo que se habría enviado (adaptadores SIMULADOS) ─────────────────────────────
-- modo: individual (cuenta para el techo) · aviso_techo (se alcanzó el techo: el resto va agrupado) · pendiente_resumen (espera al resumen diario)
--       · resumen_diario (el resumen ya armado) · sin_destinatario · regla_desactivada
-- simulado = true mientras no haya proveedor (Push/WhatsApp/correo); cuando exista, el envío real inserta una fila nueva con simulado = false.
create table if not exists piefirme.ctl_alerta_envio (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  alerta_id        uuid references piefirme.ctl_alerta(id),
  sucursal_id      uuid,
  destinatario_id  uuid,
  rol_destinatario text,
  canal            text check (canal is null or canal in ('push', 'whatsapp', 'correo')),
  modo             text not null check (modo in ('individual', 'aviso_techo', 'pendiente_resumen', 'resumen_diario', 'sin_destinatario', 'regla_desactivada')),
  asunto           text,
  mensaje          text,
  destino          text,
  payload          jsonb not null default '{}'::jsonb,
  simulado         boolean not null default true,
  fecha_local      date not null,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_envio_dest_idx on piefirme.ctl_alerta_envio (organizacion_id, destinatario_id, fecha_local, modo);
create index if not exists ctl_envio_alerta_idx on piefirme.ctl_alerta_envio (alerta_id);
create unique index if not exists ctl_envio_resumen_uq on piefirme.ctl_alerta_envio (organizacion_id, destinatario_id, fecha_local, canal) where modo = 'resumen_diario';

-- la alerta gana una nota de atención (quien la marca atendida puede dejar qué hizo)
alter table piefirme.ctl_alerta add column if not exists nota_atencion text;
alter table piefirme.ctl_alerta add column if not exists vista_en timestamptz;

-- ───────────────────────────── aperturas de cajón sin venta (F1.5) ─────────────────────────────
-- El origen aún no emite el evento (Etapa 1): cuando lo haga, un registro en ctl_eventos_entrada con evento = 'cajon_abierto_sin_venta' y
-- payload { sucursal_id, usuario_id, caja, motivo?, fecha? } llena esta tabla (trigger 241). Idempotente por evento.
create table if not exists piefirme.ctl_apertura_cajon (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  evento_id        uuid,                                   -- ctl_eventos_entrada.id (sin llave foránea: el origen es intercambiable)
  usuario_id       uuid,
  caja             text,
  motivo           text,
  abierta_en       timestamptz not null,                   -- hora que reporta el origen (referencia); la hora oficial del registro es creado_en
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create unique index if not exists ctl_cajon_evento_uq on piefirme.ctl_apertura_cajon (organizacion_id, evento_id) where evento_id is not null;
create index if not exists ctl_cajon_idx on piefirme.ctl_apertura_cajon (organizacion_id, sucursal_id, abierta_en desc);

-- ───────────────────────────── purga de fotos por retención ─────────────────────────────
create table if not exists piefirme.ctl_evidencia_purga (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  evidencia_id     uuid not null,                          -- sin llave foránea: la evidencia es solo-inserción y se conserva
  url_almacenamiento text not null,
  hash_sha256      text,
  retencion_dias   integer not null,
  capturada_en     timestamptz,
  objeto_borrado   boolean not null default true,          -- false = se anotó pero el objeto no se pudo borrar (se reintenta)
  motivo           text not null default 'retencion',
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create unique index if not exists ctl_purga_evid_uq on piefirme.ctl_evidencia_purga (evidencia_id) where objeto_borrado;
create index if not exists ctl_purga_idx on piefirme.ctl_evidencia_purga (organizacion_id, creado_en desc);

-- ───────────────────────────── índices para el reporte de diferencias ─────────────────────────────
create index if not exists ctl_partida_corrige_idx on piefirme.ctl_partida_conteo (corrige_a) where corrige_a is not null;
create index if not exists ctl_partida_fecha_idx   on piefirme.ctl_partida_conteo (organizacion_id, escaneado_en);
create index if not exists ctl_evid_fecha_idx      on piefirme.ctl_evidencia (organizacion_id, capturado_en);
create index if not exists ctl_alerta_suc_idx      on piefirme.ctl_alerta (organizacion_id, tipo, referencia_id);
create index if not exists ctl_consulta_idx        on piefirme.ctl_bitacora_consulta (organizacion_id, creado_en desc);

-- ───────────────────────────── privilegios, RLS y triggers de las tablas nuevas (mismo patrón de 200/201) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ctl_alerta_catalogo', 'ctl_alerta_regla', 'ctl_alerta_destinatario', 'ctl_alerta_envio', 'ctl_apertura_cajon', 'ctl_evidencia_purga'] loop
    execute format('alter table piefirme.%I enable row level security', t);
    execute format('revoke all on piefirme.%I from public, anon, authenticated', t);
    execute format('grant select on piefirme.%I to authenticated', t);
  end loop;
  -- solo inserción: reglas, destinatarios, envíos, aperturas de cajón y purgas (el catálogo es del sistema y solo lo cambian las migraciones)
  foreach t in array array['ctl_alerta_regla', 'ctl_alerta_destinatario', 'ctl_alerta_envio', 'ctl_apertura_cajon', 'ctl_evidencia_purga'] loop
    execute format('drop trigger if exists t_00_sellar on piefirme.%I', t);
    execute format('create trigger t_00_sellar before insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_sellar()', t);
    execute format('drop trigger if exists t_10_inmutable on piefirme.%I', t);
    execute format('create trigger t_10_inmutable before update or delete on piefirme.%I for each row execute function piefirme_app.ctl_trg_inmutable()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
end $$;
-- (el catálogo se actualiza con migraciones, que corren como dueño de la base: la función deja pasar solo a quien no es la app)
create or replace function piefirme_app.ctl_trg_catalogo_fijo() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'El catálogo de eventos de alerta es del sistema: se cambia con una migración, no desde la app.' using errcode = 'PF403';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists t_10_inmutable on piefirme.ctl_alerta_catalogo;
create trigger t_10_inmutable before update or delete on piefirme.ctl_alerta_catalogo for each row execute function piefirme_app.ctl_trg_catalogo_fijo();

drop policy if exists ctl_alerta_catalogo_sel on piefirme.ctl_alerta_catalogo;
create policy ctl_alerta_catalogo_sel on piefirme.ctl_alerta_catalogo for select to authenticated
  using (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar'));
drop policy if exists ctl_alerta_regla_sel on piefirme.ctl_alerta_regla;
create policy ctl_alerta_regla_sel on piefirme.ctl_alerta_regla for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_alerta_destinatario_sel on piefirme.ctl_alerta_destinatario;
create policy ctl_alerta_destinatario_sel on piefirme.ctl_alerta_destinatario for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_alerta_envio_sel on piefirme.ctl_alerta_envio;
create policy ctl_alerta_envio_sel on piefirme.ctl_alerta_envio for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo') and (sucursal_id is null or piefirme_app.puede_sede(sucursal_id)));
drop policy if exists ctl_apertura_cajon_sel on piefirme.ctl_apertura_cajon;
create policy ctl_apertura_cajon_sel on piefirme.ctl_apertura_cajon for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo') and piefirme_app.puede_sede(sucursal_id));
drop policy if exists ctl_evidencia_purga_sel on piefirme.ctl_evidencia_purga;
create policy ctl_evidencia_purga_sel on piefirme.ctl_evidencia_purga for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));

revoke all on function piefirme_app.ctl_trg_catalogo_fijo() from public, anon, authenticated;
