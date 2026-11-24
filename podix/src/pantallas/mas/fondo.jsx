// Fondo revolvente / caja chica por sucursal (porte de Pie Firme FondoRevolvente.jsx e IRP, P-095): asignación, gastos menores con
// comprobante (crean el gasto con la acción de finanzas), arqueo, reposición solicitada por la sucursal y autorizada por Administración.
import { useMemo, useRef, useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import { Badge, BarraAccion, Button, Card, Field, Input, Kpi, Resumen, Select, Sheet, Titulo, Vacio, aviso, Area } from "../../ui/index.jsx";
import Vista, { reducirImagen } from "../../ui/vista.jsx";
import { fechaCorta, hoy } from "../../lib/format.js";
import * as R from "../../store/reglas.js";
import * as F from "../../store/acciones_finanzas.js";
import * as X from "../../store/acciones_tesoreria.js";
import { Medidor, SelectorSucursal, SinPermiso, monto } from "../../componentes/tesoreria/comun.jsx";
import "../../estilos_tesoreria.css";

const TIPO = { asignacion: ["Asignación", "info"], gasto: ["Gasto", "warn"], reposicion: ["Reposición", "ok"], ajuste: ["Ajuste", "neutral"] };
const ARQ = { conforme: ["Conforme", "ok"], diferencia_menor: ["Diferencia menor (ajustada)", "info"], por_revisar: ["Por revisar", "bad"], revisado: ["Revisado", "ok"], rechazado: ["Rechazado", "bad"] };

function FormGasto({ d, sucursalId, saldo, onClose }) {
  const [f, setF] = useState({ fecha: hoy(), categoria: "otros", concepto: "", monto: "", comprobante: null, comprobanteFolio: "" });
  const [sub, setSub] = useState(false);
  const ref = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const foto = async (e) => { const file = e.target.files && e.target.files[0]; if (!file) return; setSub(true); try { const img = await reducirImagen(file, 640, 0.7); setF((x) => ({ ...x, comprobante: img })); } catch (er) { aviso(er.message, "bad"); } setSub(false); e.target.value = ""; };
  const guardar = () => {
    const r = mutar((x) => X.gastoFondo(x, { sucursalId, ...f }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.alerta ? "Gasto registrado. El fondo pasó el umbral de uso: solicita la reposición." : "Gasto registrado.", r.alerta ? "warn" : "ok"); onClose();
  };
  const desde = X.paramsTes(d).comprobanteDesde;
  return (
    <Sheet abierto onClose={onClose} titulo="Gasto menor del fondo" pie={<div className="dos"><Button variante="sec" block onClick={onClose}>Cancelar</Button><Button block onClick={guardar}>Guardar</Button></div>}>
      <div className="form">
        <p className="tes-nota">Disponible en caja chica: <b>{monto(saldo)}</b>. El gasto entra al estado de resultados de {R.nombreSucursal(d, sucursalId)}.</p>
        <div className="dos"><Field label="Fecha"><Input type="date" value={f.fecha} max={hoy()} onChange={set("fecha")} /></Field><Field label="Monto"><Input inputMode="decimal" value={f.monto} onChange={set("monto")} /></Field></div>
        <Field label="Categoría"><Select value={f.categoria} onChange={set("categoria")}>{F.categoriasDe(d).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Field>
        <Field label="Concepto"><Input value={f.concepto} onChange={set("concepto")} placeholder="Ej. Garrafones de agua" /></Field>
        <Field label="Folio del ticket o factura" hint={`Comprobante obligatorio: foto o folio. Desde ${monto(desde)} se exige la foto (P-093).`}><Input value={f.comprobanteFolio} onChange={set("comprobanteFolio")} /></Field>
        <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={foto} />
        <div className="tes-acciones">
          <Button variante="sec" icon="camera" loading={sub} onClick={() => ref.current.click()}>{f.comprobante ? "Cambiar foto" : "Foto del comprobante"}</Button>
          {f.comprobante && <img className="tes-miniatura" src={f.comprobante} alt="Comprobante" />}
        </div>
      </div>
    </Sheet>
  );
}

function FormArqueo({ ef, onClose }) {
  const [c, setC] = useState(""); const [nota, setNota] = useState("");
  const a = c === "" ? null : X.arqueoFondo(ef.saldo, Number(c) || 0);
  const guardar = () => { const r = mutar((x) => X.registrarArqueo(x, { fondoId: ef.fondo.id, contado: c, nota })); if (!r.ok) return aviso(r.error, "bad"); aviso(`Arqueo registrado: ${ARQ[r.arqueo.estado][0]}.`, r.arqueo.estado === "por_revisar" ? "warn" : "ok"); onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Arqueo de caja chica" pie={<Button block onClick={guardar}>Registrar arqueo</Button>}>
      <div className="form">
        <p className="tes-nota">Cuenta el efectivo y los comprobantes sin ver el esperado; diferencia mayor a {monto(X.paramsTes({}).toleranciaArqueo)} la revisa Administración.</p>
        <Field label="Efectivo contado"><Input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></Field>
        {a && <Resumen filas={[["Esperado", monto(a.esperado)], ["Contado", monto(a.contado)], ["Diferencia", monto(a.diferencia), true]]} />}
        {a && a.estado !== "conforme" && <Field label="Nota (obligatoria)"><Area value={nota} onChange={(e) => setNota(e.target.value)} /></Field>}
      </div>
    </Sheet>
  );
}

function FormConfig({ d, sucursalId, fondo, onClose }) {
  const [f, setF] = useState({ montoBase: fondo ? String(fondo.montoBase) : "3000", responsableId: fondo ? fondo.responsableId || "" : "", alertaPct: fondo ? String(fondo.alertaPct || 80) : "80" });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const guardar = () => { const r = mutar((x) => X.configurarFondo(x, { sucursalId, ...f, alertaPct: Number(f.alertaPct) })); if (!r.ok) return aviso(r.error, "bad"); aviso("Fondo guardado."); onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo={fondo ? "Configurar fondo" : "Crear fondo revolvente"} pie={<Button block onClick={guardar}>Guardar</Button>}>
      <div className="form">
        <Field label="Monto base"><Input inputMode="decimal" value={f.montoBase} onChange={set("montoBase")} /></Field>
        <Field label="Responsable"><Select value={f.responsableId} onChange={set("responsableId")}><option value="">Sin designar</option>{d.usuarios.filter((x) => x.sucursales.includes(sucursalId) && x.activo !== false).map((x) => <option key={x.id} value={x.id}>{x.nombre} · {x.rol}</option>)}</Select></Field>
        <Field label="Alerta de uso (%)"><Input inputMode="numeric" value={f.alertaPct} onChange={set("alertaPct")} /></Field>
      </div>
    </Sheet>
  );
}

function Resolver({ d, rp, onClose }) {
  const [ref, setRef] = useState(""); const [motivo, setMotivo] = useState("");
  const go = (autorizar) => { const r = mutar((x) => X.resolverReposicion(x, { reposicionId: rp.id, autorizar, referencia: ref, motivo })); if (!r.ok) return aviso(r.error, "bad"); aviso(autorizar ? "Reposición autorizada." : "Reposición rechazada."); onClose(); };
  return (
    <Sheet abierto onClose={onClose} titulo="Autorizar reposición" pie={<div className="dos"><Button variante="danger" block onClick={() => go(false)}>Rechazar</Button><Button block onClick={() => go(true)}>Autorizar</Button></div>}>
      <div className="form">
        <Resumen filas={[["Sucursal", R.nombreSucursal(d, rp.sucursalId)], ["Monto", monto(rp.monto), true], ["Solicitó", R.nombreUsuario(d, rp.solicitadaPor)], ["Gastos amparados", String((rp.gastos || []).length)]]} />
        <Field label="Referencia de la transferencia" hint="Sale de la cuenta concentradora y se concilia ahí."><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="REP-…" /></Field>
        <Field label="Motivo (si rechazas)"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

export default function Fondo() {
  const { d, u, sucursalId } = useSesion();
  const visibles = X.sucursalesTes(d, u, "fondo");
  const central = X.esCentral(u);
  const [suc, setSuc] = useState((visibles.find((s) => s.id === sucursalId) || visibles[0] || {}).id || "");
  const [hoja, setHoja] = useState(null);
  const fondo = suc ? X.fondoDe(d, suc) : null;
  const ef = useMemo(() => (fondo ? X.estadoFondo(d, fondo.id) : null), [d, fondo]);
  const pendientesCad = central ? ((d.tes && d.tes.reposiciones) || []).filter((x) => x.estado === "solicitada") : [];
  const arqRev = central ? ((d.tes && d.tes.arqueos) || []).filter((x) => x.estado === "por_revisar") : [];
  if (!visibles.length) return <SinPermiso />;
  const solicitar = () => { const r = mutar((x) => X.solicitarReposicion(x, { fondoId: fondo.id })); if (!r.ok) return aviso(r.error, "bad"); aviso("Reposición solicitada a Administración."); };
  const revisar = (a, aceptar) => { const nota = window.prompt(aceptar ? "Resolución (se registrará el ajuste):" : "Motivo del rechazo:"); if (!nota) return; const r = mutar((x) => X.revisarArqueo(x, { arqueoId: a.id, aceptar, nota })); if (!r.ok) return aviso(r.error, "bad"); aviso("Arqueo revisado."); };
  const gastoDe = (m) => m.gastoId && d.fin.gastos.find((g) => g.id === m.gastoId);
  const tarjeta = (m) => { const [l, t] = TIPO[m.tipo] || [m.tipo]; const g = gastoDe(m); return <div className="tes-mov"><div className="tes-mov-t"><b className={m.monto < 0 ? "tes-neg" : "tes-pos"}>{monto(m.monto)}</b><Badge tono={t}>{l}</Badge></div><div className="fuerte">{m.concepto}</div><div className="tes-mov-s">{fechaCorta(m.fecha)} · {R.nombreUsuario(d, m.usuarioId)}{m.comprobanteFolio ? ` · ${m.comprobanteFolio}` : ""}{g && g.comprobante ? " · con foto" : ""}</div></div>; };
  const columnas = [
    { k: "f", t: "Fecha", v: (m) => fechaCorta(m.fecha), orden: (m) => m.fecha },
    { k: "t", t: "Tipo", v: (m) => (TIPO[m.tipo] || [m.tipo])[0] },
    { k: "c", t: "Concepto", v: (m) => m.concepto },
    { k: "cp", t: "Comprobante", v: (m) => { const g = gastoDe(m); return m.tipo !== "gasto" ? "—" : g && g.comprobante ? "Foto" : m.comprobanteFolio || "—"; } },
    { k: "u", t: "Registró", v: (m) => R.nombreUsuario(d, m.usuarioId) },
    { k: "m", t: "Importe", der: true, v: (m) => monto(m.monto), orden: (m) => m.monto },
  ];
  return (
    <div className="tes-col">
      <div className="tes-filtros"><SelectorSucursal visibles={visibles} valor={suc} onChange={setSuc} consolidado={false} /></div>
      {central && (pendientesCad.length > 0 || arqRev.length > 0) && <Card tono="warn">
        <Titulo>Por autorizar en la cadena</Titulo>
        <div className="lista">
          {pendientesCad.map((rp) => <div key={rp.id} className="tes-cab"><span>Reposición · {R.nombreSucursal(d, rp.sucursalId)} · <b>{monto(rp.monto)}</b></span><Button variante="sec" onClick={() => setHoja({ tipo: "resolver", rp })}>Revisar</Button></div>)}
          {arqRev.map((a) => <div key={a.id} className="tes-cab"><span>Arqueo · {R.nombreSucursal(d, a.sucursalId)} · diferencia <b className="tes-neg">{monto(a.diferencia)}</b> · {a.nota}</span><span className="tes-acciones"><Button variante="sec" onClick={() => revisar(a, true)}>Aceptar ajuste</Button><Button variante="sec" onClick={() => revisar(a, false)}>Rechazar</Button></span></div>)}
        </div>
      </Card>}
      {!fondo ? <Card><Vacio icon="cash">{R.nombreSucursal(d, suc)} no tiene fondo revolvente.</Vacio>{central && <Button block onClick={() => setHoja({ tipo: "config" })}>Crear fondo</Button>}</Card> : <>
        <div className="kpis">
          <Kpi label="Disponible en caja chica" valor={monto(ef.saldo)} nota={`base ${monto(fondo.montoBase)}`} tono={ef.uso.alerta ? "warn" : "ok"} />
          <Kpi label="Gastado por reponer" valor={monto(ef.porReponer)} nota={`${ef.uso.pct} % del fondo`} tono={ef.uso.alerta ? "warn" : undefined} />
          <Kpi label="Último arqueo" valor={ef.ultimoArqueo ? (ARQ[ef.ultimoArqueo.estado] || [ef.ultimoArqueo.estado])[0] : "Sin arqueo"} nota={ef.ultimoArqueo ? `${fechaCorta(ef.ultimoArqueo.fecha)} · dif. ${monto(ef.ultimoArqueo.diferencia)}` : ""} tono={ef.ultimoArqueo && ef.ultimoArqueo.estado === "por_revisar" ? "bad" : undefined} />
          <Kpi label="Reposición" valor={ef.reposicionPendiente ? "En trámite" : "Sin trámite"} nota={ef.reposicionPendiente ? monto(ef.reposicionPendiente.monto) : ef.ultimaReposicion ? `última ${fechaCorta(ef.ultimaReposicion.resueltaEn)}` : ""} tono={ef.reposicionPendiente ? "info" : undefined} />
        </div>
        <Card>
          <Medidor valor={ef.uso.pct} meta={fondo.alertaPct || 80} etiqueta={`Uso del fondo · responsable ${fondo.responsableId ? R.nombreUsuario(d, fondo.responsableId) : "sin designar"}`} />
          <p className="tes-regla" style={{ marginTop: 6 }}>Un fondo por sucursal con monto base propio; la reposición la autoriza Administración y regresa el fondo a su base; las comisiones bancarias no salen del fondo (P-095).</p>
          <div className="tes-acciones" style={{ marginTop: 8 }}>
            <Button variante="sec" icon="clipboard" onClick={() => setHoja({ tipo: "arqueo" })}>Arqueo</Button>
            <Button variante="sec" icon="repeat" onClick={solicitar} disabled={!!ef.reposicionPendiente || !(ef.porReponer > 0)}>Solicitar reposición ({monto(ef.porReponer)})</Button>
            {central && ef.reposicionPendiente && <Button variante="sec" icon="check" onClick={() => setHoja({ tipo: "resolver", rp: ef.reposicionPendiente })}>Autorizar reposición</Button>}
            {central && <Button variante="sec" icon="settings" onClick={() => setHoja({ tipo: "config" })}>Configurar</Button>}
          </div>
        </Card>
        <Vista id="tes-fondo-movs" items={ef.movimientos} tarjeta={tarjeta} columnas={columnas} vacio="Sin movimientos." />
        <Card><Titulo>Arqueos y reposiciones</Titulo>
          <Resumen filas={[...ef.arqueos.slice(0, 5).map((a) => [`Arqueo ${fechaCorta(a.fecha)} · ${(ARQ[a.estado] || [a.estado])[0]}`, monto(a.diferencia)]), ...ef.reposiciones.slice(0, 5).map((x) => [`Reposición ${fechaCorta(x.solicitadaEn)} · ${x.estado}${x.referencia ? ` · ${x.referencia}` : ""}`, monto(x.monto)])]} />
        </Card>
        <BarraAccion><Button block icon="plus" onClick={() => setHoja({ tipo: "gasto" })} disabled={!(ef.saldo > 0)}>Gasto menor</Button></BarraAccion>
      </>}
      {hoja && hoja.tipo === "gasto" && <FormGasto d={d} sucursalId={suc} saldo={ef.saldo} onClose={() => setHoja(null)} />}
      {hoja && hoja.tipo === "arqueo" && <FormArqueo ef={ef} onClose={() => setHoja(null)} />}
      {hoja && hoja.tipo === "config" && <FormConfig d={d} sucursalId={suc} fondo={fondo} onClose={() => setHoja(null)} />}
      {hoja && hoja.tipo === "resolver" && <Resolver d={d} rp={hoja.rp} onClose={() => setHoja(null)} />}
    </div>
  );
}
