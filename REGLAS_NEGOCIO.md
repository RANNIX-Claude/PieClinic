# REGLAS DE NEGOCIO — Pie Firme (Clínica de Podología · RANNIX)

> E3 cerrada **por defaults** el 2026-10-25 por autorización del dueño para poder construir sin esperar. Reemplaza la plantilla. Es el documento que define qué es **correcto**; los mockups solo muestran estados.
> **Criterio de elección** (en este orden): (1) lo dicho por el dueño (`REQUERIMIENTO.md`); (2) los formatos reales de Pie Clinic (`docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md`); (3) la opción RECOMENDADA de `PREGUNTAS_ABIERTAS.md`; (4) los mockups. Las contradicciones y qué corregir en cada mockup están en `docs/DECISIONES_CONTRADICCIONES.md`.
> **Marcas.** «CONFIRMADO POR EL DUEÑO» = ya estaba dicho por él en `REQUERIMIENTO.md` o fijado en el encargo de cierre de E3. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño» = default elegido por Claude; el dueño puede cambiarlo y la regla se actualiza en «Cambios a estas reglas». Una regla puede llevar las dos marcas (existencia confirmada, parámetros por defecto).
> **Nada aquí es asesoría legal, fiscal ni médica.** Las reglas fiscales (IVA, CFDI), laborales y de protección de datos requieren validación de contador/abogado antes de operar con datos reales (ver sección final «Lo que NO se puede inventar»).
> **Alcance de este archivo:** 149 reglas P-001…P-149 + 8 reglas N-01…N-08 = **157 reglas**. Cada una: enunciado operativo, opción elegida (A/B/C de `PREGUNTAS_ABIERTAS.md` o «propia» si se combinó) y marca.

**Confirmado por:** pendiente de firma del dueño (cierre por defaults, 2026-10-25) · Roberto Aguilar (RANNIX), dueño del producto.

---

## 0. Parámetros configurables por clínica (valor inicial)

Todo valor de esta tabla vive en la configuración de la clínica (o de la sede donde se indica), lo edita el **Administrador** y cada cambio queda en bitácora. Un cambio **no es retroactivo** (ver «Historia»). Valor inicial = el de la regla; todos son DECIDIDO POR DEFECTO salvo los marcados (C).

| Parámetro | Valor inicial | Nivel | Regla |
|---|---|---|---|
| Zona horaria | America/Mexico_City | sede | P-046 |
| Cancelación sin costo: horas de aviso | 48 h; mismo día = fuera de plazo | clínica | P-033 |
| Anticipo en reserva del portal | 30 % del precio; servicios «a valorar», curaciones incluidas y $0 sin anticipo | clínica (monto fijo por servicio opcional) | P-034 |
| Reprogramaciones sin costo por cita | 2 (con ≥ 48 h) | clínica | P-038 |
| Retención de horario durante el pago | 10 min | clínica | P-036 |
| Recordatorio de cita | 24 h antes (correo; SMS/WhatsApp cuando haya proveedor); 2.º aviso a 2 h apagado | clínica | P-039 |
| Tolerancia para marcar «No asistió» | 15 min después de la hora | sede | P-045 |
| Margen entre citas | 10 min | sede | P-043 |
| Sobrecupo | máx. 1 por podólogo y día; autoriza Administrador | clínica | P-042 |
| Lista de espera | ventana de 30 min por notificado; vence a los 14 días | clínica | P-041 |
| Entrada a videoconsulta | 10 min antes; tope 60 min por cita; no se graba | clínica | P-016, P-018 |
| Días sin cita para plan «abandonado» | 30 días | clínica | P-026 |
| Plazo meta de resolución de queja | 3 días | clínica | P-020 |
| Fotos clínicas por sesión | 10; 10 MB cada una; se comprime a ≤ 2048 px | clínica | P-007 |
| Paciente «inactivo» | 180 días sin cita atendida | clínica | P-052 |
| Descuento de Recepción sin PIN | hasta 10 %; mayor requiere PIN de Administrador; todo con motivo | clínica | P-055 |
| IVA por concepto | servicios clínicos: exento; productos: 16 %; precios con IVA incluido | concepto | P-056 |
| Tolerancia de diferencia en corte de caja | $50.00 MXN (mayor requiere Administrador) | sede | P-058 |
| Plazo para facturar un ticket | mismo mes calendario | clínica | P-064 |
| Vigencia de plan de láser / gift card | 12 meses; aviso 30 días antes | plan | P-070, P-073 |
| Anticipo de plantillas a medida | 50 %; estudio acreditable 30 días | clínica | P-075 |
| Monto de compra que exige autorización | $5,000.00 MXN | clínica | P-081 |
| Comprobante fiscal exigido en gasto desde | $2,000.00 MXN | clínica | P-093 |
| Semana de corte | sábado → viernes | clínica | P-088 |
| Meta de ocupación | 80 % | sede | P-097 |
| Gasto urgente de mantenimiento sin autorización previa | hasta $2,000.00 MXN | clínica | P-112 |
| Días de vacaciones (1.er año) | 12 | clínica | P-110 |
| Prueba gratuita / gracia por falta de pago | 14 días / 7 días | RANNIX | P-114 |
| Suscripción (C) | $400 MXN/mes por podólogo activo o $1,000 MXN/mes por clínica, más IVA; sin cobro dentro del sistema | RANNIX | P-113, P-117 |
| Cuota de almacenamiento por clínica | 25 GB (aviso al 80 %) | RANNIX | P-115 |
| Sesión web / bloqueo por intentos | 60 min / 3 intentos fallidos = bloqueo 15 min | clínica | P-119 |
| Umbral de confianza de IA en importación | 80 % (menor = revisión humana obligatoria) | clínica | P-123 |
| Retención de expediente y bitácora | 5 años desde la última atención | clínica | P-127 |
| Respaldo | diario; RPO 24 h; RTO 24 h | RANNIX | P-127 |
| Plazo de atención de solicitud ARCO | 20 días naturales | clínica | P-141 |
| Sedes de ejemplo (C) | Chalco, Centenario, Galerías, Patio, Sendero (Pie Clinic) | clínica | N-01 |
| Extracción de uña (C) | extracción + 4 curaciones diarias consecutivas | plantilla | P-028 |

---

## 1. Definiciones congeladas

| Término | Definición exacta |
|---|---|
| Clínica | Organización cliente del SaaS (tenant). Todo dato operativo pertenece a una sola clínica. |
| Sede | Local físico de una clínica con agenda, caja, inventario, fondo y serie de folios propios. |
| Paciente | Registro de una persona atendida por la clínica; **no inicia sesión** (C). |
| Perfiles con sesión | Podólogo, Recepción, Administrador (C). Personal de apoyo = empleado sin acceso (P-131). |
| Cita | Reserva de un servicio con recurso (podólogo, cabina). Estados: Por confirmar, Confirmada, En camino, No asistió, Cancelada, Atendida. |
| Cita atendida | Cita en estado Atendida, de cualquier tipo de atención (presencial, a distancia, domicilio) y de cualquier precio, incluidas las de $0 de un plan (P-098). |
| Atendió | Quien firma la nota o la fila de seguimiento (P-025). |
| Ingreso real | Dinero cobrado y registrado en el sistema por fecha de pago; «validado» es atributo de conciliación (P-090, P-091). |
| Paciente nuevo | Primera cita atendida en la clínica. |
| Paciente activo | No inactivo (P-052). |
| Ocupación | Minutos agendados y atendidos / minutos disponibles del recurso. |
| Ticket promedio | Ingreso real (servicios y productos) / citas atendidas con cobro; las de $0 no entran al divisor. |
| Plan de tratamiento | Serie de sesiones programadas con precio total, saldo y vigencia (P-026…P-029, P-070). |

## 2. Tiempo, cálculos y redondeos

- Zona horaria por sede (inicial America/Mexico_City). El día contable de una sede cierra con su corte de caja, no a las 00:00 (P-046).
- Cálculo por línea a 2 decimales, **redondeo comercial (≥ 0.005 sube)**; IVA sobre la base neta de cada línea; totales = suma de líneas (P-057). Precios de venta incluyen IVA.
- Un precio se congela al agendar, o al vender un plan/paquete; lo ya cobrado no se recalcula (P-068).

## 3. Historia (cuando una regla cambia)

Se **congela lo ya emitido**: tickets, CFDI timbrados, comisiones de periodos cerrados, precios de citas ya agendadas y planes ya vendidos, firmas con la versión del texto aceptado. Un cambio de parámetro aplica a lo nuevo. Un periodo cerrado es de solo lectura; los ajustes se registran en el siguiente periodo con referencia (P-099, P-108).

---

## A. Clínico

**P-001 · Nota firmada** — Una nota de evolución firmada queda bloqueada; solo se agrega **nota aclaratoria** con fecha, hora, autor y firma; la original siempre visible. Antes de firmar sí se edita libremente. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-002 · Visibilidad entre sedes y podólogos** — Todo podólogo ve el expediente de cualquier paciente de su **clínica**; cada apertura queda en bitácora; si la sede del paciente es distinta a la del usuario, se notifica al Administrador. Datos de VIH restringidos (N-04). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-003 · Campos obligatorios del alta** — Obligatorios: nombre, apellido paterno, fecha de nacimiento, celular, sede de registro, aviso de privacidad firmado y consentimiento de tratamiento de datos. Todo lo demás es opcional pero **existe como campo** (el 100 % del formato real de Pie Clinic se puede registrar). Alta rápida desde cita/portal: nombre + celular, y el resto se exige antes de la primera consulta clínica. Elegida: A + B para alta rápida (propia). «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-004 · Atender sin firma de aviso** — Se puede atender en urgencia; la consulta queda «firma pendiente» y **no puede cerrarse** sin firma; la excepción la autoriza el Administrador y queda en bitácora. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-005 · Menores y quien no puede firmar** — Menor de 18 años: el tutor se guarda como contacto ligado (nombre completo, parentesco, tipo y folio de identificación, firma). A los 18 años se pide nueva firma del propio paciente en su siguiente visita. Adulto que no puede firmar: firma su representante con la misma captura y se anota el motivo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-006 · Paciente duplicado** — Coincidencia por **nombre completo + fecha de nacimiento** bloquea el alta con aviso «posible duplicado» (abrir existente / no es la misma persona); el teléfono compartido solo avisa. Combinar expedientes: solo Administrador, con bitácora y posibilidad de deshacer durante 30 días. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-007 · Fotos clínicas** — Máximo 10 fotos por sesión (límite blando: la 11.ª requiere confirmar), 10 MB por foto de origen, compresión automática a ≤ 2048 px de lado largo; la cuota total es la de la clínica (P-115). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-008 · Eliminar foto** — Nunca se borra: se marca «retirada» con motivo, autor y fecha y deja de mostrarse salvo a Administración. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-009 · Fotos para docencia/difusión** — Solo con autorización escrita vigente (nivel «docencia» aparte del nivel «clínico») y siempre con rostro e identificadores difuminados; si el paciente revoca, se ocultan. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-010 · Pie diabético: criterios** — Puntaje SINBAD (suma 0–6) y escala Wagner (0–5) son campos de captura; la **categoría de riesgo y la frecuencia de revisión** se muestran como sugerencia editable, **apagada** hasta que un podólogo asesor valide y versione los criterios. Nunca es diagnóstico. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-011 · Índice tobillo-brazo** — Opcional; sin equipo se marca «no evaluado» (jamás 0); el riesgo se calcula con lo disponible. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-012 · Alertas clínicas** — Solo alertas derivadas de datos capturados (alergias, diabetes, anticoagulantes, revisión vencida, plan pendiente); sin motor de interacciones. Rotuladas «apoyo, no diagnóstico». Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-013 · Plantillas ortopédicas** — Fabricación por **laboratorio externo** como proveedor del catálogo; entrega 15 días hábiles y garantía 6 meses como valores iniciales editables por clínica; estados: borrador, enviada, recibida, entregada. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-014 · Dictado por voz** — Permitido (alcance de la visión completa) mediante adaptador de IA **sin llave real** hasta que el dueño la entregue. El audio se borra al confirmar la transcripción (máx. 24 h si no se confirma); se conserva solo el texto aceptado por el podólogo y el registro del dictado en bitácora. «Diagnóstico NO propuesto». Elegida: A. «CONFIRMADO POR EL DUEÑO» (existencia) · parámetros: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-015 · Consentimiento para dictado/IA** — Consentimiento específico, firmado, revocable; sin él no se habilita el dictado en esa consulta. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-016 · Videoconsulta: proveedor y grabación** — Adaptador de video sin proveedor fijado (propuesta no verificada: Daily.co o Jitsi/JaaS). **No se graba**; solo si el paciente lo autoriza por escrito, con retención de 30 días; tope 60 min por cita; sin límite por plan. Elegida: A. «CONFIRMADO POR EL DUEÑO» (la videoconsulta entra) · parámetros: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-017 · Servicios a distancia** — Atributo por servicio «admite videoconsulta»; al inicio solo valoración y seguimiento, con precio propio (inicial $300.00 MXN, editable). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-018 · Entrada a la sala** — Liga activa 10 min antes (configurable); sin consentimiento de telemedicina firmado no se entra; pago pendiente avisa al podólogo pero no bloquea; liga de un solo uso por cita. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-019 · Dónde se firman los consentimientos** — Aviso de privacidad: al reservar o en el alta. Consentimiento informado del procedimiento y de fotos: **en consulta**, en pantalla, por servicio que lo exija (campo del catálogo); se admite además papel escaneado como adjunto (N-05). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-020 · Quejas: quién y plazo** — Las ven y resuelven Administración y un responsable clínico asignado; el podólogo señalado solo es notificado; meta de resolución 3 días (configurable). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-021 · Qué es una queja** — Una sola entidad con tipo (administrativa / evento adverso clínico) y gravedad; cuentan solo las registradas manualmente; la encuesta con nota baja **no** crea queja automática. «Sesión ligada» es opcional salvo en eventos adversos clínicos. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-022 · Compensaciones** — Recepción o podólogo proponen; Administración autoriza siempre que haya costo (reembolso, descuento, consulta gratis). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-023 · Esterilización** — Lote «Liberado condicionado» mientras el indicador biológico está pendiente; «Liberado» solo con biológico negativo; positivo = lote «Bloqueado» y lista de pacientes atendidos con ese lote; kits por código/QR; un kit no se reutiliza sin nuevo ciclo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-024 · Formato de bitácora de esterilización** — Se conservan los campos del mockup 15 (temperatura, presión, tiempo, lote, responsable) hasta que el cliente entregue el formato oficial de su verificador. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-025 · Quién atendió** — Atendió = quien firma la nota; la cita guarda también el asignado y ambos se conservan si difieren. Coincide con la columna «Atendió» del formato real. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-026 · Plan abandonado** — Un plan queda «Abandonado» tras 30 días sin cita; se cierra y se cancelan las citas futuras; el anticipo no se reembolsa si la política de cancelación lo establece. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-027 · Plantillas de plan** — RANNIX provee plantillas base que se copian a cada clínica y esta las edita libremente; los cambios no afectan planes ya vendidos. Las curaciones incluidas en un plan se registran a $0. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-028 · Plan de extracción de uña** — Extracción + **4 curaciones diarias consecutivas** (días 1 a 4 posteriores), curaciones de 15 min, incluidas a $0, hasta cicatrización adecuada (texto del consentimiento real). Si un día no abre la sede, la curación pasa al siguiente día hábil y queda «atrasada». Reemplaza «3 citas». Elegida: propia (formato real). «CONFIRMADO POR EL DUEÑO» (fijado en el encargo; formato real de Pie Clinic) · interpretación de cobro y lugar: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño» (ver N-03)

**P-029 · Ventana de sesiones** — La ventana (p. ej. láser 30–35 días) es recomendación: cualquier cita posterior cuenta como la siguiente sesión; fuera de ventana solo marca «atrasada». Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-030 · Antecedentes por consulta** — Cada consulta guarda una **instantánea** de los antecedentes capturados; la ficha vigente se actualiza aparte. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-031 · Catálogo de diagnósticos** — Diagnóstico principal = lista corta del formato real (onicomicosis, papiloma plantar, pie de atleta, micosis, hiperqueratosis, otros con texto). CIE-10 es catálogo global de RANNIX, solo lectura, **opcional**, con favoritos por clínica; procedimientos propios por clínica. Elegida: A + formato real. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-032 · Alergia que choca** — Solo aviso visible y registro de que el podólogo lo vio; nunca bloquea. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## B. Agenda, reservas, portal y seguimiento

**P-033 · Cancelación** — Parámetro por clínica: 48 h de aviso; fuera de plazo (incluido el mismo día) el anticipo no es reembolsable. Las curaciones incluidas de un plan ($0, sin anticipo) no tienen penalización económica, solo marca de inasistencia. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-034 · Anticipo** — En reservas del portal: 30 % del precio de lista (monto fijo por servicio opcional); servicios «a valorar», curaciones incluidas y servicios de $0 no piden anticipo; en recepción el anticipo no es obligatorio. El pago del anticipo se hace con Clip (único uso de Clip en esta fase). Elegida: A. «CONFIRMADO POR EL DUEÑO» (Clip para anticipos) · porcentaje y alcance: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-035 · Reembolso del anticipo** — Cancelación con ≥ 48 h: reembolso del anticipo solicitado desde el sistema vía Clip, plazo informado al paciente 5 a 10 días hábiles; la comisión de Clip no se devuelve y la absorbe la clínica. Mientras no exista Clip real, el reembolso se registra manual. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-036 · Retención de horario** — 10 minutos configurables mientras el paciente paga; al vencer se libera; recepción lo ve como «retenido». Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-037 · Concurrencia** — La primera confirmación gana; la segunda recibe aviso y horarios cercanos; no hay empalme del mismo recurso (podólogo o cabina) salvo sobrecupo autorizado (P-042). Elegida: A. «CONFIRMADO POR EL DUEÑO» («agenda sin duplicados» no puede fallar) · mecánica: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-038 · Reprogramar** — Hasta 2 reprogramaciones sin costo con ≥ 48 h de aviso; con menos cuenta como cancelación. Reprogramar conserva el anticipo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-039 · Recordatorios** — Un recordatorio a las 24 h (configurable) con liga de confirmación; segundo aviso (2 h) opcional, apagado. Canal inicial: correo; SMS y WhatsApp se activan por clínica cuando exista proveedor y credenciales (no se asumen). La liga de videoconsulta sigue P-018. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-040 · WhatsApp** — Un proveedor de la API oficial, **un número por sede** para atribuir reservas a sede; costo repercutido a la clínica; el 55 1412 0283 **no se asume WhatsApp** hasta confirmarlo. Sin proveedor: enlace «wa.me» informativo. Elegida: A. «CONFIRMADO POR EL DUEÑO» (reserva por WhatsApp atribuida a sede) · proveedor y costo: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-041 · Lista de espera** — Prioridad (Alta/Media/Baja) la asigna Recepción con criterio clínico del podólogo; al liberarse un hueco se notifica al primero con ventana de 30 min y luego pasa al siguiente; cada entrada vence a los 14 días. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-042 · Sobrecupo** — Autoriza el Administrador; máximo 1 por podólogo y día (configurable); queda registro. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-043 · Duración y margen** — Duración por servicio (editable por cita); margen de 10 min entre citas por sede. Duraciones semilla: quiropodia 30 min, uña encarnada 40, curación 15, extracción 60, valoración de pie de riesgo 45. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-044 · Visita a domicilio** — Servicio con zona y recargo configurables; el traslado bloquea la agenda del podólogo (30 min ida y 30 vuelta como valor inicial por zona); dirección y viáticos se capturan en la cita. Elegida: A. «CONFIRMADO POR EL DUEÑO» (visita a domicilio entra) · parámetros: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-045 · Estados de la cita** — «Atendida» cuando se firma la nota (o fila de seguimiento); «No asistió» lo marca Recepción manualmente tras 15 min de tolerancia; el cobro no cambia el estado (si hay cobro sin nota en 24 h, alerta). Todo cambio en bitácora; revertir solo Administrador. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-046 · Zona horaria y corte del día** — Zona por sede (inicial Ciudad de México); el día contable cierra con el corte de caja de la sede. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-047 · Horarios, festivos, vacaciones** — Las vacaciones autorizadas y bloqueos bloquean la agenda del podólogo y listan las citas afectadas para reprogramar; festivos se capturan por clínica. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-048 · «Cualquiera disponible»** — Asigna el primer horario libre; desempate por menor carga del día. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-049 · Ligas del portal** — Token largo de un solo uso por cita con vencimiento a la hora de la cita; máximo 3 reservas futuras activas por celular o correo; limitación de tasa en servidor; antibots con proveedor por definir (sin llave real todavía). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-050 · PWA** — PWA instalable (C). La usan Podólogo y Recepción; sin conexión solo agenda del día y datos mínimos del paciente (nunca fotos ni notas completas), con borrado al cerrar sesión. Elegida: A. «CONFIRMADO POR EL DUEÑO» (PWA) · roles y offline: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-051 · Corregir citas** — Una cita nunca se borra: se cancela con motivo. Las ya atendidas solo las corrige Administración, con bitácora. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-052 · Inactivo y revisión vencida** — «Inactivo» = 180 días sin cita atendida (parámetro); «activo» = no inactivo. Cada servicio declara su intervalo de revisión (quiropodia 4–6 semanas, láser 30–35 días, pie diabético 1–3 meses); «revisión vencida» = pasado ese intervalo sin cita. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-053 · Campañas** — Solo Administración crea y aprueba texto y descuento; solo se envía a quien tiene consentimiento de comunicaciones comerciales vigente (P-148). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-054 · Encuestas y NPS** — Encuesta 24 h después de una cita atendida, máx. 1 por paciente cada 90 días; NPS estándar (0–10); calificación ≤ 6 avisa a Administración sin crear queja. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## C. Ventas y facturación

**P-055 · Descuentos** — Recepción puede dar hasta 10 % por línea o global; arriba pide PIN de Administrador; todo descuento exige motivo y queda en bitácora. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-056 · IVA** — Atributo de IVA por concepto del catálogo (exento / 16 % / tasa 0). Inicial: servicios clínicos exentos, productos 16 %; **precios de venta con IVA incluido**. Se valida con el contador de la clínica antes de timbrar con datos reales. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-057 · Redondeos** — Por línea a 2 decimales, redondeo comercial; IVA sobre la base neta de cada línea; totales = suma de líneas; el ticket y el CFDI deben dar el mismo total. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-058 · Turnos y cierre** — Un turno por caja y cajero (configurable); diferencia de hasta $50.00 MXN la justifica el cajero; mayor requiere Administrador. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-059 · Corte de caja** — Se separan: venta (devengada), cobro del turno (dinero recibido) y anticipos aplicados (no son dinero del turno). Efectivo a depositar = fondo + efectivo − retiros − cancelaciones en efectivo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-060 · Cancelar o reimprimir ticket** — Recepción cancela en el mismo turno; después, solo Administración con motivo; un ticket cancelado jamás se borra; la reimpresión sale marcada «copia». La cancelación revierte inventario y comisiones y exige cancelar o acreditar el CFDI. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-061 · Facturación CFDI (PAC)** — Facturación CFDI **integrada** (C) con timbrado por un adaptador de PAC **sin llave real todavía**. Cada clínica sube su CSD (guardado cifrado, nunca en el fuente); claves SAT configurables por concepto. Elegida: A. «CONFIRMADO POR EL DUEÑO» (CFDI integrada, adaptador PAC) · modelo de certificados y claves: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-062 · Anticipos y CFDI** — El anticipo se registra como cobro ligado a la cita y se aplica a la venta; el sistema permite relacionar el CFDI pero **no emite CFDI de anticipo automático** hasta que el contador defina la regla. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-063 · Cancelar CFDI** — Solo Administración, con motivo SAT (01–04) y comentario interno; los estados siguen al SAT (vigente, en proceso, cancelada). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-064 · Plazo para facturar** — Un ticket se factura hasta el cierre del mismo mes calendario (parámetro); factura a público en general permitida; factura global mensual de lo no solicitado se genera como **borrador** para revisión del contador (no se timbra sola). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-065 · Notas de crédito y devoluciones** — Solo Administración, con motivo, relacionando el CFDI original; si se devuelve dinero, sale de caja con registro de retiro. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-066 · Datos fiscales del paciente** — Los datos de un CFDI timbrado se congelan en el comprobante; el perfil puede cambiar para los siguientes; la facturación automática solo con consentimiento y datos validados. Opcionales en el alta (el dueño pide registrarlos). Elegida: A. «CONFIRMADO POR EL DUEÑO» (datos fiscales registrados) · reglas de cambio: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-067 · Tarifas por visita o perfil** — Un precio por servicio (con precio por sucursal) y excepciones por plan o promoción; sin tarifas por perfil ni escalonadas. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-068 · Cambio de precio** — El precio se congela al agendar o al vender un plan/paquete; lo ya emitido no cambia; la nueva vigencia aplica a lo nuevo. Se conserva el histórico con vigencia, sucursal y quién lo cambió. Elegida: A. «CONFIRMADO POR EL DUEÑO» (histórico de precios con vigencia) · congelamiento: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-069 · Precios del catálogo** — Los precios de los mockups son ilustrativos. El catálogo real lo aporta el cliente; las clínicas reales empiezan **vacías**; los entornos de prueba se siembran con datos sintéticos de `docs/INVESTIGACION_PODOLOGIA.md` §4.2 (quiropodia $400, uña encarnada $530, extracción de uña $800 con 4 curaciones incluidas, estudio de pisada $1,200, plantillas $2,500), marcados «sintético». Elegida: A (producción) + semilla de investigación (pruebas). «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-070 · Planes caducados** — Al caducar (12 meses para láser) se pierden las sesiones sin usar, sin reembolso, con aviso 30 días antes; reprogramar no consume sesión. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-071 · Planes en otra sede** — Cada sesión se reconoce en la sede y con el podólogo que la atiende, valuada al precio prorrateado del plan (precio total / sesiones). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-072 · Anualidad/membresía** — Cada clínica configura nombre y beneficios; RANNIX no impone ninguna. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-073 · Gift cards** — La venta registra pasivo; el ingreso se reconoce al canjear; caducidad 12 meses (a validar con abogado); usables en todas las sedes; no se combinan con promociones. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-074 · Promociones** — Una sola promoción por línea; las de paquete tienen prioridad; los usos se cuentan por clínica; vigencia y límite de usos obligatorios. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-075 · Plantillas a medida: anticipo** — Anticipo 50 % configurable al ordenar; el estudio de pisada se acredita al comprar las plantillas dentro de 30 días. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-076 · Crédito** — Solo saldos por servicios ya prestados o apartados; sin convenios con empresas o aseguradoras en esta fase. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-077 · Comisión de Clip/terminal** — Gasto de la clínica; no se descuenta al podólogo; el cobro se registra bruto. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-078 · Quién cobra y quién vende** — Siempre cobra caja; cada línea del ticket registra quién atendió/vendió para comisión; el podólogo usa «Enviar a caja». Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## D. Inventario y compras

**P-079 · Lote, caducidad e insumos** — Lote y caducidad solo donde el producto lo declare; los insumos clínicos se descuentan por lo que el podólogo captura en la consulta (sin receta de consumo automática). Inventario **por sucursal** (C): «¿qué producto hay en cada tienda?». Elegida: A. «CONFIRMADO POR EL DUEÑO» (inventario por sucursal) · lote/insumos: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-080 · Traspasos** — Estados: Borrador, Enviado (en tránsito), Recibido completo, Recibido con diferencias, Cancelado. Recibe el responsable de la sede destino; las diferencias se registran como merma o reclamación con motivo; valuado a costo promedio, sin facturación interna. El envío descuenta del origen y la recepción suma al destino. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-081 · Compras** — Orden de compra de más de $5,000.00 MXN requiere autorización de Administración; la cuenta por pagar nace al registrar la factura del proveedor contra una recepción; recepción parcial permitida. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-082 · Proveedores** — Un catálogo de proveedores por clínica con todas las categorías (incluye mantenimiento y equipo) y creación rápida desde gastos. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-083 · Costo promedio** — Costo promedio ponderado por clínica, recalculado en cada entrada; mermas y devoluciones se valúan al costo del momento. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-084 · Mínimos** — Mínimo por producto y sede, lo captura Administración; «bajo mínimo» = existencia < mínimo; «en el mínimo» = existencia = mínimo; «sugerir» completa hasta un máximo configurable. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-085 · Venta sin existencia** — Se permite con aviso y marca «existencia negativa» que Administración regulariza con conteo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-086 · Conteos y mermas** — Cualquiera con permiso de inventario captura; el ajuste lo autoriza Administración; bitácora. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-087 · Plantillas a medida e inventario** — Orden por encargo, sin inventario; el costo es el del laboratorio al recibir. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## E. Finanzas e indicadores

**P-088 · Semana de corte** — Sábado → viernes (como IRP), configurable; cierre por Administración; reapertura solo con bitácora. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-089 · Ingreso «Observado»** — Solo se marca y alerta; no bloquea el corte; valida Administración. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-090 · Ingreso real** — Real = cobrado y registrado; «validado» es atributo de conciliación y no cambia el monto; las **comisiones se pagan solo sobre lo validado**. En el EDR `real_*` es automático y `proy_*` es manual (C): el código nunca pisa `proy_*`. Elegida: A. «CONFIRMADO POR EL DUEÑO» (proy_ manual / real_ automático) · definición de real: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-091 · Reconocimiento del ingreso** — Base cobrado (fecha de pago) para EDR e ingresos; reporte aparte «servicios prestados» por fecha de atención. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-092 · EDR por sede** — Proyección por concepto, mes y sede; gastos compartidos se asignan por regla configurable (inicial: proporción de ingresos); IVA se muestra aparte; la suscripción de RANNIX es gasto del mes, no prorrateada a 12 meses. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-093 · Gastos** — Métodos: efectivo (fondo), tarjeta de la clínica, transferencia y «pagado por empleado» (a reembolsar); comprobante fiscal exigido desde $2,000.00 MXN. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-094 · Conciliación** — Una cuenta por sede o general según la clínica; CSV genérico con mapeo configurable; liquidaciones de Clip conciliadas por lote. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-095 · Fondo revolvente** — Un fondo por sede con monto base propio; reposición autorizada por Administración; las comisiones bancarias no son parte del fondo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-096 · Pago a proveedores** — Administración autoriza y registra el pago con cuenta y referencia; el pago se concilia con el banco. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-097 · Metas** — Editables por Administración por sede y, opcionalmente, por podólogo y periodo; meta de ocupación inicial 80 %. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-098 · Glosario de indicadores** — Cita atendida = estado Atendida (cualquier tipo de atención, incluidas las de $0); ocupación = minutos atendidos y agendados / minutos disponibles; paciente nuevo = primera cita atendida en la clínica; ticket promedio = ingreso real / citas atendidas con cobro; «facturas timbradas» y «cobros con CFDI» son métricas distintas. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-099 · Cierres de periodo** — Periodo cerrado = solo lectura; ajustes en el siguiente periodo con referencia; reapertura solo Administración con bitácora. Aplica a semana, comisiones y nómina. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-100 · Impuestos en el EDR** — Se muestra utilidad gerencial rotulada «sin impuestos»; reportes fiscales aparte con el contador; sin ISR estimado. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-101 · Renglones del EDR** — Cada servicio y producto declara su renglón de EDR; las plantillas a medida son **producto por encargo** con renglón propio «Plantillas ortopédicas»; el reporte «ingreso por servicio» usa el catálogo (p. ej. extracción de uña aparte de uña encarnada) y el EDR agrupa por renglón. Elegida: A. «CONFIRMADO POR EL DUEÑO» (reporte de ingreso por servicio) · agrupación: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-102 · Dashboard por rol** — Podólogo: su propia producción y agenda; Recepción: operación de su sede sin finanzas; Administración: todo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## F. RH, comisiones y mantenimiento

**P-103 · Figura del podólogo** — Se soportan ambas por persona (nómina u honorarios/RESICO); la clínica elige. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-104 · Nómina** — Solo prenómina y exportación para el contador; sin timbrado de nómina en esta fase. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-105 · Asistencia** — Importación de archivo del checador existente; marcación en la PWA queda para después. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-106 · Esquema de comisión** — Configurable por podólogo con % por tipo (servicio, producto, plan) y opcional viático o piso; no hay % por defecto: lo fija el cliente. Elegida: A. «CONFIRMADO POR EL DUEÑO» (comisiones por podólogo) · esquema: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-107 · Base de comisión** — Importe cobrado sin IVA, neto de descuentos y reembolsos; pagadera solo sobre lo validado (P-090); planes se comisionan por sesión atendida al podólogo que atiende. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-108 · Cambios de esquema** — La comisión se calcula con el esquema vigente en la fecha del servicio y no se recalcula; ajustes por cancelaciones posteriores al cierre van al siguiente periodo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-109 · Podólogo en varias sedes** — Ingreso a la sede donde se atendió la cita; nómina a la sede de contrato; comisión por cita. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-110 · Vacaciones e incidencias** — Parámetros por clínica: días de derecho (inicial 12 el primer año), qué incidencia descuenta (retardo no; permiso sin goce sí; incapacidad según ley). Validar con asesoría laboral. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-111 · Privacidad de sueldos** — Administración ve todo; cada empleado solo su propio recibo; CLABE enmascarada salvo para quien paga. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-112 · Órdenes de mantenimiento** — Estados: Solicitado, Autorizado, En proceso, Cerrado, Rechazado; autoriza Administración; urgentes hasta $2,000.00 MXN pueden atenderse antes de aprobar y se regularizan. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## G. Plataforma, suscripción, accesos, IA y datos

**P-113 · Cobro de la suscripción** — Planes (C): $400 MXN/mes por podólogo activo o $1,000 MXN/mes por clínica, el cliente elige. **En esta fase el cobro NO ocurre dentro del sistema**: RANNIX lleva plan, periodo y estado manual (al corriente / vencida) por clínica; **Clip se usa solo para anticipos de citas**. Sustituye «cobro automático» de la visión completa. Elegida: propia (A en espíritu: sin recurrencia verificada). «CONFIRMADO POR EL DUEÑO» (fijado en el encargo de cierre)

**P-114 · Prueba, falta de pago, cancelación** — Prueba de 14 días sin tarjeta; si la suscripción queda vencida, gracia de 7 días y luego acceso de solo lectura y exportación (lo ejecuta RANNIX manualmente); los datos se conservan según P-127. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-115 · Topes del plan por clínica** — Sin tope de podólogos ni sedes; cuota de almacenamiento 25 GB con aviso al 80 % y cuota de IA definidas por RANNIX. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-116 · Podólogo activo** — Cuenta como activo si tuvo acceso o agenda en el mes; el cambio de plan surte efecto en el siguiente periodo, sin prorrateo; un podólogo en dos clínicas cuenta en cada una. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-117 · IVA de la suscripción** — Los $400 y $1,000 llevan IVA aparte (16 %: $464.00 y $1,160.00 MXN); RANNIX emite CFDI mensual a cada clínica cuando tenga sus propias credenciales de timbrado; MRR = suma de planes vigentes. Elegida: A. «CONFIRMADO POR EL DUEÑO» (montos) · IVA aparte: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-118 · Nombre y contacto** — Nombre público «Pie Firme» y dominio `piefirme.rannix.com` (C, inferido del dominio); correo de contacto y si 55 1412 0283 es WhatsApp quedan **pendientes**: se configuran, no se inventan. Elegida: A. «CONFIRMADO POR EL DUEÑO» (dominio) · nombre y contacto: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-119 · Acceso** — Pantalla única; la clínica se deduce del usuario (una cuenta pertenece a una sola clínica); 2FA obligatorio para Administración y opcional para el resto; recuperación por correo; sesión de 60 min; 3 intentos fallidos bloquean 15 min. Alta de usuario por invitación de un solo uso (el administrador no teclea contraseñas ajenas). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-120 · Google** — Opcional por clínica, apagado por defecto, solo para correos ya dados de alta por Administración. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-121 · Soporte RANNIX** — Sin suplantación; soporte ve solo metadatos; para ayudar, la clínica otorga acceso temporal con motivo y bitácora visible para ella. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-122 · Importación: lotes y reversa** — Importación con IA (C): sube un archivo en cualquier formato, la IA propone el mapeo, un Administrador revisa y confirma, vista previa con errores y duplicados, nada se guarda sin confirmar. Cada carga es un lote con identificador; se puede deshacer un lote completo si no se ha modificado después. Elegida: A. «CONFIRMADO POR EL DUEÑO» (flujo con revisión humana) · reversa de lote: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-123 · Importación: duplicados y conflictos** — Duplicados según P-006; campos clínicos (alergias, diagnósticos) con confianza < 80 % siempre a revisión humana y marcados «importado» con su origen; en conflicto gana el dato existente. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-124 · Proveedor de IA** — Un proveedor único elegido por RANNIX con contrato de encargo y sin entrenamiento con datos del cliente; **adaptador sin llave real todavía** (importación, dictado, asistente, lectura de comprobantes); costo incluido en el plan con tope. Elegida: A. «CONFIRMADO POR EL DUEÑO» (IA con adaptador) · proveedor y tope: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-125 · Datos del asistente de IA** — Solo vistas administrativas agregadas y consultas sin identificar paciente; las preguntas con paciente exigen permiso de expediente y dejan bitácora; aislado por clínica. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-126 · Lectura de comprobantes** — Siempre revisión humana antes de guardar; la IA solo precarga; ilegible = captura manual. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-127 · Retención y respaldo** — Expediente y bitácora ≥ 5 años desde la última atención; fotos con el expediente; audio según P-014; video no se graba; respaldo diario con restauración probada (RPO 24 h, RTO 24 h). Elegida: A. «CONFIRMADO POR EL DUEÑO» (respaldo y bitácora no pueden fallar) · plazos: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-128 · Aislamiento entre clínicas** — Todo dato operativo pertenece a una sola clínica (RLS); la misma persona en dos clínicas son dos registros; catálogos de referencia globales (CIE-10, plantillas base) solo lectura; RANNIX solo ve metadatos de uso y facturación. Elegida: A. «CONFIRMADO POR EL DUEÑO» (privacidad entre clínicas) · detalles: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-129 · Clínica vs sede** — Paciente y expediente pertenecen a la **clínica**, con «sede de registro» como atributo; agenda, caja, inventario y fondo son por sede. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-130 · Matriz de permisos** — Rige `MATRIZ_ROLES.md` con las correcciones de C-08 (`docs/DECISIONES_CONTRADICCIONES.md`): Recepción sin finanzas consolidadas, nómina ni comisiones ajenas; con caja, tickets, facturación de sus tickets y catálogo/precios en lectura. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-131 · Personal sin rol** — Tres perfiles con sesión; personal de apoyo se modela como empleado sin acceso o usuario con rol Recepción. Elegida: A. «CONFIRMADO POR EL DUEÑO» (3 perfiles) · apoyo: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-132 · Datos de ejemplo** — Un único set sintético coherente (5 sedes de Pie Clinic, podólogos, pacientes, folios) rotulado «sintético»; nunca se mezcla con datos reales. Elegida: A. «CONFIRMADO POR EL DUEÑO» (datos sintéticos) · composición: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-133 · Folios** — Prefijo por sede + consecutivo; serie fiscal separada por clínica; **los folios nunca se reutilizan ni reinician**. Formato: `{SEDE}-{TIPO}-{NNNNNN}` con SEDE = CHA, CEN, GAL, PAT, SEN (en el ejemplo), TIPO = EXP, CIT, CON, TKT, TRA, OC. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-134 · Portal público** — Una dirección por clínica `piefirme.rannix.com/c/{clínica}`, sin cuenta del paciente; servicios, sedes y podólogos con casilla «visible en portal». Elegida: A. «CONFIRMADO POR EL DUEÑO» (portal por clínica sin cuenta) · dirección y publicación: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-135 · Alcance del Administrador** — El Administrador tiene lista de sedes asignadas (todas o algunas); las finanzas consolidadas solo para quien tiene todas. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## H. Legal y cumplimiento

**P-136 · NOM-004** — El contenido mínimo se congela según la investigación (historia clínica, nota de evolución con fecha, hora, nombre y firma, conservación 5 años); queda **pendiente de revisión legal** antes de operar con pacientes reales. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-137 · NOM-024** — No se consultó; **no se declara cumplimiento ni certificación**. Se consulta antes de la primera clínica real y se registra lo que aplique. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-138 · Responsable y encargado** — Cada clínica es responsable; RANNIX es encargado con contrato de encargo y entrega un texto base revisado por abogado que la clínica adopta. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-139 · Textos legales** — Aviso, consentimientos y términos se versionan; con cada firma se guarda la versión aceptada. Los textos finales los redacta un abogado (los de Pie Clinic sirven como base, N-06). Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-140 · Aviso nuevo** — Se conserva la firma anterior; si la nueva versión cambia finalidades se pide nueva firma en la siguiente visita. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-141 · Solicitudes ARCO** — Flujo con estados (recibida, en proceso, atendida, rechazada) y plazo de 20 días naturales, atendido por Administración de la clínica; «cancelación» = bloqueo del expediente, no borrado, durante la conservación obligatoria. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-142 · Firma en pantalla** — Se guarda imagen de firma, fecha-hora, IP, dispositivo y huella (hash) del documento firmado; su valor probatorio se valida con abogado. Elegida: A. «CONFIRMADO POR EL DUEÑO» (firma en pantalla, NOM-004) · evidencia: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-143 · Terceros** — Lista cerrada de terceros publicada en el aviso (Clip, proveedor de video, IA, WhatsApp, PAC, correo); solo datos mínimos; nunca notas clínicas por WhatsApp o correo. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-144 · Residencia de datos** — Se declara región y proveedor de la base de datos y de los respaldos en el aviso; se documenta al provisionar. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-145 · Recetas** — Catálogo de medicamentos configurable por la clínica con advertencia; RANNIX no restringe ni valida; revisión legal pendiente. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-146 · Cédula profesional** — Obligatoria para el rol Podólogo para poder firmar notas; captura manual con verificación por Administración. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-147 · Telemedicina** — La función existe, pero se mantiene **apagada en producción** hasta que un abogado revise el consentimiento de telemedicina. Elegida: A. «CONFIRMADO POR EL DUEÑO» (telemedicina entra) · activación: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-148 · Comunicaciones comerciales** — Consentimientos separados (recordatorios de cita vs promociones/encuestas) con baja en cada mensaje. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**P-149 · Licencias y responsable sanitario** — Datos de licencia y responsable sanitario en la configuración de la clínica, solo informativos. Elegida: A. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## N. Formatos reales de Pie Clinic

**N-01 · Cliente piloto y sedes** — Pie Clinic es el cliente real **probable**, no confirmado. Las 5 sedes del formato (Chalco, Centenario, Galerías, Patio, Sendero) son las sedes de ejemplo y de la semilla. Número de podólogos y pacientes: se desconoce; no se inventa. Direcciones y horarios reales: pendientes. «CONFIRMADO POR EL DUEÑO» (sedes de ejemplo) · confirmación del piloto: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-02 · Reverso y otros formatos** — Se implementan las 5 siluetas de miembro inferior (genu valgum, varum, normal, recurvatum, flexum, por pierna D/I) y campos opcionales para lo entrevisto en el reverso (rotación, talalgias, tipo de pie normal/varo, huella plantar) marcados «por validar con el formato completo». Se pide la foto del reverso y otros formatos (receta, plantillas, cobro). «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-03 · Curaciones de uña** — 4 curaciones diarias consecutivas dadas por la clínica en cita presencial de 15 min, incluidas a $0 en el precio de la extracción (plantilla editable por clínica; puede cambiarse a «hechas en casa» o cobrarse). «CONFIRMADO POR EL DUEÑO» (4 diarias consecutivas, formato real) · quién las da y si se cobran: «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-04 · Datos muy sensibles (VIH)** — El dato de VIH solo lo ven y editan el podólogo tratante, otros podólogos de la clínica con motivo registrado y Administración; Recepción no lo ve; cada lectura va a bitácora; aparece en la historia impresa solo cuando la imprime un podólogo o Administración. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-05 · Firma en papel o digital** — Ambas: firma en pantalla con evidencia (P-142) y opción de adjuntar el papel firmado escaneado; el papel escaneado se conserva como adjunto del expediente. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-06 · Texto del consentimiento** — Plantilla editable por clínica con versión; el texto de Pie Clinic (alcance autorizado y declaraciones del formato real) es la plantilla base inicial, pendiente de validación de abogado (P-139). Cada clínica sube su logo y nombre del impreso. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-07 · Migración del expediente en papel** — Entra por el módulo de importación (foto/escaneo → IA propone → Administrador confirma, P-122) con adaptador de IA sin llave; volumen desconocido. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

**N-08 · Número de expediente** — Consecutivo por sede con prefijo (P-133), un solo expediente por paciente en la clínica (no uno por sede); al migrar se **conserva el número vigente** capturándolo a mano. «DECIDIDO POR DEFECTO 2026-10-25, revisable por el dueño»

---

## Impresos de la historia (formato real)

Se generan tres impresos con el diseño del papel y los datos ya llenos: consentimiento informado, antecedentes personales (con sede y N.º de expediente) y seguimiento clínico (diagnóstico sobre las 4 vistas del pie, tratamiento y tabla Fecha · Atendió · Servicio · Observaciones · Próx. visita, con páginas extra). Más «Imprimir historia completa» (PDF), formato en blanco e «Imprimir solo seguimiento». Cada impresión queda en bitácora (quién, cuándo, qué) y el PDF lleva la versión del expediente. Fuente: `docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md` (C). Las fotos de `docs/formatos_reales` no se copian ni usan fuera del análisis ya escrito.

## Autoridad (resumen)

| Acción | Quién | ¿Bitácora? |
|---|---|---|
| Nota aclaratoria sobre nota firmada | Podólogo autor | Sí |
| Combinar expedientes / corregir cita atendida / revertir «No asistió» / cancelar ticket de turno cerrado / cancelar CFDI / notas de crédito / reabrir periodo / autorizar ajuste de inventario | Administrador | Sí |
| Descuento > 10 % | PIN de Administrador | Sí |
| Cancelar ticket en el mismo turno | Recepción | Sí |
| Sobrecupo, compra > $5,000, pago a proveedores, compensación con costo | Administrador | Sí |
| Alta de usuarios, parámetros de clínica | Administrador | Sí |

## Cambios a estas reglas

| Fecha | Qué cambió | Quién autorizó |
|---|---|---|
| 2026-10-25 | Versión inicial: E3 cerrada por defaults (157 reglas) | Dueño (autorización de cierre por defaults); defaults propuestos por Claude |

---

## Lo que NO se puede inventar

Estos puntos **requieren credenciales o datos reales**; el sistema los trata con adaptadores/configuración vacía y no se simulan en producción. Hasta que el dueño o el cliente los entregue, quedan en estado «no configurado».

| Qué | Qué falta exactamente | Dónde se usa |
|---|---|---|
| PAC (timbrado CFDI) | Proveedor elegido, contrato y credenciales de producción/pruebas del PAC | P-061 a P-066, P-117 |
| Datos fiscales reales | RFC, razón social, régimen fiscal, CP fiscal, certificados CSD (.cer/.key y contraseña) de cada clínica y de RANNIX; claves SAT y regla de IVA validadas por un contador | P-056, P-061, P-117 |
| Llave de IA | API key del proveedor, contrato de encargo y decisión de región; sin ella la importación, el dictado, el asistente y la lectura de comprobantes quedan en modo «no configurado» | P-014, P-122 a P-126, N-07 |
| Clip real | Cuenta comercial Clip, llaves de API (pruebas y producción), confirmar comisiones, reembolsos y conciliación por lote; solo para anticipos de citas | P-034, P-035, P-077, P-094 |
| WhatsApp | Proveedor (API oficial), número(s) por sede, plantillas aprobadas y costo; confirmar si 55 1412 0283 es WhatsApp | P-039, P-040 |
| SMS y correo transaccional | Proveedor y remitente verificado (dominio) | P-039 |
| Proveedor de video | Elección, cuenta y llave; texto de telemedicina revisado por abogado | P-016 a P-018, P-147 |
| Antibots del portal | Proveedor y llaves | P-049 |
| Textos legales | Aviso de privacidad, consentimientos, términos y telemedicina redactados/validados por abogado; formato oficial de esterilización | P-024, P-136 a P-140 |
| Datos reales de Pie Clinic | Confirmación como piloto, direcciones y horarios de sedes, lista de servicios y precios, esquema de comisiones, número de podólogos y cédulas, folios vigentes, reverso de los formatos | N-01, N-02, N-08, P-069, P-106 |
| Datos de RANNIX | Correo de contacto, razón social y datos fiscales de RANNIX para facturar la suscripción | P-117, P-118 |
| Producción | Proyectos Supabase/Netlify de producción, variables y dominio, y la autorización explícita del dueño; accesos de `docs/ACCESOS.md` aún sin verificar; rotación de los tokens pegados en el chat | todo |
| Revisiones profesionales | Contador (IVA, anticipos, global), abogado (NOM-004, NOM-024, LFPDPPP, telemedicina), asesoría laboral, podólogo asesor (pie diabético) | P-010, P-056, P-110, P-136 a P-147 |

Hasta entonces: pruebas solo con datos sintéticos y adaptadores en modo simulado marcado «sintético».
