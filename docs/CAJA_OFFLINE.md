# Caja sin internet (offline) y sincronización

Decidido 2026-11-25 (dueño): la caja debe seguir operando sin internet y sincronizar al volver la conexión. **Cambia el alcance de P-050** (antes: solo agenda del día y datos mínimos del paciente). **Cambio confirmado por el dueño el 2026-11-25.** Las reglas de abajo son «decididas por defecto, revisables».

## Qué funciona sin internet
- Abrir la aplicación (service worker `public/sw.js` con la copia de los archivos de la app; copia del arranque: perfil, organización y sedes en `localStorage` `pf.arranque`).
- Ver el catálogo de servicios, productos, características, podólogos y el **turno abierto**, y buscar pacientes (solo datos mínimos), desde la copia en IndexedDB (`pf-offline`, almacén `snapshot`). Precio: `precio_lista` de la copia.
- **Cobrar** con efectivo, tarjeta o transferencia, servicios y productos (incluye producto especial con características y descuentos de línea dentro del límite sin PIN) e **imprimir el ticket PROVISIONAL**.

## Qué NO se hace sin internet (se avisa en pantalla)
Paquetes, planes, promociones y uso de saldo de planes; cobrar citas, cuentas abiertas o anticipos; descuentos globales o que pidan PIN; gift cards, Clip y cortesías; facturar; **abrir o cerrar turno / corte** (necesitan al servidor); registrar pacientes nuevos.

## Cómo se sincroniza
1. Cada ticket offline se guarda en la **cola** (`cola` de IndexedDB) con un `cliente_uuid` único y un **folio provisional** `OFF-{SEDE}-{NNNN}` (contador en `localStorage`, no se repite).
2. Al volver la red (evento `online`), cada 30 s y con el botón «Sincronizar ahora», `CajaOffline` llama a la RPC `sincronizar_ticket_offline` (migraciones 081 y 082) **en el orden en que se cobraron**.
3. La RPC crea venta, renglones, características y pagos y la cobra **en una sola transacción**. Es **idempotente**: si el mismo `cliente_uuid` ya existe devuelve ese ticket (no hay duplicados aunque la red se corte a la mitad).
4. El servidor asigna el **folio oficial** (`{SEDE}-TKT-{NNNNNN}`) y guarda el provisional en `ventas.folio_offline`; la fecha del dispositivo en `offline_creada_en`. El ticket entra al **turno abierto del cajero en el momento de sincronizar**.
5. Si el servidor rechaza un ticket (p. ej. sin turno abierto, sin existencia), queda en la cola **con su motivo** y botón «Reintentar»: nunca se pierde.

## Dos tickets offline
Ambos entran a la cola; al conectarse se envían por orden de captura y cada uno recibe su folio oficial consecutivo.

## Seguridad y datos
- El service worker **nunca** guarda respuestas de Supabase ni de terceros: solo archivos de la app.
- Al **cerrar sesión** se borran la copia del arranque y los snapshots (catálogo y pacientes). La **cola de tickets por sincronizar no se borra** (es dinero ya cobrado al cliente).
- Límite conocido: si el equipo permanece sin red más de la vigencia de la sesión (~1 h) y se recarga, la sesión puede pedir volver a entrar al reconectar; la cola se conserva.

## Pendiente / decisiones del dueño
- ¿Se permite abrir turno sin internet? ¿Cobrar anticipos o citas sin internet?
- Política si al sincronizar no hay existencia suficiente (hoy el ticket queda en revisión con su motivo).
- Prueba en una impresora térmica real y en tableta.
