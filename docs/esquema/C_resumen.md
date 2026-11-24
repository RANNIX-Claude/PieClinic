# C · Inventario y finanzas — resumen del esquema (migraciones 040-049)

Validado con `node scripts/validar-sql-local.mjs --archivos 001,010,020,021,022,023,024,025,026,027,028,029,030,031,032,040…049` (25/25 aplicadas; y con todas las migraciones 001-059: 42/42; sin tablas sin RLS, sin políticas abiertas, sin vistas sin `security_invoker`; la única advertencia del validador son las RPC `portal_*` de B, que son públicas por diseño). También aplican junto con 033-039 y 050-059 (42/42). Comportamiento probado en PGlite con un guion de humo (compras → recepción → CxP → pago → gasto; traspaso con diferencia; ticket → ingreso → kardex → conciliación automática; fondo y cierre; EDR proy_/real_; cierre y reapertura de periodo) y con las semillas B_02 + C_01…C_04.

## Archivos

| Migración | Tema |
|---|---|
| 040 `proveedores_inventario` | parámetros de finanzas por clínica, helpers `app.c_*`, folios `fin_folio`, proveedores (E97) con CLABE aparte (P-111), documentos (E100), producto-proveedor (E98), inventario por sede (E87), lotes y caducidad (E88), kardex (E89), histórico de costo (E99), conteos físicos (E90), mermas (E91) |
| 041 `traspasos_compras` | traspasos (E92/E93) con RPC enviar/recibir/cancelar, órdenes de compra con autorización por monto (E94/E95), recepciones con factura (E96), devoluciones a proveedor |
| 042 `catalogos_financieros` | semana sábado→viernes, renglones del EDR (E115), grupos de gasto (E107), cuentas bancarias (E118), cierres de periodo (E117) y su guardia de solo lectura |
| 043 `ingresos_cuentas_cobrar` | ingresos (E104) ligados a venta/cita/pago/anticipo, reparto por renglón, cuentas por cobrar (E113), aplicaciones que no exceden el ingreso, clasificación automática, validación/observado |
| 044 `gastos_fondo_revolvente` | gastos (E105) con comprobante desde $2,000, líneas de ticket (E106), carga en grupo (E108), fondo revolvente por sede (E109) y cierres/reposición (E110) |
| 045 `bancos_conciliacion` | estados de cuenta (E119), movimientos (E120), liquidaciones Clip (E122), conciliación movimiento↔cobro/gasto/pago (E121), importar CSV, confirmar/deshacer |
| 046 `cuentas_pagar_conciliacion_auto` | cuentas por pagar (E111), pagos a proveedor (E112) que generan el gasto, CxP automática desde la recepción, conciliación automática (Clip por lote → referencia → monto+fecha) |
| 047 `edr_estado_resultados` | EDR por sede y mes (E114-E116): `proy_` manual, `real_` automático, ajustes, recálculo diferido al commit, desglose, consolidado |
| 048 `resumen_semanal_cierres` | resumen semanal (E117), `cerrar_periodo` / `reabrir_periodo` (semana y mes) |
| 049 `kpis_alertas_reportes` | ganchos con caja/citas/consulta (pagos→ingresos, ticket→kardex, anticipos, facturas, devoluciones, consumos, liquidaciones Clip), KPIs, alertas y vistas de reporte |

Semillas (`supabase/semillas/`, org `00000000-0000-0000-0000-00000000c0de`, 5 sedes Pie Clinic): `C_01` proveedores, mínimos/máximos, 4 meses de compras con recepciones y CxP, lotes y caducidades, traspasos, mermas y conteos; `C_02` cuentas bancarias, fondos, gastos de 3 meses, nómina/comisiones/suscripción como gasto, gastos compartidos, cierres semanales del fondo y pagos a proveedores; `C_03` estados de cuenta, liquidaciones Clip, depósitos de efectivo, conciliación y observados; `C_04` EDR (proyecciones manuales, un ajuste), cierres de semana y de agosto-septiembre. **Orden:** A → B (B_00, B_01, B_02) → C_01 → C_02 → C_03 → C_04 → D. B_02 tarda ~6 min en PGlite porque cada pago dispara los ganchos de 049; C_01…C_04 tardan ~30 s en total.

**Números sembrados (comprobados en PGlite sobre B_02):** 10 proveedores; 40 órdenes de compra (38 recibidas con factura y CxP, 1 enviada sin recibir, 1 borrador pendiente de autorización); CxP: 32 pagadas y 6 vencidas; 3 traspasos (completo, con diferencias, en tránsito) y 1 borrador; 3 mermas (2 autorizadas); 2 conteos; 5 fondos y 60 cierres semanales (55 repuestos); 395 gastos de ago-oct (renta, luz, internet, nómina y comisiones como % de los ingresos, mantenimiento, compartidos, fondo); 2,347 ingresos nacidos de los pagos y anticipos de B_02, de los cuales 1,906 validados por conciliación, 6 con CFDI, 3 observados y 432 por validar (lo cobrado desde el 17-oct); 744 movimientos bancarios (738 conciliados; quedan 1 ambiguo, 1 sugerido, 2 comisiones y 2 intereses sin cobro); 50 cierres de semana y 2 de mes (ago, sep). **Cuadre:** lo cobrado por los pagos de B_02 en agosto ($265,532) = ingresos de C en agosto; el EDR real de ingresos (base sin IVA) = ingresos sin IVA de cada mes con diferencia $0.00 ($295,210.60 ago · $276,529.36 sep · $224,602.80 oct al 25); gastos del EDR = subtotal de los gastos (octubre difiere en el ajuste manual de −$150).

## Totales

42 tablas (2 internas sin políticas: `fin_folios`, `edr_pendientes`) · 37 definiciones de vistas `prp_*` (36 vistas; `prp_ingresos` se amplía en 045) · 29 funciones `public` (RPC y utilidades) · ~78 funciones/triggers en `app` · todas las tablas con RLS y `organizacion_id`; auditoría (`app.auditar`) en las financieras y de inventario sensible.

## Tablas por migración

040: `fin_folios`, `proveedores`, `proveedores_bancarios`, `proveedor_documentos`, `proveedor_productos`, `inventario_sede`, `lotes_producto`, `movimientos_inventario`, `historico_costos`, `conteos_fisicos`, `conteo_lineas`, `mermas`.
041: `traspasos`, `traspaso_lineas`, `ordenes_compra`, `oc_lineas`, `recepciones`, `recepcion_lineas`, `devoluciones_proveedor`.
042: `edr_renglones`, `grupos_gasto`, `cuentas_bancarias`, `cierres_periodo`.
043: `ingresos`, `ingreso_renglones`, `cuentas_por_cobrar`, `aplicaciones_cobro`.
044: `fondos_revolventes`, `gastos`, `gasto_lineas`, `comprobantes_carga`, `fondo_cierres`.
045: `estados_cuenta`, `movimientos_bancarios`, `liquidaciones_clip`, `conciliaciones`.
046: `cuentas_por_pagar`, `pagos_proveedor`.
047: `edr_periodos`, `edr_lineas`, `edr_ajustes`, `edr_pendientes` (interna).

## Vistas `prp_*`

040 `prp_proveedores`, `prp_inventario` (estado derivado S30: ok / en_el_minimo / bajo_minimo / sin_existencia / caduca_pronto, valor, próxima caducidad, existencia negativa), `prp_lotes` (días para caducar y acción sugerida), `prp_kardex`, `prp_mermas` · 041 `prp_traspasos`, `prp_traspaso_lineas`, `prp_ordenes_compra`, `prp_oc_lineas` (variación de costo), `prp_recepciones` · 042 `prp_grupos_gasto`, `prp_cuentas_bancarias` · 043 `prp_ingresos` (+ movimiento conciliado desde 045), `prp_ingresos_descuadrados`, `prp_cuentas_cobrar` (reciente/pendiente/en_mora) · 044 `prp_gastos` (suma de detalle vs ticket, exige comprobante, semana), `prp_fondo_semana`, `prp_fondo_revolvente_cierres`, `prp_gasto_por_rubro_semana` · 045 `prp_movimientos_bancarios`, `prp_conciliacion_cobros`, `prp_liquidaciones_clip` · 046 `prp_cuentas_pagar` (programada/por_vencer/vencida/parcial/pagada), `prp_antiguedad_saldos_pagar`, `prp_pagos_proveedor` · 047 `prp_edr` (por sede), `prp_edr_consolidado` (solo con todas las sedes, P-135), `prp_edr_resultados` (utilidad «sin impuestos») · 048 `prp_resumen_semanal`, `prp_resumen_semanal_consolidado`, `prp_cierres_periodo` · 049 `prp_kpis_finanzas`, `prp_alertas_financieras`, `prp_ingresos_mensuales`, `prp_gastos_mensuales`, `prp_compras_proveedor`, `prp_valuacion_inventario`.

## RPC (todas `security invoker`, `revoke … from public, anon`, `grant … to authenticated`)

Inventario/compras: `conteo_autorizar`, `merma_resolver`, `lote_cambiar_estado`, `traspaso_enviar`, `traspaso_recibir(id, lineas jsonb)`, `traspaso_cancelar`, `oc_autorizar`, `recepcion_registrar(oc, lineas, factura)`, `proveedor_crear_rapido`, `proveedor_vincular_nombre`, `proveedor_norm/proveedor_buscar` (utilidades), `fin_folio` (definer, folio `{SEDE}-{TIPO}-{NNNNNN}` con TIPO = TRA, OC, REC, MER, CNT).
Ingresos y gastos: `registrar_ingreso`, `ingreso_validar`, `fondo_cerrar_semana`, `fondo_reponer`.
Bancos: `conciliar_importar(cuenta, archivo, filas jsonb)`, `conciliar_confirmar(movimiento, vínculos jsonb)`, `conciliar_deshacer`, `movimiento_marcar`, `conciliar_automatico`, `clip_sincronizar_liquidaciones`, `pagar_proveedor`.
EDR y periodos: `edr_guardar_proyeccion`, `edr_recalcular`, `edr_desglose`, `semana_corte`, `resumen_semanal`, `cerrar_periodo(tipo, fecha, sede)`, `reabrir_periodo(cierre, motivo)`.

## Estados (CHECK, de `MODELO_ESTADOS.md`)

Ingreso (S17): `por_validar → validado → validado_cfdi`, `observado` (requiere observación; solo marca y alerta, no bloquea el corte). Movimiento bancario (S18): `detectado, conciliado, sugerido, ambiguo, es_gasto, sin_cobro` (`conciliado` solo lo alcanza el trigger de conciliaciones). Gasto: `borrador, guardado, anulado`. Carga en grupo (S19): `procesando, listo, ilegible, guardado`. Cuenta por pagar (S20): `programada, parcial, pagada, cancelada` (+ `por_vencer`/`vencida` derivados en la vista). Cuenta por cobrar (S21): `pendiente, parcial, cobrada, cancelada` (+ `reciente/en_mora` derivados). Traspaso (S28, CD-21): `borrador, enviado, recibido_completo, recibido_con_diferencias, cancelado`. OC (S29): `borrador, enviada, recibida_parcial, recibida, cancelada` y pago `sin_pago/por_pagar/pagada`. Existencia (S30): derivado. Conteo: `borrador, capturado, autorizado, cancelado`. Merma: `pendiente, autorizada, rechazada`. Periodo (S22/S23): fila en `cierres_periodo` = `cerrado | reabierto`; la semana «en curso / por cerrar / cerrada» se deriva en `prp_resumen_semanal`; EDR `en_elaboracion, publicado, cerrado`. Fondo: cierre `cerrado → repuesto`.

## Equivalencias con IRP

| IRP | Pie Firme |
|---|---|
| `cat_proveedores` + `proveedor_norm/buscar/vincular_nombre_proveedor` + trigger de vinculación | `proveedores` (con `alias`), `proveedor_norm`, `proveedor_buscar`, trigger en `gastos` (`c_gasto_bi`), `proveedor_vincular_nombre` |
| `cat_productos`, `gasto_detalle` | `productos` (B, reutilizado), `gasto_lineas` |
| `gastos_operativos` (+`ticket_total`, `ticket_img_url`, `proveedor_id`) y `prp_gastos` | `gastos` (`ticket_total`, `ticket_url`, `factura_url`) y `prp_gastos` |
| `gastos_operativos` del fondo, `prp_fondo_semana`, `prp_fondo_revolvente_cierres`, `fondos_revolventes` | `fondos_revolventes` (uno activo por sede), `fondo_cierres`, `prp_fondo_semana`, `prp_fondo_revolvente_cierres` |
| `ingresos` + `estatus_validacion` (POR_VALIDAR/VALIDADO/OBSERVADO) y `clasificacion` (+`clasificacion_manual`) | `ingresos` con `estatus_validacion` (+`validado_cfdi`) y `clasificacion`/`clasificacion_manual` |
| `aplicaciones_pago`, `cargos_programados`, `fn_validar_aplicaciones_vs_ingreso`, `fn_actualizar_estado_cargo`, `prp_ingresos_descuadrados` | `aplicaciones_cobro`, `cuentas_por_cobrar`, `app.c_aplicacion_chk`, `app.c_aplicacion_ai`, `prp_ingresos_descuadrados` |
| `prp_movimientos_bancarios`, `prp_conciliacion_cobros`, RPC `conciliar_banco_batch`/`confirmar_cobro`/`desmarcar_cobros` | `movimientos_bancarios`, `conciliaciones`, `conciliar_automatico`/`conciliar_confirmar`/`conciliar_deshacer` |
| `er_mensual` (columnas `proy_*`/`real_*`) y pestañas Tablero / En elaboración | `edr_periodos` + `edr_lineas` (`proy_importe`, `real_auto`, `real_ajustes`, `real_importe`) por renglón, sede y mes; `prp_edr`, `prp_edr_consolidado` |
| `ResumenSemanal.jsx` (semana sábado→viernes) | `prp_resumen_semanal`, `resumen_semanal`, `cerrar_periodo` |
| `cuentas_pagar` (`prp_cuentas_pagar`) | `cuentas_por_pagar`, `pagos_proveedor`, `prp_cuentas_pagar`, `prp_antiguedad_saldos_pagar` |
| locales / contratos / estacionamiento / vending | sedes / citas, ventas, anticipos / servicios y productos (renglones del EDR) |

## Qué cubre la base y qué queda a la app

**Constraint / trigger / función (la base lo impide):**
- P-081 compra: `ordenes_compra.requiere_autorizacion` (total ≥ `compra_autorizacion_desde`, default $5,000) y `c_oc_bi` impide enviar sin autorización; la autorización se pierde si cambia el total; recepción parcial; la CxP nace de la factura de la recepción (`c_recepcion_cxp`); misma factura en varias recepciones = una CxP.
- P-080 traspasos: transiciones solo por RPC (`c_exigir_rpc`), el envío descuenta origen a costo promedio, la recepción suma destino y las diferencias crean una reclamación; partidas congeladas tras el envío.
- P-079/P-083/P-085 inventario: existencia solo por kardex (inmutable); costo promedio ponderado en `productos.costo_promedio` + histórico; lote/caducidad exigidos si el producto los declara; venta sin existencia permitida (existencia negativa marcada y alertada); conteos y mermas solo los autoriza Administración.
- P-090 EDR: `proy_` solo por `edr_guardar_proyeccion`/Administración (el recálculo no puede escribirlo, trigger `c_edr_linea_bi`); `real_` no se edita (solo recálculo y ajustes con motivo).
- P-093 gasto: comprobante fiscal (factura o CFDI) obligatorio desde `comprobante_gasto_desde` (default $2,000); `pagado_por_empleado` exige quién; fondo exige rubro permitido (comisión bancaria excluida, P-095), sede del fondo y semana abierta.
- P-089/P-090/S17 ingreso: Observado exige observación y no bloquea; transiciones de estatus solo Administración; un cobro validado no cambia monto/fecha/forma ni se borra; las aplicaciones a cuentas por cobrar no exceden el ingreso ni el saldo (clon de IRP); conciliar valida el ingreso y deshacer lo regresa.
- P-096 pagos a proveedor: no exceden el saldo, exigen cuenta bancaria, autoriza Administración y generan el gasto en base caja.
- P-088/P-099 periodos: semana sábado→viernes (`semana_inicio_dow`), cierre/reapertura solo por RPC con bitácora, y los registros con fecha en un periodo cerrado no se crean, editan ni borran (ajustes en el periodo vigente, `ajuste_de_id`).
- P-135 consolidado: `prp_edr_consolidado` y `resumen_semanal(null)` solo con todas las sedes asignadas.
- RLS por rol (MATRIZ_ROLES §4.3-4.4): finanzas = Administración; Recepción solo inserta el cobro que nace de la caja (sin leerlo), registra gastos del fondo de su sede y opera inventario/traspasos/recepciones; Podólogo solo ve existencias y descuenta consumos en consulta.

**Queda a la app / a otros dominios:**
- Pantallas, formatos y semáforos (colores, copy «apoyo, no diagnóstico»), carga y lectura del CSV bancario (mapeo con `cuentas_bancarias.mapeo_csv`), OCR de tickets (la tabla `comprobantes_carga` existe; la IA es un adaptador sin llave y P-126 exige revisión humana).
- Subir archivos al bucket (`comprobantes`: `<org>/gastos|ingresos|proveedores/…`; `importaciones`: `<org>/bancos/…`; `documentos`: documentos del proveedor).
- Quién es «responsable designado» del fondo (`fondos_revolventes.responsable_id`) y las reglas de prorrateo distintas de «proporción de ingresos».
- Facturación a público en general, factura global, anticipos sin CFDI y notas de crédito (dominio B).
- Los costos de nómina, comisiones, mantenimiento y suscripción que calcula el dominio D entran al EDR cuando D los registra como `gastos` con `origen_modulo` = `nomina`/`comisiones`/`mantenimiento`/`suscripcion` (la semilla C_02 los siembra como porcentaje de los ingresos).

## Contratos con otros dominios

- **B → C (ganchos en 049):** `pagos` → `ingresos` (cortesía y anticipo no generan dinero nuevo; la venta de gift card es pasivo, el canje es ingreso; el reparto por renglón usa `venta_lineas.renglon_edr`/servicio); `ventas.estado → cobrada` → kardex `venta` y fecha contable del ingreso = fecha del cobro; `cancelada` → reembolso e inventario de regreso; `devoluciones_venta` → reembolso y reingreso opcional; `anticipos` pagados → ingreso `anticipo`, reembolso procesado → reembolso; `facturas` vigente/cancelada → «Validado CFDI»; `pagos_clip.liquidacion_lote` → `clip_sincronizar_liquidaciones()`.
- **A → C:** `consumos_consulta` (no cobrados, producto `insumo_clinico`) → kardex `consumo_consulta`.
- **D → C:** gastos con `origen_modulo` (arriba). D depende de `proveedores` (053).
- Dependencias de 040-049 hacia números menores: 001, 010 (pacientes), 020 (productos/servicios/precios), 023 (citas), 025 (anticipos, pagos_clip), 026 (ventas, pagos, devoluciones), 027 (facturas), 032 (consumos_consulta).

## Huecos y decisiones por defecto

- Umbrales de cuentas por cobrar (7 y 30 días) y de «por vencer» (7 días) son defaults propios (S20/S21 no los fijan): parámetros `cxc_dias_reciente`, `cxc_dias_mora`, `cxp_dias_por_vencer`.
- «Desde $5,000» y «desde $2,000» se aplican como `>=`.
- Anticipos e ingresos por plan se reconocen al cobrarse (base caja, P-091) y caen en el renglón «Otros servicios» salvo que el cobro traiga reparto; el reporte «servicios prestados» por fecha de atención no está en esta fase.
- Los gastos compartidos se prorratean con redondeo a centavo por sede (puede diferir un centavo del total).
- El EDR de julio solo trae los anticipos cobrados por adelantado (las citas empiezan el 27-jul); octubre está en curso (sin 2.ª quincena, sin comisiones del mes y con proyección a mes completo), por eso su utilidad se ve alta.
- Las semillas simulan la sesión del administrador con `request.jwt.claim.sub` y necesitan un rol que omita RLS; no se corrieron contra Supabase.
- `app.c_rpc` (permiso interno para cambiar estados desde las RPC) vive solo durante la transacción; PostgREST usa una por petición, así que el cliente no puede aprovecharla.
- Cancelar un traspaso ya enviado (D-72) lo permite solo Administración y regresa el stock al origen.
- Se puede deshacer una conciliación (D-75) con bitácora.
- Las CLABE de proveedores viven en `proveedores_bancarios` (solo Administración); no se guardan cuentas bancarias de la clínica completas, solo terminación.
- Sin pruebas contra una BD Supabase (regla 6 del encargo): lo probado es PGlite; `node scripts/test-rls.mjs qa` queda pendiente de ejecutarse cuando se aplique a QA.
