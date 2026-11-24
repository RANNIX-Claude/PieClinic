// Dominio «saas» (incorporado de Pie Firme): suscripción por módulos, panel RANNIX multi-clínica, soporte, bitácora de importaciones
// y exportaciones. seed(base, util) → { saas, clinicas }. Determinista (usa util; nunca Math.random). LÓGICA PURA: no importa core.js.
// Fuentes en Pie Firme: migraciones 054 (importaciones con IA), 056 (suscripciones), 059 (RANNIX y exportación), 062 (superadmin y
// errores); reglas P-113 a P-124 de REGLAS_NEGOCIO.md.

/**
 * Catálogo de módulos que se contratan. PRECIOS = PARÁMETROS «POR VALIDAR» con el dueño (no son precios confirmados).
 * Pie Firme confirmó $400 por podólogo activo o $1,000 por clínica (P-113); este producto se vende por módulos y por sucursal,
 * así que los importes de abajo son una propuesta de demostración. unidad: "sucursal" (× sucursales activas) | "clinica" (fijo).
 */
export const MODULOS_SUSCRIPCION = [
  { clave: "clinico", nombre: "Paquete Clínico", desc: "Agenda, recepción, expediente clínico, caja, inventario PEPS y compras de la sucursal.", lista: 1290, fundador: 890, unidad: "sucursal", base: true, pantallas: ["agenda", "consulta", "cobrar", "existencias"] },
  { clave: "asistencia", nombre: "Asistencia (checador)", desc: "Entrada y salida por sucursal, retardos, faltas e incidencias.", lista: 240, fundador: 160, unidad: "sucursal", pantallas: ["checador"] },
  { clave: "rrhh", nombre: "Recursos humanos", desc: "Expediente del personal, vacaciones, altas y bajas, prenómina de demostración.", lista: 420, fundador: 290, unidad: "sucursal", pantallas: ["rh"] },
  { clave: "compras_gastos", nombre: "Compras y gastos", desc: "Gastos, recurrentes, cuentas por pagar y captura de nota de compra.", lista: 360, fundador: 250, unidad: "sucursal", pantallas: ["gastos", "captura-compra"] },
  { clave: "bonos_metas", nombre: "Bonos y metas", desc: "Esquemas de bonos, metas por sucursal y cálculo aprobado y pagado.", lista: 310, fundador: 210, unidad: "sucursal", pantallas: ["bonos", "mis-bonos"] },
  { clave: "edr", nombre: "Estados de resultados", desc: "Estado de resultados por sucursal y consolidado.", lista: 1100, fundador: 750, unidad: "clinica", pantallas: ["edr"] },
  { clave: "analisis", nombre: "Análisis de datos", desc: "Series, ranking, comparativos y tablero del data warehouse.", lista: 950, fundador: 650, unidad: "clinica", pantallas: ["analisis", "tablero-dw"] },
  { clave: "evaluacion", nombre: "Evaluación de clientes", desc: "Encuestas al paciente después de la cita y su seguimiento.", lista: 180, fundador: 120, unidad: "sucursal", pantallas: ["evaluaciones"] },
  { clave: "asistente_ia", nombre: "Asistente con IA", desc: "Preguntas del negocio en lenguaje natural con acciones confirmadas (hoy: motor de reglas simulado).", lista: 1500, fundador: 990, unidad: "clinica", pantallas: ["asistente-ia"] },
  { clave: "portal_tienda", nombre: "Portal y tienda en línea", desc: "Portal público, tienda sin sesión y atención de pedidos.", lista: 1200, fundador: 800, unidad: "clinica", pantallas: ["pedidos-web"] },
];
export const DIAS_PRUEBA = 14; // P-114
export const DIAS_GRACIA = 7; // P-114
export const ESTADOS_CLINICA = { prueba: ["En prueba", "info"], activa: ["Activa", "ok"], vencida: ["Vencida (gracia)", "warn"], suspendida: ["Suspendida", "bad"], baja: ["Baja", "neutral"] };

export function seed(base, util) {
  const { F, DT } = util;
  const admin = base.usuarios.find((u) => u.rol === "admin") || base.usuarios[0];
  const direccion = base.usuarios.find((u) => u.rol === "direccion") || admin;
  const mes = (k) => F(0).slice(0, 7).replace(/^(\d{4})-(\d{2})$/, (_, y, m) => { const t = new Date(+y, +m - 1 + k, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; });

  // ───────── Suscripción de esta clínica (Pie Clinic, cliente fundador)
  const estadoModulo = { clinico: "contratado", asistencia: "contratado", rrhh: "contratado", compras_gastos: "contratado", bonos_metas: "contratado", edr: "contratado", analisis: "contratado", evaluacion: "contratado", asistente_ia: "prueba", portal_tienda: "no_contratado" };
  const modulos = Object.fromEntries(MODULOS_SUSCRIPCION.map((m) => [m.clave, {
    estado: estadoModulo[m.clave],
    desde: estadoModulo[m.clave] === "contratado" ? F(-150) : estadoModulo[m.clave] === "prueba" ? F(-5) : null,
    pruebaHasta: estadoModulo[m.clave] === "prueba" ? F(DIAS_PRUEBA - 5) : null,
    pruebaUsada: estadoModulo[m.clave] === "prueba",
  }]));
  const precios = Object.fromEntries(MODULOS_SUSCRIPCION.map((m) => [m.clave, { lista: m.lista, fundador: m.fundador, porValidar: true }]));
  const nSuc = base.sucursales.filter((s) => s.activa !== false).length;
  const cargoBase = MODULOS_SUSCRIPCION.filter((m) => modulos[m.clave].estado === "contratado").reduce((a, m) => a + m.fundador * (m.unidad === "sucursal" ? nSuc : 1), 0);
  const iva = (x) => Math.round(x * 0.16 * 100) / 100;
  const cobros = [];
  for (let k = 4; k >= 1; k--) {
    const periodo = mes(-k);
    cobros.push({ id: `SC${5 - k}`, periodo, importe: cargoBase, iva: iva(cargoBase), total: Math.round((cargoBase + iva(cargoBase)) * 100) / 100, estado: "pagado", metodo: k % 2 ? "transferencia" : "tarjeta",
      referencia: `SIM-${periodo.replace("-", "")}-${String(4100 + k * 37)}`, fecha: `${periodo}-0${2 + (k % 3)}`, usuarioId: k % 2 ? admin.id : direccion.id, simulado: true });
  }
  cobros.push({ id: "SC5", periodo: mes(0), importe: cargoBase, iva: iva(cargoBase), total: Math.round((cargoBase + iva(cargoBase)) * 100) / 100, estado: "pendiente", metodo: null, referencia: null, fecha: null, usuarioId: null, simulado: true });
  const historial = [
    { id: "SH1", ts: DT(-150, 10, 0), usuarioId: direccion.id, accion: "alta", detalle: "Alta como cliente fundador: 8 módulos contratados con precio de fundador." },
    { id: "SH2", ts: DT(-90, 12, 30), usuarioId: admin.id, accion: "precio", detalle: "Precios de lista y de fundador marcados «por validar» con el dueño." },
    { id: "SH3", ts: DT(-5, 9, 15), usuarioId: admin.id, accion: "prueba", detalle: `Inicio de prueba de ${DIAS_PRUEBA} días: Asistente con IA.` },
  ];
  const suscripcion = { clinicaId: "CL1", fundador: true, estado: "activa", alta: F(-150), ivaPct: 16, modulos, precios, cobros, historial,
    facturacion: { razonSocial: "Podología Integral del Valle, S.A. de C.V.", rfc: "PIV180312K47", correo: "facturas@clinicas.example" } };

  // ───────── Panel RANNIX: clínicas de demostración (la propia + dos ficticias). SIN aislamiento real: todo vive en este navegador.
  const clinicas = [
    { id: "CL1", nombre: "Pie Clinic", propia: true, fundador: true, estado: "activa", plan: "Por módulos (fundador)", alta: F(-150), contacto: "direccion@clinicas.example", region: "Ciudad de México", pruebaHasta: null, ultimoAcceso: null, sucursales: null, usuarios: null, citasMes: null, almacenamientoMB: null, mrr: null, salud: null, notas: "Cliente fundador. Las cifras se leen en vivo de esta instalación." },
    { id: "CL2", nombre: "Podología Integral del Bajío", propia: false, fundador: false, estado: "prueba", plan: "Paquete Clínico + Asistencia", alta: F(-8), contacto: "admin@podobajio.example", region: "León, Gto.", pruebaHasta: F(DIAS_PRUEBA - 8), ultimoAcceso: DT(-1, 18, 40), sucursales: 2, usuarios: 9, citasMes: 214, almacenamientoMB: 0.6, mrr: 0, salud: { pct: 96, errores24h: 1 }, notas: "Migrando su agenda de hoja de cálculo con la importación." },
    { id: "CL3", nombre: "Clínica del Pie Norte", propia: false, fundador: false, estado: "vencida", plan: "Paquete Clínico", alta: F(-210), contacto: "gerencia@piedelnorte.example", region: "Monterrey, N. L.", pruebaHasta: null, graciaHasta: F(DIAS_GRACIA - 3), ultimoAcceso: DT(-2, 11, 5), sucursales: 1, usuarios: 5, citasMes: 133, almacenamientoMB: 0.9, mrr: 1290, salud: { pct: 88, errores24h: 4 }, notas: "Pago de este mes sin registrar; periodo de gracia corriendo." },
  ];

  const tk = (n, clinicaId, asunto, descripcion, prioridad, estado, dias, mensajes) => ({
    id: `TK${n}`, folio: `SOP-${String(n).padStart(4, "0")}`, clinicaId, asunto, descripcion, prioridad, estado, creado: DT(-dias, 10, 15),
    mensajes: mensajes.map(([de, texto, dd, h], i) => ({ id: `TK${n}M${i + 1}`, de, usuarioId: de === "clinica" && clinicaId === "CL1" ? admin.id : null, ts: DT(-dd, h, 20), texto })),
  });
  const soporte = {
    tickets: [
      tk(1, "CL1", "La impresora térmica corta el ticket", "En Polanco el ticket sale cortado a la mitad desde ayer.", "normal", "esperando_clinica", 6, [["clinica", "En Polanco el ticket sale cortado a la mitad.", 6, 10], ["rannix", "¿Nos confirman el modelo de impresora y el ancho de papel (58 u 80 mm)?", 5, 16]]),
      tk(2, "CL1", "Alta de una sucursal nueva", "Queremos preparar la octava sucursal para enero.", "normal", "en_atencion", 3, [["clinica", "Queremos preparar la octava sucursal para enero.", 3, 9], ["rannix", "Se agrega desde Catálogos ▸ Sucursales; el cargo cambia el siguiente periodo (sin prorrateo).", 2, 12]]),
      tk(3, "CL2", "Importación de pacientes desde Excel", "Tenemos 1,800 pacientes en una hoja; ¿cómo los subimos?", "normal", "resuelto", 7, [["clinica", "Tenemos 1,800 pacientes en una hoja.", 7, 11], ["rannix", "Usen Importación de datos: pega la tabla, revisa el mapeo y confirma. Cada carga se puede deshacer.", 7, 15]]),
      tk(4, "CL3", "No podemos registrar el pago de noviembre", "La clínica quedó en periodo de gracia.", "urgente", "abierto", 1, [["clinica", "Nos aparece suscripción vencida, ya hicimos la transferencia.", 1, 13]]),
      tk(5, "CL1", "Duda con el estado de resultados", "El mes pasado no cuadra con contabilidad.", "normal", "cerrado", 20, [["clinica", "El EdR de octubre no cuadra con contabilidad.", 20, 10], ["rannix", "Los meses cerrados salen de un resumen generado; las comisiones son un 2 % estimado. Se documentó en METRICAS.md.", 19, 17]]),
    ],
    avisos: [
      { id: "AV1", ts: DT(-2, 8, 0), titulo: "Mantenimiento programado", texto: "El domingo de 23:00 a 23:30 se actualiza la plataforma. No se pierde información.", alcance: "todas", nivel: "info", activo: true },
      { id: "AV2", ts: DT(-1, 9, 0), titulo: "Pago pendiente", texto: "Tu suscripción está en periodo de gracia. Registra el pago para evitar el modo de solo lectura.", alcance: "CL3", nivel: "importante", activo: true },
    ],
  };
  base.contadores.SOP = soporte.tickets.length;
  base.contadores.LI = base.contadores.LI || 0;

  return {
    clinicas,
    saas: { version: 1, suscripcion, soporte, importaciones: [], exportaciones: [], marca: { esPrueba: true, generado: DT(0, 0, 0), nota: "Todos los datos de esta demostración son sintéticos (P-132)." } },
  };
}
