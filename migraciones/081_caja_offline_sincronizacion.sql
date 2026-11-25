-- 081 · Caja sin conexión: sincronización idempotente de tickets cobrados offline + cierre de funciones auxiliares a anon.
-- Decidido 2026-11-25 (dueño): la caja debe seguir operando sin internet (catálogo de servicios, productos y clientes visibles) y, al volver la conexión,
-- sincronizar los tickets en orden de captura. Cambia el alcance offline de P-050 (antes solo agenda del día): ahora también el COBRO básico.
-- Diseño: el dispositivo guarda el ticket en una cola local con un identificador único (cliente_uuid). Al reconectar llama a
-- sincronizar_ticket_offline, que crea venta + renglones + características + pagos y la cobra en UNA transacción; si el mismo cliente_uuid ya existe
-- devuelve ese ticket (no se duplica aunque la red se corte a la mitad y se reintente). El folio oficial lo asigna el servidor al sincronizar
-- (el ticket impreso offline lleva un folio provisional OFF-… que queda guardado en folio_offline para rastrearlo).
-- ADITIVA. Depende de: 026, 077.
set search_path = piefirme, piefirme_app, extensions;

alter table piefirme.ventas add column if not exists cliente_uuid       uuid;
alter table piefirme.ventas add column if not exists folio_offline     text;
alter table piefirme.ventas add column if not exists offline_creada_en timestamptz;
create unique index if not exists ventas_cliente_uuid_uk on piefirme.ventas (organizacion_id, cliente_uuid) where cliente_uuid is not null;

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
    insert into piefirme.ventas (sede_id, origen, paciente_id, podologo_id, requiere_factura, estado, cliente_uuid, folio_offline, offline_creada_en)
    values ((p_payload ->> 'sede_id')::uuid, 'mostrador', nullif(p_payload ->> 'paciente_id', '')::uuid, nullif(p_payload ->> 'podologo_id', '')::uuid,
            coalesce((p_payload ->> 'requiere_factura')::boolean, false), 'por_cobrar', v_uuid, p_payload ->> 'folio_offline', nullif(p_payload ->> 'creado_en', '')::timestamptz)
    returning id into v_id;
  exception when unique_violation then
    select id, folio into v_id, v_folio from piefirme.ventas where organizacion_id = v_org and cliente_uuid = v_uuid;
    return jsonb_build_object('venta_id', v_id, 'folio', v_folio, 'ya_existia', true);
  end;

  for l in select * from jsonb_array_elements(p_payload -> 'lineas') loop
    insert into piefirme.venta_lineas (venta_id, orden, tipo, servicio_id, producto_id, oferta_id, descripcion, atendio_id, cantidad, precio_unitario, tipo_precio, descuento_pct, descuento_motivo)
    values (v_id, i, l ->> 'tipo', nullif(l ->> 'servicio_id', '')::uuid, nullif(l ->> 'producto_id', '')::uuid, nullif(l ->> 'oferta_id', '')::uuid, l ->> 'descripcion',
            nullif(l ->> 'atendio_id', '')::uuid, (l ->> 'cantidad')::numeric, coalesce((l ->> 'precio_unitario')::numeric, 0), coalesce(l ->> 'tipo_precio', 'fijo'),
            coalesce((l ->> 'descuento_pct')::numeric, 0), l ->> 'descuento_motivo')
    returning id into v_lid;
    j := 0;
    for c in select * from jsonb_array_elements(coalesce(l -> 'caracteristicas', '[]'::jsonb)) loop
      insert into piefirme.venta_linea_caracteristicas (venta_linea_id, sede_id, caracteristica_id, grupo, nombre, frase, valor, unidad, efecto_precio, monto_unitario, importe, orden)
      values (v_lid, (p_payload ->> 'sede_id')::uuid, nullif(c ->> 'caracteristica_id', '')::uuid, c ->> 'grupo', c ->> 'nombre', c ->> 'frase', nullif(c ->> 'valor', '')::numeric,
              nullif(c ->> 'unidad', ''), c ->> 'efecto_precio', coalesce((c ->> 'monto_unitario')::numeric, 0), coalesce((c ->> 'importe')::numeric, 0), j);
      j := j + 1;
    end loop;
    i := i + 1;
  end loop;

  for p in select * from jsonb_array_elements(coalesce(p_payload -> 'pagos', '[]'::jsonb)) loop
    insert into piefirme.pagos (venta_id, metodo, monto, referencia, ultimos4, efectivo_recibido, cambio)
    values (v_id, p ->> 'metodo', (p ->> 'monto')::numeric, nullif(p ->> 'referencia', ''), nullif(p ->> 'ultimos4', ''), nullif(p ->> 'efectivo_recibido', '')::numeric, nullif(p ->> 'cambio', '')::numeric);
  end loop;

  perform piefirme.cobrar_venta(v_id);
  select folio into v_folio from piefirme.ventas where id = v_id;
  return jsonb_build_object('venta_id', v_id, 'folio', v_folio, 'ya_existia', false);
end $$;
revoke all on function piefirme.sincronizar_ticket_offline(jsonb) from public, anon;
grant execute on function piefirme.sincronizar_ticket_offline(jsonb) to authenticated, service_role;

-- Las funciones auxiliares creadas en 073–076 heredaron EXECUTE de PUBLIC (lo detectó test:rls): solo las usa la sesión autenticada.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'piefirme_app' and p.proname in ('tiene_funcion', 'es_supervisor', 'siguiente_folio_catalogo') loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;
