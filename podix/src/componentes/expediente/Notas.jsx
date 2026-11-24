// Consultas y notas del expediente (P-001, P-004): nota firmada INMUTABLE con adendas (autor y hora); «firma pendiente»
// editable solo por su autor antes de firmar; excepción de aviso por Administración. Recepción/Gerencia: sin contenido clínico.
import { useState } from "react";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { Badge, Button, Field, Area, Fila, Sheet, Vacio, Chips, aviso } from "../../ui/index.jsx";
import { fechaLarga, hora } from "../../lib/format.js";
import { Aviso, FirmaSheet } from "./comunes.jsx";

const nombre = (d, id) => d.usuarios.find((x) => x.id === id)?.nombre ?? "—";
const suc = (d, id) => d.sucursales.find((x) => x.id === id)?.nombre ?? id;
const servicios = (d, co) => (co.servicios || []).map((s) => d.servicios.find((x) => x.id === s.servicioId)?.nombre).filter(Boolean).join(", ");

export default function PanelNotas({ d, u, p, clinico }) {
  const [sel, setSel] = useState(null);
  const [filtro, setFiltro] = useState("todas");
  const lista = A.consultasVisibles(d, u, p.id).filter((c) => filtro === "todas" || (filtro === "pendientes" ? A.estadoNota(c) === "firma_pendiente" : A.estadoNota(c) === filtro));
  const co = sel ? d.consultas.find((c) => c.id === sel) : null;
  return (
    <div>
      {!clinico && <Aviso>Vista de datos: las notas clínicas, diagnósticos y exploraciones solo los ve Podología y Administración.</Aviso>}
      {clinico && <Chips opciones={[{ v: "todas", l: "Todas" }, { v: "firmada", l: "Firmadas" }, { v: "pendientes", l: "Firma pendiente" }, { v: "borrador", l: "En curso" }]} valor={filtro} onChange={setFiltro} scroll />}
      <div className="lista">
        {!lista.length && <Vacio icon="file">Sin consultas.</Vacio>}
        {lista.map((c) => {
          const est = c.restringida ? (c.firmada ? "firmada" : c.estado === "abierta" ? "borrador" : "firma_pendiente") : A.estadoNota(c);
          return (
            <Fila key={c.id} titulo={`${fechaLarga(c.fecha)} · ${hora(c.fecha)}`} sub={`${nombre(d, c.podologoId)} · ${suc(d, c.sucursalId)}`}
              datos={c.restringida ? servicios(d, c) : `${c.diagnostico || "Sin diagnóstico"}${c.adendas?.length ? ` · ${c.adendas.length} adenda(s)` : ""}`}
              badge={<Badge tono={A.TONO_NOTA[est]}>{A.ETIQUETA_NOTA[est]}</Badge>} onClick={clinico ? () => setSel(c.id) : undefined} />
          );
        })}
      </div>
      {co && <DetalleNota d={d} u={u} co={co} onClose={() => setSel(null)} />}
    </div>
  );
}

function DetalleNota({ d, u, co, onClose }) {
  const est = A.estadoNota(co);
  const autor = A.esAutorDeLaNota(u, co) && u.rol === "podologo";
  const [ed, setEd] = useState({ diagnostico: co.diagnostico || "", nota: co.nota || "", indicaciones: co.indicaciones || "" });
  const [adenda, setAdenda] = useState("");
  const [firmar, setFirmar] = useState(false);
  const [excepcion, setExcepcion] = useState("");
  const pac = d.pacientes.find((x) => x.id === co.pacienteId);
  const motivos = est === "firma_pendiente" ? A.motivosBloqueoFirma({ consulta: { ...co, ...ed }, usuario: u, paciente: pac, cedula: A.cedulaDe(d, u.id), firmaVacia: false }) : [];
  const run = (fn, ok) => { const r = mutar((x) => fn(x)); if (r.ok) { aviso(ok, "ok"); return true; } aviso(r.error, "bad"); return false; };
  const ex = co.exploracion || {};
  return (
    <Sheet abierto onClose={onClose} titulo={`Nota del ${fechaLarga(co.fecha)}`}>
      <div className="exp-nota-cab">
        <Badge tono={A.TONO_NOTA[est]}>{A.ETIQUETA_NOTA[est]}</Badge>
        <span className="mu peq">{nombre(d, co.podologoId)} · {suc(d, co.sucursalId)} · {servicios(d, co)}</span>
      </div>
      {est === "firmada" ? (
        <>
          <div className="exp-nota-sellada" aria-label="Nota firmada (solo lectura)">
            <div className="exp-candado">🔒 Firmada el {fechaLarga(co.firma.fecha)} {hora(co.firma.fecha)} por {nombre(d, co.firma.porId)} · Cédula {co.firma.cedula || "—"}</div>
            <p><b>Diagnóstico:</b> {co.diagnostico}</p>
            <p><b>Nota de evolución:</b> {co.nota}</p>
            <p><b>Indicaciones:</b> {co.indicaciones}</p>
            <p className="mu peq">Huella del texto firmado: <code>{co.firma.huella}</code> · {A.notaIntegra(co) ? <Badge tono="ok">Íntegra</Badge> : <Badge tono="bad">El texto no coincide con lo firmado</Badge>}</p>
            {co.firma.imagen && <img src={co.firma.imagen} alt="Firma del podólogo" className="exp-firma-img" />}
          </div>
          <h4 className="exp-h4">Adendas ({co.adendas?.length || 0})</h4>
          {(co.adendas || []).map((a) => (
            <div key={a.id} className="exp-adenda"><div className="mu peq">{fechaLarga(a.fecha)} · {hora(a.fecha)} · {a.autor}</div><div>{a.texto}</div></div>
          ))}
          {A.puedeAgregarAdenda(u, co) ? (
            <>
              <Field label="Nueva adenda (nota aclaratoria)" hint="La nota original no cambia; la adenda queda con tu nombre, fecha y hora (P-001).">
                <Area value={adenda} onChange={(e) => setAdenda(e.target.value)} rows={3} />
              </Field>
              <Button block icon="plus" disabled={adenda.trim().length < 5} onClick={() => run((x) => A.agregarAdendaNota(x, co.id, adenda, u), "Adenda agregada") && setAdenda("")}>Agregar adenda</Button>
            </>
          ) : <p className="mu peq">Solo el podólogo autor agrega adendas a esta nota.</p>}
        </>
      ) : est === "firma_pendiente" ? (
        <>
          <Aviso tono="warn">Consulta cerrada sin firma. {autor ? "Puedes corregirla antes de firmar; una vez firmada queda bloqueada." : "Solo su autor puede corregirla y firmarla."}</Aviso>
          <Field label="Diagnóstico"><Area rows={2} value={ed.diagnostico} disabled={!autor} onChange={(e) => setEd({ ...ed, diagnostico: e.target.value })} /></Field>
          <Field label="Nota de evolución"><Area rows={4} value={ed.nota} disabled={!autor} onChange={(e) => setEd({ ...ed, nota: e.target.value })} /></Field>
          <Field label="Indicaciones"><Area rows={2} value={ed.indicaciones} disabled={!autor} onChange={(e) => setEd({ ...ed, indicaciones: e.target.value })} /></Field>
          {autor && <div className="dos">
            <Button variante="sec" block onClick={() => run((x) => A.editarNota(x, co.id, ed, u), "Nota guardada")}>Guardar cambios</Button>
            <Button block icon="lock" disabled={motivos.length > 0} onClick={() => { if (run((x) => A.editarNota(x, co.id, ed, u), "Cambios guardados")) setFirmar(true); }}>Firmar nota</Button>
          </div>}
          {motivos.length > 0 && <ul className="exp-motivos">{motivos.map((m) => <li key={m}>{m}</li>)}</ul>}
          {co.excepcionAviso && <Aviso>Excepción de aviso autorizada por {nombre(d, co.excepcionAviso.porId)}: {co.excepcionAviso.motivo}</Aviso>}
          {A.esAdministracion(u) && A.requiereExcepcionAviso(pac, co) && (
            <>
              <Field label="Autorizar excepción de aviso de privacidad (P-004)" hint="Queda en bitácora. Mínimo 10 caracteres."><Area rows={2} value={excepcion} onChange={(e) => setExcepcion(e.target.value)} /></Field>
              <Button variante="sec" block onClick={() => run((x) => A.autorizarExcepcionAviso(x, co.id, excepcion, u), "Excepción autorizada")}>Autorizar excepción</Button>
            </>
          )}
          <FirmaSheet abierto={firmar} onClose={() => setFirmar(false)} titulo="Firmar nota clínica" texto="Al firmar, la nota queda bloqueada: después solo se podrán agregar adendas."
            onFirmar={(img) => { if (run((x) => A.firmarNota(x, co.id, u, { firma: img }), "Nota firmada y bloqueada")) setFirmar(false); }} />
        </>
      ) : (
        <Aviso>Consulta en curso: se edita en la pantalla «Consulta» del podólogo y se firma al cerrarla.</Aviso>
      )}
      {(ex.peso || ex.presion) && <p className="mu peq" style={{ marginTop: 10 }}>Exploración: peso {ex.peso ?? "—"} kg · talla {ex.talla ?? "—"} · TA {ex.presion ?? "—"}{ex.glucosa ? ` · glucosa ${ex.glucosa}` : ""} · {ex.monofilamento ?? ""} · pulsos {ex.pulsos ?? "—"}</p>}
    </Sheet>
  );
}
