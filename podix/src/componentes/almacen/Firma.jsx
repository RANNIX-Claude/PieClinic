// Firma en pantalla (canvas, táctil o ratón). onChange(dataURL | null).
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/index.jsx";

export default function Firma({ onChange, alto = 150 }) {
  const ref = useRef(null);
  const dibujando = useRef(false);
  const [hay, setHay] = useState(false);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr; c.height = alto * dpr;
    const x = c.getContext("2d"); x.scale(dpr, dpr);
    x.lineWidth = 2.2; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#1f2330";
  }, [alto]);

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ini = (e) => { dibujando.current = true; ref.current.setPointerCapture?.(e.pointerId); const x = ref.current.getContext("2d"); const [a, b] = pos(e); x.beginPath(); x.moveTo(a, b); x.lineTo(a + 0.1, b + 0.1); x.stroke(); };
  const mov = (e) => { if (!dibujando.current) return; const x = ref.current.getContext("2d"); const [a, b] = pos(e); x.lineTo(a, b); x.stroke(); };
  const fin = () => { if (!dibujando.current) return; dibujando.current = false; setHay(true); onChange?.(ref.current.toDataURL("image/png")); };
  const borrar = () => {
    const c = ref.current; const x = c.getContext("2d");
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore();
    setHay(false); onChange?.(null);
  };
  return (
    <div className="form">
      <canvas ref={ref} onPointerDown={ini} onPointerMove={mov} onPointerUp={fin} onPointerCancel={fin} onPointerLeave={fin}
        style={{ width: "100%", height: alto, border: "1px dashed var(--mu)", borderRadius: 12, background: "#fff", touchAction: "none", display: "block" }} aria-label="Firma de recibido" />
      <div className="fila-flex"><span className="mu peq" style={{ flex: 1 }}>{hay ? "Firma capturada" : "Firma con el dedo dentro del recuadro"}</span><Button variante="ghost" className="btn-peq" onClick={borrar}>Borrar</Button></div>
    </div>
  );
}
