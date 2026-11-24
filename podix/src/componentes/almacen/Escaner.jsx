// Escáner simulado: captura de código (SKU) o lectura aleatoria. En producción se cambia por la cámara/lector.
//   <Escaner abierto onClose productos={[…]} onCodigo={(producto) => …} continuo />
import { useState } from "react";
import { normaliza } from "../../lib/format.js";
import { Button, Field, Icon, Input, Sheet, aviso } from "../../ui/index.jsx";

export default function Escaner({ abierto, onClose, productos, onCodigo, continuo = false, titulo = "Escanear" }) {
  const [codigo, setCodigo] = useState("");
  const [ult, setUlt] = useState(null);
  const leer = (p) => { onCodigo(p); setUlt(p); setCodigo(""); if (!continuo) onClose(); };
  const buscar = () => {
    const n = normaliza(codigo).trim();
    if (!n) return;
    const p = productos.find((x) => normaliza(x.sku) === n || normaliza(x.id) === n);
    if (!p) return aviso("Código no encontrado en esta lista.", "warn");
    leer(p);
  };
  const simular = () => { if (productos.length) leer(productos[Math.floor(Math.random() * productos.length)]); };
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={titulo}
      pie={<div className="form"><Button block icon="scan" onClick={simular}>Simular lectura</Button>{continuo && <Button variante="sec" block onClick={onClose}>Terminar escaneo</Button>}</div>}>
      <div style={{ border: "2px dashed var(--p)", borderRadius: 14, minHeight: 110, display: "grid", placeItems: "center", color: "var(--p)", textAlign: "center", padding: 12 }}>
        <div><Icon name="scan" size={36} /><div className="peq mu">Apunta la cámara al código de barras</div></div>
      </div>
      <Field label="O escribe el código (SKU)">
        <div className="fila-flex">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej. BAS-001" autoCapitalize="characters" onKeyDown={(e) => e.key === "Enter" && buscar()} />
          <Button variante="ghost" onClick={buscar}>Leer</Button>
        </div>
      </Field>
      {ult && <div className="fila"><Icon name="check" /><div className="fila-c"><div className="fila-t"><span>{ult.nombre}</span></div><div className="fila-s">{ult.sku}</div></div></div>}
    </Sheet>
  );
}
