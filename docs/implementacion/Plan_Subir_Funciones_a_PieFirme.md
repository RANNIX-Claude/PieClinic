# Plan: llevar a Pie Firme lo que hoy solo existe en Pie Clinic

> **Aclaración del 24-nov-2026:** hay **un solo sistema, Pie Firme**. Pie Clinic es un **cliente** al que se le implementa; `work/podologia` (PODIX) es solo la demo y la referencia de lo que se quiere construir. Por eso "llevar a Pie Firme" quiere decir construir esas funciones en el sistema principal, y la implementación de Pie Clinic selecciona de ahí lo que salió de la junta. El data warehouse, los tableros y las utilerías son parte formal del sistema. Los flujos y perfiles detallados están en [Procesos_y_Flujos_PieClinic.md](Procesos_y_Flujos_PieClinic.md) y **tienen prioridad sobre las secciones 1.5 y 7 de este plan**, que habrá que actualizar.

**Objetivo:** que Pie Firme (`work/ClinicaPodologia/DEv`) sea el sistema completo, con las funciones que la demo de Pie Clinic (`work/podologia`) muestra y Pie Firme no tiene, más lo pedido en la junta.

Base: [Comparativo_PieFirme_vs_PieClinic.md](Comparativo_PieFirme_vs_PieClinic.md). Estado a 24-nov-2026. Este plan no modifica código ni base de datos.

## 1. Reglas del plan

1. **Se clona la funcionalidad completa, no una versión básica.** Cada pantalla de Pie Clinic se lleva con toda su lógica (regla del proyecto: clonar, no reconstruir; sin MVP).
2. **Lo que se reutiliza de Pie Clinic es la lógica pura y las reglas.** Los archivos `reglas_*.js` y los motores (`desempeno_motor.js`, `plataforma_calculos.js`) no dependen de `localStorage` y se pueden portar a `src/lib/` de Pie Firme. Las **acciones** (`acciones_*.js`) se reescriben como llamadas a RPC y tablas con RLS. Las **pantallas** se reescriben con el estilo de Pie Firme (Tailwind, React Router, React Query).
3. **Cada módulo sigue el contrato de Pie Firme** (`docs/FRONTEND_ARQUITECTURA.md`): páginas en `src/pages/<área>/`, rutas en `src/routes/<área>.jsx`, menú en `src/menu/<área>.js`, permisos en `src/lib/permisos.js`. Cada módulo toca solo sus archivos.
4. **Cada tabla nueva** va en `migraciones/NNN_tema.sql` (siguiente número: **073**), con RLS por organización, rol y sede, vista `prp_*`, bitácora y su semilla sintética. Convenciones en `docs/CONVENCIONES_ESQUEMA.md`.
5. **Roles (decidido el 24-nov-2026):** los tres de Pie Firme se quedan (administrador = dueños, podólogo, recepción = caja y recepción de mercancía) y se agrega **un cuarto, `supervisor`**, con alcance sobre varias sucursales. Es el único rol nuevo. Lo demás que Pie Clinic reparte entre cajero, almacén y gerente se resuelve por **capacidad** en `permisos.js` y por **funciones habilitadas** a un usuario (ver bloque F). Las autorizaciones las resuelve el administrador (dueños).
6. **Nada se aplica a la base compartida (BITDATA), ni se publica, sin tu autorización.** Cada migración se valida primero en local (`scripts/validar-sql-local.mjs`) y después en QA con `test-rls.mjs`.

## 2. Qué se va a llevar

### Bloque A — Caja, anticipos y crédito (prioridad: arranque del paralelo)

Lo que más pidieron los dueños y que Pie Firme no tiene.

| # | Función | Origen en Pie Clinic | Qué crear en Pie Firme | Tamaño |
|---|---|---|---|---|
| A1 | **Anticipos con Liquidar** para calzado y plantillas a medida | `cajero/apartados`, `mas/nuevo-apartado`, `acciones_cajero.js`, `reglas_ventas.js` | **Decidido: se extiende `anticipos` (migr. 025)**, sin crear `apartados`. Nota de anticipo, abonos, botón Liquidar, vigencia, prórroga, política al vencer. Parámetros por sucursal | M |
| A2 | **Crédito y venta a plazos** con saldo por paciente y por encargada | `mas/venta-plazos`, `cajero/porcobrar`, `reglas_tesoreria.js` | Extender `cuentas_por_cobrar` (migr. 043): límite de crédito, plan de pagos, parcialidades, interés, recargo, días de gracia. Cartera vencida | L |
| A3 | **Devoluciones de cliente** | `mas/devoluciones` | Tabla y RPC con motivo, reembolso, cambio o nota de crédito, reingreso a inventario o merma | M |
| A4 | **Autorizaciones por nivel** (descuentos, devoluciones, créditos, ajustes) | `gerente/autorizar`, `admin/autorizar` | Tabla `autorizaciones` con solicitante, resolutor, monto y motivo; ninguna acción sensible se ejecuta sin ella. Resuelve el administrador | M |
| A5 | **Cambio de turno** con arqueo y firma | `cajero/caja`, `mas/ventas-turno` | Completar `CajaCorte` con corte parcial y firma de quien sale y quien entra | S |
| A6 | **Precio central único** | Un solo precio por producto y servicio para todas las sucursales; el cambio lo hacen los dueños (o quien tenga la capacidad de catálogo) y se refleja en todas, con histórico de precios. No se construye ajuste por sucursal. Es lo que Pie Firme ya hace en `precios`: solo falta confirmarlo con el flujo de Centenario | S |

### Bloque B — Inventario y traspasos

| # | Función | Origen | Qué crear | Tamaño |
|---|---|---|---|---|
| B1 | **Reparto desde el almacén central** con sugerido según venta y existencia | `mas/reparto-central`, `acciones_pie_clinic.js` | Extender `traspasos` (migr. 041): reparto sugerido, aprobación y envío | M |
| B2 | **Recepción con faltantes** y diferencias a cuenta de la encargada | `almacen/traspasos`, `almacen/recibir` | Estados en tránsito, recibido completo y recibido con diferencias; bitácora de faltantes | M |
| B3 | **Requisición formal** de sucursal a matriz (reemplaza el chat de WhatsApp) | *No existe en Pie Clinic* (hoy solo en documentos) | Tabla `requisiciones`; la orden de compra y el pago a proveedor se ligan a ella | M |
| B4 | **Auditoría de inventario a distancia con foto** | `mas/auditoria-foto` | Ya hay esquema (migr. 069). Falta pantalla e investigaciones | M |
| B5 | **Entrega de plantillas** del laboratorio al paciente | `mas/entrega-lab` | Extender `036_plantillas_ortopedicas` | S |
| B6 | **Nota de compra con IA** | `mas/captura-compra` | Esquema existe (067). Falta pantalla y la función de IA | M |
| B7 | **Producto especial con complementos** (almas, virón, cuña, molde, centímetros) | `reglas_ventas.js` | Catálogo de complementos con precio, que suman a la nota y arman la descripción de factura | M |

### Bloque C — Lo pedido en la junta que ninguno tiene

| # | Función | Qué crear | Tamaño |
|---|---|---|---|
| C1 | **Pantalla secundaria para el paciente** | Vista de solo lectura, en una ventana aparte, con lo que se cobra en tiempo real | S |
| C2 | **Notas foliadas de contingencia** | Blocs por sucursal con folio inicial y final, **entregados y controlados por los dueños** (cada entrega queda registrada); captura posterior, folio ligado al cobro y escaneo; alerta de folios faltantes | M |
| C3 | **Etiquetas y códigos de barras propios** | Generar código para productos, servicios y plantillas, e imprimir etiqueta con precio ligado al código | M |
| C4 | **Conciliación con Clip** | Cruzar los cobros con tarjeta contra el reporte de la terminal y marcar los que no aparecen | M |
| C5 | **Cuadre del paralelo** | Pantalla de cierre diario: sistema contra notas de papel, Clip y efectivo; diferencias con motivo. Se describe en el plan del paralelo | M |

### Bloque D — Pantallas de lo que ya tiene esquema (13 funciones)

El esquema ya existe (migraciones 064 a 072). Se clona la pantalla desde Pie Clinic y se conecta a la base.

| # | Función | Pantallas de origen | Tamaño |
|---|---|---|---|
| D1 | Checador con GPS | `mas/checador` | S |
| D2 | Rotación de podólogos | `mas/rotacion`, `mas/equipo` | S |
| D3 | Bonos y metas, "Mis bonos" | `mas/bonos`, `mas/mis-bonos`, `desempeno_motor.js` | L |
| D4 | Evaluaciones de clientes | `mas/evaluaciones` | M |
| D5 | Capacitación y acervo | `mas/capacitacion`, `mas/acervo` | M |
| D6 | Mensajes, correo interno y feed | `mas/mensajes`, `mas/correo`, `mas/feed` | L |
| D7 | Tienda en línea y pedidos web | `publico/tienda`, `mas/pedidos-web` | L |
| D8 | Gastos recurrentes | `mas/gastos` | S |

### Bloque E — Dirección y comercial

| # | Función | Origen | Tamaño |
|---|---|---|---|
| E1 | **Tablero del dueño**: ranking de sucursales contra meta, ticket, margen por línea y marca | `mas/tablero-dueno` | M |
| E2 | **Pacientes dormidos** con mensaje de reactivación | `mas/dormidos` | S |
| E3 | **Convenios** (empresas, aseguradoras) | `mas/convenios` | M |
| E4 | **Recetas** | `mas/recetas` | S |
| E5 | Reparto de la información por sucursal y consolidado | Vistas `prp_*` del dueño | S |

### Bloque F — Roles, firma y flujos que salieron de tus aclaraciones

Detalle de cada flujo en [Procesos_y_Flujos_PieClinic.md](Procesos_y_Flujos_PieClinic.md).

| # | Función | Qué crear en Pie Firme | Tamaño |
|---|---|---|---|
| F1 | **Rol `supervisor`** | Valor nuevo en el enum `rol_usuario` (migración 073); políticas RLS por sedes asignadas; capacidades propias (ver ventas, caja y cortes, inventario, traspasos, asistencia y turnos de todas sus sucursales; **autorizar descuentos** hasta el tope que fijen los dueños (parámetro), **autorizar devoluciones** hasta el monto que fijen los dueños (parámetro) y **autorizar permisos de personal**; sin precios, catálogo ni configuración). Agregarlo a `permisos.js`, menú, `verificar-roles.mjs` y `rls.config.json`. Panel de supervisión multi-sucursal | L |
| F2 | **Funciones habilitadas por usuario** | Un usuario puede tener, además de su rol, funciones como "caja" o "recepción de mercancía" (por ejemplo un podólogo que también cobra). Se configura en Usuarios | M |
| F3 | **Firma al cobrar** | Antes de cobrar, la persona se firma con su **PIN personal** (decidido el 24-nov-2026; reutiliza `PinModal`). La venta guarda **quién vendió, quién cobró y quién entregó**; la **comisión va a quien vendió**, que el cajero elige de una lista al armar la nota (queda en bitácora y es revisable por la supervisora) | M |
| F4 | **Solicitud de producto especial** (sustituye al grupo de WhatsApp) | Tabla de solicitudes ligada al paciente y a la sucursal; exige anticipo de 50% o 100% registrado; estados solicitada, autorizada, enviada al proveedor, entregada, recibida, entregada al paciente, liquidada; autorización de los dueños; aviso al proveedor | L |
| F5 | **Entrega, recepción, aceptación y cuenta del proveedor** | Cruce de tres registros: solicitud, entrega declarada por el proveedor y entrada en la sucursal. Discrepancias con aviso, con plazo de escalamiento configurable por los dueños (parámetro); el aviso llega a la supervisora y a los dueños a la vez. La entrada queda **pendiente de aceptación de los dueños** y solo al aceptarse suma a la deuda del proveedor. Saldo = notas aceptadas menos pagos | L |
| F6 | **Pagos al proveedor** (efectivo, transferencia, o desde la caja de la sucursal) | Todo pago se registra y se aplica a lo aceptado. Si sale de la caja: salida de efectivo con motivo y quién autorizó, que aparece en el corte diario. **Solo los dueños pueden instruirlo** | M |
| F7 | **Pago con tarjeta con comprobante** | Forma de pago con foto del voucher y folio de autorización; sin guardar números de tarjeta; efectivo solo se marca | S |
| F8 | **Gastos locales con comprobante** | El responsable de cada sucursal registra sus gastos con nota subida, forma de pago y categoría, y el efecto en el corte. No hay gasto sin captura. Los dueños fijan un **tope por sucursal** (parámetro); arriba del tope se necesita su autorización | M |
| F10 | **Cuenta de proveedor** (decidido el 24-nov-2026: los proveedores de **plantillas y de zapatos** usan el sistema con cuenta) | Acceso externo, no un rol operativo de la clínica. Solo ve **sus propias órdenes**: folio, sucursal, medidas y especificaciones, fecha prometida. **No ve** expediente, diagnóstico ni datos clínicos del paciente. Puede confirmar "enterado", marcar en producción y entregado, y subir su nota de entrega, que se compara contra la entrada de la sucursal. Políticas RLS propias y pruebas en `test-rls.mjs` | L |
| F11 | **Parámetros que fijan los dueños** | Pantalla de configuración con: tope de descuento del supervisor, monto máximo de devolución, tope de gasto por sucursal sin autorización, plazo de escalamiento de entregas sin entrada, anticipo mínimo, vigencia y política de apartados. Todos por organización y, si se pide, por sucursal. Solo los dueños los editan | M |
| F12 | **Liberación de funciones por rol (la controla el superadmin de RANNIX)** | Decidido el 24-nov-2026: en la primera venta el cliente recibe un alcance acotado; las demás opciones no están disponibles hasta que se vendan. Catálogo de funciones (las 55 opciones del menú de Pie Firme), liberación por clínica y por rol, e interruptor de liberación estricta (sin él, todo sigue como hoy). Migración 074 hecha. Falta: ocultar lo no liberado en el menú y las rutas, y la pantalla del superadmin en el panel RANNIX | M |
| F13 | **Catálogo de códigos de servicios y productos** | Lista de todos los servicios (y de los productos sin código) con **folio y ID automáticos**, **código de barras** y **código QR**; hoja imprimible del catálogo de códigos y etiquetas; cobro escaneando el código. Hoy el servicio solo tiene un `codigo` que se teclea. Requiere agregar una librería de QR y otra de código de barras. Va con A4 (etiquetas) del análisis de SICAR | M |
| F14 | **Nota para todo paciente y solicitud de factura a oficina central** | Toda venta genera nota y ticket con la descripción. Si el paciente necesita factura, la sucursal registra una **solicitud ligada a la nota** con la documentación del cliente (constancia fiscal, RFC, régimen, CP, uso del CFDI, correo). Estados: solicitada, documentos incompletos, lista para emitir, emitida, enviada. La oficina central la ve y la emite. Hoy existen las facturas y los datos fiscales del paciente, pero no esta solicitud | M |
| F15 | **Gastos, compras y estado de resultados mensual por sucursal, desde la primera etapa** | Decidido el 24-nov-2026: en la primera etapa se capturan **todos** los gastos y las compras de cada sucursal (nómina, operación, insumos de limpieza, insumos de trabajo, luz, agua, renta, etc.) para que el **estado de resultados mensual** muestre ingresos, egresos y **utilidad por sucursal**, y lo vean el **supervisor** (sus sucursales) y los **dueños** (todas y consolidado). Ya existe: gastos con comprobante y forma de pago, grupos de gasto ligados a renglones del estado de resultados, gastos recurrentes, nómina y comisiones que se registran como gasto, estado de resultados por sede y mes con utilidad, y consolidado. **Falta**: (a) el catálogo de grupos de gasto de Pie Clinic (hoy hay Insumos, Mantenimiento, Publicidad, Renta, Servicios, Nómina y Papelería; faltan luz, agua, limpieza e insumos de trabajo por separado); (b) **acceso del supervisor** al estado de resultados y a los gastos de sus sedes: hoy solo el administrador los ve; (c) tope de gasto sin autorización de los dueños; (d) costo del personal que rota, asignado a la sucursal donde trabajó; (e) cómo entra el costo de lo comprado al estado de resultados (a confirmar) | M |
| F16 | **Ticket de compra completo y datos de la sucursal que lo emite** | Revisado el 24-nov-2026 en el código. **Ya hace** el ticket de 80 mm con letra de ticket, nombre de la clínica, sucursal con dirección y teléfono, folio, fecha, caja, paciente, atendió, renglones con cantidad e importe, descuento por renglón y total, pagos y cambio. **Falta**: (a) **el logo** de la configuración de la clínica, **uno solo para toda la empresa** (decidido; hoy solo imprime el nombre); (b) **precio unitario** en cada renglón; (c) **datos completos de la sucursal** (hoy solo nombre, dirección y teléfono; agregar colonia, código postal, municipio, horario, correo y leyenda en el catálogo de sucursales); (d) imprimir con los datos de **la sucursal de la venta**, no la activa: al reimprimir un ticket antiguo con otra sucursal elegida saldría con datos equivocados; (e) el QR hoy sale como texto y la leyenda dice «presente este ticket para facturar», que contradice la facturación centralizada; (f) QR y código de barras reales del folio | S |
| F9 | **RH dividido entre dueña y supervisora** | La supervisora aprueba permisos, vacaciones, faltas y cambios de turno, y coordina la cobertura entre sucursales y la rotación; la dueña lleva altas, bajas, sueldos y nómina (confirmado) y recibe aviso de **cada** aprobación que haga la supervisora. Extiende las tablas de RH existentes | M |

Tamaños: **S** menos de un día de trabajo agéntico, **M** de uno a tres días, **L** más de tres. Son estimaciones gruesas.

## 3. Orden de trabajo

| Fase | Contenido | Por qué en este orden |
|---|---|---|
| **0. Base** | Base QA real, usuarios de prueba, RLS verificada y despliegue de Pie Firme | Sin esto nada de lo demás se puede probar con datos reales. Depende de la sesión que hace la infraestructura |
| **1. Paralelo de diciembre** | Se construye en **seis olas** (ver abajo) | Es lo que los dueños necesitan para operar el sistema junto a las notas |
| **2. Etiquetado y arqueos** | C3, B4, B5 | Se usan durante el piloto pero no bloquean su arranque |
| **3. Esquema ya hecho** | D1 a D8 | Las tablas existen; solo falta la pantalla |
| **4. Dirección** | E1 a E5, A6, B6 | Cierra la brecha con Pie Clinic |

### Olas de la fase 1

| Ola | Contenido | Depende de | Por qué |
|---|---|---|---|
| **1a. Quién hace qué** | F1 rol supervisor · F2 funciones habilitadas · F3 PIN personal y vendedor elegido por el cajero · F11 parámetros de los dueños · A4 autorizaciones (supervisor y dueños) · F12 liberación de funciones por RANNIX | Fase 0 | Todo lo demás necesita saber quién hace qué y quién autoriza |
| **1b. Caja** | A1 anticipos con Liquidar · B7 complementos de plantilla y calzado · F7 tarjeta con voucher · A5 cambio de turno · A3 devoluciones · A2 crédito y plazos · C1 pantalla al paciente · C2 notas foliadas · F13 catálogo de códigos · F14 nota y solicitud de factura · F16 ticket completo | 1a | Es lo que se ve el primer día del paralelo |
| **1c. Inventario** | B1 reparto desde Centenario · B2 recepción con faltantes · B3 requisición | 1a | Traspasos y entradas; la ola 1d usa la entrada de la sucursal |
| **1d. Producto especial y proveedor** | F4 solicitud · F10 cuenta del proveedor · F5 entrega, aceptación y deuda · F6 pagos al proveedor | 1a y 1c (B2) | Reemplaza el grupo de WhatsApp; necesita la entrada en sucursal para el cruce |
| **1e. Cuadre** | F8 gastos locales · F15 gastos, compras y estado de resultados por sucursal · C4 conciliación con Clip · C5 cuadre del paralelo | 1b y 1d | Cierra el día: ventas, tarjeta, salidas de efectivo y pagos |
| **1f. RH** | F9 aprobaciones de la supervisora con aviso a la dueña, y altas, bajas, sueldos y nómina de la dueña | 1a | No bloquea el arranque; puede ir al final |

**Paralelismo.** Después de 1a, las olas 1b y 1c tocan archivos distintos y pueden correr a la vez en dos sesiones. 1d entra cuando 1c tiene la entrada en sucursal. 1e va al final. Cada ola es un módulo con su migración, sus rutas y su menú, así que no se pisan.

La fase 1 es la que tiene prisa. Lo que no está en una ola (fases 2 a 4) no bloquea el arranque.

## 4. Cómo se hace cada módulo

1. **Leer** la pantalla y la lógica de Pie Clinic y anotar sus reglas.
2. **Migración** `NNN_tema.sql` con tablas, RLS, vista `prp_*`, RPC y bitácora. Validación local en PGlite.
3. **Lógica** portada a `src/lib/<área>/` con pruebas `node:test`, copiando las de Pie Clinic cuando existan.
4. **Pantallas, ruta y menú** según el contrato.
5. **Semilla** sintética con casos borde (anticipo vencido, crédito en mora, traspaso con faltante, folio faltante).
6. **Verificación**: `test-rls.mjs`, `verificar-roles.mjs` y recorrido por rol en QA. Se documenta en `docs/frontend/<área>.md`.

## 5. Riesgos

| Riesgo | Efecto | Qué hacer |
|---|---|---|
| La base compartida (BITDATA) aloja otro sistema | Una migración mal hecha puede afectarlo | Solo el esquema `piefirme`; nada en `public`; validar local primero |
| Los parámetros de crédito y anticipo de Pie Clinic no están confirmados por los dueños | Se construye una regla que no usan | Que las reglas sean parámetros por sucursal y revalidar con las 7 preguntas |
| Pie Firme pasa a 4 roles (con supervisor) y Pie Clinic repartía las funciones en 8 | Las capacidades quedan demasiado amplias o se duplican | Definir capacidades finas en `permisos.js`, usar funciones habilitadas por usuario y probar con `verificar-roles.mjs` y `test-rls.mjs` |
| La cuenta del proveedor es un acceso externo | Una política mal hecha podría exponer datos clínicos | Políticas propias que solo dejen leer sus órdenes y pruebas específicas en `test-rls.mjs` |
| Los módulos de IA, Clip, PAC y mensajería siguen simulados | No se pueden probar de punta a punta | Rotularlos en pantalla; pedir llaves cuando se cierre el modelo comercial |
| Las pantallas de Pie Clinic están hechas para `localStorage` | Reescribirlas contra la base puede cambiar su comportamiento | Portar primero las pruebas y compararlas con la salida original |
| Hay que cuidar el alcance del paralelo | Querer entregar todo para diciembre | Congelar la fase 1; el resto no bloquea el piloto |

## 6. Qué cierra cada fase

- **Ola 1a cierra** cuando existen los cuatro roles con sus capacidades, un usuario puede tener funciones de podólogo y de caja, el cobro pide PIN personal y la supervisora autoriza descuentos y devoluciones dentro del tope fijado por los dueños.
- **Ola 1b cierra** cuando una venta con anticipo, un crédito a dos pagos, una devolución y un cobro con tarjeta y voucher se registran y se ven en el corte.
- **Ola 1c cierra** cuando un traspaso de Centenario con faltante queda registrado con firma de recibido.
- **Ola 1d cierra** cuando una solicitud de plantilla o zapato recorre todo el flujo, de la solicitud al saldo del proveedor en cero, incluida una discrepancia con aviso a la supervisora y a los dueños.
- **Fase 1 cierra** cuando un día completo del paralelo se puede registrar y cuadrar en QA con los cuatro roles y la cuenta del proveedor.
- **Fase 3 cierra** cuando ya no queda ninguna función con "🗄" en el comparativo.
- **El plan completo cierra** cuando el comparativo no tiene ninguna celda con ❌ en Pie Firme que sí tenga Pie Clinic.

## 7. Decisiones

**Resueltas el 24-nov-2026** (detalle en [Procesos_y_Flujos_PieClinic.md](Procesos_y_Flujos_PieClinic.md)): supervisor como cuarto rol; autoriza descuentos, devoluciones y permisos de personal; los dueños fijan los topes; ajustes de inventario, pagos a proveedor desde caja y gastos sobre el tope solo los dueños; PIN personal al cobrar; comisión a quien vende, elegido por el cajero; proveedores de plantillas y zapatos con cuenta; blocs foliados entregados y controlados por los dueños.

Precios: **precio central único** para todas las sucursales (cambio de precio en un lugar, visible en todas); sin ajuste por sucursal.

Anticipos: **se extiende la tabla `anticipos`** (migración 025, ligada a Clip) en lugar de crear `apartados` aparte.

**Pendientes**
1. **Revalidar con los dueños** los parámetros de anticipo, entrega y crédito (las 7 preguntas del mensaje).
2. **Arranque**: ¿empezamos con la ola 1a y después 1b y 1c en dos sesiones paralelas?
