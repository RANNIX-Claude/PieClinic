# Procesos y flujos de la implementación de Pie Clinic sobre Pie Firme

Base: lo que dijeron Vanesa Leyva y Alejandro Hernández en la junta, más tus aclaraciones del 24-nov-2026. Documento de trabajo: marca qué está claro y qué hay que confirmar.

## 0. Principio de trabajo

- **Hay un solo sistema: Pie Firme.** Pie Clinic es un cliente al que se le implementa. Todo lo que ya hay en Pie Firme forma parte de esa implementación.
- La implementación **selecciona la funcionalidad** que salió de la junta y la **fortalece** con lo que falta. Lo que Pie Clinic (PODIX) ya demuestra sirve como referencia para construirlo en Pie Firme.
- El **data warehouse, los tableros y las utilerías** son parte formal de la estructura del sistema, no un extra.

## 1. Perfiles y roles

### 1.1 Quiénes operan

| Perfil | Qué hace |
|---|---|
| **Dueños** (Vanesa y Alejandro) | Autorizan, ven todo, deciden precios, compras y pagos a proveedores. Llevan el RH por su lado |
| **Supervisor/a de sucursales** | Recorre las sucursales: vigila avance, ventas, turnos y asistencia. Lleva el RH por su lado, junto con la dueña |
| **Caja** | Cobra, imprime el ticket, entrega el producto; maneja efectivo y tarjeta; hace el corte |
| **Podólogo** | Atiende pacientes, consulta, expediente, orden de plantillas |
| **Recepción de mercancía** (función) | Recibe y da entrada al material, venga de Centenario o directo del proveedor, y firma de recibido |

### 1.2 Reglas que dijiste

1. **Cada sucursal tiene al menos dos personas.** Una atiende en consulta y otra cobra, o se turnan.
2. Algunas clínicas tienen **dos cabinas**, o las comparten por turno.
3. **Un mismo usuario puede dar servicio de podología y atender caja.** Se configura. Pero **cuando cobra tiene que firmarse con su propia cuenta**, para que quede quién cobró.
4. Ejemplo: la encargada está atendiendo a un paciente; llega alguien a comprar una plantilla. La atiende otra persona, y el sistema debe dejar claro quién vendió, quién cobró y quién entregó.

### 1.3 Lo que hoy hay en Pie Firme

- Roles de clínica: **administrador, podólogo, recepción**. No existe supervisor.
- Capacidades por función en `permisos.js`: cobrar y turno de caja están asignados a administrador y recepción.
- Existe un **modal de PIN** (`PinModal`) para autorizaciones del administrador. Se puede reutilizar para la firma al cobrar.
- RH ya tiene: empleados, horarios, checadas, asistencia, incidencias, vacaciones y asignaciones por sucursal.

### 1.4 Decisión (24-nov-2026)

**Los tres roles de Pie Firme se quedan** (administrador = dueños, recepción = caja y recepción de mercancía, podólogo) y **el supervisor es un cuarto rol**, el único nuevo. Tiene alcance sobre varias sucursales y **autoriza descuentos, devoluciones y permisos de personal**, pero no toca precios ni configuración. Una persona puede tener funciones de varios perfiles (por ejemplo, podólogo con función de caja), y al cobrar se firma con su **PIN personal**.

## 2. Flujo 1 — Venta en mostrador con dos personas

1. Llega el cliente y compra, por ejemplo, una plantilla.
2. Quien esté en caja arma la nota: producto o servicio, complementos si es especial.
3. **Se firma con su PIN personal** antes de cobrar. Si el podólogo también atiende caja, se firma como cajero.
4. Se registra la **forma de pago**:
   - **Efectivo**: se marca "efectivo", **sin subir fotos del dinero**.
   - **Tarjeta**: se **escanea o fotografía el voucher o ticket** de la terminal (Clip) y se sube como comprobante.
5. Se imprime el ticket y se entrega el producto.
6. La nota queda con tres datos: **quién vendió, quién cobró y qué forma de pago**. **La comisión se acredita a quien vendió**; quien cobró queda registrado para el control y el cuadre.

**Control**: una venta con tarjeta sin comprobante, o sin movimiento en Clip, aparece en el cuadre del día.

**Sobre los datos de la tarjeta**: dijiste que había que ver cómo lo manejan hoy. Recomiendo **no guardar números de tarjeta**. Basta con la forma de pago, los últimos 4 dígitos si los quieren, el folio de autorización y la foto del voucher.

## 3. Flujo 2 — Solicitud de producto especial al proveedor

Hoy se hace por un **grupo de WhatsApp** donde están los dueños, la supervisora, las encargadas de sucursal y el proveedor de plantillas. **Lo que no está en el grupo no es oficial.** El sistema lo sustituye así:

| Paso | Quién | Qué ocurre |
|---|---|---|
| 1. Solicitud | Sucursal | Registra la solicitud ligada al paciente: "necesito una plantilla para fulana de tal", con medidas y complementos |
| 2. Anticipo | Caja | **No se puede solicitar sin pago registrado**: anticipo del 50% o pago completo, con su comprobante |
| 3. Autorización | Dueños | La reciben y la autorizan en el sistema |
| 4. Aviso al proveedor | Sistema | El proveedor **entra con su cuenta**, ve la orden y confirma "enterado"; después marca en producción y entregado |
| 5. Entrega | Proveedor | Surte y entrega en la sucursal, o primero en Centenario |
| 6. Recepción | Sucursal | **Firma la nota de recibido** y da entrada en el sistema |
| 7. Entrega al paciente | Sucursal | Se cita al paciente; se liquida el saldo con el botón **Liquidar** |
| 8. Cuenta del proveedor | Dueños | La nota de recibido se acumula en lo que se le debe al proveedor |

Estados: solicitada, con anticipo, autorizada, enviada al proveedor, entregada, recibida, entregada al paciente, liquidada.

**Decidido**: los proveedores de **plantillas y de zapatos** usan el sistema **con cuenta**, porque son con quienes hay interacción directa. Es un acceso externo, no un rol de la clínica, y solo ven sus propias órdenes (folio, sucursal, medidas, especificaciones, fecha prometida). **No ven** expediente ni datos clínicos del paciente. Su entrega declarada se compara contra la entrada de la sucursal (flujo 3). Los demás proveedores (fajas, bastones, cremas) entran por compra central y no necesitan cuenta, salvo que se decida otra cosa.

## 4. Flujo 3 — Entrega, recepción, aceptación y cuenta del proveedor

Aplica a los proveedores con los que hay interacción directa: **plantillas y zapatos**. Tres registros tienen que coincidir:

| Registro | Quién lo hace | Qué es |
|---|---|---|
| **Solicitud** | Sucursal | Lo que se pidió, ligado al paciente, con su anticipo |
| **Entrega declarada** | Proveedor, con su cuenta | Sube su nota diciendo qué entregó, dónde y cuándo |
| **Entrada en la sucursal** | Encargada | Da de alta la plantilla o el zapato recibido y firma de recibido |

**Secuencia**
1. El proveedor entrega en la sucursal y **sube su nota** al sistema.
2. La sucursal **tuvo que haberlo reportado**: debe existir la **entrada** (alta del producto en esa sucursal) ligada a la solicitud.
3. El sistema **compara** la entrega declarada contra la entrada. Si el proveedor dice que entregó y la sucursal no dio entrada, o las cantidades no cuadran, queda como **discrepancia** y se avisa a la sucursal, a la supervisora y a los dueños.
4. Si coinciden, la entrada queda **pendiente de aceptación por los dueños**.
5. Los dueños la aceptan ("ya estoy enterado"). **Hasta ese momento no forma parte de la deuda.**
6. Una vez aceptada, **pasa a ser parte de lo que se le debe al proveedor** (cuenta por pagar).

**Plazo de escalamiento**: si el proveedor sube una entrega y la sucursal no registra la entrada, pasado el plazo que fijen los dueños (parámetro configurable) se marca como discrepancia y se avisa **a la supervisora y a los dueños a la vez**.

**Estados**: entregada por el proveedor, entrada registrada, con discrepancia, pendiente de aceptación, aceptada (deuda), pagada parcial, pagada.

## 5. Flujo 4 — Pago al proveedor

Dos caminos:

| Camino | Qué pasa |
|---|---|
| **Central** | Los dueños pagan al proveedor desde su cuenta. Se registra el pago y se cierran las notas |
| **Desde la caja de la sucursal** | El dueño le dice a la encargada: "abónale al proveedor tanto". Ella toma el efectivo de la caja y se lo da. Se registra como **salida de efectivo, con motivo "pago a proveedor X"**, ligada a las notas, y **queda registrado quién autorizó** |

Todo pago, sea en **efectivo o por transferencia**, **se registra** y se aplica contra lo aceptado que se le debe al proveedor, con quién lo hizo y quién lo autorizó. Así el saldo de cada proveedor siempre sale de: notas aceptadas menos pagos.

La salida aparece en el **corte diario** de esa sucursal, como egreso. El corte debe cuadrar: efectivo esperado = fondo + ventas en efectivo − salidas.

## 6. Flujo 5 — Compra central y traspasos

1. Los dueños **compran al proveedor** y la mercancía entra al **almacén central en Centenario**.
2. Centenario concentra el total de productos (es el almacén o la oficina central).
3. De ese total se hacen los **traspasos a las sucursales**. Ejemplo: llegan fajas y se reparten dos a cada sucursal.
4. Cada traspaso tiene: salida de Centenario, tránsito, **recepción firmada** en la sucursal y registro de diferencias.
5. La sucursal que recibe **da entrada**. Si falta algo, queda registrado.

También hay solicitudes que hace la **sucursal directa** al proveedor (flujo 2) y solicitudes que hacen los **dueños de manera central** y luego entregan a las sucursales. El sistema debe distinguir de dónde vino cada una.

## 7. Flujo 6 — Gastos y compras locales

1. Se compra algo en la sucursal, por ejemplo **material de curación**.
2. Se **sube la nota o comprobante** con los requisitos y se indica **cómo se pagó** (efectivo, tarjeta, transferencia).
3. Si salió **de la caja en efectivo**, aparece como egreso en el corte del día.
4. Cada gasto lleva categoría, sucursal y quién lo hizo.
5. El control de gastos se ve por sucursal y consolidado.
6. **El responsable de cada sucursal debe llevar el registro de sus gastos**: no hay gasto sin captura y sin comprobante, y los pagos a proveedor hechos desde la caja también quedan ahí.

## 8. Flujo 7 — Control de caja

| Concepto | Control |
|---|---|
| **Efectivo** | Fondo inicial + ventas en efectivo − salidas (pagos a proveedor, gastos) = efectivo esperado. Se compara contra el contado en el corte |
| **Tarjeta** | Cada pago con tarjeta lleva el voucher. Se concilia contra el reporte de Clip |
| **Corte** | Por turno y por día, con diferencias y su motivo |
| **Cambio de turno** | Corte parcial con firma de quien sale y de quien entra |

## 9. Flujo 8 — Recursos humanos y supervisión

### Recursos humanos
La **propietaria** lo lleva por un lado y la **supervisora** por otro. **La supervisora aprueba permisos, vacaciones, faltas y cambios de turno.** **La propietaria lleva altas, bajas, sueldos y nómina.** Procesos:
- Asistencia y entrada/salida (checador).
- **Turnos** y **cambio de turno**.
- **Permisos y ausencias**: alguien pidió permiso y se cubre con otra persona, a veces de otra sucursal.
- **Rotación** de personal entre sucursales por decisión o por imprevisto.
- Vacaciones e incidencias.

### Supervisión
La supervisora **recorre las sucursales** y monitorea:
- avance y ventas por sucursal;
- turnos y quién está trabajando;
- caja y cortes;
- inventario y traspasos pendientes.

## 10. Preguntas abiertas

1. **Supervisor**: cuarto rol; **autoriza descuentos, devoluciones y permisos de personal**. El **tope de descuento y el monto máximo de devoluciones los definen los dueños** (parámetros configurables). **Los ajustes de inventario los autorizan solo los dueños** (resuelto).
2. **Escalamiento de entregas sin entrada**: el plazo lo definen los dueños (parámetro configurable) y el aviso llega **a la supervisora y a los dueños a la vez**. Resuelto.
3. **RH dueña y supervisora**: la supervisora aprueba permisos, vacaciones, faltas y cambios de turno (resuelto). La dueña lleva altas, bajas, sueldos y nómina (resuelto). **Se le avisa de cada aprobación de la supervisora** (resuelto).
4. **Pago al proveedor desde caja**: **solo los dueños pueden instruirlo** (resuelto); la supervisora no.
5. **Firma al cobrar**: **PIN personal** de quien cobra (resuelto).
6. **Comisiones**: se acreditan **a quien vende**, no a quien cobra (resuelto). **El cajero elige de una lista quién vendió** al armar la nota (resuelto); queda en bitácora y la supervisora puede revisar las ventas atribuidas.
7. **Notas foliadas**: **los dueños entregan y controlan los blocs** (resuelto). Cada entrega queda registrada en el sistema con sucursal, folio inicial y final, y fecha.
8. **Tarjeta**: hoy solo piden el **voucher** de la terminal (resuelto). El sistema guarda la foto del voucher, el folio de autorización y la forma de pago, y **no guarda números de tarjeta**.
9. **Gastos locales**: **los dueños definen el tope** de gasto por sucursal sin autorización; arriba del tope necesita su autorización (resuelto, parámetro configurable).

## 11. Qué sigue

El plan de construcción ([Plan_Subir_Funciones_a_PieFirme.md](Plan_Subir_Funciones_a_PieFirme.md)) ya incorpora estos flujos en su **bloque F** (rol supervisor, funciones habilitadas, firma al cobrar, solicitud de producto especial, nota de recibido, pago al proveedor desde caja, tarjeta con comprobante, gastos locales y RH), y la fase 1 empieza por los roles y la firma.
