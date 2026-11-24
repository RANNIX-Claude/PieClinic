// Comprobante en pantalla + compartir por WhatsApp.
import { Button, Card, Resumen, Sheet } from "../../ui/index.jsx";
import { useSesion } from "../../shell/sesion.js";
import { dinero } from "../../lib/format.js";
import { FORMA_LABEL, ivaIncluido, textoTicket } from "../../store/acciones_cajero.js";
import { nombrePaciente, nombreSucursal } from "../../store/reglas.js";

export function compartirWhatsApp(texto, telefono) {
  const dig = String(telefono || "").replace(/\D/g, "");
  const url = `https://wa.me/${dig ? (dig.length === 10 ? "52" + dig : dig) : ""}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener");
}

/** Comprobante genérico. filas: [[k, v, fuerte]]; texto: lo que se manda por WhatsApp. */
export function Comprobante({ abierto = true, onClose, titulo, folio, subtitulo, filas, texto, telefono, encabezado }) {
  return (
    <Sheet abierto={abierto} onClose={onClose} titulo={titulo}
      pie={<div className="dos"><Button variante="sec" block icon="message" onClick={() => compartirWhatsApp(texto, telefono)}>WhatsApp</Button><Button block onClick={onClose}>Listo</Button></div>}>
      <Card><div className="form"><div style={{ display: "flex", justifyContent: "center" }}><div style={{ width: 84, height: 84, overflow: "hidden", borderRadius: "50%", position: "relative" }}><img src="/app/logo-pie-clinic.webp" alt="Pie Clinic" style={{ position: "absolute", width: 210, height: 210, left: -63, top: -63, maxWidth: "none" }} /></div></div>{encabezado}<div className="peq mu" style={{ textAlign: "center" }}>{subtitulo}</div><div className="fuerte" style={{ fontSize: 20, textAlign: "center" }}>{folio}</div><Resumen filas={filas} /></div></Card>
    </Sheet>
  );
}

export default function Ticket({ venta, onClose }) {
  const { d } = useSesion();
  if (!venta) return null;
  const pac = d.pacientes.find((p) => p.id === venta.pacienteId);
  const suc = d.sucursales.find((s) => s.id === venta.sucursalId);
  const iva = ivaIncluido(venta);
  const filas = [
    ["Paciente", venta.pacienteId ? nombrePaciente(d, venta.pacienteId) : "Público general"],
    ...venta.partidas.map((p) => [`${p.cant} × ${p.nombre}`, dinero(p.importe)]),
    venta.descuento ? ["Descuento", "-" + dinero(venta.descuento)] : null,
    ...venta.pagos.map((p) => [FORMA_LABEL[p.forma] || p.forma, dinero(p.monto)]),
    venta.cambio ? ["Cambio", dinero(venta.cambio)] : null,
    venta.factura ? ["Factura", `${venta.factura.rfc} · ${venta.factura.usoCfdi}`] : null,
    venta.pendiente ? ["Descuento", "por autorizar (PA-V6)"] : null,
    iva ? ["IVA 16 % incluido (productos)", dinero(iva)] : null,
    ["Total", dinero(venta.total), true],
  ];
  const c = { textAlign: "center", lineHeight: 1.35 };
  const encabezado = (
    <div style={{ ...c, padding: "2px 4px 6px" }}>
      <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>PIE CLINIC · Orto-Podólogos</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Sucursal {nombreSucursal(d, venta.sucursalId)}</div>
      {suc?.direccion && <div className="peq mu" style={{ marginTop: 4 }}>{suc.direccion}</div>}
      {suc?.telefono && <div className="peq mu">Tel. {suc.telefono}{suc.movil ? ` · WhatsApp ${suc.movil}` : ""}</div>}
      {suc?.horario && <div className="peq mu">Horario: {suc.horario}</div>}
    </div>
  );
  return <Comprobante encabezado={encabezado} onClose={onClose} titulo="Pie Clinic · Ticket" folio={venta.folio} subtitulo={`${nombreSucursal(d, venta.sucursalId)} · ${String(venta.fecha).replace("T", " ")}`} filas={filas} texto={textoTicket(d, venta)} telefono={pac && pac.whatsapp ? pac.telefono : ""} />;
}
