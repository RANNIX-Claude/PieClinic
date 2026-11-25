# Corrida INV-R001 · Inventario entre sucursales (videos de demostración) · 2026-11-24

Ambiente: QA (base compartida), cuenta de prueba `r@g.com` (recepción). Sin acceso a consulta de BD para confirmar movimientos: lo observado es de UI. Videos en `demo/video/inv-*-narrado.mp4`.

| Caso | Resultado observado | Folio |
|---|---|---|
| Traspaso completo (Galerías → Centenario, 4 cremas + 3 antimicóticos) | Borrador→Enviado→Recibido completo; flujo sin errores | GALERIAS-TRA-000001 |
| Llega con piezas de menos (6 enviadas, 5 recibidas) | Motivo obligatorio (botón bloqueado sin motivo), estado «Recibido con diferencias», diferencia −1, aviso de reclamación | GALERIAS-TRA-000002 |
| Reposición por mínimos (Galerías → Sendero) | «Sugerir según mínimos» propone 2 partidas; envío y recepción completa | GALERIAS-TRA-000003 |

## Hallazgos
- **H-INV-01 · DISCREPANCIA_NEGOCIO (posible BUG, Media):** «Sugerir según mínimos del destino» propone enviar **toda** la existencia del origen (Galerías: 14 calcetas y 9 cremas), dejándolo en 0, por debajo de su propio mínimo (5). P-080 no define una reserva en el origen. Decide negocio: ¿el origen debe conservar su mínimo?
- **H-INV-02 · GAP_PRODUCTO:** no existe el listado de inventario obsoleto (90 días sin venta, dinero parado a costo, salida/baja). Solo hay el KPI de caducidad a 90 días. Sin regla en REGLAS_NEGOCIO (A-INV-20 a 22).
- **H-INV-03 · VERIFICAR:** la reclamación del faltante en «Mermas y conteos» no se revisó con consulta a BD; el video muestra el aviso de la pantalla de detalle.
- **Datos de prueba:** las corridas dejaron traspasos y movimientos en QA (no se pueden borrar: la base protege la evidencia). Las existencias de Galerías, Centenario y Sendero cambiaron.
