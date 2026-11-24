# Frontend · área COMERCIAL (agenda, ventas, catálogo, portal del paciente)

Rutas: `src/routes/comercial.jsx` · Menú: `src/menu/comercial.js` (AGENDA) y `src/menu/comercial_ventas.js` (VENTAS).
Páginas: `src/pages/comercial/`, `src/pages/portal/` · Lógica pura: `src/lib/comercial/` · Adaptadores: `src/lib/adaptadores/{clip,pac,mensajeria}.js` · Función de servidor: `netlify/functions/clip-pago.js`.
Pruebas: `node --test src/lib/comercial/` (31 pruebas, todas pasan).

## Pantallas

| Ruta | Mockup | Roles | Lee (vistas / RPC) | Escribe |
|---|---|---|---|---|
| `/agenda` | 01 | A, P, R | `prp_agenda`, `prp_bloqueos_agenda`, `festivos`, `cabinas`, `perfiles` | `citas` (estado, reprogramar por arrastre) |
| `/agenda/nueva` | 11 | A, R (P solo lectura de agenda) | `prp_servicios`, `prp_agenda`, `prp_bloqueos_agenda`, `prp_pacientes`; RPC `precio_vigente`, `disponibilidad`, `generar_liga_cita`, `autorizar_con_pin` | `citas`, `anticipos`, `lista_espera` |
| `/lista-espera` | 12 | A, R | `prp_lista_espera`, `prp_agenda` (huecos = canceladas futuras) | `lista_espera` |
| `/recordatorios` | config. de recordatorios | A, R | `prp_recordatorios`, `organizaciones.parametros`; RPC `reenviar_recordatorio` | `organizaciones.parametros` (solo A) |
| `/agenda/horarios` | (22) horarios, bloqueos, festivos | A, P, R | `prp_horarios_atencion`, `prp_bloqueos_agenda`, `festivos`; RPC `citas_afectadas_por_bloqueo` | `horarios_atencion`, `bloqueos_agenda`, `festivos` |
| `/mi-agenda` | 30 (PWA móvil) | A, P, R (menú: P) | `prp_agenda` | `citas.estado` (confirmar / no asistió) |
| `/caja` (pestañas Cobro, Tickets del día, Corte) | 17 | A, R | `prp_turnos_caja`, `prp_citas_sin_cobro`, `prp_servicios/productos/ofertas`, `prp_anticipos`, `prp_planes_adquiridos`, `prp_ventas`, `prp_venta_lineas`, `pagos`, `movimientos_caja`, `prp_cortes_caja`, `prp_gift_cards`; RPC `precio_vigente`, `autorizar_con_pin`, `aplicar_descuento_global`, `cobrar_venta`, `cancelar_venta`, `reimprimir_ticket`, `cerrar_turno`, `revisar_turno` | `turnos_caja`, `ventas`, `venta_lineas`, `pagos`, `movimientos_caja` |
| `/facturacion` | 18 | A, R (cancelar y nota de crédito: A) | `prp_facturacion_pendiente`, `prp_facturas`, `prp_notas_credito`, `cfdi_receptores`, `emisor_fiscal`, `pac_configuracion`; RPC `crear_factura_desde_venta`, `timbrar_factura_simulado`, `emitir_nota_credito`, `generar_factura_global_borrador` | `cfdi_receptores`, `cfdi_cancelaciones`, `emisor_fiscal`, `pac_configuracion` |
| `/catalogo` | 19 | A (edita), P y R (consulta) | `prp_servicios`, `prp_productos`, `prp_precios_historial`, `prp_inventario`, `precios` | `servicios`, `productos`, `precios` (versiones nuevas; nunca se sobrescribe) |
| `/paquetes` | 20 | A (edita), P y R (consulta) | `prp_ofertas`, `prp_planes_adquiridos`, `prp_membresias`, `prp_gift_cards`, `oferta_componentes`, `precios` | `ofertas`, `oferta_componentes`, `precios` |
| `/reservar/:clinica` (pública) | 25, 26 | sin sesión | RPC `portal_catalogo`, `portal_disponibilidad`, `portal_retener_horario`, `portal_lista_espera`; función `clip-pago` | — |
| `/cita/:token` (pública) | 27 | sin sesión | RPC `portal_ver_cita`, `portal_accion_cita`, `portal_disponibilidad` | — |
| `/sala/:token` (pública) | 29 | sin sesión | RPC `portal_sala_estado`, `portal_sala_entrar` | — |

El mockup 28 (home pública) es el portal estático de la raíz (`portal/index.html`): no se tocó.

## Qué quedó completo

- **Agenda**: día/semana; por podólogo o por cabina; tarjetas por estado con los colores del semáforo; bloqueos (sombreados) y festivos; línea de «ahora»; arrastrar y soltar para reprogramar con reglas (`validarReprogramacion`: solo por confirmar/confirmada, no al pasado, sin empalme de podólogo/cabina con margen de 10 min, sin bloqueo ni festivo cerrado, cuenta como reprogramación y avisa si ya pasó de 2 o hay menos de 48 h); detalle de cita con transiciones de estado, política de cancelación/anticipo en pantalla, liga del paciente (copiar/WhatsApp manual), reenviar recordatorio, anticipo y reembolso manual.
- **Nueva cita**: todos los campos del mockup (paciente, servicio, podólogo, sede, fecha/hora, duración, cabina, tipo presencial/domicilio/video, sobrecupo con PIN, seguimiento/garantía, primera vez, notas, precio vigente por sede y fecha, anticipo sugerido 30 %, método, origen, liga de confirmación, lista de espera), disponibilidad desde la RPC `disponibilidad`, detección local de conflicto con sugerencia de cabina alterna, tres botones de agendado.
- **Lista de espera**: prioridad antes que antigüedad, ventana de 30 min por notificado, vence a 14 días, huecos liberados que coinciden, notificar (wa.me + registro), reactivar, quitar, alta.
- **Caja**: apertura de turno, cobro (cita por cobrar o mostrador; servicios, productos, planes con saldo, paquetes, gift cards, membresías; promoción; descuento por línea y global; PIN a partir de 10 %; anticipos aplicados; pago dividido efectivo/tarjeta/SPEI/Clip/gift card/cortesía con cambio), cuenta abierta y retomarla, ticket de 80 mm imprimible, reimpresión marcada «COPIA», cancelación con motivo, corte de turno con tolerancia $50 y PIN, movimientos de caja, impresión del corte, revisión por el Administrador.
- **Facturación**: por facturar, timbradas, canceladas, notas de crédito, datos fiscales de clientes, configuración de emisor y PAC; datos del receptor (RFC, razón social, CP, régimen, uso CFDI), público en general, IVA exento/16 % por concepto (el CFDI debe cuadrar con el ticket), borrador → timbrar, vista previa/PDF imprimible, cancelación SAT 01–04 con UUID sustituto, nota de crédito, factura global en borrador.
- **Catálogo**: servicios y productos con todos los campos, tipos de precio (fijo/desde/por unidad/a valorar/gratis), vigencia, histórico por concepto, cambio futuro programado, precio por sede, importación pegando CSV.
- **Paquetes y más**: paquete servicio+producto (con ahorro), plan multisesión (sesiones editables), membresía, gift card, promoción (vigencia y límite de usos), pausar/activar/cancelar/duplicar, y pestaña de lo vendido (planes de pacientes, membresías, gift cards).
- **Portal público**: reserva de 5 pasos sin cuenta, lista de espera, retención de horario con cuenta regresiva, consentimientos (aviso de privacidad y términos obligatorios), tutor si es menor, datos fiscales opcionales; confirmar/reprogramar/cancelar por liga (reembolso según la hora); sala de espera de videoconsulta con prueba local de cámara/micrófono y firma del consentimiento.
- **Móvil**: `/mi-agenda` con agenda del día, siguiente cita, llamar/WhatsApp, confirmar; sin conexión muestra la última agenda cargada (en `sessionStorage`, no en disco).

## Qué quedó SIMULADO (visible en pantalla como «Modo simulado: sin llave…»)

- **Clip** (`adaptadores/clip.js`, `netlify/functions/clip-pago.js`): el pago del portal no cobra nada; tarjeta que termina en 0002 se rechaza, cualquier otra se aprueba y se registra con `servicio_pago_reserva` (modo `simulado`). En recepción no hay liga real: «Registrar pago (Clip simulado)». En caja el cajero captura el ID de pago de la terminal.
- **PAC / timbrado** (`adaptadores/pac.js`): usa `timbrar_factura_simulado` (UUID sintético, sin validez fiscal; el PDF lleva marca de agua). Requiere `pac_configuracion.modo = 'simulado'` (botón en Facturación › Configuración fiscal).
- **Mensajería** (`adaptadores/mensajeria.js`): la BD programa los recordatorios en `recordatorios`; no hay proveedor, así que el envío es manual con enlaces wa.me.
- **Video**: no hay proveedor; la sala solo registra el consentimiento y el paso a «sala de espera».

## Cambios fuera de mi área (mínimos)

- `src/App.jsx`: las rutas con `publica: true` se renderizan sin sesión y sin marco (necesario para el portal sin sesión). Son ~10 líneas al inicio de `Rutas()` + el import de `matchPath`.

## Huecos y pendientes

1. **`portal_ver_cita` no devuelve** slug, sede, servicio ni podólogo: sin ellos el paciente no puede ver horarios al reprogramar. Solución provisional: la liga que genera Recepción lleva `?c=slug&s=sede&sv=servicio&p=podólogo` (el slug se lee de `organizaciones_portal`, solo si el rol puede leerla; hoy solo Administrador). Si falta, el paciente escribe día y hora y el servidor valida. Propuesta: ampliar la RPC para devolver `slug`, `sede_id`, `servicio_id`, `podologo_id`.
2. **Funciones de servidor pendientes**: Clip real (reemplazar el bloque PROCESADOR de `clip-pago.js`; webhooks; reembolso por API), timbrado real (llamar al PAC y `servicio_marcar_timbrada`), envío de recordatorios (consumir `servicio_recordatorios_pendientes`), expiración de liga de pago.
3. Variables de entorno de `clip-pago`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo en Netlify), `CLIP_MODO=simulado`. Sin ellas responde 503.
4. **Paquete exige `vigente_hasta`** por constraint (`ofertas`), aunque el mockup dice «sin fin»: la pantalla lo pide.
5. `ligas_cita`/«Agendar y cobrar anticipo con liga Clip»: no hay liga de pago real; el anticipo queda `pendiente` y se marca pagado con el botón simulado.
6. `prp_citas_sin_cobro` solo lista citas atendidas (nota firmada): una cita no atendida se cobra desde Agenda › Cobrar (`/caja?cita=ID`).
7. Reintento de cobro: si `cobrar_venta` falla después de insertar `pagos`, esos pagos quedan en el ticket (no se pueden borrar); al reintentar no se vuelven a insertar. Conviene que el servidor ofrezca una RPC atómica «cobrar con pagos».
8. Descuento global y de línea: el servidor reemplaza los de línea con el global (lo mismo hace la vista previa).
9. `prp_agenda` no trae el campo `anticipo_monto` ni teléfono de otras sedes; el KPI «huecos que coinciden» usa citas canceladas futuras (no calcula huecos libres reales de horario).
10. Plantillas de recordatorio: solo vista previa (no hay tabla de plantillas editable en la UI; existe `recordatorios.plantilla_id` pero no se vio tabla de plantillas en 028).
11. Columnas por confirmar contra BD real: `perfiles` legible por Recepción (para listar podólogos), `organizaciones_portal` legible por Recepción, `festivos` y `cabinas` como tablas base, `prp_inventario.existencia` agregada en el cliente, columnas extra de la RPC `disponibilidad` (se usan `inicio`, `fin`, `podologo_id`, `cabina_id`).
12. Facturación: «Reenviar» por correo y descarga ZIP XML/PDF no existen (no hay XML en modo simulado).
13. Textos de aviso de privacidad y términos del portal son una base genérica que cada clínica debe validar con su abogado.
