-- C_04 · Semilla SINTÉTICA (dominio C): EDR por sede y mes (agosto, septiembre y octubre 2026) con proyecciones manuales, ajustes y cierres de semana y de mes.
-- DEBE EXISTIR ANTES: migraciones 001-049 · B_02 (cobros → ingresos) · C_01 (compras) · C_02 (gastos) · C_03 (conciliación). Esta semilla va al final del dominio C.
-- Regla (P-090, CONFIRMADO POR EL DUEÑO): proy_ se captura a mano con piefirme.edr_guardar_proyeccion (nunca lo escribe el recálculo); real_ lo calcula el sistema
-- a partir de ingresos (base sin IVA, fecha de pago) y gastos (fondo revolvente en su renglón; compartidos prorrateados por proporción de ingresos).
-- Rol que omita RLS; simula al administrador con request.jwt.claim.sub. Cierres: semanas hasta el viernes 9-oct (las del 10 al 23 quedan «por cerrar») y los meses de agosto y septiembre.
-- Idempotente de forma gruesa: si ya hay periodos del EDR con proyecciones, no hace nada.

do $$
declare
  o   constant uuid := '00000000-0000-0000-0000-00000000c0de';
  adm constant uuid := 'a0000000-0000-0000-0000-000000000001';
  v_m record; v_l record; v_w date; v_s record; v_factor numeric; v_dias numeric;
begin
  if exists (select 1 from piefirme.edr_lineas where organizacion_id = o and proy_importe <> 0) then raise notice 'C_04: ya aplicada'; return; end if;
  perform set_config('request.jwt.claim.sub', adm::text, true);

  -- 1 · real_ automático de los 3 meses
  for v_m in select * from (values (2026, 8), (2026, 9), (2026, 10)) x(a, mes) loop
    perform piefirme.edr_recalcular(v_m.a, v_m.mes);
  end loop;

  -- 2 · proyecciones manuales por sede, mes y renglón: lo real ± un margen de planeación (octubre se proyecta al mes completo)
  for v_m in select * from (values (2026, 8, 31), (2026, 9, 30), (2026, 10, 31)) x(a, mes, dias) loop
    v_dias := case when v_m.mes = 10 then 31.0 / 25 else 1 end;   -- octubre va al 25: solo los ingresos se proyectan al mes completo
    for v_l in select e.sede_id, r.clave, r.tipo, e.real_importe
               from piefirme.edr_lineas e join piefirme.edr_periodos pe on pe.id = e.periodo_id join piefirme.edr_renglones r on r.id = e.renglon_id
              where e.organizacion_id = o and pe.anio = v_m.a and pe.mes = v_m.mes and r.tipo in ('ingreso', 'gasto', 'fijo') and e.real_importe <> 0 loop
      -- ingresos: se proyectaba ~4 % más de lo logrado; gastos: ~2 % menos; fijos: exactos
      v_factor := case v_l.tipo when 'ingreso' then 1.04 + ((abs(hashtext(v_l.sede_id::text || v_l.clave || v_m.mes)) % 9) - 4) / 100.0
                              when 'gasto' then 0.98 + ((abs(hashtext(v_l.sede_id::text || v_l.clave || v_m.mes)) % 7) - 3) / 100.0 else 1 end;
      perform piefirme.edr_guardar_proyeccion(v_l.sede_id, v_m.a, v_m.mes, v_l.clave, round(v_l.real_importe * v_factor * case when v_l.tipo = 'ingreso' then v_dias else 1 end, -2));
    end loop;
  end loop;
  -- 3 · un ajuste manual con motivo (E116): corrección de un gasto de papelería capturado en Chalco
  insert into piefirme.edr_ajustes (organizacion_id, sede_id, periodo_id, renglon_id, importe, motivo)
  select o, pe.sede_id, pe.id, r.id, -150, 'Corrección de un ticket duplicado de papelería (sintético)'
    from piefirme.edr_periodos pe join piefirme.sedes s on s.id = pe.sede_id and s.clave = 'CHA' join piefirme.edr_renglones r on r.organizacion_id = o and r.clave = 'otros_gastos'
   where pe.organizacion_id = o and pe.anio = 2026 and pe.mes = 10;

  -- 4 · cierres de semana (sábado → viernes) por sede hasta el viernes 9-oct; las de después quedan «por cerrar»
  for v_w in select g::date from generate_series(date '2026-08-01', date '2026-10-03', interval '7 days') g loop
    for v_s in select id from piefirme.sedes where organizacion_id = o order by clave loop
      perform piefirme.cerrar_periodo('semana', v_w, v_s.id);
    end loop;
  end loop;
  -- 5 · cierre de mes de agosto y septiembre (toda la clínica); octubre sigue abierto
  perform piefirme.cerrar_periodo('mes', date '2026-08-15', null);
  perform piefirme.cerrar_periodo('mes', date '2026-09-15', null);
  raise notice 'C_04: EDR % líneas, % cierres', (select count(*) from piefirme.edr_lineas where organizacion_id = o), (select count(*) from piefirme.cierres_periodo where organizacion_id = o);
end $$;
