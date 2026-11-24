// Almacén de datos de la demo: estado único, persistido en localStorage, leído con useStore().
// Todo cambio pasa por mutar(fn): clona el estado, deja que fn lo edite y notifica.
// Cuando exista Supabase, esta capa se sustituye por llamadas al servidor sin tocar las pantallas.
import { useSyncExternalStore, useEffect, useState } from "react";
import { crearSeed } from "./seed.js";
import { ahoraLocal } from "../lib/format.js";
import { cargarArticulosSicar, compactarProductos, expandirProductos } from "./articulos_sicar.js";

const KEY = "podologia.demo.v3";
const subs = new Set();
// Modo de datos (VITE_MODO): "demo" (por defecto, todo en este navegador) | "qa" (base QA vía src/datos/).
// En modo qa el estado NO se guarda en localStorage: la base es la fuente y la sesión la restaura Supabase Auth.
export const MODO_DATOS = (import.meta.env && import.meta.env.VITE_MODO) === "qa" ? "qa" : "demo";
const PERSISTE = MODO_DATOS === "demo";

function cargar() {
  if (!PERSISTE) return crearSeed();
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const o = JSON.parse(s); if (o && o.version === 1) { o.productos = expandirProductos(o.productos || []); return cargarArticulosSicar(o); } }
  } catch { /* localStorage no disponible */ }
  return crearSeed();
}
let state = cargar();

function guardar() { if (!PERSISTE) return; try { localStorage.setItem(KEY, JSON.stringify({ ...state, productos: compactarProductos(state.productos) })); } catch { /* sin almacenamiento */ } }
function avisar() { subs.forEach((f) => f()); }

export const getState = () => state;

// Observadores de cambios (antes, después): los usa src/datos/escribir.js para la escritura write-through en modo qa.
// En demostración no hay ninguno registrado y mutar() se comporta igual que siempre.
const observadores = new Set();
export function observarMutaciones(fn) { observadores.add(fn); return () => observadores.delete(fn); }

/** Edita una copia del estado. fn(draft) puede devolver un valor, que mutar() regresa. */
export function mutar(fn) {
  const antes = state;
  const draft = structuredClone(state);
  const r = fn(draft);
  state = draft; guardar();
  observadores.forEach((f) => { try { f(antes, draft); } catch (e) { console.error("observador de mutar()", e); } });
  avisar();
  return r;
}
export function useStore() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state);
}
export function reiniciarDemo() { state = crearSeed(); guardar(); avisar(); }

/** Siguiente folio de una serie ("T", "AP", "OC"…): T-0042. */
export function folio(d, serie, ancho = 4) {
  d.contadores[serie] = (d.contadores[serie] || 0) + 1;
  return `${serie}-${String(d.contadores[serie]).padStart(ancho, "0")}`;
}
let n = 0;
export const uid = (p = "x") => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

/** Bitácora de auditoría: toda acción sensible la llama. */
export function auditar(d, accion, entidad, ref, detalle = "") {
  d.bitacora.unshift({ id: uid("BI"), fecha: ahoraLocal(), usuarioId: d.sesion.userId, sucursalId: d.sesion.sucursalId, accion, entidad, ref, detalle });
  if (d.bitacora.length > 500) d.bitacora.length = 500;
}

/** ¿Hay señal? (la demo permite simular que no). */
export function hayConexion(d) { return !d.sinSenal && (typeof navigator === "undefined" || navigator.onLine !== false); }

/**
 * Operaciones que deben funcionar sin señal (cobros de caja, conteo de almacén): se aplican en local siempre;
 * si no hay conexión quedan en la cola como "pendiente de sincronizar" hasta que vuelva.
 */
export function registrarOp(d, tipo, resumen) {
  if (hayConexion(d)) return;
  d.cola.push({ id: uid("Q"), tipo, resumen, ts: ahoraLocal(), usuarioId: d.sesion.userId, estado: "pendiente" });
}
export function sincronizar() {
  mutar((d) => { if (!hayConexion(d)) return; d.cola.forEach((q) => { if (q.estado === "pendiente") q.estado = "sincronizado"; }); });
}
export function alternarSinSenal() {
  mutar((d) => { d.sinSenal = !d.sinSenal; });
  if (!state.sinSenal) sincronizar();
}
export function useOnline() {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    addEventListener("online", a); addEventListener("offline", b);
    return () => { removeEventListener("online", a); removeEventListener("offline", b); };
  }, []);
  const s = useStore();
  useEffect(() => { if (on && !s.sinSenal && s.cola.some((q) => q.estado === "pendiente")) sincronizar(); }, [on, s.sinSenal, s.cola]);
  return on && !s.sinSenal;
}

/** Sesión de demostración. En producción: Google / Apple / enlace mágico contra Supabase Auth. */
export function entrar(userId, sucursalId) {
  mutar((d) => {
    const u = d.usuarios.find((x) => x.id === userId);
    if (!u || u.activo === false) return; // un usuario desactivado no entra
    // El almacén central opera desde "CEN": ahí viven las órdenes de compra por recibir.
    d.sesion = { userId, sucursalId: sucursalId || (u.almacenCentral ? "CEN" : u.sucursales[0]) };
    auditar(d, "inicio_sesion", "usuario", userId);
  });
}
export function salir() { mutar((d) => { d.sesion = { userId: null, sucursalId: null }; }); }
export function cambiarSucursal(sucursalId) { mutar((d) => { d.sesion.sucursalId = sucursalId; }); }
