# Índice de escenarios de CAJA / TICKETS (Pie Clinic · Pie Firme)

Generado por **qa-arquitecto** (docs/METODOLOGIA_QA.md §4 Fase 1, §5, §13). 71 escenarios en `tests/escenarios/ESC-CAJA-NN_<slug>.yaml`, 253 pasos, 230 con verificación en BD.
Los ESC-CAJA-01 a 10 son los del legado (`CAJA_escenarios.md`, no se editó): conservan en `legado_fila` la descripción, el esperado y la verificación sin alterar, con `version: 1`.
Los marcados **primero** son los de «QUÉ NO PUEDE FALLAR» (REQUERIMIENTO.md) y se ejecutan antes que el resto.

## Notas de formato y de alcance

- Plantilla de la fábrica: se buscó `fabrica-rannix` bajo C:\Users\asus\OneDrive (y C:\Users\asus) y **no se encontró**; se siguió el formato de docs/METODOLOGIA_QA.md §5 exacto. Campos añadidos (no rompen §5): `prioridad`, `rol`, `reglas`, `ejecutar_primero`, `legado_fila`, `ambiguo` (escenario) y `ambiguo` en el paso. Los ids usan `ESC-CAJA-NN` (no `ESC-NNN`) para respetar los del legado.
- REGLAS_NEGOCIO.md **no trae una tabla de «Casos borde»**; los casos borde de caja salen de la lista pedida (cantidades, redondeos, tolerancias, permisos) y de las reglas P-055 a P-065, P-133.
- El esperado de cada paso cita su regla en `reglas`/`fuente`. Las consultas `verificar_bd` usan solo nombres de tablas y columnas del esquema (migraciones 025, 026, 027, 040, 052, 073, 077). El esperado en BD es el del negocio, no lo que haga el código.
- Los tickets de prueba se rastrean con el prefijo `QA-{corrida}-ESC-CAJA-NN` en la nota del ticket (o `nombre_turno` del turno); si la UI no tiene campo de nota, el tester liga por folio (ver A33).
- Correcciones al legado detectadas (sin editarlo): ESC-CAJA-05 cita `ventas.vendedor_id` (no existe; hay `cajero_id` y `firmas_cobro`); ESC-CAJA-06 cita `autorizaciones` (la tabla es `autorizaciones_admin`). Ver A03.
- Supuestos que dependen de datos aún no sembrados (precondiciones, no código): catálogo QA con precios conocidos (CREMA-A 116.00, QUIROPODIA 400.00, etc.), gift cards, anticipos, segunda clínica y usuarios por sede (A34), turnos base de ESC-CAJA-51..54.

## Tabla de escenarios

| id | nombre | rol | prioridad | regla fuente | pasos | exigen BD |
|---|---|---|---|---|---|---|
| ESC-CAJA-01 | Entrar a Caja con turno abierto | recepcion | alta | P-058, P-129 | 2 | 1 |
| ESC-CAJA-02 | Venta de mostrador sin paciente: 1 producto del catálogo, efectivo | recepcion | alta | P-056, P-057, P-079, P-129, P-133 | 4 | 4 |
| ESC-CAJA-03 | Venta con servicio de precio fijo (Quiropodia) y pago con tarjeta | recepcion | alta | P-056, P-067 | 4 | 4 |
| ESC-CAJA-04 | Servicio con características (Plantilla ortopédica especial: molde de yeso + mayor altura 3 mm) | recepcion | alta | P-056, P-067, P-087 | 4 | 3 |
| ESC-CAJA-05 | Cobro con PIN personal | recepcion | media | P-078 | 3 | 2 |
| ESC-CAJA-06 | Descuento y devolución | recepcion | alta | P-055, P-065 | 4 | 3 |
| ESC-CAJA-07 | Ticket completo (logo, datos de la sucursal, QR) y solicitud de factura | recepcion | alta | P-061, P-064, P-133 | 2 | 2 |
| ESC-CAJA-08 | Cierre del turno con efectivo contado | recepcion | alta | P-058, P-059 | 3 | 1 |
| ESC-CAJA-09 | Podólogo entra a Caja | podologo | alta | P-130, P-078 | 2 | 1 |
| ESC-CAJA-10 | Supervisor ve ventas y cortes de su sucursal | supervisor | alta | P-130, P-129 | 2 | 1 |
| ESC-CAJA-11 **primero** | Una clínica no ve ventas, turnos ni cortes de otra clínica | administrador_otra_clinica | alta | P-128 | 3 | 3 |
| ESC-CAJA-12 **primero** | Sin sesión no se accede a Caja ni a tickets | anonimo | alta | P-119, P-128 | 3 | 1 |
| ESC-CAJA-13 | Camino feliz: producto con IVA incluido, efectivo con cambio | recepcion | alta | P-056, P-057, P-079, P-133 | 3 | 3 |
| ESC-CAJA-14 | Camino feliz: servicio de precio fijo exento de IVA y cobro sin ticket | recepcion | alta | P-056, P-067, P-133 | 4 | 4 |
| ESC-CAJA-15 | Características: el precio se recalcula al agregar o quitar y la descripción queda congelada | recepcion | media | P-067, P-068, P-057 | 4 | 4 |
| ESC-CAJA-16 | Venta mixta: producto con IVA y servicio exento en el mismo ticket | recepcion | alta | P-056, P-057, P-078 | 3 | 3 |
| ESC-CAJA-17 | Pago dividido en tres métodos | recepcion | alta | P-059, P-078 | 4 | 4 |
| ESC-CAJA-18 | Efectivo: cambio correcto y recibido menor al monto | recepcion | alta | P-059 | 4 | 4 |
| ESC-CAJA-19 | Tarjeta: el voucher es obligatorio y queda guardado | recepcion | alta | P-077 | 3 | 3 |
| ESC-CAJA-20 | Transferencia / SPEI con referencia | recepcion | media | P-059, P-094 | 3 | 3 |
| ESC-CAJA-21 | Clip simulado como método de cobro (cobro bruto) | recepcion | media | P-034, P-077, P-094 | 2 | 2 |
| ESC-CAJA-22 | Gift card: canje total, parcial y saldo restante | recepcion | alta | P-073, P-059 | 4 | 4 |
| ESC-CAJA-23 | Gift card caducada, inexistente o combinada con promoción | recepcion | media | P-073, P-074 | 3 | 3 |
| ESC-CAJA-24 | Cortesía: motivo obligatorio, autorización y efecto en el corte | recepcion | media | P-055, P-022, P-059 | 4 | 4 |
| ESC-CAJA-25 | Anticipo aplicado: total, anticipo y saldo por cobrar | recepcion | alta | P-034, P-059, P-062 | 4 | 4 |
| ESC-CAJA-26 | Anticipo: ajeno, pendiente, reembolsado y mayor que el total | recepcion | media | P-034, P-035, P-062 | 3 | 3 |
| ESC-CAJA-27 | Descuento de Recepción de hasta 10 %: no pide PIN y queda con motivo | recepcion | alta | P-055, P-057 | 3 | 3 |
| ESC-CAJA-28 | Descuento mayor a 10 %: exige PIN de Administrador | recepcion | alta | P-055, P-130 | 6 | 6 |
| ESC-CAJA-29 | Todo descuento exige motivo | recepcion | alta | P-055 | 4 | 4 |
| ESC-CAJA-30 | Descuento global contra descuento por línea | recepcion | media | P-055, P-057 | 4 | 4 |
| ESC-CAJA-31 | Descuento en el límite: 10.00 % pasa, 10.01 % pide PIN, mayor al importe se rechaza | recepcion | media | P-055 | 4 | 4 |
| ESC-CAJA-32 | Redondeo: total del ticket = suma de líneas = CFDI | recepcion | alta | P-057, P-061, P-064 | 4 | 4 |
| ESC-CAJA-33 | Redondeo comercial: 0.005 sube | recepcion | alta | P-057 | 3 | 3 |
| ESC-CAJA-34 | Cantidad 0 en una línea | recepcion | media | P-057 | 2 | 2 |
| ESC-CAJA-35 | Cantidad negativa en una línea | recepcion | media | P-057, P-065 | 3 | 3 |
| ESC-CAJA-36 | Cantidad con decimales (1.5 y 0.001) | recepcion | baja | P-057 | 3 | 3 |
| ESC-CAJA-37 | Cantidad enorme (999,999) y letras | recepcion | baja | P-057, P-085 | 3 | 3 |
| ESC-CAJA-38 | Precio cero: producto sin precio y sesión de plan a $0 | recepcion | media | P-027, P-098, P-069 | 3 | 3 |
| ESC-CAJA-39 | Producto sin existencia: avisa, permite y deja existencia negativa | recepcion | alta | P-085, P-086, P-079 | 3 | 3 |
| ESC-CAJA-40 | Contenido del ticket impreso | recepcion | alta | P-133, P-056, P-057, P-061, P-046 | 5 | 5 |
| ESC-CAJA-41 | Reimpresión de ticket marcada «copia» | recepcion | alta | P-060 | 4 | 3 |
| ESC-CAJA-42 | Cancelación en el mismo turno por Recepción: revierte inventario, comisión y corte | recepcion | alta | P-060, P-059, P-107, P-108 | 5 | 5 |
| ESC-CAJA-43 | Cancelación de ticket de turno cerrado: solo Administración, con motivo | recepcion_y_administrador | alta | P-060, P-099, P-130 | 4 | 4 |
| ESC-CAJA-44 **primero** | Un ticket cancelado nunca se borra ni su folio se reutiliza | recepcion | alta | P-060, P-133 | 5 | 5 |
| ESC-CAJA-45 | Cancelar un ticket facturado exige cancelar o acreditar el CFDI | administrador | media | P-060, P-063, P-065 | 4 | 4 |
| ESC-CAJA-46 | Cuenta abierta: guardar, no cuenta como cobro y cobrar después | recepcion | alta | P-076, P-059, P-085 | 5 | 5 |
| ESC-CAJA-47 | Solicitud de factura desde el ticket (incluye público en general) | recepcion | media | P-064, P-066, P-061 | 4 | 4 |
| ESC-CAJA-48 | Plazo para facturar: hasta el cierre del mismo mes calendario | recepcion | media | P-064 | 4 | 3 |
| ESC-CAJA-49 | Un turno abierto por caja y por cajero | recepcion | media | P-058, P-129 | 4 | 4 |
| ESC-CAJA-50 | No se cobra sin turno de caja abierto | recepcion | alta | P-058 | 3 | 2 |
| ESC-CAJA-51 | Corte de caja con datos conocidos: efectivo esperado calculado a mano | recepcion | alta | P-059, P-058 | 3 | 3 |
| ESC-CAJA-52 | Corte con sobrante dentro de la tolerancia de $50.00 | recepcion | alta | P-058 | 3 | 2 |
| ESC-CAJA-53 | Corte con faltante exacto de $50.00: lo justifica el cajero | recepcion | alta | P-058 | 2 | 1 |
| ESC-CAJA-54 | Corte con diferencia mayor a $50.00: exige Administrador | recepcion | alta | P-058 | 5 | 4 |
| ESC-CAJA-55 | Corte: separa venta, dinero recibido y anticipos aplicados | recepcion | alta | P-059, P-073 | 3 | 3 |
| ESC-CAJA-56 | Turno cerrado: solo lectura y revisión por Administración | recepcion | alta | P-099, P-058, P-059 | 4 | 4 |
| ESC-CAJA-57 | Podólogo: «Enviar a caja» crea venta por cobrar; no cobra ni descuenta | podologo | alta | P-078, P-055, P-130 | 4 | 4 |
| ESC-CAJA-58 | Recepción: lo que NO puede hacer en caja y alrededores | recepcion | alta | P-130, P-055, P-058, P-060, P-063, P-065 | 6 | 4 |
| ESC-CAJA-59 | Administrador: acciones de autoridad en caja con bitácora | administrador | alta | P-055, P-058, P-060, P-065, P-130 | 4 | 4 |
| ESC-CAJA-60 | Devolución con nota de crédito: solo Administración, el dinero sale como retiro de caja | administrador | alta | P-065, P-079, P-060 | 4 | 4 |
| ESC-CAJA-61 | Cada línea registra quién atendió o vendió y la base de comisión | recepcion | media | P-078, P-107, P-090 | 3 | 3 |
| ESC-CAJA-62 **primero** | Folios: formato por sede, consecutivos y sin reutilización | recepcion | alta | P-133, P-129 | 3 | 3 |
| ESC-CAJA-63 | Un cambio de precio no altera tickets ya emitidos | administrador | alta | P-068, P-057 | 5 | 4 |
| ESC-CAJA-64 | Un ticket cobrado no se edita: se cancela o se acredita | recepcion | alta | P-060, P-057, P-099 | 3 | 3 |
| ESC-CAJA-65 | Retiro de efectivo de caja: concepto obligatorio y efecto en el corte | recepcion | media | P-059, P-065 | 5 | 5 |
| ESC-CAJA-66 **primero** | Doble clic, reintento o recarga no duplican el cobro ni el folio | recepcion | alta | P-133, P-059 | 3 | 3 |
| ESC-CAJA-67 | Recepción solo cobra y ve la caja de su sede | recepcion | alta | P-129, P-130 | 3 | 2 |
| ESC-CAJA-68 **primero** | Bitácora: cobro, descuento, impresión y cancelación quedan registrados y no se editan | recepcion | alta | P-055, P-060, P-127 | 3 | 2 |
| ESC-CAJA-69 | Venta de gift card: pasivo, caducidad de 12 meses y canje en cualquier sede | recepcion | media | P-073, P-091 | 4 | 3 |
| ESC-CAJA-70 | Venta de un plan: precio prorrateado por sesión y sesiones a $0 | recepcion | media | P-027, P-070, P-071, P-098 | 3 | 3 |
| ESC-CAJA-71 | Plantilla a medida: anticipo del 50 %, sin inventario y estudio acreditable | recepcion | media | P-075, P-087, P-069, P-034 | 4 | 3 |

Totales: 71 escenarios · 253 pasos · 230 pasos con verificar_bd. Prioridad alta: 48 · media: 21 · baja: 2. Escenarios `primero`: ESC-CAJA-11, ESC-CAJA-12, ESC-CAJA-44, ESC-CAJA-62, ESC-CAJA-66, ESC-CAJA-68.

## Matriz de cobertura regla → escenario

| regla | tema | escenarios |
|---|---|---|
| P-027 | Sesiones de plan a $0 | ESC-CAJA-38, ESC-CAJA-70 |
| P-034 | Anticipo (30 %; Clip) | ESC-CAJA-21, ESC-CAJA-25, ESC-CAJA-26, ESC-CAJA-71 |
| P-035 | Reembolso del anticipo | ESC-CAJA-26 |
| P-045 | Cobro no cambia estado de cita; alerta 24 h | **SIN ESCENARIO** |
| P-046 | Zona horaria y corte del día | ESC-CAJA-40 |
| P-055 | Descuentos (10 %, PIN, motivo) | ESC-CAJA-06, ESC-CAJA-24, ESC-CAJA-27, ESC-CAJA-28, ESC-CAJA-29, ESC-CAJA-30, ESC-CAJA-31, ESC-CAJA-57, ESC-CAJA-58, ESC-CAJA-59, ESC-CAJA-68 |
| P-056 | IVA por concepto | ESC-CAJA-02, ESC-CAJA-03, ESC-CAJA-04, ESC-CAJA-13, ESC-CAJA-14, ESC-CAJA-16, ESC-CAJA-40 |
| P-057 | Redondeos | ESC-CAJA-02, ESC-CAJA-13, ESC-CAJA-15, ESC-CAJA-16, ESC-CAJA-27, ESC-CAJA-30, ESC-CAJA-32, ESC-CAJA-33, ESC-CAJA-34, ESC-CAJA-35, ESC-CAJA-36, ESC-CAJA-37, ESC-CAJA-40, ESC-CAJA-63, ESC-CAJA-64 |
| P-058 | Turnos y tolerancia $50 | ESC-CAJA-01, ESC-CAJA-08, ESC-CAJA-49, ESC-CAJA-50, ESC-CAJA-51, ESC-CAJA-52, ESC-CAJA-53, ESC-CAJA-54, ESC-CAJA-56, ESC-CAJA-58, ESC-CAJA-59 |
| P-059 | Corte de caja | ESC-CAJA-08, ESC-CAJA-17, ESC-CAJA-18, ESC-CAJA-20, ESC-CAJA-22, ESC-CAJA-24, ESC-CAJA-25, ESC-CAJA-42, ESC-CAJA-46, ESC-CAJA-51, ESC-CAJA-55, ESC-CAJA-56, ESC-CAJA-65, ESC-CAJA-66 |
| P-060 | Cancelar / reimprimir ticket | ESC-CAJA-41, ESC-CAJA-42, ESC-CAJA-43, ESC-CAJA-44, ESC-CAJA-45, ESC-CAJA-58, ESC-CAJA-59, ESC-CAJA-60, ESC-CAJA-64, ESC-CAJA-68 |
| P-061 | Facturación CFDI integrada | ESC-CAJA-07, ESC-CAJA-32, ESC-CAJA-40, ESC-CAJA-47 |
| P-062 | Anticipos y CFDI | ESC-CAJA-25, ESC-CAJA-26 |
| P-063 | Cancelar CFDI | ESC-CAJA-45, ESC-CAJA-58 |
| P-064 | Plazo para facturar y global mensual | ESC-CAJA-07, ESC-CAJA-32, ESC-CAJA-47, ESC-CAJA-48 |
| P-065 | Notas de crédito y devoluciones | ESC-CAJA-06, ESC-CAJA-35, ESC-CAJA-45, ESC-CAJA-58, ESC-CAJA-59, ESC-CAJA-60, ESC-CAJA-65 |
| P-066 | Datos fiscales del paciente | ESC-CAJA-47 |
| P-067 | Precio por servicio / sede | ESC-CAJA-03, ESC-CAJA-04, ESC-CAJA-14, ESC-CAJA-15 |
| P-068 | Cambio de precio (congelado) | ESC-CAJA-15, ESC-CAJA-63 |
| P-069 | Precios del catálogo | ESC-CAJA-38, ESC-CAJA-71 |
| P-070 | Planes caducados | ESC-CAJA-70 |
| P-071 | Planes en otra sede (prorrateo) | ESC-CAJA-70 |
| P-072 | Anualidad / membresía | **SIN ESCENARIO** |
| P-073 | Gift cards | ESC-CAJA-22, ESC-CAJA-23, ESC-CAJA-55, ESC-CAJA-69 |
| P-074 | Promociones | ESC-CAJA-23 |
| P-075 | Plantillas a medida: anticipo 50 % | ESC-CAJA-71 |
| P-076 | Crédito / cuenta abierta | ESC-CAJA-46 |
| P-077 | Comisión Clip/terminal | ESC-CAJA-19, ESC-CAJA-21 |
| P-078 | Quién cobra y quién vende | ESC-CAJA-05, ESC-CAJA-09, ESC-CAJA-16, ESC-CAJA-17, ESC-CAJA-57, ESC-CAJA-61 |
| P-079 | Inventario por sucursal | ESC-CAJA-02, ESC-CAJA-13, ESC-CAJA-39, ESC-CAJA-60 |
| P-085 | Venta sin existencia | ESC-CAJA-37, ESC-CAJA-39, ESC-CAJA-46 |
| P-087 | Plantillas a medida sin inventario | ESC-CAJA-04, ESC-CAJA-71 |
| P-090 | Ingreso real / validado | ESC-CAJA-61 |
| P-094 | Conciliación (liquidaciones Clip) | ESC-CAJA-20, ESC-CAJA-21 |
| P-098 | Citas de $0 / glosario | ESC-CAJA-38, ESC-CAJA-70 |
| P-099 | Cierres de periodo | ESC-CAJA-43, ESC-CAJA-56, ESC-CAJA-64 |
| P-107 | Base de comisión | ESC-CAJA-42, ESC-CAJA-61 |
| P-108 | Cambios de esquema / ajustes posteriores | ESC-CAJA-42 |
| P-119 | Acceso (sesión, bloqueo) | ESC-CAJA-12 |
| P-127 | Retención y bitácora | ESC-CAJA-68 |
| P-128 | Aislamiento entre clínicas | ESC-CAJA-11, ESC-CAJA-12 |
| P-129 | Clínica vs sede | ESC-CAJA-01, ESC-CAJA-02, ESC-CAJA-10, ESC-CAJA-49, ESC-CAJA-62, ESC-CAJA-67 |
| P-130 | Matriz de permisos | ESC-CAJA-09, ESC-CAJA-10, ESC-CAJA-28, ESC-CAJA-43, ESC-CAJA-57, ESC-CAJA-58, ESC-CAJA-59, ESC-CAJA-67 |
| P-133 | Folios | ESC-CAJA-02, ESC-CAJA-07, ESC-CAJA-13, ESC-CAJA-14, ESC-CAJA-40, ESC-CAJA-44, ESC-CAJA-62, ESC-CAJA-66 |

Otras reglas citadas por los escenarios: P-022 (ESC-CAJA-24); P-086 (ESC-CAJA-39); P-091 (ESC-CAJA-69).

### Reglas de caja SIN escenario propio

- **P-045** Cobro no cambia estado de cita; alerta 24 h — El cobro no cambia el estado de la cita y hay alerta si se cobra sin nota en 24 h (pertenece a agenda/clínico; ESC-CAJA-25 solo toca el ticket de la cita).
- **P-072** Anualidad / membresía — Membresías/anualidad: cada clínica configura; no hay beneficio definido por negocio que permita calcular un esperado.

También sin escenario (por falta de definición de negocio o de módulo): factura global mensual en borrador (P-064, módulo de facturación), liquidación y comisión real de Clip, impresión física en impresora térmica (solo se valida la vista previa), prorrateo exacto de descuento global entre líneas (A14), promociones con cálculo (A28).

## Lista de AMBIGUO / preguntas para negocio

No se inventó ninguna cifra. Los pasos ligados a estas preguntas se ejecutan para **registrar el comportamiento** y se marcan VERIFICAR hasta que negocio decida (METODOLOGIA_QA §1.5, §4 Fase 1).

| id | pregunta | escenarios afectados |
|---|---|---|
| A01 | Rol Supervisor (s@g.com): MATRIZ_ROLES.md y P-131 solo definen 3 perfiles con sesión (podólogo, recepción, administrador). ¿Qué puede ver y hacer un supervisor en Caja? ¿Existe como perfil de negocio? | ESC-CAJA-10 |
| A02 | Podólogo y Caja: MATRIZ_ROLES §4.2 le da V (ver) en venta/ticket; ESC-CAJA-09 dice «Sin acceso (o solo lo que tenga habilitado)». ¿Ve el módulo Caja en solo lectura o solo tiene «Enviar a caja»? | ESC-CAJA-09, ESC-CAJA-57 |
| A03 | Cobro con PIN personal (ESC-CAJA-05): ninguna regla de negocio lo define (P-078 solo dice que cobra caja y cada línea registra quién vendió). ¿El PIN firma cada cobro? ¿Cómo debe persistir? (la columna ventas.vendedor_id citada en el legado no existe en el esquema; hay ventas.cajero_id y firmas_cobro). | ESC-CAJA-05 |
| A04 | Cantidades decimales: ¿se permiten en productos? ¿en servicios por unidad? ¿cuántos decimales? | ESC-CAJA-36 |
| A05 | Cantidad máxima por línea y monto máximo por ticket (no hay tope definido por negocio). | ESC-CAJA-37 |
| A06 | Producto con precio 0 (no es sesión de plan): ¿se puede vender? Ticket con total $0.00: ¿requiere pago, entra al corte, consume folio? | ESC-CAJA-38 |
| A07 | Cortesía: ¿es descuento del 100 % (y por tanto exige PIN de Administrador por exceder 10 %) o es un método de pago? ¿Cuenta como venta devengada en el corte? ¿Genera comisión? | ESC-CAJA-24 |
| A08 | Clip como método de cobro en caja: P-034 dice que el único uso de Clip es anticipos, pero METRICAS M-043 y el mockup 17 lo listan como método de cobro del turno. ¿Entra en esta fase? ¿Cuánto es la comisión (P-077 dice solo que el cobro va bruto)? | ESC-CAJA-21 |
| A09 | Tarjeta: ¿el voucher es folio de autorización obligatorio? ¿últimos 4 dígitos obligatorios? ¿formato y longitud? | ESC-CAJA-03, ESC-CAJA-19 |
| A10 | Transferencia/SPEI: ¿la clave de rastreo es obligatoria? ¿se valida contra el banco (P-094 solo concilia después)? | ESC-CAJA-20 |
| A11 | Pago mayor al saldo con método distinto de efectivo (tarjeta, SPEI, gift card): ¿se rechaza, se registra saldo a favor o propina? No hay regla de propinas. | ESC-CAJA-18 |
| A12 | Anticipo mayor que el total del ticket: ¿saldo a favor, devolución o remanente aplicable a otra cita? (P-035 solo trata cancelación). | ESC-CAJA-26 |
| A13 | Etiqueta TOTAL del ticket con anticipo: METRICAS M-040 señala que el ticket imprime TOTAL 1,810 (antes del anticipo) y el corte 1,610. ¿Qué cifra es «TOTAL» y cuál «por pagar»? Los escenarios esperan Total = venta, Anticipo aplicado y Por pagar rotulados por separado. | ESC-CAJA-25, ESC-CAJA-40 |
| A14 | Descuento global: P-057 solo define IVA por línea. ¿Cómo se prorratea el descuento global entre líneas e IVA? ¿Cómo se aplica el tope del 10 % si se combinan descuento de línea y global (¿acumulado o cada uno?)? | ESC-CAJA-30 |
| A15 | PIN de Administrador (P-055): ¿vigencia (un ticket, un minuto)?, ¿intentos fallidos antes de bloqueo?, ¿el PIN es de la persona o único de la clínica? | ESC-CAJA-06, ESC-CAJA-28, ESC-CAJA-54 |
| A16 | Cancelación en el mismo turno (P-060): ¿el motivo es obligatorio también para Recepción? ¿cualquier cajero o solo quien cobró? ¿qué pasa con el dinero ya entregado (el corte descuenta «cancelaciones en efectivo»)? | ESC-CAJA-42, ESC-CAJA-44 |
| A17 | Cancelación de ticket de turno cerrado (P-060 + P-099): ¿cómo se refleja si el corte ya está cerrado? Se asume ajuste en el turno/periodo siguiente con referencia; ¿sale el dinero como devolución o retiro? | ESC-CAJA-43 |
| A18 | Reimpresión (P-060): ¿quién puede reimprimir (Recepción en cualquier turno o solo Administración tras cerrar)? ¿hay tope de copias? ¿lleva motivo? ¿un ticket cancelado reimpreso lleva leyenda CANCELADO? | ESC-CAJA-41 |
| A19 | Fórmula de corte P-059 («fondo + efectivo − retiros − cancelaciones en efectivo»): ¿«efectivo» incluye lo cobrado en tickets que luego se cancelan? Se asume neto físico (el efectivo en cajón es el mismo en ambas lecturas). | ESC-CAJA-42, ESC-CAJA-51, ESC-CAJA-55 |
| A20 | Tolerancia de $50.00 (P-058): ¿es absoluta (sobrante y faltante)? ¿$50.00 exactos está dentro? ¿una diferencia de $0.00 exige justificación? ¿longitud mínima de la justificación? | ESC-CAJA-08, ESC-CAJA-51, ESC-CAJA-52, ESC-CAJA-53, ESC-CAJA-54 |
| A21 | Gift card en el corte: ¿cuenta como «dinero recibido en el turno» (cobros_total) o como instrumento aparte, igual que el anticipo? METRICAS M-043 la suma a las ventas del turno. | ESC-CAJA-22, ESC-CAJA-55 |
| A22 | Cuenta abierta (D-68, P-076): ¿tope de monto o antigüedad? ¿se puede cerrar el turno con cuentas abiertas? ¿el cobro posterior entra al turno donde se cobra? | ESC-CAJA-46 |
| A23 | Plazo para facturar (P-064): ¿Administración puede facturar fuera de plazo? ¿corte del último día en zona de la sede (23:59:59)? ¿se imprime la fecha límite en el ticket? | ESC-CAJA-07, ESC-CAJA-40, ESC-CAJA-48 |
| A24 | Turno: ¿se permite fondo inicial $0.00? ¿tope? ¿puede un Administrador abrir turno y cobrar? ¿quién fija el fondo? | ESC-CAJA-49, ESC-CAJA-50, ESC-CAJA-59 |
| A25 | Retiros de caja: ¿tope o autorización? ¿puede un retiro exceder el efectivo disponible? | ESC-CAJA-65 |
| A26 | Redondeo (P-057): se asume que «línea» es el renglón completo (cantidad × precio) y que el redondeo comercial (≥ 0.005 sube) aplica a descuento, base e IVA. ¿Confirmar? (hay escenarios cuyo resultado depende de ello). | ESC-CAJA-32, ESC-CAJA-33 |
| A27 | Características (ESC-CAJA-04): ¿cuánto suma cada característica del 1,500 adicional (molde de yeso vs mayor altura 3 mm)? ¿«mayor altura» cobra por mm? ¿qué pasa al quitar una? | ESC-CAJA-04, ESC-CAJA-15 |
| A28 | Promociones en caja: no hay regla de cómputo (P-074 solo dice una por línea y prioridad de paquetes); el caso gift card + promoción (P-073) requiere definir una promoción de prueba. | ESC-CAJA-23 |
| A29 | Pago dividido: ¿puede repetirse el mismo método (dos tarjetas)? ¿límite de renglones de pago? ¿un pago parcial deja el ticket «por cobrar»? | ESC-CAJA-17 |
| A30 | Cancelación e inventario (P-060): ¿qué tipo de movimiento regresa la existencia (devolución de cliente)? ¿regresa al mismo lote? | ESC-CAJA-42 |
| A31 | Cancelación y comisiones (P-060, P-108): en periodo abierto se asume que la comisión desaparece del cálculo; en periodo cerrado, ajuste negativo con referencia. ¿Confirmar? | ESC-CAJA-42, ESC-CAJA-61 |
| A32 | Cobrar «sin ticket» (MODELO_ESTADOS S12): ¿consume folio igualmente y puede imprimirse después como copia? | ESC-CAJA-14 |
| A33 | Identificación de datos QA: se asume que la venta admite un campo de nota o referencia para el prefijo QA-{corrida}-; si la UI no lo ofrece el tester ligará por folio y lo registrará en bitácora. | (sin escenario) |
| A34 | Sede B de prueba y segunda clínica (aislamiento): requieren usuarios y datos sembrados que hoy no están documentados (ver ACCESOS.md). | ESC-CAJA-11, ESC-CAJA-62, ESC-CAJA-67 |
| A35 | Gift card vendida: P-073 dice que la venta registra pasivo y el ingreso se reconoce al canjear, pero no se define cómo se ve en ingresos/EDR ni cuál es el IVA de la venta de una gift card. | ESC-CAJA-69 |
| A36 | Plantilla a medida (P-075): el estudio de pisada se acredita al comprar dentro de 30 días, pero no se define si se acredita completo (1,200.00) ni sobre qué base (precio total o saldo) ni cómo se imprime. | ESC-CAJA-71 |
