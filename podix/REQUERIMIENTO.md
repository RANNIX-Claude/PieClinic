# REQUERIMIENTO — Sistema de gestión para cadena de clínicas de podología

> Borrador E1. Supuestos A, B, C y D confirmados por el cliente; todos los pendientes A-E quedan cerrados. Regla general: todos los valores numéricos y políticas son parámetros configurables.

## CONTEXTO

Cadena de **7 sucursales** de podología. Además de la atención clínica, vende equipo y productos (bastones, andaderas, plantillas, calzado, cremas, calcetines). Las plantillas a medida las fabrica un **laboratorio externo**.

## DECISIONES CONFIRMADAS POR EL CLIENTE

| Tema | Decisión |
|---|---|
| Sucursales | 7 |
| Precios | Cambian por sucursal, como **descuento/ajuste sobre una lista base** |
| Cajas | Varios cajeros y varios turnos por sucursal |
| Plantillas a medida | Laboratorio externo |
| Costeo de inventario | **PEPS** (primeras entradas, primeras salidas) |
| Apartados | Sí |
| Crédito al paciente | Sí, con autorización |
| Ventas a plazos | Sí |
| Mora | Se manejan **interés y recargo** por pago tardío |
| Pagos entre sucursales | El paciente puede comprar o pagar en una sucursal distinta a donde se atiende |
| Expediente clínico | **Único para las 7 sucursales** |
| Podólogos | **Rotan entre sucursales** |

## PENDIENTES DE CONFIRMAR

| # | Pregunta | Supuesto de trabajo |
|---|---|---|
| A | ¿Hay almacén central o cada sucursal compra por su cuenta? | **[CONFIRMADO]** Compra centralizada con almacén central que surte a las sucursales por traspaso; las sucursales pueden hacer compras locales de urgencia |
| B | ¿Quién autoriza el crédito? | **[CONFIRMADO]** Por niveles: gerente de sucursal (monto bajo), administración central (medio), dirección (alto o paciente con atraso) |
| C | Frecuencia y autorización del inventario físico | **[CONFIRMADO]** Cíclico semanal/quincenal por categoría; general 1-2 veces al año; ajustes los autoriza el gerente hasta un monto y la administración central por encima |
| D | Tasas de interés y recargo, y días de gracia | **[CONFIRMADO]** Interés mensual (% parametrizable por sucursal) en crédito abierto; recargo único (monto o % parametrizable) en ventas a plazos; 10 días de gracia parametrizables; sin tope de mora ni suspensión automática del crédito |
| E | Vigencia de apartados y política del anticipo al vencer | **[CONFIRMADO]** Vigencia 10 días; anticipo mínimo 20 %; al vencer el anticipo no se devuelve (se pierde; opción parametrizable: devolver / saldo a favor / penalización); prórroga permitida, autoriza el gerente de tienda. Todo parametrizable por sucursal |

## MACROPROCESOS Y FUNCIONALIDAD

### 1. Captación y atención al paciente
- Registro de prospectos desde teléfono, WhatsApp, redes, web y referidos de médicos.
- Campañas, promociones y convenios (empresas, asilos, aseguradoras, clubes).
- Encuestas de satisfacción y reseñas.

### 2. Agenda y citas (multi-sucursal)
- Agenda por podólogo, consultorio y sucursal; el podólogo puede tener agenda en varias sucursales según su rotación.
- Citas por tipo de servicio con duración configurable; citas recurrentes para tratamientos de varias sesiones.
- Recordatorios y confirmación por WhatsApp/SMS/correo; reprogramación, cancelación, lista de espera, control de no-shows.
- Visitas a domicilio. Bloqueos por vacaciones y descansos.

### 3. Recepción y admisión
- Alta única de paciente (identificado en las 7 sucursales), aviso de privacidad y consentimiento informado con firma digital.
- Control de llegada y sala de espera. Verificación de convenio o membresía. Menores con tutor.

### 4. Atención clínica — expediente único
- Historia clínica (NOM-004-SSA3), antecedentes y padecimientos de riesgo (diabetes, neuropatía, insuficiencia vascular, anticoagulantes, alergias).
- Exploración podológica, evaluación biomecánica, tamizaje de pie diabético (monofilamento, índice tobillo-brazo, clasificación Wagner/Texas).
- Diagnóstico CIE-10, plan de tratamiento, nota de evolución por sesión, recetas e indicaciones.
- Fotografía clínica con comparativo antes/después. Estudios adjuntos.
- Consentimientos por procedimiento. Referencias a otros especialistas.
- El expediente es visible desde cualquier sucursal con permisos por rol y **bitácora de quién lo consultó**.

### 5. Procedimientos especializados
Quiropodia, onicocriptosis, onicomicosis, cirugía ungueal, ortonixia, verrugas plantares, hongos, pie diabético y curación de heridas, hiperhidrosis, pie deportivo, pediátrica, geriátrica, pedicura médica, láser/ultrasonido/ondas de choque. Cada procedimiento define consumo de insumos y duración.

### 6. Esterilización y quirófano menor
- Bitácora de instrumental y ciclos de autoclave (lote, indicadores, responsable).
- Trazabilidad del set utilizado por paciente.
- Bitácora de desinfección de consultorios. Manejo de RPBI. Mantenimiento de equipos.

### 7. Ortesis y plantillas — laboratorio externo
- Toma de molde/escaneo/huella y prescripción.
- Orden de trabajo al laboratorio externo: envío, fecha prometida, recepción, control de calidad, ajustes y retrabajos.
- Costo del laboratorio y cuenta por pagar al proveedor.
- Entrega al paciente, prueba y garantía.

### 8. Compras
- Catálogo de proveedores. Requisición con aprobación. Orden de compra por sucursal destino o almacén central.
- Recepción contra orden (parcial, diferencias, faltantes). Captura de CFDI del proveedor.
- Costeo **PEPS por capas** (cada entrada conserva su costo y fecha).
- Cuentas por pagar con calendario de vencimientos.
- Devolución a proveedor con nota de crédito.
- Sugerido de compra por mínimos/máximos y rotación.

### 9. Almacén e inventarios (7 sucursales)
- Existencias por sucursal, producto, lote, talla, color y lado (derecho/izquierdo).
- **Traspasos** entre almacén central y sucursales, y entre sucursales: solicitud, salida, tránsito, recepción y diferencias.
- Kardex por producto. Ajustes con motivo obligatorio (merma, robo, daño, caducidad) y autorización.
- Mínimos/máximos por sucursal con alertas. Código de barras/QR. Números de serie para equipo de valor.
- Consumo interno de insumos clínicos descontado automáticamente por procedimiento (no es venta).
- Control de caducidades.

### 10. Inventario físico
- Cíclico y general, con congelamiento de movimientos en el general.
- Conteo a ciegas y doble conteo ante diferencia, desde celular con escáner.
- Comparativo contra sistema, valor de la diferencia, ajuste autorizado y bitácora.
- Valuación del inventario a costo PEPS para contabilidad.

### 11. Ventas y punto de venta
- POS en mostrador; venta ligada al paciente o a público general.
- **Lista de precios base** con ajuste por sucursal; historial de cambios de precio, solo administración central.
- Promociones, descuentos con autorización, cotizaciones.
- Prescripción del podólogo que genera orden de venta en caja.
- Cobro único consulta + procedimiento + producto, con factura CFDI única.
- Venta o pago en sucursal distinta a la de atención.
- Comisiones a vendedor y podólogo.
- **Devoluciones de cliente**: validación de ticket y estado; reembolso, cambio o nota de crédito; reingreso a inventario o a merma.
- Garantías, cancelaciones con autorización y bitácora.

### 12. Apartados
- Reserva de producto en una sucursal con anticipo mínimo y vigencia.
- Liquidación en una o varias entregas; entrega y factura al final.
- **Parámetros (por sucursal):** vigencia (10 días), anticipo mínimo (20 % del precio), política del anticipo al vencer (por defecto: no se devuelve), prórroga permitida (sí) y quién la autoriza (gerente de tienda).
- Al vencer: se libera el producto y se aplica la política del anticipo configurada.

### 13. Crédito y ventas a plazos
- Límite de crédito, saldo e historial por paciente (compartido entre sucursales).
- Plan de pagos con parcialidades y fechas.
- **Mora (parámetros por sucursal):** interés mensual en crédito abierto; recargo por pago tardío, cobrado una sola vez, en ventas a plazos (no se acumulan los dos sobre la misma deuda). Días de gracia: 10 por defecto, configurable. Sin tope de mora ni suspensión automática del crédito (el gerente puede bloquear manualmente).
- Autorización por niveles con registro de quién, cuándo y monto (pendiente B).
- Recordatorios de pago, cartera vencida por sucursal, pagos recibidos en cualquier sucursal.

### 14. Caja y turnos
- Apertura de caja por cajero y turno con fondo inicial.
- Movimientos: ventas, cobros, anticipos, abonos de crédito, gastos menores, retiros y depósitos.
- **Cambio de turno**: corte parcial con arqueo, firma del cajero saliente y del entrante.
- **Corte de caja** por forma de pago: esperado vs. contado, sobrante/faltante con justificación, cancelaciones y devoluciones.
- Corte consolidado por sucursal, día y semana. Conciliación de terminales y depósitos.
- Reapertura de cortes, cancelaciones y descuentos solo con supervisor.

### 15. Facturación y finanzas
- CFDI 4.0, cancelación y notas de crédito.
- Cuentas por cobrar (convenios, aseguradoras, crédito a pacientes) y por pagar.
- Ingresos y egresos por centro de costo y sucursal; flujo de efectivo; integración con contabilidad.
- Rentabilidad por servicio, producto, podólogo y sucursal.

### 16. Seguimiento y fidelización
- Próxima visita sugerida, recontacto de inactivos, programa de lealtad y referidos.
- Comunicación masiva segmentada, contenido educativo, atención de quejas.

### 17. Recursos humanos
- Plantilla por sucursal y **rotación de podólogos** entre sucursales.
- Cédulas y certificaciones con vigencia, horarios, asistencia, nómina, comisiones, capacitación.

### 18. Cumplimiento y calidad
- NOM-004, NOM-024, NOM-005, NOM-045 y NOM-087 (RPBI); aviso de funcionamiento y responsable sanitario por sucursal.
- LFPDPPP y bitácoras de acceso al expediente. Eventos adversos, auditoría interna. Resguardo del expediente por mínimo 5 años.

### 19. Dirección y análisis
- Tablero por sucursal y consolidado: pacientes nuevos y recurrentes, ocupación de agenda, no-shows, ticket promedio, ingresos por servicio, margen, rotación, cartera vencida, faltantes/sobrantes de caja, productividad por podólogo, efectividad de campañas.

## TRANSVERSAL
- Roles y permisos por sucursal (podólogo, recepción, cajero, gerente, almacén, administración central, dirección).
- Bitácora de auditoría. Notificaciones por WhatsApp/correo/SMS.
- Firma digital, PDF de recetas y consentimientos, almacenamiento de imágenes.
- Uso en móvil y tableta. Integraciones: PAC, pasarela de pago, WhatsApp Business, contabilidad.
- Respaldo y seguridad de datos de salud. Portal del paciente (citas, historial, pagos, fotos de evolución).

## QUÉ NO PUEDE FALLAR
- Cuadre de caja y cortes por turno.
- Confidencialidad y disponibilidad del expediente único entre sucursales.
- Exactitud del inventario y del costo PEPS.
- Cálculo de saldos, intereses y recargos del crédito.
- Trazabilidad de esterilización por paciente.

## FASES SUGERIDAS **[SUPUESTO]**
1. **MVP:** pacientes y expediente único, agenda multi-sucursal, POS, caja y turnos, catálogo con precios por sucursal.
2. **Fase 2:** compras, almacén, traspasos, inventario físico, apartados, devoluciones.
3. **Fase 3:** crédito y plazos, laboratorio externo, esterilización, facturación completa.
4. **Fase 4:** fidelización, portal del paciente, tableros y RRHH.

## PREGUNTAS ABIERTAS PARA E2
- Volumen por sucursal: pacientes/día, ventas/día, SKU en catálogo.
- Sistema actual y datos a migrar (pacientes, saldos, inventario).
- Ancho de banda y equipos disponibles en cada sucursal; operación offline.
- Política de datos entre sucursales (¿cualquier podólogo ve todo el expediente?).

---

# AMPLIACIÓN V2 — parte administrativa, comunidad y plataforma (E1)

> Entregable E1 de la ampliación. Lo dictó **Roberto (dueño de RANNIX)** en nombre del cliente **Pie Clinic** (cadena de 7 sucursales de podología), noviembre de 2026. **No hubo sesión directa con el cliente para esta ampliación**: todo lo que aquí aparece como dicho por el cliente llegó por conducto de Roberto y debe ratificarse en la sesión de E3.
> Lo de arriba (requerimiento original) sigue vigente; esta sección solo agrega.
> **Desviación registrada:** la ampliación se construyó en modo demostración antes de la firma de E3 (ver encabezado de [`REGLAS_NEGOCIO.md`](REGLAS_NEGOCIO.md)).

## QUÉ HACEN HOY

Lo que se sabe (por Roberto) y lo que no se sabe:

- La operación clínica y de mostrador ya quedó descrita arriba. Para la parte **administrativa** el cliente tiene como referencia el ERP de administración de plazas de RANNIX («IRP») y pide «lo mismo» para sus clínicas: recursos humanos, gastos, ingresos, consolidación y estados financieros.
- Cada sucursal funciona como una **unidad** con su renta, su luz, su gasto propio y su personal. Hoy no pueden ver la rentabilidad de cada sucursal.
- Los colaboradores **trabajan unos días en una sucursal y otros en otra**. Hoy no hay forma de ver en cuál están trabajando ni de ligar la venta a quien la hizo.
- Hay **bonos** (por sucursal e individuales, mensuales y trimestrales) y **metas por sucursal**, pero no se sabe cómo se calculan hoy ni en qué se llevan.
- Los precios se cambian sucursal por sucursal; quieren un **catálogo central**: se cambia en un lugar y lo ven todas.
- Las **notas de compra** del proveedor se capturan a mano.
- **Hubo un robo de inventario reciente**; no se detectó a tiempo.
- La capacitación se da de persona a persona; los videos de «cómo se hacen los cortes» no están organizados en ningún lado.
- **No se sabe** (no se dijo): cómo pagan la nómina hoy, con qué checan asistencia, quién lleva la contabilidad, qué usan para comunicarse, ni cuánto les cuesta todo lo anterior en horas o dinero. Va a «Falta preguntar».

## QUIÉNES

| Perfil | Cuántos | Dónde están | En qué aparato |
|---|---|---|---|
| Dirección / dueño | no dicho (1 en la demo) | oficina / fuera | escritorio y teléfono |
| Administración central | no dicho (1 en la demo) | oficina central | escritorio (brinca de una sucursal a otra) |
| Gerente de sucursal | no dicho (1 por sucursal en la demo) | su sucursal | escritorio y teléfono |
| Podólogo | no dicho (rotan entre sucursales) | la sucursal del día | tableta / teléfono |
| Asistente clínico, recepción, cajero | no dicho; parte del personal rota | la sucursal del día | teléfono / tableta |
| Almacén (sucursal y central) | no dicho | sucursal / almacén central | teléfono |
| Cliente o paciente (tienda en línea) | público | fuera | teléfono |

Los conteos reales de personal **no se dieron**. La demostración usa 59 cuentas ficticias (`src/store/seed.js`). El menú debe **cambiar por tipo de rol** y la información presentarse «como en el IRP»: en **mosaico** y en **renglones**; el personal, con **fotografía** y toda su información «de inicio a fin».

## QUÉ LES DUELE

En las palabras que llegaron (resumidas por Roberto):

1. «Quiero ver la rentabilidad de cada sucursal»: cada una con su renta, su luz, su gasto y su personal.
2. «Saber quién hizo la venta para asociarla» a los bonos; bonos por sucursal e individuales, mensuales y trimestrales; metas por sucursal con historia y que el sistema sugiera.
3. «Los colaboradores trabajan unos días en una y otros en otra»: que se vea en qué tienda están trabajando; cada quien se firma en la tienda donde trabaja ese día; la venta se registra con la cuenta del trabajador, para bonos e inventarios.
4. «Hubo un robo reciente»: auditar el inventario a distancia con fotos (del colaborador o de la cámara de seguridad) y que la inteligencia artificial estime cuánto hay.
5. Que se cambie un precio en un lugar y lo vean todas las sucursales, y que quede **por qué cambió y qué tipo de cambio fue**, con el alta de la compra ligada.
6. Capturar las notas de compra del proveedor con inteligencia artificial: «arma una captura previa que una persona confirma».
7. Un asistente inteligente que responda preguntas del negocio.
8. Capacitar al personal con cursos (videos, fotografías, cómo se hacen los cortes) y guardar el acervo de la organización; los videos se suben a YouTube y aquí queda la referencia.
9. Mensajería entre equipos, correo y un feed para toda la comunidad.
10. Un portal web con la tienda para enseñárselo a un cliente potencial, con entrada al sistema.

## QUÉ NO PUEDE FALLAR

Se suma a la lista original (caja, expediente, PEPS, crédito, esterilización):

- **La atribución de la venta**: usuario y sucursal de cada movimiento. De ahí salen bonos e inventario; si se pierde, no hay cómo pagar bonos ni rastrear un faltante.
- **El estado de resultados por sucursal**: el consolidado debe ser exactamente la suma de las siete.
- **El bono ya aprobado no cambia** aunque después cambie el esquema o la meta.
- **La IA nunca registra sola**: ni la nota de compra ni el ajuste de inventario entran sin que una persona confirme o autorice.
- **La detección de un faltante** en la auditoría a distancia: debe quedar la evidencia (foto, quién, cuándo) y desde cuándo falta.
- **El precio central**: un cambio se refleja en todas las sucursales y deja historia con motivo.
- **Lo simulado se rotula**: nada que dependa de un servicio no contratado puede presentarse como real.

## VOLUMEN

| Qué se cuenta | Al día | Al mes | En el pico |
|---|---|---|---|
| Ticket promedio de quiropodia (dato del cliente) | — | — | **$800** por servicio |
| Ticket promedio de plantillas (dato del cliente) | — | — | **$2,500** |
| Ventas, citas, pacientes por sucursal | no dicho | no dicho | no dicho |
| Empleados y checadas | no dicho | no dicho | no dicho |
| Notas de compra del proveedor | no dicho | no dicho | no dicho |
| Gastos por sucursal | no dicho | no dicho | no dicho |
| Pedidos de la tienda en línea | no dicho | no dicho | no dicho |
| Fotos de auditoría de inventario | no dicho | no dicho | no dicho |

Los **márgenes por servicio están pendientes de recibir**. Los volúmenes de la demostración (≈ $250,000 mensuales por sucursal, 160 pacientes, 1,450 ventas vivas) son **generados**, no del cliente. Nota: la semilla usa quiropodia a $450 y plantillas de mostrador a $450–$780; **no coincide** con el ticket que dio el cliente ($800 y $2,500) y debe ajustarse con la lista de precios real (pregunta V2-41).

## PORTAL (hoja inicial pública)

| Dato | Respuesta |
|---|---|
| Nombre público del producto | Por definir: **Pie Clinic** (cliente fundador) o **Pie Firme** (producto hermano). Hoy el portal dice «Pie Clinic Ortopédicos» |
| Dominio | Por definir. QA: sitio Netlify `pie-firme-qa` |
| Modelo de uso | **Producto** (no desarrollo a la medida); Pie Clinic es el cliente fundador. Varias organizaciones a futuro |
| A quién le habla la hoja inicial | Al paciente (servicios, sucursales, tienda) y al cliente potencial del producto |
| Módulos a mostrar | Tienda en línea, citas, sucursales, entrada al sistema |
| Logo y colores | Wordmark propio provisional (`portal/assets/logo.svg`); definitivos por confirmar |
| Contacto / demo | Ver [`docs/PORTAL.md`](docs/PORTAL.md) |

## DECISIONES DEL DUEÑO DE RANNIX (no del cliente)

| Tema | Decisión |
|---|---|
| Tipo de proyecto | Es un **producto**; Pie Clinic es el cliente fundador |
| Base de datos | La **misma base y el mismo esquema `piefirme`** del sistema hermano Pie Firme; migraciones **064 en adelante**, aplicadas primero a QA |
| Funcionalidad | Incorporar a esta versión **toda** la funcionalidad de Pie Firme y enriquecerla |
| Ambiente | Se trabaja primero en desarrollo / QA |
| Código | GitHub `RANNIX-Claude/podix`, sincronizado con Netlify (sitio de QA `pie-firme-qa`) |
| Método | Metodología RANNIX de requerimiento a producción, con pruebas |

## QUÉ PIDIÓ LA AMPLIACIÓN (módulos)

1. **Recursos humanos** con registro de entrada y salida, fotografías y expediente de la persona de inicio a fin.
2. **Gastos, ingresos, consolidación y estados financieros**; cada sucursal como unidad de costo.
3. **Bonos y metas**: por sucursal e individuales, mensuales y trimestrales; metas con historia y sugerencia del sistema.
4. **Asistente inteligente** de preguntas del negocio.
5. **Captura de notas de compra con IA**, con confirmación humana.
6. **Catálogo central de precios** con motivo y tipo de cambio, y la compra ligada.
7. **Multitienda**: el administrador brinca entre tiendas; cada usuario se firma donde trabaja ese día.
8. **Auditoría de inventario a distancia** con fotos e IA.
9. **Capacitación y acervo** (videos en YouTube, aquí la referencia).
10. **Comunicación**: mensajería, correo y feed de la comunidad.
11. **Portal web con e-commerce** y entrada al sistema.
12. **Análisis de datos (BI)**, evaluación por parte de los clientes, tablero DW y los **módulos generales de la fábrica**: reportes, control de ETL, bitácora, usuarios, configuración, documentos, cálculos del sistema, validación, catálogos, consulta a base de datos, entrega y consulta asistente.

Lo que **realmente quedó construido** (y lo que no) está en [`CLAUDE.md`](CLAUDE.md) y en [`ACTA_QA.md`](ACTA_QA.md).

## QUÉ QUEDA FUERA

Explícitamente **no** forma parte de esta ampliación (si se quiere, se cotiza aparte). Es propuesta de RANNIX: **el cliente aún no la ha aceptado**.

- **Nómina legal**: cálculo de ISR, IMSS, Infonavit, subsidio, y timbrado de CFDI de nómina. Lo construido es una **prenómina de demostración** (sueldo, faltas, retardos).
- **Finiquitos y liquidaciones con validez legal**: se muestra una estimación «por validar con contador».
- **Contabilidad formal**: pólizas, balanza, balance general, flujo de efectivo, conciliación bancaria, declaraciones. El «estado financiero» es un **estado de resultados operativo** por sucursal.
- **Checador con biometría, geocerca o reloj físico**: la entrada y salida se marcan desde la cuenta del usuario.
- **Servicios de IA, visión, pasarela de pago, correo saliente, WhatsApp y PAC reales**: quedan simulados y rotulados hasta contratar cada servicio y cargar su llave.
- **Conexión directa a cámaras de seguridad**: se captura el identificador de la cámara y la imagen se sube a mano.
- **Alojamiento de videos**: se guarda solo el enlace de YouTube.
- **Correo hacia buzones externos y envíos masivos** a pacientes.
- **Logística de envíos** de la tienda (paquetería, guías, rastreo) y **facturación de pedidos en línea**.
- **Portal del paciente con cuenta** (citas, historial, pagos): la tienda es pública y sin cuenta.
- **Aplicación nativa** (tiendas de aplicaciones): es web app instalable.
- **Migración de datos históricos** del cliente (pacientes, saldos, inventario, nómina): no se ha recibido nada.
- **Producción**: esta etapa termina en QA.
- **Varias organizaciones operando a la vez** en esta app: hoy la demostración es de una sola cadena.

## FALTA PREGUNTAR

Resumen; la lista completa y numerada (V2-1 en adelante) está en [`PREGUNTAS_ABIERTAS.md`](PREGUNTAS_ABIERTAS.md), sección «Ampliación V2».

- [ ] ¿Cómo se pagan hoy la nómina y los bonos, con qué periodicidad y quién los calcula?
- [ ] Esquemas de bono reales: base, escalones, topes, condiciones, quién los aprueba.
- [ ] ¿Qué gastos son de la sucursal y cuáles del corporativo, y cómo se reparten estos últimos?
- [ ] Márgenes por servicio (pendientes de recibir) y lista de precios real.
- [ ] «Tipo de cambio de precio»: ¿cuál es el catálogo de tipos?
- [ ] ¿5 sedes (Pie Firme) o 7 (esta versión)? ¿Pie Clinic o Pie Firme? ¿8 roles o 3?
- [ ] Proveedores de IA, visión, pagos, correo, WhatsApp y PAC, y quién paga cada uno.
- [ ] Números de personal, volúmenes y picos reales.
- [ ] Qué pasó en el robo: qué productos, en qué sucursal, cómo se detectó. Define qué se audita primero.
