# PREGUNTAS ABIERTAS — lo que las pantallas NO dicen

> Entregable clave de E2. Las respuestas del cliente se guardan en `REGLAS_NEGOCIO.md` (compuerta E3).
> Ya resueltas en `REQUERIMIENTO.md` (no se repiten): almacén central, niveles de crédito, inventario cíclico/general, interés mensual, recargo único, 10 días de gracia, apartados (10 días, 20 %, anticipo no se devuelve, prórroga por gerente), precios por ajuste sobre lista, PEPS, expediente único, rotación de podólogos.
> **Contradicciones/ambigüedades detectadas** entre documentos y pantallas están en la sección CT.

## CT. Contradicciones y ambigüedades a resolver
- **CT1.** Requerimiento: "recargo en ventas [a plazos], interés en crédito abierto". La pantalla 08 muestra ambos en la misma tabla. ¿Un plan puede tener los dos? Se asumió que no.
- **CT2.** Pantalla 05 muestra "Ajuste sucursal" como porcentaje por partida; la 12 lo define por producto y sucursal. ¿Es el mismo dato o hay ajustes por categoría? 
- **CT3.** El requerimiento dice que el expediente es único y el podólogo rota; la 03 muestra "Última visita · Sucursal Norte". Confirmar que **todo** el contenido clínico es visible en todas las sucursales (PA-C2).

## P. Pacientes
- **PA-P1.** Anti-duplicados: ¿qué identifica a un paciente único (CURP, teléfono, nombre+fecha de nacimiento)? ¿Qué se hace con homónimos o sin CURP? ¿Quién fusiona dos expedientes?
- **PA-P2.** Menores: ¿edad límite para exigir tutor? ¿El tutor es otro paciente? ¿Puede un tutor ver el expediente?
- **PA-P3.** ¿Se permite guardar paciente sin correo o sin teléfono? ¿Qué es obligatorio de verdad?
- **PA-P4.** Baja o derecho de cancelación de datos (LFPDPPP): ¿qué se conserva, cuánto tiempo (mínimo 5 años del expediente)?
- **PA-P5.** Convenios: ¿descuento automático, copago, facturación a la empresa? ¿Quién valida vigencia?

## A. Agenda
- **PA-A1.** ¿Qué es "disponible" para ocupación? ¿Los bloqueos cuentan? ¿Horarios por sucursal (apertura, comida, sábados/domingos)?
- **PA-A2.** Rotación: ¿un podólogo puede estar el mismo día en dos sucursales? ¿Con cuánto tiempo de traslado?
- **PA-A3.** ¿Se permite sobrecupo? ¿Quién autoriza una cita fuera de horario?
- **PA-A4.** Cancelaciones/no-show: ¿hay penalización, anticipo o bloqueo del paciente? ¿Con cuánta anticipación se cancela sin costo?
- **PA-A5.** Citas recurrentes: si se cancela una, ¿se recorren las demás? ¿Qué pasa si el paciente falta a una sesión del plan?
- **PA-A6.** Recordatorios: ¿qué se envía, cuándo, quién paga el canal, qué pasa si el paciente no tiene WhatsApp?
- **PA-A7.** Visitas a domicilio: ¿tarifa, traslado, quién las atiende, se agendan contra qué sucursal?

## C. Clínico
- **PA-C1.** Notas cerradas: ¿se pueden corregir? ¿Con adenda y quién? ¿Cuánto tiempo después? ¿Quién firma (firma electrónica avanzada o autógrafa)?
- **PA-C2.** Visibilidad del contenido clínico por rol: ¿el gerente, el cajero y la administración central ven diagnóstico y notas, o solo datos administrativos? ¿Todos los podólogos ven todo el historial?
- **PA-C3.** Fotos: ¿consentimiento específico? ¿Resolución, retención, quién puede descargarlas?
- **PA-C4.** Catálogo CIE-10: ¿completo o un subconjunto de podología? ¿Catálogo de procedimientos propio?
- **PA-C5.** Consumo de insumos: ¿por procedimiento (receta estándar) o lo captura el podólogo? ¿Qué pasa si no hay stock al descontar?
- **PA-C6.** Plan de tratamiento: ¿se cobra por sesión, por paquete o ambos? ¿Si el paciente abandona, qué pasa con lo prepagado?
- **PA-C7.** Alertas clínicas (anticoagulado, alergia): ¿bloquean ciertos procedimientos o solo avisan?
- **PA-C8.** Referencias y recetas: ¿se imprimen, se envían digital? ¿Se prescriben medicamentos controlados?

## V. Ventas, devoluciones, comisiones
- **PA-V1.** Redondeo: ¿a peso, a 50 centavos, centavos exactos? ¿El ajuste por sucursal se aplica antes o después del descuento?
- **PA-V2.** Devolución: ¿plazo máximo, condiciones del producto, quién autoriza y a partir de qué monto? ¿Se reembolsa en efectivo si se pagó con tarjeta? ¿Se acepta devolución en otra sucursal? ¿El reingreso al stock es automático?
- **PA-V3.** Una venta cobrada en una sucursal distinta a la de atención: ¿a quién se le acredita el ingreso (sucursal de atención, de cobro, del producto)? Define M1, M2 y comisiones.
- **PA-V4.** Cambio de precio: ¿afecta apartados y planes ya creados? Se asume que se congela al crear. ¿Lo confirman?
- **PA-V5.** Comisiones: base (precio, utilidad), porcentaje por rol y producto, cuándo se generan (al cobrar o al liquidar), qué pasa con una devolución.
- **PA-V6.** Descuentos: ¿quién puede darlos y hasta cuánto sin autorización? ¿Se acumulan con promociones y convenios?
- **PA-V7.** Facturación: ¿cuándo se factura (al cobro, en bloque mensual)? ¿Cuánto tiempo tiene el paciente para solicitarla? ¿Cómo se cancela y se reemplaza?
- **PA-V8.** IVA: ¿los servicios médicos están exentos, los productos gravados? ¿Cómo se desglosa en un ticket mixto?
- **PA-V9.** Garantías: ¿plazo por tipo de producto y quién aprueba un reclamo?

## AP. Apartados
- **PA-AP1.** Al vencer, "no se devuelve el anticipo": ¿se registra como ingreso (qué día) o queda como saldo a favor retenido? Efecto contable y fiscal.
- **PA-AP2.** Prórroga: ¿cuántas veces, por cuántos días, con motivo obligatorio?
- **PA-AP3.** ¿Se pueden apartar productos sin existencia (pedido a proveedor o a laboratorio)? ¿Se permite apartar varios productos juntos?
- **PA-AP4.** ¿El apartado reserva la unidad exacta (lote, talla) y descuenta de existencia disponible?

## CR. Crédito y plazos
- **CR1.** Base del interés: ¿saldo total o saldo vencido? Capitalización: ¿simple o compuesta? ¿Se calcula por día y se cobra mensual?
- **CR2.** Recargo único: ¿monto fijo o porcentaje (parámetro)? ¿Sobre la parcialidad vencida o el saldo? ¿Se cobra al día 11 o al vencer?
- **CR3.** ¿Cómo se aplica un abono: primero a recargo, interés, capital? ¿Pago adelantado reduce intereses?
- **CR4.** Límite de crédito: ¿cómo se calcula o lo asigna una persona? ¿Depende del historial? ¿Cuál es el enganche mínimo en ventas a plazos?
- **CR5.** Sin tope de mora: ¿qué hace el sistema con deudas muy viejas (condonación, castigo, cobranza externa)? ¿Quién condona un recargo?
- **CR6.** ¿El crédito se bloquea automáticamente? Se asume manual (gerente). ¿Se permite vender a crédito a un paciente con mora?
- **CR7.** ¿Se firma pagaré o contrato? ¿Se requiere aval?
- **CR8.** Niveles de autorización: ¿el monto que cuenta es la venta, el saldo total del paciente o el límite solicitado? Umbrales exactos ($ por nivel).

## CJ. Caja y turnos
- **CJ1.** Diferencias: ¿tolerancia sin justificar (por ejemplo ±$20)? ¿Quién aprueba la diferencia y qué pasa con el faltante (se descuenta al cajero)?
- **CJ2.** ¿Cuántas cajas físicas por sucursal y por turno? ¿Dos cajeros pueden operar al mismo tiempo en la misma caja?
- **CJ3.** Cambio de turno vs. corte Z: ¿cuándo se hace cada uno? ¿Quién cuenta (ciego) y quién firma?
- **CJ4.** Depósitos y retiros: ¿límite de efectivo en caja? ¿Quién autoriza retiros?
- **CJ5.** Cobros con terminal: ¿conciliación automática con el banco o manual? ¿Cómo se registran comisiones bancarias y contracargos?
- **CJ6.** Reimpresión y cancelación de ticket: ¿quién, hasta cuándo, con qué bitácora?
- **CJ7.** ¿Qué pasa con una venta si se cae la red? ¿Se opera offline y se sincroniza después?

## T. Tiempo y datos
- **PA-T1.** Zona horaria: ¿las 7 sucursales comparten zona? ¿El corte del día es a las 00:00 o al cierre del turno nocturno/último cajero?
- **PA-T2.** Concurrencia: dos cajeros con la última unidad; dos recepcionistas con el mismo horario; dos usuarios editando el mismo expediente. ¿Quién gana, qué se avisa?
- **PA-T3.** Volumetría y retención: ¿pacientes por día, SKUs, fotos por paciente? ¿Cuánto tiempo se conserva cada tipo de dato (clínico, venta, bitácora)?
- **PA-T4.** Histórico cuando cambia una regla: tarifas, parámetros de mora, niveles de autorización — se asume que se congelan al crear el documento. Confirmar.

## I. Inventarios y compras
- **PA-I1.** PEPS entre sucursales: al hacer traspaso, ¿el costo viaja con la capa (se asume que sí)? ¿Qué costo se usa si hay devolución de cliente?
- **PA-I2.** Devolución de cliente al inventario: ¿a qué capa regresa y con qué costo?
- **PA-I3.** Compra local de urgencia: ¿monto máximo y quién la autoriza? ¿Qué pasa con la factura a nombre de quién?
- **PA-I4.** Diferencias en recepción y en traspaso: ¿quién asume el faltante y en cuánto tiempo se reclama?
- **PA-I5.** Umbrales de ajuste de inventario: monto por nivel (gerente/admin central). ¿Se descuenta el faltante al responsable?
- **PA-I6.** Insumos clínicos vs. mercancía: ¿mismo almacén o separados? ¿Los insumos tienen conteo distinto?
- **PA-I7.** Inventario general: ¿se cierra la sucursal o se opera con movimientos congelados? ¿Cuánto tiempo?
- **PA-I8.** Caducidades: ¿alertas con cuántos días de anticipación, y qué se hace con lo caducado (merma, devolución a proveedor)?
- **PA-I9.** Mínimos y máximos: ¿los define el administrador central o el gerente? ¿El sugerido de compra es automático?
- **PA-I10.** Lote vs. serie: ¿qué productos requieren control por serie (equipo de valor)?

## L. Laboratorio externo
- **PA-L1.** ¿Cuántos laboratorios y con qué condiciones de pago? ¿Se paga contra recepción o por anticipado?
- **PA-L2.** Anticipo del paciente: ¿porcentaje fijo? ¿Si cancela, se devuelve?
- **PA-L3.** Retrabajo: ¿quién asume el costo (laboratorio, clínica)? ¿Se vuelve a cobrar al paciente?
- **PA-L4.** Plazos prometidos y penalización por retraso. ¿Cómo se comunica el retraso al paciente?
- **PA-L5.** Entrega: ¿en qué sucursal se entrega (la de prescripción u otra)? ¿Quién valida el ajuste final?

## S. Esterilización y cumplimiento
- **PA-S1.** ¿Cuántos sets y autoclaves por sucursal? ¿Frecuencia del indicador biológico?
- **PA-S2.** Si un ciclo es no conforme: ¿qué se hace con los sets y con las consultas ya hechas con ellos?
- **PA-S3.** RPBI: ¿se registra por sucursal y proveedor de recolección? ¿Quién firma manifiestos?
- **PA-S4.** Responsable sanitario: ¿uno por sucursal o central? ¿Qué reportes necesita para inspecciones?

## G. Gobierno, autoridad y bitácora
- **PA-G1.** ¿Quién puede cancelar o corregir ventas, notas clínicas, citas cerradas y cortes? ¿Se exige motivo y se notifica a alguien? Se asume bitácora completa en todos los casos.
- **PA-G2.** Un usuario con rol de gerente en una sucursal y podólogo en otra: ¿puede ser ambos al mismo tiempo?
- **PA-G3.** Autorizaciones fuera de línea o ausencia del gerente: ¿suplente automático o escalamiento por tiempo?
- **PA-G4.** Bajas de usuario: ¿qué pasa con sus pendientes, citas y comisiones?
- **PA-G5.** ¿Existe una dirección o contador con acceso de solo lectura, interno o externo?

## O. Operación y tecnología
- **PA-O1.** Hardware disponible por sucursal: impresora de tickets, lector de código de barras, escáner 3D, terminal bancaria, tableta en consultorio.
- **PA-O2.** Conectividad de cada sucursal: ¿hay riesgo de caídas? ¿Se requiere modo offline en caja y consulta?
- **PA-O3.** Migración: ¿existe sistema actual o solo papel/Excel? ¿Qué se migra (pacientes, saldos de crédito, inventario inicial por capa PEPS)?
- **PA-O4.** Integraciones obligatorias: PAC para CFDI, WhatsApp Business, contabilidad. ¿Cuál es la contabilidad actual?
- **PA-O5.** Lanzamiento: ¿piloto en una sucursal o las 7 a la vez?

---

# AMPLIACIÓN V2 — preguntas que la ampliación deja abiertas

> La ampliación se construyó en modo demostración **antes** de la sesión de E3. Cada regla implementada es una **decisión por defecto** (ver `REGLAS_NEGOCIO.md`); estas preguntas son las que el cliente debe responder para confirmarlas o cambiarlas. Entre paréntesis, lo que hace hoy el sistema.
> Numeración corrida **V2-1 a V2-91**. Las preguntas del análisis original (PA-…, CR…, CJ…, CT…) **siguen abiertas**; no se repiten aquí.
> ★ = las que más cambian lo construido (agrupadas al final en «Las cinco preguntas más importantes»).

## A. Recursos humanos y nómina
- **V2-1.** ¿Cada cuándo se paga la nómina (semanal, quincenal, mensual) y quién la calcula hoy? (Quincenal o mensual, a elegir.)
- **V2-2.** ★ ¿El sistema debe calcular la **nómina legal** (ISR, IMSS, subsidio, timbrado) o basta una **prenómina** que se entrega al contador? ¿Quién timbra hoy? (Solo prenómina: sueldo ÷ 30 por día, sin impuestos.)
- **V2-3.** ¿Cuál es la política real de retardos? (10 minutos de tolerancia; cada 3 retardos se descuenta 1 día.) ¿Está en el reglamento interior? El descuento por retardos debe revisarlo el contador o abogado laboral.
- **V2-4.** ¿Una falta descuenta un día (sueldo ÷ 30)? ¿Afecta el séptimo día? ¿Y la falta justificada?
- **V2-5.** Horarios reales por puesto y por sucursal, día de descanso, turnos. ¿Hay horas extra y cómo se pagan? (Un horario fijo por persona; no hay horas extra.)
- **V2-6.** Checador: ¿se checa desde el teléfono de cada quien, desde un equipo fijo de la sucursal, con ubicación, código o huella? ¿Qué pasa si alguien olvida checar la salida y quién lo corrige? (Desde la cuenta de cada persona, en la sucursal donde se firmó; no hay corrección de marcas.)
- **V2-7.** El personal que rota: ¿a qué sucursal se carga su sueldo? (Completo a su sucursal base.) ¿Debe repartirse por días trabajados en cada una?
- **V2-8.** Vacaciones: ¿la tabla mínima de la ley o prestaciones superiores? ¿Se acumulan de un año a otro o caducan? ¿Prima del 25 %? (Tabla de ley, sin acumular años anteriores.)
- **V2-9.** Tipos de incidencia reales y quién autoriza cada una. ¿Cómo se registran las incapacidades del IMSS?
- **V2-10.** Expediente del empleado: documentos obligatorios por puesto, dónde se guardan los archivos y **quién puede ver sueldos** y datos personales. (El gerente ve el sueldo de su gente; solo administración lo cambia.)
- **V2-11.** Bajas: ¿quién calcula el finiquito? ¿Catálogo de motivos? Si alguien reingresa, ¿conserva su antigüedad? (El reingreso reinicia la antigüedad y guarda la fecha original.)
- **V2-12.** Altas, bajas y cambios de sueldo ante el IMSS: ¿basta con que el sistema avise «pendiente de envío» o debe generar algo?
- **V2-13.** ¿Cuántos empleados hay por puesto y sucursal? ¿Los sueldos son fijos o tienen parte variable?

## B. Bonos y metas
- **V2-14.** ★ ¿Cuáles son los **esquemas de bono reales**: sobre qué se calculan, escalones, topes y a quién aplican? (Los cuatro esquemas cargados son inventados y están marcados «por validar».)
- **V2-15.** ★ ¿Quién «hizo la venta»: el podólogo que la indica, quien atiende en mostrador o quien cobra? ¿Se elige al vendedor en caja? ¿Una venta puede repartirse entre dos personas? (La consulta se atribuye al podólogo; lo demás, a quien cobra.)
- **V2-16.** Una venta hecha por un colaborador en otra sucursal: ¿cuenta para la sucursal de la venta o para la sucursal base del colaborador? (La de la venta.)
- **V2-17.** Si una venta se devuelve o cancela después de pagado el bono, ¿se recupera? (No hay reversa; antes de aprobar sí se resta.)
- **V2-18.** Bono de sucursal: ¿se reparte por días trabajados, parejo o por puesto? ¿Participan gerente y almacén? ¿Qué pasa con la parte de quien no cumple? (Proporcional a días trabajados en esa sucursal; la parte de quien no cumple se reparte entre los demás.)
- **V2-19.** ¿Hay condiciones para cobrar el bono (asistencia mínima, calificación mínima de clientes, capacitación al corriente)? Si falta el dato, ¿se da por cumplida? (Sí se da por cumplida.)
- **V2-20.** Las **comisiones** del requerimiento original (podólogo y vendedor, PA-V5) y estos **bonos**: ¿son lo mismo o se pagan los dos?
- **V2-21.** ¿El trimestre es calendario (enero–marzo…) o propio? (Calendario.)
- **V2-22.** Metas: ¿quién las fija y cuándo? ¿Con IVA o sin IVA? ¿Netas de devoluciones? ¿Solo por sucursal o también por persona o categoría? (Por sucursal y mes; las fija administración; el gerente propone.)
- **V2-23.** ¿Aceptan el método con el que el sistema **sugiere** la meta? (Promedio de los últimos 3 meses, ajustado por tendencia y por el mismo mes del año anterior, entre 85 % y 125 % del promedio.)
- **V2-24.** ¿Se puede cambiar una meta a mitad de mes? (Sí, mientras no haya bono aprobado con ella.)
- **V2-25.** ¿Quién aprueba y quién paga los bonos? ¿Se pagan en la nómina? ¿Cada quien ve solo lo suyo? (Aprueba y paga administración o dirección; cada persona ve lo suyo y su lugar entre compañeros, sin importes ajenos.)

## C. Gastos, compras y estado de resultados
- **V2-26.** Catálogo real de categorías de gasto y cuáles son fijas. (Nueve categorías de ejemplo.)
- **V2-27.** ★ **Gastos del corporativo** (dirección, administración, almacén central, publicidad de la marca): ¿se reparten entre sucursales y con qué criterio? (Hoy no se cargan a ninguna sucursal: la suma de las siete no incluye el corporativo.)
- **V2-28.** Nómina dentro del estado de resultados: ¿sueldo nominal o costo completo con IMSS, Infonavit, impuesto sobre nómina y provisión de aguinaldo? (Sueldo bruto nominal.)
- **V2-29.** Comisiones y bonos en el estado de resultados: ¿el monto real aprobado o un estimado? (Estimado fijo del 2 % de los ingresos.)
- **V2-30.** Ingresos: ¿con o sin IVA? ¿Cuenta la venta o el cobro (crédito, plazos, apartados)? ¿Las devoluciones restan de la venta original o del día en que ocurren? ¿El anticipo de un apartado vencido es ingreso? (Venta, sin separar IVA, sin restar devoluciones.)
- **V2-31.** Costo: ¿los insumos clínicos consumidos son costo variable? ¿Cuáles son los **márgenes por servicio** (pendientes de recibir)?
- **V2-32.** ¿Hasta dónde llega el estado financiero: utilidad operativa, o también depreciación, intereses e impuestos? (Utilidad operativa.)
- **V2-33.** Gastos: ¿quién captura, quién autoriza, hay tope sin autorización, es obligatorio el comprobante fiscal? ¿Se puede borrar un gasto? (Captura gerente o administración; solo administración borra, con motivo.)
- **V2-34.** ¿Se cierra el mes? ¿Quién lo reabre? (No hay cierre de mes.)
- **V2-35.** Gastos recurrentes reales por sucursal (renta, luz, agua, internet, limpieza): monto y día. ¿La luz es fija o varía?
- **V2-36.** Alerta de gasto fuera de patrón: ¿sirve el criterio? (1.6 veces lo normal y al menos $1,000 más.)
- **V2-37.** Notas de compra: ¿qué documentos llegan (nota de remisión, factura, ticket)? ¿Siempre generan una cuenta por pagar? ¿Quién confirma la captura? (Almacén o administración; siempre genera cuenta por pagar.)

## D. Precios
- **V2-38.** ★ «Registrar por qué cambió el precio **y qué tipo de cambio fue**»: ¿cuál es el catálogo de tipos (alza del proveedor, promoción, corrección, ajuste anual…)? (Hoy solo se guarda el motivo en texto libre; **el tipo no existe**.)
- **V2-39.** «El alta de la compra ligada»: ¿el cambio de precio debe quedar ligado a la nota de compra que lo originó? ¿El sistema debe sugerir el precio a partir del costo nuevo? (No hay liga.)
- **V2-40.** ¿Un precio puede programarse para entrar en vigor en una fecha? ¿Quién lo autoriza? (Cambia al momento; solo administración central.)
- **V2-41.** **Lista de precios real.** El cliente dio un ticket de $800 en quiropodia y $2,500 en plantillas; la demostración tiene quiropodia a $450 y plantillas a $450–$780. Enviar la lista vigente.
- **V2-42.** El catálogo central «se cambia en un lugar y lo ven todas»: ¿se conserva el ajuste por sucursal confirmado en el requerimiento original o ahora el precio es único? (Se conserva el ajuste por sucursal.)
- **V2-43.** Precio en la tienda en línea: ¿el de la sucursal donde se recoge o uno único? (El de la sucursal de recolección.)
- **V2-44.** ¿Existe un margen mínimo por debajo del cual no se puede poner un precio?

## E. Tienda en línea y pagos
- **V2-45.** Pasarela de pago: ¿cuál, quién absorbe la comisión, hay meses sin intereses? (Pago en línea simulado.)
- **V2-46.** Envío a domicilio: ¿se ofrece? ¿Zonas, costo, paquetería, envío gratis desde cierto monto? (Costo fijo de $99 marcado «por validar».)
- **V2-47.** ¿Qué se vende en línea? ¿Plantillas a medida, servicios, citas con anticipo? (Solo productos de mostrador.)
- **V2-48.** Existencia: ¿se toma de la sucursal de recolección o del almacén central? ¿Cuánto tiempo se guarda un pedido que nadie recoge? (De la sucursal; sin vencimiento.)
- **V2-49.** Cancelación y reembolso: plazos, quién autoriza, cómo se devuelve el dinero. (Lo cancela caja, almacén o gerencia con motivo; el reembolso solo queda marcado.)
- **V2-50.** ¿El pedido en línea se factura? ¿Cómo pide factura el cliente?
- **V2-51.** ¿A quién se atribuye la venta en línea para bonos y cuenta para la meta de la sucursal? (A quien entrega; sí cuenta.)
- **V2-52.** ¿El cliente de la tienda se da de alta como paciente? Aviso de privacidad y términos de la tienda. (No se da de alta.)
- **V2-53.** ¿Basta folio + teléfono para que el cliente consulte su pedido?
- **V2-54.** ¿Límite de piezas por producto en un pedido? (20.)

## F. Auditoría de inventario con IA
- **V2-55.** ¿Qué productos son «los principales» a auditar, cada cuánto y quién toma la foto? (Cualquier producto; alerta si pasan más de 7 días sin auditar una sucursal.)
- **V2-56.** ¿Qué diferencia se tolera? (10 % o al menos 1 pieza.)
- **V2-57.** Cámaras de seguridad: marca, cómo se obtiene la imagen, quién la sube. ¿Hay consentimiento del personal y aviso a pacientes por el uso de imágenes?
- **V2-58.** Servicio de visión: proveedor, costo y precisión aceptable. ¿La estimación puede generar un ajuste de inventario o solo una alerta? (Simulado; el ajuste siempre pasa por autorización.)
- **V2-59.** ¿Qué pasó en el robo reciente: qué productos, qué sucursal, cómo y cuándo se detectó? Define qué se audita primero.
- **V2-60.** Fotos como evidencia: ¿cuánto tiempo se conservan? (La demostración guarda 40 fotos en total.)
- **V2-61.** ¿Quién cierra una investigación y qué consecuencias tiene un faltante? (Cierra gerente o administración; sin consecuencias en el sistema.) Descontar al responsable es tema laboral.
- **V2-62.** ¿La auditoría a distancia sustituye o complementa el inventario cíclico ya confirmado? (Lo complementa: no sustituye el conteo físico.)

## G. Capacitación y acervo
- **V2-63.** Cursos obligatorios por puesto, calificación mínima, número de intentos, vigencia. (Mínimo configurable de 50 a 100; intentos ilimitados; sin vigencia.)
- **V2-64.** Videos en YouTube: ¿cuenta de la empresa, videos «no listados»? ¿Es aceptable que material interno (técnicas de corte) viva ahí? Si aparecen pacientes, ¿hay consentimiento?
- **V2-65.** ¿La constancia es interna o debe servir ante la autoridad laboral (formato DC-3)? (Interna.)
- **V2-66.** ¿Un curso sin terminar impide operar o cobrar bono? (No.)
- **V2-67.** Acervo: ¿quién publica, quién revisa y cada cuánto? ¿Hay material confidencial?
- **V2-68.** ¿La capacitación se toma dentro de la jornada?

## H. Comunicación
- **V2-69.** ¿La mensajería interna sustituye a la aplicación que usan hoy? ¿Necesitan notificaciones al teléfono? (No hay notificaciones fuera de la aplicación.)
- **V2-70.** Correo: ¿basta el interno o debe salir a correos externos? ¿Con qué dominio y proveedor? (Solo interno.)
- **V2-71.** Moderación y privacidad: ¿quién publica avisos? ¿Se pueden borrar mensajes? ¿Cuánto se conservan? ¿Dirección puede leer conversaciones privadas? (Nadie lee conversaciones ajenas; los mensajes no se borran.)
- **V2-72.** El feed «para toda la comunidad»: ¿solo el personal o también pacientes y clientes? (Solo personal.)
- **V2-73.** Archivos adjuntos: ¿qué tipos y tamaños? (Solo una imagen reducida.)
- **V2-74.** ¿Se permite mencionar datos de pacientes en mensajes y correos?

## I. Asistente, análisis y módulos generales
- **V2-75.** Asistente inteligente: ¿qué preguntas importan? ¿Puede ejecutar acciones con confirmación (pedir un traspaso, registrar recordatorios de cobro)? ¿Quién lo usa? ¿Se autoriza enviar datos del negocio a un modelo de lenguaje externo y con qué proveedor? (Motor de reglas local; lo usan gerente, administración y dirección.)
- **V2-76.** Evaluación de clientes: ¿qué se pregunta, por qué canal, cuándo se envía, es anónima? ¿A quién avisa una calificación baja? (Tres preguntas de 1 a 5; alerta con calificación de 2 o menos.)
- **V2-77.** Tablero de dirección: ¿qué indicadores quieren ver primero? ¿Usarán una herramienta externa de análisis? ¿Cada cuánto se carga el almacén de datos?
- **V2-78.** Documentos de la clínica: ¿cuáles se controlan, con qué vigencia y quién responde por cada uno? (Licencias, avisos, contratos, pólizas y permisos de ejemplo.)
- **V2-79.** Módulos generales (consulta a base de datos, validación, entrega, cálculos): ¿quién del cliente tendrá acceso?

## J. Datos, sedes e identidad
- **V2-80.** ★ **5 sedes o 7.** El sistema hermano Pie Firme está armado para 5 sedes; esta versión, para 7. ¿Cuáles son las 7 sucursales reales (nombre, dirección, horario)? (Nombres inventados: Centro, Norte, Sur, Oriente, Poniente, Polanco, Coyoacán.)
- **V2-81.** **Pie Clinic o Pie Firme.** ¿Cómo se llama el producto, cuál es el logo y el dominio? ¿Pie Clinic es la marca del cliente y Pie Firme la del producto?
- **V2-82.** **8 roles o 3.** Aquí hay ocho roles; Pie Firme tiene tres (administrador, podólogo, recepción). ¿Cuál es la lista definitiva y cómo se corresponden?
- **V2-83.** Misma base y mismo esquema `piefirme`: ¿Pie Clinic es una organización más dentro del esquema? ¿Convive con los datos de prueba de Pie Firme? Si hay dos aplicaciones sobre el mismo esquema, ¿cuál manda cuando difieren? (Decisión del dueño de RANNIX; falta el detalle.)
- **V2-84.** «Incorporar toda la funcionalidad de Pie Firme»: lista de lo que falta aquí (reserva en línea, facturación, importación con IA, formatos impresos reales, conciliación…) y en qué orden.
- **V2-85.** ¿Otras cadenas usarán el producto? ¿Cómo se cobra?
- **V2-86.** Datos de arranque: ¿qué se migra (empleados, sueldos, metas históricas, gastos de meses anteriores)? Sin historia real el sistema no puede sugerir metas.
- **V2-87.** Zona horaria y corte del día para asistencia, bonos y estado de resultados (sigue abierta PA-T1). (Fecha del navegador; día natural.)
- **V2-88.** Retención: ¿cuánto se conservan bitácora, mensajes, asistencia, recibos y fotos?
- **V2-89.** Concurrencia: dos personas aprobando el mismo bono o editando la misma meta. (No resuelto: la demostración es de un solo navegador.)
- **V2-90.** ¿Quién firma por el cliente la compuerta de reglas (E3) y el acta de QA (E6)? ¿Quién decide y quién paga?
- **V2-91.** Fecha objetivo y forma de arranque: ¿una sucursal piloto o las siete?

## Las cinco preguntas más importantes
1. **V2-14 y V2-15** — Esquemas de bono reales y quién «hizo la venta».
2. **V2-27** (con V2-28 y V2-31) — Qué gastos son de la sucursal y cuáles del corporativo, y los márgenes por servicio: sin esto la rentabilidad por sucursal no es la del cliente.
3. **V2-2** (con V2-3) — Nómina legal o prenómina, y la política real de faltas y retardos.
4. **V2-80, V2-81 y V2-82** — 5 o 7 sedes, Pie Clinic o Pie Firme, 8 o 3 roles.
5. **V2-38** (con V2-41) — El «tipo de cambio de precio», que hoy no existe en el sistema, y la lista de precios real.
