// Venta a plazos o crédito abierto: simulación, comprobación de límite, nivel de autorización y enganche.
import { useState } from "react";
import { useSesion, useParam } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { ENGANCHE_MIN_PCT, crearPlanCredito, enganchaMinimo, num, partidaCatalogo, simularPlan } from "../../store/acciones_cajero.js";
import { Badge, BarraAccion, Button, Card, Chips, Field, Fila, Icon, Input, Resumen, Select, Titulo, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta } from "../../lib/format.js";
import SelectorPaciente from "../../componentes/SelectorPaciente.jsx";
import BuscadorProductos from "../../componentes/cajero/BuscadorProductos.jsx";
import SheetPago from "../../componentes/cajero/PagoMixto.jsx";
import { Comprobante } from "../../componentes/cajero/Comprobante.jsx";
import { Cant, SinTurno } from "../../componentes/cajero/piezas.jsx";

const NIVEL = { gerente: "Gerente de sucursal", admin: "Administración central", direccion: "Dirección" };

export default function VentaPlazos() {
  const { d, u, sucursalId, params } = useSesion();
  const turno = R.turnoAbierto(d, u.id);
  const pParam = useParam("paciente"), mParam = useParam("monto");
  const [pacienteId, setPacienteId] = useState(pParam && d.pacientes.some((p) => p.id === pParam) ? pParam : null);
  const [tipo, setTipo] = useState("plazos");
  const [origen, setOrigen] = useState(mParam ? "monto" : "productos");
  const [montoTxt, setMontoTxt] = useState(mParam || "");
  const [items, setItems] = useState([]);
  const [engTxt, setEngTxt] = useState("");
  const [n, setN] = useState(6);
  const [sh, setSh] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(null);

  if (!turno) return <SinTurno texto="El enganche se cobra en caja: abre tu turno primero." />;
  const lineas = items.map((i) => partidaCatalogo(d, sucursalId, "producto", i.itemId, i.cant)).filter(Boolean);
  const monto = origen === "productos" ? lineas.reduce((a, l) => a + l.importe, 0) : num(montoTxt);
  const min = tipo === "plazos" ? enganchaMinimo(monto) : 0;
  const eng = engTxt === "" ? min : num(engTxt);
  const sim = monto > 0 && eng < monto ? simularPlan(params, { tipo, monto, enganche: eng, n }) : null;
  const paciente = d.pacientes.find((p) => p.id === pacienteId);
  const cr = pacienteId ? R.credito(d, pacienteId) : null;
  const disponible = pacienteId ? R.creditoDisponible(d, pacienteId) : 0;
  const fin = sim ? sim.financiado : 0;
  const excede = !!sim && fin > disponible;
  const atraso = !!pacienteId && d.planes.some((p) => p.pacienteId === pacienteId && p.estado === "vigente" && R.diasMoraPlan(d, p) > 0);
  const nivel = sim ? (atraso ? "direccion" : excede && R.nivelCredito(d, sucursalId, fin) === "gerente" ? "admin" : R.nivelCredito(d, sucursalId, fin)) : null;
  const err = !paciente ? "Elige al paciente." : !(monto > 0) ? "Define el monto o los productos." : cr && cr.bloqueado ? "El crédito del paciente está bloqueado." : tipo === "plazos" && eng + 0.005 < min ? `Enganche mínimo ${dinero(min)} (${ENGANCHE_MIN_PCT} %).` : eng >= monto ? "El enganche debe ser menor al monto." : null;

  const setCant = (itemId, c) => setItems((xs) => (c <= 0 ? xs.filter((x) => x.itemId !== itemId) : xs.map((x) => (x.itemId === itemId ? { ...x, cant: c } : x))));
  const agregar = (p) => setItems((xs) => (xs.some((x) => x.itemId === p.id) ? xs.map((x) => (x.itemId === p.id ? { ...x, cant: x.cant + 1 } : x)) : [...xs, { itemId: p.id, cant: 1 }]));

  const enviar = (pagos) => {
    setCargando(true);
    const r = mutar((dd) => crearPlanCredito(dd, { pacienteId, tipo, monto, partidas: origen === "productos" ? items : [], enganche: eng, n, pagos }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Plan enviado a autorización", "warn"); setSh(null); setListo(r);
  };
  const solicitar = () => (eng > 0 ? setSh("pago") : enviar([]));
  const nuevo = () => { setListo(null); setItems([]); setMontoTxt(""); setEngTxt(""); setPacienteId(null); };
  const pl = listo ? listo.plan : null;
  const pac = pl ? d.pacientes.find((p) => p.id === pl.pacienteId) : null;

  return (
    <>
      <Card onClick={() => setSh("paciente")}><div className="fila-flex"><Icon name="user" /><div style={{ flex: 1 }}><b>{paciente ? `${paciente.nombres} ${paciente.apellidos}` : "Elegir paciente"}</b><div className="peq mu">{paciente ? `Crédito disponible ${dinero(disponible)}${cr ? ` de ${dinero(cr.limite)}` : " (sin línea: límite $0)"}` : "El crédito es por paciente, compartido entre sucursales"}</div></div><Badge>Cambiar</Badge></div></Card>
      {atraso && <Badge tono="bad">Paciente con atraso: requiere Dirección</Badge>}
      {cr && cr.bloqueado && <Badge tono="bad">Crédito bloqueado por el gerente</Badge>}

      <Field label="Tipo de venta"><Chips opciones={[{ v: "plazos", l: "A plazos" }, { v: "abierto", l: "Crédito abierto" }]} valor={tipo} onChange={setTipo} /></Field>
      <Field label="Origen del monto"><Chips opciones={[{ v: "productos", l: "Productos" }, { v: "monto", l: "Monto libre" }]} valor={origen} onChange={setOrigen} /></Field>

      {origen === "productos" ? (<>
        <Titulo derecha={<Button variante="ghost" icon="scan" onClick={() => setSh("producto")}>Producto</Button>}>Partidas</Titulo>
        <div className="lista">{lineas.map((l) => (
          <Card key={l.itemId}><div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{l.nombre}</b><b>{dinero(l.importe)}</b></div>
            <div style={{ marginTop: 6 }}><Cant valor={l.cant} max={R.disponible(d, sucursalId, l.itemId)} onChange={(c) => setCant(l.itemId, c)} /></div></Card>))}
          {!lineas.length && <Card><span className="mu">Agrega productos; se entregan una vez autorizado el plan.</span></Card>}</div>
      </>) : (
        <Field label="Monto de la venta"><Input type="text" inputMode="decimal" placeholder="0.00" value={montoTxt} onChange={(e) => setMontoTxt(e.target.value)} /></Field>
      )}

      {tipo === "plazos" && (<>
        <Field label={`Enganche (mínimo ${ENGANCHE_MIN_PCT} %: ${dinero(min)})`} hint="Supuesto pendiente CR4."><Input type="text" inputMode="decimal" placeholder={String(min)} value={engTxt} onChange={(e) => setEngTxt(e.target.value)} /></Field>
        <Field label="Parcialidades quincenales"><Select value={n} onChange={(e) => setN(Number(e.target.value))}>{[2, 3, 4, 6, 8, 12, 24].map((x) => <option key={x} value={x}>{x} pagos</option>)}</Select></Field>
      </>)}
      {tipo === "abierto" && <Field label="Enganche (opcional)"><Input type="text" inputMode="decimal" placeholder="0" value={engTxt} onChange={(e) => setEngTxt(e.target.value)} /></Field>}

      {sim && (<>
        <Titulo>Simulación</Titulo>
        <Card tono={excede ? "warn" : "info"}>
          <Resumen filas={[["Monto", dinero(monto)], ["Enganche", dinero(eng)], ["Financiado", dinero(fin), true], ["Crédito disponible", dinero(disponible)],
            tipo === "plazos" ? ["Recargo por pago tardío", `${params.recargoUnicoPct} % (una sola vez)`] : ["Interés mensual", `${params.interesMensualPct} % (≈ ${dinero(sim.interesMensual)}/mes)`], ["Días de gracia", `${params.diasGracia}`]]} />
        </Card>
        <div className="lista">{sim.parcialidades.map((p) => <Fila key={p.n} titulo={`Parcialidad ${p.n}`} badge={<Badge>{dinero(p.capital)}</Badge>} datos={<span>Vence {fechaCorta(p.vence)}</span>} />)}</div>
        {excede && <Badge tono="warn">El monto financiado excede el crédito disponible: sube el nivel de autorización (supuesto)</Badge>}
        <Card tono="info"><b>Autoriza: {NIVEL[nivel]}</b><p className="peq mu" style={{ margin: "4px 0 0" }}>Todo plan pasa por autorización. Hasta {dinero(params.limiteCreditoGerente)} gerente; hasta {dinero(params.limiteCreditoAdmin)} administración; más, dirección. El plan queda bloqueado hasta que se autorice.</p></Card>
      </>)}
      {err && paciente && <Badge tono="warn">{err}</Badge>}
      <BarraAccion><Button block icon="shield" loading={cargando} disabled={!!err || !sim} onClick={solicitar}>Solicitar autorización{eng > 0 ? ` y cobrar enganche ${dinero(eng)}` : ""}</Button></BarraAccion>

      <SelectorPaciente abierto={sh === "paciente"} onClose={() => setSh(null)} onElegir={(p) => setPacienteId(p.id)} />
      <BuscadorProductos abierto={sh === "producto"} onClose={() => setSh(null)} d={d} sucursalId={sucursalId} onElegir={agregar} />
      <SheetPago abierto={sh === "pago"} onClose={() => setSh(null)} total={eng} titulo="Cobrar enganche" confirmar="Cobrar enganche" onConfirmar={enviar} cargando={cargando} />
      {pl && <Comprobante onClose={nuevo} titulo="Plan solicitado" folio={pl.folio} subtitulo={`${R.nombreSucursal(d, pl.sucursalId)} · pendiente de autorización`}
        filas={[["Paciente", R.nombrePaciente(d, pl.pacienteId)], ["Tipo", pl.tipo === "abierto" ? "Crédito abierto" : `A plazos (${pl.parcialidades.length} pagos)`], ["Monto", dinero(pl.monto)], ["Enganche", dinero(pl.enganche)], ["Financiado", dinero(pl.monto - pl.enganche), true], ["Autoriza", NIVEL[listo.nivel]]]}
        texto={`*${pl.folio}* · ${pl.tipo === "abierto" ? "Crédito abierto" : "Venta a plazos"}\nMonto ${dinero(pl.monto)} · enganche ${dinero(pl.enganche)}\nFinanciado ${dinero(pl.monto - pl.enganche)}\nEstado: pendiente de autorización`} telefono={pac && pac.whatsapp ? pac.telefono : ""} />}
    </>
  );
}
