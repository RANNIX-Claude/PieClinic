-- 221 · Control y Auditoría · ETAPA 3 · CASOS (2/3): RPC del ciclo de vida, cierre y autorización del ajuste.
--   abierta → en_investigacion → cerrada_con_ajuste | cerrada_sin_ajuste | rechazada      (+ ajuste_fallido, reintentable)
-- Todas son SECURITY DEFINER y validan EN EL SERVIDOR sesión, clínica activa y capacidad (ctl_exigir). Todo cambio escribe en ctl_caso_bitacora
-- (solo inserción). Ninguna toca el inventario salvo la autorización, que es la única que llama a ctl_solicitar_ajuste_origen: mientras el caso
-- esté abierto el saldo NO se mueve.
-- Un caso NUNCA se captura a mano: aquí no hay alta; los casos nacen en ctl_abrir_caso (conteos) y en el cierre de los cierres (Etapa 4).
-- RESPONSABLE DEL COSTO «empleado»: es un REGISTRO DE CONTROL INTERNO. No es una instrucción de descuento a nómina (la Ley Federal del Trabajo
-- restringe fuertemente los descuentos al salario y un faltante de inventario no basta para justificar uno). No hay ni habrá aquí integración con
-- nómina ni un botón que la sugiera.
-- SUSTITUCIÓN DE CÓDIGO (F2.5): el caso del faltante caro es el PRINCIPAL y lleva al del sobrante barato. Todas las acciones se hacen sobre el
-- principal y se reflejan en la contraparte; el ajuste del par se aplica en UNA sola subtransacción (los dos movimientos o ninguno).
-- Depende de: 200–206, 210–213, 220.
set search_path = piefirme, piefirme_app, extensions;

-- ───────────────────────────── asignar / tomar (responsable con fecha compromiso) ─────────────────────────────
create or replace function piefirme.ctl_caso_asignar(p_caso uuid, p_usuario uuid, p_fecha_compromiso date, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_hoy date; v_nom text; v_nuevo text; v_texto text;
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  perform piefirme_app.ctl_caso_exigir_principal(k);
  if not piefirme_app.ctl_caso_es_abierto(k.estado) then raise exception 'El caso está % y ya no admite asignación.', k.estado using errcode = 'PF409'; end if;
  if p_usuario is null then raise exception 'Indique quién investiga el caso.' using errcode = 'PF400'; end if;
  v_hoy := piefirme_app.ctl_hoy(v_org);
  if p_fecha_compromiso is null then raise exception 'La fecha compromiso es obligatoria.' using errcode = 'PF422'; end if;
  if p_fecha_compromiso < v_hoy then raise exception 'La fecha compromiso no puede estar en el pasado.' using errcode = 'PF422'; end if;
  if p_fecha_compromiso > v_hoy + 180 then raise exception 'La fecha compromiso no puede pasar de 180 días.' using errcode = 'PF422'; end if;
  select trim(p.nombre || ' ' || coalesce(p.apellidos, '')) into v_nom from piefirme.perfiles p
   where p.id = p_usuario and p.organizacion_id = v_org and p.activo and p.rol::text in ('administrador', 'supervisor')
     and not exists (select 1 from piefirme.rannix_staff r where r.user_id = p.id)
     and (cardinality(p.sedes) = 0 or k.sucursal_id = any (p.sedes));
  if not found then raise exception 'Solo se puede asignar a un dueño o supervisor activo con acceso a la sucursal del caso.' using errcode = 'PF422'; end if;

  s := piefirme_app.ctl_caso_par(k);
  perform piefirme_app.ctl_rpc_on();
  v_nuevo := case when k.estado = 'abierta' then 'en_investigacion' else k.estado end;
  update piefirme.ctl_caso set asignado_a = p_usuario, fecha_compromiso = p_fecha_compromiso, estado = v_nuevo where id = k.id;
  v_texto := 'Asignado a ' || coalesce(v_nom, '—') || ' con fecha compromiso ' || to_char(p_fecha_compromiso, 'DD/MM/YYYY') || case when btrim(coalesce(p_nota, '')) <> '' then '. ' || btrim(p_nota) else '' end;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'asignacion', v_texto, null, null,
                                    jsonb_build_object('asignado_a', p_usuario, 'asignado_nombre', v_nom, 'fecha_compromiso', p_fecha_compromiso, 'anterior', k.asignado_a));
  if v_nuevo <> k.estado then
    perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'cambio_estado', 'Pasa a investigación', k.estado, v_nuevo);
  end if;
  if s.id is not null then
    update piefirme.ctl_caso set asignado_a = p_usuario, fecha_compromiso = p_fecha_compromiso, estado = case when estado = 'abierta' then 'en_investigacion' else estado end where id = s.id;
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'asignacion', v_texto || ' (par de sustitución de código con ' || k.folio || ')', null, null,
                                      jsonb_build_object('asignado_a', p_usuario, 'fecha_compromiso', p_fecha_compromiso, 'principal', k.folio));
    if s.estado = 'abierta' then perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'cambio_estado', 'Pasa a investigación junto con su par', 'abierta', 'en_investigacion'); end if;
  end if;
  return jsonb_build_object('ok', true, 'estado', v_nuevo, 'asignado_a', p_usuario, 'fecha_compromiso', p_fecha_compromiso);
end $$;

-- «Tomar el caso»: asignárselo a sí mismo (sin pisar a quien ya lo investiga) con fecha compromiso a 7 días por omisión.
create or replace function piefirme.ctl_caso_tomar(p_caso uuid, p_fecha_compromiso date default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype;
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  if k.asignado_a is not null and k.asignado_a <> auth.uid() and piefirme_app.ctl_caso_es_abierto(k.estado) and k.estado <> 'abierta' then
    raise exception 'El caso ya lo investiga %. Use «Reasignar» si debe cambiar de responsable.', coalesce(piefirme_app.ctl_nombre_usuario(k.asignado_a), 'otra persona') using errcode = 'PF409';
  end if;
  return piefirme.ctl_caso_asignar(p_caso, auth.uid(), coalesce(p_fecha_compromiso, piefirme_app.ctl_hoy(v_org) + 7), p_nota);
end $$;

-- ───────────────────────────── comentar y adjuntar evidencia ─────────────────────────────
create or replace function piefirme.ctl_caso_comentar(p_caso uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; v_t text := btrim(coalesce(p_texto, ''));
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  if not piefirme_app.ctl_caso_es_abierto(k.estado) then raise exception 'El caso está % : la bitácora ya no admite comentarios.', k.estado using errcode = 'PF409'; end if;
  if length(v_t) < 3 then raise exception 'El comentario no puede estar vacío.' using errcode = 'PF422'; end if;
  if length(v_t) > 2000 then raise exception 'El comentario no puede pasar de 2,000 caracteres.' using errcode = 'PF422'; end if;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'comentario', v_t);
  return jsonb_build_object('ok', true);
end $$;

-- Foto de remisión, nota de compra, etc. Se registra en ctl_evidencia (hash sha256, hora del servidor, sin galería: la misma regla de la Etapa 0)
-- ligada al caso, y se anota en la bitácora. Reenviar el mismo id no duplica nada.
create or replace function piefirme.ctl_caso_adjuntar_evidencia(p_caso uuid, p_id uuid, p_ruta text, p_hash text, p_bytes integer default null, p_ancho integer default null,
                                                                p_alto integer default null, p_hora_cliente timestamptz default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; v_id uuid := coalesce(p_id, gen_random_uuid()); v_ev jsonb;
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  if not piefirme_app.ctl_caso_es_abierto(k.estado) then raise exception 'El caso está % : ya no admite evidencia nueva.', k.estado using errcode = 'PF409'; end if;
  v_ev := piefirme.ctl_evidencia_registrar(v_id, k.sucursal_id, 'caso', k.id, p_ruta, p_hash, p_bytes, p_ancho, p_alto, p_hora_cliente, null);
  if coalesce((v_ev ->> 'duplicada')::boolean, false) then return v_ev; end if;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'evidencia', coalesce(nullif(btrim(p_nota), ''), 'Evidencia adjunta'), null, null,
                                    jsonb_build_object('ruta', p_ruta, 'hash_sha256', lower(p_hash)), v_id);
  return v_ev;
end $$;

-- ───────────────────────────── propuesta de cierre: causa, quién absorbe el costo, monto y nota ─────────────────────────────
-- La completa quien investiga (supervisor o dueño); la autorización con contraseña la hace después el dueño. Puede corregirse mientras el caso siga
-- abierto (cada guardado queda en la bitácora; nada se sobrescribe sin rastro).
create or replace function piefirme.ctl_caso_guardar_cierre(p_caso uuid, p_causa uuid, p_responsable text, p_monto numeric, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_causa text; v_tope numeric; v_monto numeric;
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  perform piefirme_app.ctl_caso_exigir_principal(k);
  if k.estado not in ('en_investigacion', 'ajuste_fallido') then
    raise exception '%', case when k.estado = 'abierta' then 'Tome el caso (pásalo a investigación) antes de proponer su cierre.' else 'El caso está ' || k.estado || ' y ya no admite cambios de cierre.' end using errcode = 'PF409';
  end if;
  v_causa := piefirme_app.ctl_caso_validar_causa(v_org, p_causa, p_nota);
  if p_responsable is null or p_responsable <> all (array['empresa', 'proveedor', 'empleado', 'seguro']) then
    raise exception 'Indique quién absorbe el costo: empresa, proveedor, empleado o seguro.' using errcode = 'PF422';
  end if;
  if p_monto is null or p_monto < 0 then raise exception 'El monto al costo es obligatorio y no puede ser negativo.' using errcode = 'PF422'; end if;
  v_monto := round(p_monto, 2);
  s := piefirme_app.ctl_caso_par(k);
  v_tope := round(piefirme_app.ctl_caso_tope_monto(k, s), 2);
  if v_monto > v_tope then raise exception 'El monto absorbido (%) no puede ser mayor al valor al costo del caso (%).', v_monto, v_tope using errcode = 'PF422'; end if;

  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_caso set causa_id = p_causa, responsable_costo = p_responsable, monto_costo = v_monto, nota_cierre = nullif(btrim(coalesce(p_nota, '')), '') where id = k.id;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'comentario',
          'Propuesta de cierre: causa «' || v_causa || '», absorbe ' || p_responsable || ' ' || to_char(v_monto, 'FM999,999,990.00') ||
          case when p_responsable = 'empleado' then ' (registro de control interno; no es instrucción de descuento a nómina)' else '' end ||
          case when btrim(coalesce(p_nota, '')) <> '' then '. ' || btrim(p_nota) else '' end, null, null,
          jsonb_build_object('accion', 'propuesta_cierre', 'causa_id', p_causa, 'causa', v_causa, 'responsable_costo', p_responsable, 'monto_costo', v_monto));
  if s.id is not null then
    update piefirme.ctl_caso set causa_id = p_causa, responsable_costo = p_responsable, monto_costo = 0, nota_cierre = nullif(btrim(coalesce(p_nota, '')), '') where id = s.id;
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'comentario', 'Propuesta de cierre del par (' || k.folio || '): causa «' || v_causa || '»', null, null,
                                      jsonb_build_object('accion', 'propuesta_cierre', 'principal', k.folio, 'causa_id', p_causa));
  end if;
  return jsonb_build_object('ok', true, 'causa', v_causa, 'responsable_costo', p_responsable, 'monto_costo', v_monto);
end $$;

-- ───────────────────────────── cerrar sin ajuste / rechazar / volver a investigar ─────────────────────────────
-- Cerrar sin ajuste: apareció la pieza, era error de conteo… Se registra la resolución y el saldo NO se toca. Exige causa del catálogo y una nota de
-- resolución. Decisión de diseño (revisable): quien capturó la diferencia no puede cerrarla ni rechazarla él mismo (si no, bastaría con descartar la propia
-- diferencia); igual que con la autorización, otra persona debe hacerlo. Dueño y supervisor pueden.
create or replace function piefirme.ctl_caso_cerrar_sin_ajuste(p_caso uuid, p_causa uuid, p_resolucion text, p_responsable text default null, p_monto numeric default 0) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_causa text; v_res text := btrim(coalesce(p_resolucion, '')); v_monto numeric := round(coalesce(p_monto, 0), 2); v_tope numeric;
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  perform piefirme_app.ctl_caso_exigir_principal(k);
  if k.estado <> 'en_investigacion' then
    raise exception '%', case when k.estado = 'abierta' then 'Tome el caso (pásalo a investigación) antes de cerrarlo.' when k.estado = 'ajuste_fallido' then 'El caso tiene un ajuste fallido: vuelva a investigarlo antes de cerrarlo sin ajuste.' else 'El caso está ' || k.estado || ' y ya no se puede cerrar.' end using errcode = 'PF409';
  end if;
  if piefirme_app.ctl_caso_capturista(k) = auth.uid() then
    raise exception 'Quien capturó la diferencia no puede cerrar su propio caso. Pida a otra persona autorizada que lo resuelva.' using errcode = 'PF403';
  end if;
  if length(v_res) < 10 then raise exception 'Registre la resolución (mínimo 10 caracteres): por qué se cierra sin ajuste.' using errcode = 'PF422'; end if;
  v_causa := piefirme_app.ctl_caso_validar_causa(v_org, p_causa, v_res);
  if p_responsable is not null and p_responsable <> all (array['empresa', 'proveedor', 'empleado', 'seguro']) then raise exception 'Responsable del costo no válido.' using errcode = 'PF422'; end if;
  if v_monto < 0 or (p_responsable is null and v_monto <> 0) then raise exception 'Sin responsable del costo, el monto debe ser cero.' using errcode = 'PF422'; end if;
  s := piefirme_app.ctl_caso_par(k);
  v_tope := round(piefirme_app.ctl_caso_tope_monto(k, s), 2);
  if v_monto > v_tope then raise exception 'El monto absorbido (%) no puede ser mayor al valor al costo del caso (%).', v_monto, v_tope using errcode = 'PF422'; end if;

  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_caso set estado = 'cerrada_sin_ajuste', causa_id = p_causa, responsable_costo = p_responsable, monto_costo = v_monto, nota_cierre = v_res, cerrado_en = now() where id = k.id;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'cambio_estado', 'Cerrado sin ajuste. Causa «' || v_causa || '». ' || v_res || ' El saldo de inventario no se modificó.', k.estado, 'cerrada_sin_ajuste',
                                    jsonb_build_object('accion', 'cierre_sin_ajuste', 'causa_id', p_causa, 'causa', v_causa, 'responsable_costo', p_responsable, 'monto_costo', v_monto));
  if s.id is not null then
    update piefirme.ctl_caso set estado = 'cerrada_sin_ajuste', causa_id = p_causa, responsable_costo = p_responsable, monto_costo = 0, nota_cierre = v_res, cerrado_en = now() where id = s.id;
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'cambio_estado', 'Cerrado sin ajuste junto con su par ' || k.folio || '. ' || v_res, s.estado, 'cerrada_sin_ajuste',
                                      jsonb_build_object('accion', 'cierre_sin_ajuste', 'principal', k.folio));
  end if;
  return jsonb_build_object('ok', true, 'estado', 'cerrada_sin_ajuste');
end $$;

-- Rechazar: el caso no procede (se abrió por error, está duplicado, el conteo fue inválido…). No mueve el saldo.
create or replace function piefirme.ctl_caso_rechazar(p_caso uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_m text := btrim(coalesce(p_motivo, ''));
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  perform piefirme_app.ctl_caso_exigir_principal(k);
  if k.estado <> 'en_investigacion' then
    raise exception '%', case when k.estado = 'abierta' then 'Tome el caso (pásalo a investigación) antes de rechazarlo.' when k.estado = 'ajuste_fallido' then 'El caso tiene un ajuste fallido: vuelva a investigarlo antes de rechazarlo.' else 'El caso está ' || k.estado || ' y ya no se puede rechazar.' end using errcode = 'PF409';
  end if;
  if piefirme_app.ctl_caso_capturista(k) = auth.uid() then
    raise exception 'Quien capturó la diferencia no puede rechazar su propio caso. Pida a otra persona autorizada que lo resuelva.' using errcode = 'PF403';
  end if;
  if length(v_m) < 10 then raise exception 'Indique el motivo del rechazo (mínimo 10 caracteres).' using errcode = 'PF422'; end if;
  s := piefirme_app.ctl_caso_par(k);
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_caso set estado = 'rechazada', nota_cierre = v_m, cerrado_en = now() where id = k.id;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'cambio_estado', 'Caso rechazado: ' || v_m || ' El saldo de inventario no se modificó.', k.estado, 'rechazada', jsonb_build_object('accion', 'rechazo'));
  if s.id is not null then
    update piefirme.ctl_caso set estado = 'rechazada', nota_cierre = v_m, cerrado_en = now() where id = s.id;
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'cambio_estado', 'Rechazado junto con su par ' || k.folio || ': ' || v_m, s.estado, 'rechazada', jsonb_build_object('accion', 'rechazo', 'principal', k.folio));
  end if;
  return jsonb_build_object('ok', true, 'estado', 'rechazada');
end $$;

-- Un ajuste fallido vuelve a investigación (p. ej. el origen lo rechazó por datos que hay que corroborar) sin perder su historia.
create or replace function piefirme.ctl_caso_volver_a_investigar(p_caso uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('investigar'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_m text := btrim(coalesce(p_motivo, ''));
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  perform piefirme_app.ctl_caso_exigir_principal(k);
  if k.estado <> 'ajuste_fallido' then raise exception 'Solo un caso con ajuste fallido vuelve a investigación (este está %).', k.estado using errcode = 'PF409'; end if;
  if length(v_m) < 10 then raise exception 'Indique por qué vuelve a investigación (mínimo 10 caracteres).' using errcode = 'PF422'; end if;
  s := piefirme_app.ctl_caso_par(k);
  perform piefirme_app.ctl_rpc_on();
  update piefirme.ctl_caso set estado = 'en_investigacion' where id = k.id;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'cambio_estado', 'Vuelve a investigación: ' || v_m, k.estado, 'en_investigacion');
  if s.id is not null then
    update piefirme.ctl_caso set estado = 'en_investigacion' where id = s.id and estado = 'ajuste_fallido';
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'cambio_estado', 'Vuelve a investigación junto con su par ' || k.folio, s.estado, 'en_investigacion');
  end if;
  return jsonb_build_object('ok', true, 'estado', 'en_investigacion');
end $$;

-- ───────────────────────────── autorización del ajuste (separación de funciones) ─────────────────────────────
-- Reglas duras, validadas aquí:
--   1) solo el dueño (capacidad «autorizar»);  2) quien capturó la diferencia no autoriza su propio caso;  3) quien investigó no autoriza, salvo el dueño;
--   4) CONTRASEÑA completa (re-autenticación contra auth.users), nunca el PIN, con bloqueo tras 3 fallos / 15 min;
--   5) causa, responsable del costo y monto obligatorios (la causa con «requiere nota» exige su nota);
--   6) el ajuste lo aplica el origen (ctl_solicitar_ajuste_origen, idempotente por folio_caso) y el caso guarda el id del movimiento.
-- Si el origen rechaza: el caso queda en ajuste_fallido con el mensaje, se avisa al dueño y se puede reintentar. Sustitución de código: el par se aplica
-- en una sola subtransacción (los dos movimientos o ninguno) y cada uno guarda su movimiento.
create or replace function piefirme_app.ctl_autorizar_interno(p_caso uuid, p_password text, p_modo text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
declare v_org uuid := piefirme_app.ctl_exigir('autorizar'); k piefirme.ctl_caso%rowtype; s piefirme.ctl_caso%rowtype; v_par boolean;
        v_cap uuid; v_inv boolean; v_ok boolean; v_desde bigint; v_fallos integer; v_res jsonb; v_res2 jsonb := null; v_estado text; v_causa text; v_msg text;
        v_ahora timestamptz := now(); v_idem boolean; v_movs jsonb; v_pet jsonb;
begin
  k := piefirme_app.ctl_caso_cargar(p_caso, v_org);
  perform piefirme_app.ctl_caso_exigir_principal(k);
  s := piefirme_app.ctl_caso_par(k);
  v_par := s.id is not null;
  if k.estado not in ('en_investigacion', 'ajuste_fallido') then raise exception 'el caso está % y no admite autorización de ajuste', k.estado using errcode = 'PF409'; end if;
  if p_modo = 'reintentar' and k.estado <> 'ajuste_fallido' then raise exception 'solo se reintenta un ajuste fallido (el caso está %)', k.estado using errcode = 'PF409'; end if;
  if k.causa_id is null or k.responsable_costo is null then raise exception 'antes de autorizar, el caso necesita causa y quién absorbe el costo' using errcode = 'PF422'; end if;
  if k.cantidad is null or k.cantidad = 0 or k.producto_id is null then raise exception 'este caso no tiene un ajuste de inventario que autorizar' using errcode = 'PF422'; end if;
  if v_par and (s.cantidad is null or s.cantidad = 0 or s.producto_id is null or k.cantidad > 0 or s.cantidad < 0) then
    raise exception 'el par de sustitución de código no es coherente (se esperaba un faltante y un sobrante)' using errcode = 'PF422';
  end if;

  -- regla 2: quien capturó no autoriza su propio caso (ni el de su contraparte)
  v_cap := piefirme_app.ctl_caso_capturista(k);
  if (v_cap is not null and v_cap = auth.uid()) or (v_par and piefirme_app.ctl_caso_capturista(s) = auth.uid()) then
    raise exception 'Quien capturó la partida no puede autorizar el ajuste de su propio caso. Pida a otra persona autorizada que lo apruebe.' using errcode = 'PF403';
  end if;
  -- regla 3: quien investigó no autoriza, salvo dueño
  select (k.asignado_a = auth.uid()) or exists (select 1 from piefirme.ctl_caso_bitacora b where b.caso_id in (k.id, coalesce(s.id, k.id)) and b.usuario_id = auth.uid()
                                               and (b.tipo in ('comentario', 'evidencia', 'asignacion') or b.estado_nuevo = 'en_investigacion')) into v_inv;
  if v_inv and piefirme_app.ctl_rol() <> 'dueno' then
    raise exception 'Quien investigó el caso no puede autorizar su ajuste (solo el dueño puede hacerlo).' using errcode = 'PF403';
  end if;
  if k.monto_costo is null then raise exception 'antes de autorizar, el caso necesita el monto al costo que se absorbe (puede ser cero)' using errcode = 'PF422'; end if;
  v_causa := piefirme_app.ctl_caso_validar_causa(v_org, k.causa_id, k.nota_cierre);

  -- regla 4: contraseña completa, con bloqueo temporal (3 fallos / 15 min). El fallo se devuelve (no se lanza) para conservar el intento.
  select coalesce(max(i.id), 0) into v_desde from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'password' and i.exito;
  select count(*) into v_fallos from piefirme.ctl_intento i where i.usuario_id = auth.uid() and i.tipo = 'password' and not i.exito and i.id > v_desde and i.creado_en > now() - interval '15 minutes';
  if v_fallos >= 3 then raise exception 'autorización bloqueada por intentos fallidos; espere 15 minutos' using errcode = 'PF429'; end if;
  select (u.encrypted_password is not null and u.encrypted_password = extensions.crypt(coalesce(p_password, ''), u.encrypted_password)) into v_ok from auth.users u where u.id = auth.uid();
  v_ok := coalesce(v_ok, false);
  insert into piefirme.ctl_intento (organizacion_id, usuario_id, tipo, exito) values (v_org, auth.uid(), 'password', v_ok);
  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'contrasena_incorrecta', 'mensaje', 'Para autorizar un ajuste se exige su contraseña completa (no el PIN).');
  end if;

  -- aplicar al origen
  perform piefirme_app.ctl_rpc_on();
  if not v_par then
    v_res := piefirme.ctl_solicitar_ajuste_origen(k.folio, k.sucursal_id, k.producto_id, k.cantidad, 'ajuste_por_auditoria', v_causa, auth.uid(), v_ahora, v_org);
  else
    begin   -- subtransacción: los dos ajustes del par o ninguno
      v_res := piefirme.ctl_solicitar_ajuste_origen(k.folio, k.sucursal_id, k.producto_id, k.cantidad, 'ajuste_por_auditoria', v_causa, auth.uid(), v_ahora, v_org);
      if not coalesce((v_res ->> 'ok')::boolean, false) then raise exception '%', coalesce(v_res ->> 'mensaje', 'el origen rechazó el ajuste') using errcode = 'PF900'; end if;
      v_res2 := piefirme.ctl_solicitar_ajuste_origen(s.folio, s.sucursal_id, s.producto_id, s.cantidad, 'ajuste_por_auditoria', v_causa, auth.uid(), v_ahora, v_org);
      if not coalesce((v_res2 ->> 'ok')::boolean, false) then raise exception 'ajuste de la contraparte % rechazado: %', s.folio, coalesce(v_res2 ->> 'mensaje', 'el origen lo rechazó') using errcode = 'PF900'; end if;
    exception when others then
      v_msg := sqlerrm;
      v_res := jsonb_build_object('ok', false, 'mensaje', left('El par se revirtió completo (ningún movimiento quedó aplicado): ' || v_msg, 500));
      v_res2 := null;
      -- la reversión deshizo también los registros de la llamada: se dejan constancia de la petición rechazada de ambos folios
      insert into piefirme.ctl_llamada_origen (organizacion_id, folio_caso, sucursal_id, producto_id, peticion, respuesta, estado, mensaje, intentos, ultimo_intento_en)
      select v_org, x.folio, x.sucursal_id, x.producto_id,
             jsonb_build_object('origen', 'ctl', 'folio_caso', x.folio, 'sucursal_id', x.sucursal_id, 'producto_id', x.producto_id, 'cantidad_delta', x.cantidad, 'tipo', 'ajuste_por_auditoria',
                                'causa', v_causa, 'autorizado_por', auth.uid(), 'autorizado_en', v_ahora, 'par', array[k.folio, s.folio]),
             v_res, 'rechazada', left(v_msg, 500), 1, now()
        from (values (k.folio, k.sucursal_id, k.producto_id, k.cantidad), (s.folio, s.sucursal_id, s.producto_id, s.cantidad)) as x(folio, sucursal_id, producto_id, cantidad)
      on conflict (organizacion_id, folio_caso) do update set estado = 'rechazada', mensaje = excluded.mensaje, respuesta = excluded.respuesta,
             intentos = piefirme.ctl_llamada_origen.intentos + 1, ultimo_intento_en = now() where piefirme.ctl_llamada_origen.estado <> 'aplicada';
    end;
  end if;

  v_estado := case when coalesce((v_res ->> 'ok')::boolean, false) then 'cerrada_con_ajuste' else 'ajuste_fallido' end;
  v_idem := coalesce((v_res ->> 'idempotente')::boolean, false) or coalesce((v_res2 ->> 'idempotente')::boolean, false);
  v_movs := to_jsonb(array_remove(array[nullif(v_res ->> 'movimiento_id', ''), nullif(v_res2 ->> 'movimiento_id', '')], null));

  update piefirme.ctl_caso set autorizado_por = auth.uid(), autorizado_en = v_ahora, estado = v_estado, movimiento_origen_id = nullif(v_res ->> 'movimiento_id', '')::uuid,
         cerrado_en = case when v_estado = 'cerrada_con_ajuste' then v_ahora end where id = k.id;
  perform piefirme_app.ctl_caso_bit(v_org, k.sucursal_id, k.id, auth.uid(), 'cambio_estado',
          case when v_estado = 'ajuste_fallido' then 'El origen rechazó el ajuste: ' || coalesce(v_res ->> 'mensaje', '') || ' El caso queda visible y se puede reintentar.'
               else case when p_modo = 'reintentar' then 'Ajuste reintentado y aplicado' else 'Ajuste autorizado y aplicado' end
                    || case when v_par then ' (par de sustitución de código: ' || k.cantidad || ' y +' || s.cantidad || ')' else ' (' || k.cantidad || ')' end
                    || case when v_idem then '; el origen ya tenía el movimiento (idempotente)' else '' end end,
          k.estado, v_estado,
          jsonb_build_object('accion', case when p_modo = 'reintentar' then 'reintento_ajuste' else 'autorizacion' end, 'autorizo', auth.uid(), 'cantidad_delta', k.cantidad,
                             'movimiento_id', v_res -> 'movimiento_id', 'idempotente', v_idem, 'par', case when v_par then s.folio end, 'mensaje', v_res ->> 'mensaje'));
  if v_par then
    update piefirme.ctl_caso set autorizado_por = auth.uid(), autorizado_en = v_ahora, estado = v_estado, movimiento_origen_id = nullif(v_res2 ->> 'movimiento_id', '')::uuid,
           causa_id = k.causa_id, responsable_costo = k.responsable_costo, cerrado_en = case when v_estado = 'cerrada_con_ajuste' then v_ahora end where id = s.id;
    perform piefirme_app.ctl_caso_bit(v_org, s.sucursal_id, s.id, auth.uid(), 'cambio_estado',
            case when v_estado = 'ajuste_fallido' then 'El ajuste del par se revirtió completo: ' || coalesce(v_res ->> 'mensaje', '')
                 else 'Ajuste aplicado junto con su principal ' || k.folio || ' (+' || s.cantidad || ')' end, s.estado, v_estado,
            jsonb_build_object('accion', 'autorizacion', 'principal', k.folio, 'cantidad_delta', s.cantidad, 'movimiento_id', v_res2 -> 'movimiento_id'));
  end if;

  if v_estado = 'ajuste_fallido' then
    if not exists (select 1 from piefirme.ctl_alerta a where a.organizacion_id = v_org and a.tipo = 'ajuste_fallido' and a.referencia_id = k.id and a.estado = 'nueva') then
      insert into piefirme.ctl_alerta (organizacion_id, sucursal_id, tipo, severidad, destinatarios, mensaje, referencia_tipo, referencia_id)
      values (v_org, k.sucursal_id, 'ajuste_fallido', 'alta', array['dueno', 'supervisor'],
              'El origen rechazó el ajuste del caso ' || k.folio || ': ' || coalesce(left(v_res ->> 'mensaje', 200), '') || ' Se puede reintentar desde el detalle del caso.', 'caso', k.id);
    end if;
  else
    update piefirme.ctl_alerta set estado = 'atendida', atendida_por = auth.uid(), atendida_en = now()
     where organizacion_id = v_org and tipo = 'ajuste_fallido' and referencia_id = k.id and estado <> 'atendida';
  end if;

  return jsonb_build_object('ok', v_estado = 'cerrada_con_ajuste', 'estado', v_estado, 'movimiento_id', v_res -> 'movimiento_id', 'movimientos', v_movs,
                            'par', v_par, 'idempotente', v_idem, 'mensaje', v_res ->> 'mensaje');
end $$;

create or replace function piefirme.ctl_autorizar_ajuste(p_caso uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  return piefirme_app.ctl_autorizar_interno(p_caso, p_password, 'autorizar');
end $$;

-- Reintento de un ajuste fallido: vuelve a exigir la contraseña completa (es de nuevo una autorización) y es idempotente por folio_caso:
-- si el origen ya había aplicado el movimiento (p. ej. se perdió la respuesta por la red), devuelve ese mismo movimiento y no crea otro.
create or replace function piefirme.ctl_reintentar_ajuste(p_caso uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = piefirme, piefirme_app, extensions, pg_temp as $$
begin
  return piefirme_app.ctl_autorizar_interno(p_caso, p_password, 'reintentar');
end $$;

-- ───────────────────────────── privilegios ─────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'piefirme' and p.proname in ('ctl_caso_asignar', 'ctl_caso_tomar', 'ctl_caso_comentar', 'ctl_caso_adjuntar_evidencia', 'ctl_caso_guardar_cierre',
                                                             'ctl_caso_cerrar_sin_ajuste', 'ctl_caso_rechazar', 'ctl_caso_volver_a_investigar', 'ctl_autorizar_ajuste', 'ctl_reintentar_ajuste'))
               or (n.nspname = 'piefirme_app' and p.proname = 'ctl_autorizar_interno') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    if f.nspname = 'piefirme' then execute format('grant execute on function %s to authenticated', f.firma); end if;
  end loop;
end $$;
