import { useEffect, useState } from "react";
import { HashRouter } from "react-router-dom";
import { useStore, getState } from "./store/core.js";
import Login from "./shell/Login.jsx";
import Shell from "./shell/Shell.jsx";
import Presentacion from "./shell/Presentacion.jsx";
import { Pantalla } from "./shell/registro.jsx";

// Enrutador con hash: cada puerta por rol es un HTML propio (/app/recepcion.html…) y comparte el bundle,
// sin reglas de reescritura del servidor que se coman las rutas específicas.
// Rutas PÚBLICAS (sin cuenta de personal): #/tienda → tienda en línea del paciente (src/pantallas/publico/tienda.jsx).
// Demo Pie Clinic: #/presentacion → menú de presentación con botones grandes (también es la pantalla inicial sin sesión).
const esPublica = () => typeof location !== "undefined" && /^#\/tienda/.test(location.hash);
const esPresentacion = (sesion) => typeof location !== "undefined" && (/^#\/presentacion/.test(location.hash) || (!sesion && /^(#\/?)?$/.test(location.hash) && !window.__ROL__));

export default function App() {
  const d = useStore();
  const [publica, setPublica] = useState(esPublica);
  const [pres, setPres] = useState(() => esPresentacion(d.sesion.userId));
  useEffect(() => {
    const h = () => { setPublica(esPublica()); setPres(esPresentacion(getState().sesion.userId)); };
    addEventListener("hashchange", h);
    // popstate en captura: el enrutador reacciona a popstate y redirige las rutas desconocidas ANTES de que llegue hashchange.
    addEventListener("popstate", h, true);
    return () => { removeEventListener("hashchange", h); removeEventListener("popstate", h, true); };
  }, []);
  const volver = (
    <button className="pc-noprint" onClick={() => { location.hash = "#/presentacion"; }} aria-label="Volver al menú de presentación"
      style={{ position: "fixed", left: typeof innerWidth !== "undefined" && innerWidth >= 1024 ? 286 : 10, bottom: typeof innerWidth !== "undefined" && innerWidth >= 1024 ? 16 : 70, zIndex: 60, border: 0, borderRadius: 24, padding: "10px 16px", fontSize: 15, fontWeight: 700, background: "#2b2140", color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,.3)", cursor: "pointer" }}>
      ⌂ Menú
    </button>
  );
  if (pres || esPresentacion(d.sesion.userId)) return <Presentacion />;
  if (publica) return <><Pantalla dir="publico" nombre="tienda" />{volver}</>;
  return <HashRouter>{d.sesion.userId ? <Shell /> : <Login />}{d.sesion.userId && volver}</HashRouter>;
}
