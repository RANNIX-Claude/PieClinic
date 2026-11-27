# Pedidos especiales (zapatos, plantillas y aditamentos a nombre de un cliente)

Diseño acordado con el dueño: [`pedidos_especiales_diagrama.html`](pedidos_especiales_diagrama.html). Migraciones **320–324** (solo QA; producción pendiente de confirmación del dueño).
Pantalla **Pedidos** (`/pedidos`, grupo INVENTARIO del menú), pestaña **Pedidos** en Caja, pestaña **Pedidos** en la historia del cliente y pestañas
**Pedidos especiales / Facturas recibidas / Pagos realizados** en el expediente del proveedor.

## Decisión de diseño: el pedido NO duplica compras

El pedido es la capa de **seguimiento al cliente**; el dinero y el inventario siguen en lo que ya existía:

| Paso del diagrama | Qué reutiliza | Qué agrega el pedido |
|---|---|---|
| Orden al proveedor | `ordenes_compra` + `oc_lineas` (la misma de Compras; con folio `OC`, autorización del dueño y condiciones de pago del proveedor) | La orden **nace al autorizar el propietario** (en borrador, ya autorizada) y pasa a «enviada» al enviar la petición. Se ve en Compras como cualquier otra. |
| Recibido | `recepcion_registrar` (recepción de mercancía → `movimientos_inventario` por sucursal; la orden pasa a «recibida») | Quién marca «recibido» (usuario, fecha y hora) y la liga pedido ↔ recepción. |
| Cuenta por pagar | `cuentas_por_pagar` (trigger `c_recepcion_cxp` si se captura factura) | Si no hay factura al recibir, la cuenta **se abre igual**: importe de la orden, vencimiento = fecha + días de crédito del proveedor, `folio_factura` vacío («pendiente de factura»). |
| Anticipo | `anticipos` (misma tabla de citas y plantillas; trigger → `ingresos`) | Columna `pedido_especial_id` y `turno_id`; un anticipo por pedido, cobrado de una vez por nota. |
| Saldo | `cuentas_por_cobrar` (con `fecha_limite` = plazo del saldo) | Se abre al cobrar el anticipo y se cierra al entregar. |
| Entrega | Ticket normal de `ventas` cobrado con `cobrar_venta` (folio del ticket parametrizable por sucursal, sin asumir su formato) | El anticipo entra al ticket como pago `anticipo`; el ticket usa el patrón del **producto especial con características** (servicio `a_valorar` con `admite_caracteristicas` + `venta_linea_caracteristicas`). |

### Producto especial e inventario («recibido para cliente»)
Cada tipo (zapato, plantilla, aditamento, otro) usa dos catálogos genéricos creados la primera vez (`piefirme_app.pedido_item_base`):
un **producto «por encargo»** (`PEDESP-*`, solo para la compra al proveedor) y un **servicio especial con características** (para el ticket). Al recibir, la pieza **entra al
inventario de la sucursal** como ese producto por encargo (queda *reservada para el cliente*: no es un producto vendible por sí mismo) y **sale al entregar** con un
movimiento de venta ligado al pedido; entre ambos eventos el inventario general no cambia de dueño. El costo real solo lo ve administración.
Alternativa descartada: no sumarla a inventario (rompería la trazabilidad de la recepción y de la CxP).

## Estados y transiciones (validadas en la base, trigger `pedido_bi`)

`solicitado → anticipo_cobrado → autorizado → enviado_proveedor → aceptado → en_transito → recibido → entregado`; `aceptado → recibido` directo (llega sin aviso de tránsito).
`en_espera` (rechazo del propietario en `anticipo_cobrado`, o del proveedor en `enviado_proveedor`, con motivo) → `solicitado` / `anticipo_cobrado` / `cancelado`.
`cancelado` desde cualquier etapa anterior a `recibido`. `entregado` y `cancelado` son finales. Cada cambio queda en `pedido_especial_bitacora`
(**inmutable**: trigger de solo inserción; usuario `auth.uid()` y hora del servidor `clock_timestamp()`), más los recordatorios.

## Dinero
* Anticipo = `round(total × pct / 100, 2)`; `pct` = el del proveedor (`proveedores.anticipo_pct`) o el parámetro de la organización `pedido_anticipo_pct` (50 por omisión). Solo administración puede fijar otro % al solicitar. $2,000 al 50 % → anticipo $1,000, saldo $1,000.
* **Una nota con varios proveedores se separa en un pedido por proveedor** (`pedido_notas` → `pedidos_especiales`), con un solo cobro de anticipo en Caja (se crea un `anticipos` por pedido) y su propia etapa y fecha. La entrega puede ser pedido por pedido.
* **Anticipo en Caja** (`pedido_cobrar_anticipo`): exige turno abierto del cajero en la sucursal. El efectivo entra al corte como movimiento de caja tipo «depósito» (sin modificar la fórmula del corte). El anticipo de un pedido en curso **no se ofrece ni se aplica a otro ticket** (trigger sobre `pagos` + `prp_anticipos.aplicable_en_caja`).
* **Entrega** (`pedido_entregar`): los pagos deben sumar exactamente el saldo; crea el ticket, aplica el anticipo, llama a `cobrar_venta` (misma validación de totales y turno), saca la pieza del inventario y cierra la cuenta por cobrar. El precio del renglón es el del pedido (autorizado por el propietario): se avala con una `autorizaciones_admin` de tipo precio a nombre de quien autorizó el pedido, igual que el precio cotizado de un producto especial. **No se tocó el cobro normal, ni el modo sin internet, ni el folio del ticket**; las ventas sincronizadas offline siguen idempotentes (el pedido nunca pasa por la cola offline: anticipos y entregas exigen conexión y la pestaña lo avisa).

## Roles (RLS por organización, sede y rol; toda escritura por RPC `SECURITY DEFINER` con verificación explícita)
| Acción | administrador | recepción / encargado | podólogo |
|---|---|---|---|
| Solicitar, ver pedidos de su sucursal | sí | sí | sí |
| Cobrar anticipo / entregar y cobrar saldo | sí | sí | no |
| **Autorizar / rechazar** | **solo administrador** (quien solicita no autoriza el pedido de otro; un administrador sí autoriza el que él mismo solicitó: es el propietario) | no | no |
| Enviar, registrar aceptación y envío, recibir | sí | sí | no |
| Cancelar | cualquier etapa previa a «recibido» | solo el que solicitó, y solo en «solicitado» | solo el que solicitó, en «solicitado» |
| Costos estimados | ve y captura | **nunca** | **nunca** |
Los costos viven en `pedido_especial_costos` (tabla aparte, RLS solo administrador y supervisor) y salen enmascarados con `piefirme_app.ve_costos()` en `prp_pedidos_especiales` y `prp_pedido_lineas`. El supervisor tiene lectura por RLS, pero la pantalla no le abre ruta (decisión de menú pendiente).

## Petición al proveedor
`pedido_mensaje()` arma el texto en la base: folio, nota, **cliente solo por iniciales**, sucursal de entrega, fecha requerida, partidas con características y cantidad; **sin precios ni costos**. Se copia (botón «Copiar mensaje») o se «envía» por el adaptador **simulado** (rótulo: *Simulado: se copia al grupo de WhatsApp del proveedor*); lo enviado queda en `pedido_mensajes` (inmutable). El grupo/contacto de WhatsApp es dato del proveedor (`whatsapp_grupo`, `whatsapp_contacto`), junto con `anticipo_pct` y `pedidos_tipos`.
**Recordatorios**: `pedido_recordatorios_generar()` lista los pedidos con fecha vencida (entrega prometida o acordada pasada; saldo vencido en «recibido») y deja constancia a lo más una vez al día; botón «Revisar vencidos» y alerta en la pantalla. No hay planificador.

## Migraciones
320 esquema (tablas, triggers, RLS, columnas nuevas) · 321 RPC · 322 vistas `prp_pedidos_especiales`, `prp_pedido_lineas`, `prp_pedido_bitacora`, `prp_pedido_mensajes` y ampliación de `prp_proveedores` y `prp_anticipos` ·
323 restablece `security_invoker` en las dos vistas ampliadas (`CREATE OR REPLACE VIEW` lo quita) · 324 `pedido_proveedores()` sin filtrar sintéticos. **Producción: aplicar 320–324 juntas y en orden** (sin datos de prueba; el catálogo genérico se crea solo la primera vez).

## Pruebas
`CON_MIGRACIONES=1 node --test scripts/test-pedidos-especiales-qa.mjs` (BD, una transacción que se deshace; con `CON_MIGRACIONES=1` aplica 320–322 dentro de ella) · `node --test src/lib/plataforma/pedidosEspeciales.test.mjs` · navegador: `node tests/corridas/pedidos-especiales/verificar.mjs` (capturas en esa carpeta). NO correr dos suites a la vez (candados compartidos).

## Decisiones pendientes del dueño
1. **Política por omisión del anticipo cuando el pedido se rechaza**: hoy el usuario elige al rechazar (devolver o dejar como saldo a favor), queda auditado; no hay valor por omisión.
2. Si el efectivo del anticipo debe entrar al corte como «depósito» (hoy sí) o como un renglón propio del corte.
3. ¿El supervisor debe tener la pantalla Pedidos en solo lectura? (por RLS ya puede leer).
4. ¿Quién es «propietario» además del rol administrador? Hoy: todo administrador autoriza; no hay segundo nivel.
5. Reembolso del anticipo devuelto: hoy es manual (registrar reembolso entregado); sin movimiento de caja automático.
6. Devolución al proveedor de una pieza recibida (pedido «recibido» que ya no se entrega): fuera de alcance, usa Compras → Devoluciones.

## No verificado / límites
Alta de producción, impresión del comprobante del anticipo, planificador de recordatorios, envío real por WhatsApp (adaptador simulado) y la fórmula del corte con anticipos en efectivo contra un cierre real de turno.
