-- 210 · Control y Auditoría · ETAPA 2 (motor de conteo) · ESQUEMA: columnas nuevas, entregas de turno, saldo de arranque, parámetros.
-- Un solo motor de conteo con cinco modos sobre ctl_sesion_conteo / ctl_partida_conteo / ctl_lista_solicitada (modelo de la especificación).
-- Captura a ciegas (D5): lo nuevo que el sistema «esperaba» vive en tablas aparte con RLS de revisión; las columnas nuevas de las tablas
-- legibles por sucursal son solo de operación (grupo, límite, tiempos de respuesta), nunca saldo ni diferencia.
-- Depende de: 200–206.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── ctl_sesion_conteo: auditoría remota, precio de etiqueta, tiempos ─────────────────────────────
alter table piefirme.ctl_sesion_conteo
  add column if not exists grupo_id          uuid,           -- sesiones lanzadas juntas por una misma auditoría remota
  add column if not exists tamano_muestra    integer check (tamano_muestra is null or tamano_muestra between 1 and 100),   -- tope duro de la muestra
  add column if not exists incluir_recientes boolean not null default false,   -- «salvo que la sesión lo pida explícitamente» (contados en 24 h)
  add column if not exists pide_precio       boolean not null default false,   -- el punto exige el precio de etiqueta
  add column if not exists motivo            text,           -- por qué se lanzó a UNA sola sucursal (la excepción)
  add column if not exists motivo_cierre     text,           -- cancelación / expiración
  add column if not exists recibida_en       timestamptz,    -- cuándo la sucursal abrió la sesión (avance en vivo)
  add column if not exists respuesta_seg     integer check (respuesta_seg is null or respuesta_seg >= 0),   -- tiempo hasta abrirla (auditoría remota)
  add column if not exists duracion_seg      integer check (duracion_seg is null or duracion_seg >= 0);     -- de la solicitud (o apertura) al cierre
create index if not exists ctl_sesion_grupo_idx on piefirme.ctl_sesion_conteo (organizacion_id, grupo_id) where grupo_id is not null;
-- una sola sesión abierta por sucursal y modo (evita sesiones apiladas y capturas repartidas)
create unique index if not exists ctl_sesion_abierta_uq on piefirme.ctl_sesion_conteo (organizacion_id, sucursal_id, tipo) where estado = 'abierta';

-- ───────────────────────────── ctl_sesion_resultado: más detalle del cierre (solo ver diferencias) ─────────────────────────────
alter table piefirme.ctl_sesion_resultado
  add column if not exists valor_faltante      numeric(14,2) not null default 0,
  add column if not exists valor_sobrante      numeric(14,2) not null default 0,
  add column if not exists no_reportadas       integer not null default 0,         -- pedidas en la lista y nadie las reportó: el silencio es dato
  add column if not exists valor_no_reportado  numeric(14,2) not null default 0,   -- saldo × costo de lo no reportado (valor en riesgo)
  add column if not exists casos_abiertos      integer not null default 0;

-- ───────────────────────────── ctl_partida_calculo: clasificación hecha por el auditor ─────────────────────────────
alter table piefirme.ctl_partida_calculo add column if not exists clasificacion_manual boolean not null default false;

-- ───────────────────────────── entregas de turno (relevo con conteo de la custodia) ─────────────────────────────
-- Una fila por turno entrante. Estados: contando → por_aceptar | con_diferencia → aceptada | aceptada_con_diferencia ; entrega_no_aceptada
-- cuando el saliente cerró y pasó la espera sin que el entrante aceptara (también la crea el servidor si el entrante ni empezó).
create table if not exists piefirme.ctl_entrega_turno (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null,
  sucursal_id        uuid not null,
  sesion_id          uuid references piefirme.ctl_sesion_conteo(id),
  turno_saliente_id  uuid,
  turno_entrante_id  uuid,
  usuario_saliente   uuid,
  usuario_entrante   uuid,
  estado             text not null default 'contando' check (estado in ('contando', 'por_aceptar', 'con_diferencia', 'aceptada', 'aceptada_con_diferencia', 'entrega_no_aceptada', 'cancelada')),
  contados           integer,                       -- cuántas piezas distintas de la custodia contó el entrante
  en_custodia        integer,                       -- cuántas había en la lista de custodia
  aceptada_en        timestamptz,
  aceptada_por       uuid,
  firma_entrante_en  timestamptz,
  firma_saliente_en  timestamptz,
  no_aceptada_en     timestamptz,                   -- cuándo el servidor la marcó entrega_no_aceptada
  creado_en          timestamptz not null default now(),
  creado_por         uuid
);
create unique index if not exists ctl_entrega_entrante_uq on piefirme.ctl_entrega_turno (organizacion_id, turno_entrante_id) where turno_entrante_id is not null and estado <> 'cancelada';
create index if not exists ctl_entrega_suc_idx on piefirme.ctl_entrega_turno (organizacion_id, sucursal_id, creado_en desc);

insert into piefirme.ctl_transicion (tabla, de, a) values
 ('ctl_entrega_turno', 'contando', 'por_aceptar'), ('ctl_entrega_turno', 'contando', 'con_diferencia'), ('ctl_entrega_turno', 'contando', 'cancelada'),
 ('ctl_entrega_turno', 'contando', 'entrega_no_aceptada'), ('ctl_entrega_turno', 'por_aceptar', 'aceptada'), ('ctl_entrega_turno', 'por_aceptar', 'entrega_no_aceptada'),
 ('ctl_entrega_turno', 'por_aceptar', 'cancelada'), ('ctl_entrega_turno', 'con_diferencia', 'aceptada_con_diferencia'), ('ctl_entrega_turno', 'con_diferencia', 'entrega_no_aceptada'),
 ('ctl_entrega_turno', 'entrega_no_aceptada', 'contando'), ('ctl_entrega_turno', 'entrega_no_aceptada', 'por_aceptar'), ('ctl_entrega_turno', 'entrega_no_aceptada', 'con_diferencia'),
 ('ctl_entrega_turno', 'entrega_no_aceptada', 'aceptada'), ('ctl_entrega_turno', 'entrega_no_aceptada', 'aceptada_con_diferencia'), ('ctl_entrega_turno', 'entrega_no_aceptada', 'cancelada')
on conflict do nothing;

-- ───────────────────────────── saldo de arranque (efecto del conteo inicial) ─────────────────────────────
-- El conteo inicial NO genera casos ni toca el inventario del origen: deja constancia de lo contado y de lo que el origen decía.
-- Solo ver_directo (lleva la cifra del sistema).
create table if not exists piefirme.ctl_saldo_arranque (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null,
  sucursal_id      uuid not null,
  sesion_id        uuid not null references piefirme.ctl_sesion_conteo(id),
  producto_id      uuid not null,
  cantidad_contada numeric(14,3) not null,
  cantidad_origen  numeric(14,3) not null,         -- lo que el origen tenía al escanear (referencia para quien decida aplicarlo)
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  unique (sesion_id, producto_id)
);

-- ───────────────────────────── privilegios, RLS y triggers de las tablas nuevas (mismo patrón que 200/201) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ctl_entrega_turno', 'ctl_saldo_arranque'] loop
    execute format('alter table piefirme.%I enable row level security', t);
    execute format('revoke all on piefirme.%I from public, anon, authenticated', t);
    execute format('grant select on piefirme.%I to authenticated', t);
    execute format('drop trigger if exists t_00_sellar on piefirme.%I', t);
    execute format('create trigger t_00_sellar before insert on piefirme.%I for each row execute function piefirme_app.ctl_trg_sellar()', t);
    execute format('drop trigger if exists t_11_vaciar on piefirme.%I', t);
    execute format('create trigger t_11_vaciar before truncate on piefirme.%I for each statement execute function piefirme_app.ctl_trg_inmutable_stmt()', t);
  end loop;
end $$;
drop trigger if exists t_10_estado on piefirme.ctl_entrega_turno;
create trigger t_10_estado before update or delete on piefirme.ctl_entrega_turno for each row execute function piefirme_app.ctl_trg_estado();
drop trigger if exists t_10_inmutable on piefirme.ctl_saldo_arranque;
create trigger t_10_inmutable before update or delete on piefirme.ctl_saldo_arranque for each row execute function piefirme_app.ctl_trg_inmutable();

-- la entrega la ven quien captura (el entrante y el saliente necesitan ver el estado) y quien revisa
drop policy if exists ctl_entrega_turno_sel on piefirme.ctl_entrega_turno;
create policy ctl_entrega_turno_sel on piefirme.ctl_entrega_turno for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id) and (piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('ver_directo')));
drop policy if exists ctl_saldo_arranque_sel on piefirme.ctl_saldo_arranque;
create policy ctl_saldo_arranque_sel on piefirme.ctl_saldo_arranque for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id) and piefirme_app.ctl_puede('ver_directo'));

-- ───────────────────────────── parámetros nuevos (con la misma validación de topes de la base) ─────────────────────────────
insert into piefirme.ctl_config_def (clave, descripcion, tipo, omision, minimo, tope, opciones, unidad, confirma_dueno, explicacion_tope, orden) values
 ('aleatoria_excluir_horas', 'Horas sin recontar un producto en la lista aleatoria', 'num', '24', 0, 168, null, 'horas', false,
    'Más de una semana sin recontar deja fuera de la muestra justo lo que se contó, y la muestra deja de ser aleatoria.', 150),
 ('relevo_espera_min', 'Minutos de espera para que el entrante acepte la entrega', 'num', '30', 1, 480, null, 'min', false,
    'Más de 8 horas de espera equivale a no controlar el relevo: la entrega se acepta «después» y nadie verifica.', 160),
 ('relevo_ventana_horas', 'Ventana para considerar relevo el turno anterior de la sucursal', 'num', '12', 1, 48, null, 'horas', false,
    'Un turno de hace más de dos días ya no es un relevo: es otra jornada.', 170)
on conflict (clave) do nothing;

-- ───────────────────────────── vista de revisión de sesiones con el detalle nuevo (al final: create or replace solo agrega columnas) ─────────────────────────────
create or replace view piefirme.ctl_sesion_revision with (security_invoker = true) as
  select s.id, s.organizacion_id, s.folio, s.sucursal_id, s.tipo, s.modo_lista, s.estado, s.solicitada_por, s.solicitada_en, s.limite_en, s.abierta_en,
         s.cerrada_en, s.usuario_captura, s.turno_id, s.total_partidas, r.partidas_con_diferencia, r.valor_diferencia,
         (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id and not l.reportado) as no_reportadas,
         s.grupo_id, s.tamano_muestra, s.recibida_en, s.respuesta_seg, s.duracion_seg, s.motivo, s.motivo_cierre,
         r.valor_faltante, r.valor_sobrante, r.valor_no_reportado, r.casos_abiertos
    from piefirme.ctl_sesion_conteo s
    left join piefirme.ctl_sesion_resultado r on r.sesion_id = s.id
   where piefirme_app.ctl_puede('ver_diferencias');
grant select on piefirme.ctl_sesion_revision to authenticated;
revoke all on piefirme.ctl_sesion_revision from anon, public;
