// Historia clínica (porte de Pie Firme: HistoriaClinica.jsx + ImprimirHistoria.jsx + ExploracionMI.jsx):
// antecedentes, dato VIH restringido (N-04), alergias y medicamentos, exploración de miembro inferior (N-02),
// mapa del pie, seguimiento e impresos fieles al papel.
import { useEffect, useMemo, useState } from "react";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { Badge, Button, Chips, Field, Input, Select, Area, Fila, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import { fechaLarga, hoy } from "../../lib/format.js";
import MapaPie from "./MapaPie.jsx";
import { HojaConsentimiento, HojaAntecedentes, HojasSeguimiento, PapelPortal, imprimirPapel } from "./Impresos.jsx";
import { Aviso, Seccion } from "./comunes.jsx";

const run = (fn, ok) => { const r = mutar((x) => fn(x)); if (r.ok) aviso(ok, "ok"); else aviso(r.error, "bad"); return r; };
const Tri = ({ label, valor, onChange, detalle, onDetalle, etiquetaDetalle, disabled }) => (
  <div className="exp-tri">
    <span className="exp-tri-l">{label}</span>
    <div className="exp-tri-o">{A.TRI.map(([v, l]) => <button type="button" key={v} disabled={disabled} className={`chip${valor === v ? " on" : ""}`} onClick={() => onChange(valor === v ? null : v)}>{l}</button>)}</div>
    {onDetalle && valor === "si" && <Input placeholder={etiquetaDetalle} value={detalle || ""} disabled={disabled} onChange={(e) => onDetalle(e.target.value)} />}
  </div>
);

export default function PanelHistoria({ d, u, p, inicial = "antecedentes" }) {
  const clinico = A.puedeVerClinico(u);
  const [sec, setSec] = useState(clinico ? inicial : "impresos");
  const ops = clinico
    ? [{ v: "antecedentes", l: "Antecedentes" }, { v: "restringido", l: "Dato restringido" }, { v: "exploracion", l: "Miembro inferior" }, { v: "mapa", l: "Mapa del pie" }, { v: "seguimiento", l: "Seguimiento" }, { v: "impresos", l: "Impresos" }]
    : [{ v: "impresos", l: "Impresos" }];
  return (
    <div>
      {!clinico && <Aviso>Recepción y Gerencia no ven antecedentes, exploración ni notas. Puedes imprimir el consentimiento y los formatos en blanco.</Aviso>}
      <Chips opciones={ops} valor={sec} onChange={setSec} scroll />
      {sec === "antecedentes" && <Antecedentes d={d} u={u} p={p} />}
      {sec === "restringido" && <DatoRestringido d={d} u={u} p={p} />}
      {sec === "exploracion" && <ExploracionMI d={d} u={u} p={p} />}
      {sec === "mapa" && <MapaHallazgos d={d} u={u} p={p} />}
      {sec === "seguimiento" && <Seguimiento d={d} p={p} />}
      {sec === "impresos" && <PanelImpresos d={d} u={u} p={p} />}
    </div>
  );
}

function Antecedentes({ d, u, p }) {
  const base = d.exp?.antecedentes?.[p.id] || {};
  const [a, setA] = useState(base);
  useEffect(() => setA(d.exp?.antecedentes?.[p.id] || {}), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }));
  const cambios = JSON.stringify(a) !== JSON.stringify(base);
  const editable = A.puedeEditarClinico(u);
  const tri = (lista) => lista.map(([k, l, kd, ld]) => k === "vih" ? null : <Tri key={k} label={l} valor={a[k]} onChange={(v) => set(k, v)} disabled={!editable} detalle={kd ? a[kd] : undefined} onDetalle={kd ? (v) => set(kd, v) : undefined} etiquetaDetalle={ld} />);
  const [al, setAl] = useState({ sustancia: "", reaccion: "", gravedad: "leve" });
  const [me, setMe] = useState({ nombre_dosis: "", anticoagulante: false });
  return (
    <div>
      {base.actualizado && <p className="mu peq">Última actualización {fechaLarga(base.actualizado)} por {d.usuarios.find((x) => x.id === base.actualizadoPor)?.nombre ?? "—"}. Cada consulta guarda su instantánea (P-030).</p>}
      <Seccion titulo="Patológicos «Tiene alguna enfermedad como:»">
        {tri(A.TRI_PATOLOGICOS)}
        {a.diabetes === "si" && (
          <div className="form2">
            <Field label="Tipo de diabetes"><Select value={a.diabetes_tipo || ""} disabled={!editable} onChange={(e) => set("diabetes_tipo", e.target.value)}><option value="">—</option>{A.DIABETES_TIPO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Años de evolución"><Input inputMode="numeric" value={a.diabetes_anios_evolucion ?? ""} disabled={!editable} onChange={(e) => set("diabetes_anios_evolucion", e.target.value)} /></Field>
            <Field label="HbA1c (%)"><Input inputMode="decimal" value={a.hba1c ?? ""} disabled={!editable} onChange={(e) => set("hba1c", e.target.value)} /></Field>
            <Field label="Fecha HbA1c"><Input type="date" value={a.hba1c_fecha || ""} disabled={!editable} onChange={(e) => set("hba1c_fecha", e.target.value)} /></Field>
            <Field label="Tratamiento"><Input value={a.diabetes_tratamiento || ""} disabled={!editable} onChange={(e) => set("diabetes_tratamiento", e.target.value)} /></Field>
            <Field label="Médico tratante"><Input value={a.medico_tratante || ""} disabled={!editable} onChange={(e) => set("medico_tratante", e.target.value)} /></Field>
          </div>
        )}
        <div className="form2">
          <Field label="Última glucosa (fecha)"><Input type="date" value={a.ultima_glucosa_fecha || ""} disabled={!editable} onChange={(e) => set("ultima_glucosa_fecha", e.target.value)} /></Field>
          <Field label="Última glucosa (resultado)"><Input value={a.ultima_glucosa_texto || ""} disabled={!editable} onChange={(e) => set("ultima_glucosa_texto", e.target.value)} placeholder="p. ej. 126 mg/dl" /></Field>
        </div>
      </Seccion>
      <Seccion titulo="Clínicos de riesgo podológico">{tri(A.TRI_CLINICOS)}</Seccion>
      <Seccion titulo="Heredo-familiares «Padece alguna enfermedad su:»">
        <div className="form2">{A.PARENTESCOS.map(([k, l]) => <Field key={k} label={l}><Input value={a[k] || ""} disabled={!editable} onChange={(e) => set(k, e.target.value)} /></Field>)}</div>
      </Seccion>
      <Seccion titulo="No patológicos">
        {tri(A.TRI_NO_PAT)}
        <div className="form2">
          <Field label="Tipo de calzado"><Input value={a.tipo_calzado || ""} disabled={!editable} onChange={(e) => set("tipo_calzado", e.target.value)} /></Field>
          <Field label="N.º de calzado"><Input inputMode="decimal" value={a.numero_calzado ?? ""} disabled={!editable} onChange={(e) => set("numero_calzado", e.target.value)} /></Field>
        </div>
        <Field label="Motivo de la consulta inicial"><Input value={a.motivo_consulta_inicial || ""} disabled={!editable} onChange={(e) => set("motivo_consulta_inicial", e.target.value)} /></Field>
        <Field label="Síntomas"><Area rows={2} value={a.sintomas_iniciales || ""} disabled={!editable} onChange={(e) => set("sintomas_iniciales", e.target.value)} /></Field>
        <Field label="Notas"><Area rows={2} value={a.notas || ""} disabled={!editable} onChange={(e) => set("notas", e.target.value)} /></Field>
      </Seccion>
      {editable && <Button block disabled={!cambios} onClick={() => run((x) => A.guardarAntecedentes(x, p.id, a, u), "Antecedentes guardados")}>Guardar antecedentes</Button>}

      <Seccion titulo="Alergias">
        {A.alergiasDe(d, p.id).map((x) => <Fila key={x.id} titulo={x.sustancia} sub={`${x.reaccion || "—"} · ${x.gravedad}`} badge={<Badge tono={x.gravedad === "grave" ? "bad" : "warn"}>{x.gravedad}</Badge>}
          derecha={editable && <Button variante="ghost" onClick={() => run((y) => A.suspenderRegistro(y, "alergias", x.id, u), "Alergia marcada como no vigente")}>Quitar</Button>} />)}
        {editable && <div className="form2">
          <Field label="Sustancia"><Input value={al.sustancia} onChange={(e) => setAl({ ...al, sustancia: e.target.value })} /></Field>
          <Field label="Reacción"><Input value={al.reaccion} onChange={(e) => setAl({ ...al, reaccion: e.target.value })} /></Field>
          <Field label="Gravedad"><Select value={al.gravedad} onChange={(e) => setAl({ ...al, gravedad: e.target.value })}><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="grave">Grave</option></Select></Field>
          <div className="exp-al-b"><Button variante="sec" block onClick={() => run((y) => A.agregarAlergia(y, p.id, al, u), "Alergia registrada").ok && setAl({ sustancia: "", reaccion: "", gravedad: "leve" })}>Agregar alergia</Button></div>
        </div>}
      </Seccion>
      <Seccion titulo="Medicamentos actuales">
        {A.medicamentosDe(d, p.id).map((x) => <Fila key={x.id} titulo={x.nombre_dosis} badge={x.anticoagulante ? <Badge tono="bad">Anticoagulante</Badge> : null}
          derecha={editable && <Button variante="ghost" onClick={() => run((y) => A.suspenderRegistro(y, "medicamentos", x.id, u), "Medicamento suspendido")}>Suspender</Button>} />)}
        {editable && <div className="form2">
          <Field label="Medicamento y dosis"><Input value={me.nombre_dosis} onChange={(e) => setMe({ ...me, nombre_dosis: e.target.value })} /></Field>
          <label className="exp-check"><input type="checkbox" checked={me.anticoagulante} onChange={(e) => setMe({ ...me, anticoagulante: e.target.checked })} /> Es anticoagulante</label>
          <div className="exp-al-b"><Button variante="sec" block onClick={() => run((y) => A.agregarMedicamento(y, p.id, me, u), "Medicamento registrado").ok && setMe({ nombre_dosis: "", anticoagulante: false })}>Agregar medicamento</Button></div>
        </div>}
      </Seccion>
    </div>
  );
}

/** N-04: el dato se revela solo al pedirlo (queda en bitácora); el podólogo no tratante escribe el motivo. */
function DatoRestringido({ d, u, p }) {
  const acc = A.accesoVih(d, u, p.id);
  const [motivo, setMotivo] = useState("");
  const [visto, setVisto] = useState(null);
  const [nuevo, setNuevo] = useState("");
  useEffect(() => { setVisto(null); setMotivo(""); }, [p.id]);
  if (!acc.permitido) return <Aviso tono="bad">Dato restringido: solo Podología y Administración (N-04).</Aviso>;
  const ver = () => { const r = mutar((x) => A.leerVih(x, p.id, u, motivo)); if (r.ok) { setVisto(r); setNuevo(r.vih || ""); } else aviso(r.error, "bad"); };
  return (
    <Seccion titulo="VIH · acceso restringido (N-04)">
      <p className="mu peq">Solo lo ven y editan el podólogo tratante, otros podólogos con motivo registrado y Administración. Cada lectura queda en la bitácora; aparece en la historia impresa solo si la imprime Podología o Administración.</p>
      {!visto ? (
        <>
          {acc.requiereMotivo && <Field label="Motivo de la consulta del dato" hint="No eres tratante de este paciente: el motivo queda en bitácora y se avisa a Administración."><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>}
          <Button block icon="lock" onClick={ver}>Ver dato restringido</Button>
        </>
      ) : (
        <>
          <div className="exp-restr-v">Registrado: <b>{A.etiquetaTri(visto.vih)}</b>{visto.fecha ? ` · ${fechaLarga(visto.fecha)}` : ""}{visto.nota && <div>{visto.nota}</div>}</div>
          <Field label="Actualizar"><Select value={nuevo} onChange={(e) => setNuevo(e.target.value)}><option value="">Sin dato</option>{A.TRI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <div className="dos">
            <Button variante="sec" block onClick={() => setVisto(null)}>Ocultar</Button>
            <Button block onClick={() => { const r = run((x) => A.guardarVih(x, p.id, nuevo || null, u, { motivo, nota: visto.nota }), "Dato actualizado"); if (r.ok) setVisto({ ...visto, vih: nuevo || null }); }}>Guardar</Button>
          </div>
        </>
      )}
    </Seccion>
  );
}

function ExploracionMI({ d, u, p }) {
  const vacia = () => ({ D: { ...A.EXPLORACION_VACIA }, I: { ...A.EXPLORACION_VACIA } });
  const [x, setX] = useState(() => d.exp?.exploracionMI?.[p.id] ? structuredClone(d.exp.exploracionMI[p.id]) : vacia());
  useEffect(() => setX(d.exp?.exploracionMI?.[p.id] ? structuredClone(d.exp.exploracionMI[p.id]) : vacia()), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable = A.puedeEditarClinico(u);
  const set = (pierna, k, v) => setX((s) => ({ ...s, [pierna]: { ...s[pierna], [k]: v } }));
  const togg = (pierna, sil) => { const l = x[pierna].siluetas || []; set(pierna, "siluetas", l.includes(sil) ? l.filter((s) => s !== sil) : [...l, sil]); };
  const reg = d.exp?.exploracionMI?.[p.id];
  return (
    <div>
      {reg?.fecha && <p className="mu peq">Capturada {fechaLarga(reg.fecha)} por {d.usuarios.find((y) => y.id === reg.porId)?.nombre ?? "—"}.</p>}
      <div className="exp-piernas">
        {["D", "I"].map((pi) => (
          <div key={pi} className="exp-pierna">
            <b>Pierna {pi === "D" ? "derecha" : "izquierda"}</b>
            <div className="exp-siluetas">
              {A.SILUETAS.map(([k, l]) => (
                <button key={k} type="button" disabled={!editable} className={`exp-sil${(x[pi].siluetas || []).includes(k) ? " on" : ""}`} onClick={() => togg(pi, k)} aria-pressed={(x[pi].siluetas || []).includes(k)}>
                  <Silueta tipo={k} /><span>{l}</span>
                </button>
              ))}
            </div>
            <div className="form2">
              <Field label="Rotación"><Select value={x[pi].rotacion || ""} disabled={!editable} onChange={(e) => set(pi, "rotacion", e.target.value)}><option value="">—</option>{A.ROTACIONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Talalgias"><Select value={x[pi].talalgias || ""} disabled={!editable} onChange={(e) => set(pi, "talalgias", e.target.value)}><option value="">—</option><option value="si">Sí</option><option value="no">No</option></Select></Field>
              <Field label="Tipo de pie"><Select value={x[pi].tipo_pie || ""} disabled={!editable} onChange={(e) => set(pi, "tipo_pie", e.target.value)}><option value="">—</option>{A.TIPOS_PIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
              <Field label="Huella plantar"><Input value={x[pi].huella_plantar || ""} disabled={!editable} onChange={(e) => set(pi, "huella_plantar", e.target.value)} /></Field>
            </div>
            <Field label="Notas"><Area rows={2} value={x[pi].notas || ""} disabled={!editable} onChange={(e) => set(pi, "notas", e.target.value)} /></Field>
          </div>
        ))}
      </div>
      <p className="mu peq">Rotación, talalgias, tipo de pie y huella son campos del reverso del formato, <b>por validar</b> con el formato completo (N-02).</p>
      {editable && <Button block onClick={() => run((y) => A.guardarExploracionMI(y, p.id, x, u), "Exploración guardada")}>Guardar exploración</Button>}
    </div>
  );
}

/** Siluetas esquemáticas de miembro inferior (vista frontal o lateral) — dibujo propio. */
function Silueta({ tipo }) {
  const g = { genu_valgum: "M12 4 L16 22 L12 40", genu_varum: "M12 4 L7 22 L12 40", normal: "M12 4 L12 22 L12 40", genu_recurvatum: "M12 4 Q18 22 12 40", genu_flexum: "M12 4 Q5 22 12 40" }[tipo];
  return <svg viewBox="0 0 24 44" width="22" height="40" aria-hidden="true"><circle cx="12" cy="22" r="2.4" fill="currentColor" /><path d={g} stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" /><path d="M12 40 h6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>;
}

function MapaHallazgos({ d, u, p }) {
  const [marca, setMarca] = useState("lesion");
  const [nota, setNota] = useState("");
  const [sel, setSel] = useState(null);
  const [motivo, setMotivo] = useState("");
  const hs = A.hallazgosDe(d, p.id);
  const editable = A.puedeEditarClinico(u);
  const h = sel ? hs.find((x) => x.id === sel) : null;
  return (
    <div>
      {editable && (
        <div className="exp-mapa-ctl">
          <Chips opciones={A.MARCAS.map(([v, l]) => ({ v, l }))} valor={marca} onChange={setMarca} />
          <Input placeholder="Nota de la marca (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <p className="mu peq">Toca una zona del pie para agregar una marca numerada.</p>
        </div>
      )}
      <MapaPie hallazgos={hs} seleccion={sel} onHallazgo={(x) => setSel(x.id)}
        onMarcar={editable ? (m) => { const r = run((x) => A.marcarHallazgo(x, p.id, { ...m, marca, nota }, u), "Marca agregada"); if (r.ok) setNota(""); } : undefined} />
      <div className="lista">
        {!hs.length && <Vacio icon="activity">Sin marcas en el mapa del pie.</Vacio>}
        {hs.map((x) => <Fila key={x.id} titulo={`${x.numero}. ${A.nombreZona(x.zona)}`} sub={`Pie ${x.pie === "D" ? "derecho" : "izquierdo"} · ${x.vista} · ${fechaLarga(x.fecha)}`} datos={x.nota}
          badge={<Badge tono={x.marca === "ungueal" ? "warn" : "bad"}>{A.etiquetaDe(A.MARCAS, x.marca)}</Badge>} onClick={() => setSel(x.id)} />)}
      </div>
      <Sheet abierto={!!h} onClose={() => { setSel(null); setMotivo(""); }} titulo={h ? `Marca ${h.numero}` : ""}>
        {h && <>
          <p><b>{A.nombreZona(h.zona)}</b> · pie {h.pie === "D" ? "derecho" : "izquierdo"} · {h.vista}</p>
          <p>{h.nota || "Sin nota."}</p>
          <p className="mu peq">{fechaLarga(h.fecha)} · {d.usuarios.find((y) => y.id === h.porId)?.nombre ?? "—"}</p>
          {editable && <>
            <Field label="Motivo para retirar la marca"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
            <Button variante="danger" block onClick={() => { if (run((x) => A.retirarHallazgo(x, h.id, motivo, u), "Marca retirada").ok) { setSel(null); setMotivo(""); } }}>Retirar marca</Button>
          </>}
        </>}
      </Sheet>
    </div>
  );
}

function Seguimiento({ d, p }) {
  const v = A.visitasSeguimiento(d, p.id);
  return (
    <div className="lista">
      {!v.length && <Vacio icon="calendar">Sin visitas cerradas.</Vacio>}
      {[...v].reverse().map((x) => (
        <Fila key={x.id} titulo={`${A.fechaPapel(x.fecha)} · ${x.servicio || "—"}`} sub={`Atendió: ${x.atendio}`} datos={`${x.observaciones}${x.proxima ? ` · Próx. visita ${A.fechaPapel(x.proxima)}` : ""}`}
          badge={<Badge tono={A.TONO_NOTA[x.estadoNota]}>{A.ETIQUETA_NOTA[x.estadoNota]}</Badge>} />
      ))}
    </div>
  );
}

/** Vista previa e impresión de los formatos (consentimiento, antecedentes, seguimiento, historia completa, en blanco). */
export function PanelImpresos({ d, u, p }) {
  const clinico = A.puedeVerClinico(u);
  const tipos = [["consentimiento", "Consentimiento"], ["antecedentes", "Antecedentes"], ...(clinico ? [["seguimiento", "Seguimiento"], ["historia_completa", "Historia completa"]] : []), ["en_blanco", "En blanco"]];
  const [tipo, setTipo] = useState(p ? "consentimiento" : "en_blanco");
  const [sens, setSens] = useState(false);
  const hoyS = hoy();
  const base = useMemo(() => (p ? A.datosImpreso(d, p.id, u) : null), [d, p, u]);
  const doc = tipo === "en_blanco" || !base ? null : { ...base, clinica: "Pie Clinic", vih: clinico && sens ? base.vih : undefined, esCopia: A.emitidosDe(d, p.id).some((e) => e.tipo === tipo) };
  const hojas = (
    <div className="papeles">
      {(tipo === "consentimiento" || tipo === "historia_completa" || tipo === "en_blanco") && <HojaConsentimiento doc={doc ?? (tipo === "en_blanco" ? { consentimiento: A.plantillaActiva(d, "consentimiento_procedimiento_podologico") } : null)} impresoPor={u.nombre} hoy={hoyS} />}
      {(tipo === "antecedentes" || tipo === "historia_completa" || tipo === "en_blanco") && <HojaAntecedentes doc={doc} impresoPor={u.nombre} hoy={hoyS} sucursales={d.sucursales} />}
      {(tipo === "seguimiento" || tipo === "historia_completa" || tipo === "en_blanco") && <HojasSeguimiento doc={doc} impresoPor={u.nombre} hoy={hoyS} />}
    </div>
  );
  const imprimir = () => {
    const r = mutar((x) => A.registrarImpresion(x, { pacienteId: p?.id ?? null, tipo, incluyeSensibles: sens }, u));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Impresión ${r.emitido.folio} registrada`, "ok");
    imprimirPapel();
  };
  const emit = p ? A.emitidosDe(d, p.id).slice(0, 8) : [];
  return (
    <div>
      <Chips opciones={tipos.map(([v, l]) => ({ v, l }))} valor={tipo} onChange={setTipo} scroll />
      {clinico && p && ["antecedentes", "historia_completa"].includes(tipo) && <label className="exp-check"><input type="checkbox" checked={sens} onChange={(e) => setSens(e.target.checked)} /> Incluir dato restringido (VIH) — queda en bitácora (N-04)</label>}
      <div className="exp-print-bar"><Button icon="download" onClick={imprimir}>Imprimir / guardar PDF</Button><span className="mu peq">Hoja A4; la segunda impresión se marca «COPIA».</span></div>
      <div className="exp-preview">{hojas}</div>
      <PapelPortal>{hojas}</PapelPortal>
      {emit.length > 0 && <Seccion titulo="Impresiones de este expediente">
        {emit.map((e) => <Fila key={e.id} titulo={`${e.folio} · ${A.TIPOS_IMPRESO[e.tipo]}`} sub={`${fechaLarga(e.fecha)} · ${d.usuarios.find((y) => y.id === e.porId)?.nombre ?? "—"}`}
          badge={<>{e.esCopia && <Badge tono="neutral">Copia</Badge>}{e.incluyeSensibles && <Badge tono="bad">Con dato restringido</Badge>}</>} />)}
      </Seccion>}
    </div>
  );
}
