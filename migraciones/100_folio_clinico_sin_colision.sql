-- 100 · Folios clínicos sin colisión entre sedes con la misma clave de 3 letras.
-- Hallazgo del video de plantillas ortopédicas (lote C): el folio se arma con las 3 primeras letras de la clave de la sede y un contador POR SEDE.
-- Dos sedes de una misma clínica con claves parecidas ("CHA" y "chalco" → CHA) generan el mismo folio y la restricción unique (organizacion_id, folio)
-- de órdenes de plantilla, quejas, lotes de esterilización, consultas, planes y documentos rechazaba el guardado con «Ya existe un registro con esos datos».
-- La función ya saltaba folios ocupados solo para expedientes (N-08); ahora lo hace para todos los tipos, revisando la tabla que lleva ese folio.
-- No cambia el formato ni los folios ya emitidos. Depende de: 010.
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme_app.siguiente_folio_clinico(p_sede uuid, p_tipo text) returns text
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid; v_clave text; v_n bigint; v_folio text; v_tabla text; v_col text; v_ocupado boolean;
begin
  select organizacion_id, clave into v_org, v_clave from piefirme.sedes where id = p_sede;
  if v_org is null then raise exception 'La sede % no existe', p_sede using errcode = 'P0001'; end if;
  select t, c into v_tabla, v_col from (values
    ('EXP', 'pacientes', 'numero_expediente'), ('CON', 'consultas', 'folio'), ('PLA', 'planes_tratamiento', 'folio'),
    ('ORT', 'ordenes_plantilla', 'folio'), ('EST', 'lotes_esterilizacion', 'lote'), ('QJ', 'quejas', 'folio'), ('DOC', 'documentos_emitidos', 'folio')
  ) as m(k, t, c) where m.k = p_tipo;
  loop
    insert into piefirme.secuencias_clinicas (organizacion_id, sede_id, tipo, ultimo) values (v_org, p_sede, p_tipo, 1)
    on conflict (sede_id, tipo) do update set ultimo = piefirme.secuencias_clinicas.ultimo + 1
    returning ultimo into v_n;
    v_folio := upper(left(v_clave, 3)) || '-' || p_tipo || '-' || lpad(v_n::text, 6, '0');
    -- si el número ya existe (expediente conservado al migrar, o la clave de otra sede de la misma clínica produce el mismo prefijo), se salta al siguiente libre
    if v_tabla is null then exit; end if;
    execute format('select exists (select 1 from piefirme.%I where organizacion_id = $1 and %I = $2)', v_tabla, v_col) into v_ocupado using v_org, v_folio;
    exit when not v_ocupado;
  end loop;
  return v_folio;
end $$;
revoke all on function piefirme_app.siguiente_folio_clinico(uuid, text) from public, anon;
grant execute on function piefirme_app.siguiente_folio_clinico(uuid, text) to authenticated;
