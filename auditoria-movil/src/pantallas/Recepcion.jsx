// RECEPCIÓN (F5.1): contenedor. El flujo «recepción con responsiva» (escanear cada pieza, verificar contenido o sello, confirmar con usuario y PIN)
// lo construye la Etapa 7 y se conecta en ../recepcionFlujo.js. Hasta entonces NO se simula nada: estado vacío honesto.
import FlujoRecepcion from '../recepcionFlujo'
import { cola, sincronizarAhora } from '../envio'

export default function Recepcion({ ctx, enLinea }) {
  if (!FlujoRecepcion) {
    return (
      <div>
        <h2>Recepción</h2>
        <div className="card" data-testid="recepcion-vacia">
          <h3>Aún no está disponible</h3>
          <p>Aquí vas a registrar la mercancía que llega: escanear cada pieza, verificar el contenido o el sello y confirmar con tu usuario y PIN. Desde ese momento la pieza queda bajo tu responsabilidad.</p>
          <p className="hint">Esta función se activa con la siguiente entrega del módulo (custodia y recepción). Mientras tanto, la recepción se sigue avisando como hasta hoy.</p>
        </div>
      </div>
    )
  }
  return <FlujoRecepcion usuario={ctx.usuario} sucursal={ctx.sucursal} enLinea={enLinea} encolar={(tipo, datos, o) => cola.encolar(tipo, datos, { usuario: ctx.usuario.id, ...o })} sincronizar={() => sincronizarAhora({ usuario: ctx.usuario.id })} volver={() => {}} />
}
