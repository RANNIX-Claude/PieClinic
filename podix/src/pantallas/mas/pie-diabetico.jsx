// Más ▸ Pie diabético (porte de Pie Firme: PieDiabetico, PieDiabeticoForm). P-010 (riesgo IWGDF tras parámetro APAGADO) y P-011 (ITB nunca 0).
// SINBAD 0–6, Wagner 0–5, monofilamento por sitio, pulsos, evolución con alertas. La valoración firmada no se edita.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_clinica.js";
import { fechaCorta, hoy } from "../../lib/format.js";
import { Area, Badge, BarraAccion, Button, Buscador, Card, Chips, Field, Input, Kpi, Pasos, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { CampoPaciente, SinAcceso, resultado } from "../../componentes/clinica/comunes.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);
const TEND = { inicial: ["Primera", "neutral"], mejora: ["Mejora", "ok"], estable: ["Estable", "info"], empeora: ["Empeora", "bad"] };

export default function PieDiabetico() {
  const { d, u } = useSesion();
  const [f, setF] = useState("todos");
  const [q, setQ] = useState("");
  const [pac, setPac] = useState(null);
  const [form, setForm] = useState(null);
  const P = A.paramsClinica(d);
  const vis = useMemo(() => A.valoracionesVisibles(d, u), [d, u]);
  const res = useMemo(() => A.resumenPie(d, vis), [d, vis]);
  if (!A.puede(u, "pie.ver")) return <SinAcceso>El seguimiento de pie diabético es del podólogo y de Administración.</SinAcceso>;
  const conAlerta = res.filter((x) => x.alertas.some((a) => a.tono === "bad"));
  const lista = (f === "alertas" ? conAlerta : f === "vencidas" ? res.filter((x) => x.vencida) : f === "ulcera" ? res.filter((x) => x.ultima.ulcera) : res)
    .filter((x) => A.buscarTexto(q, A.nombrePac(d, x.pacienteId))).sort((a, b) => b.alertas.length - a.alertas.length);
  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Pacientes en seguimiento" valor={res.length} />
        <Kpi label="Con úlcera activa" valor={res.filter((x) => x.ultima.ulcera).length} tono="warn" />
        <Kpi label="Alertas graves" valor={conAlerta.length} tono={conAlerta.length ? "bad" : undefined} />
        <Kpi label="Revisión vencida" valor={res.filter((x) => x.vencida).length} tono="warn" />
      </div>
      {A.puede(u, "clinica.parametros") && (
        <Card><div className="cl-entre"><span className="peq">Sugerencia de categoría de riesgo IWGDF (P-010): <b>{P.riesgoIwgdfActivo ? "ENCENDIDA" : "APAGADA"}</b>. Enciéndela solo cuando un podólogo asesor valide los criterios.</span>
          <Button variante="sec" className="btn-peq" onClick={() => { const r = mutar((dd) => A.cambiarParamClinica(dd, "riesgoIwgdfActivo", !P.riesgoIwgdfActivo, yo(dd))); resultado(r, aviso, "Parámetro actualizado"); }}>{P.riesgoIwgdfActivo ? "Apagar" : "Encender"}</Button></div></Card>
      )}
      <Chips scroll valor={f} onChange={setF} opciones={[{ v: "todos", l: "Todos", n: res.length }, { v: "alertas", l: "Con alerta", n: conAlerta.length }, { v: "ulcera", l: "Úlcera activa", n: res.filter((x) => x.ultima.ulcera).length }, { v: "vencidas", l: "Revisión vencida", n: res.filter((x) => x.vencida).length }]} />
      <Buscador valor={q} onChange={setQ} placeholder="Buscar paciente" />
      <Vista id="clinica-pie" items={lista} onAbrir={(x) => setPac(x.pacienteId)} vacio="Sin valoraciones en este filtro."
        tarjeta={(x) => (
          <div className="form" style={{ gap: 6 }}>
            <div className="cl-entre"><b>{A.nombrePac(d, x.pacienteId)}</b><Badge tono={TEND[x.tendencia][1]}>{TEND[x.tendencia][0]}</Badge></div>
            <div className="peq">Wagner {x.ultima.wagner}{x.ultima.sinbadTotal != null ? ` · SINBAD ${x.ultima.sinbadTotal}/6` : ""} · ITB {x.ultima.itbI ?? "n/e"} / {x.ultima.itbD ?? "n/e"}</div>
            <div className="mu peq">Última {fechaCorta(x.ultima.fecha)} · próxima {x.ultima.proximaRevision ? fechaCorta(x.ultima.proximaRevision) : "—"} · {x.n} valoración(es)</div>
            {x.alertas.slice(0, 2).map((a, i) => <Badge key={i} tono={a.tono}>{a.texto}</Badge>)}
          </div>
        )}
        columnas={[{ k: "p", t: "Paciente", v: (x) => A.nombrePac(d, x.pacienteId) }, { k: "w", t: "Wagner", v: (x) => x.ultima.wagner, der: true }, { k: "s", t: "SINBAD", v: (x) => x.ultima.sinbadTotal ?? "—", orden: (x) => x.ultima.sinbadTotal ?? -1, der: true },
          { k: "i", t: "ITB izq/der", v: (x) => `${x.ultima.itbI ?? "n/e"} / ${x.ultima.itbD ?? "n/e"}` }, { k: "f", t: "Última", v: (x) => fechaCorta(x.ultima.fecha), orden: (x) => x.ultima.fecha },
          { k: "pr", t: "Próxima", v: (x) => (x.ultima.proximaRevision ? fechaCorta(x.ultima.proximaRevision) : "—"), orden: (x) => x.ultima.proximaRevision || "" }, { k: "a", t: "Alertas", v: (x) => x.alertas.length, der: true },
          { k: "t", t: "Tendencia", v: (x) => <Badge tono={TEND[x.tendencia][1]}>{TEND[x.tendencia][0]}</Badge>, orden: (x) => x.tendencia }]} />
      <div style={{ height: 70 }} />
      {A.puede(u, "pie.editar") && <BarraAccion><Button block icon="plus" onClick={() => setForm({})}>Nueva valoración</Button></BarraAccion>}
      {pac && <Historial pacienteId={pac} onClose={() => setPac(null)} onNueva={(prev) => setForm({ pacienteId: pac, previa: prev })} onEditar={(v) => setForm({ editar: v })} />}
      {form && <FormValoracion inicial={form} onClose={() => setForm(null)} />}
    </div>
  );
}

/** Gráfica de evolución (SVG propio): Wagner y SINBAD a lo largo del tiempo. */
function Evolucion({ vs }) {
  if (vs.length < 2) return null;
  const W = 320, H = 110, pad = 18, n = vs.length;
  const x = (i) => pad + (i * (W - pad * 2)) / (n - 1), y = (v, max) => H - pad - (v / max) * (H - pad * 2);
  const linea = (k, max) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(Number(v[k]) || 0, max).toFixed(1)}`).join(" ");
  return (
    <svg className="cl-grafica" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución de Wagner y SINBAD">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--bd)" />
      <path d={linea("wagner", 5)} fill="none" stroke="var(--er)" strokeWidth="2" />
      <path d={linea("sinbadTotal", 6)} fill="none" stroke="var(--p)" strokeWidth="2" strokeDasharray="4 3" />
      {vs.map((v, i) => <g key={i}><circle cx={x(i)} cy={y(Number(v.wagner) || 0, 5)} r="3" fill="var(--er)" /><text x={x(i)} y={H - 4} fontSize="8" textAnchor="middle" fill="var(--mu)">{String(v.fecha).slice(5)}</text></g>)}
      <text x={pad} y={10} fontSize="9" fill="var(--er)">Wagner (0–5)</text><text x={W - pad} y={10} fontSize="9" textAnchor="end" fill="var(--p)">SINBAD (0–6)</text>
    </svg>
  );
}

function Historial({ pacienteId, onClose, onNueva, onEditar }) {
  const { d, u } = useSesion();
  const vs = A.historialPie(d, pacienteId).filter((v) => A.valoracionesVisibles(d, u).includes(v));
  const ult = vs[vs.length - 1];
  return (
    <Sheet abierto onClose={onClose} titulo={A.nombrePac(d, pacienteId)} pie={A.puede(u, "pie.editar") && <Button block icon="plus" onClick={() => { onClose(); onNueva(ult); }}>Nueva valoración</Button>}>
      <div className="form">
        <Evolucion vs={vs} />
        {ult && A.alertasValoracion(ult, vs[vs.length - 2] || null).map((a, i) => <div key={i} className={`card card-${a.tono}`}>{a.texto}</div>)}
        {[...vs].reverse().map((v) => (
          <Card key={v.id}>
            <div className="cl-entre"><b>{v.folio} · {fechaCorta(v.fecha)}</b><Badge tono={v.firmada ? "ok" : "warn"}>{v.firmada ? "Firmada" : "Sin firmar"}</Badge></div>
            <Resumen filas={[["Podólogo", A.nombreCorto(d, v.podologoId)], ["Wagner", A.WAGNER[v.wagner]], v.sinbadTotal != null && ["SINBAD", `${v.sinbadTotal}/6`], ["ITB izq. / der.", `${A.lecturaItb(v.itbI)} · ${A.lecturaItb(v.itbD)}`],
              ["Sensibilidad protectora", v.sensProtectora === "ausente" ? "Ausente" : v.sensProtectora === "intacta" ? "Intacta" : "No evaluada"], ["Pulsos", A.PULSOS.map(([k, l]) => `${l}: ${A.PULSO[v.pulsos[k]] || "—"}`).join(" · ")],
              v.hba1c != null && ["HbA1c", `${v.hba1c} %`], v.ulcera && ["Úlcera", `${v.ulcera.pie === "I" ? "Izq." : "Der."} · ${A.REGIONES[v.ulcera.region]} · ${v.ulcera.areaCm2 ?? "—"} cm² · ${A.PROFUNDIDADES[v.ulcera.profundidad]} · ${A.INFECCION[v.ulcera.infeccion]}`],
              (v.riesgo != null || v.riesgoClinico != null) && ["Riesgo", A.RIESGO_TXT[v.riesgo ?? v.riesgoClinico]], ["Próxima revisión", v.proximaRevision ? fechaCorta(v.proximaRevision) : "—"]]} />
            {v.notas && <p className="peq">{v.notas}</p>}
            {!v.firmada && A.esSuyo(u, v) && <div className="dos">
              <Button variante="sec" block className="btn-peq" icon="edit" onClick={() => { onClose(); onEditar(v); }}>Corregir</Button>
              {u.rol === "podologo" && <Button block className="btn-peq" icon="check" onClick={() => { const r = mutar((dd) => A.firmarValoracion(dd, v.id, yo(dd))); resultado(r, aviso, "Valoración firmada: ya no se edita"); }}>Firmar</Button>}
            </div>}
          </Card>
        ))}
        {!vs.length && <Vacio>Sin valoraciones.</Vacio>}
      </div>
    </Sheet>
  );
}

const PASOS = ["Paciente y vascular", "Neurológico", "Úlcera y clasificación", "Plan y revisión"];
function Toggle({ valor, onChange }) {
  return <span className="cl-toggle">{[0, 1].map((v) => <button key={v} type="button" className={Number(valor) === v ? "on" : ""} onClick={() => onChange(v)}>{v}</button>)}</span>;
}
function FormValoracion({ inicial, onClose }) {
  const { d, u, sucursalId } = useSesion();
  const P = A.paramsClinica(d);
  const ed = inicial.editar;
  const [paso, setPaso] = useState(0);
  const [err, setErr] = useState({});
  const [f, setF] = useState(() => ed ? { ...ed, itbI: ed.itbI ?? "", itbD: ed.itbD ?? "", hba1c: ed.hba1c ?? "", riesgo: ed.riesgo ?? "", ulcera: ed.ulcera ? { ...ed.ulcera } : null, sinbad: ed.sinbad || { s: 0, i: 0, n: 0, b: 0, a: 0, d: 0 } } : {
    pacienteId: inicial.pacienteId || "", fecha: hoy(), pulsos: { pedioI: "presente", pedioD: "presente", tibialI: "presente", tibialD: "presente" }, mono: { D: { ev: 10, fallan: [] }, I: { ev: 10, fallan: [] } },
    sensProtectora: "", itbI: "", itbD: "", hba1c: "", sintomas: [], deformidades: [], ulceraPrevia: !!(inicial.previa && (inicial.previa.ulcera || inicial.previa.ulceraPrevia)), amputacionPrevia: false,
    ulcera: null, sinbad: { s: 0, i: 0, n: 0, b: 0, a: 0, d: 0 }, wagner: 0, riesgo: "", frecuencia: "cada_3_meses", notas: "",
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const ids = u.rol === "podologo" ? A.pacientesDe(d, u) : null;
  const sugSens = A.sensProtectoraSugerida(f.mono);
  const sensEf = f.sensProtectora || sugSens;
  const sugSinbad = f.ulcera ? A.sugerirSinbad({ ...f.ulcera, pulsos: f.pulsos, sensProtectora: sensEf }) : null;
  const sugRiesgo = A.sugerirRiesgo(A.factoresRiesgo({ ...f, sensProtectora: sensEf }), { activo: P.riesgoIwgdfActivo });
  const itbErr = (k) => { const r = A.validarItb(f[k]); return r.ok ? null : r.error; };
  const altMono = (pie, sitio) => setF((x) => { const fl = x.mono[pie].fallan; return { ...x, mono: { ...x.mono, [pie]: { ...x.mono[pie], fallan: fl.includes(sitio) ? fl.filter((y) => y !== sitio) : [...fl, sitio] } } }; });
  const alt = (k, v) => set(k, f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]);
  const guardar = () => {
    const r = mutar((dd) => A.guardarValoracion(dd, { ...f, sensProtectora: sensEf }, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) { setErr(r.errores || {}); return aviso(r.error, "bad"); }
    const al = A.alertasValoracion(r.valoracion, inicial.previa || null);
    aviso(`${r.valoracion.folio} guardada${al.length ? ` · ${al.length} alerta(s)` : ""}`, al.some((a) => a.tono === "bad") ? "warn" : "ok"); onClose();
  };
  const pie = <div className="dos">
    <Button variante="sec" block disabled={!paso} onClick={() => setPaso(paso - 1)}>Atrás</Button>
    {paso < PASOS.length - 1 ? <Button block disabled={(paso === 0 && (!f.pacienteId || itbErr("itbI") || itbErr("itbD")))} onClick={() => setPaso(paso + 1)}>Siguiente</Button> : <Button block icon="check" onClick={guardar}>Guardar valoración</Button>}
  </div>;
  return (
    <Sheet abierto onClose={onClose} titulo={ed ? `Corregir ${ed.folio}` : "Valoración de pie diabético"} pie={pie}>
      <div className="form">
        <Pasos titulos={PASOS} paso={paso} />
        {paso === 0 && <>
          {ed ? <Field label="Paciente"><Input value={A.nombrePac(d, f.pacienteId)} disabled /></Field> : <CampoPaciente d={d} ids={ids} valor={f.pacienteId} onChange={(v) => set("pacienteId", v)} error={err.pacienteId} />}
          <Field label="Fecha" error={err.fecha}><Input type="date" max={hoy()} value={f.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
          <Titulo>Pulsos pedios y tibiales</Titulo>
          <div className="form2">{A.PULSOS.map(([k, l]) => <Field key={k} label={l}><Select value={f.pulsos[k] || "no_evaluado"} onChange={(e) => set("pulsos", { ...f.pulsos, [k]: e.target.value })}>{Object.entries(A.PULSO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>)}</div>
          <Titulo>Índice tobillo-brazo (P-011)</Titulo>
          <div className="form2">
            <Field label="ITB izquierdo" error={itbErr("itbI") || err.itbI} hint={A.lecturaItb(f.itbI)}><Input inputMode="decimal" value={f.itbI} onChange={(e) => set("itbI", e.target.value)} placeholder="Vacío = no evaluado" /></Field>
            <Field label="ITB derecho" error={itbErr("itbD") || err.itbD} hint={A.lecturaItb(f.itbD)}><Input inputMode="decimal" value={f.itbD} onChange={(e) => set("itbD", e.target.value)} placeholder="Vacío = no evaluado" /></Field>
          </div>
          <p className="mu peq">Si no se midió, deja el campo vacío. El sistema nunca guarda un ITB de 0.</p>
          <Field label="HbA1c (%)" error={err.hba1c}><Input inputMode="decimal" value={f.hba1c} onChange={(e) => set("hba1c", e.target.value)} /></Field>
        </>}
        {paso === 1 && <>
          <Titulo>Monofilamento 10 g · toca los sitios SIN sensibilidad</Titulo>
          {["D", "I"].map((pie) => (
            <div key={pie}><div className="peq fuerte">{pie === "D" ? "Pie derecho" : "Pie izquierdo"} · {f.mono[pie].fallan.length}/{f.mono[pie].ev} sin sensibilidad</div>
              <div className="cl-mono">{A.SITIOS_MONO.map(([k, l]) => <button key={k} type="button" className={f.mono[pie].fallan.includes(k) ? "falla" : ""} onClick={() => altMono(pie, k)} aria-pressed={f.mono[pie].fallan.includes(k)}>{l}</button>)}</div></div>
          ))}
          <Field label="Sensibilidad protectora" hint={sugSens ? `Sugerida por monofilamento: ${sugSens}` : ""}><Select value={f.sensProtectora} onChange={(e) => set("sensProtectora", e.target.value)}><option value="">Usar la sugerida</option><option value="intacta">Intacta</option><option value="ausente">Ausente</option></Select></Field>
          <Titulo>Síntomas</Titulo>
          <div className="cl-fila-h">{Object.entries(A.SINTOMAS).map(([k, l]) => <button key={k} type="button" className={`chip${f.sintomas.includes(k) ? " on" : ""}`} onClick={() => alt("sintomas", k)}>{l}</button>)}</div>
          <Titulo>Deformidades y lesiones</Titulo>
          <div className="cl-fila-h">{Object.entries(A.DEFORMIDADES).map(([k, l]) => <button key={k} type="button" className={`chip${f.deformidades.includes(k) ? " on" : ""}`} onClick={() => alt("deformidades", k)}>{l}</button>)}</div>
          <div className="cl-fila-h">
            <label className="cl-fila-h peq"><input type="checkbox" checked={f.ulceraPrevia} onChange={(e) => set("ulceraPrevia", e.target.checked)} /> Úlcera previa</label>
            <label className="cl-fila-h peq"><input type="checkbox" checked={f.amputacionPrevia} onChange={(e) => set("amputacionPrevia", e.target.checked)} /> Amputación previa</label>
          </div>
        </>}
        {paso === 2 && <>
          <Field label="¿Úlcera activa?"><Chips valor={f.ulcera ? "si" : "no"} onChange={(v) => set("ulcera", v === "si" ? { pie: "D", region: "antepie", areaCm2: "", profundidad: "piel", infeccion: "sin_infeccion", descripcion: "" } : null)} opciones={[{ v: "no", l: "No" }, { v: "si", l: "Sí" }]} /></Field>
          {f.ulcera && <>
            <div className="form2">
              <Field label="Pie"><Select value={f.ulcera.pie} onChange={(e) => set("ulcera", { ...f.ulcera, pie: e.target.value })}><option value="D">Derecho</option><option value="I">Izquierdo</option></Select></Field>
              <Field label="Región"><Select value={f.ulcera.region} onChange={(e) => set("ulcera", { ...f.ulcera, region: e.target.value })}>{Object.entries(A.REGIONES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="Área (cm²)" error={err.area}><Input inputMode="decimal" value={f.ulcera.areaCm2} onChange={(e) => set("ulcera", { ...f.ulcera, areaCm2: e.target.value })} /></Field>
              <Field label="Profundidad"><Select value={f.ulcera.profundidad} onChange={(e) => set("ulcera", { ...f.ulcera, profundidad: e.target.value })}>{Object.entries(A.PROFUNDIDADES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="Infección"><Select value={f.ulcera.infeccion} onChange={(e) => set("ulcera", { ...f.ulcera, infeccion: e.target.value })}>{Object.entries(A.INFECCION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            </div>
            <Field label="Descripción del lecho"><Area value={f.ulcera.descripcion} onChange={(e) => set("ulcera", { ...f.ulcera, descripcion: e.target.value })} /></Field>
            <div className="cl-entre"><Titulo>SINBAD</Titulo><Button variante="ghost" className="btn-peq" onClick={() => set("sinbad", sugSinbad)}>Usar sugerido ({A.puntajeSinbad(sugSinbad)})</Button></div>
            <div className="cl-sinbad">{A.ITEMS_SINBAD.map(([k, l, h]) => <div key={k} className="cl-item"><div>{l}<small>{h}</small></div><Toggle valor={f.sinbad[k]} onChange={(v) => set("sinbad", { ...f.sinbad, [k]: v })} /></div>)}</div>
            {err.sinbad && <div className="card card-bad">{err.sinbad}</div>}
            <Card><div className="cl-entre"><span>Puntaje SINBAD</span><span className="cl-puntaje">{A.puntajeSinbad(f.sinbad)}/6</span></div></Card>
          </>}
          <Field label="Clasificación de Wagner" error={err.wagner}><Select value={f.wagner} onChange={(e) => set("wagner", Number(e.target.value))}>{A.WAGNER.map((t, i) => <option key={i} value={i}>{t}</option>)}</Select></Field>
        </>}
        {paso === 3 && <>
          {P.riesgoIwgdfActivo ? (
            <Field label="Categoría de riesgo IWGDF" hint={sugRiesgo != null ? `Sugerida: ${A.RIESGO_TXT[sugRiesgo]} (el podólogo decide)` : ""} error={err.riesgo}>
              <Select value={f.riesgo} onChange={(e) => { const v = e.target.value; setF((x) => ({ ...x, riesgo: v, frecuencia: v !== "" ? A.FRECUENCIA_POR_RIESGO[v] : x.frecuencia })); }}><option value="">Sin categoría</option>{A.RIESGO_TXT.map((t, i) => <option key={i} value={i}>{t}</option>)}</Select>
            </Field>
          ) : <p className="cl-sim">La sugerencia de riesgo IWGDF está apagada por parámetro (P-010): falta que un podólogo asesor valide los criterios.</p>}
          <Field label="Próxima revisión"><Select value={f.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}>{Object.entries(A.FRECUENCIAS_REVISION).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Notas y plan de cuidados"><Area value={f.notas} onChange={(e) => set("notas", e.target.value)} /></Field>
          <Titulo>Alertas con lo capturado</Titulo>
          {A.alertasValoracion({ ...f, sensProtectora: sensEf, sinbadTotal: f.ulcera ? A.puntajeSinbad(f.sinbad) : null }, inicial.previa || null).map((a, i) => <div key={i} className={`card card-${a.tono}`}>{a.texto}</div>)}
          <p className="mu peq">Apoyo a la decisión, no diagnóstico. La valoración se firma después y ya no se edita.</p>
        </>}
      </div>
    </Sheet>
  );
}
