// Dominio «Pie Clinic» (demo para los dueños): se registra al final de la lista para no alterar el orden del generador aleatorio.
//  · Reescala el histórico mensual a la meta de $200,000 por sucursal y le impone una TENDENCIA A LA BAJA en los últimos 4 meses, distinta por sucursal.
//  · Agrega nuevos/recurrentes al histórico y la venta por marca y línea (d.histLineas) para el margen del tablero.
//  · Da a cada paciente primera/última visita: hay pacientes «dormidos» (sin visita en 3, 6 y 12 meses) para campañas de reactivación.
// Todo es ficticio y determinista (usa util.r). Los campos nuevos son opcionales: ningún otro dominio depende de ellos.
export const META_MENSUAL = 200000;

// Caída acumulada del último mes frente al mes previo a la baja (por id de sucursal): cada sucursal baja distinto.
const CAIDA = { S1: 0.24, S2: 0.11, S3: 0.31, S4: 0.06, S5: 0.17, S6: 0.03, S7: 0.14 };
// Proporción de costo por marca (margen distinto por marca).
const COSTO_MARCA = { "Pie Clinic Lab": 0.33, "Apex Mobility": 0.62, Podoflex: 0.56, DermaPie: 0.47, OrtoSoft: 0.45 };

/** Reescala el histórico a la meta y le impone la baja. index.js lo llama ANTES de los demás dominios (metas, finanzas y DW leen d.hist). */
export function ajustarHist(base, { r }) {
  base.hist.forEach((h) => {
    const k = 12 - base.hist.filter((x) => x.sucursalId === h.sucursalId).findIndex((x) => x.mes === h.mes); // 12 … 1 (1 = el mes más reciente)
    let f = 0.8;                                                                                              // 250,000 → 200,000 de base
    if (k <= 4) f *= 1 - (CAIDA[h.sucursalId] ?? 0.1) * ((5 - k) / 4);
    ["servicios", "plantillas", "productos", "costo"].forEach((c) => { h[c] = Math.round((h[c] * f) / 100) * 100; });
    h.pacientes = Math.round((h.servicios + h.plantillas + h.productos) / 520);
    const shareNuevos = (k <= 4 ? 0.2 - 0.025 * (5 - k) : 0.3) + (r() - 0.5) * 0.04;        // entran menos pacientes nuevos cuando baja la venta
    h.nuevos = Math.round(h.pacientes * shareNuevos);
    h.recurrentes = h.pacientes - h.nuevos;
  });
}

export function seed(base, { r, int, F }) {

  // ───────── Venta por marca y línea (productos y plantillas del histórico)
  const histLineas = [];
  base.hist.forEach((h) => {
    const w = (x) => x * (0.92 + r() * 0.16);
    const reparto = [
      ["Pie Clinic Lab", "Plantillas a medida", h.plantillas * 0.72], ["Pie Clinic Lab", "Plantillas diabético", h.plantillas * 0.28],
      ["Apex Mobility", "Movilidad", h.productos * 0.38], ["Podoflex", "Calzado ortopédico", h.productos * 0.24],
      ["OrtoSoft", "Soportes", h.productos * 0.22], ["DermaPie", "Cuidado de la piel", h.productos * 0.16],
    ];
    reparto.forEach(([marca, linea, ing]) => {
      const ingreso = Math.round(w(ing) / 10) * 10;
      histLineas.push({ sucursalId: h.sucursalId, mes: h.mes, marca, linea, ingreso, costo: Math.round(ingreso * (COSTO_MARCA[marca] ?? 0.5) * (0.97 + r() * 0.06)) });
    });
  });

  // ───────── Pacientes: origen, primera/última visita y «dormidos»
  base.pacientes.forEach((p) => {
    const u = r();
    let ultimaAgo, segmento;
    if (u < 0.5) { ultimaAgo = int(1, 75); segmento = "activo"; }
    else if (u < 0.68) { ultimaAgo = int(95, 175); segmento = "dormido_3m"; }
    else if (u < 0.84) { ultimaAgo = int(185, 360); segmento = "dormido_6m"; }
    else { ultimaAgo = int(370, 540); segmento = "dormido_12m"; }
    const nuevo = segmento === "activo" && r() < 0.35;
    const primeraAgo = nuevo ? Math.min(ultimaAgo + int(0, 20), 75) : ultimaAgo + int(40, 700);
    p.ultimaVisita = F(-ultimaAgo);
    p.primeraVisita = F(-primeraAgo);
    p.segmento = segmento;
    p.visitas = nuevo ? 1 : int(2, 14);
  });

  // ───────── Capacitación: biblioteca de videos de procedimientos, con evaluación y calificación por podólogo
  // (los videos son de muestra: `youtube: null` hasta que Pie Clinic entregue los suyos; ahí se pega el enlace).
  const L = (n, titulo, minutos, o = {}) => ({ id: `L${n}`, titulo, minutos, video: true, youtube: null, texto: o.texto || "", pasos: (o.pasos || []).map((t) => ({ t, foto: null })), checklist: o.checklist || [], docTitulo: "", docUrl: null });
  const Q = (p, opciones, correcta) => ({ p, opciones, correcta });
  const cursoPod = (id, titulo, resumen, lecciones, preguntas) => ({
    id, titulo, categoria: "Procedimientos", resumen, asignado: { roles: ["podologo"], personas: [], nuevos: false }, ruta: null, lecciones,
    evaluacion: { minimo: 80, preguntas }, estado: "publicado", borrador: false, creadoPor: base.usuarios.find((u) => u.rol === "admin")?.id, fecha: F(-40), revision: F(-40), version: 1,
  });
  const nuevosCursos = [
    cursoPod("CP1", "Uña encarnada: espiculotomía", "Video del procedimiento paso a paso, con indicaciones y señales de alarma.", [
      L(1, "Video: valoración y anestesia", 7, { texto: "Valoración del borde, grado de inflamación y anestesia local." }),
      L(2, "Video: espiculotomía", 9, { pasos: ["Antisepsia", "Corte de la espícula", "Hemostasia y apósito", "Indicaciones de calzado"] }),
      L(3, "Video: indicaciones y seguimiento", 5, { checklist: ["Curación a los 3 días", "Calzado amplio", "Señales de infección"] }),
    ], [Q("Antes de la espiculotomía se realiza…", ["Antisepsia y anestesia local", "Nada", "Solo cortar la uña"], 0), Q("La primera curación se programa a…", ["30 días", "3 días", "No se programa"], 1), Q("Es señal de alarma que obliga a revisar antes de la cita…", ["Enrojecimiento que se extiende y supuración", "Leve molestia al caminar", "Uña más corta"], 0)]),
    cursoPod("CP2", "Extracción de uña con curaciones +3, +7 y +14", "Técnica de extracción y calendario de curaciones que el sistema agenda solo.", [
      L(1, "Video: indicación y consentimiento", 6, { texto: "Cuándo extraer y qué firma el paciente." }),
      L(2, "Video: extracción", 10, { pasos: ["Anestesia troncular", "Despegar y retirar", "Hemostasia", "Apósito"] }),
      L(3, "Video: curaciones +3, +7 y +14", 6, { checklist: ["+3 días", "+7 días", "+14 días", "Registrar evolución en la consulta"] }),
    ], [Q("Las curaciones de una extracción son a…", ["+3, +7 y +14 días", "Solo una a los 30 días", "Ninguna"], 0), Q("El consentimiento informado se firma…", ["Después", "Antes del procedimiento", "No se firma"], 1), Q("La anestesia indicada para la extracción es…", ["General", "Troncular digital", "Ninguna"], 1)]),
    cursoPod("CP3", "Estudio de pisada y plantillas a medida", "Toma de huella, material (piel, pelite, plastazote) y envío al laboratorio externo.", [
      L(1, "Video: estudio de pisada", 8, { texto: "Toma de huella y análisis de apoyo." }),
      L(2, "Video: elección de material", 6, { checklist: ["Piel", "Pelite", "Plastazote"] }),
      L(3, "Video: orden al laboratorio externo", 5, { pasos: ["Capturar medidas", "Elegir material", "Anticipo", "Entrega en 5 días"] }),
    ], [Q("Las plantillas a medida se fabrican en…", ["La sucursal", "Laboratorio externo", "El almacén central"], 1), Q("Materiales disponibles…", ["Piel, pelite y plastazote", "Solo piel", "Solo plástico"], 0), Q("La entrega de plantillas al paciente es en…", ["El mismo día", "5 días", "2 meses"], 1)]),
  ];
  base.cap.cursos.push(...nuevosCursos);
  let nAv = base.cap.avance.length;
  base.usuarios.filter((u) => u.rol === "podologo").forEach((u) => {
    nuevosCursos.forEach((c) => {
      const x = r();
      if (x < 0.15) return;                                         // aún no lo empieza
      const completo = x > 0.35;
      const calif = completo ? 62 + int(0, 38) : null;             // calificación por podólogo (hay quien reprueba)
      const aprobado = completo && calif >= c.evaluacion.minimo;
      base.cap.avance.push({ id: `AV${++nAv}`, usuarioId: u.id, cursoId: c.id, sucursalId: u.sucursales[0], vistas: completo ? c.lecciones.map((l) => l.id) : [c.lecciones[0].id],
        evaluaciones: completo ? [{ fecha: F(-int(2, 90)), calif }] : [], aprobado, completado: aprobado ? F(-int(2, 90)) : null, constancia: aprobado ? `CT-P${nAv}` : null, ult: F(-int(1, 30)) });
    });
  });

  return { histLineas, whatsapp: [], entradasCentral: [], casosDemo: [], campanasReactivacion: [], pieClinic: { marca: "Pie Clinic", metaMensual: META_MENSUAL, version: 1 } };
}
