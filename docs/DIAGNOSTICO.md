# DIAGNÓSTICO DE INCIDENCIAS — Clínica de Podología · RANNIX (producto propio)

> Entregable de la etapa **E8**. Se llena al entregar, no cuando falle algo.
> Lo que está aquí es lo específico de este cliente; el procedimiento general
> vive en el comando `/rannix-diagnostico`. Borra esta línea cuando el archivo
> esté real.

## Antes de tocar nada

1. **Verificar la versión.** Qué tiene abierta el usuario contra qué está
   publicada. Es gratis y resuelve una parte real de los reportes.
   - Versión publicada: {{dónde se lee — archivo `VERSION`, pie de pantalla, etc.}}
   - Cómo se le pide al usuario la suya: {{...}}
2. **Verificar contra qué base estás consultando.** Un fallback silencioso a
   otro ambiente produce hallazgos falsos que parecen ciertos.

## Datos del caso

Sin un caso concreto no se diagnostica, se adivina. Pide siempre:

- Folio / identificador: {{cómo se llama en este sistema}}
- Fecha y hora del evento
- Usuario y perfil con el que estaba entrando
- Pantalla o módulo
- Captura de la consola del navegador, si el error es visible ahí

## Ambientes

| Ambiente | URL | Base de datos | Quién tiene acceso |
|---|---|---|---|
| QA | | | |
| Producción | | | |

## Dónde mirar primero, por síntoma

| Síntoma reportado | Primera consulta | Tabla / módulo |
|---|---|---|
| | | |

{{Se llena con los reportes reales conforme llegan. Al segundo reporte del
mismo síntoma, la fila ya debe estar aquí.}}

## Consultas de lectura frecuentes

```sql
-- {{qué responde esta consulta}}
```

{{Solo lecturas. Deja aquí los `SELECT` que acabas escribiendo de memoria cada
vez; es el ahorro más grande de esta etapa.}}

## Dato o código

- Lo capturado es correcto pero el resultado no cuadra → **CÓDIGO**
- El resultado es consistente con lo capturado → **DATO u OPERACIÓN**

Contrasta siempre contra [`REGLAS_NEGOCIO.md`](../REGLAS_NEGOCIO.md): lo que el
sistema hace puede ser distinto de lo que el negocio definió, y esa diferencia
es el bug.

## Reglas de este proyecto

- Lectura en producción: libre. Escritura: `SELECT` previo de exactamente las
  filas a tocar + aprobación humana explícita.
- Nunca corregir código directo en producción: fuente → QA → liberar.
- Ante operación detenida: revertir primero, diagnosticar después. El cliente
  necesita operar, no entender.
- {{Lo que sea particular de este cliente: ventanas de operación en las que no
  se toca nada, procesos nocturnos, cierres de mes.}}

## Contactos

| Para qué | Quién | Cómo |
|---|---|---|
| Reporta las incidencias | | |
| Autoriza tocar producción | | |
