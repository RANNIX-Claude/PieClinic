// Piezas compartidas del dominio «saas»: siembra de datos faltantes, registro de errores del navegador (window.onerror y promesas
// rechazadas, acotado a 50 en una clave aparte de localStorage para no inflar el estado) y confirmación fuerte (escribir una palabra).
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getState, mutar } from "../../store/core.js";
import { asegurarSaas, faltaSaas, agregarError } from "../../store/acciones_saas.js";
import { Button, Field, Input, Sheet } from "../../ui/index.jsx";
import "../../estilos_saas.css";

/** Si los datos guardados son anteriores a este dominio, siembra lo que falta (una vez). */
export function useSaas(d) {
  const falta = faltaSaas(d);
  useEffect(() => { if (falta) mutar((x) => asegurarSaas(x)); }, [falta]);
  return !falta;
}

// ───────── Registro de errores
const KEY = "podologia.errores.v1";
const subs = new Set();
let version = 0;
export function leerErrores() { try { const l = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } }
function guardarErrores(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* sin almacenamiento */ } version += 1; subs.forEach((f) => f()); }
let registrando = false;
export function registrarError(e) {
  if (registrando) return; // nunca recursivo
  registrando = true;
  try {
    const s = getState(), u = s && s.usuarios && s.usuarios.find((x) => x.id === (s.sesion && s.sesion.userId));
    guardarErrores(agregarError(leerErrores(), { ...e, ruta: e.ruta || (typeof location !== "undefined" ? location.hash || location.pathname : ""), usuarioId: u ? u.id : null, rol: u ? u.rol : null }));
  } catch { /* el registro de errores no debe fallar */ } finally { registrando = false; }
}
export function marcarResuelto(id) { const s = getState(); guardarErrores(leerErrores().map((x) => (x.id === id ? { ...x, resuelto: true, resueltoEn: new Date().toISOString().slice(0, 16), resueltoPor: s.sesion.userId } : x))); }
export function quitarResueltos() { guardarErrores(leerErrores().filter((x) => !x.resuelto)); }
export function useErrores() { const v = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => version); return useMemo(() => leerErrores(), [v]); }
/** Instala los escuchas una sola vez. Se llama al cargar este módulo; lo ideal es importarlo desde el armazón (ver reporte). */
export function instalarRegistroErrores() {
  if (typeof window === "undefined" || window.__saasErrores) return;
  window.__saasErrores = true;
  window.addEventListener("error", (ev) => registrarError({ origen: "window.onerror", mensaje: ev.message || "Error de script", detalle: `${ev.filename || ""}:${ev.lineno || ""}:${ev.colno || ""}\n${(ev.error && ev.error.stack) || ""}` }));
  window.addEventListener("unhandledrejection", (ev) => { const r = ev.reason; registrarError({ origen: "promesa", mensaje: String((r && r.message) || r || "Promesa rechazada"), detalle: (r && r.stack) || "" }); });
}
instalarRegistroErrores();

/** Confirmación fuerte: hay que escribir la palabra para habilitar el botón. */
export function ConfirmarFuerte({ abierto, titulo, texto, palabra, confirmar = "Confirmar", onSi, onNo }) {
  const [v, setV] = useState("");
  useEffect(() => { if (!abierto) setV(""); }, [abierto]);
  const listo = v.trim().toUpperCase() === palabra;
  return (
    <Sheet abierto={abierto} onClose={onNo} titulo={titulo} pie={<div className="dos"><Button variante="sec" block onClick={onNo}>Cancelar</Button><Button variante="danger" block disabled={!listo} onClick={() => onSi(v)}>{confirmar}</Button></div>}>
      <p className="txt">{texto}</p>
      <Field label={`Escribe ${palabra} para confirmar`}><Input value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" /></Field>
    </Sheet>
  );
}
/** Casilla con etiqueta. */
export const Casilla = ({ checked, onChange, children, disabled }) => (
  <label className="sa-check"><input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>
);
export const Simulado = ({ children }) => <div className="sa-sim"><b>Simulación de demostración.</b> {children}</div>;
