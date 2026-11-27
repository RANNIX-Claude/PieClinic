-- 321 · Pedidos especiales · FUNCIONES (todas las escrituras). Ver 320 y docs/PEDIDOS_ESPECIALES.md.
-- Todas son SECURITY DEFINER con comprobación explícita de organización, sede y rol (igual que fin_folio / proveedor_crear_rapido);
-- ninguna es ejecutable por anon. Las reglas de dinero y de estados viven aquí y en los triggers de 320, no en el navegador.

-- ───────────────────────────── ayudas internas ─────────────────────────────
-- Producto «por encargo» (compra al proveedor) y producto especial con características (ticket de entrega) por tipo de pedido. Se crean la primera vez.
create or replace function piefirme_app.pedido_item_base(p_org uuid, p_tipo text, out o_producto uuid, out o_servicio uuid)
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_cod text; v_nom text; v_iva text; v_serv_nom text;
begin
  select case p_tipo when 'zapato' then 'ZAPATO' when 'plantilla' then 'PLANTILLA' when 'aditamento' then 'ADITAMENTO' else 'OTRO' end,
         case p_tipo when 'zapato' then 'Zapato especial a la medida' when 'plantilla' then 'Plantilla ortopédica especial' when 'aditamento' then 'Aditamento especial a la medida' else 'Producto especial a la medida' end,
         case p_tipo when 'plantilla' then 'exento' else '16' end
    into v_cod, v_nom, v_iva;
  select id into o_producto from piefirme.productos where organizacion_id = p_org and sku = 'PEDESP-' || v_cod;
  if o_producto is null then
    o_producto := gen_random_uuid();
    insert into piefirme.productos (id, organizacion_id, sku, nombre, categoria, tipo, iva_tipo, estado)
    values (o_producto, p_org, 'PEDESP-' || v_cod, 'Pedido especial · ' || v_nom, 'Pedidos especiales', 'por_encargo', v_iva, 'activo');
  end if;
  select id into o_servicio from piefirme.servicios where organizacion_id = p_org and codigo = 'PEDESP-' || v_cod;
  if o_servicio is null and p_tipo = 'plantilla' then
    select id into o_servicio from piefirme.servicios where organizacion_id = p_org and admite_caracteristicas and nombre = 'Plantilla ortopédica a la medida' limit 1;
  end if;
  if o_servicio is null then
    o_servicio := gen_random_uuid();
    insert into piefirme.servicios (id, organizacion_id, codigo, nombre, categoria, tipo_precio, iva_tipo, admite_caracteristicas, estado, visible_portal)
    values (o_servicio, p_org, 'PEDESP-' || v_cod, v_nom, 'Pedidos especiales', 'a_valorar', v_iva, true, 'activo', false);
  end if;
end $$;

-- Carga y bloquea un pedido comprobando organización y sede del usuario.
create or replace function piefirme_app.pedido_cargar(p_pedido uuid) returns piefirme.pedidos_especiales
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  select * into p from piefirme.pedidos_especiales where id = p_pedido for update;
  if not found or p.organizacion_id is distinct from piefirme_app.org_id() then raise exception 'pedido inexistente' using errcode = 'PF404'; end if;
  if not piefirme_app.puede_sede(p.sede_id) then raise exception 'el pedido es de otra sucursal' using errcode = '42501'; end if;
  if not piefirme_app.org_activa() then raise exception 'la clínica está en solo lectura' using errcode = '42501'; end if;
  perform set_config('app.pedido_rpc', 'on', true);
  return p;
end $$;

-- Cuenta por cobrar del saldo (fecha límite = plazo del saldo). Una por pedido.
create or replace function piefirme_app.pedido_abrir_cxc(p_pedido uuid) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; v_id uuid;
begin
  select * into p from piefirme.pedidos_especiales where id = p_pedido;
  if p.cuenta_cobrar_id is not null or p.saldo <= 0 then return; end if;
  v_id := gen_random_uuid();
  insert into piefirme.cuentas_por_cobrar (id, organizacion_id, sede_id, paciente_id, origen_tipo, concepto, clasificacion, importe, fecha_emision, fecha_limite, creado_por)
  values (v_id, p.organizacion_id, p.sede_id, p.paciente_id, 'otro', 'Saldo del pedido ' || p.folio, 'producto', p.saldo, piefirme_app.hoy_org(p.organizacion_id), p.plazo_saldo, auth.uid());
  update piefirme.pedidos_especiales set cuenta_cobrar_id = v_id where id = p.id;
end $$;

-- Destino del anticipo cuando el pedido se detiene: «devolucion» (se reembolsa al cliente) o «saldo_favor» (queda a favor del cliente y se aplica a otra compra).
create or replace function piefirme_app.pedido_resolver_anticipo(p_pedido uuid, p_destino text, p_motivo text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  select * into p from piefirme.pedidos_especiales where id = p_pedido;
  if p.anticipo_id is not null then
    if p_destino = 'devolucion' then
      update piefirme.anticipos set estado = 'reembolsado', reembolso_monto = monto, nota = coalesce(nota || ' · ', '') || 'Devolución por pedido detenido: ' || p_motivo
       where id = p.anticipo_id and estado = 'pagado';
    end if;   -- saldo_favor: el anticipo sigue «pagado» y el cliente puede aplicarlo en Caja
  end if;
  if p.cuenta_cobrar_id is not null then
    update piefirme.cuentas_por_cobrar set estado = 'cancelada', cancelada_motivo = 'Pedido ' || p.folio || ' detenido: ' || p_motivo where id = p.cuenta_cobrar_id and cobrado = 0 and estado <> 'cancelada';
  end if;
end $$;

-- Cancela la orden de compra ligada (si todavía no se recibió nada).
create or replace function piefirme_app.pedido_cancelar_oc(p_pedido uuid, p_motivo text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_oc uuid; v_estado text;
begin
  select oc_id into v_oc from piefirme.pedidos_especiales where id = p_pedido;
  if v_oc is null then return; end if;
  select estado into v_estado from piefirme.ordenes_compra where id = v_oc;
  if v_estado in ('borrador', 'enviada') then
    update piefirme.ordenes_compra set estado = 'cancelada', cancelada_motivo = p_motivo where id = v_oc;
  end if;
  update piefirme.pedido_especial_lineas set oc_linea_id = null where pedido_id = p_pedido;
  update piefirme.pedidos_especiales set oc_id = null where id = p_pedido;
end $$;

-- Texto de la petición al proveedor: producto, características, cantidad, cliente SOLO por iniciales y referencia, fecha requerida y sucursal. Sin costos.
create or replace function piefirme_app.pedido_mensaje_texto(p_pedido uuid) returns text
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; n piefirme.pedido_notas%rowtype; pa piefirme.pacientes%rowtype; s piefirme.sedes%rowtype; l record; v_ini text; v_t text; v_i int := 0; v_car text;
begin
  select * into p from piefirme.pedidos_especiales where id = p_pedido;
  select * into n from piefirme.pedido_notas where id = p.nota_id;
  select * into pa from piefirme.pacientes where id = p.paciente_id;
  select * into s from piefirme.sedes where id = p.sede_id;
  v_ini := array_to_string(array(select upper(left(x, 1)) || '.' from unnest(array[pa.nombre, pa.apellido_paterno, pa.apellido_materno]) x where coalesce(btrim(x), '') <> ''), '');
  v_t := 'Pedido especial ' || p.folio || E'\n' ||
         'Nota del cliente: ' || n.folio || ' (cliente ' || coalesce(nullif(v_ini, ''), 's/i') || ')' || E'\n' ||
         'Entrega en sucursal: ' || s.nombre || E'\n' ||
         'Fecha requerida: ' || to_char(p.fecha_prometida, 'DD/MM/YYYY') || E'\n\nPartidas:';
  for l in select * from piefirme.pedido_especial_lineas where pedido_id = p.id order by orden loop
    v_i := v_i + 1;
    select string_agg(c ->> 'frase', '; ') into v_car from jsonb_array_elements(l.caracteristicas) c;
    v_t := v_t || E'\n' || v_i || '. ' || regexp_replace(l.cantidad::text, '[.]?0+$', '') || ' × ' || l.descripcion || ' [' || l.tipo_item || ']'
                || case when v_car is not null then E'\n   Características: ' || v_car else '' end;
  end loop;
  return v_t || E'\n\nFavor de confirmar si lo aceptan, la fecha de entrega y la guía o referencia del envío.';
end $$;

-- ───────────────────────────── 1 · solicitar (nota + un pedido por proveedor) ─────────────────────────────
create or replace function piefirme.pedido_crear(p_sede uuid, p_paciente uuid, p_lineas jsonb, p_fecha_prometida date, p_plazo_saldo date,
                                                 p_nota text default null, p_anticipo_pct numeric default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); v_rol text := piefirme_app.rol()::text; v_hoy date; v_nota uuid := gen_random_uuid(); v_folio text;
  g record; l jsonb; v_prov piefirme.proveedores%rowtype; v_ped uuid; v_pct numeric; v_tot numeric; v_ant numeric; v_ord int; v_it record; v_lin uuid; v_costo numeric;
  v_res jsonb := '[]'::jsonb; v_tn numeric := 0; v_an numeric := 0; v_tipo text; v_cars jsonb; v_fp text;
begin
  if v_org is null or v_rol not in ('administrador', 'recepcion', 'podologo') then raise exception 'sin permiso para solicitar pedidos' using errcode = '42501'; end if;
  if not piefirme_app.org_activa() then raise exception 'la clínica está en solo lectura' using errcode = '42501'; end if;
  if not exists (select 1 from piefirme.sedes where id = p_sede and organizacion_id = v_org) or not piefirme_app.puede_sede(p_sede) then raise exception 'sucursal no permitida' using errcode = '42501'; end if;
  if not exists (select 1 from piefirme.pacientes where id = p_paciente and organizacion_id = v_org) then raise exception 'cliente inexistente' using errcode = 'PF404'; end if;
  v_hoy := piefirme_app.hoy_org(v_org);
  if p_fecha_prometida is null or p_fecha_prometida < v_hoy then raise exception 'la fecha prometida de entrega no puede estar en el pasado' using errcode = '22023'; end if;
  if p_plazo_saldo is null or p_plazo_saldo < v_hoy then raise exception 'el plazo para pagar el saldo no puede estar en el pasado' using errcode = '22023'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'el pedido no tiene partidas' using errcode = '22023'; end if;
  if p_anticipo_pct is not null and (p_anticipo_pct < 0 or p_anticipo_pct > 100) then raise exception 'el porcentaje de anticipo va de 0 a 100' using errcode = '22023'; end if;
  perform set_config('app.pedido_rpc', 'on', true);
  insert into piefirme.pedido_notas (id, organizacion_id, sede_id, paciente_id, fecha_prometida, plazo_saldo, nota, creado_por)
  values (v_nota, v_org, p_sede, p_paciente, p_fecha_prometida, p_plazo_saldo, nullif(btrim(p_nota), ''), auth.uid()) returning folio into v_folio;
  for g in select distinct (x ->> 'proveedor_id')::uuid as pid from jsonb_array_elements(p_lineas) x loop
    select * into v_prov from piefirme.proveedores where id = g.pid and organizacion_id = v_org and activo;
    if not found then raise exception 'proveedor inexistente o dado de baja' using errcode = 'PF404'; end if;
    v_pct := coalesce(case when v_rol = 'administrador' then p_anticipo_pct end, v_prov.anticipo_pct, piefirme_app.param_num(v_org, 'pedido_anticipo_pct', 50));
    v_ped := gen_random_uuid();
    insert into piefirme.pedidos_especiales (id, organizacion_id, sede_id, nota_id, paciente_id, proveedor_id, anticipo_pct, fecha_prometida, plazo_saldo, solicitado_por)
    values (v_ped, v_org, p_sede, v_nota, p_paciente, g.pid, v_pct, p_fecha_prometida, p_plazo_saldo, auth.uid());
    v_ord := 0; v_tot := 0;
    for l in select x from jsonb_array_elements(p_lineas) x where (x ->> 'proveedor_id')::uuid = g.pid loop
      v_tipo := coalesce(l ->> 'tipo_item', 'otro');
      if v_tipo not in ('zapato', 'plantilla', 'aditamento', 'otro') then raise exception 'tipo de producto inválido (%)', v_tipo using errcode = '22023'; end if;
      if coalesce(btrim(l ->> 'descripcion'), '') = '' then raise exception 'cada partida lleva descripción' using errcode = '22023'; end if;
      if coalesce((l ->> 'cantidad')::numeric, 0) <= 0 or coalesce((l ->> 'precio_unitario')::numeric, 0) <= 0 then raise exception 'cantidad y precio de venta deben ser mayores a cero' using errcode = '22023'; end if;
      v_cars := case when jsonb_typeof(l -> 'caracteristicas') = 'array' then l -> 'caracteristicas' else '[]'::jsonb end;
      select * into v_it from piefirme_app.pedido_item_base(v_org, v_tipo);
      v_ord := v_ord + 1; v_lin := gen_random_uuid();
      insert into piefirme.pedido_especial_lineas (id, organizacion_id, sede_id, pedido_id, orden, tipo_item, producto_id, servicio_id, descripcion, caracteristicas, cantidad, precio_unitario)
      values (v_lin, v_org, p_sede, v_ped, v_ord, v_tipo, v_it.o_producto, v_it.o_servicio, btrim(l ->> 'descripcion'), v_cars, (l ->> 'cantidad')::numeric, (l ->> 'precio_unitario')::numeric);
      v_costo := coalesce((l ->> 'costo_estimado')::numeric, 0);
      if v_costo > 0 and v_rol = 'administrador' then
        insert into piefirme.pedido_especial_costos (linea_id, organizacion_id, sede_id, pedido_id, costo_unitario, capturado_por) values (v_lin, v_org, p_sede, v_ped, v_costo, auth.uid());
      end if;
      v_tot := v_tot + round((l ->> 'cantidad')::numeric * (l ->> 'precio_unitario')::numeric, 2);
    end loop;
    v_ant := round(v_tot * v_pct / 100, 2);
    update piefirme.pedidos_especiales set total = v_tot, anticipo_monto = v_ant where id = v_ped;
    if v_ant = 0 then   -- sin anticipo: no hay nada que cobrar, el pedido pasa directo a la autorización
      perform set_config('app.pedido_motivo', 'Sin anticipo (0 %)', true);
      update piefirme.pedidos_especiales set estado = 'anticipo_cobrado', anticipo_cobrado_en = now() where id = v_ped;
      perform set_config('app.pedido_motivo', '', true);
      perform piefirme_app.pedido_abrir_cxc(v_ped);
    end if;
    select folio into v_fp from piefirme.pedidos_especiales where id = v_ped;
    v_res := v_res || jsonb_build_object('id', v_ped, 'folio', v_fp, 'proveedor_id', g.pid, 'total', v_tot, 'anticipo', v_ant, 'saldo', v_tot - v_ant);
    v_tn := v_tn + v_tot; v_an := v_an + v_ant;
  end loop;
  update piefirme.pedido_notas set total = v_tn, anticipo_total = v_an where id = v_nota;
  return jsonb_build_object('nota_id', v_nota, 'folio', v_folio, 'total', v_tn, 'anticipo', v_an, 'saldo', v_tn - v_an, 'pedidos', v_res);
end $$;

-- ───────────────────────────── 2 · cobrar el anticipo en Caja ─────────────────────────────
create or replace function piefirme.pedido_cobrar_anticipo(p_nota uuid, p_metodo text, p_referencia text default null, p_efectivo_recibido numeric default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare n piefirme.pedido_notas%rowtype; t piefirme.turnos_caja%rowtype; p record; v_ant uuid; v_tot numeric := 0; v_n int := 0; v_ids jsonb := '[]'::jsonb;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'siempre cobra caja (P-078)' using errcode = 'PF403'; end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia', 'clip') then raise exception 'método de pago inválido' using errcode = '22023'; end if;
  select * into n from piefirme.pedido_notas where id = p_nota for update;
  if not found or n.organizacion_id is distinct from piefirme_app.org_id() then raise exception 'nota inexistente' using errcode = 'PF404'; end if;
  if not piefirme_app.puede_sede(n.sede_id) then raise exception 'la nota es de otra sucursal' using errcode = '42501'; end if;
  if not piefirme_app.org_activa() then raise exception 'la clínica está en solo lectura' using errcode = '42501'; end if;
  select * into t from piefirme.turnos_caja where sede_id = n.sede_id and cajero_id = auth.uid() and estado = 'abierto';
  if not found then raise exception 'abra su turno de caja en esta sede' using errcode = 'PF409'; end if;
  select coalesce(sum(anticipo_monto), 0) into v_tot from piefirme.pedidos_especiales where nota_id = p_nota and estado = 'solicitado' and anticipo_id is null and anticipo_monto > 0;
  if v_tot <= 0 then raise exception 'la nota no tiene anticipo pendiente de cobro' using errcode = 'PF409'; end if;
  if p_metodo = 'efectivo' and p_efectivo_recibido is not null and p_efectivo_recibido < v_tot then raise exception 'el efectivo recibido no cubre el anticipo' using errcode = 'PF409'; end if;
  perform set_config('app.pedido_rpc', 'on', true);
  for p in select * from piefirme.pedidos_especiales where nota_id = p_nota and estado = 'solicitado' and anticipo_id is null and anticipo_monto > 0 order by folio loop
    v_ant := gen_random_uuid();
    insert into piefirme.anticipos (id, organizacion_id, sede_id, paciente_id, origen, monto, metodo, estado, pagado_en, referencia, pedido_especial_id, turno_id, created_by, nota)
    values (v_ant, p.organizacion_id, p.sede_id, p.paciente_id, 'mostrador', p.anticipo_monto, p_metodo, 'pagado', now(), nullif(btrim(p_referencia), ''), p.id, t.id, auth.uid(),
            'Anticipo del pedido ' || p.folio || ' (nota ' || n.folio || ')');
    perform set_config('app.pedido_motivo', 'Anticipo cobrado en Caja (' || p_metodo || ')', true);
    update piefirme.pedidos_especiales set estado = 'anticipo_cobrado', anticipo_id = v_ant, anticipo_cobrado_en = now() where id = p.id;
    perform set_config('app.pedido_motivo', '', true);
    perform piefirme_app.pedido_abrir_cxc(p.id);
    v_n := v_n + 1; v_ids := v_ids || to_jsonb(v_ant);
  end loop;
  if p_metodo = 'efectivo' then   -- el efectivo entra al cajón del turno: queda en el corte como depósito
    insert into piefirme.movimientos_caja (organizacion_id, sede_id, turno_id, tipo, monto, concepto, created_by)
    values (n.organizacion_id, n.sede_id, t.id, 'deposito', v_tot, 'Anticipo de pedidos · nota ' || n.folio, auth.uid());
  end if;
  return jsonb_build_object('nota', n.folio, 'monto', v_tot, 'anticipos', v_ids, 'pedidos', v_n,
                            'cambio', case when p_metodo = 'efectivo' and p_efectivo_recibido is not null then p_efectivo_recibido - v_tot end);
end $$;

-- ───────────────────────────── 3 · autorización del propietario ─────────────────────────────
-- Solo administración autoriza. Quien solicita no autoriza el pedido de otro; un administrador (propietario) sí puede autorizar el que él mismo solicitó.
create or replace function piefirme.pedido_autorizar(p_pedido uuid, p_costos jsonb default null)
returns uuid language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; pv piefirme.proveedores%rowtype; c jsonb; lr record; v_oc uuid := gen_random_uuid(); v_ol uuid; v_falta int;
begin
  if not piefirme_app.es_admin() then raise exception 'solo el propietario (administración) autoriza pedidos' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado <> 'anticipo_cobrado' then raise exception 'solo se autoriza un pedido con anticipo cobrado (está %)', p.estado using errcode = 'PF409'; end if;
  if p_costos is not null then
    for c in select x from jsonb_array_elements(p_costos) x loop
      if coalesce((c ->> 'costo')::numeric, 0) <= 0 then raise exception 'el costo estimado debe ser mayor a cero' using errcode = '22023'; end if;
      insert into piefirme.pedido_especial_costos (linea_id, organizacion_id, sede_id, pedido_id, costo_unitario, capturado_por)
      select l2.id, l2.organizacion_id, l2.sede_id, l2.pedido_id, (c ->> 'costo')::numeric, auth.uid() from piefirme.pedido_especial_lineas l2 where l2.id = (c ->> 'linea_id')::uuid and l2.pedido_id = p.id
      on conflict (linea_id) do update set costo_unitario = excluded.costo_unitario, capturado_por = excluded.capturado_por, updated_at = now();
    end loop;
  end if;
  select count(*) into v_falta from piefirme.pedido_especial_lineas l left join piefirme.pedido_especial_costos k on k.linea_id = l.id where l.pedido_id = p.id and k.linea_id is null;
  if v_falta > 0 then raise exception 'captura el costo estimado de las % partida(s) sin costo antes de autorizar', v_falta using errcode = 'PF409'; end if;
  select * into pv from piefirme.proveedores where id = p.proveedor_id;
  -- la orden de compra del proveedor (la misma de Compras): nace en borrador y queda autorizada por el propietario
  insert into piefirme.ordenes_compra (id, organizacion_id, sede_id, proveedor_id, fecha, entrega_esperada, condiciones_pago, dias_credito, solicita_id, notas)
  values (v_oc, p.organizacion_id, p.sede_id, p.proveedor_id, piefirme_app.hoy_org(p.organizacion_id), p.fecha_prometida, pv.condiciones_pago, pv.dias_credito, p.solicitado_por,
          'Pedido especial ' || p.folio);
  for lr in select l2.*, k.costo_unitario as costo from piefirme.pedido_especial_lineas l2 join piefirme.pedido_especial_costos k on k.linea_id = l2.id where l2.pedido_id = p.id order by l2.orden loop
    v_ol := gen_random_uuid();
    insert into piefirme.oc_lineas (id, organizacion_id, sede_id, oc_id, producto_id, descripcion, cantidad, costo_unitario)
    values (v_ol, lr.organizacion_id, lr.sede_id, v_oc, lr.producto_id, lr.descripcion, lr.cantidad, lr.costo);
    update piefirme.pedido_especial_lineas set oc_linea_id = v_ol where id = lr.id;
  end loop;
  update piefirme.ordenes_compra set autorizada_por = auth.uid() where id = v_oc;
  perform set_config('app.pedido_motivo', 'Autorizado por el propietario', true);
  update piefirme.pedidos_especiales set estado = 'autorizado', autorizado_por = auth.uid(), autorizado_en = now(), oc_id = v_oc where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
  return v_oc;
end $$;

-- Captura o corrige costos estimados antes de autorizar (solo administración).
create or replace function piefirme.pedido_actualizar_costos(p_pedido uuid, p_costos jsonb)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; c jsonb;
begin
  if not piefirme_app.es_admin() then raise exception 'los costos solo los captura administración' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado not in ('solicitado', 'anticipo_cobrado') then raise exception 'el costo ya no se cambia aquí: el pedido está %', p.estado using errcode = 'PF409'; end if;
  for c in select x from jsonb_array_elements(p_costos) x loop
    if coalesce((c ->> 'costo')::numeric, 0) <= 0 then raise exception 'el costo estimado debe ser mayor a cero' using errcode = '22023'; end if;
    insert into piefirme.pedido_especial_costos (linea_id, organizacion_id, sede_id, pedido_id, costo_unitario, capturado_por)
    select l.id, l.organizacion_id, l.sede_id, l.pedido_id, (c ->> 'costo')::numeric, auth.uid() from piefirme.pedido_especial_lineas l where l.id = (c ->> 'linea_id')::uuid and l.pedido_id = p.id
    on conflict (linea_id) do update set costo_unitario = excluded.costo_unitario, capturado_por = excluded.capturado_por, updated_at = now();
  end loop;
  insert into piefirme.pedido_especial_bitacora (organizacion_id, sede_id, pedido_id, accion, detalle) values (p.organizacion_id, p.sede_id, p.id, 'costos', jsonb_build_object('partidas', jsonb_array_length(p_costos)));
end $$;

-- ───────────────────────────── 4 · detener: rechazo del propietario / del proveedor, reanudar y cancelar ─────────────────────────────
create or replace function piefirme_app.pedido_poner_espera(p_pedido uuid, p_origen text, p_motivo text, p_destino text) returns void
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  p := piefirme_app.pedido_cargar(p_pedido);
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'indica el motivo' using errcode = '22023'; end if;
  if p.anticipo_id is not null and coalesce(p_destino, '') not in ('devolucion', 'saldo_favor') then
    raise exception 'elige qué pasa con el anticipo: devolverlo al cliente o dejarlo como saldo a favor' using errcode = '22023';
  end if;
  perform piefirme_app.pedido_cancelar_oc(p.id, 'Pedido ' || p.folio || ' en espera: ' || p_motivo);
  perform piefirme_app.pedido_resolver_anticipo(p.id, p_destino, p_motivo);
  perform set_config('app.pedido_motivo', p_motivo, true);
  update piefirme.pedidos_especiales set estado = 'en_espera', espera_origen = p_origen, espera_motivo = btrim(p_motivo), destino_anticipo = p_destino,
         autorizado_por = null, autorizado_en = null, mensaje_enviado_en = null, aceptado_en = null, aceptado_por = null, fecha_acordada = null, guia_envio = null, fecha_estimada_llegada = null, transito_en = null
   where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
end $$;

create or replace function piefirme.pedido_rechazar(p_pedido uuid, p_motivo text, p_destino text)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  if not piefirme_app.es_admin() then raise exception 'solo el propietario (administración) rechaza pedidos' using errcode = '42501'; end if;
  select * into p from piefirme.pedidos_especiales where id = p_pedido;
  if p.estado is distinct from 'anticipo_cobrado' then raise exception 'solo se rechaza un pedido por autorizar (está %)', p.estado using errcode = 'PF409'; end if;
  perform piefirme_app.pedido_poner_espera(p_pedido, 'propietario', p_motivo, p_destino);
end $$;

create or replace function piefirme.pedido_proveedor_rechaza(p_pedido uuid, p_motivo text, p_destino text)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = '42501'; end if;
  select * into p from piefirme.pedidos_especiales where id = p_pedido;
  if p.estado is distinct from 'enviado_proveedor' then raise exception 'el proveedor solo rechaza un pedido ya enviado (está %)', p.estado using errcode = 'PF409'; end if;
  perform piefirme_app.pedido_poner_espera(p_pedido, 'proveedor', p_motivo, p_destino);
end $$;

-- Reanudar un pedido en espera: con «saldo a favor» vuelve a autorización (el anticipo sigue en su poder); con devolución vuelve a solicitado y se cobra otro anticipo.
create or replace function piefirme.pedido_reanudar(p_pedido uuid, p_proveedor uuid default null)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; v_nuevo text;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado <> 'en_espera' then raise exception 'solo se reanuda un pedido en espera' using errcode = 'PF409'; end if;
  if p_proveedor is not null then
    if not exists (select 1 from piefirme.proveedores where id = p_proveedor and organizacion_id = p.organizacion_id and activo) then raise exception 'proveedor inexistente o dado de baja' using errcode = 'PF404'; end if;
  end if;
  v_nuevo := case when p.destino_anticipo = 'saldo_favor' and p.anticipo_id is not null then 'anticipo_cobrado' else 'solicitado' end;
  perform set_config('app.pedido_motivo', 'Reanudado tras «' || coalesce(p.espera_motivo, '') || '»', true);
  update piefirme.pedidos_especiales set estado = v_nuevo, proveedor_id = coalesce(p_proveedor, proveedor_id), espera_origen = null, espera_motivo = null, destino_anticipo = null, espera_en = null,
         cuenta_cobrar_id = null,
         anticipo_id = case when v_nuevo = 'solicitado' then null else anticipo_id end,
         anticipo_cobrado_en = case when v_nuevo = 'solicitado' then null else anticipo_cobrado_en end
   where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
  if v_nuevo = 'anticipo_cobrado' then perform piefirme_app.pedido_abrir_cxc(p.id); end if;
end $$;

create or replace function piefirme.pedido_cancelar(p_pedido uuid, p_motivo text, p_destino text default null)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; v_admin boolean := piefirme_app.es_admin();
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion', 'podologo') then raise exception 'sin permiso' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'indica el motivo de la cancelación' using errcode = '22023'; end if;
  if p.estado in ('recibido', 'entregado', 'cancelado') then raise exception 'un pedido % no se cancela desde aquí', p.estado using errcode = 'PF409'; end if;
  if not v_admin and not (p.estado = 'solicitado' and p.solicitado_por = auth.uid()) then
    raise exception 'solo el propietario cancela un pedido ya cobrado o en proceso' using errcode = '42501';
  end if;
  if p.anticipo_id is not null and p.destino_anticipo is null and coalesce(p_destino, '') not in ('devolucion', 'saldo_favor') then
    raise exception 'elige qué pasa con el anticipo: devolverlo al cliente o dejarlo como saldo a favor' using errcode = '22023';
  end if;
  perform piefirme_app.pedido_cancelar_oc(p.id, 'Pedido ' || p.folio || ' cancelado: ' || p_motivo);
  if p.destino_anticipo is null then perform piefirme_app.pedido_resolver_anticipo(p.id, p_destino, p_motivo); end if;
  perform set_config('app.pedido_motivo', p_motivo, true);
  update piefirme.pedidos_especiales set estado = 'cancelado', cancelado_motivo = btrim(p_motivo), destino_anticipo = coalesce(destino_anticipo, p_destino) where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
end $$;

-- ───────────────────────────── 5 · petición al proveedor, aceptación y envío ─────────────────────────────
create or replace function piefirme.pedido_mensaje(p_pedido uuid) returns text
language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  select * into p from piefirme.pedidos_especiales where id = p_pedido;
  if not found or p.organizacion_id is distinct from piefirme_app.org_id() or not piefirme_app.puede_sede(p.sede_id) then raise exception 'pedido inexistente' using errcode = 'PF404'; end if;
  return piefirme_app.pedido_mensaje_texto(p_pedido);
end $$;

create or replace function piefirme.pedido_enviar(p_pedido uuid, p_canal text default 'whatsapp_simulado', p_texto text default null)
returns uuid language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; pv piefirme.proveedores%rowtype; v_id uuid := gen_random_uuid(); v_texto text;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso para enviar pedidos al proveedor' using errcode = '42501'; end if;
  if p_canal not in ('whatsapp_simulado', 'copiado_manual') then raise exception 'canal inválido' using errcode = '22023'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado <> 'autorizado' then raise exception 'solo se envía un pedido autorizado por el propietario (está %)', p.estado using errcode = 'PF409'; end if;
  select * into pv from piefirme.proveedores where id = p.proveedor_id;
  v_texto := coalesce(nullif(btrim(p_texto), ''), piefirme_app.pedido_mensaje_texto(p.id));
  insert into piefirme.pedido_mensajes (id, organizacion_id, sede_id, pedido_id, proveedor_id, canal, destino, texto, enviado_por)
  values (v_id, p.organizacion_id, p.sede_id, p.id, p.proveedor_id, p_canal, coalesce(pv.whatsapp_grupo, pv.whatsapp_contacto, pv.telefono), v_texto, auth.uid());
  update piefirme.ordenes_compra set estado = 'enviada' where id = p.oc_id and estado = 'borrador';
  perform set_config('app.pedido_motivo', 'Petición enviada al proveedor (' || p_canal || ')', true);
  update piefirme.pedidos_especiales set estado = 'enviado_proveedor', mensaje_enviado_en = now() where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
  return v_id;
end $$;

create or replace function piefirme.pedido_registrar_aceptacion(p_pedido uuid, p_fecha_acordada date, p_respuesta text default null)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado <> 'enviado_proveedor' then raise exception 'el proveedor solo acepta un pedido enviado (está %)', p.estado using errcode = 'PF409'; end if;
  if p_fecha_acordada is null or p_fecha_acordada < piefirme_app.hoy_org(p.organizacion_id) then raise exception 'la fecha acordada con el proveedor no puede estar en el pasado' using errcode = '22023'; end if;
  update piefirme.ordenes_compra set entrega_esperada = p_fecha_acordada where id = p.oc_id;
  perform set_config('app.pedido_motivo', coalesce(nullif(btrim(p_respuesta), ''), 'Aceptado por el proveedor'), true);
  update piefirme.pedidos_especiales set estado = 'aceptado', aceptado_en = now(), aceptado_por = auth.uid(), fecha_acordada = p_fecha_acordada, respuesta_proveedor = nullif(btrim(p_respuesta), '') where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
end $$;

create or replace function piefirme.pedido_registrar_transito(p_pedido uuid, p_guia text, p_fecha_estimada date default null)
returns void language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado <> 'aceptado' then raise exception 'solo se registra el envío de un pedido aceptado (está %)', p.estado using errcode = 'PF409'; end if;
  if coalesce(btrim(p_guia), '') = '' then raise exception 'captura la guía o referencia del envío' using errcode = '22023'; end if;
  perform set_config('app.pedido_motivo', 'En tránsito · ' || btrim(p_guia), true);
  update piefirme.pedidos_especiales set estado = 'en_transito', guia_envio = btrim(p_guia), fecha_estimada_llegada = p_fecha_estimada, transito_en = now() where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
end $$;

-- ───────────────────────────── 6 · recepción (usa la recepción de mercancía y abre la cuenta por pagar) ─────────────────────────────
-- p_factura (opcional): {numero, importe, vencimiento, url, cfdi_uuid, nota}. Sin factura, la cuenta por pagar nace igual con el importe de la orden y el
-- vencimiento según las condiciones de pago del proveedor; la factura se asienta después sobre esa cuenta.
create or replace function piefirme.pedido_recibir(p_pedido uuid, p_factura jsonb default null, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; o piefirme.ordenes_compra%rowtype; v_rec uuid; v_cxp uuid; v_lineas jsonb; v_hoy date; v_factura jsonb;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'solo quien opera la sucursal marca la recepción' using errcode = '42501'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado not in ('aceptado', 'en_transito') then raise exception 'solo se recibe un pedido aceptado o en tránsito (está %)', p.estado using errcode = 'PF409'; end if;
  select * into o from piefirme.ordenes_compra where id = p.oc_id;
  if o.estado not in ('enviada', 'recibida_parcial') then raise exception 'la orden de compra está % y no admite recepción', o.estado using errcode = 'PF409'; end if;
  v_hoy := piefirme_app.hoy_org(p.organizacion_id);
  select jsonb_agg(jsonb_build_object('oc_linea_id', oc_linea_id, 'cantidad_recibida', cantidad)) into v_lineas from piefirme.pedido_especial_lineas where pedido_id = p.id;
  v_factura := coalesce(p_factura, '{}'::jsonb) || jsonb_build_object('nota', coalesce(p_nota, 'Pedido especial ' || p.folio));
  v_rec := piefirme.recepcion_registrar(o.id, v_lineas, v_factura);
  select cuenta_por_pagar_id into v_cxp from piefirme.recepciones where id = v_rec;
  if v_cxp is null then   -- sin factura: la deuda con el proveedor se abre igual, con su vencimiento según condiciones de pago
    select * into o from piefirme.ordenes_compra where id = o.id;
    v_cxp := gen_random_uuid();
    insert into piefirme.cuentas_por_pagar (id, organizacion_id, sede_id, proveedor_id, concepto, fecha_emision, fecha_vencimiento, importe, iva, oc_id, recepcion_id, creado_por)
    values (v_cxp, o.organizacion_id, o.sede_id, o.proveedor_id, 'Pedido especial ' || p.folio || ' · compra ' || o.folio, v_hoy, v_hoy + o.dias_credito, o.total, least(o.iva, o.total), o.id, v_rec, auth.uid());
    update piefirme.recepciones set cuenta_por_pagar_id = v_cxp where id = v_rec;
  end if;
  perform set_config('app.pedido_motivo', 'Recibido en la sucursal', true);
  update piefirme.pedidos_especiales set estado = 'recibido', recepcion_id = v_rec, cuenta_pagar_id = v_cxp, recibido_en = now(), recibido_por = auth.uid() where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
  return jsonb_build_object('recepcion_id', v_rec, 'cuenta_pagar_id', v_cxp);
end $$;

-- ───────────────────────────── 7 · entrega y cobro del saldo (ticket normal de Caja) ─────────────────────────────
-- p_pagos: [{metodo: efectivo|tarjeta|transferencia|clip, monto, referencia?, ultimos4?, efectivo_recibido?}] que suman EXACTO el saldo (vacío si no hay saldo).
-- El anticipo entra al ticket como pago «anticipo». El precio de cada partida es el del pedido (autorizado por el propietario): se avala con una
-- autorización de precio del propietario que autorizó el pedido, igual que el precio cotizado de un producto especial en Caja.
create or replace function piefirme.pedido_entregar(p_pedido uuid, p_pagos jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare p piefirme.pedidos_especiales%rowtype; t piefirme.turnos_caja%rowtype; v uuid := gen_random_uuid(); l record; c jsonb; x jsonb; v_vl uuid; v_aut uuid := gen_random_uuid();
  v_suma numeric := 0; v_saldo numeric; v_i int := 0; v_j int; v_folio text; a piefirme.anticipos%rowtype;
begin
  if piefirme_app.rol()::text not in ('administrador', 'recepcion') then raise exception 'siempre cobra caja (P-078)' using errcode = 'PF403'; end if;
  p := piefirme_app.pedido_cargar(p_pedido);
  if p.estado <> 'recibido' then raise exception 'solo se entrega un pedido recibido en la sucursal (está %)', p.estado using errcode = 'PF409'; end if;
  select * into t from piefirme.turnos_caja where sede_id = p.sede_id and cajero_id = auth.uid() and estado = 'abierto';
  if not found then raise exception 'abra su turno de caja en esta sucursal' using errcode = 'PF409'; end if;
  v_saldo := p.total - p.anticipo_monto;
  if jsonb_typeof(coalesce(p_pagos, '[]'::jsonb)) <> 'array' then raise exception 'pagos inválidos' using errcode = '22023'; end if;
  for x in select e from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) e loop
    if coalesce(x ->> 'metodo', '') not in ('efectivo', 'tarjeta', 'transferencia', 'clip') then raise exception 'método de pago inválido' using errcode = '22023'; end if;
    if coalesce((x ->> 'monto')::numeric, 0) <= 0 then raise exception 'cada pago lleva un monto mayor a cero' using errcode = '22023'; end if;
    v_suma := v_suma + (x ->> 'monto')::numeric;
  end loop;
  if abs(v_suma - v_saldo) > 0.005 then raise exception 'el saldo del pedido es $% y los pagos suman $%', v_saldo, v_suma using errcode = 'PF409'; end if;
  if p.anticipo_monto > 0 then
    select * into a from piefirme.anticipos where id = p.anticipo_id for update;
    if not found or a.estado <> 'pagado' then raise exception 'el anticipo del pedido no está disponible' using errcode = 'PF409'; end if;
  end if;
  perform set_config('app.pedido_cobro', 'on', true);
  insert into piefirme.autorizaciones_admin (id, organizacion_id, tipo, solicitante_id, autorizador_id, motivo, detalle, vigente_hasta)
  values (v_aut, p.organizacion_id, 'otro', auth.uid(), p.autorizado_por, 'Precio del pedido especial ' || p.folio,
          jsonb_build_object('tipo_real', 'precio', 'pedido_id', p.id, 'folio', p.folio), now() + interval '10 minutes');
  insert into piefirme.ventas (id, organizacion_id, sede_id, origen, paciente_id, estado, created_by, nota)
  values (v, p.organizacion_id, p.sede_id, 'mostrador', p.paciente_id, 'por_cobrar', auth.uid(), 'Entrega del pedido especial ' || p.folio) returning folio into v_folio;
  for l in select * from piefirme.pedido_especial_lineas where pedido_id = p.id order by orden loop
    v_vl := gen_random_uuid();
    insert into piefirme.venta_lineas (id, organizacion_id, sede_id, venta_id, orden, tipo, servicio_id, descripcion, cantidad, precio_unitario, tipo_precio, autorizacion_precio_id)
    values (v_vl, p.organizacion_id, p.sede_id, v, v_i, 'servicio', l.servicio_id, l.descripcion, l.cantidad, l.precio_unitario, 'fijo', v_aut);
    v_j := 0;
    for c in select e from jsonb_array_elements(l.caracteristicas) e loop
      insert into piefirme.venta_linea_caracteristicas (organizacion_id, sede_id, venta_linea_id, caracteristica_id, grupo, nombre, frase, valor, unidad, efecto_precio, monto_unitario, importe, orden)
      values (p.organizacion_id, p.sede_id, v_vl, nullif(c ->> 'id', '')::uuid, coalesce(c ->> 'grupo', 'General'), coalesce(c ->> 'nombre', c ->> 'frase'), coalesce(c ->> 'frase', c ->> 'nombre'),
              nullif(c ->> 'valor', '')::numeric, nullif(c ->> 'unidad', ''), coalesce(nullif(c ->> 'efecto_precio', ''), 'ninguno'), coalesce((c ->> 'monto_unitario')::numeric, 0), coalesce((c ->> 'importe')::numeric, 0), v_j);
      v_j := v_j + 1;
    end loop;
    v_i := v_i + 1;
  end loop;
  if p.anticipo_monto > 0 then
    insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto, anticipo_id, created_by) values (p.organizacion_id, p.sede_id, v, 'anticipo', p.anticipo_monto, p.anticipo_id, auth.uid());
  end if;
  for x in select e from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) e loop
    insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto, referencia, ultimos4, efectivo_recibido, created_by)
    values (p.organizacion_id, p.sede_id, v, x ->> 'metodo', (x ->> 'monto')::numeric, nullif(btrim(x ->> 'referencia'), ''), nullif(x ->> 'ultimos4', ''), nullif(x ->> 'efectivo_recibido', '')::numeric, auth.uid());
  end loop;
  perform piefirme.cobrar_venta(v);
  -- la pieza sale del inventario de la sucursal (entró al recibir): kardex de venta ligado al pedido
  for l in select producto_id, sum(cantidad) as cant from piefirme.pedido_especial_lineas where pedido_id = p.id group by producto_id loop
    insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id, referencia_folio, usuario_id, fecha)
    values (p.organizacion_id, p.sede_id, l.producto_id, 'venta', -l.cant, 'pedido_especial', p.id, p.folio, auth.uid(), now());
  end loop;
  if p.cuenta_cobrar_id is not null then
    update piefirme.cuentas_por_cobrar set cobrado = importe, estado = 'cobrada', venta_id = v where id = p.cuenta_cobrar_id and estado <> 'cancelada';
  end if;
  perform set_config('app.pedido_motivo', 'Entregado al cliente · ticket ' || coalesce(v_folio, ''), true);
  update piefirme.pedidos_especiales set estado = 'entregado', venta_id = v, entregado_en = now(), entregado_por = auth.uid(), saldo_cobrado = v_saldo where id = p.id;
  perform set_config('app.pedido_motivo', '', true);
  return jsonb_build_object('venta_id', v, 'folio', v_folio, 'saldo_cobrado', v_saldo, 'anticipo_aplicado', p.anticipo_monto);
end $$;

-- ───────────────────────────── 8 · recordatorios de pedidos vencidos y lista de proveedores para el formulario ─────────────────────────────
-- Sin planificador: se invoca desde el botón de la pantalla (o desde un planificador futuro). Deja constancia a lo más una vez al día por pedido.
create or replace function piefirme.pedido_recordatorios_generar()
returns jsonb language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id(); r record; v_res jsonb := '[]'::jsonb; v_hoy date;
begin
  if v_org is null or piefirme_app.rol()::text not in ('administrador', 'recepcion', 'supervisor') then raise exception 'sin permiso' using errcode = '42501'; end if;
  v_hoy := piefirme_app.hoy_org(v_org);
  for r in
    select p.id, p.organizacion_id, p.sede_id, p.folio, p.estado, p.fecha_prometida, p.fecha_acordada, p.plazo_saldo,
           case when p.estado = 'recibido' then 'saldo_vencido' else 'entrega_vencida' end as tipo,
           v_hoy - case when p.estado = 'recibido' then p.plazo_saldo else coalesce(p.fecha_acordada, p.fecha_prometida) end as dias
      from piefirme.pedidos_especiales p
     where p.organizacion_id = v_org and piefirme_app.puede_sede(p.sede_id)
       and ((p.estado in ('autorizado', 'enviado_proveedor', 'aceptado', 'en_transito') and coalesce(p.fecha_acordada, p.fecha_prometida) < v_hoy)
         or (p.estado = 'recibido' and p.plazo_saldo < v_hoy))
     order by dias desc
  loop
    if not exists (select 1 from piefirme.pedido_especial_bitacora b where b.pedido_id = r.id and b.accion = 'recordatorio'
                    and piefirme_app.c_fecha_local(v_org, b.en) = v_hoy) then
      insert into piefirme.pedido_especial_bitacora (organizacion_id, sede_id, pedido_id, accion, estado_anterior, estado_nuevo, motivo, detalle)
      values (r.organizacion_id, r.sede_id, r.id, 'recordatorio', r.estado, r.estado,
              case r.tipo when 'saldo_vencido' then 'El saldo del cliente venció hace ' || r.dias || ' día(s)' else 'La entrega venció hace ' || r.dias || ' día(s)' end,
              jsonb_build_object('tipo', r.tipo, 'dias', r.dias));
    end if;
    v_res := v_res || jsonb_build_object('id', r.id, 'folio', r.folio, 'estado', r.estado, 'tipo', r.tipo, 'dias', r.dias);
  end loop;
  return v_res;
end $$;

-- Proveedores que se ofrecen al solicitar (id, nombre, tipos que surte, % de anticipo efectivo, si tienen grupo de WhatsApp). Sin RFC, bancos ni saldos.
create or replace function piefirme.pedido_proveedores()
returns jsonb language plpgsql stable security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.org_id();
begin
  if v_org is null or piefirme_app.rol()::text not in ('administrador', 'recepcion', 'podologo', 'supervisor') then raise exception 'sin permiso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'categoria', p.categoria, 'tipos', p.pedidos_tipos,
            'anticipo_pct', coalesce(p.anticipo_pct, piefirme_app.param_num(v_org, 'pedido_anticipo_pct', 50)), 'whatsapp', coalesce(p.whatsapp_grupo, p.whatsapp_contacto) is not null) order by p.nombre)
     from piefirme.proveedores p where p.organizacion_id = v_org and p.activo and not p.sintetico), '[]'::jsonb);
end $$;

-- ───────────────────────────── permisos de ejecución: solo usuarios con sesión ─────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'piefirme.pedido_crear(uuid,uuid,jsonb,date,date,text,numeric)', 'piefirme.pedido_cobrar_anticipo(uuid,text,text,numeric)', 'piefirme.pedido_autorizar(uuid,jsonb)',
    'piefirme.pedido_actualizar_costos(uuid,jsonb)', 'piefirme.pedido_rechazar(uuid,text,text)', 'piefirme.pedido_proveedor_rechaza(uuid,text,text)',
    'piefirme.pedido_reanudar(uuid,uuid)', 'piefirme.pedido_cancelar(uuid,text,text)', 'piefirme.pedido_mensaje(uuid)', 'piefirme.pedido_enviar(uuid,text,text)',
    'piefirme.pedido_registrar_aceptacion(uuid,date,text)', 'piefirme.pedido_registrar_transito(uuid,text,date)', 'piefirme.pedido_recibir(uuid,jsonb,text)',
    'piefirme.pedido_entregar(uuid,jsonb)', 'piefirme.pedido_recordatorios_generar()', 'piefirme.pedido_proveedores()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'piefirme_app.pedido_item_base(uuid,text)', 'piefirme_app.pedido_cargar(uuid)', 'piefirme_app.pedido_abrir_cxc(uuid)', 'piefirme_app.pedido_resolver_anticipo(uuid,text,text)',
    'piefirme_app.pedido_cancelar_oc(uuid,text)', 'piefirme_app.pedido_mensaje_texto(uuid)', 'piefirme_app.pedido_poner_espera(uuid,text,text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
