# MÉTRICAS

Granularidad base: **sucursal × día**, con consolidado por mes y por empresa. Fórmulas deducidas de los mockups (13, 05, 06, 11) y del requerimiento; las no vistas se marcan [INFERIDO]. Fechas/cortes dependen de PA-T1 (zona horaria y corte del día).

| # | Indicador | Fórmula | Granularidad | Fuente / marca |
|---|---|---|---|---|
| M1 | Ventas | Σ `venta.total` con estado ≠ cancelada, − devoluciones | día, sucursal, categoría (servicio/producto), vendedor | VISTO 13 |
| M2 | Pacientes atendidos | # de `consulta` en estado cerrada/cobrada, pacientes distintos | día, sucursal, podólogo | VISTO 13 |
| M3 | Ocupación de agenda | minutos de citas atendidas+confirmadas ÷ minutos de agenda disponible (excluye bloqueos) | día, sucursal, podólogo, consultorio | VISTO 13; definición de "disponible" en PA-A1 |
| M4 | No-shows | citas `no_asistio` ÷ citas agendadas con fecha vencida | día, sucursal | VISTO 13 |
| M5 | Ticket promedio | M1 ÷ # ventas pagadas | día, sucursal | VISTO 13 |
| M6 | Cartera vencida | Σ saldo de parcialidades vencidas más allá de gracia + intereses y recargos | día, sucursal (cobro global del paciente) | VISTO 13, 08 |
| M7 | Faltante/sobrante de caja | Σ (contado − esperado) por corte | turno, cajero, sucursal | VISTO 06, 13 |
| M8 | Productos bajo mínimo | # variantes con existencia disponible < `stock_minimo` | día, almacén | VISTO 13 |
| M9 | Productividad por podólogo | consultas e ingreso por `vendedor_id`/podólogo; comisión = base × % | periodo, podólogo, sucursal | VISTO 13; base y % en PA-V5 |
| M10 | Valuación de inventario | Σ cantidad_restante × costo de cada capa PEPS | día, almacén | VISTO 11 |
| M11 | Diferencia de inventario | (contado − sistema) × costo PEPS | conteo, categoría | VISTO 11 |
| M12 | Merma | Σ ajustes con motivo merma/daño/caducidad/robo | mes, producto, sucursal | INFERIDO (requerimiento) |
| M13 | Rotación | costo de ventas del periodo ÷ inventario promedio | mes, producto, sucursal | INFERIDO |
| M14 | Margen | (precio neto − costo de capa PEPS consumida) ÷ precio neto | partida, producto, sucursal | INFERIDO |
| M15 | Apartados por vencer / vencidos | # y monto de anticipo por estado | día, sucursal | VISTO 07 |
| M16 | Retraso de laboratorio | órdenes con hoy > fecha prometida y no recibidas; días promedio | laboratorio, mes | VISTO 04 |
| M17 | Tiempo de autorización | fecha resolución − fecha solicitud | tipo, nivel | INFERIDO (14) |
| M18 | Tasa de retención | pacientes con ≥ 2 visitas en 6 meses ÷ pacientes con ≥ 1 | mes | INFERIDO (requerimiento) |
| M19 | Cumplimiento de plan de tratamiento | sesiones atendidas ÷ sesiones planeadas | paciente, mes | INFERIDO (03) |
| M20 | Cumplimiento de esterilización | ciclos conformes ÷ ciclos; sets usados con ciclo válido | mes, sucursal | INFERIDO (15) |
| M21 | Cuentas por pagar vencidas | Σ saldo CxP con vencimiento < hoy | proveedor, semana | INFERIDO (09) |
| M22 | Efectividad de campañas | pacientes nuevos por origen ÷ inversión | mes | INFERIDO (requerimiento) |

## Reglas de cálculo que dependen de preguntas abiertas
- Qué cuenta como venta del día (zona horaria y corte): PA-T1.
- Si la devolución resta de la venta original o del día de la devolución: PA-V2.
- Si M2 cuenta por sucursal de atención o por sucursal de cobro: PA-V3.

---

# AMPLIACIÓN V2 — indicadores nuevos (derivados del código)

> **[VISTO]** = la fórmula es la que ejecuta el código hoy (archivo indicado). **[INFERIDO]** = supuesto. Ninguna fórmula ha sido validada por el cliente ni contra números reales (ver `ACTA_QA.md`).
> Convención de tiempo de todas: mes y trimestre **calendario**; fecha local del navegador; «mes en curso» = parcial a hoy. Meses cerrados salen del histórico mensual (`d.hist`), que en la demostración es generado.

## Finanzas — estado de resultados (`src/store/dominios/finanzas.js`, `acciones_finanzas.js`)
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M23 | Ingresos | Mes cerrado: servicios + plantillas + productos del histórico. Mes en curso: Σ importe de partidas de tickets no cancelados × (1 − descuento ÷ subtotal del ticket), clasificado en servicios / plantillas (categoría «Plantillas») / productos | sucursal × mes; cadena = suma | Tickets cancelados. **No resta devoluciones.** No distingue cobrado de vendido a crédito. No separa IVA. La partida «envío» de pedidos en línea cae en servicios | VISTO |
| M24 | Gastos variables | (costo PEPS del producto vendido + costo de laboratorio de órdenes enviadas en el mes) + comisiones y bonos **estimados = 2 % de los ingresos** | sucursal × mes | Insumos clínicos consumidos en consulta. El bono real del libro de bonos (usa el estimado). Si la partida no guardó costo PEPS usa el costo de catálogo | VISTO |
| M25 | Utilidad bruta y margen bruto | Ingresos − gastos variables; margen = utilidad bruta ÷ ingresos | sucursal × mes | lo mismo que M23 y M24 | VISTO |
| M26 | Gastos de operación | Sueldos (M28) + Σ gastos registrados del mes por categoría (renta, luz, agua, internet, limpieza, mantenimiento, publicidad, papelería, otros) | sucursal × mes × categoría × concepto | Gastos del corporativo (no se asignan a ninguna sucursal). Depreciación, intereses, impuestos. Gastos eliminados | VISTO |
| M27 | **Utilidad operativa y margen del EDR** | Utilidad bruta − gastos de operación; **margen = utilidad operativa ÷ ingresos** | sucursal × mes; comparativo de las 7 + cadena | Todo lo excluido arriba: es utilidad **operativa**, no neta ni fiscal | VISTO |
| M28 | Nómina de la sucursal en el EDR | Σ sueldo mensual bruto de empleados no dados de baja cuya **sucursal base** es esa; en el mes en curso × (día de hoy ÷ días del mes) | sucursal × mes × persona | Dirección y administración central. Carga social (IMSS, Infonavit, impuesto sobre nómina), aguinaldo, prima, bonos. Descuentos por faltas. Quien rota carga completo a su base | VISTO |
| M29 | Posición de la sucursal | Orden de mayor a menor margen (M27); «mejor» y «peor» entre las que tienen ingresos | cadena × mes | Sucursales sin ingresos en el mes | VISTO |
| M30 | Gasto fuera de patrón | En cada (sucursal, categoría, mes): total > 1.6 × mediana de los demás meses cerrados **y** al menos $1,000 más; se marca el gasto de mayor monto | sucursal × categoría × mes | Grupos con menos de 5 meses de historia o menos de 4 meses de comparación | VISTO |
| M31 | Cuentas por pagar | Total = Σ saldo > 0; vencido = vence < hoy; por vencer = vence en los próximos 7 días; por proveedor | proveedor, día | Documentos pagados | VISTO |

## Desempeño — bonos y metas (`src/store/desempeno_motor.js`, `acciones_desempeno.js`)
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M32 | Venta atribuida | Σ (total del ticket − devoluciones vigentes de ese ticket), mínimo 0. Vendedor = `vendedorId`; si no hay, el cajero. Sucursal = la de la venta | persona × sucursal × mes | Tickets cancelados. Devoluciones rechazadas o canceladas. **Se resta de la venta original**, no del día de la devolución | VISTO |
| M33 | Venta de producto / de plantillas + calzado | Σ importe de partidas de producto (o de categorías Plantillas y Calzado), escalado por la proporción neta del ticket | persona × sucursal × mes | Servicios, anticipos, envío | VISTO |
| M34 | **Bono individual** | Base del periodo (M32 o M33 según el esquema) → escalón más alto alcanzado → % × **toda** la base o monto fijo → tope → $0 si no cumple condiciones | persona × esquema × periodo (mensual o trimestre calendario) | Roles no elegibles. No es marginal por tramo. Meses futuros del trimestre | VISTO |
| M35 | **Bolsa de sucursal y reparto** | Base = % de cumplimiento (M36) o ventas; escalón → % × venta de la sucursal o monto fijo → tope. Reparto = bolsa × días trabajados de la persona en esa sucursal ÷ Σ días de quienes cumplen condiciones; el centavo sobrante va a quien más días trabajó | sucursal × esquema × periodo; persona | Quien no cumple la condición queda fuera y **su parte se reparte entre los demás**. Roles no elegibles. Meses sin meta | VISTO |
| M36 | **Cumplimiento de meta** | 100 × venta neta de la sucursal en el mes ÷ meta del mes. Trimestre: Σ ventas ÷ Σ metas de los meses con meta | sucursal × mes / trimestre | Meses sin meta registrada (resultado «sin meta»). Ventas canceladas; resta devoluciones | VISTO |
| M37 | Proyección de cierre | Venta a hoy ÷ días transcurridos × días del mes (lineal); % proyectado contra la meta | sucursal × mes en curso | Estacionalidad dentro del mes (quincenas, fines de semana) | VISTO |
| M38 | Meta sugerida | Promedio móvil de los 3 últimos meses cerrados × tendencia (crecimiento mensual compuesto de 3 recientes contra 3 anteriores, acotado a ±3 %) × estacionalidad (mismo mes del año anterior ÷ promedio mensual, se aplica la mitad, acotada a 0.97–1.04); límites 85 %–125 % del promedio móvil; redondeo al millar | sucursal × mes | Sucursales con menos de 3 meses cerrados (no sugiere). Eventos extraordinarios | VISTO |
| M39 | Días trabajados | Días distintos en que la persona tuvo en esa sucursal una venta, una cita atendida, un turno de caja, un ciclo de esterilización o una asistencia (normal o retardo) | persona × sucursal × periodo | Días de vacaciones, incapacidad o falta | VISTO |
| M40 | Asistencia para el bono | 100 × días con entrada (normal + retardo) ÷ (esos + faltas) | persona × periodo | Vacaciones, incapacidad, permiso, descansos. Si no hay datos: **se considera cumplida** | VISTO |
| M41 | Calificación para el bono | Podólogo: promedio de «calificación del podólogo» de sus encuestas respondidas. Otros roles: promedio de «calificación de la sucursal» de sus sucursales | persona × periodo | Menos de 3 respuestas: **se considera cumplida**. Encuestas pendientes | VISTO |
| M42 | Posición entre compañeros | Lugar entre personas del mismo rol en la sucursal, por venta atribuida (o por días si nadie vende) | persona × sucursal × mes | No muestra importes ajenos | VISTO |

## Evaluación de clientes (`acciones_desempeno.js`)
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M43 | **Calificación de clientes** | Promedio de cada pregunta (servicio, podólogo, sucursal; enteros 1–5). General = promedio de las tres por encuesta, luego promedio de encuestas | sucursal, podólogo, periodo | Encuestas pendientes (sin responder) | VISTO |
| M44 | Índice de recomendación | 100 × (encuestas con general ≥ 4.5 − encuestas con general ≤ 3) ÷ respondidas. **No es el NPS estándar** (no pregunta 0–10) | sucursal, podólogo | pendientes | VISTO |
| M45 | Calificaciones bajas por atender | Encuestas con alguna calificación ≤ 2 cuyo seguimiento no está «resuelto» | sucursal | resueltas | VISTO |
| M46 | Tendencia | Promedio general de la segunda mitad de las respuestas − el de la primera mitad (por fecha) | conjunto filtrado | menos de 6 respuestas | VISTO |
| M47 | Tasa de respuesta | respondidas ÷ (respondidas + pendientes) | sucursal | — | INFERIDO (el código da ambos conteos, no la tasa) |

## Personas (`src/store/reglas_personas.js`, `acciones_personas.js`)
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M48 | **Retardo** | Entrada − horario de entrada > tolerancia (10 min); minutos tarde | persona × día | Entradas dentro de tolerancia | VISTO |
| M49 | **Asistencia del día** | Esperados, presentes, dentro (entró y no ha salido), retardos, faltas, sin registro, ausentes justificados | sucursal × día | Personas en descanso. Bajas | VISTO |
| M50 | Resumen de asistencia | Conteo de normal, retardo, falta, vacaciones, incapacidad, permiso, sin registro y minutos tarde acumulados | persona × rango | Días futuros | VISTO |
| M51 | Prenómina del periodo | Salario diario = sueldo mensual ÷ 30. Quincena = 15 días; mes = 30 (prorrateo por ingreso o baja). Descuento = faltas × salario diario + ⌊retardos ÷ 3⌋ × salario diario. Total = sueldo del periodo − descuentos | persona × quincena o mes; sucursal base | ISR, IMSS, subsidio, horas extra, bonos, séptimo día, vales. **No es nómina legal** | VISTO |
| M52 | Saldo de vacaciones | Derecho por antigüedad (tabla de la LFT) − días aprobados desde el último aniversario; disponible = saldo − solicitados | persona | Días de años anteriores no tomados | VISTO |
| M53 | Avance de expediente | Documentos entregados ÷ requeridos del puesto | persona | — | VISTO |
| M54 | Avance de capacitación | (lecciones vistas + 1 si aprobó la evaluación) ÷ (lecciones + 1 si hay evaluación) | persona × curso; curso × sucursal | Cursos no publicados | VISTO |
| M55 | Finiquito estimado | Vacaciones proporcionales + prima 25 % + aguinaldo proporcional (15 días) | persona | Sueldo pendiente, ISR, indemnización, prima de antigüedad | VISTO (por validar con contador) |

## Comercial (`src/store/acciones_comercial.js`, `acciones_comercial_asistente.js`)
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M56 | Disponible en línea | Existencia del almacén de la sucursal − apartados activos − piezas en pedidos en línea activos | producto × sucursal | Existencia de otras sucursales y del almacén central | VISTO |
| M57 | Diferencia de auditoría | Estimado − sistema; hay diferencia si \|dif\| > máx(1, 10 % del sistema redondeado hacia arriba) | producto × auditoría | Diferencias dentro de tolerancia | VISTO |
| M58 | Cumplimiento de auditoría | Días desde la última auditoría por sucursal; vencida si > 7; número de auditorías con alertas o en investigación | sucursal | — | VISTO |
| M59 | Desde cuándo falta | Inicio de la última racha de faltantes de un producto y última auditoría conforme anterior | producto × sucursal | Productos nunca auditados | VISTO |
| M60 | Valor del faltante | \|diferencia\| × costo de catálogo del producto | investigación | Costo PEPS real de la capa | VISTO |
| M61 | Respuestas del asistente | 15 métricas con definición propia (ventas, ticket, citas, podólogo con más consultas, faltante de caja, cartera vencida, atraso, utilidad, avance de meta, por agotarse, existencia, pedidos pendientes, ocupación, más vendidos) | según la pregunta | Ver «Definiciones que no coinciden» abajo | VISTO |

## Análisis de datos (`acciones_desempeno.js`)
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M62 | Serie mensual | 12 meses cerrados del histórico + mes en curso de tickets; servicios, plantillas, productos, pacientes | sucursal o cadena × mes | cancelados | VISTO |
| M63 | Ranking de podólogos | Consultas cerradas o cobradas, ingreso atribuido (M32), ticket = ingreso ÷ ventas, ocupación = minutos de citas ÷ (días con citas × jornada) | podólogo × rango | Citas canceladas | VISTO |
| M64 | Cobertura de producto | Existencia ÷ (unidades vendidas ÷ días del rango); menor rotación = menor vendido ÷ existencia | producto × sucursal × rango | Insumos (solo productos de venta) | VISTO |
| M65 | Comparativo contra la cadena | (valor de la sucursal − promedio simple de las 7) ÷ promedio, para ventas, ticket, pacientes y ocupación | sucursal × periodo | Promedio no ponderado por tamaño | VISTO |

## Data warehouse (`src/store/plataforma_dw.js`) — en construcción
| # | Indicador | Fórmula | Granularidad | Qué EXCLUYE | Marca |
|---|---|---|---|---|---|
| M66 | Ventas, ventas netas, tickets, ticket promedio | Σ importe de renglones de tickets no cancelados (descuento prorrateado); netas = ventas − devoluciones **del periodo**; ticket = ventas ÷ tickets | sucursal × día / mes | cancelados | VISTO |
| M67 | Margen bruto y resultado del DW | Margen = ventas netas − costo PEPS. Resultado = margen − gastos | sucursal × mes | **Nómina y comisiones** (por eso no coincide con M27) | VISTO |
| M68 | No asistencia | 100 × no asistió ÷ (citas − canceladas) | sucursal × mes | canceladas | VISTO |
| M69 | Puntualidad | 100 × (presentes − retardos) ÷ presentes | sucursal × mes | faltas y ausencias | VISTO |
| M70 | **Cuadre del DW** | Para 10 totales (ventas, tickets, pagos, devoluciones, gastos, citas, consultas, valuación de inventario, piezas, registros de asistencia): diferencia = total del DW − total operativo calculado por un camino independiente; cuadra si \|diferencia\| < $0.005 | por corrida de carga | — | VISTO |

## Comunicación (`src/store/acciones_comunicacion.js`)
| # | Indicador | Fórmula | Qué EXCLUYE | Marca |
|---|---|---|---|---|
| M71 | Mensajes no leídos | Mensajes ajenos sin leer en conversaciones del usuario | Conversaciones silenciadas | VISTO |
| M72 | Correos no leídos | Correos sin leer en su entrada | Archivados y borradores | VISTO |
| M73 | Novedades del feed | Publicaciones visibles de otras personas posteriores a su última visita | Las propias | VISTO |

## Definiciones que NO coinciden entre módulos (a resolver en E3, no en silencio)
1. **«Ventas» tiene cuatro definiciones.** Bonos (M32) restan la devolución de la venta original. El DW (M66) la resta el día en que ocurre. El estado de resultados (M23) y el asistente **no la restan**. Hay que elegir una (pregunta V2-30 y PA-V2).
2. **«Utilidad»**: el EDR (M27) incluye nómina y comisiones estimadas; el resultado del DW (M67) no; el asistente usa «lo que exista capturado». Tres cifras posibles para la misma sucursal y mes.
3. **«Cartera vencida»**: el indicador original M6 incluye intereses y recargos; el asistente responde solo capital.
4. **«Ocupación»**: el consolidado original, el análisis (M63) y el asistente usan denominadores distintos (jornada por día con citas, o consultorios × horas × días).
5. **Comisiones**: la comisión del podólogo del sistema original (M9, PA-V5) y los bonos de la ampliación conviven sin regla que diga si se suman (pregunta V2-20).
6. **Mes en curso contra mes cerrado**: el mes en curso se calcula de tickets y el cerrado de un resumen; un mismo indicador cambia de fuente al cambiar de mes. En producción ambos deben salir de la misma fuente.
