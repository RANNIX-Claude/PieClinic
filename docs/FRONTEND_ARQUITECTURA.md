# Arquitectura del frontend — Pie Firme

React 18 + Vite (`base: '/app/'`) + React Router (`basename` = `/app`) + React Query + Supabase + lucide-react + react-hot-toast. Estilo y UX clonados de IRP con acento morado `#7B5EA7` (tokens en `src/styles/theme.css`, iguales a `docs/mockups/_base/estilo.css`).

## 1. Cómo se agrega un módulo (en paralelo, sin pisarse)

Cada módulo toca **solo sus archivos**; nadie edita `App.jsx`, `Sidebar.jsx` ni `AppContext.jsx`.

1. **Páginas** en `src/pages/<area>/` (p. ej. `src/pages/agenda/Agenda.jsx`, `src/pages/pacientes/Pacientes.jsx`). Un archivo por pantalla; componentes propios del módulo en `src/pages/<area>/componentes/`.
2. **Rutas**: `src/routes/<area>.jsx` exporta por defecto un arreglo (ejemplo funcional: `src/routes/inicio.jsx`):
   ```jsx
   import { lazy } from 'react'
   import { rolesCon } from '../lib/permisos'
   export default [
     { path: '/agenda', element: lazy(() => import('../pages/agenda/Agenda.jsx')), roles: ['administrador','podologo','recepcion'], titulo: 'Agenda' },
     { path: '/pacientes/:id', element: lazy(() => import('../pages/pacientes/Paciente.jsx')), roles: rolesCon('pacientes.ver'), titulo: 'Paciente', cap: 'pacientes.ver' },
   ]
   ```
   `roles` vacío/omitido = cualquier usuario con sesión. `cap` (opcional) exige además esa capacidad. Si el rol no cumple, se muestra el 403 sin cambiar la URL. Las rutas se descubren con `import.meta.glob('./routes/*.jsx')`; una ruta repetida avisa en consola.
3. **Menú**: `src/menu/<area>.js` exporta por defecto `{ grupo, orden, items }` (ejemplo: `src/menu/inicio.js`):
   ```js
   export default { grupo: 'AGENDA', orden: 10, items: [
     { label: 'Agenda', path: '/agenda', icon: 'CalendarDays', roles: ['administrador','podologo','recepcion'] },
     { label: 'Lista de espera', path: '/lista-espera', icon: 'Clock', roles: ['administrador','recepcion'] },
   ] }
   ```
   Grupos válidos y su orden: `INICIO, AGENDA, PACIENTES, CLÍNICA, VENTAS, INVENTARIO, FINANZAS, EQUIPO, ANÁLISIS, ADMIN, RANNIX` (RANNIX = superadministrador, solo `roles: ['rannix']`). Varios archivos pueden compartir grupo; se mezclan por `orden`. `icon` es el **nombre** de un ícono lucide registrado en `src/lib/iconos.js` (si falta, agrega una línea ahí) o un componente. Los 4 primeros ítems visibles del rol forman la barra inferior del móvil; el resto va en «Más».
4. **Permisos nuevos**: si necesitas una capacidad que no existe, agrégala en `src/lib/permisos.js` (`CAPACIDADES`, según `MATRIZ_ROLES.md`) con una línea; ahí está el único lugar donde viven rol → capacidad.
5. **Rutas con rol `rannix`** no ven datos de salud: solo metadatos (ver MATRIZ_ROLES §3.3).

## 2. Estructura de carpetas

```
src/
  App.jsx                  marco, protección por rol, 403/404/suspendida (NO editar por módulo)
  main.jsx                 QueryClientProvider + estilos
  context/AppContext.jsx   sesión, perfil, organización, sedes, sede activa, tema, solo lectura
  lib/                     supabase, api, urlFirmada, formato, permisos, bitacora, registro, iconos, pwa
  components/layout/       Header, Sidebar, MobileShell, Footer, BannerEstado
  components/ui/           KPICard, StatusBadge, EmptyState, LoadingSpinner, DataTable, Modal, Tabs, FormField,
                           ConfirmDialog, PageHeader, FirmaPad, FotoUploader, ImprimirHoja, EncabezadoOrdenable
  routes/                  UN archivo por módulo (contrato de rutas)
  menu/                    UN archivo por módulo (contrato de menú)
  pages/Login.jsx, pages/auth/, pages/sistema/, pages/inicio/   (propiedad de la base)
  pages/<area>/            páginas de cada módulo
```

## 3. Leer y escribir datos (`src/lib/api.js`)

- **Se LEE de vistas `prp_*`; se ESCRIBE en tablas base** (convención de IRP, `docs/CONVENCIONES_ESQUEMA.md`). Las vistas, columnas y RPC reales están en `docs/esquema/{A,B,C,D}_resumen.md`.
- `leer(vista, { sedeId, filtros, buscar, orden, pagina, tamano, contar, columnas, limite })` → `{ data, error, count }`. Filtra por sede (`sedeId`; con `null` limita a las sedes asignadas del usuario), pagina con `range` y nunca lanza: tú decides qué mostrar. `sedeCol: false` para vistas sin `sede_id`.
- `leerUno`, `contarFilas`, `rpc(nombre, args)`, `insertar(tabla, filas)` (agrega `organizacion_id`), `actualizar(tabla, id, cambios)`, `borrar`. Las de escritura **lanzan** si la clínica está en solo lectura.
- `esVistaInexistente(error)`: úsalo para mostrar estado vacío («vista no disponible aún») en vez de romper si la migración no está aplicada.
- Con React Query: `useQuery({ queryKey: ['agenda', sedeActivaId, fecha], queryFn: () => leer('prp_agenda', { sedeId: sedeActivaId, ... }) })`. Incluye siempre la sede en la `queryKey`. Tras escribir: `queryClient.invalidateQueries({ queryKey: ['agenda'] })`.
- Lecturas de expediente, impresiones y exportaciones: `bitacoraVer / bitacoraImprimir / bitacoraExportar` (`lib/bitacora.js`, RPC `registrar_bitacora`). Los INSERT/UPDATE los audita un trigger; el VIH se lee **solo por RPC** (`ver_dato_sensible`).
- Storage privado: sube con `FotoUploader` o `supabase.storage.from(BUCKETS.x).upload(rutaStorage(orgId, ...), archivo)`; guarda en la tabla solo la **ruta** y muéstrala con `urlFirmada(bucket, ruta)`. Nunca URL pública.
- Funciones servidor (IA, Clip, timbrado): `llamarFuncion('nombre', body)` (envía el token de sesión). La `service_role` jamás va en el cliente.

## 4. Componentes comunes (`src/components/ui`)

| Componente | Uso |
|---|---|
| `PageHeader` | `titulo`, `subtitulo`, `acciones` (botones a la derecha). Envuelve cada página en `<div className="pagina">`. |
| `KPICard` | `title, value, subtitle, icon, color, trend, loading, onClick/activo (filtro), ayuda`. Rejilla: `<div className="grid-kpis">`. |
| `StatusBadge` | `<StatusBadge estado="por_validar" />` mapea estados del esquema a verde/ámbar/rojo/azul/neutro; `variante` fuerza color. Agrega estados nuevos en su `MAPA`. |
| `DataTable` | `columnas=[{key,label,render,valor,align,filtro,sortable}]`, `filas`, `cargando`, `error`, `vacio`, `exportarNombre` (Excel con exceljs, carga bajo demanda y registra «exportar»), `onFila`. Modo servidor: `servidor={{ total, pagina, onPagina, onOrden, buscar, onBuscar }}` con `leer(... pagina, contar)`. |
| `Modal` / `ConfirmDialog` / `useConfirmacion` | Captura en modal; confirmación con motivo obligatorio (`pedirMotivo`) para anular/cancelar. |
| `Tabs`, `FormField`, `EmptyState`, `LoadingSpinner` | Pestañas de expediente, campos con etiqueta/error/ayuda, estados vacío y de carga. Formularios: `react-hook-form` + `zod`. |
| `FirmaPad` | Firma en canvas; `ref.current.toDataURL()` / `toBlob()` / `limpiar()`. La inmutabilidad y huella las pone la BD. |
| `FotoUploader` | Sube a `<organizacion_id>/<carpeta>/<uuid>.jpg`, reduce a 2048 px y ≤ 10 MB (P-007). |
| `ImprimirHoja` | Hoja A4 con encabezado de la clínica (`window.print()`), registra «imprimir». `useImprimir()` para disparar sin botón. |
| `EncabezadoOrdenable` | Orden y filtro tipo Excel por columna (heredado de IRP) para tablas muy filtrables. |

Estilos: usa las clases de `theme.css` (`.card`, `.btn` `.btn.o` `.btn.red`, `.toolbar`, `.field`, `.bd` insignias, `.pagina`, `.grid2`, `.num`, `.modal-*`) y las variables `var(--accent)`, `--green`, `--red`, `--gold`, `--muted`, `--border`. No pongas colores fijos: el tema oscuro depende de las variables.

## 5. Rol y sede

- `useApp()` → `{ user, perfil, rol, organizacion, sedes, sedeActiva, sedeActivaId, setSedeActiva, soloLectura, estadoClinica, tema, isMobile }`.
- `usePermiso('pacientes.editar')` → booleano que respeta rol **y** modo solo lectura. `usePermisos('a','b')` devuelve un objeto. Esconde o deshabilita botones con esto, pero **el RLS es la autoridad**: nunca confíes solo en la interfaz.
- **Sede activa**: el selector del encabezado fija `sedeActivaId` (`null` = todas mis sedes). Pásalo a `leer({ sedeId })` y al crear registros con sede (`sede_id`). Si el usuario tiene una sola sede, el selector es una etiqueta.
- Zona horaria de la clínica: `formato.js` la toma de `organizaciones.zona_horaria` (`fecha`, `hora`, `fechaHora`, `hoyISO`, `limitesDelDia`). Dinero: `moneda()` (MXN); teléfonos: `telefono()`.

## 6. Modo solo lectura (clínica suspendida o dada de baja)

`soloLectura = organizacion.estado in ('suspendida','baja')`. La base ya rechaza escrituras (`app.org_activa()`); la app además: muestra el banner rojo permanente, `usePermiso()` devuelve `false` para toda capacidad de escritura, `FotoUploader` se deshabilita y `insertar/actualizar/borrar` lanzan error. Cada módulo debe ocultar o deshabilitar sus botones de crear/editar con `usePermiso(...)` y seguir permitiendo consultar y exportar. La pantalla `/suspendida` explica el estado.

## 7. Sin Supabase (desarrollo)

Sin `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` la app entra en **modo sin conexión**: banner rojo visible, el login se deshabilita y toda consulta devuelve `error.code === 'SIN_CONEXION'` (nunca datos falsos). Solo con `npm run dev` y sin Supabase puedes abrir `http://localhost:5173/app/?demo=administrador` (o `podologo`, `recepcion`) para ver el marco con un usuario sintético; ese acceso no existe en el build de producción.

## 8. PWA y build

- `public/manifests/piefirme.webmanifest` (theme `#7B5EA7`, `start_url /app/`), íconos en `public/icons/` (generados desde `portal/assets/logo-morado-transparente.png`), `public/sw.js` mínimo sin caché (datos de salud en vivo).
- `npm run build` = `vite build` (a `dist/app`) + `scripts/build-portal.mjs` (portal a `dist/`). `exceljs` se carga bajo demanda.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AMBIENTE` (`QA` muestra una marca en el encabezado). Ver `.env.example`.

## 9. Reglas para quien construye un módulo

1. No importes entre módulos (`pages/agenda` no importa de `pages/ventas`); lo compartido va a `components/ui` o `lib` y se avisa.
2. No toques `App.jsx`, `AppContext.jsx`, `theme.css` ni `permisos.js` salvo agregar líneas (capacidad, estado en `StatusBadge`, ícono).
3. Todo texto de interfaz en español; sin datos reales (usa solo lo que existe en la BD o semillas sintéticas).
4. `proy_*` del EDR es manual (solo administrador): nunca se escribe desde código automático.
5. Cada pantalla: estado de carga, estado vacío, error legible y comportamiento correcto en solo lectura y en móvil (≤ 768 px).
