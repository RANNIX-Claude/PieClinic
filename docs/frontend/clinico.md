# Frontend · área «clinico» (pacientes, expediente, consultas, clínica)

Archivos propios: `src/routes/clinico.jsx`, `src/menu/clinico.js` (grupo CLÍNICA) y `src/menu/clinico_pacientes.js` (grupo PACIENTES; el contrato permite un grupo por archivo), `src/pages/clinico/`, `src/lib/clinico/`, `src/lib/adaptadores/dictadoIA.js` y `video.js`.
Fuente de datos: vistas `prp_*` y tablas de las migraciones 010, 030–039 y 055 (`docs/esquema/A_resumen.md`). Toda lectura pasa por `leer()`/`rpc()`; toda escritura por tablas base (`insertar`/`actualizar`) o RPC.

## Pantallas

| Ruta | Mockup | Vistas / tablas / RPC |
|---|---|---|
| `/pacientes` | listado | `prp_pacientes`; tabs «Posibles duplicados» y «Fusiones» (RPC `fusionar_pacientes`, `deshacer_fusion`, tabla `paciente_fusiones`) |
| `/pacientes/nuevo`, `/pacientes/:id/editar` | 10 | `pacientes`, `contactos_emergencia`, `tutores`, `datos_fiscales_paciente`, `consentimientos`, `firmas`, `consentimientos_contacto`, `etiquetas_paciente`; RPC `buscar_duplicados_paciente` |
| `/pacientes/:id` | 02 | `prp_pacientes`, `prp_alertas_paciente`, `consultas` (+ dx, fotos, perfiles), `prp_consentimientos_vigentes`, `prp_agenda`, `prp_fotos_clinicas`, `prp_planes_progreso`, `documentos_adjuntos`, `prp_documentos_emitidos`, `prp_ventas`, `prp_facturas`, `prp_plantillas_seguimiento`; RPC `abrir_expediente`, `ver_dato_sensible` |
| `/pacientes/:id/historia` | 50 | `antecedentes_paciente`, `alergias_paciente`, `medicamentos_paciente`, `paciente_datos_sensibles` (VIH), `exploracion_miembro_inferior`, `prp_seguimiento_clinico` |
| `/pacientes/:id/imprimir` | 51 | lecturas directas para la vista previa; RPC `datos_impreso` al imprimir (folio, versión, «copia», bitácora) |
| `/consultas`, `/consultas/nueva`, `/consultas/:id` | 03 | `consultas`, `signos_vitales`, `hallazgos_pie`, `exploraciones`, `exploracion_miembro_inferior`, `diagnosticos_consulta`, `cie10_catalogo/favoritos`, `procedimientos_consulta`, `indicaciones_consulta`, `consumos_consulta`, `uso_kit_consulta`, `notas_aclaratorias`, `firmas`; RPC `firmar_consulta`, `autorizar_excepcion_aviso` |
| `/pacientes/:id/fotos`, `/fotos-clinicas` | 04 | `fotos_clinicas`, `consentimientos`; bucket `fotos-clinicas` con URL firmada |
| `/planes`, `/planes/nuevo`, `/planes/:id` | 05 | `prp_planes_progreso`, `plantillas_plan`, `plantilla_plan_sesiones`, `planes_tratamiento`, `sesiones_plan`, `citas`; RPC `crear_plan_desde_plantilla` |
| `/pie-diabetico`, `/pie-diabetico/nueva`, `/pie-diabetico/:id` | 06 | `prp_pie_diabetico_revisiones`, `valoraciones_pie_diabetico`, `monofilamento_sitios`, `ulceras_pie` |
| `/plantillas-ortopedicas`, `/nueva`, `/:id` | 07 | `prp_plantillas_seguimiento`, `estudios_pisada`, `ordenes_plantilla`, `laboratorios_ortopedicos` |
| `/consultas/:id/dictado` | 08 | `dictados`, `dictado_propuestas`, `consentimientos` (tipo `dictado_ia`) |
| `/videoconsulta/:citaId` | 09 | `prp_agenda`, `salas_videoconsulta`, `consentimientos` (tipo `telemedicina`); RPC `crear_sala_videoconsulta` |
| `/quejas` | 14 | `quejas`, `prp_quejas_resumen`, `prp_satisfaccion_quejas`; RPC `encuesta_crear` |
| `/esterilizacion` | 15 | `prp_esterilizacion_lotes`, `prp_kits_resumen`, `lotes_esterilizacion`, `lote_kits`, `kits_instrumental`, `autoclaves`; RPC `pacientes_por_lote` |
| `/seguimiento` | 16 | `prp_pacientes`, `prp_seguimiento_clinico`, `prp_ventas`, `prp_consentimientos_contacto_vigentes`, `prp_seguimientos`, `prp_campanas`, `prp_nps_mensual`, `prp_encuestas`; RPC `campana_agregar_destinatarios` |
| `/documentos` | (admin) | `plantillas_documento` (versiones), `prp_documentos_emitidos` (bitácora de impresión); RPC `copiar_plantillas_base` |

Roles según `MATRIZ_ROLES.md` / `permisos.js`: Recepción ve solo datos de contacto del expediente, planes, documentos y pagos; no ve consultas, antecedentes ni VIH. Menú: PACIENTES (Pacientes, Planes, Seguimiento) y CLÍNICA (Consultas, Fotos, Pie diabético, Plantillas ortopédicas, Quejas, Esterilización, Documentos y plantillas).

## Reglas aplicadas en cliente (lógica pura en `src/lib/clinico/`, con pruebas)

- `edad.js` edad/meses/menor de 18/cumpleaños (29-feb). `sinbad.js` SINBAD 0–6, sugerencia de ítems, resumen de monofilamento, ITB nunca 0 (P-011), riesgo IWGDF **apagado** salvo `parametros.pie_diabetico_criterios_activos` (P-010). `plan.js` generación de sesiones espejo de `generar_sesiones_plan` (extracción + 4 curaciones diarias, día hábil, «atrasada»; abandono a 30 días). `inmutabilidad.js` nota firmada bloqueada, motivos que impiden cerrar (espejo de `consulta_bi`), nota aclaratoria, fusión deshacible 30 días, retiro de foto con motivo, transiciones de orden de plantilla, anticipo 50 %. `impresos.js` formateo de los impresos (casillas Sí/No/No sabe, domicilio con Mz/Lt, tabla de visitas paginada, pie de página con versión del expediente y «COPIA», variables del consentimiento). `pacientes.js` alta (P-003), duplicados (P-006). `crm.js` inactivos a 180 días, cumpleaños, consentimiento comercial (P-148). `esterilizacion.js` estado de lote y uso de kit (P-023). `mapaPie.js` geometría de las 4 vistas.
- Pruebas: `node --test src/lib/clinico/` (47 pruebas: edad, SINBAD, plan, inmutabilidad, impresos, alta/duplicados, CRM, esterilización).
- La BD sigue siendo la autoridad; la interfaz explica el motivo antes de que la base rechace.

## Completo

Todas las pantallas anteriores con carga/vacío/error/sin conexión, solo lectura (clínica suspendida) y bitácora de ver expediente (`abrir_expediente`), impresiones (`datos_impreso`), exportaciones (DataTable) y lectura de VIH (`ver_dato_sensible`). Firma en pantalla con `FirmaPad` → imagen privada + fila inmutable en `firmas` (consentimientos, nota, recibo, valoración, estudio, entrega, nota aclaratoria). Historia clínica: 100 % del formato Pie Clinic (sede, N.º de expediente, domicilio con Mz/Lt, heredo-familiares, no patológicos, siluetas por pierna). Impresos A4 (consentimiento, antecedentes, seguimiento con 4 vistas y tabla de visitas, formato en blanco, bitácora). Plantillas de documento con versión.

## Simulado (modo explícito y visible)

- **Dictado por voz** (`lib/adaptadores/dictadoIA.js`, `MODO_DICTADO = 'simulado'`): graba o sube audio, pero **no transcribe**: inserta un texto marcado «TRANSCRIPCIÓN SIMULADA» que el podólogo debe reemplazar; no se puede aceptar con la marca. No propone campos (se capturan a mano y se aceptan/rechazan). El audio vive solo en el navegador (no se sube).
- **Videoconsulta** (`lib/adaptadores/video.js`, `MODO_VIDEO = 'simulado'`): solo cámara/micrófono locales del podólogo; el paciente no puede conectarse; compartir pantalla, pedir foto y capturar imagen deshabilitados.
- **Campañas / recordatorios / liga de firma por celular / encuesta**: se arman destinatarios, consentimientos y borradores; el envío real (WhatsApp/correo/SMS) no existe. Contacto manual por `wa.me` y `tel:`; el registro queda en `seguimientos_paciente`.

## Huecos y pendientes

- **Aviso al administrador** al abrir expediente de otra sede: la RPC deja la marca `notificar_administrador` en bitácora; no hay tabla de notificaciones, así que la interfaz avisa al usuario y Administración lo ve en la bitácora (sin push/correo).
- **Audio de dictado**: ningún bucket admite `audio/*` (`058`); hay que ampliar `allowed_mime_types` o crear bucket antes de la IA real. Función servidor `transcribir-dictado` y la purga `purgar_audios_dictado` (borrar archivos) no existen.
- **IP en la firma**: el cliente no conoce la IP; `firmas.ip` queda nulo hasta que una función/trigger la tome de la cabecera.
- **Difuminado real de fotos de docencia** (P-009): solo hay casilla de confirmación manual.
- **Exploración de miembro inferior** vive por consulta (`consulta_id`): la historia clínica la edita únicamente sobre una consulta abierta; si no hay, muestra la última.
- **PDF**: se imprime con el diálogo del navegador («Guardar como PDF»); no hay generación de PDF en servidor. «Descargar con firma digital» no se implementó como firma criptográfica.
- **Impresora por sede**: se elige en el diálogo del navegador.
- **Enlaces a otras áreas** (confirmar rutas): `/agenda/nueva?paciente=`, `/caja?cita=`, `/agenda`.
- Columnas a confirmar contra la BD real: `prp_ofertas(id,nombre)`, `prp_productos(id,nombre)`, `prp_facturas(folio,total,estado,created_at)`, retorno jsonb de `campana_agregar_destinatarios` y `crear_sala_videoconsulta` (se asume `token`), parámetros de organización `dias_inactivo`, `festivos`, `pie_diabetico_criterios_activos`, `sedes.horario.dias_cerrados`.
- Alta de paciente: «Enviar liga para firmar desde su celular» deshabilitado (requiere proveedor de mensajes). Papel escaneado: se adjunta desde Documentos del expediente (N-05).
- Cuota de almacenamiento (P-115), migración de expedientes en papel (N-07) y validación legal de los textos (P-139) quedan fuera de esta área.
