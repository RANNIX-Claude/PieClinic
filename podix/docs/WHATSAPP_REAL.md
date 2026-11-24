# WhatsApp real (Meta Cloud API) — demo de Pie Clinic

La demo trae un **celular dibujado** con mensajes simulados que funciona sin internet. Este documento activa, **opcionalmente**, el envío real con el **número de prueba gratuito de Meta**. Por defecto está apagado (`VITE_WHATSAPP_REAL=0`).

Eventos que se mandan: **compra recibida · envío creado · recepción confirmada · faltante · inventario mínimo**. El envío lleva el botón **«Recibido»**; al pulsarlo (o responder «faltaron 2») el webhook actualiza el inventario de la sucursal.

## 1. Obtener el número de prueba (≈ 15 min)

1. Entrar a <https://developers.facebook.com> con una cuenta de Facebook y crear una **app** de tipo *Business* (puede pedir verificar el correo y el teléfono).
2. En la app: **Agregar producto ▸ WhatsApp ▸ Configurar**. Meta crea una cuenta de WhatsApp Business de prueba y un **número de prueba gratuito**.
3. En **WhatsApp ▸ API Setup** (Configuración de la API) copiar:
   - **Phone number ID** → `WA_PHONE_ID`
   - **Temporary access token** (dura 24 h) → `WA_TOKEN`. Para que no caduque: *Business Settings ▸ Users ▸ System users*, crear un usuario del sistema, asignarle la app y generar un token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. En el campo **To** agregar hasta 5 **números destinatarios** (con código de país, p. ej. `521…` para México) y confirmar con el código que llega por WhatsApp. Solo esos números pueden recibir mensajes del número de prueba.
5. **Cada destinatario debe escribirle primero al número de prueba** (cualquier texto, por ejemplo «hola») o recibir la plantilla `hello_world`; el texto libre solo se entrega dentro de las 24 h siguientes a su último mensaje. La función ya manda `hello_world` si Meta rechaza el texto por la ventana de 24 h.

## 2. Variables de entorno (solo en Netlify o `.env.local`; nunca en el código)

| Variable | Qué es |
|---|---|
| `VITE_WHATSAPP_REAL` | `1` para activar el envío real desde la app; `0` apagado |
| `WA_TOKEN` | token de acceso de Meta (servidor) |
| `WA_PHONE_ID` | Phone number ID del número de prueba (servidor) |
| `WA_DESTINATARIOS` | números registrados en la lista de prueba, separados por coma, solo dígitos: `5215512345678,5215587654321` |
| `WA_VERIFY_TOKEN` | cualquier texto secreto que tú inventes; se repite al registrar el webhook |
| `WA_APP_SECRET` | *App secret* de la app (Configuración ▸ Básica); valida la firma del webhook (recomendado) |

En Netlify: *Site configuration ▸ Environment variables*. En local con `netlify dev` se leen de `.env.local` (archivo ya ignorado por git). `WA_TOKEN` y `WA_APP_SECRET` **nunca** llevan el prefijo `VITE_`.

## 3. Publicar la función

La función es `netlify/functions/whatsapp.js` (rutas `/enviar`, `/webhook`, `/eventos`; configuración en `netlify.toml`). Requiere publicar en Netlify (`netlify deploy --build --prod` o la rama conectada) o probarla local con `npx netlify dev`.

## 4. Registrar el webhook en Meta

1. En la app de Meta: **WhatsApp ▸ Configuration ▸ Webhook ▸ Edit**.
2. **Callback URL:** `https://TU-SITIO.netlify.app/.netlify/functions/whatsapp/webhook` · **Verify token:** el mismo `WA_VERIFY_TOKEN`.
3. Suscribirse al campo **messages**.
4. Para probarlo desde tu computadora sin publicar: `npx netlify dev` y un túnel (`npx cloudflared tunnel --url http://localhost:8888` o ngrok) y usar esa URL.

## 5. Probar

1. Construir con `VITE_WHATSAPP_REAL=1` (en Netlify, variable y *Deploy*; en local, `$env:VITE_WHATSAPP_REAL="1"; npm run dev`).
2. En **Almacén**: registrar la entrada de compra → los destinatarios reciben «Compra recibida…».
3. Aprobar un reparto → reciben «Van en camino 25 plantillas…» con el botón **Recibido**.
4. Un destinatario pulsa **Recibido** (o escribe «faltaron 2»): en unos segundos la pantalla de Almacén lo toma, actualiza el inventario de la sucursal y muestra «… recibió completo» / «Faltaron 2…» en el celular dibujado.

## Límites de esta demo (honestos)

- La cola de respuestas del webhook vive **en memoria de la función**: si Netlify reinicia la instancia se pierden las respuestas pendientes. Para producción: Netlify Blobs o la base de datos.
- El inventario de la demo vive en el navegador; por eso la app **consulta** `/eventos` cada 5 s mientras la pantalla de Almacén esté abierta. Con base de datos real, el webhook actualizaría el inventario directamente.
- El token temporal caduca en 24 h; usar el del usuario del sistema.
- Con el número de prueba solo se escribe a números registrados. Pasar a número propio exige verificar el negocio en Meta y aprobar plantillas.
- Los mensajes del celular simulado y los reales son el mismo texto; si el envío real falla (sin red, token vencido) la demo sigue funcionando y no muestra error al público.
