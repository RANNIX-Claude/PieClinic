# Resumen del esquema — Dominio A · Clínico (migraciones 010 y 030-039)

Validado con `node scripts/validar-sql-local.mjs` sobre las 42 migraciones existentes (001…059): sin errores, sin tablas sin RLS, sin políticas abiertas, sin vistas sin `security_invoker`. Las semillas `supabase/semillas/A_01…A_03` corren completas sobre ese esquema y se probaron reglas de rol/inmutabilidad con RLS real (ver «Pruebas hechas»).

## Archivos

| Migración | Contenido |
|---|---|
| `010_pacientes_consentimientos.sql` | helpers `app.a_politicas`, `app.a_triggers`, `app.a_inmutable`, `app.edad`, folios `{SEDE}-{TIPO}-{NNNNNN}`; plantillas de documento con versión; pacientes (100 % del formato 2); dato sensible (VIH); contactos de emergencia; firmas; tutores/representantes; etiquetas; datos fiscales del paciente; consentimientos; fusiones |
| `030_historia_clinica.sql` | expediente (versión, retención ≥ 5 años), antecedentes (tri-estado sí/no/no sabe), alergias, medicamentos, `abrir_expediente` con bitácora |
| `031_consultas_notas.sql` | consultas / nota de evolución con firma inmutable, signos vitales, notas aclaratorias, seguimiento clínico (formato 3), VIH solo por RPC con bitácora |
| `032_diagnosticos_procedimientos.sql` | CIE-10 (global, solo lectura) + favoritos, catálogo de procedimientos y de medicamentos, diagnósticos (lista corta + CIE-10), procedimientos, indicaciones/receta, consumos |
| `033_exploracion_mapa_fotos.sql` | 5 siluetas de miembro inferior por pierna, exploración por tipo, mapa del pie 4 vistas (D/I × dorsal/plantar), fotos clínicas (retiro, nunca borrado), documentos adjuntos |
| `034_planes_tratamiento.sql` | plantillas de plan, planes y sesiones (extracción + 4 curaciones diarias), abandono a 30 días |
| `035_pie_diabetico.sql` | valoración, monofilamento 10 sitios × pie, úlceras con SINBAD, revisiones |
| `036_plantillas_ortopedicas.sql` | laboratorios, estudio de pisada, orden (borrador → enviada → recibida → entregada), garantía, ajuste y renovación |
| `037_videoconsulta_dictado_alertas.sql` | dictado por voz con consentimiento y borrado de audio, sala de videoconsulta (liga de un solo uso), alertas clínicas |
| `038_esterilizacion_instrumental.sql` | autoclaves, kits, lotes (químico/biológico), uso del kit por consulta, trazabilidad inversa |
| `039_quejas_arco_impresos.sql` | quejas, solicitudes ARCO, documentos emitidos/impresos, fusión de expedientes |

Totales: **56 tablas**, **18 vistas `prp_*`**, **19 funciones RPC en `public`** y 43 funciones `app.*` (triggers y helpers).

## Vistas `prp_*`
`prp_pacientes`, `prp_consentimientos_vigentes`, `prp_expediente_resumen`, `prp_seguimiento_clinico` (tabla Fecha·Atendió·Servicio·Observaciones·Próx. visita), `prp_consultas_pendientes`, `prp_diagnosticos_frecuentes`, `prp_hallazgos_pie`, `prp_fotos_clinicas`, `prp_planes_progreso`, `prp_monofilamento_resumen`, `prp_pie_diabetico_revisiones`, `prp_plantillas_seguimiento`, `prp_alertas_paciente`, `prp_esterilizacion_lotes`, `prp_kits_resumen`, `prp_quejas_resumen`, `prp_arco_pendientes`, `prp_documentos_emitidos`.

## RPC (`public`)
- Pacientes: `buscar_duplicados_paciente`, `abrir_expediente`, `ver_dato_sensible` (VIH, con motivo y bitácora), `fusionar_pacientes`, `deshacer_fusion` (30 días), `pacientes_fusionados`.
- Consulta: `firmar_consulta`, `autorizar_excepcion_aviso` (solo Administrador).
- Plantillas: `copiar_plantillas_base`, `copiar_plantillas_plan_base`.
- Planes: `crear_plan_desde_plantilla`, `generar_sesiones_plan`, `marcar_planes_abandonados` (devuelve las citas a cancelar).
- Impresión: `datos_impreso` (consentimiento, antecedentes, seguimiento, historia completa, en blanco; registra el documento, la versión del expediente, «copia» y la bitácora `imprimir`).
- Dictado/video: `purgar_audios_dictado`, `crear_sala_videoconsulta`; **anon (portal, sin cuenta): `portal_sala_estado`, `portal_sala_entrar`** (token de un solo uso por cita, límite de tasa con `app.limite_tasa` de B, devuelven lo mínimo).
- Esterilización: `pacientes_por_lote`.

## Estados (check + trigger de transición)
Consulta: borrador → pendiente_firma → cerrada (terminal). Valoración pie diabético: borrador → firmada. Estudio de pisada: borrador → firmado. Orden de plantilla: borrador → enviada → recibida → entregada (+ cancelada). Plan: en_curso ↔ pausado, → abandonado (reactivable), → concluido. Sesión de plan: por_generar, agendada, realizada, falta, cancelada. Consentimiento: pendiente_firma → firmado → revocado / reemplazado. Plantilla de documento: borrador → activa → archivada. Dictado: en_curso, pausado, transcrito, aceptado, editado, descartado. Sala: programada → en_sala_espera → en_consulta → finalizada (o liga_vencida). Lote de esterilización: registrado → liberado_condicionado → liberado, o bloqueado (biológico positivo) / rechazado. Kit: por_esterilizar → esterilizado → en_uso → por_esterilizar. Queja: nueva → en_revision → escalada → resuelta → cerrada. ARCO: recibida → en_proceso → atendida / rechazada. Expediente: activo, resguardo, bloqueado_arco.

## Reglas de REGLAS_NEGOCIO.md

**Cubiertas por constraint / trigger / función (la BD las hace cumplir):**
P-001 (nota firmada inmutable + nota aclaratoria con firma), P-003 (check de alta rápida vs ficha completa; no hay consulta sin ficha completa), P-004 (no se cierra sin aviso firmado salvo excepción del Administrador), P-005 (cierre exige tutor vigente a menores; tabla de tutor/representante), P-006 (bloqueo por nombre+fecha de nacimiento, homónimo confirmable, fusión con deshacer 30 días), P-007 (10 fotos blando, 10 MB, ≤ 2048 px), P-008 (foto retirada con motivo, sin DELETE), P-009 (docencia exige autorización vigente y difuminado), P-010 (propuesta de riesgo apagada por parámetro), P-011 (ITB nunca 0), P-013 (estados, garantía, revisión 30 días, renovación 12-18 meses), P-014/P-015 (consentimiento firmado para dictar; audio se vence a 24 h o al confirmar), P-016/P-018/P-147 (telemedicina apagada por parámetro, tope 60 min, entrada 10 min antes, consentimiento antes de la sala, sin grabación por defecto), P-020/P-021/P-022 (visibilidad por RLS, evento adverso exige consulta, compensación con costo exige autorización de Administración), P-023 (liberado condicionado / liberado / bloqueado, kit no reutilizable sin nuevo ciclo), P-025 (atendió = quien firma), P-026 (función de abandono), P-027/P-028/P-029 (plantillas base editables; extracción + 4 curaciones diarias con salto de días cerrados y marca «atrasada»), P-030 (instantánea de antecedentes por consulta), P-031 (lista corta + CIE-10 opcional), P-032 (alertas solo derivadas, registro de «visto»), P-075 (anticipo 50 % para enviar la orden), P-127 (sin DELETE clínico, `conservar_hasta`), P-128 (RLS por clínica; CIE-10 y zonas globales de solo lectura), P-133 (folios por sede sin reuso), P-139/P-140 (versión de la plantilla guardada en cada firma; `requiere_nueva_firma`), P-141 (plazo de 20 días y bloqueo de expediente), P-142 (firma con IP, dispositivo, huella e inmutable), P-146 (cédula obligatoria para firmar), N-02 (campos del reverso con `por_validar`), N-04 (VIH en tabla aparte sin acceso de Recepción, lectura por RPC con bitácora), N-05 (papel escaneado como adjunto/consentimiento), N-08 (número de expediente consecutivo por sede o capturado a mano).

**Quedan a cargo de la app / otros dominios:**
P-002 (la RPC `abrir_expediente` deja la marca `notificar_administrador` en bitácora; el aviso lo emite la app), P-005 (pedir nueva firma a los 18 años en la siguiente visita), P-012 (rotular «apoyo, no diagnóstico» en pantalla), P-014 (borrar físicamente el archivo de Storage con las rutas que devuelve `purgar_audios_dictado`), P-016 (grabación y proveedor de video reales), P-017/P-019 (servicio que admite videoconsulta y exige consentimiento: catálogo de B), P-045 (la consulta intenta pasar la cita a «Atendida»; si la transición de B la rechaza, queda en bitácora y la app corrige), P-052 (inactivo/revisión vencida: calculado en vistas y alertas, la campaña es de D), P-009 (el difuminado real de la imagen), P-115 (cuota de almacenamiento), P-136/P-137/P-138/P-144 (revisión legal y declaración de residencia de datos), P-146 (verificación de la cédula por Administración).

## Pruebas hechas (PGlite, RLS real con `set role authenticated`)
Nota cerrada no se edita ni se borra; foto no se borra; firmas y notas aclaratorias inmutables; Recepción no ve consultas, antecedentes ni VIH pero sí pacientes; duplicado bloqueado; no se cierra sin diagnóstico; kit sin esterilizar no se usa; `datos_impreso` por rol; `ver_dato_sensible` exige motivo a otro podólogo; fusión y deshacer; creación de plan con 5 sesiones diarias.

## Semillas sintéticas (`supabase/semillas/`)
`A_01_base_catalogos_clinicos.sql` (organización fija `…c0de`, 5 sedes, 8 usuarios de auth simulados con id fijo, plantillas activas, catálogos, autoclaves y kits) · `A_02_pacientes_historia.sql` (40 pacientes con antecedentes, consentimientos, tutores, alergias, datos fiscales) · `A_03_consultas_planes_clinico.sql` (93 consultas (91 firmadas, 1 pendiente de firma, 1 borrador) del 3-ago al 24-oct-2026, 17 planes, 9 valoraciones de pie diabético, 5 órdenes de plantilla en 4 estados + borrador, 36 lotes de esterilización con un lote bloqueado, 72 fotos (metadatos), 5 quejas, 1 ARCO).

## Huecos y pendientes conocidos
- `proveedores`, `equipos` (mantenimiento) y lotes de inventario se referencian con `uuid` sin FK (sus migraciones son 04x/05x, mayores que las de A).
- `tests/rls.config.json` debe listar `portal_sala_estado` y `portal_sala_entrar` en `funciones_anon_permitidas` (archivo compartido; no se editó).
- La modalidad de la consulta usa `a_distancia`; la cita de B usa `videoconsulta`: el mapeo lo hace la app.
- La semilla no liga `consultas.cita_id` ni `servicio_id` (las citas y el catálogo son de B); si B ya sembró servicios, se ligan por nombre.
- La lectura del VIH por un podólogo directamente en la tabla no deja bitácora de lectura (solo `ver_dato_sensible` la deja); la app debe usar siempre la RPC.
- CIE-10 incluye un subconjunto frecuente en podología; el catálogo oficial completo se carga por `service_role`.
- Los criterios de riesgo y frecuencia de pie diabético quedan apagados hasta la validación de un podólogo asesor (P-010).
