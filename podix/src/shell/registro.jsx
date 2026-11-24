// Registro automático de pantallas: src/pantallas/<app>/<tab>.jsx  y  src/pantallas/mas/<key>.jsx
// Cada archivo exporta por defecto un componente. Si falta, se muestra un aviso en vez de romper el shell.
import { lazy, Suspense } from "react";
import { Cargando, Vacio } from "../ui/index.jsx";

const mods = import.meta.glob("../pantallas/*/*.jsx");
const cache = {};

export function Pantalla({ dir, nombre }) {
  const ruta = `../pantallas/${dir}/${nombre}.jsx`;
  if (!mods[ruta]) return <Vacio icon="alert">Pantalla en construcción: <b>{dir}/{nombre}</b></Vacio>;
  const C = (cache[ruta] ||= lazy(mods[ruta]));
  return <Suspense fallback={<Cargando />}><C /></Suspense>;
}
