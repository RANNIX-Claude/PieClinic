// Acciones transversales que varias pantallas comparten. Cada una corre dentro de mutar().
import { mutar, auditar } from "./core.js";
import { entradaCapa, salidaPEPS, pedirAutorizacion, puedeResolver, estadoApartado, stock } from "./reglas.js";
import { sumarDias, hoy } from "../lib/format.js";

/**
 * Convención de `ref` por tipo de autorización (quien la solicita la crea con pedirAutorizacion(d, {..., ref})):
 *   credito           { planId }                     plan.estado "pendiente_autorizacion" → "vigente" | "cancelado"
 *   prorroga          { apartadoId, dias }           apartado.vence += dias
 *   ajuste_inventario { almacenId, productoId, cant } cant con signo (−merma, +sobrante); se aplica con PEPS
 *   cancelacion       { ventaId }                    venta → "cancelada" y regresa el producto al inventario
 *   reapertura_corte  { turnoId }                    turno cerrado → "abierto"
 *   descuento         { ventaId, pct }               informativo
 */
export function resolverAutorizacion(id, decision, motivo = "") {
  return mutar((d) => {
    const a = d.autorizaciones.find((x) => x.id === id);
    const u = d.usuarios.find((x) => x.id === d.sesion.userId);
    if (!a || a.estado !== "pendiente") return { ok: false, error: "La solicitud ya fue resuelta." };
    if (!puedeResolver(u, a)) return { ok: false, error: "Esta solicitud requiere un nivel de autorización superior." };
    if (decision === "escalar") {
      a.nivel = a.nivel === "gerente" ? "admin" : "direccion"; a.estado = "pendiente"; a.motivo = motivo;
      auditar(d, "autorizacion_escalada", "autorizacion", id, motivo);
      return { ok: true };
    }
    if (decision === "autorizar" && a.tipo === "ajuste_inventario" && a.ref && a.ref.cant < 0 && stock(d, a.ref.almacenId, a.ref.productoId) < -a.ref.cant) {
      return { ok: false, error: "El stock ya cambió: no alcanza para aplicar el ajuste. Rechaza o pide uno nuevo." };
    }
    // Autorizar algo que no se puede aplicar dejaría un "autorizado" sin efecto: se bloquea y se pide rechazarla.
    const OBJETO = { credito: ["planId", "planes"], prorroga: ["apartadoId", "apartados"], cancelacion: ["ventaId", "ventas"], reapertura_corte: ["turnoId", "turnos"] };
    if (decision === "autorizar" && OBJETO[a.tipo]) {
      const [campo, lista] = OBJETO[a.tipo];
      if (!a.ref || !d[lista].some((x) => x.id === a.ref[campo])) return { ok: false, error: "La solicitud no tiene su registro asociado: no se puede aplicar. Recházala y pide una nueva." };
    }
    a.estado = decision === "autorizar" ? "autorizado" : "rechazado";
    a.resueltoPor = u.id; a.motivo = motivo; a.fechaResolucion = hoy();
    const ok = decision === "autorizar", r = a.ref || {};
    if (a.tipo === "credito" && r.planId) { const p = d.planes.find((x) => x.id === r.planId); if (p) p.estado = ok ? "vigente" : "cancelado"; }
    if (a.tipo === "prorroga" && r.apartadoId && ok) {
      const ap = d.apartados.find((x) => x.id === r.apartadoId);
      if (ap) { ap.prorrogas.push({ de: ap.vence, a: sumarDias(ap.vence, r.dias || 5), por: u.id }); ap.vence = sumarDias(ap.vence, r.dias || 5); }
    }
    if (a.tipo === "ajuste_inventario" && r.productoId && ok) {
      if (r.cant < 0) salidaPEPS(d, r.almacenId, r.productoId, Math.min(-r.cant, 1e9));
      else { const p = d.productos.find((x) => x.id === r.productoId); entradaCapa(d, r.almacenId, r.productoId, r.cant, p ? p.costo : 0, "AJUSTE"); }
      d.ajustesInventario.unshift({ id: `AJ${Date.now().toString(36)}`, ...r, motivo: a.detalle, autorizadoPor: u.id, fecha: hoy() });
    }
    if (a.tipo === "cancelacion" && r.ventaId && ok) {
      const v = d.ventas.find((x) => x.id === r.ventaId);
      if (v && v.estado !== "cancelada") {
        v.estado = "cancelada";
        v.partidas.filter((p) => p.tipo === "producto").forEach((p) => entradaCapa(d, v.sucursalId, p.itemId, p.cant, p.costo || 0, "CANC"));
      }
    }
    if (a.tipo === "reapertura_corte" && r.turnoId && ok) { const t = d.turnos.find((x) => x.id === r.turnoId); if (t) { t.estado = "abierto"; t.cerradoEn = null; } }
    auditar(d, ok ? "autorizacion_aprobada" : "autorizacion_rechazada", "autorizacion", id, `${a.tipo} · ${a.detalle}`);
    return { ok: true };
  });
}

/** Libera apartados vencidos: devuelve el producto al disponible; el anticipo se trata según la política (por defecto no se devuelve). */
export function liberarApartado(id) {
  return mutar((d) => {
    const ap = d.apartados.find((x) => x.id === id);
    if (!ap || estadoApartado(ap) !== "vencido") return { ok: false };
    ap.estado = "liberado";
    auditar(d, "apartado_liberado", "apartado", id, `Política anticipo: ${d.params[ap.sucursalId].politicaAnticipoVencido}`);
    return { ok: true };
  });
}

export { pedirAutorizacion };
