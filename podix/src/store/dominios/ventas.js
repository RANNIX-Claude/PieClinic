// Dominio «ventas» (incorporado de Pie Firme): semilla de datos de demostración. seed(base, util) → objeto que se mezcla en el estado.
// Claves que POSEE este dominio: d.ventasCfg, d.fiscal, d.paq, d.inv, d.mant, d.comi. Todo es ficticio: los RFC son los genéricos
// del SAT (XAXX010101000 / XEXX010101000) o sintéticos con prefijo DEMO/DEM; los UUID llevan prefijo SIM y no son folios fiscales.
import * as V from "../reglas_ventas.js";
import { redondear, dia, sumarDias } from "../../lib/format.js";

const mesRel = (ref, n) => { const [y, m] = ref.slice(0, 7).split("-").map(Number); const x = new Date(y, m - 1 + n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const finMes = (mes) => { const [y, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };

export function seed(base, util) {
  const { r, int, pick, F, DT, id, folio, pad } = util;
  const hoy = F(0);
  const admin = base.usuarios.find((u) => u.rol === "admin"), direccion = base.usuarios.find((u) => u.rol === "direccion");
  const gerentes = base.usuarios.filter((u) => u.rol === "gerente"), podologos = base.usuarios.filter((u) => u.rol === "podologo");
  const gerenteDe = (s) => gerentes.find((g) => g.sucursales.includes(s)) || gerentes[0];
  const cajeroDe = (s) => base.usuarios.find((u) => u.rol === "cajero" && u.sucursales[0] === s);
  const nomPac = (p) => `${p.nombres} ${p.apellidos}`;

  // ───────── Parámetros del dominio y PIN de autorización (DEMOSTRACIÓN: en producción el PIN se valida en el servidor)
  const pines = {};
  [admin, direccion, ...gerentes].forEach((u, i) => { pines[u.id] = String(2468 + i * 1111).slice(-4); });
  const ventasCfg = { ...V.PARAMS_VENTAS, pines };

  // ═════════════════════════ Inventario: fichas de producto y de proveedor
  const MARCAS = { Bastones: "Ortopedia Apoyo", Andaderas: "Ortopedia Apoyo", Plantillas: "PieConfort", Calzado: "PasoSano", Cremas: "DermoPie", Calcetas: "PasoSano", Insumos: "ClinInsumos" };
  const CLAVE_SAT = { Bastones: "42211500", Andaderas: "42211500", Plantillas: "42242100", Calzado: "53111900", Cremas: "53131600", Calcetas: "53102400", Insumos: "42295400" };
  const fichas = {};
  base.productos.forEach((p, i) => {
    fichas[p.id] = {
      descripcion: `${p.nombre}. ${p.tipo === "insumo" ? "Insumo de uso clínico: se consume en consulta y no se vende al público." : "Producto de venta en mostrador y tienda en línea."}`,
      marca: MARCAS[p.categoria] || "Genérico", claveSat: CLAVE_SAT[p.categoria] || "42142900", unidadSat: "H87", ivaTipo: "16",
      ubicacion: `Anaquel ${"ABCDE"[i % 5]}-${1 + (i % 4)}`, codigoBarras: `750${String(1000000000 + i * 7919).slice(0, 10)}`, fotos: [], actualizado: F(-int(5, 60)),
    };
  });
  const DATOS_PROV = [
    ["OrtoMed SA de CV", "DEM150312M01", "601", "06700", "Ortopedia y plantillas", "Laura Méndez", "Transferencia a 30 días", "BBVA"],
    ["Insumos Clínicos del Centro SA de CV", "DEM180620M02", "601", "06010", "Insumos clínicos", "Raúl Ortega", "Transferencia a 15 días", "Santander"],
    ["Calzado Salud MX SA de CV", "DEM120905M03", "601", "03100", "Calzado ortopédico", "Mariana Soto", "Transferencia a 30 días", "Banorte"],
    ["Dermo Química SA de CV", "DEM200214M04", "601", "11000", "Dermocosmética", "Iván Paredes", "Transferencia a 45 días", "HSBC"],
  ];
  const provFichas = {}, provProductos = [], provEval = [], provDocs = [];
  base.proveedores.forEach((p, i) => {
    const x = DATOS_PROV[i % DATOS_PROV.length];
    provFichas[p.id] = {
      razon: x[0], rfc: x[1], regimen: x[2], cp: x[3], categoria: x[4], contacto: x[5], telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}`,
      correo: `ventas@proveedor${i + 1}.example`, domicilio: `Calle Industria #${100 + i * 23}, Col. Obrera, CDMX`, condiciones: x[6], diasCredito: p.dias, entregaDias: 5 + i * 2,
      minimoCompra: [1500, 800, 2500, 1200][i % 4], estado: "activo", notas: "",
      banco: { banco: x[7], clabe: `${String(12 + i).padStart(3, "0")}180${String(10000000000 + i * 987654321).slice(0, 11)}${i}`, titular: x[0] },
    };
    const cats = [["Bastones", "Andaderas", "Plantillas"], ["Insumos"], ["Calzado", "Calcetas"], ["Cremas", "Insumos"]][i % 4];
    base.productos.filter((pr) => cats.includes(pr.categoria)).forEach((pr, k) => {
      if (i === 3 && pr.categoria === "Insumos" && k % 3) return;
      provProductos.push({ id: id("PP"), proveedorId: p.id, productoId: pr.id, skuProveedor: `${p.id}-${pr.sku}`, costoRef: redondear(pr.costo * (0.96 + r() * 0.1)), nombreProveedor: pr.nombre.toUpperCase(), actualizado: F(-int(10, 120)) });
    });
    for (let k = 0; k < 3; k++) {
      provEval.push({ id: id("PE"), proveedorId: p.id, fecha: F(-(20 + k * 45 + i * 3)), puntualidad: int(3, 5) - (i === 1 && k === 0 ? 1 : 0), calidad: int(4, 5), precio: int(3, 5), servicio: int(3, 5), comentario: pick(["Entrega completa y a tiempo.", "Llegó un día tarde; avisaron antes.", "Buen empaque, sin producto dañado.", "Faltó una caja; la repusieron en la semana.", "Respuesta rápida a la cotización."]), evaluadoPor: admin.id });
    }
    [["Constancia de situación fiscal", "fiscal", 300], ["Opinión de cumplimiento (32-D)", "fiscal", 25 - i * 12], ["Contrato de suministro", "contrato", 200 + i * 30], ["Carátula bancaria", "banco", null]].forEach(([nombre, tipo, dias]) =>
      provDocs.push({ id: id("PD"), proveedorId: p.id, nombre, tipo, vigenteHasta: dias == null ? null : F(dias), subido: F(-int(30, 200)), subidoPor: admin.id, miniatura: null, nota: "Registro de demostración: sin archivo adjunto." }));
  });
  // Mermas históricas (ya resueltas): las dos de la semilla base más otras con evidencia descrita.
  const almDe = (a) => (base.usuarios.find((u) => u.rol === "almacen" && u.sucursales[0] === a && !u.almacenCentral) || admin).id;
  const mermas = (base.ajustesInventario || []).map((a) => ({ id: id("MR"), folio: folio("MR"), almacenId: a.almacenId, productoId: a.productoId, cant: Math.abs(a.cant), motivo: /caduc/i.test(a.motivo) ? "caducidad" : "daño", nota: a.motivo, fecha: a.fecha, registradoPor: almDe(a.almacenId), estado: "autorizado", resueltoPor: a.autorizadoPor, valor: redondear(Math.abs(a.cant) * (base.productos.find((p) => p.id === a.productoId) || { costo: 0 }).costo), ajusteId: a.id, foto: null, autorizacionId: null }));
  [["S3", "CRE-002", 2, "caducidad", "Lote vencido en anaquel", -12], ["S6", "CAL-010", 1, "daño", "Empaque roto en exhibición", -9], ["S4", "PLA-001", 2, "robo", "Faltante detectado en conteo cíclico", -15]].forEach(([alm, sku, cant, motivo, nota, off]) => {
    const pr = base.productos.find((p) => p.sku === sku);
    mermas.push({ id: id("MR"), folio: folio("MR"), almacenId: alm, productoId: pr.id, cant, motivo, nota, fecha: F(off), registradoPor: almDe(alm), estado: "rechazado", resueltoPor: gerenteDe(alm).id, valor: redondear(cant * pr.costo), ajusteId: null, foto: null, autorizacionId: null, motivoRechazo: "Se pidió recontar antes de dar de baja." });
  });
  const inv = { fichas, provFichas, provProductos, provEval, provDocs, mermas };
  const dTmp = { ...base, inv };

  // ═════════════════════════ Facturación (CFDI 4.0 SIMULADO)
  const emisor = { rfc: "DEM190401M77", razon: "PIE CLINIC DEMOSTRACIÓN SA DE CV", regimen: "601", cp: "06000", nombreComercial: "Clínicas de Podología (demostración)", ficticio: true };
  const pac = { modo: "simulado", proveedor: "por_definir", csdVigencia: null };
  const receptores = [];
  const receptorDe = new Map();
  base.pacientes.forEach((p, i) => {
    if (i % 5 !== 0 || p.tutor) return;
    const nac = p.nacimiento.replace(/-/g, "").slice(2);
    const rec = { id: id("RF"), pacienteId: p.id, rfc: `DEMO${nac}D${pad((i % 90) + 10)}`, nombre: nomPac(p).toUpperCase(), regimen: pick(["605", "612", "626", "605"]), usoCfdi: pick(["D01", "D01", "G03"]), cp: `0${int(1000, 9999)}`, correo: p.correo || `facturas${i}@correo.example`, validado: r() > 0.3, automatica: false, creado: F(-int(1, 200)) };
    receptores.push(rec); receptorDe.set(p.id, rec);
  });
  [["Asilo San José AC", "DEM990820M11", "603"], ["Industrias del Norte SA de CV", "DEM050115M12", "601"], ["Club Deportivo Pumas AC", "DEM780930M13", "603"]].forEach(([n, rfc, reg], i) =>
    receptores.push({ id: id("RF"), pacienteId: null, rfc, nombre: n.toUpperCase(), regimen: reg, usoCfdi: "G03", cp: `0${3100 + i * 211}`, correo: `cuentasporpagar${i + 1}@empresa.example`, validado: true, automatica: false, creado: F(-120 - i) }));
  receptores.push({ id: id("RF"), pacienteId: null, rfc: V.RFC_EXTRANJERO, nombre: "RESIDENTE EN EL EXTRANJERO (GENÉRICO)", regimen: "616", usoCfdi: "S01", cp: emisor.cp, correo: "", validado: true, automatica: false, creado: F(-90) });

  const facturas = [];
  const timbrar = (f, fecha) => { f.estado = "timbrada"; f.uuid = V.uuidSintetico(`${f.folio}|${fecha}`); f.timbradaEn = fecha; return f; };
  const mesHoy = hoy.slice(0, 7);
  const candidatas = base.ventas.filter((v) => v.estado === "pagada" && dia(v.fecha) <= hoy && dia(v.fecha).slice(0, 7) === mesHoy);
  const devPorVenta = new Map((base.devoluciones || []).map((x) => [x.ventaId, x]));
  let nF = 0;
  candidatas.forEach((v) => {
    const conDev = devPorVenta.has(v.id);
    if (!conDev && r() > 0.24) return;
    const propio = receptorDe.get(v.pacienteId);
    const rec = propio && r() > 0.15 ? propio : V.receptorPublico(emisor.cp);
    const c = V.conceptosDeVenta(dTmp, v);
    const cj = base.usuarios.find((u) => u.id === v.cajeroId) || admin;
    const f = V.facturaBase(emisor, { id: id("FC"), folio: folio("FA"), tipo: "ingreso", receptor: rec, sucursalId: v.sucursalId, fecha: v.fecha, emitidaPor: cj.id, conceptos: c.conceptos, totales: c, extra: { ventaId: v.id, ventaFolio: v.folio, pacienteId: v.pacienteId, formaPago: V.formaPagoSat(v.pagos) } });
    timbrar(f, v.fecha); nF++;
    if (!conDev && nF % 17 === 5) { f.estado = "cancelada"; f.cancelacion = { motivo: pick(["02", "03"]), comentario: pick(["RFC capturado con error; se volverá a facturar.", "El paciente pidió cambiar el uso del CFDI."]), fecha: v.fecha, por: admin.id, directa: true, estado: "aceptada", acuse: V.uuidSintetico(`acuse|${f.folio}`) }; }
    facturas.push(f);
    if (conDev) {
      const dv = devPorVenta.get(v.id);
      const monto = Math.min(dv.monto, f.total);
      const cn = [V.conceptoCfdi(dTmp, { tipo: f.conceptos[0].tipo, itemId: f.conceptos[0].itemId, nombre: `Devolución ${dv.folio} · ${dv.motivo}`, cant: 1, bruto: monto, desc: 0 })];
      const nc = V.facturaBase(emisor, { id: id("FC"), folio: folio("NCR"), tipo: "egreso", receptor: f.receptor, sucursalId: f.sucursalId, fecha: `${dv.fecha}T12:00`, emitidaPor: admin.id, conceptos: cn, totales: V.totalesCfdi(cn), extra: { relacionada: { facturaId: f.id, folio: f.folio, uuid: f.uuid, tipoRelacion: "01" }, motivo: dv.motivo, devolucionId: dv.id, formaPago: f.formaPago } });
      facturas.push(timbrar(nc, nc.fecha));
    }
  });
  // Ventas a plazos facturadas con método PPD y sus complementos de pago (queda al menos un abono sin complemento).
  base.planes.filter((p) => p.tipo === "plazos" && ["vigente", "liquidado"].includes(p.estado) && !String(p.id).startsWith("PLA")).slice(0, 5).forEach((pl, k) => {
    const pacR = receptorDe.get(pl.pacienteId) || V.receptorPublico(emisor.cp);
    const c = V.conceptosDePlan(dTmp, pl);
    const f = V.facturaBase(emisor, { id: id("FC"), folio: folio("FA"), tipo: "ingreso", receptor: pacR, sucursalId: pl.sucursalId, fecha: `${pl.creado}T11:00`, emitidaPor: admin.id, conceptos: c.conceptos, totales: c, extra: { planId: pl.id, planFolio: pl.folio, pacienteId: pl.pacienteId, metodoPago: "PPD", formaPago: "99", pagadoInicial: pl.enganche || 0 } });
    timbrar(f, f.fecha); facturas.push(f);
    if (k === 4) { f.estado = "cancelacion_solicitada"; f.cancelacion = { motivo: "02", comentario: "Datos fiscales del receptor incorrectos; el paciente enviará su constancia.", fecha: F(-2), por: admin.id, directa: false, estado: "esperando_aceptacion" }; return; }
    const abonos = (base.abonosCredito || []).filter((a) => a.planId === pl.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    let saldo = redondear(f.total - (pl.enganche || 0));
    abonos.slice(0, Math.max(0, abonos.length - 1)).forEach((a, i) => {
      const ant = saldo; saldo = redondear(saldo - a.monto);
      const cp = V.facturaBase(emisor, { id: id("FC"), folio: folio("CP"), tipo: "pago", receptor: { ...f.receptor, usoCfdi: "CP01" }, sucursalId: a.sucursalId || f.sucursalId, fecha: `${a.fecha}T13:00`, emitidaPor: admin.id, extra: { relacionada: { facturaId: f.id, folio: f.folio, uuid: f.uuid }, pago: { abonoId: a.id, monto: a.monto, fecha: a.fecha, forma: "01", parcialidad: i + 1, saldoAnterior: ant, saldoInsoluto: saldo }, metodoPago: null, formaPago: "01" } });
      facturas.push(timbrar(cp, cp.fecha));
    });
  });
  // Factura global del mes anterior (los tickets de ese mes ya no existen en la demo: sale del resumen mensual d.hist).
  const mesAnt = mesRel(hoy, -1);
  const cg = [];
  base.sucursales.forEach((s) => {
    const h = (base.hist || []).find((x) => x.sucursalId === s.id && x.mes === mesAnt);
    if (!h) return;
    cg.push({ ...V.conceptoCfdi(dTmp, { tipo: "servicio", itemId: null, nombre: `Servicios al público en general · ${s.nombre} · ${mesAnt}`, cant: 1, bruto: Math.round(h.servicios * 0.62), desc: 0 }), claveSat: "01010101", unidadSat: "ACT" });
    cg.push({ ...V.conceptoCfdi(dTmp, { tipo: "producto", itemId: null, nombre: `Productos al público en general · ${s.nombre} · ${mesAnt}`, cant: 1, bruto: Math.round((h.productos + h.plantillas) * 0.7), desc: 0 }), claveSat: "01010101", unidadSat: "ACT" });
  });
  if (cg.length) facturas.push(timbrar(V.facturaBase(emisor, { id: id("FC"), folio: folio("FG"), tipo: "global", receptor: V.receptorPublico(emisor.cp), sucursalId: null, fecha: `${finMes(mesAnt)}T20:00`, emitidaPor: admin.id, conceptos: cg, totales: V.totalesCfdi(cg), extra: { ventaIds: [], global: { periodicidad: "04", mes: mesAnt, resumen: true }, formaPago: "01" } }), `${finMes(mesAnt)}T20:00`));
  facturas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const fiscal = { emisor, pac, receptores, facturas };

  // ═════════════════════════ Paquetes, planes de láser, membresías y gift cards
  const sv = (n) => base.servicios.find((s) => s.nombre.startsWith(n));
  const convMemb = [{ id: "CVM1", nombre: "Membresía Pie Sano", tipo: "membresia", descuentoPct: 10 }, { id: "CVM2", nombre: "Membresía Familiar", tipo: "membresia", descuentoPct: 15 }];
  convMemb.forEach((c) => { if (!base.convenios.some((x) => x.id === c.id)) base.convenios.push(c); });   // convive con «Convenios y membresías»
  const of = (o) => ({ id: id("OF"), estado: "activa", descripcion: "", sesionesTotal: null, servicioBaseId: null, intervaloDias: null, caducidadMeses: 12, componentes: [], beneficios: [], descuentoPct: null, convenioId: null, montoSaldo: null, transferible: true, todasSedes: true, creado: F(-200), ...o });
  const ofertas = [
    of({ codigo: "PAQ-QUI5", tipo: "paquete", nombre: "Paquete 5 quiropodias", precio: 2000, sesionesTotal: 5, servicioBaseId: sv("Quiropodia").id, intervaloDias: 35, descripcion: "Cinco quiropodias para usarse en cualquier sucursal.", componentes: [{ tipo: "servicio", itemId: sv("Quiropodia").id, cant: 5, precioLista: sv("Quiropodia").precioBase }] }),
    of({ codigo: "PAQ-DIA4", tipo: "paquete", nombre: "Paquete pie diabético · 4 curaciones", precio: 1700, sesionesTotal: 4, servicioBaseId: sv("Curación pie").id, intervaloDias: 30, descripcion: "Cuatro curaciones con revisión de sensibilidad en cada visita.", componentes: [{ tipo: "servicio", itemId: sv("Curación pie").id, cant: 4, precioLista: sv("Curación pie").precioBase }] }),
    of({ codigo: "PAQ-UNA3", tipo: "paquete", nombre: "Paquete uña sana · 3 ortonixias + crema", precio: 2500, sesionesTotal: 3, servicioBaseId: sv("Ortonixia").id, intervaloDias: 30, descripcion: "Tres sesiones de corrector de uña y una crema de urea.", componentes: [{ tipo: "servicio", itemId: sv("Ortonixia").id, cant: 3, precioLista: sv("Ortonixia").precioBase }, { tipo: "producto", itemId: base.productos.find((p) => p.sku === "CRE-002").id, cant: 1, precioLista: 160 }] }),
    of({ codigo: "LAS-06", tipo: "plan_laser", nombre: "Plan láser para hongos · 6 sesiones", precio: 4200, sesionesTotal: 6, servicioBaseId: sv("Láser").id, intervaloDias: 30, descripcion: "Una sesión cada 30 a 35 días (P-029: la ventana es recomendación).", componentes: [{ tipo: "servicio", itemId: sv("Láser").id, cant: 6, precioLista: sv("Láser").precioBase }] }),
    of({ codigo: "LAS-10", tipo: "plan_laser", nombre: "Plan láser para hongos · 10 sesiones", precio: 6500, sesionesTotal: 10, servicioBaseId: sv("Láser").id, intervaloDias: 30, descripcion: "Para onicomicosis extensa; incluye valoración inicial.", componentes: [{ tipo: "servicio", itemId: sv("Láser").id, cant: 10, precioLista: sv("Láser").precioBase }], transferible: false }),
    of({ codigo: "MEM-SANO", tipo: "membresia", nombre: "Membresía Pie Sano (anual)", precio: 1200, descuentoPct: 10, convenioId: "CVM1", beneficios: ["10 % de descuento en servicios y productos", "Una valoración anual sin costo", "Prioridad en lista de espera"], transferible: false }),
    of({ codigo: "MEM-FAM", tipo: "membresia", nombre: "Membresía Familiar (anual)", precio: 2400, descuentoPct: 15, convenioId: "CVM2", beneficios: ["15 % de descuento para hasta 4 familiares", "Dos valoraciones anuales sin costo", "Recordatorio de revisión para adultos mayores"], transferible: false }),
    of({ codigo: "GC-500", tipo: "gift_card", nombre: "Gift card $500", precio: 500, montoSaldo: 500, descripcion: "Canjeable en cualquier sucursal; no se combina con promociones (P-073)." }),
    of({ codigo: "GC-1000", tipo: "gift_card", nombre: "Gift card $1,000", precio: 1000, montoSaldo: 1000 }),
    of({ codigo: "GC-2000", tipo: "gift_card", nombre: "Gift card $2,000", precio: 2000, montoSaldo: 2000 }),
  ];
  const deSesiones = ofertas.filter((o) => ["paquete", "plan_laser"].includes(o.tipo));
  const adquiridos = [], consumos = [], membresias = [], giftCards = [], giftMovs = [], transferencias = [];
  // días desde la compra: recientes, a medio uso, por vencer (≈ 11 meses) y caducados (> 12 meses)
  const EDADES = [8, 15, 22, 40, 55, 75, 95, 120, 150, 180, 210, 250, 290, 335, 341, 348, 352, 358, 372, 390, 420, 30, 60, 100, 12, 200, 345, 5, 45, 130, 356, 380, 18, 70, 160, 300];
  EDADES.forEach((edad, i) => {
    const o = deSesiones[i % deSesiones.length], pac = base.pacientes[(i * 7 + 3) % base.pacientes.length], suc = base.sucursales[i % base.sucursales.length].id;
    const compra = F(-edad), vence = V.venceDe(compra, o.caducidadMeses);
    const caduco = vence < hoy;
    const usadas = i % 9 === 0 ? o.sesionesTotal : Math.min(o.sesionesTotal - (caduco || i % 4 ? 1 : 0), Math.max(0, Math.floor(edad / (o.intervaloDias || 30)) - (i % 3 === 0 ? 1 : 0)));
    const saldoPend = i % 11 === 4 ? Math.round(o.precio / 2) : 0;
    const a = { id: id("PQ"), folio: folio("PQ"), ofertaId: o.id, tipo: o.tipo, nombre: o.nombre, pacienteId: pac.id, sucursalId: suc, vendidoPor: cajeroDe(suc).id, fechaCompra: compra, vence, sesionesTotal: o.sesionesTotal, sesionesUsadas: usadas, servicioBaseId: o.servicioBaseId, intervaloDias: o.intervaloDias, precioTotal: o.precio, pagado: o.precio - saldoPend, saldoPendiente: saldoPend, pagos: [{ fecha: compra, forma: pick(["tarjeta", "efectivo", "transferencia"]), monto: o.precio - saldoPend }], estado: i === 20 ? "cancelado" : "vigente", transferible: o.transferible };
    if (a.estado === "cancelado") { a.canceladoEl = F(-edad + 3); a.motivoCancelacion = "El paciente cambió de ciudad; se devolvió lo no usado."; }
    adquiridos.push(a);
    const pods = podologos.filter((p) => p.sucursales.includes(suc));
    for (let n = 1; n <= usadas; n++) {
      const f = sumarDias(compra, Math.min(edad, (n - 1) * (o.intervaloDias || 30) + int(0, 4)));
      consumos.push({ id: id("PC"), adquiridoId: a.id, n, fecha: f > hoy ? hoy : f, sucursalId: n % 4 === 0 ? base.sucursales[(i + 1) % base.sucursales.length].id : suc, podologoId: (pods[n % pods.length] || podologos[0]).id, consultaId: null, valor: V.valorSesion(a), registradoPor: cajeroDe(suc).id });
    }
  });
  // Una transferencia entre familiares ya hecha (el paquete conserva vigencia y sesiones usadas).
  const tr = adquiridos.find((a) => a.transferible && V.estadoAdquirido(a, hoy) === "vigente");
  if (tr) { const de = base.pacientes[(base.pacientes.findIndex((p) => p.id === tr.pacienteId) + 31) % base.pacientes.length]; transferencias.push({ id: id("PT"), adquiridoId: tr.id, dePacienteId: de.id, aPacienteId: tr.pacienteId, fecha: sumarDias(tr.fechaCompra, 6), motivo: "Lo compró para su mamá.", por: cajeroDe(tr.sucursalId).id }); }
  const memb = ofertas.filter((o) => o.tipo === "membresia");
  [20, 45, 80, 110, 160, 200, 240, 300, 338, 346, 355, 370, 395, 60].forEach((edad, i) => {
    const o = memb[i % 2], pac = base.pacientes[(i * 11 + 5) % base.pacientes.length], suc = base.sucursales[(i + 2) % base.sucursales.length].id;
    const inicio = F(-edad), vence = V.venceDe(inicio, 12);
    membresias.push({ id: id("MB"), folio: folio("MB"), ofertaId: o.id, nombre: o.nombre, pacienteId: pac.id, sucursalId: suc, inicio, vence, descuentoPct: o.descuentoPct, beneficios: o.beneficios, convenioId: o.convenioId, precio: o.precio, estado: "vigente", vendidoPor: cajeroDe(suc).id, pagos: [{ fecha: inicio, forma: "tarjeta", monto: o.precio }] });
    if (vence >= hoy && !pac.convenioId) pac.convenioId = o.convenioId;   // el descuento de la membresía lo aplica la caja por convenio
  });
  const gifts = ofertas.filter((o) => o.tipo === "gift_card");
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codigo = () => `GC-${Array.from({ length: 4 }, () => ABC[int(0, ABC.length - 1)]).join("")}-${Array.from({ length: 4 }, () => ABC[int(0, ABC.length - 1)]).join("")}`;
  [10, 25, 50, 90, 140, 200, 260, 340, 350, 375, 400, 3].forEach((edad, i) => {
    const o = gifts[i % 3], suc = base.sucursales[(i + 4) % base.sucursales.length].id, comp = base.pacientes[(i * 13 + 9) % base.pacientes.length];
    const emitida = F(-edad), g = { id: id("GC"), codigo: codigo(), ofertaId: o.id, compradorId: comp.id, beneficiario: util.nom(i % 2 === 0), montoInicial: o.montoSaldo, saldo: o.montoSaldo, emitida, vence: V.venceDe(emitida, 12), sucursalId: suc, estado: "activa", vendidoPor: cajeroDe(suc).id };
    giftMovs.push({ id: id("GM"), giftId: g.id, tipo: "emision", monto: g.montoInicial, fecha: emitida, sucursalId: suc, usuarioId: g.vendidoPor, ref: "Venta de gift card" });
    const canjes = i % 4 === 0 ? [g.montoInicial] : i % 3 === 1 ? [Math.round(g.montoInicial * 0.4)] : i % 5 === 2 ? [300, 150] : [];
    canjes.forEach((m, k) => {
      if (m > g.saldo) return;
      const s2 = base.sucursales[(i + k + 1) % base.sucursales.length].id;
      g.saldo = redondear(g.saldo - m);
      giftMovs.push({ id: id("GM"), giftId: g.id, tipo: "canje", monto: -m, fecha: sumarDias(emitida, Math.min(edad, 7 + k * 20)), sucursalId: s2, usuarioId: cajeroDe(s2).id, ref: pick(["Quiropodia", "Plantilla confort", "Pedicura médica", "Crema urea 10 %"]) });
    });
    giftCards.push(g);
  });
  const paq = { ofertas, adquiridos, consumos, membresias, giftCards, giftMovs, transferencias };

  // ═════════════════════════ Mantenimiento de equipos
  const equipos = [], ordenes = [], presupuestos = [];
  const CAT_EQ = [
    ["autoclave", "Autoclave clase B 18 L", "Steriline", 180, 38000], ["laser", "Láser podológico 1064 nm", "PodoLight", 365, 185000],
    ["sillon", "Sillón podológico eléctrico", "Ergopod", 180, 42000], ["sillon", "Sillón podológico eléctrico", "Ergopod", 180, 42000], ["sillon", "Sillón podológico hidráulico", "Ergopod", 180, 28000],
    ["escaner", "Escáner 3D de huella plantar", "FootScan", 365, 96000], ["micromotor", "Micromotor con aspiración", "PodoTurbo", 120, 24000], ["otro", "Lámpara de exploración LED", "LuzClin", 365, 6500],
  ];
  const TECNICOS = ["Servicio Biomédico del Valle", "Electromédica Integral", "Mantenimiento Clínico Roma", "Técnico interno"];
  base.sucursales.forEach((s, si) => {
    CAT_EQ.forEach(([tipo, nombre, marca, per, valor], k) => {
      if (tipo === "laser" && si % 2 === 1) return;   // no todas las sucursales tienen láser
      const atras = k === 0 && si === 2 ? per + 20 : k === 6 && si % 3 === 0 ? per + 6 : k === 5 && si === 4 ? per - 9 : int(20, per - 20);
      equipos.push({
        id: id("EQ"), codigo: `${tipo.slice(0, 3).toUpperCase()}-${s.id}-${k + 1}`, sucursalId: s.id, tipo, nombre: tipo === "sillon" ? `${nombre} · ${s.consultorios[k - 2] || "C1"}` : tipo === "autoclave" ? `${nombre} (AC-1)` : nombre,
        marca, modelo: `${marca.slice(0, 2).toUpperCase()}-${100 + k * 15}`, serie: `SN${20000 + si * 100 + k}`, ubicacion: tipo === "sillon" ? `Consultorio ${s.consultorios[k - 2] || "C1"}` : tipo === "autoclave" ? "Central de esterilización" : tipo === "escaner" ? "Recepción clínica" : "Consultorio C1",
        compra: F(-int(400, 1500)), valor, periodicidadDias: per, ultimoServicio: F(-atras), garantiaHasta: F(int(-200, 300)), estado: k === 2 && si === 5 ? "falla" : "vigente", responsableId: gerenteDe(s.id).id, notas: "",
      });
    });
  });
  const TRABAJOS = {
    autoclave: [["Prueba de vacío y cambio de empaque de puerta", 1800], ["Validación con indicador biológico fuera de rango", 2600], ["Calibración de temperatura y presión", 3200]],
    laser: [["Revisión de fibra y calibración de potencia", 6800], ["Cambio de filtro del sistema de enfriamiento", 2400]],
    sillon: [["Pedal no responde; revisar actuador", 1500], ["Retapizado de respaldo y descansapiés", 3900], ["Lubricación y ajuste de articulaciones", 900]],
    escaner: [["Limpieza de cristal y recalibración de sensores", 2100], ["No enciende; revisar fuente de poder", 1700]],
    micromotor: [["Cambio de carbones y revisión de aspiración", 1300], ["Pieza de mano con vibración", 1900]],
    otro: [["Cambio de módulo LED", 950]],
  };
  const hist = (o, fecha, de, a, por, nota = "") => o.historial.push({ fecha, de, a, por, nota });
  const ESTADOS_SEM = ["cerrado", "cerrado", "en_proceso", "autorizado", "solicitado", "cerrado", "rechazado", "cerrado", "solicitado", "en_proceso", "cerrado", "autorizado"];
  equipos.forEach((eq, i) => {
    if (i % 5 === 3) return;
    const lista = TRABAJOS[eq.tipo], [desc, costo] = lista[i % lista.length];
    const estado = ESTADOS_SEM[i % ESTADOS_SEM.length], urgente = i % 7 === 2, tipo = urgente ? "urgente" : /Calibraci|Lubricaci|Prueba|Limpieza|Revisión/.test(desc) ? "preventivo" : "normal";
    const off = -int(3, 70), g = gerenteDe(eq.sucursalId);
    const est = costo;
    const o = { id: id("OT"), folio: folio("OT"), equipoId: eq.id, sucursalId: eq.sucursalId, tipo, descripcion: desc, fecha: F(off), solicitadoPor: g.id, costoEstimado: est, costoReal: null, estado: "solicitado", proveedor: TECNICOS[i % TECNICOS.length], programada: null, asignadoA: null, autorizadoPor: null, autorizadoEn: null, autorizacionPendiente: false, iniciadoEn: null, cerradoEn: null, resultado: "", motivoRechazo: "", gastoId: null, evidencias: [], historial: [] };
    hist(o, DT(off, 10, 15), null, "solicitado", g.id, "Solicitud registrada");
    if (estado === "rechazado") { o.estado = "rechazado"; o.motivoRechazo = "Se atenderá con la garantía del fabricante."; hist(o, DT(off + 1, 9, 40), "solicitado", "rechazado", admin.id, o.motivoRechazo); }
    else if (estado !== "solicitado") {
      const sinAut = urgente && est <= V.PARAMS_VENTAS.mantUrgenteTope && estado === "en_proceso";
      if (!sinAut) { o.autorizadoPor = admin.id; o.autorizadoEn = DT(off + 1, 9, 30); hist(o, o.autorizadoEn, "solicitado", "autorizado", admin.id, "Autorizada"); }
      o.estado = "autorizado"; o.programada = F(off + 3); o.asignadoA = o.proveedor;
      if (estado === "en_proceso" || estado === "cerrado") {
        o.estado = "en_proceso"; o.iniciadoEn = DT(off + (sinAut ? 0 : 3), 11, 0); o.autorizacionPendiente = sinAut;
        hist(o, o.iniciadoEn, sinAut ? "solicitado" : "autorizado", "en_proceso", g.id, sinAut ? "Urgente atendida antes de autorizar (P-112): falta regularizar" : "Inicia atención");
      }
      if (estado === "cerrado") {
        o.estado = "cerrado"; o.cerradoEn = DT(Math.min(0, off + 5), 17, 20); o.costoReal = Math.round(est * (0.85 + r() * 0.3) / 10) * 10; o.resultado = pick(["Equipo probado y en operación.", "Se cambió la pieza y se dejó calibrado.", "Funciona; se recomienda revisión en el próximo servicio."]);
        hist(o, o.cerradoEn, "en_proceso", "cerrado", g.id, o.resultado);
        if (tipo === "preventivo" && dia(o.cerradoEn) > eq.ultimoServicio && V.estadoEquipo(eq, hoy) === "vigente") eq.ultimoServicio = dia(o.cerradoEn);
      }
    }
    if (o.estado === "en_proceso" && eq.estado === "vigente" && tipo !== "preventivo") eq.estado = "en_proceso";
    ordenes.push(o);
  });
  ordenes.sort((a, b) => b.fecha.localeCompare(a.fecha));
  base.sucursales.forEach((s, i) => { [-2, -1, 0, 1].forEach((k) => presupuestos.push({ id: id("MP"), sucursalId: s.id, mes: mesRel(hoy, k), monto: [9000, 7500, 7000, 8000, 6500, 11000, 8500][i % 7], fijadoPor: admin.id })); });
  const mant = { equipos, ordenes, presupuestos, tecnicos: TECNICOS };

  // ═════════════════════════ Comisiones por servicio y por podólogo
  const esquemas = [{ id: id("EC"), podologoId: null, nombre: "Esquema general de podólogos", tipo: "porcentaje", pctServicio: 30, pctProducto: 5, pctPlan: 25, porServicio: {}, viaticoPorCita: 0, pisoPeriodo: 0, vigenteDesde: F(-400), vigenteHasta: null, activo: true, creadoPor: admin.id, nota: "Supuesto de demostración: los porcentajes los fija el cliente (P-106)." }];
  const laser = sv("Láser").id, matri = sv("Matricectomía").id, valor = sv("Consulta de valoración").id, ondas = sv("Ondas de choque").id;
  podologos.forEach((p, i) => {
    if (i % 4 === 3) return;   // algunos podólogos usan el esquema general
    const base0 = [30, 32, 35, 28][i % 4];
    const viejo = i % 5 === 0;
    if (viejo) esquemas.push({ id: id("EC"), podologoId: p.id, nombre: `Esquema ${p.nombre} (anterior)`, tipo: "porcentaje", pctServicio: base0 - 3, pctProducto: 5, pctPlan: 22, porServicio: {}, viaticoPorCita: 0, pisoPeriodo: 0, vigenteDesde: F(-380), vigenteHasta: F(-61), activo: true, creadoPor: admin.id, nota: "" });
    esquemas.push({
      id: id("EC"), podologoId: p.id, nombre: `Esquema ${p.nombre}`, tipo: i % 3 === 0 ? "porcentaje_viatico" : "porcentaje", pctServicio: base0, pctProducto: [5, 6, 8][i % 3], pctPlan: 25,
      porServicio: { [laser]: 20, [matri]: base0 + 8, [valor]: 50, ...(i % 2 ? { [ondas]: 25 } : {}) }, viaticoPorCita: i % 3 === 0 ? 25 : 0, pisoPeriodo: i % 6 === 1 ? 3500 : 0,
      vigenteDesde: viejo ? F(-60) : F(-300 + i * 5), vigenteHasta: null, activo: true, creadoPor: admin.id, nota: "",
    });
  });
  const dC = { ...dTmp, comi: { esquemas, periodos: [], detalle: [] } };
  const q = V.quincenaDe(hoy);
  const periodos = [], detalle = [];
  const perAct = { id: id("PCM"), folio: folio("PCM"), desde: q.desde, hasta: q.hasta, estado: "por_cerrar", creadoPor: admin.id, creado: q.desde, cerradoPor: null, cerradoEn: null, totales: null, nota: "" };
  periodos.push(perAct);
  V.lineasComisionables(dC, { desde: q.desde, hasta: sumarDias(hoy, -2) }).forEach((l) => detalle.push({ id: id("CD"), periodoId: perAct.id, ...l, cargadoPor: admin.id, cargadoEn: F(-1) }));
  // Periodos anteriores, ya cerrados: sus totales quedaron congelados (los tickets de esas quincenas no viven en la demo).
  let cursor = sumarDias(q.desde, -1);
  for (let k = 0; k < 4; k++) {
    const qq = V.quincenaDe(cursor);
    const filas = podologos.map((p, i) => {
      const esq = V.esquemaVigente(dC, p.id, qq.hasta);
      const baseP = Math.round((38000 + ((i * 7919 + k * 331) % 22000)) / 10) * 10, citas = Math.round(baseP / 620);
      const comision = redondear(baseP * ((esq ? esq.pctServicio : 30) / 100) * 0.94), viatico = redondear(citas * ((esq && esq.viaticoPorCita) || 0)), piso = (esq && esq.pisoPeriodo) || 0;
      return { podologoId: p.id, base: baseP, comision, renglones: Math.round(citas * 1.3), citas, viatico, pisoAplicado: comision + viatico < piso, total: Math.max(redondear(comision + viatico), piso), porTipo: { servicio: redondear(comision * 0.93), producto: redondear(comision * 0.07), plan: 0, ajuste: 0 } };
    }).sort((a, b) => b.total - a.total);
    const sm = (k2) => redondear(filas.reduce((a, f) => a + f[k2], 0));
    periodos.push({ id: id("PCM"), folio: folio("PCM"), desde: qq.desde, hasta: qq.hasta, estado: "cerrado", creadoPor: admin.id, creado: qq.desde, cerradoPor: admin.id, cerradoEn: `${sumarDias(qq.hasta, 3)}T18:00`, totales: { filas, base: sm("base"), comision: sm("comision"), total: sm("total") }, resumen: true, nota: "" });
    cursor = sumarDias(qq.desde, -1);
  }
  const comi = { esquemas, periodos, detalle };

  return { ventasCfg, fiscal, paq, inv, mant, comi };
}
