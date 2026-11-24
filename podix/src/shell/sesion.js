// Hooks que usan todas las pantallas.
//   const { d, u, sucursalId, sucursal, params } = useSesion();   d = estado (solo lectura; para escribir usa mutar())
//   const ir = useIr();   ir("consulta", { cita: "CI12" })   → navega a otro tab del rol con parámetros
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store/core.js";
import { usuarioActual } from "../store/selectors.js";

export function useSesion() {
  const d = useStore();
  const u = usuarioActual(d);
  const sucursalId = d.sesion.sucursalId;
  const sucursal = d.sucursales.find((s) => s.id === sucursalId) || null;
  return { d, u, sucursalId, sucursal, params: sucursal ? d.params[sucursalId] : null };
}
export function useIr() {
  const nav = useNavigate();
  return (tab, params) => {
    const q = params ? "?" + new URLSearchParams(params).toString() : "";
    nav(`/${tab}${q}`);
  };
}
export const useParam = (k) => useSearchParams()[0].get(k);

// Origen de los datos (modo demo | qa): const { modo, origen } = useDatos();  origen("rh.empleados") → "qa" | "demo"
import { origenDe, MODO } from "../datos/index.js";
export function useDatos() {
  const d = useStore();
  return { modo: MODO, conectado: d.datos?.modo === "qa", origen: (clave) => origenDe(clave, d) };
}
