# Podix: la plataforma integral para clínicas de podología

*Documento fuente para NotebookLM. Explica en detalle qué es la plataforma, para quién es, cómo se usa en el día a día y qué gana una clínica de podología al adoptarla. Está escrito para podólogos, dueños y directores de clínicas, y puede usarse para generar una presentación, un resumen en audio o un video explicativo.*

*Nombre de trabajo del producto: **Podix**. Desarrollado por **RANNIX**. Cliente fundador: **Pie Clinic**, cadena de clínicas de podología y ortopedia.*

---

## 1. La idea en una frase

Podix es un sistema hecho específicamente para clínicas de podología que reúne en un solo lugar el expediente clínico del paciente, la agenda de todas las sucursales, la caja, el inventario de productos ortopédicos, el personal, las finanzas y la comunicación del equipo, para que el dueño sepa en todo momento qué pasa en cada sucursal y cuánto gana cada una.

## 2. El problema que resuelve

Una clínica de podología que crece a varias sucursales suele operar con herramientas sueltas:

- El expediente clínico está en papel o en un archivo que solo existe en una sucursal. Si el paciente va a otra sede, su historia no está.
- La agenda vive en una libreta, en una hoja de cálculo o en el WhatsApp de la recepcionista.
- La caja se cuadra a mano al final del día, y las diferencias se descubren tarde.
- El inventario de plantillas, bastones, calzado y cremas se cuenta "de vez en cuando", y cuando falta mercancía nadie sabe desde cuándo.
- Los podólogos rotan entre sucursales y no queda claro quién atendió, quién vendió ni cuánto le corresponde de comisión.
- El dueño ve cuánto se vendió, pero no sabe cuánto ganó cada sucursal después de renta, luz, nómina y producto.
- Un sistema genérico de punto de venta resuelve la caja y el inventario, pero no entiende lo clínico: no tiene expediente, ni pie diabético, ni plantillas a la medida, ni esterilización.

Podix nace para resolver todo eso en un solo sistema, pensado desde la operación real de una cadena de podología.

## 3. Para quién es

- **Clínicas de podología** de una o varias sucursales.
- **Cadenas** que combinan servicios clínicos (quiropodia, uña encarnada, hongos, pie diabético, plantillas) con **venta de productos** ortopédicos y de movilidad (bastones, andaderas, plantillas, calzado, cremas, calcetas).
- **Dueños y directores** que quieren ver la rentabilidad real por sucursal.
- **Equipos con personal que rota** entre sedes.

## 4. Cómo está organizada: una aplicación por rol

Cada persona entra con su cuenta y ve **solo lo que le corresponde hacer**. El menú cambia según el rol. En el teléfono se usa con un menú inferior, como una app; en la computadora, con un menú lateral organizado por secciones.

Los roles son ocho:

1. **Recepción**: agenda, pacientes, sala de espera, confirmaciones, lista de espera y recordatorios.
2. **Podólogo**: su agenda del día en todas sus sucursales, la consulta clínica, el expediente, planes de tratamiento, pie diabético, plantillas y órdenes de laboratorio.
3. **Asistente clínico**: esterilización, insumos y bitácoras de limpieza y residuos.
4. **Cajero**: cobro, cuentas por cobrar, apartados, crédito, caja y corte, devoluciones, facturación y pedidos en línea.
5. **Almacén**: existencias, recepción de mercancía, traspasos entre sucursales, conteos, ajustes y auditoría de inventario por foto.
6. **Gerente de sucursal**: el día de su sucursal, autorizaciones, caja y cartera, alertas, personal, gastos, resultados y metas.
7. **Administración central**: precios, compras, parámetros, usuarios, finanzas y toda la cadena.
8. **Dirección**: la vista completa del negocio, con indicadores, estado de resultados y el asistente inteligente.

Un detalle importante: **el ícono o el acceso por el que se entra no da permisos; los permisos los da la cuenta**. Y la seguridad no se basa solo en esconder botones: cada acción revisa si la persona tiene permiso de hacerla.

## 5. Multisucursal: "Trabajando en…"

En una cadena, el personal no siempre trabaja en la misma sede. Los podólogos rotan, y a veces también la recepción, la caja o los asistentes.

Por eso, al entrar, cada persona **elige en qué sucursal trabaja ese día**, y el encabezado siempre muestra **"Trabajando en: Norte"**, por ejemplo. Todo lo que haga queda registrado con su cuenta y con esa sucursal: cada venta, cobro, entrada al checador y movimiento de inventario.

Esto resuelve tres cosas a la vez:

- **Bonos y comisiones justos**: se sabe quién vendió y en qué sucursal.
- **Inventario correcto**: la mercancía sale del almacén de la sucursal donde realmente se vendió.
- **Asistencia real**: se sabe quién estuvo en qué sede cada día.

El administrador puede brincar de una sucursal a otra y ver cada una por separado o todas juntas.

## 6. La forma de ver la información: mosaico y renglones

Todas las listas importantes (personal, productos, pacientes, gastos, documentos) se pueden ver de dos formas, con un solo botón:

- **Mosaico**: tarjetas con foto o iniciales, para reconocer a la persona o el producto de un vistazo.
- **Renglones**: una tabla que se puede ordenar y filtrar, para comparar.

En el teléfono, los renglones se convierten en tarjetas apiladas para que nada se salga de la pantalla.

---

## 7. El corazón clínico

Esta es la parte que distingue a Podix de cualquier punto de venta genérico.

### 7.1 Expediente clínico único
- Un solo expediente por paciente, **disponible en todas las sucursales**. El paciente puede atenderse y pagar en cualquier sede.
- Al dar de alta, el sistema **detecta posibles duplicados** comparando nombre completo y fecha de nacimiento.
- Para menores de edad registra al **tutor**, y cuando el paciente cumple 18 años pide una nueva firma.
- Aviso de privacidad y consentimientos firmados en pantalla.
- **Bitácora de aperturas**: queda registrado quién abrió cada expediente y cuándo. Si un podólogo sin relación con el paciente lo abre, debe registrar el motivo y se avisa a Administración.

### 7.2 La consulta
La consulta sigue pasos claros: datos del paciente y alertas, exploración (peso, talla, glucosa, presión, monofilamento, pulsos), diagnóstico (con catálogo CIE-10 opcional), procedimientos realizados, insumos utilizados, fotos clínicas, indicaciones y cierre.

- Al cerrar, la consulta **pasa a caja** con los servicios realizados.
- Los insumos usados se **descuentan del inventario** de la sucursal.
- La **nota clínica firmada no se puede editar**: si hay que agregar algo, se hace una **adenda** con autor y hora. Así el expediente tiene validez y trazabilidad.

### 7.3 Historia clínica e impresos
- Antecedentes, exploración del miembro inferior y un **mapa del pie** donde se marcan las lesiones sobre las siluetas.
- Hoja de seguimiento con fecha, quién atendió, servicio, observaciones y próxima visita.
- **Impresos fieles a los formatos en papel** de la clínica: consentimiento informado, antecedentes y hoja de seguimiento.
- Los datos sensibles, como el estado de VIH, tienen **acceso restringido por rol**.

### 7.4 Fotos clínicas y evolución
- Hasta 10 fotos por sesión.
- Comparación **antes y después** lado a lado para ver la evolución.
- Las fotos no se borran: se **retiran**, para no perder trazabilidad.
- Se registra si el paciente autorizó el uso de sus fotos para docencia.

### 7.5 Planes de tratamiento
- Planes por sesiones (por ejemplo, extracción de uña más cuatro curaciones sin costo adicional).
- Avance por sesión y alerta de **abandono** cuando el paciente deja de venir 30 días.

### 7.6 Pie diabético
- Valoración con las escalas **SINBAD** (0 a 6) y **Wagner** (0 a 5), índice tobillo-brazo, monofilamento y pulsos.
- Historial y evolución de cada paciente diabético, con alertas.
- La clasificación de riesgo internacional queda disponible como opción configurable.

### 7.7 Plantillas ortopédicas y laboratorio
- Estudio de pisada, toma de huella o escáner, orden al laboratorio externo y seguimiento por estados hasta la entrega.
- Plazo de entrega en días hábiles, anticipo del 50 % y **garantía de 6 meses**.
- Alertas de órdenes retrasadas.

### 7.8 Esterilización con trazabilidad
- Ciclos de autoclave con indicador químico y **biológico**.
- Sets y kits identificados con código QR.
- Si un lote resulta no conforme, se **bloquea** y el sistema muestra **la lista de pacientes atendidos con ese lote**. Esto es seguridad del paciente y protección legal para la clínica.
- Bitácoras diarias de desinfección y de residuos (RPBI).

### 7.9 Quejas y derechos ARCO
- Registro de quejas y eventos adversos con plazo de respuesta y semáforo.
- Solicitudes de acceso, rectificación, cancelación u oposición de datos personales con sus plazos legales.

### 7.10 Seguimiento de pacientes
- Lista de pacientes **inactivos** (más de 180 días sin venir) para reactivarlos.
- Campañas y contacto directo por WhatsApp o llamada, con bitácora de resultados.

---

## 8. Agenda y recepción

- **Agenda multi-sucursal** por consultorio y por podólogo.
- **Horarios** de cada sucursal y de cada podólogo, **bloqueos** (vacaciones, juntas, mantenimiento) y **días festivos**.
- Reglas automáticas: margen de 10 minutos entre citas, máximo un sobrecupo por podólogo al día con autorización, y tolerancia de 15 minutos antes de marcar "no asistió".
- **Lista de espera**: cuando se libera un hueco, el sistema propone a los candidatos y da 30 minutos para confirmar.
- **Recordatorios 24 horas antes**, con plantilla de mensaje y resultado (confirmó, reprogramó, sin respuesta).
- **Mi agenda** para el podólogo, que ve sus citas en todas las sucursales donde trabaja.
- Sala de espera con el estado de cada paciente.

## 9. Caja y ventas

- Cobro de consultas y venta de productos en un mismo ticket, con **pago mixto** (efectivo, tarjeta, transferencia).
- **Precios por sucursal**: un precio base central más un ajuste por sucursal.
- **Apartados**: anticipo mínimo del 20 % y vigencia de 10 días; el gerente autoriza prórrogas.
- **Crédito y ventas a plazos**, con interés o recargo según el caso, días de gracia y autorización por niveles según el monto (gerente, administración, dirección).
- **Descuentos** de recepción hasta cierto porcentaje; arriba de eso se pide el PIN del gerente.
- **Apertura y corte de caja** por turno, con arqueo y diferencias que deben justificarse y autorizarse.
- Devoluciones y notas de crédito.
- **Facturación electrónica** (CFDI 4.0): factura de un ticket, factura global, notas de crédito, complemento de pago y cancelación, con el impuesto correcto por concepto.
- **Paquetes, membresías y tarjetas de regalo**, con saldo de sesiones y vigencia.
- Funciona aunque se caiga el internet: el cobro y el conteo de inventario se guardan y se sincronizan cuando vuelve la señal.

## 10. Catálogo central de precios

- Un solo catálogo de servicios y productos para toda la cadena.
- Cuando Dirección cambia un precio, **lo ven todas las sucursales** a partir de la fecha de vigencia.
- Cada cambio guarda el precio anterior, el nuevo, la fecha, quién lo autorizó, el **tipo de cambio** (nuevo costo de compra, ajuste anual, promoción, corrección) y el **motivo**. Si el cambio se debe a una compra, queda ligada la factura del proveedor que lo originó.

## 11. Inventario y compras

- Existencias por sucursal y almacén central, por lote, talla, color y lado.
- **Costo por capas PEPS** (primeras entradas, primeras salidas), para que el costo de lo vendido sea real.
- Órdenes de compra, recepción con faltantes y diferencias, cuentas por pagar con calendario.
- **Captura de notas de compra con inteligencia artificial**: el almacenista toma una foto de la nota del proveedor, la IA arma una **captura previa** y la persona la revisa y confirma. La IA nunca registra sola.
- Traspasos entre sucursales con estados: solicitado, autorizado, en tránsito, recibido.
- Conteos cíclicos y generales, mermas y ajustes con autorización.
- Expediente de cada producto (kardex, existencias, historial de precios, proveedores, rotación) y de cada proveedor.

### 11.1 Auditoría de inventario a distancia
Pensada a raíz de un robo real en una sucursal:

1. El colaborador toma fotos de los productos principales, o se toman desde la cámara de seguridad.
2. La inteligencia artificial **estima** cuántas piezas hay.
3. El sistema lo **compara** con las existencias registradas.
4. Si no cuadra, se genera una **alerta** con la foto, fecha, hora, sucursal y responsable como evidencia.
5. Dirección decide si ajusta (con autorización) o abre una investigación.

Así se audita sin cerrar la clínica, y se puede saber desde cuándo empezó a faltar mercancía. La cifra de la IA es una estimación y no sustituye el conteo físico periódico.

---

## 12. Personas: recursos humanos

- **Expediente de cada colaborador** con foto, datos personales, puesto, sucursal base y sucursales donde puede trabajar, sueldo, antigüedad, contrato y documentos entregados (con su porcentaje de avance).
- Todo el historial de la persona de principio a fin: alta, cambios, asistencia, incidencias, vacaciones, nómina, recibos, capacitación y baja.
- **Checador**: cada persona registra su **entrada y salida** con su cuenta, en la sucursal donde trabaja ese día. Retardos con tolerancia configurable, faltas y quién está hoy en cada sede.
- **Horarios y rotación**: quién trabaja en qué sucursal cada día de la semana.
- Incidencias y **vacaciones** con saldo según antigüedad, que aprueba el gerente.
- **Prenómina** por periodo, con descuentos por faltas y retardos, recibo imprimible y firma.

## 13. Bonos, comisiones y metas

- **Quién hizo la venta**: cada venta queda ligada a la persona que la hizo y a la sucursal donde se hizo.
- **Bonos individuales y por sucursal**, **mensuales y trimestrales**, con escalones configurables (por ejemplo, a partir de cierto monto de ventas, un porcentaje).
- El bono por sucursal se reparte entre quienes realmente trabajaron en esa sucursal en el periodo.
- Condiciones opcionales: asistencia mínima o calificación mínima de los pacientes.
- Cada bono pasa por **calculado → aprobado → pagado**, y se puede ver exactamente de qué ventas salió.
- **Comisiones por servicio** para podólogos.
- **Metas por sucursal y por mes**, con historial y una **meta sugerida** que el sistema calcula con el promedio de los últimos meses, la tendencia y la temporada.
- Cada colaborador ve **"Mis bonos y metas"**: cuánto lleva, cuánto le falta para el siguiente escalón y su historial.

## 14. Finanzas: la rentabilidad real de cada sucursal

Este es el modelo de administración de plazas comerciales aplicado a la clínica: **cada sucursal es una unidad de costo**, con su propia renta, luz, agua, gastos y personal.

- **Compras y gastos** por sucursal, con comprobante, categoría, proveedor y gastos recurrentes del mes.
- **Estado de resultados** por sucursal y **consolidado** de toda la cadena:
  - Ingresos: servicios, plantillas y productos.
  - Gastos variables: producto y laboratorio, comisiones y bonos.
  - **Utilidad bruta**.
  - Gastos de operación: nómina del personal asignado, renta, luz y agua, internet y limpieza, mantenimiento, publicidad y otros.
  - **Utilidad operativa** y margen.
  - Comparativo entre sucursales y contra el mes anterior.
- **Dashboard financiero**, **resumen semanal** (de sábado a viernes), ingresos consolidados, cuentas por cobrar y por pagar con antigüedad de saldos.
- **Conciliación bancaria** con importación del estado de cuenta.
- **Fondo revolvente** (caja chica) por sucursal, con arqueo y reposición.
- **Cierre de periodo**: un mes cerrado ya no se puede modificar, salvo reapertura autorizada por Dirección.

Un punto de venta solo ve las ventas. Podix ve también los costos, y por eso puede decir cuál sucursal gana y cuál no.

## 15. Análisis e inteligencia

- **Tableros de análisis**: ventas por sucursal y por mes, mezcla de servicios y productos, ranking de podólogos, ocupación de agenda, productos que más y menos se mueven, cartera vencida.
- **Evaluación de clientes**: al terminar la cita, el paciente recibe una encuesta breve (servicio, podólogo, sucursal y comentario). Las calificaciones bajas generan una **alerta inmediata** para llamar y resolver.
- **Tablero ejecutivo y almacén de datos**, con los datos del paciente anonimizados, y control de las cargas que se pueden cuadrar contra la operación.
- **Asistente inteligente**: se le pregunta en español sobre el negocio y responde con los datos reales, por ejemplo:
  - "¿Qué sucursal vendió más plantillas este trimestre?"
  - "¿Quién va en meta para el bono de este mes?"
  - "¿Cuánto fue el faltante de caja de esta semana?"
  - "¿Qué pacientes con crédito llevan más de 30 días de atraso?"
  - "¿Cuál es la utilidad de cada sucursal?"
  - "¿Qué producto está por agotarse en la sucursal Norte?"

  El asistente respeta los permisos de cada rol, explica cómo calculó cada cifra y pide confirmación antes de ejecutar cualquier acción.

## 16. Tienda en línea y portal

- Un **portal público** de la clínica con sus servicios, productos destacados, sucursales, horarios, preguntas frecuentes y botón de WhatsApp.
- Una **tienda en línea** donde el paciente ve el catálogo con el precio y la disponibilidad de su sucursal, arma su carrito, paga en línea y **recoge en la sucursal** que elija o recibe en casa. Puede dar seguimiento a su pedido con el folio y su teléfono.
- En la clínica, el personal ve los **pedidos en línea** por estado (nuevo, preparando, listo, entregado). Al entregar, el sistema registra la venta y descuenta el inventario de esa sucursal.
- Desde el portal, el personal entra al sistema con el botón **Iniciar**.

## 17. Comunicación interna

- **Mensajes** entre compañeros, por grupos, por sucursal, por rol y para toda la empresa.
- **Correo interno** con bandeja de entrada, enviados, borradores y etiquetas, para comunicados formales.
- **Comunidad (feed)**: un muro donde se publican avisos oficiales, logros, reconocimientos, eventos y fotos del equipo, con reacciones y comentarios. Por ejemplo: una sucursal que alcanzó su meta, un podólogo reconocido por un paciente o un curso nuevo disponible.

## 18. Capacitación y acervo de la organización

Cuando llega una persona nueva, tiene que aprender cómo se hacen las cosas en esta clínica: cómo se hace una quiropodia, cómo se esteriliza, cómo se atiende a un paciente diabético, cómo se hace el corte de caja.

- **Cursos** con lecciones en video, fotos paso a paso, textos y listas de verificación, y una pequeña evaluación al final con constancia.
- Los videos se **graban, se suben a YouTube** como videos no listados en el canal de la empresa, y en el sistema solo se pega el enlace. Así no hay límite de espacio.
- Cursos obligatorios por rol y ruta de bienvenida para personal nuevo.
- El gerente ve **quién no ha terminado** su capacitación.
- **Acervo de conocimiento**: biblioteca de procedimientos, guías, formatos y videos de la organización, con búsqueda y versiones.

## 19. Administración y utilerías

- Usuarios y roles, parámetros por sucursal, configuración general y catálogos.
- **Documentos de la clínica** (licencias sanitarias, contratos de renta, pólizas, permisos) con **alertas de vencimiento**.
- **Bitácora de auditoría** de todas las acciones sensibles.
- **Cálculos del sistema**: cada fórmula explicada y con un simulador para probarla.
- **Validación**: decenas de revisiones automáticas de integridad (ventas que cuadran con sus partidas, inventario nunca negativo, cartera contra abonos, entre otras).
- **Importación de datos** desde hojas de cálculo con mapeo automático de columnas, para migrar pacientes, productos y saldos, con opción de deshacer.
- **Exportación** de los datos en formatos abiertos.
- Salud del sistema, datos de prueba y suscripción.

---

## 20. Un día en la clínica con Podix

**8:00. Apertura.** La recepcionista de la sucursal Norte entra y elige "Trabajando en: Norte". Registra su entrada en el checador. El cajero abre su turno con el fondo de caja.

**8:30. La agenda del día.** Recepción ve las citas confirmadas, las que faltan por confirmar y la lista de espera. Los recordatorios de ayer ya dejaron confirmadas la mayoría.

**9:00. Llega un paciente diabético.** Recepción lo pasa a sala. El podólogo, que hoy trabaja en Norte aunque ayer estuvo en Centro, abre el expediente único: ve su historia, su última valoración de pie diabético y las fotos de su evolución.

**9:15. La consulta.** El podólogo registra la exploración y la valoración SINBAD, toma fotos, realiza la curación y la consulta descuenta los insumos. Firma la nota, que ya no se puede alterar, y la envía a caja.

**9:50. El cobro.** El paciente paga la consulta y compra una crema y calcetas para diabético. Pide factura y el cajero la emite ahí mismo. La venta queda ligada al podólogo y a la sucursal.

**10:00. La encuesta.** El paciente recibe una encuesta breve. Califica con 5 al podólogo.

**12:00. Llega mercancía.** El almacenista toma foto de la nota del proveedor; la IA arma la captura previa, él la revisa y la confirma. Las existencias y el costo se actualizan.

**14:00. Pedido en línea.** Un paciente compró unas plantillas en la tienda en línea para recoger en Norte. El cajero lo marca como listo y, al entregarlo, se registra la venta.

**18:00. Auditoría.** Antes de cerrar, el almacenista toma fotos del anaquel de bastones. La IA detecta una diferencia de dos piezas y se genera una alerta para el gerente.

**20:00. Cierre.** El cajero hace su corte; la diferencia de 30 pesos queda justificada y autorizada. Todos registran su salida.

**Al día siguiente, en la dirección.** La directora abre el estado de resultados: Polanco tiene el mejor margen del mes y Sur el más bajo. Le pregunta al asistente quién va en meta para el bono y qué productos están por agotarse. Revisa la alerta de la auditoría y publica en el feed un reconocimiento para el equipo de Polanco.

## 21. Qué gana la clínica

- **Información en un solo lugar**: expediente, agenda, caja, inventario, personal y finanzas conectados.
- **Rentabilidad real por sucursal**, no solo ventas.
- **Control de inventario y menos robo**, con auditoría a distancia y trazabilidad.
- **Bonos y comisiones justos y transparentes**, porque se sabe quién vendió y dónde.
- **Seguridad del paciente**: expediente único, notas inmutables, esterilización con trazabilidad y alertas de pie diabético.
- **Menos trabajo manual**: recordatorios, captura de notas con IA, cálculos automáticos, cierre de mes en horas.
- **Equipo mejor capacitado y comunicado**, con cursos, acervo y comunicación interna.
- **Nuevos ingresos** por la tienda en línea.
- **Decisiones con datos**, con tableros y un asistente que responde en español.

## 22. Qué lo hace diferente de un punto de venta

Un punto de venta genérico (como los que usan tiendas y farmacias) resuelve muy bien la caja, el inventario, las compras, la facturación y las sucursales. Podix también hace todo eso, pero además tiene lo que ningún punto de venta trae:

- El **expediente clínico** y la historia clínica con impresos fieles.
- **Pie diabético**, planes de tratamiento, plantillas y laboratorio.
- **Esterilización** con trazabilidad al paciente.
- **Recursos humanos** con checador, rotación de sucursal y prenómina.
- **Bonos y metas** ligados a quien hizo la venta.
- **Estado de resultados por sucursal** con todos sus costos.
- **Capacitación, comunicación interna y asistente inteligente**.

## 23. Tecnología y seguridad

- Aplicación web que se **instala en el teléfono** como una app, una por rol, y que también funciona en la computadora.
- Base de datos en la nube con **seguridad a nivel de cada registro**: cada persona solo puede ver y modificar lo que su rol y su sucursal le permiten, y esto se valida en la base de datos, no solo en la pantalla.
- Bitácora de auditoría de las acciones sensibles.
- Funciona sin señal para el cobro y el conteo, y sincroniza al volver la conexión.
- Desarrollado con la metodología de la fábrica de software RANNIX: requerimiento, análisis de pantallas, reglas de negocio confirmadas por el cliente, construcción, pruebas con acta de calidad y puesta en producción con respaldo.

## 24. Estado actual y próximos pasos (transparencia)

Para no prometer de más, esto es lo que hoy está listo y lo que está en integración:

- **Listo y funcionando en el ambiente de pruebas**: todos los módulos descritos, con datos de demostración realistas, y una primera conexión a la base de datos real (inicio de sesión, personal, asistencia, comunicación, capacitación, evaluaciones y gastos).
- **En integración**: la conexión completa a la base de datos de los módulos clínicos, agenda, ventas e inventario; la facturación electrónica con un proveedor autorizado (PAC); el pago en línea con una pasarela; el envío automático por WhatsApp y correo; y los servicios de inteligencia artificial para lectura de notas, conteo por foto y el asistente. Mientras tanto, esas funciones operan en modo de demostración y así se indica en pantalla.
- **Por confirmar con la clínica**: los esquemas reales de bonos, la lista de precios, las políticas de nómina, faltas y retardos, y algunas reglas de negocio que hoy están con valores por defecto.

## 25. Cómo empezar

1. **Diagnóstico** (3 semanas): taller con la clínica, reglas de negocio y revisión de los datos actuales.
2. **Configuración** (6 semanas): sucursales, catálogos, precios, usuarios, bonos y pruebas.
3. **Piloto** (4 semanas): una sucursal operando de verdad, con capacitación por rol.
4. **Oleadas** (6 semanas): el resto de las sucursales.
5. **Estabilización**: ajustes, tableros y mejora continua.

Los plazos son de referencia y se ajustan tras el diagnóstico.

---

## Anexo A. Glosario

- **Quiropodia**: tratamiento podológico de callosidades, uñas y piel del pie.
- **Onicocriptosis**: uña encarnada.
- **SINBAD / Wagner**: escalas de valoración de úlceras en pie diabético.
- **Índice tobillo-brazo (ITB)**: medición de la circulación en piernas.
- **PEPS**: método de costeo "primeras entradas, primeras salidas".
- **CFDI**: comprobante fiscal digital por internet (factura electrónica en México).
- **ARCO**: derechos de acceso, rectificación, cancelación y oposición sobre datos personales.
- **RPBI**: residuos peligrosos biológico-infecciosos.
- **Prenómina**: cálculo previo de pagos al personal antes del timbrado de nómina.

## Anexo B. Sugerencias para NotebookLM

**Para una presentación (10 a 14 diapositivas):**
1. El problema de una cadena de podología.
2. Qué es Podix en una frase.
3. Una app por rol y "Trabajando en…".
4. El corazón clínico: expediente, consulta, historia e impresos.
5. Pie diabético, plantillas y esterilización.
6. Agenda, recepción y recordatorios.
7. Caja, precios centrales, inventario y auditoría por foto.
8. Personas: RRHH, checador, bonos y metas.
9. Rentabilidad por sucursal: estado de resultados.
10. Análisis, evaluación de clientes y asistente inteligente.
11. Tienda en línea, comunicación y capacitación.
12. Un día en la clínica.
13. Qué gana la clínica y por qué es diferente.
14. Cómo empezar.

**Para un video explicativo (8 a 12 minutos):** narrar como historia "Un día en la clínica con Podix" (sección 20), intercalando la explicación de cada módulo en el momento en que aparece, y cerrar con los beneficios (sección 21) y los pasos para empezar (sección 25). Tono profesional, cercano y claro, dirigido a podólogos y dueños de clínicas. Mencionar con honestidad las funciones que están en integración (sección 24).
