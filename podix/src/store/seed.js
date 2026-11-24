// Datos de demostración generados (deterministas). Todo es ficticio.
// Fechas relativas a "hoy" del momento en que se crea la semilla.
import { ymd } from "../lib/format.js";
import { conDominios } from "./dominios/index.js";

const pad = (n) => String(n).padStart(2, "0");
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pie Clinic: 7 sucursales. S6 = Centenario (Álvaro Obregón, CDMX) alberga además el ALMACÉN CENTRAL y compras.
export const SUCURSALES = ["Chalco Centro", "Patio Valle de Chalco", "Centro Tepozán (Los Reyes)", "Galerías Ixtapaluca", "Sendero Ixtapaluca", "Centenario", "Pabellón del Valle"];
const ZONAS = ["Chalco, Edo. Méx.", "Valle de Chalco, Edo. Méx.", "Los Reyes La Paz, Edo. Méx.", "Ixtapaluca, Edo. Méx.", "Ixtapaluca, Edo. Méx.", "Álvaro Obregón, CDMX", "Benito Juárez, CDMX"];

export const PARAMS_DEFECTO = {
  vigenciaApartadoDias: 10,
  anticipoMinimoPct: 20,
  politicaAnticipoVencido: "no_devuelve", // no_devuelve | devuelve | saldo_a_favor
  prorrogaAutorizaRol: "gerente",
  interesMensualPct: 3,        // crédito abierto
  recargoUnicoPct: 5,          // ventas a plazos, una sola vez
  diasGracia: 10,
  limiteCreditoGerente: 2000,
  limiteCreditoAdmin: 10000,
  limiteAjusteGerente: 500,
};

export function crearSeed() {
  const r = mulberry32(20261116);
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const F = (n) => { const x = new Date(base); x.setDate(x.getDate() + n); return ymd(x); };
  const DT = (n, h = 9, m = 0) => `${F(n)}T${pad(h)}:${pad(m)}`;
  const contadores = {};
  const folio = (serie, pad4 = 4) => `${serie}-${String(contadores[serie] = (contadores[serie] || 0) + 1).padStart(pad4, "0")}`;
  let seq = 0;
  const id = (p) => `${p}${++seq}`;

  // ───────── Organización
  // Datos reales entregados por Pie Clinic (el resto de las sucursales sigue con datos de ejemplo hasta recibirlos).
  const DATOS_REALES = {
    // `movil` = número de WhatsApp de la sucursal (el que publica Pie Clinic en su sitio).
    "Patio Valle de Chalco": { direccion: "Blvd. Juan Pablo II 370, Valle de Chalco Solidaridad, Edo. Méx., CP 56615 · Local en plaza (Matriz)", telefono: "55 7421 2848", movil: "55 7421 2848", horario: "Lun–Dom 8:00 – 21:00 h" },
    "Chalco Centro": { direccion: "Calle Vicente Guerrero Mz 003, Chalco Centro, Chalco de Díaz Covarrubias, Edo. Méx., CP 56604 · Plaza, Local L2 (primer local a la derecha)", telefono: "55 1115 2468", movil: "55 1698 3119", horario: "11:00 – 20:00 h" },
    "Centro Tepozán (Los Reyes)": { direccion: "Centro Tepozán, Los Reyes Acaquilpan s/n, Tepozanes, Edo. Méx., CP 56420 · Local PA C40, planta alta (frente a Cinépolis)", telefono: "55 6234 2983", movil: "55 7421 2848", horario: "11:00 – 20:00 h" },
    "Galerías Ixtapaluca": { direccion: "Blvd. Cuauhtémoc No. 3, Col. Centro, Ixtapaluca, Edo. Méx., CP 56530 · Local A8 (a lado de Modatelas)", telefono: "55 5831 9465", movil: "55 3425 8550", horario: "11:00 – 20:00 h" },
    "Sendero Ixtapaluca": { direccion: "Carretera Federal México-Cuautla 1, Col. Hacienda Las Palmas 1, Ixtapaluca, Edo. Méx., CP 56535 · Local E4 (entrada de Cinépolis, a lado de AT&T)", telefono: "55 1710 1042", movil: "55 2890 4485", horario: "10:00 – 21:00 h" },
    Centenario: { direccion: "Av. Centenario 358, Col. Merced Gómez, Álvaro Obregón, CDMX, CP 01600 · Local A2 (a un costado del OXXO)", telefono: "55 9023 9069", movil: "55 2250 5577", horario: "10:00 – 19:00 h" },
    "Pabellón del Valle": { direccion: "Av. Universidad 740, Col. Santa Cruz Atoyac, Benito Juárez, CDMX, CP 03310 · Local A2, planta baja", telefono: "55 9210 0698", movil: "55 7421 2848", horario: "11:00 – 20:00 h" },
  };
  const sucursales = SUCURSALES.map((nombre, i) => ({
    id: `S${i + 1}`, nombre, direccion: `${ZONAS[i]} · local ${10 + i * 7}`, telefono: `55 4${i}00 ${1000 + i * 111}`,
    consultorios: ["C1", "C2"], activa: true, // 2 estaciones por sucursal
    ...(DATOS_REALES[nombre] || {}),
  }));
  const ALL = sucursales.map((s) => s.id);
  const almacenes = [{ id: "CEN", nombre: "Almacén central (Centenario)" }, ...sucursales.map((s) => ({ id: s.id, nombre: `Almacén ${s.nombre}` }))];
  const params = {};
  sucursales.forEach((s, i) => { params[s.id] = { ...PARAMS_DEFECTO, interesMensualPct: [3, 3, 2.5, 3, 3.5, 3, 3][i] }; });

  // ───────── Usuarios
  const usuarios = [];
  const addU = (nombre, rol, suc, extra = {}) => {
    const u = { id: `U${usuarios.length + 1}`, nombre, rol, sucursales: suc, correo: `${rol}${usuarios.length + 1}@demo.mx`, ...extra };
    usuarios.push(u); return u;
  };
  addU("Sofía Ramírez (Dirección)", "direccion", ALL);
  addU("Héctor Salinas (Admin. central)", "admin", ALL);
  addU("Raúl Nava (Compras y almacén central · Centenario)", "almacen", ALL, { almacenCentral: true, compras: true });
  const nombresM = ["Carlos", "Luis", "Jorge", "Miguel", "Andrés", "Ricardo", "Daniel", "Fernando", "Alejandro", "Iván", "Pablo", "Sergio"];
  const nombresF = ["Ana", "María", "Laura", "Patricia", "Lucía", "Gabriela", "Elena", "Rosa", "Carmen", "Silvia", "Paula", "Diana"];
  const apellidos = ["García", "Hernández", "López", "Martínez", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Torres", "Flores", "Rivera", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Ortiz", "Ruiz", "Mendoza", "Vargas", "Castillo", "Jiménez", "Navarro"];
  const nom = (f) => `${pick(f ? nombresF : nombresM)} ${pick(apellidos)}`;
  sucursales.forEach((s) => {
    addU(`${nom(r() > 0.5)} (Gerente ${s.nombre})`, "gerente", [s.id]);
    addU(`${nom(true)} (Caja ${s.nombre})`, "cajero", [s.id]);
    addU(`${nom(false)} (Caja ${s.nombre})`, "cajero", [s.id]);
    addU(`${nom(true)} (Recepción ${s.nombre})`, "recepcion", [s.id]);
    addU(`${nom(false)} (Almacén ${s.nombre})`, "almacen", [s.id]);
    addU(`${nom(true)} (Asistente ${s.nombre})`, "asistente", [s.id]);
  });
  const podologos = [];
  for (let i = 0; i < 10; i++) {
    podologos.push(addU(`${i % 2 ? "Dra." : "Dr."} ${nom(i % 2 === 1)}`, "podologo", [ALL[i % 7], ALL[(i + 1) % 7]]));
  }

  // ───────── Catálogo
  const mkP = (sku, nombre, categoria, tipo, precio, costo, minimo) => ({ id: `P${String(seq = seq + 1).padStart(2, "0")}`, sku, nombre, categoria, tipo, precioBase: precio, costo, minimo });
  seq = 0;
  const productos = [
    mkP("BAS-001", "Bastón aluminio", "Bastones", "venta", 380, 210, 6),
    mkP("BAS-002", "Bastón 4 puntas", "Bastones", "venta", 520, 300, 4),
    mkP("AND-001", "Andadera plegable", "Andaderas", "venta", 1800, 1050, 3),
    mkP("AND-002", "Andadera con ruedas", "Andaderas", "venta", 2600, 1500, 2),
    mkP("PLA-001", "Plantilla confort T25", "Plantillas", "venta", 450, 95, 8),
    mkP("PLA-002", "Plantilla confort T27", "Plantillas", "venta", 450, 95, 8),
    mkP("PLA-003", "Plantilla diabético T26", "Plantillas", "venta", 780, 210, 5),
    mkP("CAL-001", "Calzado diabético T26", "Calzado", "venta", 1100, 620, 4),
    mkP("CAL-002", "Calzado ortopédico T28", "Calzado", "venta", 1250, 700, 3),
    mkP("CRE-001", "Crema hidratante 100 ml", "Cremas", "venta", 120, 62, 12),
    mkP("CRE-002", "Crema urea 10 % 100 ml", "Cremas", "venta", 160, 85, 10),
    mkP("CAL-010", "Calcetas diabético par", "Calcetas", "venta", 140, 60, 15),
    mkP("INS-001", "Cuchilla desechable #15", "Insumos", "insumo", 0, 6, 40),
    mkP("INS-002", "Gasa estéril", "Insumos", "insumo", 0, 3, 80),
    mkP("INS-003", "Guantes de nitrilo (par)", "Insumos", "insumo", 0, 4, 60),
    mkP("INS-004", "Antiséptico 500 ml", "Insumos", "insumo", 0, 70, 6),
    mkP("INS-005", "Apósito hidrocoloide", "Insumos", "insumo", 0, 38, 20),
    mkP("INS-006", "Ácido salicílico 40 %", "Insumos", "insumo", 0, 55, 6),
    mkP("INS-007", "Lidocaína 2 % ampolleta", "Insumos", "insumo", 0, 18, 20),
    mkP("INS-008", "Fresa desechable", "Insumos", "insumo", 0, 12, 30),
    mkP("INS-009", "Campo estéril", "Insumos", "insumo", 0, 9, 40),
    mkP("INS-010", "Bolsa para autoclave", "Insumos", "insumo", 0, 7, 50),
    // Pie Clinic: plantillas a medida (laboratorio externo), movilidad y soportes. Van al final para no mover los ids anteriores.
    mkP("PLA-010", "Plantilla a medida de piel", "Plantillas", "venta", 1450, 520, 6),
    mkP("PLA-011", "Plantilla a medida de pelite", "Plantillas", "venta", 1100, 380, 8),
    mkP("PLA-012", "Plantilla a medida de plastazote", "Plantillas", "venta", 1300, 450, 6),
    mkP("MUL-001", "Muletas de aluminio (par)", "Muletas", "venta", 650, 340, 4),
    mkP("BAS-003", "Bastón ajustable con empuñadura ergonómica", "Bastones", "venta", 450, 240, 6),
    mkP("ROD-001", "Rodillera elástica", "Rodilleras", "venta", 380, 170, 8),
    mkP("ROD-002", "Rodillera con soporte lateral", "Rodilleras", "venta", 690, 320, 5),
    mkP("SIL-001", "Silla de ruedas plegable", "Sillas de ruedas", "venta", 4800, 3100, 2),
    mkP("CAL-003", "Calzado ortopédico dama T24", "Calzado", "venta", 1350, 760, 3),
  ];
  // Marca y línea (para margen por marca/línea en el tablero). Las plantillas a medida se fabrican en laboratorio externo.
  const MARCA_LINEA = {
    Bastones: ["Apex Mobility", "Movilidad"], Andaderas: ["Apex Mobility", "Movilidad"], Muletas: ["Apex Mobility", "Movilidad"], "Sillas de ruedas": ["Apex Mobility", "Movilidad"],
    Plantillas: ["Pie Clinic Lab", "Plantillas a medida"], Calzado: ["Podoflex", "Calzado ortopédico"], Cremas: ["DermaPie", "Cuidado de la piel"],
    Calcetas: ["DermaPie", "Cuidado de la piel"], Rodilleras: ["OrtoSoft", "Soportes"], Insumos: ["Insumos clínicos", "Insumos"],
  };
  productos.forEach((p) => {
    [p.marca, p.linea] = MARCA_LINEA[p.categoria] || ["Pie Clinic", "General"];
    if (/^PLA-01[0-2]$/.test(p.sku)) { p.laboratorioExterno = true; p.material = p.sku === "PLA-010" ? "piel" : p.sku === "PLA-011" ? "pelite" : "plastazote"; }
    if (p.sku === "PLA-003") p.linea = "Plantillas diabético";
  });
  const vP = productos.filter((p) => p.tipo === "venta");
  const iP = productos.filter((p) => p.tipo === "insumo");
  const pid = (sku) => productos.find((p) => p.sku === sku).id;
  const servicios = [
    ["Consulta de valoración", 30, 350, []], ["Quiropodia", 45, 450, [["INS-001", 2], ["INS-002", 4]]],
    ["Onicocriptosis", 45, 700, [["INS-001", 1], ["INS-007", 1], ["INS-002", 4]]], ["Matricectomía química", 60, 1200, [["INS-006", 1], ["INS-007", 1]]],
    ["Tratamiento de verruga plantar", 30, 650, [["INS-006", 1]]], ["Láser para hongos", 30, 800, [["INS-002", 2]]],
    ["Curación pie diabético", 40, 500, [["INS-005", 1], ["INS-002", 6], ["INS-004", 1]]], ["Pedicura médica", 60, 400, [["INS-008", 1], ["INS-002", 2]]],
    ["Ortonixia (corrector de uña)", 45, 900, []], ["Toma de huella / escáner", 30, 300, []],
    ["Estudio biomecánico", 50, 600, []], ["Ondas de choque", 30, 900, []],
    ["Corte de uñas", 30, 350, [["INS-001", 1], ["INS-002", 2]]], ["Uña encarnada (espiculotomía)", 45, 800, [["INS-001", 1], ["INS-007", 1], ["INS-002", 4]]],
    ["Extracción de uña (con curaciones +3, +7 y +14)", 60, 1500, [["INS-007", 1], ["INS-005", 1], ["INS-002", 6]]], ["Estudio de pisada", 40, 600, []],
    ["Curación posterior a extracción", 20, 250, [["INS-002", 3], ["INS-004", 1]]],
  ].map(([nombre, duracion, precio, cons], i) => ({ id: `SV${i + 1}`, nombre, duracion, precioBase: precio, consumo: cons.map(([sku, cant]) => ({ productoId: pid(sku), cant })) }));
  const pctSuc = [0, 5, -3, 0, 2, 8, 0];
  const ajustesPrecio = sucursales.map((s, i) => ({ sucursalId: s.id, tipo: "*", itemId: "*", pct: pctSuc[i] }));
  ajustesPrecio.push({ sucursalId: "S2", tipo: "servicio", itemId: "SV2", pct: 2 });
  ajustesPrecio.push({ sucursalId: "S6", tipo: "producto", itemId: pid("PLA-003"), pct: 10 });

  // ───────── Inventario (capas PEPS)
  const capas = [];
  almacenes.forEach((a) => {
    productos.forEach((p, k) => {
      const mult = a.id === "CEN" ? 6 : 1;
      const n = a.id === "CEN" ? 2 : r() > 0.6 ? 2 : 1;
      for (let c = 0; c < n; c++) {
        let cant = int(Math.ceil(p.minimo * 0.5), Math.ceil(p.minimo * 1.6)) * mult;
        if (a.id !== "CEN" && p.id === pid("BAS-001") && a.id === "S1") cant = 2; // para alertas de demo
        if (a.id !== "CEN" && (k + Number(a.id.slice(1) || 0)) % 11 === 0) cant = Math.max(0, Math.floor(p.minimo * 0.4));
        if (cant <= 0) continue;
        capas.push({ id: id("CP"), almacenId: a.id, productoId: p.id, fecha: F(-90 + c * 40 + int(0, 10)), cant, costo: Math.round(p.costo * (1 + c * 0.06) * 100) / 100, lote: `L-${int(1000, 9999)}` });
      }
    });
  });

  // ───────── Pacientes
  const alertasPos = [["Diabetes tipo 2"], ["Diabetes tipo 2", "Anticoagulado"], ["Alergia: látex"], ["Hipertensión"], ["Neuropatía periférica"], [], [], [], [], []];
  const convenios = [
    { id: "CV1", nombre: "Asilo San José", tipo: "asilo", descuentoPct: 15 },
    { id: "CV2", nombre: "Industrias del Norte (empresa)", tipo: "empresa", descuentoPct: 10 },
    { id: "CV3", nombre: "Seguros Atlas", tipo: "aseguradora", descuentoPct: 0 },
    { id: "CV4", nombre: "Club Deportivo Pumas", tipo: "club", descuentoPct: 12 },
  ];
  const pacientes = [];
  for (let i = 0; i < 160; i++) {
    const f = r() > 0.5;
    const nombres = pick(f ? nombresF : nombresM);
    const ap = `${pick(apellidos)} ${pick(apellidos)}`;
    const ny = int(1938, 2014);
    pacientes.push({
      id: `PA${i + 1}`, folio: `EXP-${String(i + 1).padStart(6, "0")}`, nombres, apellidos: ap,
      nacimiento: `${ny}-${pad(int(1, 12))}-${pad(int(1, 28))}`, sexo: f ? "F" : "M",
      telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}`, whatsapp: r() > 0.2, correo: r() > 0.4 ? `${nombres.toLowerCase()}${i}@correo.mx` : "",
      domicilio: `Calle ${int(1, 40)} #${int(1, 200)}, Col. ${pick(["Centro", "Roma", "Del Valle", "Narvarte", "Doctores", "Anáhuac"])}`,
      ocupacion: pick(["Jubilado/a", "Docente", "Comerciante", "Chofer", "Enfermero/a", "Hogar", "Deportista", "Oficinista"]),
      emergencia: { nombre: nom(r() > 0.5), telefono: `55 ${int(1000, 9999)} ${int(1000, 9999)}` },
      origen: pick(["Plaza comercial", "Google", "Facebook", "Recomendación"]),
      convenioId: r() > 0.85 ? pick(convenios).id : null,
      alertas: ny > 2008 ? [] : pick(alertasPos), sucursalAlta: pick(ALL),
      avisoFirmado: true, consentimientoFirmado: true, tutor: ny > 2008 ? { nombre: nom(true), parentesco: "Madre" } : null, activo: true,
    });
  }

  // ───────── Citas, consultas, ventas
  const citas = [], consultas = [], ventas = [];
  const precioItem = (suc, tipo, item) => {
    const aj = ajustesPrecio.find((a) => a.sucursalId === suc && a.tipo === tipo && a.itemId === item.id) || ajustesPrecio.find((a) => a.sucursalId === suc && a.tipo === "*");
    const pct = aj ? aj.pct : 0;
    return { pct, precio: Math.round(item.precioBase * (1 + pct / 100) * 100) / 100 };
  };
  const turnos = [];
  const turnoHoy = {};
  sucursales.forEach((s) => {
    const cj = usuarios.find((u) => u.rol === "cajero" && u.sucursales[0] === s.id);
    const t = { id: id("TU"), sucursalId: s.id, cajeroId: cj.id, turno: "Matutino", fondo: 1500, abiertoEn: DT(0, 8, 0), cerradoEn: null, estado: "abierto", movimientos: [], corte: null };
    turnos.push(t); turnoHoy[s.id] = t;
  });
  sucursales.forEach((s, i) => {
    const cj = usuarios.filter((u) => u.rol === "cajero" && u.sucursales[0] === s.id)[1];
    const dif = i === 1 ? -45 : i === 4 ? 30 : 0;
    const esperado = { efectivo: 1500 + int(3000, 7000), tarjeta: int(5000, 15000), transferencia: int(1000, 4000) };
    turnos.push({ id: id("TU"), sucursalId: s.id, cajeroId: cj.id, turno: "Vespertino", fondo: 1500, abiertoEn: DT(-1, 14, 0), cerradoEn: DT(-1, 20, 5), estado: "cerrado", movimientos: [],
      corte: { fecha: F(-1), filas: Object.entries(esperado).map(([forma, e]) => ({ forma, esperado: e, contado: forma === "efectivo" ? e + dif : e, diferencia: forma === "efectivo" ? dif : 0 })), justificacion: dif ? "Cambio mal dado (por revisar)" : "", entregaId: cj.id, recibeId: usuarios.find((u) => u.rol === "cajero" && u.sucursales[0] === s.id).id, estado: dif ? "diferencia_pendiente" : "conforme" } });
  });
  const ocup = new Set();
  const ahoraH = new Date().getHours();
  for (let d = -5; d <= 4; d++) {
    podologos.forEach((p, pi) => {
      const suc = p.sucursales[(d + 100) % 2];
      const nCitas = int(3, 5);
      const horas = [9, 10, 11, 12, 13, 15, 16, 17].sort(() => r() - 0.5).slice(0, nCitas).sort((a, b) => a - b);
      horas.forEach((h) => {
        let cons = ["C1", "C2"][pi % 2], tries = 0;
        while (ocup.has(`${suc}|${F(d)}|${h}|${cons}`) && tries++ < 2) cons = ["C1", "C2"][(["C1", "C2"].indexOf(cons) + 1) % 2];
        if (ocup.has(`${suc}|${F(d)}|${h}|${cons}`)) return;
        ocup.add(`${suc}|${F(d)}|${h}|${cons}`);
        const pac = pick(pacientes), sv = pick(servicios);
        let estado;
        if (d < 0) estado = r() < 0.88 ? "atendida" : r() < 0.5 ? "no_asistio" : "cancelada";
        else if (d === 0) estado = h < ahoraH ? "atendida" : h === ahoraH ? "en_atencion" : pick(["confirmada", "confirmada", "por_confirmar"]);
        else estado = pick(["agendada", "por_confirmar", "confirmada", "confirmada"]);
        const cita = { id: id("CI"), pacienteId: pac.id, servicioId: sv.id, podologoId: p.id, consultorioId: cons, sucursalId: suc, inicio: DT(d, h, 0), duracion: sv.duracion, estado, recordatorio: "whatsapp", aDomicilio: false, serieId: null };
        citas.push(cita);
        if (estado === "atendida") {
          // Por cobrar (cerrada): parte de las de hoy y, para que la caja tenga pendientes a cualquier hora, la última consulta
          // de cada podólogo de ayer y antier (el paciente quedó de pasar a pagar).
          const ultimaDelDia = (d === -1 || d === -2) && h === horas[horas.length - 1];
          const cobrada = d < 0 ? !ultimaDelDia : r() < 0.6;
          const co = {
            id: id("CO"), citaId: cita.id, pacienteId: pac.id, podologoId: p.id, sucursalId: suc, fecha: cita.inicio, estado: cobrada ? "cobrada" : "cerrada",
            exploracion: { peso: int(55, 95), talla: (1.5 + r() * 0.3).toFixed(2), glucosa: pac.alertas.some((a) => a.startsWith("Diabetes")) ? int(95, 190) : null, presion: `${int(110, 140)}/${int(70, 90)}`, monofilamento: "Sensibilidad conservada", pulsos: "Presentes" },
            diagnostico: pick(["B35.1 Tiña de las uñas", "L60.0 Uña encarnada", "L84 Callosidades y callos", "B07 Verrugas virales", "E11.5 Pie diabético"]),
            nota: "Paciente tolera el procedimiento. Sin complicaciones. Se dan indicaciones de cuidado en casa.",
            indicaciones: "Secar entre los dedos; calzado amplio.", servicios: [{ servicioId: sv.id, cant: 1 }],
            consumo: sv.consumo.map((c) => ({ ...c })), fotos: [], sesion: "1/1",
          };
          consultas.push(co);
          if (cobrada) {
            const cj = usuarios.find((u) => u.rol === "cajero" && u.sucursales[0] === suc);
            const { pct, precio } = precioItem(suc, "servicio", sv);
            const partidas = [{ tipo: "servicio", itemId: sv.id, nombre: sv.nombre, cant: 1, precioLista: sv.precioBase, ajustePct: pct, precio, importe: precio }];
            if (r() < 0.3) {
              const pr = pick(vP); const x = precioItem(suc, "producto", pr);
              partidas.push({ tipo: "producto", itemId: pr.id, nombre: pr.nombre, cant: 1, precioLista: pr.precioBase, ajustePct: x.pct, precio: x.precio, importe: x.precio, costo: pr.costo });
            }
            const total = partidas.reduce((a, b) => a + b.importe, 0);
            const forma = pick(["efectivo", "tarjeta", "tarjeta", "transferencia"]);
            const v = { id: id("VE"), folio: folio("T"), sucursalId: suc, cajeroId: cj.id, pacienteId: pac.id, consultaId: co.id, tipo: "contado", fecha: cita.inicio, partidas, subtotal: total, descuento: 0, total, pagos: [{ forma, monto: total }], estado: "pagada", facturar: false, turnoId: d === 0 ? turnoHoy[suc].id : "hist", vendedorId: p.id };
            ventas.push(v); co.ventaId = v.id;
          }
        }
      });
    });
  }

  // ───────── Apartados, crédito y planes
  const apartados = [];
  for (let i = 0; i < 10; i++) {
    const s = pick(sucursales), pr = pick(vP.filter((p) => p.precioBase >= 450)), x = precioItem(s.id, "producto", pr);
    const creado = -int(0, 14);
    const anticipo = Math.round(x.precio * (0.2 + r() * 0.3));
    apartados.push({ id: id("AP"), folio: folio("AP"), pacienteId: pick(pacientes).id, sucursalId: s.id, productoId: pr.id, nombre: pr.nombre, cant: 1, precio: x.precio, abonos: [{ fecha: F(creado), monto: anticipo }], creado: F(creado), vence: F(creado + 10), estado: "activo", prorrogas: [] });
  }
  const creditos = [], planes = [], abonosCredito = [];
  for (let i = 0; i < 14; i++) {
    const pac = pacientes[i * 7 % pacientes.length], s = pick(sucursales);
    const abierto = i % 3 === 0;
    const monto = int(15, 60) * 100, enganche = abierto ? 0 : Math.round(monto * 0.2);
    const n = abierto ? 1 : 6, cap = Math.round((monto - enganche) / n);
    const inicio = -int(10, 80);
    const pars = Array.from({ length: n }, (_, k) => ({ n: k + 1, vence: F(inicio + 15 * (k + 1)), capital: cap, pagado: 0 }));
    const pagadas = Math.min(n, Math.max(0, Math.floor((-inicio) / 15) - (i % 4 === 0 ? 2 : 0)));
    for (let k = 0; k < pagadas; k++) { pars[k].pagado = pars[k].capital; abonosCredito.push({ id: id("AB"), planId: `PL${i + 1}`, parcialidad: k + 1, monto: pars[k].capital, sucursalId: pick(ALL), fecha: pars[k].vence, cajeroId: usuarios.find((u) => u.rol === "cajero").id }); }
    creditos.push({ pacienteId: pac.id, limite: pick([2000, 3000, 5000, 8000]), bloqueado: false });
    planes.push({ id: `PL${i + 1}`, folio: folio("CR"), pacienteId: pac.id, sucursalId: s.id, tipo: abierto ? "abierto" : "plazos", monto, enganche, parcialidades: pars, creado: F(inicio), estado: pars.every((x) => x.pagado >= x.capital) ? "liquidado" : "vigente" });
  }

  // ───────── Autorizaciones
  const gerentes = usuarios.filter((u) => u.rol === "gerente");
  const cajerosU = usuarios.filter((u) => u.rol === "cajero");
  const autorizaciones = [
    ["credito", "Venta a plazos — Ana López", 4500, "admin"], ["prorroga", "Prórroga apartado AP-0003", 0, "gerente"], ["ajuste_inventario", "Bastón aluminio −1", 210, "gerente"],
    ["cancelacion", "Cancelar ticket T-0021", 399, "gerente"], ["credito", "Crédito abierto — R. Díaz", 1500, "gerente"], ["ajuste_inventario", "Plantilla T25 −6 (merma)", 570, "admin"],
    ["reapertura_corte", "Reabrir corte de ayer", 0, "gerente"], ["credito", "Venta a plazos — L. Gil", 12000, "direccion"],
  ].map(([tipo, detalle0, monto, nivel], i) => {
    // Cada solicitud apunta a un dato real de SU sucursal (`ref`), para que autorizar tenga efecto (convención en acciones.js).
    // Deterministas: no consumen números aleatorios, así el resto de la semilla no cambia.
    let s = sucursales[i % 7], detalle = detalle0, ref = null;
    const pendiente = i !== 2 && i !== 3;
    if (tipo === "prorroga") {
      const ap = apartados.find((x) => x.estado === "activo");
      if (ap) { s = sucursales.find((x) => x.id === ap.sucursalId); detalle = `Prórroga apartado ${ap.folio}`; ref = { apartadoId: ap.id, dias: 5 }; }
    } else if (tipo === "ajuste_inventario") {
      const pr = productos.find((p) => p.nombre === (i === 2 ? "Bastón aluminio" : "Plantilla confort T25"));
      const cant = i === 2 ? -1 : -6;
      if (pr && capas.filter((c) => c.almacenId === s.id && c.productoId === pr.id).reduce((a, c) => a + c.cant, 0) >= -cant) ref = { almacenId: s.id, productoId: pr.id, cant };
    } else if (tipo === "reapertura_corte") {
      const t = turnos.find((x) => x.sucursalId === s.id && x.estado === "cerrado");
      if (t) ref = { turnoId: t.id };
    } else if (tipo === "credito") {
      const pac = pacientes[(i * 11 + 3) % pacientes.length], abierto = /abierto/i.test(detalle0), n = abierto ? 1 : 4;
      detalle = `${abierto ? "Crédito abierto" : "Venta a plazos"} — ${pac.nombres} ${pac.apellidos}`;
      const planId = `PLA${i}`;
      planes.push({ id: planId, folio: `CR-P${i}`, pacienteId: pac.id, sucursalId: s.id, tipo: abierto ? "abierto" : "plazos", monto, enganche: 0,
        parcialidades: Array.from({ length: n }, (_, k) => ({ n: k + 1, vence: F(30 * (k + 1)), capital: Math.round(monto / n), pagado: 0 })), creado: F(0), estado: "pendiente_autorizacion" });
      if (!creditos.find((c) => c.pacienteId === pac.id)) creditos.push({ pacienteId: pac.id, limite: Math.max(8000, monto), bloqueado: false });
      ref = { planId };
    }
    const g = gerentes.find((x) => x.sucursales.includes(s.id)) || gerentes[i % 7];
    const cj = cajerosU.find((x) => x.sucursales.includes(s.id)) || cajerosU[i % cajerosU.length];
    return { id: id("AU"), tipo, sucursalId: s.id, solicitanteId: cj.id, detalle, monto, nivel, estado: i === 3 ? "rechazado" : i === 2 ? "autorizado" : "pendiente", fecha: F(-(i % 3)), resueltoPor: pendiente ? null : g.id, motivo: "", ref };
  });

  // ───────── Laboratorio, esterilización, bitácoras
  const laboratorios = [{ id: "LB1", nombre: "LabOrtho SA" }, { id: "LB2", nombre: "Ortesis del Valle" }];
  const ordenesLab = Array.from({ length: 42 }, (_, i) => {
    const e = ["enviada", "enviada", "retrasada", "recibida", "en_prueba", "entregada", "retrabajo", "entregada"][i % 8];
    const env = -int(2, 24);
    const suc = ALL[i % 7];
    const pods = podologos.filter((p) => p.sucursales.includes(suc));
    const tipo = pick([["Plantilla termoformada diabético", 780], ["Plantilla confort a medida", 450], ["Ortesis de silicona", 650]]);
    const pendiente = i % 9 === 0 && e === "enviada";
    return { id: id("LB"), folio: folio("LAB"), pacienteId: pick(pacientes).id, podologoId: pick(pods).id, sucursalId: suc, tipo: tipo[0], pie: pick(["Ambos", "Derecho", "Izquierdo"]), talla: pick(["25", "26", "27", "24"]), toma: pick(["Escáner 3D", "Huella"]), correcciones: "Soporte de arco longitudinal", laboratorioId: pick(laboratorios).id, enviada: F(env), prometida: F(env + 14 - (e === "retrasada" ? 8 : 0)), estado: e, costoLab: int(150, 400), anticipoPct: 50, anticipoPendiente: pendiente ? Math.round(tipo[1] * 0.5) : 0, anticipoPagado: pendiente ? 0 : Math.round(tipo[1] * 0.5) };
  });
  const sets = [], ciclos = [], usoSets = [];
  sucursales.forEach((s) => { for (let k = 1; k <= 4; k++) sets.push({ id: `SET-${s.id}-${k}`, sucursalId: s.id, nombre: `SET-0${k}`, estado: k === 1 ? "sucio" : "esterilizado" }); });
  sucursales.forEach((s, i) => {
    for (let k = 0; k < 4; k++) ciclos.push({ id: id("CC"), folio: `CIC-${20000 + i * 10 + k}`, sucursalId: s.id, autoclave: "AC-1", lote: `L-${F(-k).slice(5)}-A`, indicadorQuimico: "conforme", indicadorBiologico: k === 0 ? "pendiente" : "conforme", responsableId: usuarios.find((u) => u.rol === "asistente" && u.sucursales[0] === s.id).id, fecha: DT(-k, 8, 30), sets: [`SET-${s.id}-2`, `SET-${s.id}-3`], resultado: "conforme" });
  });
  const checklists = [];
  sucursales.forEach((s) => s.consultorios.forEach((c, k) => { ["desinfeccion", "rpbi"].forEach((t) => checklists.push({ id: id("CK"), sucursalId: s.id, fecha: F(0), tipo: t, consultorio: c, hecho: (k + t.length) % 3 === 0, por: null, hora: null })); }));

  // ───────── Compras y traspasos
  const proveedores = [{ id: "PR1", nombre: "OrtoMed SA", dias: 30 }, { id: "PR2", nombre: "Insumos Clínicos del Centro", dias: 15 }, { id: "PR3", nombre: "Calzado Salud MX", dias: 30 }, { id: "PR4", nombre: "Dermo Química", dias: 45 }];
  const oc = Array.from({ length: 6 }, (_, i) => {
    const pr = proveedores[i % 4]; const items = (i % 2 ? iP : vP).slice(i, i + 3);
    return { id: id("OC"), folio: `OC-${1180 + i}`, proveedorId: pr.id, almacenId: "CEN", fecha: F(-i * 3), estado: i < 3 ? "enviada" : i === 3 ? "recibida_parcial" : "recibida", partidas: items.map((p) => ({ productoId: p.id, cant: int(20, 60), costo: p.costo, recibido: i < 3 ? 0 : i === 3 ? 10 : 30 })), factura: i < 3 ? null : `A-${77400 + i}` };
  });
  const cxp = oc.filter((o) => o.factura).map((o, i) => ({ id: id("CX"), proveedorId: o.proveedorId, doc: o.factura, ocId: o.id, vence: F(10 - i * 9), saldo: int(2000, 18000) }));
  const traspasos = Array.from({ length: 8 }, (_, i) => {
    const dest = sucursales[(i + 1) % 7].id; const items = vP.slice(i, i + 2);
    const est = ["solicitado", "autorizado", "en_transito", "recibido", "en_transito", "solicitado", "recibido_con_diferencia", "en_transito"][i];
    return { id: id("TR"), folio: `TR-${450 + i}`, origenId: i === 6 ? "S2" : "CEN", destinoId: dest, solicitadoPor: gerentes[(i + 1) % 7].id, fecha: F(-i), estado: est, partidas: items.map((p) => ({ productoId: p.id, solicitado: int(3, 10), enviado: est === "solicitado" ? 0 : 5, recibido: est.startsWith("recibido") ? (est === "recibido_con_diferencia" ? 4 : 5) : 0 })) };
  });
  // Los traspasos ya enviados/recibidos mueven las capas PEPS (sale del origen, entra al destino) para que kardex = existencia.
  traspasos.forEach((t) => t.partidas.forEach((pt) => {
    const prod = productos.find((x) => x.id === pt.productoId);
    let resta = pt.enviado;
    capas.filter((c) => c.almacenId === t.origenId && c.productoId === pt.productoId && c.cant > 0).sort((x, y) => x.fecha.localeCompare(y.fecha))
      .forEach((c) => { const q = Math.min(c.cant, resta); c.cant -= q; resta -= q; });
    if (pt.recibido > 0) capas.push({ id: id("CP"), almacenId: t.destinoId, productoId: pt.productoId, fecha: t.fecha, cant: pt.recibido, costo: prod.costo, lote: `L-${t.folio}` });
  }));
  for (let i = capas.length - 1; i >= 0; i--) if (capas[i].cant <= 0) capas.splice(i, 1); // capas agotadas se depuran (regla capas_peps)
  const inventarios = [{ id: id("IV"), sucursalId: "S1", tipo: "ciclico", alcance: "Bastones y andaderas", estado: "abierto", responsableId: usuarios.find((u) => u.rol === "almacen" && u.sucursales[0] === "S1").id, fecha: F(0), conteo: 1, partidas: [] }];

  contadores.T = Math.max(contadores.T || 0, 1);
  const estado = {
    version: 1, creado: new Date().toISOString(), contadores, sesion: { userId: null, sucursalId: null }, sinSenal: false, cola: [],
    sucursales, almacenes, params, usuarios, productos, servicios, ajustesPrecio, listaPreciosHist: [], capas, pacientes, convenios,
    citas, consultas, ventas, devoluciones: ventas.filter((v) => v.fecha < F(-1)).slice(0, 4).map((v, k) => ({ id: `DV${k + 1}`, folio: `DV-000${k + 1}`, ventaId: v.id, sucursalId: v.sucursalId, fecha: v.fecha.slice(0, 10), monto: Math.round(v.total * 0.5), motivo: "Producto no conforme", resolucion: "reembolso", cajeroId: v.cajeroId, partidas: [] })), devolucionesProveedor: [], notasCredito: [], turnos, apartados, creditos, planes, abonosCredito, autorizaciones,
    laboratorios, ordenesLab, sets, ciclos, usoSets, checklists, proveedores, oc, cxp, traspasos, inventarios, ajustesInventario: [{ id: "AJ1", almacenId: "S2", productoId: pid("BAS-001"), cant: -1, motivo: "Merma por daño", autorizadoPor: gerentes[1].id, fecha: F(-3) }, { id: "AJ2", almacenId: "S5", productoId: pid("CRE-001"), cant: -3, motivo: "Caducidad", autorizadoPor: gerentes[4].id, fecha: F(-6) }],
    listaEspera: [], bitacora: [],
  };
  return conDominios(estado, { r, int, pick, F, DT, id, folio, nom, pad });
}
