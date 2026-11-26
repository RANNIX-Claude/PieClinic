# Hallazgos lote I: Conteo inicial con precio de venta (video móvil)

Video: `demo/video/vid-conteo-inicial-narrado.mp4` (formato vertical 390x844). Spec: `demo/vid-conteo-inicial.spec.ts`.

## CORREGIDO
1. **Faltaba el precio de venta en el conteo** (pedido del dueño). Migración 160: `producto_provisional_crear` recibe `p_precio` y `conteo_precio_fijar` (producto conocido; nunca pisa un precio vigente distinto sin confirmación; siempre versión nueva en `precios`/histórico). Solo Administración (`catalogo.editar`) pone precio.
2. **Completar provisional chocaba con el precio ya puesto** (vigencia traslapada). Migración 161: respeta el precio vigente; ProductosProvisionales lo trae precargado.
3. **Zona recién creada se descartaba** (el efecto que limpia la zona corría antes de recargar la lista; con red lenta no se podía contar). Ahora se recarga primero.
4. **Conteo inicial rediseñado como captura móvil** (cambio de alcance): botón Escanear, hoja a pantalla completa (precio, existencia con −/+, teclado numérico), Guardar vuelve a la cámara, zona compacta (se crea «General» sola), Resumen en tarjetas.
5. En los videos de escritorio, la columna de la sede en Inventario sale en MAYÚSCULAS (innerText); solo afecta al guion.

## NO CORREGIDO — requiere decisión
- Un producto nuevo contado queda **provisional** y no aparece en Caja hasta que Administración lo completa con categoría (regla 078, «decidido por defecto, revisable»). El precio sí queda guardado. Se dice en la narración final.
- La lectura con cámara se demuestra con cámara simulada de Chrome (sin cámara real no se puede decodificar un código); el código se simula con el lector (teclado + Enter).

## Datos de QA creados (no se pueden borrar)
- Sedes sintéticas nuevas: Tlalpan (TLP), Xochimilco (XOC). Conteos: COY-CNT-000001..4 cancelados y COY-CNT-000005 aprobado (Coyoacán); POL conteo aprobado (Polanco); TLP-CNT-000001 aprobado; Xochimilco: conteo del video (aprobado).
- Productos provisionales «Tobillera de neopreno (video)» con códigos inventados 75099xxxxxxxx (uno por corrida) y existencias en esas sedes; Spray desodorante (PF-CC-002) con 3 piezas en Coyoacán, Polanco, Tlalpan y Xochimilco.
- Precio: ninguno de los precios sembrados fue modificado (el cambio de precio con confirmación se muestra solo en la versión de escritorio, cancelado).
