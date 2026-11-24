# Frontend · área PLATAFORMA (inventario, equipo, administración, RANNIX)

Rutas: `src/routes/plataforma.jsx` (reúne `src/pages/plataforma/{inventario,equipo,admin}/rutas.jsx` + la pública `/aceptar-invitacion`).
Menú: `src/menu/plataforma_{inventario,equipo,admin,rannix}.js`. Lógica pura con pruebas: `src/lib/plataforma/*.js` (`node --test src/lib/plataforma/`).
Adaptador de IA: `src/lib/adaptadores/ia.js`. Funciones servidor: `netlify/functions/`.

## Pantallas

| Ruta | Mockup | Roles | Vistas / tablas / RPC principales |
|---|---|---|---|
| `/inventario` | 21 | A, P, R | `prp_inventario`, `prp_lotes`, `prp_kardex`, `inventario_sede` (mín/máx), `lote_cambiar_estado` |
| `/inventario/producto/:id` | (IRP ExpedienteProducto) | A, P, R | `prp_productos`, existencia por sede, lotes, kardex, `historico_costos`, proveedores; bitácora «ver» |
| `/traspasos` | 22 | A, R | `prp_traspasos`, `prp_traspaso_lineas`, `traspaso_enviar/recibir/cancelar` |
| `/compras` | 23 | A, R | `prp_ordenes_compra`, `prp_oc_lineas`, `prp_recepciones`, `oc_autorizar`, `recepcion_registrar`, `devoluciones_proveedor`, `prp_compras_proveedor` |
| `/proveedores`, `/proveedores/:id` | 24 | A, R (editar A) | `prp_proveedores`, `proveedores_bancarios` (CLABE solo A), `proveedor_documentos`, `proveedor_productos`, `prp_cuentas_pagar`, `proveedor_vincular_nombre` |
| `/mermas-conteos` | — | A, R | `prp_mermas`, `merma_resolver`, `conteos_fisicos`, `conteo_lineas`, `conteo_autorizar` |
| `/rh` | 39 | A | `prp_empleados`, `prp_asistencia*`, `prp_incidencias_rh`, `prp_vacaciones_*`, `prp_vacantes`, `candidatos`, `prp_nomina_periodos`, `prp_prenomina`, `prp_recibos_nomina`, `rh_importar_checadas`, `nomina_*`, `vacaciones_generar_anio` |
| `/rh/empleado/:id` | (IRP ExpedienteEmpleado) | A | `prp_expediente_empleado`, `prp_historico_sueldos`, `prp_empleado_documentos`; bitácora «ver»; CLABE enmascarada salvo A |
| `/mis-recibos` | 39 | P, R | `prp_recibos_nomina` (solo el propio), `nomina_firmar_recibo` |
| `/comisiones` | 40 | A (todas), P (propias) | `prp_esquemas_comision`, `prp_comisiones`, `prp_comision_detalle`, `prp_metas`, `comisiones_registrar_detalle/cerrar_periodo/reabrir_periodo` |
| `/mantenimiento` | 41 | A, P, R (gestionar A) | `prp_equipos`, `prp_ordenes_trabajo`, `prp_ot_historial`, `prp_ot_evidencias`, `prp_mantenimiento_mes`, `ot_regularizar` |
| `/importar` | 13 | A | `importaciones`, `prp_importaciones`, `prp_importacion_mapeos/filas`, `importacion_*`; funciones `importacion-cargar`, `importacion-revertir` |
| `/usuarios` | 44 | A | `perfiles`, `prp_invitaciones`, `invitacion_revocar`; función `usuarios-admin` |
| `/configuracion` | 45 | A | `organizaciones`, `sedes`, `prp_configuracion_clinica`, `parametro_actualizar`, `plantillas_documento`, `prp_catalogos` |
| `/suscripcion` | 46 | A | `prp_suscripcion`, `prp_cobros_suscripcion`, `suscripcion_*`, `soporte_tickets/mensajes/accesos` |
| `/asistente` | 47 | A, P | `asistente_vistas_permitidas`, `asistente_*` (logs P-125), `prp_asistente_historial`; adaptador `consultarAsistente`; función `ia-asistente` |
| `/exportar-datos` | — | A | `exportar_clinica_catalogo/tabla/archivos` + ZIP con jszip en el navegador; bitácora «exportar» |
| `/rannix`, `/rannix/soporte` | 48 | rannix | solo función `rannix-panel` → RPC `rannix_*` (metadatos, nunca datos de salud) |
| `/aceptar-invitacion` | (49 relacionado) | pública | función `invitacion-aceptar` |

El Login (49) ya existía y no se tocó.

## Funciones servidor (`netlify/functions/`)

Variables de entorno solo de servidor: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (o `IA_API_KEY`), opcional `IA_MODELO`, `IA_PROVEEDOR`.

| Función | Qué hace | Estado |
|---|---|---|
| `ia-estado` | dice si hay llave de IA (`activo` / `no_configurado`) | lista |
| `ia-importacion` | propuesta de mapeo con IA para Excel/CSV | lista; sin llave responde `no_configurado` y el navegador usa el mapeador heurístico etiquetado simulado. PDF/imagen: 501 pendiente |
| `ia-asistente` | respuesta del asistente con el contexto que manda el navegador (vistas permitidas, RLS del usuario) | lista; sin llave, respuesta simulada |
| `importacion-cargar` | carga el lote confirmado con el JWT del administrador y anota `registro_tabla/registro_id` | pacientes, productos, proveedores, checadas; citas, historial e imágenes: 501 pendiente |
| `importacion-revertir` | `importacion_revertir` + borra lo creado (tablas permitidas) | lista |
| `usuarios-admin` | invitar, reenviar, cambiar rol/sedes, activar/desactivar (service_role tras validar la organización; conserva al menos un admin) | lista; el correo NO se envía (devuelve el enlace) |
| `invitacion-aceptar` | pública; crea la cuenta y consume la invitación (`invitacion_consumir`) | lista |
| `rannix-panel` | whitelist de RPC `rannix_*` exigiendo `rannix_staff`; arma el enlace de alta de clínica | lista |

## Qué quedó completo

Todas las pantallas de la lista con carga, vacío, error, sin conexión, permisos por rol y solo lectura; escritura por tablas base o RPC; bitácora en ver expediente, imprimir y exportar. Pruebas `node:test` (38) de: mapeo heurístico, duplicados (P-006), clínicos a revisión (P-123), autorización de compras por monto (P-081), costo promedio, prenómina, comisiones, descuento por incidencias, vacaciones por ley (P-110), lectura del checador.

## Qué quedó simulado

- IA (importación, asistente): adaptador con modo `simulado` visible («Modo simulado: sin llave»). El mapeador heurístico es real; la respuesta del asistente no razona.
- Sin timbrado de nómina (P-104); IMSS/ISR/subsidio se capturan a mano.
- El correo de invitación no se envía: el administrador copia el enlace.

## Huecos y por confirmar contra la BD real

- Ningún flujo se probó contra Supabase (sin conexión); verificar con `npm run test:rls` y una pasada manual en QA.
- Inventario: editar partidas de OC/traspaso borra y reinserta (confirmar que triggers de totales/autorización lo toleran); `prp_productos` podría no heredar RLS para el podólogo.
- Equipo: carga de comisiones usa `ventas!inner`/`venta_lineas`/`ingresos` (confirmar lectura); `candidatos`, `periodos_comision`, `mantenimiento_presupuestos` se leen de tabla (no hay vista); sesiones de plan sin cobro tienen base 0 (revisar regla); falta PDF de recibo (función servidor), «ingreso por hora de cabina» y la pestaña de esterilización del mockup 41 (es de otro dominio).
- Admin: columnas de `plantillas_documento`, `pac_configuracion`, `emisor_fiscal`, `horarios_atencion`; la clave `.key`/contraseña del CSD no se carga (servidor/PAC); 2FA y bloqueo por intentos solo se muestran como parámetros.
- Importación: cargadores de citas, historial clínico e imágenes pendientes; PDF e imagen requieren llave de IA; las existencias y precios de productos importados no se cargan (requieren sede y precio vigente).
- `importar.usar` en `permisos.js` incluye Recepción pero RLS y confirmación son solo Administrador (CA-08): ruta y menú se dejaron solo para Administrador.
- Cambios mínimos fuera del área: `package.json` (+`jszip`).
