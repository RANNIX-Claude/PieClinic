-- 044 · Inventario y finanzas · gastos operativos con comprobante, carga en grupo de tickets, fondo revolvente por sede con cierres semanales.
-- Dominio C. Clona de IRP: gastos_operativos (+ticket_total, ticket_img_url, proveedor_id), gasto_detalle, prp_gastos, prp_fondo_semana, prp_fondo_revolvente_cierres,
--   trigger de vinculación de proveedor por texto (trg_vincular_proveedor) y vincular_nombre_proveedor().
-- Reglas: P-093 (métodos de pago; comprobante fiscal exigido desde $2,000), P-095 (un fondo por sede, reposición autorizada por Administración, comisión bancaria fuera del fondo),
--   P-092 (gastos compartidos entre sedes), P-126 (la IA solo precarga; revisión humana), P-099 (periodo cerrado), P-082 (proveedores: creación rápida).
-- Dependencias: 001, 020 (productos), 040 (proveedores, helpers), 042 (grupos_gasto, cierres_periodo, c_guardar_periodo). La FK a cuentas_por_pagar se agrega en 046.

-- ───────────────────────────── fondo revolvente (E109) ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create table piefirme.fondos_revolventes (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id) on delete cascade,
  nombre           text not null,
  monto_base       numeric(14,2) not null check (monto_base > 0),              -- monto base propio de la sede (P-095)
  responsable_id   uuid references piefirme.perfiles(id) on delete set null,     -- designado por Administración (CA-08)
  alerta_pct       numeric(5,2) not null default 80 check (alerta_pct between 1 and 100),
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index fondo_activo_por_sede on piefirme.fondos_revolventes (sede_id) where activo;
create index on piefirme.fondos_revolventes (organizacion_id);

-- ───────────────────────────── gastos (E105) ─────────────────────────────
create table piefirme.gastos (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id               uuid references piefirme.sedes(id),                       -- null + compartido = gasto de la clínica (P-092)
  compartido            boolean not null default false,
  fecha                 date not null default current_date,
  proveedor_id          uuid references piefirme.proveedores(id) on delete set null,
  proveedor_texto       text,                                                    -- texto libre; se liga solo al catálogo (IRP)
  grupo_id              uuid not null references piefirme.grupos_gasto(id),
  metodo_pago           text not null check (metodo_pago in ('efectivo_fondo', 'tarjeta_clinica', 'transferencia', 'pagado_por_empleado')),
  fondo_id              uuid references piefirme.fondos_revolventes(id),
  subtotal              numeric(14,2) not null check (subtotal >= 0),
  iva                   numeric(14,2) not null default 0 check (iva >= 0),
  total                 numeric(14,2) not null check (total > 0),
  ticket_total          numeric(14,2),                                            -- cifra de control del ticket (IRP)
  folio_comprobante     text,
  cfdi_uuid             text,
  tiene_factura         boolean not null default false,
  factura_url           text,                                                     -- bucket «pf-comprobantes»: <organizacion_id>/gastos/…
  ticket_url            text,
  descripcion           text,
  origen_captura        text not null default 'individual' check (origen_captura in ('individual', 'carga_grupo', 'fondo', 'sistema')),
  origen_modulo         text not null default 'manual' check (origen_modulo in ('manual', 'compra', 'nomina', 'comisiones', 'mantenimiento', 'suscripcion', 'comision_terminal', 'otro')),
  pagado_por_perfil_id  uuid references piefirme.perfiles(id) on delete set null,
  pagado_por_nombre     text,
  reembolsado           boolean not null default false,
  reembolsado_en        date,
  cuenta_por_pagar_id   uuid,                                                     -- FK en 046
  ajuste_de_id          uuid references piefirme.gastos(id) on delete restrict,     -- ajuste posterior a un periodo cerrado (P-099)
  estado                text not null default 'guardado' check (estado in ('borrador', 'guardado', 'anulado')),
  anulado_motivo        text,
  creado_por            uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (sede_id is not null or compartido),
  check (not compartido or sede_id is null),
  check (abs(total - (subtotal + iva)) <= 0.01),
  check (estado <> 'anulado' or coalesce(trim(anulado_motivo), '') <> ''),
  check (metodo_pago <> 'pagado_por_empleado' or pagado_por_perfil_id is not null or coalesce(trim(pagado_por_nombre), '') <> ''),
  check (metodo_pago <> 'efectivo_fondo' or (fondo_id is not null and sede_id is not null)),
  check (metodo_pago = 'efectivo_fondo' or fondo_id is null)
);
create index on piefirme.gastos (organizacion_id, sede_id, fecha desc);
create index on piefirme.gastos (organizacion_id, grupo_id);
create index on piefirme.gastos (organizacion_id, proveedor_id) where proveedor_id is not null;
create index on piefirme.gastos (fondo_id, fecha) where fondo_id is not null;

-- Artículos del ticket (E106 · IRP gasto_detalle). No mueve inventario: sirve para análisis de compras por producto.
create table piefirme.gasto_lineas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid references piefirme.sedes(id),
  gasto_id         uuid not null references piefirme.gastos(id) on delete cascade,
  producto_id      uuid references piefirme.productos(id) on delete set null,
  sku              text,
  descripcion      text not null,
  cantidad         numeric(14,3) not null default 1 check (cantidad > 0),
  precio_unitario  numeric(14,4) not null check (precio_unitario >= 0),
  impuesto_pct     numeric(5,2) not null default 0 check (impuesto_pct between 0 and 100),
  subtotal         numeric(14,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  created_at       timestamptz not null default now()
);
create index on piefirme.gasto_lineas (organizacion_id, gasto_id);
create index on piefirme.gasto_lineas (organizacion_id, producto_id) where producto_id is not null;

-- Carga en grupo de comprobantes (E108): la IA propone, una persona confirma (P-126)
create table piefirme.comprobantes_carga (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id          uuid not null references piefirme.sedes(id),
  archivo_path     text not null,
  estado           text not null default 'procesando' check (estado in ('procesando', 'listo', 'ilegible', 'guardado')),
  proveedor_leido  text,
  total_leido      numeric(14,2),
  fecha_leida      date,
  folio_leido      text,
  confianza        numeric(5,2) check (confianza is null or confianza between 0 and 100),
  grupo_id         uuid references piefirme.grupos_gasto(id),        -- «grupo para todos»
  ia_respuesta     jsonb not null default '{}'::jsonb,              -- adaptador de IA sin llave real: queda vacío hasta configurarlo
  gasto_id         uuid references piefirme.gastos(id) on delete set null,
  creado_por       uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (estado <> 'guardado' or gasto_id is not null)
);
create index on piefirme.comprobantes_carga (organizacion_id, sede_id, estado);

-- Cierres semanales del fondo y reposición (E110 · IRP prp_fondo_revolvente_cierres)
create table piefirme.fondo_cierres (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references piefirme.organizaciones(id) on delete cascade,
  sede_id            uuid not null references piefirme.sedes(id) on delete cascade,
  fondo_id           uuid not null references piefirme.fondos_revolventes(id) on delete cascade,
  semana_inicio      date not null,
  semana_fin         date not null,
  monto_base         numeric(14,2) not null,
  gastado            numeric(14,2) not null default 0,
  num_gastos         integer not null default 0,
  disponible_final   numeric(14,2) generated always as (monto_base - gastado) stored,
  estado             text not null default 'cerrado' check (estado in ('cerrado', 'repuesto')),
  reposicion_monto   numeric(14,2) check (reposicion_monto is null or reposicion_monto >= 0),
  repuesto_en        date,
  autorizado_por     uuid references piefirme.perfiles(id) on delete set null,       -- reposición autorizada por Administración (P-095)
  cerrado_por        uuid references piefirme.perfiles(id) on delete set null default auth.uid(),
  nota               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (fondo_id, semana_inicio),
  check (estado <> 'repuesto' or (autorizado_por is not null and reposicion_monto is not null and repuesto_en is not null))
);
create index on piefirme.fondo_cierres (organizacion_id, sede_id, semana_inicio desc);

-- ───────────────────────────── triggers · gastos ─────────────────────────────
create trigger t_a_padre before insert on piefirme.gasto_lineas for each row execute function piefirme_app.c_heredar_de_padre('gastos', 'gasto_id');

create or replace function piefirme_app.c_gasto_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare g piefirme.grupos_gasto%rowtype; f piefirme.fondos_revolventes%rowtype; v_umbral numeric; v_cerrado boolean;
begin
  select * into g from piefirme.grupos_gasto where id = new.grupo_id;
  if not found or g.organizacion_id <> new.organizacion_id then raise exception 'grupo de gasto inexistente' using errcode = 'PF404'; end if;
  if new.sede_id is not null and not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'sede de otra clínica' using errcode = '42501';
  end if;
  if new.proveedor_id is not null and not exists (select 1 from piefirme.proveedores p where p.id = new.proveedor_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'proveedor de otra clínica' using errcode = '42501';
  end if;
  -- vinculación automática del texto al catálogo (IRP trg_vincular_proveedor)
  if new.proveedor_id is null and coalesce(trim(new.proveedor_texto), '') <> '' then
    new.proveedor_id := piefirme.proveedor_buscar(new.organizacion_id, new.proveedor_texto);
  end if;
  -- fondo revolvente
  if new.metodo_pago = 'efectivo_fondo' then
    if not g.permite_fondo then
      raise exception 'el rubro «%» no es gasto del fondo revolvente (P-095)', g.nombre using errcode = 'PF409';
    end if;
    if new.fondo_id is null then
      select * into f from piefirme.fondos_revolventes where sede_id = new.sede_id and activo;
      if not found then raise exception 'la sede no tiene fondo revolvente activo' using errcode = 'PF409'; end if;
      new.fondo_id := f.id;
    else
      select * into f from piefirme.fondos_revolventes where id = new.fondo_id;
    end if;
    if f.sede_id is distinct from new.sede_id or f.organizacion_id <> new.organizacion_id then
      raise exception 'el fondo pertenece a otra sede' using errcode = 'PF409';
    end if;
    new.origen_captura := case when new.origen_captura = 'individual' then 'fondo' else new.origen_captura end;
    select exists (select 1 from piefirme.fondo_cierres c where c.fondo_id = new.fondo_id and new.fecha between c.semana_inicio and c.semana_fin) into v_cerrado;
    if v_cerrado and coalesce(current_setting('app.ignorar_cierre', true), '') <> 'on' then
      raise exception 'la semana del fondo ya está cerrada: registra el gasto en la semana vigente' using errcode = 'PF409';
    end if;
  end if;
  -- comprobante fiscal desde el umbral (P-093)
  v_umbral := piefirme_app.c_param(new.organizacion_id, 'comprobante_gasto_desde', 2000);
  if new.estado = 'guardado' and new.total >= v_umbral and new.origen_modulo in ('manual', 'compra', 'otro')
     and not (new.tiene_factura and (coalesce(new.factura_url, '') <> '' or coalesce(new.cfdi_uuid, '') <> '')) then
    raise exception 'el gasto de $% exige comprobante fiscal (factura o CFDI) desde $% (P-093)', new.total, v_umbral using errcode = 'PF409';
  end if;
  if tg_op = 'UPDATE' and old.estado = 'anulado' and new.estado <> 'anulado' then
    raise exception 'un gasto anulado no se reactiva: captura uno nuevo' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.gastos for each row execute function piefirme_app.c_gasto_bi();
create trigger t_per before insert or update or delete on piefirme.gastos
  for each row execute function piefirme_app.c_guardar_periodo('fecha', 'ticket_url,factura_url,cfdi_uuid,tiene_factura,folio_comprobante,cuenta_por_pagar_id,reembolsado,reembolsado_en,proveedor_id,updated_at');

create or replace function piefirme_app.c_gasto_bd() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if old.estado <> 'borrador' then
    raise exception 'un gasto guardado no se borra: anúlalo con motivo' using errcode = 'PF409';
  end if;
  return old;
end $$;
create trigger t_bd before delete on piefirme.gastos for each row execute function piefirme_app.c_gasto_bd();

-- Cierre de fondo: bloquea cambios a los gastos de esa semana (delete incluido)
create or replace function piefirme_app.c_gasto_fondo_cerrado() returns trigger
language plpgsql as $$
declare v_f date; v_id uuid;
begin
  if pg_trigger_depth() > 1 or coalesce(current_setting('app.ignorar_cierre', true), '') = 'on' then return coalesce(new, old); end if;
  v_id := coalesce(old.fondo_id, new.fondo_id);
  v_f := coalesce(old.fecha, new.fecha);
  if v_id is not null and tg_op in ('UPDATE', 'DELETE')
     and exists (select 1 from piefirme.fondo_cierres c where c.fondo_id = v_id and v_f between c.semana_inicio and c.semana_fin)
     and (tg_op = 'DELETE' or (to_jsonb(new) - 'updated_at' - 'ticket_url' - 'factura_url' - 'cfdi_uuid' - 'tiene_factura' - 'folio_comprobante') is distinct from (to_jsonb(old) - 'updated_at' - 'ticket_url' - 'factura_url' - 'cfdi_uuid' - 'tiene_factura' - 'folio_comprobante')) then
    raise exception 'la semana del fondo ya está cerrada: los gastos no se modifican' using errcode = 'PF409';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_fondo_cerrado before update or delete on piefirme.gastos for each row execute function piefirme_app.c_gasto_fondo_cerrado();

create or replace function piefirme_app.c_gasto_linea_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  if new.producto_id is not null and not exists (select 1 from piefirme.productos p where p.id = new.producto_id and p.organizacion_id = new.organizacion_id) then
    raise exception 'producto de otra clínica' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.gasto_lineas for each row execute function piefirme_app.c_gasto_linea_bi();

create or replace function piefirme_app.c_carga_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.estado = 'guardado' and not exists (select 1 from piefirme.gastos g where g.id = new.gasto_id and g.organizacion_id = new.organizacion_id) then
    raise exception 'el comprobante guardado debe ligarse a un gasto de la clínica' using errcode = 'PF409';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.comprobantes_carga for each row execute function piefirme_app.c_carga_bi();

create or replace function piefirme_app.c_fondo_bi() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not exists (select 1 from piefirme.sedes s where s.id = new.sede_id and s.organizacion_id = new.organizacion_id) then
    raise exception 'sede de otra clínica' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_bi before insert or update on piefirme.fondos_revolventes for each row execute function piefirme_app.c_fondo_bi();

create trigger t_rpc before insert or update on piefirme.fondo_cierres for each row execute function piefirme_app.c_exigir_rpc('repuesto');
create trigger t_a_padre before insert on piefirme.fondo_cierres for each row execute function piefirme_app.c_heredar_de_padre('fondos_revolventes', 'fondo_id');

-- ───────────────────────────── RPC ─────────────────────────────
-- Cerrar la semana del fondo: congela lo gastado (Recepción responsable o Administración)
create or replace function piefirme.fondo_cerrar_semana(p_fondo uuid, p_fecha date default null) returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare f piefirme.fondos_revolventes%rowtype; v_ini date; v_fin date; v_id uuid := gen_random_uuid(); v_gastado numeric; v_n integer;
begin
  select * into f from piefirme.fondos_revolventes where id = p_fondo;
  if not found then raise exception 'fondo inexistente' using errcode = 'PF404'; end if;
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') or not piefirme_app.puede_sede(f.sede_id) then raise exception 'sin permiso' using errcode = '42501'; end if;
  if not piefirme_app.es_admin() and f.responsable_id is distinct from auth.uid() then
    raise exception 'solo el responsable designado del fondo (o Administración) cierra la semana' using errcode = '42501';
  end if;
  v_ini := piefirme_app.c_semana_inicio(f.organizacion_id, coalesce(p_fecha, current_date));
  v_fin := v_ini + 6;
  select coalesce(sum(total), 0), count(*) into v_gastado, v_n from piefirme.gastos
   where fondo_id = f.id and estado = 'guardado' and fecha between v_ini and v_fin;
  insert into piefirme.fondo_cierres (id, organizacion_id, sede_id, fondo_id, semana_inicio, semana_fin, monto_base, gastado, num_gastos)
  values (v_id, f.organizacion_id, f.sede_id, f.id, v_ini, v_fin, f.monto_base, v_gastado, v_n);
  return v_id;
end $$;
revoke all on function piefirme.fondo_cerrar_semana(uuid, date) from public, anon;
grant execute on function piefirme.fondo_cerrar_semana(uuid, date) to authenticated;

-- Reponer el fondo: autoriza Administración (P-095)
create or replace function piefirme.fondo_reponer(p_cierre uuid, p_monto numeric default null, p_fecha date default null) returns void
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.fondo_cierres%rowtype;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración autoriza la reposición del fondo' using errcode = '42501'; end if;
  select * into c from piefirme.fondo_cierres where id = p_cierre for update;
  if not found then raise exception 'cierre inexistente' using errcode = 'PF404'; end if;
  if c.estado = 'repuesto' then raise exception 'el fondo ya fue repuesto' using errcode = 'PF409'; end if;
  perform set_config('app.c_rpc', 'on', true);
  update piefirme.fondo_cierres set estado = 'repuesto', reposicion_monto = coalesce(p_monto, gastado), repuesto_en = coalesce(p_fecha, current_date), autorizado_por = auth.uid()
   where id = p_cierre;
end $$;
revoke all on function piefirme.fondo_reponer(uuid, numeric, date) from public, anon;
grant execute on function piefirme.fondo_reponer(uuid, numeric, date) to authenticated;

-- Crear proveedor rápido desde el formulario de gasto (P-082)
create or replace function piefirme.proveedor_crear_rapido(p_nombre text, p_categoria text default 'operacion') returns uuid
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_clave text;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración crea proveedores' using errcode = '42501'; end if;
  v_clave := upper(left(piefirme.proveedor_norm(p_nombre), 12));
  if v_clave is null then raise exception 'nombre inválido' using errcode = '22023'; end if;
  insert into piefirme.proveedores (id, organizacion_id, clave, nombre, categoria)
  values (v_id, piefirme_app.org_id(), v_clave, trim(p_nombre), p_categoria)
  on conflict (organizacion_id, clave) do nothing;
  return coalesce((select id from piefirme.proveedores where organizacion_id = piefirme_app.org_id() and clave = v_clave), v_id);
end $$;
revoke all on function piefirme.proveedor_crear_rapido(text, text) from public, anon;
grant execute on function piefirme.proveedor_crear_rapido(text, text) to authenticated;

-- Ligar un texto suelto a un proveedor del catálogo (IRP vincular_nombre_proveedor): guarda alias y liga gastos históricos
create or replace function piefirme.proveedor_vincular_nombre(p_texto text, p_proveedor uuid) returns integer
language plpgsql set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_norm text := piefirme.proveedor_norm(p_texto); v_n integer;
begin
  if not piefirme_app.es_admin() then raise exception 'solo Administración' using errcode = '42501'; end if;
  if v_norm is null or p_proveedor is null then raise exception 'nombre y proveedor son obligatorios' using errcode = '22023'; end if;
  update piefirme.proveedores set alias = array_append(alias, v_norm)
   where id = p_proveedor and organizacion_id = piefirme_app.org_id() and not (v_norm = any (alias))
     and v_norm is distinct from piefirme.proveedor_norm(nombre) and v_norm is distinct from piefirme.proveedor_norm(clave);
  update piefirme.gastos set proveedor_id = p_proveedor
   where organizacion_id = piefirme_app.org_id() and proveedor_id is null and piefirme.proveedor_norm(proveedor_texto) = v_norm;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function piefirme.proveedor_vincular_nombre(text, uuid) from public, anon;
grant execute on function piefirme.proveedor_vincular_nombre(text, uuid) to authenticated;

-- ───────────────────────────── RLS ─────────────────────────────
select piefirme_app.c_politicas('fondos_revolventes', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador']);
select piefirme_app.c_politicas('gastos', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador', 'recepcion'],
                       p_cond_ver => $c$(piefirme_app.rol()::text = 'administrador' or metodo_pago = 'efectivo_fondo')$c$,
                       p_cond_ins => $c$(piefirme_app.rol()::text = 'administrador' or (metodo_pago = 'efectivo_fondo' and origen_modulo = 'manual' and estado in ('borrador', 'guardado')))$c$,
                       p_cond_upd => $c$(piefirme_app.rol()::text = 'administrador' or (metodo_pago = 'efectivo_fondo' and creado_por = auth.uid()))$c$,
                       p_cond_del => $c$(estado = 'borrador' and (piefirme_app.rol()::text = 'administrador' or creado_por = auth.uid()))$c$);
select piefirme_app.c_politicas('gasto_lineas', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador', 'recepcion'], p_del => array['administrador', 'recepcion'], p_sede => 'no',
                       p_cond_ver => $c$exists (select 1 from piefirme.gastos g where g.id = gasto_id)$c$,
                       p_cond_ins => $c$exists (select 1 from piefirme.gastos g where g.id = gasto_id)$c$,
                       p_cond_upd => $c$exists (select 1 from piefirme.gastos g where g.id = gasto_id)$c$,
                       p_cond_del => $c$exists (select 1 from piefirme.gastos g where g.id = gasto_id)$c$);
select piefirme_app.c_politicas('comprobantes_carga', p_ver => array['administrador'], p_ins => array['administrador'], p_upd => array['administrador'], p_del => array['administrador'], p_cond_del => $c$estado <> 'guardado'$c$);
select piefirme_app.c_politicas('fondo_cierres', p_ver => array['administrador', 'recepcion'], p_ins => array['administrador', 'recepcion'], p_upd => array['administrador'], p_del => array['administrador'], p_cond_del => $c$estado = 'cerrado'$c$);
select piefirme_app.c_triggers('fondos_revolventes');
select piefirme_app.c_triggers('gastos');
select piefirme_app.c_triggers('gasto_lineas', false);
select piefirme_app.c_triggers('comprobantes_carga');
select piefirme_app.c_triggers('fondo_cierres');

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_gastos with (security_invoker = true) as
select g.id, g.organizacion_id, g.sede_id, s.nombre as sede_nombre, g.compartido, g.fecha, g.proveedor_id, coalesce(p.nombre, g.proveedor_texto) as proveedor_nombre, g.proveedor_texto,
       g.grupo_id, gr.nombre as grupo_nombre, gr.clave as grupo_clave, g.metodo_pago, g.fondo_id, g.subtotal, g.iva, g.total, coalesce(g.ticket_total, g.total) as ticket_total,
       g.folio_comprobante, g.cfdi_uuid, g.tiene_factura, g.factura_url, g.ticket_url, g.descripcion, g.origen_captura, g.origen_modulo,
       g.pagado_por_perfil_id, g.pagado_por_nombre, g.reembolsado, g.reembolsado_en, g.cuenta_por_pagar_id, g.ajuste_de_id, g.estado, g.created_at,
       (g.total >= piefirme_app.c_param(g.organizacion_id, 'comprobante_gasto_desde', 2000)) as exige_comprobante,
       (g.tiene_factura and (coalesce(g.factura_url, '') <> '' or coalesce(g.cfdi_uuid, '') <> '')) as comprobante_ok,
       (select coalesce(sum(d.subtotal), 0) from piefirme.gasto_lineas d where d.gasto_id = g.id) as suma_detalle,
       (select count(*) from piefirme.gasto_lineas d where d.gasto_id = g.id) as num_lineas,
       piefirme_app.c_semana_inicio(g.organizacion_id, g.fecha) as semana_inicio,
       piefirme_app.c_semana_etiqueta(g.organizacion_id, g.fecha) as semana
  from piefirme.gastos g
  left join piefirme.sedes s on s.id = g.sede_id
  join piefirme.grupos_gasto gr on gr.id = g.grupo_id
  left join piefirme.proveedores p on p.id = g.proveedor_id;

create or replace view piefirme.prp_fondo_semana with (security_invoker = true) as
select f.id as fondo_id, f.organizacion_id, f.sede_id, s.nombre as sede_nombre, f.nombre, f.monto_base, f.responsable_id, f.alerta_pct,
       piefirme_app.c_semana_inicio(f.organizacion_id, current_date) as semana_inicio, piefirme_app.c_semana_inicio(f.organizacion_id, current_date) + 6 as semana_fin,
       coalesce(x.gastado, 0) as gastado_semana, coalesce(x.n, 0) as num_gastos, f.monto_base - coalesce(x.gastado, 0) as disponible,
       round(coalesce(x.gastado, 0) / f.monto_base * 100, 1) as pct_usado,
       (coalesce(x.gastado, 0) / f.monto_base * 100 >= f.alerta_pct) as en_alerta,
       (select max(c.repuesto_en) from piefirme.fondo_cierres c where c.fondo_id = f.id and c.estado = 'repuesto') as ultima_reposicion_fecha,
       (select c.reposicion_monto from piefirme.fondo_cierres c where c.fondo_id = f.id and c.estado = 'repuesto' order by c.repuesto_en desc limit 1) as ultima_reposicion_monto
  from piefirme.fondos_revolventes f
  join piefirme.sedes s on s.id = f.sede_id
  left join lateral (select sum(g.total) gastado, count(*) n from piefirme.gastos g
                      where g.fondo_id = f.id and g.estado = 'guardado'
                        and g.fecha between piefirme_app.c_semana_inicio(f.organizacion_id, current_date) and piefirme_app.c_semana_inicio(f.organizacion_id, current_date) + 6) x on true
 where f.activo;

create or replace view piefirme.prp_fondo_revolvente_cierres with (security_invoker = true) as
select c.id, c.organizacion_id, c.sede_id, s.nombre as sede_nombre, c.fondo_id, c.semana_inicio, c.semana_fin, piefirme_app.c_semana_etiqueta(c.organizacion_id, c.semana_inicio) as semana,
       c.monto_base, c.gastado, c.num_gastos, c.disponible_final, c.estado, c.reposicion_monto, c.repuesto_en, c.autorizado_por, c.cerrado_por, c.nota, c.created_at
  from piefirme.fondo_cierres c join piefirme.sedes s on s.id = c.sede_id;

create or replace view piefirme.prp_gasto_por_rubro_semana with (security_invoker = true) as
select g.organizacion_id, g.fondo_id, piefirme_app.c_semana_inicio(g.organizacion_id, g.fecha) as semana_inicio, gr.clave as grupo_clave, gr.nombre as grupo_nombre,
       sum(g.total) as total, count(*) as num_gastos
  from piefirme.gastos g join piefirme.grupos_gasto gr on gr.id = g.grupo_id
 where g.fondo_id is not null and g.estado = 'guardado'
 group by g.organizacion_id, g.fondo_id, piefirme_app.c_semana_inicio(g.organizacion_id, g.fecha), gr.clave, gr.nombre;

-- ───────────────────────────── permisos ─────────────────────────────
revoke all on all tables in schema piefirme from anon;
