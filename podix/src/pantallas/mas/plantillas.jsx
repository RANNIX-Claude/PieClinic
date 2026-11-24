// Más ▸ Plantillas ortopédicas (porte de Pie Firme: PlantillasOrtopedicas, PlantillaOrtopedica). P-013:
// estudio de pisada → borrador → en laboratorio → recibida → entregada; 15 días hábiles; garantía 6 meses; anticipo 50 %.
// Al enviar se crea LA orden de laboratorio (d.ordenesLab): Órdenes, Caja y «Entrega de plantillas» trabajan sobre ella (no se duplica).
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_clinica.js";
import { dinero, fechaCorta, hoy } from "../../lib/format.js";
import { Area, Badge, BarraAccion, Button, Buscador, Card, Chips, Field, Input, Kpi, Pasos, Resumen, Select, Sheet, Titulo, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { CampoPaciente, SinAcceso, resultado } from "../../componentes/clinica/comunes.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);

export default function Plantillas() {
  const { d, u } = useSesion();
  const [f, setF] = useState("curso");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [nueva, setNueva] = useState(false);
  const ref = hoy();
  const lista0 = useMemo(() => A.plantillasVisibles(d, u).map((p) => ({ ...p, ficha: A.fichaPO(d, p, ref) })), [d, u, ref]);
  if (!A.puede(u, "plantillas.ver")) return <SinAcceso>Las plantillas ortopédicas las prescribe el podólogo. Almacén las recibe y entrega en «Entrega de plantillas».</SinAcceso>;
  const por = (fn) => lista0.filter(fn);
  const filtros = {
    curso: (p) => ["borrador", "enviada", "recibida"].includes(p.ficha.estado), borrador: (p) => p.ficha.estado === "borrador", lab: (p) => p.ficha.estado === "enviada",
    retrasadas: (p) => p.ficha.retrasada, garantia: (p) => p.ficha.enGarantia, entregadas: (p) => p.ficha.estado === "entregada", todas: () => true,
  };
  const lista = por(filtros[f]).filter((p) => A.buscarTexto(q, A.nombrePac(d, p.pacienteId), p.folio, p.orden.modelo, p.ficha.folioLab || "")).sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Borradores" valor={por(filtros.borrador).length} />
        <Kpi label="En laboratorio" valor={por(filtros.lab).length} />
        <Kpi label="Retrasadas" valor={por(filtros.retrasadas).length} tono={por(filtros.retrasadas).length ? "bad" : undefined} nota="15 días hábiles" />
        <Kpi label="En garantía" valor={por(filtros.garantia).length} nota="6 meses" />
      </div>
      <Chips scroll valor={f} onChange={setF} opciones={[["curso", "En curso"], ["borrador", "Borradores"], ["lab", "En laboratorio"], ["retrasadas", "Retrasadas"], ["entregadas", "Entregadas"], ["garantia", "En garantía"], ["todas", "Todas"]].map(([v, l]) => ({ v, l, n: por(filtros[v]).length }))} />
      <Buscador valor={q} onChange={setQ} placeholder="Paciente, folio PO/LAB o modelo" />
      <Vista id="clinica-plantillas" items={lista} onAbrir={(p) => setSel(p.id)} vacio="Sin plantillas en este filtro."
        tarjeta={(p) => (
          <div className="form" style={{ gap: 6 }}>
            <div className="cl-entre"><b>{A.nombrePac(d, p.pacienteId)}</b><Badge tono={p.ficha.retrasada ? "bad" : A.TONO_PO[p.ficha.estado]}>{p.ficha.retrasada ? "Retrasada" : A.ESTADOS_PO[p.ficha.estado]}</Badge></div>
            <div className="mu peq">{p.folio}{p.ficha.folioLab ? ` · ${p.ficha.folioLab}` : ""} · {p.orden.modelo}</div>
            <Linea estado={p.ficha.estado} />
            <div className="peq">{p.ficha.estado === "entregada" ? `Entregada ${fechaCorta(p.ficha.entregada)} · garantía ${p.ficha.enGarantia ? `hasta ${fechaCorta(p.ficha.garantiaHasta)}` : "vencida"}` : p.ficha.prometida ? `Entrega estimada ${fechaCorta(p.ficha.prometida)}` : `Estudio ${A.TIPOS_ESTUDIO[p.estudio.tipo]}`}</div>
            {p.ficha.anticipoPendiente > 0 && <Badge tono="warn">Anticipo pendiente {dinero(p.ficha.anticipoPendiente)}</Badge>}
          </div>
        )}
        columnas={[{ k: "f", t: "Folio", v: (p) => p.folio }, { k: "l", t: "Orden lab.", v: (p) => p.ficha.folioLab || "—" }, { k: "p", t: "Paciente", v: (p) => A.nombrePac(d, p.pacienteId) }, { k: "m", t: "Modelo", v: (p) => p.orden.modelo },
          { k: "pr", t: "Precio", v: (p) => dinero(p.ficha.precio), orden: (p) => p.ficha.precio, der: true }, { k: "e", t: "Entrega", v: (p) => fechaCorta(p.ficha.entregada || p.ficha.prometida || p.creado), orden: (p) => p.ficha.entregada || p.ficha.prometida || "" },
          { k: "s", t: "Estado", v: (p) => <Badge tono={p.ficha.retrasada ? "bad" : A.TONO_PO[p.ficha.estado]}>{p.ficha.retrasada ? "Retrasada" : A.ESTADOS_PO[p.ficha.estado]}</Badge>, orden: (p) => p.ficha.estado }]} />
      <div style={{ height: 70 }} />
      {A.puede(u, "plantillas.editar") && <BarraAccion><Button block icon="plus" onClick={() => setNueva(true)}>Nuevo estudio de pisada</Button></BarraAccion>}
      {nueva && <FormPlantilla onClose={() => setNueva(false)} onCreada={(id) => { setNueva(false); setSel(id); }} />}
      {sel && <Detalle id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function Linea({ estado }) {
  if (estado === "cancelada") return <Badge tono="neutral">Cancelada</Badge>;
  const k = A.PASOS_PO.indexOf(estado);
  return <div className="cl-pasos-po">{A.PASOS_PO.map((p, i) => <span key={p} className={i < k ? "ok" : i === k ? "on" : ""}>{A.ESTADOS_PO[p]}</span>)}</div>;
}

const estudioVacio = () => ({ tipo: "baropodometria", tallaCalzado: 25, longI: "", longD: "", anchoI: "", anchoD: "", tipoArco: "Normal", retropie: "Neutro", dismetriaMm: 0, pesoKg: "", actividad: "", hallazgos: "" });
function CamposEstudio({ e, set, err }) {
  return (
    <div className="form">
      <Field label="Tipo de estudio" error={err.tipo}><Select value={e.tipo} onChange={(x) => set("tipo", x.target.value)}>{Object.entries(A.TIPOS_ESTUDIO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <div className="form2">
        <Field label="Talla de calzado (MX)" error={err.tallaCalzado}><Input inputMode="decimal" value={e.tallaCalzado} onChange={(x) => set("tallaCalzado", x.target.value)} /></Field>
        <Field label="Peso (kg)" error={err.pesoKg}><Input inputMode="decimal" value={e.pesoKg} onChange={(x) => set("pesoKg", x.target.value)} /></Field>
        <Field label="Longitud izq. (mm)" error={err.long}><Input inputMode="numeric" value={e.longI} onChange={(x) => set("longI", x.target.value)} /></Field>
        <Field label="Longitud der. (mm)"><Input inputMode="numeric" value={e.longD} onChange={(x) => set("longD", x.target.value)} /></Field>
        <Field label="Ancho izq. (mm)" error={err.ancho}><Input inputMode="numeric" value={e.anchoI} onChange={(x) => set("anchoI", x.target.value)} /></Field>
        <Field label="Ancho der. (mm)"><Input inputMode="numeric" value={e.anchoD} onChange={(x) => set("anchoD", x.target.value)} /></Field>
        <Field label="Tipo de arco" error={err.tipoArco}><Select value={e.tipoArco} onChange={(x) => set("tipoArco", x.target.value)}>{A.TIPOS_ARCO.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Retropié"><Select value={e.retropie} onChange={(x) => set("retropie", x.target.value)}>{A.RETROPIE.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Dismetría (mm)" error={err.dismetriaMm}><Input inputMode="numeric" value={e.dismetriaMm} onChange={(x) => set("dismetriaMm", x.target.value)} /></Field>
        <Field label="Actividad"><Input value={e.actividad} onChange={(x) => set("actividad", x.target.value)} /></Field>
      </div>
      <Field label="Hallazgos de la pisada"><Area value={e.hallazgos} onChange={(x) => set("hallazgos", x.target.value)} /></Field>
    </div>
  );
}
function CamposOrden({ d, o, set, err }) {
  return (
    <div className="form">
      <Field label="Modelo" error={err.modelo}><Select value={o.modelo} onChange={(x) => { set("modelo", x.target.value); set("precio", A.MODELOS_PO[x.target.value]); }}>{Object.keys(A.MODELOS_PO).map((m) => <option key={m}>{m}</option>)}</Select></Field>
      <div className="form2">
        <Field label="Material"><Select value={o.material} onChange={(x) => set("material", x.target.value)}>{A.MATERIALES_PO.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Cobertura"><Select value={o.cobertura} onChange={(x) => set("cobertura", x.target.value)}>{Object.entries(A.COBERTURAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Pie"><Select value={o.pie} onChange={(x) => set("pie", x.target.value)}>{["Ambos", "Derecho", "Izquierdo"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Pares" error={err.pares}><Input inputMode="numeric" value={o.pares} onChange={(x) => set("pares", x.target.value)} /></Field>
        <Field label="Precio por par" error={err.precio}><Input inputMode="decimal" value={o.precio} onChange={(x) => set("precio", x.target.value)} /></Field>
        <Field label="Garantía (meses)" error={err.garantiaMeses}><Input inputMode="numeric" value={o.garantiaMeses} onChange={(x) => set("garantiaMeses", x.target.value)} /></Field>
      </div>
      <Field label="Laboratorio" error={err.laboratorioId}><Select value={o.laboratorioId} onChange={(x) => set("laboratorioId", x.target.value)}>{d.laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</Select></Field>
      <Field label="Correcciones"><Area value={o.correcciones} onChange={(x) => set("correcciones", x.target.value)} placeholder="Ej. Cuña supinadora de retropié, barra retrocapital" /></Field>
      <Resumen filas={[["Total", dinero((Number(o.precio) || 0) * (Number(o.pares) || 1)), true], ["Anticipo requerido (50 %)", dinero(A.anticipoPlantilla((Number(o.precio) || 0) * (Number(o.pares) || 1), A.paramsClinica(d).anticipoPlantillaPct))]]} />
    </div>
  );
}

function FormPlantilla({ onClose, onCreada }) {
  const { d, u } = useSesion();
  const [paso, setPaso] = useState(0);
  const [pacienteId, setPac] = useState("");
  const [e, setE] = useState(estudioVacio());
  const [o, setO] = useState({ modelo: "Plantilla a medida", material: A.MATERIALES_PO[0], cobertura: "completa", pie: "Ambos", pares: 1, precio: A.MODELOS_PO["Plantilla a medida"], laboratorioId: (d.laboratorios[0] || {}).id, garantiaMeses: A.paramsClinica(d).garantiaMeses, correcciones: "" });
  const [err, setErr] = useState({});
  const ids = u.rol === "podologo" ? A.pacientesDe(d, u) : null;
  const guardar = (enviar) => {
    const num = (v) => (v === "" ? "" : Number(v));
    const estudio = { ...e, tallaCalzado: num(e.tallaCalzado), longI: num(e.longI), longD: num(e.longD), anchoI: num(e.anchoI), anchoD: num(e.anchoD), dismetriaMm: num(e.dismetriaMm), pesoKg: num(e.pesoKg) };
    const r = mutar((dd) => {
      const c = A.crearPlantillaOrto(dd, { pacienteId, estudio, orden: { ...o, pares: Number(o.pares), precio: Number(o.precio), garantiaMeses: Number(o.garantiaMeses) } }, yo(dd), dd.sesion.sucursalId);
      if (!c.ok || !enviar) return c;
      const env = A.enviarPlantillaLab(dd, c.plantilla.id, yo(dd));
      return env.ok ? { ...c, orden: env.orden } : { ...env, plantilla: c.plantilla };
    });
    if (!r.ok) { setErr(r.errores || {}); if (!r.plantilla) return aviso(r.error, "bad"); aviso(`Guardada como borrador: ${r.error}`, "warn"); return onCreada(r.plantilla.id); }
    aviso(r.orden ? `${r.plantilla.folio} enviada: orden ${r.orden.folio}, entrega ${fechaCorta(r.orden.prometida)}` : `${r.plantilla.folio} guardada en borrador`); onCreada(r.plantilla.id);
  };
  const T = ["Paciente y estudio", "Orden al laboratorio"];
  return (
    <Sheet abierto onClose={onClose} titulo="Nuevo estudio de pisada" pie={paso === 0
      ? <Button block disabled={!pacienteId} onClick={() => setPaso(1)}>Siguiente</Button>
      : <div className="dos"><Button variante="sec" block onClick={() => guardar(false)}>Guardar borrador</Button><Button block icon="send" onClick={() => guardar(true)}>Enviar al laboratorio</Button></div>}>
      <div className="form">
        <Pasos titulos={T} paso={paso} />
        {paso === 0 ? <><CampoPaciente d={d} ids={ids} valor={pacienteId} onChange={setPac} error={err.pacienteId} /><CamposEstudio e={e} set={(k, v) => setE((x) => ({ ...x, [k]: v }))} err={err} /></>
          : <><Button variante="ghost" className="btn-peq" icon="back" onClick={() => setPaso(0)}>Volver al estudio</Button><CamposOrden d={d} o={o} set={(k, v) => setO((x) => ({ ...x, [k]: v }))} err={err} />
            <p className="mu peq">Entrega estimada: {fechaCorta(A.entregaEstimada(hoy(), A.paramsClinica(d).diasHabilesPlantilla, A.festivosDe(d)))} (15 días hábiles, P-013). El anticipo se cobra en Caja.</p></>}
      </div>
    </Sheet>
  );
}

function Detalle({ id, onClose }) {
  const { d, u } = useSesion();
  const po = (d.plantillasOrto || []).find((x) => x.id === id);
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState(null); // reclamo | cancelar | editar
  if (!po) return null;
  const f = A.fichaPO(d, po);
  const ed = A.puede(u, "plantillas.editar") && A.esSuyo(u, po);
  const e = po.estudio, o = po.orden;
  const acc = (fn, ok) => { const r = mutar((dd) => fn(dd, yo(dd))); resultado(r, aviso, ok); return r; };
  return (
    <Sheet abierto onClose={onClose} titulo={`${po.folio} · ${A.nombrePac(d, po.pacienteId)}`} pie={ed && f.estado === "borrador" &&
      <div className="dos"><Button variante="sec" block onClick={() => setModo("cancelar")}>Cancelar</Button><Button block icon="send" onClick={() => acc((dd, uu) => A.enviarPlantillaLab(dd, po.id, uu), "Enviada al laboratorio")}>Enviar al laboratorio</Button></div>}>
      <div className="form">
        <Linea estado={f.estado} />
        {f.retrasada && <div className="card card-bad">El laboratorio no la ha entregado: se prometió para el {fechaCorta(f.prometida)}.</div>}
        {f.retrabajo && <div className="card card-warn">La orden {f.folioLab} está en retrabajo.</div>}
        <Card><Resumen filas={[["Podólogo", A.nombreCorto(d, po.podologoId)], ["Orden de laboratorio", f.folioLab || "Aún no se envía"], ["Modelo", `${o.modelo} · ${o.material} · ${A.COBERTURAS[o.cobertura] || ""}`], ["Pares", o.pares], ["Precio", dinero(f.precio)],
          ["Anticipo (50 %)", f.folioLab ? `${dinero(f.anticipoPagado)} pagado${f.anticipoPendiente ? ` · ${dinero(f.anticipoPendiente)} pendiente` : ""}` : dinero(f.anticipoRequerido)], ["Laboratorio", (d.laboratorios.find((l) => l.id === o.laboratorioId) || {}).nombre],
          f.enviada && ["Enviada", fechaCorta(f.enviada)], f.prometida && ["Entrega estimada", fechaCorta(f.prometida)], f.recibida && ["Recibida del laboratorio", fechaCorta(f.recibida)], f.entregada && ["Entregada al paciente", fechaCorta(f.entregada)],
          f.entregada && ["Garantía", f.enGarantia ? `Vigente hasta ${fechaCorta(f.garantiaHasta)}` : `Venció el ${fechaCorta(f.garantiaHasta)}`, true], f.entregada && ["Revisión de ajuste", `${fechaCorta(f.revisionAjuste)}${po.ajusteRevisado ? " · hecha" : ""}`], f.entregada && ["Renovación sugerida", fechaCorta(f.renovacionDesde)],
          po.motivoCancelacion && ["Cancelación", po.motivoCancelacion]]} /></Card>
        <Titulo>Estudio de pisada · {A.TIPOS_ESTUDIO[e.tipo]}</Titulo>
        <Resumen filas={[["Talla", e.tallaCalzado], ["Longitud izq./der.", `${e.longI || "—"} / ${e.longD || "—"} mm`], ["Ancho izq./der.", `${e.anchoI || "—"} / ${e.anchoD || "—"} mm`], ["Arco · retropié", `${e.tipoArco} · ${e.retropie}`], ["Dismetría", `${e.dismetriaMm || 0} mm`], e.pesoKg && ["Peso", `${e.pesoKg} kg`], e.actividad && ["Actividad", e.actividad], e.hallazgos && ["Hallazgos", e.hallazgos], o.correcciones && ["Correcciones", o.correcciones]]} />
        {f.estado !== "borrador" && f.estado !== "entregada" && <p className="mu peq">La recepción del laboratorio y la entrega con firma las hace Almacén en Más ▸ Entrega de plantillas; aquí el estado se actualiza solo.</p>}
        {(po.reclamos || []).length > 0 && <><Titulo>Reclamos de garantía</Titulo>{po.reclamos.map((r, i) => <div key={i} className="cl-nota">{r.texto}<small>{fechaCorta(r.fecha)} · {A.nombreCorto(d, r.por)}</small></div>)}</>}
        {ed && f.estado === "entregada" && <div className="dos">
          {!po.ajusteRevisado && <Button variante="sec" block icon="check" onClick={() => acc((dd, uu) => A.marcarAjusteRevisado(dd, po.id, uu), "Revisión de ajuste registrada")}>Ajuste revisado</Button>}
          <Button variante={f.enGarantia ? "primary" : "sec"} block disabled={!f.enGarantia} onClick={() => setModo("reclamo")}>{f.enGarantia ? "Reclamo de garantía" : "Garantía vencida"}</Button>
        </div>}
      </div>
      <Sheet abierto={modo === "reclamo"} onClose={() => setModo(null)} titulo="Reclamo de garantía" pie={<Button block onClick={() => { if (acc((dd, uu) => A.reclamarGarantia(dd, po.id, texto, uu), "Reclamo registrado").ok) { setTexto(""); setModo(null); } }}>Registrar</Button>}>
        <Field label="¿Qué falla?"><Area value={texto} onChange={(x) => setTexto(x.target.value)} /></Field>
      </Sheet>
      <Sheet abierto={modo === "cancelar"} onClose={() => setModo(null)} titulo="Cancelar plantilla" pie={<Button variante="danger" block onClick={() => { if (acc((dd, uu) => A.cancelarPlantillaOrto(dd, po.id, motivo, uu), "Plantilla cancelada").ok) setModo(null); }}>Cancelar plantilla</Button>}>
        <Field label="Motivo"><Area value={motivo} onChange={(x) => setMotivo(x.target.value)} /></Field>
      </Sheet>
    </Sheet>
  );
}
