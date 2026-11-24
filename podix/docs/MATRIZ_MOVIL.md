# MATRIZ MÓVIL POR ROL — COMPUERTA (PROMPT_WEBAPP_MOVIL §2)

> Producto: **web app instalable por rol, con menú inferior** (máximo 4 tabs + "Más"). Una app, una puerta (ícono) por rol.
> **Estado: propuesta para aprobación. No se construye nada con esto hasta que la confirmes.**
> Las funciones salen de `REQUERIMIENTO.md`, `MATRIZ_ROLES.md` y los 15 mockups. `[DATO NUEVO]` = el badge o la función necesita una tabla/columna que hoy no está en `DICCIONARIO_DATOS.md`.

## Reglas aplicadas
- Entran solo las funciones de **uso diario o de piso**. Lo demás vive en "Más" o en la versión de escritorio.
- Si el rol tiene acción dominante: **tab central** o **botón flotante**, nunca los dos.
- Tablas → tarjetas con 3-4 datos, estatus como insignia. Formularios de una columna y botón principal fijo abajo.
- El ícono no otorga el rol: el rol sale de la cuenta, validado en servidor (RLS).
- Estilo: paleta morada IRP (`#7B5EA7`), un solo juego de íconos.

---

## 1. Recepción
**Condiciones:** mostrador, de pie, tableta o celular, paciente enfrente, ~25 altas y ~40 citas por sucursal al día.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| Agenda | calendario | 02 Agenda | Ver el día por podólogo; **botón flotante "+ Nueva cita"** | Lista por hora en tarjetas; un día a la vez, deslizar para cambiar de día |
| Pacientes | usuarios | 01 Alta | Buscar paciente (nombre/teléfono/CURP) o dar de alta | Alta en 3 pasos: datos básicos → contacto → firma de aviso y consentimiento |
| Sala | reloj | 02 Agenda | Marcar llegada, pasar a consultorio | Solo citas de hoy: por llegar / en sala / en atención |
| Pendientes | campana | 02 Agenda | Confirmar citas, lista de espera, no-shows | Una tarjeta por pendiente, con botón de llamar o WhatsApp |

**Más:** convenios y membresías, perfil, versión completa, cerrar sesión.
**Badge:** Pendientes = citas por confirmar (existe: `cita.estado`).
**Fuera:** reportes, agenda de otras sucursales, cobros.

## 2. Podólogo
**Condiciones:** consultorio, de pie, guantes, tableta o celular; necesita pocas pulsaciones y cámara. Rota entre sucursales.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| Hoy | calendario | 02 Agenda | Ver mis citas de hoy y abrir la siguiente | Solo mis citas, en la sucursal activa |
| **Consulta** (central) | actividad | 03 Expediente | Nota, exploración, diagnóstico, fotos, insumos, cerrar y enviar a caja | Por pasos con barra de progreso; alertas clínicas arriba (anticoagulado, alergia); cámara directa |
| Pacientes | usuarios | 03 Expediente | Buscar expediente único y ver historial/fotos | Línea de tiempo en vez de tablas |
| Órdenes | frasco | 04 Plantillas | Prescribir plantilla, ver estado del laboratorio | Estados como insignias; retrasadas arriba |

**Más:** mi productividad y comisión, **cambiar sucursal activa** (rotación), recetas, perfil, cerrar sesión.
**Badge:** Hoy = citas restantes (existe). Órdenes = retrasadas (existe: fecha prometida).
**Fuera:** caja, precios, inventario, agenda ajena.

## 3. Asistente clínico
**Condiciones:** consultorio y área de esterilización; manos ocupadas; tableta.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| Hoy | calendario | 02 Agenda | Preparar consultorio según la cita siguiente | Lista de citas con servicio y set requerido |
| **Esterilización** (central) | destello | 15 Esterilización | Registrar ciclo de autoclave y liberar sets | Formulario corto: autoclave, lote, indicador, sets |
| Insumos | caja | 03 Consumos | Registrar consumo y ver stock del consultorio | Escáner/lista con cantidad rápida |
| Bitácoras | portapapeles | — | Desinfección de consultorios y RPBI | Checklist de un toque `[DATO NUEVO]` |

**Más:** perfil, cerrar sesión.
**Badge:** Esterilización = sets sin esterilizar (existe en `uso_set`). Bitácoras = pendientes del día `[DATO NUEVO]`.
**Fuera:** expediente clínico, caja, compras.

## 4. Cajero
**Condiciones:** mostrador, tableta o PC con terminal bancaria y lector; varios cajeros y turnos por sucursal.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| **Cobrar** (central) | carrito | 05 POS | Cobrar consulta + productos en un ticket y facturar | Partidas en tarjetas, total fijo abajo, pago mixto en una hoja inferior |
| Por cobrar | cartera | 05 POS | Consultas cerradas por el podólogo aún sin cobro | Una tarjeta por paciente; tocar para cobrar |
| Apartados | marcador | 07, 08 | Abonar, liquidar, registrar abono de crédito | Apartados y créditos juntos, por paciente |
| Caja | billetes | 06 Caja | Abrir turno, retiros, cambio de turno, corte | Arqueo por forma de pago, firma en pantalla |

**Más:** devoluciones, ventas del turno, nuevo apartado, venta a plazos, perfil.
**Badge:** Por cobrar = consultas cerradas sin venta (existe). Caja = turno abierto sin corte.
**Fuera:** precios, autorizaciones (solo las solicita), inventario.

## 5. Almacén (sucursal y central)
**Condiciones:** de pie, en el almacén, celular con cámara como escáner, **señal intermitente**.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| Existencias | caja | Kardex | Buscar o escanear y ver stock por lote/talla | Una tarjeta por producto |
| **Recibir** (central) | descarga | 09 Compra, 10 Traspaso | Recibir mercancía contra OC o traspaso entrante | Escanear y marcar recibido; diferencias con un toque |
| Traspasos | flechas | 10 Traspaso | Solicitar y enviar traspasos | Estados como insignias |
| Conteo | portapapeles | 11 Inventario | Contar a ciegas, segundo conteo | Pantalla de captura con escáner; **funciona sin señal y sincroniza** |

**Más:** ajustes (solicitar autorización), entrega de plantillas del laboratorio, perfil.
**Badge:** Recibir = traspasos en tránsito y OC por recibir (existe).
**Fuera:** precios, caja, expediente, valuación.

## 6. Gerente de sucursal
**Condiciones:** celular, en piso o fuera de la clínica; decide rápido.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| Hoy | gráfica | 13 Tablero | Ver ventas, ocupación, no-shows, caja | Tarjetas KPI con tendencia; un toque abre detalle |
| **Autorizar** (central) | escudo | 14 Autorizaciones | Autorizar o rechazar crédito, prórrogas, ajustes, cancelaciones, reapertura de corte | Una tarjeta por solicitud con monto y motivo; deslizar para resolver |
| Caja y cartera | billetes | 06, 08 | Cortes por aprobar, cartera vencida, bloquear crédito | Solo excepciones |
| Alertas | campana | 13 Tablero | Stock bajo mínimo, apartados por vencer, laboratorio retrasado | Lista priorizada |

**Más:** agenda de la sucursal, equipo y rotación, precios (consulta), perfil.
**Badge:** Autorizar = pendientes de su nivel (existe: `autorizacion`). Alertas = suma de las 3 fuentes (existen).
**Fuera:** capturas operativas (cobrar, consultar, contar).

## 7. Administración central y Dirección
**Condiciones:** celular para decidir; los cambios de fondo se hacen en escritorio.

| Tab | Ícono | Origen | Acción principal | Qué se simplifica |
|---|---|---|---|---|
| Consolidado | gráfica | 13 Tablero | Ver las 7 sucursales juntas y comparar | Ranking por sucursal, filtros por periodo |
| **Autorizar** (central) | escudo | 14 | Resolver autorizaciones de nivel alto y escaladas | Igual que gerente, con filtro por sucursal |
| Precios | etiqueta | 12 Precios | **Consultar** lista base y ajustes; cambios urgentes | Edición completa queda en escritorio (ver pregunta 3) |
| Compras | caja | 09 Compra, 10 | Ver OC, cuentas por pagar, traspasos desde central | Solo estados y vencimientos |

**Más:** parámetros, usuarios y roles, rotación, reportes, bitácora de auditoría, perfil.
**Badge:** Autorizar = escaladas (existe). Compras = CxP vencidas (existe).

---

## Instalación y entrada
- **Una puerta (ícono) por rol**, 7 íconos instalables. En iPhone el nombre e ícono salen del `<head>`, así que lleva una página de entrada por rol con un solo bundle.
- Service worker: solo el armazón; **nunca** respuestas de datos.
- Modo sin señal: **Almacén (conteo) y Caja (cobros)** encolan y sincronizan. El resto requiere conexión.

## Datos que faltan para los badges y funciones
| Función | Falta |
|---|---|
| Bitácoras de desinfección y RPBI | Tabla de checklist diario por consultorio (`[DATO NUEVO]`) |
| Modo sin señal en caja y conteo | Cola local de operaciones y regla de conflicto (PA-T2 abierta) |

## Hallazgo: proyecto previo en la carpeta de trabajo
Existe `work/ClinicaPodologia/DEv` (**Pie Firme**, SaaS de podología, 5 sedes, morado `#7B5EA7`, esquema y frontend avanzados). Este requerimiento es de **7 sucursales** con crédito, apartados y laboratorio externo. No sé si es el mismo producto o uno distinto; no lo elegí en silencio.
