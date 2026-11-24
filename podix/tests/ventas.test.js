import test from "node:test";
import assert from "node:assert/strict";
import { crearSeed } from "../src/store/seed.js";
import * as V from "../src/store/acciones_ventas.js";
import { kardex } from "../src/store/acciones_almacen.js";
import { hoy, sumarDias, ahoraLocal } from "../src/lib/format.js";

const SEED = crearSeed();
const nuevo = () => structuredClone(SEED);
const como = (d, rol, filtro = () => true) => {
  const u = d.usuarios.find((x) => x.rol === rol && filtro(x));
  d.sesion = { userId: u.id, sucursalId: u.almacenCentral ? "CEN" : u.sucursales[0] };
  return u;
};
const receptorOk = { rfc: "DEMO800101AB1", nombre: "Paciente Demostración", regimen: "605", usoCfdi: "D01", cp: "06700" };
/** Ticket nuevo de hoy, cobrado por el cajero en sesión (no depende de la hora de la semilla). */
function ticket(d, u, partidas) {
  const total = partidas.reduce((a, p) => a + p.importe, 0);
  const v = { id: `VT${d.ventas.length}`, folio: `T-T${d.ventas.length}`, sucursalId: d.sesion.sucursalId, cajeroId: u.id, pacienteId: d.pacientes[0].id, tipo: "contado", fecha: ahoraLocal(), partidas, subtotal: total, descuento: 0, total, pagos: [{ forma: "efectivo", monto: total }], estado: "pagada" };
  d.ventas.unshift(v);
  return v;
}
const SERV = { tipo: "servicio", itemId: "SV2", nombre: "Quiropodia", cant: 1, precio: 450, importe: 450 };
const PROD = { tipo: "producto", itemId: "P01", nombre: "Bastón aluminio", cant: 1, precio: 116, importe: 116 };

test("RFC: forma, fecha real, genéricos y régimen por tipo de persona", () => {
  assert.equal(V.validarRfc("XAXX010101000"), true);
  assert.equal(V.validarRfc("XEXX010101000"), true);
  assert.equal(V.validarRfc("demo800101ab1"), true);
  assert.equal(V.validarRfc("DEMO801301AB1"), false);   // mes 13
  assert.equal(V.validarRfc("ABC12"), false);
  assert.equal(V.tipoPersonaRfc("DEM150312M01"), "moral");
  const r = V.validarReceptor({ ...receptorOk, regimen: "601" });
  assert.equal(r.ok, false); assert.ok(r.errores.regimen);
  assert.equal(V.validarReceptor({ ...receptorOk, cp: "123" }).ok, false);
  assert.equal(V.validarReceptor({ rfc: "XAXX010101000", nombre: "PUBLICO EN GENERAL", regimen: "616", usoCfdi: "G03", cp: "06000" }).ok, false);
  assert.equal(V.validarReceptor(receptorOk).ok, true);
});

test("IVA por concepto: servicio exento, producto 16 % incluido; el CFDI cuadra con el ticket", () => {
  assert.deepEqual(V.desglosarIva(450, "exento"), { base: 450, iva: 0, total: 450 });
  assert.deepEqual(V.desglosarIva(116, "16"), { base: 100, iva: 16, total: 116 });
  const d = nuevo(); const u = como(d, "cajero");
  const v = ticket(d, u, [SERV, PROD]);
  const c = V.conceptosDeVenta(d, v);
  assert.equal(c.conceptos[0].ivaTipo, "exento"); assert.equal(c.conceptos[0].iva, 0);
  assert.equal(c.conceptos[1].ivaTipo, "16"); assert.equal(c.conceptos[1].iva, 16);
  assert.equal(c.total, 566); assert.equal(c.iva, 16); assert.equal(c.exentoBase, 450);
});

test("Facturar: el cajero solo sus tickets, no se factura dos veces y el UUID es sintético", () => {
  const d = nuevo(); const u = como(d, "cajero");
  const v = ticket(d, u, [SERV, PROD]);
  const r = V.facturarVenta(d, { ventaId: v.id, receptor: receptorOk });
  assert.equal(r.ok, true, r.error);
  assert.match(r.factura.uuid, /^SIM/); assert.equal(r.factura.simulado, true); assert.equal(r.factura.total, 566);
  const otra = V.facturarVenta(d, { ventaId: v.id, receptor: receptorOk });
  assert.equal(otra.ok, false); assert.match(otra.error, /ya está amparado/);
  // otro cajero no puede facturar ese ticket
  const v2 = ticket(d, u, [SERV]);
  como(d, "cajero", (x) => x.id !== u.id);
  assert.equal(V.facturarVenta(d, { ventaId: v2.id, receptor: receptorOk }).ok, false);
  // recepción no factura
  como(d, "recepcion");
  assert.equal(V.facturarVenta(d, { ventaId: v2.id, receptor: receptorOk }).ok, false);
});

test("Plazo: solo dentro del mismo mes; fuera va a la global y la global no repite tickets", () => {
  const d = nuevo(); const u = como(d, "cajero");
  const v = ticket(d, u, [SERV]);
  assert.equal(V.dentroDePlazo("2026-10-31T10:00", "2026-11-01"), false);
  assert.equal(V.dentroDePlazo("2026-11-01T10:00", "2026-11-30"), true);
  const mesSig = sumarDias(`${hoy().slice(0, 7)}-28`, 6);
  const r = V.facturarVenta(d, { ventaId: v.id, receptor: receptorOk, ref: mesSig });
  assert.equal(r.ok, false); assert.match(r.error, /Fuera de plazo/);
  como(d, "admin");
  const g = V.facturaGlobal(d, { mes: hoy().slice(0, 7), sucursalId: v.sucursalId });
  assert.equal(g.ok, true, g.error);
  assert.ok(g.factura.ventaIds.includes(v.id));
  assert.equal(g.factura.receptor.rfc, "XAXX010101000");
  assert.equal(V.facturaGlobal(d, { mes: hoy().slice(0, 7), sucursalId: v.sucursalId }).ok, false);   // ya no quedan pendientes
  como(d, "cajero", (x) => x.id === u.id);
  assert.equal(V.facturarVenta(d, { ventaId: v.id, receptor: receptorOk }).ok, false);   // amparado por la global
});

test("Nota de crédito ≤ factura; cancelación con motivo y relacionados primero", () => {
  const d = nuevo(); const u = como(d, "cajero");
  const v = ticket(d, u, [SERV, PROD]);
  const f = V.facturarVenta(d, { ventaId: v.id, receptor: receptorOk }).factura;
  assert.equal(V.notaCredito(d, { facturaId: f.id, monto: 100, motivo: "Devolución parcial" }).ok, false);   // cajero no
  como(d, "admin");
  const nc = V.notaCredito(d, { facturaId: f.id, monto: 300, motivo: "Devolución parcial" });
  assert.equal(nc.ok, true, nc.error); assert.equal(nc.factura.total, 300);
  assert.equal(V.saldoAcreditable(d, f), 266);
  assert.equal(V.notaCredito(d, { facturaId: f.id, monto: 267, motivo: "Otra devolución" }).ok, false);
  assert.equal(V.notaCredito(d, { facturaId: f.id, monto: 266, motivo: "Resto devuelto" }).ok, true);
  assert.equal(V.cancelarFactura(d, { facturaId: f.id, motivo: "02", comentario: "Error en el RFC" }).ok, false);   // tiene NC vivas
  const f2 = V.facturarVenta(d, { ventaId: ticket(d, d.usuarios.find((x) => x.id === d.sesion.userId), [SERV]).id, receptor: receptorOk }).factura;
  assert.equal(V.cancelarFactura(d, { facturaId: f2.id, motivo: "99", comentario: "x x x x x" }).ok, false);
  const c = V.cancelarFactura(d, { facturaId: f2.id, motivo: "01", comentario: "RFC con error", receptorNuevo: { ...receptorOk, rfc: "DEMO800101AB2" } });
  assert.equal(c.ok, true, c.error); assert.equal(c.factura.estado, "cancelada"); assert.equal(c.sustituta.receptor.rfc, "DEMO800101AB2");
});

test("Complemento de pago: no excede el saldo insoluto de la factura PPD", () => {
  const d = nuevo(); como(d, "admin");
  const f = d.fiscal.facturas.find((x) => x.metodoPago === "PPD" && x.estado === "timbrada");
  const saldo = V.saldoInsoluto(d, f);
  assert.equal(V.complementoPago(d, { facturaId: f.id, monto: saldo + 1 }).ok, false);
  const r = V.complementoPago(d, { facturaId: f.id, monto: Math.min(100, saldo) });
  assert.equal(r.ok, true, r.error);
  assert.equal(V.saldoInsoluto(d, f), Math.round((saldo - Math.min(100, saldo)) * 100) / 100);
});

test("Paquete: saldo, sesiones pagadas, vigencia 12 meses, aviso a 30 días y caducidad", () => {
  const d = nuevo(); como(d, "recepcion");
  const o = d.paq.ofertas.find((x) => x.codigo === "PAQ-QUI5");
  assert.equal(V.venderOferta(d, { ofertaId: o.id, pacienteId: d.pacientes[1].id, pagos: [{ forma: "efectivo", monto: 500 }] }).ok, false);   // < 50 %
  const r = V.venderOferta(d, { ofertaId: o.id, pacienteId: d.pacientes[1].id, pagos: [{ forma: "efectivo", monto: 1200 }], ref: "2026-01-31" });
  assert.equal(r.ok, true, r.error);
  const a = r.registro;
  assert.equal(a.vence, "2027-01-31"); assert.equal(a.saldoPendiente, 800);
  assert.equal(V.sesionesPagadas(a), 3);
  const pod = d.usuarios.find((x) => x.rol === "podologo");
  for (let i = 0; i < 3; i++) assert.equal(V.consumirSesion(d, { adquiridoId: a.id, podologoId: pod.id, ref: "2026-03-01" }).ok, true);
  assert.equal(V.consumirSesion(d, { adquiridoId: a.id, podologoId: pod.id, ref: "2026-03-01" }).ok, false);   // falta pagar
  assert.equal(V.abonarPaquete(d, { adquiridoId: a.id, monto: 900 }).ok, false);
  assert.equal(V.abonarPaquete(d, { adquiridoId: a.id, monto: 800 }).ok, true);
  assert.equal(V.sesionesRestantes(a), 2);
  assert.equal(V.porVencer(a, "2027-01-05"), true);
  assert.equal(V.porVencer(a, "2026-11-01"), false);
  assert.equal(V.estadoAdquirido(a, "2027-02-01"), "caducado");
  assert.equal(V.consumirSesion(d, { adquiridoId: a.id, podologoId: pod.id, ref: "2027-02-01" }).ok, false);
  assert.equal(V.sumarMesesFecha("2026-01-31", 1), "2026-02-28");
});

test("Gift card: canje parcial, no excede saldo y no se factura al venderse", () => {
  const d = nuevo(); como(d, "cajero");
  const o = d.paq.ofertas.find((x) => x.codigo === "GC-500");
  const r = V.venderOferta(d, { ofertaId: o.id, pacienteId: d.pacientes[2].id, pagos: [{ forma: "tarjeta", monto: 500 }] });
  assert.equal(r.ok, true, r.error);
  assert.equal(V.esFacturable(r.venta), false);
  assert.equal(V.canjearGift(d, { codigo: r.registro.codigo, monto: 600 }).ok, false);
  assert.equal(V.canjearGift(d, { codigo: r.registro.codigo.toLowerCase(), monto: 200 }).saldo, 300);
});

test("Kardex = capas: el saldo final del kardex es la existencia de las capas PEPS", () => {
  const d = nuevo();
  for (const p of d.productos.slice(0, 12)) for (const a of d.almacenes) {
    const st = d.capas.filter((c) => c.productoId === p.id && c.almacenId === a.id).reduce((s, c) => s + c.cant, 0);
    const k = V.kardexConSaldo(kardex(d, a.id, p.id), st);
    assert.equal(k.saldoFinal, st); assert.equal(k.cuadra, true);
  }
  const ex = V.expedienteProducto(d, d.productos[0].id);
  assert.equal(ex.stock, ex.existencias.reduce((a, e) => a + e.stock, 0));
  assert.equal(ex.kardex.saldoFinal, ex.stock);
});

test("Compra: desde $5,000 requiere autorización; menos sale aprobada; solo almacén central o admin", () => {
  const d = nuevo(); como(d, "almacen", (x) => x.almacenCentral);
  const prov = d.proveedores[1].id;
  d.inv.provFichas[prov].minimoCompra = 0;
  const chica = V.solicitarCompra(d, { proveedorId: prov, partidas: [{ productoId: "P13", cant: 10, costo: 499 }] });
  assert.equal(chica.ok, true, chica.error); assert.equal(chica.oc.estado, "enviada"); assert.equal(chica.requiereAutorizacion, false);
  const grande = V.solicitarCompra(d, { proveedorId: prov, partidas: [{ productoId: "P13", cant: 10, costo: 500 }] });
  assert.equal(grande.requiereAutorizacion, true); assert.equal(grande.oc.estado, "por_aprobar");
  assert.equal(V.aprobarCompra(d, grande.oc.id).ok, false);   // el almacén no se autoriza solo
  como(d, "admin");
  assert.equal(V.aprobarCompra(d, grande.oc.id).ok, true);
  como(d, "almacen", (x) => !x.almacenCentral);
  assert.equal(V.solicitarCompra(d, { proveedorId: prov, partidas: [{ productoId: "P13", cant: 1, costo: 10 }] }).ok, false);
});

test("Mantenimiento: urgente hasta $2,000 inicia sin autorización; arriba, no", () => {
  const d = nuevo(); const g = como(d, "gerente");
  const eq = d.mant.equipos.find((e) => e.sucursalId === g.sucursales[0] && !d.mant.ordenes.some((o) => o.equipoId === e.id && V.OT_ABIERTAS.includes(o.estado)));
  const a = V.crearOT(d, { equipoId: eq.id, tipo: "urgente", descripcion: "Pedal sin respuesta", costoEstimado: 2000 });
  assert.equal(a.ok, true, a.error); assert.equal(a.sinAutorizar, true);
  assert.equal(V.iniciarOT(d, { otId: a.orden.id }).ok, true);
  assert.equal(a.orden.autorizacionPendiente, true);
  assert.equal(V.cerrarOT(d, { otId: a.orden.id, costoReal: 2500, resultado: "Se cambió el actuador" }).ok, false);
  const c = V.cerrarOT(d, { otId: a.orden.id, costoReal: 1800, resultado: "Se cambió el actuador", registrarComoGasto: true });
  assert.equal(c.ok, true, c.error); assert.equal(c.gasto.categoria, "mantenimiento"); assert.equal(c.gasto.monto, 1800);
  const b = V.crearOT(d, { equipoId: eq.id, tipo: "urgente", descripcion: "Falla eléctrica mayor", costoEstimado: 2001 });
  assert.equal(b.sinAutorizar, false);
  assert.equal(V.iniciarOT(d, { otId: b.orden.id }).ok, false);
  assert.equal(V.autorizarOT(d, { otId: b.orden.id }).ok, false);   // el gerente no autoriza
  // gerente no opera equipos de otra sucursal
  const ajeno = d.mant.equipos.find((e) => !g.sucursales.includes(e.sucursalId));
  assert.equal(V.crearOT(d, { equipoId: ajeno.id, tipo: "normal", descripcion: "Revisión general", costoEstimado: 100 }).ok, false);
  como(d, "admin");
  assert.equal(V.autorizarOT(d, { otId: b.orden.id }).ok, true);
});

test("Comisión por servicio: % propio del servicio, base sin IVA y periodo cerrado congelado", () => {
  const d = nuevo();
  const esq = d.comi.esquemas.find((e) => e.podologoId && Object.keys(e.porServicio).length && !e.vigenteHasta);
  const [sv, pct] = Object.entries(esq.porServicio)[0];
  assert.equal(V.pctComision(esq, { tipo: "servicio", itemId: sv }), pct);
  assert.equal(V.pctComision(esq, { tipo: "servicio", itemId: "SV-otro" }), esq.pctServicio);
  assert.equal(V.pctComision(esq, { tipo: "producto", itemId: "P01" }), esq.pctProducto);
  const s = V.simularComision(d, { podologoId: esq.podologoId, tipo: "producto", itemId: "P01", importe: 116 });
  assert.equal(s.base, 100); assert.equal(s.comision, V.comisionDe(100, esq.pctProducto));
  como(d, "gerente");
  assert.equal(V.crearPeriodoComision(d, { desde: "2025-01-01", hasta: "2025-01-15" }).ok, false);
  como(d, "admin");
  const p = V.crearPeriodoComision(d, { desde: "2025-01-01", hasta: "2025-01-15" });
  assert.equal(p.ok, true, p.error);
  assert.equal(V.crearPeriodoComision(d, { desde: "2025-01-10", hasta: "2025-01-20" }).ok, false);   // traslape
  const cerrado = d.comi.periodos.find((x) => x.estado === "cerrado");
  assert.equal(V.cargarDetalleComision(d, cerrado.id).ok, false);
  assert.deepEqual(V.resumenComisiones(d, cerrado.id), cerrado.totales);
});

test("Caja: descuento hasta 10 % sin PIN, arriba con PIN de gerente de la sucursal; tolerancia de corte $50", () => {
  const d = nuevo(); const u = como(d, "cajero", (x) => x.sucursales[0] === "S1");
  assert.equal(V.autorizarDescuento(d, { pct: 10, motivo: "Cliente frecuente" }).requierePin, false);
  assert.equal(V.autorizarDescuento(d, { pct: 12, motivo: "Cliente frecuente" }).ok, false);
  const gS1 = d.usuarios.find((x) => x.rol === "gerente" && x.sucursales.includes("S1"));
  const gOtra = d.usuarios.find((x) => x.rol === "gerente" && !x.sucursales.includes("S1"));
  assert.equal(V.autorizarDescuento(d, { pct: 12, motivo: "Cliente frecuente", pin: d.ventasCfg.pines[gOtra.id] }).ok, false);
  const ok = V.autorizarDescuento(d, { pct: 12, motivo: "Cliente frecuente", pin: d.ventasCfg.pines[gS1.id] });
  assert.equal(ok.ok, true); assert.equal(ok.autorizadoPor, gS1.id);
  assert.equal(V.fueraDeTolerancia(50), false); assert.equal(V.fueraDeTolerancia(-50.01), true);
  assert.deepEqual(V.evaluarCierreCaja({ contado: 980, esperado: 1000, justificacion: "Faltó cambio" }).requiere, []);
  assert.deepEqual(V.evaluarCierreCaja({ contado: 900, esperado: 1000, justificacion: "Faltó" }).requiere, ["autorizacion"]);
  const t = { id: "TX", sucursalId: "S1", cajeroId: u.id, corte: { filas: [{ forma: "efectivo", diferencia: -80 }] } };
  d.turnos.push(t);
  assert.equal(V.autorizarDiferenciaCorte(d, { turnoId: "TX", justificacion: "Billete falso" }).ok, false);
  assert.equal(V.autorizarDiferenciaCorte(d, { turnoId: "TX", justificacion: "Billete falso", pin: d.ventasCfg.pines[gS1.id] }).ok, true);
  assert.equal(t.corte.autorizacionDiferencia.por, gS1.id);
});

test("Permisos: almacén edita fichas, cajero no; recepción vende paquetes pero no cancela; gerente no ve comisiones de otra sucursal", () => {
  const d = nuevo();
  como(d, "cajero");
  assert.equal(V.guardarFichaProducto(d, "P01", { marca: "X" }).ok, false);
  assert.equal(V.permisosVentas(d.usuarios.find((x) => x.id === d.sesion.userId)).facturar, true);
  como(d, "almacen");
  assert.equal(V.guardarFichaProducto(d, "P01", { marca: "Ortopedia Apoyo", ivaTipo: "16" }).ok, true);
  assert.equal(V.guardarFichaProveedor(d, d.proveedores[0].id, { clabe: "012180000000000001" }).ok, false);   // CLABE solo admin
  como(d, "recepcion");
  const a = d.paq.adquiridos.find((x) => V.estadoAdquirido(x) === "vigente");
  assert.equal(V.cancelarPaquete(d, { adquiridoId: a.id, motivo: "Cambio de ciudad" }).ok, false);
  const p = V.permisosVentas(d.usuarios.find((x) => x.id === d.sesion.userId));
  assert.equal(p.paquetes, true); assert.equal(p.facturar, false); assert.equal(p.mantenimiento, false);
  const g = como(d, "gerente");
  const per = d.comi.periodos.find((x) => x.estado !== "cerrado");
  const vis = V.comisionesVisibles(d, g, per.id);
  const det = d.comi.detalle.filter((x) => x.periodoId === per.id);
  vis.filas.forEach((f) => assert.ok(det.some((x) => x.podologoId === f.podologoId && g.sucursales.includes(x.sucursalId))));
  assert.equal(V.guardarEsquemaComision(d, { nombre: "Nuevo", pctServicio: 30, pctProducto: 5, pctPlan: 20, vigenteDesde: hoy() }).ok, false);
});
