# Frontend · UTILERÍAS (clon de la sección UTILERÍAS de IRP)

Grupo de menú **UTILERÍAS** (al final de ADMIN, antes de RANNIX), solo **Administrador** (capacidad `utilerias.usar`). Código: `src/pages/utilerias/`, `src/routes/utilerias.jsx`, `src/menu/utilerias.js`, lógica pura y probada en `src/lib/utilerias/`. Migración nueva: `migraciones/060_utilerias_validacion.sql` (validada con `node scripts/validar-sql-local.mjs`: 43/43, sin tablas sin RLS ni políticas abiertas, vistas `security_invoker`, nada para `anon`).

## Equivalencias con IRP

| IRP (menú UTILERÍAS) | Pie Firme | Ruta |
|---|---|---|
| Cálculos del Sistema (`Calculos.jsx`) | `Calculos.jsx` | `/utilerias/calculos` |
| Validación (`Validacion.jsx`: guía de pruebas + reportes) | `Validacion.jsx`: chequeos de integridad automáticos | `/utilerias/validacion` |
| Catálogos (`Catalogos.jsx`, visor con enlaces a edición) | `Catalogos.jsx` (mismo concepto; no duplica la edición) | `/utilerias/catalogos` |
| Consulta a Base de Datos (`Utilidades.jsx`) | `ConsultaBD.jsx` (lista blanca, sin SQL libre) | `/utilerias/consulta-bd` |
| Entrega (`Entrega.jsx`: paquete de documentos) | `Entrega.jsx`: checklist de puesta en marcha | `/utilerias/entrega` |
| Consulta Asistente (`Utilerias.jsx`: bitácora de conversaciones) | `ConsultaAsistente.jsx`: auditoría del asistente existente | `/utilerias/asistente` |

## Pantallas

### Cálculos del sistema
- 10 cálculos documentados en 7 grupos: semana sábado→viernes, IVA exento/16 %/tasa 0, línea de ticket + descuento + PIN, anticipo/cancelación/reembolso, corte de caja, fondo revolvente + comprobante de gasto, EDR (`real_auto` + `real_ajustes` vs `proy_importe`, variación y semáforo), comisión sobre base sin IVA, vacaciones por ley + prima, costo promedio ponderado + autorización de compra.
- Cada uno muestra fórmula, descripción, origen (se captura / se calcula / viene de un módulo), **parámetros vigentes de la clínica** (de `organizaciones.parametros`, marcando los personalizados) y un **probador** con entradas manuales que llama a las MISMAS funciones puras de `src/lib/{finanzas,comercial,plataforma}`.
- 23 casos de referencia (tomados de REGLAS_NEGOCIO) se corren en vivo con ✔/✘ por cálculo y en un KPI global.
- Fuente: `src/lib/utilerias/calculos.js`. Vista de datos: ninguna (usa `useApp().organizacion.parametros`).

### Validación del sistema
- 12 chequeos con semáforo (verde / ámbar / rojo según severidad y conteo): ingresos sin cobro, ventas cobradas sin ingreso, facturas sin venta, ingresos descuadrados, citas atendidas sin cobro (>24 h), notas clínicas sin firmar (>24 h), consentimientos faltantes, expedientes duplicados, inventario negativo, conciliación pendiente (>3 días), cuadre EDR vs ingresos y cuadre EDR vs gastos (±$1.00, periodos abiertos, últimos 6 meses).
- Tablero con salud %, rojos, ámbares y casos; filtro por grupo; clic en un chequeo abre el detalle (referencia, fecha, importe, qué pasa), «cómo corregirlo», enlace al módulo y exportación a Excel (por chequeo y «Exportar todo»). Respeta la sede activa. Abrir la pantalla y exportar quedan en bitácora (`ver`/`exportar` entidad `validacion_sistema`).
- Solo señala; nunca corrige datos.
- Vistas (migración 060): `prp_validacion_detalle` (un renglón por registro con problema) y `prp_validacion_chequeos` (conteo/importe por sede y chequeo). Ambas devuelven filas solo si `piefirme_app.es_admin()` y de su propia organización. Reutiliza `prp_citas_sin_cobro` (029) y `prp_ingresos_descuadrados` (043).

### Catálogos
- Visor de solo lectura de 9 catálogos (catálogos de la clínica, servicios, productos, histórico de precios, proveedores, grupos de gasto, tipos de incidencia RH, esquemas de comisión, horarios) con conteos, búsqueda, columnas técnicas, subfiltro de `catalogos_clinica` y exportación a Excel. Cada uno tiene botón «Editar en …» a su pantalla real (Configuración → Catálogos, Catálogo y precios, Proveedores…): **no se duplica la edición**, que sigue viviendo en `Configuracion.jsx`.
- Vistas: `prp_catalogos`, `prp_servicios`, `prp_productos`, `prp_precios_historial`, `prp_proveedores`, `prp_grupos_gasto`, `prp_tipos_incidencia`, `prp_esquemas_comision`, `prp_horarios_atencion`.

### Consulta a base de datos
- Lista blanca de 45 vistas `prp_*` administrativas (`src/lib/utilerias/consulta.js`): finanzas, inventario, catálogo, operación y equipo. **No** incluye vistas con datos de paciente (pacientes, expediente, seguimiento, ventas con nombre, recibos de nómina, empleados).
- Flujo: elegir vista → se leen sus columnas → elegir columnas, filtros estructurados (igual, distinto, contiene, desde/hasta, mayor/menor), orden y máximo de filas (tope 5,000) → Consultar → tabla con búsqueda/orden/paginación → exportar a Excel (`DataTable`). Sin SQL libre: se arma con `leer()` (PostgREST) y el RLS manda.
- Bitácora: cada consulta registra `ver / consulta_bd` con vista, columnas, forma de los filtros (columna + operador, **nunca los valores**) y número de filas; cada exportación registra `exportar`.

### Entrega
- Checklist de 7 pasos: sedes/cabinas/horarios, usuarios y roles, catálogo y precios, plantillas y consentimientos, certificados y CFDI, importación inicial, capacitación. Cada paso muestra el estado de los datos (cumple / faltan / se confirma a mano), un aviso si la marca contradice los datos, estado manual (pendiente / en proceso / completado / no aplica), responsable y nota; barra y KPIs de progreso; **acta imprimible** (`ImprimirHoja`, queda en bitácora).
- Tablas/vistas (migración 060): `prp_entrega_indicadores` (conteos objetivos de la clínica) y `entrega_pasos` (estado por paso; RLS solo Administrador, auditada por trigger; escritura bloqueada con la clínica suspendida).

### Consulta del asistente
- El asistente de IA **ya existe** en `/asistente` (`pages/plataforma/admin/Asistente.jsx`); no se duplicó su lógica. Esta pantalla lo audita: pestaña «Datos consultados» (`prp_asistente_accesos`: quién, qué vista, filas, si identificó paciente, si se bloqueó; filtros por mes, vista, con paciente, bloqueadas, texto; agrupado por día) y pestaña «Mis conversaciones» (`prp_asistente_historial`) con enlace al asistente.

## Cambios mínimos fuera del área (avisar)
- `src/lib/registro.js`: se agregó `'UTILERÍAS'` a `GRUPOS_ORDEN` entre `ADMIN` y `RANNIX` (sin eso el grupo caía después de RANNIX).
- `src/lib/permisos.js`: capacidad `'utilerias.usar': cap([A])` (una línea).

## Qué quedó completo / simulado / huecos
- **Completo** (lógica y pantallas): las seis; 14 pruebas `node:test` en `src/lib/utilerias/utilerias.test.mjs` (cálculos y sus 23 casos, parámetros, semáforo, resumen de chequeos, lista blanca y validación de consultas, bitácora sin valores, entrega y progreso, catálogos, auditoría del asistente). Nada simulado: ninguna integración externa.
- **Pendiente de BD real**: aplicar `060` en QA y correr `node scripts/test-rls.mjs qa` (la migración solo se validó en PGlite). Las vistas de la lista blanca de Consulta y los catálogos se escribieron a partir de los resúmenes de esquema y las migraciones: si alguna columna/vista no existe, la pantalla muestra «vista no disponible» en vez de romper.
- **Limitación conocida (Consulta del asistente)**: por RLS (`asistente_mensajes`) el Administrador no puede leer las conversaciones de otros usuarios, solo los accesos a datos de todos y sus propias conversaciones. Ver los mensajes ajenos exigiría un cambio de política (decisión de privacidad del dueño).
- **Chequeos por afinar con datos reales**: umbrales (24 h, 3 días, ±$1.00, últimos 6 meses) están fijos en la vista; si el dueño los quiere por clínica, pasarlos a `organizaciones.parametros`. El cuadre de gastos compara a nivel clínica (los gastos compartidos se prorratean entre sedes). «Consentimientos faltantes» exige aviso de privacidad y consentimiento de datos de salud firmados (P-003).
- **Deuda detectada y no tocada**: `lib/comercial/anticipo.js` lee `anticipo_portal_pct` pero el parámetro real de la clínica se llama `anticipo_pct` (migración 057), por lo que el porcentaje de la clínica no se refleja en ese cálculo; Cálculos usa la clave real.
- No se hizo prueba visual en navegador (solo `npm run build` y pruebas de lógica).
