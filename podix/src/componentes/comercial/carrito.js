// Carrito de la tienda en línea: persistente en localStorage (clave propia), sin sesión de personal.
import { useSyncExternalStore } from "react";

const KEY = "pieclinic.tienda.carrito.v1";
const subs = new Set();
let estado = leer();

function leer() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    if (o && Array.isArray(o.items)) return { sucursalId: o.sucursalId || null, items: o.items.filter((x) => x && x.productoId && x.cant >= 1) };
  } catch { /* sin almacenamiento o dato dañado */ }
  return { sucursalId: null, items: [] };
}
function poner(nuevo) {
  estado = nuevo;
  try { localStorage.setItem(KEY, JSON.stringify(estado)); } catch { /* sin almacenamiento */ }
  subs.forEach((f) => f());
}

export const carritoEstado = () => estado;
export function useCarrito() {
  const e = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => estado);
  return {
    ...e,
    cuenta: e.items.reduce((a, x) => a + x.cant, 0),
    elegirSucursal: (sucursalId) => poner({ ...estado, sucursalId }),
    agregar: (productoId, cant = 1, max = 20) => {
      const ya = estado.items.find((x) => x.productoId === productoId);
      const n = Math.min(max, 20, (ya ? ya.cant : 0) + cant);
      poner({ ...estado, items: ya ? estado.items.map((x) => (x.productoId === productoId ? { ...x, cant: n } : x)) : [...estado.items, { productoId, cant: n }] });
    },
    cambiar: (productoId, cant) => poner({ ...estado, items: cant < 1 ? estado.items.filter((x) => x.productoId !== productoId) : estado.items.map((x) => (x.productoId === productoId ? { ...x, cant: Math.min(20, cant) } : x)) }),
    quitar: (productoId) => poner({ ...estado, items: estado.items.filter((x) => x.productoId !== productoId) }),
    vaciar: () => poner({ ...estado, items: [] }),
  };
}
