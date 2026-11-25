
## inv-traspaso-cedi — Centenario (CEDI) surte a Galerías con 3 partidas (10 piezas)
Video: demo/video/inv-traspaso-cedi-narrado.mp4 (538 s, voces que exceden su hueco: 0, desfase 1.1 s). Folio: CENTENARIO-TRA-000003, costo a costo promedio $1,230.26.
Cifras (leídas de pantalla y confirmadas por SQL de solo lectura; suma origen+destino conservada):
| Producto | Enviado | Centenario antes→después | Galerías antes→después | Suma |
|---|---|---|---|---|
| PF-PD-001 Calcetas pie diabético | 3 | 16→13 | 240→243 | 256→256 |
| PF-OR-002 Talonera de gel | 3 | 12→9 | 14→17 | 26→26 |
| PF-IN-001 Guantes de nitrilo (caja) | 4 | 9→5 | 9→13 | 18→18 |
Tablero «En tránsito»: 5→6 al enviar (valor 2,735.86→3,966.12), vuelve a 5 al recibir.
- Sin hallazgos de código: el sistema permite 3+ partidas, muestra costo, descuenta al enviar, suma al recibir.
- LIMITACIÓN (no corregido, requiere decisión): la mercancía en tránsito solo se ve como KPI global en Traspasos (conteo y valor), no por producto en Inventario (el origen baja y el destino no sube hasta recibir; no hay columna «en tránsito»). Decisión de producto si se quiere esa columna.
- No se demostró recepción con diferencia (para conservar la suma); el sistema la admite y genera reclamación (se menciona en la narración).
- BASURA QA: dos corridas interrumpidas por tiempo/proceso dejaron CENTENARIO-TRA-000001 y -000002 (10 uds. cada una, AM-001/AM-002/CC-002) en estado «enviado» (en tránsito) hacia Galerías; no se pueden borrar. Pendiente recibirlas o cancelarlas (admin).
