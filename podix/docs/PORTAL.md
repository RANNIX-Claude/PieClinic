# Portal público (Pie Clinic Ortopédicos)

Versión de **demostración** para cliente potencial. Se publica en `/`; la aplicación vive en `/app/`.

## Estructura
- `portal/index.html` — página única (comentario inicial: qué es real y qué es demostración).
- `portal/assets/portal.css` — estilos (modo claro/oscuro con `prefers-color-scheme`, 360 px a escritorio).
- `portal/assets/portal.js` — menú móvil y formulario de cita **simulado** (no envía datos).
- `portal/assets/logo.svg` — wordmark propio con huella neutra (también favicon).
- `scripts/build-portal.mjs` copia `portal/` completo a `dist/` (ya incluye `assets/`; sin cambios).

Sin CDN, fuentes remotas, analíticas ni imágenes remotas. Enlaces: `/app/#/tienda` (tienda), `/app/` (Iniciar y Acceso del personal), WhatsApp `https://wa.me/525574212848` con mensaje precargado.

## Datos reales del sitio actual
Nombre, sucursal Valle de Chalco (Blvd Juan Pablo II 370, CP 56615), teléfono +52 55 7421 2848, horario 8:00–21:00 todos los días, áreas cubiertas, categorías de producto.

## Falta confirmar con el cliente
- Dirección, teléfono y horario de cada una de las 7 sucursales (hoy «por confirmar»; nombres de la demo) y el horario real de Valle de Chalco.
- Correo de contacto (el del sitio actual no se publicó).
- Logo y nombre definitivos (Pie Clinic vs Pie Firme).
- Aviso de privacidad (marcador «por redactar con el cliente»).
- Certificaciones de podólogos, formas de pago y entrega de la tienda.
- Testimonios reales con permiso (los 3 actuales son ejemplos de demostración).
- Dominio, y conectar el envío real del formulario de cita.
