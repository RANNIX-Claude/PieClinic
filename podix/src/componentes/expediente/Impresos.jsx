// Hojas A4 «fieles al papel» (porte de Pie Firme: componentes/Impresos.jsx): consentimiento, antecedentes personales y
// seguimiento clínico. Se alimentan con datosImpreso() (o null = formato en blanco). Impresión: @media print + window.print().
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapaPieImpreso } from "./MapaPie.jsx";
import {
  patologicosImpreso, noPatologicosImpreso, PARENTESCOS, exploracionImpresa, diagnosticoImpreso, resumenAntecedentesTexto, paginarVisitas, piePagina,
  fechaPapel, nombreCompleto, ultimaGlucosa, sustituirVariables, variablesConsentimiento, calcularEdad, ESTADOS_CIVILES, etiquetaDe,
} from "../../store/reglas_expediente.js";

const Cas = ({ on }) => <span className="cas">{on ? "✕" : ""}</span>;
const Opc = ({ on, children }) => <span className="opc"><Cas on={on} />{children}</span>;
const U = ({ children, ancho }) => <u style={ancho ? { minWidth: ancho } : undefined}>{children || " "}</u>;
const domicilio = (p) => { const s = String(p?.domicilio || ""); const m = /^(.*?)(?:,\s*Col\.\s*(.*))?$/.exec(s); return { calle: m?.[1] || "", colonia: p?.colonia || m?.[2] || "" }; };

function Encabezado({ doc, titulo }) {
  return (
    <>
      <div className="enc">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#5A4080" /><path d="M14 30c-2-6 0-12 3-16 2-3 6-4 8-1 2 4-1 7-2 10-1 4 0 7-3 8-2 1-5 1-6-1z" fill="#fff" /></svg>
        <div style={{ flex: 1 }}><b>{doc?.clinica || "Pie Clinic"}</b><div className="sub">{doc?.sucursal ? `Sucursal ${doc.sucursal.nombre}` : ""}</div></div>
      </div>
      <h2>{titulo}</h2>
    </>
  );
}
function Pie({ doc, impresoPor, hoy }) {
  const p = doc?.paciente;
  return (
    <div className="pie">
      <span>{piePagina({ expediente: p?.folioManual || p?.folio, fecha: hoy, impresoPor, version: doc?.version, esCopia: doc?.esCopia, enBlanco: !doc?.paciente })}</span>
      <span>{doc?.folio ? `Doc. ${doc.folio}` : ""}</span>
    </div>
  );
}
const Marca = ({ doc }) => (doc?.esCopia ? <div className="marca-agua">COPIA</div> : null);

/** Consentimiento informado (formato 1). */
export function HojaConsentimiento({ doc, impresoPor, hoy }) {
  const p = doc?.paciente;
  const vars = variablesConsentimiento({ paciente: p, podologo: doc?.podologo, cedula: doc?.cedula, fecha: hoy, clinica: doc?.clinica || "Pie Clinic" });
  const texto = sustituirVariables(doc?.consentimiento?.contenido ?? "", vars);
  const bloques = texto.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const f = doc?.firmaConsentimiento;
  return (
    <div className="papel">
      <Marca doc={doc} />
      <Encabezado doc={doc} titulo="Consentimiento informado para Tratamiento Podológico" />
      {!doc?.consentimiento && <p style={{ color: "#900" }}>No hay una versión activa del consentimiento. Actívala en «Formatos y consentimientos».</p>}
      {!p && <div className="lin">Yo <U ancho={220} /> (nombre del paciente). Padres/tutores en caso de ser menor de edad: <U ancho={200} /></div>}
      {bloques.map((b, i) => {
        const lineas = b.split("\n"), items = lineas.filter((l) => /^[-•*]\s/.test(l));
        if (items.length && items.length === lineas.length) return <ul key={i}>{items.map((l, j) => <li key={j}>{l.replace(/^[-•*]\s/, "")}</li>)}</ul>;
        return <p key={i} style={{ margin: "6px 0", textAlign: "justify" }}>{b}</p>;
      })}
      <div className="firma">
        <div>{f?.imagen ? <img src={f.imagen} alt="Firma del paciente" /> : <div style={{ height: 60 }} />}<hr />Nombre completo y firma del {f?.firmanteTipo === "tutor" ? "padre, madre o tutor" : "paciente"}<br /><b>{f?.nombreFirmante || vars.nombre_paciente}</b><br /><U>{fechaPapel(f?.fecha || hoy)}</U> Fecha</div>
        <div><div style={{ height: 60 }} /><hr />Nombre y firma del podólogo<br /><b>{vars.nombre_podologo}</b>{vars.cedula_podologo && <><br />Cédula {vars.cedula_podologo}</>}<br /><U>{fechaPapel(hoy)}</U> Fecha</div>
      </div>
      {doc?.consentimiento && <div className="sub" style={{ marginTop: 8 }}>Versión {doc.consentimiento.version} de la plantilla · texto pendiente de validación legal (N-06).</div>}
      <Pie doc={doc} impresoPor={impresoPor} hoy={hoy} />
    </div>
  );
}

/** Antecedentes personales (formato 2). */
export function HojaAntecedentes({ doc, impresoPor, hoy, sucursales = [] }) {
  const p = doc?.paciente ?? {}, a = doc?.antecedentes ?? {};
  const dom = domicilio(p);
  const pat = patologicosImpreso(a, doc ? doc.vih : null);
  const edad = calcularEdad(p.nacimiento);
  const exp = exploracionImpresa(doc?.exploracion ?? {});
  const meds = a.medicamentos_texto ?? (doc?.medicamentos ?? []).map((m) => m.nombre_dosis).join("; ");
  return (
    <div className="papel">
      <Marca doc={doc} />
      <Encabezado doc={doc} titulo="Antecedentes personales" />
      <div className="lin">{sucursales.map((s) => <Opc key={s.id} on={doc?.sucursal?.id === s.id}>{s.nombre}</Opc>)}</div>
      <div className="lin">N.º de expediente: <U ancho={140}>{p.folioManual || p.folio}</U> Fecha: <U>{fechaPapel(hoy)}</U> Nombre del paciente: <U ancho={240}>{nombreCompleto(p)}</U></div>
      <div className="lin">Domicilio: Calle <U ancho={180}>{dom.calle}</U> Mz <U /> Lt <U /> Col. <U ancho={120}>{dom.colonia}</U> Estado civil: <U>{p.estadoCivil ? etiquetaDe(ESTADOS_CIVILES, p.estadoCivil) : ""}</U></div>
      <div className="lin">Edad: <U>{edad ?? ""}</U> Sexo: <U>{p.sexo || ""}</U> Ocupación: <U ancho={120}>{p.ocupacion}</U> Lugar de origen: <U ancho={120}>{p.lugarOrigen}</U></div>
      <div className="lin">Teléfono: <U ancho={110} /> Móvil: <U ancho={110}>{p.telefono}</U> Fecha de nacimiento: <U>{fechaPapel(p.nacimiento)}</U> Email: <U ancho={170}>{p.correo}</U></div>

      <h4>Antecedentes personales patológicos: «Tiene alguna enfermedad como:»</h4>
      <table><tbody>
        {pat.map((f) => (
          <tr key={f.clave}><td style={{ width: "24%" }}>{f.etiqueta}</td>
            <td style={{ width: "34%" }}>{f.restringido ? <span className="restr">dato restringido (N-04)</span> : <><Opc on={f.si}>SÍ</Opc><Opc on={f.no}>NO</Opc>{f.noSabe && <Opc on>No sabe</Opc>}</>}</td>
            <td>{f.clave === "alergicos" ? "¿A qué? " : f.clave === "otras" || f.clave === "traumaticos" ? "Especifique: " : ""}{f.detalle}</td></tr>
        ))}
        <tr><td>Toma algún medicamento</td><td><Opc on={a.toma_medicamentos === "si"}>SÍ</Opc><Opc on={a.toma_medicamentos === "no"}>NO</Opc></td><td>¿Cuál? {meds}</td></tr>
      </tbody></table>
      <div className="lin" style={{ marginTop: 6 }}>¿Cuándo fue la última vez que se tomó la glucosa? <U ancho={240}>{ultimaGlucosa(a)}</U></div>

      <h4>Antecedentes heredo-familiares: «Padece alguna enfermedad su:»</h4>
      <div className="lin">{PARENTESCOS.map(([k, e]) => <span key={k}>{e}: <U ancho={90}>{a[k]}</U></span>)}</div>

      <h4>Antecedentes personales no patológicos:</h4>
      <div className="lin">{noPatologicosImpreso(a).map((f) => <span key={f.clave}>{f.etiqueta} <Opc on={f.si}>SÍ</Opc><Opc on={f.no}>NO</Opc></span>)}</div>
      <div className="lin">Tipo de calzado: <U ancho={140}>{a.tipo_calzado}</U> N.º de calzado: <U>{a.numero_calzado ?? p.tallaCalzado ?? ""}</U> ¿Practica algún deporte? <Opc on={a.deporte === "si"}>SÍ</Opc><Opc on={a.deporte === "no"}>NO</Opc> ¿Cuál? <U ancho={120}>{a.deporte_detalle}</U></div>
      <div className="lin">¿Cuál es el motivo de su consulta? <U ancho={420}>{a.motivo_consulta_inicial}</U></div>
      <div className="lin">Síntomas: <U ancho={500}>{a.sintomas_iniciales}</U></div>

      <h4>Exploración física:</h4>
      <table><thead><tr><th>Silueta</th><th style={{ width: 70 }}>Pierna D</th><th style={{ width: 70 }}>Pierna I</th></tr></thead>
        <tbody>{exp.map((e) => <tr key={e.clave}><td>{e.etiqueta}</td><td style={{ textAlign: "center" }}>{e.D ? "●" : "○"}</td><td style={{ textAlign: "center" }}>{e.I ? "●" : "○"}</td></tr>)}</tbody></table>
      <Pie doc={doc} impresoPor={impresoPor} hoy={hoy} />
    </div>
  );
}

/** Seguimiento clínico (formato 3): una página por cada 10 visitas, con renglones en blanco. */
export function HojasSeguimiento({ doc, impresoPor, hoy }) {
  const p = doc?.paciente ?? {};
  const dx = diagnosticoImpreso(doc?.diagnosticos ?? []);
  const paginas = paginarVisitas(doc?.visitas ?? []);
  const antecedentes = resumenAntecedentesTexto(doc?.antecedentes ?? {}, doc?.alergias ?? []);
  return paginas.map((filas, i) => (
    <div className="papel" key={i}>
      <Marca doc={doc} />
      <Encabezado doc={doc} titulo="Seguimiento clínico" />
      {i === 0 && (
        <>
          <div className="lin">NOMBRE: <U ancho={260}>{nombreCompleto(p)}</U> EDAD: <U>{calcularEdad(p.nacimiento) ?? ""}</U></div>
          <div className="lin">ANTECEDENTES: <U ancho={520}>{antecedentes}</U></div>
          <h4>Diagnóstico: <span style={{ textTransform: "none", fontWeight: 400 }}>(marcar diagnóstico inicial y señalar sobre la imagen dónde está el problema)</span></h4>
          <div className="lin">{dx.casillas.map((c) => <Opc key={c.clave} on={c.marcada}>{c.etiqueta}{c.clave === "otros" && dx.otros ? `: ${dx.otros}` : ""}</Opc>)}</div>
          <MapaPieImpreso hallazgos={doc?.hallazgos ?? []} />
          <div className="lin">TRATAMIENTO: (lo que adquirió) <U ancho={460}>{doc?.tratamiento}</U></div>
        </>
      )}
      <table style={{ marginTop: 8 }}>
        <thead><tr><th style={{ width: 70 }}>Fecha</th><th style={{ width: 100 }}>Atendió</th><th style={{ width: 130 }}>Servicio</th><th>Observaciones</th><th style={{ width: 78 }}>Próx. visita</th></tr></thead>
        <tbody>{filas.map((f, j) => <tr key={j}><td>{f.fecha}</td><td>{f.atendio}</td><td>{f.servicio}</td><td>{f.observaciones}</td><td>{f.proxima}</td></tr>)}</tbody>
      </table>
      <Pie doc={doc} impresoPor={impresoPor} hoy={hoy} />
    </div>
  ));
}

/** Monta las hojas en un nodo aparte (.exp-print) para que window.print() saque SOLO el papel. */
export function PapelPortal({ children }) {
  const [nodo, setNodo] = useState(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "exp-print";
    document.body.appendChild(el); setNodo(el);
    return () => el.remove();
  }, []);
  return nodo ? createPortal(children, nodo) : null;
}
/** Imprime: marca el body para que @media print oculte todo menos .exp-print. */
export function imprimirPapel() {
  document.body.classList.add("exp-imprimiendo");
  const quitar = () => { document.body.classList.remove("exp-imprimiendo"); removeEventListener("afterprint", quitar); };
  addEventListener("afterprint", quitar);
  setTimeout(() => { window.print(); setTimeout(quitar, 1000); }, 50);
}
