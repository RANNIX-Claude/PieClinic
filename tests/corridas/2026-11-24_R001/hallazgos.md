# Hallazgos corrida R001 - Caja (2026-11-24, V_261124_1843)

Evidencias: capturas en `C:\Users\asus\.claude\projects\C--Users-asus-OneDrive-work-PieClinic\1a097814-e8f1-411c-81da-65d3a9658f0a\tool-results\` (nombres en `bitacora.jsonl`). Sin acceso a BD: ningun hallazgo tiene consulta SQL.

### QA-R001-H01 - IVA incluido en $0.00 en venta de producto
- Escenario / paso: ESC-CAJA-02 / P03
- Clasificacion: BUG (provisional; depende de si el producto esta marcado exento) · Severidad: Critica (calculo de monto/IVA)
- Reproduccion: buscar "crema", agregar Crema para masaje (PC0011, $400), cantidad 2. Subtotal $800.00, TOTAL $800.00, pero IVA incluido = $0.00. Esperado por P-056/P-057: productos al 16 % con IVA incluido => IVA = 800 - 800/1.16 = $110.34 (base $689.66).
- Evidencia: mcp-claude-in-chrome-blob-1795570033192-gml8q8.jpg
- Causa raiz: no determinada (el tester no lee codigo). Hipotesis a validar por analista: producto sin atributo IVA, o resumen que no calcula IVA de productos.
- Correccion propuesta: _la propone el analista_
- Prueba de regresion propuesta: caso con producto 16 % y cantidad 2 comparando IVA a mano
- Decision: _pendiente_ · Aprobo: _ · Fecha: _
- Estado: Abierto. VERIFICAR en BD: iva por linea en `venta_lineas`.

### QA-R001-H02 - Cobro con tarjeta sin autorizacion/voucher
- Escenario / paso: ESC-CAJA-03 / P02, P03
- Clasificacion: BUG · Severidad: Alta (regla incumplida: "el pago pide el voucher")
- Reproduccion: venta de Quiropodia, boton Tarjeta (terminal), dejar Autorizacion y Ultimos 4 vacios, Cobrar sin ticket => CEN-TKT-000002 cobrada $400.00.
- Evidencia: ...1795570196550-6fo9bi.jpg, ...1795570206762-doszmk.jpg
- Causa raiz: _pendiente_ · Correccion propuesta: _pendiente_
- Prueba de regresion propuesta: intentar cobrar tarjeta sin referencia debe bloquear
- Decision: _pendiente_ (negocio: ¿la referencia es obligatoria?) · Estado: Abierto. VERIFICAR en BD `pagos.referencia` de tickets 2 y 3.

### QA-R001-H03 - Servicio con caracteristicas sin control en Caja
- Escenario / paso: ESC-CAJA-04 / P02, P03
- Clasificacion: BUG (funcionalidad ausente; el analista puede reclasificar a GAP si es otra etapa) · Severidad: Alta
- Reproduccion: agregar Plantilla ortopedica especial (SRV-000011, $1,500). La linea muestra cantidad, precio (editable), tipo precio "fijo", descuento; no hay forma de elegir molde de yeso ni mayor altura 3 mm. No se obtuvo descripcion transcrita ni precio 1,500 + 1,500.
- Evidencia: ...1795570225453-eetvy6.jpg, ...1795570232657-jtx7cw.jpg
- Estado: Abierto.

### QA-R001-H04 - Descuento de 15 % aceptado sin PIN
- Escenario / paso: ESC-CAJA-06 / P03
- Clasificacion: DISCREPANCIA_NEGOCIO (la sesion es Administrador/Superadmin, que quiza no requiere PIN) · Severidad: n/a
- Reproduccion: Crema 400, descuento global 15 % motivo Promocion, efectivo 340, Cobrar sin ticket => CEN-TKT-000005 $340.00 (descuento $60.00) sin pedir PIN. Como no hubo PIN, no se pudo "cancelar"; la venta quedo creada.
- Evidencia: ...1795570622398-eley97.jpg, ...1795570625799-dp8l7u.jpg
- Pendiente: repetir con cuenta de Recepcion (r@g.com) y verificar `autorizaciones`.
- Decision: _pendiente_ · Estado: Abierto

### QA-R001-H05 - Cantidad negativa produce resumen incoherente; cantidad 0 aceptada
- Escenario / paso: Validaciones negativas / N04, N05
- Clasificacion: BUG · Severidad: Media (monto mostrado incorrecto; el cobro SI se bloquea con "Revisa las cantidades")
- Reproduccion: con cantidad -1 el resumen muestra Subtotal -$400.00, Descuentos "--$400.00", TOTAL $0.00. Cantidad 0 se acepta y deja importe $0.00 (no se intento cobrar).
- Evidencia: ...1795570651714-7xnoe9.jpg, ...1795570651715-f6l1tm.jpg, ...1795570661944-inug48.jpg
- Estado: Abierto

### QA-R001-H06 - El ticket solo sale por el dialogo nativo de impresion; congela la automatizacion
- Escenario / paso: ESC-CAJA-02 P05; Impresion I03; ESC-CAJA-07
- Clasificacion: UX_MENOR (no hay vista previa del ticket en pantalla tras "Cobrar e imprimir ticket" que se pudiera observar) + limitacion de herramienta
- Reproduccion: "Cobrar e imprimir ticket" y "Reimprimir (copia)" dejaron la pestana sin responder (screenshot/get_page_text con timeout, Escape sin efecto, navegar en la misma pestana no recupera). Pestanas 1595698778 y 1595698784 siguen bloqueadas por dialogo de impresion; requieren cierre manual. Con "Cobrar sin ticket" la pantalla post-cobro ofrece "Imprimir ticket" y no hay dialogo.
- Impacto: no se vio contenido del ticket (folio, fecha, sucursal, cajero, conceptos, totales, IVA, forma de pago, logo, QR) ni la marca "copia" (P-060). Esos pasos quedan NO EJECUTABLE, no CUMPLE.
- Nota: seria FALSO_POSITIVO_HERRAMIENTA solo para la parte de "no se pudo cerrar el dialogo"; el contenido sigue por verificar con una prueba que renderice el ticket sin dialogo nativo (p. ej. emular print en Playwright o PDF).
- Estado: Abierto

### QA-R001-H07 - ESC-CAJA-07 (ticket completo y solicitud de factura)
- Clasificacion: GAP_CATALOGO / DISCREPANCIA_NEGOCIO a definir: el archivo anota "se espera que falte (etapa 1)". Existe boton "Facturar" por ticket; no se pulso ni se vio el ticket. No se confirma ni se descarta la falta.
- Estado: Abierto, sin evidencia.

### QA-R001-H08 - Recarga lenta
- Clasificacion: UX_MENOR
- Detalle: tras navegar a /app/caja?tab=tickets la app mostro "Iniciando Pie Firme..." y luego "Cargando..." unos 15 s antes de pintar el modulo.
- Estado: Abierto

### Observaciones sin hallazgo formal (para analista)
- El precio unitario de una linea "fijo" se muestra como campo editable; no se probo cambiarlo (¿requiere permiso/PIN?).
- Primer intento de cobro sin pagos (saldo 800): venta no creada, pero el mensaje no se capturo a tiempo.
- Persistencia tras recarga: la lista del dia refleja las 5 ventas y Vendido $2,720.00 = suma; es proxy de UI, VERIFICAR en BD.
- No se capturaron errores de consola/red: no hay afirmacion sobre ausencia de 4xx/5xx.
