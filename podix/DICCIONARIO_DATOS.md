# DICCIONARIO DE DATOS — Clínicas de podología (7 sucursales)

> Fuente: `REQUERIMIENTO.md` + 15 mockups propuestos en `docs/mockups/` (ver nota).
> **[VISTO]** = aparece en un mockup. **[INFERIDO]** = agregado por necesidad técnica.
> Nota: los mockups los propuso Claude a partir del requerimiento, no los dibujó el cliente. **Hasta que el cliente los valide (compuerta E3), todo [VISTO] es "visto en propuesta".**
> Sin SQL: esto es el modelo, no el esquema. Los nombres definitivos se fijan en el PASO 0.7.

Convenciones: `PK` llave primaria, `FK→` relación, `*` obligatorio probable. Todas las entidades llevan además [INFERIDO] `creado_en`, `creado_por`, `actualizado_en`, `sucursal_id` cuando aplica.

---
## A. Organización y seguridad

### sucursal  (7)
| Campo | Tipo | Marca |
|---|---|---|
| id PK | uuid | INFERIDO |
| nombre* | texto | VISTO (01-14) |
| dirección, teléfono | texto | INFERIDO |
| zona_horaria | texto | INFERIDO (ver PA-T1) |
| activa | bool | INFERIDO |

### usuario
id PK, nombre*, correo*, rol_principal* — INFERIDO; "cajero", "gerente", "podólogo" — VISTO.
### usuario_sucursal  (rotación de podólogos y cualquier empleado)
usuario_id FK→usuario, sucursal_id FK→sucursal, rol*, vigente_desde, vigente_hasta — INFERIDO (la rotación es VISTO en 02).
### consultorio
id PK, sucursal_id FK, nombre* (C1, C2) — VISTO (02).
### parametro_sucursal
Clave/valor por sucursal con historial de vigencia — VISTO (12): vigencia_apartado_dias, anticipo_minimo_pct, politica_anticipo_vencido, prorroga_autoriza_rol, interes_mensual_pct, recargo_unico, dias_gracia, limite_credito_gerente, limite_credito_admin_central, limite_ajuste_inventario_gerente. Campos `vigente_desde`, `modificado_por` — INFERIDO.

---
## B. Pacientes y agenda

### paciente  (único para las 7 sucursales)
| Campo | Tipo | Marca |
|---|---|---|
| id PK, folio_expediente* (EXP-000482) | | VISTO (03) |
| nombres*, apellidos* | texto | VISTO (01) |
| fecha_nacimiento* | fecha | VISTO |
| sexo | enum | VISTO |
| teléfono*, whatsapp (bool), correo | | VISTO |
| domicilio, ocupación | texto | VISTO |
| contacto_emergencia (nombre, teléfono) | | VISTO |
| origen ("cómo nos conoció") | texto/FK | VISTO |
| convenio_id FK→convenio | | VISTO (campo "Convenio / membresía") |
| tutor_nombre, tutor_parentesco | | VISTO (si menor) |
| sucursal_alta_id | FK | INFERIDO |
| curp | texto | INFERIDO (se usa para búsqueda anti-duplicado, ver PA-P1) |
| activo | bool | INFERIDO |

### paciente_documento
paciente_id FK, tipo (aviso privacidad / consentimiento general / identificación), firmado (bool), firma_imagen, fecha — VISTO (01); archivo — INFERIDO.

### convenio
id, nombre, tipo (empresa/asilo/aseguradora/club), condiciones — INFERIDO (nombre del campo VISTO en 01).

### cita
| Campo | Tipo | Marca |
|---|---|---|
| id PK | | INFERIDO |
| paciente_id*, servicio_id*, podologo_id*, consultorio_id*, sucursal_id* | FK | VISTO (02) |
| inicio*, duración | fecha-hora, min | VISTO |
| estado* | enum | VISTO (ver MODELO_ESTADOS) |
| recurrencia (cada n semanas, n veces), serie_id | | VISTO (02) / INFERIDO serie_id |
| recordatorio (canal, anticipación) | | VISTO |
| a_domicilio (bool) | | VISTO |
| motivo_bloqueo | texto | VISTO (bloqueo de agenda) |

### lista_espera
paciente_id, servicio_id, sucursal_id, preferencia_horario — INFERIDO (botón VISTO en 02).

---
## C. Atención clínica

### consulta
id PK; cita_id FK; paciente_id*; podologo_id*; sucursal_id*; fecha — VISTO (03). estado (abierta/cerrada) — INFERIDO.

### historia_clinica  (1 por paciente)
Antecedentes heredofamiliares, personales patológicos y no patológicos; padecimientos de riesgo (diabetes, neuropatía, insuficiencia vascular, anticoagulantes); alergias; medicación — VISTO como "alertas" (03); estructura detallada — INFERIDO (NOM-004).
### paciente_alerta
tipo, descripción, activa — VISTO (03: "Diabetes tipo 2 · Anticoagulada · Alergia: látex").

### exploracion
consulta_id, peso, talla, glucosa_capilar, presion_arterial, monofilamento, pulsos_pedios, indice_tobillo_brazo, clasificacion_pie_diabetico (Wagner/Texas), exploracion_ungueal — VISTO (03). Biomecánica (huella, marcha, arco) — INFERIDO (requerimiento, sin pantalla).

### diagnostico_consulta
consulta_id, cie10_codigo*, descripción — VISTO (03).
### plan_tratamiento
paciente_id, descripción, sesiones_total, frecuencia, sesión_actual ("3/6") — VISTO (02/03).
### nota_evolucion
consulta_id, texto*, indicaciones — VISTO (03).
### receta
consulta_id, medicamento/indicación, firma — INFERIDO (botón "Receta" VISTO).
### referencia
consulta_id, especialidad destino — VISTO (03: "Endocrinología").
### evidencia_clinica
consulta_id, tipo (foto/estudio), archivo, descripción, fecha — VISTO (03).
### procedimiento_realizado
consulta_id, servicio_id, cantidad — INFERIDO (necesario para cobro y consumo).
### consumo_insumo_consulta
consulta_id, producto_id, cantidad, capa_peps_id — VISTO (03 "Insumos consumidos") / capa INFERIDO.
### consentimiento_procedimiento
paciente_id, servicio_id, firmado, fecha — INFERIDO (requerimiento).
### acceso_expediente  (bitácora)
usuario_id, paciente_id, sucursal_id, acción, fecha-hora — INFERIDO (exigido en requerimiento).

---
## D. Catálogo y precios

### producto  (bienes: bastones, plantillas, calzado, insumos)
sku*, nombre*, categoría*, tipo (venta / insumo clínico / ambos), maneja_lote (bool), maneja_serie (bool), maneja_talla (bool), unidad, stock_mínimo, stock_máximo — VISTO/INFERIDO mezcla: nombre, categoría, "talla", "lote/caducidad" VISTO (05, 09, 11); resto INFERIDO.
### producto_variante
producto_id, talla, color, lado — VISTO (talla "T25") / INFERIDO resto.
### servicio
id, nombre*, duración_min, requiere_consentimiento, consume_insumos (lista) — VISTO (02, 03, 05).
### lista_precio_base
item_tipo (producto/servicio), item_id, precio*, vigente_desde — VISTO (12).
### ajuste_precio_sucursal
sucursal_id, item_id, porcentaje*, vigente_desde — VISTO (12).
### promocion / descuento
nombre, tipo, valor, vigencia — INFERIDO (requerimiento).

---
## E. Ventas, apartados, crédito y caja

### venta
| Campo | Marca |
|---|---|
| id, folio ticket* | VISTO (05 "T-8821") |
| sucursal_id*, cajero_id*, turno_id* | VISTO |
| paciente_id (nulo = público general) | VISTO |
| consulta_origen_id | VISTO ("Origen del cargo") |
| tipo_venta* (contado/apartado/crédito/plazos) | VISTO |
| subtotal, descuento, iva, total | VISTO |
| facturar (bool), rfc, cfdi_uuid | VISTO / INFERIDO uuid |
| vendedor_id (comisión) | VISTO |
| estado | VISTO (ver MODELO_ESTADOS) |
### venta_partida
venta_id, item_tipo, item_id, cantidad, precio_lista, ajuste_sucursal_pct, importe, capa_peps_consumida — VISTO salvo capa (INFERIDO).
### pago
venta_id (o abono_id), forma_pago* (efectivo/tarjeta/transferencia), monto*, referencia — VISTO (05, 06).
### devolucion_cliente
venta_id, partidas, motivo*, resolución (reembolso/cambio/nota de crédito), destino_stock (inventario/merma), autorizado_por — VISTO (05 botón; resolución descrita en requerimiento) / campos INFERIDO.
### nota_credito
cliente, monto, saldo — INFERIDO.
### garantia
venta_partida_id, vigencia, reclamos — INFERIDO (requerimiento).

### apartado
folio (AP-0045)*, paciente_id*, producto_id (o partidas), sucursal_id*, precio, anticipo_minimo, anticipo_recibido, saldo, fecha_alta, vence*, estado — VISTO (07).
### apartado_abono / apartado_prorroga
abono: fecha, monto. prórroga: fecha_anterior, fecha_nueva, autorizado_por — VISTO (botones en 07) / campos INFERIDO.

### credito_paciente
paciente_id, limite*, saldo, bloqueado (bool) — VISTO (08). Vigente en las 7 sucursales (INFERIDO de "pagar en otra sucursal").
### plan_pago
venta_id, tipo (plazos / crédito abierto), monto, enganche, n_parcialidades, periodicidad — VISTO (08).
### parcialidad
plan_id, número, vence, capital, interes, recargo, pagado, estado — VISTO (08).
### abono_credito
plan_id / parcialidad_id, monto, sucursal_cobro_id, fecha — VISTO (06 "Abonos de crédito").

### autorizacion
tipo (crédito/prórroga/ajuste inventario/cancelación/descuento/reapertura corte), solicitante_id, referencia_id, monto, nivel_requerido, estado, autorizado_por, fecha, motivo — VISTO (14).

### turno_caja
cajero_id, sucursal_id, turno, fondo_inicial, abierto_en, cerrado_en, estado — VISTO (06).
### movimiento_caja
turno_id, tipo (retiro/depósito/gasto menor/venta/abono), concepto, monto, hora — VISTO (06).
### corte_caja
turno_id, forma_pago, esperado, contado, diferencia, justificación, entrega_id, recibe_id, firmas — VISTO (06).

---
## F. Compras, almacén e inventario

### proveedor
nombre*, rfc, condiciones de pago, días de entrega — INFERIDO (requerimiento; "OrtoMed SA" VISTO).
### requisicion / orden_compra / orden_compra_partida
folio OC*, proveedor_id*, destino (almacén)*, estado, partidas: producto, ordenado — VISTO (09) parcial; requisición y aprobación — INFERIDO.
### recepcion_compra / recepcion_partida
oc_id, factura (folio, XML CFDI), vencimiento_pago, partida: recibido, diferencia, costo_unit*, lote, caducidad — VISTO (09).
### cuenta_por_pagar
proveedor, documento, vencimiento, saldo — VISTO (campo vencimiento en 09) / resto INFERIDO.
### devolucion_proveedor
oc/recepción, motivo, nota_crédito — VISTO (botón 09).

### almacen
id, sucursal_id (null = central), nombre — VISTO ("Almacén central" 09, 10).
### existencia
almacen_id, variante_id, lote, cantidad, apartada — INFERIDO (cantidad VISTO).
### capa_peps
almacen_id, variante_id, lote, fecha_entrada, cantidad_restante, costo_unit — INFERIDO (PEPS confirmado en requerimiento).
### movimiento_inventario  (kardex)
tipo (compra/venta/traspaso/ajuste/merma/consumo/devolución), origen_id, destino_id, cantidad, costo, referencia — INFERIDO.
### traspaso / traspaso_partida
folio (TR-0450)*, origen, destino, solicitado_por, estado, partidas: solicitado, enviado, recibido, diferencia — VISTO (10).
### inventario_fisico / conteo
tipo (cíclico/general), sucursal, responsable, alcance (categoría), estado, # conteo; partidas: contado, sistema_oculto, diferencia, valor_dif — VISTO (11).
### ajuste_inventario
inventario_fisico_id, producto, motivo*, valor, autorizado_por — VISTO (11).

---
## G. Laboratorio externo y esterilización

### laboratorio_externo
nombre — VISTO ("LabOrtho SA"); contacto, condiciones — INFERIDO.
### orden_laboratorio
folio (LAB-0231)*, consulta_id/paciente_id, tipo ortesis, pie, talla, método de toma, correcciones, laboratorio_id, enviada, prometida, estado, costo_lab, retrabajo (bool), anticipo_requerido_pct — VISTO (04) salvo costo/retrabajo (INFERIDO).
### autoclave, ciclo_esterilizacion
autoclave: id, nombre — VISTO. ciclo: folio (CIC-20291), lote, indicador_quimico, indicador_biologico, responsable, resultado — VISTO (15).
### set_instrumental, uso_set
set: id (SET-04). uso: set_id, ciclo_id, paciente_id/consulta_id, consultorio, fecha — VISTO (15).
### bitacora_rpbi / mantenimiento_equipo
INFERIDO (requerimiento, sin pantalla).

---
## H. Transversal

### comision
beneficiario, concepto, base, porcentaje, monto — INFERIDO (requerimiento; "Comisión" VISTO en 13).
### notificacion
canal, destino, plantilla, estado — INFERIDO.
### bitacora_auditoria
usuario, acción, entidad, entidad_id, antes/después, fecha — INFERIDO (requerimiento: "bitácora de quién cambió qué").

---
## Relaciones clave (resumen)
- `paciente` 1─N `cita`, `consulta`, `venta`, `apartado`, `plan_pago`, `orden_laboratorio`; 1─1 `credito_paciente`.
- `consulta` 1─N `procedimiento_realizado`, `consumo_insumo_consulta`, `evidencia_clinica`; 0─1 `venta` (consulta cobrada).
- `venta` 1─N `venta_partida`, `pago`, `devolucion_cliente`; 0─1 `plan_pago` 1─N `parcialidad`.
- `producto` 1─N `variante` 1─N `existencia`/`capa_peps` por `almacen`.
- `usuario` N─N `sucursal` (rotación) con rol por sucursal.

---

# AMPLIACIÓN V2 — entidades nuevas (derivadas del código)

> **Cambio de fuente.** Para la ampliación **no hubo mockups** (la etapa E2 se saltó; desviación registrada en `REGLAS_NEGOCIO.md`). El modelo se derivó del **código construido**: semillas en `src/store/dominios/*.js` y acciones en `src/store/acciones_*.js`.
> En esta sección **[VISTO]** = el campo existe en el código (estado de la demostración). **[INFERIDO]** = supuesto mío para cuando esto sea tabla en la base. Los nombres son los del estado en el navegador (`d.<clave>`); los nombres de tabla definitivos en el esquema `piefirme` los fija [`docs/V2_ESQUEMA.md`](docs/V2_ESQUEMA.md) (lo escribe otro agente; **al momento de redactar este diccionario ese archivo aún no existía**) y las migraciones 064–071 del proyecto hermano.
> Todo registro nuevo guarda **quién** (`usuarioId`) y **en qué sucursal** estaba trabajando (`sucursalId`) [VISTO].

## I. Cimientos compartidos

### sesion (`d.sesion`)
`userId`, `sucursalId` (sucursal donde trabaja hoy; `"CEN"` = almacén central) — VISTO (`core.js`). En base: se deriva del token y de una tabla de «sucursal activa del día» — INFERIDO.

### historico_mensual (`d.hist`)
`sucursalId`, `mes` (AAAA-MM), `servicios`, `plantillas`, `productos` (pesos), `costo` (producto vendido + laboratorio), `pacientes` — VISTO (`dominios/index.js`). 12 meses anteriores al actual; el mes en curso **no** está aquí. En la demostración es generado; en base sería una vista o tabla de cierre mensual — INFERIDO.

### venta — campos que la ampliación usa o agrega
`vendedorId` (quien vendió; si falta, cuenta `cajeroId`), `origen` (`"pedido_web"`), `pedidoWebId`, partida de tipo `"envio"`, forma de pago `"en_linea"` — VISTO (`acciones_cajero.js`, `acciones_comercial.js`).

## J. Personas (`d.rh`, `d.cap`)

### empleado (`d.rh.empleados`)
| Campo | Tipo | Marca |
|---|---|---|
| id (E1…), usuarioId (nulo si no tiene cuenta) | texto / FK→usuario | VISTO |
| nombre*, rol*, puesto*, foto (miniatura) | texto / imagen | VISTO |
| sucursalBase*, sucursales[] (donde puede trabajar) | FK→sucursal | VISTO |
| sueldoMensual* (bruto) | dinero | VISTO |
| ingreso*, ingresoOriginal (si reingresó), estado* (`activo`/`baja`), bajaFecha, bajaMotivo | fecha / enum / texto | VISTO |
| nacimiento, telefono, correo, domicilio, curp, rfc, nss | texto | VISTO |
| emergencia {nombre, parentesco, telefono} | objeto | VISTO |
| contrato {tipo, inicio, fin, firmado} | objeto | VISTO |
| horario {entrada, salida} (HH:mm) | objeto | VISTO |
| expediente {doc: {ok, fecha, usuarioId}} — documentos: acta, curp, rfc, nss, domicilio, ine, contrato, cédula (solo podólogo) | objeto | VISTO |
| archivo digital de cada documento | archivo privado | INFERIDO (hoy solo se marca «entregado») |

### asistencia (`d.rh.asistencia`)
id, empleadoId*, fecha*, sucursalId* (donde checó), programada (donde le tocaba), entrada (HH:mm), salida, sucursalSalida, estado* (`normal`/`retardo`/`falta`/`vacaciones`/`incapacidad`), minutosTarde, usuarioId — VISTO. Único por empleado y fecha — VISTO (regla), llave única — INFERIDO.

### asignacion (`d.rh.asignaciones`)
id, empleadoId*, `dow` (0–6, programación semanal) **o** `fecha` (excepción), sucursalId (nulo = descanso), usuarioId — VISTO.

### incidencia (`d.rh.incidencias`)
id, empleadoId*, tipo* (`permiso`/`incapacidad`/`falta_justificada`/`llamada`/`acta`/`otro`), desde*, hasta, detalle*, estado* (`solicitada`/`aprobada`/`rechazada`/`registrada`), usuarioId, sucursalId, ts, resueltoPor, resueltoEn — VISTO.

### vacacion (`d.rh.vacaciones`)
id, empleadoId*, desde*, hasta*, dias (laborables), estado* (`solicitada`/`aprobada`/`rechazada`), solicitadoEn, resueltoPor, resueltoEn, motivo, nota, usuarioId, sucursalId — VISTO.

### movimiento_personal (`d.rh.movimientos`)
id, empleadoId*, fecha, tipo* (`alta`/`baja`/`reingreso`/`cambio`), detalle, motivo, finiquito {estado, vacaciones, prima, aguinaldo, total…}, imss {estado: `pendiente_envio`/`no_aplica`, aviso}, usuarioId, sucursalId — VISTO.

### recibo_nomina (`d.rh.recibos`)
id = folio (RN-0001), empleadoId*, sucursalId (base), periodo {tipo `quincenal`/`mensual`, mes, q, desde, hasta}, salarioDiario, diasPagados, sueldoPeriodo, faltas, retardos, descFaltas, descRetardos, descuentos, total, firmado, firmadoEn, generado, usuarioId — VISTO. Único por empleado y periodo — VISTO.

### parametros_rh (`d.rh.params`)
toleranciaMin (10), retardosPorFalta (3), inicioControl (fecha) — VISTO. Por sucursal — INFERIDO (hoy son de toda la cadena).

### curso (`d.cap.cursos`)
id, titulo*, categoria, resumen, estado* (`borrador`/`publicado`/`archivado`), version, revision, creadoPor, fecha, asignado {roles[], personas[], nuevos}, lecciones[{id, titulo*, minutos, texto, pasos[], checklist[], youtube (id de 11 caracteres), video, docTitulo, docUrl}], evaluacion {minimo, preguntas[{p, opciones[], correcta}]} — VISTO.

### avance_curso (`d.cap.avance`)
id, usuarioId*, cursoId*, sucursalId, vistas[] (lecciones), evaluaciones[{fecha, calif}], aprobado, completado (fecha), constancia (folio CT-0001), ult — VISTO.

### acervo (`d.cap.acervo`)
id, titulo*, tipo* (`video`/`foto`/`guia`/`procedimiento`/`formato`), categoria*, descripcion, etiquetas[], contenido, imagenes[], youtube, docUrl, roles[] (quién lo ve), sucursalId (nulo = todas), estado (`publicado`/`archivado`), version, revision {fecha, responsable}, subidoPor, fecha — VISTO.

## K. Finanzas (`d.fin`)

### categoria_gasto (`d.fin.categorias`)
id (renta, luz, agua, internet, limpieza, mantenimiento, publicidad, papeleria, otros), nombre, fijo, recurrente — VISTO.

### gasto (`d.fin.gastos`)
id, sucursalId*, fecha*, categoria*, concepto*, monto*, proveedorId, acreedor, comprobante (imagen), fuente* (`manual`/`nota_ia`/`recurrente`), recurrenteId, notaId, registradoPor*, creadoEn — VISTO. Estado «eliminado» — INFERIDO (hoy el gasto se borra de la lista y queda solo la bitácora).

### gasto_recurrente (`d.fin.recurrentes`)
id, sucursalId*, categoria*, concepto, monto*, diaMes* (1–28), acreedor, proveedorId, activo — VISTO.

### nota_compra (`d.fin.notasCompra`)
id, folio (NC-0001), tipo* (`mercancia`/`gasto`), proveedorId*, folioProveedor*, fecha*, partidas[{productoId, cant, costo, importe}], total, almacenId (si dio entrada al inventario), cxpId, gastoId, foto, origen (`ia_simulada`/`manual`/`orden_de_compra`), duplicadoConfirmado, registradoPor, sucursalId, creadoEn — VISTO. `cuenta_por_pagar` gana `notaId` — VISTO.
Borrador de la lectura (no se guarda): proveedor, folio, fecha, partidas y total, cada uno con `confianza` 0–1 — VISTO.

## L. Desempeño (`d.bonos`, `d.eval`)

### esquema_bono (`d.bonos.esquemas`)
id, nombre*, tipo* (`individual`/`sucursal`), periodo* (`mensual`/`trimestral`), base* (`ventas`/`producto`/`plantillas_calzado`/`cumplimiento`), roles[]*, escalones[{desde, tipo `pct`/`monto`, valor}]*, tope, condiciones {asistenciaMin, califMin}, nota, activo, porValidar, creadoPor, actualizado, actualizadoPor — VISTO.

### meta_sucursal (`d.bonos.metas`)
sucursalId*, mes*, meta* (pesos enteros), origen (`fijada`/`sugerida`/`propuesta_aprobada`), por, fecha — VISTO. Historial de cambios de una misma meta — INFERIDO (hoy se sobrescribe y queda en bitácora).

### propuesta_meta (`d.bonos.propuestas`)
id, sucursalId*, mes*, meta*, nota, origen, porId, fecha, estado (`pendiente`/`aprobada`/`rechazada`), resueltoPor, resueltoEn — VISTO.

### libro_bonos (`d.bonos.pagados`)
id, esquemaId*, periodoClave* (`2026-10` o `2026-T4`), tipo, usuarioId (individual) o sucursalId (sucursal), base, bono (monto congelado), estado (`aprobado`/`pagado`), aprobadoPor, aprobadoEn, pagadoPor, pagadoEn, registradoEn, reparto[{usuarioId, dias, monto}] — VISTO.

### atribucion_historica (`d.bonos.hist`)
mes, usuarioId, sucursalId, ventas, producto, plantillasCalzado, nVentas, dias — VISTO (resumen por persona de meses cerrados; generado en la demostración).

### evaluacion_cliente (`d.eval`)
id, citaId*, pacienteId, sucursalId, podologoId, fecha, califServicio, califPodologo, califSucursal (enteros 1–5), comentario (≤ 500), estado* (`pendiente`/`respondida`), canal (`whatsapp`/`correo`), enviadaEn, enlace, seguimiento {estado `nuevo`/`contactado`/`resuelto`, nota, por, fecha}, creadaPor, respondidaDesde — VISTO. Una por cita — VISTO.

## M. Comercial (`d.pedidosWeb`, `d.auditorias`, `d.investigacionesInv`, `d.asistenteLog`…)

### pedido_web (`d.pedidosWeb`)
id, folio (PW-0001), fecha, sucursalId* (recolección), cliente {nombre, telefono (10 dígitos), correo}, entrega* (`sucursal`/`domicilio`), direccion, partidas[{productoId, nombre, cant, precioLista, ajustePct, precio, importe}], subtotal, envio, envioPorValidar, total, pago {forma `en_linea`/`en_sucursal`/efectivo/tarjeta/transferencia, estado `pendiente`/`pagado`/`por_reembolsar`, ref, simulado}, estado* (ver MODELO_ESTADOS), historial[{ts, estado, usuarioId, nota}], motivoCancelacion, ventaId, entregadoPor — VISTO. Relación con `paciente` — INFERIDO (hoy el cliente web no es paciente).

### configuracion_comercial (`d.comercialCfg`)
costoEnvio (99), envioPorValidar, envioGratisDesde (0), auditoriaDiasMax (7), toleranciaPct (10), maxFotos (40) — VISTO.

### auditoria_distancia (`d.auditorias`)
id, folio (AF-0001), sucursalId*, zona, origen* (`colaborador`/`camara`), camaraRef, usuarioId*, fecha, fotos[] (máx. 3, miniaturas), items[{productoId, sistema, estimado, estimadoIA, confianza, dif, estado `ok`/`diferencia`, corregido, resolucion {tipo `ajuste`/`investigacion`, autId o invId, motivo, por, fecha, cant}}], nota, simulado, fotosDescartadas — VISTO.

### investigacion_inventario (`d.investigacionesInv`)
id, folio (INV-0001), auditoriaId, productoId, sucursalId, abiertaPor, fecha, estado (`abierta`/`cerrada`), faltante, valor, notas[{ts, usuarioId, texto}], conclusion, cerrada, cerradaPor — VISTO.

### asistente_log (`d.asistenteLog`) y seguimiento_cobranza (`d.seguimientosCobranza`)
Log: por usuario, pregunta, respuesta, acciones propuestas {id, tipo `traspaso`/`recordar_pago`, params, estado `propuesta`/`ejecutada`/descartada, resultado} — VISTO. Seguimiento: id, planId, pacienteId, sucursalId, fecha, diasMora, vencido, canal (`pendiente_de_envio`), estado, usuarioId — VISTO.

## N. Comunicación (`d.com`)

### hilo y mensaje (`d.com.hilos`)
Hilo: id, tipo* (`directo`/`grupo`/`sucursal`/`rol`/`todos`), nombre, miembros[], fijado y silenciado por usuario. Mensaje: id, de, ts, texto (≤ 2,000), imagen, leidoPor[] — VISTO.

### correo_interno (`d.com.correos`)
id, de, para[], cc[] (ya expandidos a personas), asunto*, cuerpo, imagen, ts, leidoPor[], destacadoPor[], archivadoPor[], etiquetas[] (Administrativo, RRHH, Clínico, Compras, Finanzas, Urgente), responderA (encadena), borrador — VISTO.

### publicacion (`d.com.feed`) y `d.com.feedVisto`
id, autorId, ts, tipo* (`aviso`/`logro`/`reconocimiento`/`evento`/`foto`), titulo*, texto, imagen, fijado, alcance* (`todos` o sucursalId), etiquetadoId, reacciones {emoji: [usuarioId]}, comentarios[{id, de, ts, texto ≤ 600}]. `feedVisto`: última visita por usuario — VISTO.

## O. Plataforma (EN CONSTRUCCIÓN al momento de documentar)

> El motor del DW (`src/store/plataforma_dw.js`), la semilla (`src/store/dominios/plataforma.js`) y las acciones (`src/store/acciones_plataforma.js`, que apareció durante la redacción) existen. **Las diez pantallas de plataforma aún no existían** cuando se escribió esto: lo de abajo describe la semilla y puede cambiar.

### configuracion (`d.config`)
nombreComercial, razonSocial, rfc, regimenFiscal, domicilioFiscal, cp (todos **ficticios** en la demostración), telefono, correo, sitio, logo, colores, zonaHoraria (`America/Mexico_City`), moneda (MXN), ivaPct (16), preciosIncluyenIva (true), series{}, politicas{devoluciones, privacidad, cancelacionCitas, credito}, integraciones[{id, nombre, uso, proveedor, estado `simulada`/`pendiente_llave`, nota}], version — VISTO (semilla).

### documento_clinica (`d.documentos`)
id, folio (DOC-0001), titulo, categoria (licencia, aviso, renta, poliza, permiso, rpbi, contrato, fiscal, manual, formato), sucursalId (nulo = cadena), emision, vigencia (nula = no vence), responsableId, version, emisor, numero, visibilidad (`todos`/`gerencia`/`admin`), estado, notas, archivo {tipo, url, miniatura}, historial[] — VISTO (semilla).

### catalogos (`d.catalogos`)
formasPago[], motivos[] (devolución, ajuste, baja, cancelación de cita), categoriasProducto[] — VISTO (semilla).

### data warehouse (`d.dw`)
corridas[] (bitácora de cargas), tablas (conteos), resumen (tablero mensual). Tablas calculadas, no guardadas: `dw_dim_tiempo`, `_sucursal`, `_servicio`, `_producto`, `_podologo`, `_paciente` (**anonimizado**), `_forma_pago`, `_categoria_gasto`; `dw_fact_ventas`, `_pagos`, `_devoluciones`, `_citas`, `_consultas`, `_gastos`, `_asistencia`, `_inventario`, `_historico`; `dw_kpi_*` — VISTO (`plataforma_dw.js`).

### validacion, entrega, asistenteCalif (`d.validacion`, `d.entrega`, `d.asistenteCalif`)
Claves sembradas — VISTO; su forma final depende de las acciones que faltan — sin documentar todavía.

## Relaciones clave de la ampliación
- `usuario` 0─1 `empleado` 1─N `asistencia`, `asignacion`, `incidencia`, `vacacion`, `movimiento_personal`, `recibo_nomina`.
- `curso` 1─N `avance_curso` N─1 `usuario`.
- `sucursal` 1─N `gasto`, `gasto_recurrente`, `meta_sucursal`, `auditoria_distancia`, `pedido_web`.
- `nota_compra` 1─1 `cuenta_por_pagar`; 0─1 `gasto`; 0─N `capa_peps`.
- `esquema_bono` 1─N `libro_bonos`; `venta` N─1 `usuario` (vendedor) y N─1 `sucursal`.
- `cita` 0─1 `evaluacion_cliente`.
- `pedido_web` 0─1 `venta`; `auditoria_distancia` 1─N item 0─1 `autorizacion` o `investigacion_inventario`.

## Lo que el requerimiento pide y el dato aún no tiene
- **Tipo de cambio de precio**: el historial de precios (`listaPreciosHist`) guarda `motivo`, antes y después; **no existe el campo «tipo de cambio»** ni la liga con la nota de compra que lo originó (preguntas V2-38 y V2-39).
- **Archivos del expediente del empleado**: solo la marca de entregado.
- **Carga social y percepciones variables** de la nómina: no hay campos.
