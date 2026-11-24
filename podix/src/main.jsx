import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./estilos_desk.css";
import App from "./App.jsx";
import { instalarRegistroErrores } from "./componentes/saas/comun.jsx";

instalarRegistroErrores(); // registro de errores para «Salud y errores» desde el arranque

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);

// Service worker: solo el armazón. Nunca cachea respuestas de datos ni llamadas con credenciales.
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !location.hostname.match(/^(localhost|127\.)/)) {
  addEventListener("load", () => navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {}));
}
