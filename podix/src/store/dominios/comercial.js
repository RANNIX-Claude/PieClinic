// Dominio «comercial»: semilla de demostración (pedidos en línea, auditorías de inventario a distancia, parámetros).
// Exporta seed(base, util) → objeto que se mezcla en el estado. Todo es ficticio y DETERMINISTA (sin números aleatorios,
// así no se altera la semilla de los demás dominios). No importa acciones_comercial.js para evitar un ciclo con core.js.
import * as R from "../reglas.js";

const pad = (n, w = 4) => String(n).padStart(w, "0");
const svgAnaquel = (n) => {
  const cajas = Array.from({ length: 6 }, (_, i) => `<rect x="${14 + i * 30}" y="${30 + ((i * n) % 3) * 6}" width="22" height="${34 - ((i * n) % 3) * 6}" rx="2" fill="#7b5ea7" opacity="${0.35 + (i % 3) * 0.2}"/>`).join("");
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90"><rect width="200" height="90" fill="#efe9f8"/><rect x="6" y="64" width="188" height="5" fill="#5b3f8c"/>${cajas}<text x="8" y="12" font-size="8" font-family="sans-serif" fill="#5b3f8c">Foto demo ${n}</text></svg>`);
};
const tol = (s) => Math.max(1, Math.ceil(s * 0.1));

export function seed(base, { F, DT, folio }) {
  const vP = base.productos.filter((p) => p.tipo === "venta");
  const sku = (s) => base.productos.find((p) => p.sku === s);

  // ───────── Pedidos en línea (12): folios PW-0001… Las piezas de los pedidos activos se reservan del stock real.
  const comprometido = {};
  const libre = (suc, pid) => R.disponible(base, suc, pid) - (comprometido[`${suc}|${pid}`] || 0);
  const clientes = [
    ["Mariana Quintero Salas", "5541207788", "mariana.quintero@correo.mx"], ["Ernesto Bravo Lara", "5533019920", "ernesto.bravo@correo.mx"],
    ["Teresa Ibarra Núñez", "5587304411", "tere.ibarra@correo.mx"], ["Joaquín Peña Duarte", "5519665302", "joaquin.pena@correo.mx"],
    ["Lorena Vidal Cortés", "5576108845", "lorena.vidal@correo.mx"], ["Gilberto Arce Montes", "5560472219", "gilberto.arce@correo.mx"],
    ["Ofelia Cabrera Rojas", "5528813360", "ofelia.cabrera@correo.mx"], ["Rubén Espinoza Vera", "5544920071", "ruben.espinoza@correo.mx"],
    ["Alma Delgado Pineda", "5512336954", "alma.delgado@correo.mx"], ["Fidel Montoya Ríos", "5591150427", "fidel.montoya@correo.mx"],
    ["Natalia Solís Herrera", "5538874612", "natalia.solis@correo.mx"], ["Héctor Lozano Aguirre", "5525690138", "hector.lozano@correo.mx"],
  ];
  // [estado, sucursal, entrega, pagoEnLinea, hace(días), [[sku, cant]...]]
  const plan = [
    ["nuevo", "S1", "sucursal", true, 0, [["BAS-001", 1], ["CRE-002", 2]]], ["nuevo", "S2", "domicilio", true, 0, [["PLA-003", 1]]],
    ["nuevo", "S6", "sucursal", false, 0, [["CAL-001", 1], ["CAL-010", 2]]], ["preparando", "S3", "sucursal", true, 1, [["AND-001", 1]]],
    ["preparando", "S1", "domicilio", false, 1, [["PLA-001", 2], ["CRE-001", 1]]], ["listo", "S4", "sucursal", true, 2, [["BAS-002", 1]]],
    ["listo", "S5", "sucursal", false, 2, [["PLA-002", 1], ["CAL-010", 1]]], ["entregado", "S1", "sucursal", true, 4, [["BAS-001", 1]]],
    ["entregado", "S2", "domicilio", true, 5, [["CRE-002", 2], ["CAL-010", 3]]], ["entregado", "S7", "sucursal", false, 6, [["PLA-003", 1]]],
    ["cancelado", "S3", "sucursal", true, 3, [["CAL-002", 1]]], ["cancelado", "S6", "domicilio", false, 7, [["AND-002", 1]]],
  ];
  const calles = ["Calle Morelos 45, Col. Del Valle", "Av. Universidad 1230, Col. Narvarte", "Calle Tlaxcala 88, Col. Roma", "Av. Insurgentes 512, Col. Doctores", "Calle Zacatecas 19, Col. Anáhuac", "Calle Durango 301, Col. Centro"];
  const cajeroDe = (s) => base.usuarios.find((u) => u.rol === "cajero" && u.sucursales[0] === s);
  const gerenteDe = (s) => base.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(s));
  const pedidosWeb = plan.map(([estado, suc, entrega, enLinea, hace, items], i) => {
    const [nombre, telefono, correo] = clientes[i];
    const activo = ["nuevo", "preparando", "listo"].includes(estado);
    const partidas = [];
    items.forEach(([s, cant]) => {
      const p = sku(s);
      let c = cant;
      if (activo) {
        c = Math.min(cant, libre(suc, p.id));
        if (c < 1) return; // sin existencia real: el pedido de demo no la compromete
        comprometido[`${suc}|${p.id}`] = (comprometido[`${suc}|${p.id}`] || 0) + c;
      }
      const precio = R.precioFinal(base, suc, "producto", p.id);
      partidas.push({ productoId: p.id, nombre: p.nombre, cant: c, precioLista: p.precioBase, ajustePct: R.ajustePct(base, suc, "producto", p.id), precio, importe: Math.round(precio * c * 100) / 100 });
    });
    if (!partidas.length) { const p = sku("CAL-010"); const precio = R.precioFinal(base, suc, "producto", p.id); partidas.push({ productoId: p.id, nombre: p.nombre, cant: 1, precioLista: p.precioBase, ajustePct: R.ajustePct(base, suc, "producto", p.id), precio, importe: precio }); }
    const subtotal = Math.round(partidas.reduce((a, x) => a + x.importe, 0) * 100) / 100;
    const envio = entrega === "domicilio" ? 99 : 0;
    const fecha = DT(-hace, 9 + (i % 8), (i * 7) % 60);
    const pedido = {
      id: `PW${i + 1}`, folio: `PW-${pad(i + 1)}`, fecha, sucursalId: suc, cliente: { nombre, telefono, correo }, entrega,
      direccion: entrega === "domicilio" ? calles[i % calles.length] : "", partidas, subtotal, envio, envioPorValidar: entrega === "domicilio", total: Math.round((subtotal + envio) * 100) / 100,
      pago: enLinea ? { forma: "en_linea", estado: estado === "cancelado" ? "por_reembolsar" : "pagado", ref: `SIM-${100200 + i * 37}`, simulado: true } : { forma: "en_sucursal", estado: estado === "entregado" ? "pagado" : "pendiente", ref: null },
      estado, historial: [{ ts: fecha, estado: "nuevo", usuarioId: null, nota: "Pedido recibido desde la tienda en línea" }], ventaId: null,
    };
    const orden = ["nuevo", "preparando", "listo", "entregado"];
    const hasta = estado === "cancelado" ? 1 : orden.indexOf(estado);
    for (let k = 1; k <= hasta; k++) pedido.historial.push({ ts: fecha.slice(0, 11) + `${pad(10 + k, 2)}:${pad((i * 11) % 60, 2)}`, estado: orden[k], usuarioId: (gerenteDe(suc) || {}).id || null, nota: "" });
    if (estado === "cancelado") { pedido.motivoCancelacion = i === 10 ? "El cliente ya no lo necesita" : "No se pudo confirmar la entrega"; pedido.historial.push({ ts: fecha.slice(0, 11) + "13:05", estado: "cancelado", usuarioId: (gerenteDe(suc) || {}).id || null, nota: pedido.motivoCancelacion }); }
    if (estado === "entregado") {
      const cj = cajeroDe(suc);
      const parts = partidas.map((x) => ({ tipo: "producto", itemId: x.productoId, nombre: x.nombre, cant: x.cant, precioLista: x.precioLista, ajustePct: x.ajustePct, precio: x.precio, importe: x.importe, costo: base.productos.find((p) => p.id === x.productoId).costo }));
      if (envio) parts.push({ tipo: "envio", itemId: "ENVIO", nombre: "Envío a domicilio", cant: 1, precioLista: envio, ajustePct: 0, precio: envio, importe: envio });
      const v = {
        id: `VEW${i + 1}`, folio: folio("T"), sucursalId: suc, cajeroId: cj.id, pacienteId: null, consultaId: null, tipo: "contado", fecha: fecha.slice(0, 11) + "18:10", partidas: parts,
        subtotal: pedido.total, descuento: 0, total: pedido.total, pagos: [{ forma: enLinea ? "en_linea" : "efectivo", monto: pedido.total }], cambio: 0, estado: "pagada", facturar: false, factura: null,
        turnoId: "hist", vendedorId: cj.id, origen: "pedido_web", pedidoWebId: pedido.id,
      };
      base.ventas.push(v);
      pedido.ventaId = v.id; pedido.entregadoPor = cj.id;
      pedido.historial.push({ ts: v.fecha, estado: "entregado", usuarioId: cj.id, nota: `Venta ${v.folio}` });
    }
    return pedido;
  });
  base.contadores.PW = pedidosWeb.length;

  // ───────── Auditorías de inventario a distancia (10). Contexto: hubo un robo reciente en Sur y quieren saber cuándo se detectó.
  const stockNow = (s, p) => R.stock(base, s, p.id);
  const cands = (s) => vP.filter((p) => stockNow(s, p) > 0).sort((a, b) => stockNow(s, b) * b.costo - stockNow(s, a) * a.costo || a.sku.localeCompare(b.sku));
  const aud = [];
  const mk = (n, suc, hace, hora, origen, zona, usuarioRol, itemsSpec, extra = {}) => {
    const lista = cands(suc);
    const items = itemsSpec.map(([idx, dEst, dSis = 0]) => {
      const p = lista[idx % lista.length];
      const sistema = Math.max(0, stockNow(suc, p) + dSis);
      const est = Math.max(0, sistema + dEst);
      const dif = est - sistema;
      return { productoId: p.id, sistema, estimado: est, dif, estado: Math.abs(dif) > tol(sistema) ? "diferencia" : "ok", estimadoIA: est, confianza: 90 - Math.abs(dif) * 4, corregido: false, resolucion: null };
    });
    const u = usuarioRol === "gerente" ? gerenteDe(suc) : base.usuarios.find((x) => x.rol === "almacen" && !x.almacenCentral && x.sucursales[0] === suc);
    const a = { id: `AF${n}`, folio: `AF-${pad(n)}`, sucursalId: suc, zona, origen, camaraRef: origen === "camara" ? "CAM-BODEGA-02" : null, usuarioId: u.id, fecha: DT(-hace, hora, (n * 13) % 60), fotos: extra.foto ? [svgAnaquel(n)] : [], items, nota: extra.nota || "", simulado: true };
    aud.push(a);
    return a;
  };
  const grande = (s, pct, min = 2) => Math.max(min, Math.round(stockNow(s, cands(s)[0]) * pct));
  // Sur (S3): tres conformes y luego el faltante grande detectado por la cámara de seguridad (investigación abierta).
  mk(1, "S3", 21, 10, "colaborador", "Anaquel de bastones y andaderas", "almacen", [[0, 0], [1, 0], [2, 0]]);
  mk(2, "S3", 14, 10, "colaborador", "Anaquel de bastones y andaderas", "almacen", [[0, 0], [1, 1], [2, 0]]);
  mk(3, "S3", 7, 11, "colaborador", "Anaquel de bastones y andaderas", "almacen", [[0, 0], [1, 0], [2, -1]]);
  const a4 = mk(4, "S3", 3, 20, "camara", "Bodega", "gerente", [[0, -grande("S3", 0.5, 3)], [1, 0], [2, 0]], { foto: true, nota: "Revisión por cámara tras reporte de faltante" });
  // Centro (S1) conforme; Norte (S2) con diferencia sin atender; Polanco (S6) con ajuste pidiendo autorización.
  mk(5, "S1", 2, 9, "colaborador", "Anaquel de plantillas", "almacen", [[0, 0], [1, 0], [3, 1]]);
  mk(6, "S2", 5, 16, "colaborador", "Anaquel de plantillas", "almacen", [[0, -grande("S2", 0.4)], [1, 0], [2, 0]], { foto: true });
  mk(7, "S5", 9, 12, "colaborador", "Exhibidor de cremas y calcetas", "almacen", [[0, 0], [1, 0], [2, 1]]);
  const a8 = mk(8, "S6", 4, 15, "colaborador", "Anaquel de calzado", "gerente", [[0, -grande("S6", 0.35)], [1, 0], [2, 0]], { foto: true });
  mk(9, "S7", 12, 11, "colaborador", "Anaquel de bastones y andaderas", "almacen", [[0, 0], [1, 0], [2, 0]]);
  mk(10, "S4", 18, 10, "colaborador", "Anaquel de plantillas", "almacen", [[0, 0], [1, 0], [2, 0]]);

  const investigacionesInv = [];
  const difItem = (a) => a.items.find((i) => i.estado === "diferencia");
  const i4 = difItem(a4);
  if (i4) {
    const costo = base.productos.find((p) => p.id === i4.productoId).costo;
    const g = (gerenteDe("S3") || {}).id;
    const inv = {
      id: "IN1", folio: "INV-0001", auditoriaId: a4.id, productoId: i4.productoId, sucursalId: "S3", abiertaPor: g, fecha: DT(-3, 21, 5), estado: "abierta", faltante: -i4.dif, valor: Math.abs(i4.dif) * costo,
      notas: [
        { ts: DT(-3, 21, 5), usuarioId: g, texto: "Faltante detectado por cámara. Se revisan los accesos a bodega y los movimientos de los últimos 14 días." },
        { ts: DT(-2, 9, 15), usuarioId: g, texto: "Se pidió el video de la cámara de bodega entre el 3.er y el 4.º conteo." },
      ],
      conclusion: null,
    };
    investigacionesInv.push(inv);
    i4.resolucion = { tipo: "investigacion", invId: inv.id, por: g, fecha: inv.fecha };
  }
  // Polanco: ajuste propuesto → autorización pendiente.
  const i8 = difItem(a8);
  if (i8) {
    const costo = base.productos.find((p) => p.id === i8.productoId).costo;
    const monto = Math.abs(i8.dif) * costo;
    const nivel = monto <= base.params.S6.limiteAjusteGerente ? "gerente" : "admin";
    const au = { id: "AUAF8", tipo: "ajuste_inventario", sucursalId: "S6", solicitanteId: a8.usuarioId, detalle: `Auditoría ${a8.folio} · merma · ${R.nombreProducto(base, i8.productoId)} ${i8.dif}`, monto, nivel, estado: "pendiente", fecha: F(-4), resueltoPor: null, motivo: "", ref: { almacenId: "S6", productoId: i8.productoId, cant: i8.dif } };
    base.autorizaciones.unshift(au);
    i8.resolucion = { tipo: "ajuste", autId: au.id, motivo: "merma", por: a8.usuarioId, fecha: DT(-4, 16, 10), cant: i8.dif };
  }
  // ───────── Cartera atrasada de demostración (para que el asistente tenga casos de «más de 30 días de atraso»).
  // La semilla base solo llega a ~29 días de atraso; se agregan 3 planes a plazos con parcialidades vencidas hace 50–80 días.
  [["S1", 3, [-75, -60, -45, -30], 1], ["S4", 17, [-50, -35, -20, -5], 0], ["S6", 29, [-110, -95, -80, -65], 2]].forEach(([suc, ip, vencs, pagadas], k) => {
    const pac = base.pacientes[ip + k * 5];
    const cap = [450, 600, 525][k];
    const pars = vencs.map((v, j) => ({ n: j + 1, vence: F(v), capital: cap, pagado: j < pagadas ? cap : 0 }));
    const plan = { id: `PLC${k + 1}`, folio: folio("CR"), pacienteId: pac.id, sucursalId: suc, tipo: "plazos", monto: cap * 4, enganche: 0, parcialidades: pars, creado: F(vencs[0] - 15), estado: "vigente" };
    base.planes.push(plan);
    if (!base.creditos.find((c) => c.pacienteId === pac.id)) base.creditos.push({ pacienteId: pac.id, limite: 5000, bloqueado: false });
    pars.filter((x) => x.pagado).forEach((x) => base.abonosCredito.push({ id: `ABC${k}${x.n}`, planId: plan.id, parcialidad: x.n, monto: x.capital, sucursalId: suc, fecha: x.vence, cajeroId: cajeroDe(suc).id }));
  });
  base.contadores.AF = aud.length;
  base.contadores.INV = investigacionesInv.length;

  return {
    pedidosWeb,
    auditorias: aud.sort((x, y) => y.fecha.localeCompare(x.fecha)),
    investigacionesInv,
    seguimientosCobranza: [],
    asistenteLog: [],
    comercialCfg: { costoEnvio: 99, envioPorValidar: true, envioGratisDesde: 0, auditoriaDiasMax: 7, toleranciaPct: 10, maxFotos: 40 },
  };
}
