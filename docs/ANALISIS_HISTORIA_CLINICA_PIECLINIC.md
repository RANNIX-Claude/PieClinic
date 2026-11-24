# ANÁLISIS DE LA HISTORIA CLÍNICA REAL — formatos de «Pie Clinic Orto-Podólogos»

> 2026-10-25 · El dueño compartió tres formatos en papel (fotos en `docs/formatos_reales/`) y pidió: **(1) registrar el 100 % de los datos** y **(2) generar/imprimir la historia**. Esto es el primer documento real de un usuario final; **manda sobre los campos de la investigación web y sobre los mockups 02/03/10** donde difieran.
> Lo que aparece en las fotos va marcado **[VISTO]**. Lo que agrego por necesidad técnica va **[INFERIDO]**. Lo que depende de una decisión va a «Preguntas».

## 0. Hallazgos que cambian el proyecto

1. **Hay un cliente real probable: «Pie Clinic — Orto-Podólogos»** (logo en los tres formatos; mostrador morado en las fotos). Se confirma con el dueño si es el piloto. Reemplaza «no hay piloto» **solo si el dueño lo confirma**.
2. **Cinco sedes marcadas en el formato:** Chalco, Centenario, Galerías, Patio, Sendero (casillas de la parte superior de «Antecedentes personales»). El expediente es **por paciente con sede de registro**, y el número de expediente está en el formato.
3. **El plan de extracción de uña queda explicado por el consentimiento:** «debo acudir a curación una vez por día durante **4 días consecutivos** hasta lograr una adecuada cicatrización». Interpretación (confirmar): extracción + **4 curaciones diarias consecutivas**. Esto resuelve la contradicción 3 vs 4 visitas (P-028) a favor de **4 curaciones**, no de «3 citas». También implica **curaciones diarias** (cita por día), no cada semana.
4. **El mapa del pie del formato son 4 vistas**: dorsal derecho/izquierdo y plantar derecho/izquierdo (D/I), donde se selecciona sobre la imagen «dónde está el problema». Los mockups tenían un mapa único; debe ser **dorsal + plantar, derecho + izquierdo**.
5. **El diagnóstico es lista corta de casillas**, no CIE-10: onicomicosis, papiloma plantar, pie de atleta, micosis, hiperqueratosis, otros.
6. **La exploración física son 5 siluetas de miembro inferior** (genu valgum, genu varum, normal, genu recurvatum, genu flexum) y en el reverso del formato hay más (en la foto 3 se ve «GENU VARO», «Normal foot», «Varus foot», «Talalgias», rotación): **falta ver el reverso** de «Seguimiento clínico/exploración».
7. **El seguimiento clínico es una tabla** (Fecha / Atendió / Servicio / Observaciones / Próx. visita) y ya registra «quién atendió» por línea y la próxima visita: valida P-025 (quién atendió) y la tabla de seguimiento.

## 1. Formato 1 — Consentimiento informado para tratamiento podológico

| Campo / elemento | Marca | Tipo | Notas |
|---|---|---|---|
| Nombre del paciente | VISTO | texto | |
| Padres/tutores en caso de menor: nombre completo | VISTO | texto | condicional a edad < 18 (regla inferida) |
| Nombre del podólogo que realizará el tratamiento | VISTO | texto → usuario podólogo | |
| «lleva a cabo un tratamiento podológico en (mi/mis) pies» | VISTO | texto fijo | |
| Alcance autorizado (lista fija): examen físico de los pies; tratamiento de callosidades, durezas y verrugas plantares; **extracción de espícula** en uña encarnada con **curación diaria × 4 días**; información de cuidado e higiene; corrección de la marcha y postura ungueal; recomendaciones de cuidado en casa | VISTO | texto fijo con casillas autorizadas (INFERIDO: casillas por procedimiento) | cada clínica podría editarlo |
| Declaraciones: se dio oportunidad de preguntar; resultados varían; no está exento de riesgos; derecho a segunda opinión y a retirar consentimiento | VISTO | texto fijo | |
| Firma y nombre del paciente + fecha | VISTO | firma, fecha | |
| Firma y nombre del podólogo + fecha | VISTO | firma, fecha | |
| Versión del texto, sede, folio de expediente | INFERIDO | | para trazabilidad legal |

## 2. Formato 2 — Antecedentes personales (historia clínica)

| # | Campo | Marca | Tipo / opciones |
|---|---|---|---|
| 1 | Sede (casilla): Chalco, Centenario, Galerías, Patio, Sendero | VISTO | selección única |
| 2 | Fecha | VISTO | fecha |
| 3 | N.º de expediente | VISTO | folio por clínica |
| 4 | Nombre del paciente | VISTO | texto |
| 5 | Domicilio: calle, **Mz**, **Lt**, colonia | VISTO | 4 textos (INFERIDO: CP, municipio, estado) |
| 6 | Edad | VISTO | calculada de fecha de nacimiento |
| 7 | Sexo | VISTO | selección |
| 8 | Ocupación | VISTO | texto |
| 9 | Estado civil | VISTO | selección |
| 10 | Teléfono / Móvil | VISTO | dos teléfonos |
| 11 | Lugar de origen | VISTO | texto |
| 12 | Fecha de nacimiento | VISTO | fecha |
| 13 | Email | VISTO | correo |
| **Antecedentes personales patológicos** | | | «Tiene alguna enfermedad como:» sí/no cada una |
| 14 | Diabetes | VISTO | sí/no |
| 15 | Hipertensión | VISTO | sí/no |
| 16 | Alérgicos (¿a qué?) | VISTO | sí/no + texto |
| 17 | Artritis | VISTO | sí/no |
| 18 | Obesidad | VISTO | sí/no |
| 19 | Traumáticos | VISTO | sí/no |
| 20 | Várices | VISTO | sí/no |
| 21 | VIH | VISTO | sí/no (dato sensible: restringir) |
| 22 | Otras (especifique) | VISTO | sí/no + texto |
| 23 | ¿Toma algún medicamento? ¿Cuál? | VISTO | sí/no + texto |
| 24 | ¿Cuándo fue la última vez que se tomó la glucosa? | VISTO | fecha/texto |
| **Antecedentes heredo-familiares** | | | «Padece alguna enfermedad su:» |
| 25–30 | Padre / Madre / Hermanos / Esposa(o) / Hijos | VISTO | un texto por parentesco |
| **Antecedentes personales no patológicos** | | | |
| 31 | Tabaquismo | VISTO | sí/no |
| 32 | Alcoholismo | VISTO | sí/no |
| 33 | Toxicomanías | VISTO | sí/no |
| 34 | Tipo de calzado | VISTO | texto |
| 35 | N.º de calzado | VISTO | número |
| 36 | ¿Practica algún deporte? ¿Cuál? | VISTO | sí/no + texto |
| 37 | ¿Cuál es el motivo de su consulta? | VISTO | texto |
| 38 | Síntomas | VISTO | texto |
| **Exploración física** | | | |
| 39 | 5 siluetas de miembro inferior: genu valgum, genu varum, normal, genu recurvatum, genu flexum | VISTO | selección múltiple (INFERIDO: por pierna D/I) |
| 40 | Resto de la exploración (reverso del formato: rotación, talalgias, tipo de pie normal/varo, huella plantar…) | **NO VISTO** | pedir foto del reverso |

## 3. Formato 3 — Seguimiento clínico

| Campo | Marca | Tipo |
|---|---|---|
| Nombre / Edad | VISTO | enlazado al paciente |
| Antecedentes (enfermedades hereditarias y no hereditarias), 5 renglones | VISTO | texto largo (resumen de formato 2) |
| **Diagnóstico** (taller diagnóstico inicial y seleccionar sobre la imagen dónde está el problema): casillas **onicomicosis, papiloma plantar, pie de atleta, micosis, hiperqueratosis, otros** | VISTO | selección múltiple + «otros» texto |
| Diagrama: 4 vistas (dorsal D, dorsal I, plantar D, plantar I) para marcar la zona | VISTO | marcas sobre imagen (zona, dedo, uña, plantar) |
| Tratamiento (lo que adquirió), 5 renglones | VISTO | texto largo / servicios y productos adquiridos (INFERIDO: ligar a venta) |
| **Tabla de visitas:** Fecha · Atendió · Servicio · Observaciones · Próx. visita | VISTO | una fila por visita (= cita/consulta) |

## 4. Lo que el sistema debe hacer (100 % de datos + impresión)

**Registro.** Todos los campos de las secciones 1–3 son campos reales del expediente (ninguno se omite). Las casillas sí/no pasan a «Sí / No / No sabe» (INFERIDO) para distinguir «no preguntado» de «no». El diagnóstico y las marcas sobre las 4 vistas del pie son estructurados (se pueden consultar y comparar entre visitas). El texto largo se conserva tal cual.

**Generación e impresión de la historia.** Tres impresos por paciente, con el **mismo diseño del papel** (el podólogo y el paciente reconocen el formato) y los datos ya llenos:
1. **Consentimiento informado** (con nombres, fecha, espacio de firma o firma capturada en pantalla).
2. **Antecedentes personales** (historia clínica completa, con la sede marcada y el N.º de expediente).
3. **Seguimiento clínico** (diagnóstico marcado sobre el diagrama, tratamiento y tabla de visitas con todas las líneas; páginas adicionales si hay más visitas).
Más: botón **«Imprimir historia completa» (PDF)**, **formato en blanco** para llenar a mano, y **«Imprimir solo seguimiento (hoja de visitas)»**. El logo y el nombre del impreso son los **de la clínica** (cada clínica del SaaS sube el suyo); el texto del consentimiento es **plantilla editable por clínica** con versión.
Cada impresión **queda en bitácora** (quién, cuándo, qué) y el PDF lleva marca de versión del expediente.

## 5. Diferencias con lo ya dibujado (a corregir tras E3)

| Mockup | Diferencia con el papel real |
|---|---|
| 02/03 expediente y consulta | faltan: Mz/Lt/colonia, lugar de origen, ocupación, estado civil, 2 teléfonos, heredo-familiares por parentesco, no patológicos (tabaco, alcohol, toxicomanías, deporte), última glucosa, tipo y n.º de calzado, VIH, traumáticos, artritis, obesidad; 4 vistas del pie; 5 siluetas de miembro inferior |
| 10 registrar paciente | mismos faltantes; añadir sede de registro y n.º de expediente |
| 05/19/20 plan de uña | pasa de «3 citas» a **extracción + 4 curaciones diarias** (confirmar) |
| 03 diagnóstico CIE-10 | el papel usa lista corta de 6 casillas; CIE-10 es opcional |
| nuevo | pantallas **50 (captura de historia 100 %)** y **51 (impresión)** — dibujadas junto con este análisis |

## 6. Preguntas nuevas (van a `PREGUNTAS_ABIERTAS.md`, bloque clínico)

- **N-01** ¿Pie Clinic es el cliente piloto? ¿Tiene 5 sedes (Chalco, Centenario, Galerías, Patio, Sendero)? ¿Cuántos podólogos y pacientes?
- **N-02** ¿El reverso de «Seguimiento clínico»/«Exploración» tiene más campos? (pedir foto) ¿Hay otros formatos (receta, hoja de plantillas, cobro)?
- **N-03** Curaciones de uña: ¿realmente son 4 diarias consecutivas, las da la clínica o las hace el paciente en casa? ¿Se cobran?
- **N-04** ¿El VIH y otros datos muy sensibles se muestran a todos o con restricción?
- **N-05** ¿Los impresos llevan firma manuscrita en papel o firma digital en pantalla (o ambas)? ¿Se conserva el papel escaneado?
- **N-06** ¿El formato de consentimiento es el mismo para todas las clínicas o cada una sube el suyo? ¿Quién valida el texto (asesor legal)?
- **N-07** ¿Se migra el expediente en papel existente (importación por foto/escaneo con IA)? ¿Cuántos expedientes?
- **N-08** ¿«N.º de expediente» es consecutivo global, por sede o por clínica? ¿Se conserva la numeración vigente?
