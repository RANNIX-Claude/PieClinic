// Selectores derivados. Los de "badge" alimentan los números del menú inferior (todos salen de datos que existen).
import { hoy, dia } from "../lib/format.js";
import { mensajesNoLeidos, correosNoLeidos, feedNuevos } from "./acciones_comunicacion.js";
import { consultasPorCobrar, bajoMinimo, estadoApartado, puedeResolver, turnoAbierto, estadoParcialidad } from "./reglas.js";

export const usuarioActual = (d) => d.usuarios.find((u) => u.id === d.sesion.userId) || null;

export const citasDelDia = (d, sucursalId, fecha = hoy()) =>
  d.citas.filter((c) => c.sucursalId === sucursalId && dia(c.inicio) === fecha).sort((a, b) => a.inicio.localeCompare(b.inicio));

const ACTIVAS = ["agendada", "por_confirmar", "confirmada", "en_sala", "en_atencion"];

export const badges = {
  recepcionPendientes: (d, u, s) => d.citas.filter((c) => c.sucursalId === s && dia(c.inicio) >= hoy() && c.estado === "por_confirmar").length,
  podologoHoy: (d, u, s) => d.citas.filter((c) => c.podologoId === u.id && c.sucursalId === s && dia(c.inicio) === hoy() && ACTIVAS.includes(c.estado)).length,
  podologoOrdenes: (d, u) => d.ordenesLab.filter((o) => o.podologoId === u.id && o.estado === "retrasada").length,
  asistenteSets: (d, u, s) => d.sets.filter((x) => x.sucursalId === s && x.estado === "sucio").length,
  asistenteBitacoras: (d, u, s) => d.checklists.filter((c) => c.sucursalId === s && c.fecha === hoy() && !c.hecho).length,
  cajeroPorCobrar: (d, u, s) => consultasPorCobrar(d, s).length,
  cajeroCaja: (d, u) => (turnoAbierto(d, u.id) ? 0 : "!"),
  almacenRecibir: (d, u, s) => {
    const alm = u.almacenCentral ? "CEN" : s;
    return d.traspasos.filter((t) => t.destinoId === alm && t.estado === "en_transito").length + (u.almacenCentral ? d.oc.filter((o) => ["enviada", "recibida_parcial"].includes(o.estado)).length : 0);
  },
  gerenteAutorizar: (d, u, s) => d.autorizaciones.filter((a) => a.estado === "pendiente" && a.sucursalId === s && puedeResolver(u, a)).length,
  gerenteAlertas: (d, u, s) =>
    bajoMinimo(d, s).length + d.apartados.filter((a) => a.sucursalId === s && estadoApartado(a) === "por_vencer").length + d.ordenesLab.filter((o) => o.sucursalId === s && o.estado === "retrasada").length
    + d.turnos.filter((t) => t.sucursalId === s && t.corte && t.corte.estado === "diferencia_pendiente").length
    + d.ciclos.filter((c) => c.sucursalId === s && c.indicadorBiologico === "pendiente").length,
  adminAutorizar: (d, u) => d.autorizaciones.filter((a) => a.estado === "pendiente" && puedeResolver(u, a)).length,
  mensajesNoLeidos: (d, u) => mensajesNoLeidos(d, u.id),
  correosNoLeidos: (d, u) => correosNoLeidos(d, u.id),
  feedNuevos: (d, u) => feedNuevos(d, u.id),
  adminCompras: (d) => d.cxp.filter((c) => c.vence < hoy() && c.saldo > 0).length,
};
export function badgeDe(nombre, d, u, s) {
  const f = badges[nombre];
  if (!f || !u) return 0;
  try { return f(d, u, s); } catch { return 0; }
}

/** Parcialidades vencidas de toda la cartera (para tableros). */
export function carteraVencida(d, sucursalId) {
  let total = 0;
  d.planes.filter((p) => !sucursalId || p.sucursalId === sucursalId).forEach((p) => {
    const par = d.params[p.sucursalId];
    p.parcialidades.forEach((x) => { if (estadoParcialidad(x, par) === "vencida") total += x.capital - x.pagado; });
  });
  return Math.round(total * 100) / 100;
}
