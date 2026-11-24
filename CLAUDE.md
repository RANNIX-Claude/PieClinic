# Pie Firme — RANNIX (producto propio)

SaaS multi-clínica para clínicas de podología: expediente clínico 100 % digital (con impresión fiel a los formatos en papel de Pie Clinic), agenda y citas multi-sede, portal público de reserva y pago sin cuenta, historial, importación de datos con IA, inventario por sucursal, facturación CFDI, y toda la parte administrativa clonada de IRP (gastos, ingresos, estado de resultados, conciliación, fondo revolvente, RH, bitácora, reportes). Lo usan podólogos, recepción y administradores de cada clínica; el paciente no tiene cuenta.

Reglas de negocio: [`REGLAS_NEGOCIO.md`](REGLAS_NEGOCIO.md) (157 reglas; las no confirmadas por el dueño están marcadas «decidido por defecto, revisable»). Requerimiento: [`REQUERIMIENTO.md`](REQUERIMIENTO.md). Esquema: [`docs/CONVENCIONES_ESQUEMA.md`](docs/CONVENCIONES_ESQUEMA.md) y `docs/esquema/*_resumen.md`. Frontend: [`docs/FRONTEND_ARQUITECTURA.md`](docs/FRONTEND_ARQUITECTURA.md) y `docs/frontend/*.md`. Accesos: [`docs/ACCESOS.md`](docs/ACCESOS.md). Pruebas: [`docs/METODOLOGIA_QA.md`](docs/METODOLOGIA_QA.md).

## Estructura publicada
| Ruta | Qué es | Fuente |
|---|---|---|
| `/` | Portal público (botón Iniciar → `/app/`) | `portal/index.html` |
| `/app/` | La aplicación (React Router `basename="/app"`) | `src/` (Vite `base: "/app/"`) |
Portal del paciente sin sesión dentro de la app: `/app/reservar/:clinica`, `/app/cita/:token`, `/app/sala/:token` (solo RPC `portal_*`).

## Base de datos compartida (BITDATA)
Un solo proyecto Supabase con VARIOS sistemas, cada uno en su esquema. Pie Firme: **`piefirme`** (tablas, vistas `prp_*`, RPC) y **`piefirme_app`** (helpers de seguridad, no expuestos). Buckets privados `pf-expedientes`, `pf-fotos-clinicas`, `pf-documentos`, `pf-comprobantes`, `pf-importaciones`, `pf-logos` (ruta `<organizacion_id>/…`, URL firmada). Nunca tocar `public`, `comercio_cdmx`, `comercio_img` ni `comercio_docs`. El frontend lee de vistas `prp_*` y escribe en tablas base; el cliente usa `db.schema = 'piefirme'` (VITE_DB_SCHEMA) y las funciones de servidor `Accept-Profile/Content-Profile`.
Seguridad: RLS por `organizacion_id` + rol + sede en toda tabla; vistas `security_invoker`; `anon` solo ejecuta las RPC `portal_*` declaradas en `tests/rls.config.json`.

## Módulos del frontend (`src/pages/`)
`clinico/` (pacientes, historia, consulta, fotos, planes, pie diabético, plantillas, quejas, esterilización, CRM) · `comercial/` + `portal/` (agenda, caja, facturación, catálogo y precios, paquetes, portal público) · `finanzas/` (dashboard, resumen semanal, ingresos, gastos, EDR, conciliación, fondo revolvente, cuentas, reportes, bitácora) · `plataforma/` (inventario, compras, proveedores, RH, comisiones, mantenimiento, importación IA, usuarios, configuración, suscripción, asistente, exportación, panel RANNIX). Cada área registra sus rutas en `src/routes/<área>.jsx` y su menú en `src/menu/<área>*.js`.

## Roles, cuentas de prueba, móvil, utilerías y warehouse (migración 062)
- Roles de clínica: `administrador`, `podologo`, `recepcion`. **Superadministrador** = perfil `administrador` + fila en `rannix_staff` (RPC `soy_rannix()`; `lib/permisos.js` → `fijarSuperadmin`): opera la clínica como administrador y suma el panel RANNIX. Cuentas de prueba (clave `123456`, solo QA): `a@g.com` superadmin · `m@g.com` administrador · `p@g.com` podólogo · `r@g.com` recepción — `scripts/qa-usuarios-prueba.mjs` (alta y `--quitar`), documentadas en `docs/ACCESOS.md` y visibles en el login salvo `VITE_ENTORNO=prod`. Permisos verificados en la base con `scripts/verificar-roles.mjs qa`.
- Historial de 12 meses (nov-2025 → oct-2026): semillas `supabase/semillas/E_01…E_04` (E_04 cobra la agenda de p@g.com por mes, con `app.ignorar_cierre` como las demás semillas) con `scripts/cargar-historial.mjs` y `scripts/cargar-semilla.mjs` (idempotentes). Limpieza: `scripts/limpiar-datos-prueba.mjs` (solo organizaciones con `parametros.es_prueba`).
- Móvil por rol: `src/pages/inicio/InicioMovil.jsx` (accesos, cifras y agenda del día por rol) + barra inferior por rol en `MobileShell`; el resto de pantallas son las mismas, responsivas.
- Utilerías (grupo UTILERÍAS): bitácora, usuarios y roles, catálogos, configuración, **Salud y errores** (`log_errores`, RPC `salud_sistema`), **Datos de prueba** (RPC `resumen_datos`), importar/exportar y **Data warehouse**.
- Data warehouse: vistas `piefirme.dw_dim_*`, `dw_fact_*`, `dw_kpi_*` (solo administradores, paciente anonimizado) + tablero ejecutivo en `/analisis/ejecutivo`. Diccionario: [`docs/DW_DICCIONARIO.md`](docs/DW_DICCIONARIO.md). Exportación: módulo Data warehouse o `scripts/exportar-dw.mjs`.

## Integraciones (todas en modo SIMULADO hasta que haya llaves; se rotulan en pantalla)
Clip (anticipos), PAC de facturación, IA (importación, dictado, asistente), mensajería (WhatsApp/SMS/correo), video. Adaptadores en `src/lib/adaptadores/`; funciones de servidor en `netlify/functions/` (llaves solo en variables de entorno de Netlify, jamás `VITE_`).

## Comandos
- `node scripts/validar-sql-local.mjs [--semillas]` — aplica todas las migraciones en PGlite (BD desechable), revisa RLS, políticas abiertas, vistas, funciones anon y que nada quede fuera de `piefirme*`.
- `node --test src/lib` — pruebas de la lógica (123).
- `npm run build` — app en `dist/app` + portal en `dist/`.
- `npm run migrate:qa -- migraciones/NNN_x.sql` · `npm run test:rls` — cuando exista la base QA (el registro de migraciones vive en `piefirme._rannix_migraciones`).

## Flujo de trabajo y permisos de Claude
Se desarrolla contra QA. Todo cambio de esquema = archivo numerado en `migraciones/` (aplicado primero a QA). Libre: editar, commits locales, probar en QA, leer producción con `SELECT`. Pide confirmación: `git push`, cualquier script `prod`, despliegues. Nunca credenciales de producción en el fuente; `service_role` solo servidor. Quien construye no juzga: `qa-tester` no lee el código.

## Deuda conocida y trampas
- Los nombres de columnas de varias vistas `prp_*` salen de los resúmenes de esquema y falta confirmarlos contra una base real.
- Todo se validó solo en PGlite; falta `test-rls.mjs` contra QA, `/qa-todo` y las llaves externas (Clip, PAC, IA, mensajería, video).
- Los mockups (`docs/mockups`) tienen cifras de ejemplo inconsistentes entre sí (ver `docs/DECISIONES_CONTRADICCIONES.md`); la fuente de verdad son `REGLAS_NEGOCIO.md` y los formatos reales de Pie Clinic.
- `docs/formatos_reales/` contiene fotos de formatos de una clínica: no subir ni compartir fuera del análisis local.
