# ACTA DE QA — Clínicas de Podología (podix) · Pie Clinic

> **BORRADOR — SIN FIRMAR.** Este documento **no libera nada**. La compuerta E6 no se ha cruzado.
> Preparado por el documentador el 21 de noviembre de 2026 a partir del repositorio. **No contiene resultados de ejecución**: los espacios marcados «lo completa el coordinador» están vacíos a propósito.
> Alcance del acta: sistema original (7 roles) + ampliación V2. Ambiente: **modo demostración** (datos generados en el navegador). Sin base de datos, sin datos reales.

## Estado de las compuertas

| Compuerta | Estado |
|---|---|
| E3 — Reglas confirmadas por el cliente | **No firmada.** `REGLAS_NEGOCIO.md` tiene 160 reglas; 12 corresponden a decisiones que el requerimiento ya daba por confirmadas y 148 son «decididas por defecto» |
| E6 — Aprobación del cliente | **No iniciada.** Este es el borrador del acta |

Por lo tanto todo lo que aquí diga «probado» significa **«el código es consistente con sus propias reglas»**, no «el cliente confirmó que así es su negocio».

---

## 1. Qué se probó

### 1.1 Pruebas automáticas de lógica (`npm test` = `node --test tests/`)

Conteo de casos tomado de los archivos de `tests/` el 21 de noviembre de 2026 (un caso = una llamada `test(…)`). Son pruebas de las reglas y acciones sobre el estado; no abren el navegador.

| Archivo | Qué cubre | Casos | Pasaron | Fallaron |
|---|---|---|---|---|
| `tests/reglas.test.js` | Precio por sucursal, PEPS, apartados, mora, niveles de autorización, coherencia de la semilla | 8 | _coordinador_ | _coordinador_ |
| `tests/recepcion.test.js` | Empalmes de agenda, horarios libres, series y folios, anti-duplicados, menores | 5 | | |
| `tests/podologo.test.js` | CIE-10, exploración, alertas, comisión, consulta (cierre con PEPS), adenda, permisos, plan de tratamiento, orden de laboratorio, productividad, recetas | 13 | | |
| `tests/cajero.test.js` | Cobro, pagos, parcialidades, abonos, arqueo, apartado, crédito, turno, devolución | 12 | | |
| `tests/almacen.test.js` | Órdenes de compra y recepción parcial, devolución a proveedor, traspasos, conteo a ciegas, conteo sin señal, ajustes, laboratorio | 9 | | |
| `tests/gerente.test.js` | Ventas, ocupación, periodos, corte con diferencia, cartera vencida, alertas, ubicación de podólogos | 7 | | |
| `tests/autorizaciones.test.js` | Prórroga, crédito, registro asociado, almacén central | 5 | | |
| `tests/admin.test.js` | Ventas netas, global = suma, ocupación, ranking, precio base y ajustes, compras y pagos, permisos, parámetros, usuarios, rotación, reportes, mermas y esterilización, bitácora | 17 | | |
| **Subtotal sistema original** | | **76** | | |
| `tests/personas.test.js` | Checador, horarios, vacaciones, incidencias, prenómina, expediente, finiquito, capacitación, acervo | 20 | | |
| `tests/finanzas.test.js` | Gastos, recurrentes, estado de resultados, consolidado, comparativo, permisos, captura de nota con IA simulada, duplicados | 20 | | |
| `tests/desempeno.test.js` | Atribución, escalones, bono de sucursal, metas y sugerencia, flujo de aprobación, evaluación de clientes, análisis | 24 | | |
| `tests/comercial.test.js` | Tienda, pedidos, entrega, auditoría a distancia, investigaciones, asistente (preguntas, permisos, acciones) | 40 | | |
| `tests/comunicacion.test.js` | Mensajería, correo interno, feed, permisos, no leídos, tamaño del estado | 21 | | |
| `tests/plataforma.test.js` | Data warehouse y su cuadre, ETL, validación de integridad, documentos, catálogos, configuración, consulta a base de datos, entrega, cálculos, consulta asistente (archivo creado durante la redacción de este borrador; dominio en construcción) | 21 | | |
| **Subtotal ampliación V2** | | **146** | | |
| **Total** | 14 archivos | **222** | | |

**Resultado de la corrida — lo completa el coordinador:**

| Dato | Valor |
|---|---|
| Fecha y **hora** de la corrida | ______ |
| Commit (`git rev-parse HEAD`) y repositorio (`git rev-parse --show-toplevel`) | ______ |
| Versión de Node | ______ |
| Casos que pasan / fallan / omitidos | ______ / ______ / ______ |
| Casos que fallan y por qué | ______ |
| Compilación (`vite build`) | ______ |

**Advertencia conocida sobre el resultado:** `tests/cajero.test.js` y `tests/reglas.test.js` tienen cada uno una prueba que depende de la hora del día: si se corre antes de las 9:00, la semilla aún no tiene consultas «cerradas» de hoy y fallan. No es un defecto del sistema sino de la semilla. Si la corrida muestra exactamente esos dos fallos, anotar la hora; si muestra otros, son hallazgos.

### 1.2 Lo que las pruebas automáticas afirman sobre «lo que no puede fallar»

Tomado de los **títulos** de las pruebas (no de su resultado):

| Lo que no puede fallar | Prueba que lo cubre |
|---|---|
| Costo PEPS | `reglas`: «PEPS consume primero la capa más antigua…»; `cajero`: «cobrarVenta: consume PEPS…» |
| Cuadre de caja | `cajero`: «arqueo: diferencias por forma», «turno: … cierre exige justificación y firma» |
| Intereses y recargos | `reglas`: «mora: 10 días de gracia; recargo único…»; `cajero`: «repartirAbono…» |
| Atribución de la venta | `desempeno`: «atribución: vendedorId manda…», «una venta hecha en OTRA sucursal…» |
| Consolidado = suma de las 7 | `finanzas`: «consolidado = suma de las 7 sucursales en cada fila, detalle y total» |
| Bono aprobado congelado | `desempeno`: «flujo calculado → aprobado → pagado…; el monto aprobado queda congelado» |
| La IA no registra sola | `finanzas`: «la IA no registra sola…»; `comercial`: «auditoría: … el ajuste pasa por autorización…» |
| Evidencia del faltante | `comercial`: «línea de tiempo: cuándo empezó a faltar», «auditoría: … sin foto no se guarda» |
| Lo simulado se declara | `finanzas`: «borrador de IA: … marcado como simulado»; `comunicacion`: «correo externo: en demo no envía y lo dice»; `plataforma`: «configuración: … no deja … marcar integraciones como activas» |
| El data warehouse cuadra con la operación | `plataforma`: «DW: Σ importe de dw_fact_ventas = Σ total de tickets no cancelados», «ETL: la semilla trae cargas reales que cuadran en cero» |
| Expediente único entre sucursales | `podologo`: «permisos: otro rol o podólogo ajeno no abre ni cierra», «adenda: solo en cerrada…». **La bitácora de quién consultó el expediente no tiene prueba identificada por título** — por revisar |
| Trazabilidad de esterilización por paciente | `admin`: «mermas y esterilización»; `gerente`: «alertas: stock y biológico pendiente». **La liga set–ciclo–paciente no tiene prueba identificada por título** — por revisar |
| Precio central con historial y motivo | `admin`: «precio base: motivo obligatorio, historial y auditoría; no toca ventas», «permisos: un gerente no puede cambiar precios» |

### 1.3 Corridas formales con escenarios y evidencia

**Ninguna.** No existen `tests/escenarios/`, `tests/corridas/` ni los agentes `qa-*` en este repositorio. Ver `docs/METODOLOGIA_QA.md`.

### 1.4 Revisión manual en el navegador

Sin registro en el repositorio. Si el coordinador u otros agentes revisaron pantallas, **lo completa el coordinador** con: qué pantallas, a qué anchos, con qué cuenta, y evidencia.

---

## 2. Los tres niveles de validación de E6

| Nivel | Qué exige la metodología | Estado | Detalle |
|---|---|---|---|
| 1. Contra los mockups | Cada pantalla contra la imagen aprobada en E3 | **NO HECHO** | Sistema original: existen 15 mockups (`docs/mockups/`), propuestos por Claude y **no validados por el cliente**; no hay comparación registrada. Ampliación: **no hay mockups** (E2 se saltó) |
| 2. Contra las reglas | Casos borde de `REGLAS_NEGOCIO.md`, no el camino feliz | **PARCIAL, SIN CERRAR** | Existen 222 casos automáticos de lógica (resultado pendiente, §1.1). Los escribió quien construyó cada dominio, contra reglas sin firma. Falta: corrida independiente con evidencia y todas las pantallas |
| 3. Contra los números reales, con el cliente | Datos reales y el cliente confirma que los totales cuadran | **NO HECHO** | No se ha recibido ningún dato real. Los números de la demostración son generados (ventas ≈ $250,000 mensuales por sucursal, márgenes de 12 % a 24 %, sueldos de referencia). El ticket que dio el cliente ($800 quiropodia, $2,500 plantillas) **no coincide** con los precios de la semilla |

---

## 3. Qué quedó pendiente

### 3.1 Antes de poder firmar
1. **Firmar E3**: recorrer con el cliente `PREGUNTAS_ABIERTAS.md` (84 preguntas del análisis original + 91 de la ampliación, V2-1 a V2-91) y pasar las respuestas a `REGLAS_NEGOCIO.md`.
2. **Ejecutar y registrar** `npm test` (§1.1) después de las 9:00.
3. **Corrida formal** según `docs/METODOLOGIA_QA.md`: instalar agentes y comandos `qa-*`, generar escenarios, ejecutar con evidencia.
4. **Nivel 1**: validar con el cliente los 15 mockups del sistema original y decidir cómo se valida visualmente la ampliación.
5. **Nivel 3**: cargar datos reales (lista de precios, plantilla de personal y sueldos, gastos de al menos 3 meses, metas y esquemas de bono) y cuadrar con el cliente.

### 3.2 Construcción incompleta al momento de este borrador
6. **Dominio plataforma**: el motor del data warehouse, la semilla, las acciones y sus pruebas (21 casos) existen; **las diez pantallas** (Tablero DW, Control de ETL, Configuración, Documentos, Cálculos, Validación, Catálogos, Consulta a base de datos, Entrega, Consulta asistente) **no existían** en `src/pantallas/mas/` al cerrar este borrador. El menú ya las ofrece. Volver a contar los casos de `tests/plataforma.test.js` antes de firmar: el archivo seguía cambiando.
7. **Tipo de cambio de precio y compra ligada**: pedido en la ampliación, ausente en el dato y en la pantalla.
8. `docs/V2_ESQUEMA.md` (lo escribe otro agente) no existía.

### 3.3 Contradicciones abiertas (deciden negocio)
9. Cuatro definiciones de «ventas» respecto a devoluciones; dos de «utilidad»; ver `METRICAS.md` y `REGLAS_NEGOCIO.md`.
10. La mora se recalcula con el parámetro vigente, contra el supuesto de congelar.
11. La nómina de meses pasados en el estado de resultados usa los sueldos de hoy.
12. El estado de resultados usa comisiones estimadas (2 %) aunque existe el libro de bonos.
13. Gastos del corporativo sin asignar a ninguna sucursal.

### 3.4 Infraestructura (E4) no hecha
14. Conexión a la base QA compartida, esquema `piefirme`; aplicación verificada de las migraciones 064–071; RLS y `test:rls`.
15. Autenticación real (hoy se entra eligiendo una cuenta, sin contraseña).
16. `.env.example`, `.claude/`, `migraciones/`, `scripts/` de base, `tests/rls.config.json`, flujo de CI.
17. Repositorio propio verificado (`RANNIX-Claude/podix`) y su enlace con el sitio de QA `pie-firme-qa`.
18. Respaldo y reversión.

### 3.5 Deuda de pruebas
19. Dos pruebas dependientes de la hora (semilla sin consultas cerradas antes de las 9:00).
20. Sin pruebas de pantalla, de navegación, de anchos de teléfono ni de la tienda en el navegador.
21. Semilla de ≈ 2.2 MB en un almacenamiento de ≈ 5 MB: el margen para fotos y uso prolongado no está medido en dispositivos reales.
22. Concurrencia sin probar (no aplica en un solo navegador; sí en producción).

---

## 4. Qué queda fuera de alcance

No se probó ni se va a probar en esta etapa porque **no se construye** (ver «Qué queda fuera» en `REQUERIMIENTO.md`):

- Nómina legal (ISR, IMSS), timbrado de nómina y finiquitos con validez legal.
- Contabilidad formal, balance, flujo de efectivo y conciliación bancaria.
- Servicios reales de IA, visión, pasarela de pago, correo saliente, WhatsApp y PAC: **simulados**. Solo se verifica que estén rotulados y que no registren nada por sí solos; su precisión no se evalúa.
- Conexión directa a cámaras de seguridad; alojamiento de videos.
- Logística de envíos y facturación de pedidos en línea.
- Portal del paciente con cuenta; aplicación nativa.
- Migración de datos históricos del cliente.
- Producción, rendimiento con volumen real, pruebas de carga y de seguridad en servidor.
- Varias organizaciones a la vez.

El cliente **aún no ha aceptado** esta lista de exclusiones.

---

## 5. Firmas

**Este borrador no está firmado y no debe presentarse como acta.**

| Rol | Nombre | Cargo | Fecha | Firma |
|---|---|---|---|---|
| Cliente (Pie Clinic) | | | | |
| RANNIX | | | | |
| Coordinador de la corrida | | | | |

De aquí en adelante, lo que se descubra **después** de la firma se cobra aparte; lo que se descubra antes, no.
