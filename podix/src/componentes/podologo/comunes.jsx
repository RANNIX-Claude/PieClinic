// Piezas compartidas de las pantallas del podólogo.
import { useEffect, useRef, useState } from "react";
import { mutar } from "../../store/core.js";
import { alertasClinicas, asegurarPlanesDemo, registrarAccesoExpediente, MAX_FOTOS } from "../../store/acciones_podologo.js";
import { Badge, Card, Icon, Vacio } from "../../ui/index.jsx";
import { fechaCorta, dia } from "../../lib/format.js";
import * as R from "../../store/reglas.js";

/** Crea los planes de tratamiento de demostración la primera vez. */
export function useAsegurarPlanes(d) {
  useEffect(() => { if (!d.planesTratamiento) mutar((x) => { asegurarPlanesDemo(x); }); }, [d.planesTratamiento]);
}

/** Bitácora de accesos: una vez por paciente por vida de la pantalla. */
export function useAccesoExpediente(pacienteId, detalle = "") {
  const vistos = useRef(new Set());
  useEffect(() => {
    if (!pacienteId || vistos.current.has(pacienteId)) return;
    vistos.current.add(pacienteId);
    mutar((d) => { registrarAccesoExpediente(d, pacienteId, detalle); });
  }, [pacienteId]); // eslint-disable-line
}

/** Alertas clínicas muy visibles (anticoagulado, alergias, diabetes…). */
export function AlertasClinicas({ paciente }) {
  const al = alertasClinicas(paciente);
  if (!al.length) return <Card tono="ok"><b>Sin alertas clínicas registradas</b></Card>;
  const grave = al.some((a) => a.tono === "bad");
  return (
    <div style={{ background: grave ? "var(--erl)" : "var(--all)", border: `2px solid ${grave ? "var(--er)" : "var(--al)"}`, borderRadius: "var(--r)", padding: 12, display: "grid", gap: 8 }}>
      <div className="fila-flex fuerte" style={{ color: grave ? "#991b1b" : "#92400e" }}><Icon name="alert" /> ALERTAS CLÍNICAS</div>
      {al.map((a, i) => (
        <div key={i}><Badge tono={a.tono}>{a.texto}</Badge>{a.detalle && <div className="peq" style={{ marginTop: 2, color: "var(--tx)" }}>{a.detalle}</div>}</div>
      ))}
    </div>
  );
}

export function Progreso({ pct, tono = "var(--p)" }) {
  return <div style={{ height: 8, background: "var(--bd)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: tono }} /></div>;
}

/** Reduce una foto a ≤ max px y la devuelve como dataURL JPEG. */
export function comprimirImagen(file, max = 900, calidad = 0.72) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

export const TIPOS_FOTO = [{ v: "antes", l: "Antes" }, { v: "durante", l: "Durante" }, { v: "despues", l: "Después" }];

/** Todas las fotos de un paciente (de todas las consultas), con su consulta y sucursal. */
export function fotosDePaciente(d, pacienteId) {
  return d.consultas.filter((c) => c.pacienteId === pacienteId).flatMap((c) => (c.fotos || []).map((f) => ({ ...f, consultaId: c.id, sucursalId: c.sucursalId }))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

const Img = ({ f, titulo }) => (
  <div style={{ minWidth: 0 }}>
    {f ? <img src={f.data} alt={f.descripcion || titulo} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: 10, display: "block", background: "var(--bd)" }} />
      : <div style={{ aspectRatio: "3/4", borderRadius: 10, background: "var(--bd)", display: "grid", placeItems: "center", color: "var(--mu)", fontSize: 12 }}>Sin foto</div>}
    <div className="peq" style={{ marginTop: 4 }}><b>{titulo}</b>{f && <> · {fechaCorta(f.fecha)}</>}</div>
    {f?.descripcion && <div className="peq mu">{f.descripcion}</div>}
  </div>
);

/** Comparativo antes/después lado a lado (la primera "antes" vs la última "después"; si no hay etiquetas, primera vs última). */
export function Comparativo({ fotos }) {
  if (!fotos.length) return <Vacio icon="camera">Sin fotos clínicas todavía.</Vacio>;
  const antes = fotos.find((f) => f.tipo === "antes") || fotos[0];
  const desp = [...fotos].reverse().find((f) => f.tipo === "despues") || (fotos.length > 1 ? fotos[fotos.length - 1] : null);
  return <div className="dos"><Img f={antes} titulo="Antes" /><Img f={desp && desp !== antes ? desp : null} titulo="Después" /></div>;
}

export function Miniaturas({ fotos }) {
  const [ver, setVer] = useState(null);
  if (!fotos?.length) return null;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
        {fotos.map((f) => <img key={f.id} src={f.data} alt={f.descripcion || "foto"} onClick={() => setVer(f)} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} />)}
      </div>
      {ver && <div className="sheet-fondo" onClick={() => setVer(null)}><div style={{ background: "var(--sup)", padding: 10, borderRadius: 14, maxWidth: "92%" }}><img src={ver.data} alt="" style={{ maxWidth: "100%", maxHeight: "70dvh", borderRadius: 10 }} /><div className="peq">{ver.tipo} · {fechaCorta(ver.fecha)} · {ver.descripcion}</div></div></div>}
    </>
  );
}

/** Línea de tiempo de consultas de un paciente (cualquier sucursal). */
export function LineaTiempo({ d, pacienteId }) {
  const cs = d.consultas.filter((c) => c.pacienteId === pacienteId && c.estado !== "abierta").sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!cs.length) return <Vacio icon="file">Sin consultas previas.</Vacio>;
  return (
    <div className="lista">
      {cs.map((c) => (
        <Card key={c.id}>
          <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{fechaCorta(c.fecha)}</b><Badge tono="neutral">{R.nombreSucursal(d, c.sucursalId)}</Badge></div>
          <div className="peq mu">{R.nombreUsuario(d, c.podologoId)} · sesión {c.sesion || "1/1"}</div>
          <div style={{ marginTop: 6 }}><b>{c.diagnostico || "Sin diagnóstico"}</b></div>
          {c.nota && <p className="txt peq" style={{ margin: "4px 0 0" }}>{c.nota}</p>}
          {(c.adendas || []).map((a) => <div key={a.id} className="peq" style={{ marginTop: 6, borderLeft: "3px solid var(--p)", paddingLeft: 8 }}><b>Adenda {fechaCorta(a.fecha)} · {a.autor}</b><br />{a.texto}</div>)}
          {!!(c.fotos || []).length && <div style={{ marginTop: 8 }}><Miniaturas fotos={c.fotos} /></div>}
        </Card>
      ))}
    </div>
  );
}
export { MAX_FOTOS, dia };
