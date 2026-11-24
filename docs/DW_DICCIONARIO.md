# Data warehouse de Pie Firme — diccionario de dimensiones y métricas

Modelo dimensional en estrella, hecho con **vistas** (`security_invoker`) sobre las tablas operativas, en el esquema `piefirme` (migración
`062_superadmin_errores_datawarehouse.sql`). No duplica datos: siempre refleja lo que hay en la base.

- **Quién lo ve:** solo Administrador y Superadministrador (cada vista lleva `where piefirme_app.es_admin()`); además heredan el RLS por clínica.
  Podólogo y Recepción reciben 0 filas (verificado con `scripts/verificar-roles.mjs`).
- **Privacidad (LFPDPPP / NOM-004):** `dw_dim_paciente` está **anonimizada** (sin nombre, CURP, teléfono, correo ni domicilio; edad en rangos).
  Ningún hecho trae texto clínico (diagnósticos solo como conteo).
- **Zona horaria de negocio:** `America/Mexico_City`. Moneda: MXN. Los importes de venta (`base_neta`) van **sin IVA**.
- **Llave de tiempo:** `fecha_key` = AAAAMMDD (entero) → `dw_dim_tiempo.fecha_key`.
- **Catálogo vivo:** las vistas `dw_catalogo` (objetos) y `dw_metricas` (fórmulas) responden lo mismo que este documento.

## Cómo exportar
| Necesidad | Cómo |
|---|---|
| Un archivo | App → Utilerías → **Data warehouse** → botón **CSV** por objeto |
| Todo para BI | Mismo módulo → **Paquete BI (ZIP de CSV)**: un CSV por objeto + `esquema.json` (columnas y métricas) |
| Tableros a Excel | Mismo módulo → **Tableros a Excel** (una hoja por tablero) |
| Por línea de comandos | `node scripts/exportar-dw.mjs qa [carpeta]` (usa la service_role del servidor; escribe CSV + `esquema.json`) |
| BI conectado a la base | Crear un rol de solo lectura sobre `piefirme.dw_*` (Power BI / Looker Studio / Metabase vía Postgres). Con JWT de usuario solo funciona para Administrador |

## Dimensiones
| Vista | Grano | Atributos principales | Llave |
|---|---|---|---|
| `dw_dim_tiempo` | día (2024-2028) | año, trimestre, mes, `anio_mes`, nombre del mes, semana ISO, día del mes y de la semana, fin de semana | `fecha_key` |
| `dw_dim_sede` | sede | clave, nombre, activa, dirección | `sede_id` |
| `dw_dim_servicio` | servicio | código, nombre, categoría, tipo de precio, duración, domicilio/videoconsulta | `servicio_id` |
| `dw_dim_producto` | producto | SKU, nombre, categoría, marca, tipo, costo promedio | `producto_id` |
| `dw_dim_podologo` | podólogo | nombre, cédula, activo, sede base | `podologo_id` |
| `dw_dim_paciente` | paciente (anonimizado) | sexo, grupo de edad, diabetes, canal de origen, municipio, sede de registro, fecha de alta | `paciente_id` |
| `dw_dim_proveedor` | proveedor | clave, nombre, categoría, laboratorio, días de crédito | `proveedor_id` |
| `dw_dim_grupo_gasto` | grupo de gasto | clave, nombre, permite fondo | `grupo_id` |
| `dw_dim_metodo_pago` | método | efectivo, tarjeta, Clip, transferencia, anticipo, gift card; si es dinero de caja | `metodo` |

## Hechos
| Vista | Grano | Medidas | Dimensiones (FK) |
|---|---|---|---|
| `dw_fact_citas` | cita | `citas`, `atendidas`, `no_asistio`, `canceladas`, `precio_servicio`, `duracion_min`, `espera_min` | tiempo, sede, servicio, podólogo, paciente · estado, origen, tipo de atención, primera vez |
| `dw_fact_ventas` | renglón de ticket cobrado | `cantidad`, `importe_bruto`, `descuento`, `importe`, `base_neta`, `iva_monto` | tiempo, sede, servicio, producto, paciente, podólogo, cajero · tipo (servicio/producto/plan/gift_card) |
| `dw_fact_pagos` | pago | `monto` | tiempo, sede, método |
| `dw_fact_ingresos` | ingreso (módulo finanzas) | `importe`, `iva` | tiempo, sede, paciente, podólogo · clasificación, forma de pago, reembolso |
| `dw_fact_gastos` | gasto no anulado | `subtotal`, `iva`, `total` | tiempo, sede, grupo de gasto, proveedor · método de pago, módulo de origen |
| `dw_fact_inventario_mov` | movimiento de inventario | `cantidad`, `costo_unitario`, `costo_total` | tiempo, sede, producto · tipo (compra, venta, ajuste, merma, traspaso, conteo) |
| `dw_fact_existencias` | existencia actual (foto) | `existencia`, `minimo`, `maximo`, `valuacion`, `bajo_minimo` | sede, producto |
| `dw_fact_consultas` | consulta clínica | `consultas`, `diagnosticos`, `procedimientos`, `firmada` | tiempo, sede, paciente, podólogo, servicio |
| `dw_fact_asistencia` | día trabajado | `minutos_trabajados`, `minutos_retardo` | tiempo, sede, empleado |
| `dw_fact_comisiones` | comisión calculada | `base`, `pct`, `comision` | tiempo, sede, empleado |
| `dw_fact_cuentas_pagar` | factura de proveedor | `importe`, `pagado`, `saldo`, `vencida` | tiempo (emisión), sede, proveedor |
| `dw_fact_quejas` | queja | `compensacion_monto`, `dias_resolucion` | tiempo, sede, paciente, podólogo · clase, tipo, gravedad, estado |
| `dw_fact_encuestas` | encuesta respondida | `calificacion` (1-5), `requiere_atencion` | tiempo, sede, paciente |

## Tableros ejecutivos (KPIs ya calculados)
| Vista | Grano | Para qué |
|---|---|---|
| `dw_kpi_resumen` | métrica | Tarjetas: mes en curso vs mes anterior, variación % y acumulado del año (ventas, ingresos, gastos, utilidad, citas, no-show, primera vez, consultas) |
| `dw_kpi_mensual_org` | mes | Consolidado de la clínica con margen % |
| `dw_kpi_mensual_sede` | sede × mes | Citas, no-show %, ventas, tickets, ticket promedio, ingresos, gastos, utilidad, calificación, comisiones, horas trabajadas |
| `dw_kpi_servicio_mes` | servicio × sede × mes | Tickets, unidades, ventas, descuentos |
| `dw_kpi_producto_mes` | producto × sede × mes | Unidades, ventas, margen |
| `dw_kpi_podologo_mes` | podólogo × mes | Productividad: atendidas, no-show %, ingreso atendido, espera promedio |
| `dw_kpi_metodo_pago_mes` | método × sede × mes | Mezcla de medios de pago |
| `dw_kpi_gasto_grupo_mes` | grupo × sede × mes | Gasto por rubro |
| `dw_kpi_inventario` | sede × categoría | Productos, bajo mínimo, valuación |
| `dw_kpi_pacientes` | perfil | Pacientes por edad, sexo, diabetes y canal |

## Métricas clave
| Métrica | Fórmula | Fuente | Unidad |
|---|---|---|---|
| `ventas` | Σ `base_neta` de renglones de ventas cobradas (sin IVA) | `dw_fact_ventas` | MXN |
| `tickets` | conteo distinto de ventas cobradas | `dw_fact_ventas` | tickets |
| `ticket_promedio` | `ventas` ÷ `tickets` | `dw_kpi_mensual_sede` | MXN |
| `ingresos` | Σ `importe` de ingresos − reembolsos | `dw_fact_ingresos` | MXN |
| `gastos` | Σ `total` de gastos no anulados | `dw_fact_gastos` | MXN |
| `utilidad` | `ingresos` − `gastos` | `dw_kpi_mensual_sede` | MXN |
| `margen_pct` | 100 × `utilidad` ÷ `ingresos` | `dw_kpi_mensual_org` | % |
| `citas_agendadas` / `citas_atendidas` / `no_shows` | conteo por estado de la cita | `dw_fact_citas` | citas |
| `tasa_no_show_pct` | 100 × `no_shows` ÷ (agendadas − canceladas) | `dw_kpi_mensual_sede` | % |
| `pacientes_primera_vez` | citas atendidas con `primera_vez` | `dw_fact_citas` | pacientes |
| `consultas` | conteo de consultas clínicas | `dw_fact_consultas` | consultas |
| `calificacion_promedio` | promedio de encuestas respondidas | `dw_fact_encuestas` | 1-5 |
| `espera_promedio_min` | promedio de (inicio de atención − llegada) | `dw_fact_citas` | min |
| `valuacion` | Σ existencia × costo promedio | `dw_fact_existencias` | MXN |
| `bajo_minimo` | existencia < mínimo | `dw_fact_existencias` | productos |
| `comisiones` | Σ comisión calculada | `dw_fact_comisiones` | MXN |
| `horas_trabajadas` | Σ minutos trabajados ÷ 60 | `dw_fact_asistencia` | h |
| `cxp_vencidas` | saldo > 0 y vencimiento < hoy | `dw_fact_cuentas_pagar` | cuentas |

## Notas de uso
- El mes en curso puede estar incompleto; `dw_kpi_resumen` lo compara contra el mes anterior completo.
- `ventas` (de tickets) e `ingresos` (de finanzas) pueden diferir: los ingresos incluyen anticipos y se registran por fecha de pago.
- Para análisis por sede de un usuario con acceso a varias, filtrar por `sede_id`; las vistas ya respetan las sedes que el usuario puede ver.
