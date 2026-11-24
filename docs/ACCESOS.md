# ACCESOS Y CREDENCIALES — Clínica de Podología

> Qué necesita Claude para operar sin pedirte scripts. Los valores NUNCA se escriben aquí.

## Una vez por máquina (variables de USUARIO de Windows, no del proyecto)

| Variable / acceso | Para qué | Cómo se obtiene |
|---|---|---|
| `gh auth login` | Crear repo, push, secrets, Actions | `gh auth login` (navegador) |
| `SUPABASE_ACCESS_TOKEN` (`sbp_…`) | Crear proyectos QA/Prod, leer llaves, correr SQL por API | supabase.com → Account → Access Tokens |
| `NETLIFY_AUTH_TOKEN` (`nfp_…`) | Crear sitios, variables de entorno, deploy | app.netlify.com → User settings → Personal access tokens |

Cargarlas sin dejarlas en ningún archivo del proyecto:

```powershell
[Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "<token>", "User")
[Environment]::SetEnvironmentVariable("NETLIFY_AUTH_TOKEN", "<token>", "User")
```

Abrir una terminal nueva después. **No** aprobar comandos que lleven el token escrito con "no volver a preguntar":
Claude Code guarda el comando completo en `settings.local.json` y el token queda en texto plano.

## Por proyecto (los genera Claude; ver `.env.example`)

`node scripts/supabase-api.mjs crear qa` y `crear prod` crean los proyectos y escriben en `.env.local`
las llaves y contraseñas. Los sitios Netlify (QA = rama `develop`, Prod = rama `master`) se crean con el
conector de Netlify o `curl` a `api.netlify.com`; sus variables se cargan por API, no a mano.

| Ambiente | Dónde viven sus secretos |
|---|---|
| QA | `.env.local` y variables del sitio Netlify QA y secrets de GitHub (para el CI) |
| Producción | `.env.local` y **solo** variables del sitio Netlify de producción. Jamás en el fuente |
| Solo servidor | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`: variables de Netlify, nunca `VITE_*` |

## Preflight (Claude lo corre al arrancar)

```
gh auth status
node scripts/supabase-api.mjs orgs        # prueba SUPABASE_ACCESS_TOKEN
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $NETLIFY_AUTH_TOKEN" https://api.netlify.com/api/v1/accounts   # 200
git check-ignore .env.local               # debe imprimir la ruta
```

Si algo falla: **una** pregunta al usuario con la instrucción exacta de arriba, no varias.

## Cuentas de PRUEBA por rol (solo QA)

> ⚠ **Solo ambiente de pruebas.** Comparten la clave `123456` y están a la vista en la pantalla de acceso de QA. **Antes de producción:**
> `node scripts/qa-usuarios-prueba.mjs qa --quitar` (las desactiva) y poner `VITE_ENTORNO=prod` en las variables del sitio de producción (oculta el panel de accesos de prueba).

| Correo | Contraseña | Rol | Qué ve y qué puede |
|---|---|---|---|
| `a@g.com` | `123456` | **Superadministrador** | Todo lo del Administrador + panel RANNIX (clínicas, soporte) + salud del sistema. Perfil `administrador` + fila en `rannix_staff` |
| `m@g.com` | `123456` | Administrador | Toda la clínica: usuarios, finanzas, bitácora, utilerías, warehouse, tablero ejecutivo |
| `p@g.com` | `123456` | Podólogo | Agenda y expediente de su sede, consultas, fotos, comisiones propias. Sin finanzas ni bitácora |
| `r@g.com` | `123456` | Recepción | Agenda, pacientes, caja, inventario operativo. Sin expediente clínico, finanzas ni bitácora |

- Alta/restablecimiento: `node scripts/qa-usuarios-prueba.mjs qa` (idempotente; usa la service_role del servidor, nunca se imprime).
- Verificación en la base (RLS real, no solo botones ocultos): `node scripts/verificar-roles.mjs qa`.
- Hay además cuentas de semilla anteriores (`p1@g.com`…`p5@g.com`, `r1@g.com`, `r2@g.com`, `*@sintetico.test`, `*@ejemplo.invalid`) con la misma intención de prueba.
