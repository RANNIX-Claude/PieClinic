# PREGUNTAS ABIERTAS — Pie Firme (Clínica de Podología · RANNIX)

> Etapa **E2** → insumo de la compuerta **E3**. Es el entregable clave: una pantalla muestra estados, no reglas; este documento lista lo que los 49 mockups **no** dicen.
> Fuente: las 71 notas `PREGUNTA:` de los 48 mockups que las traen (el 01 no tiene) consolidadas y deduplicadas, más las preguntas que las pantallas no plantean (casos borde, tolerancias y redondeos, obligatoriedad real, zona horaria y corte, histórico, concurrencia, retención, quién corrige y bitácora, privacidad, normativa, IVA/CFDI, Clip, IA, proveedores).
> Total: **149 preguntas** (P-001 a P-149). Las opciones marcadas **RECOMENDADA** son propuesta de Claude para abrir la discusión, **no** decisión del cliente ni asesoría legal o fiscal.

**Cómo se usa.** En E3 se recorre en el orden de la agenda (al final), se marca la respuesta, se registra quién decide y la fecha, y se pasa a `REGLAS_NEGOCIO.md`. **No se escribe código antes de que el cliente confirme las respuestas y los mockups corregidos** (compuerta E3).

Leyenda de *Origen*: `NN†` = hay una nota `PREGUNTA:` literal en el mockup NN; `NN` = el mockup muestra el tema pero no lo pregunta. *Tipo*: "Nueva" = ningún mockup lo plantea.

## Resumen

| Tema | Preguntas | De ellas, contradicciones entre mockups |
|---|---|---|
| A. Clínico (expediente, consentimientos, fotos, pie diabético, voz, video, quejas, esterilización) | 32 (P-001 a P-032) | 6 |
| B. Agenda, reservas, portal y seguimiento de pacientes | 22 (P-033 a P-054) | 4 |
| C. Ventas y facturación (caja, precios, IVA, CFDI, planes y paquetes) | 24 (P-055 a P-078) | 4 |
| D. Inventario y compras | 9 (P-079 a P-087) | 1 |
| E. Finanzas y definición de indicadores | 15 (P-088 a P-102) | 4 |
| F. RH, comisiones y mantenimiento | 10 (P-103 a P-112) | 2 |
| G. Plataforma, suscripción, accesos, IA y datos | 23 (P-113 a P-135) | 6 |
| H. Legal y cumplimiento | 14 (P-136 a P-149) | 0 |
| **Total** | **149** | **27** |

## Ya decidido (no reabrir)

Resumen de `REQUERIMIENTO.md` (todas las entradas con fecha 2026-10-25). **No se vuelven a preguntar.** Cuando el requerimiento tiene entradas que se pisan entre sí, manda la última: la "Visión de producto completa" sustituye las exclusiones y la división v1/v1.1 anteriores.

| # | Tema | Decisión del dueño | Pendiente de verificar (no reabre la decisión) |
|---|---|---|---|
| D1 | Modelo | SAAS multi-clínica; portal en `/` y aplicación en `/app/`; aislamiento por RLS desde el día uno | — |
| D2 | Alcance | Todo entra: «No dejes nada fuera… lo más completo posible, administrativa y clínicamente». El orden en olas (E5) es secuencia, no recorte. Sustituye "CFDI fuera", "IA solo en importación" y v1/v1.1 | Confirmar al cierre de E3 que la lista de 27 módulos es la correcta |
| D3 | Perfiles con sesión | Podólogo, Recepción, Administrador. Paciente: solo registro, **no inicia sesión** | Roles de la PWA (propuesta: podólogo y recepción) → P-050 |
| D4 | Portal del paciente | Agenda y paga en el portal, sin cuenta, por clínica (sin ver expediente) | Dirección por clínica y qué se publica |
| D5 | Pasarela | **Clip** para pago en línea al agendar y para integrarse al cobro | Comisiones, recurrencia, reembolsos, cómo se factura la suscripción |
| D6 | Suscripción | Dos planes que el cliente elige: **$400 MXN/mes por podólogo** o **$1,000 MXN/mes por clínica**; cobro automático dentro del sistema | Prueba gratuita, IVA, cancelación, límites |
| D7 | App móvil | **PWA** instalable (no nativa) | Qué se consulta sin conexión |
| D8 | Videoconsulta | Dentro, sala por cita; el dueño delegó el proveedor | Proveedor, grabación, costos (propuesta no verificada: Daily.co o Jitsi/JaaS) |
| D9 | Facturación | CFDI integrada: datos fiscales del cliente + ticket impreso + timbrado (interpretación del dictado: confirmar) | PAC, régimen, IVA, certificados por clínica, cancelaciones y notas de crédito |
| D10 | Importación | La IA **propone** el mapeo; un administrador **revisa y confirma**; vista previa con errores y duplicados; nada se guarda sin confirmar. Fuentes: Excel/CSV, historial de consultas, exportación de otro sistema (no existe software previo), papel/fotos como adjuntos | Proveedor y llave de IA, volumen, reversa |
| D11 | Clonar IRP | Clonar con **toda** su funcionalidad: gastos, ingresos, EDR, bitácora, proveedores, productos/insumos, conciliación, fondo revolvente, RH/nómina, usuarios, catálogos, reportes, dashboard, resumen semanal, mantenimiento/órdenes de trabajo, asistente de IA. Copia independiente (no comparte BD) | Confirmar pantalla por pantalla cuáles aplican |
| D12 | EDR | `proy_*` lo captura el administrador; `real_*` es automático; el código nunca pisa `proy_*` | Proyección por sede, prorrateo |
| D13 | Agenda | Varios podólogos y varias sedes por clínica; agenda por podólogo y por sede/consultorio; cabinas como recursos | — |
| D14 | Catálogo e inventario | Inventario de productos **por sucursal**; **histórico de precios** con vigencia, precio por sucursal, tipos de precio (fijo, desde, por unidad, a valorar), planes multi-sesión, paquetes, anualidad, gift cards, promociones | Reglas de cambio de precio e inventario (ver preguntas) |
| D15 | Reportes pedidos | Ingreso por servicio, por podólogo, por sede; quejas por podólogo/sucursal/día/mes/año; quién atendió la sesión anterior; qué producto hay en cada tienda | Definiciones exactas (METRICAS.md) |
| D16 | Lo que no puede fallar | (1) privacidad entre clínicas; (2) no perder el expediente (respaldo y bitácora de cambios); (3) agenda sin duplicados; (4) importación sin duplicar pacientes | — |
| D17 | Volumen | Clínica chica, hasta 20 citas al día | Citas al mes, pico, pacientes, sedes y podólogos por clínica |
| D18 | Datos de prueba | Sin piloto real: datos sintéticos congruentes (varias clínicas, podólogos, padecimientos, precios investigados); nunca se mezclan con reales | Los mockups traen datos incoherentes entre sí (ver apéndice A) |
| D19 | Estilo | Esqueleto, tokens y UX de IRP; acento y logo **morados** (logo definitivo `portal/assets/logo-morado-gemini.png`) | — |
| D20 | Marca | Nombre público "Pie Firme" y dominio `piefirme.rannix.com` (inferido) | Confirmar nombre, correo de contacto, WhatsApp |
| D21 | Normativa (propuesta del requerimiento, no consultada con abogado) | NOM-004: consentimientos y aviso firmados en pantalla; bitácora de accesos y cambios; retención ≥ 5 años con política de resguardo | Revisión legal (sección H) |
| D22 | Investigación | `INVESTIGACION_PODOLOGIA.md` y `ANALISIS_CLINICAS_SERVICIOS.md` son propuestas con fuentes, no decisiones | Validar con un podólogo real |

---

## Índice

| Pregunta | Tema | Título | Origen |
|---|---|---|---|
| P-001 | A | ¿Se puede corregir una nota de evolución ya firmada? ⚠ | 03†, 43, 02 |
| P-002 | A | ¿Quién puede ver un expediente de otra sede o de otro podólogo? | 02†, 44†, 43† |
| P-003 | A | ¿Qué campos son obligatorios para dar de alta a un paciente? | 10† |
| P-004 | A | ¿Se puede atender a un paciente sin la firma del aviso de privacidad (urgencia)? | 10†, 26† |
| P-005 | A | Menores de edad y personas que no pueden firmar: ¿quién firma y con qué datos? | 10, 26, 19 |
| P-006 | A | ¿Cómo se detecta y se resuelve un paciente duplicado (recepción, portal e importación)? ⚠ | 10, 13, 26, 02, 17, 18 |
| P-007 | A | ¿Cuántas fotos clínicas por sesión y de qué tamaño? | 04† |
| P-008 | A | ¿Se puede eliminar una foto clínica o solo marcarla como retirada? | 04† |
| P-009 | A | ¿Se difuminan rostro y datos identificables en fotos de docencia/difusión? ¿Quién las puede usar? | 04†, 10, 02 |
| P-010 | A | ¿Quién valida las categorías de riesgo y las frecuencias de revisión del pie diabético antes de automatizarlas? | 06†, 02 |
| P-011 | A | ¿El índice tobillo-brazo se captura siempre o solo donde hay Doppler? | 06† |
| P-012 | A | ¿Qué reglas generan las alertas clínicas y quién las define? | 02, 06, 03 |
| P-013 | A | Plantillas ortopédicas: ¿fabricación propia o laboratorio externo, plazo y garantía? | 07†, 20 |
| P-014 | A | Dictado por voz: ¿el audio se guarda, dónde se procesa y quién es el proveedor? | 08† |
| P-015 | A | ¿El dictado con IA requiere un consentimiento específico del paciente? | 08†, 10 |
| P-016 | A | Videoconsulta: ¿qué proveedor, se graba y hay límites de duración o de uso por plan? | 09†, 29†, 46 |
| P-017 | A | ¿Qué servicios pueden darse a distancia y se cobran igual? | 09†, 29†, 19 |
| P-018 | A | Videoconsulta: ¿cuándo se puede entrar a la sala y qué pasa con pagos o consentimiento pendientes? ⚠ | 09, 29, 30 |
| P-019 | A | ¿El consentimiento informado del procedimiento se firma en consulta o también en el portal? | 26†, 45†, 19 |
| P-020 | A | Quejas e incidencias: ¿quién las ve, las resuelve y en qué plazo? | 14†, 44 |
| P-021 | A | ¿Qué es una "queja" y cuáles son las categorías? ¿Se separan las administrativas de los eventos adversos? ⚠ | 14†, 42†, 31† |
| P-022 | A | Quejas: ¿quién autoriza reembolsos, descuentos o consultas gratis como compensación? | 14†, 17† |
| P-023 | A | Esterilización: ¿cada cuánto se hace el indicador biológico, quién lo interpreta y se puede liberar un lote con resultado pendiente? ⚠ | 15† |
| P-024 | A | ¿Qué formato exige la autoridad sanitaria para la bitácora de esterilización y quién firma? | 15†, 41† |
| P-025 | A | ¿"Quién atendió" se toma de la cita o de la nota firmada? ¿Qué pasa con suplencias y co-atención? | 42†, 02, 47, 17 |
| P-026 | A | Plan de tratamiento abandonado: ¿qué pasa con el precio y con el anticipo? | 05†, 20† |
| P-027 | A | ¿La curación gratuita incluida en un plan la define Pie Firme o cada clínica por plantilla? ¿Quién edita las plantillas de plan? | 05†, 19, 20 |
| P-028 | A | ¿Cuántas citas tiene el plan de extracción de uña? ⚠ | 05, 19, 20, 02 |
| P-029 | A | Plan multi-sesión: ¿qué tolerancia tiene la ventana de días y cuándo se considera una sesión "tarde"? | 05, 20, 16 |
| P-030 | A | ¿Los antecedentes (HbA1c, medicamentos, alergias) se guardan "como estaban" en cada consulta o solo hay una ficha vigente? | 03, 02, 06 |
| P-031 | A | Catálogo de diagnósticos (CIE-10) y de procedimientos: ¿completo o recortado, y quién lo mantiene? | 02, 03, 06, 07 |
| P-032 | A | ¿Qué hace el sistema cuando el paciente tiene una alergia que choca con lo que se va a usar o indicar? | 02, 03, 21 |
| P-033 | B | Política de cancelación: ¿con cuántas horas de aviso, qué se pierde y es igual para todos los servicios y sedes? ⚠ | 11†, 25†, 27†, 26† |
| P-034 | B | Anticipo al agendar: ¿es obligatorio, de cuánto y por servicio o por clínica? ⚠ | 25†, 45†, 11†, 05†, 07† |
| P-035 | B | Reembolso del anticipo: ¿quién lo hace (Clip o la clínica), en cuánto tiempo y quién absorbe la comisión? | 26†, 27† |
| P-036 | B | Retención del horario durante el pago: ¿cuántos minutos y qué pasa si se agota? | 26†, 11 |
| P-037 | B | Concurrencia en agenda: si recepción y el portal toman el mismo hueco, o dos recepciones editan la misma cita, ¿quién gana? | 11, 26, 01 |
| P-038 | B | Reprogramar: ¿cuántas veces, hasta cuándo y a qué costo? | 27† |
| P-039 | B | Recordatorios: ¿cuántos, con qué anticipación y por qué canal? ⚠ | 11†, 05, 27, 45, 09, 16† |
| P-040 | B | WhatsApp: ¿proveedor, costo, el 55 1412 0283 es WhatsApp y hay un número por sede? | 25†, 11†, 16†, 45, 28† |
| P-041 | B | Lista de espera: ¿cómo se prioriza y cuánto tiempo se da a un paciente notificado? | 12† |
| P-042 | B | Sobrecupo controlado: ¿quién autoriza y cuántos como máximo? | 11 |
| P-043 | B | Duración de cita y margen entre citas (limpieza, esterilización) | 11, 19, 05 |
| P-044 | B | Visita a domicilio: ¿cómo se asignan zonas, viáticos y recargo, y cómo se agenda? | 11, 19, 25, 01, 45 |
| P-045 | B | Estados de la cita: ¿qué transiciones se permiten, quién las marca y cuándo se marca "No asistió"? | 01, 11, 17, 27, 30 |
| P-046 | B | Zona horaria y corte del día | 25, 17, 48, 32 |
| P-047 | B | Horarios de podólogos, festivos y vacaciones: ¿cómo bloquean la agenda? | 45, 39, 11 |
| P-048 | B | "Cualquiera disponible": ¿con qué criterio se asigna el podólogo? | 25, 12 |
| P-049 | B | Ligas del portal sin cuenta: ¿cuánto duran y cómo se protegen de abuso? | 27, 25, 29, 09 |
| P-050 | B | PWA: ¿qué roles la usan y qué se consulta sin conexión? | 30† |
| P-051 | B | Cancelar o corregir citas ya atendidas o pasadas: ¿quién y con bitácora? | 01, 11, 43 |
| P-052 | B | CRM: ¿cuántos meses sin venir hace "inactivo"? ¿qué es "revisión vencida" por servicio? ⚠ | 16†, 45 |
| P-053 | B | Campañas y cumpleaños: ¿quién autoriza el texto y el descuento y qué consentimiento se necesita? | 16†, 10, 45 |
| P-054 | B | Encuestas y NPS: ¿cuándo se envían, a quién y qué hace una calificación baja? | 16, 14, 31 |
| P-055 | C | ¿Qué descuento puede dar Recepción sin autorización y desde qué porcentaje se pide PIN de administrador? | 17†, 20 |
| P-056 | C | IVA: ¿los servicios de podología van exentos y los productos al 16%? ¿Los precios publicados incluyen IVA? | 17†, 18†, 45†, 19, 28†, 23 |
| P-057 | C | Redondeos entre ticket, CFDI y descuentos ⚠ | 17, 18, 19, 23 |
| P-058 | C | ¿Cuántos turnos por día y por caja hay en cada sede y quién autoriza un cierre con diferencia? | 17† |
| P-059 | C | Corte de caja: ¿qué entra en "ventas totales del turno"? ⚠ | 17, 32 |
| P-060 | C | Cancelar o reimprimir un ticket: ¿quién, hasta cuándo y qué pasa con inventario, CFDI y comisiones? | 17, 18, 43 |
| P-061 | C | Facturación: ¿qué PAC se usa y cada clínica carga sus propios certificados? ¿Qué claves SAT se usan? | 45†, 18† |
| P-062 | C | ¿Cómo se factura un anticipo (CFDI de anticipo con relación 07) y al aplicarlo? | 18†, 17, 25 |
| P-063 | C | CFDI: ¿quién puede cancelar o sustituir y hasta cuándo? | 18† |
| P-064 | C | CFDI: ¿hasta cuándo se puede facturar un ticket, se factura a público en general y hay factura global? | 18, 17 |
| P-065 | C | Notas de crédito y devoluciones: ¿quién las emite y se regresa el dinero en caja? | 18, 17, 23 |
| P-066 | C | Datos fiscales del paciente: ¿cuándo se pueden cambiar y qué pasa con facturas ya timbradas? | 10, 18, 26 |
| P-067 | C | ¿Se cobra distinto la primera visita, la segunda y la curación, o hay tarifa por perfil (adulto mayor)? | 19† |
| P-068 | C | Si cambia un precio, ¿qué pasa con citas ya agendadas, planes vendidos, paquetes y comisiones? | 19, 20, 05, 40 |
| P-069 | C | Precios y composición de servicios: ¿cuál es el correcto? ⚠ | 02, 05, 07, 11, 19, 20, 25, 17 |
| P-070 | C | Planes y paquetes: ¿qué pasa con sesiones no usadas al caducar y con las reprogramadas? | 20†, 05† |
| P-071 | C | Planes, membresías y gift cards usados en otra sede: ¿a qué sede se reconoce el ingreso, la comisión y el inventario? | 20, 17, 40, 31 |
| P-072 | C | ¿Qué incluye la anualidad/membresía de la clínica? ⚠ | 20†, 02 |
| P-073 | C | Gift cards: caducidad, saldo, uso en varias sedes y reconocimiento contable | 20, 17 |
| P-074 | C | Promociones: ¿acumulables, límites de uso y control de vigencia? | 20, 17 |
| P-075 | C | Plantillas ortopédicas: ¿se cobra anticipo, cuánto, y el estudio se descuenta del precio? | 07†, 20 |
| P-076 | C | ¿Se da crédito a pacientes (saldos, apartados, convenios con empresas o aseguradoras)? | 38†, 33 |
| P-077 | C | Comisión de terminal y de Clip: ¿quién la absorbe y cómo se registra? | 32, 35, 36, 40, 26 |
| P-078 | C | ¿El podólogo cobra o solo envía a caja? ¿Quién vende los productos? | 03, 17, 44 |
| P-079 | D | ¿Lote y caducidad en todos los productos o solo en algunos? ¿Los insumos clínicos se descuentan solos por cada servicio? | 21†, 03, 23 |
| P-080 | D | Traspasos: ¿quién confirma la recepción, qué se hace con faltantes o dañados y a qué valor se mueve? | 22† |
| P-081 | D | Compras: ¿requieren autorización por monto y se genera cuenta por pagar al recibir? ⚠ | 23†, 38 |
| P-082 | D | ¿Los proveedores son comunes a toda la clínica o cada sede tiene los suyos? ¿Van en el mismo catálogo los de mantenimiento y equipo? | 24†, 34, 38, 41 |
| P-083 | D | Costo promedio: método, recálculo y qué pasa con devoluciones y mermas | 23, 19, 22, 21 |
| P-084 | D | Mínimos y estados "bajo mínimo / en el mínimo": ¿quién los fija y cómo se calcula "sugerir por mínimos"? | 21, 22, 23, 31 |
| P-085 | D | ¿Se puede vender o usar un producto sin existencia registrada? | 17, 21, 03 |
| P-086 | D | Conteos físicos y mermas: ¿quién autoriza ajustes y con qué tolerancia? | 21 |
| P-087 | D | Plantillas a medida (laboratorio): ¿pasan por inventario? | 07, 20, 19 |
| P-088 | E | ¿La semana del corte es sábado→viernes o lunes→domingo? ¿Quién autoriza el cierre? | 32†, 37 |
| P-089 | E | Ingreso "Observado": ¿bloquea el corte o solo se marca? ¿Quién valida? | 33†, 36 |
| P-090 | E | ¿El "real" del EDR y de las comisiones es lo cobrado o solo lo validado? ⚠ | 31, 33, 35, 36, 40 |
| P-091 | E | ¿Cuándo se reconoce un ingreso: al cobrar, al atender o al venderse (anticipos, planes, gift cards)? | 33, 20, 31, 35 |
| P-092 | E | EDR por sede y proyección: ¿se proyecta por sede y por mes? ¿Cómo se prorratean gastos compartidos? ¿IVA aparte? | 35† |
| P-093 | E | Gastos: ¿qué métodos de pago aplican y hay tope sin comprobante fiscal? | 34†, 37 |
| P-094 | E | Conciliación: ¿una cuenta por sede o una general? ¿Qué bancos y formatos? ¿Clip liquida por lote? | 36†, 45 |
| P-095 | E | Fondo revolvente: ¿uno por sede o uno por clínica? ¿Quién autoriza la reposición? ⚠ | 37†, 32 |
| P-096 | E | ¿Quién autoriza pagar a proveedores y desde qué cuenta? | 38†, 23 |
| P-097 | E | Metas: ¿cuál es la meta de ocupación y las metas por sede y podólogo? | 31†, 40, 14 |
| P-098 | E | Definiciones de indicadores: ocupación, cita atendida, ticket promedio, paciente nuevo, paciente activo ⚠ | 31, 16, 12, 40, 46 |
| P-099 | E | Cierres de periodo (semana, comisiones, nómina): ¿qué se congela y quién puede reabrir? | 32, 40, 39 |
| P-100 | E | ¿Qué impuestos aparecen en el estado de resultados? | 35, 17, 18 |
| P-101 | E | ¿Cómo se agrupan los servicios del catálogo en los renglones del estado de resultados y en "ingreso por servicio"? ⚠ | 35, 19, 31, 40, 47 |
| P-102 | E | ¿Qué ven un podólogo y recepción en Dashboard, Reportes y Resumen? | 02, 10, 17, 31, 42, 44 |
| P-103 | F | ¿Los podólogos son empleados con nómina o prestadores por honorarios/RESICO? | 39†, 40 |
| P-104 | F | ¿La nómina se timbra desde Pie Firme (CFDI de nómina) o solo se prepara la prenómina? | 39† |
| P-105 | F | Asistencia: ¿hay checador físico o se marca desde la app? | 39†, 30 |
| P-106 | F | Comisiones: ¿% por servicio, % distinto por producto, sueldo fijo + bono o renta de cabina? ¿Varían por servicio o por podólogo? ⚠ | 40† |
| P-107 | F | Base de la comisión: ¿sobre precio de lista, cobrado, sin IVA, sin descuentos, sobre validado? ¿A quién se comisiona un plan? | 40, 20, 17, 33 |
| P-108 | F | Comisiones y cambios de esquema: ¿qué pasa con el histórico y con ventas canceladas después del cierre? | 40, 19 |
| P-109 | F | Podólogos en varias sedes: ¿a qué sede se atribuyen ingreso, nómina y comisión? | 40, 44, 39, 01 |
| P-110 | F | Vacaciones, incidencias y descuento por falta: ¿qué reglas aplica el sistema? | 39 |
| P-111 | F | ¿Quién ve sueldos, comisiones y bancos del personal? | 44, 39, 40 |
| P-112 | F | Mantenimiento: ¿quién autoriza una orden de trabajo y hasta qué monto? ⚠ | 41†, 23 |
| P-113 | G | ¿Clip permite cobros recurrentes para la suscripción? Si no, ¿qué otro medio de cobro automático? | 46† |
| P-114 | G | Prueba gratuita, suspensión por falta de pago y cancelación ⚠ | 46†, 28†, 48 |
| P-115 | G | ¿El plan "por clínica" cubre cuántos podólogos y sedes? ¿Hay tope de almacenamiento o de citas? | 28†, 46, 48 |
| P-116 | G | ¿Cuándo cuenta un podólogo como "activo" para cobrar y cómo se prorratea el cambio de plan? | 46, 28, 48 |
| P-117 | G | Los $400/$1,000: ¿llevan IVA? ¿Cómo se factura la suscripción? ⚠ | 28†, 46, 35 |
| P-118 | G | Nombre público "Pie Firme", correo de contacto y WhatsApp | 28†, 25† |
| P-119 | G | Acceso: ¿cada clínica entra por la misma pantalla o por una dirección propia? ¿Doble factor y recuperación? | 49†, 45, 43 |
| P-120 | G | "Continuar con Google": ¿se permite y con qué controles, dado que son datos de salud? | 49, 45 |
| P-121 | G | Soporte RANNIX: ¿puede entrar a la clínica del cliente (suplantar) y con qué bitácora? | 48† |
| P-122 | G | Importación: volumen, sistemas de origen y si se puede deshacer una carga | 13† |
| P-123 | G | Importación: criterios de duplicados y conflictos al "combinar" | 13, 10, 06 |
| P-124 | G | Proveedores y llave de IA: ¿cuál, dónde procesan los datos de salud y quién paga? | 13†, 08†, 47†, 34 |
| P-125 | G | Asistente de IA: ¿qué datos clínicos puede ver? | 47†, 44 |
| P-126 | G | Lectura automática de tickets/comprobantes: ¿qué hacer con baja confianza o ilegibles? | 34, 33, 13 |
| P-127 | G | Volumetría y retención: ¿cuántos años se conservan expedientes, fotos, video, audio, bitácora y respaldo? | 43†, 46, 45, 02, 04 |
| P-128 | G | Aislamiento entre clínicas: ¿una persona puede ser paciente de dos clínicas del producto y qué comparten? | 48, 10, 13, 45 |
| P-129 | G | ¿Los pacientes y el expediente pertenecen a la clínica o a la sede? ¿Qué significa "sede de alta"? ⚠ | 02, 10, 44, 01 |
| P-130 | G | Matriz completa de permisos por rol ⚠ | 44†, 17, 18, 33 |
| P-131 | G | Usuarios que aparecen y no tienen rol definido (encargado de inventario/sede, apoyo, laboratorio) | 22, 39, 15, 44 |
| P-132 | G | Datos de ejemplo y semilla de pruebas | 01, 02, 14, 19, 31, 48 |
| P-133 | G | Numeración de folios: pacientes, citas, consultas, tickets, facturas y reinicio ⚠ | 02, 11, 17, 18, 22, 43 |
| P-134 | G | Portal público: ¿una dirección por clínica y qué se publica (sedes, servicios, precios, podólogos)? | 25, 28, 26, 45 |
| P-135 | G | ¿Existe un administrador de una sola sede o el administrador siempre ve todas? ⚠ | 43, 44 |
| P-136 | H | NOM-004: contenido mínimo de la nota, firma y plazo de conservación | 03, 43, 02, 45 |
| P-137 | H | NOM-024 (interoperabilidad de expediente electrónico): ¿aplica y qué exige? | 02, 06 |
| P-138 | H | Datos personales y sensibles: ¿quién es responsable y quién encargado (clínica vs RANNIX)? | 45†, 26†, 48†, 13†, 29† |
| P-139 | H | Textos legales base: aviso de privacidad, consentimientos, términos del portal | 45†, 26†, 29†, 10 |
| P-140 | H | ¿Qué pasa con los pacientes que firmaron la versión anterior del aviso cuando sale una nueva? | 10, 02, 45 |
| P-141 | H | Solicitud ARCO (acceso, rectificación, cancelación, oposición): ¿quién la atiende y qué entrega el sistema? | 02, 43 |
| P-142 | H | Firma en pantalla del paciente y del podólogo: ¿qué evidencia se guarda y qué valor tiene? | 03, 10, 29 |
| P-143 | H | Transferencias de datos a terceros (Clip, video, IA, WhatsApp, PAC, correo): ¿cuáles y con qué consentimiento? | 26, 29, 08, 13, 18, 16 |
| P-144 | H | ¿Dónde residen y se procesan los datos (país/región) y los respaldos? | 13†, 08†, 29 |
| P-145 | H | Recetas e indicaciones: ¿qué medicamentos puede indicar el podólogo y se venden en la clínica? | 03, 09, 21 |
| P-146 | H | Cédula profesional del podólogo: ¿se valida y dónde se muestra? | 02, 25, 03 |
| P-147 | H | Telemedicina: marco legal y consentimiento | 09, 29 |
| P-148 | H | Comunicaciones comerciales (promociones, cumpleaños, encuestas): consentimiento y baja | 10, 16, 26 |
| P-149 | H | Licencias, permisos y responsable sanitario de la clínica | 15, 35, 45 |

⚠ = contradicción entre mockups (detalle en apéndice A).

---

## A. Clínico (expediente, consentimientos, fotos, pie diabético, voz, video, quejas, esterilización)

### P-001 · ¿Se puede corregir una nota de evolución ya firmada?
*Origen:* mockups 03†, 43, 02 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** El mockup 03 propone que la nota firmada quede bloqueada y solo admita una nota aclaratoria con fecha (NOM-004). Pero el mockup 43 (bitácora) muestra una nota firmada que se editó y quedó "re-firmada, versión 2". Las dos pantallas se contradicen.

**Por qué importa.** Define permisos de edición, el versionado del expediente, qué ve el historial y qué prueba se conserva ante una reclamación. Es la regla más delicada del módulo clínico.

**Opciones**
- **A · RECOMENDADA** — Bloqueada tras firmar; solo se agrega nota aclaratoria con fecha, autor y firma; la original siempre visible (coincide con la propuesta de 03 y con lo que sugiere la NOM-004; validar con asesor)
- **B** — Editable por el mismo podólogo dentro de un plazo (¿cuántas horas?), cada versión se conserva y se re-firma (como 43)
- **C** — Editable solo por administración con motivo obligatorio

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-002 · ¿Quién puede ver un expediente de otra sede o de otro podólogo?
*Origen:* mockups 02†, 44†, 43† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** En 02 un podólogo de Condesa podría ver una consulta de Roma Norte; en 44 el rol Podólogo "edita sus pacientes" y Recepción ve "solo datos de contacto". No se dice qué pasa con pacientes de otro podólogo de la misma sede ni con pacientes de otra sede de la misma clínica, ni si se avisa al administrador cuando alguien abre un expediente fuera de su sede (pregunta de 43).

**Por qué importa.** Es la base del aislamiento por sede en RLS y de la bitácora de accesos. También decide qué significa "mis pacientes" (¿paciente asignado a un podólogo o a una sede?).

**Opciones**
- **A · RECOMENDADA** — Todo el expediente visible a podólogos de la misma clínica, con registro en bitácora y aviso al administrador cuando la sede del paciente es distinta
- **B** — Solo pacientes atendidos por ese podólogo o de su sede; para ver otros se pide motivo ("romper el cristal") que queda en bitácora
- **C** — Cada sede aislada; entre sedes solo el administrador

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-003 · ¿Qué campos son obligatorios para dar de alta a un paciente?
*Origen:* mockups 10† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 10 propone: nombre, apellido, fecha de nacimiento, celular, aviso y consentimiento firmados. No se sabe si CURP, apellido materno, correo, contacto de emergencia, alergias y diabetes son obligatorios, ni qué pasa en el alta rápida desde la cita o el portal.

**Por qué importa.** Cada campo obligatorio es una restricción de base de datos y un freno en recepción; demasiado estricto frena la operación, demasiado laxo ensucia el expediente (NOM-004 pide datos de identificación).

**Opciones**
- **A · RECOMENDADA** — La propuesta de 10 (nombre, apellido paterno, fecha de nacimiento, celular, aviso y consentimiento firmados); el resto opcional
- **B** — Mínimo para citar (nombre y celular) y el resto obligatorio antes de la primera consulta clínica
- **C** — Todos los datos de identificación obligatorios

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-004 · ¿Se puede atender a un paciente sin la firma del aviso de privacidad (urgencia)?
*Origen:* mockups 10†, 26† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 10 pregunta si se puede atender con la firma pendiente. El portal (26) exige aceptar el aviso para reservar; en recepción la firma es en pantalla.

**Por qué importa.** Define un estado "consentimiento pendiente", quién puede saltarlo, con qué plazo y si se bloquea el cierre de la consulta hasta firmar. Afecta la LFPDPPP (datos sensibles).

**Opciones**
- **A · RECOMENDADA** — Se puede atender en urgencia, queda marcado "firma pendiente" y no se puede cerrar la consulta sin firma; el administrador autoriza la excepción
- **B** — Nunca sin firma
- **C** — Sí se puede y se firma en la siguiente visita

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-005 · Menores de edad y personas que no pueden firmar: ¿quién firma y con qué datos?
*Origen:* mockups 10, 26, 19 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 10 y 26 muestran sección de tutor al capturar una fecha de nacimiento menor de 18; 19 marca "Sí (tutor)" para podología infantil. No se dice qué documentos se piden al tutor, si el tutor tiene datos propios en el sistema, ni qué pasa con adultos incapaces de firmar.

**Por qué importa.** Cambia el modelo de datos (tutor como persona o como campos del paciente) y los consentimientos válidos.

**Opciones**
- **A · RECOMENDADA** — El tutor se guarda como contacto ligado al paciente con identificación (tipo y folio) y firma; a los 18 años se pide nueva firma del propio paciente
- **B** — Solo se captura el nombre del tutor sin identificación
- **C** — Se atiende solo acompañado y se registra en la nota

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-006 · ¿Cómo se detecta y se resuelve un paciente duplicado (recepción, portal e importación)?
*Origen:* mockups 10, 13, 26, 02, 17, 18 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 10 avisa "posible duplicado" por teléfono y 13 detecta duplicados por nombre y fecha; el requerimiento exige "importación sin duplicar pacientes". Además los mockups muestran a "María Pérez Aguirre" con dos nacimientos (14/03/1968 en 02 y 13; 12/05/1978 en 18 y 26), dos RFC, dos teléfonos y tres folios distintos (PF-004127, PF-00231, #0412). No se sabe si es la misma persona.

**Por qué importa.** Un duplicado parte el historial clínico y las cuentas. La regla de coincidencia (¿teléfono compartido en una familia?) decide si se bloquea, se avisa o se combina; combinar expedientes es irreversible si no se diseña.

**Opciones**
- **A · RECOMENDADA** — Coincidencia por nombre + fecha de nacimiento (teléfono solo como aviso); recepción decide "abrir existente / no es la misma"; combinar solo por administrador con bitácora y posibilidad de deshacer
- **B** — Coincidencia por CURP cuando exista, si no por nombre + fecha
- **C** — Solo aviso, nunca combinar automáticamente

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-007 · ¿Cuántas fotos clínicas por sesión y de qué tamaño?
*Origen:* mockups 04† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** No hay límite en pantalla (02 muestra 6 fotos en una sesión; 04 muestra 4 por sesión y fotos enviadas por el paciente en 09).

**Por qué importa.** Define almacenamiento (5.1 GB ya en 46), costo por plan y rendimiento en la PWA.

**Opciones**
- **A · RECOMENDADA** — Límite blando por sesión (p. ej. 10) y tamaño máximo por foto con compresión automática; valores exactos por definir con el cliente
- **B** — Sin límite por sesión pero con cuota de almacenamiento por plan
- **C** — Límite estricto

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-008 · ¿Se puede eliminar una foto clínica o solo marcarla como retirada?
*Origen:* mockups 04† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 04 tiene el botón "Eliminar". La pregunta de la propia nota es si solo se marca como retirada con registro en bitácora.

**Por qué importa.** Una foto es parte del expediente; borrarla destruye evidencia clínica y puede contradecir la conservación de 5 años.

**Opciones**
- **A · RECOMENDADA** — Nunca se borra: se marca "retirada" con motivo, autor y fecha, y deja de mostrarse salvo para administración
- **B** — Se puede borrar solo en las primeras horas tras subirla (error de captura)
- **C** — Borrado físico por administrador

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-009 · ¿Se difuminan rostro y datos identificables en fotos de docencia/difusión? ¿Quién las puede usar?
*Origen:* mockups 04†, 10, 02 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 10 captura una autorización opcional de uso en docencia/difusión; 02 muestra "Autorización de fotos para docencia: No". No se dice si se anonimiza, quién las exporta ni qué pasa si el paciente revoca.

**Por qué importa.** Es dato de salud sensible; el uso sin anonimizar o sin autorización vigente es riesgo legal.

**Opciones**
- **A · RECOMENDADA** — Solo se pueden usar si la autorización está vigente y siempre con rostro/identificadores difuminados; la revocación las oculta
- **B** — Uso sin difuminar con autorización firmada explícita
- **C** — No se ofrece la función en esta versión

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-010 · ¿Quién valida las categorías de riesgo y las frecuencias de revisión del pie diabético antes de automatizarlas?
*Origen:* mockups 06†, 02 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 06 propone categoría de riesgo 3 y frecuencia "cada 1–3 meses" según la guía IWGDF 2023 de la investigación, y calcula puntaje SINBAD; la propia nota pregunta si un podólogo real las valida. 02 muestra "revisión vencida hace 38 días" como alerta.

**Por qué importa.** Si el sistema propone o recuerda algo clínico, el criterio debe venir de un profesional; un error se vuelve alerta falsa o peor, falta de alerta. El mockup dice que son apoyo, no diagnóstico.

**Opciones**
- **A · RECOMENDADA** — Se publica solo como sugerencia editable; antes de activarla un podólogo asesor del cliente valida los criterios y quedan versionados
- **B** — Se deja la categoría y la frecuencia como captura manual sin cálculo automático
- **C** — Se automatiza tal cual la investigación

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-011 · ¿El índice tobillo-brazo se captura siempre o solo donde hay Doppler?
*Origen:* mockups 06† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 06 captura ITB (0.92 / 0.78). La nota pregunta si es obligatorio o depende del equipo de la sede.

**Por qué importa.** Obligatoriedad real del campo y del cálculo de riesgo; evita guardar ceros falsos.

**Opciones**
- **A · RECOMENDADA** — Opcional; si no hay equipo se marca "no evaluado" (nunca 0) y el riesgo se calcula con lo disponible
- **B** — Obligatorio en todo paciente diabético
- **C** — Obligatorio solo en sedes con Doppler configurado

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-012 · ¿Qué reglas generan las alertas clínicas y quién las define?
*Origen:* mockups 02, 06, 03 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 02 lista "Alertas clínicas (apoyo, no diagnóstico)": alergias, diabetes, anticoagulante, revisión vencida, plan incompleto. La visión del requerimiento incluye alertas de interacciones. No se dice si son reglas fijas, las captura el podólogo o si hay catálogo de interacciones/medicamentos.

**Por qué importa.** Una alerta mal calculada se interpreta como diagnóstico. Hay que decidir el alcance antes de modelar medicamentos y alergias como catálogo.

**Opciones**
- **A · RECOMENDADA** — Solo alertas derivadas de datos capturados (alergias, antecedentes, fechas de revisión, planes pendientes); sin motor de interacciones en esta versión
- **B** — Con catálogo de interacciones licenciado/validado
- **C** — Sin alertas automáticas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-013 · Plantillas ortopédicas: ¿fabricación propia o laboratorio externo, plazo y garantía?
*Origen:* mockups 07†, 20 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 07 envía la orden al "Laboratorio Ortopodal" con entrega estimada de 15 días hábiles y garantía de 6 meses; la nota pregunta si es propia o externa y qué cubre la garantía (la investigación habla de 12–18 meses de duración, no de garantía). 20 incluye "ajuste de plantilla" y 1 ajuste de garantía.

**Por qué importa.** Define si hay catálogo de laboratorios (proveedores), estados de la orden, fecha de garantía y qué pasa si el defecto se reporta al día 181.

**Opciones**
- **A · RECOMENDADA** — Laboratorio externo como proveedor del catálogo; plazo y garantía configurables por clínica (los de 07 son ejemplo)
- **B** — Fabricación propia en la sede (sin proveedor ni estados de envío)
- **C** — Ambos

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-014 · Dictado por voz: ¿el audio se guarda, dónde se procesa y quién es el proveedor?
*Origen:* mockups 08† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 08 graba, transcribe y la IA propone una estructura de nota ("diagnóstico NO propuesto"). La nota dice que aún no hay llave de IA y que el audio es dato de salud. Hoy, según el requerimiento, el dictado entra por la "visión completa".

**Por qué importa.** Define almacenamiento, retención, contrato con el proveedor (encargado de datos) y costo por consulta.

**Opciones**
- **A · RECOMENDADA** — Se borra el audio al confirmar la transcripción; solo se conserva el texto aceptado por el podólogo y el registro del dictado en bitácora
- **B** — Se conserva el audio X días para auditoría
- **C** — Se conserva junto al expediente

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-015 · ¿El dictado con IA requiere un consentimiento específico del paciente?
*Origen:* mockups 08†, 10 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 08 muestra "Consentimiento del paciente para grabar / usar IA: Sí, informado / No", pero 10 no tiene ese consentimiento entre los cinco del alta.

**Por qué importa.** Consentimiento distinto al aviso de privacidad cuando intervienen terceros (proveedor de IA). Afecta qué se firma al alta.

**Opciones**
- **A · RECOMENDADA** — Consentimiento específico firmado en el alta, que se puede revocar; sin él no se habilita el dictado en esa consulta
- **B** — Basta el aviso de privacidad si lo cubre
- **C** — Se pide verbalmente y se registra una casilla

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-016 · Videoconsulta: ¿qué proveedor, se graba y hay límites de duración o de uso por plan?
*Origen:* mockups 09†, 29†, 46 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 09 dice "sala cifrada" y 29 ofrece al paciente un consentimiento opcional de grabación. El requerimiento solo propone un proveedor de video sin verificar (Daily.co o Jitsi/JaaS).

**Por qué importa.** El proveedor define el costo por minuto, dónde viven las grabaciones (dato de salud) y si el plan debe limitar minutos.

**Opciones**
- **A · RECOMENDADA** — Sin grabar por defecto; solo si el paciente lo autoriza, con retención definida; sin límite de minutos pero con tope razonable por cita
- **B** — Nunca se graba
- **C** — Se graba siempre

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-017 · ¿Qué servicios pueden darse a distancia y se cobran igual?
*Origen:* mockups 09†, 29†, 19 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 09 cobra $300 una "videoconsulta de seguimiento"; 29 menciona valoración y seguimiento. 19 y 25 no marcan qué servicios admiten tipo de atención "videoconsulta" ni su precio.

**Por qué importa.** Hace falta un atributo en el catálogo por servicio (permite distancia: sí/no) y un precio propio o el mismo.

**Opciones**
- **A · RECOMENDADA** — Atributo por servicio "admite videoconsulta"; solo valoración y seguimiento al inicio, con precio propio
- **B** — Cualquier servicio con precio normal
- **C** — Solo seguimiento

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-018 · Videoconsulta: ¿cuándo se puede entrar a la sala y qué pasa con pagos o consentimiento pendientes?
*Origen:* mockups 09, 29, 30 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 09 envía la liga 15 min antes; 29 dice que el paciente puede entrar 10 minutos antes; el estado "pagado en línea" y "consentimiento firmado" aparecen en 09 pero no se dice si la sala se bloquea sin ellos, quién admite al paciente ni qué pasa si la liga se reutiliza o se corta la conexión.

**Por qué importa.** Seguridad de la sala y reglas de cobro; hay una contradicción de 15 vs 10 minutos.

**Opciones**
- **A · RECOMENDADA** — Liga activa 10 min antes (valor configurable), sin consentimiento firmado no se entra; pago pendiente avisa al podólogo pero no bloquea
- **B** — Liga siempre vigente hasta terminar la cita
- **C** — Sin pago no se entra

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-019 · ¿El consentimiento informado del procedimiento se firma en consulta o también en el portal?
*Origen:* mockups 26†, 45†, 19 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 26 dice que la autorización de fotos "se firma en consulta" y 45 tiene plantillas de consentimiento por procedimiento (19 marca cuáles servicios lo requieren). No se dice quién redacta el texto ni dónde se firma cada documento.

**Por qué importa.** Determina qué documentos exige el sistema antes de cerrar una consulta y su versión.

**Opciones**
- **A · RECOMENDADA** — Aviso de privacidad al reservar o en el alta; consentimiento informado del procedimiento y fotos siempre en consulta, en pantalla, por servicio que lo exija (campo de 19)
- **B** — Todo en el portal antes de la cita
- **C** — Solo en papel escaneado

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-020 · Quejas e incidencias: ¿quién las ve, las resuelve y en qué plazo?
*Origen:* mockups 14†, 44 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 14 las gestiona administración, pero QJ-0138 tiene como responsable a "Podóloga Ruiz (responsable clínica)"; 44 no incluye el módulo de quejas en la matriz. La nota propone 3 días como plazo (el tiempo medio mostrado es 3.2 días, meta 3).

**Por qué importa.** Define permisos (¿ve el podólogo señalado?), alcance del responsable y la meta que se mide en el tablero.

**Opciones**
- **A · RECOMENDADA** — Las ve y resuelve administración y un responsable clínico asignado; el podólogo señalado solo es notificado de las que lo mencionan; plazo meta 3 días configurable
- **B** — Solo administración
- **C** — Administración y cada podólogo ve las suyas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-021 · ¿Qué es una "queja" y cuáles son las categorías? ¿Se separan las administrativas de los eventos adversos?
*Origen:* mockups 14†, 42†, 31† · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 14 mezcla tipos (tiempo de espera, cobro, trato, dolor, infección posterior, instrumental) con gravedad y estado; la nota 14-2 pregunta si se separan administrativas y eventos adversos clínicos; 42 pregunta categorías y quién registra; 31 pregunta si cuentan las de la encuesta NPS. Además las cifras no coinciden: 14 reporta 14 quejas en octubre (12 sumando por podólogo, 14 por sede), 31 reporta 5 y 42 reporta 5.

**Por qué importa.** Define las dos entidades (¿una o dos?), el conteo en dashboard y reportes pedidos por el dueño (quejas por podólogo/sede/día/mes/año) y qué debe notificarse como evento adverso.

**Opciones**
- **A · RECOMENDADA** — Una sola entidad con tipo (administrativa / evento adverso clínico) y gravedad; solo cuentan las registradas manualmente, la encuesta NPS baja de nota no crea queja automática
- **B** — Dos módulos separados
- **C** — Las respuestas de encuesta con nota baja crean queja automática

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-022 · Quejas: ¿quién autoriza reembolsos, descuentos o consultas gratis como compensación?
*Origen:* mockups 14†, 17† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 14 muestra compensaciones (reembolso $150, descuento 20%, consulta de control sin costo).

**Por qué importa.** Impacta caja, ingresos y la regla de descuentos; hace falta un monto o porcentaje a partir del cual se requiere administrador.

**Opciones**
- **A · RECOMENDADA** — Recepción/podólogo propone y administración autoriza siempre que haya costo
- **B** — Límites por monto
- **C** — Cualquier usuario con permiso aplica

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-023 · Esterilización: ¿cada cuánto se hace el indicador biológico, quién lo interpreta y se puede liberar un lote con resultado pendiente?
*Origen:* mockups 15† · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 15 muestra lotes "Liberado" con indicador biológico "Pendiente 24 h" y kits identificados por código; la nota pregunta cada cuánto se hace, quién lo interpreta y si los kits se manejan por QR o se eligen a mano. La pantalla además muestra un kit (K-12) usado a las 09:00 y a las 11:00 de la misma mañana con el mismo lote.

**Por qué importa.** Es trazabilidad sanitaria: si el biológico resulta positivo hay que rastrear pacientes. Define estados del lote y si un kit se reutiliza sin nuevo ciclo.

**Opciones**
- **A · RECOMENDADA** — Lote "liberado condicionado" mientras el biológico está pendiente; si resulta positivo se bloquea y se listan los pacientes atendidos; kits por código/QR
- **B** — Solo se libera con biológico negativo
- **C** — Sin biológico en el sistema

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-024 · ¿Qué formato exige la autoridad sanitaria para la bitácora de esterilización y quién firma?
*Origen:* mockups 15†, 41† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 15 y la pestaña "Esterilización (lotes)" de 41 muestran lotes con temperatura, presión y tiempo, pero no se sabe si ese formato cumple lo exigible ni quién lo firma. En 15 los autoclaves están en Roma Norte y Condesa, en 41 en Coyoacán.

**Por qué importa.** La bitácora es evidencia ante verificación sanitaria. Un campo faltante no se puede reconstruir después.

**Opciones**
- **A · RECOMENDADA** — Pedir al cliente el formato oficial o el que usa su verificador y ajustar campos; hasta entonces se conservan los campos de 15
- **B** — Usar solo los campos de 15
- **C** — No es requisito del producto

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-025 · ¿"Quién atendió" se toma de la cita o de la nota firmada? ¿Qué pasa con suplencias y co-atención?
*Origen:* mockups 42†, 02, 47, 17 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 42 pregunta de dónde sale "quién atendió"; 02 muestra "Atendió" por consulta, 17 muestra "Atendió / vendió" por concepto del ticket (puede ser distinto en la misma venta), y 47 responde "quién atendió la sesión anterior".

**Por qué importa.** Es una de las preguntas textuales del dueño; si cita y nota difieren (suplencia), el reporte, las comisiones y las quejas apuntan a personas distintas.

**Opciones**
- **A · RECOMENDADA** — Atendió = quien firma la nota; la cita guarda el asignado y ambos se conservan si difieren
- **B** — Atendió = quien tiene asignada la cita
- **C** — Se pueden registrar dos atendiendo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-026 · Plan de tratamiento abandonado: ¿qué pasa con el precio y con el anticipo?
*Origen:* mockups 05†, 20† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 05 lista estados En curso/Pausado/Abandonado/Concluido y la nota pregunta si se reembolsa o prorratea el anticipo. No se define cuándo un plan se considera abandonado ni qué ocurre con las citas auto-generadas ni con el saldo.

**Por qué importa.** Afecta ingresos (¿se reconoce lo cobrado no utilizado?), cuentas por cobrar, inventario y el seguimiento de pacientes.

**Opciones**
- **A · RECOMENDADA** — Abandonado tras X días configurables sin cita; el anticipo no se reembolsa si la política de cancelación lo establece; se cierra el plan y se cancelan citas futuras
- **B** — Reembolso prorrateado por sesiones no usadas
- **C** — Ninguna regla automática; el administrador decide caso por caso

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-027 · ¿La curación gratuita incluida en un plan la define Pie Firme o cada clínica por plantilla? ¿Quién edita las plantillas de plan?
*Origen:* mockups 05†, 19, 20 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 05 y 19 incluyen curaciones a $0 "incluidas"; la nota pregunta si es política de la plataforma o de cada clínica.

**Por qué importa.** Define si la plantilla de plan es global (RANNIX) o por clínica y cómo cambia sin tocar planes ya vendidos.

**Opciones**
- **A · RECOMENDADA** — Plantillas base de RANNIX copiadas a cada clínica, que las edita libremente (los cambios no afectan planes ya vendidos)
- **B** — Solo plantillas de RANNIX
- **C** — Cada clínica crea las suyas desde cero

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-028 · ¿Cuántas citas tiene el plan de extracción de uña?
*Origen:* mockups 05, 19, 20, 02 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** El dueño dijo que tras una extracción se agendan 3 citas posteriores. 05 muestra 3 sesiones en total (extracción + 2 curaciones, intervalos de 1 y 2 semanas); 19 dice "3 curaciones (día 7, 14 y 28)" para extracción parcial; 20 (PL-002) dice "extracción + 3 curaciones" por $800; 02 muestra extracción parcial 1/3 y seguimientos a 14 días (2/3 y 3/3). La extracción parcial cuesta $1,350 en 02 y 05 y $800/$850 en 19 y 20.

**Por qué importa.** La cantidad y los intervalos determinan la plantilla de plan, el precio y la lógica de cumplimiento. Hay cuatro versiones.

**Opciones**
- **A · RECOMENDADA** — Definir con el cliente la plantilla estándar (nº de citas, intervalos, precio) y que las demás sean variantes editables
- **B** — Tomar 05 como referencia
- **C** — Tomar 19/20 como referencia

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-029 · Plan multi-sesión: ¿qué tolerancia tiene la ventana de días y cuándo se considera una sesión "tarde"?
*Origen:* mockups 05, 20, 16 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 05 y 20 hablan de una ventana de 30–35 días para láser y de "proponer cita"; no se dice qué pasa si el paciente viene antes o después, si cuenta como la sesión siguiente, ni si se pierde el saldo.

**Por qué importa.** Es la regla de caso borde más frecuente en láser; define alertas de "plan atrasado" y la métrica de cumplimiento.

**Opciones**
- **A · RECOMENDADA** — La ventana es una recomendación; cualquier cita posterior cuenta como la siguiente sesión, y fuera de ventana solo marca "atrasada"
- **B** — Fuera de ventana el sistema avisa y pide autorización
- **C** — Fuera de ventana se pierde la sesión

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-030 · ¿Los antecedentes (HbA1c, medicamentos, alergias) se guardan "como estaban" en cada consulta o solo hay una ficha vigente?
*Origen:* mockups 03, 02, 06 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 03 dice que la revisión rápida de antecedentes "se actualiza en la ficha"; 06 capta HbA1c con fecha; 02 resume antecedentes clave.

**Por qué importa.** Si solo hay ficha vigente, una nota de hace dos años mostraría datos de hoy (problema legal y clínico). Define si cada consulta guarda su instantánea.

**Opciones**
- **A · RECOMENDADA** — Cada consulta guarda una instantánea de lo que se capturó; la ficha vigente se actualiza aparte
- **B** — Solo ficha vigente con bitácora de cambios
- **C** — Solo instantánea

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-031 · Catálogo de diagnósticos (CIE-10) y de procedimientos: ¿completo o recortado, y quién lo mantiene?
*Origen:* mockups 02, 03, 06, 07 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** Los mockups muestran códigos CIE-10 (L60.0, L84, E11.5, B35.1, M21.4) y un catálogo de procedimientos; el requerimiento marca "CIE-10 a validar".

**Por qué importa.** Un catálogo completo es grande; uno recortado puede dejar fuera un diagnóstico real. Define búsquedas, mantenimiento y versionado.

**Opciones**
- **A · RECOMENDADA** — Catálogo CIE-10 de referencia cargado una vez (global de RANNIX, solo lectura) y subconjunto "favoritos" por clínica; procedimientos propios por clínica
- **B** — Solo favoritos por clínica
- **C** — Texto libre sin catálogo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-032 · ¿Qué hace el sistema cuando el paciente tiene una alergia que choca con lo que se va a usar o indicar?
*Origen:* mockups 02, 03, 21 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 03 captura anestesia, medicamentos y productos usados (con lote); 02 muestra alergias a látex y lidocaína. No se dice si el sistema solo avisa o impide guardar.

**Por qué importa.** Determina si la alerta es informativa o bloqueante; una alerta bloqueante necesita catálogo de sustancias.

**Opciones**
- **A · RECOMENDADA** — Solo aviso visible y registro de que el podólogo lo vio; nunca bloquea
- **B** — Bloquea hasta confirmar con motivo
- **C** — Sin aviso automático

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## B. Agenda, reservas, portal y seguimiento de pacientes

### P-033 · Política de cancelación: ¿con cuántas horas de aviso, qué se pierde y es igual para todos los servicios y sedes?
*Origen:* mockups 11†, 25†, 27†, 26† · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** El portal usa 48 h como ejemplo (25, 26, 27); 27 dice que con menos de 48 h el anticipo no es reembolsable y pregunta si se puede cancelar o reprogramar el mismo día. 11 pregunta si el anticipo es por servicio o igual para todos. El requerimiento menciona "reglas de cancelación" sin valores.

**Por qué importa.** Es la regla que mueve dinero: reembolso, ingreso retenido y métrica de faltas. Debe quedar como configuración por clínica (¿y por servicio?) y congelarse al momento de agendar.

**Opciones**
- **A · RECOMENDADA** — Parámetros por clínica: horas de aviso (ejemplo 48 h), con anticipo no reembolsable fuera de plazo; mismo día = fuera de plazo
- **B** — Parámetros por servicio
- **C** — Regla única de RANNIX para todas las clínicas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-034 · Anticipo al agendar: ¿es obligatorio, de cuánto y por servicio o por clínica?
*Origen:* mockups 25†, 45†, 11†, 05†, 07† · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** Los mockups usan montos incompatibles: 25 y 26 cobran $200 por una cita de $400 (50%); 11 pide $150 de $530 (28%); 05 pide $300 de un plan de $1,350 (22%); 07 pide $1,000 de plantillas; 45 configura "anticipo 30%" con la integración de Clip activa. La nota 25 pregunta monto o porcentaje o pago completo.

**Por qué importa.** Contradicción directa entre pantallas. Define el campo del servicio o de la clínica, el cálculo y el redondeo, y qué se muestra en el portal.

**Opciones**
- **A · RECOMENDADA** — Porcentaje configurable por clínica (30% como en 45) con posibilidad de monto fijo por servicio; servicios "a valorar" sin anticipo
- **B** — Siempre monto fijo por servicio
- **C** — Pago completo en línea

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-035 · Reembolso del anticipo: ¿quién lo hace (Clip o la clínica), en cuánto tiempo y quién absorbe la comisión?
*Origen:* mockups 26†, 27† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 27 promete reembolso a la tarjeta "en 5 a 10 días hábiles" si se cancela con más de 48 h; la nota 26 pregunta quién reembolsa. No se menciona qué pasa con la comisión de Clip ya cobrada.

**Por qué importa.** Define flujos de dinero, conciliación (36) y qué mensaje se promete al paciente en una página pública.

**Opciones**
- **A · RECOMENDADA** — Reembolso solicitado desde el sistema vía Clip; la comisión no se devuelve y la absorbe la clínica
- **B** — Reembolso manual por la clínica fuera del sistema
- **C** — La clínica elige

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-036 · Retención del horario durante el pago: ¿cuántos minutos y qué pasa si se agota?
*Origen:* mockups 26†, 11 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 26 dice "tu horario está apartado por 10 minutos" y explica tres posibles resultados del pago.

**Por qué importa.** Define el bloqueo temporal en la agenda (concurrencia con recepción) y la expiración.

**Opciones**
- **A · RECOMENDADA** — 10 minutos, configurable; al vencer se libera y recepción lo ve como "retenido" mientras tanto
- **B** — 15 minutos
- **C** — Sin retención: gana quien pague primero

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-037 · Concurrencia en agenda: si recepción y el portal toman el mismo hueco, o dos recepciones editan la misma cita, ¿quién gana?
*Origen:* mockups 11, 26, 01 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** No se muestra ninguna regla. El requerimiento exige "agenda sin duplicados". 11 detecta conflicto de cabina al momento de capturar.

**Por qué importa.** Evita citas dobles. Define bloqueo optimista, mensajes y qué ve la segunda persona.

**Opciones**
- **A · RECOMENDADA** — La primera confirmación gana; la segunda recibe aviso y se le ofrecen horarios cercanos; no se permiten citas empalmadas del mismo recurso salvo sobrecupo autorizado
- **B** — Bloqueo exclusivo al abrir el formulario
- **C** — Se permite el empalme con aviso

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-038 · Reprogramar: ¿cuántas veces, hasta cuándo y a qué costo?
*Origen:* mockups 27† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 27 conserva el anticipo al reprogramar con más de 48 h. No se dice cuántas veces ni qué pasa con menos de 48 h.

**Por qué importa.** Evita abusos y define si el anticipo se pierde o se traslada.

**Opciones**
- **A · RECOMENDADA** — Hasta 2 reprogramaciones sin costo con más de 48 h; con menos cuenta como cancelación
- **B** — Ilimitadas sin costo
- **C** — Solo mediante recepción

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-039 · Recordatorios: ¿cuántos, con qué anticipación y por qué canal?
*Origen:* mockups 11†, 05, 27, 45, 09, 16† · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** Las pantallas no coinciden: 11 programa 24 h y 2 h antes por WhatsApp + correo; 05 recordatorio 24 h por WhatsApp/SMS/correo; 27 muestra el mensaje a 48 h; 45 configura 24 h por correo/SMS; 09 envía la liga de videoconsulta 15 min antes por WhatsApp y correo. Además, el alcance del requerimiento marca WhatsApp como incluido, pero faltan proveedor y costo.

**Por qué importa.** Cada mensaje cuesta; hay que decidir plantillas, horarios y quién paga el volumen.

**Opciones**
- **A · RECOMENDADA** — Un recordatorio configurable por clínica (24 h por defecto) más confirmación con liga; segundo aviso opcional
- **B** — Dos avisos fijos (24 h y 2 h)
- **C** — Solo correo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-040 · WhatsApp: ¿proveedor, costo, el 55 1412 0283 es WhatsApp y hay un número por sede?
*Origen:* mockups 25†, 11†, 16†, 45, 28† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 25 pregunta si el número es WhatsApp y si hay uno por sede; 45 activa WhatsApp "por sede"; 11 atribuye la cita de WhatsApp a una sede. No hay proveedor (API oficial u otro) ni costo.

**Por qué importa.** Es una integración de terceros con costo por mensaje y plantillas aprobadas; la atribución a sede depende del número.

**Opciones**
- **A · RECOMENDADA** — Un proveedor de la API oficial de WhatsApp con un número por sede para atribuir; el costo se repercute a la clínica
- **B** — Un número único para la clínica
- **C** — Enlace "wa.me" sin integración

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-041 · Lista de espera: ¿cómo se prioriza y cuánto tiempo se da a un paciente notificado?
*Origen:* mockups 12† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 12 muestra prioridad Alta/Media/Baja, reglas "por definir": notificar automáticamente, 30 min al primero, vencer a los 14 días, respetar prioridad clínica sobre antigüedad.

**Por qué importa.** Define quién asigna la prioridad (¿clínico o recepción?) y evita ofrecer el mismo hueco a dos personas.

**Opciones**
- **A · RECOMENDADA** — Prioridad la asigna recepción con criterio clínico indicado por el podólogo; 30 min de ventana y luego pasa al siguiente; vence a los 14 días (los valores de 12)
- **B** — Orden por antigüedad
- **C** — Solo manual

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-042 · Sobrecupo controlado: ¿quién autoriza y cuántos como máximo?
*Origen:* mockups 11 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 11 muestra "Sobrecupo controlado (autoriza: administración)".

**Por qué importa.** Es una excepción a la regla de no empalme; necesita límite y bitácora.

**Opciones**
- **A · RECOMENDADA** — Autoriza administración, máximo configurable por podólogo y día, con registro
- **B** — Autoriza el propio podólogo
- **C** — No se permite

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-043 · Duración de cita y margen entre citas (limpieza, esterilización)
*Origen:* mockups 11, 19, 05 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 11: "40 min, por servicio, editable"; 19 tiene duración por servicio; 05 tiene duración por sesión. No se habla de margen entre citas ni de tiempo de preparación de la cabina ni de duración distinta por podólogo (45 dice que se edita en su perfil).

**Por qué importa.** Afecta el cálculo de disponibilidad, ocupación de agenda y cuántas citas caben al día.

**Opciones**
- **A · RECOMENDADA** — Duración por servicio, editable por cita; margen configurable por sede
- **B** — Duración por podólogo
- **C** — Fija por servicio sin edición

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-044 · Visita a domicilio: ¿cómo se asignan zonas, viáticos y recargo, y cómo se agenda?
*Origen:* mockups 11, 19, 25, 01, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 11 captura dirección, viáticos y ruta; 19 tiene "visita a domicilio (recargo) desde $400" pausado; 25 lo ofrece en portal con cobertura por zona; 45 modela el domicilio como cabina "ruta móvil".

**Por qué importa.** Tiempo de traslado, zonas cubiertas y quién cobra el viático son reglas de dinero y de agenda.

**Opciones**
- **A · RECOMENDADA** — Servicio con zona y recargo configurables; el tiempo de traslado bloquea la agenda del podólogo
- **B** — Tarifa fija sin zonas
- **C** — Se cotiza cada vez por teléfono

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-045 · Estados de la cita: ¿qué transiciones se permiten, quién las marca y cuándo se marca "No asistió"?
*Origen:* mockups 01, 11, 17, 27, 30 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 01/11 listan Por confirmar, Confirmada, En camino, No asistió, Cancelada, Atendida (01 añade "Plan"). No se dice si "No asistió" es manual o automático, si se puede revertir, qué ocurre con el anticipo ni cuándo una cita pasa a "Atendida" (¿al cerrar la nota? ¿al cobrar?).

**Por qué importa.** Mueve métricas (ocupación, faltas), comisiones (se descuenta una sesión del plan "al marcar atendida"), inventario y cobros.

**Opciones**
- **A · RECOMENDADA** — "Atendida" cuando se firma la nota o se cobra; "No asistió" manual por recepción tras X minutos; todo cambio queda en bitácora y se permite revertir al administrador
- **B** — Estados automáticos por hora
- **C** — Solo manuales sin reglas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-046 · Zona horaria y corte del día
*Origen:* mockups 25, 17, 48, 32 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 25 dice "Zona horaria: Ciudad de México". Las clínicas clientes pueden estar en otro estado u otra zona. Tampoco se dice a qué hora termina el "día" para ingresos y cortes (00:00 o cierre de turno, 17 muestra turno matutino 08:00–15:00).

**Por qué importa.** Un cobro a las 23:50 o una cita en otra zona cambia de día; afecta cortes, reportes diarios y recordatorios.

**Opciones**
- **A · RECOMENDADA** — Zona horaria configurable por clínica/sede (por defecto Ciudad de México); el día contable cierra con el corte de caja de cada sede
- **B** — Una sola zona para todo RANNIX
- **C** — Día natural 00:00–23:59 siempre

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-047 · Horarios de podólogos, festivos y vacaciones: ¿cómo bloquean la agenda?
*Origen:* mockups 45, 39, 11 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 45 dice que horarios por podólogo se editan en su perfil y que bloqueos y festivos van en la configuración de clínica; 39 muestra vacaciones autorizadas (L. Soto 9–13 nov); 11 muestra "bloqueado: comida".

**Por qué importa.** ¿Una vacación aprobada en RH bloquea automáticamente la agenda? ¿Qué se hace con citas ya agendadas en ese periodo?

**Opciones**
- **A · RECOMENDADA** — Las vacaciones autorizadas bloquean la agenda y avisan de las citas afectadas para reprogramar
- **B** — Los bloqueos se capturan aparte en agenda
- **C** — Sin vínculo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-048 · "Cualquiera disponible": ¿con qué criterio se asigna el podólogo?
*Origen:* mockups 25, 12 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 25 ofrece "Cualquiera disponible, te asignamos el primer horario libre".

**Por qué importa.** Afecta la distribución de pacientes y ocupación por podólogo (y comisiones).

**Opciones**
- **A · RECOMENDADA** — Primer horario libre, desempate por menor carga del día
- **B** — Siempre el primero de la lista
- **C** — Se quita la opción

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-049 · Ligas del portal sin cuenta: ¿cuánto duran y cómo se protegen de abuso?
*Origen:* mockups 27, 25, 29, 09 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 27 usa una liga corta del recordatorio (piefirme.rannix.com/c/xxxx) y muestra "Liga vencida"; 29 usa una liga de la sala. No se dice la vigencia, intentos, límite de reservas por teléfono o correo ni si hay CAPTCHA.

**Por qué importa.** El portal es público: sin límites se puede inundar la agenda con reservas falsas y exponer datos si la liga se adivina.

**Opciones**
- **A · RECOMENDADA** — Token largo de un solo uso por cita con vencimiento a la hora de la cita; límite de reservas por contacto; protección anti-bots
- **B** — Liga permanente
- **C** — Solo por teléfono

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-050 · PWA: ¿qué roles la usan y qué se consulta sin conexión?
*Origen:* mockups 30† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 30 muestra "modo sin conexión: solo consulta" para podólogo; la nota pregunta si también recepción y qué datos (agenda del día, expedientes de pacientes citados).

**Por qué importa.** Guardar expedientes en el dispositivo es riesgo de privacidad (pérdida del teléfono); define caché y borrado remoto.

**Opciones**
- **A · RECOMENDADA** — Podólogo y recepción; sin conexión solo agenda del día y datos mínimos del paciente (nunca fotos ni notas completas) con borrado al cerrar sesión
- **B** — Solo podólogo
- **C** — Todo el expediente del día

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-051 · Cancelar o corregir citas ya atendidas o pasadas: ¿quién y con bitácora?
*Origen:* mockups 01, 11, 43 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** No se muestra cómo se corrige una cita equivocada ni si se puede borrar. 43 solo muestra eventos de "Registro eliminado" como filtro.

**Por qué importa.** Cualquier corrección retroactiva cambia ingresos, comisiones y reportes. La regla de autoridad debe ser explícita.

**Opciones**
- **A · RECOMENDADA** — Nunca se borra: se cancela con motivo; las citas atendidas solo se corrigen por administración con bitácora
- **B** — Recepción corrige dentro del mismo día
- **C** — Cualquiera con permiso de edición

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-052 · CRM: ¿cuántos meses sin venir hace "inactivo"? ¿qué es "revisión vencida" por servicio?
*Origen:* mockups 16†, 45 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 16 usa 6 meses para inactivo (45 usa 180 días) y define "revisión vencida" por servicio (4–6 semanas pedicure, 30–35 días láser, 1–3 meses pie diabético). Además "activos" son los de los últimos 12 meses (1,142) y los inactivos más de 6 meses (218): los dos conjuntos se traslapan entre el mes 6 y el 12.

**Por qué importa.** Es la definición de dos tarjetas del tablero y de las campañas; sin una regla común las cifras se contradicen.

**Opciones**
- **A · RECOMENDADA** — Cada servicio declara su propio intervalo de revisión (campo de 19) y "inactivo" es una constante configurable por clínica (180 días); "activo" = no inactivo
- **B** — Un intervalo único
- **C** — Solo manual

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-053 · Campañas y cumpleaños: ¿quién autoriza el texto y el descuento y qué consentimiento se necesita?
*Origen:* mockups 16†, 10, 45 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 16 envía campañas "Te extrañamos" con valoración sin costo; excluye a quienes no dan consentimiento de comunicaciones (10 lo captura, opcional). La nota pregunta quién autoriza texto y descuento y menciona que WhatsApp aún no tiene proveedor.

**Por qué importa.** Control de publicidad, costo del descuento y legalidad del contacto.

**Opciones**
- **A · RECOMENDADA** — Solo administración crea y aprueba campañas; el consentimiento de contacto es obligatorio para enviar
- **B** — Recepción puede crear, administración aprueba
- **C** — Libre

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-054 · Encuestas y NPS: ¿cuándo se envían, a quién y qué hace una calificación baja?
*Origen:* mockups 16, 14, 31 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 16 muestra NPS +54 con 187 respuestas, 14 muestra satisfacción tras resolución 4.1/5, 31 pregunta si las encuestas generan quejas.

**Por qué importa.** Define la fórmula del NPS y el flujo de seguimiento de detractores.

**Opciones**
- **A · RECOMENDADA** — Encuesta tras la cita atendida (1 por paciente por periodo configurable); NPS estándar; calificación baja avisa a administración sin crear queja automática
- **B** — No hay encuesta en esta versión
- **C** — Encuesta por queja resuelta

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## C. Ventas y facturación (caja, precios, IVA, CFDI, planes y paquetes)

### P-055 · ¿Qué descuento puede dar Recepción sin autorización y desde qué porcentaje se pide PIN de administrador?
*Origen:* mockups 17†, 20 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 17 muestra descuento de línea (10% autorizado por la propia recepcionista) y descuento global con motivo; también hay promociones y paquetes.

**Por qué importa.** Define permisos, bitácora de descuentos y el margen. Cambia el cálculo de comisiones (¿sobre precio de lista o cobrado?).

**Opciones**
- **A · RECOMENDADA** — Recepción hasta un porcentaje configurable (valor por definir con el cliente); arriba pide PIN de administración; todo descuento con motivo
- **B** — Todo descuento requiere administrador
- **C** — Libre con bitácora

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-056 · IVA: ¿los servicios de podología van exentos y los productos al 16%? ¿Los precios publicados incluyen IVA?
*Origen:* mockups 17†, 18†, 45†, 19, 28†, 23 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 17, 18 y 19 asumen servicios exentos y productos 16%; 45 deja "Servicios de salud exentos de IVA: por definir"; la nota 17 dice "validar con contador". En 17 los precios incluyen IVA (el IVA "incluido" se calcula sobre productos), en 18 el CFDI desglosa valor unitario sin IVA y en 23 los costos de compra son sin IVA.

**Por qué importa.** Cambia precios, CFDI, EDR, inventario y reportes fiscales. Una clínica con servicios gravados o mixtos (plantillas, productos) necesita configuración por concepto.

**Opciones**
- **A · RECOMENDADA** — Atributo de IVA por concepto del catálogo (exento / 16% / tasa 0); precios de venta con IVA incluido; confirmar con contador del cliente (no es asesoría legal)
- **B** — Todo gravado
- **C** — Todo exento

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-057 · Redondeos entre ticket, CFDI y descuentos
*Origen:* mockups 17, 18, 19, 23 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** El ticket de 17 aplica $25 de descuento (10% de $250 con IVA) y el CFDI de 18 aplica $21.55 sin IVA; totales cuadran en $1,810.00 y el IVA de $194.48 coincide, pero no se dice dónde se redondea (por línea o por total) ni a cuántos decimales. En compras (23) el descuento de $393.30 y el IVA de $2,367.31 parecen aplicarse sobre bases distintas.

**Por qué importa.** Una diferencia de centavos hace que el CFDI no coincida con el ticket y que la conciliación falle.

**Opciones**
- **A · RECOMENDADA** — Cálculo por línea a 2 decimales, IVA calculado sobre la base neta de cada línea y totales como suma de líneas; documentar un ejemplo único
- **B** — Redondeo solo en el total
- **C** — Redondeo a peso

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-058 · ¿Cuántos turnos por día y por caja hay en cada sede y quién autoriza un cierre con diferencia?
*Origen:* mockups 17† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 17 muestra turno matutino 08:00–15:00 (abierto a las 08:02) y un corte con diferencia de –$20 justificada. No se dice si hay turno vespertino ni una tolerancia.

**Por qué importa.** Define la entidad turno/caja, el corte automático y el umbral de diferencia que requiere administración.

**Opciones**
- **A · RECOMENDADA** — Un turno por caja/cajero (configurable); diferencia dentro de una tolerancia se justifica por el cajero; arriba requiere administración
- **B** — Un corte diario por sede
- **C** — Sin tolerancia

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-059 · Corte de caja: ¿qué entra en "ventas totales del turno"?
*Origen:* mockups 17, 32 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** En 17 las ventas totales del turno ($19,860) suman efectivo, tarjeta, SPEI, Clip, gift card y los anticipos aplicados ($1,000), aunque la propia pantalla aclara que los anticipos "no son dinero del turno"; las cancelaciones (–$250) aparecen aparte. 32 muestra "Efectivo a depositar" igual al total en efectivo del cobro, sin restar retiros ni gastos de caja.

**Por qué importa.** Si no se define qué es "venta", "cobro" y "efectivo a depositar", el corte, el ingreso y el depósito dan cifras distintas.

**Opciones**
- **A · RECOMENDADA** — Separar: venta (devengada), cobro del turno (dinero recibido) y anticipos aplicados; efectivo a depositar = fondo + efectivo – retiros – cancelaciones en efectivo
- **B** — Tal como se muestra
- **C** — Solo efectivo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-060 · Cancelar o reimprimir un ticket: ¿quién, hasta cuándo y qué pasa con inventario, CFDI y comisiones?
*Origen:* mockups 17, 18, 43 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 17 tiene "Cancelar venta" y la hoja de corte muestra una cancelación; 18 tiene cancelación y nota de crédito del CFDI. No hay reglas de quién puede, ni de reimpresión de ticket.

**Por qué importa.** Cada cancelación afecta caja, inventario (¿regresa el producto?), comisiones y fiscal.

**Opciones**
- **A · RECOMENDADA** — Recepción cancela en el mismo turno; después solo administración con motivo; ticket cancelado nunca se borra; reimpresión marcada "copia"
- **B** — Solo administración
- **C** — Libre

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-061 · Facturación: ¿qué PAC se usa y cada clínica carga sus propios certificados? ¿Qué claves SAT se usan?
*Origen:* mockups 45†, 18† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 18 y 45 dicen "PAC por definir" y muestran certificados (CSD) propios de la clínica. Las claves SAT de producto y unidad son sugerencias a validar con contador.

**Por qué importa.** Define el proveedor, el costo por timbre, la seguridad de llaves privadas y el catálogo SAT que alimenta el catálogo de productos y servicios.

**Opciones**
- **A · RECOMENDADA** — Cada clínica sube su CSD (guardado cifrado) y timbra con el PAC elegido por RANNIX; claves SAT configurables por concepto
- **B** — RANNIX timbra con un solo certificado
- **C** — La clínica trae su propio PAC

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-062 · ¿Cómo se factura un anticipo (CFDI de anticipo con relación 07) y al aplicarlo?
*Origen:* mockups 18†, 17, 25 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 17 aplica un anticipo de $200 (ANT-0412, reserva en línea con Clip) a la venta; la nota 18 pregunta cómo se refleja en el CFDI.

**Por qué importa.** El anticipo es ingreso fiscal y debe relacionarse con la factura final; afecta los totales mostrados.

**Opciones**
- **A · RECOMENDADA** — Pedir al contador la regla; mientras tanto el sistema registra el anticipo como cobro ligado y permite relacionar el CFDI
- **B** — No se factura el anticipo; solo la venta final con el anticipo restado
- **C** — Se factura cada anticipo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-063 · CFDI: ¿quién puede cancelar o sustituir y hasta cuándo?
*Origen:* mockups 18† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 18 muestra cancelación con motivos SAT (01–04), estatus "cancelación en proceso" esperando al receptor, borradores y reenvío.

**Por qué importa.** El SAT limita plazos y exige aceptación; hay que definir permisos y qué estados espera el sistema.

**Opciones**
- **A · RECOMENDADA** — Solo administración cancela, con motivo SAT y comentario interno; los estados siguen al SAT (vigente, en proceso, cancelada)
- **B** — Recepción cancela en el mismo mes
- **C** — Cualquier usuario

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-064 · CFDI: ¿hasta cuándo se puede facturar un ticket, se factura a público en general y hay factura global?
*Origen:* mockups 18, 17 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 18 permite "Facturar a público en general (XAXX010101000)" y muestra tickets por facturar ($14,260 pendientes). No se dice el plazo para facturar un ticket (¿mismo mes?), ni si hay factura global mensual, ni si el paciente puede pedirla desde el portal.

**Por qué importa.** Tickets viejos sin facturar y facturas globales cambian el EDR y obligaciones fiscales.

**Opciones**
- **A · RECOMENDADA** — Plazo configurable (mismo mes por defecto); factura global mensual de lo no solicitado, validada con el contador
- **B** — Solo factura individual
- **C** — Sin plazo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-065 · Notas de crédito y devoluciones: ¿quién las emite y se regresa el dinero en caja?
*Origen:* mockups 18, 17, 23 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 18 muestra nota de crédito con opción "Devolver dinero en caja"; en compras (23) hay "Registrar devolución a proveedor".

**Por qué importa.** Impacto en caja, inventario y comisiones.

**Opciones**
- **A · RECOMENDADA** — Solo administración, con motivo, relacionando el CFDI original; el dinero sale de caja con registro de retiro
- **B** — Recepción hasta cierto monto
- **C** — Sin devolución de dinero (solo saldo a favor)

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-066 · Datos fiscales del paciente: ¿cuándo se pueden cambiar y qué pasa con facturas ya timbradas?
*Origen:* mockups 10, 18, 26 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 10 los marca opcionales y permite "facturar siempre automáticamente"; 18 permite guardarlos al facturar; 26 los pide en el portal.

**Por qué importa.** Cambios de RFC o régimen no deben modificar CFDI ya emitidos; la facturación automática debe tener control.

**Opciones**
- **A · RECOMENDADA** — Los datos de un CFDI timbrado se congelan en el comprobante; el perfil del paciente puede cambiar para los siguientes; facturación automática solo con consentimiento y datos validados
- **B** — Solo captura por factura
- **C** — Obligatorios en el alta

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-067 · ¿Se cobra distinto la primera visita, la segunda y la curación, o hay tarifa por perfil (adulto mayor)?
*Origen:* mockups 19† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 19 pregunta si hay precio escalonado o por perfil; el modelo de tipos de precio (fijo, desde, por unidad, a valorar, gratis) ya se muestra.

**Por qué importa.** Cambia el catálogo (¿regla de precio por contexto?) y el cálculo en caja y portal.

**Opciones**
- **A · RECOMENDADA** — Un precio por servicio (con precio por sucursal) y excepciones por plan o promoción; sin tarifas por perfil
- **B** — Tarifa por perfil de paciente
- **C** — Precio escalonado por visita

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-068 · Si cambia un precio, ¿qué pasa con citas ya agendadas, planes vendidos, paquetes y comisiones?
*Origen:* mockups 19, 20, 05, 40 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 19 conserva el histórico de precios con vigencia y quién cambió; no se dice si una cita agendada hoy a $800 se cobra al nuevo precio de mañana, ni cómo se comportan planes ya pagados.

**Por qué importa.** Regla de "histórico" más importante del producto: congelar vs. recalcular.

**Opciones**
- **A · RECOMENDADA** — El precio se congela al agendar (o al venderse un plan/paquete); cobros ya emitidos nunca cambian; la vigencia aplica a lo nuevo
- **B** — El precio se toma al cobrar
- **C** — Se recalculan citas futuras

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-069 · Precios y composición de servicios: ¿cuál es el correcto?
*Origen:* mockups 02, 05, 07, 11, 19, 20, 25, 17 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** Mismo servicio, distinto precio entre pantallas: uña encarnada $530 en 11, 19 y 25 pero 19 indica $590 en Roma Norte (y 11 es Roma Norte); extracción parcial $1,350 en 02 y 05 contra $800/$850 en 19 y 20; estudio de pisada $1,790 en 07 contra $1,200 en 19, 20 y 25; plantillas $2,100 en 02 y 07 contra $2,500 en 20 (y $450 prefabricada en 19); láser $300 por uña en 19 y 25 contra $1,500 el plan de 6 sesiones en 20 y $1,500 por sesión en 32/38.

**Por qué importa.** Son datos de ejemplo, pero definen la semilla del catálogo y las expectativas del cliente.

**Opciones**
- **A · RECOMENDADA** — El cliente aporta su lista oficial de servicios y precios para sembrar el catálogo; los precios de los mockups son solo ilustrativos
- **B** — Usar los precios de INVESTIGACION_PODOLOGIA.md
- **C** — Dejar el catálogo vacío en cada clínica nueva

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-070 · Planes y paquetes: ¿qué pasa con sesiones no usadas al caducar y con las reprogramadas?
*Origen:* mockups 20†, 05† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 20 define caducidad de 12 meses para el plan de láser; la nota pregunta qué pasa con sesiones sin usar y reprogramaciones.

**Por qué importa.** Ingreso diferido, saldo del paciente y cuentas por cobrar/pagar; posible obligación de reembolso.

**Opciones**
- **A · RECOMENDADA** — Al caducar se pierden las sesiones sin reembolso, con aviso previo 30 días; reprogramar no consume sesión
- **B** — Se amplía la vigencia una vez
- **C** — Reembolso de sesiones no usadas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-071 · Planes, membresías y gift cards usados en otra sede: ¿a qué sede se reconoce el ingreso, la comisión y el inventario?
*Origen:* mockups 20, 17, 40, 31 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 20 dice que el plan se puede usar en otra sede ("Sí"); 17 consume saldo del plan; el dashboard (31) reparte ingreso por sede y por podólogo.

**Por qué importa.** Cambia la métrica "ingreso por sede/podólogo", comisiones y la conciliación entre sedes (¿se liquida entre sedes?).

**Opciones**
- **A · RECOMENDADA** — Cada sesión se reconoce en la sede y con el podólogo que la atiende, valuada al precio prorrateado del plan
- **B** — Se reconoce todo en la sede que vendió
- **C** — Se reparte a partes iguales

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-072 · ¿Qué incluye la anualidad/membresía de la clínica?
*Origen:* mockups 20†, 02 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 20 pregunta qué incluye (beneficios "12 quiropodias básicas · 10% en productos · valoración sin costo" son ejemplo); 02 muestra la membresía "Pie Sano" y 20 la llama "Anualidad Pie Firme".

**Por qué importa.** Define beneficios, consumo, renovación y reconocimiento de ingreso.

**Opciones**
- **A · RECOMENDADA** — Las clínicas configuran sus beneficios; RANNIX no impone ninguna membresía
- **B** — Plantilla única de RANNIX
- **C** — No incluir en esta versión

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-073 · Gift cards: caducidad, saldo, uso en varias sedes y reconocimiento contable
*Origen:* mockups 20, 17 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 20 dice caducidad a 12 meses; 17 las acepta como método de pago; 20 las excluye de combinarse con promociones. No se dice si el dinero de una gift card es ingreso al venderla o al canjearla, ni si caduca el saldo.

**Por qué importa.** Define si es pasivo, ingreso diferido y si el saldo vencido puede perderse; hay normas de consumo por validar con abogado.

**Opciones**
- **A · RECOMENDADA** — Venta registra pasivo; ingreso al canjear; caducidad según política validada con abogado; usable en todas las sedes
- **B** — Ingreso al venderla
- **C** — No incluir

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-074 · Promociones: ¿acumulables, límites de uso y control de vigencia?
*Origen:* mockups 20, 17 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 20 muestra promoción con límite de 100 usos, no acumulable con paquete y programada para 13–16-nov; vencida PR-016.

**Por qué importa.** Reglas de precedencia (descuento de línea vs promo vs paquete).

**Opciones**
- **A · RECOMENDADA** — Una sola promoción por línea; las de paquete tienen prioridad; los usos se cuentan por clínica
- **B** — Acumulables
- **C** — Solo por código

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-075 · Plantillas ortopédicas: ¿se cobra anticipo, cuánto, y el estudio se descuenta del precio?
*Origen:* mockups 07†, 20 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 07 muestra costo del estudio $1,790, precio de plantillas $2,100, anticipo $1,000 en efectivo; 20 vende el paquete estudio + plantillas $3,400 (ahorro $300).

**Por qué importa.** Define el cobro por etapas (anticipo, entrega), garantía y reconocimiento de ingreso.

**Opciones**
- **A · RECOMENDADA** — Anticipo configurable por clínica; el estudio se acredita al comprar las plantillas dentro de un plazo
- **B** — Paquete único sin anticipo
- **C** — Se cobra todo al ordenar

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-076 · ¿Se da crédito a pacientes (saldos, apartados, convenios con empresas o aseguradoras)?
*Origen:* mockups 38†, 33 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 38 muestra saldos por cobrar a pacientes (planes, plantillas apartadas, citas sin cobro) con antigüedad; la nota pregunta por crédito y convenios.

**Por qué importa.** Si hay convenios con terceros, el modelo cambia (¿quién paga?); define alertas y cobranza.

**Opciones**
- **A · RECOMENDADA** — Solo saldos por servicios ya prestados o apartados; sin convenios en esta versión
- **B** — Con convenios a empresas/aseguradoras
- **C** — Nada se presta; todo se cobra

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-077 · Comisión de terminal y de Clip: ¿quién la absorbe y cómo se registra?
*Origen:* mockups 32, 35, 36, 40, 26 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 32 y 35 la registran como gasto ("Comisiones de terminal (Clip)"), 36 la detecta en el estado de cuenta y 40 pregunta si se descuenta a la comisión del podólogo.

**Por qué importa.** Cambia el ingreso neto, la conciliación y la base de comisiones.

**Opciones**
- **A · RECOMENDADA** — Gasto de la clínica; no se descuenta al podólogo; el cobro se registra bruto
- **B** — Se descuenta al podólogo en proporción
- **C** — El paciente la paga

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-078 · ¿El podólogo cobra o solo envía a caja? ¿Quién vende los productos?
*Origen:* mockups 03, 17, 44 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 03 "Enviar a caja" deja el cobro pendiente; 17 muestra "Atendió / vendió" por línea (servicio: podólogo; producto: recepcionista); 44 da al podólogo solo "ver" en caja.

**Por qué importa.** Atribución de ventas de producto, comisión (40 atribuye ventas al podólogo) y permisos.

**Opciones**
- **A · RECOMENDADA** — Siempre cobra caja; cada línea registra quién vende para fines de comisión
- **B** — El podólogo también puede cobrar
- **C** — La venta de producto no se atribuye al podólogo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## D. Inventario y compras

### P-079 · ¿Lote y caducidad en todos los productos o solo en algunos? ¿Los insumos clínicos se descuentan solos por cada servicio?
*Origen:* mockups 21†, 03, 23 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 21 maneja lote y caducidad en antimicóticos, cremas e insumos; las plantillas y protectores no tienen lote. 03 captura producto, lote y caducidad usados en la consulta, con casilla "cobrar". 21 mezcla productos de venta e insumos clínicos (guantes) en el mismo listado.

**Por qué importa.** Un descuento automático necesita una "receta" de consumo por servicio; sin ella, el inventario de insumos nunca cuadra. Lote en todo el catálogo hace lentísima la captura.

**Opciones**
- **A · RECOMENDADA** — Lote y caducidad solo donde el producto lo declare; los insumos clínicos se descuentan por lo que el podólogo captura en la consulta (sin receta automática en esta versión)
- **B** — Receta de consumo por servicio que descuenta automáticamente
- **C** — Lote obligatorio en todo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-080 · Traspasos: ¿quién confirma la recepción, qué se hace con faltantes o dañados y a qué valor se mueve?
*Origen:* mockups 22† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 22 modela Borrador → Enviado (en tránsito) → Recibido completo / con diferencias · Cancelado; el envío descuenta del origen y la recepción suma al destino; el costo del traspaso se muestra a costo promedio ($1,533 en pantalla, aunque con los costos de 21 las cuatro partidas suman $1,722).

**Por qué importa.** Define quién es dueño de la mercancía en tránsito, el ajuste de diferencias y si hay efecto financiero entre sedes (¿factura interna?).

**Opciones**
- **A · RECOMENDADA** — Recibe el responsable de la sede destino; las diferencias se registran como merma o reclamación con motivo; el traspaso se valúa a costo promedio sin facturación interna
- **B** — Diferencias las resuelve administración
- **C** — Facturación entre sedes

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-081 · Compras: ¿requieren autorización por monto y se genera cuenta por pagar al recibir?
*Origen:* mockups 23†, 38 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 23 muestra órdenes de compra con recepción parcial y factura del proveedor; "Cuentas por pagar $12,980 vence 08-nov". 38 muestra cuentas por pagar de proveedores distintos (Dental Supply, Podo Ortopedia, Láser Med, Autoclaves) a los del catálogo de 24 (Podomed, PodoFit, ICC...). En 23 el descuento de la línea de laca (5%) ya está en el importe y se vuelve a descontar en el total.

**Por qué importa.** Define flujo de aprobación, cuándo nace la deuda (¿al ordenar, al recibir o al registrar la factura?) y la relación compra → CxP → gasto → EDR.

**Opciones**
- **A · RECOMENDADA** — Autorización de administración arriba de un monto configurable; la cuenta por pagar nace al registrar la factura del proveedor contra una recepción
- **B** — La cuenta por pagar nace al recibir
- **C** — Sin autorización

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-082 · ¿Los proveedores son comunes a toda la clínica o cada sede tiene los suyos? ¿Van en el mismo catálogo los de mantenimiento y equipo?
*Origen:* mockups 24†, 34, 38, 41 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 24 los define como "catálogo único de la clínica" (clon de IRP) con categorías que incluyen mantenimiento; 34, 37, 38 y 41 usan proveedores que no aparecen en 24 (Dental Supply, Farmacia del Ahorro, Papelería Lumen, Autoclaves del Centro).

**Por qué importa.** Define alcance (clínica vs sede) y si un proveedor puede crearse "al vuelo" al capturar un gasto (34 permite escribir un proveedor).

**Opciones**
- **A · RECOMENDADA** — Un catálogo por clínica, con todas las categorías, y creación rápida desde gastos
- **B** — Catálogo por sede
- **C** — Libre sin catálogo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-083 · Costo promedio: método, recálculo y qué pasa con devoluciones y mermas
*Origen:* mockups 23, 19, 22, 21 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 23 "recalcula costo promedio al recibir" y 19/21 muestran costo promedio y margen; no se dice el método ni si es por sede o global, ni cómo se valúa una devolución.

**Por qué importa.** El costo alimenta margen, valor de inventario ($86,540) y costo de ventas.

**Opciones**
- **A · RECOMENDADA** — Costo promedio ponderado por clínica; las mermas y devoluciones se valúan al costo del momento
- **B** — Costo por sede
- **C** — PEPS por lote

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-084 · Mínimos y estados "bajo mínimo / en el mínimo": ¿quién los fija y cómo se calcula "sugerir por mínimos"?
*Origen:* mockups 21, 22, 23, 31 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 21 muestra un mínimo por producto y sede; "En el mínimo" cuenta como estado separado de "bajo mínimo". 22 y 23 tienen "sugerir según mínimos". Las tarjetas hablan de 7 productos bajo mínimo en 31 y 7 "producto-sede" en 21.

**Por qué importa.** Es la fórmula de la alerta de inventario y del reabasto.

**Opciones**
- **A · RECOMENDADA** — Mínimo por producto y sede capturado por administración; bajo mínimo = existencia < mínimo; "sugerir" completa hasta un máximo configurable
- **B** — Mínimo global
- **C** — Calculado por consumo histórico

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-085 · ¿Se puede vender o usar un producto sin existencia registrada?
*Origen:* mockups 17, 21, 03 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** No se dice qué hace caja o la consulta si la existencia es cero o el producto no estaba dado de alta en esa sede.

**Por qué importa.** Evita existencias negativas o bloquear la venta en mostrador.

**Opciones**
- **A · RECOMENDADA** — Se permite con aviso y marca "existencia negativa" que administración debe regularizar con conteo
- **B** — Se bloquea
- **C** — Se permite sin aviso

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-086 · Conteos físicos y mermas: ¿quién autoriza ajustes y con qué tolerancia?
*Origen:* mockups 21 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 21 muestra conteo físico con ajuste (–1) y merma (caja dañada) sin indicar autorización.

**Por qué importa.** Pérdida de producto y de confianza en el inventario.

**Opciones**
- **A · RECOMENDADA** — Administración autoriza el ajuste de conteos y mermas; cualquiera con permiso de inventario las captura; bitácora
- **B** — Cualquier usuario ajusta
- **C** — Tolerancia automática

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-087 · Plantillas a medida (laboratorio): ¿pasan por inventario?
*Origen:* mockups 07, 20, 19 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 20 dice que el paquete "descuenta del inventario de la sede donde se entrega", y 07 maneja la orden como proceso externo (borrador, enviada, recibida, entregada).

**Por qué importa.** Define si el producto a medida es inventario (con costo) o una orden por encargo.

**Opciones**
- **A · RECOMENDADA** — Orden por encargo, sin inventario; el costo es el del laboratorio al recibir
- **B** — Entra a inventario al recibirse
- **C** — Fuera de alcance

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## E. Finanzas y definición de indicadores

### P-088 · ¿La semana del corte es sábado→viernes o lunes→domingo? ¿Quién autoriza el cierre?
*Origen:* mockups 32†, 37 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 32 usa sábado→viernes "como en IRP" (S41 del 17 al 23 de octubre, "por cerrar"); 37 sigue la misma semana. La nota pregunta si debe ser semana calendario.

**Por qué importa.** Define los periodos de EDR semanal, fondo revolvente y cualquier reporte semanal; el cierre congela cifras.

**Opciones**
- **A · RECOMENDADA** — Configurable por clínica; por defecto sábado→viernes como IRP; cierre por administración y reapertura solo con bitácora
- **B** — Lunes→domingo
- **C** — Sin cierre formal

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-089 · Ingreso "Observado": ¿bloquea el corte o solo se marca? ¿Quién valida?
*Origen:* mockups 33†, 36 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 33: Por validar → Validado (con/sin CFDI); "Observado" = no coincide con el estado de cuenta. La nota pregunta si bloquea y si recepción también valida.

**Por qué importa.** Define el flujo de validación y qué cifras entran al EDR y a las comisiones (ver pregunta de "real = validado o cobrado").

**Opciones**
- **A · RECOMENDADA** — Observado solo se marca y alerta; no bloquea el corte; valida administración
- **B** — Bloquea el cierre semanal
- **C** — Valida también recepción

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-090 · ¿El "real" del EDR y de las comisiones es lo cobrado o solo lo validado?
*Origen:* mockups 31, 33, 35, 36, 40 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 31 y 35 dicen "Real = calculado del sistema (ingresos validados + gastos)" y 40 dice "calculadas de los ingresos validados"; pero 33 muestra que de $412,860 cobrados hay $41,200 aún "por validar" (17 registros) y 36 dice $41,200 pendientes (31 movimientos) y $18,450 en mora, y aun así el "total cobrado" es $412,860 y el ingreso del dashboard es el mismo $412,860. Las cuentas de 33 (23 citas sin pago) y 36 (14 cobros en mora) también difieren, y 36 suma $403,760 en sus tres filas contra $412,860 de total.

**Por qué importa.** Si "real" solo cuenta validados, el dashboard debería mostrar $371,660; si cuenta cobrados, las comisiones no deberían depender de validar. Es una fórmula central de varias pantallas.

**Opciones**
- **A · RECOMENDADA** — Definir un "ingreso real" único: cobrado y registrado en el sistema; "validado" es un atributo de conciliación que no cambia el monto, pero comisiones se pagan solo sobre validado
- **B** — Real = solo validado
- **C** — Real = solo cobrado, validación es informativa

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-091 · ¿Cuándo se reconoce un ingreso: al cobrar, al atender o al venderse (anticipos, planes, gift cards)?
*Origen:* mockups 33, 20, 31, 35 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 33 muestra "del mes en turno $371,200" y "de meses anteriores $41,660 (anticipos/planes)" y un selector de modo "Fecha de pago"; el dashboard no aclara.

**Por qué importa.** Cambia el EDR mensual y la comparación mes vs mes; un plan de $1,500 cobrado en octubre y usado en marzo.

**Opciones**
- **A · RECOMENDADA** — Base cobrado (fecha de pago) para el EDR y reporte aparte de "servicios prestados" por fecha de atención
- **B** — Base devengada: al atender
- **C** — Ambas, el cliente elige

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-092 · EDR por sede y proyección: ¿se proyecta por sede y por mes? ¿Cómo se prorratean gastos compartidos? ¿IVA aparte?
*Origen:* mockups 35† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 35 muestra proy_ manual y real_ automático por concepto; reparte ingresos y gastos por sede, pero "Impuestos y gastos fijos prorrateados 12 meses" incluye la suscripción de $1,600 (que es un cargo mensual) y no hay impuestos reales (ISR/IVA).

**Por qué importa.** Define dónde cae la renta, la suscripción, la nómina compartida, la publicidad; la regla del dueño es que proy_* nunca se pisa desde código.

**Opciones**
- **A · RECOMENDADA** — Proyección por concepto, mes y sede; gastos compartidos se asignan por regla configurable (p. ej. proporción de ingresos) y el IVA se muestra aparte
- **B** — Solo consolidado
- **C** — Prorrateo manual

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-093 · Gastos: ¿qué métodos de pago aplican y hay tope sin comprobante fiscal?
*Origen:* mockups 34†, 37 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 34 captura método "Efectivo (fondo revolvente)"; la nota pregunta por tarjeta de la clínica, transferencia y tarjeta personal del podólogo, y topes sin comprobante.

**Por qué importa.** Define deducibilidad, reembolsos a empleados y flujo con conciliación.

**Opciones**
- **A · RECOMENDADA** — Efectivo (fondo), tarjeta de la clínica, transferencia y "pagado por empleado" (a reembolsar); comprobante fiscal exigido arriba de un monto configurable
- **B** — Solo efectivo y transferencia
- **C** — Libre

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-094 · Conciliación: ¿una cuenta por sede o una general? ¿Qué bancos y formatos? ¿Clip liquida por lote?
*Origen:* mockups 36†, 45 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 36 carga un CSV de BBVA por sede ("···4471 (Roma)") y cruza por referencia o monto+fecha; muestra una liquidación de Clip agrupando 14 cobros.

**Por qué importa.** Define la tabla de cuentas, el formato de importación y la lógica de conciliación por lote.

**Opciones**
- **A · RECOMENDADA** — Una cuenta por sede o general según la clínica; CSV genérico configurable; liquidaciones Clip conciliadas por lote
- **B** — Solo BBVA
- **C** — Manual

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-095 · Fondo revolvente: ¿uno por sede o uno por clínica? ¿Quién autoriza la reposición?
*Origen:* mockups 37†, 32 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 37 muestra un fondo por sede (Roma Norte: $6,000 base) con responsable; 32 reporta "fondo revolvente $3,800" para toda la clínica en la semana mientras 37 reporta $3,820 solo de Roma. 37 incluye una comisión bancaria de $1,796 en el fondo, y 35 reporta la comisión de terminal como renglón aparte.

**Por qué importa.** Define la entidad (fondo por sede), el flujo de reposición y la regla de qué gastos son del fondo.

**Opciones**
- **A · RECOMENDADA** — Un fondo por sede con monto base propio; reposición autorizada por administración
- **B** — Un fondo por clínica
- **C** — Sin fondo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-096 · ¿Quién autoriza pagar a proveedores y desde qué cuenta?
*Origen:* mockups 38†, 23 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 38 muestra facturas por pagar con estados (vencida, por vencer, programada, parcial, pagada) y "registrar pago / ligar a gasto".

**Por qué importa.** Permisos y relación pago ↔ gasto ↔ conciliación.

**Opciones**
- **A · RECOMENDADA** — Administración autoriza y registra el pago con cuenta y referencia; el pago se concilia con el banco
- **B** — Cualquiera con permiso de finanzas
- **C** — Sin pagos en el sistema

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-097 · Metas: ¿cuál es la meta de ocupación y las metas por sede y podólogo?
*Origen:* mockups 31†, 40, 14 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 31 muestra ocupación 78% con meta 80%, 40 "meta de sede cumplida 2 de 3" y 14 meta de 3 días de resolución. No hay pantalla para capturar metas.

**Por qué importa.** Cada meta es un parámetro a modelar y a quién se muestra.

**Opciones**
- **A · RECOMENDADA** — Metas editables por administración por sede (y opcionalmente por podólogo) y por periodo
- **B** — Fijas por clínica
- **C** — Sin metas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-098 · Definiciones de indicadores: ocupación, cita atendida, ticket promedio, paciente nuevo, paciente activo
*Origen:* mockups 31, 16, 12, 40, 46 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 31 define ocupación como horas agendadas / horas disponibles por cabina, ticket promedio $1,443 (= ingreso total / 286 citas atendidas, incluye productos), pacientes nuevos 41 = 14% de las citas; 40 usa 252 citas y 14 usa 391 sesiones en el mismo mes, 46 usa 286. No se dice si las videoconsultas, visitas a domicilio y sesiones $0 de un plan cuentan como cita atendida.

**Por qué importa.** Tres pantallas dan tres conteos de "citas" distintos. Sin definición cerrada no hay una verdad única.

**Opciones**
- **A · RECOMENDADA** — Congelar glosario: cita atendida = estado Atendida (cualquier tipo de atención, incluidas $0); ocupación = minutos atendidos y agendados sobre minutos disponibles; paciente nuevo = primera cita atendida en la clínica
- **B** — Excluir sesiones $0
- **C** — Definir por sede

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-099 · Cierres de periodo (semana, comisiones, nómina): ¿qué se congela y quién puede reabrir?
*Origen:* mockups 32, 40, 39 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 32 tiene "Por cerrar/Cerrada", 40 "Cerrar periodo" y 39 "Autorizar nómina".

**Por qué importa.** Si se cierra y después llega un cobro, se corrige o se cancela una venta, hay que definir si cambia el periodo cerrado.

**Opciones**
- **A · RECOMENDADA** — Periodo cerrado = solo lectura; los ajustes se registran en el siguiente periodo con referencia; reapertura solo administración con bitácora
- **B** — Los ajustes recalculan el periodo
- **C** — Sin cierres

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-100 · ¿Qué impuestos aparecen en el estado de resultados?
*Origen:* mockups 35, 17, 18 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 35 llama "Utilidad neta" a ingreso menos gastos y fijos prorrateados; no hay ISR, PTU ni IVA por pagar.

**Por qué importa.** Ni el cliente ni el contador deben confundir "utilidad neta" gerencial con utilidad fiscal.

**Opciones**
- **A · RECOMENDADA** — Mantener utilidad gerencial sin impuestos y rotularla así; reportes fiscales aparte con el contador
- **B** — Calcular ISR estimado
- **C** — Quitar el renglón

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-101 · ¿Cómo se agrupan los servicios del catálogo en los renglones del estado de resultados y en "ingreso por servicio"?
*Origen:* mockups 35, 19, 31, 40, 47 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 35 reporta seis renglones de ingreso (Quiropodia, Uña encarnada/onicocriptosis, Láser hongos, Plantillas ortopédicas, Extracción de uña, Otros servicios) más "Venta de productos"; 19 tiene otras categorías (Quiropodia, Ungueal, Pie en riesgo, Biomecánica, Domicilio) y 47 consulta "extracción de uña" aparte de "uña encarnada" (19 tiene espiculectomía SV-005 y extracción parcial SV-006). Las plantillas son "servicio" en 35 y 40 pero "producto" en 19, 20 y 33. 40 reporta $9,800 de venta de productos y 35 $14,400.

**Por qué importa.** "Ingreso por servicio" es una pregunta textual del dueño; sin un mapeo explícito servicio → renglón del EDR, los reportes de 31, 35, 40 y 47 no cuadran entre sí.

**Opciones**
- **A · RECOMENDADA** — Cada servicio y producto del catálogo declara su renglón de EDR; las plantillas a medida son producto o servicio según lo decida el cliente; el reporte de ingreso por servicio usa el catálogo y el EDR agrupa por renglón
- **B** — El EDR agrupa por categoría del catálogo
- **C** — Renglones fijos de RANNIX

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-102 · ¿Qué ven un podólogo y recepción en Dashboard, Reportes y Resumen?
*Origen:* mockups 02, 10, 17, 31, 42, 44 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** Los menús de podólogo (02) incluyen Dashboard, Asistente IA, Comisiones y Reportes; los de recepción (10, 17) incluyen Dashboard o Resumen; 44 niega finanzas a ambos. No se dice qué alcance tienen (¿propio? ¿de la sede? ¿sin montos?).

**Por qué importa.** Es información financiera visible a roles que según 44 no ven finanzas.

**Opciones**
- **A · RECOMENDADA** — Podólogo ve solo su propia producción y agenda; recepción ve operación de su sede sin finanzas; administración ve todo
- **B** — Mismo dashboard para todos
- **C** — Sin dashboard para podólogo y recepción

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## F. RH, comisiones y mantenimiento

### P-103 · ¿Los podólogos son empleados con nómina o prestadores por honorarios/RESICO?
*Origen:* mockups 39†, 40 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 39 los trata como empleados con salario + comisión + IMSS/ISR; 40 llama "esquema" a % sobre servicio, % más viático o "renta de cabina". La nota 39 pregunta si son honorarios.

**Por qué importa.** Si son honorarios no hay IMSS ni CFDI de nómina y cambia por completo la prenómina; define si "comisión" es sueldo o pago por servicios.

**Opciones**
- **A · RECOMENDADA** — Soportar ambas figuras por persona (nómina o honorarios) desde el inicio; la clínica elige
- **B** — Solo empleados
- **C** — Solo honorarios

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-104 · ¿La nómina se timbra desde Pie Firme (CFDI de nómina) o solo se prepara la prenómina?
*Origen:* mockups 39† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 39 muestra columna "CFDI: Borrador" y "Autorizar nómina", más "Importar checador".

**Por qué importa.** Timbrar nómina implica PAC de nómina, cálculo fiscal y responsabilidad; solo prenómina es mucho menos.

**Opciones**
- **A · RECOMENDADA** — Solo prenómina y exportación para el contador en esta versión
- **B** — Timbrado de nómina integrado
- **C** — Prenómina más integración con otro sistema de nómina

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-105 · Asistencia: ¿hay checador físico o se marca desde la app?
*Origen:* mockups 39†, 30 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 39 muestra "Fuente: checador / registro de jornada" e "Importar checador".

**Por qué importa.** Define si hay marcación en la PWA (geolocalización, fotos) y qué se importa.

**Opciones**
- **A · RECOMENDADA** — Importación de archivo del checador existente; marcación en la PWA queda para después
- **B** — Marcación desde la app
- **C** — Captura manual

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-106 · Comisiones: ¿% por servicio, % distinto por producto, sueldo fijo + bono o renta de cabina? ¿Varían por servicio o por podólogo?
*Origen:* mockups 40† · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 40 muestra "Esquema: % sobre servicio" y "% + viático", pero la base comisionable de cada podólogo incluye productos (Ruiz: $118,400 servicios + $2,900 productos = $121,300) y la comisión de $6,065 es exactamente 5% de esa base completa; el detalle del mismo mockup aplica 5% a servicios y 10% a producto. Los porcentajes están marcados como ilustrativos.

**Por qué importa.** Es la fórmula de pago a personas; un error es dinero. Hay una contradicción interna entre tarjeta/tabla (5% plano sobre todo) y el detalle (5% servicio, 10% producto).

**Opciones**
- **A · RECOMENDADA** — Esquema configurable por podólogo con % por tipo (servicio, producto, plan) y opcional viático o piso; el cliente confirma números
- **B** — Un % único por clínica
- **C** — Renta de cabina sin comisión

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-107 · Base de la comisión: ¿sobre precio de lista, cobrado, sin IVA, sin descuentos, sobre validado? ¿A quién se comisiona un plan?
*Origen:* mockups 40, 20, 17, 33 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 40 dice "calculadas de los ingresos validados" y que 'Solo ingresos validados' es un filtro; no hay regla para descuentos, cancelaciones, reembolsos, sesiones $0 de un plan, anticipos ni para quien vende el plan frente a quien da cada sesión.

**Por qué importa.** Define el monto exacto del pago al podólogo y la reversa por cancelaciones.

**Opciones**
- **A · RECOMENDADA** — Base = importe cobrado sin IVA, neto de descuentos y reembolsos; planes se comisionan por sesión atendida al podólogo que atiende
- **B** — Sobre precio de lista
- **C** — Al que vendió el plan

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-108 · Comisiones y cambios de esquema: ¿qué pasa con el histórico y con ventas canceladas después del cierre?
*Origen:* mockups 40, 19 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 40 tiene "Configurar esquemas" y "Cerrar periodo"; no hay regla sobre cambios a mitad de periodo ni sobre cancelaciones posteriores.

**Por qué importa.** Regla de histórico: congelar vs recalcular.

**Opciones**
- **A · RECOMENDADA** — Cada comisión se calcula con el esquema vigente en la fecha del servicio y no se recalcula; ajustes en el siguiente periodo
- **B** — Se recalcula el periodo abierto
- **C** — Se recalcula todo

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-109 · Podólogos en varias sedes: ¿a qué sede se atribuyen ingreso, nómina y comisión?
*Origen:* mockups 40, 44, 39, 01 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 44 permite un podólogo en varias sedes (Marco Mena: Roma Norte y Coyoacán); 39 y 40 lo muestran como "Roma/Coy.".

**Por qué importa.** Afecta el reparto por sede (31, 35) y la nómina por sede.

**Opciones**
- **A · RECOMENDADA** — El ingreso va a la sede donde se atendió la cita; la nómina a la sede de contrato; la comisión se calcula por cita
- **B** — Todo a la sede principal
- **C** — A la sede que programó

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-110 · Vacaciones, incidencias y descuento por falta: ¿qué reglas aplica el sistema?
*Origen:* mockups 39 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 39 muestra días de derecho, tomados y disponibles (12/14), retardos "no descuentan", permiso sin goce "descuenta", incapacidad.

**Por qué importa.** Son reglas laborales; el sistema no debería inventarlas.

**Opciones**
- **A · RECOMENDADA** — Parámetros configurables por clínica (días de derecho, qué incidencia descuenta); validar con asesoría laboral
- **B** — Valores fijos de la ley sin edición
- **C** — Sin cálculo automático

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-111 · ¿Quién ve sueldos, comisiones y bancos del personal?
*Origen:* mockups 44, 39, 40 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 44 dice RH/nómina/comisiones: administrador sí, podólogo "solo las suyas", recepción no. 39 muestra CLABE y sueldos de todos.

**Por qué importa.** Datos personales y financieros sensibles; define RLS por fila.

**Opciones**
- **A · RECOMENDADA** — Administración ve todo; cada empleado solo su propio recibo; CLABE enmascarada salvo para quien paga
- **B** — Solo administración
- **C** — Visible para el administrador de sede

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-112 · Mantenimiento: ¿quién autoriza una orden de trabajo y hasta qué monto?
*Origen:* mockups 41†, 23 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 41 muestra Solicitado → Autorizado → En proceso → Cerrado / Rechazado, tab "Solo las que yo autoricé". Las cifras no cuadran: el costo del mes es $9,800 pero las órdenes del periodo suman $16,862 y "equipos con servicio vencido: 2" cuando la tabla solo marca uno vencido (el torno figura vigente).

**Por qué importa.** Define aprobaciones por monto, relación con gastos (renglón Mantenimiento de EDR) y proveedores.

**Opciones**
- **A · RECOMENDADA** — Autoriza administración (con umbral configurable para urgentes que se pueden atender antes de aprobar)
- **B** — Cualquiera con permiso solicita y administración autoriza siempre
- **C** — Autoriza el encargado de la sede

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## G. Plataforma, suscripción, accesos, IA y datos

### P-113 · ¿Clip permite cobros recurrentes para la suscripción? Si no, ¿qué otro medio de cobro automático?
*Origen:* mockups 46† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 46 muestra tarjeta VISA y "cobro automático activo"; el requerimiento elige Clip pero marca "pendiente de verificar" comisiones, cobros recurrentes, reembolsos y facturación.

**Por qué importa.** Si Clip no soporta recurrencia, el cobro automático de la suscripción y su alerta de rechazo (48: 4 de 5 cobrados) necesitan otro proveedor.

**Opciones**
- **A · RECOMENDADA** — Verificar con Clip antes de E3; si no hay recurrencia, usar otro proveedor solo para la suscripción (decisión del dueño)
- **B** — Cobro manual mensual por transferencia
- **C** — Cambiar de pasarela

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-114 · Prueba gratuita, suspensión por falta de pago y cancelación
*Origen:* mockups 46†, 28†, 48 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 28 pregunta por periodo de prueba; 48 muestra prueba de 14 días (una clínica "en prueba (9 días)") y una clínica "suspendida (pago)" con 0 citas; 46 pregunta qué pasa al cancelar. No hay regla de gracia, de acceso en solo lectura ni de conservación de datos. En 48 una clínica en prueba ya muestra cobro de $1,000.

**Por qué importa.** Determina el ciclo de vida del cliente: acceso, exportación y borrado; es obligación frente a datos de salud.

**Opciones**
- **A · RECOMENDADA** — Prueba de 14 días sin tarjeta (valor de 48); al fallar el cobro, periodo de gracia y luego acceso solo lectura/exportación; los datos se conservan según política de retención
- **B** — Sin prueba
- **C** — Bloqueo inmediato

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-115 · ¿El plan "por clínica" cubre cuántos podólogos y sedes? ¿Hay tope de almacenamiento o de citas?
*Origen:* mockups 28†, 46, 48 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 28 dice "podólogos y sedes de la clínica" sin tope; 48 muestra una clínica de $1,000 con 6 podólogos y 402 citas (8.9 GB). 46 muestra almacenamiento (5.1 GB) y citas del mes como "uso" sin límite.

**Por qué importa.** Si no hay tope, el costo de almacenamiento (fotos/video) y de IA lo absorbe RANNIX.

**Opciones**
- **A · RECOMENDADA** — Sin tope de podólogos/sedes; cuota razonable de almacenamiento e IA por plan, definida por RANNIX
- **B** — Tope por plan
- **C** — Almacenamiento cobrado aparte

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-116 · ¿Cuándo cuenta un podólogo como "activo" para cobrar y cómo se prorratea el cambio de plan?
*Origen:* mockups 46, 28, 48 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 46 calcula 4 podólogos × $400; 46 y 48 permiten cambiar de plan. No se define el cobro por un podólogo que entra a mitad de mes, uno desactivado, o por quien trabaja en dos clínicas, ni el efecto del cambio de plan en el mes en curso.

**Por qué importa.** Es la fórmula de ingresos de RANNIX (MRR) y la factura mensual.

**Opciones**
- **A · RECOMENDADA** — Se cuenta como activo si tuvo acceso o agenda en el mes; cambios surten efecto en el siguiente cobro, sin prorrateo
- **B** — Prorrateo diario
- **C** — Conteo al día de corte

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-117 · Los $400/$1,000: ¿llevan IVA? ¿Cómo se factura la suscripción?
*Origen:* mockups 28†, 46, 35 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 28 pregunta si los precios llevan IVA; 46 lista facturas de RANNIX con folio (XML) y 35 incluye "Suscripción Pie Firme (RANNIX)" $1,600 dentro de renglones "prorrateados 12 meses" aunque es un cargo mensual. 48 suma un MRR de $5,700 aunque las cinco clínicas listadas suman $5,600.

**Por qué importa.** Define precio al público, facturación de RANNIX y cómo el cliente lo registra en su EDR.

**Opciones**
- **A · RECOMENDADA** — Precios más IVA; RANNIX emite CFDI mensual a cada clínica; el EDR toma el cargo mensual
- **B** — Precios con IVA incluido
- **C** — Sin factura

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-118 · Nombre público "Pie Firme", correo de contacto y WhatsApp
*Origen:* mockups 28†, 25† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 28 pregunta si el nombre público es "Pie Firme"; el portal dice "Correo de contacto: por definir"; el teléfono 55 1412 0283 se usa en todos los pies de página.

**Por qué importa.** Textos legales, marca, correo transaccional (remitente) y la liga de demostración.

**Opciones**
- **A · RECOMENDADA** — Confirmar nombre, correo de contacto y si el número es WhatsApp (ver pregunta de WhatsApp)
- **B** — Mantener nombre de trabajo
- **C** — Renombrar

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-119 · Acceso: ¿cada clínica entra por la misma pantalla o por una dirección propia? ¿Doble factor y recuperación?
*Origen:* mockups 49†, 45, 43 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 49 tiene una pantalla única "usuario o correo + contraseña" y Google; 45 hace 2FA obligatorio solo para administradores y sesión de 60 minutos; 43 bloquea tras 3 intentos fallidos. No se dice cómo se asocia un usuario a la clínica.

**Por qué importa.** Define el modelo de identidad: ¿un usuario puede pertenecer a dos clínicas? ¿se detecta la clínica por el usuario? Es parte del aislamiento.

**Opciones**
- **A · RECOMENDADA** — Pantalla única; la clínica se deduce del usuario (una cuenta pertenece a una sola clínica); 2FA obligatorio para administración, opcional para el resto; recuperación por correo
- **B** — Subdominio por clínica
- **C** — Un usuario puede tener varias clínicas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-120 · "Continuar con Google": ¿se permite y con qué controles, dado que son datos de salud?
*Origen:* mockups 49, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 45 tiene "Permitir login con Google: Sí" y 49 muestra el botón. 44 crea usuarios con contraseña propia.

**Por qué importa.** Mezclar cuentas personales de Gmail con acceso a datos clínicos; qué pasa si cambia el correo.

**Opciones**
- **A · RECOMENDADA** — Opcional por clínica (apagado por defecto), solo para correos ya dados de alta por administración
- **B** — Siempre activo
- **C** — No se ofrece

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-121 · Soporte RANNIX: ¿puede entrar a la clínica del cliente (suplantar) y con qué bitácora?
*Origen:* mockups 48† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 48 dice que los datos de salud nunca se muestran en el panel; hay tickets de soporte abiertos ("No timbra CFDI", "Importar pacientes").

**Por qué importa.** Acceso del proveedor a datos de salud es un riesgo legal y una promesa del producto (aislamiento).

**Opciones**
- **A · RECOMENDADA** — Sin suplantación; soporte ve solo metadatos; para ayudar el cliente otorga un acceso temporal con motivo y bitácora visible para la clínica
- **B** — Suplantación libre con bitácora
- **C** — Suplantación solo con autorización escrita

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-122 · Importación: volumen, sistemas de origen y si se puede deshacer una carga
*Origen:* mockups 13† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 13 muestra 1,284 filas, 17 columnas, "guardar mapeo como plantilla", errores descargables; la nota pregunta volumen y sistemas del primer cliente y reversa por lote. El requerimiento dice que no existe un software previo.

**Por qué importa.** La reversa por lote exige trazabilidad de cada registro creado y combinado.

**Opciones**
- **A · RECOMENDADA** — Cada carga es un lote con identificador; se puede deshacer un lote completo si no se ha modificado después
- **B** — Sin reversa
- **C** — Reversa solo en 24 horas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-123 · Importación: criterios de duplicados y conflictos al "combinar"
*Origen:* mockups 13, 10, 06 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 13 ofrece Omitir / Combinar / Crear nuevo por duplicado y la columna "Confianza IA"; muestra que "DM2" → diabetes tipo 2 (71%) y "alergica a latex" → alergia (64%) pasan a "revisar".

**Por qué importa.** Importar datos clínicos con IA con baja confianza afecta el expediente; "combinar" decide qué valor gana.

**Opciones**
- **A · RECOMENDADA** — Los campos clínicos (alergias, diagnósticos) con confianza menor a un umbral siempre quedan para revisión humana y se marcan "importado" con su origen; en conflicto gana el dato existente
- **B** — Gana el dato importado
- **C** — No se importan datos clínicos

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-124 · Proveedores y llave de IA: ¿cuál, dónde procesan los datos de salud y quién paga?
*Origen:* mockups 13†, 08†, 47†, 34 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 13 y 08 dicen que aún no hay llave de IA ni proveedor; 47 usa IA en lenguaje natural y 34 lectura de comprobantes. El requerimiento tiene la IA en importación, dictado, asistente y lectura de comprobantes.

**Por qué importa.** Un solo proveedor o varios; contratos de encargo de datos, país de procesamiento, costo por clínica y límites de uso.

**Opciones**
- **A · RECOMENDADA** — Un proveedor único elegido por RANNIX con contrato de encargo y sin entrenamiento con datos del cliente; costo incluido en el plan con tope
- **B** — Una llave por clínica
- **C** — Procesamiento local

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-125 · Asistente de IA: ¿qué datos clínicos puede ver?
*Origen:* mockups 47†, 44 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 47 dice "solo números y datos administrativos; el expediente clínico solo con permiso y bitácora", pero responde "¿quién atendió a M. Pérez en la sesión anterior?" (dato clínico). 44 no menciona el asistente en la matriz.

**Por qué importa.** Es la mayor fuga potencial de privacidad entre usuarios y entre clínicas.

**Opciones**
- **A · RECOMENDADA** — Solo vistas administrativas agregadas y consultas sin identificar paciente; las preguntas con paciente requieren permiso de expediente y dejan bitácora
- **B** — Con acceso total al expediente
- **C** — Sin datos de pacientes

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-126 · Lectura automática de tickets/comprobantes: ¿qué hacer con baja confianza o ilegibles?
*Origen:* mockups 34, 33, 13 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 34 y 33 leen comprobantes con IA ("IA…" listo / ilegible) y 33 lee monto, fecha y referencia.

**Por qué importa.** Un monto mal leído entra a gastos y al EDR.

**Opciones**
- **A · RECOMENDADA** — Siempre revisión humana antes de guardar; la IA solo precarga
- **B** — Guardar si confianza alta
- **C** — Sin IA en gastos

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-127 · Volumetría y retención: ¿cuántos años se conservan expedientes, fotos, video, audio, bitácora y respaldo?
*Origen:* mockups 43†, 46, 45, 02, 04 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 43 propone bitácora ≥ 5 años (NOM-004) y 45 repite "log de auditoría ≥ 5 años". 46 muestra 5.1 GB con 286 citas al mes. El requerimiento menciona hasta 20 citas al día. No se dice cuánto tiempo se conservan fotos y documentos, ni qué pasa después de ese plazo, ni el respaldo (RPO/RTO).

**Por qué importa.** Define costo de almacenamiento, política de purga y cumplimiento.

**Opciones**
- **A · RECOMENDADA** — Expediente y bitácora ≥ 5 años desde la última atención (NOM-004, validar); fotos con el expediente; audio y video por política más corta; respaldo diario con restauración probada
- **B** — Conservación indefinida
- **C** — 5 años exactos y purga

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-128 · Aislamiento entre clínicas: ¿una persona puede ser paciente de dos clínicas del producto y qué comparten?
*Origen:* mockups 48, 10, 13, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** El requerimiento exige "ninguna clínica ve datos de otra". No se dice si el mismo paciente en dos clínicas es dos registros distintos, ni si hay catálogos globales de RANNIX (CIE-10, plantillas), analítica agregada ni datos compartidos con RANNIX.

**Por qué importa.** Es el requisito número uno; se verifica con pruebas de RLS.

**Opciones**
- **A · RECOMENDADA** — Todo dato operativo pertenece a una sola clínica (organización); catálogos de referencia globales solo lectura; RANNIX solo ve metadatos de uso y facturación
- **B** — Pacientes compartidos entre clínicas con consentimiento
- **C** — Analítica agregada anónima

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-129 · ¿Los pacientes y el expediente pertenecen a la clínica o a la sede? ¿Qué significa "sede de alta"?
*Origen:* mockups 02, 10, 44, 01 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 02 y 10 capturan "Sede de alta"; 44 da acceso por sede; 17 y 31 reportan por sede de atención. Los mockups usan tres conjuntos de sedes distintos (Roma Norte + Condesa en 02, 12, 14 y 15; Roma Norte + Del Valle + Coyoacán en 19, 21, 22, 23 y 25; Roma Norte + Coyoacán + Polanco de 31 en adelante) y direcciones distintas para las mismas (Roma Norte: Tonalá 112 en 17 y 25; Álvaro Obregón 118 en 45).

**Por qué importa.** Hay que decidir el alcance de cada entidad (clínica vs sede) y que los datos de ejemplo deben unificarse antes de construir el semilla de pruebas.

**Opciones**
- **A · RECOMENDADA** — Paciente y expediente por clínica con sede de alta como atributo; agenda, caja, inventario y fondos por sede
- **B** — Paciente por sede
- **C** — Todo a nivel clínica

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-130 · Matriz completa de permisos por rol
*Origen:* mockups 44†, 17, 18, 33 · *Tipo:* Nota PREGUNTA del mockup · **Contradicción entre mockups**

**Pregunta.** 44 es "propuesta"; la nota pregunta si un podólogo ve expedientes de otro podólogo de su sede y si recepción ve montos de caja. Además 44 dice que recepción no ve finanzas, pero las pantallas de recepción incluyen facturación, catálogo y precios, paquetes, importar datos, quejas y seguimiento clínico (diabético, valor histórico, último servicio); 33 deja validar ingresos sin decir a quién.

**Por qué importa.** Es la base del RLS; ver MATRIZ_ROLES.md. Se necesitan reglas para: validación de ingresos, descuentos, catálogo, cancelaciones, quejas, esterilización, mantenimiento, importación.

**Opciones**
- **A · RECOMENDADA** — Validar la matriz de MATRIZ_ROLES.md renglón por renglón con el cliente
- **B** — Aceptar la matriz de 44 y recortar pantallas
- **C** — Roles personalizables por clínica

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-131 · Usuarios que aparecen y no tienen rol definido (encargado de inventario/sede, apoyo, laboratorio)
*Origen:* mockups 22, 39, 15, 44 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 22 y 21 muestran a Luis Ortega, Marta Gil y a una auxiliar (Lupita Torres, en 15) operando inventario y esterilización; 39 cuenta 9 empleados (4 podólogos, 2 recepción y 3 de apoyo) y 46 cuenta 9 usuarios, mientras 44 lista 7 usuarios.

**Por qué importa.** Si hay un cuarto perfil que inicia sesión (encargado de inventario/sede, auxiliar), la matriz debe incluirlo; el requerimiento solo autoriza tres.

**Opciones**
- **A · RECOMENDADA** — Mantener tres perfiles; el personal de apoyo se modela como empleados sin acceso, o como usuarios con rol Recepción
- **B** — Crear rol Encargado de sede
- **C** — Roles personalizables

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-132 · Datos de ejemplo y semilla de pruebas
*Origen:* mockups 01, 02, 14, 19, 31, 48 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** Los mockups tienen nombres de personas, folios y fechas que se contradicen: un mismo podólogo se llama Lucía Ruiz, Ana Ruiz, Elena Ruiz; el administrador Carlos, Carla y Héctor; el "hoy" es 25 y 27 de octubre; cuatro formatos de folio de cita (#C-20261027-014, C-2026-004871, #2318, CITA-20261027-031); #CON-10261 es de dos pacientes (08 y 15).

**Por qué importa.** Los mockups se usarán como criterio de aceptación en QA; los datos contradictorios hacen inútil la comparación.

**Opciones**
- **A · RECOMENDADA** — Antes de E5 se define un único set de datos sintéticos coherente (ver INVESTIGACION_PODOLOGIA.md) y se actualizan los mockups
- **B** — Ignorar las diferencias
- **C** — Corregir mockup por mockup al construir

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-133 · Numeración de folios: pacientes, citas, consultas, tickets, facturas y reinicio
*Origen:* mockups 02, 11, 17, 18, 22, 43 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** Hay formatos de paciente (PF-004127, PF-00231, #0412), de cita (cuatro), de consulta (#CON-10231 y #2318), ticket (T-RN-018234 y T-4821), CFDI (RN-000342 y A·1001 en configuración), traspaso TR-0062, OC-0046. No se dice si el consecutivo es por sede, por clínica, ni si reinicia por año o por serie fiscal.

**Por qué importa.** Los folios fiscales exigen consecutivo sin huecos; los clínicos, unicidad.

**Opciones**
- **A · RECOMENDADA** — Prefijo por sede con consecutivo; serie fiscal separada por clínica configurada en 45; los folios nunca se reutilizan
- **B** — Un solo consecutivo global
- **C** — Folios aleatorios

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-134 · Portal público: ¿una dirección por clínica y qué se publica (sedes, servicios, precios, podólogos)?
*Origen:* mockups 25, 28, 26, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** El requerimiento decide un portal de reserva por clínica sin cuenta; 25 muestra "Pie Firme · Podología Centro" con sedes, servicios con precio y podólogos con cédula y foto. No se dice cómo se identifica la clínica en la dirección, ni qué servicios o podólogos se pueden ocultar al público.

**Por qué importa.** Define el slug/subdominio, el aislamiento del portal público y los atributos "publicable" del catálogo.

**Opciones**
- **A · RECOMENDADA** — Una dirección por clínica (por ejemplo /c/nombre-clínica); servicios y podólogos con casilla "visible en portal"
- **B** — Subdominio por clínica
- **C** — Un buscador único de clínicas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-135 · ¿Existe un administrador de una sola sede o el administrador siempre ve todas?
*Origen:* mockups 43, 44 · *Tipo:* Nueva: las pantallas no lo dicen · **Contradicción entre mockups**

**Pregunta.** 44 muestra al Administrador con sedes "Todas"; 43 registra un cambio de rol "Recepción → Administrador (sede Polanco)", es decir, un administrador con alcance de una sede.

**Por qué importa.** Cambia el alcance de datos de ese rol y la forma de la política de acceso por sede.

**Opciones**
- **A · RECOMENDADA** — Administrador con lista de sedes asignadas (todas o algunas); finanzas consolidadas solo para quien tenga todas
- **B** — Administrador siempre global
- **C** — Rol aparte "Administrador de sede"

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## H. Legal y cumplimiento

### P-136 · NOM-004: contenido mínimo de la nota, firma y plazo de conservación
*Origen:* mockups 03, 43, 02, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** Los mockups cumplen estructura (evolución, hallazgos, diagnóstico, pronóstico, tratamiento) según la investigación, pero la investigación no es asesoría legal y la NOM-024 no se consultó. El requerimiento propone retención ≥ 5 años.

**Por qué importa.** Si falta algo en la nota, no se puede reparar después.

**Opciones**
- **A · RECOMENDADA** — Contratar una revisión legal/regulatoria del cliente o de RANNIX antes de E5 y congelar el contenido mínimo
- **B** — Aceptar la investigación tal cual
- **C** — Dejar campos configurables

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-137 · NOM-024 (interoperabilidad de expediente electrónico): ¿aplica y qué exige?
*Origen:* mockups 02, 06 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** El requerimiento anota que la NOM-024 no se consultó.

**Por qué importa.** Puede exigir catálogos, formatos o intercambio de información que afectan el modelo de datos.

**Opciones**
- **A · RECOMENDADA** — Consultarla antes de E3 y registrar lo que aplique
- **B** — Ignorarla en esta versión
- **C** — Esperar a que un cliente la pida

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-138 · Datos personales y sensibles: ¿quién es responsable y quién encargado (clínica vs RANNIX)?
*Origen:* mockups 45†, 26†, 48†, 13†, 29† · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** El producto procesa datos de salud (sensibles) con terceros: Clip, proveedor de video, IA, WhatsApp, PAC, correo. Las plantillas de aviso y consentimiento las controla la clínica (45) pero la nota pregunta si las redacta ella o RANNIX con un texto base revisado.

**Por qué importa.** Define contratos, aviso de privacidad de RANNIX y de cada clínica y la responsabilidad en caso de fuga.

**Opciones**
- **A · RECOMENDADA** — Cada clínica es responsable; RANNIX es encargado con contrato de encargo y entrega un texto base revisado por abogado que la clínica adopta
- **B** — Cada clínica redacta
- **C** — RANNIX es corresponsable

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-139 · Textos legales base: aviso de privacidad, consentimientos, términos del portal
*Origen:* mockups 45†, 26†, 29†, 10 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** 45 y 26 usan versiones v3 y v2; el portal usa términos y aviso de RANNIX; 29 dice "texto legal: validar con abogado".

**Por qué importa.** El documento firmado es evidencia; sin versión no se prueba qué aceptó el paciente.

**Opciones**
- **A · RECOMENDADA** — Versionar cada texto y guardar con cada firma la versión aceptada; redacción por abogado
- **B** — Texto único congelado
- **C** — Sin versión

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-140 · ¿Qué pasa con los pacientes que firmaron la versión anterior del aviso cuando sale una nueva?
*Origen:* mockups 10, 02, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 02 muestra "Aviso v3 firmado 12/01/2026" y 10 el aviso v3 vigente desde 01/10/2026.

**Por qué importa.** Define si hay que firmar de nuevo y cuándo.

**Opciones**
- **A · RECOMENDADA** — Se conserva la firma anterior; si la nueva versión cambia finalidades se pide nueva firma en la siguiente visita
- **B** — Firma anual
- **C** — No se vuelve a pedir

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-141 · Solicitud ARCO (acceso, rectificación, cancelación, oposición): ¿quién la atiende y qué entrega el sistema?
*Origen:* mockups 02, 43 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 02 tiene el botón "Solicitud ARCO" y "Exportar expediente PDF". No se dice el flujo, el plazo, quién responde, ni qué pasa con la cancelación del expediente frente a la conservación obligatoria.

**Por qué importa.** Es obligación legal con plazos; afecta el diseño de bitácora, borrado y exportación.

**Opciones**
- **A · RECOMENDADA** — Flujo con estados y plazos, atendido por administración de la clínica; cancelación = bloqueo, no borrado, durante el plazo de conservación
- **B** — Atención fuera del sistema
- **C** — Borrado inmediato

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-142 · Firma en pantalla del paciente y del podólogo: ¿qué evidencia se guarda y qué valor tiene?
*Origen:* mockups 03, 10, 29 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 03 y 10 capturan firma en pantalla con fecha, IP y dispositivo; 29 pide escribir el nombre como firma.

**Por qué importa.** Sin estándar la firma puede no sostenerse; define qué se guarda (imagen, hash, hora, dispositivo).

**Opciones**
- **A · RECOMENDADA** — Guardar imagen de firma, fecha-hora, IP, dispositivo y huella del documento firmado; validar valor probatorio con abogado
- **B** — Solo imagen
- **C** — Firma electrónica avanzada

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-143 · Transferencias de datos a terceros (Clip, video, IA, WhatsApp, PAC, correo): ¿cuáles y con qué consentimiento?
*Origen:* mockups 26, 29, 08, 13, 18, 16 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 26 indica que Clip procesa la tarjeta y Pie Firme no la guarda; el resto no explica cuáles datos de salud salen.

**Por qué importa.** Cada tercero aparece en el aviso de privacidad; minimizar lo que se envía.

**Opciones**
- **A · RECOMENDADA** — Lista cerrada de terceros publicada en el aviso; solo se envían datos mínimos (nunca notas clínicas a WhatsApp o correo)
- **B** — Lista abierta
- **C** — Sin envío de datos

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-144 · ¿Dónde residen y se procesan los datos (país/región) y los respaldos?
*Origen:* mockups 13†, 08†, 29 · *Tipo:* Nota PREGUNTA del mockup

**Pregunta.** No se dice dónde corren la base de datos, el almacenamiento de fotos, el video ni la IA.

**Por qué importa.** Obligaciones de transferencia internacional y expectativa del cliente.

**Opciones**
- **A · RECOMENDADA** — Declarar región y proveedor de la base de datos y documentarlo en el aviso
- **B** — Solo México
- **C** — No declarar

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-145 · Recetas e indicaciones: ¿qué medicamentos puede indicar el podólogo y se venden en la clínica?
*Origen:* mockups 03, 09, 21 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 03 indica mupirocina y 21 vende cremas, lacas antimicóticas y productos; 09 "enviar receta e indicaciones" (lidocaína con epinefrina como anestésico). No se dice qué catálogo de medicamentos se permite, si se ven datos de cédula en la receta o si la venta de ciertos productos tiene restricciones.

**Por qué importa.** Una receta con medicamentos fuera de alcance profesional es un riesgo; el sistema no debe decidirlo, pero sí qué ofrece.

**Opciones**
- **A · RECOMENDADA** — Catálogo de medicamentos configurable por la clínica con advertencia; RANNIX no restringe ni valida; pedir revisión legal
- **B** — Texto libre
- **C** — Sin recetas

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-146 · Cédula profesional del podólogo: ¿se valida y dónde se muestra?
*Origen:* mockups 02, 25, 03 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 02, 03 y 25 muestran la cédula del podólogo; no se dice si se valida contra un registro oficial ni si es obligatoria para firmar notas.

**Por qué importa.** Firma de notas sin cédula invalida el expediente.

**Opciones**
- **A · RECOMENDADA** — Obligatoria para el rol Podólogo para poder firmar; captura manual con verificación por administración
- **B** — Validación automática
- **C** — Opcional

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-147 · Telemedicina: marco legal y consentimiento
*Origen:* mockups 09, 29 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 29 muestra un consentimiento de telemedicina (limitaciones, no se graba salvo autorización) y la nota pide validar el texto con abogado.

**Por qué importa.** Responsabilidad profesional y qué puede hacerse a distancia.

**Opciones**
- **A · RECOMENDADA** — Revisión legal del texto antes de lanzar telemedicina
- **B** — Usar el texto de 29
- **C** — Postergar la función

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-148 · Comunicaciones comerciales (promociones, cumpleaños, encuestas): consentimiento y baja
*Origen:* mockups 10, 16, 26 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 10 y 26 captan una casilla de consentimiento para recordatorios/promociones/encuestas; 16 la usa para filtrar. No se dice cómo se revoca ni si recordatorios clínicos y promociones comparten consentimiento.

**Por qué importa.** LFPDPPP y tasa de bloqueo de canales.

**Opciones**
- **A · RECOMENDADA** — Consentimientos separados (recordatorios de cita vs promociones) con baja en cada mensaje
- **B** — Un solo consentimiento
- **C** — Sin comunicaciones comerciales

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

### P-149 · Licencias, permisos y responsable sanitario de la clínica
*Origen:* mockups 15, 35, 45 · *Tipo:* Nueva: las pantallas no lo dicen

**Pregunta.** 35 muestra "Licencias y permisos sanitarios" como gasto y 15 pregunta por el formato de COFEPRIS. 45 no tiene campos de licencia o responsable sanitario.

**Por qué importa.** Podría exigirse mostrar o registrar estos datos en la clínica (aviso de funcionamiento, responsable).

**Opciones**
- **A · RECOMENDADA** — Agregar datos de licencia y responsable sanitario a la configuración de la clínica, solo informativos
- **B** — No se modela
- **C** — Solo si el cliente lo pide

**Respuesta del cliente:** ☐ A  ☐ B  ☐ C  ☐ Otra: ____________________________________________
**Decide:** ____________  **Fecha:** ____________  **Va a `REGLAS_NEGOCIO.md`:** ☐

---

## Apéndice A · Contradicciones entre mockups (no se eligió ninguna en silencio)

| ID | Tema | Qué se contradice | Pregunta |
|---|---|---|---|
| C-01 | Sedes, direcciones y horarios | 01, 02, 10, 12, 14, 15 usan Roma Norte + Condesa; 19, 21, 22, 23, 25 usan Roma Norte + Del Valle + Coyoacán; 31 a 47 usan Roma Norte + Coyoacán + Polanco. Roma Norte es Tonalá 112 (17, 25) o Álvaro Obregón 118 (45); Coyoacán es Francisco Sosa 84 (25) o 54 (45); horario de Roma Norte L–V 10–19 (25) o 9–19 (45). | P-129, P-132 |
| C-02 | Nota firmada: bloqueada o editable | 03 propone bloquearla y solo aceptar nota aclaratoria; 43 muestra una nota firmada editada y re-firmada como versión 2. | P-001 |
| C-03 | Quejas de octubre | 14: 14 quejas (12 por podólogo, 14 por sede), 9 abiertas, podólogos Mena/Soto/Ruiz; 31: 5 quejas, 2 abiertas, cuatro podólogos distintos; 42: 5 en octubre, 22 en el año. | P-021 |
| C-04 | Citas del mes | 31, 33, 36 y 46 dicen 286 citas atendidas; 40 suma 252 citas por podólogo; 14 suma 391 sesiones. | P-098 |
| C-05 | Productos y plantillas | Venta de productos $14,400 (31, 35) vs $9,800 (40); plantillas son servicio en 35 y 40 y producto en 19, 20 y 33. | P-101 |
| C-06 | Ingreso real: validado o cobrado | 31/35/40 dicen que el real son ingresos validados; 33 y 36 muestran $41,200 por validar dentro del mismo total de $412,860; 33 cuenta 23 citas sin pago y 36 14 cobros en mora; 36 suma $403,760 y rotula $412,860. | P-090 |
| C-07 | Comisión del podólogo | 40: 5% sobre toda la base (servicio + producto) en la tabla; el detalle aplica 5% a servicio y 10% a producto; el esquema se llama "% sobre servicio". | P-106 |
| C-08 | Permisos de Recepción | 44 le da solo datos de contacto del expediente y niega finanzas; 10 le hace capturar alergias/diabetes, 16 le muestra segmentos clínicos, 43 registra a una recepcionista abriendo fotos clínicas, 37 la hace responsable del fondo revolvente. Los menús por perfil difieren entre 10–16 y 17–18. | P-130 |
| C-09 | Anticipo | $200 de $400 (25, 26); $150 de $530 (11); $300 de $1,350 (05); $1,000 de plantillas (07); 30% configurado (45). | P-034 |
| C-10 | Recordatorios | 24 h + 2 h por WhatsApp y correo (11); 24 h (05, 45); mensaje a 48 h (27); liga de video 15 min antes (09) y entrada 10 min antes (29). | P-039, P-018 |
| C-11 | Precios del mismo servicio | Uña encarnada $530 (11, 19, 25) pero $590 en Roma Norte (19); extracción parcial $1,350 (02, 05) vs $800/$850 (19, 20); estudio de pisada $1,790 (07) vs $1,200 (19, 20, 25); plantillas $2,100 (02, 07) vs $2,500 (20); láser $300 por uña (19, 25) vs $1,500 el plan (20) vs $1,500 por sesión cobrada (32, 38). | P-069 |
| C-12 | Plan de extracción de uña | Extracción + 2 curaciones a 1 y 2 semanas (05); 3 curaciones día 7, 14 y 28 (19); extracción + 3 curaciones por $800 (20); 02 muestra 1/3, 2/3 y 3/3 a 14 días; el dueño dijo "3 citas posteriores". | P-028 |
| C-13 | Misma paciente, dos registros | María Pérez Aguirre: nacimiento 14/03/1968 (02, 13) o 12/05/1978 (18, 26); RFC PEAM680314KX3 o PEAM780512KT3; celular 55 4821 7730 o 55 3344 1020; folios PF-004127, PF-00231 y #0412. | P-006 |
| C-14 | Folios | Cita: #C-20261027-014 (11), C-2026-004871 (17), #2318 (33, 40), CITA-20261027-031 (09), C-2026-004902 (29); consulta: #CON-10231 y #2318 (43); #CON-10261 es de dos pacientes (08 y 15); ticket T-RN-018234 (17) y T-4821 (32). | P-133, P-132 |
| C-15 | Nombres, cédulas y fechas de ejemplo | Podóloga Lucía Ruiz (02), Ana Ruiz (25), Elena Ruiz (31); Mena es Podólogo (cédula 9876543, 02) o Luis (6932210, 25); administrador Carlos Beltrán (13–15), Dr. Héctor Salinas (19–24) y Carla Beltrán (31–47); el "hoy" es 25 y 27 de octubre; RFC de la clínica PCE240315AB7 (ticket de 17) vs PCE180412AB3 (45, 46). | P-132 |
| C-16 | Facturas timbradas | 18: 86 timbradas en octubre por $129,430; 33: 218 cobros con CFDI (76% de 286). | P-098 |
| C-17 | Suscripción | 46 cobra $1,600 al mes pero 35 lo "prorratea 12 meses" como gasto fijo; 48 suma un MRR de $5,700 y las cinco filas suman $5,600; una clínica "en prueba" ya muestra cobro de $1,000. | P-117, P-114 |
| C-18 | Nómina | 39: percepciones $48,230 y neto $41,070 de 9 empleados, pero cinco filas ya suman $54,443 y $47,313; los podólogos tienen salario + comisión de octubre en una quincena. | P-103, P-107 |
| C-19 | Mantenimiento | 41: costo del mes $9,800 y las órdenes listadas suman $16,862; "equipos vencidos 2" y solo uno aparece vencido; 15 pone el autoclave de la sede Condesa, 41 en Coyoacán. | P-112, P-024 |
| C-20 | Inventario | 21: 41 de 44 con existencia vs 19: 42 activos + 3 sin existencia; "próximos a caducar 90 d: 3 lotes $1,420" pero el tercer lote está a 98 días y los tres valen ≈ $3,696; los días se cuentan desde el 25-oct mientras las demás pantallas viven el 27-oct; 21 registra la compra OC-0045 en "Todas" las sedes y 23 en Roma Norte. | P-084, P-079 |
| C-21 | Compras y traspasos | 22: costo del traspaso $1,533 vs $1,722 con los costos de 21; 23: el descuento de $393.30 ya está en las líneas; la OC-0045 suma $12,980 con línea parcial. | P-080, P-081, P-057 |
| C-22 | Proveedores | 34, 37, 38 y 41 usan proveedores que no están en el catálogo de 24 (Dental Supply, Farmacia del Ahorro, Papelería Lumen, Podo Ortopedia, Autoclaves del Centro, Láser Med). | P-082 |
| C-23 | Fondo revolvente | 32: $3,800 en la semana de toda la clínica; 37: $3,820 solo de Roma Norte; 37 mete una comisión bancaria de $1,796 al fondo. | P-095 |
| C-24 | Quién atendió la sesión anterior | 47: sesión 1/3 el 10-oct con Ruiz en Roma Norte; 02: 29-sep con Mena para la misma paciente (María Pérez). | P-025 |
| C-25 | Ticket y corte | 17: el ticket imprime TOTAL $1,810 y la pantalla "Total a cobrar" $1,610; las "ventas totales del turno" incluyen anticipos que la misma pantalla dice que no son dinero del turno; las formas de pago son distintas en 17, 32, 33 y 36. | P-059 |
| C-26 | Membresía | 02: "Membresía Pie Sano"; 20: "Anualidad Pie Firme". | P-072 |
| C-27 | Requerimiento contra sí mismo | `REQUERIMIENTO.md` conserva entradas antiguas (IA solo en importación, dictado y alertas fuera, v1/v1.1) y la visión completa que las sustituye; los mockups 08, 09 y 47 ya incluyen dictado, video y asistente. Se tomó la visión completa como vigente. | P-012, P-014 |

Todas son datos de ejemplo salvo que el cliente diga lo contrario; deben unificarse en el set de datos sintéticos antes de usar los mockups como criterio de aceptación en QA.

## Apéndice B · Cobertura de las 71 notas `PREGUNTA:` de los mockups

Cada nota está en al menos una pregunta (o en "Ya decidido"). `01` no trae notas.

| Nota | Preguntas |
|---|---|
| 02-1 | P-002 |
| 03-1 | P-001 |
| 04-1 | P-007, P-008 |
| 04-2 | P-009 |
| 05-1 | P-026, P-034, P-070 |
| 05-2 | P-027 |
| 06-1 | P-010 |
| 06-2 | P-011 |
| 07-1 | P-013 |
| 07-2 | P-034, P-075 |
| 08-1 | P-014, P-124, P-144 |
| 08-2 | P-015 |
| 09-1 | P-016 |
| 09-2 | P-017 |
| 10-1 | P-003 |
| 10-2 | P-004 |
| 11-1 | P-033, P-034 |
| 11-2 | P-039, P-040 |
| 12-1 | P-041 |
| 13-1 | (Ya decidido) |
| 13-2 | P-122 |
| 13-3 | P-124, P-138, P-144 |
| 14-1 | P-020, P-022 |
| 14-2 | P-021 |
| 15-1 | P-023 |
| 15-2 | P-024 |
| 16-1 | P-052 |
| 16-2 | P-052 |
| 16-3 | P-039, P-040, P-053 |
| 17-1 | P-022, P-055 |
| 17-2 | P-056 |
| 17-3 | P-058 |
| 18-1 | P-056, P-061, P-062 |
| 18-2 | P-063 |
| 19-1 | P-067 |
| 20-1 | P-026, P-070 |
| 20-2 | P-072 |
| 21-1 | P-079 |
| 22-1 | P-080 |
| 23-1 | P-081 |
| 24-1 | P-082 |
| 25-1 | P-033, P-034 |
| 25-2 | P-040, P-118 |
| 26-1 | P-004, P-019, P-138, P-139 |
| 26-2 | P-033, P-035, P-036 |
| 27-1 | P-038 |
| 27-2 | P-033, P-035, P-038 |
| 28-1 | P-040, P-056, P-114, P-115, P-117, P-118 |
| 29-1 | P-016, P-017, P-138, P-139 |
| 30-1 | P-050 |
| 31-1 | P-021, P-097 |
| 32-1 | P-088 |
| 33-1 | P-089 |
| 34-1 | P-093 |
| 35-1 | P-092 |
| 36-1 | P-094 |
| 37-1 | P-095 |
| 38-1 | P-076, P-096 |
| 39-1 | P-103, P-104, P-105 |
| 40-1 | P-106 |
| 41-1 | P-024, P-112 |
| 42-1 | P-021, P-025 |
| 43-1 | P-002, P-127 |
| 44-1 | P-002, P-130 |
| 45-1 | P-056, P-061 |
| 45-2 | P-034 |
| 45-3 | P-019, P-138, P-139 |
| 46-1 | P-113, P-114 |
| 47-1 | P-124, P-125 |
| 48-1 | P-121, P-138 |
| 49-1 | P-119 |

## Agenda sugerida para la sesión E3

**Formato:** dos sesiones (A ≈ 3 h 40 min y B ≈ 3 h 25 min; ~7 h 05 min en total, más descansos), con los mockups proyectados (se enseñan pantallas, no archivos). Orden por dependencia: primero lo que define el modelo y el RLS, luego el dinero, al final lo que se puede cerrar con un tercero.

**Quién:** dueño (Roberto Aguilar) todo el tiempo; **un podólogo real** en los bloques 4 y 5; **contador** en los bloques 3 y 7; **abogado o asesor regulatorio** en el bloque 10 (si no puede asistir, queda como pendiente con fecha).

**Antes de la sesión (pre-trabajo):** (1) lista oficial de servicios y precios del primer cliente; (2) verificar con Clip la recurrencia (P-113); (3) elegir proveedor de PAC y de IA; (4) unificar los datos de ejemplo de los mockups (apéndice A).

| Sesión | Bloque | Min | Tema | Preguntas |
|---|---|---|---|---|
| Sesión A | 0 | 10 | Apertura: confirmar "Ya decidido", mostrar los 49 mockups por flujo y aclarar el papel de las respuestas | — |
| Sesión A | 1 | 40 | Organización, sedes, roles y privacidad (define el RLS) | P-128, P-129, P-135, P-130, P-131, P-002, P-119, P-120, P-121, P-102, P-006 |
| Sesión A | 2 | 35 | Agenda, reservas y portal público | P-033, P-034, P-035, P-036, P-037, P-038, P-045, P-046, P-043, P-047, P-042, P-041, P-048, P-044, P-049, P-051, P-134, P-050 |
| Sesión A | 2b | 20 | Recordatorios, WhatsApp, CRM y encuestas | P-039, P-040, P-052, P-053, P-054 |
| Sesión A | 3 | 60 | Dinero entrante: precios, IVA, caja, descuentos, CFDI, planes y paquetes (con contador) | P-069, P-056, P-057, P-068, P-067, P-055, P-058, P-059, P-060, P-078, P-061, P-062, P-063, P-064, P-065, P-066, P-070, P-071, P-072, P-073, P-074, P-075, P-076, P-077 |
| Sesión A | 6 | 25 | Inventario y compras | P-079, P-080, P-081, P-082, P-083, P-084, P-085, P-086, P-087 |
| Sesión A | 9 | 30 | Plataforma: suscripción, IA, importación, retención | P-113, P-114, P-115, P-116, P-117, P-118, P-124, P-125, P-126, P-122, P-123, P-127, P-133, P-132 |
| Sesión B | 4 | 55 | Clínico: expediente, notas, fotos, consentimientos (con podólogo real) | P-001, P-003, P-004, P-005, P-030, P-031, P-012, P-032, P-007, P-008, P-009, P-019, P-025 |
| Sesión B | 5 | 40 | Clínico: planes de tratamiento, pie diabético, plantillas, video, voz, quejas y esterilización | P-028, P-026, P-027, P-029, P-010, P-011, P-013, P-016, P-017, P-018, P-014, P-015, P-020, P-021, P-022, P-023, P-024 |
| Sesión B | 7 | 45 | Finanzas y definiciones de indicadores (con contador) | P-090, P-098, P-101, P-091, P-088, P-089, P-092, P-100, P-093, P-094, P-095, P-096, P-097, P-099 |
| Sesión B | 8 | 25 | RH, comisiones y mantenimiento | P-103, P-104, P-105, P-106, P-107, P-108, P-109, P-110, P-111, P-112 |
| Sesión B | 10 | 25 | Legal y cumplimiento (con abogado o asesor) | P-136, P-137, P-138, P-139, P-140, P-141, P-142, P-143, P-144, P-145, P-146, P-147, P-148, P-149 |
| Sesión B | 11 | 15 | Cierre: lo que queda con terceros, responsables y fechas; el cliente confirma los mockups corregidos (compuerta E3) | — |
| | | **425** | Total (más ~20 min de descansos) | |

Preguntas no asignadas a un bloque (se resuelven si sobra tiempo o por escrito): ninguna.

**Regla de la sesión:** una pregunta que el cliente no puede responder hoy se marca "pendiente con tercero" (contador, abogado, Clip, PAC, podólogo asesor) con responsable y fecha; no se cierra con una suposición.

**Salida de E3:** `REGLAS_NEGOCIO.md` con las respuestas, mockups corregidos y aprobados por el cliente, y la lista de pendientes con terceros. Recién entonces siguen `DICCIONARIO_DATOS.md` / `MODELO_ESTADOS.md` definitivos y E4.
