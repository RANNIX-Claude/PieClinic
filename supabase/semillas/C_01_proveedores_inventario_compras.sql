-- C_01 · Semilla SINTÉTICA (dominio C): proveedores, inventario por sede (mínimos/máximos, lotes y caducidades), compras de 4 meses con recepciones y cuentas por pagar,
-- traspasos, mermas y conteos físicos. Todo sintético (P-132): nada de RFC, CLABE ni teléfonos reales.
-- DEBE EXISTIR ANTES: migraciones 001-049 · organización 00000000-0000-0000-0000-00000000c0de con sus 5 sedes (CHA, CEN, GAL, PAT, SEN) y perfiles administrador
--   a0000000-0000-0000-0000-000000000001 y recepción a0000000-0000-0000-0000-000000000002 (B_00) · productos de B_01 (SKU PF-…) ·
--   idealmente las ventas/pagos de B_02 (las cantidades de compra se calculan para cubrir lo vendido; si no hay ventas, se compra solo el nivel objetivo).
-- Debe correrse con un rol que omita RLS (postgres / service_role); simula la sesión del administrador con request.jwt.claim.sub.
-- Idempotente de forma gruesa: si la clínica ya tiene órdenes de compra, no hace nada.
-- Fecha «hoy» de la semilla: 25-oct-2026.

do $$
declare
  o   constant uuid := '00000000-0000-0000-0000-00000000c0de';
  adm constant uuid := 'a0000000-0000-0000-0000-000000000001';
  rec constant uuid := 'a0000000-0000-0000-0000-000000000002';
  v_prov_derma uuid; v_prov_podo uuid; v_oc uuid; v_rec uuid; v_s record; v_per record; v_p record; n integer; v_qty numeric; v_costo numeric; v_cad date; v_lote text; v_ol uuid;
  v_total numeric; v_f date; v_folio text; v_sede_i integer; v_h integer;
begin
  if exists (select 1 from piefirme.ordenes_compra where organizacion_id = o) then
    raise notice 'C_01: la clínica ya tiene órdenes de compra; no se repite la semilla'; return;
  end if;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform set_config('app.ignorar_cierre', 'on', true);
  create temporary table tmp_costo_base on commit drop as select id, costo_promedio from piefirme.productos where organizacion_id = o;

  -- ───────── proveedores sintéticos (catálogo único de la clínica, P-082) ─────────
  insert into piefirme.proveedores (organizacion_id, clave, nombre, razon_social, rfc, categoria, es_laboratorio, telefono, email, contacto, condiciones_pago, dias_credito, dias_entrega, notas, sintetico)
  values
   (o, 'DERMA',   'DermaCare (sintético)',            'DermaCare Sintética SA de CV',    'SIN260101AA1', 'material_clinico',     false, '55 0000 0101', 'ventas@dermacare.sintetico.test', 'Contacto Sintético 1', 'Crédito 15 días', 15, '2 a 3 días', 'Cuidado en casa, antimicóticos y ortesis', true),
   (o, 'PODO',    'Podo Supply (sintético)',          'Podo Supply Sintética SA de CV',  'SIN260101AA2', 'insumos',              false, '55 0000 0102', 'pedidos@podosupply.sintetico.test', 'Contacto Sintético 2', 'Crédito 15 días', 15, '2 días', 'Guantes, fresas y desechables', true),
   (o, 'LABORT',  'Laboratorio Ortésico (sintético)', 'Laboratorio Ortésico Sintético',  'SIN260101AA3', 'plantillas_ortesis',   true,  '55 0000 0103', 'lab@ortesico.sintetico.test', 'Contacto Sintético 3', 'Contado', 0, '15 días hábiles', 'Fabricación de plantillas a medida; garantía 6 meses', true),
   (o, 'ESTERIL', 'EsterilMed (sintético)',           'EsterilMed Sintética SA de CV',   'SIN260101AA4', 'equipo_instrumental',  false, '55 0000 0104', 'ventas@esterilmed.sintetico.test', 'Contacto Sintético 4', 'Crédito 30 días', 30, '5 días', 'Autoclaves, instrumental y bolsas de esterilización', true),
   (o, 'MEDEQ',   'MedEquipo Servicio (sintético)',   'MedEquipo Servicio Sintético',    'SIN260101AA5', 'mantenimiento_equipo', false, '55 0000 0105', 'servicio@medequipo.sintetico.test', 'Contacto Sintético 5', 'Contado', 0, 'Agenda', 'Mantenimiento de autoclaves y equipo', true),
   (o, 'LIMPIA',  'Limpieza Total (sintético)',       'Limpieza Total Sintética',        'SIN260101AA6', 'operacion',            false, '55 0000 0106', 'hola@limpiatotal.sintetico.test', 'Contacto Sintético 6', 'Contado', 0, '1 día', 'Aseo y desinfección', true),
   (o, 'PAPEL',   'Papelería Central (sintético)',    'Papelería Central Sintética',     'SIN260101AA7', 'operacion',            false, '55 0000 0107', 'ventas@papeleria.sintetico.test', 'Contacto Sintético 7', 'Contado', 0, '1 día', 'Papelería y consumibles de oficina', true),
   (o, 'ENERGIA', 'Suministro de Energía (sintético)', 'Energía Sintética SA de CV',     'SIN260101AA8', 'operacion',            false, '55 0000 0108', 'cobranza@energia.sintetico.test', 'Contacto Sintético 8', 'Contado', 0, 'Mensual', 'Luz de las sedes', true),
   (o, 'TELECOM', 'Telecom Sintética',                'Telecom Sintética SA de CV',      'SIN260101AA9', 'operacion',            false, '55 0000 0109', 'cuentas@telecom.sintetico.test', 'Contacto Sintético 9', 'Contado', 0, 'Mensual', 'Internet y telefonía', true),
   (o, 'RENTAS',  'Inmobiliaria Plaza (sintético)',   'Inmobiliaria Plaza Sintética',    'SIN260101AB1', 'operacion',            false, '55 0000 0110', 'rentas@plaza.sintetico.test', 'Contacto Sintético 10', 'Contado', 0, 'Mensual', 'Arrendamiento de locales', true)
  on conflict (organizacion_id, clave) do nothing;
  select id into v_prov_derma from piefirme.proveedores where organizacion_id = o and clave = 'DERMA';
  select id into v_prov_podo from piefirme.proveedores where organizacion_id = o and clave = 'PODO';

  insert into piefirme.proveedores_bancarios (organizacion_id, proveedor_id, banco, titular, clabe)
  select o, p.id, 'Banco Sintético', p.razon_social, '0000000000000000' || lpad((row_number() over (order by p.clave))::text, 2, '0')
    from piefirme.proveedores p where p.organizacion_id = o and p.clave in ('DERMA', 'PODO', 'ESTERIL', 'MEDEQ')
  on conflict (proveedor_id) do nothing;

  -- ───────── inventario por sede: mínimos y máximos (los captura Administración, P-084) ─────────
  insert into piefirme.inventario_sede (organizacion_id, sede_id, producto_id, minimo, maximo, ubicacion)
  select o, s.id, pr.id, case when pr.tipo = 'venta' then 5 else 3 end, case when pr.tipo = 'venta' then 20 else 12 end,
         case when pr.tipo = 'venta' then 'Mostrador' else 'Bodega clínica' end
    from piefirme.sedes s cross join piefirme.productos pr
   where s.organizacion_id = o and pr.organizacion_id = o and pr.tipo in ('venta', 'insumo_clinico')
  on conflict (sede_id, producto_id) do update set minimo = excluded.minimo, maximo = excluded.maximo, ubicacion = excluded.ubicacion;   -- las filas ya existen donde hubo ventas (B_02)

  -- proveedor ↔ producto
  insert into piefirme.proveedor_productos (organizacion_id, proveedor_id, producto_id, sku_proveedor)
  select o, case when pr.tipo = 'venta' then v_prov_derma else v_prov_podo end, pr.id, 'SP-' || pr.sku
    from piefirme.productos pr where pr.organizacion_id = o and pr.tipo in ('venta', 'insumo_clinico')
  on conflict (proveedor_id, producto_id) do nothing;

  -- ───────── compras: apertura (20-jul) + 3 reposiciones mensuales por sede y proveedor; recepción 2 días después con factura a crédito ─────────
  v_sede_i := 0;
  for v_per in select * from (values (1, date '2026-07-20', 0.45, 1.00), (2, date '2026-08-05', 0.22, 1.02), (3, date '2026-09-04', 0.22, 1.03), (4, date '2026-10-06', 0.11, 1.05)) x(k, f, share, inflacion) loop
    for v_s in select id, clave, row_number() over (order by clave) as i from piefirme.sedes where organizacion_id = o order by clave loop
      for v_p in select * from (values ('derma', v_prov_derma, 'venta'), ('podo', v_prov_podo, 'insumo_clinico')) y(g, prov, tipo) loop
        v_oc := gen_random_uuid();
        insert into piefirme.ordenes_compra (id, organizacion_id, sede_id, proveedor_id, fecha, entrega_esperada, condiciones_pago, dias_credito, solicita_id, notas)
        values (v_oc, o, v_s.id, v_p.prov, v_per.f, v_per.f + 2, 'Crédito 15 días', 15, rec, 'Reposición sintética ' || v_per.k);
        insert into piefirme.oc_lineas (organizacion_id, sede_id, oc_id, producto_id, descripcion, cantidad, costo_unitario, descuento_pct, iva_pct)
        select o, v_s.id, v_oc, pr.id, pr.presentacion,
               ceil((need.n + tgt.t) * v_per.share) + case when v_s.clave = 'GAL' and pr.sku = 'PF-AM-001' and v_per.k = 3 then 6 else 0 end,
               round(cb.costo_promedio * v_per.inflacion, 2), case when pr.tipo = 'insumo_clinico' and v_per.k > 1 then 3 else 0 end, 16
          from piefirme.productos pr join tmp_costo_base cb on cb.id = pr.id
          cross join lateral (select coalesce(-sum(m.cantidad), 0)::numeric as n from piefirme.movimientos_inventario m
                               where m.sede_id = v_s.id and m.producto_id = pr.id and m.tipo in ('venta', 'consumo_consulta', 'devolucion_cliente')) need
          cross join lateral (select case when abs(hashtext(v_s.clave || pr.sku)) % 11 = 0 then 2 else 6 + abs(hashtext(v_s.clave || pr.sku || 'x')) % 8 end::numeric as t) tgt
         where pr.organizacion_id = o and pr.tipo = v_p.tipo
           and (ceil((need.n + tgt.t) * v_per.share) + case when v_s.clave = 'GAL' and pr.sku = 'PF-AM-001' and v_per.k = 3 then 6 else 0 end) > 0;
        if not exists (select 1 from piefirme.oc_lineas where oc_id = v_oc) then
          delete from piefirme.ordenes_compra where id = v_oc; continue;
        end if;
        select total, folio into v_total, v_folio from piefirme.ordenes_compra where id = v_oc;
        if (select requiere_autorizacion from piefirme.ordenes_compra where id = v_oc) then perform piefirme.oc_autorizar(v_oc); end if;
        -- la última reposición de la sede de Chalco queda enviada y sin recibir; la de Galerías en borrador pendiente de autorización
        if v_per.k = 4 and v_s.clave = 'GAL' and v_p.g = 'derma' then
          update piefirme.oc_lineas set cantidad = cantidad + 200 where oc_id = v_oc and producto_id = (select producto_id from piefirme.oc_lineas where oc_id = v_oc order by id limit 1);
          update piefirme.ordenes_compra set autorizada_por = null, fecha = date '2026-10-23', notas = 'Pendiente de autorización (sintética)' where id = v_oc;
          continue;
        end if;
        update piefirme.ordenes_compra set estado = 'enviada' where id = v_oc;
        if v_per.k = 4 and v_s.clave = 'CHA' and v_p.g = 'podo' then
          update piefirme.ordenes_compra set fecha = date '2026-10-22', entrega_esperada = date '2026-10-27', notas = 'Enviada, en espera de mercancía (sintética)' where id = v_oc;
          continue;
        end if;
        -- recepción completa con factura del proveedor
        v_rec := gen_random_uuid();
        select total into v_total from piefirme.ordenes_compra where id = v_oc;
        insert into piefirme.recepciones (id, organizacion_id, sede_id, oc_id, fecha, recibio_id, factura_numero, factura_importe, factura_url, factura_vencimiento, cfdi_uuid, nota)
        values (v_rec, o, v_s.id, v_oc, v_per.f + 2, rec, 'FS-' || lpad((v_per.k * 1000 + v_s.i * 10 + case when v_p.g = 'derma' then 1 else 2 end)::text, 5, '0'), v_total,
                o::text || '/proveedores/facturas/' || v_rec::text || '.pdf', v_per.f + 2 + 15,
                upper(substr(md5(v_rec::text), 1, 8) || '-' || substr(md5(v_rec::text), 9, 4) || '-4' || substr(md5(v_rec::text), 13, 3) || '-a' || substr(md5(v_rec::text), 16, 3) || '-' || substr(md5(v_rec::text), 19, 12)),
                'Recepción sintética');
        for v_ol, v_qty, v_h in
          select l.id, l.cantidad, abs(hashtext(v_s.clave || l.producto_id::text)) % 6 from piefirme.oc_lineas l where l.oc_id = v_oc loop
          insert into piefirme.recepcion_lineas (recepcion_id, oc_linea_id, cantidad_recibida, numero_lote, caducidad)
          select v_rec, v_ol, v_qty,
                 case when pr.maneja_lote then 'L' || to_char(v_per.f, 'YYMM') || '-' || v_s.clave end,
                 case when pr.maneja_caducidad then
                        case when v_s.clave = 'GAL' and v_per.k = 3 and pr.sku = 'PF-AM-001' then date '2026-12-18'      -- lote próximo a caducar (≤ 90 días)
                             else (v_per.f + make_interval(months => 10 + v_h))::date end end
            from piefirme.oc_lineas l join piefirme.productos pr on pr.id = l.producto_id where l.id = v_ol;
        end loop;
      end loop;
    end loop;
  end loop;

  -- Lotes: las ventas anteriores al alta de lotes no traían lote. Se reclasifican a los lotes más antiguos (PEPS) con un par de ajustes:
  -- −N en el lote y +N sin lote, de modo que la existencia de la sede no cambia y lotes y existencia cuadran.
  declare l record; s_ record; v_rest numeric; v_take numeric;
  begin
    for s_ in select distinct l0.sede_id, l0.producto_id from piefirme.lotes_producto l0 where l0.organizacion_id = o loop
      select coalesce(-sum(m.cantidad), 0) into v_rest from piefirme.movimientos_inventario m
       where m.sede_id = s_.sede_id and m.producto_id = s_.producto_id and m.tipo in ('venta', 'consumo_consulta', 'devolucion_cliente');
      for l in select * from piefirme.lotes_producto where sede_id = s_.sede_id and producto_id = s_.producto_id and existencia > 0 order by recibido_en, id loop
        exit when v_rest <= 0;
        v_take := least(v_rest, l.existencia);
        insert into piefirme.movimientos_inventario (organizacion_id, sede_id, producto_id, lote_id, tipo, cantidad, referencia_tipo, nota, usuario_id, fecha)
        values (o, l.sede_id, l.producto_id, l.id, 'ajuste', -v_take, 'conteo', 'Asignación PEPS de ventas anteriores al alta de lotes', adm, timestamptz '2026-07-27 08:00:00-06'),
               (o, l.sede_id, l.producto_id, null, 'ajuste', v_take, 'conteo', 'Contrapartida sin lote de la asignación PEPS', adm, timestamptz '2026-07-27 08:00:00-06');
        v_rest := v_rest - v_take;
      end loop;
    end loop;
  end;

  -- ───────── mermas autorizadas y una pendiente ─────────
  insert into piefirme.mermas (organizacion_id, sede_id, producto_id, cantidad, motivo, tipo, registrado_por)
  select o, s.id, pr.id, 1, m.motivo, m.tipo, rec
    from (values ('CHA', 'PF-CC-002', 'Caja dañada en bodega', 'danio'), ('CEN', 'PF-IN-001', 'Guantes con sello roto', 'danio'),
                 ('SEN', 'PF-AM-002', 'Caducidad próxima: retirado de exhibición', 'caducidad')) m(sede, sku, motivo, tipo)
    join piefirme.sedes s on s.organizacion_id = o and s.clave = m.sede join piefirme.productos pr on pr.organizacion_id = o and pr.sku = m.sku;
  perform piefirme.merma_resolver(x.id, true) from (select id from piefirme.mermas where organizacion_id = o order by created_at limit 2) x;   -- la 3.ª queda pendiente

  -- ───────── traspasos (P-080) ─────────
  declare t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); t3 uuid := gen_random_uuid(); sa uuid; sb uuid; sc uuid;
  begin
    select id into sa from piefirme.sedes where organizacion_id = o and clave = 'CHA';
    select id into sb from piefirme.sedes where organizacion_id = o and clave = 'CEN';
    select id into sc from piefirme.sedes where organizacion_id = o and clave = 'GAL';
    -- t1: CHA → GAL, recibido con diferencias
    insert into piefirme.traspasos (id, organizacion_id, sede_origen_id, sede_destino_id, fecha_estimada, transporte, comentarios, solicito_id, responsable_envio_id)
    values (t1, o, sa, sc, current_date, 'Mensajería interna', 'Reposición urgente (sintético)', rec, rec);
    insert into piefirme.traspaso_lineas (organizacion_id, traspaso_id, producto_id, cantidad_enviada)
    select o, t1, pr.id, 3 from piefirme.productos pr where pr.organizacion_id = o and pr.sku in ('PF-CC-001', 'PF-OR-002');
    perform piefirme.traspaso_enviar(t1);
    perform piefirme.traspaso_recibir(t1, (select jsonb_agg(jsonb_build_object('linea_id', l.id, 'cantidad_recibida', case when pr.sku = 'PF-OR-002' then 2 else 3 end, 'motivo', 'Faltante')) 
                                          from piefirme.traspaso_lineas l join piefirme.productos pr on pr.id = l.producto_id where l.traspaso_id = t1));
    -- t2: CEN → CHA, recibido completo
    insert into piefirme.traspasos (id, organizacion_id, sede_origen_id, sede_destino_id, comentarios, solicito_id) values (t2, o, sb, sa, 'Balanceo de inventario (sintético)', rec);
    insert into piefirme.traspaso_lineas (organizacion_id, traspaso_id, producto_id, cantidad_enviada)
    select o, t2, pr.id, 2 from piefirme.productos pr where pr.organizacion_id = o and pr.sku in ('PF-OR-001', 'PF-PD-001');
    perform piefirme.traspaso_enviar(t2);
    perform piefirme.traspaso_recibir(t2, null);
    -- t3: CEN → GAL, en tránsito
    insert into piefirme.traspasos (id, organizacion_id, sede_origen_id, sede_destino_id, comentarios, solicito_id) values (t3, o, sb, sc, 'En tránsito (sintético)', rec);
    insert into piefirme.traspaso_lineas (organizacion_id, traspaso_id, producto_id, cantidad_enviada)
    select o, t3, pr.id, 2 from piefirme.productos pr where pr.organizacion_id = o and pr.sku in ('PF-CC-002');
    perform piefirme.traspaso_enviar(t3);
    -- t4: borrador
    insert into piefirme.traspasos (organizacion_id, sede_origen_id, sede_destino_id, comentarios, solicito_id) values (o, sc, sb, 'Borrador (sintético)', rec);
  end;

  -- ───────── conteos físicos: uno autorizado (ajuste −1 en Centenario) y uno capturado pendiente ─────────
  declare c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); sx uuid;
  begin
    select id into sx from piefirme.sedes where organizacion_id = o and clave = 'CEN';
    insert into piefirme.conteos_fisicos (id, organizacion_id, sede_id, fecha, responsable_id, nota) values (c1, o, sx, date '2026-10-15', rec, 'Conteo mensual (sintético)');
    insert into piefirme.conteo_lineas (organizacion_id, conteo_id, producto_id, esperado, contado, motivo)
    select o, c1, i.producto_id, i.existencia, i.existencia - case when pr.sku = 'PF-CC-001' then 1 else 0 end, case when pr.sku = 'PF-CC-001' then 'Diferencia de conteo' end
      from piefirme.inventario_sede i join piefirme.productos pr on pr.id = i.producto_id where i.sede_id = sx and pr.sku in ('PF-CC-001', 'PF-CC-002', 'PF-OR-001');
    perform piefirme.conteo_autorizar(c1);
    select id into sx from piefirme.sedes where organizacion_id = o and clave = 'PAT';
    insert into piefirme.conteos_fisicos (id, organizacion_id, sede_id, fecha, responsable_id, estado, nota) values (c2, o, sx, date '2026-10-23', rec, 'borrador', 'Conteo en captura (sintético)');
    insert into piefirme.conteo_lineas (organizacion_id, conteo_id, producto_id, esperado, contado)
    select o, c2, i.producto_id, i.existencia, greatest(i.existencia - 1, 0) from piefirme.inventario_sede i join piefirme.productos pr on pr.id = i.producto_id where i.sede_id = sx and pr.sku in ('PF-AM-001', 'PF-IN-002');
    update piefirme.conteos_fisicos set estado = 'capturado' where id = c2;
  end;
end $$;
