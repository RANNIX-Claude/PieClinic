-- 074 · Implementación Pie Clinic · Liberación de funciones por rol (la controla el superadministrador de RANNIX).
-- Objetivo: en la primera venta el cliente recibe un alcance acotado; las demás opciones no están disponibles hasta que se vendan.
-- ADITIVA y compatible con lo existente: mientras una clínica NO tenga la liberación estricta activada, TODO sigue habilitado
-- como hasta hoy. Al activarla (solo RANNIX), únicamente se habilita lo que RANNIX libere por rol.
--   catalogo_funciones   → las opciones de menú de Pie Firme (clave = ruta). Global; la llena esta migración.
--   funciones_liberadas  → por clínica y rol: qué opciones están habilitadas. Solo RANNIX escribe, vía RPC.
--   organizaciones.parametros.liberacion_estricta → interruptor por clínica (RANNIX).
-- La interfaz oculta lo no liberado y las rutas también se bloquean. Esto NO sustituye al RLS: la base sigue mandando.
-- Depende de: 001, 062 (superadmin/rannix_staff), 073.
set search_path = piefirme, piefirme_app, extensions;

create table if not exists piefirme.catalogo_funciones (
  clave        text primary key,
  nombre       text not null,
  grupo        text not null,
  roles        text[] not null default '{}',
  created_at   timestamptz not null default now()
);
alter table piefirme.catalogo_funciones enable row level security;
drop policy if exists catalogo_funciones_sel on piefirme.catalogo_funciones;
create policy catalogo_funciones_sel on piefirme.catalogo_funciones for select to authenticated
  using (piefirme_app.org_id() is not null or piefirme_app.es_rannix());

create table if not exists piefirme.funciones_liberadas (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references piefirme.organizaciones(id) on delete cascade,
  clave            text not null references piefirme.catalogo_funciones(clave),
  rol              text not null check (rol in ('administrador', 'podologo', 'recepcion', 'supervisor')),
  habilitada       boolean not null default true,
  nota             text,
  liberada_por     uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organizacion_id, clave, rol)
);
create index if not exists funciones_liberadas_org_idx on piefirme.funciones_liberadas (organizacion_id, rol);
alter table piefirme.funciones_liberadas enable row level security;
drop policy if exists funciones_liberadas_sel on piefirme.funciones_liberadas;
create policy funciones_liberadas_sel on piefirme.funciones_liberadas for select to authenticated
  using (organizacion_id = piefirme_app.org_id() or piefirme_app.es_rannix());

insert into piefirme.catalogo_funciones (clave, nombre, grupo, roles) values
  ('/analisis/ejecutivo', 'Tablero ejecutivo', 'ANÁLISIS', array['administrador']::text[]),
  ('/consultas', 'Consultas', 'CLÍNICA', array['administrador', 'podologo']::text[]),
  ('/fotos-clinicas', 'Fotos clínicas', 'CLÍNICA', array['administrador', 'podologo']::text[]),
  ('/pie-diabetico', 'Pie diabético', 'CLÍNICA', array['administrador', 'podologo']::text[]),
  ('/plantillas-ortopedicas', 'Plantillas ortopédicas', 'CLÍNICA', array['administrador', 'podologo']::text[]),
  ('/quejas', 'Quejas e incidencias', 'CLÍNICA', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/esterilizacion', 'Esterilización', 'CLÍNICA', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/documentos', 'Documentos y plantillas', 'CLÍNICA', array['administrador']::text[]),
  ('/pacientes', 'Pacientes', 'PACIENTES', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/planes', 'Planes de tratamiento', 'PACIENTES', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/seguimiento', 'Seguimiento', 'PACIENTES', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/agenda', 'Agenda', 'AGENDA', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/mi-agenda', 'Mi agenda (móvil)', 'AGENDA', array['podologo']::text[]),
  ('/lista-espera', 'Lista de espera', 'AGENDA', array['administrador', 'recepcion']::text[]),
  ('/recordatorios', 'Recordatorios', 'AGENDA', array['administrador', 'recepcion']::text[]),
  ('/agenda/horarios', 'Horarios y bloqueos', 'AGENDA', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/caja', 'Caja y tickets', 'VENTAS', array['administrador', 'recepcion']::text[]),
  ('/facturacion', 'Facturación', 'VENTAS', array['administrador', 'recepcion']::text[]),
  ('/catalogo', 'Catálogo y precios', 'VENTAS', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/paquetes', 'Paquetes y membresías', 'VENTAS', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/ingresos', 'Ingresos', 'FINANZAS', array['administrador']::text[]),
  ('/gastos', 'Gastos', 'FINANZAS', array['administrador', 'recepcion']::text[]),
  ('/fondo-revolvente', 'Fondo revolvente', 'FINANZAS', array['administrador', 'recepcion']::text[]),
  ('/conciliacion', 'Conciliación bancaria', 'FINANZAS', array['administrador']::text[]),
  ('/cuentas', 'Cuentas por pagar y cobrar', 'FINANZAS', array['administrador']::text[]),
  ('/estado-resultados', 'Estado de resultados', 'FINANZAS', array['administrador']::text[]),
  ('/cierres', 'Cierre de periodos', 'FINANZAS', array['administrador']::text[]),
  ('/bitacora', 'Bitácora', 'ADMIN', array['administrador']::text[]),
  ('/reportes', 'Reportes', 'ANÁLISIS', array['administrador', 'podologo']::text[]),
  ('/dashboard', 'Dashboard', 'INICIO', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/resumen-semanal', 'Resumen semanal', 'INICIO', array['administrador']::text[]),
  ('/importar', 'Importar datos', 'ADMIN', array['administrador']::text[]),
  ('/usuarios', 'Usuarios y roles', 'ADMIN', array['administrador']::text[]),
  ('/configuracion', 'Configuración', 'ADMIN', array['administrador']::text[]),
  ('/suscripcion', 'Suscripción', 'ADMIN', array['administrador']::text[]),
  ('/parametros-duenos', 'Parámetros de los dueños', 'ADMIN', array['administrador']::text[]),
  ('/mi-pin', 'Mi PIN', 'ADMIN', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/asistente', 'Asistente de IA', 'ADMIN', array['administrador', 'podologo']::text[]),
  ('/exportar-datos', 'Exportar mis datos', 'ADMIN', array['administrador']::text[]),
  ('/rh', 'RH y nómina', 'EQUIPO', array['administrador']::text[]),
  ('/mis-recibos', 'Mis recibos', 'EQUIPO', array['podologo', 'recepcion']::text[]),
  ('/comisiones', 'Comisiones', 'EQUIPO', array['administrador', 'podologo']::text[]),
  ('/mantenimiento', 'Mantenimiento', 'EQUIPO', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/inventario', 'Inventario', 'INVENTARIO', array['administrador', 'podologo', 'recepcion']::text[]),
  ('/traspasos', 'Traspasos', 'INVENTARIO', array['administrador', 'recepcion']::text[]),
  ('/compras', 'Compras', 'INVENTARIO', array['administrador', 'recepcion']::text[]),
  ('/proveedores', 'Proveedores', 'INVENTARIO', array['administrador', 'recepcion']::text[]),
  ('/mermas-conteos', 'Mermas y conteos', 'INVENTARIO', array['administrador', 'recepcion']::text[]),
  ('/utilerias/catalogos', 'Catálogos y parámetros', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/salud', 'Salud y errores', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/datos-prueba', 'Datos de prueba', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/warehouse', 'Data warehouse', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/calculos', 'Cálculos del sistema', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/validacion', 'Validación', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/consulta-bd', 'Consulta a base de datos', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/entrega', 'Entrega', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/asistente', 'Consulta del asistente', 'UTILERÍAS', array['administrador']::text[]),
  ('/utilerias/documentacion', 'Documentación', 'UTILERÍAS', array['administrador']::text[])
on conflict (clave) do update set nombre = excluded.nombre, grupo = excluded.grupo, roles = excluded.roles;

create or replace function piefirme.activar_liberacion_estricta(p_org uuid, p_estricta boolean) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_rannix() then raise exception 'solo RANNIX controla la liberación de funciones' using errcode = 'PF403'; end if;
  update piefirme.organizaciones set parametros = jsonb_set(parametros, '{liberacion_estricta}', to_jsonb(coalesce(p_estricta, false)), true) where id = p_org;
  if not found then raise exception 'clínica no encontrada' using errcode = 'PF404'; end if;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (p_org, auth.uid(), 'actualizar', 'organizaciones', p_org::text, jsonb_build_object('cambio', 'liberacion_estricta', 'valor', coalesce(p_estricta, false)));
end $$;

create or replace function piefirme.liberar_funciones(p_org uuid, p_claves text[], p_roles text[], p_habilitada boolean default true, p_nota text default null)
returns integer language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c text; r text; n integer := 0;
begin
  if not piefirme_app.es_rannix() then raise exception 'solo RANNIX libera funciones' using errcode = 'PF403'; end if;
  if not exists (select 1 from piefirme.organizaciones where id = p_org) then raise exception 'clínica no encontrada' using errcode = 'PF404'; end if;
  foreach c in array coalesce(p_claves, '{}') loop
    if not exists (select 1 from piefirme.catalogo_funciones where clave = c) then raise exception 'función desconocida: %', c using errcode = 'PF400'; end if;
    foreach r in array coalesce(p_roles, '{}') loop
      insert into piefirme.funciones_liberadas (organizacion_id, clave, rol, habilitada, nota)
      values (p_org, c, r, coalesce(p_habilitada, true), p_nota)
      on conflict (organizacion_id, clave, rol) do update set habilitada = excluded.habilitada, nota = excluded.nota, liberada_por = auth.uid(), updated_at = now();
      n := n + 1;
    end loop;
  end loop;
  insert into piefirme.bitacora (organizacion_id, usuario_id, accion, entidad, entidad_id, detalle)
  values (p_org, auth.uid(), 'actualizar', 'funciones_liberadas', p_org::text,
          jsonb_build_object('claves', p_claves, 'roles', p_roles, 'habilitada', coalesce(p_habilitada, true), 'nota', p_nota));
  return n;
end $$;

-- Lo que ve quien inició sesión: {estricta: bool, claves: [...]}. Sin liberación estricta devuelve estricta = false y la interfaz muestra todo como hoy.
create or replace function piefirme.funciones_habilitadas() returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_rol text := piefirme_app.rol()::text; v_estricta boolean;
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  v_estricta := piefirme_app.param_bool(v_org, 'liberacion_estricta', false);
  if not v_estricta then return jsonb_build_object('estricta', false, 'claves', '[]'::jsonb); end if;
  return jsonb_build_object('estricta', true, 'claves',
    coalesce((select jsonb_agg(fl.clave order by fl.clave) from piefirme.funciones_liberadas fl
               where fl.organizacion_id = v_org and fl.rol = v_rol and fl.habilitada), '[]'::jsonb));
end $$;

create or replace view piefirme.prp_catalogo_funciones with (security_invoker = true) as
  select clave, nombre, grupo, roles from piefirme.catalogo_funciones;
create or replace view piefirme.prp_funciones_liberadas with (security_invoker = true) as
  select organizacion_id, clave, rol, habilitada, nota, updated_at from piefirme.funciones_liberadas;
grant select on piefirme.prp_catalogo_funciones, piefirme.prp_funciones_liberadas to authenticated;

-- Estado de la liberación de una clínica (para la pantalla del superadministrador).
create or replace function piefirme.estado_liberacion(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  if not piefirme_app.es_rannix() then raise exception 'solo RANNIX consulta la liberación' using errcode = 'PF403'; end if;
  return jsonb_build_object('estricta', piefirme_app.param_bool(p_org, 'liberacion_estricta', false),
    'liberadas', (select count(*) from piefirme.funciones_liberadas where organizacion_id = p_org and habilitada));
end $$;

revoke all on function piefirme.estado_liberacion(uuid) from public, anon;
grant execute on function piefirme.estado_liberacion(uuid) to authenticated, service_role;
revoke all on function piefirme.activar_liberacion_estricta(uuid, boolean) from public, anon;
revoke all on function piefirme.liberar_funciones(uuid, text[], text[], boolean, text) from public, anon;
revoke all on function piefirme.funciones_habilitadas() from public, anon;
grant execute on function piefirme.activar_liberacion_estricta(uuid, boolean), piefirme.liberar_funciones(uuid, text[], text[], boolean, text),
  piefirme.funciones_habilitadas() to authenticated, service_role;
