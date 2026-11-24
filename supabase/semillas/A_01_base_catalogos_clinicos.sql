-- A_01 · Semilla SINTÉTICA (dominio A · clínico): base de la clínica de ejemplo "Pie Clinic (sintético)", usuarios con sesión simulados,
-- plantillas de documentos activas, plantillas de plan, catálogos clínicos, autoclaves y kits.
-- Debe existir antes: migraciones 001, 010, 030-038 (y 020 si se quiere ligar servicios; no es obligatorio).
-- Idempotente: puede correrse dos veces. Todo dato es ficticio; "hoy" = 25-oct-2026.
-- organizacion_id fijo: 00000000-0000-0000-0000-00000000c0de   (mismo que D_01; si D_01 corrió antes se respeta lo existente)
--
-- USUARIOS DE AUTH SIMULADOS (se crean aquí con id fijo; en QA/Supabase el id debe existir en auth.users antes que su perfil,
-- por eso este archivo inserta (id, email) en auth.users con on conflict do nothing; asigne contraseña desde el panel o con el script de invitaciones):
--   administrador  00000000-0000-0000-0000-00000000a001   admin.sintetico@ejemplo.invalid
--   podólogos      ...a101 Elena Ruiz (Chalco) · a102 Marco Mena (Chalco) · a103 Julián Cano (Centenario)
--                  ...a104 Paola Herrera (Galerías) · a105 Karen Montes (Patio) · a106 Renata Ibarra (Sendero)
--   recepción      ...a201 Ana López (Chalco)
-- Cédulas ficticias CED-SINT-xxxx. Ningún dato corresponde a una persona real.

insert into piefirme.organizaciones (id, nombre, razon_social, rfc, regimen_fiscal, codigo_postal, plan, estado)
values ('00000000-0000-0000-0000-00000000c0de', 'Pie Clinic (sintético)', 'Pie Clinic SA de CV (sintético)', 'PCL000000AA0', '601', '56600', 'por_clinica', 'activa')
on conflict (id) do nothing;

-- Parámetros clínicos de la clínica (REGLAS_NEGOCIO §0); se mezclan con los que otros dominios hayan puesto.
update piefirme.organizaciones set parametros = parametros || jsonb_build_object(
    'retencion_anios', 5, 'fotos_max_por_sesion', 10, 'dias_plan_abandonado', 30, 'arco_dias_naturales', 20, 'esterilidad_dias', 30,
    'plantillas_anticipo_pct', 50, 'plantillas_garantia_meses', 6, 'queja_meta_dias', 3, 'dias_acreditable_estudio', 30,
    'telemedicina_activa', false, 'pie_diabetico_criterios_activos', false,
    'festivos', jsonb_build_array('2026-11-02', '2026-11-16', '2026-12-25'))
 where id = '00000000-0000-0000-0000-00000000c0de';

insert into piefirme.sedes (organizacion_id, clave, nombre, direccion, telefono)
select '00000000-0000-0000-0000-00000000c0de', v.clave, v.nombre, v.dir || ' (sintético)', '55 0000 000' || v.n
  from (values ('chalco', 'Pie Clinic Chalco', 'Av. Ejemplo 100, Chalco', 1), ('centenario', 'Pie Clinic Centenario', 'Calle Ejemplo 200, Centenario', 2),
               ('galerias', 'Pie Clinic Galerías', 'Plaza Ejemplo local 30, Galerías', 3), ('patio', 'Pie Clinic Patio', 'Plaza Ejemplo local 12, Patio', 4),
               ('sendero', 'Pie Clinic Sendero', 'Plaza Ejemplo local 8, Sendero', 5)) v(clave, nombre, dir, n)
 where not exists (select 1 from piefirme.sedes s where s.organizacion_id = '00000000-0000-0000-0000-00000000c0de'
                      and (s.clave = v.clave or s.nombre ilike '%' || left(v.clave, 5) || '%'))
on conflict do nothing;
-- Las sedes cierran los domingos (las curaciones diarias pasan al siguiente día hábil, P-028)
update piefirme.sedes set horario = horario || '{"dias_cerrados":[7]}'::jsonb where organizacion_id = '00000000-0000-0000-0000-00000000c0de';

create or replace function pg_temp.sede(p text) returns uuid language sql as $$
  select id from piefirme.sedes
   where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and (clave = p or nombre ilike '%' || left(p, 5) || '%')
   order by (clave = p) desc limit 1
$$;

-- ───────────── usuarios con sesión (auth simulado + perfiles) ─────────────
-- Usuario sin contraseña, sin confirmar y con todas las columnas de texto de GoTrue rellenas ('' en vez de NULL) para no romper el servicio de auth compartido.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', v.email, '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{"sintetico":true}'::jsonb, now(), now() from (values
  ('00000000-0000-0000-0000-00000000a001', 'admin.sintetico@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000000a101', 'elena.ruiz@ejemplo.invalid'), ('00000000-0000-0000-0000-00000000a102', 'marco.mena@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000000a103', 'julian.cano@ejemplo.invalid'), ('00000000-0000-0000-0000-00000000a104', 'paola.herrera@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000000a105', 'karen.montes@ejemplo.invalid'), ('00000000-0000-0000-0000-00000000a106', 'renata.ibarra@ejemplo.invalid'),
  ('00000000-0000-0000-0000-00000000a201', 'ana.lopez@ejemplo.invalid')) v(id, email)
on conflict (id) do nothing;

insert into piefirme.perfiles (id, organizacion_id, rol, nombre, apellidos, email, telefono, cedula, sedes)
select v.id::uuid, '00000000-0000-0000-0000-00000000c0de', v.rol::piefirme.rol_usuario, v.nombre, v.apellidos, v.email, '55 2000 00' || v.n, v.cedula,
       case when v.sede is null then '{}'::uuid[] else array[pg_temp.sede(v.sede)] end
  from (values
    ('00000000-0000-0000-0000-00000000a001', 'administrador', 'Administrador', 'Sintético', 'admin.sintetico@ejemplo.invalid', '01', null, null),
    ('00000000-0000-0000-0000-00000000a101', 'podologo', 'Elena', 'Ruiz Vega', 'elena.ruiz@ejemplo.invalid', '11', 'CED-SINT-0001', 'chalco'),
    ('00000000-0000-0000-0000-00000000a102', 'podologo', 'Marco', 'Mena Rojas', 'marco.mena@ejemplo.invalid', '12', 'CED-SINT-0002', 'chalco'),
    ('00000000-0000-0000-0000-00000000a103', 'podologo', 'Julián', 'Cano Soto', 'julian.cano@ejemplo.invalid', '13', 'CED-SINT-0004', 'centenario'),
    ('00000000-0000-0000-0000-00000000a104', 'podologo', 'Paola', 'Herrera Núñez', 'paola.herrera@ejemplo.invalid', '14', 'CED-SINT-0007', 'galerias'),
    ('00000000-0000-0000-0000-00000000a105', 'podologo', 'Karen', 'Montes Lira', 'karen.montes@ejemplo.invalid', '15', 'CED-SINT-0009', 'patio'),
    ('00000000-0000-0000-0000-00000000a106', 'podologo', 'Renata', 'Ibarra Paz', 'renata.ibarra@ejemplo.invalid', '16', 'CED-SINT-0011', 'sendero'),
    ('00000000-0000-0000-0000-00000000a201', 'recepcion', 'Ana', 'López Díaz', 'ana.lopez@ejemplo.invalid', '21', null, 'chalco')
  ) v(id, rol, nombre, apellidos, email, n, cedula, sede)
on conflict (id) do nothing;

-- ───────────── plantillas de documentos y de plan: se copian con las mismas funciones que usa la app (como administrador) ─────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a001","role":"authenticated"}', false);
select piefirme.copiar_plantillas_base();
select piefirme.copiar_plantillas_plan_base();
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);
-- Estructura de los impresos (mismo diseño del papel de Pie Clinic): secciones que debe pintar el generador de PDF
update piefirme.plantillas_documento set estructura = case codigo
    when 'impreso_antecedentes' then '{"secciones":["sede","datos_generales","patologicos","heredofamiliares","no_patologicos","motivo_sintomas","exploracion_siluetas"],"sedes_casillas":["Chalco","Centenario","Galerías","Patio","Sendero"],"por_validar":["reverso_exploracion"]}'::jsonb
    when 'impreso_seguimiento' then '{"secciones":["nombre_edad","antecedentes","diagnostico_casillas","mapa_pie_4_vistas","tratamiento","tabla_visitas"],"columnas_visitas":["Fecha","Atendió","Servicio","Observaciones","Próx. visita"],"diagnostico_casillas":["Onicomicosis","Papiloma plantar","Pie de atleta","Micosis","Hiperqueratosis","Otros"]}'::jsonb
    when 'impreso_consentimiento' then '{"secciones":["paciente","tutor","podologo","alcance_autorizado","declaraciones","firmas"]}'::jsonb
    when 'impreso_historia_completa' then '{"secciones":["consentimiento","antecedentes","seguimiento"],"marca_version_expediente":true}'::jsonb
    else estructura end
 where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and codigo like 'impreso_%' and estado = 'borrador';

-- Las plantillas base nacen en borrador: se activan (el texto sigue «pendiente de validación legal», P-139)
update piefirme.plantillas_documento set estado = 'activa', vigente_desde = date '2026-08-01'
 where organizacion_id = '00000000-0000-0000-0000-00000000c0de' and estado = 'borrador' and base_rannix;

-- ───────────── catálogos clínicos ─────────────
insert into piefirme.catalogo_procedimientos (organizacion_id, codigo, nombre, requiere_consentimiento, anestesia_tipica, duracion_min)
select '00000000-0000-0000-0000-00000000c0de', v.codigo, v.nombre, v.cons, v.anest, v.dur
  from (values
    ('QUIRO', 'Quiropodia (pedicura clínica)', false, 'no_aplico', 30), ('ESPIC', 'Espiculectomía (retiro de espícula en uña encarnada)', true, 'topica', 40),
    ('EXTUN', 'Extracción de uña, hemostasia y curación', true, 'infiltrativa', 60), ('CURAC', 'Curación y control post-extracción', false, 'no_aplico', 15),
    ('LASER', 'Láser antimicótico', true, 'no_aplico', 30), ('VERRU', 'Tratamiento de verruga plantar', true, 'topica', 30),
    ('RECON', 'Reconstrucción ungueal', false, 'no_aplico', 60), ('ESTPIS', 'Estudio de la pisada', false, 'no_aplico', 45),
    ('VALDM', 'Valoración de pie de riesgo (diabético)', false, 'no_aplico', 45), ('ENTPLA', 'Entrega y ajuste de plantillas', false, 'no_aplico', 30),
    ('HIPER', 'Tratamiento de hiperqueratosis / helomas', false, 'no_aplico', 30)) v(codigo, nombre, cons, anest, dur)
on conflict (organizacion_id, codigo) do nothing;

insert into piefirme.catalogo_medicamentos (organizacion_id, nombre, presentacion, via_habitual, advertencia)
select '00000000-0000-0000-0000-00000000c0de', v.n, v.p, v.v, 'Catálogo de ejemplo; la clínica define el suyo (P-145)'
  from (values ('Mupirocina 2 %', 'ungüento 15 g', 'tópica'), ('Clorhexidina 2 %', 'solución', 'tópica'), ('Terbinafina 1 %', 'crema 30 g', 'tópica'),
               ('Ciclopirox 8 %', 'laca de uñas', 'tópica'), ('Ácido salicílico 40 %', 'parche', 'tópica')) v(n, p, v)
on conflict do nothing;

insert into piefirme.etiquetas_paciente (organizacion_id, nombre, tipo, color)
select '00000000-0000-0000-0000-00000000c0de', v.n, v.t, v.c from (values ('Diabético', 'automatica', '#C0392B'), ('Plantillas', 'automatica', '#2E86C1'), ('Recurrente', 'manual', '#27AE60'),
  ('Referida', 'manual', '#8E44AD'), ('Plan abandonado', 'automatica', '#E67E22'), ('Una sola visita', 'automatica', '#7F8C8D')) v(n, t, c)
on conflict (organizacion_id, nombre) do nothing;

insert into piefirme.cie10_favoritos (organizacion_id, codigo, orden)
select '00000000-0000-0000-0000-00000000c0de', c, o from (values ('L60.0', 1), ('B35.1', 2), ('B35.3', 3), ('B07.0', 4), ('L84', 5), ('E11.5', 6), ('M20.1', 7), ('M21.4', 8)) v(c, o)
on conflict do nothing;

insert into piefirme.laboratorios_ortopedicos (organizacion_id, nombre, contacto, telefono, email, dias_entrega_habiles)
values ('00000000-0000-0000-0000-00000000c0de', 'Laboratorio Ortopodal (sintético)', 'Contacto Ejemplo', '55 3000 0000', 'lab@ejemplo.invalid', 15)
on conflict (organizacion_id, nombre) do nothing;

-- ───────────── esterilización: un autoclave por sede y 3 kits por sede ─────────────
insert into piefirme.autoclaves (organizacion_id, sede_id, nombre, numero_serie)
select '00000000-0000-0000-0000-00000000c0de', pg_temp.sede(v.s), 'Autoclave 1 ' || initcap(v.s), 'SINT-AC-' || v.n
  from (values ('chalco', 1), ('centenario', 2), ('galerias', 3), ('patio', 4), ('sendero', 5)) v(s, n)
on conflict (sede_id, nombre) do nothing;

insert into piefirme.kits_instrumental (organizacion_id, sede_id, codigo, nombre, num_piezas, contenido)
select '00000000-0000-0000-0000-00000000c0de', pg_temp.sede(s.s), 'K-' || upper(left(s.s, 3)) || '-' || k.n, k.nombre, k.piezas, k.contenido::jsonb
  from (values ('chalco'), ('centenario'), ('galerias'), ('patio'), ('sendero')) s(s)
  cross join (values (1, 'Quiropodia', 8, '["pinza de disección","tijera de cutícula","cureta","gubia","lima","tenaza","espátula","bisturí mango"]'),
                     (2, 'Uña encarnada', 10, '["espátula","cureta","pinza mosquito","tijera","tenaza","elevador","bisturí mango","gubia","porta agujas","pinza de disección"]'),
                     (3, 'Extracción de uña / matricectomía', 12, '["elevador de uña","pinza mosquito","pinza de disección","bisturí mango","cureta","tijera","porta agujas","separador","tenaza","gubia","espátula","campo fenestrado"]')) k(n, nombre, piezas, contenido)
on conflict (organizacion_id, codigo) do nothing;
