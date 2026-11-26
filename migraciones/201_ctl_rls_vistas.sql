-- 201 · Control y Auditoría · Etapa 0 · PRIVILEGIOS, RLS y VISTAS POR AUDIENCIA.
--   · La app (authenticated) solo tiene SELECT; se REVOCA INSERT/UPDATE/DELETE/TRUNCATE: toda escritura es por RPC SECURITY DEFINER (203).
--     anon no toca nada. (Los privilegios por omisión del esquema le dan arwd a authenticated: aquí se quitan explícitamente.)
--   · RLS por organizacion_id + rol del módulo (ctl_puede) + sede. Sin política = nadie (p. ej. ctl_intento, ctl_folio_seq).
--   · CAPTURA A CIEGAS: lo que el sistema espera vive en tablas aparte (ctl_*_calculo, ctl_sesion_resultado, ctl_caso…) cuyas filas
--     solo ve quien tiene 'ver_diferencias'. Vistas separadas por audiencia: *_captura (sin saldo) y *_revision (con saldo).
-- Depende de: 200.
set search_path = piefirme, piefirme_app, extensions;

do $$
declare t text;
  v_todas text[] := array['ctl_folio_seq', 'ctl_config_def', 'ctl_transicion', 'ctl_sesion_conteo', 'ctl_sesion_resultado', 'ctl_partida_conteo', 'ctl_partida_calculo',
    'ctl_lista_solicitada', 'ctl_punto_control', 'ctl_cierre', 'ctl_cierre_captura', 'ctl_cierre_calculo', 'ctl_denominacion', 'ctl_toma_fija', 'ctl_evidencia',
    'ctl_causa', 'ctl_caso', 'ctl_caso_bitacora', 'ctl_producto_custodia', 'ctl_sello', 'ctl_talonario', 'ctl_ticket_manual', 'ctl_caida_sistema', 'ctl_atencion',
    'ctl_consumo_esperado', 'ctl_ocupacion', 'ctl_producto_atributo', 'ctl_config', 'ctl_config_bitacora', 'ctl_bitacora_consulta', 'ctl_discrepancia_hora',
    'ctl_eventos_entrada', 'ctl_llamada_origen', 'ctl_alerta', 'ctl_intento', 'ctl_sesion_pin'];
  v_sin_lectura text[] := array['ctl_folio_seq', 'ctl_intento'];
begin
  foreach t in array v_todas loop
    execute format('alter table piefirme.%I enable row level security', t);
    execute format('revoke all on piefirme.%I from public, anon, authenticated', t);
    if not (t = any (v_sin_lectura)) then execute format('grant select on piefirme.%I to authenticated', t); end if;
  end loop;
end $$;
revoke all on sequence piefirme.ctl_intento_id_seq from public, anon, authenticated;

-- ───────────────────────────── políticas de lectura ─────────────────────────────
-- A · captura y operación por sede (sin ningún dato calculado): quien captura, supervisa o soporta.
-- B · lo que el sistema espera / diferencias / casos: SOLO ver_diferencias (nunca encargado, cajero ni podólogo).
-- C · catálogos y configuración.
do $$
declare t text; v_a text[] := array['ctl_sesion_conteo', 'ctl_partida_conteo', 'ctl_lista_solicitada', 'ctl_cierre', 'ctl_cierre_captura', 'ctl_denominacion',
      'ctl_toma_fija', 'ctl_evidencia', 'ctl_producto_custodia', 'ctl_sello', 'ctl_talonario', 'ctl_ticket_manual', 'ctl_caida_sistema', 'ctl_atencion', 'ctl_ocupacion'];
  v_b text[] := array['ctl_sesion_resultado', 'ctl_partida_calculo', 'ctl_cierre_calculo', 'ctl_caso', 'ctl_caso_bitacora', 'ctl_alerta', 'ctl_llamada_origen',
      'ctl_eventos_entrada', 'ctl_discrepancia_hora', 'ctl_consumo_esperado'];
begin
  foreach t in array v_a loop
    execute format('drop policy if exists %I on piefirme.%I', t || '_sel', t);
    execute format($p$create policy %I on piefirme.%I for select to authenticated using (
        organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id)
        and (piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('ver_directo')))$p$, t || '_sel', t);
  end loop;
  foreach t in array v_b loop
    execute format('drop policy if exists %I on piefirme.%I', t || '_sel', t);
    if t in ('ctl_consumo_esperado', 'ctl_eventos_entrada') then
      execute format($p$create policy %I on piefirme.%I for select to authenticated using (
          organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo'))$p$, t || '_sel', t);
    else
      execute format($p$create policy %I on piefirme.%I for select to authenticated using (
          organizacion_id = piefirme_app.org_id() and piefirme_app.puede_sede(sucursal_id) and piefirme_app.ctl_puede('ver_directo'))$p$, t || '_sel', t);
    end if;
  end loop;
end $$;

-- ctl_caso_bitacora y ctl_alerta pueden tener sucursal nula: puede_sede(null) es falso para un supervisor con sedes. Se corrige por tabla.
drop policy if exists ctl_caso_bitacora_sel on piefirme.ctl_caso_bitacora;
create policy ctl_caso_bitacora_sel on piefirme.ctl_caso_bitacora for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo') and (sucursal_id is null or piefirme_app.puede_sede(sucursal_id)));
drop policy if exists ctl_alerta_sel on piefirme.ctl_alerta;
create policy ctl_alerta_sel on piefirme.ctl_alerta for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo') and (sucursal_id is null or piefirme_app.puede_sede(sucursal_id)));
drop policy if exists ctl_discrepancia_hora_sel on piefirme.ctl_discrepancia_hora;
create policy ctl_discrepancia_hora_sel on piefirme.ctl_discrepancia_hora for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('ver_directo') and (sucursal_id is null or piefirme_app.puede_sede(sucursal_id)));

-- C · catálogos
drop policy if exists ctl_config_def_sel on piefirme.ctl_config_def;
create policy ctl_config_def_sel on piefirme.ctl_config_def for select to authenticated
  using (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar'));
drop policy if exists ctl_transicion_sel on piefirme.ctl_transicion;
create policy ctl_transicion_sel on piefirme.ctl_transicion for select to authenticated using (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar'));
drop policy if exists ctl_punto_control_sel on piefirme.ctl_punto_control;
create policy ctl_punto_control_sel on piefirme.ctl_punto_control for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_causa_sel on piefirme.ctl_causa;
create policy ctl_causa_sel on piefirme.ctl_causa for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_producto_atributo_sel on piefirme.ctl_producto_atributo;
create policy ctl_producto_atributo_sel on piefirme.ctl_producto_atributo for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('capturar') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_config_sel on piefirme.ctl_config;
create policy ctl_config_sel on piefirme.ctl_config for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));
drop policy if exists ctl_config_bitacora_sel on piefirme.ctl_config_bitacora;
create policy ctl_config_bitacora_sel on piefirme.ctl_config_bitacora for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (piefirme_app.ctl_puede('ver_directo') or piefirme_app.ctl_puede('configurar')));
-- quién consultó los reportes de diferencias: dueño y soporte (configurar); el supervisor no audita a sus pares
drop policy if exists ctl_bitacora_consulta_sel on piefirme.ctl_bitacora_consulta;
create policy ctl_bitacora_consulta_sel on piefirme.ctl_bitacora_consulta for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and piefirme_app.ctl_puede('configurar'));
-- sesión de captura: la propia o quien ve diferencias
drop policy if exists ctl_sesion_pin_sel on piefirme.ctl_sesion_pin;
create policy ctl_sesion_pin_sel on piefirme.ctl_sesion_pin for select to authenticated
  using (organizacion_id = piefirme_app.org_id() and (perfil_id = auth.uid() or piefirme_app.ctl_puede('ver_directo')));

-- ───────────────────────────── vistas por audiencia (security_invoker) ─────────────────────────────
-- Captura (sucursal): sin saldo, sin diferencia, sin precio de catálogo, sin caso.
create or replace view piefirme.ctl_partida_captura with (security_invoker = true) as
  select p.id, p.organizacion_id, p.sucursal_id, p.sesion_id, p.producto_id, p.codigo_escaneado, p.cantidad_fisica, p.precio_etiqueta,
         p.numero_serie, p.folio_sello, p.sello_intacto, p.nota, p.escaneado_en, p.corrige_a
    from piefirme.ctl_partida_conteo p
   where piefirme_app.ctl_puede('capturar');

-- Revisión (supervisor / dueño / soporte): con lo que el sistema esperaba.
create or replace view piefirme.ctl_partida_revision with (security_invoker = true) as
  select p.id, p.organizacion_id, p.sucursal_id, p.sesion_id, p.producto_id, p.codigo_escaneado, p.cantidad_fisica, p.precio_etiqueta,
         p.numero_serie, p.folio_sello, p.sello_intacto, p.nota, p.escaneado_en, p.corrige_a, p.creado_por as usuario_captura,
         c.saldo_sistema, c.diferencia_piezas, c.costo_unitario, c.diferencia_valor, c.precio_catalogo, c.diferencia_precio, c.clasificacion_precio,
         (select k.id from piefirme.ctl_caso k where k.organizacion_id = p.organizacion_id and k.origen_tipo = 'partida_conteo' and k.origen_id = p.id limit 1) as caso_id
    from piefirme.ctl_partida_conteo p
    join piefirme.ctl_partida_calculo c on c.partida_id = p.id
   where piefirme_app.ctl_puede('ver_directo');

create or replace view piefirme.ctl_sesion_revision with (security_invoker = true) as
  select s.id, s.organizacion_id, s.folio, s.sucursal_id, s.tipo, s.modo_lista, s.estado, s.solicitada_por, s.solicitada_en, s.limite_en, s.abierta_en,
         s.cerrada_en, s.usuario_captura, s.turno_id, s.total_partidas, r.partidas_con_diferencia, r.valor_diferencia,
         (select count(*) from piefirme.ctl_lista_solicitada l where l.sesion_id = s.id and not l.reportado) as no_reportadas
    from piefirme.ctl_sesion_conteo s
    left join piefirme.ctl_sesion_resultado r on r.sesion_id = s.id
   where piefirme_app.ctl_puede('ver_directo');

create or replace view piefirme.ctl_cierre_puntos with (security_invoker = true) as
  select c.id, c.organizacion_id, c.sucursal_id, c.cierre_id, c.punto_control_id, c.valor_capturado, c.capturado_en
    from piefirme.ctl_cierre_captura c
   where piefirme_app.ctl_puede('capturar');

create or replace view piefirme.ctl_cierre_revision with (security_invoker = true) as
  select c.id, c.organizacion_id, c.sucursal_id, c.cierre_id, c.punto_control_id, c.valor_capturado, c.capturado_en,
         k.valor_esperado, k.diferencia, k.dentro_tolerancia
    from piefirme.ctl_cierre_captura c
    join piefirme.ctl_cierre_calculo k on k.cierre_captura_id = c.id
   where piefirme_app.ctl_puede('ver_directo');

-- Catálogo para escanear (sucursal): solo lo necesario para reconocer la pieza; sin precio, sin costo, sin existencia.
create or replace view piefirme.ctl_producto_captura with (security_invoker = true) as
  select p.id, p.organizacion_id, p.codigo_barras, p.sku, p.nombre as descripcion,
         coalesce(a.requiere_serie, false) as requiere_serie, coalesce(a.requiere_sello, false) as requiere_sello
    from piefirme.productos p
    left join piefirme.ctl_producto_atributo a on a.producto_id = p.id and a.organizacion_id = p.organizacion_id
   where piefirme_app.ctl_puede('capturar') and p.estado in ('activo', 'sin_existencia');
grant select on piefirme.ctl_partida_captura, piefirme.ctl_partida_revision, piefirme.ctl_sesion_revision, piefirme.ctl_cierre_puntos,
                piefirme.ctl_cierre_revision, piefirme.ctl_producto_captura to authenticated;
revoke all on piefirme.ctl_partida_captura, piefirme.ctl_partida_revision, piefirme.ctl_sesion_revision, piefirme.ctl_cierre_puntos,
              piefirme.ctl_cierre_revision, piefirme.ctl_producto_captura from anon, public;
