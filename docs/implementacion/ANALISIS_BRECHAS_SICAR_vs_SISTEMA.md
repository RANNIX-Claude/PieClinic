# SICAR contra el sistema de podología: qué funcionalidad se requiere

**Qué es esto.** El cruce de la documentación de SICAR (manual v4 y su análisis) contra la lista real de funciones del sistema actual (Pie Firme, con lo validado en PODIX). Es un análisis para validar: **no se escribió código**.

**Por qué importa.** Pie Clinic compró SICAR, intentó instalarlo y no pudo ponerlo en operación, pero **conoce sus módulos** y los va a buscar en nuestra solución. Por eso el documento responde dos preguntas: *¿qué funciones de SICAR hay que tener?* y *¿dónde está cada una en el sistema?* (sección 4).

## 0. Decisiones validadas (24-nov-2026)

| Tema | Decisión |
|---|---|
| **Precios 1 a 4** | Se usan **por tipo de cliente** (público, médico, convenio o aseguradora, mayorista). El cliente o paciente trae asignado su número de precio. Siguen siendo **precios centrales**: no se ajustan por sucursal |
| **Departamento** | Se crea como **departamento, por encima de la categoría**: Podología, Ortopedia y Productos |
| **Unidades con factor** | Se necesitan **desde el arranque** (compra por caja, venta o consumo por pieza) |
| **Etapa 1** | Antes de cargar el catálogo entran también el **inventario inicial, la hoja de conteo con códigos de barras y el ajuste por Excel** |

## 0 bis. Corrección: lo que PODIX ya tenía (24-nov-2026)

La primera versión de este análisis comparó SICAR **solo contra Pie Firme** y marcó como faltantes cosas que **PODIX ya tiene construidas y probadas**. Verificado en `podix/`:

| Función | Lo que ya existe en PODIX | Falta |
|---|---|---|
| **Carga de artículos desde el Excel de SICAR** | `scripts/sicar_articulos.py`, `src/store/articulos_sicar.js` y el reporte `CARGA_ARTICULOS_SICAR.md`. Reglas decididas con el usuario el 23-nov: «PRECIO 1» que solo trae el IVA se ignora (se toma como precio si es al menos 1.2 veces el costo); si no, se sugiere el precio con el margen típico del proveedor y se marca; si falta el costo se estima; el mínimo de SICAR se guarda aparte y se activa con la primera entrada; sin precio ni costo no se carga; repetidos entre hojas se descartan; claves únicas. Se cargaron 2,880 artículos | Portarlo a Pie Firme con base de datos |
| **Clave alterna y departamento** | `claveSicar` y `linea` (Podología, Ortopedia) en cada artículo | Columnas en la base de Pie Firme |
| **Corte con arqueo ciego** | `pantallas/cajero/caja.jsx`: cambio de turno con arqueo ciego y corte firmado | Portarlo |
| **Conteo con escáner** | `componentes/almacen/Escaner.jsx` en conteo y ajustes (cada lectura suma 1) | Portarlo |
| **Inventario inicial** | Importación del tipo «existencias»: entra como capa de costeo en el almacén elegido, con lote deshacible | Portarlo |
| **Reparto sugerido** | `reparto-central.jsx` | Portarlo (ya estaba anotado) |

**Sigue sin existir en ninguna de las dos versiones:** unidades con factor, precios por tipo de cliente, series, cotización de venta, etiquetas con código de barras, QR de servicios y hoja de conteo imprimible.

**Efecto en la matriz de la sección 3:** las funciones 2, 4, 20, 25, 28 y 59 pasan de «no existe» a **«existe en PODIX, por portar»** (se leen como 🟡). La lista de prioridades no cambia, pero el trabajo en esas funciones es **portar y adaptar**, no construir.

## 1. Fuentes y sus límites

| Fuente | Qué aporta | Límite |
|---|---|---|
| `Manual_SICAR_v4_Completo.pdf` (755 páginas) | Texto de 14 módulos: artículos, paquetes, inventarios, compras, pedidos, membresías, ventas, abonos, corte de caja, cotización, promociones, nota de crédito, devolución a proveedor y reportes | El índice dice 48 módulos, pero **el PDF solo trae el texto hasta Reportes**. No están Traspasos (Nube), Estadísticas, Multiservicios, Procesos, Operatividad, Móvil ni Restaurantes |
| `ANALISIS_SICAR.md` | Campos, documentos, reglas y relaciones de SICAR | Las relaciones están **inferidas**: no hubo acceso a su base real |
| `VIDEOS_SICAR.md` | Catálogo de 100 videos (traspasos, lotes, etc.) | Son listas; las transcripciones no se revisaron aquí |
| Sistema actual | Esquema de Pie Firme (migraciones 001 a 075), pantallas y lo validado en PODIX | Revisé tablas y columnas; **no ejecuté cada pantalla** |

Lo que viene de SICAR sin respaldo en el PDF (traspasos, estadísticas) queda marcado **«a confirmar»**.
**No usé el Excel del cliente**: son datos, no funcionalidad.

## 2. Lo que el sistema actual ya tiene (lista de funcionalidad)

| Área | Funciones |
|---|---|
| **Catálogo** | Productos (SKU, código de barras, categoría, marca, presentación en texto, tipo, costo promedio, IVA, lote y caducidad, clave SAT, imagen, precio por sede), servicios con duración, seguimiento, garantía y consentimiento, precios con vigencia y sede, paquetes, planes multisesión, membresías, gift cards y promociones con componentes |
| **Inventario** | Existencia por sede con mínimo, máximo y ubicación; lotes con caducidad; movimientos con kardex (compra, venta, traspasos, merma, conteo, ajuste, consumo clínico, devoluciones); histórico de costos; conteos físicos con autorización; mermas con autorización; auditoría con foto |
| **Traspasos** | Borrador, enviada, recibida parcial, recibida, cancelada; por partidas con cantidad enviada y recibida y diferencia con motivo |
| **Compras** | Orden de compra con autorización, recepción con lote, caducidad y costo real, factura y UUID, devoluciones a proveedor con monto de crédito, cuentas por pagar, pagos a proveedor, nota de compra leída con IA, último costo por proveedor |
| **Ventas y caja** | Venta con líneas, vendedor, descuentos con motivo y autorización; pagos mixtos (efectivo, tarjeta, transferencia, Clip, gift card, anticipo, cortesía); turnos, movimientos de caja (retiro, gasto, devolución, depósito) y corte con esperado, contado y diferencia; devoluciones de venta; notas de crédito con CFDI; cuentas por cobrar; facturación CFDI y global; anticipos; comisiones |
| **Personas y control** | RH, checador, vacaciones, comisiones, bitácora, autorizaciones con PIN, supervisor (nuevo) |
| **Análisis** | Tableros, reportes, estado de resultados, data warehouse, asistente |
| **En PODIX, aún no en Pie Firme** | Apartados con vigencia, crédito y plazos con interés, reparto sugerido desde el almacén central, tablero del dueño, escáner |

## 3. Matriz de brechas

**Leyenda:** ✅ existe · 🟡 parcial · ❌ no existe · ➖ no aplica a podología. **Prioridad** para una red de clínicas: **A** alta, **M** media, **B** baja. **Esfuerzo:** S, M, L.

### 3.1 Artículo (catálogo)

| # | Función de SICAR | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| 1 | Clave y código de barras | ✅ | `productos.sku` y `codigo_barras` | — | — |
| 2 | **Clave alterna** | ❌ | Solo existe `sku_proveedor` en proveedor-producto. Su Excel de SICAR la trae | A | S |
| 3 | Servicio (sin existencia) | ✅ | Tabla `servicios`, más completa que SICAR | — | — |
| 4 | **Departamento** | ❌ | Solo categoría y marca. El cliente maneja tres departamentos: Podología, Ortopedia y Productos. **Decidido: se crea como departamento sobre la categoría** | A | S |
| 5 | Tags (etiquetas libres) | ❌ | Las etiquetas existentes son de pacientes | B | S |
| 6 | **Unidad de compra, de venta y factor** | ❌ | Solo `presentacion` como texto. Compra por caja y venta por pieza no se convierte. **Decidido: desde el arranque** | A | M |
| 7 | Costo, % de utilidad y precio de venta | 🟡 | Costo promedio y precios con vigencia sí. **No hay % de utilidad ni recálculo automático** al cambiar el costo (lo pidieron en la junta) | A | M |
| 8 | **Precios 1 a 4** y mayoreo por cantidad | ❌ | Existen tipos de precio distintos (fijo, desde, por unidad). Su Excel trae 4 precios de venta. **Decidido: por tipo de cliente** | A | M |
| 9 | Mínimo, máximo y localización | ✅ | `inventario_sede` | — | — |
| 10 | Lote y caducidad | ✅ | `lotes_producto`. Salida automática por el lote más próximo: no la encontré | M | S |
| 11 | **Números de serie** | ❌ | Equipo de valor (sillas eléctricas, prótesis) | M | M |
| 12 | Presentaciones (talla × color) | 🟡 | Solo texto. El cliente decidió **agrupar por rangos de talla** en vez de crear variantes, así que no es urgente | B | L |
| 13 | Paquetes y kits | ✅ | Paquetes con componentes (productos y servicios) | — | — |
| 14 | Compatibles (venta cruzada) | ❌ | Podría ligar plantilla y calzado | B | S |
| 15 | Pre-artículo (alta rápida) | ❌ | Producto nuevo "por completar" cuando llega mercancía sin código | M | S |
| 16 | Impuestos múltiples (IEPS, retenciones) | 🟡 | Solo IVA. No aplica a podología | B | — |
| 17 | Clave SAT y unidad SAT | ✅ | En productos y servicios | — | — |
| 18 | Imagen y características | ✅ | `imagen_path`, descripción web | — | — |
| 19 | Clonar, eliminar solo sin existencia, recuperar eliminado | 🟡 | Hay `estado`. Falta la regla "no eliminar con existencia" y clonar | M | S |
| 20 | **Importar y exportar con la plantilla de SICAR** | 🟡 | Importación con IA existe; en PODIX hay carga de artículos SICAR. **Clave para migrar** | A | M |
| 21 | **Imprimir etiquetas con código de barras y precio** | ❌ | Pedido en la junta (etiquetas alteradas) | A | M |

### 3.2 Inventarios

| # | Función de SICAR | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| 22 | Ajuste libre con diferencias (rojo, azul, negro) | ✅ | Conteo físico con esperado, contado, ajuste y motivo, autorizado | — | — |
| 23 | Ajuste en espera (continuar después) | ✅ | Conteo en borrador | — | — |
| 24 | **Ajuste por Excel** (clave y cantidad) | ❌ | No hay plantilla de ajuste | A | S |
| 25 | **Ajuste desde el celular con escaneo** | 🟡 | Auditoría con foto; escáner solo en PODIX | A | M |
| 26 | Ajuste por localización, departamento, categoría o tag | 🟡 | Ubicación y categoría existen; falta el filtro de conteo | M | S |
| 27 | Hoja de conteo imprimible con códigos de barras | ❌ | Útil para el conteo de Centenario de diciembre | A | S |
| 28 | **Inventario inicial** (a cero o captura masiva) | ❌ | No hay tipo de movimiento ni pantalla propia | A | M |
| 29 | Consultar ajuste, **«por ajustar»** (no contados), imprimir y enviar | 🟡 | Consulta de conteos sí; el reporte de no contados y el envío no | M | S |
| 30 | Costeo promedio | ✅ | Costo promedio con histórico (PODIX usa PEPS por capas) | — | — |
| 31 | Existencia por sucursal | ✅ | `inventario_sede` | — | — |

### 3.3 Compras, pedidos y proveedores

| # | Función de SICAR | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| 32 | Compra con costo, descuento, IVA y folio | ✅ | Orden de compra y recepción | — | — |
| 33 | **Compra directa sin orden previa** | 🟡 | El flujo es orden → recepción. A confirmar si la recepción admite compra directa | M | S |
| 34 | **Actualizar costo y precios al comprar** (mantener margen o precios anteriores) | 🟡 | El costo promedio se actualiza; los precios de venta no | A | M |
| 35 | Compra con XML del proveedor | 🟡 | Guarda UUID y factura; no lee el XML. Hay nota de compra con IA | M | M |
| 36 | Compra o gasto | ✅ | Gastos separados | — | — |
| 37 | Crédito del proveedor y abonos | ✅ | Cuentas por pagar y pagos a proveedor | — | — |
| 38 | Último costo por proveedor | ✅ | `proveedor_productos` | — | — |
| 39 | **Pedido con sugerido por mínimo y máximo y por ventas** | 🟡 | Orden de compra manual. El reparto sugerido está en PODIX. Lo pidieron en la junta | A | M |
| 40 | Devolución a proveedor (artículos y descuento) | ✅ | Con monto de crédito | — | — |
| 41 | Proveedor: crédito, días, datos fiscales | ✅ | `proveedores`, con datos bancarios | — | — |

### 3.4 Traspasos entre sucursales (a confirmar: no están en el PDF)

| # | Función de SICAR | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| 42 | Solicitud, salida y entrada | 🟡 | Hay borrador, enviada y recibida, con diferencias. **Falta la solicitud formal de la sucursal** (requisición) | A | M |
| 43 | Aplicar suma y resta entre sucursales | ✅ | Movimientos de traspaso | — | — |
| 44 | Cancelar traspaso | ✅ | Estado cancelada con motivo | — | — |
| 45 | Consultar existencia en otras sucursales | ✅ | Por sede | — | — |
| 46 | Reparto desde el almacén central con sugerido | 🟡 | En PODIX | A | M |

### 3.5 Ventas, caja y crédito

| # | Función de SICAR | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| 47 | Venta con lector, búsqueda, cliente y vendedor | ✅ | Con vendedor elegido por el cajero | — | — |
| 48 | Cliente «Público en general» | ✅ | Venta sin paciente | — | — |
| 49 | **Número de precio por venta o por línea** | ❌ | Depende de los precios 1 a 4 | M | M |
| 50 | Descuentos con motivo y autorización | ✅ | Más estricto que SICAR | — | — |
| 51 | Documento a emitir (ticket, nota, remisión, factura) | 🟡 | Ticket y factura. Sin nota de remisión | B | S |
| 52 | **Ventas en espera** (hasta 10) | 🟡 | Existe el estado «cuenta abierta» | M | S |
| 53 | Formas de pago | ✅ | Más completas; faltan cheque y vales | B | S |
| 54 | Venta a crédito, abonos y saldo | 🟡 | Cuentas por cobrar. El crédito a plazos con interés está en PODIX | A | L |
| 55 | **Cotización de venta** que se carga a una venta | ❌ | Hay cotización de proveedor, no de cliente. Prótesis y plantillas especiales se cotizan | A | M |
| 56 | Nota de crédito por devolución o por descuento | ✅ | Con CFDI de egreso | — | — |
| 57 | Saldo a favor del cliente aplicable a otra venta | 🟡 | A confirmar | M | M |
| 58 | **Corte con contado, calculado y diferencia por forma de pago** | 🟡 | Esperado, contado y diferencia solo del efectivo, con justificación | M | M |
| 59 | **Corte ciego** (el cajero no ve lo calculado) | ❌ | SICAR lo controla por rol. Ayuda contra el robo hormiga | A | S |
| 60 | Retiro por corte (dejar fondo) | ✅ | Movimiento de retiro | — | — |
| 61 | Fondo inicial | ✅ | Apertura de turno | — | — |
| 62 | Promociones (2×1, 3×2, mixtas, por cliente o grupo) | 🟡 | Promociones con descuento y vigencia; no las reglas de piezas | M | M |
| 63 | Monedero electrónico (puntos) | ❌ | Hay gift cards, no puntos | B | M |
| 64 | Membresías | ✅ | Más completas que SICAR | — | — |
| 65 | Complemento de pago CFDI y pagaré | 🟡 | A confirmar | M | M |

### 3.6 Reportes, personas, configuración y dispositivos

| # | Función de SICAR | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| 66 | Reporte global diario automático | 🟡 | Resumen semanal y tableros; no el global del día | M | S |
| 67 | Reportes de ventas por caja, usuario, cliente, vendedor, documento y pago | 🟡 | Reportes y data warehouse; falta confirmar todos los filtros | M | M |
| 68 | Artículos vendidos, utilidad por artículo, departamento o categoría | 🟡 | Depende de departamento y de margen | M | M |
| 69 | Existencias, bajo mínimo, sobre máximo y movimientos | 🟡 | Kardex sí; falta confirmar los reportes | A | S |
| 70 | Descuentos por usuario | 🟡 | Hay bitácora y autorizaciones | M | S |
| 71 | Comisiones por vendedor | ✅ | Esquemas de comisión | — | — |
| 72 | Estadísticas (a confirmar: no están en el PDF) | ✅ | Tablero ejecutivo y data warehouse | — | — |
| 73 | Empleados, asistencia y vacaciones | ✅ | RH, checador y vacaciones | — | — |
| 74 | Usuarios, roles y permisos configurables | 🟡 | Roles fijos con capacidades. **Decidido: los roles no cambian** | B | — |
| 75 | Acciones que piden autorización | ✅ | PIN de dueños y del supervisor | — | — |
| 76 | Checador de precios (consulta por escáner) | ❌ | Ayuda a que el cliente y el personal vean el precio real | M | S |
| 77 | Impresora de ticket y lector de código | ✅ | Ticket y pistola en caja | — | — |
| 78 | Impresora de etiquetas | ❌ | Ver la función 21 | A | M |
| 79 | Respaldos | ➖ | Los resuelve Supabase | — | — |
| 80 | Móvil (vender, consultar, inventariar) | 🟡 | Web responsiva y PWA; falta el inventario con escaneo | M | M |

### 3.6 bis Agregado por los dueños (24-nov-2026)

No salen de SICAR: los pidieron ellos. Se cuentan aparte, sin cambiar el resumen de la sección 5.

| # | Función | Estado | Dónde está hoy / qué falta | Prior. | Esf. |
|---|---|---|---|---|---|
| N1 | **Catálogo de códigos**: folio, ID, **QR** y **código de barras** para cada servicio, con hoja imprimible, para cobrar escaneando | ❌ | El servicio solo tiene un `codigo` tecleado (único por clínica). No hay generación de códigos ni librerías de QR o código de barras. Los productos sí traen código de barras | A | M |
| N2 | **Nota para todo paciente** con ticket de compra completo (logo, datos de la sucursal, descripción, cantidad, precio, descuento y total) | 🟡 | El ticket de 80 mm ya imprime líneas con descripción, cantidad, importe, descuento y total. **Falta el logo**, el precio unitario, los datos completos de la sucursal y un QR real | A | S |
| N3 | **Solicitud de factura a la oficina central** con documentación del cliente | ❌ | Hay facturas, datos fiscales del paciente y constancia; no hay la solicitud ni la lista de documentos por pedir | A | M |

### 3.7 Lo que se descarta, y se debe decir al cliente

| Función de SICAR | Por qué no aplica |
|---|---|
| Restaurantes: comandero, cocina, mesas, meseros, combos, propinas | Giro distinto |
| Báscula, granel, peso automático | No se vende a granel |
| Multiservicios (recargas, pago de servicios) | No es el giro |
| Licencia de servidor y de terminal, plugins, instalación en una PC, migración entre computadoras | Es una aplicación web: no hay instalación ni licencia por caja |
| Respaldos locales (USB, disco) | Los hace la nube |
| Huella digital en clientes | No se requiere |
| Cuenta predial, información aduanera | No aplica |

### 3.8 Lo que SICAR no da y el sistema sí

Expediente clínico, agenda con recordatorios, plantillas ortopédicas a medida, esterilización, pie diabético, anticipos con Clip, portal de reserva y pago, supervisor con autorizaciones, comisión por servicio, tablero del dueño y control de robo hormiga con firma y bitácora. Es el argumento principal frente a quien extraña SICAR.

## 4. Dónde buscar en el sistema lo que SICAR ofrece

| Menú de SICAR | Equivale en el sistema | Estado |
|---|---|---|
| Operaciones → Artículos / Paquetes / Pre-artículos | Ventas → Catálogo y precios; Paquetes y membresías | 🟡 sin pre-artículo |
| Operaciones → Ajuste de inventario / Inv. inicial | Inventario → Mermas y conteos | 🟡 sin inventario inicial ni Excel |
| Operaciones → Compras / Pedidos | Inventario → Compras | 🟡 sin sugerido |
| Operaciones → Ventas | Ventas → Caja y tickets | ✅ |
| Operaciones → Nota de crédito / Devoluciones | Caja (devoluciones), Facturación (notas de crédito), Compras (devoluciones a proveedor) | ✅ |
| Operaciones → Corte de caja | Caja → corte y turnos | 🟡 sin corte ciego |
| Operaciones → Cotización | — | ❌ |
| Operaciones → Membresías | Paquetes y membresías | ✅ |
| Consultas → Clientes (créditos) / Abonos | Finanzas → Cuentas por pagar y cobrar | 🟡 |
| Reportes / Estadísticas | Análisis → Tablero ejecutivo, Reportes, Data warehouse | 🟡 |
| Procesos → Importar y exportar | Utilerías → Importar y exportar datos | 🟡 sin plantilla de SICAR |
| Configuración → Empleados, usuarios, roles | Equipo → RH; Usuarios y roles | ✅ |
| Nube → Traspasos | Inventario → Traspasos | 🟡 sin solicitud formal |

## 5. Resumen

De las 80 funciones comparadas: **✅ 33 existen · 🟡 32 parciales (incluye las que existen en PODIX y faltan por portar) · ❌ 14 no existen · ➖ 1 no aplica**. Hay 20 de prioridad alta. Cifras corregidas el 24-nov-2026 (sección 0 bis).

**Lo que más se nota si no está** (porque SICAR lo trae y el cliente lo conoce o lo pidió en la junta):

1. **Clave alterna, departamento y precios 1 a 4**: son columnas de su propia plantilla de SICAR.
2. **Unidades y factor** (compra por caja, venta por pieza) y **margen automático** al cambiar el costo.
3. **Importar con la plantilla de SICAR**: es el puente de migración.
4. **Inventario inicial, ajuste por Excel y hoja de conteo con códigos de barras**: el conteo de Centenario es el primer paso del paralelo.
5. **Etiquetas con código de barras y precio**.
6. **Pedido sugerido** por mínimo y máximo.
7. **Corte ciego** y corte por forma de pago.
8. **Cotización** de venta (prótesis y plantilla especial).
9. **Crédito a plazos y abonos** (en PODIX).
10. **Solicitud formal de traspaso** (requisición).

## 6. Lista priorizada de mejoras

| Prior. | Mejora | Funciones | Esfuerzo |
|---|---|---|---|
| **A1** | Catálogo al estilo SICAR: clave alterna, departamento, unidades con factor, % de utilidad, precios 1 a 4 | 2, 4, 6, 7, 8 | L |
| **A2** | Importación y exportación con la plantilla de SICAR | 20 | M |
| **A3** | Inventario inicial, ajuste por Excel, hoja de conteo imprimible y conteo con escaneo | 24, 25, 27, 28 | L |
| **A4** | Etiquetas con código de barras y precio | 21, 78 | M |
| **A5** | Compra que actualiza costo y precios, y pedido sugerido por mínimo y máximo | 34, 39 | L |
| **A6** | Solicitud de traspaso y reparto sugerido desde Centenario | 42, 46 | M |
| **A7** | Corte ciego y corte por forma de pago | 58, 59 | M |
| **A8** | Cotización de venta | 55 | M |
| **A9** | Crédito a plazos y abonos (portar desde PODIX) | 54 | L |
| **A10** | Catálogo de códigos de servicios: folio, QR y código de barras, con hoja imprimible y cobro por escaneo | N1 (con 21 y 78) | M |
| **A11** | Nota para todo paciente y solicitud de factura a la oficina central | N2, N3 | M |
| M | Números de serie, pre-artículo, ventas en espera, saldo a favor, promociones por piezas, checador de precios, reportes de existencias y global del día | 11, 15, 52, 57, 62, 76, 66, 69 | M |
| B | Tags, compatibles, monedero, nota de remisión, cheque y vales, variantes talla × color | 5, 14, 63, 51, 53, 12 | — |

## 7. Cambios propuestos al modelo de datos (sin código)

| Cambio | Detalle | Migración |
|---|---|---|
| `productos` | Campos `clave_alterna`, `departamento_id`, `unidad_compra`, `unidad_venta`, `factor`, `margen_pct`, `regla_actualizacion_precio` (mantener margen o mantener precio) | nueva |
| Tabla `departamentos` | Catálogo (Podología, Ortopedia, Productos) | nueva |
| Listas de precio | `lista_precio` de 1 a 4 **por tipo de cliente** (decidido); `lista_precio` asignada en paciente y cliente; precios centrales con vigencia, sin ajuste por sucursal. El mayoreo por cantidad queda fuera por ahora | nueva |
| Tabla `series_producto` | Número de serie por producto y sede, con estado | nueva |
| Documento de inventario | Tipo `inventario_inicial` y `ajuste_excel` en movimientos; folio y estado; reporte de no contados | extiende conteos |
| Tabla `cotizaciones` y líneas | Cotización de venta que se convierte en venta | nueva |
| `traspasos` | Estado `solicitada` y requisición con quién pide | extiende 041 |
| Etiquetas | Plantillas de etiqueta y cola de impresión | nueva |
| Corte | Permiso para ver lo calculado, y contado por forma de pago | extiende 026 |
| Crédito a plazos y apartados | Desde PODIX, sobre `anticipos` y `cuentas_por_cobrar` | ver plan existente |

## 8. Plan por etapas

| Etapa | Contenido | Cuándo |
|---|---|---|
| **1. Antes del conteo de Centenario y la carga** | **A10 (catálogo de códigos de servicios)**, A1 (campos del catálogo, con departamento, unidades con factor y precios por tipo de cliente), A2 (plantilla de SICAR) y de A3: **inventario inicial, hoja de conteo con códigos de barras y ajuste por Excel** (funciones 24, 27 y 28). Sin ellos no se carga el catálogo que Alejandro ya tiene al 90% ni se hace el conteo | Antes del paralelo |
| **2. Durante el paralelo** | **A11 (nota y solicitud de factura)**, de A3, el conteo con escaneo desde el celular (función 25), A4 (etiquetas) y A7 (corte ciego) | Diciembre |
| **3. Operación de la red** | A5 (compras y sugerido), A6 (solicitud de traspaso) | Enero |
| **4. Venta y crédito** | A8 (cotización), A9 (crédito a plazos) | Después |
| **5. Resto** | Prioridad media y baja | Según uso |

## 9. A confirmar

1. Si la recepción admite **compra directa** sin orden de compra.
2. Si hay **salida automática por caducidad** (FEFO) en lotes.
3. Si existe el **saldo a favor** del cliente y el complemento de pago.
4. Todos los **filtros de los reportes** de ventas y existencias.
5. Traspasos y estadísticas de SICAR: **no están en el PDF**; hay que revisar los videos de Nube.
6. ~~Precios 1 a 4 y departamento~~: **resuelto** en la sección 0. Falta confirmar con los dueños **cuántos tipos de cliente** hay y qué precio corresponde a cada uno.
