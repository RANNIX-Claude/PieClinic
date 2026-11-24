// Asistente inteligente: chat en español sobre el negocio con datos reales. Solo gerente, administración y dirección.
// Motor de reglas determinista (acciones_comercial_asistente.js); las acciones se proponen y requieren confirmación explícita.
import { useEffect, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as AS from "../../store/acciones_comercial_asistente.js";
import { Badge, Button, Icon, Vacio, BarraAccion, aviso } from "../../ui/index.jsx";
import { hora, fechaCorta } from "../../lib/format.js";
import "../../estilos_comercial.css";

const EJEMPLOS_ACCION = ["Solicita un traspaso de 5 bastones a la sucursal Norte", "Recuerda el pago a los pacientes con atraso"];

export default function AsistenteIA() {
  const { d, u } = useSesion();
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const fin = useRef(null);
  const historial = AS.historialAsistente(d, u.id);
  useEffect(() => { fin.current && fin.current.scrollIntoView({ behavior: "smooth", block: "end" }); }, [historial.length, historial.map((h) => h.acciones.map((a) => a.estado).join()).join()]);
  if (!AS.ROLES_ASISTENTE.includes(u.rol)) return <Vacio icon="lock">El asistente está disponible para gerentes, administración y dirección.</Vacio>;

  const alcance = u.rol === "gerente" ? `Tu alcance: ${u.sucursales.map((s) => d.sucursales.find((x) => x.id === s)?.nombre).join(", ")}.` : "Tu alcance: todas las sucursales.";
  const sugeridas = (u.rol === "gerente" ? AS.SUGERENCIAS.gerente : AS.SUGERENCIAS.admin);
  const preguntar = (t) => {
    const p = (t ?? texto).trim();
    if (!p || cargando) return;
    setCargando(true); setTexto("");
    // INTEGRACIÓN: aquí, si hay llave de servicio, se consultaría primero responderConModelo(); en demo responde el motor de reglas.
    mutar((s) => AS.consultarAsistente(s, p));
    setCargando(false);
  };
  const ejecutar = (a) => { const r = mutar((s) => AS.ejecutarAccionAsistente(s, a.id)); aviso(r.ok ? "Acción ejecutada y registrada en la bitácora" : r.error, r.ok ? "ok" : "bad"); };
  const descartar = (a) => { mutar((s) => AS.descartarAccionAsistente(s, a.id)); aviso("Acción descartada", "warn"); };

  return (
    <>
      <div className="cm-aviso"><Icon name="sparkle" size={16} /><span><b>{AS.AVISO_ASISTENTE}</b> Responde con cifras reales del sistema y te dice cómo las calculó; si no entiende o falta un dato, lo dice. {alcance}</span></div>
      <div className="cm-chat">
        {!historial.length && (
          <div className="cm-burbuja cm-ia">
            <h4>Asistente</h4>
            <div>Hola, {u.nombre.replace(/ \(.*\)/, "").split(" ")[0]}. Pregúntame por ventas, caja, cartera, inventario, citas, bonos o utilidad. Por ejemplo:</div>
            <div className="cm-sug">{sugeridas.slice(0, 6).map((s) => <button key={s} onClick={() => preguntar(s)}>{s}</button>)}</div>
            <div className="mu peq">También puedo proponer acciones, que solo se ejecutan si las confirmas:</div>
            <div className="cm-sug">{EJEMPLOS_ACCION.map((s) => <button key={s} onClick={() => preguntar(s)}>{s}</button>)}</div>
          </div>
        )}
        {historial.map((h) => <Intercambio key={h.id} h={h} onPregunta={preguntar} onEjecutar={ejecutar} onDescartar={descartar} />)}
        <div ref={fin} />
      </div>
      {historial.length > 0 && <div className="cm-sug">{sugeridas.slice(0, 4).map((s) => <button key={s} onClick={() => preguntar(s)}>{s}</button>)}</div>}
      <BarraAccion>
        <form className="cm-comp" onSubmit={(e) => { e.preventDefault(); preguntar(); }}>
          <input className="inp" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta o una acción…" aria-label="Pregunta al asistente" enterKeyHint="send" />
          <Button type="submit" icon="send" disabled={!texto.trim() || cargando}>Enviar</Button>
        </form>
      </BarraAccion>
    </>
  );
}

function Intercambio({ h, onPregunta, onEjecutar, onDescartar }) {
  const r = h.respuesta;
  const tono = r.tipo === "sin_permiso" ? "bad" : r.tipo === "sin_dato" || r.tipo === "no_entendi" ? "warn" : r.tipo === "propuesta" ? "info" : "ok";
  return (
    <>
      <div className="cm-burbuja cm-yo">{h.pregunta}<div style={{ fontSize: 11, opacity: .75, marginTop: 2 }}>{fechaCorta(h.ts)} {hora(h.ts)}</div></div>
      <div className="cm-burbuja cm-ia">
        <h4>{r.titulo} {r.tipo !== "respuesta" && <Badge tono={tono}>{{ sin_permiso: "Sin permiso", sin_dato: "Falta el dato", no_entendi: "No entendí", propuesta: "Por confirmar" }[r.tipo]}</Badge>}</h4>
        {r.cifra && <div className="cm-cifra"><small>{r.cifra.etiqueta}</small>{r.cifra.valor}</div>}
        <div>{r.texto}</div>
        {r.tabla && (
          <div className="cm-tbl" style={{ "--cols": r.tabla.cols.length }}>
            <div className="cm-tbl-f cab">{r.tabla.cols.map((c) => <span key={c}>{c}</span>)}</div>
            {r.tabla.filas.map((f, i) => <div key={i} className="cm-tbl-f">{f.map((c, k) => <span key={k}>{c}</span>)}</div>)}
          </div>
        )}
        {r.supuestos.map((s, i) => <div key={i} className="cm-sup">{s}</div>)}
        {r.como.length > 0 && <details className="cm-como"><summary>Cómo lo calculé</summary><ul>{r.como.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
        {h.acciones.map((a) => (
          <div key={a.id} className="cm-acc">
            <div><b>{a.resumen}</b></div>
            {a.estado === "propuesta" && <div className="dos"><Button icon="check" onClick={() => onEjecutar(a)}>Confirmar y ejecutar</Button><Button variante="sec" onClick={() => onDescartar(a)}>Descartar</Button></div>}
            {a.estado === "ejecutada" && <Badge tono="ok">Ejecutada{a.resultado && a.resultado.folio ? ` · ${a.resultado.folio}` : a.resultado && a.resultado.registrados ? ` · ${a.resultado.registrados} registrados` : ""}</Badge>}
            {a.estado === "descartada" && <Badge tono="neutral">Descartada</Badge>}
          </div>
        ))}
        {r.sugerencias && r.sugerencias.length > 0 && <div className="cm-sug">{r.sugerencias.map((s) => <button key={s} onClick={() => onPregunta(s)}>{s}</button>)}</div>}
      </div>
    </>
  );
}
