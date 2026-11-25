# Hallazgos del lote F (videos de QA) — Pie Clinic / Pie Firme

Fecha: 2026-11-25 · Ambiente: QA (servidor de desarrollo 5174) · Migraciones usadas: 130 y 131.

## Resumen por video

| Video | MP4 | Estado |
|---|---|---|
| caja-facturar | `demo/video/caja-facturar-narrado.mp4` | 2 hallazgos CORREGIDOS y regrabado; timbrado real NO CORREGIDO — requiere llave/decisión |
| vid-catalogo-precios | `demo/video/vid-catalogo-precios-narrado.mp4` | Sin hallazgos |
| caja-plan-paquete | `demo/video/caja-plan-paquete-narrado.mp4` | 1 hallazgo CORREGIDO (migración 131) y regrabado |

## 1. caja-facturar (recepción r@g.com, sede Pie Clinic Centenario)
Pasos: firma → Caja → panel «Paciente · factura» → paciente Guadalupe González Navarro (datos fiscales ✓) → casilla «¿Requiere factura?» → quiropodia + crema hidratante ($580.00) → efectivo → ticket CENTENARIO-TKT-000030 con botón «Facturar este ticket» → Facturación: receptor precargado (RFC XXXX000004AA0), conceptos con IVA exento/16 %, total CFDI = total del ticket → «Timbrar y enviar (simulado)» → lista Timbradas (vigente, etiqueta Simulado) → botón PDF (representación impresa con marca de agua «SIMULADO · SIN VALIDEZ FISCAL») → Caja › Tickets del día: el ticket pasó a «Facturada» (antes por facturar).

Hallazgos:
- **H-F1 CORREGIDO y regrabado.** Aunque la ficha del paciente muestra «datos fiscales ✓» (`datos_fiscales_paciente`), la ventana de facturar solo leía `cfdi_receptores`, así que abría vacía («RFC inválido · Falta razón social · CP») y no dejaba timbrar. Corrección en `src/pages/comercial/Facturacion.jsx` (`FormFactura`): si no hay receptor CFDI, precarga desde `datos_fiscales_paciente` (el receptor se guarda en `cfdi_receptores` al facturar, como ya hacía).
- **H-F2 CORREGIDO (migración 130) y regrabado.** Recepción tiene el permiso `facturas.timbrar`, pero `timbrar_factura_simulado` corría como el usuario y `pac_configuracion` solo la lee el Administrador: a Recepción siempre le respondía «el PAC no está en modo simulado» y dejaba el borrador sin timbrar. La función ahora es SECURITY DEFINER con el mismo control de rol, valida la clínica del usuario y trata «sin configuración» como simulado (igual que el adaptador del front). Quedaron en QA dos borradores de pruebas fallidas (no se pueden borrar desde el rol de pruebas; son basura de QA).
- **H-F3 NO CORREGIDO — requiere llave/decisión.** El timbrado con PAC real no existe: todo CFDI es simulado, sin validez fiscal, con UUID sintético. Se dice en la narración del video y la pantalla lo rotula. Pendiente: contratar PAC, cargar CSD y función de servidor de timbrado. Además el emisor fiscal de QA es de prueba («ESCUELA KEMPER URGATE»).

## 2. vid-catalogo-precios (administrador m@g.com; el catálogo solo lo edita el administrador)
Pasos: Catálogo y precios → nuevo servicio SV-VCVQV «Plantilla deportiva a la medida CVQV» (tipo Desde, 45 min, IVA 16 %, «Admite características» y «Precio por sucursal») → precio de lista $1,500 → precio propio de Pie Clinic Centenario $1,650 → cambio programado $1,750 desde 25/12/2026 (la versión vigente cierra el 24/12) → listado con filtro «Solo con precio por sucursal» e historial → nuevo producto PF-VCVQV «Plantilla de gel para talón CVQV» a $180 → pantalla «Características y adaptaciones» (22 características base) → nueva característica «Barra retrocapital CVQV» (+$250 fijo) → en Caja, el servicio nuevo muestra el panel de características con la barra recién creada y el precio de sucursal ($1,650).
Hallazgos: ninguno. Características y Catálogo funcionaron completos tal como se construyeron.

## 3. caja-plan-paquete (recepción r@g.com)
Pasos: Paquetes y membresías (plan PL-001 «Plan láser 6 sesiones», $3,600, 12 meses) → Caja: paciente Verónica Vargas Cruz, F5 plan láser, efectivo, ticket CENTENARIO-TKT-000031 → Vendidos: plan CENTENARIO-LP-000003, 0/6, valor de sesión $600 → segundo ticket con onicomicosis (láser) y «Usar saldo del plan» → total $0, ticket CENTENARIO-TKT-000032 → Vendidos: el plan pasa a 1/6 → Planes de tratamiento (módulo clínico distinto del plan comercial).

Hallazgos:
- **H-F4 CORREGIDO (migración 131) y regrabado.** «Usar saldo del plan» dejaba el renglón en $0 pero NUNCA descontaba la sesión (el consumo solo se registraba al marcar atendida una cita): un plan de 6 sesiones daba sesiones gratis ilimitadas en mostrador. Ahora `cobrar_venta` registra el consumo por renglón (`piefirme_app.consumir_plan_en_venta`, valida paciente, sede y saldo; no duplica si la cita del ticket ya lo consumió) y `cancelar_venta` lo revierte (`revertir_consumo_venta`). `plan_sesiones_consumo.cita_id` ahora admite NULL y se liga al renglón (`venta_linea_id` único). Verificado en BD: el plan quedó con 1 sesión usada y su registro de consumo de $600.
- Dato de QA inconsistente (no corregible): el ticket CENTENARIO-TKT-000029 (corrida fallida previa, plan CENTENARIO-LP-000002 de Teresa Aguilar Sánchez) se cobró con saldo ANTES de la corrección; ese plan sigue en 0/6 aunque ya se «usó» una sesión. Los planes CENTENARIO-LP-000001/000002 son basura de corridas fallidas. Los datos de QA no se pueden borrar (triggers).
- Límite conocido: revertir un consumo que dejó el plan «consumido» solo lo puede hacer el Administrador (regla ya existente `plan_adquirido_bi`).

## Cambios de infraestructura de grabación
- `demo/lib/video.ts`: `firmar` acepta correo y rol opcionales (ya agregado por otro lote, retrocompatible) y `terminar` cierra el contexto y usa `saveAs` (con la máquina cargada el `.webm` salía cortado y sin duración: se perdían los últimos 30–70 s).
- Con la máquina saturada (decenas de Chrome de otros lotes) las corridas tardaron 7–25 min; usar `--timeout=2000000` y `timeout` largo en segundo plano.
- Las pruebas RLS dejan 12 fallas ajenas a estos cambios (funciones `portal_*` ejecutables por anon, RLS en `_rannix_semillas`, bucket `comercio_img` público): ya existían antes de las migraciones 130/131 (se observaron idénticas tras la 130, que solo tocó una función).
- `node --test src/lib`: 153/153 pasan.
