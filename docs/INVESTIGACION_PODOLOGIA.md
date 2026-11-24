# Investigación: dominio podológico en México para "Pie Firme"

Fecha de consulta: octubre 2026. Enfoque México. Cada dato lleva su fuente (URL). Lo marcado **[DEDUCCIÓN]** es criterio propio del investigador, no un dato encontrado. Los precios de páginas de clínicas son de lista/anuncio y pueden haber cambiado; las fuentes de terceros (blogs, directorios) se marcan como tales. Nada de esto es asesoría legal ni médica.

---

## 1. Expediente clínico podológico

### 1.1 Marco normativo (resumen, sin asesoría legal)

**NOM-004-SSA3-2012 (Del expediente clínico)**, según el texto del DOF (15-oct-2012) https://dof.gob.mx/nota_detalle.php?codigo=5272787&fecha=15/10/2012 :
- 6.1 Historia clínica: interrogatorio (ficha de identificación, antecedentes heredofamiliares, personales patológicos y no patológicos, incluido tabaco/alcohol/otras sustancias, padecimiento actual, interrogatorio por aparatos y sistemas), exploración física (habitus exterior, signos vitales, peso, talla, hallazgos por región), resultados de estudios, diagnósticos o problemas clínicos, pronóstico e indicación terapéutica.
- 6.2 Nota de evolución en cada consulta ambulatoria: evolución del cuadro, signos vitales si aplica, resultados relevantes, diagnósticos, pronóstico y tratamiento; en medicamentos, al menos dosis, vía y frecuencia.
- 5.4 Conservación mínima de 5 años desde el último acto médico.
- 5.5 a 5.7 Confidencialidad: no divulgar datos identificables; publicar datos identificables o fotografías con fines de docencia/investigación requiere autorización escrita del paciente; entrega a terceros solo por solicitud escrita del paciente/representante o médico autorizado, y a autoridades.
- 5.9 a 5.11 Toda nota lleva nombre completo, edad, sexo, fecha, hora y nombre y firma de quien la elabora; sin abreviaturas.
- 10.1 Cartas de consentimiento informado: contenido mínimo (establecimiento, título, lugar y fecha, acto autorizado, riesgos y beneficios esperados, autorización para urgencias, firmas del paciente/representante, del médico y de dos testigos). Se exigen en eventos como cirugía mayor, anestesia, procedimientos de alto riesgo o mutilantes (10.1.2).
- Nota importante **[DEDUCCIÓN]**: la norma enumera eventos de consentimiento escrito obligatorio pensados sobre todo para hospital/cirugía; una extracción de uña con anestesia local o una matricectomía caen razonablemente en "procedimiento con riesgo", por lo que lo prudente es pedir carta de consentimiento para cualquier procedimiento invasivo (anestesia local, extracción, matricectomía, láser, cauterización de verrugas). Debe validarlo un abogado/responsable sanitario.
- Una guía de proveedor de software indica que el consentimiento se exige p. ej. para láser y que la NOM-004 define *qué* se registra mientras la NOM-024-SSA3-2012 regula *cómo* funcionan los sistemas electrónicos (interoperabilidad, seguridad, trazabilidad). Fuente (blog comercial, contrastar con DOF): https://agendapro.com/blog/nom-004/
- Un blog de competidor afirma que el expediente electrónico tiene la misma validez que el de papel solo si el sistema cumple NOM-024. Fuente (comercial): https://www.medesk.net/es/blog/expediente-clinico-electronico-vs-papel-mexico/ . No se verificó el texto de la NOM-024 ni la certificación de ningún proveedor.

**LFPDPPP (nueva ley, DOF 20-mar-2025; texto vigente con última reforma DOF 14-nov-2025)**, PDF de la Cámara de Diputados https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf :
- Art. 3 fracc. VI: datos sensibles incluyen estado de salud presente o futuro (también información genética, entre otros).
- Art. 8: para datos sensibles se requiere consentimiento expreso y por escrito (firma autógrafa, firma electrónica o mecanismo de autenticación); no se pueden crear bases de datos con sensibles sin justificar finalidades legítimas y concretas.
- Art. 15: el aviso de privacidad contiene al menos identidad y domicilio del responsable, datos tratados (identificando los sensibles), finalidades (distinguiendo las que requieren consentimiento), opciones para limitar uso/divulgación, mecanismos ARCO y procedimiento para comunicar cambios al aviso.
- Art. 18 y 19: medidas de seguridad administrativas, técnicas y físicas proporcionales a la sensibilidad del dato; notificación inmediata de vulneraciones que afecten significativamente derechos patrimoniales o morales.
- Art. 22 a 34: derechos ARCO (el art. 31 fija plazo máximo de 20 días en el texto consultado; leer el artículo completo antes de implementar).
- Las funciones del extinto INAI pasaron a la Secretaría Anticorrupción y Buen Gobierno según análisis de despachos: https://www.gtlaw.com/es/insights/2025/3/nueva-ley-general-proteccion-de-datos y https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares (no verificado contra DOF).
- **[DEDUCCIÓN]** Implicaciones de producto: casilla/firma de consentimiento de tratamiento de datos de salud ligada al aviso de privacidad versionado; autorización aparte para uso de fotos con fines de docencia/marketing; bitácora de accesos; cifrado; módulo de solicitudes ARCO; retención 5 años mínimo vs. derecho de cancelación (conflicto a resolver con asesoría legal).

### 1.2 Campos propuestos del expediente

Estructura base apoyada en la ficha podológica de AgendaPro https://agendapro.com/blog/?p=1404 (perfil: identificación, sexo, edad, peso, estatura, talla de calzado, contacto, ocupación, deporte; seguimiento: motivo, historial de tratamientos por visita, fotografías de evolución, observaciones, tratamiento, indicaciones; todo firmado y fechado) y en NOM-004 6.1/6.2. El desglose por sistema es **[DEDUCCIÓN]** basada en práctica clínica general y en las fuentes citadas por tema.

**A. Ficha de identificación** (NOM-004 6.1.1): nombre completo, sexo, fecha de nacimiento/edad, CURP (opcional), teléfono, correo, domicilio, ocupación, deporte/actividad, tutor si es menor, contacto de emergencia, sucursal de alta, cómo nos conoció **[DEDUCCIÓN]**, datos de facturación (RFC, régimen, CP) **[DEDUCCIÓN]**.

**B. Antecedentes**
- Personales patológicos: diabetes (tipo, años de evolución, HbA1c, tratamiento), hipertensión, insuficiencia venosa/arterial, neuropatía, enfermedades dermatológicas (psoriasis), inmunosupresión, cardiopatía, anticoagulación (relevante para procedimientos), cirugías previas del pie, amputaciones, úlceras previas.
- Heredofamiliares (diabetes, deformidades).
- No patológicos: tabaquismo/alcohol (NOM-004 6.1.1), actividad laboral (de pie, uniforme/botas), deporte, tipo y horas de calzado, higiene.
- Alergias (látex, anestésicos locales, yodo, adhesivos, medicamentos), medicamentos actuales, embarazo.
- Antecedentes podológicos: uña encarnada recurrente, hongos previos, tratamientos y plantillas previas.

**C. Exploración** (esquema por pie derecho/izquierdo, dedo por dedo)
- Dermatológica: hidratación, hiperqueratosis/callosidades (localización), helomas, fisuras, maceración interdigital, tiña, verrugas, hiperhidrosis, bromhidrosis, lesiones sospechosas.
- Ungueal: por uña (1-5 ambos pies): forma (involutas, incurvadas), grosor, color, onicolisis, onicomicosis (patrón), estado de pliegues, granuloma, inflamación, dolor, signos de infección.
- Ortopédica/biomecánica: tipo de arco (plano/cavo/normal), hallux valgus, dedos en garra/martillo, retropié valgo/varo, dismetría, rangos articulares, patrón de marcha, huella (podoscopio/baropodometría), desgaste del calzado. Evidencia de uso de huella digital/fotopodograma: https://www-optica.inaoep.mx/~tecnologia_salud/2013/1/memorias/conferencistas/FranciscoJavierReneroCarrillo_E_07_06_13.pdf
- Vascular: pulsos pedio y tibial posterior, temperatura, llenado capilar, coloración, várices/edema, índice tobillo-brazo si se realiza. Una revisión mexicana respalda monofilamento e ITB como pruebas útiles para neuropatía y enfermedad arterial: https://www.medigraphic.com/pdfs/medintmex/mim-2021/mim214i.pdf
- Neurológica: monofilamento (sitios plantares), diapasón/vibración, reflejos, sensibilidad térmica/dolorosa; resultado "sensibilidad protectora presente/ausente".
- Pie diabético (guía IWGDF 2023, clasificación): para la úlcera la IWGDF recomienda priorizar **SINBAD** (Site, Ischaemia, Neuropathy, Bacterial infection, Area, Depth; cada ítem 0 o 1, máximo 6 puntos; sitio: antepié=0, medio/retropié=1; isquemia: al menos un pulso palpable=0; neuropatía: sensibilidad protectora intacta=0; infección ausente=0; área <1 cm²=0; profundidad piel/subcutáneo=0). Meggitt-Wagner (0 a 5) es el más antiguo y usado pero con poca discriminación clínica al no incluir área, neuropatía, infección ni enfermedad arterial por separado; la IWGDF sugiere IDSA/IWGDF para infección y WIfI para perfusión. Fuente: https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-03-Classification-Guideline.pdf . Implicación **[DEDUCCIÓN]**: ofrecer SINBAD (puntaje automático) y Wagner (grados 0-5) como campos opcionales, más categoría de riesgo de pie en riesgo y frecuencia de revisión.
- Adicional de peso: escala de dolor, signos vitales (NOM-004 6.2) **[DEDUCCIÓN]**.

**D. Diagnósticos frecuentes** (catálogo con CIE-10 opcional, **[DEDUCCIÓN]**): onicocriptosis (uña encarnada) en grados, onicomicosis, onicogrifosis, onicolisis, hiperqueratosis/callosidad, heloma (dorso/interdigital), verruga plantar (papiloma), tiña pedis (pie de atleta), hiperhidrosis, fisuras de talón, hallux valgus, dedos en garra/martillo, pie plano/cavo, fascitis plantar/talalgia, pie diabético en riesgo, úlcera neuropática, pie geriátrico, trauma ungueal. Los servicios de las clínicas listadas en la sección 2 confirman la mayoría (uña encarnada, onicomicosis, papiloma plantar, pie de atleta, pie plano, verrugas, pie diabético).

**E. Procedimientos**: quiropodia/pedicura clínica, espiculectomía (retiro de espícula), extracción parcial o total de uña, matricectomía química/quirúrgica, ortonixia (corrección con ortesis/brackets), onicoplastia/reconstrucción ungueal, fresado de uña micótica, láser (hongos/pie de atleta/verrugas), crioterapia, electrodesecación/curetaje, ortesis de silicón, plantillas, vendajes funcionales, curaciones.

**F. Evolución por sesión (nota de evolución, NOM-004 6.2)**: fecha y hora, sucursal, podólogo, motivo, hallazgos, procedimiento realizado, productos/materiales usados (lote/caducidad **[DEDUCCIÓN]**), medicamentos indicados (dosis, vía, frecuencia), indicaciones al paciente, fotos antes/después por pie y zona (con consentimiento de uso), respuesta al tratamiento, próxima cita sugerida, firma del podólogo y cédula profesional (cuando aplique).

**G. Consentimientos y avisos**: aviso de privacidad (LFPDPPP art. 15) con consentimiento expreso para datos sensibles (art. 8), consentimiento informado por procedimiento (NOM-004 10.1.1), autorización para fotos con fines de docencia/difusión (NOM-004 5.5.1), consentimiento de menores por tutor.

---

## 2. Servicios, precios, duración y seguimiento (México)

### 2.1 Precios observados en páginas de clínicas (MXN)

| # | Clínica / fuente | Servicio | Precio | Duración | Notas |
|---|---|---|---|---|---|
| 1 | **Leximar** (Col. del Valle, CDMX) https://leximar.com.mx/ | Podológico básico | 400 | 30 min | callos y corte |
| | | Podológico premium | 550 | 50 min | exfoliación e hidratación |
| | | Podología infantil (hasta 12 años) | 200 | 15 min | |
| | | Uña encarnada | 530 | 40 min | anestesia tópica; incluye una curación gratuita si persiste la molestia |
| | | Ortonixias | 700 | n/d | |
| | | Onicomicosis | 250 por uña (onicoplastia), 500 (limpieza y pulido) u 800 (con tópico) | n/d | no incluye medicamento |
| | | Papiloma plantar | 600 | n/d | |
| | | Láser hongos, plantillas, lesiones | valoración gratis, costo después | n/d | |
| 2 | **Consultorio Podológico Mexicano** (CDMX) https://www.consultoriopodologicomexicano.com.mx/ | Básico/Pies sanos | 200 | 30 min | |
| | | Tercera edad | 180 | 28 min | |
| | | Servicio kids | 150 | 30 min | |
| | | Uña encarnada | 300 | 45 min | |
| | | Tratamiento onicomicosis | 250 | 45 min | |
| | | Ortonixia | 300 | 60 min | |
| | | Valoración de pie de riesgo | 250 | 43 min | |
| | | Reconstrucción de lámina ungueal | 800 | 60 min | página con datos inconsistentes entre secciones |
| | | Consulta general | 150 (formulario 100) | 28 min | |
| | | Reorientación ungueal | 120 | 30 min | |
| | | Retiro de gelish | 70 | 15 min | |
| 3 | **Podosmart** (Morelia, Mich.) https://podosmart.com.mx/ | Valoración clínica | 0 | n/d | |
| | | Básico onicomicosis (paquete) | 1,999 promo (lista 2,999) | n/d | tratamiento "puede durar varios meses" |
| | | Pie de atleta con láser | 299 por sesión | n/d | pedicure clínico sugerido cada 4-6 semanas |
| 4 | **Clínica Laser** (El Pueblito, Querétaro) https://www.clinicalasser.com/onicomicosis | Consulta/valoración | 900 | n/d | obligatoria antes del tratamiento |
| | | Láser + ozono | 300 por uña por sesión | n/d | **sesiones separadas 30-35 días**; la página cita 6-8 sesiones |
| | | Servicio podológico preventivo con ozono | 500 | n/d | |
| | | Promo 10 uñas láser+ozono | 1,000 | n/d | |
| 5 | **Piédica** https://www.piedica.com/plantillas-y-estudios/estudio-baropodometrico | Cita inicial | 0 | n/d | |
| | | Estudio de marcha baropodométrico | 1,790 | ~30 min + evaluación | |
| | | Plantillas a la medida | ~1,940 (según modelo) | entrega máx. 15 días hábiles | duran 12-18 meses; replicables tras un año |
| 6 | **Podotech** (Puebla) https://podotech.mx/ | Plantillas con estudio incluido | 3,000 a 5,000 | entrega 15-20 días | ofrece seguimiento para revisar, ajustar o renovar; entrega incluye ajuste; modelos Run y Walk |
| 7 | **Plantillasortopedicas.com.mx** (resumen de buscador, no se pudo abrir la página: 404) https://plantillasortopedicas.com.mx/ | Plantillas | 2,000 regular; promo 1,800 primer par y 1,600 segundo | n/d | valoración gratuita por tiempo limitado; dato de snippet, no verificado |
| 8 | **JPodología** (10 clínicas CDMX/Puebla/Veracruz) https://jpodologia.com.mx/ | Podología integral, uña encarnada, láser Nd:YAG, baropodómetro | no publica precios | n/d | referencia de operación multisucursal; citas por WhatsApp |
| 9 | **Directorio Doctoralia CDMX** (13 profesionales; no son una sola clínica) https://www.doctoralia.com.mx/tratamientos-servicios/tratamiento-para-hongos-en-las-unas/ciudad-de-mexico | Tratamiento para hongos | 250 a 900 (p. ej. Podo Condesa 450, PEDIKA 680, QP Clinic 900) | n/d | precios "desde" |
| 10 | **Directorio AgendaPro CDMX** (resumen de buscador) https://agendapro.com/mp/mx/podologia-general-ciudad-de-mexico | Extracción de uña | ~500 a 510 | 60 min | dato de snippet; no se pudo ver el listado completo |

Clínicas distintas con precios citadas directamente en su propia página: Leximar, Consultorio Podológico Mexicano, Podosmart, Clínica Laser, Piédica y Podotech (6), más Plantillasortopedicas (snippet) y Doctoralia/AgendaPro como directorios.

### 2.2 Referencias de mercado (terceros, no clínicas)

- Profeco vía nota de prensa (CDMX, 2024): quiropodia 250-835; uña encarnada 250-487; onicomicosis 350-2,000. https://www.luznoticias.mx/2024-09-17/mexico/profeco-2024-cuanto-gana-un-podologo-en-mexico/218420 y https://www.heraldobinario.com.mx/empresas/2024/9/12/cuanto-cuesta-una-consulta-con-un-podologo-en-2024-51151.html (cifra relayada por medios; no se abrió el reporte original).
- Cronoshare (nacional, estimado de plataforma): sesión 500-900; quiropodia 700-900; hongos 350-800; estudio de la marcha 700-1,900; plantillas 400-600 (cifra baja frente a las clínicas). https://www.cronoshare.com.mx/cuanto-cuesta/podologo
- Ezpies (blog de una clínica, "2026"): valoración 100-300; pedicura clínica 400-700; uña encarnada/espiculectomía 500-1,500; hongos por sesión 600-2,000; **matricectomía 2,500-4,500**; plantillas personalizadas 1,500-5,000. https://ezpies.com/podologo/cuanto-cobra-un-podologo/

### 2.3 Servicios, rango sugerido y seguimiento

No se encontraron precios publicados en México para: pie diabético (consulta con monofilamento), estudio con uñas postizas/ortesis de silicón, crioterapia de verrugas ni extracción total de uña (solo la cifra de Ezpies para matricectomía). Esas filas son **[DEDUCCIÓN]** y deben validarse con el cliente.

| Servicio | Rango MXN observado | Duración típica | ¿Seguimiento? |
|---|---|---|---|
| Quiropodia / pedicura clínica | 200-900 (Leximar 400-550; CPM 200; Ezpies 400-700) | 30-50 min (Leximar, CPM) | Sí, recurrente cada 4-6 semanas (Podosmart) |
| Podología infantil / adulto mayor | 150-200 | 15-30 min | Recurrente |
| Onicocriptosis / espiculectomía | 300-1,500 (CPM 300; Leximar 530; Ezpies 500-1,500) | 40-60 min | Leximar incluye una curación gratis si persiste molestia; **[DEDUCCIÓN]** cita de control a 7-10 días y control de reincidencia |
| Extracción de uña / matricectomía | espiculectomía/extracción ~500; matricectomía 2,500-4,500 (Ezpies) | 60 min (AgendaPro snippet) | **[DEDUCCIÓN]** curaciones seriadas (p. ej. a 2-3 días, 1 y 2 semanas); no hay fuente mexicana que fije el calendario |
| Ortonixia (ortesis correctiva) | 300-700 | 60 min (CPM) | **[DEDUCCIÓN]** revisiones periódicas porque la ortesis se reajusta |
| Onicomicosis (tópico/onicoplastia) | 250-900 por sesión; 1,999-2,999 por paquete | 45 min (CPM) | Sí, meses (Podosmart) |
| Láser hongos | 300 por uña/sesión; pie de atleta 299 por sesión | n/d | Sí: sesiones cada 30-35 días, 6-8 sesiones (Clínica Laser) |
| Verruga plantar / papiloma | 600 (Leximar) | n/d | **[DEDUCCIÓN]** varias sesiones; la literatura indica que la crioterapia suele requerir más sesiones que el láser (revisión citada en https://dspace.umh.es/handle/11000/38067 y otras; sin precios MXN) |
| Pie diabético / valoración de pie de riesgo | 250 (CPM) | 43 min (CPM) | Sí, **[DEDUCCIÓN]** control periódico según categoría de riesgo |
| Callosidades / durezas | incluido en quiropodia; 250-835 (Profeco) | 30-50 min | Recurrente |
| Estudio de la pisada (baropodometría) | 700-1,900 (Cronoshare); 1,790 (Piédica) | ~30 min | Revisión de plantillas (Podotech) |
| Plantillas ortopédicas | 1,500-5,000 (Piédica ~1,940; Podotech 3,000-5,000) | entrega 15 días hábiles / 15-20 días | Sí: entrega con ajuste y revisión |
| Reconstrucción de uña / uñas postizas | 800 (CPM, reconstrucción de lámina ungueal) | 60 min | **[DEDUCCIÓN]** retoques cada 4-6 semanas |
| Reorientación ungueal | 120 (CPM) | 30 min | n/d |
| Valoración inicial | 0-300 (Podosmart/Piédica 0; Ezpies 100-300; Clínica Laser 900) | n/d | Se descuenta si inicia tratamiento (Ezpies Cancún) |

Hallazgo de modelo de producto **[DEDUCCIÓN]**: casi todas las clínicas combinan servicios de cita única recurrente (quiropodia) con **tratamientos de varias sesiones** (láser, plantillas, post-extracción), por lo que el sistema necesita "plan de tratamiento" con sesiones programadas, paquetes y promo por tiempo limitado, y una "curación gratuita incluida" modelada como servicio de precio 0 ligado a otro.

---

## 3. Productos que se venden

Pocas clínicas publican productos. Lo hallado:
- Plantillas a la medida: ver tabla anterior (Piédica ~1,940; Podotech 3,000-5,000; Plantillasortopedicas 1,600-2,000).
- Antimicóticos de uña tipo laca: Niogermox 8% (ciclopirox) 6.6 ml, 1,184.59 en WeCare Pharma https://wecarepharma.mx/products/isdin-niogermox-8-solucion-laca-ungeal-6-6ml-ciclopirox ; Loceryl (amorolfina) 2.5 ml, 918 en Rappi CDMX https://www.rappi.com.mx/p/loceryl-laca-para-unas-5-15953 (la ficha tiene una inconsistencia de concentración 0.5% vs 5%).
- Podosmart menciona antifúngicos tópicos, plantillas y polvos antimicóticos pero sin precios. Leximar aclara que el tratamiento de onicomicosis "no incluye medicamento para casa".
- No se encontraron precios mexicanos confiables para: cremas de urea 20% (solo precios de EE. UU., no aplicables), separadores/ortesis de silicón, calzado terapéutico, polvos, desodorantes. Mercado Libre bloqueó la consulta (403). Los precios de la siguiente sección para estos productos son **[DEDUCCIÓN]** y requieren cotización.

---

## 4. Propuesta de catálogo semilla (estructura; precios iniciales a validar)

Nota: los precios iniciales están anclados en los rangos observados arriba (mediana/centro del rango de CDMX); los marcados **[DEDUCCIÓN]** no tienen fuente mexicana directa.

### 4.1 Estructura de datos de catálogo
- **Servicio**: código, nombre, categoría (Quiropodia, Ungueal, Dermatológico, Pie en riesgo, Biomecánica, Estética), duración (min), precio de lista, IVA (los servicios de salud profesional suelen estar exentos de IVA, los productos no **[DEDUCCIÓN]**, validar con contador), requiere consentimiento (sí/no), requiere seguimiento (sí/no), plan de seguimiento (lista de sesiones: offset en días, nombre, precio 0 o con costo), permite anestesia, requiere materiales (consumibles).
- **Producto**: SKU, nombre, categoría, marca, precio venta, costo, existencia por sucursal, mínimo, caducidad/lote, requiere receta (no).
- **Precio con vigencia**: tabla de precios por servicio/producto con `vigente_desde`, `vigente_hasta`, `sucursal` opcional (precio por sucursal), motivo (alta inicial, ajuste, promoción). Una promoción (p. ej. Podosmart 1,999 vs 2,999 "por tiempo limitado") se modela como precio con vigencia acotada.
- **Paquete / plan de tratamiento**: n sesiones con precio total (p. ej. láser 6 sesiones), sesiones consumidas, saldo.

### 4.2 Servicios semilla propuestos (precio inicial MXN, duración, seguimiento)
Quiropodia básica 400/30 min (recurrente 4-6 sem); Quiropodia premium 550/50; Podología infantil 200/15; Adulto mayor 180/30; Uña encarnada (espiculectomía) 530/40 + 1 curación gratis a 7-10 días **[DEDUCCIÓN]**; Extracción parcial de uña 800/60 con 3 curaciones **[DEDUCCIÓN]**; Matricectomía química 3,000/60 con 4 controles **[DEDUCCIÓN, anclado a Ezpies 2,500-4,500]**; Ortonixia 500/60; Onicomicosis tópica sesión 500/45; Onicoplastia por uña 250; Láser hongos por uña 300 (plan de 6 sesiones a 30-35 días, Clínica Laser); Láser pie de atleta 299/sesión (Podosmart); Papiloma plantar 600 con 3 sesiones **[DEDUCCIÓN]**; Valoración de pie de riesgo 250/45; Consulta de valoración inicial 150 (descontable); Estudio de la pisada 1,200/30-45 (rango 700-1,900); Plantillas personalizadas (par) 2,500, entrega 15 días hábiles y 1 ajuste; Reconstrucción ungueal 800/60; Retiro de esmalte/gelish 70/15; Reorientación ungueal 120/30.
Vigencia sugerida para datos de prueba: lista base `vigente_desde = inicio del año simulado` y 2-3 ajustes/promociones a mitad de año para probar historial de precios **[DEDUCCIÓN]**.

### 4.3 Productos semilla propuestos (todos **[DEDUCCIÓN]** salvo los anclados)
Laca antimicótica ciclopirox 8% ~1,185 (WeCare); laca amorolfina ~918 (Rappi); crema urea 20% ~250 **[DEDUCCIÓN]**; crema hidratante/emoliente talón ~200 **[DEDUCCIÓN]**; polvo antimicótico ~150 **[DEDUCCIÓN]**; ortesis de silicón (protector de dedo/separador) ~120-250 **[DEDUCCIÓN]**; plantilla prefabricada ~450 **[DEDUCCIÓN]**; calcetas para diabético ~250 **[DEDUCCIÓN]**; calzado terapéutico ~1,500-2,500 **[DEDUCCIÓN]**; kit de cuidado en casa ~350 **[DEDUCCIÓN]**.

### 4.4 Estructura de datos de prueba (solo estructura)
- **3 sucursales**: p. ej. CDMX (Del Valle), Puebla, Querétaro (inspirado en los patrones de JPodología multi-sede y Clínica Laser). Cada una con horario (Leximar: L-V 11-19, S 9-14:30; Clínica Laser: L-V 8:30-20:30, S 9-14:30), inventario propio y posiblemente cabinas/consultorios como recurso agendable (Wellness Tree muestra "Cabina 2" como recurso en https://agendapro.com/site/mx/wellnesstreepodologia/145466 ).
- **~4 podólogos**: uno por sucursal más uno itinerante en dos sedes; con cédula profesional, especialidad (biomecánica, pie diabético, cirugía ungueal), comisión o sueldo, agenda por sucursal.
- **~30 pacientes sintéticos** con distribución de padecimientos (**[DEDUCCIÓN]**): ~6 pie diabético (con SINBAD/Wagner variados, neuropatía, uno con úlcera), ~6 onicocriptosis (uno recurrente con matricectomía), ~5 onicomicosis en plan láser, ~3 verrugas plantares, ~4 biomecánica/plantillas (incluir niño y deportista), ~3 adultos mayores de quiropodia recurrente, ~2 reconstrucción ungueal, ~1-2 menores con tutor, algunos con alergias, anticoagulados y solo-aviso-sin-consentimiento-de-fotos para probar reglas de privacidad; mezcla de paciente en dos sucursales; con y sin facturación.
- Historial: citas completadas, canceladas, no show, tratamientos multi-sesión a medio avance, pagos parciales/anticipos, productos vendidos, fotos de evolución (placeholders), consentimientos firmados y uno pendiente.

---

## 5. Competidores y funcionalidades diferenciadoras

(Fuentes comerciales y comparativas de competidores: sesgadas, verificar con demos.)

| Software | Lo observado | Fuente |
|---|---|---|
| **AgendaPro (podología)** | Ficha clínica podológica personalizable en nube; agenda online 24/7; recordatorios por WhatsApp/SMS/correo programables 1-3 días antes con doble confirmación; consultas en línea; pagos y facturación, cobro con tarjeta/POS, comisiones, control de caja y de inventario, para una o varias sucursales; marketplace en Google Maps; desde ~17 USD/mes (tabla del propio blog) | https://agendapro.com/mx/podologia/software-para-centro-de-podologia ; https://agendapro.com/blog/como-escoger-el-mejor-software-para-tu-centro-medico-aqui-en-mexico/ |
| **Medilink** | 5 herramientas de IA: asistente virtual por WhatsApp, resumen clínico en un clic; desde 35 USD/mes + 9 USD por médico adicional | https://www.medesk.net/es/blog/alternativas-a-medilink/ |
| **Medesk** | Plan gratuito (2 usuarios, 1,000 fichas, 50 citas/mes); CFDI, CIE-10, telemedicina, informes financieros, plantillas por especialidad | misma fuente |
| **Nimbo** | Sala de espera virtual, integraciones WhatsApp/Zoom/Stripe/Google Calendar, soporte 24/7, declara cumplimiento NOM; 13-37 USD/mes | misma fuente |
| **DriCloud** | Dictado por voz con transcripción, plantillas inteligentes, receta electrónica a farmacias, web de la clínica; 130 a 263 USD/mes | misma fuente |
| **Clinic Cloud** | Recordatorios por WhatsApp, análisis de productividad, campañas de marketing; desde 28 USD/mes | misma fuente |
| **Doctoralia / Clinicweb / Nubimed** | Doctoralia: directorio, reseñas, agenda básica; Clinicweb: expediente, facturación, gestión hospitalaria; Nubimed: expediente y receta digital | https://agendapro.com/blog/como-escoger-el-mejor-software-para-tu-centro-medico-aqui-en-mexico/ |
| **MediSel** | Expediente electrónico que se anuncia como certificado NOM-024-SSA3-2012 (afirmación propia, no verificada) | https://apps.apple.com/us/app/medisel/id1266094504 |

Rango de precios en software para consultorios: individual ~25-35 USD/mes, multisucursal >100 USD/mes (AgendaPro, comercial).

Funcionalidades que se repiten y esperan los clientes: recordatorios y confirmación por WhatsApp, facturación CFDI 4.0 sin salir del sistema (guías de compra coinciden), expediente configurable por especialidad con CIE-10, telemedicina, cobro/POS con comisiones, inventario, reportes de productividad, web/reservas públicas.

**Hueco de producto [DEDUCCIÓN]** (no encontré evidencia de que estos competidores ofrezcan especialización podológica profunda; solo AgendaPro tiene ficha podológica genérica y la búsqueda no halló comparación de fotos antes/después ni podograma en ningún software):
1. Mapa del pie interactivo por dedo/uña/zona (callosidades, verrugas, ulceraciones) y exploración neurovascular guiada con puntaje SINBAD/Wagner automático.
2. Línea de tiempo con fotos antes/después con comparador y control del consentimiento de uso de imagen (NOM-004 5.5.1).
3. Planes de tratamiento multi-sesión (láser cada 30-35 días, post-extracción) con paquetes, saldo y agendado automático de curaciones y recordatorio de recurrencia de quiropodia (4-6 semanas).
4. Estudio de pisada/plantillas como flujo con orden de fabricación, fecha de entrega (15 días hábiles), cita de ajuste y recordatorio de renovación a 12-18 meses (Piédica).
5. Multi-sucursal real: precios por sucursal con vigencia, inventario por sede, pacientes compartidos, comisiones por podólogo.
6. Cumplimiento integrado: firma de consentimiento con plantillas por procedimiento, aviso de privacidad versionado, bitácora de accesos, módulo ARCO, conservación de 5 años.
7. Alertas clínicas: diabético sin revisión vencida, anticoagulados antes de procedimiento, alergias a anestésico.

---

## Preguntas que esta investigación deja abiertas

1. ¿Cumple NOM-004 un expediente que solo esté en nube, y qué exige exactamente NOM-024-SSA3-2012 para un SIRES? No se consultó el texto de NOM-024; las afirmaciones de proveedores no se verificaron.
2. ¿Qué procedimientos podológicos exigen carta de consentimiento escrita con dos testigos (NOM-004 10.1) y cuáles basta con consentimiento simple? Requiere validación de abogado/responsable sanitario.
3. ¿Cómo se concilia retención mínima de 5 años (NOM-004 5.4) con el derecho de cancelación de la LFPDPPP? ¿Qué calendario de curaciones post-extracción de uña es estándar? No hay fuente mexicana abierta.
4. ¿Precios reales de: matricectomía, extracción total, pie diabético, crioterapia de verrugas, ortesis de silicón, uñas postizas y calzado terapéutico en México? Sin datos públicos; hay que cotizar con el cliente o por llamada.
5. ¿Los servicios podológicos de Pie Firme son exentos de IVA y qué régimen/CFDI aplica (servicios vs. venta de productos)? Pendiente de contador.
6. ¿Quién es el responsable del expediente (podólogo vs. clínica) en multi-sede, y cédula profesional exigible a cada podólogo? ¿La licenciatura en podología está regulada igual que medicina para firmar notas?
7. ¿Cuáles de los competidores (Medilink, Nimbo, DriCloud) tienen realmente cumplimiento NOM-024 certificado? Se requiere demo y verificación directa.
8. ¿El cliente quiere integrar baropodómetro/podoscopio o solo cargar imágenes de estudio? No se halló un estándar de integración.
9. ¿La LFPDPPP 2025 tiene reglamento secundario y lineamientos de la Secretaría Anticorrupción y Buen Gobierno que cambien el aviso de privacidad? Las notas de despachos no se contrastaron con DOF, y el art. 31 (plazo ARCO) debe leerse completo antes de implementar.
