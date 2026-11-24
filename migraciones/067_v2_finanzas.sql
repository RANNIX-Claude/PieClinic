-- 067 · V2 · Finanzas: gastos recurrentes y notas de compra (captura de notas con IA, con confianza por campo).
-- ADITIVA: solo tablas nuevas y una columna nueva en comprobantes_carga (confianza_campos). No se tocan políticas de gastos/cuentas por pagar.
-- La nota de compra es el borrador revisable que sale de la lectura de un comprobante (comprobantes_carga) o de la captura manual;
--   al «aplicarla» la app crea el gasto (gastos) y, si es a crédito, la cuenta por pagar, y las liga aquí.
-- Roles: administrador y recepción (cajeros/almacén capturan); borrar solo administrador. Por sede (puede_sede).
-- Depende de: 042-046 (grupos_gasto, gastos, cuentas_por_pagar, comprobantes_carga), 040 (proveedores, productos), 064.
set search_path = piefirme, piefirme_app, extensions;

-- confianza por campo de la lectura con IA: {"proveedor":0.98,"fecha":0.91,"total":0.99,"lineas":0.72}
alter table piefirme.comprobantes_carga add column if not exists confianza_campos jsonb not null default '{}'::jsonb;

create table piefirme.gastos_recurrentes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),                 -- nulo = compartido entre sedes
  grupo_id         uuid references piefirme.grupos_gasto(id),
  proveedor_id     uuid references piefirme.proveedores(id),
  concepto         text not null,
  monto            numeric(14,2) not null check (monto >= 0),
  metodo_pago      text not null default 'transferencia',
  frecuencia       text not null check (frecuencia in ('semanal', 'quincenal', 'mensual', 'bimestral', 'anual')),
  dia_del_mes      smallint check (dia_del_mes between 1 and 31),
  fecha_inicio     date not null default current_date,
  fecha_fin        date,
  proxima_fecha    date not null,
  ultima_generada  date,
  activo           boolean not null default true,
  notas            text,
  sintetico        boolean not null default false,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);
create index on piefirme.gastos_recurrentes (organizacion_id, sede_id, activo, proxima_fecha);

create table piefirme.notas_compra (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id               uuid not null references piefirme.sedes(id),
  comprobante_id        uuid references piefirme.comprobantes_carga(id) on delete set null,
  gasto_id              uuid references piefirme.gastos(id) on delete set null,
  cuenta_por_pagar_id   uuid references piefirme.cuentas_por_pagar(id) on delete set null,
  proveedor_id          uuid references piefirme.proveedores(id),
  proveedor_texto       text,
  fecha_nota            date not null,
  folio_nota            text,
  subtotal              numeric(14,2) not null default 0 check (subtotal >= 0),
  iva                   numeric(14,2) not null default 0 check (iva >= 0),
  total                 numeric(14,2) not null default 0 check (total >= 0),
  forma_pago            text not null default 'contado' check (forma_pago in ('contado', 'credito')),
  estado                text not null default 'borrador' check (estado in ('borrador', 'revisada', 'aplicada', 'descartada')),
  fuente                text not null default 'manual' check (fuente in ('ia', 'manual')),
  confianza_global      numeric(4,3) check (confianza_global between 0 and 1),
  confianza_campos      jsonb not null default '{}'::jsonb,            -- {"proveedor":0.98,"fecha":0.91,"folio":0.60,"total":0.99}
  requiere_revision     boolean not null default false,                -- algún campo bajo el umbral de confianza
  capturada_por         uuid default auth.uid(),
  revisada_por          uuid,
  revisada_en           timestamptz,
  notas                 text,
  sintetico             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on piefirme.notas_compra (organizacion_id, sede_id, fecha_nota desc);
create index on piefirme.notas_compra (organizacion_id, estado) where estado in ('borrador', 'revisada');

create table piefirme.notas_compra_lineas (
  id                uuid primary key default gen_random_uuid(),
  organizacion_id   uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id           uuid references piefirme.sedes(id),
  nota_id           uuid not null references piefirme.notas_compra(id) on delete cascade,
  orden             integer not null default 1,
  descripcion       text not null,
  producto_id       uuid references piefirme.productos(id),
  cantidad          numeric(14,3) not null default 1 check (cantidad > 0),
  precio_unitario   numeric(14,4) not null default 0 check (precio_unitario >= 0),
  importe           numeric(14,2) not null default 0 check (importe >= 0),
  confianza         numeric(4,3) check (confianza between 0 and 1),
  created_at        timestamptz not null default now(),
  unique (nota_id, orden)
);
create index on piefirme.notas_compra_lineas (organizacion_id, nota_id);
create trigger t_a_padre before insert on piefirme.notas_compra_lineas for each row execute function piefirme_app.c_heredar_de_padre('notas_compra', 'nota_id');

select piefirme_app.c_triggers('gastos_recurrentes', true);
select piefirme_app.c_triggers('notas_compra', true);

-- gastos recurrentes: los ve y edita el administrador (por sede; los compartidos, sede nula, los ve todo administrador)
select piefirme_app.c_politicas('gastos_recurrentes',
  p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$sede_id is null or piefirme_app.puede_sede(sede_id)$c$,
  p_cond_ins => $c$sede_id is null or piefirme_app.puede_sede(sede_id)$c$,
  p_cond_upd => $c$sede_id is null or piefirme_app.puede_sede(sede_id)$c$,
  p_cond_del => $c$sede_id is null or piefirme_app.puede_sede(sede_id)$c$);
-- notas de compra: administrador y recepción capturan/revisan; solo administrador borra
select piefirme_app.c_politicas('notas_compra',
  p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador'],
  p_cond_upd => $c$estado <> 'aplicada' or piefirme_app.es_admin()$c$);
select piefirme_app.c_politicas('notas_compra_lineas',
  p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador', 'recepcion'],
  p_cond_ver => $c$exists (select 1 from piefirme.notas_compra n where n.id = nota_id)$c$,
  p_cond_ins => $c$exists (select 1 from piefirme.notas_compra n where n.id = nota_id and n.estado in ('borrador', 'revisada'))$c$,
  p_cond_upd => $c$exists (select 1 from piefirme.notas_compra n where n.id = nota_id and n.estado in ('borrador', 'revisada'))$c$,
  p_cond_del => $c$exists (select 1 from piefirme.notas_compra n where n.id = nota_id and n.estado in ('borrador', 'revisada'))$c$);
