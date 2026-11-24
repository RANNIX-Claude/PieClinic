// Formato y fechas. Las fechas del sistema son texto local: "YYYY-MM-DD" y "YYYY-MM-DDTHH:mm" (sin zona horaria;
// la zona horaria única es la pregunta abierta PA-T1).
const pad = (n) => String(n).padStart(2, "0");

export const dinero = (n) =>
  (n < 0 ? "-" : "") +
  "$" + Math.abs(Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function ymd(d = new Date()) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
export function ahoraLocal(d = new Date()) {
  return ymd(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
export const hoy = () => ymd(new Date());

/** Suma días a una fecha "YYYY-MM-DD" (o datetime) y devuelve "YYYY-MM-DD". */
export function sumarDias(fecha, n) {
  const d = parse(fecha);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function parse(s) {
  if (s instanceof Date) return new Date(s);
  const [f, h = "00:00"] = String(s).split("T");
  const [y, m, dd] = f.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  return new Date(y, m - 1, dd, hh || 0, mm || 0, 0, 0);
}
export const dia = (s) => String(s).slice(0, 10);
export const hora = (s) => String(s).slice(11, 16);
export function diasEntre(a, b) {
  return Math.round((parse(dia(b)) - parse(dia(a))) / 86400000);
}
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(s) {
  const d = parse(s);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}
export function fechaLarga(s) {
  const d = parse(s);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
export function edad(nac, ref = new Date()) {
  const n = parse(nac);
  let e = ref.getFullYear() - n.getFullYear();
  if (ref.getMonth() < n.getMonth() || (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) e--;
  return e;
}
export const iniciales = (nombre) =>
  String(nombre).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const normaliza = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
