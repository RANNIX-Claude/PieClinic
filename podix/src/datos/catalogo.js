// Capa de datos · catálogo de colecciones del estado `d` y de dónde salen en modo conectado (VITE_MODO=qa).
// PURO (sin red ni React). Lo usan: origenDe(), la hoja «Origen de los datos», docs/CONEXION_QA.md y tests/datos.test.js.
//   conecta: "qa"    → se hidrata de la base QA al iniciar sesión (RLS decide qué llega)
//            "vacio" → en modo qa queda vacía: sus padres vienen de la base y su forma aún no se conecta (no se mezclan ids)
//            "demo"  → sigue con la semilla local de demostración (con el motivo)
//   escribe: acciones que en modo qa se guardan en la base (write-through)

export const MODO = (import.meta.env && import.meta.env.VITE_MODO) === "qa" ? "qa" : "demo";
export const ETIQUETA_MODO = { demo: "Datos: demostración en este navegador", qa: "Datos: base QA" };

export const CATALOGO = [
  // ── Organización
  { clave: "sucursales", modulo: "Sucursales", dominio: "organizacion", conecta: "qa", fuente: "sedes (7 operativas; las 5 duplicadas se ignoran)" },
  { clave: "usuarios", modulo: "Cuentas y directorio", dominio: "organizacion", conecta: "qa", fuente: "perfiles (+ equipo_directorio())", nota: "Las cuentas ficticias de la demostración se conservan para los módulos que siguen en demostración." },
  // ── Personas
  { clave: "rh.empleados", modulo: "RH · personal", dominio: "personas", conecta: "qa", fuente: "prp_empleados + prp_horarios_laborales" },
  { clave: "rh.asistencia", modulo: "Checador y asistencia", dominio: "personas", conecta: "qa", fuente: "prp_asistencia (últimos 45 días)", escribe: ["checador.entrada", "checador.salida"] },
  { clave: "rh.asignaciones", modulo: "«Trabajando en» por día", dominio: "personas", conecta: "qa", fuente: "prp_empleado_asignaciones" },
  { clave: "rh.movimientos", modulo: "RH · altas, bajas y cambios", dominio: "personas", conecta: "qa", fuente: "prp_empleado_movimientos" },
  { clave: "rh.incidencias", modulo: "RH · incidencias", dominio: "personas", conecta: "qa", fuente: "prp_incidencias_rh" },
  { clave: "rh.vacaciones", modulo: "RH · vacaciones", dominio: "personas", conecta: "qa", fuente: "prp_vacaciones_detalle" },
  { clave: "rh.recibos", modulo: "RH · recibos de nómina", dominio: "personas", conecta: "vacio", motivo: "La prenómina de la base (nomina_periodos, prenomina) tiene otra forma que el recibo de demostración; los recibos ficticios apuntaban a empleados ficticios." },
  { clave: "cap.cursos", modulo: "Capacitación · cursos", dominio: "personas", conecta: "qa", fuente: "prp_cursos + prp_lecciones + curso_evaluaciones" },
  { clave: "cap.avance", modulo: "Capacitación · avance", dominio: "personas", conecta: "qa", fuente: "curso_avance + curso_resultados", escribe: ["leccion.completada"] },
  { clave: "cap.acervo", modulo: "Acervo", dominio: "personas", conecta: "qa", fuente: "prp_acervo" },
  // ── Comunicación
  { clave: "com.hilos", modulo: "Mensajes", dominio: "comunicacion", conecta: "qa", fuente: "prp_com_hilos + com_hilo_miembros + prp_com_mensajes + com_mensaje_lecturas", escribe: ["mensaje.enviar"] },
  { clave: "com.correos", modulo: "Correo interno", dominio: "comunicacion", conecta: "qa", fuente: "prp_correos_bandeja + prp_correos_enviados + correo_destinatarios" },
  { clave: "com.feed", modulo: "Feed", dominio: "comunicacion", conecta: "qa", fuente: "prp_feed + feed_reacciones + prp_feed_comentarios", escribe: ["feed.publicar", "feed.reaccionar", "feed.comentar"] },
  // ── Desempeño
  { clave: "eval", modulo: "Evaluaciones de clientes", dominio: "desempeno", conecta: "qa", fuente: "prp_evaluaciones", nota: "La cita y el paciente de cada evaluación no se resuelven: agenda y pacientes siguen en demostración." },
  { clave: "bonos", modulo: "Bonos y metas", dominio: "desempeno", conecta: "demo", motivo: "El motor de bonos calcula contra d.ventas (aún en demostración) y los esquemas de la base usan otras bases y escalones (ventas_servicios, cumplimiento_meta, monto fijo). Mezclar metas reales con ventas ficticias daría cifras falsas." },
  // ── Finanzas
  { clave: "fin.categorias", modulo: "Gastos · categorías", dominio: "finanzas", conecta: "qa", fuente: "prp_grupos_gasto" },
  { clave: "fin.gastos", modulo: "Gastos", dominio: "finanzas", conecta: "qa", fuente: "prp_gastos (sin anulados)", nota: "El estado de resultados mezcla estos gastos reales con ingresos de demostración: no es un resultado válido mientras ventas no se conecte." },
  { clave: "fin.recurrentes", modulo: "Gastos recurrentes", dominio: "finanzas", conecta: "qa", fuente: "prp_gastos_recurrentes" },
  { clave: "fin.notasCompra", modulo: "Notas de compra", dominio: "finanzas", conecta: "demo", motivo: "Las partidas de la nota apuntan a productos, órdenes de compra y cuentas por pagar, que siguen en demostración (ids ficticios)." },
  // ── Comercial
  { clave: "pedidosWeb", modulo: "Pedidos en línea", dominio: "comercial", conecta: "demo", motivo: "Las partidas del pedido reservan existencias de d.productos / d.capas (inventario aún en demostración)." },
  { clave: "auditorias", modulo: "Auditoría de inventario por foto", dominio: "comercial", conecta: "demo", motivo: "Cada renglón compara contra existencias del inventario, que sigue en demostración; las fotos viven en Storage (sin archivos en QA)." },
  // ── Resto: agenda, expediente, caja, inventario, compras…
  { clave: "pacientes", modulo: "Pacientes y expediente", dominio: "clinica", conecta: "demo", motivo: "Fase 2: datos clínicos con RLS por sede y bitácora de acceso." },
  { clave: "citas", modulo: "Agenda y consultas", dominio: "clinica", conecta: "demo", motivo: "Fase 2." },
  { clave: "ventas", modulo: "Caja, ventas, apartados y crédito", dominio: "ventas", conecta: "demo", motivo: "Fase 2: la venta toca caja, inventario PEPS y cartera en una sola operación (RPC)." },
  { clave: "productos", modulo: "Catálogo, existencias y compras", dominio: "almacen", conecta: "demo", motivo: "Fase 2." },
  { clave: "bitacora", modulo: "Bitácora de auditoría", dominio: "plataforma", conecta: "demo", motivo: "La bitácora de la base la escriben triggers; la de la app es local." },
];

const POR_CLAVE = new Map(CATALOGO.map((c) => [c.clave, c]));
export const entradaDe = (clave) => POR_CLAVE.get(clave) || null;

/**
 * Origen real de una colección según el estado: "qa" | "vacio" | "demo".
 * `d.datos.origen[clave]` lo escribe la hidratación; sin sesión conectada todo es "demo".
 * Para un dominio compuesto ("rh", "com", "cap", "fin") devuelve "qa" solo si TODAS sus colecciones vienen de la base.
 */
export function origenEn(d, clave) {
  const o = d && d.datos && d.datos.modo === "qa" ? d.datos.origen || {} : null;
  if (!o) return "demo";
  if (o[clave]) return o[clave].origen;
  const hijas = CATALOGO.filter((c) => c.clave.startsWith(clave + "."));
  if (hijas.length) return hijas.every((c) => (o[c.clave]?.origen || "demo") !== "demo") ? "qa" : "demo";
  return "demo";
}

/** Filas para la tabla «Origen de los datos»: catálogo + lo que de verdad llegó en esta sesión. */
export function tablaOrigen(d) {
  const o = d && d.datos && d.datos.modo === "qa" ? d.datos.origen || {} : {};
  return CATALOGO.map((c) => {
    const real = o[c.clave];
    const origen = real ? real.origen : "demo";
    return { ...c, origen, filas: real && real.origen === "qa" ? real.n : null, detalle: real?.nota || (origen === "demo" ? c.motivo || (MODO === "qa" && c.conecta === "qa" ? "Sin sesión conectada" : "") : c.nota || c.motivo || "") };
  });
}
