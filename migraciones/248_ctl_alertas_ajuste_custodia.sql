-- 248 · Control y Auditoría · ETAPA 6 · AJUSTES TRAS CONOCER LA ETAPA 7 (custodia).
--   · La detección de ventas de piezas de alto valor es de la Etapa 7 (ctl_alto_valor_evaluar, alerta crítica al dueño, idempotente por línea): las evaluaciones programadas la
--     INVOCAN en lugar de repetirla (se elimina ctl_o_ventas_alto_valor_desde de la 245 para no duplicar alertas).
--   · El catálogo de eventos de alerta incluye los tipos que emite la Etapa 7 con sus nombres reales (folio_faltante, folio_faltante_diario, peso_fuera_de_rango,
--     sucursal_se_cae); folio_talonario_faltante (nombre provisional de la 245) se retira.
-- Depende de: 245 (y, si existe, 252).
set search_path = piefirme, piefirme_app, extensions;

delete from piefirme.ctl_alerta_catalogo where tipo = 'folio_talonario_faltante';
insert into piefirme.ctl_alerta_catalogo (tipo, nombre, descripcion, canales, destinatarios, inmediata, severidad, fuente, emite, orden) values
 ('folio_faltante', 'Folio de talonario faltante', 'La auditoría del talonario encontró folios que faltan o están saltados (F5.4): el caso ya está abierto; el aviso va en el resumen diario.',
    array['correo'], array['dueno'], false, 'alta', 'especificacion', 'custodia (Etapa 7)', 60),
 ('folio_faltante_diario', 'Folios de talonario sin capturar (correo diario)', 'Resumen diario de los folios de talonario que siguen sin capturar (F5.4): es el «correo diario» de la especificación.',
    array['correo'], array['dueno'], true, 'alta', 'especificacion', 'custodia (Etapa 7)', 61),
 ('peso_fuera_de_rango', 'Peso de la caja fuera de rango', 'La báscula no coincide con el peso de caja llena de la pieza: puede estar vacía o abierta (F5.2).',
    array['push'], array['supervisor', 'dueno'], true, 'alta', 'sistema', 'custodia (Etapa 7)', 52),
 ('sucursal_se_cae', 'La sucursal «se cae» con frecuencia', 'El sistema se cayó varias veces y en la mayoría vendió menos de lo normal (F5.4). Un patrón para revisar, no una conclusión.',
    array['push'], array['dueno', 'supervisor'], true, 'alta', 'sistema', 'custodia (Etapa 7)', 62)
on conflict (tipo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, canales = excluded.canales, destinatarios = excluded.destinatarios,
  inmediata = excluded.inmediata, severidad = excluded.severidad, fuente = excluded.fuente, emite = excluded.emite, orden = excluded.orden;
update piefirme.ctl_alerta_catalogo set emite = 'custodia (Etapa 7)', descripcion = 'Un sello VOID aparece roto sin un registro de reapertura (F5.2).' where tipo = 'sello_roto_sin_registro';
update piefirme.ctl_alerta_catalogo set emite = 'custodia (Etapa 7: ctl_alto_valor_evaluar, invocada por las evaluaciones programadas)' where tipo = 'venta_alto_valor';

drop function if exists piefirme_app.ctl_o_ventas_alto_valor_desde(uuid, timestamptz);

create or replace function piefirme_app.ctl_alertas_programadas_org(p_org uuid, p_ahora timestamptz default now(), p_ventana interval default interval '2 days') returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare s record; c record; v_tz text := piefirme_app.ctl_zona(p_org); v_local timestamp := p_ahora at time zone v_tz; v_hoy date := v_local::date; v_hora integer := extract(hour from v_local)::integer;
        v_ini timestamptz := v_hoy::timestamp at time zone v_tz; v_fin timestamptz := (v_hoy + 1)::timestamp at time zone v_tz; v_h_ap integer; v_h_ci integer; v_hs integer;
        v_ref text := 'dia:' || v_hoy::text; v_ap integer := 0; v_ci integer := 0; v_sy integer := 0; v_ca integer := 0; v_av integer := 0; v_ult timestamptz; v_nuevas integer := 0; v_antes integer; v_id uuid; v_exist boolean;
begin
  for s in select x.id, x.nombre from piefirme.sedes x where x.organizacion_id = p_org and x.activa loop
    continue when not piefirme_app.ctl_sucursal_usa_modulo(p_org, s.id);   -- una sucursal que nunca usó el módulo no genera alertas de omisión
    v_h_ap := piefirme_app.ctl_cfg_num(p_org, 'alertas_hora_sin_apertura', s.id)::integer;
    v_h_ci := piefirme_app.ctl_cfg_num(p_org, 'alertas_hora_sin_cierre', s.id)::integer;
    v_hs := piefirme_app.ctl_cfg_num(p_org, 'salud_sync_horas', s.id)::integer;
    -- sin conteo de apertura (solo si la frecuencia configurada es «diario a la apertura»)
    if v_hora >= v_h_ap and (piefirme_app.ctl_config_en(p_org, 'frecuencia_conteo_completo', s.id, p_ahora) #>> '{}') = 'diario_apertura'
       and piefirme_app.ctl_o_opero(p_org, s.id, v_ini, v_fin)
       and not exists (select 1 from piefirme.ctl_sesion_conteo k where k.organizacion_id = p_org and k.sucursal_id = s.id and k.tipo = 'conteo_apertura'
                          and k.estado <> 'cancelada' and k.abierta_en >= v_ini and k.abierta_en < v_fin) then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'sin_conteo_apertura' and referencia_tipo = v_ref and referencia_id = s.id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.id, 'sin_conteo_apertura', format('%s: la sucursal ya operó hoy y no hay conteo de apertura (se esperaba antes de las %s:00).', s.nombre, v_h_ap), v_ref, s.id);
      if v_antes = 0 then v_ap := v_ap + 1; end if;
    end if;
    -- sin cierre
    if v_hora >= v_h_ci and piefirme_app.ctl_o_opero(p_org, s.id, v_ini, v_fin)
       and not exists (select 1 from piefirme.ctl_cierre k where k.organizacion_id = p_org and k.sucursal_id = s.id and k.tipo in ('turno', 'dia')
                          and k.estado in ('cerrado', 'entrega_no_aceptada') and k.cerrado_en >= v_ini and k.cerrado_en < v_fin) then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'sin_cierre' and referencia_tipo = v_ref and referencia_id = s.id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.id, 'sin_cierre', format('%s: la sucursal ya operó hoy y no hay cierre registrado (se esperaba antes de las %s:00).', s.nombre, v_h_ci), v_ref, s.id);
      if v_antes = 0 then v_ci := v_ci + 1; end if;
    end if;
    -- sin sincronizar (tablero de salud): va al resumen diario
    v_ult := piefirme_app.ctl_ultima_actividad(p_org, s.id);
    if v_ult is not null and v_ult < p_ahora - make_interval(hours => v_hs) then
      select count(*) into v_antes from piefirme.ctl_alerta where organizacion_id = p_org and tipo = 'sin_sincronizar' and referencia_tipo = v_ref and referencia_id = s.id;
      perform piefirme_app.ctl_alerta_nueva(p_org, s.id, 'sin_sincronizar', format('%s: no ha enviado nada al módulo en %s horas (umbral: %s).', s.nombre, round(extract(epoch from (p_ahora - v_ult)) / 3600), v_hs), v_ref, s.id);
      if v_antes = 0 then v_sy := v_sy + 1; end if;
    end if;
  end loop;
  -- cancelaciones observadas en el origen (cuando la Etapa 1 emita «cancelación autorizada» se liga a ese evento)
  for c in select cc.*, sd.nombre as sucursal from piefirme_app.ctl_o_cancelaciones_desde(p_org, p_ahora - p_ventana) cc join piefirme.sedes sd on sd.id = cc.sucursal_id loop
    select exists (select 1 from piefirme.ctl_alerta a where a.organizacion_id = p_org and a.tipo = 'cancelacion_autorizada' and a.referencia_id = c.venta_id) into v_exist;
    perform piefirme_app.ctl_alerta_nueva(p_org, c.sucursal_id, 'cancelacion_autorizada',
              format('%s: se canceló el ticket %s por $%s%s.', c.sucursal, c.ticket, to_char(c.total, 'FM999,999,990.00'), coalesce(' · motivo: ' || nullif(btrim(c.motivo), ''), '')), 'venta', c.venta_id);
    if not v_exist then v_ca := v_ca + 1; end if;
  end loop;
  -- ventas de piezas de alto valor: la detección es de la Etapa 7 (custodia; idempotente por línea de venta y con alerta crítica al dueño). Aquí solo se invoca, si existe.
  if to_regprocedure('piefirme_app.ctl_alto_valor_evaluar(uuid,timestamp with time zone)') is not null then
    execute 'select piefirme_app.ctl_alto_valor_evaluar($1, $2)' into v_av using p_org, p_ahora - p_ventana;
    v_av := coalesce(v_av, 0);
  end if;
  v_nuevas := piefirme_app.ctl_alertas_despachar_pendientes(p_org);
  return jsonb_build_object('organizacion_id', p_org, 'ahora', p_ahora, 'hora_local', v_hora, 'sin_conteo_apertura', v_ap, 'sin_cierre', v_ci, 'sin_sincronizar', v_sy,
                            'cancelaciones', v_ca, 'ventas_alto_valor', v_av, 'despachadas_pendientes', v_nuevas);
end $$;
