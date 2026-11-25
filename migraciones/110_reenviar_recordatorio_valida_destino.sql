-- 110 · «Reenviar recordatorio» no programa un mensaje que no tiene a quién llegar.
-- Hallazgo del video de lista de espera y recordatorios (lote D, VID-D4): con el canal por defecto «correo» y una paciente que solo tiene teléfono,
-- reenviar_recordatorio insertaba la fila como «programado» con destino vacío (la cola mostraba «Programado» y destino «—»), un mensaje que nunca podría salir.
-- Ahora, si el canal no tiene destino en la ficha del paciente, rechaza la operación con un mensaje claro y no deja nada en la cola.
-- No cambia el resto de la lógica (permisos, consentimiento P-148, tipo «confirmación»). Depende de: 028.
-- Pendiente de decisión del dueño (no se resuelve aquí): qué canal alterno usar cuando el paciente no tiene correo (P-039).
set search_path = piefirme, piefirme_app, extensions;

create or replace function piefirme.reenviar_recordatorio(p_cita uuid, p_canal text default null) returns uuid
language plpgsql security invoker set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare c piefirme.citas%rowtype; p piefirme.pacientes%rowtype; v_canal text; v_dest text; v_id uuid;
begin
  if piefirme_app.rol() not in ('administrador', 'recepcion') then raise exception 'sin permiso' using errcode = 'PF403'; end if;
  select * into c from piefirme.citas where id = p_cita;
  if not found then raise exception 'cita inexistente o fuera de alcance' using errcode = 'PF404'; end if;
  select * into p from piefirme.pacientes where id = c.paciente_id;
  if not coalesce(p.acepta_recordatorios, true) then raise exception 'el paciente no autorizó recordatorios (P-148)' using errcode = 'PF409'; end if;
  v_canal := coalesce(p_canal, piefirme_app.param_txt(c.organizacion_id, 'recordatorio_canal', 'correo'));
  v_dest := case when v_canal = 'correo' then p.email else p.telefono_celular end;
  if v_dest is null or btrim(v_dest) = '' then
    raise exception 'El paciente no tiene % registrado para enviarle el recordatorio por este canal; captura el dato en su ficha o elige otro canal',
      case when v_canal = 'correo' then 'correo electrónico' else 'teléfono celular' end using errcode = 'PF409';
  end if;
  insert into piefirme.recordatorios (organizacion_id, sede_id, cita_id, paciente_id, tipo, canal, destino, programado_para)
  values (c.organizacion_id, c.sede_id, c.id, c.paciente_id, 'confirmacion', v_canal, v_dest, now())
  returning id into v_id;
  return v_id;
end $$;
