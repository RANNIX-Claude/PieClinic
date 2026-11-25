# Escenarios de INVENTARIO entre sucursales (ESC-INV)

Generados por `qa-arquitecto` (docs/METODOLOGIA_QA.md §4 Fase 1, §5, §13) solo desde documentos de negocio (`REGLAS_NEGOCIO.md` P-079 a P-087, `MATRIZ_ROLES.md` §4.3, `METRICAS.md` M-006 y M-060 a M-070, `MODELO_ESTADOS.md` S28 a S30, `REQUERIMIENTO.md`). Del esquema SQL solo se tomaron nombres de tablas y columnas para las consultas `verificar_bd`. Todos los YAML parsean (validados con js-yaml: 19 de 19).

Convención: `version: 1`, datos de la corrida con prefijo `QA-{corrida}-ESC-INV-NN`, sedes Centenario (origen) y Patio Valle de Chalco (PVC, destino). Los pasos con `ambiguo:` no se juzgan hasta que negocio responda (el tester registra VERIFICAR).

## 1. Tabla de escenarios

| Id | Archivo | Tema | Prioridad | Rol | Reglas |
|---|---|---|---|---|---|
| ESC-INV-01 | ESC-INV-01_traspaso_camino_feliz_completo.yaml | Traspaso completo: borrador, validar existencia, enviar (tránsito), recibir, folio y bitácora, conservación de valor | alta | recepción + administrador | P-080 P-079 P-083 P-086 |
| ESC-INV-02 | ESC-INV-02_traspaso_llega_con_piezas_de_menos.yaml | Llega con piezas de menos: recibido con diferencias, reclamación/merma, autoriza Administración, sin duplicar ni perder | alta | recepción + administrador | P-080 P-086 P-083 P-079 |
| ESC-INV-03 | ESC-INV-03_traspaso_llega_danado_o_de_mas.yaml | Llega dañado o de más | media | recepción + administrador | P-080 P-086 |
| ESC-INV-04 | ESC-INV-04_traspaso_cancelar_borrador_y_enviado.yaml | Cancelar antes de enviar y cancelar ya enviado | alta | recepción + administrador | P-080 |
| ESC-INV-05 | ESC-INV-05_traspaso_casos_borde_captura.yaml | Cantidad 0, negativa, mayor a la existencia, decimal, mismo origen y destino, sin partidas, producto inexistente, partida repetida | alta | recepción | P-080 P-085 P-079 |
| ESC-INV-06 | ESC-INV-06_traspaso_doble_clic_y_reintento_no_duplica.yaml | Doble clic y reintento no duplican; recepción parcial dos veces | alta | recepción | P-080 P-079 |
| ESC-INV-07 | ESC-INV-07_inventario_permisos_por_rol.yaml | Permisos por rol (podólogo, recepción, administrador, almacén) | alta | multirol | P-080 P-084 P-086 P-131 |
| ESC-INV-08 | ESC-INV-08_inventario_aislamiento_sede_y_clinica.yaml | Aislamiento entre clínicas y entre sedes; recepción por otra sede | alta (ejecutar primero) | recepción + admin otra clínica | P-128 P-129 P-080 |
| ESC-INV-09 | ESC-INV-09_catalogo_unico_stock_y_minimo_por_sede.yaml | Un catálogo, stock y mínimo por sede, estados OK/en el mínimo/bajo mínimo/sin existencia | alta | administrador | P-079 P-084 P-129 |
| ESC-INV-10 | ESC-INV-10_sugerir_reposicion_por_sede.yaml | Alertas y sugerencia de reposición hasta el máximo | alta | administrador | P-084 P-079 |
| ESC-INV-11 | ESC-INV-11_traspasar_lo_que_sobra_antes_de_comprar.yaml | Compra centralizada: traspasar el sobrante antes de comprar | media | administrador | P-084 P-080 P-081 P-083 |
| ESC-INV-12 | ESC-INV-12_conservacion_unidades_y_valor_a_costo.yaml | Conservación de unidades y valor a costo promedio, compra durante el tránsito, cuadre kardex contra existencia | alta | administrador | P-083 P-080 P-079 |
| ESC-INV-13 | ESC-INV-13_obsoleto_90_dias_sin_venta_listado.yaml | Obsoleto: 90 días sin venta, dinero parado a costo | media | administrador | P-083 (regla de obsolescencia: ninguna) |
| ESC-INV-14 | ESC-INV-14_obsoleto_salida_promocion_y_traspaso.yaml | Salida del obsoleto: promoción y traspaso | media | administrador | P-080 P-083 |
| ESC-INV-15 | ESC-INV-15_obsoleto_devolucion_a_proveedor.yaml | Salida del obsoleto: devolución a proveedor | media | administrador | P-083 P-081 P-086 |
| ESC-INV-16 | ESC-INV-16_merma_baja_de_lo_que_ya_no_sirve_con_autorizacion.yaml | Merma: captura, autorización, kardex, bitácora, lote caducado | alta | recepción + administrador | P-086 P-083 P-079 |
| ESC-INV-17 | ESC-INV-17_merma_casos_borde.yaml | Merma: 0, negativa, mayor a la existencia, otra sede, doble clic | media | recepción | P-086 P-085 P-128 |
| ESC-INV-18 | ESC-INV-18_conteo_fisico_regulariza_existencia_negativa.yaml | Conteo físico autorizado regulariza existencia negativa | alta | recepción + administrador | P-085 P-086 P-079 |
| ESC-INV-19 | ESC-INV-19_caducidad_proxima_90_dias_y_accion_sugerida.yaml | Lotes por caducar (90 d), acción sugerida, valor en riesgo | media | administrador | P-079 P-083 |

Totales: 19 escenarios, 117 pasos. Complementarios ya existentes: ESC-CAJA-39 (venta sin existencia, P-085) y ESC-CAJA-42/43 (cancelar ticket revierte inventario, P-060).

## 2. Matriz regla a escenario

| Regla | Qué exige (resumen) | Escenarios |
|---|---|---|
| P-079 | Inventario por sede; lote/caducidad solo donde se declara; insumos por consumo en consulta | 01 02 05 06 09 10 12 16 18 19 |
| P-080 | Traspasos: estados Borrador/Enviado/Recibido completo/con diferencias/Cancelado; recibe la sede destino; diferencias como merma o reclamación con motivo; a costo promedio; envío descuenta, recepción suma | 01 02 03 04 05 06 07 08 11 12 14 |
| P-081 | OC mayor a 5,000.00 pide autorización; recepción parcial | 11 15 (parcial: ambiguo A-INV-11) |
| P-083 | Costo promedio ponderado por clínica; mermas y devoluciones al costo del momento | 01 02 12 13 14 15 16 19 |
| P-084 | Mínimo por producto y sede, lo captura Administración; bajo mínimo = existencia < mínimo; en el mínimo = igual; sugerir hasta el máximo | 07 09 10 11 |
| P-085 | Venta sin existencia permitida con marca negativa; Administración regulariza con conteo | 05 (contraste) 17 18 (y ESC-CAJA-39) |
| P-086 | Captura quien tenga permiso de inventario; el ajuste lo autoriza Administración; bitácora | 02 03 07 15 16 17 18 |
| P-128 / P-129 | Aislamiento por clínica; inventario por sede | 08 09 17 |
| P-131 | Rol de apoyo/almacén indefinido | 07 (A-INV-13) |
| M-006 / M-062 / M-064 | Existencia = saldo del kardex; valor = existencia × costo; traspaso a costo, diferencia = enviado − recibido | 01 09 12 13 |
| M-061 / M-065 | Bajo mínimo y sugerencia por mínimos | 09 10 11 |
| M-063 | Próximos a caducar (90 d) | 19 |
| QUÉ NO PUEDE FALLAR (1) privacidad entre clínicas | | 08 (ejecutar primero) |

## 3. Reglas o temas de inventario sin escenario

| Tema | Motivo |
|---|---|
| P-082 Proveedores (catálogo, alta rápida) | No es inventario entre sucursales; vive en el módulo de compras |
| P-087 Plantillas a medida (por encargo, sin inventario, costo del laboratorio) | Solo se menciona; falta escenario propio de plantillas |
| P-081 Orden de compra completa (autorización, factura, cuenta por pagar) | Solo se tocan los bordes que aparecen en ESC-INV-11 y 15; deberá cubrirlo un ESC-COMPRAS |
| Consumo de insumo clínico en consulta (P-079) | Pertenece al módulo clínico; ESC-INV-13 solo pregunta si cuenta como venta (A-INV-21) |
| Obsolescencia por 90 días sin venta | No existe regla de negocio; ESC-INV-13 a 15 quedan en VERIFICAR hasta que A-INV-20 y A-INV-22 se respondan |
| Alerta de traspaso en tránsito vencido | No hay regla (A-INV-05) |
| Rendimiento con miles de partidas o productos | Fuera de alcance de este lote |

## 4. Ambiguos y preguntas para negocio

| Id | Pregunta | Escenarios |
|---|---|---|
| A-INV-01 | Formato del folio del traspaso (mockup `TR-0062` contra esquema `{SEDE}-TRA-{NNNNNN}`) y de qué sede es el consecutivo | 01 |
| A-INV-03 | Dónde se ve la mercancía en tránsito | 01 |
| A-INV-04 | Faltante en recepción: ¿merma o reclamación?, ¿quién absorbe el costo?, ¿qué sede lo lleva en kardex?, ¿plazo para reclamar? (D-41, D-72) | 02 |
| A-INV-05 | Plazo máximo de un traspaso en tránsito antes de alertar | 02 |
| A-INV-06 | Mercancía dañada que sí llegó: ¿entra al destino y se mermea, o nunca entra? | 03 |
| A-INV-07 | Llega de más de lo enviado: ¿se rechaza, ajuste o traspaso inverso? | 03 |
| A-INV-08 | Cancelar un traspaso ya Enviado (D-72): ¿quién y regresa al origen? | 04 |
| A-INV-09 | Cantidad mayor a la existencia en origen: ¿bloquear o permitir negativo? | 05 |
| A-INV-10 | Decimales y partidas repetidas en el mismo traspaso | 05 |
| A-INV-11 | Recepción parcial en dos tandas: ¿se permite en traspasos? | 06 |
| A-INV-12 | ¿Un usuario de recepción puede tener varias sedes? | 07 |
| A-INV-13 | ¿Existe rol de almacén / personal de apoyo con permisos propios? (P-131) | 07 |
| A-INV-14 | Merma o conteo capturado y aún no autorizado: ¿baja la existencia o hasta autorizar? | 07 16 18 |
| A-INV-15 | Visibilidad entre sedes de una misma clínica y quién puede enviar | 08 |
| A-INV-16 | Límites de mínimos y máximos; cuenta de «bajo mínimo» frente a «sin existencia»; permiso del podólogo para ver mínimos | 09 |
| A-INV-17 | «Sugerir»: máximo usado, trato del «en el mínimo», para traspaso o compra | 10 |
| A-INV-18 | ¿Traspasar antes de comprar es regla, apoyo o nada? ¿Cuánto es «lo que sobra»? ¿Compra siempre centralizada? | 11 |
| A-INV-19 | Costo del traspaso: al enviar o al recibir si cambió en tránsito | 12 |
| A-INV-20 | Obsolescencia: umbral (fijo o configurable), ≥ 90 o > 90, por sede o clínica, producto nunca vendido, base de valuación | 13 |
| A-INV-21 | Qué cuenta como venta para dejar de ser obsoleto (consumo en consulta, traspasos, devoluciones; insumos y productos por encargo) | 13 14 |
| A-INV-22 | Promoción como salida del obsoleto; venta bajo costo; la acción sugerida: ¿informa o dispara el flujo? | 14 |
| A-INV-23 | Devolución a proveedor: quién autoriza, costo de crédito, plazo, efecto en cuentas por pagar | 15 |
| A-INV-24 | ¿Hay tolerancia de mermas que no pasen por Administración? (P-086 original) | 16 |
| A-INV-25 | Merma mayor a la existencia: ¿puede dejar negativo? | 17 |
| A-INV-26 | Ventana de caducidad: 90 contra la cifra inconsistente del mockup (M-063); vencidos en el valor en riesgo | 19 |

(A-INV-02 no se usó: queda libre.)

Observaciones de fondo para negocio, no son ambigüedades de un solo paso:
- El esquema ya limita la cantidad recibida a la enviada (no admite «de más») y trata la reclamación como no descontable otra vez; los esperados de ESC-INV-02 y 03 salen de P-080 y P-086, no de esa restricción, y deben confirmarse con A-INV-04, 06 y 07.

## 5. Datos de catálogo y stock a sembrar antes de correrlos

Todos con prefijo `QA-{corrida}-` y en la clínica principal salvo ORG-B. Cada escenario resetea sus existencias al inicio (precondiciones por escenario); esta es la base común.

**Clínica y sedes:** clínica principal con sedes Centenario, Patio Valle de Chalco y una tercera sede de prueba `QA-{corrida}-SEDE-C` (ESC-INV-08). Segunda clínica `QA-{corrida}-ORG-B` con un administrador, un producto y existencias propios.

**Usuarios:** `r@g.com` (recepción, solo Centenario), `m@g.com` (administrador), `p@g.com` (podólogo), `a@g.com` (superadministrador); crear `QA-{corrida}-recep-pvc` (recepción solo PVC), un usuario de recepción solo de la sede C, y el administrador de ORG-B.

**Productos (un solo catálogo):**

| Producto | Costo promedio | Lote/caducidad | Existencia Centenario | Existencia PVC | Mín. CEN / PVC | Máx. CEN / PVC |
|---|---|---|---|---|---|---|
| QA-{corrida}-CREMA | 100.00 | no | 20 | 2 | 5 / 6 | 30 / 20 |
| QA-{corrida}-TALCO | 50.00 | no | 10 | 1 | 4 / 3 | 12 / 10 |
| QA-{corrida}-ANTIMICOTICO | 62.00 | sí | 5 (lote vigente) | 1 | 3 / 6 | 10 / 12 |
| QA-{corrida}-ORTESIS | 200.00 | no | 3 | 0 | 0 / 0 | sin máximo |
| QA-{corrida}-NOEXISTE | no se crea (ESC-INV-05, 17) | | | | | |

**Proveedor:** `QA-{corrida}-PROV` y una orden de compra recibida de TALCO (ESC-INV-15) y de CREMA a 130.00 por 10 piezas disponible para registrar durante el tránsito (ESC-INV-12).

**Historia de ventas relativa al día de la corrida** (ESC-INV-13 y 14, movimientos tipo venta en kardex): CREMA última venta hace 10 días; TALCO hace 91 días (PVC con ventas recientes); ANTIMICOTICO hace exactamente 90 días; ORTESIS sin ventas y recibida hace 120 días.

**Lotes de ANTIMICOTICO** (ESC-INV-16 y 19): L1 caduca en 30 días (4); L2 en 90 (3); L3 en 98 (2); L4 vencido ayer (1); LOTE-QA-1 caducado ayer (4) para la merma.

**Estados de partida por escenario:** traspasos en Borrador / Enviado listos con comentario `QA-{corrida}-ESC-INV-NN` (ESC-INV-02, 03, 04, 06, 08, 12); existencia de CREMA en Centenario −1 con marca negativa (ESC-INV-18); una merma pendiente y un conteo capturado (ESC-INV-07).

Nota técnica: las consultas usan `piefirme.traspasos.comentarios`, `mermas.motivo` y `conteos_fisicos.nota` para ubicar los datos de la corrida; los nombres salen de las migraciones 040 y 041 y las vistas `prp_inventario`, `prp_kardex`, `prp_lotes`, `prp_mermas`, `prp_traspasos`.
