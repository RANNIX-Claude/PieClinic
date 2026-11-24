# REGLAS DE NEGOCIO — Clínicas de Podología (podix) · Pie Clinic

> Documento de la etapa **E3**. Define qué es **correcto**, no qué se ve. Se actualiza cada vez que una regla cambia.

**Confirmado por:** — **SIN FIRMA.** Nadie del cliente ha confirmado este documento.

## Estado de la compuerta E3 (léase antes que todo)

- **La compuerta E3 NO está firmada.** No hay nombre, cargo ni fecha de confirmación del cliente.
- **Desviación de la metodología, registrada:** la fábrica establece que «no se escribe una línea de código antes de ese sí». Aquí se hizo al revés: el sistema original y la **ampliación V2** (personas, finanzas, desempeño, comercial, comunicación, plataforma) se **construyeron en modo demostración antes de la firma**, por decisión del dueño de RANNIX, para poder mostrarlo al cliente fundador. Tampoco hubo etapa E2 (mockups) para la ampliación.
- **Consecuencia:** todo lo que no dice «confirmada por el cliente» es una **decisión por defecto, revisable**. Cambiarla después de la firma se trata como corrección, no como trabajo extra. El riesgo de retrabajo es de RANNIX.
- **Estados usados** (solo dos):
  - **C — confirmada por el cliente.** Únicamente las que `CLAUDE.md` y `REQUERIMIENTO.md` (decisiones confirmadas del requerimiento original) ya daban por confirmadas. Aun así, están pendientes de firma formal.
  - **D — decidida por defecto, revisable.** Todo lo demás, incluido lo que el dueño de RANNIX dictó en nombre del cliente para la ampliación.
- Cuando una regla C tiene un **valor numérico** que nadie confirmó (por ejemplo el 3 % de interés), la regla es C y el valor es D; se indica.
- Las reglas se **leyeron del código**, no de una sesión con el cliente. Las preguntas que las confirmarían están en [`PREGUNTAS_ABIERTAS.md`](PREGUNTAS_ABIERTAS.md) (PA-… y V2-…).
- El dominio **plataforma** estaba **en construcción** al escribir esto (21 de noviembre de 2026); sus reglas (RN-X) describen lo que había en ese momento.

---

## 1. Definiciones

| Término | Definición exacta en este sistema | Estado |
|---|---|---|
| Sucursal | Unidad de operación y de costo: tiene su almacén, su personal base, su renta y sus gastos. Hay 7 (S1–S7) más el almacén central (CEN), que no es sucursal | D (7 sucursales: C) |
| Sucursal activa («Trabajando en») | La sucursal donde el usuario se firmó hoy. Todo lo que registra queda en ella | D |
| Sucursal base | La sucursal a la que pertenece un empleado para nómina y costo, aunque rote | D |
| Gestor | Gerente (de alguna sucursal donde trabaja la persona), administración central o dirección | D |
| Vendedor | Quien «hizo la venta»: el `vendedorId` del ticket; si no hay, quien cobró. En el cobro de una consulta, el podólogo | D |
| Venta atribuida | Total del ticket no cancelado menos sus devoluciones vigentes, contado en la sucursal de la venta | D |
| Periodo de bono | Mes calendario o trimestre calendario (ene–mar, abr–jun, jul–sep, oct–dic) | D |
| Periodo terminado | Aquel cuyo último mes es anterior al mes en curso | D |
| Meta | Importe de venta que una sucursal debe alcanzar en un mes | D |
| Estado de resultados (EDR) | Estado de resultados **operativo** por sucursal: ingresos − gastos variables − gastos de operación. No es un estado financiero contable | D |
| Mes cerrado / mes en curso | Cerrado: anterior al actual, sale del histórico mensual. En curso: parcial, sale de los tickets | D |
| Gasto de operación | Gasto registrado a una sucursal en una de las categorías del catálogo | D |
| Gasto recurrente | Gasto que se repite cada mes (renta, luz…) y se genera con un botón | D |
| Nota de compra | Documento del proveedor capturado (a mano o leído por IA) que genera una cuenta por pagar | D |
| Prenómina | Cálculo de demostración: sueldo del periodo menos descuentos por faltas y retardos. **No** es nómina legal | D |
| Retardo | Entrada posterior al horario más la tolerancia | D |
| Falta | Día laborable pasado, sin marca, que el gestor marcó como falta | D |
| Auditoría a distancia | Revisión de inventario por foto en la que una estimación se compara contra el sistema. No sustituye el conteo físico | D |
| Diferencia (de auditoría) | Estimado contra sistema fuera de la tolerancia | D |
| Calificación baja | Encuesta con alguna de sus tres calificaciones en 2 o menos | D |
| Simulado | Función que depende de un servicio no contratado y devuelve un resultado de demostración, rotulado en pantalla | D |
| Expediente único, PEPS, apartado, crédito abierto, venta a plazos, días de gracia | Como en `REQUERIMIENTO.md` (decisiones confirmadas) | C |

---

## 2. Métricas

Cada indicador con su fórmula, granularidad y **qué excluye** está en [`METRICAS.md`](METRICAS.md): M1–M22 (sistema original) y M23–M73 (ampliación). Las de mayor riesgo:

| Métrica | Fórmula resumida | Excluye | Regla |
|---|---|---|---|
| Margen del EDR (M27) | (ingresos − producto y laboratorio − comisiones estimadas 2 % − nómina base − gastos) ÷ ingresos | Corporativo, carga social, devoluciones, IVA, depreciación | RN-F02 a RN-F08 |
| Bono individual (M34) | Escalón más alto alcanzado × toda la base, con tope y condiciones | Canceladas; no es marginal | RN-N06, RN-N07 |
| Bolsa de sucursal (M35) | Por cumplimiento de meta; reparto por días trabajados | Quien no cumple condiciones | RN-N08 |
| Cumplimiento de meta (M36) | Venta neta ÷ meta | Meses sin meta | RN-N15 |
| Calificación de clientes (M43) | Promedio de tres preguntas de 1 a 5 | Encuestas pendientes | RN-E01 |
| Asistencia y retardos (M48–M50) | Entrada contra horario + tolerancia | Descansos y ausencias justificadas | RN-P02 |
| Cuadre del DW (M70) | DW − operación en 10 totales; cuadra si < $0.005 | — | RN-X02 |

**Definiciones que no coinciden entre módulos** (ventas, utilidad, cartera vencida, ocupación): listadas al final de `METRICAS.md`. Son contradicciones **abiertas**, no resueltas.

---

## 3. Reglas del sistema original (base)

| Id | Regla | Parámetro (valor en la demostración) | Dónde vive | Estado |
|---|---|---|---|---|
| RN-B01 | Precio final = precio base × (1 + ajuste % de la sucursal). El ajuste específico del producto o servicio gana sobre el ajuste general de la sucursal | ajuste por sucursal (`d.ajustesPrecio`) | `src/store/reglas.js` → `precioFinal`, `ajustePct` | C |
| RN-B02 | Solo administración central cambia el precio base y los ajustes; el motivo es obligatorio (mínimo 5 caracteres) y queda historial con antes y después. **No se registra el «tipo de cambio»** que pidió la ampliación | — | `src/store/acciones_admin.js` → `cambiarPrecioBase`, `cambiarAjuste` | D |
| RN-B03 | Costeo PEPS por capas: la salida consume primero la capa más antigua; si no alcanza la existencia, no consume nada | — | `reglas.js` → `salidaPEPS`, `entradaCapa`, `valuacion` | C |
| RN-B04 | Disponible = existencia − piezas apartadas activas (el almacén central no aparta) | — | `reglas.js` → `disponible` | D |
| RN-B05 | Bajo mínimo = existencia menor al mínimo del producto; no aplica al almacén central | mínimo por producto | `reglas.js` → `bajoMinimo` | D |
| RN-B06 | Apartado: vigencia y anticipo mínimo por sucursal | 10 días · 20 % | `reglas.js` → `estadoApartado`, `anticipoMinimo`; `seed.js` → `PARAMS_DEFECTO` | C |
| RN-B07 | Un apartado está «por vencer» cuando faltan 2 días o menos | 2 días (fijo en código) | `reglas.js` → `estadoApartado` | D |
| RN-B08 | El anticipo de un apartado vencido no se devuelve; la prórroga la autoriza el gerente | política por sucursal | `src/store/acciones.js`, `acciones_gerente.js` | C |
| RN-B09 | Una parcialidad está «vencida» solo después de los días de gracia | 10 días | `reglas.js` → `estadoParcialidad` | C |
| RN-B10 | Crédito abierto: interés mensual **simple** sobre el capital pendiente de la parcialidad vencida, por meses completos o iniciados después de la gracia (mínimo 1) | 3 % mensual (2.5 % a 3.5 % según sucursal) | `reglas.js` → `moraParcialidad` | C la regla · D el valor y la forma de contar meses |
| RN-B11 | Venta a plazos: recargo **único** sobre el pendiente de la parcialidad vencida; no se acumula con interés | 5 % | `reglas.js` → `moraParcialidad` | C la regla · D el valor |
| RN-B12 | Un abono se aplica a la parcialidad más antigua primero y, en ella, a la mora antes que al capital | — | `src/store/acciones_cajero.js` (`repartirAbono`) | D |
| RN-B13 | Autorización de crédito por niveles según el monto | hasta $2,000 gerente · hasta $10,000 administración · más, dirección | `reglas.js` → `nivelCredito` | C los niveles · D los montos |
| RN-B14 | Ajuste de inventario autorizado por nivel según el valor | hasta $500 gerente · más, administración | `reglas.js` → `nivelAjuste` | C · D el monto |
| RN-B15 | Un gerente resuelve solo autorizaciones de su nivel y de su sucursal; administración resuelve las de gerente y las suyas; dirección, todas | — | `reglas.js` → `puedeResolver` | D |
| RN-B16 | Un descuento mayor al 10 % genera una solicitud de autorización | 10 % | `acciones_cajero.js` | D |
| RN-B17 | Caja: lo esperado por forma de pago = fondo inicial (efectivo) + ventas del turno + movimientos con signo. El cierre exige justificar diferencias y firma | — | `reglas.js` → `esperadoTurno`; `acciones_cajero.js` | D |
| RN-B18 | Solo el cajero opera la caja; cancelar una venta no es directo: pasa por autorización | — | `acciones_cajero.js` | D |
| RN-B19 | Devolución de cliente: reingresa a inventario, reembolsa y exige autorización arriba de un límite | — | `acciones_cajero.js` | D |
| RN-B20 | Expediente clínico único para las 7 sucursales; el paciente puede pagar en cualquiera | — | `seed.js` (pacientes y créditos sin sucursal) | C |
| RN-B21 | Los podólogos rotan entre sucursales (una cuenta con varias sucursales) | — | `seed.js`, `acciones_admin.js` → `asignarSucursales` | C |
| RN-B22 | Inventario cíclico y general; los ajustes se autorizan | — | `src/store/acciones_almacen.js` | C |
| RN-B23 | Compra centralizada con almacén central que surte por traspaso | almacén `CEN` | `seed.js`, `acciones_admin.js` → `crearOC` | D (el requerimiento la marca confirmada; no figura en la lista de `CLAUDE.md`: ratificar) |
| RN-B24 | Cobros de caja y conteo de almacén funcionan sin señal: se aplican en el equipo y quedan en cola hasta sincronizar | — | `src/store/core.js` → `registrarOp`, `sincronizar` | D |
| RN-B25 | Comisión estimada del podólogo = ingreso atribuido × porcentaje fijo | 10 % | `src/store/acciones_podologo.js` → `COMISION_PCT`, `comisionEstimada` | D (PA-V5 abierta; ver V2-20) |
| RN-B26 | Orden de plantilla al laboratorio: anticipo del paciente y fecha prometida | 50 % · 14 días | `acciones_podologo.js` → `ANTICIPO_LAB_PCT`, `DIAS_PROMETIDA` | D |
| RN-B27 | Venta a plazos: enganche mínimo y parcialidades quincenales; crédito abierto a 30 días | 20 % · 15 días · 30 días | `acciones_cajero.js` → `ENGANCHE_MIN_PCT`, `INTERVALO_DIAS`, `DIAS_CREDITO_ABIERTO` | D (CR4 abierta) |
| RN-B28 | Agenda: citas de 09:00 a 18:00 en pasos de 30 minutos, sin empalme por paciente, podólogo ni consultorio. La jornada para ocupación es de 8 horas | 09:00–18:00 · 30 min · 8 h | `src/store/logica_recepcion.js`; `acciones_admin.js` → `MIN_JORNADA` | D (PA-A1 abierta) |
| RN-B29 | Una consulta cerrada no se edita: se agrega una adenda con autor y fecha. Solo el podólogo que la atiende la abre y la cierra | — | `acciones_podologo.js` | D (PA-C1 abierta) |

## 4. Multitienda y menú

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-T01 | Quien tiene más de una sucursal elige al entrar en cuál trabaja hoy y puede cambiarla desde el encabezado («Trabajando en: …») | — | `src/shell/Login.jsx`, `Shell.jsx`; `core.js` → `entrar`, `cambiarSucursal` | D |
| RN-T02 | Todo movimiento guarda el usuario y la sucursal de la sesión (venta, checada, gasto, movimiento de inventario, auditoría, pedido atendido). De ahí salen bonos e inventario | — | todas las acciones; `core.js` → `auditar` | D |
| RN-T03 | Una cuenta desactivada no puede entrar | — | `core.js` → `entrar` | D |
| RN-T04 | El rol sale de la cuenta, no de la puerta por la que se entra. Dirección usa el menú de administración | — | `src/config/roles.js` → `appDeRol` | D |
| RN-T05 | El menú cambia por rol: en teléfono, 4 pestañas y «Más»; en escritorio (1024 px o más), menú lateral por secciones | 1024 px | `roles.js` → `menuLateral`; `Shell.jsx` | D |
| RN-T06 | Toda lista de personas, productos o gastos se ofrece en dos vistas: mosaico y renglones | — | `src/ui/vista.jsx` | D |

## 5. Personas: checador, horarios, vacaciones, nómina

> Todo lo laboral y fiscal es **criterio de demostración, por validar con contador**. No es asesoría laboral ni fiscal.

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-P01 | Una entrada y una salida por persona y día, registradas en la sucursal activa. Sin sucursal activa o sin ficha de empleado activa no se checa | — | `src/store/acciones_personas.js` → `registrarEntradaD`, `registrarSalidaD` | D |
| RN-P02 | Retardo: la entrada supera el horario de la persona más la tolerancia | 10 min (configurable 0–60) | `src/store/reglas_personas.js` → `clasificarEntrada`, `DEFAULTS_RH` | D |
| RN-P03 | No se registra entrada en un día con vacaciones o incapacidad aprobadas; con permiso sí | — | `registrarEntradaD` | D |
| RN-P04 | La salida exige entrada previa y no puede ser anterior a ella | — | `registrarSalidaD` | D |
| RN-P05 | Checar en una sucursal distinta a la programada se permite y se marca «fuera de asignación» | — | `registrarEntradaD` | D |
| RN-P06 | Dónde trabaja alguien un día: excepción por fecha, si no la programación semanal, si no su sucursal base. Sin sucursal = descanso | — | `reglas_personas.js` → `sucursalHoy` | D |
| RN-P07 | Programa a una persona su gestor, y solo en sucursales que esa persona tiene autorizadas | — | `asignarSucursalD` | D |
| RN-P08 | Las faltas **no son automáticas**: el gestor las marca para días pasados sin registro | — | `marcarFaltasDiaD` | D |
| RN-P09 | Días de vacaciones por antigüedad según la tabla de la Ley Federal del Trabajo (art. 76); prima vacacional del 25 % | 12, 14, 16, 18, 20; 22 de 6 a 10 años; +2 cada 5 | `reglas_personas.js` → `diasVacacionesLFT`, `PRIMA_VACACIONAL` | D (por validar) |
| RN-P10 | Saldo = derecho del año de servicio − días aprobados desde el último aniversario. Sin un año cumplido no hay vacaciones. No acumula años anteriores | — | `saldoVacaciones` | D |
| RN-P11 | Solicitud de vacaciones: de hoy en adelante (el gestor puede capturar pasadas), cuenta solo días laborables de la persona, no se empalma con otra y no excede lo disponible | — | `solicitarVacacionesD` | D |
| RN-P12 | Nadie aprueba lo propio (vacaciones o incidencias). Rechazar vacaciones exige motivo | — | `resolverVacacionesD`, `resolverIncidenciaD` | D |
| RN-P13 | El empleado solo puede **solicitar** permiso o avisar incapacidad; el gestor registra cualquier incidencia. Permiso, incapacidad y falta justificada aprobados no cuentan como falta | 6 tipos | `registrarIncidenciaD`, `ausenciaDe` | D |
| RN-P14 | Prenómina: salario diario = sueldo mensual ÷ 30; quincena = 15 días, mes = 30; se prorratea por ingreso o baja dentro del periodo | 30 | `calcularNomina`, `rangoPeriodo` | D (por validar) |
| RN-P15 | Descuentos: cada falta, un día; cada 3 retardos, un día | 3 (configurable 1–10) | `calcularNomina` | D (por validar) |
| RN-P16 | La prenómina no calcula ISR ni IMSS ni sustituye el timbrado | — | `reglas_personas.js` (encabezado) | D |
| RN-P17 | La nómina de una sucursal es la de quienes la tienen como base. Un recibo firmado ya no se recalcula | — | `nominaSucursal`, `generarReciboD` | D |
| RN-P18 | Edición de la ficha: la persona cambia su foto, teléfono, domicilio y contacto de emergencia; el gestor, contacto y horario; solo administración o dirección, sueldo, puesto, sucursales y contrato | — | `actualizarEmpleadoD` | D |
| RN-P19 | Alta, baja y reingreso solo por administración o dirección. La baja exige motivo, desactiva la cuenta, cancela vacaciones solicitadas y calcula el finiquito estimado. Nadie se da de baja a sí mismo | — | `altaEmpleadoD`, `bajaEmpleadoD` | D |
| RN-P20 | Finiquito estimado = vacaciones proporcionales + prima 25 % + aguinaldo proporcional. No incluye sueldo pendiente, ISR ni indemnización | 15 días de aguinaldo | `calcularFiniquito` | D (por validar) |
| RN-P21 | El reingreso reinicia la antigüedad (se guarda la fecha original) y abre contrato a prueba | 30 días | `reingresoEmpleadoD` | D |
| RN-P22 | Alta, baja, reingreso y cambio de sueldo dejan un aviso al IMSS «pendiente de envío»; el sistema no lo envía | — | `movimiento` (interna) | D |
| RN-P23 | Expediente: 7 documentos para todos y cédula profesional para el podólogo; el avance es entregados ÷ requeridos | 8 documentos | `DOCS_EXPEDIENTE`, `avanceExpediente` | D |
| RN-P24 | Un alta nueva nace con contrato a prueba y horario de 09:00 a 18:00 si no se indica otro | 30 días | `altaEmpleadoD` | D |

## 6. Capacitación y acervo

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-K01 | Un curso está completo cuando se vieron todas las lecciones y, si tiene evaluación, se aprobó. Al completarlo se emite una constancia con folio | serie CT | `progresoCurso`; `cerrarSiCompleto` | D |
| RN-K02 | La evaluación tiene de 3 a 5 preguntas, se presenta solo tras ver todas las lecciones y se puede repetir sin límite | mínimo aprobatorio 50–100 | `guardarCursoD`, `evaluarCursoD`, `calificarEvaluacion` | D |
| RN-K03 | Un curso le toca a alguien por su rol (obligatorio), por asignación personal o por ser personal nuevo | nuevo = 60 días o menos | `aplicaCurso`, `esPersonalNuevo` | D |
| RN-K04 | Los videos no se suben: se guarda el enlace de YouTube, se valida y se reproduce incrustado. Un enlace inválido se rechaza | id de 11 caracteres | `extraerIdYoutube`, `urlEmbedYoutube` | D (pedida así en E1) |
| RN-K05 | Cursos y acervo los gestionan gerente, administración y dirección. El gerente solo dirige material a su sucursal | — | `guardarCursoD`, `guardarAcervoD` | D |
| RN-K06 | El acervo se ve según rol y sucursal; lo archivado solo lo ven los gestores; cada edición sube la versión y registra quién revisó | 1.0 → 1.1 | `acervoVisible`, `guardarAcervoD` | D |

## 7. Finanzas: gastos, compras y estado de resultados

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-F01 | La unidad de costo es la sucursal, con su personal base | — | `src/store/dominios/finanzas.js` | D (pedida así en E1) |
| RN-F02 | Estructura: ingresos (servicios, plantillas, productos) − gastos variables (producto y laboratorio; comisiones y bonos) = utilidad bruta − gastos de operación (sueldos + categorías) = utilidad operativa. Porcentajes sobre ingresos | — | `finanzas.js` → `armarEdr` | D |
| RN-F03 | El consolidado de la cadena es la suma exacta de las 7 sucursales, fila por fila | — | `sumarCrudos`; `acciones_finanzas.js` → `estadoResultados` | D |
| RN-F04 | Los meses cerrados salen del histórico mensual; el mes en curso, de los tickets (se rotula «parcial») | — | `ingresosDeMes` | D |
| RN-F05 | Ingreso del mes en curso = partidas de tickets no cancelados, reducidas por el descuento del ticket. No resta devoluciones ni separa IVA | — | `ingresosDeMes` | D |
| RN-F06 | Costo variable = costo PEPS guardado en la partida (si falta, el de catálogo) + costo de laboratorio de las órdenes enviadas en el mes | — | `ingresosDeMes` | D |
| RN-F07 | Comisiones y bonos se estiman como un porcentaje fijo de los ingresos (no se toma el bono real) | 2 % | `COMISION_ESTIMADA_PCT` | D |
| RN-F08 | Sueldos = sueldo mensual bruto de los empleados activos con esa sucursal base; excluye dirección y administración; en el mes en curso se devenga a la fecha | día ÷ días del mes | `nominaDeSucursal`, `crudoSucursal` | D |
| RN-F09 | Categorías de gasto: renta, luz, agua, internet y teléfono, limpieza (fijas y recurrentes); mantenimiento, publicidad, papelería y otros | 9 | `CATEGORIAS_BASE` | D |
| RN-F10 | El estado de resultados lo ven administración y dirección (todo) y el gerente (solo su sucursal); nadie más | — | `sinPermisoEdr` | D |
| RN-F11 | Capturan gastos el gerente (su sucursal), administración y dirección. Monto mayor que cero, fecha no futura, categoría y concepto obligatorios | — | `registrarGasto` | D |
| RN-F12 | Eliminar un gasto: solo administración o dirección, con motivo. Se borra de la lista y queda en bitácora | — | `eliminarGasto` | D |
| RN-F13 | Los recurrentes se generan a mano con «generar los del mes»; hacerlo dos veces no duplica; no se generan meses futuros; la fecha nunca es posterior a hoy | día 1 a 28 | `guardarRecurrente`, `generarRecurrentes` | D |
| RN-F14 | Gasto fuera de patrón: el total del mes en esa sucursal y categoría supera lo normal | 1.6 × mediana y al menos $1,000 más; 5 meses de historia | `gastosFueraDePatron` | D |
| RN-F15 | La lectura de la nota de compra por IA es una **captura previa**: nada se registra sin que una persona la revise y confirme | `confirmado: true` | `confirmarNotaCompra` | D (pedida así en E1) |
| RN-F16 | Confirmar una nota crea la nota, su cuenta por pagar (vence = fecha + días de crédito del proveedor) y, si se pide, la entrada al inventario por capas y un gasto asociado | días por proveedor | `confirmarNotaCompra` | D |
| RN-F17 | Una nota con el mismo proveedor y el mismo folio se rechaza por duplicada, salvo confirmación expresa, que queda marcada | — | `detectarDuplicado` | D |
| RN-F18 | Capturan notas el almacén (solo a su almacén y con gasto a su sucursal), administración y dirección. Cantidades enteras, costos mayores que cero, sin producto repetido | — | `validarNota` | D |

## 8. Desempeño: bonos y metas

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-N01 | La venta se atribuye al vendedor del ticket; si no hay, a quien cobró. El cobro de una consulta se atribuye al podólogo | — | `src/store/desempeno_motor.js` → `vendedorDe`; `acciones_cajero.js` | D |
| RN-N02 | Cuenta la sucursal donde se hizo la venta, no la sucursal base del colaborador | — | `filasAtribucion` | D |
| RN-N03 | No cuentan los tickets cancelados; las devoluciones vigentes se restan de su venta original | — | `devueltoPorVenta`, `detalleVenta` | D |
| RN-N04 | Los esquemas son mensuales o trimestrales; el trimestre es calendario | — | `periodoDe` | D |
| RN-N05 | Bases de cálculo: ventas netas, ventas de producto, plantillas + calzado, y cumplimiento de meta (esta solo en esquemas de sucursal) | 4 | `BASES`; `acciones_desempeno.js` → `validarEsquema` | D |
| RN-N06 | Aplica el escalón más alto alcanzado, sobre **toda** la base (no por tramos); el escalón es porcentaje o monto fijo; el tope es opcional | — | `escalonPara`, `valorBono` | D |
| RN-N07 | Condiciones opcionales: asistencia mínima y calificación mínima de clientes. Si no hay dato suficiente se da por cumplida. Si no se cumple, el bono es $0 | menos de 3 encuestas = sin dato | `condicionesDe`, `asistenciaPct`, `calificacionPersona` | D |
| RN-N08 | Bono de sucursal: una bolsa que se reparte en proporción a los días trabajados en esa sucursal entre los roles elegibles que cumplen condiciones; el centavo sobrante va a quien más días trabajó | — | `evaluarSucursal` | D |
| RN-N09 | Día trabajado = día con venta, cita atendida, turno de caja, ciclo de esterilización o asistencia en esa sucursal | — | `diasTrabajados` | D |
| RN-N10 | Roles que pueden recibir bono: podólogo, cajero, recepción, asistente, almacén y gerente | 6 | `ROLES_ELEGIBLES` | D |
| RN-N11 | Flujo: calculado → aprobado → pagado. Solo administración o dirección; solo periodos terminados y montos mayores que cero. Aprobar **congela** el monto y el reparto | — | `aprobarBono`, `pagarBono`, `procesarPeriodo` | D |
| RN-N12 | Esquemas de la demostración (inventados, marcados «por validar»): podólogos mensual 1.5 / 2.5 / 3.5 % desde $40,000 / $70,000 / $100,000, tope $4,500; mostrador mensual por producto 1.5 / 2.5 / 3.5 % desde $10,000 / $20,000 / $30,000, tope $3,000; sucursal mensual $1,500 / $3,000 / $5,000 al 95 / 100 / 110 % de la meta; sucursal trimestral 0.5 / 0.8 / 1.2 % de la venta al 100 / 105 / 115 %, tope $15,000. Asistencia mínima 85–90 %; calificación mínima 4 para podólogos | ver texto | `src/store/dominios/desempeno.js` → `esquemasDemo` | D |
| RN-N13 | La meta la fija administración o dirección; el gerente **propone** la de su sucursal para el mes en curso o siguientes. No se cambia una meta con bono ya aprobado | $1,000 a $5,000,000 | `fijarMeta`, `proponerMeta`, `resolverPropuestaMeta` | D |
| RN-N14 | Meta sugerida = promedio de los 3 últimos meses cerrados × tendencia × estacionalidad amortiguada, dentro de límites y redondeada al millar. Requiere 3 meses de historia | tendencia ±3 % mensual · estacionalidad 0.97–1.04 · límites 85–125 % | `sugerirMeta` | D |
| RN-N15 | Cumplimiento = venta neta ÷ meta. En el mes en curso se proyecta el cierre en línea recta | — | `cumplimientoSucursal` | D |
| RN-N16 | Cada persona ve sus bonos y su lugar entre compañeros del mismo rol, sin importes ajenos | — | `acciones_desempeno.js` → `posicionEnSucursal` | D |

## 9. Evaluación por parte de los clientes

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-E01 | Una encuesta por cita atendida, con tres calificaciones enteras (servicio, podólogo, sucursal) y un comentario | 1 a 5 · 500 caracteres | `acciones_desempeno.js` → `encuestaAlCerrarCita`, `responderEncuesta` | D |
| RN-E02 | Una calificación de 2 o menos abre un seguimiento: por atender → contactado → resuelto, con nota | ≤ 2 · nota de 5 caracteres o más | `esBaja`, `seguimientoEval` | D |
| RN-E03 | Ven evaluaciones: administración y dirección todas; gerente y recepción las de su sucursal; el podólogo solo las suyas. El podólogo no da seguimiento | — | `evaluacionesVisibles` | D |
| RN-E04 | El envío por WhatsApp o correo es simulado y la respuesta la captura el personal; en producción responde el paciente desde un enlace | — | `enviarEncuesta`, `enviarPorCanal` | D |
| RN-E05 | Índice de recomendación = (calificación general de 4.5 o más − de 3 o menos) ÷ respondidas | 4.5 y 3 | `estadisticasEval` | D |

## 10. Tienda en línea y pedidos

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-W01 | La tienda es pública, sin cuenta, y solo muestra productos de venta (no insumos ni servicios) | — | `src/pantallas/publico/tienda.jsx`; `acciones_comercial.js` → `catalogoTienda` | D |
| RN-W02 | El precio en línea es el de la sucursal de recolección | — | `precioTienda` | D |
| RN-W03 | Disponible en línea = disponible del almacén − piezas en pedidos activos. El pedido reserva sin tocar la existencia física | — | `disponibleWeb`, `reservadoWeb` | D |
| RN-W04 | El pedido exige nombre, teléfono de 10 dígitos y correo. Si algún producto no alcanza, se rechaza completo | 1 a 20 piezas por producto | `crearPedidoWeb` | D |
| RN-W05 | Envío a domicilio con costo fijo, marcado «por validar»; puede haber envío gratis desde un monto | $99 · gratis: nunca | `CFG_DEFECTO`, `costoEnvio` | D |
| RN-W06 | Pago en línea **simulado** (referencia SIM-…) o pago al recoger | — | `crearPedidoWeb` | D |
| RN-W07 | Estados: nuevo → preparando → listo → entregado. Se cancela antes de entregar, con motivo; libera las piezas y, si estaba pagado, queda «por reembolsar» | — | `avanzarPedido`, `cancelarPedido` | D |
| RN-W08 | Entrega: todo o nada, con la sucursal activa igual a la del pedido. Crea la venta y descuenta por PEPS. El pago pendiente lo cobra un cajero con turno abierto; el pago en línea no pasa por el cajón | — | `entregarPedido` | D |
| RN-W09 | La venta de un pedido en línea se atribuye a quien lo entrega | — | `entregarPedido` | D |
| RN-W10 | El cliente consulta su pedido con folio + teléfono y no ve notas internas | — | `buscarPedidoWeb` | D |
| RN-W11 | Atienden pedidos: cajero, almacén y gerente (su sucursal), administración y dirección | — | `ROLES_PEDIDOS` | D |

## 11. Auditoría de inventario a distancia

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-A01 | Auditan: almacén de sucursal, gerente, administración y dirección. El almacén central no | — | `acciones_comercial.js` → `ctxAud`, `ROLES_AUDITORIA` | D |
| RN-A02 | Cada auditoría lleva al menos una foto, el origen (colaborador o cámara, con su identificador) y al menos un producto | hasta 3 fotos | `registrarAuditoria` | D |
| RN-A03 | La cifra la estima el servicio de visión (**simulado**); una persona puede corregirla y queda marcado | — | `estimarConteoConIA` | D |
| RN-A04 | Hay diferencia cuando estimado y sistema difieren más que la tolerancia | 10 %, mínimo 1 pieza | `compararItem`, `toleranciaPiezas` | D |
| RN-A05 | Toda diferencia deja alerta en bitácora y se atiende con un **ajuste** (pasa por autorización según el monto) o con una **investigación** | — | `resolverDiferencia` | D |
| RN-A06 | La investigación la cierra solo gerente, administración o dirección, con conclusión | — | `cerrarInvestigacion` | D |
| RN-A07 | Una sucursal está vencida si pasan más días de los permitidos sin auditoría | 7 días | `cumplimientoAuditoria` | D |
| RN-A08 | Se conserva un máximo de fotos; se descartan las más viejas (límite de la demostración) | 40 | `podarFotos` | D |
| RN-A09 | La estimación no sustituye el conteo físico periódico | — | `AVISO_VISION` | D |

## 12. Asistente inteligente

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-I01 | Lo usan gerente (solo su sucursal), administración y dirección | — | `src/store/acciones_comercial_asistente.js` → `ROLES_ASISTENTE` | D |
| RN-I02 | Nunca inventa cifras: si falta el dato o no entiende, lo dice. Cada respuesta explica cómo se calculó | 15 métricas | `METRICAS`, `responderAsistente` | D |
| RN-I03 | Las acciones se **proponen**; solo se ejecutan con confirmación del mismo usuario, una sola vez, revalidando permiso, y quedan en bitácora | traspaso · recordatorio de pago | `ejecutarAccionAsistente` | D |
| RN-I04 | Recordatorio de pago: uno por plan y por día; queda como seguimiento, no se envía | — | `ejecutarAccionAsistente` | D |
| RN-I05 | Responde un motor de reglas determinista; el modelo de lenguaje no está conectado | — | `responderConModelo` (devuelve nulo) | D |

## 13. Comunicación

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-C01 | Solo los miembros de una conversación la leen o escriben en ella | — | `src/store/acciones_comunicacion.js` → `puedeLeerHilo` | D |
| RN-C02 | Conversación directa: cualquiera. Grupo, canal por rol y canal de toda la empresa: administración o dirección. Canal de sucursal: su gerente o administración | grupo de 3 personas o más | `crearHilo` | D |
| RN-C03 | Un mensaje lleva texto o una imagen | 2,000 caracteres | `enviarMensaje` | D |
| RN-C04 | Correo interno a grupos: solo administración, dirección y gerente (este, a su sucursal); a toda la empresa, solo administración o dirección | — | `expandirDestinatarios`, `enviarCorreo` | D |
| RN-C05 | El correo no sale a buzones externos | — | `enviarCorreoExterno` | D |
| RN-C06 | Feed: avisos oficiales y fijar publicaciones, solo administración, dirección y gerente; los demás tipos, cualquiera. Alcance: toda la empresa o la propia sucursal | 5 tipos | `publicarFeed` | D |
| RN-C07 | Cada quien edita y borra lo suyo; moderan administración y dirección (todo) y el gerente (su sucursal o su gente). Una reacción por emoji y persona | comentario de 600 caracteres | `puedeModerar`, `reaccionar`, `comentarPublicacion` | D |

## 14. Plataforma y data warehouse (en construcción)

| Id | Regla | Parámetro | Dónde vive | Estado |
|---|---|---|---|---|
| RN-X01 | En el data warehouse el paciente va anonimizado (llave derivada, sin nombre, teléfono, correo, domicilio ni fecha exacta de nacimiento) y las consultas no llevan texto clínico | — | `src/store/plataforma_dw.js` → `claveAnonima`, `dw_dim_paciente`, `dw_fact_consultas` | D |
| RN-X02 | Cada carga se cuadra contra la operación en 10 totales calculados por un camino independiente; cuadra si la diferencia es menor a medio centavo | $0.005 | `totalesDW`, `totalesOperativos`, `compararTotales` | D |
| RN-X03 | En el data warehouse la devolución se resta el día en que ocurre | — | `dw_fact_devoluciones` | D (contradice RN-N03) |
| RN-X04 | El «resultado» del data warehouse es margen bruto menos gastos, sin nómina ni comisiones | — | `DW_METRICAS` | D (no coincide con RN-F02) |
| RN-X05 | Configuración de la demostración: IVA 16 %, precios con IVA incluido, moneda MXN, zona horaria de la Ciudad de México. Razón social y RFC ficticios | — | `src/store/dominios/plataforma.js` (semilla) | D |
| RN-X06 | Ocho integraciones declaradas con su estado (simulada o pendiente de llave): correo saliente, WhatsApp, pasarela de pago, terminal bancaria, modelo de lenguaje, visión, PAC y base de datos | 8 | `INTEGRACIONES_BASE` | D |
| RN-X07 | Una integración no puede marcarse como activa mientras no exista la llave del servicio: solo admite «simulada», «pendiente de llave» o «desactivada» | 3 estados | `src/store/acciones_plataforma.js` → `guardarIntegracion` | D |
| RN-X08 | Catálogos (sucursales, servicios, productos, categorías, formas de pago, motivos, laboratorios): los edita solo administración o dirección; el gerente consulta. El precio de lista de un producto de venta debe ser mayor a su costo; no se cambia el tipo de un producto con existencias; siempre queda al menos una sucursal activa | servicio de 10 a 240 min en múltiplos de 5 | `acciones_plataforma.js` → `guardarProducto`, `guardarServicio`, `activarSucursal` | D |
| RN-X09 | Documentos de la clínica: los suben gerencia (los de su sucursal) y administración; visibilidad «todo el personal», «gerencia» o «solo administración»; alertas de vencimiento; renovar crea versión nueva; archivar exige motivo | alertas a 30, 60 y 90 días | `acciones_plataforma.js` → `puedeVerDocumento`, `renovarDocumento`, `estadoVigencia` | D |
| RN-X10 | Tablero del data warehouse: administración y dirección ven todo; el gerente, solo su sucursal; nadie más | — | `acciones_plataforma.js` → `alcanceDW`, `tableroDW` | D |
| RN-X11 | La consulta a base de datos es de solo lectura, solo para administración y dirección, y omite campos sensibles (contraseñas, tokens, secretos). La carga del data warehouse la ejecuta solo administración | — | `acciones_plataforma.js` → `consultarBD`, `CAMPOS_EXCLUIDOS` | D |

`acciones_plataforma.js` y `tests/plataforma.test.js` aparecieron durante la redacción de este documento (≈ 1,200 líneas de acciones; sin pantallas todavía). RN-X07 a RN-X11 se tomaron de una lectura parcial: **revisarlas cuando el dominio se dé por terminado**.

---

## 15. Cálculos y redondeos

| Id | Regla | Dónde vive | Estado |
|---|---|---|---|
| RN-Z01 | Todo importe se redondea a centavos, al más cercano (`Math.round(n × 100) ÷ 100`) | `src/lib/format.js` → `redondear` | D (PA-V1 abierta) |
| RN-Z02 | Metas y metas sugeridas en pesos enteros; la sugerida, al millar | `fijarMeta`, `sugerirMeta` | D |
| RN-Z03 | IVA: la operación no lo desglosa. La configuración dice 16 % con precios que ya lo incluyen, pero ningún cálculo lo usa todavía | `dominios/plataforma.js` | D (PA-V8 abierta) |

No hay otros impuestos, comisiones bancarias ni tipos de cambio de moneda en el código.

## 16. Tiempo

| Id | Regla | Dónde vive | Estado |
|---|---|---|---|
| RN-Z04 | Fecha y hora son las **del equipo del usuario**, guardadas como texto local sin zona horaria. Dos equipos en zonas distintas no coincidirían | `format.js` → `hoy`, `ahoraLocal` | D (PA-T1 abierta) |
| RN-Z05 | El día operativo es el día natural (00:00 a 23:59). No hay corte por turno para asistencia, bonos ni estado de resultados; la caja corta por turno | — | D |
| RN-Z06 | Mes y trimestre son calendario. El mes en curso siempre es parcial a hoy | `desempeno_motor.js`, `finanzas.js` | D |

- Zona horaria prevista: `America/Mexico_City` (está en `netlify.toml` para la construcción y en la configuración de la demostración; **no** se aplica a los datos).

## 17. Casos borde implementados

| Situación | Qué pasa hoy | Regla |
|---|---|---|
| La persona checa en una sucursal que no le tocaba | Se acepta y se marca fuera de asignación | RN-P05 |
| Se marcó falta y la persona sí llegó | Al checar, la falta se convierte en asistencia | RN-P01 |
| Olvidó checar la salida | Queda «dentro» ese día; no hay corrección de marcas | sin regla (V2-6) |
| Gerente pide sus propias vacaciones | Las aprueba otra persona; nunca él | RN-P12 |
| Vacaciones que incluyen días de descanso | Solo cuentan los días laborables de esa persona | RN-P11 |
| Baja con vacaciones solicitadas | Se cancelan las solicitadas | RN-P19 |
| Venta hecha por un colaborador en otra sucursal | Cuenta para la sucursal de la venta | RN-N02 |
| Devolución de una venta ya contada para bono | Se resta mientras el bono no esté aprobado; aprobado, ya no cambia | RN-N03, RN-N11 |
| Persona sin datos de asistencia o con menos de 3 encuestas | La condición del bono se da por cumplida | RN-N07 |
| Alguien no cumple la condición en un bono de sucursal | Queda fuera y su parte se reparte entre los demás | RN-N08 |
| Sucursal sin meta en el mes | No se evalúa cumplimiento ni hay bolsa | RN-N08 |
| Cambiar la meta con bono ya aprobado | Se rechaza | RN-N13 |
| Sucursal con menos de 3 meses de historia | El sistema no sugiere meta | RN-N14 |
| «Generar los del mes» dos veces | No duplica | RN-F13 |
| Misma nota del proveedor capturada dos veces | Se rechaza salvo confirmación expresa | RN-F17 |
| El total leído por la IA no cuadra con la suma de partidas | Se muestra con baja confianza; el total registrado es la suma de partidas | RN-F15 |
| Pedido en línea cuando otro pedido ya tomó las últimas piezas | Se rechaza completo | RN-W03, RN-W04 |
| Se va a entregar un pedido y ya no hay existencia física | No se entrega nada y el pedido sigue «listo» | RN-W08 |
| Pedido pagado en línea que se cancela | Queda «por reembolsar»; el reembolso es manual | RN-W07 |
| Estimación con sistema en cero | La simulación no devuelve negativos | RN-A03 |
| Pregunta que el asistente no entiende | Lo dice y ofrece alternativas | RN-I02 |
| Gerente pregunta por otra sucursal o pide comparar | Se niega y se explica | RN-I01 |
| Recordar pago dos veces el mismo día | No duplica | RN-I04 |

## 18. Autoridad

| Acción | Quién | ¿Bitácora? |
|---|---|---|
| Cambiar precio base o ajuste de sucursal | Administración central | Sí, con motivo e historial |
| Autorizar crédito, descuento, cancelación, ajuste de inventario | Gerente, administración o dirección según nivel | Sí |
| Marcar faltas, aprobar vacaciones e incidencias, programar horarios | Gestor de la persona (nunca lo propio) | Sí |
| Cambiar sueldo, puesto o sucursales; alta, baja, reingreso | Administración o dirección | Sí, y movimiento de personal |
| Cambiar parámetros de RH | Administración o dirección | Sí |
| Generar y firmar recibos de nómina | Gestor de la sucursal | Sí |
| Capturar un gasto | Gerente (su sucursal), administración, dirección | Sí |
| Eliminar un gasto | Administración o dirección, con motivo | Sí |
| Confirmar una nota de compra | Almacén, administración, dirección | Sí |
| Crear o editar esquemas de bono; fijar metas | Administración o dirección | Sí |
| Proponer meta | Gerente de la sucursal | Sí |
| Aprobar y pagar bonos | Administración o dirección | Sí |
| Dar seguimiento a una calificación baja | Recepción y gerente de la sucursal, administración, dirección | Sí |
| Cancelar un pedido en línea | Cajero, almacén, gerente, administración, dirección, con motivo | Sí |
| Cerrar una investigación de inventario | Gerente, administración, dirección | Sí |
| Ejecutar una acción propuesta por el asistente | El mismo usuario que la pidió | Sí |
| Publicar avisos, fijar, moderar | Administración, dirección, gerente (su ámbito) | Sí en moderación |
| Reimprimir, reabrir cortes, corregir notas clínicas | Sin cambio respecto al sistema original (PA-G1, CJ6 abiertas) | — |

Toda acción sensible llama a `auditar()` con usuario, sucursal, fecha, acción, entidad y detalle (`src/store/core.js`).

## 19. Historia (cuando una regla cambia)

**Respuesta hoy, por lo que hace el código:**

| Id | Qué pasa al cambiar la regla | Estado |
|---|---|---|
| RN-H01 | **Se congela:** el precio de una venta, apartado o pedido ya creado (guarda su precio); el bono aprobado (monto y reparto); el recibo de nómina firmado | D |
| RN-H02 | **Se recalcula con el valor nuevo:** la mora de créditos ya otorgados (usa el parámetro vigente de la sucursal, no el del día en que se otorgó); la prenómina no firmada; los bonos aún «calculados»; el estado de resultados del mes en curso | D — **contradice el supuesto de PA-T4** («se congela al crear»). Decidir en E3 |
| RN-H03 | Cambiar un esquema de bono afecta a todos los periodos no aprobados, incluso los ya terminados | D |
| RN-H04 | Cambiar el sueldo de alguien cambia el costo de nómina de **todos** los meses del estado de resultados que se calculan en vivo; los meses cerrados de la demostración no guardan la nómina de entonces | D — riesgo para producción |

## 20. Concurrencia

| Id | Regla | Estado |
|---|---|---|
| RN-H05 | La demostración es de **un solo navegador**: no hay dos usuarios a la vez sobre los mismos datos. Cada cambio reemplaza el estado completo; gana el último que escribe. No hay bloqueo ni aviso | D — sin resolver para producción (PA-T2, V2-89) |

## 21. Retención

| Id | Regla | Parámetro | Estado |
|---|---|---|---|
| RN-H06 | Límites **de la demostración**, no políticas del cliente: la bitácora guarda las últimas 500 entradas; las fotos de auditoría, 40 en total; todo el estado cabe en el almacenamiento del navegador (≈ 2.2 MB de unos 5 MB) | 500 · 40 | D — la retención real está sin definir (PA-T3, V2-88) |
| RN-H07 | Nada se borra físicamente salvo: gasto eliminado, solicitud de vacaciones cancelada, borrador de correo descartado, publicación o comentario eliminado | — | D |

El expediente clínico se conserva al menos 5 años (requerimiento original, NOM-004): C.

---

## Contradicciones internas detectadas (no resueltas en silencio)

1. **Devoluciones:** RN-N03 las resta de la venta original; RN-X03, el día en que ocurren; RN-F05 no las resta.
2. **Utilidad:** RN-F02 incluye nómina y comisiones estimadas; RN-X04 no.
3. **Historia de la mora:** RN-H02 recalcula con el parámetro vigente; PA-T4 suponía congelar.
4. **Comisión estimada contra bono real:** RN-F07 usa 2 % fijo aunque exista el libro de bonos (RN-N11).
5. **Precios de la demostración contra el ticket del cliente:** quiropodia $450 en la semilla contra $800; plantillas $450–$780 contra $2,500 (V2-41).
6. **«Tipo de cambio de precio»:** pedido en E1, ausente en el dato (RN-B02, V2-38).
7. **Sedes, identidad y roles:** 7 sucursales, «Pie Clinic» y 8 roles aquí; 5 sedes, «Pie Firme» y 3 roles en el sistema hermano con el que se compartirá esquema (V2-80 a V2-83).

## Lo que NO se puede inventar

Esquemas de bono, políticas de retardos y faltas, reparto de gastos del corporativo, márgenes por servicio, lista de precios, proveedores de servicios externos, nombres y domicilios de las sucursales, y cualquier dato fiscal. Todo eso es del cliente y hoy es de ejemplo.

## Cambios a estas reglas

| Fecha | Qué cambió | Quién autorizó |
|---|---|---|
| 2026-11-21 | Primera versión. Reglas leídas del código de la demostración (sistema original + ampliación V2). Sin firma del cliente | Roberto (RANNIX) pidió el documento; **el cliente no ha autorizado nada** |
