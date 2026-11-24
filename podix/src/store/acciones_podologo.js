// Lógica del rol podólogo: consulta (borrador y cierre), CIE-10, exploración, órdenes de laboratorio,
// productividad y recetas. Todo son funciones sobre el estado (o su copia dentro de mutar()) para poder probarlas.
// Las acciones validan u.rol === "podologo" y que el registro sea del propio podólogo.
import * as R from "./reglas.js";
import { auditar, uid, folio } from "./core.js";
import { encuestaAlCerrarCita } from "./acciones_desempeno.js";
import { hoy, dia, ahoraLocal, sumarDias, diasEntre, normaliza, redondear } from "../lib/format.js";

// ───────── Constantes de negocio (visibles en pantalla)
export const COMISION_PCT = 10;            // SUPUESTO: pendiente PA-V5 (base, % por rol y momento de generación)
export const ANTICIPO_LAB_PCT = 50;        // anticipo requerido de ortesis/plantillas (decisión del requerimiento 04)
export const DIAS_PROMETIDA = 14;
export const MAX_FOTOS = 6;
export const PRECIO_ORTESIS = {
  "Plantilla confort": 450,
  "Plantilla termoformada diabético": 780,
  "Ortesis de silicona": 650,
  "Plantilla a medida": 900,
};
export const PIES = ["Derecho", "Izquierdo", "Ambos"];
export const TOMAS = ["Escáner 3D", "Huella", "Molde"];
export const FRECUENCIAS = { "cada semana": 7, "cada 2 semanas": 14, "cada mes": 30 };

const esPodologo = (u) => !!u && u.rol === "podologo";
const num = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// ───────── CIE-10 (subconjunto de podología; PA-C4 abierta: catálogo completo o subconjunto)
export const CIE10 = [
  ["B35.1", "Tiña de las uñas", "onicomicosis hongos uña"],
  ["L60.0", "Uña encarnada", "onicocriptosis encarnada"],
  ["L84", "Callosidades y callos", "callo helomas hiperqueratosis durezas"],
  ["B07", "Verrugas virales", "verruga plantar papiloma"],
  ["E11.5", "Pie diabético", "diabetes complicaciones circulatorias periféricas pie diabetico"],
  ["E11.4", "Neuropatía diabética", "diabetes neurológicas neuropatia"],
  ["M72.2", "Fascitis plantar", "talalgia dolor talón"],
  ["M77.3", "Espolón calcáneo", "espolon talón calcaneo"],
  ["B35.3", "Tiña del pie (pie de atleta)", "tinea pedis hongos interdigital"],
  ["L60.1", "Onicólisis", "desprendimiento uña"],
  ["L60.2", "Onicogrifosis", "uña engrosada garra"],
  ["L60.3", "Distrofia ungueal", "uña deformada"],
  ["L60.8", "Otras alteraciones de las uñas", "uña"],
  ["L97", "Úlcera de miembro inferior", "ulcera herida pie"],
  ["L03.0", "Celulitis de dedos del pie", "infección absceso"],
  ["L74.5", "Hiperhidrosis plantar", "sudoración pies"],
  ["M20.1", "Hallux valgus (juanete)", "juanete"],
  ["M20.4", "Dedos en martillo", "dedo garra martillo"],
  ["M21.4", "Pie plano", "plano arco caído"],
  ["M21.6", "Pie cavo y otras deformidades", "cavo arco alto"],
  ["M79.67", "Dolor en pie", "dolor pie metatarsalgia"],
  ["G57.6", "Neuroma de Morton", "neuroma metatarsal"],
  ["I73.9", "Enfermedad vascular periférica", "insuficiencia arterial circulación"],
  ["Z00.0", "Valoración podológica general", "valoración revisión chequeo"],
].map(([codigo, desc, tags]) => ({ codigo, desc, tags, etiqueta: `${codigo} ${desc}` }));

export function buscarCie10(q = "", max = 8) {
  const n = normaliza(q).trim();
  if (!n) return CIE10.slice(0, max);
  const partes = n.split(/\s+/);
  return CIE10.filter((c) => { const t = normaliza(`${c.codigo} ${c.desc} ${c.tags}`); return partes.every((p) => t.includes(p)); }).slice(0, max);
}
/** "B35.1 Tiña de las uñas" → {codigo, etiqueta}. Acepta el formato de texto libre del seed. */
export function cie10De(texto) {
  if (!texto) return null;
  const m = CIE10.find((c) => c.etiqueta === texto || texto.startsWith(c.codigo + " "));
  return m || { codigo: String(texto).split(" ")[0], desc: String(texto), etiqueta: String(texto) };
}

// ───────── Alertas clínicas y exploración
export function alertasClinicas(paciente) {
  const lista = (paciente?.alertas || []).map((t) => {
    const x = normaliza(t);
    if (x.includes("anticoag")) return { texto: t, tono: "bad", detalle: "Riesgo de sangrado: hemostasia y cuidado con corte" };
    if (x.includes("alergia")) return { texto: t, tono: "bad", detalle: "Verificar materiales y fármacos antes de usar" };
    if (x.includes("diabet")) return { texto: t, tono: "warn", detalle: "Tamizaje de pie diabético y cuidado de heridas" };
    if (x.includes("neuropat")) return { texto: t, tono: "warn", detalle: "Sensibilidad disminuida: cuidado con calor y corte" };
    return { texto: t, tono: "warn", detalle: "" };
  });
  return lista.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "bad" ? -1 : 1));
}
export const esDiabetico = (paciente, diagnostico = "") =>
  (paciente?.alertas || []).some((a) => normaliza(a).includes("diabet")) || /^E1[0-4]/.test(String(diagnostico || ""));

export const OPC_MONOFILAMENTO = ["Sensibilidad conservada", "Sensibilidad disminuida (der.)", "Sensibilidad disminuida (izq.)", "Sensibilidad disminuida (ambos)", "Sensibilidad ausente"];
export const OPC_PULSOS = ["Presentes", "Disminuidos", "Ausentes", "Disminuidos (der.)", "Disminuidos (izq.)"];
export const OPC_CLASIFICACION = ["Wagner 0", "Wagner 1", "Wagner 2", "Wagner 3", "Wagner 4", "Wagner 5", "Texas 0-A", "Texas 1-A", "Texas 1-B", "Texas 2-A", "Texas 3-A", "Texas 3-D"];

/** Valida la exploración. errores bloquean el paso; avisos solo informan. */
export function validarExploracion(ex = {}, { diabetico = false } = {}) {
  const errores = {}, avisos = [];
  const rango = (campo, v, min, max, msg) => { const n = num(v); if (n === null) return null; if (Number.isNaN(n) || n < min || n > max) { errores[campo] = msg; return null; } return n; };
  rango("peso", ex.peso, 1, 400, "Peso entre 1 y 400 kg");
  rango("talla", ex.talla, 0.4, 2.6, "Talla en metros, por ejemplo 1.60");
  const g = rango("glucosa", ex.glucosa, 20, 800, "Glucosa entre 20 y 800 mg/dL");
  if (g != null && g < 70) avisos.push("Glucosa baja (< 70 mg/dL): descartar hipoglucemia antes del procedimiento.");
  if (g != null && g > 250) avisos.push("Glucosa alta (> 250 mg/dL): valorar posponer procedimientos invasivos.");
  if (ex.presion) {
    const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(ex.presion);
    if (!m) errores.presion = "Formato sistólica/diastólica, por ejemplo 120/80";
    else {
      const s = Number(m[1]), di = Number(m[2]);
      if (s < 60 || s > 260 || di < 30 || di > 160 || di >= s) errores.presion = "Valores fuera de rango";
      else if (s >= 180 || di >= 110) avisos.push("Presión muy alta (≥ 180/110): valorar referencia antes de procedimientos.");
    }
  }
  const itb = rango("itb", ex.itb, 0.2, 1.8, "Índice tobillo-brazo entre 0.2 y 1.8");
  if (itb != null && itb < 0.9) avisos.push("ITB < 0.9: posible enfermedad arterial periférica.");
  if (itb != null && itb > 1.3) avisos.push("ITB > 1.3: arterias poco compresibles; interpretar con cautela.");
  if (diabetico) {
    if (!ex.monofilamento) avisos.push("Paciente diabético: falta monofilamento.");
    if (!ex.clasificacion) avisos.push("Paciente diabético: falta clasificación Wagner/Texas.");
    if (num(ex.glucosa) == null) avisos.push("Paciente diabético: falta glucosa capilar.");
  }
  return { ok: Object.keys(errores).length === 0, errores, avisos };
}

// ───────── Consumo prellenado desde los servicios
export function prellenarConsumo(d, servicios) {
  const m = new Map();
  (servicios || []).forEach((s) => {
    const sv = d.servicios.find((x) => x.id === s.servicioId);
    (sv?.consumo || []).forEach((c) => m.set(c.productoId, (m.get(c.productoId) || 0) + c.cant * (s.cant || 1)));
  });
  return [...m].map(([productoId, cant]) => ({ productoId, cant }));
}
export const importeServicios = (d, sucursalId, servicios) =>
  redondear((servicios || []).reduce((a, s) => a + R.precioFinal(d, sucursalId, "servicio", s.servicioId) * (s.cant || 1), 0));

// ───────── Plan de tratamiento
export const planActivo = (d, pacienteId) => (d.planesTratamiento || []).find((p) => p.pacienteId === pacienteId && p.estado === "activo") || null;
export const textoSesion = (plan) => (plan ? `${Math.min(plan.sesionActual + 1, plan.sesionesTotal)}/${plan.sesionesTotal}` : "1/1");
export function planEnRiesgo(plan, ref = hoy()) {
  if (!plan || plan.estado !== "activo" || !plan.ultimaSesion) return false;
  const cada = FRECUENCIAS[plan.frecuencia] || 14;
  return diasEntre(plan.ultimaSesion, ref) > cada * 1.5;
}
/** Planes de demostración derivados de las consultas generadas (solo si aún no existe la colección). */
export function asegurarPlanesDemo(d) {
  if (d.planesTratamiento) return false;
  d.planesTratamiento = [];
  d.usuarios.filter((u) => u.rol === "podologo").forEach((u) => {
    const mias = d.consultas.filter((c) => c.podologoId === u.id && ["cerrada", "cobrada"].includes(c.estado));
    const porPac = new Map();
    mias.forEach((c) => porPac.set(c.pacienteId, [...(porPac.get(c.pacienteId) || []), c]));
    [...porPac.values()].sort((a, b) => b.length - a.length).slice(0, 3).forEach((cs, i) => {
      cs.sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ult = cs[cs.length - 1];
      const total = [6, 4, 8][i];
      d.planesTratamiento.push({
        id: uid("PT"), pacienteId: ult.pacienteId, podologoId: u.id, descripcion: `Seguimiento: ${ult.diagnostico}`,
        sesionesTotal: total, frecuencia: i === 1 ? "cada semana" : "cada 2 semanas", sesionActual: Math.min(cs.length + i, total - 1),
        ultimaSesion: dia(ult.fecha), estado: "activo", creado: dia(cs[0].fecha),
      });
    });
  });
  return true;
}

// ───────── Consulta: abrir, borrador, cerrar, adenda
export function consultaDeCita(d, citaId) { return d.consultas.find((c) => c.citaId === citaId) || null; }
export const consultaAbierta = (d, u) => d.consultas.find((c) => c.estado === "abierta" && c.podologoId === u.id) || null;

export function abrirConsulta(d, citaId, u) {
  if (!esPodologo(u)) throw new Error("Solo un podólogo puede abrir una consulta.");
  const cita = d.citas.find((c) => c.id === citaId);
  if (!cita) throw new Error("La cita no existe.");
  if (cita.podologoId !== u.id) throw new Error("La cita es de otro podólogo.");
  const ya = consultaDeCita(d, citaId);
  if (ya) return ya;
  if (["cancelada", "no_asistio", "bloqueo"].includes(cita.estado)) throw new Error("La cita no está activa.");
  const plan = planActivo(d, cita.pacienteId);
  const servicios = [{ servicioId: cita.servicioId, cant: 1 }];
  const co = {
    id: uid("CO"), citaId: cita.id, pacienteId: cita.pacienteId, podologoId: u.id, sucursalId: cita.sucursalId, fecha: ahoraLocal(),
    estado: "abierta", paso: 0, exploracion: {}, diagnostico: "", diagnosticos: [], plan: plan ? { descripcion: plan.descripcion, sesionesTotal: plan.sesionesTotal, frecuencia: plan.frecuencia } : { descripcion: "", sesionesTotal: 1, frecuencia: "cada 2 semanas" },
    nota: "", indicaciones: "", referencia: "", servicios, consumo: prellenarConsumo(d, servicios), consumoEditado: false, fotos: [], adendas: [],
    sesion: textoSesion(plan), faltantes: [],
  };
  d.consultas.push(co);
  if (!["atendida"].includes(cita.estado)) cita.estado = "en_atencion";
  auditar(d, "abrir_consulta", "consulta", co.id, `Cita ${cita.id}`);
  return co;
}

const CAMPOS_BORRADOR = ["paso", "exploracion", "diagnostico", "diagnosticos", "plan", "nota", "indicaciones", "referencia", "servicios", "consumo", "consumoEditado", "fotos"];
export function guardarBorrador(d, consultaId, patch, u) {
  const co = d.consultas.find((c) => c.id === consultaId);
  if (!esPodologo(u) || !co || co.podologoId !== u.id || co.estado !== "abierta") return false;
  CAMPOS_BORRADOR.forEach((k) => { if (k in patch) co[k] = patch[k]; });
  if (patch.fotos && patch.fotos.length > MAX_FOTOS) co.fotos = patch.fotos.slice(0, MAX_FOTOS);
  return true;
}

/** Errores que impiden cerrar la consulta (lista de textos). */
export function erroresCierre(d, co) {
  const e = [];
  const pac = d.pacientes.find((p) => p.id === co.pacienteId);
  if (!co.diagnostico) e.push("Falta el diagnóstico CIE-10.");
  if (!(co.servicios || []).some((s) => s.cant > 0)) e.push("Registra al menos un procedimiento realizado.");
  if (!String(co.nota || "").trim()) e.push("Falta la nota de evolución.");
  const v = validarExploracion(co.exploracion, { diabetico: esDiabetico(pac, co.diagnostico) });
  if (!v.ok) e.push("Hay valores fuera de rango en la exploración.");
  return e;
}

export function cerrarConsulta(d, consultaId, u) {
  if (!esPodologo(u)) return { ok: false, errores: ["Solo un podólogo puede cerrar una consulta."], faltantes: [] };
  const co = d.consultas.find((c) => c.id === consultaId);
  if (!co || co.podologoId !== u.id) return { ok: false, errores: ["La consulta no es tuya."], faltantes: [] };
  if (co.estado !== "abierta") return { ok: false, errores: ["La consulta ya está cerrada."], faltantes: [] };
  const errores = erroresCierre(d, co);
  if (errores.length) return { ok: false, errores, faltantes: [] };

  // Insumos: descuenta del almacén de la sucursal; si falta stock no bloquea, deja el faltante registrado
  const faltantes = [], descontados = [];
  (co.consumo || []).filter((c) => c.cant > 0).forEach((c) => {
    const disp = R.stock(d, co.sucursalId, c.productoId);
    const toma = Math.min(disp, c.cant);
    let costo = 0;
    if (toma > 0) { const r = R.salidaPEPS(d, co.sucursalId, c.productoId, toma); costo = r.costo; descontados.push({ productoId: c.productoId, cant: toma, costo }); }
    if (toma < c.cant) faltantes.push({ productoId: c.productoId, cant: c.cant - toma });
  });
  co.insumosDescontados = descontados;
  co.faltantes = faltantes;
  co.costoInsumos = redondear(descontados.reduce((a, x) => a + x.costo, 0));

  // Plan de tratamiento: avanza la sesión o crea el plan si son varias sesiones
  const pl = planActivo(d, co.pacienteId);
  const datosPlan = co.plan || {};
  if (pl) {
    pl.sesionActual = Math.min(pl.sesionesTotal, pl.sesionActual + 1);
    pl.ultimaSesion = hoy();
    if (datosPlan.sesionesTotal >= pl.sesionActual) { pl.sesionesTotal = datosPlan.sesionesTotal; }
    if (datosPlan.frecuencia) pl.frecuencia = datosPlan.frecuencia;
    if (datosPlan.descripcion) pl.descripcion = datosPlan.descripcion;
    co.sesion = `${pl.sesionActual}/${pl.sesionesTotal}`;
    if (pl.sesionActual >= pl.sesionesTotal) pl.estado = "completado";
  } else if (datosPlan.sesionesTotal > 1) {
    (d.planesTratamiento ||= []).push({ id: uid("PT"), pacienteId: co.pacienteId, podologoId: u.id, descripcion: datosPlan.descripcion || co.diagnostico, sesionesTotal: datosPlan.sesionesTotal, frecuencia: datosPlan.frecuencia || "cada 2 semanas", sesionActual: 1, ultimaSesion: hoy(), estado: "activo", creado: hoy() });
    co.sesion = `1/${datosPlan.sesionesTotal}`;
  } else co.sesion = "1/1";

  co.estado = "cerrada"; co.cerrada = ahoraLocal(); co.paso = 4;
  const cita = d.citas.find((c) => c.id === co.citaId);
  if (cita) { cita.estado = "atendida"; encuestaAlCerrarCita(d, cita.id); } // encuesta de satisfacción pendiente de envío
  auditar(d, "cerrar_consulta", "consulta", co.id, faltantes.length ? `Faltantes de insumo: ${faltantes.length}` : "Enviada a caja");
  return { ok: true, errores: [], faltantes };
}

/** PA-C1 (abierta): una consulta cerrada no se edita; solo adenda con fecha y autor. */
export function agregarAdenda(d, consultaId, texto, u) {
  if (!esPodologo(u)) return { ok: false, error: "Solo un podólogo puede agregar adendas." };
  const co = d.consultas.find((c) => c.id === consultaId);
  if (!co || co.estado === "abierta") return { ok: false, error: "La consulta sigue abierta: edítala directamente." };
  const t = String(texto || "").trim();
  if (t.length < 5) return { ok: false, error: "Escribe la adenda (mínimo 5 caracteres)." };
  (co.adendas ||= []).push({ id: uid("AD"), fecha: ahoraLocal(), autorId: u.id, autor: u.nombre, texto: t });
  auditar(d, "adenda_consulta", "consulta", co.id, t.slice(0, 60));
  return { ok: true };
}

/** Bitácora de accesos al expediente (LFPDPPP / NOM-004). */
export function registrarAccesoExpediente(d, pacienteId, detalle = "") {
  auditar(d, "consulta_expediente", "paciente", pacienteId, detalle);
}

export const fotoAgregable = (co) => (co.fotos || []).length < MAX_FOTOS;

// ───────── Órdenes de laboratorio
export const ESTADOS_ORDEN = { prescrita: "Prescrita", enviada: "Enviada", retrasada: "Retrasada", recibida: "Recibida", en_prueba: "En prueba", entregada: "Entregada", retrabajo: "Retrabajo" };
export const TONO_ORDEN = { prescrita: "neutral", enviada: "info", retrasada: "bad", recibida: "ok", en_prueba: "warn", entregada: "ok", retrabajo: "warn" };
/** Una orden enviada cuya fecha prometida ya pasó está retrasada aunque nadie haya cambiado el estado. */
export function estadoOrden(o, ref = hoy()) {
  if (["enviada", "prescrita", "retrabajo"].includes(o.estado) && o.prometida && o.prometida < ref) return "retrasada";
  return o.estado;
}
export function ordenarOrdenes(lista, ref = hoy()) {
  const peso = (o) => (estadoOrden(o, ref) === "retrasada" ? 0 : ["entregada"].includes(o.estado) ? 2 : 1);
  return [...lista].sort((a, b) => peso(a) - peso(b) || String(a.prometida).localeCompare(String(b.prometida)));
}
export const anticipoDe = (tipo, pct = ANTICIPO_LAB_PCT) => redondear((PRECIO_ORTESIS[tipo] || 0) * pct / 100);

export function validarOrden(d, x, ref = hoy()) {
  const e = {};
  if (!d.pacientes.find((p) => p.id === x.pacienteId)) e.pacienteId = "Elige al paciente";
  if (!PRECIO_ORTESIS[x.tipo]) e.tipo = "Elige el tipo";
  if (!PIES.includes(x.pie)) e.pie = "Elige el pie";
  const t = num(x.talla);
  if (t == null || Number.isNaN(t) || t < 15 || t > 34) e.talla = "Talla MX entre 15 y 34";
  if (!TOMAS.includes(x.toma)) e.toma = "Elige el método de toma";
  if (!d.laboratorios.find((l) => l.id === x.laboratorioId)) e.laboratorioId = "Elige el laboratorio";
  if (!x.prometida || x.prometida < ref) e.prometida = "La fecha prometida debe ser hoy o posterior";
  return e;
}
export function crearOrdenLab(d, x, u, sucursalId) {
  if (!esPodologo(u)) return { ok: false, errores: { _: "Solo un podólogo puede prescribir." } };
  const errores = validarOrden(d, x);
  if (Object.keys(errores).length) return { ok: false, errores };
  const anticipo = anticipoDe(x.tipo);
  const o = {
    id: uid("LB"), folio: folio(d, "LAB"), pacienteId: x.pacienteId, podologoId: u.id, sucursalId, tipo: x.tipo, pie: x.pie, talla: String(num(x.talla)),
    toma: x.toma, correcciones: x.correcciones || "", laboratorioId: x.laboratorioId, enviada: hoy(), prometida: x.prometida, estado: "enviada",
    costoLab: 0, anticipoPct: ANTICIPO_LAB_PCT, anticipoPendiente: anticipo, anticipoPagado: 0, precio: PRECIO_ORTESIS[x.tipo],
  };
  d.ordenesLab.unshift(o);
  auditar(d, "prescribir_ortesis", "orden_lab", o.id, `${o.folio} · ${o.tipo}`);
  return { ok: true, orden: o };
}
export function marcarRetrabajo(d, ordenId, u) {
  const o = d.ordenesLab.find((x) => x.id === ordenId);
  if (!esPodologo(u) || !o || o.podologoId !== u.id) return false;
  if (!["recibida", "en_prueba"].includes(o.estado)) return false;
  o.estado = "retrabajo"; o.retrabajos = (o.retrabajos || 0) + 1; o.prometida = sumarDias(hoy(), DIAS_PROMETIDA);
  auditar(d, "retrabajo_ortesis", "orden_lab", o.id, o.folio);
  return true;
}

// ───────── Productividad y comisión
export const comisionEstimada = (ingreso, pct = COMISION_PCT) => redondear((Number(ingreso) || 0) * pct / 100);
export function rangoPeriodo(periodo, ref = hoy()) {
  return { desde: sumarDias(ref, periodo === "semana" ? -6 : -29), hasta: ref };
}
/** Consultas atendidas e ingreso (ventas con vendedorId = el podólogo) en un rango, por sucursal. */
export function productividad(d, podologoId, { desde, hasta, sucursalId = null }) {
  const enRango = (f) => { const x = dia(f); return x >= desde && x <= hasta; };
  const cons = d.consultas.filter((c) => c.podologoId === podologoId && ["cerrada", "cobrada"].includes(c.estado) && enRango(c.fecha) && (!sucursalId || c.sucursalId === sucursalId));
  const ventas = d.ventas.filter((v) => v.vendedorId === podologoId && v.estado !== "cancelada" && enRango(v.fecha) && (!sucursalId || v.sucursalId === sucursalId));
  const por = {};
  cons.forEach((c) => { (por[c.sucursalId] ||= { sucursalId: c.sucursalId, consultas: 0, ingreso: 0 }).consultas++; });
  ventas.forEach((v) => { (por[v.sucursalId] ||= { sucursalId: v.sucursalId, consultas: 0, ingreso: 0 }).ingreso += v.total; });
  const ingreso = redondear(ventas.reduce((a, v) => a + v.total, 0));
  return {
    consultas: cons.length, ventas: ventas.length, ingreso, ticket: ventas.length ? redondear(ingreso / ventas.length) : 0,
    comision: comisionEstimada(ingreso), porSucursal: Object.values(por).map((x) => ({ ...x, ingreso: redondear(x.ingreso) })).sort((a, b) => b.ingreso - a.ingreso),
  };
}
export function resumenPlanes(d, podologoId, ref = hoy()) {
  const mios = (d.planesTratamiento || []).filter((p) => p.podologoId === podologoId);
  const hechas = mios.reduce((a, p) => a + p.sesionActual, 0), total = mios.reduce((a, p) => a + p.sesionesTotal, 0);
  return {
    planes: mios, activos: mios.filter((p) => p.estado === "activo").length, completados: mios.filter((p) => p.estado === "completado").length,
    enRiesgo: mios.filter((p) => planEnRiesgo(p, ref)).length, avancePct: total ? Math.round((hechas / total) * 100) : 0,
  };
}

// ───────── Recetas
/** Alérgenos del paciente a partir de sus alertas: "Alergia: látex" → "latex". */
export function alergenos(paciente) {
  return (paciente?.alertas || []).filter((a) => normaliza(a).includes("alergi")).map((a) => normaliza(a).replace(/^.*alergi[a-z]*\s*(a|al|a la|a los|a las|:)?\s*:?\s*/, "").trim()).filter(Boolean);
}
/** Devuelve el alérgeno que coincide con el texto de la receta, o null. */
export function coincideAlergia(paciente, texto) {
  const t = normaliza(texto);
  if (!t.trim()) return null;
  for (const a of alergenos(paciente)) {
    const claves = a.split(/[\s,y/]+/).filter((p) => p.length >= 4);
    if (t.includes(a) || claves.some((k) => t.includes(k) || (k.length >= 6 && t.includes(k.slice(0, 5))))) return a;
  }
  return null;
}
export function crearReceta(d, x, u, sucursalId) {
  if (!esPodologo(u)) return { ok: false, error: "Solo un podólogo emite recetas." };
  const pac = d.pacientes.find((p) => p.id === x.pacienteId);
  if (!pac) return { ok: false, error: "Elige al paciente." };
  if (!String(x.medicamento || "").trim()) return { ok: false, error: "Escribe el medicamento o indicación." };
  if (!String(x.dosis || "").trim()) return { ok: false, error: "Escribe la dosis." };
  if (!String(x.duracion || "").trim()) return { ok: false, error: "Escribe la duración." };
  const alerg = coincideAlergia(pac, `${x.medicamento} ${x.indicaciones || ""}`);
  const r = { id: uid("RX"), folio: folio(d, "RX"), pacienteId: pac.id, podologoId: u.id, sucursalId, fecha: ahoraLocal(), medicamento: x.medicamento.trim(), dosis: x.dosis.trim(), duracion: x.duracion.trim(), indicaciones: (x.indicaciones || "").trim(), alergiaAviso: alerg };
  (d.recetas ||= []).unshift(r);
  auditar(d, "emitir_receta", "paciente", pac.id, `${r.folio} · ${r.medicamento}${alerg ? " · EMITIDA CON AVISO DE ALERGIA" : ""}`);
  return { ok: true, receta: r };
}
export function textoReceta(d, r) {
  const pac = d.pacientes.find((p) => p.id === r.pacienteId), u = d.usuarios.find((x) => x.id === r.podologoId), s = d.sucursales.find((x) => x.id === r.sucursalId);
  return [`Receta ${r.folio}`, `Paciente: ${pac ? `${pac.nombres} ${pac.apellidos}` : "—"}`, `Fecha: ${dia(r.fecha)}`, `Medicamento/indicación: ${r.medicamento}`, `Dosis: ${r.dosis}`, `Duración: ${r.duracion}`,
    r.indicaciones ? `Indicaciones: ${r.indicaciones}` : null, `${u ? u.nombre : ""}${s ? " · Sucursal " + s.nombre : ""}`].filter(Boolean).join("\n");
}
export function urlWhatsApp(telefono, texto) {
  let dg = String(telefono || "").replace(/\D/g, "");
  if (dg.length === 10) dg = "52" + dg;
  return `https://wa.me/${dg}?text=${encodeURIComponent(texto)}`;
}
