// Caja: apertura de turno, movimientos, cambio de turno con arqueo ciego y corte firmado.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { FORMAS, FORMA_LABEL, abrirTurno, agregarMovimiento, arqueo, cerrarTurno, solicitarReapertura } from "../../store/acciones_cajero.js";
import { Area, Badge, BarraAccion, Button, Card, Chips, Field, Fila, Input, Kpi, Pasos, Resumen, Select, Sheet, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta, hoy, hora } from "../../lib/format.js";
import Firma from "../../componentes/cajero/Firma.jsx";

const TIPO_MOV = { retiro: "Retiro", deposito: "Depósito", gasto: "Gasto menor", anticipo: "Anticipo apartado", abono_apartado: "Abono apartado", abono_credito: "Abono crédito", enganche: "Enganche", devolucion: "Devolución", devolucion_anticipo: "Devol. anticipo" };

export default function Caja() {
  const { d, u, sucursalId } = useSesion();
  const nav = useNavigate();
  const turno = R.turnoAbierto(d, u.id);
  const [sh, setSh] = useState(null);
  // apertura
  const [tn, setTn] = useState(new Date().getHours() < 14 ? "Matutino" : "Vespertino");
  const [fondo, setFondo] = useState("1500");
  // movimiento
  const [mv, setMv] = useState({ tipo: "retiro", concepto: "", monto: "" });
  // cierre
  const [paso, setPaso] = useState(0);
  const [contado, setContado] = useState({ efectivo: "", tarjeta: "", transferencia: "" });
  const [just, setJust] = useState("");
  const [recibe, setRecibe] = useState("");
  const [firma, setFirma] = useState(null);
  const [cargando, setCargando] = useState(false);

  const abrir = () => {
    const r = mutar((dd) => abrirTurno(dd, { fondo, turno: tn }));
    r.ok ? aviso("Turno abierto") : aviso(r.error, "bad");
  };
  const movimiento = () => {
    const r = mutar((dd) => agregarMovimiento(dd, mv));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Movimiento registrado"); setSh(null); setMv({ tipo: "retiro", concepto: "", monto: "" });
  };
  const cerrarSheet = () => { setSh(null); setPaso(0); setContado({ efectivo: "", tarjeta: "", transferencia: "" }); setJust(""); setRecibe(""); setFirma(null); };
  const cerrar = () => {
    setCargando(true);
    const r = mutar((dd) => cerrarTurno(dd, { contado, justificacion: just, recibeId: recibe, firma }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(r.corte.estado === "conforme" ? "Turno cerrado: corte conforme" : "Turno cerrado con diferencia pendiente de aprobar", r.corte.estado === "conforme" ? "ok" : "warn");
    cerrarSheet();
  };
  const reabrir = (t) => { const r = mutar((dd) => solicitarReapertura(dd, { turnoId: t.id })); r.ok ? aviso("Reapertura solicitada al gerente") : aviso(r.error, "bad"); };

  const otros = d.usuarios.filter((x) => x.rol === "cajero" && x.sucursales.includes(sucursalId) && x.id !== u.id);

  // ───────── Sin turno: apertura + cortes recientes
  if (!turno) {
    const cerrados = d.turnos.filter((t) => t.cajeroId === u.id && t.estado === "cerrado").sort((a, b) => b.abiertoEn.localeCompare(a.abiertoEn)).slice(0, 5);
    return (
      <>
        <Card tono="warn"><div className="form"><b>No hay turno abierto</b><span className="mu">Abre tu turno con el fondo inicial para poder cobrar.</span></div></Card>
        <div className="form">
          <Field label="Turno"><Chips opciones={[{ v: "Matutino", l: "Matutino" }, { v: "Vespertino", l: "Vespertino" }]} valor={tn} onChange={setTn} /></Field>
          <Field label="Fondo inicial (efectivo)"><Input type="text" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} /></Field>
        </div>
        <BarraAccion><Button block icon="cash" onClick={abrir}>Abrir turno {tn.toLowerCase()}</Button></BarraAccion>
        <Titulo>Cortes recientes</Titulo>
        <div className="lista">
          {cerrados.map((t) => {
            const pendRe = d.autorizaciones.find((a) => a.tipo === "reapertura_corte" && a.estado === "pendiente" && a.ref?.turnoId === t.id);
            return (
              <Card key={t.id}>
                <div className="fila-flex" style={{ justifyContent: "space-between" }}><b>{t.turno} · {fechaCorta(t.abiertoEn)}</b>
                  {t.corte && <Badge tono={t.corte.estado === "conforme" ? "ok" : t.corte.estado === "aprobado" ? "info" : "warn"}>{t.corte.estado === "conforme" ? "Conforme" : t.corte.estado === "diferencia_pendiente" ? "Diferencia pendiente" : t.corte.estado}</Badge>}</div>
                {t.corte && <Resumen filas={t.corte.filas.filter((x) => x.esperado || x.contado).map((x) => [FORMA_LABEL[x.forma] || x.forma, `${dinero(x.contado)} (${x.diferencia >= 0 ? "+" : ""}${dinero(x.diferencia)})`])} />}
                {t.corte?.justificacion && <p className="txt peq mu">Justificación: {t.corte.justificacion}</p>}
                <div style={{ marginTop: 8 }}>{pendRe ? <Badge tono="info">Reapertura pendiente de autorización</Badge> : <Button variante="ghost" block icon="lock" onClick={() => reabrir(t)}>Solicitar reapertura</Button>}</div>
              </Card>);
          })}
          {!cerrados.length && <Vacio icon="cash">Aún no hay cortes tuyos.</Vacio>}
        </div>
      </>
    );
  }

  // ───────── Turno abierto
  const ventas = R.ventasDeTurno(d, turno.id);
  const totalVentas = ventas.reduce((a, v) => a + v.total, 0);
  const porForma = {};
  ventas.forEach((v) => v.pagos.forEach((p) => { porForma[p.forma] = (porForma[p.forma] || 0) + p.monto; }));
  const esperado = R.esperadoTurno(d, turno);
  const aq = arqueo(esperado, contado);
  const hayConteo = FORMAS.every((f) => String(contado[f]).trim() !== "");

  return (
    <>
      <div className="kpis">
        <Kpi label="Turno" valor={turno.turno} nota={`Desde ${hora(turno.abiertoEn)} · fondo ${dinero(turno.fondo)}`} />
        <Kpi label="Ventas" valor={dinero(totalVentas)} nota={`${ventas.length} tickets`} tono="ok" />
      </div>
      <Card>
        <Titulo>Cobrado por forma de pago</Titulo>
        <Resumen filas={FORMAS.map((f) => [FORMA_LABEL[f], dinero(porForma[f] || 0)])} />
        <p className="peq mu" style={{ margin: "8px 0 0" }}>El esperado en caja se muestra al capturar el conteo en el cambio de turno (arqueo a ciegas).</p>
      </Card>
      <div className="dos">
        <Button variante="sec" block icon="receipt" onClick={() => nav("/mas/ventas-turno")}>Ventas del turno</Button>
        <Button variante="sec" block icon="plus" onClick={() => setSh("mov")}>Movimiento</Button>
      </div>

      <Titulo>Movimientos de caja</Titulo>
      <div className="lista">
        {turno.movimientos.slice().reverse().map((m) => (
          <Fila key={m.id} titulo={m.concepto} sub={`${TIPO_MOV[m.tipo] || m.tipo} · ${FORMA_LABEL[m.forma] || m.forma}`} badge={<Badge tono={m.monto < 0 ? "bad" : "ok"}>{dinero(m.monto)}</Badge>} datos={<span>{m.hora}</span>} />
        ))}
        {!turno.movimientos.length && <Vacio icon="cash">Sin movimientos en este turno.</Vacio>}
      </div>

      <BarraAccion><Button block icon="lock" onClick={() => setSh("cierre")}>Cambio de turno y corte</Button></BarraAccion>

      <Sheet abierto={sh === "mov"} onClose={() => setSh(null)} titulo="Movimiento de caja" pie={<Button block onClick={movimiento}>Registrar</Button>}>
        <Chips opciones={[{ v: "retiro", l: "Retiro" }, { v: "deposito", l: "Depósito" }, { v: "gasto", l: "Gasto menor" }]} valor={mv.tipo} onChange={(v) => setMv({ ...mv, tipo: v })} />
        <Field label="Concepto"><Input value={mv.concepto} onChange={(e) => setMv({ ...mv, concepto: e.target.value })} placeholder="Ej. Depósito parcial a banco" /></Field>
        <Field label="Monto (efectivo)" hint={mv.tipo === "deposito" ? "Entra efectivo a la caja." : "Sale efectivo de la caja."}><Input type="text" inputMode="decimal" value={mv.monto} onChange={(e) => setMv({ ...mv, monto: e.target.value })} placeholder="0.00" /></Field>
      </Sheet>

      <Sheet abierto={sh === "cierre"} onClose={cerrarSheet} titulo="Cambio de turno y corte"
        pie={paso === 0 ? <Button block disabled={!hayConteo} onClick={() => setPaso(1)}>Ver diferencias</Button>
          : paso === 1 ? <div className="dos"><Button variante="sec" block onClick={() => setPaso(0)}>Recontar</Button><Button block disabled={aq.hayDiferencia && !just.trim()} onClick={() => setPaso(2)}>Continuar</Button></div>
          : <div className="dos"><Button variante="sec" block onClick={() => setPaso(1)}>Atrás</Button><Button block loading={cargando} disabled={!firma || !recibe} onClick={cerrar}>Cerrar turno</Button></div>}>
        <Pasos titulos={["Conteo a ciegas", "Esperado y diferencias", "Firma y entrega"]} paso={paso} />
        {paso === 0 && (<div className="form">
          <p className="txt">Cuenta lo que hay físicamente y captura por forma de pago. No se muestra el esperado hasta continuar.</p>
          {FORMAS.map((f) => <Field key={f} label={`${FORMA_LABEL[f]} contado`}><Input type="text" inputMode="decimal" placeholder="0.00" value={contado[f]} onChange={(e) => setContado({ ...contado, [f]: e.target.value })} /></Field>)}
        </div>)}
        {paso === 1 && (<div className="form">
          {aq.filas.map((x) => (
            <Card key={x.forma} tono={Math.abs(x.diferencia) < 0.005 ? "ok" : "bad"}>
              <b>{FORMA_LABEL[x.forma] || x.forma}</b>
              <Resumen filas={[["Esperado", dinero(x.esperado)], ["Contado", dinero(x.contado)], ["Diferencia", `${x.diferencia > 0 ? "+" : ""}${dinero(x.diferencia)}`, true]]} />
            </Card>))}
          {aq.hayDiferencia ? <Field label="Justificación de la diferencia (obligatoria)"><Area value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ej. Cambio mal dado" /></Field> : <Badge tono="ok">Sin diferencias: corte conforme</Badge>}
          {aq.hayDiferencia && <small className="mu">El gerente aprobará la diferencia en su pantalla.</small>}
        </div>)}
        {paso === 2 && (<div className="form">
          <Field label="Cajero que recibe el turno">
            <Select value={recibe} onChange={(e) => setRecibe(e.target.value)}><option value="">Elegir…</option>{otros.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</Select>
          </Field>
          <Field label={`Firma de quien entrega (${u.nombre})`}><Firma onChange={setFirma} /></Field>
        </div>)}
      </Sheet>
    </>
  );
}
