// Fotos clínicas y evolución (porte de Pie Firme: SubirFotoClinica.jsx + CompararFotos.jsx).
// Máx. 10 por sesión con confirmación (P-007), «retirada» en vez de borrar (P-008), docencia solo con autorización
// vigente y difuminado (P-009). Las imágenes se guardan como miniatura con reducirImagen (límite del navegador).
import { useMemo, useRef, useState } from "react";
import { mutar } from "../../store/core.js";
import * as A from "../../store/acciones_expediente.js";
import { reducirImagen } from "../../ui/vista.jsx";
import { Badge, Button, Chips, Field, Input, Select, Sheet, Vacio, Confirmar, aviso } from "../../ui/index.jsx";
import { fechaLarga, hora, dia, hoy } from "../../lib/format.js";
import { Aviso, Seccion, FotoDemo } from "./comunes.jsx";

const LADO_DEMO = 480; // en producción ≤ 2048 px en almacenamiento privado (P-007); aquí miniatura por el límite de localStorage
const run = (fn, ok) => { const r = mutar((x) => fn(x)); if (r.ok) aviso(ok, "ok"); else aviso(r.error, "bad"); return r; };

export default function PanelFotos({ d, u, p, inicial = "sesiones" }) {
  const [sec, setSec] = useState(inicial);
  const [verRetiradas, setVerRetiradas] = useState(false);
  if (!A.puedeVerFotos(u)) return <Aviso tono="bad">Las fotos clínicas solo las ven Podología y Administración.</Aviso>;
  const fotos = A.fotosVisibles(d, u, p.id, { incluirRetiradas: verRetiradas });
  const docencia = A.docenciaVigente(d, p.id);
  const autClin = A.firmadoVigente(d, p.id, "autorizacion_fotos_clinicas");
  return (
    <div>
      <div className="exp-fotos-est">
        <Badge tono={autClin ? "ok" : "warn"}>{autClin ? "Autorización clínica firmada" : "Sin autorización de fotos clínicas"}</Badge>
        <Badge tono={docencia ? "ok" : "neutral"}>{docencia ? "Docencia autorizada" : "Sin autorización de docencia"}</Badge>
        {A.esAdministracion(u) && <label className="exp-check"><input type="checkbox" checked={verRetiradas} onChange={(e) => setVerRetiradas(e.target.checked)} /> Ver retiradas</label>}
      </div>
      <Chips opciones={[{ v: "sesiones", l: `Sesiones (${fotos.filter((f) => !f.retirada).length})` }, { v: "comparar", l: "Comparar antes / después" }, { v: "subir", l: "Subir fotos" }]} valor={sec} onChange={setSec} scroll />
      {sec === "sesiones" && <Sesiones d={d} u={u} fotos={fotos} />}
      {sec === "comparar" && <Comparar fotos={fotos.filter((f) => !f.retirada)} />}
      {sec === "subir" && <Subir d={d} u={u} p={p} autClin={!!autClin} docencia={docencia} onListo={() => setSec("sesiones")} />}
    </div>
  );
}

function Sesiones({ d, u, fotos }) {
  const [sel, setSel] = useState(null);
  const [motivo, setMotivo] = useState("");
  const sesiones = A.sesionesFotos(fotos);
  const f = sel ? fotos.find((x) => x.id === sel) : null;
  const nombre = (id) => d.usuarios.find((x) => x.id === id)?.nombre ?? "—";
  if (!sesiones.length) return <Vacio icon="image">Sin fotos clínicas.</Vacio>;
  return (
    <div>
      {sesiones.map((s) => {
        const activas = s.fotos.filter((x) => !x.retirada).length;
        return (
          <Seccion key={s.clave} titulo={`${fechaLarga(s.fecha)}${s.consultaId ? " · consulta" : ""}`} derecha={<Badge tono={activas >= A.MAX_FOTOS_SESION ? "warn" : "neutral"}>{activas}/{A.MAX_FOTOS_SESION}</Badge>}>
            <div className="exp-galeria">
              {s.fotos.map((x) => (
                <button key={x.id} type="button" className={`exp-foto${x.retirada ? " retirada" : ""}`} onClick={() => setSel(x.id)}>
                  <FotoDemo foto={x} alto={96} />
                  <span>{A.etiquetaDe(A.MOMENTOS_FOTO, x.momento)} · {x.pie}/{A.etiquetaDe(A.VISTAS_FOTO, x.vista)}</span>
                  {x.nivel === "docencia" && <i className="exp-foto-tag">Docencia</i>}
                  {x.retirada && <i className="exp-foto-tag bad">Retirada</i>}
                </button>
              ))}
            </div>
          </Seccion>
        );
      })}
      <Sheet abierto={!!f} onClose={() => { setSel(null); setMotivo(""); }} titulo={f ? `${A.etiquetaDe(A.MOMENTOS_FOTO, f.momento)} · pie ${f.pie === "D" ? "derecho" : "izquierdo"}` : ""}>
        {f && <>
          <FotoDemo foto={f} alto={240} />
          <p>{f.comentario || "Sin comentario."}</p>
          <p className="mu peq">{fechaLarga(f.tomada)} {hora(f.tomada)} · {nombre(f.subidaPor)} · vista {A.etiquetaDe(A.VISTAS_FOTO, f.vista)}{f.zona ? ` · ${A.nombreZona(f.zona)}` : ""} · nivel {A.etiquetaDe(A.NIVELES_AUTORIZACION, f.nivel)}{f.difuminada ? " (difuminada)" : ""}</p>
          {f.retirada ? (
            <>
              <Aviso tono="bad">Retirada el {fechaLarga(f.retirada.fecha)} por {nombre(f.retirada.porId)}: {f.retirada.motivo}. No se borra (P-008).</Aviso>
              {A.esAdministracion(u) && <Button variante="sec" block onClick={() => run((x) => A.restaurarFoto(x, f.id, u), "Foto restaurada")}>Restaurar</Button>}
            </>
          ) : (
            <>
              {f.nivel === "clinico"
                ? <Button variante="sec" block onClick={() => run((x) => A.cambiarNivelFoto(x, f.id, "docencia", u, { difuminada: true }), "Marcada para docencia (difuminada)")}>Usar en docencia (con difuminado)</Button>
                : <Button variante="sec" block onClick={() => run((x) => A.cambiarNivelFoto(x, f.id, "clinico", u), "Regresada a nivel clínico")}>Regresar a solo expediente</Button>}
              <Field label="Motivo para retirar" hint="La foto nunca se borra: deja de mostrarse salvo a Administración."><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
              <Button variante="danger" block onClick={() => { if (run((x) => A.retirarFoto(x, f.id, motivo, u), "Foto retirada").ok) { setSel(null); setMotivo(""); } }}>Retirar foto</Button>
            </>
          )}
        </>}
      </Sheet>
    </div>
  );
}

/** Tres columnas: antes · después 1 · después 2 (P-007 a P-009: solo fotos visibles para el usuario). */
function Comparar({ fotos }) {
  const [pie, setPie] = useState("");
  const [vista, setVista] = useState("");
  const l = fotos.filter((f) => (!pie || f.pie === pie) && (!vista || f.vista === vista));
  const par = A.parComparacion(l);
  const [sel, setSel] = useState([null, null, null]);
  const ids = [sel[0] ?? par?.[0]?.id ?? null, sel[1] ?? par?.[1]?.id ?? null, sel[2]];
  const [mezcla, setMezcla] = useState(50);
  const fa = l.find((f) => f.id === ids[0]), fb = l.find((f) => f.id === ids[1]);
  if (fotos.length < 2) return <Vacio icon="image">Se necesitan al menos dos fotos para comparar.</Vacio>;
  return (
    <div>
      <div className="form2">
        <Field label="Pie"><Select value={pie} onChange={(e) => { setPie(e.target.value); setSel([null, null, null]); }}><option value="">Ambos</option><option value="D">Derecho</option><option value="I">Izquierdo</option></Select></Field>
        <Field label="Vista"><Select value={vista} onChange={(e) => { setVista(e.target.value); setSel([null, null, null]); }}><option value="">Todas</option>{A.VISTAS_FOTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Select></Field>
      </div>
      <div className="exp-comparar">
        {["Antes", "Después 1", "Después 2"].map((t, i) => {
          const f = l.find((x) => x.id === ids[i]);
          return (
            <div key={t} className="exp-comp-col">
              <b>{t}</b>
              <Select value={ids[i] || ""} onChange={(e) => setSel((s) => s.map((v, k) => (k === i ? e.target.value || null : v)))}>
                <option value="">—</option>{l.map((x) => <option key={x.id} value={x.id}>{dia(x.tomada)} · {A.etiquetaDe(A.MOMENTOS_FOTO, x.momento)} · {x.pie}/{x.vista}</option>)}
              </Select>
              {f ? <><FotoDemo foto={f} alto={150} /><span className="mu peq">{fechaLarga(f.tomada)}</span></> : <div className="exp-comp-vacio">Elige una foto</div>}
            </div>
          );
        })}
      </div>
      {fa && fb && (
        <Seccion titulo="Superposición antes / después">
          <div className="exp-superpone">
            <div className="exp-sup-capa"><FotoDemo foto={fa} alto={220} /></div>
            <div className="exp-sup-capa" style={{ opacity: mezcla / 100 }}><FotoDemo foto={fb} alto={220} /></div>
          </div>
          <input type="range" min="0" max="100" value={mezcla} onChange={(e) => setMezcla(Number(e.target.value))} aria-label="Mezcla antes/después" style={{ width: "100%" }} />
        </Seccion>
      )}
    </div>
  );
}

function Subir({ d, u, p, autClin, docencia, onListo }) {
  const consultas = A.consultasPaciente(d, p.id).filter((c) => !A.esAdministracion(u) ? c.podologoId === u.id : true).slice(0, 6);
  const deHoy = consultas.find((c) => dia(c.fecha) === hoy());
  const [f, setF] = useState({ consultaId: deHoy?.id || "", pie: "D", vista: "dorsal", zona: "", momento: "antes", nivel: "clinico", difuminada: false, comentario: "" });
  const [cola, setCola] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const ref = useRef(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const clave = A.claveSesion({ consultaId: f.consultaId || null, pacienteId: p.id, tomada: f.consultaId ? null : `${hoy()}T00:00` });
  const enSesion = useMemo(() => A.fotosDeSesion(d.exp?.fotos, f.consultaId ? f.consultaId : `${p.id}|${hoy()}`).length, [d, f.consultaId, p.id, clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const elegir = async (files) => {
    setOcupado(true);
    try { const l = []; for (const file of [...files].slice(0, 12)) l.push(await reducirImagen(file, LADO_DEMO, 0.72)); setCola((c) => [...c, ...l]); }
    catch (e) { aviso(e.message, "bad"); }
    setOcupado(false);
  };
  const guardar = (exceso = false) => {
    let n = 0;
    for (let i = 0; i < cola.length; i++) {
      const r = mutar((x) => A.subirFoto(x, { ...f, pacienteId: p.id, consultaId: f.consultaId || null, data: cola[i], tomada: f.consultaId ? d.consultas.find((c) => c.id === f.consultaId)?.fecha : undefined }, u, { confirmarExceso: exceso }));
      if (!r.ok) { setCola((c) => c.slice(n)); if (r.requiereConfirmar) setConfirmar(r.error); else aviso(r.error, "bad"); if (n) aviso(`${n} foto(s) guardada(s)`, "ok"); return; }
      n++;
    }
    setCola([]); aviso(`${n} foto(s) guardada(s)`, "ok"); onListo();
  };
  if (!A.puedeSubirFotos(u)) return <Aviso tono="bad">Tu rol no sube fotos clínicas.</Aviso>;
  return (
    <div>
      {!autClin && <Aviso tono="warn">El paciente no tiene firmada la autorización de fotografías clínicas: fírmala en la pestaña «Documentos» antes de tomar fotos.</Aviso>}
      <div className="form2">
        <Field label="Sesión (consulta)"><Select value={f.consultaId} onChange={(e) => set("consultaId", e.target.value)}><option value="">Sin consulta (hoy)</option>{consultas.map((c) => <option key={c.id} value={c.id}>{fechaLarga(c.fecha)} · {A.ETIQUETA_NOTA[A.estadoNota(c)]}</option>)}</Select></Field>
        <Field label="Momento"><Select value={f.momento} onChange={(e) => set("momento", e.target.value)}>{A.MOMENTOS_FOTO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Pie"><Select value={f.pie} onChange={(e) => set("pie", e.target.value)}><option value="D">Derecho</option><option value="I">Izquierdo</option></Select></Field>
        <Field label="Vista"><Select value={f.vista} onChange={(e) => set("vista", e.target.value)}>{A.VISTAS_FOTO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Zona (opcional)"><Select value={f.zona} onChange={(e) => set("zona", e.target.value)}><option value="">—</option>{A.zonasDeVista(f.vista === "plantar" ? "plantar" : "dorsal").map((z) => <option key={z.codigo} value={z.codigo}>{z.nombre}</option>)}</Select></Field>
        <Field label="Nivel de autorización"><Select value={f.nivel} onChange={(e) => set("nivel", e.target.value)}><option value="clinico">Solo expediente clínico</option><option value="docencia" disabled={!docencia}>Docencia / difusión{docencia ? "" : " (sin autorización)"}</option></Select></Field>
      </div>
      {f.nivel === "docencia" && <label className="exp-check"><input type="checkbox" checked={f.difuminada} onChange={(e) => set("difuminada", e.target.checked)} /> Rostro e identificadores difuminados (obligatorio, P-009)</label>}
      <Field label="Comentario"><Input value={f.comentario} onChange={(e) => set("comentario", e.target.value)} /></Field>
      <p className="mu peq">Esta sesión tiene {enSesion} de {A.MAX_FOTOS_SESION} fotos. La 11.ª pide confirmación (P-007).</p>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { elegir(e.target.files); e.target.value = ""; }} />
      <div className="dos">
        <Button variante="sec" block icon="camera" loading={ocupado} onClick={() => ref.current?.click()}>Tomar o elegir</Button>
        <Button block disabled={!cola.length} onClick={() => guardar(false)}>Guardar {cola.length || ""}</Button>
      </div>
      {cola.length > 0 && <div className="exp-galeria">{cola.map((src, i) => <button key={i} type="button" className="exp-foto" onClick={() => setCola((c) => c.filter((_, k) => k !== i))}><img src={src} alt="" className="exp-foto-img" style={{ height: 96 }} /><span>Quitar</span></button>)}</div>}
      <Confirmar abierto={!!confirmar} titulo="Límite de fotos de la sesión" texto={confirmar} confirmar="Agregar de todos modos" onNo={() => setConfirmar(null)} onSi={() => { setConfirmar(null); guardar(true); }} />
    </div>
  );
}
