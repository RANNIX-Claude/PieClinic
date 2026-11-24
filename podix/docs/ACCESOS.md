# ACCESOS Y CREDENCIALES — Clínicas de Podología (podix)

> Qué necesita Claude para operar sin pedir scripts, y dónde vive cada cosa. **Los valores NUNCA se escriben aquí**: solo nombres de variable.
> Estado al 21 de noviembre de 2026: la aplicación corre en **modo demostración**, con todos los datos en el navegador. No usa ninguna llave.

## Cómo está hoy (modo demostración)

| Qué | Dónde vive | Llave |
|---|---|---|
| Datos de la aplicación | `localStorage` del navegador, clave `podologia.demo.v3` (≈ 2.2 MB) | ninguna |
| Último pedido de la tienda | `localStorage`, clave `pieclinic.tienda.ultimo.v1` | ninguna |
| Sesión | Se elige una cuenta ficticia en la pantalla de entrada; **no hay contraseña** | ninguna |
| Permisos | Se validan dentro de cada acción, en el navegador. **No es seguridad real**: quien abra las herramientas del navegador puede leer y cambiar todo | — |
| Servicios externos (IA, visión, pagos, correo, WhatsApp, PAC) | **Simulados** y rotulados en pantalla | ninguna |

Consecuencias que hay que tener presentes:
- No hay datos reales ni personales en la demostración; todo es generado. **No capturar datos reales de pacientes ni de empleados** mientras no exista la base con seguridad en el dato.
- Cada navegador tiene su propia copia. «Restablecer datos de demo» (menú Más) regenera la semilla.
- El portal (`portal/index.html`) muestra datos públicos del cliente tomados de su sitio actual (ver `docs/PORTAL.md`); el formulario de cita no envía nada.

## Una vez por máquina (variables de USUARIO de Windows, no del proyecto)

| Variable / acceso | Para qué | Cómo se obtiene |
|---|---|---|
| `gh auth login` | Repositorio `RANNIX-Claude/podix`: push, secretos, Actions | `gh auth login` (navegador) |
| `SUPABASE_ACCESS_TOKEN` | Leer llaves y correr SQL por API en la base QA compartida | supabase.com → Account → Access Tokens |
| `NETLIFY_AUTH_TOKEN` | Sitio de QA `pie-firme-qa`: variables de entorno y despliegues | app.netlify.com → User settings → Personal access tokens |

Se cargan con `[Environment]::SetEnvironmentVariable("<NOMBRE>", "<valor>", "User")` y se abre una terminal nueva. **No** aprobar con «no volver a preguntar» ningún comando que lleve un token escrito: quedaría en texto plano en `.claude/settings.local.json`.

## Por proyecto — PENDIENTE DE CREAR

Este proyecto **todavía no tiene** `.env.example`, `.env.local`, `.claude/`, `scripts/` de base de datos, `migraciones/` ni `tests/rls.config.json`. El `.gitignore` ya excluye `.env` y `.env.local`. Cuando se conecte a la base se usarán los nombres de la plantilla de la fábrica (los mismos del proyecto hermano):

| Grupo | Variables (solo nombres) | Dónde vivirán |
|---|---|---|
| Navegador (público, apunta a QA en el fuente) | `VITE_AMBIENTE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DB_SCHEMA` | `.env.local` y variables del sitio Netlify de QA |
| Esquema | `DB_SCHEMA`, `DUMP_SCHEMAS` (valor esperado: `piefirme`) | `.env.local` |
| QA | `QA_SUPABASE_REF`, `QA_SUPABASE_URL`, `QA_SUPABASE_ANON_KEY`, `QA_SUPABASE_SERVICE_ROLE_KEY`, `QA_SUPABASE_DB_PASSWORD`, `QA_SUPABASE_DB_HOST`, `QA_SUPABASE_DB_USER`, `QA_SITE_URL`, `QA_NETLIFY_SITE_ID` | `.env.local`; las de servidor, además, en Netlify QA y en secretos de GitHub para el CI |
| Producción | `SUPABASE_REF`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `SITE_URL`, `NETLIFY_SITE_ID` | **No existe producción.** Cuando exista: solo en variables del sitio Netlify de producción; jamás en el fuente |
| Solo servidor (nunca `VITE_*`) | `SUPABASE_SERVICE_ROLE_KEY`, la llave del modelo de lenguaje, la del servicio de visión, la de la pasarela de pago, la del correo saliente, la de WhatsApp y la del PAC | Variables de Netlify, usadas por funciones de servidor. **Ninguna existe todavía**; sus nombres se fijan al contratar cada servicio |

## La base compartida con Pie Firme (decisión del dueño de RANNIX)

- Se usará **la misma base QA y el mismo esquema `piefirme`** del sistema hermano Pie Firme (`work/ClinicaPodologia/DEv`). Es un proyecto Supabase compartido con **otros sistemas en otros esquemas**: nunca tocar esquemas que no sean `piefirme` y `piefirme_app`.
- Las migraciones de la ampliación son **064 en adelante** y hoy viven en el repositorio del sistema hermano (`ClinicaPodologia/DEv/migraciones/064_…` a `071_…`). El detalle del esquema lo documenta `docs/V2_ESQUEMA.md` (lo escribe otro agente; no existía al redactar esto).
- **No verificado:** si esas migraciones ya se aplicaron a QA, y si esta aplicación ya lee de la base. Al redactar esto, **no**: `src/store/core.js` solo usa `localStorage`.
- Las credenciales de QA de ese proyecto viven en el `.env.local` del sistema hermano. No se copian a este documento ni al fuente.
- Riesgo: dos aplicaciones sobre el mismo esquema, con 8 roles aquí y 3 allá, 7 sucursales aquí y 5 allá (preguntas V2-80 a V2-83).

## Repositorio y sitio

| Qué | Valor | Estado |
|---|---|---|
| Repositorio | GitHub `RANNIX-Claude/podix` | **Por verificar.** Al redactar esto la carpeta `work/podologia` no tenía `.git` propio: `git` resolvía al repositorio del directorio de usuario, con otro remoto. Ver «Trampas» en `CLAUDE.md` |
| Sitio de QA | Netlify `pie-firme-qa` | Nombre dado por el dueño; URL y enlace con el repositorio **no verificados** |
| Sitio de producción | — | No existe |

## Política de acceso a producción

**Producción no existe.** Cuando exista, rige la política de la fábrica:

| Operación | Qué requiere |
|---|---|
| Lectura | Libre, solo `SELECT`, por el script de consulta de solo lectura |
| Escritura | `SELECT` previo de exactamente las filas a tocar + aprobación humana explícita |
| Borrado | Lo mismo que escritura, más respaldo verificado del mismo día |
| Despliegue | Autorización explícita del responsable; nunca viernes ni el día de mayor operación |
| Respaldo | Por definir (cuál, cada cuándo, hasta qué punto se recupera). Debe estar activo **antes** del primer dato real |
| Reversión | Por definir y **probar** antes de necesitarla |
| Quién autoriza tocar producción | Por definir (hoy: Roberto, dueño de RANNIX) |

En QA: libre para editar, migrar y probar, pero **solo dentro del esquema `piefirme`**.

## Preflight (cuando se conecte a la base)

```
git rev-parse --show-toplevel      # debe ser la carpeta del proyecto, NO el directorio de usuario
git remote -v                      # debe apuntar a RANNIX-Claude/podix
gh auth status
git check-ignore .env.local        # debe imprimir la ruta
```

Más las pruebas de token de Supabase y de Netlify de la plantilla, cuando existan los `scripts/` de base de datos. Si algo falla: **una** pregunta al usuario con la instrucción exacta, no varias.
