# DIAGNÓSTICO DE INCIDENCIAS — Clínicas de Podología (podix) · Pie Clinic

> Qué mirar cuando algo falla. Escrito para el estado actual: **modo demostración**, con los datos en el navegador. No hay base de datos ni producción todavía; las secciones que dependen de ellas dicen «cuando exista».
> El procedimiento general vive en el comando `/rannix-diagnostico`. Aquí está lo específico de este proyecto.

## Antes de tocar nada

1. **Verificar la versión.**
   - Versión del sistema: `VERSION_SISTEMA` en `src/store/dominios/plataforma.js` (`0.2.0-demo` al redactar esto); también queda en `d.config.version`.
   - Versión de los datos: la clave del navegador es `podologia.demo.v3`. Un navegador con datos viejos de la clave anterior simplemente los ignora y regenera la semilla.
   - Qué tiene abierto el usuario: pedirle la dirección completa (¿`localhost`, el sitio de QA, un archivo local?) y recargar sin caché. El service worker (`public/sw.js`) guarda el armazón de la aplicación: una versión vieja puede seguir sirviéndose hasta recargar dos veces.
2. **Verificar contra qué datos estás mirando.** En la demostración **cada navegador tiene su propia copia**. Lo que ve el usuario no es lo que ves tú. No hay manera de consultar «sus» datos desde fuera: hay que pedirle que los exporte o reproducir el caso.
3. **Verificar la fecha.** La semilla se genera con fechas relativas al día en que se creó. Datos generados hace días se ven «viejos» (citas de hoy que ya no son de hoy). «Restablecer datos de demo» los vuelve a alinear, y **borra lo capturado**.

## Datos del caso

Sin un caso concreto no se diagnostica, se adivina. Pedir siempre:

- Folio: `T-` venta · `AP-` apartado · `CR-` crédito · `OC-` orden de compra · `TR-` traspaso · `LAB-` laboratorio · `NC-` nota de compra · `RN-` recibo de nómina · `CT-` constancia · `PW-` pedido en línea · `AF-` auditoría por foto · `INV-` investigación · `DOC-` documento.
- Fecha y hora del evento (hora del equipo del usuario).
- Usuario, rol y **sucursal en la que estaba trabajando** (encabezado «Trabajando en: …»).
- Pantalla (el final de la dirección: `#/mas/edr`, `#/cobrar`…).
- Captura de la consola del navegador si el error se ve ahí.
- Si apenas restableció los datos de demostración.

## Ambientes

| Ambiente | URL | Datos | Quién tiene acceso |
|---|---|---|---|
| Local | `npm run dev` (Vite) | `localStorage` de ese navegador | quien tenga el código |
| QA | sitio Netlify `pie-firme-qa` (URL por confirmar) | `localStorage` de cada visitante; **aún no** la base | quien tenga el enlace: es demostración pública sin contraseña |
| Base QA compartida | — | esquema `piefirme` del sistema hermano Pie Firme; esta aplicación **todavía no la lee** | ver `docs/ACCESOS.md` |
| Producción | no existe | — | — |

## Dónde mirar primero, por síntoma

| Síntoma reportado | Primera revisión | Archivo / dato |
|---|---|---|
| «Se me borró todo» o «no veo lo que capturé ayer» | Otro navegador o equipo, modo incógnito, o se restablecieron los datos. Cada navegador tiene su copia | `src/store/core.js` (`cargar`, `reiniciarDemo`) |
| La aplicación no guarda o se queda en blanco | El almacenamiento del navegador está lleno (límite ≈ 5 MB; la semilla ocupa ≈ 2.2 MB) o bloqueado. `guardar()` falla **en silencio** | `core.js` → `guardar`; revisar fotos y miniaturas |
| No aparece una pantalla del menú (Tablero DW, Control de ETL, Configuración, Documentos, Cálculos, Validación, Catálogos, Consulta a base de datos, Entrega, Consulta asistente) | El ítem está en el menú pero el archivo de la pantalla puede no existir todavía (dominio plataforma en construcción) | `src/config/roles.js` contra `src/pantallas/mas/` |
| «No me deja» hacer algo | El permiso se valida en la acción: leer el mensaje exacto y buscarlo en el código. Revisar rol y sucursal activa | `src/store/acciones_*.js` |
| El menú no es el de mi rol | El rol sale de la cuenta, no de la puerta de entrada. Dirección usa el menú de administración | `roles.js` → `appDeRol` |
| La venta no cuenta para el bono de alguien | ¿El ticket tiene `vendedorId`? Si no, cuenta para quien cobró. ¿Está cancelado? ¿Tiene devolución? ¿En qué sucursal se hizo? | `src/store/desempeno_motor.js` → `filasAtribucion` |
| El bono no cambia aunque cambiaron las ventas | Ya está aprobado: el monto queda congelado | `d.bonos.pagados` |
| El bono sale en $0 | No alcanzó el primer escalón, o no cumple la condición de asistencia o de calificación | `evaluarIndividual` → campo `formula` y `condiciones` |
| «No me deja aprobar el bono» | El periodo no ha terminado, el monto es $0 o ya estaba aprobado | `acciones_desempeno.js` → `aprobarBono` |
| El estado de resultados no cuadra con las ventas | Ver «Definiciones que no coinciden» en `METRICAS.md`: el EDR no resta devoluciones y sí aplica el descuento del ticket; los meses cerrados salen de un resumen, no de tickets | `src/store/dominios/finanzas.js` → `ingresosDeMes` |
| La utilidad de un mes pasado cambió | La nómina de **todos** los meses se calcula con los sueldos de hoy (RN-H04) | `nominaDeSucursal` |
| La suma de las sucursales no da la cadena | No debería pasar (hay prueba). Revisar si hay gastos con sucursal inexistente | `sumarCrudos` |
| Falta la luz o la limpieza del mes | Los recurrentes no se generan solos: botón «Generar los del mes» | `generarRecurrentes` |
| Sale como retardo y llegó a tiempo | Horario de la persona, tolerancia (10 min) y **hora del equipo** donde checó | `reglas_personas.js` → `clasificarEntrada` |
| «No me deja checar» | Ya checó hoy, no tiene ficha de empleado, tiene vacaciones aprobadas o no eligió sucursal | `registrarEntradaD` |
| Alguien aparece «sin registro» y no como falta | Las faltas no son automáticas: el gestor las marca | `marcarFaltasDiaD` |
| La nota de compra leída trae datos raros | La lectura es **simulada**: no lee la foto de verdad | `acciones_finanzas.js` → `armarBorrador` |
| El conteo de la auditoría no se parece a la foto | La estimación es **simulada**: parte de la existencia del sistema | `acciones_comercial.js` → `estimarConteoConIA` |
| El pedido en línea no se puede entregar | La sucursal activa no es la del pedido, no está «listo», falta existencia física, o falta un cajero con turno abierto | `entregarPedido` |
| La tienda dice «agotado» y hay piezas | Están apartadas o comprometidas en otros pedidos activos | `disponibleWeb` |
| El asistente «no entiende» | Es un motor de reglas con 15 métricas, no un modelo de lenguaje | `acciones_comercial_asistente.js` → `entender` |
| No llegó el correo o el WhatsApp | No se envía nada hacia afuera: es simulación | `enviarCorreoExterno`, `enviarPorCanal` |
| El cuadre del DW marca diferencia | Comparar total del DW contra total operativo; correr la carga otra vez | `plataforma_dw.js` → `cuadreDW`, `ejecutarETL` |
| Dos pruebas fallan temprano en la mañana | `tests/cajero` y `tests/reglas` dependen de la hora: antes de las 9:00 la semilla no tiene consultas «cerradas» de hoy | `src/store/seed.js` |

Al segundo reporte del mismo síntoma, la fila ya debe estar aquí.

## Consultas de lectura frecuentes

Hoy no hay SQL: los datos están en el navegador. En la consola del navegador (solo lectura):

```js
// Todo el estado
const d = JSON.parse(localStorage.getItem("podologia.demo.v3"));
// Quién soy y dónde estoy trabajando
d.sesion;
// Tamaño de lo guardado, en MB
(localStorage.getItem("podologia.demo.v3").length / 1048576).toFixed(2);
// Un ticket por folio
d.ventas.find((v) => v.folio === "T-0042");
// Últimos movimientos de la bitácora
d.bitacora.slice(0, 20);
// Bonos ya aprobados o pagados
d.bonos.pagados;
// Gastos de una sucursal en un mes
d.fin.gastos.filter((g) => g.sucursalId === "S1" && g.fecha.startsWith("2026-11"));
// Asistencia de hoy
d.rh.asistencia.filter((a) => a.fecha === new Date().toLocaleDateString("sv"));
```

**No** editar el estado a mano desde la consola para «arreglar» algo: se corrige en el código y se restablece la demostración.

Cuando exista la base: las consultas serán `SELECT` sobre el esquema `piefirme` y se agregan aquí.

## Dato o código

- Lo capturado es correcto pero el resultado no cuadra → **CÓDIGO**.
- El resultado es consistente con lo capturado → **DATO u OPERACIÓN**.
- El resultado es consistente con el código pero no con lo que el cliente espera → **REGLA**: casi todas las reglas son «decididas por defecto» y nadie del cliente las ha confirmado.

Contrastar siempre contra [`REGLAS_NEGOCIO.md`](../REGLAS_NEGOCIO.md). En este proyecto, antes de llamar «bug» a algo, revisar si la regla está confirmada (estado C) o es un supuesto (estado D): si es D, la respuesta puede ser una pregunta al cliente y no una corrección.

## Reglas de este proyecto

- No hay producción. Cuando exista: lectura libre; escritura con `SELECT` previo de exactamente las filas a tocar y aprobación humana explícita.
- Nunca corregir directo en lo publicado: fuente → pruebas (`npm test`) → QA.
- Ante una demostración detenida frente al cliente: «Restablecer datos de demo» primero, diagnosticar después.
- Lo simulado no se «arregla» para que parezca real: se rotula.
- La base QA es compartida con otros sistemas: solo el esquema `piefirme`.
- Antes de cualquier `git commit` o `git push`: confirmar con `git rev-parse --show-toplevel` que el repositorio es el del proyecto (ver «Trampas» en `CLAUDE.md`).

## Contactos

| Para qué | Quién | Cómo |
|---|---|---|
| Reporta las incidencias | Por definir (hoy: Roberto, dueño de RANNIX) | — |
| Decide una regla de negocio | El cliente (Pie Clinic); persona por definir (V2-90) | — |
| Autoriza tocar producción | No aplica todavía | — |
