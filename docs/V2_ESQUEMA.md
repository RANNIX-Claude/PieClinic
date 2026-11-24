# V2 · Esquema de base de datos para la app «podologia» (mapa para el frontend)

Estado al **2026-11-21**. La app nueva («podologia») usa **la misma base compartida de QA y el mismo esquema `piefirme`** del sistema Pie Firme. Todo es **aditivo** (no se alteró ni borró ninguna tabla, política, columna ni el enum `rol_usuario`). Solo QA; **producción no se tocó**.

Migraciones nuevas (`migraciones/`): 064 personal base · 065 checador · 066 capacitación y acervo · 067 finanzas · 068 desempeño · 069 comercial · 070 comunicación · 071 vistas `prp_*` · 072 storage. Semillas: `supabase/semillas/G_01 … G_06`.
Convenciones de las tablas nuevas: `organizacion_id uuid not null default piefirme_app.org_id()` (se deriva solo en `insert`; no hace falta mandarlo), RLS desde el nacimiento con `piefirme_app.c_politicas`, lectura desde vistas `prp_*` (security_invoker) y escritura en tablas base, `sintetico boolean` en las tablas con datos de prueba.

## 1. Sedes: correspondencia S1..S7 ↔ sedes reales (ATENCIÓN: hay sedes duplicadas)
QA tenía **10 sedes** en una sola organización (`00000000-0000-0000-0000-00000000c0de`): cinco **operativas** (con citas, ventas, cabinas, perfiles de prueba) y cinco **duplicadas** con clave en minúscula creadas por la semilla D_01 (solo cuelgan de ellas 15 empleados de D_01, algunos gastos y 7 perfiles `@ejemplo.invalid`). No se renombró ni borró nada.

| App | Nombre app | Clave | Sede real (id) | Nota |
|---|---|---|---|---|
| S1 | Centro | `CHA` | `5e000000-0000-0000-0000-000000000001` Chalco | operativa |
| S2 | Norte | `CEN` | `5e000000-0000-0000-0000-000000000002` Centenario | operativa |
| S3 | Sur | `GAL` | `5e000000-0000-0000-0000-000000000003` Galerías | operativa |
| S4 | Oriente | `PAT` | `5e000000-0000-0000-0000-000000000004` Patio | operativa |
| S5 | Poniente | `SEN` | `5e000000-0000-0000-0000-000000000005` Sendero | operativa |
| S6 | Polanco | `POL` | `5e000000-0000-0000-0000-000000000006` | **nueva** (G_01, con 2 cabinas) |
| S7 | Coyoacán | `COY` | `5e000000-0000-0000-0000-000000000007` | **nueva** (G_01, con 2 cabinas) |

Duplicadas sin uso operativo (claves `chalco`, `centenario`, `galerias`, `patio`, `sendero`; ids aleatorios): **el frontend debe ignorarlas** (filtrar por `clave in ('CHA','CEN','GAL','PAT','SEN','POL','COY')`). Las asignaciones «trabajando en» sembradas para los 15 empleados de D_01 ya apuntan a la sede operativa equivalente. **Decisión pendiente del dueño**: consolidar (migrar sus empleados/gastos a la operativa y desactivar la duplicada) o dejarlas.

## 2. Cargos (8 de la app) ↔ rol de la base
`perfiles.cargo` y `empleados.cargo` (check con los 8 valores; nulos permitidos). Helper `piefirme_app.cargo()` = `perfiles.cargo` o, si es nulo, deducido del rol. **El rol de seguridad no cambia.**

| cargo app | rol base | `empleados.puesto` (check existente, no se tocó) | sedes del perfil |
|---|---|---|---|
| direccion | administrador | administrador | `{}` (todas) |
| admin | administrador | administrador | `{}` |
| gerente | administrador | administrador | `[su sede]` (`piefirme_app.es_gerente()`) |
| podologo | podologo | podologo | sedes donde rota |
| recepcion | recepcion | recepcion | — |
| cajero | recepcion | recepcion | — |
| almacen | recepcion | apoyo | — |
| asistente | recepcion | apoyo | — |

Cuentas de prueba (solo se llenó `perfiles.cargo`; rol y sedes sin cambio): a@, du@ = direccion · m@, sa@ = admin · **adm@ = gerente (sigue con sedes `{}`: para probar el alcance de gerente hay que poner `perfiles.sedes = [sede]`)** · r@ = recepcion · r1@ = cajero · r2@ = asistente · recepcion@sintetico.test = cajero (es el cajero de las 7,230 ventas) · p@, p1..p5@ y podologo1..5@sintetico.test = podologo. No existe cuenta de `almacen` (decisión: ¿crear una con `scripts/qa-usuarios-prueba.mjs`?).

## 3. Tablas y columnas nuevas
**064 Personal**
- `perfiles.cargo`, `empleados.cargo`, `empleados.foto_path` (bucket `pf-equipo`, ruta `<org>/fotos/<empleado_id>.jpg`).
- `empleado_asignaciones` («Trabajando en» por día): `empleado_id, sede_id, fecha, origen (programada|autoelegida|gerente|checador|sistema), registrado_por` · único `(empleado_id, fecha)`. Cada persona lee/crea las suyas (y edita las de hoy en adelante) **solo en sedes de su `perfiles.sedes`**; el administrador, las de sus sedes. RPC `piefirme.elegir_sede_hoy(p_sede)`.
- `empleado_movimientos`: `empleado_id, tipo (alta|baja|cambio_sede|cambio_puesto), fecha, sede_origen_id, sede_destino_id, motivo, detalle jsonb`. Trigger automático en `empleados` (alta, baja, cambio de sede/puesto).
- Helpers `piefirme_app.cargo()`, `es_gerente()`, `hoy()`, `sede_hoy()` (asignación de hoy, o sede de contrato). Función `piefirme.equipo_directorio()` (definer; nombre, foto, cargo, sede de hoy, sin datos sensibles).

**065 Checador**: `checadas.registrado_por`, `checadas.asignacion_id`; política `chk_ins_propia` (cada persona registra **su** checada, origen `app`, en la sede `sede_hoy()`, con hora del servidor ±10 min). RPC `piefirme.checar('entrada'|'salida')`. La asistencia se consolida sola (trigger existente).

**066 Capacitación y acervo**: `cursos` (titulo, descripcion, categoria, cargos[], sede_id, obligatorio, duracion_min, portada_path, orden, activo) · `lecciones` (curso_id, orden, titulo, tipo video|foto|documento|texto, `video_url` solo enlaces YouTube, `video_pendiente`, recurso_path, contenido) · `curso_avance` (perfil_id, curso_id, leccion_id, completado_en; único perfil+lección) · `curso_evaluaciones` (pregunta, opciones jsonb, correcta) · `curso_resultados` (perfil_id, curso_id, intento, calificacion, aprobado) · `acervo_documentos` (titulo, tipo, url | storage_path | contenido, categoria, etiquetas[], cargos[], sede_id, version, estado). Visibilidad por cargo y sede; escribe el administrador.

**067 Finanzas**: `gastos_recurrentes` (sede_id nulo = compartido, grupo_id, proveedor_id, concepto, monto, frecuencia, dia_del_mes, proxima_fecha…) · `notas_compra` (comprobante_id, gasto_id, cuenta_por_pagar_id, proveedor, fecha_nota, folio_nota, subtotal/iva/total, forma_pago, estado borrador|revisada|aplicada|descartada, fuente ia|manual, `confianza_global`, `confianza_campos jsonb`, `requiere_revision`) · `notas_compra_lineas` (descripcion, producto_id, cantidad, precio_unitario, importe, confianza) · `comprobantes_carga.confianza_campos jsonb`.

**068 Desempeño**: `ventas.vendedor_id` (**vendedor = `coalesce(vendedor_id, cajero_id)`**; la sede de la venta `ventas.sede_id` = sucursal «trabajando en») · `bono_esquemas` (tipo individual|sucursal, periodo mensual|trimestral, base, tipo_pago monto|porcentaje, `escalones jsonb [{desde,valor}]`, cargos[], sedes[], `condiciones jsonb`) · `bonos_calculados` (esquema_id, empleado_id | sede_id, periodo_inicio/fin/etiqueta, base_valor, meta_valor, escalon, monto, cumple_condiciones, estado calculado|autorizado|pagado|cancelado) · `bono_detalle` (venta_id, importe_atribuido) · `metas_mensuales` (sede_id, `mes` = primer día, meta_ventas/servicios/productos/ocupacion; `metas` de 052 intacta) · `evaluacion_respuestas` (cita_id, podologo_id, calif_servicio/podologo/sucursal 1-5, comentario, canal, estado_seguimiento no_requiere|pendiente|en_atencion|resuelta).

**069 Comercial**: `productos.imagen_path / descripcion_web / precio_web` · `pedidos_web` (+`pedidos_web_lineas`) · `auditorias_inventario` (+`auditoria_fotos`: storage_path, origen colaborador|camara, cantidad_esperada/ia/confirmada, confianza). El historial del asistente **ya existe** (`asistente_conversaciones`, `asistente_mensajes`): no se creó `asistente_log`.

**070 Comunicación**: `com_hilos` (tipo directo|grupo|sucursal|rol) · `com_hilo_miembros` · `com_mensajes` · `com_mensaje_lecturas` · `correos_internos` · `correo_destinatarios` (para|cc, leido_en, etiquetas[], destacado, archivado, eliminado_en) · `feed_publicaciones` (tipo aviso|logro|reconocimiento|evento|foto; alcance_sede_id) · `feed_reacciones` · `feed_comentarios`. Privacidad: hilos directos solo sus dos miembros (ni el administrador); correo solo remitente/destinatarios (borrador solo el autor); avisos/eventos/reconocimientos solo los publica el administrador.

**072 Storage** (privados, URL firmada, ruta `<org>/…`): `pf-equipo` (fotos de personal en `fotos/` solo administrador; feed y adjuntos: toda la clínica) · `pf-catalogo` · `pf-acervo` (leen todos, escribe administrador) · `pf-auditorias` (administrador y recepción).

## 4. Vistas `prp_*` (security_invoker)
`prp_equipo_hoy`, `prp_empleado_asignaciones`, `prp_empleado_movimientos`, `prp_cursos` (con `mi_avance_pct`), `prp_lecciones` (`mi_completada`), `prp_curso_avance_equipo`, `prp_acervo`, `prp_gastos_recurrentes`, `prp_notas_compra`, `prp_bono_esquemas`, `prp_bonos_calculados` (`es_mio`), `prp_bono_detalle`, `prp_metas_mensuales` (`vendido`, `cumplimiento_pct` reales), `prp_evaluaciones`, `prp_evaluacion_resumen_mensual`, `prp_ventas_vendedor` (`vendedor_efectivo_id`), `prp_pedidos_web`, `prp_auditorias_inventario`, `prp_auditoria_fotos`, `prp_com_hilos` (`titulo`, `no_leidos`), `prp_com_mensajes` (`es_mio`, `leido_por_mi`), `prp_correos_bandeja`, `prp_correos_enviados`, `prp_feed` (`reacciones`, `mis_reacciones`, `comentarios`), `prp_feed_comentarios`.

## 5. Estado de demostración de la app → base de datos
| App (`podologia.demo.v2`) | Base |
|---|---|
| `d.sucursales` S1..S7 | `sedes` (tabla de §1) |
| `d.usuarios[].rol` | `perfiles.cargo` (+ `perfiles.rol`) |
| `d.rh.empleados` | `empleados` (+`empleado_sueldo_historial`, `empleado_documentos`, `horarios_laborales`); `foto` → `foto_path`; `sueldoMensual` ↔ `salario_periodo` (quincenal) |
| `d.rh.asistencia` | `checadas` → `asistencia` (consolidada) |
| `d.rh.asignaciones` | `empleado_asignaciones` |
| `d.rh.incidencias` / `d.rh.vacaciones` | `incidencias_rh` / `vacaciones_detalle` (+`vacaciones_anio`) |
| `d.rh.movimientos` | `empleado_movimientos` |
| `d.rh.recibos` | `prenomina` / recibos de nómina (052) |
| `d.cap.cursos / avance` · `d.cap.acervo` | `cursos`+`lecciones`+`curso_evaluaciones`/`curso_resultados` + `curso_avance` · `acervo_documentos` |
| `d.fin.gastos` | `gastos` (+`gasto_lineas`, `grupos_gasto`) |
| `d.fin.recurrentes` / `d.fin.notasCompra` | `gastos_recurrentes` / `notas_compra`(+`_lineas`; lectura IA en `comprobantes_carga`) |
| `d.cxp`, `d.proveedores` | `cuentas_por_pagar`, `proveedores` |
| `d.bonos.esquemas` | `bono_esquemas` · cálculos → `bonos_calculados` + `bono_detalle` |
| `d.bonos.metas[{sucursalId,mes,meta}]` | `metas_mensuales` |
| `d.eval` | `evaluacion_respuestas` (ligada a `citas`; `encuestas` sigue siendo el NPS de un solo valor) |
| `d.ventas[].vendedorId ?? cajeroId` | `ventas.vendedor_id ?? ventas.cajero_id` (`prp_ventas_vendedor`) |
| `d.pedidosWeb` | `pedidos_web` + `pedidos_web_lineas` |
| `d.auditorias` | `auditorias_inventario` + `auditoria_fotos` |
| `d.asistenteLog` | `asistente_conversaciones` / `asistente_mensajes` (ya existían) |
| `d.com.hilos[].mensajes` | `com_hilos` + `com_hilo_miembros` + `com_mensajes` (+`com_mensaje_lecturas`) |
| `d.com.correos` | `correos_internos` + `correo_destinatarios` |
| `d.com.feed` | `feed_publicaciones` + `feed_reacciones` + `feed_comentarios` |

Ids de la app (`U1`, `E3`, `S2`…) no existen en la base: todo son uuid. `usuarioId` → `perfiles.id` (= `auth.uid()`), `empleadoId` → `empleados.id`, `sucursalId` → `sedes.id`.

## 6. Qué quedó aplicado a QA
- **Migraciones 064–072: aplicadas** una por una con `apply-migration.mjs qa` y registradas (`verificar-post-migracion`: 55/55 al día, sin deriva).
- **Semillas G_01–G_06: aplicadas** y verificadas idempotentes (segunda corrida = mismos conteos). Filas en QA: sedes +2 (12 en total; 7 operativas + 5 duplicadas), empleados +53 (68), asignaciones 858 (hoy ± 7 días), movimientos 77, cursos 8, lecciones 28, evaluaciones de curso 8, avance 231, resultados 5, acervo 12, gastos recurrentes 45, notas de compra 75 (+145 líneas), esquemas de bono 4, bonos calculados 159, detalle de bono 168, metas mensuales 98, evaluaciones 1,699, pedidos web 60 (+115), auditorías 21 (+105 fotos), hilos 17 (134 miembros, 163 mensajes, 962 lecturas), correos 42 (99 destinatarios), feed 24 (131 reacciones, 50 comentarios).
- `test-rls.mjs qa`: 218 pruebas, **12 fallas, todas previas y ajenas a V2** (`_rannix_semillas` sin RLS; `rls.config.json` declara las funciones `portal_*` sin el prefijo `piefirme.` que compara el script; bucket `comercio_img` del otro sistema es público). Ninguna tabla, vista, política o bucket nuevo falla.
- Local: `validar-sql-local.mjs` 55/55, sin tablas sin RLS, sin políticas abiertas, sin vistas sin security_invoker, sin objetos fuera de `piefirme*`; pruebas funcionales con roles (PGlite): un podólogo solo ve su empleado, el directorio mínimo funciona, `checar()` solo en la sede de hoy y con fecha del servidor, la cajera no ve nada de bonos ajenos, los hilos directos no los ve el administrador.

## 7. Pendiente / límites (decisiones del dueño)
1. **Sedes duplicadas** (§1): consolidar o ignorar. El frontend debe filtrar por las 7 claves.
2. **Rotación**: «Trabajando en» (RLS) solo deja elegir sedes que estén en `perfiles.sedes`. p@g.com tiene solo Chalco; para probar el cambio de sede hay que darle una segunda sede (no se modificó ninguna cuenta existente).
3. Cuenta de **gerente** con alcance real (sedes = [su sede]) y cuenta de **almacén**: no existen; `adm@g.com` quedó con cargo gerente pero ve todas las sedes.
4. Las 7,230 ventas históricas tienen un solo cajero y `vendedor_id` nulo (no se tocaron ventas de periodos cerrados); los bonos individuales de producto salen de ese único cajero. POL y COY no tienen ventas históricas (tienen meta, no bonos).
5. Sin archivos reales en Storage: `foto_path`, `imagen_path`, `storage_path` de fotos de auditoría y lecciones tipo foto/documento van nulos. Los videos de capacitación quedan `video_pendiente = true` (sin IDs de YouTube inventados). Textos de cursos y acervo son **borrador por validar**.
6. Tienda pública sin sesión: `pedidos_web` no está abierta a `anon`; falta una RPC `portal_*` (y declararla en `rls.config.json`) cuando haya pasarela. Pagos de pedidos: `simulado`.
7. Funciones externas (IA de notas, visión de auditoría, correo/WhatsApp salientes): solo el almacenamiento; el adaptador sigue simulado.
8. Procedimiento para repetir en otro ambiente QA: `node scripts/apply-migration.mjs qa migraciones/NNN_x.sql` (064→072, de una en una) y luego las semillas G_01→G_06 en orden (cada una en una transacción; `cargar-semilla.mjs` usa la API de administración y puede dar 403 con el token de usuario de Windows: en ese caso correr el archivo por la conexión directa del repo). Después `node scripts/verificar-post-migracion.mjs qa`.
