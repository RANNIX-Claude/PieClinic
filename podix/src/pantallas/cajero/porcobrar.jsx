// Consultas cerradas sin cobrar y anticipos de plantillas pendientes.
import { useState } from "react";
import { useSesion, useIr } from "../../shell/sesion.js";
import { mutar } from "../../store/core.js";
import * as R from "../../store/reglas.js";
import { cobrarAnticipoLab } from "../../store/acciones_cajero.js";
import { Badge, Card, Fila, Titulo, Vacio, aviso } from "../../ui/index.jsx";
import { dinero, fechaCorta, hora } from "../../lib/format.js";
import SheetPago from "../../componentes/cajero/PagoMixto.jsx";
import Ticket from "../../componentes/cajero/Comprobante.jsx";
import { SinTurno } from "../../componentes/cajero/piezas.jsx";

export default function PorCobrar() {
  const { d, u, sucursalId } = useSesion();
  const ir = useIr();
  const turno = R.turnoAbierto(d, u.id);
  const [orden, setOrden] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [cargando, setCargando] = useState(false);
  const consultas = R.consultasPorCobrar(d, sucursalId).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const anticipos = d.ordenesLab.filter((o) => o.sucursalId === sucursalId && o.anticipoPendiente > 0);
  const estimado = (c) => c.servicios.reduce((a, s) => a + R.precioFinal(d, sucursalId, "servicio", s.servicioId) * (s.cant || 1), 0);
  const ord = orden ? d.ordenesLab.find((o) => o.id === orden) : null;

  const cobrarAnticipo = (pagos) => {
    setCargando(true);
    const r = mutar((dd) => cobrarAnticipoLab(dd, { ordenId: orden, pagos }));
    setCargando(false);
    if (!r.ok) return aviso(r.error, "bad");
    aviso(`Anticipo cobrado ${r.venta.folio}`); setOrden(null); setTicket(r.venta);
  };

  return (
    <>
      {!turno && <SinTurno texto="Puedes revisar los pendientes, pero para cobrar abre tu turno." />}
      <Titulo derecha={<Badge tono={consultas.length ? "warn" : "ok"}>{consultas.length}</Badge>}>Consultas por cobrar</Titulo>
      <div className="lista">
        {consultas.map((c) => (
          <Fila key={c.id} titulo={R.nombrePaciente(d, c.pacienteId)} sub={c.servicios.map((s) => R.nombreServicio(d, s.servicioId)).join(", ")}
            badge={<Badge tono="info">{dinero(estimado(c))}</Badge>} datos={<><span>{fechaCorta(c.fecha)} {hora(c.fecha)}</span><span>{R.nombreUsuario(d, c.podologoId)}</span><span>Total estimado</span></>}
            onClick={() => ir("cobrar", { consulta: c.id })} />
        ))}
        {!consultas.length && <Vacio icon="check">Nada por cobrar en esta sucursal.</Vacio>}
      </div>

      <Titulo derecha={<Badge tono={anticipos.length ? "warn" : "ok"}>{anticipos.length}</Badge>}>Anticipos de plantillas</Titulo>
      <div className="lista">
        {anticipos.map((o) => (
          <Fila key={o.id} titulo={R.nombrePaciente(d, o.pacienteId)} sub={`${o.tipo} · ${o.folio}`} badge={<Badge tono="warn">{dinero(o.anticipoPendiente)}</Badge>}
            datos={<><span>{o.anticipoPct ? `${o.anticipoPct} % de anticipo` : "Anticipo"}</span><span>{R.nombreUsuario(d, o.podologoId)}</span></>}
            onClick={() => (turno ? setOrden(o.id) : aviso("Abre tu turno para cobrar.", "warn"))} />
        ))}
        {!anticipos.length && <Card><span className="mu">Sin anticipos pendientes. Los crea el podólogo al prescribir una plantilla.</span></Card>}
      </div>

      <SheetPago abierto={!!ord} onClose={() => setOrden(null)} total={ord ? ord.anticipoPendiente : 0} titulo={ord ? `Anticipo ${ord.folio}` : ""} confirmar="Cobrar anticipo" onConfirmar={cobrarAnticipo} cargando={cargando} />
      {ticket && <Ticket venta={ticket} onClose={() => setTicket(null)} />}
    </>
  );
}
