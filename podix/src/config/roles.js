// CONFIGURACIÓN DE MENÚS POR ROL — un solo archivo de datos (docs/MATRIZ_MOVIL.md, aprobada).
// Agregar, quitar o reordenar un tab, o dar de alta un rol, es editar este archivo; el shell no se toca.
//   key    → nombre del archivo de la pantalla: src/pantallas/<app>/<key>.jsx
//   badge  → nombre de un selector de src/store/selectors.js (el dato debe existir; si no, sin badge)
//   central→ tab de la acción dominante (se resalta). Un rol usa tab central O botón flotante, nunca ambos.
//   sec    → sección del menú lateral de escritorio (estilo IRP). En teléfono, los ítems de "Más" se agrupan por sección.
// Los ítems de "Más" abren src/pantallas/mas/<key>.jsx.

// Ítems de "Más" compartidos (comunicación, aprendizaje, asistencia). Cada rol los incluye con it(...).
const ITEMS = {
  // ── Demo Pie Clinic (ver src/pantallas/mas/{tablero-dueno,reparto-central,dormidos,demo-consulta}.jsx)
  "tablero-dueno": { key: "tablero-dueno", label: "Tablero del dueño", icon: "chart", sec: "DIRECCIÓN" },
  "reparto-central": { key: "reparto-central", label: "Reparto del almacén central", icon: "truck", sec: "INVENTARIO" },
  dormidos: { key: "dormidos", label: "Pacientes dormidos (reactivación)", icon: "phone", sec: "OPERACIÓN" },
  "demo-consulta": { key: "demo-consulta", label: "Consulta de demostración", icon: "activity", sec: "CLÍNICA" },
  checador: { key: "checador", label: "Mi entrada y salida", icon: "clock", sec: "PERSONAS" },
  "mis-bonos": { key: "mis-bonos", label: "Mis bonos y metas", icon: "award", sec: "PERSONAS" },
  rh: { key: "rh", label: "Recursos humanos", icon: "users", sec: "PERSONAS" },
  bonos: { key: "bonos", label: "Bonos y metas", icon: "award", sec: "PERSONAS" },
  gastos: { key: "gastos", label: "Compras y gastos", icon: "receipt", sec: "FINANZAS" },
  "captura-compra": { key: "captura-compra", label: "Captura de nota de compra (IA)", icon: "camera", sec: "FINANZAS" },
  edr: { key: "edr", label: "Estado de resultados", icon: "dollar", sec: "FINANZAS" },
  analisis: { key: "analisis", label: "Análisis de datos", icon: "trending", sec: "ANÁLISIS" },
  evaluaciones: { key: "evaluaciones", label: "Evaluación de clientes", icon: "star", sec: "ANÁLISIS" },
  "asistente-ia": { key: "asistente-ia", label: "Asistente inteligente", icon: "sparkle", sec: "ANÁLISIS" },
  "pedidos-web": { key: "pedidos-web", label: "Pedidos en línea", icon: "shop", sec: "OPERACIÓN" },
  "auditoria-foto": { key: "auditoria-foto", label: "Auditoría de inventario a distancia", icon: "camera", sec: "OPERACIÓN" },
  mensajes: { key: "mensajes", label: "Mensajes", icon: "message", sec: "COMUNICACIÓN", badge: "mensajesNoLeidos" },
  correo: { key: "correo", label: "Correo interno", icon: "mail", sec: "COMUNICACIÓN", badge: "correosNoLeidos" },
  feed: { key: "feed", label: "Comunidad (feed)", icon: "megaphone", sec: "COMUNICACIÓN", badge: "feedNuevos" },
  capacitacion: { key: "capacitacion", label: "Capacitación", icon: "book", sec: "APRENDIZAJE" },
  acervo: { key: "acervo", label: "Acervo de conocimiento", icon: "video", sec: "APRENDIZAJE" },
  "tablero-dw": { key: "tablero-dw", label: "Tablero DW", icon: "chart", sec: "ANÁLISIS" },
  "control-etl": { key: "control-etl", label: "Control de ETL", icon: "refresh", sec: "ANÁLISIS" },
  configuracion: { key: "configuracion", label: "Configuración", icon: "settings", sec: "CONFIGURACIÓN" },
  documentos: { key: "documentos", label: "Documentos de la clínica", icon: "file", sec: "CADENA" },
  calculos: { key: "calculos", label: "Cálculos del sistema", icon: "clipboard", sec: "UTILERÍAS" },
  validacion: { key: "validacion", label: "Validación", icon: "check", sec: "UTILERÍAS" },
  catalogos: { key: "catalogos", label: "Catálogos", icon: "building", sec: "UTILERÍAS" },
  "consulta-bd": { key: "consulta-bd", label: "Consulta a base de datos", icon: "search", sec: "UTILERÍAS" },
  entrega: { key: "entrega", label: "Entrega", icon: "box", sec: "UTILERÍAS" },
  "consulta-asistente": { key: "consulta-asistente", label: "Consulta asistente", icon: "message", sec: "UTILERÍAS" },
  // ── Incorporado de Pie Firme (V3)
  expediente: { key: "expediente", label: "Expediente clínico", icon: "file", sec: "CLÍNICA" },
  "historia-clinica": { key: "historia-clinica", label: "Historia clínica e impresos", icon: "clipboard", sec: "CLÍNICA" },
  "fotos-evolucion": { key: "fotos-evolucion", label: "Fotos y evolución", icon: "image", sec: "CLÍNICA" },
  formatos: { key: "formatos", label: "Formatos y consentimientos", icon: "edit", sec: "CLÍNICA" },
  "planes-trat": { key: "planes-trat", label: "Planes de tratamiento", icon: "activity", sec: "CLÍNICA" },
  "pie-diabetico": { key: "pie-diabetico", label: "Pie diabético", icon: "heart", sec: "CLÍNICA" },
  plantillas: { key: "plantillas", label: "Plantillas ortopédicas", icon: "flask", sec: "CLÍNICA" },
  "esterilizacion-lotes": { key: "esterilizacion-lotes", label: "Lotes de esterilización", icon: "sparkle", sec: "CLÍNICA" },
  quejas: { key: "quejas", label: "Quejas y derechos ARCO", icon: "alert", sec: "OPERACIÓN" },
  seguimiento: { key: "seguimiento", label: "Seguimiento de pacientes (CRM)", icon: "phone", sec: "OPERACIÓN" },
  horarios: { key: "horarios", label: "Horarios, bloqueos y festivos", icon: "clock", sec: "OPERACIÓN" },
  "lista-espera": { key: "lista-espera", label: "Lista de espera", icon: "users", sec: "OPERACIÓN" },
  recordatorios: { key: "recordatorios", label: "Recordatorios de cita", icon: "bell", sec: "OPERACIÓN" },
  "mi-agenda": { key: "mi-agenda", label: "Mi agenda", icon: "calendar", sec: "CLÍNICA" },
  facturacion: { key: "facturacion", label: "Facturación (CFDI)", icon: "receipt", sec: "CAJA" },
  paquetes: { key: "paquetes", label: "Paquetes y membresías", icon: "tag", sec: "CAJA" },
  "expediente-producto": { key: "expediente-producto", label: "Expediente de producto", icon: "box", sec: "INVENTARIO" },
  "expediente-proveedor": { key: "expediente-proveedor", label: "Expediente de proveedor", icon: "truck", sec: "INVENTARIO" },
  mantenimiento: { key: "mantenimiento", label: "Mantenimiento de equipos", icon: "settings", sec: "OPERACIÓN" },
  comisiones: { key: "comisiones", label: "Comisiones por servicio", icon: "dollar", sec: "PERSONAS" },
  dashboard: { key: "dashboard", label: "Dashboard financiero", icon: "chart", sec: "FINANZAS" },
  "resumen-semanal": { key: "resumen-semanal", label: "Resumen semanal", icon: "calendar", sec: "FINANZAS" },
  ingresos: { key: "ingresos", label: "Ingresos", icon: "trending", sec: "FINANZAS" },
  cuentas: { key: "cuentas", label: "Cuentas por cobrar y pagar", icon: "wallet", sec: "FINANZAS" },
  conciliacion: { key: "conciliacion", label: "Conciliación bancaria", icon: "repeat", sec: "FINANZAS" },
  fondo: { key: "fondo", label: "Fondo revolvente", icon: "cash", sec: "FINANZAS" },
  cierres: { key: "cierres", label: "Cierres de periodo", icon: "lock", sec: "FINANZAS" },
  importar: { key: "importar", label: "Importación de datos (IA)", icon: "download", sec: "UTILERÍAS" },
  exportar: { key: "exportar", label: "Exportación de datos", icon: "send", sec: "UTILERÍAS" },
  salud: { key: "salud", label: "Salud y errores", icon: "activity", sec: "UTILERÍAS" },
  "datos-prueba": { key: "datos-prueba", label: "Datos de prueba", icon: "list", sec: "UTILERÍAS" },
  suscripcion: { key: "suscripcion", label: "Suscripción", icon: "card", sec: "CONFIGURACIÓN" },
  rannix: { key: "rannix", label: "Panel RANNIX (multi-clínica)", icon: "building", sec: "CONFIGURACIÓN" },
};
const it = (...keys) => keys.map((k) => ITEMS[k]);
const COM = ["mensajes", "correo", "feed", "capacitacion", "acervo"];
const DOC = ["documentos"];

export const ROLES = {
  recepcion: {
    nombre: "Recepción", icono: "calendar", color: "#7b5ea7", secTabs: "OPERACIÓN",
    tabs: [
      { key: "agenda", label: "Agenda", icon: "calendar" },
      { key: "pacientes", label: "Pacientes", icon: "users" },
      { key: "sala", label: "Sala", icon: "clock" },
      { key: "pendientes", label: "Pendientes", icon: "bell", badge: "recepcionPendientes" },
    ],
    mas: [{ key: "convenios", label: "Convenios y membresías", icon: "tag", sec: "OPERACIÓN" }, ...it("expediente", "lista-espera", "recordatorios", "horarios", "seguimiento", "quejas", "paquetes"), ...it("checador", "mis-bonos", "evaluaciones", ...DOC, ...COM)],
    fab: { tab: "agenda" },
  },
  podologo: {
    nombre: "Podólogo", icono: "activity", color: "#0f766e", secTabs: "CLÍNICA",
    tabs: [
      { key: "hoy", label: "Hoy", icon: "calendar", badge: "podologoHoy" },
      { key: "consulta", label: "Consulta", icon: "activity", central: true },
      { key: "pacientes", label: "Pacientes", icon: "users" },
      { key: "ordenes", label: "Órdenes", icon: "flask", badge: "podologoOrdenes" },
    ],
    mas: [
      { key: "productividad", label: "Mi productividad y comisión", icon: "chart", sec: "PERSONAS" },
      { key: "recetas", label: "Recetas", icon: "file", sec: "CLÍNICA" },
      ...it("mi-agenda", "expediente", "historia-clinica", "fotos-evolucion", "planes-trat", "pie-diabetico", "plantillas", "formatos"),
      ...it("checador", "mis-bonos", "evaluaciones", ...DOC, ...COM),
    ],
  },
  asistente: {
    nombre: "Asistente clínico", icono: "sparkle", color: "#0369a1", secTabs: "CLÍNICA",
    tabs: [
      { key: "hoy", label: "Hoy", icon: "calendar" },
      { key: "esterilizacion", label: "Esteriliz.", icon: "sparkle", central: true, badge: "asistenteSets" },
      { key: "insumos", label: "Insumos", icon: "box" },
      { key: "bitacoras", label: "Bitácoras", icon: "clipboard", badge: "asistenteBitacoras" },
    ],
    mas: [...it("esterilizacion-lotes", "checador", "mis-bonos", ...DOC, ...COM)],
  },
  cajero: {
    nombre: "Cajero", icono: "cart", color: "#b45309", secTabs: "CAJA",
    tabs: [
      { key: "cobrar", label: "Cobrar", icon: "cart", central: true },
      { key: "porcobrar", label: "Por cobrar", icon: "wallet", badge: "cajeroPorCobrar" },
      { key: "apartados", label: "Apartados", icon: "bookmark" },
      { key: "caja", label: "Caja", icon: "cash", badge: "cajeroCaja" },
    ],
    mas: [
      { key: "devoluciones", label: "Devoluciones", icon: "undo", sec: "CAJA" },
      { key: "ventas-turno", label: "Ventas del turno", icon: "receipt", sec: "CAJA" },
      { key: "nuevo-apartado", label: "Nuevo apartado", icon: "bookmark", sec: "CAJA" },
      { key: "venta-plazos", label: "Venta a plazos / crédito", icon: "card", sec: "CAJA" },
      ...it("facturacion", "paquetes"),
      ...it("pedidos-web", "checador", "mis-bonos", ...DOC, ...COM),
    ],
  },
  almacen: {
    nombre: "Almacén", icono: "box", color: "#4d7c0f", secTabs: "INVENTARIO",
    tabs: [
      { key: "existencias", label: "Existencias", icon: "box" },
      { key: "recibir", label: "Recibir", icon: "download", central: true, badge: "almacenRecibir" },
      { key: "traspasos", label: "Traspasos", icon: "repeat" },
      { key: "conteo", label: "Conteo", icon: "clipboard" },
    ],
    mas: [
      { key: "ajustes", label: "Ajustes de inventario", icon: "edit", sec: "INVENTARIO" },
      { key: "entrega-lab", label: "Entrega de plantillas", icon: "flask", sec: "INVENTARIO" },
      ...it("expediente-producto", "expediente-proveedor"),
      ...it("reparto-central"),
      ...it("captura-compra", "auditoria-foto", "pedidos-web", "checador", "mis-bonos", ...DOC, ...COM),
    ],
  },
  gerente: {
    nombre: "Gerente de sucursal", icono: "shield", color: "#6d28d9", secTabs: "SUCURSAL",
    tabs: [
      { key: "hoy", label: "Hoy", icon: "chart" },
      { key: "autorizar", label: "Autorizar", icon: "shield", central: true, badge: "gerenteAutorizar" },
      { key: "cajacartera", label: "Caja y cartera", icon: "cash" },
      { key: "alertas", label: "Alertas", icon: "bell", badge: "gerenteAlertas" },
    ],
    mas: [
      { key: "agenda-sucursal", label: "Agenda de la sucursal", icon: "calendar", sec: "SUCURSAL" },
      { key: "equipo", label: "Equipo y rotación", icon: "users", sec: "PERSONAS" },
      { key: "precios-consulta", label: "Precios (consulta)", icon: "tag", sec: "SUCURSAL" },
      ...it("expediente", "facturacion", "horarios", "lista-espera", "recordatorios", "seguimiento", "quejas", "mantenimiento", "dashboard", "resumen-semanal", "fondo", "esterilizacion-lotes"),
      ...it("rh", "bonos", "checador", "gastos", "edr", "analisis", "evaluaciones", "asistente-ia", "pedidos-web", "auditoria-foto", "tablero-dw", "documentos", "catalogos", ...COM),
    ],
  },
  admin: {
    nombre: "Administración y Dirección", icono: "chart", color: "#be185d", secTabs: "DIRECCIÓN",
    tabs: [
      { key: "consolidado", label: "Consolidado", icon: "chart" },
      { key: "autorizar", label: "Autorizar", icon: "shield", central: true, badge: "adminAutorizar" },
      { key: "precios", label: "Precios", icon: "tag" },
      { key: "compras", label: "Compras", icon: "box", badge: "adminCompras" },
    ],
    mas: [
      ...it("tablero-dueno", "reparto-central", "dormidos", "demo-consulta"),
      ...it("edr", "analisis", "asistente-ia", "evaluaciones"),
      ...it("gastos", "captura-compra"),
      ...it("rh", "bonos", "checador"),
      ...it("pedidos-web", "auditoria-foto"),
      ...it("dashboard", "resumen-semanal", "ingresos", "cuentas", "conciliacion", "fondo", "cierres", "facturacion", "paquetes", "comisiones", "mantenimiento"),
      ...it("expediente", "historia-clinica", "fotos-evolucion", "planes-trat", "pie-diabetico", "plantillas", "esterilizacion-lotes", "formatos", "quejas", "seguimiento", "horarios", "lista-espera", "recordatorios"),
      ...it("expediente-producto", "expediente-proveedor", "importar", "exportar", "salud", "datos-prueba", "suscripcion", "rannix"),
      { key: "parametros", label: "Parámetros por sucursal", icon: "settings", sec: "CONFIGURACIÓN" },
      { key: "usuarios", label: "Usuarios y roles", icon: "users", sec: "CONFIGURACIÓN" },
      { key: "rotacion", label: "Rotación de podólogos", icon: "repeat", sec: "PERSONAS" },
      { key: "reportes", label: "Reportes", icon: "chart", sec: "ANÁLISIS" },
      { key: "bitacora", label: "Bitácora de auditoría", icon: "clipboard", sec: "ANÁLISIS" },
      ...it("tablero-dw", "control-etl", "configuracion", "documentos", "calculos", "validacion", "catalogos", "consulta-bd", "entrega", "consulta-asistente"),
      ...it(...COM),
    ],
  },
};

/** Orden de las secciones en el menú lateral. */
export const ORDEN_SECCIONES = ["DIRECCIÓN", "SUCURSAL", "OPERACIÓN", "CAJA", "CLÍNICA", "INVENTARIO", "PERSONAS", "FINANZAS", "ANÁLISIS", "CADENA", "COMUNICACIÓN", "APRENDIZAJE", "CONFIGURACIÓN", "UTILERÍAS"];

/** Menú lateral de escritorio: [{ sec, items:[{key,label,icon,to,badge?}] }] agrupado por sección. */
export function menuLateral(app) {
  const cfg = ROLES[app];
  if (!cfg) return [];
  const grupos = {};
  const poner = (sec, item) => { (grupos[sec] ||= []).push(item); };
  cfg.tabs.forEach((t) => poner(cfg.secTabs || "OPERACIÓN", { ...t, to: `/${t.key}` }));
  cfg.mas.forEach((m) => poner(m.sec || "MÁS", { ...m, to: `/mas/${m.key}` }));
  const orden = [...ORDEN_SECCIONES, ...Object.keys(grupos).filter((s) => !ORDEN_SECCIONES.includes(s))];
  return orden.filter((s) => grupos[s]).map((sec) => ({ sec, items: grupos[sec] }));
}

/** Rol de cuenta → app que se abre. El rol sale de la cuenta, no del ícono de entrada. */
export function appDeRol(rol) {
  return rol === "direccion" ? "admin" : ROLES[rol] ? rol : null;
}
export const NOMBRE_ROL = {
  recepcion: "Recepción", podologo: "Podólogo", asistente: "Asistente clínico", cajero: "Cajero", almacen: "Almacén",
  gerente: "Gerente", admin: "Administración central", direccion: "Dirección",
};

// Modo presentación (demo para los dueños): oculta del menú lo técnico. Se activa desde el menú de presentación (recarga la página).
const TECNICAS = new Set(["salud", "datos-prueba", "rannix", "suscripcion", "consulta-bd", "importar", "exportar", "calculos", "validacion", "catalogos", "entrega", "consulta-asistente", "control-etl", "tablero-dw", "configuracion", "bitacora", "usuarios", "parametros"]);
try {
  if (typeof localStorage !== "undefined" && localStorage.getItem("pc.presentacion") === "1") {
    Object.values(ROLES).forEach((cfg) => { cfg.mas = cfg.mas.filter((m) => !TECNICAS.has(m.key)); });
  }
} catch { /* sin almacenamiento */ }
