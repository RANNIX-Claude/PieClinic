# MÉTRICAS — Pie Firme (Clínica de Podología · RANNIX)

> Etapa **E2**. Cada indicador, KPI o total que aparece en los 49 mockups de `docs/mockups/`.
> La **fórmula es deducida** de la pantalla (no es regla confirmada); donde dos mockups dan cifras incompatibles se dice. Las definiciones finales se cierran en E3 con `PREGUNTAS_ABIERTAS.md` y se guardan en `REGLAS_NEGOCIO.md`.
> Las entidades de la columna "Fuente" son nombres de trabajo **[INFERIDO]** hasta que exista `DICCIONARIO_DATOS.md`.
> Convención de granularidad: **tiempo** (día · semana sáb→vie · mes · año), **sede**, **podólogo**, **servicio**, **producto**, **paciente**, **proveedor**.
> "Cuadra" = verifiqué la aritmética con las cifras de la pantalla.

## 0. Los indicadores pedidos textualmente por el dueño

| ID | Frase del dueño (2026-10-25) | Indicador | Dónde aparece |
|---|---|---|---|
| M-001 | «¿cuánto me generan de ingresos el servicio de podología? ¿cuánto la extracción de uñas?» | Ingreso por servicio | 31, 35, 40, 42, 47 |
| M-002 | «¿cuánto me produce cada podólogo?» | Ingreso por podólogo | 31, 40, 42, 47 |
| M-003 | (reportes pedidos) por sucursal | Ingreso por sede | 31, 35, 32, 42 |
| M-004 | «¿cuál es el número de incidencias/quejas de cada podólogo, por sucursal, por día, por mes, por año?» | Quejas e incidencias | 14, 31, 42 |
| M-005 | «¿quién hizo el trabajo ayer / en la sesión anterior?» | Quién atendió la sesión anterior | 02, 42, 47 |
| M-006 | «No sé qué productos hay en cada tienda, si está tal producto en tal tienda» | Producto por tienda | 21, 22, 42, 47 |

### M-001 · Ingreso por servicio
- **Fórmula deducida:** suma del importe cobrado de las líneas de venta de tipo servicio, agrupadas por servicio del catálogo (o por renglón del EDR: Quiropodia, Uña encarnada, Láser hongos, Plantillas, Extracción de uña, Otros). Sesiones de plan a $0 suman $0 en la línea (el ingreso del plan se cobró al venderlo) → P-071, P-091.
- **Granularidad:** día / mes / año × sede × podólogo × servicio. 40 cruza servicio × podólogo; 47 devuelve servicio × podólogo ("extracción de uña: $39,200 en 31 sesiones, 9.5% del ingreso", 39,200 / 412,860 = 9.5%, cuadra).
- **Fuente:** línea de la venta (servicio, importe, atendió) ligada a cita y catálogo; ingreso validado.
- **Cuadre:** servicios (EDR) 128,400 + 74,600 + 61,500 + 58,900 + 39,200 + 35,860 = 398,460 (cuadra con 31, 33 y 36). Por podólogo de la extracción: 12,600 + 11,400 + 8,800 + 6,400 = 39,200 (cuadra).
- **Conflictos:** agrupación servicio ↔ renglón P-101; plantillas como servicio (35, 40) o producto (19, 20, 33); venta de productos 14,400 (31, 35) vs 9,800 (40).

### M-002 · Ingreso por podólogo
- **Fórmula deducida:** Σ importe cobrado (servicios + productos atribuidos) donde el podólogo es quien atendió o vendió. Es la "base comisionable" de 40.
- **Granularidad:** mes (también día/año por filtros) × sede × servicio. 31: Ruiz $121,300 · Mena $118,950 · Soto $92,410 · Paredes $80,200 = $412,860 (cuadra). 40: servicios 403,060 + productos 9,800 = 412,860 (cuadra).
- **Fuente:** línea de venta ligada a cita/consulta + campo "atendió / vendió" (P-025).
- **Conflictos:** citas por podólogo 74 + 71 + 58 + 49 = 252 (40) frente a 286 citas atendidas (31); P-098.

### M-003 · Ingreso por sede
- **Fórmula:** Σ ingreso por sede donde se atendió/cobró. 31 y 35: Roma Norte 168,400 + Coyoacán 139,250 + Polanco 105,210 = 412,860 (cuadra, 41% / 34% / 25%). 32 lo desglosa semanalmente (servicios en cabina por sede, visitas a domicilio, productos, anticipos).
- **Granularidad:** día / semana / mes / año × sede. **Fuente:** ingreso validado por sede.
- **Conflictos:** conjunto de sedes distinto entre mockups P-129; visitas a domicilio y planes entre sedes P-071; "anticipos y pagos en línea" no tiene sede asignada (32).

### M-004 · Quejas e incidencias
- **Fórmula:** COUNT(queja) por podólogo (el de la sesión ligada), sede, fecha de registro, tipo y gravedad. Tasa = quejas / sesiones del podólogo o sede (14: Mena 5/142 = 3.5%, Soto 4/118 = 3.4%, Ruiz 3/131 = 2.3%, cuadran). 42 agrupa por Día · Mes · Año y muestra "resueltas" (año 2026: 22 totales, 18 resueltas).
- **Granularidad:** día / mes / año × podólogo × sede × tipo × gravedad × estado.
- **Fuente:** queja (folio, sesión ligada, podólogo, sede, tipo, gravedad, estado, fechas).
- **Conflictos:** octubre = 14 quejas (14), 5 (31) y 5 (42) con distintos podólogos y sedes → P-021. 14 suma 12 por podólogo y 14 por sede.

### M-005 · Quién atendió la sesión anterior
- **Fórmula:** consulta anterior más reciente del paciente (fecha-hora < la actual) → podólogo que la atendió, sede, cabina, servicio, estado de nota. No es un número: es una consulta. 02 la muestra en el bloque "Última sesión y quién atendió" y en la tabla "Atendió"; 42 la lista como reporte ("¿Quién atendió? sesión anterior"); 47 la responde en lenguaje natural y registra el acceso en bitácora.
- **Granularidad:** paciente × sesión. **Fuente:** consulta firmada; si no hay nota, cita atendida → P-025.
- **Conflicto:** 47 dice que la sesión 1/3 fue el 10-oct con Ruiz en Roma Norte, y 02 dice que fue el 29-sep con Mena para la misma paciente.

### M-006 · Producto por tienda
- **Fórmula:** existencia por producto y sede = saldo del kardex (entradas por compra + traspasos recibidos − ventas − consumos − mermas ± ajustes de conteo). 21 muestra la consulta "¿Qué producto hay en cada tienda?": existencia, mínimo y estado por sede, y total.
- **Granularidad:** producto × sede × lote (21 maneja lote y caducidad). **Fuente:** movimientos de inventario.
- **Conflictos:** existencias en tránsito entre sedes P-080; negativas P-085.

## 1. Dashboard y operación (31, 12, 16, 14, 15, 41)

| ID | Indicador | Fórmula deducida | Granularidad | Fuente | Mockup | Notas / pregunta |
|---|---|---|---|---|---|---|
| M-010 | Ingreso del mes (real) | Σ ingreso real del mes; 412,860; % de la proyección = real / proy_ = 412,860 / 430,000 = 96% (cuadra) | mes × sede × podólogo | ingresos + proyección EDR | 31, 35 | P-090, P-091 |
| M-011 | Citas atendidas | COUNT(cita en estado Atendida) en el periodo; 286; Δ vs mes anterior (▲ 8%) | día / semana / mes × sede × podólogo | cita | 31, 33, 46 | 40 dice 252, 14 dice 391 → P-098 |
| M-012 | Ocupación de agenda | Σ horas agendadas / Σ horas disponibles por cabina (nota de 31); 78% global, meta 80%; por sede 86% · 79% · 66% | día / semana / mes × sede × cabina | cita, horarios, cabinas | 31 | Meta P-097; el 78% no es el promedio simple de las tres sedes (77%) → se pondera; denominador P-098, P-047 |
| M-013 | Citas por semana (atendidas vs faltas/canceladas) | COUNT por estado y semana | semana × sede | cita | 31, 42 | P-045 |
| M-014 | Inasistencia ("No asistió") y cancelaciones | COUNT(No asistió) / citas agendadas; COUNT(Cancelada) | día / mes × sede × podólogo | cita | 01, 42 (sin cifra en pantalla) | Reporte "Ocupación de agenda y faltas" listado; fórmula **[INFERIDO]** |
| M-015 | Pacientes nuevos | COUNT(pacientes con primera cita atendida en el periodo) = 41; "14% de las citas" = 41 / 286 = 14.3% (cuadra) | mes × sede | paciente, cita | 31 | "nuevo" no definido P-098; 25/26 piden "¿primera vez?" |
| M-016 | Ticket promedio | ingreso total / citas atendidas = 412,860 / 286 = $1,443.6 (31 muestra $1,443; ▲ $32) | mes × sede × podólogo | ingreso, cita | 31 | Incluye productos y citas $0 → P-098; truncado vs redondeado |
| M-017 | Quejas del mes / abiertas | ver M-004; "5, ▼, 2 abiertas" en 31; 14: abiertas 9, 3 con más de 7 días, del mes 14 (−2 vs septiembre) | mes × sede × podólogo | queja | 31, 14 | cifras contradictorias P-021 |
| M-018 | Tiempo medio de resolución | AVG(fecha de cierre − fecha de registro) de quejas cerradas; 3.2 días, meta 3 días | mes × sede × tipo | queja | 14 | P-020 (meta/plazo) |
| M-019 | Satisfacción tras resolución | AVG(calificación) de encuestas post-queja; 4.1 / 5 con 11 encuestas | mes | encuesta | 14 | P-054 |
| M-020 | Días de una queja abierta | hoy − fecha de registro (columna "Días") | queja | queja | 14 | |
| M-021 | Lista de espera: en espera / prioridad alta / huecos que coinciden / notificados sin respuesta (> 2 h) / agendados desde lista | COUNT por estado y prioridad; huecos = hueco liberado ∩ servicio/podólogo/disponibilidad deseados | día × sede | lista de espera, agenda | 12 | P-041 |
| M-022 | Tasa de cierre de lista de espera | agendados desde lista (mes) / solicitudes del mes; 19 → 61% implica un denominador de ≈ 31 | mes × sede | lista de espera | 12 | Denominador no visible **[INFERIDO]** |
| M-023 | Cumplimiento de planes | sesiones realizadas / sesiones del plan ("1 de 3, 0 faltas, 0 reprogramaciones"); planes activos 11 con saldo $9,800 | plan × paciente × podólogo | plan, sesiones | 05, 20, 42 | P-026, P-028 |
| M-024 | Pacientes activos / inactivos / reactivados | activos = con visita en 12 meses (1,142); inactivos = sin visita > 6 meses (218); reactivados del mes = 23 | mes × sede | paciente, cita | 16 | Los conjuntos se traslapan (meses 6 a 12) P-052 |
| M-025 | Revisiones vencidas | COUNT(pacientes con revisión sugerida < hoy) = 67, de los cuales 19 de pie diabético; "vencida hace 38 días" = hoy − próxima revisión (02) | servicio × sede | consulta, valoración | 16, 02, 06 | Intervalos por servicio P-052 |
| M-026 | Cumpleaños de la semana | pacientes con cumpleaños en la semana = 12; con consentimiento de promociones = 8 | semana × sede | paciente, consentimientos | 16 | |
| M-027 | Días sin venir / valor histórico | hoy − última visita (229); Σ cobrado histórico del paciente ($2,950) | paciente | cita, ingreso | 16 | |
| M-028 | Resultados de campaña | respondieron / enviados (31 / 64 = 48%), citas / enviados (22 / 64 = 34%), ingreso atribuido ($7,150) | campaña | campaña, cita, ingreso | 16 | Regla de atribución no dicha P-053 |
| M-029 | NPS | % promotores − % detractores; +54 en 90 días con 187 respuestas | 90 días / mes × sede | encuesta | 16 | P-054 |
| M-030 | Lotes de esterilización | lotes del mes 86; aprobados 84 (97.7% = 84 / 86, cuadra); rechazados 2; kits en circulación 24 (3 por esterilizar) | mes × sede × autoclave | lote, kit | 15 | 15 lista un solo rechazado en la tabla P-023 |
| M-031 | Costo de mantenimiento del mes vs presupuesto | Σ costo de órdenes del mes = 9,800 vs presupuesto 8,000 (coincide con EDR "Mantenimiento") | mes × sede × categoría | orden de trabajo | 41, 35 | Las órdenes listadas suman 16,862; "equipos vencidos 2" vs 1 en tabla P-112 |
| M-032 | Órdenes de trabajo abiertas / urgentes / por autorizar | COUNT por estatus y tipo = 6 abiertas, 2 por autorizar, 1 urgente | sede × categoría | orden de trabajo | 41 | |
| M-033 | Puntaje SINBAD | S + I + N + B + A + D, cada ítem 0 o 1 (2 / 6) | valoración | valoración de pie | 06 | Criterios clínicos P-010 |
| M-034 | Resultado de monofilamento | COUNT(sitios sin sensibilidad) / 10 por pie (3 de 10) | valoración | valoración de pie | 06 | |
| M-035 | Categoría de riesgo del pie / frecuencia de revisión | regla propuesta (IWGDF) a partir de sensibilidad protectora, enfermedad arterial y deformidad (3 = alto → cada 1–3 meses) | paciente | valoración de pie | 06 | Requiere validación clínica P-010 |
| M-036 | Edad del paciente | años cumplidos a la fecha (51 años, 58 años) | paciente | paciente | 02, 10 | |
| M-037 | Estudio de pisada | longitud, ancho metatarsal, altura de arco, ángulo del retropié, dismetría (mediciones capturadas, no calculadas) | paciente | estudio | 07 | |

## 2. Caja, ventas y facturación (17, 18, 19, 20)

| ID | Indicador | Fórmula deducida | Granularidad | Fuente | Mockup | Notas / pregunta |
|---|---|---|---|---|---|---|
| M-040 | Subtotal, descuentos, total a cobrar, pagado y saldo | Subtotal = Σ importes de línea = 1,835; Descuentos −25; Anticipo aplicado −200; **Total a cobrar = 1,835 − 25 − 200 = 1,610** (cuadra); saldo = total − pagado | ticket | línea de venta, pagos | 17 | El ticket imprime TOTAL 1,810 (antes del anticipo) y el corte "1,610" |
| M-041 | IVA incluido | IVA de productos = base con IVA × 16 / 116 = (225 + 1,185) × 16 / 116 = 194.48 (cuadra); servicios exentos | ticket / mes | línea, tasa de IVA | 17, 18 | P-056, P-057 |
| M-042 | Corte de caja | Efectivo esperado = fondo inicial + ventas en efectivo − retiros = 1,500 + 6,340 − 2,000 = 5,840 (cuadra); diferencia = contado − esperado = 5,820 − 5,840 = −20 | turno × caja × sede | turno, pagos, retiros | 17 | |
| M-043 | Ventas totales del turno | Σ efectivo + tarjeta + SPEI + Clip + gift card + anticipos aplicados = 6,340 + 8,120 + 2,200 + 1,800 + 400 + 1,000 = 19,860 (cuadra) | turno | pagos | 17 | Mezcla ventas y anticipos "que no son dinero del turno" → P-059 |
| M-044 | Tickets por facturar / timbradas / canceladas / notas de crédito | COUNT y Σ por estatus: 9 / $14,260; 86 / $129,430; 3 / $3,900; 2 / $2,150 | mes × sede | factura | 18 | 33 dice 218 cobros con CFDI (76%): contradicción con 86 timbradas |
| M-045 | CFDI: subtotal, descuento, IVA trasladado, IVA exento, total | subtotal 1,637.07 − descuento 21.55 + IVA 194.48 = 1,810.00 (cuadra); IVA = 16% × base 1,215.52 | factura | conceptos | 18 | P-057 |
| M-046 | Margen de producto | (precio de venta − costo promedio) / precio de venta: crema (250 − 118) / 250 = 53% (cuadra) | producto × sede | catálogo, costo promedio | 19 | |
| M-047 | Indicadores del catálogo | servicios activos 18 (2 pausados); productos activos 42 (3 sin existencia); precios con vigencia futura 2; último cambio de precios | clínica | catálogo | 19 | 21 habla de 44 productos |
| M-048 | Ahorro de paquete | suma de componentes − precio del paquete = 3,700 − 3,400 = 300 (8.1%) | paquete | paquete | 20 | |
| M-049 | Planes, membresías, gift cards | planes activos 11 ($9,800 de saldo); membresías vigentes 8 (3 renuevan en 30 días); gift cards con saldo 9 ($3,100); promociones activas 0 y 1 programada | clínica | plan, membresía, gift card | 20 | P-073, P-091 |
| M-050 | Anticipo y saldo en portal | anticipo = % o monto del precio; saldo = precio − anticipo (200 / 200 de 400) | cita | cita, pago | 25, 26, 27, 45 | P-034 |

## 3. Inventario y compras (21, 22, 23, 24)

| ID | Indicador | Fórmula deducida | Granularidad | Fuente | Mockup | Notas / pregunta |
|---|---|---|---|---|---|---|
| M-060 | Productos con existencia | COUNT(productos con existencia total > 0) = 41 de 44 | clínica / sede | existencias | 21 | 19 reporta 42 activos + 3 sin existencia |
| M-061 | Bajo mínimo | COUNT(producto, sede donde existencia < mínimo) = 7 (2 críticos); 31 los muestra como "7 productos" por sede (Coyoacán 4, Polanco 2, Roma 1) | sede × producto | existencias, mínimos | 21, 31 | "en el mínimo" aparece como estado aparte; P-084 |
| M-062 | Valor de inventario | Σ existencia × costo promedio = 86,540; por sede 39,200 + 27,800 + 19,540 (cuadra); por producto crema 46 × 118 = 5,428 (cuadra) | sede × producto | existencias, costo | 21 | P-083 |
| M-063 | Próximos a caducar (90 d) | COUNT(lotes con caducidad − hoy ≤ 90) = 3 lotes por $1,420; días = fecha caducidad − hoy | lote × sede | lote | 21 | El valor de los tres lotes listados es ≈ $3,696 (8×62 + 4×720 + 2×160) y el tercero está a 98 días; los días están contados desde el 25-oct (los mockups usan 27-oct) |
| M-064 | Traspaso | partidas, unidades, costo = Σ cantidad × costo promedio de origen; diferencia = enviado − recibido | traspaso | traspaso | 22 | 1,533 en pantalla vs 1,722 con costos de 21 |
| M-065 | Sugerir según mínimos | cantidad a enviar/comprar = mínimo del destino − existencia (o hasta un máximo) | producto × sede | existencias | 22, 23 | P-084 |
| M-066 | Orden de compra | subtotal = Σ cantidad × costo × (1 − descuento de línea) = 15,188; descuento; IVA 16%; total = 15,188 − 393.30 + 2,367.31 = 17,162.01 (cuadra) | OC | OC, líneas | 23 | El descuento de línea ya está en el subtotal y se vuelve a restar P-057 |
| M-067 | Compras: abiertas / por recibir / del mes / cuentas por pagar | órdenes abiertas 3 ($30,142); por recibir esta semana 2; compras de octubre $44,812 (+6% vs sep); CxP $12,980 vence 08-nov | mes × sede × proveedor | OC, factura | 23 | |
| M-068 | Variación de costo | (costo nuevo / último costo) − 1 (−5%, −4%, +2%) | producto × proveedor | OC | 23, 24 | |
| M-069 | Proveedor | órdenes en 12 meses 19; total comprado $186,420; saldo por pagar; última compra; último precio | proveedor | OC, CxP | 24 | |
| M-070 | Recepción de mercancía | pendiente = ordenado − recibido (estado Parcial/Completo) | OC × línea | recepción | 23 | |

## 4. Finanzas (32 a 38, 35)

| ID | Indicador | Fórmula deducida | Granularidad | Fuente | Mockup | Notas / pregunta |
|---|---|---|---|---|---|---|
| M-080 | Utilidad bruta (EDR) | total ingresos − total gastos = 412,860 − 281,600 = 131,260 (cuadra); proy_ 430,000 − 278,000 = 152,000 | mes × sede | EDR | 35 | |
| M-081 | Utilidad neta (EDR) | utilidad bruta − impuestos y gastos fijos prorrateados = 131,260 − 4,400 = 126,860 (cuadra); % del ingreso 30.7% (31% en 31) | mes × sede | EDR | 31, 35 | Es utilidad gerencial P-100; "suscripción prorrateada 12 meses" es un cargo mensual |
| M-082 | Real vs proy | real_ / proy_ por renglón (96%, 101%, 86%…) | mes × sede × concepto | EDR | 31, 35 | regla del dueño: `proy_` manual, `real_` automático; nunca pisar `proy_` |
| M-083 | Utilidad por sede | ingresos − gastos por sede: 168,400 − 112,400 = 56,000; 139,250 − 96,100 = 43,150; 105,210 − 73,100 = 32,110 (cuadran; suman la utilidad bruta 131,260) | mes × sede | EDR | 35 | Los 4,400 fijos no se asignan por sede P-092 |
| M-084 | Corte semanal | ingresos de la semana (101,820), gastos (24,650), neto (77,170 = 101,820 − 24,650, cuadra), Δ vs semana anterior (+2.4% = 77,170 / 75,360 − 1, cuadra) | semana sáb→vie × sede | ingresos, gastos | 32 | P-088 |
| M-085 | Desglose por forma de cobro | COUNT y Σ por forma: 104 + 139 + 47 + 22 = 312 cobros; 29,640 + 48,230 + 16,350 + 7,600 = 101,820 (cuadra) | semana × sede | pagos | 32 | Las formas de pago no coinciden entre 17, 32 y 33 P-059; 7,600 aparece también como "venta de productos" |
| M-086 | Efectivo a depositar | efectivo cobrado de la semana (29,640), "contado en caja" | semana × sede | pagos | 32, 17 | No resta retiros ni gastos de caja P-059 |
| M-087 | Ingresos: por cobrar / cobrado / por validar | por cobrar $18,450 (23 citas sin pago); cobrado servicios $398,460; productos $14,400; por validar vs banco $41,200 (17 registros) | mes × sede × podólogo | ingresos, citas | 33 | 36 muestra los mismos montos con otros conteos (31 pendientes, 14 en mora) P-090 |
| M-088 | Ingreso "del mes en turno" vs "de meses anteriores" | del mes 371,200 + de meses anteriores (anticipos/planes) 41,660 = 412,860 (cuadra) | mes | ingresos | 33 | P-091 |
| M-089 | Con CFDI | COUNT(cobros con factura) / total de cobros = 218 / 286 = 76% (cuadra) | mes × sede | ingresos, factura | 33 | vs 86 timbradas de 18 |
| M-090 | Conciliación | pagados 241 ($344,110) + pendientes 31 ($41,200) + en mora 14 ($18,450) = 286 cobros; "total cobrado" 286 / $412,860 | mes × cuenta | cobro, movimiento bancario | 36 | Los tres importes suman 403,760, no 412,860 P-090 |
| M-091 | Gastos: tickets y totales | tickets semana 38 (con producto 34, con foto 31); mes 142; año 1,206; con proveedor del catálogo 32 / 38 = 84% (cuadra); total del día | día / semana / mes / año × sede × grupo | gasto | 34 | Subtotal + IVA = total (1,086.21 + 173.79 = 1,260, cuadra); las líneas visibles (965) no suman el subtotal |
| M-092 | Fondo revolvente | disponible = base − gastado = 6,000 − 3,820 = 2,180; % usado = 3,820 / 6,000 = 64% (cuadra); por rubro | semana × sede | fondo | 37 | P-095; 32 reporta 3,800 |
| M-093 | Cuentas por pagar | por pagar total $86,420 (14 facturas); vence esta semana $23,100 (5); saldo = importe − pagado | proveedor × sede | factura de proveedor | 38 | |
| M-094 | Cuentas por cobrar y antigüedad | por cobrar $31,250 (23 pacientes); antigüedad 0–30 (19,400), 31–60 (8,200), 61–90 (2,650), +90 (1,000) = 31,250 (cuadra); cobrado de saldos del mes $18,900 (▲ 12%) | paciente × mes | saldos | 38 | P-076 |

## 5. RH, comisiones y nómina (39, 40)

| ID | Indicador | Fórmula deducida | Granularidad | Fuente | Mockup | Notas / pregunta |
|---|---|---|---|---|---|---|
| M-100 | Comisión por podólogo | % del esquema × base comisionable: 5% × 121,300 = 6,065 (cuadra); total de comisiones $20,643 = 5.0% del ingreso; detalle: servicio 5%, producto 10% | periodo × podólogo × servicio | ingreso validado | 40 | La tabla aplica 5% a todo; el detalle 5% / 10% → P-106, P-107 |
| M-101 | Mayor productividad | podólogo con mayor base comisionable ($121,300, 74 citas) | mes | ingreso, cita | 40 | |
| M-102 | Ingreso por hora de cabina | ingreso del periodo / horas de cabina (412 ▲ 18); implica ≈ 1,000 horas en el mes | mes × sede | ingreso, agenda | 40 | Horas agendadas o atendidas no se dice P-098 |
| M-103 | Meta de sede cumplida | COUNT(sedes con resultado ≥ meta) = 2 de 3; Polanco 78% de su meta | mes × sede | ingreso, meta | 40 | Metas P-097 |
| M-104 | Quejas por podólogo en comisiones | COUNT(queja) por podólogo (5 en total) | mes | queja | 40 | |
| M-105 | Prenómina por empleado | percepción = salario del periodo + comisión; neto = percepción + subsidio − IMSS/ISR (Ruiz: 13,565 − 1,980 = 11,585, cuadra; López: 4,800 + 210 − 310 = 4,700, cuadra) | quincena × empleado | empleado, asistencia, comisión | 39 | Totales: percepciones 48,230 / neto 41,070 son menores que la suma de solo cinco filas (54,443 / 47,313) |
| M-106 | Asistencia | presentes 6, retardos 1, faltas 0, horas 41.5 | día × sede | checador | 39 | P-105 |
| M-107 | Saldo de vacaciones | disponibles = derecho − tomados (12 − 4 = 8) | empleado | empleado | 39 | P-110 |

## 6. Plataforma, suscripción, importación, auditoría (13, 28, 43, 46, 47, 48)

| ID | Indicador | Fórmula deducida | Granularidad | Fuente | Mockup | Notas / pregunta |
|---|---|---|---|---|---|---|
| M-110 | Cargo mensual de la clínica | plan por podólogo = podólogos activos × 400 (4 × 400 = 1,600) o plan por clínica = 1,000; ahorro de cambiar de plan = 1,600 − 1,000 = 600 (cuadra) | mes × clínica | suscripción | 46, 28 | P-116 |
| M-111 | Uso del plan | podólogos activos (4 de 4), sedes (3), usuarios (9), almacenamiento (5.1 GB), citas del mes (286) | mes × clínica | uso | 46, 48 | 44 lista 7 usuarios P-131; P-115 |
| M-112 | Ingreso recurrente (MRR) | Σ cargo mensual de las clínicas cobradas = $5,700 | mes | suscripciones | 48 | Las cinco filas suman 5,600 P-117 |
| M-113 | Panel RANNIX | clínicas activas 5 (1 en prueba, 1 suspendida), podólogos activos 17 (4 + 6 + 3 + 2 + 2, cuadra), tickets de soporte abiertos 3, cobro automático 4 de 5 | mes | clínica, soporte | 48 | |
| M-114 | Importación | válidos 1,198 + advertencia 52 + error 34 = 1,284 filas (cuadra); a cargar 1,250 = válidos + advertencias; duplicados 19; confianza IA por columna (%) | lote | archivo, mapeo | 13 | P-122 |
| M-115 | Bitácora | eventos 7 días 1,284; accesos al expediente 412 (de 38 pacientes); cambios en expediente 97; inicios fallidos 3 (1 usuario bloqueado) | día / semana × usuario × módulo | bitácora | 43 | |
| M-116 | Asistente de IA | respuestas calculadas sobre las mismas métricas M-001 a M-006 (ingreso por servicio y podólogo, bajo mínimo, quién atendió) | consulta | vistas de lectura | 47 | P-125 |

## 7. Cifras que los mockups dan distintas (resumen)

Ver `PREGUNTAS_ABIERTAS.md`, apéndice A. Las más importantes para esta lista: citas del mes (286 · 252 · 391), quejas de octubre (14 · 5 · 5), venta de productos (14,400 · 9,800), CFDI (86 · 218), "real" validado vs cobrado, comisión 5% plano vs 5% / 10%, MRR (5,700 vs 5,600), percepciones de nómina, valor de caducidades.
