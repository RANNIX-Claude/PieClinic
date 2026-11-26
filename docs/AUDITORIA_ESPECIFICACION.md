<!-- Texto extraído de «Especificación técnica — Módulo de Control y Auditoría.docx» (Downloads, 2026-11-26). Las tablas del docx salen aplanadas, una celda por línea. Fuente de verdad para construir el módulo de auditoría. -->
# Especificación técnica — Módulo de Control y Auditoría (PODIX)
Nov 26, 2026 · @roberto aguilar
## Alcance y principios
Módulo de control y auditoría operativa para cadenas de sucursales con dueño no presente. Se integra a PODIX como su primer origen de datos, pero no vive dentro de PODIX.
Contexto del primer cliente. Siete sucursales, almacén central (Centenario) a dos horas de la oficina, catálogo central de unas 2,000 claves con unas 100 activas por sucursal y pocas piezas por clave, menos de diez tickets diarios por tienda, cámaras ya instaladas, dos turnos con entrega de efectivo por foto de WhatsApp. Opera venta de producto y servicios de podología.
Los siete principios que gobiernan cada decisión de diseño. Si algún requerimiento de este documento contradice uno de estos, gana el principio:
- Captura a ciegas. Quien cuenta nunca ve lo que el sistema espera, ni antes ni después de capturar. Un control que muestra el esperado se convierte en transcripción.
- Separación de funciones. Quien detecta no investiga, quien investiga no autoriza el ajuste. Nadie cuadra un saldo por su cuenta.
- Inmutabilidad. Nada de lo capturado se edita ni se borra. Las correcciones son registros nuevos que referencian el anterior.
- El sistema no acusa. Acota la ventana de tiempo y los usuarios con acceso. Determinar responsabilidad es del cliente, no del software.
- Carga operativa acotada por diseño. Topes duros en el sistema, no recomendaciones. Un control que toma demasiado tiempo se captura de mentiras, y eso es peor que no tenerlo: genera evidencia falsa.
- Hora del servidor. Toda marca temporal la pone el servidor. El reloj del dispositivo no es confiable.
- Desacoplamiento. PODIX es un origen de ventas y catálogo, intercambiable. El módulo debe poder recibir esos datos de otro punto de venta sin tocar su núcleo.
Fuera de alcance en esta versión. Reconocimiento de productos por visión artificial; integración con nómina para descuentos; integración directa con DVR de cámaras (la primera versión solo registra fecha, hora y sucursal para que el usuario busque la grabación a mano); multi-tenant.
Stack. El vigente de RANNIX para PODIX, con dos condiciones propias: esquema o base de datos separada del esquema de PODIX, y la capa móvil como PWA independiente del front de escritorio.
## Arquitectura e integración con PODIX
Límite entre los dos sistemas. PODIX es la fuente de verdad del catálogo, del inventario y de las ventas. El módulo es la fuente de verdad de los conteos, los cierres, los casos y la evidencia. El módulo nunca escribe directo en las tablas de inventario de PODIX: solicita el ajuste y PODIX lo aplica. Así el inventario tiene un solo dolor de cabeza y el módulo no puede corromperlo.
Esquema separado. Tablas del módulo con prefijo ctl_ en su propio esquema. Las referencias a PODIX se guardan por id, sin llaves foráneas duras entre esquemas, para que el módulo pueda apuntar a otro origen mañana.
### Lo que el módulo lee de PODIX
Qué
Cómo
Para qué
Catálogo de productos
Vista v_ctl_productos: id, código de barras, descripción, precio vigente, fecha del último cambio de precio, costo, requiere serie, requiere sello
Validar escaneos y precio de etiqueta
Saldo de inventario por sucursal
Vista v_ctl_saldos: producto, sucursal, cantidad, fecha de último movimiento
Calcular diferencias al cerrar un conteo
Movimientos de inventario
Vista v_ctl_movimientos: tipo, producto, sucursal, cantidad, fecha, usuario, documento
Mostrar el contexto de una diferencia: distinguir robo de error de captura
Ventas y tickets
Vista v_ctl_ventas: ticket, sucursal, caja, usuario, fecha y hora, forma de pago, líneas con producto, cantidad, precio cobrado, descuento y motivo
Cuadre de efectivo, ventas bajo catálogo, conteo de servicios
Cancelaciones y devoluciones
Vista v_ctl_cancelaciones: ticket original, fecha, usuario, autorizador, motivo
Cruce con faltantes posteriores
Sucursales, usuarios y turnos
Vistas v_ctl_sucursales, v_ctl_usuarios, v_ctl_turnos
Contexto de todo lo demás
Todas son vistas de solo lectura. Si mañana el origen es otro punto de venta, se reimplementan las vistas y el módulo no cambia. Esa es toda la estrategia de desacoplamiento, y es suficiente.
### Lo que el módulo le pide a PODIX
Un solo punto de escritura, un endpoint con transacción:
POST /podix/inventario/ajuste
{  &quot;origen&quot;: &quot;ctl&quot;,  &quot;folio_caso&quot;: &quot;CAS-2026-00412&quot;,  &quot;sucursal_id&quot;: 3,  &quot;producto_id&quot;: 1187,  &quot;cantidad_delta&quot;: -2,  &quot;tipo&quot;: &quot;ajuste_por_auditoria&quot;,  &quot;causa&quot;: &quot;robo&quot;,  &quot;autorizado_por&quot;: 7,  &quot;autorizado_en&quot;: &quot;2026-12-14T19:22:10Z&quot;}
PODIX valida, aplica el movimiento, y devuelve el id del movimiento creado, que el módulo guarda en el caso. Idempotente por folio_caso: un reintento no duplica el ajuste. Si PODIX rechaza, el caso queda en ajuste_fallido con el mensaje, visible en el tablero — nunca se pierde en silencio.
### Lo que PODIX debe cambiar para que esto funcione
Son tres cambios en PODIX mismo, no en el módulo, y son prerrequisito:
- Precio no editable en caja. Quitar el campo de precio libre y el producto genérico con precio abierto. Los descuentos pasan a un catálogo cerrado de motivos con tope porcentual y clave de supervisor sobre el tope. Cada descuento guarda usuario, motivo, autorizador y monto.
- Cancelaciones con bloqueo. La cancelación deja de ser inmediata: emite un evento que el módulo atiende y PODIX espera su confirmación antes de devolver la pieza al inventario.
- Apertura de cajón registrada. Cada pulso al cajón que no venga de un ticket se guarda con usuario y hora.
### Eventos de PODIX hacia el módulo
Cola de eventos (o tabla ctl_eventos_entrada con poleo cada 30 segundos si no hay broker). Eventos: venta_registrada, cancelacion_solicitada, devolucion_solicitada, cajon_abierto_sin_venta, precio_modificado_en_catalogo, turno_abierto, turno_cerrado, recepcion_registrada.
cancelacion_solicitada es el único síncrono: PODIX la deja pendiente hasta que el módulo responde autorizada o rechazada. Con un tiempo de espera de 60 segundos y, al vencer, PODIX la deja en pendiente_de_validacion sin devolver la pieza al inventario, y alerta. Nunca se resuelve sola a favor de la cancelación.
## Modelo de datos
Todas las tablas llevan creado_en (hora de servidor), creado_por y, donde aplique, sucursal_id. Ninguna tabla de captura tiene UPDATE ni DELETE habilitado por la aplicación: las correcciones son filas nuevas.
### Conteos y auditoría
ctl_sesion_conteo — una sesión de conteo o auditoría. id, folio, sucursal_id, tipo (conteo_inicial | conteo_apertura | auditoria_puntual | auditoria_remota | relevo_turno), modo_lista (completa | custodia | aleatoria | libre), estado (abierta | cerrada | expirada | cancelada), solicitada_por (nulo si la inició la sucursal), solicitada_en, limite_en, abierta_en, cerrada_en, usuario_captura, turno_id, total_partidas, partidas_con_diferencia, valor_diferencia.
ctl_partida_conteo — una línea escaneada. Es el corazón del módulo. id, sesion_id, producto_id, codigo_escaneado, cantidad_fisica, saldo_sistema (congelado al momento del escaneo), diferencia_piezas, costo_unitario, diferencia_valor, precio_etiqueta (nulo si no se capturó), precio_catalogo, diferencia_precio, clasificacion_precio (coincide | etiqueta_anterior | etiqueta_mal_puesta | revisar), numero_serie, folio_sello, sello_intacto, nota, escaneado_en, caso_id.
ctl_lista_solicitada — qué se pidió contar en una sesión, para saber qué quedó sin reportar. sesion_id, producto_id, reportado (bool), orden.
### Cierres
ctl_punto_control — catálogo configurable de puntos del checklist. id, nombre, tipo_captura (numero | denominaciones | conteo_piezas | solo_foto | numero_y_foto), obligatorio, aplica_turno, aplica_dia, aplica_semanal, sucursales (nulo = todas), formula_esperado (clave del cálculo contra el que cuadra, nula si es solo evidencia), tolerancia, activo, version, vigente_desde, vigente_hasta.
ctl_cierre — un cierre de turno, de día, de apertura o semanal. id, folio, sucursal_id, tipo (apertura | turno | dia | semanal), turno_id, usuario_cierra, usuario_recibe, estado (en_captura | cerrado | entrega_no_aceptada), version_checklist, abierto_en, cerrado_en, aceptado_en.
ctl_cierre_captura — el valor capturado en cada punto. id, cierre_id, punto_control_id, valor_capturado, valor_esperado (calculado al cerrar, nunca mostrado antes), diferencia, dentro_tolerancia, capturado_en, caso_id.
ctl_denominacion — desglose del efectivo. cierre_captura_id, denominacion, cantidad.
### Evidencia
ctl_evidencia — toda foto del módulo, apuntando a su origen. id, tipo_origen (cierre_captura | partida_conteo | caso | cancelacion | recepcion | toma_fija), origen_id, url_almacenamiento, hash_sha256, bytes, ancho, alto, capturado_en (hora de servidor), usuario_id, sucursal_id, toma_fija_id.
ctl_toma_fija — las posiciones de cámara configuradas por sucursal. id, sucursal_id, nombre, aplica (cierre_apertura | semanal | ambos), evidencia_referencia_id, activa.
El hash_sha256 sirve para detectar que alguien subió dos veces la misma foto. Si el hash de la foto de hoy es idéntico al de ayer, es la misma imagen: alerta automática.
### Casos
ctl_caso id, folio, sucursal_id, tipo (diferencia_inventario | diferencia_efectivo | diferencia_precio | diferencia_kits | diferencia_relevo | sello_roto | folio_faltante | servicio_sin_cobro), origen_tipo, origen_id, producto_id, cantidad, valor, estado (abierta | en_investigacion | cerrada_con_ajuste | cerrada_sin_ajuste | rechazada | ajuste_fallido), asignado_a, fecha_compromiso, causa_id, responsable_costo (empresa | proveedor | empleado | seguro), monto_costo, nota_cierre, turno_saliente_id, turno_entrante_id, autorizado_por, autorizado_en, movimiento_podix_id, abierto_en, cerrado_en.
ctl_causa — catálogo cerrado, administrable. id, nombre, requiere_nota, activo. Valores iniciales: robo, merma o producto dañado, error de captura en venta, entrada de mercancía no registrada, traspaso no registrado, error en el conteo, otra.
ctl_caso_bitacora — solo inserciones, nunca edición. id, caso_id, usuario_id, tipo (comentario | cambio_estado | asignacion | evidencia), texto, estado_anterior, estado_nuevo, creado_en.
### Custodia y contingencia
ctl_producto_custodia — qué se cuenta en cada relevo. sucursal_id, producto_id, activo. Tope duro de 30 filas activas por sucursal, validado en base de datos.
ctl_sello — sellos VOID con folio. id, folio_sello, producto_id, numero_serie, sucursal_id, estado (vigente | reemplazado | roto_sin_registro), colocado_por, colocado_en, sello_anterior_id, motivo_reapertura.
ctl_talonario — id, sucursal_id, folio_inicial, folio_final, entregado_a, entregado_en, estado (activo | consumido | cancelado).
ctl_ticket_manual — id, talonario_id, folio, sucursal_id, monto, fecha_venta, capturado_por, capturado_en, evidencia_id, estado (capturado | cancelado | faltante).
ctl_caida_sistema — id, sucursal_id, inicio_en, fin_en, tickets_manuales, detectada_por (automatica | manual).
### Servicios
ctl_atencion — id, sucursal_id, paciente_ref (identificador opaco, no datos clínicos), servicio_id, usuario_atiende, inicio_en, fin_en, estado (abierta | cerrada_con_ticket | cancelada), ticket_id, motivo_cancelacion, autorizado_por.
ctl_consumo_esperado — servicio_id, insumo_producto_id, cantidad. Base del cuadre de insumos.
ctl_ocupacion — para la fase de sensores. id, sucursal_id, puesto_id, inicio_en, fin_en, duracion_min, fuente (sensor_peso | radar | manual).
## Roles y separación de funciones
Rol
Captura conteos
Ve diferencias
Investiga casos
Autoriza ajustes
Configura
Cajero
No
No
No
No
No
Encargado de sucursal
Sí (su sucursal)
No
No
No
No
Supervisor
Sí (sus sucursales)
Sí (sus sucursales)
Sí
No
No
Dueño
Sí
Sí (todas)
Sí
Sí
Sí
Administrador RANNIX
No
Sí (soporte)
No
No
Sí
Reglas duras, validadas en el servidor y no solo en la interfaz. Son el núcleo del valor del módulo; si se relajan, el sistema deja de ser un control:
- El usuario que capturó una partida no puede autorizar el ajuste de su propio caso. Validación: ctl_caso.autorizado_por &lt;&gt; origen.usuario_captura.
- El usuario que investigó un caso no puede autorizarlo, salvo que sea dueño. En una operación de siete tiendas con dos dueños, exigir tres personas distintas es irreal; dos sí.
- Ningún rol puede escribir directo en el saldo de inventario. El único camino es un caso autorizado.
- El encargado de sucursal nunca ve el saldo del sistema ni la diferencia, en ninguna pantalla del módulo. Esta es la que más fácil se rompe al agregar una pantalla nueva: cualquier vista nueva para ese rol debe revisarse contra esta regla.
- El rol de soporte de RANNIX puede leer para diagnosticar pero no capturar ni autorizar, y sus consultas quedan en bitácora.
Sesión en el móvil. Usuario y PIN de cuatro a seis dígitos, sesión ligada al turno y caducidad al cerrarlo. El PIN es una concesión deliberada: en un mostrador compartido, una contraseña larga lleva a dejar abierta la sesión de una sola persona todo el día, y eso destruye la trazabilidad de todo lo demás. Para autorizar ajustes, en cambio, se exige contraseña completa, no PIN.
## Configuración
Todo parámetro es por sucursal, con valor global por omisión. Los cambios quedan versionados: un cierre de agosto se consulta con la configuración vigente en agosto, no con la de hoy.
Parámetro
Omisión
Tope del sistema
Frecuencia del conteo completo
diario a la apertura
—
Piezas en custodia por relevo
lista vacía
30 filas activas, validado en base de datos
Tamaño de muestra aleatoria
20
100
Tolerancia de efectivo
±$20
—
Tolerancia de kits y piezas
0
no configurable a mayor que 0 sin confirmación del dueño
Tolerancia de precio de etiqueta
$0
—
Tope de descuento sin clave
0%
15%
Días de gracia por cambio de precio
30
90
Retención de fotos
90 días
365
Lado largo de la foto
1,600 px
2,400 px
Tiempo límite de auditoría remota
120 min
—
Duración mínima de ocupación contada
5 min
—
Los topes no son sugerencias: se validan en el servidor. El de 30 piezas en custodia es el más importante de todos. Si el cliente pide subirlo a 200, el relevo pasa de dos minutos a veinte, y en tres semanas lo van a capturar sin contar — generando evidencia falsa, que es peor que no tener control. El sistema debe negarse, y la negativa debe explicar por qué.
Catálogos administrables por el dueño: puntos de control del checklist, causas de diferencia, motivos de descuento, motivos de cancelación, tomas fijas por sucursal, productos en custodia, consumo esperado de insumos por servicio.
Días de gracia por cambio de precio. Si el precio de catálogo cambió después de que la pieza se etiquetó, la diferencia de precio es normal. El módulo compara precio_etiqueta contra el precio vigente y, si fecha_ultimo_cambio_precio cae dentro de la ventana de gracia, clasifica automáticamente como etiqueta_anterior sin abrir caso. Sin esta regla, cada aumento de precio llena el reporte de alertas falsas y los dueños dejan de abrirlo — que es la forma típica en que muere un reporte de control.
## F1 — Controles de caja y precio
Es el grupo que más dinero recupera y el que menos hábito nuevo exige. La mayor parte vive en PODIX; el módulo aporta la validación y el reporte.
### F1.1 Precio no editable
En PODIX: el precio de venta se toma del catálogo y el campo no es editable por el cajero. Se elimina el producto genérico con precio abierto — es la puerta trasera de todo punto de venta. Los descuentos van por catálogo cerrado de motivos, con tope porcentual configurable; por encima del tope se exige clave de supervisor, que queda registrada en el ticket.
### F1.2 Reporte de ventas por debajo de catálogo
Columnas: ticket, fecha y hora, sucursal, caja, cajero, producto, precio de catálogo vigente al momento de la venta, precio cobrado, diferencia en pesos, motivo de descuento, autorizador. Totales por cajero y por sucursal en el periodo. Con menos de diez tickets diarios por tienda, los dueños pueden revisarlo renglón por renglón.
Este reporte es el único que detecta el patrón de cobrar 140 por una pieza de 1,140: cuando el cajero edita el precio, el inventario cuadra perfecto — salió una pieza, se descontó una pieza — y ninguna auditoría de cantidades lo ve.
### F1.3 Cancelaciones y devoluciones
Flujo, y los cuatro requisitos son todos obligatorios:
- PODIX emite cancelacion_solicitada y deja la cancelación pendiente, sin devolver la pieza al inventario.
- El módulo exige, en el móvil: escanear la pieza devuelta; foto de la pieza ya de regreso en el estante, tomada en vivo; clave de supervisor; motivo de catálogo cerrado.
- Si el código escaneado no corresponde al producto del ticket, se rechaza. Sin pieza presente no hay cancelación.
- El módulo responde autorizada y PODIX devuelve la pieza al inventario; o rechazada y la venta queda firme.
Al vencer los 60 segundos sin respuesta, PODIX deja la cancelación en pendiente_de_validacion y alerta. Nunca se resuelve sola a favor de cancelar.
Alerta inmediata al dueño en cada cancelación autorizada. Con este volumen de operación, las cancelaciones son pocas y cada una se vuelve un evento revisable una por una.
### F1.4 Cruce de cancelación con faltante posterior
Al cerrar cualquier conteo, si un producto con cancelación en los últimos N días (configurable, 7 por omisión) aparece faltante, el caso se crea con la cancelación ligada: folio, usuario que canceló, autorizador y fecha.
Con cuatro o cinco piezas por clave, este cruce es definitivo: si el sistema devolvió la pieza al inventario y el conteo no la encuentra, la cancelación fue falsa.
### F1.5 Apertura de cajón sin venta
Cada pulso al cajón sin ticket asociado se registra con usuario, fecha, hora y motivo opcional. Reporte de aperturas sin venta por cajero y por sucursal, con comparativo entre tiendas.
### F1.6 Mezcla de formas de pago
Reporte de proporción efectivo contra tarjeta, por sucursal y por cajero, con el promedio de la cadena como referencia. Una tienda que cobra en efectivo una proporción muy distinta a las demás es señal: el efectivo es lo único desviable.
Este reporte no prueba nada por sí solo — el perfil de clientela varía entre zonas — y debe presentarse como indicador para investigar, no como hallazgo.
## F2 — Conteos, auditoría y custodia
Un solo motor de conteo con cinco modos. Es el mismo código: lo que cambia es quién inicia la sesión, qué lista se presenta y qué se hace al cerrar.
Modo
Quién inicia
Lista
Efecto al cerrar
conteo_inicial
Dueño o supervisor
Completa
Fija el saldo de arranque; no genera casos
conteo_apertura
Quien abre la sucursal
Completa (~100 claves)
Genera casos por cada diferencia
relevo_turno
Quien entra al turno
Custodia (≤ 30)
Genera casos tipo diferencia_relevo y transfiere custodia
auditoria_puntual
Supervisor o dueño en sitio
Aleatoria o libre
Genera casos
auditoria_remota
Dueño desde la oficina
Aleatoria, con tiempo límite
Genera casos; registra tiempo de respuesta
### F2.1 Captura de una partida
Tres datos por producto: código escaneado, cantidad física, precio de etiqueta (si el punto lo pide). En productos con requiere_serie, además el número de serie; con requiere_sello, el folio del sello y si está intacto.
Al guardar, el servidor congela saldo_sistema en ese instante y calcula la diferencia. No la devuelve al dispositivo. La respuesta al móvil es solo ok y el siguiente producto de la lista. El usuario avanza sin ver nada.
La única excepción es el modo auditoria_puntual cuando lo ejecuta un supervisor o dueño: ahí sí se muestra la diferencia al instante, porque el valor del control es la conversación inmediata con el encargado, y quien la ve no es quien responde por el faltante.
### F2.2 Lista aleatoria ponderada
Selección del servidor, nunca del usuario. Ponderación por: costo unitario, rotación de los últimos 30 días, y número de diferencias previas del producto en esa sucursal (el peso más alto). Se excluyen productos ya contados en las últimas 24 horas en la misma sucursal, salvo que la sesión lo pida explícitamente.
La lista se guarda en ctl_lista_solicitada antes de mostrarse, para poder medir qué quedó sin reportar. El silencio es dato: un producto que la lista pidió y nadie reportó merece el mismo reporte que una diferencia.
### F2.3 Auditoría remota
El dueño selecciona sucursales — con la opción todas a la vez como valor por omisión — fija el tamaño de muestra y el tiempo límite, y lanza. Lanzar de una en una permite que las tiendas se presten mercancía, así que la interfaz debe hacer de &quot;todas&quot; el camino fácil y de &quot;una sola&quot; la excepción.
Notificación push a los dispositivos de las sucursales. El dueño ve el avance en vivo: sucursales que abrieron la sesión, partidas capturadas, tiempo transcurrido. Al vencer el límite, la sesión pasa a expirada y se cierra con lo capturado; lo faltante queda como no reportado.
### F2.4 Relevo de turno
- El saliente cierra su turno (F3).
- El entrante cuenta a ciegas las piezas en custodia y captura.
- El servidor compara. Si cuadra, el entrante acepta con su PIN y la custodia se transfiere. Si no cuadra, se muestra la diferencia a ambos, se abre caso diferencia_relevo con los dos turnos y las dos firmas, y se alerta al dueño.
- El entrante no puede registrar ventas hasta aceptar la entrega.
Si el saliente se va sin que el entrante acepte, el turno queda entrega_no_aceptada y aparece en el tablero. Sin esta regla el esquema degenera en que el saliente capture solo y nadie verifique — que es exactamente el &quot;ya recibí&quot; por WhatsApp que el módulo viene a sustituir.
### F2.5 Detección de sustitución de código
Al cerrar una sesión, buscar pares dentro de la misma sesión y sucursal donde un producto con costo alto sale faltante y otro con costo bajo sale sobrante, en cantidades compatibles. Umbral configurable de relación de costo (3 a 1 por omisión).
Se marca como alerta de posible sustitución de código, con los dos productos ligados en un mismo caso. Es la firma del cobro de un producto barato por uno caro, y ningún reporte convencional la detecta, porque cada diferencia por separado parece un error menor.
### F2.6 Validación de precio de etiqueta
Se compara precio_etiqueta contra el precio vigente. Si coincide, verde y sigue. Si no, el auditor clasifica en el momento: etiqueta_anterior, etiqueta_mal_puesta o revisar. Solo revisar abre caso. La clasificación automática por ventana de gracia está en la sección de configuración.
El reporte importante es el de etiquetas por debajo del catálogo: una pieza de 600 etiquetada en 400 es una fuga de margen que ninguna auditoría de cantidades detecta, porque el conteo cuadra perfecto.
## F3 — Cierre de turno y de día
El cierre no es una pantalla fija: es el recorrido de los puntos de control activos. Agregar un control nuevo es configuración, no desarrollo. Esto es tanto una decisión técnica como un argumento de venta: los controles los define el cliente, no el proveedor.
### F3.1 Recorrido
Al abrir el cierre, el servidor resuelve los puntos activos para esa sucursal y ese tipo de cierre, y devuelve la lista ordenada — sin valores esperados. El móvil presenta un punto por pantalla con barra de avance. No se puede cerrar sin completar los obligatorios. Guardado parcial: si la app se cierra a medias, retoma donde iba.
### F3.2 Tipos de captura
Tipo
Qué captura
Cómo cuadra
denominaciones
Cantidad por denominación; el sistema suma
Fondo inicial + ventas en efectivo − retiros
conteo_piezas
Cantidad de piezas que quedan
Existencia anterior + recibido − quedan = usados, contra servicios cobrados
numero
Un valor
Según formula_esperado (ej. total del terminal contra ventas con tarjeta)
numero_y_foto
Valor más foto en vivo
Igual que numero
solo_foto
Evidencia
No cuadra; queda en el expediente
En denominaciones no existe campo de total: el total es la suma del desglose. Escribir un total a mano permite cuadrarlo sin contar.
### F3.3 Entrega de turno con doble firma
Quien entrega confirma el monto con su usuario. Quien recibe confirma el mismo monto con el suyo, después de contar, antes de empezar a vender. El fondo inicial del turno siguiente es ese monto confirmado, nunca uno teclado después.
Esto formaliza lo que el cliente ya hace: extender el efectivo, fotografiarlo y mandarlo por WhatsApp. Misma rutina, ahora con responsable, hora y cuadre automático, y sin que la evidencia viva en un chat que nadie audita.
### F3.4 Cuadre de kits de servicio
El punto de control de tipo conteo_piezas sobre el producto-insumo calcula los kits usados en el turno y los compara contra los tickets de servicio del mismo turno y sucursal.
Doce kits usados y diez tickets son dos servicios sin cobro, detectados esa misma noche. Este es el cruce más sólido de todo el módulo para servicios: el insumo sí se descuenta del inventario, así que para esconder un servicio habría que robar también el insumo.
### F3.5 Par cierre / apertura con tomas fijas
Tomas configuradas por sucursal (se recomienda arrancar con una o dos: mostrador y escritorio). Al capturar, el visor muestra la foto anterior como fantasma semitransparente para alinear el encuadre. Sin esa guía, cada toma sale de un ángulo distinto y la comparación no sirve.
El servidor empareja el cierre de ayer con la apertura de hoy y presenta antes/después con deslizador.
Alertas: apertura sin foto de cierre previa o al revés; foto de apertura tomada después de la primera venta del día; hash idéntico a una foto anterior.
El valor de este control no es detectar, es acotar: reduce la ventana de un mes a una noche y de siete personas a dos, quien cerró y quien abrió. Y su efecto principal es disuasivo.
### F3.6 Al cerrar
El servidor calcula los esperados, genera el corte y abre un caso por cada punto fuera de tolerancia. El corte muestra, solo a dueño y supervisor: efectivo esperado contra contado, tarjeta esperada contra terminal, kits usados contra servicios cobrados, número de tickets, cancelaciones del turno, aperturas de cajón sin venta, y ventas por debajo de catálogo.
## F4 — Casos de diferencia
Toda diferencia se vuelve un caso con folio. Mientras el caso esté abierto, el inventario no se mueve. El conteo detecta; el ajuste es un acto separado y autorizado.
### F4.1 Ciclo de vida
abierta → en_investigacion → cerrada_con_ajuste | cerrada_sin_ajuste | rechazada
Mas ajuste_fallido cuando PODIX rechaza el ajuste: visible en el tablero, reintentable, nunca perdido en silencio.
### F4.2 Apertura automática
El caso se genera al cerrar la sesión o el cierre que lo originó, heredando producto, sucursal, cantidades, usuario de captura, turno y fecha. Nunca se captura un caso a mano: siempre nace de una captura.
### F4.3 Investigación
Bitácora de solo inserciones. Nada se borra ni se edita. Se puede adjuntar evidencia (foto de remisión, nota de compra) y asignar responsable con fecha compromiso.
La pantalla de detalle debe mostrar, junto a la diferencia, los últimos movimientos de inventario de ese producto en esa sucursal desde el conteo anterior: entradas de mercancía, traspasos, ventas y cancelaciones. Es lo que distingue un robo de un error de captura, y es la diferencia entre un sistema que acusa y uno que informa. Sin este contexto, alguien va a ser acusado por una entrada que nunca se registró.
### F4.4 Cierre
Tres datos obligatorios:
- Causa, de catálogo cerrado. El catálogo cerrado es lo que luego permite medir: con texto libre nunca se sabrá si el problema real de la cadena es robo o captura.
- Quién absorbe el costo: empresa, proveedor, empleado o seguro, con monto al costo y nota.
- Autorización del ajuste, por un usuario distinto del que capturó. Al autorizar, el módulo llama a PODIX y guarda el id del movimiento resultante.
Si se cierra sin ajuste — apareció la pieza, era error de conteo — se registra la resolución y el saldo no se toca.
Sobre el campo de empleado. Se documenta en el código y en la interfaz como registro de control interno, no como instrucción de descuento a nómina: la Ley Federal del Trabajo restringe fuertemente los descuentos al salario y un faltante de inventario no basta para justificar uno. El módulo no debe tener integración con nómina en esta versión, ni un botón que la sugiera.
### F4.5 Reportes de seguimiento
- Casos abiertos por sucursal y antigüedad en días, para que no se queden sin resolver.
- Distribución de causas por sucursal y periodo. Esta es la gráfica que de verdad dice dónde está el problema.
- Monto absorbido por la empresa en el periodo.
- Recurrencia por turno y por usuario: la misma persona apareciendo del lado saliente en varias diferencias de relevo. Este reporte se presenta como indicador para investigar, con los movimientos de contexto a la vista — nunca como conclusión.
## F5 — Recepción, sellos, talonarios y servicios
### F5.1 Recepción con responsiva
Cierra el hueco del &quot;venía la caja vacía&quot;. Quien recibe, en el móvil: escanea cada pieza, verifica el contenido (abrir, o verificar sello intacto), y confirma con usuario y PIN. Desde ese momento la pieza queda bajo su responsabilidad con fecha, hora y usuario. Esto sustituye el &quot;ya recibí&quot; por WhatsApp.
En el piloto, aplicar solo a productos caros y en caja. Exigir recepción pieza por pieza para 2,000 claves garantiza que en dos semanas lo dejen de usar. La bandera requiere_sello del catálogo es la que decide.
### F5.2 Sellos VOID con folio
Campos de catálogo: requiere_sello, peso_caja_llena. El folio del sello se liga a la pieza y, donde aplique, al número de serie.
Reapertura: si hay que abrir una caja para mostrarla a un cliente, se registra pieza, motivo, usuario y nuevo folio de sello. Un sello roto sin registro de reapertura es alerta automática.
El peso_caja_llena permite verificar con báscula sin abrir: una caja vacía se detecta en dos segundos.
### F5.3 Piezas de alto valor
numero_serie obligatorio por pieza, no por modelo. Se incluyen en la lista de custodia del relevo. Su venta dispara alerta inmediata al dueño: qué pieza, qué serie, qué sucursal, a qué precio.
### F5.4 Talonarios de contingencia
La prioridad es que el papel casi nunca se use: la PWA debe operar sin conexión y sincronizar después. Cada caída se registra con hora de inicio y fin, y se compara la venta de ese periodo contra el promedio de la tienda. Una sucursal que &quot;se cae&quot; seguido y justo vende menos en esos ratos es una alerta en sí misma.
Alta de talonarios por la oficina central: folio inicial, final, sucursal, fecha de entrega, quien recibió. Tickets con copia al carbón, para que ningún folio desaparezca sin rastro.
Captura de tickets manuales con folio, productos, monto y foto del papel. El servidor valida que el folio caiga dentro de un rango activo de esa sucursal.
Auditoría del talonario: durante la visita se registra el siguiente folio en blanco, con foto. El servidor valida la continuidad: si va en el 25, los folios 1 al 24 deben estar todos capturados, como venta o como cancelado. Cualquier folio faltante o saltado abre caso.
### F5.5 Control de servicios
Tres amarres independientes; ninguno sustituye a los otros.
Expediente ligado a cobro. Toda atención abre registro: paciente (referencia opaca), quien atiende, sucursal, servicio, hora de inicio y cierre. La atención no se cierra sin ticket; cancelarla exige motivo y clave de supervisor. Reporte de atenciones sin cobro por sucursal y por persona.
Para el piloto, el expediente guarda solo tipo de servicio y hora, sin nota clínica. Con nota clínica el módulo pasa a tratar datos sensibles de salud y arrastra todo el régimen de la LFPDPPP; sin ella, el control de cobro funciona igual. Es una decisión de alcance, no un detalle de implementación.
Cuadre de insumos. ctl_consumo_esperado define el consumo teórico por servicio. El módulo compara consumo real de inventario contra consumo teórico según servicios cobrados, por periodo y sucursal. Es el amarre más sólido, y el que se lleva al cierre diario en F3.4.
Ocupación del puesto de atención (fase posterior). Evento con inicio, fin y duración, por sucursal y puesto. Cruce diario: ocupaciones contra tickets de servicio. Doce ocupaciones y ocho tickets son cuatro cobros faltantes, con horas exactas.
Sobre el sensor: contar cruces de puerta no sirve, porque el podólogo entra y sale varias veces. Hay que medir ocupación del sillón. La opción recomendada son celdas de carga bajo el sillón con un ESP32 — señal inequívoca, unos 15 a 20 dólares en partes, no graba nada y no tiene implicaciones de privacidad. Un radar mmWave multizona es más elegante pero en una cabina chica con dos personas pelea con la calibración. Una cámara apuntada al sillón queda descartada: un paciente descalzo recibiendo un procedimiento, grabado, no vale el riesgo cuando un sensor da el mismo dato.
Esta fase se deja para después del piloto: el cuadre de insumos no requiere hardware y rinde más.
## F6 — App móvil (PWA)
PWA instalable, no app de tienda. Se agrega a la pantalla de inicio desde el navegador, se actualiza sola y no pasa por App Store ni Play Store — en un piloto, esperar revisiones de tienda mata el calendario. Mismo código para Android y iPhone.
Cuatro pantallas, y solo estas cuatro: cierre (recorre el checklist), auditoría (escaneo), recepción, y mis pendientes (auditorías remotas solicitadas). Consultas, reportes y autorizaciones de ajuste viven en escritorio. El móvil es para capturar de pie en el piso, no para administrar.
### F6.1 Diseño de captura
Una tarea por pantalla, botones grandes, operable con una mano. Teclado numérico nativo para cantidades. Avance lineal con barra de progreso. Guardado parcial con retoma.
### F6.2 Cámara
Captura en vivo con capture=&quot;environment&quot;. Sin acceso a galería: si puede subir de galería, puede subir la foto de ayer. Compresión en el dispositivo antes de subir, lado largo 1,600 px por omisión. El sello de fecha, hora, usuario y sucursal lo pone el servidor, nunca el reloj del teléfono. Se calcula hash_sha256 para detectar imágenes repetidas.
### F6.3 Escaneo
BarcodeDetector donde exista, librería JS como respaldo. Soporte para lector Bluetooth emparejado (llega como entrada de teclado, así que el campo debe aceptar ambos caminos).
Dos límites reales que conviene tener presentes:
- En iPhone no hay BarcodeDetector, así que el escaneo va por librería JS: funciona, pero es notablemente más lento por pieza.
- Para el conteo completo de ~100 claves diarias, la cámara de cualquier teléfono es tortuosa. Con lector Bluetooth el escaneo baja de segundos a décimas. El lector no es un accesorio opcional: es lo que hace viable el conteo diario.
### F6.4 Sin conexión
Captura local en IndexedDB con cola de envío que sincroniza al volver la señal. El cierre debe poder completarse sin internet.
En iPhone la PWA no tiene sincronización en segundo plano, así que la cola sube solo con la app abierta. Hay que avisarlo en pantalla de forma explícita: &quot;3 capturas pendientes de enviar, mantén la app abierta un momento&quot;. Sin ese aviso, el usuario cree que subió y no subió.
Idempotencia: cada captura lleva un id generado en el cliente, para que un reenvío no duplique.
### F6.5 Dispositivos
Un Android de gama baja dedicado por sucursal más lector Bluetooth cuesta unos 3,000 pesos por tienda, y evita la mitad de los problemas de soporte: Android viejos, memoria llena, permisos de cámara negados, y la resistencia natural a usar el teléfono y los datos personales para el trabajo.
Queda por confirmar con el cliente si ya hay teléfono de la oficina en cada sucursal o si la encargada reporta desde el suyo.
## F7 — Reportes, tableros y alertas
### F7.1 Consulta de diferencias
Pantalla principal para el dueño. Filtros: rango de fechas, sucursal (una, varias o todas), auditor, producto o categoría, tipo de diferencia (faltantes, sobrantes o ambas), y umbral mínimo en piezas o en pesos — el umbral importa, porque sin él el ruido de las diferencias chicas tapa lo importante.
Columnas: fecha y hora, sucursal, producto, física, sistema, diferencia en piezas, diferencia valorizada al costo, auditor, estado del ajuste, nota.
Orden por omisión: mayor diferencia valorizada primero, no lo más reciente. Lo primero que el dueño debe ver es lo que más dinero representa.
Encabezado con totales del periodo filtrado: faltantes y sobrantes en piezas y en pesos al costo, más el conteo de casos pendientes de ajuste.
Agrupaciones: por sucursal (ranking por faltante valorizado), por producto (recurrencia), por auditor (número de auditorías hechas — también sirve para ver quién sí está auditando).
Exportación a Excel y PDF respetando los filtros.
### F7.2 Tablero de dueño
Una sola pantalla que responda &quot;¿cómo van mis tiendas hoy?&quot;: cierres del día y cuáles faltan, sucursales sin conteo de apertura, casos abiertos por antigüedad, diferencia valorizada del periodo con su tendencia, alertas sin atender, y turnos con entrega no aceptada.
### F7.3 Alertas
Evento
Canal
Destinatario
Cancelación autorizada
Push y WhatsApp
Dueños
Venta de pieza de alto valor
Push y WhatsApp
Dueños
Diferencia en relevo de turno
Push
Dueños y supervisor
Cierre fuera de tolerancia
Push
Dueños y supervisor
Sello roto sin registro
Push
Supervisor
Folio de talonario faltante
Correo diario
Dueños
Sucursal sin cierre o sin conteo de apertura
Push, a hora configurada
Dueños
Alerta de posible sustitución de código
Push
Dueños
Kits usados sin ticket de servicio
Push al cierre
Dueños
Ajuste rechazado por PODIX
Push
Administrador
Regla de diseño de alertas: techo diario configurable por destinatario, con agrupación cuando se excede. Una alerta por cada diferencia chica convierte el canal en ruido y, a la tercera semana, el dueño silencia las notificaciones — y con eso se apaga todo el módulo. Mejor pocas alertas que importen y un resumen diario para lo demás.
### F7.4 Reporte mensual
Un PDF de dos páginas por mes, generado automáticamente: diferencia valorizada total y por sucursal con comparativo contra el mes anterior, distribución de causas, casos abiertos y cerrados, y los diez productos con más recurrencia.
Este reporte es también el artefacto comercial: es lo que el dueño enseña a su socio y lo que justifica la mensualidad mes con mes.
## Requisitos no funcionales
### Auditabilidad
Es el requisito que define el producto: si la evidencia se puede alterar, el módulo no sirve para nada de lo que promete.
- Tablas de captura sin UPDATE ni DELETE desde la aplicación. Revocar esos permisos al usuario de base de datos de la app, no solo omitirlos en el código.
- Toda marca temporal viene de now() del servidor. El cliente puede enviar su hora local, que se guarda aparte como referencia; una discrepancia mayor a cinco minutos se registra.
- Bitácora de cambios de configuración: quién, cuándo, valor anterior y nuevo.
- Bitácora de consultas a reportes de diferencias: quién consultó qué. También protege a RANNIX.
- Folios consecutivos sin huecos en casos, cierres y sesiones. Un hueco debe ser detectable.
### Seguridad
Cifrado en tránsito y en reposo. Fotos en almacenamiento privado con URLs firmadas de vida corta, nunca públicas. Control de acceso por rol validado en el servidor en cada petición, no solo en la interfaz. Límite de intentos de PIN con bloqueo temporal. Respaldos diarios con retención declarada y una prueba de restauración al trimestre — un respaldo que nunca se restauró no es un respaldo.
### Datos personales
El módulo trata datos de empleados del cliente (quién contó, a qué hora, fotos tomadas en la tienda). RANNIX es encargado del tratamiento, el cliente es responsable.
- Retención de fotos configurable, 90 días por omisión, con purga automática. Guardar imágenes indefinidamente es pasivo, no activo.
- Las fotos de evidencia no deben encuadrar deliberadamente a personas; es una indicación de capacitación, no una restricción técnica.
- El expediente de atención sin nota clínica en esta versión (ver F5.5).
- Exportación de los datos del cliente en formato abierto al terminar el contrato.
### Desempeño
Escaneo con lector Bluetooth: respuesta del servidor menor a 300 ms por partida, para que el ritmo de escaneo no se frene. Cierre de sesión de 100 partidas: menos de 3 segundos. Reporte de diferencias de 90 días y 7 sucursales: menos de 2 segundos. Subida de foto comprimida en 3G: menos de 5 segundos.
### Operación
Soporte en horario hábil — no prometer 24/7 con un equipo pequeño. Registro de errores con alerta al administrador. Tablero de salud: sucursales que no han sincronizado en más de N horas. Documento de instalación y de capacitación por rol, en una página cada uno.
## Criterios de aceptación
Casos de prueba que deben pasar antes de instalar en el cliente. Los ocho primeros son los que protegen el valor del módulo: si alguno falla, el sistema parece un control y no lo es.
#
Caso
Resultado esperado
1
Encargado abre cualquier pantalla del módulo buscando el saldo del sistema
En ninguna lo encuentra; la respuesta de la API tampoco lo trae
2
Usuario que capturó una partida intenta autorizar su propio caso
Rechazado por el servidor, con mensaje claro
3
Se intenta cancelar una venta sin escanear la pieza
Cancelación rechazada; la pieza no vuelve al inventario
4
Se intenta subir una foto desde la galería
No hay ruta para hacerlo en la interfaz ni en la API
5
Se cambia la fecha del teléfono y se captura
La marca temporal guardada es la del servidor; la discrepancia queda registrada
6
Se sube la misma foto dos días seguidos
Alerta por hash idéntico
7
Se intenta activar 31 productos en custodia en una sucursal
Rechazado en base de datos, con la explicación del tope
8
Se intenta un UPDATE directo sobre una partida de conteo con el usuario de la app
Permiso denegado
9
Cierre completo sin conexión, con la app cerrada y reabierta
Se completa y sincroniza al volver la señal, sin duplicar
10
Reenvío del mismo lote de capturas
No se duplica ninguna partida
11
Diferencia detectada, caso cerrado con causa y autorizado
PODIX aplica el ajuste; el caso guarda el id del movimiento
12
PODIX rechaza el ajuste
Caso en ajuste_fallido, visible y reintentable
13
Reintento del mismo ajuste por error de red
Idempotente: un solo movimiento en PODIX
14
Producto caro faltante y barato sobrante en la misma sesión
Alerta de posible sustitución de código, con los dos ligados
15
Cancelación y, dos días después, faltante del mismo producto
El caso nace con la cancelación ligada
16
Precio de catálogo cambiado ayer, etiqueta con el precio anterior
Clasificado automáticamente como etiqueta anterior; no abre caso
17
Auditoría remota lanzada a 7 sucursales que vence sin respuesta de una
Sesión expirada; la sucursal aparece como no reportada
18
Saliente cierra y se va sin que el entrante acepte
Turno en entrega_no_aceptada, visible en el tablero
19
Entrante intenta vender sin aceptar la entrega
Bloqueado
20
12 kits usados y 10 tickets de servicio en el turno
Alerta de dos servicios sin cobro esa misma noche
21
Folio 25 en blanco con el folio 18 sin capturar
Alerta de folio faltante
22
Se consulta un cierre de hace dos meses tras cambiar el checklist
Se muestra con la versión de checklist vigente entonces
23
Conteo de 100 claves con lector Bluetooth
Menos de 15 minutos y sin partidas perdidas
24
Caso abierto: se abre el detalle
Se ven los movimientos de inventario del producto desde el conteo anterior
Prueba de aceptación en campo, antes de cobrar la implementación: una sucursal completa un ciclo de 48 horas — conteo de apertura, dos relevos, cierre de día, un caso abierto, investigado, cerrado con causa y ajustado — sin intervención de RANNIX y sin consultar el manual más de dos veces. Si necesitan ayuda para cerrar un turno, el diseño de captura no está listo, por más que las 24 pruebas anteriores pasen.
## Orden de implementación
Para pasarle a Claude Code por etapas. Cada etapa debe quedar funcionando y probada antes de la siguiente.
Etapa 0 — cimientos. Esquema ctl_, las vistas de lectura sobre PODIX, el endpoint de ajuste con idempotencia, roles y permisos con las reglas duras validadas en el servidor, almacenamiento de fotos con URL firmada, y revocación de UPDATE/DELETE al usuario de la app. Aquí se decide la arquitectura; equivocarse aquí cuesta una reescritura.
Etapa 1 — los tres cambios en PODIX. Precio no editable con catálogo de descuentos, cancelación con evento y espera, registro de apertura de cajón. Son prerrequisito de todo lo demás y se pueden instalar en diciembre como parte del punto de venta.
Etapa 2 — motor de conteo. ctl_sesion_conteo y ctl_partida_conteo con los cinco modos, la regla de no devolver la diferencia, la lista aleatoria ponderada y el cierre de sesión con generación de casos.
Etapa 3 — casos. Ciclo de vida completo, bitácora de solo inserciones, cierre con causa y responsable, autorización separada, llamada a PODIX, y la pantalla de detalle con los movimientos de contexto.
Etapa 4 — checklist y cierres. Catálogo de puntos de control con versionado, motor de recorrido, los cinco tipos de captura, desglose por denominación, doble firma de relevo, y el cálculo de esperados al cerrar.
Etapa 5 — PWA. Las cuatro pantallas, cámara en vivo con compresión y hash, escaneo con los dos caminos, IndexedDB con cola idempotente, login por PIN.
Etapa 6 — reportes y alertas. Consulta de diferencias con filtros y umbral, tablero de dueño, alertas con techo diario, reporte mensual en PDF.
Etapa 7 — cadena de custodia. Recepción con responsiva, sellos con folio, piezas con serie, talonarios, tomas fijas y par cierre/apertura.
Etapa 8 — servicios. Expediente ligado a cobro sin nota clínica, consumo esperado por servicio, cuadre de insumos integrado al cierre.
Fuera de este plan, para después del piloto: sensores de ocupación, comparación de fotos asistida por IA, auditoría remota con muestreo para catálogos grandes, multi-tenant, conectores a puntos de venta de terceros.
### Indicaciones para quien escriba el código
- Las reglas duras de roles y la regla de captura a ciegas se prueban con pruebas automatizadas, no a mano. Son las que se rompen sin que nadie lo note al agregar una pantalla.
- Cada tope de configuración se valida en base de datos, no solo en la aplicación.
- Toda llamada a PODIX es idempotente por folio y registra petición y respuesta.
- Ninguna respuesta de API hacia un rol de sucursal debe incluir campos de saldo o diferencia, ni siquiera sin usarlos en la interfaz. Filtrar en el serializador, no en el front.
- Las fechas se guardan en UTC y se muestran en America/Mexico_City.
- Los montos en decimal, nunca en punto flotante.
- No construir integración con nómina ni con DVR de cámaras en esta versión.