-- 151 · Fotos clínicas de seguimiento sin consulta (decidido por el dueño 2026-11-25)
-- La foto de evolución (pisada, uña, úlcera…) se toma en cualquier visita, aunque no haya una consulta abierta.
-- Con consulta se liga a ella; sin consulta queda como «foto de seguimiento» ligada al paciente, a la sede, a quién la tomó y a la fecha.
-- Siguen exigiéndose la autorización vigente de fotografías clínicas (CD-19) y la de docencia cuando aplica (P-009).

alter table piefirme.fotos_clinicas alter column consulta_id drop not null;

create or replace function piefirme_app.foto_bi() returns trigger language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_c record; v_n integer; v_limite integer;
begin
  if tg_op = 'INSERT' then
    if new.consulta_id is not null then
      select paciente_id, organizacion_id, sede_id into v_c from piefirme.consultas where id = new.consulta_id;
      if v_c.organizacion_id is distinct from new.organizacion_id or v_c.paciente_id <> new.paciente_id then
        raise exception 'La consulta no corresponde al paciente' using errcode = 'P0001';
      end if;
      new.sede_id := coalesce(new.sede_id, v_c.sede_id);
    elsif new.sede_id is null then
      raise exception 'La foto de seguimiento necesita la sede' using errcode = 'P0001';
    end if;
    if split_part(new.archivo_path, '/', 1) <> new.organizacion_id::text then
      raise exception 'La ruta del archivo debe iniciar con el id de la clínica' using errcode = 'P0001';
    end if;
    -- autorización vigente al subir (CD-19)
    if not exists (select 1 from piefirme.consentimientos c where c.paciente_id = new.paciente_id and c.tipo = 'fotos_clinicas' and c.estado = 'firmado' and c.aceptado) then
      raise exception 'El paciente no tiene autorización vigente de fotografías clínicas' using errcode = 'P0001';
    end if;
    if new.nivel_autorizacion = 'docencia'
       and not exists (select 1 from piefirme.consentimientos c where c.paciente_id = new.paciente_id and c.tipo = 'fotos_docencia' and c.estado = 'firmado' and c.aceptado) then
      raise exception 'Sin autorización escrita vigente para docencia o difusión (P-009)' using errcode = 'P0001';
    end if;
    if new.consulta_id is not null then
      select coalesce((o.parametros ->> 'fotos_max_por_sesion')::int, 10) into v_limite from piefirme.organizaciones o where o.id = new.organizacion_id;
      select count(*) into v_n from piefirme.fotos_clinicas f where f.consulta_id = new.consulta_id and not f.retirada;
      if v_n >= v_limite and not new.confirmo_excedente then
        raise exception 'Ya hay % fotos en la sesión: confirme para agregar otra (límite blando, P-007)', v_n using errcode = 'P0001';
      end if;
    end if;
    new.retirada := false; new.retirada_motivo := null; new.retirada_por := null; new.retirada_en := null;
  else
    -- Solo se edita comentario/anotaciones/vínculos; el archivo y su evidencia no cambian.
    if new.archivo_path <> old.archivo_path or new.hash_sha256 is distinct from old.hash_sha256 or new.paciente_id <> old.paciente_id
       or new.consulta_id is distinct from old.consulta_id or new.organizacion_id <> old.organizacion_id or new.tomada_en <> old.tomada_en then
      raise exception 'El archivo de una foto clínica no se reemplaza ni se reasigna' using errcode = 'P0001';
    end if;
    if new.retirada and not old.retirada then
      if length(btrim(coalesce(new.retirada_motivo, ''))) < 3 then raise exception 'El motivo de retiro es obligatorio (P-008)' using errcode = 'P0001'; end if;
      new.retirada_por := coalesce(auth.uid(), new.retirada_por);
      new.retirada_en := now();
    elsif old.retirada and not new.retirada and not piefirme_app.es_admin() then
      raise exception 'Solo Administración reactiva una foto retirada' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
