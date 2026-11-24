// Auditoría de inventario a distancia: el colaborador (o la cámara de seguridad) aporta fotos, la IA estima lo que hay,
// se compara contra el sistema y las diferencias generan alerta con evidencia (foto, fecha/hora, usuario, sucursal).
import { useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as C from "../../store/acciones_comercial.js";
import { MOTIVOS_INV } from "../../store/acciones_almacen.js";
import { Badge, Button, Chips, Sheet, Field, Input, Select, Area, Icon, Kpi, Vacio, Pasos, BarraAccion, Buscador, Titulo, aviso } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { dinero, fechaCorta, hora, dia, hoy, normaliza } from "../../lib/format.js";
import "../../estilos_comercial.css";

const LADO_FOTO = 640, CALIDAD_FOTO = 0.45; // miniaturas: el estado vive en localStorage (~5 MB)
const nombreCorto = (d, id) => R.nombreUsuario(d, id).replace(/ \(.*\)/, "");

export default function AuditoriaFoto() {
  const { d, u, sucursalId } = useSesion();
  const permitido = C.ROLES_AUDITORIA.includes(u.rol) && !(u.rol === "almacen" && u.almacenCentral);
  const [tab, setTab] = useState("cumplimiento");
  const [preSuc, setPreSuc] = useState(null);
  if (!permitido) return <Vacio icon="lock">Tu rol no usa la auditoría de inventario a distancia.</Vacio>;
  const abiertas = C.auditoriasVisibles(d, u).filter((a) => ["con_alertas", "en_investigacion"].includes(C.estadoAuditoria(d, a))).length;
  return (
    <>
      <div className="cm-aviso cm-aviso-info"><Icon name="camera" size={16} /><span>Auditoría a distancia: se suben fotos de los principales productos (o capturas de la cámara de seguridad) y se compara con el inventario del sistema. Sirve para detectar faltantes y saber <b>cuándo</b> empezaron.</span></div>
      <Chips scroll valor={tab} onChange={setTab} opciones={[{ v: "cumplimiento", l: "Cumplimiento" }, { v: "nueva", l: "Nueva auditoría" }, { v: "historial", l: "Historial" }, { v: "alertas", l: "Alertas", n: abiertas }]} />
      {tab === "cumplimiento" && <Cumplimiento d={d} u={u} onAuditar={(s) => { setPreSuc(s); setTab("nueva"); }} />}
      {tab === "nueva" && <Nueva d={d} u={u} sucursalId={preSuc || sucursalId} onListo={() => { setPreSuc(null); setTab("historial"); }} />}
      {tab === "historial" && <Historial d={d} u={u} />}
      {tab === "alertas" && <Alertas d={d} u={u} />}
    </>
  );
}

const sucursalesDe = (d, u) => d.sucursales.filter((s) => C.esCentral(u) || u.sucursales.includes(s.id));

// ───────────────────────── Panel de cumplimiento
function Cumplimiento({ d, u, onAuditar }) {
  const cfg = C.cfg(d);
  const [dias, setDias] = useState(cfg.auditoriaDiasMax);
  const filas = C.cumplimientoAuditoria(d, sucursalesDe(d, u).map((s) => s.id), hoy(), dias);
  const tarde = filas.filter((f) => f.estado !== "al_dia");
  return (
    <>
      <div className="kpis">
        <Kpi label="Sucursales al día" valor={`${filas.length - tarde.length}/${filas.length}`} tono={tarde.length ? "warn" : "ok"} nota={`auditadas en los últimos ${dias} días`} />
        <Kpi label="Sin auditar" valor={tarde.length} tono={tarde.length ? "bad" : "ok"} nota={`más de ${dias} días`} />
        <Kpi label="Con alertas abiertas" valor={filas.reduce((a, f) => a + f.conAlertas, 0)} tono={filas.some((f) => f.conAlertas) ? "bad" : "ok"} />
        <Kpi label="Fotos guardadas" valor={`${C.totalFotos(d)}/${cfg.maxFotos}`} nota="se descartan las más viejas" />
      </div>
      <div className="cm-barra"><span className="mu peq">Marcar como atrasada una sucursal sin auditoría en</span>
        <div style={{ width: 120 }}><Select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Días sin auditar">{[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} días</option>)}</Select></div></div>
      <div className="cm-cumple">
        {filas.map((f) => (
          <div key={f.sucursalId} className="fila">
            <div className="fila-c">
              <div className="fila-t"><span>{f.nombre}</span><Badge tono={f.estado === "al_dia" ? "ok" : "bad"}>{f.estado === "nunca" ? "Nunca" : f.estado === "al_dia" ? "Al día" : "Atrasada"}</Badge></div>
              <div className="fila-s">{f.ultima ? `Última: ${fechaCorta(f.ultima)} ${hora(f.ultima)} · hace ${f.dias} día${f.dias === 1 ? "" : "s"}` : "Sin auditorías registradas"}</div>
              <div className="fila-d">{f.conAlertas > 0 && <span style={{ color: "var(--er)", fontWeight: 700 }}>{f.conAlertas} con alertas</span>}<button className="chip" style={{ minHeight: 32 }} onClick={() => onAuditar(f.sucursalId)}>Auditar ahora</button></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ───────────────────────── Nueva auditoría (4 pasos)
function Nueva({ d, u, sucursalId: sucIni, onListo }) {
  const sucs = sucursalesDe(d, u);
  const [paso, setPaso] = useState(0);
  const [suc, setSuc] = useState(sucs.some((s) => s.id === sucIni) ? sucIni : sucs[0]?.id);
  const [zona, setZona] = useState(C.ZONAS_DEFECTO[0]);
  const [origen, setOrigen] = useState("colaborador");
  const [camara, setCamara] = useState("");
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [fotos, setFotos] = useState([]);
  const [est, setEst] = useState(null); // { id: texto }
  const [ia, setIa] = useState(null);
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const inp = useRef(null);

  const prods = useMemo(() => C.catalogoTienda(d).map((p) => ({ p, stock: R.stock(d, suc, p.id) })).sort((a, b) => b.stock * b.p.costo - a.stock * a.p.costo), [d, suc]);
  const elegidos = sel || prods.filter((x) => x.stock > 0).slice(0, 6).map((x) => x.p.id); // «los principales»: más valor en existencia
  const visibles = prods.filter((x) => !q.trim() || normaliza(x.p.nombre).includes(normaliza(q)));
  const pct = C.cfg(d).toleranciaPct;
  const stockMap = Object.fromEntries(prods.map((x) => [x.p.id, x.stock]));

  const alternar = (id) => setSel(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);
  const subir = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 3 - fotos.length);
    e.target.value = "";
    try { const m = []; for (const f of files) m.push(await reducirImagen(f, LADO_FOTO, CALIDAD_FOTO)); setFotos([...fotos, ...m].slice(0, 3)); setIa(null); setEst(null); }
    catch (x) { aviso(x.message || "No se pudo leer la foto.", "bad"); }
  };
  const estimar = () => {
    // INTEGRACIÓN: aquí se llamaría al servicio de visión; en demo es una simulación determinista (estimarConteoConIA).
    const r = C.estimarConteoConIA(fotos[0], elegidos, { stock: stockMap, sucursalId: suc, fecha: hoy() });
    setIa(r); setEst(Object.fromEntries(r.map((x) => [x.productoId, String(x.estimado)])));
  };
  const filasCmp = ia ? ia.map((x) => { const v = est && est[x.productoId] !== "" && est[x.productoId] !== undefined ? Number(est[x.productoId]) : NaN; return { ...x, sistema: stockMap[x.productoId], val: v, cmp: Number.isInteger(v) && v >= 0 ? C.compararItem(stockMap[x.productoId], v, pct) : null }; }) : [];
  const nDif = filasCmp.filter((x) => x.cmp && x.cmp.estado === "diferencia").length;

  const puedeSig = paso === 0 ? !!suc && (origen !== "camara" || camara.trim()) : paso === 1 ? elegidos.length > 0 : paso === 2 ? fotos.length > 0 : false;
  const guardar = () => {
    setCargando(true);
    const r = mutar((s) => C.registrarAuditoria(s, { sucursalId: suc, zona, origen, camaraRef: camara, productoIds: elegidos, fotos, estimados: est, nota }));
    setCargando(false);
    if (!r.ok) { aviso(r.error, "bad"); return; }
    aviso(r.diferencias ? `Auditoría guardada: ${r.diferencias} diferencia(s) con alerta` : "Auditoría guardada: todo conforme", r.diferencias ? "warn" : "ok");
    onListo();
  };

  return (
    <>
      <Pasos titulos={["Sucursal y origen", "Productos a revisar", "Fotos", "Estimación y comparación"]} paso={paso} />
      {paso === 0 && (
        <div className="form">
          <Field label="Sucursal"><Select value={suc} onChange={(e) => { setSuc(e.target.value); setSel(null); setIa(null); }}>{sucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></Field>
          <Field label="Anaquel o zona"><Select value={zona} onChange={(e) => setZona(e.target.value)}>{C.ZONAS_DEFECTO.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          <Field label="Origen de la imagen"><Chips valor={origen} onChange={setOrigen} opciones={Object.entries(C.ORIGENES_AUDITORIA).map(([v, l]) => ({ v, l }))} /></Field>
          {origen === "camara" && (
            <Field label="Cámara (URL o identificador)" hint="Integración pendiente: hoy se anota la cámara y se sube una captura de pantalla como foto.">
              <Input value={camara} onChange={(e) => setCamara(e.target.value)} placeholder="Ej. CAM-BODEGA-02 o rtsp://…" />
            </Field>
          )}
        </div>
      )}
      {paso === 1 && (
        <>
          <p className="mu peq">Elige los productos principales de este anaquel. Preseleccioné los de más valor en existencia en {R.nombreSucursal(d, suc)}.</p>
          <Buscador valor={q} onChange={setQ} placeholder="Buscar producto" />
          <div className="lista">
            {visibles.map(({ p, stock }) => (
              <label key={p.id} className="fila fila-tap" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={elegidos.includes(p.id)} onChange={() => alternar(p.id)} style={{ width: 22, height: 22, accentColor: "var(--p)" }} />
                <div className="fila-c"><div className="fila-t"><span>{p.nombre}</span></div><div className="fila-s">{p.categoria} · {p.sku}</div></div>
                <Badge tono={stock ? "info" : "neutral"}>Sistema: {stock}</Badge>
              </label>
            ))}
          </div>
        </>
      )}
      {paso === 2 && (
        <div className="form">
          <p className="txt">{origen === "camara" ? "Sube una captura de la cámara de seguridad del anaquel." : "Toma una foto del anaquel donde se vean los productos."} Máximo 3 fotos; se reducen para no llenar la memoria del navegador.</p>
          <input ref={inp} type="file" accept="image/*" capture="environment" multiple hidden onChange={subir} />
          <div className="cm-fotos">{fotos.map((f, i) => <div key={i} style={{ position: "relative" }}><img src={f} alt={`Foto ${i + 1}`} /><button className="icono" style={{ position: "absolute", top: -8, right: -8, background: "var(--sup)", border: "1px solid var(--bd)", borderRadius: "50%", minWidth: 30, minHeight: 30 }} onClick={() => { setFotos(fotos.filter((_, k) => k !== i)); setIa(null); }} aria-label="Quitar foto"><Icon name="x" size={14} /></button></div>)}</div>
          <Button variante="sec" icon="camera" disabled={fotos.length >= 3} onClick={() => inp.current && inp.current.click()}>{fotos.length ? "Agregar otra foto" : origen === "camara" ? "Subir captura" : "Tomar o subir foto"}</Button>
        </div>
      )}
      {paso === 3 && (
        <>
          <div className="cm-aviso"><Icon name="alert" size={16} /><span><b>{C.AVISO_VISION}</b></span></div>
          {!ia ? <Button block icon="sparkle" onClick={estimar}>Estimar con IA</Button> : (
            <>
              <p className="mu peq">Revisa la estimación y corrígela si ves otra cantidad en la foto. Tolerancia: {pct} % (mínimo 1 pieza).</p>
              <div className="card">
                <div className="cm-fila-ia cab"><span>Producto</span><span className="der">Sistema</span><span className="der">Estimado</span><span className="der">Dif.</span></div>
                {filasCmp.map((x) => (
                  <div key={x.productoId} className="cm-fila-ia">
                    <span>{R.nombreProducto(d, x.productoId)}<br /><small className="mu">confianza {x.confianza} %</small></span>
                    <span className="der">{x.sistema}</span>
                    <Input type="number" inputMode="numeric" min="0" value={est[x.productoId] ?? ""} onChange={(e) => setEst({ ...est, [x.productoId]: e.target.value })} aria-label={`Estimado de ${R.nombreProducto(d, x.productoId)}`} />
                    <span className={`der ${x.cmp && x.cmp.estado === "diferencia" ? "cm-dif-mal" : "cm-dif-ok"}`}>{x.cmp ? (x.cmp.dif > 0 ? "+" : "") + x.cmp.dif : "—"}</span>
                  </div>
                ))}
              </div>
              {nDif > 0 ? <div className="cm-aviso cm-aviso-bad"><Icon name="alert" size={16} /><span><b>{nDif} diferencia(s)</b> fuera de tolerancia: se generará una alerta con la foto, la fecha y hora, tu usuario y la sucursal como evidencia.</span></div> : <div className="cm-aviso cm-aviso-info"><Icon name="check" size={16} /><span>Todo dentro de tolerancia.</span></div>}
              <Field label="Nota (opcional)"><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. el anaquel estaba desordenado" /></Field>
            </>
          )}
        </>
      )}
      <BarraAccion>
        <div className="dos">
          {paso > 0 ? <Button variante="sec" block onClick={() => setPaso(paso - 1)}>Atrás</Button> : <span />}
          {paso < 3 ? <Button block disabled={!puedeSig} onClick={() => setPaso(paso + 1)}>Siguiente</Button> : <Button block loading={cargando} disabled={!ia || filasCmp.some((x) => !x.cmp)} onClick={guardar}>Guardar auditoría</Button>}
        </div>
      </BarraAccion>
    </>
  );
}

// ───────────────────────── Historial y detalle
function Historial({ d, u }) {
  const sucs = sucursalesDe(d, u);
  const [suc, setSuc] = useState("todas");
  const [selId, setSelId] = useState(null);
  const items = C.auditoriasVisibles(d, u).filter((a) => suc === "todas" || a.sucursalId === suc).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sel = selId ? d.auditorias.find((a) => a.id === selId) : null;
  const tarjeta = (a) => {
    const e = C.estadoAuditoria(d, a);
    return (
      <div>
        {a.fotos[0] ? <img className="cm-foto" src={a.fotos[0]} alt={`Evidencia ${a.folio}`} /> : <div className="cm-foto-v">{a.fotosDescartadas ? "Foto descartada por antigüedad" : "Sin foto"}</div>}
        <div className="cm-ped">
          <div className="cm-ped-t"><span>{a.folio}</span><Badge tono={C.TONO_AUD[e]}>{C.ROTULO_AUD[e]}</Badge></div>
          <div>{R.nombreSucursal(d, a.sucursalId)} · {a.zona}</div>
          <div className="cm-ped-d"><span>{fechaCorta(a.fecha)} {hora(a.fecha)}</span><span>{C.ORIGENES_AUDITORIA[a.origen]}</span><span>{a.items.filter((i) => i.estado === "diferencia").length} diferencia(s)</span></div>
        </div>
      </div>
    );
  };
  const columnas = [
    { k: "f", t: "Folio", v: (a) => a.folio }, { k: "s", t: "Sucursal", v: (a) => R.nombreSucursal(d, a.sucursalId) }, { k: "z", t: "Zona", v: (a) => a.zona },
    { k: "o", t: "Origen", v: (a) => C.ORIGENES_AUDITORIA[a.origen] }, { k: "u", t: "Usuario", v: (a) => nombreCorto(d, a.usuarioId) },
    { k: "e", t: "Estado", v: (a) => { const e = C.estadoAuditoria(d, a); return <Badge tono={C.TONO_AUD[e]}>{C.ROTULO_AUD[e]}</Badge>; }, orden: (a) => C.estadoAuditoria(d, a) },
    { k: "d", t: "Dif.", v: (a) => a.items.filter((i) => i.estado === "diferencia").length, der: true, orden: (a) => a.items.filter((i) => i.estado === "diferencia").length },
    { k: "t", t: "Fecha", v: (a) => `${fechaCorta(a.fecha)} ${hora(a.fecha)}`, orden: (a) => a.fecha },
  ];
  return (
    <>
      {sucs.length > 1 && <div style={{ maxWidth: 280 }}><Select value={suc} onChange={(e) => setSuc(e.target.value)} aria-label="Sucursal"><option value="todas">Todas mis sucursales</option>{sucs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Select></div>}
      <Vista id="auditorias" items={items} tarjeta={tarjeta} columnas={columnas} onAbrir={(a) => setSelId(a.id)} vacio="Aún no hay auditorías." minTarjeta={250} />
      <DetalleAuditoria d={d} u={u} a={sel} onClose={() => setSelId(null)} />
    </>
  );
}

function DetalleAuditoria({ d, u, a, onClose }) {
  const [res, setRes] = useState(null); // { item, tipo }
  const [motivo, setMotivo] = useState("robo");
  const [nota, setNota] = useState("");
  const [tl, setTl] = useState(null);
  const [cargando, setCargando] = useState(false);
  if (!a) return null;
  const e = C.estadoAuditoria(d, a);
  const confirmar = () => {
    setCargando(true);
    const r = mutar((s) => C.resolverDiferencia(s, a.id, res.item.productoId, res.tipo === "ajuste" ? { tipo: "ajuste", motivo } : { tipo: "investigacion", nota }));
    setCargando(false);
    if (!r.ok) { aviso(r.error, "bad"); return; }
    aviso(res.tipo === "ajuste" ? `Ajuste enviado a autorización (nivel ${r.autorizacion.nivel})` : `Investigación ${r.investigacion.folio} abierta`, "ok");
    setRes(null); setNota("");
  };
  const aut = (it) => (it.resolucion && it.resolucion.tipo === "ajuste" ? d.autorizaciones.find((x) => x.id === it.resolucion.autId) : null);
  const inv = (it) => (it.resolucion && it.resolucion.tipo === "investigacion" ? (d.investigacionesInv || []).find((x) => x.id === it.resolucion.invId) : null);
  const cantAjuste = res ? res.item.estimado - R.stock(d, a.sucursalId, res.item.productoId) : 0;
  const prodRes = res ? d.productos.find((p) => p.id === res.item.productoId) : null;
  return (
    <>
      <Sheet abierto onClose={onClose} titulo={`Auditoría ${a.folio}`}>
        <div className="cm-ped-t"><Badge tono={C.TONO_AUD[e]}>{C.ROTULO_AUD[e]}</Badge><Badge tono="neutral">{C.ORIGENES_AUDITORIA[a.origen]}</Badge></div>
        {a.fotos.length ? <div className="cm-fotos">{a.fotos.map((f, i) => <img key={i} className="cm-evid" src={f} alt={`Evidencia ${i + 1}`} />)}</div> : <div className="cm-foto-v">{a.fotosDescartadas ? "Las fotos se descartaron por antigüedad (se guardan máximo 40)" : "Sin foto"}</div>}
        <div className="card">
          <div className="cm-linea"><span>Sucursal</span><b>{R.nombreSucursal(d, a.sucursalId)}</b></div>
          <div className="cm-linea"><span>Zona</span><b>{a.zona}</b></div>
          <div className="cm-linea"><span>Fecha y hora</span><b>{fechaCorta(a.fecha)} {hora(a.fecha)}</b></div>
          <div className="cm-linea"><span>Usuario</span><b>{nombreCorto(d, a.usuarioId)}</b></div>
          {a.camaraRef && <div className="cm-linea"><span>Cámara</span><b>{a.camaraRef}</b></div>}
          {a.nota && <div className="cm-nota-in mu">{a.nota}</div>}
        </div>
        <div className="card">
          <div className="cm-fila-ia cab"><span>Producto</span><span className="der">Sistema</span><span className="der">Estimado</span><span className="der">Dif.</span></div>
          {a.items.map((it) => (
            <div key={it.productoId}>
              <div className="cm-fila-ia" style={{ borderTop: 0 }}>
                <span>{R.nombreProducto(d, it.productoId)}{it.corregido && <small className="mu"><br />corregido a mano (IA: {it.estimadoIA})</small>}</span>
                <span className="der">{it.sistema}</span><span className="der">{it.estimado}</span>
                <span className={`der ${it.estado === "diferencia" ? "cm-dif-mal" : "cm-dif-ok"}`}>{it.dif > 0 ? "+" : ""}{it.dif}</span>
              </div>
              {it.estado === "diferencia" && (
                <div className="cm-acc" style={{ marginBottom: 8 }}>
                  {!it.resolucion && <><b className="peq">Diferencia sin resolver</b><div className="cm-barra">
                    <Button variante="sec" icon="shield" onClick={() => { setRes({ item: it, tipo: "ajuste" }); setMotivo(it.dif < 0 ? "robo" : "sobrante"); }}>Ajustar con autorización</Button>
                    <Button variante="sec" icon="search" onClick={() => setRes({ item: it, tipo: "investigacion" })}>Abrir investigación</Button></div></>}
                  {aut(it) && <span className="peq">Ajuste solicitado ({it.resolucion.motivo}): <Badge tono={aut(it).estado === "autorizado" ? "ok" : aut(it).estado === "rechazado" ? "bad" : "warn"}>{aut(it).estado}</Badge> · nivel {aut(it).nivel}</span>}
                  {inv(it) && <span className="peq">Investigación {inv(it).folio}: <Badge tono={inv(it).estado === "abierta" ? "warn" : "ok"}>{inv(it).estado}</Badge></span>}
                  <button className="chip" style={{ alignSelf: "start" }} onClick={() => setTl({ suc: a.sucursalId, prod: it.productoId })}>Ver línea de tiempo del producto</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mu peq">{a.simulado ? C.AVISO_VISION : ""}</p>
      </Sheet>

      <Sheet abierto={!!res} onClose={() => setRes(null)} titulo={res && res.tipo === "ajuste" ? "Ajustar con autorización" : "Abrir investigación"}
        pie={<Button block loading={cargando} onClick={confirmar}>{res && res.tipo === "ajuste" ? "Enviar a autorización" : "Abrir investigación"}</Button>}>
        {res && res.tipo === "ajuste" && <>
          <p className="txt">{R.nombreProducto(d, res.item.productoId)}: el sistema dice {R.stock(d, a.sucursalId, res.item.productoId)} y la estimación es {res.item.estimado}. Ajuste propuesto: <b>{cantAjuste > 0 ? "+" : ""}{cantAjuste}</b> pieza(s) por <b>{dinero(Math.abs(cantAjuste) * (prodRes ? prodRes.costo : 0))}</b> al costo; lo autoriza {R.nivelAjuste(d, a.sucursalId, Math.abs(cantAjuste) * (prodRes ? prodRes.costo : 0)) === "gerente" ? "el gerente" : "administración"}.</p>
          <div className="cm-aviso"><Icon name="alert" size={16} /><span>La estimación de la IA no sustituye el conteo físico: conviene confirmar contando antes de ajustar.</span></div>
          <Field label="Motivo"><Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS_INV.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</Select></Field>
        </>}
        {res && res.tipo === "investigacion" && <Field label="¿Qué se va a investigar?" hint="Queda con la evidencia de esta auditoría."><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. revisar accesos a bodega de los últimos 14 días" /></Field>}
      </Sheet>

      <Linea d={d} tl={tl} onClose={() => setTl(null)} />
    </>
  );
}

function Linea({ d, tl, onClose }) {
  if (!tl) return null;
  const r = C.lineaTiempoProducto(d, tl.suc, tl.prod);
  return (
    <Sheet abierto onClose={onClose} titulo="Línea de tiempo">
      <p className="txt"><b>{R.nombreProducto(d, tl.prod)}</b> · {R.nombreSucursal(d, tl.suc)}</p>
      {r.faltaDesde ? <div className="cm-aviso cm-aviso-bad"><Icon name="alert" size={16} /><span>Empezó a faltar {r.ventana}. La falta pudo ocurrir en cualquier momento dentro de ese intervalo.</span></div> : <div className="cm-aviso cm-aviso-info"><Icon name="check" size={16} /><span>No hay faltantes detectados en la última auditoría.</span></div>}
      <div className="cm-linea-tiempo">
        {r.puntos.map((p) => (
          <div key={p.auditoriaId} className={`cm-lt${p.estado === "diferencia" ? " mal" : ""}`}>
            <b>{fechaCorta(p.fecha)} {hora(p.fecha)} · {p.folio}</b>
            <span>Sistema {p.sistema} · estimado {p.estimado} · {p.dif === 0 ? "sin diferencia" : `${p.dif > 0 ? "+" : ""}${p.dif}`}{p.estado === "diferencia" ? " · ALERTA" : ""} · {C.ORIGENES_AUDITORIA[p.origen]} · {nombreCorto(d, p.usuarioId)}</span>
          </div>
        ))}
        {!r.puntos.length && <Vacio icon="clock">Aún no hay auditorías de este producto.</Vacio>}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Alertas e investigaciones
function Alertas({ d, u }) {
  const [selInv, setSelInv] = useState(null);
  const [selAud, setSelAud] = useState(null);
  const [nota, setNota] = useState("");
  const [concl, setConcl] = useState("");
  const vis = C.auditoriasVisibles(d, u);
  const sinResolver = vis.flatMap((a) => a.items.filter((i) => i.estado === "diferencia" && !i.resolucion).map((i) => ({ a, i }))).sort((x, y) => y.a.fecha.localeCompare(x.a.fecha));
  const invs = (d.investigacionesInv || []).filter((x) => C.esCentral(u) || u.sucursales.includes(x.sucursalId));
  const inv = selInv ? (d.investigacionesInv || []).find((x) => x.id === selInv) : null;
  const act = (fn, ok) => { const r = mutar((s) => fn(s)); if (!r.ok) aviso(r.error, "bad"); else aviso(ok, "ok"); return r; };
  return (
    <>
      <Titulo>Diferencias sin resolver</Titulo>
      {!sinResolver.length ? <Vacio icon="check">No hay diferencias pendientes de resolver.</Vacio> : (
        <div className="lista">
          {sinResolver.map(({ a, i }) => (
            <div key={a.id + i.productoId} className="fila fila-tap" role="button" onClick={() => setSelAud(a.id)}>
              {a.fotos[0] ? <img className="foto" style={{ borderRadius: 10, width: 56, height: 56 }} src={a.fotos[0]} alt="" /> : <span className="avatar avatar-bad"><Icon name="alert" size={18} /></span>}
              <div className="fila-c"><div className="fila-t"><span>{R.nombreProducto(d, i.productoId)}</span><Badge tono="bad">{i.dif > 0 ? "+" : ""}{i.dif}</Badge></div>
                <div className="fila-s">{R.nombreSucursal(d, a.sucursalId)} · {a.folio} · {fechaCorta(a.fecha)} {hora(a.fecha)}</div>
                <div className="fila-d"><span>Sistema {i.sistema}</span><span>Estimado {i.estimado}</span><span>{nombreCorto(d, a.usuarioId)}</span></div></div>
            </div>
          ))}
        </div>
      )}
      <Titulo>Investigaciones</Titulo>
      {!invs.length ? <Vacio icon="search">No hay investigaciones abiertas.</Vacio> : (
        <div className="lista">
          {invs.map((x) => (
            <div key={x.id} className="fila fila-tap" role="button" onClick={() => { setSelInv(x.id); setNota(""); setConcl(""); }}>
              <div className="fila-c"><div className="fila-t"><span>{x.folio} · {R.nombreProducto(d, x.productoId)}</span><Badge tono={x.estado === "abierta" ? "warn" : "ok"}>{x.estado === "abierta" ? "Abierta" : "Cerrada"}</Badge></div>
                <div className="fila-s">{R.nombreSucursal(d, x.sucursalId)} · faltan {x.faltante} · {dinero(x.valor)} al costo</div>
                <div className="fila-d"><span>Abierta {fechaCorta(x.fecha)}</span><span>{x.notas.length} nota(s)</span></div></div>
            </div>
          ))}
        </div>
      )}
      <DetalleAuditoria d={d} u={u} a={selAud ? d.auditorias.find((x) => x.id === selAud) : null} onClose={() => setSelAud(null)} />
      <Sheet abierto={!!inv} onClose={() => setSelInv(null)} titulo={inv ? `Investigación ${inv.folio}` : ""}
        pie={inv && inv.estado === "abierta" && (
          <div className="form">
            <Button block icon="plus" onClick={() => { const r = act((s) => C.notaInvestigacion(s, inv.id, nota), "Nota agregada"); if (r.ok) setNota(""); }}>Agregar nota</Button>
            {u.rol !== "almacen" && <><Field label="Conclusión (para cerrar)"><Input value={concl} onChange={(e) => setConcl(e.target.value)} placeholder="Ej. error de captura confirmado" /></Field>
              <Button block variante="sec" onClick={() => { const r = act((s) => C.cerrarInvestigacion(s, inv.id, concl), "Investigación cerrada"); if (r.ok) setSelInv(null); }}>Cerrar investigación</Button></>}
          </div>
        )}>
        {inv && <>
          <div className="card"><b>{R.nombreProducto(d, inv.productoId)}</b> · {R.nombreSucursal(d, inv.sucursalId)}
            <div className="mu peq">Faltan {inv.faltante} pieza(s) · {dinero(inv.valor)} al costo · abierta por {nombreCorto(d, inv.abiertaPor)} el {fechaCorta(inv.fecha)} {hora(inv.fecha)}</div></div>
          <button className="chip" style={{ alignSelf: "start" }} onClick={() => setSelAud(inv.auditoriaId)}>Ver auditoría y evidencia</button>
          <div className="cm-hist">{inv.notas.map((n, i) => <div key={i}><b>{nombreCorto(d, n.usuarioId)}</b><span>{fechaCorta(n.ts)} {hora(n.ts)}</span><div className="cm-nota-in" style={{ flexBasis: "100%" }}>{n.texto}</div></div>)}</div>
          {inv.estado === "abierta" && <Field label="Nueva nota"><Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se revisó, qué se encontró" /></Field>}
          {inv.conclusion && <div className="cm-aviso cm-aviso-info"><Icon name="check" size={16} /><span>Conclusión: {inv.conclusion}</span></div>}
        </>}
      </Sheet>
    </>
  );
}
