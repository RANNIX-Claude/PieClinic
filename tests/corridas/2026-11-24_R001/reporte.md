# Reporte R001 · Caja (Pie Clinic) · 2026-11-24

Versión: V_261124_1843 · Ambiente QA · Sesión: Superadmin Prueba · **Sin acceso a BD**: ningún CUMPLE descansa en consulta a base.
Totales (33 pasos): CUMPLE 10 · NO CUMPLE 4 · PARCIAL 3 · VERIFICAR 11 · NO EJECUTABLE 4 · PENDIENTE 5.
Evidencias: capturas devueltas por el navegador (nombres `mcp-claude-in-chrome-blob-<id>.jpg` en la carpeta tool-results de la sesión; ver bitacora.jsonl). No existe carpeta `evidencias/`.
Detalle de hallazgos: `hallazgos.md` (H01–H08).

| Escenario | Paso | Resultado | Evidencia / nota |
|---|---|---|---|
| ESC-01 | turno, sucursal, cajero visibles | VERIFICAR | 1795570007600-w0d3kr; falta `turnos_caja` |
| ESC-02 | P01 agregar producto | VERIFICAR | Crema para masaje $400 |
| ESC-02 | P02 cant 2: subtotal/total 800 | CUMPLE | 1795570033192-gml8q8 |
| ESC-02 | P03 IVA incluido | NO CUMPLE | $0.00 vs $110.34 esperado (H01) |
| ESC-02 | P04 cobrar efectivo, folio | VERIFICAR | CEN-TKT-000001; sin BD |
| ESC-02 | P05 impresión / ticket | NO EJECUTABLE | diálogo nativo bloquea (H06) |
| ESC-03 | P01 Quiropodia 400, IVA 0 | CUMPLE | 1795570196550-6fo9bi |
| ESC-03 | P02 campos de referencia con tarjeta | PARCIAL | opcionales |
| ESC-03 | P03 cobro sin voucher | NO CUMPLE | H02; 1795570206762-doszmk |
| ESC-03 | P04 pagos.metodo/referencia | VERIFICAR | sin BD |
| ESC-04 | P01 agregar plantilla 1,500 | CUMPLE | 1795570225453-eetvy6 |
| ESC-04 | P02 elegir características | NO CUMPLE | H03; 1795570232657-jtx7cw |
| ESC-04 | P03 descripción y precio 3,000 | NO EJECUTABLE | depende de P02 |
| Mixta | pagado/saldo efectivo 500 + tarjeta 300 | CUMPLE | 1795570386770-7vy0y6; 1795570530316-pfe5xh |
| Mixta | cobro y reparto en BD | VERIFICAR | CEN-TKT-000003 |
| ESC-06 | descuento sin motivo bloqueado | CUMPLE | 1795570577615-y4bf34 |
| ESC-06 | 5 % con motivo, cobrado | VERIFICAR | CEN-TKT-000004; autorizaciones sin BD |
| ESC-06 | 15 % pide PIN | NO CUMPLE / DISCREPANCIA_NEGOCIO | CEN-TKT-000005 sin PIN (H04) |
| ESC-06 | devolución | PENDIENTE | no ejecutada |
| Negativas | 0 conceptos | CUMPLE | 1795570245211-px9m09 |
| Negativas | pago < total (saldo 300) | CUMPLE | 1795570395076-owhf2a |
| Negativas | sin pagos (saldo 800) | VERIFICAR | no se creó venta; mensaje no capturado |
| Negativas | cantidad 0 | PARCIAL | H05 |
| Negativas | cantidad -1 | PARCIAL | H05; 1795570661944-inug48 |
| Impresión | Cobrar sin ticket (tickets 2 a 5) | VERIFICAR | «Cobro registrado»; sin BD |
| Impresión | Reimprimir (copia) marca «copia» | NO EJECUTABLE | diálogo nativo |
| Impresión | total ticket = total cobrado | VERIFICAR | 1795570722627-d8mtqt; contenido no visto |
| Impresión | Cancelar venta no cobrada | CUMPLE | 1795570677687-ywumor |
| Impresión | F5 + persistencia en Tickets del día | VERIFICAR | proxy de UI |
| Impresión | consola/red | VERIFICAR | sin evidencia |
| ESC-05 | cobro con PIN | PENDIENTE | sin PIN |
| ESC-07 | ticket completo / factura | NO EJECUTABLE | H07 |
| ESC-08/09/10 | cierre / podólogo / supervisor | PENDIENTE | fuera de corrida o requieren otra cuenta |

## Folios creados en QA (para limpieza)
CEN-TKT-000001 $800 efectivo · 000002 $400 tarjeta sin voucher · 000003 $800 efectivo 500 + tarjeta 300 (QA-R001-AUT1) · 000004 $380 desc. 5 % · 000005 $340 desc. 15 %. Total $2,720.00. Sede Centenario, Caja 1, cliente Mostrador. Turno sigue abierto.

## Preguntas para negocio
1. ¿Productos con IVA 16 % incluido (P-056)? ¿Crema para masaje exenta a propósito?
2. ¿Autorización/voucher de tarjeta obligatorio?
3. ¿El Administrador está exento de PIN en descuentos > 10 %? ¿Debe quedar en autorizaciones?
4. ¿Características de la plantilla especial se capturan en Caja en esta etapa?
5. ¿El precio de un servicio de precio fijo debe poder editarse en Caja?
