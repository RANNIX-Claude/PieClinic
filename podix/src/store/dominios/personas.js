// Dominio «personas»: semilla de demostración de RH, checador, nómina, capacitación y acervo. TODO es ficticio.
// seed(base, util) → { rh, cap }. Sin Math.random(): usa util.r. No importa acciones_personas.js (evita ciclos con core.js):
// las reglas puras viven en ../reglas_personas.js.
import { aMin, deMin, diasLaborables, rangoPeriodo, calcularNomina, esPersonalNuevo, aplicaCurso, sucursalHoy, ausenciaDe, DEFAULTS_RH } from "../reglas_personas.js";
import { parse, sumarDias } from "../../lib/format.js";

const PUESTO = { direccion: "Dirección general", admin: "Administración central", almacen: "Encargado de almacén", gerente: "Gerente de sucursal", cajero: "Cajero(a)", recepcion: "Recepcionista", asistente: "Asistente clínico", podologo: "Podólogo(a)" };
// Sueldo mensual bruto de referencia (MXN) por rol: [mín, máx]. Realista para una clínica en México; las finanzas lo calibran.
const SUELDO = { direccion: [62000, 70000], admin: [38000, 44000], almacen: [10000, 13000], gerente: [20000, 24000], cajero: [9000, 12000], recepcion: [9000, 12000], asistente: [9500, 13000], podologo: [16000, 22000] };
const HORARIO = { direccion: ["09:00", "18:00"], admin: ["09:00", "18:00"], gerente: ["08:30", "18:00"], almacen: ["09:00", "18:00"], recepcion: ["09:00", "18:00"], asistente: ["08:30", "17:30"], podologo: ["09:00", "18:00"] };
const sinAcc = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const p2 = (n) => String(n).padStart(2, "0");

export function seed(base, util) {
  const { r, int, pick, F, nom } = util;
  const ahora = new Date();
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const hoyS = F(0);
  const users = base.usuarios;
  const quita = (s) => s.replace(/\s*\(.*\)\s*$/, "").trim();
  const redondea = (n, m = 100) => Math.round(n / m) * m;

  // ───────── Empleados: uno por cada usuario de base.usuarios
  const cajeros = users.filter((u) => u.rol === "cajero");
  const nuevos = new Map([[cajeros[cajeros.length - 1].id, -12], [users.filter((u) => u.rol === "recepcion").slice(-1)[0].id, -5]]); // personal de ingreso reciente
  const reingId = users.filter((u) => u.rol === "recepcion")[2].id; // persona que se fue y regresó
  const empleados = [];
  let nE = 0;
  users.forEach((u) => {
    const nombre = quita(u.nombre);
    const mujer = /^(Dra\.|Ana|María|Laura|Patricia|Lucía|Gabriela|Elena|Rosa|Carmen|Silvia|Paula|Diana|Sofía)/.test(nombre.replace(/^Dr\.\s*/, ""));
    const base1 = u.almacenCentral ? "CEN" : ["direccion", "admin"].includes(u.rol) ? "S1" : u.sucursales[0];
    const sucursales = u.almacenCentral ? ["CEN"] : u.sucursales;
    const rango = SUELDO[u.rol];
    const fechaAl = (a, b) => `${int(a, b)}-${p2(int(1, 12))}-${p2(int(1, 28))}`;
    let ingreso;
    if (nuevos.has(u.id)) ingreso = F(nuevos.get(u.id));
    else if (u.id === reingId) ingreso = F(-560);
    else if (u.rol === "direccion") ingreso = "2019-02-04";
    else if (u.rol === "admin") ingreso = "2019-06-17";
    else if (u.rol === "gerente") ingreso = fechaAl(2019, 2021);
    else ingreso = fechaAl(2019, 2026);
    if (ingreso > F(-20) && !nuevos.has(u.id)) ingreso = F(-int(60, 400)); // solo los marcados son de ingreso reciente
    const ant = Math.max(0, (parse(hoyS) - parse(ingreso)) / 86400000 / 365);
    let sueldo = rango[0] + (rango[1] - rango[0]) * (Math.min(1, ant / 6) * 0.75 + r() * 0.25);
    sueldo = u.almacenCentral ? 14000 : u.rol === "direccion" || u.rol === "admin" ? redondea(sueldo, 500) : redondea(sueldo, 100);
    const partes = nombre.replace(/^(Dr\.|Dra\.)\s*/, "").split(/\s+/);
    const nomb = partes[0], ap1 = partes[1] || "X", ap2 = partes[2] || "X";
    const nac = fechaAl(1972, 2003);
    const vocal = (sinAcc(ap1).slice(1).match(/[AEIOU]/i) || ["X"])[0].toUpperCase();
    const curp = `${sinAcc(ap1)[0]}${vocal}${sinAcc(ap2)[0]}${sinAcc(nomb)[0]}`.toUpperCase() + nac.slice(2).replace(/-/g, "") + (mujer ? "M" : "H") + "DFXYZ" + int(0, 9) + int(0, 9);
    const rfc = curp.slice(0, 10) + pick(["A1", "B7", "K3", "Q9", "M5"]) + int(0, 9);
    const hr = u.rol === "cajero" ? (cajeros.indexOf(u) % 2 ? ["13:00", "21:00"] : ["08:00", "16:00"]) : HORARIO[u.rol];
    const esNuevo = nuevos.has(u.id);
    const requeridos = ["acta", "curp", "rfc", "nss", "domicilio", "ine", "contrato", ...(u.rol === "podologo" ? ["cedula"] : [])];
    const prob = esNuevo ? 0.35 : r() < 0.2 ? 0.55 : 0.97;
    const expediente = {};
    requeridos.forEach((k) => { if (r() < prob) expediente[k] = { ok: true, fecha: ingreso }; });
    empleados.push({
      id: `E${++nE}`, usuarioId: u.id, nombre, rol: u.rol, puesto: PUESTO[u.rol] + (u.almacenCentral ? " central" : ""), sucursalBase: base1, sucursales,
      sueldoMensual: sueldo, ingreso, estado: "activo", foto: null,
      sexo: mujer ? "F" : "M", nacimiento: nac, telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}`, correo: u.correo,
      domicilio: `Calle ${int(1, 60)} #${int(1, 300)}, Col. ${pick(["Narvarte", "Doctores", "Del Valle", "Portales", "Lindavista", "Santa María la Ribera", "Escandón", "Roma Sur"])}, CDMX`,
      curp, rfc, nss: `${int(10, 99)}${int(10, 99)}${int(10, 99)}${int(1000, 9999)}${int(0, 9)}`,
      emergencia: { nombre: nom(r() > 0.5), parentesco: pick(["Madre", "Padre", "Pareja", "Hermano(a)", "Hijo(a)"]), telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}` },
      contrato: { tipo: esNuevo ? "A prueba (30 días)" : "Indeterminado", inicio: ingreso, fin: esNuevo ? sumarDias(ingreso, 30) : null, firmado: !!expediente.contrato },
      horario: { entrada: hr[0], salida: hr[1] }, expediente, ficticio: true,
    });
  });
  const reing = empleados.find((e) => e.usuarioId === reingId);
  reing.ingresoOriginal = "2020-03-09";
  const emp = (usuarioId) => empleados.find((e) => e.usuarioId === usuarioId);

  // ───────── Asignaciones (programación semanal; null = descanso) y excepciones por fecha según las citas reales del podólogo
  const asignaciones = [];
  let nA = 0;
  empleados.forEach((e, i) => {
    const central = ["direccion", "admin", "gerente"].includes(e.rol) || e.sucursalBase === "CEN";
    const descanso = central ? 0 : [0, 0, 0, 1, 2, 3, 4, 5][i % 8];
    let k = 0;
    for (let dow = 0; dow < 7; dow++) {
      if (dow === descanso) { asignaciones.push({ id: `AS${++nA}`, empleadoId: e.id, dow, sucursalId: null }); continue; }
      asignaciones.push({ id: `AS${++nA}`, empleadoId: e.id, dow, sucursalId: e.sucursales.length === 2 ? e.sucursales[k++ % 2] : e.sucursalBase });
    }
  });
  const porPod = new Map();
  base.citas.filter((c) => !["cancelada", "no_asistio"].includes(c.estado)).forEach((c) => {
    const k = `${c.podologoId}|${c.inicio.slice(0, 10)}`;
    const m = porPod.get(k) || {}; m[c.sucursalId] = (m[c.sucursalId] || 0) + 1; porPod.set(k, m);
  });
  porPod.forEach((m, k) => {
    const [uid, fecha] = k.split("|"); const e = emp(uid); if (!e) return;
    asignaciones.push({ id: `AS${++nA}`, empleadoId: e.id, fecha, sucursalId: Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] });
  });

  const rh = { empleados, asistencia: [], asignaciones, incidencias: [], vacaciones: [], movimientos: [], recibos: [], params: { ...DEFAULTS_RH, inicioControl: F(-14) } };
  const D = { rh }; // las reglas puras leen d.rh
  const gerenteDe = (suc) => users.find((u) => u.rol === "gerente" && u.sucursales.includes(suc));
  const admin = users.find((u) => u.rol === "admin");

  // ───────── Vacaciones
  let nV = 0;
  const vac = (e, desde, dur, estado, extra = {}) => {
    let hasta = desde, n = 0;
    for (let f = desde, t = 0; n < dur && t < 40; f = sumarDias(f, 1), t++) { if (diasLaborables(D, e.id, f, f)) { n++; hasta = f; } }
    const ger = gerenteDe(e.sucursalBase) || admin;
    rh.vacaciones.push({ id: `V${++nV}`, empleadoId: e.id, desde, hasta, dias: diasLaborables(D, e.id, desde, hasta), estado, usuarioId: e.usuarioId, sucursalId: e.sucursalBase, solicitadoEn: sumarDias(desde, -int(8, 30)), resueltoPor: estado === "solicitada" ? null : ger.id, resueltoEn: estado === "solicitada" ? null : sumarDias(desde, -int(3, 7)), motivo: extra.motivo || "", nota: extra.nota || "" });
  };
  const veteranos = empleados.filter((e) => e.rol !== "direccion" && e.ingreso < F(-400));
  veteranos.forEach((e, i) => {
    if (i % 6 === 0) vac(e, F(-int(40, 150)), int(3, 6), "aprobada", { nota: "Descanso programado" });
    if (i % 17 === 1) vac(e, F(-int(40, 120)), 4, "aprobada");
  });
  [3, 11, 19, 27].forEach((i) => { const e = veteranos[i]; if (e) vac(e, F(-2), 5, "aprobada", { nota: "Vacaciones de fin de año adelantadas" }); });          // en vacaciones hoy
  [5, 9, 14, 22, 30].forEach((i) => { const e = veteranos[i]; if (e) vac(e, F(int(8, 40)), int(3, 5), "solicitada", { nota: "Viaje familiar" }); });  // por aprobar
  [7, 25].forEach((i) => { const e = veteranos[i]; if (e) vac(e, F(int(5, 12)), 5, "rechazada", { motivo: "Coincide con inventario general", nota: "Solicitud en temporada alta" }); });

  // ───────── Incidencias
  let nI = 0;
  const inc = (e, tipo, desde, hasta, detalle, estado = "aprobada") => {
    const ger = gerenteDe(e.sucursalBase) || admin;
    rh.incidencias.push({ id: `IN${++nI}`, empleadoId: e.id, tipo, desde, hasta: hasta || desde, detalle, estado, usuarioId: estado === "solicitada" ? e.usuarioId : ger.id, sucursalId: e.sucursalBase, ts: `${sumarDias(desde, -1)}T10:00` });
  };
  const activos = empleados.filter((e) => e.ingreso < F(-30));
  [2, 9, 21, 33, 40].forEach((i) => { const e = activos[i]; if (e) inc(e, "incapacidad", F(-int(6, 11)), null, "Incapacidad IMSS por infección respiratoria"); });
  inc(activos[14], "incapacidad", F(-1), F(2), "Incapacidad IMSS: esguince de tobillo");
  [4, 12, 26, 37].forEach((i) => { const e = activos[i]; if (e) inc(e, "permiso", F(-int(3, 12)), null, pick(["Trámite en el SAT", "Cita médica familiar", "Junta escolar de su hijo(a)"])); });
  [6, 18].forEach((i) => { const e = activos[i]; if (e) inc(e, "permiso", F(int(2, 9)), null, "Trámite de pasaporte", "solicitada"); });
  [8, 30].forEach((i) => { const e = activos[i]; if (e) inc(e, "falta_justificada", F(-int(2, 9)), null, "Falla en transporte público con constancia"); });
  [10, 23, 35].forEach((i) => { const e = activos[i]; if (e) inc(e, "llamada", F(-int(10, 60)), null, "Llamada de atención verbal por retardos recurrentes", "registrada"); });
  inc(activos[28], "acta", F(-45), null, "Acta administrativa: diferencia de caja no justificada", "registrada");
  inc(activos[16], "otro", F(-20), null, "Cambio de turno solicitado por motivos escolares", "rechazada");

  // ───────── Asistencia de los últimos 14 días y de hoy (según la hora actual)
  let nS = 0;
  const reg = (e, fecha, suc, entrada, salida, estado, minutosTarde = 0) =>
    rh.asistencia.push({ id: `AT${++nS}`, empleadoId: e.id, fecha, sucursalId: suc, entrada, salida, estado, minutosTarde, usuarioId: e.usuarioId });
  empleados.forEach((e) => {
    for (let o = -14; o <= 0; o++) {
      const f = F(o);
      if (f < e.ingreso) continue;
      const suc = sucursalHoy(D, e.id, f);
      if (suc == null) continue;
      const aus = ausenciaDe(D, e.id, f);
      if (aus) { if (aus.estado !== "permiso") reg(e, f, suc, null, null, aus.estado); continue; } // permiso / falta justificada: sin marca
      const ent0 = aMin(e.horario.entrada), sal0 = aMin(e.horario.salida);
      if (o < 0) {
        const x = r();
        if (x < 0.022) { reg(e, f, suc, null, null, "falta"); continue; }
        const tarde = x < 0.09 ? int(11, 38) : -int(0, 12);
        reg(e, f, suc, deMin(ent0 + tarde), deMin(sal0 + int(-4, 22)), tarde > 10 ? "retardo" : "normal", Math.max(0, tarde));
      } else {
        if (minAhora < ent0 - 5) continue;
        const x = r();
        if (x < 0.1 && minAhora > ent0 + 20) continue;        // aún sin registrar entrada hoy
        const tarde = x < 0.18 ? int(11, 30) : -int(0, 12);
        const salio = minAhora >= sal0 + 5;
        reg(e, f, suc, deMin(Math.min(ent0 + tarde, minAhora)), salio ? deMin(sal0 + int(-3, 15)) : null, tarde > 10 ? "retardo" : "normal", Math.max(0, tarde));
      }
    }
  });

  // ───────── Movimientos (alta, cambios, bajas y reingreso). Los avisos IMSS solo se MARCAN: no hay envío real.
  let nM = 0;
  const mov = (e, fecha, tipo, detalle, extra = {}) => rh.movimientos.push({ id: `MV${++nM}`, empleadoId: e.id, fecha, tipo, detalle, motivo: extra.motivo || "", finiquito: extra.finiquito || null,
    imss: extra.imss || { estado: fecha >= F(-60) ? "pendiente_envio" : "historico", aviso: tipo === "alta" || tipo === "reingreso" ? "Alta" : tipo === "baja" ? "Baja" : "Modificación de salario" }, usuarioId: admin.id, sucursalId: "S1" });
  const nombreSuc1 = (id) => (base.sucursales.find((s) => s.id === id) || { nombre: "Almacén central" }).nombre;
  empleados.forEach((e, i) => {
    if (e === reing) {
      mov(e, "2020-03-09", "alta", `Alta como ${e.puesto}`, { imss: { estado: "historico", aviso: "Alta" } });
      mov(e, "2024-03-15", "baja", "Baja: renuncia voluntaria", { motivo: "Renuncia voluntaria", finiquito: { estado: "pagado", total: 6240, nota: "Histórico de demostración" }, imss: { estado: "historico", aviso: "Baja" } });
      mov(e, e.ingreso, "reingreso", `Reingreso a ${nombreSuc1(e.sucursalBase)}`, { motivo: "Recontratación por oferta de la clínica" });
    } else mov(e, e.ingreso, "alta", `Alta como ${e.puesto} en ${nombreSuc1(e.sucursalBase)}`);
    if (i % 4 === 2 && e.ingreso < F(-300) && e.rol !== "direccion") {
      const fe = sumarDias(e.ingreso, int(200, 280)); const antes = redondea(e.sueldoMensual * 0.92, 100);
      mov(e, fe < F(-5) ? fe : F(-40), "cambio", `Aumento de sueldo mensual de $${antes.toLocaleString("es-MX")} a $${e.sueldoMensual.toLocaleString("es-MX")}`);
    }
  });
  [["Mario Escobar Lara", "cajero", "S3", "Renuncia voluntaria", -75], ["Verónica Salgado Pineda", "asistente", "S5", "Término de contrato a prueba", -52],
    ["Gustavo Ibarra Núñez", "recepcion", "S2", "Renuncia voluntaria", -190], ["Dra. Ximena Aguirre Soto", "podologo", "S1", "Cambio de ciudad", -140],
    ["Ernesto Rosales Vega", "almacen", "S4", "Baja por abandono de empleo", -33]].forEach(([nombre, rol, suc, motivo, off], i) => {
    const ing = `${int(2020, 2024)}-0${int(1, 9)}-1${int(0, 9)}`;
    const e = { id: `E${++nE}`, usuarioId: null, nombre, rol, puesto: PUESTO[rol], sucursalBase: suc, sucursales: [suc], sueldoMensual: redondea((SUELDO[rol][0] + SUELDO[rol][1]) / 2, 100), ingreso: ing, estado: "baja", bajaFecha: F(off), bajaMotivo: motivo, foto: null, sexo: "M", nacimiento: `1990-05-1${i}`, telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}`, correo: "", domicilio: "—", curp: "", rfc: "", nss: "", emergencia: { nombre: "", parentesco: "", telefono: "" }, contrato: { tipo: "Indeterminado", inicio: ing, fin: null, firmado: true }, horario: { entrada: "09:00", salida: "18:00" }, expediente: {}, ficticio: true };
    empleados.push(e);
    const sd = e.sueldoMensual / 30;
    mov(e, ing, "alta", `Alta como ${e.puesto}`, { imss: { estado: "historico", aviso: "Alta" } });
    mov(e, F(off), "baja", `Baja: ${motivo}`, { motivo, finiquito: { estado: off < -60 ? "pagado" : "por_pagar", total: Math.round(sd * int(2, 9) * 1.25 + sd * 6), nota: "Estimación de demostración; por validar con contador" } });
  });
  rh.movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ───────── Recibos del periodo anterior (demostración: no hay timbrado CFDI)
  const hd = parse(hoyS), pm = new Date(hd.getFullYear(), hd.getMonth() - 1, 1);
  const prev = hd.getDate() <= 15 ? { mes: `${pm.getFullYear()}-${p2(pm.getMonth() + 1)}`, q: 2 } : { mes: hoyS.slice(0, 7), q: 1 };
  const per = rangoPeriodo("quincenal", prev.mes, prev.q);
  let nR = 0;
  empleados.filter((e) => e.estado === "activo" && e.ingreso <= per.hasta).forEach((e) => {
    const c = calcularNomina(D, e, per, hoyS);
    const folio = `RN-${String(++nR).padStart(4, "0")}`;
    rh.recibos.push({ id: folio, folio, empleadoId: e.id, sucursalId: e.sucursalBase, periodo: per, ...c, firmado: r() < 0.75, generado: sumarDias(per.hasta, 1), usuarioId: admin.id, sucursalGen: "S1" });
  });
  base.contadores.RN = nR;

  // ═════════ CAPACITACIÓN Y ACERVO (borradores por validar con la clínica)
  const U = (rol) => users.find((u) => u.rol === rol);
  const gerentes = users.filter((u) => u.rol === "gerente");
  const L = (n, titulo, minutos, o = {}) => ({ id: `L${n}`, titulo, minutos, video: !!o.video, youtube: null, texto: o.texto || "", pasos: (o.pasos || []).map((t) => ({ t, foto: null })), checklist: o.checklist || [], docTitulo: "", docUrl: null });
  const Q = (p, opciones, correcta) => ({ p, opciones, correcta });
  const TODOS = ["recepcion", "podologo", "asistente", "cajero", "almacen", "gerente", "admin", "direccion"];
  const cursos = [
    { id: "C1", titulo: "Bienvenida y cultura", categoria: "Cultura", resumen: "Quiénes somos, cómo tratamos a las personas y cómo es un día en la sucursal. Primer curso de la ruta de bienvenida.", asignado: { roles: TODOS, personas: [], nuevos: true }, ruta: 1,
      lecciones: [
        L(1, "Quiénes somos", 6, { video: true, texto: "Somos una cadena de 7 sucursales de podología. Atendemos pies sanos y pies con riesgo (especialmente pacientes diabéticos y adultos mayores) y también vendemos plantillas, calzado, bastones y andaderas.\n\nNuestra promesa: que cada persona salga caminando mejor y con la sensación de haber sido tratada con respeto. Un mismo expediente clínico sirve en cualquier sucursal y se puede pagar en cualquiera." }),
        L(2, "Cómo tratamos a las personas", 5, { texto: "El trato es parte del servicio. Muchos pacientes son adultos mayores: hablamos despacio, con claridad y sin prisa.", checklist: ["Saludo con nombre en los primeros 10 segundos", "Ofrecer asiento y agua", "Explicar lo que se va a hacer antes de hacerlo", "Nunca discutir con un paciente: pedir apoyo al gerente", "Despedida con indicaciones y siguiente cita"] }),
        L(3, "Un día en la sucursal", 7, { pasos: ["Apertura: encender equipos, revisar agenda del día, abrir caja con fondo", "Confirmación de citas por WhatsApp o llamada", "Atención: recepción registra llegada, el asistente prepara, el podólogo atiende", "Cobro en caja y entrega de indicaciones", "Esterilización y bitácoras durante el día", "Cierre: corte de caja, limpieza, resguardo de instrumental"] }),
        L(4, "Tu primera semana", 4, { checklist: ["Conocer a tu gerente y a tu equipo", "Entrar al sistema y registrar tu entrada (Mi entrada y salida)", "Completar los cursos marcados como obligatorios", "Entregar los documentos de tu expediente", "Acompañar a un compañero con experiencia dos días"] }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("¿Qué hacemos primero al recibir a un paciente?", ["Pedir el pago", "Saludarlo por su nombre", "Mandarlo a esperar sin decir nada"], 1), Q("Si un paciente se molesta, ¿qué haces?", ["Discutir hasta aclarar", "Ignorarlo", "Escuchar con calma y pedir apoyo al gerente"], 2), Q("¿Dónde se puede pagar o consultar el expediente de un paciente?", ["Solo en la sucursal donde se dio de alta", "En cualquier sucursal", "Solo en el almacén central"], 1)] } },
    { id: "C2", titulo: "Atención al paciente", categoria: "Atención", resumen: "Recibir, identificar y acompañar al paciente en recepción, llamadas y WhatsApp, con énfasis en adultos mayores.", asignado: { roles: ["recepcion", "cajero", "asistente"], personas: [], nuevos: true }, ruta: 3,
      lecciones: [
        L(1, "Recibir e identificar al paciente", 6, { texto: "Pregunta nombre completo y fecha de nacimiento y búscalo en Pacientes antes de crear uno nuevo: el expediente es único para toda la cadena. Si es nuevo, captura datos de contacto, alertas médicas (diabetes, anticoagulantes, alergias) y recaba aviso de privacidad y consentimiento firmados.", checklist: ["Buscar antes de crear", "Verificar alertas médicas", "Aviso de privacidad firmado", "Contacto de emergencia capturado"] }),
        L(2, "Llamadas y WhatsApp", 5, { pasos: ["Contesta antes del cuarto timbre con saludo de la sucursal", "Pregunta el motivo y ofrece el primer horario disponible", "Confirma servicio, fecha, hora y sucursal repitiéndolo", "Envía recordatorio por WhatsApp un día antes", "Si cancela, ofrece reagendar en ese momento"] }),
        L(3, "Atención a adultos mayores", 5, { texto: "Ofrece el brazo en escalones, habla de frente y despacio, confirma que entendió las indicaciones y entrégalas por escrito con letra grande. Si viene acompañado, incluye a la persona acompañante en la explicación." }),
        L(4, "Manejo de quejas", 6, { video: true, texto: "Escucha sin interrumpir, agradece que lo comente, ofrece una solución concreta y registra la queja. Los reembolsos o cortesías los autoriza el gerente." }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("Antes de crear un paciente nuevo debes…", ["Crearlo de inmediato", "Buscarlo por nombre y fecha de nacimiento", "Preguntar al podólogo"], 1), Q("¿Quién autoriza un reembolso o cortesía?", ["El gerente", "Cualquier cajero", "El paciente"], 0), Q("¿Cuándo se envía el recordatorio de cita?", ["Un día antes", "Una hora después", "No se envía"], 0), Q("Un dato que SIEMPRE debes verificar en un paciente nuevo es…", ["Su color favorito", "Alertas médicas como diabetes o anticoagulantes", "Su signo zodiacal"], 1)] } },
    { id: "C3", titulo: "Quiropodia paso a paso (bioseguridad)", categoria: "Clínico", resumen: "Secuencia de la quiropodia con las medidas de bioseguridad: del consultorio preparado al registro de la consulta.", asignado: { roles: ["podologo", "asistente"], personas: [], nuevos: true }, ruta: 3,
      lecciones: [
        L(1, "Preparar consultorio e instrumental", 8, { video: true, texto: "Antes de cada paciente el consultorio debe estar desinfectado y el instrumental estéril en su empaque cerrado, con indicador químico virado." }),
        L(2, "La quiropodia en 10 pasos", 10, { pasos: ["Valoración inicial: preguntar alergias, diabetes, anticoagulantes y revisar pulsos y sensibilidad", "Lavado de manos y colocación de guantes nuevos", "Antisepsia del pie", "Abrir el instrumental estéril frente al paciente", "Desbridamiento de callosidades con cuchilla desechable", "Corte y limado de uñas", "Tratamiento de zonas específicas (uñeros, hiperqueratosis)", "Hidratación y masaje con crema indicada", "Retiro de residuos en bolsa RPBI cuando aplique", "Registro de la consulta: exploración, procedimiento, indicaciones y cita de seguimiento"] }),
        L(3, "Bioseguridad y RPBI", 6, { checklist: ["Guantes nuevos por paciente", "Cuchillas y fresas desechables al contenedor rojo de punzocortantes", "Material con sangre en bolsa roja RPBI", "Superficies desinfectadas entre pacientes", "Instrumental sucio a esterilización sin tallarlo en seco", "Reportar cualquier piquete o accidente al gerente de inmediato"] }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("¿Qué se hace con una cuchilla desechable usada?", ["Se guarda para reutilizar", "Va al contenedor de punzocortantes", "A la basura común"], 1), Q("Los guantes se cambian…", ["Cada día", "Con cada paciente", "Cuando se rompan"], 1), Q("El instrumental estéril se abre…", ["Al inicio del día", "Frente al paciente", "Cuando el paciente se siente"], 1), Q("Antes de iniciar se pregunta por…", ["Alergias, diabetes y anticoagulantes", "El clima", "El método de pago"], 0), Q("Si hay un piquete accidental…", ["Se ignora", "Se avisa al gerente de inmediato", "Se anota al fin del mes"], 1)] } },
    { id: "C4", titulo: "Esterilización y bitácoras", categoria: "Clínico", resumen: "Ciclo completo de esterilización en autoclave y cómo llenar la bitácora; qué hacer cuando un indicador falla.", asignado: { roles: ["asistente"], personas: [], nuevos: false }, ruta: 0,
      lecciones: [
        L(1, "Del instrumental sucio al estéril", 8, { texto: "Pasos generales; los parámetros exactos de temperatura y tiempo son los del manual del autoclave de cada sucursal.", pasos: ["Retirar residuos gruesos y sumergir en solución limpiadora", "Cepillar y enjuagar; secar completamente", "Empacar en bolsa de autoclave con indicador químico", "Cargar sin amontonar y cerrar el equipo", "Correr el ciclo con los parámetros del manual", "Verificar que el indicador químico viró y anotar el lote", "Dejar enfriar y almacenar seco, con fecha de esterilización y caducidad"] }),
        L(2, "Llenar la bitácora de ciclo", 5, { video: true, pasos: ["Abrir Bitácoras o Esterilización en el sistema", "Registrar autoclave, lote y hora del ciclo", "Capturar resultado del indicador químico", "Programar el indicador biológico y anotar su resultado cuando llegue", "Asignar los sets estériles al ciclo"] }),
        L(3, "Cuando un indicador falla", 4, { texto: "Si el indicador químico no viró o el biológico sale positivo: retira de uso los sets de ese ciclo, repite el proceso, avisa al gerente y deja constancia en la bitácora. Nunca se usa material con indicador dudoso." }),
        L(4, "Bitácoras diarias de consultorio", 4, { checklist: ["Desinfección de superficies por consultorio", "Retiro de RPBI", "Revisión de caducidades de insumos", "Firma de quien realizó la tarea"] }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("Si el indicador químico no viró…", ["Se usa igual", "Se retira el material y se repite el ciclo", "Se anota y se sigue"], 1), Q("Los parámetros del ciclo son los…", ["Que recuerde el asistente", "Del manual del autoclave", "Que diga el paciente"], 1), Q("Un set esterilizado se almacena…", ["Húmedo", "Seco, con fecha de esterilización y caducidad", "En el escritorio"], 1), Q("¿Cuándo se registra el ciclo en bitácora?", ["Cada ciclo", "Una vez por semana", "Solo si falla"], 0)] } },
    { id: "C5", titulo: "Paciente diabético: banderas rojas", categoria: "Clínico", resumen: "Señales de alarma en el pie diabético y qué hace cada persona del equipo al detectarlas.", asignado: { roles: ["podologo", "asistente", "recepcion"], personas: [], nuevos: false }, ruta: 0,
      lecciones: [
        L(1, "Las banderas rojas", 6, { texto: "En un paciente con diabetes cualquiera de estas señales requiere atención prioritaria y criterio del podólogo o médico:", checklist: ["Herida o úlcera que no cierra", "Cambio de color (rojo intenso, morado, negro)", "Calor local o hinchazón nueva", "Mal olor o secreción", "Dolor súbito o, al contrario, pérdida de sensibilidad", "Fiebre acompañada de lesión en el pie"] }),
        L(2, "Exploración básica", 8, { video: true, pasos: ["Revisar piel entre los dedos y planta", "Pulsos pedio y tibial posterior", "Prueba de sensibilidad con monofilamento", "Registrar glucosa si el paciente la trae", "Anotar hallazgos en la consulta y marcar alerta en el expediente"] }),
        L(3, "Qué hago en recepción", 4, { texto: "Si un paciente con diabetes llega o llama con una herida, no lo dejes esperar: avisa de inmediato al podólogo en turno para que decida si pasa antes. Nunca des indicaciones médicas por teléfono; agenda prioritario y comunica el aviso." }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("Una herida que no cierra en un paciente diabético es…", ["Normal", "Una bandera roja", "Un tema estético"], 1), Q("En recepción, si llega con una herida…", ["Espera su turno", "Avisas al podólogo para que decida si pasa antes", "Le indicas un remedio"], 1), Q("La prueba de sensibilidad se hace con…", ["Monofilamento", "Cuchilla", "Termómetro"], 0), Q("Dar indicaciones médicas por teléfono…", ["Está permitido", "No se hace; se agenda prioritario", "Solo si es amigo"], 1)] } },
    { id: "C6", titulo: "Corte de caja paso a paso", categoria: "Caja", resumen: "Cómo cerrar el turno: contar, capturar, justificar diferencias y entregar. Incluye los errores más comunes.", asignado: { roles: ["cajero", "gerente"], personas: [], nuevos: true }, ruta: 3,
      lecciones: [
        L(1, "Video: el corte completo", 9, { video: true, texto: "Grabación del corte de caja real de una sucursal, de principio a fin." }),
        L(2, "El corte en 7 pasos", 8, { pasos: ["Cobra o cancela los tickets abiertos; no debe quedar nada a medias", "Abre Caja ▸ Corte y revisa lo esperado por forma de pago", "Cuenta el efectivo billete por billete, dos veces", "Suma vouchers de tarjeta y comprobantes de transferencia", "Captura lo contado en cada forma de pago", "Si hay diferencia, escribe la justificación en el momento", "Firma de quien entrega y de quien recibe el turno; el gerente aprueba"] }),
        L(3, "Diferencias y reaperturas", 5, { texto: "Una diferencia no justificada se reporta al gerente. Para corregir un corte ya cerrado se solicita una reapertura, que autoriza el gerente: nunca se «acomoda» el dinero para que cuadre.", checklist: ["Contar de nuevo antes de justificar", "Revisar devoluciones y gastos del turno", "Describir la causa con hechos", "Solicitar reapertura si hubo un error de captura"] }),
        L(4, "Errores comunes", 4, { checklist: ["Dejar tickets sin cerrar", "Mezclar el fondo de caja con las ventas", "Contar una sola vez", "Entregar sin firma del que recibe"] }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("Antes del corte, los tickets abiertos deben…", ["Dejarse para mañana", "Cobrarse o cancelarse", "Borrarse"], 1), Q("Si hay una diferencia en el corte…", ["Se justifica en el momento y se avisa al gerente", "Se ajusta sin avisar", "Se pone de tu bolsa sin decir"], 0), Q("El efectivo se cuenta…", ["Una vez", "Dos veces", "No se cuenta"], 1), Q("Para corregir un corte cerrado…", ["Se pide reapertura al gerente", "Se edita directo", "No se puede"], 0), Q("El corte lo firma…", ["Solo quien entrega", "Quien entrega y quien recibe el turno", "Nadie"], 1)] } },
    { id: "C7", titulo: "Cobro, apartados y crédito", categoria: "Caja", resumen: "Reglas vigentes de cobro, apartados, crédito abierto y ventas a plazos con sus autorizaciones.", asignado: { roles: ["cajero", "gerente"], personas: [], nuevos: false }, ruta: 0,
      lecciones: [
        L(1, "Cobrar bien", 5, { texto: "El precio es la lista base más el ajuste porcentual de la sucursal; el sistema lo calcula. Confirma el total con el paciente antes de cobrar y entrega ticket. Los pacientes con convenio tienen su descuento aplicado automáticamente." }),
        L(2, "Apartados", 6, { texto: "Un apartado dura 10 días y requiere un anticipo mínimo del 20 %. Si vence, el anticipo no se devuelve. La prórroga la autoriza el gerente.", checklist: ["Anticipo de al menos el 20 %", "Vigencia de 10 días registrada", "Prórroga solo con autorización del gerente", "Informar al paciente que el anticipo vencido no se devuelve"] }),
        L(3, "Crédito y ventas a plazos", 6, { texto: "El crédito abierto causa interés mensual; la venta a plazos lleva un recargo único. Hay 10 días de gracia. La autorización sube por niveles según el monto: gerente, administración central y dirección." }),
        L(4, "Video: venta a plazos en el sistema", 5, { video: true }),
      ],
      evaluacion: { minimo: 80, preguntas: [Q("¿Cuánto dura un apartado?", ["3 días", "10 días", "30 días"], 1), Q("Anticipo mínimo de un apartado:", ["5 %", "20 %", "50 %"], 1), Q("¿Quién autoriza una prórroga de apartado?", ["El gerente", "El cajero", "El proveedor"], 0), Q("Si el apartado vence…", ["Se devuelve el anticipo", "El anticipo no se devuelve", "Se duplica"], 1), Q("Los montos altos de crédito se autorizan por…", ["Niveles: gerente, administración central y dirección", "El cajero", "No requieren autorización"], 0)] } },
    { id: "C8", titulo: "Inventarios: recibir, traspasos y conteo", categoria: "Inventario", resumen: "Recibir mercancía contra la orden de compra, traspasar entre sucursales y contar el inventario.", asignado: { roles: ["almacen", "gerente"], personas: [], nuevos: true }, ruta: 3,
      lecciones: [
        L(1, "Recibir mercancía", 6, { pasos: ["Verifica que la orden de compra exista y esté enviada", "Cuenta físicamente contra la factura o remisión", "Registra lo recibido por partida; si hay diferencia, captura la cantidad real", "Anota lote y caducidad cuando aplique", "Acomoda en su ubicación; la mercancía entra por capas PEPS (lo primero que entra es lo primero que sale)"] }),
        L(2, "Traspasos entre sucursales", 5, { texto: "Un traspaso pasa por: solicitado → autorizado → en tránsito → recibido. Quien recibe cuenta y, si falta o sobra, lo marca como «recibido con diferencia»." }),
        L(3, "Conteo cíclico y general", 6, { video: true, checklist: ["Congelar movimientos del área a contar", "Contar sin mirar la existencia del sistema", "Recontar las diferencias", "Los ajustes se capturan con motivo y los autoriza el gerente"] }),
        L(4, "Ajustes y mermas", 4, { texto: "Una merma o ajuste siempre lleva motivo (daño, caducidad, robo, error de captura) y autorización; los montos altos suben a administración." }),
      ],
      evaluacion: { minimo: 75, preguntas: [Q("PEPS significa…", ["Primero en entrar, primero en salir", "Precio especial por sucursal", "Producto en preparación"], 0), Q("Si llega menos de lo facturado…", ["Se captura lo realmente recibido", "Se captura lo facturado", "Se rechaza todo"], 0), Q("Un ajuste de inventario requiere…", ["Motivo y autorización", "Nada", "Solo firma del almacenista"], 0), Q("Estados de un traspaso:", ["Solicitado, autorizado, en tránsito, recibido", "Nuevo, viejo", "Abierto y cerrado"], 0)] } },
    { id: "C9", titulo: "Uso del sistema por rol", categoria: "Sistema", resumen: "Cómo entrar, elegir la sucursal donde trabajas hoy, registrar tu entrada y moverte por tu menú.", asignado: { roles: TODOS, personas: [], nuevos: true }, ruta: 2,
      lecciones: [
        L(1, "Entrar y elegir sucursal", 4, { pasos: ["Inicia sesión con tu cuenta; el rol sale de tu cuenta", "Si rotas, elige en cuál sucursal trabajas hoy", "El encabezado siempre dice «Trabajando en: …»; puedes cambiarlo ahí", "Todo lo que hagas queda registrado con tu usuario y esa sucursal"] }),
        L(2, "Mi entrada y salida", 3, { video: true, checklist: ["Registra tu entrada al llegar y tu salida al irte", "Solo se permite una entrada por día", "El retardo se marca después de la tolerancia (10 minutos por omisión)"] }),
        L(3, "Tu menú", 4, { texto: "En el teléfono usas el menú inferior y «Más»; en la computadora ves el menú lateral por secciones. Las pantallas se adaptan a tu rol." }),
        L(4, "Mensajes y comunidad", 3, { texto: "Mensajes y correo internos son para asuntos de trabajo. El feed es para avisos, logros y reconocimientos del equipo." }),
      ],
      evaluacion: { minimo: 70, preguntas: [Q("¿Cuántas entradas puedes registrar por día?", ["Una", "Cinco", "Ninguna"], 0), Q("«Trabajando en: …» indica…", ["La sucursal activa donde quedan tus registros", "Tu casa", "El nombre de tu jefe"], 0), Q("El rol que ves sale de…", ["Tu cuenta", "El ícono que tocas", "Tu elección"], 0)] } },
    { id: "C10", titulo: "Ventas de plantillas y calzado", categoria: "Ventas", resumen: "Cómo orientar y vender plantillas a medida, calzado diabético y ortopédico sin presionar.", asignado: { roles: ["cajero", "recepcion", "gerente"], personas: [], nuevos: false }, ruta: 0,
      lecciones: [
        L(1, "Plantillas a medida: el proceso", 7, { video: true, pasos: ["El podólogo indica la plantilla en la consulta", "Se toma huella o escáner del pie", "Se envía la orden al laboratorio con talla y correcciones", "Se cobra el anticipo (50 % por omisión)", "Entrega aproximada a los 14 días; se avisa por WhatsApp cuando llega", "Prueba con el paciente y ajuste si hace falta"] }),
        L(2, "Calzado diabético y ortopédico", 6, { texto: "El calzado diabético es amplio, sin costuras internas y con plantilla removible. Ayuda a elegir talla midiendo al final del día, cuando el pie está más hinchado, y deja un dedo de holgura." }),
        L(3, "Ofrecer sin presionar", 4, { checklist: ["Escucha la necesidad primero", "Ofrece lo indicado por el podólogo, no lo más caro", "Explica el beneficio en palabras sencillas", "Respeta un «lo pienso»; deja tarjeta y seguimiento"] }),
      ],
      evaluacion: { minimo: 75, preguntas: [Q("Anticipo habitual de una plantilla a medida:", ["50 %", "0 %", "100 % por adelantado siempre"], 0), Q("La talla de calzado se prueba…", ["Al final del día", "Al amanecer", "Da igual"], 0), Q("Si el paciente dice «lo pienso»…", ["Se presiona", "Se respeta y se da seguimiento", "Se le cobra igual"], 1)] } },
  ].map((c, i) => ({ ...c, estado: "publicado", borrador: true, creadoPor: i % 2 ? U("admin").id : gerentes[i % 7].id, fecha: F(-90 + i * 3), revision: F(-30 + i), version: "1.0" }));

  const g = (k) => gerentes[k % 7];
  const A = (n, tipo, categoria, titulo, descripcion, etiquetas, o = {}) => ({
    id: `AC${n}`, tipo, categoria, titulo, descripcion, etiquetas, contenido: o.contenido || "", youtube: null, imagenes: [], docUrl: null,
    sucursalId: o.sucursalId || null, roles: o.roles || [], subidoPor: (o.por || U("admin")).id, fecha: F(-(o.dias || 30)), revision: { fecha: F(-(o.rev ?? 20)), responsable: (o.resp || o.por || U("admin")).id }, version: o.version || "1.0", estado: o.estado || "publicado", borrador: true,
  });
  const acervo = [
    A(1, "video", "Caja y cobro", "Corte de caja de principio a fin", "Video del corte real de una sucursal: conteo, captura, diferencias y entrega de turno.", ["corte de caja", "caja", "video"], { por: g(0), dias: 60, roles: ["cajero", "gerente", "admin"], contenido: "Acompaña al curso «Corte de caja paso a paso». Video pendiente de subir a YouTube (no listado)." }),
    A(2, "formato", "Caja y cobro", "Formato de conteo de efectivo", "Hoja para anotar billetes y monedas por denominación antes de capturar el corte.", ["corte de caja", "formato", "efectivo"], { por: g(1), dias: 58, roles: ["cajero", "gerente"], contenido: "Denominaciones: $1000, $500, $200, $100, $50, $20 y monedas. Contar dos veces. Firma de quien cuenta y de quien recibe." }),
    A(3, "procedimiento", "Operación diaria", "Apertura de sucursal", "Lista de verificación para abrir la sucursal cada mañana.", ["apertura", "checklist"], { por: g(2), dias: 80, contenido: "1) Apagar alarma y encender luces. 2) Encender equipos y autoclave. 3) Revisar agenda del día y confirmar citas pendientes. 4) Abrir caja con el fondo y contarlo. 5) Revisar bitácoras del día en el sistema. 6) Verificar limpieza de consultorios y sala." }),
    A(4, "procedimiento", "Operación diaria", "Cierre de sucursal", "Pasos para cerrar la sucursal con corte de caja y resguardo.", ["cierre", "checklist", "corte de caja"], { por: g(2), dias: 80, contenido: "1) Cobrar o cancelar tickets abiertos. 2) Corte de caja y entrega firmada. 3) Esterilizar y guardar instrumental. 4) Retirar RPBI. 5) Apagar equipos y alarmas. 6) Registrar salida en Mi entrada y salida." }),
    A(5, "guia", "Clínico", "Quiropodia: guía rápida de la secuencia", "Resumen de una página de la secuencia de quiropodia.", ["quiropodia", "clínico", "bioseguridad"], { por: g(3), dias: 70, roles: ["podologo", "asistente"], contenido: "Valoración → manos y guantes → antisepsia → instrumental estéril abierto frente al paciente → desbridamiento → uñas → zonas específicas → hidratación → RPBI → registro y seguimiento." }),
    A(6, "foto", "Clínico", "Armado de la charola de quiropodia", "Fotografías de cómo debe quedar la charola antes de cada paciente.", ["quiropodia", "charola", "foto"], { por: g(3), dias: 55, roles: ["podologo", "asistente"], contenido: "Fotografías pendientes de subir. Debe incluir: cuchillas desechables, fresas, gasas, campo estéril, antiséptico y bolsa de RPBI." }),
    A(7, "procedimiento", "Bioseguridad", "Ciclo de esterilización y llenado de bitácora", "Del instrumental sucio al estéril y registro del ciclo en el sistema.", ["esterilización", "autoclave", "bitácora"], { por: g(4), dias: 65, roles: ["asistente", "podologo", "gerente"], version: "1.1", rev: 8, contenido: "Limpiar → empacar con indicador químico → cargar → ciclo según manual del equipo → verificar indicador → almacenar con fecha. Registrar lote, indicadores y responsable en Bitácoras." }),
    A(8, "guia", "Atención al paciente", "Banderas rojas del pie diabético (guía para recepción)", "Qué señales avisar de inmediato al podólogo.", ["diabético", "banderas rojas", "recepción"], { por: g(0), dias: 45, roles: ["recepcion", "asistente", "podologo"], contenido: "Herida que no cierra, cambio de color, calor o hinchazón nueva, mal olor o secreción, dolor súbito o pérdida de sensibilidad, fiebre con lesión. Avisar al podólogo en turno; no dar indicaciones médicas por teléfono." }),
    A(9, "formato", "Formatos", "Aviso de privacidad y consentimiento informado", "Formatos que firma todo paciente nuevo antes de su primera consulta.", ["formato", "consentimiento", "privacidad"], { por: U("admin"), dias: 120, contenido: "El texto legal definitivo lo valida el área jurídica. En el sistema se marca como firmado en el expediente del paciente." }),
    A(10, "procedimiento", "Inventario", "Recepción de mercancía de proveedor", "Cómo recibir contra orden de compra y factura.", ["recibir", "orden de compra", "inventario"], { por: g(5), dias: 50, roles: ["almacen", "gerente"], contenido: "Verificar OC → contar contra factura → capturar lo realmente recibido → lote y caducidad → acomodo por PEPS → reportar diferencias a administración." }),
    A(11, "procedimiento", "Inventario", "Traspaso entre sucursales", "Solicitud, envío y recepción de un traspaso.", ["traspaso", "inventario"], { por: g(5), dias: 48, roles: ["almacen", "gerente"], contenido: "Solicitado → autorizado → en tránsito → recibido (o recibido con diferencia). Quien envía y quien recibe cuentan por separado." }),
    A(12, "guia", "Inventario", "Conteo cíclico: cómo hacerlo", "Guía para contar una categoría sin detener la operación.", ["conteo", "inventario", "cíclico"], { por: g(6), dias: 40, roles: ["almacen", "gerente"], contenido: "Elegir categoría → contar sin ver el sistema → recontar diferencias → capturar ajuste con motivo → autorización del gerente." }),
    A(13, "guia", "Caja y cobro", "Apartados y créditos: resumen de políticas", "Reglas vigentes de apartados, crédito abierto y ventas a plazos.", ["apartados", "crédito", "políticas"], { por: U("admin"), dias: 35, roles: ["cajero", "gerente", "recepcion"], version: "2.0", rev: 5, contenido: "Apartado: 10 días, anticipo mínimo 20 %, anticipo vencido no se devuelve, prórroga la autoriza el gerente. Crédito abierto con interés mensual; plazos con recargo único; 10 días de gracia; autorización por niveles." }),
    A(14, "video", "Clínico", "Toma de huella y escáner de pie", "Cómo tomar correctamente la huella o el escáner para plantillas a medida.", ["plantillas", "huella", "escáner", "video"], { por: g(1), dias: 30, roles: ["podologo", "asistente"], contenido: "Video pendiente de subir a YouTube (no listado)." }),
    A(15, "guia", "Atención al paciente", "Cómo atender una queja", "Método en 4 pasos: escuchar, agradecer, resolver, registrar.", ["quejas", "servicio"], { por: g(4), dias: 25, contenido: "Escuchar sin interrumpir → agradecer → ofrecer solución concreta → registrar. Reembolsos y cortesías los autoriza el gerente." }),
    A(16, "foto", "Ventas", "Vitrina de calzado diabético y plantillas", "Cómo exhibir calzado, plantillas y bastones.", ["vitrina", "calzado", "plantillas", "foto"], { por: g(5), dias: 22, roles: ["cajero", "recepcion", "gerente"], contenido: "Fotografías pendientes de subir. Calzado por talla, precios visibles, plantillas al frente." }),
    A(17, "formato", "Formatos", "Solicitud de vacaciones o permiso", "Formato de apoyo; en el sistema la solicitud se hace desde Recursos humanos.", ["vacaciones", "permisos", "formato"], { por: U("admin"), dias: 90, contenido: "Datos: nombre, fechas, días laborables, motivo. Requiere aprobación del gerente (o de administración si es gerente)." }),
    A(18, "procedimiento", "Bioseguridad", "Manejo de residuos peligrosos (RPBI)", "Segregación y retiro de residuos peligrosos biológico-infecciosos.", ["rpbi", "bioseguridad", "residuos"], { por: g(6), dias: 75, roles: ["asistente", "podologo", "gerente"], contenido: "Punzocortantes al contenedor rígido rojo; material con sangre en bolsa roja; no compactar; retiro con proveedor autorizado y registro en bitácora. Criterio por validar con el responsable sanitario." }),
    A(19, "procedimiento", "Operación diaria", "Acceso y estacionamiento (Polanco)", "Instrucciones locales de la sucursal Polanco.", ["polanco", "local"], { por: g(5), dias: 15, sucursalId: "S6", contenido: "Entrada de personal por el acceso lateral. Estacionamiento de proveedores solo antes de las 10:00." }),
    A(20, "guia", "Caja y cobro", "Apartados y créditos (versión 2025)", "Versión anterior de las políticas; archivada.", ["apartados", "políticas"], { por: U("admin"), dias: 400, rev: 300, estado: "archivado", contenido: "Reemplazada por la versión 2.0." }),
  ];

  // ───────── Avance de demostración por usuario
  const avance = [];
  let nCt = 0, nAv = 0;
  const Dc = { rh, cap: { cursos } };
  empleados.filter((e) => e.estado === "activo" && e.usuarioId).forEach((e) => {
    const u = users.find((x) => x.id === e.usuarioId);
    const nuevo = esPersonalNuevo(e);
    cursos.forEach((c) => {
      const motivo = aplicaCurso(Dc, c, u);
      if (!motivo && r() > 0.08) return; // voluntario en cursos opcionales
      const x = r();
      const prop = nuevo ? (x < 0.45 ? 0 : x < 0.8 ? 0.4 : 0.75) : x < 0.12 ? 0 : x < 0.25 ? 0.5 : 1;
      if (prop === 0) return;
      const n = Math.max(1, Math.round(c.lecciones.length * prop));
      const vistas = c.lecciones.slice(0, n).map((l) => l.id);
      const completasLecc = vistas.length === c.lecciones.length;
      const calif = completasLecc ? 70 + int(0, 30) : null;
      const aprobado = completasLecc && calif >= c.evaluacion.minimo;
      avance.push({ id: `AV${++nAv}`, usuarioId: u.id, cursoId: c.id, sucursalId: e.sucursalBase, vistas, evaluaciones: completasLecc ? [{ fecha: F(-int(3, 200)), calif }] : [], aprobado, completado: aprobado ? F(-int(3, 200)) : null, constancia: aprobado ? `CT-${String(++nCt).padStart(4, "0")}` : null, ult: F(-int(0, 40)) });
    });
  });
  base.contadores.CT = nCt;

  return { rh, cap: { cursos, acervo, avance } };
}
