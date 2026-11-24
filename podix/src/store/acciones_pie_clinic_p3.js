// Demo Pie Clinic · Prioridad 3: pacientes dormidos (campaña de reactivación por WhatsApp simulado) y el caso de consulta en Pabellón del Valle
// (uña encarnada → extracción → plantilla a medida → curaciones +3/+7/+14 que se agendan solas → comisión y bono al cierre).
import { auditar, uid, folio } from "./core.js";
import * as R from "./reglas.js";
import { wa } from "./acciones_pie_clinic.js";
import { hoy, sumarDias } from "../lib/format.js";

const err = (error) => ({ ok: false, error });
const nombreSuc = (d, sid) => (d.sucursales.find((s) => s.id === sid) || { nombre: sid }).nombre;

// ───────────────────────── Pacientes dormidos
export const SEGMENTOS_DORMIDOS = [
  { v: "dormido_3m", l: "3 meses" },
  { v: "dormido_6m", l: "6 meses" },
  { v: "dormido_12m", l: "12 meses o más" },
];
export const diasSinVisita = (p) => Math.round((new Date(`${hoy()}T00:00`) - new Date(`${p.ultimaVisita}T00:00`)) / 86400000);
export const dormidos = (d, segmento, sucursalId = null) =>
  d.pacientes.filter((p) => p.segmento === segmento && p.activo !== false && p.whatsapp && (!sucursalId || p.sucursalAlta === sucursalId))
    .sort((a, b) => diasSinVisita(b) - diasSinVisita(a));
export function mensajeReactivacion(d, p, segmento) {
  const suc = nombreSuc(d, p.sucursalAlta);
  const meses = segmento === "dormido_3m" ? "unos 3 meses" : segmento === "dormido_6m" ? "unos 6 meses" : "más de un año";
  const oferta = segmento === "dormido_12m" ? "Te esperamos con una revisión de cortesía" : segmento === "dormido_6m" ? "Esta semana tienes 15 % en tu consulta de revisión" : "Agenda tu cita de seguimiento sin costo de valoración";
  return `Hola ${p.nombres}, te saludamos de Pie Clinic ${suc}. Hace ${meses} que no te vemos y cuidar tus pies es cuidar tu salud. ${oferta}. Responde a este mensaje y te agendamos.`;
}
/** Envía (simulado) el mensaje sugerido a los pacientes elegidos; cada envío aparece en el celular y queda en la bitácora. */
export function enviarReactivacion(d, { pacienteIds, segmento }, u) {
  if (!u || !["admin", "direccion", "gerente", "recepcion"].includes(u.rol)) return err("Tu rol no envía campañas.");
  const ps = pacienteIds.map((id) => d.pacientes.find((p) => p.id === id)).filter(Boolean);
  if (!ps.length) return err("Elige al menos un paciente.");
  const camp = { id: uid("CR"), fecha: hoy(), segmento, enviados: ps.length, por: u.id };
  (d.campanasReactivacion ||= []).unshift(camp);
  ps.forEach((p) => { wa(d, "campana", `Para ${p.nombres}: ${mensajeReactivacion(d, p, segmento)}`, p.sucursalAlta); p.ultimoContacto = hoy(); });
  auditar(d, "campana_reactivacion", "campana", camp.id, `${ps.length} pacientes · ${segmento}`);
  return { ok: true, campana: camp };
}

// ───────────────────────── Caso de consulta en Pabellón del Valle (S7)
export const SUCURSAL_CASO = "S7";
export const COMISION_SERVICIOS_PCT = 10;   // SUPUESTO (PA-V5): 10 % del servicio
export const COMISION_PLANTILLA_PCT = 5;    // SUPUESTO: 5 % de la plantilla
export const BONO_PLANTILLA = 100;          // SUPUESTO: bono fijo por plantilla a medida vendida
const servicioPor = (d, parte) => d.servicios.find((s) => s.nombre.startsWith(parte));
const esPlantilla = (d, p) => p.tipo === "producto" && /^PLA-01[0-2]$/.test((d.productos.find((x) => x.id === p.itemId) || {}).sku || "");

export const casoActual = (d) => (d.casosDemo || [])[0] || null;
export const podologoDe = (d, sid) => d.usuarios.find((u) => u.rol === "podologo" && u.sucursales.includes(sid));

export function iniciarCaso(d, { pacienteId }, u) {
  if (!u) return err("Inicia sesión.");
  const p = d.pacientes.find((x) => x.id === pacienteId);
  const pod = podologoDe(d, SUCURSAL_CASO);
  if (!p || !pod) return err("Falta el paciente o el podólogo de Pabellón del Valle.");
  const caso = { id: uid("CD"), folio: folio(d, "CD"), pacienteId, podologoId: pod.id, sucursalId: SUCURSAL_CASO, paso: 1, fecha: hoy() };
  (d.casosDemo ||= []).unshift(caso);
  auditar(d, "caso_inicio", "paciente", pacienteId, `Consulta en ${nombreSuc(d, SUCURSAL_CASO)}`);
  return { ok: true, caso };
}
export function diagnosticarCaso(d) {
  const c = casoActual(d); if (!c || c.paso !== 1) return err("Primero inicia el caso.");
  c.diagnostico = "L60.0 Uña encarnada (onicocriptosis) del hallux derecho";
  c.nota = "Dolor, eritema y tejido de granulación en borde lateral. Se indica extracción de uña con curaciones.";
  c.paso = 2; auditar(d, "caso_diagnostico", "caso", c.id, c.diagnostico);
  return { ok: true };
}
/** Extracción de uña: las curaciones a +3, +7 y +14 días se agendan solas con el mismo podólogo. */
export function extraerYAgendarCuraciones(d) {
  const c = casoActual(d); if (!c || c.paso !== 2) return err("Primero registra el diagnóstico.");
  const ext = servicioPor(d, "Extracción de uña"), cur = servicioPor(d, "Curación posterior");
  if (!ext || !cur) return err("Faltan los servicios en el catálogo.");
  c.servicioId = ext.id;
  c.curaciones = [3, 7, 14].map((n) => {
    const cita = { id: uid("CI"), pacienteId: c.pacienteId, servicioId: cur.id, podologoId: c.podologoId, consultorioId: "C1", sucursalId: c.sucursalId, inicio: `${sumarDias(hoy(), n)}T10:00`, duracion: cur.duracion, estado: "agendada", recordatorio: "whatsapp", aDomicilio: false, origen: "curacion_automatica", casoId: c.id };
    d.citas.push(cita);
    return { dias: n, citaId: cita.id, fecha: sumarDias(hoy(), n) };
  });
  const pac = d.pacientes.find((x) => x.id === c.pacienteId);
  wa(d, "agenda", `Hola ${pac.nombres}: tus curaciones quedaron agendadas en Pie Clinic Pabellón del Valle el ${c.curaciones.map((x) => x.fecha.slice(8, 10) + "/" + x.fecha.slice(5, 7)).join(", ")} a las 10:00.`, c.sucursalId);
  c.paso = 3; auditar(d, "caso_curaciones", "caso", c.id, "Curaciones +3, +7 y +14 agendadas");
  return { ok: true };
}
/** Venta del día: extracción + plantilla a medida (laboratorio externo). Descuenta existencia por PEPS. */
export function venderCaso(d) {
  const c = casoActual(d); if (!c || c.paso !== 3) return err("Primero agenda las curaciones.");
  const ext = d.servicios.find((s) => s.id === c.servicioId), pl = d.productos.find((p) => p.sku === "PLA-010");
  if (R.stock(d, c.sucursalId, pl.id) < 1) R.entradaCapa(d, c.sucursalId, pl.id, 2, pl.costo, "DEMO");
  const s = R.salidaPEPS(d, c.sucursalId, pl.id, 1);
  const cajero = d.usuarios.find((x) => x.rol === "cajero" && x.sucursales[0] === c.sucursalId);
  const partidas = [
    { tipo: "servicio", itemId: ext.id, nombre: ext.nombre, cant: 1, precioLista: ext.precioBase, ajustePct: 0, precio: ext.precioBase, importe: ext.precioBase },
    { tipo: "producto", itemId: pl.id, nombre: pl.nombre, cant: 1, precioLista: pl.precioBase, ajustePct: 0, precio: pl.precioBase, importe: pl.precioBase, costo: Math.round(s.costo * 100) / 100 },
  ];
  const total = partidas.reduce((a, x) => a + x.importe, 0);
  const v = {
    id: uid("VE"), folio: folio(d, "T"), sucursalId: c.sucursalId, cajeroId: cajero ? cajero.id : null, pacienteId: c.pacienteId, tipo: "contado",
    fecha: `${hoy()}T${new Date().toTimeString().slice(0, 5)}`, partidas, subtotal: total, descuento: 0, total, pagos: [{ forma: "tarjeta", monto: total }],
    estado: "pagada", facturar: false, turnoId: "hist", vendedorId: c.podologoId,
  };
  d.ventas.push(v);
  c.ventaId = v.id; c.total = total; c.laboratorio = "Plantilla de piel a medida: se manda al laboratorio externo; entrega en 5 días.";
  c.paso = 4; auditar(d, "caso_venta", "venta", v.id, `${v.folio} · ${total}`);
  return { ok: true, venta: v };
}
/** Cierre: comisión y bono del podólogo con la venta del caso y lo acumulado del mes. */
export function cerrarCaso(d) {
  const c = casoActual(d); if (!c || c.paso !== 4) return err("Primero registra la venta.");
  const v = d.ventas.find((x) => x.id === c.ventaId);
  const servicios = v.partidas.filter((p) => p.tipo === "servicio").reduce((a, p) => a + p.importe, 0);
  const pls = v.partidas.filter((p) => esPlantilla(d, p));
  const plantillas = pls.reduce((a, p) => a + p.importe, 0), nPl = pls.reduce((a, p) => a + p.cant, 0);
  const comServ = Math.round(servicios * COMISION_SERVICIOS_PCT) / 100, comPl = Math.round(plantillas * COMISION_PLANTILLA_PCT) / 100, bono = nPl * BONO_PLANTILLA;
  const mes = hoy().slice(0, 7);
  const delMes = d.ventas.filter((x) => x.vendedorId === c.podologoId && x.estado !== "cancelada" && String(x.fecha).startsWith(mes)).reduce((a, x) => a + x.total, 0);
  c.cierre = { servicios, plantillas, comisionServicios: comServ, comisionPlantilla: comPl, bonoPlantilla: bono, totalCaso: Math.round((comServ + comPl + bono) * 100) / 100, ventasMesPodologo: delMes };
  c.paso = 5; auditar(d, "caso_cierre", "caso", c.id, `Comisión y bono ${c.cierre.totalCaso}`);
  return { ok: true, cierre: c.cierre };
}
