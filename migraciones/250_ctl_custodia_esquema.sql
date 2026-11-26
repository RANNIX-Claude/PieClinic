-- 250 · Control y Auditoría · ETAPA 7 · CADENA DE CUSTODIA (1/4): esquema, parámetros, RLS y triggers.
-- Cubre F5.1 (recepción con responsiva), F5.2 (sellos VOID y peso), F5.3 (piezas de alto valor), F5.4 (talonarios, tickets manuales, caídas del sistema).
--   · ctl_sello / ctl_talonario / ctl_ticket_manual / ctl_caida_sistema / ctl_producto_atributo (Etapa 0) ganan columnas y transiciones; nada se borra.
--   · Tablas nuevas de SOLO INSERCIÓN: ctl_recepcion, ctl_recepcion_linea, ctl_sello_verificacion, ctl_sello_verificacion_calculo (lo que el sistema esperaba:
--     solo ver diferencias), ctl_talonario_auditoria, ctl_venta_alto_valor, ctl_caida_resumen (solo ver diferencias), ctl_producto_atributo_bitacora.
--   · Tabla con estado: ctl_pieza (pieza con número de serie: en_sucursal → vendida | retirada).
--   · La sucursal NUNCA lee lo que el sistema espera: ni el peso de la caja llena, ni los sellos vigentes que no colocó, ni las piezas en existencia, ni la venta esperada.
-- Depende de: 200–206, 230–235.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── evidencia: tipos nuevos ─────────────────────────────
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'piefirme.ctl_evidencia'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo_origen%' loop
    execute format('alter table piefirme.ctl_evidencia drop constraint %I', c.conname);
  end loop;
  alter table piefirme.ctl_evidencia add constraint ctl_evidencia_tipo_origen_check
    check (tipo_origen in ('cierre_captura', 'partida_conteo', 'caso', 'cancelacion', 'recepcion', 'toma_fija', 'ticket_manual', 'talonario_auditoria', 'sello'));
end $$;

-- ───────────────────────────── parámetros nuevos (misma validación de topes de la base) ─────────────────────────────
insert into piefirme.ctl_config_def (clave, descripcion, tipo, omision, minimo, tope, opciones, unidad, confirma_dueno, explicacion_tope, orden) values
 ('sello_peso_tolerancia_pct', 'Tolerancia del peso de una caja sellada (±)', 'num', '5', 0, 25, null, '%', false,
    'Con más de 25 % de tolerancia una caja a la que le falta una pieza completa pasa como llena: el peso deja de detectar cajas vacías.', 180),
 ('caidas_frecuentes_n', 'Caídas del sistema para considerar que una sucursal «se cae» seguido', 'num', '3', 2, null, null, 'caídas', false, null, 190),
 ('caidas_ventana_dias', 'Ventana para contar caídas del sistema', 'num', '30', 7, 180, null, 'días', false,
    'Una ventana de más de 180 días mezcla épocas distintas de la tienda y ya no dice si hoy se cae.', 200),
 ('caida_baja_venta_pct', 'Venta de una caída por debajo de la cual se considera baja (% del promedio)', 'num', '50', 1, 100, null, '%', false, null, 210)
on conflict (clave) do nothing;

-- ───────────────────────────── columnas y transiciones de las tablas de la Etapa 0 ─────────────────────────────
alter table piefirme.ctl_sello add column if not exists origen text not null default 'manual';
alter table piefirme.ctl_sello add column if not exists evidencia_id uuid;
alter table piefirme.ctl_sello add column if not exists roto_en timestamptz;
alter table piefirme.ctl_sello add column if not exists caso_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'piefirme.ctl_sello'::regclass and conname = 'ctl_sello_origen_check') then
    alter table piefirme.ctl_sello add constraint ctl_sello_origen_check check (origen in ('manual', 'recepcion', 'reapertura'));
  end if;
end $$;
-- una pieza con número de serie solo tiene UN sello vigente (la serie identifica la pieza, no el modelo)
create unique index if not exists ctl_sello_serie_vigente_uq on piefirme.ctl_sello (organizacion_id, producto_id, numero_serie) where estado = 'vigente' and numero_serie is not null;
create index if not exists ctl_sello_suc_idx on piefirme.ctl_sello (organizacion_id, sucursal_id, estado);

alter table piefirme.ctl_talonario add column if not exists recibido_nombre text;
alter table piefirme.ctl_talonario add column if not exists nota text;
alter table piefirme.ctl_talonario add column if not exists motivo_cancelacion text;
alter table piefirme.ctl_talonario add column if not exists consumido_en timestamptz;
create index if not exists ctl_talonario_suc_idx on piefirme.ctl_talonario (organizacion_id, sucursal_id, estado);

alter table piefirme.ctl_ticket_manual add column if not exists productos jsonb not null default '[]'::jsonb;
alter table piefirme.ctl_ticket_manual add column if not exists caida_id uuid;
alter table piefirme.ctl_ticket_manual add column if not exists hora_venta timestamptz;
alter table piefirme.ctl_ticket_manual add column if not exists nota text;
create index if not exists ctl_ticket_caida_idx on piefirme.ctl_ticket_manual (caida_id) where caida_id is not null;
create index if not exists ctl_ticket_suc_idx on piefirme.ctl_ticket_manual (organizacion_id, sucursal_id, capturado_en desc);

alter table piefirme.ctl_caida_sistema add column if not exists nota text;
create index if not exists ctl_caida_suc_idx on piefirme.ctl_caida_sistema (organizacion_id, sucursal_id, inicio_en desc);
-- una sola caída abierta por sucursal
create unique index if not exists ctl_caida_abierta_uq on piefirme.ctl_caida_sistema (organizacion_id, sucursal_id) where fin_en is null;

insert into piefirme.ctl_transicion (tabla, de, a) values
 ('ctl_sello', 'roto_sin_registro', 'reemplazado'),
 ('ctl_ticket_manual', 'faltante', 'capturado'), ('ctl_ticket_manual', 'faltante', 'cancelado'),
 ('ctl_pieza', 'en_sucursal', 'vendida'), ('ctl_pieza', 'en_sucursal', 'retirada')
on conflict do nothing;

-- ───────────────────────────── ctl_sello_verificacion: cada vez que se revisa un sello (solo inserción) ─────────────────────────────
create table if not exists piefirme.ctl_sello_verificacion (
  id               uuid primary key,                       -- lo genera el cliente: un reenvío choca con la PK y no duplica
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  sello_id         uuid references piefirme.ctl_sello(id),
  folio_sello      text not null,
  producto_id      uuid,
  numero_serie     text,
  intacto          boolean not null,
  peso_medido      numeric(10,3) check (peso_medido is null or peso_medido > 0),   -- gramos (la misma unidad que peso_caja_llena)
  evidencia_id     uuid,
  origen           text not null default 'verificacion' check (origen in ('verificacion', 'recepcion')),
  origen_id        uuid,
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_sverif_idx on piefirme.ctl_sello_verificacion (organizacion_id, sucursal_id, creado_en desc);
create index if not exists ctl_sverif_folio_idx on piefirme.ctl_sello_verificacion (organizacion_id, folio_sello, creado_por, creado_en desc);

-- lo que el sistema esperaba del peso: SOLO ver diferencias (captura a ciegas, mismo patrón que ctl_partida_calculo)
create table if not exists piefirme.ctl_sello_verificacion_calculo (
  verificacion_id  uuid primary key references piefirme.ctl_sello_verificacion(id),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  peso_esperado    numeric(10,3),
  desviacion_pct   numeric(8,2),
  tolerancia_pct   numeric(8,2),
  dentro_tolerancia boolean,
  resultado        text not null check (resultado in ('ok', 'peso_fuera_de_rango', 'sello_roto', 'sin_peso_esperado')),
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

-- ───────────────────────────── recepción con responsiva (F5.1): solo inserción ─────────────────────────────
create table if not exists piefirme.ctl_recepcion (
  id               uuid primary key,                       -- id de cliente (idempotente); las fotos ya se registraron con este id como origen
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  documento        text,                                   -- referencia libre: remisión, traspaso, guía
  nota             text,
  lineas           integer not null check (lineas > 0),
  con_incidencias  boolean not null default false,         -- hubo un sello roto al recibir
  firmada_en       timestamptz not null default now(),     -- hora del servidor del momento de la firma con PIN
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid                                    -- quien recibe y firma: desde aquí la pieza es su responsabilidad
);
create index if not exists ctl_recepcion_suc_idx on piefirme.ctl_recepcion (organizacion_id, sucursal_id, firmada_en desc);

create table if not exists piefirme.ctl_recepcion_linea (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  recepcion_id     uuid not null references piefirme.ctl_recepcion(id),
  producto_id      uuid not null,
  numero_serie     text,
  folio_sello      text,                                   -- el que traía la pieza
  verificacion     text not null check (verificacion in ('sello_intacto', 'abierta_y_resellada', 'sello_roto')),
  nuevo_folio_sello text,                                  -- si se abrió y se resellaron
  sello_id         uuid,                                   -- sello bajo el que queda la pieza
  pieza_id         uuid,                                   -- pieza con serie (alto valor / requiere serie)
  peso_medido      numeric(10,3) check (peso_medido is null or peso_medido > 0),
  evidencia_id     uuid not null,                          -- foto en vivo de la pieza o caja
  responsable_id   uuid not null,
  responsable_desde timestamptz not null default now(),
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_rlinea_idx on piefirme.ctl_recepcion_linea (organizacion_id, recepcion_id);
create index if not exists ctl_rlinea_prod_idx on piefirme.ctl_recepcion_linea (organizacion_id, sucursal_id, producto_id);

-- ───────────────────────────── piezas con número de serie (F5.3) ─────────────────────────────
create table if not exists piefirme.ctl_pieza (
  id               uuid primary key,
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  producto_id      uuid not null,
  numero_serie     text not null check (length(btrim(numero_serie)) between 3 and 60),
  estado           text not null default 'en_sucursal' check (estado in ('en_sucursal', 'vendida', 'retirada')),
  origen           text not null default 'manual' check (origen in ('manual', 'recepcion')),
  sello_id         uuid,
  alta_en          timestamptz not null default now(),
  vendida_en       timestamptz,
  venta_id         uuid,
  motivo_retiro    text,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, producto_id, numero_serie)      -- la serie identifica a la pieza, no al modelo
);
create index if not exists ctl_pieza_suc_idx on piefirme.ctl_pieza (organizacion_id, sucursal_id, estado);

-- venta de una pieza de alto valor ya evaluada (una fila por línea de venta: idempotencia del poleo)
create table if not exists piefirme.ctl_venta_alto_valor (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  venta_id         uuid not null,
  linea_id         uuid not null,
  producto_id      uuid not null,
  numero_serie     text,                                   -- nulo si no se pudo determinar
  candidatas       jsonb not null default '[]'::jsonb,     -- series posibles si había varias piezas del mismo producto en la sucursal
  precio           numeric(14,2) not null,
  ticket           text,
  vendida_en       timestamptz,
  alerta_id        uuid,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (organizacion_id, linea_id)
);
create index if not exists ctl_vav_idx on piefirme.ctl_venta_alto_valor (organizacion_id, sucursal_id, creado_en desc);

-- bitácora de cambios a las banderas del catálogo (quién, cuándo, antes, después)
create table if not exists piefirme.ctl_producto_atributo_bitacora (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  producto_id      uuid not null,
  anterior         jsonb,
  nuevo            jsonb not null,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_pab_idx on piefirme.ctl_producto_atributo_bitacora (organizacion_id, producto_id, creado_en desc);

-- ───────────────────────────── auditoría del talonario (F5.4): solo inserción ─────────────────────────────
create table if not exists piefirme.ctl_talonario_auditoria (
  id               uuid primary key,
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  talonario_id     uuid not null references piefirme.ctl_talonario(id),
  siguiente_folio  integer not null,                       -- el primer folio en blanco que vio el auditor
  evidencia_id     uuid not null,                          -- foto de ese folio en blanco
  capturados       integer not null default 0,
  cancelados       integer not null default 0,
  folios_faltantes integer[] not null default '{}',
  folios_nuevos    integer[] not null default '{}',        -- los que esta auditoría marcó por primera vez
  folios_adelantados integer[] not null default '{}',      -- capturados con folio igual o mayor al «siguiente en blanco»
  continuo         boolean not null,
  caso_id          uuid,
  hora_cliente     timestamptz,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);
create index if not exists ctl_taud_idx on piefirme.ctl_talonario_auditoria (organizacion_id, talonario_id, creado_en desc);

-- ───────────────────────────── resumen de una caída del sistema (venta contra el promedio): solo ver diferencias ─────────────────────────────
create table if not exists piefirme.ctl_caida_resumen (
  caida_id         uuid primary key references piefirme.ctl_caida_sistema(id),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  venta_sistema    numeric(14,2) not null default 0,
  venta_manual     numeric(14,2) not null default 0,
  venta_esperada   numeric(14,2),
  proporcion       numeric(8,2),                           -- % de lo vendido contra lo esperado
  baja             boolean,
  muestras         integer not null default 0,
  creado_en        timestamptz not null default now(),
  creado_por       uuid
);

-- ───────────────────────────── privilegios, RLS y triggers (mismo patrón de 200/201) ─────────────────────────────
do $$
declare t text;
  v_nuevas  text[] := array['ctl_sello_verificacion', 'ctl_sello_verificacion_calculo', 'ctl_recepcion', 'ctl_recepcion_linea', 'ctl_pieza', 'ctl_venta_alto_valor',
                            'ctl_producto_atributo_bitacora', 'ctl_talonario_auditoria', 'ctl_caida_resumen'];
  v_captura text[] := array['ctl_sello_verificacion', 'ctl_sello_verificacion_calculo', 'ctl_recepcion', 'ctl_recepcion_linea', 'ctl_venta_alto_valor',
                            'ctl_producto_atributo_bitacora', 'ctl_talonario_auditoria', 'ctl_caida_resumen'];
begin
  foreach t in array v_nuevas loop
    execute format('alter table piefirme.%I enable row level security', t);
    execute format('revoke all on piefirme.%I from public, anon, authenticated', t);
    execute format('grant select on piefirme.%I to authenticated', t);
    execute format('drop trigger if exists t_00_sellar on piefirme.%I', t);
    execute format('create trigger t_00_sellar before insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_sellar()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
  foreach t in array v_captura loop
    execute format('drop trigger if exists t_10_inmutable on piefirme.%I', t);
    execute format('create trigger t_10_inmutable before update or delete on piefirme.%I for each row execute function piefirme_app.ctl_trg_inmutable()', t);
  end loop;
  drop trigger if exists t_10_estado on piefirme.ctl_pieza;
  create trigger t_10_estado before update or delete on piefirme.ctl_pieza for each row execute function piefirme_app.ctl_trg_estado();
  foreach t in array array['ctl_sello_verificacion', 'ctl_recepcion'] loop
    execute format('drop trigger if exists t_90_hora on piefirme.%I', t);
    execute format('create trigger t_90_hora after insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_hora()', t);
  end loop;
end $$;

-- Políticas.
--  · quien captura ve lo de SU sede que ya sabe (recepciones, verificaciones, caídas, tickets); NO ve lo que el sistema espera.
--  · lo que el sistema espera (piezas en existencia, peso esperado, sellos de otros, ventas de alto valor, resumen de caídas, auditoría del talonario): solo ver_directo.
do $$
declare t text;
begin
  foreach t in array array['ctl_recepcion', 'ctl_recepcion_linea', 'ctl_sello_verificacion'] loop
    execute format('drop policy if exists %I on piefirme.%I', t || '_sel', t);
    execute format($p$create policy %I on piefirme.%I for select to authenticated using (
        organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id)
        and (piefirme_app.ctl_puede('ver_directo') or (piefirme_app.ctl_puede('capturar') and creado_por = auth.uid())))$p$, t || '_sel', t);
  end loop;
  foreach t in array array['ctl_sello_verificacion_calculo', 'ctl_pieza', 'ctl_venta_alto_valor', 'ctl_talonario_auditoria', 'ctl_caida_resumen'] loop
    execute format('drop policy if exists %I on piefirme.%I', t || '_sel', t);
    execute format($p$create policy %I on piefirme.%I for select to authenticated using (
        organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id) and piefirme_app.ctl_puede('ver_directo'))$p$, t || '_sel', t);
  end loop;
  drop policy if exists ctl_producto_atributo_bitacora_sel on piefirme.ctl_producto_atributo_bitacora;
  create policy ctl_producto_atributo_bitacora_sel on piefirme.ctl_producto_atributo_bitacora for select to authenticated
    using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));
end $$;

-- ctl_sello (Etapa 0 lo abría a toda la sede): los sellos vigentes son «lo que el sistema espera» de una pieza; quien captura ve solo los que él mismo colocó.
drop policy if exists ctl_sello_sel on piefirme.ctl_sello;
create policy ctl_sello_sel on piefirme.ctl_sello for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id)
         and (piefirme_app.ctl_puede('ver_directo') or (piefirme_app.ctl_puede('capturar') and colocado_por = auth.uid())));
