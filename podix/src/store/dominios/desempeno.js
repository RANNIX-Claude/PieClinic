// Dominio «desempeño»: semilla de bonos y metas (d.bonos) y de evaluación de clientes (d.eval). Todo ficticio y determinista
// (usa su propio generador: no consume números de util.r, así no mueve la semilla de los demás dominios).
//   d.bonos = { esquemas, metas, propuestas, pagados, hist }
//   d.eval  = [{ id, citaId, pacienteId, sucursalId, podologoId, fecha, califServicio, califPodologo, califSucursal, comentario, estado, canal, enviadaEn, enlace, seguimiento }]
// Además completa el mes en curso con ventas ficticias (servicios de podólogos y venta de mostrador de cajeros y recepción), para que los
// bonos y metas se vean con datos (en la semilla original solo hay servicios de los últimos 6 días y vendían solo los podólogos).
import { sumarMeses, mesActual, diasDelMes, sugerirMeta, resumenPeriodo, periodoDe } from "../desempeno_motor.js";
import { precioFinal } from "../reglas.js";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n) => String(n).padStart(2, "0");

/** Parámetros de DEMOSTRACIÓN: todos están «por validar con el cliente». */
export function esquemasDemo() {
  const nota = "Parámetros de demostración, por validar con el cliente.";
  const base = { activo: true, porValidar: true, nota, creadoPor: null, actualizado: null };
  return [
    { ...base, id: "BE1", nombre: "Podólogos · individual mensual", tipo: "individual", periodo: "mensual", base: "ventas", roles: ["podologo"],
      escalones: [{ desde: 40000, tipo: "pct", valor: 1.5 }, { desde: 70000, tipo: "pct", valor: 2.5 }, { desde: 100000, tipo: "pct", valor: 3.5 }], tope: 4500,
      condiciones: { asistenciaMin: 90, califMin: 4 } },
    { ...base, id: "BE2", nombre: "Mostrador · individual mensual por venta de producto", tipo: "individual", periodo: "mensual", base: "producto", roles: ["cajero", "recepcion"],
      escalones: [{ desde: 10000, tipo: "pct", valor: 1.5 }, { desde: 20000, tipo: "pct", valor: 2.5 }, { desde: 30000, tipo: "pct", valor: 3.5 }], tope: 3000,
      condiciones: { asistenciaMin: 90, califMin: null } },
    { ...base, id: "BE3", nombre: "Sucursal · mensual por cumplimiento de meta", tipo: "sucursal", periodo: "mensual", base: "cumplimiento", roles: ["podologo", "cajero", "recepcion", "asistente"],
      escalones: [{ desde: 95, tipo: "monto", valor: 1500 }, { desde: 100, tipo: "monto", valor: 3000 }, { desde: 110, tipo: "monto", valor: 5000 }], tope: 5000,
      condiciones: { asistenciaMin: 85, califMin: null } },
    { ...base, id: "BE4", nombre: "Sucursal · trimestral por cumplimiento", tipo: "sucursal", periodo: "trimestral", base: "cumplimiento", roles: ["podologo", "cajero", "recepcion", "asistente", "gerente"],
      escalones: [{ desde: 100, tipo: "pct", valor: 0.5 }, { desde: 105, tipo: "pct", valor: 0.8 }, { desde: 115, tipo: "pct", valor: 1.2 }], tope: 15000,
      condiciones: { asistenciaMin: 85, califMin: null } },
  ];
}

// Tendencia de cada sucursal frente a su meta: <1 = la meta queda por debajo de lo vendido (casi siempre cumple), >1 = por encima.
const TEND_META = [0.92, 1.0, 1.12, 0.97, 1.08, 0.90, 1.03];
// Ritmo del mes en curso de cada sucursal frente a su histórico (para las ventas generadas del mes).
const RITMO_ACTUAL = [1.06, 0.98, 0.86, 1.0, 0.91, 1.1, 0.97];

const alloc = (total, pesos) => {
  const s = pesos.reduce((a, b) => a + b, 0) || 1;
  let acum = 0;
  return pesos.map((w, i) => {
    if (i === pesos.length - 1) return total - acum;
    const x = Math.round((total * w) / s); acum += x; return x;
  });
};

function sembrarMetas(base, rnd) {
  const act = mesActual(), metas = [];
  base.sucursales.forEach((s, i) => {
    for (let k = 12; k >= 1; k--) {
      const mes = sumarMeses(act, -k);
      const h = base.hist.find((x) => x.sucursalId === s.id && x.mes === mes);
      const real = h ? h.servicios + h.plantillas + h.productos : 0;
      metas.push({ sucursalId: s.id, mes, meta: Math.max(1000, Math.round((real * TEND_META[i] * (0.97 + rnd() * 0.06)) / 1000) * 1000), origen: "sembrada", por: null, fecha: null });
    }
    [0, 1].forEach((k) => {
      const mes = sumarMeses(act, k), sg = sugerirMeta(base, s.id, mes);
      metas.push({ sucursalId: s.id, mes, meta: sg.ok ? sg.sugerida : 250000, origen: "sugerida", por: null, fecha: null });
    });
  });
  return metas;
}

/** Filas históricas por persona y mes (resumen de ventas atribuidas), coherentes con d.hist de cada sucursal y mes. */
function sembrarHist(base, rnd) {
  const peso = new Map();
  base.usuarios.forEach((u) => peso.set(u.id, 0.75 + rnd() * 0.6));
  const rows = [];
  base.hist.forEach((h) => {
    const act = base.usuarios.filter((u) => u.activo !== false && u.sucursales.includes(h.sucursalId));
    const pods = act.filter((u) => u.rol === "podologo"), most = act.filter((u) => ["cajero", "recepcion"].includes(u.rol));
    if (!pods.length) return;
    const prodTot = h.plantillas + h.productos;
    const prodPods = most.length ? Math.round(prodTot * 0.3) : prodTot;
    const pcRatio = (h.plantillas + 0.35 * h.productos) / Math.max(1, prodTot);
    const ruido = () => 0.9 + rnd() * 0.2;
    const serv = alloc(h.servicios, pods.map((u) => peso.get(u.id) * ruido()));
    const prodP = alloc(prodPods, pods.map((u) => peso.get(u.id) * ruido()));
    const prodM = most.length ? alloc(prodTot - prodPods, most.map((u) => peso.get(u.id) * ruido())) : [];
    const dm = diasDelMes(h.mes);
    const fila = (u, servicios, producto, esPod) => {
      const ventas = servicios + producto;
      rows.push({ usuarioId: u.id, sucursalId: h.sucursalId, mes: h.mes, ventas, producto, plantillasCalzado: Math.round(producto * pcRatio), nVentas: Math.max(1, Math.round(ventas / (470 + rnd() * 120))),
        dias: Math.min(dm, esPod ? 8 + Math.floor(rnd() * 6) : 15 + Math.floor(rnd() * 7)) });
    };
    pods.forEach((u, i) => fila(u, serv[i], prodP[i], true));
    most.forEach((u, i) => fila(u, 0, prodM[i], false));
  });
  return rows;
}

const esDomingo = (act, dd) => new Date(Number(act.slice(0, 4)), Number(act.slice(5)) - 1, dd).getDay() === 0;

/**
 * Completa el mes en curso con ventas hasta ayer, para que el mes no arranque en cero: la semilla original solo trae servicios de los
 * últimos 6 días y ninguna venta de mostrador. Se generan (1) servicios de cada podólogo en los días anteriores a esa ventana y
 * (2) ventas de producto de mostrador de cajeros y recepción, con un volumen cercano al histórico de cada sucursal (ritmo propio por sucursal).
 * Son ventas ficticias de demostración (no mueven inventario). Devuelve las ventas nuevas.
 */
function ventasDelMes(base, util, rnd) {
  const act = mesActual(), diaHoy = new Date().getDate();
  const out = [];
  if (diaHoy <= 1) return out;
  const catalogo = base.productos.filter((p) => p.tipo === "venta");
  const vivo = base.ventas.filter((v) => v.fecha.slice(0, 7) === act).map((v) => Number(v.fecha.slice(8, 10)));
  const desdeVivo = vivo.length ? Math.min(...vivo) : diaHoy;
  const venta = (suc, cajero, vendedor, dd, partidas) => {
    const total = Math.round(partidas.reduce((a, x) => a + x.importe, 0) * 100) / 100;
    const h = 9 + Math.floor(rnd() * 10), min = Math.floor(rnd() * 60);
    const forma = rnd() < 0.5 ? "tarjeta" : rnd() < 0.7 ? "efectivo" : "transferencia";
    out.push({ id: util.id("VE"), folio: util.folio("T"), sucursalId: suc, cajeroId: cajero.id, vendedorId: vendedor ? vendedor.id : null, pacienteId: base.pacientes[Math.floor(rnd() * base.pacientes.length)].id, consultaId: null,
      tipo: "contado", fecha: `${act}-${pad(dd)}T${pad(h)}:${pad(min)}`, partidas, subtotal: total, descuento: 0, total, pagos: [{ forma, monto: total }], estado: "pagada", facturar: false, turnoId: "hist" });
  };
  const partidaProducto = (suc, pr, cant) => { const precio = precioFinal(base, suc, "producto", pr.id); return { tipo: "producto", itemId: pr.id, nombre: pr.nombre, cant, precioLista: pr.precioBase, ajustePct: 0, precio, importe: Math.round(precio * cant * 100) / 100, costo: pr.costo }; };
  const cajeroDe = (suc) => base.usuarios.filter((u) => u.rol === "cajero" && u.sucursales.includes(suc));
  // (1) servicios de los podólogos antes de la ventana con datos
  base.usuarios.filter((u) => u.rol === "podologo").forEach((p) => {
    for (let dd = 1; dd < desdeVivo && dd < diaHoy; dd++) {
      if (esDomingo(act, dd)) continue;
      const suc = p.sucursales[dd % p.sucursales.length], i = Number(suc.slice(1)) - 1, cj = cajeroDe(suc);
      if (!cj.length) continue;
      const n = Math.round((3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0)) * RITMO_ACTUAL[i]);
      for (let k = 0; k < n; k++) {
        const sv = base.servicios[Math.floor(Math.pow(rnd(), 1.4) * base.servicios.length)];
        const partidas = [{ tipo: "servicio", itemId: sv.id, nombre: sv.nombre, cant: 1, precioLista: sv.precioBase, ajustePct: 0, precio: precioFinal(base, suc, "servicio", sv.id), importe: precioFinal(base, suc, "servicio", sv.id) }];
        if (rnd() < 0.3) partidas.push(partidaProducto(suc, catalogo[Math.floor(rnd() * catalogo.length)], 1));
        venta(suc, cj[Math.floor(rnd() * cj.length)], p, dd, partidas);
      }
    }
  });
  // (2) mostrador: producto vendido por cajeros y recepción (≈ 70 % de producto y plantillas del último mes cerrado, por ritmo)
  base.sucursales.forEach((s, i) => {
    const cajeros = cajeroDe(s.id), recep = base.usuarios.filter((u) => u.rol === "recepcion" && u.sucursales.includes(s.id));
    if (!cajeros.length) return;
    const ult = base.hist.filter((h) => h.sucursalId === s.id).sort((a, b) => b.mes.localeCompare(a.mes))[0];
    const diario = ult ? ((ult.plantillas + ult.productos) * 0.7) / 26 : 2500;
    for (let dd = 1; dd < diaHoy; dd++) {
      if (esDomingo(act, dd)) continue;
      const meta = diario * RITMO_ACTUAL[i] * (0.8 + rnd() * 0.4);
      let tot = 0;
      while (tot < meta) {
        const pr = catalogo[Math.floor(Math.pow(rnd(), 1.6) * catalogo.length)];
        const par = partidaProducto(s.id, pr, pr.precioBase < 200 ? 1 + Math.floor(rnd() * 3) : 1);
        venta(s.id, cajeros[Math.floor(rnd() * cajeros.length)], recep.length && rnd() < 0.35 ? recep[Math.floor(rnd() * recep.length)] : null, dd, [par]);
        tot += par.importe;
      }
    }
  });
  return out;
}

const COMENT_BUENOS = ["Muy buena atención, salí sin dolor.", "Excelente trato, explicó todo el procedimiento.", "Puntuales y muy limpios. Regresaré.", "Me atendieron rápido y con mucha amabilidad.",
  "La doctora fue muy paciente conmigo.", "Instalaciones impecables.", "Me sentí en confianza desde que llegué.", "Muy profesional, recomendado.", "Todo bien, gracias por el seguimiento.", "El mejor servicio de podología que he tenido."];
const COMENT_REGULARES = ["Todo bien, pero esperé unos 15 minutos.", "Buen servicio; el estacionamiento es complicado.", "La atención fue buena, aunque el cobro tardó.", "Bien, pero me gustaría más opciones de horario."];
const COMENT_MALOS = ["Esperé más de 40 minutos aunque tenía cita.", "Me dolió bastante y no me avisaron antes del procedimiento.", "En recepción no sabían de mi cita y tuve que repetir mis datos.",
  "El consultorio estaba frío y el trato fue seco.", "Me cobraron algo que no me habían dicho en la cotización.", "No me explicaron los cuidados en casa y tuve molestias después.", "Cancelaron mi cita sin avisarme y llegué para nada."];

function sembrarEval(base, rnd) {
  const atendidas = base.citas.filter((c) => c.estado === "atendida").sort((a, b) => b.inicio.localeCompare(a.inicio));
  const podIds = base.usuarios.filter((u) => u.rol === "podologo").map((u) => u.id);
  const sesgos = [0.5, 0.2, 0, 0.3, -0.1, 0.4, -0.5, 0.1, 0.25, -0.2, 0.35, 0, -0.35, 0.15];
  const sesgoPod = new Map(podIds.map((id, i) => [id, sesgos[i % sesgos.length]]));
  const sesgoSuc = [0.15, 0, -0.25, 0.1, -0.1, 0.25, 0];
  // Las tres calificaciones de una misma visita se parecen (comparten el «ánimo» del paciente).
  const score = (x) => (x > 0.5 ? 5 : x > 0.17 ? 4 : x > 0.07 ? 3 : x > -0.04 ? 2 : 1);
  const evals = [], usadas = new Set();
  const nResp = Math.min(120, Math.floor(atendidas.length * 0.65)); // ~100-120 respuestas sin importar la hora del día
  const idx = atendidas.map((_, i) => i).sort(() => rnd() - 0.5).slice(0, nResp).sort((a, b) => a - b);
  idx.forEach((i) => {
    const c = atendidas[i]; usadas.add(c.id);
    const si = Number(c.sucursalId.slice(1)) - 1, sp = sesgoPod.get(c.podologoId) || 0;
    const animo = rnd();
    const a = score(animo + (sp * 0.4 + sesgoSuc[si]) * 0.35 + (rnd() - 0.5) * 0.25), b = score(animo + sp * 0.35 + (rnd() - 0.5) * 0.25), s = score(animo + (sesgoSuc[si] + sp * 0.2) * 0.35 + (rnd() - 0.5) * 0.25);
    const minimo = Math.min(a, b, s), prom = (a + b + s) / 3;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const comentario = minimo <= 2 ? pick(COMENT_MALOS) : prom >= 4.3 ? (rnd() < 0.6 ? pick(COMENT_BUENOS) : "") : prom >= 3.4 ? (rnd() < 0.7 ? pick(COMENT_REGULARES) : "") : COMENT_REGULARES[0];
    const fin = new Date(c.inicio.replace("T", " ").replace(/-/g, "/")); fin.setMinutes(fin.getMinutes() + (c.duracion || 30) + 20 + Math.floor(rnd() * 600));
    const fecha = `${fin.getFullYear()}-${pad(fin.getMonth() + 1)}-${pad(fin.getDate())}T${pad(fin.getHours())}:${pad(fin.getMinutes())}`;
    const id = `EV${evals.length + 1}`;
    const ev = {
      id, citaId: c.id, pacienteId: c.pacienteId, sucursalId: c.sucursalId, podologoId: c.podologoId, fecha, califServicio: a, califPodologo: b, califSucursal: s, comentario,
      estado: "respondida", canal: rnd() < 0.7 ? "whatsapp" : "correo", enviadaEn: c.inicio, enlace: `https://clinicas.example/encuesta/${id.toLowerCase()}-${c.id.toLowerCase()}`, seguimiento: null,
    };
    if (minimo <= 2) {
      const r = rnd();
      const recep = base.usuarios.find((u) => u.rol === "recepcion" && u.sucursales.includes(c.sucursalId));
      const ger = base.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(c.sucursalId));
      ev.seguimiento = r < 0.35 ? { estado: "nuevo", nota: "", por: null, fecha: null }
        : r < 0.65 ? { estado: "contactado", nota: "Se llamó al paciente; se ofreció reposición del servicio.", por: recep ? recep.id : null, fecha }
          : { estado: "resuelto", nota: "Se atendió la queja y el paciente aceptó una cita de cortesía.", por: ger ? ger.id : null, fecha };
    }
    evals.push(ev);
  });
  // Encuestas pendientes: citas atendidas recientes sin respuesta (algunas ya enviadas, otras por enviar).
  atendidas.filter((c) => !usadas.has(c.id)).slice(0, 26).forEach((c, k) => {
    const id = `EV${evals.length + 1}`;
    evals.push({ id, citaId: c.id, pacienteId: c.pacienteId, sucursalId: c.sucursalId, podologoId: c.podologoId, fecha: c.inicio, califServicio: null, califPodologo: null, califSucursal: null, comentario: "",
      estado: "pendiente", canal: k % 4 === 3 ? null : k % 3 === 0 ? "correo" : "whatsapp", enviadaEn: k % 4 === 3 ? null : c.inicio, enlace: `https://clinicas.example/encuesta/${id.toLowerCase()}-${c.id.toLowerCase()}`, seguimiento: null });
  });
  return evals;
}

export function seed(base, util) {
  const rnd = mulberry32(20261121);
  const act = mesActual();
  const esquemas = esquemasDemo();
  const metas = sembrarMetas(base, rnd);
  const nuevas = ventasDelMes(base, util, rnd);
  const hist = sembrarHist(base, rnd);
  const admin = base.usuarios.find((u) => u.rol === "admin");

  // Libro de bonos: meses y trimestres cerrados hasta hace 2 meses ya están pagados; el último mes cerrado queda «calculado» para aprobarse.
  const tmp = { ...base, ventas: [...base.ventas, ...nuevas], bonos: { esquemas, metas, propuestas: [], pagados: [], hist }, eval: [] };
  const pagados = [];
  const ultimoPagable = sumarMeses(act, -2), primero = sumarMeses(act, -12);
  const registrar = (it, per) => {
    const fin = per.meses[per.meses.length - 1];
    const pag = `${sumarMeses(fin, 1)}-05`;
    const comun = { id: util.id("BP"), esquemaId: it.esquemaId, periodoClave: per.clave, tipo: it.tipo, estado: "pagado", aprobadoPor: admin ? admin.id : null, aprobadoEn: `${sumarMeses(fin, 1)}-02T10:00`, pagadoPor: admin ? admin.id : null, pagadoEn: `${pag}T12:00` };
    if (it.tipo === "individual") { if (it.bono > 0) pagados.push({ ...comun, usuarioId: it.usuarioId, sucursalId: null, base: it.base, bono: it.bono }); }
    else if (it.bolsa > 0) pagados.push({ ...comun, usuarioId: null, sucursalId: it.sucursalId, base: it.base, bono: it.bolsa, reparto: it.reparto.map((x) => ({ usuarioId: x.usuarioId, dias: x.dias, monto: x.monto })) });
  };
  for (let m = primero; m <= ultimoPagable; m = sumarMeses(m, 1)) {
    const r = resumenPeriodo(tmp, { mes: m, periodo: "mensual" });
    [...r.individuales, ...r.sucursales].forEach((it) => registrar(it, periodoDe("mensual", m)));
    if (Number(m.slice(5)) % 3 === 0 && sumarMeses(m, -2) >= primero) {
      const rt = resumenPeriodo(tmp, { mes: m, periodo: "trimestral" });
      [...rt.individuales, ...rt.sucursales].forEach((it) => registrar(it, periodoDe("trimestral", m)));
    }
  }
  return {
    ventas: tmp.ventas,
    bonos: { esquemas, metas, propuestas: [], pagados, hist },
    eval: sembrarEval(base, rnd),
  };
}
