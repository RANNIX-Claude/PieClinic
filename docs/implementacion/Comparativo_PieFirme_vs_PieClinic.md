# Comparativo de funcionalidad: Pie Firme vs. versión Pie Clinic

**Pie Firme** es el sistema principal y completo (`work/ClinicaPodologia/DEv`). **Pie Clinic** es el cliente al que se le implementa; la columna "Pie Clinic" describe su demo (PODIX, `work/podologia`), que sirve como referencia de las funciones que se quieren. Es **un solo sistema**: ver [Procesos_y_Flujos_PieClinic.md](Procesos_y_Flujos_PieClinic.md). Los roles se muestran tal como están en cada código.

## Cómo leer la tabla

| Símbolo | Significa |
|---|---|
| ✅ | Hay pantalla y lógica |
| 🗄 | Solo existe el **esquema en base de datos**; **no encontré pantalla** en el frontend |
| 🟡 | Parcial, o no pude confirmar su alcance (solo revisé nombres de pantallas y tablas) |
| ❌ | No existe |

**Dos advertencias**
- Revisé **nombres de pantallas, rutas, menús y tablas**; no abrí cada pantalla ni la ejecuté. "✅" quiere decir "existe", no "probado".
- **Pie Firme** corre contra Supabase con RLS verificada en QA. **Pie Clinic** es una demostración con datos ficticios en el navegador (`localStorage`), sin base de datos. La columna dice si la función existe; el respaldo técnico es distinto en cada uno.

## 1. Plataforma y roles

| Tema | Pie Firme | Pie Clinic |
|---|---|---|
| Base de datos | Supabase, esquema `piefirme`, 72 migraciones | ❌ demo en navegador |
| Seguridad por sede y rol (RLS) | ✅ verificada en QA | ❌ solo validación en el navegador |
| Roles | Administrador, podólogo, recepción (más superadmin RANNIX) | Recepción, podólogo, asistente clínico, cajero, almacén, gerente, administración/dirección |
| Multi-clínica (panel RANNIX, suscripción) | ✅ | 🟡 el menú lo trae; es demo |
| Móvil y PWA | ✅ inicio móvil por rol | ✅ puertas instalables por rol |
| Integraciones (Clip, PAC, IA, WhatsApp, video) | Simuladas, sin llaves | Simuladas, sin llaves |

## 2. Clínico

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Pacientes y expediente único | ✅ | ✅ |
| Historia clínica con impresión fiel a los formatos de Pie Clinic | ✅ | 🟡 |
| Consulta, exploración y mapa del pie | ✅ | ✅ |
| Fotos clínicas y comparar evolución | ✅ | ✅ |
| Planes de tratamiento | ✅ | ✅ |
| Pie diabético | ✅ | ✅ |
| Plantillas ortopédicas y orden a laboratorio | ✅ | ✅ (más entrega de plantillas) |
| Esterilización de instrumental | ✅ | ✅ (app propia del asistente clínico) |
| Quejas y derechos ARCO | ✅ | ✅ |
| Recetas | 🟡 | ✅ |
| Dictado por voz | ✅ simulado | ❌ |
| Videoconsulta | ✅ simulado | ❌ |
| Seguimiento de pacientes (CRM) y campañas | ✅ | ✅ |
| Pacientes dormidos con mensaje de reactivación | 🟡 | ✅ |
| Documentos y formatos, consentimientos | ✅ | ✅ |

## 3. Agenda y portal del paciente

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Agenda multi-sede y citas | ✅ | ✅ |
| Lista de espera, horarios, bloqueos y festivos | ✅ | ✅ |
| Recordatorios de cita | ✅ | ✅ |
| Sala de espera | ✅ | ✅ |
| **Portal público de reserva y pago sin cuenta** | ✅ | ❌ |
| Paquetes y membresías | ✅ | ✅ |
| Convenios (empresas, aseguradoras) | 🟡 | ✅ |

## 4. Caja y ventas

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Caja, cobro y tickets | ✅ | ✅ |
| Turnos, arqueo y corte de caja | ✅ | ✅ (más cambio de turno con firma) |
| **Anticipos** con terminal Clip | ✅ | 🟡 sin terminal |
| **Apartados** con vigencia y anticipo mínimo | ❌ (solo cuentas por cobrar) | ✅ |
| **Crédito y ventas a plazos**, interés y recargo | ❌ | ✅ |
| Devoluciones de cliente | 🟡 | ✅ |
| Facturación CFDI | ✅ simulado | 🟡 |
| Catálogo y precios | ✅ | ✅ |
| Lista base con ajuste por sucursal | 🟡 | ✅ |
| Comisiones por servicio | ✅ | ✅ |
| Escáner y código de barras en caja | ✅ | ✅ |
| Pantalla secundaria para el paciente | ❌ | ❌ |
| Control de notas foliadas de contingencia | ❌ | ❌ |

## 5. Inventario y compras

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Inventario por sucursal con costeo PEPS y kardex | ✅ | ✅ |
| Traspasos | ✅ | ✅ (más reparto desde el almacén central con faltantes) |
| Compras, orden y recepción | ✅ | ✅ |
| Proveedores y su expediente | ✅ | ✅ |
| Mermas y conteos | ✅ | ✅ |
| Expediente de producto | ✅ | ✅ |
| Requisición formal de sucursal a matriz | ❌ | ❌ |
| **Auditoría de inventario a distancia con foto** | 🗄 | ✅ |
| **Captura de nota de compra con IA** | 🗄 | ✅ simulada |
| **Tienda en línea y pedidos web** | 🗄 | ✅ |
| Mantenimiento de equipos | ✅ | ✅ |

## 6. Finanzas

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Ingresos y gastos | ✅ | ✅ |
| Fondo revolvente | ✅ | ✅ |
| Conciliación bancaria | ✅ | ✅ |
| Cuentas por pagar y por cobrar | ✅ | ✅ |
| Estado de resultados por sucursal | ✅ | ✅ |
| Cierre de periodos | ✅ | ✅ |
| Resumen semanal y dashboard financiero | ✅ | ✅ |
| Reportes y bitácora | ✅ | ✅ |
| Gastos recurrentes | 🗄 | ✅ |

## 7. Personas y desempeño

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| RH, nómina y recibos | ✅ | ✅ |
| **Checador** de entrada y salida | 🗄 (con lógica en `lib`) | ✅ |
| **Rotación** de podólogos entre sucursales | 🗄 | ✅ |
| **Bonos y metas** por sucursal e individuales | 🗄 | ✅ |
| **Evaluaciones de clientes** | 🗄 | ✅ |
| **Capacitación** con evaluación y **acervo** de videos | 🗄 | ✅ |

## 8. Comunicación

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Mensajes, correo interno y feed | 🗄 | ✅ |
| WhatsApp a pacientes | ✅ simulado | ✅ simulado (con ruta para envío real) |

## 9. Análisis y utilerías

| Función | Pie Firme | Pie Clinic |
|---|---|---|
| Tablero ejecutivo | ✅ | ✅ |
| **Tablero del dueño** (ranking de sucursales contra meta, margen por línea y marca) | 🟡 | ✅ |
| Data warehouse | ✅ | 🟡 algunas pantallas aún en construcción |
| Análisis de datos y asistente IA de preguntas | ✅ | ✅ |
| Importación con IA / exportación de datos | ✅ | ✅ |
| Usuarios, configuración, catálogos | ✅ | ✅ |
| Salud y errores, datos de prueba, consulta a base | ✅ | 🟡 |

## 10. Conteo

| | Pie Firme | Pie Clinic |
|---|---|---|
| Funciones propias que la otra no tiene | Portal de reserva y pago, dictado, videoconsulta | Apartados, crédito y plazos, devoluciones de cliente, reparto desde almacén central, tablero del dueño, dormidos, convenios, recetas |
| Funciones con solo esquema, sin pantalla | 13 (checador, rotación, bonos, evaluaciones, capacitación, acervo, mensajes, correo, feed, tienda, auditoría con foto, nota con IA, gastos recurrentes) | — |
| Funciones que ninguno tiene y se pidieron en la junta | Pantalla al paciente · notas foliadas de contingencia · requisición formal · generación de etiquetas propias | igual |

## 11. Lo que muestra la comparación

1. **Pie Clinic no es un subconjunto de Pie Firme.** Son dos códigos distintos. El menú de Pie Clinic marca varias pantallas como "Incorporado de Pie Firme (V3)", pero Pie Clinic además tiene funciones que Pie Firme no tiene: apartados, crédito a plazos, devoluciones y reparto central.
2. **Para que Pie Firme sea el sistema completo**, le faltan:
   - **Pantallas** de los módulos que ya tienen esquema: checador, rotación, bonos, evaluaciones, capacitación, mensajería, tienda en línea, auditoría con foto y nota de compra con IA.
   - **Funciones sin esquema**: apartados, crédito y plazos, devoluciones de cliente y reparto desde almacén central.
3. **Para que Pie Clinic llegue a producción**, le falta lo que Pie Firme ya tiene: base real con RLS, portal de reserva y pago, y las integraciones reales.
4. **Camino natural**: llevar a Pie Firme lo que solo existe en Pie Clinic, y que Pie Clinic use la base y la seguridad de Pie Firme.
5. **Faltantes pedidos en la junta que hoy no está en ninguno**: pantalla al paciente, notas foliadas de contingencia, requisición formal y etiquetas propias.

## 12. Por verificar
- Si las funciones marcadas "🗄" tienen pantalla que no encontré (revisé `src/pages`, `src/routes` y `src/menu`).
- El alcance real de las celdas "🟡".
- Cuántas sucursales tiene realmente Pie Clinic: esta comparación no depende de ello, pero los documentos hablan de 5 (Pie Firme) y de 7 (Pie Clinic).
