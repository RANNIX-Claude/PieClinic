// Capa de datos · hidratación: base QA → mismas formas del estado `d`, para que las pantallas funcionen sin cambios.
//   leerBase(c)            E/S: lee tablas y vistas con la sesión de la persona (RLS decide qué llega). Un error no tumba lo demás.
//   construirParche(...)   PURO: filas → { parche, origen } (probado en tests/datos.test.js).
//   aplicarParche(d, ...)  PURO sobre el borrador: reemplaza SOLO las colecciones conectadas; el resto sigue con la semilla.
// Regla de dominio: un dominio se aplica solo si TODAS sus consultas salieron bien; si no, se queda en demostración y se anota el error.
import * as M from "./mapas.js";
import { CATALOGO } from "./catalogo.js";

const DIAS_ASISTENCIA = 45;
const diaRel = (n, ref = new Date()) => { const x = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

/** Consultas por nombre. Cada una devuelve una promesa de filas. `t(vista, armar)` pagina; lectura siempre por vistas prp_* cuando existen. */
function consultas(c, todas) {
  const t = (tabla, columnas = "*", f = (q) => q) => todas(() => f(c.from(tabla).select(columnas)));
  return {
    // organización
    sedes: () => t("sedes", "id,clave,nombre,direccion,telefono,activa"),
    perfiles: () => t("perfiles", "id,nombre,apellidos,email,rol,cargo,sedes,activo"),
    directorio: async () => { const { data, error } = await c.rpc("equipo_directorio"); if (error) throw error; return data || []; },
    // personas
    empleados: () => t("prp_empleados"),
    horarios: () => t("prp_horarios_laborales", "empleado_id,dia_semana,entrada,salida,activo"),
    asistencia: () => t("prp_asistencia", "id,sede_id,empleado_id,fecha,hora_entrada,hora_salida,minutos_retardo,estado", (q) => q.gte("fecha", diaRel(-DIAS_ASISTENCIA)).order("fecha").order("id")),
    asignaciones: () => t("prp_empleado_asignaciones", "id,empleado_id,sede_id,fecha,origen", (q) => q.gte("fecha", diaRel(-14)).order("fecha").order("id")),
    movimientos: () => t("prp_empleado_movimientos", "*", (q) => q.order("fecha", { ascending: false }).order("id")),
    incidencias: () => t("prp_incidencias_rh"),
    vacaciones: () => t("prp_vacaciones_detalle"),
    cursos: () => t("prp_cursos"),
    lecciones: () => t("prp_lecciones", "*", (q) => q.order("id")),
    cursoEvaluaciones: () => t("curso_evaluaciones", "id,curso_id,orden,pregunta,opciones,correcta"),
    cursoAvance: () => t("curso_avance", "id,perfil_id,curso_id,leccion_id,completado_en", (q) => q.order("id")),
    cursoResultados: () => t("curso_resultados", "id,perfil_id,curso_id,intento,calificacion,aprobado,realizado_en"),
    acervo: () => t("prp_acervo"),
    // comunicación
    hilos: () => t("prp_com_hilos"),
    hiloMiembros: () => t("com_hilo_miembros", "hilo_id,perfil_id,silenciado", (q) => q.order("id")),
    mensajes: () => t("prp_com_mensajes", "id,hilo_id,autor_id,texto,adjuntos,created_at", (q) => q.order("created_at").order("id")),
    lecturas: () => t("com_mensaje_lecturas", "mensaje_id,perfil_id", (q) => q.order("mensaje_id").order("perfil_id")),
    correosBandeja: () => t("prp_correos_bandeja"),
    correosEnviados: () => t("prp_correos_enviados"),
    correoDestinatarios: () => t("correo_destinatarios", "correo_id,perfil_id,tipo,leido_en,etiquetas,destacado,archivado", (q) => q.order("id")),
    feed: () => t("prp_feed"),
    feedReacciones: () => t("feed_reacciones", "publicacion_id,perfil_id,emoji", (q) => q.order("id")),
    feedComentarios: () => t("prp_feed_comentarios", "id,publicacion_id,autor_id,texto,created_at", (q) => q.order("created_at").order("id")),
    // desempeño
    evaluaciones: () => t("prp_evaluaciones", "id,sede_id,cita_id,paciente_id,podologo_id,calif_servicio,calif_podologo,calif_sucursal,comentario,canal,estado_seguimiento,seguimiento_nota,atendida_por,atendida_en,respondida_en", (q) => q.order("respondida_en", { ascending: false }).order("id")),
    // finanzas
    gruposGasto: () => t("prp_grupos_gasto"),
    gastos: () => t("prp_gastos", "id,sede_id,compartido,fecha,proveedor_nombre,proveedor_texto,grupo_clave,grupo_nombre,total,folio_comprobante,descripcion,origen_captura,origen_modulo,pagado_por_perfil_id,estado", (q) => q.neq("estado", "anulado").order("fecha").order("id")),
    recurrentes: () => t("prp_gastos_recurrentes"),
  };
}

/** Lee todo en paralelo. Devuelve { filas: {nombre: []}, errores: {nombre: "mensaje"} }. */
export async function leerBase(c, todas) {
  const q = consultas(c, todas);
  const nombres = Object.keys(q);
  const res = await Promise.allSettled(nombres.map((n) => q[n]()));
  const filas = {}, errores = {};
  res.forEach((r, i) => { if (r.status === "fulfilled") filas[nombres[i]] = r.value; else { filas[nombres[i]] = null; errores[nombres[i]] = String(r.reason?.message || r.reason); } });
  return { filas, errores };
}

/** Qué consultas necesita cada dominio (si falla una, el dominio entero se queda en demostración). */
export const DEPENDENCIAS = {
  organizacion: ["sedes", "perfiles", "directorio"],
  rh: ["empleados", "horarios", "asistencia", "asignaciones", "movimientos", "incidencias", "vacaciones"],
  cap: ["cursos", "lecciones", "cursoEvaluaciones", "cursoAvance", "cursoResultados", "acervo"],
  com: ["hilos", "hiloMiembros", "mensajes", "lecturas", "correosBandeja", "correosEnviados", "correoDestinatarios", "feed", "feedReacciones", "feedComentarios"],
  eval: ["evaluaciones"],
  fin: ["gruposGasto", "gastos", "recurrentes"],
};

/**
 * PURO. filas (de leerBase) → { parche, origen, sedeHoy }.
 *   parche: colecciones ya con la forma de `d` (solo los dominios completos)
 *   origen: { "rh.empleados": { origen: "qa"|"vacio"|"demo", n, nota? }, … } para TODAS las claves del catálogo
 */
export function construirParche(filas, { yo, errores = {} } = {}) {
  const ms = M.crearMapaSedes(filas.sedes || []);
  const parche = {}, origen = {};
  const falla = (dom) => DEPENDENCIAS[dom].filter((n) => filas[n] == null);
  const marca = (clave, o, n, nota) => { origen[clave] = { origen: o, ...(n != null ? { n } : {}), ...(nota ? { nota } : {}) }; };
  const error = (dom, claves) => { const f = falla(dom); claves.forEach((k) => marca(k, "demo", null, `No se pudo leer de la base (${f.map((n) => `${n}: ${errores[n] || "sin datos"}`).join("; ")}). Sigue en demostración.`)); };

  // ── Organización: sucursales y cuentas
  let sedeHoy = null;
  const dir = filas.directorio || [];
  const dirPorPerfil = new Map(dir.filter((x) => x.perfil_id).map((x) => [x.perfil_id, x]));
  const dirPorEmpleado = new Map(dir.map((x) => [x.empleado_id, x]));
  if (!falla("organizacion").length) {
    parche.sucursales = filas.sedes.map((f) => M.sucursalDeFila(f)).filter(Boolean);
    parche.usuarios = filas.perfiles.map((p) => M.usuarioDePerfil(p, ms, { empleado: dirPorPerfil.get(p.id) || null }));
    marca("sucursales", "qa", parche.sucursales.length);
    marca("usuarios", "qa", parche.usuarios.length);
    const mio = dirPorPerfil.get(yo);
    sedeHoy = mio ? ms.aApp(mio.sede_hoy_id) : null;
  } else error("organizacion", ["sucursales", "usuarios"]);

  // ── Personas: RH
  if (!falla("rh").length) {
    const hor = new Map();
    for (const h of filas.horarios) { const a = hor.get(h.empleado_id); if (a) a.push(h); else hor.set(h.empleado_id, [h]); }
    const empleados = filas.empleados.map((e) => M.empleadoDeFila(e, ms, { cargo: dirPorEmpleado.get(e.id)?.cargo ?? null, horario: M.horarioDeFilas(hor.get(e.id) || []) }));
    const perfilDe = (empleadoId) => empleados.find((e) => e.id === empleadoId)?.usuarioId || dirPorEmpleado.get(empleadoId)?.perfil_id || null;
    const visibles = new Set(empleados.map((e) => e.id));
    const propio = (x) => visibles.has(x.empleadoId); // nunca dejar referencias a empleados que RLS no dejó ver
    parche.rh = {
      empleados,
      asistencia: filas.asistencia.map((a) => M.asistenciaDeFila(a, ms, perfilDe)).filter(propio),
      asignaciones: filas.asignaciones.map((a) => M.asignacionDeFila(a, ms)).filter(propio),
      movimientos: filas.movimientos.map((m) => M.movimientoDeFila(m, ms)).filter(propio),
      incidencias: filas.incidencias.map((i) => M.incidenciaDeFila(i, ms)).filter(propio),
      vacaciones: filas.vacaciones.map((v) => M.vacacionDeFila(v, ms, perfilDe)).filter(propio),
      recibos: [],
    };
    ["empleados", "asistencia", "asignaciones", "movimientos", "incidencias", "vacaciones"].forEach((k) => marca(`rh.${k}`, "qa", parche.rh[k].length));
    marca("rh.recibos", "vacio", 0);
  } else error("rh", ["rh.empleados", "rh.asistencia", "rh.asignaciones", "rh.movimientos", "rh.incidencias", "rh.vacaciones", "rh.recibos"]);

  // ── Personas: capacitación y acervo
  if (!falla("cap").length) {
    parche.cap = {
      cursos: M.cursosDeFilas({ cursos: filas.cursos, lecciones: filas.lecciones, evaluaciones: filas.cursoEvaluaciones }, ms),
      avance: M.avanceDeFilas({ avance: filas.cursoAvance, resultados: filas.cursoResultados }),
      acervo: filas.acervo.map((a) => M.acervoDeFila(a, ms)),
    };
    ["cursos", "avance", "acervo"].forEach((k) => marca(`cap.${k}`, "qa", parche.cap[k].length));
  } else error("cap", ["cap.cursos", "cap.avance", "cap.acervo"]);

  // ── Comunicación
  if (!falla("com").length) {
    parche.com = {
      hilos: M.hilosDeFilas({ hilos: filas.hilos, miembros: filas.hiloMiembros, mensajes: filas.mensajes, lecturas: filas.lecturas }, ms),
      correos: M.correosDeFilas({ bandeja: filas.correosBandeja, enviados: filas.correosEnviados, destinatarios: filas.correoDestinatarios }, yo),
      feed: M.feedDeFilas({ publicaciones: filas.feed, reacciones: filas.feedReacciones, comentarios: filas.feedComentarios }, ms),
    };
    ["hilos", "correos", "feed"].forEach((k) => marca(`com.${k}`, "qa", parche.com[k].length));
  } else error("com", ["com.hilos", "com.correos", "com.feed"]);

  // ── Desempeño: evaluaciones
  if (!falla("eval").length) { parche.eval = filas.evaluaciones.map((e) => M.evaluacionDeFila(e, ms)); marca("eval", "qa", parche.eval.length); }
  else error("eval", ["eval"]);

  // ── Finanzas
  if (!falla("fin").length) {
    const clavePorGrupo = new Map(filas.gruposGasto.map((g) => [g.id, g.clave]));
    const recurrentes = filas.recurrentes.map((r) => M.recurrenteDeFila(r, ms, (id) => clavePorGrupo.get(id)));
    const conRecurrente = new Set(recurrentes.map((r) => r.categoria));
    parche.fin = {
      categorias: filas.gruposGasto.filter((g) => g.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0)).map((g) => M.categoriaDeGrupo(g, conRecurrente)),
      gastos: filas.gastos.map((g) => M.gastoDeFila(g, ms)),
      recurrentes,
    };
    ["categorias", "gastos", "recurrentes"].forEach((k) => marca(`fin.${k}`, "qa", parche.fin[k].length));
  } else error("fin", ["fin.categorias", "fin.gastos", "fin.recurrentes"]);

  // Lo demás del catálogo sigue en demostración.
  CATALOGO.forEach((c) => { if (!origen[c.clave]) marca(c.clave, "demo"); });
  return { parche, origen, sedeHoy };
}

/**
 * PURO sobre el borrador `d`. Reemplaza las colecciones conectadas; conserva todo lo demás.
 * Es idempotente: volver a hidratar sustituye lo de la base y no duplica.
 */
export function aplicarParche(d, { parche, origen, sedeHoy = null }, { perfilId, correo = "", hoy = diaRel(0), ahora = "" } = {}) {
  if (parche.sucursales) d.sucursales = d.sucursales.map((s) => { const q = parche.sucursales.find((x) => x.id === s.id); return q ? { ...s, ...q } : s; });
  if (parche.usuarios) d.usuarios = [...d.usuarios.filter((u) => u.origen !== "qa"), ...parche.usuarios];
  if (parche.rh) d.rh = { ...d.rh, ...parche.rh, params: { ...(d.rh?.params || {}), inicioControl: hoy } }; // el control de faltas empieza hoy: la base no tiene checadas recientes y no se inventan faltas
  if (parche.cap) d.cap = { ...d.cap, ...parche.cap };
  if (parche.com) d.com = { ...d.com, ...parche.com, feedVisto: d.com?.feedVisto || {} };
  if (parche.eval) d.eval = parche.eval;
  if (parche.fin) d.fin = { ...d.fin, ...parche.fin };
  d.datos = { modo: "qa", perfilId, correo, origen, sedeHoy, hidratadoEn: ahora };
  return d;
}
