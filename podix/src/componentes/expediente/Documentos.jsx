// Documentos y consentimientos (porte de Pie Firme: DocumentosClinica.jsx + FirmaDialogo.jsx): firma en pantalla con
// evidencia (versión y huella del texto, trazo, quién registró, sucursal, dispositivo), tutor de menores y nueva firma
// a los 18 (P-005), revocación sin borrar (P-009) y plantillas versionadas (N-06, P-139).
import { useState } from "react";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { Badge, Button, Field, Input, Select, Area, Fila, Sheet, Vacio, Chips, aviso } from "../../ui/index.jsx";
import { fechaLarga, hora, hoy } from "../../lib/format.js";
import { Aviso, Seccion, FirmaSheet } from "./comunes.jsx";

const run = (fn, ok) => { const r = mutar((x) => fn(x)); if (r.ok) aviso(ok, "ok"); else aviso(r.error, "bad"); return r; };
const nombre = (d, id) => d.usuarios.find((x) => x.id === id)?.nombre ?? "—";
const TONO = { firmado: "ok", revocado: "bad", sustituido: "neutral" };
const CODIGOS_PACIENTE = ["aviso_privacidad", "consentimiento_datos_salud", "consentimiento_procedimiento_podologico", "autorizacion_fotos_clinicas", "autorizacion_fotos_docencia", "consentimiento_telemedicina", "consentimiento_dictado_ia", "terminos_reserva"];

export default function PanelDocumentos({ d, u, p }) {
  const [firmar, setFirmar] = useState(null);
  const [ver, setVer] = useState(null);
  const refirma = A.firmasPorMayoriaDeEdad(d, p);
  const menor = A.esMenorDeEdad(p.nacimiento);
  const puede = A.puedeFirmarDocumentos(u);
  const firmados = A.firmadosDe(d, p.id);
  return (
    <div>
      {refirma.length > 0 && <Aviso tono="warn">{A.nombreCompleto(p)} ya cumplió 18 años: debe firmar él mismo {refirma.length} documento(s) que firmó su tutor (P-005).</Aviso>}
      <Seccion titulo="Documentos del paciente">
        <div className="lista">
          {CODIGOS_PACIENTE.map((codigo) => {
            const pl = A.plantillaActiva(d, codigo);
            if (!pl) return null;
            const v = A.firmadoVigente(d, p.id, codigo);
            const viejo = v && v.version !== pl.version;
            const re = refirma.includes(codigo);
            return (
              <Fila key={codigo} titulo={pl.nombre} sub={v ? `Firmado ${fechaLarga(v.fecha)} · v${v.version ?? "—"} · ${v.firmanteTipo === "paciente" ? "por el paciente" : `${v.firmanteTipo}: ${v.nombreFirmante}`}` : `Versión vigente v${pl.version}`}
                badge={<Badge tono={re ? "warn" : v ? (viejo ? "warn" : "ok") : "neutral"}>{re ? "Requiere firma propia" : v ? (viejo ? "Versión anterior" : "Vigente") : "Sin firmar"}</Badge>}
                derecha={puede ? <Button variante={v && !re && !viejo ? "ghost" : "primary"} onClick={() => setFirmar(codigo)}>{v ? "Volver a firmar" : "Firmar"}</Button> : null} />
            );
          })}
        </div>
      </Seccion>
      <Seccion titulo={`Historial de firmas (${firmados.length})`}>
        <div className="lista">
          {!firmados.length && <Vacio icon="file">Sin documentos firmados.</Vacio>}
          {firmados.map((x) => <Fila key={x.id} titulo={`${x.folio} · ${x.nombre}`} sub={`${fechaLarga(x.fecha)} ${hora(x.fecha)} · v${x.version ?? "—"} · ${x.canal === "papel_escaneado" ? "papel escaneado" : x.canal === "casilla" ? "casilla" : "firma en pantalla"}`}
            badge={<Badge tono={TONO[x.estado]}>{x.estado}</Badge>} onClick={() => setVer(x.id)} />)}
        </div>
      </Seccion>
      {firmar && <Firmar d={d} u={u} p={p} codigo={firmar} menor={menor} onClose={() => setFirmar(null)} />}
      {ver && <Evidencia d={d} u={u} x={firmados.find((f) => f.id === ver)} onClose={() => setVer(null)} />}
    </div>
  );
}

function Firmar({ d, u, p, codigo, menor, onClose }) {
  const pl = A.plantillaActiva(d, codigo);
  const [tipo, setTipo] = useState(menor ? "tutor" : "paciente");
  const [nom, setNom] = useState(menor ? p.tutor?.nombre || "" : "");
  const [par, setPar] = useState(menor ? p.tutor?.parentesco || "" : "");
  const [motivo, setMotivo] = useState("");
  const [casilla, setCasilla] = useState(false);
  const pod = A.consultasPaciente(d, p.id)[0];
  const podologo = pod ? nombre(d, pod.podologoId) : u.rol === "podologo" ? u.nombre : "";
  const texto = A.sustituirVariables(pl.contenido, { ...A.variablesConsentimiento({ paciente: p, podologo, cedula: pod ? A.cedulaDe(d, pod.podologoId) : "", fecha: hoy(), clinica: "Pie Clinic" }), especialidad: "", motivo: "" });
  const enviar = (imagen) => { const r = run((x) => A.firmarDocumento(x, { pacienteId: p.id, codigo, imagen, casilla, firmanteTipo: tipo, nombreFirmante: tipo === "paciente" ? "" : nom, parentesco: par, motivoRepresentante: motivo }, u), "Documento firmado"); if (r.ok) onClose(); };
  const datosFirmante = (
    <>
      <Chips opciones={menor ? [{ v: "tutor", l: "Firma el tutor" }] : [{ v: "paciente", l: "Firma el paciente" }, { v: "representante", l: "Representante" }]} valor={tipo} onChange={setTipo} />
      {tipo !== "paciente" && <div className="form2">
        <Field label={tipo === "tutor" ? "Nombre del tutor" : "Nombre del representante"}><Input value={nom} onChange={(e) => setNom(e.target.value)} /></Field>
        <Field label="Parentesco"><Input value={par} onChange={(e) => setPar(e.target.value)} /></Field>
      </div>}
      {tipo === "representante" && <Field label="Motivo por el que el paciente no firma (P-005)"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>}
      <p className="mu peq">Versión v{pl.version} · texto pendiente de validación legal (N-06).</p>
    </>
  );
  if (pl.forma !== "firma_pantalla") {
    return (
      <Sheet abierto onClose={onClose} titulo={pl.nombre} pie={<Button block disabled={!casilla && pl.forma === "casilla"} onClick={() => enviar("")}>Registrar aceptación</Button>}>
        <div className="exp-texto-legal">{texto}</div>
        {datosFirmante}
        {pl.forma === "casilla" && <label className="exp-check"><input type="checkbox" checked={casilla} onChange={(e) => setCasilla(e.target.checked)} /> El paciente leyó y acepta</label>}
      </Sheet>
    );
  }
  return <FirmaSheet abierto onClose={onClose} titulo={pl.nombre} texto={texto} onFirmar={enviar}>{datosFirmante}</FirmaSheet>;
}

function Evidencia({ d, u, x, onClose }) {
  const [motivo, setMotivo] = useState("");
  if (!x) return null;
  const pl = (d.exp?.plantillas || []).find((y) => y.codigo === x.codigo && y.version === x.version);
  return (
    <Sheet abierto onClose={onClose} titulo={`${x.folio} · ${x.nombre}`}>
      <div className="resumen">
        {[["Estado", x.estado], ["Fecha y hora", `${fechaLarga(x.fecha)} ${hora(x.fecha)}`], ["Versión aceptada", `v${x.version ?? "—"}`], ["Huella del texto", x.huella || "—"],
          ["Firmante", `${x.nombreFirmante}${x.parentesco ? ` (${x.parentesco})` : ""} · ${x.firmanteTipo}`], x.motivoRepresentante ? ["Motivo de representación", x.motivoRepresentante] : null,
          ["Registró", nombre(d, x.registradoPor)], ["Sucursal", d.sucursales.find((s) => s.id === x.sucursalId)?.nombre ?? "—"], ["Dispositivo / canal", `${x.dispositivo} · ${x.canal}`]].filter(Boolean).map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
      </div>
      {x.imagen ? <img src={x.imagen} alt="Firma" className="exp-firma-img" /> : <p className="mu peq">{x.canal === "papel_escaneado" ? "Formato en papel migrado: el original se resguarda en la sucursal." : "Aceptación sin trazo."}</p>}
      {pl && <details className="exp-det"><summary>Texto aceptado (v{pl.version})</summary><div className="exp-texto-legal">{pl.contenido}</div></details>}
      {x.revocado && <Aviso tono="bad">Revocado el {fechaLarga(x.revocado.fecha)} por {nombre(d, x.revocado.porId)}: {x.revocado.motivo}</Aviso>}
      {x.estado === "firmado" && A.puedeFirmarDocumentos(u) && <>
        <Field label="Motivo de la revocación" hint="No se borra: queda revocado con fecha y autor. Si es la autorización de docencia, sus fotos se ocultan (P-009)."><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
        <Button variante="danger" block onClick={() => { if (run((y) => A.revocarDocumento(y, x.id, motivo, u), "Documento revocado").ok) onClose(); }}>Revocar</Button>
      </>}
    </Sheet>
  );
}

/** Plantillas versionadas (N-06): la activa no se edita; se crea versión nueva, se edita el borrador y se activa. */
export function PanelPlantillas({ d, u }) {
  const [sel, setSel] = useState(null);
  const codigos = [...new Set((d.exp?.plantillas || []).map((p) => p.codigo))];
  const gestiona = A.puedeGestionarPlantillas(u);
  return (
    <div>
      {!gestiona && <Aviso>Solo Administración crea y activa versiones. Aquí puedes consultar los textos vigentes.</Aviso>}
      <div className="exp-plantillas">
        {codigos.map((c) => {
          const vs = A.plantillasDe(d, c), act = vs.find((p) => p.estado === "activa"), bor = vs.find((p) => p.estado === "borrador");
          return (
            <div key={c} className="card exp-pl" onClick={() => setSel(c)} role="button" tabIndex={0}>
              <b>{(act || vs[0]).nombre}</b>
              <div className="exp-pl-b"><Badge tono="ok">Activa v{act?.version ?? "—"}</Badge>{bor && <Badge tono="warn">Borrador v{bor.version}</Badge>}<Badge tono="neutral">{vs.length} versión(es)</Badge></div>
              <span className="mu peq">{act ? `${A.usoPlantilla(d, act)} firma(s) con la versión activa · desde ${act.vigenteDesde ? fechaLarga(act.vigenteDesde) : "—"}` : "Sin versión activa"}</span>
            </div>
          );
        })}
      </div>
      {sel && <Versiones d={d} u={u} codigo={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function Versiones({ d, u, codigo, onClose }) {
  const vs = A.plantillasDe(d, codigo);
  const bor = vs.find((p) => p.estado === "borrador");
  const [txt, setTxt] = useState(bor?.contenido ?? "");
  const [forma, setForma] = useState(bor?.forma ?? vs[0]?.forma);
  const gestiona = A.puedeGestionarPlantillas(u);
  const [abierta, setAbierta] = useState(vs.find((p) => p.estado === "activa")?.id);
  return (
    <Sheet abierto onClose={onClose} titulo={vs[0]?.nombre}>
      {bor && gestiona ? (
        <Seccion titulo={`Borrador v${bor.version}`}>
          <Field label="Texto" hint={`Variables: {{paciente}} {{tutor}} {{podologo}} {{clinica}} {{fecha}} {{horas_cancelacion}}. Detectadas: ${A.variablesDe(txt).join(", ") || "ninguna"}`}><Area rows={10} value={txt} onChange={(e) => setTxt(e.target.value)} /></Field>
          <Field label="Forma de aceptación"><Select value={forma} onChange={(e) => setForma(e.target.value)}>{A.FORMAS_ACEPTACION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <div className="dos">
            <Button variante="sec" block onClick={() => run((x) => A.editarPlantilla(x, bor.id, { contenido: txt, forma }, u), "Borrador guardado")}>Guardar borrador</Button>
            <Button block onClick={() => { const r = run((x) => { const e = A.editarPlantilla(x, bor.id, { contenido: txt, forma }, u); return e.ok ? A.activarPlantilla(x, bor.id, u) : e; }, `Versión ${bor.version} activada`); if (r.ok) onClose(); }}>Activar v{bor.version}</Button>
          </div>
          <Button variante="ghost" block onClick={() => { if (run((x) => A.descartarBorrador(x, bor.id, u), "Borrador descartado").ok) onClose(); }}>Descartar borrador</Button>
        </Seccion>
      ) : gestiona ? (
        <Button block icon="plus" onClick={() => { const r = run((x) => A.nuevaVersionPlantilla(x, codigo, u), "Borrador creado"); if (r.ok) { setTxt(r.plantilla.contenido); setForma(r.plantilla.forma); } }}>Crear versión nueva</Button>
      ) : null}
      <Seccion titulo="Versiones">
        {vs.map((p) => (
          <div key={p.id} className="exp-version">
            <button type="button" className="exp-version-t" onClick={() => setAbierta(abierta === p.id ? null : p.id)}>
              <b>v{p.version}</b> <Badge tono={p.estado === "activa" ? "ok" : p.estado === "borrador" ? "warn" : "neutral"}>{p.estado}</Badge>
              <span className="mu peq">{p.vigenteDesde ? `desde ${fechaLarga(p.vigenteDesde)}` : "sin activar"} · {A.usoPlantilla(d, p)} firma(s) · {A.etiquetaDe(A.FORMAS_ACEPTACION, p.forma)}</span>
            </button>
            {abierta === p.id && <div className="exp-texto-legal">{p.contenido}</div>}
          </div>
        ))}
      </Seccion>
      <p className="mu peq">Una versión activa o archivada nunca se edita; cada firma conserva la versión que aceptó (P-139). Textos pendientes de validación por abogado.</p>
    </Sheet>
  );
}
