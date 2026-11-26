-- 200 · Módulo «Control y Auditoría» · Etapa 0 (cimientos) · ESQUEMA: helpers, folios, tablas ctl_*, triggers de inmutabilidad y de tope.
-- Decisiones (docs/AUDITORIA_ARQUITECTURA.md):
--   · Pie Firme es el «origen» (el PODIX de la especificación). Las tablas del módulo llevan prefijo ctl_ DENTRO del esquema piefirme
--     (un esquema nuevo exigiría exponerlo en la Data API). Las referencias al origen (productos, sedes, perfiles, turnos, ventas)
--     son uuid SIN llave foránea: el módulo podrá apuntar a otro origen o moverse a otro esquema. Solo hay FK entre tablas ctl_.
--   · Captura a ciegas: lo que el sistema «espera» (saldo, diferencia, valor_esperado, precio de catálogo) vive en tablas APARTE
--     (ctl_partida_calculo, ctl_cierre_calculo, ctl_sesion_resultado) a las que solo llegan supervisor, dueño y soporte (201).
--   · Nada se edita: las tablas de captura son solo-inserción (trigger + sin UPDATE/DELETE para la app). Las tablas con estado
--     solo cambian por RPC SECURITY DEFINER (bandera app.ctl_rpc) y con transiciones válidas (ctl_transicion).
--   · Hora del servidor: creado_en lo fija un trigger con now(); la hora del dispositivo va aparte en hora_cliente.
-- Depende de: 001 (organizaciones, perfiles, sedes, helpers piefirme_app), 073 (supervisor, PIN).
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── roles del módulo y capacidades ─────────────────────────────
-- dueño = administrador · supervisor = supervisor · sucursal (encargado/cajero/podólogo) = recepcion|podologo · soporte = rannix_staff.
create or replace function piefirme_app.ctl_rol() returns text
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select case
    when auth.uid() is null then null
    when piefirme_app.es_rannix() then 'soporte'
    else (select case p.rol::text when 'administrador' then 'dueno' when 'supervisor' then 'supervisor'
                                  when 'recepcion' then 'sucursal' when 'podologo' then 'sucursal' end
            from piefirme.perfiles p where p.id = auth.uid() and p.activo)
  end
$$;

-- Matriz de la especificación (Roles y separación de funciones). Única fuente de verdad en el servidor.
-- 'ver_directo' = leer tablas/vistas sensibles por RLS (dueño y supervisor). El soporte RANNIX tiene 'ver_diferencias' pero lee por RPC con bitácora.
create or replace function piefirme_app.ctl_puede(p_cap text) returns boolean
language sql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
  select coalesce(case piefirme_app.ctl_rol()
    when 'dueno'      then p_cap in ('capturar', 'ver_diferencias', 'ver_directo', 'investigar', 'autorizar', 'configurar')
    when 'supervisor' then p_cap in ('capturar', 'ver_diferencias', 'ver_directo', 'investigar')
    when 'sucursal'   then p_cap in ('capturar')
    when 'soporte'    then p_cap in ('ver_diferencias', 'configurar')   -- lee SOLO por ctl_soporte_leer (queda en bitácora): sin ver_directo
  end, false)
$$;

-- Marca la transacción como «dentro de una RPC del módulo»: único modo de modificar tablas con estado.
create or replace function piefirme_app.ctl_rpc_on() returns void language plpgsql as $$ begin perform set_config('app.ctl_rpc', 'on', true); end $$;

-- Guardia común de las RPC: sesión válida, clínica activa y capacidad. Devuelve la organización del usuario.
create or replace function piefirme_app.ctl_exigir(p_cap text) returns uuid
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if auth.uid() is null or v_org is null or not piefirme_app.org_activa() then
    raise exception 'sin sesión válida' using errcode = 'PF401';
  end if;
  if p_cap is not null and not piefirme_app.ctl_puede(p_cap) then
    raise exception 'su rol no tiene permiso para esta operación de auditoría (%)', p_cap using errcode = 'PF403';
  end if;
  return v_org;
end $$;

-- ───────────────────────────── folios consecutivos sin huecos ─────────────────────────────
-- Una fila por (organización, serie, año). El UPDATE bloquea la fila hasta el fin de la transacción: si la transacción se
-- deshace, el contador también (no hay huecos por errores); un hueco solo puede aparecer si alguien borra un registro, y es detectable.
create table if not exists piefirme.ctl_folio_seq (
  organizacion_id uuid not null,
  serie           text not null check (serie in ('SES', 'CIE', 'CAS')),
  anio            integer not null,
  ultimo          integer not null default 0,
  primary key (organizacion_id, serie, anio)
);

create or replace function piefirme_app.ctl_siguiente_folio(p_org uuid, p_serie text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_anio integer; v_n integer;
begin
  v_anio := extract(year from (now() at time zone coalesce((select o.zona_horaria from piefirme.organizaciones o where o.id = p_org), 'America/Mexico_City')))::integer;
  insert into piefirme.ctl_folio_seq as f (organizacion_id, serie, anio, ultimo) values (p_org, p_serie, v_anio, 1)
  on conflict (organizacion_id, serie, anio) do update set ultimo = f.ultimo + 1
  returning f.ultimo into v_n;
  return p_serie || '-' || v_anio || '-' || lpad(v_n::text, 5, '0');
end $$;

-- BEFORE INSERT: el folio siempre lo pone el servidor (lo que mande el cliente se ignora).
create or replace function piefirme_app.ctl_trg_folio() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  new.folio := piefirme_app.ctl_siguiente_folio(new.organizacion_id, tg_argv[0]);
  new.folio_anio := split_part(new.folio, '-', 2)::integer;
  new.folio_num := split_part(new.folio, '-', 3)::integer;
  return new;
end $$;

-- ───────────────────────────── catálogos de referencia ─────────────────────────────
-- Definición de parámetros: valor por omisión, mínimo y TOPE DURO. Es catálogo del sistema (no de la clínica).
create table if not exists piefirme.ctl_config_def (
  clave            text primary key,
  descripcion      text not null,
  tipo             text not null check (tipo in ('num', 'texto')),
  omision          jsonb not null,
  minimo           numeric,
  tope             numeric,
  opciones         text[],
  unidad           text,
  confirma_dueno   boolean not null default false,
  explicacion_tope text,
  orden            integer not null default 100
);

insert into piefirme.ctl_config_def (clave, descripcion, tipo, omision, minimo, tope, opciones, unidad, confirma_dueno, explicacion_tope, orden) values
 ('frecuencia_conteo_completo', 'Frecuencia del conteo completo', 'texto', '"diario_apertura"', null, null, array['diario_apertura', 'semanal', 'solo_manual'], null, false, null, 10),
 ('muestra_aleatoria',          'Tamaño de la muestra aleatoria', 'num', '20', 1, 100, null, 'piezas', false,
    'Una muestra mayor a 100 claves toma tanto tiempo que se termina capturando sin contar, y eso genera evidencia falsa.', 20),
 ('tolerancia_efectivo',        'Tolerancia de efectivo (±)', 'num', '20', 0, null, null, 'MXN', false, null, 30),
 ('tolerancia_kits',            'Tolerancia de kits y piezas', 'num', '0', 0, null, null, 'piezas', true,
    'Una tolerancia mayor a 0 en kits y piezas esconde faltantes reales; solo el dueño puede autorizarla y debe confirmarlo.', 40),
 ('tolerancia_precio_etiqueta', 'Tolerancia de precio de etiqueta', 'num', '0', 0, null, null, 'MXN', false, null, 50),
 ('descuento_sin_clave_pct',    'Tope de descuento sin clave de supervisor', 'num', '0', 0, 15, null, '%', false,
    'Más de 15 % sin clave de supervisor deja sin control el descuento: es la puerta trasera típica del cobro.', 60),
 ('dias_gracia_precio',         'Días de gracia por cambio de precio', 'num', '30', 0, 90, null, 'días', false,
    'Una gracia mayor a 90 días deja pasar etiquetas viejas indefinidamente y deja de detectar fugas de margen.', 70),
 ('retencion_fotos_dias',       'Retención de fotos de evidencia', 'num', '90', 1, 365, null, 'días', false,
    'Guardar imágenes por más de 365 días es un pasivo de datos personales de empleados, no un activo.', 80),
 ('foto_lado_largo_px',         'Lado largo de la foto', 'num', '1600', 320, 2400, null, 'px', false,
    'Fotos mayores a 2,400 px no suben en 3G en menos de 5 segundos y el control se abandona.', 90),
 ('auditoria_remota_limite_min','Tiempo límite de auditoría remota', 'num', '120', 1, null, null, 'min', false, null, 100),
 ('ocupacion_min_min',          'Duración mínima de ocupación contada', 'num', '5', 0, null, null, 'min', false, null, 110),
 ('cancelacion_ventana_dias',   'Ventana para cruzar cancelaciones con faltantes', 'num', '7', 1, null, null, 'días', false, null, 120),
 ('sustitucion_relacion_costo', 'Relación de costo para sospecha de sustitución de código', 'num', '3', 1, null, null, 'a 1', false, null, 130),
 ('alertas_techo_diario',       'Techo diario de alertas por destinatario', 'num', '10', 1, null, null, 'alertas', false, null, 140)
on conflict (clave) do nothing;

-- Transiciones válidas de las tablas con estado (las exige ctl_trg_estado).
create table if not exists piefirme.ctl_transicion (
  tabla text not null, de text not null, a text not null, primary key (tabla, de, a)
);
insert into piefirme.ctl_transicion (tabla, de, a) values
 ('ctl_caso', 'abierta', 'en_investigacion'),
 ('ctl_caso', 'en_investigacion', 'cerrada_con_ajuste'), ('ctl_caso', 'en_investigacion', 'cerrada_sin_ajuste'),
 ('ctl_caso', 'en_investigacion', 'rechazada'), ('ctl_caso', 'en_investigacion', 'ajuste_fallido'),
 ('ctl_caso', 'ajuste_fallido', 'cerrada_con_ajuste'), ('ctl_caso', 'ajuste_fallido', 'en_investigacion'),
 ('ctl_sesion_conteo', 'abierta', 'cerrada'), ('ctl_sesion_conteo', 'abierta', 'expirada'), ('ctl_sesion_conteo', 'abierta', 'cancelada'),
 ('ctl_cierre', 'en_captura', 'cerrado'), ('ctl_cierre', 'en_captura', 'entrega_no_aceptada'), ('ctl_cierre', 'entrega_no_aceptada', 'cerrado'),
 ('ctl_talonario', 'activo', 'consumido'), ('ctl_talonario', 'activo', 'cancelado'),
 ('ctl_sello', 'vigente', 'reemplazado'), ('ctl_sello', 'vigente', 'roto_sin_registro'),
 ('ctl_ticket_manual', 'capturado', 'cancelado'), ('ctl_ticket_manual', 'capturado', 'faltante'),
 ('ctl_atencion', 'abierta', 'cerrada_con_ticket'), ('ctl_atencion', 'abierta', 'cancelada'),
 ('ctl_llamada_origen', 'pendiente', 'aplicada'), ('ctl_llamada_origen', 'pendiente', 'rechazada'),
 ('ctl_llamada_origen', 'rechazada', 'aplicada'), ('ctl_llamada_origen', 'rechazada', 'pendiente'),
 ('ctl_alerta', 'nueva', 'vista'), ('ctl_alerta', 'nueva', 'atendida'), ('ctl_alerta', 'vista', 'atendida'),
 ('ctl_eventos_entrada', 'pendiente', 'procesado'), ('ctl_eventos_entrada', 'pendiente', 'error'), ('ctl_eventos_entrada', 'error', 'procesado')
on conflict do nothing;

-- ───────────────────────────── conteos y auditoría ─────────────────────────────
create table if not exists piefirme.ctl_sesion_conteo (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  folio            text, folio_anio integer, folio_num integer,
  sucursal_id      uuid not null,
  tipo             text not null check (tipo in ('conteo_inicial', 'conteo_apertura', 'auditoria_puntual', 'auditoria_remota', 'relevo_turno')),
  modo_lista       text not null check (modo_lista in ('completa', 'custodia', 'aleatoria', 'libre')),
  estado           text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'expirada', 'cancelada')),
  solicitada_por   uuid,                                   -- nulo si la inició la sucursal
  solicitada_en    timestamptz,
  limite_en        timestamptz,
  abierta_en       timestamptz not null default now(),
  cerrada_en       timestamptz,
  usuario_captura  uuid,
  turno_id         uuid,
  total_partidas   integer not null default 0 check (total_partidas >= 0),
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, folio)
);
create index if not exists ctl_sesion_suc_idx on piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, abierta_en desc);

-- Resultado de la sesión (lo que el sistema esperaba): solo supervisor, dueño y soporte.
create table if not exists piefirme.ctl_sesion_resultado (
  sesion_id             uuid primary key references piefirme.ctl_sesion_conteo(id),
  organizacion_id       uuid not null,
  sucursal_id           uuid not null,
  partidas_con_diferencia integer not null default 0,
  valor_diferencia      numeric(14,2) not null default 0,
  creado_en             timestamptz not null default now(),
  creado_por            uuid
);

create table if not exists piefirme.ctl_partida_conteo (
  id               uuid primary key default gen_random_uuid(),   -- lo genera el cliente: un reenvío no duplica (PK)
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  sesion_id        uuid not null references piefirme.ctl_sesion_conteo(id),
  producto_id      uuid not null,
  codigo_escaneado text not null,
  cantidad_fisica  numeric(14,3) not null check (cantidad_fisica >= 0),
  precio_etiqueta  numeric(14,2) check (precio_etiqueta is null or precio_etiqueta >= 0),
  numero_serie     text,
  folio_sello      text,
  sello_intacto    boolean,
  nota             text,
  escaneado_en     timestamptz not null default now(),
  hora_cliente     timestamptz,
  corrige_a        uuid references piefirme.ctl_partida_conteo(id),   -- las correcciones son filas nuevas que referencian la anterior
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_partida_ses_idx on piefirme.ctl_partida_conteo (organizacion_id, sesion_id);
create index if not exists ctl_partida_prod_idx on piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, producto_id, escaneado_en desc);

-- Lo que el servidor calculó al escanear (saldo congelado, diferencias, precio de catálogo): NUNCA llega a un rol de sucursal.
create table if not exists piefirme.ctl_partida_calculo (
  partida_id           uuid primary key references piefirme.ctl_partida_conteo(id),
  organizacion_id      uuid not null,
  sucursal_id          uuid not null,
  sesion_id            uuid not null,
  producto_id          uuid not null,
  saldo_sistema        numeric(14,3) not null,
  diferencia_piezas    numeric(14,3) not null,
  costo_unitario       numeric(14,4) not null default 0,
  diferencia_valor     numeric(14,2) not null default 0,
  precio_catalogo      numeric(14,2),
  diferencia_precio    numeric(14,2),
  clasificacion_precio text check (clasificacion_precio in ('coincide', 'etiqueta_anterior', 'etiqueta_mal_puesta', 'revisar')),
  creado_en            timestamptz not null default now(),
  creado_por           uuid
);
create index if not exists ctl_calculo_ses_idx on piefirme.ctl_partida_calculo (organizacion_id, sesion_id);

create table if not exists piefirme.ctl_lista_solicitada (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  sesion_id        uuid not null references piefirme.ctl_sesion_conteo(id),
  producto_id      uuid not null,
  reportado        boolean not null default false,
  orden            integer not null default 0,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (sesion_id, producto_id)
);

-- ───────────────────────────── cierres ─────────────────────────────
create table if not exists piefirme.ctl_punto_control (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  grupo_id         uuid,                                   -- identidad del punto a través de sus versiones
  nombre           text not null,
  tipo_captura     text not null check (tipo_captura in ('numero', 'denominaciones', 'conteo_piezas', 'solo_foto', 'numero_y_foto')),
  obligatorio      boolean not null default true,
  aplica_turno     boolean not null default true,
  aplica_dia       boolean not null default false,
  aplica_semanal   boolean not null default false,
  sucursales       uuid[],                                 -- nulo = todas
  formula_esperado text,                                   -- nula = solo evidencia
  tolerancia       numeric(14,2) not null default 0,
  orden            integer not null default 100,
  activo           boolean not null default true,
  version          integer not null default 1,
  vigente_desde    timestamptz not null default now(),
  vigente_hasta    timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_punto_org_idx on piefirme.ctl_punto_control (organizacion_id, grupo_id, version);

create or replace function piefirme_app.ctl_trg_grupo() returns trigger language plpgsql as $$
begin new.grupo_id := coalesce(new.grupo_id, new.id); return new; end $$;

create table if not exists piefirme.ctl_cierre (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  folio            text, folio_anio integer, folio_num integer,
  sucursal_id      uuid not null,
  tipo             text not null check (tipo in ('apertura', 'turno', 'dia', 'semanal')),
  turno_id         uuid,
  usuario_cierra   uuid,
  usuario_recibe   uuid,
  estado           text not null default 'en_captura' check (estado in ('en_captura', 'cerrado', 'entrega_no_aceptada')),
  version_checklist jsonb not null default '[]'::jsonb,    -- [{punto_id, grupo_id, version}] vigentes cuando se abrió el cierre
  abierto_en       timestamptz not null default now(),
  cerrado_en       timestamptz,
  aceptado_en      timestamptz,
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, folio)
);
create index if not exists ctl_cierre_suc_idx on piefirme.ctl_cierre (organizacion_id, sucursal_id, abierto_en desc);

create table if not exists piefirme.ctl_cierre_captura (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  cierre_id        uuid not null references piefirme.ctl_cierre(id),
  punto_control_id uuid not null references piefirme.ctl_punto_control(id),
  valor_capturado  numeric(14,2),
  capturado_en     timestamptz not null default now(),
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_cierre_cap_idx on piefirme.ctl_cierre_captura (organizacion_id, cierre_id);

create table if not exists piefirme.ctl_cierre_calculo (
  cierre_captura_id uuid primary key references piefirme.ctl_cierre_captura(id),
  organizacion_id   uuid not null,
  sucursal_id       uuid not null,
  cierre_id         uuid not null,
  valor_esperado    numeric(14,2),
  diferencia        numeric(14,2),
  dentro_tolerancia boolean,
  creado_en         timestamptz not null default now(),
  creado_por        uuid
);

create table if not exists piefirme.ctl_denominacion (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null,
  sucursal_id       uuid not null,
  cierre_captura_id uuid not null references piefirme.ctl_cierre_captura(id),
  denominacion      numeric(10,2) not null check (denominacion > 0),
  cantidad          integer not null check (cantidad >= 0),
  creado_en         timestamptz not null default now(),
  creado_por        uuid
);

-- ───────────────────────────── evidencia ─────────────────────────────
create table if not exists piefirme.ctl_toma_fija (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null,
  sucursal_id              uuid not null,
  nombre                   text not null,
  aplica                   text not null default 'ambos' check (aplica in ('cierre_apertura', 'semanal', 'ambos')),
  evidencia_referencia_id  uuid,
  activa                   boolean not null default true,
  creado_en                timestamptz not null default now(),
  creado_por               uuid
);

create table if not exists piefirme.ctl_evidencia (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null,
  sucursal_id       uuid not null,
  tipo_origen       text not null check (tipo_origen in ('cierre_captura', 'partida_conteo', 'caso', 'cancelacion', 'recepcion', 'toma_fija')),
  origen_id         uuid,
  url_almacenamiento text not null,                          -- ruta dentro del bucket privado pf-auditoria: <organizacion_id>/ctl/<sucursal_id>/…
  hash_sha256       text not null check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  bytes             integer check (bytes is null or bytes > 0),
  ancho             integer, alto integer,
  capturado_en      timestamptz not null default now(),
  hora_cliente      timestamptz,
  usuario_id        uuid,
  toma_fija_id      uuid references piefirme.ctl_toma_fija(id),
  creado_en         timestamptz not null default now(),
  creado_por        uuid
);
create index if not exists ctl_evid_hash_idx on piefirme.ctl_evidencia (organizacion_id, sucursal_id, hash_sha256);
create index if not exists ctl_evid_origen_idx on piefirme.ctl_evidencia (organizacion_id, tipo_origen, origen_id);

-- ───────────────────────────── casos ─────────────────────────────
create table if not exists piefirme.ctl_causa (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  nombre           text not null,
  requiere_nota    boolean not null default false,
  activo           boolean not null default true,
  orden            integer not null default 100,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, nombre)
);

create table if not exists piefirme.ctl_caso (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  folio            text, folio_anio integer, folio_num integer,
  sucursal_id      uuid not null,
  tipo             text not null check (tipo in ('diferencia_inventario', 'diferencia_efectivo', 'diferencia_precio', 'diferencia_kits', 'diferencia_relevo', 'sello_roto', 'folio_faltante', 'servicio_sin_cobro')),
  origen_tipo      text not null,                           -- partida_conteo | cierre_captura | …  (un caso siempre nace de una captura)
  origen_id        uuid,
  producto_id      uuid,
  cantidad         numeric(14,3),                           -- diferencia con signo (física − sistema); el ajuste lleva este delta
  valor            numeric(14,2),
  estado           text not null default 'abierta' check (estado in ('abierta', 'en_investigacion', 'cerrada_con_ajuste', 'cerrada_sin_ajuste', 'rechazada', 'ajuste_fallido')),
  asignado_a       uuid,
  fecha_compromiso date,
  causa_id         uuid references piefirme.ctl_causa(id),
  responsable_costo text check (responsable_costo in ('empresa', 'proveedor', 'empleado', 'seguro')),   -- registro de control interno: NO es instrucción de descuento a nómina
  monto_costo      numeric(14,2),
  nota_cierre      text,
  usuario_captura  uuid,                                    -- quien capturó la partida/cierre que originó el caso (regla dura de separación)
  turno_saliente_id uuid,
  turno_entrante_id uuid,
  contexto         jsonb not null default '{}'::jsonb,      -- p. ej. cancelación ligada, par de sustitución de código
  autorizado_por   uuid,
  autorizado_en    timestamptz,
  movimiento_origen_id uuid,                                -- id del movimiento que el origen aplicó
  abierto_en       timestamptz not null default now(),
  cerrado_en       timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, folio)
);
create index if not exists ctl_caso_est_idx on piefirme.ctl_caso (organizacion_id, sucursal_id, estado);
create index if not exists ctl_caso_origen_idx on piefirme.ctl_caso (organizacion_id, origen_tipo, origen_id);

create table if not exists piefirme.ctl_caso_bitacora (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid,
  caso_id          uuid not null references piefirme.ctl_caso(id),
  usuario_id       uuid,
  tipo             text not null check (tipo in ('comentario', 'cambio_estado', 'asignacion', 'evidencia')),
  texto            text,
  estado_anterior  text,
  estado_nuevo     text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_caso_bit_idx on piefirme.ctl_caso_bitacora (organizacion_id, caso_id, creado_en);

-- ───────────────────────────── custodia y contingencia ─────────────────────────────
create table if not exists piefirme.ctl_producto_custodia (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  producto_id      uuid not null,
  activo           boolean not null default true,
  desactivado_en   timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, sucursal_id, producto_id)
);

create table if not exists piefirme.ctl_sello (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  folio_sello      text not null,
  producto_id      uuid not null,
  numero_serie     text,
  estado           text not null default 'vigente' check (estado in ('vigente', 'reemplazado', 'roto_sin_registro')),
  colocado_por     uuid,
  colocado_en      timestamptz not null default now(),
  sello_anterior_id uuid references piefirme.ctl_sello(id),
  motivo_reapertura text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, folio_sello)
);

create table if not exists piefirme.ctl_talonario (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  folio_inicial    integer not null,
  folio_final      integer not null,
  entregado_a      uuid,
  entregado_en     timestamptz not null default now(),
  estado           text not null default 'activo' check (estado in ('activo', 'consumido', 'cancelado')),
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  check (folio_final >= folio_inicial)
);

create table if not exists piefirme.ctl_ticket_manual (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  talonario_id     uuid not null references piefirme.ctl_talonario(id),
  folio            integer not null,
  monto            numeric(14,2) not null check (monto >= 0),
  fecha_venta      date,
  capturado_por    uuid,
  capturado_en     timestamptz not null default now(),
  hora_cliente     timestamptz,
  evidencia_id     uuid references piefirme.ctl_evidencia(id),
  estado           text not null default 'capturado' check (estado in ('capturado', 'cancelado', 'faltante')),
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (talonario_id, folio)
);

create table if not exists piefirme.ctl_caida_sistema (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  inicio_en        timestamptz not null,
  fin_en           timestamptz,
  tickets_manuales integer not null default 0,
  detectada_por    text not null default 'manual' check (detectada_por in ('automatica', 'manual')),
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

-- ───────────────────────────── servicios ─────────────────────────────
create table if not exists piefirme.ctl_atencion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  paciente_ref     text,                                    -- referencia opaca: NUNCA datos clínicos
  servicio_id      uuid,
  usuario_atiende  uuid,
  inicio_en        timestamptz not null default now(),
  fin_en           timestamptz,
  estado           text not null default 'abierta' check (estado in ('abierta', 'cerrada_con_ticket', 'cancelada')),
  ticket_id        uuid,
  motivo_cancelacion text,
  autorizado_por   uuid,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

create table if not exists piefirme.ctl_consumo_esperado (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  servicio_id      uuid not null,
  insumo_producto_id uuid not null,
  cantidad         numeric(14,3) not null check (cantidad > 0),
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, servicio_id, insumo_producto_id)
);

create table if not exists piefirme.ctl_ocupacion (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  puesto_id        uuid,
  inicio_en        timestamptz not null,
  fin_en           timestamptz,
  duracion_min     numeric(10,2),
  fuente           text not null default 'manual' check (fuente in ('sensor_peso', 'radar', 'manual')),
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

-- atributos de catálogo que el origen aún no tiene (requiere_serie, requiere_sello, peso_caja_llena, alto valor)
create table if not exists piefirme.ctl_producto_atributo (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  producto_id      uuid not null,
  requiere_serie   boolean not null default false,
  requiere_sello   boolean not null default false,
  alto_valor       boolean not null default false,
  peso_caja_llena  numeric(10,3),
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, producto_id)
);

-- ───────────────────────────── configuración versionada ─────────────────────────────
create table if not exists piefirme.ctl_config (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid,                                    -- nulo = valor global de la organización
  clave            text not null references piefirme.ctl_config_def(clave),
  valor            jsonb not null,
  activa           boolean not null default true,
  confirmado_por   uuid,                                    -- dueño que confirmó (tolerancia de kits > 0)
  modificado_en    timestamptz not null default now(),
  modificado_por   uuid,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create unique index if not exists ctl_config_uq on piefirme.ctl_config (organizacion_id, coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid), clave);

create table if not exists piefirme.ctl_config_bitacora (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid,
  clave            text not null,
  valor_anterior   jsonb,
  valor_nuevo      jsonb,                                   -- nulo = se restableció al valor global/omisión
  motivo           text,
  confirmado_por   uuid,
  creado_en        timestamptz not null default now(),      -- «cuándo»
  creado_por       uuid                                     -- «quién»
);
create index if not exists ctl_config_bit_idx on piefirme.ctl_config_bitacora (organizacion_id, clave, sucursal_id, creado_en desc);

-- ───────────────────────────── bitácoras, eventos, llamadas al origen, alertas, PIN ─────────────────────────────
create table if not exists piefirme.ctl_bitacora_consulta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  usuario_id       uuid,
  rol_ctl          text,
  reporte          text not null,
  filtros          jsonb not null default '{}'::jsonb,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

create table if not exists piefirme.ctl_discrepancia_hora (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid,
  usuario_id       uuid,
  tabla            text not null,
  registro_id      uuid,
  hora_cliente     timestamptz not null,
  hora_servidor    timestamptz not null,
  diferencia_seg   integer not null,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

create table if not exists piefirme.ctl_eventos_entrada (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  evento           text not null check (evento in ('venta_registrada', 'cancelacion_solicitada', 'devolucion_solicitada', 'cajon_abierto_sin_venta', 'precio_modificado_en_catalogo', 'turno_abierto', 'turno_cerrado', 'recepcion_registrada')),
  origen           text not null default 'piefirme',
  id_externo       text,
  payload          jsonb not null default '{}'::jsonb,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'procesado', 'error')),
  procesado_en     timestamptz,
  error            text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create unique index if not exists ctl_evento_idem_uq on piefirme.ctl_eventos_entrada (organizacion_id, origen, id_externo) where id_externo is not null;

create table if not exists piefirme.ctl_llamada_origen (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  folio_caso       text not null,
  sucursal_id      uuid,
  producto_id      uuid,
  peticion         jsonb not null,
  respuesta        jsonb,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'rechazada')),
  movimiento_id    uuid,
  mensaje          text,
  intentos         integer not null default 0,
  ultimo_intento_en timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, folio_caso)                      -- idempotencia por folio_caso
);

create table if not exists piefirme.ctl_alerta (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid,
  tipo             text not null,
  severidad        text not null default 'media' check (severidad in ('baja', 'media', 'alta', 'critica')),
  destinatarios    text[] not null default array['dueno'],
  mensaje          text not null,
  referencia_tipo  text,
  referencia_id    uuid,
  estado           text not null default 'nueva' check (estado in ('nueva', 'vista', 'atendida')),
  atendida_por     uuid,
  atendida_en      timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_alerta_idx on piefirme.ctl_alerta (organizacion_id, estado, creado_en desc);

-- intentos de PIN/contraseña del módulo (el PIN reutiliza pins_personales de la migración 073)
create table if not exists piefirme.ctl_intento (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid not null,
  usuario_id       uuid not null,
  tipo             text not null check (tipo in ('pin', 'password')),
  exito            boolean not null,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_intento_idx on piefirme.ctl_intento (usuario_id, tipo, creado_en desc);

-- sesión de captura ligada al turno: caduca al cerrarse el turno de caja (se valida en ctl_pin_validar_sesion)
create table if not exists piefirme.ctl_sesion_pin (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  perfil_id        uuid not null,
  turno_id         uuid,
  vence_en         timestamptz not null,
  cerrada_en       timestamptz,
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_sesion_pin_idx on piefirme.ctl_sesion_pin (organizacion_id, perfil_id, creado_en desc);

-- ═════════════════════════════ TRIGGERS ═════════════════════════════

-- Sellado de hora y autor en el servidor (el cliente no puede fijarlos).
create or replace function piefirme_app.ctl_trg_sellar() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  new.creado_en := now();
  new.creado_por := coalesce(auth.uid(), new.creado_por);
  case tg_table_name
    when 'ctl_partida_conteo'  then new.escaneado_en := now();
    when 'ctl_cierre_captura'  then new.capturado_en := now();
    when 'ctl_evidencia'       then new.capturado_en := now(); new.usuario_id := coalesce(auth.uid(), new.usuario_id);
    when 'ctl_ticket_manual'   then new.capturado_en := now(); new.capturado_por := coalesce(auth.uid(), new.capturado_por);
    when 'ctl_sesion_conteo'   then new.abierta_en := now();
    when 'ctl_cierre'          then new.abierto_en := now();
    when 'ctl_caso'            then new.abierto_en := now();
    when 'ctl_config'          then new.modificado_en := now(); new.modificado_por := coalesce(auth.uid(), new.modificado_por);
    else null;
  end case;
  return new;
end $$;

-- Solo inserción: ni UPDATE ni DELETE ni TRUNCATE (las correcciones son filas nuevas). Única salida: la purga de datos de prueba.
create or replace function piefirme_app.ctl_trg_inmutable() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('app.ctl_purga', true), '') = 'on' then return old; end if;
  raise exception 'Los registros de % son evidencia y no se modifican ni se borran: registre una corrección como fila nueva.', tg_table_name using errcode = 'PF403';
end $$;

create or replace function piefirme_app.ctl_trg_inmutable_stmt() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
begin
  if coalesce(current_setting('app.ctl_purga', true), '') = 'on' then return null; end if;
  raise exception 'Los registros de % son evidencia y no se vacían.', tg_table_name using errcode = 'PF403';
end $$;

-- Tablas con estado: solo cambian dentro de una RPC del módulo (app.ctl_rpc), sin tocar identidad/autoría y con transiciones válidas.
create or replace function piefirme_app.ctl_trg_estado() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
declare k text; v_old text; v_new text;
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.ctl_purga', true), '') = 'on' then return old; end if;
    raise exception 'Los registros de % no se borran.', tg_table_name using errcode = 'PF403';
  end if;
  if coalesce(current_setting('app.ctl_rpc', true), '') <> 'on' then
    raise exception 'Los registros de % solo cambian mediante las operaciones del módulo de auditoría.', tg_table_name using errcode = 'PF403';
  end if;
  foreach k in array array['id', 'organizacion_id', 'creado_en', 'creado_por', 'folio', 'folio_anio', 'folio_num', 'sucursal_id'] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'El campo % de % no se puede cambiar.', k, tg_table_name using errcode = 'PF403';
    end if;
  end loop;
  v_old := to_jsonb(old) ->> 'estado'; v_new := to_jsonb(new) ->> 'estado';
  if v_old is distinct from v_new and not exists (select 1 from piefirme.ctl_transicion t where t.tabla = tg_table_name and t.de = v_old and t.a = v_new) then
    raise exception 'Transición no permitida en %: % → %', tg_table_name, v_old, v_new using errcode = 'PF409';
  end if;
  return new;
end $$;

-- Diferencia entre el reloj del dispositivo y el del servidor (> 5 min se registra).
create or replace function piefirme_app.ctl_registrar_discrepancia_hora(p_org uuid, p_sucursal uuid, p_tabla text, p_registro uuid, p_hora_cliente timestamptz) returns boolean
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_dif integer;
begin
  if p_hora_cliente is null then return false; end if;
  v_dif := round(extract(epoch from (p_hora_cliente - now())))::integer;
  if abs(v_dif) <= 300 then return false; end if;
  insert into piefirme.ctl_discrepancia_hora (organizacion_id, sucursal_id, usuario_id, tabla, registro_id, hora_cliente, hora_servidor, diferencia_seg, creado_por)
  values (p_org, p_sucursal, auth.uid(), p_tabla, p_registro, p_hora_cliente, now(), v_dif, auth.uid());
  return true;
end $$;

create or replace function piefirme_app.ctl_trg_hora() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.hora_cliente is not null then
    perform piefirme_app.ctl_registrar_discrepancia_hora(new.organizacion_id, nullif(to_jsonb(new) ->> 'sucursal_id', '')::uuid, tg_table_name, new.id, new.hora_cliente);
  end if;
  return null;
end $$;

-- Tope duro de 30 productos activos en custodia por sucursal (mensaje con el porqué). Bloqueo asesor para evitar carreras.
create or replace function piefirme_app.ctl_trg_custodia_tope() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
declare v_n integer;
begin
  if not new.activo then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('ctl_custodia:' || new.organizacion_id || ':' || new.sucursal_id, 0));
  select count(*) into v_n from piefirme.ctl_producto_custodia c
   where c.organizacion_id = new.organizacion_id and c.sucursal_id = new.sucursal_id and c.activo and c.id <> new.id;
  if v_n >= 30 then
    raise exception 'No se pueden tener más de 30 productos en custodia por sucursal. Con más piezas el relevo de turno pasa de dos minutos a veinte, el personal terminaría capturando sin contar y eso genera evidencia falsa, que es peor que no tener control. Retire un producto de la custodia antes de agregar otro.'
      using errcode = 'PF422';
  end if;
  return new;
end $$;

-- Topes duros de configuración (validados en base de datos, no solo en la app).
create or replace function piefirme_app.ctl_trg_config_valida() returns trigger
language plpgsql set search_path = piefirme, piefirme_app, pg_temp as $$
declare d piefirme.ctl_config_def%rowtype; n numeric;
begin
  select * into d from piefirme.ctl_config_def where clave = new.clave;
  if not found then raise exception 'parámetro desconocido: %', new.clave using errcode = 'PF400'; end if;
  if d.tipo = 'num' then
    if jsonb_typeof(new.valor) <> 'number' then raise exception '% debe ser un número', d.descripcion using errcode = 'PF400'; end if;
    n := (new.valor #>> '{}')::numeric;
    if d.minimo is not null and n < d.minimo then raise exception '% no puede ser menor a % %', d.descripcion, d.minimo, coalesce(d.unidad, '') using errcode = 'PF422'; end if;
    if d.tope is not null and n > d.tope then
      raise exception 'El tope del sistema para «%» es % %. %', d.descripcion, d.tope, coalesce(d.unidad, ''), coalesce(d.explicacion_tope, '') using errcode = 'PF422';
    end if;
    if d.confirma_dueno and n > 0 then
      if new.confirmado_por is null or not exists (select 1 from piefirme.perfiles p where p.id = new.confirmado_por and p.organizacion_id = new.organizacion_id and p.rol::text = 'administrador' and p.activo) then
        raise exception '«%» mayor a 0 solo se acepta con la confirmación expresa del dueño. %', d.descripcion, coalesce(d.explicacion_tope, '') using errcode = 'PF422';
      end if;
    end if;
  else
    if jsonb_typeof(new.valor) <> 'string' or not ((new.valor #>> '{}') = any (coalesce(d.opciones, '{}'))) then
      raise exception '% debe ser uno de: %', d.descripcion, array_to_string(d.opciones, ', ') using errcode = 'PF422';
    end if;
  end if;
  return new;
end $$;

-- Hash repetido en la misma sucursal → alerta (criterio 6).
create or replace function piefirme_app.ctl_trg_evidencia_hash() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_previa uuid;
begin
  select e.id into v_previa from piefirme.ctl_evidencia e
   where e.organizacion_id = new.organizacion_id and e.sucursal_id = new.sucursal_id and e.hash_sha256 = new.hash_sha256 and e.id <> new.id
   order by e.capturado_en limit 1;
  if v_previa is not null then
    insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
    values (new.organizacion_id, new.sucursal_id, 'foto_repetida', 'alta', array['dueno', 'supervisor'],
            'La foto subida es idéntica (mismo hash) a una anterior de la misma sucursal: es la misma imagen.', 'evidencia', new.id);
  end if;
  return null;
end $$;

-- Registro de triggers por clase de tabla
do $$
declare t text;
  v_captura text[] := array['ctl_sesion_resultado', 'ctl_partida_conteo', 'ctl_partida_calculo', 'ctl_cierre_captura', 'ctl_cierre_calculo', 'ctl_denominacion',
                            'ctl_evidencia', 'ctl_caso_bitacora', 'ctl_config_bitacora', 'ctl_bitacora_consulta', 'ctl_discrepancia_hora', 'ctl_intento'];
  v_estado  text[] := array['ctl_sesion_conteo', 'ctl_lista_solicitada', 'ctl_punto_control', 'ctl_cierre', 'ctl_toma_fija', 'ctl_causa', 'ctl_caso', 'ctl_producto_custodia',
                            'ctl_sello', 'ctl_talonario', 'ctl_ticket_manual', 'ctl_caida_sistema', 'ctl_atencion', 'ctl_consumo_esperado', 'ctl_ocupacion',
                            'ctl_producto_atributo', 'ctl_config', 'ctl_eventos_entrada', 'ctl_llamada_origen', 'ctl_alerta', 'ctl_sesion_pin'];
  v_hora    text[] := array['ctl_sesion_conteo', 'ctl_partida_conteo', 'ctl_cierre', 'ctl_cierre_captura', 'ctl_evidencia', 'ctl_ticket_manual', 'ctl_sesion_pin'];
begin
  foreach t in array v_captura || v_estado loop
    execute format('drop trigger if exists t_00_sellar on piefirme.%I', t);
    execute format('create trigger t_00_sellar before insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_sellar()', t);
  end loop;
  foreach t in array v_captura loop
    execute format('drop trigger if exists t_10_inmutable on piefirme.%I', t);
    execute format('create trigger t_10_inmutable before update or delete on piefirme.%I for each row execute function piefirme_app.ctl_trg_inmutable()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
  foreach t in array v_estado loop
    execute format('drop trigger if exists t_10_estado on piefirme.%I', t);
    execute format('create trigger t_10_estado before update or delete on piefirme.%I for each row execute function piefirme_app.ctl_trg_estado()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
  foreach t in array v_hora loop
    execute format('drop trigger if exists t_90_hora on piefirme.%I', t);
    execute format('create trigger t_90_hora after insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_hora()', t);
  end loop;
end $$;

drop trigger if exists t_01_folio on piefirme.ctl_sesion_conteo;
create trigger t_01_folio before insert on piefirme.ctl_sesion_conteo for each row execute function piefirme_app.ctl_trg_folio('SES');
drop trigger if exists t_01_folio on piefirme.ctl_cierre;
create trigger t_01_folio before insert on piefirme.ctl_cierre for each row execute function piefirme_app.ctl_trg_folio('CIE');
drop trigger if exists t_01_folio on piefirme.ctl_caso;
create trigger t_01_folio before insert on piefirme.ctl_caso for each row execute function piefirme_app.ctl_trg_folio('CAS');
drop trigger if exists t_02_grupo on piefirme.ctl_punto_control;
create trigger t_02_grupo before insert on piefirme.ctl_punto_control for each row execute function piefirme_app.ctl_trg_grupo();
drop trigger if exists t_20_tope on piefirme.ctl_producto_custodia;
create trigger t_20_tope before insert or update on piefirme.ctl_producto_custodia for each row execute function piefirme_app.ctl_trg_custodia_tope();
drop trigger if exists t_20_valida on piefirme.ctl_config;
create trigger t_20_valida before insert or update on piefirme.ctl_config for each row execute function piefirme_app.ctl_trg_config_valida();
drop trigger if exists t_91_hash on piefirme.ctl_evidencia;
create trigger t_91_hash after insert on piefirme.ctl_evidencia for each row execute function piefirme_app.ctl_trg_evidencia_hash();

-- ═════════════════════════════ valores iniciales por organización ═════════════════════════════
create or replace function piefirme_app.ctl_sembrar_org(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.ctl_causa (organizacion_id, nombre, requiere_nota, orden) values
    (p_org, 'Robo', false, 10),
    (p_org, 'Merma o producto dañado', false, 20),
    (p_org, 'Error de captura en venta', false, 30),
    (p_org, 'Entrada de mercancía no registrada', false, 40),
    (p_org, 'Traspaso no registrado', false, 50),
    (p_org, 'Error en el conteo', false, 60),
    (p_org, 'Otra', true, 70)
  on conflict (organizacion_id, nombre) do nothing;
  if not exists (select 1 from piefirme.ctl_punto_control where organizacion_id = p_org) then
    insert into piefirme.ctl_punto_control (organizacion_id, nombre, tipo_captura, obligatorio, aplica_turno, aplica_dia, formula_esperado, tolerancia, orden) values
      (p_org, 'Efectivo en caja (desglose por denominación)', 'denominaciones', true, true, true, 'efectivo_esperado', 20, 10),
      (p_org, 'Total del terminal de tarjeta', 'numero_y_foto', true, true, true, 'tarjeta_esperada', 0, 20),
      (p_org, 'Kits de servicio que quedan', 'conteo_piezas', true, true, true, 'kits_usados', 0, 30),
      (p_org, 'Foto de la toma fija del mostrador', 'solo_foto', true, true, true, null, 0, 40),
      (p_org, 'Foto del efectivo entregado', 'solo_foto', false, true, false, null, 0, 50);
  end if;
end $$;

create or replace function piefirme_app.ctl_trg_org_sembrar() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin perform piefirme_app.ctl_sembrar_org(new.id); return null; end $$;
drop trigger if exists t_ctl_sembrar on piefirme.organizaciones;
create trigger t_ctl_sembrar after insert on piefirme.organizaciones for each row execute function piefirme_app.ctl_trg_org_sembrar();
select piefirme_app.ctl_sembrar_org(id) from piefirme.organizaciones;
