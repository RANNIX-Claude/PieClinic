// Más ▸ Lotes de esterilización (porte de Pie Firme: Esterilizacion). P-023: lote = ciclo de autoclave con indicador químico y biológico.
// Químico no viró → rechazado · biológico pendiente → liberado condicionado · negativo → liberado · POSITIVO → BLOQUEADO con la lista
// de pacientes atendidos con kits del lote para avisarles. Kits con código QR en SVG propio (etiquetas imprimibles).
// Extiende d.sets / d.ciclos / d.usoSets con campos opcionales; la pantalla del asistente (Esterilización) sigue funcionando igual.
import { useMemo, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_clinica.js";
import { fechaCorta, hora, hoy } from "../../lib/format.js";
import { Area, Badge, BarraAccion, Button, Card, Chips, Field, Fila, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import Vista from "../../ui/vista.jsx";
import { FiltroSucursal, QrSvg, SinAcceso, resultado } from "../../componentes/clinica/comunes.jsx";

const yo = (dd) => dd.usuarios.find((x) => x.id === dd.sesion.userId);
const nomSuc = (d, id) => (d.sucursales.find((s) => s.id === id) || {}).nombre || id;

export default function EsterilizacionLotes() {
  const { d, u, sucursalId } = useSesion();
  const [tab, setTab] = useState("lotes");
  const [suc, setSuc] = useState("");
  const [sel, setSel] = useState(null);
  const [kit, setKit] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [etiquetas, setEtiquetas] = useState(false);
  const visibles = A.sucursalesVisibles(d, u);
  const lotes0 = useMemo(() => A.lotesVisibles(d, u), [d, u]);
  if (!A.puede(u, "lotes.ver")) return <SinAcceso>Los lotes de esterilización son del asistente clínico, el gerente y Administración.</SinAcceso>;
  const enSuc = (id) => (suc ? id === suc : true);
  const lotes = lotes0.filter((c) => enSuc(c.sucursalId)).map((c) => ({ ...c, est: A.estadoLote(c) })).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const bloqueados = lotes.filter((c) => c.est === "bloqueado");
  const kits = d.sets.filter((s) => visibles.includes(s.sucursalId) && enSuc(s.sucursalId));
  const pendientesAviso = bloqueados.reduce((a, c) => a + A.pacientesDeLote(d, c.id).filter((p) => !p.avisado).length, 0);
  const bioVencidos = lotes.filter((c) => A.biologicoVencido(c)).length;
  const operaAqui = sucursalId && sucursalId !== "CEN" && A.alcanza(d, u, sucursalId);
  return (
    <div className="form">
      <div className="kpis">
        <Kpi label="Lotes liberados" valor={lotes.filter((c) => c.est === "liberado").length} tono="ok" />
        <Kpi label="Liberado condicionado" valor={lotes.filter((c) => c.est === "liberado_condicionado").length} tono="warn" nota={bioVencidos ? `${bioVencidos} con biológico de más de 24 h` : "biológico pendiente"} />
        <Kpi label="BLOQUEADOS" valor={bloqueados.length} tono={bloqueados.length ? "bad" : undefined} />
        <Kpi label="Pacientes por avisar" valor={pendientesAviso} tono={pendientesAviso ? "bad" : undefined} />
      </div>
      {bloqueados.map((c) => <div key={c.id} className="cl-alerta" role="alert" onClick={() => setSel(c.id)}>Lote {c.lote} ({c.folio}, {nomSuc(d, c.sucursalId)}) BLOQUEADO: indicador biológico positivo. {A.pacientesDeLote(d, c.id).length} paciente(s) atendidos con sus kits. Toca para ver la lista.</div>)}
      <FiltroSucursal d={d} ids={visibles} valor={suc} onChange={setSuc} />
      <Chips scroll valor={tab} onChange={setTab} opciones={[{ v: "lotes", l: "Lotes", n: lotes.length }, { v: "kits", l: "Kits", n: kits.length }, { v: "usar", l: "Usar kit (QR)" }]} />
      {tab === "lotes" && <Vista id="clinica-lotes" items={lotes} onAbrir={(c) => setSel(c.id)} vacio="Sin lotes registrados."
        tarjeta={(c) => (
          <div className="form" style={{ gap: 6 }}>
            <div className="cl-entre"><b>Lote {c.lote}</b><Badge tono={A.TONO_LOTE[c.est]}>{A.ESTADOS_LOTE[c.est]}</Badge></div>
            <div className="mu peq">{c.folio} · {nomSuc(d, c.sucursalId)} · {c.autoclave} · {fechaCorta(c.fecha)} {hora(c.fecha)}</div>
            <div className="peq">{(c.sets || []).length} kit(s) · químico {A.QUIM_TXT[c.indicadorQuimico] || "—"} · biológico {A.BIO_TXT[c.indicadorBiologico] || c.indicadorBiologico}</div>
            {c.esterilHasta && <div className="mu peq">Estéril hasta {fechaCorta(c.esterilHasta)}</div>}
          </div>
        )}
        columnas={[{ k: "l", t: "Lote", v: (c) => c.lote }, { k: "f", t: "Ciclo", v: (c) => c.folio }, { k: "s", t: "Sucursal", v: (c) => nomSuc(d, c.sucursalId) }, { k: "fe", t: "Fecha", v: (c) => `${fechaCorta(c.fecha)} ${hora(c.fecha)}`, orden: (c) => c.fecha },
          { k: "t", t: "Ciclo", v: (c) => (A.CICLOS_AUTOCLAVE[c.tipoCiclo] || ["—"])[0] }, { k: "k", t: "Kits", v: (c) => (c.sets || []).length, der: true }, { k: "b", t: "Biológico", v: (c) => A.BIO_TXT[c.indicadorBiologico] || c.indicadorBiologico },
          { k: "e", t: "Estado", v: (c) => <Badge tono={A.TONO_LOTE[c.est]}>{A.ESTADOS_LOTE[c.est]}</Badge>, orden: (c) => c.est }]} />}
      {tab === "kits" && <>
        <div className="cl-entre"><span className="mu peq">Cada kit lleva su etiqueta con QR. Un kit usado queda sucio y necesita un nuevo ciclo.</span><Button variante="sec" className="btn-peq" icon="file" onClick={() => setEtiquetas(true)}>Imprimir etiquetas</Button></div>
        <Vista id="clinica-kits" items={kits.map((s) => ({ ...s, lote: A.loteDeKit(d, s.id) }))} onAbrir={(s) => setKit(s.id)} minTarjeta={260}
          tarjeta={(s) => { const ok = A.kitUsable(s, s.lote); return (
            <div className="cl-kit"><QrSvg texto={A.textoQrKit(s)} size={72} /><div><div className="cl-entre"><b>{s.nombre}</b><Badge tono={ok.ok ? "ok" : s.estado === "sucio" ? "warn" : "bad"}>{ok.ok ? "Listo" : s.estado === "sucio" ? "Sucio" : "No usable"}</Badge></div>
              <div className="mu peq">{A.codigoKit(s)} · {s.tipoKit || "Kit"} · {nomSuc(d, s.sucursalId)}</div><div className="peq">{s.lote ? `Lote ${s.lote.lote} · ${A.ESTADOS_LOTE[A.estadoLote(s.lote)]}` : "Sin lote"}</div></div></div>); }}
          columnas={[{ k: "c", t: "Código", v: (s) => A.codigoKit(s) }, { k: "n", t: "Kit", v: (s) => s.nombre }, { k: "t", t: "Tipo", v: (s) => s.tipoKit || "—" }, { k: "s", t: "Sucursal", v: (s) => nomSuc(d, s.sucursalId) }, { k: "e", t: "Estado", v: (s) => (s.estado === "sucio" ? "Sucio" : "Esterilizado") }, { k: "l", t: "Último lote", v: (s) => (s.lote ? s.lote.lote : "—") }]} />
        {A.puede(u, "lotes.operar") && operaAqui && <Button variante="sec" icon="plus" onClick={() => setKit("nuevo")}>Alta de kit</Button>}
      </>}
      {tab === "usar" && (operaAqui ? <UsarKit /> : <Vacio icon="building">Cambia a tu sucursal para registrar usos de kit.</Vacio>)}
      <div style={{ height: 70 }} />
      {A.puede(u, "lotes.operar") && operaAqui && <BarraAccion><Button block icon="sparkle" onClick={() => setNuevo(true)}>Registrar lote de autoclave</Button></BarraAccion>}
      {nuevo && <NuevoLote onClose={() => setNuevo(false)} />}
      {sel && <DetalleLote id={sel} onClose={() => setSel(null)} />}
      {kit && <EditarKit id={kit === "nuevo" ? null : kit} onClose={() => setKit(null)} />}
      {etiquetas && <Etiquetas kits={kits} onClose={() => setEtiquetas(false)} />}
    </div>
  );
}

function NuevoLote({ onClose }) {
  const { d, sucursalId } = useSesion();
  const kits = d.sets.filter((s) => s.sucursalId === sucursalId);
  const n = d.ciclos.filter((c) => c.sucursalId === sucursalId && c.fecha.slice(0, 10) === hoy()).length;
  const [f, setF] = useState({ lote: `L-${hoy().slice(5)}-${String.fromCharCode(65 + (n % 26))}`, autoclave: "AC-1", tipoCiclo: "instrumental_envuelto", temp: "", min: "", indicadorQuimico: "conforme", indicadorBiologico: "pendiente", sets: kits.filter((s) => s.estado === "sucio").map((s) => s.id) });
  const [err, setErr] = useState({});
  const est = A.estadoLote(f);
  const [, t0, p0, m0] = A.CICLOS_AUTOCLAVE[f.tipoCiclo];
  const alt = (id) => setF((x) => ({ ...x, sets: x.sets.includes(id) ? x.sets.filter((y) => y !== id) : [...x.sets, id] }));
  const guardar = () => {
    const r = mutar((dd) => A.registrarLote(dd, f, yo(dd), dd.sesion.sucursalId));
    if (!r.ok) { setErr(r.errores || {}); return aviso(r.error, "bad"); }
    aviso(`${r.ciclo.folio}: ${A.ESTADOS_LOTE[r.estado]}`, ["liberado", "liberado_condicionado"].includes(r.estado) ? "ok" : "warn"); onClose();
  };
  return (
    <Sheet abierto onClose={onClose} titulo="Registrar lote" pie={<Button block onClick={guardar}>Guardar lote · {A.ESTADOS_LOTE[est]}</Button>}>
      <div className="form">
        <div className="form2">
          <Field label="Número de lote" error={err.lote}><Input value={f.lote} onChange={(e) => setF({ ...f, lote: e.target.value })} /></Field>
          <Field label="Autoclave" error={err.autoclave}><Select value={f.autoclave} onChange={(e) => setF({ ...f, autoclave: e.target.value })}><option>AC-1</option><option>AC-2</option></Select></Field>
        </div>
        <Field label="Programa"><Select value={f.tipoCiclo} onChange={(e) => setF({ ...f, tipoCiclo: e.target.value })}>{Object.entries(A.CICLOS_AUTOCLAVE).map(([k, [l, t, p, m]]) => <option key={k} value={k}>{l} · {t} °C · {p} bar · {m} min</option>)}</Select></Field>
        <div className="form2">
          <Field label="Temperatura real (°C)" error={err.temp}><Input inputMode="decimal" value={f.temp} placeholder={String(t0)} onChange={(e) => setF({ ...f, temp: e.target.value })} /></Field>
          <Field label="Tiempo real (min)" error={err.min}><Input inputMode="numeric" value={f.min} placeholder={String(m0)} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <Field label="Indicador químico" error={err.indicadorQuimico}><Select value={f.indicadorQuimico} onChange={(e) => setF({ ...f, indicadorQuimico: e.target.value })}>{Object.entries(A.QUIM_TXT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Indicador biológico" error={err.indicadorBiologico}><Select value={f.indicadorBiologico} onChange={(e) => setF({ ...f, indicadorBiologico: e.target.value })}>{Object.entries(A.BIO_TXT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        </div>
        <p className="mu peq">Presión del programa: {p0} bar. Con biológico pendiente el lote sale «liberado condicionado» y se confirma a las 24 h.</p>
        <Titulo derecha={<Badge tono={A.TONO_LOTE[est]}>{A.ESTADOS_LOTE[est]}</Badge>}>Kits del lote</Titulo>
        {err.sets && <div className="card card-bad">{err.sets}</div>}
        <div className="lista">{kits.map((s) => <Fila key={s.id} titulo={`${s.nombre} · ${A.codigoKit(s)}`} sub={s.estado === "sucio" ? "Sucio" : "Esterilizado (se re-esteriliza)"} badge={<Badge tono={f.sets.includes(s.id) ? "ok" : "neutral"}>{f.sets.includes(s.id) ? "Incluido" : "Fuera"}</Badge>} onClick={() => alt(s.id)} />)}</div>
      </div>
    </Sheet>
  );
}

function DetalleLote({ id, onClose }) {
  const { d, u } = useSesion();
  const c = d.ciclos.find((x) => x.id === id);
  const [aviso_, setAviso] = useState(null);
  const [nota, setNota] = useState("");
  const [canal, setCanal] = useState("telefono");
  if (!c) return null;
  const est = A.estadoLote(c);
  const pacs = A.pacientesDeLote(d, c.id);
  const opera = A.puede(u, "lotes.operar") && A.alcanza(d, u, c.sucursalId);
  const bio = (r) => { const x = mutar((dd) => A.registrarBiologico(dd, c.id, r, yo(dd))); if (resultado(x, aviso)) aviso(r === "no_conforme" ? `Lote BLOQUEADO · ${x.pacientes.length} paciente(s) por avisar` : "Lote liberado", r === "no_conforme" ? "warn" : "ok"); };
  return (
    <Sheet abierto onClose={onClose} titulo={`Lote ${c.lote}`}>
      <div className="form">
        <div className="cl-entre"><b>{c.folio} · {nomSuc(d, c.sucursalId)}</b><Badge tono={A.TONO_LOTE[est]}>{A.ESTADOS_LOTE[est]}</Badge></div>
        {est === "bloqueado" && <div className="cl-alerta">{c.notaBloqueo || "Indicador biológico positivo."} Avisa a cada paciente y registra el aviso.</div>}
        <Resumen filas={[["Fecha", `${fechaCorta(c.fecha)} ${hora(c.fecha)}`], ["Autoclave", c.autoclave], ["Programa", (A.CICLOS_AUTOCLAVE[c.tipoCiclo] || ["—"])[0]], c.temp && ["Parámetros", `${c.temp} °C · ${c.presion || "—"} bar · ${c.min || "—"} min`],
          ["Indicador químico", A.QUIM_TXT[c.indicadorQuimico] || "—"], ["Indicador biológico", A.BIO_TXT[c.indicadorBiologico] || c.indicadorBiologico], ["Responsable", A.nombreCorto(d, c.responsableId)], c.esterilHasta && ["Estéril hasta", fechaCorta(c.esterilHasta)], c.falla && ["Falla", c.falla.motivo]]} />
        {opera && c.indicadorBiologico === "pendiente" && <>
          {A.biologicoVencido(c) && <div className="card card-warn">Pasaron más de 24 h: registra el resultado del biológico.</div>}
          <div className="dos"><Button variante="ok" block onClick={() => bio("conforme")}>Biológico negativo</Button><Button variante="danger" block onClick={() => bio("no_conforme")}>Positivo: bloquear</Button></div>
        </>}
        <Titulo>Kits</Titulo>
        <div className="cl-fila-h">{(c.sets || []).map((s) => <Badge key={s}>{A.codigoKit(d.sets.find((x) => x.id === s))}</Badge>)}</div>
        <Titulo derecha={<span className="peq mu">{pacs.filter((p) => p.avisado).length}/{pacs.length} avisados</span>}>Pacientes atendidos con este lote</Titulo>
        <div className="lista">{pacs.map((p) => (
          <Fila key={p.pacienteId} titulo={p.nombre} sub={p.usos.map((x) => `${fechaCorta(x.fecha)} ${hora(x.fecha)} · ${x.kit}`).join(" · ")} datos={p.telefono}
            badge={est === "bloqueado" ? <Badge tono={p.avisado ? "ok" : "bad"}>{p.avisado ? "Avisado" : "Por avisar"}</Badge> : null}
            derecha={est === "bloqueado" && opera && !p.avisado ? <Button className="btn-peq" onClick={() => setAviso(p)}>Avisar</Button> : null} />
        ))}{!pacs.length && <Vacio icon="users">Ningún paciente se atendió con kits de este lote.</Vacio>}</div>
        {(c.avisos || []).length > 0 && <><Titulo>Avisos registrados</Titulo>{c.avisos.map((a, i) => <div key={i} className="cl-nota">{A.nombrePac(d, a.pacienteId)} · {A.CANALES_CONTACTO[a.canal] || a.canal}{a.nota ? `: ${a.nota}` : ""}<small>{fechaCorta(a.fecha)} {hora(a.fecha)} · {A.nombreCorto(d, a.por)}</small></div>)}</>}
      </div>
      <Sheet abierto={!!aviso_} onClose={() => setAviso(null)} titulo={aviso_ ? `Avisar a ${aviso_.nombre}` : ""} pie={<Button block onClick={() => { const r = mutar((dd) => A.avisarPacienteLote(dd, c.id, aviso_.pacienteId, { canal, nota }, yo(dd))); if (resultado(r, aviso, "Aviso registrado")) { setAviso(null); setNota(""); } }}>Registrar aviso</Button>}>
        {aviso_ && <div className="form">
          <div className="cl-fila-h">
            {A.ligaTel(aviso_.telefono) && <a className="btn btn-sec" href={A.ligaTel(aviso_.telefono)}>Llamar</a>}
            {aviso_.whatsapp && A.ligaWhatsApp(aviso_.telefono) && <a className="btn btn-sec" target="_blank" rel="noreferrer" href={A.ligaWhatsApp(aviso_.telefono, `Hola ${aviso_.nombre.split(" ")[0]}, te llamamos de Pie Clinic por un tema de tu atención reciente. ¿Podemos platicar?`)}>WhatsApp</a>}
          </div>
          <p className="cl-sim">El contacto es manual: el sistema solo abre la llamada o WhatsApp en tu teléfono; no envía mensajes.</p>
          <Field label="Canal"><Select value={canal} onChange={(e) => setCanal(e.target.value)}>{Object.entries(A.CANALES_CONTACTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Nota"><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se le dijo y qué se acordó" /></Field>
        </div>}
      </Sheet>
    </Sheet>
  );
}

function UsarKit() {
  const { d, sucursalId } = useSesion();
  const [texto, setTexto] = useState("");
  const [citaId, setCitaId] = useState("");
  const citas = d.citas.filter((c) => c.sucursalId === sucursalId && c.inicio.slice(0, 10) === hoy() && !["cancelada", "no_asistio"].includes(c.estado)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const kit = A.kitDeTexto(d, texto);
  const ok = kit ? A.kitUsable(kit, A.loteDeKit(d, kit.id)) : null;
  const usar = () => { const r = mutar((dd) => A.usarKit(dd, { texto, citaId }, yo(dd))); if (resultado(r, aviso, `${A.codigoKit(r.kit || {})} registrado: queda sucio`)) { setTexto(""); setCitaId(""); } };
  return (
    <div className="form">
      <Field label="Código del kit" hint="Escanea la etiqueta con el lector o escribe el código (KIT-S1-02)."><Input value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" /></Field>
      {/* INTEGRACIÓN: lectura de QR con la cámara (BarcodeDetector). Hoy el código se teclea o lo escribe un lector USB. */}
      <p className="cl-sim">Simulación de demostración: la lectura con cámara se conecta en producción; aquí se escribe el código o se usa un lector de códigos.</p>
      {kit && <Card tono={ok.ok ? "ok" : "bad"}><div className="cl-kit"><QrSvg texto={A.textoQrKit(kit)} size={64} /><div><b>{kit.nombre} · {A.codigoKit(kit)}</b><div className="peq">{ok.ok ? "Kit esterilizado y lote usable." : ok.motivo}</div></div></div></Card>}
      {texto && !kit && <div className="card card-warn">No se reconoce el código.</div>}
      <Field label="Paciente (cita de hoy)"><Select value={citaId} onChange={(e) => setCitaId(e.target.value)}><option value="">Elegir…</option>{citas.map((c) => <option key={c.id} value={c.id}>{hora(c.inicio)} · {A.nombrePac(d, c.pacienteId)} · {c.consultorioId}</option>)}</Select></Field>
      <Button block icon="check" disabled={!kit || !ok.ok || !citaId} onClick={usar}>Registrar uso del kit</Button>
    </div>
  );
}

function EditarKit({ id, onClose }) {
  const { d, u, sucursalId } = useSesion();
  const s = id ? d.sets.find((x) => x.id === id) : null;
  const [f, setF] = useState({ id, nombre: s ? s.nombre : "", tipoKit: (s && s.tipoKit) || "Quiropodia", contenido: s && s.contenido ? s.contenido.join("\n") : "" });
  const lote = s ? A.loteDeKit(d, s.id) : null;
  const usos = s ? (d.usoSets || []).filter((x) => x.setId === s.id).slice(-8).reverse() : [];
  const puede = A.puede(u, "lotes.operar") && (!s || A.alcanza(d, u, s.sucursalId));
  const guardar = () => { const r = mutar((dd) => A.guardarKit(dd, f, yo(dd), s ? s.sucursalId : sucursalId)); if (resultado(r, aviso, "Kit guardado")) onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo={s ? `${s.nombre} · ${A.codigoKit(s)}` : "Alta de kit"} pie={puede && <Button block onClick={guardar}>Guardar kit</Button>}>
      <div className="form">
        {s && <div className="cl-kit"><QrSvg texto={A.textoQrKit(s)} size={120} /><div><Badge tono={A.kitUsable(s, lote).ok ? "ok" : "warn"}>{A.kitUsable(s, lote).ok ? "Listo para usar" : A.kitUsable(s, lote).motivo}</Badge><div className="peq mu">{lote ? `Último lote ${lote.lote} (${A.ESTADOS_LOTE[A.estadoLote(lote)]})` : "Sin lote"}</div></div></div>}
        <Field label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} disabled={!puede} /></Field>
        <Field label="Tipo"><Select value={f.tipoKit} onChange={(e) => setF({ ...f, tipoKit: e.target.value })} disabled={!puede}>{["Quiropodia", "Uña encarnada", "Fresado", "Curación", "Cirugía menor"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <Field label="Instrumental (uno por renglón)"><Area rows={6} value={f.contenido} onChange={(e) => setF({ ...f, contenido: e.target.value })} disabled={!puede} /></Field>
        {s && <><Titulo>Últimos usos</Titulo><div className="lista">{usos.map((x) => <Fila key={x.id} titulo={A.nombrePac(d, x.pacienteId)} sub={`Lote ${(d.ciclos.find((c) => c.id === x.cicloId) || {}).lote || "—"} · ${x.consultorio}`} datos={`${fechaCorta(x.fecha)} ${hora(x.fecha)}`} />)}{!usos.length && <Vacio>Sin usos.</Vacio>}</div></>}
      </div>
    </Sheet>
  );
}

function Etiquetas({ kits, onClose }) {
  return (
    <Sheet abierto onClose={onClose} titulo="Etiquetas de kits" pie={<Button block icon="file" onClick={() => { document.body.classList.add("cl-imprimiendo"); const fin = () => { document.body.classList.remove("cl-imprimiendo"); removeEventListener("afterprint", fin); }; addEventListener("afterprint", fin); window.print(); setTimeout(fin, 1500); }}>Imprimir</Button>}>
      <div className="cl-imprimible">
        <div className="cl-etiquetas">{kits.map((s) => <div key={s.id} className="cl-etiqueta"><QrSvg texto={A.textoQrKit(s)} size={110} /><b>{A.codigoKit(s)}</b><small>{s.nombre} · {s.tipoKit || "Kit"}</small><small>{(s.contenido || []).length} piezas</small></div>)}</div>
      </div>
    </Sheet>
  );
}
