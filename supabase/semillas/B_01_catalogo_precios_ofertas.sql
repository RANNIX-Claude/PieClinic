-- Semilla B_01 · Catálogo sintético de servicios, productos, precios con histórico, ofertas, horarios, festivos y portal.
-- Datos de ejemplo de Pie Clinic (5 sedes) SINTÉTICOS, rotulados sintetico = true (P-069, P-132). Precios base de docs/INVESTIGACION_PODOLOGIA.md §4.2.
-- REQUIERE (ver B_00): organización 00000000-0000-0000-0000-00000000c0de; sedes 5e000000-…-00000000000N (CHA, CEN, GAL, PAT, SEN);
--   perfiles: administrador a0000000-…-000000000001 y podólogos a0000000-…-00000000001N (N = 1..5, uno por sede).
-- Idempotente: se puede correr de nuevo (on conflict do nothing / not exists).

do $$
declare o constant uuid := '00000000-0000-0000-0000-00000000c0de';
begin
  -- ───────── servicios ─────────
  insert into piefirme.servicios (organizacion_id, codigo, nombre, alias, categoria, tipo_precio, unidad_cobro, duracion_min, iva_tipo, requiere_seguimiento,
        regla_seguimiento, revision_dias_min, revision_dias_max, requiere_consentimiento, precio_por_sede, garantia_dias, admite_videoconsulta, admite_domicilio,
        recargo_domicilio, descripcion_publica, visible_portal, clave_sat, unidad_sat, renglon_edr, es_curacion_incluida, valoracion_acreditable, sintetico)
  values
   (o, 'SV-001', 'Quiropodia', array['quiropodia básica', 'pedicura clínica'], 'Quiropodia', 'fijo', null, 30, 'exento', true, '{"recurrente":"4-6 semanas"}', 28, 42, false, true, null, false, true, 150,
      'Corte y fresado de uñas, eliminación de callosidades.', true, '85121600', 'E48', 'Quiropodia', false, false, true),
   (o, 'SV-002', 'Uña encarnada', array['onicocriptosis'], 'Ungueal', 'fijo', null, 40, 'exento', true, '{"curaciones":1,"dias":"7-10"}', null, null, true, false, null, false, false, null,
      'Tratamiento de uña encarnada. Incluye 1 curación de control.', true, '85121600', 'E48', 'Ungueal', false, false, true),
   (o, 'SV-003', 'Extracción de uña', array['extracción ungueal'], 'Ungueal', 'fijo', null, 60, 'exento', true, '{"curaciones":4,"intervalo":"diario consecutivo"}', null, null, true, false, null, false, false, null,
      'Extracción de uña con 4 curaciones diarias incluidas.', true, '85121600', 'E48', 'Ungueal', false, false, true),
   (o, 'SV-004', 'Curación de uña (incluida)', array['curación'], 'Ungueal', 'gratis', null, 15, 'exento', false, '{}', null, null, false, false, null, false, false, null,
      'Curación incluida en tu tratamiento.', false, '85121600', 'E48', 'Ungueal', true, false, true),
   (o, 'SV-005', 'Tratamiento de onicomicosis (láser)', array['láser hongos'], 'Ungueal', 'fijo', 'por sesión', 45, 'exento', true, '{"sesiones":6,"ventana_dias":"30-35"}', 30, 35, true, false, 90, false, false, null,
      'Sesión de láser para hongos en uñas.', true, '85121600', 'E48', 'Láser', false, false, true),
   (o, 'SV-006', 'Valoración de pie de riesgo', array['pie diabético', 'valoración diabética'], 'Pie en riesgo', 'fijo', null, 45, 'exento', true, '{"revision":"1-3 meses"}', 30, 90, false, false, null, true, false, null,
      'Valoración integral del pie diabético (monofilamento, pulsos, piel).', true, '85121600', 'E48', 'Pie en riesgo', false, true, true),
   (o, 'SV-007', 'Verruga plantar (papiloma)', array['verruga'], 'Ungueal', 'desde', null, 30, 'exento', true, '{"sesiones":3}', null, null, true, false, null, false, false, null,
      'Tratamiento de verruga plantar.', true, '85121600', 'E48', 'Quiropodia', false, false, true),
   (o, 'SV-008', 'Estudio de la pisada', array['baropodometría'], 'Biomecánica', 'fijo', null, 40, 'exento', false, '{}', null, null, false, false, null, false, false, null,
      'Análisis de la pisada. Se acredita al comprar plantillas dentro de 30 días.', true, '85121600', 'E48', 'Biomecánica', false, true, true),
   (o, 'SV-009', 'Valoración inicial', array['primera consulta'], 'Quiropodia', 'a_valorar', null, 30, 'exento', false, '{}', null, null, false, false, null, true, false, null,
      'Primera valoración; el costo del tratamiento se define en consulta.', true, '85121600', 'E48', 'Quiropodia', false, true, true),
   (o, 'SV-010', 'Seguimiento a distancia', array['videoconsulta'], 'Quiropodia', 'fijo', null, 20, 'exento', false, '{}', null, null, false, false, null, true, false, null,
      'Seguimiento por videoconsulta.', true, '85121600', 'E48', 'Quiropodia', false, false, true),
   (o, 'SV-011', 'Reflexología podal', array[]::text[], 'Quiropodia', 'fijo', null, 40, 'exento', false, '{}', null, null, false, true, null, false, false, null,
      'Masaje terapéutico de pies.', true, '85121600', 'E48', 'Quiropodia', false, false, true),
   (o, 'SV-012', 'Fresado de uña engrosada', array['onicogrifosis'], 'Ungueal', 'fijo', null, 30, 'exento', false, '{}', null, null, false, false, null, false, false, null,
      'Reducción de uña engrosada.', true, '85121600', 'E48', 'Ungueal', false, false, true)
  on conflict (organizacion_id, codigo) do nothing;

  -- ───────── productos ─────────
  insert into piefirme.productos (organizacion_id, sku, codigo_barras, nombre, categoria, marca, presentacion, tipo, costo_promedio, iva_tipo, maneja_lote, maneja_caducidad,
        precio_por_sede, visible_portal, clave_sat, unidad_sat, renglon_edr, sintetico)
  values
   (o, 'PF-AM-001', '7500000000011', 'Antimicótico en crema', 'Antimicóticos', 'GenéricoSint', 'Tubo 30 g', 'venta', 85, '16', true, true, false, true, '51101500', 'H87', 'Productos', true),
   (o, 'PF-AM-002', '7500000000028', 'Esmalte antimicótico', 'Antimicóticos', 'GenéricoSint', 'Frasco 5 ml', 'venta', 160, '16', true, true, false, true, '51101500', 'H87', 'Productos', true),
   (o, 'PF-CC-001', '7500000000035', 'Crema hidratante de talones', 'Cuidado en casa', 'GenéricoSint', 'Frasco 100 g', 'venta', 70, '16', false, false, true, true, '53131600', 'H87', 'Productos', true),
   (o, 'PF-CC-002', '7500000000042', 'Spray desodorante de pies', 'Cuidado en casa', 'GenéricoSint', 'Spray 150 ml', 'venta', 55, '16', false, false, false, true, '53131600', 'H87', 'Productos', true),
   (o, 'PF-OR-001', '7500000000059', 'Separador de dedos de silicona', 'Ortesis', 'GenéricoSint', 'Par', 'venta', 40, '16', false, false, false, true, '42142500', 'H87', 'Productos', true),
   (o, 'PF-OR-002', '7500000000066', 'Talonera de gel', 'Ortopedia', 'GenéricoSint', 'Par', 'venta', 90, '16', false, false, false, true, '42142500', 'H87', 'Productos', true),
   (o, 'PF-PL-ORT', '7500000000073', 'Plantillas personalizadas (par)', 'Ortopedia', 'Laboratorio externo', 'Par', 'por_encargo', 1100, '16', false, false, false, true, '42142500', 'H87', 'Plantillas ortopédicas', true),
   (o, 'PF-PD-001', '7500000000080', 'Calcetas para pie diabético', 'Pie diabético', 'GenéricoSint', 'Par', 'venta', 75, '16', false, false, false, true, '53102700', 'H87', 'Productos', true),
   (o, 'PF-IN-001', null, 'Guantes de nitrilo (caja)', 'Insumo clínico', 'GenéricoSint', 'Caja 100', 'insumo_clinico', 180, '16', false, false, false, false, null, 'H87', null, true),
   (o, 'PF-IN-002', null, 'Fresas desechables (paquete)', 'Insumo clínico', 'GenéricoSint', 'Paquete 20', 'insumo_clinico', 220, '16', false, false, false, false, null, 'H87', null, true)
  on conflict (organizacion_id, sku) do nothing;
end $$;

-- ───────── precios con histórico (P-068): ajuste el 1-ago-2026; precio propio en Galerías ─────────
-- Servicios: lista (sede null) con versión inicial cerrada y versión vigente.
insert into piefirme.precios (organizacion_id, item_tipo, servicio_id, sede_id, vigente_desde, vigente_hasta, precio, tipo_precio, motivo, creado_por)
select s.organizacion_id, 'servicio', s.id, null, date '2026-01-01', date '2026-07-31', x.p0, s.tipo_precio, 'Alta inicial', 'a0000000-0000-0000-0000-000000000001'
  from piefirme.servicios s join (values ('SV-001', 380), ('SV-002', 500), ('SV-003', 750), ('SV-005', 650), ('SV-006', 550), ('SV-007', 450), ('SV-008', 1100), ('SV-011', 400), ('SV-012', 330)) x(cod, p0) on x.cod = s.codigo
 where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
   and not exists (select 1 from piefirme.precios p where p.servicio_id = s.id and p.sede_id is null and p.vigente_desde = date '2026-01-01');
insert into piefirme.precios (organizacion_id, item_tipo, servicio_id, sede_id, vigente_desde, vigente_hasta, precio, tipo_precio, motivo, creado_por)
select s.organizacion_id, 'servicio', s.id, null, date '2026-08-01', null, x.p1, s.tipo_precio, 'Ajuste anual', 'a0000000-0000-0000-0000-000000000001'
  from piefirme.servicios s join (values ('SV-001', 400), ('SV-002', 530), ('SV-003', 800), ('SV-005', 700), ('SV-006', 600), ('SV-007', 480), ('SV-008', 1200), ('SV-011', 420), ('SV-012', 350)) x(cod, p1) on x.cod = s.codigo
 where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
   and not exists (select 1 from piefirme.precios p where p.servicio_id = s.id and p.sede_id is null and p.vigente_desde = date '2026-08-01');
-- Servicios sin versión inicial: valoración inicial (a valorar), curación (gratis), seguimiento a distancia ($300, P-017)
insert into piefirme.precios (organizacion_id, item_tipo, servicio_id, sede_id, vigente_desde, vigente_hasta, precio, tipo_precio, motivo, creado_por)
select s.organizacion_id, 'servicio', s.id, null, date '2026-01-01', null, x.p, s.tipo_precio, 'Alta inicial', 'a0000000-0000-0000-0000-000000000001'
  from piefirme.servicios s join (values ('SV-004', 0), ('SV-009', 0), ('SV-010', 300)) x(cod, p) on x.cod = s.codigo
 where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
   and not exists (select 1 from piefirme.precios p where p.servicio_id = s.id and p.sede_id is null);
-- Precio propio de Galerías para quiropodia (con cambio programado hacia adelante)
insert into piefirme.precios (organizacion_id, item_tipo, servicio_id, sede_id, vigente_desde, vigente_hasta, precio, tipo_precio, motivo, creado_por)
select s.organizacion_id, 'servicio', s.id, '5e000000-0000-0000-0000-000000000003', date '2026-08-01', null, 450, 'fijo', 'Precio por sede', 'a0000000-0000-0000-0000-000000000001'
  from piefirme.servicios s where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de' and s.codigo = 'SV-001'
   and not exists (select 1 from piefirme.precios p where p.servicio_id = s.id and p.sede_id = '5e000000-0000-0000-0000-000000000003');
-- Productos
insert into piefirme.precios (organizacion_id, item_tipo, producto_id, sede_id, vigente_desde, vigente_hasta, precio, motivo, creado_por)
select p.organizacion_id, 'producto', p.id, null, date '2026-01-01', null, x.pr, 'Alta inicial', 'a0000000-0000-0000-0000-000000000001'
  from piefirme.productos p join (values ('PF-AM-001', 220), ('PF-AM-002', 390), ('PF-CC-001', 180), ('PF-CC-002', 150), ('PF-OR-001', 120), ('PF-OR-002', 260),
                                    ('PF-PL-ORT', 2500), ('PF-PD-001', 210)) x(sku, pr) on x.sku = p.sku
 where p.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
   and not exists (select 1 from piefirme.precios q where q.producto_id = p.id and q.sede_id is null);

-- ───────── ofertas: paquete, plan láser, plan de extracción, membresía, gift card, promoción ─────────
insert into piefirme.ofertas (id, organizacion_id, codigo, nombre, tipo, descripcion, vigente_desde, vigente_hasta, estado, servicio_base_id, sesiones_total, plantilla_sesiones,
                            caducidad_meses, usable_otra_sede, beneficios, monto_saldo, descuento_pct, limite_usos, sintetico)
select x.id, '00000000-0000-0000-0000-00000000c0de', x.cod, x.nom, x.tipo, x.dsc, x.desde, x.hasta, x.est,
       (select id from piefirme.servicios where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and codigo = x.base), x.ses, x.plant::jsonb, x.cad, true, x.ben::jsonb, x.monto, x.pct, x.lim, true
  from (values
    ('0f000000-0000-0000-0000-000000000001'::uuid, 'PL-001', 'Plan láser 6 sesiones', 'plan_multisesion', 'Seis sesiones de láser con ventana de 30-35 días.', date '2026-01-01', null::date, 'activa', 'SV-005', 6,
       '[{"n":1,"intervalo_dias_min":0},{"n":2,"intervalo_dias_min":30,"intervalo_dias_max":35},{"n":3,"intervalo_dias_min":30,"intervalo_dias_max":35},{"n":4,"intervalo_dias_min":30,"intervalo_dias_max":35},{"n":5,"intervalo_dias_min":30,"intervalo_dias_max":35},{"n":6,"intervalo_dias_min":30,"intervalo_dias_max":35}]',
       12, '[]', null::numeric, null::numeric, null::int),
    ('0f000000-0000-0000-0000-000000000002'::uuid, 'PQ-001', 'Paquete uña sana', 'paquete', 'Uña encarnada + antimicótico + 1 ajuste incluido.', date '2026-08-01', date '2027-07-31', 'activa', null, null,
       '[]', null, '[]', null, null, null),
    ('0f000000-0000-0000-0000-000000000003'::uuid, 'MB-001', 'Membresía Pie Sano', 'membresia', 'Anualidad con beneficios definidos por la clínica.', date '2026-01-01', null, 'activa', null, null,
       '[]', 12, '[{"beneficio":"12 quiropodias básicas"},{"beneficio":"10% en productos"},{"beneficio":"Valoración sin costo"}]', null, null, null),
    ('0f000000-0000-0000-0000-000000000004'::uuid, 'GC-500', 'Gift card $500', 'gift_card', 'Tarjeta de regalo; usable en todas las sedes.', date '2026-01-01', null, 'activa', null, null,
       '[]', 12, '[]', 500, null, null),
    ('0f000000-0000-0000-0000-000000000005'::uuid, 'PR-017', 'Promoción Día del Podólogo 15%', 'promocion', '15% en productos de cuidado en casa.', date '2026-10-01', date '2026-11-30', 'activa', null, null,
       '[]', null, '[]', null, 15, 100)
  ) x(id, cod, nom, tipo, dsc, desde, hasta, est, base, ses, plant, cad, ben, monto, pct, lim)
on conflict (id) do nothing;

insert into piefirme.oferta_componentes (organizacion_id, oferta_id, tipo, servicio_id, producto_id, cantidad, precio_lista, aplica_en, orden)
select '00000000-0000-0000-0000-00000000c0de', '0f000000-0000-0000-0000-000000000002', 'servicio', (select id from piefirme.servicios where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and codigo = 'SV-002'), null, 1, 530, 'Cita 1', 1
 where not exists (select 1 from piefirme.oferta_componentes where oferta_id = '0f000000-0000-0000-0000-000000000002');
insert into piefirme.oferta_componentes (organizacion_id, oferta_id, tipo, servicio_id, producto_id, cantidad, precio_lista, aplica_en, orden)
select '00000000-0000-0000-0000-00000000c0de', '0f000000-0000-0000-0000-000000000002', 'producto', null, (select id from piefirme.productos where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and sku = 'PF-AM-001'), 1, 220, 'Cita 1', 2
 where (select count(*) from piefirme.oferta_componentes where oferta_id = '0f000000-0000-0000-0000-000000000002') = 1;

insert into piefirme.precios (organizacion_id, item_tipo, oferta_id, sede_id, vigente_desde, vigente_hasta, precio, motivo, creado_por)
select '00000000-0000-0000-0000-00000000c0de', 'oferta', x.id, null, x.desde, null, x.pr, 'Alta inicial', 'a0000000-0000-0000-0000-000000000001'
  from (values ('0f000000-0000-0000-0000-000000000001'::uuid, date '2026-01-01', 3600), ('0f000000-0000-0000-0000-000000000002'::uuid, date '2026-08-01', 650),
               ('0f000000-0000-0000-0000-000000000003'::uuid, date '2026-01-01', 3800), ('0f000000-0000-0000-0000-000000000004'::uuid, date '2026-01-01', 500)) x(id, desde, pr)
 where not exists (select 1 from piefirme.precios p where p.oferta_id = x.id);

-- ───────── horarios de atención (L-V 9-14 y 15-19, sábado 9-14), festivos y bloqueos ─────────
insert into piefirme.horarios_atencion (organizacion_id, sede_id, podologo_id, dia_semana, hora_inicio, hora_fin, vigente_desde)
select '00000000-0000-0000-0000-00000000c0de'::uuid, ('5e000000-0000-0000-0000-00000000000' || n)::uuid, ('a0000000-0000-0000-0000-00000000001' || n)::uuid, d::smallint, h.i, h.f, date '2026-01-01'
  from generate_series(1, 5) n
  cross join (values (1), (2), (3), (4), (5)) wd(d)
  cross join (values (time '09:00', time '14:00'), (time '15:00', time '19:00')) h(i, f)
 where not exists (select 1 from piefirme.horarios_atencion x where x.podologo_id = ('a0000000-0000-0000-0000-00000000001' || n)::uuid and x.dia_semana = d and x.hora_inicio = h.i)
union all
select '00000000-0000-0000-0000-00000000c0de'::uuid, ('5e000000-0000-0000-0000-00000000000' || n)::uuid, ('a0000000-0000-0000-0000-00000000001' || n)::uuid, 6::smallint, time '09:00', time '14:00', date '2026-01-01'
  from generate_series(1, 5) n
 where not exists (select 1 from piefirme.horarios_atencion x where x.podologo_id = ('a0000000-0000-0000-0000-00000000001' || n)::uuid and x.dia_semana = 6);

insert into piefirme.festivos (organizacion_id, sede_id, fecha, nombre)
select '00000000-0000-0000-0000-00000000c0de', null, f, nm
  from (values (date '2026-11-02', 'Día de Muertos (cierre)'), (date '2026-11-16', 'Revolución (día festivo)'), (date '2026-12-25', 'Navidad'), (date '2027-01-01', 'Año Nuevo')) v(f, nm)
on conflict do nothing;

insert into piefirme.bloqueos_agenda (organizacion_id, sede_id, ambito, podologo_id, inicio, fin, tipo, motivo, estado, solicitado_por, autorizado_por)
select '00000000-0000-0000-0000-00000000c0de', '5e000000-0000-0000-0000-000000000002', 'podologo', 'a0000000-0000-0000-0000-000000000012',
       timestamptz '2026-11-09 00:00-06', timestamptz '2026-11-14 00:00-06', 'vacaciones', 'Vacaciones sintéticas', 'autorizado',
       'a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001'
 where not exists (select 1 from piefirme.bloqueos_agenda where motivo = 'Vacaciones sintéticas');

-- ───────── portal público ─────────
insert into piefirme.organizaciones_portal (organizacion_id, slug, activo, titulo, mensaje_bienvenida)
values ('00000000-0000-0000-0000-00000000c0de', 'pie-clinic-sintetico', true, 'Pie Clinic (sintético)', 'Reserva tu cita. Datos de ejemplo.')
on conflict (organizacion_id) do nothing;
insert into piefirme.portal_podologos (perfil_id, organizacion_id, visible, nombre_publico, resumen)
select ('a0000000-0000-0000-0000-00000000001' || n)::uuid, '00000000-0000-0000-0000-00000000c0de', true, 'Podólogo(a) ' || n, 'Perfil sintético'
  from generate_series(1, 5) n
on conflict (perfil_id) do nothing;

-- ───────── configuración fiscal / Clip en modo SIMULADO (sin llaves reales) ─────────
insert into piefirme.pac_configuracion (organizacion_id, proveedor, modo) values ('00000000-0000-0000-0000-00000000c0de', 'por_definir', 'simulado') on conflict (organizacion_id) do nothing;
insert into piefirme.clip_cuentas (organizacion_id, alias, estado, modo) values ('00000000-0000-0000-0000-00000000c0de', 'clip-sintetico', 'desconectada', 'simulado') on conflict (organizacion_id) do nothing;
-- RFC de pruebas públicas del SAT (no pertenecen a ninguna persona real de este sistema)
insert into piefirme.emisor_fiscal (organizacion_id, rfc, razon_social, regimen_fiscal, codigo_postal, serie)
values ('00000000-0000-0000-0000-00000000c0de', 'EKU9003173C9', 'ESCUELA KEMPER URGATE', '601', '56600', 'A')
on conflict (organizacion_id, serie) do nothing;
