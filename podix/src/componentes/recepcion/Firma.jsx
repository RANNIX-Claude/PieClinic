// Firma táctil en canvas. onChange(dataURL | "") cada vez que cambia el trazo.
import { useEffect, useRef } from "react";
import { Button } from "../../ui/index.jsx";

export default function Firma({ onChange, alto = 160 }) {
  const ref = useRef(null);
  const dib = useRef(false);

  useEffect(() => {
    const cv = ref.current;
    const ajustar = () => {
      const r = cv.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(r.width * k)); cv.height = Math.round(alto * k);
      const c = cv.getContext("2d"); c.scale(k, k); c.lineWidth = 2.2; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#111827";
    };
    ajustar();
  }, [alto]);

  const pos = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ini = (e) => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); dib.current = true; const c = ref.current.getContext("2d"); const [x, y] = pos(e); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y + 0.1); c.stroke(); };
  const mover = (e) => { if (!dib.current) return; e.preventDefault(); const c = ref.current.getContext("2d"); const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); };
  const fin = () => { if (!dib.current) return; dib.current = false; onChange(ref.current.toDataURL("image/png")); };
  const limpiar = () => { const cv = ref.current; cv.getContext("2d").clearRect(0, 0, cv.width, cv.height); onChange(""); };

  return (
    <div>
      <canvas ref={ref} onPointerDown={ini} onPointerMove={mover} onPointerUp={fin} onPointerCancel={fin} aria-label="Área de firma"
        style={{ width: "100%", height: alto, border: "2px dashed var(--bd)", borderRadius: 12, background: "#fff", touchAction: "none", display: "block" }} />
      <div style={{ marginTop: 8 }}><Button variante="ghost" block onClick={limpiar}>Borrar firma</Button></div>
    </div>
  );
}
