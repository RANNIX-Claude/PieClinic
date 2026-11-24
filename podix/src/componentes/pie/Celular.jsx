// Celular dibujado con la conversación de WhatsApp SIMULADA de Pie Clinic (d.whatsapp). Se actualiza en vivo y funciona sin internet.
import { useEffect, useRef } from "react";
import { useSesion } from "../../shell/sesion.js";
import { useOnline, mutar } from "../../store/core.js";
import { WA_REAL, leerEventos } from "../../datos/whatsapp_real.js";
import { confirmarRecepcion } from "../../store/acciones_pie_clinic.js";
import "../../estilos_pie.css";

const clase = (t) => (t === "falta" ? "falta" : t === "minimo" ? "alerta" : "");

export default function Celular({ titulo = "Pie Clinic · Avisos", vacio = "Aquí aparecerán los avisos de WhatsApp." }) {
  const { d } = useSesion();
  const msgs = d.whatsapp || [];
  const fin = useRef(null);
  const online = useOnline();
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  // WhatsApp real (opcional): las respuestas «Recibido» / «faltaron N» que llegan por el webhook actualizan el inventario igual que el botón de la pantalla.
  useEffect(() => {
    if (!WA_REAL) return undefined;
    const t = setInterval(async () => {
      for (const e of await leerEventos()) if (e.accion === "recibido") mutar((x) => confirmarRecepcion(x, e.traspasoId, e.faltantes || 0));
    }, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pc-cel" aria-label="Celular con mensajes de WhatsApp simulados">
      <div className="pc-cel-top"><span style={{ fontSize: 20 }}>💬</span> {titulo}</div>
      <div className="pc-cel-msgs">
        {!msgs.length && <div className="mu peq" style={{ textAlign: "center", marginTop: 40 }}>{vacio}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`pc-burbuja ${clase(m.tipo)}`}>{m.texto}<small>{m.hora} ✓✓</small></div>
        ))}
        <div ref={fin} />
      </div>
      <div className="pc-cel-sin">{online ? "Simulación de WhatsApp · no se envía nada real" : "Sin internet · la simulación sigue funcionando"}</div>
    </div>
  );
}
