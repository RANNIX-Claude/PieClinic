// Dominio «expediente» (incorporado de Pie Firme): semilla de datos de demostración. seed(base, util) → objeto que se mezcla en el estado.
// Posee d.exp = { antecedentes, sensibles, alergias, medicamentos, exploracionMI, hallazgos, fotos, plantillas, firmados, emitidos, aperturas,
//                 fusiones, cedulas, versiones } y agrega campos OPCIONALES a d.consultas (firma, adendas, excepcionAviso). Todo es ficticio.
import { PLANTILLAS_BASE, variablesDe, huella, textoNota, calcularEdad, centroZona, nombreCompleto } from "../reglas_expediente.js";

const TXT_ADENDA = [
  "Se aclara que el procedimiento se realizó en el pie derecho; en la nota se omitió el lado.",
  "Paciente llama al día siguiente: refiere dolor leve que cede con analgésico. Se mantiene la indicación.",
  "Se corrige la dosis indicada del antimicótico tópico: aplicar dos veces al día, no una.",
  "Se agrega que el paciente acudió acompañado por un familiar, quien recibió las indicaciones de cuidado.",
  "El paciente entregó resultado de glucosa en ayuno posterior a la consulta: 138 mg/dl. Se anexa al expediente.",
  "Aclaración: la próxima revisión es en dos semanas, no en un mes como quedó escrito.",
];
const MOTIVOS = ["Uña encarnada con dolor al caminar", "Engrosamiento y cambio de color de las uñas", "Callosidad dolorosa en la planta", "Revisión de pie diabético", "Verruga plantar que no cede", "Dolor en el talón por las mañanas", "Resequedad y fisuras en talones", "Corte de uñas de difícil manejo"];
const SINTOMAS = ["Dolor al apoyar, sin secreción", "Ardor y comezón entre los dedos", "Dolor punzante al usar calzado cerrado", "Sin dolor; solo cambio de aspecto", "Enrojecimiento e inflamación del borde ungueal", "Sensación de hormigueo ocasional"];
const CALZADO = ["Tenis deportivo", "Zapato de vestir", "Bota industrial con casquillo", "Sandalia abierta", "Zapato escolar", "Calzado ortopédico"];
const DEPORTES = ["Caminata", "Fútbol", "Natación", "Ciclismo", "Zumba", "Correr"];
const ENF_FAM = ["Diabetes", "Hipertensión", "Diabetes e hipertensión", "Cardiopatía", "Artritis"];
const MEDS = ["Metformina 850 mg cada 12 h", "Losartán 50 mg cada 24 h", "Glibenclamida 5 mg cada 24 h", "Atorvastatina 20 mg por la noche", "Enalapril 10 mg cada 12 h", "Insulina glargina 18 U por la noche"];
const ALERG = [["Penicilina", "Ronchas", "moderada"], ["Yodo", "Enrojecimiento local", "leve"], ["Sulfas", "Erupción", "moderada"], ["Cinta adhesiva", "Irritación de la piel", "leve"], ["Lidocaína", "Mareo e hipotensión", "grave"]];
const COMENTARIOS = ["Borde lateral del primer dedo", "Lámina ungueal engrosada", "Hiperqueratosis en cabeza metatarsiana", "Fisura en talón", "Lesión plantar puntiforme", "Control posterior a la curación"];
const MOTIVOS_RETIRO = ["Foto desenfocada", "Se tomó del pie equivocado", "El paciente pidió retirarla"];

export function seed(base, util) {
  const { r, int, pick, F, DT, id } = util;
  const hoy = new Date();
  const pods = base.usuarios.filter((u) => u.rol === "podologo");
  const admin = base.usuarios.find((u) => u.rol === "admin");
  const recs = base.usuarios.filter((u) => u.rol === "recepcion");
  const tiene = (p, re) => (p.alertas || []).some((a) => re.test(a));
  const consultasDe = (pid) => base.consultas.filter((c) => c.pacienteId === pid && c.estado !== "abierta");
  const exp = { antecedentes: {}, sensibles: {}, alergias: [], medicamentos: [], exploracionMI: {}, hallazgos: [], fotos: [], plantillas: [], firmados: [], emitidos: [], aperturas: [], fusiones: [], cedulas: {}, versiones: {} };

  pods.forEach((u, i) => { exp.cedulas[u.id] = String(4180000 + i * 7919 + int(100, 999)); });

  // ───────── Plantillas con versión (N-06): la de consentimiento y el aviso ya tuvieron un cambio de versión
  const plantilla = (codigo, nombre, contenido, forma, version, estado, dias) => {
    const p = { id: id("PD"), codigo, nombre, version, estado, contenido, variables: variablesDe(contenido), forma, pendienteLegal: true, vigenteDesde: estado === "borrador" ? null : F(dias), creadaPor: admin.id, creada: F(dias - 2) };
    exp.plantillas.push(p); return p;
  };
  for (const [codigo, nombre, contenido, forma] of PLANTILLAS_BASE) {
    if (codigo === "aviso_privacidad" || codigo === "consentimiento_procedimiento_podologico") {
      plantilla(codigo, nombre, contenido.replace("Puede ejercer sus derechos", "Usted puede ejercer sus derechos").replace("; tengo derecho a una segunda opinión y a retirar mi consentimiento", ""), forma, 1, "archivada", -420);
      plantilla(codigo, nombre, contenido, forma, 2, "activa", -150);
      if (codigo !== "aviso_privacidad") plantilla(codigo, nombre, contenido + "\n\nDeclaro que informé al podólogo de mis enfermedades, alergias y medicamentos.", forma, 3, "borrador", 0);
    } else plantilla(codigo, nombre, contenido, forma, 1, "activa", -420);
  }
  const versionEn = (codigo, fecha) => (exp.plantillas.filter((p) => p.codigo === codigo && p.estado !== "borrador" && p.vigenteDesde <= fecha).sort((a, b) => b.version - a.version)[0] || exp.plantillas.find((p) => p.codigo === codigo));

  // Firma de demostración: un trazo SVG muy ligero (las firmas reales son la imagen del lienzo)
  const trazo = () => {
    let x = 6, dd = "M6 22";
    for (let k = 0; k < 6; k++) { x += int(10, 18); dd += ` Q${x - int(4, 9)} ${int(2, 38)} ${x} ${int(12, 30)}`; }
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><path d="${dd}" fill="none" stroke="#1f2330" stroke-width="1.6" stroke-linecap="round"/></svg>`)}`;
  };
  const firmar = (pac, codigo, fecha, extra = {}) => {
    const pl = versionEn(codigo, fecha.slice(0, 10));
    const menor = (calcularEdad(pac.nacimiento, fecha) ?? 99) < 18;
    const porTutor = extra.firmanteTipo ? extra.firmanteTipo === "tutor" : menor;
    const enPapel = fecha.slice(0, 10) < F(-200);
    const x = {
      id: id("FD"), folio: util.folio("DOC"), pacienteId: pac.id, codigo, nombre: pl.nombre, version: pl.version, huella: huella(pl.contenido), fecha,
      canal: enPapel ? "papel_escaneado" : "firma_pantalla", firmanteTipo: porTutor ? "tutor" : "paciente",
      nombreFirmante: porTutor ? (pac.tutor?.nombre || extra.tutor || "Tutor") : nombreCompleto(pac), parentesco: porTutor ? (pac.tutor?.parentesco || "Madre") : null,
      imagen: enPapel ? null : trazo(), registradoPor: pick(recs).id, sucursalId: pac.sucursalAlta, dispositivo: enPapel ? "Formato en papel (migrado)" : "Tableta de recepción", estado: "firmado",
    };
    exp.firmados.push(x); return x;
  };

  // ───────── Pacientes sin aviso firmado (P-004): se les atendió en urgencia; sus notas quedan con «firma pendiente»
  const sinAviso = base.pacientes.filter((p) => (calcularEdad(p.nacimiento, hoy) ?? 0) >= 18 && consultasDe(p.id).length >= 2).slice(3, 6);
  sinAviso.forEach((p) => { p.avisoFirmado = false; p.consentimientoFirmado = false; });
  const idsSinAviso = new Set(sinAviso.map((p) => p.id));

  // ───────── Antecedentes, dato sensible, alergias, medicamentos, exploración y documentos por paciente
  const adultosJovenes = base.pacientes.filter((p) => { const e = calcularEdad(p.nacimiento, hoy); return e !== null && e >= 18 && e <= 20; });
  const reFirma = new Set((adultosJovenes.length ? adultosJovenes : [...base.pacientes].filter((p) => (calcularEdad(p.nacimiento, hoy) ?? 0) >= 18).sort((a, b) => b.nacimiento.localeCompare(a.nacimiento)).slice(0, 2)).map((p) => p.id));
  const tri = (pSi, pNs = 0.04) => { const x = r(); return x < pSi ? "si" : x < pSi + pNs ? "no_sabe" : "no"; };

  base.pacientes.forEach((p, i) => {
    const edad = calcularEdad(p.nacimiento, hoy) ?? 40;
    const alta = -int(40, 900);
    exp.versiones[p.id] = 1 + consultasDe(p.id).length + int(0, 2);

    if (!idsSinAviso.has(p.id)) {
      const fAlta = DT(alta, int(9, 18), pick([0, 10, 20, 30, 40, 50]));
      if (reFirma.has(p.id)) {
        // Firmó el tutor cuando era menor: al cumplir 18 se pide nueva firma del propio paciente (P-005)
        const hace = DT(-int(400, 800), 11, 20), ex = { firmanteTipo: "tutor", tutor: util.nom(true) };
        firmar(p, "aviso_privacidad", hace, ex); firmar(p, "consentimiento_datos_salud", hace, ex);
      } else { firmar(p, "aviso_privacidad", fAlta); firmar(p, "consentimiento_datos_salud", fAlta); }
      const cs = consultasDe(p.id);
      if (cs.length && !reFirma.has(p.id)) firmar(p, "consentimiento_procedimiento_podologico", cs[0].fecha);
    }

    if (r() < 0.88) {
      const diab = tiene(p, /Diabetes/), hta = tiene(p, /Hipertensi/), antico = tiene(p, /Anticoagulado/), neuro = tiene(p, /Neuropat/), alerg = (p.alertas || []).find((a) => /^Alergia/.test(a));
      const a = { diabetes: diab ? "si" : edad < 30 ? "no" : tri(0.02, 0.08), hipertension: hta ? "si" : edad < 30 ? "no" : tri(0.1), artritis: edad > 60 ? tri(0.2) : "no", obesidad: tri(0.14, 0), traumaticos: tri(0.12, 0), varices: edad > 45 ? tri(0.25) : "no", otras_enfermedades: tri(0.06, 0) };
      if (a.diabetes === "si") Object.assign(a, { diabetes_tipo: diab ? "tipo2" : pick(["tipo2", "prediabetes"]), diabetes_anios_evolucion: int(1, 22), hba1c: Number((6.2 + r() * 3).toFixed(1)), hba1c_fecha: F(-int(20, 160)), diabetes_tratamiento: pick(["Metformina", "Metformina + glibenclamida", "Insulina"]), medico_tratante: `Dr. ${util.nom(false)}`, medico_especialidad: pick(["Medicina interna", "Endocrinología", "Medicina familiar"]), ultima_glucosa_fecha: F(-int(1, 40)), ultima_glucosa_texto: `${int(98, 210)} mg/dl` });
      if (a.traumaticos === "si") a.traumaticos_detalle = pick(["Esguince de tobillo derecho", "Fractura del 5.º metatarsiano (2019)", "Fractura de tibia en la infancia"]);
      if (a.otras_enfermedades === "si") a.otras_enfermedades_detalle = pick(["Hipotiroidismo", "Gastritis", "Asma", "Insuficiencia renal en control"]);
      if (alerg) { a.alergicos = "si"; a.alergicos_detalle = alerg.replace(/^Alergia:\s*/, ""); exp.alergias.push({ id: id("AL"), pacienteId: p.id, sustancia: a.alergicos_detalle.replace(/^./, (c) => c.toUpperCase()), reaccion: "Dermatitis de contacto", gravedad: "moderada", vigente: true }); }
      else if (r() < 0.1) { const al = pick(ALERG); a.alergicos = "si"; a.alergicos_detalle = al[0]; exp.alergias.push({ id: id("AL"), pacienteId: p.id, sustancia: al[0], reaccion: al[1], gravedad: al[2], vigente: true }); }
      else a.alergicos = "no";
      if (neuro) a.neuropatia = "si";
      if (antico) { a.anticoagulacion = "si"; exp.medicamentos.push({ id: id("ME"), pacienteId: p.id, nombre_dosis: pick(["Warfarina 5 mg cada 24 h", "Rivaroxabán 20 mg cada 24 h", "Apixabán 5 mg cada 12 h"]), anticoagulante: true, vigente: true }); }
      if (a.diabetes === "si" || a.hipertension === "si") {
        const m = a.diabetes === "si" ? pick([MEDS[0], MEDS[0], MEDS[2], MEDS[5]]) : pick([MEDS[1], MEDS[4]]);
        exp.medicamentos.push({ id: id("ME"), pacienteId: p.id, nombre_dosis: m, anticoagulante: false, vigente: true });
        if (r() < 0.4) exp.medicamentos.push({ id: id("ME"), pacienteId: p.id, nombre_dosis: MEDS[3], anticoagulante: false, vigente: true });
      }
      const meds = exp.medicamentos.filter((m) => m.pacienteId === p.id);
      a.toma_medicamentos = meds.length ? "si" : "no";
      if (meds.length) a.medicamentos_texto = meds.map((m) => m.nombre_dosis).join("; ");
      if (edad > 25 && r() < 0.6) { a.hf_padre = pick(ENF_FAM); if (r() < 0.6) a.hf_madre = pick(ENF_FAM); if (r() < 0.2) a.hf_hermanos = pick(ENF_FAM); }
      Object.assign(a, { tabaquismo: edad < 16 ? "no" : tri(0.16, 0), alcoholismo: edad < 16 ? "no" : tri(0.07, 0), toxicomanias: "no", deporte: tri(0.35, 0), tipo_calzado: pick(CALZADO), numero_calzado: edad < 12 ? int(17, 22) : p.sexo === "F" ? int(22, 26) : int(25, 29), motivo_consulta_inicial: pick(MOTIVOS), sintomas_iniciales: pick(SINTOMAS) });
      if (a.deporte === "si") a.deporte_detalle = pick(DEPORTES);
      if (edad > 50 && r() < 0.15) a.insuficiencia_venosa = "si";
      if (p.sexo === "F" && edad > 20 && edad < 40 && r() < 0.05) a.embarazo = "si";
      a.actualizado = F(alta + int(0, 30)); a.actualizadoPor = pick(pods).id;
      exp.antecedentes[p.id] = a;
      // Dato muy sensible (N-04): vive aparte de los antecedentes
      const x = r();
      if (x < 0.78) exp.sensibles[p.id] = { vih: i % 53 === 7 ? "si" : x < 0.7 ? "no" : "no_sabe", nota: i % 53 === 7 ? "En tratamiento antirretroviral; carga indetectable según refiere." : "", actualizadoPor: a.actualizadoPor, fecha: a.actualizado };
    }

    // Exploración de miembro inferior (5 siluetas por pierna + reverso «por validar», N-02)
    if (consultasDe(p.id).length && r() < 0.55) {
      const pierna = () => ({ siluetas: [pick(["normal", "normal", "normal", "genu_valgum", "genu_varum", "genu_recurvatum", "genu_flexum"])], rotacion: pick(["neutra", "neutra", "interna", "externa"]), talalgias: pick(["no", "no", "si"]), tipo_pie: pick(["normal", "plano", "cavo", "valgo", "varo"]), huella_plantar: pick(["Normal", "Aumentada en mediopié", "Disminuida en arco", ""]), notas: "" });
      const c0 = consultasDe(p.id)[0];
      exp.exploracionMI[p.id] = { D: pierna(), I: pierna(), fecha: c0.fecha, porId: c0.podologoId };
    }

    // Mapa del pie: marcas numeradas según el diagnóstico de sus consultas
    const dx = consultasDe(p.id).map((c) => c.diagnostico).join(" ");
    let n = 0;
    const marca = (pie, vista, zona, tipo, nota) => { const c0 = consultasDe(p.id)[0]; exp.hallazgos.push({ id: id("HZ"), pacienteId: p.id, numero: ++n, pie, vista, zona, marca: tipo, ...centroZona(pie, vista, zona), nota, fecha: c0.fecha, porId: c0.podologoId }); };
    if (/B35\.1/.test(dx)) { const pie = pick(["D", "I"]); marca(pie, "dorsal", "una1", "ungueal", "Onicomicosis distal"); if (r() < 0.5) marca(pie, "dorsal", pick(["una2", "una5"]), "ungueal", "Cambio de coloración"); }
    if (/L60\.0/.test(dx)) marca(pick(["D", "I"]), "dorsal", "dedo1", "lesion", "Onicocriptosis del borde lateral");
    if (/L84/.test(dx)) { marca(pick(["D", "I"]), "plantar", pick(["mt1", "mt2", "mt5"]), "lesion", "Heloma plantar"); if (r() < 0.4) marca(pick(["D", "I"]), "plantar", "talon", "lesion", "Hiperqueratosis"); }
    if (/B07/.test(dx)) marca(pick(["D", "I"]), "plantar", pick(["antepie_plantar", "talon", "mt3"]), "lesion", "Verruga plantar");
    if (/E11\.5/.test(dx)) marca(pick(["D", "I"]), "plantar", pick(["mt1", "talon"]), "lesion", "Zona de presión con riesgo de úlcera");
  });

  // ───────── Notas firmadas (P-001), firma pendiente (P-004) y adendas
  const cerradas = base.consultas.filter((c) => c.estado !== "abierta");
  const limite = F(-2);
  cerradas.forEach((c) => {
    if (idsSinAviso.has(c.pacienteId)) return; // sin aviso: no se pudo firmar
    const firmada = String(c.fecha).slice(0, 10) < limite ? r() < 0.93 : r() < 0.5;
    if (firmada) c.firma = { porId: c.podologoId, cedula: exp.cedulas[c.podologoId], fecha: c.fecha, huella: huella(textoNota(c)), imagen: null, canal: "firma_pantalla" };
  });
  // Una de las notas sin aviso ya tiene excepción autorizada por Administración: puede firmarse
  const conExcepcion = cerradas.find((c) => idsSinAviso.has(c.pacienteId));
  if (conExcepcion) conExcepcion.excepcionAviso = { porId: admin.id, fecha: DT(0, 9, 15), motivo: "Urgencia: uña encarnada infectada; el paciente no traía identificación. Firmará el aviso en su siguiente visita." };
  cerradas.filter((c) => c.firma).filter((_, k) => k % 8 === 3).slice(0, 26).forEach((c, k) => {
    const autor = base.usuarios.find((u) => u.id === c.podologoId);
    (c.adendas ||= []).push({ id: id("AD"), fecha: DT(0, int(8, 9), pick([5, 25, 45])), autorId: autor.id, autor: autor.nombre, texto: TXT_ADENDA[k % TXT_ADENDA.length], firmada: true });
    if (k % 9 === 4) c.adendas.push({ id: id("AD"), fecha: DT(0, 10, 40), autorId: autor.id, autor: autor.nombre, texto: TXT_ADENDA[(k + 3) % TXT_ADENDA.length], firmada: true });
  });

  // ───────── Fotos clínicas por sesión (P-007 a P-009). Sin imagen real: `data` nulo y una ilustración según `demo`.
  const conConsulta = base.pacientes.filter((p) => consultasDe(p.id).length && !idsSinAviso.has(p.id));
  const foto = (p, c, dias, momento, grado, extra = {}) => {
    const pie = extra.pie || "D", vista = extra.vista || "dorsal";
    const x = { id: id("FO"), pacienteId: p.id, consultaId: dias === null ? c.id : null, sucursalId: c.sucursalId, pie, vista, zona: extra.zona || (vista === "plantar" ? "mt1" : "una1"), momento, nivel: "clinico", difuminada: false,
      comentario: extra.comentario ?? pick(COMENTARIOS), tomada: dias === null ? c.fecha : DT(dias, int(10, 18), pick([5, 20, 35, 50])), subidaPor: c.podologoId, data: null, demo: { grado, tipo: vista === "plantar" ? "callo" : "una" }, retirada: null };
    exp.fotos.push(x); return x;
  };
  conConsulta.slice(0, 34).forEach((p, k) => {
    const cs = consultasDe(p.id), c = cs[cs.length - 1];
    const ex = { pie: pick(["D", "I"]), vista: k % 3 === 0 ? "plantar" : "dorsal" };
    firmar(p, "autorizacion_fotos_clinicas", DT(-95, 10, 30));
    // tres sesiones anteriores (evolución) + la consulta más reciente
    foto(p, c, -90, "antes", 1, ex); foto(p, c, -90, "despues_inmediato", 0.85, ex);
    foto(p, c, -60, "seguimiento", 0.6, ex);
    if (k % 2 === 0) foto(p, c, -30, "seguimiento", 0.35, ex);
    foto(p, c, null, "despues", 0.15, ex);
    if (k % 5 === 0) foto(p, c, null, "despues", 0.1, { ...ex, vista: "lateral", comentario: "Vista lateral de control" });
  });
  // Una sesión que llegó al límite de 10 fotos (P-007), retiradas (P-008) y docencia con y sin autorización vigente (P-009)
  if (conConsulta[0]) { const p = conConsulta[0], c = consultasDe(p.id).at(-1); for (let k = exp.fotos.filter((x) => x.consultaId === c.id).length; k < 10; k++) foto(p, c, null, "seguimiento", 0.2, { pie: k % 2 ? "I" : "D", vista: pick(["dorsal", "plantar", "medial"]), comentario: `Serie de control ${k + 1}` }); }
  exp.fotos.filter((x) => !x.consultaId).filter((_, k) => k % 31 === 5).slice(0, 4).forEach((x, k) => { x.retirada = { motivo: MOTIVOS_RETIRO[k % 3], porId: x.subidaPor, fecha: DT(-int(1, 20), 12, 0) }; });
  conConsulta.slice(1, 6).forEach((p, k) => {
    const d0 = firmar(p, "autorizacion_fotos_docencia", DT(-80, 11, 0));
    if (k === 4) { d0.estado = "revocado"; d0.revocado = { fecha: DT(-10, 13, 0), porId: admin.id, motivo: "El paciente retiró su autorización por teléfono y lo confirmó por escrito." }; }
    exp.fotos.filter((x) => x.pacienteId === p.id && !x.retirada).slice(0, 2).forEach((x) => { x.nivel = "docencia"; x.difuminada = true; });
  });

  // ───────── Bitácora de impresión del expediente y de aperturas (P-002)
  const TIPOS = ["consentimiento", "antecedentes", "seguimiento", "historia_completa"];
  conConsulta.slice(0, 44).forEach((p, k) => {
    const c = consultasDe(p.id)[0], tipo = TIPOS[k % 4];
    const e = { id: id("EM"), folio: util.folio("IMP"), pacienteId: p.id, tipo, fecha: c.fecha, porId: c.podologoId, sucursalId: c.sucursalId, versionExpediente: Math.max(1, exp.versiones[p.id] - 1), esCopia: false, incluyeSensibles: tipo === "historia_completa" && k % 8 === 3, plantillaVersion: tipo === "consentimiento" ? 2 : null };
    exp.emitidos.push(e);
    if (k % 6 === 2) exp.emitidos.push({ ...e, id: id("EM"), folio: util.folio("IMP"), fecha: DT(0, 9, 30), esCopia: true });
  });
  base.sucursales.slice(0, 3).forEach((s, k) => { // formatos en blanco para el consultorio
    exp.emitidos.push({ id: id("EM"), folio: util.folio("IMP"), pacienteId: null, tipo: "en_blanco", fecha: DT(-k * 3, 8, 10), porId: (recs.find((u) => u.sucursales.includes(s.id)) || recs[0]).id, sucursalId: s.id, versionExpediente: null, esCopia: false, incluyeSensibles: false, plantillaVersion: null });
  });
  cerradas.slice(-110).forEach((c, k) => {
    exp.aperturas.push({ id: id("AX"), pacienteId: c.pacienteId, usuarioId: c.podologoId, rol: "podologo", sucursalId: c.sucursalId, fecha: c.fecha, alcance: "propio", origen: "consulta", motivo: "", notificaAdmin: false });
    if (k % 4 === 0) { const rc = recs.find((u) => u.sucursales.includes(c.sucursalId)) || recs[0]; exp.aperturas.push({ id: id("AX"), pacienteId: c.pacienteId, usuarioId: rc.id, rol: "recepcion", sucursalId: c.sucursalId, fecha: c.fecha.slice(0, 11) + "08:50", alcance: "datos", origen: "expediente", motivo: "", notificaAdmin: false }); }
    if (k % 13 === 6) { const otro = pods.find((u) => u.id !== c.podologoId && !u.sucursales.includes(c.sucursalId)) || pods[0]; exp.aperturas.push({ id: id("AX"), pacienteId: c.pacienteId, usuarioId: otro.id, rol: "podologo", sucursalId: otro.sucursales[0], fecha: DT(-int(0, 6), int(10, 18), 15), alcance: "otra", origen: "expediente", motivo: pick(["Interconsulta solicitada por el podólogo tratante", "El paciente llamó para pedir orientación", "Cubro la agenda del podólogo tratante esta semana"]), notificaAdmin: true }); }
    if (k % 29 === 9) exp.aperturas.push({ id: id("AX"), pacienteId: c.pacienteId, usuarioId: c.podologoId, rol: "podologo", sucursalId: c.sucursalId, fecha: c.fecha, alcance: "propio", origen: "dato_sensible", motivo: "", notificaAdmin: false });
  });
  exp.aperturas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return { exp };
}
