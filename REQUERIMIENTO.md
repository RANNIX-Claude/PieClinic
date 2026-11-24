# REQUERIMIENTO — Clínica de Podología · RANNIX (producto propio)

> Entregable de la etapa **E1**. Fecha de arranque: 2026-10-25 · Quién habló: Roberto Aguilar (RANNIX), dueño del producto.
> Regla: nada de lo que no se dijo se supone; va a FALTA PREGUNTAR. Las respuestas se registran con fecha en la sección RESPUESTAS REGISTRADAS.

## INTENCIÓN (textual en esencia)

Plataforma completa para que los **podólogos lleven el expediente de sus pacientes**: **agenda y citas**, **consulta del historial** de cada persona, **importación de datos** (traer pacientes e información que ya existan) y, además, **toda la parte administrativa de los sistemas de IRP**: **gastos, ingresos, estados financieros, bitácoras**, etcétera (todo lo que haya que sumar).

## QUÉ HACEN HOY

Respuesta 2026-10-25 (nivel general, sin detalle del proceso): llevan expediente y agenda con **papel/libreta, Excel/Google Sheets, otro software de expedientes (cuál: FALTA PREGUNTAR) y WhatsApp/calendario del celular**. Mezcla de medios, sin sistema único. **Paso a paso real (2026-10-25, dictado por el dueño, transcripción de voz; interpretación marcada):**
1. El paciente habla (llamada/mensaje) y agenda, o llega directo a la tienda (lo normal es que no llegue sin cita; lo segundo es la excepción).
2. Al terminar el servicio, la siguiente cita se acuerda en ese momento con el podólogo/recepción. Hay tratamientos con seguimiento: p. ej. tras una extracción de uña se agendan **3 citas posteriores**.
3. Además del servicio hay **venta de productos** (plantillas y otros): requiere **inventario por tienda** al día.
4. Se imprime **ticket** y se **factura** en el momento: se necesitan los **datos fiscales del cliente registrados**. Integrar la facturación es importante.
(Interpretación: "la cuerda con apodo" se leyó como "la acuerda con el podólogo"; confirmar.)

## QUIÉNES

| Perfil | Cuántos | Dónde están | En qué aparato |
|---|---|---|---|
| Podólogo | ? | ? | ? |
| Recepción | ? | ? | ? |
| Administrador | ? | ? | ? |
| Paciente | ? | ? | ? |

(Los cuatro perfiles son los que el encargo propone; cuáles existen en realidad se confirma en E3.)

## QUÉ LES DUELE

Respuesta 2026-10-25 (categorías elegidas, no frases textuales del usuario final): expedientes perdidos o desordenados; citas empalmadas o faltas; no saben si ganan dinero; fotos y evolución del pie dispersas. Frases del dueño (2026-10-25): «No sé qué productos hay en cada tienda, si está tal producto en tal tienda»; «¿quién hizo el trabajo ayer / en la sesión anterior?»; «¿cuánto me generan de ingresos el servicio de podología? ¿cuánto la extracción de uñas?»; «¿cuánto me produce cada podólogo?»; «¿cuál es el número de incidencias/quejas de cada podólogo, por sucursal, por día, por mes, por año?». Piden un sistema de información que responda todo eso.

## QUÉ NO PUEDE FALLAR

Respuesta 2026-10-25: (1) privacidad entre clínicas (datos de salud; ninguna ve datos de otra); (2) no perder el expediente (respaldo y bitácora de cambios); (3) agenda sin duplicados; (4) importación sin duplicar pacientes.

## VOLUMEN

| Qué se cuenta | Al día | Al mes | En el pico |
|---|---|---|---|
| Citas por clínica | ≤ 20 (respuesta 2026-10-25) | ? | ? |
| Pacientes por clínica | ? (se estimó "cientos") | ? | ? |
| Sucursales / podólogos | ? | ? | ? |

## PORTAL (hoja inicial pública)

| Dato | Respuesta |
|---|---|
| Nombre público del producto | **Pie Firme** (inferido del dominio `piefirme.rannix.com`; confirmar) · nombre de trabajo del proyecto: Clínica de Podología |
| Dominio | `piefirme.rannix.com` (2026-10-25) |
| Modelo de uso | VARIAS organizaciones entran por /app/ (SAAS) — 2026-10-25 |
| A quién le habla | Podólogos (a confirmar) |
| Frase de una línea | Plataforma para llevar el expediente, la agenda y la administración de una clínica de podología (borrador) |
| Módulos a mostrar (3 a 6) | Expediente, Agenda y citas, Historial, Importación, Finanzas (gastos/ingresos/estado de resultados), Bitácora — a confirmar |
| Logo y colores | Logo recibido: `portal/assets/logo.png` (pie estilizado, cruz médica, flecha ascendente y engrane; verde ≈#3CD13C y azules ≈#2FA3C7 / #12B5E5). Hex exactos: se extraen en E2/portal |
| Contacto / demo | 55 1412 0283 (2026-10-25); correo y si es WhatsApp: FALTA PREGUNTAR |

## ALCANCE PROPUESTO (módulos mencionados por el dueño)

1. Expediente clínico del paciente.
2. Agenda y citas.
3. Consulta del historial por persona.
4. Importación de datos existentes (pacientes e información).
5. Administrativo clonado de IRP: gastos, ingresos, estados financieros (EDR), bitácora, "etcétera" (a precisar cuáles más).

## REFERENCIAS Y REUTILIZACIÓN

**Regla del dueño: clonar, no reconstruir.** Cada pantalla administrativa se clona de IRPAPP con **toda su funcionalidad**, nunca versión básica. El proyecto resultante es una **copia independiente** de IRP (no comparte BD ni código vivo).

**IRPAPP** (`work/IRPAPP/DEv`, React 18 + Vite + Tailwind + Supabase + Netlify; `src/pages`, `supabase/migrations`, `CLAUDE.md`). Candidatos a clonar, a confirmar con el dueño: `GastosOperativos.jsx`, `Ingresos.jsx`, `EDR.jsx` (estado de resultados), `Finanzas.jsx`, `Bitacora.jsx`, `Conciliacion.jsx`, `FondoRevolvente.jsx`, `Proveedores.jsx`, `Productos.jsx`, `Usuarios.jsx`, `Catalogos.jsx`, `Reportes.jsx`, `RH.jsx`, `Configuracion.jsx`, `Login.jsx`; convenciones: vistas `prp_*` de lectura, storage privado con URL firmada, funciones Netlify como proxy de IA. NO aplica (inmobiliario): Contratos, Arrendatarios, Locales/Mapa, Estacionamiento, Vending, Cobranza de rentas, Prospectos, Renovaciones, PortalProspecto, Mundo/Foto del día — salvo que el dueño diga lo contrario. Regla de negocio ya registrada: en EDR `proy_*` es manual (admin) y `real_*` es automático; nunca pisar `proy_*` desde código.

**MediVoz** (`work/MediVoz/medivoz_v5_final/medivoz_v5`: `expediente.html`, `paciente.html`, `ligia_v2_migration.sql`). Sirve solo como referencia de campos y flujo (no se asume que aplica a podología). Se reutiliza como idea: consulta con notas SOAP, signos vitales, diagnóstico y catálogo de diagnósticos, plan de tratamiento, próxima cita, firma de la consulta, medicamentos/vacunas del paciente, bitácora de accesos al expediente y auditoría de acciones, vista del paciente ("Mi expediente"). NO se reutiliza sin decisión: la capa analítica anónima (`dw_analitica`), el puntaje de cumplimiento y las alertas, la IA clínica. Lo propio de podología (exploración del pie, uñas, pie diabético, escalas, fotos clínicas) NO está en MediVoz y se define en E2/E3.

## QUÉ QUEDA FUERA

No definido. Se presiona en las preguntas de E1 (ver FALTA PREGUNTAR). Hasta que el dueño responda, nada se considera fuera ni dentro salvo lo listado en ALCANCE PROPUESTO.

## ESTILO Y UX (regla del dueño, 2026-10-25)

**Seguir la inspiración, el estilo y la UX de IRP** en toda la aplicación (mockups de E2 incluidos). Lo que eso significa, leído de `IRPAPP/DEv/src` (`styles/theme.css`, `components/layout`, `components/ui`):
- **Estructura:** encabezado superior fijo de 52 px, barra lateral con secciones agrupadas en MAYÚSCULAS e iconos `lucide-react`, pie de página, `MobileShell` para móvil; páginas por módulo con tablas ordenables, filtros, tarjetas KPI (`KPICard`), insignias de estado (`StatusBadge`), estados vacíos (`EmptyState`), modales de captura y expedientes con pestañas.
- **Tokens:** fondo `#F5F5F7`, tarjetas blancas con sombra suave, bordes `#D2D2D7`, texto `#1D1D1F` / gris `#6E6E73`, radio 8 px, fuente Segoe UI/system-ui, semáforo verde `#0D9457` / ámbar `#F5A623` / rojo `#D93025`.
- **Stack a clonar:** React 18 + Vite + Tailwind + variables CSS, React Router, React Query, Recharts, toasts, componentes de `components/ui`.
- **Color de marca:** IRP usa morado (`#7B5EA7`) de IwolPark; Pie Firme tiene logo verde/azul (`portal/assets/logo.png`). Propuesta (por validar): conservar el **esqueleto, tokens neutros y UX de IRP** y cambiar solo `--accent` a la paleta del logo de Pie Firme. **Decidido 2026-10-25: el logo y el acento van morados.** Borrador por recoloreo automático: `portal/assets/logo-morado.png` (provisional); **logo definitivo recibido (Gemini): `portal/assets/logo-morado-gemini.png`** (original, fondo blanco) y `portal/assets/logo-morado-transparente.png` (fondo quitado automáticamente; los bordes claros pueden tener halo, revisar sobre el encabezado morado). `logo-morado.png` queda obsoleto.

## VISIÓN DE PRODUCTO COMPLETO (decisión del dueño, 2026-10-25)

> Dictado del dueño: «No dejes nada fuera, todo lo que te imagines agrégalo; de todos modos va a costar lo mismo; lo importante es que sea lo más completo posible, administrativa y clínicamente.» **Esto sustituye** todas las exclusiones y la división v1/v1.1 anteriores: **todo entra al alcance**. Lo que sigue es la lista de módulos propuesta por Claude bajo esa instrucción; cada línea es **propuesta a validar en E2/E3**, no requisito confirmado por un usuario real. Orden de construcción en olas (E5) es secuencia de ejecución, no recorte de alcance.

### Clínico
1. **Expediente podológico completo:** ficha de identificación, antecedentes (diabetes, circulatorios, alergias, medicamentos, calzado, actividad), historia clínica y notas de evolución por sesión (NOM-004), consentimientos informados y aviso de privacidad firmados (firma en pantalla), documentos adjuntos.
2. **Exploración del pie:** mapa interactivo del pie (zonas, uñas, lesiones), exploración dermatológica, ungueal, ortopédica/biomecánica, vascular y neurológica; pie diabético con escalas (SINBAD/Wagner según investigación) y recordatorio de revisión periódica.
3. **Fotos clínicas** antes/después ligadas a sesión y zona, con autorización escrita, comparador lado a lado y línea de tiempo de evolución.
4. **Planes de tratamiento multi-sesión** (p. ej. 3 citas tras extracción de uña, láser cada 30–35 días) con seguimiento de cumplimiento y generación automática de las citas siguientes.
5. **Estudio de pisada y plantillas ortopédicas:** captura de medidas, orden de fabricación, entrega y garantía.
6. **Catálogo de diagnósticos y procedimientos** (CIE-10 a validar), recetas/indicaciones al paciente imprimibles, certificados y constancias.
7. **Telemedicina / videoconsulta** con sala por cita, consentimiento y nota «a distancia» en el expediente.
8. **Dictado por voz de notas** (entra al alcance por instrucción del dueño) y **asistente de IA** de consulta (números y expediente, aislado por clínica).
9. **Alertas clínicas** (alergias, diabetes, interacciones, seguimientos vencidos) como apoyo, nunca como diagnóstico.
10. **Bitácora de accesos y cambios del expediente** (quién vio/modificó qué), respaldo y retención ≥ 5 años (NOM-004) con política de resguardo.
11. **Quejas e incidencias** registradas por sesión, podólogo y sucursal, con seguimiento y resolución.

### Agenda y pacientes
12. **Agenda** multi-podólogo y multi-sede, cabinas/equipos como recursos, duraciones por servicio, bloqueos, lista de espera, sobrecupo controlado, reglas de cancelación, anticipos.
13. **Portal de reserva y pago en línea** por clínica (sin cuenta), con Clip; recordatorios por correo/SMS/WhatsApp, confirmación y reprogramación por liga; reserva por WhatsApp atribuida a sede.
14. **CRM del paciente:** registro, datos fiscales, referidos, etiquetas, segmentos, campañas de recontacto (revisión periódica, pacientes inactivos), cumpleaños, encuestas de satisfacción/NPS.
15. **Visita a domicilio** como tipo de servicio con ruta y viáticos.

### Comercial y administrativo (clonado de IRP, con toda su funcionalidad)
16. **Catálogo de servicios y productos** con precio fijo/«desde»/por unidad/«a valorar», **histórico de precios y vigencia**, precio por sucursal, paquetes (servicio+producto), planes multi-sesión, anualidad/membresía, gift cards, promociones.
17. **Punto de venta y ticket:** cobro de cita y venta de productos, ticket impreso, métodos de pago, corte de caja por turno y sucursal, **facturación CFDI integrada** con datos fiscales del cliente, cancelaciones y notas de crédito.
18. **Inventario por sucursal:** existencias, mínimos, traspasos entre sucursales, entradas por compra, mermas, caducidades, conteos físicos, órdenes de compra a proveedores; «¿qué producto hay en cada tienda?».
19. **Gastos, ingresos, estado de resultados (EDR), estados financieros, conciliación bancaria, fondo revolvente, proveedores, cuentas por pagar/cobrar, presupuesto** (proy_* manual, real_* automático).
20. **Comisiones y productividad por podólogo**, **RH/nómina** (asistencia, vacaciones, prenómina), metas por sucursal.
21. **Mantenimiento y órdenes de trabajo** de equipo e instrumental; **esterilización y trazabilidad de instrumental** (autoclave, lotes) para cumplimiento sanitario.
22. **Bitácora general, usuarios y permisos por rol, catálogos, reportes exportables, dashboard y resumen semanal** (clonados de IRP).
23. **Reportes pedidos por el dueño:** ingreso por servicio, por podólogo, por sucursal; quejas por podólogo/sucursal/día/mes/año; quién atendió la sesión anterior.

### Plataforma (SaaS multi-clínica)
24. **Multi-organización** con aislamiento por RLS; **importación con IA** (la IA propone el mapeo, un administrador revisa y confirma; duplicados, vista previa); exportación completa de datos por clínica.
25. **Suscripción:** 400 MXN/mes por podólogo o 1,000 MXN/mes por clínica, cobro automático (Clip, a verificar), facturación de la suscripción, panel de administración RANNIX (altas, planes, uso, soporte).
26. **PWA** instalable, uso sin conexión para consulta básica (a definir), modo móvil/tableta para el podólogo.
27. **Portal público** `piefirme.rannix.com` y legales (aviso de privacidad, términos).

## FORMATOS REALES DE LA CLÍNICA (2026-10-25)

El dueño compartió tres formatos en papel de **«Pie Clinic — Orto-Podólogos»** (consentimiento informado, antecedentes personales, seguimiento clínico), guardados en `docs/formatos_reales/`. Análisis completo y campo por campo en `docs/ANALISIS_HISTORIA_CLINICA_PIECLINIC.md`. Decisiones del dueño: **registrar el 100 % de los datos del formato y generar/imprimir la historia** (mockups nuevos `50_podologo_capturar_historia_clinica` y `51_podologo_imprimir_historia_clinica`). Hallazgos: cinco sedes marcadas en el formato (Chalco, Centenario, Galerías, Patio, Sendero), curación diaria × 4 días tras la extracción de espícula (resuelve 3 vs 4 visitas, a confirmar), mapa del pie de 4 vistas (dorsal/plantar × D/I), diagnóstico en lista corta de 6 casillas y tabla de visitas (fecha, atendió, servicio, observaciones, próxima visita). **Pie Clinic parece ser el cliente real/piloto: confirmar** (pregunta N-01). Preguntas N-01 a N-08 pendientes para E3.

## ESTADO E2 (2026-10-25)

49 mockups en `docs/mockups/` y los cinco entregables en la raíz: `DICCIONARIO_DATOS.md` (142 entidades), `MODELO_ESTADOS.md` (41 máquinas), `MATRIZ_ROLES.md`, `METRICAS.md` y `PREGUNTAS_ABIERTAS.md` (149 preguntas, agenda E3 de ~425 min). Los mockups traen contradicciones internas (27 listadas en PREGUNTAS_ABIERTAS, apéndice A) que se corrigen **después** de E3. Siguiente: sesión E3 y firma; sin código antes.

## RESPUESTAS REGISTRADAS

- [x] 2026-10-25 · **Modelo de uso: VARIAS clínicas/podólogos entran por `/app/` → vía SAAS.** Esquema multi-organización con aislamiento por RLS desde el día uno; el portal en `/` y la app en `/app/`.
- [x] 2026-10-25 · **Fuera de la v1:** ~~facturación CFDI~~ (revertido: ahora integrada en v1); portal/app del paciente (el paciente NO entra al sistema en v1); recordatorios por WhatsApp; IA / dictado por voz.
- [x] 2026-10-25 · **Cómo gana dinero:** suscripción mensual por podólogo. (Precio, periodo de prueba y cobro: FALTA PREGUNTAR; el cobro de la suscripción dentro del sistema no está confirmado en v1.)
- [x] 2026-10-25 · **Roles marcados:** Podólogo, Recepción, Administrador, Paciente. **Contradicción a resolver:** "Paciente" como rol está marcado, pero el portal/app del paciente quedó fuera de v1; en v1 el paciente existe como registro, no como usuario con acceso (confirmar en E3).
- [x] 2026-10-25 · **Piloto:** SÍ hay una clínica/podólogo concreto, pero el dueño no dio nombre ni datos. Pendiente: nombre, contacto, cómo trabajan hoy, volumen.
- [x] 2026-10-25 · **Importación (se marcaron las cuatro fuentes):** Excel/CSV de pacientes; historial de consultas previas; exportación de otro sistema de expedientes (cuál: FALTA PREGUNTAR); papel/fotos escaneadas (como adjuntos al expediente).
- [x] 2026-10-25 · **Administrativo de IRP a clonar (completo, con toda su funcionalidad):** gastos, ingresos, estado de resultados (EDR), bitácora, más proveedores y productos/insumos, conciliación y fondo revolvente, RH/nómina, usuarios, catálogos y reportes.
- [x] 2026-10-25 · **Hoy / dolor / crítico / volumen:** ver secciones QUÉ HACEN HOY, QUÉ LES DUELE, QUÉ NO PUEDE FALLAR y VOLUMEN. Volumen: clínica chica, hasta 20 citas al día.
- [x] 2026-10-25 · **Importación con IA (cambia la respuesta anterior):** no existe un software previo; se requiere un **módulo de importación flexible**: se sube un Excel/archivo en cualquier formato (datos del paciente, citas, expediente, imágenes) y **la IA analiza el archivo fuente, propone el layout/mapeo y genera los archivos de carga**. Por tanto la IA SÍ entra, solo para importación (ver contradicciones).
- [x] 2026-10-25 · **Facturación (revierte lo marcado antes):** el dueño ahora dice que es **importante integrar la facturación**, con datos fiscales del cliente registrados y ticket impreso. **Contradice «CFDI fuera de v1»; queda en conflicto hasta que el dueño decida** (¿timbrado en v1 o solo captura de datos fiscales y ticket?).
- [x] 2026-10-25 · **Facturación DECIDIDA: integrada en la v1** (dictado del dueño, interpretado: otros sistemas la dejan por separado y obligan a facturar por fuera; hoy es más simple integrarla, así que se integra). Esto **sustituye** «CFDI fuera de v1» de la ronda 1. Falta definir: proveedor de timbrado (PAC), régimen fiscal e IVA, si cada clínica usa sus propios certificados, cancelaciones y notas de crédito. Confirmar la interpretación.
- [x] 2026-10-25 · **Inventario y precios:** inventario de productos por sucursal; **histórico de precios** de servicios y productos (vigencia de precios).
- [x] 2026-10-25 · **Reportes pedidos:** ingreso por servicio (p. ej. extracción de uñas), por podólogo, por sucursal; incidencias/quejas por podólogo, sucursal, día, mes y año; quién atendió la sesión anterior.
- [x] 2026-10-25 · **Precio de suscripción:** dos opciones sobre la mesa, sin decidir: 400 MXN/mes por podólogo, o 1,000 MXN/mes por clínica (la frase final del dictado quedó incompleta; confirmar si se ofrecen ambas).
- [x] 2026-10-25 · **Datos de prueba (en lugar de piloto):** no hay piloto real; se generará un **set de datos sintéticos congruentes**: varias clínicas, podólogos con agendas distintas, pacientes con padecimientos variados, con **servicios y precios investigados** de páginas reales de podología (ver `docs/INVESTIGACION_PODOLOGIA.md`). Los datos sintéticos nunca se mezclan con datos reales.
- [x] 2026-10-25 · **Meta de producto:** «tomar la cachucha de creativo de producto»: investigar y concebir **el mejor producto para clínicas de podología**. Es objetivo explícito; lo investigado se propone al dueño, no se asume.
- [x] 2026-10-25 · **Análisis de 13 clínicas** (pedido del dueño): `docs/ANALISIS_CLINICAS_SERVICIOS.md`. Propuesta con fuentes, no decisión: el catálogo de servicios debe soportar precio fijo/«desde»/por unidad/«a valorar», vigencia y precio por sucursal, planes multi-sesión, paquetes servicio+producto, anualidad, cabina como recurso agendable, reservas por WhatsApp atribuidas a sede y visita a domicilio.
- [x] 2026-10-25 · **Campos del expediente:** el dueño pide investigarlos (información pública); ver `docs/INVESTIGACION_PODOLOGIA.md` y confirmar en E3.
- [x] 2026-10-25 · **Investigación entregada:** `docs/INVESTIGACION_PODOLOGIA.md` (normativa NOM-004 y LFPDPPP, 6 clínicas con precios, competidores, catálogo semilla). Es propuesta con fuentes y deducciones marcadas, **no decisión del dueño**; faltan fuentes para productos, pie diabético, verrugas y calendario de curaciones, y la NOM-024 no se consultó. Nada es asesoría legal.
- [x] 2026-10-25 · **IA: DECIDIDO → solo en importación.** Dictado por voz, asistente clínico y alertas siguen fuera de la v1.
- [x] 2026-10-25 · **Importación: DECIDIDO → la IA propone el mapeo; una persona (administrador) revisa y confirma la carga.** Vista previa con errores y duplicados; nada se guarda sin confirmación.
- [x] 2026-10-25 · **Rol Paciente: DECIDIDO → solo registro, sin acceso en v1.** Roles con inicio de sesión: podólogo, recepción, administrador.
- [x] 2026-10-25 · **Suscripción: DECIDIDO → dos planes: 400 MXN/mes por podólogo o 1,000 MXN/mes por clínica** (el cliente elige). El cobro automático de la suscripción entra a v1 (ver línea siguiente).
- [x] 2026-10-25 · **DENTRO de la v1 (el dueño pegó la lista y dijo «esto debe incluir»; interpretado como que los cuatro entran):** telemedicina / videoconsulta; app móvil nativa; pagos en línea al agendar (cobro con tarjeta antes de la cita); cobro automático de la suscripción. **Esto amplía mucho el alcance de la v1** y anula la suposición «cobro de suscripción fuera del sistema» y la opción «solo web responsiva». Confirmar la interpretación y ver contradicciones abajo.
- [x] 2026-10-25 · **Portal de agenda y pago: DECIDIDO → el paciente agenda y paga en el portal** (sin cuenta de usuario; liga/portal por clínica). Esto **sustituye** «portal de paciente fuera de v1» en lo que respecta a reservar y pagar; ver expediente o iniciar sesión sigue sin existir en v1. Diseño de la reserva (por clínica, sucursal, podólogo, servicio) a definir en E2.
- [x] 2026-10-25 · **App móvil: DECIDIDO → PWA** (aplicación instalable desde el navegador, no nativa iOS/Android). Roles que la usan: falta confirmar (propuesta: podólogo y recepción).
- [x] 2026-10-25 · **Pasarela de pago: DECIDIDO por el dueño → Clip.** Pendiente de verificar en E3/E4: comisiones, si ofrece cobros recurrentes para la suscripción, pago en línea de la reserva, reembolsos y cómo se factura la suscripción. Hasta verificarlo no se da por hecho que Clip cubra el cobro automático.
- [x] 2026-10-25 · **Videoconsulta: el dueño delegó la elección del proveedor.** **Propuesta (no verificada):** proveedor de video por API embebible (p. ej. Daily.co o Jitsi/JaaS) con sala por cita, sin grabar por defecto; consentimiento informado de telemedicina aceptado por el paciente en el portal antes de la sesión; nota de evolución con marca «a distancia» guardada en el expediente. Decisión final y costos: validar en E3/E4.
- [x] 2026-10-25 · **Plazo: el dueño delegó la división en v1 y v1.1 («no pasa nada»). Propuesta de división:** **v1** = expediente, agenda multi-podólogo/multi-sede, importación con IA, catálogo con precios e histórico, inventario por sucursal, administrativo clonado de IRP, facturación CFDI, portal de reserva y pago con Clip, PWA, reportes pedidos. **v1.1** = videoconsulta y cobro automático de la suscripción (dependen de verificar proveedor/Clip). Confirmar en E3.
- [x] 2026-10-25 · **Más de IRP que se clona: dashboard, mantenimiento (y órdenes de trabajo) y asistente con IA** (el dueño marcó las tres, junto con todo lo ya confirmado). **Contradice «IA solo en importación»:** el asistente con IA de consulta (preguntas en lenguaje natural sobre los números) entra a v1; el dictado por voz y las alertas clínicas siguen fuera. Confirmar si el asistente va en v1 o v1.1 y qué datos puede consultar (cuidar la privacidad entre clínicas). La clonación se hace de IRP `Dashboard`, `ResumenSemanal`, `Mantenimiento`/`ExpedienteMantenimiento`, `asistente/`.
- [x] 2026-10-25 · **Accesos entregados:** el dueño dio token de Supabase y de Netlify y el repo `https://github.com/RANNIX-Claude/clinicapodologo`; guardados en `.env.local` (ignorado por git). **Aún no verificados**: el preflight corre antes de E4. Los tokens se pegaron en el chat: recomendado rotarlos al cerrar el proyecto. Sigue faltando `gh` en esta máquina.
- [x] 2026-10-25 · **Agenda:** varios podólogos y varias sedes por clínica; agenda por podólogo y por sede/consultorio.

## FALTA PREGUNTAR

- [x] ~~Una o varias clínicas~~ → VARIAS (SAAS), 2026-10-25
- [x] ~~Piloto~~ → no hay piloto real, se usarán datos sintéticos (el "sí hay uno" de la ronda 1 queda aclarado: confirmar si existe una clínica real a futuro).
- [x] ~~Alcance nuevo de v1~~ → respondido 2026-10-25 (ver líneas arriba); queda por confirmar: (a) roles de la PWA, (b) viabilidad de Clip para recurrente, (c) proveedor de video, (d) la división v1/v1.1. Texto original: (i) «pagos en línea al agendar» y videoconsulta implican que el paciente agenda/paga por sí mismo, pero el rol Paciente quedó sin acceso y el portal de paciente fuera: ¿cómo agenda y paga el paciente (liga pública por clínica)?; (ii) app móvil nativa: ¿iOS y Android, para qué roles, o PWA?; (iii) pasarela de pago y cobro recurrente (proveedor, comisiones, facturar la suscripción); (iv) videoconsulta: proveedor, consentimiento y expediente de la sesión remota; (v) con todo esto, ¿se mantiene el plazo y se divide en v1/v1.1?
- [x] ~~Contradicciones de alcance~~ → resueltas 2026-10-25 por la VISIÓN DE PRODUCTO COMPLETO: todo entra (CFDI, IA incluido asistente y dictado, telemedicina, PWA, pagos, WhatsApp). Sigue vigente que el rol Paciente no inicia sesión (agenda y paga en el portal sin cuenta). Texto histórico: **Contradicciones a resolver:** (a) ~~CFDI~~ resuelto: integrado en v1 (confirmar interpretación del dictado y definir PAC); (b) ~~IA~~ resuelto; (c) ~~rol Paciente~~ resuelto. Además, Además, el dueño no dio más exclusiones: falta definir fuera de v1 (telemedicina, app móvil nativa, multi-idioma, etc.).
- [x] ~~Precio~~ → dos planes (2026-10-25). Falta: prueba gratuita, forma de cobro y qué pasa al cancelar.
- [ ] Qué ve y qué puede hacer cada rol (podólogo, recepción, administrador); el paciente no inicia sesión.
- [ ] Importación: archivos de muestra, volumen, cómo se manejan duplicados, y si la IA solo propone el mapeo o también carga; costo y llave de IA (hoy no hay).
- [ ] Citas al mes y pico, número de pacientes, sucursales y podólogos por clínica; confirmar la interpretación del paso a paso («acuerda con el podólogo», las 3 citas tras extracción de uña).
- [ ] Validar con un podólogo real los campos del expediente propuestos en la investigación; fotos clínicas, consentimientos y aviso de privacidad (NOM-004 / datos de salud).
- [ ] Agenda: recordatorios por correo/SMS (WhatsApp fuera), duración de citas, cobro al agendar, reglas de cancelación y empalmes.
- [ ] Administrativo: confirmar pantalla por pantalla de IRP (EDR proy_/real_ aplica a una clínica?), y cómo se conecta el ingreso con las consultas cobradas.
- [ ] Portal: confirmar nombre «Pie Firme», correo de contacto y si el 55 1412 0283 es WhatsApp.
- [ ] Accesos (preflight antes de E4): falta `gh`, `NETLIFY_AUTH_TOKEN` sin definir, `SUPABASE_ACCESS_TOKEN` no ve organizaciones (ver `docs/ACCESOS.md`).
