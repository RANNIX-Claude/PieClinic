# HANDOFF — Clínica de Podología · para una sesión nueva de Claude Code

> Léelo completo antes de hacer nada. Este archivo reemplaza la memoria de la conversación anterior:
> todo lo decidido está aquí o en `REQUERIMIENTO.md`. Si algo no está por escrito, no se decidió.
> Escrito el 2026-10-25.

> **ACTUALIZACIÓN 2026-10-25 (tarde) — esto reemplaza lo que contradiga el resto del archivo.** Después de escribir este handoff el dueño
> siguió respondiendo en la sesión `clinica-podologia`. Lo vigente está en `REQUERIMIENTO.md` (sección RESPUESTAS REGISTRADAS), no aquí. Cambios clave:
> **facturación CFDI integrada en la v1** (ya no está fuera; falta definir PAC); **IA para importación flexible** (se sube un Excel en cualquier formato; contradice
> "IA fuera de v1" y está por resolver); **no hay piloto real: se usarán datos sintéticos**; nombre público provisional **«Pie Firme»**; **clínica chica, hasta 20 citas/día**;
> **precio en la mesa: 400 MXN/mes por podólogo o 1,000 MXN/mes por clínica** (sin decidir); **inventario por sucursal e histórico de precios** de servicios y productos;
> reportes pedidos: ingreso por servicio/podólogo/sucursal e incidencias o quejas. Nuevos documentos: `docs/INVESTIGACION_PODOLOGIA.md` (NOM-004, LFPDPPP, competidores, catálogo semilla)
> y `docs/ANALISIS_CLINICAS_SERVICIOS.md` (13 clínicas). Son propuestas con fuentes, **no decisiones**. Commits locales hasta `120aa4f`, sin push.

## 1. Qué es el proyecto

**Clínica de Podología**: plataforma (SAAS, varias clínicas/podólogos entran por `/app/`) para que los podólogos lleven el
**expediente** de sus pacientes, la **agenda y citas**, la **consulta del historial** y la **importación** de datos existentes,
más **toda la parte administrativa de los sistemas de IRP** (gastos, ingresos, estado de resultados, bitácora, proveedores, insumos,
conciliación, fondo revolvente, RH/nómina, usuarios, catálogos, reportes).

Dueño: Roberto Aguilar Cota (RANNIX). **No escribe código a mano**: todo se trabaja de forma agéntica y en español.

## 2. Dónde estamos en la metodología (fábrica RANNIX)

| Etapa | Estado |
|---|---|
| E0 Prospecto | hecho (producto propio con un piloto aún sin nombre) |
| **E1 Requerimiento** | **abierto**: `REQUERIMIENTO.md` creado, 8 respuestas registradas, 11 preguntas pendientes |
| E2 Análisis visual (`/rannix-analisis-visual`) | pendiente (aún no hay mockups) |
| E3 Reglas + firma (compuerta 1) | pendiente. **No se escribe código antes de cerrarla** |
| E4 Infraestructura (`/rannix-arranque`) | pendiente; hay bloqueos de acceso (ver §6) |
| E5 Construcción · E6 QA (`/qa-todo`) · E7 Producción · E8 Operación | pendientes |

Proyecto: `C:\Users\asus\OneDrive\work\ClinicaPodologia\DEv` (git local en `develop`, **sin remoto, sin push, sin infraestructura en la nube**).
El esqueleto de la plantilla ya está commiteado; los archivos de este handoff y los cambios posteriores están sin commit.

## 3. Decisiones ya tomadas (2026-10-25)

1. **Modelo:** SAAS, varias clínicas/podólogos entran por `/app/`; aislamiento por RLS desde el día uno; portal público en `/`.
2. **Fuera de la v1:** facturación CFDI; portal/app del paciente (el paciente NO entra al sistema); recordatorios por WhatsApp; IA y dictado por voz.
3. **Ingresos del producto:** suscripción mensual por podólogo (precio, prueba y cobro: sin definir).
4. **Roles marcados:** Podólogo, Recepción, Administrador, Paciente. **Contradicción abierta:** "Paciente" como rol vs portal de paciente fuera de v1.
5. **Piloto:** existe una clínica/podólogo concreto; falta nombre, contacto y cómo trabajan hoy.
6. **Importación (las cuatro fuentes):** Excel/CSV de pacientes; historial de consultas previas; exportación de otro sistema (cuál: pendiente); papel/fotos escaneadas como adjuntos.
7. **Administrativo de IRP a clonar, completo y con toda su funcionalidad:** gastos, ingresos, estado de resultados (EDR), bitácora, proveedores y productos/insumos, conciliación y fondo revolvente, RH/nómina, usuarios, catálogos y reportes.
8. **Agenda:** varios podólogos y varias sedes por clínica; agenda por podólogo y por sede/consultorio.

Regla del dueño: **clonar, no reconstruir**. Cada pantalla administrativa se clona de IRPAPP con toda su funcionalidad (nunca versión básica); el
resultado es una **copia independiente** (no comparte BD ni código vivo con IRP). En EDR: `proy_*` es manual (admin), `real_*` es automático; nunca pisar `proy_*` desde código.

## 4. Lo que falta preguntar (en este orden)

1. **Piloto:** nombre, contacto, cómo llevan hoy expedientes y agenda (papel, Excel, otro sistema), qué les duele, qué no puede fallar, volumen.
2. **Qué más queda fuera de v1** (inventario clínico, telemedicina, multi-idioma, app móvil nativa…). Obligatoria: el alcance se define por lo que excluye.
3. **Precio:** por podólogo, prueba gratuita, forma de cobro (¿dentro del sistema?), qué pasa al cancelar.
4. **Roles:** qué ve y qué puede hacer cada uno; resolver el rol Paciente.
5. **Importación:** qué sistema es el "otro", formato, volumen, archivos de muestra, manejo de duplicados.
6. **Expediente de podología:** campos propios (exploración del pie, uñas, pie diabético, escalas, fotos clínicas), formato que usen hoy, consentimientos y aviso de privacidad (NOM-004 / datos de salud).
7. **Agenda:** recordatorios por correo/SMS, duración de citas, cobro al agendar, cancelaciones y empalmes.
8. **Administrativo:** confirmar pantalla por pantalla de IRP qué aplica a una clínica (¿EDR `proy_/real_`?) y cómo se conecta el ingreso con las consultas cobradas.
9. **Portal:** dominio, logo y colores, contacto/demo.

Cómo preguntar: con `AskUserQuestion`, en bloques de hasta 4, con una opción recomendada por pregunta. Después de cada bloque,
registra las respuestas en `REQUERIMIENTO.md` (casilla `[x]` con fecha) y actualiza FALTA PREGUNTAR.

## 5. Documentos de referencia

| Qué | Dónde |
|---|---|
| Flujo E0–E8 | `C:\Users\asus\OneDrive\work\__App\fabrica-rannix\metodologia\00-FLUJO.md` |
| Plantilla (de donde nació este proyecto) | `C:\Users\asus\OneDrive\work\__App\fabrica-rannix\plantilla-proyecto` |
| Radiografía de qué debe existir en todo proyecto | `C:\Users\asus\OneDrive\work\RANNIX METEIORO\DEV\Docs\RADIOGRAFIA_PROYECTO.md` |
| IRP (administrativo a clonar) | `C:\Users\asus\OneDrive\work\IRPAPP\DEv` (`src/pages`, `supabase/migrations`, `CLAUDE.md`) |
| MediVoz (referencia de expediente clínico) | `C:\Users\asus\OneDrive\work\MediVoz\medivoz_v5_final\medivoz_v5` |
| Ejemplo de proyecto arrancado igual | `C:\Users\asus\OneDrive\work\Mudyt\DEv` |
| Accesos y credenciales | `docs/ACCESOS.md` |
| Cómo se prueba | `docs/METODOLOGIA_QA.md` |

Skills disponibles en cualquier sesión: `/rannix-prompt-inicial`, `/rannix-nuevo-cliente`, `/rannix-analisis-visual`, `/rannix-arranque`, `/rannix-diagnostico`.
Comandos del proyecto: `/qa-convertir`, `/qa-correr`, `/qa-analizar`, `/qa-corregir`, `/qa-cerrar`, `/qa-todo`.

Del MediVoz se reutiliza solo como **idea** (consulta con notas SOAP, signos vitales, diagnóstico, plan de tratamiento, próxima cita, firma, medicamentos,
bitácora de accesos, auditoría). No se reutiliza sin decisión: capa analítica anónima, puntaje de cumplimiento/alertas, IA clínica. Lo propio de podología no está en MediVoz.

## 6. Accesos (resolver antes de E4, no antes)

Al 2026-10-25 en esta máquina: **falta `gh`** (el `winget install GitHub.cli` falló con 1603 por falta de administrador); **`NETLIFY_AUTH_TOKEN` sin definir**;
**`SUPABASE_ACCESS_TOKEN` es válido pero no ve ninguna organización** (puede ser de otra cuenta). Hasta resolverlos, `/rannix-arranque` no puede crear Supabase, Netlify ni el repo.
Instrucciones exactas en `docs/ACCESOS.md`. Nunca pidas pegar un token en el chat ni lo imprimas.
Además: el token de Netlify de IRP está en texto plano en `IRPAPP/DEv/.claude/settings.local.json`; **no lo uses**, hay que rotarlo.

## 7. Reglas de trabajo en esta sesión

- Español, agéntico, directo. Si decides algo por defecto, dilo en una línea; no listes todas las opciones.
- **No inventes** requisitos: lo no dicho va a FALTA PREGUNTAR. **No hay código de negocio antes de la compuerta E3.**
- QA libre; **producción solo con autorización explícita del dueño**. No hagas `git push` ni `commit` sin que lo pida (el esqueleto ya está commiteado).
- Carpetas de OneDrive pueden estar "solo en la nube": si una lectura falla con "el proveedor de archivos de nube no se está ejecutando", copia con `robocopy /R:2 /W:2` a una carpeta local.
- Todo lo decidido va a un archivo (`REQUERIMIENTO.md`, luego `REGLAS_NEGOCIO.md`); la conversación no se hereda.
- No imprimas llaves ni contraseñas; no abras `.env`, carpetas `key` ni `.PublishSettings`.

## 8. Qué hacer ahora (en este orden)

1. Lee este archivo, `REQUERIMIENTO.md` y `CLAUDE.md`. No abras otras carpetas hasta necesitarlas.
2. Resume en 5 líneas dónde estamos y arranca el **bloque 1 de preguntas** (§4, puntos 1 a 4) con `AskUserQuestion`.
3. Registra las respuestas. Continúa con los bloques siguientes hasta cerrar FALTA PREGUNTAR de E1 (salvo accesos y portal, que pueden esperar).
4. Cierra E1 y propón el siguiente paso: `/rannix-analisis-visual` con mockups (el dueño los comparte o se generan), y luego la sesión de reglas de E3.
5. Al terminar tu turno, di en dos líneas qué quedó registrado y qué sigue. No arranques infraestructura sin el visto bueno del dueño y sin resolver los accesos.
