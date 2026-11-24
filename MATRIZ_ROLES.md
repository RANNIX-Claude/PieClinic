# MATRIZ DE ROLES — Pie Firme (Clínica de Podología · RANNIX)

> Etapa **E2** (análisis visual). Base del RLS. Derivada de los 49 mockups de `docs/mockups/` y de `REQUERIMIENTO.md`.
> No contiene SQL. Lo que no esté respaldado por el dueño va como **[PROPUESTO]** y tiene su pregunta en `PREGUNTAS_ABIERTAS.md`.
> Estado: **borrador para E3**; ninguna celda marcada [PROPUESTO] es una regla de negocio confirmada.

## 1. Cómo leer este documento

**Marcas**
- **[VISTO en NN]**: aparece en el mockup NN (pantalla, menú, botón o matriz mostrada). El mockup 44 trae una matriz de permisos que él mismo declara "propuesta", así que incluso lo visto en 44 es una propuesta de Claude pendiente del dueño; se marca **[VISTO en 44]** para distinguirlo de lo que se dedujo de otras pantallas.
- **[PROPUESTO]**: no aparece en pantalla o la pantalla lo contradice; es una deducción para poder tener una matriz completa. Siempre con enlace a pregunta.
- **[CONTRADICCIÓN]**: dos mockups dicen cosas incompatibles; se documenta, no se elige.

**Letras:** `V` ver · `C` crear · `E` editar · `B` borrar (solo donde un mockup muestra un botón de borrar; en el resto la ausencia de `B` significa "no se muestra borrado; se cancela o anula con estado", pendiente de P-051) · `—` sin acceso.
**Sufijos:** `*` el acceso se registra en bitácora · `(s)` limitado a las sedes asignadas al usuario · `(p)` limitado a lo propio (sus pacientes, sus citas, su nómina).

## 2. Perfiles

| Perfil | Inicia sesión | Alcance | Respaldo |
|---|---|---|---|
| **Podólogo** | Sí (`/app/`) | Clínica + lista de sedes asignadas (puede ser más de una) | [VISTO en 44, 49] |
| **Recepción** | Sí | Clínica + lista de sedes asignadas | [VISTO en 44, 49] |
| **Administrador de clínica** | Sí; 2FA obligatorio | Todas las sedes en 44; 43 muestra un administrador "sede Polanco" → ver P-135 | [VISTO en 44, 45, 43] |
| **Superadministrador RANNIX** | Sí (panel propio) | Todas las clínicas, **solo metadatos** de uso y cobro; los datos de salud nunca se muestran | [VISTO en 48] |
| **Paciente** | **No.** Sin cuenta ni sesión. Usa el portal público con ligas de un solo propósito | Una sola cita (la de su liga) | [VISTO en 25–29]; decidido en REQUERIMIENTO |
| Personal de apoyo (auxiliares, inventario, lab.) | No definido. Aparecen operando inventario y esterilización (Luis Ortega, Marta Gil, Lupita Torres) y en nómina (3 de apoyo) | — | [VISTO en 15, 21, 22, 39] → P-131 |

Estados de usuario [VISTO en 44]: Activo · Inactivo · Bloqueado (por 3 intentos fallidos, [VISTO en 43]). Atributos del usuario [VISTO en 44]: nombre, correo, rol, sedes, estado, último acceso, creado.

## 3. Reglas de aislamiento (base del RLS)

1. **Aislamiento entre clínicas (requisito número uno).** Toda fila operativa pertenece a exactamente una clínica y un usuario solo lee/escribe filas de su clínica. Incluye pacientes, expediente, fotos (almacenamiento privado con URL firmada), documentos, catálogo, finanzas, inventario, bitácora, y la IA (47: "solo ve datos de Podología Centro"). [VISTO en 47, 48 y en REQUERIMIENTO "Qué no puede fallar"]. Preguntas: P-128, P-125.
2. **Alcance por sede dentro de la clínica.** El usuario tiene una lista de sedes ([VISTO en 44]: "permisos por sede", p. ej. Marco Mena: Roma Norte y Coyoacán; Julián Cano: Coyoacán y Polanco). Se asumen por sede: agenda, cabinas, caja y turnos, inventario y traspasos, fondo revolvente, esterilización, mantenimiento, lista de espera. Se asumen por clínica: catálogo de servicios y productos (con precio por sucursal), proveedores, usuarios, plantillas legales, configuración fiscal. El paciente y su expediente: por clínica con "sede de alta" como atributo [VISTO en 02, 10] → P-129, P-002. [PROPUESTO]
3. **Superadministrador.** Ve clínicas, planes, uso (citas, almacenamiento, podólogos), cobro y soporte [VISTO en 48]. No lee expediente ni datos financieros de la clínica. Cualquier acceso de soporte a una clínica: P-121.
4. **Bitácora de accesos.** Toda apertura de un expediente, foto o dictado queda registrada (quién, cuándo, IP, entidad) [VISTO en 02, 43, 08, 47]. La bitácora es de solo lectura para todos los roles.
5. **Datos clínicos y recepción.** 44 dice que Recepción tiene "solo datos de contacto" del expediente, pero 10 (alta) le hace capturar alergias y diabetes, 16 le muestra segmentos "Diabético", último servicio y revisión vencida, y 43 registra a una recepcionista abriendo las fotos clínicas de un paciente. **[CONTRADICCIÓN 44 vs 10, 16, 43]** → P-130.
6. **Portal público y ligas.** Ver sección 6. Acceso anónimo, sin lectura de datos de otros pacientes. [PROPUESTO]

## 4. Matriz principal

> Columnas por perfil: Podólogo (Pod) · Recepción (Rec) · Administrador (Adm) · Superadmin RANNIX (SA).

### 4.1 Pacientes y agenda

| Entidad / función | Pod | Rec | Adm | SA | Alcance | Marca | Pregunta |
|---|---|---|---|---|---|---|---|
| Ficha del paciente (datos personales, contacto, emergencia, tutor) | V C E | V C E | V C E | — | clínica; sede de alta | [VISTO en 44 "Agenda y pacientes ✓ editar" para los tres, 10] | P-003, P-005 |
| Datos fiscales del paciente | V | V C E | V C E | — | clínica | [VISTO en 10, 18]; Pod [PROPUESTO] | P-066 |
| Fusión de duplicados | — | marcar | E | — | clínica | [PROPUESTO] (10 solo avisa) | P-006 |
| Antecedentes y alertas clínicas | V C E (p)* | V (contacto) / C en alta | V* | — | pacientes que atiende | Pod [VISTO en 44]; Rec [CONTRADICCIÓN 44 vs 10, 16] | P-002, P-130, P-030 |
| Consulta / nota de evolución (borrador) | V C E (p)* | — | V* | — | sus pacientes | [VISTO en 44, 03] | P-002 |
| Firmar y cerrar consulta | C (propia) | — | — | — | quien la atiende | [VISTO en 03] | P-001, P-146 |
| Nota ya firmada (corrección) | pendiente | — | pendiente | — | — | [CONTRADICCIÓN 03 vs 43] | P-001 |
| Exploración, mapa del pie, valoración de pie diabético | V C E (p)* | — | V* | — | sus pacientes | [VISTO en 03, 06; menú de podólogo en 02] | P-010, P-011 |
| Fotos clínicas (subir, comparar, anotar) | V C E (p)* | V* (visto en 43) | V* | — | sus pacientes | Pod [VISTO en 04]; Rec [CONTRADICCIÓN 43 vs 44] | P-007, P-008 |
| Eliminar foto clínica | B (botón en 04) | — | — | — | — | [VISTO en 04] (botón "Eliminar"); pendiente | P-008 |
| Documentos y consentimientos (aviso, consentimiento, firmas) | C (consent. en consulta) | C (aviso y firma en alta) | V* | — | clínica | [VISTO en 03, 10, 02] | P-019, P-004 |
| Plantillas de aviso y consentimiento (texto, versión) | — | — | V C E | — | clínica | [VISTO en 45] | P-139, P-138 |
| Plan de tratamiento | V C E | V C | V C E | — | sus pacientes / sede | Pod [VISTO en 05 y menú de 02]; Rec [VISTO en menú de 10]; permisos exactos [PROPUESTO] | P-026, P-027 |
| Plantillas de plan (catálogo de planes) | — | — | V C E | — | clínica | [PROPUESTO] | P-027 |
| Plantilla ortopédica (estudio de pisada, orden, entrega) | V C E | V (entrega) | V | — | sede | Pod [VISTO en 07]; resto [PROPUESTO] | P-013, P-075 |
| Dictado por voz | C E (propio) | — | V (bitácora) | — | propio | [VISTO en 08] | P-014, P-015 |
| Videoconsulta (sala, nota a distancia) | C E | V (agenda/"Videoconsultas") | — | — | propio | Pod [VISTO en 09]; Rec [VISTO en menú de 17]; Adm [PROPUESTO] | P-016, P-018 |
| Cita | V C E (p) | V C E (s) | V C E (s) | — | sede | [VISTO en 01, 11, 30, 44] | P-045, P-051 |
| Sobrecupo controlado | — | solicita | autoriza | — | sede | [VISTO en 11 "autoriza: administración"] | P-042 |
| Lista de espera (alta, notificar, agendar, quitar) | — | V C E B | V | — | sede | [VISTO en 12 (quitar, reactivar), menú de 10]; Pod [PROPUESTO] | P-041 |
| Horarios del podólogo, bloqueos, festivos | E (su perfil) | V | V C E | — | sede | Pod/bloqueos [VISTO en 45 "se editan en su perfil"]; quién edita [PROPUESTO] | P-047, P-043 |
| Importar datos con IA (cargar, mapear, confirmar) | — | ver P-130 | V C | — | clínica | Adm [VISTO en 13]; Rec [CONTRADICCIÓN: aparece en menú de 10–12 y 16; el requerimiento dice que lo confirma un administrador] | P-122, P-123 |
| CRM: seguimiento, inactivos, campañas, cumpleaños | V (sus pacientes) | V C | V C E (aprueba) | — | sede | Rec [VISTO en 16]; Pod [VISTO en menú de 02]; quién aprueba [PROPUESTO] | P-052, P-053, P-054 |
| Encuestas / NPS | — | V | V | — | sede | [VISTO en 16, 14] | P-054 |
| Quejas e incidencias | V (las suyas) [PROPUESTO] | C V | V C E (resolver) | — | sede | Rec/Adm [VISTO en 14, menú de 10]; responsable clínico puede ser un podólogo [VISTO en 14 QJ-0138] | P-020, P-021, P-022 |
| Esterilización: lotes, kits, trazabilidad | V (elige kit en consulta) | C (opera autoclave) | V C E (liberar/rechazar) | — | sede | [VISTO en 15, 03; operadores Ana López y Lupita Torres] | P-023, P-024 |

### 4.2 Ventas y facturación

| Entidad / función | Pod | Rec | Adm | SA | Alcance | Marca | Pregunta |
|---|---|---|---|---|---|---|---|
| Venta / ticket (cobrar, dividir pago, anticipo, imprimir) | V | V C E | V C E | — | sede, caja | Pod "ver" [VISTO en 44]; Rec [VISTO en 17, 44] | P-055, P-078 |
| Cancelar venta / reimprimir | — | cancelar (¿mismo turno?) | cancelar | — | sede | [VISTO en 17 botón "Cancelar venta"]; quién [PROPUESTO] | P-060 |
| Descuento de línea / global / cortesía | — | hasta umbral | cualquiera (PIN) | — | sede | [VISTO en 17]; umbral y PIN [PROPUESTO] | P-055 |
| Turno y corte de caja | — | abrir, cerrar | revisar | — | sede, caja | [VISTO en 17 "revisa Admin"] | P-058, P-059 |
| Factura CFDI (timbrar, reenviar, borrador) | — | V C E | V C E | — | clínica | Rec [VISTO en 18, menú de 17] | P-061, P-064 |
| Cancelar CFDI / nota de crédito | — | — | C E | — | clínica | [PROPUESTO]; la nota 18 pregunta si solo Administrador | P-063, P-065 |
| Datos fiscales de la clínica, CSD, PAC, serie y folio | — | — | V E | — | clínica | [VISTO en 45] | P-061 |
| Catálogo de servicios y productos (alta, precio, vigencia, histórico) | V | V | V C E | — | clínica; precio por sucursal | Adm [VISTO en 19]; Rec "Catálogo y precios" en menú de 10 (¿ver o editar?) | P-067, P-068 |
| Paquetes, planes, membresías, gift cards, promociones | V | V (vender) | V C E | — | clínica | Adm [VISTO en 20]; Rec vende [VISTO en 17 "Agregar paquete / gift card"] | P-074, P-073, P-072 |

### 4.3 Inventario

| Entidad / función | Pod | Rec | Adm | SA | Alcance | Marca | Pregunta |
|---|---|---|---|---|---|---|---|
| Existencias y kardex | V | V C E | V C E | — | sede | [VISTO en 44 "Caja, tickets e inventario": Adm ✓, Pod ver, Rec ✓ editar] | P-079, P-084 |
| Traspasos (crear, enviar, recibir, cancelar) | — | C E (envía y recibe) | V C E | — | origen y destino | [VISTO en 22]; Luis Ortega (Coyoacán) y Marta Gil operan | P-080 |
| Conteos físicos, mermas y ajustes | — | C | autoriza | — | sede | captura [VISTO en 21]; autorización [PROPUESTO] | P-086, P-085 |
| Órdenes de compra y recepción de mercancía | — | recibe | V C E | — | sede que recibe | Adm [VISTO en 23]; Rec recibe (OC-0045 recibió Ana López) [VISTO en 23] | P-081 |
| Proveedores (catálogo, expediente, documentos) | — | V | V C E | — | clínica | [VISTO en 24] | P-082 |

### 4.4 Finanzas y análisis

| Entidad / función | Pod | Rec | Adm | SA | Alcance | Marca | Pregunta |
|---|---|---|---|---|---|---|---|
| Ingresos (registrar, validar, vincular comprobante) | — | — (nacen de la caja) | V C E B | — | clínica / sede | [VISTO en 33 (🗑), 44 "Finanzas: solo Administrador"]; quién valida [PROPUESTO] | P-089, P-090 |
| Gastos operativos (ticket, carga en grupo) | — | ver nota | V C E | — | sede | Adm [VISTO en 34]; Rec es responsable del fondo en 37 → **[CONTRADICCIÓN 37 vs 44]** | P-093, P-095 |
| Fondo revolvente (registrar gasto, reponer) | — | C (responsable del fondo) | V C E B | — | sede | Rec "Responsable: Ana López (recepción)" [VISTO en 37]; 44 le niega finanzas | P-095, P-130 |
| Estado de resultados: `proy_*` (proyección) | — | — | E | — | clínica / sede | [VISTO en 35 y regla del dueño: solo administrador, nunca el sistema] | P-092 |
| Estado de resultados: `real_*` | — | — | V | — | clínica / sede | [VISTO en 35]: lo calcula el sistema, nadie lo edita | P-090 |
| Conciliación bancaria | — | — | V C E | — | cuenta / sede | [VISTO en 36] | P-094 |
| Cuentas por pagar / por cobrar | — | — | V C E | — | sede | [VISTO en 38] | P-096, P-076 |
| Resumen semanal y cierre de semana | — | — | V E (cerrar) | — | clínica | [VISTO en 32] | P-088, P-099 |
| Dashboard | V (p) [PROPUESTO] | V (s) [PROPUESTO] | V | — | clínica / sede | Adm [VISTO en 31]; Pod/Rec aparece "Dashboard" en menú de 02/10 pero sin pantalla | P-102 |
| Reportes y BI | V (p) [PROPUESTO] | — | V | — | clínica / sede | Adm [VISTO en 42]; Pod "Reportes" en menú de 02 | P-102 |
| Asistente de IA | V (consultas) | — | V | — | clínica | Adm [VISTO en 47]; Pod "Asistente IA" en menú de 02 | P-125, P-124 |

### 4.5 RH, comisiones y mantenimiento

| Entidad / función | Pod | Rec | Adm | SA | Alcance | Marca | Pregunta |
|---|---|---|---|---|---|---|---|
| Empleados, nómina, prenómina | V (p, solo la suya) | — | V C E | — | clínica | [VISTO en 44 "solo las suyas" / 39] | P-103, P-104, P-111 |
| Asistencia, horarios, vacaciones, incidencias | V (p) [PROPUESTO] | V (p) [PROPUESTO] | V C E | — | sede | Adm [VISTO en 39] | P-110, P-105 |
| Comisiones y productividad | V (p) | — | V E (esquemas, cerrar periodo) | — | clínica | Pod [VISTO en 44 y menú de 02]; Adm [VISTO en 40] | P-106, P-107 |
| Mantenimiento: solicitud y orden de trabajo | solicita [PROPUESTO] | solicita [PROPUESTO] | V C E (autoriza, cierra) | — | sede | Adm [VISTO en 41 (botón Autorizar)] | P-112 |

### 4.6 Sistema y plataforma

| Entidad / función | Pod | Rec | Adm | SA | Alcance | Marca | Pregunta |
|---|---|---|---|---|---|---|---|
| Usuarios y roles (alta, rol, sedes, activar, reset) | — | — | V C E | — | clínica | [VISTO en 44] | P-130, P-119 |
| Configuración de la clínica, sedes, cabinas, horarios | — | — | V E | — | clínica | [VISTO en 45] | P-129 |
| Integración Clip (cuenta, terminales, anticipo %, conciliación) | — | — | V E | — | clínica | [VISTO en 45] | P-034, P-113 |
| Seguridad (sesión, 2FA, login con Google, auditoría) | — | — | V E | — | clínica | [VISTO en 45] | P-120, P-119 |
| Bitácora | — | — | V (exportar CSV) | — | clínica | [VISTO en 43] | P-127 |
| Suscripción de la clínica (plan, tarjeta, facturas RANNIX) | — | — | V E | V | clínica | [VISTO en 44, 46] | P-116, P-114 |
| Alta de clínica, plan, estado (activa, prueba, suspendida) | — | — | — | V C E | todas | [VISTO en 48] | P-114 |
| Planes y cobros (MRR, rechazos) | — | — | — | V | todas | [VISTO en 48] | P-117 |
| Soporte (tickets) | — | — | crea [PROPUESTO] | V C E | todas | [VISTO en 48] | P-121 |
| Datos de salud o financieros de una clínica | — | — | — | **—** | — | [VISTO en 48]: "los datos de salud nunca se muestran aquí" | P-121 |

## 5. Hallazgos para el RLS

1. **44 no cubre pantallas que los demás mockups sí muestran.** Faltan en su matriz: quejas, esterilización, catálogo y precios, paquetes y membresías, importación, lista de espera, facturación, conciliación, mantenimiento, bitácora, asistente de IA y CRM. Todas están marcadas aquí como [PROPUESTO] o por el menú del perfil.
2. **Los menús por perfil no coinciden entre mockups.** Recepción: 10–16 muestra Dashboard, Citas en línea, Importar datos, Quejas, Facturación, Catálogo y Paquetes; 17–18 muestra un menú más corto (Resumen, Videoconsultas, Recordatorios y campañas). Podólogo (02–09) muestra Dashboard, Comisiones, Reportes y Asistente IA. Administrador (13–15 y 19–24) tiene un menú, y (31–47) otro. P-130.
3. **El administrador es la única llave de finanzas, RH, usuarios y suscripción** [VISTO en 44], pero 37 hace a Recepción responsable del fondo revolvente y de gastos de caja.
4. **"Sus pacientes" no está definido.** Si es paciente asignado al podólogo, el modelo necesita una relación podólogo–paciente; si es por sede, no. P-002.
5. **Operaciones de autoridad sin dueño definido:** descuento sobre umbral, cancelar venta/CFDI, corregir cita pasada, validar ingreso, liberar lote de esterilización, autorizar OT/compra/conteo/merma/reposición del fondo, cerrar semana/periodo/nómina, fusionar pacientes.
6. **Nada se borra físicamente** salvo lo que los mockups muestran con botón de borrar (foto 04, ingreso 33/32, gasto del fondo 37, borrador de factura 18, quitar de lista de espera 12); la regla de bitácora ("Registro eliminado" existe como filtro en 43) y de retención ≥ 5 años obligan a decidir P-008, P-051, P-127.

## 6. Portal público (el paciente NO inicia sesión)

Acceso anónimo por clínica (el portal vive en `piefirme.rannix.com`; la dirección por clínica está en P-134). Ninguna acción del paciente lee otro dato que su propia cita.

| Acción | Pantalla | Lee | Escribe | Control de acceso | Marca |
|---|---|---|---|---|---|
| Ver home, planes y precios de la suscripción | 28 | contenido público | — | ninguno | [VISTO en 28] |
| Ver sedes, servicios, precios, podólogos (con cédula) | 25 | catálogo publicado de la clínica | — | ninguno | [VISTO en 25]; qué se publica P-134 |
| Consultar horarios libres | 25 | solo disponibilidad (sin datos de otros pacientes) | — | ninguno | [VISTO en 25] |
| Pedir aviso si se libera un horario | 25 | — | solicitud en lista de espera | ninguno; límite anti-abuso | [VISTO en 25]; P-049 |
| Reservar: capturar datos personales y consentimientos | 26 | — | paciente (alta o coincidencia), cita, consentimientos aceptados | token de reserva con retención de horario | [VISTO en 26]; P-006, P-036 |
| Pagar anticipo con Clip | 26 | — | pago/anticipo ligado a la cita | pasarela Clip; el sistema no guarda la tarjeta | [VISTO en 26] |
| Solicitar factura (RFC, razón social, CP, régimen, uso) | 26 | — | datos fiscales | liga de reserva | [VISTO en 26] |
| Confirmar, reprogramar o cancelar su cita | 27 | su cita (servicio, podólogo, sede, fecha, anticipo) | estado de la cita y horario | liga con vencimiento ("liga vencida") | [VISTO en 27]; P-033, P-038 |
| Unirse a videoconsulta (probar equipo, firmar consentimiento de telemedicina) | 29 | su cita y nombre del podólogo | firma de consentimiento, grabación opcional | liga de sala | [VISTO en 29]; P-018 |
| Enviar fotos durante la videoconsulta | 09 (lado del podólogo) | — | foto "enviada por paciente" en fotos clínicas | liga de sala | [VISTO en 09]; mecanismo no mostrado |
| Responder encuesta NPS / satisfacción | 14, 16 (lado clínica) | — | respuesta | liga individual | [PROPUESTO]; P-054 |
| **No existe:** ver expediente, historial, facturas, pagos, mis datos | — | — | — | — | decidido: el paciente no accede al expediente en v1 |

## 7. Preguntas que condicionan esta matriz

P-130 · P-002 · P-135 · P-131 · P-129 · P-128 · P-121 · P-102 · P-125 · P-051 · P-119.
