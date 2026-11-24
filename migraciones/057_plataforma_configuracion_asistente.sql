-- 057 · EQUIPO Y PLATAFORMA (D) · Configuración y parámetros de la clínica, catálogos configurables, (plantillas de documento viven en 010)
--        y bitácora del asistente de IA (consultas, datos expuestos, aislamiento por clínica).
-- Depende de: 001, 010 (plantillas_documento), 055 (campanas.plantilla_id) y por contrato: pacientes(id).
-- Reglas: REGLAS_NEGOCIO §0 (todos los parámetros viven en organizaciones.parametros con su valor inicial; los edita el Administrador; cada cambio
--   queda en bitácora; un cambio NO es retroactivo), P-099, P-119/P-120 (seguridad: sesión 60 min, 3 intentos = bloqueo 15 min, 2FA admin, Google apagado),
--   P-124/P-125 (IA: adaptador sin llave; el asistente solo usa vistas administrativas agregadas; con paciente exige permiso de expediente y deja
--   bitácora; aislado por clínica), P-114/P-129 (clínica suspendida/baja = solo lectura, ya impuesto por piefirme_app.org_activa() en todas las políticas).
-- Entidades: E02 Configuración, E18 Asistente IA, E142 Catálogos configurables.

-- ───────────────────────────── parámetros iniciales por clínica ─────────────────────────────
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.parametros_default() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'cancelacion_horas_aviso', 48,
    'anticipo_pct', 30,
    'anticipo_activo', true,
    'reprogramaciones_sin_costo', 2,
    'retencion_horario_min', 10,
    'recordatorio_horas', 24,
    'recordatorio_segundo_aviso_activo', false,
    'tolerancia_no_asistio_min', 15,
    'margen_entre_citas_min', 10,
    'sobrecupo_max_por_podologo_dia', 1,
    'lista_espera', jsonb_build_object('ventana_min', 30, 'vence_dias', 14),
    'videoconsulta', jsonb_build_object('entrada_min', 10, 'tope_min', 60, 'graba', false),
    'plan_abandonado_dias', 30,
    'queja_plazo_resolucion_dias', 3,
    'fotos', jsonb_build_object('max_por_sesion', 10, 'mb_max', 10, 'px_max', 2048),
    'inactivo_dias', 180,
    'descuento_recepcion_pct_max', 10,
    'iva', jsonb_build_object('servicios_clinicos', 0, 'productos', 16, 'precios_con_iva_incluido', true, 'tasa_general', 16),
    'corte_caja_tolerancia', 50,
    'plazo_facturar', 'mes_calendario',
    'vigencia_plan_laser_meses', 12,
    'aviso_vencimiento_plan_dias', 30,
    'plantilla_anticipo_pct', 50,
    'estudio_pisada_acreditable_dias', 30,
    'compra_autorizacion_monto', 5000,
    'gasto_comprobante_fiscal_desde', 2000,
    'semana_corte', jsonb_build_object('inicio', 'sabado', 'fin', 'viernes'),
    'meta_ocupacion_pct', 80,
    'mantenimiento_urgente_max', 2000,
    'vacaciones_dias_primer_anio', 12,
    'rh', jsonb_build_object('tolerancia_retardo_min', 5, 'retardo_umbral_min', 10,
                             'incidencias_que_descuentan', jsonb_build_array('inasistencia', 'permiso_sin_goce')),
    'seguridad', jsonb_build_object('sesion_min', 60, 'intentos_fallidos_max', 3, 'bloqueo_min', 15, 'dos_fa_administradores', true, 'login_google', false),
    'ia', jsonb_build_object('modo', 'no_configurado', 'umbral_confianza_importacion', 80),
    'retencion_expediente_bitacora_anios', 5,
    'arco_plazo_dias', 20,
    'encuesta', jsonb_build_object('espera_horas', 24, 'intervalo_dias', 90, 'nps_alerta_max', 6),
    'almacenamiento_cuota_gb', 25,
    'almacenamiento_aviso_pct', 80,
    'prueba_dias', 14,
    'gracia_dias', 7,
    'serie_factura', 'A',
    'folio_factura_inicial', 1001
  )
$$;

-- recursivo: lo ya configurado por la clínica gana sobre el valor inicial
create or replace function piefirme_app.mezclar_json(p_base jsonb, p_sobre jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, case when jsonb_typeof(b -> k) = 'object' and jsonb_typeof(s -> k) = 'object' then piefirme_app.mezclar_json(b -> k, s -> k)
                                           when s ? k then s -> k else b -> k end), '{}'::jsonb)
    from (select p_base as b, p_sobre as s) x, lateral (select distinct k from (select jsonb_object_keys(p_base) k union select jsonb_object_keys(p_sobre) k) u) keys
$$;

create or replace function piefirme_app.parametros_iniciales() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  new.parametros := piefirme_app.mezclar_json(piefirme.parametros_default(), coalesce(new.parametros, '{}'::jsonb));
  if new.estado = 'prueba' and new.prueba_hasta is null then
    new.prueba_hasta := current_date + coalesce((new.parametros ->> 'prueba_dias')::int, 14);
  end if;
  return new;
end $$;
create trigger t_parametros before insert on piefirme.organizaciones for each row execute function piefirme_app.parametros_iniciales();
update piefirme.organizaciones set parametros = piefirme_app.mezclar_json(piefirme.parametros_default(), parametros);

-- La clínica (admin) NO cambia por su cuenta plan, estado ni prueba (eso lo hace RANNIX); suspendida/baja = solo lectura (P-114).
-- service_role (auth.uid() nulo) y rannix_staff pasan.
create or replace function piefirme_app.proteger_organizacion() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if auth.uid() is null or piefirme_app.es_rannix() then return new; end if;
  if old.estado in ('suspendida', 'baja') then
    raise exception 'La clínica está en solo lectura (%); contacte a soporte', old.estado;
  end if;
  if new.estado is distinct from old.estado or new.plan is distinct from old.plan or new.prueba_hasta is distinct from old.prueba_hasta then
    raise exception 'Plan, estado y prueba los gestiona RANNIX';
  end if;
  return new;
end $$;
create trigger t_proteger before update on piefirme.organizaciones for each row execute function piefirme_app.proteger_organizacion();
create trigger t_aud after update on piefirme.organizaciones for each row execute function piefirme_app.auditar();

-- Cambia un parámetro (ruta separada por punto, p. ej. 'rh.tolerancia_retardo_min'); la clave debe existir en parametros_default().
create or replace function piefirme.parametro_actualizar(p_ruta text, p_valor jsonb)
returns jsonb language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_path text[] := string_to_array(p_ruta, '.'); v_ini jsonb; v_viejo jsonb;
begin
  if not piefirme_app.es_admin() or not piefirme_app.org_activa() then raise exception 'Solo Administración de una clínica activa'; end if;
  if piefirme.parametros_default() #> v_path is null then raise exception 'Parámetro desconocido: %', p_ruta; end if;
  if jsonb_typeof(piefirme.parametros_default() #> v_path) is distinct from jsonb_typeof(p_valor) then
    raise exception 'Tipo inválido para % (se esperaba %)', p_ruta, jsonb_typeof(piefirme.parametros_default() #> v_path);
  end if;
  if jsonb_typeof(p_valor) = 'number' and (p_valor #>> '{}')::numeric < 0 then raise exception 'El valor no puede ser negativo'; end if;
  select parametros #> v_path into v_viejo from piefirme.organizaciones where id = piefirme_app.org_id();
  update piefirme.organizaciones set parametros = jsonb_set(parametros, v_path, p_valor, true) where id = piefirme_app.org_id();
  perform piefirme.registrar_bitacora('actualizar', 'parametros', p_ruta, jsonb_build_object('antes', v_viejo, 'despues', p_valor));
  return (select parametros from piefirme.organizaciones where id = piefirme_app.org_id());
end $$;

-- ───────────────────────────── catálogos configurables (E142) ─────────────────────────────
create table piefirme.catalogos_clinica (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  catalogo         text not null,
  clave            text not null,
  nombre           text not null,
  orden            integer not null default 100,
  color            text,
  meta             jsonb not null default '{}'::jsonb,
  editable         boolean not null default true,       -- false = valor fijo del sistema (no se borra ni se renombra su clave)
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, catalogo, clave)
);
create index on piefirme.catalogos_clinica (organizacion_id, catalogo, orden);
create trigger t_upd before update on piefirme.catalogos_clinica for each row execute function piefirme_app.tocar_updated_at();
create trigger t_aud after insert or update or delete on piefirme.catalogos_clinica for each row execute function piefirme_app.auditar();

create or replace function piefirme_app.catalogo_fijo() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not old.editable and auth.uid() is not null then raise exception 'El valor "%" del catálogo % es fijo; desactívelo en su lugar', old.nombre, old.catalogo; end if;
    return old;
  end if;
  if not old.editable and new.clave is distinct from old.clave then raise exception 'La clave de un valor fijo no se cambia'; end if;
  return new;
end $$;
create trigger t_fijo before update or delete on piefirme.catalogos_clinica for each row execute function piefirme_app.catalogo_fijo();

create or replace function piefirme_app.sembrar_config(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.catalogos_clinica (organizacion_id, catalogo, clave, nombre, orden, editable)
  select p_org, c, k, n, o, ed from (values
    ('estado_civil','soltero','Soltero(a)',1,true), ('estado_civil','casado','Casado(a)',2,true), ('estado_civil','union_libre','Unión libre',3,true),
    ('estado_civil','divorciado','Divorciado(a)',4,true), ('estado_civil','viudo','Viudo(a)',5,true),
    ('parentesco','madre_padre','Madre / Padre',1,true), ('parentesco','conyuge','Cónyuge',2,true), ('parentesco','hijo','Hijo(a)',3,true),
    ('parentesco','hermano','Hermano(a)',4,true), ('parentesco','otro','Otro',9,true),
    ('origen_paciente','recomendacion','Recomendación',1,true), ('origen_paciente','redes','Redes sociales',2,true), ('origen_paciente','portal','Portal de reserva',3,false),
    ('origen_paciente','medico','Referido por médico',4,true), ('origen_paciente','importacion','Importado',5,false), ('origen_paciente','otro','Otro',9,true),
    ('canal_contacto','llamada','Llamada',1,true), ('canal_contacto','whatsapp','WhatsApp',2,true), ('canal_contacto','presencial','Presencial',3,true), ('canal_contacto','correo','Correo',4,true),
    ('categoria_servicio','quiropodia','Quiropodia',1,true), ('categoria_servicio','unas','Uñas',2,true), ('categoria_servicio','laser','Láser',3,true),
    ('categoria_servicio','pie_diabetico','Pie diabético',4,true), ('categoria_servicio','ortopedia','Plantillas y ortopedia',5,true), ('categoria_servicio','otro','Otros',9,true),
    ('categoria_producto','cuidado','Cuidado del pie',1,true), ('categoria_producto','calzado','Calzado',2,true), ('categoria_producto','insumo','Insumo clínico',3,true), ('categoria_producto','otro','Otros',9,true),
    ('categoria_proveedor','insumos','Insumos médicos',1,true), ('categoria_proveedor','mantenimiento','Mantenimiento y equipo',2,true), ('categoria_proveedor','laboratorio','Laboratorio de plantillas',3,true),
    ('categoria_proveedor','servicios','Servicios generales',4,true), ('categoria_proveedor','otro','Otros',9,true),
    ('categoria_gasto','insumos','Insumos',1,true), ('categoria_gasto','renta','Renta',2,true), ('categoria_gasto','servicios','Servicios (luz, agua, internet)',3,true),
    ('categoria_gasto','nomina','Nómina y honorarios',4,true), ('categoria_gasto','mantenimiento','Mantenimiento',5,true), ('categoria_gasto','marketing','Marketing',6,true),
    ('categoria_gasto','comisiones_bancarias','Comisiones bancarias y terminal',7,true), ('categoria_gasto','otro','Otros',9,true),
    ('categoria_ot','esterilizacion','Esterilización',1,true), ('categoria_ot','equipo_laser','Equipo láser',2,true), ('categoria_ot','instalaciones','Instalaciones',3,true),
    ('categoria_ot','instrumental','Instrumental',4,true), ('categoria_ot','mobiliario','Mobiliario',5,true), ('categoria_ot','otro','Otro',9,true),
    ('tipo_queja','dolor_posterior','Dolor posterior al procedimiento',1,true), ('tipo_queja','espera','Tiempo de espera excesivo',2,true), ('tipo_queja','cobro','Cobro o ticket incorrecto',3,true),
    ('tipo_queja','evento_adverso','Evento adverso / infección',4,false), ('tipo_queja','trato','Trato del personal',5,true), ('tipo_queja','higiene','Instrumental / higiene',6,true),
    ('transporte','taxi','Taxi / app',1,true), ('transporte','propio','Vehículo propio',2,true), ('transporte','publico','Transporte público',3,true),
    ('ciclo_autoclave','rapido','Ciclo rápido',1,true), ('ciclo_autoclave','instrumental','Instrumental envuelto',2,true), ('ciclo_autoclave','textil','Textil',3,true),
    ('origen_sistema_importacion','excel','Excel / CSV propio',1,true), ('origen_sistema_importacion','otro_sistema','Otro sistema de clínica',2,true), ('origen_sistema_importacion','papel','Expediente en papel (escaneo)',3,true)
  ) v(c, k, n, o, ed)
  on conflict (organizacion_id, catalogo, clave) do nothing;
end $$;
create or replace function piefirme_app.t_sembrar_config() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin perform piefirme_app.sembrar_config(new.id); return new; end $$;
create trigger t_sembrar_config after insert on piefirme.organizaciones for each row execute function piefirme_app.t_sembrar_config();
select piefirme_app.sembrar_config(id) from piefirme.organizaciones;

-- Plantillas de documento (E17): las define el dominio clínico en 010 (piefirme.plantillas_documento, con versión inmutable); aquí solo se enlaza la campaña.
alter table piefirme.campanas add constraint campanas_plantilla_fk foreign key (plantilla_id) references piefirme.plantillas_documento(id) on delete set null;

-- ───────────────────────────── asistente de IA (E18): conversaciones, mensajes y bitácora de datos expuestos ─────────────────────────────
create table piefirme.asistente_conversaciones (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  usuario_id       uuid not null default auth.uid() references piefirme.perfiles(id) on delete cascade,
  titulo           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on piefirme.asistente_conversaciones (organizacion_id, usuario_id, updated_at desc);
create trigger t_upd before update on piefirme.asistente_conversaciones for each row execute function piefirme_app.tocar_updated_at();

create table piefirme.asistente_mensajes (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null references piefirme.organizaciones(id) on delete cascade,
  conversacion_id          uuid not null references piefirme.asistente_conversaciones(id) on delete cascade,
  usuario_id               uuid not null default auth.uid(),
  rol                      text not null check (rol in ('usuario', 'asistente')),
  contenido                text not null,
  fuente                   text,                                   -- "ingresos validados · vista de ingresos por servicio"
  vistas_consultadas       text[] not null default '{}',           -- solo vistas prp_* administrativas agregadas
  accedio_dato_clinico     boolean not null default false,
  paciente_id              uuid references piefirme.pacientes(id) on delete set null,
  modo_ia                  text not null default 'no_configurado' check (modo_ia in ('no_configurado', 'sintetico', 'activo')),
  proveedor_ia             text,
  tokens_entrada           integer check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_salida            integer check (tokens_salida is null or tokens_salida >= 0),
  costo_estimado           numeric(12,4) check (costo_estimado is null or costo_estimado >= 0),
  created_at               timestamptz not null default now(),
  check (not accedio_dato_clinico or paciente_id is not null or rol = 'usuario')
);
create index on piefirme.asistente_mensajes (organizacion_id, conversacion_id, created_at);
create index on piefirme.asistente_mensajes (organizacion_id, accedio_dato_clinico) where accedio_dato_clinico;

-- Registro de cada acceso a datos que hace el asistente (append-only). Un acceso con paciente deja ADEMÁS bitácora (P-125).
create table piefirme.asistente_accesos_datos (
  id                    uuid primary key default gen_random_uuid(),
  organizacion_id       uuid not null references piefirme.organizaciones(id) on delete cascade,
  usuario_id            uuid not null default auth.uid(),
  mensaje_id            uuid references piefirme.asistente_mensajes(id) on delete set null,
  vista                 text not null,
  filtros               jsonb not null default '{}'::jsonb,
  filas_devueltas       integer not null default 0 check (filas_devueltas >= 0),
  identifica_paciente   boolean not null default false,
  paciente_id           uuid references piefirme.pacientes(id) on delete set null,
  permitido             boolean not null default true,
  motivo_bloqueo        text,
  created_at            timestamptz not null default now(),
  check (not identifica_paciente or paciente_id is not null)
);
create index on piefirme.asistente_accesos_datos (organizacion_id, created_at desc);
create index on piefirme.asistente_accesos_datos (paciente_id);

-- vistas que el asistente puede consultar (lista blanca por clínica)
create table piefirme.asistente_vistas_permitidas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  vista            text not null check (vista like 'prp\_%'),
  nivel            text not null default 'agregada' check (nivel in ('agregada', 'paciente')),
  activa           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (organizacion_id, vista)
);

create or replace function piefirme_app.asistente_bitacora() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if new.identifica_paciente then
    insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
    values (new.organizacion_id, new.usuario_id, 'ver', 'pacientes', new.paciente_id::text,
            jsonb_build_object('via', 'asistente_ia', 'vista', new.vista, 'filas', new.filas_devueltas, 'permitido', new.permitido));
  end if;
  return null;
end $$;
create trigger t_bitacora after insert on piefirme.asistente_accesos_datos for each row execute function piefirme_app.asistente_bitacora();

-- ───────────────────────────── RLS ─────────────────────────────
alter table piefirme.catalogos_clinica           enable row level security;
alter table piefirme.asistente_conversaciones    enable row level security;
alter table piefirme.asistente_mensajes          enable row level security;
alter table piefirme.asistente_accesos_datos     enable row level security;
alter table piefirme.asistente_vistas_permitidas enable row level security;

create policy cat_sel on piefirme.catalogos_clinica for select to authenticated using (organizacion_id = piefirme_app.org_id());
create policy cat_ins on piefirme.catalogos_clinica for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy cat_upd on piefirme.catalogos_clinica for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy cat_del on piefirme.catalogos_clinica for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa() and editable);

-- asistente: Administración y Podólogo (V consultas); cada quien ve SUS conversaciones; el Administrador audita los accesos de su clínica
create policy asc_sel on piefirme.asistente_conversaciones for select to authenticated using (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid());
create policy asc_ins on piefirme.asistente_conversaciones for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and usuario_id = auth.uid() and piefirme_app.rol() in ('administrador', 'podologo'));
create policy asc_upd on piefirme.asistente_conversaciones for update to authenticated using (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid()) with check (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid());
create policy asc_del on piefirme.asistente_conversaciones for delete to authenticated using (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid());

create policy asm_sel on piefirme.asistente_mensajes for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (usuario_id = auth.uid() or (piefirme_app.es_admin() and accedio_dato_clinico)));
create policy asm_ins on piefirme.asistente_mensajes for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and piefirme_app.org_activa() and usuario_id = auth.uid() and piefirme_app.rol() in ('administrador', 'podologo')
              and exists (select 1 from piefirme.asistente_conversaciones c where c.id = asistente_mensajes.conversacion_id and c.usuario_id = auth.uid() and c.organizacion_id = asistente_mensajes.organizacion_id));
-- mensajes inmutables: sin update/delete (solo se van con su conversación)

create policy asa_sel on piefirme.asistente_accesos_datos for select to authenticated using (organizacion_id = piefirme_app.org_id() and (piefirme_app.es_admin() or usuario_id = auth.uid()));
create policy asa_ins on piefirme.asistente_accesos_datos for insert to authenticated
  with check (organizacion_id = piefirme_app.org_id() and usuario_id = auth.uid() and piefirme_app.rol() in ('administrador', 'podologo'));
-- append-only

create policy asv_sel on piefirme.asistente_vistas_permitidas for select to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.rol() in ('administrador', 'podologo'));
create policy asv_ins on piefirme.asistente_vistas_permitidas for insert to authenticated with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy asv_upd on piefirme.asistente_vistas_permitidas for update to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin()) with check (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());
create policy asv_del on piefirme.asistente_vistas_permitidas for delete to authenticated using (organizacion_id = piefirme_app.org_id() and piefirme_app.es_admin() and piefirme_app.org_activa());

-- vistas administrativas agregadas habilitadas por defecto para el asistente
create or replace function piefirme_app.sembrar_asistente(p_org uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  insert into piefirme.asistente_vistas_permitidas (organizacion_id, vista, nivel)
  select p_org, v, 'agregada' from unnest(array['prp_nps_mensual', 'prp_mantenimiento_mes', 'prp_asistencia_resumen_mes', 'prp_nomina_periodos', 'prp_importaciones']) v
  on conflict (organizacion_id, vista) do nothing;
end $$;
create or replace function piefirme_app.t_sembrar_asistente() returns trigger
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin perform piefirme_app.sembrar_asistente(new.id); return new; end $$;
create trigger t_sembrar_asistente after insert on piefirme.organizaciones for each row execute function piefirme_app.t_sembrar_asistente();
select piefirme_app.sembrar_asistente(id) from piefirme.organizaciones;

-- ───────────────────────────── vistas prp_* ─────────────────────────────
create or replace view piefirme.prp_configuracion_clinica with (security_invoker = true) as
select o.id as organizacion_id, o.nombre, o.razon_social, o.rfc, o.regimen_fiscal, o.codigo_postal, o.logo_url, o.zona_horaria,
       o.plan, o.estado, o.prueba_hasta, o.parametros,
       (o.estado in ('suspendida', 'baja')) as solo_lectura
  from piefirme.organizaciones o;

create or replace view piefirme.prp_catalogos with (security_invoker = true) as
select c.id, c.organizacion_id, c.catalogo, c.clave, c.nombre, c.orden, c.color, c.meta, c.editable, c.activo
  from piefirme.catalogos_clinica c;

create or replace view piefirme.prp_asistente_historial with (security_invoker = true) as
select c.id as conversacion_id, c.organizacion_id, c.usuario_id, coalesce(c.titulo, 'Nueva conversación') as titulo, c.updated_at,
       (select count(*) from piefirme.asistente_mensajes m where m.conversacion_id = c.id) as mensajes
  from piefirme.asistente_conversaciones c;

create or replace view piefirme.prp_asistente_accesos with (security_invoker = true) as
select a.id, a.organizacion_id, a.usuario_id, a.vista, a.filas_devueltas, a.identifica_paciente, a.paciente_id, a.permitido, a.motivo_bloqueo, a.created_at
  from piefirme.asistente_accesos_datos a;

-- ───────────────────────────── permisos de ejecución ─────────────────────────────
revoke all on function piefirme.parametros_default() from public, anon;
revoke all on function piefirme.parametro_actualizar(text, jsonb) from public, anon;
grant execute on function piefirme.parametros_default() to authenticated;
grant execute on function piefirme.parametro_actualizar(text, jsonb) to authenticated;

revoke all on all functions in schema piefirme_app from public, anon;
grant execute on all functions in schema piefirme_app to authenticated;
revoke execute on function piefirme_app.parametros_iniciales(), piefirme_app.proteger_organizacion(), piefirme_app.catalogo_fijo(), piefirme_app.sembrar_config(uuid), piefirme_app.t_sembrar_config(),
  piefirme_app.asistente_bitacora(), piefirme_app.sembrar_asistente(uuid), piefirme_app.t_sembrar_asistente() from authenticated;
