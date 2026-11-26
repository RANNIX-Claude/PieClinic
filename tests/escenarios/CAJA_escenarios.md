# Módulo de caja · escenarios de prueba (Pie Clinic)

Metodología: `docs/METODOLOGIA_QA.md` (sin evidencia no hay CUMPLE · quien prueba no lee código · no se corrige durante la corrida · negocio decide discrepancias).
Ambiente: https://pieclinic.netlify.app/app/caja · Cuentas de prueba (clave 123456): r@g.com recepción, s@g.com supervisor, m@g.com administrador, p@g.com podólogo.

## Datos de arranque que la caja necesita (catálogos)

| Catálogo | Estado | Nota |
|---|---|---|
| Sucursales (Centenario, Patio Valle de Chalco) | ✅ | direcciones de Patio Valle de Chalco por confirmar |
| Productos (2,880) y sus precios de lista 1 | ✅ | 2,513 precios sugeridos por revisar |
| **Servicios** | ✅ agregado 24-nov (12) | **precios de arranque POR CONFIRMAR con los dueños** |
| Servicios que admiten características (plantilla y zapato a medida) | ✅ agregado (2) | |
| **Características** (21) | ✅ sembradas 24-nov | |
| **Listas de precio** (4) y departamentos (4) | ✅ sembradas 24-nov | tipos de cliente de las listas 2–4 sin definir |
| Turno de caja abierto | ✅ | Caja 1 Centenario |
| Pacientes | ❌ 0 | la venta de mostrador no debería exigirlos: se prueba (ESC-CAJA-02) |
| Inventario por sucursal | ❌ 0 | falta el conteo inicial (migración 078, en construcción) |
| Terminal de tarjeta / cuentas bancarias | ❌ 0 | tarjeta se registra con voucher; sin terminal |

## Escenarios

| ID | Rol | Qué se prueba | Resultado esperado | Verificación en base |
|---|---|---|---|---|
| ESC-CAJA-01 | recepción | Entrar a Caja con turno abierto | Se ve el turno, la sucursal y el cajero | `turnos_caja` abierto |
| ESC-CAJA-02 | recepción | Venta de mostrador sin paciente: 1 producto del catálogo, efectivo | Cobra, folio de venta, ticket | `ventas` + `pagos` + `venta_lineas`; movimiento de inventario |
| ESC-CAJA-03 | recepción | Venta con servicio de precio fijo (Quiropodia) y pago con tarjeta | El pago pide el voucher; se guarda | `pagos.metodo`, referencia |
| ESC-CAJA-04 | recepción | Servicio con características (Plantilla ortopédica especial: molde de yeso + mayor altura 3 mm) | Descripción transcrita y precio sumado (1,500 + 1,500) | `venta_lineas.descripcion/precio_unitario` y `venta_linea_caracteristicas` |
| ESC-CAJA-05 | recepción | Cobro con PIN personal | Queda quién cobró | `ventas.vendedor_id` / firma |
| ESC-CAJA-06 | recepción | Descuento y devolución | Piden autorización de los dueños | `autorizaciones` |
| ESC-CAJA-07 | recepción | Ticket completo (logo, datos de la sucursal, QR) y solicitud de factura | Ticket completo; solicitud a oficina central | — (se espera que falte: etapa 1) |
| ESC-CAJA-08 | recepción | Cierre del turno con efectivo contado | Diferencia calculada y justificada | `turnos_caja`, `cortes_caja` |
| ESC-CAJA-09 | podólogo | Entrar a Caja | Sin acceso (o solo lo que tenga habilitado) | — |
| ESC-CAJA-10 | supervisor | Ver ventas y cortes de su sucursal | Solo lectura | RLS |
| ESC-CAJA-11 | recepción | Control y Auditoría E1 · el precio de un producto de catálogo no se edita (ni por la API) y la línea guarda el precio vigente | Con precio distinto: rechazado `precio_no_editable`; con el de catálogo: cobra y queda `precio_catalogo` | `venta_lineas.precio_catalogo`; `v_ctl_ventas.precio_catalogo_al_momento` (`scripts/test-auditoria-caja-qa.mjs`) |
| ESC-CAJA-12 | recepción + supervisor | Con `descuento_motivo_cerrado = 1`: descuento de 5 % sobre el tope sin clave (0 %) | Pide motivo del catálogo y clave de un supervisor; queda usuario, motivo, autorizador y monto | `venta_lineas.descuento_usuario_id / descuento_motivo_id / descuento_autorizado_por` |
| ESC-CAJA-13 | recepción + supervisor | Con `cancelacion_con_bloqueo = 1`: cancelar un ticket con pieza sin escanearla, con otro código y con la pieza + foto en vivo + clave + motivo | Sin pieza o con otro código: rechazado y la pieza NO vuelve; con todo: cancelada, pieza vuelve, alerta al dueño; a los 60 s sin respuesta: `pendiente_de_validacion` | `ctl_cancelacion`, `movimientos_inventario` (`devolucion_cliente`), `ctl_alerta` |
| ESC-CAJA-14 | recepción | «Abrir cajón (sin venta)» con motivo opcional | Queda usuario, caja, hora del servidor y motivo | `ctl_apertura_cajon`, evento `cajon_abierto_sin_venta` |

Un paso solo es CUMPLE con captura y consulta a la base. Lo que falte se anota como hallazgo; no se corrige durante la corrida.
