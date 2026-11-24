-- G_05 · Semilla SINTÉTICA V2: descripción web de productos, 60 pedidos de la tienda en línea con sus líneas y 21 auditorías de inventario con fotos
-- (cantidad leída por IA simulada, confianza y origen). Las fotos NO tienen archivo en Storage: storage_path queda nulo (la semilla no sube objetos).
-- Requiere: migraciones 069, G_01 (sedes), B_01 (productos). Idempotente (ids deterministas / folios únicos) · marca: sintetico = true.
-- Los pedidos son de «clientes» ficticios (correos @ejemplo.invalid) y NO tienen pago real: pago_estado = 'simulado'.
do $$
declare o constant uuid := '00000000-0000-0000-0000-00000000c0de'; v_resp uuid;
begin
  perform set_config('app.ignorar_cierre', 'on', true);
  if not exists (select 1 from piefirme.organizaciones where id = o) then raise notice 'G_05: falta la organización'; return; end if;
  select id into v_resp from piefirme.perfiles where organizacion_id = o and email = 'r1@g.com';

  -- ───────────── descripción web de los productos visibles en el portal (precio_web queda nulo = usa el de lista) ─────────────
  update piefirme.productos p set descripcion_web = case p.sku
      when 'PF-AM-001' then 'Crema antimicótica de uso diario para pie de atleta y piel entre los dedos. Aplicar una o dos veces al día sobre piel limpia y seca.'
      when 'PF-AM-002' then 'Esmalte antimicótico para uñas con hongos. Se aplica una vez al día; el tratamiento es constante y puede tardar meses en verse el resultado.'
      when 'PF-OR-001' then 'Separador de dedos de silicona suave que reduce roces y presión entre los dedos. Se lava con agua y jabón y se reutiliza.'
      when 'PF-PD-001' then 'Calcetas sin costuras para pie diabético, con tejido suave que no aprieta y ayuda a mantener el pie seco.'
      when 'PF-CC-002' then 'Spray desodorante para pies y calzado. Ayuda a controlar el mal olor durante el día.'
      when 'PF-OR-002' then 'Talonera de gel que amortigua el impacto al caminar y alivia la presión en el talón.'
      when 'PF-CC-001' then 'Crema hidratante para talones secos y con grietas. Usar por la noche con calcetas de algodón.'
      else p.nombre || ' · ' || coalesce(p.categoria, 'producto de cuidado del pie') || '.' end
   where p.organizacion_id = o and p.visible_portal and p.descripcion_web is null;

  -- ───────────── pedidos de la tienda en línea (60, últimos 75 días) ─────────────
  insert into piefirme.pedidos_web (id, organizacion_id, sede_id, folio, cliente_nombre, cliente_telefono, cliente_email, tipo_entrega, direccion_envio,
                                  estado, pago_estado, subtotal, envio, total, nota_cliente, motivo_cancelacion, origen, atendido_en, sintetico, created_at)
  select md5('G05:pedido:' || k)::uuid, o, s.id, 'PW-' || lpad((1000 + k)::text, 6, '0'),
         n.nom[1 + (k * 7) % 12] || ' ' || n.ape[1 + (k * 5) % 12] || ' (sintético)', '55 0000 ' || lpad((3000 + k)::text, 4, '0'), 'cliente' || k || '@ejemplo.invalid',
         case when k % 4 = 0 then 'envio' else 'recoger' end,
         case when k % 4 = 0 then 'Calle Ejemplo ' || (10 + k) || ', Col. Centro (sintético)' end,
         e.estado, 'simulado', 0, case when k % 4 = 0 then 80 else 0 end, 0,
         case when k % 7 = 0 then 'Por favor avisar por WhatsApp cuando esté listo.' end,
         case when e.estado = 'cancelado' then 'El cliente ya no lo requiere' end,
         'tienda_web', case when e.estado in ('confirmado', 'preparando', 'listo', 'entregado') then (now() - make_interval(days => e.dias)) + interval '3 hours' end, true,
         now() - make_interval(days => e.dias) - make_interval(mins => (k * 37) % 600)
    from generate_series(1, 60) k
    cross join (select array['Carlos','Ana','Luis','María','Jorge','Laura','Miguel','Patricia','Andrés','Lucía','Ricardo','Gabriela'] as nom,
                       array['García','Hernández','López','Martínez','González','Pérez','Rodríguez','Sánchez','Ramírez','Torres','Flores','Rivera'] as ape) n
    cross join lateral (select 75 - (k * 75 / 60) as dias) d0
    cross join lateral (select d0.dias,
        case when d0.dias > 10 then (case when k % 10 = 0 then 'cancelado' else 'entregado' end)
             when d0.dias > 5 then (array['entregado', 'listo', 'entregado', 'cancelado'])[1 + k % 4]
             else (array['nuevo', 'confirmado', 'preparando', 'listo', 'nuevo'])[1 + k % 5] end as estado) e
    join (select id, row_number() over (order by clave)::int rn from piefirme.sedes where organizacion_id = o and clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN', 'POL', 'COY')) s on s.rn = 1 + k % 7
  on conflict (id) do nothing;

  -- líneas: 1 a 3 productos visibles en portal; precio = precio de lista de la sede (o costo × 1.8 si no hay)
  insert into piefirme.pedidos_web_lineas (id, organizacion_id, sede_id, pedido_id, producto_id, descripcion, cantidad, precio_unitario, importe)
  select md5('G05:linea:' || p.id || ':' || l.ord)::uuid, o, p.sede_id, p.id, pr.id, pr.nombre, q.cant, q.precio, q.cant * q.precio
    from piefirme.pedidos_web p
    cross join generate_series(1, 3) l(ord)
    join lateral (select z.* from (select x.*, row_number() over (order by x.sku) rn from piefirme.productos x where x.organizacion_id = o and x.visible_portal) z
                   where z.rn = 1 + (abs(hashtext(p.id::text)) + l.ord * 3) % greatest(1, (select count(*) from piefirme.productos where organizacion_id = o and visible_portal))) pr on true
    cross join lateral (select 1 + (abs(hashtext(p.id::text || l.ord)) % 3) as cant,
                               coalesce(pr.precio_web, nullif(piefirme_app.precio_item(o, 'producto', pr.id, p.sede_id), 0), round(pr.costo_promedio * 1.8, 2)) as precio) q
   where p.organizacion_id = o and p.sintetico and l.ord <= 1 + abs(hashtext(p.id::text)) % 3
  on conflict (id) do nothing;
  update piefirme.pedidos_web p set subtotal = t.s, total = t.s + p.envio
    from (select pedido_id, sum(importe) s from piefirme.pedidos_web_lineas where organizacion_id = o group by pedido_id) t
   where t.pedido_id = p.id and p.sintetico and p.subtotal = 0;

  -- ───────────── auditorías de inventario: 3 por sede (hace ~60, ~30 y ~5 días) con 4 a 6 fotos ─────────────
  insert into piefirme.auditorias_inventario (id, organizacion_id, sede_id, folio, fecha, responsable_id, estado, nota, sintetico)
  select md5('G05:aud:' || s.clave || ':' || a)::uuid, o, s.id, 'AUD-' || s.clave || '-' || a, current_date - (case a when 1 then 60 when 2 then 30 else 5 end) - (s.rn % 4),
         v_resp, case a when 3 then (case when s.rn % 2 = 0 then 'abierta' else 'en_revision' end) else 'cerrada' end,
         case a when 3 then 'Auditoría en curso' else 'Auditoría mensual de anaqueles' end, true
    from (select id, clave, row_number() over (order by clave)::int rn from piefirme.sedes where organizacion_id = o and clave in ('CHA', 'CEN', 'GAL', 'PAT', 'SEN', 'POL', 'COY')) s
    cross join generate_series(1, 3) a
  on conflict (id) do nothing;

  insert into piefirme.auditoria_fotos (id, organizacion_id, sede_id, auditoria_id, producto_id, origen, cantidad_esperada, cantidad_ia, cantidad_confirmada, confianza, tomada_en, nota, sintetico)
  select md5('G05:foto:' || a.id || ':' || f)::uuid, o, a.sede_id, a.id, pr.id,
         case when abs(hashtext(a.id::text || f)) % 4 = 0 then 'camara' else 'colaborador' end,
         x.esp, greatest(0, x.esp + x.dif), case when a.estado = 'cerrada' then x.esp + (case when abs(x.dif) > 2 then x.dif else 0 end) end,
         round((0.62 + (abs(hashtext(a.id::text || f || 'c')) % 37) / 100.0)::numeric, 3), a.fecha::timestamptz + interval '10 hours' + make_interval(mins => f * 7),
         case when abs(x.dif) > 2 then 'Diferencia contra el sistema: revisar conteo' end, true
    from piefirme.auditorias_inventario a
    cross join generate_series(1, 6) f
    join lateral (select z.* from (select p.*, row_number() over (order by p.sku) rn from piefirme.productos p where p.organizacion_id = o) z
                   where z.rn = 1 + (abs(hashtext(a.id::text)) + f) % greatest(1, (select count(*) from piefirme.productos where organizacion_id = o))) pr on true
    cross join lateral (select 8 + abs(hashtext(a.id::text || f || 'e')) % 33 as esp, (abs(hashtext(a.id::text || f || 'd')) % 7) - 3 as dif) x
   where a.organizacion_id = o and a.sintetico and f <= 4 + abs(hashtext(a.id::text)) % 3
  on conflict (id) do nothing;
end $$;
