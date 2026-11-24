// Firma en canvas (puntero/táctil). onChange(dataURL | null)
import { useEffect, useRef } from "react";
import { Button } from "../../ui/index.jsx";

export default function Firma({ onChange }) {
  const ref = useRef(null), dib = useRef(false), hay = useRef(false);
  const pos = (e) => { const c = ref.current, r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  useEffect(() => { const x = ref.current.getContext("2d"); x.lineWidth = 3; x.lineCap = "round"; x.strokeStyle = "#1f2330"; }, []);
  const ini = (e) => { e.preventDefault(); dib.current = true; const x = ref.current.getContext("2d"), [a, b] = pos(e); x.beginPath(); x.moveTo(a, b); ref.current.setPointerCapture?.(e.pointerId); };
  const mov = (e) => { if (!dib.current) return; const x = ref.current.getContext("2d"), [a, b] = pos(e); x.lineTo(a, b); x.stroke(); hay.current = true; };
  const fin = () => { if (!dib.current) return; dib.current = false; if (hay.current) onChange(ref.current.toDataURL("image/png")); };
  const borrar = () => { const c = ref.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); hay.current = false; onChange(null); };
  return (
    <div className="form">
      <canvas ref={ref} width={600} height={220} onPointerDown={ini} onPointerMove={mov} onPointerUp={fin} onPointerLeave={fin}
        style={{ width: "100%", height: 150, border: "1px dashed var(--bd)", borderRadius: 12, background: "var(--sup)", touchAction: "none" }} aria-label="Área de firma" />
      <Button variante="ghost" icon="undo" onClick={borrar}>Borrar firma</Button>
    </div>
  );
}
