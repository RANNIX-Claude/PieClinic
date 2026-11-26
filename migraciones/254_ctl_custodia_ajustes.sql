-- 254 · Control y Auditoría · ETAPA 7 · CADENA DE CUSTODIA: ajustes tras las pruebas.
--   · ctl_caidas_listar: la variable del ciclo era un record; el cálculo de la comparación exige la fila de la tabla.
--   · ctl_sello_reabrir_por_folio: quien reabre una caja conoce el FOLIO del sello (lo tiene en la mano), no su id; la sucursal no puede leer sellos ajenos,
--     así que la búsqueda por folio la hace el servidor (y solo devuelve el resultado de la reapertura).
--   · Las funciones internas de piefirme_app (poleo de ventas, marcar sello roto, evaluación de caídas…) NO son ejecutables por la app: solo las RPC de piefirme.
-- Depende de: 250–253.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.ctl_caidas_listar(p_sucursal uuid default null, p_limite integer default 50) returns jsonb
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); v_ver boolean := piefirme_app.ctl_puede('ver_directo'); v_res jsonb := '[]'::jsonb; c piefirme.ctl_caida_sistema%rowtype;
begin
  if p_sucursal is not null then perform piefirme_app.ctl_cus_sede(v_org, p_sucursal); end if;
  for c in select x.* from piefirme.ctl_caida_sistema x where x.organizacion_id = v_org and piefirme_app.puede_sede(x.sucursal_id) and (p_sucursal is null or x.sucursal_id = p_sucursal)
            order by x.inicio_en desc limit least(greatest(coalesce(p_limite, 50), 1), 200) loop
    v_res := v_res || jsonb_build_array(jsonb_build_object('id', c.id, 'sucursal_id', c.sucursal_id, 'inicio_en', c.inicio_en, 'fin_en', c.fin_en, 'abierta', c.fin_en is null,
        'tickets_manuales', coalesce((select count(*) from piefirme.ctl_ticket_manual t where t.caida_id = c.id and t.estado in ('capturado', 'cancelado')), 0), 'detectada_por', c.detectada_por, 'nota', c.nota)
        || case when v_ver then jsonb_build_object('comparacion', piefirme_app.ctl_caida_calcular(c)) else '{}'::jsonb end);
  end loop;
  return v_res;
end $$;

create or replace function piefirme.ctl_sello_reabrir_por_folio(p_id uuid, p_sucursal uuid, p_folio_anterior text, p_motivo text, p_nuevo_folio text, p_evidencia uuid default null, p_hora_cliente timestamptz default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('capturar'); s piefirme.ctl_sello%rowtype; v_folio text := piefirme_app.ctl_cus_folio(p_folio_anterior);
begin
  perform piefirme_app.ctl_cus_sede(v_org, p_sucursal);
  if v_folio is null then raise exception 'escriba el folio del sello que se rompe o se retira' using errcode = 'PF422'; end if;
  select * into s from piefirme.ctl_sello where organizacion_id = v_org and folio_sello = v_folio and sucursal_id = p_sucursal;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'sello_desconocido', 'mensaje', 'Ese folio de sello no está registrado en esta sucursal. Revise el folio o avise a su supervisor.');
  end if;
  return piefirme.ctl_sello_reabrir(p_id, s.id, p_motivo, p_nuevo_folio, p_evidencia, p_hora_cliente);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('piefirme', 'piefirme_app') and p.proname in ('ctl_caidas_listar', 'ctl_sello_reabrir_por_folio') loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated', f.firma);
  end loop;
  -- internas de la Etapa 7: ni anon ni la app (los privilegios por omisión del esquema se las daban a authenticated)
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme_app' and p.proname in ('ctl_cus_sede', 'ctl_cus_folio', 'ctl_cus_nombre_sede', 'ctl_cus_nombre_producto', 'ctl_cus_alerta', 'ctl_cus_evidencia_ok',
                  'ctl_sello_marcar_roto', 'ctl_trg_partida_sello', 'ctl_sello_verificar_interno', 'ctl_alto_valor_procesar', 'ctl_alto_valor_evaluar', 'ctl_talonario_alerta_diaria',
                  'ctl_caida_calcular', 'ctl_caidas_evaluar') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;
