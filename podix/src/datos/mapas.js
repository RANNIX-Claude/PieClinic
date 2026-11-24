// Capa de datos · correspondencias PURAS entre la base (esquema `piefirme`) y el estado `d` de la app.
// Sin red, sin React, sin core.js: todo lo de aquí se prueba en tests/datos.test.js.
//   fila de la base → forma de `d`   (…DeFila / …DeFilas)
//   forma de `d`    → fila de la base (fila…)
// Ids: en modo conectado los ids de lo hidratado son los uuid de la base (perfil = usuario, empleado, hilo, publicación…).
// La única excepción son las sucursales, que conservan S1..S7 (docs/V2_ESQUEMA.md §1) porque todo el estado de demostración las usa.

// ───────── Sedes
/** Sedes operativas: correspondencia fija de docs/V2_ESQUEMA.md §1. */
export const SEDES = [
  { app: "S1", clave: "CHA", id: "5e000000-0000-0000-0000-000000000001" },
  { app: "S2", clave: "CEN", id: "5e000000-0000-0000-0000-000000000002" },
  { app: "S3", clave: "GAL", id: "5e000000-0000-0000-0000-000000000003" },
  { app: "S4", clave: "PAT", id: "5e000000-0000-0000-0000-000000000004" },
  { app: "S5", clave: "SEN", id: "5e000000-0000-0000-0000-000000000005" },
  { app: "S6", clave: "POL", id: "5e000000-0000-0000-0000-000000000006" },
  { app: "S7", clave: "COY", id: "5e000000-0000-0000-0000-000000000007" },
];
/** Sedes duplicadas de la semilla D_01 (clave en minúscula): se pliegan a su operativa equivalente; nunca aparecen como sucursal. */
export const ALIAS_CLAVE = { chalco: "CHA", centenario: "CEN", galerias: "GAL", patio: "PAT", sendero: "SEN" };
export const claveOperativa = (clave) => {
  const c = String(clave || "").trim();
  if (SEDES.some((s) => s.clave === c)) return c;
  return ALIAS_CLAVE[c.toLowerCase()] || (SEDES.some((s) => s.clave === c.toUpperCase()) ? c.toUpperCase() : null);
};

/**
 * Mapa de sedes a partir de las filas reales de `sedes` (o solo la tabla fija si no hay filas).
 *   aApp(uuid) → "S1".."S7" | null      aBase("S3") → uuid | null      esDuplicada(uuid) → boolean
 */
export function crearMapaSedes(filas = []) {
  const porId = new Map(), porApp = new Map(), duplicadas = new Set();
  SEDES.forEach((s) => { porId.set(s.id, s.app); porApp.set(s.app, s.id); });
  for (const f of filas || []) {
    const clave = claveOperativa(f.clave);
    const s = SEDES.find((x) => x.clave === clave);
    if (!s) continue;
    if (f.clave === s.clave) { porId.set(f.id, s.app); porApp.set(s.app, f.id); }
    else { porId.set(f.id, s.app); duplicadas.add(f.id); }
  }
  return {
    aApp: (id) => (id ? porId.get(id) || null : null),
    aBase: (app) => porApp.get(app) || null,
    esDuplicada: (id) => duplicadas.has(id),
    /** Lista de uuid → lista de S# sin repetidos ni nulos. */
    lista: (ids) => [...new Set((ids || []).map((id) => porId.get(id)).filter(Boolean))],
    todas: () => SEDES.map((s) => s.app),
  };
}

/** Sucursal de la app a partir de la fila de `sedes` operativa. Conserva lo que la demo ya traía (consultorios…). */
export function sucursalDeFila(f, previa = {}) {
  const s = SEDES.find((x) => x.clave === f.clave);
  if (!s) return null;
  return { ...previa, id: s.app, nombre: f.nombre, direccion: f.direccion || "", telefono: f.telefono || "", activa: f.activa !== false, clave: f.clave, sedeId: f.id, origen: "qa" };
}

// ───────── Cargos y roles
export const ROLES_APP = ["direccion", "admin", "gerente", "almacen", "cajero", "recepcion", "asistente", "podologo"];
const ROL_BASE_A_APP = { administrador: "admin", podologo: "podologo", recepcion: "recepcion" };
const PUESTO_A_APP = { administrador: "admin", podologo: "podologo", recepcion: "recepcion", apoyo: "asistente" };
/** Rol de la app: el cargo (064) manda; si es nulo se deduce del rol de seguridad o del puesto, igual que `piefirme_app.cargo()`. */
export function cargoARol(cargo, rolBase = null, puesto = null) {
  if (ROLES_APP.includes(cargo)) return cargo;
  return ROL_BASE_A_APP[rolBase] || PUESTO_A_APP[puesto] || "asistente";
}
/** Rol de seguridad de la base que corresponde a un rol de la app (para documentar y validar antes de escribir). */
export const rolBaseDe = (rol) => (["direccion", "admin", "gerente"].includes(rol) ? "administrador" : rol === "podologo" ? "podologo" : "recepcion");
export const PUESTO_ETIQUETA = { direccion: "Dirección general", admin: "Administración central", almacen: "Encargado de almacén", gerente: "Gerente de sucursal", cajero: "Cajero(a)", recepcion: "Recepcionista", asistente: "Asistente clínico", podologo: "Podólogo(a)" };

// ───────── Fechas
const p2 = (n) => String(n).padStart(2, "0");
/** timestamptz de la base → texto local "YYYY-MM-DDTHH:mm" (la app guarda fechas como texto local, sin zona). */
export function aLocal(iso) {
  if (!iso) return null;
  const x = new Date(iso);
  if (Number.isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}T${p2(x.getHours())}:${p2(x.getMinutes())}`;
}
export const aHora = (iso) => { const l = aLocal(iso); return l ? l.slice(11, 16) : null; };
/** date ("YYYY-MM-DD") o timestamptz → día local "YYYY-MM-DD". */
export const aDia = (v) => (!v ? null : String(v).length > 10 ? (aLocal(v) || String(v)).slice(0, 10) : String(v));
const num = (v) => (v == null || v === "" ? 0 : Number(v));

// ───────── Usuarios (perfiles) y empleados
/**
 * perfiles → d.usuarios[]. Sedes: `perfiles.sedes = {}` significa «todas» en la base; para quien no es de oficina central
 * se usa la sede de su ficha de empleado (si existe) para que «Trabajando en» no ofrezca las siete.
 */
export function usuarioDePerfil(p, ms, { empleado = null } = {}) {
  const rol = cargoARol(p.cargo, p.rol);
  let sucursales = ms.lista(p.sedes);
  if (!sucursales.length) {
    const base = empleado ? ms.lista([empleado.sede_base_id ?? empleado.sede_id, ...(empleado.sedes || [])]) : [];
    sucursales = ["direccion", "admin", "gerente"].includes(rol) || !base.length ? ms.todas() : base;
  }
  return {
    id: p.id, nombre: [p.nombre, p.apellidos].filter(Boolean).join(" ").trim() || p.email || "Usuario", rol, sucursales,
    correo: p.email || "", activo: p.activo !== false, rolBase: p.rol, cargo: p.cargo || null, origen: "qa",
  };
}

const FACTOR_MENSUAL = { quincenal: 2, semanal: 52 / 12, catorcenal: 26 / 12, mensual: 1 };
const textoDomicilio = (j) => {
  if (!j || typeof j !== "object") return typeof j === "string" ? j : "";
  return [j.calle && `${j.calle}${j.numero ? " #" + j.numero : ""}`, j.colonia && `Col. ${j.colonia}`, j.municipio || j.ciudad, j.estado, j.cp && `CP ${j.cp}`].filter(Boolean).join(", ");
};
/**
 * prp_empleados (+ cargo del directorio + horario laboral) → d.rh.empleados[].
 * `sueldoMensual` = salario_periodo × periodos del mes (quincenal ×2). Lo que la base no tiene queda vacío, no inventado.
 */
export function empleadoDeFila(e, ms, { cargo = null, horario = null } = {}) {
  const rol = cargoARol(cargo ?? e.cargo, null, e.puesto);
  const base = ms.aApp(e.sede_id);
  const sucursales = [...new Set([base, ...ms.lista(e.sedes)].filter(Boolean))];
  const ce = e.contacto_emergencia && typeof e.contacto_emergencia === "object" ? e.contacto_emergencia : {};
  return {
    id: e.id, usuarioId: e.perfil_id || null, nombre: e.nombre_completo || [e.nombre, e.apellido_pat, e.apellido_mat].filter(Boolean).join(" "),
    rol, puesto: PUESTO_ETIQUETA[rol], sucursalBase: base, sucursales,
    sueldoMensual: Math.round(num(e.salario_periodo) * (FACTOR_MENSUAL[e.periodicidad_pago] || 1) * 100) / 100,
    ingreso: aDia(e.fecha_ingreso) || "", estado: e.estado === "baja" ? "baja" : "activo", foto: null,
    ...(e.estado === "baja" ? { bajaFecha: aDia(e.fecha_baja), bajaMotivo: e.motivo_baja || "" } : {}),
    sexo: null, nacimiento: aDia(e.fecha_nacimiento) || "", telefono: e.telefono || "", correo: e.email || "",
    domicilio: textoDomicilio(e.domicilio) || "—", curp: e.curp || "", rfc: e.rfc || "", nss: e.nss || "",
    emergencia: { nombre: ce.nombre || "", parentesco: ce.parentesco || "", telefono: ce.telefono || "" },
    contrato: { tipo: e.esquema_contratacion || "", inicio: aDia(e.fecha_ingreso) || "", fin: null, firmado: false },
    horario: horario || { entrada: "09:00", salida: "18:00" }, horarioSupuesto: !horario,
    expediente: {}, numeroEmpleado: e.numero_empleado || "", origen: "qa",
  };
}
/** horarios_laborales (por día de la semana) → { entrada, salida } del primer día activo (la app maneja un solo horario por persona). */
export function horarioDeFilas(filas = []) {
  const f = filas.filter((x) => x.activo !== false && x.entrada && x.salida).sort((a, b) => a.dia_semana - b.dia_semana)[0];
  return f ? { entrada: String(f.entrada).slice(0, 5), salida: String(f.salida).slice(0, 5) } : null;
}

const ESTADO_ASISTENCIA = { presente: "normal", retardo: "retardo", falta: "falta", vacaciones: "vacaciones", incapacidad: "incapacidad" };
/** prp_asistencia (consolidada por trigger desde checadas) → d.rh.asistencia[]. */
export function asistenciaDeFila(a, ms, perfilDeEmpleado = () => null) {
  return {
    id: a.id, empleadoId: a.empleado_id, fecha: aDia(a.fecha), sucursalId: ms.aApp(a.sede_id),
    entrada: aHora(a.hora_entrada), salida: aHora(a.hora_salida), estado: ESTADO_ASISTENCIA[a.estado] || "normal",
    minutosTarde: num(a.minutos_retardo), usuarioId: perfilDeEmpleado(a.empleado_id), origen: "qa",
  };
}
/** empleado_asignaciones («Trabajando en» por día) → d.rh.asignaciones[] con fecha (la base no tiene programación semanal). */
export const asignacionDeFila = (a, ms) => ({ id: a.id, empleadoId: a.empleado_id, fecha: aDia(a.fecha), sucursalId: ms.aApp(a.sede_id), origenBase: a.origen || null });

const TIPO_MOV = { alta: "alta", baja: "baja", cambio_sede: "cambio", cambio_puesto: "cambio" };
export function movimientoDeFila(m, ms) {
  const d = m.detalle && typeof m.detalle === "object" ? m.detalle : {};
  const detalle = m.tipo === "alta" ? `Alta${m.sede_destino_nombre ? " en " + m.sede_destino_nombre : ""}`
    : m.tipo === "baja" ? `Baja${m.motivo ? ": " + m.motivo : ""}`
      : m.tipo === "cambio_sede" ? `Cambio de sucursal: ${m.sede_origen_nombre || "—"} → ${m.sede_destino_nombre || "—"}`
        : `Cambio de puesto${d.puesto_anterior || d.cargo_anterior ? `: ${d.cargo_anterior || d.puesto_anterior} → ${d.cargo_nuevo || d.puesto_nuevo || "—"}` : ""}`;
  return {
    id: m.id, empleadoId: m.empleado_id, fecha: aDia(m.fecha), tipo: TIPO_MOV[m.tipo] || "cambio", tipoBase: m.tipo, detalle, motivo: m.motivo || "", finiquito: null,
    imss: { estado: "historico", aviso: m.tipo === "alta" ? "Alta" : m.tipo === "baja" ? "Baja" : "Modificación" },
    usuarioId: m.registrado_por || null, sucursalId: ms.aApp(m.sede_destino_id || m.sede_origen_id),
  };
}
const TIPO_INCIDENCIA = { incapacidad: "incapacidad", permiso_con_goce: "permiso", permiso_sin_goce: "permiso", falta_justificada: "falta_justificada" };
const ESTADO_INCIDENCIA = { aplicada: "aprobada", autorizada: "aprobada", registrada: "registrada", solicitada: "solicitada", rechazada: "rechazada" };
export function incidenciaDeFila(i, ms) {
  const tipo = TIPO_INCIDENCIA[i.tipo_clave] || "otro";
  return {
    id: i.id, empleadoId: i.empleado_id, tipo, tipoBase: i.tipo_clave, desde: aDia(i.fecha), hasta: aDia(i.fecha_fin) || aDia(i.fecha),
    detalle: [tipo === "otro" ? i.tipo : null, i.motivo].filter(Boolean).join(": ") || i.tipo || "", estado: ESTADO_INCIDENCIA[i.estado] || "registrada",
    usuarioId: null, sucursalId: ms.aApp(i.sede_id), ts: `${aDia(i.fecha)}T09:00`,
  };
}
const ESTADO_VACACION = { solicitada: "solicitada", autorizada: "aprobada", tomada: "aprobada", rechazada: "rechazada", cancelada: "cancelada" };
export const vacacionDeFila = (v, ms, perfilDeEmpleado = () => null) => ({
  id: v.id, empleadoId: v.empleado_id, desde: aDia(v.fecha_inicio), hasta: aDia(v.fecha_fin), dias: num(v.dias), estado: ESTADO_VACACION[v.estado] || "solicitada", estadoBase: v.estado,
  usuarioId: perfilDeEmpleado(v.empleado_id), sucursalId: ms.aApp(v.sede_id), solicitadoEn: aDia(v.fecha_inicio), resueltoPor: null, resueltoEn: null, motivo: "", nota: v.notas || "",
});

// ───────── Comunicación
const agrupar = (filas, k) => { const m = new Map(); for (const f of filas || []) { const a = m.get(f[k]); if (a) a.push(f); else m.set(f[k], [f]); } return m; };
/** com_mensajes / prp_com_mensajes → mensaje de la app. `lecturas` = filas de com_mensaje_lecturas de ese mensaje. */
export function mensajeDeFila(m, lecturas = []) {
  const out = { id: m.id, de: m.autor_id, sucursalId: null, ts: aLocal(m.created_at), texto: m.texto || "", leidoPor: [...new Set([m.autor_id, ...lecturas.map((l) => l.perfil_id)])] };
  if (Array.isArray(m.adjuntos) && m.adjuntos.length) out.adjuntosBase = m.adjuntos; // rutas de Storage: la app aún no las muestra
  return out;
}
/** prp_com_hilos + miembros + mensajes + lecturas → d.com.hilos[]. */
export function hilosDeFilas({ hilos = [], miembros = [], mensajes = [], lecturas = [] }, ms) {
  const mi = agrupar(miembros, "hilo_id"), me = agrupar(mensajes, "hilo_id"), le = agrupar(lecturas, "mensaje_id");
  return hilos.map((h) => {
    const mm = mi.get(h.id) || [];
    const out = {
      id: h.id, tipo: h.tipo, nombre: h.tipo === "directo" ? null : h.titulo || h.nombre || "Conversación", creadoPor: h.creado_por || null, creado: aLocal(h.ultimo_mensaje_en) || "",
      miembros: mm.map((x) => x.perfil_id), fijadoPor: [], silenciadoPor: mm.filter((x) => x.silenciado).map((x) => x.perfil_id),
      mensajes: (me.get(h.id) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((m) => mensajeDeFila(m, le.get(m.id) || [])),
    };
    if (h.tipo === "sucursal") out.sucursalId = ms.aApp(h.sede_id);
    if (h.tipo === "rol") out.rol = h.cargo || null;
    return out;
  });
}
/** forma de la app → fila de com_mensajes (organizacion_id la pone el default de la tabla). */
export const filaMensaje = (hiloId, m, perfilId) => ({ hilo_id: hiloId, autor_id: perfilId, texto: m.texto });

/** prp_correos_bandeja + prp_correos_enviados + correo_destinatarios → d.com.correos[]. Solo llegan los que RLS deja ver. */
export function correosDeFilas({ bandeja = [], enviados = [], destinatarios = [] }, yo) {
  const dest = agrupar(destinatarios, "correo_id");
  const porId = new Map();
  const armar = (c, de, borrador) => {
    const ds = dest.get(c.id) || [];
    const para = ds.filter((x) => x.tipo !== "cc").map((x) => x.perfil_id), cc = ds.filter((x) => x.tipo === "cc").map((x) => x.perfil_id);
    const mio = ds.find((x) => x.perfil_id === yo);
    return {
      id: c.id, hiloId: c.respuesta_a_id || c.id, enRespuestaA: c.respuesta_a_id || null, de, para, cc, paraTokens: [...para], ccTokens: [...cc],
      asunto: c.asunto || "", cuerpo: c.cuerpo || "", ts: aLocal(c.enviado_en) || "",
      leidoPor: [...new Set([de, ...ds.filter((x) => x.leido_en).map((x) => x.perfil_id)])], etiquetas: mio?.etiquetas || [],
      destacadoPor: ds.filter((x) => x.destacado).map((x) => x.perfil_id), archivadoPor: ds.filter((x) => x.archivado).map((x) => x.perfil_id), borrador: !!borrador,
    };
  };
  for (const c of enviados) porId.set(c.id, armar(c, yo, c.borrador));
  for (const c of bandeja) {
    if (c.eliminado_en) continue;
    const x = armar(c, c.de_perfil_id, false);
    if (!x.para.includes(yo) && !x.cc.includes(yo)) (c.tipo === "cc" ? x.cc : x.para).push(yo); // por si RLS no dejó leer la fila de destinatario
    if (!porId.has(c.id)) porId.set(c.id, x);
  }
  // El hilo de la app es la raíz de la cadena de respuestas.
  const raiz = (c, n = 0) => (c.enRespuestaA && porId.has(c.enRespuestaA) && n < 20 ? raiz(porId.get(c.enRespuestaA), n + 1) : c.enRespuestaA && !porId.has(c.enRespuestaA) ? c.enRespuestaA : c.id);
  const out = [...porId.values()];
  out.forEach((c) => { c.hiloId = raiz(c); });
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

/** prp_feed + feed_reacciones + prp_feed_comentarios → d.com.feed[]. Las imágenes viven en Storage (`imagen_path`): aún no se muestran. */
export function feedDeFilas({ publicaciones = [], reacciones = [], comentarios = [] }, ms) {
  const re = agrupar(reacciones, "publicacion_id"), co = agrupar(comentarios, "publicacion_id");
  return publicaciones.filter((p) => !p.archivada).map((p) => {
    const r = {};
    for (const x of re.get(p.id) || []) (r[x.emoji] ||= []).push(x.perfil_id);
    return {
      id: p.id, autorId: p.autor_id, sucursalId: null, ts: aLocal(p.publicada_en) || "", tipo: p.tipo, titulo: p.titulo || "", texto: p.texto || "",
      imagen: null, imagenPath: p.imagen_path || null, fijado: !!p.fijado, alcance: p.alcance_sede_id ? ms.aApp(p.alcance_sede_id) || "todos" : "todos",
      etiquetadoId: p.reconocido_perfil_id || null, reacciones: r,
      comentarios: (co.get(p.id) || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).map((c) => ({ id: c.id, de: c.autor_id, ts: aLocal(c.created_at), texto: c.texto || "" })),
    };
  }).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}
/** forma de la app → fila de feed_publicaciones. */
export const filaPublicacion = (p, ms, perfilId) => ({
  autor_id: perfilId, tipo: p.tipo, titulo: p.titulo, texto: p.texto || "", fijado: !!p.fijado,
  alcance_sede_id: p.alcance && p.alcance !== "todos" ? ms.aBase(p.alcance) : null,
  reconocido_perfil_id: p.tipo === "reconocimiento" ? p.etiquetadoId || null : null,
});
export const filaComentario = (publicacionId, c, perfilId) => ({ publicacion_id: publicacionId, autor_id: perfilId, texto: c.texto });
export const filaReaccion = (publicacionId, emoji, perfilId) => ({ publicacion_id: publicacionId, perfil_id: perfilId, emoji });

// ───────── Capacitación y acervo
export function idYoutube(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? m[1] : null;
}
/** prp_cursos + prp_lecciones + curso_evaluaciones → d.cap.cursos[]. La base no guarda mínimo aprobatorio: se usa 80 (supuesto rotulado). */
export function cursosDeFilas({ cursos = [], lecciones = [], evaluaciones = [] }, ms) {
  const le = agrupar(lecciones, "curso_id"), ev = agrupar(evaluaciones, "curso_id");
  return cursos.slice().sort((a, b) => num(a.orden) - num(b.orden)).map((c) => {
    const preguntas = (ev.get(c.id) || []).slice().sort((a, b) => num(a.orden) - num(b.orden)).map((q) => ({ p: q.pregunta, opciones: Array.isArray(q.opciones) ? q.opciones : [], correcta: num(q.correcta) }));
    return {
      id: c.id, titulo: c.titulo, categoria: c.categoria || "General", resumen: c.descripcion || "",
      asignado: { roles: c.cargos || [], personas: [], nuevos: false }, ruta: 0, obligatorio: !!c.obligatorio, sucursalId: ms.aApp(c.sede_id),
      lecciones: (le.get(c.id) || []).slice().sort((a, b) => num(a.orden) - num(b.orden)).map((l) => ({
        id: l.id, titulo: l.titulo, minutos: num(l.duracion_min), video: l.tipo === "video", youtube: idYoutube(l.video_url), videoPendiente: !!l.video_pendiente,
        texto: l.contenido || "", pasos: [], checklist: [], docTitulo: "", docUrl: null,
      })),
      evaluacion: preguntas.length ? { minimo: 80, minimoSupuesto: true, preguntas } : null,
      estado: c.activo === false ? "archivado" : "publicado", borrador: true, creadoPor: null, fecha: "", revision: "", version: "1.0", origen: "qa",
    };
  });
}
/** curso_avance (una fila por lección completada) + curso_resultados → d.cap.avance[] (una por persona y curso). */
export function avanceDeFilas({ avance = [], resultados = [] }) {
  const m = new Map();
  const de = (perfil, curso) => { const k = `${perfil}|${curso}`; let a = m.get(k); if (!a) { a = { id: `AV:${k}`, usuarioId: perfil, cursoId: curso, sucursalId: null, vistas: [], evaluaciones: [], aprobado: false, completado: null, constancia: null, ult: "" }; m.set(k, a); } return a; };
  for (const f of avance) {
    const a = de(f.perfil_id, f.curso_id);
    if (!a.vistas.includes(f.leccion_id)) a.vistas.push(f.leccion_id);
    const dia = aDia(f.completado_en) || ""; if (dia > a.ult) a.ult = dia;
  }
  for (const r of resultados.slice().sort((x, y) => num(x.intento) - num(y.intento))) {
    const a = de(r.perfil_id, r.curso_id);
    const dia = aDia(r.realizado_en) || "";
    a.evaluaciones.push({ fecha: dia, calif: Math.round(num(r.calificacion)) });
    if (r.aprobado) { a.aprobado = true; a.completado = a.completado || dia; }
    if (dia > a.ult) a.ult = dia;
  }
  return [...m.values()];
}
/** forma de la app → fila de curso_avance. */
export const filaAvance = (cursoId, leccionId, perfilId) => ({ perfil_id: perfilId, curso_id: cursoId, leccion_id: leccionId });

const TIPO_ACERVO = { video: "video", foto: "foto", guia: "guia", procedimiento: "procedimiento", formato: "formato" };
export const acervoDeFila = (a, ms) => ({
  id: a.id, tipo: TIPO_ACERVO[a.tipo] || "guia", tipoBase: a.tipo, categoria: a.categoria || "Operación diaria", titulo: a.titulo, descripcion: "", etiquetas: a.etiquetas || [],
  contenido: a.contenido || "", youtube: idYoutube(a.url), imagenes: [], docUrl: a.url && !idYoutube(a.url) ? a.url : null, storagePath: a.storage_path || null,
  sucursalId: ms.aApp(a.sede_id), roles: a.cargos || [], subidoPor: null, fecha: aDia(a.created_at) || "", revision: { fecha: aDia(a.updated_at) || "", responsable: null },
  version: a.version || "1.0", estado: a.estado === "archivado" ? "archivado" : "publicado", borrador: true, origen: "qa",
});

// ───────── Desempeño: evaluaciones de clientes
const SEGUIMIENTO = { pendiente: "nuevo", en_atencion: "contactado", resuelta: "resuelto" };
/** prp_evaluaciones → d.eval[]. citaId y pacienteId son uuid de la base (la agenda y los pacientes siguen en demostración). */
export function evaluacionDeFila(e, ms) {
  const fecha = aLocal(e.respondida_en) || "";
  return {
    id: e.id, citaId: e.cita_id || null, pacienteId: e.paciente_id || null, sucursalId: ms.aApp(e.sede_id), podologoId: e.podologo_id || null, fecha,
    califServicio: e.calif_servicio, califPodologo: e.calif_podologo, califSucursal: e.calif_sucursal, comentario: e.comentario || "",
    estado: "respondida", canal: e.canal || null, enviadaEn: fecha, enlace: null,
    seguimiento: SEGUIMIENTO[e.estado_seguimiento] ? { estado: SEGUIMIENTO[e.estado_seguimiento], nota: e.seguimiento_nota || "", por: e.atendida_por || null, fecha: aDia(e.atendida_en) } : null,
    origen: "qa",
  };
}

// ───────── Finanzas
/** prp_grupos_gasto → d.fin.categorias[] (id = clave del grupo). `recurrente` sale de si hay gastos recurrentes de ese grupo. */
export const categoriaDeGrupo = (g, clavesRecurrentes = new Set()) => ({ id: g.clave, nombre: g.nombre, fijo: clavesRecurrentes.has(g.clave), recurrente: clavesRecurrentes.has(g.clave), grupoId: g.id, origen: "qa" });
/** prp_gastos → d.fin.gastos[]. Los anulados no llegan (se filtran en la consulta). Proveedor como texto: el catálogo de proveedores sigue en demostración. */
export const gastoDeFila = (g, ms) => ({
  id: g.id, sucursalId: g.compartido ? null : ms.aApp(g.sede_id), compartido: !!g.compartido, fecha: aDia(g.fecha), categoria: g.grupo_clave || "otros",
  concepto: g.descripcion || g.grupo_nombre || "Gasto", monto: num(g.total), proveedorId: null, acreedor: g.proveedor_nombre || g.proveedor_texto || "",
  comprobante: g.folio_comprobante || "", fuente: g.origen_captura === "ia" ? "nota_ia" : "manual", origenModulo: g.origen_modulo || "manual", registradoPor: g.pagado_por_perfil_id || null, origen: "qa",
});
export const recurrenteDeFila = (r, ms, claveDeGrupo = () => null) => ({
  id: r.id, sucursalId: ms.aApp(r.sede_id), categoria: claveDeGrupo(r.grupo_id) || "otros", concepto: r.concepto, monto: num(r.monto), proveedorId: null,
  acreedor: r.proveedor_nombre || "", diaMes: r.dia_del_mes || 1, activo: r.activo !== false, frecuencia: r.frecuencia, proximaFecha: aDia(r.proxima_fecha), origen: "qa",
});
