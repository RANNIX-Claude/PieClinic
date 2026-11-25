-- 082 · Corrección de sincronizar_ticket_offline (081): fija organizacion_id y sede_id en venta, renglones, características y pagos, como hace el cliente
-- al guardar un ticket en línea (api.js agrega organizacion_id). Sin ello el trigger de ventas rechazaba la sede como «de otra clínica».
-- Depende de: 081.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.sincronizar_ticket_offline(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare
  v_org uuid := piefirme_app.org_id();
  v_uuid uuid := nullif(p_payload ->> 'cliente_uuid', '')::uuid;
  v_id uuid; v_folio text; v_lid uuid; l jsonb; c jsonb; p jsonb; i integer := 0; j integer;
begin
  if auth.uid() is null or v_org is null then raise exception 'sin sesión válida' using errcode = 'PF401'; end if;
  if v_uuid is null then raise exception 'falta el identificador del ticket offline' using errcode = 'PF400'; end if;
  select id, folio into v_id, v_folio from piefirme.ventas where organizacion_id = v_org and cliente_uuid = v_uuid;
  if found then return jsonb_build_object('venta_id', v_id, 'folio', v_folio, 'ya_existia', true); end if;
  if jsonb_array_length(coalesce(p_payload -> 'lineas', '[]'::jsonb)) = 0 then raise exception 'el ticket offline no tiene renglones' using errcode = 'PF400'; end if;

  begin
    insert into piefirme.ventas (organizacion_id, sede_id, origen, paciente_id, podologo_id, requiere_factura, estado, cliente_uuid, folio_offline, offline_creada_en)
    values (v_org, (p_payload ->> 'sede_id')::uuid, 'mostrador', nullif(p_payload ->> 'paciente_id', '')::uuid, nullif(p_payload ->> 'podologo_id', '')::uuid,
            coalesce((p_payload ->> 'requiere_factura')::boolean, false), 'por_cobrar', v_uuid, p_payload ->> 'folio_offline', nullif(p_payload ->> 'creado_en', '')::timestamptz)
    returning id into v_id;
  exception when unique_violation then
    select id, folio into v_id, v_folio from piefirme.ventas where organizacion_id = v_org and cliente_uuid = v_uuid;
    return jsonb_build_object('venta_id', v_id, 'folio', v_folio, 'ya_existia', true);
  end;

  for l in select * from jsonb_array_elements(p_payload -> 'lineas') loop
    insert into piefirme.venta_lineas (organizacion_id, sede_id, venta_id, orden, tipo, servicio_id, producto_id, oferta_id, descripcion, atendio_id, cantidad, precio_unitario, tipo_precio, descuento_pct, descuento_motivo)
    values (v_org, (p_payload ->> 'sede_id')::uuid, v_id, i, l ->> 'tipo', nullif(l ->> 'servicio_id', '')::uuid, nullif(l ->> 'producto_id', '')::uuid, nullif(l ->> 'oferta_id', '')::uuid, l ->> 'descripcion',
            nullif(l ->> 'atendio_id', '')::uuid, (l ->> 'cantidad')::numeric, coalesce((l ->> 'precio_unitario')::numeric, 0), coalesce(l ->> 'tipo_precio', 'fijo'),
            coalesce((l ->> 'descuento_pct')::numeric, 0), l ->> 'descuento_motivo')
    returning id into v_lid;
    j := 0;
    for c in select * from jsonb_array_elements(coalesce(l -> 'caracteristicas', '[]'::jsonb)) loop
      insert into piefirme.venta_linea_caracteristicas (organizacion_id, venta_linea_id, sede_id, caracteristica_id, grupo, nombre, frase, valor, unidad, efecto_precio, monto_unitario, importe, orden)
      values (v_org, v_lid, (p_payload ->> 'sede_id')::uuid, nullif(c ->> 'caracteristica_id', '')::uuid, c ->> 'grupo', c ->> 'nombre', c ->> 'frase', nullif(c ->> 'valor', '')::numeric,
              nullif(c ->> 'unidad', ''), c ->> 'efecto_precio', coalesce((c ->> 'monto_unitario')::numeric, 0), coalesce((c ->> 'importe')::numeric, 0), j);
      j := j + 1;
    end loop;
    i := i + 1;
  end loop;

  for p in select * from jsonb_array_elements(coalesce(p_payload -> 'pagos', '[]'::jsonb)) loop
    insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto, referencia, ultimos4, efectivo_recibido, cambio)
    values (v_org, (p_payload ->> 'sede_id')::uuid, v_id, p ->> 'metodo', (p ->> 'monto')::numeric, nullif(p ->> 'referencia', ''), nullif(p ->> 'ultimos4', ''), nullif(p ->> 'efectivo_recibido', '')::numeric, nullif(p ->> 'cambio', '')::numeric);
  end loop;

  perform piefirme.cobrar_venta(v_id);
  select folio into v_folio from piefirme.ventas where id = v_id;
  return jsonb_build_object('venta_id', v_id, 'folio', v_folio, 'ya_existia', false);
end $$;
revoke all on function piefirme.sincronizar_ticket_offline(jsonb) from public, anon;
grant execute on function piefirme.sincronizar_ticket_offline(jsonb) to authenticated, service_role;
