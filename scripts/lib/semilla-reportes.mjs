// SEMILLA DE REPORTES (Control y Auditoría · Etapa 6) — SOLO QA. Genera datos de prueba sintéticos y claramente marcados «RQA» (sedes RQA1…RQA7, productos RQA-Pnnn,
// folios SES-RQA-/CAS-RQA-/CIE-RQA-/RQA-T-) para medir el reporte de diferencias de 90 días × 7 sucursales y para poblar el tablero y los reportes de caja.
//   · scripts/semilla-auditoria-reportes-qa.mjs la deja COMMITEADA en QA (idempotente: si existe la sede RQA1 no hace nada; --quitar la borra).
//   · scripts/test-auditoria-reportes-qa.mjs la corre DENTRO de la transacción de la prueba (se deshace) para medir rendimiento.
// Se inserta como dueño de la base con session_replication_role = replica (los triggers de sellado/inmutabilidad/folio se apagan para poder fechar hacia atrás y nunca se
// mezclan con datos reales); las alertas se crean después con triggers activos para que el despacho (techo diario, resumen) quede ejercitado.
// Todo es determinista (hash de ids), nada es aleatorio entre corridas salvo los uuid.
export const ORG = "00000000-0000-0000-0000-00000000c0de";
export const NOMBRES_SEDES = ["Norte", "Sur", "Centro", "Oriente", "Poniente", "Plaza", "Mercado"];

const uuid = (v) => { if (!/^[0-9a-f-]{36}$/i.test(v ?? "")) throw new Error(`uuid inválido: ${v}`); return v; };

export async function existe(c) {
  return (await c.query("select 1 from piefirme.sedes where organizacion_id = $1 and clave = 'RQA1'", [ORG])).rowCount > 0;
}

/** ids = { r, s, m, p } (perfiles de r@g.com, s@g.com, m@g.com, p@g.com). opciones: dias (90), ventas (true), alertas (true). Devuelve conteos. */
export async function sembrar(c, ids, { dias = 90, ventas = true, alertas = true } = {}) {
  const R = uuid(ids.r), S = uuid(ids.s), M = uuid(ids.m), P = uuid(ids.p);
  const D = Math.max(1, Math.min(400, Number(dias) | 0));
  if (await existe(c)) return { yaExiste: true };
  await c.query("reset role");
  await c.query("set local session_replication_role = replica");
  const q = (sql) => c.query(sql);

  await q(`create temp table _rqa_cfg on commit drop as select '${ORG}'::uuid as org, piefirme_app.ctl_zona('${ORG}') as tz, piefirme_app.ctl_hoy('${ORG}') as hoy`);
  // sucursales
  await q(`insert into piefirme.sedes (organizacion_id, clave, nombre, activa)
           select '${ORG}', 'RQA' || n, 'RQA ' || (array['${NOMBRES_SEDES.join("','")}'])[n], true from generate_series(1, 7) n`);
  await q(`create temp table _rqa_sede on commit drop as
           select id, row_number() over (order by clave)::int as n, nombre from piefirme.sedes where organizacion_id = '${ORG}' and clave like 'RQA_'`);
  // productos y precios
  await q(`create temp table _rqa_prod on commit drop as
           select n, gen_random_uuid() as id, 'RQA-P' || lpad(n::text, 3, '0') as sku, 'Producto RQA ' || lpad(n::text, 3, '0') as nombre, '9610' || lpad(n::text, 8, '0') as cb,
                  (array['Plantillas', 'Cuidado del pie', 'Instrumental', 'Consumibles', 'Calzado'])[1 + (n % 5)] as categoria,
                  round((20 + (abs(hashtextextended('c' || n, 1)) % 1800)) * (case when n % 10 = 0 then 1.5 else 1 end))::numeric as costo
             from generate_series(1, 120) n`);
  await q(`insert into piefirme.productos (id, organizacion_id, sku, nombre, codigo_barras, categoria, costo_promedio) select id, '${ORG}', sku, nombre, cb, categoria, costo from _rqa_prod`);
  await q(`insert into piefirme.precios (organizacion_id, item_tipo, producto_id, vigente_desde, precio, tipo_precio)
           select '${ORG}', 'producto', id, (select hoy from _rqa_cfg) - 400, round(costo * 1.9), 'fijo' from _rqa_prod`);

  // sesiones de conteo de apertura (una por sucursal y día)
  await q(`create temp table _rqa_ses on commit drop as
           select gen_random_uuid() as id, se.id as sucursal_id, se.n as sidx, d.d as dia,
                  (((select hoy from _rqa_cfg) - d.d)::timestamp + interval '9 hours' + make_interval(mins => (se.n * 3)::int)) at time zone (select tz from _rqa_cfg) as ini,
                  (array['${R}', '${S}', '${M}', '${P}'])[1 + ((se.n + d.d) % 4)]::uuid as auditor
             from _rqa_sede se cross join generate_series(0, ${D - 1}) d(d)`);
  await q(`delete from _rqa_ses where ini > now() - interval '1 minute'`);
  await q(`alter table _rqa_ses add column rn integer; update _rqa_ses x set rn = y.rn from (select id, row_number() over (order by ini, sidx)::integer as rn from _rqa_ses) y where y.id = x.id`);
  await q(`insert into piefirme.ctl_sesion_conteo (id, organizacion_id, folio, sucursal_id, tipo, modo_lista, estado, abierta_en, cerrada_en, usuario_captura, total_partidas, duracion_seg, creado_en, creado_por)
           select id, '${ORG}', 'SES-RQA-' || lpad(rn::text, 5, '0'), sucursal_id, 'conteo_apertura', 'completa', 'cerrada', ini, ini + interval '11 minutes', auditor, 100,
                  600 + (abs(hashtextextended(id::text, 2)) % 400), ini, auditor from _rqa_ses`);
  // partidas: 100 de los 120 productos por sucursal; ~2.5 % con diferencia (más en la sucursal 3 y en los productos múltiplos de 17)
  await q(`create temp table _rqa_par on commit drop as
           select z.*, case when z.r < z.p then (case when z.neg then -z.mag else 1 end) else 0 end as dif
             from (select gen_random_uuid() as id, se.id as sesion_id, se.sucursal_id, se.sidx, se.dia, se.ini, se.auditor, pr.id as producto_id, pr.n as pn, pr.cb, pr.costo, pr.nombre,
                          3 + (abs(hashtextextended(se.id::text || pr.n, 3)) % 10) as saldo,
                          (abs(hashtextextended(se.id::text || pr.n, 5)) % 10000) / 10000.0 as r,
                          0.025 + (case when se.sidx = 3 then 0.06 else 0 end) + (case when pr.n % 17 = 0 then 0.10 else 0 end) as p,
                          (abs(hashtextextended(se.id::text || pr.n, 9)) % 100) < 75 as neg,
                          1 + (case when abs(hashtextextended(se.id::text || pr.n, 11)) % 4 = 0 then 1 else 0 end) as mag,
                          row_number() over (partition by se.id order by pr.n) as k
                     from _rqa_ses se join _rqa_prod pr on (pr.n % 6) <> (se.sidx % 6)) z`);
  await q(`insert into piefirme.ctl_partida_conteo (id, organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, nota, escaneado_en, creado_en, creado_por)
           select id, '${ORG}', sucursal_id, sesion_id, producto_id, cb, saldo + dif, case when dif <> 0 and pn % 7 = 0 then 'Se contó dos veces' end, ini + make_interval(secs => k * 7), ini + make_interval(secs => k * 7), auditor from _rqa_par`);
  await q(`insert into piefirme.ctl_partida_calculo (partida_id, organizacion_id, sucursal_id, sesion_id, producto_id, saldo_sistema, diferencia_piezas, costo_unitario, diferencia_valor, creado_en)
           select id, '${ORG}', sucursal_id, sesion_id, producto_id, saldo, dif, costo, dif * costo, ini + make_interval(secs => k * 7) from _rqa_par`);
  await q(`insert into piefirme.ctl_sesion_resultado (sesion_id, organizacion_id, sucursal_id, partidas_con_diferencia, valor_diferencia, valor_faltante, valor_sobrante, creado_en)
           select sesion_id, '${ORG}', sucursal_id, count(*) filter (where dif <> 0), coalesce(sum(dif * costo), 0), coalesce(sum(dif * costo) filter (where dif < 0), 0), coalesce(sum(dif * costo) filter (where dif > 0), 0), max(ini) + interval '11 minutes'
             from _rqa_par group by sesion_id, sucursal_id`);

  // casos: uno por diferencia, con el avance que tendría la operación (los viejos ya cerrados; los recientes abiertos)
  await q(`create temp table _rqa_caso on commit drop as
           select x.*, case
                    when dia > 25 then case when b < 38 then 'cerrada_sin_ajuste' when b < 68 then 'cerrada_con_ajuste' when b < 74 then 'rechazada' when b < 96 then 'en_investigacion' else 'abierta' end
                    else case when b < 45 then 'abierta' when b < 80 then 'en_investigacion' when b < 92 then 'cerrada_sin_ajuste' else 'cerrada_con_ajuste' end end as estado
             from (select pa.*, row_number() over (order by ini, sidx, pn)::integer as rn, abs(hashtextextended(pa.id::text, 13)) % 100 as b from _rqa_par pa where dif <> 0) x`);
  await q(`create temp table _rqa_causa on commit drop as select id, row_number() over (order by orden)::integer as n from piefirme.ctl_causa where organizacion_id = '${ORG}'`);
  await q(`insert into piefirme.ctl_caso (organizacion_id, folio, sucursal_id, tipo, origen_tipo, origen_id, producto_id, cantidad, valor, estado, asignado_a, fecha_compromiso, causa_id, responsable_costo, monto_costo,
                                          nota_cierre, usuario_captura, contexto, autorizado_por, autorizado_en, abierto_en, cerrado_en, creado_en)
           select '${ORG}', 'CAS-RQA-' || lpad(rn::text, 5, '0'), sucursal_id, 'diferencia_inventario', 'partida_conteo', id, producto_id, dif, dif * costo, estado,
                  case when estado <> 'abierta' then '${S}'::uuid end, case when estado <> 'abierta' then (ini + interval '7 days')::date end,
                  case when estado like 'cerrada%' then (select ca.id from _rqa_causa ca where ca.n = 1 + (b % 7)) end,
                  case when estado like 'cerrada%' then (array['empresa', 'empresa', 'proveedor', 'seguro'])[1 + (b % 4)] end,
                  case when estado like 'cerrada%' then round(abs(dif * costo) * (case when b % 4 = 0 then 0.5 else 1 end), 2) end,
                  case when estado like 'cerrada%' then 'Caso de la semilla de reportes (dato de prueba).' end, auditor,
                  jsonb_build_object('sesion_id', sesion_id, 'modo', 'conteo_apertura', 'partida_id', id, 'descripcion', nombre, 'costo_unitario', costo, 'cantidad_fisica', saldo + dif, 'saldo_al_contar', saldo),
                  case when estado = 'cerrada_con_ajuste' then '${M}'::uuid end, case when estado = 'cerrada_con_ajuste' then ini + interval '3 days' end,
                  ini, case when estado like 'cerrada%' or estado = 'rechazada' then least(now(), ini + make_interval(days => (2 + b % 9)::int)) end, ini
             from _rqa_caso`);
  await q(`insert into piefirme.ctl_caso_bitacora (organizacion_id, sucursal_id, caso_id, usuario_id, tipo, texto, estado_nuevo, creado_en)
           select '${ORG}', k.sucursal_id, k.id, null, 'cambio_estado', 'Caso abierto automáticamente por la semilla de reportes (dato de prueba).', 'abierta', k.abierto_en
             from piefirme.ctl_caso k where k.organizacion_id = '${ORG}' and k.folio like 'CAS-RQA-%'`);

  // cierres de día de los días pasados (una sucursal falla algunos días) y una entrega pendiente para el tablero
  await q(`insert into piefirme.ctl_cierre (organizacion_id, folio, sucursal_id, tipo, usuario_cierra, estado, abierto_en, cerrado_en, aceptado_en, creado_en)
           select '${ORG}', 'CIE-RQA-' || lpad(row_number() over (order by dia desc, sidx)::text, 5, '0'), sucursal_id, 'dia', auditor, 'cerrado', ini + interval '11 hours 30 minutes', ini + interval '12 hours', ini + interval '12 hours', ini + interval '11 hours 30 minutes'
             from _rqa_ses where dia >= 1 and not (sidx = 4 and dia % 9 = 0)`);
  await q(`insert into piefirme.ctl_cierre (id, organizacion_id, folio, sucursal_id, tipo, usuario_cierra, estado, abierto_en, cerrado_en, creado_en)
           select gen_random_uuid(), '${ORG}', 'CIE-RQA-T' || lpad(n::text, 4, '0'), id, 'turno', '${R}'::uuid, 'entrega_no_aceptada', now() - interval '20 hours', now() - interval '19 hours', now() - interval '20 hours'
             from _rqa_sede where n in (2, 6)`);
  await q(`insert into piefirme.ctl_entrega (organizacion_id, sucursal_id, cierre_id, usuario_entrega, monto_entregado, entregado_en, estado, creado_en)
           select '${ORG}', c.sucursal_id, c.id, '${R}'::uuid, 3500 + 100 * (abs(hashtextextended(c.folio, 1)) % 20), now() - interval '19 hours', 'pendiente', now() - interval '19 hours'
             from piefirme.ctl_cierre c where c.organizacion_id = '${ORG}' and c.folio like 'CIE-RQA-T%'`);
  // una auditoría remota en curso (sucursal 2): 20 productos pedidos, 7 ya reportados
  await q(`create temp table _rqa_rem on commit drop as select gen_random_uuid() as id, id as sucursal_id from _rqa_sede where n = 2`);
  await q(`insert into piefirme.ctl_sesion_conteo (id, organizacion_id, folio, sucursal_id, tipo, modo_lista, estado, solicitada_por, solicitada_en, limite_en, abierta_en, recibida_en, tamano_muestra, usuario_captura, total_partidas, creado_en, creado_por)
           select id, '${ORG}', 'SES-RQA-R0001', sucursal_id, 'auditoria_remota', 'aleatoria', 'abierta', '${M}'::uuid, now() - interval '25 minutes', now() + interval '95 minutes', now() - interval '25 minutes', now() - interval '20 minutes', 20, '${R}'::uuid, 7, now() - interval '25 minutes', '${M}'::uuid from _rqa_rem`);
  await q(`insert into piefirme.ctl_lista_solicitada (organizacion_id, sucursal_id, sesion_id, producto_id, reportado, orden, creado_en)
           select '${ORG}', r.sucursal_id, r.id, pr.id, pr.n <= 7, pr.n, now() - interval '25 minutes' from _rqa_rem r cross join (select id, n from _rqa_prod where n <= 20) pr`);
  await q(`insert into piefirme.ctl_partida_conteo (organizacion_id, sucursal_id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, escaneado_en, creado_en, creado_por)
           select '${ORG}', r.sucursal_id, r.id, pr.id, pr.cb, 4, now() - interval '18 minutes', now() - interval '18 minutes', '${R}'::uuid from _rqa_rem r cross join (select id, cb, n from _rqa_prod where n <= 7) pr`);

  let nVentas = 0;
  if (ventas) {
    // turnos, tickets, líneas y pagos del origen (5–12 tickets diarios por sucursal). El cajero p@g.com cobra a veces por debajo del catálogo y sin motivo;
    // la sucursal 6 cobra más en efectivo. Todo es dato de prueba marcado con folios «RQA-T-».
    await q(`create temp table _rqa_turno on commit drop as
             select gen_random_uuid() as id, se.sucursal_id, se.sidx, se.dia, se.ini, se.auditor as cajero from _rqa_ses se`);
    await q(`insert into piefirme.turnos_caja (id, organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial, estado, cierre_en, created_at)
             select id, '${ORG}', sucursal_id, 'Caja 1', 'Matutino', cajero, ini - interval '30 minutes', 500, 'cerrado', ini + interval '11 hours', ini - interval '30 minutes' from _rqa_turno where dia >= 1`);
    await q(`insert into piefirme.turnos_caja (id, organizacion_id, sede_id, caja, nombre_turno, cajero_id, apertura_en, fondo_inicial, estado, created_at)
             select id, '${ORG}', sucursal_id, 'Caja 1', 'Matutino', cajero, ini - interval '30 minutes', 500, 'abierto', ini - interval '30 minutes' from _rqa_turno where dia = 0`);
    await q(`create temp table _rqa_venta on commit drop as
             select gen_random_uuid() as id, t.id as turno_id, t.sucursal_id, t.sidx, t.dia, t.cajero, k.k,
                    t.ini + make_interval(mins => (30 + k.k * 41)::int) as cuando,
                    1 + (abs(hashtextextended(t.id::text || k.k, 21)) % 3) as nlineas
               from _rqa_turno t cross join lateral generate_series(1, 5 + (abs(hashtextextended(t.id::text, 20)) % 8)) k(k)`);
    await q(`delete from _rqa_venta where cuando > now() - interval '5 minutes'`);
    await q(`alter table _rqa_venta add column rn integer; update _rqa_venta x set rn = y.rn from (select id, row_number() over (order by cuando, sidx)::integer as rn from _rqa_venta) y where y.id = x.id`);
    await q(`create temp table _rqa_lin on commit drop as
             select gen_random_uuid() as id, v.id as venta_id, v.sucursal_id, l.l as orden, pr.id as producto_id, pr.nombre, pr.costo, round(pr.costo * 1.9) as catalogo,
                    case when abs(hashtextextended(v.id::text || l.l, 24)) % 100 < 15 then 2 else 1 end as cantidad,
                    (v.cajero = '${P}'::uuid and abs(hashtextextended(v.id::text || l.l, 25)) % 100 < 14) as bajo,
                    abs(hashtextextended(v.id::text || l.l, 26)) % 100 as b
               from _rqa_venta v cross join lateral generate_series(1, v.nlineas) l(l)
               join _rqa_prod pr on pr.n = 1 + (abs(hashtextextended(v.id::text || l.l, 23)) % 120)`);
    await q(`alter table _rqa_lin add column cobrado numeric; update _rqa_lin set cobrado = case when bajo then round(catalogo * (case when b % 3 = 0 then 0.7 else 0.5 end)) else catalogo end`);
    await q(`create temp table _rqa_aut on commit drop as
             select gen_random_uuid() as id, l.id as linea_id from _rqa_lin l where l.bajo and l.b % 3 = 0`);
    await q(`insert into piefirme.autorizaciones_admin (id, organizacion_id, tipo, solicitante_id, autorizador_id, motivo) select id, '${ORG}', 'descuento', '${P}'::uuid, '${M}'::uuid, 'Autorización de la semilla de reportes' from _rqa_aut`);
    await q(`insert into piefirme.ventas (id, organizacion_id, sede_id, folio, estado, turno_id, cajero_id, subtotal, total, pagado_total, cobrada_en, created_at, created_by)
             select v.id, '${ORG}', v.sucursal_id, 'RQA-T-' || lpad(v.rn::text, 6, '0'), 'cobrada', v.turno_id, v.cajero, x.tot, x.tot, x.tot, v.cuando, v.cuando, v.cajero
               from _rqa_venta v join (select venta_id, sum(cantidad * cobrado) as tot from _rqa_lin group by venta_id) x on x.venta_id = v.id`);
    await q(`insert into piefirme.venta_lineas (id, organizacion_id, sede_id, venta_id, orden, tipo, producto_id, descripcion, iva_tipo, cantidad, precio_unitario, tipo_precio, descuento_monto, descuento_motivo,
                                                autorizacion_descuento_id, importe_bruto, descuento, importe, created_at)
             select l.id, '${ORG}', l.sucursal_id, l.venta_id, l.orden, 'producto', l.producto_id, l.nombre, 'exento', l.cantidad, l.catalogo, 'fijo', (l.catalogo - l.cobrado) * l.cantidad,
                    case when l.bajo and l.b % 3 = 0 then 'Cortesía' when l.bajo and l.b % 3 = 1 then 'Cliente frecuente' end,
                    (select a.id from _rqa_aut a where a.linea_id = l.id), l.catalogo * l.cantidad, (l.catalogo - l.cobrado) * l.cantidad, l.cobrado * l.cantidad, v.cuando
               from _rqa_lin l join _rqa_venta v on v.id = l.venta_id`);
    await q(`insert into piefirme.pagos (organizacion_id, sede_id, venta_id, metodo, monto, created_at)
             select '${ORG}', v.sucursal_id, v.id, case
                        when (abs(hashtextextended(v.id::text, 30)) % 100) < (case when v.sidx = 6 then 68 else 38 end) then 'efectivo'
                        when (abs(hashtextextended(v.id::text, 30)) % 100) < (case when v.sidx = 6 then 80 else 68 end) then 'tarjeta'
                        when (abs(hashtextextended(v.id::text, 30)) % 100) < (case when v.sidx = 6 then 88 else 80 end) then 'clip'
                        else 'transferencia' end, x.tot, v.cuando
               from _rqa_venta v join (select venta_id, sum(cantidad * cobrado) as tot from _rqa_lin group by venta_id) x on x.venta_id = v.id`);
    nVentas = (await q(`select count(*)::int as n from _rqa_venta`)).rows[0].n;
  }
  const conteos = (await q(`select (select count(*) from _rqa_ses)::int as sesiones, (select count(*) from _rqa_par)::int as partidas, (select count(*) from _rqa_caso)::int as casos`)).rows[0];
  await c.query("set local session_replication_role = origin");

  if (alertas) {   // con los triggers activos: el despacho (techo diario, agrupación) queda ejercitado por la semilla
    const sedes = (await q(`select id, n from _rqa_sede order by n`)).rows;
    const [s1, s2, s3, s4, s5, s6] = sedes.map((x) => x.id);
    const A = (suc, tipo, msg, rt, rid) => c.query("select piefirme_app.ctl_alerta_nueva($1, $2, $3, $4, $5, $6)", [ORG, suc, tipo, msg, rt, rid]);
    await A(s3, "sin_cierre", "RQA Centro: la sucursal ya operó hoy y no hay cierre registrado (dato de prueba).", "dia:semilla", s3);
    await A(s6, "cierre_fuera_tolerancia", "RQA Plaza: el cierre CIE-RQA-00001 tiene 1 punto(s) fuera de tolerancia (dato de prueba).", "cierre", s6);
    await A(s2, "posible_sustitucion_codigo", "RQA Sur: posible sustitución de código en una sesión de la semilla (dato de prueba).", "caso", s2);
    await A(s5, "folio_faltante", "RQA Poniente: falta el folio 17 del talonario T-04 (dato de prueba).", "talonario", s5);
    await A(s4, "ajuste_fallido", "RQA Oriente: el origen rechazó el ajuste de un caso de la semilla (dato de prueba).", "caso", s4);
    await A(s1, "sesion_con_diferencias", "RQA Norte: un conteo cerró con diferencias (dato de prueba).", "sesion_conteo", s1);
  }
  return { yaExiste: false, dias: D, ventas: nVentas, ...conteos };
}

/** Borra TODO lo marcado RQA (sin triggers: es mantenimiento de datos de prueba como dueño de la base). */
export async function quitar(c) {
  await c.query("reset role");
  await c.query("set local session_replication_role = replica");
  await c.query("set local app.ctl_purga = 'on'");
  const sedes = `(select id from piefirme.sedes where organizacion_id = '${ORG}' and clave like 'RQA_')`;
  const prods = `(select id from piefirme.productos where organizacion_id = '${ORG}' and sku like 'RQA-P%')`;
  const out = {};
  const del = async (nombre, sql) => { out[nombre] = (await c.query(sql)).rowCount; };
  await del("envios", `delete from piefirme.ctl_alerta_envio where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("alertas", `delete from piefirme.ctl_alerta where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("caso_bitacora", `delete from piefirme.ctl_caso_bitacora where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("casos", `delete from piefirme.ctl_caso where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("partida_calculo", `delete from piefirme.ctl_partida_calculo where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("partidas", `delete from piefirme.ctl_partida_conteo where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("resultado", `delete from piefirme.ctl_sesion_resultado where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("lista", `delete from piefirme.ctl_lista_solicitada where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("sesiones", `delete from piefirme.ctl_sesion_conteo where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("entregas", `delete from piefirme.ctl_entrega where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("cierres", `delete from piefirme.ctl_cierre where organizacion_id = '${ORG}' and sucursal_id in ${sedes}`);
  await del("pagos", `delete from piefirme.pagos where organizacion_id = '${ORG}' and sede_id in ${sedes}`);
  await del("venta_lineas", `delete from piefirme.venta_lineas where organizacion_id = '${ORG}' and sede_id in ${sedes}`);
  await del("ventas", `delete from piefirme.ventas where organizacion_id = '${ORG}' and sede_id in ${sedes}`);
  await del("autorizaciones", `delete from piefirme.autorizaciones_admin where organizacion_id = '${ORG}' and motivo = 'Autorización de la semilla de reportes'`);
  await del("turnos", `delete from piefirme.turnos_caja where organizacion_id = '${ORG}' and sede_id in ${sedes}`);
  await del("precios", `delete from piefirme.precios where organizacion_id = '${ORG}' and producto_id in ${prods}`);
  await del("productos", `delete from piefirme.productos where organizacion_id = '${ORG}' and sku like 'RQA-P%'`);
  await del("sedes", `delete from piefirme.sedes where organizacion_id = '${ORG}' and clave like 'RQA_'`);
  await c.query("set local session_replication_role = origin");
  return out;
}
