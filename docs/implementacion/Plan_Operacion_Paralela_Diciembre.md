# Operación en paralelo — diciembre 2026
**Pie Clinic (Vanesa Leyva y Alejandro Hernández) · Pie Firme**

## 1. La idea

En diciembre el sistema se opera **en paralelo** con lo que hacen hoy:

- Las notas foliadas de papel y el resto del proceso actual **siguen siendo lo oficial**.
- Cada sucursal captura en el sistema lo mismo que hace en papel.
- **Al cerrar el día se comparan los totales**: sistema contra notas y contra lo que reportan hoy (corte de caja, Clip, fotos).
- Los dueños ven el consolidado de todas las sucursales. Cada sucursal ve solo la suya.
- Lo que no cuadra se investiga y se anota. Eso es lo que valida el sistema, y también lo que justifica seguir.

El paralelo prueba tres cosas a la vez: que el sistema **captura bien**, que el **proceso** de la sucursal es viable, y cuánto **detecta** de lo que hoy se pierde.

## 2. Cómo corre un día de paralelo

| Momento | Quién | Qué hace |
|---|---|---|
| Apertura | Cajero | Abre turno en el sistema con el fondo inicial. Foto del fondo, como hoy |
| Durante el día | Recepción, podólogo, cajero | Atienden como siempre y capturan en el sistema. Cada cobro lleva el **folio de la nota de papel** |
| Llegada de mercancía | Almacén | Da entrada contra la requisición y el traspaso |
| Cierre | Cajero | Cierra turno. El sistema calcula el corte por forma de pago |
| Cierre | Gerente/encargada | Compara: total del sistema, suma de notas de papel, terminal Clip, efectivo contado. Registra diferencias |
| Noche | Roberto o el equipo de soporte | Revisa los cierres de ambas sedes, marca discrepancias y las manda a los dueños |
| Semanal | Dueños y Roberto | Revisión de diferencias, ajustes al sistema y a los procesos |

**Reglas del paralelo**
1. **Una sola captura por operación**: si se hizo en papel, se captura en el sistema con el folio. No se duplica en WhatsApp.
2. La nota de papel solo se emite si hay falla de luz o internet. Después se captura y se asocia el folio.
3. Ninguna diferencia se corrige sin dejar motivo.
4. Las dos sedes cierran el mismo día, con la misma hora de corte.

## 3. Qué ve cada quién

| | Dueños (consolidado) | Sucursal |
|---|---|---|
| Ventas y corte | Todas las sucursales, por línea, marca y podólogo | Solo la suya |
| Inventario | Existencias por sucursal y total | Solo la suya |
| Traspasos | Salidas de Centenario y recepciones | Los que salen de ella o le llegan |
| Cartera y anticipos | Saldo por paciente y por encargada | Los de su sucursal |
| Pacientes | Expediente único | Expediente único (se consulta con bitácora) |
| Diferencias del cierre | Todas | Las suyas |
| Precios y catálogo | Los cambian | Solo consulta |

## 4. Listado de operaciones por sucursal

Las del piloto, ordenadas por perfil. Tomé la matriz de roles del sistema ([MATRIZ_ROLES.md](../podologia/MATRIZ_ROLES.md)) y lo que se pidió en la junta.

### Recepción
- Agenda del día y de la semana por podólogo; confirmar, reprogramar, cancelar
- Alta de paciente nuevo (teléfono obligatorio y **sin borrado** una vez guardado)
- Registrar llegada y sala de espera
- Buscar paciente de cualquier sucursal

### Podólogo
- Ver su agenda del día
- Consulta: motivo, exploración, diagnóstico, nota de evolución
- Fotos de evolución desde el celular
- Receta y orden de plantilla o calzado al laboratorio/proveedor
- Consultar historial del paciente (queda en bitácora)

### Cajero
- Abrir y cerrar turno; corte de caja
- **Cobrar** consulta y servicios del catálogo con un clic, más productos
- Cobrar la **plantilla o zapato especial**: producto base más complementos (almas, virón, cuña, molde, centímetros de disimetría)
- Cobro por forma de pago: efectivo, tarjeta (con referencia de la terminal), transferencia
- **Anticipo** (50% o más) con nota de anticipo y botón **Liquidar** al entregar
- Apartados con vigencia
- Venta a plazos y crédito al paciente: abonos y saldo
- Devoluciones (con autorización del gerente si pasan el umbral)
- Registrar el folio de la nota de papel usada por contingencia

### Almacén (sucursal)
- Existencias de su sucursal
- **Recibir** mercancía contra requisición o traspaso, y dar entrada
- Solicitar mercancía a Centenario (requisición)
- Traspasos: ver los que le llegan y confirmar recepción
- Conteo físico y auditoría con foto
- Entrega a pacientes de lo pedido al laboratorio/proveedor

### Gerente/encargada de sucursal
- Tablero del día: ventas, citas, caja
- **Autorizar**: descuentos, devoluciones, créditos, prórrogas de apartado, ajustes de inventario hasta su umbral
- Revisar el cierre del día y registrar diferencias
- Caja y cartera de su sucursal
- Alertas de existencias bajas

### Centenario (matriz/CEDIS) — además de lo anterior
- Recibir del proveedor y **dar entrada al almacén central**
- Etiquetar y asignar código de barras
- **Surtir y despachar** traspasos a Patio Valle de Chalco: salida, guía y firma de entrega
- Alta de productos y **cambios de precio** (se reflejan en todas las sucursales)
- Compras y requisiciones de todas las sucursales
- Cotizar prótesis (solo los dueños, con usuario administrador)

### Dueños / administración central
- Consolidado de ventas, inventario y cartera
- Autorizaciones de monto alto
- Precios, márgenes y catálogo central
- Usuarios, roles y parámetros
- Bitácora de auditoría
- Facturación centralizada (Alejandro)

## 5. Qué se queda fuera del paralelo de diciembre

Roberto dijo que quitaría opciones "para que no les haga ruido" y las ofrecería después. Propongo **no activar** en el piloto:

- Recursos humanos, checador y bonos
- Evaluaciones de clientes
- Tienda en línea y pedidos web
- Asistente de preguntas con IA
- Mensajería, correo interno y feed
- Estado de resultados y gastos
- Contador de personas (LoRaWAN)

Los módulos de plataforma (tablero DW, ETL, configuración) siguen **en construcción** y tampoco entran.

## 6. Hallazgos de la investigación

Revisé el sistema de la carpeta `podologia` (Pie Clinic / podix) contra lo que se pidió en la junta.

1. **Hoy es una demostración.** Datos ficticios guardados en el navegador, **sin base de datos y sin producción**. La compuerta E3 está sin firmar. Para el paralelo hace falta conectar la base y desplegar un ambiente real.
2. **El aislamiento por sucursal todavía no es seguridad real.** El permiso se valida en el navegador, no en la base. Para que "cada sucursal vea solo su información" hace falta el RLS en la base antes de cargar datos reales.
3. **Lo que ya existe y sirve**: anticipos y liquidar, apartados, crédito y plazos, turnos y corte, existencias PEPS, traspasos, conteo con foto, autorizaciones por nivel, precio central con ajuste por sucursal, y complementos de plantilla (hay lógica de virón y disimetría en ventas).
4. **Lo que se pidió en la junta y no encontré en el código** (confirmar):
   - Pantalla secundaria para que el paciente vea el cobro
   - Captura de **notas foliadas de contingencia** con control de blocs por sucursal
   - Requisición de compra formal (solo está en documentos, no en pantallas)
   - Conciliación con Clip
   - Impresión de etiquetas y códigos de barras propios (hay un escáner, no la generación)
   - Operación sin internet con sincronización: hay referencias en el código pero no verifiqué que funcione como se prometió
5. **Roles**: el sistema tiene 8 roles y 7 menús. El sistema hermano Pie Firme tiene 3 (administrador, podólogo, recepción). Hay que decidir cuál se usa en el piloto.
6. **El demo asume 7 sucursales.** La junta habló de al menos 2 (Centenario y Patio Valle de Chalco), con Sendero y Tláhuac mencionadas. Hay que confirmar cuántas sucursales tiene Pie Clinic hoy.
7. **Foliado**: las notas actuales llevan folio consecutivo (ej. 7,001). El sistema debe guardar el folio de papel junto a cada cobro para poder cruzar las notas faltantes.

## 7. Cómo se mide si el paralelo funciona

| Indicador | Cómo se calcula | Meta sugerida |
|---|---|---|
| Cuadre diario | Total sistema contra suma de notas de papel, por sucursal | Diferencia = $0 o justificada |
| Notas faltantes | Folios consecutivos que no aparecen en el sistema | 0 al cierre de la semana |
| Cobros sin terminal | Ventas "tarjeta" sin movimiento en Clip | 0 |
| Traspasos confirmados | Traspasos con recepción registrada / enviados | 100% en 24 h |
| Diferencias de inventario | Conteo físico contra sistema | Dentro del umbral autorizado |
| Citas borradas | Citas canceladas sin motivo | 0 |
| Tiempo de captura | Minutos extra por venta contra el papel | Sin demora visible al paciente |

## 8. Pendientes para arrancar

**Pie Firme**
- Decidir ambiente real (base y despliegue) y activar aislamiento por sucursal
- Cerrar lo que falta del punto 6.4
- Cargar catálogo, precios de venta, podólogos y clientes de Patio
- Preparar el plan de pruebas y el formato de cierre diario

**Pie Clinic**
- Excel de catálogos con precios de venta
- Conteo de inventario de Centenario
- Lista de personal de ambas sedes
- Decidir quién cierra el día en cada sucursal y a qué hora
- Confirmar el número real de sucursales

## 9. Preguntas abiertas
1. ¿Qué día exacto arranca el paralelo y cuánto dura (30 días corridos o hasta cuadrar N días seguidos)?
2. ¿El paralelo cuenta como el mes de prueba del acuerdo de pago, y cuándo se decide el modelo (renta contra pago único)?
3. ¿Quién concilia cada cierre: la encargada, Vanesa o Alejandro?
4. ¿Qué pasa con las diferencias: se corrige el sistema, el papel o se anota solo?
5. ¿Las sucursales ven el consolidado o solo lo suyo?
6. ¿Se captura retroactivamente lo anterior al arranque (anticipos y créditos abiertos)?
