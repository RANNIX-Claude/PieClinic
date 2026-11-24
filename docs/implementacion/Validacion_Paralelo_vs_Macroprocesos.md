# Validación: proceso del paralelo vs. macroprocesos de PODIX

**Qué se compara**
- **Macroprocesos**: los 19 de `REQUERIMIENTO.md` de la carpeta `podologia` (mismos que usa la propuesta, diapositiva s05). No encontré un archivo con el nombre "PODIX_Macroprocesos clínica podología"; tomé este por ser la fuente.
- **Proceso**: [Plan_Operacion_Paralela_Diciembre.md](Plan_Operacion_Paralela_Diciembre.md), más lo dicho en la junta con Vanesa y Alejandro.

**Leyenda**: ✅ cubierto · ⚠️ cubierto en parte o con diferencia · ❌ falta en el plan · ➖ no entra al piloto (decisión)

## 1. Macroproceso por macroproceso

| # | Macroproceso | Lo que dice PODIX | Lo que salió en la junta | En el plan del paralelo | Estado |
|---|---|---|---|---|---|
| 1 | Captación | Prospectos, campañas, convenios, encuestas | No se habló | No incluido | ➖ |
| 2 | Agenda y citas | Agenda multi-sucursal, recordatorios, no-shows | Citas que se borran; agenda con teléfonos repetidos | Recepción: agenda y alta sin borrado | ✅ |
| 3 | Recepción y admisión | Alta única, consentimientos, sala de espera | Teléfono obligatorio y sin borrado al capturar | Recepción: alta y sala de espera. Falta consentimiento/aviso de privacidad | ⚠️ |
| 4 | Atención clínica | Expediente único, evolución, fotos | Seguimiento de pacientes, fotos de evolución, expedientes que se roban | Podólogo: consulta, fotos, historial con bitácora | ✅ |
| 5 | Procedimientos | Catálogo de procedimientos con insumos | Servicios: consulta, uña, gelish, oclusión, pedigrafía, test postural, podoscopio, reflexoterapia | Catálogo de servicios con un clic | ⚠️ Falta definir consumo de insumos |
| 6 | Esterilización | Bitácora de autoclave y set por paciente | No se habló | **No incluido** | ❌ |
| 7 | Ortesis y plantillas (laboratorio externo) | Orden al laboratorio, recepción, retrabajos, garantía | Plantillas/zapatos con proveedor o zapatero, entrega los jueves, anticipo, complementos | Orden al proveedor y complementos | ⚠️ Ver 2.1 |
| 8 | Compras | Requisición con aprobación, orden, recepción, PEPS, CxP | Chat de WhatsApp como requisición; solo se paga lo pedido por chat | Requisición y alta en Centenario | ⚠️ Ver 2.4 |
| 9 | Almacén e inventarios | Existencias por sucursal, traspasos, kardex, mínimos | Control de traspasos, cajas vacías; **sin inventario en sucursal** de zapatos y plantillas | Almacén: recibir, traspasos, conteo | ⚠️ Ver 2.2 |
| 10 | Inventario físico | Cíclico y general, conteo a ciegas, desde celular | Conteo de Centenario; arqueos aleatorios con foto | Conteo y auditoría con foto | ✅ |
| 11 | Ventas y POS | Precio base y ajuste, descuentos, devoluciones, venta cruzada, comisiones | Precio ligado al código, plantilla especial, complementos, pantalla al cliente | Cajero: cobro, complementos, devoluciones | ⚠️ Ver 2.3 |
| 12 | Apartados | Anticipo mínimo 20%, vigencia 10 días | Anticipo **50%**, entrega a los 5 o 6 días, liquidar | Anticipo con Liquidar | ⚠️ Ver 2.1 |
| 13 | Crédito y plazos | Límite, plan de pagos, interés y recargo | Dos pagos, saldo por paciente y encargada; **no se habló de interés ni mora** | Crédito y abonos | ⚠️ Ver 2.1 |
| 14 | Caja y turnos | Apertura, cambio de turno, corte, conciliación de terminales | Corte cada 2 horas con fotos, Clip, cierre con billetes acomodados | Turno, corte y comparación con Clip | ✅ |
| 15 | Facturación y finanzas | CFDI 4.0, CxC, CxP, rentabilidad | Factura centralizada por Alejandro con sistema aparte; sin autofactura | Facturación centralizada | ⚠️ Ver 2.5 |
| 16 | Seguimiento y fidelización | Recontacto, lealtad | No se habló | No incluido | ➖ |
| 17 | Recursos humanos | Rotación, asistencia, nómina | Personal que rota entre sucursales; reloj checador **opcional** | Fuera del piloto | ➖ |
| 18 | Cumplimiento y calidad | NOM-004/024, RPBI, privacidad, 5 años | Visitas de Protección Civil y Ambiental (mencionadas de paso) | No incluido | ❌ |
| 19 | Dirección y análisis | Tableros por sucursal y consolidado | Tablero por tablet/celular; producto estrella; sugerido de resurtido | Vista dueños y sucursal | ✅ |

**Resumen**: 5 cubiertos (2, 4, 10, 14, 19), 9 cubiertos en parte o con diferencia (3, 5, 7, 8, 9, 11, 12, 13, 15), 2 faltan en el plan (6 y 18) y 3 quedan fuera del piloto por decisión (1, 16 y 17).

## 2. Diferencias que hay que resolver

### 2.1 Los parámetros de PODIX no coinciden con lo dicho en la junta
| Tema | PODIX (REQUERIMIENTO) | Junta |
|---|---|---|
| Anticipo | Mínimo 20% | 50% como regla; "te dejo 700 de 1,000" cuando el cliente decide |
| Entrega | Apartado de 10 días | Pedido al proveedor, entrega en 5 o 6 días |
| Pago de productos especiales | Liquidación en una o varias entregas | La dueña pidió **una sola exhibición**; Alejandro dijo que los zapatos son con anticipo. **Se contradicen** |
| Crédito | Interés mensual y recargo, 10 días de gracia | Dos pagos y saldo por cobrar; nadie mencionó interés |
| Anticipo vencido | Se pierde | No se habló |

Los parámetros del requerimiento se marcaron como confirmados, pero ese documento lo dictó Roberto, y la propia ampliación V2 dice que **no hubo sesión con el cliente**. La junta es la primera vez que hablan los dueños, así que **hay que revalidar estos valores con ellos**.

### 2.2 Inventario: PODIX supone existencias en cada sucursal
Alejandro dijo que **no maneja inventario en sucursales** de zapatos y plantillas: se piden bajo pedido y la encargada da la entrada. Eso ya existe en PODIX, pero como pedido a proveedor. Hay que definir qué es stock (productos, fajas, bastones, cremas) y qué es **pedido bajo medida** (calzado, plantillas, prótesis), porque se controlan distinto. Para el calzado propuso rangos de talla sin explotar por color.

### 2.3 Venta y precio
- PODIX trae lista base con **ajuste por sucursal**. En la junta lo que piden es **un precio único** que se cambia una vez y llega a todas. Confirmar si las sucursales tienen precios distintos.
- Ya existe lógica de virón y disimetría; falta confirmar el cálculo de almas, molde y centímetros contra la lista real de Alejandro.
- Pantalla al cliente, etiquetas y código de barras propios: no están en el sistema.

### 2.4 Compras
La junta describe un flujo que PODIX ya contempla (requisición, recepción contra orden), pero con una regla propia: **Alejandro solo paga lo que está en el chat/requisición**. Eso exige que la requisición sea el documento que respalda el pago al proveedor, y que la recepción en sucursal lo cierre. No aparece así en el requerimiento.

### 2.5 Facturación
PODIX: cobro único con CFDI único en el sistema. Dueños: factura centralizada en un sistema aparte, que hoy hace Alejandro, sin autofactura. En el paralelo el sistema solo debe **capturar si el paciente pidió factura** y pasar el dato; la emisión sigue fuera. Falta decidir si algún día se integra el PAC.

## 3. Lo que falta en el plan del paralelo

1. **Esterilización (6)**: está en PODIX como "no puede fallar", pero los dueños no la mencionaron y yo la omití de la lista de operaciones. Decidir si entra al piloto o si se activa después, y por qué.
2. **Cumplimiento (18)**: aviso de privacidad y consentimiento al dar de alta pacientes son obligatorios aunque sea un piloto con datos reales. Incluirlos en recepción.
3. **Garantías y devoluciones (11)**: la dueña mencionó Profeco y reclamos por producto dañado. Falta decir cómo se registra.
4. **Cambio de turno (14)**: PODIX lo contempla con firma de quien sale y quien entra. Está en el sistema, pero el plan solo habla de apertura y cierre del día. Con corte cada 2 horas hay que definirlo.
5. **Prótesis**: quedan fuera de PODIX (cotización manual). Dejarlas como concepto abierto con anticipo, solo por los dueños.
6. **Venta o pago en otra sucursal (11)**: no se habló; no incluirlo ni prohibirlo hasta preguntar.

## 4. Lo que la junta pidió y PODIX no tiene como macroproceso

| Necesidad de la junta | Dónde encaja |
|---|---|
| Pantalla secundaria para el paciente | 11 (POS) |
| Control de blocs de notas foliadas por sucursal y captura de contingencia | 14 (caja) |
| Fotos del corte y de las notas dentro del sistema | 14 y 10 |
| Registro del folio de la nota de papel en cada cobro | 11 y 14 |
| Conciliación de Clip | 14 (hay "conciliación de terminales", sin integración) |
| Cadena entrega-recepción con firma y responsabilidad financiera de la encargada | 9 |
| Contador de personas (LoRaWAN) | Sin macroproceso: posible extensión de 19 |

## 5. Prioridad: fases de PODIX contra lo que pidieron

`REQUERIMIENTO.md` sugiere fases, marcadas como **[SUPUESTO]**:
1. Pacientes, agenda, POS, caja, catálogo
2. Compras, almacén, traspasos, inventario físico, apartados, devoluciones
3. **Crédito y plazos**, laboratorio, esterilización, facturación
4. Fidelización, portal, tableros y RRHH

Los dueños pusieron en el centro **traspasos, caja y anticipos con saldo**. El crédito/anticipo está en la fase 3 del documento, pero para ellos es de día uno. Eso es lo que decide el orden. Por eso el plan de diciembre ya lo incluye, y la lista de fases no debe usarse como corte del alcance.

## 6. Veredicto

El proceso del paralelo **es coherente con los macroprocesos**: cubre los que los dueños tocaron (2, 4, 9, 10, 11, 12, 13, 14, 19) y deja fuera los que no (1, 16, 17).

Antes de arrancar hay que:
1. Revalidar con Vanesa y Alejandro los **parámetros de anticipo, entrega y crédito** (sección 2.1).
2. Separar **stock** de **pedido bajo medida** (2.2).
3. Decidir **esterilización y cumplimiento** (sección 3).
4. Construir lo que falta (sección 4), sobre todo notas foliadas y pantalla al cliente.
5. Conectar una base real con aislamiento por sucursal, que sigue pendiente.

## 7. Preguntas para los dueños
1. ¿El anticipo es 50% fijo, o cada vez lo que el cliente deje (mínimo cuánto)?
2. ¿Los productos especiales se pagan completos o en dos pagos? (Vanesa y Alejandro dijeron cosas distintas.)
3. ¿Cobran interés o recargo a quien se atrasa en el segundo pago?
4. ¿Todas las sucursales tienen los mismos precios?
5. ¿Qué productos se manejan con stock y cuáles solo bajo pedido?
6. ¿Cuántas sucursales operan hoy?
7. ¿Quiénes se encargan de la esterilización en cada sede?
