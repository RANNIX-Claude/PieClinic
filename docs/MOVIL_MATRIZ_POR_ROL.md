# Móvil por rol — Matriz (COMPUERTA, pendiente de aprobación)

Proyecto: Pie Firme (`work/ClinicaPodologia/DEv`). Fecha: 2026-11-07. Fuente: `PROMPT_WEBAPP_MOVIL.md` §2.
**No se codifica la interfaz hasta que esta matriz se apruebe.**

## 1. Lo que ya existe (se amplía, no se reconstruye)
- `MobileShell.jsx`: barra superior, barra inferior con 4 accesos por rol (lista `PREFERIDOS` dentro del componente) + «Más» con el menú completo. Mismas páginas que escritorio.
- `InicioMovil.jsx`: puerta de entrada por rol con accesos, cifras y agenda del día.
- PWA: `public/sw.js` es un service worker **sin caché ni cola** (a propósito); un solo `manifests/piefirme.webmanifest` para todos los roles.
- Rol: sale de `AppContext` / `lib/permisos.js` (solo decide qué se muestra); el RLS en la base es lo que manda. Verificado con `scripts/verificar-roles.mjs`. Hallazgo a confirmar: no he revisado ruta por ruta si el enrutador bloquea o solo oculta; se mide en la Tarea 1.
- Roles reales: `administrador`, `podologo`, `recepcion`, superadministrador (= administrador + `rannix_staff`). El paciente no tiene cuenta (portal público `/reservar/:clinica`, `/cita/:token`, `/sala/:token`). «Personal de apoyo» sigue indefinido (P-131), no se le hace móvil.

## 2. Brechas frente al método
1. Los tabs viven en código del componente, no en un archivo de datos → mover a `src/config/movil.tabs.js`.
2. Un solo manifiesto/ícono para todos → un manifiesto instalable por rol (start_url por rol).
3. No hay badges, ni cola sin señal, ni borrador automático.
4. Sin acción dominante (botón flotante) por rol.
5. Tablas de escritorio sin versión en tarjetas (por auditar).

## 3. Matriz por rol

### 3.1 Recepción — de pie en el mostrador, una mano en el teléfono, WiFi estable
Acción dominante: **Cobrar** (tab central).
| Tab | Ícono | Pantalla origen | Acción principal | Se simplifica |
|---|---|---|---|---|
| Hoy | casa | `InicioMovil` | Ver y confirmar citas del día, llegada de pacientes | Cifras y lista del día; sin gráficas |
| Agenda | calendario | `/agenda` | Agendar, confirmar, reprogramar | Vista de día en tarjetas, selector de sede arriba |
| **Cobrar** | recibo | `/caja` | Cobrar servicio/producto, abrir y cerrar turno | Flujo en pasos: paciente → concepto → método → ticket |
| Pacientes | usuarios | `/pacientes` | Buscar, dar de alta, llamar/WhatsApp | Búsqueda primero; alta con campos mínimos |
- «Más»: lista de espera, recordatorios, inventario (consulta), CRM/quejas, perfil, cerrar sesión.
- Badge: citas por confirmar hoy (existe: estado `por_confirmar`).
- Fuera: facturación CFDI masiva, catálogos, reportes, finanzas.

### 3.2 Podólogo — en consultorio o a domicilio, guantes, señal intermitente
Acción dominante: **Iniciar consulta** (botón flotante en «Hoy»).
| Tab | Ícono | Pantalla origen | Acción principal | Se simplifica |
|---|---|---|---|---|
| Hoy | casa | `InicioMovil` | Siguiente paciente y su alerta clínica | Una tarjeta: hora, paciente, motivo, alertas |
| Mi agenda | usuario-check | `/mi-agenda` | Ver mis citas, marcar en atención | Solo mis citas de mis sedes |
| Consultas | estetoscopio | `/consultas` | Abrir/continuar/firmar consulta | Secciones plegables; dictado; borrador automático |
| Pacientes | usuarios | `/pacientes` | Expediente y alertas | Resumen primero, detalle bajo demanda |
- «Más»: fotos clínicas (cámara directa), pie diabético, planes, plantillas/órdenes, comisiones, perfil.
- Badge: consultas abiertas sin firmar (existe: `consulta.firmada`).
- Sin señal: **sí** para captura de consulta y fotos (cola local, se confirma al volver). Requiere diseñar la cola; el SW actual no guarda nada por política de datos de salud → decisión tuya (ver §5).
- Fuera: finanzas, inventario, usuarios, caja.

### 3.3 Administrador — oficina o en movimiento, consulta y autoriza
Acción dominante: ninguna (consulta); sin botón flotante.
| Tab | Ícono | Pantalla origen | Acción principal | Se simplifica |
|---|---|---|---|---|
| Tablero | gráfica | `/analisis/ejecutivo` | Ver mes vs. anterior por sede | Tarjetas KPI + una gráfica; filtro de sede |
| Agenda | calendario | `/agenda` | Ver ocupación, autorizar sobrecupo | Vista de día por sede |
| Caja | recibo | `/caja` | Ver turnos, cortes, cancelaciones | Lista de turnos en tarjetas |
| Alertas | campana | Inicio/alertas | Autorizar, resolver pendientes | Cola única de pendientes |
- «Más»: dashboard financiero, gastos, inventario, usuarios, bitácora, configuración, perfil.
- Badge: pendientes de autorización (**por confirmar si existe tabla de autorizaciones unificada**; si no, se reporta y no se inventa).
- Fuera: captura masiva (importación IA, conciliación, nómina).

### 3.4 Superadministrador RANNIX — soporte, en cualquier lado
Hereda tabs del administrador; en lugar de «Alertas»: **RANNIX** (`/rannix`) con clínicas, planes, uso y cobro; «Más» agrega Salud y errores (`/utilerias/salud`). Solo metadatos; nunca expediente ni finanzas de la clínica.

### 3.5 Paciente (sin cuenta) — celular, 100 % móvil
No lleva tabs: portal público ya móvil-primero (`/reservar`, `/cita/:token`, `/sala/:token`). Se mide desbordamiento y se instala como PWA; sin cambios de alcance.

## 4. Criterios que se medirán por rol
Sin desbordamiento horizontal a 360/390/430 px · áreas táctiles ≥ 44 px · campos ≥ 16 px · tab carga < 2 s en red móvil simulada · flujo principal de punta a punta con datos de la Tarea 0 · permisos validados en servidor (no solo ocultando) · pruebas existentes (`node --test src/lib`, `validar-sql-local`) en verde.

## 5. Decisiones que necesito de ti
1. ¿Apruebas las 4 matrices (3.1–3.4)? Cambios por tab/rol.
2. Sin señal en el podólogo: ¿autorizas guardar localmente consultas y fotos (cifrado, borrado al sincronizar) pese a que hoy el SW evita caché por datos de salud?
3. ¿Se hace un manifiesto instalable por rol (cuatro íconos de inicio) o uno solo con `start_url` según el rol?
