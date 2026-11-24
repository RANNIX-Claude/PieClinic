# Frontend · Finanzas

Área: `src/routes/finanzas.jsx`, `src/menu/finanzas*.js` (INICIO, FINANZAS, ANÁLISIS, ADMIN), `src/pages/finanzas/`, `src/lib/finanzas/`.
Clon funcional de IRP (Dashboard, ResumenSemanal, Ingresos/Validacion, GastosOperativos, EDR, Conciliacion, FondoRevolvente, Cobranza/cuentas por pagar, Reportes, Bitacora) adaptado a vistas `prp_*` y a lo clínico.

## Pantallas

| Ruta | Archivo | Mockup | Vistas / RPC principales | Roles |
|---|---|---|---|---|
| /dashboard | Dashboard.jsx | 31 | prp_kpis_finanzas, prp_alertas_financieras, prp_ingresos_mensuales, prp_ingreso_por_servicio, prp_edr_resultados, prp_ocupacion_podologo_dia, prp_quejas_resumen, prp_inventario, prp_agenda | A (todo), P/R (parte operativa) |
| /resumen-semanal | ResumenSemanal.jsx | 32 | prp_resumen_semanal(+consolidado), prp_ingresos, prp_gastos, RPC resumen_semanal, cerrar_periodo, reabrir_periodo | A |
| /cierres | Cierres.jsx | — | prp_cierres_periodo, cerrar_periodo, reabrir_periodo | A |
| /ingresos | Ingresos.jsx | 33 | prp_ingresos, prp_ingresos_descuadrados, prp_cuentas_cobrar, aplicaciones_cobro, ingreso_renglones; RPC registrar_ingreso, ingreso_validar | A |
| /gastos | Gastos.jsx | 34 | prp_gastos, gasto_lineas, comprobantes_carga, grupos_gasto, prp_proveedores; RPC proveedor_crear_rapido; OCR simulado | A, R (fondo de su sede) |
| /fondo-revolvente | FondoRevolvente.jsx | 37 | prp_fondo_semana, prp_fondo_revolvente_cierres, prp_gasto_por_rubro_semana; RPC fondo_cerrar_semana, fondo_reponer | A, R |
| /estado-resultados | EDR.jsx | 35 | prp_edr, prp_edr_consolidado, prp_edr_resultados, edr_ajustes; RPC edr_guardar_proyeccion, edr_recalcular, edr_desglose | A |
| /conciliacion | Conciliacion.jsx | 36 | prp_movimientos_bancarios, prp_conciliacion_cobros, prp_liquidaciones_clip, prp_cuentas_bancarias; RPC conciliar_importar/automatico/confirmar/deshacer, movimiento_marcar, clip_sincronizar_liquidaciones | A |
| /cuentas | CuentasPagarCobrar.jsx | 38 | prp_cuentas_pagar, prp_antiguedad_saldos_pagar, prp_pagos_proveedor, prp_cuentas_cobrar; RPC pagar_proveedor | A |
| /reportes | Reportes.jsx | 42 | prp_ingresos_mensuales, prp_ingreso_por_servicio, prp_quejas_resumen, prp_agenda, prp_inventario, … | A, P |
| /bitacora | Bitacora.jsx | 43 | tabla bitacora (+ perfiles); exportar registra bitacoraExportar | A |

El asistente de consulta de números (mockup 47) lo hace otro agente. `Finanzas.jsx` de IRP (resumen combinado) queda cubierto por Dashboard + Resumen semanal + EDR.

## Lógica pura y pruebas (`node --test src/lib/finanzas/`)

`semana.js` (corte sábado→viernes, estado de semana, periodos cerrados), `aplicaciones.js` (aplicaciones que no exceden ingreso ni saldo, tolerancia 1 centavo, clasificación, antigüedad CxC), `edr.js` (proy_ manual/real_ automático, utilidad sin impuestos, semáforo), `gastos.js` (comprobante desde $2,000, cuadre de ticket, fondo, tolerancia de caja $50), `kpis.js`, `conciliacion.js` (CSV, mapeo, monto+fecha ± días), `exportar.js`. 7 pruebas en `finanzas.test.mjs`, todas verdes.

## Reglas respetadas

proy_* solo vía RPC `edr_guardar_proyeccion` y solo administrador (nunca en recálculo ni código automático); real_ no se edita (ajustes con motivo); exportar/imprimir registran bitácora; escritura deshabilitada en solo lectura; cierres solo por RPC.

## Simulado

OCR/IA de tickets: `src/lib/adaptadores/ocr_ticket.js` en modo simulado visible (sin llave; P-126 revisión humana). Liquidaciones Clip: se muestran las ya registradas; sin sincronización real.

## Huecos

- Falta función servidor `netlify/functions/ia-ticket.js` (OCR real).
- Sin UI para reembolsos, alta de cuentas bancarias, ni alta de cobros ligados a cita/venta.
- Columnas por confirmar contra BD real: nombres en `pacientes`/`perfiles`, `prp_proveedores`, `bitacora` (inicios de sesión fallidos, sin IP), vistas de reporte de A/B/D.
- Con sede «todas», `leer()` excluye gastos compartidos sin sede del historial semanal.
- Meta de ocupación del dashboard fija (80 %).
- Nada se probó contra Supabase real.
- `menu/inicio.js` conserva «Dashboard» → `/`; duplica el de `/dashboard` (quitarlo desde la base).
