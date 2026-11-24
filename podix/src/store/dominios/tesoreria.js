// Dominio «tesoreria» (incorporado de Pie Firme): semilla de datos de demostración. seed(base, util) → { tes }.
// Todo es FICTICIO y coherente con lo ya sembrado: los depósitos salen del efectivo cobrado en d.ventas y de los cortes,
// el estado de cuenta bancario sale de las partidas en libros (cobros con tarjeta y transferencia, depósitos, pagos en línea),
// los gastos menores del fondo revolvente son gastos de d.fin.gastos (mes en curso) y los cierres guardan la foto del estado de resultados.
// Bancos y cuentas son SINTÉTICOS («Banco Demostración», números DEMO-…): no corresponden a ninguna institución real.
import { hoy, redondear, sumarDias, dia } from "../../lib/format.js";
import * as T from "../reglas_tesoreria.js";
import { crudoSucursal, armarEdr, mesActual, mesRelativo } from "./finanzas.js";

const DESC_BANCO = {
  transferencia: "SPEI RECIBIDO", lote_tarjeta: "LIQUIDACION TERMINAL PUNTO DE VENTA", deposito_efectivo: "DEPOSITO EN EFECTIVO VENTANILLA",
  en_linea: "LIQUIDACION PASARELA DE PAGOS", pago_proveedor: "SPEI ENVIADO PROVEEDOR", reposicion_fondo: "TRASPASO FONDO REVOLVENTE",
};
const GASTOS_FONDO = [
  ["papeleria", "Copias y engargolado de formatos", 80, 250], ["otros", "Garrafones de agua purificada", 90, 180], ["limpieza", "Artículos de limpieza", 120, 380],
  ["otros", "Mensajería local", 100, 280], ["mantenimiento", "Reparación menor de llave de lavabo", 350, 850], ["otros", "Café y azúcar para sala de espera", 150, 290],
  ["papeleria", "Tóner para impresora de recepción", 600, 1200], ["limpieza", "Toallas de papel y jabón", 140, 320], ["otros", "Estacionamiento por trámite bancario", 40, 90],
];

export function seed(base, util) {
  const { r, int, F, DT, id } = util;
  const ref = hoy();
  const tes = { params: { ...T.PARAMS_TES }, cuentas: [], estados: [], movimientos: [], conciliaciones: [], depositos: [], fondos: [], fondoMovs: [], arqueos: [], reposiciones: [], cierres: [], cxc: [] };
  base.tes = tes; // las reglas leen d.tes mientras se siembra
  const gerente = (sid) => (base.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(sid)) || base.usuarios[0]).id;
  const admin = (base.usuarios.find((u) => u.rol === "admin") || base.usuarios[0]).id;
  const dir = (base.usuarios.find((u) => u.rol === "direccion") || base.usuarios.find((u) => u.rol === "admin") || base.usuarios[0]).id;
  const mesHoy = mesActual(ref);
  const inicioMes = `${mesHoy}-01`;
  const mesAnt = mesRelativo(mesHoy, -1);
  const saldoFecha = `${F(-8).slice(0, 7)}-01`;

  // ───────── Cuentas bancarias (una por sucursal + la concentradora de la cadena, P-094)
  base.sucursales.forEach((s, i) => tes.cuentas.push({
    id: `CB${i + 1}`, alias: `Operación ${s.nombre}`, banco: i % 2 ? "Banca Ficticia Nacional" : "Banco Demostración", numero: `DEMO-${4100 + i * 37}`,
    clabe: `999180DEMO${String(i + 1).padStart(8, "0")}`, sucursalId: s.id, moneda: "MXN", saldoInicial: int(45, 120) * 1000, saldoFecha, activa: true,
  }));
  tes.cuentas.push({ id: "CB0", alias: "Concentradora de la cadena", banco: "Banco Demostración", numero: "DEMO-0001", clabe: "999180DEMO00000000", sucursalId: null, moneda: "MXN", saldoInicial: 865000, saldoFecha, activa: true });

  // ───────── Cuentas por cobrar a convenios y aseguradoras (relaciones de servicios facturadas)
  const conv = (cid) => (base.convenios || []).find((c) => c.id === cid) ? cid : null;
  const docs = [
    ["CV3", "S1", 2, 18400, -75, 30, []],
    ["CV3", "S6", 1, 22750, -40, 30, [[-12, 10000]]],
    ["CV2", "S2", 0, 9800, -20, 30, []],
    ["CV1", "S4", 3, 6300, -100, 30, [[-60, 3000]]],
    ["CV4", "S5", 1, 7450, -35, 30, [[-3, 7450]]],
    ["CV3", "S3", 4, 12900, -130, 30, []],
    ["CV2", "S7", 1, 5600, -28, 21, [[-4, 2600]]],
  ];
  docs.forEach(([cid, sid, mAtras, monto, emit, dias, pagos], k) => {
    if (!conv(cid) || !base.sucursales.some((s) => s.id === sid)) return;
    const ps = pagos.map(([o, m]) => ({ fecha: F(o), monto: m, forma: "transferencia", referencia: `SPEI-CONV-${String(5000 + k * 13 + o * -1)}`, usuarioId: admin }));
    tes.cxc.push({
      id: id("CC"), folio: `CC-${String(k + 1).padStart(4, "0")}`, convenioId: cid, sucursalId: sid, concepto: `Relación de servicios ${mesRelativo(mesHoy, -mAtras)}`,
      emitido: F(emit), vence: F(emit + dias), monto, saldo: redondear(monto - ps.reduce((a, p) => a + p.monto, 0)), pagos: ps, creadoPor: admin,
    });
  });

  // ───────── Fondo revolvente por sucursal (P-095): asignación, gastos menores del mes en curso, reposición y arqueo
  const BASES = [4000, 3000, 3000, 3500, 2500, 5000, 3500];
  const gastosFin = (base.fin && base.fin.gastos) || [];
  const desdeGasto = F(-20) > inicioMes ? F(-20) : inicioMes;
  base.sucursales.forEach((s, i) => {
    const f = { id: `FR${i + 1}`, sucursalId: s.id, montoBase: BASES[i % BASES.length], responsableId: gerente(s.id), alertaPct: 80, activo: true, creadoEn: DT(-40, 9, 0), creadoPor: admin };
    tes.fondos.push(f);
    tes.fondoMovs.push({ id: id("FM"), fondoId: f.id, sucursalId: s.id, fecha: DT(-40, 9, 15), tipo: "asignacion", monto: f.montoBase, concepto: "Asignación inicial del fondo", usuarioId: admin, gastoId: null });
    const dias = [];
    if (desdeGasto <= F(-1)) for (let x = desdeGasto; x <= F(-1); x = sumarDias(x, 1)) dias.push(x);
    const n = dias.length ? Math.min(dias.length, int(5, 8)) : 0;
    const fechas = Array.from({ length: n }, () => dias[Math.floor(r() * dias.length)]).sort();
    let gastado = 0; const pendientesRepo = [];
    fechas.forEach((fecha, j) => {
      const [cat, concepto, a, b] = GASTOS_FONDO[Math.floor(r() * GASTOS_FONDO.length)];
      const monto = Math.round((a + r() * (b - a)) / 10) * 10;
      if (gastado + monto > f.montoBase * 0.9) return;
      gastado += monto;
      const g = { id: id("GA"), sucursalId: s.id, fecha, categoria: cat, concepto, monto, proveedorId: null, acreedor: "", comprobante: null, fuente: "manual", registradoPor: f.responsableId, creadoEn: `${fecha}T${String(10 + (j % 7)).padStart(2, "0")}:20`, fondoId: f.id, comprobanteFolio: `Ticket ${int(1000, 9999)}` };
      gastosFin.push(g);
      tes.fondoMovs.push({ id: id("FM"), fondoId: f.id, sucursalId: s.id, fecha: g.creadoEn, tipo: "gasto", monto: -monto, concepto, usuarioId: f.responsableId, gastoId: g.id, comprobanteFolio: g.comprobanteFolio });
      pendientesRepo.push(g);
      // Reposición autorizada a media semana (sucursales pares): el fondo vuelve a su monto base.
      if (i % 2 === 0 && j === Math.floor(fechas.length / 2) && sumarDias(fecha, 1) <= F(-2)) {
        const m = redondear(pendientesRepo.reduce((acc, x) => acc + x.monto, 0));
        const fr = sumarDias(fecha, 1);
        const rp = { id: id("RP"), fondoId: f.id, sucursalId: s.id, monto: m, gastos: pendientesRepo.map((x) => x.id), estado: "autorizada", solicitadaEn: `${fecha}T18:00`, solicitadaPor: f.responsableId, resueltaEn: `${fr}T11:00`, resueltaPor: admin, referencia: `REP-${s.id}-${fr.slice(5, 7)}${fr.slice(8, 10)}`, motivo: "" };
        tes.reposiciones.push(rp);
        tes.fondoMovs.push({ id: id("FM"), fondoId: f.id, sucursalId: s.id, fecha: rp.resueltaEn, tipo: "reposicion", monto: m, concepto: `Reposición ${rp.referencia}`, usuarioId: admin, gastoId: null, reposicionId: rp.id });
        pendientesRepo.length = 0; gastado = 0;
      }
    });
    // Una reposición en trámite (por autorizar) en la segunda sucursal.
    if (i === 1 && pendientesRepo.length) {
      const m = redondear(pendientesRepo.reduce((acc, x) => acc + x.monto, 0));
      tes.reposiciones.push({ id: id("RP"), fondoId: f.id, sucursalId: s.id, monto: m, gastos: pendientesRepo.map((x) => x.id), estado: "solicitada", solicitadaEn: DT(-1, 18, 10), solicitadaPor: f.responsableId, resueltaEn: null, resueltaPor: null, referencia: "", motivo: "" });
    }
    // Arqueo reciente: conforme, diferencia menor (se ajusta sola) o diferencia por revisar.
    const esperado = T.saldoFondo(base, f.id);
    const dif = i === 3 ? -120 : i === 0 ? -20 : 0;
    const a = T.arqueoFondo(esperado, esperado + dif, T.PARAMS_TES.toleranciaArqueo);
    const arq = { id: id("AQ"), fondoId: f.id, sucursalId: s.id, fecha: DT(-1, 19, 30), ...a, usuarioId: f.responsableId, nota: dif ? "Diferencia al contar billetes y monedas" : "", revisadoPor: null };
    tes.arqueos.push(arq);
    if (a.estado === "diferencia_menor") tes.fondoMovs.push({ id: id("FM"), fondoId: f.id, sucursalId: s.id, fecha: arq.fecha, tipo: "ajuste", monto: a.diferencia, concepto: "Ajuste por arqueo (diferencia menor a la tolerancia)", usuarioId: f.responsableId, gastoId: null, arqueoId: arq.id });
  });

  // ───────── Depósitos de efectivo de los últimos días (fichas de depósito)
  base.sucursales.forEach((s, i) => {
    for (let k = 6; k >= 1; k--) {
      const diaVenta = F(-k);
      const turno = k === 1 ? (base.turnos || []).find((t) => t.sucursalId === s.id && t.estado === "cerrado" && t.corte) : null;
      if (k === 1 && i === 2) continue; // S3: el efectivo de ayer aún no se deposita (pendiente visible)
      const efectivo = redondear(T.ingresosDe(base, { desde: diaVenta, hasta: diaVenta, sucursalId: s.id }).filter((x) => x.forma === "efectivo").reduce((a, x) => a + x.monto, 0));
      const monto = turno ? T.efectivoDeCorte(turno) || efectivo : efectivo;
      if (!(monto > 0)) continue;
      const fecha = sumarDias(diaVenta, 1) > ref ? ref : sumarDias(diaVenta, 1);
      tes.depositos.push({ id: id("DP"), sucursalId: s.id, fecha, diaVenta, monto, referencia: T.refDeposito(s.id, diaVenta), turnoId: turno ? turno.id : null, cuentaId: `CB${i + 1}`, registradoPor: gerente(s.id), registradoEn: `${fecha}T10:${String(10 + i).padStart(2, "0")}` });
    }
  });

  // ───────── Estados de cuenta importados y conciliados hasta antier (lo de ayer y hoy queda en tránsito)
  const hasta = F(-2);
  tes.cuentas.forEach((c, ci) => {
    const partidas = T.partidasLibro(base, c.id, { desde: c.saldoFecha, hasta });
    const imp = { id: id("EC"), cuentaId: c.id, archivo: `estado_cuenta_${c.numero}.csv`, importadoEn: DT(-1, 9, 5), importadoPor: admin, desde: c.saldoFecha, hasta: F(-1), filas: 0, errores: 0, simulado: true };
    partidas.forEach((p, j) => {
      if (r() < 0.08) return; // el banco aún no la refleja: queda en tránsito
      const fecha = p.tipo === "lote_tarjeta" || p.tipo === "en_linea" ? (sumarDias(p.fecha, 1) > F(-1) ? F(-1) : sumarDias(p.fecha, 1)) : p.fecha;
      tes.movimientos.push({
        id: id("MB"), cuentaId: c.id, fecha, descripcion: DESC_BANCO[p.tipo] || "MOVIMIENTO", referencia: j % 5 === 4 ? "" : p.referencia, monto: p.monto, importacionId: imp.id,
        estado: "conciliado", vinculos: [{ key: p.key, tipo: p.tipo, monto: p.monto, descripcion: p.descripcion }], regla: j % 5 === 4 ? "monto_fecha" : "referencia", conciliadoPor: admin, conciliadoEn: DT(-1, 9, 30),
      });
      imp.filas++;
    });
    // Lo que trae el banco y nadie registró: comisión (cargo) y, en algunas, un depósito sin identificar.
    tes.movimientos.push({ id: id("MB"), cuentaId: c.id, fecha: F(-3) < c.saldoFecha ? c.saldoFecha : F(-3), descripcion: c.sucursalId ? "COMISION POR USO DE TERMINAL" : "COMISION POR MANEJO DE CUENTA", referencia: `COM-${c.numero.slice(-4)}`, monto: -(c.sucursalId ? int(18, 45) * 10 : 385), importacionId: imp.id, estado: "detectado", vinculos: [], regla: null, conciliadoPor: null, conciliadoEn: null });
    imp.filas++;
    if (ci % 3 === 1) { tes.movimientos.push({ id: id("MB"), cuentaId: c.id, fecha: F(-2), descripcion: "DEPOSITO NO IDENTIFICADO", referencia: "", monto: int(6, 20) * 50, importacionId: imp.id, estado: "detectado", vinculos: [], regla: null, conciliadoPor: null, conciliadoEn: null }); imp.filas++; }
    tes.estados.push(imp);
    // Meses anteriores ya conciliados y cerrados.
    // Meses anteriores ya conciliados y cerrados (la cuenta de S7 tiene el mes pasado sin cerrar, a propósito).
    for (let k = 0; k <= 3; k++) {
      const mes = mesRelativo(mesHoy, -1 - k);
      if (c.sucursalId === "S7" && mes === mesAnt) continue;
      tes.conciliaciones.push({ id: id("CN"), cuentaId: c.id, mes, estado: "cerrada", saldoBanco: c.saldoInicial, saldoLibros: c.saldoInicial, transito: 0, porAclarar: 0, cerradaEn: `${mesRelativo(mes, 1)}-0${k ? 4 : 2}T12:00`, cerradaPor: admin });
    }
  });

  // ───────── Cierres mensuales por sucursal (P-099) con la foto del estado de resultados
  const foto = (sid, mes) => {
    const t = armarEdr(base, crudoSucursal(base, sid, mes), mes).totales;
    const gs = ((base.fin && base.fin.gastos) || []).filter((g) => g.sucursalId === sid && g.fecha.slice(0, 7) === mes);
    return { ingresos: t.ingresos, gastosVariables: t.gastosVariables, gastosOperacion: t.gastosOperacion, nomina: t.nomina, utilidadOperativa: t.utilidadOperativa, margen: t.margen, gastosRegistrados: redondear(gs.reduce((a, g) => a + g.monto, 0)), nGastos: gs.length };
  };
  base.sucursales.forEach((s) => {
    [-3, -2, -1].forEach((k) => {
      const mes = mesRelativo(mesHoy, k);
      if (k === -1 && s.id === "S7") return; // pendiente de cerrar
      const cerradoEn = `${mesRelativo(mes, 1)}-0${k === -1 ? 3 : 5}T13:00`;
      if (cerradoEn.slice(0, 10) > ref) return;
      const c = { id: id("CI"), sucursalId: s.id, mes, estado: "cerrado", cerradoEn, cerradoPor: dir, snapshot: foto(s.id, mes), advertencias: [], historial: [{ accion: "cerrado", por: dir, en: cerradoEn, motivo: "" }] };
      if (k === -1 && s.id === "S6") {
        const en = sumarDias(cerradoEn, 1) > ref ? ref : sumarDias(cerradoEn, 1);
        c.estado = "reabierto"; c.reabiertoEn = `${en}T10:00`; c.reabiertoPor = dir; c.motivoReapertura = "Factura de mantenimiento del mes capturada tarde por el proveedor";
        c.historial.push({ accion: "reabierto", por: dir, en: c.reabiertoEn, motivo: c.motivoReapertura });
      }
      tes.cierres.push(c);
    });
  });

  return { tes };
}
