import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import * as A from "../../store/acciones_podologo.js";
import { Card, Fila, Badge, Button, Sheet, Field, Input, Select, Area, Chips, Pasos, BarraAccion, Resumen, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import { AlertasClinicas } from "../../componentes/podologo/comunes.jsx";
import { dinero, hoy, sumarDias, fechaCorta } from "../../lib/format.js";

const FILTROS = [{ v: "todas", l: "Todas" }, { v: "retrasada", l: "Retrasadas" }, { v: "proceso", l: "En proceso" }, { v: "recibida", l: "Recibidas" }, { v: "entregada", l: "Entregadas" }];

export default function Ordenes() {
  const { d, u, sucursalId } = useSesion();
  const [filtro, setFiltro] = useState("todas");
  const [det, setDet] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  if (nuevo) return <Prescribir onFin={() => setNuevo(false)} />;

  const mias = A.ordenarOrdenes(d.ordenesLab.filter((o) => o.podologoId === u.id));
  const pasa = (o) => { const e = A.estadoOrden(o); return filtro === "todas" || (filtro === "proceso" ? ["prescrita", "enviada", "retrabajo"].includes(e) : e === filtro || (filtro === "recibida" && e === "en_prueba")); };
  const lista = mias.filter(pasa);
  const o = det && d.ordenesLab.find((x) => x.id === det);

  return (
    <>
      <Button block icon="plus" onClick={() => setNuevo(true)}>Prescribir plantilla / ortesis</Button>
      <Chips scroll opciones={FILTROS.map((f) => ({ ...f, n: f.v === "todas" ? mias.length : mias.filter((x) => { const e = A.estadoOrden(x); return f.v === "proceso" ? ["prescrita", "enviada", "retrabajo"].includes(e) : f.v === "recibida" ? ["recibida", "en_prueba"].includes(e) : e === f.v; }).length }))} valor={filtro} onChange={setFiltro} />
      <div className="lista">
        {lista.map((x) => { const e = A.estadoOrden(x); return (
          <Fila key={x.id} titulo={`${x.folio} · ${R.nombrePaciente(d, x.pacienteId)}`} sub={`${x.tipo} · ${x.pie}`} badge={<Badge tono={A.TONO_ORDEN[e]}>{A.ESTADOS_ORDEN[e]}</Badge>}
            datos={<><span>{(d.laboratorios.find((l) => l.id === x.laboratorioId) || {}).nombre}</span><span>Prometida {fechaCorta(x.prometida)}</span></>} onClick={() => setDet(x.id)} />
        ); })}
      </div>
      {!lista.length && <Vacio icon="flask">{mias.length ? "Sin órdenes en este filtro." : "Aún no tienes órdenes de laboratorio. Prescribe la primera."}</Vacio>}

      <Sheet abierto={!!o} onClose={() => setDet(null)} titulo={o ? o.folio : ""}
        pie={o && ["recibida", "en_prueba"].includes(o.estado) ? <Button block variante="sec" onClick={() => { const r = mutar((x) => A.marcarRetrabajo(x, o.id, x.usuarios.find((y) => y.id === x.sesion.userId))); aviso(r ? "Marcada para retrabajo." : "No se pudo.", r ? "ok" : "bad"); setDet(null); }}>Marcar retrabajo</Button> : null}>
        {o && (() => { const e = A.estadoOrden(o); return (
          <>
            <Badge tono={A.TONO_ORDEN[e]}>{A.ESTADOS_ORDEN[e]}</Badge>
            <Resumen filas={[["Paciente", R.nombrePaciente(d, o.pacienteId)], ["Tipo", o.tipo], ["Pie", o.pie], ["Talla", o.talla], ["Método de toma", o.toma], ["Laboratorio", (d.laboratorios.find((l) => l.id === o.laboratorioId) || {}).nombre],
              ["Sucursal", R.nombreSucursal(d, o.sucursalId)], ["Enviada", fechaCorta(o.enviada)], ["Prometida", fechaCorta(o.prometida)], o.retrabajos && ["Retrabajos", o.retrabajos],
              o.anticipoPendiente != null && ["Anticipo pendiente", dinero(o.anticipoPendiente)], o.anticipoPagado != null && ["Anticipo pagado", dinero(o.anticipoPagado)]]} />
            {o.correcciones && <Card><b>Correcciones</b><p className="txt peq">{o.correcciones}</p></Card>}
          </>); })()}
      </Sheet>
    </>
  );
}

const T = ["Paciente", "Plantilla", "Toma y correcciones", "Laboratorio y anticipo"];

function Prescribir({ onFin }) {
  const { d, u, sucursalId } = useSesion();
  const [paso, setPaso] = useState(0);
  const [selPac, setSelPac] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({ pacienteId: "", tipo: "", pie: "Ambos", talla: "", toma: "Escáner 3D", correcciones: "", laboratorioId: d.laboratorios[0]?.id || "", prometida: sumarDias(hoy(), A.DIAS_PROMETIDA) });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const pac = d.pacientes.find((p) => p.id === f.pacienteId);
  const err = A.validarOrden(d, f);
  const clavesPaso = [["pacienteId"], ["tipo", "pie", "talla"], ["toma"], ["laboratorioId", "prometida"]];
  const mostrar = (k) => (intentado[k] ? err[k] : undefined);
  const [intentado, setInt] = useState({});

  const sig = () => {
    const malos = clavesPaso[paso].filter((k) => err[k]);
    if (malos.length) { setInt((x) => ({ ...x, ...Object.fromEntries(malos.map((k) => [k, true])) })); return aviso(err[malos[0]], "warn"); }
    if (paso < 3) return setPaso(paso + 1);
    setGuardando(true);
    const r = mutar((x) => A.crearOrdenLab(x, f, x.usuarios.find((y) => y.id === x.sesion.userId), sucursalId));
    setGuardando(false);
    if (!r.ok) return aviso(Object.values(r.errores)[0], "bad");
    aviso(`Orden ${r.orden.folio} enviada. Anticipo ${dinero(r.orden.anticipoPendiente)} por cobrar en caja.`);
    onFin();
  };

  return (
    <>
      <Button variante="ghost" icon="back" onClick={() => (paso ? setPaso(paso - 1) : onFin())}>{paso ? "Paso anterior" : "Órdenes"}</Button>
      <Pasos titulos={T} paso={paso} />
      {paso === 0 && (
        <div className="form">
          {pac ? <Card tono="info"><b>{pac.nombres} {pac.apellidos}</b><div className="peq mu">{pac.folio}</div></Card> : <Vacio icon="users">Elige al paciente.</Vacio>}
          {pac && <AlertasClinicas paciente={pac} />}
          <Button block variante="sec" icon="search" onClick={() => setSelPac(true)}>{pac ? "Cambiar paciente" : "Buscar paciente"}</Button>
          {mostrar("pacienteId") && <strong style={{ color: "var(--er)", fontSize: 12 }}>{err.pacienteId}</strong>}
        </div>
      )}
      {paso === 1 && (
        <div className="form">
          <Field label="Tipo"><Select value={f.tipo} onChange={(e) => set({ tipo: e.target.value })}><option value="">Elige…</option>{Object.entries(A.PRECIO_ORTESIS).map(([k, v]) => <option key={k} value={k}>{k} · {dinero(v)}</option>)}</Select></Field>
          {mostrar("tipo") && <strong style={{ color: "var(--er)", fontSize: 12 }}>{err.tipo}</strong>}
          <Field label="Pie"><Chips opciones={A.PIES.map((p) => ({ v: p, l: p }))} valor={f.pie} onChange={(v) => set({ pie: v })} /></Field>
          <Field label="Talla de calzado (MX)" error={mostrar("talla")}><Input inputMode="decimal" placeholder="25.5" value={f.talla} onChange={(e) => set({ talla: e.target.value })} /></Field>
        </div>
      )}
      {paso === 2 && (
        <div className="form">
          <Field label="Método de toma"><Chips opciones={A.TOMAS.map((p) => ({ v: p, l: p }))} valor={f.toma} onChange={(v) => set({ toma: v })} /></Field>
          <Field label="Correcciones"><Area rows={4} value={f.correcciones} onChange={(e) => set({ correcciones: e.target.value })} placeholder="Ej. Soporte de arco longitudinal, descarga 1er metatarsiano" /></Field>
        </div>
      )}
      {paso === 3 && (
        <div className="form">
          <Field label="Laboratorio"><Select value={f.laboratorioId} onChange={(e) => set({ laboratorioId: e.target.value })}>{d.laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</Select></Field>
          <Field label="Fecha prometida" error={mostrar("prometida")}><Input type="date" min={hoy()} value={f.prometida} onChange={(e) => set({ prometida: e.target.value })} /></Field>
          <Card>
            <Resumen filas={[["Paciente", pac ? `${pac.nombres} ${pac.apellidos}` : "—"], ["Plantilla", `${f.tipo || "—"} · ${f.pie} · T${f.talla || "—"}`], ["Toma", f.toma], ["Precio", dinero(A.PRECIO_ORTESIS[f.tipo] || 0)], [`Anticipo requerido ${A.ANTICIPO_LAB_PCT} %`, dinero(A.anticipoDe(f.tipo)), true]]} />
          </Card>
          <p className="peq mu">El anticipo lo cobra el cajero desde "Por cobrar".</p>
        </div>
      )}
      <BarraAccion><Button block loading={guardando} onClick={sig}>{paso < 3 ? "Siguiente" : "Generar orden y enviar al laboratorio"}</Button></BarraAccion>
      <SelectorPaciente abierto={selPac} onClose={() => setSelPac(false)} onElegir={(p) => set({ pacienteId: p.id })} />
    </>
  );
}
