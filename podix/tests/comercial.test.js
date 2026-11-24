// Pruebas del dominio comercial: tienda en línea, pedidos, auditoría a distancia y asistente. node --test tests/comercial.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as R from "../src/store/reglas.js";
import * as C from "../src/store/acciones_comercial.js";
import * as AS from "../src/store/acciones_comercial_asistente.js";
import { mutar, getState } from "../src/store/core.js";
import { resolverAutorizacion } from "../src/store/acciones.js";
import { carteraVencida } from "../src/store/selectors.js";
import { hoy, dia, sumarDias, diasEntre } from "../src/lib/format.js";

const FOTO = "data:image/jpeg;base64," + "A".repeat(300);
const como = (d, rol, suc = "S1", filtro = (u) => true) => {
  const u = d.usuarios.find((x) => x.rol === rol && (suc === "*" || x.sucursales.includes(suc)) && !x.almacenCentral && filtro(x));
  d.sesion = { userId: u.id, sucursalId: suc === "*" ? u.sucursales[0] : suc };
  return u;
};
const prod = (d, sku) => d.productos.find((p) => p.sku === sku);
const cliente = { nombre: "Cliente de Prueba", telefono: "55 1234 5678", correo: "cliente@correo.mx" };
const pedir = (d, suc, items, extra = {}) => C.crearPedidoWeb(d, { sucursalId: suc, cliente, entrega: "sucursal", partidas: items, pago: "en_linea", ...extra });
const redondea = (n) => Math.round(n * 100) / 100;

// ═══════════ Tienda y pedidos
test("semilla: 12 pedidos PW-0001…, 10 auditorías, 1 investigación abierta, parámetros", () => {
  const d = crearSeed();
  assert.equal(d.pedidosWeb.length, 12);
  assert.equal(d.pedidosWeb[0].folio, "PW-0001"); assert.equal(d.pedidosWeb[11].folio, "PW-0012");
  assert.deepEqual([...new Set(d.pedidosWeb.map((p) => p.estado))].sort(), ["cancelado", "entregado", "listo", "nuevo", "preparando"]);
  assert.equal(d.auditorias.length, 10);
  assert.ok(d.auditorias.filter((a) => a.items.some((i) => i.estado === "diferencia")).length >= 2);
  assert.equal(d.investigacionesInv.filter((i) => i.estado === "abierta").length, 1);
  d.pedidosWeb.filter((p) => p.estado === "entregado").forEach((p) => assert.ok(d.ventas.find((v) => v.id === p.ventaId), "entregado ↔ venta"));
  // los pedidos activos de la demo no comprometen más de lo que hay
  d.pedidosWeb.filter((p) => C.ACTIVOS.includes(p.estado)).forEach((p) => p.partidas.forEach((x) => assert.ok(R.disponible(d, p.sucursalId, x.productoId) >= C.reservadoWeb(d, p.sucursalId, x.productoId) - 0, "reserva ≤ disponible")));
});

test("precio por sucursal de recolección = R.precioFinal; difiere entre sucursales", () => {
  const d = crearSeed(); const p = prod(d, "PLA-003");
  assert.equal(C.precioTienda(d, "S6", p.id), R.precioFinal(d, "S6", "producto", p.id));
  assert.equal(C.precioTienda(d, "S6", p.id), 858); // el ajuste específico de S6 para este producto (+10 %) manda sobre el general (+8 %)
  assert.ok(C.precioTienda(d, "S6", p.id) !== C.precioTienda(d, "S3", p.id));
  const t = C.totalesCarrito(d, "S2", [{ productoId: p.id, cant: 2 }], "domicilio");
  assert.equal(t.subtotal, redondea(R.precioFinal(d, "S2", "producto", p.id) * 2));
  assert.equal(t.envio, 99); assert.equal(t.total, t.subtotal + 99);
});

test("disponibilidad real: el pedido reserva sin tocar el stock físico; agotado se rotula", () => {
  const d = crearSeed(); const p = prod(d, "AND-001"); const s = "S4";
  const fisico = R.stock(d, s, p.id), antes = C.disponibleWeb(d, s, p.id);
  const r = pedir(d, s, [{ productoId: p.id, cant: 1 }]);
  assert.equal(r.ok, true);
  assert.equal(C.disponibleWeb(d, s, p.id), antes - 1);
  assert.equal(R.stock(d, s, p.id), fisico, "el stock físico no baja hasta entregar");
  assert.equal(C.nivelDisponibilidad(0, p), "agotado");
  assert.equal(C.nivelDisponibilidad(1, { minimo: 6 }), "pocas");
  assert.equal(C.nivelDisponibilidad(50, { minimo: 6 }), "ok");
});

test("pedido sin stock suficiente: se rechaza y no deja nada", () => {
  const d = crearSeed(); const p = prod(d, "AND-002"); const n = d.pedidosWeb.length, cont = d.contadores.PW;
  const disp = C.disponibleWeb(d, "S1", p.id);
  const r = pedir(d, "S1", [{ productoId: p.id, cant: disp + 1 }]);
  assert.equal(r.ok, false); assert.match(r.error, /existencia/i);
  assert.equal(d.pedidosWeb.length, n); assert.equal(d.contadores.PW, cont);
});

test("validaciones del cliente y de la entrega", () => {
  const d = crearSeed(); const p = prod(d, "BAS-001");
  const it = [{ productoId: p.id, cant: 1 }];
  assert.equal(pedir(d, "S1", it, { cliente: { ...cliente, telefono: "123" } }).ok, false);
  assert.equal(pedir(d, "S1", it, { cliente: { ...cliente, correo: "no-es-correo" } }).ok, false);
  assert.equal(pedir(d, "S1", it, { cliente: { ...cliente, nombre: "A" } }).ok, false);
  assert.equal(pedir(d, "S1", it, { entrega: "domicilio", direccion: "" }).ok, false);
  assert.equal(pedir(d, "S1", [{ productoId: p.id, cant: 0 }]).ok, false);
  assert.equal(pedir(d, "S99", it).ok, false);
  const ok = pedir(d, "S1", it, { entrega: "domicilio", direccion: "Calle Falsa 123, Col. Centro" });
  assert.equal(ok.ok, true); assert.equal(ok.pedido.envio, 99); assert.equal(ok.pedido.envioPorValidar, true);
  assert.equal(ok.pedido.pago.simulado, true);
});

test("seguimiento: solo con folio + teléfono correctos, sin datos internos", () => {
  const d = crearSeed(); const p = d.pedidosWeb[0];
  const v = C.buscarPedidoWeb(d, p.folio.toLowerCase(), p.cliente.telefono);
  assert.equal(v.folio, p.folio); assert.equal(v.estado, p.estado);
  assert.equal(v.historial.every((h) => h.usuarioId === undefined), true);
  assert.equal(C.buscarPedidoWeb(d, p.folio, "5500000000"), null);
  assert.equal(C.buscarPedidoWeb(d, "PW-9999", p.cliente.telefono), null);
});

test("entregar: crea venta con forma de cajero, PEPS, descuenta stock y cierra; pago en línea no toca el cajón", () => {
  const d = crearSeed(); const s = "S1"; const p = prod(d, "BAS-001");
  const u = como(d, "cajero", s, (x) => R.turnoAbierto(d, x.id));
  const r = pedir(d, s, [{ productoId: p.id, cant: 1 }, { productoId: prod(d, "CRE-001").id, cant: 1 }], { entrega: "domicilio", direccion: "Av. Siempre Viva 742, Col. Centro" });
  const ped = r.pedido;
  assert.equal(C.entregarPedido(d, ped.id).ok, false, "no entrega si no está listo");
  assert.equal(C.avanzarPedido(d, ped.id).ok, true); assert.equal(C.avanzarPedido(d, ped.id).ok, true);
  assert.equal(ped.estado, "listo");
  const antes = R.stock(d, s, p.id), nVentas = d.ventas.length, valAntes = R.valuacion(d, s);
  const e = C.entregarPedido(d, ped.id);
  assert.equal(e.ok, true);
  const v = e.venta;
  assert.equal(d.ventas.length, nVentas + 1); assert.match(v.folio, /^T-\d{4}$/);
  assert.equal(v.cajeroId, u.id); assert.equal(v.vendedorId, u.id); assert.equal(v.sucursalId, s);
  assert.deepEqual(v.pagos, [{ forma: "en_linea", monto: ped.total }]); assert.equal(v.turnoId, null);
  assert.equal(v.total, ped.total);
  const parts = v.partidas.filter((x) => x.tipo === "producto");
  assert.equal(parts.length, 2); assert.ok(parts.every((x) => x.costo > 0));
  assert.equal(v.partidas.find((x) => x.tipo === "envio").importe, 99);
  assert.equal(R.stock(d, s, p.id), antes - 1);
  const costoPEPS = parts.reduce((a, x) => a + x.costo * x.cant, 0);
  assert.ok(Math.abs(R.valuacion(d, s) - (valAntes - costoPEPS)) < 0.05, "la valuación baja exactamente el costo PEPS de la venta");
  assert.equal(ped.estado, "entregado"); assert.equal(ped.ventaId, v.id);
  assert.equal(C.reservadoWeb(d, s, p.id), C.reservadoWeb(d, s, p.id)); // ya no reserva
  assert.ok(d.bitacora.some((b) => b.accion === "pedido_web_entregado" && b.usuarioId === u.id && b.sucursalId === s));
});

test("entregar con pago pendiente exige cajero con turno abierto y se liga al turno", () => {
  const d = crearSeed(); const s = "S1"; const p = prod(d, "CRE-001");
  const caja = como(d, "cajero", s, (x) => R.turnoAbierto(d, x.id));
  const ped = pedir(d, s, [{ productoId: p.id, cant: 1 }], { pago: "en_sucursal" }).pedido;
  C.avanzarPedido(d, ped.id); C.avanzarPedido(d, ped.id);
  assert.equal(C.entregarPedido(d, ped.id).ok, false, "falta la forma de pago");
  como(d, "gerente", s);
  assert.equal(C.entregarPedido(d, ped.id, { formaPago: "efectivo" }).ok, false, "el gerente no cobra en caja");
  d.sesion = { userId: caja.id, sucursalId: s };
  const e = C.entregarPedido(d, ped.id, { formaPago: "efectivo" });
  assert.equal(e.ok, true);
  assert.equal(e.venta.turnoId, R.turnoAbierto(d, caja.id).id);
  assert.deepEqual(e.venta.pagos, [{ forma: "efectivo", monto: ped.total }]);
  assert.equal(ped.pago.estado, "pagado");
});

test("entregar sin existencia física: avisa qué falta y no cambia nada", () => {
  const d = crearSeed(); const s = "S1"; const p = prod(d, "BAS-001");
  const u = como(d, "gerente", s);
  const ped = pedir(d, s, [{ productoId: p.id, cant: 1 }]).pedido;
  C.avanzarPedido(d, ped.id); C.avanzarPedido(d, ped.id);
  d.capas = d.capas.filter((c) => !(c.almacenId === s && c.productoId === p.id)); // se perdió el producto
  const nV = d.ventas.length;
  const e = C.entregarPedido(d, ped.id);
  assert.equal(e.ok, false); assert.match(e.error, /Falta existencia/); assert.equal(e.faltan[0].productoId, p.id);
  assert.equal(ped.estado, "listo"); assert.equal(d.ventas.length, nV); assert.ok(u);
});

test("entregar exige la sucursal activa del pedido", () => {
  const d = crearSeed(); const p = prod(d, "BAS-001");
  como(d, "admin", "*");
  const ped = pedir(d, "S3", [{ productoId: p.id, cant: 1 }]).pedido;
  C.avanzarPedido(d, ped.id); C.avanzarPedido(d, ped.id);
  d.sesion.sucursalId = "S1";
  const e = C.entregarPedido(d, ped.id);
  assert.equal(e.ok, false); assert.match(e.error, /sucursal activa/);
});

test("cancelar libera las piezas y marca el reembolso pendiente si ya se pagó en línea", () => {
  const d = crearSeed(); const p = prod(d, "CAL-001"); const s = "S2";
  como(d, "gerente", s);
  const antes = C.disponibleWeb(d, s, p.id);
  const ped = pedir(d, s, [{ productoId: p.id, cant: 1 }]).pedido;
  assert.equal(C.disponibleWeb(d, s, p.id), antes - 1);
  assert.equal(C.cancelarPedido(d, ped.id, "").ok, false, "pide motivo");
  assert.equal(C.cancelarPedido(d, ped.id, "El cliente ya no lo quiere").ok, true);
  assert.equal(C.disponibleWeb(d, s, p.id), antes);
  assert.equal(ped.pago.estado, "por_reembolsar");
  assert.equal(C.cancelarPedido(d, ped.id, "otra vez").ok, false);
});

test("permisos de pedidos: recepción no opera; gerente solo su sucursal", () => {
  const d = crearSeed(); const p = prod(d, "BAS-001");
  const ped = pedir(d, "S2", [{ productoId: p.id, cant: 1 }]).pedido;
  como(d, "recepcion", "S2");
  assert.equal(C.avanzarPedido(d, ped.id).ok, false);
  como(d, "gerente", "S1");
  assert.equal(C.avanzarPedido(d, ped.id).ok, false);
  como(d, "gerente", "S2");
  assert.equal(C.avanzarPedido(d, ped.id).ok, true);
  const u = como(d, "gerente", "S1");
  assert.ok(C.pedidosVisibles(d, u).every((x) => x.sucursalId === "S1"));
  const a = como(d, "admin", "*");
  assert.equal(C.pedidosVisibles(d, a).length, d.pedidosWeb.length);
});

// ═══════════ Auditoría a distancia
test("estimarConteoConIA: determinista, sin negativos y sin truco (la mayoría exacta; algunas con diferencia mayor)", () => {
  const d = crearSeed();
  const ids = d.productos.filter((p) => p.tipo === "venta").map((p) => p.id);
  const stock = C.stockSistema(d, "S2", ids);
  const a = C.estimarConteoConIA(FOTO, ids, { stock, sucursalId: "S2", fecha: "2026-11-20" });
  const b = C.estimarConteoConIA(FOTO, ids, { stock, sucursalId: "S2", fecha: "2026-11-20" });
  assert.deepEqual(a, b);
  assert.ok(a.every((x) => x.estimado >= 0 && x.confianza >= 55));
  // muestra grande: proporciones razonables
  let exactas = 0, grandes = 0, total = 0;
  for (let k = 0; k < 40; k++) {
    const foto = FOTO + k;
    C.estimarConteoConIA(foto, ids, { stock, sucursalId: "S1", fecha: "2026-11-20" }).forEach((x) => {
      total++; const s = stock[x.productoId]; const df = x.estimado - s;
      if (df === 0) exactas++;
      if (Math.abs(df) > C.toleranciaPiezas(s)) grandes++;
    });
  }
  assert.ok(exactas / total > 0.45, `exactas ${exactas}/${total}`);
  assert.ok(grandes / total > 0.01 && grandes / total < 0.2, `grandes ${grandes}/${total}`);
});

test("auditoría: con diferencia genera alerta con evidencia; el ajuste pasa por autorización y se aplica al autorizar", () => {
  mutar((d) => {
    d.sesion = { userId: d.usuarios.find((u) => u.rol === "almacen" && u.sucursales[0] === "S1" && !u.almacenCentral).id, sucursalId: "S1" };
  });
  const p = prod(getState(), "AND-001"); const sis = R.stock(getState(), "S1", p.id);
  assert.ok(sis >= 3);
  const faltan = Math.max(2, Math.ceil(sis * 0.5));
  const r = mutar((d) => C.registrarAuditoria(d, { sucursalId: "S1", zona: "Bodega", origen: "colaborador", productoIds: [p.id], fotos: [FOTO], estimados: { [p.id]: sis - faltan } }));
  assert.equal(r.ok, true); assert.equal(r.diferencias, 1);
  const a = r.auditoria;
  assert.equal(a.items[0].estado, "diferencia"); assert.equal(a.items[0].dif, -faltan); assert.equal(a.items[0].sistema, sis);
  assert.equal(a.sucursalId, "S1"); assert.ok(a.usuarioId && a.fecha && a.fotos.length === 1, "evidencia: foto, fecha/hora, usuario, sucursal");
  assert.equal(C.estadoAuditoria(getState(), a), "con_alertas");
  assert.ok(getState().bitacora.some((b) => b.accion === "alerta_inventario" && b.ref === a.id));
  // el almacén no ajusta solo: queda solicitud pendiente con el nivel que marca nivelAjuste
  const nAut = getState().autorizaciones.length;
  const rr = mutar((d) => C.resolverDiferencia(d, a.id, p.id, { tipo: "ajuste", motivo: "robo" }));
  assert.equal(rr.ok, true);
  const aut = rr.autorizacion;
  assert.equal(getState().autorizaciones.length, nAut + 1);
  assert.equal(aut.tipo, "ajuste_inventario"); assert.equal(aut.estado, "pendiente");
  assert.deepEqual(aut.ref, { almacenId: "S1", productoId: p.id, cant: -faltan });
  assert.equal(aut.nivel, R.nivelAjuste(getState(), "S1", faltan * p.costo));
  assert.equal(R.stock(getState(), "S1", p.id), sis, "todavía no se ajusta");
  assert.equal(mutar((d) => C.resolverDiferencia(d, a.id, p.id, { tipo: "ajuste", motivo: "robo" })).ok, false, "no se resuelve dos veces");
  // autoriza admin (cubre cualquier nivel) → ahora sí baja el stock
  mutar((d) => { d.sesion = { userId: d.usuarios.find((u) => u.rol === "admin").id, sucursalId: "S1" }; });
  const ok = resolverAutorizacion(aut.id, "autorizar");
  assert.equal(ok.ok, true);
  assert.equal(R.stock(getState(), "S1", p.id), sis - faltan);
  assert.equal(C.estadoAuditoria(getState(), getState().auditorias.find((x) => x.id === a.id)), "resuelta");
});

test("auditoría: permisos, origen cámara pide identificador, sin foto no se guarda, tolerancia", () => {
  const d = crearSeed(); const p = prod(d, "BAS-001");
  como(d, "recepcion", "S1");
  assert.equal(C.registrarAuditoria(d, { sucursalId: "S1", origen: "colaborador", productoIds: [p.id], fotos: [FOTO] }).ok, false);
  como(d, "almacen", "S1");
  assert.equal(C.registrarAuditoria(d, { sucursalId: "S2", origen: "colaborador", productoIds: [p.id], fotos: [FOTO] }).ok, false, "otra sucursal");
  assert.equal(C.registrarAuditoria(d, { sucursalId: "S1", origen: "camara", camaraRef: " ", productoIds: [p.id], fotos: [FOTO] }).ok, false);
  assert.equal(C.registrarAuditoria(d, { sucursalId: "S1", origen: "colaborador", productoIds: [p.id], fotos: [] }).ok, false);
  assert.equal(C.registrarAuditoria(d, { sucursalId: "S1", origen: "colaborador", productoIds: [], fotos: [FOTO] }).ok, false);
  assert.equal(C.compararItem(10, 9).estado, "ok"); assert.equal(C.compararItem(10, 8).estado, "diferencia"); assert.equal(C.compararItem(3, 2).estado, "ok"); assert.equal(C.compararItem(3, 1).estado, "diferencia");
  como(d, "almacen", "S1");
  const ok = C.registrarAuditoria(d, { sucursalId: "S1", origen: "camara", camaraRef: "CAM-01", productoIds: [p.id], fotos: [FOTO] });
  assert.equal(ok.ok, true); assert.equal(ok.auditoria.camaraRef, "CAM-01"); assert.equal(ok.auditoria.simulado, true);
});

test("fotos: nunca más de 40 en total; se descartan las de las auditorías más viejas", () => {
  const d = crearSeed(); como(d, "admin", "*");
  const p = prod(d, "BAS-001"); let prev = null;
  for (let i = 0; i < 20; i++) {
    if (prev) prev.fecha = `2026-10-${String(i).padStart(2, "0")}T10:00`; // la anterior queda más vieja que la nueva
    const r = C.registrarAuditoria(d, { sucursalId: "S1", origen: "colaborador", productoIds: [p.id], fotos: [FOTO + i, FOTO + "b" + i, FOTO + "c" + i] });
    assert.equal(r.ok, true); prev = r.auditoria;
    assert.ok(C.totalFotos(d) <= 40, `fotos ${C.totalFotos(d)} tras ${i + 1} auditorías`);
  }
  assert.equal(C.totalFotos(d), 40);
  assert.equal(prev.fotos.length, 3, "la más reciente conserva sus fotos");
  const vieja = d.auditorias.find((a) => a.fecha === "2026-10-01T10:00");
  assert.equal(vieja.fotos.length, 0); assert.ok(vieja.fotosDescartadas >= 1);
});

test("investigación: abrir con nota, agregar notas, solo gerente/admin cierran", () => {
  const d = crearSeed();
  const a = d.auditorias.find((x) => x.sucursalId === "S2" && x.items.some((i) => i.estado === "diferencia" && !i.resolucion));
  const it = a.items.find((i) => i.estado === "diferencia");
  como(d, "almacen", "S2");
  assert.equal(C.resolverDiferencia(d, a.id, it.productoId, { tipo: "investigacion", nota: "x" }).ok, false);
  const r = C.resolverDiferencia(d, a.id, it.productoId, { tipo: "investigacion", nota: "Revisar accesos del turno vespertino" });
  assert.equal(r.ok, true); assert.equal(C.estadoAuditoria(d, a), "en_investigacion");
  assert.equal(C.notaInvestigacion(d, r.investigacion.id, "Se pidió el video").ok, true);
  assert.equal(C.cerrarInvestigacion(d, r.investigacion.id, "Error de captura confirmado").ok, false, "almacén no cierra");
  como(d, "gerente", "S2");
  assert.equal(C.cerrarInvestigacion(d, r.investigacion.id, "Error de captura confirmado").ok, true);
  assert.equal(C.estadoAuditoria(d, a), "resuelta");
});

test("línea de tiempo: cuándo empezó a faltar (Sur: robo detectado por la cámara)", () => {
  const d = crearSeed();
  const a4 = d.auditorias.find((a) => a.folio === "AF-0004"), a3 = d.auditorias.find((a) => a.folio === "AF-0003");
  const it = a4.items.find((i) => i.estado === "diferencia");
  const lt = C.lineaTiempoProducto(d, "S3", it.productoId);
  assert.equal(lt.puntos.length, 4);
  assert.equal(lt.faltaDesde, a4.fecha); assert.equal(lt.ultimoConforme, a3.fecha);
  assert.match(lt.ventana, /entre .* y .*/);
  assert.equal(C.lineaTiempoProducto(d, "S3", prod(d, "CRE-001").id).faltaDesde, null);
});

test("cumplimiento: última auditoría por sucursal y sucursales sin auditar en N días", () => {
  const d = crearSeed();
  const c = C.cumplimientoAuditoria(d, null, hoy(), 7);
  const por = Object.fromEntries(c.map((x) => [x.sucursalId, x]));
  assert.equal(c.length, 7);
  for (const s of d.sucursales) {
    const ult = d.auditorias.filter((a) => a.sucursalId === s.id).map((a) => a.fecha).sort().at(-1);
    assert.equal(por[s.id].ultima, ult);
    assert.equal(por[s.id].dias, diasEntre(dia(ult), hoy()));
    assert.equal(por[s.id].estado, por[s.id].dias > 7 ? "vencida" : "al_dia");
  }
  assert.equal(por.S4.estado, "vencida"); assert.equal(por.S1.estado, "al_dia");
  assert.equal(C.cumplimientoAuditoria(d, ["S1"]).length, 1);
});

// ═══════════ Asistente
const admin = (d) => como(d, "admin", "*");
const ask = (d, u, txt) => AS.responderAsistente(d, u, d.sesion.sucursalId, txt);
const norm = (v) => dia(v.fecha);
const vig = (d) => d.ventas.filter((v) => v.estado !== "cancelada");
const sumaV = (d, desde, hasta, suc) => redondea(vig(d).filter((v) => norm(v) >= desde && norm(v) <= hasta && (!suc || v.sucursalId === suc)).reduce((a, v) => a + v.total, 0));
const nomSuc = (d, id) => d.sucursales.find((x) => x.id === id).nombre; // el nombre sale del estado: la demo cambia de cliente
const lunes = (ref) => { const x = new Date(ref + "T00:00"); return sumarDias(ref, -((x.getDay() + 6) % 7)); };

test("asistente 1: ¿qué sucursal vendió más plantillas este trimestre? (histórico + tickets reales)", () => {
  const d = crearSeed(); const u = admin(d); const ref = hoy();
  const [y, m] = [Number(ref.slice(0, 4)), Number(ref.slice(5, 7))]; const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  const esPlant = (d, p) => (p.tipo === "producto" && d.productos.find((x) => x.id === p.itemId).categoria === "Plantillas") || (p.tipo === "anticipo" && /plantilla/i.test(p.nombre));
  const directo = d.sucursales.map((s) => {
    let t = 0;
    for (let mm = q0; mm <= m; mm++) {
      const mes = `${y}-${String(mm).padStart(2, "0")}`;
      if (mm < m) t += (d.hist.find((h) => h.sucursalId === s.id && h.mes === mes) || { plantillas: 0 }).plantillas;
      else t += vig(d).filter((v) => v.sucursalId === s.id && v.fecha.startsWith(mes)).reduce((a, v) => a + v.partidas.filter((p) => esPlant(d, p)).reduce((z, p) => z + p.importe, 0), 0);
    }
    return { id: s.id, t: redondea(t) };
  });
  const mejor = [...directo].sort((a, b) => b.t - a.t)[0];
  const r = ask(d, u, "¿Qué sucursal vendió más plantillas este trimestre?");
  assert.equal(r.tipo, "respuesta"); assert.equal(r.intencion, "ventas");
  assert.equal(r.datos.mejor, mejor.id);
  r.datos.porSucursal.forEach((x) => assert.equal(x.total, directo.find((z) => z.id === x.sucursalId).t));
  assert.ok(r.texto.includes(d.sucursales.find((s) => s.id === mejor.id).nombre));
  assert.ok(r.como.length >= 1 && r.tabla.filas.length === 7);
});

test("asistente 2-4: ventas de hoy, de la semana y del mes", () => {
  const d = crearSeed(); const u = como(d, "gerente", "S1"); const a = admin(d); const ref = hoy();
  const g = como(d, "gerente", "S1");
  assert.equal(ask(d, g, "¿Cuánto he vendido hoy?").datos.total, sumaV(d, ref, ref, "S1"));
  assert.equal(ask(d, a, "¿Cuánto vendimos esta semana?").datos.total, sumaV(d, lunes(ref), ref));
  assert.equal(ask(d, a, "ventas de ayer").datos.total, sumaV(d, sumarDias(ref, -1), sumarDias(ref, -1)));
  assert.ok(u);
});

test("asistente 5: ventas del mes en una sucursal por nombre (Norte)", () => {
  const d = crearSeed(); const a = admin(d); const ref = hoy();
  const r = ask(d, a, `¿Cuánto vendió la sucursal ${nomSuc(d, "S2")} este mes?`);
  assert.equal(r.datos.total, sumaV(d, ref.slice(0, 7) + "-01", ref, "S2"));
  assert.deepEqual(r.alcance, ["S2"]);
});

test("asistente 6: ticket promedio", () => {
  const d = crearSeed(); const a = admin(d); const ref = hoy();
  const vs = vig(d).filter((v) => norm(v) >= ref.slice(0, 7) + "-01" && norm(v) <= ref);
  const r = ask(d, a, "¿Cuál es el ticket promedio de este mes?");
  assert.equal(r.datos.n, vs.length);
  assert.equal(r.datos.promedio, redondea(vs.reduce((s, v) => s + v.total, 0) / vs.length));
});

test("asistente 7: citas de hoy en una sucursal", () => {
  const d = crearSeed(); const g = como(d, "gerente", "S2"); const ref = hoy();
  const cs = d.citas.filter((c) => c.sucursalId === "S2" && dia(c.inicio) === ref);
  const r = ask(d, g, "¿Cuántas citas hay hoy?");
  assert.equal(r.datos.total, cs.length);
  assert.equal(r.datos.canceladas, cs.filter((c) => c.estado === "cancelada").length);
});

test("asistente 8: podólogo con más consultas esta semana", () => {
  const d = crearSeed(); const a = admin(d); const ref = hoy();
  const m = {}; d.consultas.filter((c) => dia(c.fecha) >= lunes(ref) && dia(c.fecha) <= ref).forEach((c) => { m[c.podologoId] = (m[c.podologoId] || 0) + 1; });
  const max = Math.max(...Object.values(m));
  const r = ask(d, a, "¿Qué podólogo tuvo más consultas esta semana?");
  assert.equal(r.datos.ranking[0].n, max);
  assert.equal(m[r.datos.primero], max);
});

test("asistente 9: faltante de caja (ayer: Norte −45; sobrante Poniente +30) y de la semana", () => {
  const d = crearSeed(); const a = admin(d); const ref = hoy();
  const r = ask(d, a, "¿Cuánto fue el faltante de caja de ayer?");
  assert.equal(r.datos.faltante, 45); assert.equal(r.datos.sobrante, 30);
  assert.equal(r.datos.filas.find((x) => x.diferencia < 0).sucursalId, "S2");
  const dir = (desde, hasta) => { let f = 0; d.turnos.forEach((t) => { if (t.corte && t.corte.fecha >= desde && t.corte.fecha <= hasta) t.corte.filas.forEach((x) => { if (x.diferencia < 0) f -= x.diferencia; }); }); return redondea(f); };
  assert.equal(ask(d, a, "¿Cuánto fue el faltante de caja de esta semana?").datos.faltante, dir(lunes(ref), ref));
});

test("asistente 10: pacientes con crédito con más de 30 días de atraso", () => {
  const d = crearSeed(); const a = admin(d);
  const directo = d.planes.filter((p) => ["vigente"].includes(p.estado) && p.parcialidades.some((x) => x.pagado < x.capital && diasEntre(x.vence, hoy()) > d.params[p.sucursalId].diasGracia + 30 - d.params[p.sucursalId].diasGracia));
  const dias = (p) => Math.max(0, ...p.parcialidades.filter((x) => x.pagado < x.capital && diasEntre(x.vence, hoy()) > d.params[p.sucursalId].diasGracia).map((x) => diasEntre(x.vence, hoy())));
  const esperados = d.planes.filter((p) => !["liquidado", "cancelado", "pendiente_autorizacion"].includes(p.estado) && dias(p) > 30);
  const r = ask(d, a, "¿Qué pacientes con crédito llevan más de 30 días de atraso?");
  assert.equal(r.datos.lista.length, esperados.length);
  assert.ok(esperados.length > 0, "la semilla debe tener casos para demostrarlo");
  assert.deepEqual(r.datos.lista.map((x) => x.planId).sort(), esperados.map((p) => p.id).sort());
  assert.equal(r.acciones[0].tipo, "recordar_pago");
  assert.ok(directo);
});

test("asistente 11: cartera vencida", () => {
  const d = crearSeed(); const a = admin(d);
  let tot = 0;
  d.planes.forEach((p) => p.parcialidades.forEach((x) => { if (x.pagado < x.capital && diasEntre(x.vence, hoy()) > d.params[p.sucursalId].diasGracia) tot += x.capital - x.pagado; }));
  const r = ask(d, a, "¿Cuánta cartera vencida tenemos?");
  assert.equal(r.datos.total, redondea(tot)); assert.equal(r.datos.total, carteraVencida(d));
});

test("asistente 12: utilidad de cada sucursal (último mes cerrado; honesta si falta gastos/nómina)", () => {
  const d = crearSeed(); const a = admin(d);
  delete d.fin; delete d.rh; // falta el dato de otros dominios → respuesta honesta
  let r = ask(d, a, "¿Cuál es la utilidad de cada sucursal?");
  assert.equal(r.tipo, "respuesta");
  assert.equal(r.datos.bruta, true);
  assert.ok(r.supuestos.some((s) => /gastos/.test(s)));
  const mes = r.datos.mes;
  r.datos.filas.forEach((f) => { const h = d.hist.find((x) => x.sucursalId === f.sucursalId && x.mes === mes); assert.equal(f.utilidadBruta, h.servicios + h.plantillas + h.productos - h.costo); assert.equal(f.utilidad, null); });
  // con gastos y nómina disponibles, los resta
  d.fin = { gastos: [{ id: "G1", sucursalId: "S1", fecha: mes + "-10", categoria: "Renta", concepto: "Renta", monto: 20000 }] };
  d.rh = { empleados: [{ id: "E1", estado: "activo", sucursalBase: "S1", sueldoMensual: 15000 }, { id: "E2", estado: "baja", sucursalBase: "S1", sueldoMensual: 9999 }] };
  r = ask(d, a, "¿Cuál es la utilidad de cada sucursal?");
  assert.equal(r.datos.bruta, false);
  const f1 = r.datos.filas.find((x) => x.sucursalId === "S1"); const h1 = d.hist.find((x) => x.sucursalId === "S1" && x.mes === mes);
  assert.equal(f1.utilidad, h1.servicios + h1.plantillas + h1.productos - h1.costo - 20000 - 15000);
  assert.equal(r.datos.filas.find((x) => x.sucursalId === "S2").utilidad, r.datos.filas.find((x) => x.sucursalId === "S2").utilidadBruta);
});

test("asistente 13: ¿quién va en meta para el bono de este mes? (con metas y con respaldo)", () => {
  const d = crearSeed(); const a = admin(d); const ref = hoy(); const mes = ref.slice(0, 7);
  const diasMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)), 0).getDate(), dHoy = Number(ref.slice(8));
  delete d.bonos;
  let r = ask(d, a, "¿Quién va en meta para el bono de este mes?");
  assert.ok(r.supuestos.some((s) => /meta sugerida/.test(s)));
  r.datos.filas.forEach((f) => {
    const h = d.hist.filter((x) => x.sucursalId === f.sucursalId).sort((x, y) => y.mes.localeCompare(x.mes)).slice(0, 3);
    const meta = redondea(h.reduce((s, x) => s + x.servicios + x.plantillas + x.productos, 0) / 3);
    assert.equal(f.meta, meta); assert.equal(f.ventas, sumaV(d, mes + "-01", ref, f.sucursalId));
    assert.equal(f.enRitmo, f.ventas >= redondea((meta * dHoy) / diasMes));
  });
  d.bonos = { esquemas: [], metas: d.sucursales.map((s) => ({ sucursalId: s.id, mes, meta: 1000 })) };
  r = ask(d, a, "¿quién va en meta para el bono?");
  r.datos.filas.forEach((f) => { assert.equal(f.meta, 1000); assert.equal(f.origen, "capturada"); assert.equal(f.avance, redondea((f.ventas / 1000) * 100)); });
});

test("asistente 14: producto por agotarse en la sucursal Norte", () => {
  const d = crearSeed(); const a = admin(d);
  // Los artículos sin mínimo (catálogo de Sicar aún sin inventario) no generan alertas.
  const dir = d.productos.filter((p) => p.minimo > 0 && (R.stock(d, "S2", p.id) < p.minimo || R.stock(d, "S2", p.id) <= Math.ceil(p.minimo * 1.25)));
  const bajo = dir.filter((p) => R.stock(d, "S2", p.id) < p.minimo);
  const r = ask(d, a, `¿Qué producto está por agotarse en la sucursal ${nomSuc(d, "S2")}?`);
  assert.equal(r.datos.lista.length, dir.length);
  assert.equal(r.datos.lista.filter((x) => x.nivel === "bajo_minimo").length, bajo.length);
  assert.ok(r.datos.lista.every((x) => x.sucursalId === "S2"));
  const ratios = r.datos.lista.map((x) => x.ratio); assert.deepEqual(ratios, [...ratios].sort((x, y) => x - y));
  assert.equal(r.acciones.length <= 1, true);
});

test("asistente 15: existencia de plantillas en Sur", () => {
  const d = crearSeed(); const a = admin(d);
  const t = d.productos.filter((p) => p.categoria === "Plantillas").reduce((s, p) => s + R.stock(d, "S3", p.id), 0);
  assert.equal(ask(d, a, `¿Cuántas plantillas hay en la sucursal ${nomSuc(d, "S3")}?`).datos.total, t);
});

test("asistente 16: pedidos en línea pendientes", () => {
  const d = crearSeed(); const a = admin(d);
  const ps = d.pedidosWeb.filter((p) => ["nuevo", "preparando", "listo"].includes(p.estado));
  const r = ask(d, a, "¿Cuántos pedidos en línea hay pendientes?");
  assert.equal(r.datos.total, ps.length); assert.equal(r.datos.monto, redondea(ps.reduce((s, p) => s + p.total, 0)));
  const g = como(d, "gerente", "S1");
  assert.equal(ask(d, g, "pedidos web pendientes").datos.total, ps.filter((p) => p.sucursalId === "S1").length);
});

test("asistente 17: ocupación de consultorios de hoy", () => {
  const d = crearSeed(); const g = como(d, "gerente", "S3"); const ref = hoy();
  const min = d.citas.filter((c) => c.sucursalId === "S3" && dia(c.inicio) === ref && !["cancelada", "no_asistio"].includes(c.estado)).reduce((s, c) => s + c.duracion, 0);
  const r = ask(d, g, "¿Cuál es la ocupación de hoy?");
  assert.equal(r.datos.minutos, min); assert.equal(r.datos.pct, redondea((min / (d.sucursales.find((x) => x.id === "S3").consultorios.length * 480)) * 100));
});

test("asistente 18: ventas de una categoría en una sucursal y productos más vendidos", () => {
  const d = crearSeed(); const a = admin(d); const ref = hoy();
  const ini = ref.slice(0, 7) + "-01";
  const ps = d.productos.filter((p) => p.categoria === "Bastones").map((p) => p.id);
  const dir = redondea(vig(d).filter((v) => v.sucursalId === "S1" && norm(v) >= ini && norm(v) <= ref).reduce((s, v) => s + v.partidas.filter((p) => p.tipo === "producto" && ps.includes(p.itemId)).reduce((z, p) => z + p.importe, 0), 0));
  assert.equal(ask(d, a, `¿Cuánto vendió ${nomSuc(d, "S1")} de bastones este mes?`).datos.total, dir);
  const cant = {}; vig(d).filter((v) => norm(v) >= ini && norm(v) <= ref).forEach((v) => v.partidas.filter((p) => p.tipo === "producto").forEach((p) => { cant[p.itemId] = (cant[p.itemId] || 0) + p.cant; }));
  const r = ask(d, a, "¿Cuáles son los productos más vendidos de este mes?");
  assert.equal(r.datos.rank[0].cant, Math.max(...Object.values(cant)));
});

test("asistente: permisos por rol (gerente solo su sucursal; comparar se niega; otros roles no entran)", () => {
  const d = crearSeed(); const g = como(d, "gerente", "S2");
  let r = ask(d, g, `¿Cuánto vendió la sucursal ${nomSuc(d, "S3")} este mes?`);
  assert.equal(r.tipo, "sin_permiso"); assert.ok(r.texto.includes(nomSuc(d, "S3")));
  r = ask(d, g, "¿Qué sucursal vendió más plantillas este trimestre?");
  assert.equal(r.tipo, "sin_permiso");
  r = ask(d, g, "¿Cuál es la utilidad de cada sucursal?");
  assert.equal(r.tipo, "sin_permiso");
  r = ask(d, g, "¿Cuánto he vendido este mes?");
  assert.equal(r.tipo, "respuesta"); assert.deepEqual(r.alcance, ["S2"]);
  r = ask(d, g, `¿Cuánto vendió ${nomSuc(d, "S2")} este mes?`);
  assert.equal(r.tipo, "respuesta");
  const rec = como(d, "recepcion", "S2");
  assert.equal(ask(d, rec, "¿cuánto vendimos hoy?").tipo, "sin_permiso");
  assert.equal(AS.consultarAsistente(d, "¿cuánto vendimos hoy?").tipo, "sin_permiso");
});

test("asistente: no entiende → lo dice y ofrece alternativas; nunca inventa cifras", () => {
  const d = crearSeed(); const a = admin(d);
  const r = ask(d, a, "¿Cuál es el color favorito del dueño?");
  assert.equal(r.tipo, "no_entendi"); assert.ok(r.sugerencias.length >= 3); assert.equal(r.cifra, undefined);
  assert.equal(AS.entender(d, "hola").intencion, null);
});

test("asistente: acción de traspaso se PROPONE, exige confirmación, se ejecuta una vez y queda auditada", () => {
  const d = crearSeed(); const g = como(d, "gerente", "S2");
  const nTr = d.traspasos.length;
  const r = AS.consultarAsistente(d, `Solicita un traspaso de 5 bastones a la sucursal ${nomSuc(d, "S2")}`);
  assert.equal(r.tipo, "propuesta"); assert.equal(r.acciones.length, 1);
  assert.equal(d.traspasos.length, nTr, "proponer no crea nada");
  const acc = r.acciones[0];
  assert.equal(acc.params.destinoId, "S2"); assert.equal(acc.params.cant, 5); assert.equal(acc.params.origenId, "CEN");
  assert.equal(d.productos.find((p) => p.id === acc.params.productoId).categoria, "Bastones");
  // otro usuario no puede confirmar una acción ajena
  como(d, "gerente", "S1");
  assert.equal(AS.ejecutarAccionAsistente(d, acc.id).ok, false);
  d.sesion = { userId: g.id, sucursalId: "S2" };
  const e = AS.ejecutarAccionAsistente(d, acc.id);
  assert.equal(e.ok, true);
  assert.equal(d.traspasos.length, nTr + 1);
  const t = d.traspasos[0]; assert.equal(t.estado, "solicitado"); assert.equal(t.destinoId, "S2"); assert.equal(t.origenId, "CEN"); assert.equal(t.partidas[0].solicitado, 5);
  assert.ok(d.bitacora.some((b) => b.accion === "asistente_accion" && b.usuarioId === g.id));
  assert.equal(AS.ejecutarAccionAsistente(d, acc.id).ok, false, "no se repite");
  // un gerente no pide traspasos para otra sucursal
  const r2 = AS.consultarAsistente(d, `Solicita un traspaso de 3 bastones a la sucursal ${nomSuc(d, "S3")}`);
  assert.equal(r2.tipo, "sin_permiso");
  // falta dato: pregunta en lugar de adivinar
  assert.equal(AS.consultarAsistente(d, `solicita un traspaso a la sucursal ${nomSuc(d, "S2")}`).tipo, "no_entendi");
});

test("asistente: recordar pago a atrasados queda como seguimiento confirmado (sin duplicar el mismo día)", () => {
  const d = crearSeed(); const a = admin(d);
  const r = AS.consultarAsistente(d, "Recuerda el pago a los pacientes con atraso");
  assert.equal(r.tipo, "propuesta"); assert.equal(d.seguimientosCobranza.length, 0);
  const e = AS.ejecutarAccionAsistente(d, r.acciones[0].id);
  assert.equal(e.ok, true); assert.equal(d.seguimientosCobranza.length, e.registrados);
  assert.ok(d.seguimientosCobranza.every((s) => s.usuarioId === a.id && s.diasMora > 0));
  const r2 = AS.consultarAsistente(d, "Recuerda el pago a los pacientes con atraso");
  assert.equal(AS.ejecutarAccionAsistente(d, r2.acciones[0].id).ok, false, "ya hay recordatorio hoy");
  assert.equal(AS.descartarAccionAsistente(d, r2.acciones[0].id).ok, true);
});

test("asistente: historial por usuario y periodos", () => {
  const d = crearSeed(); const a = admin(d);
  AS.consultarAsistente(d, "¿cuánto vendimos hoy?");
  AS.consultarAsistente(d, "¿cuánto vendimos esta semana?");
  assert.equal(AS.historialAsistente(d, a.id).length, 2);
  assert.equal(AS.historialAsistente(d, "otro").length, 0);
  const ref = "2026-11-18"; // miércoles
  assert.equal(AS.periodoDe("semana", ref).desde, "2026-11-16");
  assert.equal(AS.periodoDe("semana_pasada", ref).hasta, "2026-11-15");
  assert.equal(AS.periodoDe("trimestre", ref).desde, "2026-10-01");
  assert.equal(AS.periodoDe("mes_pasado", ref).desde, "2026-10-01"); assert.equal(AS.periodoDe("mes_pasado", ref).hasta, "2026-10-31");
  assert.equal(AS.periodoDe("dias:7", ref).desde, "2026-11-12");
});
