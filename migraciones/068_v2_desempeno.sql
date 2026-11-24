-- 068 · V2 · Desempeño: bonos (esquemas, cálculo, detalle), metas por sucursal y mes, evaluaciones de servicio y vendedor de la venta.
-- ADITIVA: tablas nuevas + ventas.vendedor_id. `metas` (por rango de fechas, 052) NO se toca: las metas mensuales por sucursal viven en metas_mensuales.
-- Vendedor de una venta = coalesce(ventas.vendedor_id, ventas.cajero_id). La sede de la venta (ventas.sede_id) es la sucursal «trabajando en» de quien vende ese día.
-- Bonos: el esquema define base, escalones y condiciones; el cálculo lo hace la app/función servidor y deja bonos_calculados + bono_detalle (ventas atribuidas).
-- Depende de: 026 (ventas), 050 (empleados), 052, 055 (encuestas), 023 (citas), 064.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── vendedor de la venta ─────────────────────────────
alter table piefirme.ventas add column if not exists vendedor_id uuid references piefirme.perfiles(id);
create index if not exists ventas_vendedor_idx on piefirme.ventas (organizacion_id, vendedor_id, created_at desc) where vendedor_id is not null;

-- ───────────────────────────── esquemas de bono ─────────────────────────────
create table piefirme.bono_esquemas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  nombre           text not null,
  descripcion      text,
  tipo             text not null check (tipo in ('individual', 'sucursal')),
  periodo          text not null default 'mensual' check (periodo in ('mensual', 'trimestral')),
  base             text not null check (base in ('ventas_total', 'ventas_servicios', 'ventas_productos', 'citas_atendidas', 'cumplimiento_meta', 'calificacion_promedio')),
  tipo_pago        text not null default 'monto' check (tipo_pago in ('monto', 'porcentaje')),   -- monto fijo por escalón o % de la base
  escalones        jsonb not null default '[]'::jsonb,                -- [{"desde":50000,"valor":800},{"desde":70000,"valor":1500}] ordenados por «desde»
  cargos           text[] not null default '{}',                      -- cargos elegibles; vacío = todos
  sedes            uuid[] not null default '{}',                      -- sedes donde aplica; vacío = todas
  condiciones      jsonb not null default '{}'::jsonb,                -- {"asistencia_min_pct":95,"calificacion_min":4.5,"sin_incidencias_graves":true}
  vigente_desde    date not null default current_date,
  vigente_hasta    date,
  activo           boolean not null default true,
  sintetico        boolean not null default false,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (jsonb_typeof(escalones) = 'array'),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  check (cargos <@ array['direccion', 'admin', 'gerente', 'almacen', 'cajero', 'recepcion', 'asistente', 'podologo']::text[])
);
create index on piefirme.bono_esquemas (organizacion_id, activo, tipo);

create table piefirme.bonos_calculados (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  esquema_id         uuid not null references piefirme.bono_esquemas(id),
  empleado_id        uuid references piefirme.empleados(id) on delete cascade,   -- bono individual
  sede_id            uuid references piefirme.sedes(id),                          -- bono de sucursal (o sede donde se generó el individual)
  periodo_inicio     date not null,
  periodo_fin        date not null,
  periodo_etiqueta   text not null,                                   -- '2026-10' | '2026-T3'
  base_valor         numeric(14,2) not null default 0,
  meta_valor         numeric(14,2),
  escalon            jsonb,                                            -- escalón alcanzado
  monto              numeric(14,2) not null default 0 check (monto >= 0),
  cumple_condiciones boolean not null default true,
  estado             text not null default 'calculado' check (estado in ('calculado', 'autorizado', 'pagado', 'cancelado')),
  autorizado_por     uuid,
  autorizado_en      timestamptz,
  pagado_en          timestamptz,
  notas              text,
  sintetico          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (periodo_fin >= periodo_inicio),
  check (empleado_id is not null or sede_id is not null)
);
create unique index bonos_calculados_uq on piefirme.bonos_calculados
  (esquema_id, periodo_inicio, coalesce(empleado_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(sede_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on piefirme.bonos_calculados (organizacion_id, periodo_etiqueta, estado);
create index on piefirme.bonos_calculados (organizacion_id, empleado_id, periodo_inicio desc);

create table piefirme.bono_detalle (
  id                  uuid primary key default gen_random_uuid(),
  organizacion_id     uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id             uuid references piefirme.sedes(id),
  bono_id             uuid not null references piefirme.bonos_calculados(id) on delete cascade,
  venta_id            uuid references piefirme.ventas(id) on delete set null,
  venta_linea_id      uuid references piefirme.venta_lineas(id) on delete set null,
  empleado_id         uuid references piefirme.empleados(id) on delete set null,
  fecha               date not null,
  concepto            text,
  importe_atribuido   numeric(14,2) not null default 0,
  created_at          timestamptz not null default now()
);
create index on piefirme.bono_detalle (organizacion_id, bono_id);
create trigger t_a_padre before insert on piefirme.bono_detalle for each row execute function piefirme_app.c_heredar_de_padre('bonos_calculados', 'bono_id');

-- ───────────────────────────── metas por sucursal y mes exacto ─────────────────────────────
create table piefirme.metas_mensuales (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  mes              date not null check (mes = date_trunc('month', mes)::date),   -- primer día del mes
  meta_ventas      numeric(14,2) not null check (meta_ventas >= 0),
  meta_servicios   numeric(14,2) check (meta_servicios >= 0),
  meta_productos   numeric(14,2) check (meta_productos >= 0),
  meta_ocupacion   numeric(5,2) check (meta_ocupacion between 0 and 100),
  notas            text,
  sintetico        boolean not null default false,
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (sede_id, mes)
);
create index on piefirme.metas_mensuales (organizacion_id, mes);

-- ───────────────────────────── evaluaciones de servicio ─────────────────────────────
-- Tres calificaciones (1 a 5) por cita: servicio, podólogo y sucursal; con seguimiento de las bajas (< 3).
create table piefirme.evaluacion_respuestas (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null default piefirme_app.org_id() references piefirme.organizaciones(id) on delete cascade,
  sede_id               uuid not null references piefirme.sedes(id),
  encuesta_id           uuid references piefirme.encuestas(id) on delete set null,
  cita_id               uuid references piefirme.citas(id) on delete set null,
  paciente_id           uuid references piefirme.pacientes(id) on delete set null,
  podologo_id           uuid references piefirme.perfiles(id),
  calif_servicio        smallint check (calif_servicio between 1 and 5),
  calif_podologo        smallint check (calif_podologo between 1 and 5),
  calif_sucursal        smallint check (calif_sucursal between 1 and 5),
  comentario            text,
  canal                 text not null default 'qr' check (canal in ('qr', 'whatsapp', 'correo', 'recepcion', 'portal')),
  estado_seguimiento    text not null default 'no_requiere' check (estado_seguimiento in ('no_requiere', 'pendiente', 'en_atencion', 'resuelta')),
  seguimiento_nota      text,
  atendida_por          uuid,
  atendida_en           timestamptz,
  respondida_en         timestamptz not null default now(),
  sintetico             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index evaluacion_una_por_cita on piefirme.evaluacion_respuestas (cita_id) where cita_id is not null;
create index on piefirme.evaluacion_respuestas (organizacion_id, sede_id, respondida_en desc);
create index on piefirme.evaluacion_respuestas (organizacion_id, podologo_id, respondida_en desc);
create index on piefirme.evaluacion_respuestas (organizacion_id, estado_seguimiento) where estado_seguimiento in ('pendiente', 'en_atencion');

select piefirme_app.c_triggers('bono_esquemas', true);
select piefirme_app.c_triggers('bonos_calculados', true);
select piefirme_app.c_triggers('metas_mensuales', true);
select piefirme_app.c_triggers('evaluacion_respuestas', true);

-- esquemas: todos los ven (para entender cómo se gana el bono); solo administrador escribe
select piefirme_app.c_politicas('bono_esquemas',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$activo or piefirme_app.es_admin()$c$);
-- bonos calculados: cada quien ve los suyos (empleado ligado a su sesión) y los de su sede si es gerente/admin
select piefirme_app.c_politicas('bonos_calculados',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$(piefirme_app.es_admin() and (sede_id is null or piefirme_app.puede_sede(sede_id))) or (empleado_id is not null and empleado_id = piefirme_app.empleado_id())$c$,
  p_cond_ins => $c$sede_id is null or piefirme_app.puede_sede(sede_id)$c$,
  p_cond_upd => $c$sede_id is null or piefirme_app.puede_sede(sede_id)$c$,
  p_cond_del => $c$estado = 'calculado' and (sede_id is null or piefirme_app.puede_sede(sede_id))$c$);
select piefirme_app.c_politicas('bono_detalle',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_sede => 'no',
  p_cond_ver => $c$exists (select 1 from piefirme.bonos_calculados b where b.id = bono_id)$c$);
-- metas mensuales: todo el personal ve las de su sede (motiva); escribe administrador
select piefirme_app.c_politicas('metas_mensuales',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador']);
-- evaluaciones: administrador y recepción de la sede; el podólogo solo las suyas
select piefirme_app.c_politicas('evaluacion_respuestas',
  p_ver => array['administrador', 'podologo', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador'],
  p_cond_ver => $c$piefirme_app.rol() <> 'podologo' or podologo_id = auth.uid()$c$);
