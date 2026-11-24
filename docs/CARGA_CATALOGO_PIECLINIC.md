# Carga del catálogo de productos de Pie Clinic

Origen: `CATALOGO_PROD_PIECLINIC.xlsx` (exportado de SICAR, 8 hojas, una por proveedor). Cargado el 24-nov-2026 en el esquema `pieclinic` (organización «Pie Clinic») con `scripts/cargar-catalogo-sicar.mjs`, que usa las reglas de `src/lib/plataforma/importacionSicar.js`, portadas de PODIX. Las cifras coinciden con la carga que PODIX ya había hecho de este mismo archivo.

- Renglones de artículo leídos: **3013**; repetidos entre hojas descartados: **57**.
- Cargados: **2880** (precio y costo del Excel: 153; precio sugerido con el margen del proveedor: 2513; costo estimado: 214).
- No cargados por no traer precio ni costo: **76** (lista al final).
- Factor general precio/costo (mediana): 3.33.

| Proveedor (hoja) | Artículos | Precio sugerido | Costo estimado |
|---|---:|---:|---:|
| Pie clinic | 27 | 0 | 10 |
| Miyako azul y negro | 64 | 0 | 1 |
| Body secret | 203 | 0 | 203 |
| Super confort | 1019 | 946 | 0 |
| Medimetrics | 338 | 338 | 0 |
| Tynor ort. y deportiva | 614 | 614 | 0 |
| Medipar | 615 | 615 | 0 |

| Departamento | Productos |
|---|---:|
| Ortopedia | 2,853 |
| Podología | 17 |
| Salud y bienestar del pie | 10 |

## Qué se cargó por artículo

Producto con folio (`PRD-000001` en adelante), SKU única, clave alterna, código de barras (232 lo traen), categoría, marca, departamento, costo, **precio de lista 1** con vigencia desde la carga, proveedor y su vínculo con el último costo, y el mínimo y el máximo de SICAR guardados aparte (`minimo_sicar`, `maximo_sicar`): se activan con la primera entrada de inventario.

## Pendiente de confirmar

1. **IVA.** En el Excel, `IMPUESTO (S/N)` es «N» en todo el archivo; los productos entraron como **exentos**. Confirmar con los dueños si algún producto lleva IVA.
2. **Precios sugeridos (2,513).** El Excel no trae precio de venta válido para ellos (la columna «PRECIO 1» trae solo el IVA del costo); se calcularon con el margen típico de cada proveedor. Hay que revisarlos y ajustarlos. Están marcados con `precio_sugerido`.
3. **Costos estimados (214).** Tenían precio pero no costo; marcados con `costo_estimado`.
4. **Departamento.** El archivo trae «Podología», «Ortopedia» y «Salud y bienestar del pie». ¿Este último es el departamento «Productos» que mencionaron los dueños? Si sí, basta cambiarle el nombre.
5. **Precios 2 a 4, mayoreos y existencias:** vienen en cero en todo el archivo, así que no se cargó nada. Las existencias se capturan con el inventario inicial.
6. **Tipos de cliente** (listas de precio 2 a 4): sin definir todavía.

## No cargados

| Hoja | Clave | Descripción |
|---|---|---|
| PIE CLINIC | PC ZP 01 | ZAPATO ORTOPEDICO CON ADAPTACIONES talla 12 - 14 |
| PIE CLINIC | PC ZP 02 | ZAPATO ORTOPEDICO CON ADAPTACIONES talla 14.5 - 17 |
| PIE CLINIC | PC ZP 03 | ZAPATO ORTOPEDICO CON ADAPTACIONES talla 17.5 - 21.5 |
| PIE CLINIC | PC ZP 04 | ZAPATO ORTOPEDICO CON ADAPTACIONES talla 22 - 25.5 |
| PIE CLINIC | PC ZP 05 | ZAPATO ORTOPEDICO CON ADAPTACIONES talla 26 - 28 |
| PIE CLINIC | PC ZP 06 | ZAPATO ORTOPEDICO CON ADAPTACIONES talla 28.5 - 30 |
| PIE CLINIC | PC TN 01 | TENIS ORTOPEDICO CON ADAPTACIONES talla 12 - 14 |
| PIE CLINIC | PC TN 02 | TENIS ORTOPEDICO CON ADAPTACIONES talla 14.5 - 17 |
| PIE CLINIC | PC TN 03 | TENIS ORTOPEDICO CON ADAPTACIONES talla 17.5 - 21.5 |
| PIE CLINIC | PC TN 04 | TENIS ORTOPEDICO CON ADAPTACIONES talla 22 - 25.5 |
| PIE CLINIC | PC TN 05 | TENIS ORTOPEDICO CON ADAPTACIONES talla 26 - 28 |
| PIE CLINIC | PC TN 06 | TENIS ORTOPEDICO CON ADAPTACIONES talla 28.5 - 30 |
| PIE CLINIC | PC Z DIABETICO 01 | ZAPATO PARA DIABETICO talla 22 - 24 |
| PIE CLINIC | PC Z DIABETICO 02 | ZAPATO PARA DIABETICO talla 24.5 - 25.5 |
| PIE CLINIC | PC Z DIABETICO 03 | ZAPATO PARA DIABETICO talla 26 - 28 |
| PIE CLINIC | PC Z DIABETICO 04 | ZAPATO PARA DIABETICO talla 28.5 - 30 |
| PIE CLINIC | V Y C | ADAPTACIONES VIRON Y CUÑA |
| PIE CLINIC | VCI | ADAPTACIONES VIRON CORRIDO |
| PIE CLINIC | COM X CM | ADAPTACIONES COMPENSO X CM |
| PIE CLINIC | ANT D | ADAPTACIONES ANTIDERRAPANTE |
| PIE CLINIC | VIRON | ADAPTACIONES VIRON |
| PIE CLINIC | CUÑA | ADAPTACIONES CUÑA |
| PIE CLINIC | CAM SUE | ADAPTACIONES CAMBIO DE SUELA |
| PIE CLINIC | PPC001 | PLANTILLA PELITE |
| PIE CLINIC | PPC002 | PLANTILLA PIEL |
| PIE CLINIC | PPC003 | PLANTILLA PLASTAZOTE O PORON |
| PIE CLINIC | PPC004 | PLANTILLA RESINA / DEPORTIVA |
| PIE CLINIC | PPC005 | DONA,HERRADURA ALCE BILATERAL |
| PIE CLINIC | PPC006 | ALCE X CM |
| PIE CLINIC | PPC007 | PLANTILLA CON MOLDE DE YESO |
| BODY SECRET | 611N | FAJA PARA EJERCICIO SPORT CHICA COLOR NEGRO |
| BODY SECRET | 611N | FAJA PARA EJERCICIO SPORT MEDIANA COLOR NEGRO |
| BODY SECRET | 611N | FAJA PARA EJERCICIO SPORT GRANDE COLOR NEGRO |
| BODY SECRET | 611N | FAJA PARA EJERCICIO SPORT EXTRA GRANDE COLOR NEGRO |
| BODY SECRET | 611NARANJA | FAJA PARA EJERCICIO SPORT CHICA COLOR NARANJA |
| BODY SECRET | 611NARANJA | FAJA PARA EJERCICIO SPORT MEDIANA COLOR NARANJA |
| BODY SECRET | 611NARANJA | FAJA PARA EJERCICIO SPORT GRANDE COLOR NARANJA |
| BODY SECRET | 611NARANJA | FAJA PARA EJERCICIO SPORT EXTRA GRANDE COLOR NARANJA |
| BODY SECRET | 613 | CHALECO DE POSTURA CON SOPORTE ABDOMINAL CHICO COLOR BLANCO |
| BODY SECRET | 613 | CHALECO DE POSTURA CON SOPORTE ABDOMINAL MEDIANO COLOR BLANCO |
| BODY SECRET | 613 | CHALECO DE POSTURA CON SOPORTE ABDOMINAL GRANDE COLOR BLANCO |
| BODY SECRET | 613 | CHALECO DE POSTURA CON SOPORTE ABDOMINAL EXTRA GRANDE COLOR BLANCO |
| BODY SECRET | 210 | GUANTE DE COMPRESION CHICO COLOR GRIS |
| BODY SECRET | 210 | GUANTE DE COMPRESION MEDIANA COLOR GRIS |
| BODY SECRET | 210 | GUANTE DE COMPRESION GRANDE COLOR GRIS |
| BODY SECRET | 211 | GUANTE DE COMRESION CON GEL ANTIDERRAPANTE CHICO COLOR NEGRO |
| BODY SECRET | 211 | GUANTE DE COMRESION CON GEL ANTIDERRAPANTE MEDIANO COLOR NEGRO |
| BODY SECRET | 211 | GUANTE DE COMRESION CON GEL ANTIDERRAPANTE GRANDE COLOR NEGRO |
| BODY SECRET | 215 | GUANTE DE COMRESION CON GEL DE 4-6 COLOR GRIS |
| BODY SECRET | 215 | GUANTE DE COMRESION CON GEL DE 8-10 COLOR GRIS |
| BODY SECRET | 215 | GUANTE DE COMRESION CON GEL DE 12-14 COLOR GRIS |
| BODY SECRET | 315 | SOPORTE DE CLAVICULA INFANTIL CHICO COLOR NUDE |
| BODY SECRET | 315 | SOPORTE DE CLAVICULA INFANTIL MEDIANO COLOR NUDE |
| BODY SECRET | 315 | SOPORTE DE CLAVICULA INFANTIL GRANDE COLOR NUDE |
| BODY SECRET | 1 | DONA MICROPERLA .32 X .32 UNITALLA |
| BODY SECRET | 2 | DONA MICROPERLA .17 X .17 UNITALLA |
| BODY SECRET | 3 | DONA MICROPERLA .38 X.38 UNITALLA |
| BODY SECRET | 5 | DONA MICROPERLA .22 X .22 UNITALLA |
| BODY SECRET | 10 | DONA MICROPERLAS .45 X .40 |
| BODY SECRET | 4 | DONA PELO DE ANGEL .39 X .36 |
| BODY SECRET | 6 | DONA PELO DE ANGEL.34 X.34 UNITALLA |
| BODY SECRET | 7 | DONA PELO DE ANGEL .40 X .45 UNITALLA |
| BODY SECRET | 8 | CUADRO PELO DE ANGEL .37 X .33 UNITALLA |
| BODY SECRET | 15 | COJIN PARA SILLA DE RUEDAS UNITALLA |
| BODY SECRET | 16 | BONS HUESITO MICROPELAS UNITALLA |
| BODY SECRET | 17 | COLLARIN VIAJE MICROPERLAS UNITALLA |
| BODY SECRET |  | BATAS |
| BODY SECRET | 217 | BATA DE LABORATORIO 30 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 32 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 34 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 36 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 38 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 40 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 42 COLOR BLANCO |
| BODY SECRET | 217 | BATA DE LABORATORIO 44 COLOR BLANCO |
| SUPER CONFORT |  | NUEVA LINEA PRE-HOSPITALARIO |
