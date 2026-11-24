# MINUTA DE REUNIÓN — Pie Clinic / Pie Firme

| | |
|---|---|
| **Asunto** | Levantamiento de requerimientos y demostración de "Pie Firme" para reemplazar SICAR y los controles manuales |
| **Fecha** | Por confirmar (noviembre 2026) |
| **Lugar** | Sucursal Pie Clinic Centenario (matriz/CEDIS), Av. Centenario 358, Col. Merced Gómez, Álvaro Obregón, C.P. 01600, CDMX, Local A2 |
| **Por Pie Clinic** | Vanesa Leyva, dueña/directora operativa (proveedores, pacientes, operación); Alejandro Hernández, dueño/administrativo (facturación, SICAR, catálogos) |
| **Por Pie Firme** | Roberto Aguilar (asesor principal); Francisco (asesor) |
| **Fuente** | Grabación de audio, 6 partes, transcrita con Gemini. Las partes están desordenadas en el archivo (3, 4, 5, 6, 1, 2). Esta minuta las ordena por tema |

---

## 1. Resumen ejecutivo

Pie Clinic tiene 11 años y opera con matriz/CEDIS en Centenario y sucursales como Patio Valle de Chalco y Sendero, con tres departamentos: Podología, Ortopedia y Productos. Hoy usa SICAR (punto de venta con licencia atada a una PC), Excel, WhatsApp y fotos para controlar caja, inventario y traspasos. Los dueños estiman fugas de unos **$70,000 al mes**.

Se presentó el demo de Pie Firme. Los dueños dijeron que si el sistema los convence "sin problemas lo vamos a contratar". Se acordó un **piloto de 30 días en paralelo** en Centenario y Patio Valle de Chalco, con arranque en diciembre. El modelo comercial **quedó sin cerrar** (ver sección 6).

---

## 2. Situación actual y problemas detectados

### 2.1 Fugas y fraude en caja
- Cobran en efectivo un servicio y reportan que el paciente "no vino".
- Reportan como pagadas con tarjeta ventas que fueron en efectivo. Lo detectan horas después con el reporte de Clip.
- Borran dígitos de la etiqueta de precio: cobran $1,400 y reportan $400.
- Notas foliadas que se "pierden" y reaparecen meses después, descuadrando el consecutivo (caso de una bota Walker de $3,000).
- Reutilizan la copia de notas que el cliente rechazó para cubrir otras ventas.
- Compran notas de remisión informales para vender sin control.
- Cuando hay día en cero, revisan cámaras a mano.

### 2.2 Agenda y expedientes
- Se altera o se borra la agenda. La agenda se manda por la noche y aparecen citas con el mismo teléfono repetido.
- Desaparecen expedientes de pacientes frecuentes y se pierde la base de pacientes cuando alguien renuncia.

### 2.3 Traspasos e inventario
- Cajas que llegan vacías, o con tubos o piedras para igualar el peso.
- Hoy el control es por fotos y firmas por WhatsApp, sin confirmación de recepción en sistema.
- Las encargadas niegan haber recibido, o piden producto que su inventario dice que tienen.
- No manejan inventario en sucursal para zapatos y plantillas: se piden bajo pedido.
- Seguimiento deficiente a proveedores (cajas dobladas, descuentos en factura sin aviso).

### 2.4 SICAR y procesos manuales
- Licencia atada al ID de la máquina; no se puede consultar desde laptop o celular. Cobran licencias adicionales y póliza de soporte anual.
- Alejandro no puede ver en SICAR quién debe qué (anticipos y saldos pendientes).
- Reportes diarios por Excel por correo, consolidados a mano.
- Cada cambio de precio de proveedor se actualiza a mano, sucursal por sucursal.

### 2.5 Catálogo y etiquetado
- Línea propia (formulada por su químico), zapatos y plantillas **no tienen código de barras**.
- Los precios van en la etiqueta física.
- Alejandro tiene impresora de etiquetas y pistola lectora. En la junta se comprobó que la **pistola sí lee los códigos impresos**; fallaba porque los productos no estaban dados de alta en el catálogo.

---

## 3. Requerimientos

### 3.1 Control y seguridad
1. Los datos del paciente nuevo y su cita **no se pueden borrar ni alterar** una vez capturados.
2. Pantalla secundaria en caja para que el paciente vea el cobro en tiempo real.
3. Corte de caja al cierre y conciliación de terminales (Clip).
4. Arqueos aleatorios de inventario con evidencia fotográfica.
5. Notas físicas foliadas **solo como contingencia** (sin luz o sin internet): se capturan después, se asocian al folio y se escanean. Se entregan en blocs por sucursal, como chequeras (ejemplo: 50 notas, folios 1,500 a 1,550).

### 3.2 Traspasos y compras
6. Traspaso completo: salida de Centenario, entrega y recepción en sucursal, con registro en ambos lados.
7. La encargada **da entrada** a lo que llega. Eso la responsabiliza de su venta.
8. Requisición de compra formal en lugar del chat de WhatsApp. El proveedor surte primero en Centenario y de ahí se dispersa.
9. Alejandro paga al proveedor solo lo que consta en requisiciones registradas.

### 3.3 Catálogo y precios
10. Catálogo único en la nube; un cambio de precio se refleja en todas las sucursales.
11. Reglas de margen automáticas: al subir el costo se recalcula el precio de venta. Historial de costos y precios.
12. Generación de códigos de barras propios y etiquetas con precio ligado al código.
13. Catálogo de servicios con un clic (consulta, extracción de uña, retiro de gelish, oclusión, pedigrafía, test postural, podoscopio, reflexoterapia).
14. Tres departamentos: Podología, Ortopedia, Productos.
15. Calzado y plantillas por **rangos de talla** con un solo costo (ej. del 12 al 14), sin crear un renglón por color o modelo; el detalle va en la descripción.

### 3.4 Productos especiales y prótesis
16. Concepto abierto "Plantilla especial" con precio movible y **complementos** seleccionables que suman al precio: almas (1 a 6), virón, cuña, botón, descarga, molde y vaciado (~$1,500 si no tiene dedos), centímetros de disimetría (~$450 c/u), materiales (pelite, piel).
17. Los productos especiales se **cobran en una sola exhibición**.
18. Las prótesis ($75,000 a $400,000) las cotizan los dueños desde su usuario administrador.
19. Fajas, corsets y otras piezas **hechas a la medida**: producto especial con descripción y monto.

### 3.5 Anticipos y crédito
20. Zapatos y plantillas se venden con **anticipo (50% o más)**. Se entregan a los 5 o 6 días y se liquida.
21. Nota de anticipo con botón **Liquidar** al entregar. Debe mostrar quién pagó, cuánto y cuánto falta.
22. Crédito/cuentas por cobrar por paciente y por encargada (ej. 3 pares de zapatos por $15,000 en dos pagos), con saldo visible.

### 3.6 Facturación
23. La facturación se mantiene **centralizada** (la hace Alejandro), sin autofactura abierta, porque los clientes piden factura además de promociones y descuentos.
24. Factura con concepto base ("Plantilla especial") y el desglose de adaptaciones en la descripción, sin alterar la clave del SAT ni afectar trámites de seguros.

### 3.7 Operación, tablero y acceso
25. Tablero en tiempo real, en computadora, tablet y celular: ventas por sucursal, línea, marca, podólogo; producto estrella; sugerido de resurtido.
26. Modo offline: el punto de venta trabaja en local y sincroniza al regresar el internet.
27. Expediente clínico con fotos y evolución; agenda por sucursal y podólogo.
28. Módulo opcional de personal: registro de entrada, salida y comida con GPS, para personal que rota entre sucursales y el que trabaja en calle.
29. Interfaz simple. La dueña quiere dominarla por completo y capacitar ella misma al equipo.
30. Contador de personas (sensor LoRaWAN, sin imágenes): interés expresado, fuera del alcance inicial.

---

## 4. Demostración

Roberto mostró el demo "Pie Clinic": tablero del dueño por sucursal, pacientes, almacén, compras, envíos a sucursales, consulta por paciente, capacitaciones (videos y tutoriales), tienda en línea, precios, auditoría de inventario, ingresos por línea y marca, tabla de pacientes y productividad por podólogo, vista mensual con autorización de ajustes, facturación, expediente con fotos, proveedores y módulo de personal.

---

## 5. Propuesta económica (Pie Firme)

- **Arranque: $30,000 MXN.** Cubre instalación, configuración, carga inicial de catálogos e inventario y capacitación a dueños y personal.
- **Licencia: $400 MXN mensuales por sucursal.** Nube en AWS. Incluye punto de venta y expediente clínico.
- La licencia es por **número de sucursales**.

---

## 6. Acuerdos y puntos abiertos

### 6.1 Acuerdos
1. **Piloto de 30 días en paralelo** en **Centenario** (matriz/CEDIS) y **Patio Valle de Chalco**, con arranque en diciembre. La dueña prefiere empezar con Centenario porque de ahí sale el producto.
2. Roberto montará la instancia con los datos reales y adaptará el sistema. **Quitará módulos** para que arranquen con lo esencial y ofrecerá el resto después.
3. Migración con plantilla Excel de SICAR y OCR para listas impresas.
4. El nombre comercial pasa a **"Pie Clinic Ortopodólogos"** por riesgo de rechazo del IMPI frente a "Piel Clinic" (Querétaro). Los dueños mandarán el ajuste a sus diseñadores.

### 6.2 Puntos abiertos (sin resolver en la grabación)
| Tema | Qué se dijo | Estado |
|---|---|---|
| Modelo de pago | La dueña **rechaza rentas mensuales** y quiere pago único ("necesito que sea mío"). Roberto respondió que se puede hacer cobro único. Más adelante se propuso **3 pagos de $10,000** (meses 1, 2 y 3) en lugar del 60% de anticipo, y Roberto aceptó. | **Por definir**: ¿$30,000 en tres pagos y qué pasa con la licencia mensual? |
| Precio | La dueña considera caros los $30,000 más licencia, por un compromiso con una plaza comercial. | Pendiente de propuesta formal |
| Fecha exacta del arranque y de los dueños | La dueña habla de "finales de diciembre" por aguinaldos. | Por confirmar |
| Soporte y propiedad del sistema | Se contrastó con SICAR (licencia y póliza). | Por aclarar en la propuesta |

---

## 7. Pendientes

| Responsable | Pendiente |
|---|---|
| **Roberto** | Enviar lista de requerimientos y resumen de acuerdos |
| **Roberto** | Enviar guía y plan de pruebas del piloto con cronograma |
| **Roberto** | Crear grupo de WhatsApp de coordinación |
| **Roberto** | Presentar propuesta económica clara (pago, soporte, propiedad) |
| **Alejandro** | Enviar el Excel de catálogos (90% armado: clave, descripción, producto/servicio, costo, 4 precios sugeridos). Faltan existencias y precios de venta |
| **Alejandro** | Foto de la impresora de etiquetas |
| **Dueños** | Conteo de inventario físico de Centenario |
| **Dueña** | Pedir a la encargada de Patio Valle de Chalco la base de clientes en Excel |
| **Dueños** | Listado de podólogos y personal de ambas sedes del piloto |
| **Dueños** | Catálogo completo de servicios y de complementos con precio |
| **Dueños** | Ajuste de identidad a "Pie Clinic Ortopodólogos" y trámite ante el IMPI |

---

## 8. Datos de Centenario (matriz)

Sucursal Pie Clinic Centenario, Av. Centenario 358, Col. Merced Gómez, Álvaro Obregón, C.P. 01600, CDMX. Local A2, a un costado del OXXO. Horario de atención: 10:00 a 19:00.

---

*Nota: elaborada a partir de una transcripción automática (Gemini) con partes de baja inteligibilidad. Nombres, cifras y la ubicación de algunas frases deben validarse con los asistentes.*
