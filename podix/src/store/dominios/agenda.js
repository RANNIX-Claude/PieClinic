// Dominio «agenda» (incorporado de Pie Firme): semilla de datos de demostración. seed(base, util) → objeto que se mezcla en el estado.
// Posee: d.agenda = { params, horariosSucursal, horariosPodologo, rotacion, bloqueos, festivos, sobrecupos, recordatorios, plantillas,
//                     huecosLiberados, esperaHist, retenciones }  y extiende d.listaEspera (solo entradas vivas: en espera o notificadas).
// Coherencia con la semilla base: las citas sembradas (9:00–18:00, sin 14:00, cada podólogo alterna un día en cada una de sus dos
// sucursales) caen dentro de los horarios, la rotación, los festivos y los bloqueos de aquí; ninguna se toca. Todo es ficticio.
import { ahoraLocal, dia, hora } from "../../lib/format.js";
import { PARAMS_AGENDA, PLANTILLA_RECORDATORIO, PLANTILLA_ESPERA, festivosMexico, huecosDisponibles, masMin, abs } from "../reglas_agenda.js";

export function seed(base, util) {
  const { r, int, pick, F, DT } = util;
  const ahora = ahoraLocal();
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const sucursales = base.sucursales;
  const podologos = base.usuarios.filter((u) => u.rol === "podologo");
  const deRol = (rol, suc) => base.usuarios.find((u) => u.rol === rol && u.sucursales[0] === suc) || base.usuarios.find((u) => u.rol === rol);
  const admin = base.usuarios.find((u) => u.rol === "admin");

  // ───────── Horario de atención por sucursal (0 = domingo)
  const horariosSucursal = [];
  sucursales.forEach((s, i) => {
    for (let k = 0; k < 7; k++) {
      const abre = k === 0 || i === 5 ? "09:00" : "08:00";
      const cierra = k === 0 ? "18:00" : k === 6 ? "19:00" : i === 5 ? "21:00" : "20:00";
      horariosSucursal.push({ sucursalId: s.id, dia: k, abre, cierra, cerrado: false });
    }
  });

  // ───────── Jornada de cada podólogo y rotación entre sus dos sucursales (un día en cada una)
  const horariosPodologo = [], rotacion = [];
  podologos.forEach((p, i) => {
    const tarde = i % 4 === 1 ? "18:30" : i % 4 === 3 ? "19:00" : "18:00";
    for (let k = 0; k < 7; k++) {
      horariosPodologo.push({ podologoId: p.id, dia: k, descanso: false, turnos: [{ de: "09:00", a: "14:00" }, { de: "15:00", a: k === 0 || k === 6 ? "18:00" : tarde }] });
    }
    rotacion.push({ podologoId: p.id, modo: "alterna", ancla: F(0), sucursales: [...p.sucursales] });
  });

  // ───────── Festivos de México: año en curso y el siguiente. Los oficiales cierran, salvo los que caen en días con citas ya sembradas.
  const anio = Number(F(0).slice(0, 4));
  const conCitas = new Set(base.citas.map((c) => dia(c.inicio)));
  const festivos = [...festivosMexico(anio), ...festivosMexico(anio + 1)].map((f) => {
    const guardia = f.oficial && conCitas.has(f.fecha);
    return { id: id("FE"), fecha: f.fecha, nombre: f.nombre, oficial: f.oficial, sucursalId: null, abre: !f.oficial || guardia,
      nota: guardia ? "Se trabaja con guardia: ya había citas agendadas." : f.oficial ? "Descanso obligatorio (art. 74 LFT)." : "No es descanso obligatorio: se atiende normal." };
  });
  // Un festivo local de una sola sucursal (aniversario), fuera de la ventana con citas.
  festivos.push({ id: id("FE"), fecha: F(23), nombre: "Aniversario de la sucursal (evento interno por la tarde)", oficial: false, sucursalId: sucursales[5].id, abre: true, nota: "Abre: solo se bloquea la tarde (ver bloqueos)." });

  // ───────── Bloqueos: vacaciones, juntas, mantenimiento, capacitación. Ninguno choca con citas sembradas (van a la hora de comida o después del día +4).
  const bloqueos = [];
  const blq = (o) => bloqueos.push({ id: id("BQ"), sucursalId: null, podologoId: null, consultorioId: null, motivo: "", solicitadoEn: DT(-int(6, 20), 10, 0), resueltoPor: null, resueltoEn: null, ...o });
  const ger = (suc) => deRol("gerente", suc);
  sucursales.forEach((s, i) => {
    const g = ger(s.id);
    blq({ ambito: "sucursal", sucursalId: s.id, tipo: "junta", inicio: DT(1 + (i % 3), 14, 0), fin: DT(1 + (i % 3), 15, 0), motivo: "Junta mensual de sucursal (a la hora de comida)", estado: "autorizado", solicitadoPor: g.id, resueltoPor: g.id, resueltoEn: DT(-3, 12, 0) });
    const pendiente = i % 4 === 3;
    blq({ ambito: "consultorio", sucursalId: s.id, consultorioId: s.consultorios[i % 3], tipo: "mantenimiento", inicio: DT(6 + i, 9, 0), fin: DT(6 + i, 13, 0), motivo: pick(["Servicio al sillón podológico", "Mantenimiento del micromotor y la lámpara", "Pintura y resane del consultorio", "Calibración del equipo láser"]), estado: pendiente ? "solicitado" : "autorizado", solicitadoPor: g.id, resueltoPor: pendiente ? null : g.id, resueltoEn: pendiente ? null : DT(-2, 11, 0) });
  });
  const motivosVac = ["Vacaciones anuales", "Vacaciones de fin de año", "Viaje familiar", "Días a cuenta de vacaciones"];
  podologos.forEach((p, i) => {
    const g = ger(p.sucursales[0]);
    if (i % 3 === 0) { const ini = 8 + i; blq({ ambito: "podologo", podologoId: p.id, sucursalId: p.sucursales[0], tipo: "vacaciones", inicio: DT(ini, 0, 0), fin: DT(ini + int(3, 6), 23, 59), motivo: pick(motivosVac), estado: "autorizado", solicitadoPor: p.id, resueltoPor: g.id, resueltoEn: DT(-4, 13, 0) }); }
    if (i % 3 === 1) { const ini = 12 + i; blq({ ambito: "podologo", podologoId: p.id, sucursalId: p.sucursales[0], tipo: i % 2 ? "vacaciones" : "permiso", inicio: DT(ini, 0, 0), fin: DT(ini + (i % 2 ? 4 : 0), 23, 59), motivo: i % 2 ? pick(motivosVac) : "Trámite personal", estado: "solicitado", solicitadoPor: p.id, solicitadoEn: DT(-int(0, 2), 12, 30) }); }
    if (i % 5 === 2) blq({ ambito: "podologo", podologoId: p.id, sucursalId: p.sucursales[0], tipo: "capacitacion", inicio: DT(9, 15, 0), fin: DT(9, 18, 0), motivo: "Curso de pie diabético (sesión presencial)", estado: "autorizado", solicitadoPor: admin.id, resueltoPor: admin.id, resueltoEn: DT(-5, 9, 0) });
    if (i % 7 === 4) blq({ ambito: "podologo", podologoId: p.id, sucursalId: p.sucursales[0], tipo: "permiso", inicio: DT(7, 9, 0), fin: DT(7, 14, 0), motivo: "Cita médica", estado: "rechazado", solicitadoPor: p.id, resueltoPor: g.id, resueltoEn: DT(-1, 17, 0), motivoResolucion: "Ese día ya hay citas confirmadas; se propone el jueves." });
    if (i % 6 === 5) blq({ ambito: "podologo", podologoId: p.id, sucursalId: p.sucursales[0], tipo: "vacaciones", inicio: DT(-24, 0, 0), fin: DT(-19, 23, 59), motivo: "Vacaciones (ya tomadas)", estado: "autorizado", solicitadoPor: p.id, resueltoPor: g.id, resueltoEn: DT(-40, 10, 0), solicitadoEn: DT(-45, 10, 0) });
  });
  blq({ ambito: "sucursal", sucursalId: sucursales[5].id, tipo: "otro", inicio: DT(23, 14, 0), fin: DT(23, 21, 0), motivo: "Evento de aniversario de la sucursal", estado: "autorizado", solicitadoPor: ger(sucursales[5].id).id, resueltoPor: admin.id, resueltoEn: DT(-6, 10, 0) });

  const agenda = {
    params: { ...PARAMS_AGENDA }, horariosSucursal, horariosPodologo, rotacion, bloqueos, festivos,
    sobrecupos: [], recordatorios: [], huecosLiberados: [], esperaHist: [], retenciones: [],
    plantillas: { recordatorio: PLANTILLA_RECORDATORIO, espera: PLANTILLA_ESPERA },
  };
  const tmp = { ...base, agenda, listaEspera: [] };

  // ───────── Huecos liberados (cancelaciones de último momento) y lista de espera
  const listaEspera = [];
  const notas = ["Prefiere que le llamen por la tarde", "Dolor al caminar: darle prioridad", "Solo puede sábados", "Viene de lejos; avisar con tiempo", "Paciente diabético, revisión vencida", "Quiere el primer horario que se libere", "", "", ""];
  const origenes = ["llamada", "llamada", "mostrador", "whatsapp", "portal", "referido"];
  const usados = new Set();
  const paciente = () => { let p, k = 0; do { p = pick(base.pacientes); } while (usados.has(p.id) && k++ < 20); usados.add(p.id); return p; };
  const nueva = (s, o = {}) => {
    const dias = o.dias ?? int(0, 9);
    return { id: id("LE"), pacienteId: paciente().id, servicioId: pick(base.servicios).id, preferencia: pick(["cualquiera", "cualquiera", "manana", "tarde"]), sucursalId: s.id, creado: F(-dias), creadoEn: DT(-dias, int(9, 17), pick([0, 10, 25, 40])),
      vence: F(-dias + PARAMS_AGENDA.esperaVenceDias), podologoId: null, prioridad: pick(["alta", "media", "media", "media", "baja"]), origen: pick(origenes), notas: pick(notas), estado: "esperando", intentos: 0, avisos: [], registradoPor: deRol("recepcion", s.id).id, ...(o.extra || {}) };
  };
  const notificar = (e, hl, haceMin) => {
    const en = masMin(ahora, -haceMin);
    Object.assign(e, { estado: "notificado", notificadoEn: en, notificadoHasta: masMin(en, PARAMS_AGENDA.esperaVentanaMin), intentos: 1, hueco: { sucursalId: hl.sucursalId, podologoId: hl.podologoId, inicio: hl.inicio, duracion: hl.duracion }, avisos: [{ hueco: `${hl.podologoId}|${hl.inicio}`, en }] });
    return e;
  };
  sucursales.forEach((s, i) => {
    // Hasta dos huecos liberados por sucursal en los próximos días (si hay horario libre).
    const pods = podologos.filter((p) => p.sucursales.includes(s.id));
    for (const off of [1, 2, 3]) {
      if (agenda.huecosLiberados.filter((x) => x.sucursalId === s.id).length >= 2) break;
      const libres = huecosDisponibles(tmp, { sucursalId: s.id, fecha: F(off), duracion: 60 });
      if (!libres.length) continue;
      const h = libres[int(0, libres.length - 1)];
      agenda.huecosLiberados.push({ id: id("HL"), sucursalId: s.id, podologoId: h.podologoId, inicio: h.inicio, duracion: 60, origen: pick(["Cancelación por teléfono", "El paciente adelantó su cita", "Cancelación por WhatsApp"]), registradoEn: DT(0, 8, 30) });
    }
    // Entradas en espera: 2 a 4 por sucursal, alguna con podólogo preferido.
    const k = 2 + (i % 3);
    for (let j = 0; j < k; j++) {
      const e = nueva(s);
      if (j === 1 && pods.length) e.podologoId = pick(pods).id;
      listaEspera.push(e);
    }
    // Una por vencer y una ya vencida (más de 14 días): se puede reactivar o archivar.
    if (i % 2 === 0) listaEspera.push(nueva(s, { dias: 13, extra: { notas: "Vence mañana: confirmar si sigue interesado", prioridad: "media" } }));
    if (i % 3 === 0) listaEspera.push(nueva(s, { dias: 16 + i, extra: { notas: "No contestó las dos veces que se le llamó", intentos: 2 } }));
    // Notificados: uno con la ventana de 30 min corriendo y otro al que ya se le pasó.
    const hl = agenda.huecosLiberados.find((x) => x.sucursalId === s.id);
    if (hl && i % 2 === 1) listaEspera.push(notificar(nueva(s, { dias: int(2, 6), extra: { prioridad: "alta", preferencia: "cualquiera" } }), hl, int(4, 12)));
    if (hl && i % 3 === 2) listaEspera.push(notificar(nueva(s, { dias: int(3, 8), extra: { prioridad: "media", preferencia: "cualquiera" } }), hl, int(95, 180)));
  });
  // Histórico de la lista (últimas 5 semanas): agendados desde la lista, vencidos y retirados.
  for (let i = 0; i < 30; i++) {
    const s = sucursales[i % 7];
    const dias = int(8, 36);
    const e = nueva(s, { dias });
    const fin = i % 10 < 6 ? "agendado" : i % 10 < 8 ? "vencida" : "quitado";
    const espera = fin === "vencida" ? PARAMS_AGENDA.esperaVenceDias : int(1, Math.min(9, dias - 1));
    Object.assign(e, { estado: fin, cerradoEn: DT(-dias + espera, int(9, 17), 0), intentos: fin === "agendado" ? int(1, 2) : int(0, 3),
      motivoCierre: fin === "agendado" ? "Aceptó el hueco ofrecido" : fin === "vencida" ? "Venció a los 14 días sin respuesta" : pick(["Ya se atendió en otro lado", "Ya no le interesa", "Agendó cita normal por su cuenta"]) });
    agenda.esperaHist.push(e);
  }

  // ───────── Recordatorios de 24 h con su resultado (días pasados, hoy y parte de mañana)
  const recep = {};
  sucursales.forEach((s) => { recep[s.id] = deRol("recepcion", s.id).id; });
  const conWa = new Map(base.pacientes.map((p) => [p.id, !!p.whatsapp]));
  const desde = F(-5), manana = F(1), hoyF = F(0);
  for (const c of base.citas) {
    const f = dia(c.inicio);
    if (f < desde || f > manana) continue;
    const x = r();
    let estado = null;
    if (f === manana) estado = c.estado === "confirmada" ? (x < 0.55 ? "confirmo" : null) : c.estado === "por_confirmar" ? (x < 0.35 ? "enviado" : null) : null;
    else if (c.estado === "no_asistio") estado = x < 0.72 ? "sin_respuesta" : "confirmo";
    else if (c.estado === "cancelada") estado = x < 0.5 ? "cancelo" : "reprogramo";
    else if (f === hoyF && c.estado === "por_confirmar") estado = x < 0.6 ? "sin_respuesta" : "enviado";
    else estado = x < 0.76 ? "confirmo" : x < 0.93 ? "sin_respuesta" : null;
    const minutos = int(0, 75), demora = int(3, 240);
    if (!estado) continue;
    const enviadoEn = masMin(c.inicio, -24 * 60 + minutos);
    if (abs(enviadoEn) > abs(ahora)) continue; // aún no toca (regla de 24 h): sigue en la cola
    const responde = ["confirmo", "reprogramo", "cancelo"].includes(estado);
    agenda.recordatorios.push({ id: id("RC"), citaId: c.id, sucursalId: c.sucursalId, fecha: f, estado, canal: conWa.get(c.pacienteId) ? "whatsapp" : "llamada", enviadoEn, enviadoPor: recep[c.sucursalId], respuestaEn: responde ? masMin(enviadoEn, demora) : null });
  }

  // ───────── Sobrecupos (P-042): por autorizar, autorizado sin usar y rechazado
  const sv = base.servicios;
  [["solicitado", 1, "Paciente con dolor agudo por uña encarnada; no puede esperar"], ["autorizado", 2, "Curación de pie diabético que no debe posponerse"], ["rechazado", 1, "El paciente solo puede a esa hora"], ["solicitado", 3, "Seguimiento posquirúrgico: revisión de la herida"]].forEach(([estado, off, motivo], i) => {
    const s = sucursales[(i * 2) % 7];
    const cita = base.citas.find((c) => c.sucursalId === s.id && dia(c.inicio) === F(off) && !["cancelada", "no_asistio"].includes(c.estado));
    if (!cita) return;
    agenda.sobrecupos.push({ id: id("SC"), sucursalId: s.id, podologoId: cita.podologoId, fecha: F(off), hora: hora(cita.inicio), pacienteId: paciente().id, servicioId: (i % 2 ? sv[6] : sv[2]).id, motivo, estado,
      solicitadoPor: recep[s.id], solicitadoEn: DT(0, 9, 10 + i * 7), resueltoPor: estado === "solicitado" ? null : admin.id, resueltoEn: estado === "solicitado" ? null : DT(0, 10, 5 + i), citaId: null,
      motivoResolucion: estado === "rechazado" ? "Hay horario libre al día siguiente; no se justifica el sobrecupo." : "" });
  });

  return { agenda, listaEspera };
}
