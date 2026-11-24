// Dominio «plataforma»: módulos generales de la fábrica (Tablero DW, Control de ETL, Configuración, Documentos, Cálculos,
// Validación, Catálogos, Consulta a base de datos, Entrega y Consulta asistente).
// seed(base, util) → { config, documentos, catalogos, dw, validacion, entrega, asistenteCalif }. Determinista (usa util; nunca Math.random).
// No importa acciones_plataforma.js (evita el ciclo core → seed → dominios); el motor del DW vive en ../plataforma_dw.js, que es puro.
import { ejecutarETL } from "../plataforma_dw.js";

export const VERSION_SISTEMA = "0.2.0-demo";

export const CATEGORIAS_DOC = [
  { id: "licencia", nombre: "Licencias sanitarias" },
  { id: "aviso", nombre: "Avisos de funcionamiento" },
  { id: "renta", nombre: "Contratos de renta" },
  { id: "poliza", nombre: "Pólizas de seguro" },
  { id: "permiso", nombre: "Permisos y dictámenes" },
  { id: "rpbi", nombre: "Residuos (RPBI)" },
  { id: "contrato", nombre: "Contratos y convenios" },
  { id: "fiscal", nombre: "Fiscal y legal" },
  { id: "manual", nombre: "Manuales" },
  { id: "formato", nombre: "Formatos" },
];

export const INTEGRACIONES_BASE = [
  { id: "correo", nombre: "Correo saliente", uso: "Recordatorios, recibos y avisos por correo", proveedor: "Por definir (correo transaccional)", estado: "pendiente_llave", nota: "El correo interno funciona; hacia afuera no se envía nada." },
  { id: "whatsapp", nombre: "WhatsApp Business", uso: "Recordatorios de cita, encuestas y recetas", proveedor: "API de WhatsApp Business", estado: "simulada", nota: "La app abre el enlace de WhatsApp con el texto listo; no hay envío automático." },
  { id: "pago", nombre: "Pasarela de pago en línea", uso: "Cobro de pedidos de la tienda en línea", proveedor: "Por definir", estado: "simulada", nota: "Los pagos en línea de la tienda son simulados (referencia SIM-…)." },
  { id: "terminal", nombre: "Terminal bancaria", uso: "Cobro con tarjeta en caja", proveedor: "Por definir", estado: "pendiente_llave", nota: "Caja registra el pago con tarjeta; la terminal se opera aparte." },
  { id: "ia", nombre: "Modelo de lenguaje (IA)", uso: "Asistente inteligente", proveedor: "Por definir", estado: "simulada", nota: "El asistente responde con un motor de reglas sobre los datos; no hay modelo conectado." },
  { id: "vision", nombre: "Servicio de visión", uso: "Lectura de notas de compra y auditoría de inventario por foto", proveedor: "Por definir", estado: "simulada", nota: "Las lecturas de foto son una simulación de demostración." },
  { id: "pac", nombre: "PAC (timbrado CFDI)", uso: "Facturación electrónica y nómina", proveedor: "Por definir", estado: "pendiente_llave", nota: "Las facturas quedan «pendientes de timbrar»; no se emite CFDI." },
  { id: "bd", nombre: "Base de datos en la nube", uso: "Persistencia, usuarios y permisos en el dato", proveedor: "Supabase (pendiente)", estado: "pendiente_llave", nota: "Los datos viven en el navegador (demostración)." },
];

export const NOMBRE_SERIE = {
  T: "Tickets de venta", AP: "Apartados", CR: "Créditos y planes", LAB: "Órdenes de laboratorio", RN: "Recibos de nómina", CT: "Constancias de capacitación",
  PW: "Pedidos en línea", AF: "Auditorías por foto", INV: "Investigaciones de inventario", OC: "Órdenes de compra", TR: "Traspasos", DOC: "Documentos de la clínica", NC: "Notas de compra", DV: "Devoluciones",
};

export function seed(base, util) {
  const { F, DT, int, pick } = util;
  const admin = base.usuarios.find((u) => u.rol === "admin"), direccion = base.usuarios.find((u) => u.rol === "direccion");
  const gerenteDe = (sid) => (base.usuarios.find((u) => u.rol === "gerente" && u.sucursales.includes(sid)) || admin).id;

  // ───────── Configuración general de la cadena
  const config = {
    nombreComercial: "Pie Clinic", razonSocial: "Podología Integral del Valle, S.A. de C.V.", rfc: "PIV180312K47", regimenFiscal: "601 · General de Ley Personas Morales",
    domicilioFiscal: "Av. Centro #100, Col. Centro, Ciudad de México", cp: "06000", lugarExpedicion: "06000",
    telefono: "55 4000 1000", correo: "contacto@clinicas.example", sitio: "https://clinicas.example",
    logo: null, colorPrimario: "#7b5ea7", colorSecundario: "#0f766e",
    zonaHoraria: "America/Mexico_City", moneda: "MXN", ivaPct: 16, preciosIncluyenIva: true,
    series: Object.fromEntries(Object.keys(NOMBRE_SERIE).map((k) => [k, { nombre: NOMBRE_SERIE[k], ancho: 4 }])),
    politicas: {
      devoluciones: "Devoluciones de producto dentro de 15 días naturales con ticket y empaque original. Plantillas a medida y productos de higiene abiertos no tienen devolución.",
      privacidad: "Los datos personales y clínicos se tratan conforme al aviso de privacidad integral. El expediente clínico solo lo consulta el personal clínico que atiende al paciente.",
      cancelacionCitas: "Las citas se cancelan o reprograman con al menos 4 horas de anticipación. Dos inasistencias sin aviso requieren anticipo para la siguiente cita.",
      credito: "Crédito abierto con interés mensual y ventas a plazos con recargo único tras los días de gracia. Los límites de autorización se fijan por sucursal en Parámetros.",
    },
    integraciones: INTEGRACIONES_BASE.map((x) => ({ ...x })),
    version: VERSION_SISTEMA, actualizado: null, actualizadoPor: null,
  };

  // ───────── Catálogos generales que faltaban
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const motivos = (pref, tipo, nombres) => nombres.map((nombre, i) => ({ id: `${pref}${i + 1}`, tipo, nombre, activo: true }));
  const catalogos = {
    formasPago: [
      { id: "efectivo", nombre: "Efectivo", activa: true, sistema: true, daCambio: true },
      { id: "tarjeta", nombre: "Tarjeta", activa: true, sistema: true, daCambio: false },
      { id: "transferencia", nombre: "Transferencia", activa: true, sistema: true, daCambio: false },
      { id: "en_linea", nombre: "Pago en línea (tienda)", activa: true, sistema: true, daCambio: false },
    ],
    motivos: [
      ...motivos("MD", "devolucion", ["Producto no conforme", "Talla o medida incorrecta", "Defecto de fábrica", "Cobro duplicado", "Cambio dentro de política"]),
      ...motivos("MA", "ajuste", ["Merma", "Robo", "Daño", "Caducidad", "Error de captura", "Sobrante"]),
      ...motivos("MB", "baja", ["Renuncia voluntaria", "Término de contrato", "Abandono de trabajo", "Rescisión", "Cambio de residencia"]),
      ...motivos("MC", "cancelacion_cita", ["Paciente no puede asistir", "Reprogramada por la clínica", "Podólogo ausente", "Duplicada"]),
    ],
    categoriasProducto: [...new Set(base.productos.map((p) => p.categoria))].map((nombre) => ({ id: slug(nombre), nombre, activa: true })),
  };

  // ───────── Documentos de la clínica
  const documentos = [];
  let n = 0;
  const doc = (o) => {
    n += 1;
    const folio = `DOC-${String(n).padStart(4, "0")}`;
    const version = o.version || 1;
    const historial = [];
    for (let v = 1; v <= version; v++) historial.push({ version: v, fecha: F(o.em - (version - v) * 365), usuarioId: o.responsableId, nota: v === 1 ? "Carga inicial" : "Renovación" });
    documentos.push({
      id: `DC${n}`, folio, titulo: o.titulo, categoria: o.categoria, sucursalId: o.sucursalId ?? null, emision: F(o.em), vigencia: o.vence == null ? null : F(o.vence), responsableId: o.responsableId,
      version, emisor: o.emisor || "", numero: o.numero || "", visibilidad: o.visibilidad || "todos", estado: "vigente", notas: o.notas || "",
      archivo: o.sinArchivo ? { tipo: "ninguno", url: "", miniatura: null } : { tipo: "enlace", url: `https://documentos.clinicas.example/${folio.toLowerCase()}-v${version}.pdf`, miniatura: null },
      historial, usuarioId: o.responsableId, sucursalRegistro: o.sucursalId ?? base.sucursales[0].id, creadoEn: DT(Math.min(0, o.em), 10, 0),
    });
  };
  // Vencimientos repartidos a propósito: vencidos, a menos de 30, 60 y 90 días, y vigentes largos.
  const venceLic = [210, 24, -12, 330, 75, 150, 48];
  const venceRenta = [400, 180, 55, 620, -3, 240, 88];
  const vencePoliza = [120, 300, 18, 64, 200, -30, 260];
  const vencePC = [45, 190, 270, -45, 28, 100, 340];
  const venceRpbi = [160, 8, 220, 95, 310, 58, -8];
  const venceExt = [70, 250, 130, 15, -20, 290, 175];
  base.sucursales.forEach((s, i) => {
    const g = gerenteDe(s.id);
    doc({ titulo: `Licencia sanitaria · ${s.nombre}`, categoria: "licencia", sucursalId: s.id, em: venceLic[i] - 365, vence: venceLic[i], responsableId: g, emisor: "COFEPRIS", numero: `LS-${2200 + i * 13}-${int(100, 999)}`, version: 2 + (i % 2), notas: "Establecimiento de atención médica con procedimientos menores de uña." });
    doc({ titulo: `Aviso de funcionamiento y de responsable sanitario · ${s.nombre}`, categoria: "aviso", sucursalId: s.id, em: -900 + i * 60, vence: null, responsableId: g, emisor: "COFEPRIS", numero: `AF-${14000 + i * 77}`, notas: "No vence; se actualiza si cambia el responsable sanitario o el domicilio." });
    doc({ titulo: `Contrato de arrendamiento del local · ${s.nombre}`, categoria: "renta", sucursalId: s.id, em: venceRenta[i] - 730, vence: venceRenta[i], responsableId: g, emisor: "Arrendadora", visibilidad: "gerencia", version: 1 + (i % 3 === 0 ? 1 : 0), notas: "Renovación con 60 días de aviso. Incremento anual pactado conforme al INPC." });
    doc({ titulo: `Póliza de seguro del local y contenidos · ${s.nombre}`, categoria: "poliza", sucursalId: s.id, em: vencePoliza[i] - 365, vence: vencePoliza[i], responsableId: g, emisor: pick(["Seguros Atlas", "Aseguradora del Valle", "Mutual Metropolitana"]), numero: `P-${int(100000, 999999)}`, visibilidad: "gerencia", version: 3 });
    doc({ titulo: `Programa interno de protección civil · ${s.nombre}`, categoria: "permiso", sucursalId: s.id, em: vencePC[i] - 365, vence: vencePC[i], responsableId: g, emisor: "Protección Civil de la alcaldía", numero: `PIPC-${int(1000, 9999)}`, version: 2 });
    doc({ titulo: `Contrato de recolección de RPBI · ${s.nombre}`, categoria: "rpbi", sucursalId: s.id, em: venceRpbi[i] - 365, vence: venceRpbi[i], responsableId: g, emisor: "Recolectora Ambiental MX", numero: `RPBI-${int(10000, 99999)}`, notas: "Recolección quincenal de punzocortantes y residuos no anatómicos. Conservar manifiestos 5 años." });
    doc({ titulo: `Recarga y revisión de extintores · ${s.nombre}`, categoria: "permiso", sucursalId: s.id, em: venceExt[i] - 365, vence: venceExt[i], responsableId: g, emisor: "Servicios contra incendio", sinArchivo: i % 3 === 1, notas: i % 3 === 1 ? "Falta digitalizar la constancia." : "" });
    if (i % 2 === 0) doc({ titulo: `Licencia de anuncio exterior · ${s.nombre}`, categoria: "permiso", sucursalId: s.id, em: -200 - i * 20, vence: 165 - i * 30, responsableId: g, emisor: "Alcaldía", numero: `AN-${int(1000, 9999)}` });
    if (i % 3 === 0) doc({ titulo: `Constancia de mantenimiento de autoclave · ${s.nombre}`, categoria: "permiso", sucursalId: s.id, em: -150 - i * 9, vence: 33 + i * 9, responsableId: g, emisor: "Servicio técnico autorizado", notas: "Mantenimiento semestral y validación con indicador biológico." });
  });
  const a = admin.id, dir = direccion.id;
  doc({ titulo: "Acta constitutiva y poderes", categoria: "fiscal", em: -2800, vence: null, responsableId: dir, emisor: "Notaría pública", visibilidad: "admin" });
  doc({ titulo: "Constancia de situación fiscal", categoria: "fiscal", em: -40, vence: 50, responsableId: a, emisor: "SAT", visibilidad: "admin", version: 6, notas: "Se descarga cada trimestre para proveedores y bancos." });
  doc({ titulo: "Opinión de cumplimiento de obligaciones fiscales", categoria: "fiscal", em: -25, vence: 5, responsableId: a, emisor: "SAT", visibilidad: "admin", version: 9 });
  doc({ titulo: "Registro de marca «Clínicas de Podología»", categoria: "fiscal", em: -3300, vence: 352, responsableId: dir, emisor: "IMPI", numero: `M-${int(1000000, 1999999)}`, visibilidad: "admin", notas: "Renovación cada 10 años; declarar uso." });
  doc({ titulo: "Póliza de responsabilidad civil profesional (cadena)", categoria: "poliza", em: -310, vence: 55, responsableId: a, emisor: "Seguros Atlas", numero: `RC-${int(100000, 999999)}`, visibilidad: "gerencia", version: 4, notas: "Cubre a los podólogos de las 7 sucursales." });
  doc({ titulo: "Contrato marco con laboratorio LabOrtho SA", categoria: "contrato", em: -500, vence: 230, responsableId: a, emisor: "LabOrtho SA", visibilidad: "admin", notas: "Entrega de plantillas en 14 días. Retrabajos sin costo dentro de 30 días." });
  doc({ titulo: "Contrato marco con laboratorio Ortesis del Valle", categoria: "contrato", em: -380, vence: -15, responsableId: a, emisor: "Ortesis del Valle", visibilidad: "admin", notas: "Vencido: en negociación de tarifas." });
  doc({ titulo: "Convenio de atención · Asilo San José", categoria: "contrato", em: -290, vence: 75, responsableId: a, emisor: "Asilo San José", visibilidad: "gerencia" });
  doc({ titulo: "Convenio empresarial · Industrias del Norte", categoria: "contrato", em: -120, vence: 245, responsableId: a, emisor: "Industrias del Norte", visibilidad: "gerencia" });
  doc({ titulo: "Registro como generador de RPBI (cadena)", categoria: "rpbi", em: -1100, vence: null, responsableId: a, emisor: "SEMARNAT", numero: `NRA-${int(10000, 99999)}` });
  doc({ titulo: "Manual de operación de sucursal", categoria: "manual", em: -95, vence: null, responsableId: a, version: 4, notas: "Apertura, cierre, caja, agenda y atención al paciente." });
  doc({ titulo: "Manual de bioseguridad y esterilización", categoria: "manual", em: -60, vence: 305, responsableId: a, version: 3, notas: "Se revisa cada año. Ciclos de autoclave, indicadores químicos y biológicos, manejo de RPBI." });
  doc({ titulo: "Manual de identidad y atención al paciente", categoria: "manual", em: -400, vence: null, responsableId: dir, version: 2 });
  doc({ titulo: "Reglamento interior de trabajo", categoria: "manual", em: -620, vence: null, responsableId: a, emisor: "Depositado ante la autoridad laboral", version: 2 });
  doc({ titulo: "Guía del expediente clínico (NOM-004)", categoria: "manual", em: -210, vence: null, responsableId: a, notas: "Qué debe contener la nota clínica y cuánto se conserva el expediente." });
  doc({ titulo: "Aviso de privacidad integral", categoria: "formato", em: -180, vence: 185, responsableId: a, version: 3, notas: "Revisión anual. Es el que firma el paciente al darse de alta." });
  doc({ titulo: "Consentimiento informado de procedimientos", categoria: "formato", em: -140, vence: null, responsableId: a, version: 5 });
  doc({ titulo: "Historia clínica podológica", categoria: "formato", em: -140, vence: null, responsableId: a, version: 2 });
  doc({ titulo: "Formato de corte de caja y entrega de turno", categoria: "formato", em: -75, vence: null, responsableId: a });
  doc({ titulo: "Formato de solicitud de vacaciones y permisos", categoria: "formato", em: -260, vence: null, responsableId: a });
  doc({ titulo: "Bitácora de esterilización (respaldo en papel)", categoria: "formato", em: -330, vence: null, responsableId: a, sinArchivo: true, notas: "Para cuando no hay sistema. Pendiente de digitalizar la versión vigente." });
  base.contadores.DOC = n;

  // ───────── Data warehouse: cargas de los últimos días. Se ejecutan DE VERDAD sobre los datos sembrados (las anteriores, con corte por fecha).
  // La carga se hace al final de toda la siembra (cargarDWSemilla, desde dominios/index.js), para que incluya lo que siembran
  // los dominios posteriores (p. ej. gastos del fondo revolvente de tesorería) y el DW cuadre en cero.
  return { config, documentos, catalogos, dw: { corridas: [], tablas: {}, resumen: null }, validacion: { ultima: null, historial: [] }, entrega: { pasos: {}, acta: null }, asistenteCalif: [] };
}

/** Cargas del DW de los últimos días sobre el estado ya sembrado por TODOS los dominios (las anteriores, con corte por fecha). */
export function cargarDWSemilla(base, { F, DT }) {
  base.dw = { corridas: [], tablas: {}, resumen: null };
  for (let k = 4; k >= 1; k--) ejecutarETL(base, { origen: "semilla", corte: F(-k), ts: DT(-k, 23, 30) });
  ejecutarETL(base, { origen: "semilla", ts: DT(0, 0, 30) });
}
