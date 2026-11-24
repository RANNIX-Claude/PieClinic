// Dominio «clínica» (incorporado de Pie Firme): semilla de datos de demostración. seed(base, util) → objeto que se mezcla en el estado.
// Posee: d.clinica (parámetros), d.plantillasPlan, d.planesTrat, d.pieDiabetico, d.plantillasOrto, d.quejas, d.arco, d.crm.
// Extiende con campos OPCIONALES (no los posee): d.sets (codigo, contenido), d.ciclos (tipoCiclo, temp, presion, min, esterilHasta,
// bloqueadoEn, pacientesAvisados, avisos), d.usoSets (usos de kit por paciente), d.ordenesLab (plantillaOrtoId).
// Solo usa reglas puras (reglas_clinica.js) y el generador determinista util.r. Todo es ficticio.
import {
  PLANTILLAS_PLAN_BASE, generarSesiones, cargoSesion, FESTIVOS_MX, sugerirSinbad, puntajeSinbad, proximaRevision, FRECUENCIA_POR_RIESGO,
  entregaEstimada, CICLOS_AUTOCLAVE, esterilHasta, fechaLimite, MODELOS_PO, MATERIALES_PO, SITIOS_MONO,
} from "../reglas_clinica.js";

const CONTENIDO_KIT = [
  ["Alicate de corte recto", "Alicate de corte curvo", "Gubia", "Bisturí mango #3", "Pinza de disección", "Cucharilla de Volkmann"],
  ["Alicate de uña encarnada", "Elevador de uña", "Tijera de Mayo", "Pinza mosquito", "Porta agujas", "Bisturí mango #3"],
  ["Fresa de diamante", "Fresa de tungsteno", "Pinza de disección", "Gubia", "Lima de uña"],
  ["Alicate de corte recto", "Pinza Kocher", "Tijera iris", "Cucharilla", "Bisturí mango #4"],
];

export function seed(base, util) {
  const { r, int, pick, F, DT, id, folio } = util;
  const hoyS = F(0);
  const pods = base.usuarios.filter((u) => u.rol === "podologo");
  const adm = base.usuarios.find((u) => u.rol === "admin");
  const dir = base.usuarios.find((u) => u.rol === "direccion");
  const gerenteDe = (s) => base.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(s));
  const recepDe = (s) => base.usuarios.find((u) => u.rol === "recepcion" && u.sucursales.includes(s));
  const asistDe = (s) => base.usuarios.find((u) => u.rol === "asistente" && u.sucursales[0] === s) || base.usuarios.find((u) => u.rol === "asistente" && u.sucursales.includes(s));
  const pacPorId = new Map(base.pacientes.map((p) => [p.id, p]));
  const diabeticos = base.pacientes.filter((p) => (p.alertas || []).some((a) => /diabet/i.test(a)));

  // Pacientes de cada podólogo (consultas y citas de la semilla)
  const pacDe = new Map(pods.map((p) => [p.id, []]));
  base.consultas.forEach((c) => { const l = pacDe.get(c.podologoId); if (l && !l.includes(c.pacienteId)) l.push(c.pacienteId); });
  base.citas.forEach((c) => { const l = pacDe.get(c.podologoId); if (l && !l.includes(c.pacienteId)) l.push(c.pacienteId); });
  const sucDe = (podologoId, pacienteId) => {
    const c = base.consultas.find((x) => x.podologoId === podologoId && x.pacienteId === pacienteId) || base.citas.find((x) => x.podologoId === podologoId && x.pacienteId === pacienteId);
    return c ? c.sucursalId : pods.find((p) => p.id === podologoId).sucursales[0];
  };

  // ═════════ Planes de tratamiento (P-026 a P-029)
  const plantillasPlan = PLANTILLAS_PLAN_BASE.map((p) => ({ ...p, sesiones: p.sesiones.map((s) => ({ ...s })), creadaPor: adm.id, actualizada: F(-120) }));
  const planesTrat = [];
  const DIAG = { PPL1: "L60.0 Uña encarnada", PPL2: "B35.1 Tiña de las uñas", PPL3: "B07 Verrugas virales", PPL4: "E11.5 Pie diabético", PPL5: "L60.0 Uña encarnada", PPL6: "L60.0 Uña encarnada" };
  // Escenarios: [inicio en días, qué pasa] — da planes en curso, completados, por abandonar, abandonables y abandonados.
  const ESC = [[-3, "curso"], [-40, "curso"], [-70, "completo"], [-55, "abandonado"], [-48, "porAbandonar"], [-62, "abandonable"], [-14, "curso"], [-1, "nuevo"]];
  pods.forEach((pod, pi) => {
    const mios = pacDe.get(pod.id) || [];
    const n = Math.min(mios.length, 3 + (pi % 3)); // 3 a 5 planes por podólogo (cuida el tamaño de localStorage)
    for (let k = 0; k < n; k++) {
      const pacienteId = mios[k];
      const pl = plantillasPlan[(pi + k * 2) % plantillasPlan.length];
      const [ini, esc] = ESC[(pi + k) % ESC.length];
      const sucursalId = sucDe(pod.id, pacienteId);
      const sesiones = generarSesiones({ sesiones: pl.sesiones, fechaInicio: F(ini), festivos: FESTIVOS_MX });
      const plan = {
        id: id("PTR"), folio: folio("PTR"), pacienteId, podologoId: pod.id, sucursalId, plantillaId: pl.id, nombre: pl.nombre, diagnostico: DIAG[pl.id] || "",
        creado: F(ini - 1), fechaInicio: F(ini), estado: "activo", formaCobro: k % 4 === 3 ? "todo_primera" : "por_sesion", anticipo: k % 4 === 3 ? 0 : (k % 3 === 0 ? 500 : 0),
        servicioId: pl.servicioId, sesiones, notas: [],
      };
      // Hasta dónde llegó el paciente según el escenario
      let corte = hoyS;
      if (esc === "abandonado") corte = F(ini + 12);
      if (esc === "porAbandonar") corte = F(-25);
      if (esc === "abandonable") corte = F(-34);
      sesiones.forEach((s, i) => {
        if (esc === "completo" || (s.fecha < corte && s.fecha < hoyS)) {
          const falta = esc !== "completo" && i > 0 && r() < 0.12;
          if (falta) { s.estado = "falta"; return; }
          s.estado = "realizada"; s.realizadaEn = s.fecha; s.cargo = cargoSesion(plan, s);
          if (r() < 0.15) s.reprogramaciones = 1;
        }
      });
      if (esc === "completo") { plan.estado = "completado"; plan.completadoEn = sesiones[sesiones.length - 1].fecha; }
      if (esc === "abandonado") { plan.estado = "abandonado"; plan.abandonadoEn = F(ini + 42); plan.notas.push({ fecha: F(ini + 42), por: null, texto: "Regla de 30 días sin cita (P-026): el sistema lo marcó como abandonado." }); }
      if (["curso", "nuevo"].includes(esc)) {
        const sig = sesiones.find((s) => s.estado === "por_generar");
        if (sig) {
          const fut = base.citas.find((c) => c.pacienteId === pacienteId && c.podologoId === pod.id && c.inicio.slice(0, 10) >= hoyS && !["cancelada", "no_asistio"].includes(c.estado));
          sig.estado = "agendada";
          if (fut) { sig.citaId = fut.id; sig.fecha = fut.inicio.slice(0, 10); sig.hora = fut.inicio.slice(11, 16); }
          else if (sig.fecha < hoyS) sig.fecha = F(int(1, 4));
        }
      }
      if (esc === "nuevo" && sesiones[0].estado !== "realizada") { sesiones[0].estado = "agendada"; sesiones[0].fecha = F(1); }
      planesTrat.push(plan);
    }
  });

  // ═════════ Pie diabético (P-010, P-011)
  const pieDiabetico = [];
  const REG = ["dedo", "antepie", "mediopie", "talon"], PROF = ["piel", "subcutaneo", "musculo_tendon", "hueso_articulacion"], INF = ["sin_infeccion", "leve", "moderada", "grave"];
  const pulsoAl = (malo) => (malo ? pick(["disminuido", "ausente", "disminuido"]) : r() < 0.9 ? "presente" : "no_evaluado");
  diabeticos.slice(0, 26).forEach((p, pi) => {
    const candidatos = pods.filter((x) => (pacDe.get(x.id) || []).includes(p.id));
    const pod = candidatos[0] || pods[pi % pods.length];
    const sucursalId = sucDe(pod.id, p.id);
    const nVal = 1 + (pi % 4);
    const conUlcera = pi % 3 === 0, malo = pi % 5 === 1;
    let wag = conUlcera ? int(1, 3) : 0;
    for (let k = 0; k < nVal; k++) {
      const fecha = F(-(nVal - k) * int(28, 45) + int(0, 5));
      const pulsos = { pedioI: pulsoAl(malo), pedioD: pulsoAl(malo), tibialI: pulsoAl(malo), tibialD: pulsoAl(malo && r() < 0.6) };
      const fallanD = malo || r() < 0.2 ? SITIOS_MONO.slice(0, int(1, 4)).map((s) => s[0]) : [];
      const fallanI = malo && r() < 0.7 ? SITIOS_MONO.slice(2, 2 + int(1, 3)).map((s) => s[0]) : [];
      const mono = { D: { ev: 10, fallan: fallanD }, I: { ev: 10, fallan: fallanI } };
      const sensProtectora = fallanD.length + fallanI.length ? "ausente" : "intacta";
      // ITB: a veces no se mide (queda null = «no evaluado», nunca 0 — P-011)
      const itbI = r() < 0.35 ? null : Math.round((malo ? 0.55 + r() * 0.35 : 0.92 + r() * 0.35) * 100) / 100;
      const itbD = itbI === null ? null : Math.round((malo ? 0.6 + r() * 0.35 : 0.9 + r() * 0.4) * 100) / 100;
      let ulcera = null, sinbad = null, sinbadTotal = null;
      if (conUlcera) {
        // Evolución: la úlcera mejora en la mayoría; en algunos empeora (alerta)
        if (k > 0) wag = Math.max(1, Math.min(4, wag + (pi % 6 === 0 ? 1 : r() < 0.6 ? -1 : 0)));
        const region = REG[(pi + k) % 4];
        ulcera = { pie: pi % 2 ? "I" : "D", region, areaCm2: Math.round((wag * 0.8 + r() * 1.2) * 10) / 10, profundidad: PROF[Math.min(3, wag - 1)], infeccion: INF[Math.min(3, wag >= 3 ? int(1, 3) : int(0, 1))], descripcion: pick(["Lecho granuloso, bordes macerados", "Fibrina en el 30 % del lecho", "Bordes regulares, exudado escaso", "Esfacelo central, piel perilesional eritematosa"]) };
        sinbad = sugerirSinbad({ region, pulsos, sensProtectora, infeccion: ulcera.infeccion, areaCm2: ulcera.areaCm2, profundidad: ulcera.profundidad });
        sinbadTotal = puntajeSinbad(sinbad);
      } else if (k === nVal - 1 && pi % 7 === 4) wag = 0;
      const riesgo = conUlcera ? 3 : sensProtectora === "ausente" ? (malo ? 2 : 1) : 0;
      const frecuencia = FRECUENCIA_POR_RIESGO[riesgo];
      pieDiabetico.push({
        id: id("PD"), folio: folio("PD"), pacienteId: p.id, podologoId: pod.id, sucursalId, fecha, pulsos, mono, sensProtectora, itbI, itbD,
        hba1c: Math.round((6.2 + r() * 4) * 10) / 10, sintomas: malo ? ["hormigueo", "ardor"] : r() < 0.3 ? ["calambres"] : [], deformidades: r() < 0.4 ? [pick(["hallux_valgus", "garra", "callosidad", "onicomicosis"])] : [],
        ulceraPrevia: conUlcera && k > 0, amputacionPrevia: false, ulcera, sinbad, sinbadTotal, wagner: conUlcera ? wag : 0,
        riesgo: null, riesgoClinico: riesgo, frecuencia, proximaRevision: proximaRevision(fecha, frecuencia),
        notas: conUlcera ? "Curación con apósito hidrocoloide; se indica descarga con calzado postquirúrgico." : "Educación en autocuidado; revisión diaria de pies y calzado adecuado.",
        firmada: k < nVal - 1 || r() < 0.7, firmadaEn: fecha,
      });
    }
  });

  // ═════════ Plantillas ortopédicas (P-013) — enlazadas a las órdenes de laboratorio que ya existen (no se duplican)
  const plantillasOrto = [];
  const modelos = Object.keys(MODELOS_PO);
  const estudio = (talla) => ({
    tipo: pick(["baropodometria", "plantigrafia", "escaner3d", "molde"]), tallaCalzado: Number(talla) || int(22, 28), longI: int(225, 275), longD: int(225, 275), anchoI: int(85, 105), anchoD: int(85, 105),
    tipoArco: pick(["Normal", "Plano", "Plano", "Cavo"]), retropie: pick(["Neutro", "Valgo", "Varo"]), dismetriaMm: pick([0, 0, 0, 3, 5, 8]), pesoKg: int(52, 98),
    actividad: pick(["Sedentaria", "Camina más de 5 km al día", "Corredor recreativo", "De pie en su trabajo"]),
    hallazgos: pick(["Hiperpresión en cabezas metatarsales centrales", "Pronación de retropié en apoyo", "Apoyo lateral excesivo", "Talalgia con presión máxima en talón"]),
  });
  base.ordenesLab.forEach((o, i) => {
    if (i % 5 === 4) return; // algunas órdenes antiguas no nacieron de un estudio de pisada
    const modelo = MODELOS_PO[o.tipo] ? o.tipo : pick(modelos);
    const precio = MODELOS_PO[modelo];
    const po = {
      id: id("PO"), folio: folio("PO"), pacienteId: o.pacienteId, podologoId: o.podologoId, sucursalId: o.sucursalId, creado: F(-30 + i % 7) < o.enviada ? F(-30 + i % 7) : o.enviada,
      estado: "enviada", estudio: estudio(o.talla),
      orden: { modelo, material: pick(MATERIALES_PO), cobertura: pick(["completa", "tres_cuartos"]), pares: 1, precio, laboratorioId: o.laboratorioId, garantiaMeses: 6, correcciones: o.correcciones, pie: o.pie },
      ordenLabId: o.id, enviada: o.enviada, entregaEstimada: entregaEstimada(o.enviada), reclamos: [], ajusteRevisado: false,
    };
    o.plantillaOrtoId = po.id;
    plantillasOrto.push(po);
  });
  // Entregadas hace tiempo: algunas ya en revisión de ajuste, otras con garantía vencida
  plantillasOrto.filter((po) => base.ordenesLab.find((o) => o.id === po.ordenLabId && o.estado === "entregada")).forEach((po, k) => {
    const o = base.ordenesLab.find((x) => x.id === po.ordenLabId);
    o.entregada = F(-[16, 40, 120, 200, 210][k % 5]);
    if (k % 4 === 1) po.reclamos.push({ fecha: F(-10), por: po.podologoId, texto: "Molestia en el borde medial del arco; se ajusta en sitio.", enGarantia: true });
  });
  // Borradores (estudio hecho, falta enviar) y canceladas
  pods.forEach((pod, pi) => {
    const mios = pacDe.get(pod.id) || [];
    [0, 1].forEach((k) => {
      const pacienteId = mios[(k + 6) % Math.max(1, mios.length)];
      if (!pacienteId) return;
      const modelo = modelos[(pi + k) % modelos.length];
      plantillasOrto.push({
        id: id("PO"), folio: folio("PO"), pacienteId, podologoId: pod.id, sucursalId: sucDe(pod.id, pacienteId), creado: F(-int(0, 6)),
        estado: pi % 5 === 3 && k === 1 ? "cancelada" : "borrador", estudio: estudio(pick(["24", "25", "26", "27"])),
        orden: { modelo, material: pick(MATERIALES_PO), cobertura: "completa", pares: 1, precio: MODELOS_PO[modelo], laboratorioId: pick(base.laboratorios).id, garantiaMeses: 6, correcciones: pick(["Cuña supinadora de retropié", "Barra retrocapital", "Soporte de arco longitudinal", "Descarga de 1.ª cabeza metatarsal"]), pie: "Ambos" },
        ordenLabId: null, enviada: null, entregaEstimada: null, reclamos: [], ajusteRevisado: false,
        ...(pi % 5 === 3 && k === 1 ? { motivoCancelacion: "El paciente decidió no continuar por costo." } : {}),
      });
    });
  });

  // ═════════ Esterilización por lotes (P-023): kits con código, ciclos con parámetros, un lote BLOQUEADO con pacientes
  base.sets.forEach((s, k) => { s.codigo = `KIT-${s.sucursalId}-${String(k % 4 + 1).padStart(2, "0")}`; s.contenido = CONTENIDO_KIT[k % 4]; s.tipoKit = ["Quiropodia", "Uña encarnada", "Fresado", "Curación"][k % 4]; });
  base.ciclos.forEach((c) => {
    const t = c.fecha.slice(0, 10) === hoyS ? "instrumental_envuelto" : pick(Object.keys(CICLOS_AUTOCLAVE));
    const [, temp, presion, min] = CICLOS_AUTOCLAVE[t];
    Object.assign(c, { tipoCiclo: t, temp, presion, min, esterilHasta: esterilHasta(c.fecha.slice(0, 10)), pacientesAvisados: [], avisos: [] });
  });
  const ciclosNuevos = [], usoSets = [];
  base.sucursales.forEach((s, si) => {
    const asis = asistDe(s.id);
    // Ciclo de hace 6 días (kits 1 y 4) — en Norte (S2) y Poniente (S5) su biológico salió POSITIVO: lote BLOQUEADO (S1 queda al 100 %, lo espera tests/admin.test.js)
    const bloq = si === 1 || si === 4;
    const c = {
      id: id("CC"), folio: `CIC-${20100 + si}`, sucursalId: s.id, autoclave: si % 2 ? "AC-2" : "AC-1", lote: `L-${F(-6).slice(5)}-B`, tipoCiclo: "instrumental_envuelto", temp: 134, presion: 2.1, min: 4,
      indicadorQuimico: "conforme", indicadorBiologico: bloq ? "no_conforme" : "conforme", responsableId: asis.id, fecha: DT(-6, 8, 10), sets: [`SET-${s.id}-1`, `SET-${s.id}-4`],
      resultado: bloq ? "no_conforme" : "conforme", esterilHasta: esterilHasta(F(-6)), pacientesAvisados: [], avisos: [], bioResultadoEn: DT(-5, 9, 0),
      ...(bloq ? { bloqueadoEn: DT(-5, 9, 0), notaBloqueo: "Indicador biológico positivo a las 24 h. Se retiran los kits y se avisa a los pacientes atendidos." } : {}),
    };
    ciclosNuevos.push(c);
    // Usos de kit en citas atendidas de los últimos días (trazabilidad inversa)
    const atendidas = base.citas.filter((x) => x.sucursalId === s.id && x.estado === "atendida" && x.inicio.slice(0, 10) >= F(-6)).sort((a, b) => a.inicio.localeCompare(b.inicio));
    atendidas.forEach((x, k) => {
      if (k % 2) return;
      const f = x.inicio.slice(0, 10);
      const delLote = f <= F(-4) ? c : base.ciclos.filter((y) => y.sucursalId === s.id && y.fecha.slice(0, 10) <= f).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      if (!delLote) return;
      const setId = delLote.sets[k % delLote.sets.length];
      usoSets.push({ id: id("US"), setId, cicloId: delLote.id, cicloFolio: delLote.folio, pacienteId: x.pacienteId, citaId: x.id, consultorio: x.consultorioId, fecha: x.inicio, usuarioId: asis.id, sucursalId: s.id });
    });
    if (bloq && usoSets.some((u) => u.cicloId === c.id)) {
      const primero = usoSets.find((u) => u.cicloId === c.id);
      c.pacientesAvisados.push(primero.pacienteId);
      c.avisos.push({ pacienteId: primero.pacienteId, fecha: DT(-5, 11, 20), por: gerenteDe(s.id).id, canal: "telefono", nota: "Se le explicó la situación; se agenda revisión sin costo." });
    }
  });
  // Un ciclo rechazado (químico no viró) en S2
  ciclosNuevos.push({ id: id("CC"), folio: "CIC-20120", sucursalId: "S2", autoclave: "AC-1", lote: `L-${F(-2).slice(5)}-C`, tipoCiclo: "textil_curacion", temp: 121, presion: 1.1, min: 15, indicadorQuimico: "no_conforme", indicadorBiologico: "no_aplica", responsableId: asistDe("S2").id, fecha: DT(-2, 13, 0), sets: ["SET-S2-4"], resultado: "no_conforme", esterilHasta: null, pacientesAvisados: [], avisos: [], falla: { motivo: "La cinta indicadora no viró: bolsa húmeda al sacarla", por: asistDe("S2").id, en: DT(-2, 13, 50) } });

  // ═════════ Quejas, eventos adversos y ARCO (P-020 a P-022, P-141)
  const quejas = [];
  const TXT_Q = {
    dolor_posterior: ["Refiere dolor intenso dos días después de la extracción de uña.", "Molestia al caminar después de la quiropodia; pide revisión."],
    tiempo_espera: ["Esperó 50 minutos después de la hora de su cita sin que le avisaran.", "La cita empezó 40 minutos tarde y llegó tarde a su trabajo."],
    cobro_incorrecto: ["Le cobraron la curación incluida en su plan de tratamiento.", "El ticket muestra dos veces la plantilla."],
    evento_adverso_infeccion: ["Enrojecimiento y secreción en el canal ungueal tres días después del procedimiento.", "Ampolla por calor en el antepié tras la sesión de láser."],
    trato_personal: ["Considera que la recepción le habló de forma brusca al pedir su factura.", "Siente que no le explicaron el procedimiento antes de iniciar."],
    instrumental_higiene: ["Vio que el consultorio no se limpió entre un paciente y otro.", "Pregunta si el instrumental se esteriliza; no vio que abrieran la bolsa."],
    otro: ["No encontró estacionamiento y el personal no supo orientarle.", "La app de recordatorios le mandó la cita a otra sucursal."],
  };
  const tipos = Object.keys(TXT_Q);
  for (let i = 0; i < 34; i++) {
    const tipo = tipos[i % tipos.length];
    const clase = ["evento_adverso_infeccion", "dolor_posterior"].includes(tipo) && i % 2 === 0 ? "evento_adverso" : "administrativa";
    const dias = -[0, 1, 2, 3, 4, 6, 9, 13, 18, 25, 33, 41, 55, 70][i % 14];
    const co = base.consultas[(i * 37) % base.consultas.length];
    const sucursalId = clase === "evento_adverso" ? co.sucursalId : base.sucursales[i % 7].id;
    const fecha = DT(dias, 10 + (i % 8), (i * 7) % 60);
    const limite = fechaLimite(fecha, 3);
    let estado = dias >= -2 ? pick(["nueva", "en_proceso"]) : dias >= -6 ? pick(["en_proceso", "escalada", "resuelta"]) : pick(["resuelta", "cerrada", "cerrada"]);
    if (i === 5) estado = "en_proceso"; // vencida y abierta, para el semáforo rojo
    const g = gerenteDe(sucursalId);
    const q = {
      id: id("QJ"), folio: folio("QJ"), fecha, sucursalId, pacienteId: clase === "evento_adverso" ? co.pacienteId : (i % 6 === 5 ? null : base.pacientes[(i * 13) % base.pacientes.length].id),
      consultaId: clase === "evento_adverso" || i % 4 === 1 ? co.id : null, podologoId: clase === "evento_adverso" ? co.podologoId : null,
      clase, tipo, gravedad: clase === "evento_adverso" ? pick(["media", "alta"]) : pick(["baja", "media", "media"]), canal: pick(["presencial", "llamada", "whatsapp", "correo"]),
      descripcion: TXT_Q[tipo][i % 2], estado, responsableId: g.id, fechaCompromiso: limite, limite, registradaPor: recepDe(sucursalId).id,
      resolucion: ["resuelta", "cerrada"].includes(estado) ? pick(["Se revisó al paciente sin costo y se ajustó el tratamiento.", "Se ofreció disculpa y se corrigió el ticket.", "Se reforzó con el personal el protocolo de puntualidad.", "Se explicó el proceso de esterilización y se mostró el registro del lote."]) : "",
      resueltaEn: ["resuelta", "cerrada"].includes(estado) ? F(dias + (i % 5 === 0 ? 5 : int(0, 3))) : null, cerradaEn: estado === "cerrada" ? F(dias + 5) : null,
      compensacion: null, seguimiento: [{ fecha, por: recepDe(sucursalId).id, texto: "Queja registrada." }],
    };
    if (i % 5 === 2) q.compensacion = { tipo: "consulta_sin_costo", monto: 0, estado: i % 10 === 2 ? "propuesta" : "autorizada", propuestaPor: g.id, en: F(dias + 1), ...(i % 10 === 2 ? {} : { autorizadaPor: adm.id, autorizadaEn: F(dias + 2) }) };
    if (i % 7 === 3) q.compensacion = { tipo: "reembolso", monto: [350, 450, 700][i % 3], estado: "propuesta", propuestaPor: g.id, en: F(dias + 1) };
    if (i % 9 === 4) q.compensacion = { tipo: "disculpa", monto: 0, estado: "autorizada", propuestaPor: g.id, autorizadaPor: g.id, en: F(dias + 1) };
    if (estado === "escalada") q.seguimiento.push({ fecha: F(dias + 1), por: g.id, texto: "Escalada a Administración por gravedad." });
    quejas.push(q);
  }
  const arco = [];
  const TXT_A = {
    acceso: "Solicita copia de su expediente clínico completo, incluidas las fotografías.",
    rectificacion: "Pide corregir su fecha de nacimiento y su segundo apellido.",
    cancelacion: "Solicita que se eliminen sus datos de contacto de las campañas.",
    oposicion: "Se opone a que se usen sus fotografías con fines de enseñanza.",
  };
  Object.keys(TXT_A).forEach((derecho, k) => {
    [0, 1, 2].forEach((j) => {
      const dias = -[1, 8, 17, 26, 40][(k + j) % 5];
      const fecha = DT(dias, 12, 0);
      const s = base.sucursales[(k * 3 + j) % 7].id;
      const estado = dias >= -17 ? (j === 0 ? "recibida" : "en_proceso") : pick(["atendida", "atendida", "rechazada"]);
      arco.push({
        id: id("AR"), folio: folio("ARCO"), fecha, sucursalId: s, pacienteId: base.pacientes[(k * 29 + j * 11) % base.pacientes.length].id, derecho, descripcion: TXT_A[derecho],
        medio: pick(["correo", "presencial"]), identidadVerificada: j !== 0, estado, limite: fechaLimite(fecha, 20), registradaPor: recepDe(s).id,
        atendidaEn: ["atendida", "rechazada"].includes(estado) ? F(dias + int(5, 22)) : null, atendidaPor: ["atendida", "rechazada"].includes(estado) ? dir.id : null,
        respuesta: estado === "atendida" ? "Se entregó la información solicitada por correo cifrado." : estado === "rechazada" ? "No se acreditó la identidad del titular." : "",
      });
    });
  });

  // ═════════ Seguimiento de pacientes (CRM)
  // Visitas previas a la demostración (la semilla de citas solo cubre una semana): de 20 días a 2 años atrás
  const visitasPrevias = {};
  base.pacientes.forEach((p, i) => { if (i % 9 !== 8) visitasPrevias[p.id] = F(-[20, 45, 90, 150, 185, 200, 240, 300, 400, 520, 700][i % 11] - int(0, 9)); });
  const noContactar = [base.pacientes[17].id, base.pacientes[58].id];
  // Las solicitudes ARCO de cancelación u oposición (atendidas) excluyen al paciente del contacto
  arco.filter((a) => a.derecho === "cancelacion" && a.estado === "atendida").forEach((a) => { if (!noContactar.includes(a.pacienteId)) noContactar.push(a.pacienteId); });
  const contactos = [], campanas = [];
  const inactivos = base.pacientes.filter((p) => visitasPrevias[p.id] && visitasPrevias[p.id] <= F(-180));
  [["Reactivación de otoño", "inactivos", null, "aprobada", -12], ["Revisión anual de pie diabético", "revision_pie", null, "en_curso", -20], ["Planes a medias · Sur", "plan_abandonado", "S3", "borrador", -1], ["Reactivación Polanco", "inactivos", "S6", "terminada", -60]].forEach(([nombre, segmento, suc, estado, dias], k) => {
    const g = suc ? gerenteDe(suc) : adm;
    const dest = (segmento === "inactivos" ? inactivos.filter((p) => !suc || p.sucursalAlta === suc) : segmento === "revision_pie" ? diabeticos : planesTrat.filter((x) => x.estado === "abandonado" && (!suc || x.sucursalId === suc)).map((x) => pacPorId.get(x.pacienteId)))
      .filter((p) => p && !noContactar.includes(p.id)).slice(0, 40).map((p) => p.id);
    campanas.push({
      id: id("CA"), folio: folio("CAM"), nombre, segmento, sucursalId: suc, mensaje: null, estado, creadaPor: g.id, creada: F(dias), destinatarios: dest,
      aprobadaPor: estado === "borrador" ? null : adm.id, aprobadaEn: estado === "borrador" ? null : F(dias + 1), terminadaEn: estado === "terminada" ? F(dias + 25) : null,
    });
  });
  campanas.filter((c) => ["en_curso", "terminada", "aprobada"].includes(c.estado)).forEach((c, ci) => {
    c.destinatarios.forEach((pid, k) => {
      if (c.estado === "aprobada" && k > 6) return;
      if (c.estado === "en_curso" && k % 3 === 2) return;
      const p = pacPorId.get(pid);
      const s = c.sucursalId || p.sucursalAlta;
      const quien = recepDe(s) || gerenteDe(s);
      const res = pick(["agendo", "contactado", "sin_respuesta", "sin_respuesta", "no_interesado", "agendo", "numero_equivocado"]);
      contactos.push({ id: id("CT"), pacienteId: pid, fecha: DT(-int(0, 10) - (c.estado === "terminada" ? 40 : 0), 10 + (k % 8), (k * 13) % 60), canal: p.whatsapp && k % 4 ? "whatsapp" : "telefono", resultado: res, nota: res === "agendo" ? "Agendó revisión la próxima semana." : res === "contactado" ? "Lo consultará con su familia." : "", usuarioId: quien.id, sucursalId: s, campanaId: c.id, segmento: c.segmento });
    });
  });
  // Contactos sueltos (sin campaña): recordatorio de plan abandonado
  planesTrat.filter((x) => x.estado === "abandonado").slice(0, 6).forEach((x, k) => {
    const quien = recepDe(x.sucursalId);
    contactos.push({ id: id("CT"), pacienteId: x.pacienteId, fecha: DT(-k - 2, 12, 15), canal: "telefono", resultado: k % 2 ? "sin_respuesta" : "contactado", nota: "Se le recordó retomar su tratamiento.", usuarioId: quien.id, sucursalId: x.sucursalId, campanaId: null, segmento: "plan_abandonado" });
  });

  return {
    clinica: { params: {} },
    plantillasPlan, planesTrat, pieDiabetico, plantillasOrto, quejas, arco,
    crm: { visitasPrevias, contactos, campanas, noContactar },
    ciclos: [...base.ciclos, ...ciclosNuevos],
    usoSets: [...(base.usoSets || []), ...usoSets],
  };
}
