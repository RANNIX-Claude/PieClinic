# Clínicas de Podología (podix) — Pie Clinic · RANNIX

Sistema para una **cadena de 7 sucursales de podología** (Pie Clinic, cliente fundador) que además de atender pacientes vende bastones, andaderas, plantillas, calzado y cremas. Cubre el día a día de cada sucursal: agenda y recepción, consulta y expediente clínico único, esterilización, caja con turnos, apartados, crédito y ventas a plazos, almacén con costeo PEPS, compras centralizadas y autorizaciones por nivel. Cada persona entra con su cuenta, ve el menú de su rol y **se firma en la sucursal donde trabaja ese día**; todo lo que registra queda con su nombre y esa sucursal.

Sobre eso, la **ampliación V2** agrega la parte administrativa y de comunidad: recursos humanos con entrada y salida, prenómina y expediente del personal; gastos, compras y **estado de resultados por sucursal**; **bonos y metas**; evaluación por parte de los clientes; análisis de datos y asistente de preguntas del negocio; **tienda en línea** pública; **auditoría de inventario a distancia** por foto; capacitación y acervo; mensajería, correo interno y feed; y los módulos generales de la fábrica. Es un **producto** (no un desarrollo a la medida) y hoy es una **demostración**: datos ficticios en el navegador, servicios externos simulados y reglas sin confirmar por el cliente.

**Estado (21-nov-2026):** modo demostración · compuerta **E3 sin firmar** · sin base de datos conectada · sin producción. La ampliación se construyó antes de la firma: desviación registrada en [`REGLAS_NEGOCIO.md`](REGLAS_NEGOCIO.md).

| Documento | Para qué |
|---|---|
| [`REQUERIMIENTO.md`](REQUERIMIENTO.md) | Qué pidió el cliente (original + ampliación V2) y qué queda fuera |
| [`REGLAS_NEGOCIO.md`](REGLAS_NEGOCIO.md) | 160 reglas con dónde viven en el código y si están confirmadas |
| [`PREGUNTAS_ABIERTAS.md`](PREGUNTAS_ABIERTAS.md) | Lo que falta preguntar: 84 del análisis original + V2-1 a V2-91 |
| [`DICCIONARIO_DATOS.md`](DICCIONARIO_DATOS.md) · [`MODELO_ESTADOS.md`](MODELO_ESTADOS.md) · [`MATRIZ_ROLES.md`](MATRIZ_ROLES.md) · [`METRICAS.md`](METRICAS.md) | Modelo, estados, permisos y menú por rol, fórmulas |
| [`ACTA_QA.md`](ACTA_QA.md) | Borrador sin firmar: qué se probó y qué falta |
| [`docs/ACCESOS.md`](docs/ACCESOS.md) · [`docs/DIAGNOSTICO.md`](docs/DIAGNOSTICO.md) · [`docs/METODOLOGIA_QA.md`](docs/METODOLOGIA_QA.md) | Credenciales (solo nombres), incidencias, pruebas |
| [`docs/ARQUITECTURA_APP.md`](docs/ARQUITECTURA_APP.md) · [`docs/AMPLIACION_V2.md`](docs/AMPLIACION_V2.md) | Cómo escribir pantallas; contrato entre dominios |
| [`docs/MATRIZ_MOVIL.md`](docs/MATRIZ_MOVIL.md) · [`docs/PORTAL.md`](docs/PORTAL.md) · `docs/V2_ESQUEMA.md` | Pestañas por rol; portal; esquema en base (este último lo escribe otro agente; no existía al redactar) |

Para cualquier tarea de pruebas, seguir estrictamente `docs/METODOLOGIA_QA.md`.

## Estructura publicada

| Ruta | Qué es | Fuente |
|---|---|---|
| `/` | Portal público «Pie Clinic Ortopédicos», botón **Iniciar** | `portal/index.html` + `portal/assets/` |
| `/app/` | Aplicación (entrada eligiendo cuenta de demostración) | `index.html` + `src/` (Vite `base: "/app/"`) |
| `/app/<rol>.html` | Puerta instalable por rol: `recepcion`, `podologo`, `asistente`, `cajero`, `almacen`, `gerente`, `admin` | `scripts/gen-iconos.mjs` |
| `/app/#/tienda` | **Tienda en línea pública, sin sesión** | `src/pantallas/publico/tienda.jsx` |

`npm run build` = íconos y puertas + `vite build` (a `dist/app`) + `scripts/build-portal.mjs` (portal a `dist/`). Enrutador con **hash** (`#/agenda`), sin reglas de reescritura. La puerta no otorga el rol: el rol sale de la cuenta.

## Arquitectura en corto

- `src/config/roles.js` — **único** lugar del menú: 4 pestañas + «Más» por rol, secciones y orden del menú lateral. 8 roles de cuenta, 7 menús (`direccion` usa el de `admin`).
- `src/shell/` — entrada, encabezado «Trabajando en: …», **menú inferior en teléfono y menú lateral por secciones en escritorio (1024 px o más)**.
- `src/ui/vista.jsx` — componente **`Vista`: Mosaico | Renglones** para toda lista (personas con foto, productos, gastos). `reducirImagen` antes de guardar cualquier imagen.
- `src/store/core.js` — estado único en `localStorage`, clave **`podologia.demo.v3`**; `mutar()`, `folio()`, `auditar()`. **Aquí se sustituye por la base.**
- `src/store/seed.js` + `src/store/dominios/<dominio>.js` — semilla determinista por dominio: personas → finanzas → desempeño → comercial → comunicación → plataforma.
- `src/store/reglas*.js`, `desempeno_motor.js`, `plataforma_dw.js` — reglas **puras**. `src/store/acciones_<dominio>.js` — acciones que validan el rol dentro de la acción y dejan bitácora.
- `src/pantallas/<app>/<pestaña>.jsx` y `src/pantallas/mas/<key>.jsx` — una pantalla por archivo, registrada por nombre.

## Módulos

| Archivo(s) | Perfil | Función |
|---|---|---|
| `pantallas/recepcion/{agenda,pacientes,sala,pendientes}` · `mas/convenios` | Recepción | Agenda, alta de pacientes, sala de espera, pendientes |
| `pantallas/podologo/{hoy,consulta,pacientes,ordenes}` · `mas/{productividad,recetas}` · `acciones_podologo.js` | Podólogo | Consulta y expediente, órdenes de laboratorio, recetas |
| `pantallas/asistente/{hoy,esterilizacion,insumos,bitacoras}` | Asistente clínico | Esterilización, insumos, bitácoras |
| `pantallas/cajero/{cobrar,porcobrar,apartados,caja}` · `mas/{devoluciones,ventas-turno,nuevo-apartado,venta-plazos}` · `acciones_cajero.js` | Cajero | Cobro, apartados, crédito y plazos, turno y corte |
| `pantallas/almacen/{existencias,recibir,traspasos,conteo}` · `mas/{ajustes,entrega-lab}` · `acciones_almacen.js` | Almacén | Existencias PEPS, recepción, traspasos, conteo |
| `pantallas/gerente/{hoy,autorizar,cajacartera,alertas}` · `mas/{agenda-sucursal,equipo,precios-consulta}` · `acciones_gerente.js` | Gerente | Tablero de sucursal, autorizaciones, caja y cartera |
| `pantallas/admin/{consolidado,autorizar,precios,compras}` · `mas/{parametros,usuarios,rotacion,reportes,bitacora}` · `acciones_admin.js` | Administración y dirección | Consolidado, **catálogo central de precios**, compras, parámetros, usuarios |
| `mas/checador` · `mas/rh` · `acciones_personas.js` · `reglas_personas.js` | Todos (checador) · gerente, admin (RH) | Entrada y salida, asistencia, horarios, vacaciones, incidencias, prenómina, expediente, altas y bajas |
| `mas/capacitacion` · `mas/acervo` | Todos; gestionan gerente y admin | Cursos con evaluación y constancia; acervo con enlaces de YouTube |
| `mas/gastos` · `mas/edr` · `acciones_finanzas.js` · `dominios/finanzas.js` | Gerente (su sucursal), admin | Gastos, recurrentes, cuentas por pagar, **estado de resultados** por sucursal y consolidado |
| `mas/captura-compra` | Almacén, admin | Nota de compra leída por IA (**simulada**) que una persona confirma |
| `mas/bonos` · `mas/mis-bonos` · `acciones_desempeno.js` · `desempeno_motor.js` | Gerente y admin · personal operativo | Esquemas, metas con sugerencia, cálculo → aprobado → pagado |
| `mas/evaluaciones` · `mas/analisis` | Recepción, podólogo, gerente, admin | Encuestas de clientes; series, ranking y comparativos |
| `mas/asistente-ia` · `acciones_comercial_asistente.js` | Gerente, admin | Asistente de preguntas del negocio (motor de reglas) con acciones confirmadas |
| `publico/tienda` · `mas/pedidos-web` · `acciones_comercial.js` | Público · cajero, almacén, gerente, admin | Tienda en línea y atención de pedidos |
| `mas/auditoria-foto` · `acciones_comercial.js` | Almacén, gerente, admin | Auditoría de inventario a distancia e investigaciones |
| `mas/{mensajes,correo,feed}` · `acciones_comunicacion.js` | Todos | Mensajería, correo interno, feed |
| `plataforma_dw.js` · `acciones_plataforma.js` · `dominios/plataforma.js` | Gerente (tablero, catálogos, documentos) · admin (todo) | Data warehouse y ETL, configuración, documentos, catálogos, validación, consulta a base de datos, entrega. **EN CONSTRUCCIÓN: al redactar esto la lógica y sus pruebas existían, pero las 10 pantallas (`tablero-dw`, `control-etl`, `configuracion`, `documentos`, `calculos`, `validacion`, `catalogos`, `consulta-bd`, `entrega`, `consulta-asistente`) no** |

Menú exacto por rol: `MATRIZ_ROLES.md` → «Perfil × pantalla».

## Ambientes

**Ningún ambiente tiene clientes reales.** No hay producción.

| Ambiente | URL | Rama | Datos | Estado |
|---|---|---|---|---|
| Local | `npm run dev` | la de trabajo | `localStorage` del navegador | funciona |
| QA | sitio Netlify **`pie-firme-qa`** (URL por confirmar) | `develop` (según `netlify.toml`) | `localStorage` de cada visitante | enlace con el repositorio **sin verificar** |
| Base QA compartida | — | — | Supabase del sistema hermano, esquema **`piefirme`** | **la aplicación aún no la lee** |
| Producción | — | `master` | — | no existe |

Repositorio: GitHub **`RANNIX-Claude/podix`** (ver la primera trampa). Variables y llaves: solo nombres, en `docs/ACCESOS.md`. Hoy la aplicación no usa ninguna.

**Relación con Pie Firme** (`work/ClinicaPodologia/DEv`): sistema hermano de RANNIX para clínicas de podología, ya con esquema en base. Decisión del dueño: este producto usa **la misma base y el mismo esquema `piefirme`**, con migraciones **064 en adelante** (064–071 ya escritas allá, primero a QA) e incorpora toda su funcionalidad. Diferencias sin resolver: 5 sedes allá y 7 aquí; 3 roles allá y 8 aquí; marca Pie Firme o Pie Clinic (V2-80 a V2-84).

## Flujo de trabajo

1. Se desarrolla en local, en modo demostración. Una pantalla = un archivo; la lógica va en `src/store/`, nunca dentro del componente.
2. Se prueba con `npm test` (222 casos de lógica en 14 archivos al 21-nov-2026) y compilando. Con varios agentes a la vez: `npx vite build --outDir ../.tmp-build-<nombre> --emptyOutDir`, no `npm run build`.
3. Corrida formal de QA: `docs/METODOLOGIA_QA.md` (los agentes `qa-*` aún no están instalados aquí).
4. Cambios de esquema: archivo numerado en las migraciones del esquema `piefirme` (064+), **primero a QA**. Nada de SQL suelto.
5. Producción: no existe. Cuando exista, solo con autorización explícita del usuario.

**Permisos de Claude:** libre para editar y probar en local. Pide confirmación: `git commit`, `git push`, cualquier despliegue, cualquier escritura en la base compartida. Bloqueado: push forzado, `reset --hard`, tocar esquemas que no sean `piefirme`.

## Reglas no negociables

- Nunca credenciales en el fuente. La `service_role` jamás sale del servidor ni lleva prefijo `VITE_`.
- Los permisos se validan **en el dato** (hoy dentro de cada acción; con la base, RLS en toda tabla). Esconder un botón no es permiso.
- **Todo movimiento guarda `usuarioId` y `sucursalId` de la sesión.** De ahí salen bonos e inventario.
- **Lo simulado se rotula** y queda aislado en una función marcada `// INTEGRACIÓN:`. Nunca presentar como real algo simulado.
- **La IA nunca registra sola:** nota de compra y ajuste de inventario exigen confirmación o autorización humana.
- Un bono aprobado, un recibo firmado y el precio de una venta hecha **no se recalculan**.
- Las pantallas no duplican reglas: usan `src/store/`. Una regla nueva se anota en `REGLAS_NEGOCIO.md` con su estado.
- La semilla usa solo el generador determinista (`util.r`), nunca `Math.random()`. Todo dato es ficticio.
- Imágenes: siempre miniatura con `reducirImagen`. Videos: solo el enlace de YouTube.
- Toda lista ofrece Mosaico y Renglones (`Vista`); todo funciona en teléfono (360 px) y en escritorio.
- El service worker guarda solo el armazón; nunca datos.
- Nada de datos reales de pacientes o empleados mientras no haya base con seguridad en el dato.
- Quien construye no juzga: quien ejecuta QA no lee `src/`.

## Diagnóstico de incidencias

Ver [`docs/DIAGNOSTICO.md`](docs/DIAGNOSTICO.md). En corto: verificar versión y navegador (cada navegador tiene su copia de los datos) → pedir folio, usuario, rol y sucursal activa → decidir si es código, dato o **regla sin confirmar** → corregir en el fuente, `npm test`, publicar en QA.

## Deuda conocida y trampas

- **`git` puede no ser el del proyecto.** Al redactar esto, `work/podologia` no tenía `.git` propio y `git` resolvía al repositorio del directorio de usuario, con **otro remoto**. Antes de cualquier commit o push: `git rev-parse --show-toplevel` y `git remote -v` deben mostrar esta carpeta y `RANNIX-Claude/podix`.
- **La compuerta E3 no está firmada** y no hubo mockups de la ampliación. 148 de 160 reglas son supuestos. No discutir un «bug» sin revisar antes si la regla está confirmada.
- **Dos pruebas fallan según la hora:** `tests/cajero.test.js` y `tests/reglas.test.js` fallan antes de las 9:00, porque la semilla aún no tiene consultas «cerradas» de hoy. No es defecto del sistema; no cambiar el esperado.
- **La semilla pesa ≈ 2.2 MB** y `localStorage` admite ≈ 5 MB. `guardar()` falla **en silencio** si se llena: lo capturado se pierde al recargar. Por eso hay tope de 40 fotos de auditoría y de 500 entradas de bitácora.
- **Fechas relativas a hoy:** la semilla se genera con la fecha del día; datos de días anteriores se ven desfasados hasta «Restablecer datos de demo» (que borra lo capturado). Fechas como texto local, sin zona horaria.
- **El menú ofrece pantallas que quizá no existen** (dominio plataforma). Revisar `roles.js` contra `src/pantallas/mas/`.
- **Integraciones simuladas:** modelo de lenguaje (el asistente es un motor de reglas con 15 métricas), visión (lectura de notas y conteo por foto: parten de datos del sistema, no de la imagen), pasarela de pago (referencia `SIM-…`), correo externo, WhatsApp, PAC y terminal bancaria. Estado de cada una en `d.config.integraciones`.
- **Entrada sin contraseña:** se elige una cuenta. El sitio de QA es público.
- **«Ventas» y «utilidad» no significan lo mismo en todos los módulos** (devoluciones, nómina, comisiones): ver el final de `METRICAS.md`.
- **El estado de resultados de meses pasados cambia** si hoy se cambia un sueldo; los meses cerrados salen de un resumen generado, no de tickets; las comisiones son un 2 % estimado; el corporativo no se carga a ninguna sucursal.
- **La mora se calcula con el parámetro vigente**, no con el del día en que se dio el crédito.
- **Falta lo que pidió la ampliación sobre precios:** el «tipo de cambio de precio» y la liga con la compra no existen (solo motivo en texto).
- **Los precios de la semilla no son los del cliente:** quiropodia $450 contra $800; plantillas $450–$780 contra $2,500.
- **Prenómina y finiquito son de demostración**, «por validar con contador»: sin ISR ni IMSS.
- **Datos ficticios con apariencia real:** razón social, RFC y domicilios de la configuración son inventados. El portal sí muestra datos públicos del sitio actual del cliente (`docs/PORTAL.md`).
- **Base compartida:** el proyecto Supabase de QA aloja otros sistemas en otros esquemas. Solo `piefirme` y `piefirme_app`.
- **Faltan del andamiaje de la fábrica:** `.env.example`, `.claude/` (agentes y comandos `qa-*`), `migraciones/` propias, `scripts/` de base, `tests/rls.config.json`, CI.
- Carpetas `docs/Nueva carpeta*`, `docs/portalweb/` y `propuesta/` no son fuente del sistema (las dos últimas están fuera del repositorio por `.gitignore`).
- Sin conexión simulada: Más ▸ «Simular sin señal» (caja y conteo encolan).
