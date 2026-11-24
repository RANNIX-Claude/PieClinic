# Pie Clinic — implementación sobre Pie Firme

Un solo sistema: **Pie Firme** (producto de RANNIX). Pie Clinic es el cliente al que se le implementa. Este repositorio junta, sin regenerar nada, lo que ya estaba construido y validado.

## Qué hay aquí

| Ruta | Qué es | Origen |
|---|---|---|
| `/` (raíz) | **Pie Firme completo**: aplicación (`src/`), esquema (`migraciones/` 001 a 075), semillas, funciones de Netlify, scripts, pruebas y documentos del producto | `work/ClinicaPodologia/DEv` |
| `podix/` | **PODIX completo**: la demostración para la junta de dueños, con las pantallas y reglas de apartados, crédito, reparto central, tablero del dueño, etc. Es la referencia validada de lo que falta portar a Pie Firme | `work/podologia` |
| `docs/implementacion/` | Minuta de la junta, plan de operación paralela de diciembre, procesos y flujos, comparativo, validación contra macroprocesos, plan de construcción | `work/PieClinic` |
| `migraciones/073` a `075` | Ola 1a de la implementación: rol supervisor, funciones habilitadas, PIN personal, parámetros de los dueños, liberación de funciones por RANNIX y documentación dentro del sistema | nuevas, aditivas |

No se copiaron `.env.local`, `.netlify`, `node_modules` ni `dist`.

## Despliegue de la base (Supabase)

Las 58 migraciones están aplicadas en el proyecto `esximvxedczymlueyzfb` (comparte base con otro sistema; todo vive en los esquemas `piefirme` y `piefirme_app`, buckets `pf-*`). El esquema `piefirme` está expuesto en la API de datos. El registro de lo aplicado está en `piefirme._rannix_migraciones`.

Para aplicar migraciones nuevas: `node scripts/apply-migration.mjs qa --pendientes` (requiere `QA_SUPABASE_REF` y `QA_SUPABASE_DB_PASSWORD` en `.env.local`; ver `.env.example`).

## Pendiente

- Organización de Pie Clinic y usuarios (dueños, supervisora, caja, podólogos): hoy la base está vacía de datos.
- Sitio de Netlify y variables de entorno del frontend.
- Interfaz de la ola 1a, probada (compila y se recorre por rol).
- Portar a Pie Firme, desde `podix/`, lo que solo existe allá (bloques A, B, E del plan en `docs/implementacion/Plan_Subir_Funciones_a_PieFirme.md`).
- Cargar la documentación en Utilerías → Documentación con `scripts/cargar-documentacion.mjs`.
