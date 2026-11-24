// Ventas del turno abierto: ver/compartir ticket y solicitar cancelación (autoriza el gerente).
import { useState } from "react";
import { useSesion } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { FORMA_LABEL, solicitarCancelacion } from "../../store/acciones_cajero.js";
import { Area, Badge, Button, Field, Fila, Kpi, Sheet, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, hora } from "../../lib/format.js";
import Ticket from "../../componentes/cajero/Comprobante.jsx";
import { SinTurno } from "../../componentes/cajero/piezas.jsx";

const TONO = { pagada: "ok", cancelada: "bad", con_devolucion: "info", a_credito: "info" };

export default function VentasTurno() {
  const { d, u } = useSesion();
  const turno = R.turnoAbierto(d, u.id);
  const [ver, setVer] = useState(null);
  const [canc, setCanc] = useState(null);
  const [motivo, setMotivo] = useState("");
  if (!turno) return <SinTurno texto="No tienes un turno abierto; no hay ventas que mostrar." />;
  const ventas = d.ventas.filter((v) => v.turnoId === turno.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = R.ventasDeTurno(d, turno.id).reduce((a, v) => a + v.total, 0);
  const v = ver ? d.ventas.find((x) => x.id === ver) : null;
  const c = canc ? d.ventas.find((x) => x.id === canc) : null;
  const pendiente = (id) => d.autorizaciones.some((a) => a.tipo === "cancelacion" && a.estado === "pendiente" && a.ref?.ventaId === id);

  const pedir = () => {
    const r = mutar((dd) => solicitarCancelacion(dd, { ventaId: c.id, motivo }));
    if (!r.ok) return aviso(r.error, "bad");
    aviso("Cancelación enviada al gerente"); setCanc(null); setMotivo("");
  };
  return (
    <>
      <div className="kpis"><Kpi label="Tickets" valor={ventas.length} /><Kpi label="Vendido" valor={dinero(total)} tono="ok" /></div>
      <div className="lista">
        {ventas.map((x) => (
          <Fila key={x.id} titulo={`${x.folio} · ${dinero(x.total)}`} sub={x.pacienteId ? R.nombrePaciente(d, x.pacienteId) : "Público general"}
            badge={pendiente(x.id) ? <Badge tono="warn">Cancelación pendiente</Badge> : <Badge tono={TONO[x.estado] || "neutral"}>{x.estado.replace("_", " ")}</Badge>}
            datos={<><span>{hora(x.fecha)}</span><span>{x.pagos.map((p) => FORMA_LABEL[p.forma]).join(" + ")}</span>{x.tipo !== "contado" && <span>{x.tipo.replace("_", " ")}</span>}</>}
            derecha={x.estado === "pagada" && !pendiente(x.id) ? <Button variante="ghost" className="btn-peq" onClick={(e) => { e.stopPropagation(); setCanc(x.id); }}>Cancelar</Button> : null}
            onClick={() => setVer(x.id)} />
        ))}
        {!ventas.length && <Vacio icon="receipt">Aún no hay ventas en este turno.</Vacio>}
      </div>

      {v && <Ticket venta={v} onClose={() => setVer(null)} />}
      <Sheet abierto={!!c} onClose={() => setCanc(null)} titulo={c ? `Cancelar ${c.folio}` : ""} pie={<Button block variante="danger" disabled={!motivo.trim()} onClick={pedir}>Solicitar cancelación</Button>}>
        <p className="txt">La venta no se cancela directamente: el gerente debe autorizarla. Al autorizar, el producto regresa al inventario.</p>
        <Field label="Motivo"><Area value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
      </Sheet>
    </>
  );
}
