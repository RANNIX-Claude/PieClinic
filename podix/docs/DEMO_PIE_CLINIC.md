# Demo de PODIX para Pie Clinic — paso a paso

Demostración para la junta con los dueños. **Todo son datos ficticios** y viven en el navegador (`localStorage`, clave `podologia.demo.v3`). Funciona **sin internet** una vez cargada la página.

## Correrla (en esta computadora)

```powershell
cd "C:\Users\asus\OneDrive\work\podologia"
$env:VITE_CACHE_DIR = "$env:TEMP\vite-cache-podix"   # evita el error EPERM de OneDrive con la caché de Vite
npm run dev
```

Abrir `http://localhost:5173/app/` (si el puerto está ocupado, Vite avisa cuál usó). La pantalla inicial es el **menú de presentación**.

Para llevarla a la junta sin depender de esta máquina: `npm run build` y publicar `dist/` (Netlify: rama `develop` = QA). La app entera es estática; solo el WhatsApp real necesita la función de Netlify.

## Antes de la junta (5 minutos)

1. Abrir el menú de presentación y pulsar **Reiniciar demo**: regenera todos los datos (fechas relativas a hoy).
2. Pulsar **Modo presentación**: oculta del menú lo técnico (utilerías, configuración, bitácora, consulta a base de datos…). Se vuelve a mostrar con el mismo botón.
3. Probar en el celular: abrir la misma dirección (misma red Wi-Fi: `npm run dev -- --host`). Todo es de una columna y con letra grande.
4. Ensayar una vez cada tema y volver a **Reiniciar demo**.

## Recorrido sugerido (≈ 12 minutos)

| Botón | Qué mostrar | Cuenta con la que entra |
|---|---|---|
| **Tablero** | Ranking de las 7 sucursales contra la meta de $200,000, ticket promedio, % servicios vs productos, **línea y marca con más margen**, pacientes nuevos vs recurrentes, ranking de podólogos. Cambiar de mes con los botones de arriba; la **baja de los últimos 4 meses** (en rojo) es distinta en cada sucursal. **Exportar PDF imprimible** abre el diálogo de impresión (elegir «Guardar como PDF»). | Dirección |
| **Pacientes** | Pacientes dormidos a 3, 6 y 12 meses, mensaje sugerido por WhatsApp y envío de la campaña: los mensajes aparecen en el celular dibujado. | Dirección |
| **Almacén** | 1) Entrada de compra en **Centenario** con foto de factura. 2) **Sugerir reparto** (según venta del último mes y existencia), ajustar cantidades y **Aprobar y enviar**. 3) En «Envíos en camino», **Recibido completo** o **Capturar faltantes**. Se ve en el celular: «Van en camino 25 plantillas…», «Sendero recibió completo», «Faltaron 2…». El inventario de cada sucursal se actualiza solo y la diferencia queda registrada (Traspasos). Arriba: alertas de inventario mínimo. | Raúl Nava (compras y almacén central) |
| **Consulta** | Pabellón del Valle: paciente con uña encarnada → diagnóstico → **extracción** → las **curaciones +3, +7 y +14 se agendan solas** (aparecen en la agenda) → **venta de plantilla a medida** (laboratorio externo) → **comisión y bono** del podólogo al cierre. | Dirección |
| **Capacitación** | Cursos de procedimientos (uña encarnada, extracción, estudio de pisada) con evaluación y calificación por podólogo (menú Más ▸ Capacitación ▸ avance del equipo). Los videos son de muestra hasta que Pie Clinic entregue los suyos. | Dirección |
| **Tienda en línea** | Catálogo público con compra y **recoge en sucursal**, ligado a la existencia real del inventario. | Sin cuenta (público) |

El botón **⌂ Menú** (abajo a la izquierda) regresa al menú en cualquier momento.

## Qué es real y qué es de muestra

- **Real en la demo:** cálculos, inventario por PEPS, traspasos con diferencias, agenda, comisiones, bitácora de auditoría.
- **De muestra:** WhatsApp (celular dibujado; ver `docs/WHATSAPP_REAL.md` para el envío real), pago en línea de la tienda, lectura de factura por IA, videos de capacitación, cifras históricas.
- **Supuestos por confirmar con los dueños:** meta de $200,000 por sucursal, comisión de 10 % por servicio y 5 % por plantilla, bono de $100 por plantilla a medida, precios y costos del catálogo, nombres de marcas y líneas.

## Datos que trae (semilla `src/store/seed.js` + `src/store/dominios/pie_clinic.js`)

- 7 sucursales (Chalco Centro, Patio Valle de Chalco, Centro Tepozán (Los Reyes), Galerías Ixtapaluca, Sendero Ixtapaluca, Centenario, Pabellón del Valle), 2 estaciones cada una; el **almacén central está en Centenario**.
- 10 podólogos ficticios que rotan entre dos sucursales y un responsable de compras en Centenario.
- Catálogo con marca, línea, precio y costo: servicios (consulta, corte, uña encarnada, extracción con curaciones, estudio de pisada…) y productos (plantillas de piel, pelite y plastazote vía laboratorio externo, calzado ortopédico, muletas, bastones, rodilleras, sillas de ruedas…).
- 12 meses de historial con baja en los últimos 4 meses; 160 pacientes con origen (plaza comercial, Google, Facebook, recomendación) y pacientes dormidos.
- La semilla es determinista: reiniciar siempre deja la demo igual (las fechas se mueven con el día).

## Problemas conocidos

- La semilla pesa ≈ 3.7 MB y el navegador permite ≈ 5 MB por sitio: no agregar mucho más sin revisar el tamaño.
- Cada navegador tiene su propia copia de los datos.
- No tocar datos de otros clientes: esta demo es un tenant aparte (`Pie Clinic`) y no usa la base compartida.
