// PUNTO DE ENGANCHE de la Etapa 7 (F5.1 «Recepción con responsiva»).
// La Etapa 7 sustituye `null` por su componente de React. Contrato del componente (todo lo que recibe, nada más):
//   props = {
//     usuario:   { id, nombre, rolApp, rolAud, organizacionId }     quien recibe (ya validó su PIN al entrar a la app)
//     sucursal:  { id, nombre }
//     enLinea:   boolean                                             navigator.onLine
//     encolar:   (tipo, datos, { id, usuario }) => Promise           cola idempotente de envío (pwaCola); `id` lo genera el dispositivo
//     sincronizar: () => Promise                                     pide enviar ya lo pendiente
//     volver:    () => void
//   }
// Reglas que debe respetar: captura a ciegas (sin saldo ni diferencia), foto SOLO en vivo (CamaraVivo.jsx; sin galería), hora del servidor,
// y el PIN de «responsiva» lo valida el servidor (no en el teléfono). Mientras valga `null` la pantalla muestra un estado vacío honesto.
export default null
