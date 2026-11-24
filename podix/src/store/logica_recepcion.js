// Lógica pura de recepción y asistente (sin localStorage): empalmes, horarios libres, anti-duplicados, folios, series.
import { parse, dia, hora, sumarDias, normaliza, edad } from "../lib/format.js";

export const INACTIVAS = ["cancelada", "no_asistio"];
export const HORA_INICIO = 9 * 60;
export const HORA_FIN = 18 * 60;
export const PASO = 30;

const pad = (n) => String(n).padStart(2, "0");
export const minutosDe = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + (m || 0); };
export const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
/** Minutos absolutos (desde 1970 local, en minutos) de un "YYYY-MM-DDTHH:mm". */
export const absMin = (s) => Math.round(parse(s).getTime() / 60000);

/** Citas que se empalman con la propuesta por paciente, podólogo o consultorio (de la misma sucursal). */
export function empalmes(citas, { inicio, duracion, pacienteId, podologoId, consultorioId, sucursalId, ignorarIds = [] }) {
  const a1 = absMin(inicio), a2 = a1 + Number(duracion || 30);
  const res = [];
  for (const c of citas) {
    if (INACTIVAS.includes(c.estado) || ignorarIds.includes(c.id)) continue;
    if (dia(c.inicio) !== dia(inicio)) continue;
    const b1 = absMin(c.inicio), b2 = b1 + Number(c.duracion || 30);
    if (!(a1 < b2 && b1 < a2)) continue;
    const motivos = [];
    if (pacienteId && c.pacienteId === pacienteId) motivos.push("paciente");
    if (podologoId && c.podologoId === podologoId) motivos.push("podologo");
    if (consultorioId && c.consultorioId === consultorioId && (!sucursalId || c.sucursalId === sucursalId)) motivos.push("consultorio");
    if (motivos.length) res.push({ cita: c, motivos });
  }
  return res;
}

/** Franjas libres de 30 min (09:00–18:00) para un día. Devuelve [{hora, consultorioId}] con el primer consultorio libre. */
export function horariosLibres(d, { fecha, sucursalId, duracion, pacienteId, podologoId, ignorarIds = [], ahora = null }) {
  const suc = d.sucursales.find((s) => s.id === sucursalId);
  const consultorios = suc ? suc.consultorios : ["C1"];
  const out = [];
  const lim = ahora ? absMin(ahora) : null;
  for (let m = HORA_INICIO; m + duracion <= HORA_FIN; m += PASO) {
    const inicio = `${fecha}T${hhmm(m)}`;
    if (lim != null && absMin(inicio) < lim) continue;
    const base = empalmes(d.citas, { inicio, duracion, pacienteId, podologoId, ignorarIds });
    if (base.length) continue;
    const libre = consultorios.find((cn) => !empalmes(d.citas, { inicio, duracion, consultorioId: cn, sucursalId, ignorarIds }).length);
    if (libre) out.push({ hora: hhmm(m), consultorioId: libre });
  }
  return out;
}

/** Fechas de una serie recurrente: la inicial y K-1 más, cada N semanas. */
export function fechasSerie(fecha, cadaSemanas, veces) {
  const n = Math.max(1, Number(cadaSemanas) || 1), k = Math.max(1, Number(veces) || 1);
  return Array.from({ length: k }, (_, i) => sumarDias(fecha, i * n * 7));
}

const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
/** Coincidencias posibles por teléfono (últimos 10 dígitos) o por nombre completo + fecha de nacimiento. */
export function buscarDuplicados(pacientes, { nombres, apellidos, nacimiento, telefono }) {
  const tel = soloDigitos(telefono).slice(-10);
  const nom = normaliza(`${nombres} ${apellidos}`).replace(/\s+/g, " ").trim();
  const out = [];
  for (const p of pacientes) {
    const porTel = tel.length >= 8 && soloDigitos(p.telefono).slice(-10) === tel;
    const porNom = !!nom && !!nacimiento && p.nacimiento === nacimiento && normaliza(`${p.nombres} ${p.apellidos}`).replace(/\s+/g, " ").trim() === nom;
    if (porTel || porNom) out.push({ paciente: p, motivos: [porTel && "teléfono", porNom && "nombre y nacimiento"].filter(Boolean) });
  }
  return out;
}

/** Siguiente folio de expediente: EXP-000161 en adelante (nunca menor). */
export function siguienteFolioExp(pacientes) {
  let max = 160;
  for (const p of pacientes) { const n = Number(String(p.folio).replace(/\D/g, "")); if (n > max) max = n; }
  return `EXP-${String(max + 1).padStart(6, "0")}`;
}
export const esMenor = (nacimiento) => !!nacimiento && edad(nacimiento) < 18;

export function validarPaso(paso, f) {
  const e = {};
  if (paso === 0) {
    if (!f.nombres.trim()) e.nombres = "Requerido";
    if (!f.apellidos.trim()) e.apellidos = "Requerido";
    if (!f.nacimiento) e.nacimiento = "Requerido";
    else if (f.nacimiento > new Date().toISOString().slice(0, 10)) e.nacimiento = "Fecha futura";
    if (!f.sexo) e.sexo = "Requerido";
  }
  if (paso === 1) {
    if (soloDigitos(f.telefono).length < 10) e.telefono = "10 dígitos";
    if (f.correo && !/^\S+@\S+\.\S+$/.test(f.correo)) e.correo = "Correo no válido";
  }
  if (paso === 2 && esMenor(f.nacimiento)) {
    if (!f.tutorNombre.trim()) e.tutorNombre = "Obligatorio para menores";
    if (!f.tutorParentesco.trim()) e.tutorParentesco = "Obligatorio para menores";
  }
  if (paso === 3) {
    if (!f.acepta) e.acepta = "Debe aceptar el aviso";
    if (!f.firma) e.firma = "Falta la firma";
  }
  return e;
}

export const minutosEspera = (llegada, ahora) => (llegada ? Math.max(0, absMin(ahora) - absMin(llegada)) : 0);
export const waLink = (tel) => { let t = soloDigitos(tel); if (t.length === 10) t = "52" + t; return `https://wa.me/${t}`; };
export const telLink = (tel) => `tel:+52${soloDigitos(tel).slice(-10)}`;

// ───── Asistente
export const SERVICIOS_QUIRURGICOS = ["Onicocriptosis", "Matricectomía química", "Uña encarnada (espiculotomía)", "Extracción de uña (con curaciones +3, +7 y +14)"];
export const requiereSet = (servicio) => !!servicio && SERVICIOS_QUIRURGICOS.some((n) => servicio.nombre.startsWith(n.split(" ")[0]));
export function loteAuto(fecha, n) { return `L-${fecha.slice(5)}-${String.fromCharCode(65 + (n % 26))}`; }
export const horaDeHhmm = hora;
export const ROLES_ASISTENTE = ["asistente", "gerente"];
/** Siguiente folio de ciclo continuando los existentes (CIC-20040 → CIC-20041). */
export function siguienteFolioCiclo(ciclos) {
  let max = 0;
  for (const c of ciclos) { const n = Number(String(c.folio).replace(/\D/g, "")); if (n > max) max = n; }
  return `CIC-${max ? max + 1 : 1}`;
}
export const resultadoCiclo = (quimico, biologico) => (quimico === "conforme" && biologico !== "no_conforme" ? "conforme" : "no_conforme");
